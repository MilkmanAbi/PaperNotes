/** Where the index comes from.
 *
 *  On the website the index is a set of static JSON files under db/, built
 *  at deploy time. In the desktop app there is no build step: the app indexes
 *  the notes folder itself on start (src/desktop/indexer.js) and hands the
 *  result over here, so the tree and search read it from memory instead. */

import { assetUrl } from './paths.js';

let local = null;

/** Serve the index from memory: { 'manifest.json': …, 'fulltext.json': …, … }. */
export function useLocalDb(files) { local = files; }

export function hasLocalDb() { return local !== null; }

/** A db file's parsed JSON. Resolves to null when the file does not exist. */
export async function loadDb(name, { cache = 'no-cache' } = {}) {
  if (local) return local[name] ?? null;
  const res = await fetch(assetUrl(`db/${name}`), { cache });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText}`);
  return res.json();
}
