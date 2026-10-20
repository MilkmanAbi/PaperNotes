/** Diagrams you can write in seconds, by hand or by asking Claude:
 *
 *  ```tree                     ```flow
 *  Recycling at SP             (Start)
 *    Plastic                     Is the cup empty?
 *      Bottles                     |yes| Rinse it -> Plastic bin
 *      Bubble tea cups             |no| Pour it out -> Is the cup empty?
 *    Paper                     Plastic bin -> (Done)
 *  ```                         ```
 *
 *  Both read an indented outline, one box per line (bullets are fine).
 *  ```tree draws it as a tree, to the right or (```tree down) downwards;
 *  click a box to fold its branch. ```flow is a flowchart: indenting a line
 *  under another draws an arrow to it, `A -> B` draws one on a single line,
 *  `|yes|` labels the arrow into a box, and writing the same text twice
 *  means the same box, which is how branches meet again or loop back.
 *  A box ending in "?" is a decision, (Round) is a start or an end,
 *  ((Circle)), [(Database)] and [/Input/] are the other shapes, and a box
 *  that is a [[link]] opens that note. ```flow right lays it out sideways.
 *
 *  Flowcharts are drawn by Mermaid (already part of PaperNotes), coloured
 *  from the current theme; trees are drawn here. */

import { renderLabel } from '../core/markdown.js';
import { mix } from '../core/colour.js';

let mermaidLoad = null;
let mermaidSeq = 0;

// ── the outline both kinds start from ──────────────────────────────────
function outline(src) {
  const lines = [];
  src.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim() || /^\s*(\/\/|%%)/.test(raw)) return;
    const m = /^([ \t]*)(?:(?:[-*+]|\d+[.)])[ \t]+)?(.*?)\s*$/.exec(raw);
    const indent = m[1].replace(/\t/g, '    ').length;
    if (m[2]) lines.push({ indent, text: m[2], line: i + 1 });
  });
  return lines;
}

function nest(lines) {
  const roots = [];
  const stack = [];
  for (const l of lines) {
    const node = { text: l.text, line: l.line, children: [] };
    while (stack.length && stack[stack.length - 1].indent >= l.indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ indent: l.indent, node });
  }
  return roots;
}

function fail(block, message) {
  block.dataset.done = '1';
  block.querySelector('.pn-diagram__error')?.remove();
  block.insertAdjacentHTML('beforeend', `<p class="pn-diagram__error">${String(message).replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</p>`);
}

/** Draw every ```tree, ```flow and ```mermaid block under `root`. */
export async function drawDiagrams(root, ctx = {}) {
  for (const b of root.querySelectorAll('.pn-tree:not([data-done])')) {
    try { drawTree(b, decodeURIComponent(b.dataset.src || ''), b.dataset.opts || '', ctx); } catch (err) { fail(b, err.message); }
  }
  const flows = [...root.querySelectorAll('.pn-flow:not([data-done])')];
  const mermaids = [...root.querySelectorAll('.mermaid-block:not([data-done])')];
  if (!flows.length && !mermaids.length) return;
  const mermaid = await loadMermaid(root);
  for (const b of flows) {
    b.dataset.done = '1';
    let flow;
    try { flow = compileFlow(decodeURIComponent(b.dataset.src || ''), b.dataset.opts || ''); } catch (err) { fail(b, err.message); continue; }
    try {
      const { svg } = await mermaid.render(`pn-flow-${++mermaidSeq}`, flow.code);
      b.innerHTML = svg;
      b.classList.add('is-drawn');
      linkFlowNodes(b, flow, ctx);
    } catch (err) { fail(b, `Could not draw this flowchart: ${err?.message || err}`); }
  }
  for (const b of mermaids) {
    b.dataset.done = '1';
    try {
      const { svg } = await mermaid.render(`pn-mermaid-${++mermaidSeq}`, decodeURIComponent(b.dataset.mermaid || ''));
      b.innerHTML = svg;
    } catch (err) {
      b.insertAdjacentHTML('beforeend', `<p class="mermaid-error">Diagram error: ${String(err?.message || err).replace(/[<&]/g, '')}</p>`);
    }
  }
}

// ── trees ───────────────────────────────────────────────────────────────
const HUES = ['blue', 'green', 'orange', 'purple', 'teal', 'red'];
const GAP_MAIN = 44;   // between levels
const GAP_CROSS = 10;  // between siblings
const SVG_NS = 'http://www.w3.org/2000/svg';

function drawTree(block, src, opts, ctx) {
  const roots = nest(outline(src));
  if (!roots.length) throw new Error('This tree is empty: write one box per line, indenting children under their parent.');
  const down = /\b(down|vertical|top)\b/.test(opts);
  block.dataset.done = '1';

  const canvas = document.createElement('div');
  canvas.className = `pn-tree__canvas ${down ? 'is-down' : 'is-right'}`;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pn-tree__edges');
  svg.setAttribute('aria-hidden', 'true');
  canvas.appendChild(svg);

  const nodes = [];
  const make = (n, depth, hue, parent) => {
    n.depth = depth;
    n.parent = parent;
    const el = document.createElement('div');
    el.className = `pn-node${depth === 0 ? ' pn-node--root' : ''}${n.children.length ? ' pn-node--branch' : ''}`;
    el.style.setProperty('--branch', depth === 0 ? 'var(--accent)' : `var(--n-${hue})`);
    el.innerHTML = `<span class="pn-node__text">${renderLabel(n.text)}</span>`;
    if (n.children.length) {
      el.tabIndex = 0;
      el.title = 'Click to fold or unfold';
      el.insertAdjacentHTML('beforeend', `<span class="pn-node__more" hidden>+${count(n)}</span>`);
    }
    n.el = el;
    canvas.appendChild(el);
    nodes.push(n);
    n.children.forEach((c, i) => make(c, depth + 1, depth === 0 ? HUES[i % HUES.length] : hue, n));
  };
  roots.forEach((r, i) => make(r, 0, HUES[i % HUES.length], null));

  block.replaceChildren(canvas);
  ctx.rewrite?.(canvas);

  const visible = (n) => { for (let p = n.parent; p; p = p.parent) if (p.collapsed) return false; return true; };
  const layout = () => {
    const shown = nodes.filter(visible);
    for (const n of nodes) n.el.hidden = !shown.includes(n);
    for (const n of shown) { n.w = n.el.offsetWidth; n.h = n.el.offsetHeight; }
    // Space each level by its widest (or tallest) box.
    const size = [];
    for (const n of shown) size[n.depth] = Math.max(size[n.depth] || 0, down ? n.h : n.w);
    const at = [0];
    for (let d = 1; d < size.length; d++) at[d] = at[d - 1] + size[d - 1] + GAP_MAIN;
    // Leaves take the next free slot along the cross axis; parents sit centred on their children.
    let cursor = 0;
    const cross = (n) => (down ? n.w : n.h);
    const shift = (n, by) => { n.c += by; if (!n.collapsed) n.children.forEach((c) => shift(c, by)); };
    const place = (n) => {
      const start = cursor;
      const kids = n.collapsed ? [] : n.children;
      if (!kids.length) {
        n.c = cursor;
        cursor += cross(n) + GAP_CROSS;
        return;
      }
      kids.forEach(place);
      const first = kids[0];
      const last = kids[kids.length - 1];
      n.c = (first.c + cross(first) / 2 + last.c + cross(last) / 2) / 2 - cross(n) / 2;
      if (n.c < start) { const by = start - n.c; shift(n, by); cursor += by; }
      cursor = Math.max(cursor, n.c + cross(n) + GAP_CROSS);
    };
    roots.forEach((r) => { place(r); cursor += GAP_CROSS * 2; });

    let maxX = 0;
    let maxY = 0;
    for (const n of shown) {
      n.x = down ? n.c : at[n.depth];
      n.y = down ? at[n.depth] : n.c;
      n.el.style.transform = `translate(${n.x}px, ${n.y}px)`;
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    canvas.style.width = `${maxX + 2}px`;
    canvas.style.height = `${maxY + 2}px`;
    svg.setAttribute('width', maxX + 2);
    svg.setAttribute('height', maxY + 2);

    const paths = [];
    for (const n of shown) {
      if (!n.parent) continue;
      const p = n.parent;
      let d;
      if (down) {
        const x1 = p.x + p.w / 2; const y1 = p.y + p.h; const x2 = n.x + n.w / 2; const y2 = n.y; const ym = (y1 + y2) / 2;
        d = `M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}`;
      } else {
        const x1 = p.x + p.w; const y1 = p.y + p.h / 2; const x2 = n.x; const y2 = n.y + n.h / 2; const xm = (x1 + x2) / 2;
        d = `M${x1} ${y1}C${xm} ${y1} ${xm} ${y2} ${x2} ${y2}`;
      }
      paths.push(`<path d="${d}" style="stroke:${n.el.style.getPropertyValue('--branch')}"/>`);
    }
    svg.innerHTML = paths.join('');
  };

  canvas.addEventListener('click', (e) => {
    if (e.target.closest('a, .hashtag')) return;
    const el = e.target.closest('.pn-node--branch');
    const n = el && nodes.find((x) => x.el === el);
    if (!n) return;
    n.collapsed = !n.collapsed;
    el.classList.toggle('is-folded', n.collapsed);
    el.querySelector('.pn-node__more').hidden = !n.collapsed;
    layout();
  });
  canvas.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('pn-node--branch')) { e.preventDefault(); e.target.click(); }
  });

  layout();
  // Web fonts can arrive after the first layout and change every box's size.
  document.fonts?.ready.then(layout);
}

function count(n) { return n.children.reduce((s, c) => s + 1 + count(c), 0); }

// ── flowcharts ──────────────────────────────────────────────────────────
const SHAPES = [
  [/^\(\((.+)\)\)$/, 'circle'],
  [/^\[\((.+)\)\]$/, 'db'],
  [/^\[\/(.+)\/\]$/, 'io'],
  [/^\((.+)\)$/, 'round'],
];
const WIKI = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/;

function parseBox(raw, line) {
  let text = raw.trim();
  let label = '';
  const lab = /^\|([^|]*)\|\s*(.*)$/.exec(text);
  if (lab) { label = lab[1].trim(); text = lab[2].trim(); } else if (text.startsWith('|')) {
    throw new Error(`Line ${line}: an arrow label needs a closing |, like |yes| Next step`);
  }
  let shape = '';
  for (const [re, s] of SHAPES) {
    const m = re.exec(text);
    if (m) { text = m[1].trim(); shape = s; break; }
  }
  if (!shape && text.endsWith('?')) shape = 'decision';
  let link = '';
  const w = WIKI.exec(text);
  if (w) { link = w[1].trim(); text = text.replace(WIKI, (_, name, shown) => (shown || name).trim()); }
  return { text, shape, link, label };
}

/** The easy syntax as Mermaid. Exported for tests and the slash menu's preview. */
export function compileFlow(src, opts = '') {
  const dir = /\b(right|lr|sideways)\b/.test(opts) ? 'LR' : /\bleft\b/.test(opts) ? 'RL' : /\bup\b/.test(opts) ? 'BT' : 'TD';
  const boxes = new Map();
  const edges = [];
  const seen = new Set();
  const stack = [];
  const box = (b, line) => {
    if (!b.text) throw new Error(`Line ${line}: there is an empty box here. Every arrow (->) needs a box on both sides.`);
    const key = b.text.toLowerCase().replace(/\s+/g, ' ');
    let n = boxes.get(key);
    if (!n) { n = { id: `n${boxes.size + 1}`, text: b.text, shape: b.shape || 'box', link: b.link }; boxes.set(key, n); } else {
      if (b.shape && n.shape === 'box') n.shape = b.shape;
      if (b.link && !n.link) n.link = b.link;
    }
    return n;
  };
  const edge = (from, to, label) => {
    const k = `${from.id}>${to.id}>${label}`;
    if (!seen.has(k)) { seen.add(k); edges.push({ from, to, label }); }
  };
  const lines = outline(src);
  if (!lines.length) throw new Error('This flowchart is empty: write one step per line, and indent what comes next under it.');
  for (const l of lines) {
    const parts = l.text.split(/\s*->\s*/);
    const chain = parts.map((p) => parseBox(p, l.line));
    const chainBoxes = chain.map((b) => box(b, l.line));
    while (stack.length && stack[stack.length - 1].indent >= l.indent) stack.pop();
    const parent = stack[stack.length - 1]?.box;
    if (parent) edge(parent, chainBoxes[0], chain[0].label);
    else if (chain[0].label) throw new Error(`Line ${l.line}: |${chain[0].label}| labels an arrow, but nothing above this line points here. Indent it under the step it comes from.`);
    for (let i = 1; i < chainBoxes.length; i++) edge(chainBoxes[i - 1], chainBoxes[i], chain[i].label);
    stack.push({ indent: l.indent, box: chainBoxes[chainBoxes.length - 1] });
  }
  const q = (s) => `"${s.replace(/"/g, '#quot;')}"`;
  const shapeOf = {
    box: (t) => `(${q(t)})`, round: (t) => `([${q(t)}])`, decision: (t) => `{${q(t)}}`,
    circle: (t) => `((${q(t)}))`, db: (t) => `[(${q(t)})]`, io: (t) => `[/${q(t)}/]`,
  };
  const out = [`flowchart ${dir}`];
  for (const n of boxes.values()) out.push(`  ${n.id}${shapeOf[n.shape](n.text)}`);
  for (const e of edges) out.push(`  ${e.from.id} -->${e.label ? `|${q(e.label)}|` : ''} ${e.to.id}`);
  const byShape = (s) => [...boxes.values()].filter((n) => n.shape === s).map((n) => n.id);
  if (byShape('decision').length) out.push(`  class ${byShape('decision').join(',')} pnDecision`);
  if (byShape('round').length) out.push(`  class ${byShape('round').join(',')} pnEnds`);
  const links = [...boxes.values()].filter((n) => n.link).map((n) => n.id);
  if (links.length) out.push(`  class ${links.join(',')} pnLink`);
  return { code: out.join('\n'), boxes: [...boxes.values()] };
}

function linkFlowNodes(block, flow, ctx) {
  for (const n of flow.boxes) {
    if (!n.link) continue;
    const g = block.querySelector(`g.node[id*="-${n.id}-"]`);
    const path = ctx.resolveWiki?.(n.link);
    if (!g || !path) continue;
    g.style.cursor = 'pointer';
    g.setAttribute('role', 'link');
    g.setAttribute('tabindex', '0');
    g.addEventListener('click', () => ctx.open?.(path));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') ctx.open?.(path); });
  }
}

// ── Mermaid, in the theme's colours ────────────────────────────────────
let probe = null;
/** Any CSS colour as #rrggbb (or rgba() if it is see-through): Mermaid's
 *  colour maths does not read every modern CSS colour syntax. */
function solid(value, fallback) {
  probe ||= document.createElement('canvas').getContext('2d');
  probe.fillStyle = '#000000';
  probe.fillStyle = value || fallback;
  return probe.fillStyle;
}

async function loadMermaid(root) {
  mermaidLoad ||= import('mermaid').then((m) => m.default);
  const mermaid = await mermaidLoad;
  const cs = getComputedStyle(root.closest('.note-content') || root);
  // Mermaid sizes every box from the text it measures, so the note's font
  // has to be here first, or a bundled font arriving late overflows them.
  try { await document.fonts.load(`14px ${cs.fontFamily}`); } catch { /* measure with what there is */ }
  const v = (name, fallback) => solid(cs.getPropertyValue(name).trim(), fallback);
  const raised = v('--surface-raised', '#ffffff');
  const ink = v('--ink-primary', '#222222');
  const accent = v('--accent', '#4e6336');
  const orange = v('--n-orange', '#c27b2d');
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : null);
  const tint = (c, t) => (hex(c) && hex(raised) ? mix(raised, c, t) : raised);
  const dark = (hex(raised) ? parseInt(raised.slice(1, 3), 16) + parseInt(raised.slice(3, 5), 16) + parseInt(raised.slice(5, 7), 16) : 600) < 384;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    look: 'classic',   // flat shapes in the theme's colours, no drop shadows
    theme: 'base',
    fontFamily: cs.fontFamily || 'Inter, "Segoe UI", system-ui, sans-serif',
    themeVariables: {
      darkMode: dark,
      background: raised,
      primaryColor: tint(accent, 0.1),
      primaryTextColor: ink,
      primaryBorderColor: accent,
      secondaryColor: tint(orange, 0.14),
      tertiaryColor: v('--surface-sunken', raised),
      lineColor: v('--ink-secondary', '#666666'),
      textColor: ink,
      edgeLabelBackground: raised,
      clusterBkg: v('--surface-sunken', raised),
      clusterBorder: v('--ink-tertiary', '#999999'),
      fontSize: '14px',
    },
    themeCSS: `.pnDecision :is(rect, path, polygon, circle, ellipse) { fill: ${tint(orange, 0.16)} !important; stroke: ${orange} !important; }
      .pnEnds :is(rect, path, polygon, circle, ellipse) { fill: ${accent} !important; stroke: ${accent} !important; }
      .pnEnds .nodeLabel, .pnEnds .nodeLabel * { color: ${v('--ink-on-accent', '#ffffff')} !important; fill: ${v('--ink-on-accent', '#ffffff')} !important; }
      .pnLink .nodeLabel { text-decoration: underline; text-underline-offset: 3px; }`,
  });
  return mermaid;
}
