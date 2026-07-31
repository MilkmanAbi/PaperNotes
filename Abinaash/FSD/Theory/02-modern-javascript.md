---
title: Modern JavaScript You Actually Need
emoji: ᕕっ•ᴗ• っ
order: 2
blurb: The exact JS features MERN leans on — arrow functions, destructuring, spread, modules, promises, async/await, array methods. Skip this and React will feel like magic (bad magic).
---

# Modern JavaScript You Actually Need ᕕっ•ᴗ• っ

> Here's the secret nobody says out loud: most people who "can't learn React" actually can't learn *JavaScript*. React is small. Modern JS is the real syllabus. Spend real time here.

This isn't a full JS course — it's the specific subset that MERN uses everywhere, the stuff that will otherwise show up in React and confuse you. If you know all of this cold, the rest of the module is downhill.

---

## 1. `let`, `const`, and never `var`

```js
const name = "Abi";   // can't be reassigned. DEFAULT to this.
let count = 0;        // can be reassigned. Use only when you must.
// var — legacy, has weird scoping rules. Just don't.
```

Rule of thumb: **use `const` by default, switch to `let` only when you genuinely reassign.** `const` doesn't mean the value is deeply frozen — you can still mutate a `const` object or array (`const arr = []; arr.push(1)` is fine); it means the *variable* can't be pointed at something else.

Both are **block-scoped** (they live inside the nearest `{ }`), which is what you want. `var` was function-scoped and caused classic bugs.

---

## 2. Arrow functions

Two ways to write a function; you'll read both constantly:

```js
// classic
function add(a, b) { return a + b; }

// arrow — same thing
const add = (a, b) => { return a + b; };

// arrow with implicit return (no braces = return the expression)
const add = (a, b) => a + b;

// one parameter, parens optional
const double = n => n * 2;

// returning an object literal — wrap it in parens or JS thinks {} is a block
const makeUser = name => ({ name, active: true });
```

Arrow functions are everywhere in React and in array methods. Two things to know:
- Implicit return (no `{}`) is why you'll see `arr.map(x => x * 2)` with no `return` word.
- Arrows don't have their own `this`. For this module that's mostly a *feature* — it means callbacks behave the way you'd naively expect. (The `this` keyword barely matters in modern React with hooks, so don't stress about it.)

---

## 3. Template literals

Backtick strings with `${}` interpolation. Use these instead of `+` concatenation:

```js
const name = "Abi";
const n = 3;
const msg = `Hi ${name}, you have ${n} note${n === 1 ? "" : "s"}.`;
// "Hi Abi, you have 3 notes."

// multi-line for free
const html = `
  <div>
    <h1>${name}</h1>
  </div>
`;
```

You'll build API URLs with these constantly: `` fetch(`/api/notes/${id}`) ``.

---

## 4. Destructuring — pulling values out

This is *everywhere* in React (props, hooks) and Express (`req`). Learn it properly.

```js
// object destructuring — grab fields by name
const user = { name: "Abi", age: 20, city: "SG" };
const { name, city } = user;          // name="Abi", city="SG"
const { age: years } = user;          // rename: years=20
const { role = "student" } = user;    // default if missing: role="student"

// array destructuring — grab by position
const nums = [10, 20, 30];
const [first, second] = nums;         // first=10, second=20
const [, , third] = nums;             // skip with commas: third=30
```

Why it matters: React's `useState` returns an array you destructure — `const [count, setCount] = useState(0)`. Express hands you data as `const { title, body } = req.body`. If destructuring is fuzzy, those lines look like hieroglyphs.

---

## 5. Spread and rest — the `...` operator

Same three dots, two jobs depending on context.

**Spread** — "unpack this into here." Great for copying and merging without mutating:

```js
const a = [1, 2];
const b = [3, 4];
const both = [...a, ...b];              // [1,2,3,4]

const user = { name: "Abi", age: 20 };
const updated = { ...user, age: 21 };   // copy + override: {name:"Abi", age:21}
```

That object-spread pattern — copy everything, override one field — is *the* way you update state immutably in React. Memorise it.

**Rest** — "gather the leftovers into one thing." Same syntax, appears in a parameter/destructure position:

```js
function sum(...nums) {                 // gather all args into an array
  return nums.reduce((t, n) => t + n, 0);
}
sum(1, 2, 3);                           // 6

const { id, ...everythingElse } = note; // id pulled out, rest bundled
```

---

## 6. Array methods — the workhorses

These are how you transform data between "what the API gave me" and "what I want to render." **They don't mutate the original array; they return a new one.** (Except `forEach`, which returns nothing.)

```js
const notes = [
  { id: 1, title: "A", done: true },
  { id: 2, title: "B", done: false },
  { id: 3, title: "C", done: true },
];

// map — transform each item → new array of same length
const titles = notes.map(n => n.title);           // ["A","B","C"]

// filter — keep items that pass a test → new (shorter) array
const done = notes.filter(n => n.done);            // items 1 and 3

// find — first item that matches, or undefined
const note2 = notes.find(n => n.id === 2);         // {id:2,...}

// some / every — return a boolean
const anyDone  = notes.some(n => n.done);          // true
const allDone  = notes.every(n => n.done);         // false

// reduce — boil the whole array down to one value
const total = [10, 20, 30].reduce((sum, n) => sum + n, 0); // 60

// forEach — just do something per item (no return)
notes.forEach(n => console.log(n.title));

// sort — CAUTION: mutates! and sorts as strings by default
[...notes].sort((a, b) => a.id - b.id);            // copy first, numeric compare
```

`.map()` is the single most important one for React — you turn an array of data into an array of UI elements. `.filter()` is how you do search and "remove item" in state. Get comfortable chaining them: `notes.filter(n => !n.done).map(n => n.title)`.

---

## 7. Truthy, falsy, and safe access

**Falsy** values (treated as false in a condition): `false`, `0`, `""` (empty string), `null`, `undefined`, `NaN`. **Everything else is truthy** — including `"0"`, `[]`, and `{}`. (Yes, an empty array is truthy. This surprises people.)

Handy operators:

```js
// || — fallback for FALSY. "if left is falsy, use right"
const name = input || "Anonymous";     // but careful: 0 and "" trigger the fallback

// ?? — nullish coalescing. fallback only for null/undefined (safer for numbers)
const count = value ?? 0;              // 0 stays 0; only null/undefined → 0

// ?. — optional chaining. don't crash on missing nested fields
const city = user?.address?.city;      // undefined instead of a TypeError
```

`?.` and `??` are lifesavers when data comes from an API and a field might be missing. `user.address.city` throws if `address` is undefined; `user?.address?.city` just gives `undefined` and moves on.

---

## 8. Promises — code that finishes later

Anything that talks to the network or disk is **asynchronous** — it doesn't finish immediately, so JS doesn't wait; it keeps going and calls you back when the result is ready. A **Promise** is an object representing "a value that will exist later." It's in one of three states: *pending → fulfilled* (resolved with a value) or *rejected* (failed with an error).

The older `.then()` style:

```js
fetch("/api/notes")
  .then(res => res.json())      // when response arrives, parse JSON
  .then(data => console.log(data))
  .catch(err => console.error(err));  // if anything above failed
```

You *can* read this, but the modern style below is far nicer.

---

## 9. async / await — the good way

`async/await` is just Promises with syntax that reads top-to-bottom like normal code. **This is what you'll write.**

```js
async function loadNotes() {
  try {
    const res  = await fetch("/api/notes");   // pause here until response
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();            // pause here until parsed
    console.log(data);
    return data;
  } catch (err) {
    console.error("Failed to load:", err);
  }
}
```

The rules:
- `await` can **only** be used inside an `async` function (or at the top level of an ES module).
- `await` pauses that function until the promise settles, then gives you the resolved value.
- An `async` function *always* returns a promise, even if you `return 5` — the caller gets a promise resolving to 5.
- Wrap awaits in **try/catch** to handle rejections (network down, 500 error, etc.).

Gotcha beginners hit: **`fetch` does not reject on 4xx/5xx.** A 404 or 500 is still a "successful" HTTP round-trip as far as `fetch` is concerned. You must check `res.ok` (true for 2xx) yourself, as above. `fetch` only rejects if the network itself failed (no connection, DNS error).

---

## 10. ES Modules — import / export

Modern JS splits code across files and connects them with `import`/`export`. You'll use this in React and (with setup) in Node.

```js
// math.js — export from a file
const add = (a, b) => a + b;        // named export
const PI = 3.14159;
export default function main() {}          // one default export per file

// app.js — import into another file
import main, { add, PI } from "./math.js"; // default + named
import { add as sum } from "./math.js";    // rename on import
import * as math from "./math.js";         // grab everything as an object
```

- **Named exports**: any number per file, imported by exact name in `{ }`.
- **Default export**: at most one per file, imported without braces under any name you like.
- Paths to your own files need `./` or `../`. Package names (`react`, `express`) have no path.

Note: Node has *two* module systems — CommonJS (`require`/`module.exports`, the old default) and ES Modules (`import`/`export`, modern). React always uses ESM. We cover the Node side in chapter 03. Don't panic if you see `require` in Express tutorials; it's the same idea in older clothes.

---

## 11. Small things that show up

```js
// shorthand object properties — key name == variable name
const title = "Hi", done = false;
const note = { title, done };            // same as { title: title, done: done }

// computed keys
const field = "email";
const obj = { [field]: "a@b.com" };      // { email: "a@b.com" }

// ternary — inline if/else, used constantly in JSX
const label = done ? "✓ done" : "pending";

// short-circuit rendering — used constantly in React
isLoggedIn && showDashboard();           // runs right side only if left is truthy
```

---

## Recap flashcards

- `const` by default, `let` when you reassign, never `var`.
- Arrow fns: `x => x * 2`. No braces = implicit return.
- Destructuring pulls fields/positions out: `const { a } = obj`, `const [x] = arr`.
- Spread `...` copies/merges; the `{ ...old, field: new }` update pattern is core React.
- `map` transform, `filter` keep-some, `find` first-match, `reduce` boil-down. They return new arrays.
- Promises = "value later"; `async/await` + try/catch is how you use them.
- `fetch` doesn't throw on 404/500 — check `res.ok`.
- ESM: named exports `{ }`, one default export, `./` for your files.

You now know enough JS. Time to run it on a server. →
