# GitMigrate: Public GitHub Repository Migration Platform

GitMigrate is a full-stack migration platform that safely transfers public GitHub repositories to a destination GitHub account using bare mirror cloning.

## Key Features

- **True Bare Mirror Migration**: Clones `--mirror` preserving all commit SHAs, author names, committer metadata, commit messages, original historical timestamps, branches, tags, and commit trees.
- **Automated Preflight Verification**: Validates source repository public accessibility, destination repository collision status, and migration worker Git availability *before* creating destination repositories.
- **Configurable Git Path**: Full support for `GIT_PATH` environment variable, automated binary discovery, and multi-OS support (Linux, macOS, Windows, Docker).
- **Classified Error Reporting**: Detailed error classification (`GIT_NOT_FOUND`, `GIT_AUTH_FAILED`, `GIT_NETWORK_ERROR`, `GIT_DISK_SPACE_ERROR`, etc.) with user-friendly explanations.
- **Zero Credential Leakage**: Automated secret and token redaction across all process logs, standard output/error, exceptions, and reports.
- **Post-Migration Parity Verification**: Compares remote references between source and destination repositories with commit count and HEAD verification.

## Worker Environment Requirements

Git must be installed and accessible in the migration worker environment:

- **Linux / Production Container**: Git must be installed in the operating system (`apt-get install -y git` or `apk add git`) and located in `/usr/bin/git`, `/usr/local/bin/git`, or the system `PATH`.
- **Docker**: Git must be installed inside the worker container image, not merely on the host machine.
- **Windows**: Git must be installed (e.g. `C:\Program Files\Git\cmd\git.exe`) and in `PATH` or configured via `GIT_PATH`.
- **Serverless**: Long-running repository migrations require a dedicated worker or container environment that supports Git execution and temporary file storage.

## Health Endpoints

- `GET /health` or `GET /api/health`:
  Returns system readiness and Git environment status:
  ```json
  {
    "status": "ok",
    "dependencies": {
      "database": "ok",
      "git": "ok"
    },
    "git": {
      "available": true,
      "version": "git version 2.34.1",
      "binaryPath": "/usr/bin/git"
    }
  }
  ```

## Development & Testing

```bash
# Run test suite
npx tsx tests/gitMigrationService.test.ts

# Start dev server
npm run dev

# Production build
npm run build
npm start
```
