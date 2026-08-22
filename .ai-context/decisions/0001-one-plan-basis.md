# 0001 — One plan basis, always visible-only

**Date** 2026-08-22 · **Status** accepted · **Supersedes** the `REPACK_BELOW` threshold

## Context

`ringsLayout` chose between two plan bases:

- **whole-vault** — every note gets a seat whether visible or not, so hiding something
  changes a wedge's *angle* but never a note's row. Stops notes appearing to swap seats.
- **visible-only** — rebuilt from what is on screen, so density adapts. Without it,
  filtering hard left *"55 notes over 8 rows with 88-degree gaps, a spidery disc instead
  of a filled one."*

The switch was `shown < order * 0.55`. Both sides existed for measured reasons, and the
threshold looked like a reasonable compromise.

It was not. It made **planning depend on how many notes were toggled**, which produced:

1. **Inconsistent behaviour by folder size.** Hiding `08 - Meeting Notes` (221 notes)
   crossed the threshold and re-densified; hiding `04 - Daily Notes` (55) did not. The
   same gesture shrank the ring or held it depending on which folder you picked.
2. **Two packings inside one animation** for any toggle that *crossed* the line —
   interpolating from a whole-vault planA to a visible-only planB.
3. **Silent disagreement between call sites.** The cascade hardcoded `true` while the
   resting path computed the flag, so the ring changed size *after* the animation
   finished. Measured with 04 hidden (393 of 450 visible, threshold 248): visible-only
   gave 16 cells / 64 rows / maxR 13, whole-vault 19 cells / 75 rows / maxR 14 — every
   major cell differing by exactly one row. One row was the jump.

## Decision

One basis, everywhere: **always build the plan from what is visible.** `REPACK_BELOW` is
retired at all five call sites.

The seat-swapping argument for the whole-vault basis does not survive inspection: a
cell's notes are sorted by `hubRank`, so hiding some **compacts the rest inward in
order** — they never cross each other. What was framed as "swapping seats" is really
"densifying", which is the behaviour the visible-only basis exists to give.

## Consequences

- Behaviour is uniform. Hiding a small folder and a large one now differ in degree, not
  in kind. Resting ring radius: `03` 1818, `04` 1978, `08` 1658, `05` 2138 (inner).
- A note does not keep its exact row across a filter. It keeps its **relative order**,
  which is the property that reads as stable.
- The cascade's endpoints come from `staticPlan(presentFn)`, which derives every argument
  from "which notes are present" exactly as the resting path does — so planA is what the
  disc was resting in and planB is what `settle()` assigns, by construction.
- `__vg.checkPlanParity()` asserts the two agree cell by cell, so this cannot drift again
  unnoticed. **Run it with something hidden** — full vault is where the old bug hid.

## Verify

```javascript
__vg.checkPlanParity()   // parityOK: true, with a folder hidden
```
