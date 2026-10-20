// PaperNotes MCP server: lets Claude Code study with you.
//
// Read: your study folder (notes, PDF text), what is open in the app, your
// reminders, confused spots, stickies, tags and progress.
// Write: reminders, stickies, tags, done, confused marks, and "open this in
// the app". It never edits or deletes your notes.
//
// Where things are: the app writes the study folder's path to
// %LOCALAPPDATA%\PaperNotes\study-folder.txt. Inside the folder,
// .papernotes\state.json is what the app remembers and session.json is
// what it is showing (refreshed every minute while it runs).
//
// While the app is running it owns state.json, so changes go through
// .papernotes\inbox\ (one JSON file per command; the app applies them at
// once). When it isn't running, this edits state.json directly.
//
// Built into one file (desktop/mcp/server.mjs) by desktop/mcp/build.mjs.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const NOTE_RE = /\.(md|markdown|mdx)$/i;
const TAGS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'];

function studyFolder() {
  // Claude started from a PaperNotes terminal inherits the library it was
  // opened in; otherwise the app's last-used library.
  const env = process.env.PAPERNOTES_FOLDER;
  if (env && fs.existsSync(env)) return path.resolve(env);
  const hint = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'PaperNotes', 'study-folder.txt');
  let dir = '';
  try { dir = fs.readFileSync(hint, 'utf8').trim(); } catch { /* not set up */ }
  if (!dir || !fs.existsSync(dir)) throw new Error('No PaperNotes study folder is set up yet. Open PaperNotes and choose one.');
  return path.resolve(dir);
}

const meta = (root) => path.join(root, '.papernotes');
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

function resolveIn(root, rel) {
  const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const full = path.resolve(root, clean);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('That path is outside the study folder.');
  return { rel: clean, full };
}

function session(root) {
  const s = readJson(path.join(meta(root), 'session.json'), null);
  const running = Boolean(s && Date.now() / 1000 - (s.at || 0) < 150);
  return { ...(s || {}), running };
}

function loadState(root) {
  return {
    tags: {}, tagDefs: {}, done: {}, reminders: [], marks: {}, stickies: {}, recent: [], seen: {}, cards: [], time: {}, focus: {},
    ...readJson(path.join(meta(root), 'state.json'), {}),
  };
}

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Apply a command the way the app would (used when the app is closed). */
function applyDirect(state, cmd) {
  switch (cmd.op) {
    case 'addReminder':
      state.reminders.push({ id: uid(), text: cmd.text, path: cmd.path || '', due: cmd.due || 0, important: Boolean(cmd.important), done: false, created: now() });
      break;
    case 'completeReminder': {
      const r = state.reminders.find((x) => x.id === cmd.id);
      if (r) r.done = true;
      break;
    }
    case 'addSticky':
      (state.stickies[cmd.path] ||= []).push({ id: uid(), line: Number.isInteger(cmd.line) ? cmd.line : -1, dx: 9999, dy: 0, w: 240, h: 170, color: cmd.color || 'blue', text: cmd.text, collapsed: false, created: now() });
      break;
    case 'tag': {
      const list = new Set(state.tags[cmd.path] || []);
      if (cmd.on) list.add(cmd.tag); else list.delete(cmd.tag);
      if (list.size) state.tags[cmd.path] = [...list]; else delete state.tags[cmd.path];
      break;
    }
    case 'done':
      if (cmd.done) state.done[cmd.path] = now(); else delete state.done[cmd.path];
      break;
    case 'addCards':
      for (const c of cmd.cards || []) {
        state.cards.push({ id: uid(), front: c.front, back: c.back, path: cmd.path || '', created: now(), due: now(), interval: 0, ease: 2.5, reps: 0, lapses: 0, last: 0 });
      }
      break;
    case 'mark': {
      const list = (state.marks[cmd.path] || []).filter((m) => m.line !== cmd.line);
      if (cmd.on) list.push({ line: cmd.line, snippet: cmd.snippet || '', note: cmd.note || '', created: now() });
      list.sort((a, b) => a.line - b.line);
      if (list.length) state.marks[cmd.path] = list; else delete state.marks[cmd.path];
      break;
    }
    default:
  }
}

/** Do a change: through the app when it is open, directly when it isn't. */
function change(cmd) {
  const root = studyFolder();
  const s = session(root);
  if (s.running || cmd.op === 'open') {
    const inbox = path.join(meta(root), 'inbox');
    fs.mkdirSync(inbox, { recursive: true });
    const file = path.join(inbox, `${Date.now()}-${uid()}.json`);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(cmd));
    fs.renameSync(`${file}.tmp`, file);
    return s.running ? 'Done (PaperNotes applied it).' : 'Queued: PaperNotes will do this when it next opens.';
  }
  const stateFile = path.join(meta(root), 'state.json');
  const state = loadState(root);
  applyDirect(state, cmd);
  fs.mkdirSync(meta(root), { recursive: true });
  fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state, null, 1));
  fs.renameSync(`${stateFile}.tmp`, stateFile);
  return 'Done.';
}

function walk(root, { under = '', limit = 5000 } = {}) {
  const out = [];
  const start = resolveIn(root, under).full;
  const stack = [start];
  while (stack.length && out.length < limit) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function noteText(root, rel) {
  const { full } = resolveIn(root, rel);
  if (NOTE_RE.test(rel) || /\.(txt|csv|py|cpp|c|h|ino|js|json)$/i.test(rel)) return fs.readFileSync(full, 'utf8');
  const side = path.join(meta(root), 'search-text', `${rel}.txt`);
  if (fs.existsSync(side)) return `[Extracted text of ${rel}]\n\n${fs.readFileSync(side, 'utf8')}`;
  throw new Error(`${rel} isn't a text note and has no extracted text. Ask the student to open it in PaperNotes.`);
}

const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 1) }] });
const numbered = (t) => t.split('\n').map((l, i) => `${String(i + 1).padStart(4)}  ${l}`).join('\n');
const dueOf = (iso) => { if (!iso) return 0; const t = Date.parse(iso); if (Number.isNaN(t)) throw new Error('due must be an ISO date like 2026-11-30T09:00'); return Math.floor(t / 1000); };
const exists = (root, rel) => fs.existsSync(resolveIn(root, rel).full);

const server = new McpServer({ name: 'papernotes', version: '2.1.0' }, {
  instructions: 'PaperNotes is the student\'s study app. Start with papernotes_overview (and papernotes_profile for who they are, the semester week and today\'s classes). Read notes with papernotes_read or papernotes_current_note. Help them study: explain confused spots, quiz them, make flashcards (papernotes_add_flashcards), add reminders, clear confused marks once understood. Never edit their existing notes; papernotes_write_note only creates new notes or edits notes in their My notes folder.',
});

server.registerTool('papernotes_overview', {
  title: 'Study overview',
  description: 'Start here. What the student has open in PaperNotes right now, their open reminders (most pressing first), the spots they marked as confusing, their tags, and progress per folder.',
  inputSchema: {},
}, async () => {
  const root = studyFolder();
  const s = session(root);
  const st = loadState(root);
  const pending = st.reminders.filter((r) => !r.done).sort((a, b) => (a.due || 9e12) - (b.due || 9e12));
  const marks = [];
  for (const [p, list] of Object.entries(st.marks)) for (const m of list) marks.push({ path: p, line: m.line + 1, text: m.snippet, note: m.note || undefined });
  const files = walk(root).filter((p) => /\.(md|pdf|pptx?|docx?|ipynb)$/i.test(p) && !/00 About this unit\.md$/i.test(p));
  const progress = {};
  for (const f of files) {
    const top = f.split('/').slice(0, 2).join('/');
    progress[top] ||= { done: 0, total: 0 };
    progress[top].total++;
    if (st.done[f]) progress[top].done++;
  }
  return text({
    studyFolder: root,
    appOpen: s.running,
    openNow: s.current || null,
    openTabs: s.tabs || [],
    reminders: pending.map((r) => ({ id: r.id, text: r.text, due: r.due ? new Date(r.due * 1000).toISOString() : null, important: r.important, note: r.path || null })),
    confused: marks,
    tags: st.tags,
    progress: Object.entries(progress).filter(([, p]) => p.done).map(([k, p]) => ({ folder: k, ...p })),
    recent: st.recent.slice(0, 10).map((r) => r.path),
  });
});

server.registerTool('papernotes_current_note', {
  title: 'The note open in PaperNotes',
  description: 'The note the student is looking at in PaperNotes, with line numbers, plus their confused marks, stickies and tags on it.',
  inputSchema: {},
}, async () => {
  const root = studyFolder();
  const s = session(root);
  if (!s.current) return text(s.running ? 'PaperNotes is open but no note is showing (home or settings).' : 'PaperNotes is not open. Use papernotes_overview or papernotes_read.');
  const st = loadState(root);
  const p = s.current.path;
  let body;
  try { body = numbered(noteText(root, p)); } catch (err) { body = err.message; }
  return text(`# ${s.current.title}\nPath: ${p}${s.current.editing ? ' (being edited)' : ''}\nDone: ${st.done[p] ? 'yes' : 'no'}  Tags: ${(st.tags[p] || []).join(', ') || 'none'}\n` +
    `Confused at lines: ${(st.marks[p] || []).map((m) => `${m.line + 1}${m.note ? ` (${m.note})` : ''}`).join(', ') || 'none'}\n` +
    `Stickies: ${(st.stickies[p] || []).map((x) => JSON.stringify(x.text)).join('; ') || 'none'}\n\n${body}`);
});

server.registerTool('papernotes_read', {
  title: 'Read a note or file',
  description: 'Read a file from the study folder by its path (as shown in PaperNotes, e.g. "01 Study/ET1010 Microcontroller Applications/03 Ch4 ADC.md"). Notes come back with line numbers; PDFs and slides come back as their extracted text when PaperNotes has it.',
  inputSchema: { path: z.string(), from_line: z.number().int().min(1).optional(), to_line: z.number().int().min(1).optional() },
}, async ({ path: rel, from_line: a, to_line: b }) => {
  const root = studyFolder();
  let t = noteText(root, rel);
  if (a || b) t = t.split('\n').slice((a || 1) - 1, b || undefined).join('\n');
  return text(NOTE_RE.test(rel) ? numbered(t).split('\n').map((l, i) => (a ? l.replace(/^\s*\d+/, String(i + a).padStart(4)) : l)).join('\n') : t.slice(0, 200000));
});

server.registerTool('papernotes_list', {
  title: 'List files',
  description: 'List files in the study folder, optionally under a folder and/or whose path contains some text.',
  inputSchema: { folder: z.string().optional(), contains: z.string().optional() },
}, async ({ folder = '', contains = '' }) => {
  const root = studyFolder();
  const q = contains.toLowerCase();
  const list = walk(root, { under: folder }).filter((p) => !q || p.toLowerCase().includes(q));
  return text(list.length ? list.slice(0, 400).join('\n') + (list.length > 400 ? `\n… and ${list.length - 400} more` : '') : 'Nothing matches.');
});

server.registerTool('papernotes_search', {
  title: 'Search notes',
  description: 'Search the words inside every note (and the extracted text of PDFs and slides). Returns matching lines with their paths and line numbers.',
  inputSchema: { query: z.string().min(2), folder: z.string().optional() },
}, async ({ query, folder = '' }) => {
  const root = studyFolder();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = [];
  for (const rel of walk(root, { under: folder })) {
    let body = null;
    try {
      if (NOTE_RE.test(rel)) body = fs.readFileSync(resolveIn(root, rel).full, 'utf8');
      else {
        const side = path.join(meta(root), 'search-text', `${rel}.txt`);
        if (fs.existsSync(side)) body = fs.readFileSync(side, 'utf8');
      }
    } catch { /* skip */ }
    if (!body) continue;
    const lines = body.split('\n');
    lines.forEach((l, i) => {
      const low = l.toLowerCase();
      if (terms.every((t) => low.includes(t))) hits.push(`${rel}:${NOTE_RE.test(rel) ? i + 1 : '~'}: ${l.trim().slice(0, 200)}`);
    });
    if (hits.length > 80) break;
  }
  return text(hits.length ? hits.slice(0, 80).join('\n') : 'No matches.');
});

server.registerTool('papernotes_add_reminder', {
  title: 'Add a reminder',
  description: 'Add a reminder to the student\'s Reminders list in PaperNotes (shown on the home screen; due ones pop up as notifications).',
  inputSchema: { text: z.string().min(1).max(300), due: z.string().optional().describe('ISO date-time, local time, e.g. 2026-11-30T09:00'), important: z.boolean().optional(), path: z.string().optional().describe('A note to link it to') },
}, async ({ text: t, due, important, path: rel }) => {
  const root = studyFolder();
  if (rel && !exists(root, rel)) throw new Error(`No file at ${rel}`);
  return text(change({ op: 'addReminder', text: t, due: dueOf(due), important: Boolean(important), path: rel || '' }));
});

server.registerTool('papernotes_complete_reminder', {
  title: 'Tick off a reminder',
  description: 'Mark a reminder as done, by its id (from papernotes_overview).',
  inputSchema: { id: z.string() },
}, async ({ id }) => text(change({ op: 'completeReminder', id })));

server.registerTool('papernotes_add_sticky', {
  title: 'Add a sticky note',
  description: 'Stick a sticky note onto a note in PaperNotes, beside a given line (1-based). Good for a short summary, a mnemonic, or a worked answer.',
  inputSchema: { path: z.string(), text: z.string().min(1).max(2000), line: z.number().int().min(1).optional(), color: z.enum(['yellow', 'pink', 'green', 'blue', 'purple']).optional() },
}, async ({ path: rel, text: t, line, color }) => {
  const root = studyFolder();
  if (!exists(root, rel)) throw new Error(`No file at ${rel}`);
  return text(change({ op: 'addSticky', path: rel, text: t, line: line ? line - 1 : -1, color: color || 'blue' }));
});

server.registerTool('papernotes_tag', {
  title: 'Tag a file',
  description: `Add or remove a tag on a note or file. Colour tags: ${TAGS.join(', ')}. Any other word becomes a custom tag.`,
  inputSchema: { path: z.string(), tag: z.string().min(1).max(40), on: z.boolean().default(true) },
}, async ({ path: rel, tag, on }) => {
  const root = studyFolder();
  if (!exists(root, rel)) throw new Error(`No file at ${rel}`);
  return text(change({ op: 'tag', path: rel, tag: TAGS.includes(tag.toLowerCase()) ? tag.toLowerCase() : tag, on }));
});

server.registerTool('papernotes_mark_done', {
  title: 'Mark as done',
  description: 'Mark a note or file as done (studied) or not done. This drives the progress bars.',
  inputSchema: { path: z.string(), done: z.boolean().default(true) },
}, async ({ path: rel, done }) => {
  const root = studyFolder();
  if (!exists(root, rel)) throw new Error(`No file at ${rel}`);
  return text(change({ op: 'done', path: rel, done }));
});

server.registerTool('papernotes_mark_confused', {
  title: 'Set or clear a confused mark',
  description: 'Set (on=true) or clear (on=false) the red "confused here" dot on a line (1-based) of a note. Clear it once the student understands it.',
  inputSchema: { path: z.string(), line: z.number().int().min(1), on: z.boolean(), note: z.string().optional() },
}, async ({ path: rel, line, on, note }) => {
  const root = studyFolder();
  if (!exists(root, rel)) throw new Error(`No file at ${rel}`);
  let snippet = '';
  try { snippet = (noteText(root, rel).split('\n')[line - 1] || '').trim().slice(0, 140); } catch { /* fine */ }
  return text(change({ op: 'mark', path: rel, line: line - 1, on, snippet, note: note || '' }));
});

server.registerTool('papernotes_open', {
  title: 'Open in PaperNotes',
  description: 'Show a note in the PaperNotes app, optionally scrolled to a line (1-based).',
  inputSchema: { path: z.string(), line: z.number().int().min(1).optional() },
}, async ({ path: rel, line }) => {
  const root = studyFolder();
  if (!exists(root, rel)) throw new Error(`No file at ${rel}`);
  return text(change({ op: 'open', path: rel, line: line ? line - 1 : undefined }));
});

// ── you, your semester, your timetable ─────────────────────────────────
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function profileOf(root) {
  const out = { fields: {}, context: '', timetable: [], timetableFile: '', timetableImage: '' };
  const info = path.join(root, 'info.md');
  if (fs.existsSync(info)) {
    const raw = fs.readFileSync(info, 'utf8');
    const fm = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (fm) {
      for (const line of fm[1].split(/\r?\n/)) {
        const m = /^([A-Za-z]+)\s*:\s*(.*)$/.exec(line);
        if (m) out.fields[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
    const ctx = /##\s*Context for Claude\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i.exec(raw);
    out.context = (ctx ? ctx[1] : raw.replace(fm ? fm[0] : '', '')).trim();
  }
  const files = walk(root, { limit: 20000 });
  out.timetableFile = out.fields.timetable && fs.existsSync(path.join(root, out.fields.timetable)) ? out.fields.timetable
    : files.find((p) => /(^|\/)time[-_ ]?table\.csv$/i.test(p)) || '';
  out.timetableImage = files.find((p) => /(^|\/)time[-_ ]?table\.(png|jpe?g|webp)$/i.test(p)) || '';
  if (out.timetableFile) {
    for (const line of fs.readFileSync(path.join(root, out.timetableFile), 'utf8').split(/\r?\n/)) {
      const c = line.split(',').map((x) => x.trim());
      const t = (c[0] || '').toLowerCase();
      const day = /^[0-6]$/.test(t) ? Number(t) : DAY_NAMES.findIndex((d) => t.startsWith(d.toLowerCase()));
      if (day < 0 || !/^\d{1,2}:\d{2}$/.test(c[1] || '')) continue;
      out.timetable.push({ day: DAY_NAMES[day], dayIndex: day, start: c[1], end: c[2] || '', module: c[3] || '', type: c[4] || '', room: c[5] || '', note: c.slice(6).join(', ') });
    }
  }
  return out;
}

function weekOf(fields, date = new Date()) {
  if (!fields.semesterStart) return null;
  const start = new Date(`${fields.semesterStart}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const days = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  return days < 0 ? { week: 0, startsInDays: -days } : { week: Math.floor(days / 7) + 1 };
}

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

server.registerTool('papernotes_profile', {
  title: 'About the student',
  description: 'Who the student is (info.md: name, school, course, year, semester and their own context for you), which week of the semester it is, and their timetable with today\'s classes. Call this early in a session.',
  inputSchema: {},
}, async () => {
  const root = studyFolder();
  const p = profileOf(root);
  const d = new Date();
  return text({
    ...p.fields,
    today: d.toDateString(),
    semesterWeek: weekOf(p.fields),
    contextFromStudent: p.context || null,
    todaysClasses: p.timetable.filter((c) => c.dayIndex === d.getDay()).map(({ dayIndex, ...c }) => c),
    timetable: p.timetable.map(({ dayIndex, ...c }) => c),
    timetableFile: p.timetableFile || null,
    timetableImage: p.timetableImage || null,
    note: p.fields.name ? undefined : 'No info.md yet: the student can add one from PaperNotes (Settings → You).',
  });
});

server.registerTool('papernotes_study_stats', {
  title: 'How much they have studied',
  description: 'Study time tracked by PaperNotes: today, each of the last 14 days, streak, per folder this week, focus sessions, flashcards due, and progress (done/total) per module.',
  inputSchema: {},
}, async () => {
  const root = studyFolder();
  const st = loadState(root);
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const days = [];
  const byFolder = {};
  for (let i = 13; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * 86400000));
    days.push({ day: k, minutes: Math.round(sum(st.time[k]) / 60), focusSessions: st.focus[k] || 0 });
    if (i < 7) for (const [p, sec] of Object.entries(st.time[k] || {})) { const top = p.split('/').slice(0, 2).join('/') || '(home)'; byFolder[top] = (byFolder[top] || 0) + sec; }
  }
  let streak = 0;
  for (let i = 0; i < 400; i++) { const m = sum(st.time[dayKey(new Date(Date.now() - i * 86400000))]); if (m >= 600) streak++; else if (i > 0) break; }
  const t = now();
  return text({
    todayMinutes: days[days.length - 1].minutes,
    streakDays: streak,
    last14Days: days,
    minutesPerFolderThisWeek: Object.fromEntries(Object.entries(byFolder).map(([k, v]) => [k, Math.round(v / 60)])),
    flashcards: { total: st.cards.length, due: st.cards.filter((c) => c.due <= t).length },
    doneCount: Object.keys(st.done).length,
  });
});

server.registerTool('papernotes_add_flashcards', {
  title: 'Add flashcards',
  description: 'Add flashcards to the student\'s spaced-repetition deck in PaperNotes. Each card: a short question (front) and answer (back), Markdown with LaTeX in $…$ allowed. Link them to the note they come from. They show up for review at once.',
  inputSchema: {
    path: z.string().optional().describe('The note the cards come from'),
    cards: z.array(z.object({ front: z.string().min(1).max(2000), back: z.string().min(1).max(4000) })).min(1).max(100),
  },
}, async ({ path: rel, cards }) => {
  const root = studyFolder();
  if (rel && !exists(root, rel)) throw new Error(`No file at ${rel}`);
  return text(`${change({ op: 'addCards', path: rel || '', cards })} ${cards.length} card${cards.length === 1 ? '' : 's'}.`);
});

server.registerTool('papernotes_flashcards', {
  title: 'List flashcards',
  description: 'The student\'s flashcards (optionally only those from one note, or only those due now), with how well they know each one (reviews, lapses, interval in days).',
  inputSchema: { path: z.string().optional(), dueOnly: z.boolean().optional() },
}, async ({ path: rel, dueOnly }) => {
  const st = loadState(studyFolder());
  const t = now();
  const list = st.cards.filter((c) => (!rel || c.path === rel) && (!dueOnly || c.due <= t));
  return text(list.slice(0, 300).map((c) => ({ front: c.front, back: c.back, note: c.path || null, reviews: c.reps, lapses: c.lapses, intervalDays: c.interval, due: c.due <= t ? 'now' : new Date(c.due * 1000).toISOString() })));
});

server.registerTool('papernotes_write_note', {
  title: 'Write a note',
  description: 'Create a Markdown note in the library. PaperNotes renders Obsidian-style Markdown: callouts (> [!key], > [!tip] Title, > [!faq]- folded), ==highlight== and ==g:coloured==, [[wikilinks]], [[Note#Heading]], ![[Note#Section]] embeds, #tags, - [ ] tasks, LaTeX, ```html run blocks, ```mermaid, and two easy diagrams: ```tree (an indented outline drawn as a tree; ```tree down grows downwards) and ```flow (one step per line, indent = arrow from the line above, A -> B on one line, |yes| labels the arrow into a step, same text = same box so branches can meet or loop, a step ending in ? is a decision, (Start) is a start/end; ```flow right lays it out sideways). Prefer ```tree and ```flow over Mermaid for simple diagrams. It never overwrites an existing note unless that note is inside the student\'s "My notes" folder and overwrite is true. Default location: My notes/.',
  inputSchema: { path: z.string().describe('e.g. "My notes/Ch4 ADC summary.md"'), content: z.string().min(1), overwrite: z.boolean().optional() },
}, async ({ path: rel, content, overwrite }) => {
  const root = studyFolder();
  if (!/\.(md|markdown)$/i.test(rel)) throw new Error('Notes end in .md');
  const { full, rel: clean } = resolveIn(root, rel);
  const inMyNotes = /(^|\/)[^/]*my notes\//i.test(clean);
  if (fs.existsSync(full) && !(overwrite && inMyNotes)) throw new Error(inMyNotes ? 'That note exists; pass overwrite: true to replace it.' : 'That note exists and is not in My notes; choose a new name.');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(`${full}.tmp`, content);
  fs.renameSync(`${full}.tmp`, full);
  return text(`Wrote ${clean}. PaperNotes shows it in a moment.`);
});

server.registerTool('papernotes_append_inbox', {
  title: 'Jot something down',
  description: 'Append a line or paragraph to the student\'s My notes/Inbox.md (created if missing). Good for quick summaries, things to look up, or questions to ask the lecturer.',
  inputSchema: { text: z.string().min(1).max(4000) },
}, async ({ text: t }) => {
  const root = studyFolder();
  const top = fs.readdirSync(root).find((n) => /^(\d+\s+)?my notes$/i.test(n)) || 'My notes';
  const file = path.join(root, top, 'Inbox.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const head = fs.existsSync(file) ? '' : '# Inbox\n\n';
  fs.appendFileSync(file, `${head}- ${new Date().toLocaleString()}: ${t.replace(/\n/g, '\n  ')}\n`);
  return text(`Added to ${top}/Inbox.md.`);
});

// ── prompts: these appear in Claude Code as /mcp__papernotes__… ─────────
server.registerPrompt('study', {
  title: 'Study session',
  description: 'Start a study session on what is open in PaperNotes (or a given note).',
  argsSchema: { note: z.string().optional() },
}, ({ note }) => ({
  messages: [{ role: 'user', content: { type: 'text', text: `Start a PaperNotes study session${note ? ` on "${note}"` : ' on the note I have open'}. Use papernotes_profile and papernotes_current_note (or papernotes_read). Begin with my confused spots, one at a time, short and concrete, checking I got each before moving on. Then quiz me. Clear each confused mark once I understand it, and add flashcards for anything worth remembering.` } }],
}));

server.registerPrompt('quiz', {
  title: 'Quiz me',
  description: 'Exam-style quiz on a note or a module, one question at a time.',
  argsSchema: { topic: z.string().optional() },
}, ({ topic }) => ({
  messages: [{ role: 'user', content: { type: 'text', text: `Quiz me${topic ? ` on ${topic}` : ' on the note I have open in PaperNotes'}, exam style: one question at a time, wait for my answer, mark it, explain briefly if wrong. 10 questions. At the end, tell me my weak spots, add reminders to revise them, and make flashcards for the ones I got wrong.` } }],
}));

server.registerPrompt('plan', {
  title: 'Plan my week',
  description: 'Plan revision around the timetable, reminders, progress and upcoming tests.',
  argsSchema: {},
}, () => ({
  messages: [{ role: 'user', content: { type: 'text', text: 'Plan my study for the next 7 days. Use papernotes_profile (semester week, timetable), papernotes_overview (reminders, confused spots, progress) and papernotes_study_stats. Fit sessions around my classes, prioritise tests coming up soonest and my weakest modules, keep sessions short. Then add the plan as reminders with times and show it to me as a table.' } }],
}));

server.registerPrompt('cards', {
  title: 'Make flashcards',
  description: 'Turn a note into spaced-repetition flashcards.',
  argsSchema: { note: z.string().optional() },
}, ({ note }) => ({
  messages: [{ role: 'user', content: { type: 'text', text: `Make 15 flashcards from ${note ? `"${note}"` : 'the note I have open in PaperNotes'}: one idea each, exam-style questions, short answers, LaTeX in $…$. Add them with papernotes_add_flashcards linked to the note, then show me three to try.` } }],
}));

server.registerPrompt('explain', {
  title: 'Explain my confused spots',
  description: 'Go through every spot marked as confusing, across all notes.',
  argsSchema: {},
}, () => ({
  messages: [{ role: 'user', content: { type: 'text', text: 'Use papernotes_overview to get every spot I marked as confusing. Go through them one at a time (read the surrounding note with papernotes_read): explain simply with an example, check I understand, then clear the mark with papernotes_mark_confused.' } }],
}));

await server.connect(new StdioServerTransport());
