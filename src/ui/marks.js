/** "I'm confused here": red dots in a gutter beside the note, like a
 *  breakpoint in VS Code. Hover the left edge of any paragraph, list item,
 *  formula or code block and a faint dot appears; click it to mark that
 *  spot, click again to clear it. Marked spots are tinted, collected in the
 *  toolkit, shown on the home screen, and handed to Claude.
 *
 *  A mark belongs to a source line (data-line, from markdown.js), with a
 *  snippet of its text so it can follow the line after edits. */

import { showPopover } from './popover.js';
import { isDesktop } from '../desktop/bridge.js';

export function attachMarks({ state, reader, toasts }) {
  let ctx = null;        // { path, sheet, article }
  let blocks = [];       // [{ line, el, top, bottom }]
  let gutter = null;
  let ghost = null;
  let ro = null;
  let ghostLine = -1;
  const handlers = { ask: null };

  function collect() {
    const all = [...ctx.article.querySelectorAll('[data-line]')];
    // Of a list and its first item, which share a line, keep the item.
    const chosen = all.filter((el) => !el.querySelector(`[data-line="${el.dataset.line}"]`));
    return chosen.map((el) => ({ line: Number(el.dataset.line), el }));
  }

  function layout() {
    if (!ctx || !ctx.sheet.isConnected) return;
    const base = ctx.sheet.getBoundingClientRect().top;
    for (const b of blocks) {
      const r = b.el.getBoundingClientRect();
      b.top = r.top - base;
      b.bottom = r.bottom - base;
      // The first line of the block, not its middle: that's where the eye is.
      const lh = parseFloat(getComputedStyle(b.el).lineHeight) || 22;
      b.dot = b.top + Math.min(r.height, lh) / 2;
    }
    gutter.style.left = `${ctx.article.offsetLeft - 22}px`;
    draw();
  }

  function draw() {
    if (!gutter) return;
    const marked = new Set(state.marksOf(ctx.path).map((m) => m.line));
    gutter.querySelectorAll('.mark-dot').forEach((d) => d.remove());
    for (const b of blocks) {
      b.el.classList.toggle('pn-confused', marked.has(b.line));
      if (!marked.has(b.line)) continue;
      const dot = document.createElement('button');
      dot.className = 'mark-dot';
      dot.style.top = `${b.dot}px`;
      dot.dataset.line = String(b.line);
      dot.title = 'Confused here. Click to clear, right-click for more.';
      dot.setAttribute('aria-label', 'Confused mark');
      gutter.appendChild(dot);
    }
  }

  function blockAt(y) {
    let best = null;
    for (const b of blocks) {
      if (y >= b.top - 2 && y <= b.bottom + 2 && (!best || b.top >= best.top)) best = b;
    }
    return best;
  }

  function snippetOf(b) {
    return (b.el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function attach(next) {
    ro?.disconnect();
    ctx = next;
    blocks = collect();
    gutter = document.createElement('div');
    gutter.className = 'mark-gutter';
    gutter.setAttribute('aria-hidden', 'false');
    ghost = document.createElement('button');
    ghost.className = 'mark-ghost';
    ghost.hidden = true;
    ghost.title = 'Mark as confusing';
    ghost.setAttribute('aria-label', 'Mark as confusing');
    gutter.appendChild(ghost);
    ctx.sheet.appendChild(gutter);

    const sheet = ctx.sheet;
    sheet.addEventListener('mousemove', (e) => {
      if (e.target.closest('.sticky, .note__meta, .breadcrumb, .note__nav')) { ghost.hidden = true; return; }
      const y = e.clientY - sheet.getBoundingClientRect().top;
      const b = blockAt(y);
      if (!b || state.hasMark(ctx.path, b.line)) { ghost.hidden = true; ghostLine = -1; return; }
      ghostLine = b.line;
      ghost.style.top = `${b.dot}px`;
      ghost.hidden = false;
    });
    sheet.addEventListener('mouseleave', () => { ghost.hidden = true; });

    gutter.addEventListener('click', (e) => {
      const dot = e.target.closest('.mark-dot');
      if (dot) { state.toggleMark(ctx.path, Number(dot.dataset.line)); return; }
      if (e.target === ghost && ghostLine >= 0) {
        const b = blocks.find((x) => x.line === ghostLine);
        state.toggleMark(ctx.path, ghostLine, b ? snippetOf(b) : '');
        ghost.hidden = true;
      }
    });
    gutter.addEventListener('contextmenu', (e) => {
      const dot = e.target.closest('.mark-dot');
      if (!dot) return;
      e.preventDefault();
      e.stopPropagation();
      menuFor(Number(dot.dataset.line), dot);
    });

    ro = new ResizeObserver(() => layout());
    ro.observe(ctx.article);
    layout();
  }

  function menuFor(line, anchor) {
    const mark = state.marksOf(ctx.path).find((m) => m.line === line);
    const box = document.createElement('div');
    box.className = 'markmenu';
    const note = document.createElement('textarea');
    note.placeholder = 'What is confusing? (optional)';
    note.value = mark?.note || '';
    note.rows = 3;
    note.oninput = () => { if (mark) { mark.note = note.value; state._changed({ type: 'marks', path: ctx.path, quiet: true }); } };
    const row = document.createElement('div');
    row.className = 'markmenu__actions';
    const clear = document.createElement('button');
    clear.className = 'btn btn--secondary';
    clear.textContent = 'Clear mark';
    clear.onclick = () => { state.toggleMark(ctx.path, line); pop.close(); };
    row.appendChild(clear);
    if (isDesktop && handlers.ask) {
      const ask = document.createElement('button');
      ask.className = 'btn';
      ask.textContent = 'Ask Claude';
      ask.onclick = () => { pop.close(); handlers.ask(ctx.path, line); };
      row.appendChild(ask);
    }
    box.append(note, row);
    const pop = showPopover(box, { anchor });
    note.focus();
  }

  state.onChange((ev) => {
    if (!ctx || !gutter?.isConnected) return;
    if (ev.type === 'marks' && ev.path === ctx.path && !ev.quiet) draw();
    if (ev.type === 'load') draw();
  });

  void reader; void toasts;
  return {
    attach,
    /** The desktop app plugs in "Ask Claude about this". */
    onAsk(fn) { handlers.ask = fn; },
    /** Flash a marked block after jumping to it. */
    flash(line) {
      const b = blocks.find((x) => x.line === line);
      if (!b) return;
      b.el.classList.remove('pn-flash');
      void b.el.offsetWidth;
      b.el.classList.add('pn-flash');
    },
  };
}
