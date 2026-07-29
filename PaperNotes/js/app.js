/* app.js — PaperNotes
 * A browser notebook. Structure is discovered live from the GitHub repo
 * (person / module / notes); note content is pulled RAW from the repo so it
 * loads no matter what GitHub Pages' Jekyll does to .md files.
 *
 * Repo layout it expects:
 *   index.html                     <- entry (root)
 *   PaperNotes/…                   <- this engine (css + js)
 *   <Person>/<Module>/*.md         <- notes (any top folder that isn't the engine)
 *   <Person>/<Module>/_meta.json   <- optional module metadata
 *   PaperNotes/manifest.json       <- optional prebuilt index (no API call)
 */
import { parseFrontmatter, renderMarkdown, enhance, enhanceMedia } from "./markdown.js";

/* ============================ CONFIG ============================ */
const CONFIG = {
  repo: { owner: "MilkmanAbi", name: "PaperNotes", branch: "main" },
  ignoreTop: ["PaperNotes", ".github", "assets", "node_modules", "tools", "docs", "build"],
};
const LS = {
  theme: "paper:theme", accent: "paper:accent", paper: "paper:paper",
  read: "paper:read", doodle: (k) => `paper:doodle:${k}`,
};
const ACCENTS = ["pink", "purple", "blue", "graphite"];
const LEAD_COLORS = {
  graphite: null, // resolved live from --ink at draw time
  pink:   "oklch(0.62 0.14 352)",
  purple: "oklch(0.6 0.14 305)",
  blue:   "oklch(0.6 0.13 255)",
};

let SITE = null, MODEL = null;
const NOTE_CACHE = new Map();
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
const readSet = () => new Set(JSON.parse(localStorage.getItem(LS.read) || "[]"));
const saveReadSet = (s) => localStorage.setItem(LS.read, JSON.stringify([...s]));
const prettify = (s) => s.replace(/\.md$/i, "").replace(/^\d+[-_.]/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const pad2 = (n) => String(n).padStart(2, "0");
const dateScrawl = () => new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }).toLowerCase();

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

async function ensureModel() {
  if (MODEL) return;
  try {
    const r = await fetch("PaperNotes/manifest.json", { cache: "no-cache" });
    if (r.ok) { MODEL = modelFromManifest(await r.json()); if (MODEL.length) return; }
  } catch {}
  MODEL = buildModel(await loadTree(SITE));
}
function modelFromManifest(mf) {
  return (mf.people || []).map((p) => ({
    user: p.user,
    modules: (p.modules || []).map((m) => ({
      id: m.id, user: p.user, folder: m.folder, path: m.path,
      meta: { title: m.title, code: m.code, emoji: m.emoji, blurb: m.blurb, tagline: m.tagline, accent: m.accent },
      notes: (m.notes || []).map((n) => ({ file: n.file, path: n.path, title: n.title, emoji: n.emoji, blurb: n.blurb, order: n.order })),
    })),
  }));
}
function buildModel(tree) {
  const users = new Map();
  for (const e of tree) {
    if (e.type !== "blob") continue;
    const parts = e.path.split("/");
    if (parts.length < 3) continue;
    const [user, module] = parts;
    if (CONFIG.ignoreTop.includes(user) || user.startsWith(".")) continue;
    const file = parts.slice(2).join("/");
    const isMd = /\.md$/i.test(file), isMeta = parts[2] === "_meta.json" && parts.length === 3;
    if (!isMd && !isMeta) continue;
    if (!users.has(user)) users.set(user, new Map());
    const mods = users.get(user);
    if (!mods.has(module)) mods.set(module, { id: `${user}/${module}`, user, folder: module, path: `${user}/${module}`, meta: null, hasMeta: false, notes: [] });
    const m = mods.get(module);
    if (isMeta) m.hasMeta = true;
    else if (isMd && !file.startsWith("_")) m.notes.push({ file, path: e.path });
  }
  const model = [];
  for (const [user, mods] of users) {
    const modules = [...mods.values()].filter((m) => m.notes.length);
    modules.forEach((m) => m.notes.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true })));
    modules.sort((a, b) => a.folder.localeCompare(b.folder));
    if (modules.length) model.push({ user, modules });
  }
  model.sort((a, b) => a.user.localeCompare(b.user));
  return model;
}
async function fetchText(site, repoPath) {
  try { const r = await fetch(rawURL(site, repoPath)); if (r.ok) return await r.text(); } catch {}
  try { const r = await fetch(repoPath, { cache: "no-cache" }); if (r.ok) return await r.text(); } catch {}
  throw new Error(`could not load ${repoPath}`);
}
async function loadMeta(site, m) {
  const base = { title: prettify(m.folder), code: "", emoji: "", blurb: "", accent: "ink", tagline: "" };
  if (!m.hasMeta) return base;
  try { return { ...base, ...JSON.parse(await fetchText(site, `${m.path}/_meta.json`)) }; } catch { return base; }
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
    for (const seg of rel.replace(/^\.\//, "").split("/")) { if (seg === "..") stack.pop(); else if (seg && seg !== ".") stack.push(seg); }
    return rawURL(site, stack.join("/"));
  };
}

/* ============================ ROUTER ============================ */
function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "m" && parts[1] && parts[2]) return { view: "reader", user: parts[1], module: parts[2], file: parts[3] || null };
  return { view: "home" };
}
function findModule(user, folder) {
  const u = MODEL?.find((x) => x.user === user); return u?.modules.find((m) => m.folder === folder) || null;
}
async function route() {
  const r = parseHash();
  if (r.view === "reader") {
    try { await ensureModel(); } catch {}
    const mod = findModule(r.user, r.module);
    if (!mod) return renderHome();
    await renderReader(mod, r.file);
  } else renderHome();
  window.scrollTo(0, 0);
}

/* ============================ HOME ============================ */
function moduleProgress(mod) {
  const done = readSet();
  const n = mod.notes.filter((x) => done.has(`${mod.path}/${x.file}`)).length;
  return { n, total: mod.notes.length };
}
async function renderHome() {
  const inner = el("div", { class: "home-inner" });
  const home = el("main", { class: "home" }, inner);
  app.replaceChildren(home);
  attachBuddy();

  const owner = MODEL?.[0]?.user || SITE.owner;
  inner.append(
    el("div", { class: "home-head" },
      el("div", { class: "wordmark" }, "PaperNotes", el("span", { class: "dot" }, ".")),
      el("div", { class: "home-kicker" }, `notebook \u00b7 ${owner}`)),
    el("div", { class: "home-scrawl" }, `\u2014 ${dateScrawl()} \u00b7 property of a very tired student \u2014`),
    el("div", { class: "home-rule" }),
  );
  const toc = el("div", { class: "toc" });
  inner.append(toc);

  if (!MODEL) { toc.append(loadingLines()); try { await ensureModel(); } catch (e) { toc.replaceChildren(treeError(e)); return; } }
  if (!MODEL.length) { toc.replaceChildren(emptyToc()); return; }

  toc.replaceChildren();
  let n = 0;
  for (const group of MODEL) {
    toc.append(el("div", { class: "toc-user" }, group.user));
    for (const mod of group.modules) {
      n++;
      if (!mod.meta) mod.meta = await loadMeta(SITE, mod);
      const meta = mod.meta, p = moduleProgress(mod);
      toc.append(
        el("button", { class: "toc-entry", onclick: () => go(mod) },
          el("span", { class: "idx" }, pad2(n)),
          el("span", { class: "emoji" }, meta.emoji || ""),
          el("span", { class: "name" }, meta.title || prettify(mod.folder)),
          el("span", { class: "leader" }),
          el("span", { class: "pages" }, p.n ? `${p.n}/${p.total} pp` : `${p.total} pp`)),
        el("div", { class: "toc-blurb" }, meta.blurb || ""),
      );
    }
  }
}
const go = (mod, file) => { location.hash = `#/m/${encodeURIComponent(mod.user)}/${encodeURIComponent(mod.folder)}${file ? "/" + encodeURIComponent(file) : ""}`; };

function loadingLines() {
  const w = el("div", { class: "skeleton-lines" });
  for (let i = 0; i < 4; i++) w.append(el("div", { class: "bar", style: `width:${55 + Math.random() * 35}%` }));
  w.append(el("div", { class: "loading-note" }, "flipping through the pages\u2026"));
  return w;
}
function emptyToc() {
  return el("div", { class: "state" }, el("div", { class: "line" }, "this notebook is blank."),
    el("p", {}, "drop a folder like YourName/ModuleName/ with some .md files in it, push, and it shows up here."));
}
function treeError(e) {
  const rate = String(e.message).includes("rate");
  return el("div", { class: "state" }, el("span", { class: "face" }, "(._.)"),
    el("div", { class: "line" }, "hmm, can\u2019t find the pages."),
    el("p", {}, rate
      ? "GitHub\u2019s API is rate-limiting this IP for a bit (60/hr unauthenticated). Give it a few minutes and refresh."
      : "Couldn\u2019t read the repo from GitHub. Check it\u2019s public and the owner/name in PaperNotes/js/app.js is right."),
    el("button", { class: "btn-accent", onclick: () => { MODEL = null; renderHome(); } }, "try again"));
}

/* ============================ READER ============================ */
async function renderReader(mod, file) {
  if (!mod.meta) mod.meta = await loadMeta(SITE, mod);

  const tocList = el("ul", { class: "toc-list" });
  const sidebar = el("aside", { class: "sidebar" },
    el("button", { class: "back", onclick: () => { location.hash = "#/"; } }, "\u2190 contents"),
    el("h2", {}, mod.meta.title || prettify(mod.folder)),
    el("div", { class: "code" }, mod.meta.tagline || [mod.user, mod.meta.code].filter(Boolean).join(" \u00b7 ")),
    el("div", { class: "search" }, el("input", { type: "search", id: "note-search", placeholder: "search these notes\u2026  (/)",
      oninput: (e) => { const q = e.target.value.toLowerCase().trim(); tocList.querySelectorAll(".toc-item").forEach((li) => li.classList.toggle("hidden-search", q && !li.dataset.title.includes(q))); } })),
    tocList,
  );
  const reading = el("div", { class: "reading" }, skeleton());
  app.replaceChildren(
    el("div", { class: "progress-line" }, el("span", { id: "scroll-prog" })),
    el("div", { class: "reader" }, sidebar, el("div", { class: "content-col" }, reading)),
  );
  attachBuddy(); wireScrollProgress();

  let metas;
  const haveTitles = mod.notes.length && mod.notes[0].title !== undefined;
  try {
    metas = haveTitles
      ? mod.notes.map((nt) => ({ ...nt, order: nt.order != null ? Number(nt.order) : 999 }))
      : await Promise.all(mod.notes.map(async (nt) => {
          const { data } = await getNote(SITE, nt.path);
          return { ...nt, title: data.title || prettify(nt.file), emoji: data.emoji || "", blurb: data.blurb || "", order: data.order != null ? Number(data.order) : 999 };
        }));
  } catch (e) { reading.replaceChildren(noteError(e, mod, file, reading, tocList)); return; }
  metas.sort((a, b) => a.order - b.order || a.file.localeCompare(b.file, undefined, { numeric: true }));
  mod._notes = metas;

  const done = readSet();
  metas.forEach((nt, i) => {
    const key = `${mod.path}/${nt.file}`;
    tocList.append(el("li", {
      class: `toc-item${done.has(key) ? " read" : ""}`, "data-file": nt.file,
      "data-title": `${nt.title} ${nt.blurb || ""}`.toLowerCase(),
      onclick: () => go(mod, nt.file),
    }, el("span", { class: "num" }, pad2(i)), el("span", { class: "t" }, nt.title), el("span", { class: "check" }, "\u2713")));
  });

  const current = metas.find((m) => m.file === file) || metas[0];
  await showNote(mod, current, reading, tocList);
}

async function showNote(mod, note, reading, tocList) {
  const metas = mod._notes, idx = metas.indexOf(note);
  tocList.querySelectorAll(".toc-item").forEach((li) => li.classList.toggle("active", li.dataset.file === note.file));

  reading.replaceChildren(skeleton());
  let parsed;
  try { parsed = await getNote(SITE, note.path); }
  catch (e) { reading.replaceChildren(noteError(e, mod, note.file, reading, tocList)); return; }

  const article = el("article", { class: "md", html: renderMarkdown(parsed.body) });
  enhance(article);
  enhanceMedia(article, mediaResolver(SITE, note.path));

  const key = `${mod.path}/${note.file}`;
  const isRead = readSet().has(key);
  const readBtn = el("button", { class: `read-toggle${isRead ? " done" : ""}`, onclick: () => toggleRead(mod, note, readBtn, tocList) },
    el("span", { class: "mark" }, isRead ? "\u2713" : "\u25cb"), el("span", { class: "label" }, isRead ? "marked as read" : "mark as read"));

  reading.replaceChildren(
    el("div", { class: "note-header" },
      parsed.data.emoji ? el("span", { class: "emoji" }, parsed.data.emoji) : null,
      el("span", { class: "kicker" }, `${mod.meta.title || mod.folder} \u00b7 page ${pad2(idx)}`)),
    article, readBtn, noteNav(mod, metas[idx - 1], metas[idx + 1]),
    doodleCanvas(key, reading),
  );
  wireScrollProgress();
  if (root.dataset.doodle === "on") buildDoodleToolbar();
}
function skeleton() { const s = el("div", { class: "skeleton-lines" }); ["82%","74%","88%","70%","80%"].forEach((w) => s.append(el("div", { class: "bar", style: `width:${w}` }))); return s; }
function noteError(e, mod, file, reading, tocList) {
  return el("div", { class: "state" }, el("span", { class: "face" }, ">_<"),
    el("div", { class: "line" }, "couldn\u2019t load this page."),
    el("p", {}, `${e.message}. Content is pulled raw from the GitHub repo \u2014 make sure it\u2019s public and pushed.`),
    el("button", { class: "btn-accent", onclick: () => showNote(mod, mod._notes.find((n) => n.file === file) || mod._notes[0], reading, tocList) }, "try again"));
}
function noteNav(mod, prev, next) {
  const nav = el("nav", { class: "note-nav" });
  if (prev) nav.append(el("button", { class: "prev", onclick: () => go(mod, prev.file) }, el("div", { class: "dir" }, "\u2190 previous"), el("div", { class: "ttl" }, prev.title)));
  if (next) nav.append(el("button", { class: "next", onclick: () => go(mod, next.file) }, el("div", { class: "dir" }, "next \u2192"), el("div", { class: "ttl" }, next.title)));
  return nav;
}
function toggleRead(mod, note, btn, tocList) {
  const key = `${mod.path}/${note.file}`, set = readSet(), now = !set.has(key);
  now ? set.add(key) : set.delete(key); saveReadSet(set);
  btn.classList.toggle("done", now);
  btn.querySelector(".mark").textContent = now ? "\u2713" : "\u25cb";
  btn.querySelector(".label").textContent = now ? "marked as read" : "mark as read";
  [...tocList.children].find((c) => c.dataset.file === note.file)?.classList.toggle("read", now);
  if (now) { const p = moduleProgress(mod); buddySay(p.n === p.total ? "the whole module. you absolute unit >:3" : pick(READ_LINES)); }
}

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
  const ctx = canvas.getContext("2d"); doodle.ctx = ctx; ctx.lineCap = "round"; ctx.lineJoin = "round";
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
  bar.append(eraser,
    el("button", { class: "ghost", onclick: clearDoodle }, "clear"),
    el("button", { class: "done", onclick: () => setDoodle(false) }, "done"));
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
  "highlight the whole page. assert dominance.",
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

/* ============================ PALETTE (contents & tools) ============================ */
let paletteEl = null;
function openPalette() {
  if (paletteEl) return;
  const scrim = el("div", { class: "palette-scrim", onclick: (e) => { if (e.target === scrim) closePalette(); } });
  const search = el("input", { type: "search", placeholder: "jump to a note or module\u2026", oninput: (e) => renderPaletteBody(body, e.target.value.toLowerCase().trim()) });
  const body = el("div", { class: "palette-body" });
  const tools = el("div", { class: "palette-tools", id: "palette-tools" });
  const pal = el("div", { class: "palette" }, el("div", { class: "palette-search" }, search), body, tools);
  scrim.append(pal); document.body.append(scrim); paletteEl = scrim;
  renderPaletteBody(body, "");
  renderPaletteTools(tools);
  requestAnimationFrame(() => search.focus());
}
function closePalette() { paletteEl?.remove(); paletteEl = null; }
async function renderPaletteBody(body, q) {
  body.replaceChildren();
  try { await ensureModel(); } catch {}
  if (!MODEL) return;
  body.append(el("div", { class: "palette-label" }, "contents"));
  const r = parseHash();
  for (const group of MODEL) for (const mod of group.modules) {
    if (!mod.meta) mod.meta = await loadMeta(SITE, mod);
    const title = mod.meta.title || prettify(mod.folder);
    const notes = mod.notes.filter((n) => !q || (n.title || n.file).toLowerCase().includes(q));
    if (q && !title.toLowerCase().includes(q) && !notes.length) continue;
    body.append(el("button", { class: "pal-mod", onclick: () => { closePalette(); go(mod); } },
      el("span", { class: "idx" }, mod.meta.emoji || "\u25c6"),
      el("span", { class: "nm" }, title)));
    notes.forEach((n, i) => {
      const active = r.view === "reader" && r.module === mod.folder && r.file === n.file;
      body.append(el("button", { class: `pal-note${active ? " active" : ""}`, onclick: () => { closePalette(); go(mod, n.file); } },
        el("span", { class: "num" }, pad2(mod.notes.indexOf(n))),
        el("span", { class: "nm" }, n.title || prettify(n.file))));
    });
  }
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
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); paletteEl ? closePalette() : openPalette(); return; }
  if (e.key === "Escape") { if (paletteEl) closePalette(); else if (root.dataset.doodle === "on") setDoodle(false); else if (typing) e.target.blur(); return; }
  if (typing) return;
  if (e.key === "/") { const s = $("#note-search"); if (s) { e.preventDefault(); s.focus(); } }
  else if (e.key === "ArrowLeft") $(".note-nav .prev")?.click();
  else if (e.key === "ArrowRight") $(".note-nav .next")?.click();
});

/* ============================ HINT + BOOT ============================ */
function attachHint() {
  if ($("#pn-hint")) return;
  document.body.append(el("div", { class: "hint", id: "pn-hint", onclick: openPalette },
    el("kbd", {}, `${MODKEY} S`), el("span", {}, "contents & tools")));
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
window.PaperNotes = { toggleTheme, setAccent, cyclePaper, toggleDoodle, openPalette, get site() { return SITE; }, get model() { return MODEL; } };
