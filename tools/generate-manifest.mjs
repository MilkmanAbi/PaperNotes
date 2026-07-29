#!/usr/bin/env node
/**
 * generate-manifest.mjs
 * Walks <root>/<user>/<module>/ directories, reads _meta.json and each .md
 * file's YAML frontmatter, and writes PaperNotes/manifest.json.
 *
 * Directory conventions:
 *   <root>/
 *     <User>/              <- person dir  (skip: PaperNotes, hidden, _*)
 *       <Module>/          <- module dir  (skip: hidden, _*)
 *         _meta.json       <- required: { title, code, emoji, accent, blurb, tagline }
 *         *.md             <- notes; frontmatter: title, emoji, order, blurb
 *
 * Reading-time estimate: ceil(wordCount / 200) minutes, min 1.
 */

import fs   from "node:fs";
import path from "node:path";

// ---------- helpers ----------------------------------------------------------

const ROOT       = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MANIFEST   = path.join(ROOT, "PaperNotes", "manifest.json");
const SKIP_DIRS  = new Set(["PaperNotes", "tools", "node_modules", ".git"]);
const WORDS_PER_MIN = 200;

function isUserDir(name) {
  return !name.startsWith(".") && !name.startsWith("_") && !SKIP_DIRS.has(name);
}

function isModuleDir(name) {
  return !name.startsWith(".") && !name.startsWith("_");
}

/** Parse a fenced YAML frontmatter block (--- ... ---) into a plain object. */
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key   = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
    if (key) meta[key] = value;
  }
  return meta;
}

function wordCount(text) {
  // strip frontmatter first
  const body = text.replace(/^---[\s\S]*?---\r?\n/, "");
  return body.split(/\s+/).filter(Boolean).length;
}

function readingMinutes(text) {
  return Math.max(1, Math.ceil(wordCount(text) / WORDS_PER_MIN));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function listDirs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

// ---------- main -------------------------------------------------------------

const people = [];

for (const userName of listDirs(ROOT).filter(isUserDir)) {
  const userPath = path.join(ROOT, userName);
  const modules  = [];

  for (const modName of listDirs(userPath).filter(isModuleDir)) {
    const modPath  = path.join(userPath, modName);
    const metaPath = path.join(modPath, "_meta.json");

    const meta = readJson(metaPath);
    if (!meta) {
      console.warn(`[warn] skipping ${userName}/${modName} — no _meta.json`);
      continue;
    }

    const mdFiles = fs.readdirSync(modPath)
      .filter(f => f.endsWith(".md") && !f.startsWith("_"))
      .sort();

    const notes = mdFiles.map(file => {
      const filePath = path.join(modPath, file);
      const text     = fs.readFileSync(filePath, "utf8");
      const fm       = parseFrontmatter(text);

      return {
        file,
        path   : `${userName}/${modName}/${file}`,
        title  : fm.title  ?? file.replace(/\.md$/, ""),
        emoji  : fm.emoji  ?? "",
        blurb  : fm.blurb  ?? "",
        order  : fm.order  != null ? Number(fm.order) : null,
        minutes: readingMinutes(text),
      };
    });

    // sort by explicit order, then by filename
    notes.sort((a, b) => {
      if (a.order != null && b.order != null) return a.order - b.order;
      if (a.order != null) return -1;
      if (b.order != null) return  1;
      return a.file.localeCompare(b.file);
    });

    modules.push({
      id     : `${userName}/${modName}`,
      user   : userName,
      folder : modName,
      path   : `${userName}/${modName}`,
      title  : meta.title   ?? modName,
      code   : meta.code    ?? "",
      emoji  : meta.emoji   ?? "",
      blurb  : meta.blurb   ?? "",
      tagline: meta.tagline ?? "",
      accent : meta.accent  ?? "ink",
      count  : notes.length,
      notes,
    });
  }

  if (modules.length) {
    people.push({ user: userName, modules });
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  app        : "PaperNotes",
  people,
};

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`manifest written → ${MANIFEST}`);
console.log(`  ${people.length} person(s), ${people.reduce((s, p) => s + p.modules.length, 0)} module(s)`);
