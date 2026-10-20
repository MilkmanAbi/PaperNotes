/** ![[…]] embeds, filled in once a note is on screen (Obsidian's syntax):
 *
 *    ![[Note]]                 the whole note, inline
 *    ![[Note#Heading]]         one section of it (the heading and what follows,
 *                              up to the next heading of the same level)
 *    ![[Note#^block-id]]       one paragraph, list item, quote or table
 *    ![[#Heading]]             a section of this note
 *    ![[diagram.png|300]]      a picture 300px wide (|300x200 sets both sides)
 *    ![[clip.mp4]] ![[talk.mp3]] ![[slides.pdf#page=3]]
 *
 *  An embedded note is read-only here: its lines carry no data-line, so the
 *  host note's stickies and confused marks can never land inside it, and
 *  its links resolve against its own folder, not the host's. */

import { renderNote, rewriteLinks, wikiAnchor } from '../core/markdown.js';
import { fileKind } from '../core/filetypes.js';
import { toHash } from '../core/paths.js';
import { icon } from './icons.js';

const MAX_DEPTH = 2;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titleOf = (path) => path.split('/').pop().replace(/\.(md|markdown|mdx)$/i, '');

/** Fill every embed placeholder under `root`. */
export async function resolveEmbeds(root, ctx) {
  for (const span of root.querySelectorAll('span.embed:not([data-done])')) {
    span.dataset.done = '1';
    try { await embedOne(span, ctx); } catch (err) { missing(span, `Could not embed this: ${err?.message || err}`); }
  }
}

function missing(span, why) {
  span.classList.add('embed--missing');
  span.title = why;
}

async function embedOne(span, ctx) {
  const { name, anchor = '', opt = '' } = span.dataset;
  const target = name ? ctx.resolveWiki?.(name) : ctx.path;
  if (!target) return missing(span, `No note or file called ${name}`);
  const url = ctx.contentUrl(target);
  const kind = fileKind(target.split('/').pop());

  if (kind === 'image') {
    const img = document.createElement('img');
    img.className = 'embed-img';
    img.src = url;
    img.loading = 'lazy';
    const size = /^(\d{1,4})(?:x(\d{1,4}))?$/.exec(opt);
    if (size) {
      img.style.width = `${size[1]}px`;
      if (size[2]) img.style.height = `${size[2]}px`;
    }
    img.alt = size || !opt ? titleOf(target) : opt;
    span.replaceWith(img);
    return;
  }
  if (kind === 'video' || kind === 'audio') {
    const media = document.createElement(kind);
    media.className = `embed-${kind}`;
    media.src = url;
    media.controls = true;
    media.preload = 'metadata';
    span.replaceWith(media);
    return;
  }
  if (kind === 'pdf') {
    const params = new URLSearchParams(anchor);
    const frame = document.createElement('iframe');
    frame.className = 'embed-pdf';
    frame.title = titleOf(target);
    frame.src = `${url}${params.get('page') ? `#page=${encodeURIComponent(params.get('page'))}` : ''}`;
    frame.style.height = `${Math.min(1400, Math.max(200, Number(params.get('height')) || 640))}px`;
    span.replaceWith(frame);
    return;
  }
  if (kind !== 'note') {
    span.replaceWith(fileChip(target, ''));
    return;
  }

  // A note: render it, cut out the section, and box it with a link to the source.
  const depth = ctx.depth || 0;
  const self = target === ctx.path;
  if (depth >= MAX_DEPTH || (self && !anchor)) {
    span.replaceWith(fileChip(target, anchor));
    return;
  }
  const raw = self && ctx.raw != null ? ctx.raw : await ctx.fetchText(target);
  const { html } = renderNote(raw, target);
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const nodes = section(tpl.content, anchor);
  if (!nodes) return missing(span, `${titleOf(target)} has no section called ${anchor}`);

  const box = document.createElement('div');
  box.className = 'embed-note';
  const shown = anchor ? anchor.replace(/^\^/, '') : '';
  box.innerHTML = `<a class="embed-note__head" href="${esc(toHash(target, wikiAnchor(anchor)))}">${icon('note')}<span>${esc(titleOf(target))}</span>${shown ? `<span class="embed-note__sub">${esc(shown)}</span>` : ''}</a>`;
  const body = document.createElement('div');
  body.className = 'embed-note__body';
  body.append(...nodes);
  detach(body);
  box.appendChild(body);
  span.replaceWith(box);
  rewriteLinks(body, target, { exists: ctx.exists, resolveWiki: ctx.resolveWiki });
  ctx.enhance?.(body, { ...ctx, path: target, raw, depth: depth + 1 });
}

/** The nodes an anchor names, or null when it names nothing. */
export function section(frag, anchor) {
  if (!anchor) return [...frag.childNodes];
  if (anchor.startsWith('^')) {
    const el = frag.querySelector(`[id="${CSS.escape(anchor)}"]`);
    if (!el) return null;
    if (el.tagName === 'LI') {
      const list = document.createElement(el.parentElement?.tagName === 'OL' ? 'ol' : 'ul');
      list.appendChild(el.cloneNode(true));
      return [list];
    }
    return [el.closest('.table-wrap') || el].map((n) => n.cloneNode(true));
  }
  const slug = wikiAnchor(anchor);
  const heading = [...frag.querySelectorAll('h1, h2, h3, h4, h5, h6')].find((h) => h.id === slug);
  if (!heading) return null;
  const level = Number(heading.tagName[1]);
  const out = [heading];
  for (let n = heading.nextSibling; n; n = n.nextSibling) {
    if (/^H[1-6]$/.test(n.nodeName) && Number(n.nodeName[1]) <= level) break;
    out.push(n);
  }
  return out.map((n) => n.cloneNode(true));
}

/** Embedded content is a copy, not part of the host note: no line anchors,
 *  no heading ids (the outline and #links belong to the host). */
export function detach(el) {
  for (const x of el.querySelectorAll('[data-line]')) x.removeAttribute('data-line');
  for (const h of el.querySelectorAll('h1, h2, h3, h4, h5, h6, [id^="^"]')) h.removeAttribute('id');
  for (const a of el.querySelectorAll('.heading-anchor')) a.remove();
}

function fileChip(path, anchor) {
  const a = document.createElement('a');
  a.className = 'embed-chip';
  a.href = toHash(path, wikiAnchor(anchor));
  a.innerHTML = `${icon(fileKind(path.split('/').pop()) === 'note' ? 'note' : 'file')}<span>${esc(titleOf(path))}${anchor ? ` › ${esc(anchor.replace(/^\^/, ''))}` : ''}</span>`;
  return a;
}
