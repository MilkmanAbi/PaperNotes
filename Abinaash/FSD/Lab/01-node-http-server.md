---
title: Node HTTP Server From Scratch
emoji: ⚙️(๑˃ᴗ˂)ﻭ
order: 1
blurb: Build a plain Node server with zero libraries — createServer, routing on req.url, and serving an HTML form with fs.readFile. This is Q1 of the Lab Test, start to finish.
---

# Node HTTP Server From Scratch ⚙️(๑˃ᴗ˂)ﻭ

> Before Express does anything clever, it's this: a function that gets `(req, res)` and calls `res.end()`. Learn the raw version once and Express stops being magic forever. Also - this *is* Q1 of the Lab Test. Not "based on." It *is*.

Goal of this note: from an empty folder, build a server that:

- serves an HTML **form** when you visit `/form`,
- serves a plain `<h1>Welcome</h1>` for anything else.

That's the shape of the sample test's Question 1. Everything below is transferable no matter what URL or file they ask for.

---

## 1. Set up the folder

```bash
mkdir q1
cd q1
npm init -y
```

You now have a `package.json`. We won't install anything - the HTTP and file-system tools are **built into Node**. That's the point of this question: no libraries.

Make two files: `app.js` (the server) and `form.html` (the page it serves).

---

## 2. The two core modules

Node ships with modules you `require` without installing:

```js
const { createServer } = require("node:http");   // make an HTTP server
const { readFile }     = require("node:fs");      // read files off disk
```

- `http.createServer` gives you a server object. You hand it **one function**, and Node calls that function *every time a request arrives*.
- `fs.readFile` reads a file (like your HTML) asynchronously and hands you the contents in a callback.

> The `node:` prefix (`node:http`) is the modern, explicit way to import built-ins. Plain `require("http")` also works and you'll see it in older code. Either is fine in the test.

---

## 3. The request listener - the heart of it

The function you give `createServer` receives two objects every request:

- **`req`** - the incoming request. `req.url` is the path the browser asked for (`/form`, `/`, `/anything`). `req.method` is `GET`/`POST`/etc.
- **`res`** - the response you're building. You set a status and headers, then `res.end(data)` to send it.

```js
function requestListener(req, res) {
    console.log(req.url);            // ALWAYS log this - it tells you what's arriving

    if (req.url === "/form") {
        // serve the form file (next section)
    } else {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        res.end("<h1>Welcome</h1>");
    }
}
```

Three things happen for every response you send:

1. **`res.statusCode = 200`** - 200 means "OK". (404 = not found, 400 = bad request. You'll use those in Q2.)
2. **`res.setHeader("Content-Type", "text/html")`** - tells the browser "this is HTML, render it," not plain text.
3. **`res.end(...)`** - sends the body and finishes the response. Exactly one `res.end` per request.

---

## 4. Serving the HTML file

For `/form` we read `form.html` off the disk and send its contents. `readFile` is *asynchronous* - it takes a callback that runs *when the read finishes*:

```js
if (req.url === "/form") {
    readFile("form.html", "utf-8", (err, data) => {
        if (err) {
            console.log("read error");
            res.statusCode = 500;
            res.end("File not found");
            return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        res.end(data);          // data = the file's text
    });
}
```

- `"utf-8"` means "give me the file as text," not raw bytes. Without it you'd get a `Buffer`.
- The `(err, data)` pattern is Node's classic callback signature: error first, result second. Always check `err`.
- `res.end(data)` sends the whole HTML file as the response body.

---

## 5. The HTML form

The question usually specifies the fields. A typical one (matching the sample test): Name (optional), Email (required), Gender (radio), Age (number), and a submit button.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Q1</title>
</head>
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

Details that earn marks:

- Every input needs a **`name`** attribute. That name is the key the server reads later (`req.body.email` in Q2). No `name` = the field is invisible to the server.
- `required` on the email makes the browser refuse to submit an empty email. That's what "required" in the question means - you implement it with the attribute, not with code.
- `type="radio"` with the **same `name`** ("gender") makes them mutually exclusive - picking one unpicks the other.
- In Q1 the form has no `action`/`method` yet - it's just being *displayed*. The wiring comes in Q2 (Express).

---

## 6. Start the server

At the bottom of `app.js`:

```js
const server = createServer(requestListener);

server.listen(8000, "127.0.0.1", () => {
    console.log("Server is running");
});
```

`listen(8000, "127.0.0.1", callback)` = "answer requests on port 8000 of this machine; run the callback once you're ready." `127.0.0.1` and `localhost` are the same thing.

---

## 7. The whole file, together

```js
const { readFile } = require("node:fs");
const { createServer } = require("node:http");

function requestListener(req, res) {
    console.log(req.url);

    if (req.url === "/form") {
        readFile("form.html", "utf-8", (err, data) => {
            if (err) {
                console.log("read error");
                res.statusCode = 500;
                res.end("File not found");
                return;
            }
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

const server = createServer(requestListener);

server.listen(8000, "127.0.0.1", () => {
    console.log("Server is running");
});
```

---

## 8. Run it and test it

```bash
node app.js
```

Terminal prints `Server is running` and then sits there (correct - it's listening). Now, in the browser:

- Visit `http://localhost:8000/` → you should see **Welcome**.
- Visit `http://localhost:8000/form` → you should see the **form**.
- Watch the terminal: each visit logs the URL. That `console.log(req.url)` is your X-ray.

To change the code: `Ctrl+C` to stop, edit, `node app.js` again. Plain Node has no auto-reload.

---

## 9. The mistakes that cost you here

- **Blank page at `/form`?** Is `form.html` in the *same folder* you ran `node` from? `readFile("form.html")` is relative to where you launched the process, not where the file physically is. If in doubt, log `err`.
- **Browser shows the raw HTML as text** instead of rendering it → you forgot `setHeader("Content-Type", "text/html")`.
- **`ERR_HTTP_HEADERS_SENT`** → you called `res.end` twice, or fell through into the `else` after already responding. One response per request; `return` after you send inside a branch.
- **Nothing happens / can't connect** → the server isn't running (you edited and forgot to re-run), or you're on the wrong port.

---

## 10. Recap flashcards

- `http.createServer(fn)` - `fn(req, res)` runs on **every** request.
- `req.url` = the path asked for; `req.method` = GET/POST. Log `req.url` to debug routing.
- Response = `res.statusCode` + `res.setHeader("Content-Type", ...)` + `res.end(body)`. One `end` per request.
- `fs.readFile(path, "utf-8", (err, data) => ...)` - error-first callback, `"utf-8"` for text.
- `server.listen(port, host, cb)` - server stays running; `Ctrl+C` stops it; no auto-reload.
- Every form `<input>` needs a `name`. `required` is an attribute. Radios share one `name`.

Next: the same idea, but Express does the boring parts so you can do the interesting parts. →
