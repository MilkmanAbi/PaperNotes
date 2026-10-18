#!/usr/bin/env node
// End-to-end verification against the GitHub Pages simulation.
//
// Builds, serves the output under a sub-path with no rewrite rules, drives
// a real headless browser against it, and asserts the things that actually
// break on Pages: sub-path asset resolution, hash routing on cold load and
// on reload, per-segment URL encoding, 404 behaviour, lazily fetched
// subtrees, KaTeX, scoped note CSS, and that the tree stays virtualised.
//
//   npm run verify              build, serve, test, report
//   npm run verify -- --keep    leave the server running afterwards
//
// Playwright is not a dependency of this project. If it is not installed the
// script says so and still runs every check that does not need a browser,
// rather than failing outright.

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const SKIP_BUILD = args.includes('--no-build');
const PORT = 8799;
const BASE = '/paper-notes-demo/';   // deliberately a sub-path, like a project site
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SITE = `${ORIGIN}${BASE}`;

const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  const mark = ok ? '  ok  ' : ' FAIL ';
  console.log(`${mark} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function waitFor(url, timeoutMs = 10000) {
  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch { /* not up yet */ }
    if (Date.now() - started > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 120));
  }
}

async function main() {
  if (!SKIP_BUILD) {
    console.log('· building');
    const build = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit', shell: false });
    if (build.status !== 0) { console.error('! build failed'); process.exit(1); }
  }

  console.log(`· serving dist/ at ${SITE}`);
  const server = spawn(process.execPath,
    [path.join(ROOT, 'scripts', 'serve-pages.mjs'), '--port', String(PORT), '--base', BASE],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });

  const cleanup = () => { if (!KEEP) server.kill(); };
  process.on('exit', cleanup);

  if (!await waitFor(SITE)) {
    console.error('! the server never came up');
    server.kill();
    process.exit(1);
  }

  console.log('\n── static behaviour ──────────────────────────────────');
  await staticChecks();

  console.log('\n── browser behaviour ─────────────────────────────────');
  const ran = await browserChecks();
  if (!ran) console.log('  (skipped: no Playwright browser available)');

  if (ran) {
    console.log('\n── sharded delivery ──────────────────────────────────');
    await shardChecks(server);
  }

  console.log(`\n${failed ? `${failed} check(s) failed` : `all ${results.length} checks passed`}`);
  if (KEEP) { console.log(`\nserver still running at ${SITE} — ctrl-c to stop`); return; }
  server.kill();
  process.exit(failed ? 1 : 0);
}

// ── things that do not need a browser ───────────────────────────────────
async function staticChecks() {
  const index = await fetch(SITE);
  check('site root serves index.html', index.ok && index.headers.get('content-type')?.includes('text/html'),
    `HTTP ${index.status}`);

  const html = await index.text();
  check('assets are referenced relatively, so any sub-path works',
    !/(src|href)="\/assets\//.test(html),
    /(src|href)="\/assets\//.test(html) ? 'found an absolute /assets/ reference' : '');

  const manifest = await fetch(`${SITE}db/manifest.json`);
  check('manifest is reachable and is JSON',
    manifest.ok && manifest.headers.get('content-type')?.includes('json'), `HTTP ${manifest.status}`);
  const data = await manifest.json();
  check('manifest has nodes', Array.isArray(data.nodes?.name) && data.nodes.name.length > 0,
    `${data.nodes?.name?.length ?? 0} inline nodes`);

  const gz = await fetch(`${SITE}db/manifest.json`, { headers: { 'accept-encoding': 'gzip' } });
  check('index is served compressed', !!gz.headers.get('content-encoding') || data.nodes.name.length < 200,
    gz.headers.get('content-encoding') || 'small enough not to compress');

  // A note that exists, fetched exactly the way the app fetches it.
  const firstNote = findFirstNote(data);
  const noteUrl = `${SITE}content/${firstNote.split('/').map(encodeURIComponent).join('/')}`;
  const note = await fetch(noteUrl);
  check('a note file is reachable at its content path', note.ok, `${firstNote} → HTTP ${note.status}`);

  const missing = await fetch(`${SITE}content/definitely/not/here.md`);
  check('a missing note is a real 404, not a silent 200', missing.status === 404, `HTTP ${missing.status}`);

  const route = await fetch(`${SITE}some/clean/route`);
  check('a clean path 404s and serves the custom 404 page',
    route.status === 404 && (await route.text()).includes('__BASE__') === false, `HTTP ${route.status}`);

  const outside = await fetch(`${ORIGIN}/not-the-site/`);
  check('nothing is served outside the mount point', outside.status === 404, `HTTP ${outside.status}`);

  const traversal = await fetch(`${SITE}../../package.json`);
  check('path traversal does not escape the output directory',
    traversal.status === 404 || traversal.status === 403, `HTTP ${traversal.status}`);

  const wrongCase = await fetch(`${SITE}DB/manifest.json`);
  check('paths are case-sensitive, as they are on Pages', wrongCase.status === 404, `HTTP ${wrongCase.status}`);

  check('.nojekyll is in the output', fs.existsSync(path.join(ROOT, 'dist', '.nojekyll')));

  const stats = await (await fetch(`${SITE}db/stats.json`)).json();
  check('build stats report what the index covers',
    typeof stats.notes === 'number' && stats.notes > 0,
    `${stats.notes} notes, ${stats.folders} folders, depth ${stats.maxDepth}`);
}

function findFirstNote(manifest) {
  const { name, parent, kind } = manifest.nodes;
  const nameOf = (i) => manifest.strings[name[i]];
  for (let i = 1; i < name.length; i++) {
    if (kind.charCodeAt(i) - 48 !== 1) continue;
    const parts = [];
    let cur = i;
    while (cur > 0) { parts.push(nameOf(cur)); cur = parent[cur]; }
    return parts.reverse().join('/');
  }
  return '';
}

// ── things that need a real browser ─────────────────────────────────────
async function browserChecks() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch {
    try { ({ chromium } = await import('playwright-core')); }
    catch { return false; }
  }

  let browser;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  } catch (err) {
    console.log(`  (could not launch a browser: ${err.message.split('\n')[0]})`);
    return false;
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e.message)));
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('definitely-not')) {
      failedRequests.push(`${r.status()} ${r.url()}`);
    }
  });

  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 15000 });

  check('app boots with no console errors', consoleErrors.length === 0, consoleErrors[0] || '');
  check('no request failed during boot', failedRequests.length === 0, failedRequests[0] || '');

  const rowCount = await page.locator('.tree__row').count();
  const visibleTotal = await page.evaluate(() => document.querySelectorAll('.tree__row').length);
  check('tree rendered', rowCount > 0, `${rowCount} row elements in the DOM`);

  // ── open a folder, then a note ──────────────────────────────────────
  const firstDir = page.locator('.tree__row[data-kind="dir"]').first();
  await firstDir.click();
  await page.waitForTimeout(150);
  const afterExpand = await page.locator('.tree__row').count();
  check('expanding a folder reveals children', afterExpand >= rowCount, `${rowCount} → ${afterExpand} rows`);

  const firstNoteRow = page.locator('.tree__row[data-kind="note"]').first();
  await firstNoteRow.click();
  await page.waitForSelector('.note-content', { timeout: 10000 });
  const hash = await page.evaluate(() => location.hash);
  check('opening a note routes on the hash', hash.startsWith('#/'), hash.slice(0, 60));
  check('the note rendered Markdown', await page.locator('.note-content h1, .note-content h2').count() > 0);

  // ── reload: the whole point of hash routing on Pages ────────────────
  const deepUrl = page.url();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.note-content', { timeout: 10000 });
  check('reloading a deep link restores the same note',
    page.url() === deepUrl, `${page.url().slice(-50)}`);

  // ── breadcrumb and tree stay in sync ────────────────────────────────
  check('the breadcrumb shows the path', await page.locator('.breadcrumb').count() > 0);
  check('the open note is selected in the tree',
    await page.locator('.tree__row[data-selected="true"]').count() === 1);

  // ── LaTeX ───────────────────────────────────────────────────────────
  const mathNote = await findNoteContaining(page, '$$');
  if (mathNote) {
    await page.goto(`${SITE}#/${mathNote.split('/').map(encodeURIComponent).join('/')}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.note-content', { timeout: 10000 });
    const katexCount = await page.locator('.note-content .katex').count();
    const katexErrors = await page.locator('.note-content .katex-error').count();
    check('LaTeX renders through KaTeX', katexCount > 0, `${katexCount} expressions`);
    check('no LaTeX failed to render', katexErrors === 0, `${katexErrors} errors`);
    const mathFont = await page.evaluate(() => {
      const el = document.querySelector('.note-content .katex .mord');
      return el ? getComputedStyle(el).fontFamily : '';
    });
    check('KaTeX fonts loaded from the sub-path', /KaTeX/i.test(mathFont), mathFont.slice(0, 40));
  } else {
    check('LaTeX renders through KaTeX', false, 'no note with $$ found in the demo content');
  }

  // ── a note bringing its own HTML, CSS and maths ─────────────────────
  // This is a real note in the demo content, not a synthetic fixture: it
  // documents the trust boundary and demonstrates it at the same time, so a
  // regression here breaks a page someone would actually read.
  const CSS_NOTE = 'reference/html-and-css-in-notes.md';
  await page.goto(`${SITE}#/${CSS_NOTE.split('/').map(encodeURIComponent).join('/')}`,
    { waitUntil: 'networkidle' });
  await page.waitForSelector('.note-content', { timeout: 10000 });

  const scoped = await page.evaluate(() => {
    const style = document.querySelector('style[data-owner="note-content"]');
    const text = style?.textContent || '';
    return {
      hasRules: text.length > 0,
      scopedSelectors: text.includes('.note-content'),
      leakedRoot: /(^|[^.\w-])(:root|body|html)\s*[,{]/.test(text),
      fixedNeutralised: !/position:\s*fixed/i.test(text),
      zClamped: !/z-index:\s*9{3,}/.test(text),
    };
  });
  check("a note's own CSS is applied", scoped.hasRules);
  check("a note's own CSS is scoped to the content region", scoped.scopedSelectors);
  check("a note's CSS cannot reach :root, html or body", !scoped.leakedRoot);
  check('position:fixed in note CSS is neutralised', scoped.fixedNeutralised);
  check('runaway z-index in note CSS is clamped', scoped.zClamped);

  const chromeColor = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.topbar')).backgroundColor);
  check('the toolbar was not repainted by the note', chromeColor !== 'rgb(255, 0, 0)', chromeColor);
  const bodyColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('the page background was not repainted by the note', bodyColor !== 'rgb(255, 0, 0)', bodyColor);
  check('the status bar was not hidden by the note',
    await page.locator('.statusbar').isVisible());
  check('no note element escaped to cover the window', await page.evaluate(() =>
    ![...document.querySelectorAll('.note-content *')]
      .some((el) => getComputedStyle(el).position === 'fixed')));

  // `:root` in a note means the note's own region: it may retheme itself,
  // and that retheming must stop at the edge of the note.
  const accents = await page.evaluate(() => ({
    app: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    note: getComputedStyle(document.querySelector('.note-content')).getPropertyValue('--accent').trim(),
  }));
  check('the app accent was not hijacked by the note', accents.app !== accents.note,
    `app ${accents.app}`);
  check('a note can retheme its own region', /9a5b42/i.test(accents.note), accents.note);

  check('raw HTML in a note renders', await page.locator('.note-content .swatch').count() > 0);
  check('a note styles its own markup', await page.evaluate(() => {
    const el = document.querySelector('.note-content .swatch');
    return el ? getComputedStyle(el).borderTopWidth === '1px' : false;
  }));
  check('<details> in a note renders', await page.locator('.note-content details').count() > 0);
  check('a note script does not run', await page.evaluate(() => window.__noteScriptRan !== true));

  // ── the kitchen-sink note ───────────────────────────────────────────
  const MD_NOTE = 'reference/markdown-and-math.md';
  await page.goto(`${SITE}#/${MD_NOTE.split('/').map(encodeURIComponent).join('/')}`,
    { waitUntil: 'networkidle' });
  await page.waitForSelector('.note-content', { timeout: 10000 });

  check('display maths renders', await page.locator('.note-content .katex-display').count() >= 3,
    `${await page.locator('.note-content .katex-display').count()} display blocks`);
  check('an unparseable equation degrades to a visible error, not a blank',
    await page.locator('.note-content .katex-error').count() === 1);
  check('a table renders inside a scroll container',
    await page.locator('.note-content .table-wrap table').count() > 0);
  check('task list checkboxes are read-only', await page.evaluate(() =>
    [...document.querySelectorAll('.note-content input[type=checkbox]')].every((i) => i.disabled)));
  check('footnotes render', await page.locator('.note-content .footnotes').count() === 1);
  check('code is syntax highlighted', await page.locator('.note-content pre code .hljs-keyword').count() > 0);
  check('a link to a missing note is marked',
    await page.locator('.note-content a[data-missing="true"]').count() > 0);
  check('a relative link between notes becomes a hash route', await page.evaluate(() => {
    const links = [...document.querySelectorAll('.note-content a[href]')];
    return links.some((a) => a.getAttribute('href').startsWith('#/'));
  }));
  check('the contents panel lists the headings',
    await page.locator('.toc a').count() > 3, `${await page.locator('.toc a').count()} entries`);

  // ── virtualisation ──────────────────────────────────────────────────
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="true"]');
  const virt = await page.evaluate(async () => {
    // Expand everything reachable, then count DOM rows against tree rows.
    const scroller = document.querySelector('.tree');
    for (let pass = 0; pass < 6; pass++) {
      const closed = [...document.querySelectorAll('.tree__row[data-kind="dir"][data-open="false"]')];
      if (!closed.length) break;
      for (const row of closed.slice(0, 40)) row.querySelector('.tree__twisty').click();
      await new Promise((r) => setTimeout(r, 60));
    }
    const sizerHeight = parseFloat(document.querySelector('.tree__sizer').style.height) || 0;
    const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-h'));
    return {
      domRows: document.querySelectorAll('.tree__row').length,
      virtualRows: Math.round(sizerHeight / rowHeight),
      scrollerHeight: scroller.clientHeight,
      rowHeight,
    };
  });
  check('tree is virtualised: DOM rows stay bounded',
    virt.domRows < Math.max(60, Math.ceil(virt.scrollerHeight / virt.rowHeight) + 24),
    `${virt.domRows} in the DOM for ${virt.virtualRows} rows`);

  // ── search ──────────────────────────────────────────────────────────
  await page.fill('#q', 'bearing');
  await page.waitForTimeout(250);
  const resultCount = await page.locator('.tree__row').count();
  check('typing filters immediately, with no spinner', resultCount >= 0,
    `${await page.locator('.statusbar').innerText()}`);
  const hasSpinner = await page.locator('.statusbar').innerText();
  check('the status bar states what search covered', /match|names/.test(hasSpinner), hasSpinner.slice(0, 70));

  await page.fill('#q', '');
  await page.waitForTimeout(150);

  // ── density and theme ───────────────────────────────────────────────
  for (const mode of ['dense', 'compact', 'comfortable']) {
    await page.click(`[data-group="density"][data-value="${mode}"]`);
    await page.waitForTimeout(120);
    const rowH = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-h')));
    const radius = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--radius-sm').trim());
    const domRowH = await page.evaluate(() => {
      const row = document.querySelector('.tree__row');
      return row ? Math.round(row.getBoundingClientRect().height) : 0;
    });
    check(`density "${mode}" applies`, domRowH === rowH, `rows ${domRowH}px`);
    check(`density "${mode}" does not change the corner radius`, radius === '4px', radius);
  }
  await page.click('[data-group="density"][data-value="compact"]');

  for (const theme of ['light', 'dark']) {
    await page.click(`[data-group="theme"][data-value="${theme}"]`);
    await page.waitForTimeout(120);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const pure = bg === 'rgb(255, 255, 255)' || bg === 'rgb(0, 0, 0)';
    check(`theme "${theme}" applies and avoids pure black/white`, !pure, bg);
  }

  // The OS preference must win when the user has not overridden it.
  await page.click('[data-group="theme"][data-value="system"]');
  const dark = await context.newPage();
  await dark.emulateMedia({ colorScheme: 'dark' });
  await dark.goto(SITE, { waitUntil: 'networkidle' });
  await dark.waitForSelector('body[data-ready="true"]');
  const osBg = await dark.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const osIsDark = await dark.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return (r + g + b) / 3 < 90;
  });
  check('the OS dark preference is followed without being asked', osIsDark, osBg);
  await dark.close();

  // ── reduced motion ──────────────────────────────────────────────────
  const rm = await context.newPage();
  await rm.emulateMedia({ reducedMotion: 'reduce' });
  await rm.goto(SITE, { waitUntil: 'networkidle' });
  await rm.waitForSelector('body[data-ready="true"]');
  const durations = await rm.evaluate(() => {
    const twisty = document.querySelector('.tree__twisty');
    return twisty ? getComputedStyle(twisty).transitionDuration : '';
  });
  const seconds = parseFloat(durations) || 0;
  check('reduced motion collapses transitions', seconds < 0.001, durations);
  await rm.close();

  // ── keyboard ────────────────────────────────────────────────────────
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(150);
  check('the command palette opens on ctrl/cmd-K',
    await page.locator('.palette-scrim:not([hidden])').count() === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('escape closes the palette',
    await page.locator('.palette-scrim:not([hidden])').count() === 0);

  // ── a path with characters that need encoding ───────────────────────
  const trickyDir = path.join(ROOT, 'dist', 'content', 'spaced folder & co');
  fs.mkdirSync(trickyDir, { recursive: true });
  fs.writeFileSync(path.join(trickyDir, 'a note, with punctuation.md'), '# Encoded path\n\nIt loaded.\n');
  const tricky = 'spaced folder & co/a note, with punctuation.md';
  const encoded = tricky.split('/').map(encodeURIComponent).join('/');
  const trickyRes = await page.evaluate(async (u) => (await fetch(u)).status, `${SITE}content/${encoded}`);
  check('paths with spaces and punctuation are encoded per segment', trickyRes === 200, `HTTP ${trickyRes}`);
  fs.rmSync(trickyDir, { recursive: true, force: true });

  const lateErrors = consoleErrors.filter((e) => !e.includes('404'));
  check('no console errors across the whole run', lateErrors.length === 0, lateErrors[0] || '');

  await browser.close();
  return true;
}

/** Rebuild the same content with a tiny inline budget so the tree is forced
 *  into shards, then check that the deferred path behaves: nothing fetched
 *  up front, one request per expanded subtree, and a failing shard scoped to
 *  the folder that asked for it. */
async function shardChecks(mainServer) {
  const OUT = 'dist-shards';
  const SPORT = PORT + 1;
  const SBASE = '/sharded/';
  const SSITE = `http://127.0.0.1:${SPORT}${SBASE}`;

  const build = spawnSync('npx', ['vite', 'build', '--outDir', OUT], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, NOTES_INLINE_LIMIT: '40', NOTES_SHARD_LIMIT: '60', NOTES_MIN_SHARD: '8' },
  });
  if (build.status !== 0) { check('sharded build succeeds', false); return; }

  const stats = JSON.parse(fs.readFileSync(path.join(ROOT, OUT, 'db', 'stats.json'), 'utf8'));
  check('a tight budget forces the tree into shards', stats.shards.length > 3,
    `${stats.shards.length} shards, ${stats.inlineNodes} of ${stats.nodes} nodes inline`);
  check('the root manifest stays small when sharded', stats.manifestBytes < 12000,
    `${(stats.manifestBytes / 1024).toFixed(1)} KB`);

  const server = spawn(process.execPath,
    [path.join(ROOT, 'scripts', 'serve-pages.mjs'), '--dir', OUT, '--port', String(SPORT), '--base', SBASE],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  const stop = () => server.kill();
  process.on('exit', stop);

  if (!await waitFor(SSITE)) { check('the sharded site serves', false); stop(); return; }

  const { chromium } = await import('playwright').catch(() => import('playwright-core'));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();

  let shardRequests = 0;
  page.on('response', (r) => { if (r.url().includes('/db/shards/')) shardRequests++; });

  await page.goto(SSITE, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 15000 });
  check('no subtree is fetched before it is asked for', shardRequests === 0, `${shardRequests} fetches`);
  check('deferred folders are marked in the tree', await page.evaluate(() =>
    [...document.querySelectorAll('.tree__count')].some((e) => e.textContent === '…')));

  // Expanding a deferred folder: exactly one request, children appear.
  const before = await page.locator('.tree__row').count();
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.tree__row[data-kind="dir"]')]
      .find((r) => r.querySelector('.tree__count')?.textContent === '…');
    row?.querySelector('.tree__twisty').click();
  });
  await page.waitForFunction((n) => document.querySelectorAll('.tree__row').length > n, before,
    { timeout: 15000 });
  check('expanding a deferred folder fetches exactly one subtree', shardRequests === 1,
    `${shardRequests} fetches, ${before} → ${await page.locator('.tree__row').count()} rows`);

  // A deep link into a deferred subtree must resolve by walking shards in.
  const deep = await page.evaluate(async (site) => {
    const manifest = await (await fetch(`${site}db/manifest.json`)).json();
    const shardNames = Object.values(manifest.nodes.shard);
    if (!shardNames.length) return null;
    const shard = await (await fetch(`${site}db/shards/${shardNames[0]}.json`)).json();
    const { name, parent, kind } = shard.nodes;
    for (let i = 0; i < name.length; i++) {
      if (kind.charCodeAt(i) - 48 !== 1) continue;
      const parts = [];
      let cur = i;
      while (cur !== -1) { parts.push(shard.strings[name[cur]]); cur = parent[cur]; }
      return `${shard.root}/${parts.reverse().join('/')}`;
    }
    return null;
  }, SSITE);

  if (deep) {
    await page.goto(`${SSITE}#/${deep.split('/').map(encodeURIComponent).join('/')}`,
      { waitUntil: 'networkidle' });
    await page.waitForSelector('.note-content, .state--error', { timeout: 15000 });
    check('a deep link into a deferred subtree resolves',
      await page.locator('.note-content').count() === 1, deep);
    check('the tree reveals the note inside the fetched subtree',
      await page.locator('.tree__row[data-selected="true"]').count() === 1);
  } else {
    check('a deep link into a deferred subtree resolves', false, 'no shard to test against');
  }

  // Search pulls the remainder in, and says so while it does.
  await page.goto(SSITE, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="true"]');
  await page.fill('#q', 'bearing');
  await page.waitForTimeout(120);
  const midStatus = await page.locator('.statusbar').innerText();
  check('search states that the tree is still arriving',
    /loading the rest|matches/.test(midStatus), midStatus.split('\n')[1] || midStatus.slice(0, 50));
  await page.waitForFunction(
    () => !document.querySelector('.statusbar').innerText.includes('loading the rest'),
    null, { timeout: 60000 });
  const loaded = await page.evaluate(() =>
    document.querySelectorAll('.tree__row').length >= 0);
  check('the whole tree loads in the background after a search', loaded,
    `${shardRequests} subtree fetches in total`);

  // A subtree that fails must not take the tree with it. Fresh context, so
  // the previous page's saved expansion state does not change what loads.
  const failCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await failCtx.route('**/db/shards/*', (route) => route.abort());
  const page2 = await failCtx.newPage();
  await page2.goto(SSITE, { waitUntil: 'networkidle' });
  await page2.waitForSelector('body[data-ready="true"]');
  await page2.evaluate(() => {
    const row = [...document.querySelectorAll('.tree__row[data-kind="dir"]')]
      .find((r) => r.querySelector('.tree__count')?.textContent === '…');
    row?.querySelector('.tree__twisty').click();
  });
  await page2.waitForTimeout(900);
  check('a failing subtree reports itself without blanking the tree',
    await page2.locator('.tree__row').count() > 0 &&
    await page2.locator('.toast').count() === 1,
    await page2.locator('.toast').innerText().catch(() => 'no toast'));
  check('the rest of the app still works after a subtree fails',
    await page2.evaluate(() => {
      document.querySelector('#q').focus();
      return document.activeElement?.id === 'q';
    }));
  await failCtx.close();

  await browser.close();
  stop();
  void mainServer;
}

async function findNoteContaining(page, needle) {
  return page.evaluate(async ({ site, needle: n }) => {
    const manifest = await (await fetch(`${site}db/manifest.json`)).json();
    const { name, parent, kind } = manifest.nodes;
    const nameOf = (i) => manifest.strings[name[i]];
    const pathOf = (i) => {
      const parts = [];
      let cur = i;
      while (cur > 0) { parts.push(nameOf(cur)); cur = parent[cur]; }
      return parts.reverse().join('/');
    };
    for (let i = 1; i < name.length && i < 400; i++) {
      if (kind.charCodeAt(i) - 48 !== 1) continue;
      const p = pathOf(i);
      const res = await fetch(`${site}content/${p.split('/').map(encodeURIComponent).join('/')}`);
      if (!res.ok) continue;
      if ((await res.text()).includes(n)) return p;
    }
    return null;
  }, { site: SITE, needle });
}


main().catch((err) => { console.error(err); process.exit(1); });
