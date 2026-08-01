---
title: JS Basics — Values, Variables & Types
emoji: ᕕ( ᐛ )ᕗ
order: 0
blurb: What JavaScript is, the three ways to run it, variables (let/const), the data types, operators, and template literals. The absolute ground floor.
tags: javascript, variables, let, const, types, typeof, operators, console.log, template literals, basics
---

# JS Basics — Values, Variables & Types ᕕ( ᐛ )ᕗ

> HTML is the skeleton, CSS is the skin, **JavaScript is the muscle** — it's what makes a page *do* things: respond to clicks, fetch data, change content live. It's also the one language that runs the whole MERN stack (browser *and* server), which is why it's worth learning properly.

This is the foundation. Once it clicks, the Theory note **"Modern JavaScript You Actually Need"** is your next stop — it's the same language, focused on the exact features React and Node lean on.

---

## 1. Where JS runs & how to try it

Three places you'll run JavaScript:

```js
// 1. The browser console — fastest playground.
//    Open any page → F12 → Console tab → type and hit Enter.
console.log("hello");

// 2. In an HTML page, via a script tag (put it before </body>):
//    <script src="main.js"></script>

// 3. On your machine with Node (this is the "N" in MERN):
//    save as app.js, then in a terminal:  node app.js
```

`console.log(...)` is your best friend — it prints values so you can *see* what your code is doing. You'll use it constantly to debug.

---

## 2. Variables — `let` and `const`

A variable is a named box that holds a value:

```js
const name = "Abi";   // can't be reassigned — DEFAULT to this
let score = 0;        // can be reassigned — use only when you must
score = 10;           // fine, it's a let
// name = "Bob";      // ERROR — const can't be reassigned

// var — the old way. Weird scoping. Just don't use it.
```

Rule: **`const` by default, `let` only when you genuinely reassign.** It makes code safer and easier to read (a `const` is a promise it won't change under you).

Gotcha: `const` on an object/array locks the *box*, not the *contents* — you can still change what's inside:

```js
const list = [];
list.push("ok");   // fine — mutating contents
// list = [1, 2];  // ERROR — reassigning the box
```

---

## 3. The data types

JavaScript has a handful of basic types. You'll use these five daily:

```js
let s = "text";          // string  — always in quotes ' " or backticks `
let n = 42;              // number  — ints and decimals, no separate types
let ok = true;           // boolean — true / false
let nothing = null;      // null    — "deliberately empty"
let missing;             // undefined — "not set yet"
```

And two containers (their own notes later):

```js
let arr = [1, 2, 3];               // array  — an ordered list
let obj = { name: "Abi", age: 20 }; // object — labelled key/value pairs
```

Check a type with `typeof`:

```js
typeof "hi"    // "string"
typeof 42      // "number"
typeof true    // "boolean"
typeof [1,2]   // "object"  (arrays report as object — normal)
```

**JS is dynamically typed** — a variable can hold a string now and a number later. Flexible, but it means *you* have to keep track of what's in the box.

---

## 4. Operators

Maths:

```js
5 + 2   // 7
5 - 2   // 3
5 * 2   // 10
5 / 2   // 2.5
5 % 2   // 1   ← remainder (great for "is it even": n % 2 === 0)
5 ** 2  // 25  ← power
```

`+` also glues strings together (concatenation): `"foo" + "bar"` → `"foobar"`. Careful — `"5" + 2` is `"52"` (string wins), while `"5" - 2` is `3` (maths wins). This is a classic JS trap.

Comparison — **always use `===` and `!==`**:

```js
5 === 5     // true   — strict equal (value AND type)
5 === "5"   // false  — different types
5 == "5"    // true   — loose equal, does sneaky type conversion. AVOID.
3 < 5       // true
3 >= 3      // true
```

> The rule the whole industry follows: **use `===`, never `==`.** `==` converts types behind your back and causes bugs. Same for `!==` over `!=`.

Logic:

```js
true && false   // AND → false (both must be true)
true || false   // OR  → true  (either can be true)
!true           // NOT → false (flips it)
```

---

## 5. Template literals (backtick strings)

The modern way to build strings — backticks with `${ }` slots:

```js
const name = "Abi";
const age = 20;

// old, clumsy:
const a = "Hi " + name + ", you are " + age;

// new, clean — use this:
const b = `Hi ${name}, you are ${age}`;
```

Anything can go in `${ }` — variables, maths, function calls:

```js
`Total: ${price * qty}`
`It is ${new Date().getHours()} o'clock`
```

Backtick strings can also span multiple lines without any tricks. Once you switch to these you won't go back.

---

## the point ╰(*°▽°*)╯

- Run JS in the console, in a page via `<script>`, or with `node app.js`.
- `const` by default, `let` when you reassign, never `var`.
- Five everyday types (string/number/boolean/null/undefined) + arrays & objects.
- `%` is remainder, `+` also concatenates strings, and **always `===` not `==`**.
- Build strings with backtick template literals and `${ }`.

Next: making code *decide* and *repeat* — functions, if/else and loops. ੭•̀ᴗ•̀)੭
