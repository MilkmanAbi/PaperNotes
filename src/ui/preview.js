/** Hover a link to another note and a small card shows what is there, the
 *  way Obsidian's page preview does: the section a #heading or #^block link
 *  points at, or the top of the note. Move onto the card to scroll it; it
 *  goes away when the pointer leaves, on Escape, or when you navigate.
 *  Settings → Reading turns it off. */

import { renderNote, rewriteLinks } from '../core/markdown.js';
import { fileKind } from '../core/filetypes.js';
import { decodeHashPath } from '../core/paths.js';
import { section, detach } from './embeds.js';

let enabled = true;
let card = null;
let owner = null;
let showTimer = null;
let hideTimer = null;

export function setLinkPreviews(on) { enabled = on !== false; if (!enabled) hide(); }

const linkFrom = (e) => e.target.closest?.('a[href^="#/"]');

export function linkPreviews(root, ctx) {
  if (root.dataset.previews) return;
  root.dataset.previews = '1';
  root.addEventListener('pointerover', (e) => {
    const a = linkFrom(e);
    if (!a || !enabled || a.dataset.missing || a.dataset.inNote || a.closest('.pn-preview, .embed-note__head')) return;
    if (a === owner && card) { clearTimeout(hideTimer); return; }
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(a, ctx), 450);
  });
  root.addEventListener('pointerout', (e) => {
    const a = linkFrom(e);
    if (!a || a.contains(e.relatedTarget)) return;
    clearTimeout(showTimer);
    scheduleHide();
  });
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 250);
}

function hide() {
  clearTimeout(showTimer);
  card?.remove();
  card = null;
  owner = null;
}

async function show(a, ctx) {
  if (!a.isConnected) return;
  const [, route = '', anchor = ''] = /^#\/([^#]*)(?:#(.*))?$/.exec(a.getAttribute('href')) || [];
  const path = decodeHashPath(`#/${route}`);
  if (!path || fileKind(path.split('/').pop()) !== 'note') return;
  let raw;
  try { raw = await ctx.fetchText(path); } catch { return; }
  if (!a.matches(':hover')) return;

  const { html } = renderNote(raw, path);
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  let nodes = anchor ? section(tpl.content, decodeURIComponent(anchor)) : null;
  if (!nodes) nodes = [...tpl.content.children].slice(0, 14);

  hide();
  card = document.createElement('div');
  card.className = 'pn-preview';
  card.setAttribute('role', 'tooltip');
  const body = document.createElement('div');
  body.className = 'note-content pn-preview__body';
  body.append(...nodes);
  detach(body);
  card.appendChild(body);
  document.body.appendChild(card);
  rewriteLinks(body, path, { exists: ctx.exists, resolveWiki: ctx.resolveWiki });
  ctx.enhance?.(body, { ...ctx, path, raw, depth: 2, preview: false, autoRun: false });
  owner = a;

  // Under the link, or above it when there is no room below.
  const r = a.getBoundingClientRect();
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const top = r.bottom + h + 12 < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  card.addEventListener('pointerleave', scheduleHide);
}

window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card) hide(); }, true);
window.addEventListener('hashchange', hide);
document.addEventListener('scroll', (e) => { if (card && !card.contains(e.target)) hide(); }, true);
