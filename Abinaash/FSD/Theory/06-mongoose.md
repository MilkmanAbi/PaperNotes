---
title: Mongoose — Schemas & Models
emoji: (๑˃ᴗ˂)ﻭ
order: 6
blurb: Connecting, schemas & models, CRUD with real code, validation, relationships (ref/populate), middleware hooks, and lean queries. The friendly layer over MongoDB.
---

# Mongoose — Schemas & Models (๑˃ᴗ˂)ﻭ

> MongoDB is flexible to a fault — it'll happily store `titel` next to `title` and never complain. Mongoose is the adult in the room: it defines a *shape* for your documents, validates data before it saves, and gives you clean JavaScript methods instead of raw shell commands. In MERN, you'll write Mongoose, not raw Mongo.

Mongoose is an **ODM** — Object Data Modelling library. It maps your JS objects to Mongo documents, adds a schema layer, and handles validation, type-casting, relationships, and hooks.

```bash
npm install mongoose
```

---

## 1. Connecting

```js
// db.js
import mongoose from "mongoose";

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);   // can't run without a DB — die loudly
  }
}
```

```js
// server.js
import { connectDB } from "./db.js";
await connectDB();     // connect BEFORE you start serving requests
app.listen(3000);
```

`mongoose.connect` returns a promise; `await` it once at startup. If it fails, exit — an API with no database is useless, so fail loudly rather than serving broken requests. Connect *before* `app.listen`.

---

## 2. Schema — the shape of a document

A **schema** describes what fields a document has, their types, and their rules. This is where you claw back the structure that raw Mongo doesn't enforce.

```js
// models/Note.js
import mongoose from "mongoose";

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Title is required"],   // custom error message
    trim: true,                              // strip whitespace
    maxlength: [100, "Title too long"],
  },
  body:     { type: String, default: "" },
  done:     { type: Boolean, default: false },
  priority: { type: Number, min: 1, max: 5, default: 3 },
  tags:     [String],                        // an array of strings
  author:   { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // reference
}, {
  timestamps: true,   // auto-adds createdAt & updatedAt — always turn this on
});
```

Schema field options you'll use constantly:
- **`type`** — `String`, `Number`, `Boolean`, `Date`, `[String]` (array), `ObjectId`, etc.
- **`required`** — must be present (with optional custom message).
- **`default`** — value if none given.
- **`unique`** — creates a unique index (no duplicates; used on `email`).
- **`min`/`max`** (numbers/dates), **`minlength`/`maxlength`** (strings), **`enum`** (allowed values).
- **`trim`, `lowercase`** — auto-transform strings on save.
- **`timestamps: true`** (schema option) — free `createdAt`/`updatedAt`. Turn it on every time.

---

## 3. Model — the thing you call methods on

A **model** is a schema compiled into a usable class. It's your interface to the collection.

```js
const Note = mongoose.model("Note", noteSchema);
export default Note;
```

Mongoose pluralises + lowercases the model name for the collection: model `"Note"` → collection `notes`. The **model** (`Note`) is how you query; a **document** is a single instance the model gives you back.

---

## 4. CRUD with Mongoose — the real code

This is what actually goes inside your Express route handlers. Compare it to the in-memory version from chapter 04 — same shape, real persistence.

```js
import Note from "../models/Note.js";

// CREATE
const note = await Note.create({ title: "Hello", tags: ["a"] });
// or: const note = new Note({...}); await note.save();

// READ many (with a filter + sort)
const notes = await Note.find({ done: false }).sort({ createdAt: -1 });
const all   = await Note.find();                       // everything

// READ one
const one   = await Note.findById(req.params.id);      // by _id
const byX   = await Note.findOne({ title: "Hello" });  // by any field

// UPDATE  (new:true returns the UPDATED doc, not the old one)
const updated = await Note.findByIdAndUpdate(
  req.params.id,
  { done: true },
  { new: true, runValidators: true }   // ← both matter, see below
);

// DELETE
await Note.findByIdAndDelete(req.params.id);
const result = await Note.deleteMany({ done: true });  // result.deletedCount
```

Two options that bite everyone:
- **`{ new: true }`** on updates — by default `findByIdAndUpdate` returns the document *as it was before* the update. Add `new: true` to get the updated version back (which is almost always what you want to send to the client).
- **`{ runValidators: true }`** on updates — schema validation runs on `.create()`/`.save()` but **not** on `findByIdAndUpdate` by default. Add this or invalid updates slip through.

The same operations from chapter 04, now with a database:

```js
// routes/notes.js — a real Express + Mongoose route
router.post("/", async (req, res) => {
  const note = await Note.create(req.body);   // validation runs; throws if invalid
  res.status(201).json(note);
});

router.get("/:id", async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ error: "Not found" });
  res.json(note);
});
```

(In Express 5, a validation error thrown by `.create()` is auto-forwarded to your error handler — no try/catch needed.)

---

## 5. Validation — trust nothing from the client

**Never trust `req.body`.** The client can send anything — missing fields, wrong types, malicious junk. Schema validation is your first line of defence, and it runs automatically on `save`/`create`.

```js
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
  },
  age: { type: Number, min: [13, "Must be at least 13"] },
  role: { type: String, enum: ["user", "admin"], default: "user" },
});
```

When validation fails, Mongoose throws a `ValidationError`. Catch it (or let Express 5 catch it) and return a 400 with the details:

```js
router.post("/", async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ errors: messages });
    }
    throw err;   // anything else → real error handler
  }
});
```

**Important nuance:** `unique: true` is *not* a validator — it's a database index. A duplicate email throws a MongoDB **duplicate-key error** (code `11000`), not a `ValidationError`. Handle that case separately (409 Conflict) if you want a friendly message.

---

## 6. Relationships — ref & populate

This implements the "reference" pattern from chapter 05. Store an `ObjectId` that points at another collection, then `populate` to swap the id for the real document at query time.

```js
// Note schema references a User
author: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
```

```js
// store just the id
await Note.create({ title: "Hi", author: someUserId });

// fetch the note WITH the author document filled in
const note = await Note.findById(id).populate("author");
// note.author is now the full User document, not just an id

// populate only some fields of the author
const notes = await Note.find().populate("author", "name email");
```

`populate` is Mongoose doing a `$lookup` (a join) for you. Without it, `note.author` is just an `ObjectId`; with it, it's the whole user. Don't over-populate — each `populate` is extra work; only fill in what the screen actually needs.

---

## 7. Middleware / hooks — run code around operations

Mongoose lets you hook into the lifecycle of a document with **pre** and **post** middleware. The classic, must-know use: **hash a password before saving a user** (never store plain passwords — chapter 09).

```js
import bcrypt from "bcrypt";

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); // only re-hash if changed
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
```

`this` inside a `pre("save")` hook is the document being saved. Other hooks: `pre("validate")`, `post("save")`, `pre("find")`. You'll mostly use the password one — but knowing hooks exist explains a lot of "how does the password get hashed automatically" magic in tutorials.

You can also add **instance methods** to a schema (e.g. `user.comparePassword(plain)`), which keeps auth logic on the model where it belongs:

```js
userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};
// later: const ok = await user.comparePassword(req.body.password);
```

---

## 8. `.lean()` — a performance habit worth having

By default, a Mongoose query returns full **Mongoose documents** — fancy objects with `.save()`, virtuals, getters, change-tracking. That's overhead. If you're only *reading* data to send as JSON (which is most GET routes), add `.lean()` to get plain JS objects instead — noticeably faster and lighter:

```js
const notes = await Note.find({ done: false }).lean();   // plain objects, faster
```

Rule: **`.lean()` on read-only queries you're just going to `res.json()`.** Skip it when you need to modify and `.save()` the result (lean docs have no `.save()`).

---

## 9. Putting a model together

```
models/
  Note.js     → noteSchema + mongoose.model("Note")
  User.js     → userSchema + hooks + methods
db.js         → connectDB()
```

Each model in its own file, exported as the default. Import the model wherever you query it (routes, controllers). This is the structure chapter 09 assembles into a full app.

---

## Recap flashcards

- Mongoose = ODM: schemas + validation + clean methods over raw Mongo.
- `mongoose.connect(uri)` once at startup, before `app.listen`.
- Schema = field types + rules (`required`, `default`, `unique`, `enum`, `min/max`); add `timestamps: true`.
- Model = compiled schema; `mongoose.model("Note", schema)`; collection is pluralised (`notes`).
- CRUD: `create`, `find/findById/findOne`, `findByIdAndUpdate` (`{new:true, runValidators:true}`), `findByIdAndDelete`.
- Validation runs on save/create automatically; `unique` is an index (dup = error 11000, not ValidationError).
- Relationships: `ref` stores an id, `.populate("author")` fills in the real doc.
- Hooks: `pre("save")` to hash passwords; instance methods for `comparePassword`.
- `.lean()` on read-only queries for speed.

Halfway. Now we leave the server and go to the browser — React. →
