import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { migrationQueue } from '../queue.js';
import { MigrationJob, MigrationRepoState, RepoMappingConfig } from '../types.js';

export const migrationsRouter = Router();

function getDestinationToken(req: any): string | null {
  return req.cookies?.gitmigrate_dest_token || req.headers['x-destination-token'] || null;
}

// 1. Create and trigger new migration job
migrationsRouter.post('/api/migrations', async (req, res) => {
  const token = getDestinationToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Destination GitHub account must be connected.' });
  }

  const session = db.getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Destination session expired. Please reconnect.' });
  }

  const { sourceUsername, sourceAvatarUrl, mappings } = req.body as {
    sourceUsername: string;
    sourceAvatarUrl?: string;
    mappings: RepoMappingConfig[];
  };

  if (!sourceUsername || !mappings || !Array.isArray(mappings) || mappings.length === 0) {
    return res.status(400).json({ error: 'Invalid migration payload: at least 1 repository must be selected.' });
  }

  const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;

  const repositories: MigrationRepoState[] = mappings.map((m) => ({
    id: `repo_${m.sourceId}_${randomUUID().slice(0, 6)}`,
    sourceId: m.sourceId,
    sourceOwner: sourceUsername,
    sourceName: m.sourceName,
    destinationOwner: session.login,
    destinationName: m.destinationName || m.sourceName,
    sourceUrl: `https://github.com/${sourceUsername}/${m.sourceName}`,
    destinationUrl: `https://github.com/${session.login}/${m.destinationName || m.sourceName}`,
    visibility: m.visibility || 'public',
    status: 'QUEUED',
    currentPhase: 'Queued for migration',
    progressPercent: 0,
    sourceBranches: 0,
    migratedBranches: 0,
    sourceTags: 0,
    migratedTags: 0,
    commitsVerified: false,
    hasLFS: false,
    options: {
      migrateIssues: Boolean(m.migrateIssues),
      migrateReleases: Boolean(m.migrateReleases),
      migrateWiki: Boolean(m.migrateWiki),
    },
  }));

  const job: MigrationJob = {
    id: jobId,
    sourceUsername,
    sourceAvatarUrl,
    destinationUsername: session.login,
    destinationAvatarUrl: session.avatar_url,
    status: 'QUEUED',
    totalRepositories: repositories.length,
    completedRepositories: 0,
    failedRepositories: 0,
    partialRepositories: 0,
    skippedRepositories: 0,
    repositories,
    currentRepoIndex: 0,
    overallProgressPercent: 0,
    createdAt: new Date().toISOString(),
  };

  db.saveJob(job);

  // Start background worker
  migrationQueue.startJob(jobId, token);

  res.json({ success: true, job });
});

// 2. List all jobs
migrationsRouter.get('/api/migrations', (_req, res) => {
  const jobs = db.listJobs();
  res.json({ jobs });
});

// 3. Get single job status & logs
migrationsRouter.get('/api/migrations/:id', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Migration job not found.' });
  }
  const logs = db.getLogsForJob(job.id, 200);
  const isRunning = migrationQueue.isJobRunning(job.id);
  res.json({ job, logs, isRunning });
});

// 4. Get logs only
migrationsRouter.get('/api/migrations/:id/logs', (req, res) => {
  const limit = parseInt((req.query.limit as string) || '300', 10);
  const logs = db.getLogsForJob(req.params.id, limit);
  res.json({ logs });
});

// 5. Pause job
migrationsRouter.post('/api/migrations/:id/pause', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  migrationQueue.pauseJob(job.id);
  res.json({ success: true, status: 'PAUSED' });
});

// 6. Resume job
migrationsRouter.post('/api/migrations/:id/resume', (req, res) => {
  const token = getDestinationToken(req);
  if (!token) return res.status(401).json({ error: 'Destination authentication required.' });
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  migrationQueue.resumeJob(job.id, token);
  res.json({ success: true, status: 'RUNNING' });
});

// 7. Retry repository / failed
migrationsRouter.post('/api/migrations/:id/retry', async (req, res) => {
  const token = getDestinationToken(req);
  if (!token) return res.status(401).json({ error: 'Destination authentication required.' });

  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  const { repoId } = req.body;
  if (repoId) {
    await migrationQueue.retryRepo(job.id, repoId, token);
  } else {
    // Retry all failed / whole job
    await migrationQueue.retryJob(job.id, token);
  }

  const updated = db.getJob(job.id);
  res.json({ success: true, job: updated });
});

// 8. Cancel job
migrationsRouter.post('/api/migrations/:id/cancel', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  migrationQueue.cancelJob(job.id);
  res.json({ success: true, status: 'CANCELLED' });
});

// 9. Report
migrationsRouter.get('/api/migrations/:id/report', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  const report = db.getReport(job.id);
  res.json({
    report: report || {
      markdown: `# Migration Report for ${job.id}\n\nStatus: ${job.status}`,
      json: job,
    },
  });
});
