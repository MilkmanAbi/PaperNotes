---
title: Callouts, diagrams, embeds and links
tags: [reference, verified]
---

# Callouts, diagrams, embeds and links

The Obsidian- and Notion-style extras, one of each, so a change to the
renderer has somewhere obvious to fail. Links and embeds point at
[[markdown-and-math]], which is in this folder.

## Callouts

> [!tip] A callout with its own title
> Text after the type is the title, as in Obsidian.

> [!faq]- A folded one (click it)
> Starts closed. `+` instead of `-` starts open but can still fold.

> [!warning] A title-only callout

> [!key|The PaperNotes way to set a title]
> Also works.

## Diagrams

```tree
Waste
  Plastic
    Bottles
    Cups
  Paper
  Food
```

```flow
(Start)
  Is it clean?
    |yes| Recycle it -> (Done)
    |no| Rinse it -> Is it clean?
```

## Embeds and links

![[markdown-and-math#Tables]]

A link to a section: [[markdown-and-math#Maths]]. A block with a name ^named-block

A link to that block: [[#^named-block]]. A tag: #reference.

## Tasks, highlights, comments

- [ ] to do
- [x] done
- [/] doing
- [-] cancelled

==a highlight==, ==g:a green one==, and a hidden %%comment%%.
