/** Settings → Appearance and Reading, the richer pickers:
 *  - the Custom theme: a base theme, your accent and highlighter, and a
 *    small live preview of the app in light and dark
 *  - the typeface pickers for note text, headings and code (src/core/fonts.js) */

import { PALETTES } from '../core/palettes.js';
import { customOf, darkAccent, CUSTOM_DEFAULT } from '../core/custom-theme.js';
import { alpha, contrast, lum } from '../core/colour.js';
import { FONTS, FONT_GROUPS, fontById, isInstalled, textFontOf } from '../core/fonts.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── custom theme ─────────────────────────────────────────────────────────
const ACCENTS = ['#3f7fd1', '#2f9e8f', '#4e7a3a', '#b8860b', '#d9692a', '#d04a4a', '#c2477f', '#8a5cc7', '#5b5fc7', '#0e8fb3', '#6b6f78', '#9a6b3d'];
const HIGHLIGHTS = ['#f2c94c', '#a3d977', '#7cc4f2', '#f2a0c4', '#c3a6f2', '#f4b46a', '#f28b82', '#7fded2'];

/** The two halves of a theme card (and of the bigger preview): light and dark. */
function swatchesFor(c) {
  const base = PALETTES.find((p) => p.id === c.base) || PALETTES[0];
  return {
    light: { raised: base.light[0], canvas: base.light[1], ink: base.light[2], accent: c.accent, blue: base.light[8], hl: alpha(c.highlight, 0.45) },
    dark: { raised: base.dark[0], canvas: base.dark[1], ink: base.dark[2], accent: darkAccent(c.accent), blue: base.dark[8], hl: alpha(c.highlight, 0.32) },
  };
}
const onAccent = (accent, canvas, dark) => (lum(accent) > 0.36 ? (dark ? canvas : '#111111') : '#ffffff');

/** The card in the theme grid for the custom theme. */
export function customCard(prefs, onPick) {
  const c = customOf(prefs.state);
  const s = swatchesFor(c);
  const half = (v) => `<span class="theme-card__half" style="background:${v.canvas}"><span class="theme-card__sheet" style="background:${v.raised};color:${v.ink}">
    <i style="background:${v.ink}"></i><i style="background:${v.ink};opacity:.45"></i><b style="background:${v.accent}"></b>
    <span class="theme-card__dots"><em style="background:${v.hl}"></em><em style="background:${v.accent}"></em></span></span></span>`;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'theme-card theme-card--custom';
  b.setAttribute('aria-pressed', String(prefs.get('palette') === 'custom'));
  b.innerHTML = `<span class="theme-card__preview">${half(s.light)}${half(s.dark)}</span>
    <span class="theme-card__name">Custom</span><span class="theme-card__note">Your accent and highlighter, on any theme</span>`;
  b.onclick = () => {
    if (!prefs.get('customTheme')) {
      const current = prefs.get('palette');
      prefs.set('customTheme', { ...CUSTOM_DEFAULT, base: PALETTES.some((p) => p.id === current) ? current : 'paper' });
    }
    prefs.set('palette', 'custom');
    onPick?.();
  };
  return b;
}

/** A small mock of the app, in the custom colours, light and dark side by side. */
function miniPreview(c) {
  const s = swatchesFor(c);
  const win = (v, dark, label) => `
    <div class="tprev" style="--tp-canvas:${v.canvas};--tp-raised:${v.raised};--tp-ink:${v.ink};--tp-accent:${v.accent};--tp-on:${onAccent(v.accent, v.canvas, dark)};--tp-hl:${v.hl};--tp-blue:${v.blue}">
      <div class="tprev__label">${label}</div>
      <div class="tprev__app">
        <div class="tprev__side"><i></i><i class="is-on"></i><i></i><i></i><i></i></div>
        <div class="tprev__sheet">
          <div class="tprev__h">Week 2 notes</div>
          <p>Contamination is the <span class="tprev__link">real problem</span>: about <mark>40% of the blue bin</mark> cannot be recycled.</p>
          <div class="tprev__callout"><b>Key idea</b><span>Fix the bin, not just the poster.</span></div>
          <div class="tprev__row"><span class="tprev__btn">Done</span><span class="tprev__check">${icon('check')}</span><span class="tprev__tag">#exam</span></div>
        </div>
      </div>
    </div>`;
  const el = document.createElement('div');
  el.className = 'tprev-pair';
  el.innerHTML = win(s.light, false, 'Light') + win(s.dark, true, 'Dark');
  return el;
}

function swatchRow(colours, value, onPick, label) {
  const wrap = document.createElement('div');
  wrap.className = 'swatches';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', label);
  const paint = (v) => {
    for (const b of wrap.querySelectorAll('.swatch')) b.setAttribute('aria-checked', String(b.dataset.c === v.toLowerCase()));
    pick.value = v;
  };
  for (const col of colours) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.c = col;
    b.style.background = col;
    b.setAttribute('role', 'radio');
    b.title = col;
    b.onclick = () => { paint(col); onPick(col); };
    wrap.appendChild(b);
  }
  const own = document.createElement('label');
  own.className = 'swatch swatch--own';
  own.title = 'Pick any colour';
  own.innerHTML = `${icon('palette')}<input type="color" aria-label="${esc(label)}: any colour">`;
  const pick = own.querySelector('input');
  pick.oninput = () => { paint(pick.value); onPick(pick.value); };
  wrap.appendChild(own);
  paint(value);
  return wrap;
}

/** Shown under the theme grid while the custom theme is on. */
export function customPanel(prefs, row) {
  const panel = document.createElement('div');
  panel.className = 'custom-theme';
  let c = customOf(prefs.state);
  const preview = document.createElement('div');
  const warn = document.createElement('p');
  warn.className = 'custom-theme__warn caption';
  const update = (patch) => {
    c = { ...c, ...patch };
    prefs.set('customTheme', { base: c.base, accent: c.accent, highlight: c.highlight });
    preview.replaceChildren(miniPreview(c));
    const base = PALETTES.find((p) => p.id === c.base);
    const low = contrast(c.accent, base.light[0]) < 3;
    warn.textContent = low ? 'This accent is hard to see on light pages: buttons and links may be faint. A deeper shade reads better.' : '';
    warn.hidden = !low;
  };

  const select = document.createElement('select');
  select.className = 'select';
  select.innerHTML = PALETTES.map((p) => `<option value="${p.id}"${p.id === c.base ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  select.onchange = () => update({ base: select.value });

  panel.append(
    row('Start from', 'The pages, text and colours of this theme, with your accent and highlighter on top.', select),
    row('Accent', 'Buttons, links, the selected note, ticks and focus. Dark mode lifts it automatically.', swatchRow(ACCENTS, c.accent, (v) => update({ accent: v }), 'Accent colour')),
    row('Highlighter', 'What ==highlighted text== is marked with.', swatchRow(HIGHLIGHTS, c.highlight, (v) => update({ highlight: v }), 'Highlighter colour')),
    preview,
    warn,
  );
  update({});
  return panel;
}

// ── typefaces ────────────────────────────────────────────────────────────
const SAMPLE = 'The quick brown fox jumps over the lazy dog. 0123456789';

/**
 * A button showing the current font that opens a searchable list.
 * @param {'text'|'heading'|'code'} kind
 */
export function fontPicker(prefs, kind) {
  const key = { text: 'fontText', heading: 'fontHeading', code: 'fontCode' }[kind];
  const extra = kind === 'heading' ? [{ id: 'same', name: 'Same as the text', stack: 'var(--note-font, var(--font-reading))', note: '' }]
    : kind === 'code' ? [{ id: 'default', name: 'PaperNotes default', stack: 'var(--font-data)', note: 'JetBrains Mono, Cascadia or Consolas' }] : [];
  const list = kind === 'code' ? FONTS.filter((f) => f.mono) : FONTS;
  const current = () => (kind === 'text' ? textFontOf(prefs.state) : prefs.get(key));
  const find = (id) => extra.find((x) => x.id === id) || fontById(id) || extra[0] || fontById('paper-serif');

  const wrap = document.createElement('div');
  wrap.className = 'fontpick';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--secondary fontpick__current';
  const paintButton = () => {
    const f = find(current());
    button.innerHTML = `<span style="font-family:${esc(f.stack)}">${esc(f.name)}</span>${icon('chevronDown')}`;
  };
  paintButton();

  const panel = document.createElement('div');
  panel.className = 'fontpick__panel';
  panel.hidden = true;
  button.onclick = () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden && !panel.childElementCount) build();
    if (!panel.hidden) panel.querySelector('input')?.focus();
  };

  function build() {
    panel.innerHTML = `<div class="fontpick__top"><input type="search" class="input fontpick__search" placeholder="Search ${list.length + extra.length} fonts…" aria-label="Search fonts">
      <div class="fontpick__sample note-content"><b>Heading in this font</b><span>${SAMPLE}</span></div></div><div class="fontpick__list" role="listbox"></div>`;
    const listEl = panel.querySelector('.fontpick__list');
    const sample = panel.querySelector('.fontpick__sample');
    const showSample = (f) => { sample.style.fontFamily = f.stack; sample.querySelector('b').textContent = f.name; };
    const items = [];
    const groups = kind === 'code' ? [['', '']] : FONT_GROUPS;
    for (const [gid, glabel] of groups) {
      const fonts = gid === '' && kind === 'code' ? [...extra, ...list] : [...(gid === 'top' ? extra : []), ...list.filter((f) => f.group === gid)];
      if (!fonts.length) continue;
      if (glabel) listEl.insertAdjacentHTML('beforeend', `<div class="fontpick__group" data-group="${gid}">${esc(glabel)}</div>`);
      for (const f of fonts) {
        const missing = f.kind === 'system' && !isInstalled(f.family);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fontpick__item';
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', String(f.id === current()));
        b.dataset.search = `${f.name} ${f.note} ${glabel}`.toLowerCase();
        b.dataset.group = gid;
        b.disabled = missing;
        b.innerHTML = `<span class="fontpick__name" style="font-family:${esc(f.stack)}">${esc(f.name)}</span>
          <span class="fontpick__note">${missing ? 'Not on this PC' : esc(f.note)}</span>`;
        b.onmouseenter = () => showSample(f);
        b.onfocus = () => showSample(f);
        b.onclick = () => {
          prefs.set(key, f.id);
          if (kind === 'text') prefs.set('readerFont', f.id === 'paper-sans' ? 'sans' : 'serif');
          for (const x of items) x.setAttribute('aria-selected', String(x === b));
          paintButton();
        };
        items.push(b);
        listEl.appendChild(b);
      }
    }
    showSample(find(current()));
    panel.querySelector('input').oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const b of items) b.hidden = Boolean(q) && !b.dataset.search.includes(q);
      for (const g of listEl.querySelectorAll('.fontpick__group')) {
        g.hidden = !items.some((b) => !b.hidden && b.dataset.group === g.dataset.group);
      }
    };
  }

  wrap.append(button, panel);
  return wrap;
}
