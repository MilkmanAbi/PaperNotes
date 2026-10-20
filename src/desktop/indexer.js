/** Indexing the notes folder inside the app.
 *
 *  The website gets its index from a build step. The app has no build step,
 *  so it does the same work at start-up with the same code: the native host
 *  lists the folder, scripts/lib/tree-walk.mjs orders it exactly as the
 *  Node walker would, and scripts/lib/indexer.mjs turns it into the manifest
 *  and the full-text index.
 *
 *  Reading every note on every start would be the slow part, so note and
 *  sidecar text is cached in IndexedDB, keyed by path and checked against
 *  size and modified time: a start with nothing changed reads nothing. */

import { call } from './bridge.js';
import { walkTree, parseIgnore } from '../../scripts/lib/tree-walk.mjs';
import { buildIndex, NOTE_RE } from '../../scripts/lib/indexer.mjs';
import { assetUrl, encodePath } from '../core/paths.js';

const SIDE_DIR = '.papernotes/search-text';
const DB_NAME = 'papernotes-text';
const STORE = 'text';

function openCache() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);   // no cache is slower, not broken
  });
}

function cacheGetAll(db) {
  return new Promise((resolve) => {
    if (!db) { resolve(new Map()); return; }
    const out = new Map();
    const req = db.transaction(STORE).objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(out); return; }
      out.set(cur.key, cur.value);
      cur.continue();
    };
    req.onerror = () => resolve(out);
  });
}

function cachePut(db, entries, dropKeys) {
  if (!db || (!entries.length && !dropKeys.length)) return Promise.resolve();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    for (const [key, value] of entries) os.put(value, key);
    for (const key of dropKeys) os.delete(key);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

async function fetchText(rel) {
  const res = await fetch(assetUrl(`content/${encodePath(rel)}`), { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

const FENCE_RE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm;
const WIKI_LINK_RE = /!?\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;
const MD_LINK_RE = /\]\((?!https?:|mailto:|#)([^)\s]+?\.(?:md|markdown|mdx))(?:#[^)\s]*)?\)/gi;

/** The link targets a note names: [[wikilinks]] (and ![[embeds]]) by name,
 *  Markdown links by relative path (prefixed "./"). Code is skipped, but not
 *  ```tree and ```flow blocks: their [[links]] are boxes you can click. */
function noteLinks(text) {
  const body = text.replace(FENCE_RE, (block) => (/^[`~]{3,}\s*(tree|flow)\b/i.test(block) ? block : ''));
  const out = new Set();
  for (const m of body.matchAll(WIKI_LINK_RE)) out.add(m[1].trim());
  for (const m of body.matchAll(MD_LINK_RE)) out.add(`./${m[1]}`);
  return [...out];
}

/** Run `fn` over `items`, `limit` at a time. */
async function pool(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/**
 * @returns {Promise<{ files: object, records: Array, signature: string }>}
 *   `files` is ready for useLocalDb(); `signature` changes whenever the tree's
 *   shape does (anything added, removed or renamed).
 */
export async function indexNotesFolder({ onProgress } = {}) {
  const scan = await call('scan');

  // Group the flat listing into directories for the walker.
  const children = new Map([['', []]]);
  for (const [rel, dir, size, mtime] of scan.files) {
    const cut = rel.lastIndexOf('/');
    const parent = cut < 0 ? '' : rel.slice(0, cut);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push({ name: rel.slice(cut + 1), dir: Boolean(dir), size, mtime });
  }
  const sideStat = new Map();
  for (const [rel, , size, mtime] of scan.side) sideStat.set(rel, { size, mtime });

  let ignore = [];
  try { ignore = parseIgnore(await fetchText('.notesignore')); } catch { /* none */ }

  const records = walkTree((rel) => children.get(rel) || [], { extensions: null, ignore });

  // ── text, from the cache when it is still current ─────────────────────
  const db = await openCache();
  const cached = await cacheGetAll(db);
  const texts = new Map();
  const wanted = [];
  for (const rec of records) {
    if (rec.dir || !rec.rel) continue;
    let key, size, mtime, url;
    if (NOTE_RE.test(rec.name)) {
      key = `n:${rec.rel}`; size = rec.size; mtime = rec.mtime; url = rec.rel;
    } else {
      const side = sideStat.get(`${rec.rel}.txt`);
      if (!side) continue;
      key = `s:${rec.rel}`; size = side.size; mtime = side.mtime; url = `${SIDE_DIR}/${rec.rel}.txt`;
    }
    const hit = cached.get(key);
    if (hit && hit.size === size && hit.mtime === mtime) texts.set(key, hit.text);
    else wanted.push({ key, size, mtime, url });
  }

  const fresh = [];
  let done = 0;
  await pool(wanted, 12, async (w) => {
    try {
      const text = await fetchText(w.url);
      texts.set(w.key, text);
      fresh.push([w.key, { size: w.size, mtime: w.mtime, text }]);
    } catch { /* unreadable: counted as a read failure by the indexer */ }
    done++;
    if (onProgress && done % 20 === 0) onProgress(done, wanted.length);
  });
  const stale = [...cached.keys()].filter((k) => !texts.has(k));
  cachePut(db, fresh, stale).then(() => db?.close());

  const built = buildIndex(records, {
    readNote: (rec) => texts.get(`n:${rec.rel}`) ?? null,
    readSide: (rec) => texts.get(`s:${rec.rel}`) || '',
    // Everything stays inline: there is no network to save, and one
    // in-memory tree is simpler than shards nobody needs.
    inlineLimit: Infinity,
  });

  const signature = records.map((r) => `${r.dir ? 'd' : 'f'}${r.rel}`).join('\n');
  // Every note's outgoing links, for "Linked mentions" (desktop/backlinks.js):
  // the text is all here already, so this costs one regex pass, no reads.
  const links = [];
  for (const [key, text] of texts) {
    if (!key.startsWith('n:')) continue;
    const found = noteLinks(text);
    if (found.length) links.push([key.slice(2), found]);
  }
  return {
    links,
    files: {
      'manifest.json': built.manifest,
      'fulltext.json': built.fulltext,
      'stats.json': built.stats,
    },
    records,
    signature,
    read: wanted.length,
  };
}
