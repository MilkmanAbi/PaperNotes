# PaperNotes

A ground-up redesign of PaperNotes, built on the PaperDesign language as a single
self-contained app. Cozy notebook UI - folder tree, reader, global search, command
palette, outline, settings (themes / glass / paper / wallpapers), pomodoro + study
buddy. All client-side.

## What's here

```
index.html                 the app (a single Design Component)
support.js                 the runtime it needs (loads React 18 from a CDN)
PaperNotes/pn-data.js      >> the notebook content lives here <<
PaperNotes/wallpapers/     the three glass backdrops
.nojekyll                  tells GitHub Pages to serve everything as-is
```

## The content

Everything you read is one file: `PaperNotes/pn-data.js`. It exports a `NOTEBOOK`
array - a nested tree of folders and notes. Each note carries its markdown in a
`body` field; the app computes paths, reading time, headings and excerpts at load.

Current notebook:

- **Full Stack Development** (ET0744) - Theory (11), Lab (9), HTML (4), JS (4)
- **AWS Cloud** (ET0740) - LAB3 build guides, one folder each for Abinaash,
  Vanavan and Saadat (Network & VPC + RDS/ELB/Auto Scaling)

To edit or add notes, edit `pn-data.js` directly: a folder is `{ name, title,
emoji, code, accent, tagline, blurb, children: [...] }`, a note is `{ name, title,
emoji, blurb, tags, body }`. Accents in use: `blue`, `pink`, `purple`.

## Deploy to GitHub Pages

1. Push these files to the repo root.
2. Settings -> Pages -> Build and deployment -> Source: **Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
3. Give it a minute, then open the Pages URL.

Needs an internet connection at runtime - React, marked, highlight.js, KaTeX and
the fonts load from CDNs. Everything else is local. (◕‿◕)
