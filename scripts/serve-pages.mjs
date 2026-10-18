#!/usr/bin/env node
// A static server that behaves the way GitHub Pages behaves, so that
// "it worked locally" means something.
//
// What it copies deliberately:
//   · no rewrite rules — an unknown path is a 404, not the app
//   · 404.html is served for misses, with a real 404 status
//   · directory requests resolve to index.html, and /dir redirects to /dir/
//   · paths are case-sensitive
//   · the site can be mounted under a sub-path, like a project site
//   · no directory listings, ever
//   · gzip, since Pages serves compressed and the index sizes only make
//     sense measured that way
//
//   node scripts/serve-pages.mjs [--dir dist] [--port 8787] [--base /repo/]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };

const DIR = path.resolve(ROOT, flag('dir', 'dist'));
const PORT = Number(flag('port', 8787));
let BASE = flag('base', '/');
if (!BASE.startsWith('/')) BASE = `/${BASE}`;
if (!BASE.endsWith('/')) BASE = `${BASE}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.csv': 'text/csv; charset=utf-8',
};

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml))/;

function send(req, res, status, body, type, extraHeaders = {}) {
  const headers = {
    'Content-Type': type,
    'X-Served-By': 'pages-sim',
    ...extraHeaders,
  };
  const accepts = String(req.headers['accept-encoding'] || '');
  if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(accepts) && body.length > 512) {
    const gz = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = gz.length;
    res.writeHead(status, headers);
    return res.end(req.method === 'HEAD' ? undefined : gz);
  }
  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  return res.end(req.method === 'HEAD' ? undefined : body);
}

function notFound(req, res) {
  const custom = path.join(DIR, '404.html');
  if (fs.existsSync(custom)) {
    // Pages serves the custom page with a real 404, not a 200.
    return send(req, res, 404, fs.readFileSync(custom), TYPES['.html']);
  }
  return send(req, res, 404, Buffer.from('404 Not Found'), 'text/plain; charset=utf-8');
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(req, res, 405, Buffer.from('Method Not Allowed'), 'text/plain; charset=utf-8');
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { pathname = url.pathname; }

  // Outside the mount point there is nothing — same as a project site.
  if (!pathname.startsWith(BASE)) {
    if (`${pathname}/` === BASE) {
      res.writeHead(301, { Location: BASE });
      return res.end();
    }
    return send(req, res, 404, Buffer.from('404 Not Found'), 'text/plain; charset=utf-8');
  }

  const relative = pathname.slice(BASE.length);
  const target = path.resolve(DIR, relative);
  if (target !== DIR && !target.startsWith(DIR + path.sep)) {
    return send(req, res, 403, Buffer.from('403 Forbidden'), 'text/plain; charset=utf-8');
  }

  let stat = null;
  try { stat = fs.statSync(target); } catch { /* miss */ }

  if (stat?.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${pathname}/${url.search}` });
      return res.end();
    }
    const index = path.join(target, 'index.html');
    if (fs.existsSync(index)) {
      return send(req, res, 200, fs.readFileSync(index), TYPES['.html']);
    }
    return notFound(req, res);   // no directory listings
  }

  if (!stat?.isFile()) {
    // A path with an extension that is simply absent, and a clean path that
    // looks like a route, are the same thing to Pages: both are 404.
    return notFound(req, res);
  }

  const ext = path.extname(target).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  const body = fs.readFileSync(target);
  const cache = /\/assets\//.test(pathname)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=600';
  return send(req, res, 200, body, type, {
    'Cache-Control': cache,
    ETag: `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
  });
});

if (!fs.existsSync(DIR)) {
  console.error(`! nothing to serve at ${path.relative(ROOT, DIR)} — run \`npm run build\` first`);
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`· GitHub Pages simulation of ${path.relative(ROOT, DIR)}`);
  console.log(`  http://localhost:${PORT}${BASE}`);
  console.log('  no rewrites · real 404s · case-sensitive · gzip · no listings');
});
