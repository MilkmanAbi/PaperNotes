/** Menus: the Windows one in the app (it follows the theme, has real
 *  keyboard handling and submenus), a lookalike in the browser. Same item
 *  format either way: { id, label, disabled, checked, children } or '-'.
 *  Resolves to the chosen id, or 0. */

import { isDesktop, nativeMenu } from '../desktop/bridge.js';
import { showPopover, closePopover } from './popover.js';
import { icon } from './icons.js';

export function menu(items, point = null) {
  if (isDesktop) return nativeMenu(items, point);
  return new Promise((resolve) => {
    let chosen = 0;
    const build = (list) => {
      const ul = document.createElement('div');
      ul.className = 'htmlmenu';
      for (const it of list) {
        if (it === '-') { ul.appendChild(Object.assign(document.createElement('hr'), { className: 'htmlmenu__sep' })); continue; }
        const b = document.createElement('button');
        b.className = 'htmlmenu__item';
        b.disabled = Boolean(it.disabled);
        const [label, key] = it.label.split('\t');
        b.innerHTML = `<span class="htmlmenu__check">${it.checked ? icon('check') : ''}</span><span class="htmlmenu__label"></span><span class="htmlmenu__key"></span>`;
        b.querySelector('.htmlmenu__label').textContent = label;   // labels can quote the selection
        b.querySelector('.htmlmenu__key').textContent = key || (it.children ? '›' : '');
        if (it.children) {
          const sub = build(it.children);
          sub.classList.add('htmlmenu--sub');
          b.appendChild(sub);
        } else {
          b.onclick = () => { chosen = it.id; closePopover(); };
        }
        ul.appendChild(b);
      }
      return ul;
    };
    showPopover(build(items), { x: point?.x ?? 100, y: point?.y ?? 100, cls: 'popover--menu', onClose: () => resolve(chosen) });
  });
}
