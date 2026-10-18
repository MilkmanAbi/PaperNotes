import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import 'katex/dist/katex.min.css';
import './styles/content.css';
import './styles/study.css';
import './styles/workspace.css';
import './styles/extras.css';
import './styles/palettes.css';   // last: themes override every token above

import { TreeStore } from './core/manifest.js';
import { Prefs } from './core/prefs.js';
import { Router } from './core/router.js';
import { Search } from './core/search.js';
import { StudyState } from './core/state.js';
import { TreeView } from './ui/tree.js';
import { Reader } from './ui/reader.js';
import { Toc } from './ui/toc.js';
import { Palette } from './ui/palette.js';
import { Tabs } from './ui/tabs.js';
import { StatusBar, Toasts } from './ui/feedback.js';
import { icon } from './ui/icons.js';
import { humanCount, decodeHashPath } from './core/paths.js';
import { useLocalDb } from './core/db.js';
import { isDesktop, call } from './desktop/bridge.js';
import { initStudy } from './ui/study.js';
import { Toolkit } from './ui/toolkit.js';
import { SplitView } from './ui/split.js';
import { loadProfile, weekInfo, showTimetable, infoMarkdown, INFO } from './ui/profile.js';
import { attachSelectionBar } from './ui/selection.js';
import { Pomodoro, startTimeTracking } from './ui/focus.js';
import { attachContextMenu } from './ui/contextmenu.js';
import { Avatar, mountProfileChip, showProfilePage } from './ui/me.js';
import { mountQuotes } from './ui/quotes.js';
import { PALETTES } from './core/palettes.js';

// Whether this browser profile already had settings (else the library's copy is used).
const hadPrefs = (() => { try { return Boolean(localStorage.getItem('paper-notes/prefs/v1')); } catch { return false; } })();
const prefs = new Prefs();
prefs.apply();   // before first paint: the OS preference is already known

const app = document.getElementById('app');
const toasts = new Toasts();

/** App pages that are not files. They start with ':' so they can never
 *  collide with a real path (Windows forbids ':' in names). */
export const PAGES = { settings: ':settings', timetable: ':timetable', review: ':review', profile: ':profile', music: ':music', relax: ':relax' };
const PAGE_TITLES = { ':settings': 'Settings', ':timetable': 'Timetable', ':review': 'Flashcards', ':profile': 'Profile', ':music': 'Music', ':relax': 'Relax' };

boot().catch((err) => fatal(err));

async function boot() {
  if (isDesktop) document.documentElement.dataset.app = 'desktop';

  // ── the study folder (desktop) ─────────────────────────────────────
  // No folder chosen yet: the first-run screen asks for one, and the app
  // starts properly once it has an answer.
  let hostInfo = null;
  if (isDesktop) {
    hostInfo = await call('info');
    if (!hostInfo.notesDir) {
      const { runOnboarding } = await import('./desktop/onboarding.js');
      await runOnboarding(app, hostInfo);
      return;   // the host reloads the page once a folder is chosen
    }
    await mirrorPrefs();
  }

  const shell = buildShell();
  const status = new StatusBar({ mount: shell.statusMount });
  status.set({ id: 'index', text: 'Reading the index…', tone: 'busy' });

  // The desktop app has no build step: it indexes the study folder itself,
  // then everything below reads that index exactly as it would the site's.
  let desktopIndex = null;
  if (isDesktop) {
    status.set({ id: 'index', text: 'Reading your notes…', tone: 'busy' });
    try {
      const { indexNotesFolder } = await import('./desktop/indexer.js');
      desktopIndex = await indexNotesFolder({
        onProgress: (done, total) => status.set({ id: 'index', tone: 'busy', text: `Reading your notes… ${done} of ${total}` }),
      });
      useLocalDb(desktopIndex.files);
    } catch (err) {
      status.remove('index');
      fatal(err);
      return;
    }
  }

  let store;
  try {
    store = await TreeStore.load();
  } catch (err) {
    status.remove('index');
    fatal(err);
    return;
  }

  // ── what PaperNotes remembers about the notes ──────────────────────
  const state = new StudyState(isDesktop ? desktopStateBackend() : webStateBackend());
  await state.load();

  // ── you: info.md and the timetable ─────────────────────────────────
  let profile = await loadProfile(store);
  const ctxRef = { get profile() { return profile; } };

  const router = new Router({ ownHistory: true });
  const search = new Search(store);
  search.loadStats();

  function setTotals() {
    const totals = store.totals || {};
    status.set({
      id: 'index',
      text: `${humanCount(totals.notes ?? 0)} notes · ${totals.files ? `${humanCount(totals.files)} files · ` : ''}${humanCount(totals.folders ?? 0)} folders`,
    });
  }
  setTotals();
  let desktop = null;

  // ── views ──────────────────────────────────────────────────────────
  const toc = new Toc({ mount: shell.tocBody, router });

  const reader = new Reader({
    mount: shell.readerMount,
    store,
    router,
    onNavigate: (what, value) => {
      if (what === 'search') {
        shell.searchInput.value = value;
        runSearch(value);
        shell.searchInput.focus();
      }
    },
    onReveal: (headings, scope) => toc.set(headings, scope?.querySelector('.note-content')),
  });

  const tree = new TreeView({
    mount: shell.treeBody,
    store,
    onOpen: (id, e) => openPath(store.pathOf(id), e),
    onExpandedChange: () => {},
    onError: (err, id) => {
      toasts.show({
        tone: 'error',
        text: `Could not load the contents of ${store.nameOf(id)}. Everything else still works.`,
        action: { label: 'Try again', run: () => tree.toggle(id) },
      });
    },
  });
  tree.measure();
  tree.rebuild();

  /** Open a path here, or in a new tab with Ctrl / the middle button. */
  function openPath(path, e) {
    if (e && e.altKey) { split.openNote(path); return; }
    if (e && (e.ctrlKey || e.metaKey || e.button === 1)) {
      tabs.open(path, { activate: Boolean(e.shiftKey) });
      return;
    }
    router.go(path);
  }

  // ── search ─────────────────────────────────────────────────────────
  let activeQuery = '';

  function describeCoverage() {
    const c = search.coverage();
    if (c.complete) return null;
    return {
      id: 'coverage',
      tone: 'busy',
      text: `searching ${humanCount(c.loaded)} of ${humanCount(c.total)} — loading the rest`,
      title: 'Large trees are delivered in parts. Results fill in as the remaining parts arrive.',
    };
  }

  function runSearch(raw) {
    const query = raw.trim();
    activeQuery = query;
    shell.clearBtn.hidden = !query;

    if (!query) {
      tree.setResults(null);
      reader.setHighlightTerms([]);
      status.remove('search');
      status.remove('coverage');
      const current = router.current.path;
      if (current && !current.startsWith(':')) syncTreeTo(current);
      return;
    }

    // Local filtering is immediate, every keystroke, no debounce (Patterns §1).
    const outcome = search.run(query);
    tree.setResults(outcome.results);
    reader.setHighlightTerms(search.highlightTerms(query));

    const tierNote = outcome.tier === 'names+text' ? 'names and text' : 'names';
    status.set({
      id: 'search',
      text: outcome.truncated
        ? `${humanCount(outcome.total)} matches, showing the first ${outcome.results.length}`
        : `${humanCount(outcome.total)} ${outcome.total === 1 ? 'match' : 'matches'} · ${tierNote}`,
      tone: outcome.total ? 'ok' : 'warn',
    });

    const coverage = describeCoverage();
    if (coverage) status.set(coverage); else status.remove('coverage');
    ensureDeepSearch();
  }

  /** Show a fixed list of paths in the tree, the way a search does
   *  (used by the tag and progress filters in the toolkit). */
  async function showList(paths, label) {
    const results = [];
    for (const p of paths) {
      const id = await store.resolvePath(p);
      if (id > 0) results.push({ id, via: 'list' });
    }
    activeQuery = '';
    shell.searchInput.value = '';
    shell.clearBtn.hidden = false;
    tree.setResults(results);
    status.set({ id: 'search', text: `${label}: ${results.length} ${results.length === 1 ? 'item' : 'items'}`, tone: results.length ? 'ok' : 'warn' });
  }

  let deepStarted = false;
  function ensureDeepSearch() {
    if (deepStarted) return;
    deepStarted = true;

    if (search.fulltextState === 'idle') {
      status.set({ id: 'fulltext', tone: 'busy', right: true, text: 'loading full text index…' });
      search.ensureFulltext().then(() => {
        if (search.fulltextState === 'ready') {
          status.remove('fulltext');
          if (activeQuery) runSearch(activeQuery);
        } else if (search.fulltextState === 'absent') {
          status.set({ id: 'fulltext', right: true, text: 'names only — no full text index built', dot: false });
        } else if (search.fulltextState === 'failed') {
          status.set({ id: 'fulltext', right: true, tone: 'warn', text: 'full text unavailable' });
        }
      });
    }

    if (store.shard.size) {
      store.loadAll({
        onProgress: () => {
          const coverage = describeCoverage();
          if (coverage) status.set(coverage);
        },
      }).then(() => {
        status.remove('coverage');
        if (activeQuery) runSearch(activeQuery);
        else tree.rebuild();
      });
    }
  }

  shell.searchInput.addEventListener('input', (e) => runSearch(e.target.value));
  shell.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (shell.searchInput.value) { shell.searchInput.value = ''; runSearch(''); }
      else shell.searchInput.blur();
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); tree.focus(); }
  });
  shell.clearBtn.addEventListener('click', () => {
    shell.searchInput.value = '';
    runSearch('');
    shell.searchInput.focus();
  });

  // ── routing ────────────────────────────────────────────────────────
  async function syncTreeTo(path) {
    const id = await store.resolvePath(path);
    if (id > 0) await tree.reveal(id);
    return id;
  }

  let study = null;
  let music = null;
  const avatar = new Avatar();
  avatar.load();
  let chip = null;
  let profilePage = null;
  let updater = null;
  /** Edit info.md (the desktop app writes it; the site can't). */
  async function editMe() {
    if (!desktop?.editProfile) { toasts.show({ text: 'Your details live in info.md at the top of your library.' }); return; }
    if (await desktop.editProfile()) {
      profile = await loadProfile(store);
      syncTopbar();
      if (router.current.path === PAGES.profile || !router.current.path) show(router.current);
    }
  }

  async function show(route) {
    if (desktop && !(await desktop.beforeShow(route))) return;
    const { path, anchor } = route;
    tabs.noteRoute(route);
    syncNav();
    document.documentElement.dataset.page = path === PAGES.settings ? 'settings' : path === PAGES.relax ? 'relax' : !path ? 'home'
      : path.startsWith(':') ? 'page' : 'note';

    if (path === PAGES.timetable) {
      showTimetable({ reader, profile, store });
      tree.setSelected(-1);
      status.remove('path');
      return;
    }
    if (path === PAGES.review) {
      const { showReview } = await import('./ui/review.js');
      showReview({ reader, state, store, scope: anchor ? decodeURIComponent(anchor) : '' });
      tree.setSelected(-1);
      status.remove('path');
      return;
    }

    if (path === PAGES.relax) {
      const { showRelax } = await import('./ui/relax.js');
      showRelax({ reader, toasts, onMusic: music ? () => router.go(PAGES.music) : null });
      tree.setSelected(-1);
      status.remove('path');
      return;
    }
    if (path === PAGES.profile) {
      profilePage = showProfilePage({ reader, state, store, avatar, router, toasts, getProfile: () => profile, onEdit: editMe,
        save: isDesktop ? async (fields, context) => {
          await call('write', INFO, infoMarkdown({ ...fields, timetable: profile.timetableCsv || '' }, context, profile.extra));
          profile = await loadProfile(store);
          syncTopbar();
        } : null });
      tree.setSelected(-1);
      status.remove('path');
      return;
    }
    if (path === PAGES.music) {
      if (!music) { router.go(''); return; }
      const { showMusic } = await import('./desktop/musicpage.js');
      showMusic({ reader, music, toasts });
      tree.setSelected(-1);
      status.remove('path');
      return;
    }

    if (path === PAGES.settings) {
      const { showSettings } = await import('./ui/settings.js');
      await showSettings({ reader, prefs, state, store, router, toasts, hostInfo, anchor, study, profile: ctxRef, music, updater,
        reloadProfile: async () => { profile = await loadProfile(store); syncTopbar(); } });
      tree.setSelected(-1);
      status.remove('path');
      return;
    }

    if (!path) {
      const { showHome } = await import('./ui/home.js');
      showHome({ reader, store, state, router, prefs, openPath, hostInfo, study, profile });
      tree.setSelected(-1);
      status.remove('path');
      return;
    }

    status.set({ id: 'path', right: true, dot: false, text: path });

    const id = await store.resolvePath(path);
    if (id < 0) {
      reader.showMissing(path, { reason: 'not-indexed' });
      return;
    }
    if (store.kind[id] === 0) {
      if (store.isDeferred(id)) {
        try { await store.ensureChildren(id); } catch { /* reported below */ }
      }
      reader.showFolder(id);
      if (!activeQuery) await tree.reveal(id); else tree.setSelected(id);
      return;
    }
    await reader.open(path, { anchor, nodeId: id });
    state.touch(path);
    if (!activeQuery && !tree.results) await tree.reveal(id);
    else tree.setSelected(id);
  }

  router.onChange((route) => { show(route); });

  // Internal links anywhere (notes, home, toolkit) go through the router,
  // so every tab keeps its own history, and Ctrl/middle-click opens a tab.
  const onLink = (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || a.target === '_blank' || a.dataset.inNote === 'true') return;
    if (e.type === 'auxclick' && e.button !== 1) return;
    e.preventDefault();
    const raw = a.getAttribute('href');
    const path = decodeHashPath(raw);
    const rest = raw.replace(/^#\/?/, '');
    const anchor = rest.includes('#') ? rest.slice(rest.indexOf('#') + 1) : '';
    if (e.ctrlKey || e.metaKey || e.button === 1) tabs.open(path, { activate: e.shiftKey });
    else router.go(path, { anchor });
  };
  document.addEventListener('click', onLink);
  document.addEventListener('auxclick', onLink);

  // ── tabs ───────────────────────────────────────────────────────────
  const tabs = new Tabs({
    mount: shell.tabMount,
    titleOf: (path) => {
      if (!path) return 'Home';
      if (PAGE_TITLES[path]) return PAGE_TITLES[path];
      const id = store.lookup(path);
      if (id > 0) return store.titleOf(id);
      const name = path.split('/').pop();
      return name.replace(/\.(md|markdown|mdx)$/i, '').replace(/^\d{1,4}[-_. ]+/, '') || name;
    },
    capture: (tab) => {
      tab.expanded = tree.expandedPaths();
      tab.treeScroll = tree.scroller.scrollTop;
      tab.readerScroll = reader.wrap.scrollTop;
      tab.query = shell.searchInput.value;
    },
    restore: async (tab, { routeOnly = false } = {}) => {
      if (!routeOnly) {
        tree.expanded.clear();
        for (const p of tab.expanded || []) {
          const id = await store.resolvePath(p).catch(() => -1);
          if (id > 0 && store.kind[id] === 0) tree.expanded.add(id);
        }
        shell.searchInput.value = tab.query || '';
        if (tab.query) runSearch(tab.query);
        else { activeQuery = ''; shell.clearBtn.hidden = true; tree.setResults(null); status.remove('search'); }
        tree.rebuild();
      }
      router.go(tab.path, { anchor: tab.anchor, replace: true, force: true });
      await new Promise((r) => setTimeout(r, 30));
      await settled();
      if (!routeOnly) tree.scroller.scrollTop = tab.treeScroll || 0;
      tree.paint();
      if (!tab.anchor) reader.wrap.scrollTop = tab.readerScroll || 0;
    },
    onChange: () => { syncNav(); saveTabs(); },
  });

  // The reader renders asynchronously; restore waits for it to settle.
  async function settled() {
    for (let i = 0; i < 40 && reader._busy; i++) await new Promise((r) => setTimeout(r, 25));
  }

  let saveTimer = null;
  function saveTabs() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (prefs.get('restoreTabs')) prefs.set('tabs', tabs.serialize());
    }, 500);
  }
  window.addEventListener('beforeunload', () => {
    if (prefs.get('restoreTabs')) prefs.set('tabs', tabs.serialize());
    state.flush();
  });

  function syncNav() {
    shell.backBtn.disabled = !tabs.canBack();
    shell.fwdBtn.disabled = !tabs.canForward();
  }
  shell.backBtn.onclick = () => tabs.back();
  shell.fwdBtn.onclick = () => tabs.forward();
  // The mouse's own back/forward buttons.
  window.addEventListener('mouseup', (e) => {
    if (e.button === 3) { e.preventDefault(); tabs.back(); }
    if (e.button === 4) { e.preventDefault(); tabs.forward(); }
  });

  // ── the study layer: done, tags, reminders, confused marks, stickies ─
  study = initStudy({ state, store, tree, reader, router, toasts, prefs, openPath, hostInfo });

  const toolkit = new Toolkit({
    mount: shell.toolkitBody, tabsMount: shell.toolkitTabs,
    state, store, router, prefs, toasts, study, showList,
    clearList: () => { shell.searchInput.value = ''; runSearch(''); },
  });
  void toolkit;

  // ── side by side, terminals, selection bar, study time ─────────────
  let terminals = null;
  if (isDesktop) {
    const { Terminals } = await import('./desktop/terminal.js');
    terminals = new Terminals({ shell, prefs, toasts });
    shell.termBtn.hidden = false;
    shell.termBtn.onclick = () => terminals.toggle();
  }
  const split = new SplitView({ shell, store, prefs, router, terminals });
  if (terminals) terminals.onToSide = (s) => split.openTerminal(s);
  // Dev builds expose the parts for desktop/test/cdp.mjs.
  if (hostInfo?.dev) window.__pn = { terminals, split, state, store, reader, router, tabs: () => tabs, get music() { return music; }, get pomodoro() { return pomodoro; }, get updater() { return updater; }, avatar, prefs };
  attachSelectionBar({
    reader, state, study, toasts,
    onAsk: isDesktop ? (path, opts) => desktop?.claude(path, opts) : null,
  });
  startTimeTracking({ state, router });
  const focusMount = document.createElement('div');
  focusMount.className = 'status-extra';
  shell.statusMount.appendChild(focusMount);
  const pomodoro = new Pomodoro({ mount: focusMount, state, prefs, toasts, notify: (t, x) => { if (isDesktop) call('notify', t, x).catch(() => {}); } });

  // Music (desktop): the mini player sits in the status bar; the library is
  // read a little after start-up so the last song is ready to resume.
  if (isDesktop) {
    const { Music } = await import('./desktop/music.js');
    music = new Music({ toasts, prefs });
    const miniMount = document.createElement('div');
    miniMount.className = 'status-extra';
    shell.statusMount.appendChild(miniMount);
    music.mountMini(miniMount, { openPage: () => router.go(PAGES.music) });
    setTimeout(() => music.scan(), 2500);
  }

  // You, at the bottom left; T^T at the top.
  chip = mountProfileChip({ mount: shell.meMount, avatar, router, toasts, getProfile: () => profile, onEdit: editMe });
  mountQuotes(shell.ttMount);

  /** The week chip, the Timetable button, the flashcards badge. */
  function syncTopbar() {
    const w = weekInfo(profile);
    chip?.paint();
    shell.weekChip.hidden = !w?.text;
    if (w?.text) {
      shell.weekChip.textContent = w.text;
      shell.weekChip.dataset.kind = w.kind;
      shell.weekChip.title = `${profile.fields.semester ? `Semester ${profile.fields.semester}, ` : ''}${w.title}`;
    }
    shell.ttBtn.hidden = !(profile.timetableImage || profile.timetable.length);
    const due = state.dueCards().length;
    shell.reviewBtn.hidden = !state.cards.length;
    shell.reviewCount.textContent = due ? String(due > 99 ? '99+' : due) : '';
    shell.reviewBtn.title = due ? `Review ${due} flashcard${due === 1 ? '' : 's'}` : 'Flashcards: nothing due';
  }
  shell.ttBtn.onclick = () => tabs.open(PAGES.timetable, { activate: true });
  shell.reviewBtn.onclick = () => router.go(PAGES.review);
  shell.relaxBtn.onclick = () => router.go(PAGES.relax);
  state.onChange((ev) => { if (ev.type === 'cards' || ev.type === 'load') syncTopbar(); });
  store.onChange((ev) => { if (ev.type === 'reload') loadProfile(store).then((p) => { profile = p; syncTopbar(); }); });
  window.addEventListener('papernotes:profile-changed', async () => {
    profile = await loadProfile(store);
    syncTopbar();
    if (router.current.path === PAGES.profile) profilePage?.render();
  });
  setInterval(syncTopbar, 60000);
  syncTopbar();

  if (isDesktop) {
    const { initDesktop } = await import('./desktop/app.js');
    desktop = initDesktop({
      store, search, tree, reader, router, toasts, prefs, shell, show, setTotals, state, tabs, study, hostInfo, terminals, split, profile: ctxRef,
      signature: desktopIndex.signature,
      rerunSearch: () => { if (activeQuery) runSearch(activeQuery); },
    });
  }
  window.addEventListener('papernotes:profile', () => editMe());

  // Updates from GitHub releases, one click (desktop).
  if (isDesktop) {
    const { Updater } = await import('./desktop/updater.js');
    updater = new Updater({
      current: hostInfo.version, toasts, prefs, button: shell.updateBtn,
      beforeUpdate: async () => { await desktop?.saveAll?.(); prefs.save(); },
    });
  }

  // Right-click in a note.
  attachContextMenu({
    reader, state, study, store, router, toasts, split,
    runSearch: (q) => { shell.searchInput.value = q; runSearch(q); shell.searchInput.focus(); },
    claude: isDesktop ? (path, opts) => desktop?.claude(path, opts) : null,
    edit: isDesktop ? (path) => desktop?.editPath?.(path) : null,
  });

  // First tab: the saved session, or a fresh home view.
  const restored = prefs.get('restoreTabs') && tabs.load(prefs.get('tabs'));
  if (!restored) {
    const first = tabs.open(router.current.path || '', { activate: false });
    tabs.activeId = first.id;
    tabs.render();
    first.fresh = false;
    await show(router.current);
  }

  // ── commands, shortcuts, chrome wiring ─────────────────────────────
  const openSettings = (section = '') => router.go(PAGES.settings, { anchor: section });

  const palette = new Palette({
    search,
    store,
    onOpenNote: (id) => router.go(store.pathOf(id)),
    commands: () => [
      { id: 'home', label: 'Go home', hint: 'Alt+Home', run: () => router.go('') },
      { id: 'settings', label: 'Settings', hint: 'Ctrl+,', run: () => openSettings() },
      { id: 'newtab', label: 'New tab', hint: 'Ctrl+T', run: () => tabs.open('') },
      { id: 'closetab', label: 'Close tab', hint: 'Ctrl+W', run: () => tabs.close() },
      { id: 'focus', label: 'Show or hide both side panels', hint: 'Ctrl+\\', run: () => toggleFocus() },
      { id: 'tree', label: 'Show or hide the notes panel', hint: 'Ctrl+B', run: () => togglePanel('tree') },
      { id: 'toc', label: 'Show or hide the outline', hint: 'Ctrl+Alt+B', run: () => togglePanel('toc') },
      { id: 'toolkit', label: 'Show or hide the toolkit', hint: '', run: () => toggleToolkit() },
      { id: 'collapse', label: 'Collapse every folder', hint: '', run: () => tree.collapseAll() },
      { id: 'done', label: 'Mark this as done / not done', hint: 'Ctrl+D', run: () => study.toggleDone() },
      { id: 'remind', label: 'Add a reminder', hint: 'Ctrl+R', run: () => study.addReminder() },
      { id: 'sticky', label: 'Add a sticky note', hint: 'Ctrl+Shift+S', run: () => study.addSticky() },
      { id: 'review', label: 'Review flashcards', hint: '', run: () => router.go(PAGES.review) },
      { id: 'timetable', label: 'Timetable', hint: '', run: () => tabs.open(PAGES.timetable) },
      { id: 'split-note', label: 'Open this note to the side', hint: 'Alt+Click', run: () => { const p = router.current.path; if (p && !p.startsWith(':')) split.openNote(p); } },
      { id: 'split-close', label: 'Close the side pane', hint: '', run: () => split.close() },
      ...(terminals ? [
        { id: 'term', label: 'Terminal: show or hide', hint: 'Ctrl+`', run: () => terminals.toggle() },
        { id: 'term-new', label: 'Terminal: new PowerShell', hint: '', run: () => terminals.open('shell') },
        { id: 'term-side', label: 'Terminal: open one to the side', hint: '', run: async () => split.openTerminal(await terminals.open('shell')) },
        { id: 'claude-term', label: 'Claude Code: open in the terminal', hint: '', run: () => terminals.open('claude') },
      ] : []),
      { id: 'width-fill', label: 'Reading width: fill the window', run: () => prefs.set('readingWidth', 'fill') },
      { id: 'width-wide', label: 'Reading width: wide', run: () => prefs.set('readingWidth', 'wide') },
      { id: 'width-comfortable', label: 'Reading width: comfortable', run: () => prefs.set('readingWidth', 'comfortable') },
      { id: 'theme-system', label: 'Light or dark: follow the system', run: () => prefs.set('theme', 'system') },
      { id: 'theme-light', label: 'Light or dark: light', run: () => prefs.set('theme', 'light') },
      { id: 'theme-dark', label: 'Light or dark: dark', run: () => prefs.set('theme', 'dark') },
      ...PALETTES.map((p) => ({ id: `palette-${p.id}`, label: `Theme: ${p.name}`, hint: prefs.get('palette') === p.id ? 'current' : '', run: () => prefs.set('palette', p.id) })),
      { id: 'profile', label: 'My profile', hint: '', run: () => router.go(PAGES.profile) },
      { id: 'relax', label: 'Relax mode', hint: '', run: () => router.go(PAGES.relax) },
      { id: 'avatar', label: 'Change my profile picture', hint: '', run: () => avatar.change(toasts) },
      { id: 'pomo', label: 'Pomodoro: start, pause or resume', hint: '', run: () => pomodoro.toggle() },
      { id: 'pomo-skip', label: 'Pomodoro: skip to the next block', hint: '', run: () => pomodoro.next(false) },
      { id: 'pomo-reset', label: 'Pomodoro: reset', hint: '', run: () => pomodoro.reset() },
      { id: 'pomo-open', label: 'Pomodoro: open the timer', hint: '', run: () => pomodoro.openPanel() },
      ...(music ? [
        { id: 'music', label: 'Music', hint: '', run: () => router.go(PAGES.music) },
        { id: 'music-play', label: 'Music: play or pause', hint: '', run: () => music.toggle() },
        { id: 'music-next', label: 'Music: next song', hint: '', run: () => music.next() },
        { id: 'music-prev', label: 'Music: previous song', hint: '', run: () => music.prev() },
        { id: 'music-shuffle', label: 'Music: shuffle on or off', hint: '', run: () => music.setShuffle(!music.shuffle) },
      ] : []),
      { id: 'tt', label: 'T^T', hint: '', run: () => shell.ttMount.querySelector('button')?.click() },
      ...(updater ? [{ id: 'update', label: 'Check for updates', hint: '', run: () => updater.check().then((u) => { if (u) updater.openPanel(); }) }] : []),
      ...(desktop?.commands?.() || []),
    ],
  });

  // ── panels ─────────────────────────────────────────────────────────
  // One button shows or hides both side panels at once. Each panel can
  // still be hidden on its own from its header; the button then brings
  // everything back.
  function applyPanels() {
    const treeOpen = prefs.get('treeOpen');
    const tocOpen = prefs.get('tocOpen');
    shell.treePanel.dataset.open = String(treeOpen);
    shell.tocPanel.dataset.open = String(tocOpen);
    shell.resizer.style.display = treeOpen ? '' : 'none';
    shell.focusBtn.setAttribute('aria-pressed', String(!treeOpen && !tocOpen));
    shell.focusBtn.title = treeOpen || tocOpen ? 'Hide the side panels (Ctrl+\\)' : 'Show the side panels (Ctrl+\\)';
    shell.toolkit.dataset.open = String(prefs.get('toolkitOpen'));
    requestAnimationFrame(() => { tree.measure(); tree.paint(); });
  }
  function togglePanel(which) {
    const key = which === 'tree' ? 'treeOpen' : 'tocOpen';
    prefs.set(key, !prefs.get(key));
    applyPanels();
  }
  function toggleFocus() {
    const anyOpen = prefs.get('treeOpen') || prefs.get('tocOpen');
    prefs.set('treeOpen', !anyOpen);
    prefs.set('tocOpen', !anyOpen);
    applyPanels();
  }
  function toggleToolkit() {
    prefs.set('toolkitOpen', !prefs.get('toolkitOpen'));
    applyPanels();
  }

  shell.focusBtn.onclick = toggleFocus;
  shell.treeHide.onclick = () => togglePanel('tree');
  shell.tocHide.onclick = () => togglePanel('toc');
  shell.toolkitToggle.onclick = toggleToolkit;
  shell.paletteBtn.onclick = () => palette.show();
  shell.settingsBtn.onclick = () => openSettings();
  shell.collapseBtn.onclick = () => tree.collapseAll();
  shell.homeBtn.onclick = () => router.go('');
  applyPanels();

  prefs.onChange((what) => {
    if (what === 'density') { tree.measure(); tree.rebuild(); }
    if (what === 'treeOpen' || what === 'tocOpen' || what === 'toolkitOpen') applyPanels();
  });

  // Panel resizes: drag freely, snap to the 8px grid on release (Patterns §4).
  setupResizer(shell.resizer, prefs, () => tree.paint());
  setupSplit(shell.split, shell.sidePanel, prefs, () => { tree.measure(); tree.paint(); });

  // The outline gives way first when the window gets narrow.
  const narrow = matchMedia('(max-width: 1100px)');
  const applyNarrow = () => { document.documentElement.dataset.narrow = String(narrow.matches); };
  narrow.addEventListener('change', applyNarrow);
  applyNarrow();

  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
      || e.target.closest?.('.cm-editor');
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (document.querySelector('.dialog-scrim')) return;
    if (ctrl && e.key === '`') { e.preventDefault(); terminals?.toggle(); return; }
    // A terminal gets every key (Ctrl+C, Ctrl+W, Ctrl+K…), like VS Code.
    if (e.target.closest?.('.xterm')) return;

    if (ctrl && key === 'k') { e.preventDefault(); palette.toggle(); return; }
    if (ctrl && key === ',') { e.preventDefault(); openSettings(); return; }
    if (ctrl && key === 't') { e.preventDefault(); tabs.open(''); return; }
    if (ctrl && key === 'w') { e.preventDefault(); tabs.close(); return; }
    if (ctrl && e.key === 'Tab') { e.preventDefault(); tabs.cycle(e.shiftKey ? -1 : 1); return; }
    if (ctrl && key === '\\') { e.preventDefault(); toggleFocus(); return; }
    if (ctrl && key === 'b' && !e.altKey) { e.preventDefault(); togglePanel('tree'); return; }
    if (ctrl && key === 'b' && e.altKey) { e.preventDefault(); togglePanel('toc'); return; }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); tabs.back(); return; }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); tabs.forward(); return; }
    if (e.altKey && e.key === 'Home') { e.preventDefault(); router.go(''); return; }
    if (ctrl && /^[1-9]$/.test(e.key)) {
      const t = e.key === '9' ? tabs.tabs[tabs.tabs.length - 1] : tabs.tabs[Number(e.key) - 1];
      if (t) { e.preventDefault(); tabs.activate(t.id); }
      return;
    }
    if (study.onKey(e, { typing, ctrl, key })) return;
    if (typing) return;

    if (e.key === '/') { e.preventDefault(); shell.searchInput.focus(); shell.searchInput.select(); return; }
    if (e.key === '[' || e.key === ']') {
      const order = store.noteOrder();
      const currentId = tree.selected;
      const i = order.indexOf(currentId);
      const next = e.key === '[' ? order[i - 1] : order[i + 1];
      if (next !== undefined) { e.preventDefault(); router.go(store.pathOf(next)); }
    }
  });

  document.body.dataset.ready = 'true';
}

/** Settings live in the browser profile and, as a copy, in the library
 *  (.papernotes/prefs.json): a reinstall or another PC picks them up. */
async function mirrorPrefs() {
  const file = '.papernotes/prefs.json';
  if (!hadPrefs) {
    const saved = await fetch(`content/${file}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (saved && typeof saved === 'object') {
      Object.assign(prefs.state, saved);
      prefs.save();
      prefs.apply();
    }
  }
  let timer = null;
  const write = () => call('write', file, JSON.stringify(prefs.state)).catch(() => {});
  prefs.onChange(() => { clearTimeout(timer); timer = setTimeout(write, 1500); });
  write();
}

// ── where the study state is kept ─────────────────────────────────────
function desktopStateBackend() {
  const file = '.papernotes/state.json';
  return {
    async load() {
      const res = await fetch(`content/${file.split('/').map(encodeURIComponent).join('/')}`, { cache: 'no-store' });
      if (!res.ok) return null;
      return res.json();
    },
    async save(text) { await call('write', file, text); },
  };
}

function webStateBackend() {
  const KEY = 'paper-notes/study/v1';
  return {
    async load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
    async save(text) { try { localStorage.setItem(KEY, text); } catch { /* full */ } },
  };
}

// ── shell construction ────────────────────────────────────────────────
function buildShell() {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <button class="brand" id="home-btn" title="Home (Alt+Home)">
          <img class="brand__logo" src="brand/logo-96.png" alt="" width="26" height="26">
          <span class="brand__name">PaperNotes</span>
        </button>
        <div class="topbar__nav">
          <button class="icon-btn" id="back-btn" title="Back (Alt+Left)" aria-label="Back">${icon('arrowLeft')}</button>
          <button class="icon-btn" id="fwd-btn" title="Forward (Alt+Right)" aria-label="Forward">${icon('arrowRight')}</button>
        </div>

        <div class="topbar__search">
          <div class="searchbar">
            ${icon('search')}
            <input id="q" type="text" placeholder="Search notes, PDFs and slides  /" aria-label="Search" spellcheck="false" autocomplete="off">
            <button class="clear" hidden aria-label="Clear">${icon('close')}</button>
          </div>
        </div>

        <div class="topbar__tools">
          <button class="btn btn--secondary update-btn" id="update-btn" hidden></button>
          <span class="tt-mount" id="tt-mount"></span>
          <span class="weekchip" id="week-chip" hidden></span>
          <button class="btn btn--secondary topbar__tt" id="tt-btn" hidden title="Timetable">${icon('table')}<span>Timetable</span></button>
          <button class="icon-btn" id="review-btn" hidden title="Review flashcards" aria-label="Review flashcards">${icon('book')}<span class="badge" id="review-count"></span></button>
          <button class="icon-btn" id="relax-btn" title="Relax mode" aria-label="Relax mode">${icon('relax')}</button>
          <button class="icon-btn" id="term-btn" hidden title="Terminal (Ctrl+\`)" aria-label="Terminal">${icon('terminal')}</button>
          <button class="icon-btn" id="palette-btn" title="Commands (Ctrl+K)" aria-label="Commands">${icon('command')}</button>
          <button class="icon-btn" id="focus-btn" aria-pressed="false" aria-label="Show or hide the side panels">${icon('sidebars')}</button>
          <button class="icon-btn" id="settings-btn" title="Settings (Ctrl+,)" aria-label="Settings">${icon('gear')}</button>
        </div>
      </header>

      <div class="main">
        <aside class="panel panel--side panel--tree" data-open="true">
          <section class="side__tree">
            <div class="panel__head">
              <span class="panel__title">Notes</span>
              <span class="panel__spacer"></span>
              <span class="panel__tools" id="tree-tools"></span>
              <button class="icon-btn" id="collapse-all" title="Collapse every folder" aria-label="Collapse every folder">${icon('collapse')}</button>
              <button class="icon-btn panel__hide" id="tree-hide" title="Hide this panel (Ctrl+B)" aria-label="Hide the notes panel">${icon('chevronLeft')}</button>
            </div>
            <div class="panel__body" id="tree-body"></div>
          </section>
          <div class="hsplit" id="hsplit" role="separator" aria-orientation="horizontal" aria-label="Resize the toolkit" tabindex="0"></div>
          <section class="side__toolkit" data-open="true">
            <div class="panel__head toolkit__head">
              <div class="toolkit__tabs" id="toolkit-tabs" role="tablist"></div>
              <span class="panel__spacer"></span>
              <button class="icon-btn toolkit__toggle" id="toolkit-toggle" title="Show or hide the toolkit" aria-label="Show or hide the toolkit">${icon('chevronDown')}</button>
            </div>
            <div class="toolkit__body scroll" id="toolkit-body"></div>
          </section>
          <div class="side__me" id="me-mount"></div>
        </aside>
        <div class="resizer" id="resizer" role="separator" aria-orientation="vertical" aria-label="Resize the notes panel" tabindex="0"></div>

        <div class="center">
          <div class="tab-host" id="tab-mount"></div>
          <div class="workspace" id="workspace">
            <main class="reader-host" id="reader-mount"></main>
            <div class="split-divider" id="split-divider" hidden role="separator" aria-orientation="vertical"></div>
            <section class="pane pane--side" id="side-pane" hidden>
              <header class="pane__head">
                <span class="pane__title"></span>
                <span class="panel__spacer"></span>
                <button class="icon-btn" data-act="swap" title="Swap with the main pane">${icon('refresh')}</button>
                <button class="icon-btn" data-act="main" title="Move to the main pane">${icon('arrowLeft')}</button>
                <button class="icon-btn" data-act="close" title="Close the side pane">${icon('close')}</button>
              </header>
              <div class="pane__body"></div>
            </section>
          </div>
          <div class="term-divider" id="term-divider" hidden></div>
          <section class="term-panel" id="term-panel" hidden>
            <header class="term-panel__head">
              <span class="term-panel__label">Terminal</span>
              <div class="term-panel__tabs"></div>
              <span class="panel__spacer"></span>
              <button class="icon-btn" data-act="new" title="New PowerShell">${icon('plus')}</button>
              <button class="icon-btn" data-act="pick" title="New terminal or Claude…">${icon('chevronDown')}</button>
              <button class="icon-btn" data-act="side" title="Move to the side pane">${icon('sidebars')}</button>
              <button class="icon-btn" data-act="kill" title="Kill the terminal">${icon('trash')}</button>
              <button class="icon-btn" data-act="max" title="Maximise the panel">${icon('chevronDown')}</button>
              <button class="icon-btn" data-act="hide" title="Hide the panel (Ctrl+\`)">${icon('close')}</button>
            </header>
            <div class="term-panel__body"></div>
          </section>
        </div>

        <aside class="panel panel--toc" data-open="true">
          <div class="panel__head">
            <span class="panel__title">Outline</span>
            <span class="panel__spacer"></span>
            <button class="icon-btn panel__hide" id="toc-hide" title="Hide the outline (Ctrl+Alt+B)" aria-label="Hide the outline">${icon('chevronRight')}</button>
          </div>
          <div class="panel__body" id="toc-body"></div>
        </aside>
      </div>

      <footer class="status-host" id="status-mount"></footer>
    </div>`;

  const $ = (s) => app.querySelector(s);
  return {
    searchInput: $('#q'),
    clearBtn: $('.searchbar .clear'),
    treeBody: $('#tree-body'),
    treeTools: $('#tree-tools'),
    tocBody: $('#toc-body'),
    readerMount: $('#reader-mount'),
    tabMount: $('#tab-mount'),
    statusMount: $('#status-mount'),
    sidePanel: $('.panel--side'),
    treePanel: $('.panel--tree'),
    tocPanel: $('.panel--toc'),
    toolkit: $('.side__toolkit'),
    toolkitBody: $('#toolkit-body'),
    toolkitTabs: $('#toolkit-tabs'),
    toolkitToggle: $('#toolkit-toggle'),
    split: $('#hsplit'),
    focusBtn: $('#focus-btn'),
    treeHide: $('#tree-hide'),
    tocHide: $('#toc-hide'),
    paletteBtn: $('#palette-btn'),
    settingsBtn: $('#settings-btn'),
    homeBtn: $('#home-btn'),
    backBtn: $('#back-btn'),
    fwdBtn: $('#fwd-btn'),
    collapseBtn: $('#collapse-all'),
    resizer: $('#resizer'),
    workspace: $('#workspace'),
    sidePane: $('#side-pane'),
    splitDivider: $('#split-divider'),
    termPanel: $('#term-panel'),
    termDivider: $('#term-divider'),
    weekChip: $('#week-chip'),
    ttBtn: $('#tt-btn'),
    reviewBtn: $('#review-btn'),
    reviewCount: $('#review-count'),
    termBtn: $('#term-btn'),
    meMount: $('#me-mount'),
    relaxBtn: $('#relax-btn'),
    updateBtn: $('#update-btn'),
    ttMount: $('#tt-mount'),
  };
}

function setupResizer(resizer, prefs, onResize) {
  let startX = 0;
  let startWidth = 0;
  let dragging = false;

  const onMove = (e) => {
    if (!dragging) return;
    const raw = startWidth + (e.clientX - startX);
    const clamped = Math.max(200, Math.min(640, raw));
    document.documentElement.style.setProperty('--tree-w', `${clamped}px`);
    onResize?.();
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    resizer.dataset.dragging = 'false';
    document.body.style.cursor = '';
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tree-w'));
    const snapped = Math.round(current / 8) * 8;   // released on the grid
    prefs.set('treeWidth', snapped);
    document.documentElement.style.setProperty('--tree-w', `${snapped}px`);
    onResize?.();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };

  resizer.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tree-w')) || 304;
    resizer.dataset.dragging = 'true';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  resizer.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 32 : 8;
    const current = prefs.get('treeWidth');
    if (e.key === 'ArrowLeft') { e.preventDefault(); prefs.set('treeWidth', Math.max(200, current - step)); onResize?.(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); prefs.set('treeWidth', Math.min(640, current + step)); onResize?.(); }
  });
}

/** The split between the tree (top) and the toolkit (bottom). */
function setupSplit(split, panel, prefs, onResize) {
  let startY = 0;
  let startH = 0;
  let dragging = false;
  const clamp = (h) => Math.max(120, Math.min(panel.clientHeight - 140, h));

  const onMove = (e) => {
    if (!dragging) return;
    const h = clamp(startH - (e.clientY - startY));
    document.documentElement.style.setProperty('--toolkit-h', `${h}px`);
    onResize?.();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    split.dataset.dragging = 'false';
    document.body.style.cursor = '';
    const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolkit-h'));
    prefs.set('toolkitHeight', Math.round(h / 8) * 8);
    onResize?.();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  split.addEventListener('pointerdown', (e) => {
    if (prefs.get('toolkitOpen') === false) return;
    dragging = true;
    startY = e.clientY;
    startH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolkit-h')) || 300;
    split.dataset.dragging = 'true';
    document.body.style.cursor = 'row-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  split.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 32 : 8;
    const h = prefs.get('toolkitHeight');
    if (e.key === 'ArrowUp') { e.preventDefault(); prefs.set('toolkitHeight', clamp(h + step)); onResize?.(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); prefs.set('toolkitHeight', clamp(h - step)); onResize?.(); }
  });
}

function fatal(err) {
  console.error(err);
  app.innerHTML = `
    <div class="shell">
      <div class="reader-wrap canvas-rule">
        <div class="reader">
          <div class="state state--error">
            <div class="state__art">${icon('alert', '')}</div>
            <h2>PaperNotes could not start.</h2>
            <p>Nothing was lost: your notes are ordinary files in your study folder.</p>
            <div class="state__detail mono">${String(err?.message || err)}</div>
            <div class="state__actions">
              <button class="btn btn--secondary" onclick="location.reload()">Reload</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}
