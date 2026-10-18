// Sends one bridge command to the running app the way the page does, and
// prints the host's answer.   node call.mjs <cmd> [args...]
const [cmd, ...args] = process.argv.slice(2);
const payload = JSON.stringify([cmd, ...args]);
const expr = `new Promise((resolve) => {
  const [cmd, ...args] = ${payload};
  const id = 900000 + Math.floor(Math.random() * 99999);
  const h = (e) => { if (e.data && e.data.id === id) { chrome.webview.removeEventListener('message', h); resolve(e.data); } };
  chrome.webview.addEventListener('message', h);
  chrome.webview.postMessage([id, cmd, ...args].join(String.fromCharCode(31)));
})`;
const { spawnSync } = await import('node:child_process');
const r = spawnSync(process.execPath, [new URL('./cdp.mjs', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), expr], { encoding: 'utf8' });
process.stdout.write(r.stdout + r.stderr);
