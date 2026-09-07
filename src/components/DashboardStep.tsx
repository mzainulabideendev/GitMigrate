import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Terminal,
  FileText,
  GitBranch,
  Tag,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Trash2,
  FolderGit2,
  Key,
} from 'lucide-react';
import { MigrationJob, MigrationLogEntry, MigrationRepoState } from '../types';

interface DashboardStepProps {
  job: MigrationJob;
  logs: MigrationLogEntry[];
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onRetry: (repoId?: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onViewReport: () => void;
  onStartNewMigration?: () => void;
  onOpenRepoManager?: () => void;
  onOpenUpdateKey?: () => void;
}

export const DashboardStep: React.FC<DashboardStepProps> = ({
  job,
  logs,
  onPause,
  onResume,
  onRetry,
  onCancel,
  onViewReport,
  onStartNewMigration,
  onOpenRepoManager,
  onOpenUpdateKey,
}) => {
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warn' | 'success'>('all');
  const [expandedRepoId, setExpandedRepoId] = useState<string | null>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);
  const [confirmDeleteRepoId, setConfirmDeleteRepoId] = useState<string | null>(null);
  const [repoActionNotice, setRepoActionNotice] = useState<{ id: string; type: 'success' | 'error'; message: string } | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const handleDeleteDestinationRepo = async (repo: MigrationRepoState) => {
    setDeletingRepoId(repo.id);
    setRepoActionNotice(null);

    try {
      const res = await fetch(`/api/destination/repos/${encodeURIComponent(repo.destinationName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete repository from GitHub');
      }

      setRepoActionNotice({
        id: repo.id,
        type: 'success',
        message: `Deleted repository '${job.destinationUsername}/${repo.destinationName}' from GitHub.`,
      });
      setConfirmDeleteRepoId(null);
    } catch (err: any) {
      setRepoActionNotice({
        id: repo.id,
        type: 'error',
        message: err.message,
      });
    } finally {
      setDeletingRepoId(null);
    }
  };

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs.length]);

  const activeRepo = job.repositories.find(
    (r) => r.status !== 'COMPLETED' && r.status !== 'SKIPPED' && r.status !== 'FAILED' && r.status !== 'QUEUED'
  ) || job.repositories[job.currentRepoIndex] || job.repositories[0];

  const filteredLogs = logs.filter((l) => {
    if (logFilter === 'all') return true;
    return l.level === logFilter;
  });

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level.toUpperCase()}] [${l.phase}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const isCompleted = job.status === 'COMPLETED' || job.status === 'PARTIAL' || job.status === 'FAILED';
  const isRunning = job.status === 'RUNNING';
  const isPaused = job.status === 'PAUSED';

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1A1A1A] pb-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-white/50 mb-1">
            <span className="font-mono">@{job.sourceUsername}</span>
            <span>→</span>
            <span className="text-[#F27D26] font-mono">@{job.destinationUsername}</span>
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase text-white">Migration Dashboard</h2>
            <span
              className={`rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] border-2 ${
                isRunning
                  ? 'bg-[#1A1108] text-[#F27D26] border-[#F27D26] animate-pulse'
                  : isPaused
                  ? 'bg-amber-950/80 text-amber-400 border-amber-800'
                  : job.status === 'COMPLETED'
                  ? 'bg-[#1A1108] text-[#F27D26] border-[#F27D26]'
                  : 'bg-[#141414] text-white/60 border-[#262626]'
              }`}
            >
              {job.status}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenRepoManager && (
            <button
              onClick={onOpenRepoManager}
              className="flex items-center gap-1.5 rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-900/50 hover:text-white transition"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
              <span>Manage & Delete Repos</span>
            </button>
          )}

          {isRunning && (
            <button
              onClick={onPause}
              className="flex items-center gap-1.5 rounded-xl border border-[#262626] bg-[#141414] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:border-[#F27D26] transition"
            >
              <Pause className="h-3.5 w-3.5 text-amber-400 stroke-[2.5]" />
              <span>Pause</span>
            </button>
          )}

          {isPaused && (
            <button
              onClick={onResume}
              className="flex items-center gap-1.5 rounded-xl bg-[#F27D26] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:bg-[#ff8e38] transition shadow-lg shadow-[#F27D26]/20"
            >
              <Play className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Resume</span>
            </button>
          )}

          {job.failedRepositories > 0 && (
            <>
              {onOpenUpdateKey && (
                <button
                  onClick={onOpenUpdateKey}
                  title="Update destination PAT access key if token expired or lacks scopes"
                  className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#141414] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white hover:border-[#F27D26] hover:text-[#F27D26] transition"
                >
                  <Key className="h-3.5 w-3.5 text-[#F27D26]" />
                  <span>Update Key</span>
                </button>
              )}
              <button
                onClick={() => onRetry()}
                className="flex items-center gap-1.5 rounded-xl border-2 border-amber-600 bg-amber-950/60 px-4 py-2 text-xs font-black uppercase tracking-wider text-amber-300 hover:bg-amber-900/60 transition"
              >
                <RotateCcw className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Retry Failed ({job.failedRepositories})</span>
              </button>
            </>
          )}

          {isRunning && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 rounded-xl border border-red-900 bg-red-950/40 px-3.5 py-2.5 text-xs font-black uppercase tracking-wider text-red-400 hover:bg-red-900/60 transition"
            >
              <XCircle className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Cancel</span>
            </button>
          )}

          {isCompleted && (
            <>
              {onStartNewMigration && (
                <button
                  onClick={onStartNewMigration}
                  className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#161616] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:border-[#F27D26] hover:text-[#F27D26] transition"
                >
                  <RotateCcw className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Start New Migration</span>
                </button>
              )}
              <button
                onClick={onViewReport}
                className="flex items-center gap-2 rounded-xl bg-[#F27D26] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black shadow-xl shadow-[#F27D26]/20 hover:bg-[#ff8e38] transition"
              >
                <FileText className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>View Final Report</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress & Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Total Selected</div>
          <div className="text-3xl font-black text-white mt-1 font-mono">{job.totalRepositories}</div>
        </div>

        <div className="rounded-2xl border-2 border-[#F27D26]/50 bg-[#140E08] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F27D26]">Completed</div>
          <div className="text-3xl font-black text-[#F27D26] mt-1 font-mono">{job.completedRepositories}</div>
        </div>

        <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Active</div>
          <div className="text-3xl font-black text-blue-300 mt-1 font-mono">
            {isRunning ? 1 : 0}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Queued</div>
          <div className="text-3xl font-black text-white/60 mt-1 font-mono">
            {job.totalRepositories - job.completedRepositories - job.failedRepositories - (isRunning ? 1 : 0)}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-red-900/60 bg-red-950/20 p-4 col-span-2 sm:col-span-1">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">Failed</div>
          <div className="text-3xl font-black text-red-400 mt-1 font-mono">{job.failedRepositories}</div>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-6 space-y-3">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider">
          <span className="text-white/80">Overall Migration Progress</span>
          <span className="text-[#F27D26] font-mono text-sm">{job.overallProgressPercent}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-[#050505] border-2 border-[#1F1F1F]">
          <div
            className="h-full bg-[#F27D26] transition-all duration-500 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, job.overallProgressPercent))}%` }}
          />
        </div>
      </div>

      {/* Active Repository Card (Live Status) */}
      {activeRepo && (
        <div className="rounded-2xl border-2 border-[#F27D26] bg-[#140E08] p-6 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2A1D13] pb-4">
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-black bg-[#F27D26] px-2.5 py-1 rounded">
                Active Repository
              </span>
              <h3 className="text-xl font-black text-white uppercase tracking-tight mt-2">
                {activeRepo.sourceName} <span className="text-white/40 font-normal">→</span> {activeRepo.destinationName}
              </h3>
            </div>
            <div className="text-xs text-white/60">
              Phase: <strong className="text-[#F27D26] font-bold uppercase tracking-wider font-mono">{activeRepo.currentPhase}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
            <div className="rounded-xl border border-[#2A1D13] bg-[#0A0704] p-3.5">
              <div className="text-[10px] uppercase font-bold tracking-wider text-white/50">Branches Preserved</div>
              <div className="text-base font-black text-white mt-1 font-mono">
                {activeRepo.migratedBranches} / {activeRepo.sourceBranches || activeRepo.migratedBranches || '—'}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A1D13] bg-[#0A0704] p-3.5">
              <div className="text-[10px] uppercase font-bold tracking-wider text-white/50">Tags Preserved</div>
              <div className="text-base font-black text-white mt-1 font-mono">
                {activeRepo.migratedTags} / {activeRepo.sourceTags || activeRepo.migratedTags || '—'}
              </div>
            </div>

            <div className="rounded-xl border border-[#2A1D13] bg-[#0A0704] p-3.5">
              <div className="text-[10px] uppercase font-bold tracking-wider text-white/50">Git Commit Integrity</div>
              <div className="text-base font-black text-[#F27D26] mt-1">
                {activeRepo.commitsVerified ? 'Verified Match' : 'Validating objects...'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Repositories List */}
      <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-6 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">
          Repository Execution States ({job.repositories.length})
        </h3>

        <div className="space-y-3">
          {job.repositories.map((repo) => {
            const isExpanded = expandedRepoId === repo.id;

            return (
              <div
                key={repo.id}
                className="rounded-xl border-2 border-[#1C1C1C] bg-[#050505] p-4 space-y-3 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                        repo.status === 'COMPLETED'
                          ? 'bg-[#F27D26] text-black'
                          : repo.status === 'FAILED'
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : repo.status === 'QUEUED'
                          ? 'bg-[#141414] text-white/40'
                          : 'bg-[#1A1108] text-[#F27D26] border border-[#F27D26] animate-pulse'
                      }`}
                    >
                      {repo.status === 'COMPLETED' ? (
                        <Check className="h-4 w-4 stroke-[3]" />
                      ) : repo.status === 'FAILED' ? (
                        <XCircle className="h-4 w-4 stroke-[2.5]" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      )}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white uppercase tracking-tight truncate">{repo.sourceName}</span>
                        <span className="text-xs text-white/40">→</span>
                        <span className="text-xs font-mono font-bold text-[#F27D26] truncate">{repo.destinationName}</span>
                      </div>
                      <div className="text-[11px] text-white/50 font-mono">{repo.currentPhase}</div>
                      {repo.commitCount !== undefined && repo.commitCount > 0 && (
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-white/60 font-mono">
                          <span className="rounded bg-[#1A1A1A] border border-[#262626] px-1.5 py-0.5 text-white/80 font-semibold">
                            {repo.commitCount} commit{repo.commitCount !== 1 ? 's' : ''} preserved
                          </span>
                          {repo.latestCommitDate && (
                            <span className="text-white/40 truncate max-w-xs" title={`Original commit timestamp: ${repo.latestCommitDate}`}>
                              {repo.latestCommitDate}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                        repo.status === 'COMPLETED'
                          ? 'bg-[#16100A] text-[#F27D26] border border-[#F27D26]/40'
                          : repo.status === 'FAILED'
                          ? 'bg-red-950/80 text-red-400 border border-red-800'
                          : repo.status === 'QUEUED'
                          ? 'bg-[#141414] text-white/40 border border-[#222222]'
                          : 'bg-[#16100A] text-[#F27D26] border border-[#F27D26]'
                      }`}
                    >
                      {repo.status}
                    </span>

                    {repo.status === 'FAILED' && (
                      <button
                        onClick={() => onRetry(repo.id)}
                        className="rounded-lg border border-amber-800 bg-amber-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 hover:bg-amber-900 transition"
                      >
                        Retry
                      </button>
                    )}

                    {/* Delete Destination Repo button */}
                    {confirmDeleteRepoId === repo.id ? (
                      <div className="flex items-center gap-1.5 animate-in fade-in">
                        <span className="text-[9px] text-red-400 font-bold uppercase">Delete Repo?</span>
                        <button
                          onClick={() => handleDeleteDestinationRepo(repo)}
                          disabled={deletingRepoId === repo.id}
                          className="flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[9px] font-black uppercase text-white hover:bg-red-500 disabled:opacity-50 transition"
                        >
                          {deletingRepoId === repo.id ? (
                            <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-2.5 w-2.5" />
                          )}
                          <span>Confirm</span>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteRepoId(null)}
                          disabled={deletingRepoId === repo.id}
                          className="rounded border border-[#333333] bg-[#141414] px-1.5 py-0.5 text-[9px] text-white/60 hover:text-white transition"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setRepoActionNotice(null);
                          setConfirmDeleteRepoId(repo.id);
                        }}
                        title="Permanently delete this destination repository from GitHub"
                        className="rounded-lg border border-red-900/60 bg-red-950/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-900/40 hover:text-red-300 transition flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    )}

                    {repo.verification && (
                      <button
                        onClick={() => setExpandedRepoId(isExpanded ? null : repo.id)}
                        className="rounded-lg border border-[#262626] bg-[#141414] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 hover:text-white flex items-center gap-1"
                      >
                        <span>Verify</span>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>

                {repoActionNotice && repoActionNotice.id === repo.id && (
                  <div
                    className={`rounded-lg border p-2.5 text-xs font-medium ${
                      repoActionNotice.type === 'success'
                        ? 'border-emerald-800/80 bg-emerald-950/40 text-emerald-300'
                        : 'border-red-800/80 bg-red-950/40 text-red-300'
                    }`}
                  >
                    {repoActionNotice.message}
                  </div>
                )}

                {repo.error && (
                  <div className="rounded-lg border border-red-900/80 bg-red-950/30 p-2.5 text-xs text-red-300 font-mono">
                    Error: {repo.error}
                  </div>
                )}

                {/* Verification Accordion details */}
                {isExpanded && repo.verification && (
                  <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 text-xs space-y-2.5 animate-in fade-in">
                    <div className="font-bold text-white uppercase tracking-wider text-[10px] flex items-center justify-between">
                      <span>Git Reference Verification Results</span>
                      <span className="text-[#F27D26] text-[11px] font-mono">
                        {repo.verification.matchedBranches && repo.verification.matchedTags
                          ? '✓ All References Match'
                          : '⚠ Reference Discrepancy'}
                      </span>
                    </div>

                    {repo.verification.headCommitSha && (
                      <div className="text-[11px] font-mono text-white/50">
                        HEAD Commit SHA: <span className="text-white font-bold">{repo.verification.headCommitSha}</span>
                      </div>
                    )}

                    {repo.verification.commitCount !== undefined && repo.verification.commitCount > 0 && (
                      <div className="rounded-lg bg-[#111111] p-2.5 border border-[#1F1F1F] space-y-1 font-mono text-[10px]">
                        <div className="text-[#F27D26] font-bold text-[11px]">
                          ✓ Preserved {repo.verification.commitCount} Git Commit(s)
                        </div>
                        {repo.verification.latestCommitDate && (
                          <div className="text-white/60">
                            Original Date/Time: <span className="text-white">{repo.verification.latestCommitDate}</span>
                          </div>
                        )}
                        {repo.verification.latestCommitMessage && (
                          <div className="text-white/60 truncate">
                            Latest Commit Message: <span className="text-white font-medium">"{repo.verification.latestCommitMessage}"</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[10px]">
                      {repo.verification.details.map((d, idx) => (
                        <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-[#111111]">
                          <span className="text-white/80 truncate max-w-xs">{d.ref}</span>
                          <span className={d.match ? 'text-[#F27D26] font-bold' : 'text-red-400'}>
                            {d.match ? '✓ MATCH' : 'MISMATCH'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-Time Live Logs Terminal */}
      <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#050505] p-6 shadow-2xl space-y-4 font-mono text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1C1C1C] pb-4">
          <div className="flex items-center gap-2.5">
            <Terminal className="h-4 w-4 text-[#F27D26] stroke-[2.5]" />
            <span className="font-black text-white uppercase tracking-wider text-xs">Live Migration Logs</span>
            <span className="rounded bg-[#141414] border border-[#242424] px-2 py-0.5 text-[10px] text-white/50">
              {logs.length} events
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-[#0E0E0E] p-0.5 border border-[#222222] text-[10px]">
              {(['all', 'error', 'warn', 'success'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setLogFilter(filter)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    logFilter === filter ? 'bg-[#F27D26] text-black' : 'text-white/50 hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1 rounded-lg border border-[#262626] bg-[#141414] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/80 hover:text-white"
            >
              <Copy className="h-3 w-3" />
              <span>{copiedLogs ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <div
          ref={logContainerRef}
          className="h-64 overflow-y-auto space-y-1.5 rounded-xl bg-[#0A0A0A] p-4 border border-[#1C1C1C] text-[11px] leading-relaxed"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-white/30 italic">No logs recorded yet.</div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-white/30 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`shrink-0 uppercase text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    log.level === 'error'
                      ? 'bg-red-950 text-red-400'
                      : log.level === 'warn'
                      ? 'bg-amber-950 text-amber-400'
                      : log.level === 'success'
                      ? 'bg-[#1A1108] text-[#F27D26] border border-[#F27D26]/40'
                      : 'bg-[#141414] text-white/50'
                  }`}
                >
                  {log.phase}
                </span>
                <span
                  className={`${
                    log.level === 'error'
                      ? 'text-red-400'
                      : log.level === 'warn'
                      ? 'text-amber-300'
                      : log.level === 'success'
                      ? 'text-[#F27D26]'
                      : 'text-white/80'
                  }`}
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
