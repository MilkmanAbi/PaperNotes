/** "Linked mentions" under a note: every note that links to it, by
 *  [[wikilink]], ![[embed]] or Markdown link (Obsidian's backlinks).
 *
 *  The indexer hands over each note's outgoing link targets as written;
 *  they are resolved here with the reader's own rules (resolveWiki), so a
 *  mention is counted exactly when clicking it would land on this note. */

import { resolveRelative, toHash } from '../core/paths.js';
import { icon } from '../ui/icons.js';

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Backlinks {
  constructor(reader) {
    this.reader = reader;
    this.links = [];
    this.map = null;
  }

  /** New link lists from a fresh index. */
  set(links) {
    this.links = links || [];
    this.map = null;
  }

  _build() {
    const map = new Map();
    for (const [from, targets] of this.links) {
      const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
      for (const t of targets) {
        let to = null;
        if (t.startsWith('./')) {
          const r = resolveRelative(dir, t.slice(2));
          if (r) to = safeDecode(r.split('#')[0]);
        } else {
          to = this.reader.resolveWiki(t);
        }
        if (!to || to === from) continue;
        if (!map.has(to)) map.set(to, new Set());
        map.get(to).add(from);
      }
    }
    this.map = map;
  }

  /** Paths of the notes that link to `path`. */
  of(path) {
    if (!this.map) this._build();
    return [...(this.map.get(path) || [])].sort((a, b) => a.localeCompare(b));
  }

  /** The section shown at the foot of a note, or null when nothing links here. */
  element(path) {
    const from = this.of(path);
    if (!from.length) return null;
    const el = document.createElement('section');
    el.className = 'backlinks';
    el.setAttribute('aria-label', 'Notes that link here');
    el.innerHTML = `<h2 class="backlinks__title">${icon('link')}<span>Linked mentions</span><span class="backlinks__count">${from.length}</span></h2>
      <ul class="backlinks__list">${from.map((p) => {
        const name = p.split('/').pop().replace(/\.(md|markdown|mdx)$/i, '');
        const folder = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
        return `<li><a href="${esc(toHash(p))}">${icon('note')}<span class="backlinks__name">${esc(name)}</span>${folder ? `<span class="backlinks__folder">${esc(folder)}</span>` : ''}</a></li>`;
      }).join('')}</ul>`;
    return el;
  }
}
