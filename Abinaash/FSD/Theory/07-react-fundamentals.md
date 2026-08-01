---
title: React Fundamentals
emoji: (ﾉ◕ヮ◕)ﾉ
order: 7
blurb: SPAs, Vite setup, JSX, components, props, state with useState, events, rendering lists, conditional rendering, and controlled forms. The 'R' in MERN.
---

# React Fundamentals (ﾉ◕ヮ◕)ﾉ

> Here's the whole idea of React in one line: **UI is a function of state.** You describe what the screen should look like *for a given set of data*, and when the data changes, React re-runs your description and updates the screen. You stop manually poking at the DOM; you just change data.

React runs in the **browser** (the client). It's a library for building user interfaces out of reusable **components**. This is where the data your Express/Mongo backend produced finally becomes something a human sees and clicks.

---

## 1. Why React exists — SPAs and the DOM problem

Old-school websites: every click loads a whole new HTML page from the server. Fine for documents, painful for apps (flicker, lost state, slow).

A **Single Page Application (SPA)** loads once, then JavaScript rewrites the page contents on the fly as you navigate — no full reloads. Feels like a desktop app. React is the tool for building the UI of an SPA.

The problem React solves: manually updating the **DOM** (the browser's live tree of page elements) is tedious and bug-prone — "when this changes, find that element, update its text, toggle that class..." React flips it: you declare *what the UI should be* for the current data, and React figures out the minimal DOM changes to make it so (via a diffing step against a **virtual DOM**). You describe the destination; React drives.

---

## 2. Setting up: Vite (not Create React App)

**Create React App (CRA) is deprecated — do not use it.** The modern tool is **Vite**: fast, tiny, instant hot-reload.

```bash
npm create vite@latest my-app -- --template react
cd my-app
npm install
npm run dev        # starts dev server, usually http://localhost:5173
```

Project structure Vite gives you:
```
my-app/
  index.html          ← the single HTML page (has <div id="root">)
  src/
    main.jsx          ← entry point: mounts React into #root
    App.jsx           ← your root component
    components/       ← you make this: one file per component
  package.json
  vite.config.js
```

`main.jsx` is the bootstrap — it renders your `<App />` into the `#root` div:

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode><App /></StrictMode>
);
```

(`StrictMode` is a dev-only helper that double-invokes some functions to surface bugs. It's why you might see effects run twice in development — expected, not a bug.)

---

## 3. Components — the unit of everything

A **component** is a JavaScript function that returns UI (JSX). That's it. Components are reusable and compose into bigger components.

```jsx
function Greeting() {
  return <h1>Hello, world!</h1>;
}

// use it like an HTML tag — MUST be capitalised
function App() {
  return (
    <div>
      <Greeting />
      <Greeting />
    </div>
  );
}
```

Rules:
- **Capitalise component names.** `<Greeting />` is a component; `<greeting />` is treated as an HTML tag. Non-negotiable.
- A component returns **one** root element (wrap siblings in a `<div>` or an empty `<>...</>` fragment).
- One component per file is the convention; export it (`export default Greeting`).

---

## 4. JSX — HTML-in-JavaScript

**JSX** is the HTML-looking syntax inside components. It's not really HTML — it compiles to JS function calls — so a few things differ:

```jsx
function Card({ title }) {
  const isActive = true;
  return (
    <div className="card" onClick={handleClick}>   {/* class → className */}
      <h2>{title}</h2>                              {/* {} = a JS expression */}
      <p>{isActive ? "Active" : "Inactive"}</p>     {/* ternary for if/else */}
      <label htmlFor="name">Name</label>            {/* for → htmlFor */}
      <input id="name" />                            {/* self-close everything */}
    </div>
  );
}
```

The differences from HTML:
- **`className`** not `class`, **`htmlFor`** not `for` (because `class`/`for` are reserved JS words).
- **`{ }` embeds JavaScript** — a variable, expression, function call. `{title}`, `{2 + 2}`, `{user.name}`.
- **camelCase attributes/events**: `onClick`, `onChange`, `onSubmit`, `tabIndex`.
- **Every tag closes** — `<input />`, `<br />`, `<img />`.
- Inline styles are an *object*: `style={{ color: "red", fontSize: 14 }}` (double braces: one for JSX-JS, one for the object).

`{ }` is the bridge between your data and your markup. Anytime you want dynamic content, you're inside `{ }`.

---

## 5. Props — passing data into components

**Props** (properties) are how a parent passes data *down* to a child. They're like function arguments, and they're **read-only** — a child never modifies its own props.

```jsx
// parent passes props (like HTML attributes)
function App() {
  return <UserCard name="Abi" age={20} isAdmin={true} />;
}

// child receives them — destructure in the parameter
function UserCard({ name, age, isAdmin }) {
  return (
    <div>
      <h2>{name} ({age})</h2>
      {isAdmin && <span> admin</span>}   {/* render only if truthy */}
    </div>
  );
}
```

- Strings pass as `"text"`; anything else (numbers, booleans, arrays, objects, functions) goes in `{ }`: `age={20}`.
- **Data flows down** — parent → child, never sideways or up directly. This "one-way data flow" is a core React principle; it makes apps predictable.
- To send data *up* (child telling parent something happened), the parent passes a **function** as a prop and the child calls it — see events below.
- **`children`** is a special prop: whatever you put between a component's tags. `<Card>hello</Card>` → inside `Card`, `props.children` is `"hello"`. Great for layout/wrapper components.

---

## 6. State — data that changes over time (`useState`)

Props come from the parent and don't change locally. **State** is a component's own private, changeable data. When state changes, React **re-renders** the component (re-runs the function) and updates the screen. State is the "state" in "UI is a function of state."

`useState` is a **hook** (a special function starting with `use`):

```jsx
import { useState } from "react";

function Counter() {
  const [count, setCount] = useState(0);   // [current value, setter], initial 0

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}
```

Unpack that line — it's the most important line in React:
- `useState(0)` — declare a state variable starting at `0`.
- It returns a **pair** (array): `[currentValue, updaterFunction]`, which you **destructure** (chapter 02!).
- `count` — the current value; use it in your JSX.
- `setCount` — the *only* way to change it. **Never** do `count = 5` or `count++` directly; React won't notice and won't re-render.
- Calling `setCount(newValue)` tells React: "update this, then re-render me."

**Two rules that cause 90% of state bugs:**

1. **Never mutate state directly — always make a new value.** Especially for objects/arrays:
```jsx
// ✗ WRONG — mutates, React doesn't see a change
todos.push(newTodo); setTodos(todos);
user.age = 21; setUser(user);

// ✓ RIGHT — new array/object (spread from chapter 02)
setTodos([...todos, newTodo]);
setUser({ ...user, age: 21 });
setTodos(todos.filter(t => t.id !== id));   // remove
setTodos(todos.map(t => t.id === id ? { ...t, done: true } : t)); // edit one
```
This is why the spread operator matters so much — it's the standard "update state immutably" move.

2. **State updates are asynchronous / batched.** After `setCount(count + 1)`, `count` is *still the old value* on the next line — the new value shows up on the next render. If your new value depends on the old, use the **updater function** form:
```jsx
setCount(prev => prev + 1);          // safe even if called several times in a row
```

---

## 7. Events — responding to the user

Attach handlers with camelCase props. Pass a **function reference**, not a call.

```jsx
function Toggle() {
  const [on, setOn] = useState(false);

  function handleClick() {
    setOn(!on);
  }

  return (
    <>
      <button onClick={handleClick}>Toggle</button>          {/* ✓ reference */}
      <button onClick={() => setOn(false)}>Reset</button>    {/* ✓ inline arrow */}
      {/* <button onClick={handleClick()}>  ✗ calls immediately on render! */}
      <p>{on ? "ON" : "OFF"}</p>
    </>
  );
}
```

Common gotcha: `onClick={handleClick()}` (with parentheses) *calls* the function during render and uses its return value as the handler — usually running your logic instantly and infinitely. Pass `onClick={handleClick}` (no parens), or wrap in an arrow `onClick={() => handleClick(id)}` when you need to pass an argument.

Events are also how children talk *up* to parents — the parent passes a handler down as a prop:

```jsx
function Parent() {
  const addNote = (title) => { /* update parent state */ };
  return <NoteForm onAdd={addNote} />;      // pass the function down
}
function NoteForm({ onAdd }) {
  return <button onClick={() => onAdd("New note")}>Add</button>;  // call it up
}
```

---

## 8. Rendering lists — `.map()` and keys

To render an array of data, `.map()` it into an array of JSX (chapter 02's map, now producing elements):

```jsx
function NoteList({ notes }) {
  return (
    <ul>
      {notes.map(note => (
        <li key={note.id}>{note.title}</li>      {/* key is required! */}
      ))}
    </ul>
  );
}
```

**The `key` prop is mandatory on list items.** It must be a *stable, unique* id (use `note.id` / `note._id` from Mongo — **not** the array index if the list can reorder/filter). Keys let React track which item is which across re-renders, so it updates the right DOM nodes. Forget it and you get a console warning plus subtle bugs when the list changes.

---

## 9. Conditional rendering — showing things sometimes

```jsx
function Status({ user, notes, loading, error }) {
  if (loading) return <p>Loading… (・_・)</p>;      // early return
  if (error)   return <p>Something broke: {error}</p>;

  return (
    <div>
      {user && <p>Welcome, {user.name}</p>}         {/* && : show if truthy */}
      {notes.length > 0
        ? <NoteList notes={notes} />                 {/* ternary: this or that */}
        : <p>No notes yet — a blank page is still a page.</p>}
    </div>
  );
}
```

Three patterns: **early `return`** for whole-component states (loading/error), **`&&`** for "show this or nothing," **ternary `? :`** for "show this or that." The loading/error/empty trio is exactly what you'll render around every API call in the next chapter.

---

## 10. Controlled forms — inputs wired to state

In React, form inputs are usually **controlled**: their value lives in state, and `onChange` updates that state. The input reflects state; state reflects the input. One source of truth.

```jsx
function NoteForm({ onAdd }) {
  const [title, setTitle] = useState("");

  function handleSubmit(e) {
    e.preventDefault();          // stop the browser's full-page reload
    if (!title.trim()) return;   // simple validation
    onAdd(title);                // send it up to the parent
    setTitle("");                // clear the input
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={title}                              // value comes FROM state
        onChange={e => setTitle(e.target.value)}   // typing updates state
        placeholder="New note…"
      />
      <button type="submit">Add</button>
    </form>
  );
}
```

The loop: you type → `onChange` fires → `setTitle` updates state → re-render → input shows the new `value`. `e.target.value` is the input's current text. `e.preventDefault()` in the submit handler is essential — without it the form does a classic full-page reload and your JS never runs.

---

## Recap flashcards

- React = UI is a function of state. Change data, the screen follows.
- Use **Vite** (`npm create vite`), never CRA. Dev server on :5173.
- Components are capitalised functions returning JSX; one root element.
- JSX: `className`, `{ }` for JS, camelCase events, self-closing tags.
- Props flow **down**, read-only; destructure them: `function C({ name })`.
- `const [x, setX] = useState(initial)`; only `setX` changes it; never mutate.
- Update objects/arrays immutably with spread/map/filter.
- Events: pass a function reference (`onClick={fn}`), not a call (`fn()`).
- Lists: `.map()` with a stable `key`.
- Conditionals: early return, `&&`, ternary.
- Controlled inputs: `value` from state + `onChange` setter; `e.preventDefault()` on submit.

Next: making React actually talk to your Express API. →
