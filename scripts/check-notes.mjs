#!/usr/bin/env node
// Renders every note under content/ the way the site does and reports what
// went wrong: equations KaTeX refused, equations that came out empty, and
// study-notes markup that survived to the page as literal text.
//
//   node scripts/check-notes.mjs [--content content] [--only "01 Study"]

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { renderNote } from '../src/core/markdown.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const CONTENT = path.resolve(flag('content', 'content'));
const ONLY = flag('only', '');

const CHECKS = [
  ['maths error', /class="katex-error"[^>]*>([^<]{0,60})/g],
  ['empty maths', /<annotation encoding="application\/x-tex"><\/annotation>/g],
  ['literal {x:…}', /\{[rogbpk]:[^}\n]{0,40}\}/g],
  ['literal [!callout]', /\[![a-z]+(?:\|[^\]]*)?\]/g],
  ['literal [[TAG]]', /\[\[(?:OFF|ME|HY|NEW)\]\]/g],
  ['unrendered $…$', /(?<![\\\w$])\$[^$\s<>][^$<>\n]{0,60}[^$\s<>]\$(?!\w)/g],
];

let notes = 0;
let problems = 0;
const queue = [CONTENT];
while (queue.length) {
  const dir = queue.shift();
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { queue.push(abs); continue; }
    if (!/\.md$/i.test(e.name)) continue;
    const rel = path.relative(CONTENT, abs).split(path.sep).join('/');
    if (ONLY && !rel.startsWith(ONLY)) continue;
    notes++;
    // Code is allowed to contain anything, so it is cut out before checking.
    const html = renderNote(fs.readFileSync(abs, 'utf8'), rel).html
      .replace(/<pre[\s\S]*?<\/pre>/g, '')
      .replace(/<code(?! class="katex-error")[\s\S]*?<\/code>/g, '');
    // Relative links and images must land on a file (or folder) that exists.
    const noteDir = path.dirname(abs);
    for (const [, attr, target] of html.matchAll(/\b(href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
      if (/^([a-z]+:|\/\/)/i.test(target)) continue;
      let decoded = target.replace(/&amp;/g, '&');
      try { decoded = decodeURIComponent(decoded); } catch { /* keep */ }
      if (!fs.existsSync(path.resolve(noteDir, decoded))) {
        problems++;
        console.log(`${rel}: broken ${attr === 'src' ? 'image' : 'link'}: ${decoded.slice(0, 100)}`);
      }
    }
    for (const [label, re] of CHECKS) {
      for (const m of html.matchAll(re)) {
        problems++;
        console.log(`${rel}: ${label}: ${(m[1] ?? m[0]).replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
  }
}
console.log(`· ${notes} notes rendered, ${problems} problem${problems === 1 ? '' : 's'}`);
process.exitCode = problems ? 1 : 0;
