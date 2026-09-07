import React from 'react';
import { GitBranch, ShieldCheck, History, BookOpen, LogOut, CheckCircle2, User, Key, FolderGit2, Trash2 } from 'lucide-react';
import { MigrationStep, DestinationUser } from '../types';

interface HeaderProps {
  currentStep: MigrationStep;
  onStepClick: (step: MigrationStep) => void;
  destinationUser: DestinationUser | null;
  onLogout: () => void;
  onOpenHistory: () => void;
  onOpenDocs: () => void;
  onOpenRepoManager?: () => void;
  onOpenUpdateKey?: () => void;
  canNavigateTo: (step: MigrationStep) => boolean;
}

const steps: { key: MigrationStep; label: string; number: number }[] = [
  { key: 'source', label: 'Source Account', number: 1 },
  { key: 'selection', label: 'Repositories', number: 2 },
  { key: 'destination', label: 'Destination', number: 3 },
  { key: 'preflight', label: 'Preflight & Map', number: 4 },
  { key: 'dashboard', label: 'Migration', number: 5 },
  { key: 'report', label: 'Report', number: 6 },
];

export const Header: React.FC<HeaderProps> = ({
  currentStep,
  onStepClick,
  destinationUser,
  onLogout,
  onOpenHistory,
  onOpenDocs,
  onOpenRepoManager,
  onOpenUpdateKey,
  canNavigateTo,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-[#1A1A1A] bg-[#0A0A0A]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F27D26] text-black shadow-lg shadow-[#F27D26]/25 font-black">
            <GitBranch className="h-5 w-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tighter uppercase text-white">GitMigrate</span>
              <span className="rounded bg-[#161616] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-[#F27D26] border border-[#2A2A2A]">
                Public Mirror
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/40">Zero-credential migration engine</p>
          </div>
        </div>

        {/* Stepper (Desktop) */}
        <nav className="hidden lg:flex items-center gap-1 bg-[#111111] p-1 rounded-xl border border-[#1A1A1A]">
          {steps.map((step) => {
            const isActive = currentStep === step.key;
            const isClickable = canNavigateTo(step.key);

            return (
              <button
                key={step.key}
                disabled={!isClickable}
                onClick={() => onStepClick(step.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                  isActive
                    ? 'bg-[#F27D26] text-black shadow-md shadow-[#F27D26]/25 font-black'
                    : isClickable
                    ? 'text-white/60 hover:text-white hover:bg-[#1A1A1A]'
                    : 'text-white/20 cursor-not-allowed'
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-black ${
                    isActive ? 'bg-black/20 text-black' : 'bg-[#1C1C1C] text-white/40'
                  }`}
                >
                  {step.number}
                </span>
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Docs button */}
          <button
            onClick={onOpenDocs}
            title="System Architecture & Documentation"
            className="flex items-center gap-1.5 rounded-lg border border-[#222222] bg-[#111111] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/80 hover:border-[#F27D26] hover:text-white transition"
          >
            <BookOpen className="h-3.5 w-3.5 text-[#F27D26]" />
            <span className="hidden sm:inline">Docs</span>
          </button>

          {/* History button */}
          <button
            onClick={onOpenHistory}
            title="View Past Migration Jobs"
            className="flex items-center gap-1.5 rounded-lg border border-[#222222] bg-[#111111] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/80 hover:border-[#F27D26] hover:text-white transition"
          >
            <History className="h-3.5 w-3.5 text-[#F27D26]" />
            <span className="hidden sm:inline">History</span>
          </button>

          {/* Destination Connection Badge */}
          {destinationUser ? (
            <div className="flex items-center gap-2">
              {onOpenRepoManager && (
                <button
                  onClick={onOpenRepoManager}
                  title="Manage & Delete Destination Repositories"
                  className="flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/30 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-900/50 hover:text-white transition"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  <span className="hidden sm:inline">Delete Repos</span>
                </button>
              )}

              {/* Update Access Key Button */}
              {onOpenUpdateKey && (
                <button
                  onClick={onOpenUpdateKey}
                  title="Update or change destination Access Key / Personal Access Token"
                  className="flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#141414] px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white/90 hover:border-[#F27D26] hover:text-[#F27D26] transition"
                >
                  <Key className="h-3.5 w-3.5 text-[#F27D26]" />
                  <span className="hidden md:inline">Update Key</span>
                </button>
              )}

              <div className="flex items-center gap-2 rounded-lg border border-[#F27D26]/40 bg-[#16100A] px-2.5 py-1 text-xs">
                <img
                  src={destinationUser.avatar_url}
                  alt={destinationUser.login}
                  className="h-5 w-5 rounded-full ring-2 ring-[#F27D26]"
                  referrerPolicy="no-referrer"
                />
                <span className="font-bold text-[#F27D26] hidden sm:inline text-xs tracking-tight">@{destinationUser.login}</span>
                <button
                  onClick={onLogout}
                  title="Log out and disconnect destination account"
                  className="ml-1 text-white/40 hover:text-red-400 transition flex items-center gap-1 pl-1 border-l border-[#2E2014]"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold text-red-400 hidden lg:inline">Log out</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onStepClick('destination')}
              className="flex items-center gap-1.5 rounded-lg bg-[#F27D26] px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-black hover:bg-[#ff8e38] transition shadow-lg shadow-[#F27D26]/20"
            >
              <Key className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Connect Token</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
