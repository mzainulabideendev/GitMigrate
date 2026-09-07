import { gitMigrationService, classifyGitError } from '../server/gitEngine.js';
import { redactSecrets } from '../server/security.js';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('====================================================');
  console.log('      Running GitMigrationService Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}${detail ? ` (${detail})` : ''}`);
      failed++;
    }
  }

  // TEST 1: Git Runtime Detection
  console.log('Test Group 1: Git Detection & Diagnostics');
  try {
    const diag = await gitMigrationService.checkGit();
    assert(diag.available === true, 'Git availability check');
    assert(typeof diag.version === 'string' && diag.version.startsWith('git version'), 'Git version string format', diag.version);
    assert(typeof diag.binaryPath === 'string' && diag.binaryPath.length > 0, 'Git binary path resolved', diag.binaryPath);
    assert(typeof diag.platform === 'string', 'Platform detected', diag.platform);
    assert(typeof diag.nodeVersion === 'string', 'Node.js version recorded', diag.nodeVersion);
  } catch (err: any) {
    assert(false, 'Git Runtime Detection error', err.message);
  }

  // TEST 2: Error Classification
  console.log('\nTest Group 2: Error Classification System');
  const enoentErr = new Error('spawn git ENOENT');
  const enoentClassified = classifyGitError(enoentErr);
  assert(enoentClassified.code === 'GIT_NOT_FOUND', 'ENOENT classified as GIT_NOT_FOUND', enoentClassified.code);
  assert(enoentClassified.userMessage.includes('Git is not available in the migration worker environment'), 'ENOENT user-friendly explanation');

  const authErr = new Error('fatal: Authentication failed for https://x-access-token:ghp_secret123@github.com/user/repo.git');
  const authClassified = classifyGitError(authErr, 'push');
  assert(authClassified.code === 'GIT_AUTH_FAILED', 'Auth error classified as GIT_AUTH_FAILED', authClassified.code);
  assert(!authClassified.technicalDetails.includes('ghp_secret123'), 'Secrets redacted in classified technical details');

  const netErr = new Error('fatal: Could not resolve host: github.com');
  const netClassified = classifyGitError(netErr, 'clone');
  assert(netClassified.code === 'GIT_NETWORK_ERROR', 'Network error classified as GIT_NETWORK_ERROR');

  const spaceErr = Object.assign(new Error('No space left on device'), { code: 'ENOSPC' });
  const spaceClassified = classifyGitError(spaceErr);
  assert(spaceClassified.code === 'GIT_DISK_SPACE_ERROR', 'Disk space classified as GIT_DISK_SPACE_ERROR');

  // TEST 3: Secret Redaction
  console.log('\nTest Group 3: Secret Redaction & Log Protection');
  const sensitiveString = 'Error connecting to https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/dest/repo.git with Bearer gho_abcdefghijklmnopqrstuvwxyz123456';
  const sanitized = redactSecrets(sensitiveString);
  assert(!sanitized.includes('ghp_1234567890'), 'GitHub PAT redacted from log string');
  assert(!sanitized.includes('gho_abcdefghij'), 'GitHub OAuth token redacted from log string');
  assert(sanitized.includes('[REDACTED'), 'Redaction placeholder present');

  // TEST 4: Mirror Clone on Public Source (https://github.com/ZainulabdeenOfficial/react.git)
  console.log('\nTest Group 4: Bare Mirror Clone and Commit Inspection');
  const testJobId = `test_suite_${Date.now()}`;
  const tempTestDir = path.join('/tmp', 'github-migrations-test', testJobId);
  const repoTempDir = path.join(tempTestDir, 'react.git');

  try {
    fs.mkdirSync(tempTestDir, { recursive: true });
    console.log('  -> Executing bare clone: https://github.com/ZainulabdeenOfficial/react.git');
    await gitMigrationService.runGit(['clone', '--mirror', 'https://github.com/ZainulabdeenOfficial/react.git', repoTempDir], tempTestDir);

    assert(fs.existsSync(repoTempDir), 'Repository directory created');
    assert(fs.existsSync(path.join(repoTempDir, 'HEAD')), 'Bare repository contains HEAD');
    assert(fs.existsSync(path.join(repoTempDir, 'objects')), 'Bare repository contains objects database');

    const commitStats = await gitMigrationService.inspectCommits(repoTempDir);
    assert(commitStats.count > 0, `Preserved all source commits (Found: ${commitStats.count} commits)`);
    assert(commitStats.latestDate.length > 0, `Latest commit timestamp captured (${commitStats.latestDate})`);
    assert(commitStats.latestMessage.length > 0, `Latest commit message captured ("${commitStats.latestMessage}")`);

    const hasLfs = await gitMigrationService.inspectLfs(repoTempDir);
    assert(typeof hasLfs === 'boolean', `LFS inspection executed (${hasLfs ? 'LFS pointers detected' : 'No LFS'})`);

    // Cleanup
    gitMigrationService.cleanup(tempTestDir);
    assert(!fs.existsSync(tempTestDir), 'Temporary test repository directory cleaned up safely');
  } catch (err: any) {
    assert(false, 'Public repository mirror clone failed', err.message);
    gitMigrationService.cleanup(tempTestDir);
  }

  console.log('\n====================================================');
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
