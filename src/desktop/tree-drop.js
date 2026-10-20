/** Drag and drop in the Notes panel.
 *
 *  Into PaperNotes: drop files or whole folders from Explorer onto a folder
 *  and they are copied into it (onto a file: into that file's folder; onto
 *  empty space: the top of the study folder). Text or a link dragged from a
 *  browser becomes a new note. Nothing is ever overwritten: a name that is
 *  taken becomes "name (2).md".
 *
 *  Inside PaperNotes: drag a note or folder onto another folder to move it
 *  there, or onto empty space to move it to the top. Its stickies, marks and
 *  tabs move with it, exactly as with Rename. Dropping a note into the
 *  editor writes a [[link]] to it.
 *
 *  Hovering a closed folder for a moment opens it, so deep folders can be
 *  reached in one drag.
 *
 *  Out of PaperNotes (the 2.4 app and later): the drag is a real Windows
 *  file drag, so dropping a note on the desktop, into Explorer or into an
 *  email copies the file there. The note itself stays in the study folder.
 *  Dropped back onto the tree it is still a move, and into the editor a
 *  [[link]], because this file knows the drag is its own. */

import { call } from './bridge.js';

const MAX_BYTES = 8 * 1024 * 1024;   // what the host's writeBinary accepts
const MAX_FILES = 400;
const PATH_TYPE = 'application/x-papernotes-path';

// The note being dragged out through Windows right now, if any.
let outgoing = null;
/** { path, link } while a note from the tree is being dragged out, else null. */
export const draggingOut = () => outgoing;

const join = (dir, name) => (dir ? `${dir}/${name}` : name);
const nameOf = (path) => path.split('/').pop();
const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const NOTE_RE = /\.(md|markdown|mdx)$/i;
const BAD_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** A Windows-safe file name from some text. */
function safeName(text, fallback) {
  const name = String(text || '').replace(BAD_CHARS, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80);
  return name || fallback;
}

export function attachTreeDrop({ tree, store, toasts, refresh, router, moveTo, dragOut = false }) {
  const panel = tree.scroller;
  // The whole Notes section takes drops; its header is "the top of the study folder".
  const zone = panel.closest('.side__tree') || panel.parentElement;
  const head = zone.querySelector('.panel__head');
  tree.draggableRows = true;
  for (const slot of tree.pool) slot.el.draggable = true;

  const hint = document.createElement('div');
  hint.className = 'tree-drop-hint';
  hint.hidden = true;
  if (getComputedStyle(panel.parentElement).position === 'static') panel.parentElement.style.position = 'relative';
  panel.parentElement.appendChild(hint);

  // ── where a drop would land ─────────────────────────────────────────
  const pathOfRow = (row) => store.pathOf(Number(row.dataset.id));
  function targetOf(e) {
    if (head?.contains(e.target)) return { folder: '', row: null, head: true };
    const row = !tree.results && e.target.closest?.('.tree__row');
    if (!row) return { folder: '', row: null };
    const id = Number(row.dataset.id);
    if (store.kind[id] === 0) return { folder: store.pathOf(id), row, id };
    const parent = store.parent[id];
    const parentRow = parent > 0 ? panel.querySelector(`.tree__row[data-id="${parent}"]`) : null;
    return { folder: parent > 0 ? store.pathOf(parent) : '', row: parentRow, id: parent };
  }

  let marked = null;
  let clearTimer = null;
  let openTimer = null;
  let openFor = -1;
  function mark(t, label) {
    if (marked && marked !== t.row) delete marked.dataset.drop;
    marked = t.row;
    if (t.row) t.row.dataset.drop = 'into';
    panel.dataset.drop = t.row ? 'row' : t.head ? 'head' : 'root';
    zone.dataset.dragging = 'true';
    if (head) head.dataset.drop = t.head ? 'root' : 'offer';
    hint.textContent = label;
    hint.hidden = false;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(unmark, 160);
  }
  function unmark() {
    if (marked) delete marked.dataset.drop;
    marked = null;
    delete panel.dataset.drop;
    delete zone.dataset.dragging;
    if (head) delete head.dataset.drop;
    hint.hidden = true;
    clearTimeout(openTimer);
    openFor = -1;
  }
  /** Hovering a closed folder opens it after a moment. */
  function maybeOpen(t) {
    if (!t.row || t.id === openFor) return;
    clearTimeout(openTimer);
    openFor = t.id;
    if (t.row.dataset.open === 'true') return;
    openTimer = setTimeout(() => { if (openFor === t.id && !tree.expanded.has(t.id)) tree.toggle(t.id); }, 650);
  }

  // ── dragging rows ───────────────────────────────────────────────────
  let dragged = null;
  panel.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('.tree__row');
    if (!row) return;
    dragged = pathOfRow(row);
    // Dropped into the editor (or anywhere that takes text): a link to it.
    const label = nameOf(dragged).replace(NOTE_RE, '');
    const link = store.kind[Number(row.dataset.id)] === 0 ? dragged : `[[${label}]]`;
    row.dataset.dragging = 'true';
    if (dragOut) {
      // Windows carries this drag, so it can leave the app as a real file.
      e.preventDefault();
      outgoing = { path: dragged, link };
      call('dragOut', dragged, link)
        .catch((err) => toasts.show({ tone: 'error', text: `Could not drag it out: ${err.message}` }))
        .finally(() => { outgoing = null; dragged = null; row.removeAttribute('data-dragging'); unmark(); });
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(PATH_TYPE, dragged);
    e.dataTransfer.setData('text/plain', link);
  });
  panel.addEventListener('dragend', (e) => {
    e.target.closest?.('.tree__row')?.removeAttribute('data-dragging');
    dragged = null;
    unmark();
  });

  const kindOf = (e) => {
    if (outgoing) return 'move';
    const types = [...(e.dataTransfer?.types || [])];
    if (types.includes(PATH_TYPE)) return 'move';
    if (types.includes('Files')) return 'files';
    if (types.includes('text/plain') || types.includes('text/uri-list')) return 'text';
    return null;
  };

  zone.addEventListener('dragover', (e) => {
    const kind = kindOf(e);
    if (!kind) return;
    const t = targetOf(e);
    if (kind === 'move') {
      const from = outgoing?.path || dragged;
      const bad = !from || parentOf(from) === t.folder || t.folder === from || t.folder.startsWith(`${from}/`);
      if (bad) { e.dataTransfer.dropEffect = 'none'; unmark(); return; }
      e.preventDefault();
      // A Windows drag only ever offers a copy (so Explorer can never take the
      // note away); inside the tree it is still moved.
      e.dataTransfer.dropEffect = outgoing ? 'copy' : 'move';
      mark(t, `Move ${nameOf(from)} to ${t.folder ? nameOf(t.folder) : 'the top of the study folder'}`);
    } else {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      mark(t, `${kind === 'files' ? 'Add to' : 'New note in'} ${t.folder ? nameOf(t.folder) : 'your study folder'}`);
    }
    maybeOpen(t);
  });

  zone.addEventListener('drop', async (e) => {
    const kind = kindOf(e);
    if (!kind) return;
    e.preventDefault();
    const { folder } = targetOf(e);
    unmark();
    try {
      if (kind === 'move') {
        const from = outgoing?.path || e.dataTransfer.getData(PATH_TYPE);
        if (from && parentOf(from) !== folder && folder !== from && !folder.startsWith(`${from}/`)) await moveTo(from, join(folder, nameOf(from)));
      } else if (kind === 'files') {
        await addDropped(e.dataTransfer, folder);
      } else {
        await addText(e.dataTransfer, folder);
      }
    } catch (err) {
      toasts.show({ tone: 'error', text: `Could not do that: ${err.message}` });
    }
  });

  // ── adding things ───────────────────────────────────────────────────
  const taken = new Map();   // folder -> Set of lower-case names, fresh per drop
  /** What is already in a folder: its files as they are on disk now (the
   *  host lists files only), plus its sub-folders from the index. */
  async function namesIn(folder) {
    if (!taken.has(folder)) {
      let list = [];
      try { list = await call('list', folder); } catch { /* a new folder: empty */ }
      const names = new Set((list || []).map((n) => String(n).toLowerCase()));
      const id = folder ? await store.resolvePath(folder) : 0;
      if (id >= 0) for (const c of store.childrenOf(id)) names.add(store.nameOf(c).toLowerCase());
      taken.set(folder, names);
    }
    return taken.get(folder);
  }
  /** `name`, or "name (2).ext" and so on when that is taken. */
  async function freeName(folder, name) {
    const names = await namesIn(folder);
    const dot = name.lastIndexOf('.');
    const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    let n = 1;
    let out = name;
    while (names.has(out.toLowerCase())) out = `${base} (${++n})${ext}`;
    names.add(out.toLowerCase());
    return out;
  }

  function base64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
      r.onerror = () => reject(r.error || new Error('could not read it'));
      r.readAsDataURL(file);
    });
  }

  /** Every file in what was dropped, folders included, as [folder, File]. */
  async function collect(dt, folder) {
    const out = [];
    const tooBig = [];
    const walk = async (entry, dir) => {
      if (out.length >= MAX_FILES) return;
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        if (file.size > MAX_BYTES) tooBig.push(file.name); else out.push([dir, file]);
      } else if (entry.isDirectory) {
        if (entry.name.startsWith('.')) return;
        const name = await freeName(dir, safeName(entry.name, 'Folder'));
        const path = join(dir, name);
        await call('mkdir', path);
        taken.set(path, new Set());
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const child of batch) await walk(child, path);
        }
      }
    };
    const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) {
      for (const entry of entries) await walk(entry, folder);
    } else {
      for (const file of dt.files) {
        if (file.size > MAX_BYTES) tooBig.push(file.name); else out.push([folder, file]);
      }
    }
    return { files: out, tooBig };
  }

  async function addDropped(dt, folder) {
    taken.clear();
    const { files, tooBig } = await collect(dt, folder);
    if (files.length > 10) toasts.show({ text: `Adding ${files.length} files…` });
    const added = [];
    for (const [dir, file] of files) {
      const name = await freeName(dir, safeName(file.name, 'Untitled'));
      await call('writeBinary', join(dir, name), await base64(file));
      added.push(join(dir, name));
    }
    await refresh();
    if (added.length) {
      toasts.show({ text: `Added ${added.length} file${added.length === 1 ? '' : 's'} to ${folder || 'your study folder'}.` });
      const first = added.find((p) => NOTE_RE.test(p)) || added[0];
      if (added.length === 1 || NOTE_RE.test(first)) router.go(first);
    }
    if (tooBig.length) {
      toasts.show({ tone: 'warn', text: `${tooBig.length === 1 ? `${tooBig[0]} is` : `${tooBig.length} files are`} over 8 MB, so ${tooBig.length === 1 ? 'it was' : 'they were'} left out. Right-click the folder and choose Add files to copy big ones.` });
    }
  }

  /** Text or a link dragged in from somewhere else: a new note. */
  async function addText(dt, folder) {
    taken.clear();
    const text = dt.getData('text/plain').trim();
    const url = dt.getData('text/uri-list').split(/\r?\n/).find((l) => l && !l.startsWith('#'));
    if (!text && !url) return;
    const isLink = url && (!text || text === url);
    const first = (isLink ? url.replace(/^https?:\/\/(www\.)?/, '') : text.split(/\r?\n/)[0]).replace(/^#+\s*/, '');
    const title = safeName(first.slice(0, 60), 'Dropped note');
    const name = await freeName(folder, `${title}.md`);
    // A short first line is the title, and is not repeated underneath.
    const lines = text.split(/\r?\n/);
    const rest = lines.slice(1).join('\n').trim();
    const body = isLink ? `# ${title}\n\n<${url}>\n`
      : /^#\s/.test(text) ? `${text}\n`
      : lines[0].length <= 80 && rest ? `# ${lines[0].trim()}\n\n${rest}\n`
      : `# ${title}\n\n${text}\n`;
    await call('create', join(folder, name), body);
    await refresh();
    router.go(join(folder, name));
    toasts.show({ text: `New note ${name} in ${folder || 'your study folder'}.` });
  }
}
