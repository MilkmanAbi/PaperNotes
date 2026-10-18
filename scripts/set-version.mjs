#!/usr/bin/env node
// Sets PaperNotes' version everywhere it's written down, so a release is
// one command, a changelog entry and a tag:
//   node scripts/set-version.mjs 2.4.0
//   (add "## 2.4.0" to CHANGELOG.md)
//   git commit -am "PaperNotes 2.4.0" && git tag v2.4.0 && git push --follow-tags
// The release workflow builds the installer from the tag and publishes it;
// the app's updater finds it from there.
//   node scripts/set-version.mjs --check v2.4.0   exits 1 unless the files say 2.4.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  header: path.join(root, 'desktop', 'resource.h'),
  setup: path.join(root, 'desktop', 'setup.iss'),
  pkg: path.join(root, 'package.json'),
};

function current() {
  const m = /#define PN_VERSION "([^"]+)"/.exec(fs.readFileSync(files.header, 'utf8'));
  return m ? m[1] : '';
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
  const want = String(args[1] || '').replace(/^v/, '');
  const have = current();
  if (want !== have) {
    console.error(`The tag says ${want} but desktop/resource.h says ${have}. Run scripts/set-version.mjs ${want} first.`);
    process.exit(1);
  }
  console.log(`version ${have}`);
  process.exit(0);
}

const v = String(args[0] || '').replace(/^v/, '');
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
if (!m) { console.error('usage: node scripts/set-version.mjs MAJOR.MINOR.PATCH'); process.exit(1); }

const edit = (file, fn) => {
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) console.warn(`  (no change in ${path.relative(root, file)})`);
  fs.writeFileSync(file, after);
};
edit(files.header, (s) => s
  .replace(/#define PN_VERSION "[^"]+"/, `#define PN_VERSION "${v}"`)
  .replace(/#define PN_VERSION_W L"[^"]+"/, `#define PN_VERSION_W L"${v}"`)
  .replace(/#define PN_VERSION_NUM [\d, ]+/, `#define PN_VERSION_NUM ${m[1]}, ${m[2]}, ${m[3]}, 0`));
edit(files.setup, (s) => s.replace(/#define AppVer "[^"]+"/, `#define AppVer "${v}"`));
edit(files.pkg, (s) => s.replace(/"version": "[^"]+"/, `"version": "${v}"`));
console.log(`PaperNotes is now ${v}`);
