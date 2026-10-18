/** Tabs.
 *
 *  Every tab is its own little session: where it is, its back/forward
 *  history, which folders are open in the tree, how far the tree and the
 *  note are scrolled, and what the filter box says. A new tab starts from
 *  scratch, tree collapsed. Switching tabs swaps all of that in and out of
 *  the one tree and the one reader, which is far cheaper than keeping a
 *  tree and a reader alive per tab.
 *
 *  main.js supplies capture() (read the live UI into a tab) and restore()
 *  (put a tab's state back on screen); this file owns the list, the strip
 *  and the history. */

import { icon } from './icons.js';

let seq = 0;
const newId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

export class Tabs {
  constructor({ mount, titleOf, capture, restore, onChange }) {
    this.titleOf = titleOf;
    this.capture = capture;
    this.restore = restore;
    this.onChange = onChange || (() => {});
    this.tabs = [];
    this.activeId = null;
    this._navigating = false;   // a back/forward/switch is moving the route

    this.el = document.createElement('div');
    this.el.className = 'tabbar';
    this.el.setAttribute('role', 'tablist');
    this.strip = document.createElement('div');
    this.strip.className = 'tabbar__strip';
    this.addBtn = document.createElement('button');
    this.addBtn.className = 'icon-btn tabbar__add';
    this.addBtn.title = 'New tab (Ctrl+T)';
    this.addBtn.setAttribute('aria-label', 'New tab');
    this.addBtn.innerHTML = icon('plus');
    this.addBtn.onclick = () => this.open('', { activate: true });
    this.el.append(this.strip, this.addBtn);
    mount.appendChild(this.el);

    this.strip.addEventListener('click', (e) => {
      const tabEl = e.target.closest('.tab');
      if (!tabEl) return;
      if (e.target.closest('.tab__close')) { this.close(tabEl.dataset.id); return; }
      this.activate(tabEl.dataset.id);
    });
    this.strip.addEventListener('auxclick', (e) => {
      const tabEl = e.target.closest('.tab');
      if (tabEl && e.button === 1) { e.preventDefault(); this.close(tabEl.dataset.id); }
    });
    this.strip.addEventListener('dblclick', (e) => {
      if (e.target === this.strip) this.open('', { activate: true });
    });
    this._dragSetup();
  }

  get active() { return this.tabs.find((t) => t.id === this.activeId) || null; }

  _make(path = '', anchor = '') {
    return {
      id: newId(), path, anchor,
      history: [{ path, anchor }], hi: 0,
      expanded: [], treeScroll: 0, readerScroll: 0, query: '',
      fresh: true,
    };
  }

  /** Open a tab. `path` '' is the home view. */
  open(path = '', { activate = true, after = this.activeId } = {}) {
    const tab = this._make(path);
    const at = this.tabs.findIndex((t) => t.id === after);
    this.tabs.splice(at < 0 ? this.tabs.length : at + 1, 0, tab);
    if (activate || !this.activeId) this.activate(tab.id);
    else this.render();
    this.onChange();
    return tab;
  }

  async activate(id) {
    if (id === this.activeId) return;
    const prev = this.active;
    if (prev) this.capture(prev);
    this.activeId = id;
    this.render();
    const tab = this.active;
    this._navigating = true;
    try { await this.restore(tab, { fresh: tab.fresh }); }
    finally { this._navigating = false; }
    tab.fresh = false;
    this.onChange();
  }

  close(id = this.activeId) {
    const i = this.tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    if (this.tabs.length === 1) {
      // The last tab is never closed, it goes back to a fresh home view.
      const fresh = this._make('');
      this.tabs = [fresh];
      this.activeId = null;
      this.activate(fresh.id);
      return;
    }
    const wasActive = id === this.activeId;
    this.tabs.splice(i, 1);
    if (wasActive) {
      this.activeId = null;
      this.activate(this.tabs[Math.min(i, this.tabs.length - 1)].id);
    } else {
      this.render();
      this.onChange();
    }
  }

  cycle(step) {
    if (this.tabs.length < 2) return;
    const i = this.tabs.findIndex((t) => t.id === this.activeId);
    const next = this.tabs[(i + step + this.tabs.length) % this.tabs.length];
    this.activate(next.id);
  }

  /** The route changed in the active tab: record it. */
  noteRoute(route) {
    const tab = this.active;
    if (!tab) return;
    tab.path = route.path;
    tab.anchor = route.anchor || '';
    if (!this._navigating) {
      const cur = tab.history[tab.hi];
      if (!cur || cur.path !== route.path) {
        tab.history = tab.history.slice(0, tab.hi + 1);
        tab.history.push({ path: route.path, anchor: route.anchor || '' });
        if (tab.history.length > 100) tab.history.shift();
        tab.hi = tab.history.length - 1;
      }
    }
    this.render();
    this.onChange();
  }

  canBack() { const t = this.active; return Boolean(t && t.hi > 0); }
  canForward() { const t = this.active; return Boolean(t && t.hi < t.history.length - 1); }

  async back() { return this._step(-1); }
  async forward() { return this._step(1); }

  async _step(d) {
    const tab = this.active;
    if (!tab) return;
    const hi = tab.hi + d;
    if (hi < 0 || hi >= tab.history.length) return;
    tab.hi = hi;
    const target = tab.history[hi];
    this._navigating = true;
    try { await this.restore({ ...tab, path: target.path, anchor: target.anchor, readerScroll: 0 }, { routeOnly: true }); }
    finally { this._navigating = false; }
    this.render();
    this.onChange();
  }

  render() {
    const frag = document.createDocumentFragment();
    for (const tab of this.tabs) {
      const el = document.createElement('div');
      el.className = 'tab';
      el.dataset.id = tab.id;
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', String(tab.id === this.activeId));
      el.draggable = true;
      const title = this.titleOf(tab.path);
      el.title = tab.path || 'Home';
      el.innerHTML = `<span class="tab__title"></span><button class="tab__close" aria-label="Close tab" title="Close (Ctrl+W)">${icon('close')}</button>`;
      el.querySelector('.tab__title').textContent = title;
      frag.appendChild(el);
    }
    this.strip.replaceChildren(frag);
    this.el.dataset.single = String(this.tabs.length === 1);
  }

  _dragSetup() {
    let dragId = null;
    this.strip.addEventListener('dragstart', (e) => {
      const t = e.target.closest('.tab');
      if (!t) return;
      dragId = t.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    this.strip.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const over = e.target.closest('.tab');
      if (!over || over.dataset.id === dragId) return;
      const from = this.tabs.findIndex((t) => t.id === dragId);
      const to = this.tabs.findIndex((t) => t.id === over.dataset.id);
      const [moved] = this.tabs.splice(from, 1);
      this.tabs.splice(to, 0, moved);
      this.render();
    });
    this.strip.addEventListener('dragend', () => { dragId = null; this.onChange(); });
  }

  // ── persistence ──────────────────────────────────────────────────────
  serialize() {
    if (this.active) this.capture(this.active);
    return {
      active: this.activeId,
      tabs: this.tabs.map((t) => ({
        id: t.id, path: t.path, anchor: t.anchor, history: t.history.slice(-30),
        hi: Math.min(t.hi, 29), expanded: t.expanded.slice(0, 200),
        treeScroll: t.treeScroll, readerScroll: t.readerScroll, query: t.query,
      })),
    };
  }

  load(saved) {
    if (!saved?.tabs?.length) return false;
    this.tabs = saved.tabs.map((t) => ({ ...this._make(), ...t, fresh: false }));
    const want = this.tabs.find((t) => t.id === saved.active) || this.tabs[0];
    this.activeId = null;
    this.activate(want.id);
    return true;
  }
}
