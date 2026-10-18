/** Flashcard review: one card at a time, front first. Space shows the
 *  answer; 1 Again, 2 Hard, 3 Good, 4 Easy. Scheduling is spaced
 *  repetition (state.js schedule()), so the cards you find hard come back
 *  sooner and the easy ones drift out to weeks.
 *
 *  Cards are Markdown, so maths, code and callouts work on them too. */

import { renderNote } from '../core/markdown.js';
import { schedule } from '../core/state.js';
import { escapeHtml } from './study.js';
import { icon } from './icons.js';
import { toHash } from '../core/paths.js';
import { enhance } from './enhance.js';

const fmtInterval = (c, g) => {
  const n = schedule(c, g);
  if (g === 0) return '10 min';
  return n.interval === 1 ? '1 day' : n.interval < 30 ? `${n.interval} days` : `${Math.round(n.interval / 30)} mo`;
};

export function showReview({ reader, state, store, scope = '' }) {
  reader._clear();
  reader.currentPath = ':review';
  reader.inner.dataset.wide = 'false';
  const sheet = document.createElement('div');
  sheet.className = 'reader__sheet review';
  reader.inner.appendChild(sheet);
  reader.headings = [];
  reader._emitHeadings();

  const queue = state.dueCards(scope || null);
  const total = queue.length;
  let done = 0;
  let again = 0;
  let current = null;
  let shown = false;
  const title = (p) => { const id = store.lookup(p); return id > 0 ? store.titleOf(id) : p.split('/').pop(); };

  function render() {
    current = queue.shift() || null;
    shown = false;
    if (!current) {
      const next = state.cards.filter((c) => c.due > Date.now() / 1000).sort((a, b) => a.due - b.due)[0];
      sheet.innerHTML = `<div class="review__done">
        <img src="brand/lily.png" alt="" class="review__lily">
        <h1>${total ? 'All caught up.' : 'Nothing to review.'}</h1>
        <p>${total ? `${done} ${done === 1 ? 'card' : 'cards'} reviewed${again ? `, ${again} to see again soon` : ''}.` : state.cards.length ? 'No cards are due right now.' : 'You have no flashcards yet. Select text in a note and press Card, or ask Claude to make some.'}</p>
        ${next ? `<p class="caption">Next card due ${new Date(next.due * 1000).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</p>` : ''}
        <a class="btn" href="#/">${icon('arrowLeft')}<span>Home</span></a></div>`;
      return;
    }
    const front = renderNote(current.front, current.path || 'card.md').html;
    sheet.innerHTML = `
      <div class="review__top"><span class="caption">${done + 1} of ${total}${scope ? ` · ${escapeHtml(title(scope))}` : ''}</span>
        <span class="review__bar"><i style="width:${Math.round((done / Math.max(1, total)) * 100)}%"></i></span>
        ${current.path ? `<a class="caption" href="${toHash(current.path)}">${escapeHtml(title(current.path))}</a>` : ''}</div>
      <article class="review__card note-content">${front}</article>
      <div class="review__answer note-content" hidden></div>
      <div class="review__actions">
        <button class="btn review__show">Show answer <kbd>Space</kbd></button>
        <div class="review__grades" hidden>
          ${['Again', 'Hard', 'Good', 'Easy'].map((g, i) => `<button class="btn ${i === 2 ? '' : 'btn--secondary'} review__grade" data-g="${i}">
            <span>${g}</span><small>${fmtInterval(current, i)}</small><kbd>${i + 1}</kbd></button>`).join('')}
        </div>
        <button class="btn btn--ghost review__delete" title="Delete this card">${icon('trash')}</button>
      </div>`;
    enhance(sheet.querySelector('.review__card'));
    sheet.querySelector('.review__show').onclick = show;
    sheet.querySelectorAll('.review__grade').forEach((b) => { b.onclick = () => grade(Number(b.dataset.g)); });
    sheet.querySelector('.review__delete').onclick = () => { state.removeCard(current.id); render(); };
  }

  function show() {
    if (!current || shown) return;
    shown = true;
    const a = sheet.querySelector('.review__answer');
    a.innerHTML = renderNote(current.back, current.path || 'card.md').html;
    a.hidden = false;
    enhance(a);
    sheet.querySelector('.review__show').hidden = true;
    sheet.querySelector('.review__grades').hidden = false;
  }

  function grade(g) {
    if (!current || !shown) return;
    state.review(current.id, g);
    done++;
    if (g === 0) { again++; queue.push(current); }
    render();
  }

  const onKey = (e) => {
    if (!sheet.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.closest?.('.xterm, .cm-editor')) return;
    if (e.key === ' ' || e.key === 'Enter') { if (!shown) { e.preventDefault(); e.stopPropagation(); show(); } }
    else if (/^[1-4]$/.test(e.key) && shown) { e.preventDefault(); e.stopPropagation(); grade(Number(e.key) - 1); }
  };
  window.addEventListener('keydown', onKey, true);
  render();
}
