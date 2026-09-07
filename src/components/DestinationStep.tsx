import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, Key, ArrowRight, ArrowLeft, AlertCircle, ExternalLink, RefreshCw, Lock, Trash2, FolderGit2, LogOut, Edit3 } from 'lucide-react';
import { DestinationUser } from '../types';

interface DestinationStepProps {
  destinationUser: DestinationUser | null;
  onConnectToken: (token: string) => Promise<void>;
  onRefreshSession: () => Promise<void>;
  onLogout: () => Promise<void>;
  onBack: () => void;
  onContinue: () => void;
  onOpenRepoManager?: () => void;
}

export const DestinationStep: React.FC<DestinationStepProps> = ({
  destinationUser,
  onConnectToken,
  onLogout,
  onBack,
  onContinue,
  onOpenRepoManager,
}) => {
  const [patToken, setPatToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  const handlePatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUpdateSuccess(null);
    const token = patToken.trim();
    if (!token) {
      setError('Please enter a GitHub Personal Access Token.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConnectToken(token);
      setPatToken('');
      setUpdateSuccess('Token updated and verified successfully!');
      setShowUpdateForm(false);
      // If user was not previously connected, automatically proceed
      if (!destinationUser) {
        onContinue();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate with GitHub Personal Access Token.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoutClick = async () => {
    if (confirm('Are you sure you want to log out and disconnect this destination account?')) {
      await onLogout();
      setShowUpdateForm(false);
      setError(null);
      setUpdateSuccess(null);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto py-2">
      {/* Header */}
      <div className="text-center space-y-3">
        <h2 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase text-white">
          Destination Account<br />
          <span className="text-[#F27D26]">Access Token Setup.</span>
        </h2>
        <div className="h-[2px] w-16 bg-[#F27D26] mx-auto"></div>
        <p className="text-xs text-white/50 max-w-xl mx-auto font-light leading-relaxed">
          Provide a GitHub Personal Access Token (PAT) for the destination account. The token is used to provision new repositories and mirror push branches, tags, and commits.
        </p>
      </div>

      {/* Connected State */}
      {destinationUser ? (
        <div className="rounded-2xl border-2 border-[#F27D26]/60 bg-[#0E0E0E] p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src={destinationUser.avatar_url}
                alt={destinationUser.login}
                className="h-16 w-16 rounded-xl border-2 border-[#F27D26] ring-4 ring-[#F27D26]/20"
                referrerPolicy="no-referrer"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[#F27D26] bg-[#16100A] border border-[#F27D26]/40 px-2.5 py-0.5 rounded">
                    Active Destination Account
                  </span>
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight mt-1">@{destinationUser.login}</h3>
                {destinationUser.name && <p className="text-xs text-white/50 font-light">{destinationUser.name}</p>}
              </div>
            </div>

            {/* Account Quick Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowUpdateForm(!showUpdateForm);
                  setError(null);
                  setUpdateSuccess(null);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#161616] px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:border-[#F27D26] hover:text-[#F27D26] transition"
              >
                <Key className="h-3.5 w-3.5 text-[#F27D26]" />
                <span>{showUpdateForm ? 'Hide Token Form' : 'Update Access Key'}</span>
              </button>

              <button
                type="button"
                onClick={handleLogoutClick}
                className="flex items-center gap-1.5 rounded-xl border border-red-900/50 bg-red-950/30 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-900/50 hover:text-white transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </div>

          {/* Update Token Box if toggled */}
          {showUpdateForm && (
            <div className="rounded-xl border border-[#F27D26]/40 bg-[#140E08] p-5 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-[#F27D26]" />
                  <span className="text-xs font-black uppercase text-white tracking-wider">Update Destination Access Key</span>
                </div>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,delete_repo&description=GitMigrate+Mirror+Migration"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F27D26] hover:underline"
                >
                  <span>Generate New PAT</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-800/80 bg-red-950/50 p-3 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handlePatSubmit} className="space-y-3">
                <input
                  type="password"
                  placeholder="Paste new GitHub token (ghp_... or github_pat_...)"
                  value={patToken}
                  onChange={(e) => setPatToken(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border-2 border-[#2C241C] bg-[#0A0704] px-4 py-3 text-xs text-white font-mono placeholder:text-white/30 focus:border-[#F27D26] focus:outline-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUpdateForm(false)}
                    className="rounded-lg border border-[#333333] px-3 py-1.5 text-xs font-semibold text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !patToken.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-[#F27D26] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-black hover:bg-[#ff8e38] disabled:opacity-40"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <Key className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Save &amp; Verify Token</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {updateSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-800/80 bg-emerald-950/40 p-3 text-xs text-emerald-300 font-bold">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{updateSuccess}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="flex items-center gap-2.5 rounded-xl border-2 border-[#1C1C1C] bg-[#050505] p-3 text-[11px] font-bold uppercase tracking-wider text-white/80">
              <CheckCircle2 className="h-4 w-4 text-[#F27D26] shrink-0 stroke-[2.5]" />
              <span>Token authenticated</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border-2 border-[#1C1C1C] bg-[#050505] p-3 text-[11px] font-bold uppercase tracking-wider text-white/80">
              <CheckCircle2 className="h-4 w-4 text-[#F27D26] shrink-0 stroke-[2.5]" />
              <span>Repository creation</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border-2 border-[#1C1C1C] bg-[#050505] p-3 text-[11px] font-bold uppercase tracking-wider text-white/80">
              <CheckCircle2 className="h-4 w-4 text-[#F27D26] shrink-0 stroke-[2.5]" />
              <span>Git mirror push ready</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#1F1F1F] bg-[#050505] p-3.5 text-xs text-white/50 flex items-center gap-2.5 font-light">
            <Lock className="h-4 w-4 text-[#F27D26] shrink-0 stroke-[2.5]" />
            <span>Personal Access Token is stored securely in an encrypted HTTP-only session cookie and is never displayed or leaked in logs.</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              {onOpenRepoManager && (
                <button
                  type="button"
                  onClick={onOpenRepoManager}
                  className="flex items-center gap-2 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-900/50 hover:text-white transition"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  <span>Manage & Delete Destination Repos</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#1C1C1C]">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 rounded-xl border border-[#262626] bg-[#141414] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white/80 hover:border-[#F27D26] hover:text-white transition"
            >
              <ArrowLeft className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Back to Repositories</span>
            </button>

            <button
              onClick={onContinue}
              className="flex items-center gap-2 rounded-xl bg-[#F27D26] px-7 py-3 text-xs font-black uppercase tracking-wider text-black shadow-xl shadow-[#F27D26]/20 hover:bg-[#ff8e38] transition"
            >
              <span>Continue to Preflight & Mapping</span>
              <ArrowRight className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      ) : (
        /* Token Input Form */
        <div className="rounded-2xl border-2 border-[#1A1A1A] bg-[#0E0E0E] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-[#1C1C1C] pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F27D26]/10 border border-[#F27D26]/30 text-[#F27D26]">
              <Key className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight text-white">GitHub Personal Access Token</h3>
              <p className="text-[11px] text-white/50 font-light">Enter your token to authenticate the destination GitHub account</p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-800/80 bg-red-950/40 p-4 text-xs text-red-300 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-white text-xs">{error}</div>
                <p className="text-[11px] text-white/70 font-light">
                  Please verify that the token has not expired and includes the required <strong className="text-white">repo</strong> scope.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handlePatSubmit} className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
                  Personal Access Token (PAT)
                </label>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,delete_repo&description=GitMigrate+Mirror+Migration"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F27D26] hover:underline"
                >
                  <span>Generate token on GitHub (`repo` + `delete_repo`)</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_..."
                value={patToken}
                onChange={(e) => setPatToken(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-xl border-2 border-[#242424] bg-[#050505] px-4 py-3.5 text-xs text-white font-mono placeholder:text-white/30 focus:border-[#F27D26] focus:outline-none"
              />
            </div>

            {/* Token Scope Guide */}
            <div className="rounded-xl border border-[#1C1C1C] bg-[#050505] p-4 text-xs text-white/50 space-y-2.5 font-light">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#F27D26] shrink-0" />
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">Required Permissions:</span>
              </div>
              <ul className="space-y-1.5 text-[11px] text-white/60 pl-6 list-disc">
                <li>
                  <strong className="text-white">Classic Token:</strong> Select <code className="text-[#F27D26] font-mono font-bold bg-[#141414] px-1 py-0.5 rounded">repo</code> (create & mirror push) and <code className="text-[#F27D26] font-mono font-bold bg-[#141414] px-1 py-0.5 rounded">delete_repo</code> (allows deleting unwanted repositories).
                </li>
                <li>
                  <strong className="text-white">Fine-grained Token:</strong> Repository permissions &rarr; <code className="text-[#F27D26] font-mono font-bold bg-[#141414] px-1 py-0.5 rounded">Contents: Read and write</code> and <code className="text-[#F27D26] font-mono font-bold bg-[#141414] px-1 py-0.5 rounded">Administration: Read and write</code>.
                </li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !patToken.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#F27D26] px-5 py-4 text-xs font-black uppercase tracking-wider text-black hover:bg-[#ff8e38] disabled:opacity-40 transition shadow-xl shadow-[#F27D26]/20"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-black" />
                  <span>Validating Destination Account...</span>
                </>
              ) : (
                <>
                  <Key className="h-4 w-4 stroke-[2.5]" />
                  <span>Connect Destination Account</span>
                  <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                </>
              )}
            </button>
          </form>

          <div className="flex items-center justify-between pt-4 border-t border-[#1C1C1C]">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/50 hover:text-white transition"
            >
              <ArrowLeft className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Back to Repositories</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
