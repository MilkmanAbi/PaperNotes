/** Updates, one click.
 *
 *  PaperNotes looks at the project's GitHub releases (a few seconds after
 *  start, then twice a day while it runs) for a version newer than this one,
 *  by semver: 2.10.0 is newer than 2.9.3, and pre-releases and drafts are
 *  skipped. When there is one, an Update button appears in the top bar.
 *
 *  Updating saves everything first (the note you're editing, what PaperNotes
 *  remembers, your tabs and settings), then the host downloads the installer
 *  from the release, checks its size and SHA-256 against what GitHub lists,
 *  runs it silently and quits. The installer replaces only the program
 *  (your library, your settings and the app's caches are never touched) and
 *  opens PaperNotes again when it's done. */

import { call, onEvent } from './bridge.js';
import { showPopover } from '../ui/popover.js';
import { escapeHtml } from '../ui/study.js';
import { icon } from '../ui/icons.js';

export const REPO = 'MilkmanAbi/PaperNotes';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const ASSET = /^PaperNotes-Setup-\d+\.\d+\.\d+\.exe$/;
const LAST = 'paper-notes/update/last-check';
const EVERY = 12 * 3600 * 1000;

/** "v2.3.0" / "2.3.0-beta.1" → { major, minor, patch, pre: [...] }, or null. */
export function parseVersion(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(s).trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] };
}

/** Semver precedence: <0 if a is older than b, 0 if equal, >0 if newer. */
export function compareVersions(a, b) {
  const x = typeof a === 'string' ? parseVersion(a) : a;
  const y = typeof b === 'string' ? parseVersion(b) : b;
  if (!x || !y) return 0;
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] - y[k];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;   // a release beats its pre-releases
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const np = /^\d+$/.test(p);
    const nq = /^\d+$/.test(q);
    if (np && nq && +p !== +q) return +p - +q;
    if (np !== nq) return np ? -1 : 1;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

export class Updater {
  constructor({ current, toasts, prefs, button, beforeUpdate }) {
    Object.assign(this, { current, toasts, prefs, button, beforeUpdate });
    this.available = null;    // { version, notes, url, size, sha256, page, date }
    this.state = 'idle';      // idle | checking | downloading | installing
    this.progress = 0;
    this.listeners = new Set();
    button.onclick = () => this.openPanel();
    onEvent((ev) => {
      if (ev.event !== 'update-progress') return;
      this.progress = ev.total ? ev.done / ev.total : 0;
      this._emit();
    });
    if (prefs.get('updateCheck') !== false) {
      setTimeout(() => this.check({ quiet: true, ifDue: true }), 8000);
      setInterval(() => this.check({ quiet: true, ifDue: true }), 3600 * 1000);
    }
    this._paintButton();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { this._paintButton(); for (const fn of this.listeners) fn(); }

  /** Ask GitHub. quiet: no message unless there's an update. */
  async check({ quiet = false, ifDue = false } = {}) {
    if (this.state !== 'idle') return this.available;
    if (ifDue) {
      let last = 0;
      try { last = Number(localStorage.getItem(LAST)) || 0; } catch { /* first time */ }
      if (Date.now() - last < EVERY && !this.available) return null;
    }
    this.state = 'checking';
    this._emit();
    try {
      const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!res.ok) throw new Error(res.status === 403 ? 'GitHub is rate-limiting update checks; try again in a while' : `GitHub said ${res.status}`);
      const releases = await res.json();
      try { localStorage.setItem(LAST, String(Date.now())); } catch { /* fine */ }
      let best = null;
      for (const r of releases) {
        if (r.draft || r.prerelease) continue;
        const v = parseVersion(r.tag_name);
        if (!v || v.pre.length) continue;
        const asset = (r.assets || []).find((a) => ASSET.test(a.name));
        if (!asset) continue;
        if (!best || compareVersions(v, best.v) > 0) best = { v, r, asset };
      }
      if (best && compareVersions(best.v, this.current) > 0) {
        const digest = /^sha256:([0-9a-f]{64})$/i.exec(best.asset.digest || '');
        this.available = {
          version: `${best.v.major}.${best.v.minor}.${best.v.patch}`,
          notes: best.r.body || '',
          url: best.asset.browser_download_url,
          size: best.asset.size,
          sha256: digest ? digest[1].toLowerCase() : '',
          page: best.r.html_url,
          date: best.r.published_at,
        };
        if (quiet) this.toasts.show({ text: `PaperNotes ${this.available.version} is out.`, action: { label: 'See what\'s new', run: () => this.openPanel() } });
      } else {
        this.available = null;
        if (!quiet) this.toasts.show({ text: `You're up to date (PaperNotes ${this.current}).` });
      }
    } catch (err) {
      if (!quiet) this.toasts.show({ tone: 'warn', text: `Couldn't check for updates: ${err.message}.` });
    } finally {
      this.state = 'idle';
      this._emit();
    }
    return this.available;
  }

  /** Save everything, download, check, install, come back. */
  async install() {
    const u = this.available;
    if (!u || this.state !== 'idle') return;
    this.state = 'downloading';
    this.progress = 0;
    this._emit();
    try {
      const path = await call('updateDownload', u.url, String(u.size || 0), u.sha256);
      this.state = 'installing';
      this._emit();
      await this.beforeUpdate();
      await call('updateRun', path);
      // The host quits now; the installer opens PaperNotes again.
    } catch (err) {
      this.state = 'idle';
      this._emit();
      this.toasts.show({ tone: 'error', text: `The update didn't install: ${err.message}` });
    }
  }

  _paintButton() {
    const b = this.button;
    const busy = this.state === 'downloading' || this.state === 'installing';
    b.hidden = !this.available && !busy;
    b.dataset.state = this.state;
    b.innerHTML = `${icon('download')}<span>${busy ? (this.state === 'installing' ? 'Installing…' : `${Math.round(this.progress * 100)}%`) : 'Update'}</span>`;
    b.title = this.available ? `PaperNotes ${this.available.version} is available (you have ${this.current})` : '';
  }

  openPanel() {
    const u = this.available;
    const el = document.createElement('div');
    el.className = 'upd';
    const paint = () => {
      const busy = this.state === 'downloading' || this.state === 'installing';
      if (!u) {
        el.innerHTML = `<b>PaperNotes ${escapeHtml(this.current)}</b><p class="caption">${this.state === 'checking' ? 'Checking…' : 'You have the newest version.'}</p>`;
        return;
      }
      el.innerHTML = `
        <div class="upd__head">${icon('download')}<div><b>PaperNotes ${escapeHtml(u.version)}</b><span class="caption">You have ${escapeHtml(this.current)}${u.date ? ` · released ${escapeHtml(new Date(u.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}</span></div></div>
        ${u.notes ? `<div class="upd__notes">${escapeHtml(u.notes).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\r?\n/g, '<br>')}</div>` : ''}
        <p class="caption upd__safe">Your notes, settings and everything PaperNotes remembers stay exactly as they are. PaperNotes saves, closes, updates and opens again by itself.</p>
        ${busy ? `<div class="upd__bar"><i style="width:${this.state === 'installing' ? 100 : Math.round(this.progress * 100)}%"></i></div><p class="caption">${this.state === 'installing' ? 'Installing, PaperNotes will reopen in a moment…' : 'Downloading…'}</p>` : ''}
        <div class="upd__actions">
          <a class="btn btn--ghost" href="${escapeHtml(u.page)}" target="_blank" rel="noopener">Release page</a>
          <button class="btn" data-act="go"${busy ? ' disabled' : ''}>${icon('download')}<span>Update now</span></button>
        </div>`;
      el.querySelector('[data-act="go"]')?.addEventListener('click', () => this.install());
    };
    paint();
    const off = this.on(() => { if (!el.isConnected) { off(); return; } paint(); });
    showPopover(el, { anchor: this.button.hidden ? null : this.button, x: window.innerWidth - 380, y: 52, cls: 'popover--upd', onClose: off });
  }
}

