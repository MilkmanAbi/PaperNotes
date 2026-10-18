/** Asking for a name (new note, new folder, rename).
 *
 *  Windows has no stock text-input dialog, so this one is drawn by the page,
 *  in the app's own style, and behaves like the native ones: Enter accepts,
 *  Escape cancels, a click outside cancels, focus goes back where it was. */

import { icon } from './icons.js';

const BAD = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

export function checkName(name) {
  const n = name.trim();
  if (!n) return 'A name is needed.';
  if (BAD.test(n)) return 'Names can’t contain < > : " / \\ | ? or *.';
  if (RESERVED.test(n)) return 'Windows reserves that name.';
  if (/[. ]$/.test(n)) return 'Names can’t end with a dot or a space.';
  if (n.startsWith('.')) return 'Names starting with a dot are hidden from the tree.';
  return null;
}

/**
 * @returns {Promise<string|null>} the trimmed name, or null when cancelled
 */
export function askName({ title, label = 'Name', value = '', action = 'Create', selectBase = true }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const scrim = document.createElement('div');
    scrim.className = 'dialog-scrim';
    scrim.innerHTML = `
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title" class="dialog__title"></h2>
        <label class="dialog__label"><span></span><input type="text" spellcheck="false" autocomplete="off"></label>
        <p class="dialog__error" role="alert" hidden>${icon('alert')}<span></span></p>
        <div class="dialog__actions">
          <button type="button" class="btn btn--secondary" data-act="cancel">Cancel</button>
          <button type="submit" class="btn"></button>
        </div>
      </form>`;
    const form = scrim.querySelector('form');
    const input = scrim.querySelector('input');
    const error = scrim.querySelector('.dialog__error');
    scrim.querySelector('.dialog__title').textContent = title;
    scrim.querySelector('.dialog__label span').textContent = label;
    scrim.querySelector('button[type="submit"]').textContent = action;
    input.value = value;

    const close = (result) => {
      scrim.remove();
      before?.focus?.();
      resolve(result);
    };
    const showError = (msg) => {
      error.hidden = !msg;
      error.querySelector('span').textContent = msg || '';
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const problem = checkName(input.value);
      if (problem) { showError(problem); input.focus(); return; }
      close(input.value.trim());
    });
    input.addEventListener('input', () => showError(null));
    scrim.querySelector('[data-act="cancel"]').onclick = () => close(null);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(null); });
    scrim.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
    });

    document.body.appendChild(scrim);
    input.focus();
    // Select the name without its extension, the way Explorer's rename does.
    const dot = value.lastIndexOf('.');
    if (selectBase && dot > 0) input.setSelectionRange(0, dot);
    else input.select();
  });
}

/**
 * A small form in the same style. fields: [{ name, label, type: 'text' |
 * 'textarea' | 'datetime' | 'checkbox' | 'select', value, options, placeholder }]
 * @returns {Promise<object|null>} the values by name, or null when cancelled
 */
export function askForm({ title, fields, action = 'Save', danger = null }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const scrim = document.createElement('div');
    scrim.className = 'dialog-scrim';
    const form = document.createElement('form');
    form.className = 'dialog dialog--form';
    form.setAttribute('role', 'dialog');
    form.setAttribute('aria-modal', 'true');
    const h = document.createElement('h2');
    h.className = 'dialog__title';
    h.textContent = title;
    form.appendChild(h);

    const inputs = {};
    for (const f of fields) {
      const label = document.createElement('label');
      label.className = f.type === 'checkbox' ? 'dialog__check' : 'dialog__label';
      let input;
      if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = f.rows || 3;
      } else if (f.type === 'select') {
        input = document.createElement('select');
        for (const o of f.options) {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          input.appendChild(opt);
        }
      } else {
        input = document.createElement('input');
        input.type = f.type === 'datetime' ? 'datetime-local' : f.type || 'text';
        input.autocomplete = 'off';
      }
      if (f.type === 'checkbox') input.checked = Boolean(f.value);
      else if (f.value !== undefined) input.value = f.value;
      if (f.placeholder) input.placeholder = f.placeholder;
      const span = document.createElement('span');
      span.textContent = f.label;
      if (f.type === 'checkbox') label.append(input, span); else label.append(span, input);
      form.appendChild(label);
      inputs[f.name] = input;
    }

    const actions = document.createElement('div');
    actions.className = 'dialog__actions';
    if (danger) {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'btn btn--ghost dialog__danger';
      d.textContent = danger;
      d.onclick = () => close({ __danger: true });
      actions.appendChild(d);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--secondary';
    cancel.textContent = 'Cancel';
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'btn';
    ok.textContent = action;
    actions.append(cancel, ok);
    form.appendChild(actions);
    scrim.appendChild(form);

    const close = (result) => { scrim.remove(); before?.focus?.(); resolve(result); };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      for (const [name, input] of Object.entries(inputs)) out[name] = input.type === 'checkbox' ? input.checked : input.value;
      close(out);
    });
    cancel.onclick = () => close(null);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(null); });
    scrim.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); form.requestSubmit(); }
    });
    document.body.appendChild(scrim);
    Object.values(inputs)[0]?.focus();
  });
}

/** A yes/no question, for the website (the app uses Windows' own dialogs). */
export function askConfirm({ title, text = '', action = 'OK' }) {
  return askForm({ title, fields: [], action }).then((r) => {
    void text;
    return Boolean(r);
  });
}
