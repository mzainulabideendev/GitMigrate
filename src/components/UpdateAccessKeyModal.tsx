import React, { useState } from 'react';
import { Key, X, ShieldCheck, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Lock, LogOut } from 'lucide-react';
import { DestinationUser } from '../types';

interface UpdateAccessKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  destinationUser: DestinationUser | null;
  onConnectToken: (token: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

export const UpdateAccessKeyModal: React.FC<UpdateAccessKeyModalProps> = ({
  isOpen,
  onClose,
  destinationUser,
  onConnectToken,
  onLogout,
}) => {
  const [newToken, setNewToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const token = newToken.trim();
    if (!token) {
      setError('Please enter a valid GitHub Personal Access Token.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConnectToken(token);
      setSuccessMessage('Access key successfully updated and verified!');
      setNewToken('');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate token with GitHub.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoutClick = async () => {
    if (confirm('Are you sure you want to log out and disconnect the destination account?')) {
      await onLogout();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border-2 border-[#262626] bg-[#0E0E0E] p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#1C1C1C] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F27D26]/10 border border-[#F27D26]/30 text-[#F27D26]">
              <Key className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight text-white">Update Access Key</h3>
              <p className="text-[11px] text-white/50 font-light">Change or replace your GitHub Personal Access Token</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-[#1C1C1C] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current Active User Profile */}
        {destinationUser && (
          <div className="flex items-center justify-between rounded-xl border border-[#1F1F1F] bg-[#050505] p-3.5">
            <div className="flex items-center gap-3">
              <img
                src={destinationUser.avatar_url}
                alt={destinationUser.login}
                className="h-10 w-10 rounded-lg border border-[#F27D26]"
                referrerPolicy="no-referrer"
              />
              <div>
                <div className="text-xs font-black text-white uppercase">@{destinationUser.login}</div>
                <div className="text-[10px] text-white/50">Currently Connected Account</div>
              </div>
            </div>
            <button
              onClick={handleLogoutClick}
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300 hover:bg-red-900/50 hover:text-white transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-800/80 bg-red-950/40 p-3.5 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-white text-xs">{error}</div>
              <p className="text-[11px] text-white/70">
                Ensure the token has the <strong className="text-white">repo</strong> scope enabled (or &lsquo;Contents: Read and write&rsquo; for fine-grained tokens).
              </p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-800/80 bg-emerald-950/40 p-3.5 text-xs text-emerald-300 font-bold">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
                New Personal Access Token (PAT)
              </label>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,delete_repo&description=GitMigrate+Mirror+Migration"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F27D26] hover:underline"
              >
                <span>Generate New Token</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_..."
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              disabled={isSubmitting}
              autoFocus
              className="w-full rounded-xl border-2 border-[#242424] bg-[#050505] px-4 py-3 text-xs text-white font-mono placeholder:text-white/30 focus:border-[#F27D26] focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-[#1C1C1C] bg-[#050505] p-3.5 text-xs text-white/50 space-y-2 font-light">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#F27D26] shrink-0" />
              <span className="font-bold text-white uppercase tracking-wider text-[10px]">Required Scopes:</span>
            </div>
            <p className="text-[11px] text-white/60">
              For Classic Tokens, select <code className="text-[#F27D26] font-mono font-bold bg-[#141414] px-1 py-0.5 rounded">repo</code>. For Fine-grained Tokens, grant <code className="text-[#F27D26] font-mono font-bold bg-[#141414] px-1 py-0.5 rounded">Contents: Read &amp; write</code>.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#242424] bg-[#141414] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white/70 hover:bg-[#1C1C1C] hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newToken.trim()}
              className="flex items-center gap-2 rounded-xl bg-[#F27D26] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:bg-[#ff8e38] disabled:opacity-40 transition shadow-lg shadow-[#F27D26]/20"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-black" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Key className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Save &amp; Update Key</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
