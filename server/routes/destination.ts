import { Router } from 'express';
import { checkRepoExists, fetchDestinationRepos, deleteDestinationRepo } from '../github.js';
import { gitMigrationService } from '../gitEngine.js';
import { db } from '../db.js';
import { validateRepoName } from '../security.js';

export const destinationRouter = Router();

function getDestinationToken(req: any): string | null {
  return req.cookies?.gitmigrate_dest_token || req.headers['x-destination-token'] || null;
}

destinationRouter.get('/api/destination/environment', async (_req, res) => {
  try {
    const diag = await gitMigrationService.checkGit();
    if (diag.available) {
      res.json({
        gitReady: true,
        gitVersion: diag.version,
        binaryPath: diag.binaryPath,
        configuredGitPath: diag.configuredGitPath,
        platform: diag.platform,
        nodeVersion: diag.nodeVersion,
      });
    } else {
      res.status(503).json({
        gitReady: false,
        errorCode: diag.errorCode,
        error: diag.errorMessage,
        platform: diag.platform,
        nodeVersion: diag.nodeVersion,
      });
    }
  } catch (err: any) {
    res.status(500).json({ gitReady: false, error: err.message });
  }
});

destinationRouter.post('/api/destination/check-repo', async (req, res) => {
  const token = getDestinationToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Destination account is not authenticated.' });
  }

  const { repoName } = req.body;
  if (!validateRepoName(repoName)) {
    return res.status(400).json({ error: 'Invalid repository name. Use alphanumeric characters, hyphens, and underscores.' });
  }

  try {
    const session = db.getSession(token as string);
    if (!session) {
      return res.status(401).json({ error: 'Session expired. Please reconnect your destination GitHub account.' });
    }

    const exists = await checkRepoExists(token as string, session.login, repoName);
    res.json({
      exists,
      available: !exists,
      owner: session.login,
      name: repoName,
      fullName: `${session.login}/${repoName}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * List all repositories under the authenticated destination account.
 */
destinationRouter.get('/api/destination/repos', async (req, res) => {
  const token = getDestinationToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Destination account is not authenticated.' });
  }

  try {
    const session = db.getSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Session expired. Please reconnect your destination GitHub account.' });
    }

    const repos = await fetchDestinationRepos(token);
    res.json({ success: true, owner: session.login, repos });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a repository from the destination GitHub account.
 */
destinationRouter.delete('/api/destination/repos/:repoName', async (req, res) => {
  const token = getDestinationToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Destination account is not authenticated.' });
  }

  const repoName = req.params.repoName;
  if (!validateRepoName(repoName)) {
    return res.status(400).json({ error: 'Invalid repository name format.' });
  }

  try {
    const session = db.getSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Session expired. Please reconnect your destination GitHub account.' });
    }

    await deleteDestinationRepo(token, session.login, repoName);
    res.json({
      success: true,
      message: `Repository '${session.login}/${repoName}' was permanently deleted from GitHub.`,
      repoName,
      owner: session.login,
    });
  } catch (err: any) {
    res.status(err.message.includes('Permission denied') ? 403 : 500).json({ error: err.message });
  }
});

/**
 * Bulk delete multiple repositories from the destination GitHub account.
 */
destinationRouter.post('/api/destination/repos/bulk-delete', async (req, res) => {
  const token = getDestinationToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Destination account is not authenticated.' });
  }

  const { repoNames } = req.body;
  if (!Array.isArray(repoNames) || repoNames.length === 0) {
    return res.status(400).json({ error: 'Provide a non-empty array of repoNames to delete.' });
  }

  try {
    const session = db.getSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Session expired. Please reconnect your destination GitHub account.' });
    }

    const results: { name: string; success: boolean; error?: string }[] = [];
    let deletedCount = 0;
    let failedCount = 0;

    for (const name of repoNames) {
      if (typeof name !== 'string' || !validateRepoName(name.trim())) {
        results.push({ name: String(name), success: false, error: 'Invalid repository name format' });
        failedCount++;
        continue;
      }

      const cleanName = name.trim();
      try {
        await deleteDestinationRepo(token, session.login, cleanName);
        results.push({ name: cleanName, success: true });
        deletedCount++;
      } catch (err: any) {
        results.push({ name: cleanName, success: false, error: err.message });
        failedCount++;
      }
    }

    res.json({
      success: failedCount === 0,
      total: repoNames.length,
      deletedCount,
      failedCount,
      results,
      owner: session.login,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
