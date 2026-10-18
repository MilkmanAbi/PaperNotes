// A deliberately small YAML-ish front matter reader.
//
// It understands exactly what the index needs — scalars, inline lists and
// block lists — and nothing else. A full YAML parser would be a dependency
// carried into every build for six keys, and the failure mode of a partial
// parse here is "this note has no tags", not a broken site.

const FM_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquote(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"') && v.length > 1) ||
      (v.startsWith("'") && v.endsWith("'") && v.length > 1)) {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return v;
}

function coerce(value) {
  const v = value.trim();
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => coerce(unquote(s)));
  }
  return unquote(v);
}

/** @returns {{ data: Record<string, any>, body: string, offset: number }} */
export function parseFrontMatter(raw) {
  const match = FM_RE.exec(raw);
  if (!match) return { data: {}, body: raw, offset: 0 };

  const data = {};
  const lines = match[1].split(/\r?\n/);
  let currentKey = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(coerce(listItem[1]));
      continue;
    }

    const pair = /^([A-Za-z0-9_.$-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, rest] = pair;
    currentKey = key;
    data[key] = rest.trim() === '' ? [] : coerce(rest);
  }

  return { data, body: raw.slice(match[0].length), offset: match[0].length };
}

/** First ATX heading in the body, used when front matter has no title. */
export function firstHeading(body) {
  const m = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body);
  if (!m) return null;
  return m[1]
    .replace(/\{[rogbpk]:([^{}\n]*)\}/g, '$1')
    .replace(/\[\[(OFF|ME|HY|NEW)\]\]/g, '')
    .replace(/==/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/[*_]([^*_]*)[*_]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim() || null;
}

/** Plain-ish text for the search index and the preview line. */
export function toPlainText(body) {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    // The study-notes extras (see markdown.js) leave their words, not their markup.
    .replace(/\{[rogbpk]:([^{}\n]*)\}/g, '$1')
    .replace(/\[\[(OFF|ME|HY|NEW)\]\]/g, ' ')
    .replace(/\[!\w+(?:\|([^\]\n]*))?\]/g, '$1')
    .replace(/==/g, '')
    .replace(/^[ \t]{0,3}[#>|=*+-]+[ \t]*/gm, ' ')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
