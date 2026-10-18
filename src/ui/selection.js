/** Select text in a note and a small bar appears over it:
 *    Card      make a flashcard (the selection is the answer; you write the question)
 *    Confused  red-dot the block it's in
 *    Sticky    a sticky note quoting it
 *    Ask       hand it to Claude
 *    Copy      copy as plain text */

import { icon } from './icons.js';
import { askForm } from './dialog.js';

export function attachSelectionBar({ reader, state, study, toasts, onAsk }) {
  const bar = document.createElement('div');
  bar.className = 'selbar';
  bar.hidden = true;
  bar.innerHTML = `
    <button data-act="card" title="Make a flashcard">${icon('book')}<span>Card</span></button>
    <button data-act="confused" title="Mark as confusing">${icon('question')}<span>Confused</span></button>
    <button data-act="sticky" title="Sticky note with this">${icon('sticky')}<span>Sticky</span></button>
    ${onAsk ? `<button data-act="ask" title="Ask Claude about this">${icon('sparkle')}<span>Ask</span></button>` : ''}
    <button data-act="copy" title="Copy">${icon('file')}</button>`;
  document.body.appendChild(bar);

  let sel = null;   // { text, path, line, rect }

  const hide = () => { bar.hidden = true; sel = null; };

  document.addEventListener('mouseup', (e) => {
    if (bar.contains(e.target)) return;
    setTimeout(() => {
      const s = window.getSelection();
      const text = s && !s.isCollapsed ? s.toString().trim() : '';
      const article = reader.inner.querySelector('.reader__sheet:not(.editor) .note-content');
      if (!text || text.length < 2 || !article || !s.rangeCount || !article.contains(s.anchorNode)) { hide(); return; }
      const range = s.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const block = (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement)?.closest('[data-line]');
      sel = { text, path: reader.currentPath, line: block ? Number(block.dataset.line) : -1, rect };
      bar.hidden = false;
      const w = bar.offsetWidth;
      bar.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2))}px`;
      bar.style.top = `${Math.max(8, rect.top - bar.offsetHeight - 8)}px`;
    }, 0);
  });
  document.addEventListener('mousedown', (e) => { if (!bar.contains(e.target)) hide(); });
  reader.wrap.addEventListener('scroll', hide, { passive: true });

  bar.addEventListener('mousedown', (e) => e.preventDefault());   // keep the selection
  bar.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !sel) return;
    const { text, path, line } = sel;
    hide();
    window.getSelection()?.removeAllRanges();
    switch (b.dataset.act) {
      case 'card': {
        const out = await askForm({
          title: 'New flashcard',
          action: 'Add card',
          fields: [
            { name: 'front', label: 'Question (front)', type: 'textarea', rows: 2, value: '', placeholder: 'What would make you remember this?' },
            { name: 'back', label: 'Answer (back)', type: 'textarea', rows: 4, value: text },
          ],
        });
        if (out && out.front.trim() && out.back.trim()) {
          state.addCard({ front: out.front, back: out.back, path });
          toasts.show({ text: `Card added. ${state.dueCards().length} due for review.` });
        }
        break;
      }
      case 'confused':
        if (line >= 0 && !state.hasMark(path, line)) state.toggleMark(path, line, text);
        break;
      case 'sticky':
        study.stickies.add(path, { text });
        break;
      case 'ask':
        onAsk?.(path, { line, quote: text });
        break;
      case 'copy':
        navigator.clipboard.writeText(text);
        break;
      default:
    }
  });
}
