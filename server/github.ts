import { GitHubPublicRepo, DestinationUserSession } from './types.js';
import { redactSecrets } from './security.js';

const GITHUB_API_BASE = 'https://api.github.com';

interface RequestOptions {
  token?: string;
  headers?: Record<string, string>;
}

async function githubFetch(endpoint: string, options: RequestOptions = {}): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'GitMigrate-Public-Migration-Platform/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(options.headers || {}),
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, { headers });

  // Handle rate limiting headers
  if (res.status === 403) {
    const rateRemaining = res.headers.get('x-ratelimit-remaining');
    if (rateRemaining === '0') {
      const resetTime = res.headers.get('x-ratelimit-reset');
      const resetDate = resetTime ? new Date(parseInt(resetTime, 10) * 1000).toLocaleTimeString() : 'soon';
      throw new Error(`GitHub API rate limit exceeded. Resets at ${resetDate}.`);
    }
  }

  return res;
}

/**
 * Discovers public user profile without authentication.
 */
export async function fetchUserPublicProfile(username: string) {
  const res = await githubFetch(`/users/${encodeURIComponent(username)}`);
  if (res.status === 404) {
    throw new Error(`GitHub account '@${username}' not found. Please verify the username.`);
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${redactSecrets(errText)}`);
  }
  return res.json();
}

/**
 * Discovers all public repositories for an unauthenticated user.
 * Implements strict pagination (per_page=100) until all repositories are fetched.
 */
export async function fetchUserPublicRepos(username: string): Promise<GitHubPublicRepo[]> {
  const allRepos: GitHubPublicRepo[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    const res = await githubFetch(`/users/${encodeURIComponent(username)}/repos?per_page=${perPage}&page=${page}&type=public&sort=updated`);
    
    if (res.status === 404) {
      throw new Error(`GitHub account '@${username}' not found.`);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch repositories (page ${page}): ${redactSecrets(errText)}`);
    }

    const repos: any[] = await res.json();

    if (!Array.isArray(repos) || repos.length === 0) {
      hasMore = false;
      break;
    }

    for (const r of repos) {
      // Strictly enforce public repositories only
      if (r.private || r.visibility === 'private') {
        continue;
      }

      allRepos.push({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        owner: {
          login: r.owner.login,
          avatar_url: r.owner.avatar_url,
          html_url: r.owner.html_url,
        },
        description: r.description || null,
        html_url: r.html_url,
        clone_url: r.clone_url,
        ssh_url: r.ssh_url,
        default_branch: r.default_branch || 'main',
        visibility: 'public',
        fork: Boolean(r.fork),
        archived: Boolean(r.archived),
        created_at: r.created_at,
        updated_at: r.updated_at,
        pushed_at: r.pushed_at,
        size: r.size || 0,
        language: r.language || null,
        topics: Array.isArray(r.topics) ? r.topics : [],
        has_issues: Boolean(r.has_issues),
        has_wiki: Boolean(r.has_wiki),
        has_pages: Boolean(r.has_pages),
        has_projects: Boolean(r.has_projects),
        has_discussions: Boolean(r.has_discussions),
        stargazers_count: r.stargazers_count || 0,
        watchers_count: r.watchers_count || 0,
        forks_count: r.forks_count || 0,
        open_issues_count: r.open_issues_count || 0,
      });
    }

    if (repos.length < perPage) {
      hasMore = false;
    } else {
      page += 1;
      // Safety cap to prevent infinite loops in runaway pagination
      if (page > 50) break;
    }
  }

  return allRepos;
}

/**
 * Validates destination account token and retrieves profile and permissions.
 */
export async function validateDestinationToken(token: string): Promise<DestinationUserSession> {
  const res = await githubFetch('/user', { token });
  if (res.status === 401) {
    throw new Error('Invalid or expired GitHub token. Please re-authenticate.');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to verify destination account: ${redactSecrets(text)}`);
  }

  const userData = await res.json();
  const rawScopes = res.headers.get('x-oauth-scopes') || '';
  const scopes = rawScopes.split(',').map((s) => s.trim()).filter(Boolean);

  return {
    login: userData.login,
    id: userData.id,
    avatar_url: userData.avatar_url,
    html_url: userData.html_url,
    name: userData.name || userData.login,
    email: userData.email || null,
    token,
    scopes,
    authenticatedAt: new Date().toISOString(),
  };
}

/**
 * Checks whether a repository already exists under the destination account.
 */
export async function checkRepoExists(token: string, owner: string, repo: string): Promise<boolean> {
  const res = await githubFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { token });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  return false;
}

/**
 * Creates a new repository on the destination GitHub account.
 */
export async function createDestinationRepo(
  token: string,
  options: {
    name: string;
    description?: string;
    private: boolean;
    has_issues?: boolean;
    has_wiki?: boolean;
  }
) {
  const res = await fetch(`${GITHUB_API_BASE}/user/repos`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'GitMigrate-Public-Migration-Platform/1.0',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      name: options.name,
      description: options.description || undefined,
      private: options.private,
      has_issues: options.has_issues ?? true,
      has_wiki: options.has_wiki ?? true,
      auto_init: false, // CRITICAL: must be bare so mirror push can initialize pristine history
    }),
  });

  if (res.status === 422) {
    // Repository already exists
    const body = await res.json();
    throw new Error(body.message || 'Repository already exists on destination account.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create repository on destination: ${redactSecrets(errText)}`);
  }

  return res.json();
}

/**
 * Updates destination repository metadata (topics, description, wiki/issues settings).
 */
export async function syncRepoMetadata(
  token: string,
  owner: string,
  repo: string,
  metadata: {
    description?: string | null;
    topics?: string[];
    has_issues?: boolean;
    has_wiki?: boolean;
    has_projects?: boolean;
  }
) {
  // 1. Update basic fields
  await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    method: 'PATCH',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'GitMigrate-Public-Migration-Platform/1.0',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      description: metadata.description || undefined,
      has_issues: metadata.has_issues,
      has_wiki: metadata.has_wiki,
      has_projects: metadata.has_projects,
    }),
  });

  // 2. Update topics if available
  if (metadata.topics && metadata.topics.length > 0) {
    try {
      await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/topics`, {
        method: 'PUT',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'GitMigrate-Public-Migration-Platform/1.0',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ names: metadata.topics.slice(0, 20) }),
      });
    } catch {
      // Non-fatal if topics update fails
    }
  }
}

/**
 * Migrates public issues from source to destination.
 * Attaches metadata preserving original author and timestamp.
 */
export async function migratePublicIssues(
  token: string,
  sourceOwner: string,
  sourceRepo: string,
  destOwner: string,
  destRepo: string,
  onLog: (msg: string) => void
) {
  try {
    const res = await githubFetch(`/repos/${encodeURIComponent(sourceOwner)}/${encodeURIComponent(sourceRepo)}/issues?state=all&per_page=50`);
    if (!res.ok) return;
    const issues: any[] = await res.json();
    if (!Array.isArray(issues)) return;

    // Filter out pull requests (GitHub returns pull requests in the issues API)
    const pureIssues = issues.filter((i) => !i.pull_request);
    onLog(`Found ${pureIssues.length} issues to migrate.`);

    for (const issue of pureIssues) {
      const originalHeader = `> **Migrated Issue** (Original #${issue.number} by @${issue.user?.login || 'unknown'} on ${new Date(issue.created_at).toLocaleDateString()})\n\n`;
      const issueBody = `${originalHeader}${issue.body || ''}`;

      const createRes = await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(destOwner)}/${encodeURIComponent(destRepo)}/issues`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'GitMigrate-Public-Migration-Platform/1.0',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          title: issue.title,
          body: issueBody,
          labels: Array.isArray(issue.labels) ? issue.labels.map((l: any) => (typeof l === 'string' ? l : l.name)) : [],
        }),
      });

      if (createRes.ok && issue.state === 'closed') {
        const createdIssue: any = await createRes.json();
        // Close it on destination if it was closed on source
        await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(destOwner)}/${encodeURIComponent(destRepo)}/issues/${createdIssue.number}`, {
          method: 'PATCH',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'GitMigrate-Public-Migration-Platform/1.0',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ state: 'closed' }),
        });
      }
    }
  } catch (err: any) {
    onLog(`Note: Issues migration encountered a non-fatal warning: ${err.message}`);
  }
}

/**
 * Migrates public releases from source to destination.
 */
export async function migratePublicReleases(
  token: string,
  sourceOwner: string,
  sourceRepo: string,
  destOwner: string,
  destRepo: string,
  onLog: (msg: string) => void
) {
  try {
    const res = await githubFetch(`/repos/${encodeURIComponent(sourceOwner)}/${encodeURIComponent(sourceRepo)}/releases?per_page=30`);
    if (!res.ok) return;
    const releases: any[] = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) return;

    onLog(`Found ${releases.length} releases to sync.`);

    for (const rel of releases) {
      await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(destOwner)}/${encodeURIComponent(destRepo)}/releases`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'GitMigrate-Public-Migration-Platform/1.0',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          tag_name: rel.tag_name,
          name: rel.name || rel.tag_name,
          body: rel.body || '',
          draft: false,
          prerelease: Boolean(rel.prerelease),
        }),
      });
    }
  } catch (err: any) {
    onLog(`Note: Releases migration encountered a non-fatal warning: ${err.message}`);
  }
}

/**
 * Lists all repositories belonging to the destination authenticated account by paginating through all pages.
 */
export async function fetchDestinationRepos(token: string) {
  const allRepos: any[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 50; // fetch up to 5,000 repositories

  while (page <= maxPages) {
    const res = await fetch(`${GITHUB_API_BASE}/user/repos?per_page=${perPage}&page=${page}&type=owner&sort=updated`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'GitMigrate-Public-Migration-Platform/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to retrieve destination repositories: ${redactSecrets(errText)}`);
    }

    const list: any[] = await res.json();
    if (!Array.isArray(list) || list.length === 0) {
      break;
    }

    allRepos.push(...list);

    if (list.length < perPage) {
      break;
    }

    page++;
  }

  return allRepos.map((r) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    private: Boolean(r.private),
    visibility: r.visibility || (r.private ? 'private' : 'public'),
    html_url: r.html_url,
    description: r.description || null,
    pushed_at: r.pushed_at,
    updated_at: r.updated_at,
    size: r.size || 0,
    fork: Boolean(r.fork),
  }));
}

/**
 * Permanently deletes a repository on the destination GitHub account.
 * Requires `delete_repo` scope on Classic PAT or Administration: Write on Fine-grained PAT.
 */
export async function deleteDestinationRepo(token: string, owner: string, repo: string): Promise<boolean> {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'GitMigrate-Public-Migration-Platform/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.status === 204) {
    return true;
  }

  if (res.status === 404) {
    throw new Error(`Repository '${owner}/${repo}' does not exist on GitHub or your token lacks permission to view it.`);
  }

  if (res.status === 403) {
    const body: any = await res.json().catch(() => ({}));
    const detail = body.message || '';
    throw new Error(
      `Permission denied deleting '${owner}/${repo}'. Your GitHub Personal Access Token requires the 'delete_repo' scope (Classic PAT) or 'Administration: Read & write' permission (Fine-grained PAT). ${detail}`
    );
  }

  const errText = await res.text().catch(() => '');
  throw new Error(`Failed to delete repository '${owner}/${repo}' (${res.status}): ${redactSecrets(errText)}`);
}

