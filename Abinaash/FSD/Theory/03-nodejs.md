---
title: Node.js — JavaScript on the Server
emoji: (・_・)
order: 3
blurb: The runtime, the event loop, npm and package.json, CommonJS vs ESM, core modules, and environment variables. The 'N' in MERN.
---

# Node.js — JavaScript on the Server (・_・)

> JavaScript was born trapped in the browser. Node.js is the jailbreak. In 2009 Ryan Dahl took Chrome's V8 engine, bolted on file and network access, and suddenly JS could run *anywhere* — including on servers. That one move is why MERN exists.

Node is the **runtime**: the program that runs your backend JavaScript. Express runs *inside* Node. When you type `node server.js`, Node is what's executing it.

---

## 1. What Node actually is

- **V8** — Google's JavaScript engine (the same one in Chrome). It compiles and runs JS *fast*.
- Node wraps V8 and adds the things a browser deliberately *doesn't* let JS do: read/write files, open network sockets, spawn processes, access environment variables. Browser JS can't touch your filesystem (for good security reasons); server JS must.
- So the language is identical; the *capabilities* differ. `document` and `window` don't exist in Node (no webpage). `fs`, `process`, and `http` don't exist in the browser. Same JS, different toys in the box.

Check your version:

```bash
node --version     # v24.x.x  (Active LTS — what you want)
npm --version      # comes bundled with Node
```

---

## 2. Install Node the right way: use a version manager

Don't install Node from the website and forget it. Different projects need different versions. Use a **version manager**:

- **nvm** (Node Version Manager) on macOS/Linux, or **nvm-windows** / **fnm** on Windows.

```bash
nvm install 24        # install Node 24 (current LTS)
nvm use 24            # switch this shell to it
nvm alias default 24  # make 24 the default
```

For a coursework project, **always develop on an LTS version** (even-numbered, "Active LTS"). Node 24 is the safe pick in 2026. Avoid odd/"Current" versions for anything you're graded on — they're for testing new features, not stability.

---

## 3. Running JavaScript with Node

```bash
node                 # opens the REPL (interactive, like a JS calculator)
node app.js          # run a file
node --watch app.js  # run and auto-restart on file changes (built-in since Node 18)
```

`--watch` is great for backend dev — save the file, the server restarts. (You may also see the classic tool **nodemon** in tutorials; `--watch` is the built-in modern equivalent, one less dependency.)

The simplest possible server, no Express, just to prove Node can:

```js
import { createServer } from "node:http";

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello from Node!");
});

server.listen(3000, () => console.log("Listening on http://localhost:3000"));
```

Run it, visit `localhost:3000`, and you've built a web server in 6 lines. Express is a nicer wrapper around exactly this.

---

## 4. npm and package.json — the heart of a Node project

**npm** (Node Package Manager) does two jobs: installs libraries from the npm registry, and runs your project scripts. Every Node project has a **`package.json`** — the project's ID card and dependency list.

Create one:

```bash
npm init -y          # -y accepts all defaults, makes a basic package.json
```

A typical `package.json`:

```json
{
  "name": "my-api",
  "version": "1.0.0",
  "type": "module",               // ← use ES Modules (import/export)
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^5.2.0",
    "mongoose": "^9.8.0"
  },
  "devDependencies": {
    "eslint": "^9.0.0"
  }
}
```

Key fields:
- **`"type": "module"`** — makes `import`/`export` the default (instead of old `require`). Set this and life is modern. Without it, Node treats `.js` files as CommonJS.
- **`scripts`** — named commands. Run with `npm run dev`. `start` and `test` are special (`npm start`, no `run` needed).
- **`dependencies`** — packages your app needs to *run*.
- **`devDependencies`** — packages you only need while *developing* (linters, test tools). Installed with `npm install <pkg> --save-dev` (or `-D`).

---

## 5. Installing and the `node_modules` / lockfile situation

```bash
npm install express          # add a dependency (updates package.json)
npm install eslint -D        # add a dev dependency
npm install                  # install everything listed in package.json
npm uninstall express        # remove one
```

What appears:
- **`node_modules/`** — the actual downloaded package code. **Huge. Never commit this to Git.** Put it in `.gitignore`.
- **`package-lock.json`** — records the *exact* versions installed, so everyone (and the deploy server) gets the identical dependency tree. **Do commit this.**

The mental model: `package.json` says "I want express version 5-ish"; `package-lock.json` says "here is the exact version 5.2.0 and every one of its sub-dependencies I actually resolved." When you clone someone's repo, you `npm install` and npm rebuilds `node_modules` from the lockfile. That's why the folder is gitignored — it's regenerable.

Version ranges in `package.json`:
- `^5.2.0` — allow minor+patch updates (5.x.x), not a new major. **The common default.**
- `~5.2.0` — allow patch updates only (5.2.x).
- `5.2.0` — exactly this, no updates.

---

## 6. CommonJS vs ES Modules — the one confusing thing about Node

Node historically used **CommonJS**:

```js
// CommonJS (old, still everywhere)
const express = require("express");     // import
module.exports = myFunction;            // export
```

Modern Node + everything in React uses **ES Modules**:

```js
// ES Modules (modern — use this)
import express from "express";          // import
export default myFunction;              // export
```

To use ESM in Node, set **`"type": "module"`** in `package.json` (or name files `.mjs`). Then `import`/`export` work just like in chapter 02.

Why care? You'll follow a tutorial using `require`, mix it with `import`, and get `SyntaxError: Cannot use import statement outside a module` or `require is not defined`. Now you know: pick one (ESM), set `"type": "module"`, and be consistent. When copying from an old tutorial, mentally translate `const x = require("y")` → `import x from "y"`.

---

## 7. Core modules — batteries included

Node ships with modules you don't install. Import with the `node:` prefix (clarifies it's built-in):

```js
import { readFile, writeFile } from "node:fs/promises"; // files (promise API)
import path from "node:path";                           // build file paths safely
import os from "node:os";                                // OS info
import crypto from "node:crypto";                        // hashing, random bytes
import { createServer } from "node:http";                // raw HTTP server
```

The ones you'll actually touch in this module: `fs/promises` (occasionally, for reading files), `path` (joining paths cross-platform — never hand-glue strings with `/`), and `crypto` (indirectly, via auth libraries). Express and Mongoose hide most of the rest.

```js
// path: do this, not string concatenation
import path from "node:path";
const full = path.join(process.cwd(), "uploads", "photo.png");
// works on Windows (\) and Unix (/) without you thinking about it
```

---

## 8. The event loop — why Node is fast (the theory)

You'll get asked about this. Here's the honest, exam-ready version.

Node is **single-threaded** for your JavaScript — there's one thread running your code, one thing at a time. That *sounds* slow, but Node is built around **non-blocking, asynchronous I/O**.

The idea: when your code hits something slow (reading a file, a database query, a network call), Node **doesn't sit and wait**. It hands that task off to the system, registers a callback, and immediately moves on to run other code. When the slow task finishes, its callback is queued and run when the thread is free. That scheduler is the **event loop**.

```
Your JS runs ──► hits await (DB query) ──► hands off, keeps going ──► DB done?
      ▲                                                                    │
      └──────────────── event loop queues the callback ◄──────────────────┘
```

Analogy: a good waiter (one thread) doesn't stand frozen at table 1 waiting for their food to cook. They take table 1's order to the kitchen, then serve table 2, clear table 3, and come back to table 1 when the kitchen rings the bell. One waiter, many tables, because the *waiting* is offloaded to the kitchen.

Consequence you must respect: **don't block the event loop.** A long synchronous loop (e.g. crunching a giant array, a `while` that spins) freezes *the entire server* for *every* user, because there's one thread. Slow work should be async (I/O) or offloaded. In practice, for a normal CRUD app, you just `await` your database calls and you're fine — Mongoose calls are async I/O, so they don't block.

This model is why Node handles thousands of simultaneous connections cheaply: most web work is *waiting* on I/O, and Node is superb at waiting on many things at once with a single thread.

---

## 9. Environment variables — config that isn't in your code

Secrets (database passwords, API keys) and per-environment config (which port, dev vs production) must **not** be hardcoded or committed. They live in **environment variables**, read via `process.env`.

Node 24 can read a `.env` file natively:

```bash
# .env  (NEVER commit this — add it to .gitignore)
PORT=3000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/mydb
JWT_SECRET=some-long-random-string
```

```bash
node --env-file=.env server.js     # built-in .env loading (Node 20.6+)
```

```js
// server.js
const port = process.env.PORT || 3000;
const uri  = process.env.MONGODB_URI;
```

(You'll also see the classic **dotenv** package doing the same job — `import "dotenv/config"`. The built-in `--env-file` is the newer, dependency-free way.)

The golden rules:
- **`.env` goes in `.gitignore`.** Committing a database password to a public GitHub repo is a genuine, common, expensive mistake. Bots scan GitHub for leaked keys within *minutes*.
- Commit a **`.env.example`** with the *keys* but fake values, so teammates know what to fill in.
- `process.env` values are always **strings** — `process.env.PORT` is `"3000"`, not `3000`. Convert if you need a number: `Number(process.env.PORT)`.

---

## Recap flashcards

- Node = V8 + server capabilities (files, network, env). Same JS, no `window`/`document`.
- Use nvm/fnm; develop on LTS (Node 24 in 2026).
- `package.json` = project ID + dependencies + scripts (`npm run dev`).
- `node_modules` gitignored & regenerable; `package-lock.json` committed & exact.
- `"type": "module"` → use `import`/`export`. Old code uses `require`/`module.exports`.
- Event loop: single thread, non-blocking async I/O, don't block it with heavy sync work.
- Config/secrets in `.env`, read via `process.env`, `.env` is gitignored, values are strings.

Next: Express, which turns raw Node into a real API with almost no effort. →
