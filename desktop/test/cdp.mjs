// Evaluates JavaScript inside the running PaperNotes window, through the
// DevTools port the app opens when started with
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333
//   node desktop/test/cdp.mjs "<expression>"     (awaited; the result is printed as JSON)
const port = process.env.CDP_PORT || 9333;
const expr = process.argv[2] || 'document.title';
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(async () => (${expr}))()`, awaitPromise: true, returnByValue: true } }));
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id !== 1) return;
  const r = m.result?.result;
  if (m.result?.exceptionDetails) console.log('EXCEPTION', JSON.stringify(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text));
  else console.log(JSON.stringify(r?.value, null, 1));
  ws.close();
  process.exit(0);
});
