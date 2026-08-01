---
title: Functions & Control Flow
emoji: (⊃｡•́‿•̀｡)⊃
order: 1
blurb: Functions (classic + arrow), parameters and return, if/else, loops, and scope. The logic layer - how code makes decisions and repeats itself.
tags: javascript, functions, arrow, return, loops, for, while, for-of, conditionals, if, ternary, scope
---

# Functions & Control Flow (⊃｡•́‿•̀｡)⊃

> A program is mostly two things: **reusable actions** (functions) and **decisions/repetition** (control flow). Get comfortable here and you can actually build things instead of just declaring variables at them.

---

## 1. Functions — reusable blocks

A function is a named recipe you can run whenever, with different inputs:

```js
function greet(name) {
  return `Hello, ${name}`;
}

greet("Abi");   // "Hello, Abi"
greet("Sam");   // "Hello, Sam"
```

- **Parameters** — the inputs in the brackets (`name`).
- **Arguments** — the actual values you pass in (`"Abi"`).
- **`return`** — hands a value back to whoever called it. No `return` = the function gives back `undefined`.

`return` also *stops* the function immediately — nothing after it runs.

---

## 2. Arrow functions (the modern shape)

The same idea, shorter. You'll read these everywhere in React and array methods:

```js
// classic
function add(a, b) { return a + b; }

// arrow — identical behaviour
const add = (a, b) => { return a + b; };

// implicit return — no braces means "return this expression"
const add = (a, b) => a + b;

// one parameter → parens optional
const double = n => n * 2;

// no parameters → empty parens
const hi = () => console.log("hi");
```

That **implicit return** is why you'll see `nums.map(n => n * 2)` with no `return` word — the arrow returns the expression automatically. Both styles are fine; arrows are the common default now.

---

## 3. `if` / `else if` / `else`

Run code only when a condition is true:

```js
const age = 20;

if (age >= 18) {
  console.log("adult");
} else if (age >= 13) {
  console.log("teen");
} else {
  console.log("kid");
}
```

The condition is anything that's true/false. Remember `===` from the basics note. JS also has **truthy/falsy** — these count as false: `false`, `0`, `""`, `null`, `undefined`, `NaN`. Everything else is truthy. So `if (name)` means "if name isn't empty/undefined".

**Ternary** — a one-line if/else that returns a value:

```js
const label = age >= 18 ? "adult" : "minor";
```

You'll see ternaries constantly in React for conditional display.

---

## 4. Loops — repeating work

```js
// classic for — when you need a counter
for (let i = 0; i < 5; i++) {
  console.log(i);   // 0 1 2 3 4
}

// for...of — loop the VALUES of an array (cleaner, use this often)
const names = ["Abi", "Sam", "Lee"];
for (const name of names) {
  console.log(name);
}

// while — repeat until a condition goes false
let n = 3;
while (n > 0) {
  console.log(n);
  n--;
}
```

The classic `for` reads as: **start** (`let i = 0`), **keep going while** (`i < 5`), **after each pass** (`i++`). `i++` means "add 1 to i".

`break` exits a loop early; `continue` skips to the next pass.

> Heads up: for looping over arrays, you'll soon prefer array *methods* (`.map`, `.forEach`, `.filter`) over writing loops by hand — that's the next note. But knowing the raw loop matters.

---

## 5. Scope — where variables live

A variable exists only inside the `{ }` block it was declared in:

```js
function demo() {
  const secret = 42;
  console.log(secret);   // ✓ works — same block
}
demo();
console.log(secret);      // ✗ ERROR — secret doesn't exist out here
```

Inner blocks can see *outer* variables, but not the other way around:

```js
const outer = "visible";
if (true) {
  const inner = "hidden";
  console.log(outer);   // ✓ can see outer
}
console.log(inner);     // ✗ can't see inner
```

This is **block scope**, and it's exactly why we use `let`/`const` and not `var` (which leaked out of blocks and caused bugs). Keeping variables in the smallest scope that works = fewer surprises.

---

## 6. Putting it together

```js
function grade(score) {
  if (score >= 90) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "F";
}

const scores = [95, 82, 40, 61];
for (const s of scores) {
  console.log(`${s} → ${grade(s)}`);
}
// 95 → A
// 82 → B
// 40 → F
// 61 → C
```

Notice `grade` uses early `return`s instead of nested `else` — cleaner, and each `return` stops the function on the spot.

---

## the point ٩(๑•̀ω•́๑)۶

- Functions take **parameters**, do work, and `return` a value (which also stops them).
- Arrow functions are the short modern form; no-brace arrows return implicitly.
- `if/else if/else` + ternaries decide; watch out for truthy/falsy.
- `for`, `for...of`, and `while` repeat; `break`/`continue` steer them.
- Variables are **block-scoped** — inner sees outer, not vice versa.

Next: the two containers everything real is built from — arrays and objects, and the methods that make them powerful. ⸜(｡˃ ᵕ ˂ )⸝
