/** Sticky notes stuck onto a note (or a PDF, a slide deck, anything).
 *
 *  Each sticky is pinned to a block of the note (its source line) plus an
 *  offset, so it stays beside the same paragraph when the window is
 *  resized or the note is edited above it. Drag it by its top edge, resize
 *  it from the corner, change its colour, fold it away, or bin it. They are
 *  saved as you type and come back whenever the note is opened again. */

import { icon } from './icons.js';
import { STICKY_COLORS } from '../core/state.js';

export function attachStickies({ state, reader }) {
  let ctx = null;
  let layer = null;
  let ro = null;
  const els = new Map();   // sticky id -> element

  function blocks() {
    if (!ctx?.article) return [];
    return [...ctx.article.querySelectorAll('[data-line]')].map((el) => ({ line: Number(el.dataset.line), el }));
  }

  /** Top of the block a sticky is pinned to: its own line, or the nearest
   *  block above it (a line inside a callout or a list has no block). */
  function anchorTop(line) {
    if (!ctx.article || line < 0) return 0;
    let el = ctx.article.querySelector(`[data-line="${line}"]`);
    if (!el) {
      let best = -1;
      for (const b of ctx.article.querySelectorAll('[data-line]')) {
        const l = Number(b.dataset.line);
        if (l <= line && l > best) { best = l; el = b; }
      }
    }
    if (!el) return 0;
    return el.getBoundingClientRect().top - ctx.sheet.getBoundingClientRect().top;
  }

  /** The block nearest above y (sheet coordinates), to pin a sticky to. */
  function anchorFor(y) {
    const base = ctx.sheet.getBoundingClientRect().top;
    let best = { line: -1, top: 0 };
    for (const b of blocks()) {
      const top = b.el.getBoundingClientRect().top - base;
      if (top <= y && top >= best.top) best = { line: b.line, top };
    }
    return best;
  }

  function place(s, el) {
    const top = anchorTop(s.line) + s.dy;
    const maxLeft = Math.max(0, ctx.sheet.clientWidth - Math.min(s.w, ctx.sheet.clientWidth) - 4);
    el.style.top = `${Math.max(0, top)}px`;
    el.style.left = `${Math.min(Math.max(0, s.dx), maxLeft)}px`;
    el.style.width = `${s.w}px`;
    el.style.height = s.collapsed ? '' : `${s.h}px`;
  }

  function build(s) {
    const el = document.createElement('div');
    el.className = `sticky sticky--${s.color}`;
    el.dataset.id = s.id;
    el.dataset.collapsed = String(Boolean(s.collapsed));
    el.innerHTML = `
      <div class="sticky__bar" title="Drag to move">
        <button class="sticky__btn" data-act="color" title="Colour" aria-label="Colour">${icon('tagDot')}</button>
        <span class="sticky__grip"></span>
        <button class="sticky__btn" data-act="fold" title="Fold" aria-label="Fold">${icon('chevronDown')}</button>
        <button class="sticky__btn" data-act="delete" title="Delete" aria-label="Delete">${icon('close')}</button>
      </div>
      <textarea class="sticky__text" spellcheck="true" placeholder="Write anything…"></textarea>`;
    const text = el.querySelector('textarea');
    text.value = s.text || '';
    text.addEventListener('input', () => state.updateSticky(ctx.path, s.id, { text: text.value }, { quiet: true }));
    text.addEventListener('keydown', (e) => e.stopPropagation());

    el.querySelector('[data-act="color"]').onclick = () => {
      const next = STICKY_COLORS[(STICKY_COLORS.indexOf(s.color) + 1) % STICKY_COLORS.length];
      el.className = `sticky sticky--${next}`;
      state.updateSticky(ctx.path, s.id, { color: next });
    };
    el.querySelector('[data-act="fold"]').onclick = () => {
      const folded = !s.collapsed;
      el.dataset.collapsed = String(folded);
      state.updateSticky(ctx.path, s.id, { collapsed: folded });
      place(s, el);
    };
    el.querySelector('[data-act="delete"]').onclick = () => {
      if (s.text && s.text.trim() && !confirmDelete(el)) return;
      state.removeSticky(ctx.path, s.id);
    };

    // Drag by the bar.
    const bar = el.querySelector('.sticky__bar');
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop };
      el.classList.add('is-dragging');
      const move = (ev) => {
        el.style.left = `${Math.max(0, start.left + ev.clientX - start.x)}px`;
        el.style.top = `${Math.max(0, start.top + ev.clientY - start.y)}px`;
      };
      const up = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        el.classList.remove('is-dragging');
        const y = el.offsetTop;
        const a = anchorFor(y);
        state.updateSticky(ctx.path, s.id, { line: a.line, dy: Math.round(y - a.top), dx: el.offsetLeft });
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });

    // Resizing is the browser's own corner grip; remember the size.
    let sizeTimer = null;
    new ResizeObserver(() => {
      if (s.collapsed || !el.isConnected) return;
      clearTimeout(sizeTimer);
      sizeTimer = setTimeout(() => {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (Math.abs(w - s.w) > 2 || Math.abs(h - s.h) > 2) state.updateSticky(ctx.path, s.id, { w, h }, { quiet: true });
      }, 250);
    }).observe(el);

    place(s, el);
    return el;
  }

  // A sticky with words in it asks once before going.
  function confirmDelete(el) {
    if (el.dataset.confirm === '1') return true;
    el.dataset.confirm = '1';
    const btn = el.querySelector('[data-act="delete"]');
    btn.classList.add('is-armed');
    btn.title = 'Click again to delete';
    setTimeout(() => { el.dataset.confirm = ''; btn.classList.remove('is-armed'); btn.title = 'Delete'; }, 2500);
    return false;
  }

  function render() {
    if (!layer) return;
    const list = state.stickiesOf(ctx.path);
    const keep = new Set(list.map((s) => s.id));
    for (const [id, el] of els) if (!keep.has(id)) { el.remove(); els.delete(id); }
    for (const s of list) {
      let el = els.get(s.id);
      if (!el) { el = build(s); layer.appendChild(el); els.set(s.id, el); }
      else place(s, el);
    }
  }

  function attach(next) {
    ro?.disconnect();
    els.clear();
    ctx = next;
    layer = document.createElement('div');
    layer.className = 'sticky-layer';
    ctx.sheet.appendChild(layer);
    render();
    ro = new ResizeObserver(() => { for (const s of state.stickiesOf(ctx.path)) { const el = els.get(s.id); if (el) place(s, el); } });
    ro.observe(ctx.sheet);
  }

  state.onChange((ev) => {
    if (!ctx || !layer?.isConnected) return;
    // A reload from disk brings new objects: start the layer over.
    if (ev.type === 'load') { layer.replaceChildren(); els.clear(); render(); return; }
    if (ev.type === 'stickies' && ev.path === ctx.path) render();
  });

  return {
    attach,
    /** A new sticky: where you right-clicked (at), or where you are
     *  looking, near the right edge. text: what it starts with. */
    add(path, { text = '', at = null } = {}) {
      if (!ctx || ctx.path !== path || !layer?.isConnected) return;
      const wrap = reader.wrap;
      const box = ctx.sheet.getBoundingClientRect();
      const sheetTop = box.top - wrap.getBoundingClientRect().top;
      const y = at ? Math.max(0, at.clientY - box.top - 12) : Math.max(16, 96 - sheetTop);
      const a = anchorFor(y);
      const w = 240;
      const dx = at ? Math.min(Math.max(8, at.clientX - box.left + 16), ctx.sheet.clientWidth - w - 8) : Math.max(8, ctx.sheet.clientWidth - w - 24);
      const s = state.addSticky(path, {
        line: a.line, dy: Math.round(y - a.top), dx, w, h: text ? Math.min(260, 90 + Math.ceil(text.length / 30) * 19) : 170,
        text: text ? `"${text.slice(0, 600)}"\n\n` : '',
      });
      render();
      els.get(s.id)?.querySelector('textarea')?.focus();
    },
  };
}
