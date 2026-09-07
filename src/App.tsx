import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { SourceStep } from './components/SourceStep';
import { RepositorySelectionStep } from './components/RepositorySelectionStep';
import { DestinationStep } from './components/DestinationStep';
import { PreflightStep } from './components/PreflightStep';
import { DashboardStep } from './components/DashboardStep';
import { ReportStep } from './components/ReportStep';
import { HistoryModal } from './components/HistoryModal';
import { DocsModal } from './components/DocsModal';
import { DestinationRepoManagerModal } from './components/DestinationRepoManagerModal';
import { UpdateAccessKeyModal } from './components/UpdateAccessKeyModal';
import {
  MigrationStep,
  SourceUserProfile,
  GitHubPublicRepo,
  DestinationUser,
  RepoMappingConfig,
  MigrationJob,
  MigrationLogEntry,
  GitDiagnostics,
} from './types';

export default function App() {
  const [currentStep, setCurrentStep] = useState<MigrationStep>('source');
  const [sourceProfile, setSourceProfile] = useState<SourceUserProfile | null>(null);
  const [repositories, setRepositories] = useState<GitHubPublicRepo[]>([]);
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<number>>(new Set());
  const [destinationUser, setDestinationUser] = useState<DestinationUser | null>(null);
  const [mappings, setMappings] = useState<RepoMappingConfig[]>([]);

  // Migration running state
  const [currentJob, setCurrentJob] = useState<MigrationJob | null>(null);
  const [logs, setLogs] = useState<MigrationLogEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isStartingMigration, setIsStartingMigration] = useState(false);

  // Modals
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isRepoManagerOpen, setIsRepoManagerOpen] = useState(false);
  const [isUpdateKeyOpen, setIsUpdateKeyOpen] = useState(false);

  const [gitHealth, setGitHealth] = useState<GitDiagnostics | null>(null);

  // 1. Initial destination session & Git environment check
  const refreshDestinationSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setDestinationUser(data.user);
      } else {
        setDestinationUser(null);
      }
    } catch {
      setDestinationUser(null);
    }

    try {
      const healthRes = await fetch('/api/health');
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        if (healthData.git) {
          setGitHealth(healthData.git);
        }
      }
    } catch {
      // Non-fatal health fetch failure
    }
  }, []);

  useEffect(() => {
    refreshDestinationSession();
  }, [refreshDestinationSession]);

  // 2. Poll active migration job status and logs
  useEffect(() => {
    if (!currentJob) return;

    // Stop polling if completed, failed, or cancelled unless paused
    const shouldPoll = currentStep === 'dashboard';
    if (!shouldPoll) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/migrations/${currentJob.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.job) {
          setCurrentJob(data.job);
          if (data.logs) {
            setLogs(data.logs);
          }
        }
      } catch (err) {
        console.error('Error polling migration status:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [currentJob?.id, currentStep]);

  // 3. Scan Source Account
  const handleScanSource = async (urlOrUsername: string) => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/source/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlOrUsername }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to scan source account');
      }

      setSourceProfile(data.user);
      setRepositories(data.repositories);
      // Select all discovered repos by default
      const allIds = new Set<number>(data.repositories.map((r: GitHubPublicRepo) => r.id));
      setSelectedRepoIds(allIds);
    } finally {
      setIsScanning(false);
    }
  };

  // 4. Toggle single repository selection
  const handleToggleRepo = (id: number) => {
    const next = new Set(selectedRepoIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedRepoIds(next);
  };

  const handleSelectAll = () => {
    setSelectedRepoIds(new Set(repositories.map((r) => r.id)));
  };

  const handleDeselectAll = () => {
    setSelectedRepoIds(new Set());
  };

  // 5. Connect destination via PAT
  const handleConnectToken = async (token: string) => {
    const res = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to authenticate destination token');
    }

    setDestinationUser(data.user);
  };

  // 6. Logout destination
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setDestinationUser(null);
  };

  // 7. Transition to Preflight: build mappings from selected repos
  const handleProceedToPreflight = () => {
    const selected = repositories.filter((r) => selectedRepoIds.has(r.id));
    if (selected.length === 0) {
      if (!sourceProfile) {
        setCurrentStep('source');
      } else {
        setCurrentStep('selection');
      }
      return;
    }
    const initialMappings: RepoMappingConfig[] = selected.map((r) => ({
      sourceId: r.id,
      sourceName: r.name,
      destinationName: r.name,
      visibility: 'public',
      collisionAction: 'create',
      migrateIssues: Boolean(r.has_issues),
      migrateReleases: true,
      migrateWiki: Boolean(r.has_wiki),
      collisionStatus: 'checking',
    }));
    setMappings(initialMappings);
    setCurrentStep('preflight');
  };

  // 8. Update mapping property
  const handleUpdateMapping = (sourceId: number, update: Partial<RepoMappingConfig>) => {
    setMappings((prev) =>
      prev.map((m) => {
        if (m.sourceId === sourceId) {
          return { ...m, ...update };
        }
        return m;
      })
    );
  };

  // 9. Start Migration
  const handleStartMigration = async () => {
    if (!sourceProfile || !destinationUser) return;
    setIsStartingMigration(true);

    try {
      const res = await fetch('/api/migrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUsername: sourceProfile.login,
          sourceAvatarUrl: sourceProfile.avatar_url,
          mappings,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start migration job');
      }

      setCurrentJob(data.job);
      setLogs([]);
      setCurrentStep('dashboard');
    } catch (err: any) {
      alert(`Migration error: ${err.message}`);
    } finally {
      setIsStartingMigration(false);
    }
  };

  // 10. Dashboard Controls
  const handlePauseJob = async () => {
    if (!currentJob) return;
    await fetch(`/api/migrations/${currentJob.id}/pause`, { method: 'POST' });
    setCurrentJob((prev) => (prev ? { ...prev, status: 'PAUSED' } : null));
  };

  const handleResumeJob = async () => {
    if (!currentJob) return;
    await fetch(`/api/migrations/${currentJob.id}/resume`, { method: 'POST' });
    setCurrentJob((prev) => (prev ? { ...prev, status: 'RUNNING' } : null));
  };

  const handleRetryJob = async (repoId?: string) => {
    if (!currentJob) return;
    const res = await fetch(`/api/migrations/${currentJob.id}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoId }),
    });
    const data = await res.json();
    if (data.job) {
      setCurrentJob(data.job);
    }
  };

  const handleCancelJob = async () => {
    if (!currentJob) return;
    if (!confirm('Are you sure you want to cancel the migration? In-progress repositories will finish cleanly.')) {
      return;
    }
    await fetch(`/api/migrations/${currentJob.id}/cancel`, { method: 'POST' });
    setCurrentJob((prev) => (prev ? { ...prev, status: 'CANCELLED' } : null));
  };

  // Stepper navigation permissions
  const canNavigateTo = (step: MigrationStep): boolean => {
    if (step === 'source') return true;
    if (step === 'selection') return Boolean(sourceProfile && repositories.length > 0);
    if (step === 'destination') return true;
    if (step === 'preflight') return Boolean(sourceProfile && selectedRepoIds.size > 0 && destinationUser);
    if (step === 'dashboard') return Boolean(currentJob);
    if (step === 'report') return Boolean(currentJob && (currentJob.status === 'COMPLETED' || currentJob.status === 'PARTIAL' || currentJob.status === 'FAILED'));
    return false;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col font-sans selection:bg-[#F27D26] selection:text-black">
      {/* Header */}
      <Header
        currentStep={currentStep}
        onStepClick={setCurrentStep}
        destinationUser={destinationUser}
        gitHealth={gitHealth}
        onLogout={handleLogout}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenDocs={() => setIsDocsOpen(true)}
        onOpenRepoManager={() => setIsRepoManagerOpen(true)}
        onOpenUpdateKey={() => setIsUpdateKeyOpen(true)}
        canNavigateTo={canNavigateTo}
      />

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {currentStep === 'source' && (
          <SourceStep
            sourceProfile={sourceProfile}
            repositories={repositories}
            isLoading={isScanning}
            onScan={handleScanSource}
            onContinue={() => setCurrentStep('selection')}
            destinationUser={destinationUser}
          />
        )}

        {currentStep === 'selection' && sourceProfile && (
          <RepositorySelectionStep
            sourceProfile={sourceProfile}
            repositories={repositories}
            selectedRepoIds={selectedRepoIds}
            onToggleRepo={handleToggleRepo}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onBack={() => setCurrentStep('source')}
            onContinue={() => {
              if (!destinationUser) {
                setCurrentStep('destination');
              } else {
                handleProceedToPreflight();
              }
            }}
          />
        )}

        {currentStep === 'destination' && (
          <DestinationStep
            destinationUser={destinationUser}
            onConnectToken={handleConnectToken}
            onRefreshSession={refreshDestinationSession}
            onLogout={handleLogout}
            onBack={() => setCurrentStep('selection')}
            onContinue={handleProceedToPreflight}
            onOpenRepoManager={() => setIsRepoManagerOpen(true)}
          />
        )}

        {currentStep === 'preflight' && sourceProfile && destinationUser && (
          <PreflightStep
            sourceProfile={sourceProfile}
            destinationUser={destinationUser}
            selectedRepos={repositories.filter((r) => selectedRepoIds.has(r.id))}
            mappings={mappings}
            onUpdateMapping={handleUpdateMapping}
            onBack={() => setCurrentStep(destinationUser ? 'selection' : 'destination')}
            onStartMigration={handleStartMigration}
            isStarting={isStartingMigration}
            onOpenRepoManager={() => setIsRepoManagerOpen(true)}
            onOpenUpdateKey={() => setIsUpdateKeyOpen(true)}
          />
        )}

        {currentStep === 'dashboard' && currentJob && (
          <DashboardStep
            job={currentJob}
            logs={logs}
            onPause={handlePauseJob}
            onResume={handleResumeJob}
            onRetry={handleRetryJob}
            onCancel={handleCancelJob}
            onViewReport={() => setCurrentStep('report')}
            onStartNewMigration={() => {
              setCurrentStep('source');
              setSourceProfile(null);
              setRepositories([]);
              setSelectedRepoIds(new Set());
              setCurrentJob(null);
              setLogs([]);
            }}
            onOpenRepoManager={() => setIsRepoManagerOpen(true)}
            onOpenUpdateKey={() => setIsUpdateKeyOpen(true)}
          />
        )}

        {currentStep === 'report' && currentJob && (
          <ReportStep
            job={currentJob}
            onStartNew={() => {
              setCurrentStep('source');
              setSourceProfile(null);
              setRepositories([]);
              setSelectedRepoIds(new Set());
              setCurrentJob(null);
              setLogs([]);
            }}
            onOpenRepoManager={() => setIsRepoManagerOpen(true)}
          />
        )}
      </main>

      {/* Modals */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectJob={(job) => {
          setCurrentJob(job);
          if (job.status === 'COMPLETED') {
            setCurrentStep('report');
          } else {
            setCurrentStep('dashboard');
          }
        }}
      />

      <DocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />

      <DestinationRepoManagerModal
        isOpen={isRepoManagerOpen}
        onClose={() => setIsRepoManagerOpen(false)}
        destinationUser={destinationUser}
        destinationUsername={destinationUser?.login}
      />

      <UpdateAccessKeyModal
        isOpen={isUpdateKeyOpen}
        onClose={() => setIsUpdateKeyOpen(false)}
        destinationUser={destinationUser}
        onConnectToken={handleConnectToken}
        onLogout={handleLogout}
      />

      {/* Footer */}
      <footer className="border-t-2 border-[#1A1A1A] bg-[#0A0A0A] py-6 text-center text-xs text-white/40 font-mono">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="uppercase tracking-widest font-black text-white/60">GitMigrate: GitHub Migration Platform</span>
          <div className="flex items-center gap-4 uppercase tracking-wider text-[11px]">
            <button onClick={() => setIsDocsOpen(true)} className="hover:text-[#F27D26] transition font-bold">
              Architecture & Security Specs
            </button>
            <span>•</span>
            <span className="text-[#F27D26]/70">Zero-Credential Source Mode</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
