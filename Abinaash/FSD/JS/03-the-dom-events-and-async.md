---
title: The DOM, Events & a Taste of Async
emoji: ✨(ノ˃ᵕ˂)ノ
order: 3
blurb: How JS reaches into the page - selecting and changing elements, reacting to clicks and input, then a first look at promises, async/await and fetch. The bridge to the rest of the stack.
tags: javascript, dom, events, querySelector, addEventListener, preventDefault, createElement, textContent, fetch, async, await, promises
---

# The DOM, Events & a Taste of Async ✨(ノ˃ᵕ˂)ノ

> Everything so far ran in a vacuum. This note connects JS to the actual **page** — grabbing elements, changing them, and reacting when the user does things. Then a first taste of **async**, which is how JS talks to servers without freezing. This is the bridge to React and the MERN half of the module.

---

## 1. The DOM — your page as objects

When the browser loads your HTML, it turns every tag into a JavaScript object you can poke. That living tree of objects is the **DOM** (Document Object Model). The entry point is `document`.

```html
<h1 id="title">Hello</h1>
<button id="btn">Click</button>
<ul id="list"></ul>
```

---

## 2. Selecting elements

Grab elements so you can work with them:

```js
// by id — one element
const title = document.getElementById("title");

// the modern all-rounders (use CSS selector syntax):
const btn  = document.querySelector("#btn");     // first match
const items = document.querySelectorAll(".item"); // ALL matches (a list)
```

`querySelector` takes any CSS selector — `#id`, `.class`, `tag`, `.a .b` — so it's usually all you need. `querySelectorAll` gives you a list you can loop over.

---

## 3. Changing elements

Once you've got an element, you can read and rewrite it:

```js
title.textContent = "Goodbye";        // change the text (safe)
title.innerHTML = "<em>Goodbye</em>"; // change the HTML inside (careful — see note)

title.style.color = "hotpink";        // inline style
title.classList.add("active");        // add a CSS class
title.classList.remove("hidden");
title.classList.toggle("open");       // on/off

const input = document.querySelector("#name");
input.value;                          // read what's typed in a form field
```

> `textContent` vs `innerHTML`: use `textContent` for plain text (safe). Only use `innerHTML` when you truly need tags, and never with untrusted user input — that's how XSS attacks get in.

**Creating** elements from scratch:

```js
const li = document.createElement("li");
li.textContent = "new item";
document.querySelector("#list").appendChild(li);
```

---

## 4. Events — reacting to the user

This is where pages come alive. `addEventListener` runs a function when something happens:

```js
const btn = document.querySelector("#btn");

btn.addEventListener("click", () => {
  console.log("clicked!");
});
```

Common events: `click`, `input` (typing), `change`, `submit` (forms), `keydown`, `mouseover`. The function you pass is the **event handler**; it gets an `event` object with details:

```js
const input = document.querySelector("#name");

input.addEventListener("input", (event) => {
  console.log(event.target.value);   // logs the field's text as you type
});
```

**Forms** — stop the page reloading and handle it yourself:

```js
const form = document.querySelector("#myform");

form.addEventListener("submit", (event) => {
  event.preventDefault();   // stop the default page reload
  const name = form.querySelector("#name").value;
  console.log("submitting", name);
});
```

`event.preventDefault()` is the key line — without it, the browser reloads and your JS never gets to run.

---

## 5. A tiny complete example

```html
<input id="todo" placeholder="add a task">
<button id="add">Add</button>
<ul id="list"></ul>
```

```js
const input = document.querySelector("#todo");
const list  = document.querySelector("#list");

document.querySelector("#add").addEventListener("click", () => {
  if (!input.value) return;              // ignore empty
  const li = document.createElement("li");
  li.textContent = input.value;          // use what was typed
  list.appendChild(li);                  // add it to the page
  input.value = "";                      // clear the box
});
```

Select → listen → create → append. That pattern is 80% of vanilla DOM work. (React exists so you *stop* doing this by hand — but understanding it makes React make sense.)

---

## 6. A taste of async — not freezing while you wait

Some things take time: fetching data from a server, a timer. JS doesn't sit and wait — it carries on and deals with the result **later**. That's **asynchronous** code.

The simplest example:

```js
console.log("A");
setTimeout(() => console.log("B"), 1000);  // runs after 1 second
console.log("C");
// prints: A, C, then B  ← C didn't wait for B
```

**Promises** represent "a value that isn't ready yet". **`fetch`** (getting data over the network) returns one:

```js
fetch("https://api.example.com/users")
  .then(response => response.json())   // when it arrives, parse JSON
  .then(data => console.log(data))     // then use it
  .catch(err => console.log("failed", err));
```

**`async`/`await`** is the cleaner way to write the same thing — it *looks* synchronous but doesn't block:

```js
async function loadUsers() {
  try {
    const response = await fetch("https://api.example.com/users");
    const data = await response.json();
    console.log(data);
  } catch (err) {
    console.log("failed", err);
  }
}
loadUsers();
```

`await` means "pause *this function* until the promise resolves, then continue" — the rest of the page stays responsive. You don't need to master this yet; just recognise the shape. It's how the browser talks to your Express server, and it's covered in depth in the Theory notes.

---

## the point ⸜(｡˃ ᵕ ˂ )⸝♡

- The **DOM** turns your page into objects under `document`.
- Select with `querySelector` / `querySelectorAll`; change with `textContent`, `classList`, `.value`, `createElement` + `appendChild`.
- React to users with `addEventListener("click"/"input"/"submit", handler)`; use `event.preventDefault()` on forms.
- **Async** lets JS wait without freezing: promises + `.then`, or the cleaner `async/await` + `fetch`. This is the doorway to the server side.

That's solid JavaScript. From here, the Theory notes ("Modern JavaScript You Actually Need" → React) build straight on top of everything here. Go get it. ٩(๑•̀ᴗ•́๑)۶
