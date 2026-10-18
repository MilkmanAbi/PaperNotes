/** Side by side: a second pane to the right of the reader, holding another
 *  note (or PDF, or anything the reader can show) or a terminal. Read the
 *  past paper on the left and the solutions on the right; or your notes on
 *  the left and Claude on the right.
 *
 *  The side pane has its own small history and its own reader; links
 *  clicked inside it stay inside it. Drag the divider to resize. */

import { Reader } from './reader.js';
import { icon } from './icons.js';
import { toHash, decodeHashPath } from '../core/paths.js';

export class SplitView {
  constructor({ shell, store, prefs, router, terminals }) {
    Object.assign(this, { shell, store, prefs, router, terminals });
    this.pane = shell.sidePane;
    this.body = this.pane.querySelector('.pane__body');
    this.titleEl = this.pane.querySelector('.pane__title');
    this.kind = null;      // 'note' | 'terminal'
    this.path = '';
    this.session = null;
    this.reader = null;

    this.pane.querySelector('[data-act="close"]').onclick = () => this.close();
    this.pane.querySelector('[data-act="main"]').onclick = () => {
      if (this.kind === 'note') { const p = this.path; this.close(); router.go(p); }
      if (this.kind === 'terminal') { const s = this.session; this.close({ keepSession: true }); terminals.adopt(s); }
    };
    this.pane.querySelector('[data-act="swap"]').onclick = () => {
      if (this.kind !== 'note') return;
      const mine = this.path;
      const theirs = router.current.path;
      router.go(mine);
      if (theirs && !theirs.startsWith(':')) this.openNote(theirs);
    };

    // Links inside the pane open in the pane.
    this.body.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#/"]');
      if (!a || a.dataset.inNote === 'true') return;
      e.preventDefault();
      e.stopPropagation();
      this.openNote(decodeHashPath(a.getAttribute('href')));
    }, true);

    this._divider();
    const ratio = prefs.get('splitRatio') || 0.5;
    document.documentElement.style.setProperty('--split', String(ratio));
  }

  get open() { return !this.pane.hidden; }

  _show(title) {
    this.pane.hidden = false;
    this.shell.splitDivider.hidden = false;
    document.documentElement.dataset.split = 'true';
    this.titleEl.textContent = title;
    this.pane.querySelector('[data-act="swap"]').hidden = this.kind !== 'note';
  }

  _clearBody({ keepSession = false } = {}) {
    if (this.session) {
      if (keepSession) this.session.el.remove(); else this.terminals.close(this.session);
      this.session = null;
    }
    this.body.replaceChildren();
    this.reader = null;
  }

  async openNote(path) {
    if (this.kind === 'terminal' && this.session) {
      // The terminal goes back to the panel rather than being killed.
      const s = this.session;
      this.session = null;
      this.body.replaceChildren();
      this.terminals.adopt(s);
    }
    this.kind = 'note';
    this.path = path;
    if (!this.reader) {
      this.body.replaceChildren();
      // A small router of its own: moves stay in this pane.
      const paneRouter = { go: (p) => this.openNote(p), current: { path } };
      this.reader = new Reader({ mount: this.body, store: this.store, router: paneRouter, onNavigate: () => {}, onReveal: () => {} });
      this.reader.wrap.classList.add('pane__reader');
    }
    const id = await this.store.resolvePath(path);
    this._show(id > 0 ? this.store.titleOf(id) : path.split('/').pop() || 'Home');
    if (id < 0) { this.reader.showMissing(path); return; }
    if (this.store.kind[id] === 0) this.reader.showFolder(id);
    else await this.reader.open(path, { nodeId: id });
  }

  /** Put a terminal session (new, or taken from the panel) in the pane. */
  openTerminal(session) {
    if (this.kind === 'note') this._clearBody();
    else if (this.session && this.session !== session) this.terminals.adopt(this.session);
    this.kind = 'terminal';
    this.session = session;
    this.terminals.release(session);
    this.body.replaceChildren(session.el);
    session.el.hidden = false;
    session.ensureOpen();
    this._show(session.title);
    requestAnimationFrame(() => { session.refit(); session.focus(); });
  }

  close({ keepSession = false } = {}) {
    if (this.kind === 'terminal' && this.session && keepSession) {
      const s = this.session;
      this.session = null;
      s.el.remove();
      this.body.replaceChildren();
    } else if (this.kind === 'terminal' && this.session) {
      // Closing the pane hands a running terminal back to the panel.
      const s = this.session;
      this.session = null;
      this.body.replaceChildren();
      this.terminals.adopt(s);
    } else {
      this._clearBody();
    }
    this.kind = null;
    this.path = '';
    this.pane.hidden = true;
    this.shell.splitDivider.hidden = true;
    document.documentElement.dataset.split = 'false';
  }

  _divider() {
    const d = this.shell.splitDivider;
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      d.setPointerCapture(e.pointerId);
      const box = this.shell.workspace.getBoundingClientRect();
      const move = (ev) => {
        const r = Math.max(0.2, Math.min(0.8, 1 - (ev.clientX - box.left) / box.width));
        document.documentElement.style.setProperty('--split', String(r));
      };
      const up = () => {
        d.removeEventListener('pointermove', move);
        d.removeEventListener('pointerup', up);
        this.prefs.set('splitRatio', Number(getComputedStyle(document.documentElement).getPropertyValue('--split')) || 0.5);
        this.session?.refit();
      };
      d.addEventListener('pointermove', move);
      d.addEventListener('pointerup', up);
    });
    void toHash; void icon;
  }
}
