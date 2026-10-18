/** Hash routing.
 *
 *  Deliberately hash-based. GitHub Pages serves static files with no rewrite
 *  rules, so a real path like /notes/optics/drift.md would 404 on reload and
 *  on every shared link. The fragment never reaches the server, which means
 *  one build works unchanged at the domain root, under /repo-name/, and on
 *  any local preview — no base-path guessing at runtime.
 *
 *  Route shape:  #/path/to/note.md             a note
 *                #/path/to/note.md#section-id  a note scrolled to a heading
 *                #/path/to/folder              a folder index
 *                #/                            the home view */

import { decodeHashPath, toHash } from './paths.js';

export class Router {
  /** ownHistory: every move replaces the history entry instead of adding
   *  one, because the tabs keep their own back/forward lists. */
  constructor({ ownHistory = false } = {}) {
    this.ownHistory = ownHistory;
    this._listeners = new Set();
    this._current = this.read();
    window.addEventListener('hashchange', () => {
      const next = this.read();
      const prev = this._current;
      this._current = next;
      for (const fn of this._listeners) fn(next, prev);
    });
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  read() {
    const hash = window.location.hash || '';
    const path = decodeHashPath(hash);
    const raw = hash.replace(/^#\/?/, '');
    const anchorIndex = raw.indexOf('#');
    const anchor = anchorIndex === -1 ? '' : raw.slice(anchorIndex + 1);
    return { path, anchor };
  }

  get current() { return this._current; }

  /** Navigate. `replace` avoids stacking history entries for incidental
   *  moves such as the tree cursor following a scroll. */
  go(path, { anchor = '', replace = false, force = false } = {}) {
    const next = toHash(path, anchor);
    if (window.location.hash === next && !force) return;
    if (replace || this.ownHistory) {
      const url = `${window.location.pathname}${window.location.search}${next}`;
      window.history.replaceState(null, '', url);
      this._current = this.read();
      for (const fn of this._listeners) fn(this._current, this._current);
    } else {
      window.location.hash = next;
    }
  }
}
