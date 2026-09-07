export type MigrationStep =
  | 'source'
  | 'selection'
  | 'destination'
  | 'preflight'
  | 'dashboard'
  | 'report';

export type MigrationErrorCode =
  | 'GIT_NOT_FOUND'
  | 'GIT_CLONE_FAILED'
  | 'GIT_PUSH_FAILED'
  | 'GIT_AUTH_FAILED'
  | 'GIT_NETWORK_ERROR'
  | 'GIT_LFS_ERROR'
  | 'GIT_DISK_SPACE_ERROR'
  | 'GIT_PERMISSION_ERROR'
  | 'GIT_VERIFICATION_FAILED'
  | 'DESTINATION_REPO_CREATE_FAILED'
  | 'SOURCE_NOT_FOUND'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNKNOWN_ERROR';

export interface GitDiagnostics {
  available: boolean;
  version?: string;
  binaryPath?: string;
  configuredGitPath?: string;
  platform: string;
  nodeVersion: string;
  isPathConfigured: boolean;
  errorCode?: MigrationErrorCode;
  errorMessage?: string;
}

export interface GitHubPublicRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  description: string | null;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  visibility: 'public' | 'private';
  fork: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  size: number;
  language: string | null;
  topics: string[];
  has_issues: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_projects: boolean;
  has_discussions: boolean;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  open_issues_count: number;
}

export interface SourceUserProfile {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  public_repos_count: number;
  followers: number;
}

export interface DestinationUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  email: string | null;
  scopes: string[];
}

export interface RepoMappingConfig {
  sourceId: number;
  sourceName: string;
  destinationName: string;
  visibility: 'public' | 'private';
  collisionAction: 'create' | 'use_existing' | 'skip';
  migrateIssues: boolean;
  migrateReleases: boolean;
  migrateWiki: boolean;
  // Verification info from collision check
  collisionStatus?: 'checking' | 'available' | 'exists' | 'error';
}

export interface MigrationRepoState {
  id: string;
  sourceId: number;
  sourceOwner: string;
  sourceName: string;
  destinationOwner: string;
  destinationName: string;
  sourceUrl: string;
  destinationUrl: string;
  visibility: 'public' | 'private';
  status:
    | 'DISCOVERED'
    | 'SELECTED'
    | 'QUEUED'
    | 'ANALYZING'
    | 'DESTINATION_CREATED'
    | 'CLONING'
    | 'PUSHING'
    | 'VERIFYING'
    | 'METADATA_MIGRATION'
    | 'COMPLETED'
    | 'PARTIAL'
    | 'FAILED'
    | 'SKIPPED';
  currentPhase: string;
  progressPercent: number;
  sourceBranches: number;
  migratedBranches: number;
  sourceTags: number;
  migratedTags: number;
  commitsVerified: boolean;
  commitCount?: number;
  latestCommitDate?: string;
  latestCommitMessage?: string;
  defaultBranch?: string;
  hasLFS: boolean;
  lfsStatus?: 'none' | 'migrated' | 'partial';
  error?: string;
  errorCode?: MigrationErrorCode;
  errorDetails?: string;
  options: {
    migrateIssues: boolean;
    migrateReleases: boolean;
    migrateWiki: boolean;
  };
  verification?: {
    matchedBranches: boolean;
    matchedTags: boolean;
    matchedHead: boolean;
    headCommitSha?: string;
    commitCount?: number;
    latestCommitDate?: string;
    latestCommitMessage?: string;
    details: Array<{
      ref: string;
      sourceSha: string;
      destSha: string;
      match: boolean;
    }>;
  };
  startedAt?: string;
  completedAt?: string;
}

export interface MigrationLogEntry {
  id: string;
  jobId: string;
  repoId?: string;
  repoName?: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  phase: string;
  message: string;
}

export interface MigrationJob {
  id: string;
  sourceUsername: string;
  sourceAvatarUrl?: string;
  destinationUsername: string;
  destinationAvatarUrl?: string;
  status:
    | 'CREATED'
    | 'PREFLIGHT'
    | 'QUEUED'
    | 'RUNNING'
    | 'PAUSED'
    | 'VERIFYING'
    | 'COMPLETED'
    | 'PARTIAL'
    | 'FAILED'
    | 'CANCELLED';
  totalRepositories: number;
  completedRepositories: number;
  failedRepositories: number;
  partialRepositories: number;
  skippedRepositories: number;
  repositories: MigrationRepoState[];
  currentRepoIndex: number;
  overallProgressPercent: number;
  error?: string;
  errorCode?: MigrationErrorCode;
  errorDetails?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
