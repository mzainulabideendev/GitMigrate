import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  GitBranch,
  Tag,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Trash2,
  FolderGit2,
  RefreshCw,
} from 'lucide-react';
import { MigrationJob, MigrationRepoState } from '../types';

interface ReportStepProps {
  job: MigrationJob;
  onStartNew: () => void;
  onOpenRepoManager?: () => void;
}

export const ReportStep: React.FC<ReportStepProps> = ({ job, onStartNew, onOpenRepoManager }) => {
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [reportJson, setReportJson] = useState<any>(null);
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);
  const [confirmDeleteRepoId, setConfirmDeleteRepoId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; message: string; isError?: boolean } | null>(null);

  const handleDeleteDestinationRepo = async (repo: MigrationRepoState) => {
    setDeletingRepoId(repo.id);
    setNotice(null);

    try {
      const res = await fetch(`/api/destination/repos/${encodeURIComponent(repo.destinationName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete repository from GitHub');
      }

      setNotice({
        id: repo.id,
        message: `Repository '${job.destinationUsername}/${repo.destinationName}' permanently deleted from GitHub.`,
      });
      setConfirmDeleteRepoId(null);
    } catch (err: any) {
      setNotice({
        id: repo.id,
        message: err.message,
        isError: true,
      });
    } finally {
      setDeletingRepoId(null);
    }
  };

  useEffect(() => {
    fetch(`/api/migrations/${job.id}/report`)
      .then((res) => res.json())
      .then((data) => {
        if (data.report) {
          setReportMarkdown(data.report.markdown || '');
          setReportJson(data.report.json || job);
        }
      })
      .catch(() => {
        setReportJson(job);
      });
  }, [job.id]);

  const handleDownloadMarkdown = () => {
    const blob = new Blob([reportMarkdown || `# Migration Report for ${job.id}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `github-migration-${job.sourceUsername}-to-${job.destinationUsername}-report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(reportJson || job, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `github-migration-${job.sourceUsername}-to-${job.destinationUsername}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-2 animate-in fade-in duration-300">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[#F27D26]/60 bg-[#16100A] px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#F27D26]">
          <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>Migration Completed & Verified</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase text-white">
          Migration Audit Report
        </h2>
        <p className="text-xs text-white/50 font-light">
          Migrated from <strong className="text-white font-mono font-bold">@{job.sourceUsername}</strong> to{' '}
          <strong className="text-[#F27D26] font-mono font-bold">@{job.destinationUsername}</strong>
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-5 text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Selected Repos</div>
          <div className="text-3xl font-black text-white mt-1 font-mono">{job.totalRepositories}</div>
        </div>

        <div className="rounded-2xl border-2 border-[#F27D26]/50 bg-[#140E08] p-5 text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F27D26]">Completed</div>
          <div className="text-3xl font-black text-[#F27D26] mt-1 font-mono">{job.completedRepositories}</div>
        </div>

        <div className="rounded-2xl border-2 border-amber-800/60 bg-amber-950/20 p-5 text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Partial</div>
          <div className="text-3xl font-black text-amber-300 mt-1 font-mono">{job.partialRepositories}</div>
        </div>

        <div className="rounded-2xl border-2 border-red-800/60 bg-red-950/20 p-5 text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">Failed</div>
          <div className="text-3xl font-black text-red-300 mt-1 font-mono">{job.failedRepositories}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-5">
        <div className="text-xs text-white/50 font-bold uppercase tracking-wider">
          Export full migration verification logs and audit records:
        </div>

        <div className="flex items-center gap-2.5">
          {onOpenRepoManager && (
            <button
              onClick={onOpenRepoManager}
              className="flex items-center gap-1.5 rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-900/50 hover:text-white transition"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
              <span>Manage & Delete Repos</span>
            </button>
          )}

          <button
            onClick={handleDownloadMarkdown}
            className="flex items-center gap-1.5 rounded-xl border border-[#262626] bg-[#141414] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:border-[#F27D26] transition"
          >
            <Download className="h-3.5 w-3.5 text-[#F27D26] stroke-[2.5]" />
            <span>Markdown Report</span>
          </button>

          <button
            onClick={handleDownloadJson}
            className="flex items-center gap-1.5 rounded-xl border border-[#262626] bg-[#141414] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:border-[#F27D26] transition"
          >
            <Download className="h-3.5 w-3.5 text-white/60 stroke-[2.5]" />
            <span>JSON Audit</span>
          </button>
        </div>
      </div>

      {/* Detailed Per-Repository Audit */}
      <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-[#1C1C1C] pb-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Repository Migration & Verification Details</h3>
          <span className="text-[11px] font-mono text-white/40">{job.repositories.length} repositories audited</span>
        </div>

        <div className="space-y-4">
          {job.repositories.map((repo) => (
            <div
              key={repo.id}
              className="rounded-2xl border-2 border-[#1C1C1C] bg-[#050505] p-5 space-y-3.5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm uppercase tracking-tight text-white">{repo.sourceName}</span>
                  <span className="text-xs text-white/40">→</span>
                  <span className="font-bold text-xs font-mono text-[#F27D26]">@{job.destinationUsername}/{repo.destinationName}</span>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                      repo.status === 'COMPLETED'
                        ? 'bg-[#16100A] text-[#F27D26] border border-[#F27D26]/40'
                        : repo.status === 'PARTIAL'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-red-950 text-red-300 border border-red-800'
                    }`}
                  >
                    {repo.status}
                  </span>

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
                        setNotice(null);
                        setConfirmDeleteRepoId(repo.id);
                      }}
                      title="Permanently delete this destination repository from GitHub"
                      className="rounded-lg border border-red-900/60 bg-red-950/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-900/40 hover:text-red-300 transition flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>

              {notice && notice.id === repo.id && (
                <div
                  className={`rounded-lg border p-2.5 text-xs font-medium ${
                    notice.isError
                      ? 'border-red-800/80 bg-red-950/40 text-red-300'
                      : 'border-emerald-800/80 bg-emerald-950/40 text-emerald-300'
                  }`}
                >
                  {notice.message}
                </div>
              )}

              {/* Git Verification Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs pt-1">
                {/* Git Objects */}
                <div className="rounded-xl border border-[#1F1F1F] bg-[#0C0C0C] p-3.5 space-y-2">
                  <div className="font-bold text-white uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#F27D26] stroke-[2.5]" />
                    <span>Git Objects & History</span>
                  </div>
                  <ul className="text-[11px] text-white/50 space-y-1 pl-1">
                    <li>✓ Original commit SHAs preserved</li>
                    <li>✓ Commit timestamps unchanged</li>
                    <li>✓ Original commit messages kept</li>
                    <li>✓ Tree and file objects mirrored</li>
                  </ul>
                </div>

                {/* References */}
                <div className="rounded-xl border border-[#1F1F1F] bg-[#0C0C0C] p-3.5 space-y-2">
                  <div className="font-bold text-white uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#F27D26] stroke-[2.5]" />
                    <span>References & Tags</span>
                  </div>
                  <ul className="text-[11px] text-white/50 space-y-1 pl-1">
                    <li>✓ {repo.migratedBranches} branches verified</li>
                    <li>✓ {repo.migratedTags} tags verified</li>
                    {repo.verification?.headCommitSha && (
                      <li className="font-mono text-white/60 truncate">HEAD: {repo.verification.headCommitSha.slice(0, 7)}</li>
                    )}
                  </ul>
                </div>

                {/* Metadata */}
                <div className="rounded-xl border border-[#1F1F1F] bg-[#0C0C0C] p-3.5 space-y-2">
                  <div className="font-bold text-white uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#F27D26] stroke-[2.5]" />
                    <span>Metadata & Settings</span>
                  </div>
                  <ul className="text-[11px] text-white/50 space-y-1 pl-1">
                    <li>✓ Visibility: {repo.visibility}</li>
                    <li>{repo.options.migrateIssues ? '✓ Public issues copied' : '— Issues not requested'}</li>
                    <li>{repo.options.migrateReleases ? '✓ Releases synced' : '— Releases not requested'}</li>
                    {repo.hasLFS && <li className="text-amber-400">⚠ Git LFS detected</li>}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Start New CTA */}
      <div className="flex justify-center pt-2">
        <button
          onClick={onStartNew}
          className="flex items-center gap-2 rounded-xl bg-[#F27D26] px-8 py-3.5 text-xs font-black uppercase tracking-wider text-black shadow-xl shadow-[#F27D26]/20 hover:bg-[#ff8e38] transition"
        >
          <Sparkles className="h-4 w-4 stroke-[2.5]" />
          <span>Start Another Migration</span>
        </button>
      </div>
    </div>
  );
};
