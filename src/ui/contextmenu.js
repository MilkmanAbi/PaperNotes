/** Right-click in a note.
 *
 *  With text selected: copy it (plain or as a quoted Markdown reference),
 *  make a flashcard, turn it into a sticky note, mark it as confusing,
 *  remind yourself, drop it into your Inbox, ask Claude (explain, simplify,
 *  quiz me), search for it (your notes, Google, YouTube, Wikipedia,
 *  translate), or have it read aloud.
 *
 *  Without a selection: the note's own actions (sticky here, confused here,
 *  edit, done, open to the side, copy link, print). */

import { menu } from './menu.js';
import { askForm } from './dialog.js';
import { isDesktop, call } from '../desktop/bridge.js';

const A = {
  COPY: 1, COPY_QUOTE: 2, SELECT_ALL: 3,
  CARD: 10, STICKY: 11, CONFUSED: 12, REMIND: 13, INBOX: 14,
  ASK: 20, EXPLAIN: 21, SIMPLER: 22, QUIZ: 23,
  S_NOTES: 30, S_GOOGLE: 31, S_YOUTUBE: 32, S_WIKI: 33, S_SCHOLAR: 34, TRANSLATE: 35,
  SPEAK: 40, STOP: 41,
  N_STICKY: 50, N_CONFUSED: 51, N_EDIT: 52, N_DONE: 53, N_SIDE: 54, N_LINK: 55, N_PRINT: 56, N_CLAUDE: 57, N_CARDS: 58,
};

const open = (url) => (isDesktop ? call('external', url) : window.open(url, '_blank', 'noopener'));

export function attachContextMenu({ reader, state, study, store, router, toasts, split, claude, runSearch, edit }) {
  reader.wrap.addEventListener('contextmenu', async (e) => {
    const article = e.target.closest('.reader__sheet:not(.editor) .note-content');
    if (!article || e.target.closest('.sticky, a, input, textarea')) return;
    e.preventDefault();
    const path = reader.currentPath;
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed && article.contains(sel.anchorNode) ? sel.toString().trim() : '';
    const blockEl = (text ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement) : e.target)?.closest('[data-line]');
    const line = blockEl ? Number(blockEl.dataset.line) : -1;
    const id = store.lookup(path);
    const title = id > 0 ? store.titleOf(id) : path.split('/').pop();
    const short = text.length > 28 ? `${text.slice(0, 26).trim()}…` : text;

    let items;
    if (text) {
      items = [
        { id: A.COPY, label: 'Copy\tCtrl+C' },
        { id: A.COPY_QUOTE, label: 'Copy as a quote with its source' },
        '-',
        { id: A.CARD, label: 'Make a flashcard…' },
        { id: A.STICKY, label: 'Turn into a sticky note' },
        { id: A.CONFUSED, label: 'Mark as confusing', disabled: line < 0 },
        { id: A.REMIND, label: 'Remind me about this…' },
        { id: A.INBOX, label: 'Add to my Inbox', disabled: !isDesktop },
        '-',
        ...(claude ? [{ label: 'Ask Claude', children: [
          { id: A.ASK, label: 'Ask about this' },
          { id: A.EXPLAIN, label: 'Explain it with an example' },
          { id: A.SIMPLER, label: 'Explain it like I\'m 12' },
          { id: A.QUIZ, label: 'Quiz me on this' },
        ] }] : []),
        { label: `Search for "${short}"`, children: [
          { id: A.S_NOTES, label: 'In my notes' },
          '-',
          { id: A.S_GOOGLE, label: 'Google' },
          { id: A.S_YOUTUBE, label: 'YouTube' },
          { id: A.S_WIKI, label: 'Wikipedia' },
          { id: A.S_SCHOLAR, label: 'Google Scholar' },
          { id: A.TRANSLATE, label: 'Translate (Google)' },
        ] },
        speechSynthesis.speaking ? { id: A.STOP, label: 'Stop reading aloud' } : { id: A.SPEAK, label: 'Read aloud' },
      ];
    } else {
      items = [
        { id: A.N_STICKY, label: 'Add a sticky note here' },
        { id: A.N_CONFUSED, label: line >= 0 && state.hasMark(path, line) ? 'Clear the confused mark here' : 'Mark this as confusing', disabled: line < 0 },
        '-',
        ...(edit ? [{ id: A.N_EDIT, label: 'Edit\tCtrl+E' }] : []),
        { id: A.N_DONE, label: state.isDone(path) ? 'Mark as not done\tCtrl+D' : 'Mark as done\tCtrl+D' },
        { id: A.N_SIDE, label: 'Open to the side' },
        ...(claude ? ['-', { id: A.N_CLAUDE, label: 'Study this with Claude\tCtrl+Shift+L' }, { id: A.N_CARDS, label: 'Make flashcards with Claude' }] : []),
        '-',
        { id: A.N_LINK, label: 'Copy a link to this note' },
        { id: A.SELECT_ALL, label: 'Select all\tCtrl+A' },
        { id: A.N_PRINT, label: 'Print or save as PDF…\tCtrl+P' },
        ...(speechSynthesis.speaking ? [{ id: A.STOP, label: 'Stop reading aloud' }] : [{ id: A.SPEAK, label: 'Read the note aloud' }]),
      ];
    }

    const chosen = await menu(items, { x: e.clientX, y: e.clientY });
    const q = encodeURIComponent(text);
    switch (chosen) {
      case A.COPY: navigator.clipboard.writeText(text); break;
      case A.COPY_QUOTE:
        navigator.clipboard.writeText(`> ${text.replace(/\n+/g, '\n> ')}\n>\n> — [${title}](${encodeURI(path)})`);
        toasts.show({ text: 'Copied as a Markdown quote with a link back.' });
        break;
      case A.SELECT_ALL: sel.selectAllChildren(article); break;
      case A.CARD: {
        const out = await askForm({
          title: 'New flashcard', action: 'Add card',
          fields: [
            { name: 'front', label: 'Question (front)', type: 'textarea', rows: 2, placeholder: 'What should this answer?' },
            { name: 'back', label: 'Answer (back)', type: 'textarea', rows: 4, value: text },
          ],
        });
        if (out?.front.trim() && out.back.trim()) { state.addCard({ front: out.front, back: out.back, path }); toasts.show({ text: 'Card added.' }); }
        break;
      }
      case A.STICKY:
        study.stickies.add(path, { text, line, at: e });
        break;
      case A.CONFUSED: if (!state.hasMark(path, line)) state.toggleMark(path, line, text); break;
      case A.REMIND: study.addReminder(path, null, `Go over: ${text.slice(0, 120)}`); break;
      case A.INBOX:
        try {
          // My notes/Inbox.md (whatever the My notes folder is called here).
          const top = store.childrenOf(0).find((n) => store.kind[n] === 0 && /my notes/i.test(store.nameOf(n)));
          const inbox = `${top !== undefined ? store.nameOf(top) : 'My notes'}/Inbox.md`;
          const res = await fetch(`content/${inbox.split('/').map(encodeURIComponent).join('/')}`, { cache: 'no-store' });
          const before = res.ok ? await res.text() : '# Inbox\n';
          const entry = `\n- ${new Date().toLocaleString()}: "${text.replace(/\s+/g, ' ').slice(0, 600)}" ([${title}](../${encodeURI(path)}))\n`;
          await call('write', inbox, before.replace(/\s*$/, '\n') + entry);
          toasts.show({ text: `Added to ${inbox}.` });
        } catch (err) { toasts.show({ tone: 'error', text: err.message }); }
        break;
      case A.ASK: claude?.(path, { line, quote: text }); break;
      case A.EXPLAIN: claude?.(path, { line, quote: text, task: 'explain' }); break;
      case A.SIMPLER: claude?.(path, { line, quote: text, task: 'simpler' }); break;
      case A.QUIZ: claude?.(path, { line, quote: text, task: 'quiz' }); break;
      case A.S_NOTES: runSearch(text.slice(0, 80)); break;
      case A.S_GOOGLE: open(`https://www.google.com/search?q=${q}`); break;
      case A.S_YOUTUBE: open(`https://www.youtube.com/results?search_query=${q}`); break;
      case A.S_WIKI: open(`https://en.wikipedia.org/w/index.php?search=${q}`); break;
      case A.S_SCHOLAR: open(`https://scholar.google.com/scholar?q=${q}`); break;
      case A.TRANSLATE: open(`https://translate.google.com/?sl=auto&tl=en&text=${q}&op=translate`); break;
      case A.SPEAK: {
        const u = new SpeechSynthesisUtterance(text || article.innerText);
        u.rate = 1.02;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        break;
      }
      case A.STOP: speechSynthesis.cancel(); break;
      case A.N_STICKY: study.stickies.add(path, { line, at: e }); break;
      case A.N_CONFUSED: {
        const snippet = (blockEl?.textContent || '').replace(/\s+/g, ' ').trim();
        state.toggleMark(path, line, snippet);
        break;
      }
      case A.N_EDIT: edit?.(path); break;
      case A.N_DONE: study.toggleDone(path); break;
      case A.N_SIDE: split.openNote(path); break;
      case A.N_CLAUDE: claude?.(path); break;
      case A.N_CARDS: claude?.(path, { task: 'cards' }); break;
      case A.N_LINK: navigator.clipboard.writeText(`[${title}](${encodeURI(path)})`); toasts.show({ text: 'Copied a Markdown link to this note.' }); break;
      case A.N_PRINT: window.print(); break;
      default:
    }
    void router;
  });
}
