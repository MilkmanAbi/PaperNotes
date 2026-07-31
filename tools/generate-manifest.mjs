#!/usr/bin/env node
/**
 * generate-manifest.mjs  (v2)
 * Walks the repo to ARBITRARY depth and writes PaperNotes/manifest.json.
 *
 * Layout it understands (folders can nest as deep as you like):
 *   <root>/
 *     <Folder>/                 <- any folder that isn't the engine/ignored
 *       _meta.json              <- optional: { title, code, emoji, accent, blurb, tagline, order }
 *       *.md                    <- notes; frontmatter: title, emoji, order, blurb, tags
 *       <Subfolder>/ ...        <- and so on, no depth limit
 *
 * Output (manifest v2):
 *   {
 *     generatedAt, app, version: 2,
 *     tree:  <FolderNode>,               // nested structure for the file-tree UI
 *     index: { notes: [...], folders: [...] }   // flat index for global search
 *   }
 *
 * Reading-time: ceil(words / 200), min 1. Headings/excerpt are extracted so
 * search can match inside a note, not just its title.
 */

import fs   from "node:fs";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT  = path.join(ROOT, "PaperNotes", "manifest.json");
const IGNORE_TOP = new Set([
  "PaperNotes", "tools", "node_modules", ".git", ".github", "assets", "docs", "build",
]);
const WPM = 200;

/* ---------- small helpers ---------- */
const isHidden   = (n) => n.startsWith(".");
const isNoteFile = (n) => /\.md$/i.test(n) && !n.startsWith("_");
const prettify   = (s) =>
  s.replace(/\.md$/i, "").replace(/^\d+[-_.]/, "").replace(/[-_]/g, " ")
   .replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function parseFrontmatter(text) {
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  const data = {};
  if (!m) return { data, body: text };
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k) data[k] = v;
  }
  return { data, body: text.slice(m[0].length) };
}

function parseTags(v) {
  if (!v) return [];
  return v.replace(/^\[|\]$/g, "").split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

const stripCode = (body) =>
  body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");

function extractHeadings(body) {
  const out = [];
  for (const line of stripCode(body).split(/\r?\n/)) {
    const m = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (m) out.push(m[2].replace(/[#*_`~]/g, "").trim());
  }
  return out;
}

function excerpt(body) {
  const t = stripCode(body)
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|]/g, " ")
    .replace(/\s+/g, " ").trim();
  return t.slice(0, 240);
}

function minutesOf(body) {
  const words = stripCode(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WPM));
}

const countNotes = (children) =>
  children.reduce((n, c) => n + (c.type === "note" ? 1 : c.noteCount), 0);

function sortChildren(children) {
  children.sort((a, b) => {
    const ao = a.order != null ? a.order : Infinity;
    const bo = b.order != null ? b.order : Infinity;
    if (ao !== bo) return ao - bo;
    return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
  });
}

/* ---------- walk one folder -> node (or null if it holds no notes) ---------- */
function walk(absDir, relPath) {
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); }
  catch { return null; }

  const meta = readJson(path.join(absDir, "_meta.json")) || {};
  const children = [];

  for (const e of entries) {
    if (relPath === "") break;   // root-level .md files (README etc.) are repo docs, not notes
    if (e.isFile() && isNoteFile(e.name)) {
      const abs  = path.join(absDir, e.name);
      const text = fs.readFileSync(abs, "utf8");
      const { data, body } = parseFrontmatter(text);
      children.push({
        type    : "note",
        name    : e.name,
        path    : relPath ? `${relPath}/${e.name}` : e.name,
        title   : data.title || prettify(e.name),
        emoji   : data.emoji || "",
        blurb   : data.blurb || "",
        order   : data.order != null && data.order !== "" ? Number(data.order) : null,
        minutes : minutesOf(body),
        tags    : parseTags(data.tags),
        headings: extractHeadings(body),
        excerpt : excerpt(body),
      });
    }
  }
  for (const e of entries) {
    if (!e.isDirectory() || isHidden(e.name) || e.name.startsWith("_")) continue;
    if (relPath === "" && IGNORE_TOP.has(e.name)) continue;
    const child = walk(path.join(absDir, e.name), relPath ? `${relPath}/${e.name}` : e.name);
    if (child) children.push(child);
  }

  const noteCount = countNotes(children);
  if (noteCount === 0) return null;          // prune folders with nothing to show
  sortChildren(children);

  const name = relPath ? relPath.split("/").pop() : "";
  return {
    type     : "folder",
    name,
    path     : relPath,
    title    : meta.title || (name ? prettify(name) : "PaperNotes"),
    emoji    : meta.emoji || "",
    blurb    : meta.blurb || "",
    tagline  : meta.tagline || "",
    code     : meta.code || "",
    accent   : meta.accent || "",
    order    : meta.order != null ? Number(meta.order) : null,
    noteCount,
    children,
  };
}

/* ---------- flat index (for search + breadcrumbs) ---------- */
function buildTitleMap(node, map) {
  if (node.path) map.set(node.path, node.title);
  if (node.type === "folder") for (const c of node.children) buildTitleMap(c, map);
}
function crumbsFor(folderPath, titleMap) {
  if (!folderPath) return [];
  const segs = folderPath.split("/");
  const crumbs = [];
  let acc = "";
  for (const s of segs) {
    acc = acc ? `${acc}/${s}` : s;
    crumbs.push({ name: titleMap.get(acc) || prettify(s), path: acc });
  }
  return crumbs;
}
function flatten(node, index, titleMap) {
  if (node.type === "folder") {
    if (node.path) index.folders.push({
      path: node.path, title: node.title, emoji: node.emoji,
      blurb: node.blurb, noteCount: node.noteCount,
      crumbs: crumbsFor(node.path.split("/").slice(0, -1).join("/"), titleMap),
    });
    for (const c of node.children) flatten(c, index, titleMap);
  } else {
    const folderPath = node.path.split("/").slice(0, -1).join("/");
    index.notes.push({
      path: node.path, title: node.title, emoji: node.emoji, blurb: node.blurb,
      minutes: node.minutes, order: node.order, tags: node.tags,
      headings: node.headings, excerpt: node.excerpt,
      folderPath, crumbs: crumbsFor(folderPath, titleMap),
    });
  }
}

/* ---------- main ---------- */
const tree = walk(ROOT, "") || {
  type: "folder", name: "", path: "", title: "PaperNotes",
  emoji: "", blurb: "", tagline: "", code: "", accent: "", order: null,
  noteCount: 0, children: [],
};

const titleMap = new Map();
buildTitleMap(tree, titleMap);
const index = { notes: [], folders: [] };
flatten(tree, index, titleMap);

const manifest = {
  generatedAt: new Date().toISOString(),
  app: "PaperNotes",
  version: 2,
  tree,
  index,
};

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`manifest v2 written -> ${OUT}`);
console.log(`  ${index.notes.length} notes, ${index.folders.length} folders, ${tree.noteCount} total notes in tree`);
