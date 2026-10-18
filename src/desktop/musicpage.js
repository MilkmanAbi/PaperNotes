/** The Music page (:music): what's playing, big, and the whole library
 *  under it. Filter as you type, sort by album, artist, title or date
 *  added; click a song to play it with the list as the queue. */

import { icon } from '../ui/icons.js';
import { menu } from '../ui/menu.js';
import { escapeHtml } from '../ui/study.js';
import { ENCODINGS, fmtTime } from './music.js';

const SORTS = [['album', 'Album'], ['artist', 'Artist'], ['title', 'Title'], ['added', 'Recently added'], ['file', 'Folder']];
const VIEW_KEY = 'paper-notes/music/view';
const PAGE = 400;

export function showMusic({ reader, music, toasts }) {
  reader._clear();
  reader.currentPath = ':music';
  reader.inner.dataset.wide = 'true';
  reader.headings = [];
  reader._emitHeadings();

  let view = { sort: 'album', q: '' };
  try { view = { ...view, ...JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'), q: '' }; } catch { /* defaults */ }
  let limit = PAGE;

  const sheet = document.createElement('div');
  sheet.className = 'reader__sheet music';
  sheet.innerHTML = `
    <section class="np">
      <div class="np__art"></div>
      <div class="np__body">
        <div class="np__kicker caption">Now playing</div>
        <h1 class="np__title"></h1>
        <div class="np__sub"></div>
        <div class="np__codec caption"></div>
        <div class="np__seek">
          <span class="np__t np__cur mono">0:00</span>
          <input type="range" class="np__range" min="0" max="1000" value="0" aria-label="Seek">
          <span class="np__t np__dur mono">0:00</span>
        </div>
        <div class="np__controls">
          <button class="icon-btn np__mode" data-act="shuffle" title="Shuffle">${icon('shuffle')}</button>
          <button class="icon-btn np__big" data-act="prev" title="Previous (or back to the start)">${icon('prev')}</button>
          <button class="np__play" data-act="play" title="Play / pause"></button>
          <button class="icon-btn np__big" data-act="next" title="Next">${icon('next')}</button>
          <button class="icon-btn np__mode" data-act="repeat" title="Repeat"></button>
          <span class="np__vol">
            <button class="icon-btn" data-act="mute" title="Mute"></button>
            <input type="range" class="np__volume" min="0" max="100" aria-label="Volume">
          </span>
        </div>
      </div>
    </section>
    <div class="music__bar">
      <div class="searchbar music__filter">${icon('search')}<input type="text" placeholder="Filter by title, artist, album…" spellcheck="false" aria-label="Filter songs"></div>
      <label class="music__select"><span>Sort</span><select data-k="sort">${SORTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <label class="music__select" title="How to read tags saved by older taggers in a local encoding. Automatic gets it right almost always."><span>Tag text</span>
        <select data-k="enc">${ENCODINGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <span class="panel__spacer"></span>
      <button class="btn btn--ghost" data-act="rescan" title="Look for new songs">${icon('refresh')}<span>Rescan</span></button>
      <button class="btn btn--secondary" data-act="folder" title="Choose the music folder">${icon('folder')}<span>Folder</span></button>
    </div>
    <div class="music__meta caption"></div>
    <div class="music__list" role="list"></div>`;
  reader.inner.appendChild(sheet);

  const $ = (s) => sheet.querySelector(s);
  const list = $('.music__list');
  const filter = $('.music__filter input');
  const sortSel = $('[data-k="sort"]');
  const encSel = $('[data-k="enc"]');
  const range = $('.np__range');
  const vol = $('.np__volume');
  const pickedSort = (() => { try { return JSON.parse(localStorage.getItem(VIEW_KEY) || '{}').sort; } catch { return ''; } })();
  if (!pickedSort && music.tracks.length && music.tracks.filter((t) => t.raw?.album).length < music.tracks.length / 5) view.sort = 'title';
  sortSel.value = view.sort;
  encSel.value = music.encoding;
  let seeking = false;

  const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ sort: view.sort })); } catch { /* fine */ } };
  const shown = () => music.sorted(view.sort, view.q);

  // ── now playing ────────────────────────────────────────────────────
  function paintNow() {
    const t = music.current;
    sheet.dataset.playing = String(music.playing);
    $('.np__art').innerHTML = t?.art ? `<img src="${t.art}" alt="">` : `<span class="np__noart">${icon('music')}</span>`;
    $('.np__kicker').textContent = t ? (music.playing ? 'Now playing' : 'Paused') : 'Nothing playing';
    $('.np__title').textContent = t ? t.title : 'Music';
    $('.np__sub').textContent = t ? [t.artist, t.album].filter(Boolean).join(' · ') : music.tracks.length ? 'Pick a song below, or press play for the whole library.' : '';
    $('.np__codec').textContent = t ? [t.codec, t.year || ''].filter(Boolean).join(' · ') : '';
    $('.np__codec').title = t ? t.rel : '';
    $('[data-act="play"]').innerHTML = icon(music.playing ? 'pause' : 'play');
    $('[data-act="shuffle"]').setAttribute('aria-pressed', String(music.shuffle));
    const rep = $('[data-act="repeat"]');
    rep.innerHTML = icon(music.repeat === 'one' ? 'repeatOne' : 'repeat');
    rep.setAttribute('aria-pressed', String(music.repeat !== 'off'));
    rep.title = { off: 'Repeat: off', all: 'Repeat: the whole list', one: 'Repeat: this song' }[music.repeat];
    const a = music.audio;
    $('[data-act="mute"]').innerHTML = icon(a.muted || a.volume === 0 ? 'mute' : 'volume');
    vol.value = String(Math.round(a.volume * 100));
    vol.style.setProperty('--fill', `${a.muted ? 0 : a.volume * 100}%`);
    paintTime();
    for (const row of list.querySelectorAll('.song.is-current')) row.classList.remove('is-current');
    if (t) list.querySelector(`.song[data-rel="${CSS.escape(t.rel)}"]`)?.classList.add('is-current');
  }

  function paintTime() {
    const a = music.audio;
    const d = music.current ? a.duration : 0;
    $('.np__cur').textContent = fmtTime(music.current ? a.currentTime : NaN);
    $('.np__dur').textContent = fmtTime(music.current ? d || music.current.duration : NaN);
    if (!seeking) range.value = d ? String(Math.round((a.currentTime / d) * 1000)) : '0';
    range.disabled = !music.current;
    range.style.setProperty('--fill', `${Number(range.value) / 10}%`);
  }

  // ── the list ───────────────────────────────────────────────────────
  function paintList() {
    const all = shown();
    const items = all.slice(0, limit);
    const total = music.tracks.length;
    const secs = all.reduce((n, t) => n + (t.duration || 0), 0);
    const meta = $('.music__meta');
    if (!total) {
      meta.textContent = music.scanning ? 'Looking for music…' : '';
      list.innerHTML = music.scanning ? '' : `<div class="music__empty">
        <span class="np__noart">${icon('music')}</span>
        <h2>No music here yet</h2>
        <p>PaperNotes plays the songs in <b>${escapeHtml(music.dir || 'your Music folder')}</b>: MP3, M4A, FLAC, Ogg, Opus and WAV, in any folders inside it.</p>
        <p>Copy some songs there and press Rescan, or choose another folder.</p></div>`;
      return;
    }
    meta.textContent = `${all.length === total ? `${total} ${total === 1 ? 'song' : 'songs'}` : `${all.length} of ${total} songs`}${secs ? ` · ${humanDuration(secs)}` : ''}${music.scanning ? ' · reading tags…' : ''} · ${music.dir}`;
    const cur = music.current?.rel;
    let html = '';
    let lastGroup = null;
    items.forEach((t, i) => {
      if (view.sort === 'album' || view.sort === 'artist') {
        const g = view.sort === 'album' ? t.album : t.artist;
        if (g !== lastGroup) {
          lastGroup = g;
          const label = view.sort === 'album' ? (t.album || 'Songs without an album') : (t.artist || 'Unknown artist');
          const sub = view.sort === 'album' && t.album ? t.artist : '';
          html += `<div class="song-group">${t.art && t.album ? `<img src="${t.art}" alt="">` : `<span class="song-group__noart">${icon('music')}</span>`}<b>${escapeHtml(label)}</b>${sub ? `<span>${escapeHtml(sub)}</span>` : ''}</div>`;
        }
      }
      html += `<div class="song${t.rel === cur ? ' is-current' : ''}" role="listitem" data-rel="${escapeHtml(t.rel)}" title="${escapeHtml(t.file)}">
        <span class="song__n mono">${t.track || i + 1}</span>
        <span class="song__eq" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="song__main"><span class="song__title">${escapeHtml(t.title)}</span><span class="song__artist">${escapeHtml(t.artist || '')}</span></span>
        <span class="song__album">${escapeHtml(t.album || '')}</span>
        <span class="song__time mono">${t.duration ? fmtTime(t.duration) : ''}</span>
      </div>`;
    });
    if (all.length > limit) html += `<button class="btn btn--ghost music__more">Show ${Math.min(PAGE, all.length - limit)} more (${all.length - limit} left)</button>`;
    list.innerHTML = html;
    list.querySelector('.music__more')?.addEventListener('click', () => { limit += PAGE; paintList(); });
  }

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.song');
    if (!row) return;
    if (row.dataset.rel === music.current?.rel) { music.toggle(); return; }
    music.play(row.dataset.rel, shown().map((t) => t.rel));
  });
  list.addEventListener('contextmenu', async (e) => {
    const row = e.target.closest('.song');
    if (!row) return;
    e.preventDefault();
    const rel = row.dataset.rel;
    const t = music.byRel.get(rel);
    const id = await menu([
      { id: 1, label: 'Play' },
      { id: 2, label: 'Play next', disabled: !music.current },
      '-',
      { id: 3, label: 'Show in File Explorer' },
      { id: 4, label: 'Copy "Title - Artist"' },
      { id: 5, label: 'Copy the file name' },
    ], { x: e.clientX, y: e.clientY });
    if (id === 1) music.play(rel, shown().map((x) => x.rel));
    if (id === 2) { music.playNext(rel); toasts.show({ text: `Up next: ${t.title}` }); }
    if (id === 3) music.reveal(rel);
    if (id === 4) navigator.clipboard.writeText(`${t.title}${t.artist ? ` - ${t.artist}` : ''}`);
    if (id === 5) navigator.clipboard.writeText(t.file);
  });

  // ── controls ───────────────────────────────────────────────────────
  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'play': music.toggle(); break;
      case 'prev': music.prev(); break;
      case 'next': music.next(); break;
      case 'shuffle': music.setShuffle(!music.shuffle); break;
      case 'repeat': music.cycleRepeat(); break;
      case 'mute': music.audio.muted = !music.audio.muted; break;
      case 'rescan': music.scan(); break;
      case 'folder': music.chooseFolder(); break;
      default:
    }
  });
  range.addEventListener('input', () => { seeking = true; range.style.setProperty('--fill', `${Number(range.value) / 10}%`); $('.np__cur').textContent = fmtTime((Number(range.value) / 1000) * (music.audio.duration || 0)); });
  range.addEventListener('change', () => { music.seek(Number(range.value) / 1000); seeking = false; });
  vol.addEventListener('input', () => { music.audio.muted = false; music.audio.volume = Number(vol.value) / 100; });
  filter.addEventListener('input', () => { view.q = filter.value; limit = PAGE; paintList(); });
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = shown()[0]; if (first) music.play(first.rel, shown().map((t) => t.rel)); }
    if (e.key === 'Escape' && filter.value) { e.stopPropagation(); filter.value = ''; view.q = ''; paintList(); }
  });
  sortSel.addEventListener('change', () => { view.sort = sortSel.value; saveView(); limit = PAGE; paintList(); paintNow(); });
  encSel.addEventListener('change', () => music.setEncoding(encSel.value));

  // Space plays / pauses while this page is showing.
  const onKey = (e) => {
    if (!sheet.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.closest?.('.xterm, .cm-editor')) return;
    if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); music.toggle(); }
  };
  window.addEventListener('keydown', onKey, true);

  const off = music.on((what) => {
    if (!sheet.isConnected) { off(); return; }
    if (what === 'timeupdate') paintTime();
    else if (what === 'library' || what === 'scan') { paintList(); paintNow(); }
    else paintNow();
  });

  paintList();
  paintNow();
  if (!music.tracks.length && !music.scanning) music.scan();
}

function humanDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
