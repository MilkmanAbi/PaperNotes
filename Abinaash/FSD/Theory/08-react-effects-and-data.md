---
title: React — Effects, Data & Routing
emoji: (っ°Д°)っ
order: 8
blurb: useEffect, fetching from your API, loading/error states, useContext, custom hooks, React Router, and the new React 19 features (Actions, useActionState, use).
---

# React — Effects, Data & Routing (っ°Д°)っ

> Chapter 07 built UI from data you already had. This chapter is where React *goes and gets* the data — from the Express API you built. This is the seam where the two halves of MERN finally meet in the browser.

---

## 1. `useEffect` — talking to the outside world

A component's job is to render from props/state. But sometimes you need to reach *outside* React — fetch data, set a timer, subscribe to something. That's a **side effect**, and `useEffect` is where it goes.

```jsx
import { useState, useEffect } from "react";

function Notes() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    // this runs AFTER render
    console.log("component mounted / dependency changed");
  }, []);   // ← the dependency array

  return <p>{notes.length} notes</p>;
}
```

The second argument — the **dependency array** — controls *when* the effect runs. This is the single most misunderstood thing in React, so slow down:

| Dependency array | Runs when |
|---|---|
| `[]` (empty) | **once**, after the first render (on "mount"). Use for initial data fetch. |
| `[value]` | after first render **and** whenever `value` changes. |
| *(omitted)* | after **every** render. Almost always a mistake — causes infinite loops when combined with fetching+setState. |

**The classic infinite-loop bug:** fetch inside an effect with *no* dependency array → the fetch sets state → state change re-renders → effect runs again → fetches again → forever. Always give a dependency array. Empty `[]` for "just once."

---

## 2. Fetching data from your API — the core pattern

This is *the* pattern you'll write over and over. Fetch on mount, track three states (loading / error / data), render accordingly.

```jsx
function NotesPage() {
  const [notes, setNotes]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/notes");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);  // fetch won't throw on 4xx/5xx!
        const data = await res.json();
        setNotes(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);      // always stop loading, success or fail
      }
    }
    load();
  }, []);   // fetch once on mount

  if (loading) return <p>Loading notes… (￣ρ￣)..zzZZ</p>;
  if (error)   return <p>Couldn't load notes: {error}</p>;
  if (notes.length === 0) return <p>No notes yet. A blank page is still a page.</p>;

  return (
    <ul>{notes.map(n => <li key={n._id}>{n.title}</li>)}</ul>
  );
}
```

Everything here comes from earlier chapters: `useState` (07), `useEffect` (this one), `async/await` + `res.ok` (02), `.map` + `key` (07), conditional rendering (07). The loading/error/empty/data quartet is the honest way to handle async — never render as if data is already there.

**Note:** you can't make the effect callback itself `async` (`useEffect(async () => ...)` is wrong — effects may return a *cleanup function*, and async functions return a promise). So define an `async` function *inside* and call it, as above.

---

## 3. Sending data — POST/PUT/DELETE from React

Reading is a GET. Writing needs the method, headers, and a JSON body:

```jsx
async function addNote(title) {
  const res = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },   // tell server it's JSON
    body: JSON.stringify({ title }),                    // object → JSON string
  });
  if (!res.ok) throw new Error("Failed to create");
  const created = await res.json();                     // the new note (with _id)
  setNotes(prev => [...prev, created]);                 // add to state → re-render
}

async function deleteNote(id) {
  await fetch(`/api/notes/${id}`, { method: "DELETE" });
  setNotes(prev => prev.filter(n => n._id !== id));     // remove from state
}
```

Three musts for writes: set **`method`**, set **`Content-Type: application/json`** (or Express's `express.json()` won't parse it), and **`JSON.stringify`** the body. After a successful write, update local state so the UI reflects it without a full refetch.

---

## 4. The dev proxy — avoiding CORS in development

Your React dev server is on :5173, your API on :3000 — different origins, so `fetch("http://localhost:3000/api/notes")` triggers CORS (chapter 04). The clean fix in dev is a **Vite proxy**: tell Vite to forward `/api/*` to your backend, so the browser thinks it's all one origin.

```js
// vite.config.js
export default {
  server: {
    proxy: {
      "/api": "http://localhost:3000",   // /api/* → your Express server
    },
  },
};
```

Now you write `fetch("/api/notes")` (relative, no host) and it Just Works with no CORS error in dev. In production you'll either serve React from Express or configure CORS properly (chapter 09).

---

## 5. `useContext` — sharing data without prop-drilling

Passing a prop down through five layers of components ("prop drilling") is miserable. **Context** lets you provide a value at the top and read it anywhere below, skipping the middle.

```jsx
import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);          // 1. create

export function AuthProvider({ children }) {       // 2. provide
  const [user, setUser] = useState(null);
  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

const useAuth = () => useContext(AuthContext);  // 3. consume (custom hook)
```

```jsx
// anywhere deep in the tree, no props needed:
function Navbar() {
  const { user } = useAuth();
  return <span>{user ? user.name : "Guest"}</span>;
}
```

Use context for genuinely global things: the logged-in user, theme (dark/light), language. Don't use it for everything — plain props are fine and clearer for local data. Overusing context makes components hard to reuse.

---

## 6. Custom hooks — reusing logic

A **custom hook** is just a function starting with `use` that calls other hooks. It lets you extract and reuse stateful logic. The fetch pattern from §2 is a perfect candidate:

```jsx
function useFetch(url) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;             // guard against setting state after unmount
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };  // cleanup on unmount / url change
  }, [url]);

  return { data, loading, error };
}

// usage — one line replaces the whole §2 boilerplate:
function NotesPage() {
  const { data: notes, loading, error } = useFetch("/api/notes");
  if (loading) return <p>Loading…</p>;
  if (error)   return <p>Error: {error}</p>;
  return <ul>{notes.map(n => <li key={n._id}>{n.title}</li>)}</ul>;
}
```

That `return () => {...}` is a **cleanup function** — `useEffect` can return one, and React runs it before the next effect and on unmount. Here it prevents the "can't set state on an unmounted component" issue when the user navigates away mid-fetch. Cleanup is also how you clear timers and unsubscribe.

---

## 7. React Router — multiple "pages" in an SPA

An SPA has one HTML page, but users still expect URLs and a back button. **React Router** maps URLs to components without full reloads.

```bash
npm install react-router-dom
```

```jsx
import { BrowserRouter, Routes, Route, Link, useParams } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/notes">Notes</Link>
      </nav>
      <Routes>
        <Route path="/"            element={<Home />} />
        <Route path="/notes"       element={<NotesPage />} />
        <Route path="/notes/:id"   element={<NoteDetail />} />
        <Route path="*"            element={<NotFound />} />   {/* catch-all 404 */}
      </Routes>
    </BrowserRouter>
  );
}

function NoteDetail() {
  const { id } = useParams();        // grab :id from the URL
  const { data: note } = useFetch(`/api/notes/${id}`);
  return <h1>{note?.title}</h1>;
}
```

- **`<Link to="...">`** replaces `<a href>` — it navigates *without* a page reload (an `<a>` would reload and kill your SPA state).
- **`<Route>`** maps a `path` to an `element`.
- **`useParams()`** reads URL params (`:id`) — same idea as Express's `req.params`.
- **`useNavigate()`** navigates from code (e.g. after a successful login, `navigate("/dashboard")`).

---

## 8. React 19 — the new stuff (good to know)

React 19 (and 19.2) added features that reduce form/async boilerplate. You don't *need* them for the basics, but you'll see them and they're genuinely nicer:

- **Actions** — pass an async function to a `<form action={fn}>`; React manages the pending state, errors, and resets for you.
- **`useActionState`** — a hook that tracks the result and pending status of an action, killing a lot of manual `useState` for forms:
  ```jsx
  const [state, formAction, isPending] = useActionState(submitFn, initialState);
  ```
- **`useFormStatus`** — lets a nested button know the parent form is submitting (show a spinner/disable) without prop-drilling.
- **`useOptimistic`** — show the expected result *immediately* while the real request is in flight, then reconcile. (Honest UI: the request is still marked in-flight; you're just not making the user wait to see their own intent.)
- **`use`** — read a promise or context *during render* (works with `<Suspense>` for loading states).
- **The React Compiler (1.0)** — an automatic optimiser that memoises for you, so you rarely need `useMemo`/`useCallback` by hand anymore. It's opt-in via a build plugin.
- **Native document metadata** — you can put `<title>` and `<meta>` right in a component and React hoists them to `<head>`.

For ET0744, the manual `useState` + `useEffect` + `fetch` pattern (§2) is completely fine and often clearer for learning. Reach for Actions/`useActionState` once forms start feeling repetitive.

---

## 9. Hook rules — the two you must never break

1. **Only call hooks at the top level** of a component or custom hook. Never inside a loop, condition, or nested function. (React tracks hooks by call order; conditional hooks scramble that order.)
2. **Only call hooks from React functions** — components or other hooks, not plain functions or event handlers.

```jsx
// ✗ WRONG — hook inside a condition
if (loggedIn) { const [x, setX] = useState(0); }

// ✓ RIGHT — hook at top level, use the value conditionally
const [x, setX] = useState(0);
if (loggedIn) { /* use x */ }
```

Break these and you get `Rendered fewer hooks than expected` or worse — silent state corruption. The `eslint-plugin-react-hooks` linter (bundled with Vite's React template) flags violations; heed it.

---

## Recap flashcards

- `useEffect(fn, deps)` runs side effects after render; `[]` = once, `[x]` = when x changes, none = every render (avoid).
- Fetch pattern: async fn inside effect, track loading/error/data, check `res.ok`, `finally` stop loading.
- Writes: `method`, `Content-Type: application/json`, `JSON.stringify(body)`; then update state.
- Dev CORS fix: Vite `server.proxy` forwards `/api` to :3000; use relative fetch URLs.
- `useContext` for global data (user, theme); create → Provider → `useContext`.
- Custom hooks (`useX`) extract reusable stateful logic; effects can return a cleanup fn.
- React Router: `<Link>`, `<Routes>/<Route>`, `useParams`, `useNavigate` — URLs without reloads.
- React 19: Actions, `useActionState`, `useOptimistic`, `use`, the Compiler — nicer, optional.
- Hook rules: top level only, React functions only.

Next: wiring all four MERN layers into one running app, with auth. →
