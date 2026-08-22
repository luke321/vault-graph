# Subfolder differentiation

**Status** as-built · extracted from the README on 2026-08-22

> Tint slots, the pooled tail, and what may be pushed radially.


Inside the **PARA folder** grouping, subfolders are separated by a hue+lightness
ladder within the folder's own family, and by position — each one owns a contiguous
sub-wedge of the pie. All nodes are plain circles. The three largest subfolders are
named in the legend; the rest share the last tint step, and the legend says how many.

**Subfolder rows in the legend are clickable** — each hides or shows that subfolder,
and the tail row toggles every folder it stands for.

Sub-wedges are separated by a **1 degree gap** (`SUB_GAP`), against the 2 degrees
between groups (`SLICE_GAP`). The group boundary stays the more prominent of the two
deliberately — at equal widths the disc reads as one flat ring of subfolders rather
than folders that contain them. The tint ladder already separates siblings; the gap
just stops them touching.

### Sub-wedge gaps

**Sub-wedges used to need a wide gap, and the reason was the row PHASE, not the gap.**
A note's `u` was the fractional part of its continuous row coordinate — i.e. wherever
the cumulative sum happened to be when it crossed an integer. That is arbitrary in
[0,1), so a note could land hard against a wedge edge, and the only thing between it
and the neighbouring sub-wedge's edge note was the angular gap. Measured, that put
pairs 17–67 graph units apart where two dots need ~126.

Two things ruled out the easy fixes:

- **A bigger gap cannot pay for it.** One degree at r=1334 is 23 graph units; two
  degrees reaches 46. The requirement is ~126.
- **Smaller dots do not help either.** Re-measured with the radius cap at 11, 10, 9
  and 8, the same pairs still collide — a 17-unit separation is not a size problem.

**The fix is to measure a note's place WITHIN ITS ROW** rather than taking it from the
fractional part of `pp`. `placeCell` now runs in two passes: pass 1 assigns rows
exactly as before, pass 2 positions each note by its own half-share of its row's
weight. That gives every row half-step margins at both ends automatically — half a row
pitch, ~80 units — which is the clearance the old inset was buying, for free.

It stays animation-safe because it is weight-based rather than `(i + 0.5) / n`: a
fading note gives up its share continuously instead of dropping out of the
distribution. And crossing a row boundary is still continuous, because the serpentine
reverses — the last note of row *k* and the first of row *k+1* both sit near `u = 1`.

**Measured after, on the innermost row of the outer band (44 notes):**

| Step between adjacent notes | median | mean | range |
|---|---|---|---|
| within one sub-wedge | 172 | 165 | 138–178 |
| **across a sub-wedge boundary** | **162** | **163** | 144–181 |
| across a group boundary | 208 | 206 | 203–208 |

A sub-wedge boundary is now indistinguishable from ordinary within-row spacing — the
rows genuinely continue across it — while group boundaries stay visibly wider, so the
hierarchy still reads. `SUB_GAP` is 0.3 degrees, and it is now a pure legibility
choice: with centring, **0 collisions survive even at a 0 degree gap**.

**The edge inset is retired** (`EDGE_PAD_ARC` / `EDGE_PAD_MAX` are 0). It was the
previous answer to the same problem and it worked, but it paid in whitespace and in
row count. Its sweep is kept because it maps the trade-off:

| inset arc / max | cross-wedge | interior | outer-radius spread | rows |
|---|---|---|---|---|
| 0 / 0 *(with old phase)* | 3 (worst 56) | 0 | 800 | 7-7 |
| 25 / 0.08 | 0 | 0 | 800 | 7-8 |
| 35 / 0.10 | 0 | 0 | 800 | 7-8 |
| 70 / 0.22 | 0 | 0 | 1280 | 8-11 |
| **0 / 0 *(with row centring)*** | **0** | **0** | **800** | **7-7** |

70 / 0.22 was the first guess and was over-specified twice over: it pushed narrow
cells from 8 rows to 11 — the sparse-spoke failure mode — and added 480 units of
raggedness. Note the 800-unit spread is the *baseline*: cells' last rows are partly
filled, so their outer radii differ regardless. Centring returns the disc to 2134,
undoing the +7.5% the inset had cost.

One trap the inset left behind, worth keeping: **`base` is in LAYOUT units** (1 = one
row) while the pad arc is in graph units, so it needs `* UNIT`. Without that the pad
pins to its cap on every cell, and squeezing each wedge into 56% of its span traded a
handful of edge collisions for **29 interior ones**. The row count must also be solved
for the inset span (`usableRef`), or the innermost row is handed more notes than it has
room for — that was the innermost-row crowding.

**Verified stable**, since this is the function the rest of this note warns about:
restoring after hiding `05`, `08` and `03` returns every note to within **0 units** of
its baseline, and **0 of 444** notes sit off-lattice across both bands.

**Measure collisions in GRAPH units, not viewport pixels.** `sizeScale` keeps dot
radius proportional to the row pitch, so the radius-to-distance ratio is constant
across window sizes — a node's radius in graph units is `size * 160/28`. Measuring in
pixels needs a *rendered* frame, and `refresh()` only draws on the next animation
frame, so measuring synchronously after it reports stale coordinates and invents
thousands of collisions. Worse, a tab that is not being composited never fires
`requestAnimationFrame` at all, so the stale reading never clears and any rAF-based
wait hangs. Both produced confidently wrong numbers here before the graph-space method
replaced them.

Both gaps are taken **out of the total before the spans are shared**, never added
afterwards, or the wedges plus the gaps exceed the circle and the ring overlaps
itself. They are also counted from the cells that actually have weight, so a hidden
subfolder spends no gap. Measured on this vault, each band closes at exactly
360.0000° with zero overshoot, spending 14° on gaps: the inner band 6 groups × 2° +
2 sub-boundaries × 1°, the outer band 3 × 2° + 8 × 1°. That is 3.9% of the circle per
band. A clamp scales both gaps down together if a future cell count ever makes them
unaffordable (>45% of the circle); it does not bind here.

Month folders (`04 - Daily Notes/2026-08`) count as real subfolders. Pass
`--flat-months` to fold them into their parent instead.

**The folder tree is walked to whatever depth the vault actually has** — no level count
is baked in anywhere. `build-graph.mjs` emits each note's full chain below its PARA
folder as `dirs`, and the legend renders it by recursion, so a folder nested five deep
behaves exactly like one nested a single level down, on any vault.

The **wedge** is still the first level only, and that is a *rendering* limit rather than
an assumption about folders: the tint ladder has four usable steps (nine tints in one
hue family land ~3 dE apart, i.e. indistinguishable), and a folder is one thing on the
disc however deeply it nests. Everything below the first level therefore takes **no
tint and cuts no wedge** — it inherits its parent's swatch, because that is the truth:
the pie does not distinguish them and the legend must not claim otherwise. What those
levels do get is their own **eye** and their own **highlight**.

A **date bucket stops the walk**, on exactly the reasoning `inferType` already uses: a
folder called `2026-06` says *when* a note was filed, not what it is. As the *first*
segment it is still the only division its folder has — that is what Daily Notes are —
so it is kept; anywhere deeper it sits under a real name and is noise, so
`03 Sprint Reviews/2026-06` stops at `03 Sprint Reviews`.

This matters because 136 notes of this vault live below the first level, and the only
division that matters there is invisible otherwise: `00 1 on 1` splits by **person**
(seven of them, holding 16, 13, 11, 10, 10, 1 and 1 notes) and
`03 - Resources/People` splits into Professional 72 / Personal 9.

**Getting this wrong once is instructive.** The first attempt walked two levels into
`sub` itself, which *replaced* `00 1 on 1` with seven flat siblings — the folder
vanished as a unit and its people sat beside `2026-06` as though they were peers of it
rather than inside it. A deeper level is a child, not a substitute.

Filtering and highlighting are keyed by **path prefix**, so one code path serves every
depth: `visible()` walks a note's ancestors and hides it if any of them is hidden, which
means hiding a folder hides its whole subtree without knowing how deep it goes. Only
depth 1 is ever **pushed** radially — a deeper folder is a slice of its parent's arc,
interleaved with its siblings at the same angles, so pushing it would slide a subset out
through them, exactly as with a pooled subfolder.

Verified: `People` shows 81 and opens to Professional 72 / Personal 9; `00 1 on 1` shows
62 and opens to its seven people; hiding `People/Professional` leaves 376 of 448 visible
while the parent row still reads 81; and highlighting it halos **72/72** notes with
**0** radial movement.

Shapes were built and then removed: disc / ring / target / thin-outline read as
visual noise at these node sizes. If they ever come back, three notes worth keeping
— the node programs live on `Sigma.rendering`, **not** on `Sigma` (getting that wrong
makes shapes silently never appear, with no error); `borders[0]` is the *outer* band
while the `{fill:true}` entry is the *core*, the reverse of what the option order
suggests; and an SVG data URI needs explicit `width`/`height` or it rasterises to
0x0 and never draws.

Three findings drove that design, all measured rather than assumed:

- **Evenly spreading one tint per subfolder does not work.** Nine subfolders across
  one hue family land ~3 apart in OKLab dE -- below the just-noticeable threshold,
  so nothing is differentiated. Widening the spread made it *worse*, because a
  monotonic lightness ramp shrinks the gap between adjacent steps. Four steps with
  a shared tail is the workable shape.
- **Stepping symmetrically around the base colour costs contrast.** The darkest
  step fell to 2.25:1 on the dark surface. The ladder now always steps *away* from
  the surface -- lighter on dark, darker on light -- which is both starker and
  higher contrast. Every family clears 3:1 in dark mode. A side benefit: the
  biggest subfolder keeps the folder's own colour.
- **How far a family may rotate is not a constant.** Measured on this palette,
  blue has 106 degrees of hue to its nearest neighbour but yellow only 69, so one
  global rotation either wastes blue's headroom or turns yellow green. Each family
  gets 60% of its own half-gap, computed from the live palette.
- **Turning the numbers up made it worse.** With fixed lightness deltas, raising
  the spread pushed the top steps into the wash-out cap, where they collapsed onto
  each other — adjacent dE went *down*, 6.4 to 4.1. Lightness targets are now spaced
  evenly between the base and a per-family end point, which is what let the hue go
  aggressive without losing separation.
- **Neutral groups get no tint at all.** Three of them already sit on one lightness
  axis, so laddering a fourth collided with a neighbouring group's base (dE 3.5).
  They rely on wedge position and the legend row instead.
- **Transparency was considered and rejected.** Opacity is a magnitude channel, so
  using it for categories implies an order that does not exist, and translucent
  overlapping marks blend into colours that read as new categories. Nodes overlap
  heavily at the centre of the Rings disc, which is exactly where that fails worst.
