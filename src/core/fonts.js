/** Every typeface Settings → Reading offers for notes.
 *
 *  Three kinds:
 *  - `bundled` fonts ship with PaperNotes (open fonts from Fontsource, SIL
 *    OFL 1.1, the Latin set only), so they look the same on every PC;
 *    scripts/gen-fonts.mjs writes their @font-face rules into
 *    src/styles/fonts.css. They are registered under "PN …" names so a
 *    copy installed on the PC can never be picked up by mistake, and each
 *    one is only downloaded the first time something uses it.
 *  - `system` fonts come with Windows or Microsoft Office. They cannot be
 *    shipped, so the picker checks whether each is installed.
 *  - the two PaperDesign originals keep the app's own font stacks, so
 *    choosing them (the default) changes nothing about how notes looked. */

export const FONT_GROUPS = [
  ['top', ''],
  ['paper', 'PaperDesign'],
  ['office', 'Word and Office'],
  ['serif', 'Reading serifs'],
  ['sans', 'Clean sans'],
  ['easy', 'Easier to read'],
  ['hand', 'Handwriting and fun'],
  ['mono', 'Monospace'],
];

// [id, name, group, kind, family or package, fallback, note]
const F = [
  ['default', 'Default (Notion / Obsidian)', 'top', 'stack', 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Helvetica, Arial, sans-serif', '', 'The system font both apps use: Segoe UI on Windows'],

  ['paper-serif', 'Paper Serif', 'paper', 'stack', 'var(--font-reading)', '', 'The PaperNotes original'],
  ['paper-sans', 'Paper Sans', 'paper', 'stack', 'var(--font-ui)', '', 'The app\'s own interface font'],
  ['paper-book', 'Paper Book', 'paper', 'bundled', 'literata', 'serif', 'Literata, made for long reading on screens'],
  ['paper-press', 'Paper Press', 'paper', 'bundled', 'newsreader', 'serif', 'Newsreader, a newspaper serif'],
  ['paper-classic', 'Paper Classic', 'paper', 'bundled', 'source-serif-4', 'serif', 'Source Serif 4, the serif PaperDesign is drawn around'],
  ['paper-clean', 'Paper Clean', 'paper', 'bundled', 'inter', 'sans-serif', 'Inter, PaperDesign\'s sans'],
  ['paper-civic', 'Paper Civic', 'paper', 'bundled', 'public-sans', 'sans-serif', 'Public Sans, plain and sturdy'],
  ['paper-mono', 'Paper Mono', 'paper', 'bundled', 'jetbrains-mono', 'monospace', 'JetBrains Mono, PaperDesign\'s code font'],
  ['paper-pen', 'Paper Pen', 'paper', 'bundled', 'caveat', 'cursive', 'Caveat, like notes written by hand'],

  ['aptos', 'Aptos', 'office', 'system', 'Aptos', 'sans-serif', 'Word\'s default since 2023'],
  ['calibri', 'Calibri', 'office', 'system', 'Calibri', 'sans-serif', 'Word\'s default 2007 to 2023'],
  ['cambria', 'Cambria', 'office', 'system', 'Cambria', 'serif', 'Word\'s heading serif'],
  ['times', 'Times New Roman', 'office', 'system', 'Times New Roman', 'serif', 'The classic essay font'],
  ['georgia', 'Georgia', 'office', 'system', 'Georgia', 'serif', ''],
  ['arial', 'Arial', 'office', 'system', 'Arial', 'sans-serif', ''],
  ['segoe', 'Segoe UI', 'office', 'system', 'Segoe UI', 'sans-serif', 'Windows itself'],
  ['verdana', 'Verdana', 'office', 'system', 'Verdana', 'sans-serif', 'Wide and very legible'],
  ['tahoma', 'Tahoma', 'office', 'system', 'Tahoma', 'sans-serif', ''],
  ['trebuchet', 'Trebuchet MS', 'office', 'system', 'Trebuchet MS', 'sans-serif', ''],
  ['palatino', 'Palatino Linotype', 'office', 'system', 'Palatino Linotype', 'serif', ''],
  ['book-antiqua', 'Book Antiqua', 'office', 'system', 'Book Antiqua', 'serif', ''],
  ['bookman', 'Bookman Old Style', 'office', 'system', 'Bookman Old Style', 'serif', ''],
  ['garamond', 'Garamond', 'office', 'system', 'Garamond', 'serif', ''],
  ['century', 'Century', 'office', 'system', 'Century', 'serif', ''],
  ['century-gothic', 'Century Gothic', 'office', 'system', 'Century Gothic', 'sans-serif', 'Round and geometric'],
  ['constantia', 'Constantia', 'office', 'system', 'Constantia', 'serif', ''],
  ['sitka', 'Sitka Text', 'office', 'system', 'Sitka Text', 'serif', 'Microsoft\'s reading serif'],
  ['candara', 'Candara', 'office', 'system', 'Candara', 'sans-serif', ''],
  ['corbel', 'Corbel', 'office', 'system', 'Corbel', 'sans-serif', ''],
  ['bahnschrift', 'Bahnschrift', 'office', 'system', 'Bahnschrift', 'sans-serif', 'Like road signs'],
  ['franklin', 'Franklin Gothic', 'office', 'system', 'Franklin Gothic Book', 'sans-serif', ''],
  ['gabriola', 'Gabriola', 'office', 'system', 'Gabriola', 'serif', 'Fancy, for titles'],
  ['comic-sans', 'Comic Sans MS', 'office', 'system', 'Comic Sans MS', 'cursive', 'Yes, really'],
  ['ink-free', 'Ink Free', 'office', 'system', 'Ink Free', 'cursive', 'Marker pen'],
  ['segoe-print', 'Segoe Print', 'office', 'system', 'Segoe Print', 'cursive', ''],
  ['segoe-script', 'Segoe Script', 'office', 'system', 'Segoe Script', 'cursive', ''],

  ['lora', 'Lora', 'serif', 'bundled', 'lora', 'serif', 'Soft, friendly serif'],
  ['merriweather', 'Merriweather', 'serif', 'bundled', 'merriweather', 'serif', 'Sturdy, made for screens'],
  ['eb-garamond', 'EB Garamond', 'serif', 'bundled', 'eb-garamond', 'serif', 'An old-book classic'],
  ['crimson', 'Crimson Pro', 'serif', 'bundled', 'crimson-pro', 'serif', 'Like a printed novel'],
  ['libre-baskerville', 'Libre Baskerville', 'serif', 'bundled', 'libre-baskerville', 'serif', ''],
  ['fraunces', 'Fraunces', 'serif', 'bundled', 'fraunces', 'serif', 'Chunky and warm'],
  ['playfair', 'Playfair Display', 'serif', 'bundled', 'playfair-display', 'serif', 'High contrast, best for headings'],
  ['noto-serif', 'Noto Serif', 'serif', 'bundled', 'noto-serif', 'serif', ''],
  ['plex-serif', 'IBM Plex Serif', 'serif', 'bundled', 'ibm-plex-serif', 'serif', ''],
  ['spectral', 'Spectral', 'serif', 'bundled', 'spectral', 'serif', 'Elegant and light'],

  ['dm-sans', 'DM Sans', 'sans', 'bundled', 'dm-sans', 'sans-serif', ''],
  ['manrope', 'Manrope', 'sans', 'bundled', 'manrope', 'sans-serif', ''],
  ['figtree', 'Figtree', 'sans', 'bundled', 'figtree', 'sans-serif', ''],
  ['plus-jakarta', 'Plus Jakarta Sans', 'sans', 'bundled', 'plus-jakarta-sans', 'sans-serif', ''],
  ['outfit', 'Outfit', 'sans', 'bundled', 'outfit', 'sans-serif', 'Geometric'],
  ['work-sans', 'Work Sans', 'sans', 'bundled', 'work-sans', 'sans-serif', ''],
  ['plex-sans', 'IBM Plex Sans', 'sans', 'bundled', 'ibm-plex-sans', 'sans-serif', ''],
  ['space-grotesk', 'Space Grotesk', 'sans', 'bundled', 'space-grotesk', 'sans-serif', 'A little quirky'],
  ['rubik', 'Rubik', 'sans', 'bundled', 'rubik', 'sans-serif', 'Rounded corners'],
  ['quicksand', 'Quicksand', 'sans', 'bundled', 'quicksand', 'sans-serif', 'Round and light'],
  ['nunito', 'Nunito', 'sans', 'bundled', 'nunito', 'sans-serif', 'Round and friendly'],
  ['open-sans', 'Open Sans', 'sans', 'bundled', 'open-sans', 'sans-serif', ''],
  ['roboto', 'Roboto', 'sans', 'bundled', 'roboto', 'sans-serif', 'Android\'s font'],
  ['noto-sans', 'Noto Sans', 'sans', 'bundled', 'noto-sans', 'sans-serif', ''],
  ['lato', 'Lato', 'sans', 'bundled', 'lato', 'sans-serif', ''],
  ['montserrat', 'Montserrat', 'sans', 'bundled', 'montserrat', 'sans-serif', 'Bold and wide'],
  ['poppins', 'Poppins', 'sans', 'bundled', 'poppins', 'sans-serif', 'Geometric, popular for slides'],

  ['atkinson', 'Atkinson Hyperlegible', 'easy', 'bundled', 'atkinson-hyperlegible-next', 'sans-serif', 'Every letter easy to tell apart'],
  ['lexend', 'Lexend', 'easy', 'bundled', 'lexend', 'sans-serif', 'Wider spacing, for reading fluency'],
  ['opendyslexic', 'OpenDyslexic', 'easy', 'bundled', 'opendyslexic', 'sans-serif', 'Weighted letters for dyslexia'],

  ['shantell', 'Shantell Sans', 'hand', 'bundled', 'shantell-sans', 'cursive', 'Marker-like and bouncy'],
  ['comic-neue', 'Comic Neue', 'hand', 'bundled', 'comic-neue', 'cursive', 'Comic Sans, grown up'],
  ['patrick-hand', 'Patrick Hand', 'hand', 'bundled', 'patrick-hand', 'cursive', 'Neat handwriting'],
  ['kalam', 'Kalam', 'hand', 'bundled', 'kalam', 'cursive', 'Pen on paper'],
  ['architects-daughter', 'Architects Daughter', 'hand', 'bundled', 'architects-daughter', 'cursive', 'Drafting-table capitals'],

  ['consolas', 'Consolas', 'mono', 'system', 'Consolas', 'monospace', 'Windows\' code font'],
  ['cascadia', 'Cascadia Code', 'mono', 'system', 'Cascadia Code', 'monospace', 'Windows Terminal\'s font'],
  ['courier', 'Courier New', 'mono', 'system', 'Courier New', 'monospace', 'Typewriter'],
  ['lucida-console', 'Lucida Console', 'mono', 'system', 'Lucida Console', 'monospace', ''],
  ['fira-code', 'Fira Code', 'mono', 'bundled', 'fira-code', 'monospace', 'With code ligatures'],
  ['source-code', 'Source Code Pro', 'mono', 'bundled', 'source-code-pro', 'monospace', ''],
  ['plex-mono', 'IBM Plex Mono', 'mono', 'bundled', 'ibm-plex-mono', 'monospace', ''],
  ['roboto-mono', 'Roboto Mono', 'mono', 'bundled', 'roboto-mono', 'monospace', ''],
  ['geist-mono', 'Geist Mono', 'mono', 'bundled', 'geist-mono', 'monospace', ''],
  ['victor-mono', 'Victor Mono', 'mono', 'bundled', 'victor-mono', 'monospace', 'Cursive italics'],
  ['space-mono', 'Space Mono', 'mono', 'bundled', 'space-mono', 'monospace', 'Retro'],
];

/** Fontsource packages that ship a variable font (the rest are static weights). */
export const VARIABLE = new Set([
  'source-serif-4', 'inter', 'public-sans', 'jetbrains-mono', 'literata', 'lora', 'newsreader', 'crimson-pro',
  'eb-garamond', 'merriweather', 'fraunces', 'playfair-display', 'noto-serif', 'libre-baskerville',
  'atkinson-hyperlegible-next', 'lexend', 'nunito', 'dm-sans', 'manrope', 'outfit', 'work-sans', 'ibm-plex-sans',
  'figtree', 'plus-jakarta-sans', 'space-grotesk', 'quicksand', 'rubik', 'open-sans', 'roboto', 'noto-sans',
  'montserrat', 'fira-code', 'source-code-pro', 'victor-mono', 'roboto-mono', 'geist-mono', 'caveat', 'shantell-sans',
]);

const title = (pkg) => pkg.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
export const bundledFamily = (pkg) => `PN ${title(pkg)}`;

export const FONTS = F.map(([id, name, group, kind, src, fallback, note]) => {
  let stack;
  if (kind === 'stack') stack = src;
  else if (kind === 'bundled') stack = `"${bundledFamily(src)}", ${fallback}`;
  else stack = `"${src}", ${fallback}`;
  return { id, name, group, kind, pkg: kind === 'bundled' ? src : null, family: kind === 'system' ? src : null, stack, note, mono: group === 'mono' || src === 'jetbrains-mono' };
});

export const fontById = (id) => FONTS.find((f) => f.id === id) || null;

/** Every bundled package, for the @font-face generator and the licences page. */
export const BUNDLED = [...new Set(FONTS.filter((f) => f.pkg).map((f) => f.pkg))];

/** Is a Windows or Office font installed? Measured, because the browser's
 *  own check says yes to fonts it would merely fall back from. */
const installed = new Map();
export function isInstalled(family) {
  if (installed.has(family)) return installed.get(family);
  const ctx = document.createElement('canvas').getContext('2d');
  const text = 'mmmmmmmmmmlliWW@#0123 The quick brown fox';
  const width = (font) => { ctx.font = `40px ${font}`; return ctx.measureText(text).width; };
  const yes = ['monospace', 'serif', 'sans-serif'].some((base) => width(`"${family}", ${base}`) !== width(base));
  installed.set(family, yes);
  return yes;
}

/** Old settings (Serif / Sans) map onto the two PaperDesign originals. */
export function textFontOf(prefs) {
  return prefs.fontText || (prefs.readerFont === 'sans' ? 'paper-sans' : 'paper-serif');
}

/** Put the chosen fonts on the page: notes, their headings, their code. */
export function applyFonts(state, root = document.documentElement) {
  const text = fontById(textFontOf(state)) || fontById('paper-serif');
  const heading = state.fontHeading && state.fontHeading !== 'same' ? fontById(state.fontHeading) : null;
  const code = state.fontCode && state.fontCode !== 'default' ? fontById(state.fontCode) : null;
  // The two originals keep the old switch, so their rules apply exactly as before.
  if (text.id === 'paper-serif' || text.id === 'paper-sans') {
    root.setAttribute('data-reader-font', text.id === 'paper-sans' ? 'sans' : 'serif');
    root.removeAttribute('data-note-font');
    root.style.removeProperty('--note-font');
  } else {
    root.setAttribute('data-reader-font', 'custom');
    root.setAttribute('data-note-font', text.id);
    root.style.setProperty('--note-font', text.stack);
  }
  if (heading) { root.setAttribute('data-heading-font', heading.id); root.style.setProperty('--note-heading-font', heading.stack); } else {
    root.removeAttribute('data-heading-font');
    root.style.removeProperty('--note-heading-font');
  }
  if (code) { root.setAttribute('data-code-font', code.id); root.style.setProperty('--note-code-font', code.stack); } else {
    root.removeAttribute('data-code-font');
    root.style.removeProperty('--note-code-font');
  }
  // Line spacing: the reader's own token, overridden only when asked.
  const leading = { compact: '1.45', relaxed: '1.9' }[state.lineHeight];
  if (leading) root.style.setProperty('--reader-leading', leading);
  else root.style.removeProperty('--reader-leading');
}
