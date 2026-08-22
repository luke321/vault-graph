# 0006 — A zero-weight member must not change the plan

**Date** 2026-08-22 · **Status** accepted · **Strengthens** `0001-one-plan-basis`

## Context

After the plan basis was unified (`0001`) and the animation was made to converge before
settling (`0003`), one symptom survived: **a small jump when disabling a wedge**, visible
on `04 - Daily Notes`. It read like a dropped frame.

It resisted three rounds of diagnosis because the obvious candidates were all clean:

| Suspected | Measured |
|---|---|
| Per-frame position | decays to exactly 0 — no terminal spike |
| Node size, label, colour | **zero** changes across the whole animation |
| Camera / sigma rescale | ratio constant at 1.08, origin unmoved |

Measuring **screen pixels** rather than graph units, on the six outermost notes *not* in
the toggled folder, finally showed it:

```
1965ms  screen=0.03  graph=0.2     converged
1982ms  screen=6.03  graph=33.1    one isolated frame
1999ms  screen=0.02  graph=0.1     static again
```

## The mechanism

It is **not** two planners, and framing it that way sends you looking in the wrong place.
There is one planner and one basis. What differs is the **membership set** it is called
with, and that difference is irreducible:

- mid-animation, a departing note must still be in the plan — it holds its place while it
  fades
- at rest it must be gone

**There are two separate gap computations, and only one of them positions anything.** This
cost two failed attempts, so it is worth stating plainly:

| Where | What it feeds |
|---|---|
| `share()` in `buildWedgePlan` | `c.band`, the **reference width** row counts are solved against |
| `ringsLayout` | `c.span`, the **rendered angular width** of every wedge |

Both counted groups with an integer. Fixing `share()` alone moved the row-count reference and
left the visible geometry untouched, so the jump persisted unchanged and looked like the fix
had simply failed.

`ringsLayout` computed `nG` as an integer count of the groups in `band`, `nSub` as
`band.length - nG`, and `band` drops a cell the instant its `geom` falls below `1e-4`. So a
fading group kept its gaps **fully reserved all the way down**, and on the single frame its
last note reached zero opacity `nG` went 9 → 8 and `nSub` 9 → 6: **2° + 3 × 0.3° = 2.9°
redistributed across every wedge, unanimated.**

## Decision

**A member with no weight must not change any output.** Since the two membership sets can
never be made identical, make the planner insensitive to the difference.

Both are continuous now, and in `ringsLayout` — the one that matters — a group spends its gap
in proportion to its **opacity** (`geom / seats`), each non-first cell its sub-gap likewise.
Weight alone is not enough: `min(1, groupWeight)` stays saturated while a 55-note folder fades
from 55 down to 1, then collapses over two frames, relocating the step rather than removing
it. Opacity is the quantity that actually runs 1 → 0 across the fade.

**Every placed increment must carry the same weight as the reservation** — `gapTotal` and the
`theta` sweep have to agree, or the wedges stop filling the circle.

This is the same rule as everywhere else in this layout, applied to the one term that had
escaped it: *nothing in the chain from weight to position is allowed to step.*

## Consequences

- Confirmed smooth in use. Measured with a **static opacity sweep** rather than frame sampling,
  because the browser pane throttles rAF and captured 1 frame instead of ~120: the seated plan
  at alpha 0 and the settled plan agree to **0° and 0 units**, and the fade moves ~1.5° per step
  (132.9 → 134.5 → 136.1 → 137.9 → 139.0 → 139.4).
- That sweep also shows a 27° cliff around alpha 0.03, which is a **test artifact** — it calls
  `buildWedgePlan` without `rowsOf`, so it sees the raw integer row count instead of the
  continuous walk `rowsAt` performs during a real cascade. Don't chase it.
- Gaps are now marginally narrower while a group fades. Invisible at 2° over ~1.6s, and
  the alternative is a discontinuity.
- **`__vg.checkZeroWeightInvariance()`** asserts the property directly — it builds the plan
  over visible notes, then again with every hidden note seated at weight 0, and requires
  identical rows and `maxR`. Run it **with a folder hidden**; at full vault there are no
  zero-weight members to expose anything.

This is a stronger guarantee than `checkPlanParity()` and would have caught the bug on
day one. Parity compares two plans that *should* agree; invariance tests the property that
makes them agree.

## Verify

```javascript
__vg.checkZeroWeightInvariance()   // hide a folder first -> invariantOK: true
```

With `04` hidden: 16 cells vs 19 (the padded plan seats the hidden notes), **maxR 13 vs 13,
zero row differences**. Before the fix: 13 vs 14.
