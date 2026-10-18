/** What a file is, decided by its extension.
 *
 *  Notes are Markdown. Everything else in content/ is an attachment: it is
 *  listed in the tree like a note, and the reader picks a viewer for it from
 *  the kind returned here. Unknown extensions are not an error — they get a
 *  download card, which is the honest thing to offer for bytes the browser
 *  cannot show. */

const KINDS = {
  note: ['md', 'markdown', 'mdx'],
  pdf: ['pdf'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp', 'ico'],
  video: ['mp4', 'webm', 'm4v', 'mov', 'ogv'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac'],
  page: ['html', 'htm'],
  notebook: ['ipynb'],
  table: ['csv', 'tsv'],
  link: ['url', 'webloc'],
  office: ['doc', 'docx', 'ppt', 'pptx', 'pps', 'ppsx', 'xls', 'xlsx', 'odt', 'odp', 'ods'],
  archive: ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'aia'],
  code: [
    'c', 'h', 'cpp', 'hpp', 'cc', 'ino', 'py', 'js', 'mjs', 'ts', 'java', 'cs', 'go',
    'rs', 'm', 'sh', 'bat', 'cmd', 'ps1', 'json', 'xml', 'yml', 'yaml', 'toml', 'ini',
    'css', 'sql', 'txt', 'log', 'tex', 'r', 'v', 'vhd', 'asm', 's',
  ],
};

const BY_EXT = new Map();
for (const [kind, exts] of Object.entries(KINDS)) for (const e of exts) BY_EXT.set(e, kind);

/** highlight.js language for a code extension, where the name differs. */
const LANG = {
  h: 'cpp', hpp: 'cpp', cc: 'cpp', ino: 'cpp', c: 'c', py: 'python', js: 'javascript',
  mjs: 'javascript', ts: 'typescript', cs: 'csharp', rs: 'rust', m: 'matlab', sh: 'bash',
  bat: 'dos', cmd: 'dos', ps1: 'powershell', yml: 'yaml', toml: 'ini', txt: 'plaintext',
  log: 'plaintext', tex: 'latex', v: 'verilog', vhd: 'vhdl', asm: 'x86asm', s: 'armasm',
};

export function extOf(name) {
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase();
}

export function fileKind(name) {
  return BY_EXT.get(extOf(name)) || 'other';
}

export function isNoteName(name) { return fileKind(name) === 'note'; }

export function codeLanguage(name) {
  const ext = extOf(name);
  return LANG[ext] || ext;
}

/** The tree glyph for a file. */
export function kindIcon(kind) {
  return {
    note: 'note', pdf: 'pdf', image: 'image', video: 'media', audio: 'media', page: 'globe',
    notebook: 'code', table: 'table', link: 'link', office: 'slides', archive: 'archive',
    code: 'code',
  }[kind] || 'file';
}

/** A short human label, for the file header. */
export function kindLabel(name) {
  const ext = extOf(name).toUpperCase();
  return {
    note: 'Note', pdf: 'PDF', image: `Image · ${ext}`, video: `Video · ${ext}`,
    audio: `Audio · ${ext}`, page: 'Saved web page', notebook: 'Jupyter notebook',
    table: `Table · ${ext}`, link: 'Web link', office: `Office file · ${ext}`,
    archive: `Archive · ${ext}`, code: `Source · ${ext}`,
  }[fileKind(name)] || (ext ? `${ext} file` : 'File');
}
