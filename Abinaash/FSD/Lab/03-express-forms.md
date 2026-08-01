---
title: Express Forms — Static, POST & the Registration App
emoji: (ﾟヮﾟ)
order: 3
blurb: Serving a form, GET vs POST, body-parser, and reading req.body — then the full registration app with a running counter and conditional logic. This is Q2 of the Lab Test, built line by line.
---

# Express Forms — Static, POST & the Registration App (ﾟヮﾟ)

> This is the backend boss fight. If you can build the registration app in this note from a blank folder, Q2 of the Lab Test is a formality. It's the highest-value single note in the Lab module.

We're covering **Practice 6 Q3** (forms, GET vs POST) and folding it straight into the **Sample Lab Test Q2** (a form that POSTs to `/event123`, shows a confirmation, and counts registrations). Same machinery.

---

## 1. Project setup

```bash
mkdir q2
cd q2
npm init -y
npm install express body-parser
```

Folder layout we're aiming for:

```
q2/
├── app.js            ← the server
├── package.json
└── www/
    └── form.html     ← the form, served as a static file
```

Make the `www` folder and put `form.html` inside it. Why a subfolder? Because we'll serve it with the **static middleware**, which is the standard way to hand plain files (HTML, CSS, images) to the browser.

---

## 2. Serving the form as a static file

```js
const express = require("express");
const app = express();

app.use("/www", express.static("www"));

app.listen(8000, "localhost");
```

`express.static("www")` = "serve the files in the `www` folder as-is." Mounting it at `/www` means the file `www/form.html` is reachable at `http://localhost:8000/www/form.html`.

Visit that URL - you should see your form. No route handler needed; static middleware does it.

---

## 3. GET vs POST - the actual difference

A form sends its data one of two ways, set by its `method` attribute:

| | GET | POST |
|---|---|---|
| Where the data goes | in the **URL** (`?name=abi&age=20`) | in the **request body** (hidden from the URL) |
| Visible in address bar? | yes | no |
| Read it on the server with | `req.query` | `req.body` |
| Good for | searches, filters, links you bookmark | submitting data, passwords, anything private |

Same form, `method="get"` → the fields land in `req.query`; `method="post"` → they land in `req.body`. That's the whole distinction the practical wants you to be able to explain: **GET puts data in the URL (`req.query`), POST puts it in the body (`req.body`).**

> Rule of thumb: reading/searching → GET. Changing/creating something (registering, posting a message) → POST. The registration form is a POST.

---

## 4. The form HTML

`www/form.html` - note the `method` and `action`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Q2</title>
</head>
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

The two attributes that wire the form to your server:

- **`method="post"`** → the browser sends a POST request. Your server needs `app.post`.
- **`action="/event123"`** → it sends that request to `/event123`. Your route path must be *exactly* `/event123`.

Get either wrong and you'll see "Cannot POST /..." - that's the browser telling you no route matched.

---

## 5. body-parser - or `req.body` is undefined

When a POST arrives, the form fields sit in the request body as raw encoded text. Something has to *parse* that into a usable `req.body` object. That something is `body-parser`:

```js
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded());
```

`urlencoded` is the format HTML forms use. After this middleware, a form field `name="email"` becomes `req.body.email`. **Without it, `req.body` is `undefined` and you'll crash trying to read `.email` off undefined.** This is the single most common Express-forms bug.

> Modern Express (5.x) has this built in as `express.urlencoded()` - no separate install. Your course uses the `body-parser` package explicitly, so match that in the test. Both do the identical thing. If you ever see a deprecation nag, `bodyParser.urlencoded({ extended: false })` silences it.

---

## 6. The POST handler - read the body, build a response

Now the core. A POST to `/event123` reads the submitted fields and sends back a confirmation page:

```js
app.post("/event123", (req, res, next) => {
    let content = "<h1>Registration is successful</h1>";

    // name is optional - only show it if they typed one
    if (req.body.name != "") {
        content += "<p>Name : " + req.body.name + "</p>";
    }

    content += "<p>Email : " + req.body.email + "</p>";
    content += "<p>Gender : " + req.body.gender + "</p>";
    content += "<p>Age : " + req.body.age + "</p>";

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(content);
});
```

What's happening: you build an HTML string piece by piece, reading each field off `req.body`, then send the whole string. The **conditional** - `if (req.body.name != "")` - is the practical's "name is optional" requirement in code: show the name line only when a name was actually entered.

---

## 7. Adding the two bits that make it the Lab Test question

The sample test adds two twists on top. Both are small and both are worth marks.

**(a) An age-based message.** If the person is an adult, add a line:

```js
if (req.body.age >= 18) {
    content += "<p>We will collect $5.00/adult on the day of event</p>";
}
```

`req.body.age` is a string like `"20"`, but `>=` coerces it to a number, so `"20" >= 18` works. (If you wanted to be explicit: `Number(req.body.age) >= 18`.)

**(b) A running counter.** Keep a list of everyone who registered, and show the total each time. Declare the array **once, outside** the handler (so it survives between requests), and push to it inside:

```js
let records = [];        // <-- OUTSIDE the handler, at the top

app.post("/event123", (req, res, next) => {
    // ...build content as above...

    records.push(req.body.email);       // remember this registration
    content += "<p style='color: red'>Total number registered: "
             + records.length + "</p>";

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(content);
});
```

Why outside? A variable declared *inside* the handler is reborn empty on every request - it'd always say "1". Declared *outside*, it's one shared array that grows: register three people, `records.length` is 3. That "state persists across requests in a module-level variable" idea is exactly what's being tested.

> This is the same pattern as the `grades` array in note 02 and the in-memory data in the Theory Express note - a plain array living at module scope, acting as your "database" for the lab. No real DB needed.

---

## 8. A catch-all for bad requests

The sample answer ends with a fallback so that hitting the server the wrong way gives a clean error instead of a confusing 404:

```js
app.get((req, res, next) => {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html");
    res.end("<h1>Invalid Request</h1>");
});
```

This is a GET handler with **no path**, so in Express it acts as a catch-all for GET requests that didn't match anything above. Put it **last** - middleware runs top to bottom, so a catch-all only makes sense at the bottom. (A more conventional catch-all is `app.use((req,res) => res.status(400).send(...))`; the pathless `app.get` in the sample does the job for GETs.)

---

## 9. The complete app.js

```js
const express = require("express");
const bodyParser = require("body-parser");

const app = express();

app.use(bodyParser.urlencoded());
app.use("/www", express.static("www"));

let records = [];

app.post("/event123", (req, res, next) => {
    let content = "<h1>Registration is successful</h1>";

    if (req.body.name != "") {
        content += "<p>Name : " + req.body.name + "</p>";
    }
    content += "<p>Email : " + req.body.email + "</p>";
    content += "<p>Gender : " + req.body.gender + "</p>";
    content += "<p>Age : " + req.body.age + "</p>";

    if (req.body.age >= 18) {
        content += "<p>We will collect $5.00/adult on the day of event</p>";
    }

    records.push(req.body.email);
    content += "<p style='color: red'>Total number registered: "
             + records.length + "</p>";

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(content);
});

app.get((req, res, next) => {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html");
    res.end("<h1>Invalid Request</h1>");
});

app.listen(8000, "localhost");
```

---

## 10. Run and test the full loop

```bash
node app.js
```

1. Open `http://localhost:8000/www/form.html` - the form shows.
2. Fill it in, submit. The browser POSTs to `/event123` and you land on the confirmation page.
3. Submit again with a different email - "Total number registered" ticks up. That proves your `records` array is persisting.
4. Try submitting with the name blank - the Name line should vanish (that's your `if`).
5. Try age 20 vs age 15 - the $5 line appears only for the adult.

If you're debugging, `console.log(req.body)` at the top of the handler shows you exactly what arrived. If it's `undefined`, you forgot the body-parser line.

---

## 11. The GET version (Practice 6 Q3 Part D)

The practical also asks for a GET version of the same idea. Two changes: form uses `method="get"`, server reads `req.query` instead of `req.body`, and you use `app.get`:

```html
<form method="get" action="/event123">...</form>
```

```js
app.get("/event123", (req, res) => {
    // same logic, but read from req.query
    let content = "<p>Email : " + req.query.email + "</p>";
    res.send(content);
});
```

After submitting a GET form, look at the address bar - you'll see the data sitting right there in the URL (`?name=abi&email=...`). That visibility is the whole GET-vs-POST lesson, made concrete. (And why you'd never send a password via GET.)

---

## 12. Recap flashcards

- `express.static("www")` serves plain files; mounted at `/www` → `www/form.html` at `/www/form.html`.
- Form `method` + `action` must match your server: POST form → `app.post` on the exact `action` path.
- **`app.use(bodyParser.urlencoded())` or `req.body` is undefined.** #1 forms bug.
- POST data → `req.body.field`; GET data → `req.query.field`.
- Build the response as an HTML string; conditionals (`if name != ""`, `if age >= 18`) add lines.
- Counter that survives requests = an array declared **outside** the handler; `.push()` inside; `.length` is the count.
- Send exactly one response; catch-all handler goes **last**.

Next: the front end. Vite, React, and a flip card - Q3 of the test. →
