/** Writing help in the editor, the Notion and Obsidian way:
 *
 *  - "/" at the start of a line (or after a space) opens a menu of blocks:
 *    headings, lists, tasks, every callout, toggles, code, maths, tables,
 *    trees, flowcharts, embeds… Type to filter, Enter to insert, Tab to jump
 *    to the next blank in what was inserted.
 *  - "[[" suggests notes by name, then "#" their headings; "![[" also
 *    suggests pictures, PDFs and other files to embed.
 *  - Ctrl+B bold, Ctrl+I italic, Ctrl+Shift+H highlight (press again to undo).
 *
 *  Nothing here fires inside a code block, so typing "/" in a path or "[["
 *  in a code sample stays exactly what you typed. */

import { autocompletion, completionKeymap, snippet, startCompletion } from '@codemirror/autocomplete';
import { keymap, EditorView } from '@codemirror/view';
import { draggingOut } from './tree-drop.js';
import { EditorSelection } from '@codemirror/state';

const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// [label shown, words it can be found by, what it is, template]. ${} marks
// where the cursor lands; ${name} is a blank Tab moves to.
const BLOCKS = [
  ['Heading 1', 'h1 title', 'Big section heading', '# ${}'],
  ['Heading 2', 'h2 subtitle', 'Medium heading', '## ${}'],
  ['Heading 3', 'h3', 'Small heading', '### ${}'],
  ['Bulleted list', 'ul bullet points', 'A simple list', '- ${}'],
  ['Numbered list', 'ol ordered 123', 'A list with numbers', '1. ${}'],
  ['To-do', 'task checkbox todo', 'Tick it off in the reader', '- [ ] ${}'],
  ['Quote', 'blockquote', 'Set words apart', '> ${}'],
  ['Divider', 'hr line rule', 'A line across the page', '---\n${}'],
  ['Toggle', 'fold collapse details dropdown', 'A box that opens on click', '> [!note]- ${Title}\n> ${}'],
  ['Callout: Note', 'callout note', 'A note box', '> [!note]\n> ${}'],
  ['Callout: Tip', 'callout tip hint', 'A tip box', '> [!tip] ${Tip}\n> ${}'],
  ['Callout: Info', 'callout info', 'Something to know', '> [!info]\n> ${}'],
  ['Callout: Key idea', 'callout key core main', 'The core idea of a section', '> [!key]\n> ${}'],
  ['Callout: Exam bait', 'callout exam test', 'What gets tested', '> [!exam]\n> ${}'],
  ['Callout: Trap', 'callout trap mistake', 'A mistake that loses marks', '> [!trap]\n> ${}'],
  ['Callout: Worked example', 'callout example ex', 'Step by step', '> [!ex]\n> ${}'],
  ['Callout: Remember it', 'callout mem mnemonic', 'A memory hook', '> [!mem]\n> ${}'],
  ['Callout: Why', 'callout why reason', 'The reason behind it', '> [!why]\n> ${}'],
  ['Callout: Warning', 'callout warning caution', 'Be careful', '> [!warning]\n> ${}'],
  ['Callout: Danger', 'callout danger error', 'Really be careful', '> [!danger]\n> ${}'],
  ['Callout: Success', 'callout success done check', 'It worked', '> [!success]\n> ${}'],
  ['Callout: Question', 'callout question faq help', 'Something to ask', '> [!question]\n> ${}'],
  ['Callout: Example', 'callout example', 'An example', '> [!example]\n> ${}'],
  ['Callout: Summary', 'callout abstract tldr summary', 'The short version', '> [!summary]\n> ${}'],
  ['Callout: Quote', 'callout quote cite', 'Who said it', '> [!quote] ${Who}\n> ${}'],
  ['Callout: Brain break', 'callout lol joke', 'A joke for the tired brain', '> [!lol]\n> ${}'],
  ['Code block', 'code fence program', 'Highlighted code', '```${lang}\n${}\n```'],
  ['Code you can run', 'run js javascript sandbox', 'JavaScript with a Run button', '```js run\n${console.log("hi")}\n```'],
  ['Maths block', 'math latex equation formula katex', 'A displayed equation', '$$\n${}\n$$'],
  ['Inline maths', 'math latex inline', 'Maths inside a sentence', '$${}$'],
  ['Table', 'grid columns rows', 'Rows and columns', '| ${Column 1} | ${Column 2} |\n|---|---|\n| ${} |  |'],
  ['Tree', 'tree mindmap hierarchy outline diagram', 'An indented list drawn as a tree', '```tree\n${Main idea}\n  ${Branch 1}\n    ${Leaf}\n  ${Branch 2}\n```'],
  ['Flowchart', 'flow flowchart steps process diagram decision', 'Steps and decisions, drawn for you', '```flow\n(${Start})\n  ${Is it ready?}\n    |yes| ${Next step} -> (${Done})\n    |no| ${Fix it} -> ${Is it ready?}\n```'],
  ['Mermaid diagram', 'mermaid sequence gantt chart diagram', 'Any Mermaid diagram', '```mermaid\nflowchart LR\n  ${A} --> ${B}\n```'],
  ['Link to a note', 'link wiki note', 'Suggests notes as you type', '[[${}'],
  ['Embed a note or file', 'embed transclude image pdf', 'Show another note or a picture here', '![[${}'],
  ['Highlight', 'highlight mark', 'Highlighter pen', '==${text}=='],
  ['Coloured highlight', 'highlight colour color green blue red', '==g: green, b: blue, r: red, p: purple, o: orange==', '==${g}:${text}=='],
  ['Footnote', 'footnote reference', 'A note at the bottom', '^[${}]'],
  ['Comment', 'comment hidden private', 'Hidden when reading', '%%${}%%'],
  ['Flashcard', 'flashcard question answer card', 'Q and A, import into flashcards', 'Q: ${}\nA: '],
  ['Date', 'date today now', 'Today\'s date', () => today()],
];

/** Is `pos` inside a fenced code block? A cheap scan of the lines above. */
function inFence(state, pos) {
  const upto = state.doc.lineAt(pos).number;
  let open = null;
  for (let n = 1; n < upto; n++) {
    const m = /^\s*(`{3,}|~{3,})/.exec(state.doc.line(n).text);
    if (!m) continue;
    if (!open) open = m[1];
    else if (m[1][0] === open[0] && m[1].length >= open.length) open = null;
  }
  return Boolean(open);
}

function slashSource(context) {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const m = /(^|\s)\/([\w-]*)$/.exec(before);
  if (!m || inFence(context.state, context.pos)) return null;
  const query = m[2];
  const slash = context.pos - query.length - 1;
  const atStart = !before.slice(0, slash - line.from).trim();
  return {
    from: slash + 1,
    validFor: /^[\w-]*$/,
    options: BLOCKS.map(([label, words, detail, tpl]) => ({
      label: `${label} ${words}`,
      displayLabel: label,
      detail,
      type: 'pn-block',
      apply: (view, completion, from, to) => {
        // Replace the "/query" too; a block that is not at the start of a line gets one.
        const text = typeof tpl === 'function' ? tpl() : tpl;
        const block = /^(#|-|\d\.|>|```|\$\$|\||Q:)/.test(text) && !atStart ? `\n${text}` : text;
        if (typeof tpl === 'function') {
          view.dispatch({ changes: { from: from - 1, to, insert: block }, selection: { anchor: from - 1 + block.length } });
        } else {
          snippet(block)(view, completion, from - 1, to);
        }
        // A link or embed keeps going: suggest names straight away.
        if (/\[\[$/.test(text.replace(/\$\{\}$/, ''))) setTimeout(() => startCompletion(view), 0);
      },
    })),
  };
}

function wikiSource({ store, reader }) {
  let names = null;
  let namesSize = -1;
  const list = () => {
    if (names && namesSize === store.nodeCount) return names;
    names = [];
    for (let i = 1; i < store.nodeCount; i++) {
      if (store.kind[i] !== 1) continue;
      const name = store.nameOf(i);
      const path = store.pathOf(i);
      const note = /\.(md|markdown|mdx)$/i.test(name);
      names.push({ name: note ? name.replace(/\.(md|markdown|mdx)$/i, '') : name, note, folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '' });
    }
    namesSize = store.nodeCount;
    return names;
  };
  return async (context) => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const m = /(!?)\[\[([^\]|#\n]*)(?:#([^\]|\n]*))?$/.exec(before);
    if (!m || inFence(context.state, context.pos)) return null;
    const after = line.text.slice(context.pos - line.from);
    const close = after.startsWith(']]') ? '' : ']]';
    if (m[3] !== undefined) {
      // [[Note#… : that note's headings.
      const path = reader.resolveWiki(m[2]);
      if (!path) return null;
      let raw = '';
      try { raw = await reader._fetchText(path, store.contentUrl(path), false); } catch { return null; }
      const headings = [...raw.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((h) => h[1]);
      return {
        from: context.pos - m[3].length,
        validFor: /^[^\]|#\n]*$/,
        options: headings.map((h) => ({ label: h, type: 'pn-heading', apply: `${h}${close}` })),
      };
    }
    const embed = m[1] === '!';
    return {
      from: context.pos - m[2].length,
      validFor: /^[^\]|#\n]*$/,
      options: list().filter((n) => embed || n.note).map((n) => ({
        label: n.name,
        detail: n.folder,
        type: n.note ? 'pn-note' : 'pn-file',
        boost: n.note ? 1 : 0,
        apply: `${n.name}${close}`,
      })),
    };
  };
}

/** Wrap the selection in `mark` (or take it off again). */
function wrap(mark) {
  return (view) => {
    const { state } = view;
    view.dispatch(state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to);
      const before = state.sliceDoc(range.from - mark.length, range.from);
      const after = state.sliceDoc(range.to, range.to + mark.length);
      if (before === mark && after === mark) {
        return {
          changes: [{ from: range.from - mark.length, to: range.from, insert: '' }, { from: range.to, to: range.to + mark.length, insert: '' }],
          range: EditorSelection.range(range.from - mark.length, range.to - mark.length),
        };
      }
      return {
        changes: { from: range.from, to: range.to, insert: `${mark}${text}${mark}` },
        range: EditorSelection.range(range.from + mark.length, range.to + mark.length),
      };
    }));
    return true;
  };
}

/** A note dragged from the tree (a Windows file drag, see tree-drop.js)
 *  drops in as a [[link]] where it lands, not as the file's contents. */
const noteDrops = EditorView.domEventHandlers({
  dragover(event) {
    if (!draggingOut()) return false;
    event.preventDefault();
    return true;
  },
  drop(event, view) {
    const out = draggingOut();
    if (!out) return false;
    event.preventDefault();
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
    view.dispatch({ changes: { from: pos, insert: out.link }, selection: { anchor: pos + out.link.length }, userEvent: 'input.drop' });
    view.focus();
    return true;
  },
});

export function assistExtensions({ store, reader }) {
  return [
    noteDrops,
    autocompletion({
      override: [slashSource, wikiSource({ store, reader })],
      icons: false,
      closeOnBlur: true,
      optionClass: (c) => `pn-ac pn-ac--${c.type || 'x'}`,
    }),
    keymap.of([
      ...completionKeymap,
      { key: 'Mod-b', run: wrap('**'), preventDefault: true },
      { key: 'Mod-i', run: wrap('*'), preventDefault: true },
      { key: 'Mod-Shift-h', run: wrap('=='), preventDefault: true },
    ]),
  ];
}
