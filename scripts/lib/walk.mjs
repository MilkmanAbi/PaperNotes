// Iterative directory walker over the real file system. No recursion: a deep
// tree must not be able to blow the JS stack, which is the entire point of
// this project. The walk itself lives in tree-walk.mjs; this file only
// supplies the directory listings.
import fs from 'node:fs';
import path from 'node:path';
import { walkTree, parseIgnore } from './tree-walk.mjs';

/** Read the .notesignore in `dir`, if there is one. */
export function readIgnoreFile(dir) {
  const file = path.join(dir, '.notesignore');
  if (!fs.existsSync(file)) return [];
  return parseIgnore(fs.readFileSync(file, 'utf8'));
}

/**
 * Walk `root` and return flat records with parent links, breadth-first so
 * that every directory's children land in one contiguous id range — see
 * src/core/manifest.js for why that matters.
 *
 * `extensions: null` takes every file, not only notes.
 */
export function walk(root, opts = {}) {
  const { followSymlinks = false, ...rest } = opts;
  const seenReal = new Set(); // symlink loop protection

  const listDir = (rel) => {
    const abs = rel ? path.join(root, ...rel.split('/')) : root;
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (err) {
      process.stderr.write(`  ! skipped ${abs}: ${err.code}\n`);
      return null;
    }
    const out = [];
    for (const entry of entries) {
      const childAbs = path.join(abs, entry.name);
      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        if (!followSymlinks) continue;
        try {
          const st = fs.statSync(childAbs);
          isDir = st.isDirectory();
          isFile = st.isFile();
        } catch { continue; }
      }
      if (isDir) {
        if (followSymlinks) {
          let real;
          try { real = fs.realpathSync(childAbs); } catch { continue; }
          if (seenReal.has(real)) continue;
          seenReal.add(real);
        }
        out.push({ name: entry.name, dir: true, abs: childAbs });
      } else if (isFile) {
        let size = 0, mtime = 0;
        try {
          const st = fs.statSync(childAbs);
          size = st.size;
          mtime = Math.floor(st.mtimeMs / 1000);
        } catch { /* keep zeros */ }
        out.push({ name: entry.name, dir: false, abs: childAbs, size, mtime });
      }
    }
    return out;
  };

  return walkTree(listDir, rest);
}
