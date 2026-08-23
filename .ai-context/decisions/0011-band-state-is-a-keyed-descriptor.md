# 0011 — Band state wants to be one keyed descriptor

**Date** 2026-08-24 · **Status** accepted · **Relates to** `animation.md`

## Context

The two rings are packed independently. That was not a preference: a single spacing made each
ring answer for the other's filtering, and hiding *outer* folders spread the *inner* ring until
the two touched — clear space between them fell from 843 units to 89.

So every layout quantity is per band. They are held as **pairs of scalars**, and in every pair
the unqualified name means the *outer* band while the inner one carries a suffix:

| outer | inner |
|---|---|
| `lastSP` | `lastSPI` |
| `DOT_M`, `DOT_B`, `DOT_LO` | `DOT_MI`, `DOT_BI`, `DOT_LOI` |
| `pitchUnits()` with no argument | `pitchUnits("i")` |

## The tally

Six bugs in one session were a site reading the unqualified name, or reading the right name from
the wrong *pass*. Each was found by a person looking at the disc, not by a check:

1. **The seam pitch** — sized from `lastSP` on both rings, so the inner ring's seams were set by
   the outer ring's spacing and grew when outer folders were toggled.
2. **The dot ramp** — calibrated from `lastSP` alone and applied to both bands. Measured on a
   96-of-454 range: outer pitch 400 units, inner 206, the same dots in both, worst pair clearance
   239 outer against **29** inner. Reported as gaps at the outer seams *and* notes touching on the
   inner ring, which is one bug seen from both ends.
3. **`pitchUnits()`'s argument omitted** inside `dotPx`, so a note in the inner band had its room
   compared against the outer pitch.
4. **The band depth** feeding `seamFall` taken as the plan's integer rather than the walked value:
   `rows` went 5 → 4 between two frames and the falloff 1 → 1.398 with it, widening every channel
   on the disc by 40% in one frame.
5. **The pixel floor** scaled by the room in one place and not the other, so the floor won wherever
   a note had less room than a pitch. Six overlapping pairs at 1280×635, every dot in them at
   radius exactly 45 units — 1.5px there — against arcs of 45 to 88.
6. **A margin reserved from the previous pass's room**, because `bandRoom` is a module variable
   assigned at the *end* of `ringsLayout` while the margin is spent during it. When the room grew
   between layouts the dot outgrew the margin held for it and crossed into the seam. Reported
   three times before it was understood.

## Decision

Replace the pairs with one keyed descriptor per band — `sp`, `rows`, `room`, `scale`, `ramp`,
`gapDeg`, `nG` — reached through `bandOf(key)`.

The value is not tidiness. It is that **there is no bare name left to reach for**: the band has to
be named, so the wrong band has to be chosen *deliberately*. Bugs 1–3 and 5 become unwriteable.
Folding `INNER_SCALE` into the descriptor as `scale` — better still, storing `base` and `sp`
pre-scaled so a radius is `base + row*sp` with nothing multiplying it — removes the eleven sites
that currently have to remember the inner ring is drawn at 0.8.

## Landed

`BAND`, reached only through `bandOf(key)`, holding `sp`, `rows`, `room`, `ramp`, `gapDeg`, `nG`.
Every pair is gone; the sole direct `BAND.` reference is inside `bandOf` itself.

Verified by measurement rather than by argument: `parity.mjs` captures every note's radius, angle
and drawn radius across six filter states per fixture — 18 states, 5 892 notes at rest — and the
diff is **0.00 on all three quantities in all 18 states, nothing missing**. Suite 44/44 on all
three fixtures.

## The hoisting trap, which is the whole reason this took two attempts

The first attempt was the same patch. It passed `node --check` and the page **did not boot**:
`TypeError: Cannot read properties of undefined (reading 'i')` inside `bandOf`.

`mountVaultGraph` calls `measureDotTyp()` near the top of its body, which reaches `dotUnits` and so
`pitchUnits` — **above every one of these declarations**. A `var` initialiser has not run at that
point. The pairs of scalars survived it by accident, because `(lastSPI || 1)` reads `undefined` and
carries on with 1; `BAND.i` on `undefined` throws.

So two rules, and both matter:

- **The descriptor is built on first use, inside `bandOf`.** A function declaration is hoisted
  where a `var` initialiser is not. Every *writer* goes through `bandOf` too, so the construction
  cannot be skipped. Nothing touches `BAND` directly.
- **`bandScale()` is a function, not a field.** `INNER_SCALE` is declared below that first caller
  as well, so a descriptor built early would capture `undefined` and keep it for the session. Had
  `scale` been a field, the page would have booted and drawn the inner ring at `NaN` — the crash
  was the friendlier failure.

## What made it landable

Two tools, both built because this attempt needed them:

- **`p.errors` / `p.firstError()` in `scripts/cdp.mjs`.** `eval()` only reports exceptions from the
  expression it ran, so a page dying during boot presents as `window.__vg is undefined` with no
  reason attached. Without the capture, narrowing by hand took six rounds and did not reach the
  cause. With it, the same failure printed its own stack — `bandOf → pitchUnits → dotUnits →
  measureDotTyp → mountVaultGraph` — and the fix followed from reading it.
- **`parity.mjs`.** "It compiles and the suite is green" is not evidence for a rename: the suite
  cannot run at all against a page that never initialises, and the first attempt would have passed
  every static check. A diff of the drawn disc across 18 states is a different kind of claim.

## Still to do

`INNER_SCALE` is now one function instead of eleven scattered reads, but it is not yet *folded*:
radii are still `(base + row * sp) * scale`. Storing each band's `base` and `sp` pre-scaled would
make a radius `base + row * sp` with nothing multiplying it, which is the last place the inner ring
being drawn at 0.8 has to be remembered. That is arithmetic rather than renaming, so it will not
come out at parity zero to the last decimal, and it wants its own pass.
