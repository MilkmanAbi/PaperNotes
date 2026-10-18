// Decide which parts of the tree ship in the root manifest and which parts
// get deferred into lazily-fetched subtree shards.
//
// The goal is not "smallest possible manifest". It is: the first paint must
// be cheap and bounded no matter how large the repository grows, and every
// deferred fetch must be a single request for a whole coherent subtree, so
// expanding a folder is one round trip rather than one per level.

/** subtreeSize[i] = node i plus all descendants. Relies on BFS id order. */
export function subtreeSizes(records) {
  const n = records.length;
  const size = new Int32Array(n).fill(1);
  for (let i = n - 1; i > 0; i--) size[records[i].parent] += size[i];
  return size;
}

/** childRanges: start/count per node, exploiting contiguous BFS children. */
export function childRanges(records) {
  const n = records.length;
  const start = new Int32Array(n).fill(-1);
  const count = new Int32Array(n);
  for (let i = 1; i < n; i++) {
    const p = records[i].parent;
    if (start[p] === -1) start[p] = i;
    count[p]++;
  }
  return { start, count };
}

/**
 * @returns {{ inline: Int32Array, shards: Array<{ rootId: number, ids: number[] }> }}
 *   `inline` is a membership mask over records; each shard carries the ids of
 *   every node strictly below its root, in BFS order.
 */
export function partition(records, opts = {}) {
  const { inlineLimit = 60000, shardLimit = 20000, minShard = 400 } = opts;
  const size = subtreeSizes(records);
  const { start, count } = childRanges(records);

  const inline = new Int32Array(records.length);
  inline[0] = 1; // the synthetic root always ships
  const shards = [];

  // Carve one bucket starting at `rootId`, deferring oversized subtrees.
  const carve = (rootId, budget, collector) => {
    const queue = [rootId];
    let head = 0;
    let used = 1;
    const deferred = [];

    while (head < queue.length) {
      const id = queue[head++];
      const s = start[id];
      if (s === -1) continue;
      const end = s + count[id];

      for (let c = s; c < end; c++) {
        const isDir = records[c].dir;
        const sub = size[c];

        // Defer a directory when its whole subtree is large enough to be
        // worth a round trip and we are far enough into the budget that
        // inlining it would push past it.
        const worthSharding = isDir && sub >= minShard;
        const wouldOverflow = used + sub > budget;
        if (worthSharding && (wouldOverflow || sub > budget * 0.6)) {
          collector(c); // the directory node itself still ships inline
          used += 1;
          deferred.push(c);
          continue;
        }

        collector(c);
        used += 1;
        if (isDir) queue.push(c);
      }
    }
    return deferred;
  };

  const pending = [{ rootId: 0, budget: inlineLimit, target: null }];

  while (pending.length) {
    const { rootId, budget, target } = pending.shift();
    const ids = target ? [] : null;
    const collect = (id) => {
      if (ids) ids.push(id);
      else inline[id] = 1;
    };
    const deferred = carve(rootId, budget, collect);
    if (target) target.ids = ids;
    for (const d of deferred) {
      const shard = { rootId: d, ids: [] };
      shards.push(shard);
      pending.push({ rootId: d, budget: shardLimit, target: shard });
    }
  }

  return { inline, shards, size, start, count };
}
