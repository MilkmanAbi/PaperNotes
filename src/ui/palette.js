/** Command palette — Patterns §2.
 *
 *  A true overlay (§4): transient, scrimmed, elevation-2, 520px wide, gone
 *  on Esc or on completing the action. Local results appear on the keystroke
 *  that produced them, with no debounce and no spinner, because the data is
 *  already in memory (PI §1.1). Shortcut hints appear on the focused row
 *  only — showing them on every row turns a palette into a cheat sheet. */

import { icon } from './icons.js';
import { fileKind, kindIcon } from '../core/filetypes.js';

export class Palette {
  constructor({ search, store, commands, onOpenNote }) {
    this.search = search;
    this.store = store;
    this.commands = commands;       // () => [{ id, label, hint, run }]
    this.onOpenNote = onOpenNote;
    this.open = false;
    this.active = 0;
    this.rows = [];

    this.scrim = document.createElement('div');
    this.scrim.className = 'palette-scrim';
    this.scrim.hidden = true;
    this.scrim.innerHTML = `
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette__head">
          <div class="searchbar">
            ${icon('search')}
            <input type="text" placeholder="Jump to a note, or type a command" aria-label="Command palette" spellcheck="false" autocomplete="off">
          </div>
        </div>
        <div class="palette__list" role="listbox"></div>
        <div class="palette__foot">
          <span>${icon('enter')} open</span><span>↑↓ move</span><span>esc close</span>
        </div>
      </div>`;
    document.body.appendChild(this.scrim);

    this.input = this.scrim.querySelector('input');
    this.list = this.scrim.querySelector('.palette__list');

    this.scrim.addEventListener('mousedown', (e) => {
      if (e.target === this.scrim) this.close();
    });
    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('keydown', (e) => this._onKey(e));
    this.list.addEventListener('click', (e) => {
      const row = e.target.closest('.palette__row');
      if (row) this._run(Number(row.dataset.i));
    });
  }

  show(initial = '') {
    this.open = true;
    this.scrim.hidden = false;
    this.input.value = initial;
    this.active = 0;
    this.refresh();
    this.input.focus();
    this.input.select();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.scrim.hidden = true;
  }

  toggle() { this.open ? this.close() : this.show(); }

  refresh() {
    const q = this.input.value.trim();
    const rows = [];

    const commands = this.commands();
    if (!q) {
      for (const c of commands) rows.push({ kind: 'command', ...c });
    } else {
      const lower = q.toLowerCase();
      for (const c of commands) {
        if (c.label.toLowerCase().includes(lower)) rows.push({ kind: 'command', ...c });
      }
      const { results } = this.search.run(q);
      for (const r of results.slice(0, 40)) {
        if (this.store.kind[r.id] !== 1) continue;
        rows.push({
          kind: 'note',
          id: r.id,
          label: this.store.titleOf(r.id),
          path: this.store.pathOf(r.id),
        });
      }
    }

    this.rows = rows;
    this.active = Math.min(this.active, Math.max(0, rows.length - 1));
    this._render();
  }

  _render() {
    if (!this.rows.length) {
      this.list.innerHTML = '<p class="palette__empty">Nothing matches that yet.</p>';
      return;
    }
    this.list.innerHTML = this.rows.map((r, i) => {
      const active = i === this.active;
      const glyph = icon(r.kind === 'command' ? 'command' : kindIcon(fileKind(r.path)));
      const trailing = r.kind === 'command'
        ? (active && r.hint ? `<span class="palette__key">${escapeHtml(r.hint)}</span>` : '')
        : `<span class="palette__path">${escapeHtml(r.path)}</span>`;
      return `<div class="palette__row" role="option" data-i="${i}" data-active="${active}" aria-selected="${active}">
        ${glyph}<span class="palette__label">${escapeHtml(r.label)}</span>${trailing}</div>`;
    }).join('');
    this.list.children[this.active]?.scrollIntoView({ block: 'nearest' });
  }

  _onKey(e) {
    switch (e.key) {
      case 'Escape': e.preventDefault(); this.close(); return;
      case 'ArrowDown':
        e.preventDefault();
        this.active = Math.min(this.rows.length - 1, this.active + 1);
        this._render();
        return;
      case 'ArrowUp':
        e.preventDefault();
        this.active = Math.max(0, this.active - 1);
        this._render();
        return;
      case 'Enter': e.preventDefault(); this._run(this.active); return;
      default:
    }
  }

  _run(i) {
    const row = this.rows[i];
    if (!row) return;
    this.close();
    if (row.kind === 'command') row.run();
    else this.onOpenNote(row.id);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
