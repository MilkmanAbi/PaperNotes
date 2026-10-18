// From walk records to the data the site loads: the manifest, its shards,
// the full-text index and the stats. No file system in here, so the Node
// build (scripts/build-index.mjs) and the desktop app (src/desktop/) run the
// exact same code and can never drift apart.

import { partition } from './partition.mjs';
import { parseFrontMatter, firstHeading, toPlainText } from './frontmatter.mjs';
import { buildFulltext } from './fulltext.mjs';

export const NOTE_RE = /\.(md|markdown|mdx)$/i;

/** Turn "03-my-first-note.md" into "My first note". */
export function humanize(filename) {
  return filename
    .replace(/\.(md|markdown|mdx)$/i, '')
    .replace(/^\d{1,4}[-_. ]+/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * @param {Array} records   from walkTree / walk
 * @param {object} opts
 *   readNote(rec)   the note's text, or null if it could not be read
 *   readSide(rec)   an attachment's sidecar text, or ''
 * @returns {{ manifest, shards: Array<{name, payload}>, fulltext, stats }}
 */
export function buildIndex(records, opts = {}) {
  const {
    readNote,
    readSide = () => '',
    inlineLimit = 60000,
    shardLimit = 20000,
    minShard = 400,
    wantFulltext = true,
    fulltextBytes = 8 * 1024 * 1024,
    // Long enough for a whole slide deck's text; the byte budget above is
    // what actually bounds the download.
    docChars = 400000,
    onReadError = () => {},
  } = opts;

  const fileCount = records.filter((r) => !r.dir).length;
  const noteCount = records.filter((r) => !r.dir && NOTE_RE.test(r.name)).length;
  const dirCount = records.length - 1 - fileCount;
  const maxDepth = records.reduce((m, r) => Math.max(m, r.depth), 0);

  // ── string interning ────────────────────────────────────────────────
  // Folder and file names repeat heavily in a deep tree ("index.md" a
  // thousand times over), so names are stored once and referenced by id.
  //
  // Each output file gets its own table. A single shared table would be
  // simpler, but it would mean the root manifest shipping every string in
  // the repository — including the names of notes inside subtrees that were
  // deferred precisely so they would not be downloaded up front.
  const newTable = () => {
    const strings = [];
    const ids = new Map();
    const intern = (value) => {
      let id = ids.get(value);
      if (id === undefined) { id = strings.length; strings.push(value); ids.set(value, id); }
      return id;
    };
    return { strings, intern };
  };

  // Tags are global: the tag vocabulary is small, the manifest always loads
  // before any shard, and shards reference tags by id into it.
  const tagNames = [];
  const tagIds = new Map();
  const internTag = (t) => {
    let id = tagIds.get(t);
    if (id === undefined) { id = tagNames.length; tagNames.push(t); tagIds.set(t, id); }
    return id;
  };

  // ── per-note metadata ───────────────────────────────────────────────
  const titleOverride = {};   // node id -> the title text itself
  const tagsByNode = {};
  const fulltextDocs = [];
  let totalBytes = 0;
  let readFailures = 0;

  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    if (rec.dir) continue;
    totalBytes += rec.size || 0;

    // An attachment keeps its file name as its title, and is found by its
    // name, its path and whatever text its sidecar holds. It is never read:
    // a 30 MB zip decoded as UTF-8 is noise, not an index.
    if (!NOTE_RE.test(rec.name)) {
      if (wantFulltext) {
        fulltextDocs.push({ docId: i, text: `${rec.rel.replace(/[/\\]/g, ' ')} ${readSide(rec) || ''}` });
      }
      continue;
    }

    const raw = readNote(rec);
    if (raw === null || raw === undefined) {
      readFailures++;
      onReadError(rec);
      continue;
    }

    const { data, body } = parseFrontMatter(raw);
    const derived = humanize(rec.name);
    const title = (typeof data.title === 'string' && data.title.trim())
      || firstHeading(body)
      || derived;
    if (title !== derived) titleOverride[i] = title;

    const rawTags = Array.isArray(data.tags) ? data.tags
      : typeof data.tags === 'string' && data.tags.trim() ? data.tags.split(/[,\s]+/)
      : [];
    const tags = rawTags.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean);
    if (tags.length) tagsByNode[i] = tags.map(internTag);

    if (wantFulltext) {
      const text = `${title} ${rec.rel.replace(/[/\\]/g, ' ')} ${tags.join(' ')} ${toPlainText(body)}`;
      fulltextDocs.push({ docId: i, text });
    }
  }

  // ── shape the tree for delivery ─────────────────────────────────────
  const { inline, shards } = partition(records, { inlineLimit, shardLimit, minShard });

  const shardNameFor = new Map();
  shards.forEach((s, i) => shardNameFor.set(s.rootId, `s${i}`));

  // Nodes are renumbered so the root manifest is a dense 0..n-1 range and each
  // shard is its own dense range. The client stitches them together on merge.
  const globalToLocal = new Int32Array(records.length).fill(-1);

  const emitNodes = (ids, { rootId = null } = {}) => {
    const table = newTable();
    const intern = table.intern;
    const name = [];
    const parent = [];
    const kind = [];
    const size = [];
    const mtime = [];
    const title = {};
    const tags = {};
    const shardMap = {};

    ids.forEach((gid, local) => { globalToLocal[gid] = local; });

    ids.forEach((gid, local) => {
      const rec = records[gid];
      name.push(intern(rec.name));
      if (gid === 0) parent.push(-1);
      else if (rootId !== null && rec.parent === rootId) parent.push(-1);
      else parent.push(globalToLocal[rec.parent]);
      kind.push(rec.dir ? '0' : '1');
      size.push(rec.size || 0);
      mtime.push(rec.mtime || 0);
      if (titleOverride[gid] !== undefined) title[local] = intern(titleOverride[gid]);
      if (tagsByNode[gid] !== undefined) tags[local] = tagsByNode[gid];
      const sn = shardNameFor.get(gid);
      if (sn) shardMap[local] = sn;
    });

    const out = {
      strings: table.strings,
      name, parent, kind: kind.join(''), size, mtime,
      title, tags, shard: shardMap,
    };
    // docId is the stable identity the full-text postings refer to: it is the
    // walk order, so it survives shard boundaries moving between builds. When
    // local ids already equal it (the common unsharded case) it is omitted.
    const identity = ids.every((gid, local) => gid === local);
    if (!identity) out.docId = ids.slice();
    return out;
  };

  const inlineIds = [];
  for (let i = 0; i < records.length; i++) if (inline[i]) inlineIds.push(i);
  const rootNodes = emitNodes(inlineIds);

  const shardOut = shards.map((shard) => {
    const nodes = emitNodes(shard.ids, { rootId: shard.rootId });
    // The table sits beside the nodes, matching the manifest's shape.
    const strings = nodes.strings;
    delete nodes.strings;
    return {
      name: shardNameFor.get(shard.rootId),
      nodes: shard.ids.length,
      payload: { v: 1, root: records[shard.rootId].rel, strings, nodes },
    };
  });

  const rootStrings = rootNodes.strings;
  delete rootNodes.strings;

  const builtAt = Math.floor(Date.now() / 1000);
  const manifest = {
    v: 1,
    builtAt,
    contentBase: 'content',
    totals: {
      notes: noteCount,
      files: fileCount - noteCount,
      folders: dirCount,
      maxDepth,
      bytes: totalBytes,
      nodes: records.length,
      inlineNodes: inlineIds.length,
      shards: shards.length,
    },
    strings: rootStrings,
    tagNames,
    nodes: rootNodes,
  };

  let fulltext = null;
  let ftStats = null;
  if (wantFulltext && fulltextDocs.length) {
    const built = buildFulltext(fulltextDocs, { maxBytes: fulltextBytes, maxCharsPerDoc: docChars });
    fulltext = built.index;
    ftStats = built.stats;
  }

  const stats = {
    builtAt,
    notes: noteCount,
    files: fileCount - noteCount,
    folders: dirCount,
    maxDepth,
    nodes: records.length,
    inlineNodes: inlineIds.length,
    shards: shardOut.map((s) => ({ name: s.name, nodes: s.nodes })),
    fulltext: ftStats,
    readFailures,
  };

  return { manifest, shards: shardOut, fulltext, stats };
}
