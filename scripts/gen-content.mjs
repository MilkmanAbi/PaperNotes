#!/usr/bin/env node
// Generates a synthetic note tree, for two reasons: the shipped demo content,
// and stress testing the parts of this project that only misbehave at scale.
//
//   node scripts/gen-content.mjs --out content --notes 1200 --depth 6
//   node scripts/gen-content.mjs --out content-stress --notes 50000 --depth 12 --branch 6
//
// Deterministic for a given seed, so a stress run is reproducible.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };

const OUT = path.resolve(process.cwd(), flag('out', 'content'));
const TARGET_NOTES = Number(flag('notes', 1200));
const MAX_DEPTH = Number(flag('depth', 6));
const BRANCH = Number(flag('branch', 4));
const SEED = Number(flag('seed', 20261017));
const FORCE = args.includes('--force');

// mulberry32 — small, fast, reproducible.
let state = SEED >>> 0;
const rnd = () => {
  state = (state + 0x6D2B79F5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const AREAS = ['systems', 'optics', 'fieldwork', 'archive', 'typography', 'control-theory',
  'hardware', 'cartography', 'signal', 'metallurgy', 'cold-storage', 'acoustics'];
const SUB = ['notes', 'drafts', 'references', 'measurements', 'teardown', 'log', 'inbox',
  'specimens', 'revisions', 'scratch', 'errata', 'schematics', 'transcripts', 'calibration'];
const TOPIC = ['bearing', 'lattice', 'aperture', 'drift', 'ledger', 'harmonic', 'gradient',
  'envelope', 'tolerance', 'residue', 'cadence', 'manifold', 'quench', 'parallax',
  'fixture', 'anneal', 'hysteresis', 'waveguide', 'sediment', 'collimator'];
const TAGS = ['reference', 'draft', 'measured', 'open-question', 'archived', 'verified',
  'theory', 'practical', 'rewrite', 'blocked'];

const LEDE = [
  'The short version is that the first three attempts were measuring the wrong thing.',
  'Nothing here is settled yet; this is the state of it as of the last bench session.',
  'Written up mostly so the next person does not repeat the afternoon I just had.',
  'Two independent runs agree, which is either reassuring or a shared systematic error.',
  'Collected from the older folder structure, lightly edited, otherwise left as found.',
];

const BODY = [
  'The apparatus settles after roughly four minutes. Readings taken before that point drift upward in a way that looks like signal and is not.',
  'Three constraints matter here, and only the third is interesting: the first two are satisfied by any reasonable choice of materials.',
  'It is worth stating the obvious failure mode plainly, because it is cheap to avoid once named and expensive to discover twice.',
  'The reference implementation disagrees with the published figures by about two percent, consistently, across the whole range.',
  'Everything below the fold is working notes rather than conclusions. Treat the numbers as provisional.',
];

let created = 0;
const dirsCreated = [];

function noteBody(title, depth, rel) {
  const tags = [...new Set(Array.from({ length: int(0, 3) }, () => pick(TAGS)))];
  const lines = [];
  lines.push('---');
  lines.push(`title: ${title}`);
  if (tags.length) lines.push(`tags: [${tags.join(', ')}]`);
  lines.push(`depth: ${depth}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(pick(LEDE));
  lines.push('');

  const sections = int(1, 3);
  for (let s = 0; s < sections; s++) {
    lines.push(`## ${pick(TOPIC).replace(/^./, (c) => c.toUpperCase())} ${s + 1}`);
    lines.push('');
    lines.push(pick(BODY));
    lines.push('');

    const roll = rnd();
    if (roll < 0.25) {
      lines.push('| Run | Reading | Note |');
      lines.push('| --- | ---: | --- |');
      for (let r = 1; r <= int(2, 4); r++) {
        lines.push(`| ${r} | ${(rnd() * 100).toFixed(2)} | ${pick(['clean', 'drifted', 'discarded', 'repeat'])} |`);
      }
      lines.push('');
    } else if (roll < 0.45) {
      lines.push('```python');
      lines.push('def settle(series, window=16):');
      lines.push('    """Trailing mean once the transient has decayed."""');
      lines.push('    tail = series[window:]');
      lines.push('    return sum(tail) / len(tail)');
      lines.push('```');
      lines.push('');
    } else if (roll < 0.62) {
      lines.push(`The relationship is $y = \\alpha x^{${int(2, 4)}} + \\beta$, which over the measured range reduces to:`);
      lines.push('');
      lines.push('$$');
      lines.push(`\\int_{0}^{${int(1, 9)}} e^{-\\lambda t}\\,\\cos(\\omega t)\\;dt = \\frac{\\lambda}{\\lambda^{2} + \\omega^{2}}`);
      lines.push('$$');
      lines.push('');
    } else if (roll < 0.74) {
      lines.push('- [x] Bench check against the reference jig');
      lines.push('- [x] Re-run with the shorter lead');
      lines.push('- [ ] Repeat at temperature');
      lines.push('');
    } else if (roll < 0.82) {
      lines.push('> Left as written in the original margin, including the arithmetic slip in the second line.');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(`<small>Stored at <code>${rel}</code> · depth ${depth}</small>`);
  lines.push('');
  return lines.join('\n');
}

// Returns how many notes this subtree actually produced, so a sibling branch
// cannot swallow the whole budget and leave the rest of the tree empty.
function build(dir, depth, budget) {
  fs.mkdirSync(dir, { recursive: true });
  dirsCreated.push(dir);
  let made = 0;

  const notesHere = Math.max(1, Math.min(budget, int(1, 5)));
  for (let i = 0; i < notesHere && created < TARGET_NOTES && made < budget; i++) {
    const topic = pick(TOPIC);
    const slug = `${String(i + 1).padStart(2, '0')}-${topic}-${pick(SUB)}`;
    const file = path.join(dir, `${slug}.md`);
    const rel = path.relative(OUT, file).split(path.sep).join('/');
    const title = `${topic.replace(/^./, (c) => c.toUpperCase())} ${pick(SUB)}`;
    fs.writeFileSync(file, noteBody(title, depth, rel));
    created++; made++;
  }

  if (depth >= MAX_DEPTH || created >= TARGET_NOTES || made >= budget) return made;

  const children = Math.max(1, Math.min(BRANCH, int(1, BRANCH)));
  const perChild = Math.max(1, Math.ceil((budget - made) / children));
  for (let c = 0; c < children && created < TARGET_NOTES && made < budget; c++) {
    const name = depth === 0 ? pick(AREAS) : `${pick(SUB)}-${int(1, 99)}`;
    made += build(path.join(dir, `${name}`), depth + 1, Math.min(perChild, budget - made));
  }
  return made;
}

if (fs.existsSync(OUT) && !FORCE) {
  const existing = fs.readdirSync(OUT).filter((f) => !f.startsWith('.'));
  if (existing.length) {
    console.error(`! ${path.relative(process.cwd(), OUT)} already has files. Pass --force to overwrite.`);
    process.exit(1);
  }
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
// A handful of top-level areas, each recursing until the note budget runs out.
const topLevel = Math.min(AREAS.length, Math.max(3, Math.ceil(TARGET_NOTES / 220)));
for (let i = 0; i < topLevel && created < TARGET_NOTES; i++) {
  build(path.join(OUT, AREAS[i % AREAS.length] + (i >= AREAS.length ? `-${i}` : '')), 1,
    Math.ceil(TARGET_NOTES / topLevel));
}

// One deliberately pathological branch: narrow and very deep, to prove the
// walker and the tree renderer do not care about depth.
let deep = path.join(OUT, 'deep-recursion');
for (let d = 1; d <= Math.max(MAX_DEPTH * 2, 24); d++) {
  deep = path.join(deep, `level-${String(d).padStart(2, '0')}`);
  fs.mkdirSync(deep, { recursive: true });
  const rel = path.relative(OUT, path.join(deep, 'note.md')).split(path.sep).join('/');
  fs.writeFileSync(path.join(deep, 'note.md'), noteBody(`Level ${d}`, d + 1, rel));
  created++;
}

// Hand-written notes are copied in last. They are the ones worth reading:
// the synthetic tree exists to make the structure heavy, not interesting.
const SEED_DIR_NAME = flag('seed', 'docs-seed');
const seedDir = path.resolve(process.cwd(), SEED_DIR_NAME);
let seeded = 0;
if (SEED_DIR_NAME !== 'none' && fs.existsSync(seedDir)) {
  const copy = (from, to) => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); copy(src, dst); }
      else { fs.copyFileSync(src, dst); seeded++; }
    }
  };
  copy(seedDir, OUT);
}

console.log(`· ${created} generated + ${seeded} written notes in ${new Set(dirsCreated).size + Math.max(MAX_DEPTH * 2, 24)} folders -> ${path.relative(process.cwd(), OUT)} (${Date.now() - t0}ms)`);
