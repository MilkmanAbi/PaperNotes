# PaperNotes 📓

A notebook you open in the browser. Drop markdown into folders — nested however
deep you like — push, and it shows up as a **file tree** on beige graph paper.
Search across every note, heading and folder; open a page and read with
syntax-highlighted code, taped-in photos, inline video, embedded PDFs, an
on-this-page outline, and margin scribbles.

Built on the [PaperDesign](https://github.com/MilkmanAbi/PaperDesign) language.
No framework, no build step for the app itself — static files + `fetch`.

---

## What's new in v2

- **Arbitrary folder depth.** The old two-level `Person/Module` limit is gone.
  Nest `Abinaash/FSD/Lab/…`, or go deeper — the app builds a real tree.
- **A folder tree on the front page.** Expand/collapse folders (open state is
  remembered), see per-folder progress, jump straight into a note or open the
  folder's own page.
- **Global search.** One box searches note **titles, headings, blurbs, tags,
  folder names and body text**, with breadcrumbs, highlighting and keyboard
  navigation. Also in the command palette (`Ctrl/⌘ K`).
- **Breadcrumbs** everywhere, so you always know where you are and can hop up.
- **Folder (browse) pages** — a folder as a page of subfolder cards + note cards.
- **On-this-page outline** in the reader, built from the note's headings, with
  scroll-spy that tracks your position.
- **Recents & bookmarks** — "continue reading" and ⭐ bookmarks surface on the
  home page. Star from the tree, a card, or the reader.

Everything from before still works: light/dark, four "lead" accents, paper
styles, per-note scribbles, read tracking, the study gremlin.

---

## The repo shape

```
PaperNotes/              ← the engine (all the logic)
  css/paper.css
  js/app.js
  js/markdown.js
  manifest.json          ← auto-generated tree + search index
tools/generate-manifest.mjs
index.html               ← the page GitHub serves
.nojekyll                ← keep it (see below)

Abinaash/                ← ANY top-level folder that isn't the engine
  _meta.json             ← optional label for this folder
  FSD/
    _meta.json
    Theory/
      _meta.json
      00-start-here.md
      …
    Lab/
      _meta.json
      00-lab-overview.md
      …
```

**The rule:** any folder (at any depth) that isn't ignored is a browsable
folder. Any `.md` file inside one (not starting with `_`) is a note. A folder
with no notes anywhere beneath it is pruned. Ignored at the top level:
`PaperNotes`, `tools`, `.github`, `assets`, `node_modules`, `docs`, `build`.
Root-level `.md` files (like this README) are treated as repo docs, not notes.

---

## Add notes

1. Make a folder path, any depth: `YourName/Subject/Section/`.
2. Drop `.md` files in. Optionally add `_meta.json` to any folder for a nice
   title / emoji / blurb.
3. Regenerate the index: `node tools/generate-manifest.mjs`.
4. `git push`.

Note frontmatter (all optional):

```markdown
---
title: React Fundamentals
emoji: (｡･ω･｡)
order: 7
blurb: components, props, state, the mental model
tags: react, hooks, jsx
---

# your markdown here
```

`order` sorts notes within a folder; `tags` are searchable. `_meta.json` (per
folder, all optional):

```json
{
  "title": "Full Stack Development",
  "code": "ET0744",
  "emoji": "(◕‿◕)",
  "accent": "blue",
  "blurb": "one line shown under the folder",
  "tagline": "browser → HTTP → server → database → back again",
  "order": 0
}
```

---

## The manifest (why search + the tree are instant)

`node tools/generate-manifest.mjs` walks the repo to any depth and writes
`PaperNotes/manifest.json` — a nested **tree** for the file-tree UI plus a flat
**index** (titles, blurbs, tags, extracted headings, an excerpt and reading
time per note) that powers global search without any API calls. Re-run it
whenever you add or move notes.

If the manifest is missing, the app falls back to discovering the tree live via
the **GitHub API** (public repos, ~60 req/hr/IP unauthenticated). Note **content**
is always pulled **raw** from `raw.githubusercontent.com`, so it renders no
matter what Jekyll does to `.md` files. `.nojekyll` keeps the served copies raw
too — keep it.

The repo is auto-detected on `*.github.io`. For local dev it uses `CONFIG.repo`
at the top of `PaperNotes/js/app.js` — change owner / name / branch if you fork.

---

## Deploy / preview

- **GitHub Pages:** push (public) → **Settings → Pages → Source → GitHub
  Actions** (or your existing workflow) → live. Remember to run the manifest
  generator before pushing, or wire it into your workflow.
- **Locally:** `python3 -m http.server` from the repo root, open
  `http://localhost:8000`.

---

## Keys & controls

- **`/`** — focus search (home / reader) or open the command palette elsewhere.
- **`Ctrl/⌘ K`** (or `Ctrl/⌘ S`) — command palette: global search + tools.
  `↑/↓` to move, `Enter` to open.
- **`← / →`** — previous / next note.
- **`✎`** — scribble on the page (saved per note). **`Esc`** exits.
- Accent "leads", light/dark, and paper style live in the palette's tools row
  and are remembered.
- **`:3`** — the study gremlin, bottom-right. Click it. It has opinions.

Everything is stored locally in your browser; nothing leaves the page except
fetching your own notes.

---

Made for cute, mundane notes. Go study. `>:3`
