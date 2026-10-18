/** The tree panel.
 *
 *  Patterns §3 in full: flat rows with indentation rather than nested
 *  containers, one consistent indent step, a 16px chevron that rotates on
 *  open and is the *only* thing animated, selection as a full-width muted
 *  accent fill, and hover that covers the whole row at every depth.
 *
 *  The part that is not in the spec is virtualisation, which is what makes
 *  all of the above hold at a hundred thousand nodes: only the rows that
 *  fit on screen plus a small overscan exist in the DOM, and the elements
 *  themselves are pooled and re-used rather than recreated on every scroll
 *  frame. Nothing outside this panel is touched when any of it changes
 *  (PI §2.1). */

import { icon } from './icons.js';
import { fileKind, kindIcon } from '../core/filetypes.js';

const OVERSCAN = 8;

export class TreeView {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.mount
   * @param {import('../core/manifest.js').TreeStore} opts.store
   */
  constructor({ mount, store, onOpen, onExpandedChange, onError }) {
    this.store = store;
    this.onOpen = onOpen || (() => {});
    this.onExpandedChange = onExpandedChange || (() => {});
    this.onError = onError || (() => {});

    this.expanded = new Set();     // node ids
    this.loading = new Set();      // node ids whose shard is in flight
    this.selected = -1;
    this.cursor = -1;
    this.results = null;           // search results replace the tree when set

    this.visible = [];             // [{ id, depth }]
    this.pool = [];
    this.rowHeight = 32;

    this.scroller = document.createElement('div');
    this.scroller.className = 'tree scroll';
    this.scroller.tabIndex = 0;
    this.scroller.setAttribute('role', 'tree');
    this.scroller.setAttribute('aria-label', 'Notes');

    this.sizer = document.createElement('div');
    this.sizer.className = 'tree__sizer';
    this.scroller.appendChild(this.sizer);
    mount.appendChild(this.scroller);

    this.scroller.addEventListener('scroll', () => this.paint(), { passive: true });
    this.scroller.addEventListener('click', (e) => this._onClick(e));
    // Middle-click opens in a new tab, like a browser.
    this.scroller.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      const row = e.target.closest('.tree__row');
      if (!row) return;
      e.preventDefault();
      this.onOpen(Number(row.dataset.id), e);
    });
    this.scroller.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    /** Optional: (id) => { html, key } for the badges at the end of a row
     *  (tag dots, done ticks, progress). key changes when html would. */
    this.decorate = null;
    this.scroller.addEventListener('keydown', (e) => this._onKey(e));

    this._ro = new ResizeObserver(() => { this.measure(); this.paint(); });
    this._ro.observe(this.scroller);
  }

  /** Row height comes from the density mode, so re-read it when that moves. */
  measure() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--row-h');
    const parsed = parseFloat(raw);
    if (parsed && parsed !== this.rowHeight) {
      this.rowHeight = parsed;
      this.sizer.style.height = `${this.visible.length * this.rowHeight}px`;
    }
  }

  setExpandedPaths(paths) {
    this.expanded = new Set();
    this._pendingExpandPaths = paths;
  }

  /** After the store was rebuilt underneath: ids may now mean other nodes,
   *  so pooled rows forget what they showed and repaint from scratch. */
  invalidate() {
    for (const slot of this.pool) slot.state = {};
    this.rebuild();
  }

  expandedPaths() {
    return [...this.expanded].map((id) => this.store.pathOf(id)).filter(Boolean);
  }

  // ── the visible list ────────────────────────────────────────────────
  rebuild() {
    const store = this.store;
    const out = [];

    if (this.results) {
      for (const r of this.results) out.push({ id: r.id, depth: 0, via: r.via });
    } else {
      // Explicit stack, never recursion: depth is not allowed to be a limit.
      const stack = [];
      const kids = store.childrenOf(0);
      for (let i = kids.length - 1; i >= 0; i--) stack.push({ id: kids[i], depth: 0 });
      while (stack.length) {
        const entry = stack.pop();
        out.push(entry);
        if (store.kind[entry.id] === 0 && this.expanded.has(entry.id)) {
          const children = store.childrenOf(entry.id);
          for (let i = children.length - 1; i >= 0; i--) {
            stack.push({ id: children[i], depth: entry.depth + 1 });
          }
        }
      }
    }

    this.visible = out;
    this.index = new Map();
    for (let i = 0; i < out.length; i++) this.index.set(out[i].id, i);
    this.sizer.style.height = `${out.length * this.rowHeight}px`;
    this.paint();
  }

  paint() {
    const total = this.visible.length;
    if (!total) {
      for (const row of this.pool) row.el.style.display = 'none';
      this._renderEmpty();
      return;
    }
    if (this._empty) { this._empty.remove(); this._empty = null; }

    const scrollTop = this.scroller.scrollTop;
    const height = this.scroller.clientHeight || 400;
    const first = Math.max(0, Math.floor(scrollTop / this.rowHeight) - OVERSCAN);
    const last = Math.min(total - 1, Math.ceil((scrollTop + height) / this.rowHeight) + OVERSCAN);
    const needed = last - first + 1;

    while (this.pool.length < needed) this.pool.push(this._createRow());

    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i];
      const dataIndex = first + i;
      if (dataIndex > last) { slot.el.style.display = 'none'; continue; }
      slot.el.style.display = '';
      this._fillRow(slot, this.visible[dataIndex], dataIndex);
    }
  }

  _createRow() {
    const el = document.createElement('div');
    el.className = 'tree__row';
    el.setAttribute('role', 'treeitem');
    el.innerHTML =
      `<span class="tree__twisty">${icon('chevron')}</span>` +
      '<span class="tree__glyph"></span>' +
      '<span class="tree__label"></span>' +
      '<span class="tree__badges"></span>' +
      '<span class="tree__count"></span>';
    this.sizer.appendChild(el);
    return {
      el,
      twisty: el.querySelector('.tree__twisty'),
      glyph: el.querySelector('.tree__glyph'),
      label: el.querySelector('.tree__label'),
      count: el.querySelector('.tree__count'),
      badges: el.querySelector('.tree__badges'),
      state: {},
    };
  }

  _fillRow(slot, entry, dataIndex) {
    const store = this.store;
    const { id, depth } = entry;
    const isDir = store.kind[id] === 0;
    const el = slot.el;
    const prev = slot.state;

    const top = dataIndex * this.rowHeight;
    if (prev.top !== top) { el.style.transform = `translateY(${top}px)`; prev.top = top; }

    const indent = `calc(var(--space-2) + ${depth} * var(--indent-step))`;
    if (prev.indent !== indent) { el.style.paddingLeft = indent; prev.indent = indent; }

    if (prev.id !== id) {
      el.dataset.id = String(id);
      const kind = isDir ? 'dir' : fileKind(store.nameOf(id));
      el.dataset.kind = isDir ? 'dir' : (kind === 'note' ? 'note' : 'file');
      slot.glyph.innerHTML = icon(isDir ? 'folder' : kindIcon(kind));
      slot.label.textContent = this.results ? store.titleOf(id) : store.nameOf(id);
      slot.twisty.classList.toggle('tree__twisty--leaf', !isDir);
      el.title = this.results ? store.pathOf(id) : '';
      prev.id = id;
      prev.open = null;
      prev.count = null;
    }

    const open = isDir && this.expanded.has(id);
    if (prev.open !== open) {
      el.dataset.open = String(open);
      el.setAttribute('aria-expanded', isDir ? String(open) : 'false');
      prev.open = open;
    }

    // The count sits on the right: child count for a folder, the containing
    // folder for a search result. The deferred case says so in its own row
    // and nowhere else in the tree (Patterns §3, PI §2.3).
    let countText = '';
    if (this.loading.has(id)) countText = 'loading…';
    else if (this.results) {
      const parentPath = store.pathOf(store.parent[id]);
      countText = parentPath || '/';
    } else if (isDir) {
      countText = store.isDeferred(id) ? '…' : String(store.childCount[id] || 0);
    }
    if (prev.count !== countText) { slot.count.textContent = countText; prev.count = countText; }
    el.dataset.loading = String(this.loading.has(id));

    if (this.decorate) {
      const deco = this.decorate(id);
      const key = deco ? deco.key : '';
      if (prev.deco !== key) { slot.badges.innerHTML = deco ? deco.html : ''; prev.deco = key; }
      const done = Boolean(deco?.done);
      if (prev.done !== done) { el.dataset.done = String(done); prev.done = done; }
    }

    const selected = id === this.selected;
    if (prev.selected !== selected) { el.dataset.selected = String(selected); prev.selected = selected; }
    const cursored = id === this.cursor;
    if (prev.cursored !== cursored) { el.dataset.cursor = String(cursored); prev.cursored = cursored; }
    el.setAttribute('aria-level', String(depth + 1));
  }

  _renderEmpty() {
    if (this._empty) return;
    const div = document.createElement('div');
    div.className = 'tree__empty';
    div.textContent = this.results
      ? 'Nothing matched. A narrower word usually works better than a longer phrase.'
      : 'No notes yet. Drop a .md file into content/ and this fills in.';
    this.sizer.appendChild(div);
    this._empty = div;
  }

  // ── interaction ─────────────────────────────────────────────────────
  _onClick(e) {
    const row = e.target.closest('.tree__row');
    if (!row) return;
    const id = Number(row.dataset.id);
    if (!Number.isFinite(id)) return;
    this.cursor = id;

    const onTwisty = !!e.target.closest('.tree__twisty');
    if ((e.ctrlKey || e.metaKey) && !onTwisty) { this.onOpen(id, e); return; }
    if (this.store.kind[id] === 0 && (onTwisty || !this.results)) {
      this.toggle(id);
      return;
    }
    if (this.store.kind[id] === 1) this.onOpen(id, e);
    else this.toggle(id);
  }

  async toggle(id) {
    if (this.store.kind[id] !== 0) return;
    if (this.expanded.has(id)) {
      this.expanded.delete(id);
      this.rebuild();
      this.onExpandedChange();
      return;
    }

    if (this.store.isDeferred(id)) {
      // Only this row reports the wait. The rest of the tree stays live,
      // and a failure here takes nothing else with it (PI §4.4, §5.3).
      this.loading.add(id);
      this.paint();
      try {
        await this.store.ensureChildren(id);
      } catch (err) {
        this.loading.delete(id);
        this.paint();
        this.onError(err, id);
        return;
      }
      this.loading.delete(id);
    }

    this.expanded.add(id);
    this.rebuild();
    this.onExpandedChange();
  }

  /** Expand everything above a node and scroll it into view. */
  async reveal(id, { select = true } = {}) {
    if (id < 0) return;
    const ancestors = this.store.ancestorsOf(id);
    let changed = false;
    for (const a of ancestors) {
      if (a === 0) continue;
      if (this.store.isDeferred(a)) {
        this.loading.add(a);
        this.paint();
        try { await this.store.ensureChildren(a); }
        catch (err) { this.loading.delete(a); this.onError(err, a); break; }
        this.loading.delete(a);
      }
      if (!this.expanded.has(a)) { this.expanded.add(a); changed = true; }
    }
    if (select) this.selected = id;
    this.cursor = id;
    if (changed || !this.index?.has(id)) this.rebuild(); else this.paint();
    if (changed) this.onExpandedChange();
    this.scrollTo(id);
  }

  scrollTo(id) {
    const i = this.index?.get(id);
    if (i === undefined) return;
    const top = i * this.rowHeight;
    const viewTop = this.scroller.scrollTop;
    const viewBottom = viewTop + this.scroller.clientHeight;
    if (top < viewTop || top + this.rowHeight > viewBottom) {
      this.scroller.scrollTop = Math.max(0, top - this.scroller.clientHeight / 2);
      this.paint();
    }
  }

  setSelected(id) {
    if (this.selected === id) return;
    this.selected = id;
    this.cursor = id;
    this.paint();
  }

  setResults(results) {
    this.results = results;
    this.cursor = results && results.length ? results[0].id : -1;
    this.scroller.scrollTop = 0;
    this.rebuild();
  }

  collapseAll() {
    this.expanded.clear();
    this.rebuild();
    this.onExpandedChange();
  }

  // ── keyboard, Patterns §3 ───────────────────────────────────────────
  _onKey(e) {
    const total = this.visible.length;
    if (!total) return;
    let i = this.index.get(this.cursor);
    if (i === undefined) i = 0;

    const move = (next) => {
      e.preventDefault();
      const clamped = Math.max(0, Math.min(total - 1, next));
      this.cursor = this.visible[clamped].id;
      this.paint();
      this.scrollTo(this.cursor);
    };

    switch (e.key) {
      case 'ArrowDown': return move(i + 1);
      case 'ArrowUp': return move(i - 1);
      case 'Home': return move(0);
      case 'End': return move(total - 1);
      case 'PageDown': return move(i + Math.floor(this.scroller.clientHeight / this.rowHeight));
      case 'PageUp': return move(i - Math.floor(this.scroller.clientHeight / this.rowHeight));
      case 'ArrowRight': {
        e.preventDefault();
        const id = this.cursor;
        if (this.store.kind[id] === 0 && !this.expanded.has(id)) this.toggle(id);
        else move(i + 1);
        return;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const id = this.cursor;
        if (this.store.kind[id] === 0 && this.expanded.has(id)) { this.toggle(id); return; }
        const parent = this.store.parent[id];
        if (parent > 0) { this.cursor = parent; this.paint(); this.scrollTo(parent); }
        return;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const id = this.cursor;
        if (this.store.kind[id] === 1) this.onOpen(id, e);
        else this.toggle(id);
        return;
      }
      default:
    }
  }

  focus() { this.scroller.focus(); }
}
