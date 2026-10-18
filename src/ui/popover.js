/** A light popover anchored to a button or a point: the tag picker, the
 *  sticky colour menu. Closes on Escape, on a click outside, or when the
 *  window loses focus; focus goes back to where it was. */

let open = null;

export function closePopover() {
  if (open) { open.close(); open = null; }
}

/**
 * @param {HTMLElement} content
 * @param {{ anchor?: Element, x?: number, y?: number, onClose?: Function, cls?: string }} at
 */
export function showPopover(content, { anchor, x, y, onClose, cls = '' } = {}) {
  closePopover();
  const before = document.activeElement;
  const el = document.createElement('div');
  el.className = `popover ${cls}`.trim();
  el.setAttribute('role', 'dialog');
  el.appendChild(content);
  document.body.appendChild(el);

  // Below the anchor, kept inside the window.
  const r = anchor ? anchor.getBoundingClientRect() : { left: x, right: x, bottom: y, top: y };
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - w - 8);
  let top = r.bottom + 4;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  left = Math.max(8, left);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;

  const onDown = (e) => { if (!el.contains(e.target) && !anchor?.contains(e.target)) handle.close(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); handle.close(); } };
  const onBlur = () => handle.close();
  const handle = {
    el,
    close() {
      if (!el.isConnected) return;
      el.remove();
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
      if (open === handle) open = null;
      onClose?.();
      if (document.activeElement === document.body) before?.focus?.();
    },
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
  });
  open = handle;
  el.querySelector('input, button')?.focus();
  return handle;
}
