/** URL and path helpers.
 *
 *  Two things bite on GitHub Pages and both are handled here: the site can
 *  live under any sub-path, and note paths routinely contain spaces, commas
 *  and non-ASCII characters that must be encoded per segment — encoding the
 *  whole path would eat the slashes. */

/** Resolve a site-relative asset path against wherever the page is served. */
export function assetUrl(relative) {
  return new URL(relative.replace(/^\//, ''), document.baseURI).href;
}

/** Encode a content path for fetching, leaving separators intact. */
export function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function decodeHashPath(hash) {
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return '';
  const [pathPart] = raw.split('#');
  try {
    return pathPart.split('/').map(decodeURIComponent).join('/');
  } catch {
    return pathPart;
  }
}

export function toHash(path, anchor) {
  const encoded = encodePath(path);
  return `#/${encoded}${anchor ? `#${anchor}` : ''}`;
}

export function dirname(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function basename(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

/** Resolve "../b.md" against the directory of the note that linked to it. */
export function resolveRelative(fromDir, target) {
  if (/^([a-z]+:)?\/\//i.test(target) || target.startsWith('#') ||
      target.startsWith('mailto:') || target.startsWith('data:')) return null;
  const base = target.startsWith('/') ? [] : fromDir.split('/').filter(Boolean);
  const parts = target.replace(/^\//, '').split('/');
  const out = [...base];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

export function humanBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function humanCount(n) {
  return n.toLocaleString(undefined);
}

export function humanDate(seconds) {
  if (!seconds) return '';
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}
