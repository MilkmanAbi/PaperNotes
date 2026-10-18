---
title: HTML and CSS inside a note
tags: [reference, theory]
---

# HTML and CSS inside a note

Raw HTML is enabled, and a note may bring its own stylesheet. That is a
deliberate decision rather than an oversight: these notes are files in your own
repository, and the point of supporting HTML and CSS at all is to let a note do
something Markdown cannot.

What that trust does *not* extend to is letting a note impersonate the
application around it.

## A note styling itself

<style>
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 8px;
    margin-top: 8px;
  }
  .swatch {
    border: 1px solid var(--accent);
    border-radius: 4px;
    padding: 8px;
    font-family: var(--font-data);
    font-size: 11px;
  }
  .swatch b { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; }

  /* Rewritten to mean "this note's own region", so the swatch borders above
     come out terracotta rather than the app's olive — and the toolbar does
     not move. */
  :root { --accent: #9a5b42; }

  /* The three below reach for the application itself. None has any effect;
     see "The boundary". */
  .topbar { background: #ff0000 !important; }
  .statusbar { display: none !important; }
  .escape-attempt { position: fixed; inset: 0; z-index: 99999; background: #ff0000; }
</style>

<div class="swatches">
  <div class="swatch"><b>Grid</b>8px base unit</div>
  <div class="swatch"><b>Radius</b>4px, two sizes</div>
  <div class="swatch"><b>Accent</b>one per screen</div>
  <div class="swatch"><b>Density</b>three modes</div>
</div>

That block is a `<div>` in this file, styled by a `<style>` block in this file.
It inherits the current theme through the same custom properties the rest of
the page uses, so it follows light and dark without knowing anything about
either — and its borders are terracotta rather than the app's olive, because
the stylesheet above redefines `--accent` on `:root`.

That redefinition is worth pausing on. `:root`, `html` and `body` in a note's
stylesheet are rewritten to mean *this note's own region*. So a note can
retheme itself — change the accent, set its own background, pick different
type — and the change stops at the edge of the note. The toolbar above is
still olive.

<details>
  <summary>Collapsible sections work too</summary>
  <p>Useful for long derivations, raw output, or anything you want present but
  not in the way.</p>
</details>

## The boundary

The stylesheet above also contains three rules that try to leave this note:
one repainting the toolbar red, one hiding the status bar, and one pinning a
red sheet over the whole window. The toolbar is its normal colour, the status
bar is still at the bottom, and there is no red sheet — which is the point.

Every selector a note ships is rewritten so it can only match inside the
note's own region, so `.topbar` here means "an element with class `topbar`
*inside this note*", and there isn't one. On top of that, `position: fixed`
becomes `position: absolute`, runaway `z-index` values are clamped, and
`@import` is dropped — it would otherwise pull in an entire unscoped
stylesheet and undo all of the above. Comments are stripped before any of
this happens, because a comma inside one would otherwise split a selector
list in the wrong place.

This is the one place where the design system this site is built on is
genuinely strict: the user should always be able to tell, at a glance, which
part of the screen is the application and which part is just what the
application is showing them. A note that could draw a convincing fake toolbar
would break that, so it cannot.

Scripts inside a note are removed for the same reason — there would be no
honest way to contain one.

## What this means in practice

Write whatever HTML and CSS you like. Use the theme's own custom properties if
you want your markup to follow light and dark:

```css
.my-callout {
  border-left: 2px solid var(--accent);
  padding-left: 16px;
  color: var(--ink-secondary);
}
```

<p class="my-callout" style="border-left: 2px solid var(--accent); padding-left: 16px; color: var(--ink-secondary);">
Inline styles work as well, and are scoped by definition.
</p>

If you ever publish notes you did not write yourself, that is the moment to
turn sanitising on — the README says where.
