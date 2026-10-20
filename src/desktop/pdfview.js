/** PaperNotes' own PDF reader, in the desktop app.
 *
 *  pdf.js (Mozilla's, the one inside Firefox) draws the pages, and its
 *  editors add highlights, pen strokes, text, pictures and signatures. They
 *  are written into the PDF itself as ordinary annotations, so Edge,
 *  Acrobat and a phone all show them too. Edits save themselves a moment
 *  after you stop. The first save keeps the PDF as it was in
 *  .papernotes/originals, and More, then "Restore the original" puts it back.
 *
 *  Sticky notes stay PaperNotes' own (ui/stickies.js): pinned to a spot on a
 *  page, so they move with the zoom, and Claude can read them.
 *
 *  pdf.js is loaded the first time a PDF opens, never before. A window
 *  popped out of the main one shows PDFs without the tools: two windows
 *  saving the same file would undo each other's marks. */

import { call, nativeMenu, setUnsaved, windowNumber } from './bridge.js';
import { icon } from '../ui/icons.js';
import { askConfirm } from '../ui/dialog.js';

const HIGHLIGHTS = [['yellow', '#FFFF98'], ['green', '#53FFBC'], ['blue', '#80EBFF'], ['pink', '#FFCBE6'], ['red', '#FF4F5F']];
const INKS = ['#1F1F1F', '#2563EB', '#DC2626', '#16A34A', '#9333EA', '#F59E0B'];
const ZOOMS = [['page-width', 'Fit width'], ['page-fit', 'Whole page'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['2', '200%'], ['3', '300%']];
/** How long after the last change a PDF saves itself. Each save writes the
 *  whole file (and OneDrive uploads it again), so a big one waits for a pause
 *  in the marking; leaving it, Ctrl+S and closing the app save at once. */
const saveDelay = (bytes) => (bytes > 20e6 ? 8000 : bytes > 5e6 ? 4000 : 1500);

let lib = null;
async function loadPdfjs() {
  if (lib) return lib;
  const pdfjs = await import('pdfjs-dist');
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  // The viewer half of pdf.js finds the library on globalThis.
  globalThis.pdfjsLib = pdfjs;
  const viewer = await import('pdfjs-dist/web/pdf_viewer.mjs');
  // pdf.js's stylesheet names generic things (.dialog, .sidebar, :root
  // variables), so it applies inside the reader only and the rest of
  // PaperNotes looks exactly as it did.
  const { default: css } = await import('pdfjs-dist/web/pdf_viewer.css?inline');
  const style = document.createElement('style');
  style.dataset.owner = 'pdfjs';
  style.textContent = `@scope (.pdfx) {\n${css.replace(/:root\b/g, ':scope')}\n}`;
  document.head.appendChild(style);
  lib = { pdfjs, ...viewer };
  return lib;
}

/** Every PDF reader still alive (on screen, or just left and saving). */
const live = new Set();
/** Saves everything not saved yet, before the app closes. */
export async function flushPdf() {
  const results = await Promise.all([...live].map((r) => r.save()));
  return results.every(Boolean);
}

function toBase64(bytes) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(new Blob([bytes], { type: 'application/pdf' }));
  });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tool = (id, label, ic, key) =>
  `<button class="icon-btn" data-tool="${id}" title="${esc(label)}${key ? ` (${key})` : ''}" aria-label="${esc(label)}" aria-pressed="false">${icon(ic)}</button>`;
const act = (id, label, ic) => `<button class="icon-btn" data-act="${id}" title="${esc(label)}" aria-label="${esc(label)}">${icon(ic)}</button>`;

/** Fills `view` with the reader. Returns false if this PDF should fall back
 *  to the browser's viewer. v: { view, path, url, name, ctx, current(), reopen() }. */
export async function showPdf(v, { toasts, prefs }) {
  const { view, path, url, name, ctx } = v;
  const editable = !windowNumber;
  view.innerHTML = '<p class="caption pdfx__wait">Opening the PDF…</p>';
  // The same PDF left a moment ago may still be saving: read it after that.
  await Promise.all([...live].filter((r) => r.path === path).map((r) => r.close()));
  const L = await loadPdfjs();
  const { AnnotationEditorType: T, AnnotationEditorParamsType: P } = L.pdfjs;
  const bytes = new Uint8Array(await (await fetch(url, { cache: 'no-store' })).arrayBuffer());
  if (!v.current()) return true;
  const size = bytes.length;   // pdf.js takes the buffer itself

  const base = new URL('pdfjs/', document.baseURI).href;
  const task = L.pdfjs.getDocument({
    data: bytes,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
  });
  const doc = await task.promise;
  if (!v.current()) { task.destroy(); return true; }

  const tools = { highlight: HIGHLIGHTS[0][1], ink: INKS[0], inkSize: 3, text: INKS[0], textSize: 14, ...(prefs.get('pdfTools') || {}) };
  const remember = () => prefs.set('pdfTools', tools);

  view.innerHTML = `
    <div class="pdfx" data-editable="${editable}">
      <div class="pdfx__bar" role="toolbar" aria-label="PDF tools">
        <div class="pdfx__group pdfx__tools">
          ${tool('select', 'Select and scroll', 'pointer', 'Esc')}
          ${tool('highlight', 'Highlight', 'highlighter', 'H')}
          ${tool('draw', 'Draw', 'draw', 'D')}
          ${tool('text', 'Add text', 'type', 'T')}
          ${act('image', 'Add a picture', 'image')}
          ${act('sign', 'Add your signature', 'signature')}
          ${tool('sticky', 'Sticky note: click where it goes', 'sticky', 'S')}
        </div>
        <div class="pdfx__group pdfx__opts" hidden></div>
        <span class="pdfx__gap"></span>
        <div class="pdfx__group pdfx__tools">
          ${act('undo', 'Undo (Ctrl+Z)', 'undo')}
          ${act('redo', 'Redo (Ctrl+Y)', 'redo')}
        </div>
        <div class="pdfx__group pdfx__nav">
          <input class="pdfx__page" type="text" inputmode="numeric" aria-label="Page" value="1">
          <span class="caption pdfx__pages">of ${doc.numPages}</span>
        </div>
        <div class="pdfx__group">
          ${act('zoomOut', 'Zoom out (Ctrl+-)', 'minus')}
          <select class="pdfx__zoom" aria-label="Zoom">${ZOOMS.map(([val, label]) => `<option value="${val}">${label}</option>`).join('')}<option value="custom" hidden></option></select>
          ${act('zoomIn', 'Zoom in (Ctrl+=)', 'plus')}
        </div>
        <div class="pdfx__group pdfx__find">
          <input class="pdfx__search" type="search" placeholder="Find in PDF" aria-label="Find in PDF">
          <span class="caption pdfx__count"></span>
        </div>
        <span class="caption pdfx__state" aria-live="polite"></span>
        ${act('more', 'More', 'more')}
      </div>
      <div class="pdfx__body"><div class="pdfx__scroll" tabindex="-1"><div class="pdfViewer"></div></div></div>
    </div>`;
  const root = view.querySelector('.pdfx');
  const $ = (s) => root.querySelector(s);
  const scroll = $('.pdfx__scroll');
  const pages = $('.pdfViewer');
  const opts = $('.pdfx__opts');
  const stateEl = $('.pdfx__state');
  const pageIn = $('.pdfx__page');
  const zoomSel = $('.pdfx__zoom');

  const eventBus = new L.EventBus();
  const linkService = new L.PDFLinkService({ eventBus, externalLinkTarget: L.LinkTarget.BLANK });
  const findController = new L.PDFFindController({ eventBus, linkService });
  const viewer = new L.PDFViewer({
    container: scroll,
    viewer: pages,
    eventBus,
    linkService,
    findController,
    annotationEditorMode: editable ? T.NONE : T.DISABLE,
    annotationEditorHighlightColors: HIGHLIGHTS.map(([n, c]) => `${n}=${c}`).join(','),
    enableHighlightFloatingButton: true,
  });
  linkService.setViewer(viewer);
  let ui = null;
  eventBus.on('annotationeditoruimanager', ({ uiManager }) => { ui = uiManager; });

  // ── saving ──────────────────────────────────────────────────────────
  let dirty = false;
  let saving = null;
  let timer = 0;
  const setState = (text) => { stateEl.textContent = text; };
  const setDirty = (on) => {
    if (on === dirty) return;
    dirty = on;
    setUnsaved(`pdf:${path}`, on, name);
  };
  async function save() {
    clearTimeout(timer);
    if (saving) await saving;
    if (!dirty) return true;
    saving = (async () => {
      setState('Saving…');
      // Changes made while this save runs mark it modified again, and save next.
      doc.annotationStorage.resetModified();
      setDirty(false);
      try {
        const data = await doc.saveDocument();
        await call('writePdf', path, await toBase64(data));
        setState('Saved');
        return true;
      } catch (err) {
        setDirty(true);
        setState('Not saved');
        toasts.show({ tone: 'error', text: `Could not save the PDF: ${err.message || err}` });
        return false;
      } finally {
        saving = null;
      }
    })();
    return saving;
  }
  doc.annotationStorage.onSetModified = () => {
    setDirty(true);
    setState('Edited');
    clearTimeout(timer);
    timer = setTimeout(save, saveDelay(size));
  };

  // ── tools ───────────────────────────────────────────────────────────
  let current = 'select';
  const MODES = { select: T.NONE, highlight: T.HIGHLIGHT, draw: T.INK, text: T.FREETEXT, sticky: T.NONE };
  const param = (type, value) => ui?.updateParams(type, value);

  function swatches(list, chosen, onPick) {
    const wrap = document.createElement('span');
    wrap.className = 'pdfx__swatches';
    for (const c of list) {
      const b = document.createElement('button');
      b.className = 'pdfx__swatch';
      b.style.setProperty('--sw', c);
      b.title = c;
      b.setAttribute('aria-label', `Colour ${c}`);
      b.setAttribute('aria-pressed', String(c.toLowerCase() === String(chosen).toLowerCase()));
      b.onclick = () => {
        for (const x of wrap.children) x.setAttribute('aria-pressed', String(x === b));
        onPick(c);
      };
      wrap.appendChild(b);
    }
    return wrap;
  }
  function slider(label, min, max, value, onSet) {
    const l = document.createElement('label');
    l.className = 'pdfx__slider caption';
    l.innerHTML = `<span>${esc(label)}</span><input type="range" min="${min}" max="${max}" step="1" value="${value}">`;
    l.querySelector('input').oninput = (e) => onSet(Number(e.target.value));
    return l;
  }
  function showOptions() {
    opts.replaceChildren();
    if (current === 'highlight') {
      opts.append(swatches(HIGHLIGHTS.map(([, c]) => c), tools.highlight, (c) => { tools.highlight = c; param(P.HIGHLIGHT_COLOR, c); remember(); }));
    } else if (current === 'draw') {
      opts.append(
        swatches(INKS, tools.ink, (c) => { tools.ink = c; param(P.INK_COLOR, c); remember(); }),
        slider('Size', 1, 20, tools.inkSize, (n) => { tools.inkSize = n; param(P.INK_THICKNESS, n); remember(); }),
      );
    } else if (current === 'text') {
      opts.append(
        swatches(INKS, tools.text, (c) => { tools.text = c; param(P.FREETEXT_COLOR, c); remember(); }),
        slider('Size', 8, 48, tools.textSize, (n) => { tools.textSize = n; param(P.FREETEXT_SIZE, n); remember(); }),
      );
    }
    // pdf.js edits a mark with the tool that made it.
    const which = { highlight: 'highlight', draw: 'drawing', text: 'text box' }[current];
    if (which) {
      const hint = document.createElement('span');
      hint.className = 'caption pdfx__hint';
      hint.textContent = `Click a ${which} to move, change or delete it.`;
      opts.append(hint);
    }
    if (current === 'sticky') {
      opts.innerHTML = '<span class="caption">Click on the page where the sticky goes.</span>';
    }
    opts.hidden = !opts.childElementCount;
  }
  async function setTool(id) {
    current = id;
    for (const b of root.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === id));
    root.dataset.tool = id;
    viewer.annotationEditorMode = { mode: MODES[id] };
    // Defaults for what the tool makes next (nothing is selected after a switch).
    await Promise.resolve();
    if (id === 'highlight') param(P.HIGHLIGHT_COLOR, tools.highlight);
    if (id === 'draw') { param(P.INK_COLOR, tools.ink); param(P.INK_THICKNESS, tools.inkSize); }
    if (id === 'text') { param(P.FREETEXT_COLOR, tools.text); param(P.FREETEXT_SIZE, tools.textSize); }
    showOptions();
  }
  for (const b of root.querySelectorAll('[data-tool]')) b.onclick = () => setTool(current === b.dataset.tool ? 'select' : b.dataset.tool);

  // pdf.js asks for these itself (its Highlight button on selected text, the
  // colour picker on a selected mark) and waits for the viewer to do them,
  // which in Firefox is the app around it; here it is this.
  eventBus.on('switchannotationeditormode', (evt) => { viewer.annotationEditorMode = evt; });
  eventBus.on('showannotationeditorui', ({ mode }) => { viewer.annotationEditorMode = { mode }; });
  eventBus.on('switchannotationeditorparams', ({ type, value }) => param(type, value));
  // A mode pdf.js picked shows on the bar.
  eventBus.on('annotationeditormodechanged', ({ mode }) => {
    const id = { [T.HIGHLIGHT]: 'highlight', [T.INK]: 'draw', [T.FREETEXT]: 'text' }[mode];
    if (!id || id === current) return;
    current = id;
    for (const b of root.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === id));
    root.dataset.tool = id;
    showOptions();
  });

  /** A picture (or a signature) on the page in view, ready to move and resize. */
  async function placeImage(file) {
    if (!ui) return;
    await setTool('select');
    const layer = ui.currentLayer;
    if (!layer) return;
    await layer.pasteEditor({ mode: T.STAMP }, { bitmapFile: file });
    root.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    current = 'image';
    root.dataset.tool = 'image';
  }
  function pickImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml';
    input.onchange = () => { if (input.files?.[0]) placeImage(input.files[0]); };
    input.click();
  }

  // Sticky tool: the next click on a page puts a sticky there.
  pages.addEventListener('pointerdown', (e) => {
    if (current !== 'sticky' || !e.target.closest('.page')) return;
    e.preventDefault();
    e.stopPropagation();
    ctx.addSticky?.({ at: e });
    setTool('select');
  }, true);

  // ── the rest of the bar ─────────────────────────────────────────────
  const acts = {
    image: pickImage,
    sign: () => signaturePad({ toasts }).then((file) => file && placeImage(file)),
    undo: () => ui?.undo(),
    redo: () => ui?.redo(),
    zoomIn: () => viewer.increaseScale(),
    zoomOut: () => viewer.decreaseScale(),
    more: async (e, b) => {
      const r = b.getBoundingClientRect();
      const hasOriginal = await call('pdfOriginal', path).catch(() => false);
      const pick = await nativeMenu([
        { id: 1, label: 'Save now\tCtrl+S', disabled: !dirty },
        { id: 2, label: 'Show every highlight', disabled: !ui },
        '-',
        { id: 3, label: 'Restore the original PDF…', disabled: !hasOriginal },
      ], { x: r.left, y: r.bottom });
      if (pick === 1) save();
      if (pick === 2) param(P.HIGHLIGHT_SHOW_ALL, true);
      if (pick === 3) restore();
    },
  };
  for (const b of root.querySelectorAll('[data-act]')) b.onclick = (e) => acts[b.dataset.act]?.(e, b);

  async function restore() {
    const ok = await askConfirm({ title: 'Restore the original PDF?', action: 'Restore' });
    if (!ok) return;
    clearTimeout(timer);
    doc.annotationStorage.resetModified();
    setDirty(false);
    try {
      await call('restorePdf', path);
      toasts.show({ text: 'Back to the original PDF.' });
      v.reopen();
    } catch (err) {
      toasts.show({ tone: 'error', text: err.message });
    }
  }

  pageIn.addEventListener('change', () => {
    const n = Math.min(doc.numPages, Math.max(1, parseInt(pageIn.value, 10) || 1));
    viewer.currentPageNumber = n;
    pageIn.value = String(n);
  });
  pageIn.addEventListener('focus', () => pageIn.select());
  zoomSel.addEventListener('change', () => {
    if (zoomSel.value !== 'custom') viewer.currentScaleValue = zoomSel.value;
    scroll.focus();
  });

  const search = $('.pdfx__search');
  const count = $('.pdfx__count');
  const find = (again, back = false) => eventBus.dispatch('find', {
    source: null, type: again ? 'again' : '', query: search.value, caseSensitive: false,
    entireWord: false, highlightAll: true, findPrevious: back, matchDiacritics: false,
  });
  search.addEventListener('input', () => find(false));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); find(true, e.shiftKey); }
    if (e.key === 'Escape') { search.value = ''; find(false); count.textContent = ''; scroll.focus(); }
  });
  eventBus.on('updatefindmatchescount', ({ matchesCount: m }) => {
    count.textContent = search.value && m?.total ? `${m.current} of ${m.total}` : search.value ? 'none' : '';
  });

  eventBus.on('pagechanging', ({ pageNumber }) => { if (document.activeElement !== pageIn) pageIn.value = String(pageNumber); });
  eventBus.on('scalechanging', ({ presetValue, scale }) => {
    const known = ZOOMS.find(([val]) => val === presetValue || Number(val) === scale);
    const custom = zoomSel.querySelector('[value="custom"]');
    if (known) zoomSel.value = known[0];
    else { custom.textContent = `${Math.round(scale * 100)}%`; zoomSel.value = 'custom'; }
  });

  // Keys while the PDF has focus (typing in a text box is left alone).
  root.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, select, textarea, [contenteditable="true"]');
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); save(); return; }
    if (ctrl && e.key === 'f') { e.preventDefault(); e.stopPropagation(); search.focus(); return; }
    if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); viewer.increaseScale(); return; }
    if (ctrl && e.key === '-') { e.preventDefault(); viewer.decreaseScale(); return; }
    if (typing || ctrl || e.altKey) return;
    const key = { h: 'highlight', d: 'draw', t: 'text', s: 'sticky' }[e.key.toLowerCase()];
    if (key && editable) { e.preventDefault(); e.stopPropagation(); setTool(current === key ? 'select' : key); }
    if (e.key === 'Escape' && current !== 'select') setTool('select');
  });

  // ── stickies, pinned to a spot on a page ───────────────────────────
  const pageAt = (y) => {
    let best = viewer.getPageView(0);
    for (let i = 0; i < doc.numPages; i++) {
      const pv = viewer.getPageView(i);
      if (pv?.div && pv.div.offsetTop <= y) best = pv;
      else break;
    }
    return best;
  };
  ctx.pdf = {
    host: pages,
    toLocal(s) {
      const pv = viewer.getPageView(Math.min(doc.numPages, Math.max(1, s.page || 1)) - 1);
      const d = pv.div;
      // Stickies from before this reader (no page): the top right of page 1.
      const fx = s.page ? s.fx : Math.max(0, 1 - (s.w + 16) / d.clientWidth);
      const fy = s.page ? s.fy : 0.02;
      return { left: d.offsetLeft + fx * d.clientWidth, top: d.offsetTop + fy * d.clientHeight };
    },
    fromLocal(left, top) {
      const d = pageAt(top + 4).div;
      const clamp = (n) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
      return { page: pageAt(top + 4).id, fx: clamp((left - d.offsetLeft) / d.clientWidth), fy: clamp((top - d.offsetTop) / d.clientHeight) };
    },
    fromClient(x, y) {
      const r = pages.getBoundingClientRect();
      return this.fromLocal(x - r.left, y - r.top);
    },
    /** Where a new sticky goes when nobody said: the right of the page in view. */
    visibleSpot(w) {
      const top = scroll.scrollTop + 48;
      const d = pageAt(top).div;
      return this.fromLocal(d.offsetLeft + d.clientWidth - w - 24, Math.max(d.offsetTop + 16, top));
    },
  };

  // ── open it ─────────────────────────────────────────────────────────
  const remembered = prefs.get('pdfPlaces')?.[path];
  eventBus.on('pagesinit', () => {
    viewer.currentScaleValue = remembered?.zoom || 'page-width';
    if (remembered?.page > 1) viewer.currentPageNumber = Math.min(doc.numPages, remembered.page);
    ctx.restick?.();
    if (editable) setTool('select');
    else setState('View only here; mark it up in the main window');
  });
  viewer.setDocument(doc);
  linkService.setDocument(doc);

  // Where you were, for next time: the page and the zoom.
  const keepPlace = () => {
    const all = { ...(prefs.get('pdfPlaces') || {}) };
    const zoom = viewer.currentScaleValue;
    all[path] = { page: viewer.currentPageNumber, zoom: /^\d/.test(String(zoom)) ? String(viewer.currentScale) : zoom };
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k];
    prefs.set('pdfPlaces', all);
  };

  // Leaving the PDF (another note, closing the tab), or the same PDF opening
  // again: save, then let go. Closing twice is the same close.
  let closing = null;
  const me = {
    path,
    save,
    close: () => closing ||= (async () => {
      clearInterval(watch);
      if (!windowNumber) keepPlace();
      const ok = await save();
      viewer.setDocument(null);
      task.destroy();
      live.delete(me);
      return ok;
    })(),
  };
  live.add(me);
  const watch = setInterval(() => { if (!root.isConnected) me.close(); }, 400);
  return true;
}

/** A pad to sign on with the mouse or a pen; the last signature is kept
 *  (in this PC's app data, never in the notes) for next time. Resolves to a
 *  PNG File of just the ink, or null. */
function signaturePad({ toasts }) {
  return new Promise((resolve) => {
    let saved = '';
    try { saved = localStorage.getItem('pn-signature') || ''; } catch { /* private window */ }
    const scrim = document.createElement('div');
    scrim.className = 'dialog-scrim';
    scrim.innerHTML = `
      <div class="dialog sigpad" role="dialog" aria-modal="true" aria-label="Your signature">
        <h2 class="dialog__title">Your signature</h2>
        <p class="caption">Sign in the box with your mouse, trackpad or pen.</p>
        <canvas class="sigpad__pad" width="1040" height="360"></canvas>
        <div class="sigpad__row">
          <label class="caption sigpad__keep"><input type="checkbox" checked> Remember it on this PC</label>
          <span class="pdfx__gap"></span>
          ${saved ? '<button class="btn btn--ghost" data-act="last">Use my last one</button>' : ''}
          <button class="btn btn--ghost" data-act="clear">Clear</button>
          <button class="btn btn--secondary" data-act="cancel">Cancel</button>
          <button class="btn" data-act="use">Add it</button>
        </div>
      </div>`;
    document.body.appendChild(scrim);
    const pad = scrim.querySelector('canvas');
    const g = pad.getContext('2d');
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#1F1F1F';
    let inked = false;
    let last = null;
    const at = (e) => {
      const r = pad.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (pad.width / r.width), y: (e.clientY - r.top) * (pad.height / r.height), p: e.pressure || 0.5 };
    };
    pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); last = at(e); inked = true; });
    pad.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = at(e);
      g.lineWidth = 2.5 + p.p * 4;
      g.beginPath();
      g.moveTo(last.x, last.y);
      g.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2);
      g.lineTo(p.x, p.y);
      g.stroke();
      last = p;
    });
    const stop = () => { last = null; };
    pad.addEventListener('pointerup', stop);
    pad.addEventListener('pointercancel', stop);

    const close = (file) => { scrim.remove(); document.removeEventListener('keydown', onKey, true); resolve(file); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey, true);

    /** Just the ink, cropped, as a PNG. */
    const cropped = () => {
      const { data, width, height } = g.getImageData(0, 0, pad.width, pad.height);
      let x0 = width, y0 = height, x1 = -1, y1 = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) return null;
      const m = 8;
      const out = document.createElement('canvas');
      out.width = x1 - x0 + 1 + 2 * m;
      out.height = y1 - y0 + 1 + 2 * m;
      out.getContext('2d').drawImage(pad, x0 - m, y0 - m, out.width, out.height, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    };
    const fileOf = async (dataUrl) => new File([await (await fetch(dataUrl)).blob()], 'signature.png', { type: 'image/png' });

    scrim.querySelector('[data-act="clear"]').onclick = () => { g.clearRect(0, 0, pad.width, pad.height); inked = false; };
    scrim.querySelector('[data-act="cancel"]').onclick = () => close(null);
    scrim.querySelector('[data-act="last"]')?.addEventListener('click', async () => close(await fileOf(saved)));
    scrim.querySelector('[data-act="use"]').onclick = async () => {
      const png = inked && cropped();
      if (!png) { toasts.show({ text: 'Sign in the box first.' }); return; }
      try {
        if (scrim.querySelector('.sigpad__keep input').checked) localStorage.setItem('pn-signature', png);
        else localStorage.removeItem('pn-signature');
      } catch { /* not remembered, that is all */ }
      close(await fileOf(png));
    };
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(null); });
  });
}
