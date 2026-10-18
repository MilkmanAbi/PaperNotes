// The walk itself, with no file system attached: breadth-first, iterative,
// ignore rules applied, directories before files and each naturally sorted.
//
// It is shared by the Node indexer (walk.mjs, which lists directories with
// fs) and the desktop app (which lists them through the native host), so the
// two can never disagree about what the tree is or what order it is in.

export const DEFAULT_IGNORES = [
  '.git', '.github', 'node_modules', '.DS_Store', 'Thumbs.db', 'desktop.ini',
  '.obsidian', '.vscode', '.idea', 'dist', '.cache',
];

/** Parse the text of a .notesignore: one glob-ish pattern per line, # comments. */
export function parseIgnore(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

export function toMatcher(patterns) {
  const regexes = patterns.map((p) => {
    const rx = p
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0000/g, '.*')
      .replace(/\?/g, '[^/]');
    return new RegExp(`^${rx}$`);
  });
  return (name, relPath) =>
    regexes.some((r) => r.test(name) || r.test(relPath));
}

/**
 * @param {(rel: string) => Array<{name: string, dir: boolean, size?: number,
 *          mtime?: number, abs?: string}> | null} listDir
 *        children of a content-relative directory ('' is the root), or null
 *        when it could not be read
 * @returns records, [0] being the synthetic root, in breadth-first order
 */
export function walkTree(listDir, opts = {}) {
  const {
    extensions = ['.md', '.markdown', '.mdx'],
    ignore = [],
    maxDepth = Infinity,
    onProgress = null,
  } = opts;

  const isIgnored = toMatcher([...DEFAULT_IGNORES, ...ignore]);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const byName = (a, b) => collator.compare(a.name, b.name);

  const records = [{ name: '', parent: -1, dir: true, rel: '', depth: 0 }];
  const queue = [0];
  let head = 0;
  let scanned = 0;

  while (head < queue.length) {
    const idx = queue[head++];
    const rec = records[idx];
    if (rec.depth >= maxDepth) continue;

    const entries = listDir(rec.rel);
    if (!entries) continue;

    const dirs = [];
    const files = [];
    for (const entry of entries) {
      const { name } = entry;
      if (name.startsWith('.')) continue;
      const rel = rec.rel ? `${rec.rel}/${name}` : name;
      if (isIgnored(name, rel)) continue;
      // The library's own settings files (read by the app, not notes).
      if (!rec.rel && !entry.dir && /^(info\.md|time[-_ ]?table\.csv)$/i.test(name)) continue;
      if (entry.dir) {
        dirs.push({ ...entry, rel });
      } else {
        const dot = name.lastIndexOf('.');
        const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
        if (extensions && !extensions.includes(ext)) continue;
        files.push({ ...entry, rel });
      }
    }
    dirs.sort(byName);
    files.sort(byName);

    for (const d of dirs) {
      queue.push(records.length);
      records.push({ name: d.name, parent: idx, dir: true, rel: d.rel, depth: rec.depth + 1, abs: d.abs });
    }
    for (const f of files) {
      records.push({
        name: f.name, parent: idx, dir: false, rel: f.rel, depth: rec.depth + 1,
        abs: f.abs, size: f.size || 0, mtime: f.mtime || 0,
      });
    }

    scanned += entries.length;
    if (onProgress && head % 500 === 0) onProgress(records.length, scanned);
  }

  return records;
}
