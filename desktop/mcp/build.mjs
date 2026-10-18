// Bundles the MCP server into one dependency-free file, so the installed
// app needs only Node.js to run it (no node_modules).
//   node desktop/mcp/build.mjs
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, 'server.src.mjs')],
  outfile: path.join(here, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: false,
  legalComments: 'eof',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
console.log('built desktop/mcp/server.mjs');
