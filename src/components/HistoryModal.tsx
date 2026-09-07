import React, { useState, useEffect } from 'react';
import { X, History, ArrowRight, CheckCircle2, Clock, RotateCcw, AlertTriangle } from 'lucide-react';
import { MigrationJob } from '../types';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectJob: (job: MigrationJob) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, onSelectJob }) => {
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch('/api/migrations')
        .then((res) => res.json())
        .then((data) => {
          setJobs(data.jobs || []);
        })
        .catch(() => setJobs([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-3xl rounded-3xl border-2 border-[#242424] bg-[#0A0A0A] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#1A1A1A] px-6 py-5">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-[#F27D26] stroke-[2.5]" />
            <h3 className="text-lg font-black uppercase tracking-tight text-white">Previous Migration Jobs</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-white/50 hover:bg-[#1A1A1A] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3.5">
          {loading ? (
            <div className="text-center py-12 text-white/40 text-xs font-mono uppercase tracking-wider">
              Loading migration history...
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 text-white/40 text-xs font-mono uppercase tracking-wider">
              No previous migration jobs recorded yet.
            </div>
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                className="rounded-2xl border-2 border-[#1C1C1C] bg-[#0E0E0E] p-4 hover:border-[#F27D26] transition space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold font-mono">
                    <span className="text-white">@{job.sourceUsername}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-white/30" />
                    <span className="text-[#F27D26]">@{job.destinationUsername}</span>
                  </div>

                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded self-start sm:self-auto ${
                      job.status === 'COMPLETED'
                        ? 'bg-[#16100A] text-[#F27D26] border border-[#F27D26]/40'
                        : job.status === 'PARTIAL'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : job.status === 'RUNNING'
                        ? 'bg-[#16100A] text-[#F27D26] border border-[#F27D26] animate-pulse'
                        : 'bg-[#141414] text-white/50 border border-[#222222]'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/50 pt-1">
                  <div className="flex items-center gap-3 text-[11px] font-mono">
                    <span>{job.totalRepositories} repos</span>
                    <span>•</span>
                    <span className="text-[#F27D26] font-bold">{job.completedRepositories} completed</span>
                    {job.failedRepositories > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-red-400 font-bold">{job.failedRepositories} failed</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                  </div>

                  <button
                    onClick={() => {
                      onSelectJob(job);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-[#F27D26] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-black hover:bg-[#ff8e38] transition shadow"
                  >
                    <span>View Dashboard</span>
                    <ArrowRight className="h-3 w-3 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
