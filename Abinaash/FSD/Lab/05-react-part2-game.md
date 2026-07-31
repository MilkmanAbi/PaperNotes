---
title: React Part 2 — Routing, useRef & the Memory Game
emoji: (っ˃ᴗ˂)っ
order: 5
blurb: Practice 8 in full — more useState and props, multi-page SPA routing with react-router-dom, useRef for values that persist without re-rendering, a state-transition-driven matching game, a game clock, and the extension challenges.
---

# React Part 2 — Routing, useRef & the Memory Game (っ˃ᴗ˂)っ

> Part 1 got a single card flipping. Part 2 turns it into a real app: multiple pages, a grid of cards, matching logic, and a clock. Not on the sample Lab Test, but it's a full practical and the concepts (routing, `useRef`, state machines) show up everywhere.

This is **Practice 8**, continuing the same Vite project from note 04.

---

## 1. More useState & props (Q1–Q2)

You already met these in note 04. Part 2 just uses them harder. Two habits to lock in:

- **State lives as high as it needs to.** If two cards need to know about each other (for matching), the state that tracks them lives in the **parent**, not in each card. Parents own state; children get told via props.
- **Pass behaviour down, too.** A parent can pass a *function* as a prop so a child can tell the parent something happened:

```jsx
// parent
function App() {
    const [score, setScore] = useState(0);
    return <Card onFlip={() => setScore(score + 1)} />;
}
// child calls the function it was handed
function Card(prop) {
    return <img onClick={prop.onFlip} src="p1.jpg" />;
}
```

Data flows down as props; events flow up by calling functions passed down as props. That round trip is 90% of React.

---

## 2. Pages and what "SPA" means (Q3)

A **Single Page Application** loads one HTML file *once*, then JavaScript swaps the visible content as you navigate - no full page reloads, no flicker. "Pages" in an SPA aren't separate files; they're just components you show or hide.

```jsx
function HomePage()  { return <h1>Welcome</h1>; }
function GamePage()  { return <Board />; }
```

The question "what are the characteristics of an SPA?" wants: *one initial load, navigation handled in JS by swapping components, no round-trip to the server for each page, feels app-like and fast.* Routing (next) is how you pick which page-component to show.

---

## 3. Routing with react-router-dom (Q4)

Install it:

```bash
npm install react-router-dom
```

Wrap your app in a `<BrowserRouter>`, then declare which URL shows which component:

```jsx
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

function App() {
    return (
        <BrowserRouter>
            <nav>
                <Link to="/">Home</Link> | <Link to="/game">Game</Link>
            </nav>
            <Routes>
                <Route path="/"     element={<HomePage />} />
                <Route path="/game" element={<GamePage />} />
            </Routes>
        </BrowserRouter>
    );
}
```

- **`<Link to="/game">`** instead of `<a href>` - `Link` navigates *without* reloading the page (that's the SPA magic). Using a plain `<a>` would reload and defeat the point.
- **`<Routes>`** picks the first `<Route>` whose `path` matches the URL and renders its `element`.
- Check your imports - the #1 routing bug is importing from the wrong place or forgetting `<BrowserRouter>` (you'll get "useRoutes may be used only in the context of a Router").

---

## 4. useRef - a value that persists without re-rendering (Q5)

`useState` re-renders when it changes. Sometimes you want to *remember* a value across renders **without** triggering a redraw - a timer ID, a DOM element, "which card was flipped first." That's `useRef`.

```jsx
import { useRef } from "react";

const firstCard = useRef(null);   // .current holds the value

firstCard.current = 2;            // change it - NO re-render happens
console.log(firstCard.current);   // read it - survives across renders
```

- A ref is an object with one property: **`.current`**. Read and write `.current`.
- Changing `.current` does **not** re-render (opposite of state). That's the whole reason it exists.
- Common uses in the game: hold a reference to a DOM node, or stash "the first card the player clicked" while waiting for the second.

> Rule: if changing the value should update the screen → `useState`. If it's bookkeeping the UI doesn't need to react to → `useRef`.

---

## 5. State Transition Diagram - designing the game logic (Q6)

Before coding matching logic, the practical has you look at a **State Transition Diagram (STD)**. It's a map of the states the game can be in and what moves it between them:

```
  [No card flipped]
        │ click a card
        ▼
  [One card flipped]  ── remember it (useRef)
        │ click a second card
        ▼
  [Two cards flipped]
        ├── match?  → cards stay, back to [No card flipped]
        └── no match? → after a delay, flip both back → [No card flipped]
```

Coding straight from an STD is far easier than improvising - each arrow becomes an `if`. When your game misbehaves, you find which transition is wrong instead of staring at the whole thing. STDs are worth drawing for any logic with more than two states.

---

## 6. The matching logic (Q6 continued)

The heart of the memory game. Track flipped cards in state; when two are up, compare:

```jsx
const [flipped, setFlipped] = useState([]);   // indices currently face-up

function handleCardClick(index) {
    if (flipped.length === 1) {
        const first = flipped[0];
        if (cards[first] === cards[index]) {
            // match - leave them, reset the "flipped" tracker
            setFlipped([]);
        } else {
            // no match - show both, then flip back after a pause
            setFlipped([first, index]);
            setTimeout(() => setFlipped([]), 1000);
        }
    } else {
        setFlipped([index]);   // first card of the pair
    }
}
```

`setTimeout(fn, 1000)` runs `fn` after 1 second - that's the "let the player see the mismatch before it flips back" delay. This is where a game clock (next) also comes in.

---

## 7. The game clock (Q7)

The clock controls timing - how long mismatched cards stay visible, or a countdown. You build it with `setInterval` inside a `useEffect` (so it starts when the component mounts and you clean it up when it leaves):

```jsx
import { useState, useEffect } from "react";

const [seconds, setSeconds] = useState(0);

useEffect(() => {
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);     // cleanup - stop the timer on unmount
}, []);                                 // [] = run once when mounted
```

- `setInterval(fn, 1000)` fires `fn` every second.
- **`clearInterval(id)`** in the cleanup is essential - forget it and you leak timers that keep firing after the component is gone (a classic bug: the counter speeds up because you started three timers).
- `setSeconds(s => s + 1)` uses the *updater form* so it always adds to the latest value, not a stale one.

---

## 8. The extension challenges

Pick one (the practical offers a choice):

**Random card positions each start.** Shuffle the array before rendering. A simple shuffle:

```jsx
function shuffle(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}
// when the game starts:
const [cards, setCards] = useState(() => shuffle(baseCards));
```

`sort(() => Math.random() - 0.5)` is a quick-and-dirty shuffle - fine for a class game (not statistically perfect, but nobody's counting). `[...arr]` copies first so you don't mutate the original.

**Extend 4 pairs to 8 pairs.** Add four more image pairs to your source array, double the grid. The logic doesn't change - it's data-driven, so more cards = a longer array, same matching code. If your matching worked for 4, it works for 8. (This is the reward for writing data-driven code instead of hard-coding 8 cards.)

---

## 9. Mistakes that bite

- **"useX may be used only in the context of a Router"** → your routes/links aren't inside `<BrowserRouter>`.
- **Cards flip but never flip back** → missing/mis-timed `setTimeout`, or you compared the wrong indices.
- **Timer accelerates** → you started a `setInterval` without `clearInterval` cleanup; multiple intervals stacked up.
- **Nav reloads the whole page** → you used `<a href>` instead of `<Link to>`.
- **Changing a ref doesn't update the screen** → that's *correct*; refs don't re-render. If you need the screen to change, it should be state.

---

## 10. Recap flashcards

- State lives in the parent that needs it; children get props. Data down (props), events up (functions passed as props).
- SPA = one load, JS swaps components, no per-page server round-trip.
- `react-router-dom`: `<BrowserRouter>` wraps; `<Routes>/<Route path element>` map URLs to components; `<Link to>` navigates without reload.
- `useRef` → `.current`, persists across renders, does **not** re-render. State re-renders; ref doesn't.
- Design logic from a State Transition Diagram; each arrow is an `if`.
- `setTimeout(fn, ms)` one-shot; `setInterval(fn, ms)` repeating - always `clearInterval` in `useEffect` cleanup.
- Data-driven cards → 4 pairs to 8 pairs is just a bigger array.

Next: the database practicals. SQL first. →
