/** Preferences.
 *
 *  §15 of the spec in three rules: the OS decides first, the app supplies a
 *  default where the OS has no opinion, and the user can always override and
 *  have that override stick. Theme defaults to `system` — not to light, not
 *  to dark — so the first launch never asks the user to configure something
 *  they already set at the system level. */

import { applyFonts } from './fonts.js';
import { applyCustomTheme } from './custom-theme.js';

const KEY = 'paper-notes/prefs/v1';
const POPOUT = /[?&]window=[1-9]/.test(globalThis.location?.search || '');

const DEFAULTS = {
  theme: 'system',            // system | light | dark
  palette: 'paper',           // colour theme, see src/core/palettes.js
  density: 'compact',         // §13: Compact is the default, not an opt-in
  treeOpen: true,
  tocOpen: true,
  treeWidth: 304,             // 38 × 8px — whole units (§2.3)
  expanded: [],               // content paths, newest first
  lastPath: '',
  // The reading column. 'fill' uses the whole reader; the others cap the
  // line length for people who prefer a measure.
  readingWidth: 'fill',       // narrow | comfortable | wide | fill
  readerScale: 100,           // % size of note text
  readerFont: 'serif',        // serif | sans: the old switch; fontText supersedes it
  fontText: null,             // a font id from src/core/fonts.js (null: follow readerFont)
  fontHeading: 'same',        // 'same' as the text, or a font id
  fontCode: 'default',        // 'default' (the app's monospace), or a font id
  lineHeight: 'normal',       // compact | normal | relaxed
  customTheme: null,          // { base, accent, highlight } when palette is 'custom'
  focus: false,               // both side panels hidden at once
  toolkitOpen: true,
  toolkitHeight: 300,
  toolkitTab: 'tags',
  restoreTabs: true,
  editorLineNumbers: true,
  spellcheck: true,
  linkPreview: true,          // hover a link to another note: a preview card
};

const EXPANDED_CAP = 600;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, isFresh: true };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS, isFresh: true };
  }
}

export class Prefs {
  constructor() {
    this.state = read();
    // A docked panel is still a panel on a phone: it takes real width from
    // the reader. On a first visit to a narrow screen the reader is the more
    // useful default; after that it is the user's choice, remembered.
    if (this.state.isFresh) {
      delete this.state.isFresh;
      if (window.innerWidth < 760) this.state.treeOpen = false;
    }
    this._listeners = new Set();
    this._mq = window.matchMedia('(prefers-color-scheme: dark)');
    // Re-check on change rather than reading once at startup (PI §5.5).
    this._mq.addEventListener?.('change', () => {
      if (this.state.theme === 'system') this.apply();
      this._emit('theme');
    });
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(what) { for (const fn of this._listeners) fn(what, this.state); }

  get(key) { return this.state[key]; }

  set(key, value) {
    if (this.state[key] === value) return;
    this.state[key] = value;
    this.save();
    this.apply();
    this._emit(key);
  }

  save() {
    // A window popped out of the main one shares its settings but never
    // writes them: the main window owns them (see main.js, POPOUT).
    if (POPOUT) return;
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); }
    catch { /* a full or disabled store is not worth interrupting anyone over */ }
  }

  /** The theme actually in effect right now, resolving `system`. */
  resolvedTheme() {
    if (this.state.theme !== 'system') return this.state.theme;
    return this._mq.matches ? 'dark' : 'light';
  }

  apply() {
    const root = document.documentElement;
    if (this.state.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', this.state.theme);
    root.setAttribute('data-density', this.state.density);
    root.setAttribute('data-palette', this.state.palette || 'paper');
    applyCustomTheme(this.state, root);   // a custom theme sets its base palette itself
    root.setAttribute('data-reading', this.state.readingWidth);
    applyFonts(this.state, root);
    root.style.setProperty('--reader-scale', String((this.state.readerScale || 100) / 100));
    root.style.setProperty('--tree-w', `${this.state.treeWidth}px`);
    root.style.setProperty('--toolkit-h', `${this.state.toolkitHeight}px`);
  }

  // ── expanded folders ───────────────────────────────────────────────
  expandedSet() { return new Set(this.state.expanded); }

  setExpanded(paths) {
    // Capped so a session spent opening folders in a hundred-thousand-node
    // tree cannot grow local storage without bound.
    this.state.expanded = [...paths].slice(-EXPANDED_CAP);
    this.save();
  }
}
