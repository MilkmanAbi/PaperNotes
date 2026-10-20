/** What a rendered note gets after it is on screen:
 *
 *  - a Copy button on every code block
 *  - diagrams: ```mermaid, and the easy ```tree and ```flow (ui/diagrams.js)
 *  - Run on ```html run / ```js run blocks: the code runs in a sandboxed
 *    frame under the block (scripts, no access to the app or your files);
 *    ```html live runs straight away
 *  - ![[embeds]] filled in (ui/embeds.js) and a preview card when you hover
 *    a link to another note (ui/preview.js)
 *  - #tags that search when clicked
 *  - click an image to see it full size
 *  - selecting maths copies its LaTeX (KaTeX's copy-tex)
 *
 *  `ctx` says where the note lives and how to reach other notes (see
 *  Reader.enhanceContext). Without it, a note still gets everything that
 *  needs nothing outside itself. */

import 'katex/contrib/copy-tex';
import { icon } from './icons.js';
import { drawDiagrams } from './diagrams.js';
import { resolveEmbeds } from './embeds.js';
import { linkPreviews } from './preview.js';

function dark() {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
}

export function enhance(root, ctx = {}) {
  if (!root) return;
  const full = { ...ctx, enhance };
  copyButtons(root);
  zoomImages(root);
  runBlocks(root, full);
  hashtags(root, full);
  if (full.resolveWiki && full.fetchText) {
    resolveEmbeds(root, full).then(() => drawDiagrams(root, full));
    if (full.preview !== false) linkPreviews(root, full);
  } else {
    drawDiagrams(root, full);
  }
}

function hashtags(root, ctx) {
  if (root.dataset.tags || !ctx.search) return;
  root.dataset.tags = '1';
  const go = (el) => ctx.search(el.dataset.tag);
  root.addEventListener('click', (e) => { const t = e.target.closest('.hashtag'); if (t) { e.preventDefault(); go(t); } });
  root.addEventListener('keydown', (e) => { const t = e.target.closest?.('.hashtag'); if (t && e.key === 'Enter') go(t); });
}

function copyButtons(root) {
  for (const pre of root.querySelectorAll('pre')) {
    if (pre.querySelector('.copy-btn') || pre.closest('.mermaid-block, .pn-diagram') || pre.classList.contains('nb-out')) continue;
    const b = document.createElement('button');
    b.className = 'copy-btn';
    b.type = 'button';
    b.title = 'Copy';
    b.setAttribute('aria-label', 'Copy code');
    b.innerHTML = icon('file');
    b.onclick = () => {
      const code = pre.querySelector('code')?.innerText ?? pre.innerText;
      navigator.clipboard.writeText(code).then(() => {
        b.innerHTML = icon('check');
        b.classList.add('is-done');
        setTimeout(() => { b.innerHTML = icon('file'); b.classList.remove('is-done'); }, 1200);
      });
    };
    pre.appendChild(b);
  }
}

function zoomImages(root) {
  for (const img of root.querySelectorAll('img')) {
    if (img.closest('a') || img.dataset.zoom) continue;
    img.dataset.zoom = '1';
    img.addEventListener('click', () => {
      const box = document.createElement('div');
      box.className = 'lightbox';
      const big = document.createElement('img');
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      box.appendChild(big);
      if (img.alt) { const c = document.createElement('p'); c.textContent = img.alt; box.appendChild(c); }
      const close = () => { box.remove(); document.removeEventListener('keydown', esc, true); };
      const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
      box.onclick = close;
      document.addEventListener('keydown', esc, true);
      document.body.appendChild(box);
    });
  }
}

// ── runnable code ──────────────────────────────────────────────────────
const frames = new Map();   // contentWindow -> iframe, for height reports
window.addEventListener('message', (e) => {
  const f = frames.get(e.source);
  if (f && e.data && typeof e.data.pnHeight === 'number') f.style.height = `${Math.min(900, Math.max(40, e.data.pnHeight + 4))}px`;
});

function srcdoc(kind, code) {
  const d = dark();
  const fg = d ? '#e8e4dc' : '#25221e';
  const bg = d ? '#1c1a17' : '#fbfaf6';
  const base = `<meta charset="utf-8"><style>html{color-scheme:${d ? 'dark' : 'light'}}body{margin:8px;font:13px/1.45 "Cascadia Mono",Consolas,monospace;color:${fg};background:${bg}}.l{white-space:pre-wrap;border-bottom:1px solid ${d ? '#33302b' : '#ebe7df'};padding:2px 0}.e{color:#e5484d}.w{color:#c49500}</style>`;
  const report = '<script>new ResizeObserver(()=>parent.postMessage({pnHeight:document.documentElement.scrollHeight},"*")).observe(document.documentElement);</' + 'script>';
  if (kind === 'html') return base.replace(/body\{[^}]*\}/, `body{margin:8px;font:14px/1.5 system-ui,sans-serif;color:${fg};background:${bg}}`) + code + report;
  const shim = `<script>
const out=(t,c)=>{const d=document.createElement('div');d.className='l '+(c||'');d.textContent=t;document.body.appendChild(d)};
const fmt=(x)=>{try{return typeof x==='object'&&x!==null?JSON.stringify(x,null,1):String(x)}catch{return String(x)}};
for(const k of ['log','info','debug','warn','error','table'])console[k]=(...a)=>out(a.map(fmt).join(' '),k==='error'?'e':k==='warn'?'w':'');
addEventListener('error',(e)=>out(e.message,'e'));
addEventListener('unhandledrejection',(e)=>out('Unhandled: '+fmt(e.reason),'e'));
</` + 'script>';
  const body = `<script>try{${code.replace(/<\/script/gi, '<\\/script')}\n}catch(e){out(e.name+': '+e.message,'e')}</` + 'script>';
  // An explicit <body> first: scripts in the head would run before there
  // is a body to print into.
  return `${base}<body>${shim}${body}${report}`;
}

function runBlocks(root, ctx = {}) {
  for (const block of root.querySelectorAll('.runblock')) {
    if (block.dataset.ready) continue;
    block.dataset.ready = '1';
    const code = decodeURIComponent(block.dataset.code || '');
    const kind = block.dataset.kind;
    const bar = document.createElement('div');
    bar.className = 'runblock__bar';
    bar.innerHTML = `<button class="btn btn--secondary runblock__run">${icon('arrowRight')}<span>Run</span></button>
      <span class="caption">${kind === 'html' ? 'HTML, CSS and JavaScript' : 'JavaScript'} · runs in a sandbox</span>`;
    block.appendChild(bar);
    const run = () => {
      block.querySelector('.runblock__out')?.remove();
      const f = document.createElement('iframe');
      f.className = 'runblock__out';
      f.setAttribute('sandbox', 'allow-scripts allow-modals');
      f.title = 'Output';
      f.srcdoc = srcdoc(kind, code);
      block.appendChild(f);
      frames.set(f.contentWindow, f);
      f.addEventListener('load', () => frames.set(f.contentWindow, f));
      bar.querySelector('span').textContent = 'Run again';
    };
    bar.querySelector('.runblock__run').onclick = run;
    // ```html live runs on its own, except in a hover preview, which is only a glance.
    if (block.dataset.auto === 'true' && ctx.autoRun !== false) run();
  }
}
