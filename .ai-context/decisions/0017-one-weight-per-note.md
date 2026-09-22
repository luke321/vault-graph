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

    ceiling = DOT_OF_PITCH x min( the note's OWN tangential step x DOT_CLEAR,
                                  DOT_OVER_PITCH x min(the band's radial pitch,
                                                       UNIT x DOT_MAX_SPREAD) )
    dot     = DOT_MIN_PX + (ceiling - DOT_MIN_PX) x ramp(size)
    ramp    = (size - NODE_MIN) / (NODE_MAX - NODE_MIN),  clamped to [0, 1]

Three things that each had to be got right, and each of which was measured wrong first:

- **The ceiling is wedge-local.** The note's own tangential step decides it, so nothing about one
  wedge reaches another — the whole point of retiring the band median. `DOT_CLEAR = 0.92` is the
  clearance allowance develop spent on `room`, kept.
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

### What it measures, against develop

| fixture / band | corr(deg, px) | hub / leaf dot | median drawn radius |
|---|---|---|---|
| demo / inner | 0.737 → 0.683 | 1.93× → 1.73× | |
| demo / outer | 0.827 → **0.829** | 1.85× → 1.64× | 2.44 → 2.80 px |
| shape / outer | 0.861 → **0.868** | 1.92× → 1.81× | |
| shape / inner | 0.954 → 0.938 | 1.77× → 1.76× | 3.35 → 3.51 px |
| 10k / outer | 0.818 → 0.689 | 1.15× → 1.09× | 1.51 → 1.67 px |
| 10k / inner | 0.025 → −0.154 | 1.04× → 0.99× | |

Distinct drawn sizes: demo 13 → 14, shape 16 → 15, 10k 5 → 7. Column offset (a note's angular
distance to the nearest note one row inward, over that row's own step) demo 0.047 → 0.043,
shape 0.228 → 0.219, 10k 0.130 → 0.127 — the lattice is untouched.

`corr(deg, ramp)`, which isolates the ramp from the ceiling, reads **0.87–0.96** on the bands
where no cap binds and 0.59–0.69 on the two inner bands where one does: the 10k's, pinned at the
pixel floor, and the sortspec vault's, pinned by the hub cap on row 0. develop's 10k inner reads
0.025, so that band is not a regression.

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
__vg.dotWhy(id)           // ramp is the link ramp again; cellRoom is the note's own step
__vg.debugDump().dots     // linkRatio, and the solved ramp
```

```bash
node .ai-context/investigations/186/dotsize-186.mjs --repo . --html <page>
node scripts/smoke.mjs --only "golden snapshot" --only "density follows the notes"
```
