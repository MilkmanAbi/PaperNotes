/** The desktop app's half of the UI: everything the website can't do.
 *
 *  - Notes are editable (Ctrl+E, or Edit on the note), with live preview.
 *  - Files open in their own Windows app; "Show in folder" opens Explorer.
 *  - New note / new folder / add files / rename / Recycle Bin / restore
 *    from a backup, from native right-click menus on the tree.
 *  - The study folder is watched: changes made outside the app (Explorer,
 *    another editor, OneDrive, Claude) show up without a restart.
 *  - Claude: hand the open note over (Ctrl+Shift+L), and take commands
 *    back from the PaperNotes MCP server through .papernotes/inbox.
 *  - Reminders become Windows notifications.
 *
 *  main.js calls initDesktop() once everything else exists, and asks
 *  beforeShow() before any navigation, so unsaved edits are saved first. */

import { call, onEvent, nativeMenu } from './bridge.js';
import { indexNotesFolder } from './indexer.js';
import { Editor } from './editor.js';
import { askName } from '../ui/dialog.js';
import { useLocalDb } from '../core/db.js';
import { fileKind } from '../core/filetypes.js';
import { icon } from '../ui/icons.js';
import { studyWithClaude, applyInbox, writeSession } from './claude.js';
import { STARTER, INFO, editProfile, loadProfile } from '../ui/profile.js';

const M = {
  OPEN: 1, OPEN_APP: 2, REVEAL: 3, EDIT: 4, NEW_TAB: 5,
  NEW_NOTE: 10, NEW_FOLDER: 11, IMPORT: 12,
  RENAME: 20, TRASH: 21, RESTORE: 22, COPY_PATH: 23,
  FOLDER: 30,
  DONE: 40, TAGS: 41, REMIND: 42, CLAUDE: 43, SIDE: 44, REVIEW: 45, CARDS: 46,
};

export function initDesktop(ctx) {
  const { store, search, tree, reader, router, toasts, prefs, shell, show, rerunSearch, setTotals, state, tabs, study, hostInfo, terminals, split } = ctx;
  const info = hostInfo;

  const editor = new Editor({
    reader, store, toasts, state, prefs,
    onSaved: () => scheduleRefresh(250),
    onClosed: () => {},
  });

  const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
  const join = (dir, name) => (dir ? `${dir}/${name}` : name);
  const nameOf = (path) => path.split('/').pop();
  const failed = (what) => (err) => toasts.show({ tone: 'error', text: `${what}: ${err.message}` });

  /** Where "new" things go: the open folder, the open file's folder, or,
   *  from home, the My Notes folder. */
  async function currentFolder() {
    const path = router.current.path || '';
    if (!path || path.startsWith(':')) return myNotesFolder();
    const id = await store.resolvePath(path);
    if (id < 0) return '';
    return store.kind[id] === 0 ? path : parentOf(path);
  }
  function myNotesFolder() {
    const top = store.childrenOf(0).find((id) => store.kind[id] === 0 && /my notes/i.test(store.nameOf(id)));
    return top !== undefined ? store.nameOf(top) : '';
  }

  // ── reader buttons ──────────────────────────────────────────────────
  reader.use({
    actions: (c) => {
      if (c.kind === 'note') {
        return [
          { id: 'edit', label: 'Edit', icon: 'edit', primary: true, title: 'Edit this note (Ctrl+E)', run: () => editPath(c.path) },
          { id: 'claude', label: 'Study with Claude', icon: 'sparkle', iconOnly: true, title: 'Study this with Claude (Ctrl+Shift+L)', run: () => claude(c.path) },
          { id: 'reveal', label: 'Show in folder', icon: 'folder', iconOnly: true, run: () => call('reveal', c.path).catch(failed('Could not show it')) },
        ];
      }
      return [
        { id: 'open', label: 'Open', icon: 'external', primary: true, title: 'Open in its Windows app', run: () => call('open', c.path).catch(failed('Could not open it')) },
        { id: 'claude', label: 'Study with Claude', icon: 'sparkle', iconOnly: true, title: 'Study this with Claude (Ctrl+Shift+L)', run: () => claude(c.path) },
        { id: 'reveal', label: 'Show in folder', icon: 'folder', iconOnly: true, run: () => call('reveal', c.path).catch(failed('Could not show it')) },
      ];
    },
  });

  /** Claude Code, with the note handed over: in the side pane next to the
   *  note (default), in the terminal panel, or in Windows Terminal. */
  const claude = (path, opts = {}) => studyWithClaude({
    path, state, store, info, toasts, profile: ctx.profile.profile, ...opts,
    launch: async (prompt) => {
      const where = prefs.get('claudeIn') || 'side';
      if (where === 'external') return call('claude', '', prompt);
      const session = await terminals.open('claude', { prompt, title: 'Claude', show: where !== 'side' });
      if (where === 'side') split.openTerminal(session);
      return session;
    },
  });
  window.addEventListener('papernotes:claude-here', () => {
    const p = router.current.path;
    claude(p && !p.startsWith(':') ? p : '');
  });
  window.addEventListener('papernotes:claude', (e) => claude(e.detail?.path || '', e.detail || {}));
  study.marks.onAsk((path, line) => claude(path, { line }));

  // ── refreshing after changes ────────────────────────────────────────
  let refreshing = false;
  let again = false;
  let timer = null;
  let lastSignature = ctx.signature;

  function scheduleRefresh(delay = 400) {
    clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  }

  async function refresh() {
    if (refreshing) { again = true; return; }
    refreshing = true;
    try {
      const keepExpanded = tree.expandedPaths();
      const idx = await indexNotesFolder();
      useLocalDb(idx.files);
      store.reload(idx.files['manifest.json']);
      search.reset();
      reader._cache.clear();
      reader._pathSet = null;

      tree.expanded.clear();
      for (const p of keepExpanded) {
        const id = await store.resolvePath(p);
        if (id > 0 && store.kind[id] === 0) tree.expanded.add(id);
      }
      tree.selected = -1;
      tree.invalidate();
      setTotals();
      rerunSearch();
      tabs.render();

      const structural = idx.signature !== lastSignature;
      lastSignature = idx.signature;
      // Re-show what is on screen, unless the editor has it: re-rendering
      // under someone's cursor is the one thing a refresh must never do.
      if (!editor.active) {
        const path = router.current.path;
        if (path && !path.startsWith(':') && (await store.resolvePath(path)) < 0) {
          // Deleted or renamed outside the app: fall back to the nearest
          // folder that still exists.
          let up = parentOf(path);
          while (up && (await store.resolvePath(up)) < 0) up = parentOf(up);
          router.go(up, { replace: true });
        } else if (structural || path) {
          await show(router.current);
        }
      } else if ((await store.resolvePath(editor.path)) > 0) {
        tree.setSelected(await store.resolvePath(editor.path));
      }
    } catch (err) {
      toasts.show({ tone: 'error', text: `Could not re-read the study folder: ${err.message}` });
    } finally {
      refreshing = false;
      if (again) { again = false; scheduleRefresh(100); }
    }
  }

  let pendingRefresh = false;
  onEvent((ev) => {
    if (ev.event === 'changed') {
      const paths = ev.paths || [];
      const inbox = paths.some((p) => p.startsWith('.papernotes/inbox/'));
      const stateFile = paths.includes('.papernotes/state.json');
      // info.md / timetable.csv aren't in the tree: re-read your profile, no refresh.
      const isProfile = (p) => /^(info\.md|time[-_ ]?table\.csv)$/i.test(p);
      if (paths.some(isProfile)) window.dispatchEvent(new CustomEvent('papernotes:profile-changed'));
      const notes = ev.overflow || paths.some((p) => !p.startsWith('.papernotes/') && !isProfile(p));
      if (inbox) applyInbox({ state, router, toasts, store }).then((n) => { if (n) toasts.show({ text: `Claude made ${n} ${n === 1 ? 'change' : 'changes'}.` }); });
      if (stateFile) state.reload();
      if (!notes) return;
      // An edit in progress is never refreshed out from under the user;
      // the tree catches up once they leave the editor.
      if (editor.dirty) { pendingRefresh = true; return; }
      scheduleRefresh();
    } else if (ev.event === 'save-then-quit') {
      Promise.all([editor.save(), state.flush()]).then(([ok]) => { if (ok) call('quit'); });
    } else if (ev.event === 'before-close') {
      state.flush();
      prefs.set('tabs', tabs.serialize());
    } else if (ev.event === 'open') {
      // A second launch with a path, or the tray's "Open".
      if (ev.path) router.go(ev.path);
    }
  });
  window.addEventListener('papernotes:rescan', () => scheduleRefresh(10));
  window.addEventListener('papernotes:new-note', () => newNote());
  window.addEventListener('papernotes:reminder', (e) => {
    const r = e.detail;
    call('notify', r.important ? 'Important reminder' : 'Reminder', r.text).catch(() => {});
  });
  // A brand-new library: starter files, then your details (all optional).
  if (info.empty) {
    (async () => {
      for (const [rel, text] of Object.entries(STARTER)) await call('create', rel, text).catch(() => {});
      const fresh = await loadProfile(store);
      await editProfile({
        profile: fresh, toasts, title: 'Tell PaperNotes about you (optional)',
        write: (rel, text) => call('write', rel, text),
      });
      await refresh();
      router.go('Welcome.md');
    })();
  }

  // Commands Claude left while the app was closed.
  setTimeout(() => applyInbox({ state, router, toasts, store }), 1500);

  // ── what Claude can see: the open note, the tabs ────────────────────
  let sessionTimer = null;
  const syncSession = () => {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => writeSession({ router, tabs, store, editor }), 600);
  };
  router.onChange(syncSession);
  setInterval(syncSession, 60000);   // a heartbeat: the MCP server knows the app is open
  syncSession();

  // ── actions ─────────────────────────────────────────────────────────
  /** Open the editor first, then move the route to it: show() sees the
   *  editor already has that path and leaves it alone. */
  async function editPath(path) {
    const id = await store.resolvePath(path);
    await editor.open(path, id);
    if (router.current.path !== path) router.go(path);
    if (id > 0) await tree.reveal(id);
  }

  async function newNote(folder) {
    folder ??= await currentFolder();
    const name = await askName({ title: folder ? `New note in ${nameOf(folder)}` : 'New note', value: 'Untitled.md', action: 'Create' });
    if (!name) return;
    const file = /\.(md|markdown|mdx)$/i.test(name) ? name : `${name}.md`;
    const path = join(folder, file);
    const heading = file.replace(/\.(md|markdown|mdx)$/i, '').replace(/^\d{1,4}[-_. ]+/, '');
    try {
      await call('create', path, `# ${heading}\n\n`);
      await refresh();
      await editPath(path);
    } catch (err) { failed('Could not create the note')(err); }
  }

  async function newFolder(folder) {
    folder ??= await currentFolder();
    const name = await askName({ title: 'New folder', value: 'New folder', action: 'Create', selectBase: false });
    if (!name) return;
    try {
      await call('mkdir', join(folder, name));
      await refresh();
      const id = await store.resolvePath(join(folder, name));
      if (id > 0) { await tree.reveal(id); router.go(join(folder, name)); }
    } catch (err) { failed('Could not create the folder')(err); }
  }

  async function importFiles(folder) {
    folder ??= await currentFolder();
    try {
      const n = Number(await call('import', folder));
      if (n > 0) {
        await refresh();
        toasts.show({ text: `Added ${n} file${n === 1 ? '' : 's'} to ${folder || 'your study folder'}.` });
      }
    } catch (err) { failed('Could not add the files')(err); }
  }

  async function rename(path) {
    const id = await store.resolvePath(path);
    const isDir = id > 0 && store.kind[id] === 0;
    const name = await askName({ title: isDir ? 'Rename folder' : 'Rename', value: nameOf(path), action: 'Rename', selectBase: !isDir });
    if (!name || name === nameOf(path)) return;
    const to = join(parentOf(path), name);
    if (editor.active && (editor.path === path || editor.path.startsWith(`${path}/`))) {
      if (!(await editor.close())) return;
    }
    try {
      await call('rename', path, to);
      state.renamePath(path, to);
      for (const t of tabs.tabs) {
        if (t.path === path || t.path.startsWith(`${path}/`)) t.path = to + t.path.slice(path.length);
      }
      const current = router.current.path;
      await refresh();
      if (current === path || current.startsWith(`${path}/`)) router.go(to + current.slice(path.length), { replace: true });
    } catch (err) { failed('Could not rename it')(err); }
  }

  async function trash(path) {
    try {
      const moved = await call('trash', path);
      if (!moved) return;
      if (editor.active && (editor.path === path || editor.path.startsWith(`${path}/`))) editor.abandon();
      await refresh();
    } catch (err) { failed('Could not move it to the Recycle Bin')(err); }
  }

  async function restore(path) {
    try {
      const list = await call('backups');
      const latest = list[0];
      if (!latest) { toasts.show({ tone: 'warn', text: 'There is no backup yet. Settings → Backups → Back up now.' }); return; }
      const n = await call('restoreBackup', latest.name, path);
      if (n === false) return;
      if (editor.active && (editor.path === path || editor.path.startsWith(`${path}/`))) editor.abandon();
      state.reload();
      await refresh();
      toasts.show({ text: `Restored ${n} file${n === 1 ? '' : 's'} from the ${latest.name.replace(/\.pack$/, '')} backup.` });
    } catch (err) { failed('Could not restore it')(err); }
  }

  // ── menus ───────────────────────────────────────────────────────────
  async function menuFor(path, point, rowEl) {
    const id = path ? await store.resolvePath(path) : 0;
    const isDir = id === 0 || store.kind[id] === 0;
    const isNote = !isDir && fileKind(path) === 'note';
    const folder = isDir ? path : parentOf(path);

    const items = [];
    if (path) {
      items.push({ id: M.OPEN, label: isDir ? 'Open' : 'Open here' }, { id: M.NEW_TAB, label: 'Open in new tab\tCtrl+Click' },
        { id: M.SIDE, label: 'Open to the side\tAlt+Click' });
      if (isNote) items.push({ id: M.EDIT, label: 'Edit\tCtrl+E' });
      if (!isDir) items.push({ id: M.OPEN_APP, label: 'Open in its Windows app' });
      items.push({ id: M.REVEAL, label: 'Show in folder' }, '-');
      if (!isDir) items.push({ id: M.DONE, label: state.isDone(path) ? 'Mark as not done\tCtrl+D' : 'Mark as done\tCtrl+D' });
      items.push({ id: M.TAGS, label: 'Tags…' });
      if (!isDir) items.push({ id: M.REMIND, label: 'Remind me about this…' }, { id: M.CLAUDE, label: 'Study with Claude' });
      if (isNote) items.push({ id: M.CARDS, label: 'Make flashcards with Claude' });
      if (state.dueCards(path).length) items.push({ id: M.REVIEW, label: `Review ${state.dueCards(path).length} flashcards from here` });
      items.push('-');
    }
    items.push(
      { id: M.NEW_NOTE, label: 'New note\tCtrl+N' },
      { id: M.NEW_FOLDER, label: 'New folder' },
      { id: M.IMPORT, label: 'Add files…' },
    );
    if (path) {
      items.push('-',
        { id: M.RENAME, label: 'Rename\tF2' },
        { id: M.TRASH, label: 'Move to Recycle Bin\tDel' },
        { id: M.COPY_PATH, label: 'Copy path' },
        { id: M.RESTORE, label: 'Restore from backup…' });
    } else {
      items.push('-', { id: M.FOLDER, label: 'Open study folder in Explorer' });
    }

    const chosen = await nativeMenu(items, point);
    switch (chosen) {
      case M.OPEN: router.go(path); break;
      case M.NEW_TAB: tabs.open(path, { activate: true }); break;
      case M.EDIT: editPath(path); break;
      case M.OPEN_APP: call('open', path).catch(failed('Could not open it')); break;
      case M.REVEAL: call('reveal', path).catch(failed('Could not show it')); break;
      case M.DONE: study.toggleDone(path); break;
      case M.TAGS: study.openTagPicker(path, rowEl || shell.treeBody); break;
      case M.REMIND: study.addReminder(path); break;
      case M.CLAUDE: claude(path); break;
      case M.SIDE: split.openNote(path); break;
      case M.REVIEW: router.go(':review', { anchor: encodeURIComponent(path) }); break;
      case M.CARDS: claude(path, { task: 'cards' }); break;
      case M.NEW_NOTE: newNote(folder); break;
      case M.NEW_FOLDER: newFolder(folder); break;
      case M.IMPORT: importFiles(folder); break;
      case M.RENAME: rename(path); break;
      case M.TRASH: trash(path); break;
      case M.RESTORE: restore(path); break;
      case M.FOLDER: call('folder'); break;
      case M.COPY_PATH:
        navigator.clipboard.writeText(`${info.notesDir}\\${path.replace(/\//g, '\\')}`).catch(() => {});
        break;
      default: break;
    }
  }

  shell.treeBody.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const row = e.target.closest('.tree__row');
    const id = row ? Number(row.dataset.id) : 0;
    const path = id > 0 ? store.pathOf(id) : '';
    if (id > 0) { tree.cursor = id; tree.paint(); }
    // A mouse click opens the menu at the pointer; the menu key opens it
    // under the row it belongs to.
    let point = null;
    if (e.button !== 2 && row) { const r = row.getBoundingClientRect(); point = { x: r.left + 24, y: r.bottom }; }
    menuFor(path, point, row);
  });

  // A "+" in the tree's header: everything you can add, at the current folder.
  const add = document.createElement('button');
  add.className = 'icon-btn';
  add.title = 'New note, folder or files';
  add.setAttribute('aria-label', 'New note, folder or files');
  add.innerHTML = icon('plus');
  add.onclick = async () => {
    const r = add.getBoundingClientRect();
    const folder = await currentFolder();
    const chosen = await nativeMenu([
      { id: M.NEW_NOTE, label: 'New note\tCtrl+N' },
      { id: M.NEW_FOLDER, label: 'New folder' },
      { id: M.IMPORT, label: 'Add files…' },
      '-',
      { id: M.FOLDER, label: 'Open study folder in Explorer' },
    ], { x: r.left, y: r.bottom });
    if (chosen === M.NEW_NOTE) newNote(folder);
    else if (chosen === M.NEW_FOLDER) newFolder(folder);
    else if (chosen === M.IMPORT) importFiles(folder);
    else if (chosen === M.FOLDER) call('folder');
  };
  shell.treeTools.appendChild(add);

  // ── keys ────────────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.target.closest?.('.cm-editor');
    if (document.querySelector('.dialog-scrim')) return;
    if (ctrl && !e.shiftKey && key === 'n') { e.preventDefault(); newNote(); return; }
    if (ctrl && e.shiftKey && key === 'l') {
      e.preventDefault();
      const path = router.current.path;
      claude(path && !path.startsWith(':') ? path : '');
      return;
    }
    if (ctrl && key === 'e' && !editor.active) {
      const path = router.current.path;
      if (path && fileKind(path) === 'note') { e.preventDefault(); editPath(path); }
      return;
    }
    if (typing) return;
    const inTree = shell.treeBody.contains(e.target);
    const target = inTree && tree.cursor > 0 ? store.pathOf(tree.cursor) : router.current.path;
    if (e.key === 'F2' && target && !target.startsWith(':')) { e.preventDefault(); rename(target); }
    if (e.key === 'Delete' && inTree && target) { e.preventDefault(); trash(target); }
    if (e.key === 'F5') { e.preventDefault(); scheduleRefresh(10); }
    if (e.key === 'F12' || (ctrl && e.shiftKey && key === 'i')) call('devtools');
  });

  // ── title bar ───────────────────────────────────────────────────────
  function syncChrome() {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const style = getComputedStyle(bar);
    const rgb = (c) => (c.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map((n) => Math.round(Number(n)));
    call('chrome', prefs.resolvedTheme() === 'dark' ? 1 : 0, ...rgb(style.backgroundColor), ...rgb(style.color)).catch(() => {});
  }
  prefs.onChange(() => requestAnimationFrame(syncChrome));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(syncChrome));
  requestAnimationFrame(syncChrome);

  function syncTitle() {
    const path = router.current.path;
    let title = 'PaperNotes';
    if (path === ':settings') title = 'Settings – PaperNotes';
    else if (path) {
      const id = store.lookup(path);
      if (id > 0) title = `${store.titleOf(id)} – PaperNotes`;
    }
    document.title = title;
  }
  router.onChange(syncTitle);
  syncTitle();

  return {
    /** Before any navigation: an open editor saves and steps aside. */
    async beforeShow(route) {
      if (!editor.active) return true;
      if (route.path === editor.path) return false;   // already showing it
      const ok = await editor.save();
      if (!ok) return false;
      editor.abandon();
      if (pendingRefresh) { pendingRefresh = false; scheduleRefresh(50); }
      return true;
    },
    claude,
    editPath,
    /** Everything that isn't on disk yet, written now (before an update). */
    async saveAll() {
      if (editor.active) await editor.save();
      await state.flush();
      prefs.set('tabs', tabs.serialize());
    },
    editProfile: async () => {
      const p = await loadProfile(store);
      const ok = await editProfile({ profile: p, toasts, write: (rel, text) => call('write', rel, text) });
      if (ok) scheduleRefresh(50);
      return ok;
    },
    commands: () => [
      { id: 'new-note', label: 'New note', hint: 'Ctrl+N', run: () => newNote() },
      { id: 'edit', label: 'Edit this note', hint: 'Ctrl+E', run: () => { const p = router.current.path; if (fileKind(p) === 'note') editPath(p); } },
      { id: 'claude', label: 'Study with Claude', hint: 'Ctrl+Shift+L', run: () => claude(router.current.path.startsWith(':') ? '' : router.current.path) },
      { id: 'reread', label: 'Re-read the study folder', hint: 'F5', run: () => scheduleRefresh(10) },
      { id: 'folder', label: 'Open the study folder in Explorer', run: () => call('folder') },
      { id: 'backup', label: 'Back up now', run: () => call('backupNow').then((r) => toasts.show({ text: `Backed up ${r.files} files.` })) },
    ],
    editor,
  };
}
