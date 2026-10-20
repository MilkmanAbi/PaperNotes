/** Settings, About and Licenses: one page, sections down the left.
 *
 *  Appearance and reading settings are the app's own preferences (Prefs,
 *  saved with the app). The study folder, startup and backups belong to
 *  the Windows host, so on the desktop those rows talk to it through the
 *  bridge; on the website they are simply not shown. */

import { icon } from './icons.js';
import { renderNote } from '../core/markdown.js';
import { isDesktop, call } from '../desktop/bridge.js';
import { escapeHtml } from './study.js';
import gplText from '../assets/gpl-3.0.md?raw';
import fontLicenses from '../assets/font-licenses.md?raw';
import { PALETTES } from '../core/palettes.js';
import { customCard, customPanel, fontPicker } from './appearance.js';

const THIRD_PARTY = [
  ['markdown-it', 'MIT', 'Vitaly Puzrin, Alex Kocharin', 'https://github.com/markdown-it/markdown-it'],
  ['markdown-it-footnote', 'MIT', 'Vitaly Puzrin, Alex Kocharin', 'https://github.com/markdown-it/markdown-it-footnote'],
  ['KaTeX', 'MIT', 'Khan Academy and contributors', 'https://github.com/KaTeX/KaTeX'],
  ['PDF.js', 'Apache-2.0', 'Mozilla and contributors', 'https://github.com/mozilla/pdf.js'],
  ['highlight.js', 'BSD-3-Clause', 'Ivan Sagalaev and contributors', 'https://github.com/highlightjs/highlight.js'],
  ['CodeMirror 6', 'MIT', 'Marijn Haverbeke and contributors', 'https://github.com/codemirror/dev'],
  ['Mermaid', 'MIT', 'Knut Sveidqvist and contributors', 'https://github.com/mermaid-js/mermaid'],
  ['Fonts (49 open families, listed below)', 'OFL-1.1', 'Their designers, packaged by Fontsource', 'https://fontsource.org'],
  ['Model Context Protocol SDK', 'MIT', 'Anthropic, PBC', 'https://github.com/modelcontextprotocol/typescript-sdk'],
  ['Microsoft Edge WebView2 SDK', 'BSD-3-Clause', 'Microsoft Corporation', 'https://www.nuget.org/packages/Microsoft.Web.WebView2'],
  ['Lucide icons (shapes)', 'ISC', 'Lucide contributors', 'https://lucide.dev'],
  ['PaperDesign', '', 'MilkmanAbi', 'https://github.com/MilkmanAbi/PaperDesign'],
];

const SECTIONS = [
  { id: 'profile', label: 'You', icon: 'user', desktop: true },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'reading', label: 'Reading', icon: 'book' },
  { id: 'folder', label: 'Study folder', icon: 'folder', desktop: true },
  { id: 'music', label: 'Music', icon: 'music', desktop: true },
  { id: 'startup', label: 'Startup', icon: 'system', desktop: true },
  { id: 'claude', label: 'Claude', icon: 'sparkle', desktop: true },
  { id: 'backups', label: 'Backups', icon: 'history', desktop: true },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'command' },
  { id: 'about', label: 'About', icon: 'info' },
  { id: 'licenses', label: 'Licenses', icon: 'scale' },
];

const SHORTCUTS = [
  ['Ctrl K', 'Command palette: jump to anything'],
  ['/', 'Search notes, PDFs and slides'],
  ['Ctrl T / Ctrl W', 'New tab / close tab'],
  ['Ctrl Tab', 'Next tab (Shift for previous)'],
  ['Ctrl 1–9', 'Go to tab'],
  ['Alt ← / Alt →', 'Back / forward in this tab'],
  ['Ctrl \\', 'Show or hide both side panels'],
  ['Ctrl B / Ctrl Alt B', 'Notes panel / outline'],
  ['Ctrl E', 'Edit the note'],
  ['Ctrl S', 'Save (in the editor)'],
  ['/', 'In the editor, at the start of a line: insert a block (callout, table, tree, flowchart…)'],
  ['[ [', 'In the editor: link a note, with suggestions (![[ embeds it)'],
  ['Ctrl B / Ctrl I', 'In the editor: bold / italic (Ctrl Shift H highlights)'],
  ['Ctrl N', 'New note'],
  ['Ctrl D', 'Mark as done'],
  ['Ctrl R', 'New reminder'],
  ['Ctrl Shift S', 'New sticky note'],
  ['Ctrl Shift L', 'Study this note with Claude'],
  ['[ / ]', 'Previous / next file in the tree'],
  ['F2 / Del', 'Rename / Recycle Bin (in the tree)'],
  ['Ctrl ,', 'Settings'],
];

export async function showSettings({ reader, prefs, state, router, toasts, hostInfo, anchor, profile, reloadProfile, music, updater }) {
  reader._clear();
  reader.currentPath = ':settings';
  reader.inner.dataset.wide = 'true';

  const sections = SECTIONS.filter((s) => !s.desktop || isDesktop);
  const active = sections.some((s) => s.id === anchor) ? anchor : sections[0].id;

  const page = document.createElement('div');
  page.className = 'reader__sheet settings';
  page.innerHTML = `
    <nav class="settings__nav" aria-label="Settings sections">
      <h1 class="settings__title">Settings</h1>
      ${sections.map((s) => `<a href="#/:settings#${s.id}" data-id="${s.id}" aria-current="${s.id === active}">${icon(s.icon)}<span>${s.label}</span></a>`).join('')}
    </nav>
    <div class="settings__body"></div>`;
  reader.inner.appendChild(page);
  const body = page.querySelector('.settings__body');
  page.querySelector('.settings__nav').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-id]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    router.go(':settings', { anchor: a.dataset.id });
  });

  const ctx = { prefs, state, toasts, hostInfo, router, profile: profile?.profile, reloadProfile, music, updater,
    rerender: () => showSettings({ reader, prefs, state, router, toasts, hostInfo, anchor: active, profile, reloadProfile, music, updater }) };
  body.appendChild(await RENDER[active](ctx));
  reader.wrap.scrollTop = 0;
  reader.headings = [];
  reader._emitHeadings();
}

// ── building blocks ─────────────────────────────────────────────────────
function section(title, intro = '') {
  const el = document.createElement('section');
  el.className = 'settings__section';
  el.innerHTML = `<h2>${escapeHtml(title)}</h2>${intro ? `<p class="settings__intro">${intro}</p>` : ''}`;
  return el;
}

function row(label, hint, control) {
  const el = document.createElement('div');
  el.className = 'setting';
  el.innerHTML = `<div class="setting__text"><span class="setting__label">${escapeHtml(label)}</span>${hint ? `<span class="setting__hint">${hint}</span>` : ''}</div>`;
  const c = document.createElement('div');
  c.className = 'setting__control';
  c.append(...[].concat(control));
  el.appendChild(c);
  return el;
}

function segmented(options, value, onPick) {
  const el = document.createElement('div');
  el.className = 'segmented';
  el.setAttribute('role', 'group');
  for (const o of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = o.icon ? `${icon(o.icon)}<span>${escapeHtml(o.label)}</span>` : escapeHtml(o.label);
    b.setAttribute('aria-pressed', String(o.value === value));
    b.onclick = () => {
      for (const x of el.children) x.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
      onPick(o.value);
    };
    el.appendChild(b);
  }
  return el;
}

function toggle(value, onChange, { disabled = false } = {}) {
  const label = document.createElement('label');
  label.className = 'switch';
  label.innerHTML = '<input type="checkbox" role="switch"><span class="switch__track"><span class="switch__thumb"></span></span>';
  const input = label.querySelector('input');
  input.checked = Boolean(value);
  input.disabled = disabled;
  input.onchange = () => onChange(input.checked);
  return label;
}

function button(label, onClick, { primary = false, iconName = null } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = primary ? 'btn' : 'btn btn--secondary';
  b.innerHTML = `${iconName ? icon(iconName) : ''}<span>${escapeHtml(label)}</span>`;
  b.onclick = onClick;
  return b;
}

/** A card per theme, each showing its light half and its dark half, then
 *  the Custom one (its settings appear underneath while it is on). */
function themePicker(prefs, rerender) {
  const wrap = document.createElement('div');
  wrap.className = 'themes';
  const current = prefs.get('palette') || 'paper';
  wrap.appendChild(customCard(prefs, rerender));
  for (const p of PALETTES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-card';
    b.setAttribute('aria-pressed', String(p.id === current));
    const half = (c) => `<span class="theme-card__half" style="background:${c[1]}"><span class="theme-card__sheet" style="background:${c[0]};color:${c[2]}">
      <i style="background:${c[2]}"></i><i style="background:${c[2]};opacity:.45"></i><b style="background:${c[3]}"></b>
      <span class="theme-card__dots">${c.slice(4).map((x) => `<em style="background:${x}"></em>`).join('')}</span></span></span>`;
    b.innerHTML = `<span class="theme-card__preview">${half(p.light)}${half(p.dark)}</span>
      <span class="theme-card__name">${escapeHtml(p.name)}</span><span class="theme-card__note">${escapeHtml(p.note)}</span>`;
    b.onclick = () => {
      const fromCustom = prefs.get('palette') === 'custom';
      prefs.set('palette', p.id);
      for (const x of wrap.children) x.setAttribute('aria-pressed', String(x === b));
      if (fromCustom) rerender?.();   // the custom settings go away
    };
    wrap.appendChild(b);
  }
  // The custom card first in the source keeps it easy to find; it shows last.
  wrap.appendChild(wrap.firstElementChild);
  return wrap;
}

// ── sections ────────────────────────────────────────────────────────────
const RENDER = {
  profile({ profile, router, rerender, reloadProfile }) {
    const s = section('You', 'PaperNotes reads <code>info.md</code> at the top of your library: the home screen shows the semester week and today\'s classes from it, and Claude gets it as context. Every field is optional, and the file is yours to edit anywhere.');
    const f = profile?.fields || {};
    const rows = [['Name', f.name], ['School', f.school], ['Course', f.course], ['Year', f.year], ['Semester', f.semester], ['Week 1 starts', f.semesterStart]];
    for (const [k, v] of rows) s.append(row(k, '', Object.assign(document.createElement('span'), { className: 'setting__value', textContent: v || '—' })));
    const tt = profile?.timetable?.length ? `${profile.timetable.length} classes from ${profile.timetableCsv}` : profile?.timetableCsv ? `${profile.timetableCsv} (no classes in it yet)` : 'No timetable.csv yet';
    s.append(
      row('Timetable', `${escapeHtml(tt)}${profile?.timetableImage ? ` · picture: <span class="mono">${escapeHtml(profile.timetableImage)}</span>` : ''}. Columns: Day, Start, End, Module, Type, Room, Notes.`,
        button('Open timetable', () => router.go(':timetable'), { iconName: 'table' })),
      row('', '', [
        button(profile?.exists ? 'Edit your details' : 'Add your details', async () => {
          window.dispatchEvent(new CustomEvent('papernotes:profile'));
          setTimeout(async () => { await reloadProfile?.(); rerender(); }, 1500);
        }, { primary: true, iconName: 'edit' }),
        button('Open your profile', () => router.go(':profile'), { iconName: 'user' }),
      ].filter(Boolean)),
    );
    return s;
  },

  appearance({ prefs, rerender }) {
    const s = section('Appearance');
    s.append(
      themePicker(prefs, rerender),
      ...(prefs.get('palette') === 'custom' ? [customPanel(prefs, row)] : []),
      row('Light or dark', 'Every theme has both. Follow Windows, or pick one.', segmented([
        { value: 'light', label: 'Light', icon: 'sun' },
        { value: 'system', label: 'System', icon: 'system' },
        { value: 'dark', label: 'Dark', icon: 'moon' },
      ], prefs.get('theme'), (v) => prefs.set('theme', v))),
      row('Density', 'How tightly the tree and lists are packed. Text size never changes with this.', segmented([
        { value: 'dense', label: 'Dense' }, { value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' },
      ], prefs.get('density'), (v) => prefs.set('density', v))),
      row('Remember tabs', 'Reopen the tabs you had when PaperNotes starts.', toggle(prefs.get('restoreTabs'), (v) => prefs.set('restoreTabs', v))),
    );
    return s;
  },

  reading({ prefs }) {
    const s = section('Reading');
    const scale = document.createElement('div');
    scale.className = 'setting__range';
    scale.innerHTML = `<input type="range" min="85" max="150" step="5"><output></output>`;
    const range = scale.querySelector('input');
    const out = scale.querySelector('output');
    range.value = prefs.get('readerScale') || 100;
    out.textContent = `${range.value}%`;
    range.oninput = () => { out.textContent = `${range.value}%`; prefs.set('readerScale', Number(range.value)); };
    s.append(
      row('Width', 'Fill uses the whole space between the panels. The others keep lines to a comfortable length.', segmented([
        { value: 'comfortable', label: 'Comfortable' }, { value: 'wide', label: 'Wide' }, { value: 'fill', label: 'Fill' },
      ], prefs.get('readingWidth'), (v) => prefs.set('readingWidth', v))),
      row('Text size', 'Notes only; the app around them stays the same.', scale),
      row('Text font', 'Notes only. Paper Serif is the original look; Default is what Notion and Obsidian use. Office fonts work when this PC has them.', fontPicker(prefs, 'text')),
      row('Heading font', 'Headings can have a font of their own, or follow the text.', fontPicker(prefs, 'heading')),
      row('Code font', 'Code blocks in notes, and the editor.', fontPicker(prefs, 'code')),
      row('Line spacing', 'Space between the lines of a note.', segmented([
        { value: 'compact', label: 'Compact' }, { value: 'normal', label: 'Normal' }, { value: 'relaxed', label: 'Relaxed' },
      ], prefs.get('lineHeight') || 'normal', (v) => prefs.set('lineHeight', v))),
      row('Preview links on hover', 'Rest the pointer on a link to another note to see what is there, without leaving this one.', toggle(prefs.get('linkPreview') !== false, (v) => prefs.set('linkPreview', v))),
      row('Editor line numbers', 'Shown beside the Markdown while editing.', toggle(prefs.get('editorLineNumbers'), (v) => prefs.set('editorLineNumbers', v))),
      row('Spell check', 'Underline misspellings while editing.', toggle(prefs.get('spellcheck'), (v) => prefs.set('spellcheck', v))),
    );
    return s;
  },

  async folder({ hostInfo, toasts }) {
    const s = section('Study folder', 'PaperNotes reads your notes from one folder and never moves them. Everything it remembers (tags, done, reminders, stickies, confused marks, backups) is kept inside it, in a hidden <code>.papernotes</code> folder, so it travels with the notes.');
    const path = document.createElement('div');
    path.className = 'setting__path mono';
    path.textContent = hostInfo.notesDir;
    s.append(
      row('Current folder', '', path),
      row('', '', [
        button('Open in Explorer', () => call('folder'), { iconName: 'folder' }),
        button('Choose another folder…', async () => {
          const r = await call('pickFolder');
          if (r) toasts.show({ text: 'Switching folders…' });
        }, { iconName: 'folderOpenAlt' }),
        button('Re-read now', () => window.dispatchEvent(new CustomEvent('papernotes:rescan')), { iconName: 'refresh' }),
      ]),
    );
    return s;
  },

  async music({ music, router, rerender }) {
    const s = section('Music', 'PaperNotes plays the songs in one folder (and every folder inside it): MP3, M4A, AAC, FLAC, Ogg, Opus and WAV. Titles, artists, albums and cover art come from the files\' own tags, in any language; files without tags are named from their file names. Nothing is copied or changed.');
    const info = await call('musicInfo').catch(() => ({ dir: '' }));
    const path = document.createElement('div');
    path.className = 'setting__path mono';
    path.textContent = info.dir || 'No Music folder found';
    s.append(
      row('Music folder', music?.tracks.length ? `${music.tracks.length} songs` : '', path),
      row('', '', [
        button('Open Music', () => router.go(':music'), { primary: true, iconName: 'music' }),
        button('Choose another folder…', async () => { await music?.chooseFolder(); rerender(); }, { iconName: 'folderOpenAlt' }),
        button('Show in Explorer', () => call('revealMusic', ''), { iconName: 'folder' }),
      ]),
    );
    return s;
  },

  async startup({ toasts }) {
    const st = await call('startup');
    const s = section('Startup');
    const showRow = row('Show the window at login', 'Off: PaperNotes starts quietly in the notification area, ready for reminders. Click its icon to open it.',
      toggle(st.showAtLogin, async (v) => { await call('setStartup', 'showAtLogin', v ? 1 : 0); }, { disabled: !st.runAtLogin }));
    s.append(
      row('Start PaperNotes when you sign in to Windows', '', toggle(st.runAtLogin, async (v) => {
        await call('setStartup', 'runAtLogin', v ? 1 : 0);
        showRow.querySelector('input').disabled = !v;
        toasts.show({ text: v ? 'PaperNotes will start when you sign in.' : 'PaperNotes will not start by itself.' });
      })),
      showRow,
      row('Closing the window', 'Keep PaperNotes running in the notification area so reminders still pop up.', toggle(st.closeToTray, (v) => call('setStartup', 'closeToTray', v ? 1 : 0))),
    );
    return s;
  },

  async claude({ toasts, prefs }) {
    const st = await call('claudeStatus').catch(() => ({}));
    const s = section('Claude', 'Study with Claude Code. <b>Study with Claude</b> (on any note, or Ctrl Shift L) opens Claude in a terminal with the note, your confused spots and your reminders already handed over. Connecting the PaperNotes tools lets Claude read your notes and add reminders, stickies and tags for you.');
    const stat = document.createElement('span');
    stat.className = 'setting__status';
    stat.innerHTML = st.cli ? `${icon('checkCircle')} Claude Code found` : `${icon('alert')} Claude Code not found`;
    const mcp = document.createElement('span');
    mcp.className = 'setting__status';
    mcp.innerHTML = st.connected ? `${icon('checkCircle')} Connected` : 'Not connected';
    s.append(
      row('Claude Code', st.cli ? `<span class="mono">${escapeHtml(st.cli)}</span>` : 'Install it from claude.com/claude-code, then come back here.', stat),
      row('PaperNotes tools for Claude', 'Adds the PaperNotes MCP server to Claude Code (for your user, every project).', [
        mcp,
        button(st.connected ? 'Reconnect' : 'Connect', async () => {
          try {
            await call('claudeConnect');
            toasts.show({ text: 'Connected. Claude Code can now use the PaperNotes tools.' });
            mcp.innerHTML = `${icon('checkCircle')} Connected`;
          } catch (err) { toasts.show({ tone: 'error', text: `Could not connect: ${err.message}` }); }
        }, { primary: !st.connected }),
      ]),
      row('Where Claude opens', 'Beside your note in the side pane, in the terminal panel at the bottom, or in Windows Terminal.', segmented([
        { value: 'side', label: 'Side pane' }, { value: 'panel', label: 'Panel' }, { value: 'external', label: 'Windows Terminal' },
      ], prefs.get('claudeIn') || 'side', (v) => prefs.set('claudeIn', v))),
      row('Try it', 'Opens Claude in your study folder with your reminders and confused spots.', button('Study with Claude', () => window.dispatchEvent(new CustomEvent('papernotes:claude', { detail: {} })), { iconName: 'sparkle' })),
    );
    return s;
  },

  async backups({ toasts, rerender }) {
    const list = await call('backups').catch(() => []);
    const s = section('Backups', 'Once a day PaperNotes copies every note you can edit (.md) and everything it remembers into <code>.papernotes\\backups</code> inside your study folder. The last 14 days are kept. PDFs and slides are never changed by the app, so they are not copied.');
    s.append(row('Back up now', '', button('Back up now', async () => {
      try { const r = await call('backupNow'); toasts.show({ text: `Backed up ${r.files} files.` }); rerender(); }
      catch (err) { toasts.show({ tone: 'error', text: `Backup failed: ${err.message}` }); }
    }, { iconName: 'history' })));
    if (!list.length) {
      s.append(row('No backups yet', 'The first one is made a minute after PaperNotes starts.', []));
    }
    for (const b of list) {
      s.append(row(b.name.replace(/\.pack$/, ''), `${b.files} files · ${(b.bytes / 1048576).toFixed(1)} MB`, button('Restore…', async () => {
        try {
          const n = await call('restoreBackup', b.name, '');
          if (n !== false) { toasts.show({ text: `Restored ${n} files from ${b.name.replace(/\.pack$/, '')}.` }); window.dispatchEvent(new CustomEvent('papernotes:rescan')); }
        } catch (err) { toasts.show({ tone: 'error', text: err.message }); }
      })));
    }
    return s;
  },

  shortcuts() {
    const s = section('Keyboard shortcuts');
    const table = document.createElement('div');
    table.className = 'shortcuts';
    table.innerHTML = SHORTCUTS.map(([k, d]) => `<div class="shortcut"><span class="shortcut__keys">${k.split(' / ').map((part) => part.split(' ').map((x) => `<kbd>${escapeHtml(x)}</kbd>`).join(' ')).join(' / ')}</span><span>${escapeHtml(d)}</span></div>`).join('');
    s.appendChild(table);
    return s;
  },

  async about({ hostInfo, updater, prefs }) {
    const s = document.createElement('section');
    s.className = 'settings__section about';
    s.innerHTML = `
      <div class="about__hero">
        <img class="about__logo" src="brand/logo.png" alt="PaperNotes logo" draggable="false">
        <div>
          <h2 class="about__name">PaperNotes</h2>
          <p class="about__version">Version ${escapeHtml(hostInfo?.version || 'web')}</p>
          <p>Your notes, past papers and school material in one place, with the tools to actually study them: tags, progress, reminders, confused spots, sticky notes and Claude.</p>
          <p class="caption">Made by Abinaash (MilkmanAbi). Built on PaperDesign.</p>
        </div>
      </div>
      <div class="about__mascot">
        <img src="brand/lily.png" alt="LilyKnight" draggable="false">
        <div>
          <h3>Meet LilyKnight</h3>
          <p>PaperNotes' mascot: a small knight who guards your notebook and is slightly worried about your exam timetable. He shows up on the home screen to keep you company.</p>
        </div>
      </div>`;
    if (updater) {
      const box = section('Updates', 'PaperNotes checks <a href="https://github.com/MilkmanAbi/PaperNotes/releases" target="_blank" rel="noopener">its releases on GitHub</a> twice a day. Updating is one click: it saves everything, installs the new version and opens again. Your notes, settings and everything PaperNotes remembers are left exactly as they are.');
      const status = document.createElement('span');
      status.className = 'setting__status';
      const paint = () => {
        status.textContent = updater.state === 'checking' ? 'Checking…'
          : updater.available ? `PaperNotes ${updater.available.version} is available` : `You have ${hostInfo.version}`;
      };
      updater.on(paint);
      paint();
      box.append(
        row('Version', '', [status,
          button('Check now', async () => { const u = await updater.check(); if (u) updater.openPanel(); }, { iconName: 'refresh' }),
          button('Update now', () => updater.openPanel(), { primary: true, iconName: 'download' })]),
        row('Check for updates automatically', 'A quiet look at GitHub after start-up and twice a day. Nothing is ever installed without your click.',
          toggle(prefs.get('updateCheck') !== false, (v) => prefs.set('updateCheck', v))),
      );
      s.append(box);
    }
    return s;
  },

  licenses() {
    const s = section('Licenses');
    const intro = document.createElement('p');
    intro.className = 'settings__intro';
    intro.innerHTML = 'PaperNotes is free software, released under the <b>GNU General Public License, version 3</b> (below). It is built with these open-source projects, each under its own license:';
    const list = document.createElement('ul');
    list.className = 'licenses__list';
    list.innerHTML = THIRD_PARTY.map(([name, lic, who, url]) => `<li><a href="${url}" target="_blank" rel="noopener">${escapeHtml(name)}</a><span>${escapeHtml(who)}</span><span class="licenses__tag">${escapeHtml(lic || 'see project')}</span></li>`).join('');
    const gpl = document.createElement('details');
    gpl.className = 'licenses__gpl';
    gpl.innerHTML = '<summary>GNU General Public License v3.0 (full text)</summary>';
    const article = document.createElement('article');
    article.className = 'note-content';
    article.innerHTML = renderNote(gplText, 'LICENSE.md').html;
    gpl.appendChild(article);
    gpl.open = true;
    const fonts = document.createElement('details');
    fonts.className = 'licenses__gpl';
    fonts.innerHTML = '<summary>The fonts and the SIL Open Font License 1.1</summary>';
    const fontText = document.createElement('article');
    fontText.className = 'note-content';
    fontText.innerHTML = renderNote(fontLicenses, 'FONTS.md').html;
    fonts.appendChild(fontText);
    s.append(intro, list, fonts, gpl);
    return s;
  },
};
