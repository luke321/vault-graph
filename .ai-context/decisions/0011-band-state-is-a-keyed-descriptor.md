# 0011 — Band state wants to be one keyed descriptor

**Date** 2026-08-24 · **Status** proposed, attempted once, reverted · **Relates to** `animation.md`

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

## Attempted, reverted

The mechanical rename was written and applied: ~30 sites, all pairs gone, `node --check` clean.
The page then **failed to boot** — `TypeError: Cannot read properties of undefined (reading 'i')`
inside `bandOf`, i.e. `BAND` undefined when it was called. `bandOf` is a hoisted function
declaration and `BAND` is a `var` assigned mid-module, so something reaches it before its
initialiser runs; grep found no module-level call above the declaration, so the caller is
indirect and was not tracked down before the session ended.

Reverted rather than left half-migrated. The patch script is reproducible and the parity harness
that gates it exists (`parity.mjs`: every note's radius, angle and drawn radius across six filter
states per fixture, diffed — a rename must come out at zero).

**Start here next time.** Print the *caller* of `bandOf` from the first page error, now that the
CDP harness records page exceptions (`p.errors`, `p.firstError()`). Adding that capture is what
turned six rounds of narrowing by hand into one round with the answer in it, and it was itself the
main cost of this attempt: `eval()` only reports exceptions from the expression it ran, so a script
that dies during boot shows up as `window.__vg is undefined` with no reason attached.

The likely shape of the fix is a hoisting-safe definition — build the descriptor in a function and
call it from the first reader, or declare it above every other module-level statement — but that is
a guess, and this file exists because guessing is how the six bugs above took a week.
