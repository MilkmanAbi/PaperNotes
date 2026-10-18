/** Terminals, VS Code style: a panel under the reader (Ctrl+`), any number
 *  of sessions with a tab each, and any session can move into the side
 *  pane instead. Sessions are real Windows pseudo consoles run by the host
 *  (PowerShell, Command Prompt, or Claude Code), drawn by xterm.js.
 *
 *  Claude Code runs in here like anywhere else: its whole interface (the
 *  questions it asks, its diffs, its menus) renders in the panel, in the
 *  study folder, with PaperNotes' tools available if they're connected. */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import { call, onEvent, nativeMenu } from './bridge.js';
import { icon } from '../ui/icons.js';

const KINDS = {
  shell: { label: 'PowerShell', icon: 'terminal' },
  cmd: { label: 'Command Prompt', icon: 'terminal' },
  claude: { label: 'Claude Code', icon: 'sparkle' },
};

/** Theme colours come from the app's own tokens, resolved to rgb(). */
function themeFromCss() {
  const probe = document.createElement('span');
  document.body.appendChild(probe);
  const color = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color; };
  const dark = document.documentElement.dataset.theme === 'dark'
    || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  // The theme's own ANSI colours when it has them (every theme but Paper).
  const css = getComputedStyle(document.documentElement);
  const ansi = (name, fallback) => (css.getPropertyValue(`--term-${name}`).trim() ? color(`--term-${name}`) : fallback);
  const t = {
    background: color('--surface-sunken'),
    foreground: color('--ink-primary'),
    cursor: color('--accent'),
    cursorAccent: color('--surface-sunken'),
    selectionBackground: dark ? 'rgba(160, 190, 120, 0.35)' : 'rgba(90, 120, 50, 0.25)',
    black: dark ? '#3a3632' : '#2b2925', brightBlack: dark ? '#77706a' : '#6b655e',
    red: dark ? '#ff6b70' : '#c4372f', brightRed: dark ? '#ff8f92' : '#e5484d',
    green: dark ? '#9ccc65' : '#4f7a28', brightGreen: dark ? '#b5dd85' : '#5e9132',
    yellow: dark ? '#e6c35c' : '#a37a00', brightYellow: dark ? '#f0d684' : '#c49500',
    blue: dark ? '#7aa7ff' : '#2f63c9', brightBlue: dark ? '#9dbdff' : '#3f78e0',
    magenta: dark ? '#d29bf0' : '#8a45b8', brightMagenta: dark ? '#e1b8f6' : '#a35bd1',
    cyan: dark ? '#6cd0c8' : '#16807a', brightCyan: dark ? '#8fe0d9' : '#1b9a93',
    white: dark ? '#d9d4cc' : '#e9e5dd', brightWhite: dark ? '#f5f2ec' : '#ffffff',
  };
  for (const [k, n] of [['red', 'red'], ['green', 'green'], ['yellow', 'yellow'], ['blue', 'blue'], ['magenta', 'magenta'], ['cyan', 'cyan']]) {
    t[k] = ansi(n, t[k]);
    t[`bright${k[0].toUpperCase()}${k.slice(1)}`] = ansi(n, t[`bright${k[0].toUpperCase()}${k.slice(1)}`]);
  }
  t.white = color('--ink-secondary');
  t.brightWhite = color('--ink-primary');
  t.brightBlack = color('--ink-tertiary');
  probe.remove();
  return t;
}

const toB64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

class Session {
  constructor({ kind, title, onExit }) {
    this.kind = kind;
    this.title = title || KINDS[kind].label;
    this.id = 0;
    this.ended = false;
    this.onExit = onExit;
    this.el = document.createElement('div');
    this.el.className = 'term-host';
    this.term = new Terminal({
      fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 8000,
      theme: themeFromCss(),
      macOptionIsMeta: true,
    });
    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.loadAddon(new WebLinksAddon((e, uri) => { e.preventDefault(); call('external', uri); }));
    const u = new Unicode11Addon();
    this.term.loadAddon(u);
    this.term.unicode.activeVersion = '11';
    this.opened = false;   // xterm measures its font on open, so it opens once it's in the page
    // Copy with Ctrl+C when something is selected, paste with Ctrl+V,
    // like Windows Terminal; everything else goes to the program.
    this.term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const ctrl = e.ctrlKey && !e.altKey;
      if (ctrl && (e.key === 'c' || e.key === 'C') && this.term.hasSelection()) {
        navigator.clipboard.writeText(this.term.getSelection());
        this.term.clearSelection();
        return false;
      }
      if (ctrl && (e.key === 'v' || e.key === 'V')) {
        navigator.clipboard.readText().then((t) => this.term.paste(t));
        return false;
      }
      if (ctrl && e.key === '`') return false;
      return true;
    });
    this.term.onData((d) => { if (this.id && !this.ended) call('ptyWrite', this.id, toB64(d)); });
    this.term.onResize(({ cols, rows }) => { if (this.id && !this.ended) call('ptyResize', this.id, cols, rows); });
    this.ro = new ResizeObserver(() => this.refit());
    this.ro.observe(this.el);
  }

  /** Call once the element is in the document. */
  ensureOpen() {
    if (this.opened || !this.el.isConnected) return;
    this.term.open(this.el);
    this.opened = true;
  }

  async start(prompt = '') {
    this.ensureOpen();
    this.refit();
    try {
      this.id = Number(await call('ptyOpen', this.kind, this.term.cols || 100, this.term.rows || 24, prompt));
    } catch (err) {
      this.term.writeln(`\x1b[31m${err.message}\x1b[0m`);
      this.ended = true;
    }
    return this.id;
  }

  refit() {
    this.ensureOpen();
    if (!this.opened || !this.el.isConnected || !this.el.clientWidth || !this.el.clientHeight) return;
    try { this.fit.fit(); } catch { /* not laid out yet */ }
  }

  focus() { if (this.opened) this.term.focus(); }

  kill() { if (this.id && !this.ended) call('ptyKill', this.id); }

  dispose() {
    this.kill();
    this.ro.disconnect();
    this.term.dispose();
    this.el.remove();
  }
}

export class Terminals {
  constructor({ shell, prefs, toasts }) {
    Object.assign(this, { shell, prefs, toasts });
    this.sessions = [];
    this.active = null;
    this.panel = shell.termPanel;
    this.body = this.panel.querySelector('.term-panel__body');
    this.tabs = this.panel.querySelector('.term-panel__tabs');
    this._wire();

    // Output can arrive before ptyOpen's reply tells the page the id: it
    // waits here until the session claims it.
    this.early = new Map();
    onEvent((ev) => {
      if (ev.event === 'pty') {
        const s = this.sessions.find((x) => x.id === ev.id);
        if (s) s.term.write(ev.data);
        else { if (!this.early.has(ev.id)) this.early.set(ev.id, []); this.early.get(ev.id).push(ev); }
      }
      if (ev.event === 'ptyExit') {
        const s = this.sessions.find((x) => x.id === ev.id);
        if (!s) { if (!this.early.has(ev.id)) this.early.set(ev.id, []); this.early.get(ev.id).push(ev); return; }
        s.ended = true;
        s.term.writeln(`\r\n\x1b[90m[${s.title} ended${ev.code ? `, exit code ${ev.code}` : ''}. Press any key to close.]\x1b[0m`);
        const d = s.term.onKey(() => { d.dispose(); this.close(s); });
        this.renderTabs();
      }
    });
    const retheme = () => { const t = themeFromCss(); for (const s of this.sessions) s.term.options.theme = t; };
    prefs.onChange((what) => { if (what === 'theme' || what === 'palette') requestAnimationFrame(retheme); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(retheme));
  }

  _wire() {
    const head = this.panel.querySelector('.term-panel__head');
    head.querySelector('[data-act="new"]').onclick = () => this.open('shell');
    head.querySelector('[data-act="pick"]').onclick = async (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const id = await nativeMenu([
        { id: 1, label: 'PowerShell' },
        { id: 2, label: 'Command Prompt' },
        '-',
        { id: 3, label: 'Claude Code' },
        { id: 4, label: 'Claude: study the open note' },
      ], { x: r.left, y: r.bottom });
      if (id === 1) this.open('shell');
      if (id === 2) this.open('cmd');
      if (id === 3) this.open('claude');
      if (id === 4) window.dispatchEvent(new CustomEvent('papernotes:claude-here'));
    };
    head.querySelector('[data-act="kill"]').onclick = () => this.active && this.close(this.active);
    head.querySelector('[data-act="max"]').onclick = () => {
      this.panel.dataset.max = String(this.panel.dataset.max !== 'true');
      this.active?.refit();
    };
    head.querySelector('[data-act="side"]').onclick = () => this.active && this.onToSide?.(this.active);
    head.querySelector('[data-act="hide"]').onclick = () => this.hide();
    this.tabs.addEventListener('click', (e) => {
      const t = e.target.closest('[data-i]');
      if (!t) return;
      const s = this.sessions[Number(t.dataset.i)];
      if (e.target.closest('.term-tab__close')) this.close(s); else this.select(s);
    });

    // Drag the top edge to resize.
    const grip = this.shell.termDivider;
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startH = this.panel.offsetHeight;
      const move = (ev) => {
        const h = Math.max(120, Math.min(window.innerHeight - 200, startH - (ev.clientY - startY)));
        document.documentElement.style.setProperty('--term-h', `${h}px`);
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        this.prefs.set('termHeight', this.panel.offsetHeight);
        this.active?.refit();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    if (this.prefs.get('termHeight')) document.documentElement.style.setProperty('--term-h', `${this.prefs.get('termHeight')}px`);
  }

  get visible() { return !this.panel.hidden; }

  show() {
    this.panel.hidden = false;
    this.shell.termDivider.hidden = false;
    if (!this.sessions.length) this.open('shell');
    else { this.active?.refit(); this.active?.focus(); }
  }

  hide() {
    this.panel.hidden = true;
    this.shell.termDivider.hidden = true;
  }

  toggle() { if (this.visible) this.hide(); else this.show(); }

  /** A new session in the panel. prompt: Claude Code's first message. */
  async open(kind = 'shell', { prompt = '', title = '', show = true } = {}) {
    const s = new Session({ kind, title });
    this.sessions.push(s);
    // A session headed for the side pane opens without popping up the panel.
    const wasHidden = this.panel.hidden;
    this.panel.hidden = false;
    this.shell.termDivider.hidden = false;
    this.select(s);
    await s.start(prompt);
    if (!show && wasHidden) { s.sideOwned = true; this.hide(); }
    const early = this.early.get(s.id);
    if (early) {
      this.early.delete(s.id);
      for (const ev of early) {
        if (ev.event === 'pty') s.term.write(ev.data);
        else { s.ended = true; s.term.writeln(`\r\n\x1b[90m[${s.title} ended]\x1b[0m`); }
      }
    }
    s.focus();
    return s;
  }

  select(s) {
    this.active = s;
    if (s.el.parentElement !== this.body) this.body.appendChild(s.el);
    for (const x of this.sessions) if (x.el.parentElement === this.body) x.el.hidden = x !== s;
    s.ensureOpen();
    this.renderTabs();
    requestAnimationFrame(() => { s.refit(); s.focus(); });
  }

  close(s) {
    const i = this.sessions.indexOf(s);
    if (i < 0) return;
    this.sessions.splice(i, 1);
    this.onClosed?.(s);
    s.dispose();
    const inPanel = this.sessions.filter((x) => !x.sideOwned);
    if (this.active === s) this.active = inPanel[Math.min(i, inPanel.length - 1)] || null;
    if (this.active) this.select(this.active);
    else { this.renderTabs(); this.hide(); }
  }

  /** The side pane hands a session back, or takes one. */
  adopt(s) { s.sideOwned = false; this.select(s); this.show(); }

  release(s) {
    s.sideOwned = true;
    const rest = this.sessions.filter((x) => !x.sideOwned);
    this.active = rest[0] || null;
    if (this.active) this.select(this.active); else { this.renderTabs(); this.hide(); }
  }

  renderTabs() {
    this.tabs.innerHTML = this.sessions.map((s, i) => s.sideOwned ? '' : `
      <button class="term-tab" data-i="${i}" aria-selected="${s === this.active}" title="${s.title}">
        ${icon(KINDS[s.kind].icon)}<span>${s.title}${s.ended ? ' (ended)' : ''}</span>
        <span class="term-tab__close" title="Kill">${icon('close')}</span>
      </button>`).join('');
  }

  killAll() { for (const s of [...this.sessions]) s.kill(); }
}
