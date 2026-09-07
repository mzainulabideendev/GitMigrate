import { Router } from 'express';
import { extractAndValidateGitHubUsername } from '../security.js';
import { fetchUserPublicProfile, fetchUserPublicRepos } from '../github.js';

export const sourceRouter = Router();

sourceRouter.post('/api/source/discover', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Please provide a valid GitHub profile URL or username.' });
  }

  // 1. SSRF & Username Validation
  const validation = extractAndValidateGitHubUsername(url);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error || 'Invalid GitHub URL or username.' });
  }

  const username = validation.username;

  try {
    // 2. Fetch User Profile
    const profile = await fetchUserPublicProfile(username);

    // 3. Fetch All Public Repositories (Pagination handled automatically)
    const repositories = await fetchUserPublicRepos(username);

    res.json({
      user: {
        login: profile.login,
        name: profile.name || profile.login,
        avatar_url: profile.avatar_url,
        html_url: profile.html_url,
        bio: profile.bio || null,
        public_repos_count: profile.public_repos || repositories.length,
        followers: profile.followers || 0,
      },
      repositories,
      count: repositories.length,
      privateRepositoriesNotice: 'Private repositories and forks are not accessible through this public migration mode.',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to scan public repositories.' });
  }
});
