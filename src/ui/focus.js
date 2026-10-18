/** Study time and the Pomodoro timer.
 *
 *  Time: see startTimeTracking. Home, the profile and the MCP tools turn it
 *  into today, this week, a streak, and time per module.
 *
 *  Pomodoro: study for one length, break for another, for a number of
 *  rounds, where the rounds are the periods themselves: 3 rounds is study,
 *  break, study; 4 is study, break, study, break. Pause, resume, skip,
 *  reset; a chime and a notification at every change; finished study
 *  periods are counted. It keeps going across reloads (and while the
 *  window is closed to the notification area). */

import { icon } from './icons.js';
import { showPopover } from './popover.js';

/** Study time counts only while you're actually studying a file: reading
 *  it (scrolling, turning PDF pages), selecting, typing, clicking, moving
 *  between notes. Each action earns the next minute; leaving a page open
 *  earns nothing once that minute is up, and neither does just moving the
 *  mouse. App pages (Home, Music, Relax, your profile) never count. Inside
 *  a PDF the viewer swallows the events, so time there counts for up to
 *  three minutes after you last clicked into it or scrolled out here. */
const TICK = 10;
const ACTIVE = 60;
const IN_VIEWER = 180;

export function startTimeTracking({ state, router }) {
  let lastActive = 0;
  const poke = () => { lastActive = Date.now(); };
  for (const ev of ['keydown', 'wheel', 'pointerdown', 'scroll', 'selectionchange', 'touchmove']) {
    (ev === 'selectionchange' ? document : window).addEventListener(ev, poke, { passive: true, capture: true });
  }
  router.onChange(poke);   // moving between notes is studying too
  setInterval(() => {
    const path = router.current.path;
    if (!path || path.startsWith(':')) return;
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const inViewer = /^(IFRAME|EMBED|OBJECT)$/.test(document.activeElement?.tagName || '');
    if (Date.now() - lastActive > (inViewer ? IN_VIEWER : ACTIVE) * 1000) return;
    state.addTime(path, TICK);
  }, TICK * 1000);
}

export function humanTime(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

const KEY = 'paper-notes/pomodoro/v1';
const PRESETS = [
  { label: 'Classic', study: 25, brk: 5, rounds: 8 },
  { label: 'Long', study: 50, brk: 10, rounds: 6 },
  { label: 'Deep', study: 90, brk: 20, rounds: 3 },
  { label: 'Sprint', study: 15, brk: 3, rounds: 6 },
];

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A soft two-note chime, made on the spot (no sound files to ship). */
function chime(up = true) {
  try {
    const ac = new AudioContext();
    const notes = up ? [660, 990] : [880, 587];
    notes.forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ac.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 1);
    });
    setTimeout(() => ac.close(), 1800);
  } catch { /* no audio, no chime */ }
}

export class Pomodoro {
  constructor({ mount, state, prefs, toasts, notify }) {
    Object.assign(this, { state, prefs, toasts, notify });
    this.s = this._load();
    this.el = document.createElement('button');
    this.el.className = 'focus-btn';
    this.el.title = 'Pomodoro: click for the timer';
    mount.appendChild(this.el);
    this.el.onclick = () => this.openPanel();
    this.el.oncontextmenu = (e) => { e.preventDefault(); this.toggle(); };
    this.panel = null;
    setInterval(() => this.tick(), 500);
    this.render();
  }

  // ── settings ─────────────────────────────────────────────────────────
  get study() { return Math.max(1, Number(this.prefs.get('pomoStudy')) || 25); }
  get brk() { return Math.max(1, Number(this.prefs.get('pomoBreak')) || 5); }
  get rounds() { return Math.max(1, Math.min(24, Number(this.prefs.get('pomoRounds')) || 4)); }
  get auto() { return this.prefs.get('pomoAuto') !== false; }
  get sound() { return this.prefs.get('pomoSound') !== false; }

  /** Phase i (0-based): even = study, odd = break. */
  isStudy(i) { return i % 2 === 0; }
  lengthOf(i) { return (this.isStudy(i) ? this.study : this.brk) * 60; }

  // ── state ────────────────────────────────────────────────────────────
  _load() {
    try { return { phase: -1, endsAt: 0, paused: 0, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { phase: -1, endsAt: 0, paused: 0 }; }
  }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* fine */ } }

  get running() { return this.s.phase >= 0; }
  left() {
    if (!this.running) return this.lengthOf(0);
    return this.s.paused || Math.max(0, (this.s.endsAt - Date.now()) / 1000);
  }

  start(phase = 0) {
    this.s = { phase, endsAt: Date.now() + this.lengthOf(phase) * 1000, paused: 0 };
    this._save();
    this.render();
  }

  pause() {
    if (!this.running || this.s.paused) return;
    this.s.paused = Math.max(1, (this.s.endsAt - Date.now()) / 1000);
    this._save();
    this.render();
  }

  resume() {
    if (!this.running || !this.s.paused) return;
    this.s.endsAt = Date.now() + this.s.paused * 1000;
    this.s.paused = 0;
    this._save();
    this.render();
  }

  toggle() {
    if (!this.running) this.start(0);
    else if (this.s.paused) this.resume();
    else this.pause();
  }

  reset() {
    this.s = { phase: -1, endsAt: 0, paused: 0 };
    this._save();
    this.render();
  }

  /** Move to the next period (or finish). counted: the study period ran out by itself. */
  next(counted = false) {
    const done = this.s.phase;
    if (counted && this.isStudy(done)) this.state.focusDone();
    const nxt = done + 1;
    if (nxt >= this.rounds) {
      const studied = Math.ceil(this.rounds / 2) * this.study;
      if (counted) {
        this.notify('All rounds done', `${Math.ceil(this.rounds / 2)} study periods, about ${studied} minutes. Nice.`);
        this.toasts.show({ text: `Pomodoro finished: ${Math.ceil(this.rounds / 2)} study periods. Go touch grass.` });
        if (this.sound) chime(true);
      }
      this.reset();
      return;
    }
    if (counted) {
      const study = this.isStudy(nxt);
      const title = study ? 'Back to studying' : 'Break time';
      const text = study ? `Study period ${Math.floor(nxt / 2) + 1}: ${this.study} minutes.` : `${this.brk} minutes off. Stand up, drink water.`;
      this.notify(title, text);
      this.toasts.show({ text: `${title}. ${text}` });
      if (this.sound) chime(!study);
    }
    this.s = { phase: nxt, endsAt: Date.now() + this.lengthOf(nxt) * 1000, paused: 0 };
    if (counted && !this.auto) this.s.paused = this.lengthOf(nxt);   // waits for you
    this._save();
    this.render();
  }

  tick() {
    if (this.running && !this.s.paused && Date.now() >= this.s.endsAt) this.next(true);
    this.render();
  }

  // ── drawing ──────────────────────────────────────────────────────────
  label() {
    if (!this.running) return 'Pomodoro';
    const p = this.s.phase;
    return `${this.isStudy(p) ? 'Study' : 'Break'} ${p + 1}/${this.rounds} · ${mmss(this.left())}${this.s.paused ? ' (paused)' : ''}`;
  }

  render() {
    const mode = !this.running ? 'idle' : this.isStudy(this.s.phase) ? 'focus' : 'break';
    const key = `${mode}|${this.label()}`;
    if (this._key !== key) {
      this._key = key;
      this.el.dataset.mode = mode;
      this.el.dataset.paused = String(Boolean(this.s.paused));
      this.el.innerHTML = `${icon('history')}<span>${this.label()}</span>`;
    }
    if (this.panel?.el.isConnected) this._fillPanel();
  }

  openPanel() {
    const box = document.createElement('div');
    box.className = 'pomo';
    this.panel = showPopover(box, { anchor: this.el, cls: 'popover--pomo', onClose: () => { this.panel = null; } });
    this._built = false;
    this._fillPanel();
    // Above the status bar, not below it.
    const r = this.el.getBoundingClientRect();
    const p = this.panel.el;
    p.style.top = `${Math.max(8, r.top - p.offsetHeight - 8)}px`;
    p.style.left = `${Math.max(8, Math.min(window.innerWidth - p.offsetWidth - 8, r.right - p.offsetWidth))}px`;
  }

  _fillPanel() {
    const box = this.panel.el.querySelector('.pomo');
    if (!this._built) {
      this._built = true;
      box.innerHTML = `
        <div class="pomo__phase"></div>
        <div class="pomo__clock"></div>
        <div class="pomo__bar"><i></i></div>
        <div class="pomo__dots"></div>
        <div class="pomo__controls">
          <button class="btn" data-act="go"></button>
          <button class="btn btn--secondary" data-act="skip" title="Skip to the next period">${icon('arrowRight')}<span>Skip</span></button>
          <button class="btn btn--ghost" data-act="reset" title="Stop and reset">${icon('refresh')}<span>Reset</span></button>
        </div>
        <div class="pomo__settings">
          <label><span>Study</span><input type="number" min="1" max="240" data-k="pomoStudy"><small>min</small></label>
          <label><span>Break</span><input type="number" min="1" max="120" data-k="pomoBreak"><small>min</small></label>
          <label><span>Rounds</span><input type="number" min="1" max="24" data-k="pomoRounds"><small>periods</small></label>
        </div>
        <p class="pomo__explain"></p>
        <div class="pomo__presets">${PRESETS.map((p, i) => `<button class="tagchip" data-preset="${i}">${p.label} ${p.study}/${p.brk}</button>`).join('')}</div>
        <div class="pomo__toggles">
          <label><input type="checkbox" data-t="pomoAuto"> Start the next period by itself</label>
          <label><input type="checkbox" data-t="pomoSound"> Chime</label>
        </div>`;
      box.querySelector('[data-act="go"]').onclick = () => this.toggle();
      box.querySelector('[data-act="skip"]').innerHTML = `${icon('next')}<span>Skip</span>`;
      box.querySelector('[data-act="skip"]').onclick = () => { if (this.running) this.next(false); else this.start(1); };
      box.querySelector('[data-act="reset"]').onclick = () => this.reset();
      for (const input of box.querySelectorAll('[data-k]')) {
        input.value = this.prefs.get(input.dataset.k) || { pomoStudy: 25, pomoBreak: 5, pomoRounds: 4 }[input.dataset.k];
        input.onchange = () => { this.prefs.set(input.dataset.k, Math.max(1, Number(input.value) || 1)); this._built = false; this.render(); };
      }
      for (const b of box.querySelectorAll('[data-preset]')) {
        b.onclick = () => {
          const p = PRESETS[Number(b.dataset.preset)];
          this.prefs.set('pomoStudy', p.study); this.prefs.set('pomoBreak', p.brk); this.prefs.set('pomoRounds', p.rounds);
          this._built = false;
          this.render();
        };
      }
      for (const c of box.querySelectorAll('[data-t]')) {
        c.checked = this.prefs.get(c.dataset.t) !== false;
        c.onchange = () => this.prefs.set(c.dataset.t, c.checked);
      }
      const n = this.rounds;
      const seq = Array.from({ length: n }, (_, i) => (this.isStudy(i) ? 'study' : 'break'));
      box.querySelector('.pomo__explain').textContent = `${n} round${n === 1 ? '' : 's'}: ${seq.join(', ')}. About ${Math.ceil(n / 2) * this.study + Math.floor(n / 2) * this.brk} minutes.`;
      box.querySelector('.pomo__dots').innerHTML = seq.map((k, i) => `<i data-k="${k}" data-i="${i}" title="${k}"></i>`).join('');
    }
    const p = this.s.phase;
    const running = this.running;
    const left = this.left();
    const len = running ? this.lengthOf(p) : this.lengthOf(0);
    box.dataset.mode = !running ? 'idle' : this.isStudy(p) ? 'focus' : 'break';
    box.dataset.paused = String(Boolean(this.s.paused));
    box.querySelector('.pomo__phase').textContent = !running ? 'Ready when you are'
      : `${this.isStudy(p) ? 'Study' : 'Break'} · round ${p + 1} of ${this.rounds}${this.s.paused ? ' · paused' : ''}`;
    box.querySelector('.pomo__clock').textContent = mmss(left);
    box.querySelector('.pomo__bar i').style.width = `${Math.round((1 - left / len) * 100)}%`;
    const go = box.querySelector('[data-act="go"]');
    const goKey = !running ? 'start' : this.s.paused ? 'resume' : 'pause';
    if (go.dataset.k !== goKey) {
      go.dataset.k = goKey;
      go.innerHTML = goKey === 'pause' ? `${icon('pause')}<span>Pause</span>` : `${icon('play')}<span>${goKey === 'start' ? 'Start' : 'Resume'}</span>`;
    }
    for (const d of box.querySelectorAll('.pomo__dots i')) {
      const i = Number(d.dataset.i);
      d.dataset.state = !running ? '' : i < p ? 'done' : i === p ? 'now' : '';
    }
  }
}
