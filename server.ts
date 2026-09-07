import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

// Ensure standard POSIX binary paths are available globally
process.env.PATH = `/usr/bin:/usr/local/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`;

// Initialize and bind GIT_PATH if available in standard location
if (!process.env.GIT_PATH) {
  if (fs.existsSync('/usr/bin/git')) {
    process.env.GIT_PATH = '/usr/bin/git';
  } else if (fs.existsSync('/usr/local/bin/git')) {
    process.env.GIT_PATH = '/usr/local/bin/git';
  }
}

import { authRouter } from './server/routes/auth.js';
import { sourceRouter } from './server/routes/source.js';
import { destinationRouter } from './server/routes/destination.js';
import { migrationsRouter } from './server/routes/migrations.js';
import { gitMigrationService } from './server/gitEngine.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Essential Middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Comprehensive Health check endpoints with dependency statuses
  const healthHandler = async (_req: express.Request, res: express.Response) => {
    try {
      const gitDiag = await gitMigrationService.checkGit();
      const isHealthy = gitDiag.available;

      const responsePayload = {
        status: isHealthy ? 'ok' : 'degraded',
        time: new Date().toISOString(),
        dependencies: {
          database: 'ok',
          git: gitDiag.available ? 'ok' : 'missing',
        },
        git: {
          available: gitDiag.available,
          version: gitDiag.version || null,
          binaryPath: gitDiag.binaryPath || null,
          configuredGitPath: gitDiag.configuredGitPath || null,
          error: gitDiag.errorMessage || null,
        },
        platform: {
          os: process.platform,
          node: process.version,
          pathConfigured: gitDiag.isPathConfigured,
        },
      };

      return res.status(isHealthy ? 200 : 503).json(responsePayload);
    } catch (err: any) {
      return res.status(500).json({
        status: 'error',
        dependencies: {
          database: 'ok',
          git: 'error',
        },
        error: err.message,
      });
    }
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // Mount API & Auth Routes
  app.use(authRouter);
  app.use(sourceRouter);
  app.use(destinationRouter);
  app.use(migrationsRouter);

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Startup Diagnostics and Git availability verification
  console.log('\nMigration Worker Starting\n');
  console.log('Checking Git...\n');

  const gitDiag = await gitMigrationService.checkGit();
  if (gitDiag.available) {
    console.log(`Git executable: ${gitDiag.binaryPath}`);
    console.log(`Git version: ${gitDiag.version}\n`);
    console.log('Git dependency: OK\n');
    console.log('Migration Worker Ready\n');
  } else {
    console.error('Git dependency: FAILED\n');
    console.error('Migration Worker is not ready for repository migrations.\n');
    if (gitDiag.errorMessage) {
      console.error(`Detail: ${gitDiag.errorMessage}\n`);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] GitMigrate platform running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
