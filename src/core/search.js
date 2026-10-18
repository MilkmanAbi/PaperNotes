/** Search, in two honest tiers.
 *
 *  Tier 1 is names, titles, tags and folder names. It runs over whatever the
 *  tree store already holds, on every keystroke, with no debounce and no
 *  spinner — the data is in memory and the result is already known, so
 *  delaying it would only be slower (Patterns §1, PI §1.1).
 *
 *  Tier 2 is full text, which lives in a separate file that is fetched the
 *  first time anyone searches. While it is in flight the interface keeps
 *  answering from tier 1 and says so, rather than blanking the results or
 *  pretending it has already looked inside every note (PI §4.2, §4.4).
 *
 *  The index is capped at build time. When it had to drop terms or trim long
 *  notes it says so in its own stats, and the status bar repeats that to the
 *  user instead of quietly returning incomplete results. */

import { loadDb } from './db.js';
import { isNoteName } from './filetypes.js';

const MAX_RESULTS = 400;

export class Search {
  constructor(store) {
    this.store = store;
    this.fulltext = null;
    this.fulltextState = 'idle';   // idle | loading | ready | absent | failed
    this.fulltextError = null;
    this.stats = null;
    this._postings = null;
    this._docToNode = null;
    this._lowerTitles = null;
    this._listeners = new Set();
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  /** Forget everything derived from the old index (desktop refresh). */
  reset() {
    this.fulltext = null;
    this.fulltextState = 'idle';
    this.fulltextError = null;
    this._postings = null;
    this._ftPromise = null;
    this._docToNode = null;
    this._lowerTitles = null;
    this.loadStats();
  }
  _emit() { for (const fn of this._listeners) fn(this); }

  // ── tier 2 loading ───────────────────────────────────────────────────
  ensureFulltext() {
    if (this.fulltextState === 'loading' || this.fulltextState === 'ready') return this._ftPromise;
    this.fulltextState = 'loading';
    this._emit();
    this._ftPromise = (async () => {
      const data = await loadDb('fulltext.json', { cache: 'force-cache' });
      if (!data) { this.fulltextState = 'absent'; this._emit(); return; }
      const postings = new Map();
      for (let i = 0; i < data.terms.length; i++) {
        // Postings arrive delta-encoded; expand once, here.
        const deltas = data.postings[i];
        const ids = new Array(deltas.length);
        let prev = 0;
        for (let j = 0; j < deltas.length; j++) { prev += deltas[j]; ids[j] = prev; }
        postings.set(data.terms[i], ids);
      }
      this._postings = postings;
      this.fulltext = data;
      this.fulltextState = 'ready';
      this._emit();
    })().catch((err) => {
      this.fulltextState = 'failed';
      this.fulltextError = err;
      this._emit();
    });
    return this._ftPromise;
  }

  async loadStats() {
    try {
      const stats = await loadDb('stats.json');
      if (stats) { this.stats = stats; this._emit(); }
    } catch { /* stats are informational; their absence changes nothing */ }
  }

  _lowerTitleArray() {
    const store = this.store;
    if (!this._lowerTitles || this._lowerTitles.length !== store.nodeCount) {
      const arr = new Array(store.nodeCount);
      for (let i = 0; i < store.nodeCount; i++) {
        const t = store.title.get(i);
        arr[i] = t === undefined ? null : store.strings[t].toLowerCase();
      }
      this._lowerTitles = arr;
    }
    return this._lowerTitles;
  }

  _docToNodeMap() {
    const store = this.store;
    if (!this._docToNode || this._docToNodeSize !== store.nodeCount) {
      const map = new Map();
      for (let i = 0; i < store.nodeCount; i++) map.set(store.docId[i], i);
      this._docToNode = map;
      this._docToNodeSize = store.nodeCount;
    }
    return this._docToNode;
  }

  // ── the query ────────────────────────────────────────────────────────
  /**
   * @returns {{ results: Array, total: number, truncated: boolean,
   *             tier: 'names'|'names+text', coverage: {loaded:number,total:number} }}
   */
  run(query) {
    const store = this.store;
    const q = query.trim().toLowerCase();
    const empty = {
      results: [], total: 0, truncated: false, tier: 'names',
      coverage: this.coverage(), query: q,
    };
    if (!q) return empty;

    const terms = q.split(/\s+/).filter(Boolean);
    const names = store.lowerNames();
    const titles = this._lowerTitleArray();
    const tagNames = store.tagNames.map((t) => t.toLowerCase());

    const scored = [];
    const seen = new Set();

    for (let id = 1; id < store.nodeCount; id++) {
      const name = names[id];
      const title = titles[id];
      let score = 0;
      let ok = true;

      for (const term of terms) {
        let termScore = 0;
        const ni = name.indexOf(term);
        if (ni === 0) termScore = 100;
        else if (ni > 0) termScore = 60;
        else if (title) {
          const ti = title.indexOf(term);
          if (ti === 0) termScore = 90;
          else if (ti > 0) termScore = 50;
        }
        if (!termScore) {
          const tags = store.tags.get(id);
          if (tags && tags.some((t) => tagNames[t].includes(term))) termScore = 70;
        }
        if (!termScore) {
          // Last resort: the term may name an ancestor folder. Only walked
          // when nothing cheaper matched, so the common case stays O(1).
          let cur = store.parent[id];
          let depth = 0;
          while (cur > 0 && depth < 64) {
            if (names[cur].includes(term)) { termScore = 25; break; }
            cur = store.parent[cur];
            depth++;
          }
        }
        if (!termScore) { ok = false; break; }
        score += termScore;
      }

      if (!ok) continue;
      if (store.kind[id] === 1) score += isNoteName(name) ? 10 : 6;   // notes, then files, then folders
      if (name === q || title === q) score += 120;    // an exact hit wins
      score -= Math.min(20, store.depthOf(id));   // prefer shallower matches
      scored.push({ id, score, via: 'name' });
      seen.add(id);
    }

    // Tier 2 folds in, scored below name matches: a word buried in a note is
    // a weaker signal than the same word in its title.
    let tier = 'names';
    if (this._postings) {
      tier = 'names+text';
      const docToNode = this._docToNodeMap();
      let acc = null;
      for (const term of terms) {
        const hits = new Set();
        for (const [indexedTerm, ids] of this._postings) {
          if (indexedTerm === term || indexedTerm.startsWith(term)) {
            for (const d of ids) hits.add(d);
          }
        }
        acc = acc === null ? hits : new Set([...acc].filter((d) => hits.has(d)));
        if (!acc.size) break;
      }
      if (acc) {
        for (const docId of acc) {
          const node = docToNode.get(docId);
          if (node === undefined || seen.has(node)) continue;
          scored.push({ id: node, score: 20, via: 'text' });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score || a.id - b.id);
    const total = scored.length;
    return {
      results: scored.slice(0, MAX_RESULTS),
      total,
      truncated: total > MAX_RESULTS,
      tier,
      coverage: this.coverage(),
      query: q,
    };
  }

  /** How much of the repository the current answer actually covers. */
  coverage() {
    const store = this.store;
    const total = store.totals?.nodes ?? store.nodeCount;
    return {
      loaded: store.nodeCount,
      total,
      complete: store.shard.size === 0,
      pendingShards: store.shard.size,
    };
  }

  /** Terms worth highlighting inside an opened note. */
  highlightTerms(query) {
    return query.trim().toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  }
}
