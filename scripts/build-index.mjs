#!/usr/bin/env node
// Turns content/ into the small set of JSON files the site actually loads.
//
// Run it directly, or let the Vite plugin run it for you on dev start and on
// every change under content/.
//
//   node scripts/build-index.mjs [--content content] [--out public/db]
//                                [--no-fulltext] [--inline-limit 60000]
//                                [--text search-text]
//
// Every file under content/ is indexed, not only notes: a PDF or a slide
// deck shows up in the tree and opens in a viewer. Attachments cannot be
// searched by their bytes, so their text comes from an optional sidecar,
// search-text/<content path>.txt, kept outside content/ so it never ships.
//
// The work itself is in lib/indexer.mjs, shared with the desktop app.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { walk, readIgnoreFile } from './lib/walk.mjs';
import { buildIndex } from './lib/indexer.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const ROOT = process.cwd();
const CONTENT_DIR = path.resolve(ROOT, flag('content', 'content'));
const OUT_DIR = path.resolve(ROOT, flag('out', 'public/db'));
const TEXT_DIR = path.resolve(ROOT, flag('text', 'search-text'));
const QUIET = has('quiet');

const log = (...a) => { if (!QUIET) console.log(...a); };

function main() {
  const t0 = Date.now();

  if (!fs.existsSync(CONTENT_DIR)) {
    console.error(`! no content directory at ${path.relative(ROOT, CONTENT_DIR)}`);
    console.error('  create it and put some .md files inside, then run this again.');
    process.exit(1);
  }

  log(`· scanning ${path.relative(ROOT, CONTENT_DIR) || '.'}`);
  const records = walk(CONTENT_DIR, {
    extensions: null,
    ignore: readIgnoreFile(CONTENT_DIR),
    onProgress: (n) => { if (!QUIET) process.stdout.write(`\r  ${n} nodes…`); },
  });
  if (!QUIET) process.stdout.write('\r');

  const { manifest, shards, fulltext, stats } = buildIndex(records, {
    readNote: (rec) => {
      try { return fs.readFileSync(rec.abs, 'utf8'); } catch { return null; }
    },
    readSide: (rec) => {
      try { return fs.readFileSync(path.join(TEXT_DIR, `${rec.rel}.txt`), 'utf8'); } catch { return ''; }
    },
    onReadError: (rec) => process.stderr.write(`  ! could not read ${rec.rel}\n`),
    inlineLimit: Number(flag('inline-limit', 60000)),
    shardLimit: Number(flag('shard-limit', 20000)),
    minShard: Number(flag('min-shard', 400)),
    wantFulltext: !has('no-fulltext'),
    fulltextBytes: Number(flag('fulltext-bytes', 8 * 1024 * 1024)),
    docChars: Number(flag('doc-chars', 400000)),
  });

  log(`· found ${stats.notes} notes and ${stats.files} other files in ${stats.folders} folders, max depth ${stats.maxDepth}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const shardsDir = path.join(OUT_DIR, 'shards');
  fs.rmSync(shardsDir, { recursive: true, force: true });
  if (shards.length) fs.mkdirSync(shardsDir, { recursive: true });
  stats.shards = shards.map((s) => {
    const file = path.join(shardsDir, `${s.name}.json`);
    fs.writeFileSync(file, JSON.stringify(s.payload));
    return { name: s.name, nodes: s.nodes, bytes: fs.statSync(file).size };
  });

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  if (fulltext) fs.writeFileSync(path.join(OUT_DIR, 'fulltext.json'), JSON.stringify(fulltext));
  else fs.rmSync(path.join(OUT_DIR, 'fulltext.json'), { force: true });

  stats.manifestBytes = fs.statSync(manifestPath).size;
  fs.writeFileSync(path.join(OUT_DIR, 'stats.json'), JSON.stringify(stats, null, 2));

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  log(`· manifest ${kb(stats.manifestBytes)} (${stats.inlineNodes}/${stats.nodes} nodes inline)`);
  if (shards.length) {
    const total = stats.shards.reduce((a, s) => a + s.bytes, 0);
    log(`· ${shards.length} shards, ${kb(total)} total, fetched only when expanded`);
  }
  const ft = stats.fulltext;
  if (ft) {
    log(`· full text ${kb(ft.approxBytes)}, ${ft.termsKept} terms` +
        (ft.complete ? '' : ` (capped: ${ft.droppedBudget} terms, ${ft.truncatedDocs} long notes trimmed)`));
  }
  if (stats.readFailures) log(`· ${stats.readFailures} notes could not be read and were skipped`);
  log(`· done in ${Date.now() - t0}ms`);
}

main();
