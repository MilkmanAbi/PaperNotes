# PaperNotes 📓

A notebook you open in the browser. Drop markdown into folders, push, and it
shows up as a tired, hand-drawn **table of contents** on beige graph paper.
Press a topic, go in, read your notes with a red margin rule, taped-in photos,
inline video and embedded PDFs — and scribble in the margins if you want.

Built on the [PaperDesign](https://github.com/MilkmanAbi/PaperDesign) language.
No framework, no build step for the app itself — just static files + `fetch`.

---

## The repo shape

```
PaperNotes/            ← the engine (all the logic lives here)
  css/paper.css
  js/app.js
  js/markdown.js
  tools/generate-manifest.mjs
  manifest.json        ← auto-generated index of your notes
index.html             ← the page GitHub serves (must be index.html, not .sh)
.nojekyll              ← REQUIRED (see below)

Abinaash/              ← a person's notebook (ANY top-level folder works)
  FSD/                 ← a module
    00-start-here.md
    01-how-the-web-works.md
    …
    _meta.json         ← optional: pretty title / code / emoji for the module
Vanavan/               ← another person, same idea
  ACF/  MAD/  …
```

**The rule:** any top-level folder that isn't `PaperNotes` (or `.github`,
`assets`, `node_modules`, `docs`, `tools`) is treated as a **person**. Inside a
person are **module** folders. Inside a module are your `.md` **notes**. Nothing
is hardcoded — the folders are discovered.

> On `index.sh`: GitHub Pages serves a site from **`index.html`**, so that's the
> entry file here. There's no `.sh` build step — pushing is the build.

---

## Add notes (the whole workflow)

1. Make a folder path: `YourName/ModuleName/`.
2. Drop `.md` files in it. Optionally add `_meta.json` for a nicer module label.
3. `git push`. Done — it appears in the contents.

Each note can start with optional frontmatter:

```markdown
---
title: React Fundamentals
emoji: (｡･ω･｡)
order: 7
blurb: components, props, state, the mental model
---

# your markdown here
```

`_meta.json` (optional, per module):

```json
{
  "title": "Full Stack Development",
  "code": "ET0744",
  "emoji": "(◕‿◕)",
  "tagline": "browser → HTTP → server → database → back again"
}
```

---

## Why your notes actually load now (the 404 fix)

GitHub Pages runs **Jekyll** by default, which turns any `.md` file with
frontmatter into `.html` — so fetching the raw `.md` on the deployed site
returned **404**. PaperNotes now sidesteps that completely:

- **Structure** comes from `PaperNotes/manifest.json` (JSON is never touched by
  Jekyll). It's regenerated on every push by the workflow, so "drop a folder and
  push" just works.
- **Note content** is pulled **raw from the repo** via
  `raw.githubusercontent.com`, which serves your real markdown regardless of
  Jekyll. If that ever misses, it falls back to the locally-served file, and then
  to a Jekyll-converted `.html` — so it loads no matter what.
- **`.nojekyll`** is included as a belt-and-braces so the served copies stay raw
  too. Keep it.

If the manifest is ever missing, the app falls back to discovering the tree via
the **GitHub API** (public repos only; ~60 requests/hour per IP unauthenticated —
plenty for a personal site).

The repo it reads is auto-detected on `*.github.io`. For local dev it falls back
to the `CONFIG.repo` value at the top of `PaperNotes/js/app.js` — change owner /
name / branch there if you fork it.

---

## Deploy to GitHub Pages

The workflow (`.github/workflows/deploy.yml`) regenerates the manifest and
deploys on every push to `main`. Turn it on once:

1. Push this repo to GitHub (public).
2. **Settings → Pages → Build and deployment → Source → GitHub Actions.**
3. Push to `main` — the site builds and goes live.

To preview locally: `python3 -m http.server` from the repo root, then open
`http://localhost:8000`. (Locally it reads content from your working files.)

---

## Reading & studying

- **Notebook front page** — beige graph paper, red margin, punched holes, a
  hand-drawn table of contents grouped by person. Handwriting is *Kalam* (a pen,
  not a marker).
- **Reader** — markdown with syntax-highlighted code and copy buttons, images
  taped in like photos (click to zoom), inline `<video>`, and embedded PDFs.
- **Scribble** (✎ or `s`) — draw on any page; your doodles are saved per note.
- **Progress** — mark notes read; each module tracks how far you've gotten.
- **`:3`** — a small study gremlin bottom-right. Click it. It has opinions.
- **Shortcuts** — `/` search · `d` theme · `s` scribble · `← / →` prev/next.
- **Paper style** (▦ / ▤ / ▢) and light/dark are remembered.

Everything is stored locally in your browser; nothing leaves the page except
fetching your own notes from the repo.

---

Made for cute, mundane notes. Go study. `>:3`
