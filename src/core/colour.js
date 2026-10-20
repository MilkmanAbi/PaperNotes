/** Colour maths shared by the theme generator (scripts/gen-palettes.mjs)
 *  and the custom theme built at runtime (src/ui/custom-theme.js), so a
 *  colour picked in Settings is derived exactly like a built-in theme's. */

export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
export const lum = (h) => {
  const [r, g, b] = hex(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const alpha = (h, a) => { const [r, g, b] = hex(h); return `rgb(${r} ${g} ${b} / ${a})`; };
/** WCAG contrast ratio between two colours. */
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
export const isHex = (s) => /^#[0-9a-f]{6}$/i.test(String(s || ''));

/** The accent family of a theme: what a single picked colour expands into.
 *  `canvas` is the page colour, used as the text on a light accent in dark mode. */
export function accentTokens(accent, dark, canvas) {
  const onAccent = lum(accent) > 0.36 ? (dark ? canvas : '#111111') : '#ffffff';
  return {
    '--ink-on-accent': onAccent,
    '--accent': accent,
    '--accent-hover': mix(accent, dark ? '#ffffff' : '#000000', 0.12),
    '--accent-muted': alpha(accent, dark ? 0.24 : 0.18),
    '--accent-faint': alpha(accent, dark ? 0.1 : 0.07),
  };
}

/** The highlighter (==text==) colour from one picked colour. */
export const highlightToken = (colour, dark) => alpha(colour, dark ? 0.32 : 0.45);
