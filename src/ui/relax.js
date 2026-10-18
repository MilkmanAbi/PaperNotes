/** Relax mode (:relax): the tab is nothing but a looping animation, filling
 *  it at any window size. Put music on, leave the laptop looking nice, go
 *  lie down for a bit.
 *
 *  Double-click hides the rest of the window too (Escape or another
 *  double-click brings it back). The screen is kept awake while it shows.
 *  Right-click to use a video of your own. */

import { isDesktop, call } from '../desktop/bridge.js';
import { menu } from './menu.js';

const DEFAULT = 'relax/Windy_Night_Animation.mp4';

export async function showRelax({ reader, toasts, onMusic }) {
  reader._clear();
  reader.currentPath = ':relax';
  reader.headings = [];
  reader._emitHeadings();

  const el = document.createElement('div');
  el.className = 'relax';
  el.innerHTML = `<video class="relax__video" autoplay loop muted playsinline disablepictureinpicture></video>
    <div class="relax__sky" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="relax__hint">Double-click to hide everything else · right-click for options</div>
    ${isDesktop ? '<button class="btn btn--secondary relax__pick" hidden>Choose a video for Relax mode…</button>' : ''}`;
  reader.inner.appendChild(el);
  const video = el.querySelector('video');
  const root = document.documentElement;

  async function load() {
    const pick = el.querySelector('.relax__pick');
    if (pick) pick.hidden = true;
    let custom = '';
    if (isDesktop) custom = await call('relaxInfo').catch(() => '');
    video.src = custom ? `relax/custom?v=${encodeURIComponent(custom)}` : DEFAULT;
    video.play().catch(() => {});
  }
  video.addEventListener('error', () => {
    if (!video.src.endsWith(DEFAULT)) { video.src = DEFAULT; return; }
    // No video (the public build ships none): a quiet night sky instead.
    el.classList.add('is-empty');
    const pick = el.querySelector('.relax__pick');
    if (pick) pick.hidden = false;
  });
  el.querySelector('.relax__pick')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (await call('pickRelax').catch(() => '')) { el.classList.remove('is-empty'); load(); }
  });

  // Keep the screen on while this is showing.
  let lock = null;
  const keepAwake = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; } };
  const onVisible = () => { if (document.visibilityState === 'visible' && el.isConnected && !lock) keepAwake(); };
  document.addEventListener('visibilitychange', onVisible);
  keepAwake();

  const hint = el.querySelector('.relax__hint');
  const setZen = (on) => {
    if (on) root.dataset.zen = 'true'; else delete root.dataset.zen;
    // Say how to get back, then fade again.
    hint.textContent = on ? 'Esc or double-click to come back' : 'Double-click to hide everything else · right-click for options';
    hint.style.animation = 'none';
    void hint.offsetWidth;
    hint.style.animation = '';
  };
  el.addEventListener('dblclick', () => setZen(root.dataset.zen !== 'true'));
  const onKey = (e) => { if (e.key === 'Escape' && root.dataset.zen === 'true') { e.preventDefault(); e.stopPropagation(); setZen(false); } };
  window.addEventListener('keydown', onKey, true);

  el.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const id = await menu([
      { id: 1, label: root.dataset.zen === 'true' ? 'Show the rest of PaperNotes\tEsc' : 'Hide everything else\tDouble-click' },
      ...(onMusic ? [{ id: 2, label: 'Open Music' }] : []),
      ...(isDesktop ? ['-', { id: 3, label: 'Choose another video…' }, { id: 4, label: 'Use the default video' }] : []),
    ], { x: e.clientX, y: e.clientY });
    if (id === 1) setZen(root.dataset.zen !== 'true');
    if (id === 2) { setZen(false); onMusic(); }
    if (id === 3 && await call('pickRelax').catch(() => '')) { el.classList.remove('is-empty'); load(); toasts?.show({ text: 'Relax mode will use that video.' }); }
    if (id === 4) { await call('pickRelax', 'reset').catch(() => {}); el.classList.remove('is-empty'); load(); }
  });

  // Leaving the page: undo all of the above.
  const watch = new MutationObserver(() => {
    if (el.isConnected) return;
    watch.disconnect();
    setZen(false);
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisible);
    lock?.release?.().catch(() => {});
    video.removeAttribute('src');
    video.load();
  });
  watch.observe(reader.inner, { childList: true });

  await load();
}
