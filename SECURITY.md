# Security Model: GitHub Public Repository Migration Platform

## Security Principles

### 1. Zero-Credential Source Scanning
- Old accounts are scanned **strictly as unauthenticated public entities**.
- The platform never accepts, stores, or prompts for the source account's password, token, or SSH key.
- Source repositories must be publicly accessible via `https://github.com/{username}/{repo}`.

### 2. SSRF (Server-Side Request Forgery) Protection
- **Strict URL Validation**: Old profile URLs are validated using regex `^https:\/\/github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/?$`.
- **Whitelisted Hostnames**: Only requests to `api.github.com` and `github.com` are permitted.
- **Denylist Protocols & Addresses**: Attempts to specify `localhost`, `127.0.0.1`, private IP ranges (RFC 1918), `file://`, `ftp://`, or loopback addresses are rejected immediately.
- Clone URLs are constructed exclusively from verified GitHub API response attributes.

### 3. Command Injection Defenses
- The backend never passes raw user strings into shell interpreters (`/bin/sh` or `bash -c`).
- All Git operations are executed via `child_process.execFile` with explicit argument arrays, bypassing shell parsing:
  ```ts
  execFile('git', ['clone', '--mirror', sourceUrl, targetDir], { env: safeEnv })
  ```
- Repository names, usernames, and branch names are sanitized using strict character constraints (`^[a-zA-Z0-9_.-]+$`).

### 4. Credential Redaction & Token Handling
- OAuth and Personal Access Tokens are kept exclusively on the server in encrypted or HTTP-only cookies (`SameSite=None; Secure; HttpOnly`).
- Any Git command utilizing authentication credentials injects them via temporary in-memory credentials or masked remote URLs.
- All loggers apply a regex redaction filter:
  `token.replace(/(ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|x-access-token:[^@]+)/g, '[REDACTED]')`
- Output streams from `stdout` and `stderr` are sanitized before storing in the database or streaming to the client.

### 5. Sandboxed Filesystem Isolation & Automatic Cleanup
- Every migration task operates in a unique isolated path: `/tmp/github-migrations/{jobId}/{repoId}`.
- Upon completion, failure, or cancellation, the directory is purged using `rm -rf`.
- Temp storage is monitored to prevent disk exhaustion.
