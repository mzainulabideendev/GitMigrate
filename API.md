# API Specification: GitHub Public Repository Migration Platform

## REST Endpoints

### 1. Source Discovery
* `POST /api/source/discover`
  - Body: `{ "url": "https://github.com/username" }`
  - Response: `{ "user": { "login": "...", "avatar_url": "..." }, "repositories": [...], "count": 27 }`
  - Validates GitHub username format, prevents SSRF, handles pagination up to all public repositories.

### 2. Destination Authentication & Session
* `GET /api/auth/github/url`
  - Query: `?redirectUri=...`
  - Response: `{ "url": "https://github.com/login/oauth/authorize?client_id=...&scope=repo" }`
* `GET /auth/callback`
  - Handles GitHub OAuth code exchange, stores token securely in HTTP-only cookie, renders postMessage script to notify opener window.
* `POST /api/auth/token`
  - Body: `{ "token": "ghp_..." }`
  - Allows manual connection with a GitHub Personal Access Token (PAT) with `repo` scope.
* `GET /api/auth/session`
  - Response: `{ "authenticated": true, "user": { "login": "newuser", "avatar_url": "...", "scopes": ["repo"] } }`
* `POST /api/auth/logout`
  - Clears destination session.

### 3. Destination Preflight & Collision Check
* `POST /api/destination/check-repo`
  - Body: `{ "repoName": "GameHub" }`
  - Response: `{ "exists": false, "available": true, "fullName": "newuser/GameHub" }`

### 4. Migration Jobs
* `POST /api/migrations`
  - Body:
    ```json
    {
      "sourceUsername": "olduser",
      "repositories": [
        {
          "sourceName": "GameHub",
          "destinationName": "GameHub",
          "visibility": "public",
          "migrateIssues": true,
          "migrateReleases": true,
          "migrateWiki": true
        }
      ]
    }
    ```
  - Response: `{ "jobId": "uuid-...", "status": "QUEUED" }`
* `GET /api/migrations`
  - List all past and present migration jobs.
* `GET /api/migrations/:id`
  - Retrieve detailed state, repository statuses, progress percentages, and active logs.
* `POST /api/migrations/:id/pause`
* `POST /api/migrations/:id/resume`
* `POST /api/migrations/:id/retry`
* `POST /api/migrations/:id/cancel`
* `GET /api/migrations/:id/report`
  - Downloadable JSON and Markdown report of migration results and verification logs.
