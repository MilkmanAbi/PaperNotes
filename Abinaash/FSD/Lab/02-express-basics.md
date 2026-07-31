---
title: Express Basics — Middleware & Dynamic Params
emoji: ┌(๑˃ᴗ˂)┘
order: 2
blurb: Practice 6 Q1 & Q2 done for real — spin up Express, add your own middleware for a new URL, and use dynamic parameters to look up a grade from an array. The exact tasks, the exact answers.
---

# Express Basics — Middleware & Dynamic Params ┌(๑˃ᴗ˂)┘

> Express is Node's HTTP server with the tedious bits pre-written. Instead of one big `if/else` on `req.url`, you get `app.get("/path", handler)`. That's basically the whole pitch. This note covers **Practice 6 Q1 and Q2**.

---

## 1. Set up an Express project

```bash
mkdir practice6
cd practice6
npm init -y
npm install express
```

That `npm install express` is the difference from note 01 - now you have a library in `node_modules/`. Make `app.js`:

```js
const express = require("express");
const app = express();

app.listen(8000, "localhost", () => {
    console.log("running on http://localhost:8000");
});
```

Run `node app.js`. It listens but every route 404s because you haven't defined any yet. Let's fix that.

---

## 2. Q1 Part A - a basic route (and what "middleware" means)

The simplest handler:

```js
app.get("/", (req, res) => {
    res.send("Hello from Express");
});
```

`app.get(path, handler)` = "when a GET request comes for this path, run this function." `res.send(...)` is Express's friendlier `res.end` - it sets the content-type for you.

**Middleware** is the core idea of Express. A middleware is just a function `(req, res, next)` that runs *as the request passes through*. It can look at the request, do something, and then call `next()` to pass control to the next function in line:

```js
// a logging middleware - runs for EVERY request
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();               // hand off to the next handler. FORGET THIS = request hangs forever
});
```

`app.use(...)` registers middleware that runs on the way in. **Order matters** - middleware runs top to bottom. `next()` is the baton pass. Forget `next()` and the request just... stops, and the browser spins.

---

## 3. Q1 Part B - add a new middleware for a new URL

The task: *without modifying existing code*, add a new middleware that handles `/hello123` and returns your name.

"Add, don't modify" is testing whether you understand that Express is additive - you just register another handler:

```js
// NEW - added below, nothing above touched
app.get("/hello123", (req, res) => {
    res.send("Abinaash");
});
```

Run it, visit `http://localhost:8000/hello123`, see your name. Done. That's the entire Part B.

> The Lab Test's Q2 is this exact move wearing a costume: "handle `/event123`, respond with X." Same skeleton - a new route, a specific path, a specific response. If you can do `/hello123`, you can do `/event123`.

---

## 4. Q2 - dynamic parameters

A **dynamic parameter** is a piece of the URL that's a *variable*, marked with a colon. Instead of one route per student, one route captures any value:

```js
app.get("/student/:id", (req, res) => {
    res.send("You asked for student " + req.params.id);
});
```

Visit `/student/1234567` → `req.params.id` is `"1234567"`. Visit `/student/999` → it's `"999"`. The `:id` is a slot; whatever's in that slot lands in `req.params.id`.

You can have several:

```js
app.get("/student/:id/:module", (req, res) => {
    const id = req.params.id;
    const module = req.params.module;
    res.send(`id=${id}, module=${module}`);
});
```

> "What is a dynamic parameter" (the part where you explain it to the lecturer): it's a **named placeholder in the route path** that captures part of the actual URL into `req.params`, so one route handles many values. That one sentence is the answer.

---

## 5. Q2 Part B - match ID + module, return the grade

The task gives you this data and wants: enter a student ID and module code, get back the ID, module, and grade. If no match, return `"not found"`.

```js
let grades = [
    { id: 1234567, module: "ET0123", grade: "A" },
    { id: 1234567, module: "ET0555", grade: "B" },
    { id: 2345678, module: "ET0123", grade: "C" },
    { id: 2345678, module: "ET0555", grade: "D" }
];
```

The route captures both values, then searches the array for a row matching **both**:

```js
app.get("/grade/:id/:module", (req, res) => {
    const id = req.params.id;          // note: this is a STRING from the URL
    const module = req.params.module;

    // find the first record where BOTH id and module match
    const record = grades.find(g => g.id == id && g.module == module);

    if (record) {
        res.send(`ID: ${record.id}, Module: ${record.module}, Grade: ${record.grade}`);
    } else {
        res.send("not found");
    }
});
```

The subtle, mark-losing detail: **`req.params.id` is a string** (`"1234567"`), but `grades[i].id` is a **number** (`1234567`). Comparing with `==` (loose equality) works because JS coerces types. If you use `===` (strict), `"1234567" === 1234567` is `false` and *everything* returns "not found". Two safe options:

- Use `==` (as above), or
- Convert: `Number(id) === g.id`.

Test it: `/grade/1234567/ET0123` → grade A. `/grade/1234567/ET9999` → not found. `/grade/0000000/ET0123` → not found.

---

## 6. `.find()` vs `.filter()` - pick the right tool

- **`.find(fn)`** returns the **first matching element** (or `undefined`). Use it when you expect one result - like a single grade.
- **`.filter(fn)`** returns an **array of all matches**. Use it when you might get several - like "all attendance rows for week 1" (you'll see this in the DB notes).

Getting these mixed up is a classic. "One grade" → `find`. "All the rows where..." → `filter`.

---

## 7. The whole Practice 6 Q1+Q2 file

```js
const express = require("express");
const app = express();

// logging middleware (Q1 Part A)
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Q1 Part B - new middleware, new URL, returns your name
app.get("/hello123", (req, res) => {
    res.send("Abinaash");
});

// Q2 - dynamic params + array lookup
let grades = [
    { id: 1234567, module: "ET0123", grade: "A" },
    { id: 1234567, module: "ET0555", grade: "B" },
    { id: 2345678, module: "ET0123", grade: "C" },
    { id: 2345678, module: "ET0555", grade: "D" }
];

app.get("/grade/:id/:module", (req, res) => {
    const record = grades.find(
        g => g.id == req.params.id && g.module == req.params.module
    );
    res.send(record
        ? `ID: ${record.id}, Module: ${record.module}, Grade: ${record.grade}`
        : "not found");
});

app.listen(8000, "localhost", () => console.log("http://localhost:8000"));
```

---

## 8. Mistakes that bite

- **Request hangs / browser spins forever** → a middleware forgot `next()` and never sent a response.
- **Everything returns "not found"** → you used `===` and the string-vs-number thing got you. Use `==` or `Number()`.
- **`Cannot GET /grade/...`** → your URL doesn't match the route pattern. `/grade/:id/:module` needs *two* segments after `/grade`. Visiting `/grade/1234567` (one segment) won't match.
- **Order confusion** → if you put a catch-all `app.use` that sends a response *above* your real routes, nothing below ever runs. Specific routes first, catch-alls last.

---

## 9. Recap flashcards

- `npm install express`, `const app = express()`, `app.listen(port, host, cb)`.
- Middleware = `(req, res, next)`; `app.use(...)` runs it on every request; **call `next()`** or the request hangs.
- Add a route = add `app.get("/path", handler)`. Additive - new URLs don't touch old ones.
- Dynamic param `:name` → `req.params.name` (always a **string**).
- `.find()` = first match (one thing); `.filter()` = all matches (a list).
- URL params are strings; compare to numbers with `==` or `Number()`, not `===`.

Next: forms. GET vs POST, reading what the user typed, and the registration app that is Q2 of the test. →
