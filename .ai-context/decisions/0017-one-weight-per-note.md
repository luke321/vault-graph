# 0017 — A dot is its own wedge's room, times what its links earn

**Date** 2026-09-21, rewritten 2026-09-22 after the first rule was rejected · **Status** accepted
(stage A) · **Supersedes the sizing half of** `github#107`, `github#117` · **Issue** github#186

## Context

Three quantities decided how much of the disc a note got, and only one of them knew about links.

- **Arc** came from a note's *opacity* alone. Every note counted the same, however connected.
- **Tangential position** came from the same opacity, so slots inside a row were equal too.
- **Drawn radius** came from a ramp on the note's `size` attribute — a compressed degree — scaled
  by `room / pitch`, where `room` was the **median own-step of the whole band** (`ROOM_PCTL`).

So the only place link weight reached the layout was the dot, and it reached it through a number
measured across every other wedge in the ring. That is how `github#107` and `github#117` ended up
trading a percentile against a rounding rule: with the dot sized off a band-wide figure, a wedge
could be given room its own notes could not use. `animation.md` records the cost — six
room-interpolation sites threaded through the cascade, and `plan.room` walked between endpoints
but *not used to draw*.

## The first rule, and why it could not work

The rework was briefed with a single formula:

    dot = DOT_OF_PITCH x min(the note's own slot at its radius, the band's radial pitch)

It was implemented exactly, and it **removed link weight from the dot entirely**.

`solveBand` makes the cell **square by construction** — `s = sqrt(arcSpan·R·T/n)`,
`rows = ceil(T/s)`, `pitch = T/rows` — so at rest a note's tangential slot *is* the radial pitch.
The `min` therefore always takes the pitch, and the ~20% that a link weight moves the slot by sits
on the discarded side of it. Measured at rest, correlation between a note's degree and its drawn
radius, and the top-decile-degree dot over the bottom-decile-degree dot:

| fixture / band | corr(deg, px) | hub dot / leaf dot | distinct drawn sizes |
|---|---|---|---|
| demo / inner | 0.737 → **0.028** | 1.93× → **0.99×** | 13 → 8 |
| demo / outer | 0.827 → **0.007** | 1.85× → **1.00×** | |
| shape / outer | 0.861 → **0.000** | 1.92× → **1.00×** | 16 → **2** |
| shape / inner | 0.954 → **0.000** | 1.77× → **1.00×** | |
| 10k / outer | 0.818 → **−0.011** | 1.15× → **1.00×** | 5 → 3 |

Two distinct sizes across 815 notes on the dominant-folder vault is one size per band. The dots
also went **maximal** as well as uniform — median drawn radius demo 2.44 → 4.26 px, shape
3.35 → 5.27 px — which closes the gaps between them and makes the lattice read as a mass. The
lattice itself never moved (column offset demo 0.047 → 0.030, shape 0.228 → 0.198 of a row's own
step), so what reads as *the columns are gone* is the dots filling the space, not the geometry.

Rejected by the maintainer on 2026-09-22. `.ai-context/investigations/186/dotsize-186.mjs` is the
harness that produced the table and is the acceptance test for any replacement.

## Decision

**Keep develop's formula exactly, and replace the one term that was measured across other
wedges.** develop sized a dot as a ramp on `size` running from the pixel floor up to a ceiling,
and the ceiling was the *band's median own-step*. Only that last term was wrong:

    ceiling = DOT_OF_PITCH x min( the CELL's tightest tangential step x DOT_CLEAR,
                                  DOT_OVER_PITCH x min(the band's radial pitch,
                                                       UNIT x DOT_MAX_SPREAD) )
    dot     = DOT_MIN_PX + (ceiling - DOT_MIN_PX) x ramp(size)
    ramp    = (size - NODE_MIN) / (NODE_MAX - NODE_MIN),  clamped to [0, 1]

The cell's tightest step is the minimum, over every row of the cell, of each note's own slot at
its radius. It is the same number for every note of the cell, so inside a wedge the ramp is the
only thing that varies.

Four things that each had to be got right, and each of which was measured wrong first:

- **The ceiling is one number per CELL, and the cell's own tightest step is that number.** It is
  wedge-local, so nothing about one wedge reaches another — the whole point of retiring the band
  median — but it must not be note-local either. **A note's own row step is POSITION**, and a rule
  that reads it makes a note's size say where it sits as well as what it links to. That breaks the
  serpentine, which is visible only as its size gradient; the measurements are in *The serpentine,
  and the fourth wrong reading* below. `DOT_CLEAR = 0.92` is the clearance allowance develop spent
  on `room`, kept. A row holding a lone note contributes `slotOf(1)` — the whole arc — so it is
  never the minimum, and the case needs no special handling.
- **The absolute ceiling caps the PITCH, never the product.** `DOT_OVER_PITCH = DENSITY_MAX` is
  how far a dot may outgrow the *radial* pitch once its own tangential step allows — develop's
  `room/pitch` factor under its own name, and the only part of that factor that was not the band
  median. Capping the product instead collapses the sparse case: measured on the dominant-folder
  vault filtered to eight notes, the dot read **8.8 px against develop's 52.96 px** and
  *filtered to the bone, the disc stays drawable* failed at **d/s 0.03** against its 0.15 floor.
- **The ramp runs from the PIXEL FLOOR to the ceiling, not from a fraction of it.** A
  multiplicative ramp pins every dot whose ceiling is near the floor, which on a dense vault is
  most of the disc — the demo's ceiling is ~2.0 px against a 1.5 px floor, and the measured result
  was one drawn size for the whole vault. Anchoring the ramp at the floor makes pinning
  impossible, and it is what develop did.

`ROOM_PCTL`, `roomPool`, `plan.room`, `bandOf().room`, the cascade's `roomNow` / `roomSrcB` /
`roomDstB` walk and `DOT_ROOM_MAX` are gone. The `DOT_MIN_PX` floor, the edge cap, the frame fit
(`github#41`), the hub cap (`github#35`) and the cascade's two-resting-sizes bound (`github#66`)
stay. Size is **monotone in link weight**, as `animation.md` requires, because the ramp is
monotone in `size` and `size` is monotone in degree.

### The serpentine, and the fourth wrong reading

A cell's notes are laid in link order along a snake: row 0 runs one way, row 1 back, and so on.
**The snake has no visible geometry of its own** — the placement is a lattice either way. What
makes it legible is that the dot shrinks along the path, so the eye follows a gradient that
reverses each row. `animation.md` states the law it rests on: size must stay monotone in link
weight, because a rule that modulates size by position will hand a worse-linked note a bigger dot
than a better-linked one.

The first landed rule sized a note by **its own row's** step, and a row's step differs by row — the
rim row and the end margins most of all. So size began carrying position, and the gradient
scrambled while the placement stayed perfect. Measured at rest with
`.ai-context/investigations/186/serp-186.mjs`, per cell, as Kendall tau of drawn radius against
rank in `c.list`:

| fixture | row pairs alternating | tau median (per cell) | tau median (note-weighted) | notes in cells at tau ≥ 0.9 |
|---|---|---|---|---|
| demo | 222/222 on all three | 0.99 → 0.51 → **0.99** | 0.99 → 0.67 → **0.99** | 76% → 24% → **76%** |
| shape | 47/47 on all three | 0.96 → 0.84 → **0.96** | 0.96 → 0.94 → **0.96** | 85% → 71% → **85%** |
| tag | 13/13 on all three | 0.87 → 0.81 → **0.87** | 0.94 → 0.91 → **0.94** | 82% → 82% → **82%** |
| spec | 27/27 on all three | 1.00 → 0.82 → **1.00** | 1.00 → 0.87 → **1.00** | 100% → 49% → **100%** |
| 10k | 588/588 on all three | 0.34 → 0.00 → 0.00 | 0.99 → 0.68 → **0.98** | 71% → 27% → **71%** |

(develop → the per-note ceiling → the per-cell ceiling.) **The placement snake never moved** —
alternation is 100% on every build, which is why this was invisible to every check that reads
positions, the goldens included.

**Read the 10k's per-cell median with its cause.** 22 of its 34 cells draw one size, because on a
10,002-note disc the ceiling sits at the 1.5 px floor, and a cell whose dots are all equal scores
tau 0 rather than 1. Note-weighted it is 0.98 against develop's 0.99, and the six largest cells
(2715, 936, 552, 522, 497 and 459 notes) read 0.97–1.00 against develop's 0.97–1.00. develop's own
per-cell median there is 0.34 with 17 of 34 cells under 0.3, and its inner-band cells read tau
−0.03 while drawing **1.05–1.49 px** — below the floor, off the position-driven edge cap. That is
noise, not a gradient, so it was not taken as a bar to match.

### What it measures, against develop

develop → the per-note ceiling → **the per-cell ceiling that landed**:

| fixture / band | corr(deg, px) | hub / leaf dot | median drawn radius |
|---|---|---|---|
| demo / inner | 0.737 → 0.683 → **0.761** | 1.93× → 1.73× → 1.71× | |
| demo / outer | 0.827 → 0.829 → **0.850** | 1.85× → 1.64× → 1.65× | 2.44 → 2.80 → 2.60 px |
| shape / outer | 0.861 → 0.868 → **0.865** | 1.92× → 1.81× → 1.84× | |
| shape / inner | 0.954 → 0.938 → **0.959** | 1.77× → 1.76× → 1.76× | 3.35 → 3.51 → 3.43 px |
| 10k / outer | 0.818 → 0.689 → 0.667 | 1.15× → 1.09× → 1.09× | 1.51 → 1.67 → 1.65 px |
| 10k / inner | 0.025 → −0.154 → −0.207 | 1.04× → 0.99× → 0.99× | |

Four of the six bands read **above develop**. The 10k's two are the pixel floor: its median drawn
radius is 1.65 px against a 1.5 px floor, so most of that vault has no range to correlate over,
and develop's own inner band reads 0.025.

Distinct drawn sizes: demo 13 → 14 → 12, shape 16 → 15 → 15, 10k 5 → 7 → 4. Column offset (a
note's angular distance to the nearest note one row inward, over that row's own step) demo
0.047 → 0.043, shape 0.228 → 0.219, 10k 0.130 → 0.127 — **the lattice is untouched**, and was
untouched by the rejected rule too, which is why *the columns are gone* was about dots and not
about geometry.

`corr(deg, ramp)`, which isolates the ramp from the ceiling, reads **0.87–0.96** on the bands
where no cap binds. On the 10k's inner band it is undefined, because every ceiling there is at or
under the floor.

### Weighted arcs and slots are NOT part of this

The briefed weight `w = opacity × (1 + L·s)` reaching the **arc share** and the **tangential
slot** is deferred, unlanded, behind `LINK_WEIGHT = 0`. The machinery is in place and inert. It is
a separate change with its own before/after, because it moves every wedge angle and every golden,
and because the rework it belongs to has to be judged against develop's look first.

One finding from building it is worth keeping, so nobody re-derives it:

**If arcs are ever weighted, the ring split must stay on note COUNT.** `balanceBands()` searches
exhaustively (`EXHAUSTIVE_UP_TO = 14`, and every fixture is inside it), so it re-decides every
movable group from cost alone and **near-ties flip on any change to the cost**. Measured with the
cost on weights: **25 of 210 group-dimensions change ring** between `L = 0` and `L = 0.4`, and
**21 of 210 still change at `L = 0.2`** — it is not a question of picking a smaller `L`. With
`spanFor()`, the `share()` inside `evaluate()`, the hub's own seed and `smallAt` counting notes
instead, **0 of 210 change ring and `r0` is identical on every fixture**. Which ring a group lives
in is a question about how many notes each ring has to hold; how much room each note takes inside
its ring is the weight's job. That split is already in the code and costs nothing at `L = 0`.

## Rejected

- **`min(own slot, pitch)` as the whole rule.** Measured above: it is one size per band.
- **Sizing the dot from a band figure at all.** That is what `ROOM_PCTL` was, and `github#107`
  had already had to move it 0.1 → 0.5 because the tenth percentile is not band-neutral.
- **A smaller `L` to keep the band table still.** Measured: it does not.

## Consequences

- **The goldens move, and the size of the move is the proof there is no re-pack.** A dot's radius
  feeds two places that are geometry: `github#160`'s outer-row inset and the seam clearance in
  `side()`. So all five were re-recorded, and measured against develop's they move by **at most
  2.611 units radially** (shape; demo 0.551, tag 0.982, spec 0.932, the 10k 0.097) against a
  **tightest row pitch of 120.1 units** — 2.2% of one pitch, so no note changed row. Angularly the
  median note moves 0.017–0.049° and the worst 2.35°, inside its own wedge. **Band membership and
  note counts are identical on all five.** That is also the check that the cascade fixes in
  `30d6ff9` leak nothing into the resting layout: a leak would move notes by pitches, not by
  hundredths of one.
- The measured hub-to-leaf ratio comes out **above** the named 1.85 — roughly 1.9–2.3 per band —
  because the ramp is normalised on the vault's `size` deciles while the acceptance reads *degree*
  deciles *per band*, and a band's extremes sit outside the vault's. The constant is the one that
  is chosen; the measured spread is reported rather than tuned away.
- Two inner bands read a flat ratio and near-zero correlation — the 10k's, where the pixel floor
  binds, and the sortspec vault's, where the hub cap binds on row 0. Both are caps doing their
  job, and the 10k's inner band reads 0.025 on develop too.

## Verify

```javascript
__vg.dotWhy(id)           // out, ceil, floorPx; cellRoom is the note's own step
__vg.debugDump().dots     // ofPitch, minPx, clear, overPitch
```

```bash
node .ai-context/investigations/186/dotsize-186.mjs --repo . --html <page>
node scripts/smoke.mjs --only "golden snapshot" --only "density follows the notes"
```
