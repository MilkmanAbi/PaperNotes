/** The reader.
 *
 *  The note is content, not chrome (§4.1): it sits on its own bordered
 *  sheet, with the app's furniture around it rather than layered over it,
 *  and the prose column is held to a readable measure (Patterns §9).
 *
 *  Scroll position is treated as the user's (Patterns §9): re-rendering the
 *  same note — because the theme changed, or a search highlight was applied
 *  — restores where they were rather than throwing them back to the top. */

import { icon } from './icons.js';
import { renderNote, rewriteLinks, highlightTerms, highlightCode } from '../core/markdown.js';
import { enhance } from './enhance.js';
import { humanBytes, humanDate, toHash } from '../core/paths.js';
import { fileKind, kindIcon, kindLabel, codeLanguage } from '../core/filetypes.js';

// Text-based attachments are fetched and shown inline up to this size; past
// it the viewer offers the file instead of freezing the tab on a 40 MB log.
const TEXT_LIMIT = 2 * 1024 * 1024;

export class Reader {
  constructor({ mount, store, router, onNavigate, onReveal }) {
    this.store = store;
    this.router = router;
    this.onNavigate = onNavigate || (() => {});
    this.onReveal = onReveal || (() => {});

    this.wrap = document.createElement('div');
    this.wrap.className = 'reader-wrap scroll canvas-rule';
    this.inner = document.createElement('div');
    this.inner.className = 'reader';
    this.wrap.appendChild(this.inner);
    mount.appendChild(this.wrap);

    this.styleEl = document.createElement('style');
    this.styleEl.dataset.owner = 'note-content';
    document.head.appendChild(this.styleEl);

    this.currentPath = null;
    this.extensions = [];
    this._busy = false;
    this.headings = [];
    this.terms = [];
    this._cache = new Map();   // path -> raw text, small and bounded
    this._token = 0;
  }

  setHighlightTerms(terms) { this.terms = terms; }

  _setStyles(css) {
    if (this.styleEl.textContent !== css) this.styleEl.textContent = css;
  }

  _clear() {
    this.inner.replaceChildren();
    this.inner.dataset.wide = 'false';
    this.inner.dataset.fill = 'false';
    this._setStyles('');
    this.headings = [];
  }

  // ── states ──────────────────────────────────────────────────────────
  showHome(stats) {
    this._clear();
    this.currentPath = null;
    const store = this.store;
    const totals = store.totals || {};
    const el = document.createElement('div');
    el.className = 'state state--home';
    el.innerHTML = `
      <div class="state__art">${icon('book', '')}</div>
      <h2>Notes</h2>
      <p>Pick something from the tree, or press <kbd>⌘K</kbd> to jump straight to a note by name.
         <kbd>/</kbd> filters by name and, once it has loaded, by the words inside notes and PDFs.</p>
      <dl class="home-figures">
        <div><dt>Notes</dt><dd>${(totals.notes ?? 0).toLocaleString()}</dd></div>
        ${totals.files ? `<div><dt>Files</dt><dd>${totals.files.toLocaleString()}</dd></div>` : ''}
        <div><dt>Folders</dt><dd>${(totals.folders ?? 0).toLocaleString()}</dd></div>
        <div><dt>On disk</dt><dd>${humanBytes(totals.bytes ?? 0)}</dd></div>
      </dl>`;

    // The top level is the map of the whole site, so the start page shows it.
    const top = store.childrenOf(0);
    if (top.length) {
      const list = document.createElement('ul');
      list.className = 'folder__list home__list';
      for (const id of top) list.appendChild(this._entry(id));
      el.appendChild(list);
    }
    this.inner.appendChild(el);
    this._emitHeadings();
    void stats;
  }

  /** One row of a folder listing: glyph, title, and what it holds. */
  _entry(id) {
    const store = this.store;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = toHash(store.pathOf(id));
    const isDir = store.kind[id] === 0;
    const glyph = isDir ? 'folder' : kindIcon(fileKind(store.nameOf(id)));
    let aside = '';
    if (isDir && !store.isDeferred(id)) {
      const n = store.childCount[id] || 0;
      aside = `${n} ${n === 1 ? 'item' : 'items'}`;
    } else if (!isDir && fileKind(store.nameOf(id)) !== 'note') {
      aside = humanBytes(store.size[id] || 0);
    }
    a.innerHTML = `${icon(glyph)}<span>${escape(store.titleOf(id))}</span>` +
      (aside ? `<small class="folder__aside">${aside}</small>` : '');
    li.appendChild(a);
    return li;
  }

  showFolder(nodeId) {
    this._clear();
    const store = this.store;
    const path = store.pathOf(nodeId);
    this.currentPath = path;

    const sheet = document.createElement('div');
    sheet.className = 'reader__sheet';
    sheet.appendChild(this._breadcrumb(nodeId));

    const h = document.createElement('h1');
    h.className = 'folder__title';
    h.textContent = store.nameOf(nodeId) || 'Notes';
    sheet.appendChild(h);

    const children = store.childrenOf(nodeId);
    const meta = document.createElement('p');
    meta.className = 'caption';
    const dirs = children.filter((c) => store.kind[c] === 0).length;
    const notes = children.filter((c) => store.kind[c] === 1 && fileKind(store.nameOf(c)) === 'note').length;
    const files = children.length - dirs - notes;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    meta.textContent = store.isDeferred(nodeId)
      ? 'This folder has not been opened yet.'
      : [notes && plural(notes, 'note'), files && plural(files, 'file'), dirs && plural(dirs, 'folder')]
        .filter(Boolean).join(' · ') || 'Empty';
    sheet.appendChild(meta);

    const list = document.createElement('ul');
    list.className = 'folder__list';
    for (const child of children) list.appendChild(this._entry(child));
    sheet.appendChild(list);
    this.inner.appendChild(sheet);
    this.wrap.scrollTop = 0;
    this._emitHeadings();
  }

  showMissing(path, { reason = 'not-indexed', detail = '' } = {}) {
    this._clear();
    this.currentPath = path;
    const el = document.createElement('div');
    el.className = 'state state--error';
    const title = reason === 'fetch'
      ? 'That note is in the index but would not load.'
      : 'There is no note at that path.';
    const body = reason === 'fetch'
      ? 'The file is listed in the index, so it existed when the site was built. Either the build did not copy it, or the request failed on the way.'
      : 'The link may be older than the index, or the path may differ in case — GitHub Pages serves paths case-sensitively.';
    el.innerHTML = `
      <div class="state__art">${icon('alert', '')}</div>
      <h2>${escape(title)}</h2>
      <p>${body}</p>
      <div class="state__detail mono">${escape(path)}${detail ? `\n${escape(detail)}` : ''}</div>
      <div class="state__actions">
        <button class="btn btn--secondary" data-act="retry">${icon('refresh')} Try again</button>
        <button class="btn btn--secondary" data-act="home">Go to the start</button>
        <button class="btn btn--ghost" data-act="search">Search for it by name</button>
      </div>`;
    el.querySelector('[data-act="retry"]').onclick = () => this.open(path, { force: true });
    el.querySelector('[data-act="home"]').onclick = () => this.router.go('');
    el.querySelector('[data-act="search"]').onclick = () =>
      this.onNavigate('search', path.split('/').pop().replace(/\.(md|markdown|mdx)$/i, ''));
    this.inner.appendChild(el);
    this._emitHeadings();
  }

  // ── the note ────────────────────────────────────────────────────────
  /** Things layered on the reader (study tools, desktop tools). Each may
   *  give actions(ctx) → buttons for the header, and after(ctx) → work to
   *  do once a note or file is on screen. ctx: { path, nodeId, kind, sheet,
   *  article, view }. */
  use(ext) { this.extensions.push(ext); }

  _actions(ctx) { return this.extensions.flatMap((e) => e.actions?.(ctx) || []); }

  _after(ctx) {
    for (const e of this.extensions) {
      try { e.after?.(ctx); } catch (err) { console.error(err); }
    }
  }

  async open(path, opts = {}) {
    this._busy = true;
    try { return await this._open(path, opts); } finally { this._busy = false; }
  }

  async _open(path, { anchor = '', force = false, nodeId = -1 } = {}) {
    if (fileKind(path) !== 'note') return this.openFile(path, { force, nodeId });
    const token = ++this._token;
    const samePath = this.currentPath === path;
    const keepScroll = samePath ? this.wrap.scrollTop : 0;

    let raw = force ? null : this._cache.get(path);

    if (raw === undefined || raw === null) {
      // Only the reader shows this wait; the tree, search and toolbar stay
      // fully usable throughout (PI §4.4).
      if (!samePath) this._showLoading(path);
      try {
        const res = await fetch(this.store.contentUrl(path), { cache: 'force-cache' });
        if (token !== this._token) return;
        if (!res.ok) {
          this.showMissing(path, { reason: 'fetch', detail: `HTTP ${res.status} ${res.statusText}` });
          return;
        }
        raw = await res.text();
        if (token !== this._token) return;
        this._remember(path, raw);
      } catch (err) {
        if (token !== this._token) return;
        this.showMissing(path, { reason: 'fetch', detail: String(err?.message || err) });
        return;
      }
    }

    const rendered = renderNote(raw, path);
    if (token !== this._token) return;

    this._clear();
    this.currentPath = path;

    const sheet = document.createElement('div');
    sheet.className = 'reader__sheet';
    if (nodeId > 0) sheet.appendChild(this._breadcrumb(nodeId));

    const article = document.createElement('article');
    article.className = 'note-content';
    article.innerHTML = rendered.html;
    sheet.appendChild(article);

    const ctx = { path, nodeId, kind: 'note', sheet, article, raw };
    if (nodeId > 0) {
      let meta = this._meta(nodeId);
      const actions = this._actions(ctx);
      if (actions.length) {
        if (!meta) { meta = document.createElement('div'); meta.className = 'note__meta'; }
        meta.appendChild(this._actionBar(actions, 'note__actions'));
      }
      if (meta) sheet.insertBefore(meta, article);
      const nav = this._prevNext(nodeId);
      if (nav) sheet.appendChild(nav);
    }

    this.inner.appendChild(sheet);
    this._setStyles(rendered.css);

    rewriteLinks(article, path, {
      exists: (p) => this._indexHas(p),
      resolveWiki: (n) => this.resolveWiki(n),
    });
    enhance(article, this.enhanceContext(path, raw));

    if (this.terms.length) highlightTerms(article, this.terms);

    this.headings = rendered.headings;
    this._emitHeadings();
    this._after(ctx);

    if (anchor) {
      const target = article.querySelector(`#${CSS.escape(anchor)}`)
        || (/^Ld+$/.test(anchor) && article.querySelector(`[data-line="${anchor.slice(1)}"]`));
      if (target) { target.scrollIntoView({ block: 'center' }); return; }
    }
    this.wrap.scrollTop = keepScroll;
  }

  // ── attachments ─────────────────────────────────────────────────────
  // Anything in content/ that is not a note. The header (name, type, size,
  // open, download) is the same for every kind, so the file is always one
  // click from the browser's own handling even when the viewer below can
  // not show it — a PDF on a phone, a slide deck, a zip.
  async openFile(path, opts = {}) {
    this._busy = true;
    try { return await this._openFile(path, opts); } finally { this._busy = false; }
  }

  async _openFile(path, { force = false, nodeId = -1 } = {}) {
    const token = ++this._token;
    const store = this.store;
    const name = path.split('/').pop();
    const kind = fileKind(name);
    const url = store.contentUrl(path);
    const size = nodeId > 0 ? store.size[nodeId] : 0;
    const mtime = nodeId > 0 ? store.mtime[nodeId] : 0;

    this._clear();
    this.currentPath = path;
    // A PDF fills the tab, the way Edge opens one: a slim bar, then the viewer.
    const fill = kind === 'pdf';
    this.inner.dataset.fill = String(fill);
    this.inner.dataset.wide = String(!fill && ['page', 'image', 'video', 'table', 'notebook', 'code'].includes(kind));

    const sheet = document.createElement('div');
    sheet.className = 'reader__sheet reader__sheet--file';
    if (nodeId > 0 && !fill) sheet.appendChild(this._breadcrumb(nodeId));

    const head = document.createElement('header');
    head.className = 'file__head';
    head.innerHTML = `
      <span class="file__glyph">${icon(kindIcon(kind))}</span>
      <div class="file__titles">
        <h1 class="file__title">${escape(name)}</h1>
        <p class="caption">${escape([kindLabel(name), size && humanBytes(size), mtime && humanDate(mtime)].filter(Boolean).join(' · '))}</p>
      </div>
      <div class="file__actions">
        <a class="btn btn--secondary" href="${escape(url)}" target="_blank" rel="noopener">${icon('external')}<span>Open</span></a>
        <a class="btn btn--ghost" href="${escape(url)}" download="${escape(name)}">${icon('download')}<span>Download</span></a>
      </div>`;
    // Extensions add theirs; one that supplies "open" (the desktop app)
    // replaces the browser's open/download.
    const ctx = { path, nodeId, kind, sheet };
    const own = this._actions(ctx);
    if (own.length) {
      const bar = this._actionBar(own, 'file__actions');
      if (!own.some((a) => a.id === 'open')) bar.append(...head.querySelector('.file__actions').children);
      head.querySelector('.file__actions').replaceWith(bar);
    }
    sheet.appendChild(head);

    const view = document.createElement('div');
    view.className = 'file__view';
    sheet.appendChild(view);
    if (nodeId > 0 && !fill) {
      const nav = this._prevNext(nodeId);
      if (nav) sheet.appendChild(nav);
    }
    this.inner.appendChild(sheet);
    this.wrap.scrollTop = 0;
    this._emitHeadings();
    ctx.view = view;
    this._after(ctx);

    try {
      await this._fillViewer(view, { kind, name, url, size, path, force, token, ctx, nodeId });
    } catch (err) {
      if (token !== this._token) return;
      view.replaceChildren(this._fileNote(
        `This file could not be shown here (${err?.message || err}). Open or download it instead.`));
    }
  }

  /** An extension's own viewer for this kind of file (the desktop app's PDF
   *  reader); true when it took the file. */
  async _ownViewer(view, { kind, name, url, path, token, ctx, nodeId }) {
    for (const e of this.extensions) {
      if (!e.view) continue;
      const v = {
        view, kind, name, url, path, ctx,
        current: () => token === this._token,
        reopen: () => this.openFile(path, { force: true, nodeId }),
      };
      if (await e.view(v)) return true;
    }
    return false;
  }

  async _fillViewer(view, { kind, name, url, size, path, force, token, ctx, nodeId }) {
    const frame = (cls, extra = '') =>
      `<iframe class="file__frame ${cls}" src="${escape(url)}" title="${escape(name)}" ${extra}></iframe>`;

    switch (kind) {
      case 'pdf':
        if (await this._ownViewer(view, { kind, name, url, path, token, ctx, nodeId })) return;
        view.innerHTML = frame('file__frame--pdf');
        if (matchMedia('(pointer: coarse)').matches) {
          view.prepend(this._fileNote('Phone browsers often show only the first page here. Use Open for the full PDF.'));
        }
        return;
      case 'page':
        // A saved web page: its own styles and images, never its scripts.
        view.innerHTML = frame('file__frame--page', 'sandbox="allow-popups allow-popups-to-escape-sandbox"');
        return;
      case 'image':
        view.innerHTML = `<img class="file__image" src="${escape(url)}" alt="${escape(name)}">`;
        return;
      case 'video':
        view.innerHTML = `<video class="file__media" src="${escape(url)}" controls preload="metadata"></video>`;
        return;
      case 'audio':
        view.innerHTML = `<audio class="file__audio" src="${escape(url)}" controls preload="metadata"></audio>`;
        return;
      case 'office': {
        const opener = this._actions({ path, nodeId: -1, kind }).find((a) => a.id === 'open');
        if (opener) {
          view.appendChild(this._fileNote('This opens in its own app, like Word, PowerPoint or Excel.', opener));
          return;
        }
        const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
        const viewer = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;
        view.appendChild(this._fileNote(
          'Browsers cannot open Office files by themselves. Download it, or preview it with Microsoft\'s free online viewer.',
          local ? null : { href: viewer, label: 'Preview online' }));
        return;
      }
      case 'archive':
      case 'other':
        view.appendChild(this._fileNote('There is no preview for this kind of file. Download it to open it on your device.'));
        return;
      default:
        break;
    }

    // Everything left is text the app renders itself.
    if (size > TEXT_LIMIT) {
      view.appendChild(this._fileNote(`This file is ${humanBytes(size)}, too large to show here. Open or download it instead.`));
      return;
    }
    view.innerHTML = '<p class="caption">Loading…</p>';
    const text = await this._fetchText(path, url, force);
    if (token !== this._token) return;

    const article = document.createElement('div');
    article.className = 'note-content';

    if (kind === 'link') {
      const target = /^\s*URL\s*=\s*(\S+)/mi.exec(text)?.[1] || /<string>(https?:[^<]+)<\/string>/.exec(text)?.[1];
      if (!target || !/^https?:/i.test(target)) {
        view.replaceChildren(this._fileNote('This shortcut does not contain a web address.'));
        return;
      }
      view.replaceChildren(this._fileNote(target, { href: target, label: 'Open the link' }, true));
      return;
    }

    if (kind === 'code') {
      const lang = codeLanguage(name);
      article.innerHTML = `<pre class="file__code"><code class="hljs">${highlightCode(text, lang)}</code></pre>`;
    } else if (kind === 'table') {
      article.appendChild(csvTable(text, name.toLowerCase().endsWith('.tsv') ? '\t' : ','));
    } else if (kind === 'notebook') {
      const { html, headings, css } = renderNotebook(text, path);
      article.innerHTML = html;
      this._setStyles(css);
      this.headings = headings;
    }
    view.replaceChildren(article);
    rewriteLinks(article, path, { exists: (p) => this._indexHas(p), resolveWiki: (n) => this.resolveWiki(n) });
    enhance(article, this.enhanceContext(path, text));
    this._emitHeadings();
  }

  /** What enhance() needs to reach beyond the note: other notes (embeds,
   *  previews, links in diagrams) and search (#tags). */
  enhanceContext(path, raw = null) {
    return {
      path,
      raw,
      exists: (p) => this._indexHas(p),
      resolveWiki: (n) => this.resolveWiki(n),
      contentUrl: (p) => this.store.contentUrl(p),
      fetchText: (p) => this._fetchText(p, this.store.contentUrl(p), false),
      open: (p, anchor = '') => { window.location.hash = toHash(p, anchor); },
      search: (q) => this.onNavigate?.('search', q),
      rewrite: (el, p = path) => rewriteLinks(el, p, { exists: (x) => this._indexHas(x), resolveWiki: (n) => this.resolveWiki(n) }),
    };
  }

  async _fetchText(path, url, force) {
    let text = force ? undefined : this._cache.get(path);
    if (text !== undefined) return text;
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    text = await res.text();
    this._remember(path, text);
    return text;
  }

  /** A short explanation with an optional action, inside the file view. */
  _fileNote(text, action = null, mono = false) {
    const el = document.createElement('div');
    el.className = 'file__note';
    const p = document.createElement('p');
    p.textContent = text;
    if (mono) p.className = 'mono';
    el.appendChild(p);
    if (action?.run) {
      el.appendChild(this._actionBar([{ ...action, primary: true }], 'file__note-actions'));
    } else if (action) {
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = action.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.innerHTML = `${icon('external')}<span>${escape(action.label)}</span>`;
      el.appendChild(a);
    }
    return el;
  }

  /** Buttons from { label, icon, run, primary, title } descriptions. */
  _actionBar(actions, cls) {
    const bar = document.createElement('div');
    bar.className = cls;
    for (const act of actions) {
      if (act.el) { bar.appendChild(act.el); continue; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = act.iconOnly ? 'icon-btn icon-btn--framed' : act.primary ? 'btn' : 'btn btn--secondary';
      if (act.id) b.dataset.act = act.id;
      if (act.pressed !== undefined) b.setAttribute('aria-pressed', String(Boolean(act.pressed)));
      b.innerHTML = act.iconOnly ? icon(act.icon) : `${act.icon ? icon(act.icon) : ''}<span>${escape(act.label)}</span>`;
      b.title = act.title || act.label;
      b.setAttribute('aria-label', act.label);
      b.onclick = (e) => act.run(e, b);
      bar.appendChild(b);
    }
    return bar;
  }

  _showLoading(path) {
    this._clear();
    const el = document.createElement('div');
    el.className = 'state';
    el.innerHTML = `<p class="caption">Opening ${escape(path)}…</p>`;
    this.inner.appendChild(el);
  }

  _remember(path, raw) {
    this._cache.set(path, raw);
    if (this._cache.size > 24) {
      // Bounded, oldest first: this is a convenience, not a store.
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
  }

  /** [[Name]] → the path of the note (or file) called Name. Notes win
   *  over other files, and the shallowest match wins over deeper ones. */
  resolveWiki(name) {
    const store = this.store;
    if (!this._wiki || this._wikiSize !== store.nodeCount) {
      const map = new Map();
      const rank = (id) => (/\.(md|markdown|mdx)$/i.test(store.nameOf(id)) ? 0 : 1) * 100 + store.depthOf(id);
      for (let i = 1; i < store.nodeCount; i++) {
        if (store.kind[i] !== 1) continue;
        const full = store.nameOf(i).toLowerCase();
        for (const key of [full, full.replace(/\.[^.]+$/, ''), full.replace(/\.[^.]+$/, '').replace(/^\d{1,4}[-_. ]+/, '')]) {
          const prev = map.get(key);
          if (prev === undefined || rank(i) < rank(prev)) map.set(key, i);
        }
      }
      this._wiki = map;
      this._wikiSize = store.nodeCount;
    }
    const key = String(name).trim().toLowerCase();
    let id = this._wiki.get(key);
    if (id === undefined && key.includes('/')) id = store.lookup(name.trim());
    return id > 0 ? store.pathOf(id) : null;
  }

  _indexHas(path) {
    if (!this._pathSet) {
      this._pathSet = new Set();
      this._pathSetSize = this.store.nodeCount;
      for (let i = 1; i < this.store.nodeCount; i++) {
        this._pathSet.add(this.store.pathOf(i));   // notes, files and folders
      }
    } else if (this._pathSetSize !== this.store.nodeCount) {
      this._pathSet = null;
      return this._indexHas(path);
    }
    return this._pathSet.has(path);
  }

  _breadcrumb(nodeId) {
    const store = this.store;
    const nav = document.createElement('nav');
    nav.className = 'breadcrumb';
    nav.setAttribute('aria-label', 'Location');

    const chain = [...store.ancestorsOf(nodeId), nodeId];
    chain.forEach((id, i) => {
      const last = i === chain.length - 1;
      if (id === 0) {
        const b = document.createElement('button');
        b.textContent = 'Notes';
        b.onclick = () => this.router.go('');
        nav.appendChild(b);
      } else if (last) {
        const span = document.createElement('span');
        span.className = 'breadcrumb__current';
        span.textContent = store.nameOf(id);
        nav.appendChild(span);
      } else {
        const b = document.createElement('button');
        b.textContent = store.nameOf(id);
        b.onclick = () => this.router.go(store.pathOf(id));
        nav.appendChild(b);
      }
      if (!last) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb__sep';
        sep.textContent = '/';
        nav.appendChild(sep);
      }
    });
    return nav;
  }

  _meta(nodeId) {
    const store = this.store;
    const tags = store.tagsOf(nodeId);
    const mtime = store.mtime[nodeId];
    const size = store.size[nodeId];
    if (!tags.length && !mtime && !size) return null;

    const el = document.createElement('div');
    el.className = 'note__meta';
    for (const tag of tags) {
      const chip = document.createElement('span');
      chip.className = 'chip chip--tag';
      chip.innerHTML = `${icon('tag')}<span>${escape(tag)}</span>`;
      chip.title = `Search for notes tagged ${tag}`;
      chip.style.cursor = 'pointer';
      chip.onclick = () => this.onNavigate('search', tag);
      el.appendChild(chip);
    }
    const caption = document.createElement('span');
    caption.className = 'caption';
    caption.textContent = [mtime && humanDate(mtime), size && humanBytes(size)]
      .filter(Boolean).join(' · ');
    el.appendChild(caption);
    return el;
  }

  _prevNext(nodeId) {
    const order = this.store.noteOrder();
    const i = order.indexOf(nodeId);
    if (i === -1) return null;
    const prev = order[i - 1];
    const next = order[i + 1];
    if (prev === undefined && next === undefined) return null;

    const nav = document.createElement('nav');
    nav.className = 'note__nav';
    nav.setAttribute('aria-label', 'Nearby notes');

    const link = (id, dir) => {
      const a = document.createElement('a');
      a.href = toHash(this.store.pathOf(id));
      a.className = dir === 'next' ? 'note__nav-dir' : '';
      a.innerHTML =
        `<span class="caption">${dir === 'next' ? 'Next' : 'Previous'}</span>` +
        `<span>${escape(this.store.titleOf(id))}</span>`;
      return a;
    };
    if (prev !== undefined) nav.appendChild(link(prev, 'prev'));
    if (next !== undefined) nav.appendChild(link(next, 'next'));
    return nav;
  }

  _emitHeadings() { this.onReveal?.(this.headings, this.inner); }
}

/** A CSV as a table. Quoted fields, doubled quotes and CRLF are handled;
 *  the first row is the header. Capped, because a sensor log can be huge. */
function csvTable(text, sep, maxRows = 1000) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length && rows.length <= maxRows; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  const [header = [], ...body] = rows;
  const thead = table.createTHead().insertRow();
  for (const h of header) {
    const th = document.createElement('th');
    th.textContent = h.replace(/^﻿/, '');
    thead.appendChild(th);
  }
  const tbody = table.createTBody();
  for (const r of body.slice(0, maxRows)) {
    const tr = tbody.insertRow();
    for (const cell of r) {
      const td = tr.insertCell();
      td.textContent = cell;
      if (/^-?[\d.,]+%?$/.test(cell.trim())) td.setAttribute('align', 'right');
    }
  }
  wrap.appendChild(table);
  if (rows.length > maxRows) {
    const more = document.createElement('p');
    more.className = 'caption';
    more.textContent = `Showing the first ${maxRows} rows. Download the file for the rest.`;
    wrap.appendChild(more);
  }
  return wrap;
}

/** A Jupyter notebook, read-only: Markdown cells through the note renderer,
 *  code cells highlighted, and the saved outputs (text and images) under
 *  them. HTML outputs are shown as their plain-text form, because they are
 *  usually widgets or tables whose scripts would not run here anyway. */
function renderNotebook(text, path) {
  const nb = JSON.parse(text);
  const lang = nb.metadata?.language_info?.name || nb.metadata?.kernelspec?.language || 'python';
  const join = (v) => (Array.isArray(v) ? v.join('') : String(v ?? ''));
  const headings = [];
  const styles = [];
  const parts = [];
  for (const cell of nb.cells || []) {
    const src = join(cell.source);
    if (cell.cell_type === 'markdown') {
      const r = renderNote(src, path);
      headings.push(...r.headings);
      if (r.css) styles.push(r.css);
      parts.push(`<div class="nb-cell nb-cell--md">${r.html}</div>`);
    } else if (cell.cell_type === 'code') {
      let out = '';
      for (const o of cell.outputs || []) {
        if (o.output_type === 'stream') out += `<pre class="nb-out">${escape(join(o.text))}</pre>`;
        else if (o.output_type === 'error') out += `<pre class="nb-out nb-out--error">${escape(`${o.ename}: ${o.evalue}`)}</pre>`;
        else if (o.data) {
          const png = o.data['image/png'];
          const jpg = o.data['image/jpeg'];
          if (png || jpg) {
            out += `<img class="nb-img" alt="" src="data:image/${png ? 'png' : 'jpeg'};base64,${join(png || jpg).replace(/\s+/g, '')}">`;
          } else if (o.data['text/plain']) {
            out += `<pre class="nb-out">${escape(join(o.data['text/plain']))}</pre>`;
          }
        }
      }
      const n = cell.execution_count ?? ' ';
      parts.push(`<div class="nb-cell nb-cell--code"><span class="nb-count">[${n}]</span>` +
        `<pre><code class="hljs">${highlightCode(src, lang)}</code></pre>${out}</div>`);
    }
  }
  return { html: parts.join('\n'), headings, css: styles.join('\n') };
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
