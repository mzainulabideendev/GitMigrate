import { CookieOptions } from 'express';

// Strict regex for valid GitHub usernames (per GitHub naming rules: alphanumeric or single hyphens, 1-39 chars)
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

// Strict regex for valid GitHub repo names
const GITHUB_REPO_REGEX = /^[a-zA-Z0-9_.-]{1,100}$/;

/**
 * Validates and extracts the GitHub username from a user-supplied profile URL or username string.
 * Strictly prevents SSRF by disallowing arbitrary domains, IPs, loopback, or file protocols.
 */
export function extractAndValidateGitHubUsername(input: string): { valid: boolean; username: string; error?: string } {
  if (!input || typeof input !== 'string') {
    return { valid: false, username: '', error: 'Input must be a non-empty string' };
  }

  const trimmed = input.trim();

  // If input starts with @, strip it
  let rawUsername = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;

  // If user provided a URL, parse with WHATWG URL parser
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsedUrl = new URL(trimmed);

      // Strictly allow ONLY github.com
      if (parsedUrl.hostname.toLowerCase() !== 'github.com' && parsedUrl.hostname.toLowerCase() !== 'www.github.com') {
        return { valid: false, username: '', error: 'URL must belong to https://github.com' };
      }

      // Must be https
      if (parsedUrl.protocol !== 'https:') {
        return { valid: false, username: '', error: 'Only secure HTTPS GitHub URLs are supported' };
      }

      // Path segments: /username or /username/
      const segments = parsedUrl.pathname.split('/').filter(Boolean);
      if (segments.length === 0) {
        return { valid: false, username: '', error: 'No GitHub username specified in URL path' };
      }

      rawUsername = segments[0];
    } catch {
      return { valid: false, username: '', error: 'Invalid URL format' };
    }
  }

  // Validate extracted username with strict regex
  if (!GITHUB_USERNAME_REGEX.test(rawUsername)) {
    return {
      valid: false,
      username: '',
      error: 'Invalid GitHub username. Must contain only alphanumeric characters or single hyphens (1-39 characters)',
    };
  }

  return { valid: true, username: rawUsername };
}

/**
 * Validates a repository name to prevent path traversal and injection.
 */
export function validateRepoName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  return GITHUB_REPO_REGEX.test(name) && !name.includes('..') && name !== '.' && name !== '..';
}

/**
 * Redacts tokens, keys, and authorization headers from strings and error logs.
 */
export function redactSecrets(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_GH_TOKEN]')
    .replace(/gho_[a-zA-Z0-9]{36}/g, '[REDACTED_GH_TOKEN]')
    .replace(/github_pat_[a-zA-Z0-9_]{82}/g, '[REDACTED_GH_PAT]')
    .replace(/https:\/\/[^@]+@github\.com/gi, 'https://[REDACTED_CREDENTIALS]@github.com')
    .replace(/x-access-token:[^@]+@/gi, 'x-access-token:[REDACTED]@')
    .replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, 'Bearer [REDACTED]')
    .replace(/token\s+[a-zA-Z0-9_.-]+/gi, 'token [REDACTED]');
}

/**
 * Returns cookie options compliant with AI Studio iframe environment.
 * Requires SameSite=None and Secure=true together.
 */
export function getSecureCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}
