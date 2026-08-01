---
title: Text, Links & Semantic Structure
emoji: (◔◡◔)
order: 1
blurb: The everyday elements - headings, paragraphs, lists, links, images - plus semantic tags (header/nav/main/section/footer) and why "div soup" is a trap.
tags: html, links, anchor, href, images, lists, headings, nav, main, semantic, id, class, accessibility
---

# Text, Links & Semantic Structure (◔◡◔)

> You can build an entire website with just `<div>` and `<span>`. You *shouldn't*. Semantic HTML — using tags that describe what content **is** — is what makes a page readable to search engines, screen readers, and the next person (usually you).

---

## 1. Text elements you'll use constantly

```html
<h1>Biggest heading (one per page)</h1>
<h2>Section heading</h2>
<h3>Sub-heading</h3>

<p>A paragraph of text.</p>

<strong>important (bold)</strong>
<em>emphasis (italic)</em>
<br>  <!-- a line break -->
<hr>  <!-- a thematic divider line -->
```

Headings go `h1` → `h6`, big to small. **Use them in order** — don't skip `h1` to `h3` because you like the size. Size is a CSS job; `h1`–`h6` are about *hierarchy*, and screen readers use them to build a page outline.

`<strong>` vs `<b>` and `<em>` vs `<i>`: the first of each carries *meaning* (importance / emphasis), the second is just visual. Prefer `<strong>` and `<em>`.

---

## 2. Lists

```html
<!-- unordered: bullets -->
<ul>
  <li>eggs</li>
  <li>milk</li>
  <li>spite</li>
</ul>

<!-- ordered: numbers -->
<ol>
  <li>wake up</li>
  <li>suffer</li>
  <li>sleep</li>
</ol>
```

`<li>` = list item. It only lives inside `<ul>` or `<ol>`. Lists are also how nav menus are built under the hood.

---

## 3. Links — the "hyper" in hypertext

```html
<a href="about.html">About page (same site)</a>
<a href="https://google.com">External site</a>
<a href="https://google.com" target="_blank" rel="noopener">Opens in a new tab</a>
<a href="#section2">Jump to a spot on this page</a>
<a href="mailto:me@example.com">Email me</a>
```

- `href` is *where it goes*. Relative (`about.html`) for your own pages, full URL for others.
- `target="_blank"` opens a new tab; pair it with `rel="noopener"` for safety.
- `href="#id"` jumps to an element with that `id` on the current page.

---

## 4. Images

```html
<img src="cat.png" alt="an orange cat asleep on a keyboard">
```

- `src` — the file path or URL.
- `alt` — text shown if the image fails, **and read aloud by screen readers**. Not optional. Describe the image; if it's purely decorative, use `alt=""`.

Paths work like links: `cat.png` (same folder), `images/cat.png` (subfolder), `../cat.png` (up one folder).

---

## 5. Semantic structure — the good part

Instead of a pile of anonymous `<div>`s ("div soup"), use tags that say what each region *is*:

```html
<body>
  <header>
    <h1>My Blog</h1>
    <nav>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/about">About</a></li>
      </ul>
    </nav>
  </header>

  <main>
    <article>
      <h2>My First Post</h2>
      <p>...</p>
    </article>

    <section>
      <h2>Comments</h2>
      <p>...</p>
    </section>
  </main>

  <footer>
    <p>© 2026 me</p>
  </footer>
</body>
```

| Tag | Means |
|---|---|
| `<header>` | Top bit — logo, title, nav. |
| `<nav>` | A set of navigation links. |
| `<main>` | The main content. One per page. |
| `<article>` | A self-contained piece (a post, a card, a product). |
| `<section>` | A thematic grouping, usually with its own heading. |
| `<footer>` | Bottom bit — copyright, contact, small links. |
| `<div>` | A generic box with **no meaning** — use only when nothing semantic fits (usually for styling/layout). |
| `<span>` | Like `<div>` but inline (for a word or two inside text). |

**Why bother?** Accessibility (screen readers can jump to `main`, skip `nav`), SEO (Google understands your structure), and readability. Same pixels on screen, far better HTML.

---

## 6. `id` and `class` — hooks for later

Two attributes you'll put on almost everything, used by CSS and JavaScript:

```html
<div id="main-banner" class="card featured">...</div>
```

- `id` — a **unique** name (one per page). For jumping to (`#main-banner`) or grabbing one specific element in JS.
- `class` — a **reusable** label (many elements can share it, and one element can have several, space-separated). For styling groups of things.

You'll use these heavily in the JS notes to *select* elements.

---

## the point ᕙ(⇀‸↼‶)ᕗ

- Use headings in order; they're structure, not font size.
- Links = `<a href>`, images = `<img src alt>`, and `alt` is mandatory.
- Reach for semantic tags (`header/nav/main/article/section/footer`) before `<div>`.
- `id` = unique hook, `class` = reusable label. You'll grab both in JS.

Next: forms — where the page stops showing and starts *asking*. (This one plugs straight into the Express forms lab.) ⌨(´•ω•`)
