# github#202: a typical dot draws at about half the size its room allows

Measured on develop `c118bad`. The issue lists three directions and none is chosen, so this
folder measures all three and recommends one. **Nothing here is built into `src/page.js`.**

| file | what it does |
|---|---|
| `variants-202.mjs` | the three directions as exact edits to `src/page.js`; `--apply <v> [--param n]` swaps a throwaway working copy, `--restore` puts it back |
| `measure-202.mjs` | each variant on the five suite fixtures, headless at 1584×961 `?rest`, page title `vault-graph-202-dot-half-room - <fixture> <variant>`; writes `measurements.json` plus full-page, zoom and narrow-wedge shots |
| `suite-202.ps1` | twelve sizing, serpentine and rest checks of `smoke.mjs --only` against one variant, then restores `src/page.js` |
| `measurements.json` | the numbers below |

## The mechanism, measured

`dotPx()` puts a dot at `lo + (hi − lo) · dotRamp(id)`.

- `dotRamp` is `1.55·√links / 8.4`. It saturates at about 29 links, and an unlinked note sits at
  0.405 (`NODE_ORPHAN`).
- The median ramp position is 0.41 on demo, which is where the issue's "half the room" comes from.
- The floor is 1.431 px on every fixture, matching the issue.
- My caps read about 10% above the issue's (demo outer 4.30 against 3.69), with the same dot/cap
  ratio (0.62 against 0.64). That fits a viewport difference: the issue's run took its viewport
  from the window, this one sets 1584×961 exactly.

**The 10k does not have the problem.** Its cap is 1.85 px outer and 1.40 inner, against a floor of
1.43. The outer median is already at 0.88 of its cap and the inner ring is entirely floor-bound
(dot/cap 1.00). None of the three directions can grow a dot whose cap is the floor.

**The narrow-wedge effect is the cell clamp, not `edgeCap`.** On demo, the eight notes in 1–3
note folders have an edge clearance of 29–39 lattice units. What actually holds them is their
own cell step, 58–69 units against a 130-unit pitch, which puts their ceiling at 1.72–2.03 px
against 3.73 for the ring. So a variant that only relaxes `edgeCap` changes nothing on any
fixture; that was measured, then discarded. Direction B therefore lets a 1–3 note wedge size
against its row's pitch (`pit · DOT_CLEAR`) instead of its own cell step, when *Size dots from
the frame* has a clearance for it.

## The variants

- **A · curve**: `lo + (hi − lo) · dotRamp^γ`, γ 0.5 (0.35 probed). The resting ramp
  (`restT`) is curved the same way, so a settled dot still equals a fresh relayout.
- **B · narrow wedge to pitch**: as above, for wedges of three notes or fewer.
- **C · floor share**: `lo = max(lo, s · hi)`, s 0.6 (0.45 probed), in `dotPx`, `takeRest` and
  `restAt`. #171 rejected the same shape at `s = NODE_MIN/NODE_MAX ≈ 0.24`, where it reached almost
  nothing.

Median dot over its own cap, outer / inner ring (the table on the review page and
`measurements.json` carry every column):

| fixture | develop | A γ0.5 | A γ0.35 | B | C 0.6 | C 0.45 |
|---|---|---|---|---|---|---|
| demo | 0.62 / 0.65 | 0.77 / 0.78 | 0.83 / 0.84 | 0.62 / 0.64 | 0.77 / 0.77 | 0.68 / 0.68 |
| 10k | 0.88 / 1.00 | 0.93 / 1.00 | 0.95 / 1.00 | 0.88 / 1.00 | 0.88 / 1.00 | 0.88 / 1.00 |
| shape | 0.59 / 0.55 | 0.75 / 0.73 | 0.82 / 0.80 | 0.59 / 0.55 | 0.78 / 0.76 | 0.70 / 0.67 |
| tag | 0.58 / 0.54 | 0.75 / 0.72 | 0.81 / 0.79 | 0.58 / 0.54 | 0.78 / 0.77 | 0.70 / 0.68 |
| spec | 0.50 / 0.45 | 0.70 / 0.62 | 0.77 / 0.71 | 0.50 / 0.45 | 0.77 / 0.73 | 0.68 / 0.63 |

What each one costs. ρ is the Spearman rank correlation between link count and size in the outer
ring. "Inversions" is the share of same-wedge note pairs where the more-linked note draws over
0.05 px smaller.

| | demo outer ρ | demo inversions | spec inner ρ | spec inversions | narrow wedge, demo (dot / ring) |
|---|---|---|---|---|---|
| develop | 0.92 | 0.037 | 0.94 | 0.029 | 1.62 / 2.39 |
| A γ0.5 | 0.83 | 0.080 | **−0.13** | 0.115 | 1.77 / 2.93 |
| B | 0.92 | 0.037 | 0.99 | 0.029 | **2.39 / 2.39** |
| C 0.6 | 0.75 | 0.111 | **−0.24** | 0.157 | 1.62 / 2.92 |

No variant puts two dots over each other or within 0.5 px on any fixture: even at its cap a dot
spans 0.79 of the pitch.

## Findings

1. **A and C both invert the sortspec fixture's inner ring.** The most-linked notes sit in row 0,
   next to the hub, where `HUB_ROW0_FRAC` caps them at 6.05 px. That cap already binds on develop,
   so those notes all draw at 6.05. A and C lift their less-linked neighbours in rows 1 and up to
   7.6 px, above them. Whichever of A or C is built has to keep the band's ramp ceiling at or
   under the hub row-0 cap where one binds. This is a requirement of the build, not a reason to
   drop the direction.
2. **The serpentine check cannot see a narrow wedge.** It only reads cells of six notes or more.
   Wedges of 1–3 notes are exactly where B acts, so the within-wedge inversion count above is the
   evidence for B, not the suite.
3. **On the 10k, B's 1–3 note wedges invert by slot (4 of 4 pairs).** There, the edge cap
   binds once the cell clamp is lifted, and the edge cap follows the slot's position rather than
   its links. That is two notes in two wedges of a 10,002-note vault, but it is a real step.
4. **At matched growth, A beats C on every fixture.** At the same dot/cap (demo outer 0.77 for
   both), A keeps more of the link signal than C: ρ 0.83 vs 0.75, inversions 0.08 vs 0.11, decile
   contrast 1.44 vs 1.36. It is also the only one of the two that moves the 10k at all (0.88 → 0.93).

## Recommendation

**A, γ 0.5, together with B.** A addresses the main effect, and B is the only one of the three that
reaches the narrow wedges. They touch different terms, so they compose. Building A needs the
hub row-0 guard from finding 1 in the same change. B needs a decision on finding 3: accept it, or
bound the narrow dot by `edgeCap` before the ramp rather than after it.

## Suite, per variant

`suite-202.ps1` ran twelve checks on all five fixtures, headed under the harness hook:
serpentine, lattice, golden snapshot, both never-outgrows checks, last frame is resting, bigger
window, sub-pixel hover, hub dots shrink, both filtered-rest checks, and hub share. Every variant
scored **48/48**, the same as develop, and no golden snapshot moved.

**So the suite cannot tell these variants apart, and it does not see their costs.** The serpentine
check reads only cells of six notes or more, and passes while at least 65% of notes sit in a
cell ordered at τ ≥ 0.9. Under A the sortspec fixture falls from 100% to 81% with its inner ring
inverted, and still passes. Narrow wedges are under its six-note threshold entirely. If one of
these directions is built, the serpentine check needs an inner-ring and narrow-wedge inversion
count in the same change.

Method notes:
- Positions for the overlap count and the crops come from the renderer's own canvas. `#vg-stage`
  begins under the timeline, 227 px above the canvas.
- The page is refreshed once before measuring, because B's first frame is drawn before its fit
  clearance is measured.
