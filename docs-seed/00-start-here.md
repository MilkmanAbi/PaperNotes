---
title: Start here
tags: [reference]
---

# Start here

This is a notes site. It reads a folder of Markdown files, builds an index of
them at build time, and serves the whole thing as static files — which means it
runs on GitHub Pages with no server, no database and no build step at view time.

Everything you can see right now came out of `content/`. Add a file there and it
appears in the tree; the only thing that has to happen in between is the index
being rebuilt, which `npm run dev` does for you on every save.

## What it is built to survive

The design constraint was a repository with an unreasonable number of folders,
nested unreasonably deep. Three things follow from that:

- **The tree is virtualised.** However many rows are open, only the ones on
  screen exist in the browser. Depth is not a limit either — nothing in the
  rendering path recurses.
- **Big trees arrive in parts.** Past a threshold, the index ships the top of
  the tree and defers whole subtrees into separate files, fetched the first
  time you open the folder that needs one. One request per subtree, not one
  per level.
- **Search says what it actually covered.** Names and titles are matched
  instantly from memory. Full text comes from a separate index that loads on
  your first search, and if it hit its size budget at build time the status bar
  tells you so rather than quietly returning less.

## Getting around

| Key | Does |
| --- | --- |
| <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> | Command palette — jump to any note by name |
| <kbd>/</kbd> | Focus the filter |
| <kbd>\\</kbd> | Show or hide the tree |
| <kbd>[</kbd> <kbd>]</kbd> | Previous and next note |
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> | Move around the tree |

The two controls in the toolbar are density and theme. Density changes spacing
only — text never shrinks because a window got smaller or a mode got tighter.
Theme follows your operating system until you tell it otherwise, and keeps
following it if you change your mind mid-session.

## Where to look next

- [Markdown, maths and code](reference/markdown-and-math.md) — everything the
  renderer handles, on one page.
- [HTML and CSS inside a note](reference/html-and-css-in-notes.md) — including
  what a note is deliberately not allowed to do.
- [Folders all the way down](reference/deep-trees.md) — how the index is built
  and what happens as it grows.

Most of the rest of this tree is generated filler, there to make the structure
heavy enough to be worth testing against. `deep-recursion/` in particular is a
single chain twenty-six levels deep, which is the sort of thing that reveals
whether a tree view was written carefully.
