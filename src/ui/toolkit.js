/** The toolkit: the bottom half of the left panel.
 *
 *    Tags       the macOS-style colour list; click one to see what has it
 *    Reminders  what to do, most pressing first
 *    Confused   every red dot, across all notes
 *    Stickies   every sticky note, across all notes
 *    Progress   done / total per module
 *
 *  It redraws itself from StudyState whenever that changes, but only the
 *  section on screen, and at most once a frame. */

import { icon } from './icons.js';
import { tagLabel } from '../core/state.js';
import { escapeHtml } from './study.js';
import { isStudyFile } from './study.js';

const SECTIONS = [
  { id: 'tags', label: 'Tags', icon: 'tag' },
  { id: 'reminders', label: 'Reminders', icon: 'bell' },
  { id: 'confused', label: 'Confused', icon: 'question' },
  { id: 'stickies', label: 'Stickies', icon: 'sticky' },
  { id: 'cards', label: 'Cards', icon: 'book' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
];

export class Toolkit {
  constructor({ mount, tabsMount, state, store, router, prefs, toasts, study, showList, clearList }) {
    Object.assign(this, { mount, tabsMount, state, store, router, prefs, toasts, study, showList, clearList });
    this.section = SECTIONS.some((s) => s.id === prefs.get('toolkitTab')) ? prefs.get('toolkitTab') : 'tags';
    this.activeTag = null;
    this._raf = 0;
    this._renderTabs();
    this.render();
    state.onChange((ev) => { if (!ev.quiet) this.schedule(); });
    store.onChange?.(() => this.schedule());
    router.onChange?.(() => { if (this.section === 'cards') this.schedule(); });
    // Relative due dates ("in 20 min") go stale; refresh them now and then.
    setInterval(() => { if (this.section === 'reminders') this.schedule(); }, 60000);
  }

  schedule() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this.render());
  }

  _renderTabs() {
    this.tabsMount.innerHTML = SECTIONS.map((s) => `
      <button class="toolkit__tab" role="tab" data-id="${s.id}" aria-selected="${s.id === this.section}" title="${s.label}">
        ${icon(s.icon)}<span>${s.label}</span>
      </button>`).join('');
    this.tabsMount.onclick = (e) => {
      const b = e.target.closest('.toolkit__tab');
      if (!b) return;
      this.section = b.dataset.id;
      this.prefs.set('toolkitTab', this.section);
      if (!this.prefs.get('toolkitOpen')) this.prefs.set('toolkitOpen', true);
      for (const t of this.tabsMount.children) t.setAttribute('aria-selected', String(t.dataset.id === this.section));
      this.render();
    };
  }

  render() {
    const body = this[`_${this.section}`]();
    this.mount.replaceChildren(body);
    this._badges();
  }

  /** Counts on the section tabs, so the toolkit says what's waiting. */
  _badges() {
    const counts = {
      reminders: this.state.pendingReminders().length,
      confused: this.state.allMarks().length,
      stickies: this.state.allStickies().length,
      cards: this.state.dueCards().length,
    };
    for (const t of this.tabsMount.children) {
      const n = counts[t.dataset.id];
      let badge = t.querySelector('.toolkit__count');
      if (!n) { badge?.remove(); continue; }
      if (!badge) { badge = document.createElement('span'); badge.className = 'toolkit__count'; t.appendChild(badge); }
      badge.textContent = n > 99 ? '99+' : String(n);
    }
    const overdue = this.state.pendingReminders().some((r) => r.due && r.due * 1000 < Date.now());
    this.tabsMount.querySelector('[data-id="reminders"]')?.classList.toggle('is-alert', overdue);
  }

  _list(cls = '') {
    const ul = document.createElement('ul');
    ul.className = `tk-list ${cls}`.trim();
    return ul;
  }

  _empty(text) {
    const p = document.createElement('p');
    p.className = 'tk-empty';
    p.textContent = text;
    return p;
  }

  _title(path) {
    const id = this.store.lookup(path);
    return id > 0 ? this.store.titleOf(id) : path.split('/').pop();
  }

  _where(path) {
    const parts = path.split('/');
    parts.pop();
    return parts.slice(-2).join(' / ');
  }

  // ── Tags ─────────────────────────────────────────────────────────────
  _tags() {
    const wrap = document.createElement('div');
    const ul = this._list('tk-tags');
    for (const t of this.state.allTags()) {
      const n = this.state.pathsWithTag(t.id).length;
      const li = document.createElement('li');
      li.innerHTML = `<button class="tk-row${this.activeTag === t.id ? ' is-active' : ''}">
        <i class="tk-dot" style="background:${t.color}"></i><span class="tk-label">${escapeHtml(t.label)}</span>
        <span class="tk-meta">${n || ''}</span></button>`;
      li.firstElementChild.onclick = () => this._filterTag(t.id);
      if (!t.builtin) {
        li.firstElementChild.oncontextmenu = (e) => { e.preventDefault(); this._removeTag(t.id); };
        li.firstElementChild.title = 'Right-click to delete this tag';
      }
      ul.appendChild(li);
    }
    const all = document.createElement('li');
    all.innerHTML = `<button class="tk-row tk-row--muted"><span class="tk-rings"></span><span class="tk-label">All Tags…</span></button>`;
    all.firstElementChild.onclick = () => this._filterTag('*');
    ul.appendChild(all);
    wrap.appendChild(ul);
    const hint = document.createElement('p');
    hint.className = 'tk-hint';
    hint.textContent = 'Tag a note with the tag button on it, or right-click it in the tree.';
    wrap.appendChild(hint);
    return wrap;
  }

  _filterTag(tag) {
    if (this.activeTag === tag) { this.activeTag = null; this.clearList(); this.render(); return; }
    this.activeTag = tag;
    const paths = tag === '*' ? Object.keys(this.state.data.tags) : this.state.pathsWithTag(tag);
    this.showList(paths, tag === '*' ? 'Tagged' : `Tagged ${tagLabel(tag)}`);
    this.render();
  }

  _removeTag(tag) {
    this.state.removeTagEverywhere(tag);
    this.toasts.show({ text: `Deleted the tag ${tag}.` });
  }

  // ── Reminders ────────────────────────────────────────────────────────
  _reminders() {
    const wrap = document.createElement('div');
    const add = document.createElement('button');
    add.className = 'btn btn--secondary tk-add';
    add.innerHTML = `${icon('plus')}<span>New reminder</span>`;
    add.onclick = () => this.study.addReminder(null);
    wrap.appendChild(add);

    const pending = this.state.pendingReminders();
    if (!pending.length) wrap.appendChild(this._empty('Nothing to remember. Add one from any note with the bell, or here.'));
    const ul = this._list('tk-reminders');
    for (const r of pending) ul.appendChild(this._reminderRow(r));
    wrap.appendChild(ul);

    const done = this.state.reminders.filter((r) => r.done);
    if (done.length) {
      const det = document.createElement('details');
      det.className = 'tk-done';
      det.innerHTML = `<summary>Done (${done.length})</summary>`;
      const dl = this._list('tk-reminders');
      for (const r of done.slice(-30).reverse()) dl.appendChild(this._reminderRow(r));
      const clear = document.createElement('button');
      clear.className = 'btn btn--ghost';
      clear.textContent = 'Clear done';
      clear.onclick = () => { for (const r of done) this.state.removeReminder(r.id); };
      det.append(dl, clear);
      wrap.appendChild(det);
    }
    return wrap;
  }

  _reminderRow(r) {
    const li = document.createElement('li');
    li.className = 'tk-reminder';
    const due = r.due ? dueText(r.due) : null;
    li.dataset.state = r.done ? 'done' : due?.overdue ? 'overdue' : r.important ? 'important' : '';
    li.innerHTML = `
      <input type="checkbox" ${r.done ? 'checked' : ''} aria-label="Done">
      <button class="tk-reminder__body">
        <span class="tk-reminder__text">${r.important ? '<b class="tk-bang">!</b> ' : ''}${escapeHtml(r.text)}</span>
        <span class="tk-reminder__meta">${due ? `<span class="tk-due">${escapeHtml(due.text)}</span>` : ''}${r.path ? `<span>${escapeHtml(this._title(r.path))}</span>` : ''}</span>
      </button>`;
    li.querySelector('input').onchange = (e) => this.state.updateReminder(r.id, { done: e.target.checked });
    const body = li.querySelector('.tk-reminder__body');
    body.onclick = () => { if (r.path) this.router.go(r.path); else this.study.addReminder(null, r); };
    body.oncontextmenu = (e) => { e.preventDefault(); this.study.addReminder(null, r); };
    body.title = r.path ? 'Click to open the note, right-click to edit' : 'Click to edit';
    return li;
  }

  // ── Confused ─────────────────────────────────────────────────────────
  _confused() {
    const marks = this.state.allMarks();
    if (!marks.length) {
      return this._empty('No confused spots. Hover the left edge of anything in a note and click the dot to mark it.');
    }
    const ul = this._list('tk-marks');
    const byPath = new Map();
    for (const m of marks) { if (!byPath.has(m.path)) byPath.set(m.path, []); byPath.get(m.path).push(m); }
    for (const [path, list] of byPath) {
      const head = document.createElement('li');
      head.className = 'tk-group';
      head.textContent = this._title(path);
      head.title = path;
      ul.appendChild(head);
      for (const m of list.sort((a, b) => a.line - b.line)) {
        const li = document.createElement('li');
        li.innerHTML = `<button class="tk-row tk-mark"><i class="tk-reddot"></i><span class="tk-label">${escapeHtml(m.note || m.snippet || `Line ${m.line + 1}`)}</span></button>`;
        li.firstElementChild.title = m.snippet;
        li.firstElementChild.onclick = () => this._jump(path, m.line);
        li.firstElementChild.oncontextmenu = (e) => { e.preventDefault(); this.state.toggleMark(path, m.line); };
        ul.appendChild(li);
      }
    }
    return ul;
  }

  _jump(path, line) {
    this.router.go(path, { anchor: `L${line}` });
    setTimeout(() => this.study.marks.flash(line), 350);
  }

  // ── Stickies ─────────────────────────────────────────────────────────
  _stickies() {
    const all = this.state.allStickies();
    if (!all.length) return this._empty('No sticky notes yet. Open a note and press the sticky button (Ctrl+Shift+S).');
    const ul = this._list('tk-stickies');
    for (const s of all) {
      const li = document.createElement('li');
      li.innerHTML = `<button class="tk-sticky tk-sticky--${s.color}">
        <span class="tk-sticky__text">${escapeHtml((s.text || '(empty)').slice(0, 140))}</span>
        <span class="tk-sticky__where">${escapeHtml(this._title(s.path))}</span></button>`;
      li.firstElementChild.onclick = () => this.router.go(s.path, s.line >= 0 ? { anchor: `L${s.line}` } : {});
      ul.appendChild(li);
    }
    return ul;
  }

  // ── Cards ────────────────────────────────────────────────────────────
  _cards() {
    const wrap = document.createElement('div');
    const due = this.state.dueCards();
    const head = document.createElement('div');
    head.className = 'tk-cards-head';
    head.innerHTML = `<button class="btn tk-add" ${due.length ? '' : 'disabled'}>${icon('book')}<span>${due.length ? `Review ${due.length} due` : 'Nothing due'}</span></button>`;
    head.querySelector('button').onclick = () => this.router.go(':review');
    wrap.appendChild(head);

    // The open note may hold Q:/A: pairs (Claude writes them that way when
    // its tools aren't connected): offer to import them.
    const current = this.router.current.path;
    if (current && /\.md$/i.test(current)) {
      const btn = document.createElement('button');
      btn.className = 'btn btn--secondary tk-add';
      btn.innerHTML = `${icon('plus')}<span>Import Q:/A: cards from this note</span>`;
      btn.onclick = () => this._importCards(current);
      wrap.appendChild(btn);
    }

    const byPath = new Map();
    for (const c of this.state.cards) {
      const k = c.path || '';
      if (!byPath.has(k)) byPath.set(k, { total: 0, due: 0 });
      const e = byPath.get(k);
      e.total++;
      if (c.due <= Date.now() / 1000) e.due++;
    }
    if (!byPath.size) {
      wrap.appendChild(this._empty('No flashcards yet. Select text in a note and press Card, or right-click a note and choose Make flashcards with Claude.'));
      return wrap;
    }
    const ul = this._list();
    for (const [p, e] of [...byPath].sort((a, b) => b[1].due - a[1].due)) {
      const li = document.createElement('li');
      li.innerHTML = `<button class="tk-row"><span class="tk-label">${escapeHtml(p ? this._title(p) : 'Other cards')}</span><span class="tk-meta">${e.due ? `<b>${e.due}</b> / ` : ''}${e.total}</span></button>`;
      li.firstElementChild.title = e.due ? `${e.due} due of ${e.total}. Click to review.` : `${e.total} cards, none due`;
      li.firstElementChild.onclick = () => this.router.go(':review', { anchor: encodeURIComponent(p) });
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    return wrap;
  }

  async _importCards(path) {
    const res = await fetch(`content/${path.split('/').map(encodeURIComponent).join('/')}`, { cache: 'no-store' });
    if (!res.ok) return;
    const text = await res.text();
    const cards = [];
    const re = /^\s*(?:[-*]\s*)?Q:\s*([\s\S]*?)\n\s*(?:[-*]\s*)?A:\s*([\s\S]*?)(?=\n\s*(?:[-*]\s*)?Q:|\n\s*\n\s*\n|$)/gm;
    let m;
    while ((m = re.exec(text))) if (m[1].trim() && m[2].trim()) cards.push({ front: m[1].trim(), back: m[2].trim() });
    const have = new Set(this.state.cards.map((c) => c.front));
    let n = 0;
    for (const c of cards) if (!have.has(c.front)) { this.state.addCard({ ...c, path }); n++; }
    this.toasts.show({ text: n ? `Imported ${n} flashcards.` : cards.length ? 'Those cards are already in.' : 'No Q:/A: pairs in this note.' });
  }

  // ── Progress ─────────────────────────────────────────────────────────
  _progress() {
    const store = this.store;
    const wrap = document.createElement('div');
    const ul = this._list('tk-progress');
    let any = false;
    const row = (id, depth) => {
      const p = this.study.progressOf(id);
      if (!p.total) return;
      any = true;
      const pct = Math.round((p.done / p.total) * 100);
      const li = document.createElement('li');
      li.innerHTML = `<button class="tk-prog" style="--depth:${depth}">
        <span class="tk-prog__name">${escapeHtml(store.nameOf(id))}</span>
        <span class="tk-prog__num">${p.done}/${p.total}</span>
        <span class="tk-prog__bar"><i style="width:${pct}%"></i></span></button>`;
      li.firstElementChild.onclick = () => this.router.go(store.pathOf(id));
      li.firstElementChild.title = `${pct}% done. Click to open the folder.`;
      ul.appendChild(li);
    };
    for (const top of store.childrenOf(0)) {
      if (store.kind[top] !== 0) continue;
      row(top, 0);
      for (const child of store.childrenOf(top)) if (store.kind[child] === 0) row(child, 1);
    }
    if (!any) return this._empty('Nothing to track yet.');
    const total = store.childrenOf(0).reduce((acc, id) => {
      const p = this.study.progressOf(id);
      return { done: acc.done + p.done, total: acc.total + p.total };
    }, { done: 0, total: 0 });
    const sum = document.createElement('p');
    sum.className = 'tk-hint';
    sum.textContent = `${total.done} of ${total.total} done overall. Mark notes and PDFs as done from their header (Ctrl+D).`;
    wrap.append(ul, sum);
    void isStudyFile;
    return wrap;
  }
}

export function dueText(due) {
  const ms = due * 1000 - Date.now();
  const d = new Date(due * 1000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const today = new Date().toDateString() === d.toDateString();
  const tomorrow = new Date(Date.now() + 86400000).toDateString() === d.toDateString();
  if (ms < 0) {
    const mins = Math.round(-ms / 60000);
    const ago = mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
    return { text: `Overdue, ${ago}`, overdue: true };
  }
  if (today) return { text: `Today ${time}`, overdue: false };
  if (tomorrow) return { text: `Tomorrow ${time}`, overdue: false };
  return { text: `${day} ${time}`, overdue: false };
}
