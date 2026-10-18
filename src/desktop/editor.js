/** Editing a note: CodeMirror on the left, the rendered note on the right.
 *
 *  The preview is the real renderer (callouts, maths, figures and all) and
 *  follows the cursor: the block you are typing in stays in view. The
 *  editor's gutter shows the same red "confused" dots as the reader; click
 *  beside a line number to set or clear one. Saving goes through the host,
 *  which writes a temporary file and swaps it in, so a crash mid-save
 *  never leaves half a note behind. */

import { EditorView, keymap, lineNumbers, gutter, GutterMarker, highlightActiveLine,
  highlightActiveLineGutter, drawSelection, Decoration } from '@codemirror/view';
import { EditorState, StateField, StateEffect, RangeSetBuilder, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { call } from './bridge.js';
import { renderNote, rewriteLinks } from '../core/markdown.js';
import { enhance } from '../ui/enhance.js';
import { assetUrl, encodePath } from '../core/paths.js';
import { icon } from '../ui/icons.js';

// ── confused marks inside the editor ───────────────────────────────────
const setMarks = StateEffect.define();
const marksField = StateField.define({
  create: () => new Set(),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setMarks)) return e.value;
    if (!tr.docChanged || !value.size) return value;
    // Lines move with edits above them.
    const next = new Set();
    for (const line of value) {
      const pos = tr.startState.doc.line(Math.min(line + 1, tr.startState.doc.lines)).from;
      next.add(tr.state.doc.lineAt(tr.changes.mapPos(pos)).number - 1);
    }
    return next;
  },
});

class DotMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-confused-dot';
    return el;
  }
}
const dot = new DotMarker();

const markLines = EditorView.decorations.compute([marksField], (state) => {
  const b = new RangeSetBuilder();
  const lines = [...state.field(marksField)].sort((a, c) => a - c);
  for (const l of lines) {
    if (l + 1 > state.doc.lines) continue;
    b.add(state.doc.line(l + 1).from, state.doc.line(l + 1).from, Decoration.line({ class: 'cm-confused-line' }));
  }
  return b.finish();
});

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.25em' },
  { tag: t.heading2, fontWeight: '700', fontSize: '1.12em' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--accent)' },
  { tag: t.monospace, color: 'var(--tone-plum)' },
  { tag: [t.quote], color: 'var(--ink-secondary)' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--ink-tertiary)' },
  { tag: [t.list], color: 'var(--tone-ochre)' },
  { tag: [t.keyword], color: 'var(--tone-plum)' },
  { tag: [t.string], color: 'var(--tone-sage)' },
  { tag: [t.comment], color: 'var(--ink-tertiary)', fontStyle: 'italic' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--type-body-sm)', backgroundColor: 'var(--surface-sunken)', color: 'var(--ink-primary)' },
  '.cm-scroller': { fontFamily: 'var(--font-data)', lineHeight: '1.65' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 16px 0 8px' },
  '.cm-gutters': { backgroundColor: 'var(--surface-sunken)', color: 'var(--ink-tertiary)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--accent-faint)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--accent-faint)', color: 'var(--ink-primary)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-muted) !important' },
  '.cm-searchMatch': { backgroundColor: 'var(--n-hl, rgba(255,210,0,.35))' },
  '.cm-panels': { backgroundColor: 'var(--surface-raised)', color: 'var(--ink-primary)', borderTop: '1px solid var(--hairline)' },
});

export class Editor {
  constructor({ reader, store, toasts, state, prefs, onSaved, onClosed }) {
    Object.assign(this, { reader, store, toasts, state, prefs });
    this.onSaved = onSaved || (() => {});
    this.onClosed = onClosed || (() => {});
    this.path = null;
    this.nodeId = -1;
    this.saved = '';
    this.view = null;
    this.gutterConf = new Compartment();
    this.spellConf = new Compartment();
    state.onChange((ev) => {
      if (!this.view || ev.quiet) return;
      if ((ev.type === 'marks' && ev.path === this.path) || ev.type === 'load') this._pushMarks();
    });
    prefs.onChange((what) => {
      if (!this.view) return;
      if (what === 'editorLineNumbers') this.view.dispatch({ effects: this.gutterConf.reconfigure(this._gutters()) });
      if (what === 'spellcheck') this.view.dispatch({ effects: this.spellConf.reconfigure(this._spell()) });
    });
  }

  get active() { return this.path !== null; }
  get text() { return this.view ? this.view.state.doc.toString() : ''; }
  get dirty() { return this.active && this.text !== this.saved; }

  _gutters() {
    const confused = gutter({
      class: 'cm-confused-gutter',
      lineMarker: (view, line) => (view.state.field(marksField).has(view.state.doc.lineAt(line.from).number - 1) ? dot : null),
      lineMarkerChange: (u) => u.transactions.some((tr) => tr.effects.some((e) => e.is(setMarks))) || u.docChanged,
      domEventHandlers: {
        mousedown: (view, line) => {
          const n = view.state.doc.lineAt(line.from).number - 1;
          const textLine = view.state.doc.line(n + 1).text.trim();
          this.state.toggleMark(this.path, n, textLine);
          return true;
        },
      },
    });
    return this.prefs.get('editorLineNumbers') ? [confused, lineNumbers(), highlightActiveLineGutter()] : [confused];
  }

  _spell() {
    return EditorView.contentAttributes.of({ spellcheck: this.prefs.get('spellcheck') ? 'true' : 'false' });
  }

  _pushMarks() {
    const lines = new Set(this.state.marksOf(this.path).map((m) => m.line));
    this.view.dispatch({ effects: setMarks.of(lines) });
  }

  async open(path, nodeId) {
    if (this.active && this.path === path) return;
    if (this.dirty && !(await this.save())) return;

    const res = await fetch(assetUrl(`content/${encodePath(path)}`), { cache: 'no-store' });
    if (!res.ok) { this.toasts.show({ tone: 'error', text: `Could not open ${path} for editing.` }); return; }
    const raw = await res.text();

    const reader = this.reader;
    reader._clear();
    reader.currentPath = path;
    reader.inner.dataset.wide = 'true';
    document.documentElement.dataset.page = 'edit';   // the outline steps aside
    this.path = path;
    this.nodeId = nodeId;
    this.saved = raw;

    const name = path.split('/').pop();
    const el = document.createElement('div');
    el.className = 'reader__sheet editor';
    el.innerHTML = `
      <div class="editor__bar">
        <span class="editor__name"></span>
        <span class="editor__state caption" aria-live="polite"></span>
        <span class="editor__spacer"></span>
        <span class="editor__hint caption">Click left of a line number to mark it confusing</span>
        <button type="button" class="btn btn--ghost" data-act="discard">Discard changes</button>
        <button type="button" class="btn" data-act="done">${icon('check')}<span>Done</span></button>
      </div>
      <div class="editor__panes">
        <div class="editor__code"></div>
        <div class="editor__preview"><article class="note-content"></article></div>
      </div>`;
    el.querySelector('.editor__name').textContent = name;
    this.el = el;
    this.preview = el.querySelector('.note-content');
    this.previewWrap = el.querySelector('.editor__preview');
    this.stateEl = el.querySelector('.editor__state');
    reader.inner.appendChild(el);

    const save = () => { this.save(); return true; };
    this.view = new EditorView({
      parent: el.querySelector('.editor__code'),
      state: EditorState.create({
        doc: raw,
        extensions: [
          this.gutterConf.of(this._gutters()),
          this.spellConf.of(this._spell()),
          marksField, markLines,
          history(), drawSelection(), highlightActiveLine(), highlightSelectionMatches(), bracketMatching(),
          EditorView.lineWrapping,
          markdown(),
          syntaxHighlighting(highlight),
          theme,
          keymap.of([
            { key: 'Mod-s', run: save, preventDefault: true },
            { key: 'Escape', run: () => { this.close(); return true; } },
            ...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) { this._changed(); this._schedulePreview(); }
            if (u.selectionSet || u.docChanged) this._scheduleFollow();
          }),
        ],
      }),
    });
    this._pushMarks();

    el.querySelector('[data-act="done"]').onclick = () => this.close();
    el.querySelector('[data-act="discard"]').onclick = () => this.discard();

    this._renderPreview();
    this._changed();
    reader.wrap.scrollTop = 0;
    this.view.focus();
  }

  _changed() {
    const dirty = this.dirty;
    this.stateEl.textContent = dirty ? 'Unsaved changes' : 'Saved';
    this.el.querySelector('[data-act="discard"]').hidden = !dirty;
    if (dirty !== this._reportedDirty) {
      this._reportedDirty = dirty;
      call('dirty', dirty ? 1 : 0, this.path.split('/').pop()).catch(() => {});
    }
  }

  _schedulePreview() {
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => this._renderPreview(), 160);
  }

  _renderPreview() {
    if (!this.view) return;
    const { html, css, headings } = renderNote(this.text, this.path);
    this.preview.innerHTML = html;
    this.reader._setStyles(css);
    rewriteLinks(this.preview, this.path, { exists: (p) => this.reader._indexHas(p), resolveWiki: (n) => this.reader.resolveWiki(n) });
    enhance(this.preview);
    this.reader.headings = headings;
    this.reader._emitHeadings();
    this._follow();
  }

  _scheduleFollow() {
    cancelAnimationFrame(this._followRaf);
    this._followRaf = requestAnimationFrame(() => this._follow());
  }

  /** Keep the preview on the block the cursor is in. */
  _follow() {
    if (!this.view) return;
    const line = this.view.state.doc.lineAt(this.view.state.selection.main.head).number - 1;
    let target = null;
    for (const el of this.preview.querySelectorAll('[data-line]')) {
      if (Number(el.dataset.line) <= line) target = el; else break;
    }
    if (!target) return;
    const wrap = this.previewWrap;
    const top = target.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop;
    if (top < wrap.scrollTop + 40 || top > wrap.scrollTop + wrap.clientHeight - 80) {
      wrap.scrollTo({ top: Math.max(0, top - wrap.clientHeight / 3), behavior: 'smooth' });
    }
  }

  /** @returns {Promise<boolean>} whether the note is now saved */
  async save() {
    if (!this.active) return true;
    if (!this.dirty) return true;
    const text = this.text;
    this.stateEl.textContent = 'Saving…';
    try {
      await call('write', this.path, text);
      this.saved = text;
      this.reader._remember(this.path, text);
      // Marks moved with their lines inside the editor; keep the state in step.
      const lines = [...this.view.state.field(marksField)];
      const old = this.state.marksOf(this.path);
      if (old.length && lines.length === old.length) {
        const sorted = lines.sort((a, b) => a - b);
        old.forEach((m, i) => { m.line = sorted[i]; m.snippet = this.view.state.doc.line(sorted[i] + 1).text.trim().slice(0, 140); });
        this.state._changed({ type: 'marks', path: this.path, quiet: true });
      } else {
        this.state.remapMarks(this.path, text);
      }
      this._changed();
      this.onSaved(this.path);
      return true;
    } catch (err) {
      this.stateEl.textContent = 'Not saved';
      this.toasts.show({ tone: 'error', text: `Could not save ${this.path.split('/').pop()}: ${err.message}` });
      return false;
    }
  }

  discard() {
    if (!this.active) return;
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: this.saved } });
    this._pushMarks();
  }

  /** Save, leave the editor and show the note again. */
  async close() {
    if (!this.active) return true;
    if (!(await this.save())) return false;
    const { path, nodeId } = this;
    this._reset();
    await this.reader.open(path, { nodeId, force: true });
    this.onClosed(path);
    return true;
  }

  /** Leave without saving (the note was deleted or moved away underneath). */
  abandon() {
    if (!this.active) return;
    this._reset();
  }

  _reset() {
    clearTimeout(this._previewTimer);
    if (document.documentElement.dataset.page === 'edit') document.documentElement.dataset.page = 'note';
    if (this._reportedDirty) call('dirty', 0, '').catch(() => {});
    this._reportedDirty = false;
    this.view?.destroy();
    this.view = null;
    this.path = null;
    this.nodeId = -1;
    this.el = null;
  }
}
