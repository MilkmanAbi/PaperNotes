---
title: Forms & Inputs — Where the Page Asks
emoji: ⌨(๑•̀ㅂ•́)و
order: 2
blurb: Forms, every input type, labels, and the action/method/name attributes that decide what the server receives. This is the HTML half of the Express forms lab.
tags: html, forms, inputs, input, name, action, method, textarea, select, radio, checkbox, fieldset, required, post, validation, labels
---

# Forms & Inputs — Where the Page Asks ⌨(๑•̀ㅂ•́)و

> A form is the moment HTML stops *showing* and starts *collecting*. Everything the user types gets bundled up by `name` and sent to a server. If you've done the Express forms lab (`app.post("/event123")`), **this** is the other half — the HTML that feeds it.

---

## 1. The `<form>` shell

```html
<form action="/register" method="POST">
  <!-- inputs go here -->
  <button type="submit">Send</button>
</form>
```

Two attributes decide everything:

- **`action`** — the URL the data is sent to. This must match a route on your server (e.g. Express `app.post("/register", ...)`).
- **`method`** — how it's sent:
  - `GET` — data goes in the URL (`?name=abi&age=20`). For searches / harmless reads. Visible, bookmarkable, limited size.
  - `POST` — data goes in the request **body**, hidden from the URL. For anything that changes data or is private (registration, login).

> Match this to the server: `<form method="POST" action="/register">` needs `app.post("/register")`. Mismatch the verb or the path and you get a 404 or a "Cannot GET" — the classic form bug.

---

## 2. `name` is the whole point

Every input needs a **`name`**. That's the key the server reads it by:

```html
<input type="text" name="username">
```

On an Express server with body-parser, that arrives as `req.body.username`. **No `name` = the field is invisible to the server**, no matter what the user typed. This is the single most common "why is my form empty on the backend" bug.

`value` is optional — it pre-fills the field:

```html
<input type="text" name="country" value="Singapore">
```

---

## 3. Input types — one tag, many shapes

`<input>` is a shape-shifter; `type` decides what it becomes:

```html
<input type="text"     name="username" placeholder="your name">
<input type="password" name="pw">
<input type="email"    name="email">
<input type="number"   name="age" min="0" max="120">
<input type="date"     name="dob">
<input type="checkbox" name="agree">
<input type="radio"    name="plan" value="free">
<input type="radio"    name="plan" value="pro">
<input type="file"     name="photo">
<input type="hidden"   name="userId" value="123">
<input type="submit"   value="Go">
```

Useful notes:
- **Radio buttons** with the **same `name`** form a group — the user picks one, and its `value` is sent. Give each a distinct `value`.
- **Checkbox** sends its value only when ticked; unticked = absent from the body.
- `placeholder` is grey hint text, *not* a value. It disappears when they type.
- `min`/`max`/`required` give you free browser-side validation.

Bigger boxes and dropdowns aren't `<input>`:

```html
<textarea name="bio" rows="4" placeholder="tell us about yourself"></textarea>

<select name="module">
  <option value="fsd">Full Stack Dev</option>
  <option value="mad">Mobile App Dev</option>
</select>
```

---

## 4. Labels — accessibility + bigger click targets

Always pair inputs with a `<label>`. Two ways:

```html
<!-- link by id -->
<label for="email">Email</label>
<input type="email" id="email" name="email">

<!-- or wrap it -->
<label>
  Email
  <input type="email" name="email">
</label>
```

Clicking the label focuses the input, and screen readers announce it properly. Free usability. Do it.

---

## 5. A complete, realistic form

```html
<form action="/register" method="POST">
  <label for="name">Name</label>
  <input type="text" id="name" name="name" required>

  <label for="age">Age</label>
  <input type="number" id="age" name="age" min="0" required>

  <fieldset>
    <legend>Plan</legend>
    <label><input type="radio" name="plan" value="free" checked> Free</label>
    <label><input type="radio" name="plan" value="pro"> Pro</label>
  </fieldset>

  <label><input type="checkbox" name="newsletter"> Email me updates</label>

  <button type="submit">Register</button>
</form>
```

On the server that's `req.body.name`, `req.body.age`, `req.body.plan`, and `req.body.newsletter` (present only if ticked). `<fieldset>` + `<legend>` group related controls with a caption — nice for radios.

---

## 6. Validation (the free kind)

The browser can block a bad submit before it ever hits your server:

```html
<input type="email" name="email" required>     <!-- must be filled + look like an email -->
<input type="text" name="user" minlength="3" maxlength="15">
<input type="number" name="age" min="18">
<input type="text" name="code" pattern="[A-Z]{3}" title="3 capital letters">
```

This is **convenience, not security** — anyone can bypass browser validation. Your server must *still* validate everything (the lab's `age >= 18` check lives on the server for exactly this reason). Client validation = nice UX; server validation = actual safety.

---

## the point (ง •̀_•́)ง

- `<form action method>` decides *where* and *how*; match it to your server route + verb.
- Every field needs a **`name`** — that's `req.body.<name>`. No name, no data.
- `type` reshapes `<input>`; radios share a name, checkboxes send only when ticked.
- Label everything. Validate on the client for UX, on the server for real.

Next: tables, media, and the meta/accessibility habits that separate "works" from "good". ପ(๑•ᴗ•๑)ଓ
