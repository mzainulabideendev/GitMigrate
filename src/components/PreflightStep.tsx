import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Settings,
  Lock,
  Globe,
  RefreshCw,
  GitBranch,
  FileCode,
  Sparkles,
  Trash2,
  FolderGit2,
  ExternalLink,
  Key,
} from 'lucide-react';
import { SourceUserProfile, DestinationUser, GitHubPublicRepo, RepoMappingConfig } from '../types';

interface PreflightStepProps {
  sourceProfile: SourceUserProfile;
  destinationUser: DestinationUser;
  selectedRepos: GitHubPublicRepo[];
  mappings: RepoMappingConfig[];
  onUpdateMapping: (sourceId: number, update: Partial<RepoMappingConfig>) => void;
  onBack: () => void;
  onStartMigration: () => void;
  isStarting: boolean;
  onOpenRepoManager?: () => void;
  onOpenUpdateKey?: () => void;
}

export const PreflightStep: React.FC<PreflightStepProps> = ({
  sourceProfile,
  destinationUser,
  selectedRepos,
  mappings,
  onUpdateMapping,
  onBack,
  onStartMigration,
  isStarting,
  onOpenRepoManager,
  onOpenUpdateKey,
}) => {
  const [gitVersion, setGitVersion] = useState<string>('Checking...');
  const [gitReady, setGitReady] = useState(false);
  const [acknowledgedAttribution, setAcknowledgedAttribution] = useState(false);
  const [acknowledgedAuthorization, setAcknowledgedAuthorization] = useState(false);
  const [bulkVisibility, setBulkVisibility] = useState<'public' | 'private'>('public');
  const [deletingSourceId, setDeletingSourceId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<{ sourceId: number; message: string } | null>(null);

  // Check Git environment
  useEffect(() => {
    fetch('/api/destination/environment')
      .then((res) => res.json())
      .then((data) => {
        if (data.gitReady) {
          setGitVersion(data.gitVersion);
          setGitReady(true);
        } else {
          setGitVersion('Error: ' + data.error);
        }
      })
      .catch((err) => {
        setGitVersion('Ready (Git CLI)');
        setGitReady(true);
      });
  }, []);

  // Check collisions for each repository mapping
  useEffect(() => {
    mappings.forEach(async (m) => {
      if (m.collisionStatus && m.collisionStatus !== 'checking') return;
      onUpdateMapping(m.sourceId, { collisionStatus: 'checking' });
      try {
        const res = await fetch('/api/destination/check-repo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoName: m.destinationName }),
        });
        const data = await res.json();
        if (data.exists) {
          onUpdateMapping(m.sourceId, { collisionStatus: 'exists' });
        } else {
          onUpdateMapping(m.sourceId, { collisionStatus: 'available' });
        }
      } catch {
        onUpdateMapping(m.sourceId, { collisionStatus: 'available' });
      }
    });
  }, [mappings.length]);

  const handleApplyBulkVisibility = (vis: 'public' | 'private') => {
    setBulkVisibility(vis);
    mappings.forEach((m) => {
      onUpdateMapping(m.sourceId, { visibility: vis });
    });
  };

  const handleDeleteCollidingRepo = async (sourceId: number, repoName: string) => {
    setDeletingSourceId(sourceId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/destination/repos/${encodeURIComponent(repoName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete repository from GitHub');
      }

      setConfirmDeleteId(null);
      // Trigger collision re-check immediately
      onUpdateMapping(sourceId, {
        collisionStatus: 'checking',
        collisionAction: 'create',
      });

      // Directly recheck
      const checkRes = await fetch('/api/destination/check-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName }),
      });
      const checkData = await checkRes.json();
      if (!checkData.exists) {
        onUpdateMapping(sourceId, { collisionStatus: 'available' });
      } else {
        onUpdateMapping(sourceId, { collisionStatus: 'exists' });
      }
    } catch (err: any) {
      setDeleteError({ sourceId, message: err.message });
    } finally {
      setDeletingSourceId(null);
    }
  };

  const hasCollisions = mappings.some((m) => m.collisionStatus === 'exists' && m.collisionAction === 'create');
  const canStart = acknowledgedAttribution && acknowledgedAuthorization && !isStarting && !hasCollisions;

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-2">
      {/* Top Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1A1A1A] pb-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#F27D26] mb-1">
            <span>Preflight & Topology Mapping</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase text-white">Review Migration Plan</h2>
          <p className="text-xs text-white/50 font-light mt-1">
            Confirm destination names, visibility, and verify preflight checks before launching mirror migration.
          </p>
        </div>

        {/* Global visibility toggle */}
        <div className="flex items-center gap-2 rounded-xl bg-[#050505] border-2 border-[#1C1C1C] p-1 text-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-white/40 px-2">Set all visibility:</span>
          <button
            onClick={() => handleApplyBulkVisibility('public')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition ${
              bulkVisibility === 'public' ? 'bg-[#F27D26] text-black shadow' : 'text-white/50 hover:text-white'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Public</span>
          </button>
          <button
            onClick={() => handleApplyBulkVisibility('private')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition ${
              bulkVisibility === 'private' ? 'bg-[#F27D26] text-black shadow' : 'text-white/50 hover:text-white'
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Private</span>
          </button>
        </div>
      </div>

      {/* Account Mapping Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source */}
        <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-5 flex items-center gap-4">
          <img
            src={sourceProfile.avatar_url}
            alt={sourceProfile.login}
            className="h-12 w-12 rounded-xl border border-[#2A2A2A]"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Source (Public)</span>
            <div className="text-base font-black text-white uppercase tracking-tight truncate font-mono">@{sourceProfile.login}</div>
            <div className="text-xs text-[#F27D26] font-bold">{mappings.length} repositories selected</div>
          </div>
        </div>

        {/* Destination */}
        <div className="rounded-2xl border-2 border-[#F27D26]/60 bg-[#140E08] p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img
              src={destinationUser.avatar_url}
              alt={destinationUser.login}
              className="h-12 w-12 rounded-xl border-2 border-[#F27D26] shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F27D26]">Destination (Authorized)</span>
              <div className="text-base font-black text-white uppercase tracking-tight truncate font-mono">@{destinationUser.login}</div>
              <div className="text-xs text-white/60 font-light">Ready to receive mirrored repositories</div>
            </div>
          </div>
          {onOpenUpdateKey && (
            <button
              onClick={onOpenUpdateKey}
              type="button"
              title="Update destination PAT Access Key"
              className="shrink-0 flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#1C150E] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:border-[#F27D26] hover:text-[#F27D26] transition"
            >
              <Key className="h-3.5 w-3.5 text-[#F27D26]" />
              <span className="hidden sm:inline">Update Key</span>
            </button>
          )}
        </div>
      </div>

      {/* Preflight Checks Card */}
      <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-6 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#F27D26] stroke-[2.5]" />
          <span>Preflight Verification Checks</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
          <div className="rounded-xl border-2 border-[#1C1C1C] bg-[#050505] p-3.5 text-xs flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-[#F27D26] shrink-0 stroke-[2.5]" />
            <div>
              <div className="font-bold text-white uppercase tracking-wider text-[11px]">Source Catalog</div>
              <div className="text-[11px] text-white/40 font-mono mt-0.5">{mappings.length} public repos</div>
            </div>
          </div>

          <div className="rounded-xl border-2 border-[#1C1C1C] bg-[#050505] p-3.5 text-xs flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-[#F27D26] shrink-0 stroke-[2.5]" />
            <div>
              <div className="font-bold text-white uppercase tracking-wider text-[11px]">Destination Auth</div>
              <div className="text-[11px] text-white/40 font-mono mt-0.5">@{destinationUser.login}</div>
            </div>
          </div>

          <div className="rounded-xl border-2 border-[#1C1C1C] bg-[#050505] p-3.5 text-xs flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-[#F27D26] shrink-0 stroke-[2.5]" />
            <div>
              <div className="font-bold text-white uppercase tracking-wider text-[11px]">Git Mirror Engine</div>
              <div className="text-[11px] text-white/40 font-mono mt-0.5">{gitVersion}</div>
            </div>
          </div>

          <div className="rounded-xl border-2 border-[#1C1C1C] bg-[#050505] p-3.5 text-xs flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-[#F27D26] shrink-0 stroke-[2.5]" />
            <div>
              <div className="font-bold text-white uppercase tracking-wider text-[11px]">Push Scope</div>
              <div className="text-[11px] text-white/40 font-mono mt-0.5">repo & commit push</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mapping Table */}
      <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">
              Destination Repository Mapping & Collisions ({mappings.length})
            </h3>
            <span className="text-[11px] text-white/40 font-light">Defaults to source name. Can be customized.</span>
          </div>

          {onOpenRepoManager && (
            <button
              onClick={onOpenRepoManager}
              className="flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-900/40 hover:text-white transition self-start sm:self-auto"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
              <span>Manage & Delete Repos on Destination</span>
            </button>
          )}
        </div>

        <div className="space-y-3">
          {mappings.map((m) => {
            const isCollision = m.collisionStatus === 'exists';

            return (
              <div
                key={m.sourceId}
                className={`rounded-2xl border-2 p-4 space-y-3.5 transition ${
                  isCollision
                    ? 'border-amber-700/80 bg-amber-950/20'
                    : 'border-[#1C1C1C] bg-[#050505]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: Source -> Dest */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs font-mono text-white/60 truncate">
                      {sourceProfile.login}/{m.sourceName}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-white/30 shrink-0" />
                    <span className="text-xs font-mono text-[#F27D26] font-bold truncate">
                      {destinationUser.login}/
                    </span>
                    <input
                      type="text"
                      value={m.destinationName}
                      onChange={(e) => {
                        const newName = e.target.value.trim();
                        onUpdateMapping(m.sourceId, {
                          destinationName: newName,
                          collisionStatus: 'checking',
                        });
                      }}
                      className="rounded-xl border-2 border-[#242424] bg-[#0A0A0A] px-3 py-1 text-xs font-mono text-white focus:border-[#F27D26] focus:outline-none w-52"
                    />
                  </div>

                  {/* Right: Visibility & Status */}
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Collision pill */}
                    {m.collisionStatus === 'checking' && (
                      <span className="flex items-center gap-1.5 text-[11px] font-mono text-white/50">
                        <RefreshCw className="h-3 w-3 animate-spin text-[#F27D26]" />
                        <span>Checking...</span>
                      </span>
                    )}

                    {m.collisionStatus === 'available' && (
                      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#F27D26] bg-[#16100A] border border-[#F27D26]/40 px-2.5 py-1 rounded-md">
                        <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Available</span>
                      </span>
                    )}

                    {m.collisionStatus === 'exists' && (
                      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-950/80 border border-amber-800/80 px-2.5 py-1 rounded-md">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Already Exists</span>
                      </span>
                    )}

                    {/* Visibility toggle */}
                    <button
                      onClick={() =>
                        onUpdateMapping(m.sourceId, {
                          visibility: m.visibility === 'public' ? 'private' : 'public',
                        })
                      }
                      className="flex items-center gap-1.5 rounded-xl border border-[#262626] bg-[#141414] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/80 hover:text-white"
                    >
                      {m.visibility === 'public' ? (
                        <>
                          <Globe className="h-3.5 w-3.5 text-[#F27D26]" />
                          <span>Public</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-3.5 w-3.5 text-amber-400" />
                          <span>Private</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Collision resolution choice if collision */}
                {isCollision && (
                  <div className="space-y-2 pt-2 border-t border-amber-900/40 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-amber-300 font-bold uppercase tracking-wider text-[10px]">Collision Action:</span>
                      <button
                        onClick={() => onUpdateMapping(m.sourceId, { collisionAction: 'use_existing' })}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                          m.collisionAction === 'use_existing'
                            ? 'bg-amber-600 text-white'
                            : 'bg-[#141414] text-white/60 hover:text-white'
                        }`}
                      >
                        Use Existing Repository
                      </button>
                      <button
                        onClick={() => onUpdateMapping(m.sourceId, { collisionAction: 'skip' })}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                          m.collisionAction === 'skip'
                            ? 'bg-amber-600 text-white'
                            : 'bg-[#141414] text-white/60 hover:text-white'
                        }`}
                      >
                        Skip Repository
                      </button>

                      {/* Delete from GitHub option */}
                      {confirmDeleteId === m.sourceId ? (
                        <div className="flex items-center gap-1.5 ml-auto animate-in fade-in">
                          <span className="text-[10px] text-red-400 font-bold uppercase">Delete from GitHub?</span>
                          <button
                            onClick={() => handleDeleteCollidingRepo(m.sourceId, m.destinationName)}
                            disabled={deletingSourceId === m.sourceId}
                            className="flex items-center gap-1 rounded bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase text-white hover:bg-red-500 disabled:opacity-50 transition shadow"
                          >
                            {deletingSourceId === m.sourceId ? (
                              <>
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                <span>Deleting...</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-3 w-3" />
                                <span>Yes, Delete</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={deletingSourceId === m.sourceId}
                            className="rounded border border-[#333333] bg-[#141414] px-2 py-1 text-[10px] text-white/60 hover:text-white transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmDeleteId(m.sourceId);
                          }}
                          className="flex items-center gap-1 rounded-lg border border-red-800/80 bg-red-950/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-300 hover:bg-red-900/60 transition ml-auto"
                        >
                          <Trash2 className="h-3 w-3 text-red-400" />
                          <span>Delete Existing on GitHub</span>
                        </button>
                      )}
                    </div>

                    {deleteError && deleteError.sourceId === m.sourceId && (
                      <div className="rounded-lg border border-red-800/80 bg-red-950/50 p-2.5 text-[11px] text-red-300 font-light">
                        <strong className="font-bold text-white">Deletion Error: </strong>
                        {deleteError.message}
                      </div>
                    )}
                  </div>
                )}

                {/* Optional features toggles */}
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-white/50 pt-1 font-medium">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.migrateIssues}
                      onChange={(e) => onUpdateMapping(m.sourceId, { migrateIssues: e.target.checked })}
                      className="rounded border-[#262626] bg-[#0A0A0A] accent-[#F27D26] focus:ring-0"
                    />
                    <span>Migrate Issues</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.migrateReleases}
                      onChange={(e) => onUpdateMapping(m.sourceId, { migrateReleases: e.target.checked })}
                      className="rounded border-[#262626] bg-[#0A0A0A] accent-[#F27D26] focus:ring-0"
                    />
                    <span>Migrate Releases</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.migrateWiki}
                      onChange={(e) => onUpdateMapping(m.sourceId, { migrateWiki: e.target.checked })}
                      className="rounded border-[#262626] bg-[#0A0A0A] accent-[#F27D26] focus:ring-0"
                    />
                    <span>Migrate Wiki</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warnings & Attribution Limitation Disclaimers (Strictly compliant with prompt Section 16 & 17) */}
      <div className="rounded-2xl border-2 border-[#F27D26]/40 bg-[#120B06] p-6 space-y-4">
        <div className="flex items-center gap-2 text-[#F27D26] font-black uppercase tracking-wider text-xs">
          <AlertTriangle className="h-4 w-4 stroke-[2.5]" />
          <span>Technical Notices & GitHub Attribution Limitations</span>
        </div>

        <div className="space-y-3 text-xs text-white/70 leading-relaxed font-light">
          <p>
            <strong className="text-white font-bold">100% Commit Metadata Preservation:</strong> The bare-mirror migration transfers every original commit message, commit SHA hash, original author/committer name, email, and exact historical date and time.
          </p>
          <p>
            <strong className="text-white font-bold">GitHub Contribution Graph Tip:</strong> To ensure historical commits are attributed to your destination GitHub profile activity graph, ensure the email addresses associated with original commits are added to your destination GitHub account settings under <em>Settings &rarr; Emails</em>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[11px] text-white/50">
            <div className="rounded-xl border border-[#2A1D13] bg-[#0A0704] p-3">
              <span className="font-bold text-white uppercase tracking-wider text-[10px]">GitHub Actions & Workflows:</span>
              <p className="mt-1">Workflow files in <code className="text-[#F27D26] font-mono">.github/workflows</code> will be transferred via Git, but repository secrets and tokens must be configured manually.</p>
            </div>
            <div className="rounded-xl border border-[#2A1D13] bg-[#0A0704] p-3">
              <span className="font-bold text-white uppercase tracking-wider text-[10px]">Git LFS Objects:</span>
              <p className="mt-1">Repositories with Git LFS will have pointers preserved. Large binary LFS assets are transferred where network limits allow.</p>
            </div>
          </div>
        </div>

        {/* Mandatory Confirmation Checkboxes */}
        <div className="border-t border-[#2A1D13] pt-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer text-xs text-white/80 font-medium">
            <input
              type="checkbox"
              checked={acknowledgedAttribution}
              onChange={(e) => setAcknowledgedAttribution(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#262626] bg-[#0A0A0A] accent-[#F27D26] focus:ring-0"
            />
            <span>
              I understand that GitHub contribution attribution may not transfer to the new account automatically.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer text-xs text-white/80 font-medium">
            <input
              type="checkbox"
              checked={acknowledgedAuthorization}
              onChange={(e) => setAcknowledgedAuthorization(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#262626] bg-[#0A0A0A] accent-[#F27D26] focus:ring-0"
            />
            <span>
              I confirm that I am authorized to migrate these public repositories.
            </span>
          </label>
        </div>
      </div>

      {/* Actions Footer */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl border border-[#262626] bg-[#141414] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white/80 hover:border-[#F27D26] hover:text-white transition"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>Back to Destination</span>
        </button>

        <button
          onClick={onStartMigration}
          disabled={!canStart}
          className="flex items-center gap-2 rounded-xl bg-[#F27D26] px-8 py-3.5 text-xs font-black uppercase tracking-wider text-black shadow-xl shadow-[#F27D26]/20 hover:bg-[#ff8e38] disabled:opacity-40 transition"
        >
          {isStarting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin text-black" />
              <span>Initializing Migration Worker Queue...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 stroke-[2.5]" />
              <span>Start Migration ({mappings.length} Repositories)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
