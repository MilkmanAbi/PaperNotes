/** The note renderer: Markdown, LaTeX, raw HTML and the note's own CSS.
 *
 *  Raw HTML is enabled. That is a deliberate trust decision, not an
 *  oversight: these notes are files in your own repository, and the whole
 *  point of supporting HTML and CSS is to let a note do something the
 *  Markdown vocabulary cannot. What that trust does *not* extend to is
 *  letting a note impersonate the application, so its styles are scoped
 *  (see css-scope.js) and its markup renders inside a visibly separate
 *  content region (§4.1).
 *
 *  If you ever publish notes you did not write, sanitising is one option
 *  away — see `RENDER_OPTIONS.sanitize` in the README. */

import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import katex from 'katex';
import 'katex/contrib/mhchem';   // \ce{H2O} and \pu{} for chemistry
import hljs from 'highlight.js/lib/common';
import { scopeCss } from './css-scope.js';
import { resolveRelative, toHash } from './paths.js';

// ── LaTeX ──────────────────────────────────────────────────────────────
// A small dollar-delimited math plugin rather than a dependency, so the
// delimiter rules are visible and adjustable: `$…$` inline, `$$…$$` as a
// display block, backslash-escaped dollars left alone, and a bare `$12.50`
// not treated as the start of an equation.

function isDigit(code) { return code >= 0x30 && code <= 0x39; }

function mathInline(state, silent) {
  const start = state.pos;
  const src = state.src;
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false;
  if (start > 0 && src.charCodeAt(start - 1) === 0x5c /* \ */) return false;
  if (src.charCodeAt(start + 1) === 0x24) return false;   // leave $$ to the block rule

  let pos = start + 1;
  if (pos >= state.posMax) return false;
  // "$ x$" and "$12" are prose, not maths.
  const firstCode = src.charCodeAt(pos);
  if (firstCode === 0x20 || firstCode === 0x0a) return false;

  let found = -1;
  while (pos < state.posMax) {
    const code = src.charCodeAt(pos);
    if (code === 0x5c) { pos += 2; continue; }
    if (code === 0x24) {
      const prev = src.charCodeAt(pos - 1);
      const next = src.charCodeAt(pos + 1);
      if (prev !== 0x20 && prev !== 0x0a && !isDigit(next)) { found = pos; break; }
    }
    if (code === 0x0a && src.charCodeAt(pos + 1) === 0x0a) return false;  // no blank lines
    pos++;
  }
  if (found === -1) return false;

  const content = src.slice(start + 1, found);
  if (!content.trim()) return false;

  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = '$';
    token.content = content;
  }
  state.pos = found + 1;
  return true;
}

function mathBlock(state, startLine, endLine, silent) {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (startPos + 2 > max) return false;
  if (state.src.slice(startPos, startPos + 2) !== '$$') return false;

  let pos = startPos + 2;
  let firstLine = state.src.slice(pos, max);
  if (silent) return true;

  let found = firstLine.trim().endsWith('$$');
  if (found) firstLine = firstLine.trim().slice(0, -2);

  let line = startLine;
  // The opening line always belongs to the formula: "$$x$$" on one line is
  // the whole of it, and "$$x" starts one that continues below.
  const lines = [firstLine];

  while (!found) {
    line++;
    if (line >= endLine) break;
    pos = state.bMarks[line] + state.tShift[line];
    max = state.eMarks[line];
    if (pos < max && state.sCount[line] < state.blkIndent) break;
    const text = state.src.slice(pos, max);
    if (text.trim().endsWith('$$')) {
      lines.push(text.trim().slice(0, -2));
      found = true;
      break;
    }
    lines.push(text);
  }

  state.line = found ? line + 1 : line;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = lines.join('\n').trim();
  token.markup = '$$';
  token.map = [startLine, state.line];
  return true;
}

function renderMath(content, displayMode) {
  try {
    return katex.renderToString(content, {
      displayMode,
      // Let KaTeX throw so the failure can be surfaced deliberately below.
      // Its own non-throwing mode renders the broken source as red text with
      // no indication of what went wrong, which reads as a rendering glitch
      // rather than as an honest "this did not parse" (PI §5.4).
      throwOnError: true,
      strict: 'ignore',
      trust: false,
      output: 'htmlAndMathml',
      macros: { '\\RR': '\\mathbb{R}', '\\NN': '\\mathbb{N}', '\\ZZ': '\\mathbb{Z}' },
    });
  } catch (err) {
    // An unrenderable equation shows itself and says why; it does not take
    // the note down and it does not silently vanish (PI §5.3).
    const safe = escapeHtml(content);
    const reason = escapeHtml(err?.message || 'could not be rendered');
    return `<code class="katex-error" title="${reason}">${safe}</code>`;
  }
}

function mathPlugin(md) {
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules.math_inline = (tokens, i) => renderMath(tokens[i].content, false);
  md.renderer.rules.math_block = (tokens, i) =>
    `<div class="katex-display-wrap"${lineAttr(tokens[i])}>${renderMath(tokens[i].content, true)}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Highlighted HTML for a whole source file, for the attachment viewer. */
export function highlightCode(code, lang) {
  const language = lang && hljs.getLanguage(lang) ? lang : null;
  try {
    return language ? hljs.highlight(code, { language, ignoreIllegals: true }).value : escapeHtml(code);
  } catch {
    return escapeHtml(code);
  }
}

// ── Task lists ─────────────────────────────────────────────────────────
// The checkbox is the native control, left alone (§1 principle 8), and it
// is disabled because the file on disk is the truth and a click here would
// not reach it. Showing an editable control that silently discards the
// change is exactly the dishonesty PI §1.2 rules out.
function taskListPlugin(md) {
  md.core.ruler.after('inline', 'task_lists', (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      if (tokens[i].type !== 'inline') continue;
      if (tokens[i - 1].type !== 'paragraph_open') continue;
      if (tokens[i - 2].type !== 'list_item_open') continue;
      const m = /^\[([ xX])\]\s+/.exec(tokens[i].content);
      if (!m) continue;

      const checked = m[1] !== ' ';
      tokens[i].content = tokens[i].content.slice(m[0].length);
      const children = tokens[i].children;
      if (children && children.length && children[0].type === 'text') {
        children[0].content = children[0].content.replace(/^\[([ xX])\]\s+/, '');
      }

      const box = new state.Token('html_inline', '', 0);
      box.content = `<input type="checkbox" disabled${checked ? ' checked' : ''} aria-label="${checked ? 'done' : 'not done'}"> `;
      children.unshift(box);

      tokens[i - 2].attrJoin('class', 'task-list-item');
      tokens[i - 2].attrSet('data-checked', String(checked));
      // Walk back to the list that owns this item.
      for (let j = i - 3; j >= 0; j--) {
        if (tokens[j].type === 'bullet_list_open') { tokens[j].attrJoin('class', 'task-list'); break; }
        if (tokens[j].type === 'bullet_list_close') break;
      }
    }
    return true;
  });
}

// ── Heading anchors ────────────────────────────────────────────────────
function slugify(text, used) {
  let base = text.toLowerCase().trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!base) base = 'section';
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

function anchorPlugin(md) {
  md.core.ruler.push('heading_anchors', (state) => {
    const used = new Set();
    const headings = [];
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') continue;
      const inline = tokens[i + 1];
      // The visible words only: the study-notes extras put raw HTML and
      // placeholders into a heading's source, and neither belongs in the
      // contents panel or the slug.
      const text = (inline?.children
        ? inline.children.filter((t) => t.type === 'text' || t.type === 'code_inline' || t.type === 'math_inline')
          .map((t) => t.content).join('')
        : inline?.content ?? '').replace(HELD_RE, '').replace(/\s+/g, ' ').trim();
      const slug = slugify(text, used);
      tokens[i].attrSet('id', slug);
      headings.push({ level: Number(tokens[i].tag.slice(1)), text, slug });

      const link = new state.Token('html_inline', '', 0);
      link.content = `<a class="heading-anchor" href="#${slug}" aria-label="Link to this section">#</a>`;
      inline.children.push(link);
    }
    state.env.headings = headings;
    return true;
  });
}

// ── Study-notes extras ─────────────────────────────────────────────────
// A small vocabulary for revision notes, on top of Markdown:
//
//   > [!key] … / > [!exam|Custom title] …   callout boxes (key, exam, trap,
//                                            lol, mem, ex, code, tip, why)
//   ==text==                                 highlighter
//   {r:text} {o:…} {g:…} {b:…} {p:…}         coloured emphasis
//   {k:(｀・ω・´)}                           kaomoji, kept on one line
//   [[OFF]] [[ME]] [[HY]] [[NEW]]            source tags
//   ![caption](img/x.jpg "60%")              a figure at 60% width
//                                            ("80%!" = a big one)
//
// The source is rewritten before markdown-it sees it, prose only: fenced
// and inline code and display maths pass through untouched. Anything whose
// content must not be read as Markdown (a kaomoji full of underscores) is
// held out as a placeholder and put back into the finished HTML.

const HELD_OPEN = String.fromCharCode(0xe000);
const HELD_CLOSE = String.fromCharCode(0xe001);
const HELD_RE = new RegExp(`${HELD_OPEN}(\\d+)${HELD_CLOSE}`, 'g');

const CALLOUTS = {
  key: 'Key idea', exam: 'Exam bait', trap: 'Trap', lol: 'Brain break',
  mem: 'Remember it like this', ex: 'Worked example', code: 'Code', tip: 'Tip',
  why: 'Why tho', note: 'Note', warn: 'Careful',
};
const TAGS = {
  OFF: ['off', 'official'], ME: ['me', 'worked by me'], HY: ['hy', 'high-yield'], NEW: ['new', 'new'],
};

const PROTECTED_RE = /^(?:> ?)*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^(?:> ?)*\1[ \t]*$|`[^`\n]+`|\$\$[\s\S]+?\$\$/gm;

function studySource(body, held) {
  const hold = (html) => `${HELD_OPEN}${held.push(html) - 1}${HELD_CLOSE}`;
  const prose = (p) => p
    .replace(/\{k:([^{}\n]+?)\}/g, (_, t) => hold(`<span class="c-k">${escapeHtml(t)}</span>`))
    // Tight to the words, so `a == b && c == d` in pasted code stays code.
    .replace(/==(?=\S)([^=\n]*?[^\s=])==/g, '<mark class="hl">$1</mark>')
    .replace(/\{([rogbp]):([^{}\n]+?)\}/g, '<span class="c-$1">$2</span>')
    .replace(/\[\[(OFF|ME|HY|NEW)\]\]/g, (_, t) =>
      hold(`<span class="tag tag--${TAGS[t][0]}">${TAGS[t][1]}</span>`))
    .replace(/\[\[([^\]|#\n]+?)(#[^\]|\n]+)?(?:\|([^\]\n]+))?\]\]/g, (_, name, anchor = '', label) =>
      `<a class="wikilink" href="wiki:${encodeURIComponent(name.trim())}${anchor}">${escapeHtml((label || name).trim())}</a>`)
    .replace(/↔/g, '⟷');   // ↔ renders as an emoji in some fonts

  let out = '';
  let last = 0;
  PROTECTED_RE.lastIndex = 0;
  let m;
  while ((m = PROTECTED_RE.exec(body))) {
    out += prose(body.slice(last, m.index)) + m[0];
    last = PROTECTED_RE.lastIndex;
  }
  return out + prose(body.slice(last));
}

function studyHtml(html, held) {
  if (held.length) html = html.replace(HELD_RE, (_, i) => held[+i]);

  // Callouts: a blockquote whose first line is [!type] or [!type|title].
  // Nesting is tracked so a plain quote inside a callout stays a quote.
  if (html.includes('[!')) {
    const stack = [];
    let out = '';
    let last = 0;
    const re = /<blockquote( data-line="\d+")?>\s*(<p[^>]*>\[!(\w+)(?:\|([^\]\n]+))?\]\s*)?|<\/blockquote>/g;
    let m;
    while ((m = re.exec(html))) {
      out += html.slice(last, m.index);
      last = re.lastIndex;
      if (m[0].startsWith('</')) {
        out += stack.pop() ? '</div></aside>' : '</blockquote>';
      } else if (m[3]) {
        const type = m[3].toLowerCase();
        stack.push(true);
        out += `<aside class="callout callout--${escapeHtml(type)}"${m[1] || ''}><div class="callout__title">` +
          `${m[4] || CALLOUTS[type] || escapeHtml(type)}</div><div class="callout__body"><p>`;
      } else {
        stack.push(false);
        out += m[0];
      }
    }
    html = (out + html.slice(last)).replace(/<div class="callout__body"><p>\s*<\/p>/g, '<div class="callout__body">');
  }

  // A paragraph that is only an image becomes a captioned figure; a title
  // of "60%" sets its width and "80%!" marks a figure allowed to be tall.
  html = html.replace(
    /<p( data-line="\d+")?>\s*<img src="([^"]*)" alt="([^"]*)"(?: title="([^"]*)")?\s*\/?>\s*<\/p>/g,
    (_, line = '', src, alt, title = '') => {
      const big = title.endsWith('!');
      const t = title.replace(/!$/, '');
      const width = /^\d{1,3}%$/.test(t) ? ` style="width:${t}"` : '';
      const tip = !width && title ? ` title="${title}"` : '';
      return `<figure class="figure${big ? ' figure--big' : ''}"${line}><img src="${src}" alt="${alt}"${width}${tip}>` +
        `${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`;
    },
  );
  return html.replace(/(<img [^>]*?) title="(\d{1,3}%)!?"/g, '$1 style="width:$2"');
}

// ── Source lines ───────────────────────────────────────────────────────
// Every top-level block (and every list item) carries data-line, the
// 0-based line it starts on in the file. The confused marks, stickies and
// "jump to line" all anchor to these, so they line up with the editor.
const LINE_BLOCKS = new Set([
  'paragraph_open', 'heading_open', 'blockquote_open', 'bullet_list_open', 'ordered_list_open',
  'table_open', 'hr', 'fence', 'code_block', 'math_block',
]);

function lineAttr(token) {
  const line = token.attrGet && token.attrGet('data-line');
  return line === null || line === undefined ? '' : ` data-line="${line}"`;
}

function sourceLinePlugin(md) {
  md.core.ruler.push('source_lines', (state) => {
    const offset = state.env.lineOffset || 0;
    for (const t of state.tokens) {
      if (!t.map) continue;
      const top = t.level === 0 && LINE_BLOCKS.has(t.type);
      if (top || t.type === 'list_item_open') t.attrSet('data-line', String(t.map[0] + offset));
    }
    return true;
  });
  // Two kinds of fence become something richer:
  //   ```mermaid            a diagram (drawn after render, see ui/enhance.js)
  //   ```html run / ```js run  code you can run, in a sandbox, right under it
  //   ```html live          runs as soon as the note opens
  const plainFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, i, opts, env, self) => {
    const t = tokens[i];
    const info = (t.info || '').trim().toLowerCase();
    const lang = info.split(/\s+/)[0];
    if (lang === 'mermaid') {
      return `<div class="mermaid-block" data-mermaid="${encodeURIComponent(t.content)}"><pre class="mermaid-src">${escapeHtml(t.content)}</pre></div>\n`;
    }
    const run = /\b(run|live)\b/.exec(info);
    if (run && /^(html|js|javascript)$/.test(lang)) {
      const kind = lang === 'html' ? 'html' : 'js';
      return `<div class="runblock" data-kind="${kind}" data-auto="${run[1] === 'live'}" data-code="${encodeURIComponent(t.content)}">${plainFence(tokens, i, opts, env, self)}</div>\n`;
    }
    return plainFence(tokens, i, opts, env, self);
  };

  // A highlighted fence comes back as finished HTML, so the line goes in by hand.
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, i, opts, env, self) => {
    const html = fence(tokens, i, opts, env, self);
    const attr = lineAttr(tokens[i]);
    return attr ? html.replace(/^<(pre|div)/, `<$1${attr}`) : html;
  };
}

// ── The instance ───────────────────────────────────────────────────────
function createMarkdownIt() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    // markdown-it only takes this verbatim when it starts with `<pre`;
    // anything else gets escaped and wrapped, which would nest one code
    // block inside another (§11.3 — containers never nest).
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : null;
      const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
      let html;
      try {
        html = language
          ? hljs.highlight(code, { language, ignoreIllegals: true }).value
          : escapeHtml(code);
      } catch {
        html = escapeHtml(code);
      }
      const cls = `hljs${language ? ` language-${escapeHtml(language)}` : ''}`;
      return `<pre>${label}<code class="${cls}">${html}</code></pre>`;
    },
  });

  md.use(footnote);
  md.use(mathPlugin);
  md.use(taskListPlugin);
  md.use(anchorPlugin);
  md.use(sourceLinePlugin);

  // Wide tables scroll as a unit rather than stretching the reader column
  // (Patterns §4: horizontal scrolling is a panel-level behaviour).
  const defaultTableOpen = md.renderer.rules.table_open
    || ((tokens, i, opts, env, self) => self.renderToken(tokens, i, opts));
  md.renderer.rules.table_open = (tokens, i, opts, env, self) =>
    `<div class="table-wrap">${defaultTableOpen(tokens, i, opts, env, self)}`;
  const defaultTableClose = md.renderer.rules.table_close
    || ((tokens, i, opts, env, self) => self.renderToken(tokens, i, opts));
  md.renderer.rules.table_close = (tokens, i, opts, env, self) =>
    `${defaultTableClose(tokens, i, opts, env, self)}</div>`;

  return md;
}

const md = createMarkdownIt();

// ── Front matter ───────────────────────────────────────────────────────
const FM_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function stripFrontMatter(raw) {
  const m = FM_RE.exec(raw);
  if (!m) return { body: raw, frontMatter: {} };
  const frontMatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_.$-]+)\s*:\s*(.*)$/.exec(line);
    if (pair) frontMatter[pair[1]] = pair[2].trim();
  }
  return { body: raw.slice(m[0].length), frontMatter };
}

// ── Rendering ──────────────────────────────────────────────────────────
/**
 * @param {string} raw        the file as it is on disk
 * @param {string} notePath   content-relative path, for resolving links
 * @returns {{ html: string, headings: Array, css: string, frontMatter: object }}
 */
export function renderNote(raw, notePath) {
  const { body, frontMatter } = stripFrontMatter(raw);
  // Lines lost to front matter, so data-line matches the file on disk.
  const env = { lineOffset: raw.length > body.length ? raw.slice(0, raw.length - body.length).split('\n').length - 1 : 0 };
  const held = [];
  let html = md.render(studySource(body, held), env);
  html = studyHtml(html, held);

  // Pull the note's own <style> blocks out, scope them, and hand them back
  // separately so the viewer can attach and detach them with the note.
  const styles = [];
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    styles.push(scopeCss(css, '.note-content'));
    return '';
  });

  // A note's inline <script> never runs: the app would have no way to
  // contain it, and a note is content, not chrome.
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  return {
    html,
    headings: env.headings || [],
    css: styles.filter(Boolean).join('\n'),
    frontMatter,
  };
}

/** Rewrite links and images inside a rendered note, in the DOM.
 *
 *  Runs after insertion rather than over the HTML string so it can only
 *  ever touch real attributes, and so a note that writes its own markup is
 *  treated exactly like one that used Markdown syntax. */
export function rewriteLinks(root, notePath, { exists, resolveWiki } = {}) {
  const dir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : '';

  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!href) continue;

    if (href.startsWith('wiki:')) {
      const [name, anchor] = safeDecode(href.slice(5)).split('#');
      const target = resolveWiki?.(name);
      if (target) a.setAttribute('href', toHash(target, anchor ? slugify(anchor, new Set()) : ''));
      else { a.setAttribute('href', '#'); a.dataset.missing = 'true'; a.title = `No note called ${name}`; }
      continue;
    }

    if (href.startsWith('#')) {
      // In-note anchor: keep it inside the current route.
      a.setAttribute('href', `${window.location.hash.split('#').slice(0, 2).join('#')}#${href.slice(1)}`);
      a.dataset.inNote = 'true';
      continue;
    }

    const resolved = resolveRelative(dir, href);
    if (resolved === null) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      continue;
    }

    const [pathPart, anchorPart] = resolved.split('#');
    const decoded = safeDecode(pathPart).replace(/\/$/, '');
    if (!/\.(md|markdown|mdx)$/i.test(pathPart) && exists && exists(decoded)) {
      // An attachment that is in the index opens in its viewer, inside the app.
      a.setAttribute('href', toHash(decoded));
    } else if (/\.(md|markdown|mdx)$/i.test(pathPart)) {
      a.setAttribute('href', toHash(decoded, anchorPart));
      // A link to a note that is not in the index is marked rather than
      // silently handed to the user as if it worked (PI §1.4).
      if (exists && !exists(decoded)) {
        a.dataset.missing = 'true';
        a.title = `No note at ${decoded}`;
      }
    } else {
      a.setAttribute('href', new URL(`content/${pathPart}`, document.baseURI).href);
    }
  }

  for (const el of root.querySelectorAll('img[src], video[src], source[src], audio[src]')) {
    const src = el.getAttribute('src');
    const resolved = resolveRelative(dir, src || '');
    if (resolved === null) continue;
    el.setAttribute('src', new URL(
      `content/${resolved.split('/').map((s) => encodeURIComponent(safeDecode(s))).join('/')}`,
      document.baseURI,
    ).href);
    el.setAttribute('loading', 'lazy');
    el.setAttribute('decoding', 'async');
  }
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** Wrap matches of the current search terms, for the opened note. */
export function highlightTerms(root, terms) {
  if (!terms.length) return 0;
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi',
  );
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('pre, code, .katex, .heading-anchor')) return NodeFilter.FILTER_REJECT;
      return pattern.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const targets = [];
  let node;
  while ((node = walker.nextNode())) targets.push(node);

  let count = 0;
  for (const text of targets) {
    const frag = document.createDocumentFragment();
    let last = 0;
    const value = text.nodeValue;
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(value))) {
      if (m.index > last) frag.appendChild(document.createTextNode(value.slice(last, m.index)));
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = m.index + m[0].length;
      count++;
    }
    if (last < value.length) frag.appendChild(document.createTextNode(value.slice(last)));
    text.parentNode.replaceChild(frag, text);
  }
  return count;
}
