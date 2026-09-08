# 0011 — A live rebuild retakes the geometry lock at rest, before either endpoint

**Date** 2026-09-08 · **Status** accepted · **Strengthens** `0006-zero-weight-members-must-cost-nothing`
· github#72

## Context

`geomLock` — `r0`, `rOuter`, `maxR`, `total`, `bandTotal`, `bandR`, `rows` — is taken once, in
`regroup()`, from `buildWedgePlan(false)`: the **unfiltered** plan, every note at weight 1. Until
github#72 nothing could move it after the mount. Every filter, every toggle, every date range
changes only *which* notes are visible, and the unfiltered plan is by definition indifferent to
that. `hardRelayout`'s `deferLayout` path even restores the previous lock explicitly (github#49),
because the two ends of a cascade have to be measured under one geometry or the walk between them
is not a walk.

A live rebuild is the first thing that changes the **note set**. The unfiltered plan genuinely
differs, so `geomLock` genuinely moves, and there is nowhere to put that step that costs nothing.

## What it actually costs

Measured before choosing, by building each fixture, adding one note, rebuilding, and comparing:

| | demo (1,403 → 1,404) | 10k (10,002 → 10,003) | dominant-folder (954 → 955) |
|---|---|---|---|
| `r0` | 6.646 → 6.648 | 18.632 → 18.633 | — |
| in pixels | **0.024 px** | **0.005 px** | — |
| `lockedMaxR` | 25 → 25 | 61 → 61 | unchanged |
| `holeShare` | 0.263 → 0.263 | 0.304 → 0.304 | unchanged |
| band flips | 0 | 0 | 0 |

So the step exists and it is sub-pixel. What remained was **where to put it**.

## Decision

**Retake `bandLock` and `geomLock` at rest, when the diff lands, before either cascade endpoint
is built** — `hardRelayout(false, true, true)`, the third argument added for this.

The consequence that matters: `planA` and `planB` are both computed under the *new* lock, and the
lock is not touched again for the life of the cascade. So the last frame is `planB` is the resting
layout, exactly, and **`settle()` stays a no-op at target 0** — which is measured, not argued:
after a one-note live add, a fresh `relayout()` moves **0 notes and resizes 0 dots on all three
fixtures**.

The residual step lands on frame 0, and it is the sub-pixel `r0` delta above.

`planA` being the disc as currently drawn is not an assumption here — it is `decisions/0006`. The
arriving note is seated at alpha 0 before `planA` is built, and a zero-weight member is guaranteed
to change no plan, no row and no `maxR`. That ADR is what makes this one cheap.

## What was rejected

**Walk `geomLock` as a cascade endpoint** — `geomSrc`/`geomDst` interpolated on the same clock as
`rowsSrc`/`rowsDst` and `spSrcB`/`spDstB`. Correct, and exactly continuous at *both* ends rather
than one. Rejected on cost: the lock comes from an **unfiltered** plan, so walking it means
building one per frame — the precise term github#19 spent a day removing (`buildWedgePlan` 7.5 →
3.5 ms/frame on a show). Paying that back to buy 0.024 px is the wrong trade. If a future change
makes the extent move by something visible, this is the route to take, and `perf-cascade-frame-cost.md`
is where its price is written down.

**Hold the old lock and swap at `settle()`** — cheapest of the three, and it puts the identical
step on the **last** frame. `animation.md` opens with the rule it breaks: the last frame of a
cascade must be identical to the resting layout, and every animation bug reported against this
project has been a violation of it. Not taken, and not taken quietly: a sub-pixel jump at the end
is still a jump at the end, and the bar is 0.

## Consequences

- The disc's extent now follows the vault's size while the view is open, which it never did
  before. On a vault where notes arrive one at a time this is invisible; on one where they arrive
  two hundred at a time the live path refuses and the host rebuilds (`LIVE_MAX_CHANGED`).
- `hardRelayout` has a third parameter, and github#49's caller keeps the old behaviour by
  omitting it. The two call sites want opposite things for the same reason — a toggle moves no
  note, a rebuild does — and that reason is now in the code as a pointer to this file.
- `bandLock` is re-derived with the previous lock as its hint, so a band flips only when the new
  unfiltered plan genuinely says so. Measured: a one-note add flips none, on all three fixtures.

## Verify

```bash
node scripts/smoke.mjs --only "live rebuild lands on the layout a fresh relayout gives"
```

Expect, on each fixture: `cascade converged; settle vs fresh relayout: 0 moved / 0 resized,
0 band flip(s)`.
