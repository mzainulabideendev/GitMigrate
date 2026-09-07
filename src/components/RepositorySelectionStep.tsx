import React, { useState, useMemo } from 'react';
import { Search, Filter, ArrowRight, ArrowLeft, CheckSquare, Square, Star, GitFork, BookOpen, Tag, GitBranch, ShieldCheck } from 'lucide-react';
import { GitHubPublicRepo, SourceUserProfile } from '../types';

interface RepositorySelectionStepProps {
  sourceProfile: SourceUserProfile;
  repositories: GitHubPublicRepo[];
  selectedRepoIds: Set<number>;
  onToggleRepo: (id: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBack: () => void;
  onContinue: () => void;
}

export const RepositorySelectionStep: React.FC<RepositorySelectionStepProps> = ({
  sourceProfile,
  repositories,
  selectedRepoIds,
  onToggleRepo,
  onSelectAll,
  onDeselectAll,
  onBack,
  onContinue,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'stars' | 'name' | 'size'>('updated');

  // Extract unique languages
  const languages = useMemo(() => {
    const langs = new Set<string>();
    repositories.forEach((r) => {
      if (r.language) langs.add(r.language);
    });
    return Array.from(langs).sort();
  }, [repositories]);

  // Filter & sort
  const filteredRepos = useMemo(() => {
    return repositories
      .filter((repo) => {
        const matchesSearch =
          repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesLang = selectedLanguage === 'all' || repo.language === selectedLanguage;
        return matchesSearch && matchesLang;
      })
      .sort((a, b) => {
        if (sortBy === 'stars') return (b.stargazers_count || 0) - (a.stargazers_count || 0);
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
        return new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime();
      });
  }, [repositories, searchQuery, selectedLanguage, sortBy]);

  const allFilteredSelected = filteredRepos.length > 0 && filteredRepos.every((r) => selectedRepoIds.has(r.id));

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1A1A1A] pb-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#F27D26] mb-1">
            <span>Source Catalog</span>
            <span>•</span>
            <span className="font-mono">@{sourceProfile.login}</span>
          </div>
          <h2 className="text-3xl font-black tracking-tighter uppercase text-white">
            Select Repositories
          </h2>
          <p className="text-xs text-white/50 font-light mt-1">
            {repositories.length} public repositories discovered from public GitHub records.
          </p>
        </div>

        {/* Migrate all shortcut */}
        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAll}
            className="flex items-center gap-2 rounded-xl border border-[#262626] bg-[#141414] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[#F27D26] hover:border-[#F27D26] hover:bg-[#1A130D] transition shadow-md"
          >
            <CheckSquare className="h-4 w-4 stroke-[2.5]" />
            <span>Migrate All ({repositories.length})</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
        <div className="sm:col-span-6 relative">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-white/40" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border-2 border-[#1F1F1F] bg-[#0E0E0E] pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:border-[#F27D26] focus:outline-none font-mono"
          />
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="w-full rounded-xl border-2 border-[#1F1F1F] bg-[#0E0E0E] px-3 py-2.5 text-xs font-medium text-white/80 focus:border-[#F27D26] focus:outline-none"
          >
            <option value="all">All Languages ({repositories.length})</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full rounded-xl border-2 border-[#1F1F1F] bg-[#0E0E0E] px-3 py-2.5 text-xs font-medium text-white/80 focus:border-[#F27D26] focus:outline-none"
          >
            <option value="updated">Sort by: Recently Pushed</option>
            <option value="stars">Sort by: Most Stars</option>
            <option value="name">Sort by: Name (A-Z)</option>
            <option value="size">Sort by: Size</option>
          </select>
        </div>
      </div>

      {/* Select / Deselect actions */}
      <div className="flex items-center justify-between text-xs text-white/50 px-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (allFilteredSelected) {
                onDeselectAll();
              } else {
                onSelectAll();
              }
            }}
            className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-bold uppercase tracking-wider transition"
          >
            {allFilteredSelected ? (
              <>
                <CheckSquare className="h-4 w-4 text-[#F27D26] stroke-[2.5]" />
                <span>Deselect All</span>
              </>
            ) : (
              <>
                <Square className="h-4 w-4 text-white/40" />
                <span>Select All Filtered ({filteredRepos.length})</span>
              </>
            )}
          </button>
        </div>

        <div className="font-black text-xs uppercase tracking-wider text-[#F27D26]">
          {selectedRepoIds.size} of {repositories.length} selected
        </div>
      </div>

      {/* Repository Cards Grid */}
      {filteredRepos.length === 0 ? (
        <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-12 text-center text-white/50">
          <BookOpen className="mx-auto h-8 w-8 text-white/30 mb-2" />
          <p className="text-sm font-light">No public repositories match your filter criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRepos.map((repo) => {
            const isSelected = selectedRepoIds.has(repo.id);

            return (
              <div
                key={repo.id}
                onClick={() => onToggleRepo(repo.id)}
                className={`relative flex flex-col justify-between rounded-2xl border-2 p-5 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-[#F27D26] bg-[#140E08] shadow-lg shadow-[#F27D26]/10'
                    : 'border-[#1A1A1A] bg-[#0E0E0E] hover:border-[#2E2E2E]'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-white/40 hover:text-[#F27D26]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleRepo(repo.id);
                    }}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-5 w-5 text-[#F27D26] stroke-[2.5]" />
                    ) : (
                      <Square className="h-5 w-5 text-white/30" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-white uppercase tracking-tight truncate">{repo.name}</span>
                      <span className="rounded bg-[#1A1A1A] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white/60">
                        {repo.visibility}
                      </span>
                    </div>

                    <p className="text-xs text-white/60 line-clamp-2 leading-relaxed font-light">
                      {repo.description || 'No description provided.'}
                    </p>
                  </div>
                </div>

                {/* Footer metadata */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#1C1C1C] pt-3 text-[11px] text-white/40">
                  <div className="flex items-center gap-3">
                    {repo.language && (
                      <span className="flex items-center gap-1.5 text-white/70 font-medium">
                        <span className="h-2 w-2 rounded-full bg-[#F27D26]" />
                        {repo.language}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-400" />
                      {repo.stargazers_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <GitFork className="h-3 w-3" />
                      {repo.forks_count}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono">
                    <span>{repo.default_branch}</span>
                    <span>•</span>
                    <span>{(repo.size / 1024).toFixed(1)} MB</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky Bottom Actions Bar */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between rounded-2xl border-2 border-[#242424] bg-[#0A0A0A]/95 p-4 backdrop-blur-md shadow-2xl">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl border border-[#262626] bg-[#141414] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white/80 hover:border-[#F27D26] hover:text-white transition"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>Change Source</span>
        </button>

        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-white/60 hidden sm:inline uppercase tracking-wider">
            <strong className="text-[#F27D26] font-black">{selectedRepoIds.size}</strong> of {repositories.length} selected
          </span>

          <button
            onClick={onContinue}
            disabled={selectedRepoIds.size === 0}
            className="flex items-center gap-2 rounded-xl bg-[#F27D26] px-7 py-3 text-xs font-black uppercase tracking-wider text-black shadow-xl shadow-[#F27D26]/20 hover:bg-[#ff8e38] disabled:opacity-40 transition"
          >
            <span>Connect Destination Account</span>
            <ArrowRight className="h-4 w-4 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
