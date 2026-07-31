---
title: VS Code, Git & Workflow
emoji: (⌐■_■)
order: 10
blurb: Setting up VS Code for MERN, the extensions that matter, the integrated terminal, debugging Node & React, the REST Client, and Git basics — the tools you actually live inside.
---

# VS Code, Git & Workflow (⌐■_■)

> You'll spend more hours in your editor and terminal than in any framework. A tuned setup is not procrastination — it's the difference between fighting your tools and forgetting they're there. This chapter is the environment the other ten happen inside.

---

## 1. Why VS Code for MERN

**VS Code** is the de-facto editor for JavaScript/MERN: free, fast, great JS/TS support out of the box, huge extension ecosystem, and an integrated terminal + debugger so you rarely leave the window. It understands `import`/`export`, autocompletes your own modules, and shows type hints even in plain JS. For this module it's the standard; use it unless you have a strong reason not to.

Install from code.visualstudio.com. On first launch, sign in to sync settings across machines (handy across SP lab PCs and your own).

---

## 2. Extensions that actually earn their place

Don't install fifty. These are the ones that pay off for MERN:

- **ESLint** — flags bugs and style issues *as you type* (unused vars, undefined names, the React hook-rule violations from chapter 08). The single most useful one.
- **Prettier – Code formatter** — auto-formats on save so you never argue about spacing. Set it as the default formatter and enable "Format On Save."
- **ES7+ React/Redux/React-Native snippets** — type `rafce` → a full React arrow-function component appears. `useState`, `useEffect` snippets too. Massive time saver.
- **Auto Rename Tag** — rename a JSX/HTML tag and its closing tag updates with it.
- **REST Client** *or* **Thunder Client** — test your API endpoints without leaving the editor (see §5). A lightweight in-editor Postman.
- **MongoDB for VS Code** — connect to Atlas/local, browse collections, run queries in a playground right in the editor.
- **GitLens** — supercharges the built-in Git: see who wrote each line and when, inline blame, richer history.
- **DotENV** — syntax highlighting for `.env` files.
- **npm Intellisense** — autocompletes module names in `import` statements.

Optional niceties: **Error Lens** (shows errors inline on the line instead of only on hover — great for beginners), and a theme/icon pack of your choice.

---

## 3. Settings worth turning on

Open Settings (`Ctrl/Cmd + ,`) or edit `settings.json` directly:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "editor.tabSize": 2,
  "files.autoSave": "onFocusChange",
  "editor.bracketPairColorization.enabled": true,
  "editor.linkedEditing": true
}
```

- **Format on save** — code tidies itself every save.
- **Fix ESLint on save** — auto-fixes what it safely can.
- **Tab size 2** — the JS community standard (Prettier defaults to 2).

A per-project `.vscode/settings.json` committed to the repo means everyone on the project gets the same setup — nice for group work.

---

## 4. The integrated terminal — living in the editor

Open with `` Ctrl + ` `` (backtick). You can run everything here: `npm run dev`, `git commit`, `mongosh`. Key moves:

- **Split terminals** — run backend (`server/ $ npm run dev`) in one pane and frontend (`client/ $ npm run dev`) in another, side by side. Essential for MERN, where you run two dev servers at once.
- **Name/color them** so you don't confuse the API terminal with the React one.
- `Ctrl + C` stops a running process (your dev server). `↑` recalls the last command.
- The terminal opens in your workspace folder — `cd` into `server/` or `client/` as needed.

Useful commands you'll type daily:
```bash
npm run dev            # start the dev server
npm install <pkg>      # add a dependency
npm run build          # production build (frontend)
npx <tool>             # run a tool without installing it globally (e.g. npx create-vite)
```

---

## 5. Testing your API from the editor (REST Client)

Rather than switching to Postman, drop a `.http` file in your project and click "Send Request" above each block (with the **REST Client** extension):

```http
### Register
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{ "name": "Abi", "email": "abi@example.com", "password": "supersecret" }

### Login (grab the token from the response)
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{ "email": "abi@example.com", "password": "supersecret" }

### Get notes (paste the token in)
GET http://localhost:3000/api/notes
Authorization: Bearer PASTE_TOKEN_HERE
```

Committing this `.http` file documents your API *and* gives teammates instant test requests. It's the fastest way to check "is my backend working?" before you've built any frontend — which is exactly how you should build (backend first, verify with REST Client, *then* wire up React).

---

## 6. Debugging — beyond console.log

`console.log` is a perfectly respectable debugging tool (log the request, log the query result, log the state — isolate the layer, chapter 00). But VS Code's real debugger is better for tricky bugs.

**Debugging Node/Express:** set a breakpoint (click left of a line number → red dot), then run with the debugger. A `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [{
    "type": "node",
    "request": "launch",
    "name": "Debug server",
    "program": "${workspaceFolder}/server/server.js",
    "envFile": "${workspaceFolder}/server/.env"
  }]
}
```

Hit F5, trigger a request, and execution pauses at your breakpoint — inspect `req.body`, step through line by line, hover to see variable values. Far faster than sprinkling logs for logic bugs.

**Debugging React:** React runs in the browser, so use the browser DevTools (F12) + the **React Developer Tools** browser extension. The React DevTools' Components tab lets you inspect any component's current **props and state** live — the fastest way to answer "did the data actually reach this component?" The Network tab shows your `fetch` calls, their status codes, and response bodies — the fastest way to answer "did the request even go out, and what came back?"

The debugging mindset from chapter 00, made concrete: **is the request going out?** (Network tab) → **is it reaching Express?** (a log/breakpoint in the route) → **is Mongo returning data?** (log the query result / Compass) → **did React receive it?** (React DevTools state) → **is it rendering?** (the DOM). Cut the pipeline in half at each step.

---

## 7. Git — version control you can't skip

**Git** tracks changes to your code over time, lets you undo, branch, and collaborate. **GitHub** is where you host Git repos online (and where your ET0744 submission likely lives). VS Code has Git built into the Source Control panel, but knowing the commands matters.

The everyday loop:

```bash
git status                  # what changed? (run this constantly)
git add .                   # stage all changes for commit
git add server/server.js    # or stage specific files
git commit -m "Add note deletion route"   # save a snapshot with a message
git push                    # upload commits to GitHub
git pull                    # download teammates' commits
```

Starting a repo:
```bash
git init                    # turn a folder into a repo
git remote add origin https://github.com/you/repo.git
git branch -M main
git push -u origin main     # first push
# or just: git clone https://github.com/you/repo.git  (existing repo)
```

**Commit messages** — write what and why, imperative mood: "Add JWT auth middleware," not "stuff" or "asdf." Future-you and your groupmates will thank you. Commit small and often; a commit per working feature is a good rhythm.

---

## 8. `.gitignore` — the file that saves you

**Before your first commit**, create a `.gitignore` so you never commit junk or secrets. For MERN:

```gitignore
# dependencies (regenerable — chapter 03)
node_modules/

# secrets — NEVER commit these
.env
.env.*.local

# build output
dist/
build/

# logs & OS cruft
*.log
.DS_Store

# editor
.vscode/*
!.vscode/settings.json   # but DO share project settings
!.vscode/launch.json
```

The two that genuinely matter: **`node_modules/`** (huge, regenerable via `npm install` — committing it is a rookie tell) and **`.env`** (your database password and JWT secret — committing this to a public repo is a real security incident; bots scan GitHub for leaked credentials within minutes and *will* find them). If you ever accidentally commit `.env`, rotate those secrets immediately — removing the file later doesn't erase it from Git history.

---

## 9. Branching — for features and teamwork

For solo coursework you can work on `main`, but branches are worth knowing (and expected in group projects):

```bash
git checkout -b feature/login    # create + switch to a new branch
# ... work, commit ...
git push -u origin feature/login
# open a Pull Request on GitHub → review → merge into main
git checkout main && git pull    # back to main, get the merged code
```

A branch is an isolated line of work; you merge it back when it's done. Pull Requests (PRs) on GitHub are where teammates review each other's code before it lands on `main`. Keeps `main` always-working.

---

## 10. A sane daily workflow

Putting it together, a typical MERN session:

1. `git pull` — start from the latest.
2. Open two split terminals: `server/ $ npm run dev` and `client/ $ npm run dev`.
3. Build backend-first: write a route/controller, test it with the REST Client (`.http` file), confirm it works and saves to Mongo (check in Compass).
4. Then wire the frontend: fetch it in React, render loading/error/data, confirm in the browser + React DevTools.
5. Small commits as each piece works: `git add . && git commit -m "..."`.
6. `git push` at the end (or after each meaningful chunk).
7. When stuck: read the error → isolate the layer (chapter 00) → check the Network tab → check the server log → cut the problem in half.

> "Weeks of coding can save you hours of planning." Backend-first, test-as-you-go, commit-often. That order will carry you through the whole module. ᕙ(⇀‸↼‶)ᕗ

---

## Recap flashcards

- VS Code + ESLint + Prettier + a React snippets pack + REST/Thunder Client + MongoDB extension.
- Turn on format-on-save, fix-ESLint-on-save, tab size 2.
- Split terminals: backend and frontend dev servers side by side.
- `.http` files (REST Client) test your API in-editor — backend-first development.
- Debug: breakpoints + `launch.json` for Node; browser DevTools + React DevTools for React (inspect props/state, watch Network).
- Git loop: `status` → `add` → `commit -m` → `push`; `pull` to sync.
- `.gitignore` `node_modules/` and `.env` **before** the first commit; leaked secrets = real incident.
- Branch + PR for features/teamwork; keep `main` working.

That's the module. (◕‿◕)✿  Go build something. Then come back and reread 01 — it'll read completely differently now.
