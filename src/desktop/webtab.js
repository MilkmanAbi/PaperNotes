/** VS Code for the web (vscode.dev) in a PaperNotes tab.
 *
 *  vscode.dev cannot sit in an iframe (it forbids being framed), so the host
 *  gives it a WebView of its own and places it over this page's frame; this
 *  file keeps the two lined up. The website has no line to PaperNotes or
 *  your files: it is the same vscode.dev you would get in Edge, signed in
 *  (or not) the same way, and it stays alive while you use other tabs.
 *
 *  Around it: back, forward, reload and an address bar (any https:// site
 *  works), Claude beside it in the side pane, and "Save code as a note" for
 *  keeping a snippet in My notes. */

import { call, onEvent } from './bridge.js';
import { icon } from '../ui/icons.js';
import { askForm } from '../ui/dialog.js';

export const CODE_PAGE = ':code';
const KEY = 'code';
const HOME = 'https://vscode.dev/';

// Anything of PaperNotes' own that opens over the page: the website steps
// aside while it is up, or it would hide it (it is a window of its own).
const OVERLAYS = '.dialog-scrim, .palette-scrim:not([hidden]), .popover, .lightbox, .pn-preview, .cm-tooltip-autocomplete';

let opened = false;
let where = { url: HOME, title: '', back: false, forward: false };
let frame = null;
let bar = null;
let timer = 0;
let placed = '';

onEvent((ev) => {
  if (ev.event !== 'web' || ev.key !== KEY) return;
  where = ev;
  paintBar();
});

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function send(box) {
  const key = box.join(',');
  if (key === placed) return;
  placed = key;
  call('webPlace', KEY, ...box).catch(() => {});
}

/** Line the website up with the frame (or hide it), many times a second while shown. */
function place() {
  if (!frame?.isConnected) { hideWebTab(); return; }
  // Only the part of the frame inside the reader: the website must never
  // cover the status bar, the tabs or the sidebar.
  const f = frame.getBoundingClientRect();
  const v = frame.closest('.reader-wrap')?.getBoundingClientRect() || f;
  const r = { left: Math.max(f.left, v.left), top: Math.max(f.top, v.top) };
  r.width = Math.min(f.right, v.right) - r.left;
  r.height = Math.min(f.bottom, v.bottom) - r.top;
  const d = window.devicePixelRatio || 1;
  const covered = document.querySelector(OVERLAYS) || document.visibilityState === 'hidden';
  send(covered || r.width < 40 || r.height < 40 ? [0, 0, 0, 0]
    : [Math.round(r.left * d), Math.round(r.top * d), Math.round(r.width * d), Math.round(r.height * d)]);
}

/** Leaving the tab: the website is hidden, not closed, so nothing is lost. */
export function hideWebTab() {
  clearInterval(timer);
  timer = 0;
  frame = null;
  if (opened) send([0, 0, 0, 0]);
}

function paintBar() {
  if (!bar?.isConnected) return;
  bar.querySelector('[data-act="back"]').disabled = !where.back;
  bar.querySelector('[data-act="forward"]').disabled = !where.forward;
  const input = bar.querySelector('.webtab__address');
  if (document.activeElement !== input) input.value = where.url || HOME;
}

function guessLanguage(code) {
  if (/^\s*#include\b|\bint\s+main\s*\(/m.test(code)) return /\b(std::|cout|template\s*<)/.test(code) ? 'cpp' : 'c';
  if (/^\s*(def |class \w+.*:|import \w+|from \w+ import)/m.test(code)) return 'python';
  if (/^\s*(public|private)\s+(static\s+)?(class|void)\b/m.test(code)) return 'java';
  if (/^\s*<(!doctype|html|div|body|head)\b/im.test(code)) return 'html';
  if (/^\s*(select|insert|update|create table)\b/im.test(code)) return 'sql';
  if (/\b(interface|type)\s+\w+\s*[={]|:\s*(string|number|boolean)\b/.test(code)) return 'ts';
  if (/\b(const|let|function)\b|=>/.test(code)) return 'js';
  if (/^\s*[.#]?[\w-]+\s*\{[^}]*:[^}]*\}/m.test(code)) return 'css';
  if (/^\s*(\$|sudo |npm |git |cd |ls\b)/m.test(code)) return 'bash';
  return '';
}

const LANGS = ['', 'python', 'c', 'cpp', 'js', 'ts', 'java', 'html', 'css', 'sql', 'bash', 'json', 'matlab', 'arduino'];

/** Paste a snippet (from VS Code or anywhere): it becomes a note in My notes. */
async function codeNote({ toasts, myNotes, open }) {
  let pasted = '';
  try { pasted = await navigator.clipboard.readText(); } catch { /* the clipboard is the user's to paste */ }
  const got = await askForm({
    title: 'Save code as a note',
    fields: [
      { name: 'title', label: 'Title', value: '', placeholder: 'What it does, e.g. Debounce a button' },
      { name: 'lang', label: 'Language', type: 'select', value: guessLanguage(pasted), options: LANGS.map((l) => ({ value: l, label: l || 'Plain text' })) },
      { name: 'code', label: 'Code (Ctrl+V to paste)', type: 'textarea', rows: 12, value: pasted },
      { name: 'about', label: 'Notes on it (optional)', type: 'textarea', rows: 2, value: '' },
    ],
    action: 'Save note',
  });
  if (!got || !got.code.trim()) return;
  const title = (got.title || got.code.trim().split('\n')[0]).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Code snippet';
  const fence = got.code.includes('```') ? '~~~' : '```';
  const body = `# ${title}\n\n${got.about.trim() ? `${got.about.trim()}\n\n` : ''}${fence}${got.lang}\n${got.code.replace(/\s+$/, '')}\n${fence}\n`;
  const folder = myNotes();
  for (let n = 1; n < 50; n++) {
    const path = `${folder ? `${folder}/` : ''}${title}${n > 1 ? ` (${n})` : ''}.md`;
    try {
      await call('create', path, body);
      toasts.show({ text: `Saved ${path.split('/').pop()} in ${folder || 'your study folder'}.` });
      open?.(path);
      return;
    } catch (err) {
      if (!/already there/i.test(err.message)) { toasts.show({ tone: 'error', text: `Could not save it: ${err.message}` }); return; }
    }
  }
}

/** The VS Code tab. */
export async function showWebTab({ reader, toasts, claude, myNotes, openNote, onClose }) {
  reader._clear();
  reader.currentPath = CODE_PAGE;
  reader.inner.dataset.wide = 'true';
  reader.headings = [];
  reader._emitHeadings();

  const page = document.createElement('div');
  page.className = 'reader__sheet webtab';
  page.innerHTML = `
    <div class="webtab__bar">
      <button class="icon-btn" data-act="back" title="Back" aria-label="Back">${icon('arrowLeft')}</button>
      <button class="icon-btn" data-act="forward" title="Forward" aria-label="Forward">${icon('arrowRight')}</button>
      <button class="icon-btn" data-act="reload" title="Reload" aria-label="Reload">${icon('refresh')}</button>
      <input class="webtab__address" type="text" spellcheck="false" aria-label="Address" value="${esc(where.url || HOME)}">
      <button class="icon-btn" data-act="home" title="VS Code" aria-label="Go to VS Code">${icon('brackets')}</button>
      <button class="icon-btn" data-act="browser" title="Open in your browser" aria-label="Open in your browser">${icon('external')}</button>
      <span class="webtab__gap"></span>
      <button class="btn btn--secondary" data-act="claude" title="Claude in the side pane, set up for coding">${icon('sparkle')}<span>Claude beside it</span></button>
      <button class="btn btn--secondary" data-act="note" title="Paste a snippet and keep it in My notes">${icon('code')}<span>Save code as a note</span></button>
      <button class="icon-btn" data-act="close" title="Close VS Code (frees its memory)" aria-label="Close VS Code">${icon('close')}</button>
    </div>
    <div class="webtab__frame"><p class="caption">Opening VS Code for the web…</p></div>`;
  reader.inner.appendChild(page);
  reader.wrap.scrollTop = 0;
  bar = page.querySelector('.webtab__bar');
  frame = page.querySelector('.webtab__frame');

  const go = (to) => call('webGo', KEY, to).catch((err) => toasts.show({ tone: 'error', text: err.message }));
  bar.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back' || act === 'forward' || act === 'reload') go(act);
    if (act === 'home') go(HOME);
    if (act === 'browser') call('external', where.url || HOME).catch(() => {});
    if (act === 'claude') claude?.();
    if (act === 'note') codeNote({ toasts, myNotes, open: openNote });
    if (act === 'close') {
      hideWebTab();
      await call('webClose', KEY).catch(() => {});
      opened = false;
      where = { url: HOME, title: '', back: false, forward: false };
      onClose?.();
    }
  });
  const address = bar.querySelector('.webtab__address');
  address.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    let to = address.value.trim();
    if (!to) return;
    if (!/^https:\/\//i.test(to)) to = `https://${to.replace(/^\w+:\/\//, '')}`;
    go(to);
    address.blur();
  });
  address.addEventListener('focus', () => address.select());
  paintBar();

  // The frame fills what is left of the reader below the bar.
  const fit = () => {
    if (!frame?.isConnected) return;
    // From where the frame starts down to the bottom of the reader, less a margin.
    const h = Math.floor(reader.wrap.getBoundingClientRect().bottom - frame.getBoundingClientRect().top - 12);
    if (Math.abs(frame.offsetHeight - h) > 1) frame.style.height = `${Math.max(240, h)}px`;
  };
  fit();
  if (!opened) {
    try {
      await call('webOpen', KEY, where.url || HOME);
      opened = true;
    } catch (err) {
      frame.innerHTML = `<p class="caption">Could not open it: ${esc(err.message)}</p>`;
      return;
    }
  }
  placed = '';
  clearInterval(timer);
  timer = setInterval(() => { fit(); place(); }, 100);
  place();
}
