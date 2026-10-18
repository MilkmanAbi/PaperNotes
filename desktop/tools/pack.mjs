// Packs the notes into one file for the installer: desktop/stage/notes.pack.
//
// Why not just ship the folder: some Brightspace paths are deeper than
// Windows' 260-character limit once they sit in Documents, and Inno Setup
// cannot write those. PaperNotes.exe can (it uses \\?\ paths), so the
// installer ships this one file and the app unpacks it. The same file is
// the backup "Restore from backup" reads from.
//
// Format (little-endian):
//   "PNPACK1\0"                       8-byte magic
//   u32 count, u64 dataStart
//   count × { u16 pathBytes, path (UTF-8, "/"-separated), u64 size, i64 mtime (unix s), u64 offset }
//   file data, back to back, starting at dataStart
//
//   node desktop/tools/pack.mjs <out.pack> <dir>[=prefix] ...
//   e.g. node desktop/tools/pack.mjs stage/notes.pack ../content ../search-text=.papernotes/search-text

import fs from 'node:fs';
import path from 'node:path';

const [out, ...sources] = process.argv.slice(2);
if (!out || !sources.length) {
  console.error('usage: pack.mjs <out.pack> <dir>[=prefix] ...');
  process.exit(1);
}

const entries = [];
for (const spec of sources) {
  const [dir, prefix = ''] = spec.split('=');
  const root = path.resolve(dir);
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) stack.push(r);
      else if (e.isFile()) {
        const abs = path.join(root, r);
        const st = fs.statSync(abs);
        entries.push({ rel: prefix ? `${prefix}/${r}` : r, abs, size: st.size, mtime: Math.floor(st.mtimeMs / 1000) });
      }
    }
  }
}
entries.sort((a, b) => (a.rel < b.rel ? -1 : 1));

const names = entries.map((e) => Buffer.from(e.rel, 'utf8'));
const indexBytes = names.reduce((n, b) => n + 2 + b.length + 24, 0);
const dataStart = 8 + 4 + 8 + indexBytes;

const head = Buffer.alloc(dataStart);
head.write('PNPACK1\0', 0, 'latin1');
head.writeUInt32LE(entries.length, 8);
head.writeBigUInt64LE(BigInt(dataStart), 12);
let at = 20;
let offset = dataStart;
entries.forEach((e, i) => {
  head.writeUInt16LE(names[i].length, at); at += 2;
  names[i].copy(head, at); at += names[i].length;
  head.writeBigUInt64LE(BigInt(e.size), at); at += 8;
  head.writeBigInt64LE(BigInt(e.mtime), at); at += 8;
  head.writeBigUInt64LE(BigInt(offset), at); at += 8;
  offset += e.size;
});

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const fd = fs.openSync(out, 'w');
fs.writeSync(fd, head);
for (const e of entries) {
  const data = fs.readFileSync(e.abs);
  if (data.length !== e.size) throw new Error(`${e.rel} changed while packing`);
  fs.writeSync(fd, data);
}
fs.closeSync(fd);
console.log(`packed ${entries.length} files, ${(offset / 1048576).toFixed(1)} MB -> ${out}`);
