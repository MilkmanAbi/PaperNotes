---
title: Full-Stack Integration & Auth
emoji: (☞ﾟヮﾟ)☞
order: 9
blurb: Wiring all four layers into one app — project structure, the controller pattern, environment config, JWT + bcrypt auth end-to-end, protected routes, and deployment.
---

# Full-Stack Integration & Auth (☞ﾟヮﾟ)☞

> This is the payoff chapter. Everything so far was one layer at a time; now we connect them into a single working app and add the thing every real app needs: **who are you, and are you allowed to do this?**

---

## 1. Project structure — how a real MERN repo is laid out

A common, clean layout keeps frontend and backend in one repo but clearly separated:

```
my-mern-app/
├── server/                      ← the backend (Node + Express + Mongoose)
│   ├── models/
│   │   ├── Note.js
│   │   └── User.js
│   ├── routes/
│   │   ├── notes.js
│   │   └── auth.js
│   ├── controllers/             ← route logic lives here (optional but tidy)
│   │   ├── noteController.js
│   │   └── authController.js
│   ├── middleware/
│   │   └── auth.js              ← the "are you logged in?" checker
│   ├── db.js                    ← connectDB()
│   ├── server.js                ← app setup + app.listen
│   ├── .env                     ← secrets (GITIGNORED)
│   ├── .env.example             ← committed template
│   └── package.json
│
├── client/                      ← the frontend (React + Vite)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/               ← useFetch, useAuth
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js           ← the /api proxy
│   └── package.json
│
├── .gitignore                   ← node_modules, .env, dist, build
└── README.md
```

Two `package.json`s (one per half) is normal — the halves have different dependencies. You run two dev servers during development: `npm run dev` in `server/` (:3000) and `npm run dev` in `client/` (:5173), talking via the Vite proxy.

---

## 2. The controller pattern — thin routes, fat controllers

Routes should just wire URLs to functions; the actual logic lives in **controllers**. This keeps route files readable and logic testable.

```js
// controllers/noteController.js
import Note from "../models/Note.js";

const getNotes = async (req, res) => {
  const notes = await Note.find({ author: req.userId }).sort({ createdAt: -1 }).lean();
  res.json(notes);
};

const createNote = async (req, res) => {
  const note = await Note.create({ ...req.body, author: req.userId });
  res.status(201).json(note);
};

const deleteNote = async (req, res) => {
  const note = await Note.findOneAndDelete({ _id: req.params.id, author: req.userId });
  if (!note) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
};
```

```js
// routes/notes.js — now just plumbing
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getNotes, createNote, deleteNote } from "../controllers/noteController.js";

const router = Router();
router.use(requireAuth);                 // protect ALL note routes
router.get("/", getNotes);
router.post("/", createNote);
router.delete("/:id", deleteNote);
export default router;
```

Notice `req.userId` — that gets attached by the auth middleware (§5), so each controller only ever touches *this user's* notes. Security by construction: a user literally can't query someone else's data because the filter is always scoped to `req.userId`.

---

## 3. Authentication vs authorization — get the words right

- **Authentication** = *who are you?* (proving identity — login).
- **Authorization** = *what are you allowed to do?* (permissions — can this user delete this note?).

You do authentication once (login), then authorize each subsequent request. HTTP is stateless (chapter 01), so every request must re-prove identity. Two mainstream approaches:

- **Sessions + cookies** — server stores session state, browser holds a session-id cookie. Stateful on the server.
- **JWT (JSON Web Tokens)** — server issues a signed token; client sends it on each request; server verifies the signature without storing anything. Stateless, popular in MERN/SPAs. We'll use JWT.

---

## 4. Passwords — hashing with bcrypt (never store plaintext)

**Never store a raw password.** Ever. If your DB leaks (they do), plaintext passwords are a catastrophe. Store a **hash** — a one-way scramble you can verify against but can't reverse. Use **bcrypt**, which is deliberately slow (to resist brute-forcing) and salts automatically.

```bash
npm install bcrypt jsonwebtoken
```

```js
// models/User.js
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false }, // select:false = don't return by default
  name:     { type: String, required: true },
}, { timestamps: true });

// hash before saving (chapter 06 hook)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);   // 10 = salt rounds
  next();
});

// instance method to verify a login attempt
userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

export default mongoose.model("User", userSchema);
```

`select: false` means queries won't return the password field unless you explicitly ask (`.select("+password")`) — so you never accidentally leak the hash in an API response.

---

## 5. JWT — issue on login, verify on each request

A **JWT** is a signed token: `header.payload.signature`, base64-encoded. The payload carries claims (like the user id); the signature proves *your server* issued it and it wasn't tampered with (verified using your secret key). It is **signed, not encrypted** — anyone can read the payload, so never put secrets in it, only an id.

**Register + login controller — issues a token:**

```js
// controllers/authController.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const sign = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

const register = async (req, res) => {
  const { email, password, name } = req.body;
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ error: "Email already registered" });
  const user = await User.create({ email, password, name });  // hook hashes pw
  res.status(201).json({ token: sign(user._id), user: { id: user._id, name, email } });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password"); // include pw this time
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ error: "Invalid email or password" }); // vague on purpose
  }
  res.json({ token: sign(user._id), user: { id: user._id, name: user.name, email } });
};
```

(Security note: on a failed login say "invalid email *or* password" — don't reveal which was wrong, or you help attackers enumerate valid emails.)

**The auth middleware — verifies the token, attaches `req.userId`:**

```js
// middleware/auth.js
import jwt from "jsonwebtoken";

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);  // throws if invalid/expired
    req.userId = userId;         // hand the id to downstream handlers
    next();                      // ✅ allowed through
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
```

Drop `requireAuth` on any route (or a whole router) and it's protected — no valid token, no entry. This is chapter 04's middleware concept doing real work: a gate that either calls `next()` or ends the request with a 401.

---

## 6. The frontend side of auth

On login, store the token (localStorage is simplest for coursework) and send it on every protected request in the `Authorization` header:

```jsx
// after a successful login response:
localStorage.setItem("token", data.token);

// a fetch helper that attaches the token automatically:
async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });
  if (res.status === 401) {          // token gone/expired → kick to login
    localStorage.removeItem("token");
    window.location.href = "/login";
  }
  return res;
}

// usage
const res = await api("/notes");                 // GET with token attached
await api("/notes", { method: "POST", body: JSON.stringify({ title }) });
```

Store the logged-in user in a `useContext` (chapter 08) so the whole app knows who's signed in. Logging out = delete the token + clear that context. (localStorage tokens are fine for learning; production apps often prefer httpOnly cookies to reduce XSS token theft — a topic for later.)

---

## 7. The complete end-to-end flow (trace it)

Creating a note, all four layers, top to bottom and back — the chapter-00 lifecycle, now with every real piece:

```
1. User types a title, clicks "Add"           [React: controlled form, chapter 07]
2. onSubmit → api("/notes", POST, body)        [fetch + token, chapter 08/09]
3. Vite proxy forwards /api → :3000            [dev proxy, chapter 08]
4. Express: express.json() parses the body     [middleware, chapter 04]
5. requireAuth verifies JWT → req.userId        [auth middleware, chapter 09]
6. router → createNote controller               [routing, chapter 04]
7. Note.create({...body, author: req.userId})   [Mongoose, validates, chapter 06]
8. Mongoose → MongoDB inserts the document       [BSON, chapter 05]
9. res.status(201).json(note)                    [Express response, chapter 04]
10. fetch promise resolves with the new note     [async/await, chapter 02]
11. setNotes(prev => [...prev, created])          [immutable state update, chapter 07]
12. React re-renders → the note appears           [UI is a function of state]
```

Every single chapter shows up in that list. That's the module. If you can build and debug this flow, you can build a full-stack app.

---

## 8. Environment config recap

```bash
# server/.env  (gitignored)
PORT=3000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/mydb
JWT_SECRET=a-long-random-string-change-me
NODE_ENV=development
```

- **Never commit `.env`.** Commit `.env.example` with empty/fake values.
- `JWT_SECRET` should be long and random; if it leaks, anyone can forge tokens.
- Access via `process.env.X`; remember values are strings (chapter 03).

---

## 9. Deployment — getting it live

For coursework, the common shapes:

- **Frontend (React/Vite)** — `npm run build` produces a static `dist/` folder. Host it free on **Netlify**, **Vercel**, **GitHub Pages**, or **Cloudflare Pages** (drag-and-drop or connect the repo).
- **Backend (Express)** — host on **Render**, **Railway**, **Fly.io**, or similar (a free/cheap Node host). Set your env vars in the host's dashboard, *not* in a committed file.
- **Database** — **MongoDB Atlas** free tier; whitelist your backend host's IP (or `0.0.0.0/0` for coursework simplicity) and use the Atlas connection string as `MONGODB_URI`.
- **Production CORS** — now the frontend is on a real domain, so lock CORS to it: `app.use(cors({ origin: "https://myapp.netlify.app" }))`.

Alternative single-host approach: have Express serve the built React files (`app.use(express.static("client/dist"))` plus a catch-all that returns `index.html`), so one server delivers both. Simpler to deploy, one origin, no CORS. Either is fine.

---

## 10. Security checklist (the basics graders and reality both want)

- ✅ Passwords hashed with bcrypt, never stored or logged in plaintext.
- ✅ `JWT_SECRET` in `.env`, not in code; `.env` gitignored.
- ✅ Validate/sanitise every input (Mongoose schemas + checks) — never trust `req.body`.
- ✅ Scope every query to the logged-in user (`author: req.userId`) so users can't read/modify others' data.
- ✅ Return correct status codes (401 vs 403 vs 400).
- ✅ Vague login errors ("invalid email or password").
- ✅ HTTPS in production (hosts give it free).
- ✅ Don't leak internals in error responses (generic message to client, full detail to server logs).

---

## Recap flashcards

- Structure: `server/` (models, routes, controllers, middleware) + `client/` (React); two package.jsons.
- Thin routes, fat controllers; scope queries to `req.userId`.
- AuthN = who you are (login); AuthZ = what you may do (per-request).
- bcrypt hashes passwords (`pre("save")` hook + `comparePassword`); never store plaintext; `select:false`.
- JWT: `jwt.sign` on login, `jwt.verify` in `requireAuth` middleware → attaches `req.userId`.
- Frontend: store token, send `Authorization: Bearer <token>` on every protected call.
- Trace the 12-step create-a-note flow — it uses every chapter.
- Deploy: static frontend host + Node backend host + Atlas; set env vars in the dashboard; lock CORS.

Last one: the tools you live inside — VS Code and Git. →
