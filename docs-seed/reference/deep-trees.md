---
title: Folders all the way down
tags: [reference, theory]
---

# Folders all the way down

This site was built for a repository that keeps growing sideways and downwards
at the same time. Here is what it actually does about that.

## The index

`scripts/build-index.mjs` walks `content/` once and writes three files:

| File | What it is |
| --- | --- |
| `db/manifest.json` | The tree |
| `db/shards/*.json` | Subtrees deferred out of the manifest |
| `db/fulltext.json` | An inverted index over the note text |

The walk is iterative. Nothing in the build or the browser recurses over the
tree, because a directory chain long enough to overflow a call stack is a thing
that exists, and finding out the hard way is unpleasant.

## How the tree is stored

Not as nested objects. The manifest is a set of parallel arrays plus a string
table, in breadth-first order:

```
strings  ["", "optics", "drift.md", "index.md", ...]
name     [0, 1, 2, 3, ...]        -> indexes into strings
parent   [-1, 0, 1, 1, ...]
kind     "0010..."                -> one character per node
```

Two consequences, both load-bearing:

**Names are stored once.** A tree with a thousand folders each containing an
`index.md` stores that string one time and references it a thousand times.
Folder names repeat heavily in a real repository, so this is most of the
compression before gzip even gets involved.

**Children are contiguous.** Breadth-first ordering means every directory's
children occupy one unbroken range of ids, so "the children of node N" is two
integers — a start and a count — rather than a scan or a nested walk. Expanding
a folder with eight thousand files in it costs the same as expanding one with
three.

## Shards

Past a node budget, shipping the entire tree up front stops being reasonable.
The build then keeps the top of the tree in the manifest and writes whole
subtrees out to `db/shards/`, leaving a marker on the directory they came from.

Opening such a folder fetches its shard — one request for the whole subtree,
not one per level — and merges it in. Merging only ever appends, so ids already
handed to the tree renderer stay valid, and a folder that is still waiting says
so in its own row and nowhere else. If a shard fails to load, that folder
reports it and offers to retry; the rest of the tree carries on working.

Search is the one thing that genuinely needs the whole tree, so the first
search quietly pulls the remaining shards in the background. The results on
screen are correct for what has loaded so far, the status bar says how much
that is, and the results refresh as the rest arrives. What it does not do is
block the interface behind a spinner while it waits.

## Full text

The full-text index is an inverted index with an explicit byte budget. Terms
that match nearly everything are dropped first — they cost the most and
discriminate least — then the remainder is kept in order of selectivity until
the budget runs out. Postings are delta-encoded.

The honest part is what happens when the budget bites: the build records what
it had to drop, and the status bar passes that on instead of quietly returning
incomplete results. Name and title search is never affected, because it runs
off the manifest, which is always complete for the part of the tree that has
loaded.

## What the browser does

The tree renders about forty rows regardless of how many are open. Rows are
absolutely positioned inside a spacer of the full height, and the elements
themselves are pooled and reused rather than created and destroyed on each
scroll frame — which is what keeps scrolling smooth rather than merely
possible.

Expanding and collapsing happen on the frame you clicked. There is no animation
on the children appearing, because they either exist or they do not; the only
thing that animates is the chevron, which is acknowledging that something real
happened to the layout below it.

## Trying it at scale

```bash
npm run gen:stress     # ~40,000 notes, ten levels deep
npm run dev
```

The generator is deterministic for a given seed, so a slow case stays
reproducible. To force sharding on a smaller tree, lower the threshold:

```bash
node scripts/build-index.mjs --inline-limit 2000 --shard-limit 1000
```
