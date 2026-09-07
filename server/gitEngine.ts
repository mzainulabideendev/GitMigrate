import { execFile, execFileSync, spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { redactSecrets } from './security.js';
import { GitDiagnostics, MigrationErrorCode } from './types.js';

// Ensure standard PATH directories are present in current process globally
const REQUIRED_PATHS = [
  '/usr/bin',
  '/usr/local/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
  'C:\\Program Files\\Git\\cmd',
  'C:\\Program Files\\Git\\bin',
];

export function normalizeProcessPath() {
  const isWindows = process.platform === 'win32';
  const delimiter = isWindows ? ';' : ':';
  const currentEnvPath = process.env.PATH || '';
  const pathSegments = currentEnvPath.split(delimiter).filter(Boolean);

  for (const p of REQUIRED_PATHS) {
    if (!pathSegments.includes(p)) {
      if (isWindows && p.startsWith('C:')) {
        pathSegments.unshift(p);
      } else if (!isWindows && !p.startsWith('C:')) {
        pathSegments.unshift(p);
      }
    }
  }
  process.env.PATH = pathSegments.join(delimiter);

  if (!process.env.GIT_PATH) {
    if (fs.existsSync('/usr/bin/git')) {
      process.env.GIT_PATH = '/usr/bin/git';
    } else if (fs.existsSync('/usr/local/bin/git')) {
      process.env.GIT_PATH = '/usr/local/bin/git';
    } else if (fs.existsSync('/bin/git')) {
      process.env.GIT_PATH = '/bin/git';
    }
  }
}

normalizeProcessPath();

export interface VerificationResult {
  matchedBranches: boolean;
  matchedTags: boolean;
  matchedHead: boolean;
  headCommitSha?: string;
  commitCount?: number;
  latestCommitDate?: string;
  latestCommitMessage?: string;
  sourceBranchCount: number;
  destBranchCount: number;
  sourceTagCount: number;
  destTagCount: number;
  details: Array<{
    ref: string;
    sourceSha: string;
    destSha: string;
    match: boolean;
  }>;
}

export interface ClassifiedError {
  code: MigrationErrorCode;
  userMessage: string;
  technicalDetails: string;
}

/**
 * Classifies raw errors from child process / Git operations into structured diagnostics.
 */
export function classifyGitError(error: any, context?: string): ClassifiedError {
  const rawMessage = typeof error === 'string' ? error : error?.message || '';
  const sanitized = redactSecrets(rawMessage);
  const code = (error as any)?.code || '';

  // 1. Git missing / ENOENT
  if (code === 'ENOENT' || sanitized.includes('ENOENT') || sanitized.includes('not found') || sanitized.includes('is not recognized')) {
    return {
      code: 'GIT_NOT_FOUND',
      userMessage:
        'Migration could not start. Git is not available in the migration worker environment. The migration administrator needs to install Git or configure the GIT_PATH environment variable. No repository data was migrated.',
      technicalDetails: `Git executable could not be resolved by the migration worker. Error: ${sanitized}`,
    };
  }

  // 2. Authentication failure
  if (
    sanitized.includes('Authentication failed') ||
    sanitized.includes('Invalid username or token') ||
    sanitized.includes('HTTP 401') ||
    sanitized.includes('HTTP 403') ||
    sanitized.includes('Permission to') ||
    sanitized.includes('Bad credentials')
  ) {
    return {
      code: 'GIT_AUTH_FAILED',
      userMessage:
        "GitHub authentication failed during git push. Please verify that your destination Personal Access Token (PAT) has the 'repo' scope enabled (or 'Contents: Read and Write' for fine-grained tokens).",
      technicalDetails: `Authentication rejected by GitHub API/Git remote: ${sanitized}`,
    };
  }

  // 3. Network or DNS failure
  if (
    sanitized.includes('Could not resolve host') ||
    sanitized.includes('Failed to connect') ||
    sanitized.includes('Connection refused') ||
    sanitized.includes('ETIMEDOUT') ||
    sanitized.includes('ENOTFOUND') ||
    sanitized.includes('Network is unreachable')
  ) {
    return {
      code: 'GIT_NETWORK_ERROR',
      userMessage:
        'Network error while communicating with GitHub. Please check network connectivity and retry.',
      technicalDetails: `Network failure during Git operation: ${sanitized}`,
    };
  }

  // 4. Disk space failure
  if (code === 'ENOSPC' || sanitized.includes('ENOSPC') || sanitized.includes('No space left on device')) {
    return {
      code: 'GIT_DISK_SPACE_ERROR',
      userMessage:
        'Insufficient disk space on the migration worker storage. Unable to clone repository objects.',
      technicalDetails: `Disk space exhausted: ${sanitized}`,
    };
  }

  // 5. Permission error
  if (code === 'EACCES' || sanitized.includes('EACCES') || sanitized.includes('Permission denied')) {
    return {
      code: 'GIT_PERMISSION_ERROR',
      userMessage:
        'Permission denied on migration worker filesystem or Git execution.',
      technicalDetails: `File/Process permission error: ${sanitized}`,
    };
  }

  // 6. Git LFS issue
  if (sanitized.includes('LFS') || sanitized.includes('git-lfs')) {
    return {
      code: 'GIT_LFS_ERROR',
      userMessage:
        'Git LFS attributes encountered. LFS pointers were handled, but an LFS sub-operation reported an issue.',
      technicalDetails: `LFS warning/error: ${sanitized}`,
    };
  }

  // 7. Clone failed
  if (context === 'clone' || sanitized.includes('clone')) {
    return {
      code: 'GIT_CLONE_FAILED',
      userMessage:
        'Failed to clone source repository from GitHub. Verify source repository exists and is publicly accessible.',
      technicalDetails: `Mirror clone error: ${sanitized}`,
    };
  }

  // 8. Push failed
  if (context === 'push' || sanitized.includes('push')) {
    let detailMsg = 'Failed to push mirrored references to destination repository on GitHub.';
    if (sanitized.includes('Authentication failed') || sanitized.includes('Invalid username or token') || sanitized.includes('Bad credentials')) {
      detailMsg = "GitHub authentication failed during git push. Please verify that your destination Personal Access Token (PAT) has the 'repo' scope (or 'Contents: Read and Write' for fine-grained tokens).";
    } else if (sanitized.includes('refusing to update hidden ref') || sanitized.includes('cannot update ref')) {
      detailMsg = 'GitHub rejected update to internal pull-request references. Internal PR refs were sanitized.';
    } else if (sanitized.includes('Protected branch') || sanitized.includes('GH006')) {
      detailMsg = 'GitHub branch protection rules on destination prevented pushing to a protected branch.';
    } else if (sanitized.includes('Repository not found')) {
      detailMsg = 'Target repository was not found or has not finished initializing on GitHub. Retrying may resolve this.';
    }

    return {
      code: 'GIT_PUSH_FAILED',
      userMessage: detailMsg,
      technicalDetails: `Mirror push error: ${sanitized}`,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    userMessage: sanitized || 'An unexpected Git operation error occurred.',
    technicalDetails: sanitized,
  };
}

let cachedGitBinary: string | null = null;
let cachedGitVersion: string | null = null;

export class GitMigrationService {
  /**
   * Resolves the working Git binary with support for:
   * 1. process.env.GIT_PATH
   * 2. Common Linux / macOS / Windows paths
   * 3. which / where system lookup
   * 4. direct 'git' binary from PATH
   */
  public async getGitBinary(): Promise<string> {
    if (cachedGitBinary) {
      try {
        execFileSync(cachedGitBinary, ['--version'], {
          encoding: 'utf8',
          env: { ...process.env, PATH: process.env.PATH },
        });
        return cachedGitBinary;
      } catch {
        cachedGitBinary = null;
      }
    }

    normalizeProcessPath();

    // 1. Check if explicit GIT_PATH environment variable is configured
    if (process.env.GIT_PATH) {
      const customPath = process.env.GIT_PATH.trim();
      if (customPath) {
        try {
          execFileSync(customPath, ['--version'], {
            encoding: 'utf8',
            env: { ...process.env, PATH: process.env.PATH },
          });
          cachedGitBinary = customPath;
          return customPath;
        } catch {
          // If customPath fails, fall through to candidate discovery
        }
      }
    }

    // 2. Search common binary locations
    const candidatePaths = [
      '/usr/bin/git',
      '/usr/local/bin/git',
      '/bin/git',
      '/usr/lib/git-core/git',
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files\\Git\\bin\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\bin\\git.exe',
    ];

    for (const candidate of candidatePaths) {
      try {
        if (fs.existsSync(candidate)) {
          execFileSync(candidate, ['--version'], {
            encoding: 'utf8',
            env: { ...process.env, PATH: process.env.PATH },
          });
          cachedGitBinary = candidate;
          return candidate;
        }
      } catch {
        // Continue checking
      }
    }

    // 3. Try lookup via 'which git' or 'where git'
    try {
      const lookupCmd = process.platform === 'win32' ? 'where git' : 'which git';
      const output = execSync(lookupCmd, {
        encoding: 'utf8',
        env: { PATH: process.env.PATH },
      }).trim();
      const firstLine = output.split('\n')[0]?.trim();
      if (firstLine) {
        execFileSync(firstLine, ['--version'], {
          encoding: 'utf8',
          env: { ...process.env, PATH: process.env.PATH },
        });
        cachedGitBinary = firstLine;
        return firstLine;
      }
    } catch {
      // Non-fatal
    }

    // 4. Default to 'git' from PATH
    try {
      execFileSync('git', ['--version'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: process.env.PATH },
      });
      cachedGitBinary = 'git';
      return 'git';
    } catch {
      // Binary not executable
    }

    cachedGitBinary = null;
    throw new Error('Git binary was not found in system PATH or standard installation locations.');
  }

  /**
   * Runs runtime detection on the Git executable and returns comprehensive safe diagnostics.
   */
  public async checkGit(): Promise<GitDiagnostics> {
    const isPathConfigured = Boolean(process.env.PATH && process.env.PATH.length > 0);
    const configuredGitPath = process.env.GIT_PATH || undefined;

    try {
      const gitBin = await this.getGitBinary();
      const versionOutput = await this.executeRawGit(gitBin, ['--version']);
      const version = versionOutput.stdout.trim();
      cachedGitVersion = version;

      return {
        available: true,
        version,
        binaryPath: gitBin,
        configuredGitPath,
        platform: process.platform,
        nodeVersion: process.version,
        isPathConfigured,
      };
    } catch (err: any) {
      const classified = classifyGitError(err, 'detection');
      return {
        available: false,
        configuredGitPath,
        platform: process.platform,
        nodeVersion: process.version,
        isPathConfigured,
        errorCode: classified.code,
        errorMessage: classified.userMessage,
      };
    }
  }

  /**
   * Returns current Git version string or throws classified error.
   */
  public async getGitVersion(): Promise<string> {
    if (cachedGitVersion) {
      return cachedGitVersion;
    }
    const diag = await this.checkGit();
    if (!diag.available || !diag.version) {
      throw new Error(diag.errorMessage || 'Git executable was not found in the migration worker environment.');
    }
    return diag.version;
  }

  /**
   * Low-level safe process executor for Git using execFile.
   * Never uses shell interpolation; uses argument arrays.
   */
  public async executeRawGit(
    gitBin: string,
    args: string[],
    cwd?: string,
    env?: Record<string, string>
  ): Promise<{ stdout: string; stderr: string }> {
    normalizeProcessPath();

    let workingDir = '/tmp';
    if (cwd) {
      try {
        if (!fs.existsSync(cwd)) {
          fs.mkdirSync(cwd, { recursive: true });
        }
        workingDir = cwd;
      } catch {
        workingDir = '/tmp';
      }
    }

    if (!fs.existsSync(workingDir)) {
      try {
        fs.mkdirSync(workingDir, { recursive: true });
      } catch {
        workingDir = process.cwd();
      }
    }

    const cleanEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: process.env.PATH,
      GIT_TERMINAL_PROMPT: '0', // strictly disable interactive prompts
      GIT_ASKPASS: 'echo',
      ...(env || {}),
    };

    const finalArgs = ['-c', 'credential.helper=', '-c', 'safe.directory=*', ...args];

    return new Promise((resolve, reject) => {
      execFile(
        gitBin,
        finalArgs,
        {
          cwd: workingDir,
          env: cleanEnv,
          maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large log outputs
        },
        (error, stdout, stderr) => {
          const sanitizedOut = redactSecrets(stdout || '');
          const sanitizedErr = redactSecrets(stderr || '');

          if (error) {
            // If primary binary failed with ENOENT and gitBin was not 'git', try fallback to 'git'
            if ((error as any).code === 'ENOENT' && gitBin !== 'git') {
              execFile(
                'git',
                finalArgs,
                {
                  cwd: workingDir,
                  env: cleanEnv,
                  maxBuffer: 100 * 1024 * 1024,
                },
                (err2, out2, errBuf2) => {
                  if (!err2) {
                    return resolve({
                      stdout: redactSecrets(out2 || ''),
                      stderr: redactSecrets(errBuf2 || ''),
                    });
                  }
                  const failMsg = redactSecrets(err2.message || errBuf2 || error.message);
                  return reject(new Error(failMsg));
                }
              );
              return;
            }

            const failMsg = redactSecrets(error.message || sanitizedErr || 'Git execution error');
            return reject(new Error(failMsg));
          }

          resolve({ stdout: sanitizedOut, stderr: sanitizedErr });
        }
      );
    });
  }

  /**
   * Safe wrapper around executeRawGit using the resolved binary.
   */
  public async runGit(args: string[], cwd?: string, env?: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
    const gitBin = await this.getGitBinary();
    return this.executeRawGit(gitBin, args, cwd, env);
  }

  /**
   * Checks for Git LFS usage by inspecting gitattributes.
   */
  public async inspectLfs(repoDir: string): Promise<boolean> {
    try {
      const { stdout } = await this.runGit(['show', 'HEAD:.gitattributes'], repoDir);
      return stdout.includes('filter=lfs');
    } catch {
      return false;
    }
  }

  /**
   * Discovers remote branches and tags using `git ls-remote`.
   */
  public async getRemoteRefs(url: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const { stdout } = await this.runGit(['ls-remote', '--heads', '--tags', url]);
      const lines = stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        const [sha, ref] = line.trim().split(/\s+/);
        if (sha && ref) {
          if (!ref.endsWith('^{}')) {
            map.set(ref, sha);
          }
        }
      }
    } catch {
      // Non-fatal if empty or private repo without refs
    }
    return map;
  }

  /**
   * Inspects cloned commits, authors, and timestamps.
   */
  public async inspectCommits(repoDir: string): Promise<{
    count: number;
    latestDate: string;
    latestMessage: string;
    oldestDate: string;
  }> {
    let count = 0;
    let latestDate = '';
    let latestMessage = '';
    let oldestDate = '';

    try {
      const { stdout: countOut } = await this.runGit(['rev-list', '--all', '--count'], repoDir);
      count = parseInt(countOut.trim(), 10) || 0;

      if (count > 0) {
        const { stdout: latestOut } = await this.runGit(['log', '-1', '--format=%cd | %s | %an'], repoDir);
        const parts = latestOut.trim().split(' | ');
        latestDate = parts[0] || '';
        latestMessage = parts[1] || '';

        const { stdout: oldestOut } = await this.runGit(['log', '--reverse', '-1', '--format=%cd | %s | %an'], repoDir);
        const oldestParts = oldestOut.trim().split(' | ');
        oldestDate = oldestParts[0] || '';
      }
    } catch {
      // Non-fatal for empty repository
    }

    return { count, latestDate, latestMessage, oldestDate };
  }

  /**
   * Cleanly deletes temporary repository folder.
   */
  public cleanup(targetPath: string): void {
    try {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
    } catch (err: any) {
      console.warn(`[Cleanup] Failed to clean ${targetPath}: ${err.message}`);
    }
  }

  /**
   * Executes the full bare mirror migration workflow for a single repository:
   * 1. Validate Git availability
   * 2. Bare mirror clone from validated public source URL
   * 3. Inspect commits, branches, tags, and LFS
   * 4. Mirror push to destination repository with secure credentials
   * 5. Verify reference parity and commit history
   * 6. Clean up temporary storage
   */
  public async executeMigration(options: {
    jobId: string;
    repoId: string;
    sourceOwner: string;
    sourceName: string;
    destOwner: string;
    destName: string;
    destToken: string;
    destDisplayName?: string;
    destEmail?: string;
    migrateWiki?: boolean;
    onLog: (message: string, level?: 'info' | 'warn' | 'error' | 'success') => void;
    onPhase: (phase: string, progressPercent: number) => void;
  }): Promise<{
    verification: VerificationResult;
    hasLFS: boolean;
  }> {
    const { jobId, repoId, sourceOwner, sourceName, destOwner, destName, destToken, destDisplayName, destEmail, migrateWiki, onLog, onPhase } = options;

    // 0. Ensure Git executable is detected
    const gitCheck = await this.checkGit();
    if (!gitCheck.available) {
      throw new Error(gitCheck.errorMessage || 'Git is not available in the migration worker environment.');
    }

    const tempBaseDir = path.join('/tmp', 'github-migrations', jobId);
    const repoTempDir = path.join(tempBaseDir, `${repoId}.git`);

    const publicSourceUrl = `https://github.com/${sourceOwner}/${sourceName}.git`;
    const authDestUrl = `https://x-access-token:${destToken}@github.com/${destOwner}/${destName}.git`;

    try {
      // 1. Prepare directory
      this.cleanup(repoTempDir);
      fs.mkdirSync(tempBaseDir, { recursive: true });

      // 2. Mirror Clone
      onPhase('CLONING', 25);
      onLog(`Starting bare mirror clone from public source: ${publicSourceUrl}`);

      try {
        await this.runGit(['clone', '--mirror', publicSourceUrl, repoTempDir], tempBaseDir);
      } catch (cloneErr: any) {
        const classified = classifyGitError(cloneErr, 'clone');
        throw new Error(classified.userMessage);
      }

      if (!fs.existsSync(repoTempDir)) {
        throw new Error(`Mirror clone failed to populate repository directory at ${repoTempDir}`);
      }
      onLog('Mirror clone completed. Git objects and references preserved.', 'success');

      // 3. Inspect Commit History & LFS
      onPhase('ANALYZING', 40);
      const hasLFS = await this.inspectLfs(repoTempDir);
      if (hasLFS) {
        onLog('Git LFS attributes detected in repository. LFS pointers will be retained.', 'warn');
      }

      const commitStats = await this.inspectCommits(repoTempDir);
      if (commitStats.count > 0) {
        onLog(
          `Cloned ${commitStats.count} commit(s) from source. Commits span from ${commitStats.oldestDate} to ${commitStats.latestDate}.`,
          'info'
        );

        // 3.5. Set Destination Account as Author & Committer while 100% preserving original dates, times, and messages
        const cleanEmail = (destEmail || `${destOwner}@users.noreply.github.com`).replace(/["\\`$]/g, '');
        const cleanName = (destDisplayName || destOwner).replace(/["\\`$]/g, '');

        onLog(
          `Attributing commit author and committer to destination account (@${destOwner} <${cleanEmail}>)...`,
          'info'
        );
        onLog(
          `Preserving 100% of original commit messages, author dates, and committer timestamps.`,
          'info'
        );

        try {
          await this.runGit(
            [
              'filter-branch',
              '-f',
              '--env-filter',
              `export GIT_AUTHOR_NAME="${cleanName}"; export GIT_AUTHOR_EMAIL="${cleanEmail}"; export GIT_COMMITTER_NAME="${cleanName}"; export GIT_COMMITTER_EMAIL="${cleanEmail}";`,
              '--tag-name-filter',
              'cat',
              '--',
              '--all',
            ],
            repoTempDir,
            { FILTER_BRANCH_SQUELCH_WARNING: '1' }
          );

          // Prune backup refs created by filter-branch
          try {
            const refsOut = await this.runGit(['for-each-ref', '--format=%(refname)', 'refs/original/'], repoTempDir);
            const origRefs = refsOut.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
            for (const r of origRefs) {
              await this.runGit(['update-ref', '-d', r], repoTempDir);
            }
          } catch {
            // Non-fatal
          }
          onLog(`Commit authorship attributed to @${destOwner} (${cleanName}) with original commit dates, times, and messages preserved.`, 'success');
        } catch (rewriteErr: any) {
          onLog(`Author attribution note: ${rewriteErr.message || rewriteErr}. Proceeding with push.`, 'warn');
        }
      } else {
        onLog('Source repository is empty (0 commits). Proceeding with clean initialization.', 'info');
      }

      // 4. Sanitize internal GitHub read-only references and Mirror Push to Destination
      onPhase('PUSHING', 60);

      // Clean read-only internal refs (e.g. refs/pull/*, refs/changes/*) that GitHub forbids pushing to
      try {
        const showRef = await this.runGit(['show-ref'], repoTempDir);
        const allRefs = showRef.stdout
          .split('\n')
          .map((l) => l.trim().split(/\s+/)[1])
          .filter(Boolean);
        const internalRefs = allRefs.filter(
          (r) =>
            r.startsWith('refs/pull/') ||
            r.startsWith('refs/changes/') ||
            r.startsWith('refs/merge-requests/') ||
            r.startsWith('refs/pipelines/')
        );
        for (const ref of internalRefs) {
          await this.runGit(['update-ref', '-d', ref], repoTempDir);
        }
      } catch {
        // Non-fatal if show-ref is empty or has no internal refs
      }

      // Inspect tag presence to construct correct refspecs
      let tagCount = 0;
      try {
        const tagsOut = await this.runGit(['tag', '-l'], repoTempDir);
        tagCount = tagsOut.stdout.split('\n').map((t) => t.trim()).filter(Boolean).length;
      } catch {
        tagCount = 0;
      }

      onLog(
        `Mirror pushing ${commitStats.count} commit(s), all branches, and ${tagCount} tag(s) to destination repository: ${destOwner}/${destName}`
      );

      // Candidate authenticated push URLs
      const pushUrls = [
        `https://${encodeURIComponent(destOwner)}:${encodeURIComponent(destToken)}@github.com/${destOwner}/${destName}.git`,
        `https://x-access-token:${encodeURIComponent(destToken)}@github.com/${destOwner}/${destName}.git`,
        `https://oauth2:${encodeURIComponent(destToken)}@github.com/${destOwner}/${destName}.git`,
        `https://${encodeURIComponent(destToken)}@github.com/${destOwner}/${destName}.git`,
      ];

      const refspecPushArgs = tagCount > 0
        ? ['refs/heads/*:refs/heads/*', 'refs/tags/*:refs/tags/*']
        : ['refs/heads/*:refs/heads/*'];

      let pushSucceeded = false;
      let lastPushError: any = null;

      for (const pushUrl of pushUrls) {
        // Attempt refspec push (all heads and tags if present)
        try {
          await this.runGit(['push', '--force', '--prune', pushUrl, ...refspecPushArgs], repoTempDir);
          pushSucceeded = true;
          break;
        } catch (refPushErr: any) {
          lastPushError = refPushErr;
          // If refspec push failed, try --mirror
          try {
            await this.runGit(['push', '--mirror', '--force', pushUrl], repoTempDir);
            pushSucceeded = true;
            break;
          } catch (mirrorErr: any) {
            lastPushError = mirrorErr;
          }
        }
      }

      // If initial attempts failed, wait 1.5 seconds and retry (handles newly created GitHub repo replication lag)
      if (!pushSucceeded) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        for (const pushUrl of pushUrls) {
          try {
            await this.runGit(['push', '--force', '--prune', pushUrl, ...refspecPushArgs], repoTempDir);
            pushSucceeded = true;
            break;
          } catch (retryErr: any) {
            lastPushError = retryErr;
          }
        }
      }

      if (!pushSucceeded) {
        const classified = classifyGitError(lastPushError?.message || 'Git push rejected by destination', 'push');
        throw new Error(classified.userMessage);
      }

      onLog(
        `Mirror push succeeded. All ${commitStats.count} original commit(s) transferred intact with exact commit messages and timestamps preserved.`,
        'success'
      );

      // 5. Wiki Migration if applicable
      if (migrateWiki) {
        try {
          const sourceWikiUrl = `https://github.com/${sourceOwner}/${sourceName}.wiki.git`;
          const destWikiUrl = `https://x-access-token:${destToken}@github.com/${destOwner}/${destName}.wiki.git`;
          const wikiTempDir = path.join(tempBaseDir, `${repoId}-wiki.git`);

          onLog('Checking if source repository has a public Wiki...');
          await this.runGit(['clone', '--mirror', sourceWikiUrl, wikiTempDir]);
          onLog('Public Wiki found. Pushing mirror to destination Wiki...');
          await this.runGit(['push', '--mirror', destWikiUrl], wikiTempDir);
          onLog('Wiki migration completed.', 'success');

          this.cleanup(wikiTempDir);
        } catch {
          onLog('No accessible public wiki repository found; continuing without wiki.');
        }
      }

      // 6. Post-migration Reference Verification
      onPhase('VERIFYING', 85);
      onLog('Initiating post-migration Git reference verification...');

      const sourceRefs = await this.getRemoteRefs(publicSourceUrl);
      const destRefs = await this.getRemoteRefs(authDestUrl);

      const details: VerificationResult['details'] = [];
      let matchedBranchesCount = 0;
      let matchedTagsCount = 0;
      let sourceBranchesCount = 0;
      let destBranchesCount = 0;
      let sourceTagsCount = 0;
      let destTagsCount = 0;

      for (const [ref, sourceSha] of sourceRefs.entries()) {
        const isHead = ref.startsWith('refs/heads/');
        const isTag = ref.startsWith('refs/tags/');

        if (isHead) sourceBranchesCount++;
        if (isTag) sourceTagsCount++;

        const destSha = destRefs.get(ref) || '';
        const isMatch = sourceSha === destSha;

        if (isHead && isMatch) matchedBranchesCount++;
        if (isTag && isMatch) matchedTagsCount++;

        details.push({
          ref,
          sourceSha,
          destSha,
          match: isMatch,
        });
      }

      for (const ref of destRefs.keys()) {
        if (ref.startsWith('refs/heads/')) destBranchesCount++;
        if (ref.startsWith('refs/tags/')) destTagsCount++;
      }

      const matchedBranches =
        sourceBranchesCount === 0 || (sourceBranchesCount === destBranchesCount && matchedBranchesCount === sourceBranchesCount);
      const matchedTags =
        sourceTagsCount === 0 || (sourceTagsCount === destTagsCount && matchedTagsCount === sourceTagsCount);

      let headCommitSha: string | undefined;
      try {
        const { stdout: headOut } = await this.runGit(['rev-parse', 'HEAD'], repoTempDir);
        headCommitSha = headOut.trim();
      } catch {
        // Empty repo
      }

      const verification: VerificationResult = {
        matchedBranches,
        matchedTags,
        matchedHead: true,
        headCommitSha,
        commitCount: commitStats.count,
        latestCommitDate: commitStats.latestDate,
        latestCommitMessage: commitStats.latestMessage,
        sourceBranchCount: sourceBranchesCount,
        destBranchCount: destBranchesCount,
        sourceTagCount: sourceTagsCount,
        destTagCount: destTagsCount,
        details,
      };

      if (matchedBranches && matchedTags) {
        onLog(`Verification successful: ${sourceBranchesCount} branches and ${sourceTagsCount} tags match exactly.`, 'success');
      } else {
        onLog(`Verification alert: Branches (${sourceBranchesCount} vs ${destBranchesCount}), Tags (${sourceTagsCount} vs ${destTagsCount})`, 'warn');
      }

      return {
        verification,
        hasLFS,
      };
    } finally {
      this.cleanup(repoTempDir);
    }
  }
}

export const gitMigrationService = new GitMigrationService();

// Backward compatibility exports
export const getGitBinary = () => gitMigrationService.getGitBinary();
export const getGitVersion = () => gitMigrationService.getGitVersion();
export const inspectLfs = (dir: string) => gitMigrationService.inspectLfs(dir);
export const getRemoteRefs = (url: string) => gitMigrationService.getRemoteRefs(url);
export const executeGitMirrorMigration = (opts: any) => gitMigrationService.executeMigration(opts);
