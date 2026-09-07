import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Search,
  RefreshCw,
  CheckCircle2,
  Lock,
  FolderGit2,
  ShieldAlert,
  CheckSquare,
  Square,
  MinusSquare,
  Filter,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { DestinationUser } from '../types';

export interface DestinationRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  visibility: string;
  html_url: string;
  description: string | null;
  pushed_at: string;
  updated_at: string;
  size: number;
  fork: boolean;
}

interface DestinationRepoManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  destinationUser?: DestinationUser | null;
  destinationUsername?: string;
  onRepoDeleted?: (repoName: string) => void;
  initialSelectedRepo?: string | null;
}

type FilterVisibility = 'all' | 'public' | 'private' | 'forks';
type SortOption = 'updated-desc' | 'name-asc' | 'name-desc' | 'size-desc';

interface BulkDeleteProgress {
  isRunning: boolean;
  total: number;
  current: number;
  currentRepo: string;
  results: { name: string; success: boolean; error?: string }[];
}

export const DestinationRepoManagerModal: React.FC<DestinationRepoManagerModalProps> = ({
  isOpen,
  onClose,
  destinationUser,
  destinationUsername,
  onRepoDeleted,
  initialSelectedRepo,
}) => {
  const [repos, setRepos] = useState<DestinationRepo[]>([]);
  const [detectedOwner, setDetectedOwner] = useState<string>(
    destinationUser?.login || destinationUsername || ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<FilterVisibility>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated-desc');

  // Selection states
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());

  // Single repo deletion state
  const [singleDeletingName, setSingleDeletingName] = useState<string | null>(null);
  const [singleConfirmName, setSingleConfirmName] = useState<string | null>(initialSelectedRepo || null);

  // Bulk deletion modal / confirmation state
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkTargetRepos, setBulkTargetRepos] = useState<string[]>([]);
  const [bulkConfirmInput, setBulkConfirmInput] = useState('');
  const [bulkProgress, setBulkProgress] = useState<BulkDeleteProgress | null>(null);

  // Toast / notification
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const activeOwner = destinationUser?.login || destinationUsername || detectedOwner;

  const fetchRepos = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/destination/repos');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load destination repositories from GitHub');
      }
      setRepos(data.repos || []);
      if (data.owner) {
        setDetectedOwner(data.owner);
      }
      // Prune selected names that no longer exist
      const existingNames = new Set((data.repos || []).map((r: DestinationRepo) => r.name));
      setSelectedNames((prev) => {
        const next = new Set<string>();
        prev.forEach((name) => {
          if (existingNames.has(name)) next.add(name);
        });
        return next;
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRepos();
      if (initialSelectedRepo) {
        setSingleConfirmName(initialSelectedRepo);
        setSearchQuery(initialSelectedRepo);
        setSelectedNames(new Set([initialSelectedRepo]));
      }
    } else {
      setSingleConfirmName(null);
      setBulkConfirmOpen(false);
      setBulkProgress(null);
      setSuccessNotice(null);
      setError(null);
    }
  }, [isOpen, initialSelectedRepo]);

  // Filter & Sort
  const filteredRepos = useMemo(() => {
    let result = repos.filter((r) => {
      // Search
      const matchesSearch =
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;

      // Visibility
      if (visibilityFilter === 'public' && r.private) return false;
      if (visibilityFilter === 'private' && !r.private) return false;
      if (visibilityFilter === 'forks' && !r.fork) return false;

      return true;
    });

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'size-desc') return b.size - a.size;
      // updated-desc default
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    return result;
  }, [repos, searchQuery, visibilityFilter, sortBy]);

  // Selection handlers
  const handleToggleSelect = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      filteredRepos.forEach((r) => next.add(r.name));
      return next;
    });
  };

  const handleSelectAllInAccount = () => {
    const all = new Set(repos.map((r) => r.name));
    setSelectedNames(all);
  };

  const handleDeselectAll = () => {
    setSelectedNames(new Set());
  };

  const isAllVisibleSelected =
    filteredRepos.length > 0 && filteredRepos.every((r) => selectedNames.has(r.name));
  const isSomeVisibleSelected =
    filteredRepos.some((r) => selectedNames.has(r.name)) && !isAllVisibleSelected;

  const handleToggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      // Deselect all visible
      setSelectedNames((prev) => {
        const next = new Set(prev);
        filteredRepos.forEach((r) => next.delete(r.name));
        return next;
      });
    } else {
      // Select all visible
      handleSelectAllVisible();
    }
  };

  // Single repo deletion
  const handleSingleDelete = async (repoName: string) => {
    setSingleDeletingName(repoName);
    setError(null);
    setSuccessNotice(null);

    try {
      const res = await fetch(`/api/destination/repos/${encodeURIComponent(repoName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete repository from GitHub');
      }

      setSuccessNotice(`Repository '${activeOwner ? `${activeOwner}/` : ''}${repoName}' was permanently deleted from GitHub.`);
      setRepos((prev) => prev.filter((r) => r.name.toLowerCase() !== repoName.toLowerCase()));
      setSelectedNames((prev) => {
        const next = new Set(prev);
        next.delete(repoName);
        return next;
      });
      setSingleConfirmName(null);

      if (onRepoDeleted) {
        onRepoDeleted(repoName);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSingleDeletingName(null);
    }
  };

  // Bulk deletion prep
  const openBulkDeleteSelected = () => {
    if (selectedNames.size === 0) return;
    setBulkTargetRepos(Array.from(selectedNames));
    setBulkConfirmInput('');
    setError(null);
    setBulkConfirmOpen(true);
  };

  const openBulkDeleteAll = () => {
    if (repos.length === 0) return;
    setBulkTargetRepos(repos.map((r) => r.name));
    setBulkConfirmInput('');
    setError(null);
    setBulkConfirmOpen(true);
  };

  // Execute bulk deletion with progressive updates
  const executeBulkDelete = async () => {
    if (bulkTargetRepos.length === 0) return;

    setBulkProgress({
      isRunning: true,
      total: bulkTargetRepos.length,
      current: 0,
      currentRepo: bulkTargetRepos[0],
      results: [],
    });
    setError(null);
    setSuccessNotice(null);

    const deletedNames: string[] = [];
    const results: { name: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < bulkTargetRepos.length; i++) {
      const repoName = bulkTargetRepos[i];
      setBulkProgress((prev) =>
        prev
          ? {
              ...prev,
              current: i + 1,
              currentRepo: repoName,
            }
          : null
      );

      try {
        const res = await fetch(`/api/destination/repos/${encodeURIComponent(repoName)}`, {
          method: 'DELETE',
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `Failed HTTP ${res.status}`);
        }

        deletedNames.push(repoName);
        results.push({ name: repoName, success: true });
        if (onRepoDeleted) {
          onRepoDeleted(repoName);
        }
      } catch (err: any) {
        results.push({ name: repoName, success: false, error: err.message });
      }

      setBulkProgress((prev) =>
        prev
          ? {
              ...prev,
              results: [...results],
            }
          : null
      );
    }

    // Update local repositories list by removing all successfully deleted repos
    setRepos((prev) => prev.filter((r) => !deletedNames.includes(r.name)));
    setSelectedNames((prev) => {
      const next = new Set(prev);
      deletedNames.forEach((n) => next.delete(n));
      return next;
    });

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    if (failCount === 0) {
      setSuccessNotice(`Successfully deleted all ${successCount} selected repositories from GitHub.`);
    } else {
      setError(
        `Deleted ${successCount} repositories, but ${failCount} failed. Check the results details below.`
      );
    }

    setBulkProgress((prev) => (prev ? { ...prev, isRunning: false } : null));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl rounded-2xl border-2 border-[#242424] bg-[#0E0E0E] shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1F1F1F] px-6 py-4 bg-[#0A0A0A] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-950/60 border border-red-800 text-red-400">
              <FolderGit2 className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black uppercase tracking-tight text-white">
                  Destination Repository Manager
                </h2>
                {activeOwner && (
                  <span className="text-[#F27D26] font-mono text-xs bg-[#16100A] px-2 py-0.5 rounded border border-[#F27D26]/30">
                    @{activeOwner}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/50 font-light">
                Inspect, multi-select, and permanently delete repositories on your destination GitHub account
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-[#1A1A1A] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Global Notifications */}
        <div className="px-6 pt-4 space-y-3 shrink-0">
          {successNotice && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-800/80 bg-emerald-950/40 p-3 text-xs text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="font-medium">{successNotice}</span>
              </div>
              <button
                onClick={() => setSuccessNotice(null)}
                className="text-emerald-400/60 hover:text-emerald-300 ml-2 text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-800/80 bg-red-950/40 p-3.5 text-xs text-red-300">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="font-bold text-white">Action Error</div>
                <div className="text-[11px] leading-relaxed">{error}</div>
                {error.includes('delete_repo') && (
                  <div className="pt-2">
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo,delete_repo&description=GitMigrate+Mirror+Migration"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-900 border border-red-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-red-800 transition"
                    >
                      <span>Update Token with `delete_repo` Scope on GitHub</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400/60 hover:text-red-300 ml-2 text-xs"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Search, Filter & Bulk Actions Bar */}
        <div className="px-6 py-3 space-y-3 shrink-0 border-b border-[#1A1A1A]">
          {/* Top Row: Search & Refresh */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <input
                type="text"
                placeholder="Search all repositories by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border-2 border-[#222222] bg-[#050505] pl-10 pr-4 py-2 text-xs text-white placeholder:text-white/30 focus:border-[#F27D26] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Sort selector */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="Sort repositories by"
                className="rounded-xl border border-[#262626] bg-[#141414] px-3 py-2 text-xs text-white/80 focus:border-[#F27D26] focus:outline-none cursor-pointer"
              >
                <option value="updated-desc">Sort: Recently Updated</option>
                <option value="name-asc">Sort: Name (A-Z)</option>
                <option value="name-desc">Sort: Name (Z-A)</option>
                <option value="size-desc">Sort: Size (Largest)</option>
              </select>

              <button
                onClick={fetchRepos}
                disabled={isLoading}
                title="Reload all repositories from GitHub"
                className="flex items-center gap-1.5 rounded-xl border border-[#262626] bg-[#141414] px-3 py-2 text-xs font-bold text-white/80 hover:border-[#F27D26] hover:text-white transition disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-[#F27D26]' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Second Row: Filters & Selection & Bulk Delete Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Visibility filter pills */}
            <div className="flex items-center gap-1.5">
              {(['all', 'public', 'private', 'forks'] as FilterVisibility[]).map((tab) => {
                const count =
                  tab === 'all'
                    ? repos.length
                    : tab === 'public'
                    ? repos.filter((r) => !r.private).length
                    : tab === 'private'
                    ? repos.filter((r) => r.private).length
                    : repos.filter((r) => r.fork).length;

                return (
                  <button
                    key={tab}
                    onClick={() => setVisibilityFilter(tab)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${
                      visibilityFilter === tab
                        ? 'bg-[#F27D26] text-black'
                        : 'bg-[#141414] text-white/60 hover:text-white border border-[#222222]'
                    }`}
                  >
                    {tab} ({count})
                  </button>
                );
              })}
            </div>

            {/* Quick Bulk Delete Actions */}
            <div className="flex items-center gap-2 ml-auto">
              {/* Delete Selected Button */}
              <button
                onClick={openBulkDeleteSelected}
                disabled={selectedNames.size === 0 || isLoading}
                className="flex items-center gap-1.5 rounded-xl border border-red-800 bg-red-950/40 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-red-300 hover:bg-red-900/60 hover:text-white transition disabled:opacity-30 disabled:pointer-events-none"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                <span>Delete Selected ({selectedNames.size})</span>
              </button>

              {/* Delete ALL Repos Button */}
              <button
                onClick={openBulkDeleteAll}
                disabled={repos.length === 0 || isLoading}
                className="flex items-center gap-1.5 rounded-xl border-2 border-red-700 bg-red-600 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-white hover:bg-red-500 transition shadow-lg shadow-red-600/20 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Trash2 className="h-3.5 w-3.5 text-white" />
                <span>Delete All Repositories ({repos.length})</span>
              </button>
            </div>
          </div>

          {/* Selection Status Bar */}
          <div className="flex items-center justify-between bg-[#080808] border border-[#1A1A1A] rounded-xl px-3 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleSelectAllVisible}
                disabled={filteredRepos.length === 0}
                className="text-white/70 hover:text-white flex items-center gap-1.5 transition"
              >
                {isAllVisibleSelected ? (
                  <CheckSquare className="h-4 w-4 text-[#F27D26]" />
                ) : isSomeVisibleSelected ? (
                  <MinusSquare className="h-4 w-4 text-[#F27D26]" />
                ) : (
                  <Square className="h-4 w-4 text-white/30" />
                )}
                <span className="font-semibold text-[11px] uppercase tracking-wider">
                  {isAllVisibleSelected ? 'Deselect Visible' : 'Select Visible'}
                </span>
              </button>

              <span className="text-white/20">|</span>

              <button
                onClick={handleSelectAllInAccount}
                disabled={repos.length === 0}
                className="text-[11px] text-white/50 hover:text-[#F27D26] uppercase font-bold transition"
              >
                Select All ({repos.length})
              </button>

              {selectedNames.size > 0 && (
                <>
                  <span className="text-white/20">•</span>
                  <button
                    onClick={handleDeselectAll}
                    className="text-[11px] text-white/50 hover:text-red-400 uppercase font-bold transition"
                  >
                    Clear Selection
                  </button>
                </>
              )}
            </div>

            <div className="text-[11px] font-mono text-white/60">
              <span className="text-[#F27D26] font-bold">{selectedNames.size}</span> of{' '}
              <span className="text-white font-bold">{repos.length}</span> selected
            </div>
          </div>
        </div>

        {/* Repositories Scrollable List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2.5 min-h-[220px]">
          {isLoading && repos.length === 0 ? (
            <div className="py-16 text-center text-xs text-white/40 space-y-3">
              <RefreshCw className="h-7 w-7 animate-spin mx-auto text-[#F27D26]" />
              <p className="font-medium text-white/70">Scanning GitHub account for all repositories...</p>
              <p className="text-[11px] text-white/40 font-light">Paginating through your entire repository catalog</p>
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="py-16 text-center text-xs text-white/40 space-y-1">
              <FolderGit2 className="h-10 w-10 mx-auto text-white/20 mb-2" />
              <p className="text-white/70 font-bold text-sm">No repositories found</p>
              {searchQuery ? (
                <p className="text-[11px]">No repositories matched filter "{searchQuery}"</p>
              ) : (
                <p className="text-[11px]">Your destination GitHub account has no repositories in this category.</p>
              )}
            </div>
          ) : (
            filteredRepos.map((repo) => {
              const isSelected = selectedNames.has(repo.name);
              const isConfirmingSingle = singleConfirmName === repo.name;
              const isDeletingSingle = singleDeletingName === repo.name;

              return (
                <div
                  key={repo.id}
                  className={`rounded-xl border-2 p-3 transition ${
                    isConfirmingSingle
                      ? 'border-red-600 bg-red-950/20'
                      : isSelected
                      ? 'border-[#F27D26]/70 bg-[#16100A]'
                      : 'border-[#1C1C1C] bg-[#050505] hover:border-[#2C2C2C]'
                  }`}
                >
                  <div className="flex items-start sm:items-center justify-between gap-3">
                    {/* Left: Checkbox & Repo Info */}
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <button
                        onClick={() => handleToggleSelect(repo.name)}
                        className="mt-0.5 sm:mt-0 text-white/40 hover:text-white transition shrink-0"
                        title={isSelected ? 'Deselect repository' : 'Select repository'}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-[#F27D26]" />
                        ) : (
                          <Square className="h-4 w-4 text-white/30" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-black text-white hover:text-[#F27D26] transition flex items-center gap-1 font-mono truncate"
                          >
                            <span>{repo.name}</span>
                            <ExternalLink className="h-2.5 w-2.5 text-white/40 shrink-0" />
                          </a>

                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              repo.private
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-[#16100A] text-[#F27D26] border border-[#F27D26]/30'
                            }`}
                          >
                            {repo.private ? 'Private' : 'Public'}
                          </span>

                          {repo.fork && (
                            <span className="bg-[#141414] text-white/40 text-[9px] px-1.5 py-0.5 rounded border border-[#222222]">
                              Fork
                            </span>
                          )}

                          <span className="text-[10px] text-white/30 font-mono">
                            {repo.size > 0 ? `${(repo.size / 1024).toFixed(1)} MB` : '<1 MB'}
                          </span>
                        </div>

                        {repo.description && (
                          <p className="text-[11px] text-white/40 truncate font-light mt-0.5">{repo.description}</p>
                        )}
                        <p className="text-[10px] text-white/30 font-mono mt-0.5">
                          Updated {new Date(repo.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Right: Individual Deletion Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-center">
                      {isConfirmingSingle ? (
                        <div className="flex items-center gap-1.5 animate-in fade-in">
                          <span className="text-[10px] font-black uppercase text-red-400 hidden sm:inline">
                            Confirm Delete?
                          </span>
                          <button
                            onClick={() => handleSingleDelete(repo.name)}
                            disabled={isDeletingSingle}
                            className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white hover:bg-red-500 disabled:opacity-50 transition shadow-lg shadow-red-600/30"
                          >
                            {isDeletingSingle ? (
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
                            onClick={() => setSingleConfirmName(null)}
                            disabled={isDeletingSingle}
                            className="rounded-lg border border-[#333333] bg-[#141414] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-white transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setError(null);
                            setSingleConfirmName(repo.name);
                          }}
                          className="flex items-center gap-1 rounded-lg border border-red-900/60 bg-red-950/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-900/50 hover:text-red-300 transition"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer & Scope Notice */}
        <div className="border-t border-[#1F1F1F] px-6 py-3.5 bg-[#0A0A0A] shrink-0 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <Lock className="h-3.5 w-3.5 text-[#F27D26] shrink-0" />
              <span>
                Showing <strong className="text-white font-mono">{repos.length}</strong> repositories on destination
                account.
              </span>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,delete_repo&description=GitMigrate+Mirror+Migration"
                target="_blank"
                rel="noreferrer"
                className="text-[#F27D26] hover:underline font-bold text-[10px] ml-1 inline-flex items-center gap-0.5"
              >
                <span>Requires `delete_repo` token scope</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={onClose}
                className="rounded-xl border border-[#262626] bg-[#141414] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#202020] transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* BULK DELETION CONFIRMATION & LIVE PROGRESS MODAL OVERLAY */}
        {/* ============================================================ */}
        {bulkConfirmOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-2xl border-2 border-red-700 bg-[#0E0E0E] p-6 shadow-2xl space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-950 border border-red-700 text-red-400">
                  <AlertTriangle className="h-5 w-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Confirm Bulk Repository Deletion
                  </h3>
                  <p className="text-xs text-red-400 font-semibold">
                    Irreversible action: This permanently deletes {bulkTargetRepos.length} repositories from GitHub.
                  </p>
                </div>
              </div>

              {!bulkProgress?.isRunning ? (
                <>
                  <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-xs text-red-200 space-y-2">
                    <p className="leading-relaxed">
                      You are about to permanently delete <strong>{bulkTargetRepos.length}</strong> repositories under{' '}
                      <span className="font-mono font-bold text-white">@{activeOwner}</span>.
                    </p>
                    <p className="text-[11px] text-white/60">
                      All branches, commits, release tags, and settings will be permanently wiped from GitHub.
                    </p>
                  </div>

                  {/* Target Repos List */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-wider text-white/50">
                      Repositories to be deleted ({bulkTargetRepos.length}):
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-[#242424] bg-[#050505] p-2 space-y-1">
                      {bulkTargetRepos.map((name) => (
                        <div key={name} className="flex items-center justify-between text-xs font-mono text-white/80 px-2 py-1 rounded bg-[#0E0E0E]">
                          <span>{name}</span>
                          <span className="text-[10px] text-red-400 uppercase font-bold">To Delete</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Typing confirmation */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs text-white/70 block">
                      Type <strong className="text-red-400 font-mono">DELETE</strong> or your username{' '}
                      <strong className="text-red-400 font-mono">{activeOwner || 'DELETE'}</strong> to confirm:
                    </label>
                    <input
                      type="text"
                      placeholder="Type DELETE to confirm"
                      value={bulkConfirmInput}
                      onChange={(e) => setBulkConfirmInput(e.target.value)}
                      className="w-full rounded-xl border-2 border-red-900/60 bg-[#050505] px-3 py-2 text-xs font-mono text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => {
                        setBulkConfirmOpen(false);
                        setBulkProgress(null);
                      }}
                      className="rounded-xl border border-[#333333] bg-[#141414] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white transition"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={executeBulkDelete}
                      disabled={
                        bulkConfirmInput.trim().toUpperCase() !== 'DELETE' &&
                        bulkConfirmInput.trim() !== activeOwner
                      }
                      className="flex items-center gap-1.5 rounded-xl border-2 border-red-600 bg-red-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-red-500 transition shadow-lg shadow-red-600/30 disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Permanently Delete {bulkTargetRepos.length} Repositories</span>
                    </button>
                  </div>
                </>
              ) : (
                /* LIVE EXECUTION PROGRESS */
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white font-bold flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                        <span>
                          Deleting repository {bulkProgress.current} of {bulkProgress.total}...
                        </span>
                      </span>
                      <span className="font-mono text-red-400 font-bold">
                        {Math.round((bulkProgress.current / bulkProgress.total) * 100)}%
                      </span>
                    </div>

                    <div className="h-2 w-full rounded-full bg-[#1A1A1A] overflow-hidden">
                      <div
                        className="h-full bg-red-600 transition-all duration-300"
                        style={{
                          width: `${(bulkProgress.current / bulkProgress.total) * 100}%`,
                        }}
                      />
                    </div>

                    <div className="text-xs font-mono text-white/60 truncate">
                      Current: <strong className="text-white">{bulkProgress.currentRepo}</strong>
                    </div>
                  </div>

                  {/* Real-time Result List */}
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-[#242424] bg-[#050505] p-2 space-y-1 text-xs font-mono">
                    {bulkProgress.results.map((r) => (
                      <div
                        key={r.name}
                        className={`flex items-center justify-between px-2.5 py-1 rounded ${
                          r.success ? 'bg-emerald-950/20 text-emerald-300' : 'bg-red-950/30 text-red-300'
                        }`}
                      >
                        <span className="truncate">{r.name}</span>
                        {r.success ? (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold uppercase">
                            <Check className="h-3 w-3" /> Deleted
                          </span>
                        ) : (
                          <span
                            className="flex items-center gap-1 text-[10px] text-red-400 font-bold uppercase"
                            title={r.error}
                          >
                            <AlertCircle className="h-3 w-3" /> Failed
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {!bulkProgress.isRunning && (
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => {
                          setBulkConfirmOpen(false);
                          setBulkProgress(null);
                        }}
                        className="rounded-xl border border-[#333333] bg-[#141414] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#222222] transition"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
