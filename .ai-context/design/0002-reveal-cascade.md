# The reveal cascade

**Status** as-built · extracted from the README on 2026-08-22

> The animation: what moves, in what order, and every discrete step that had to be removed.


Notes do not pop in and out. **Opacity is the source of truth** -- the renderer
reads a per-note alpha and never calls `visible()` directly -- so a filter change
retargets opacities and a cascade walks them there one note at a time.

Everything sweeps **clockwise from 12 o'clock**, and in both directions -- notes
leave in the same sweep they arrived in, so the animation never runs backwards. The
order comes from each note's angle on the *finished* disc, so notes that share an
angle (a column, inner band and main band alike) arrive together and the frontier
reads as a hand going round the clock. The motion runs along the **circumference**,
never radially: nothing grows outward from the hub. Both directions can run at once:
`only` hides some groups and shows others, and the two sets are staggered
independently.

**Space is made by the note taking it.** A note's opacity counts toward its wedge's
angular share *while it fades*, so the wedge opens by exactly one note's worth per
arrival rather than snapping wide in advance.

There are **two fill modes**, and which one runs depends on whether there is already
a ring to respect:

- **trade** -- something is on screen. The circle stays **full** and the wedges trade
  space: an arriving wedge grows while every other one shrinks to let it in, and a
  leaving wedge shrinks while the rest grow back. Enabling and disabling are exact
  mirrors, and the disc only ever changes *density*, never its outline. This is every
  filter toggle.
- **draw** -- the screen is empty, so there is nothing to trade with and no ring to
  keep full. The pie draws itself clockwise from 12 o'clock, the occupied arc growing
  to a full circle. This used to be first paint; since the intro became the
  timeline growth, `none` followed by `all` is the only thing that reaches it.

What a note contributes to a cell's allocated room is the whole trick, and it has to
be **symmetric** between arriving and leaving or the ring breaks. Both halves were
found by breaking them:

- A note on its way **out** counts whatever opacity is left of it. Hiding a group
  turns `visible()` false on frame one, so counting only visible notes struck the
  cell out of the allocation instantly -- its neighbours snapped wider while its own
  notes were still fading in place on top of them. Decaying its share closes the
  wedge smoothly instead: measured 152.5 -> 132.9 -> 42 -> 0 degrees over ~950ms,
  with no gap wider than 8.9 degrees opening anywhere in the ring.
- A note on its way **in** counts its opacity too (in trade mode). Counting it as a
  whole slot up front allocated the incoming wedge its full final span immediately
  while it still rendered at zero width, so the ring carried a hole the size of the
  arriving group -- ~150 degrees for `08 - Meeting Notes` -- that the dots then
  popped into. Ramping it makes the other wedges give up space at exactly the rate
  the new one takes it: measured on a frozen enable, the wedge grows 0 -> 23 -> 82 ->
  133 -> 157 -> 184 degrees while the biggest gap anywhere in the ring stays between
  13.8 and 6.8 degrees, which is ordinary inter-group spacing rather than a hole.

**A cascade needs seats for the notes that are leaving.** `buildWedgePlan` filters
to `visible()`, and below `REPACK_BELOW` (55% of the vault) it rebuilds the plan from
the visible notes alone -- so hiding a group big enough to cross that line gave every
departing note *no slot at all*. Nothing held their space, so the wedge vanished
instead of closing, and they had no target position, so they faded at stale
coordinates on top of an already-reflowed disc. `08 - Meeting Notes` is 221 of 442
notes here, which is exactly why that group was the one that looked wrong.

While a cascade runs, the plan is therefore built over the **union** of what is
staying and what is still on screen, and the repack decision uses that same union.
Measured on the frozen hide: 221 of 221 departing notes seated (it was 0), the wedge
closing 183.6 -> 152.9 -> 107.9 -> 50.3 degrees and then gone, with the biggest gap
anywhere in the ring staying between 6.8 and 13.8 degrees throughout.

**The repack rides along with the fade.** Crossing `REPACK_BELOW` re-densifies the
disc: every surviving note genuinely belongs in a different row, at a different
radius. Measured on the `08 - Meeting Notes` toggle, 220 of 221 survivors change
radius, by a mean of 371 layout units and up to 655 -- the whole disc shrinks from a
2292-unit outer radius to 1637 and back. That is far too big to snap.

Doing it as its own tween worked but gave **three movements in a row**: a reflow, the
fade, then a repack. So the cascade interpolates between two packings instead, by
overall cascade progress, and the radial change happens over the whole time the big
wedge is arriving or leaving:

- `planA` -- the packing the notes are sitting in now (pre-toggle)
- `planB` -- the packing they end in (post-toggle)

Both are built up front by membership predicate, not by what is visible.

**The toggled wedge itself has to contract, and for a long time only the rest of the
disc did.** A cell's row count during a cascade is walked from its source packing's
count to its destination's — but the cell being toggled exists in only ONE of those
packings, and the missing end used to mirror the present one (`s = d`, `d = s`). That
pinned its row count for the entire fade: every other wedge re-densified around it
correctly, because those cells exist at both ends and genuinely interpolate, while the
wedge doing the leaving held its radii and simply faded at full size. The disc
contracted; the thing being removed did not.

A missing end now takes **its band's own depth** at that end — the deepest cell in the
band, which is what sets the ring's outer radius. So the toggling wedge carries the
same number of rows as everything around it for the whole animation, and the only
thing that changes about it is its arc.

Walking it to **zero** was tried in between and overshot: the wedge then contracted
*faster* than the ring (measured, 1494 against the survivors' 1814 at 75%), which
reads as sinking out of the disc rather than shrinking with it. Both failures were the
same mistake in opposite directions — inventing a depth for the toggling cell instead
of taking the ring's.

Measured on `08 - Meeting Notes` (221 of 444 notes), leaving:

| progress | leaving wedge | staying notes | depth |
|---|---|---|---|
| 0 | 2134 · 7 rows · 182° | 2134 · 7 rows · 164° | same |
| 25% | 2134 · 7 rows · 158° | 2134 · 7 rows · 190° | same |
| 50% | 1974 · 6 rows · 125° | 1974 · 6 rows · 223° | same |
| 75% | 1814 · 5 rows · 76° | 1814 · 5 rows · 273° | same |
| 100% | gone | 1654 · 4 rows · 352° | — |

The ring's outer edge is continuous across the toggling wedge at every frame, the whole
disc contracts 2134 -> 1654 together, and the arc closes 182° -> 0. The final 1654 is
exactly the post-toggle resting radius, so `settle()` has nothing to correct.

Arriving is the exact mirror, depth matching at every frame and landing on
2134 / 182°: 1814 · 5 rows · 76° at 25%, 1974 · 6 · 125° at 50%, 2134 · 7 · 158° at
75%.

This is animation-only. `rowsAt` runs solely inside the cascade frame loop, so the
resting layout, and every stability guarantee measured against it, is untouched.
Interpolation is polar, so a note sweeps along its arc while its radius migrates
rather than cutting a chord across the disc.

**Density comes from opacity.** The packer takes a weight per note, and every
density decision -- how many rows a cell needs, how wide its reference wedge is,
where the hub sits -- is a pure function of those weights. Feeding it each note's
alpha means the packing is re-derived every frame from what is actually on screen, so
an arriving note's wedge grows a row outward as it lands, at the same density as the
rest of the ring, while the wedge widens along the circumference at the same time.
Radial and circumferential from one calculation, and every frame is a valid grid.

Three earlier approaches failed here, each measured:

- **Blending two finished packings.** Two separately-valid packings differ by a mean
  of 23.7 and a max of 138 degrees, and lerping a note's radius and its
  fraction-across-the-wedge independently pulls the rows apart -- every note in
  `03` and `04` changed row, so mid-animation the grid stopped being a grid.
- **Turning the repack off** (dropping `REPACK_BELOW` to 0.3). No smear, because
  nothing re-densifies -- but a filtered disc then reads far too loose, since a
  wedge keeps its rows while its arc doubles.
- **Letting the band split follow the weights.** The inner band is proportional over
  the FULL circle, so a group crossing the threshold part-way through a fade leapt to
  the inner ring and spread over ~300 degrees, putting 161 surviving notes inside the
  departing wedge's arc.

**The two bands are independent, in both senses.** Which ring a group lives in is
decided once from the data as loaded and then locked, so filtering never migrates a
group between rings; only a fresh load may reassign it. And neither ring's packing
responds to the other's contents: the hub radius used to be solved from the GLOBAL
weighted total, and the outer band's base radius from the inner band's row count, so
enabling something in one ring re-packed the other. Both are locked at load too, so
each ring's rows depend only on its own weights at its own fixed base.

Verified: every group's inner/outer membership is identical before and after a
toggle; hiding an inner group moves the outer band by 0 and hiding an outer group
moves the inner band by 0; and restoring returns every note to its exact baseline
position.

**One line was quietly overriding that lock**, and it took filtering the outer band to
*empty* to expose it. Right after `bandLock` is applied there is a tiny-vault guard:

```js
if (!outer.length) {          // one band, no split
  inner.forEach(function (c) { c.inner = false; });
```

Its job is the initial data-shaped decision — a vault small enough that every group is
a sliver has no outer band and should not be split. But `!outer.length` is *also* true
whenever filtering has hidden every outer group, and then it moved all the inner cells
to the outer band's base radius. So the inner ring teleported outward on the single
frame the last outer note stopped being `present()`: measured, `01 - Projects` went
**r=479 → r=1175, a 696-unit jump, at frame 206 of 210** — with the outer band already
still, which is what made it read as the inner ring jumping at the end rather than as
part of the fade.

Gated on `!bandLock`, so it only ever fires before the lock exists. An empty outer band
is a legitimate state: the disc is then just the inner ring, small, which is exactly
what "fewer notes make a smaller disc" means. Re-verified by stepping whole cascades
frame by frame — hiding **all** outer groups (210 frames) and hiding one (126 frames)
both move the inner band by **0 at every frame**, with a settle jump of 0.

Two notes on catching this, both of which cost time here:

- **The resting layout was innocent**, and measuring it said so: inner positions are
  identical across every outer alpha from 1 down to 0, and identical again once the
  groups are properly hidden. A bug that only exists during an animation will not show
  up in a before/after comparison, however carefully it is done.
- **Stepping the cascade needs `requestAnimationFrame` intercepted**, not waited on.
  Replacing it with a queue and pumping the callbacks by hand gives exact per-frame
  state, and works in a tab that is not being composited — where the real rAF never
  fires at all.

**The last jump was not in the layout at all -- it was Sigma renormalising.**
Sigma rescales node coordinates against the graph's bounding box on every refresh
(`autoRescale`, on by default and never set here). As the disc shrinks the box
shrinks with it, so everything is re-normalised: measured, hiding one folder moved
the graph origin 13px on screen and zoomed the whole disc by 8.2%, with the camera
provably untouched at x=0.5, y=0.5, ratio=1.08. During a cascade that happens every
frame.

It scales about the box centre, so the displacement it introduces is **proportional
to radius** -- which is exactly why an inner-ring group looked silky while a
same-sized outer-ring group looked jumpy, and why hunting it in the packing maths
never found anything. The normalisation box is now pinned to the full-vault extent
via `setCustomBBox`, so a filtered disc genuinely shrinks on screen instead of the
camera silently zooming to refill the viewport. Measured after: origin drift 0px and
scale drift exactly 1, hiding one folder, two folders, or all but one.

**The disc stays centred and cannot be panned, at any window size.** The pinned box
is mapped to the viewport on every refresh, so a resize re-centres the disc by
itself -- verified at 1068x1270 and again at 612x620, disc centre on stage centre
both times, offset 0,0. With the box symmetric about the
origin the camera's (0.5, 0.5) IS the centre of the disc, so panning and rotation are
off and only zoom remains. Wheel zoom recentres toward the pointer, so the camera's x
and y are pulled back on every update while the ratio is kept; **Fit** is therefore
just a zoom reset. Verified: the disc's centre lands on the stage centre exactly,
offset 0,0.

**The inner ring is drawn at 80% of its packed radius** (`INNER_SCALE`). Rows and
capacities are computed on the unscaled geometry and the band is scaled afterwards,
so proportions and the note-to-row mapping are untouched -- it is purely a size trim.

Shrinking it is the one change that can put nodes into collision, so it is measured
rather than eyeballed: across the 26 inner-band notes the **minimum** gap is 27.1px
against a largest node radius of 11 (22px across), with 0 touching pairs and a mean
gap of 154 layout units. That sits inside the 23-27px band the radius-11 cap was
chosen for, so 0.8 is about as far as this can go without revisiting the cap.

**One timing note:** a folder's wedge closes over the whole stagger window, so a
short window on a big radius means high angular speed. `04 - Daily Notes` is 55
notes, which earned a 9.4-frame window, and its wedge swung ~6 degrees per frame --
around 210 units of arc for its outermost notes. `SPREAD_MIN` is 24 now, so a
mid-sized folder is not rushed; 221 notes still buy a 37-frame window on their own.

**The resting plan is weighted by visibility, exactly as a cascade weights it by
opacity.** This was the big one, and it presented as: the wedge closes correctly and
then the whole disc jumps to a completely different arrangement.

A cascade builds its plan with `weightOf = alpha`, so a hidden folder contributes
nothing to anyone's bands or row counts. `settle()` then called the resting layout,
which built its plan with **default weights of 1 for every note** -- so the hidden
folder was counted at full weight again and the resting packing was the FULL-vault
one. Every survivor snapped back to where it had been before the toggle.

It only showed on some toggles, which is what made it confusing: hiding a group big
enough to cross `REPACK_BELOW` switches the resting plan to visible-only membership,
which agrees with the cascade by accident. `08 - Meeting Notes` is 221 of 442 notes,
so it crossed and looked perfect; `04`, `05`, `03` and `02` all leave more than 55%
visible, so they snapped. Since alpha is exactly `visible ? 1 : 0` once a cascade
settles, weighting the resting plan the same way makes the two agree by construction.

Measured, the cascade's final layout against the layout `settle()` assigns: 0 units
on every toggle, threshold-crossing or not. The penultimate-frame spikes went with
it -- an inner-ring group from 881 to 213, `03 - Resources` from 1881 to 323 -- and
the tails now land softly (160, 23, 14, 17, 0).

`TIME_SCALE` (and `__vg.timeScale` at runtime) is what made this findable: at
quarter speed the snap separates cleanly from the motion before it. Worth reaching
for the next time something in here only reads as "it jumps".

**Two things at the end of a cascade were jumping for reasons that had nothing to do
with the packing:**

- **The guard was a deadline, not a watchdog.** It was a fixed `setTimeout` at about
  `span / 60` seconds, which assumes 60fps -- and 442 nodes with 1409 edges do not
  always manage that, especially since every frame was calling
  `refresh({skipIndexation: false})` and rebuilding the spatial index. Below roughly
  30fps the timeout fired part-way through and `settle()` snapped the disc to its
  final layout: a jump at the end of every animation, on exactly the machines where
  the animation mattered. It now only fires when no frame has arrived for 400ms, so a
  slow page animates slower instead of truncating, and the cascade skips indexation
  while running (`settle()` rebuilds it).
- **The radial easing was pure lag.** `RADIAL_EASE` closed 30% of the gap to the
  target radius per frame, which existed to smooth row-count *ticks* -- and the
  continuous row coordinate leaves no ticks to smooth. Because the target kept
  moving, the position ran permanently behind, and the residue was closed in one go
  when the animation stopped: measured on the big toggle, the disc contracted
  2133 -> 1731 over 48 frames and then 1731 -> 1653 in the final one. At 1 the radius
  follows its target exactly and the animation ends where it already is. The last
  five frames of that toggle now move 166, 165, 32, 58, 0 units.

**The row count follows the LIVE span, and a note's place is one continuous
formula.** Locking the packing width per cell made a folder's rows immune to other
folders, which was stable but degenerate: isolate a 55-note folder and it kept 7 rows
sized for its ~47-degree share of the whole vault while spanning 360, drawing as a
scattered cloud across 7 sparse rings from radius 1173 to 2133. Live, the same
isolation packs into a clean 2-ring annulus, 1173 to 1333.

Taking the count live is affordable because of how the position is computed.
Capacity grows linearly with radius, so cumulative capacity up to a continuous row x
is proportional to `base*x + SP*x^2/2`; inverting that turns "how far through this
cell's weight am I" straight into a row coordinate, with no binning anywhere. The
count may therefore be fractional and the coordinate simply slides: the row ticks
when the coordinate crosses a boundary, and the serpentine's triangle wave keeps u
continuous across the tick. That replaced blending two adjacent integer grids, where
a note's row differed by up to one between them and the serpentine parity could
differ with it, swinging u from one end of the wedge to the other -- 1996 units in a
single frame.

Measured: the resting disc has 0 off-lattice rows of 91, the jump at settle is 0 on
every toggle, and the big outer group's worst single frame is 359-380 units against a
median of 221-234. Two cases remain jumpier -- an inner-ring group at 912 and
`03 - Resources`, the only group with cells in both bands, at 1881, both against
medians of 102 and 239.

**Row capacity is proportional to radius, with no floor.** Capacity used to be
floored at one note per row, which is what made the columns read as wonky once the
reference width was locked: for a narrow cell the floor bound on the inner rows, so a
cell held 1, 1, 1 and then many, and a 19-note cell asked for 8 rows and drew as a
thin sparse spoke. Unfloored, notes per row rise smoothly with radius -- the 81-note
People cell runs 8, 10, 10, 12, 12, 14, 15 across its rows.

This is also why locking the reference width costs nothing here. `cum[]`, which
decides which notes land in which row, is built from `cap[row] / capSum` -- and a
constant factor on every capacity cancels in that ratio. So the assignment does not
depend on the span at all, only on the row count, the base radius and the spacing,
all of which are fixed. Regular rows and a stable assignment at the same time.

**A folder is packed from its OWN weight, and nothing else's.** A cell's reference
wedge width -- the number its row count and row capacities are computed from -- used
to be a live share of its band's total weight. That coupled every cell to every other
one: hide any folder and everybody else's reference width changed, so their
capacities changed, so their row count ticked, so their notes reshuffled. All the
churn came from there.

The reference width is now fixed at load, per cell, so a folder's rows and the
position of a note within its wedge depend only on that folder's own weight. The
LIVE angular span still comes from the live weights, so wedges widen and narrow and
the circle stays full -- other folders' notes slide along the arc, which is the
point, but they no longer move radially or reshuffle.

Measured, toggling any folder: other folders' radial shift is 0. The two worst
outliers collapsed -- an inner-ring group's worst single-frame movement went 858 ->
119 units, and `03 - Resources`, the one group with cells in both bands, went 1494 ->
237. The big outer group sits at 311, which is the angular motion of the widening
wedges and nothing more.

**Nothing in the chain from weight to position is allowed to step.** That is the
whole trick, and each discrete thing in it had to be found and removed, because a
step in a value that changes every frame is a teleport on screen:

- **Row assignment by quota.** Notes were binned into rows by a per-row quota, so a
  small weight change reshuffled whole rows: a median of 474 units of movement per
  frame. A note's place is now a continuous function of how far through the cell's
  weight it sits.
- **u divided by count.** A fading note kept a full share of the arc until it
  vanished from the distribution. It is shared out by weight now; with every weight
  at 1 that is exactly the old `(j + 0.5) / take`.
- **Rows filled in one direction.** The end of one row and the start of the next sat
  at opposite ends of the wedge, so crossing a row boundary swung the full width of
  the arc. Rows now **serpentine**, which also makes u continuous at the boundary: an
  even row ends at u = 1 and the next starts at 1 and runs back down.
- **The row COUNT.** The last one, and the most stubborn: an integer row count ticks,
  and when a cell went 8 rows to 7 the whole capacity ruler reshaped, changing a
  note's row *and* its position within it at once -- single notes moving 3191 units
  in one frame, further than the disc's radius.

The row count is therefore **walked by animation progress, not derived from the live
weights**: from the count the source packing has to the count the destination has,
blending between the two adjacent integer grids on the way. Deriving it from the
weights instead was the obvious move and it was wrong twice over -- the count came out
fractional *at rest*, so the resting disc was a blend of an 8-row and a 9-row grid
rather than a packed one, and the animation then finished on a blended grid and
snapped to a crisp one. Walking it by progress lands exactly on the source grid at
progress 0 and exactly on the destination grid at 1.

Verified: the resting disc has 0 off-lattice rows out of 98, and the jump at settle is
0 units on every toggle tested, inner ring and outer.

Measured worst single-frame movement, before and after the fractional row count:
the big outer group 3191 -> 325 closing and 2970 -> 372 opening; an inner group
856 -> 103. Median per-frame movement is 217 and 52.

Only the **radius** is eased toward its target (`RADIAL_EASE` 0.3, ~1 row per frame).
Row counts are integers, so density ticks rather than glides, and easing turns each
tick into a short slide. The **angle** is taken exactly, because that is the
circumferential motion and easing it would put the wedge out of step with the ring.

Measured on the `08 - Meeting Notes` toggle (221 of 442 notes): closing, the wedge
runs 183.6 -> 169.6 -> 128.2 -> 64.2 -> 0 degrees while the disc densifies from a
2292-unit outer radius to 1646; opening is the mirror, 0 -> 53 -> 122 -> 165 -> 183.5
with the disc growing 1637 -> 2288. Zero surviving notes inside the toggled wedge at
any frame, in either direction.

Two more things had to be right, both established by rendering a frozen
45%-arrived frame and looking at it:

- **Allocate geometry from the final count, not the running one.** Spans are a
  normalised *share* (`avail * cell/total`), so weighting the total by opacity hands
  the first arrival a ~300-degree wedge that shrinks as the rest land -- the whole
  pie sloshing about while it fills. Each cell therefore carries two counts: `full`
  (what it holds when everything has arrived, which sets its angle and its start)
  and `live` (the opacity-weighted count actually on screen, which only opens the
  wedge within its own arc).
- **Grow clockwise from the leading edge, and keep the ring contiguous.** `theta`
  advances by the *open* span, not the full one, so a half-arrived wedge is half as
  wide and its neighbour butts straight up against it: a wedge fans open *between*
  its two neighbours and pushes what follows round the circle. Measured on a frozen
  45%-arrived frame, the notes on screen occupy one contiguous arc from 3.5 to 183.4
  degrees with no gap wider than 8 degrees anywhere in it. Advancing by the full span
  instead holds every wedge at its final start angle, which leaves a gap ahead of
  each one and reads as a ring of detached combs rather than a disc filling in.
- **A note lands once and never moves again.** Because the wedges fill clockwise and
  the ring is contiguous, everything upstream of the frontier is already complete by
  the time a note arrives, so it arrives at its final angle. The only thing still
  moving is downstream, and that is still invisible. A filter change mid-disc is the
  exception, and the whole point of it: the wedge that grows pushes its clockwise
  neighbours along to their new angles.

Frame-counted with a guard timer, for the same reason the position tween is: a
throttled `requestAnimationFrame` must not leave the cascade stranded half-faded.
One note takes **12 frames** to arrive; the set is staggered over `0.17` frames per
note, capped at **78** and floored at **8** so toggling three notes still reads as
motion. Measured on this vault that is ~1.5s for a full 450-note reveal, with a steady
~65 in flight at any instant (0 -> 15 -> 85 -> 197 -> 332 -> 450 arrived, sampled).

The cascade recomputes the layout **every frame** rather than tweening between two
end states -- the opening wedges *are* the motion. That is affordable because it is
arithmetic over the pinned plan: measured `ringsLayout()` 0.27ms and
`buildWedgePlan()` 0.20ms, so a 90-frame cascade spends ~24ms laying out. The plan
is pinned for the duration anyway, since `visible()` is already final the moment the
filter changes and rebuilding it 90 times would buy nothing.

Four details worth keeping:

- **Sigma's `parseColor` takes `rgba(r,g,b,a)` with INTEGER channels.** Its regex is
  `[0-9]*`, so a CSS4 `rgb(0 0 0 / 50%)` silently fails to parse and the node
  renders black. Per-node opacity needs no change to the node program.
- **Notes fade *and* grow** (size scales `0.45 -> 1`). Opacity alone reads as a
  colour change; scaling reads as arriving.
- **Edges fade as alpha squared**, so they lag their endpoints -- the dots land
  first and the web draws itself in behind them.
- **The Min. links slider snaps instead of cascading.** Dragging fires continuously,
  and a cascade would lag the slider by its own stagger window and fight the next
  input event. `none` is the opposite case: it leaves no geometry to lay out at all,
  so the fade has to run with positions frozen rather than blinking the disc out.
