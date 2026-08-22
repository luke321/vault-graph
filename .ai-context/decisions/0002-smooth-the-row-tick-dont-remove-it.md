# 0002 — Smooth the row tick, don't remove it

**Date** 2026-08-22 · **Status** accepted

## Context

A note's radius is `base + row * SP`, where `row = Math.floor(pp)` and `pp` is a
continuous row coordinate. During a cascade a cell's row *count* is a real number that
drifts, so when it crosses an integer the outermost note's floor flips and that note
**teleports a full row pitch**.

`RADIAL_EASE` had been set to `1` on the reasoning that *"the continuous row coordinate
leaves no ticks to smooth."* That premise is false — the coordinate is continuous, the
radius taken from it is not. Setting it to 1 removed the only thing hiding the teleport.

Measured on the `04 - Daily Notes` hide: **one −160 unit step in a single frame**, and
still exactly −160 in one frame at `timeScale = 4` (384 frames, every other step under 3
units). Slowing it 4× not spreading the step proved a discontinuity rather than a pacing
problem. 160 is one row — the outer band spans 1178–2138 — which is what identified it.

## Rejected: take the radius from the continuous coordinate

Tried first, and it works: 04's worst single-frame step fell **160 → 2**. Reverted the
same day. It puts *every* note off-lattice on *every* intermediate frame, so the whole
animation reads as a smeared disc — the same failure the row-count note describes at
rest. It trades one bad frame for ~120 mushy ones, which is the wrong way round.

## Decision

Keep integer rows, and restore radial easing: **`RADIAL_EASE = 0.25`**.

The distinction that makes this work: easing only moves notes whose **target** changed,
so the disc stays on its lattice and just the crossing note glides. The rejected approach
moved everything, every frame.

Swept against the probe on the 04 hide, worst single-frame outer step:

| ease | 1 | 0.5 | 0.35 | 0.25 |
|---|---|---|---|---|
| step | 160 | 80 | 56 | **40** |

The stated reason for choosing 1 — leftover lag closing in one go at the end — did not
reproduce at any value: final-frame delta 0 and end-snap 0 on both directions. That
failure was measured over 48 frames; a toggle now runs 62–123, ample to converge. See
`0003` for the guarantee that makes it hold.

## Consequences

- One row tick becomes ~4 frames of 40 units instead of one frame of 160.
- Exposed as `__vg.radialEase` so it can be re-swept without a rebuild.
- The `Math.floor(pp)` step is still there. It is *smoothed*, not removed — anyone
  tempted to remove it should read the rejected option above first.
