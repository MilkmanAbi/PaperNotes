/* app.js — PaperNotes (v2)
 * A browser notebook with an arbitrarily-deep folder tree, global search,
 * breadcrumbs, per-note outlines, recents and bookmarks.
 *
 * Structure is read from PaperNotes/manifest.json (a prebuilt tree + search
 * index — run tools/generate-manifest.mjs to refresh it). If the manifest is
 * missing it falls back to discovering the tree live from the GitHub API, and
 * pulls note content RAW so it renders no matter what Jekyll does to .md files.
 *
 * Repo layout (folders nest as deep as you like):
 *   index.html                 <- entry (root)
 *   PaperNotes/…               <- this engine (css + js + manifest.json)
 *   <Folder>/…/*.md            <- notes; optional _meta.json per folder
 */
import { renderMarkdown, enhance, enhanceMedia, parseFrontmatter } from "./markdown.js";

/* ============================ CONFIG ============================ */
const CONFIG = {
  repo: { owner: "MilkmanAbi", name: "PaperNotes", branch: "main" },
  ignoreTop: ["PaperNotes", ".github", "assets", "node_modules", "tools", "docs", "build"],
};
const LS = {
  theme: "paper:theme", accent: "paper:accent", paper: "paper:paper",
  read: "paper:read", marks: "paper:marks", recents: "paper:recents",
  open: "paper:open", doodle: (k) => `paper:doodle:${k}`,
};
const ACCENTS = ["pink", "purple", "blue", "graphite"];
const LEAD_COLORS = {
  graphite: null, pink: "oklch(0.62 0.14 352)", purple: "oklch(0.6 0.14 305)", blue: "oklch(0.6 0.13 255)",
};

let SITE = null;
let TREE = null;                 // root folder node
let INDEX = null;                // { notes:[], folders:[] }  (flat, for search)
let NODES = new Map();           // path -> node
let ORDER = [];                  // note paths, tree (DFS) order — for global prev/next
const NOTE_CACHE = new Map();    // path -> { data, body }

const app = document.getElementById("app");
const root = document.documentElement;
const isMac = /mac/i.test(navigator.platform || navigator.userAgent);
const MODKEY = isMac ? "\u2318" : "Ctrl";

/* ============================ HELPERS ============================ */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  return n;
};
const prettify = (s) => s.replace(/\.md$/i, "").replace(/^\d+[-_.]/, "").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
const pad2 = (n) => String(n).padStart(2, "0");
const dateScrawl = () => new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }).toLowerCase();
const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");
const parentPath = (p) => p.split("/").slice(0, -1).join("/");

const readSet = () => new Set(JSON.parse(localStorage.getItem(LS.read) || "[]"));
const saveReadSet = (s) => localStorage.setItem(LS.read, JSON.stringify([...s]));
const markSet = () => new Set(JSON.parse(localStorage.getItem(LS.marks) || "[]"));
const saveMarkSet = (s) => localStorage.setItem(LS.marks, JSON.stringify([...s]));
const recents = () => JSON.parse(localStorage.getItem(LS.recents) || "[]");
const pushRecent = (path) => {
  const list = recents().filter((p) => p !== path); list.unshift(path);
  localStorage.setItem(LS.recents, JSON.stringify(list.slice(0, 12)));
};
const openSet = () => { const v = localStorage.getItem(LS.open); return v == null ? null : new Set(JSON.parse(v)); };
const saveOpenSet = (s) => localStorage.setItem(LS.open, JSON.stringify([...s]));

/* ============================ THEME / ACCENT / PAPER ============================ */
function currentTheme() { return localStorage.getItem(LS.theme) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
function currentAccent() { const a = localStorage.getItem(LS.accent); return ACCENTS.includes(a) ? a : "pink"; }
function currentPaper() { return localStorage.getItem(LS.paper) || "grid"; }
function applyTheme()  { root.dataset.theme = currentTheme(); }
function applyAccent() { root.dataset.accent = currentAccent(); }
function applyPaper()  { root.dataset.paper = currentPaper(); }
function toggleTheme() { localStorage.setItem(LS.theme, currentTheme() === "dark" ? "light" : "dark"); applyTheme(); refreshPaletteTools(); }
function setAccent(a)  { localStorage.setItem(LS.accent, a); applyAccent(); refreshPaletteTools(); }
function cyclePaper()  { const o = ["grid", "dots", "plain"]; localStorage.setItem(LS.paper, o[(o.indexOf(currentPaper()) + 1) % o.length]); applyPaper(); refreshPaletteTools(); }
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!localStorage.getItem(LS.theme)) applyTheme(); });

/* ============================ GITHUB DISCOVERY + RAW ============================ */
function detectSite() {
  const h = location.hostname, segs = location.pathname.split("/").filter(Boolean);
  if (h.endsWith("github.io")) {
    const owner = h.split(".")[0];
    const name = segs.length ? segs[0] : `${owner}.github.io`;
    return { owner, name, branch: CONFIG.repo.branch };
  }
  return { ...CONFIG.repo };
}
const rawURL = (site, path) => `https://raw.githubusercontent.com/${site.owner}/${site.name}/${site.branch}/${path.split("/").map(encodeURIComponent).join("/")}`;

async function loadTree(site) {
  const branches = [site.branch, site.branch === "main" ? "master" : "main"];
  const cacheKey = `paper:tree:${site.owner}/${site.name}`;
  try { const c = JSON.parse(sessionStorage.getItem(cacheKey) || "null"); if (c && Date.now() - c.t < 3e5) { site.branch = c.branch; return c.tree; } } catch {}
  for (const br of branches) {
    try {
      const r = await fetch(`https://api.github.com/repos/${site.owner}/${site.name}/git/trees/${br}?recursive=1`);
      if (r.status === 403) throw new Error("rate-limited");
      if (!r.ok) continue;
      const j = await r.json(); site.branch = br;
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), branch: br, tree: j.tree })); } catch {}
      return j.tree;
    } catch (e) { if (String(e.message).includes("rate")) throw e; }
  }
  throw new Error("not-found");
}
async function fetchText(site, repoPath) {
  try { const r = await fetch(rawURL(site, repoPath)); if (r.ok) return await r.text(); } catch {}
  try { const r = await fetch(repoPath, { cache: "no-cache" }); if (r.ok) return await r.text(); } catch {}
  throw new Error(`could not load ${repoPath}`);
}
async function getNote(site, repoPath) {
  if (NOTE_CACHE.has(repoPath)) return NOTE_CACHE.get(repoPath);
  const parsed = parseFrontmatter(await fetchText(site, repoPath));
  NOTE_CACHE.set(repoPath, parsed);
  return parsed;
}
function mediaResolver(site, noteRepoPath) {
  const dir = noteRepoPath.split("/").slice(0, -1);
  return (rel) => {
    const stack = [...dir];
    for (const seg of rel.replace(/^\.\//, "").split(/[\\/]/)) { if (seg === "..") stack.pop(); else if (seg && seg !== ".") stack.push(seg); }
    return rawURL(site, stack.join("/"));
  };
}

/* ============================ MODEL ============================ */
async function ensureModel() {
  if (TREE) return;
  try {
    const r = await fetch("PaperNotes/manifest.json", { cache: "no-cache" });
    if (r.ok) {
      const mf = await r.json();
      if (mf && mf.tree && mf.tree.noteCount) { TREE = mf.tree; INDEX = mf.index || buildIndexFromTree(mf.tree); indexTree(); return; }
    }
  } catch {}
  TREE = buildTreeFromBlobs(await loadTree(SITE));
  INDEX = buildIndexFromTree(TREE);
  indexTree();
}

/* live fallback: assemble a nested tree from a flat GitHub blob list */
function buildTreeFromBlobs(blobs) {
  const rootNode = folderNode("", "");
  for (const b of blobs) {
    if (b.type !== "blob") continue;
    const parts = b.path.split("/");
    if (CONFIG.ignoreTop.includes(parts[0]) || parts[0].startsWith(".")) continue;
    const file = parts[parts.length - 1];
    const isMd = /\.md$/i.test(file) && !file.startsWith("_");
    if (!isMd) continue;
    if (parts.length < 2) continue;            // no root-level notes
    let cur = rootNode, acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      let next = cur.children.find((c) => c.type === "folder" && c.name === parts[i]);
      if (!next) { next = folderNode(parts[i], acc); cur.children.push(next); }
      cur = next;
    }
    cur.children.push({ type: "note", name: file, path: b.path, title: prettify(file), emoji: "", blurb: "", order: null, minutes: 0, tags: [], headings: [], excerpt: "" });
  }
  (function count(n) { if (n.type !== "folder") return 1; n.noteCount = n.children.reduce((s, c) => s + count(c), 0); return n.noteCount; })(rootNode);
  (function sort(n) { if (n.type !== "folder") return; n.children.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })); n.children.forEach(sort); })(rootNode);
  return rootNode;
}
function folderNode(name, path) {
  return { type: "folder", name, path, title: name ? prettify(name) : "PaperNotes", emoji: "", blurb: "", tagline: "", code: "", accent: "", order: null, noteCount: 0, children: [] };
}
function crumbsFor(folderP) {
  if (!folderP) return [];
  const segs = folderP.split("/"); const out = []; let acc = "";
  for (const s of segs) { acc = acc ? `${acc}/${s}` : s; out.push({ name: NODES.get(acc)?.title || prettify(s), path: acc }); }
  return out;
}
function buildIndexFromTree(tree) {
  const index = { notes: [], folders: [] };
  (function walk(n) {
    if (n.type === "folder") { if (n.path) index.folders.push({ path: n.path, title: n.title, emoji: n.emoji, blurb: n.blurb, noteCount: n.noteCount, crumbs: [] }); n.children.forEach(walk); }
    else index.notes.push({ path: n.path, title: n.title, emoji: n.emoji, blurb: n.blurb, minutes: n.minutes, order: n.order, tags: n.tags || [], headings: n.headings || [], excerpt: n.excerpt || "", folderPath: parentPath(n.path), crumbs: [] });
  })(tree);
  return index;
}
function indexTree() {
  NODES = new Map(); ORDER = [];
  (function walk(node, parent) {
    node.parent = parent || null;
    if (node.path) NODES.set(node.path, node);
    if (node.type === "folder") node.children.forEach((c) => walk(c, node));
    else ORDER.push(node.path);
  })(TREE, null);
  // fill crumbs now that titles are resolvable
  if (INDEX) {
    for (const n of INDEX.notes) if (!n.crumbs?.length) n.crumbs = crumbsFor(n.folderPath);
    for (const f of INDEX.folders) if (!f.crumbs?.length) f.crumbs = crumbsFor(parentPath(f.path));
  }
}

/* progress helpers */
function notesUnder(node) { const out = []; (function w(n) { if (n.type === "note") out.push(n); else n.children.forEach(w); })(node); return out; }
function folderProgress(node) { const done = readSet(); const all = notesUnder(node); return { n: all.filter((x) => done.has(x.path)).length, total: all.length }; }
function overallProgress() { const done = readSet(); return { n: ORDER.filter((p) => done.has(p)).length, total: ORDER.length }; }

/* ============================ ROUTER ============================ */
function parseHash() {
  const segs = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (!segs.length) return { view: "home" };
  if (segs[0] === "note") return { view: "note", path: segs.slice(1).join("/") };
  if (segs[0] === "browse") return { view: "browse", path: segs.slice(1).join("/") };
  if (segs[0] === "m" && segs[1] && segs[2]) {                 // back-compat with v1 links
    const base = `${segs[1]}/${segs[2]}`;
    return segs[3] ? { view: "note", path: `${base}/${segs[3]}` } : { view: "browse", path: base };
  }
  return { view: "home" };
}
const goHome = () => { location.hash = "#/"; };
const goNote = (path) => { location.hash = `#/note/${encPath(path)}`; };
const goFolder = (path) => { location.hash = `#/browse/${encPath(path)}`; };

async function route() {
  const r = parseHash();
  if (r.view === "note" || r.view === "browse") { try { await ensureModel(); } catch {} }
  if (r.view === "note") {
    const node = NODES.get(r.path);
    if (node && node.type === "note") return void await renderReader(node);
    const par = NODES.get(parentPath(r.path));
    if (par && par.type === "folder") return renderBrowse(par);
    return renderHome();
  }
  if (r.view === "browse") {
    const node = NODES.get(r.path);
    if (node && node.type === "folder") return renderBrowse(node);
    return renderHome();
  }
  renderHome();
  window.scrollTo(0, 0);
}

/* ============================ BREADCRUMBS ============================ */
function crumbBar(folderP, extra) {
  const bar = el("nav", { class: "crumbs" });
  bar.append(el("button", { class: "crumb home", onclick: goHome }, "PaperNotes"));
  let acc = "";
  for (const seg of (folderP ? folderP.split("/") : [])) {
    acc = acc ? `${acc}/${seg}` : seg;
    const p = acc;
    bar.append(el("span", { class: "sep" }, "/"), el("button", { class: "crumb", onclick: () => goFolder(p) }, NODES.get(p)?.title || prettify(seg)));
  }
  if (extra) bar.append(el("span", { class: "sep" }, "/"), el("span", { class: "crumb cur" }, extra));
  return bar;
}

/* ============================ HOME ============================ */
async function renderHome() {
  const inner = el("div", { class: "home-inner" });
  app.replaceChildren(el("main", { class: "home" }, inner));
  attachBuddy();

  inner.append(
    el("div", { class: "home-head" },
      el("div", { class: "wordmark" }, "PaperNotes", el("span", { class: "dot" }, ".")),
      el("div", { class: "home-kicker" }, `notebook \u00b7 ${SITE.owner}`)),
    el("div", { class: "home-scrawl" }, `\u2014 ${dateScrawl()} \u00b7 property of a very tired student \u2014`),
  );

  const q = el("input", { type: "search", id: "home-q", class: "big-search-input", placeholder: "search every note, heading & folder\u2026",
    oninput: (e) => renderHomeBody(body, e.target.value.trim()) });
  inner.append(el("div", { class: "big-search" }, el("span", { class: "mag" }, "\u2315"), q,
    el("kbd", { class: "sk" }, "/")));

  const body = el("div", { class: "home-body" });
  inner.append(body);

  if (!TREE) { body.append(loadingLines()); try { await ensureModel(); } catch (e) { body.replaceChildren(treeError(e)); return; } }
  if (!TREE || !TREE.noteCount) { body.replaceChildren(emptyToc()); return; }
  renderHomeBody(body, "");
  requestAnimationFrame(() => { /* keep focus off search so / shortcut still works */ });
}

function renderHomeBody(body, query) {
  body.replaceChildren();
  if (query) { body.append(renderSearchResults(query)); return; }

  // Continue reading (recents)
  const rec = recents().map((p) => NODES.get(p)).filter((n) => n && n.type === "note");
  if (rec.length) {
    const strip = el("div", { class: "chip-row" });
    rec.slice(0, 6).forEach((n) => strip.append(el("button", { class: "chip", onclick: () => goNote(n.path) },
      el("span", { class: "chip-em" }, n.emoji || "\u25c7"), el("span", {}, n.title))));
    body.append(section("continue reading", strip));
  }
  // Bookmarks
  const marks = [...markSet()].map((p) => NODES.get(p)).filter((n) => n && n.type === "note");
  if (marks.length) {
    const strip = el("div", { class: "chip-row" });
    marks.slice(0, 8).forEach((n) => strip.append(el("button", { class: "chip star", onclick: () => goNote(n.path) },
      el("span", { class: "chip-em" }, "\u2605"), el("span", {}, n.title))));
    body.append(section("bookmarked", strip));
  }
  // Overall progress
  const op = overallProgress();
  if (op.total) {
    const bar = el("div", { class: "prog-wrap" }, el("div", { class: "prog-bar" }, el("span", { style: `width:${Math.round(op.n / op.total * 100)}%` })),
      el("span", { class: "prog-txt" }, `${op.n}/${op.total} pages read`));
    body.append(bar);
  }
  // The tree
  const tree = el("div", { class: "tree" });
  const open = seedOpenSet();
  TREE.children.forEach((child) => tree.append(treeNode(child, 0, open)));
  body.append(section("all notes", tree));
}
function section(label, node) {
  return el("section", { class: "home-sect" }, el("div", { class: "sect-label" }, label), node);
}
function seedOpenSet() {
  let s = openSet();
  if (s == null) { s = new Set(); (function w(n) { if (n.type === "folder") { if (n.path && n.path.split("/").length <= 2) s.add(n.path); n.children.forEach(w); } })(TREE); saveOpenSet(s); }
  return s;
}

/* recursive tree renderer */
function treeNode(node, depth, open) {
  if (node.type === "note") return treeNoteRow(node, depth);
  const isOpen = open.has(node.path);
  const p = folderProgress(node);
  const kids = el("div", { class: "tree-kids" });
  const row = el("button", { class: `tree-row folder${isOpen ? " open" : ""}`, style: `--d:${depth}`, onclick: () => {
      const s = openSet() || new Set(); s.has(node.path) ? s.delete(node.path) : s.add(node.path); saveOpenSet(s);
      row.classList.toggle("open"); kids.classList.toggle("shown");
    } },
    el("span", { class: "tw" }, "\u203a"),
    el("span", { class: "t-em" }, node.emoji || "\u25c8"),
    el("span", { class: "t-name" }, node.title),
    el("span", { class: "t-meta" }, p.n ? `${p.n}/${p.total}` : `${p.total}`),
    el("span", { class: "t-go", title: "open folder", onclick: (e) => { e.stopPropagation(); goFolder(node.path); } }, "\u2197"),
  );
  if (isOpen) kids.classList.add("shown");
  node.children.forEach((c) => kids.append(treeNode(c, depth + 1, open)));
  const wrap = el("div", { class: "tree-branch" }, row, kids);
  if (node.blurb && depth === 0) wrap.insertBefore(el("div", { class: "tree-blurb", style: `--d:${depth}` }, node.blurb), kids);
  return wrap;
}
function treeNoteRow(node, depth) {
  const done = readSet().has(node.path), marked = markSet().has(node.path);
  return el("div", { class: `tree-row note${done ? " read" : ""}`, style: `--d:${depth}` },
    el("button", { class: "t-open", onclick: () => goNote(node.path) },
      el("span", { class: "t-check" }, done ? "\u2713" : "\u25cb"),
      el("span", { class: "t-em" }, node.emoji || ""),
      el("span", { class: "t-name" }, node.title),
      node.minutes ? el("span", { class: "t-min" }, `${node.minutes}m`) : null),
    el("button", { class: `t-star${marked ? " on" : ""}`, title: "bookmark", onclick: () => { toggleMark(node.path); renderHome(); } }, marked ? "\u2605" : "\u2606"),
  );
}

function loadingLines() {
  const w = el("div", { class: "skeleton-lines" });
  for (let i = 0; i < 4; i++) w.append(el("div", { class: "bar", style: `width:${55 + Math.random() * 35}%` }));
  w.append(el("div", { class: "loading-note" }, "flipping through the pages\u2026"));
  return w;
}
function emptyToc() {
  return el("div", { class: "state" }, el("div", { class: "line" }, "this notebook is blank."),
    el("p", {}, "drop a folder with some .md files in it (nested however you like), run tools/generate-manifest.mjs, push, and it shows up here."));
}
function treeError(e) {
  const rate = String(e.message).includes("rate");
  return el("div", { class: "state" }, el("span", { class: "face" }, "(._.)"),
    el("div", { class: "line" }, "hmm, can\u2019t find the pages."),
    el("p", {}, rate
      ? "GitHub\u2019s API is rate-limiting this IP for a bit (60/hr unauthenticated). Give it a few minutes and refresh \u2014 or ship a manifest.json so it never needs the API."
      : "Couldn\u2019t read the repo. Check it\u2019s public and the owner/name in PaperNotes/js/app.js is right."),
    el("button", { class: "btn-accent", onclick: () => { TREE = null; renderHome(); } }, "try again"));
}

/* ============================ BROWSE (folder page) ============================ */
function renderBrowse(node) {
  const inner = el("div", { class: "browse-inner" });
  app.replaceChildren(el("main", { class: "browse" }, inner));
  attachBuddy();

  const p = folderProgress(node);
  inner.append(
    crumbBar(parentPath(node.path)),
    el("header", { class: "browse-head" },
      node.emoji ? el("div", { class: "browse-em" }, node.emoji) : null,
      el("h1", {}, node.title),
      node.tagline ? el("div", { class: "browse-tag" }, node.tagline) : null,
      node.blurb ? el("p", { class: "browse-blurb" }, node.blurb) : null,
      el("div", { class: "prog-wrap" }, el("div", { class: "prog-bar" }, el("span", { style: `width:${p.total ? Math.round(p.n / p.total * 100) : 0}%` })),
        el("span", { class: "prog-txt" }, `${p.n}/${p.total} read`)),
    ),
  );

  const folders = node.children.filter((c) => c.type === "folder");
  const notes = node.children.filter((c) => c.type === "note");

  if (folders.length) {
    const grid = el("div", { class: "card-grid folders" });
    folders.forEach((f) => {
      const fp = folderProgress(f);
      grid.append(el("button", { class: "folder-card", onclick: () => goFolder(f.path) },
        el("div", { class: "fc-top" }, el("span", { class: "fc-em" }, f.emoji || "\u25c8"), el("span", { class: "fc-count" }, `${f.noteCount} notes`)),
        el("div", { class: "fc-title" }, f.title),
        f.blurb ? el("div", { class: "fc-blurb" }, f.blurb) : null,
        el("div", { class: "fc-prog" }, el("span", { style: `width:${fp.total ? Math.round(fp.n / fp.total * 100) : 0}%` }))));
    });
    inner.append(section("folders", grid));
  }
  if (notes.length) {
    const list = el("div", { class: "note-list" });
    const done = readSet(), marks = markSet();
    notes.forEach((n, i) => {
      list.append(el("div", { class: `note-card${done.has(n.path) ? " read" : ""}` },
        el("button", { class: "nc-main", onclick: () => goNote(n.path) },
          el("span", { class: "nc-num" }, pad2(i)),
          el("div", { class: "nc-body" },
            el("div", { class: "nc-title" }, n.emoji ? el("span", { class: "nc-em" }, n.emoji) : null, n.title),
            n.blurb ? el("div", { class: "nc-blurb" }, n.blurb) : null),
          el("span", { class: "nc-min" }, n.minutes ? `${n.minutes}m` : ""),
          el("span", { class: "nc-check" }, done.has(n.path) ? "\u2713" : "")),
        el("button", { class: `t-star${marks.has(n.path) ? " on" : ""}`, title: "bookmark", onclick: () => { toggleMark(n.path); renderBrowse(node); } }, marks.has(n.path) ? "\u2605" : "\u2606")));
    });
    inner.append(section(folders.length ? "notes" : `${notes.length} notes`, list));
  }
  window.scrollTo(0, 0);
}

/* ============================ SEARCH ============================ */
function searchAll(query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length || !INDEX) return { notes: [], folders: [] };
  const scoreFields = (fields) => {
    let total = 0;
    for (const t of tokens) {
      let best = 0;
      for (const [text, w] of fields) { if (!text) continue; const idx = text.indexOf(t); if (idx === -1) continue; best = Math.max(best, w + (idx === 0 ? 2 : 0)); }
      if (best === 0) return -1;   // every token must hit something
      total += best;
    }
    return total;
  };
  const noteResults = [];
  for (const n of INDEX.notes) {
    const s = scoreFields([
      [n.title.toLowerCase(), 10],
      [(n.headings || []).join(" \u00b7 ").toLowerCase(), 6],
      [(n.tags || []).join(" ").toLowerCase(), 5],
      [n.blurb.toLowerCase(), 4],
      [(n.excerpt || "").toLowerCase(), 3],
      [(n.crumbs || []).map((c) => c.name).join(" ").toLowerCase(), 2],
      [n.path.toLowerCase(), 1],
    ]);
    if (s > 0) noteResults.push({ node: n, score: s });
  }
  const folderResults = [];
  for (const f of INDEX.folders) {
    const s = scoreFields([[f.title.toLowerCase(), 8], [f.blurb.toLowerCase(), 3], [(f.crumbs || []).map((c) => c.name).join(" ").toLowerCase(), 2], [f.path.toLowerCase(), 1]]);
    if (s > 0) folderResults.push({ node: f, score: s });
  }
  noteResults.sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title));
  folderResults.sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title));
  return { notes: noteResults, folders: folderResults, tokens };
}
function highlight(text, tokens) {
  if (!tokens || !tokens.length) return text;
  const frag = document.createDocumentFragment();
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    frag.append(el("mark", {}, m[0])); last = m.index + m[0].length;
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
function crumbLine(crumbs) {
  return (crumbs || []).map((c) => c.name).join(" / ");
}
function renderSearchResults(query) {
  const { notes, folders, tokens } = searchAll(query);
  const wrap = el("div", { class: "search-results" });
  if (!notes.length && !folders.length) {
    return el("div", { class: "state" }, el("span", { class: "face" }, "(・_・?)"), el("div", { class: "line" }, "nothing matches that."), el("p", {}, `no notes, headings or folders for \u201c${query}\u201d. try fewer or different words.`));
  }
  wrap.append(el("div", { class: "sr-count" }, `${notes.length} note${notes.length === 1 ? "" : "s"}${folders.length ? ` \u00b7 ${folders.length} folder${folders.length === 1 ? "" : "s"}` : ""}`));
  folders.slice(0, 6).forEach(({ node }) => {
    wrap.append(el("button", { class: "sr-item folder", onclick: () => goFolder(node.path) },
      el("span", { class: "sr-em" }, node.emoji || "\u25c8"),
      el("div", { class: "sr-body" }, el("div", { class: "sr-title" }, highlight(node.title, tokens), el("span", { class: "sr-tag" }, "folder")),
        el("div", { class: "sr-crumb" }, crumbLine(node.crumbs) || "\u2014"))));
  });
  notes.slice(0, 40).forEach(({ node }) => {
    const hitHeading = (node.headings || []).find((h) => tokens.some((t) => h.toLowerCase().includes(t)) && !node.title.toLowerCase().includes(tokens.find((t) => h.toLowerCase().includes(t))));
    wrap.append(el("button", { class: "sr-item", onclick: () => goNote(node.path) },
      el("span", { class: "sr-em" }, node.emoji || "\u25c7"),
      el("div", { class: "sr-body" },
        el("div", { class: "sr-title" }, highlight(node.title, tokens), node.minutes ? el("span", { class: "sr-min" }, `${node.minutes}m`) : null),
        el("div", { class: "sr-crumb" }, crumbLine(node.crumbs)),
        hitHeading ? el("div", { class: "sr-snip" }, "\u2937 ", highlight(hitHeading, tokens)) : (node.blurb ? el("div", { class: "sr-snip" }, node.blurb) : null))));
  });
  return wrap;
}

/* ============================ READER ============================ */
async function renderReader(note) {
  const folder = note.parent || NODES.get(parentPath(note.path));
  const siblings = folder ? folder.children.filter((c) => c.type === "note") : [note];
  const idx = siblings.indexOf(note);
  pushRecent(note.path);

  const tocList = el("ul", { class: "toc-list" });
  const outline = el("nav", { class: "outline", id: "note-outline" });
  const sidebar = el("aside", { class: "sidebar" },
    el("button", { class: "back", onclick: () => folder ? goFolder(folder.path) : goHome() }, `\u2190 ${folder ? folder.title : "contents"}`),
    el("h2", {}, folder ? folder.title : "Notes"),
    el("div", { class: "code" }, (folder && folder.tagline) || crumbLine(crumbsFor(parentPath(note.path)))),
    el("div", { class: "search" }, el("input", { type: "search", id: "note-search", placeholder: "filter these notes\u2026  (/)",
      oninput: (e) => { const q = e.target.value.toLowerCase().trim(); tocList.querySelectorAll(".toc-item").forEach((li) => li.classList.toggle("hidden-search", q && !li.dataset.title.includes(q))); } })),
    tocList,
    el("div", { class: "outline-wrap" }, el("div", { class: "outline-label" }, "on this page"), outline),
  );
  const reading = el("div", { class: "reading" }, skeleton());
  app.replaceChildren(
    el("div", { class: "progress-line" }, el("span", { id: "scroll-prog" })),
    el("div", { class: "reader" }, sidebar, el("div", { class: "content-col" }, reading)),
  );
  attachBuddy(); wireScrollProgress();

  const done = readSet(), marks = markSet();
  siblings.forEach((nt, i) => {
    tocList.append(el("li", { class: `toc-item${done.has(nt.path) ? " read" : ""}${nt === note ? " active" : ""}`,
      "data-title": `${nt.title} ${nt.blurb || ""}`.toLowerCase(),
      onclick: () => goNote(nt.path) },
      el("span", { class: "num" }, pad2(i)), el("span", { class: "t" }, nt.title), el("span", { class: "check" }, "\u2713")));
  });

  await showNote(note, folder, siblings, idx, reading, outline);
}

async function showNote(note, folder, siblings, idx, reading, outline) {
  reading.replaceChildren(skeleton());
  let parsed;
  try { parsed = await getNote(SITE, note.path); }
  catch (e) { reading.replaceChildren(noteError(e, note, folder, siblings, idx, reading, outline)); return; }

  const article = el("article", { class: "md", html: renderMarkdown(parsed.body) });
  const heads = enhance(article);
  enhanceMedia(article, mediaResolver(SITE, note.path));

  const marked = markSet().has(note.path);
  const isRead = readSet().has(note.path);
  const readBtn = el("button", { class: `read-toggle${isRead ? " done" : ""}`, onclick: () => toggleRead(note, folder, readBtn) },
    el("span", { class: "mark" }, isRead ? "\u2713" : "\u25cb"), el("span", { class: "label" }, isRead ? "marked as read" : "mark as read"));
  const starBtn = el("button", { class: `action-btn star${marked ? " on" : ""}`, onclick: () => { toggleMark(note.path); starBtn.classList.toggle("on"); starBtn.querySelector(".s").textContent = markSet().has(note.path) ? "\u2605 bookmarked" : "\u2606 bookmark"; } }, el("span", { class: "s" }, marked ? "\u2605 bookmarked" : "\u2606 bookmark"));
  const linkBtn = el("button", { class: "action-btn", onclick: () => {
      navigator.clipboard?.writeText(location.href).then(() => {
        linkBtn.querySelector(".s").textContent = "link copied \u2713";
        setTimeout(() => { linkBtn.querySelector(".s").textContent = "\u{1f517} copy link"; }, 1400);
      });
    } }, el("span", { class: "s" }, "\u{1f517} copy link"));

  reading.replaceChildren(
    crumbBar(parentPath(note.path), note.title),
    el("div", { class: "note-header" },
      parsed.data.emoji ? el("span", { class: "emoji" }, parsed.data.emoji) : (note.emoji ? el("span", { class: "emoji" }, note.emoji) : null),
      el("span", { class: "kicker" }, `${folder ? folder.title : ""} \u00b7 page ${pad2(idx)}${note.minutes ? ` \u00b7 ${note.minutes} min` : ""}`)),
    article,
    el("div", { class: "action-row" }, readBtn, starBtn, linkBtn),
    noteNav(folder, siblings[idx - 1], siblings[idx + 1]),
    doodleCanvas(note.path, reading),
  );

  buildOutline(outline, heads, article);
  wireScrollProgress();
  wireScrollSpy(heads, outline);
  if (root.dataset.doodle === "on") buildDoodleToolbar();
  window.scrollTo(0, 0);
}

function buildOutline(outline, heads, article) {
  outline.replaceChildren();
  const usable = heads.filter((h) => h.level <= 3);
  if (usable.length < 2) { outline.parentElement.style.display = "none"; return; }
  outline.parentElement.style.display = "";
  usable.forEach((h) => {
    outline.append(el("button", { class: `ol-item lvl${h.level}`, "data-id": h.id, onclick: () => {
      const t = document.getElementById(h.id); if (t) { const y = t.getBoundingClientRect().top + scrollY - 70; scrollTo({ top: y, behavior: "smooth" }); } } }, h.text));
  });
}
function wireScrollSpy(heads, outline) {
  const ids = heads.filter((h) => h.level <= 3).map((h) => h.id);
  const onScroll = () => {
    let cur = ids[0];
    for (const id of ids) { const eln = document.getElementById(id); if (eln && eln.getBoundingClientRect().top <= 96) cur = id; else break; }
    outline.querySelectorAll(".ol-item").forEach((b) => b.classList.toggle("active", b.dataset.id === cur));
  };
  window.removeEventListener("scroll", window.__pp_spy || (() => {}));
  window.__pp_spy = onScroll; window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
}

function skeleton() { const s = el("div", { class: "skeleton-lines" }); ["82%","74%","88%","70%","80%"].forEach((w) => s.append(el("div", { class: "bar", style: `width:${w}` }))); return s; }
function noteError(e, note, folder, siblings, idx, reading, outline) {
  return el("div", { class: "state" }, el("span", { class: "face" }, ">_<"),
    el("div", { class: "line" }, "couldn\u2019t load this page."),
    el("p", {}, `${e.message}. Content is pulled raw from the GitHub repo \u2014 make sure it\u2019s public and pushed.`),
    el("button", { class: "btn-accent", onclick: () => showNote(note, folder, siblings, idx, reading, outline) }, "try again"));
}
function noteNav(folder, prev, next) {
  const nav = el("nav", { class: "note-nav" });
  if (prev) nav.append(el("button", { class: "prev", onclick: () => goNote(prev.path) }, el("div", { class: "dir" }, "\u2190 previous"), el("div", { class: "ttl" }, prev.title)));
  if (next) nav.append(el("button", { class: "next", onclick: () => goNote(next.path) }, el("div", { class: "dir" }, "next \u2192"), el("div", { class: "ttl" }, next.title)));
  return nav;
}
function toggleRead(note, folder, btn) {
  const set = readSet(), now = !set.has(note.path);
  now ? set.add(note.path) : set.delete(note.path); saveReadSet(set);
  btn.classList.toggle("done", now);
  btn.querySelector(".mark").textContent = now ? "\u2713" : "\u25cb";
  btn.querySelector(".label").textContent = now ? "marked as read" : "mark as read";
  const li = [...document.querySelectorAll(".toc-item")].find((c) => c.querySelector(".t")?.textContent === note.title);
  li?.classList.toggle("read", now);
  if (now && folder) { const p = folderProgress(folder); buddySay(p.n === p.total ? "the whole folder. you absolute unit >:3" : pick(READ_LINES)); }
}
function toggleMark(path) { const s = markSet(); s.has(path) ? s.delete(path) : s.add(path); saveMarkSet(s); }

/* ============================ SCROLL PROGRESS ============================ */
function wireScrollProgress() {
  const bar = $("#scroll-prog");
  const onScroll = () => { const max = root.scrollHeight - innerHeight; if (bar) bar.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`; };
  window.removeEventListener("scroll", window.__pp_scroll || (() => {}));
  window.__pp_scroll = onScroll; window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
}

/* ============================ SCRIBBLE ============================ */
let doodle = { drawing: false, color: null, key: null, canvas: null, ctx: null };
function doodleCanvas(key, reading) {
  const canvas = el("canvas", { class: "doodle-canvas" });
  doodle.key = key; doodle.canvas = canvas;
  requestAnimationFrame(() => setupDoodle(canvas, reading, key));
  return canvas;
}
function setupDoodle(canvas, reading, key) {
  const saved = localStorage.getItem(LS.doodle(key));
  canvas.width = reading.scrollWidth; canvas.height = Math.max(reading.scrollHeight - 56, 0);
  const ctx = canvas.getContext("2d"); if (!ctx) return; doodle.ctx = ctx; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (saved) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = saved; }
  if (!doodle.color) doodle.color = getComputedStyle(root).getPropertyValue("--accent").trim();
  if (canvas.__bound) return; canvas.__bound = true;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
  const start = (e) => { if (root.dataset.doodle !== "on") return; doodle.drawing = true; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault(); };
  const move = (e) => { if (!doodle.drawing) return; const { x, y } = pos(e); const er = doodle.color === "ERASE"; ctx.strokeStyle = er ? "#000" : doodle.color; ctx.lineWidth = er ? 20 : 2.6; ctx.globalCompositeOperation = er ? "destination-out" : "source-over"; ctx.lineTo(x, y); ctx.stroke(); e.preventDefault(); };
  const end = () => { if (!doodle.drawing) return; doodle.drawing = false; try { localStorage.setItem(LS.doodle(key), canvas.toDataURL()); } catch {} };
  canvas.addEventListener("pointerdown", start); canvas.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
}
function buildDoodleToolbar() {
  if ($("#doodle-toolbar")) return;
  const bar = el("div", { class: "doodle-toolbar", id: "doodle-toolbar" }, el("span", { class: "hintx" }, "pencil \u270e"));
  const graphite = getComputedStyle(root).getPropertyValue("--ink").trim();
  const leads = [["graphite", graphite], ["pink", LEAD_COLORS.pink], ["purple", LEAD_COLORS.purple], ["blue", LEAD_COLORS.blue]];
  doodle.color = doodle.color || getComputedStyle(root).getPropertyValue("--accent").trim();
  leads.forEach(([label, c]) => {
    const s = el("span", { class: "swatch", title: label, style: `background:${c}`, onclick: () => { doodle.color = c; bar.querySelectorAll(".swatch,.ghost").forEach((x) => x.classList.remove("sel", "on")); s.classList.add("sel"); } });
    bar.append(s);
  });
  const eraser = el("button", { class: "ghost", onclick: () => { doodle.color = "ERASE"; bar.querySelectorAll(".swatch").forEach((x) => x.classList.remove("sel")); eraser.classList.add("on"); } }, "erase");
  bar.append(eraser, el("button", { class: "ghost", onclick: clearDoodle }, "clear"), el("button", { class: "done", onclick: () => setDoodle(false) }, "done"));
  document.body.append(bar);
}
function clearDoodle() { if (doodle.ctx && doodle.canvas) { doodle.ctx.clearRect(0, 0, doodle.canvas.width, doodle.canvas.height); if (doodle.key) localStorage.removeItem(LS.doodle(doodle.key)); } }
function setDoodle(on) {
  root.dataset.doodle = on ? "on" : "off";
  if (on) { if (doodle.canvas) { setupDoodle(doodle.canvas, doodle.canvas.parentElement, doodle.key); buildDoodleToolbar(); } else buddySay("open a page first, then scribble \u270e"); }
  else { $("#doodle-toolbar")?.remove(); }
  refreshPaletteTools();
}
function toggleDoodle() { setDoodle(root.dataset.doodle !== "on"); }

/* ============================ STUDY GREMLIN  :3 -> >:3 ============================ */
const QUOTES = [
  "read it. now read it again. now a THIRD time >:3",
  "sleep is just death being clingy. one more page.",
  "the mitochondria is the powerhouse of the cell and so are you, allegedly.",
  "cram now, dissociate later. balance.",
  "flashcards are just little spells you cast on your own brain.",
  "the exam is scared of YOU actually.",
  "caffeine, spite, and one functioning brain cell. we ball.",
  "if you don\u2019t understand it, understand it HARDER >:3",
  "close the other tab. i saw that. i SAW it.",
  "search bar is right there. use your powers.",
  "you\u2019re not behind. everyone else is just faking it >:3",
  "memorize it out of pure pettiness. that works too.",
];
const READ_LINES = ["one down. brain +1 >:3", "logged it. it\u2019s legally yours now.", "another page the graders can\u2019t touch.", "nice. keep flipping.", "that\u2019s the good stuff. more."];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
let buddyT = null;
function attachBuddy() {
  if ($("#buddy-dock")) return;
  const bubble = el("div", { class: "buddy-bubble", id: "buddy-bubble" });
  const buddy = el("div", { class: "buddy", id: "buddy", title: "click for unsolicited study wisdom", onclick: pokeBuddy }, ":3");
  document.body.append(el("div", { class: "buddy-dock", id: "buddy-dock" }, bubble, buddy));
}
function buddySay(text) {
  const buddy = $("#buddy"), bubble = $("#buddy-bubble"); if (!buddy || !bubble) return;
  clearTimeout(buddyT);
  buddy.textContent = ">:3"; buddy.classList.add("hyped");
  bubble.textContent = text; bubble.classList.add("show");
  buddyT = setTimeout(() => { bubble.classList.remove("show"); buddy.textContent = ":3"; buddy.classList.remove("hyped"); }, 4200);
}
function pokeBuddy() {
  const bubble = $("#buddy-bubble"), buddy = $("#buddy");
  if (bubble?.classList.contains("show")) { clearTimeout(buddyT); bubble.classList.remove("show"); buddy.textContent = ":3"; buddy.classList.remove("hyped"); }
  else buddySay(pick(QUOTES));
}

/* ============================ COMMAND PALETTE (search + tools) ============================ */
let paletteEl = null, palResults = [], palActive = -1;
function openPalette() {
  if (paletteEl) return;
  const scrim = el("div", { class: "palette-scrim", onclick: (e) => { if (e.target === scrim) closePalette(); } });
  const input = el("input", { type: "search", placeholder: "search notes, headings, folders\u2026", oninput: (e) => renderPaletteBody(body, e.target.value.trim()) });
  const body = el("div", { class: "palette-body" });
  const tools = el("div", { class: "palette-tools", id: "palette-tools" });
  const pal = el("div", { class: "palette" }, el("div", { class: "palette-search" }, el("span", { class: "pmag" }, "\u2315"), input), body, tools);
  scrim.append(pal); document.body.append(scrim); paletteEl = scrim;
  ensureModel().then(() => renderPaletteBody(body, ""));
  renderPaletteTools(tools);
  requestAnimationFrame(() => input.focus());
}
function closePalette() { paletteEl?.remove(); paletteEl = null; palResults = []; palActive = -1; }
function renderPaletteBody(body, q) {
  body.replaceChildren();
  palActive = -1; palResults = [];
  if (!TREE) return;
  if (!q) {
    const rec = recents().map((p) => NODES.get(p)).filter((n) => n && n.type === "note");
    if (rec.length) body.append(el("div", { class: "palette-label" }, "recent"));
    rec.slice(0, 6).forEach((n) => body.append(palRow(n, "note")));
    body.append(el("div", { class: "palette-label" }, "top-level"));
    TREE.children.forEach((c) => body.append(palRow(c, c.type)));
    palResults = [...rec, ...TREE.children];
    return;
  }
  const { notes, folders, tokens } = searchAll(q);
  const combined = [...folders.map((r) => ({ ...r.node, _kind: "folder" })), ...notes.map((r) => ({ ...r.node, _kind: "note" }))];
  if (!combined.length) { body.append(el("div", { class: "palette-empty" }, `no matches for \u201c${q}\u201d`)); return; }
  combined.slice(0, 40).forEach((n) => body.append(palRow(n, n._kind, tokens)));
  palResults = combined.slice(0, 40);
  palActive = 0; highlightPalActive(body);
}
function palRow(n, kind, tokens) {
  const isFolder = kind === "folder";
  return el("button", { class: `pal-row ${isFolder ? "folder" : "note"}`, onclick: () => { closePalette(); isFolder ? goFolder(n.path) : goNote(n.path); } },
    el("span", { class: "pr-em" }, n.emoji || (isFolder ? "\u25c8" : "\u25c7")),
    el("div", { class: "pr-body" },
      el("div", { class: "pr-title" }, tokens ? highlight(n.title, tokens) : n.title, isFolder ? el("span", { class: "pr-tag" }, "folder") : null),
      el("div", { class: "pr-crumb" }, crumbLine(n.crumbs || crumbsFor(parentPath(n.path))))));
}
function highlightPalActive(body) {
  const rows = [...body.querySelectorAll(".pal-row")];
  rows.forEach((r, i) => r.classList.toggle("active", i === palActive));
  rows[palActive]?.scrollIntoView({ block: "nearest" });
}
function palMove(d) {
  if (!paletteEl || !palResults.length) return;
  const body = paletteEl.querySelector(".palette-body");
  palActive = (palActive + d + palResults.length) % palResults.length;
  highlightPalActive(body);
}
function palEnter() {
  const n = palResults[palActive]; if (!n) return;
  closePalette();
  (n._kind === "folder" || n.type === "folder") ? goFolder(n.path) : goNote(n.path);
}
function renderPaletteTools(tools) {
  tools.replaceChildren();
  const leads = el("div", { class: "leads" }, el("span", { class: "lbl" }, "lead"));
  ACCENTS.forEach((a) => {
    const L = currentTheme() === "dark" ? 0.75 : 0.585;
    const hc = { pink: [0.13, 352], purple: [0.13, 305], blue: [0.12, 255], graphite: [0.012, 70] }[a];
    leads.append(el("span", { class: `lead-swatch${currentAccent() === a ? " sel" : ""}`, title: a, style: `background:oklch(${L} ${hc[0]} ${hc[1]})`, onclick: () => setAccent(a) }));
  });
  const theme = el("button", { class: "tool-btn", onclick: toggleTheme }, currentTheme() === "dark" ? "\u2600 light" : "\u263e dark");
  const paper = el("button", { class: "tool-btn", onclick: cyclePaper }, `${currentPaper() === "grid" ? "\u25a6" : currentPaper() === "dots" ? "\u22ef" : "\u25a1"} ${currentPaper()}`);
  const scribble = el("button", { class: `tool-btn${root.dataset.doodle === "on" ? " on" : ""}`, onclick: () => { toggleDoodle(); } }, `\u270e ${root.dataset.doodle === "on" ? "drawing" : "scribble"}`);
  tools.append(leads, el("div", { class: "spacer" }), theme, paper, scribble);
}
function refreshPaletteTools() { const t = $("#palette-tools"); if (t) renderPaletteTools(t); }

/* ============================ KEYBOARD ============================ */
addEventListener("keydown", (e) => {
  const typing = e.target.matches && e.target.matches("input, textarea");
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "k" || e.key.toLowerCase() === "s")) { e.preventDefault(); paletteEl ? closePalette() : openPalette(); return; }
  if (paletteEl) {
    if (e.key === "ArrowDown") { e.preventDefault(); palMove(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); palMove(-1); return; }
    if (e.key === "Enter") { e.preventDefault(); palEnter(); return; }
    if (e.key === "Escape") { closePalette(); return; }
  }
  if (e.key === "Escape") { if (root.dataset.doodle === "on") setDoodle(false); else if (typing) e.target.blur(); return; }
  if (typing) return;
  if (e.key === "/") { const s = $("#note-search") || $("#home-q"); if (s) { e.preventDefault(); s.focus(); } else { e.preventDefault(); openPalette(); } }
  else if (e.key === "ArrowLeft") $(".note-nav .prev")?.click();
  else if (e.key === "ArrowRight") $(".note-nav .next")?.click();
});

/* ============================ HINT + BOOT ============================ */
function attachHint() {
  if ($("#pn-hint")) return;
  document.body.append(el("div", { class: "hint", id: "pn-hint", onclick: openPalette },
    el("kbd", {}, `${MODKEY} K`), el("span", {}, "search & tools")));
}
async function boot() {
  SITE = detectSite();
  applyTheme(); applyAccent(); applyPaper();
  root.dataset.doodle = "off";
  attachHint();
  addEventListener("hashchange", route);
  await route();
}
boot();
window.PaperNotes = { toggleTheme, setAccent, cyclePaper, toggleDoodle, openPalette, goHome, goNote, goFolder, get site() { return SITE; }, get tree() { return TREE; }, get index() { return INDEX; } };
