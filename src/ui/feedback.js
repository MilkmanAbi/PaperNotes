/** Status bar and toasts — the two places the app admits what is going on.
 *
 *  PI §4: no unbounded spinners, no disabled control without a label saying
 *  why, and one failing operation never speaks for the whole app. The status
 *  bar carries persistent truth (how much of the tree is loaded, which tier
 *  search is answering from); toasts carry things that happened and are over
 *  (§11.6) and never require dismissal. */

import { icon } from './icons.js';

export class StatusBar {
  constructor({ mount }) {
    this.el = document.createElement('div');
    this.el.className = 'statusbar';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    mount.appendChild(this.el);
    this.items = new Map();
  }

  /** @param {{id:string, text:string, tone?:'ok'|'busy'|'warn', right?:boolean, title?:string}} item */
  set(item) {
    this.items.set(item.id, item);
    this.render();
  }

  remove(id) {
    if (this.items.delete(id)) this.render();
  }

  render() {
    const left = [];
    const right = [];
    for (const item of this.items.values()) (item.right ? right : left).push(item);

    const chunk = (item) => {
      const tone = item.tone || 'ok';
      const cls = (tone === 'busy' ? ' statusbar__item--busy'
        : tone === 'warn' ? ' statusbar__item--warn' : '')
        + (item.id === 'path' ? ' statusbar__item--path' : '');
      const dot = item.dot === false ? ''
        : `<span class="statusbar__dot${tone === 'ok' ? '' : ` statusbar__dot--${tone}`}"></span>`;
      const title = item.title ? ` title="${escapeAttr(item.title)}"` : '';
      return `<span class="statusbar__item${cls}"${title}>${dot}${escapeHtml(item.text)}</span>`;
    };

    this.el.innerHTML =
      left.map(chunk).join('') +
      '<span class="statusbar__spacer"></span>' +
      right.map(chunk).join('');
  }
}

export class Toasts {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'toasts';
    this.el.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.el);
    this.queue = [];
    this.showing = false;
  }

  /** @param {{text:string, tone?:'info'|'warn'|'error', action?:{label:string, run:Function}}} t */
  show(t) {
    this.queue.push(t);
    if (!this.showing) this._next();
  }

  _next() {
    const t = this.queue.shift();
    if (!t) { this.showing = false; return; }
    this.showing = true;

    const el = document.createElement('div');
    el.className = `toast${t.tone && t.tone !== 'info' ? ` toast--${t.tone}` : ''}`;
    const glyph = t.tone === 'error' || t.tone === 'warn' ? icon('alert') : '';
    el.innerHTML = `${glyph}<span>${escapeHtml(t.text)}</span>`;
    if (t.action) {
      const btn = document.createElement('button');
      btn.className = 'btn btn--ghost';
      btn.textContent = t.action.label;
      btn.onclick = () => { t.action.run(); dismiss(); };
      el.appendChild(btn);
    }
    this.el.appendChild(el);

    // 3–4s informational, longer when there is something to act on (§11.6).
    const life = t.action ? 7000 : 3600;
    let timer = setTimeout(dismiss, life);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1500); });

    const self = this;
    function dismiss() {
      clearTimeout(timer);
      el.remove();
      self._next();
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function escapeAttr(s) { return escapeHtml(s); }
