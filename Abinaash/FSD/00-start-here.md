---
title: Start Here — The MERN Map
emoji: T^T
order: 0
blurb: What full-stack dev actually is, how the four MERN pieces fit, and the one mental model that makes everything else click.
---

# Start Here — The MERN Map T^T

> "Any application that can be written in JavaScript, will eventually be written in JavaScript." — Atwood's Law. This module is that law happening to you.

Welcome to **ET0744 Full Stack Development**. This whole module is really one sentence stretched over a semester:

**A browser sends a request over HTTP, a server does something with a database, and sends data back, and a UI turns that data into pixels a human can click.**

Everything else — Express routes, Mongoose schemas, React hooks — is just detail hanging off that one sentence. If you keep the sentence in your head, you never get lost.

---

## 1. What "full stack" means

Software that lives on the web has two halves:

- **Frontend (client-side)** — the part that runs *in the user's browser*. HTML, CSS, JavaScript, and in our case **React**. It draws the screen and reacts to clicks.
- **Backend (server-side)** — the part that runs *on a computer you control* (a server). It holds the real data, enforces the rules, talks to the database, and decides what each user is allowed to see. In our case **Node.js + Express**, talking to **MongoDB**.

"Full stack" just means you can build *both halves*, plus the wiring between them. That wiring is the actual skill. Lots of people can do one half. The interesting bugs live in the seam.

```
   YOU (full stack) = everything below

  ┌─────────────────────────┐
  │  BROWSER (the client)    │   React  ← frontend
  │  draws UI, handles clicks│
  └───────────┬─────────────┘
              │  HTTP request  (GET /api/notes)
              │  HTTP response (JSON data)
  ┌───────────▼─────────────┐
  │  SERVER                  │   Node + Express  ← backend
  │  routes, logic, auth     │
  └───────────┬─────────────┘
              │  driver / Mongoose
  ┌───────────▼─────────────┐
  │  DATABASE                │   MongoDB  ← data
  │  stores documents        │
  └─────────────────────────┘
```

---

## 2. What each letter of MERN is (the one-liners)

| Letter | Tech | Runs where | Its one job |
|---|---|---|---|
| **M** | MongoDB | on a server / cloud | Store the data as JSON-ish documents |
| **E** | Express | inside Node, on the server | Answer HTTP requests with logic + routing |
| **R** | React | in the browser | Turn data into a live, clickable UI |
| **N** | Node.js | on the server | Run JavaScript *outside* the browser so the backend can exist at all |

The trick that makes MERN popular: **it's JavaScript the whole way down.** One language, frontend to backend to database queries. You don't switch brains between layers. (This is also why it's a great teaching stack — you're really learning *one* language deeply and applying it in four places.)

Other stacks swap letters: **MEAN** (Angular instead of React), **PERN** (PostgreSQL instead of Mongo), **MEVN** (Vue). Same shape, different bricks. Learn MERN and the others are a weekend of relabelling.

---

## 3. The request lifecycle — trace it once, understand it forever

Say the user opens your app and it shows a list of notes. Here's *literally* what happens, step by step. Memorise this trace; every feature you ever build is a variation of it.

1. **Browser loads your React app** (HTML + JS bundle) from a static host.
2. React renders and, in an effect, decides it needs data: it calls `fetch("/api/notes")`.
3. That's an **HTTP GET request** travelling across the network to your server.
4. **Express** is listening. It matches the URL `/api/notes` to a route handler you wrote.
5. Your handler asks **Mongoose**: "give me all notes." Mongoose translates that into a **MongoDB** query.
6. MongoDB finds the documents and hands them back up: Mongo → Mongoose → your handler.
7. Your handler calls `res.json(notes)` — Express serialises the array to **JSON** and sends it back as the **HTTP response**.
8. Back in the browser, the `fetch` promise resolves. React puts the data into **state**.
9. State changing makes React **re-render**, and now the notes appear on screen.

Nine steps, four technologies, one direction and back. That's the whole module. Everything from here just fills in *how* each step works.

```
click → fetch → HTTP → Express route → Mongoose → MongoDB
                                                      │
screen ← re-render ← setState ← JSON ← res.json ← ────┘
```

---

## 4. How to read these notes

They're ordered so each one only needs the ones before it:

- **00 Start Here** ← you are here
- **01 How the Web Works** — HTTP, REST, JSON. The physics of the whole thing.
- **02 Modern JavaScript** — the exact JS features MERN leans on. Don't skip; this is where most beginners actually struggle, not React.
- **03 Node.js** — JS on the server, npm, modules.
- **04 Express** — building the API.
- **05 MongoDB** — the database itself.
- **06 Mongoose** — the friendly layer over MongoDB.
- **07 React Fundamentals** — components, props, state.
- **08 React Effects & Data** — talking to your API, routing, React 19 features.
- **09 Full-Stack Integration** — wiring all four together, auth, the real project.
- **10 VS Code, Git & Workflow** — the tools you'll live inside.

Read **01 → 06** before you touch React. It's tempting to jump to the shiny UI part, but React makes ten times more sense once you already know what it's fetching *from*.

---

## 5. The versions you're on (2026)

The stack moves; here's the ground you're standing on so nothing surprises you:

- **Node.js 24** is the current Active LTS (use this for projects). Node 26 is "Current" and becomes LTS in Oct 2026. From Node 27 the release model changes to one major a year, all LTS.
- **Express 5** (5.2.x) is the modern stable line — the big deal is **automatic async error handling** (no more try/catch in every route). Express 4 still exists everywhere but is winding down.
- **React 19** (19.2) is current, with the **React Compiler 1.0** and **Actions** / new form hooks. We'll use it via **Vite**, not Create React App (CRA is deprecated — don't let an old tutorial send you there).
- **MongoDB 8.x** server, driven by **Mongoose 9.x** (the object-modelling library).

You don't need to memorise version numbers for an exam. You *do* need to not follow a 2019 blog that tells you to `npm install express@4` and wrap every route in try/catch. When in doubt, check the official docs — they're genuinely good for all four.

---

## 6. The mindset that will save you

Three things, learned the hard way by everyone:

1. **The error message is a gift, not an insult.** Read it. The stack trace tells you the file and line. 80% of "I'm stuck" is "I didn't read the error."
2. **Isolate the layer.** When something breaks, figure out *which of the four boxes* it broke in. Is the request even reaching Express? (log it) Is Mongo returning data? (log it) Did React get the data but not render it? (log it) Bugs feel impossible until you cut the problem in half.
3. **Small steps, run often.** Don't write 200 lines then run. Write 10, run, confirm, repeat. The web has a *lot* of moving parts; you want to catch the break the instant you cause it.

> "It's not a bug, it's an undocumented feature" is a joke. In this module it's usually a typo in a route path. (￣ω￣;)

Right. Turn the page. Let's start with the web itself. →
