---
title: HTML Basics — Tags, Elements & the Skeleton
emoji: (｡•̀ᴗ-)✧
order: 0
blurb: What HTML actually is, the document skeleton every page starts from, and the tag/element/attribute vocabulary. The bones before anything else.
tags: html, elements, attributes, tags, doctype, head, body, meta, boilerplate, structure
---

# HTML Basics — Tags, Elements & the Skeleton (｡•̀ᴗ-)✧

> HTML isn't a programming language. There's no logic, no loops, no "if". It's a *labelling* system — you wrap your content in tags that say "this is a heading", "this is a paragraph", "this is a link", and the browser draws it. That's the whole job.

HTML = **HyperText Markup Language**. "Markup" is the key word: you take plain text and mark it up with tags so the browser knows what each bit *is*.

---

## 1. Tags, elements, attributes

Three words people mix up. Get them straight once:

```html
<a href="https://google.com">click me</a>
```

- **Tag** — the thing in angle brackets. `<a>` is the opening tag, `</a>` is the closing tag (note the `/`).
- **Element** — the whole thing: opening tag + content + closing tag. The line above is one `<a>` element.
- **Attribute** — extra info inside the opening tag, as `name="value"`. Here `href="..."` is an attribute telling the link where to go.

Most elements wrap content and need a closing tag. A few are **empty** (self-closing) — they have no content, so no closing tag:

```html
<img src="cat.png" alt="a cat">   <!-- image -->
<br>                              <!-- line break -->
<hr>                              <!-- horizontal rule -->
<input type="text">               <!-- form field -->
```

> Rule of thumb: if it *contains* something, it needs a closing tag. If it *is* the thing, it doesn't.

---

## 2. The skeleton — every page starts here

Memorise this. It's the boilerplate you type at the top of every `.html` file:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Page</title>
  </head>
  <body>
    <h1>Hello</h1>
    <p>This is the visible page.</p>
  </body>
</html>
```

What each line does:

| Line | Job |
|---|---|
| `<!DOCTYPE html>` | "This is HTML5." Always the first line. Not really a tag. |
| `<html lang="en">` | The root element. `lang` helps screen readers + search engines. |
| `<head>` | Info *about* the page — not shown on the page itself. |
| `<meta charset="UTF-8">` | Lets the page use any character (é, 中, emoji) without breaking. |
| `<meta name="viewport" ...>` | Makes it behave on phones. Skip it and mobile looks tiny + zoomed. |
| `<title>` | The text in the browser tab. |
| `<body>` | Everything you actually see lives here. |

**`head` vs `body`** is the split to internalise: `head` = setup/metadata, `body` = visible content.

---

## 3. How the browser reads it

The browser goes top to bottom, builds a tree of your elements (the **DOM** — you'll meet it properly in the JS notes), and paints it. HTML is **nested**, like boxes inside boxes:

```html
<body>
  <div>
    <h1>Title</h1>
    <p>Some <strong>bold</strong> text.</p>
  </div>
</body>
```

```
body
└── div
    ├── h1  → "Title"
    └── p   → "Some " + strong("bold") + " text."
```

**Indent your nesting.** The browser doesn't care about whitespace, but future-you does. Messy nesting is where bugs hide.

---

## 4. Comments

Notes to yourself the browser ignores:

```html
<!-- this won't show up on the page -->
```

---

## 5. Whitespace doesn't work how you'd think

Hit Enter ten times in your HTML — the browser collapses it all into one space. Ten spaces become one space. This trips up every beginner:

```html
<p>hello


        world</p>
```

renders as: `hello world`. If you want a line break, that's `<br>`. If you want space, that's CSS later. Text layout is *never* done with spacebar spam.

---

## the point (ﾟヮﾟ)

- HTML labels content with **tags**; tag + content = **element**; extra info = **attributes**.
- Every page starts from the same skeleton — `head` (metadata) + `body` (visible).
- It's a nested tree, so indent it.
- Whitespace collapses; structure comes from tags, not spacebar.

Next: making that content actually *say* something — headings, links, and semantic structure. ٩(ˊᗜˋ*)و
