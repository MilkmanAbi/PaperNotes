/** The tree store.
 *
 *  The manifest arrives as parallel arrays with an interned string table,
 *  in breadth-first order. That ordering is load-bearing: every directory's
 *  children occupy one contiguous id range, so "give me the children of
 *  node N" is two integers rather than a scan or a nested object walk, and
 *  the whole structure stays flat no matter how deep the folders go.
 *
 *  Subtrees past the inline budget are deferred into shards. A shard is a
 *  single fetch for a whole subtree — one round trip per expanded region,
 *  not one per level — and merging it only ever appends, so ids already
 *  handed out to the renderer stay valid. */

import { assetUrl, encodePath } from './paths.js';
import { loadDb } from './db.js';

export class TreeStore {
  constructor() {
    this.strings = [];
    this.tagNames = [];
    this.name = [];
    this.parent = [];
    this.kind = [];        // 0 = directory, 1 = note
    this.size = [];
    this.mtime = [];
    this.title = new Map();
    this.tags = new Map();
    this.shard = new Map();   // nodeId -> shard name, for not-yet-fetched subtrees
    this.docId = [];          // nodeId -> stable walk id used by the full-text index
    this.childStart = [];
    this.childCount = [];
    this.totals = null;
    this.contentBase = 'content';
    this._pathCache = new Map();
    this._lowerName = null;
    this._shardPromises = new Map();
    this._listeners = new Set();
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(detail) { for (const fn of this._listeners) fn(detail); }

  get nodeCount() { return this.name.length; }

  /** Every shard name still unfetched, in manifest order. */
  pendingShards() { return [...this.shard.entries()]; }

  static async load() {
    const data = await loadDb('manifest.json');
    if (!data) throw new Error('manifest 404 Not Found');
    const store = new TreeStore();
    store._ingestRoot(data);
    return store;
  }

  /** Swap in a freshly built index without replacing the store object, so
   *  everything holding a reference to it keeps working. Ids are re-dealt:
   *  callers re-resolve anything they kept by id (see src/desktop/app.js). */
  reload(data) {
    const listeners = this._listeners;
    Object.assign(this, new TreeStore());
    this._listeners = listeners;
    this._ingestRoot(data);
    this._emit({ type: 'reload' });
  }

  _ingestRoot(data) {
    this.strings = data.strings || [];
    this.tagNames = data.tagNames || [];
    this.totals = data.totals || {};
    this.contentBase = data.contentBase || 'content';

    const n = data.nodes;
    this.name = n.name.slice();
    this.parent = n.parent.slice();
    this.size = n.size ? n.size.slice() : new Array(this.name.length).fill(0);
    this.mtime = n.mtime ? n.mtime.slice() : new Array(this.name.length).fill(0);
    this.kind = new Array(this.name.length);
    for (let i = 0; i < this.name.length; i++) this.kind[i] = n.kind.charCodeAt(i) - 48;
    this.docId = n.docId ? n.docId.slice() : this.name.map((_, i) => i);

    for (const [k, v] of Object.entries(n.title || {})) this.title.set(+k, v);
    for (const [k, v] of Object.entries(n.tags || {})) this.tags.set(+k, v);
    for (const [k, v] of Object.entries(n.shard || {})) this.shard.set(+k, v);

    this._rebuildChildRanges(0, this.name.length);
  }

  /** Children are contiguous, so ranges are one linear pass over a slice. */
  _rebuildChildRanges(from, to) {
    for (let i = from; i < to; i++) {
      if (this.childStart[i] === undefined) { this.childStart[i] = -1; this.childCount[i] = 0; }
    }
    for (let i = Math.max(from, 1); i < to; i++) {
      const p = this.parent[i];
      if (p < 0) continue;
      if (this.childStart[p] === -1 || this.childStart[p] === undefined) this.childStart[p] = i;
      this.childCount[p] = (this.childCount[p] || 0) + 1;
    }
  }

  nameOf(id) { return this.strings[this.name[id]] || ''; }

  /** A path's node id, synchronously, from what is loaded (-1 if unknown). */
  lookup(path) {
    if (!path) return 0;
    if (!this._byPath || this._byPathSize !== this.name.length) {
      this._byPath = new Map();
      for (let i = 1; i < this.name.length; i++) this._byPath.set(this.pathOf(i), i);
      this._byPathSize = this.name.length;
    }
    return this._byPath.get(path) ?? -1;
  }

  titleOf(id) {
    const t = this.title.get(id);
    if (t !== undefined) return this.strings[t];
    const raw = this.nameOf(id);
    if (this.kind[id] === 0) return raw;
    return raw.replace(/\.(md|markdown|mdx)$/i, '').replace(/^\d{1,4}[-_. ]+/, '').replace(/[-_]+/g, ' ');
  }

  tagsOf(id) {
    const t = this.tags.get(id);
    return t ? t.map((i) => this.tagNames[i]) : [];
  }

  isDir(id) { return this.kind[id] === 0; }

  pathOf(id) {
    if (id === 0) return '';
    const cached = this._pathCache.get(id);
    if (cached !== undefined) return cached;
    const segments = [];
    let cur = id;
    while (cur > 0) {
      segments.push(this.nameOf(cur));
      cur = this.parent[cur];
    }
    const path = segments.reverse().join('/');
    this._pathCache.set(id, path);
    return path;
  }

  /** Depth without allocating. Filled in on demand and extended as shards
   *  merge, because search asks for it once per match and a tree this size
   *  turns an array-per-match into real time. */
  depthOf(id) {
    if (!this._depth) this._depth = [];
    const cached = this._depth[id];
    if (cached !== undefined) return cached;
    let depth = 0;
    let cur = id;
    const chain = [];
    while (cur > 0) {
      const known = this._depth[cur];
      if (known !== undefined) { depth = known; break; }
      chain.push(cur);
      cur = this.parent[cur];
    }
    for (let i = chain.length - 1; i >= 0; i--) this._depth[chain[i]] = ++depth;
    return this._depth[id] ?? 0;
  }

  ancestorsOf(id) {
    const out = [];
    let cur = this.parent[id];
    while (cur !== undefined && cur >= 0) { out.push(cur); cur = this.parent[cur]; }
    return out.reverse();
  }

  childrenOf(id) {
    const start = this.childStart[id];
    const count = this.childCount[id] || 0;
    if (start === undefined || start < 0 || count === 0) return [];
    const out = new Array(count);
    for (let i = 0; i < count; i++) out[i] = start + i;
    return out;
  }

  /** Does this directory still have a subtree waiting on the network? */
  isDeferred(id) { return this.shard.has(id); }

  /** Fetch and merge a directory's deferred subtree. Idempotent. */
  async ensureChildren(id) {
    const shardName = this.shard.get(id);
    if (!shardName) return false;
    if (this._shardPromises.has(shardName)) return this._shardPromises.get(shardName);

    const promise = (async () => {
      const data = await loadDb(`shards/${shardName}.json`, { cache: 'force-cache' });
      if (!data) throw new Error(`shard ${shardName}: 404 Not Found`);
      this._mergeShard(id, data);
      this.shard.delete(id);
      this._emit({ type: 'shard', nodeId: id, added: data.nodes.name.length });
      return true;
    })();

    this._shardPromises.set(shardName, promise);
    try {
      return await promise;
    } catch (err) {
      // A failed shard must not poison the node forever: drop the memo so a
      // retry is possible, and leave the directory marked deferred.
      this._shardPromises.delete(shardName);
      throw err;
    }
  }

  _mergeShard(rootId, data) {
    const n = data.nodes;
    const base = this.name.length;
    const count = n.name.length;

    // The shard carries its own string table; remap into the live one.
    const stringMap = new Map();
    const localStrings = data.strings;
    const mapString = (localId) => {
      if (!localStrings) return localId;   // shard reuses the root table
      let mapped = stringMap.get(localId);
      if (mapped === undefined) {
        mapped = this.strings.length;
        this.strings.push(localStrings[localId]);
        stringMap.set(localId, mapped);
      }
      return mapped;
    };

    for (let i = 0; i < count; i++) {
      this.name.push(mapString(n.name[i]));
      const p = n.parent[i];
      this.parent.push(p === -1 ? rootId : base + p);
      this.kind.push(n.kind.charCodeAt(i) - 48);
      this.size.push(n.size ? n.size[i] : 0);
      this.mtime.push(n.mtime ? n.mtime[i] : 0);
      this.docId.push(n.docId ? n.docId[i] : base + i);
    }

    // Titles are string ids in the shard's own table, so they need the same
    // remapping the names did. Tags are not: the tag vocabulary is global and
    // lives in the manifest, which has always loaded by this point.
    for (const [k, v] of Object.entries(n.title || {})) this.title.set(base + +k, mapString(v));
    for (const [k, v] of Object.entries(n.tags || {})) this.tags.set(base + +k, v);
    for (const [k, v] of Object.entries(n.shard || {})) this.shard.set(base + +k, v);

    // The merged directory gains exactly the shard's top-level nodes, which
    // are contiguous because the shard was written breadth-first.
    this.childStart[rootId] = base;
    let topLevel = 0;
    for (let i = 0; i < count; i++) if (n.parent[i] === -1) topLevel++;
    this.childCount[rootId] = topLevel;
    this._rebuildChildRanges(base, base + count);

    this._lowerName = null;   // the search cache is now stale
  }

  /** Pull in every deferred subtree. Reports progress; never blocks the UI. */
  async loadAll({ onProgress, concurrency = 6 } = {}) {
    let done = 0;
    const failures = [];
    for (;;) {
      const pending = [...this.shard.keys()];
      if (!pending.length) break;
      const batch = pending.slice(0, concurrency);
      await Promise.all(batch.map(async (id) => {
        try { await this.ensureChildren(id); }
        catch (err) { failures.push(err); this.shard.delete(id); }
        done++;
        onProgress?.(done, done + this.shard.size);
      }));
      if (batch.every((id) => this.shard.has(id))) break;  // no forward progress
    }
    return { failures };
  }

  /** Lowercased names, built once and reused by every keystroke. */
  lowerNames() {
    if (!this._lowerName || this._lowerName.length !== this.name.length) {
      const arr = new Array(this.name.length);
      for (let i = 0; i < this.name.length; i++) arr[i] = this.nameOf(i).toLowerCase();
      this._lowerName = arr;
    }
    return this._lowerName;
  }

  /** Walk a content path to its node, fetching shards along the way. */
  async resolvePath(path) {
    if (!path) return 0;
    const segments = path.split('/').filter(Boolean);
    let cur = 0;
    for (const segment of segments) {
      if (this.isDeferred(cur)) await this.ensureChildren(cur);
      const kids = this.childrenOf(cur);
      let found = -1;
      for (const kid of kids) {
        if (this.nameOf(kid) === segment) { found = kid; break; }
      }
      if (found === -1) {
        // Case-insensitive retry: GitHub Pages is case-sensitive but people
        // and other filesystems are not, so a near miss is worth catching.
        const lower = segment.toLowerCase();
        for (const kid of kids) {
          if (this.nameOf(kid).toLowerCase() === lower) { found = kid; break; }
        }
      }
      if (found === -1) return -1;
      cur = found;
    }
    return cur;
  }

  contentUrl(path) {
    return assetUrl(`${this.contentBase}/${encodePath(path)}`);
  }

  /** Every note in the order the tree displays them, for prev/next links.
   *  Iterative, because the whole point of this project is that depth is
   *  not allowed to be a limit. */
  noteOrder() {
    if (this._order && this._orderSize === this.name.length) return this._order;
    const out = [];
    const stack = [0];
    while (stack.length) {
      const id = stack.pop();
      if (this.kind[id] === 1) { out.push(id); continue; }
      const kids = this.childrenOf(id);
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
    this._order = out;
    this._orderSize = this.name.length;
    return out;
  }
}
