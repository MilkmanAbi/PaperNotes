/** The study layer over the reader and the tree: Mark as done (and the
 *  progress it adds up to), colour tags, reminders, and the two overlays
 *  in marks.js (confused dots) and stickies.js (sticky notes).
 *
 *  Everything it shows comes from StudyState and is redrawn when that
 *  changes; nothing here touches the files themselves. */

import { icon } from './icons.js';
import { fileKind } from '../core/filetypes.js';
import { TAG_COLORS, tagLabel } from '../core/state.js';
import { showPopover, closePopover } from './popover.js';
import { askForm } from './dialog.js';
import { attachMarks } from './marks.js';
import { attachStickies } from './stickies.js';
import { windowNumber } from '../desktop/bridge.js';

/** Files that count towards progress: things you study, not their assets. */
export const STUDY_KINDS = new Set(['note', 'pdf', 'office', 'notebook']);

export function isStudyFile(name) {
  return STUDY_KINDS.has(fileKind(name)) && !/^00 About this unit\.md$/i.test(name);
}

export function initStudy({ state, store, tree, reader, router, toasts, prefs, openPath, hostInfo }) {
  void prefs; void openPath; void hostInfo;

  // ── progress: done / total study files per folder ─────────────────────
  let progress = null;
  function computeProgress() {
    const done = new Int32Array(store.nodeCount);
    const total = new Int32Array(store.nodeCount);
    for (let i = store.nodeCount - 1; i > 0; i--) {
      if (store.kind[i] === 1 && isStudyFile(store.nameOf(i))) {
        total[i] = 1;
        if (state.isDone(store.pathOf(i))) done[i] = 1;
      }
      const p = store.parent[i];
      if (p >= 0) { total[p] += total[i]; done[p] += done[i]; }
    }
    progress = { done, total };
    return progress;
  }
  const progressOf = (id) => {
    if (!progress || progress.total.length !== store.nodeCount) computeProgress();
    return { done: progress.done[id] || 0, total: progress.total[id] || 0 };
  };

  // ── the tree's badges ─────────────────────────────────────────────────
  tree.decorate = (id) => {
    const path = store.pathOf(id);
    const tags = state.tagsOf(path);
    const isDir = store.kind[id] === 0;
    let html = '';
    let key = '';
    if (tags.length) {
      html += '<span class="tagdots">' + tags.slice(0, 4).map((t) =>
        `<i style="background:${state.colorOf(t)}" title="${escapeAttr(tagLabel(t))}"></i>`).join('') + '</span>';
      key += tags.join(',');
    }
    const marks = !isDir && state.marksOf(path).length;
    if (marks) { html += `<span class="tree__confused" title="${marks} confused ${marks === 1 ? 'spot' : 'spots'}"></span>`; key += `|m${marks}`; }
    const stick = !isDir && state.stickiesOf(path).length;
    if (stick) { html += `<span class="tree__sticky" title="${stick} sticky ${stick === 1 ? 'note' : 'notes'}">${icon('sticky')}</span>`; key += `|s${stick}`; }
    let done = false;
    if (isDir) {
      const p = progressOf(id);
      if (p.done > 0) {
        const full = p.done === p.total;
        html += `<span class="tree__progress${full ? ' is-full' : ''}" title="${p.done} of ${p.total} done">${full ? icon('check') : `${p.done}/${p.total}`}</span>`;
        key += `|p${p.done}/${p.total}`;
        done = full;
      }
    } else if (state.isDone(path)) {
      html += `<span class="tree__done" title="Done">${icon('check')}</span>`;
      key += '|d';
      done = true;
    }
    return html ? { html, key, done } : null;
  };

  state.onChange((ev) => {
    if (ev.quiet) return;
    if (ev.type === 'done' || ev.type === 'load' || ev.type === 'rename') progress = null;
    tree.paint();
    refreshHeader(ev);
  });
  store.onChange?.((ev) => { if (ev.type === 'reload') progress = null; });

  // ── header buttons ────────────────────────────────────────────────────
  let current = null;   // { path, kind, nodeId }

  function refreshHeader(ev) {
    if (!current || (ev?.path && ev.path !== current.path)) return;
    const done = state.isDone(current.path);
    for (const b of document.querySelectorAll('.reader [data-act="done"]')) {
      b.setAttribute('aria-pressed', String(done));
      b.querySelector('span') && (b.querySelector('span').textContent = done ? 'Done' : 'Mark as done');
    }
    const chips = document.querySelector('.reader .study-tags');
    if (chips) chips.replaceWith(tagChips(current.path));
    document.querySelector('.reader .reader__sheet')?.classList.toggle('is-done', done);
  }

  function tagChips(path) {
    const el = document.createElement('span');
    el.className = 'study-tags';
    for (const t of state.tagsOf(path)) {
      const chip = document.createElement('button');
      chip.className = 'tagchip';
      chip.innerHTML = `<i style="background:${state.colorOf(t)}"></i><span>${escapeHtml(tagLabel(t))}</span>`;
      chip.title = `Tagged ${tagLabel(t)}. Click to change tags.`;
      chip.onclick = () => openTagPicker(path, chip);
      el.appendChild(chip);
    }
    return el;
  }

  reader.use({
    actions: (ctx) => {
      if (ctx.nodeId <= 0 && ctx.kind !== 'note') return [];
      const done = state.isDone(ctx.path);
      const tagEl = tagChips(ctx.path);
      return [
        { el: tagEl },
        { id: 'done', label: done ? 'Done' : 'Mark as done', icon: 'checkCircle', pressed: done, title: 'Mark as done (Ctrl+D)', run: () => toggleDone(ctx.path) },
        { id: 'tag', label: 'Tags', icon: 'tag', iconOnly: true, title: 'Colour tags', run: (e, b) => openTagPicker(ctx.path, b) },
        { id: 'remind', label: 'Remind me', icon: 'bell', iconOnly: true, title: 'Add a reminder (Ctrl+R)', run: () => addReminder(ctx.path) },
        { id: 'sticky', label: 'Sticky note', icon: 'sticky', iconOnly: true, title: 'Add a sticky note (Ctrl+Shift+S)', run: () => addSticky(ctx.path) },
      ];
    },
    after: (ctx) => {
      current = { path: ctx.path, kind: ctx.kind, nodeId: ctx.nodeId };
      ctx.sheet.classList.toggle('is-done', state.isDone(ctx.path));
      if (ctx.kind === 'note' && ctx.article) marks.attach(ctx);
      stickies.attach(ctx);
    },
  });

  const marks = attachMarks({ state, reader, toasts });
  const stickies = attachStickies({ state, reader });

  // ── actions ───────────────────────────────────────────────────────────
  const here = () => (current && reader.currentPath === current.path ? current.path : null);

  function toggleDone(path = here()) {
    if (!path) return;
    const next = !state.isDone(path);
    state.setDone(path, next);
    if (next) toasts.show({ text: `Done: ${path.split('/').pop()}`, action: { label: 'Undo', run: () => state.setDone(path, false) } });
  }

  function openTagPicker(path, anchor) {
    const list = document.createElement('div');
    list.className = 'tagpicker';
    const head = document.createElement('div');
    head.className = 'tagpicker__head';
    head.textContent = 'Tags';
    list.appendChild(head);
    const render = () => {
      list.querySelectorAll('.tagpicker__row').forEach((r) => r.remove());
      for (const t of state.allTags()) {
        const row = document.createElement('button');
        row.className = 'tagpicker__row';
        row.setAttribute('aria-pressed', String(state.hasTag(path, t.id)));
        row.innerHTML = `<i style="background:${t.color}"></i><span>${escapeHtml(t.label)}</span>${icon('check')}`;
        row.onclick = () => { state.toggleTag(path, t.id); render(); };
        list.insertBefore(row, form);
      }
    };
    const form = document.createElement('form');
    form.className = 'tagpicker__new';
    form.innerHTML = `<input type="text" placeholder="New tag…" maxlength="40" aria-label="New tag name">`;
    form.onsubmit = (e) => {
      e.preventDefault();
      const name = form.querySelector('input').value.trim();
      if (!name) return;
      const builtin = TAG_COLORS.find((c) => c.label.toLowerCase() === name.toLowerCase());
      const id = builtin ? builtin.id : name;
      if (!builtin && !state.data.tagDefs[name]) {
        const palette = ['#e25c8a', '#3fb6b2', '#7c6cf0', '#c98a2b', '#5a9e5a'];
        state.defineTag(name, palette[Object.keys(state.data.tagDefs).length % palette.length]);
      }
      if (!state.hasTag(path, id)) state.toggleTag(path, id);
      form.querySelector('input').value = '';
      render();
    };
    list.appendChild(form);
    render();
    showPopover(list, { anchor });
  }

  async function addReminder(path = here(), existing = null, suggested = '') {
    const r = existing || {};
    const due = r.due ? toLocalInput(r.due) : '';
    const fields = [
      { name: 'text', label: 'Remind me to…', type: 'text', value: r.text || suggested || (path ? `Revise ${titleFor(path)}` : ''), placeholder: 'Finish the Ch4 drill' },
      { name: 'due', label: 'When (optional)', type: 'datetime', value: due },
      { name: 'important', label: 'Important', type: 'checkbox', value: r.important },
    ];
    if (path) fields.push({ name: 'link', label: `Link it to ${titleFor(path)}`, type: 'checkbox', value: existing ? Boolean(r.path) : true });
    const out = await askForm({
      title: existing ? 'Edit reminder' : 'New reminder', fields, action: existing ? 'Save' : 'Add reminder',
      danger: existing ? 'Delete' : null,
    });
    if (!out) return;
    if (out.__danger) { state.removeReminder(existing.id); return; }
    if (!out.text.trim()) return;
    const data = {
      text: out.text.trim(),
      due: out.due ? Math.floor(new Date(out.due).getTime() / 1000) : 0,
      important: Boolean(out.important),
      path: path && out.link ? path : (existing && !path ? existing.path : ''),
      notified: false,
    };
    if (existing) state.updateReminder(existing.id, data);
    else {
      state.addReminder(data);
      toasts.show({ text: 'Reminder added. It is in the Reminders toolkit.' });
    }
  }

  function addSticky(path = here()) {
    if (!path) return;
    stickies.add(path);
  }

  function titleFor(path) {
    const id = store.lookup(path);
    return id > 0 ? store.titleOf(id) : path.split('/').pop();
  }

  // Reminders that fall due while the app is open say so (and the desktop
  // app turns it into a Windows notification).
  const notifyDue = () => {
    if (windowNumber) return;   // the main window says it; a popped-out one would say it twice
    const t = Math.floor(Date.now() / 1000);
    for (const r of state.reminders) {
      if (r.done || !r.due || r.notified || r.due > t) continue;
      state.updateReminder(r.id, { notified: true });
      toasts.show({
        tone: 'warn', text: `Reminder: ${r.text}`,
        action: r.path ? { label: 'Open', run: () => router.go(r.path) } : null,
      });
      window.dispatchEvent(new CustomEvent('papernotes:reminder', { detail: r }));
    }
  };
  setInterval(notifyDue, 30000);
  setTimeout(notifyDue, 3000);

  return {
    progressOf,
    toggleDone,
    addReminder,
    addSticky,
    openTagPicker,
    titleFor,
    marks,
    stickies,
    get current() { return current; },
    onKey(e, { typing, ctrl, key }) {
      if (typing) return false;
      if (ctrl && !e.shiftKey && key === 'd') { e.preventDefault(); toggleDone(); return true; }
      if (ctrl && !e.shiftKey && key === 'r') { e.preventDefault(); addReminder(); return true; }
      if (ctrl && e.shiftKey && key === 's') { e.preventDefault(); addSticky(); return true; }
      if (e.key === 'Escape') closePopover();
      return false;
    },
  };
}

function toLocalInput(sec) {
  const d = new Date(sec * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
