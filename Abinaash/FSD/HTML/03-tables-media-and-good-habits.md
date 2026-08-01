---
title: Tables, Media, Meta & Good Habits
emoji: ٩(｡•ᴗ•｡)۶
order: 3
blurb: Tables done right, embedding audio/video/picture, the meta tags that matter, plus the accessibility + common-mistake checklist that makes HTML actually good.
tags: html, tables, table, tr, td, media, video, audio, iframe, meta, og, favicon, accessibility, best-practices
---

# Tables, Media, Meta & Good Habits ٩(｡•ᴗ•｡)۶

> The last 20% of HTML: presenting data, embedding media, and the small habits that separate "it renders" from "it's actually good". None of it is hard — it's just the stuff tutorials skip.

---

## 1. Tables (for data, not layout)

Tables are for **tabular data** — rows and columns that mean something. Never use them to lay out a page (that's CSS's job; using tables for layout is a 2003 crime).

```html
<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Module</th>
      <th>Score</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Abi</td>
      <td>FSD</td>
      <td>98</td>
    </tr>
    <tr>
      <td>David</td>
      <td>FSD</td>
      <td>100</td>
    </tr>
  </tbody>
</table>
```

The vocabulary:

| Tag | Role |
|---|---|
| `<table>` | The whole table. |
| `<thead>` / `<tbody>` | Header row group / body row group. |
| `<tr>` | Table **r**ow. |
| `<th>` | Header cell (bold + a heading for screen readers). |
| `<td>` | Table **d**ata cell. |

Cells can span with `colspan="2"` / `rowspan="2"` when one cell covers multiple columns/rows.

---

## 2. Media — audio, video, picture

```html
<audio controls src="song.mp3"></audio>

<video controls width="480" src="clip.mp4"></video>

<!-- with fallbacks + a poster image -->
<video controls poster="thumb.jpg">
  <source src="clip.mp4" type="video/mp4">
  <source src="clip.webm" type="video/webm">
  Your browser can't play this video.
</video>
```

- `controls` gives you the play/pause bar. Without it there are no buttons.
- `<source>` lets you offer multiple formats; the browser picks the first it supports.
- The text inside `<video>` shows only if nothing works — a built-in fallback.

Embedding other sites (maps, YouTube) uses `<iframe>`:

```html
<iframe src="https://www.youtube.com/embed/VIDEO_ID" title="demo" allowfullscreen></iframe>
```

---

## 3. Meta tags that matter

These live in `<head>` and shape how the page behaves and how it looks when shared:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clear, specific page title</title>
  <meta name="description" content="One sentence — shows under your link in Google.">

  <!-- link preview when shared (Discord, WhatsApp, etc.) -->
  <meta property="og:title" content="My Page">
  <meta property="og:description" content="What it's about.">
  <meta property="og:image" content="https://example.com/preview.png">

  <link rel="icon" href="favicon.ico">     <!-- the little tab icon -->
  <link rel="stylesheet" href="style.css"> <!-- your CSS -->
</head>
```

`charset` and `viewport` are non-negotiable (covered in note 00). `description` + the `og:` tags are what make your link look decent when pasted anywhere.

---

## 4. Accessibility checklist (a11y)

Small things, big payoff. Screen-reader users, keyboard users, and search engines all benefit:

- Every `<img>` has a meaningful `alt` (or `alt=""` if purely decorative).
- Every form control has a `<label>`.
- Headings go in order (`h1` → `h2` → `h3`), no skipping for size.
- Use real `<button>` and `<a>` — not a clickable `<div>`. They're keyboard-focusable for free.
- Colour is never the *only* signal (don't rely on "the red one" — add text/icon).
- Buttons/links say what they do ("Download report", not "Click here").

Quick test: can you tab through the page and use everything with just the keyboard? If yes, you're most of the way there.

---

## 5. Common beginner mistakes (avoid these)

- **Forgetting to close a tag** → the rest of the page nests wrong and breaks. Indent and match your tags.
- **`class` typos** → your CSS/JS silently does nothing. Class names are case-sensitive.
- **Inputs with no `name`** → the server gets nothing. (See the forms note.)
- **Using `<br><br><br>` for spacing** → that's CSS's job; `<br>` is only for genuine line breaks (like an address).
- **One giant `<div>` soup** → reach for semantic tags first.
- **Inline styles everywhere** (`style="..."`) → fine for a quick test, a mess at scale. Put styles in a `.css` file.
- **Skipping `alt` / `<label>`** → breaks accessibility, and it's the easy stuff to get right.

---

## 6. Where HTML sits in the stack

```
   HTML  →  structure   (what's on the page)      ← you are here
   CSS   →  presentation (how it looks)
   JS    →  behaviour    (what it does)
```

Keep them separate: content in `.html`, looks in `.css`, logic in `.js`. In React later, HTML shows up as **JSX** — same tags, written inside JavaScript — so everything here transfers directly.

---

## the point ⊹╰(⌣ʟ⌣)╯⊹

- Tables are for data (`thead/tbody/tr/th/td`), never for layout.
- `<audio>`/`<video>` need `controls`; `<source>` gives format fallbacks; `<iframe>` embeds other sites.
- `charset` + `viewport` always; `description` + `og:` for good link previews.
- Accessibility is mostly free — alt text, labels, real buttons, ordered headings.

That's HTML. The structure's done — now make it *do* things. On to JS. ♪(´▽｀)
