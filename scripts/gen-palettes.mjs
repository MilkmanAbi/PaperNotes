#!/usr/bin/env node
// Builds the colour themes from one table: src/styles/palettes.css (every
// token PaperNotes uses, for each theme's light and dark variant) and
// src/core/palettes.js (names and swatches for the theme picker).
//
//   node scripts/gen-palettes.mjs
//
// A theme only names its base colours; everything else (hover, muted and
// faint accents, hairlines, rules, the note colours, the confused red) is
// derived here, so every theme covers the whole app the same way.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// bg: canvas (gutters, page), raised (panels, the note sheet), sunken (inputs, code)
// fg: primary, secondary, tertiary text
// c:  red orange yellow green blue purple cyan
const T = (bg, fg, accent, c) => ({ bg, fg, accent, c });
const PALETTES = [
  { id: 'paper', name: 'Paper', note: 'The original: warm paper and olive ink' },
  {
    id: 'sakura', name: 'Sakura', note: 'Soft pastel pinks, very calm',
    light: T(['#f9eef2', '#fffafb', '#f3e2e9'], ['#4a3840', '#7a6670', '#a8949d'], '#cc5f88',
      ['#d24f6c', '#d9824f', '#b8932a', '#5f9b72', '#6787c9', '#9b6cbf', '#3f9e9a']),
    dark: T(['#1d171a', '#261f23', '#161114'], ['#f3e5eb', '#c9b4bd', '#8d7a83'], '#f2a0bd',
      ['#f07c93', '#f0a87f', '#e8cf7a', '#9dcfa9', '#a1b8ee', '#caa4e7', '#8bd2ce']),
  },
  {
    id: 'ocean', name: 'Ocean', note: 'Soft pastel blues',
    light: T(['#eef5fa', '#fafdff', '#e1edf6'], ['#223646', '#566f80', '#8ea3b2'], '#3f87c0',
      ['#cc5f6a', '#d48a56', '#b99c36', '#469a86', '#3f87c0', '#8476c6', '#2f9eb1']),
    dark: T(['#111b23', '#16232d', '#0c141a'], ['#dae8f2', '#a3bac9', '#6b8393'], '#80c1ee',
      ['#ef8c95', '#f0b17f', '#e6cf80', '#8fd3bf', '#80c1ee', '#b7aaf0', '#79d3e0']),
  },
  {
    id: 'deep-ocean', name: 'Deep Ocean', note: 'Teal and navy, the deep end',
    light: T(['#e6f1f1', '#f6fbfb', '#d5e8e8'], ['#0e3240', '#3d6370', '#7898a2'], '#00808c',
      ['#c64758', '#cd7a3c', '#a88a1f', '#1f8a6a', '#2a6fb0', '#6f5fb6', '#00808c']),
    dark: T(['#06161f', '#0a2230', '#031018'], ['#cfe7ee', '#8eb2bc', '#557884'], '#33c6cb',
      ['#ff7b8a', '#ffad73', '#f2d27a', '#5fd4a5', '#68aef5', '#a998f2', '#33c6cb']),
  },
  {
    id: 'darker', name: 'Darker', note: 'Graphite and near-black, high contrast',
    light: T(['#e8e8ea', '#ffffff', '#dcdcdf'], ['#0b0b0c', '#3d3d42', '#73737b'], '#1d4ed8',
      ['#c42b2b', '#c25d12', '#a07800', '#18803c', '#1d4ed8', '#7a35c9', '#0e7f8f']),
    dark: T(['#050506', '#0e0e10', '#000000'], ['#ececee', '#a8a8b0', '#6a6a72'], '#8ab4ff',
      ['#ff6b6b', '#ffa45c', '#f2d36b', '#6fdc8c', '#8ab4ff', '#c79bff', '#5fd7e6']),
  },
  {
    id: 'gruvbox', name: 'Gruvbox', note: 'Retro groove, warm and earthy',
    light: T(['#f2e5bc', '#fbf1c7', '#ebdbb2'], ['#3c3836', '#504945', '#7c6f64'], '#af3a03',
      ['#9d0006', '#af3a03', '#b57614', '#79740e', '#076678', '#8f3f71', '#427b58']),
    dark: T(['#1d2021', '#282828', '#171a1a'], ['#ebdbb2', '#d5c4a1', '#a89984'], '#fe8019',
      ['#fb4934', '#fe8019', '#fabd2f', '#b8bb26', '#83a598', '#d3869b', '#8ec07c']),
  },
  {
    id: 'solarized', name: 'Solarized', note: 'The precise classic',
    light: T(['#eee8d5', '#fdf6e3', '#e6dfc8'], ['#586e75', '#657b83', '#93a1a1'], '#268bd2',
      ['#dc322f', '#cb4b16', '#b58900', '#859900', '#268bd2', '#6c71c4', '#2aa198']),
    dark: T(['#00212b', '#002b36', '#001a22'], ['#a7b5b5', '#93a1a1', '#5f7a82'], '#268bd2',
      ['#dc322f', '#cb4b16', '#b58900', '#859900', '#268bd2', '#6c71c4', '#2aa198']),
  },
  {
    id: 'nord', name: 'Nord', note: 'Arctic, north-bluish calm',
    light: T(['#e5e9f0', '#eceff4', '#d8dee9'], ['#2e3440', '#3b4252', '#6b7486'], '#5e81ac',
      ['#bf616a', '#c5714d', '#b8912f', '#6f9459', '#5e81ac', '#9a6f97', '#4f9a98']),
    dark: T(['#272c36', '#2e3440', '#21252e'], ['#eceff4', '#d8dee9', '#8a93a6'], '#88c0d0',
      ['#bf616a', '#d08770', '#ebcb8b', '#a3be8c', '#81a1c1', '#b48ead', '#8fbcbb']),
  },
  {
    id: 'dracula', name: 'Dracula', note: 'Dracula by night, Alucard by day',
    light: T(['#f5f0dc', '#fffbeb', '#ece6cd'], ['#1f1f1f', '#4a4636', '#6c664b'], '#644ac9',
      ['#cb3a2a', '#a34d14', '#846e15', '#14710a', '#036a96', '#644ac9', '#a3144d']),
    dark: T(['#21222c', '#282a36', '#1b1c24'], ['#f8f8f2', '#c5c8d8', '#6f7bb0'], '#bd93f9',
      ['#ff5555', '#ffb86c', '#f1fa8c', '#50fa7b', '#8be9fd', '#bd93f9', '#ff79c6']),
  },
  {
    id: 'catppuccin', name: 'Catppuccin', note: 'Latte and Mocha, soothing pastels',
    light: T(['#e6e9ef', '#eff1f5', '#dce0e8'], ['#4c4f69', '#5c5f77', '#8c8fa1'], '#8839ef',
      ['#d20f39', '#fe640b', '#df8e1d', '#40a02b', '#1e66f5', '#8839ef', '#179299']),
    dark: T(['#181825', '#1e1e2e', '#11111b'], ['#cdd6f4', '#bac2de', '#7f849c'], '#cba6f7',
      ['#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#89b4fa', '#cba6f7', '#94e2d5']),
  },
  {
    id: 'tokyo-night', name: 'Tokyo Night', note: 'Neon city, Day and Night',
    light: T(['#d5d6db', '#e1e2e7', '#cbccd1'], ['#343b58', '#4c5374', '#7c82a4'], '#2e7de9',
      ['#f52a65', '#b15c00', '#8c6c3e', '#587539', '#2e7de9', '#9854f1', '#007197']),
    dark: T(['#16161e', '#1a1b26', '#121219'], ['#c0caf5', '#a9b1d6', '#565f89'], '#7aa2f7',
      ['#f7768e', '#ff9e64', '#e0af68', '#9ece6a', '#7aa2f7', '#bb9af7', '#7dcfff']),
  },
  {
    id: 'rose-pine', name: 'Rosé Pine', note: 'Dawn and Main, all natural pine',
    light: T(['#f2e9e1', '#fffaf3', '#faf4ed'], ['#575279', '#797593', '#9893a5'], '#d7827e',
      ['#b4637a', '#d7827e', '#ea9d34', '#286983', '#56949f', '#907aa9', '#56949f']),
    dark: T(['#16141f', '#191724', '#12101a'], ['#e0def4', '#908caa', '#6e6a86'], '#ebbcba',
      ['#eb6f92', '#ebbcba', '#f6c177', '#31748f', '#9ccfd8', '#c4a7e7', '#9ccfd8']),
  },
  {
    id: 'everforest', name: 'Everforest', note: 'Green, warm, easy on the eyes',
    light: T(['#efebd4', '#fdf6e3', '#f4f0d9'], ['#5c6a72', '#708089', '#a6b0a0'], '#8da101',
      ['#f85552', '#f57d26', '#dfa000', '#8da101', '#3a94c5', '#df69ba', '#35a77c']),
    dark: T(['#232a2e', '#2d353b', '#1e2326'], ['#d3c6aa', '#9da9a0', '#7a8478'], '#a7c080',
      ['#e67e80', '#e69875', '#dbbc7f', '#a7c080', '#7fbbb3', '#d699b6', '#83c092']),
  },
  {
    id: 'kanagawa', name: 'Kanagawa', note: 'The Great Wave: Wave and Lotus',
    light: T(['#e7dba0', '#f2ecbc', '#e5ddb0'], ['#545464', '#43436c', '#8a8980'], '#4d699b',
      ['#c84053', '#cc6d00', '#77713f', '#6f894e', '#4d699b', '#624c83', '#597b75']),
    dark: T(['#16161d', '#1f1f28', '#13131a'], ['#dcd7ba', '#c8c093', '#727169'], '#7e9cd8',
      ['#e46876', '#ffa066', '#e6c384', '#98bb6c', '#7e9cd8', '#957fb8', '#7aa89f']),
  },
  {
    id: 'one', name: 'One', note: 'One Light and One Dark, from Atom',
    light: T(['#f0f0f1', '#fafafa', '#e5e5e6'], ['#383a42', '#4f525e', '#a0a1a7'], '#4078f2',
      ['#e45649', '#986801', '#c18401', '#50a14f', '#4078f2', '#a626a4', '#0184bc']),
    dark: T(['#21252b', '#282c34', '#1b1e23'], ['#abb2bf', '#9da5b4', '#5c6370'], '#61afef',
      ['#e06c75', '#d19a66', '#e5c07b', '#98c379', '#61afef', '#c678dd', '#56b6c2']),
  },
];

// ── colour helpers ─────────────────────────────────────────────────────
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const lum = (h) => {
  const [r, g, b] = hex(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const alpha = (h, a) => { const [r, g, b] = hex(h); return `rgb(${r} ${g} ${b} / ${a})`; };

function tokens(v, dark) {
  const [canvas, raised, sunken] = v.bg;
  const [ink, ink2, ink3] = v.fg;
  const [red, orange, yellow, green, blue, purple, cyan] = v.c;
  const onAccent = lum(v.accent) > 0.36 ? (dark ? canvas : '#111111') : '#ffffff';
  return {
    '--surface-canvas': canvas,
    '--surface-raised': raised,
    '--surface-sunken': sunken,
    '--surface-scrim': alpha(dark ? '#000000' : ink, dark ? 0.5 : 0.3),
    '--ink-primary': ink,
    '--ink-secondary': ink2,
    '--ink-tertiary': ink3,
    '--ink-on-accent': onAccent,
    '--accent': v.accent,
    '--accent-hover': mix(v.accent, dark ? '#ffffff' : '#000000', 0.12),
    '--accent-muted': alpha(v.accent, dark ? 0.24 : 0.18),
    '--accent-faint': alpha(v.accent, dark ? 0.1 : 0.07),
    '--tone-sage': green,
    '--tone-ochre': yellow,
    '--tone-brick': red,
    '--tone-slate': blue,
    '--tone-plum': purple,
    '--hairline': alpha(ink3, dark ? 0.32 : 0.4),
    '--hairline-strong': alpha(ink3, dark ? 0.5 : 0.62),
    '--rule-line': alpha(ink, 0.05),
    '--elevation-1': dark ? '0 1px 2px rgb(0 0 0 / 0.45), 0 1px 1px rgb(0 0 0 / 0.3)' : `0 1px 2px ${alpha(ink, 0.08)}, 0 1px 1px ${alpha(ink, 0.04)}`,
    '--elevation-2': dark ? '0 8px 24px rgb(0 0 0 / 0.55)' : `0 8px 24px ${alpha(ink, 0.16)}`,
    '--confused': red,
    '--confused-bg': alpha(red, dark ? 0.14 : 0.1),
    // ANSI colours for the terminal (read by src/desktop/terminal.js)
    '--term-red': red, '--term-green': green, '--term-yellow': yellow, '--term-blue': blue,
    '--term-magenta': purple, '--term-cyan': cyan, '--term-orange': orange,
  };
}

function noteTokens(v, dark) {
  const [, , ink3] = v.fg;
  const [red, orange, yellow, green, blue, purple, cyan] = v.c;
  return {
    '--n-red': red, '--n-orange': orange, '--n-green': green, '--n-blue': blue,
    '--n-purple': purple, '--n-teal': cyan, '--n-grey': ink3,
    '--n-hl': alpha(yellow, dark ? 0.32 : 0.45),
    '--n-tint': dark ? '13%' : '9%',
  };
}

const block = (sel, map) => `${sel} {\n${Object.entries(map).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;

let css = `/* Generated by scripts/gen-palettes.mjs: edit the table there, not this file.
   Each theme has a light and a dark variant; the theme setting (light, dark,
   follow Windows) picks between them exactly as it does for Paper. */\n\n`;
for (const p of PALETTES) {
  if (!p.light) continue;
  const sel = `:root[data-palette="${p.id}"]`;
  css += `/* ── ${p.name} ── */\n`;
  css += block(`${sel}, ${sel}[data-theme="light"]`, tokens(p.light, false));
  css += block(`${sel} .note-content, ${sel}[data-theme="light"] .note-content`, noteTokens(p.light, false));
  css += block(`${sel}[data-theme="dark"]`, tokens(p.dark, true));
  css += block(`${sel}[data-theme="dark"] .note-content`, noteTokens(p.dark, true));
  css += `@media (prefers-color-scheme: dark) {\n${block(`  ${sel}:not([data-theme="light"])`, tokens(p.dark, true)).replace(/\n {2}(?=--)/g, '\n    ')}${block(`  ${sel}:not([data-theme="light"]) .note-content`, noteTokens(p.dark, true)).replace(/\n {2}(?=--)/g, '\n    ')}}\n\n`;
}
fs.writeFileSync(path.join(ROOT, 'src/styles/palettes.css'), css);

const list = PALETTES.map((p) => ({
  id: p.id, name: p.name, note: p.note,
  light: p.light ? [p.light.bg[1], p.light.bg[0], p.light.fg[0], p.light.accent, ...p.light.c.slice(0, 5)] : ['#faf7f0', '#efeae0', '#24211c', '#4e6336', '#a85448', '#9a7a3c', '#7d7240', '#4e7a5e', '#56708a'],
  dark: p.dark ? [p.dark.bg[1], p.dark.bg[0], p.dark.fg[0], p.dark.accent, ...p.dark.c.slice(0, 5)] : ['#26231f', '#1c1a17', '#ece8e0', '#a7c07c', '#c9877c', '#bfa678', '#bfa678', '#7fbf9a', '#90a8c4'],
}));
fs.writeFileSync(path.join(ROOT, 'src/core/palettes.js'),
  `/** Generated by scripts/gen-palettes.mjs. Swatches: [raised, canvas, ink, accent, red, orange, yellow, green, blue]. */\nexport const PALETTES = ${JSON.stringify(list, null, 1)};\n`);
console.log(`wrote ${PALETTES.length} themes`);
