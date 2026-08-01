---
title: React Part 1 — Vite, Components & the Flip Card
emoji: (ﾉ๑˃ᴗ˂)ﾉ
order: 4
blurb: Scaffold a React app with Vite, understand the file anatomy, build a component that takes props, install react-card-flip, and wire a button that flips it with useState. This is Q3 of the Lab Test.
---

# React Part 1 — Vite, Components & the Flip Card (ﾉ๑˃ᴗ˂)ﾉ

> Backend done. Now the browser half. React feels big until you realise the Lab Test only wants: make an app, make a component, pass it a prop, flip it with a button. Four moves. This note is all four, ending exactly at the sample test's Q3.

Covers **Practice 7** (Vite, Page Header component, react-card-flip, reusable FlipCard) and lands on the **Sample Lab Test Q3** (a card that flips between two images when you click, with a message that toggles too).

---

## 1. Scaffold with Vite

Vite is the tool that creates and runs a React project. From wherever you keep your work:

```bash
npm create vite@latest
```

It asks a few questions:

- **Project name:** e.g. `react-game-app`
- **Framework:** React
- **Variant:** JavaScript (not TypeScript, unless told otherwise)

Then:

```bash
cd react-game-app
npm install          # download React and friends into node_modules
npm run dev          # start the dev server
```

It prints a local URL - usually `http://localhost:5173` (the sample config sets it to `3000`). Open it. You get the Vite starter page.

> **Vite hot-reloads.** Unlike plain Node, you do *not* restart anything - save a file and the browser updates instantly. Leave `npm run dev` running the whole time you work.

---

## 2. The files that matter

A fresh Vite React app has a lot of files. You touch maybe four:

```
react-game-app/
├── index.html              ← the single HTML page. has <div id="root">
├── package.json            ← dependencies + scripts (dev/build)
├── vite.config.js          ← Vite settings (e.g. which port)
├── public/                 ← static files (images!) served as-is
└── src/
    ├── main.jsx            ← entry point: mounts <App> into #root
    ├── App.jsx             ← your top component. YOU LIVE HERE
    └── component/          ← your own components go here
```

- **`index.html`** has one line that matters: `<div id="root"></div>`. React draws your entire app inside that div.
- **`main.jsx`** is the bootstrap - it grabs `#root` and renders `<App />` into it. You rarely edit it.
- **`App.jsx`** is your top-level component. This is where you start building.

`main.jsx` looks like this and you can leave it alone:

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

---

## 3. Components - the unit of everything

A React component is **a function that returns JSX** (HTML-like markup). That's it. `App.jsx` is one:

```jsx
function App() {
    return (
        <>
            <h1>Hello</h1>
            <p>My first component</p>
        </>
    );
}

export default App;
```

Rules that trip up beginners:

- The function name is **Capitalised** (`App`, `Card`, `PageHeader`). Lowercase names aren't treated as components.
- It returns **one** top-level element. Need several siblings? Wrap them in a **fragment** `<>...</>` (an empty tag that renders nothing itself).
- `export default App` lets other files `import App from "./App"`.

**Practice 7 Q2** asks for a Page Header component - it's just this shape in its own file:

```jsx
// src/component/PageHeader.jsx
function PageHeader() {
    return <h1>My Memory Game</h1>;
}
export default PageHeader;
```

Then use it in `App.jsx` like a custom HTML tag: `<PageHeader />`.

---

## 4. Props - passing data into a component

Props are how a parent hands data to a child - like HTML attributes. You pass them on the tag, and the component receives them as its parameter:

```jsx
// child receives a "prop" object
function Card(prop) {
    return <p>The card is flipped: {prop.flip}</p>;
}

// parent passes flip={...}
<Card flip={true} />
```

- Passing: `<Card flip={true} />` - the `{}` means "JavaScript value here."
- Receiving: the component's parameter (`prop`) holds all of them; `prop.flip` reads the one you sent.
- `{prop.flip}` inside JSX injects the value into the markup.

Props are **read-only** - a component never edits its own props. Data flows down from parent to child, one way.

---

## 5. Install the 3rd-party component

**Practice 7 Q3** has you install `react-card-flip`. Stop the dev server or open a second terminal, then:

```bash
npm install react-card-flip
```

It's now in `node_modules` and listed in `package.json`. It gives you a `<ReactCardFlip>` component that shows one of two children depending on an `isFlipped` prop - the front or the back of a card. You don't write the flip animation; the library does.

Also: drop your two card images (e.g. `p1.jpg`, `p2.jpg`) into the **`public/`** folder. Anything in `public/` is served from the root, so `public/p1.jpg` is referenced in code as just `"p1.jpg"`.

---

## 6. Build the reusable Card component (Practice 7 Q4)

Make `src/component/Card.jsx`. It wraps the library component and shows the front/back images, driven by a `flip` prop passed in from the parent:

```jsx
import ReactCardFlip from "react-card-flip";
import "./Card.css";

function Card(prop) {
    return (
        <ReactCardFlip isFlipped={prop.flip}>
            <img src="p1.jpg" />
            <img src="p2.jpg" />
        </ReactCardFlip>
    );
}

export default Card;
```

- `isFlipped={prop.flip}` - the card shows the first child when `flip` is `false`, the second when `true`. The parent controls `flip`; the Card just reflects it. That's what makes it **reusable** - it holds no state of its own, it obeys its prop.
- Two `<img>` children = front and back.

A tiny CSS file `src/component/Card.css` to size the images:

```css
img {
    height: 400px;
    width: 300px;
}
```

Import order matters only in that the `import "./Card.css"` line pulls the styles in.

---

## 7. Wire it up with useState (Sample Lab Test Q3)

Now `App.jsx` owns the flip **state** and a button to toggle it. `useState` is the React hook for "a value that changes and re-renders the screen when it does."

```jsx
import { useState } from "react";
import Card from "./component/Card";

function App() {
    const [flip, setFlip] = useState(false);      // starts unflipped
    const [msg, setMsg]   = useState("Einstein");  // starts showing this

    function handleClick() {
        if (flip === true) {
            setMsg("Einstein");
        } else {
            setMsg("Tesla");
        }
        setFlip(!flip);        // toggle: true→false, false→true
    }

    return (
        <>
            <Card flip={flip} />
            <input
                type="button"
                onClick={handleClick}
                value="Flip the card"
            />
            <br />
            {msg}
        </>
    );
}

export default App;
```

Reading it top to bottom:

- **`const [flip, setFlip] = useState(false)`** - `flip` is the current value, `setFlip` is the *only* way to change it. Never do `flip = true` directly; React won't notice. Always `setFlip(...)`.
- **`useState("Einstein")`** - a second, independent piece of state for the label.
- **`onClick={handleClick}`** - pass the function *by name*, no parentheses. `onClick={handleClick()}` would call it immediately on render (wrong).
- **`setFlip(!flip)`** - flips the boolean. This triggers a re-render; `<Card flip={flip} />` gets the new value and the library animates.
- **`{msg}`** - shows the current label. When `setMsg` runs, this updates.

Click the button: card flips, label swaps Einstein ↔ Tesla. That's Q3 complete.

> The mental model: **state changes → React re-runs your component → the new JSX (and the props you pass down) reflect the new state.** You don't manually update the DOM; you update state and React redraws.

---

## 8. Mistakes that cost you

- **Blank page, red errors in DevTools console (F12)** - always open the console first. React errors are specific: "X is not defined" usually means a missing `import`.
- **Component doesn't show** - did you `export default` it, and `import` it with the right path/case? `./component/Card` must match the folder and file exactly (case-sensitive).
- **Button flips once then nothing** - you mutated `flip` directly instead of using `setFlip`. Only `setFlip` re-renders.
- **Image doesn't load** - it's not in `public/`, or the `src` has a wrong name. `public/p1.jpg` → `src="p1.jpg"` (no `/public/`).
- **`Adjacent JSX elements must be wrapped`** - you returned two siblings without a `<>...</>` fragment.
- **`onClick={handleClick()}`** with parentheses - fires on render, not on click. Drop the `()`.

---

## 9. Recap flashcards

- `npm create vite@latest` → React → JS; `npm install`; `npm run dev`. Vite hot-reloads.
- You mainly touch `src/App.jsx` and files in `src/component/`. Images go in `public/`.
- Component = capitalised function returning **one** JSX element (use `<>...</>` for siblings); `export default`.
- Props pass data down: `<Card flip={x} />` → `prop.flip`. Props are read-only.
- `npm install react-card-flip`; `<ReactCardFlip isFlipped={...}>front / back</ReactCardFlip>`.
- `const [v, setV] = useState(init)`. Change state **only** via `setV(...)`; that's what re-renders.
- `onClick={fn}` (no parentheses). `setFlip(!flip)` toggles a boolean.

Next: React Part 2 - state properly, routing, useRef, and turning cards into an actual game. →
