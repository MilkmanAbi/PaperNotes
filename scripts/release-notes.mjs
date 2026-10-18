#!/usr/bin/env node
// Prints the CHANGELOG.md section for a version, for the GitHub release
// (and so for the "what's new" in the app's update panel).
//   node scripts/release-notes.mjs v2.3.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const v = String(process.argv[2] || '').replace(/^v/, '');
const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const lines = text.split(/\r?\n/);
const start = lines.findIndex((l) => new RegExp(`^##\\s+v?${v.replace(/\./g, '\\.')}\\b`).test(l));
if (start < 0) {
  console.log(`PaperNotes ${v}.`);
} else {
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  console.log(lines.slice(start + 1, end).join('\n').trim());
}
console.log('\nDownload **PaperNotes-Setup-' + v + '.exe** below. Already have PaperNotes 2.3 or later? It offers this update by itself.');
