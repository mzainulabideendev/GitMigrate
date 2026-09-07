import { Router } from 'express';
import { getSecureCookieOptions, redactSecrets } from '../security.js';
import { validateDestinationToken } from '../github.js';
import { db } from '../db.js';

export const authRouter = Router();

const COOKIE_NAME = 'gitmigrate_dest_token';

/**
 * Returns GitHub OAuth Authorization URL for opening directly in a popup.
 */
authRouter.get('/api/auth/github/url', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID || process.env.CLIENT_ID;

  // Construct redirect URI using APP_URL or request origin
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${appUrl.replace(/\/+$/, '')}/auth/callback`;

  if (!clientId) {
    const setupUrl = `https://github.com/settings/applications/new?oauth_application%5Bname%5D=GitMigrate&oauth_application%5Burl%5D=${encodeURIComponent(appUrl)}&oauth_application%5Bcallback_url%5D=${encodeURIComponent(redirectUri)}`;
    return res.status(400).json({
      error: 'GitHub OAuth Client ID is not configured. Please set GITHUB_CLIENT_ID (or CLIENT_ID) and GITHUB_CLIENT_SECRET in AI Studio Settings, or connect instantly using a Personal Access Token (PAT).',
      hasOAuthConfig: false,
      redirectUri,
      setupUrl,
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,user:email',
    allow_signup: 'false',
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  res.json({
    url: authUrl,
    redirectUri,
    hasOAuthConfig: true,
  });
});

/**
 * OAuth Callback handler.
 * Exchanges authorization code for access token and sends postMessage to parent popup opener.
 */
authRouter.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const code = req.query.code as string;
  const clientId = process.env.GITHUB_CLIENT_ID || process.env.CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || process.env.CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    return res.send(`
      <html>
        <body style="font-family: system-ui; text-align: center; padding: 40px; color: #b91c1c;">
          <h3>Authentication Error</h3>
          <p>Missing authorization code or OAuth credentials.</p>
          <button onclick="window.close()" style="padding: 8px 16px; margin-top: 16px;">Close</button>
        </body>
      </html>
    `);
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const data: any = await tokenRes.json();

    if (!tokenRes.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || 'Failed to obtain access token');
    }

    const token = data.access_token;
    const session = await validateDestinationToken(token);
    db.setSession(token, session);

    res.cookie(COOKIE_NAME, token, getSecureCookieOptions());

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GitHub Authorized</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
            .card { background: #1e293b; padding: 32px; border-radius: 12px; text-align: center; border: 1px solid #334155; }
          </style>
        </head>
        <body>
          <div class="card">
            <h3 style="margin-top: 0; color: #10b981;">✓ GitHub Account Connected</h3>
            <p style="color: #94a3b8;">Authorized as <strong>@${session.login}</strong>.</p>
            <p style="font-size: 14px; color: #64748b;">Closing window...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', username: '${session.login}' }, '*');
              setTimeout(() => { window.close(); }, 600);
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.send(`
      <html>
        <body style="font-family: system-ui; text-align: center; padding: 40px; color: #b91c1c;">
          <h3>OAuth Authorization Failed</h3>
          <p>${redactSecrets(err.message)}</p>
          <button onclick="window.close()" style="padding: 8px 16px; margin-top: 16px;">Close</button>
        </body>
      </html>
    `);
  }
});

/**
 * Connect with Personal Access Token (PAT).
 */
authRouter.post('/api/auth/token', async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'GitHub Personal Access Token is required.' });
  }

  const cleanToken = token.trim();
  try {
    const session = await validateDestinationToken(cleanToken);
    db.setSession(cleanToken, session);

    res.cookie(COOKIE_NAME, cleanToken, getSecureCookieOptions());
    res.json({
      success: true,
      user: {
        login: session.login,
        id: session.id,
        avatar_url: session.avatar_url,
        name: session.name,
        email: session.email,
        scopes: session.scopes,
      },
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

/**
 * Check current destination session status.
 */
authRouter.get('/api/auth/session', async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] || req.headers['x-destination-token'];
  const hasOAuthConfig = Boolean(process.env.GITHUB_CLIENT_ID || process.env.CLIENT_ID);
  if (!token) {
    return res.json({
      authenticated: false,
      hasOAuthConfig,
    });
  }

  try {
    let session = db.getSession(token as string);
    if (!session) {
      session = await validateDestinationToken(token as string);
      db.setSession(token as string, session);
    }

    res.json({
      authenticated: true,
      user: {
        login: session.login,
        id: session.id,
        avatar_url: session.avatar_url,
        name: session.name,
        email: session.email,
        scopes: session.scopes,
      },
      hasOAuthConfig,
    });
  } catch {
    res.clearCookie(COOKIE_NAME);
    res.json({
      authenticated: false,
      hasOAuthConfig,
    });
  }
});

/**
 * Logout and clear session.
 */
authRouter.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    db.clearSession(token);
  }
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});
