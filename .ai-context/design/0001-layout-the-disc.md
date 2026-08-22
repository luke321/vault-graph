# Layout: the disc

**Status** as-built · extracted from the README on 2026-08-22

> How a wedge gets its angle, how notes get a row, and why density is a fixed unit.

## Grouping


Fixed to the **PARA folder** (top-level folder). Community / note type / tag were
switchable dimensions; the folder view is the one that got used, so the control is
gone and Louvain along with it — which is also why `graphology-extras` is no longer
inlined.

Groups run in **name order**, which for PARA folders is their numbered order, led by
`(vault root)` (loose notes at the top of the vault), starting at **12 o'clock and
running clockwise**. (Sigma renders graph +y upward, so a plain accumulating angle sweeps
anticlockwise from 6 o'clock; `sweepAngle()` is the single place that converts.) That means wedges go round the disc in the
same sequence as the vault's own folder list, and — more importantly — a group keeps
its colour as the vault grows, instead of being repainted whenever note counts
change the size ranking.

Subfolder order stays **size**-based: the "N smaller subfolders" fold depends on
knowing which ones are smallest.

## Layout


A pie chart made of notes. Each group owns one wedge, its **angle proportional to
that group's share of the vault**, running clockwise from 12 o'clock. Inside a wedge,
notes fill concentric rings from the middle outwards, **best-connected first** — so
hub notes sit near the centre of the disc and leaf notes land on the rim. Slices butt
together; colour separates them.

Wedges are *nested*: each subfolder gets its own contiguous sub-wedge inside its
parent's arc, ordered biggest-first so the parent reads as a tint gradient.

Wedges are sized from what is **currently visible**, so hiding a group or a
subfolder makes the remaining slices grow back into a full circle rather than leaving
a hole. Those reflows are animated (~0.5s), interpolated in **polar** space about the
disc centre so notes sweep along arcs and the pie reads as rotating rather than every
dot cutting a chord across the middle.

The tween is driven by **frame count, not the clock**. A wall-clock version stalled
part-way whenever `requestAnimationFrame` was throttled, leaving nodes smeared
between old and new positions — while the graph coordinates were provably correct the
whole time, so it only showed up on screen. A guard timer also force-completes the
move, so the final layout is right even if rAF never runs.

**Density does not change with filtering.** One layout unit is a fixed graph
distance. It used to be derived as `baseSpan * 0.52 / maxR`, which normalised the disc
to a constant footprint — so filtering down to 55 notes spread them over the area 440
had used, and the ring structure dissolved into a scattered cloud. With a fixed unit,
fewer notes simply make a smaller disc: measured, median nearest-neighbour spacing is
27px whether 440 notes or 55 are on screen.

**Below 55% of the vault visible, the plan is rebuilt from what is visible.** Rows per
cell set a cell's density, and rows come from the plan; on the full-vault plan a
heavily filtered view leaves each row holding ~2 notes while its wedge grows to 120
degrees (measured: 55 notes over 8 rows with 88-degree gaps). The threshold is
deliberately generous, so hiding one subfolder (82% left) stays on the full-vault plan
and nothing moves.

**The band is chosen per GROUP, never per cell.** Deciding per cell let one of a
group's sub-wedges sit in the inner ring while a sibling sat in the main one —
`05 - Weekly Reviews` rendered half in the middle and half outside once a re-pack
moved the threshold past one of its quarters. Sub-wedges are nested inside their
parent's arc, so they belong in the same band by definition.

**The hub hole is a constant fraction** of the outer radius, solved from the note count
(uniform density fills an annulus, so `n` notes need `pi(R^2 - r0^2)` of area). A fixed
`r0` gave a 32% hole at full size and a 69% one when filtered down to 55 notes.

Three rules keep the nesting from producing debris, all learned the hard way:

- **Cells are keyed by tint slot, not subfolder name**, so everything past the
  third-largest merges into one wedge — exactly matching the "N smaller
  subfolders" legend row. Giving each tiny subfolder its own sliver produced
  3-note wedges barely 2 degrees wide that showed up as isolated dotted spokes.
- **Every group with subfolders is split.** This used to require 12+ notes, which
  silently hid real structure — the quarter folders under `05 - Weekly Reviews`
  (10 notes) never appeared. The threshold existed only because the minimum wedge
  was once 1.4 degrees, making a 1-note subfolder an invisible sliver; `MIN_SPAN`
  is 6 degrees now, so every sub-wedge is visible and the gate was obsolete.
  Cost: the floors bind on 8 of 19 cells, spending ~48 degrees of the circle
  (13%) on 26 notes (6%).
- **Group folding is off.** It existed only because groups past slot 4 all shared
  one grey and merged into an unreadable mass; with ten hues a 3-note group has its
  own colour, its own gap and its own label, so a thin slice reads fine. The
  machinery is still there behind `SMALL_GROUP` if the thin slices ever annoy.

**Nothing swaps seats during a reflow.** The wedge *plan* — which notes sit in which
cell, in which row, at which fraction across the wedge — is built from the whole vault
and never from what is visible. Hiding something changes each wedge's **angle** only.
Verified by measurement: hiding an 81-note subfolder left all 359 surviving notes at
*exactly* unchanged radii (worst delta 0.00), so no note can cross another's path.

A **Core / edge** view (k-core decomposition, radius = shell depth) was built and then
removed as surplus to what the graph is for. The diagnostics it surfaced are recorded
below; `git`-less as this folder is, the code is gone rather than parked.

Two properties worth knowing, because they're what make the disc readable:

- Uniform packing density means every wedge reaches the **same outer radius**
  regardless of its angle — area grows with the angle, and so does the node count.
  That's why it reads as a pie rather than a set of spokes.
- Rows sit the same distance apart in **every** cell; spacing is never rescaled per
  cell. An earlier version stretched each cell across the whole radius, which handed
  small cells 2-6x the row spacing of large ones — a 3-note subfolder spread its dots
  6 units apart while a dense one packed them 1.09 apart, and the pie looked broken.
- **Unlinked notes are drawn in the hub hole**, sunflower-packed, at a fixed size
  rather than the smallest the degree scale would give them. They take no angular
  space in any wedge — they have nothing to be near.
- **Every column starts at its band's inner edge** and ends where its notes run out,
  so column length reads directly as "how much is in here".
- **Node radius is capped at 11, and that cap is load-bearing.** Measured row spacing
  is ~23-27px, so a radius above ~13 makes neighbouring notes in the same column
  overlap; the old cap of 20 put 19 nodes in collision, the worst by 15px.
- **...and the cap is scaled by the row pitch actually on screen**, because on its own
  it is not enough. Node sizes are **screen pixels**, fixed at graph build; the disc's
  pixel radius is not, since the pinned bbox is mapped to the stage — so a shorter
  window draws a smaller disc with the same size dots. The cap was tuned against
  ~28px of pitch on a 1068x1270 stage; on a 1080p screen the stage is barely 720px
  tall and the pitch falls to 22.6px, where 22px-wide dots touch (measured: 3 pairs,
  worst overlap 9.8px). `sizeScale` = `pitch / REF_PITCH`, capped at 1 so a big screen
  is untouched and floored at 0.45 so dots cannot vanish, restores the tuned ratio:
  at 22.6px pitch the max radius becomes 8.87, which is a radius-to-pitch ratio of
  0.393 against the original 0.393.
  It is measured with `graphToViewport`, and hooked to `afterRender` rather than to
  the camera alone — the case that bit was `fit()`, whose camera animation runs 380ms,
  so measuring straight after calling it reads the *pre*-animation ratio and pinned
  the scale to its floor (every dot 4.95px instead of 8.87px). Re-entry is safe
  because a change under 0.01 is not reported, so refresh → afterRender → no change →
  stop.
- **Notes are held off their wedge's edges**, which is what finally fixed the
  cross-wedge collisions — see *Sub-wedge gaps* below. An angular gap could never
  have done it alone.
- **The disc is split into two bands.** A cell whose proportional angle would fall
  under `MIN_SPAN` (6 degrees) moves to an **inner ring**, where it is proportional
  among its peers over the full circle. On this vault that turns eight 6-degree
  slivers into wedges of 14-97 degrees and keeps the main ring strictly proportional;
  flooring them in one band spent 48 degrees (13% of the circle) on 26 notes (6% of
  the vault). The inner band needs exactly one row here: 26 notes against a
  circumference of 28.
