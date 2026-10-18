import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(ROOT, process.env.NOTES_CONTENT || 'content');

/** Where the site will be served from.
 *
 *  Default is './' — relative URLs, which work unchanged at a domain root,
 *  under /repo-name/, and from any local preview, with no runtime guessing.
 *  Set VITE_BASE=/repo-name/ only if you want absolute asset URLs. */
const BASE = process.env.VITE_BASE || './';

function runIndexer(label) {
  const extra = [];
  // Thresholds are env-tunable so the sharded path can be exercised on a
  // tree small enough to iterate on.
  if (process.env.NOTES_INLINE_LIMIT) extra.push('--inline-limit', process.env.NOTES_INLINE_LIMIT);
  if (process.env.NOTES_SHARD_LIMIT) extra.push('--shard-limit', process.env.NOTES_SHARD_LIMIT);
  if (process.env.NOTES_MIN_SHARD) extra.push('--min-shard', process.env.NOTES_MIN_SHARD);
  if (process.env.NOTES_NO_FULLTEXT) extra.push('--no-fulltext');

  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'build-index.mjs'), '--content', CONTENT_DIR, '--quiet', ...extra],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    console.error(`\n  [notes] index build failed${label ? ` (${label})` : ''}:\n  ${detail}\n`);
    return false;
  }
  return true;
}

/** Serve content/ in dev and copy it into the build.
 *
 *  Notes stay at the repository root rather than inside public/, which keeps
 *  the thing a person actually edits out of a build directory. */
function notesContent() {
  let outDir = 'dist';
  return {
    name: 'notes-content',

    configResolved(config) { outDir = config.build.outDir; },

    buildStart() { runIndexer('build'); },

    configureServer(server) {
      runIndexer('dev start');

      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/content/')) return next();

        let relative;
        try {
          relative = decodeURIComponent(url.pathname.slice('/content/'.length));
        } catch { relative = url.pathname.slice('/content/'.length); }

        const target = path.resolve(CONTENT_DIR, relative);
        // Never serve outside the content directory.
        if (!target.startsWith(CONTENT_DIR + path.sep)) {
          res.statusCode = 403;
          return res.end('Forbidden');
        }
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return res.end('Not found');
        }

        const ext = path.extname(target).toLowerCase();
        const types = {
          '.md': 'text/markdown; charset=utf-8',
          '.markdown': 'text/markdown; charset=utf-8',
          '.mdx': 'text/markdown; charset=utf-8',
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
          '.avif': 'image/avif', '.pdf': 'application/pdf',
          '.mp4': 'video/mp4', '.webm': 'video/webm',
          '.json': 'application/json; charset=utf-8',
          '.txt': 'text/plain; charset=utf-8',
          '.csv': 'text/csv; charset=utf-8',
        };
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        return fs.createReadStream(target).pipe(res);
      });

      // Re-index when notes change. Only the index is rebuilt; Vite's own
      // HMR is untouched, and the page picks it up on reload.
      let pending = null;
      const rebuild = (file) => {
        if (!file.startsWith(CONTENT_DIR)) return;
        clearTimeout(pending);
        pending = setTimeout(() => {
          if (runIndexer('watch')) {
            server.ws.send({ type: 'full-reload' });
            server.config.logger.info('  [notes] index rebuilt');
          }
        }, 120);
      };
      server.watcher.add(CONTENT_DIR);
      server.watcher.on('add', rebuild);
      server.watcher.on('change', rebuild);
      server.watcher.on('unlink', rebuild);
    },

    closeBundle() {
      const dest = path.resolve(ROOT, outDir, 'content');
      fs.rmSync(dest, { recursive: true, force: true });
      if (fs.existsSync(CONTENT_DIR)) {
        fs.cpSync(CONTENT_DIR, dest, { recursive: true, dereference: true });
      }

      // .nojekyll: without it GitHub Pages runs the output through Jekyll,
      // which silently drops any file or folder whose name starts with an
      // underscore. Vite does not emit those today, but notes very well may.
      fs.writeFileSync(path.resolve(ROOT, outDir, '.nojekyll'), '');

      // 404.html: Pages serves it for any unknown path under the site. It
      // forwards the attempted path into the hash route so a deep link that
      // was typed (or pasted without the #) still lands on the right note.
      const fallback = fs.readFileSync(path.join(ROOT, 'src', '404.template.html'), 'utf8')
        .replace('__BASE__', JSON.stringify(BASE === './' ? null : BASE));
      fs.writeFileSync(path.resolve(ROOT, outDir, '404.html'), fallback);
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [notesContent()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Three chunks so the parts with very different change rates cache
        // independently: the app, the maths engine, the highlighter.
        manualChunks(id) {
          if (id.includes('node_modules/katex')) return 'katex';
          if (id.includes('node_modules/highlight.js')) return 'highlight';
          if (id.includes('node_modules/markdown-it')) return 'markdown';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    // The dev server serves the workspace, as Vite's always has. It is bound
    // to localhost and is not what gets deployed, but there is no reason for
    // these to be reachable even there.
    fs: { strict: true, deny: ['.env', '.env.*', '*.pem', '.git/**'] },
  },
  preview: { port: 4173, strictPort: false },
});
