/** Scope a note's own CSS to the content region.
 *
 *  §4.1 draws a hard line between chrome — the application, which the user
 *  trusts — and content, which the application is merely displaying. A note
 *  is content. It is allowed to bring styles; it is not allowed to restyle
 *  the toolbar, recolour the tree, or paint something over the window that
 *  looks like part of the app.
 *
 *  So every selector a note ships is rewritten to sit under the scope, and
 *  two properties that exist specifically to escape a container are
 *  neutralised: `position: fixed` becomes `position: absolute`, and runaway
 *  z-indexes are clamped below the app's own layers. Everything else —
 *  colours, grids, animations, custom properties, media queries — passes
 *  through untouched, because a note styling itself is the whole point. */

const Z_CEILING = 20;

/** Remove comments before anything else looks at the stylesheet.
 *
 *  They carry no meaning at runtime and they actively break selector
 *  handling: a comment sitting in front of a rule gets prefixed as if it
 *  were part of the selector, and a comma inside one splits a selector list
 *  in the wrong place. String literals are respected so a `content: "/*"`
 *  is not mistaken for the start of one. */
function stripComments(css) {
  let out = '';
  let inString = null;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (inString) {
      out += ch;
      if (ch === '\\') { out += css[++i] ?? ''; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = ch; out += ch; continue; }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

/** Split a block of CSS into top-level chunks, string- and comment-aware. */
function* topLevelChunks(css) {
  let depth = 0;
  let start = 0;
  let inString = null;
  let inComment = false;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const next = css[i + 1];

    if (inComment) {
      if (ch === '*' && next === '/') { inComment = false; i++; }
      continue;
    }
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '/' && next === '*') { inComment = true; i++; continue; }
    if (ch === '"' || ch === "'") { inString = ch; continue; }

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { yield css.slice(start, i + 1); start = i + 1; }
    } else if (ch === ';' && depth === 0) {
      yield css.slice(start, i + 1);   // an at-statement such as @import
      start = i + 1;
    }
  }
  if (start < css.length && css.slice(start).trim()) yield css.slice(start);
}

function splitSelectors(selectorText) {
  const out = [];
  let depth = 0;
  let current = '';
  let inString = null;
  for (let i = 0; i < selectorText.length; i++) {
    const ch = selectorText[i];
    if (inString) {
      current += ch;
      if (ch === '\\') { current += selectorText[++i] ?? ''; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = ch; current += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) out.push(current);
  return out;
}

function scopeSelector(selector, scope) {
  const s = selector.trim();
  if (!s) return s;
  // A note talking about the document means "my own region".
  if (/^(:root|html|body)$/i.test(s)) return scope;
  if (/^(:root|html|body)\b/i.test(s)) return `${scope}${s.replace(/^(:root|html|body)/i, '')}`;
  // `&` is not supported inside a plain <style> in every engine, but a note
  // may well write it; treat it as the scope.
  if (s.includes('&')) return s.replace(/&/g, scope);
  return `${scope} ${s}`;
}

function sanitizeDeclarations(body) {
  return body
    .replace(/position\s*:\s*fixed/gi, 'position: absolute')
    .replace(/z-index\s*:\s*(-?\d+)/gi, (match, n) =>
      Number(n) > Z_CEILING ? `z-index: ${Z_CEILING}` : match);
}

const PASSTHROUGH_AT = /^@(keyframes|-webkit-keyframes|font-face|counter-style|property|page|namespace|charset|import)\b/i;
const NESTED_AT = /^@(media|supports|container|layer|scope)\b/i;

function scopeChunk(chunk, scope) {
  const trimmed = chunk.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('@')) {
    // @import can pull in an arbitrary unscoped stylesheet, which is exactly
    // the escape hatch this function exists to close.
    if (/^@import\b/i.test(trimmed)) return '';
    if (PASSTHROUGH_AT.test(trimmed)) return trimmed;
    if (NESTED_AT.test(trimmed)) {
      const open = trimmed.indexOf('{');
      if (open === -1) return trimmed;
      const prelude = trimmed.slice(0, open + 1);
      const inner = trimmed.slice(open + 1, trimmed.lastIndexOf('}'));
      const scopedInner = [...topLevelChunks(inner)]
        .map((c) => scopeChunk(c, scope))
        .filter(Boolean)
        .join('\n');
      return `${prelude}\n${scopedInner}\n}`;
    }
    return trimmed;
  }

  const open = trimmed.indexOf('{');
  if (open === -1) return '';
  const selectors = splitSelectors(trimmed.slice(0, open));
  const body = sanitizeDeclarations(trimmed.slice(open + 1, trimmed.lastIndexOf('}')));
  const scoped = selectors.map((s) => scopeSelector(s, scope)).join(',\n');
  return `${scoped} {${body}}`;
}

/**
 * @param {string} css   the note's stylesheet
 * @param {string} scope a selector such as `.note-content`
 */
export function scopeCss(css, scope = '.note-content') {
  if (!css || !css.trim()) return '';
  try {
    return [...topLevelChunks(stripComments(css))]
      .map((chunk) => scopeChunk(chunk, scope))
      .filter(Boolean)
      .join('\n');
  } catch {
    // Never let a malformed stylesheet take the note down with it.
    return '';
  }
}
