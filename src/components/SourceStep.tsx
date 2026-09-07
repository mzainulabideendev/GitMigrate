import React, { useState } from 'react';
import { Search, ShieldAlert, ArrowRight, CheckCircle2, Lock, GitFork, Star, Users, AlertCircle, RefreshCw, Github } from 'lucide-react';
import { SourceUserProfile, GitHubPublicRepo, DestinationUser } from '../types';

interface SourceStepProps {
  sourceProfile: SourceUserProfile | null;
  repositories: GitHubPublicRepo[];
  isLoading: boolean;
  onScan: (urlOrUsername: string) => Promise<void>;
  onContinue: () => void;
  destinationUser?: DestinationUser | null;
}

export const SourceStep: React.FC<SourceStepProps> = ({
  sourceProfile,
  repositories,
  isLoading,
  onScan,
  onContinue,
  destinationUser,
}) => {
  const [inputUrl, setInputUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!inputUrl.trim()) {
      setError('Please enter a GitHub profile URL or username.');
      return;
    }
    try {
      await onScan(inputUrl.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to discover public repositories.');
    }
  };

  const handleQuickPick = (username: string) => {
    setInputUrl(`https://github.com/${username}`);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto py-4">
      {/* Hero section with Bold Typography theme */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-md border border-[#262626] bg-[#111111] px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#F27D26]">
          <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>True Git Mirror Architecture</span>
        </div>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tighter leading-[0.88] uppercase text-white">
          Migrate Public<br />
          <span className="text-[#F27D26]">Repositories.</span>
        </h1>
        <div className="h-[2px] w-20 bg-[#F27D26] mx-auto"></div>
        <p className="text-sm font-light tracking-wide text-white/70 max-w-2xl mx-auto leading-relaxed">
          Safely discover and mirror all public repositories, commit history, historical timestamps, branches, tags, and metadata to an authorized account without modifying raw Git objects.
        </p>
      </div>

      {/* Security Guarantee Banner */}
      <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F27D26] text-black font-black shadow-md shadow-[#F27D26]/20">
          <Lock className="h-5 w-5 stroke-[2.5]" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Zero-Credential Source Account Scanning</h3>
          <p className="text-xs text-white/60 leading-relaxed font-light">
            Your old GitHub account does <strong className="text-white font-bold">NOT</strong> need to be authenticated. We exclusively query public GitHub API endpoints. We never ask for or store passwords, personal access tokens, or private keys for the source account.
          </p>
        </div>
      </div>

      {/* Destination account status if connected */}
      {destinationUser && (
        <div className="rounded-2xl border-2 border-[#F27D26]/40 bg-[#16100A] p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={destinationUser.avatar_url}
              alt={destinationUser.login}
              className="h-9 w-9 rounded-xl ring-2 ring-[#F27D26]"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white">Authorized Destination:</span>
                <span className="text-xs font-mono font-bold text-[#F27D26]">@{destinationUser.login}</span>
              </div>
              <p className="text-[11px] text-white/60 font-light">
                Scan public repositories below to configure mirrored migration directly to this account.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 rounded bg-[#F27D26]/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#F27D26] border border-[#F27D26]/30 shrink-0">
            <CheckCircle2 className="h-3 w-3 stroke-[2.5]" />
            <span>Ready</span>
          </span>
        </div>
      )}

      {/* Input Card */}
      <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-6 sm:p-8 shadow-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="githubUrl" className="block text-[11px] font-black uppercase tracking-[0.2em] text-white/80 mb-2">
              Old GitHub Profile URL or Username
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-white/40">
                <Search className="h-5 w-5" />
              </div>
              <input
                id="githubUrl"
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://github.com/OLD_USERNAME or @username"
                disabled={isLoading}
                className="block w-full rounded-xl border-2 border-[#242424] bg-[#050505] pl-11 pr-4 py-3.5 text-sm text-white font-mono placeholder:text-white/30 focus:border-[#F27D26] focus:outline-none transition"
              />
            </div>
          </div>

          {/* Quick example picks */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-white/40">
            <span className="font-bold uppercase tracking-wider text-[10px] text-white/50">Quick test profiles:</span>
            {['torvalds', 'shadcn', 'antfu', 'sindresorhus'].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => handleQuickPick(sample)}
                className="rounded border border-[#262626] bg-[#141414] px-2.5 py-1 text-[11px] font-mono font-semibold text-white/80 hover:border-[#F27D26] hover:text-[#F27D26] transition"
              >
                @{sample}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-800/80 bg-red-950/40 p-3.5 text-xs text-red-300 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-[#F27D26] px-5 py-3.5 text-xs font-black uppercase tracking-[0.2em] text-black shadow-xl shadow-[#F27D26]/20 hover:bg-[#ff8e38] focus:outline-none disabled:opacity-40 transition"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-black" />
                  <span>Scanning Public Catalog (Paginating API)...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 stroke-[2.5]" />
                  <span>Scan Public Repositories</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Discovered Account Display */}
      {sourceProfile && (
        <div className="rounded-2xl border-2 border-[#F27D26]/40 bg-[#0E0E0E] p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#1F1F1F] pb-6">
            <div className="flex items-center gap-4">
              <img
                src={sourceProfile.avatar_url}
                alt={sourceProfile.login}
                className="h-16 w-16 rounded-xl border-2 border-[#F27D26] ring-4 ring-[#F27D26]/20"
                referrerPolicy="no-referrer"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black uppercase tracking-tight text-white">{sourceProfile.name || sourceProfile.login}</h2>
                  <span className="text-xs font-bold font-mono text-[#F27D26]">@{sourceProfile.login}</span>
                </div>
                {sourceProfile.bio && <p className="text-xs text-white/60 mt-1 max-w-lg font-light leading-relaxed">{sourceProfile.bio}</p>}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-4xl font-black text-[#F27D26] leading-none">{repositories.length}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 mt-1 font-bold">Public Repositories</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-[#1F1F1F] bg-[#050505] p-3.5">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">Public Repositories Found</div>
              <div className="text-sm font-bold text-white mt-1">{repositories.length} repositories ready to review</div>
            </div>
            <div className="rounded-xl border border-[#1F1F1F] bg-[#050505] p-3.5">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">Private Repositories</div>
              <div className="text-sm font-medium text-white/40 mt-1">Not accessible through public migration mode</div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={onContinue}
              className="flex items-center gap-2 rounded-xl bg-[#F27D26] px-7 py-3 text-xs font-black uppercase tracking-[0.15em] text-black hover:bg-[#ff8e38] transition shadow-lg shadow-[#F27D26]/20"
            >
              <span>Review Repositories</span>
              <ArrowRight className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
