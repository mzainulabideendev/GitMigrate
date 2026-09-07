import { db } from './db.js';
import { gitMigrationService, classifyGitError, normalizeProcessPath } from './gitEngine.js';
import { createDestinationRepo, syncRepoMetadata, migratePublicIssues, migratePublicReleases, checkRepoExists } from './github.js';
import { MigrationJob, MigrationRepoState, MigrationLogEntry, RepoMigrationStatus } from './types.js';

class MigrationWorkerQueue {
  private runningJobs = new Set<string>();
  private pauseRequested = new Set<string>();
  private cancelRequested = new Set<string>();

  public isJobRunning(jobId: string): boolean {
    return this.runningJobs.has(jobId);
  }

  public pauseJob(jobId: string) {
    this.pauseRequested.add(jobId);
    db.updateJob(jobId, { status: 'PAUSED' });
    this.addLog(jobId, 'Migration paused by user.', 'warn', 'PAUSED');
  }

  public resumeJob(jobId: string, token: string) {
    this.pauseRequested.delete(jobId);
    this.startJob(jobId, token);
  }

  public cancelJob(jobId: string) {
    this.cancelRequested.add(jobId);
    this.pauseRequested.delete(jobId);
    db.updateJob(jobId, { status: 'CANCELLED', completedAt: new Date().toISOString() });
    this.addLog(jobId, 'Migration cancelled by user.', 'warn', 'CANCELLED');
  }

  public addLog(
    jobId: string,
    message: string,
    level: 'info' | 'warn' | 'error' | 'success' = 'info',
    phase = 'RUNNING',
    repoId?: string,
    repoName?: string
  ) {
    const entry: MigrationLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      jobId,
      repoId,
      repoName,
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
    };
    db.addLog(entry);
  }

  public async startJob(jobId: string, token: string) {
    if (this.runningJobs.has(jobId)) {
      return;
    }

    const job = db.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found.`);

    normalizeProcessPath();

    this.runningJobs.add(jobId);
    this.pauseRequested.delete(jobId);
    this.cancelRequested.delete(jobId);

    db.updateJob(jobId, {
      status: 'RUNNING',
      error: undefined,
      errorCode: undefined,
      errorDetails: undefined,
      startedAt: job.startedAt || new Date().toISOString(),
    });

    this.addLog(jobId, `Starting migration job for @${job.sourceUsername} -> @${job.destinationUsername}`, 'info', 'START');

    // Run in background
    (async () => {
      try {
        await this.processJob(jobId, token);
      } catch (err: any) {
        console.error(`[Worker] Uncaught job error for ${jobId}:`, err);
        const classified = classifyGitError(err);
        db.updateJob(jobId, {
          status: 'FAILED',
          error: classified.userMessage,
          errorCode: classified.code,
          errorDetails: classified.technicalDetails,
          completedAt: new Date().toISOString(),
        });
        this.addLog(jobId, `Fatal job error: ${classified.userMessage}`, 'error', 'FAILED');
      } finally {
        this.runningJobs.delete(jobId);
        this.generateAndSaveReport(jobId);
      }
    })();
  }

  private async processJob(jobId: string, token: string) {
    let job = db.getJob(jobId);
    if (!job) return;

    normalizeProcessPath();

    // PREFLIGHT: Verify Git environment before any repository is created on GitHub
    this.addLog(jobId, 'Executing preflight checks (Git environment & GitHub destination permissions)...', 'info', 'PREFLIGHT');
    const gitCheck = await gitMigrationService.checkGit();

    if (!gitCheck.available) {
      const userMessage =
        'Migration could not start. Git is not available in the migration worker environment. The migration administrator needs to install Git or configure the GIT_PATH environment variable. No destination repositories were created.';
      
      this.addLog(jobId, userMessage, 'error', 'FAILED');
      this.addLog(
        jobId,
        `Safe Diagnostics - Platform: ${process.platform}, Node: ${process.version}, PATH Configured: ${Boolean(process.env.PATH)}, GIT_PATH: ${process.env.GIT_PATH || 'not set'}`,
        'warn',
        'PREFLIGHT'
      );

      const failedRepos = job.repositories.map((r) => ({
        ...r,
        status: 'FAILED' as RepoMigrationStatus,
        error: userMessage,
        errorCode: 'GIT_NOT_FOUND' as const,
        errorDetails: gitCheck.errorMessage,
        completedAt: new Date().toISOString(),
      }));

      db.updateJob(jobId, {
        status: 'FAILED',
        error: userMessage,
        errorCode: 'GIT_NOT_FOUND',
        errorDetails: gitCheck.errorMessage,
        failedRepositories: job.repositories.length,
        completedRepositories: 0,
        repositories: failedRepos,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    this.addLog(jobId, `Preflight check passed: Git executable detected (${gitCheck.binaryPath})`, 'success', 'PREFLIGHT');
    this.addLog(jobId, `Preflight check passed: ${gitCheck.version}`, 'info', 'PREFLIGHT');

    for (let i = 0; i < job.repositories.length; i++) {
      // Check cancel
      if (this.cancelRequested.has(jobId)) {
        this.addLog(jobId, 'Job cancelled during execution.', 'warn', 'CANCELLED');
        break;
      }

      // Check pause
      if (this.pauseRequested.has(jobId)) {
        this.addLog(jobId, 'Job paused. Remaining repositories queued.', 'info', 'PAUSED');
        db.updateJob(jobId, { status: 'PAUSED' });
        break;
      }

      const repo = job.repositories[i];

      // Skip already completed or skipped repos
      if (repo.status === 'COMPLETED' || repo.status === 'SKIPPED') {
        continue;
      }

      db.updateJob(jobId, { currentRepoIndex: i });
      await this.processSingleRepo(jobId, repo.id, token);

      // Re-fetch updated job state
      job = db.getJob(jobId);
      if (!job) break;

      // Update overall metrics
      const completed = job.repositories.filter((r) => r.status === 'COMPLETED').length;
      const failed = job.repositories.filter((r) => r.status === 'FAILED').length;
      const partial = job.repositories.filter((r) => r.status === 'PARTIAL').length;
      const skipped = job.repositories.filter((r) => r.status === 'SKIPPED').length;
      const progress = Math.round(((completed + failed + partial + skipped) / job.totalRepositories) * 100);

      db.updateJob(jobId, {
        completedRepositories: completed,
        failedRepositories: failed,
        partialRepositories: partial,
        skippedRepositories: skipped,
        overallProgressPercent: progress,
      });
    }

    // Finalize status if not paused or cancelled
    if (!this.pauseRequested.has(jobId) && !this.cancelRequested.has(jobId)) {
      const finalJob = db.getJob(jobId);
      if (finalJob) {
        let finalStatus: MigrationJob['status'] = 'COMPLETED';
        if (finalJob.failedRepositories > 0) {
          finalStatus = finalJob.completedRepositories > 0 ? 'PARTIAL' : 'FAILED';
        } else if (finalJob.partialRepositories > 0) {
          finalStatus = 'PARTIAL';
        }

        db.updateJob(jobId, {
          status: finalStatus,
          completedAt: new Date().toISOString(),
          overallProgressPercent: 100,
        });

        this.addLog(
          jobId,
          `Migration job finished with status: ${finalStatus}. Completed: ${finalJob.completedRepositories}, Failed: ${finalJob.failedRepositories}`,
          finalStatus === 'COMPLETED' ? 'success' : 'warn',
          'COMPLETED'
        );
      }
    }
  }

  public async retryJob(jobId: string, token: string) {
    const job = db.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const resetRepos = job.repositories.map((r) => {
      if (r.status === 'FAILED' || r.status === 'QUEUED') {
        return {
          ...r,
          status: 'QUEUED' as RepoMigrationStatus,
          error: undefined,
          errorCode: undefined,
          errorDetails: undefined,
          progressPercent: 0,
          currentPhase: 'QUEUED',
        };
      }
      return r;
    });

    db.updateJob(jobId, {
      status: 'RUNNING',
      error: undefined,
      errorCode: undefined,
      errorDetails: undefined,
      repositories: resetRepos,
    });

    this.addLog(jobId, 'Retrying migration job...', 'info', 'RETRY');
    return this.startJob(jobId, token);
  }

  public async retryRepo(jobId: string, repoId: string, token: string) {
    const job = db.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const targetRepo = job.repositories.find((r) => r.id === repoId);
    if (!targetRepo) throw new Error('Repository not found');

    this.addLog(jobId, `Retrying repository ${targetRepo.sourceName}...`, 'info', 'RETRY', repoId, targetRepo.sourceName);
    
    // Reset state
    this.updateRepoInJob(jobId, repoId, {
      status: 'QUEUED',
      error: undefined,
      errorCode: undefined,
      errorDetails: undefined,
      progressPercent: 0,
      currentPhase: 'QUEUED',
    });

    // If job was completed or failed, reset to RUNNING
    if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'PARTIAL') {
      db.updateJob(jobId, {
        status: 'RUNNING',
        error: undefined,
        errorCode: undefined,
        errorDetails: undefined,
      });
    }

    await this.processSingleRepo(jobId, repoId, token);

    // Refresh metrics
    const updatedJob = db.getJob(jobId);
    if (updatedJob) {
      const completed = updatedJob.repositories.filter((r) => r.status === 'COMPLETED').length;
      const failed = updatedJob.repositories.filter((r) => r.status === 'FAILED').length;
      const partial = updatedJob.repositories.filter((r) => r.status === 'PARTIAL').length;
      const skipped = updatedJob.repositories.filter((r) => r.status === 'SKIPPED').length;

      let status = updatedJob.status;
      if (failed === 0 && partial === 0) status = 'COMPLETED';
      else if (completed > 0) status = 'PARTIAL';
      else status = 'FAILED';

      db.updateJob(jobId, {
        completedRepositories: completed,
        failedRepositories: failed,
        partialRepositories: partial,
        skippedRepositories: skipped,
        status,
      });

      this.generateAndSaveReport(jobId);
    }
  }

  private updateRepoInJob(jobId: string, repoId: string, update: Partial<MigrationRepoState>) {
    const job = db.getJob(jobId);
    if (!job) return;

    const repos = job.repositories.map((r) => {
      if (r.id === repoId) {
        return { ...r, ...update };
      }
      return r;
    });

    db.updateJob(jobId, { repositories: repos });
  }

  private async processSingleRepo(jobId: string, repoId: string, token: string) {
    const job = db.getJob(jobId);
    if (!job) return;

    const repo = job.repositories.find((r) => r.id === repoId);
    if (!repo) return;

    const repoName = repo.sourceName;
    const destName = repo.destinationName;

    let destinationCreated = false;

    this.updateRepoInJob(jobId, repoId, {
      status: 'ANALYZING',
      currentPhase: 'Analyzing repository',
      progressPercent: 10,
      startedAt: new Date().toISOString(),
    });

    this.addLog(jobId, `[${repoName}] Beginning migration to @${job.destinationUsername}/${destName}`, 'info', 'START', repoId, repoName);

    try {
      // 1. Check or Create Destination Repo
      this.updateRepoInJob(jobId, repoId, {
        currentPhase: 'Checking destination availability',
        progressPercent: 15,
      });

      const exists = await checkRepoExists(token, job.destinationUsername, destName);
      if (!exists) {
        this.addLog(jobId, `[${repoName}] Creating new repository '${destName}' on destination account`, 'info', 'DESTINATION_CREATED', repoId, repoName);
        await createDestinationRepo(token, {
          name: destName,
          private: repo.visibility === 'private',
          has_issues: repo.options.migrateIssues,
          has_wiki: repo.options.migrateWiki,
        });
        destinationCreated = true;
        this.addLog(jobId, `[${repoName}] Destination repository created successfully.`, 'success', 'DESTINATION_CREATED', repoId, repoName);
      } else {
        destinationCreated = true;
        this.addLog(jobId, `[${repoName}] Target destination repository '${destName}' already exists. Utilizing existing repository.`, 'info', 'DESTINATION_CREATED', repoId, repoName);
      }

      this.updateRepoInJob(jobId, repoId, {
        status: 'DESTINATION_CREATED',
        currentPhase: 'Mirroring Git history',
        progressPercent: 20,
      });

      // Get session profile info for commit author attribution
      const session = db.getSession(token);
      const destDisplayName = session?.name || repo.destinationOwner;
      const destEmail = session?.email || `${repo.destinationOwner}@users.noreply.github.com`;

      // 2. Git Mirror Clone & Push
      const migrationResult = await gitMigrationService.executeMigration({
        jobId,
        repoId,
        sourceOwner: repo.sourceOwner,
        sourceName: repo.sourceName,
        destOwner: repo.destinationOwner,
        destName: repo.destinationName,
        destToken: token,
        destDisplayName,
        destEmail,
        migrateWiki: repo.options.migrateWiki,
        onLog: (msg, lvl) => this.addLog(jobId, `[${repoName}] ${msg}`, lvl || 'info', 'GIT_MIGRATE', repoId, repoName),
        onPhase: (phase, pct) => {
          this.updateRepoInJob(jobId, repoId, {
            status: phase as RepoMigrationStatus,
            currentPhase: phase,
            progressPercent: pct,
          });
        },
      });

      // 3. Metadata Sync (Topics, Description, Issues, Releases)
      this.updateRepoInJob(jobId, repoId, {
        status: 'METADATA_MIGRATION',
        currentPhase: 'Syncing metadata and releases',
        progressPercent: 90,
      });

      this.addLog(jobId, `[${repoName}] Updating repository metadata...`, 'info', 'METADATA', repoId, repoName);
      await syncRepoMetadata(token, repo.destinationOwner, repo.destinationName, {
        has_issues: repo.options.migrateIssues,
        has_wiki: repo.options.migrateWiki,
      });

      if (repo.options.migrateIssues) {
        await migratePublicIssues(token, repo.sourceOwner, repo.sourceName, repo.destinationOwner, repo.destinationName, (msg) => {
          this.addLog(jobId, `[${repoName}] ${msg}`, 'info', 'ISSUES', repoId, repoName);
        });
      }

      if (repo.options.migrateReleases) {
        await migratePublicReleases(token, repo.sourceOwner, repo.sourceName, repo.destinationOwner, repo.destinationName, (msg) => {
          this.addLog(jobId, `[${repoName}] ${msg}`, 'info', 'RELEASES', repoId, repoName);
        });
      }

      // 4. Record Verification
      const { verification, hasLFS } = migrationResult;
      const isVerified = verification.matchedBranches && verification.matchedTags;

      this.addLog(
        jobId,
        `[${repoName}] Branch references verified (${verification.destBranchCount} destination / ${verification.sourceBranchCount} source).`,
        verification.matchedBranches ? 'info' : 'warn',
        'VERIFY',
        repoId,
        repoName
      );

      this.addLog(
        jobId,
        `[${repoName}] Tag references verified (${verification.destTagCount} destination / ${verification.sourceTagCount} source).`,
        verification.matchedTags ? 'info' : 'warn',
        'VERIFY',
        repoId,
        repoName
      );

      this.addLog(
        jobId,
        `[${repoName}] Commit history verified (${verification.commitCount ?? 0} commit(s) verified, HEAD: ${verification.headCommitSha ? verification.headCommitSha.slice(0, 7) : 'matched'}).`,
        'info',
        'VERIFY',
        repoId,
        repoName
      );

      this.updateRepoInJob(jobId, repoId, {
        status: isVerified ? 'COMPLETED' : 'PARTIAL',
        currentPhase: 'Migration complete',
        progressPercent: 100,
        sourceBranches: verification.sourceBranchCount,
        migratedBranches: verification.destBranchCount,
        sourceTags: verification.sourceTagCount,
        migratedTags: verification.destTagCount,
        commitsVerified: isVerified,
        commitCount: verification.commitCount,
        latestCommitDate: verification.latestCommitDate,
        latestCommitMessage: verification.latestCommitMessage,
        hasLFS,
        lfsStatus: hasLFS ? 'partial' : 'none',
        verification: {
          matchedBranches: verification.matchedBranches,
          matchedTags: verification.matchedTags,
          matchedHead: verification.matchedHead,
          headCommitSha: verification.headCommitSha,
          commitCount: verification.commitCount,
          latestCommitDate: verification.latestCommitDate,
          latestCommitMessage: verification.latestCommitMessage,
          details: verification.details,
        },
        completedAt: new Date().toISOString(),
      });

      this.addLog(
        jobId,
        `[${repoName}] Repository migration completed successfully.`,
        'success',
        'COMPLETED',
        repoId,
        repoName
      );
    } catch (err: any) {
      console.error(`[Worker] Error migrating ${repoName}:`, err);
      const classified = classifyGitError(err);
      
      // If destination was created but git mirror failed, mark PARTIAL or FAILED with clear recovery instruction
      const finalStatus: RepoMigrationStatus = destinationCreated ? 'PARTIAL' : 'FAILED';

      this.updateRepoInJob(jobId, repoId, {
        status: finalStatus,
        currentPhase: 'Migration failed / partial',
        progressPercent: 100,
        error: classified.userMessage,
        errorCode: classified.code,
        errorDetails: classified.technicalDetails,
        completedAt: new Date().toISOString(),
      });

      this.addLog(jobId, `[${repoName}] Migration failed: ${classified.userMessage}`, 'error', 'FAILED', repoId, repoName);
      if (destinationCreated) {
        this.addLog(jobId, `[${repoName}] Note: Destination repository exists on GitHub. You can click 'Retry' once resolved.`, 'warn', 'FAILED', repoId, repoName);
      }
    }
  }

  public generateAndSaveReport(jobId: string) {
    const job = db.getJob(jobId);
    if (!job) return;

    let md = `# GitHub Public Repository Migration Report\n\n`;
    md += `**Date**: ${new Date().toLocaleString()}\n`;
    md += `**Source Account**: https://github.com/${job.sourceUsername} (Public)\n`;
    md += `**Destination Account**: https://github.com/${job.destinationUsername}\n`;
    md += `**Overall Status**: ${job.status}\n`;
    md += `**Total Repositories**: ${job.totalRepositories}\n`;
    md += `**Completed**: ${job.completedRepositories}\n`;
    md += `**Partial**: ${job.partialRepositories}\n`;
    md += `**Failed**: ${job.failedRepositories}\n`;
    md += `**Skipped**: ${job.skippedRepositories}\n\n`;

    if (job.error) {
      md += `### Job Diagnostic Alert\n`;
      md += `**Error Code**: \`${job.errorCode || 'UNKNOWN'}\`\n`;
      md += `**Message**: ${job.error}\n\n`;
    }

    md += `## Repository Summaries\n\n`;
    for (const r of job.repositories) {
      md += `### ${r.sourceName} -> ${r.destinationName}\n`;
      md += `- **Status**: ${r.status}\n`;
      md += `- **Source URL**: ${r.sourceUrl}\n`;
      md += `- **Destination URL**: ${r.destinationUrl}\n`;
      md += `- **Branches**: ${r.migratedBranches}/${r.sourceBranches}\n`;
      md += `- **Tags**: ${r.migratedTags}/${r.sourceTags}\n`;
      md += `- **Commit Count**: ${r.commitCount ?? 'N/A'}\n`;
      if (r.latestCommitDate) md += `- **Latest Commit Date**: ${r.latestCommitDate}\n`;
      if (r.latestCommitMessage) md += `- **Latest Commit Message**: ${r.latestCommitMessage}\n`;
      if (r.error) {
        md += `- **Error Code**: \`${r.errorCode || 'UNKNOWN'}\`\n`;
        md += `- **Error**: ${r.error}\n`;
      }
      md += `\n`;
    }

    db.saveReport(jobId, { markdown: md, json: job });
  }
}

export const migrationQueue = new MigrationWorkerQueue();
