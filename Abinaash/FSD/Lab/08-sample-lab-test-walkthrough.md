---
title: Sample Lab Test — Rebuilt From Scratch
emoji: (☞ﾟヮﾟ)☞✧
order: 8
blurb: The real practice Lab Test, all three questions, rebuilt from an empty folder with the exact reasoning — plus a pre-flight checklist, a time budget, the mistakes that quietly cost marks, and a stuck-in-the-test triage. The one you re-read the night before.
---

# Sample Lab Test — Rebuilt From Scratch (☞ﾟヮﾟ)☞✧

> This is the destination the whole Lab module was climbing toward. Three questions, each rebuilt from `mkdir` to "it runs." If you can do this note without looking, you're ready. Read it the night before; do it with your hands the week before.

The sample test is three independent mini-projects in three folders:

| Q | What | Skills | Deep-dive note |
|---|---|---|---|
| **Q1** | Plain Node HTTP server that serves a form | `http`, `fs`, routing | **01** |
| **Q2** | Express app: form POSTs, server responds + counts | Express, body-parser, static, state | **02, 03** |
| **Q3** | React (Vite) flip card with a 3rd-party library | Vite, components, props, useState | **04** |

No database. No routing. No game. Just these three. Let's build each.

---

## Q1 - Node HTTP server serving a form

**Ask:** a server that serves `form.html` at `/form`, and `<h1>Welcome</h1>` for anything else. Plain Node, no Express.

**Setup:**

```bash
mkdir q1 && cd q1 && npm init -y
```

Two files: `app.js`, `form.html`.

**`form.html`** - fields: name (optional), email (required), gender (radio), age (number), submit:

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Q1</title></head>
<body>
    <form>
        Name (optional): <input type="text" name="name"><br>
        Email (required): <input type="email" name="email" required><br>
        Gender:
          <input type="radio" name="gender" value="male">Male
          <input type="radio" name="gender" value="female">Female<br>
        Age: <input type="number" name="age"><br>
        <input type="submit" value="submit">
    </form>
</body>
</html>
```

**`app.js`:**

```js
const { readFile } = require("node:fs");
const { createServer } = require("node:http");

function requestListener(req, res) {
    console.log(req.url);
    if (req.url === "/form") {
        readFile("form.html", "utf-8", (err, data) => {
            if (err) { res.statusCode = 500; res.end("error"); return; }
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html");
            res.end(data);
        });
    } else {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        res.end("<h1>Welcome</h1>");
    }
}

createServer(requestListener).listen(8000, "127.0.0.1", () => {
    console.log("Server is running");
});
```

**Run & check:** `node app.js` → visit `/` (Welcome) and `/form` (the form). Watch the terminal log each URL.

**The 3 things markers look for:** correct route check on `req.url`; `Content-Type: text/html` set; `form.html` actually served via `readFile`. That's Q1.

---

## Q2 - Express registration app

**Ask:** serve a form, it POSTs to `/event123`, the server replies with a confirmation showing the fields, adds a "$5.00/adult" line when age ≥ 18, and shows a running total of registrations. Bad requests get an "Invalid Request".

**Setup:**

```bash
mkdir q2 && cd q2 && npm init -y
npm install express body-parser
mkdir www
```

Files: `app.js`, `www/form.html`.

**`www/form.html`** - same fields, now wired with `method` + `action`:

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Q2</title></head>
<body>
    <form method="post" action="/event123">
        Name (optional): <input type="text" name="name"><br>
        Email (required): <input type="email" name="email" required><br>
        Gender:
          <input type="radio" name="gender" value="male">Male
          <input type="radio" name="gender" value="female">Female<br>
        Age: <input type="number" name="age"><br>
        <input type="submit" value="submit">
    </form>
</body>
</html>
```

**`app.js`:**

```js
const express = require("express");
const bodyParser = require("body-parser");
const app = express();

app.use(bodyParser.urlencoded());
app.use("/www", express.static("www"));

let records = [];                              // OUTSIDE the handler - persists

app.post("/event123", (req, res, next) => {
    let content = "<h1>Registration is successful</h1>";

    if (req.body.name != "") {                 // name optional
        content += "<p>Name : " + req.body.name + "</p>";
    }
    content += "<p>Email : "  + req.body.email  + "</p>";
    content += "<p>Gender : " + req.body.gender + "</p>";
    content += "<p>Age : "    + req.body.age    + "</p>";

    if (req.body.age >= 18) {                   // adult message
        content += "<p>We will collect $5.00/adult on the day of event</p>";
    }

    records.push(req.body.email);               // count this registration
    content += "<p style='color: red'>Total number registered: "
             + records.length + "</p>";

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(content);
});

app.get((req, res, next) => {                    // catch-all, LAST
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html");
    res.end("<h1>Invalid Request</h1>");
});

app.listen(8000, "localhost");
```

**Run & check:** `node app.js` → open `http://localhost:8000/www/form.html` → submit. Verify: confirmation shows the fields; name line disappears when blank; "$5.00" appears only for age ≥ 18; "Total number registered" climbs each submit.

**The things markers look for:** `body-parser` present (or `req.body` is undefined); route path exactly `/event123`; the `if (name != "")` and `if (age >= 18)` conditionals; `records` declared **outside** the handler so the count survives. If your total always says "1", that array is in the wrong place.

---

## Q3 - React flip card

**Ask:** a Vite React app with a card that flips between two images on button click, using `react-card-flip`, plus a message that toggles (Einstein ↔ Tesla).

**Setup:**

```bash
npm create vite@latest      # name it, choose React, JavaScript
cd <name>
npm install
npm install react-card-flip
```

Put `p1.jpg` and `p2.jpg` in `public/`. Files to write: `src/App.jsx`, `src/component/Card.jsx`, `src/component/Card.css`.

**`src/component/Card.jsx`:**

```jsx
import ReactCardFlip from "react-card-flip";
import "./Card.css";

function Card(prop) {
    return (
        <ReactCardFlip isFlipped={prop.flip}>
            <img src="p1.jpg" />
            <img src="p2.jpg" />
        </ReactCardFlip>
    );
}
export default Card;
```

**`src/component/Card.css`:**

```css
img { height: 400px; width: 300px; }
```

**`src/App.jsx`:**

```jsx
import { useState } from "react";
import Card from "./component/Card";

function App() {
    const [flip, setFlip] = useState(false);
    const [msg, setMsg]   = useState("Einstein");

    function handleClick() {
        if (flip === true) { setMsg("Einstein"); }
        else               { setMsg("Tesla"); }
        setFlip(!flip);
    }

    return (
        <>
            <Card flip={flip} />
            <input type="button" onClick={handleClick} value="Flip the card" />
            <br />
            {msg}
        </>
    );
}
export default App;
```

**Run & check:** `npm run dev` → open the printed URL → click the button → card flips, label swaps. (Vite hot-reloads, so no restart while editing.)

**The things markers look for:** `react-card-flip` installed and imported; `isFlipped` driven by a `flip` **prop** (Card holds no state - the parent does); `useState` for both `flip` and `msg`; `setFlip(!flip)` toggling; `onClick={handleClick}` with **no** parentheses.

---

## Pre-flight checklist (run through this before the test)

- [ ] `node -v`, `npm -v` both work.
- [ ] You can do the full loop blind: `mkdir` → `cd` → `npm init -y` → write → `node app.js`.
- [ ] You can write the plain-Node server (Q1) from memory - `createServer`, `req.url`, `readFile`, `res.end`.
- [ ] You can write the Express form handler (Q2) from memory - `body-parser`, `express.static`, `app.post`, `req.body`, the two conditionals, the `records` array outside.
- [ ] You can scaffold Vite + install a library + pass a prop + `useState` toggle (Q3).
- [ ] You know the difference between `req.body` (POST) and `req.query` (GET).
- [ ] You know: server logs → terminal; page → browser; plain Node needs a restart, Vite doesn't.

---

## Time budget (a sane split for a ~2-3h test)

```
Q1  Node HTTP      ~25 min   (it's the smallest - do it first for a quick win)
Q2  Express form   ~50 min   (most logic - the counter + conditionals)
Q3  React card     ~40 min   (Vite scaffold eats time; install early)
────────────────────────────
buffer             the rest  (testing, fixing, re-reading the question)
```

Start Q3's `npm create vite` + `npm install` **early** if you can - downloads take minutes and you don't want to watch a progress bar with the clock running. Get the smallest question (Q1) banked first so you've got marks in the bag before the fiddly one.

---

## Stuck-in-the-test triage (in order)

1. **Read the error.** Terminal (server crash) or browser DevTools console `F12` (React). It names the file and line. Most "stuck" is an unread error.
2. **`console.log` the suspect.** `console.log(req.url)`, `console.log(req.body)`. Is the request arriving? Is the data shaped how you think?
3. **Check the three usual suspects:** typo in the route path / wrong window / missing `body-parser`.
4. **Re-read the question.** The exact URL, the exact field names, the exact condition. Half of "wrong output" is "answered a slightly different question."
5. **Did you restart?** Plain Node: `Ctrl+C` and `node app.js` again after every edit. (React/Vite auto-reloads - if *that's* stale, hard-refresh the browser.)
6. **One response per request.** `ERR_HTTP_HEADERS_SENT` = you sent two. Add a `return` after the one you meant.

> The test isn't trying to trick you. It's the practicals with the nouns swapped. If you built the things in notes 01, 03, and 04 with your own hands - not just read them - you already know how to pass. The panic is just unfamiliarity, and you've now done each of these from a blank folder. (๑•̀ㅂ•́)و

---

## Recap flashcards (the whole Lab module, one screen)

- **Q1** = raw Node: `createServer((req,res)=>...)`, route on `req.url`, `readFile` the html, `res.end`.
- **Q2** = Express form: `bodyParser.urlencoded()` + `express.static` + `app.post("/exact-path")`, read `req.body.*`, conditionals, `records` array **outside** the handler, one `res.end`.
- **Q3** = React: `npm create vite` → install lib → Card takes a `flip` **prop** → App owns `useState`, `onClick={fn}`, `setFlip(!flip)`.
- POST → `req.body`; GET → `req.query`. Parser or `req.body` is undefined.
- Server output → terminal; page → browser. Plain Node: restart. Vite: don't.
- When stuck: read the error → log the data → check path/window/parser → re-read the question.

That's the module. Go build the three folders one more time without looking. Then you're done. →
