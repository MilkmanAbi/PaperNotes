---
title: How the Web Works
emoji: (｀・ω・´)
order: 1
blurb: HTTP, methods, status codes, headers, REST, and JSON — the physics every full-stack app obeys.
---

# How the Web Works (｀・ω・´)

> Before you can build on the web, you have to know what the web *is*. This chapter has zero MERN in it and is the most important chapter in the module.

Everything in full-stack development rides on one protocol: **HTTP**. Get this genuinely solid and Express/React/fetch all become obvious. Skim it and you'll be confused for months without knowing why.

---

## 1. Client and server

- A **client** is whoever *asks*. Usually a web browser. Could also be your phone app, another server, or a tool like Postman.
- A **server** is whoever *answers*. A program running on some computer, waiting for requests, sending back responses.

The relationship is strictly **request → response**. The client always speaks first. The server cannot randomly push you something out of nowhere over plain HTTP — it only ever *replies*. (Real-time push exists via WebSockets, but that's a separate thing layered on top. For this module: client asks, server answers, done.)

A single server answers thousands of clients. Your Express app is one server; every browser tab that hits it is a client.

---

## 2. URLs — the address of a thing

```
https://api.example.com:443/notes/42?sort=recent#top
└─┬─┘   └──────┬───────┘└┬┘└───┬───┘└────┬────┘└┬┘
scheme      host       port  path      query  fragment
```

- **scheme** — `http` or `https` (`https` = encrypted, always use it in production).
- **host** — which server (a domain name that resolves to an IP address via DNS).
- **port** — which door on that server (defaults: 80 for http, 443 for https; in dev you'll see `:3000`, `:5173`, etc.).
- **path** — *which resource* on that server. This is what Express routing matches on.
- **query string** — extra parameters after `?`, as `key=value&key2=value2`. Used for filters, search, pagination.
- **fragment** — after `#`, only the browser sees it; never sent to the server.

You will spend a lot of time thinking about **paths** and **query strings**, because that's how the client tells the server *what it wants*.

---

## 3. The anatomy of an HTTP request

Every request is just text in a strict format:

```
GET /notes/42 HTTP/1.1          ← method + path + version  (the "request line")
Host: api.example.com           ┐
Authorization: Bearer eyJhb...  │ headers  (metadata about the request)
Accept: application/json        ┘
                                ← blank line
(body — optional, only for POST/PUT/PATCH)
```

Three parts:
1. **Request line** — the method (verb), the path, the HTTP version.
2. **Headers** — key/value metadata: who you are, what format you want back, what format the body is in, auth tokens, cookies.
3. **Body** — the actual payload, only present when you're *sending* data (creating/updating). A GET has no body.

The response mirrors it:

```
HTTP/1.1 200 OK                 ← version + status code + reason
Content-Type: application/json  ← headers
Content-Length: 128
                                ← blank line
{"id":42,"title":"My note"}     ← body (the data you asked for)
```

---

## 4. HTTP methods (verbs) — what you want to *do*

The method tells the server your **intent**. This maps directly onto how you'll design an API.

| Method | Intent | Has body? | Example |
|---|---|---|---|
| **GET** | Read / fetch. Never changes data. | No | `GET /notes` → list notes |
| **POST** | Create something new. | Yes | `POST /notes` + body → make a note |
| **PUT** | Replace an existing thing entirely. | Yes | `PUT /notes/42` → overwrite note 42 |
| **PATCH** | Update part of an existing thing. | Yes | `PATCH /notes/42` → change just the title |
| **DELETE** | Remove something. | Usually no | `DELETE /notes/42` → delete note 42 |

Two properties worth knowing the words for:

- **Safe** — doesn't change server state. GET is safe. (Refreshing a GET a hundred times is fine.)
- **Idempotent** — doing it repeatedly has the same effect as doing it once. GET, PUT, DELETE are idempotent. **POST is not** — POST twice and you created two notes. This is exactly why double-clicking a "Submit" button can create duplicate records, and why you sometimes disable the button after the first click.

---

## 5. Status codes — how the server says how it went

The three-digit number in the response. Learn the *ranges* first, then the common individuals.

| Range | Meaning | Vibe |
|---|---|---|
| **1xx** | Informational | rare, ignore for now |
| **2xx** | Success | it worked (｡•̀ᴗ-)✧ |
| **3xx** | Redirect | "go look over there instead" |
| **4xx** | **Client** error | *you* (the request) messed up |
| **5xx** | **Server** error | *the server* messed up |

The one distinction that matters constantly: **4xx is your fault, 5xx is the server's fault.** If you're getting a 400, stop staring at the server code — fix your request. If you're getting a 500, the request was fine and the server threw up; go read the server logs.

The individuals you'll actually use:

- **200 OK** — generic success (GET worked, here's your data).
- **201 Created** — success, and I made a new resource (return this from POST).
- **204 No Content** — success, and there's deliberately nothing to send back (good for DELETE).
- **400 Bad Request** — malformed / invalid input from the client.
- **401 Unauthorized** — you're not logged in (you have no valid credentials). *Misnamed — it really means "unauthenticated."*
- **403 Forbidden** — you *are* logged in but you're not allowed to do this.
- **404 Not Found** — no such resource / route.
- **409 Conflict** — you're fighting existing state (e.g. email already registered).
- **422 Unprocessable Entity** — syntactically fine but semantically invalid (common for validation failures).
- **500 Internal Server Error** — an unhandled exception in your server code.

Sending the *right* status code is part of building a good API. A validation failure is a 400/422, not a 200 with `{"error": ...}` in the body. Clients (and other developers) rely on the code.

---

## 6. Headers you'll meet

- **`Content-Type`** — what format the body is. For us, almost always `application/json`. If you send a body and forget this, the server may not parse it.
- **`Accept`** — what format the client *wants* back.
- **`Authorization`** — carries credentials, usually `Bearer <token>` for JWT auth (chapter 09).
- **`Set-Cookie` / `Cookie`** — the server sets a cookie; the browser sends it back automatically on future requests. This is how classic sessions/logins work.
- **CORS headers** (`Access-Control-Allow-Origin`, ...) — the browser's rule that a page from `siteA.com` can't call an API on `siteB.com` unless `siteB` explicitly allows it. You *will* hit a CORS error the first time your React dev server (port 5173) calls your Express API (port 3000). It's not a bug in your code; it's the browser doing its job. Fix in chapter 04/09.

---

## 7. REST — a convention for designing APIs

**REST** (Representational State Transfer) isn't a technology, it's a *style* — a set of sensible conventions for structuring an HTTP API around **resources** (nouns) and **methods** (verbs).

The core idea: your URLs name *things* (resources), and the HTTP method says what to do to them. **Nouns in the path, verbs as the method.**

A RESTful "notes" API looks like this — and notice how boring and predictable it is (that's the point):

| Method + path | What it does |
|---|---|
| `GET /api/notes` | list all notes |
| `GET /api/notes/42` | get one note (id 42) |
| `POST /api/notes` | create a note (data in body) |
| `PUT /api/notes/42` | replace note 42 |
| `PATCH /api/notes/42` | edit part of note 42 |
| `DELETE /api/notes/42` | delete note 42 |

This full set — Create, Read, Update, Delete — is called **CRUD**. A "CRUD app" is the bread and butter of full-stack development, and your ET0744 project is almost certainly one. Master a single clean CRUD resource and you can build almost anything by repeating the pattern.

**Anti-patterns** (what *not* to do):
- ❌ `GET /api/getNotes` — verb in the path. The method *is* the verb.
- ❌ `POST /api/notes/42/delete` — use `DELETE /api/notes/42`.
- ❌ Using GET to change data — GETs are supposed to be safe; search engines and browsers will "click" them for you.

REST is a convention, not a law — you'll see APIs that bend it. But for this module, hold the convention; it's what graders and teammates expect, and it makes your own code predictable.

---

## 8. JSON — the language everything speaks

**JSON** (JavaScript Object Notation) is the text format that data travels in. It looks like a JavaScript object literal, because it basically is one.

```json
{
  "id": 42,
  "title": "Buy graph paper",
  "done": false,
  "tags": ["shopping", "stationery"],
  "meta": { "createdBy": "abi", "priority": 3 }
}
```

Rules JSON is strict about (and JS objects are not):
- Keys **must** be in double quotes.
- Strings use **double** quotes only (no single quotes).
- Allowed value types: string, number, boolean, `null`, array, object. **No functions, no `undefined`, no comments, no trailing commas.**

In JavaScript you convert between JSON text and real objects with two functions you'll use constantly:

```js
const obj  = JSON.parse('{"title":"hi"}');   // string  → object
const text = JSON.stringify({ title: "hi" }); // object  → string
```

- The browser's `fetch` gives you a response; `await res.json()` runs `JSON.parse` for you.
- Express's `res.json(obj)` runs `JSON.stringify` for you and sets `Content-Type: application/json`.
- MongoDB stores documents that *look* like JSON (technically BSON — binary JSON — more in chapter 05).

So JSON is the common tongue across all four MERN layers. It's not a coincidence the stack is all-JavaScript; JSON is JS's native shape, so nothing gets lost in translation.

---

## 9. Stateless — the thing that trips people up

HTTP is **stateless**: each request is independent and carries *no memory* of previous requests. The server doesn't "remember" you between requests unless you make it.

So how do logins work? On each request you re-prove who you are, by sending something the server can check:
- a **cookie** the browser stores and re-sends automatically, or
- a **token** (JWT) you attach in the `Authorization` header.

We'll build token auth in chapter 09. For now just hold the idea: **the server forgets you the instant it replies; every request must re-identify itself.** A huge number of "why am I logged out?" bugs come from not respecting statelessness.

---

## Recap flashcards

- Client asks, server answers. Always in that order. (request → response)
- A request = method + path + headers + optional body.
- Method = intent: GET read, POST create, PUT/PATCH update, DELETE remove.
- Status: 2xx ok, 4xx your fault, 5xx server's fault.
- REST = nouns in the path, verbs as the method; CRUD is the core four.
- JSON is the data format; `parse` string→object, `stringify` object→string.
- HTTP is stateless — every request re-identifies itself.

Next: the JavaScript features you actually need before any of this becomes code. →
