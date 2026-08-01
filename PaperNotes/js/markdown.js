/* markdown.js — PaperNotes markdown + media layer
 * Wraps `marked` (GFM) + `highlight.js` (globals from index.html).
 * Jobs: strip YAML frontmatter; render; enhance the DOM with syntax
 * highlighting, copy buttons, heading anchors; and merge in media —
 * images become taped-in photos, video/pdf links become players/embeds,
 * and relative media URLs are rewritten to wherever the note actually lives.
 */

export function parseFrontmatter(raw) {
  const data = {};
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { data, body: raw };
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    data[k] = v;
  }
  return { data, body: raw.slice(m[0].length) };
}

let configured = false;
function configureMarked() {
  if (configured || !window.marked) return;
  window.marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
  configured = true;
}

export function renderMarkdown(body) {
  configureMarked();
  if (!window.marked) return `<pre>${escapeHtml(body)}</pre>`;
  return window.marked.parse(body);
}

export function slugify(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
}

/* Basic enhancement: highlight, copy buttons, heading ids → returns outline. */
export function enhance(container) {
  if (window.hljs) container.querySelectorAll("pre code").forEach((el) => {
    try { window.hljs.highlightElement(el); } catch {}
  });
  container.querySelectorAll("pre").forEach((pre) => {
    const btn = document.createElement("button");
    btn.className = "copy-btn"; btn.type = "button"; btn.textContent = "copy";
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code")?.innerText ?? pre.innerText;
      try { await navigator.clipboard.writeText(code); btn.textContent = "copied ✓"; btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "copy"; btn.classList.remove("copied"); }, 1400);
      } catch { btn.textContent = "oops"; }
    });
    pre.appendChild(btn);
  });
  const outline = []; const seen = new Map();
  container.querySelectorAll("h1, h2, h3").forEach((h) => {
    let id = slugify(h.textContent);
    if (seen.has(id)) { const n = seen.get(id) + 1; seen.set(id, n); id = `${id}-${n}`; } else seen.set(id, 0);
    h.id = id; outline.push({ level: Number(h.tagName[1]), text: h.textContent, id });
  });
  return outline;
}

const isVideo = (u) => /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(u);
const isPdf   = (u) => /\.pdf(\?.*)?$/i.test(u);
const isAbs   = (u) => /^([a-z]+:)?\/\//i.test(u) || u.startsWith("data:");

/**
 * Media pass. `resolve(rel)` turns a note-relative path into a real URL
 * (raw GitHub, usually). Rewrites relative src/href, upgrades video/pdf
 * links to players/embeds, and frames images as taped-in photos.
 */
export function enhanceMedia(container, resolve) {
  const fix = (u) => (u && !isAbs(u) && !u.startsWith("#") ? resolve(u) : u);

  // videos & pdfs referenced as links
  container.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (isVideo(href)) return replaceWith(a, videoEl(fix(href)));
    if (isPdf(href))   return replaceWith(a, pdfEl(fix(href), a.textContent));
    a.setAttribute("href", fix(href));
    if (isAbs(a.getAttribute("href"))) { a.target = "_blank"; a.rel = "noopener"; }
  });

  // images: rewrite src, then frame as taped photo (or upgrade to video)
  container.querySelectorAll("img").forEach((img) => {
    const src = fix(img.getAttribute("src"));
    if (isVideo(src)) return replaceWith(img, videoEl(src));
    img.setAttribute("src", src);
    img.loading = "lazy";
    const fig = document.createElement("figure");
    fig.className = "taped";
    fig.style.setProperty("--tilt", `${(Math.random() * 3 - 1.5).toFixed(2)}deg`);
    const alt = img.getAttribute("alt");
    img.replaceWith(fig); fig.appendChild(img);
    if (alt) { const cap = document.createElement("figcaption"); cap.textContent = alt; fig.appendChild(cap); }
    img.addEventListener("click", () => lightbox(img.src, alt));
  });
}

function videoEl(src) {
  const v = document.createElement("video");
  v.controls = true; v.preload = "metadata"; v.className = "note-video"; v.src = src;
  const wrap = document.createElement("figure"); wrap.className = "media-frame"; wrap.appendChild(v);
  return wrap;
}
function pdfEl(src, label) {
  const fig = document.createElement("figure"); fig.className = "media-frame pdf-frame";
  const bar = document.createElement("div"); bar.className = "pdf-bar";
  bar.innerHTML = `<span>${escapeHtml(label || "PDF")}</span>`;
  const open = document.createElement("a"); open.href = src; open.target = "_blank"; open.rel = "noopener";
  open.className = "btn ghost"; open.textContent = "open ↗"; bar.appendChild(open);
  const frame = document.createElement("iframe"); frame.src = src; frame.className = "pdf-embed"; frame.loading = "lazy";
  fig.append(bar, frame); return fig;
}
function replaceWith(node, el) { node.replaceWith(el); }

/* click-to-zoom lightbox */
function lightbox(src, alt) {
  const ov = document.createElement("div"); ov.className = "lightbox";
  const img = document.createElement("img"); img.src = src; if (alt) img.alt = alt;
  ov.appendChild(img);
  ov.addEventListener("click", () => ov.remove());
  document.addEventListener("keydown", function esc(e){ if (e.key === "Escape") { ov.remove(); document.removeEventListener("keydown", esc); } });
  document.body.appendChild(ov);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
