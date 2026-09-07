# Troubleshooting Guide: GitHub Repository Migrations

## 1. `spawn git ENOENT` (Error Code: `GIT_NOT_FOUND`)

### Symptom
Migration fails during preflight or at the start of cloning with:
```text
Migration could not start. Git is not available in the migration worker environment.
Technical error: spawn git ENOENT
```

### Root Cause
The Node.js migration worker process attempted to execute the `git` binary, but:
1. Git is not installed in the worker environment.
2. Git is installed in a directory not included in the worker process's `PATH`.
3. The custom `GIT_PATH` environment variable points to a non-existent or inaccessible executable.
4. The worker is running inside Docker or a minimal container image lacking `git`.

### Solution
1. **Linux / Debian / Ubuntu containers**:
   ```bash
   apt-get update && apt-get install -y git
   ```
2. **Alpine containers**:
   ```bash
   apk add --no-cache git
   ```
3. **Configure Custom Git Path**:
   Set `GIT_PATH` in `.env`:
   ```env
   GIT_PATH=/usr/bin/git
   ```
   Or on Windows:
   ```env
   GIT_PATH=C:\Program Files\Git\cmd\git.exe
   ```
4. **Restart Process**:
   After installing Git or modifying `PATH`, restart the backend server so the process picks up the updated environment variables.
5. **Verify Endpoint**:
   Check `http://localhost:3000/health` and verify `"git": { "available": true }`.

---

## 2. GitHub Authentication Failed (`GIT_AUTH_FAILED`)

### Symptom
```text
GitHub authentication failed during git push. Please verify that your destination Personal Access Token (PAT) has the 'repo' scope enabled.
```

### Root Cause
The destination token lacks write permissions to create repositories or push git commit objects and refs.

### Solution
- Ensure the destination GitHub account is connected.
- If using a Classic Personal Access Token (PAT), select the `repo` scope (full control of private and public repositories).
- If using Fine-Grained Personal Access Tokens, ensure the token has **Repository permissions > Contents: Read and write** and **Metadata: Read-only**.

---

## 3. Remote Repository Collision (`DESTINATION_REPO_CREATE_FAILED`)

### Symptom
Destination repository already exists or cannot be created.

### Solution
- The platform automatically detects existing destination repositories during preflight.
- You can choose to push into the existing repository or specify a custom destination repository name.

---

## 4. Network Disconnection (`GIT_NETWORK_ERROR`)

### Symptom
```text
fatal: Could not resolve host: github.com
```

### Solution
- Verify internet connectivity and DNS resolution from within the worker container.
- Click **Retry Repository** on the migration dashboard once network connectivity is restored.
