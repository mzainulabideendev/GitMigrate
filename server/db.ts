import fs from 'fs';
import path from 'path';
import { MigrationJob, MigrationLogEntry, DestinationUserSession } from './types.js';

interface DatabaseSchema {
  jobs: Record<string, MigrationJob>;
  logs: MigrationLogEntry[];
  sessions: Record<string, DestinationUserSession>;
  reports: Record<string, { markdown: string; json: any; generatedAt: string }>;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

class DatabaseStore {
  private data: DatabaseSchema = {
    jobs: {},
    logs: [],
    sessions: {},
    reports: {},
  };
  private isLoaded = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          jobs: parsed.jobs || {},
          logs: parsed.logs || [],
          sessions: parsed.sessions || {},
          reports: parsed.reports || {},
        };
      }
      this.isLoaded = true;
    } catch (err) {
      console.error('[DB] Failed to load database from disk, initializing fresh:', err);
      this.data = { jobs: {}, logs: [], sessions: {}, reports: {} };
      this.isLoaded = true;
    }
  }

  private scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.persistToDisk();
    }, 200);
  }

  private persistToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[DB] Error writing to disk:', err);
    }
  }

  // Jobs
  public getJob(id: string): MigrationJob | null {
    return this.data.jobs[id] || null;
  }

  public listJobs(): MigrationJob[] {
    return Object.values(this.data.jobs).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public saveJob(job: MigrationJob): MigrationJob {
    this.data.jobs[job.id] = job;
    this.scheduleSave();
    return job;
  }

  public updateJob(id: string, update: Partial<MigrationJob>): MigrationJob | null {
    const existing = this.data.jobs[id];
    if (!existing) return null;
    const updated = { ...existing, ...update };
    this.data.jobs[id] = updated;
    this.scheduleSave();
    return updated;
  }

  // Logs
  public addLog(log: MigrationLogEntry) {
    this.data.logs.push(log);
    // Keep max 5000 logs in memory/disk to prevent unbounded growth
    if (this.data.logs.length > 5000) {
      this.data.logs = this.data.logs.slice(-4000);
    }
    this.scheduleSave();
  }

  public getLogsForJob(jobId: string, limit = 500): MigrationLogEntry[] {
    return this.data.logs
      .filter((l) => l.jobId === jobId)
      .slice(-limit);
  }

  // Sessions
  public setSession(sessionId: string, session: DestinationUserSession) {
    this.data.sessions[sessionId] = session;
    this.scheduleSave();
  }

  public getSession(sessionId: string): DestinationUserSession | null {
    return this.data.sessions[sessionId] || null;
  }

  public clearSession(sessionId: string) {
    delete this.data.sessions[sessionId];
    this.scheduleSave();
  }

  // Reports
  public saveReport(jobId: string, report: { markdown: string; json: any }) {
    this.data.reports[jobId] = {
      ...report,
      generatedAt: new Date().toISOString(),
    };
    this.scheduleSave();
  }

  public getReport(jobId: string) {
    return this.data.reports[jobId] || null;
  }
}

export const db = new DatabaseStore();
