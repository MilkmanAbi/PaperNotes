/** Studying with Claude.
 *
 *  Out: "Study with Claude" writes a hand-off file into the study folder
 *  (.papernotes/claude/handoff.md: the note, your confused spots with your
 *  own words about them, your stickies and reminders for it) and opens
 *  Claude Code in a terminal there, already pointed at it.
 *
 *  In: the PaperNotes MCP server (desktop/mcp/server.mjs) lets Claude act on
 *  the app: add a reminder, a sticky, a tag, mark something done or
 *  confusing, open a note. While the app is running it never touches
 *  state.json itself; it drops one JSON file per command into
 *  .papernotes/inbox/, and the app applies them here. session.json is how
 *  it knows the app is running and what is on screen. */

import { call } from './bridge.js';
import { encodePath } from '../core/paths.js';
import { today, weekInfo } from '../ui/profile.js';

const HANDOFF = '.papernotes/claude/handoff.md';

/**
 * Write the hand-off and start Claude with it.
 * task: '' (study), 'cards' (make flashcards), 'plan' (plan my week), 'code' (coding beside VS Code)
 * quote: text the user selected and asked about
 * launch(prompt): where Claude runs (side pane, panel or Windows Terminal)
 */
export async function studyWithClaude({ path, state, store, info, toasts, profile, launch, line = null, quote = '', task = '' }) {
  const id = path ? store.lookup(path) : -1;
  const title = id > 0 ? store.titleOf(id) : path ? path.split('/').pop() : '';
  const abs = path ? `${info.notesDir}\\${path.replace(/\//g, '\\')}` : '';
  const marks = path ? state.marksOf(path) : state.allMarks();
  const stickies = path ? state.stickiesOf(path) : [];
  const reminders = state.pendingReminders().filter((r) => !path || r.path === path || !r.path).slice(0, 15);
  const f = profile?.fields || {};

  const lines = [];
  lines.push('# PaperNotes hand-off', '');
  lines.push(`Written by PaperNotes on ${new Date().toLocaleString()}.`);
  lines.push(`My study folder (my "library") is the current directory: ${info.notesDir}`, '');

  if (Object.keys(f).length || profile?.context) {
    lines.push('## About me', '');
    if (f.name) lines.push(`- Name: ${f.name}`);
    if (f.school || f.course) lines.push(`- ${[f.year && `Year ${f.year}`, f.course, f.school && `at ${f.school}`].filter(Boolean).join(' ')}`);
    const w = profile && weekInfo(profile);
    if (f.semester || w) lines.push(`- ${[f.semester && `Semester ${f.semester}`, w && w.long].filter(Boolean).join(', ')} (today is ${new Date().toDateString()})`);
    if (profile?.context) lines.push('', profile.context.trim());
    lines.push('');
  }
  const classes = profile ? today(profile) : [];
  if (classes.length) {
    lines.push("## Today's classes", '');
    for (const c of classes) lines.push(`- ${c.start}–${c.end} ${c.module}${c.type ? ` (${c.type})` : ''}${c.room ? `, ${c.room}` : ''}${c.state === 'now' ? ' ← now' : ''}`);
    lines.push('');
  }
  if (path) {
    lines.push('## What I am studying', '');
    lines.push(`- **${title}**`);
    lines.push(`- File: \`${path}\` (full path: \`${abs}\`)`);
    lines.push(state.isDone(path) ? '- I have marked it as done.' : '- Not marked as done yet.');
    const tags = state.tagsOf(path);
    if (tags.length) lines.push(`- Tags: ${tags.join(', ')}`);
    const cards = state.cardsFor(path).length;
    if (cards) lines.push(`- I already have ${cards} flashcards from it.`);
    lines.push('');
  }
  if (quote) {
    lines.push('## Start here', '');
    lines.push(`I selected this${line !== null && line >= 0 ? ` (around line ${line + 1})` : ''} and asked you about it:`, '', `> ${quote.replace(/\n/g, '\n> ')}`, '');
  } else if (line !== null) {
    const m = marks.find((x) => x.line === line);
    lines.push('## Start here', '');
    lines.push(`I clicked "Ask Claude" on line ${line + 1}${m?.snippet ? `: "${m.snippet}"` : ''}.${m?.note ? ` My note: ${m.note}` : ''}`, '');
  }
  if (marks.length) {
    lines.push(path ? '## Where I am confused (lines are 1-based)' : '## Where I am confused, across all notes', '');
    for (const m of marks.slice(0, 40)) {
      lines.push(`- ${path ? '' : `\`${m.path}\` `}line ${m.line + 1}: "${(m.snippet || '').slice(0, 160)}"${m.note ? `. My note: ${m.note}` : ''}`);
    }
    lines.push('');
  }
  if (stickies.length) {
    lines.push('## My sticky notes on it', '');
    for (const st of stickies) if (st.text?.trim()) lines.push(`- ${st.text.trim().replace(/\n+/g, ' / ')}`);
    lines.push('');
  }
  if (reminders.length) {
    lines.push('## My open reminders', '');
    for (const r of reminders) {
      lines.push(`- ${r.important ? '(important) ' : ''}${r.text}${r.due ? `, due ${new Date(r.due * 1000).toLocaleString()}` : ''}${r.path ? ` [${r.path}]` : ''}`);
    }
    lines.push('');
  }
  const t = state.timeStats();
  if (t.week) lines.push('## How much I have studied', '', `- Today ${Math.round(t.today / 60)} min, this week ${Math.round(t.week / 60)} min, streak ${t.streak} days, ${state.dueCards().length} flashcards due.`, '');

  lines.push('## How to help me', '');
  if (task === 'cards') {
    lines.push(`- Make 10–20 good flashcards from ${path ? 'the note above' : 'my notes'}: one fact or idea each, exam-style questions, short answers, LaTeX in $…$ where it helps.`);
    lines.push('- Add them with the `papernotes_add_flashcards` tool (link them to the note\'s path). If that tool isn\'t available, write them into `My notes/Flashcards - <note title>.md` as lines starting `Q:` and `A:` and tell me to import them.');
    lines.push('- Then quiz me on three of them.');
  } else if (task === 'explain' || task === 'simpler' || task === 'quiz') {
    const how = task === 'quiz'
      ? 'Quiz me on what I selected: three short exam-style questions, one at a time, waiting for each answer and marking it.'
      : task === 'simpler'
        ? 'Explain what I selected as if I were 12: plain words, a concrete everyday analogy, no jargon until the end. Then one quick question to check.'
        : 'Explain what I selected with a worked example (numbers if it is maths), then check I got it with one short question.';
    lines.push(`- ${how}`);
    lines.push('- Keep it short. Then offer to make a flashcard of it with papernotes_add_flashcards.');
  } else if (task === 'code') {
    lines.push('- I am writing code in VS Code for the web (vscode.dev), in a PaperNotes tab right next to you. Help me write, explain and debug it; I will paste code or errors here.');
    lines.push('- Keep answers short and runnable, with the language on every code block.');
    lines.push('- When code is worth keeping, offer to save it as a note in `My notes/` with `papernotes_write_note`: a `#` title, one line on what it does, then the code in a fenced block with its language.');
  } else if (task === 'plan') {
    lines.push('- Look at my reminders, confused spots, progress and timetable (the `papernotes_overview` and `papernotes_profile` tools) and plan my study for the next few days. Add the plan as reminders with times.');
  } else {
    lines.push('- Read the note first. Explain the confused spots (or what I selected) one at a time, simply, with a worked example where it helps, then check I got it with one short question before moving on.');
    lines.push('- Quiz me on the note (exam style, short answers) when I ask, or once the confused spots are done.');
  }
  lines.push('- If the `papernotes` MCP tools are available, use them: reminders for what I should revise next, clear confused marks once I understand them, flashcards for things worth remembering, a sticky with a summary if useful. Ask before changing my notes themselves.');
  lines.push('- Do not edit files in the study folder unless I ask you to.');

  try {
    await call('write', HANDOFF, lines.join('\n'));
    const subject = title ? ` ${title.replace(/"/g, "'")}` : '';
    const prompt = ['explain', 'simpler', 'quiz'].includes(task)
      ? `Read .papernotes/claude/handoff.md: I selected something in${subject || ' my notes'} and want help with it, as that file says.`
      : task === 'cards'
      ? `Read .papernotes/claude/handoff.md and make flashcards from${subject || ' my notes'} as it says.`
      : task === 'plan'
        ? 'Read .papernotes/claude/handoff.md and plan my study as it says.'
      : task === 'code'
        ? 'Read .papernotes/claude/handoff.md: I am coding next to you in VS Code for the web, as that file says. Ask me what I am working on.'
        : path
          ? `Read .papernotes/claude/handoff.md. I am studying${subject} in PaperNotes and want your help. Follow the instructions in that file.`
          : 'Read .papernotes/claude/handoff.md. It has my PaperNotes reminders and confused spots. Help me decide what to study first, then help me study it.';
    await launch(prompt);
  } catch (err) {
    toasts.show({ tone: 'error', text: `Could not start Claude: ${err.message}`, action: { label: 'Settings', run: () => { location.hash = '#/%3Asettings#claude'; } } });
  }
}

/** Apply the commands the MCP server left in .papernotes/inbox. */
export async function applyInbox({ state, router, toasts, store }) {
  let names = [];
  try { names = await call('list', '.papernotes/inbox'); } catch { return 0; }
  let applied = 0;
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    const rel = `.papernotes/inbox/${name}`;
    try {
      const res = await fetch(`content/${encodePath(rel)}`, { cache: 'no-store' });
      const cmd = await res.json();
      if (apply(cmd, { state, router, store })) applied++;
    } catch { /* malformed: dropped */ }
    await call('remove', rel).catch(() => {});
  }
  void toasts;
  return applied;
}

function apply(cmd, { state, router, store }) {
  const exists = (p) => !p || store.lookup(p) > 0;
  switch (cmd.op) {
    case 'addReminder':
      state.addReminder({ text: String(cmd.text || '').slice(0, 300), due: Number(cmd.due) || 0, important: Boolean(cmd.important), path: exists(cmd.path) ? cmd.path || '' : '' });
      return true;
    case 'completeReminder':
      state.updateReminder(cmd.id, { done: true });
      return true;
    case 'addSticky':
      if (!cmd.path || !exists(cmd.path)) return false;
      // Stagger it below any stickies already there, so none hides another.
      state.addSticky(cmd.path, {
        text: String(cmd.text || ''), color: cmd.color || 'blue', line: Number.isInteger(cmd.line) ? cmd.line : -1,
        dy: 28 * state.stickiesOf(cmd.path).length, dx: 9999,
      });
      return true;
    case 'tag':
      if (!exists(cmd.path)) return false;
      if (Boolean(cmd.on) !== state.hasTag(cmd.path, cmd.tag)) state.toggleTag(cmd.path, cmd.tag);
      return true;
    case 'done':
      if (!exists(cmd.path)) return false;
      state.setDone(cmd.path, cmd.done !== false);
      return true;
    case 'mark':
      if (!exists(cmd.path)) return false;
      if (Boolean(cmd.on) !== state.hasMark(cmd.path, cmd.line)) state.toggleMark(cmd.path, cmd.line, cmd.snippet || '');
      return true;
    case 'addCards': {
      let n = 0;
      for (const c of Array.isArray(cmd.cards) ? cmd.cards.slice(0, 200) : []) {
        if (!c?.front || !c?.back) continue;
        state.addCard({ front: String(c.front).slice(0, 2000), back: String(c.back).slice(0, 4000), path: exists(cmd.path) ? cmd.path || '' : '' });
        n++;
      }
      return n > 0;
    }
    case 'open':
      if (!exists(cmd.path)) return false;
      router.go(cmd.path, Number.isInteger(cmd.line) ? { anchor: `L${cmd.line}` } : {});
      return true;
    default:
      return false;
  }
}

/** What's on screen, for the MCP server (and a heartbeat so it knows the
 *  app is running). */
export async function writeSession({ router, tabs, store, editor }) {
  const path = router.current.path;
  const id = path && !path.startsWith(':') ? store.lookup(path) : -1;
  const session = {
    app: 'PaperNotes',
    at: Math.floor(Date.now() / 1000),
    current: id > 0 ? { path, title: store.titleOf(id), editing: editor.active && editor.path === path } : null,
    tabs: tabs.tabs.map((t) => t.path).filter((p) => p && !p.startsWith(':')),
  };
  try { await call('write', '.papernotes/session.json', JSON.stringify(session, null, 1)); } catch { /* not important */ }
}
