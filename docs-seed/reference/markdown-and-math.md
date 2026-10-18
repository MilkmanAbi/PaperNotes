---
title: Markdown, maths and code
tags: [reference, verified]
---

# Markdown, maths and code

One page with everything the renderer handles, so that a change to it has
somewhere obvious to fail.

## Text

Regular prose sets in the reading voice — a serif, because this is text you
read rather than scan. **Bold**, *italic*, ~~struck through~~, `inline code`,
and a [link to another note](../00-start-here.md). A link to a note that does
not exist is [marked as missing](./nowhere.md) rather than quietly handed to
you as if it worked.

> A block quote sits in the annotation voice. It is a different register, not
> an emphasis.

Footnotes work too.[^1]

[^1]: And land at the bottom, with a link back to where they were referenced.

## Lists

- Plain bullets
- With nesting
  - That keeps its indent step
    - However far down it goes

1. Ordered lists
2. Count the way you would expect
3. Even when the source numbers are all `1.`

- [x] Task list items render with a checkbox
- [x] Which reflects the state in the file
- [ ] And is read-only, because the file on disk is the truth — a checkbox you
      could click here would throw your change away the moment you navigated

## Maths

Inline maths sits in a sentence without disturbing the line: the Euler identity
$e^{i\pi} + 1 = 0$ is the usual example, and $\sum_{k=1}^{n} k$ grows as you
would expect.

Display maths gets its own block and scrolls horizontally if it has to:

$$
\int_{-\infty}^{\infty} e^{-x^{2}}\,dx = \sqrt{\pi}
$$

$$
\begin{aligned}
  \nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
  \nabla \cdot \mathbf{B} &= 0 \\
  \nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
  \nabla \times \mathbf{B} &= \mu_0\mathbf{J} + \mu_0\varepsilon_0\frac{\partial \mathbf{E}}{\partial t}
\end{aligned}
$$

A matrix, to check the spacing holds:

$$
\mathbf{A} = \begin{bmatrix}
a_{11} & a_{12} & \cdots & a_{1n} \\
a_{21} & a_{22} & \cdots & a_{2n} \\
\vdots & \vdots & \ddots & \vdots \\
a_{m1} & a_{m2} & \cdots & a_{mn}
\end{bmatrix}
$$

An equation that cannot be parsed shows itself and says why, rather than
vanishing or taking the page down with it: $\thisIsNotACommand{x}$.

A bare `$12.50` in a sentence is not treated as the start of an equation, which
is the usual way dollar-delimited maths goes wrong in a notes app.

## Code

```python
def settle(series, window=16):
    """Trailing mean once the transient has decayed."""
    if len(series) <= window:
        raise ValueError("series shorter than the settling window")
    tail = series[window:]
    return sum(tail) / len(tail)
```

```rust
fn main() {
    let readings: Vec<f64> = (0..32).map(|i| (i as f64).sqrt()).collect();
    println!("{:?}", readings.iter().sum::<f64>() / readings.len() as f64);
}
```

Syntax colours are companions to the accent and are all held duller than it, so
a block of code never out-shouts the one colour on the page that means
"primary action".

## Tables

| Column | Meaning | Reading |
| --- | --- | ---: |
| `drift` | Change per hour once settled | 0.42 |
| `window` | Samples discarded at the start | 16 |
| `sigma` | Standard deviation of the tail | 0.0071 |

Numeric columns right-align and use tabular figures. Wide tables scroll as a
unit rather than stretching the reading column.

## Horizontal rules

Which separate sections without needing a heading.

---

And that is the lot.
