---
title: Express — Building the API
emoji: ┌( ಠ_ಠ)┘
order: 4
blurb: App setup, routing, the middleware pipeline, req/res, building a REST API, routers, error handling, CORS, and what Express 5 changed.
---

# Express — Building the API ┌( ಠ_ಠ)┘

> Raw Node can serve HTTP, but you'd be hand-parsing URLs and methods forever. Express is a thin, unopinionated layer that gives you clean routing and a middleware pipeline. It's the 'E' in MERN and the most-used Node framework by a mile.

Everything here runs on the server, inside Node. Express's whole job: **take an incoming HTTP request, run it through a pipeline, and produce a response.**

---

## 1. Hello, Express

```bash
npm install express
```

```js
// server.js  ("type":"module" in package.json)
import express from "express";

const app = express();                 // create the application
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {           // a route: GET on path "/"
  res.send("Hello, Express!");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

`npm run dev` (with `node --watch server.js`), open `localhost:3000`, done. Three concepts already: **the app**, **a route**, and **listening on a port**.

---

## 2. Routing — matching method + path to a handler

A route says: "when a request comes in with *this method* and *this path*, run *this function*."

```js
app.get("/notes",       handler);   // GET    /notes
app.post("/notes",      handler);   // POST   /notes
app.put("/notes/:id",   handler);   // PUT    /notes/123
app.patch("/notes/:id", handler);   // PATCH  /notes/123
app.delete("/notes/:id",handler);   // DELETE /notes/123
```

Notice this is exactly the REST/CRUD table from chapter 01 turned into code. That's not a coincidence — Express routing is designed to express REST directly.

**Route parameters** — the `:id` part captures whatever's in that URL segment:

```js
app.get("/notes/:id", (req, res) => {
  const id = req.params.id;           // "123" from GET /notes/123
  res.send(`You asked for note ${id}`);
});
```

**Query strings** — the `?key=value` part:

```js
app.get("/notes", (req, res) => {
  const { sort, done } = req.query;   // GET /notes?sort=recent&done=true
  res.send(`sort=${sort}, done=${done}`);
});
```

Rule of thumb: **path params identify *which* resource** (`/notes/:id`), **query params modify *how* you fetch** (filters, sorting, pagination). Don't put a filter in the path or an id in the query.

---

## 3. The request and response objects

Every handler gets `(req, res)`.

**`req`** (request) — what the client sent:
- `req.params` — route parameters (`:id`).
- `req.query` — the query string as an object.
- `req.body` — the parsed request body (needs middleware, see below).
- `req.headers` — the request headers.
- `req.method`, `req.url` — the verb and path.

**`res`** (response) — how you reply. These *end* the request; call exactly one:
- `res.send(x)` — send text/HTML/buffer.
- `res.json(obj)` — send JSON (sets `Content-Type` and stringifies). **Use this for APIs.**
- `res.status(code)` — set the status; chainable: `res.status(201).json(newNote)`.
- `res.sendStatus(204)` — set status and send its text in one go.
- `res.redirect("/login")` — 3xx redirect.

**Critical rule: send exactly one response per request.** Sending twice throws `Cannot set headers after they are sent`. This usually means you forgot a `return` after an early `res.json(...)` and the code kept running to a second response. Get in the habit of `return res.status(400).json(...)`.

---

## 4. Middleware — the whole mental model of Express

This is the single most important Express concept. **Middleware is a function that runs *in the middle* of the request→response journey.** A request passes through a *pipeline* of middleware functions in order, and each one can: read/modify `req` and `res`, end the response, or call `next()` to pass control to the next function.

```js
const logger = (req, res, next) => {
  console.log(`${req.method} ${req.url}`);   // do something
  next();                                    // hand off to the next middleware
};

app.use(logger);   // register it — now it runs for EVERY request
```

The signature `(req, res, next)` *is* middleware. A route handler is really just middleware that happens to end the response instead of calling `next()`.

```
Request ─► [ logger ] ─► [ json parser ] ─► [ auth check ] ─► [ route handler ] ─► Response
             next()         next()            next() or         res.json()
                                              res.status(401)    (ends here)
```

- `app.use(fn)` — run `fn` on every request.
- `app.use("/api", fn)` — run `fn` only on paths starting with `/api`.
- Middleware can be stacked on a single route: `app.get("/secret", auth, handler)` — `auth` runs first, and only calls `next()` (reaching `handler`) if the user is allowed.

**Order matters enormously.** Middleware runs top to bottom. If your auth check is registered *after* your routes, it never protects them. If your body parser is registered after a route, `req.body` is undefined in that route. When something is mysteriously `undefined` or a check isn't firing, check the *order* of your `app.use` calls first.

---

## 5. Essential built-in middleware

```js
app.use(express.json());                 // parse JSON request bodies → req.body
app.use(express.urlencoded({ extended: true })); // parse form-encoded bodies
app.use(express.static("public"));       // serve static files from ./public
```

`express.json()` is the one you'll always need — without it, `req.body` is `undefined` on POST/PUT/PATCH, and beginners lose an hour to this. Register it near the top, before your routes:

```js
const app = express();
app.use(express.json());   // ← FIRST, so every route below can read req.body
// ... routes after this
```

---

## 6. A complete REST resource (in-memory, to see the shape)

Before we add a database, here's a full CRUD API with a plain array, so the *routing* is clear without Mongo noise:

```js
import express from "express";
const app = express();
app.use(express.json());

let notes = [{ id: 1, title: "First note", done: false }];
let nextId = 2;

// READ all
app.get("/api/notes", (req, res) => {
  res.json(notes);
});

// READ one
app.get("/api/notes/:id", (req, res) => {
  const note = notes.find(n => n.id === Number(req.params.id));
  if (!note) return res.status(404).json({ error: "Note not found" });
  res.json(note);
});

// CREATE
app.post("/api/notes", (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });
  const note = { id: nextId++, title, done: false };
  notes.push(note);
  res.status(201).json(note);          // 201 Created + the new resource
});

// UPDATE
app.patch("/api/notes/:id", (req, res) => {
  const note = notes.find(n => n.id === Number(req.params.id));
  if (!note) return res.status(404).json({ error: "Note not found" });
  Object.assign(note, req.body);       // merge changes in
  res.json(note);
});

// DELETE
app.delete("/api/notes/:id", (req, res) => {
  notes = notes.filter(n => n.id !== Number(req.params.id));
  res.status(204).end();               // 204 No Content
});

app.listen(3000, () => console.log("http://localhost:3000"));
```

Study this until it's boring. Every backend feature in the module is a variation of these five handlers — you'll just swap the array for Mongoose queries in chapters 06/09. Note the details: `Number(req.params.id)` because params are strings; early `return` on the 404/400 guards; correct status codes.

---

## 7. Routers — splitting the app into files

Cramming every route into `server.js` gets unmanageable. `express.Router()` lets you group related routes into their own module.

```js
// routes/notes.js
import { Router } from "express";
const router = Router();

router.get("/",    (req, res) => { /* GET  /api/notes     */ });
router.get("/:id", (req, res) => { /* GET  /api/notes/:id */ });
router.post("/",   (req, res) => { /* POST /api/notes     */ });

export default router;
```

```js
// server.js
import notesRouter from "./routes/notes.js";
app.use("/api/notes", notesRouter);   // mount it — the router's "/" becomes "/api/notes"
```

The mount path (`/api/notes`) prefixes every route inside the router. This is how real projects stay organised: one router file per resource. Pairs naturally with the folder structure in chapter 09.

---

## 8. Error handling — and what Express 5 changed

**The old Express 4 pain:** async errors didn't get caught automatically, so every async route needed a try/catch that forwarded to `next(err)`:

```js
// Express 4 — the tedious way
app.get("/notes/:id", async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    res.json(note);
  } catch (err) {
    next(err);            // manually forward to the error handler
  }
});
```

**Express 5 fixes this.** A rejected promise from an async handler is forwarded to your error handler automatically — no try/catch boilerplate:

```js
// Express 5 — clean
app.get("/notes/:id", async (req, res) => {
  const note = await Note.findById(req.params.id);   // if this throws, Express catches it
  if (!note) return res.status(404).json({ error: "Not found" });
  res.json(note);
});
```

An **error-handling middleware** has *four* parameters — that fourth `err` param is how Express knows it's an error handler. Register it **last**, after all routes:

```js
app.use((err, req, res, next) => {     // 4 args = error handler
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});
```

Any `throw` in a route (or a rejected promise, in Express 5) lands here. This gives you one place to handle all failures — exactly the "die gracefully, say what failed" principle.

**Other Express 5 changes worth knowing** (so old tutorials don't trip you):
- `res.sendfile()` (lowercase) is gone → use `res.sendFile()`.
- `app.del()` is gone → use `app.delete()`.
- Route pattern syntax changed (the `path-to-regexp` upgrade closed a security hole called ReDoS). Wildcards are now named: `/*splat` instead of bare `*`. If a route pattern errors on startup, this is why.
- Requires Node 18+.

---

## 9. CORS — the cross-origin thing you *will* hit

When your React dev server (say `localhost:5173`) calls your Express API (`localhost:3000`), the browser blocks it by default: different port = different **origin**, and browsers forbid cross-origin requests unless the server opts in. You'll see: `Access to fetch ... has been blocked by CORS policy`.

Fix on the server with the `cors` package:

```bash
npm install cors
```

```js
import cors from "cors";

app.use(cors());                                  // allow all origins (fine for dev)
// production: lock it down to your real frontend
app.use(cors({ origin: "https://myapp.com" }));
```

Two things to internalise: (1) **CORS is enforced by the browser, not by curl/Postman** — so a request can work in Postman and fail in the browser, and that's expected. (2) It's the *server's* job to permit the origin; you can't fix CORS from frontend code. (Alternative in dev: a Vite proxy — chapter 08/09 — which sidesteps CORS entirely by making the browser think it's same-origin.)

---

## 10. A sensible starter structure

```js
import express from "express";
import cors from "cors";
import notesRouter from "./routes/notes.js";

const app = express();

// --- middleware pipeline (order matters!) ---
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {                 // request logger
  console.log(`${req.method} ${req.url}`);
  next();
});

// --- routes ---
app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/notes", notesRouter);

// --- 404 for unmatched routes ---
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

// --- error handler (LAST) ---
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something broke" });
});

app.listen(3000, () => console.log("http://localhost:3000"));
```

That top-to-bottom shape — cors, json, logging, routes, 404, error handler — is a solid default you can reuse for every project.

---

## Recap flashcards

- Express = routing + a middleware pipeline over raw Node.
- Route = method + path + handler; `:id` → `req.params`, `?x=` → `req.query`.
- `res.json()` for APIs; set status with `res.status(201).json(...)`; send exactly one response (use `return`).
- Middleware `(req,res,next)` runs in order; `next()` passes control; **order matters**.
- `app.use(express.json())` near the top or `req.body` is undefined.
- Routers split resources into files; mount with `app.use("/api/notes", router)`.
- Express 5 auto-catches async errors; error handler has 4 params and goes last.
- CORS is a browser rule; allow the origin on the server with the `cors` package.

Next: the database those routes will actually talk to. →
