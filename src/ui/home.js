/** Home: the first thing you see, and the one place that answers "what
 *  should I do now?". Which week of the semester it is and today's
 *  classes; reminders that are due; flashcards waiting; the spots you
 *  marked as confusing; how long you've studied; where you left off; and
 *  how far each module has got. LilyKnight keeps you company. */

import { icon } from './icons.js';
import { escapeHtml } from './study.js';
import { dueText } from './toolkit.js';
import { toHash } from '../core/paths.js';
import { today, weekInfo } from './profile.js';
import { humanTime } from './focus.js';

const GREETINGS = [
  [5, 'Up early'], [12, 'Good morning'], [17, 'Good afternoon'], [22, 'Good evening'], [24, 'Burning the midnight oil'],
];

export function showHome({ reader, store, state, router, hostInfo, study, profile }) {
  reader._clear();
  reader.currentPath = '';
  reader.inner.dataset.wide = 'true';

  const hour = new Date().getHours();
  const greeting = (GREETINGS.find(([h]) => hour < h) || GREETINGS[3])[1];
  const first = (profile?.fields?.name || '').trim().split(/\s+/)[0];
  const title = (path) => { const id = store.lookup(path); return id > 0 ? store.titleOf(id) : path.split('/').pop(); };
  const link = (path, label, anchor) => `<a href="${toHash(path, anchor)}">${escapeHtml(label)}</a>`;

  const reminders = state.pendingReminders().slice(0, 8);
  const marks = state.allMarks().slice(0, 8);
  const recent = state.data.recent.filter((r) => store.lookup(r.path) > 0).slice(0, 8);
  const due = state.dueCards().length;
  const time = state.timeStats();
  const week = profile ? weekInfo(profile) : null;
  const classes = profile ? today(profile) : [];

  // Progress per module: the folders one level down that hold study files.
  const modules = [];
  for (const top of store.childrenOf(0)) {
    if (store.kind[top] !== 0) continue;
    for (const c of store.childrenOf(top)) {
      if (store.kind[c] !== 0) continue;
      const p = study.progressOf(c);
      if (p.total) modules.push({ id: c, ...p });
    }
  }

  const sub = [
    week?.text,
    reminders.length ? `${reminders.length} to do` : 'nothing due',
    due ? `${due} ${due === 1 ? 'card' : 'cards'} to review` : null,
    time.today ? `${humanTime(time.today)} studied today` : null,
    time.streak > 1 ? `${time.streak}-day streak` : null,
  ].filter(Boolean).join(' · ');

  const el = document.createElement('div');
  el.className = 'home';
  el.innerHTML = `
    ${profile && !profile.exists ? `<div class="home__banner">${icon('info')}<span>Tell PaperNotes who you are and when your semester started: it puts the week number and today's classes here, and Claude gets the context.</span>
      <button class="btn" data-act="profile">Add your details</button><button class="btn btn--ghost" data-act="dismiss">Not now</button></div>` : ''}
    <section class="home__hero">
      <div class="home__hello">
        <p class="home__kicker">${escapeHtml(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}${week ? ` · <b>${escapeHtml(week.text)}</b>` : ''}${profile?.fields?.semester ? ` of semester ${escapeHtml(profile.fields.semester)}` : ''}</p>
        <h1>${greeting}${first ? `, ${escapeHtml(first)}` : ''}.</h1>
        <p class="home__sub">${escapeHtml(sub)}</p>
        <div class="home__actions">
          ${recent[0] ? `<a class="btn" href="${toHash(recent[0].path)}">${icon('arrowRight')}<span>Continue: ${escapeHtml(title(recent[0].path))}</span></a>` : ''}
          ${due ? `<a class="btn btn--secondary" href="#/%3Areview">${icon('book')}<span>Review ${due} ${due === 1 ? 'card' : 'cards'}</span></a>` : ''}
          <button class="btn btn--secondary" data-act="remind">${icon('bell')}<span>New reminder</span></button>
          ${hostInfo ? `<button class="btn btn--secondary" data-act="new">${icon('plus')}<span>New note</span></button>
          <button class="btn btn--secondary" data-act="plan">${icon('sparkle')}<span>Plan with Claude</span></button>` : ''}
        </div>
      </div>
      <img class="home__lily" src="brand/lily.png" alt="LilyKnight, the PaperNotes knight" draggable="false">
    </section>

    <div class="home__grid">
      ${classes.length || profile?.timetable?.length ? `<section class="home__card">
        <h2>${icon('table')} Today</h2>
        ${classes.length ? `<ul class="home__list home__classes">${classes.map((c) => `<li data-state="${c.state}">
            <span class="home__time">${escapeHtml(c.start)}–${escapeHtml(c.end)}</span>
            <span class="home__item"><b>${escapeHtml(c.module)}</b>${c.type ? ` · ${escapeHtml(c.type)}` : ''}</span>
            <span class="home__meta">${c.state === 'now' ? 'now' : escapeHtml(c.room || '')}</span></li>`).join('')}</ul>`
          : '<p class="home__empty">No classes today.</p>'}
        <a class="home__more" href="#/%3Atimetable">Whole week</a>
      </section>` : ''}

      <section class="home__card">
        <h2>${icon('bell')} Reminders</h2>
        ${reminders.length ? `<ul class="home__list">${reminders.map((r) => {
          const d = r.due ? dueText(r.due) : null;
          return `<li data-state="${d?.overdue ? 'overdue' : r.important ? 'important' : ''}">
            <span class="home__item">${r.important ? '<b class="tk-bang">!</b> ' : ''}${r.path ? link(r.path, r.text) : escapeHtml(r.text)}</span>
            ${d ? `<span class="home__meta">${escapeHtml(d.text)}</span>` : ''}</li>`;
        }).join('')}</ul>` : '<p class="home__empty">All clear. Add one with the bell on any note.</p>'}
      </section>

      <section class="home__card">
        <h2><i class="tk-reddot"></i> Confused about</h2>
        ${marks.length ? `<ul class="home__list">${marks.map((m) => `<li>
            <span class="home__item">${link(m.path, (m.note || m.snippet || `Line ${m.line + 1}`).slice(0, 110), `L${m.line}`)}</span>
            <span class="home__meta">${escapeHtml(title(m.path))}</span></li>`).join('')}</ul>`
          : '<p class="home__empty">Nothing marked. In a note, hover the left edge of a paragraph and click the dot.</p>'}
      </section>

      <section class="home__card">
        <h2>${icon('history')} Study time</h2>
        <div class="home__stats">
          <div><b>${humanTime(time.today)}</b><span>today</span></div>
          <div><b>${humanTime(time.week)}</b><span>last 7 days</span></div>
          <div><b>${time.streak}</b><span>day streak</span></div>
          <div><b>${time.focusToday}</b><span>focus sessions</span></div>
        </div>
        <div class="home__spark" title="Minutes per day, last 7 days">${time.perDay.map((d) => {
          const max = Math.max(1, ...time.perDay.map((x) => x.seconds));
          return `<i style="height:${Math.max(4, Math.round((d.seconds / max) * 100))}%" title="${d.day}: ${humanTime(d.seconds)}"></i>`;
        }).join('')}</div>
        <p class="home__empty">Counted while PaperNotes is in front and you're active. The Focus timer is bottom right.</p>
      </section>

      <section class="home__card">
        <h2>${icon('history')} Recently opened</h2>
        ${recent.length ? `<ul class="home__list">${recent.map((r) => `<li>
            <span class="home__item">${link(r.path, title(r.path))}</span>
            <span class="home__meta">${escapeHtml(r.path.split('/').slice(0, -1).slice(-1)[0] || '')}</span></li>`).join('')}</ul>`
          : '<p class="home__empty">Open something from the tree on the left.</p>'}
      </section>

      <section class="home__card">
        <h2>${icon('progress')} Progress</h2>
        ${modules.length ? `<ul class="home__progress">${modules.slice(0, 10).map((m) => {
          const pct = Math.round((m.done / m.total) * 100);
          return `<li><a href="${toHash(store.pathOf(m.id))}"><span>${escapeHtml(store.nameOf(m.id))}</span><span class="home__meta">${m.done}/${m.total}</span>
            <span class="home__bar"><i style="width:${pct}%"></i></span></a></li>`;
        }).join('')}</ul>` : '<p class="home__empty">Nothing to track yet.</p>'}
      </section>
    </div>

    <p class="home__foot">${(store.totals?.notes ?? 0).toLocaleString()} notes · ${(store.totals?.files ?? 0).toLocaleString()} files${hostInfo?.notesDir ? ` · <span class="mono">${escapeHtml(hostInfo.notesDir)}</span>` : ''}</p>`;

  el.querySelector('[data-act="remind"]').onclick = () => study.addReminder(null);
  el.querySelector('[data-act="new"]')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('papernotes:new-note')));
  el.querySelector('[data-act="plan"]')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('papernotes:claude', { detail: { task: 'plan' } })));
  el.querySelector('[data-act="profile"]')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('papernotes:profile')));
  el.querySelector('[data-act="dismiss"]')?.addEventListener('click', () => {
    el.querySelector('.home__banner')?.remove();
    state.data.profileLater = Math.floor(Date.now() / 1000);
    state.flush();
  });
  if (state.data.profileLater) el.querySelector('.home__banner')?.remove();

  const sheet = document.createElement('div');
  sheet.className = 'reader__sheet reader__sheet--home';
  sheet.appendChild(el);
  reader.inner.appendChild(sheet);
  reader.wrap.scrollTop = 0;
  reader.headings = [];
  reader._emitHeadings();
  void router;
}
