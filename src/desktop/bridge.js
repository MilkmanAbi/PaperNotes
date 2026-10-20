/** The line to the native host (desktop/papernotes.cpp).
 *
 *  A request is one string, "id\x1Fcmd\x1Farg…", because a delimited string
 *  is all the host has to parse; the answer comes back as JSON with the same
 *  id. Messages without an id are events: the notes folder changed, or the
 *  window wants to close with unsaved work. */

const view = window.chrome?.webview;

export const isDesktop = Boolean(view);

/** 0 in the main window; 1, 2… in a window popped out of it (index.html?window=N).
 *  A popped-out page numbers its requests from N × 10^9, which is how the
 *  host knows which window to answer. */
export const windowNumber = Number(new URLSearchParams(location.search).get('window')) || 0;

let seq = windowNumber * 1e9;
const pending = new Map();
const listeners = new Set();

if (view) {
  view.addEventListener('message', (e) => {
    const m = e.data;
    // Events first: terminal output carries its terminal's id too.
    if (m && m.event) {
      for (const fn of listeners) fn(m);
    } else if (m && m.id !== undefined) {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m.result);
      else p.reject(new Error(m.error || 'The app could not do that.'));
    }
  });
}

export function call(cmd, ...args) {
  if (!view) return Promise.reject(new Error('Not running in the desktop app'));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    view.postMessage([id, cmd, ...args.map((a) => (a === undefined || a === null ? '' : String(a)))].join('\x1F'));
  });
}

export function onEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A native context menu. Items: { id, label, disabled, checked, children }
 *  or '-' for a line; an item with children is a submenu. Resolves to the
 *  chosen id, or 0 when the menu was dismissed. */
export async function nativeMenu(items, point = null) {
  const dpr = window.devicePixelRatio || 1;
  const x = point ? Math.round(point.x * dpr) : -1;
  const y = point ? Math.round(point.y * dpr) : -1;
  const encoded = [];
  let subId = 60000;
  const add = (list, parent) => {
    for (const it of list) {
      if (it === '-') { encoded.push(`0\x1E\x1E-\x1E${parent}`); continue; }
      // "&" marks a menu mnemonic in Win32, so a literal one is doubled.
      const label = it.label.replace(/&/g, '&&');
      if (it.children) {
        const id = ++subId;
        encoded.push(`${id}\x1E${label}\x1Em\x1E${parent}`);
        add(it.children, id);
      } else {
        encoded.push(`${it.id}\x1E${label}\x1E${it.disabled ? 'd' : ''}${it.checked ? 'c' : ''}\x1E${parent}`);
      }
    }
  };
  add(items, 0);
  return Number(await call('menu', x, y, ...encoded));
}
