/** Music, without leaving PaperNotes.
 *
 *  Plays the audio files in your Music folder (Windows' own, or one you
 *  choose): MP3, M4A/AAC, FLAC, Ogg/Opus, WAV. Titles, artists, albums,
 *  track numbers and cover art come from the files' tags (ID3v1/v2,
 *  MP4 atoms, Vorbis comments, APE) via music-metadata; files without tags
 *  are named from the file name ("03 - Artist - Title.mp3").
 *
 *  Text in tags: UTF-8 and UTF-16 are read as they are. Tags written as
 *  "Latin-1" by old Chinese, Japanese, Korean or Russian taggers really hold
 *  the local code page's bytes; those are spotted and re-read (UTF-8 first,
 *  then Windows' own code page), and the encoding can be forced from the
 *  Music page when a library is consistently in one of them.
 *
 *  What's been read is cached (IndexedDB, keyed by path, size and date), so
 *  only new or changed files are read again. One <audio> plays everything;
 *  it keeps going while you move around the app, and Windows' media keys
 *  and media flyout control it. */

import { parseWebStream } from 'music-metadata';
import { call } from './bridge.js';
import { icon } from '../ui/icons.js';
import { menu } from '../ui/menu.js';

const AUDIO = /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|webm|mp4)$/i;
const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm' };
const KEY = 'paper-notes/music/v1';
const DB = 'papernotes-music';
const CODEPAGES = { 936: 'gbk', 932: 'shift_jis', 949: 'euc-kr', 950: 'big5', 1251: 'windows-1251', 1250: 'windows-1250', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 874: 'windows-874', 1258: 'windows-1258' };
export const ENCODINGS = [
  ['auto', 'Automatic'], ['utf-8', 'UTF-8'], ['gbk', 'Chinese (GBK)'], ['big5', 'Chinese (Big5)'], ['shift_jis', 'Japanese (Shift-JIS)'],
  ['euc-kr', 'Korean (EUC-KR)'], ['windows-1251', 'Cyrillic (1251)'], ['latin1', 'Western (as written)'],
];

const urlOf = (rel) => `music/${rel.split('/').map(encodeURIComponent).join('/')}`;
const extOf = (rel) => (/\.([^.\/]+)$/.exec(rel)?.[1] || '').toLowerCase();
export const fmtTime = (s) => (!Number.isFinite(s) || s < 0 ? '–:––' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

// ── text ────────────────────────────────────────────────────────────────
/** Undo "Latin-1" mojibake: a string whose characters are all one byte
 *  wide but which only makes sense as UTF-8 or a local code page. */
export function fixText(s, acp, force = 'auto') {
  if (!s || typeof s !== 'string') return s;
  if (force === 'latin1') return s;
  if (!/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s.normalize('NFC');
  const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0));
  const tryDecode = (label) => {
    try { return new TextDecoder(label, { fatal: true }).decode(bytes); } catch { return null; }
  };
  if (force !== 'auto') return (tryDecode(force) ?? s).normalize('NFC');
  const utf8 = tryDecode('utf-8');
  if (utf8 !== null) return utf8.normalize('NFC');
  const local = CODEPAGES[acp];
  if (local) {
    const t = tryDecode(local);
    // Only when it reads as real text in that script, not as Latin accents.
    if (t && /[Ѐ-ӿ֐-ۿ฀-๿぀-ヿ㐀-鿿가-힯]/.test(t)) return t.normalize('NFC');
  }
  // Windows here isn't Chinese, Japanese or Korean, but the tag may still be:
  // mostly high bytes, all in valid double-byte pairs, reading as that
  // script. (Western names like "Beyoncé" are mostly ASCII, so never get here.)
  const high = bytes.filter((b) => b >= 0x80).length;
  if (high >= 2 && high / bytes.length >= 0.5) {
    const share = (t, re) => (t.match(re) || []).length / Math.max(1, [...t.replace(/[\s\x21-\x7e]/g, '')].length);
    const sjis = tryDecode('shift_jis');
    if (sjis && share(sjis, /[぀-ヿ]/g) >= 0.3) return sjis.normalize('NFC');
    for (const [label, script] of [['gbk', /[一-鿿]/g], ['big5', /[一-鿿]/g], ['euc-kr', /[가-힯]/g]]) {
      const t = tryDecode(label);
      if (t && share(t, script) >= 0.8) return t.normalize('NFC');
    }
  }
  return s.normalize('NFC');
}

/** "03 - Artist - Title.mp3" → { track: 3, artist, title }. */
export function fromFileName(rel) {
  let base = rel.split('/').pop().replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  let track = 0;
  const num = /^(\d{1,3})(?:[.\s_-]+)(.+)$/.exec(base);
  if (num) { track = Number(num[1]); base = num[2].trim(); }
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { track, artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { track, artist: '', title: base };
}

// ── the cache ───────────────────────────────────────────────────────────
function openDb() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => req.result.createObjectStore('meta');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
const dbAll = (db) => new Promise((resolve) => {
  if (!db) { resolve(new Map()); return; }
  const out = new Map();
  const req = db.transaction('meta').objectStore('meta').openCursor();
  req.onsuccess = () => { const c = req.result; if (!c) { resolve(out); return; } out.set(c.key, c.value); c.continue(); };
  req.onerror = () => resolve(out);
});
const dbPut = (db, entries) => new Promise((resolve) => {
  if (!db || !entries.length) { resolve(); return; }
  const tx = db.transaction('meta', 'readwrite');
  for (const [k, v] of entries) tx.objectStore('meta').put(v, k);
  tx.oncomplete = resolve;
  tx.onerror = resolve;
});

async function coverToDataUrl(pic) {
  try {
    const blob = new Blob([pic.data], { type: pic.format || 'image/jpeg' });
    const bmp = await createImageBitmap(blob);
    const size = 180;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const s = Math.min(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
    bmp.close?.();
    return c.toDataURL('image/jpeg', 0.82);
  } catch { return ''; }
}

/** How long a song is, from the browser itself: Ogg and Opus only say at
 *  their very end, which the tag reader doesn't go to. */
function probeDuration(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    const done = (d) => { clearTimeout(timer); a.removeAttribute('src'); a.load(); resolve(Number.isFinite(d) ? d : 0); };
    const timer = setTimeout(() => done(0), 6000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      if (Number.isFinite(a.duration)) { done(a.duration); return; }
      // Some streams report Infinity until asked to seek to the end.
      a.ondurationchange = () => { if (Number.isFinite(a.duration)) done(a.duration); };
      a.currentTime = 1e9;
    };
    a.onerror = () => done(0);
    a.src = url;
  });
}

/** Read one file's tags (only as much of the file as the tags need). */
async function readMeta(rel, size) {
  const ctrl = new AbortController();
  try {
    const res = await fetch(urlOf(rel), { signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error(res.status);
    const meta = await parseWebStream(res.body, { mimeType: MIME[extOf(rel)], size, path: rel }, { duration: false, skipCovers: false });
    ctrl.abort();
    const c = meta.common;
    const pic = c.picture?.[0];
    return {
      raw: {
        title: c.title || '', artist: c.artist || (c.artists || []).join(', '), album: c.album || '', albumartist: c.albumartist || '',
        genre: (c.genre || []).join(', '), year: c.year || 0, track: c.track?.no || 0, disk: c.disk?.no || 0,
      },
      duration: meta.format.duration || await probeDuration(urlOf(rel)),
      codec: [meta.format.codec, meta.format.bitrate ? `${Math.round(meta.format.bitrate / 1000)} kbps` : '', meta.format.sampleRate ? `${(meta.format.sampleRate / 1000).toFixed(1)} kHz` : ''].filter(Boolean).join(' · '),
      art: pic ? await coverToDataUrl(pic) : '',
    };
  } catch {
    ctrl.abort();
    return { raw: {}, duration: 0, codec: '', art: '' };
  }
}

// ── the player ──────────────────────────────────────────────────────────
export class Music {
  constructor({ toasts, prefs }) {
    Object.assign(this, { toasts, prefs });
    this.tracks = [];         // [{ rel, size, mtime, title, artist, album, ... }]
    this.byRel = new Map();
    this.queue = [];          // rels in play order
    this.pos = -1;
    this.dir = '';
    this.acp = 1252;
    this.scanning = false;
    this.listeners = new Set();
    const saved = this._loadPrefs();
    this.shuffle = Boolean(saved.shuffle);
    this.repeat = saved.repeat || 'all';   // off | all | one
    this.encoding = saved.encoding || 'auto';
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.volume = saved.volume ?? 0.8;
    this._resume = saved.rel ? { rel: saved.rel, time: saved.time || 0 } : null;
    for (const ev of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'volumechange']) this.audio.addEventListener(ev, () => this._emit(ev));
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('error', () => {
      if (!this.current) return;
      this.toasts.show({ tone: 'warn', text: `Can't play ${this.current.title} (unsupported format). Skipping.` });
      setTimeout(() => this.next(), 400);
    });
    setInterval(() => this._savePrefs(), 5000);
    this._mediaSession();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(what) { for (const fn of this.listeners) fn(what); }

  _loadPrefs() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
  _savePrefs() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        rel: this.current?.rel || '', time: this.audio.currentTime || 0, volume: this.audio.volume,
        shuffle: this.shuffle, repeat: this.repeat, encoding: this.encoding,
      }));
    } catch { /* fine */ }
  }

  get current() { return this.pos >= 0 ? this.byRel.get(this.queue[this.pos]) || null : null; }
  get playing() { return !this.audio.paused && !this.audio.ended; }

  // ── the library ────────────────────────────────────────────────────
  async scan() {
    if (this.scanning) return;
    this.scanning = true;
    this._emit('scan');
    try {
      const info = await call('musicInfo');
      this.dir = info.dir;
      this.acp = info.acp;
      const files = (await call('musicScan')).filter(([rel]) => AUDIO.test(rel));
      const db = await openDb();
      const cache = await dbAll(db);
      const tracks = [];
      const todo = [];
      for (const [rel, , size, mtime] of files) {
        const hit = cache.get(rel);
        const t = { rel, size, mtime, added: mtime };
        if (hit && hit.size === size && hit.mtime === mtime && hit.duration) Object.assign(t, hit);
        else todo.push(t);
        tracks.push(t);
      }
      for (const t of tracks) this._name(t);
      this.tracks = tracks;
      this.byRel = new Map(tracks.map((t) => [t.rel, t]));
      if (this._resume && this.byRel.has(this._resume.rel) && this.pos < 0) {
        this.queue = this.sorted().map((t) => t.rel);
        this.pos = this.queue.indexOf(this._resume.rel);
        this.audio.src = urlOf(this._resume.rel);
        const time = this._resume.time;
        this.audio.addEventListener('loadedmetadata', () => { this.audio.currentTime = Math.min(time, this.audio.duration - 1 || time); }, { once: true });
        this._resume = null;
        this._updateSession();
      }
      this._emit('library');

      // Read new and changed files, two at a time, saving as it goes.
      let pending = [];
      let next = 0;
      const worker = async () => {
        while (next < todo.length) {
          const t = todo[next++];
          const m = await readMeta(t.rel, t.size);
          Object.assign(t, { raw: m.raw, duration: m.duration, codec: m.codec, art: m.art });
          this._name(t);
          pending.push([t.rel, { size: t.size, mtime: t.mtime, raw: t.raw, duration: t.duration, codec: t.codec, art: t.art }]);
          if (pending.length >= 10) { const p = pending; pending = []; await dbPut(db, p); this._emit('library'); }
        }
      };
      await Promise.all([worker(), worker()]);
      await dbPut(db, pending);
      db?.close();
      this._emit('library');
    } catch (err) {
      this.toasts.show({ tone: 'error', text: `Couldn't read the music folder: ${err.message}` });
    } finally {
      this.scanning = false;
      this._emit('scan');
    }
  }

  /** Names to show: the tags (re-read in the right encoding), else the file name. */
  _name(t) {
    const r = t.raw || {};
    const fx = (s) => fixText(s, this.acp, this.encoding);
    const f = fromFileName(t.rel);
    t.title = fx(r.title) || f.title;
    t.artist = fx(r.artist) || fx(r.albumartist) || f.artist || '';
    t.album = fx(r.album) || (t.rel.includes('/') ? t.rel.split('/').slice(-2, -1)[0] : '');
    t.genre = fx(r.genre) || '';
    t.track = r.track || f.track || 0;
    t.disk = r.disk || 0;
    t.year = r.year || 0;
    t.file = t.rel.split('/').pop();
  }

  setEncoding(enc) {
    this.encoding = enc;
    for (const t of this.tracks) this._name(t);
    this._savePrefs();
    this._emit('library');
    this._updateSession();
  }

  sorted(by = 'album', filter = '') {
    const q = filter.trim().toLowerCase();
    const list = q ? this.tracks.filter((t) => `${t.title} ${t.artist} ${t.album} ${t.file} ${t.genre}`.toLowerCase().includes(q)) : this.tracks.slice();
    const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const cmp = {
      title: (a, b) => coll.compare(a.title, b.title),
      artist: (a, b) => coll.compare(a.artist, b.artist) || coll.compare(a.album, b.album) || a.disk - b.disk || a.track - b.track,
      album: (a, b) => coll.compare(a.album, b.album) || a.disk - b.disk || a.track - b.track || coll.compare(a.file, b.file),
      added: (a, b) => b.mtime - a.mtime,
      file: (a, b) => coll.compare(a.rel, b.rel),
    }[by] || ((a, b) => coll.compare(a.rel, b.rel));
    return list.sort(cmp);
  }

  // ── playing ────────────────────────────────────────────────────────
  /** Play `rel`, with `list` (rels, in view order) as the queue. */
  play(rel, list = null) {
    if (list) {
      this.queue = list.slice();
      if (this.shuffle) this._shuffleFrom(rel);
    }
    let i = this.queue.indexOf(rel);
    if (i < 0) { this.queue.push(rel); i = this.queue.length - 1; }
    this.pos = i;
    this.audio.src = urlOf(rel);
    this.audio.play().catch(() => {});
    this._updateSession();
    this._emit('track');
  }

  _shuffleFrom(rel) {
    const rest = this.queue.filter((r) => r !== rel);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    this.queue = rel ? [rel, ...rest] : rest;
  }

  /** Queue `rel` to play after the current song. */
  playNext(rel) {
    const at = this.queue.indexOf(rel);
    if (at >= 0) { this.queue.splice(at, 1); if (at < this.pos) this.pos--; }
    this.queue.splice(this.pos + 1, 0, rel);
  }

  toggle() {
    if (!this.current) {
      const first = this.sorted()[0];
      if (first) this.play(first.rel, this.sorted().map((t) => t.rel));
      return;
    }
    if (this.audio.paused) this.audio.play().catch(() => {}); else this.audio.pause();
  }

  next() {
    if (!this.queue.length) return;
    if (this.pos + 1 >= this.queue.length) {
      if (this.repeat === 'off') { this.audio.pause(); return; }
      if (this.shuffle) this._shuffleFrom(null);
      this.pos = -1;
    }
    this.play(this.queue[this.pos + 1]);
  }

  prev() {
    if (this.audio.currentTime > 3 || this.pos <= 0) { this.audio.currentTime = 0; return; }
    this.play(this.queue[this.pos - 1]);
  }

  onEnded() {
    if (this.repeat === 'one') { this.audio.currentTime = 0; this.audio.play(); return; }
    this.next();
  }

  setShuffle(on) {
    this.shuffle = on;
    const cur = this.current?.rel;
    if (on) this._shuffleFrom(cur);
    else { this.queue = this.sorted().map((t) => t.rel); }
    this.pos = cur ? this.queue.indexOf(cur) : -1;
    this._savePrefs();
    this._emit('mode');
  }

  cycleRepeat() {
    this.repeat = { off: 'all', all: 'one', one: 'off' }[this.repeat];
    this._savePrefs();
    this._emit('mode');
  }

  seek(fraction) { if (this.audio.duration) this.audio.currentTime = fraction * this.audio.duration; }

  // ── Windows' media keys and flyout ─────────────────────────────────
  _mediaSession() {
    const ms = navigator.mediaSession;
    if (!ms) return;
    ms.setActionHandler('play', () => this.toggle());
    ms.setActionHandler('pause', () => this.audio.pause());
    ms.setActionHandler('nexttrack', () => this.next());
    ms.setActionHandler('previoustrack', () => this.prev());
    ms.setActionHandler('seekto', (d) => { if (d.seekTime !== undefined) this.audio.currentTime = d.seekTime; });
  }

  _updateSession() {
    const t = this.current;
    if (!navigator.mediaSession || !t) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: t.album,
      artwork: t.art ? [{ src: t.art, sizes: '180x180', type: 'image/jpeg' }] : [],
    });
  }

  reveal(rel) { call('revealMusic', rel).catch(() => {}); }

  async chooseFolder() {
    const dir = await call('pickMusic');
    if (dir) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.pos = -1; this.queue = []; this.tracks = []; this.byRel = new Map(); this._emit('track'); await this.scan(); }
  }

  // ── the mini player, in the status bar ─────────────────────────────
  mountMini(mount, { openPage }) {
    const el = document.createElement('div');
    el.className = 'mini';
    el.innerHTML = `
      <button class="mini__btn" data-act="prev" title="Previous">${icon('prev')}</button>
      <button class="mini__btn mini__play" data-act="play" title="Play / pause"></button>
      <button class="mini__btn" data-act="next" title="Next">${icon('next')}</button>
      <button class="mini__title" data-act="open" title="Open Music"><span class="mini__text"></span><i class="mini__bar"><b></b></i></button>`;
    mount.appendChild(el);
    el.querySelector('[data-act="prev"]').onclick = () => this.prev();
    el.querySelector('[data-act="next"]').onclick = () => this.next();
    el.querySelector('[data-act="play"]').onclick = () => this.toggle();
    el.querySelector('[data-act="open"]').onclick = openPage;
    el.querySelector('[data-act="open"]').oncontextmenu = async (e) => {
      e.preventDefault();
      const id = await menu([
        { id: 1, label: this.shuffle ? 'Shuffle: on' : 'Shuffle: off', checked: this.shuffle },
        { id: 2, label: `Repeat: ${this.repeat}` },
        '-',
        { id: 3, label: 'Open Music' },
      ], { x: e.clientX, y: e.clientY });
      if (id === 1) this.setShuffle(!this.shuffle);
      if (id === 2) this.cycleRepeat();
      if (id === 3) openPage();
    };
    const paint = () => {
      const t = this.current;
      el.dataset.on = String(Boolean(t));
      el.querySelector('.mini__play').innerHTML = icon(this.playing ? 'pause' : 'play');
      el.querySelector('.mini__text').textContent = t ? `${t.title}${t.artist ? ` · ${t.artist}` : ''}` : 'Music';
      el.querySelector('.mini__title').title = t ? `${t.title}\n${t.artist}${t.album ? ` · ${t.album}` : ''}\nClick for Music, right-click for shuffle and repeat` : 'Open Music';
      const d = this.audio.duration;
      el.querySelector('.mini__bar b').style.width = d ? `${(this.audio.currentTime / d) * 100}%` : '0';
    };
    this.on(paint);
    paint();
  }
}
