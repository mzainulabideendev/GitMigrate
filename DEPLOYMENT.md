# Deployment & Configuration Guide

## Environment Variables

Configure the following variables in your hosting environment (or AI Studio Settings):

| Variable | Required | Description |
|---|---|---|
| `PORT` | Auto (3000) | Hardcoded container port routed by reverse proxy. |
| `GIT_PATH` | Optional | Custom path to the `git` binary (e.g. `/usr/bin/git` or `C:\Program Files\Git\cmd\git.exe`). Defaults to auto-detection. |
| `APP_URL` | Auto / Required | Base URL of the container (e.g. `https://ais-dev-nfpubc5aklycpm5lgg6ksf-910743558928.asia-east1.run.app`). |
| `GITHUB_CLIENT_ID` | Optional | GitHub OAuth App Client ID. |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth App Client Secret. |

## Migration Worker Requirements

The migration worker requires:
1. **Git CLI**: Git version 2.x or later installed in the worker runtime.
2. **Persistent Storage**: Read/write access to `/tmp/github-migrations` for isolated bare mirror clones.
3. **Outbound HTTPS**: Access to `https://github.com` and `https://api.github.com`.

### Docker Container Deployment
If packaging the application in Docker, ensure Git is installed inside the image:

```dockerfile
# Debian / Ubuntu based
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Alpine based
RUN apk add --no-cache git
```

### Serverless Deployments
Short-lived serverless function runtimes (like basic AWS Lambda / Google Cloud Functions) do not typically package the Git binary or support long-running mirror clone/push workloads. For production serverless architectures, route repository migration jobs to a dedicated worker container (e.g. Cloud Run, ECS, or Kubernetes worker pod).

## GitHub OAuth App Setup Instructions

1. Navigate to **GitHub Settings > Developer Settings > OAuth Apps**:
   `https://github.com/settings/developers`
2. Click **New OAuth App**.
3. Fill in the fields:
   - **Application name**: `GitMigrate Repository Migration`
   - **Homepage URL**: `https://ais-dev-nfpubc5aklycpm5lgg6ksf-910743558928.asia-east1.run.app`
   - **Authorization callback URL**:
     - Development: `https://ais-dev-nfpubc5aklycpm5lgg6ksf-910743558928.asia-east1.run.app/auth/callback`
     - Shared: `https://ais-pre-nfpubc5aklycpm5lgg6ksf-910743558928.asia-east1.run.app/auth/callback`
4. Copy `Client ID` and generate a `Client Secret`.
5. Enter them in the app settings or connect directly using a Personal Access Token with `repo` permissions.

## Build & Production Start

- **Build**: `npm run build`
- **Start**: `npm start` (launches `dist/server.cjs` on port 3000)
