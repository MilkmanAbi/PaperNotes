/** You: your picture, your details and what your studying adds up to.
 *
 *  The picture is cropped to a circle here and saved as a 256 px PNG in
 *  the library (.papernotes/profile/avatar.png), so it travels with your
 *  notes and backups; the website keeps it in the browser instead. It shows
 *  at the bottom left of the window and on the Profile page (:profile),
 *  which also has your study heatmap, totals and the badges you've earned. */

import { icon } from './icons.js';
import { escapeHtml } from './study.js';
import { weekInfo, FIELDS } from './profile.js';
import { dayKey } from '../core/state.js';
import { isDesktop, call } from '../desktop/bridge.js';
import { menu } from './menu.js';

const AVATAR = '.papernotes/profile/avatar.png';
const STAMP = 'paper-notes/avatar/v1';   // desktop: when it last changed; web: the picture itself
const SIZE = 256;

// ── the picture ─────────────────────────────────────────────────────────
export class Avatar {
  constructor() {
    this.url = '';
    this.listeners = new Set();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this.url); }

  async load() {
    let saved = '';
    try { saved = localStorage.getItem(STAMP) || ''; } catch { /* none */ }
    if (!isDesktop) { this.url = saved.startsWith('data:') ? saved : ''; this._emit(); return; }
    const url = `content/${AVATAR}?v=${encodeURIComponent(saved || '0')}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      this.url = res.ok && (await res.blob()).size > 0 ? url : '';
    } catch { this.url = ''; }
    this._emit();
  }

  async save(canvas) {
    const dataUrl = canvas.toDataURL('image/png');
    if (isDesktop) {
      await call('writeBinary', AVATAR, dataUrl.slice(dataUrl.indexOf(',') + 1));
      const stamp = String(Date.now());
      try { localStorage.setItem(STAMP, stamp); } catch { /* fine */ }
      this.url = `content/${AVATAR}?v=${stamp}`;
    } else {
      try { localStorage.setItem(STAMP, dataUrl); } catch { /* too big: keep it for this visit */ }
      this.url = dataUrl;
    }
    this._emit();
  }

  async remove() {
    if (isDesktop) await call('writeBinary', AVATAR, '').catch(() => {});   // empty = no picture
    try { localStorage.removeItem(STAMP); } catch { /* fine */ }
    this.url = '';
    this._emit();
  }

  /** Pick a picture (or take `file`), crop it, save it. */
  async change(toasts, file = null) {
    const f = file || await pickImage();
    if (!f) return false;
    let bmp;
    try { bmp = await createImageBitmap(f); } catch {
      toasts?.show({ tone: 'error', text: "That file isn't a picture PaperNotes can read (try PNG, JPG, WebP or GIF)." });
      return false;
    }
    const canvas = await cropDialog(bmp);
    bmp.close?.();
    if (!canvas) return false;
    try {
      await this.save(canvas);
      toasts?.show({ text: 'Profile picture updated.' });
      return true;
    } catch (err) {
      toasts?.show({ tone: 'error', text: `Couldn't save the picture: ${err.message}` });
      return false;
    }
  }
}

function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Drag to move, scroll or slide to zoom; the circle is what you get. */
function cropDialog(bmp) {
  return new Promise((resolve) => {
    const V = 288;                   // the view, in CSS px
    const dpr = window.devicePixelRatio || 1;
    const scrim = document.createElement('div');
    scrim.className = 'dialog-scrim';
    scrim.innerHTML = `
      <div class="dialog crop" role="dialog" aria-modal="true">
        <h2 class="dialog__title">Your picture</h2>
        <p class="caption">Drag to move it, scroll or use the slider to zoom.</p>
        <div class="crop__stage"><canvas width="${V * dpr}" height="${V * dpr}" style="width:${V}px;height:${V}px"></canvas></div>
        <label class="crop__zoom">${icon('search')}<input type="range" min="0" max="1000" value="0" aria-label="Zoom"></label>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" data-act="rotate" title="Rotate">${icon('refresh')}<span>Rotate</span></button>
          <span class="panel__spacer"></span>
          <button type="button" class="btn btn--secondary" data-act="cancel">Cancel</button>
          <button type="button" class="btn" data-act="ok">Use this picture</button>
        </div>
      </div>`;
    document.body.appendChild(scrim);
    const canvas = scrim.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const slider = scrim.querySelector('input');
    let rot = 0;
    const dims = () => (rot % 2 ? [bmp.height, bmp.width] : [bmp.width, bmp.height]);
    let minScale;
    let scale;
    let cx;
    let cy;    // the image point at the centre of the view
    const reset = () => {
      const [w, h] = dims();
      minScale = V / Math.min(w, h);
      scale = minScale;
      cx = w / 2;
      cy = h / 2;
      slider.value = '0';
    };
    const clamp = () => {
      const [w, h] = dims();
      const half = V / 2 / scale;
      cx = Math.max(half, Math.min(w - half, cx));
      cy = Math.max(half, Math.min(h - half, cy));
    };
    const drawTo = (c, size) => {
      const g = c.getContext('2d');
      const k = size / V;
      g.save();
      g.clearRect(0, 0, size, size);
      g.imageSmoothingQuality = 'high';
      g.translate(size / 2, size / 2);
      g.scale(scale * k, scale * k);
      g.translate(-cx, -cy);
      // Rotation about the (rotated) image's own frame.
      const [w, h] = dims();
      g.translate(w / 2, h / 2);
      g.rotate((rot * Math.PI) / 2);
      g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
      g.restore();
    };
    const paint = () => {
      clamp();
      drawTo(canvas, V * dpr);
      // Dim what falls outside the circle.
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.rect(0, 0, V * dpr, V * dpr);
      ctx.arc((V * dpr) / 2, (V * dpr) / 2, (V * dpr) / 2 - 1, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc((V * dpr) / 2, (V * dpr) / 2, (V * dpr) / 2 - dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };
    const zoomTo = (s) => { scale = Math.max(minScale, Math.min(minScale * 8, s)); slider.value = String(Math.round((Math.log(scale / minScale) / Math.log(8)) * 1000)); paint(); };
    reset();
    paint();

    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx, cy }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      cx = drag.cx - (e.clientX - drag.x) / scale;
      cy = drag.cy - (e.clientY - drag.y) / scale;
      paint();
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomTo(scale * Math.exp(-e.deltaY / 600)); }, { passive: false });
    slider.addEventListener('input', () => { scale = minScale * 8 ** (Number(slider.value) / 1000); paint(); });

    const close = (out) => { scrim.remove(); resolve(out); };
    scrim.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) { if (e.target === scrim) close(null); return; }
      if (b.dataset.act === 'cancel') close(null);
      if (b.dataset.act === 'rotate') { rot = (rot + 1) % 4; reset(); paint(); }
      if (b.dataset.act === 'ok') {
        const out = document.createElement('canvas');
        out.width = SIZE;
        out.height = SIZE;
        drawTo(out, SIZE);
        close(out);
      }
    });
    scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); } });
    scrim.querySelector('[data-act="ok"]').focus();
  });
}

/** The picture, or your initials on a colour of their own. */
export function avatarHtml(url, name, cls = '') {
  if (url) return `<span class="avatar ${cls}"><img src="${escapeHtml(url)}" alt=""></span>`;
  const initials = (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join('').toUpperCase();
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.codePointAt(0)) % 360;
  return `<span class="avatar avatar--initials ${cls}" style="--hue:${h}">${escapeHtml(initials) || icon('user')}</span>`;
}

// ── the chip at the bottom left: your picture and the week ──────────────
export function mountProfileChip({ mount, avatar, getProfile, router, toasts, onEdit }) {
  const chip = document.createElement('button');
  chip.className = 'mechip';
  mount.appendChild(chip);
  const paint = () => {
    const p = getProfile();
    const w = weekInfo(p);
    const label = w?.text || (p.fields.name || 'You').split(/\s+/)[0];
    chip.innerHTML = `${avatarHtml(avatar.url, p.fields.name)}<b class="mechip__week">${escapeHtml(label)}</b>`;
    chip.dataset.kind = w?.kind || '';
    chip.title = [p.fields.name, w?.title, 'Click for your profile; right-click for more'].filter(Boolean).join('\n');
    chip.setAttribute('aria-current', String(router.current.path === ':profile'));
  };
  chip.onclick = () => router.go(':profile');
  chip.oncontextmenu = async (e) => {
    e.preventDefault();
    const id = await menu([
      { id: 1, label: 'Open my profile' },
      { id: 2, label: avatar.url ? 'Change my picture…' : 'Add a picture…' },
      { id: 3, label: 'Edit my details…' },
      ...(avatar.url ? ['-', { id: 4, label: 'Remove my picture' }] : []),
    ], { x: e.clientX, y: e.clientY });
    if (id === 1) router.go(':profile');
    if (id === 2) avatar.change(toasts);
    if (id === 3) onEdit();
    if (id === 4) avatar.remove();
  };
  // Drop a picture on it.
  chip.addEventListener('dragover', (e) => { if ([...e.dataTransfer.items].some((i) => i.type.startsWith('image/'))) { e.preventDefault(); chip.dataset.drop = 'true'; } });
  chip.addEventListener('dragleave', () => { delete chip.dataset.drop; });
  chip.addEventListener('drop', (e) => {
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    delete chip.dataset.drop;
    if (f) { e.preventDefault(); avatar.change(toasts, f); }
  });
  avatar.on(paint);
  router.onChange(paint);
  setInterval(paint, 60000);   // the week turns over at midnight on Sunday
  paint();
  return { paint };
}

// ── the numbers ─────────────────────────────────────────────────────────
const DAY = 86400000;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const levelOf = (sec) => (sec <= 0 ? 0 : sec < 15 * 60 ? 1 : sec < 45 * 60 ? 2 : sec < 90 * 60 ? 3 : 4);

/** Runs of days with 10+ minutes over a sorted list of day keys. */
function streaks(state, keys) {
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    if (state.secondsOn(k) < 600) { run = 0; prev = null; continue; }
    const gap = prev ? Math.round((new Date(`${k}T12:00`) - new Date(`${prev}T12:00`)) / DAY) : 1;
    run = gap === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

function crunch(state) {
  const d = state.data;
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const days = Object.keys(d.daily).sort();
  const total = days.reduce((n, k) => n + state.secondsOn(k), 0);
  const ts = state.timeStats();
  const best = Math.max(streaks(state, days), ts.streak);
  const perFolder = {};
  for (const k of Object.keys(d.time)) for (const [p, s] of Object.entries(d.time[k])) {
    const top = p.split('/')[0] || '';
    if (top && !top.startsWith(':')) perFolder[top] = (perFolder[top] || 0) + s;
  }
  const busiest = days.reduce((a, k) => (state.secondsOn(k) > a.s ? { k, s: state.secondsOn(k) } : a), { k: '', s: 0 });
  return {
    total, today: ts.today, week: ts.week, streak: ts.streak, best, busiest,
    focus: sum(d.focus), focusToday: ts.focusToday,
    cards: d.cards.length, mature: d.cards.filter((c) => c.interval >= 21).length, reviews: d.cards.reduce((n, c) => n + (c.reps || 0) + (c.lapses || 0), 0),
    due: state.dueCards().length,
    done: Object.keys(d.done).length,
    stickies: Object.values(d.stickies).reduce((n, a) => n + a.length, 0),
    marks: Object.values(d.marks).reduce((n, a) => n + a.length, 0),
    reminders: d.reminders.filter((r) => r.done).length,
    opened: Object.keys(d.seen).length,
    perFolder: Object.entries(perFolder).sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
}

const H = 3600;
/** Badges: a name, how you get it, and whether you have. Some are silly. */
function badges(s) {
  return [
    ['First steps', 'Study for 10 minutes in one day', s.best >= 1],
    ['Hat trick', 'A 3-day streak', s.best >= 3],
    ['Week warrior', 'A 7-day streak', s.best >= 7],
    ['Fortnight of pain', 'A 14-day streak', s.best >= 14],
    ['Actually unstoppable', 'A 30-day streak', s.best >= 30],
    ['Warm-up', '1 hour studied in total', s.total >= H],
    ['Grinder', '10 hours studied', s.total >= 10 * H],
    ['Library ghost', '50 hours studied', s.total >= 50 * H],
    ['Lock-in', '3 hours in a single day', s.busiest.s >= 3 * H],
    ['Tomato', 'Finish a Pomodoro study block', s.focus >= 1],
    ['Tomato farmer', '25 Pomodoro blocks', s.focus >= 25],
    ['Card shark', 'Make 25 flashcards', s.cards >= 25],
    ['Memory palace', '10 cards past 3 weeks apart', s.mature >= 10],
    ['Box ticker', 'Mark 10 notes as done', s.done >= 10],
    ['Completionist', 'Mark 50 notes as done', s.done >= 50],
    ['Honest', 'Admit confusion 5 times (red dots)', s.marks >= 5],
    ['Sticky fingers', 'Leave 10 sticky notes', s.stickies >= 10],
    ['Explorer', 'Open 100 different files', s.opened >= 100],
  ];
}

const fmtH = (sec) => {
  if (sec < H) return `${Math.round(sec / 60)} min`;
  const h = Math.floor(sec / H);
  const m = Math.round((sec % H) / 60);
  return m && h < 10 ? `${h} h ${m} min` : `${Math.round(sec / H)} h`;
};
const fmtDay = (d, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => d.toLocaleDateString(undefined, opts);

// ── the activity graph, GitHub style ────────────────────────────────────
/** A year of study days: one column per week (Monday on top), one square
 *  per day, darker for more time. `year` is a calendar year, or '' for the
 *  last twelve months up to today. */
function activityHtml(state, year) {
  const today = new Date();
  const todayKey = dayKey(today);
  let first;
  let last;
  if (year) { first = new Date(Number(year), 0, 1); last = new Date(Number(year), 11, 31); }
  else { last = today; first = addDays(today, -364); }
  const start = addDays(first, -((first.getDay() + 6) % 7));   // the Monday on or before
  const weeks = Math.ceil(((last - start) / DAY + 1) / 7);
  let cells = '';
  let months = '';
  let total = 0;
  let studied = 0;
  let lastMonth = -1;
  const keys = [];
  for (let w = 0; w < weeks; w++) {
    const monday = addDays(start, w * 7);
    // A month's name over the first week that starts in it.
    const m = addDays(monday, 6).getMonth();
    // (Skipped when the month starts too close to the end of the graph's first column to fit.)
    if (m !== lastMonth && addDays(monday, 6) >= first && !(w === 0 && addDays(monday, 6).getDate() > 21)) {
      months += `<span style="grid-column:${w + 1}">${addDays(monday, 6).toLocaleDateString(undefined, { month: 'short' })}</span>`;
      lastMonth = m;
    }
    for (let i = 0; i < 7; i++) {
      const day = addDays(monday, i);
      const k = dayKey(day);
      if (day < first || day > last || k > todayKey) { cells += '<i class="hm__cell" data-l="x"></i>'; continue; }
      const sec = state.secondsOn(k);
      keys.push(k);
      total += sec;
      if (sec >= 600) studied++;
      cells += `<i class="hm__cell" data-l="${levelOf(sec)}" data-day="${k}"${k === todayKey ? ' data-today="true"' : ''}></i>`;
    }
  }
  const best = keys.reduce((a, k) => (state.secondsOn(k) > a.s ? { k, s: state.secondsOn(k) } : a), { k: '', s: 0 });
  const longest = streaks(state, keys);
  const current = state.timeStats().streak;
  const range = year ? `in ${year}` : 'in the last year';
  return `
    <div class="act__head">
      <h2>${total ? `${fmtH(total)} studied ${range}` : `Nothing studied ${range} yet`}</h2>
    </div>
    <div class="act" style="--weeks:${weeks}">
      <div class="act__months caption">${months}</div>
      <div class="act__days caption"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div>
      <div class="act__grid">${cells}</div>
    </div>
    <div class="act__foot">
      <div class="act__facts">
        <span><b>${studied}</b> ${studied === 1 ? 'day' : 'days'} with 10+ min</span>
        <span><b>${current}</b> day streak now</span>
        <span><b>${longest}</b> longest streak</span>
        ${best.s ? `<span>Best day <b>${fmtDay(new Date(`${best.k}T12:00`), { day: 'numeric', month: 'short' })}</b>, ${fmtH(best.s)}</span>` : ''}
      </div>
      <div class="hm__legend caption">Less <i class="hm__cell" data-l="0"></i><i class="hm__cell" data-l="1"></i><i class="hm__cell" data-l="2"></i><i class="hm__cell" data-l="3"></i><i class="hm__cell" data-l="4"></i> More</div>
    </div>`;
}

/** What a day's square says on hover: the time and what it went on. */
function dayTip(state, store, k) {
  const sec = state.secondsOn(k);
  const files = Object.entries(state.data.time[k] || {}).filter(([p]) => p).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const name = (p) => { const id = store.lookup(p); return id > 0 ? store.titleOf(id) : p.split('/').pop(); };
  return `<b>${sec ? fmtH(sec) : 'No studying'}</b> on ${escapeHtml(fmtDay(new Date(`${k}T12:00`)))}
    ${files.length ? `<ul>${files.map(([p, s]) => `<li><span>${escapeHtml(name(p))}</span><em>${fmtH(s)}</em></li>`).join('')}</ul>` : ''}`;
}

// ── the page ────────────────────────────────────────────────────────────
const ABOUT_HINT = `Write anything you want PaperNotes and Claude to know. For example:

How I like things explained: short, concrete, a worked example first.
What I'm aiming for this semester: …
What I find hard: …
What I like: (music, games, anything; Claude can use it for examples)
Rules for Claude: no emojis, quiz me before moving on, …`;

export function showProfilePage({ reader, state, store, avatar, getProfile, toasts, router, onEdit, save }) {
  reader._clear();
  reader.currentPath = ':profile';
  reader.inner.dataset.wide = 'false';
  reader.headings = [];
  reader._emitHeadings();
  const sheet = document.createElement('div');
  sheet.className = 'reader__sheet me';
  sheet.innerHTML = `<div class="me__live"></div>
    <section class="me__block me__about">
      <h2>About you <span class="caption me__saved"></span></h2>
      <p class="caption">${save ? 'Saved as you type, to <b>info.md</b> in your library. The home screen uses it, and Claude reads all of it whenever you study together.' : 'Kept in <b>info.md</b> at the top of your library.'}</p>
      <div class="me__form">
        ${FIELDS.map(([k, label]) => `<label class="me__field"><span>${escapeHtml(label.replace('Semester week 1 starts on', 'Week 1 starts on'))}</span>
          <input data-k="${k}" type="${k === 'semesterStart' ? 'date' : 'text'}" autocomplete="off" spellcheck="false"${save ? '' : ' readonly'}></label>`).join('')}
      </div>
      <label class="me__field me__field--wide"><span>About you, and instructions for Claude</span>
        <textarea data-k="context" rows="12" placeholder="${escapeHtml(ABOUT_HINT)}"${save ? '' : ' readonly'}></textarea></label>
    </section>
    <div class="me__live2"></div>`;
  reader.inner.appendChild(sheet);
  let year = '';

  // ── the editable part: filled once, saved as you type ──────────────
  const form = sheet.querySelector('.me__about');
  const saved = sheet.querySelector('.me__saved');
  const inputs = [...form.querySelectorAll('[data-k]')];
  let dirty = false;
  let timer = null;
  const fill = () => {
    if (dirty || form.contains(document.activeElement)) return;
    const p = getProfile();
    for (const el of inputs) el.value = el.dataset.k === 'context' ? p.context || '' : p.fields[el.dataset.k] || '';
    grow();
  };
  const grow = () => { const t = form.querySelector('textarea'); t.style.height = 'auto'; t.style.height = `${Math.max(220, t.scrollHeight + 4)}px`; };
  const flush = async () => {
    clearTimeout(timer);
    if (!dirty || !save) return;
    dirty = false;
    const fields = {};
    let context = '';
    for (const el of inputs) { if (el.dataset.k === 'context') context = el.value; else fields[el.dataset.k] = el.value.trim(); }
    saved.textContent = 'Saving…';
    try {
      await save(fields, context);
      saved.textContent = 'Saved';
      renderLive();
    } catch (err) {
      dirty = true;
      saved.textContent = '';
      toasts.show({ tone: 'error', text: `Couldn't save info.md: ${err.message}` });
    }
  };
  form.addEventListener('input', (e) => {
    if (!save) return;
    dirty = true;
    saved.textContent = 'Editing…';
    if (e.target.tagName === 'TEXTAREA') grow();
    clearTimeout(timer);
    timer = setTimeout(flush, 1200);
  });
  form.addEventListener('focusout', () => setTimeout(() => { if (!form.contains(document.activeElement)) flush(); }, 0));

  // ── the parts that follow your studying ────────────────────────────
  function renderLive() {
    const p = getProfile();
    const f = p.fields;
    const s = crunch(state);
    const w = weekInfo(p);
    const earned = badges(s);
    const got = earned.filter((b) => b[2]).length;
    const years = [...new Set(Object.keys(state.data.daily).map((k) => k.slice(0, 4)))].sort().reverse();
    const maxFolder = s.perFolder[0]?.[1] || 1;
    sheet.querySelector('.me__live').innerHTML = `
      <header class="me__head">
        <button class="me__avatar" data-act="pic" title="${avatar.url ? 'Change your picture (or drop one here)' : 'Add a picture (or drop one here)'}">
          ${avatarHtml(avatar.url, f.name, 'avatar--xl')}<span class="me__cam">${icon('camera')}</span>
        </button>
        <div class="me__who">
          <h1>${escapeHtml(f.name || 'Your profile')}</h1>
          <p>${escapeHtml([f.course, f.school].filter(Boolean).join(' at ')) || 'Tell PaperNotes who you are, below: it shows on Home and Claude reads it.'}</p>
          <div class="me__chips">${w?.text ? `<span class="weekchip" title="${escapeHtml(w.title)}">${escapeHtml(w.text)}${w.kind === 'vacation' ? ' · vacation' : w.kind === 'exams' ? ' · exams' : ''}</span>` : ''}${f.year ? `<span class="me__chip">Year ${escapeHtml(f.year)}</span>` : ''}${f.semester ? `<span class="me__chip">Semester ${escapeHtml(f.semester)}</span>` : ''}</div>
          <div class="me__actions">
            <button class="btn btn--secondary" data-act="pic">${icon('camera')}<span>${avatar.url ? 'Change picture' : 'Add picture'}</span></button>
            ${avatar.url ? '<button class="btn btn--ghost" data-act="nopic">Remove</button>' : ''}
            <button class="btn btn--secondary" data-act="edit">${icon('edit')}<span>Edit details</span></button>
          </div>
        </div>
      </header>

      <section class="me__stats">
        ${stat(fmtH(s.today), 'today')}
        ${stat(fmtH(s.week), 'last 7 days')}
        ${stat(fmtH(s.total), 'in total')}
        ${stat(`${s.streak} ${s.streak === 1 ? 'day' : 'days'}`, `streak · best ${s.best}`)}
        ${stat(String(s.focus), `Pomodoro blocks · ${s.focusToday} today`)}
        ${stat(String(s.cards), `flashcards · ${s.due} due`)}
        ${stat(String(s.done), 'notes done')}
        ${stat(String(s.reviews), 'card reviews')}
      </section>

      <section class="me__block me__activity">
        <div class="act__years">${['', ...years].map((y) => `<button class="act__year" data-year="${y}" aria-pressed="${y === year}">${y || 'Last year'}</button>`).join('')}</div>
        ${activityHtml(state, year)}
        <p class="caption act__note">Counts time you're actually studying a note or file: reading, scrolling, turning pages, typing. Leaving a page open doesn't count.</p>
      </section>`;
    sheet.querySelector('.me__live2').innerHTML = `
      ${s.perFolder.length ? `<section class="me__block">
        <h2>Where the time went <span class="caption">last 4 months</span></h2>
        <div class="me__bars">${s.perFolder.map(([name, sec]) => `<a class="me__bar" href="#/${encodeURIComponent(name)}"><span>${escapeHtml(name.replace(/^\d+\s+/, ''))}</span><i><b style="width:${Math.max(3, (sec / maxFolder) * 100)}%"></b></i><span class="mono">${fmtH(sec)}</span></a>`).join('')}</div>
      </section>` : ''}

      <section class="me__block">
        <h2>Badges <span class="caption">${got} of ${earned.length}</span></h2>
        <div class="badges">${earned.map(([name, how, ok]) => `<div class="badge-card" data-got="${ok}" title="${escapeHtml(how)}">
          <span class="badge-card__icon">${icon(ok ? 'trophy' : 'lock')}</span><b>${escapeHtml(name)}</b><span>${escapeHtml(how)}</span></div>`).join('')}</div>
      </section>`;
  }
  function render() { renderLive(); fill(); }

  // A day's details on hover.
  let tip = null;
  sheet.addEventListener('pointerover', (e) => {
    const c = e.target.closest('.hm__cell[data-day]');
    if (!c) { tip?.remove(); tip = null; return; }
    tip ||= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'act__tip' }));
    tip.innerHTML = dayTip(state, store, c.dataset.day);
    const r = c.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
    tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8)}px`;
  });
  sheet.addEventListener('pointerleave', () => { tip?.remove(); tip = null; });

  sheet.addEventListener('click', async (e) => {
    const y = e.target.closest('.act__year');
    if (y) { year = y.dataset.year; renderLive(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'pic') avatar.change(toasts);
    if (b.dataset.act === 'nopic') avatar.remove();
    if (b.dataset.act === 'edit') {
      if (save) { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => form.querySelector('input')?.focus({ preventScroll: true }), 350); }
      else onEdit();
    }
  });
  sheet.addEventListener('dragover', (e) => { if (e.target.closest('.me__avatar')) e.preventDefault(); });
  sheet.addEventListener('drop', (e) => {
    if (!e.target.closest('.me__avatar')) return;
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); avatar.change(toasts, f); }
  });

  const cleanup = () => { offA(); offS?.(); tip?.remove(); flush(); };
  const offA = avatar.on(() => { if (!sheet.isConnected) { cleanup(); return; } renderLive(); });
  const offS = state.onChange?.((ev) => { if (!sheet.isConnected) { cleanup(); return; } if (ev.type !== 'recent') renderLive(); });
  // Leaving the page saves what you were typing.
  const watch = new MutationObserver(() => { if (!sheet.isConnected) { watch.disconnect(); cleanup(); } });
  watch.observe(reader.inner, { childList: true });
  render();
  void router;
  return { render };
}

const stat = (big, small) => `<div class="me__stat"><b>${escapeHtml(big)}</b><span>${escapeHtml(small)}</span></div>`;
