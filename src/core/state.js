/** What PaperNotes remembers about your notes: tags, what's done,
 *  reminders, the "I'm confused here" marks, sticky notes, recent files.
 *
 *  In the desktop app it lives in the study folder itself, as
 *  .papernotes/state.json, so it travels with the notes and survives
 *  reinstalls. On the website it lives in localStorage. Either way the
 *  shape is the same and every change is saved a moment later, in one
 *  write, rather than once per click.
 *
 *  Paths are content paths ("01 Study/ET1010/03 Ch4 ADC.md"). */

export const TAG_COLORS = [
  { id: 'red', label: 'Red', color: '#ff3b30' },
  { id: 'orange', label: 'Orange', color: '#f08a24' },
  { id: 'yellow', label: 'Yellow', color: '#e6b800' },
  { id: 'green', label: 'Green', color: '#28b446' },
  { id: 'blue', label: 'Blue', color: '#1677ff' },
  { id: 'purple', label: 'Purple', color: '#a64fd1' },
  { id: 'gray', label: 'Gray', color: '#8e8e93' },
];

export const STICKY_COLORS = ['yellow', 'pink', 'green', 'blue', 'purple'];

const EMPTY = () => ({
  v: 1,
  tags: {},        // path -> [tag id or custom name]
  tagDefs: {},     // custom name -> colour
  done: {},        // path -> unix seconds
  reminders: [],   // { id, text, path, due, important, done, created }
  marks: {},       // path -> [{ line, snippet, note, created }]
  stickies: {},    // path -> [{ id, line, dx, dy, w, h, color, text, collapsed, created }]
  recent: [],      // [{ path, at }], newest first
  seen: {},        // path -> unix seconds, when it was last opened
  cards: [],       // flashcards: { id, front, back, path, created, due, interval, ease, reps, lapses, last }
  time: {},        // 'YYYY-MM-DD' -> { path -> seconds studied }
  focus: {},       // 'YYYY-MM-DD' -> focus sessions finished
  daily: {},       // 'YYYY-MM-DD' -> seconds studied that day (kept for years; time keeps the detail for 4 months)
});

/** Local calendar day, 'YYYY-MM-DD'. */
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The next schedule for a card after a review: SM-2, lightly tuned.
 *  grade 0 again, 1 hard, 2 good, 3 easy. Returns { interval (days), ease, due }. */
export function schedule(card, grade, t = Math.floor(Date.now() / 1000)) {
  let { interval = 0, ease = 2.5, reps = 0 } = card;
  if (grade === 0) {
    return { interval: 0, ease: Math.max(1.3, ease - 0.2), reps: 0, due: t + 600, lapses: (card.lapses || 0) + 1 };
  }
  let next;
  if (reps === 0) next = grade === 3 ? 4 : grade === 2 ? 2 : 1;
  else if (reps === 1) next = grade === 1 ? 2 : grade === 3 ? 7 : 4;
  else next = Math.round(interval * (grade === 1 ? 1.2 : grade === 3 ? ease * 1.3 : ease));
  next = Math.max(1, Math.min(365, next));
  const e = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
  return { interval: next, ease: e, reps: reps + 1, due: t + next * 86400, lapses: card.lapses || 0 };
}

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export class StudyState {
  /** @param {{ load: () => Promise<object|null>, save: (data: object) => Promise<void> }} backend */
  constructor(backend) {
    this.backend = backend;
    this.data = EMPTY();
    this._listeners = new Set();
    this._timer = null;
    this._saving = Promise.resolve();
  }

  async load() {
    try {
      const raw = await this.backend.load();
      if (raw && typeof raw === 'object') this.data = { ...EMPTY(), ...raw };
      // Days from before daily totals existed.
      for (const [k, o] of Object.entries(this.data.time)) {
        if (this.data.daily[k] === undefined) this.data.daily[k] = Object.values(o || {}).reduce((a, b) => a + b, 0);
      }
    } catch { /* a missing or unreadable file starts empty, it never blocks the app */ }
    this._emit({ type: 'load' });
    return this;
  }

  /** Re-read after the file changed outside the app (Claude, another PC). */
  async reload() {
    clearTimeout(this._timer);
    return this.load();
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(ev) { for (const fn of this._listeners) fn(ev); }

  _changed(ev) {
    this._emit(ev);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 400);
  }

  /** Write now (also called before the window closes). */
  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    const snapshot = JSON.stringify(this.data, null, 1);
    this._saving = this._saving.then(() => this.backend.save(snapshot)).catch(() => {});
    return this._saving;
  }

  // ── tags ─────────────────────────────────────────────────────────────
  tagsOf(path) { return this.data.tags[path] || []; }
  hasTag(path, tag) { return this.tagsOf(path).includes(tag); }

  toggleTag(path, tag) {
    const list = this.tagsOf(path).slice();
    const i = list.indexOf(tag);
    if (i >= 0) list.splice(i, 1); else list.push(tag);
    if (list.length) this.data.tags[path] = list; else delete this.data.tags[path];
    this._changed({ type: 'tags', path });
  }

  /** Every tag in use or defined, colours first in their fixed order. */
  allTags() {
    const custom = new Set(Object.keys(this.data.tagDefs));
    for (const list of Object.values(this.data.tags)) for (const t of list) if (!tagColor(t)) custom.add(t);
    return [
      ...TAG_COLORS.map((c) => ({ id: c.id, label: c.label, color: c.color, builtin: true })),
      ...[...custom].sort().map((name) => ({ id: name, label: name, color: this.data.tagDefs[name] || '#8e8e93', builtin: false })),
    ];
  }

  colorOf(tag) { return tagColor(tag) || this.data.tagDefs[tag] || '#8e8e93'; }

  defineTag(name, color) {
    this.data.tagDefs[name] = color;
    this._changed({ type: 'tags' });
  }

  removeTagEverywhere(tag) {
    for (const [p, list] of Object.entries(this.data.tags)) {
      const next = list.filter((t) => t !== tag);
      if (next.length) this.data.tags[p] = next; else delete this.data.tags[p];
    }
    delete this.data.tagDefs[tag];
    this._changed({ type: 'tags' });
  }

  pathsWithTag(tag) {
    return Object.entries(this.data.tags).filter(([, l]) => l.includes(tag)).map(([p]) => p);
  }

  // ── done ─────────────────────────────────────────────────────────────
  isDone(path) { return Boolean(this.data.done[path]); }

  setDone(path, done) {
    if (done) this.data.done[path] = now(); else delete this.data.done[path];
    this._changed({ type: 'done', path });
  }

  // ── confused marks ───────────────────────────────────────────────────
  marksOf(path) { return this.data.marks[path] || []; }

  hasMark(path, line) { return this.marksOf(path).some((m) => m.line === line); }

  toggleMark(path, line, snippet = '') {
    const list = this.marksOf(path).slice();
    const i = list.findIndex((m) => m.line === line);
    if (i >= 0) list.splice(i, 1);
    else list.push({ line, snippet: snippet.slice(0, 140), note: '', created: now() });
    list.sort((a, b) => a.line - b.line);
    if (list.length) this.data.marks[path] = list; else delete this.data.marks[path];
    this._changed({ type: 'marks', path });
  }

  /** After an edit: marks follow their text when it moved. */
  remapMarks(path, text) {
    const list = this.marksOf(path);
    if (!list.length) return;
    const lines = text.split('\n');
    let moved = false;
    for (const m of list) {
      if (!m.snippet) continue;
      const here = (lines[m.line] || '').trim().slice(0, 140);
      if (here === m.snippet) continue;
      const at = lines.findIndex((l) => l.trim().slice(0, 140) === m.snippet);
      if (at >= 0 && at !== m.line) { m.line = at; moved = true; }
    }
    if (moved) { list.sort((a, b) => a.line - b.line); this._changed({ type: 'marks', path }); }
  }

  allMarks() {
    const out = [];
    for (const [path, list] of Object.entries(this.data.marks)) for (const m of list) out.push({ path, ...m });
    return out.sort((a, b) => b.created - a.created);
  }

  // ── stickies ─────────────────────────────────────────────────────────
  stickiesOf(path) { return this.data.stickies[path] || []; }

  addSticky(path, sticky) {
    const s = {
      id: uid(), line: 0, dx: 24, dy: 0, w: 220, h: 150, color: 'yellow', text: '', collapsed: false,
      created: now(), ...sticky,
    };
    this.data.stickies[path] = [...this.stickiesOf(path), s];
    this._changed({ type: 'stickies', path });
    return s;
  }

  updateSticky(path, id, patch, { quiet = false } = {}) {
    const s = this.stickiesOf(path).find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    if (quiet) { clearTimeout(this._timer); this._timer = setTimeout(() => this.flush(), 400); }
    else this._changed({ type: 'stickies', path });
  }

  removeSticky(path, id) {
    const list = this.stickiesOf(path).filter((x) => x.id !== id);
    if (list.length) this.data.stickies[path] = list; else delete this.data.stickies[path];
    this._changed({ type: 'stickies', path });
  }

  allStickies() {
    const out = [];
    for (const [path, list] of Object.entries(this.data.stickies)) for (const s of list) out.push({ path, ...s });
    return out.sort((a, b) => b.created - a.created);
  }

  // ── reminders ────────────────────────────────────────────────────────
  get reminders() { return this.data.reminders; }

  addReminder(r) {
    const rem = { id: uid(), text: '', path: '', due: 0, important: false, done: false, created: now(), ...r };
    this.data.reminders.push(rem);
    this._changed({ type: 'reminders' });
    return rem;
  }

  updateReminder(id, patch) {
    const r = this.data.reminders.find((x) => x.id === id);
    if (!r) return;
    Object.assign(r, patch);
    this._changed({ type: 'reminders' });
  }

  removeReminder(id) {
    this.data.reminders = this.data.reminders.filter((x) => x.id !== id);
    this._changed({ type: 'reminders' });
  }

  /** Open reminders, most pressing first: overdue, today, important, the rest. */
  pendingReminders() {
    const t = now();
    const endOfDay = Math.floor(new Date().setHours(23, 59, 59, 999) / 1000);
    const rank = (r) => {
      if (r.due && r.due < t) return 0;
      if (r.due && r.due <= endOfDay) return 1;
      if (r.important) return 2;
      if (r.due) return 3;
      return 4;
    };
    return this.data.reminders.filter((r) => !r.done)
      .sort((a, b) => rank(a) - rank(b) || (a.due || Infinity) - (b.due || Infinity) || b.created - a.created);
  }

  // ── flashcards ───────────────────────────────────────────────────────
  get cards() { return this.data.cards; }

  addCard({ front, back, path = '' }) {
    const c = { id: uid(), front: String(front).trim(), back: String(back).trim(), path, created: now(), due: now(), interval: 0, ease: 2.5, reps: 0, lapses: 0, last: 0 };
    this.data.cards.push(c);
    this._changed({ type: 'cards' });
    return c;
  }

  updateCard(id, patch) {
    const c = this.data.cards.find((x) => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
    this._changed({ type: 'cards' });
  }

  removeCard(id) {
    this.data.cards = this.data.cards.filter((c) => c.id !== id);
    this._changed({ type: 'cards' });
  }

  review(id, grade) {
    const c = this.data.cards.find((x) => x.id === id);
    if (!c) return null;
    Object.assign(c, schedule(c, grade), { last: now() });
    this._changed({ type: 'cards', quiet: true });
    return c;
  }

  dueCards(path = null) {
    const t = now();
    return this.data.cards.filter((c) => c.due <= t && (!path || c.path === path || c.path.startsWith(`${path}/`)))
      .sort((a, b) => a.due - b.due);
  }

  cardsFor(path) { return this.data.cards.filter((c) => c.path === path); }

  // ── study time ───────────────────────────────────────────────────────
  addTime(path, seconds) {
    const day = dayKey();
    const d = (this.data.time[day] ||= {});
    d[path || ''] = (d[path || ''] || 0) + seconds;
    this.data.daily[day] = (this.data.daily[day] || 0) + seconds;
    const all = Object.keys(this.data.daily).sort();
    while (all.length > 1100) delete this.data.daily[all.shift()];
    // Keep four months.
    const keys = Object.keys(this.data.time).sort();
    while (keys.length > 120) delete this.data.time[keys.shift()];
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 4000);
  }

  /** Seconds studied on a day ('YYYY-MM-DD'). */
  secondsOn(day) { return this.data.daily[day] ?? Object.values(this.data.time[day] || {}).reduce((a, b) => a + b, 0); }

  focusDone() {
    const day = dayKey();
    this.data.focus[day] = (this.data.focus[day] || 0) + 1;
    this._changed({ type: 'focus' });
  }

  /** Today, the last 7 days, the streak (days in a row with 10+ minutes),
   *  and seconds per top-level folder this week. */
  timeStats() {
    const days = this.data.time;
    const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
    const today = sum(days[dayKey()]);
    let week = 0;
    const byFolder = {};
    const perDay = [];
    for (let i = 0; i < 7; i++) {
      const k = dayKey(new Date(Date.now() - i * 86400000));
      const s = sum(days[k]);
      week += s;
      perDay.unshift({ day: k, seconds: s });
      for (const [p, sec] of Object.entries(days[k] || {})) {
        const top = p.split('/').slice(0, 2).join('/') || '(home)';
        byFolder[top] = (byFolder[top] || 0) + sec;
      }
    }
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const s = this.secondsOn(dayKey(new Date(Date.now() - i * 86400000)));
      if (s >= 600) streak++;
      else if (i > 0) break;   // today not done yet doesn't end a streak
    }
    return { today, week, streak, perDay, byFolder, focusToday: this.data.focus[dayKey()] || 0 };
  }

  // ── recent ───────────────────────────────────────────────────────────
  touch(path) {
    if (!path) return;
    this.data.seen[path] = now();
    this.data.recent = [{ path, at: now() }, ...this.data.recent.filter((r) => r.path !== path)].slice(0, 30);
    this._changed({ type: 'recent', path, quiet: true });
  }

  // ── keeping up with the file system ──────────────────────────────────
  /** A file or folder was renamed or moved inside the app: everything that
   *  was attached to it, or to anything under it, follows. */
  renamePath(from, to) {
    const move = (key) => (key === from ? to : key.startsWith(`${from}/`) ? to + key.slice(from.length) : null);
    for (const c of this.data.cards) { const n = c.path && move(c.path); if (n) c.path = n; }
    for (const field of ['tags', 'done', 'marks', 'stickies', 'seen']) {
      const map = this.data[field];
      for (const key of Object.keys(map)) {
        const next = move(key);
        if (next) { map[next] = map[key]; delete map[key]; }
      }
    }
    for (const r of this.data.reminders) { const n = r.path && move(r.path); if (n) r.path = n; }
    for (const r of this.data.recent) { const n = move(r.path); if (n) r.path = n; }
    this._changed({ type: 'rename', from, to });
  }
}

export function tagColor(tag) {
  return TAG_COLORS.find((c) => c.id === tag)?.color || null;
}

export function tagLabel(tag) {
  return TAG_COLORS.find((c) => c.id === tag)?.label || tag;
}
