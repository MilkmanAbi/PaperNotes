---
title: Arrays, Objects & Iteration
emoji: ⸜(*ˊᗜˋ*)⸝
order: 2
blurb: Arrays and their power methods (map/filter/reduce/forEach), objects, destructuring, spread, and JSON. This is where JS starts feeling like a real tool.
tags: javascript, arrays, objects, map, filter, reduce, find, forEach, destructuring, spread, json
---

# Arrays, Objects & Iteration ⸜(*ˊᗜˋ*)⸝

> Almost every real thing you handle — a list of users, a form's data, an API response — is an **array** or an **object** (usually both, nested). Master these plus a handful of methods and you've got most of practical JavaScript.

---

## 1. Arrays — ordered lists

```js
const fruits = ["apple", "banana", "cherry"];

fruits[0];        // "apple"  (counting starts at 0)
fruits.length;    // 3
fruits[fruits.length - 1];  // "cherry" (last one)

fruits.push("date");    // add to end
fruits.pop();           // remove from end
fruits.unshift("kiwi"); // add to front
fruits.shift();         // remove from front
fruits.includes("banana"); // true
fruits.indexOf("cherry");  // 2
```

Arrays can hold anything, including objects:

```js
const users = [
  { name: "Abi", age: 20 },
  { name: "Sam", age: 22 },
];
```

---

## 2. The power methods (learn these cold)

These replace hand-written loops and show up *constantly* in React. Each takes a function that runs once per item.

**`forEach`** — do something for each item (no result returned):

```js
fruits.forEach(f => console.log(f));
```

**`map`** — transform each item into a new array (same length):

```js
const nums = [1, 2, 3];
const doubled = nums.map(n => n * 2);   // [2, 4, 6]

const names = users.map(u => u.name);   // ["Abi", "Sam"]
```

> `map` is *the* one. In React you turn an array of data into an array of UI with `map`. Burn it into memory.

**`filter`** — keep only items that pass a test (shorter array):

```js
const evens = [1,2,3,4,5,6].filter(n => n % 2 === 0);  // [2, 4, 6]
const adults = users.filter(u => u.age >= 21);          // [{Sam...}]
```

**`find`** — get the first item that matches (one item, not an array):

```js
const abi = users.find(u => u.name === "Abi");  // { name: "Abi", age: 20 }
```

**`reduce`** — boil the whole array down to one value:

```js
const total = [10, 20, 30].reduce((sum, n) => sum + n, 0);  // 60
//                                  ^acc  ^item          ^start
```

Chaining is common and clean:

```js
const namesOfAdults = users
  .filter(u => u.age >= 21)
  .map(u => u.name);
```

---

## 3. Objects — labelled data

Where arrays use number positions, objects use **named keys**:

```js
const user = {
  name: "Abi",
  age: 20,
  isStudent: true,
};

user.name;        // "Abi"   (dot notation — usual)
user["age"];      // 20      (bracket — when the key is in a variable)

user.age = 21;    // change a value
user.email = "a@x.com";  // add a new key
delete user.isStudent;   // remove a key
```

Values can be anything — including arrays and other objects (this nesting is exactly what JSON from an API looks like):

```js
const post = {
  title: "Hi",
  author: { name: "Abi" },
  tags: ["js", "web"],
};
post.author.name;  // "Abi"
post.tags[0];      // "js"
```

Objects can hold functions too (then they're called **methods**):

```js
const dog = {
  name: "Rex",
  bark() { return `${this.name} says woof`; },
};
dog.bark();   // "Rex says woof"
```

---

## 4. Destructuring — unpack in one line

Pull values out of arrays/objects straight into variables. You'll see this everywhere (React props, imports):

```js
// object destructuring — by key name
const { name, age } = user;
console.log(name, age);   // "Abi" 20

// array destructuring — by position
const [first, second] = ["a", "b"];
console.log(first, second);   // "a" "b"

// super common in functions:
function greet({ name }) {   // pull name straight out of the object arg
  return `Hi ${name}`;
}
greet(user);   // "Hi Abi"
```

---

## 5. Spread `...` — copy & combine

Three dots that "spread out" the contents of an array/object:

```js
// copy + add to an array
const more = [...fruits, "elderberry"];

// merge / clone objects (later keys win)
const updated = { ...user, age: 99 };

// combine arrays
const all = [...[1,2], ...[3,4]];   // [1, 2, 3, 4]
```

This is the standard way to update data *without mutating the original* — which is exactly how React expects you to handle state. Copy, change the copy.

---

## 6. JSON — the data format of the web

**JSON** (JavaScript Object Notation) is how data travels between server and browser. It looks like JS objects but it's *text*, and keys must be in double quotes:

```json
{ "name": "Abi", "tags": ["js", "web"], "age": 20 }
```

Two functions convert between JS and JSON text:

```js
const obj = { name: "Abi", age: 20 };

const text = JSON.stringify(obj);   // '{"name":"Abi","age":20}'  ← object → text (to send)
const back = JSON.parse(text);      // { name: "Abi", age: 20 }   ← text → object (to use)
```

Every API you hit in the MERN half of this module sends JSON — you'll `JSON.parse` what comes in and `JSON.stringify` what you send out (though libraries like `fetch` and Express often do it for you).

---

## the point ﴾⸝⸝> ᴗ <⸝⸝﴿

- Arrays = ordered (index from 0); objects = named keys. Real data nests both.
- `map` (transform), `filter` (keep some), `find` (first match), `reduce` (to one value), `forEach` (just do). **`map` is the star.**
- Destructure to unpack in one line; spread `...` to copy-and-change without mutating.
- JSON is text; `JSON.stringify` to send, `JSON.parse` to use.

Last one: wiring JS to the actual page — the DOM, events, and a first taste of async. ⋆⁺₊⋆
