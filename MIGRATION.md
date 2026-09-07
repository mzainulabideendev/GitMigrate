# Git Migration Engine: Methodology & Specifications

## 1. Mirror Clone & Push Mechanics

Traditional code migration mechanisms download files as a ZIP or re-commit files on the current date, destroying commit history, author attributions, and tags. 

Our migration platform executes a **True Git Mirror Migration**:
```bash
# 1. Bare mirror clone from public source repository
git clone --mirror https://github.com/OLD_USERNAME/REPO.git /tmp/.../repo.git

# 2. Inspect commit history and LFS attributes
git rev-list --all --count
git log -1 --format="%cd | %s | %an"

# 3. Mirror push all objects and references with secure credentials
git push --mirror https://x-access-token:<DEST_TOKEN>@github.com/NEW_USERNAME/REPO.git
```

### What Is Preserved
* **All Commit SHAs**: Exact mathematical integrity of the commit graph is maintained.
* **Parent Trees**: Commit history lineages, merges, and rebases remain intact.
* **Original Author & Committer**: Names and email addresses remain identical.
* **Original Commit Timestamps**: Original historical timestamps are preserved (commits from 2022 will still show 2022).
* **All Branch References**: `main`, `develop`, `release/*`, `feature/*`, etc.
* **All Tags**: Both annotated tags (with tagger message) and lightweight tags.
* **Git Tree Structure**: File permissions, submodules references, symlinks.

## 2. Preflight Verification & Git Availability Check

Before creating any destination repository on GitHub, the worker performs a strict Preflight check:
1. Validates that the Git binary is executable (`git --version`).
2. Validates disk space and permissions on `/tmp/github-migrations`.
3. Verifies that destination repository names do not have unintended collisions.

If Git is missing or unavailable, the migration is rejected with code `GIT_NOT_FOUND` before creating empty repositories on GitHub.

## 3. Error Classification System

All errors during migration are categorized into standard diagnostic codes:

| Error Code | Meaning | User Guidance |
|---|---|---|
| `GIT_NOT_FOUND` | Git executable not found in worker environment | Install Git or configure `GIT_PATH` in `.env`. |
| `GIT_AUTH_FAILED` | Destination token rejected during push | Verify destination token has `repo` or `Contents: Read and write` scopes. |
| `GIT_CLONE_FAILED` | Source repository clone failed | Check source repository public accessibility. |
| `GIT_PUSH_FAILED` | Mirror push rejected | Check destination repository rules or branch protections. |
| `GIT_NETWORK_ERROR` | Network / DNS failure connecting to GitHub | Verify network connectivity. |
| `GIT_DISK_SPACE_ERROR` | Storage space exhausted on worker | Clean worker storage. |
| `GIT_PERMISSION_ERROR` | Filesystem or binary execution permission denied | Check file permissions on worker. |
| `GIT_VERIFICATION_FAILED` | Reference parity mismatch after push | Re-run migration. |

## 4. GitHub Attribution & Contribution Graph Limitation

> [!IMPORTANT]
> **Crucial Distinction**: Git commit metadata and GitHub account attribution operate on different layers.
> - Git commit objects store the author's email recorded at the time the commit was made.
> - GitHub determines whether a commit appears on an account's contribution graph based on whether the commit's author email is added and verified on the destination GitHub account, and whether the repository meets GitHub's contribution graph criteria (e.g., default branch, non-fork).
> - Therefore, this platform does NOT rewrite commit emails or falsify attribution. We explain this transparently to the user in preflight and dashboard checks.

## 5. Post-Migration Reference Verification

Before marking a repository migration as complete, our verification algorithm queries both remotes:
1. Fetch source references via `git ls-remote --heads --tags https://github.com/OLD_USER/REPO.git`
2. Fetch destination references via `git ls-remote --heads --tags https://github.com/NEW_USER/REPO.git`
3. Verify matching branch counts and tag counts.
4. Verify that each branch's commit SHA matches exactly between source and destination.

## 6. Metadata Sync Specifications
- **Repository Description & Topics**: Synced via GitHub REST API `PATCH /repos/{owner}/{repo}`.
- **Issues & Comments**: When enabled, copies open/closed issues and comments, prefixing them with transparent audit metadata (e.g. `[Migrated from @source on 2024-03-12]`).
- **Releases**: Synced via GitHub Releases API, retaining release notes, names, and tag bindings.
- **Wikis**: If a wiki exists (`https://github.com/OLD_USER/REPO.wiki.git`), mirrored to `https://github.com/NEW_USER/REPO.wiki.git`.
- **Git LFS**: Inspected via `.gitattributes`. If LFS pointers exist, user is alerted with a dedicated status advisory.
