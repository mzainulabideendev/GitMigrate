# Architecture Overview: GitHub Public Repository Migration Platform

## System Topology & Data Flow

```
[ User Browser (React 19 + Tailwind CSS + Lucide) ]
                      │
                      ▼ HTTP / JSON API & SSE / Polling
[ Express Application Server (Port 3000) ]
  ├── Source Account Discovery Service (GitHub Public REST API v3)
  ├── OAuth & Session Security Manager (GitHub OAuth / Token Handling)
  ├── Destination Management Service (GitHub GraphQL & REST API)
  ├── Migration Orchestrator & Job Queue Engine
  └── Storage Engine (ACID-compliant Relational & Event Store)
                      │
                      ▼ Native Process Execution (Sandboxed & Isolated)
[ Local Worker Subsystem (Isolated /tmp/github-migrations/{jobId}/{repoId}) ]
  ├── Git Mirror Engine (`git clone --mirror` & `git push --mirror`)
  ├── Reference & Commit Verification Engine
  ├── Metadata Sync (Issues, Releases, Wiki)
  └── LFS Inspector & Cleanup Service
```

## Core Subsystems

### 1. Source Account Discovery Engine
- **Zero-Credential Discovery**: Queries `https://api.github.com/users/{username}/repos` with strict page iteration (`per_page=100`).
- **Pagination & Rate-Limit Tracking**: Handles `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` headers.
- **Strict Public Filtering**: Filters out private, fork, or inaccessible repos if encountered; extracts full repository descriptors (size, topics, languages, branch defaults, issue/wiki status).

### 2. Destination Authorization Engine
- **Popup-based GitHub OAuth**: Integrates with GitHub's authorization endpoint `https://github.com/login/oauth/authorize` directly via browser popup to satisfy AI Studio iframe constraints.
- **Token Redaction & Encryption**: Access tokens are kept server-side in memory/secure session cookies (`SameSite=None`, `Secure`, `HttpOnly`) and redacted in logs.
- **Direct PAT Support**: Allows users to provide a fine-grained GitHub Personal Access Token (PAT) with `repo` scope if an OAuth App is not configured.

### 3. Asynchronous Migration Queue & Worker
- **Non-blocking Execution**: Migrations are dispatched to an asynchronous worker queue.
- **State Machine**:
  - Job States: `CREATED`, `PREFLIGHT`, `QUEUED`, `RUNNING`, `PAUSED`, `VERIFYING`, `COMPLETED`, `PARTIAL`, `FAILED`, `CANCELLED`
  - Repository States: `DISCOVERED`, `SELECTED`, `ANALYZING`, `DESTINATION_CREATED`, `CLONING`, `PUSHING`, `VERIFYING`, `METADATA_MIGRATION`, `COMPLETED`, `PARTIAL`, `FAILED`, `SKIPPED`
- **Isolated Storage**: Temporary mirrors are stored under `/tmp/github-migrations/{jobId}/{repoId}` and securely removed after verification.

### 4. Git Mirror & Verification Engine
- Executes true mirror clones (`git clone --mirror <source_url>`) and mirror pushes (`git push --mirror <dest_url>`).
- Completely preserves:
  - Commit SHAs & object graph
  - Historical author & committer timestamps
  - Commit messages & parent trees
  - All branch pointers & annotated/lightweight tags
- Performs post-migration verification by querying git references at both endpoints and comparing HEADs, branch lists, and commit SHAs.
