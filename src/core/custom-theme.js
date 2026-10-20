/** The Custom theme: any built-in theme as the base, with your own accent
 *  (buttons, links, the selected row, focus rings) and highlighter colour.
 *
 *  The accent expands into its family exactly as a built-in theme's does
 *  (src/core/colour.js is shared with scripts/gen-palettes.mjs). Dark mode
 *  gets a lighter accent automatically, so a deep colour picked on a light
 *  page still reads on a dark one. */

import { PALETTES } from './palettes.js';
import { accentTokens, highlightToken, mix, lum, isHex } from './colour.js';

export const CUSTOM_DEFAULT = { base: 'paper', accent: '#3f7fd1', highlight: '#f2c94c' };

export function customOf(state) {
  const c = { ...CUSTOM_DEFAULT, ...(state.customTheme || {}) };
  if (!PALETTES.some((p) => p.id === c.base)) c.base = 'paper';
  if (!isHex(c.accent)) c.accent = CUSTOM_DEFAULT.accent;
  if (!isHex(c.highlight)) c.highlight = CUSTOM_DEFAULT.highlight;
  return c;
}

/** The accent used on dark pages: the same hue, lifted until it reads. */
export function darkAccent(accent) {
  return lum(accent) < 0.18 ? mix(accent, '#ffffff', 0.38) : lum(accent) < 0.3 ? mix(accent, '#ffffff', 0.2) : accent;
}

/** Light and dark token sets for a custom theme. */
export function customTokens(c) {
  const base = PALETTES.find((p) => p.id === c.base);
  const light = { ...accentTokens(c.accent, false, base.light[1]) };
  const dark = { ...accentTokens(darkAccent(c.accent), true, base.dark[1]) };
  return { light, dark, hlLight: highlightToken(c.highlight, false), hlDark: highlightToken(c.highlight, true) };
}

const block = (sel, map) => `${sel} {${Object.entries(map).map(([k, v]) => `${k}:${v}`).join(';')}}`;

/** Called by Prefs.apply(): turn the custom theme on or off on the page. */
export function applyCustomTheme(state, root = document.documentElement) {
  let style = document.getElementById('pn-custom-theme');
  if (state.palette !== 'custom') {
    root.removeAttribute('data-custom');
    style?.remove();
    return;
  }
  const c = customOf(state);
  root.setAttribute('data-palette', c.base);
  root.setAttribute('data-custom', 'on');
  const t = customTokens(c);
  const L = ':root[data-custom="on"]:not([data-theme="dark"])';
  const D = ':root[data-custom="on"][data-theme="dark"]';
  const S = ':root[data-custom="on"]:not([data-theme="light"])';
  const css = [
    block(L, t.light), block(`${L} .note-content`, { '--n-hl': t.hlLight }),
    block(D, t.dark), block(`${D} .note-content`, { '--n-hl': t.hlDark }),
    `@media (prefers-color-scheme: dark) {${block(S, t.dark)}${block(`${S} .note-content`, { '--n-hl': t.hlDark })}}`,
  ].join('\n');
  if (!style) {
    style = document.createElement('style');
    style.id = 'pn-custom-theme';
    document.head.appendChild(style);   // last in the cascade, after every theme
  }
  if (style.textContent !== css) style.textContent = css;
}
