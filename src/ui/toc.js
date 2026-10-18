/** Table of contents for the open note.
 *
 *  A panel, so it is docked and holds a column; it does not float over the
 *  reader and it does not close when you click away (§4). The active
 *  heading is tracked with an IntersectionObserver so that scrolling
 *  updates only this panel — the reader is not re-rendered, and nothing
 *  else on screen moves (PI §2.1). */

export class Toc {
  constructor({ mount, router }) {
    this.router = router;
    this.el = document.createElement('nav');
    this.el.className = 'toc scroll';
    this.el.setAttribute('aria-label', 'On this page');
    mount.appendChild(this.el);
    this._observer = null;
    this._links = new Map();
  }

  set(headings, scope) {
    this._observer?.disconnect();
    this._links.clear();
    this.el.replaceChildren();

    const usable = headings.filter((h) => h.level >= 2 && h.level <= 4);
    if (!usable.length) {
      const p = document.createElement('p');
      p.className = 'tree__empty caption';
      p.textContent = headings.length
        ? 'Only one heading in this note.'
        : 'This note has no headings.';
      this.el.appendChild(p);
      return;
    }

    for (const h of usable) {
      const a = document.createElement('a');
      a.href = `#${h.slug}`;
      a.dataset.level = String(h.level);
      a.textContent = h.text.replace(/[#*`_]/g, '');
      a.title = h.text;
      a.onclick = (e) => {
        e.preventDefault();
        const target = scope?.querySelector(`#${CSS.escape(h.slug)}`);
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        this._setActive(h.slug);
      };
      this.el.appendChild(a);
      this._links.set(h.slug, a);
    }

    if (!scope) return;
    this._observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) this._setActive(visible[0].target.id);
    }, { rootMargin: '0px 0px -72% 0px', threshold: 0 });

    for (const slug of this._links.keys()) {
      const target = scope.querySelector(`#${CSS.escape(slug)}`);
      if (target) this._observer.observe(target);
    }
  }

  _setActive(slug) {
    for (const [key, link] of this._links) {
      link.dataset.active = String(key === slug);
    }
  }
}
