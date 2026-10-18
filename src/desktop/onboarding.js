/** First run: no library yet. PaperNotes doesn't ship or own any notes; it
 *  opens a folder (your "library") and remembers it. You can:
 *    - open the PaperNotes folder already in Documents, if there is one
 *    - create a new library (Documents\PaperNotes by default, anywhere you like)
 *    - open any folder you already have
 *  A new library gets starter files and asks for your details (optional)
 *  once it opens. */

import { call } from './bridge.js';
import { icon } from '../ui/icons.js';

export async function runOnboarding(app, info) {
  const suggestion = info.suggested || '';
  const docs = info.docs || '';
  const defaultNew = `${docs}\\${suggestion ? 'PaperNotes Library' : 'PaperNotes'}`;
  app.innerHTML = `
    <div class="onboard">
      <div class="onboard__card">
        <img class="onboard__logo" src="brand/logo.png" alt="" draggable="false">
        <h1>Welcome to PaperNotes</h1>
        <p class="onboard__lead">PaperNotes works on a <b>library</b>: one folder with your notes, slides and past papers, in any folders you like.
          It reads them as they are, never moves anything, and keeps what it remembers (tags, progress, reminders, flashcards)
          in a hidden <code>.papernotes</code> folder inside.</p>
        ${info.missing ? `<p class="onboard__warn">${icon('alert')}<span>Your library at <span class="mono">${escape(info.missing)}</span> isn't there any more. Pick it again or choose another.</span></p>` : ''}
        <div class="onboard__actions">
          ${suggestion ? `<button class="btn onboard__big" data-act="suggested">${icon('folder')}<span><span>Open <b>${escape(suggestion.split('\\').pop())}</b></span><small>${escape(suggestion)}</small></span></button>` : ''}
          <div class="onboard__create">
            <button class="btn ${suggestion ? 'btn--secondary' : ''} onboard__big" data-act="create">${icon('plus')}<span><span>Create a new library</span><small class="onboard__path">${escape(defaultNew)}</small></span></button>
            <button class="btn btn--ghost" data-act="where">Somewhere else…</button>
          </div>
          <button class="btn btn--secondary onboard__big" data-act="pick">${icon('folderOpenAlt')}<span><span>Open a folder I already have…</span><small>Any folder on this PC</small></span></button>
        </div>
        <p class="onboard__note">You can switch libraries later in Settings → Study folder.</p>
      </div>
      <img class="onboard__lily" src="brand/lily.png" alt="" draggable="false">
    </div>`;

  let target = defaultNew;
  const pathEl = app.querySelector('.onboard__path');
  return new Promise(() => {
    app.querySelector('[data-act="pick"]').onclick = () => call('pickFolder');   // the host reloads the app when one is chosen
    app.querySelector('[data-act="suggested"]')?.addEventListener('click', () => call('useFolder', suggestion));
    app.querySelector('[data-act="create"]').onclick = () => call('createLibrary', target);
    app.querySelector('[data-act="where"]').onclick = async () => {
      const parent = await call('pickParent');
      if (!parent) return;
      target = `${parent.replace(/\\$/, '')}\\PaperNotes`;
      pathEl.textContent = target;
    };
  });
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
