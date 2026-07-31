---
title: Lab Overview — How to Actually Pass
emoji: (๑•̀ㅂ•́)و
order: 0
blurb: What the practicals and the Lab Test actually ask of you, the exact tools to install, how to run a Node file, and the handful of golden rules that separate a pass from a panic.
---

# Lab Overview — How to Actually Pass (๑•̀ㅂ•́)و

> Theory tells you *why* `res.end()` sends a response. Lab is you at a blank folder at 9am with a timer running, and it has to actually run. Different muscle. This whole module trains that muscle.

The Theory module (right next to this one) is the "understand it" half. **This** is the "do it under time pressure" half. Everything here is hands-on: you open a terminal, you type, you run, you see it work. No hand-waving.

There's a companion note at the end - **08 Sample Lab Test Walkthrough** - that rebuilds the real practice Lab Test from scratch. That note is the destination. Notes 01-07 are the climb up to it. If you only had one hour left before the test, you'd read 08. But you'd get more out of 08 if you'd done 01-07 first.

---

## 1. What the Lab Test actually looks like

Based on the sample paper, the Lab Test is **three questions**, and they are *not* random. They are lifted straight out of the practicals:

| Q | What it is | Comes from | Note here |
|---|---|---|---|
| **Q1** | A plain Node HTTP server that serves an HTML form | Practice 6 (early) | **01** |
| **Q2** | An Express app that receives a form via POST and responds | Practice 6 + registration logic | **02, 03** |
| **Q3** | A React app (Vite) with a flip card using a 3rd-party library | Practice 7 | **04** |

Notice what's **not** on the sample test: no MySQL, no MongoDB, no routing, no game. Those are still real practicals (and notes 05-07 cover them fully because your grade includes practical work), but the *test spine* is *Node HTTP → Express forms → React card*. Weight your revision accordingly. Nail 01, 03, and 04 and you've nailed the test.

> This is the single most useful sentence in this module: **the Lab Test is the practicals with the names changed.** `/hello123` becomes `/event123`. "return your name" becomes "count the registrations". Same skeleton every time.

---

## 2. The tools you need installed

Do this **before** the test day, on the machine you'll use. Nothing here should be a surprise at 9am.

- [ ] **Node.js** (LTS - Node 24.x is fine). Check: `node -v` and `npm -v` both print versions.
- [ ] **VS Code**. Your editor. Learn where the integrated terminal is: `` Ctrl+` `` (backtick).
- [ ] **A browser** - Chrome is what the notes assume. You'll live in the address bar (`localhost:8000`) and DevTools (`F12`).
- [ ] **MySQL Community Server 8.4 LTS** + the VS Code **MySQL** extension (for the database practical, note 06).
- [ ] **MongoDB Community Server + Compass** (for note 07).

You do **not** need git, GitHub, Docker, or any deployment tooling for the lab. Ignore any tutorial that starts with `git clone`. Your workflow is: make a folder, work in it, run it. That's the whole loop.

---

## 3. The one loop you repeat all day: a runnable Node project

Ninety percent of "how do I even start" is this exact sequence. Burn it into your fingers.

```bash
mkdir q1            # make a folder for the question
cd q1               # go into it
npm init -y         # create package.json (the -y accepts all defaults)
# ...write your .js file...
node yourfile.js    # run it
```

`npm init -y` makes a `package.json`. You need it the moment you install a library:

```bash
npm install express        # downloads express into node_modules/, records it in package.json
```

To run a server file: `node app.js`. It will print your `console.log` and then **sit there** (a server doesn't exit - it's waiting for requests). That's correct. To stop it, `Ctrl+C` in the terminal.

```
  a Node server "hanging" in the terminal is not frozen.
  it is listening. that is its whole job. leave it running,
  switch to the browser, hit the URL. (＾▽＾)
```

---

## 4. Server vs browser: which window am I looking at?

Every backend question (Q1, Q2) has **two windows** and beginners mix them up constantly:

- **The terminal** runs your server. `console.log` output lands *here*. Errors that crash the server land *here*.
- **The browser** is the client. You type `http://localhost:8000/form` in the address bar to send a request. The HTML your server sends back is drawn *here*.

If you changed your `.js` file, the browser refresh alone does nothing - **plain Node does not auto-reload.** You must stop the server (`Ctrl+C`) and re-run `node app.js`. (Vite/React is different - it *does* hot-reload. More in note 04.)

---

## 5. The port and localhost, demystified

`app.listen(8000, "localhost")` means "answer requests arriving on **port 8000** of this machine." In the browser you then visit `http://localhost:8000`. `localhost` = this same computer = `127.0.0.1`. The `:8000` is the port.

Common trap: **"port already in use" / `EADDRINUSE`.** That means an old server is still running on 8000. Find the old terminal and `Ctrl+C` it, or change your port to 8001. One server per port.

---

## 6. Golden rules (the stuff that saves marks)

These are ordered by how often they bite people.

1. **Read the URL you're told to hit.** If the question says `/event123`, your route must be *exactly* `/event123`. Not `/event`, not `/Event123`. Copy it character for character.
2. **Match the form's `action` and `method` to your route.** A form doing `method="post" action="/event123"` needs an `app.post("/event123", ...)`. GET form → `app.get`. Mismatch = 404 or "Cannot POST".
3. **`body-parser` (or `express.urlencoded`) or `req.body` is undefined.** If you're reading POST form fields and getting `undefined`, you forgot the parser middleware. Note 03 drills this.
4. **Send exactly one response per request.** One `res.end()` / `res.send()`. Two = `ERR_HTTP_HEADERS_SENT` crash.
5. **Run after every small change.** Don't write the whole file then run. Write the route, run, hit it, see "it works", then add the next bit.
6. **When stuck, `console.log` the thing.** `console.log(req.url)`, `console.log(req.body)`. Is the request even arriving? Is the data what you think? The log answers it in two seconds.

> "Why isn't it working" is almost never a deep mystery. It's a typo in a route path, a missing parser, or you're looking at the wrong window. Check those three first, every single time. (￣ω￣;)

---

## 7. How to use these lab notes

- **01** - Node HTTP server from a blank folder. The foundation of Q1.
- **02** - Express basics: middleware, dynamic params (Practice 6 Q1-Q2).
- **03** - Express forms: static files, GET vs POST, body-parser, the registration pattern (Practice 6 Q3 + Q2 of the test).
- **04** - React Part 1: Vite, components, props, react-card-flip (Practice 7 + Q3 of the test).
- **05** - React Part 2: state, routing, useRef, the memory game (Practice 8).
- **06** - MySQL practical, every task answered.
- **07** - MongoDB practical, every task answered.
- **08** - **The Sample Lab Test, rebuilt from scratch.** The one you re-read the night before.

Each note builds a *complete, running* thing from an empty folder. Don't just read them - open a terminal and type along. Reading code is not the same skill as writing it, and the test grades the second one.

Right. Empty folder, terminal open. Let's build a server with zero libraries. →
