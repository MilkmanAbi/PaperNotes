/** You, your semester and your timetable.
 *
 *  A library can carry an info.md at its top level: who you are, where and
 *  what you study, when the semester started, and anything you want Claude
 *  to know. A timetable.csv next to it lists your classes. Both are plain
 *  files you can edit anywhere; PaperNotes reads them for the home screen
 *  (today's classes, which week it is) and hands them to Claude.
 *
 *  A picture of your timetable (Time-Table.png, timetable.jpg…) anywhere in
 *  the library switches on the Timetable button. */

import { parseFrontMatter } from '../../scripts/lib/frontmatter.mjs';
import { encodePath } from '../core/paths.js';
import { askForm } from './dialog.js';
import { icon } from './icons.js';
import { escapeHtml } from './study.js';

export const INFO = 'info.md';
const TT_IMAGE = /^time[-_ ]?table\.(png|jpe?g|webp|gif)$/i;
const TT_CSV = /^time[-_ ]?table\.csv$/i;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const FIELDS = [
  ['name', 'Your name'],
  ['school', 'School'],
  ['course', 'Course'],
  ['year', 'Year'],
  ['semester', 'Semester'],
  ['semesterStart', 'Semester week 1 starts on'],
];

async function fetchText(path) {
  const res = await fetch(`content/${encodePath(path)}`, { cache: 'no-store' });
  return res.ok ? res.text() : null;
}

/** Everything the app knows about you. Missing pieces are just empty.
 *  info.md and timetable.csv sit at the top of the library but are kept out
 *  of the tree (they're settings, not notes), so they're read directly. */
export async function loadProfile(store) {
  const p = { exists: false, fields: {}, extra: {}, context: '', timetable: [], timetableCsv: '', timetableImage: '' };
  const raw = await fetchText(INFO);
  if (raw !== null) {
    const { data, body } = parseFrontMatter(raw);
    p.exists = true;
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || v === null) continue;
      if (FIELDS.some(([f]) => f === k)) p.fields[k] = String(v);
      else if (k === 'timetable') p.timetableCsv = String(v);
      else p.extra[k] = String(v);   // vacation, exams, weeks… kept when saving
    }
    const ctx = /##\s*Context for Claude\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i.exec(body);
    p.context = (ctx ? ctx[1] : body.replace(/^#.*\n/, '')).trim();
  }
  // The timetable: info.md's pointer, timetable.csv at the top, or one in a
  // folder; and a picture of it anywhere.
  let csv = p.timetableCsv ? await fetchText(p.timetableCsv) : null;
  if (csv === null) {
    csv = await fetchText('timetable.csv');
    if (csv !== null) p.timetableCsv = 'timetable.csv';
  }
  for (let i = 1; i < store.nodeCount; i++) {
    if (store.kind[i] !== 1) continue;
    const name = store.nameOf(i);
    if (csv === null && TT_CSV.test(name)) { p.timetableCsv = store.pathOf(i); csv = await fetchText(p.timetableCsv); }
    if (!p.timetableImage && TT_IMAGE.test(name)) p.timetableImage = store.pathOf(i);
  }
  if (csv) p.timetable = parseTimetable(csv);
  return p;
}

/** Day,Start,End,Module,Type,Room,Notes. The header row is optional and
 *  days can be Mon / Monday / 1. */
export function parseTimetable(csv) {
  const rows = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const day = dayIndex(cells[0]);
    if (day < 0 || !/^\d{1,2}:\d{2}$/.test(cells[1] || '')) continue;   // header or junk
    rows.push({ day, start: cells[1], end: cells[2] || '', module: cells[3] || '', type: cells[4] || '', room: cells[5] || '', note: cells.slice(6).join(', ') });
  }
  return rows.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

function dayIndex(s = '') {
  const t = s.trim().toLowerCase();
  if (/^[0-6]$/.test(t)) return Number(t);
  return DAYS.findIndex((d) => t.startsWith(d.toLowerCase()));
}

const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Today's classes, with which one is on now and which is next. */
export function today(profile, date = new Date()) {
  const day = date.getDay();
  const now = date.getHours() * 60 + date.getMinutes();
  return profile.timetable.filter((r) => r.day === day).map((r) => ({
    ...r,
    state: now >= minutes(r.start) && now < minutes(r.end || r.start) ? 'now' : now < minutes(r.start) ? 'later' : 'done',
  }));
}

/** "9-11" or "9, 10, 11" → [9, 10, 11]. */
function weekList(s = '') {
  const out = [];
  for (const part of String(s).split(/[,;\s]+/)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) continue;
    for (let w = Number(m[1]); w <= Number(m[2] || m[1]); w++) out.push(w);
  }
  return out;
}

/** The semester week, counted straight through from week 1 the way SP
 *  numbers them (the vacation weeks keep their numbers). info.md can say
 *  which weeks are vacation and exams, and the last week:
 *    vacation: 9-11   exams: 19-20   weeks: 20
 *  text is the short label ("Wk 3"), empty before week 1 and after the
 *  last week; long says it in words. */
export function weekInfo(profile, date = new Date()) {
  const s = profile.fields.semesterStart;
  if (!s) return null;
  const start = new Date(`${s}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const days = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  const startText = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  if (days < 0) {
    // The week before week 1 is week 0, as SP calls it.
    return { week: 0, text: days >= -7 ? 'Wk 0' : '', before: true, kind: 'before', title: `Week 1 starts ${startText}`,
      long: days === -1 ? 'the semester starts tomorrow' : `the semester starts in ${-days} days` };
  }
  const week = Math.floor(days / 7) + 1;
  const ex = profile.extra || {};
  const last = Number(ex.weeks) || 0;
  if (last && week > last) return { week, text: '', after: true, kind: 'after', title: 'The semester is over', long: 'the semester is over' };
  const kind = weekList(ex.vacation).includes(week) ? 'vacation' : weekList(ex.exams).includes(week) ? 'exams' : 'teaching';
  const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (week - 1) * 7);
  const range = `${monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(monday.getTime() + 6 * 86400000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  const what = { vacation: ' · vacation', exams: ' · exams', teaching: '' }[kind];
  return { week, text: `Wk ${week}`, before: false, kind, title: `Week ${week}${what} (${range})`, long: `week ${week}${what.replace(' · ', ', ')}` };
}

/** info.md, written from the form; keeps your context text and any other
 *  settings in it (vacation weeks and the like). */
export function infoMarkdown(fields, context, extra = {}) {
  const fm = FIELDS.filter(([k]) => fields[k]).map(([k]) => `${k}: ${String(fields[k]).replace(/\n/g, ' ')}`);
  if (fields.timetable) fm.push(`timetable: ${fields.timetable}`);
  for (const [k, v] of Object.entries(extra)) if (v !== '' && v !== undefined) fm.push(`${k}: ${String(v).replace(/\n/g, ' ')}`);
  return `---\n${fm.join('\n')}\n---\n\n# About me\n\nThis file is read by PaperNotes: the home screen uses it, and it's handed to Claude when you study together. Edit it any time (Profile, at the bottom left).\n\n## Context for Claude\n\n${(context || '').trim() || 'Anything Claude should know about how you study, what you find hard, and how you like things explained.'}\n`;
}

/** The profile form. Everything is optional. */
export async function editProfile({ profile, write, toasts, title = 'Your details' }) {
  const f = profile.fields;
  const out = await askForm({
    title,
    action: 'Save',
    fields: [
      { name: 'name', label: 'Your name', type: 'text', value: f.name || '' },
      { name: 'school', label: 'School', type: 'text', value: f.school || '', placeholder: 'Singapore Polytechnic' },
      { name: 'course', label: 'Course', type: 'text', value: f.course || '', placeholder: 'Computer Engineering' },
      { name: 'year', label: 'Year', type: 'text', value: f.year || '', placeholder: '2' },
      { name: 'semester', label: 'Semester', type: 'text', value: f.semester || '', placeholder: '2' },
      { name: 'semesterStart', label: 'Week 1 starts on', type: 'date', value: f.semesterStart || '' },
      { name: 'context', label: 'Context for Claude (optional)', type: 'textarea', rows: 5, value: profile.context || '', placeholder: 'How you learn best, what you find hard, what you are aiming for…' },
    ],
  });
  if (!out) return false;
  const fields = { ...out, timetable: profile.timetableCsv || '' };
  delete fields.context;
  await write(INFO, infoMarkdown(fields, out.context, profile.extra));
  toasts?.show({ text: 'Saved to info.md.' });
  return true;
}

/** The starter files of a brand-new library. */
export const STARTER = {
  'Welcome.md': `# Welcome to your library

This folder is your **library**: PaperNotes shows everything in it. Put your notes, slides, PDFs and past papers anywhere in here, in any folders you like.

- **info.md**: who you are and what you're studying. The home screen and Claude both read it.
- **timetable.csv**: your classes, one per line. Today's classes appear on the home screen.
- **My notes**: notes you write in PaperNotes go here by default (\`Ctrl N\`).

Drop a picture of your timetable in here named **Time-Table.png** and a Timetable button appears at the top.

> [!tip|try this]
> Hover the left edge of this line and click the red dot: that's how you mark "I'm confused here". Then press \`Ctrl Shift L\` to study with Claude.
`,
  'timetable.csv': `Day,Start,End,Module,Type,Room,Notes
Mon,09:00,11:00,Example module,Lecture,Room 101,
Wed,14:00,16:00,Example module,Lab,Lab 3,Bring laptop
`,
  'My notes/Inbox.md': `# Inbox

Quick notes land here. Sort them out later.
`,
};

// ── the timetable page ──────────────────────────────────────────────────
export function showTimetable({ reader, profile, store }) {
  reader._clear();
  reader.currentPath = ':timetable';
  reader.inner.dataset.wide = 'true';
  const sheet = document.createElement('div');
  sheet.className = 'reader__sheet timetable';
  const week = weekInfo(profile);
  const rows = profile.timetable;
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => rows.some((r) => r.day === d) || (d >= 1 && d <= 5));
  const todayIdx = new Date().getDay();
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  let html = `<header class="timetable__head"><h1>Timetable</h1>${week ? `<span class="weekchip">${escapeHtml(week.text)}</span>` : ''}
    ${profile.timetableCsv ? `<a class="btn btn--ghost" href="#/${encodePath(profile.timetableCsv)}">${icon('table')}<span>${escapeHtml(profile.timetableCsv)}</span></a>` : ''}</header>`;
  if (rows.length) {
    html += `<div class="tt-grid" style="--days:${days.length}">${days.map((d) => `
      <section class="tt-day${d === todayIdx ? ' is-today' : ''}"><h2>${DAYS[d]}</h2>
        ${rows.filter((r) => r.day === d).map((r) => {
          const live = d === todayIdx && nowM >= minutes(r.start) && nowM < minutes(r.end || r.start);
          return `<div class="tt-class${live ? ' is-now' : ''}"><span class="tt-time">${escapeHtml(r.start)}${r.end ? `–${escapeHtml(r.end)}` : ''}</span>
            <b>${escapeHtml(r.module)}</b><span>${escapeHtml([r.type, r.room].filter(Boolean).join(' · '))}</span>${r.note ? `<small>${escapeHtml(r.note)}</small>` : ''}</div>`;
        }).join('') || '<p class="tt-free">Free</p>'}
      </section>`).join('')}</div>`;
  }
  if (profile.timetableImage) {
    html += `<figure class="tt-image"><img src="content/${encodePath(profile.timetableImage)}" alt="Timetable"><figcaption>${escapeHtml(profile.timetableImage)}</figcaption></figure>`;
  }
  if (!rows.length && !profile.timetableImage) {
    html += '<p class="home__empty">No timetable yet. Add a <b>timetable.csv</b> (Day, Start, End, Module, Type, Room) or a <b>Time-Table.png</b> to your library.</p>';
  }
  sheet.innerHTML = html;
  reader.inner.appendChild(sheet);
  reader.headings = [];
  reader._emitHeadings();
  void store;
}
