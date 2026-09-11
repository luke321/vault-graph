# Invariants

Measured properties that must not regress. Each one has a way to check it — use it,
don't reason about it.

**Most of them run in one command:**

```bash
node scripts/smoke.mjs
```

It builds to a temp file, drives a real Chrome, and prints the number it measured for each
check, pass or fail — exiting non-zero so it can gate a push. The one property it does
**not** cover is the per-frame animation steps; that section says so and stays manual. Numbers below are from a 450-note vault (1458 links) on
2026-08-22; the shape matters more than the exact figure.

## Plan parity

The static plan and the live (opacity-weighted) plan must agree cell for cell.

```javascript
__vg.checkPlanParity()      // -> parityOK: true
```

**Check it with a folder hidden, not just at full vault** — the historic failure was a
flag that only diverged once something was filtered.

## A zero-weight member costs nothing

The strongest of the plan guarantees, and the one that catches the whole class. The
cascade and the resting path legitimately disagree on *membership* -- a departing note is
in the plan while it fades and gone once it has -- so they can never be identical. What
must hold is that the extra zero-weight members change nothing.

```javascript
__vg.checkZeroWeightInvariance()   // hide a folder first -> invariantOK: true
```

**Run it with a folder hidden.** At full vault there are no zero-weight members, so it
passes vacuously. With `04` hidden it reports 16 cells vs 19 -- the padded plan seats the
hidden notes -- and must still give identical rows and `maxR`.

This failed until 2026-08-22 because the gap total counted *groups present* rather than
*weight present*, so handing over moved every wedge by one 2-degree gap: 33 graph units,
6 screen pixels, in a single frame after the animation had converged.

**It failed again until 2026-08-23, and only on a vault with a dominant folder.** A cell
seated at weight 0 still asked for one row, because `rowsNeeded` ends in `Math.max(1, k)`
-- and that row reaches the band balancer's split search, so the chosen hub radius came out
differently between the two plans. Hiding a group holding 77% of the vault measured
`leanMaxR 13` against `paddedMaxR 14`; every other group on the same vault was clean,
because anywhere else the spurious row disappears into the maximum. `rowsNeeded` returns 0
when there is no weight to place. Checked by `scripts/smoke.mjs` against the third fixture,
`scripts/make-shape-vault.mjs`, which exists for this shape.

**The check compares the UNION of cell keys**, counting a missing cell as zero rows. A cell
present only in the padded plan *is* the seated zero-weight cell this is about, and
iterating the lean plan's keys alone never compared it -- which is why the failure above
first read as an empty `rowDiffs` beside a `maxR` that differed by a row. Counting missing
as zero is the other half: absent and seated-at-zero-rows are the same statement, and
comparing `undefined` against `0` fails every hidden folder on every vault.

**Nothing here reaches the screen at rest.** The resting plan seats only visible notes, so
no cell has zero weight; mid-cascade the plan is pinned and `geomLock` holds `r0`,
`rOuter` and `maxR` -- measured `innerMaxStep 0` and `outerMaxStep 0` across 122 frames
while hiding the dominant folder. This invariant is the guarantee, not the symptom: what it
protects is the next change, and `geomLock` is all that stands between a violation and the
6px jump above.

## No jump at the end of an animation

`settle()` must be a no-op, not a correction. The cascade runs past progress 1 until
every note is within half a unit of its target.

```javascript
__vg.probe(true)            // then toggle a folder
__vg.probeReport()          // outerMaxStep is the biggest single-frame step
```

| Toggle | worst single-frame step | settle jump |
|---|---|---|
| `04 - Daily Notes` hide | 40 | 0 |
| `03 - Resources` hide | 40 | 0 |
| `08 - Meeting Notes` hide | 40 | 0 |
| `05 - Weekly Reviews` hide | 0 (inner band only) | 0 |

The inner ring is not a special case: `share()` and `allocateBand` each run once per
band, so every continuity rule here applies to it identically. An inner-band step means the
same defect as an outer-band one.

40 units is one `RADIAL_EASE` quarter-step of a 160-unit row. Anything near 160 means a
row tick has stopped being smoothed. Tail displacement should decay to exactly 0:
measured `27 → 22.3 → 12.8 → 4.6 → 0.8 → 0` on a hide.

## Behaviour does not depend on how much was toggled

Hiding a small folder and a large one must differ in *degree*, never in *kind*. There is
one plan basis; no threshold switches it. Resting ring radius after hiding: `03` 1818,
`04` 1978, `08` 1658, `05` 2138 (unchanged, inner band).

## The disc's density follows the notes on screen

A band fills its box as evenly as its note count allows: the **lattice stays square**. The
tangential step a note has along its row stays comparable to the radial pitch between rows, and
a dot stays a fixed fraction of the step, in every filter state.

```javascript
__vg.debugDump().bands    // -> per band: notes, rows, step35, dotRadius, inner/outer radius
```

Two numbers, both per band, both measured off the drawn notes:

- **`step35 / ((outer - inner) / (rows - 1))`** — the lattice's aspect. Measured 0.94–1.07 on the
  10k and dominant-folder fixtures and 0.77–0.95 on the demo vault; asserted within 1.75 either
  way, which is one row of slack in a band three or four deep.
- **`2 * dotRadius.med / step35`** — a dot against its room. Measured 0.45–0.49 on the 10k
  fixture and 0.30–0.35 on the dominant-folder one; asserted in 0.15–0.80 with a spread under
  2.2x.

Take the radial pitch from the **drawn radii**, not from `spacing.pitchOuterUnits`. The reported
spacing can describe a different layout than the one on screen — measured, a band drawn with a
169-unit step reported a 381-unit pitch — and a ratio between a measured number and a reported
one is reading their disagreement rather than the lattice.

### This invariant was restated, and the old form is not recoverable

It used to assert `pitchPx * sqrt(shown)` constant to within 1.06, via `densityReport().pitchRoot`.
That is the statement of a **continuous** density: it requires the pitch to move by any amount the
note count asks for, which requires the disc to resize freely. Two later changes, both made to fix
reported bugs, make it unsatisfiable:

- **The rings keep their diameter.** A band fills a locked box, so its pitch is `T / rows` with
  `rows` an integer — it can only take the values `T/1, T/2, T/3 …`. `pitch * sqrt(n)` therefore
  drifts within each row count and steps between them. From one row to two the step is a factor of
  two, and no tolerance that permits that is worth writing.
- **The two bands are packed independently.** A single spacing made each ring answer for the
  other's filtering: hiding *outer* folders spread the *inner* ring until the two touched,
  clearance 843 → 89 units. So the outer band's pitch against the whole disc's note count is not
  one quantity, it is two, mixed. `densityReport()` reports `pitchRootOuter` and `pitchRootInner`
  separately now, and the check prints them as context.

The square-lattice form catches what the old one was for and more. `pitch * sqrt(n)` could not see
the tangential half of the lattice at all, which is where every visible symptom lived: dots sized
against the radial pitch while sitting at a step 1.58x wider, boundary gaps unlike the interior
spacing beside them, holes several times the row median. And the dot clause replaces "a wider
spacing must grow the dots", which was true only while a wider spacing meant a coarser lattice —
under a locked box `sp` widens because a row was *lost*, and the step, and so the dots, can
correctly be unchanged. Measured on the dominant-folder fixture: spacing 2.412x, step steady at
169, median dot steady to within 2%.

Before this existed, `pitchPx` was a constant **per vault**: 19.481px at every filter state
of a 500-note vault and 12.064px at every state of a 1500-note one, because the box is
pinned and the spacing was a hard 1. Filtering 503 notes down to 62 moved the median dot
4.254px → 4.208px. Spread of `pitchRoot` was **2.85x**; it is 1.10x now, and the whole
residual is the capped step.

**Filtering barely moves the disc's radius**, which is worth knowing before trying to
improve this. `maxR` is the max over cells, so the deepest surviving folder still reaches
the rim: `reach` measured 1.000 with 481, 465 and 382 of 503 notes showing. There is no
empty margin to reclaim — filtering makes the disc *sparser* at a radius that hardly
changes. A correction pass that scales the spacing until `maxR` lands back on the locked
extent was tried and **made it worse** (spread 1.10x → 1.15x): the outer edge is quantised
in whole rows and already flush with the box, so 2.3% more spacing buys 7% more radius and
there is no spacing between "no change" and "one row over". The overshoot belongs to the
camera — see `fitRatio()`, whose upper clamp came off 1 for exactly this.

**The cascade must be handed the spacing, not left to derive one.** Deriving it from
`planTotal` mid-animation samples alpha-weighted membership, which slides every frame:
measured, the biggest single-frame radial step went from 0 to **94 units against a row of
160**. Both endpoint packings are built from binary presence and the per-frame value is the
interpolation between them, on the same clock as `rowsAt` and the gap reservation.

**Dot size is a separate mechanism reached through the same number.** `measureSizeScale`
measures a *row*, not a lattice unit — they were the same number until the spacing became a
variable, and conflating them is why size ignored filtering entirely. Its ceiling came off
1, since a filtered disc genuinely has more room per note. Median dot 4.238px → 10.854px
filtering 503 notes to 62.

## The hub stays the same share of the disc

`r0`'s formula exists to hold the hub at a constant *fraction* — its own comment records
that a fixed `r0` gave "a 32% hole at full size and a 69% one when filtered down". Pinning
`r0` into `geomLock` reintroduced precisely that for every filtered view: measured 0.328 →
0.439 on a 500-note vault and 0.27 → 0.417 on a 1500-note one.

```javascript
__vg.densityReport()      // -> holeShare, drift under 0.06 while filtering
```

`r0` needed no change in the end. The share is held by the disc keeping its outer radius,
which is what the density solve does — so this checks the outcome the formula was written
for rather than the formula. Holds at 0.304–0.328 and 0.256–0.38.

**Except when nothing left can reach the rim (github#14).** The density solve conserves the
share by holding `maxR` fixed while spacing grows to meet it — that has a ceiling: hide the
one folder deep enough to reach the locked extent and the survivors cannot stretch far enough
no matter how much `DENSITY_MAX` allows, so `reach` genuinely falls (measured 0.602 on the
dominant-folder fixture) and `holeShare` genuinely grows (0.273 → 0.454) along with it. `r0`
still does not move — moving it was considered and set aside, see the entry below — the
symptom is answered by the camera instead.

## The camera reframes on a visibility toggle, but only while it wasn't already touched

`fitRatio()`/`fit()` already computed the right ratio for whatever `reach` currently is; they
just never ran automatically when a folder was hidden or shown, so the geometry above could be
internally consistent while the camera stayed framed for a vault that no longer exists on
screen — an island of notes in otherwise empty stage on the dominant-folder fixture (`hole`
0.273 → 0.454, camera never moving).

```javascript
__vg.camAtRest        // true once the camera is known to sit at fit()'s own target
```

`camAtRest` is `false` from the instant anything other than `fit()` itself moves the camera —
a drag, a wheel notch, `zoomBy()`, `centerOn()` — and only `fit()`'s own completion sets it
back to `true`. A visibility toggle (`cascade()`'s `opts.colToggle`) only auto-fires `fit()`
while it reads `true`; a camera the user has already panned or zoomed is left exactly where
they put it.

**Direction decides the timing, not only whether to fit.** A shrink (the disc getting
smaller) defers to `settle()` — cascade's own completion, once the outgoing notes have
actually finished fading — because zooming in on notes still visibly leaving reads as wrong.
A growth fires immediately, alongside the incoming notes' fade-in, because the view expanding
to meet what's arriving reads as right. Measured across a 738-note toggle on the
dominant-folder fixture: hiding held the camera at ratio 1.0800 for the entire ~1.8s fade,
landing at 0.6497 (0.6502 promised) only once settled; showing began moving within 25ms of the
click and finished by ~450ms, well inside the same ~1.8s fade.

`geomLock`, `r0`, `HOLE`, band thickness and the cascade's own row/spacing interpolation are
untouched by this — the fix is entirely in what decides to call `fit()` and when, never in
what `fit()` computes.

**How the check samples, and the race it used to lose (github#19, 2026-09-07).**
`watchDuringCascade` polls `busyWhy()` and the camera ratio every 60 ms and answers one
question: did the ratio leave `startRatio` *while the cascade was running*. It used to record
the ratio and only then break on `!busy`, so the final sample — the one that observes the
cascade already finished — still counted toward `movedWhileBusy`. A deferred fit is called
inside `settle()`, which is also what clears `busy`, and it animates over `zoomDuration`
(120 ms); so any poll landing more than ~20 ms after settle read a camera that had legitimately
started moving and reported it as having moved early. Measured on the dominant-folder fixture,
where the shrink is largest: **2 of 3 runs failed, on this branch and on develop's untouched
`page.js` alike** (same `0.6497` against `0.6502`, `moved early` flipping run to run), and it
blocked a develop push. The loop now breaks before recording anything from a sample taken after
`busy` went false. The cost is bounded and deliberate: a fit that began inside the last 60 ms
of a cascade is no longer caught, which is the width of one poll against a ~1.8 s fade, and the
defect the check exists for — a shrink fitting *instead of* deferring — moves the camera from
the first frames. The opposite-direction check is the control that it is still sensitive: a
growth must report `moved while notes arrived: true`, and does, on all three fixtures.

## Every note is filed exactly once, in either dimension

github#86, design/0015. The lattice gives every note one cell in one wedge. A folder
guarantees that by itself; a tag does not, so the tag dimension has to be held to it.

```bash
node scripts/smoke.mjs --only "tags:"
```

Four claims, and the counts are the whole check:

- **Plan members equal the note count** less whatever the hub holds, in both dimensions, and
  no note appears in two cells.
- **The group counts sum to the vault.** Measured: demo 1,403 members in 41 cells by folder
  and 11 by tag; 10k 10,002 in 37 and 11; the dominant-folder vault 954 in 10 and **1** —
  that vault carries no tags at all, so its tag disc is one `(untagged)` wedge, and it lays
  out clean.
- **Every note's group is the first tag it lists, or `(untagged)`** (design/0015 D-1).
  `(unlinked)` is the one legitimate exception, because that setting moves a note out of its
  group in either dimension.
- **`folder` is the default and a page nobody switches is the page it was** — the golden
  snapshots on the three folder-organised fixtures are that check, and the tag fixture's
  golden, recorded in the tag dimension, is the other half.

**One dot per tag came out on 2026-09-10 as github#91**, and the two paragraphs below are the
record of what it measured while it was in — the counts a return has to reproduce. The copy
machinery (`dupOf`, `noteOf`) stays, because a dimension switch's stand-ins are copies for the
length of the switch, and every walk that counts notes still skips them.

**With "Notes in every tag" on the count changed on purpose and nothing else could.** A note
with *k* distinct tags becomes *k* dots, so members and counts rise to the dot count — while
the heatmap's note-days, the search's hits per note, the timeline's `tlMax` and the footer's
note count all stay exactly what they were. Measured: demo 1,403 notes → **1,721 dots** with
the heatmap holding **1,091 note-days either way**; 10k 10,002 → **12,208 dots**, heatmap
**1,275** either way. A walk that forgets its `dupOf` skip shows up here as a doubled count,
which is why these are counted twice on purpose.

**A copy carries no edges at rest.** Measured: a copy of an 8-link note has degree 0 at rest
and 8 while hovered, and the graph goes 3,286 → 3,294 → 3,286 edges. The web at rest is the
notes' web, so the link count keeps meaning what it says.

### A dimension switch lands on the lattice, which takes two passes

Room and position are a fixed point — the same one the settle-size invariant below is about —
and one layout pass measures its margins against the room the *other* dimension left behind.
Every wedge changes across a switch, so the residue a folder toggle hides is visible here.

Measured on the demo fixture with a single pass: **1,335 of 1,403 notes settled up to 12.1
units off** where a fresh relayout puts them, in both directions, with an identical plan. Two
passes leave **0**, and a third changes nothing. The check compares the landing against a
fresh relayout in both dimensions and asserts the round trip is exact — 0 of 1,403, 0 of
10,002, 0 of 954, 0 of 891.

## A plan over the whole circle is the resting disc, and over half of it stays in half

github#86, design/0015. The planner can lay the disc out over an arc `[from, to]` instead of
the circle (`planArc`, `__vg.arcLayout(from, to)`). Two claims hold it to the disc it already
draws:

```bash
node scripts/smoke.mjs --only "arc:"
```

- **`arcLayout(0, 2π)` is the resting layout** — 0 ring notes off it, worst 0.000 units — on
  all four fixtures. An arc of the whole circle must change nothing, or the arc maths has an
  offset in it.
- **`arcLayout(0, π)` puts every ring note inside the half** — 0 outside, on all four
  fixtures (815 / 824 / 1,370 / 9,873 ring notes). Compressing the whole disc into a smaller
  arc shifts a dot in exact proportion to its bearing: 10% → median 18°, max 36°.
- **Neither question touches the disc on screen** — 0 notes moved after both.

The dimension switch does not use this to draw its new disc — it takes seats from `finalPos`,
which is exact — but the primitive is what a half-disc comparison or a clockwise wipe would be
built on, and this is the check that keeps it honest.

## A dot in the disc being left keeps its colour until it has faded

github#86, design/0015. The erase edge fades a dot **where it stands, in the colour it had**.
`state.dim` flips at the top of `setDim` and `nodeColor` files a note through `fileGroup`,
which reads that flag — so without a record of the old colour every standing dot repaints in
its tag colour the moment the switch begins, and the old disc reads as a recolour with a hole
walking through it instead of one disc being erased. `setDim` snapshots `nodeColor(id)` for
every mover **before** the flip into `LeftDisc.color`; `cascade` holds it as `leftColor` for
exactly as long as `moveFrom` holds the note, and `nodeColor` answers from it first.

```bash
node scripts/smoke.mjs --only "keeps its colour"
```

The check reads every standing dot's colour before the switch, drives the real `#vg-dim`
select, and on every sample compares each dot that is still in its old seat under its old
group. **0 of 801,863 / 688,122 / 833,275 / 338,669 standing dot-frames** in a colour other
than the one they had, on the four fixtures. Before: 787,308 of 787,308; 709,555 of 728,183;
821,574 of 845,729; 289,999 of 302,058 — every dot, from the first frame.

## A note one disc hides and the other shows arrives with the fill edge

github#86, design/0015. Each dimension keeps its own hidden state, so a note the folder disc
hides and the tag disc shows is an **arrival** on the switch, and an arrival is lit by the fill
edge — never at the switch itself, and while lit its seat is **behind the fill edge**, because
an arrival sits at its final seat; the inner ring sweeps the other way round, so its bearings
read mirrored. The switch draws the disc arriving with a **stand-in** per note of the disc
being left — each carrying its note's links, counting for its note's day in the heat strip,
and driving the nav bar's rows and bars frame by frame — and the check also holds that every
stand-in drawn is gone at the end and the graph has the node count it had (the edge count
follows, since dropping a node drops its edges). Two things break the arrival.
`setDim` must hand `regroup` `keepAlpha`, or `syncAlpha` lights the note before the cascade
starts and the cascade has nothing to arrive. And the block after the schedule that re-deals
a fully-arriving group's delays by radius must be skipped for `hand`: the hand keys every
delay on angle, and re-dealing hands one seat the delay of another.

```bash
node scripts/smoke.mjs --only "arrives with the fill edge"
```

The check hides the smallest non-archive folder with three or more notes in the folder disc
only, drives the real select, and on every sample compares each such note that is lit against
the fill edge — the erase edge's angle as the cascade reports it in `lastCascade().handDeg`,
minus the blade. **0 lit at the switch itself, 0 lit ahead of the fill edge, all lit at the
end** on the four fixtures. Before, on the maintainer's vault: 16 notes lit at the first sample
at bearings up to 266°; with `keepAlpha` alone, one lit at 206° while the edge was near 78°.

## Every grouping keeps its own colours, and a tab may be read off-screen

github#86, design/0015 (D-11). Colour pins, sub-wedge tint pins and default visibility are per
dimension (`dimColors`, `dimSubColors`, `dimShown`), read through `colorsFor`,
`subColorsFor` and `shownFor`, which default to the dimension on screen. A settings tab shows
its own dimension whichever disc is drawn, through `inDim(dim, fn)`: the disc's own builders
run in a swapped world and every global they write is restored, so there is no second
implementation of grouping, colour assignment or sub-wedge order and no way for the two to
drift.

```bash
node scripts/smoke.mjs --only "each grouping keeps its own colours"
```

The check opens the panel on the **folder** disc, switches to the Tags tab, and holds all of
it: the two tabs exist, the rows are the tag dimension's own names, a pin lands in the tag map
and shows on the tag disc, the folder map stays empty, and the folder disc's order and colours
are unchanged. Rows listed per tab on the four fixtures: 7 against 2, 4 against 15, 18 against
14, 18 against 14.

## The rings are independent

Toggling an inner-band group must not move the outer band. Measured, an `05` toggle
leaves the outer band constant — 0 units of movement.

**A dimension switch keeps the rings** (github#86, design/0015, `keepRings`): the dimension
arriving takes the hub radius, ring radii and band reference of the disc being left and
re-solves its rows inside them, on the animated and the instant switch alike — the two discs
of a switch share a hub and an outer edge. Only a hard relayout re-derives the rings, in
whatever dimension is on screen, and **an instant relayout runs two layout passes**, because
one pass lays out with the previous pass's room and is not the fixed point (github#21). The
round-trip check holds the landing against two passes inside the kept rings and home against
boot, exact on all four fixtures; the tag fixture's golden, taken after a hard relayout, holds
without a re-take. The copies toggle keeps the rings too and re-splits the bands inside them;
the inner ring's share cannot take the copies, which is measured and open in design/0015.

**A live rebuild on a switched-to disc retakes the rings it was switched into** (github#72 ×
github#86, `ringsIn`, `GeomLock.dim`). `decisions/0011` retakes the geometry lock when the note
set changes, and its premise — the step is sub-pixel — holds only when the lock came from the
plan on screen. A switched-to disc sits inside rings borrowed from the dimension it left, so
re-deriving them from its own plan is not a step but a re-pack: measured on the 10k fixture, one
note written on the tag disc moved **all 10,002 notes** (worst 19,380 units), resized every dot
and took the outer band from 24 rows to 23, hub radius 18.63 → 21.29. The lock now records the
dimension it was taken from, a switch carries that with the rings, and the live path retakes the
lock **in that dimension** from the new note set and keeps it — the same sub-pixel step the ADR
measured: r0 step **0.0009**, settle against the fixed point inside the kept rings 0 moved / 0
resized, the disc restored exactly when the note is removed again, on all four fixtures.

```bash
node scripts/smoke.mjs --only "keeps the rings it was switched into"
```

## Only depth-1 subfolders with their own tint slot are pushed

A group or a *named* subfolder moves as a block when highlighted. Pooled tail subfolders
and everything at depth 2+ get the ring only, because their notes are interleaved with
cell-mates at the same angles and pushing a subset slides it out *through* them.

```javascript
__vg.pushReport()           // pushedCount / pushedByPath vs haloedByPath
```

`03 - Resources/Locations` is the case that settled it: 3 notes, seventh in the order,
sharing the tail slot with six others. `pushedCount` must be 0 when it is selected.

## A sub-wedge only earns its own slot if it can fill one

`splitFor(g)` already refuses to split a FOLDER into sub-wedges when its total note count
can't fill the band's rows (`src/page.js:1781-1799`, github#18/#19 lineage) — but that is
an aggregate, folder-level test. It says nothing about each *individual* resulting
subfolder cell once a folder does split. Reviewing the demo vault after github#23 shipped,
`04 - Daily Notes` (50 notes over 16 month subfolders, clears the folder-level bar as a
whole) turned up 3 of its 4 sub-cells below the outer band's own row depth —
`"0:6/9*", "1:6/9*", "2:4/9*"` against a healthy `"3:34/9"` tail — while every other split
folder on that vault had zero sparse cells. Each sparse cell independently triggers
`placeCell`'s one-note-per-row spread (correct in isolation; odd repeated three times
side by side).

`subCellIndex(folder, sub, n, depth)` (`src/page.js`, beside `subTintIndex`) adds the same
question per subfolder: below `depth` (the caller's own `bandDepth[bk]`, the same number
`splitFor` already computed for that band) → redirect to the pooled-tail slot instead of
the subfolder's own rank. Deliberately a **separate function from `subTintIndex`**, not a
change to it — `subTintIndex` also drives a subfolder's *colour* (`buildSubShades`), and
colour should not shift just because a geometric slot did. Unconditional — every note
run through the row-depth test, always; no toggle to check or forget to check.

**`n` is a caller-supplied live count, not a lookup this function makes itself — and it
was not, at first.** An earlier version read `subCount`, a whole-vault tally built once at
load and never refreshed, to answer "how many notes does this subfolder have." Under a
filter that is the wrong answer: a subfolder large in the whole vault but with almost
nothing currently visible would still clear the threshold on its stale total and keep its
own sub-wedge cell sparser than what's actually on screen — reproducing the exact defect
this feature exists to remove. This is the identical bug class `buildWedgePlan`'s own
comment already documents fixing for the FOLDER-level gate ("COUNTED FROM WHAT IS ON
SCREEN, not from the vault... it also cannot see a filter"), just not carried over to the
new per-subfolder one. Fixed the same way that fix was: a `liveSub` map, built in the same
cascade-stable, filter-aware loop that already produces `liveG`/`liveN` (same
`onlyVisible && !(planKeep || willShow)` membership), keyed by `folder + "/" + sub`. The
call site passes `liveSub[...] || 0` as `n`; `subCellIndex` still reads `subOrder` via
`subTintIndex`, but makes no count lookup of its own — the one piece of module state that
was actually stale is a parameter instead.

```javascript
__vg.buildWedgePlan(false).cells   // a sparse rank is already folded into the tail
```

*No non-tail split cell holds fewer notes than its band's row depth* asserts the general
rule directly against `buildWedgePlan(false)` — deliberately vault-agnostic (an even vault
with nothing to gate is a legitimate pass, not skipped) rather than hardcoding which
folder or vault is expected to be sparse. Confirmed on the demo vault build under this
suite: 42 cells at rest, 24 of them non-tail split cells, none sparse.

A second check, *the row-depth gate reads LIVE counts, not the whole-vault tally, under a
filter*, drives `buildWedgePlan(true)` — not `(false)`, which every other check here uses
— since that live path is exactly what the `subCount`-vs-`liveSub` bug above needed and
nothing else exercises it. **The window is the fixture's own first 20% of history
(`dateSpan.lo` to `dateSpan.lo + (hi-lo)*0.2`), not a fixed date.** A first cut reused the
fixed two-day window an existing pin-and-filter check already uses and it reached zero
split cells on all three fixtures — a check that cannot fail is not a check, so it was
re-measured against a vault-relative window wide enough to still keep some. Confirmed
non-vacuous by reintroducing the fixed bug (`subCellIndex` reading `subCount` again): 2 of
the 3 fixtures caught it (`01 - Projects` sub-cells at 1/2 and 5/6), the third (the
dominant-folder fixture, only 6 live cells under this window) did not — reported honestly
as "vacuous on this fixture" rather than a silent pass, when that happens.

**This shipped as a toggle first (`__vg.setSubwedgeGate`, off by default) and the toggle
is gone.** It was the right call to make it one initially — this was a hypothesis about a
look, not a confirmed fix, and the plan it shipped under said so explicitly. Live A/B
testing across several rounds that day found the merge itself correct every time; what it
also found, one round at a time, was three real bugs that existed *only because* the
toggle needed to recompute and re-render live, mid-session, against whatever else the page
happened to be doing at that moment — a cascade race (flipping the gate mid-intro left the
plan correct but the rendered notes stuck in their old, scattered positions until the
intro finished on its own), a stuck timeline (the same interruption skipped the sweep's
own completion cleanup, leaving the date-strip handle parked wherever the cut-off frame
left it), and an animation that only ever jumped instead of transitioning (an unconditional
instant snap is the right choice for something meant to give instant feedback in a
console, wrong for something a person is watching). Baking the gate in unconditionally —
so the very first, only cascade of a session already computes the correct layout, with no
runtime flip to race against anything — removed the need to fix any of the three rather
than fixing all three. The cascade-cancellation groundwork itself (`stopPlay()` before
`applyLayout(false)`, so a snap can't be overwritten by whatever was still animating) is a
real, general finding about `relayout()` and any future caller of the same
reset-and-snap shape; left unfixed here, deliberately, since there is no longer a caller
in this ticket that needs it — worth its own follow-up if `relayout()` (or something like
it) is ever driven the same way live.

## The resting disc is on the lattice

At rest every note's radius is `base + an integer row × SP`. A fractional radius at rest
blends two grids one row apart and reads as a smeared disc. Row counts are integers when
`rowsOf` is absent; only an animation passes a real number.

Checked as the **equivalent** claim, because `SP`, `INNER_SCALE`, `UNIT` and `geomLock` are
all locked inside the layout: *the distinct radii within one band must be evenly spaced.*
That needs nothing but node positions and `buildWedgePlan(false)` for band membership, and
it is stricter than the sentence above — it also catches a band whose spacing has drifted,
not only a fractional radius.

Measured: inner band **2 rows at 128, spread 0**; outer **7 rows at 160, spread 0**. Those
gaps are the constants themselves — 160 is `UNIT × SP`, 128 is `UNIT × INNER_SCALE`.

Two exclusions matter. Only notes at full alpha, since mid-cascade radii are legitimately
fractional; and no degree-0 notes, which are sunflower-packed into the hub hole and were
never on the lattice.

## Every heatmap day with notes fills its cell

The band encodes the count as *grain*, not as area, so a partially filled square is a
tiling bug rather than a small day. Sample the four corners of every day-cell that has
notes and none may come back as `--dim`.

```javascript
__vg.heatReport()      // daysWithNotes, blocksAtBusiest, pxPerNoteAtBusiest
```

Measured: **0 of 48 cells partially filled**; the busiest day tiles 180 blocks into a
13px cell, i.e. 0.94px per note. `blocksAtBusiest` must equal the busiest day's count —
if it is lower, notes are being dropped from the tiling rather than drawn sub-pixel.

## The heatmap band is painted for the state it landed in

`heatDraw()` repaints only when its signature changes, and the signature quantised each
day's count to quarter-notes with `Math.round(n * 4)`. A fading note takes a day from
`n = 1` through `0.1` to `0`, and everything under `0.125` rounds to the same signature as
zero — so the last repaint of a fade happened while the tile was still faintly there, and
the band kept that tint after the note was gone. Which cells carried the residue depended on
the fade order, which is why the 2.0.0 comparison found the solo-state band differing between
consecutive merges (github#19's frame work, github#67's fade schedule) while the counts
underneath were identical. Present in 1.9.0 and every build since the band existed.

```bash
node scripts/smoke.mjs --only "band is painted"
```

The check hides the biggest folder, lets the cascade land, reads the band's canvas as painted,
forces a repaint from the same state (through the hover-day signature) and compares. Measured
2026-09-06 on the demo and 10k fixtures **before: 718 and 1,788 pixels differing, max 232 and
238 of 255** — whole tiles left at a pre-fade colour; **after: 63 and 45 pixels, max 1 of
255**, 0 on the dominant-folder fixture. The bar is 2 of 255. Two changes: the signature uses
`Math.ceil(n * 4)`, so any count above zero is distinct from zero, and `settle()` clears the
signature so the frame the cascade lands on is painted from the landed alphas. The residual
1 of 255 on two fixtures is measured, repeatable and below anything a person can see; it was
not traced further.

## A heatmap day haloes and recolours, but never pushes

Clicking a day recolours its notes to `--today` — the neutral extreme, deliberately not one
of the ten group hues — and haloes them. **Hovering** a day, or a year label, haloes only:
recolouring under a moving pointer is far too loud, so a hover asks and a click chooses.
Neither moves anything: a day's notes are scattered across every folder, so pushing them
slides a subset out *through* its cell-mates, which is the same failure the pooled-subfolder
rule exists to prevent.

```javascript
__vg.state.markDay = "2026-08-19"; __vg.renderer.refresh(); __vg.pushReport()
```

Measured: `pushedCount` **0**, haloed 14, and **0 nodes changed position**.

**This is what "Mark today" used to be**, and the sidebar button is gone as of 1.7.0. It
answered the same question — which notes were written today — from a second place, by a
second predicate, and it is the one that got the predicate wrong twice (see
`design/0007-timeline.md`). The band's today column is the last cell of the grid; clicking
it does all of the above to exactly the notes the column counted. The fill treatment the
button owned moved onto `state.markDay`, and `smoke.mjs` follows it: *a marked heatmap day
recolours its notes* asserts the fill changes on pick and comes back on clear, which the two
deleted `mark today` checks were the only cover for.

## `skipIndexation` is a promise, and only hlWalk can keep it

`renderer.refresh({ skipIndexation: true })` told Sigma "nothing moved, do not rebuild the
spatial index". Inside `hlWalk` that is true by construction: its loop writes `hl[id]` and
nothing else, so it earns the flag and needs it — it runs every frame of a ramp. (Since
github#58 the engine keeps no spatial index and accepts the flag without reading it; the rule
stands as a statement about which code may claim nothing moved, which is what it always was.)

**Anything driven by a person's pointer has not earned it.** Hover highlight was written
with the flag copied from `hlWalk`, on the reasoning that a halo does not move anything.
The halo does not; the *rest of the page* does. A legend row can be crossed at any moment,
including mid-cascade and mid-tween, and skipping indexation then leaves the quadtree
describing where the disc used to be.

Hover is a per-row event, not a per-frame one, so a full refresh costs nothing worth having.
The rule stands on what the flag *promises* rather than on a measurement: only code that
can guarantee nothing moved may claim nothing moved.

**The measurement that seemed to prove it does not, and that is worth recording.** With the
flag the suite reported 9/17 on the demo vault, with three failures that read as three
unrelated bugs — aim resolving to the bare canvas, a legend reporting itself folded while
showing 18 subfolder rows, and `buildWedgePlan` returning null in the hidden-folder sweep.
Removing the flag gave 17/17. But the *same* signature turned up later from a completely
different cause (below), so that run cannot be attributed cleanly. Two wrong theories in
one afternoon, both plausible, both fitting the evidence:

1. a parked mouse landing on a legend row — ruled out by `HEAD` passing in the same
   environment;
2. `skipIndexation` — probably right, unprovable from that run.

## A leaked Chrome on the debug port makes the suite measure a stale page

`attach(PORT, "")` takes **whatever is listening**, and a killed run can leave its browser
behind. A later run then drives the *previous* run's page: same checks, same output format,
failures that look like real regressions and move around between runs.

The tell is in the second check, which prints the note count:

```
  ok   __vg is present and the intro landed
         1402 notes, until=null          <- the build above said 455
```

Measured: 11/17 and 13/17, entirely from a leftover browser holding a page from an earlier
build. Nothing was wrong with the code. Before believing any failure here, **check that the
note count matches the `wrote ...` line above it**, and if it does not:

```powershell
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like "*vg-smoke*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## Every highlight source belongs in the signature

`isHighlighted` answers yes for a clicked group, a clicked subfolder path, a marked heatmap
day, a hovered day or year, and — since 2026-08-23 — a hovered legend row
(`state.hoverGroup` / `state.hoverPath`). ("Mark today" was a sixth until 1.7.0 removed the
button; the band's picked day absorbed it.) Every one of them feeds the same per-note ramp,
and every one must appear in `hlSignature`: that signature decides whether the per-note
sweep runs at all, so a source missing from it is a source whose highlight silently never
ramps.

Hover **haloes without pushing** — `isPushed` does not ask about the hover keys, for the
same reason a marked day does not push.

## Aiming at a note is a timing problem before it is a geometry problem

`scripts/smoke.mjs` hovers the most isolated note on screen and asserts what got hovered.
It missed roughly **one run in six** with **19.9px of clearance** — far too much room for
that to be an aiming problem, and exactly the size of the mark-push drift, because the
checks above it set `markDay` and clearing that ramps a halo and a fill back. The fix is
to wait on the app's own idle predicate before computing the aim:

```javascript
!!__vg.demo.busy()      // play || cascade || layout anim || hover tween || highlight tween
```

Measured after: **24 consecutive clean runs**, against ~1-in-6 before — but **one miss did
survive the fix**, in the first batch after it, so the residual rate is small and not zero.
On a miss the check now reports the target's drift in pixels, what actually got hovered,
and which element sits at the aim point, which separates the three candidate causes (a
moving layout, a stale hit-test index, something painted over the canvas). **Read that line
rather than re-running** — the whole reason the diagnostic exists is that a flaky check
otherwise trains you to re-run instead of measure.

## A sub-pixel dot is still a target

The pointer reaches the page as whole CSS pixels — `MouseEvent.clientX` is the floored
position, in Chrome and in Electron alike, measured by dispatching fractional coordinates
over CDP and reading what the listener saw (1005.586 → 1005, 700.75 → 700). The engine's
picking (decision 0012) is exact geometry: a dot is hit when the pointer is within its drawn
radius. Put the two together and a dot drawn under about 1.4 px of radius can be hovered
only when its centre happens to sit near a pixel corner. Sigma's colour-buffer picking had the
same quantisation and a different catchment (a 2 px block), so the two builds missed in
different places, and across the 2.0.0 comparison matrix the engine missed where Sigma hit six
times and the reverse once — the 10k fixture's hub note at camera ratio 2 (0.84 px radius),
zoomed out on a 1100 px window, at pixel ratio 2.

```bash
node scripts/smoke.mjs --only "sub-pixel dot"
```

The check zooms until the top-degree note draws at 0.6 px of radius, aims the pointer at the
four whole-pixel corners around its centre, and asserts that the nearest corner hovers that
note and that every corner hovers *some* note. `getNodeAtPosition` keeps the exact test and its
last-drawn-wins rule, and adds a floor: when nothing is hit exactly, the nearest centre within
`PICK_FLOOR_PX` (1.5 px, just over the 1.41 px a floored pointer can be from a true centre)
wins. Nothing changes for a dot the pointer is already inside.

Measured 2026-09-06: before, the 10k page hovered the note from **0 of 4** corners and the demo
page from 1 of 4; after, the nearest corner hovers it on all three fixtures (0.16–0.61 px off)
and **4 of 4** corners hover a note. `render-diff` at rest, in a search and in every filter
state is unchanged by this — picking draws nothing.

## Hover re-arms after the pointer leaves the stage

Hover a note, move the pointer off the canvas entirely, move back onto **the same note**.
It must light up again.

```bash
node scripts/smoke.mjs      # "hover re-arms after the pointer leaves the stage"
```

It did not, for as long as this project has existed. Sigma's `handleLeave` emits
`leaveNode` without clearing its own `hoveredNode`, so on re-entry
`hoveredNode !== nodeAtPosition` is false and nothing is emitted — glance at the sidebar,
come back to the note you were reading, no highlight. Until github#58 `src/vendor.mjs`
patched the bundle at read time; the engine's own captor clears it (`src/engine/renderer.ts`,
the mouseleave handler), and this check is what says so.

It is also what made this suite flaky, which is the more expensive half of the story: the
hover checks failed whenever anything earlier had moved the pointer off the canvas.
Measured on the 450-note vault by repeating the hover: **1 hit in 40 before, 40 in 40
after.**

**The aim has to wait for the camera, not just the layout (github#63).** Run right after
`"layout matches its golden snapshot"` on the dominant-folder fixture this check failed 7 of
7 with `on 710, off null, back on null`, which reads exactly like the defect above — and was
not it. The page boots with `fit()`'s 380 ms camera flight (ratio 1.0 → 1.08) in progress,
and `settle()` waits only for the page's own animations (play, cascade, tween, hover,
highlight), never for the camera. Alone, `settle()` happened to wait ~600 ms behind the boot
tween, which outlasts the flight; the golden check's `relayout()` cancels that tween and
leaves the flight running, so `settle()` returned at once and the aim was taken at ratio
**1.0004**. The first hover landed (pick and aim agree at the same instant), the pointer left,
and by the return the camera had landed at 1.08 and carried the note **20,4 px** away from a
**3.1 px** dot. Measured through the check's own miss diagnostics: `camera ratio 1.0004 at
the aim -> 1.08 now`. Both pointer-aiming hover checks now `camSettle()` before computing the
aim, and a miss reports the target's drift, the element under the aim and the camera ratio at
aim vs now, so the two kinds of `back on null` can never be confused again.

The frames-arriving guard in `runOne` turned out to be a no-op found on the same trail: it
went through `page.j`, which `JSON.stringify`s a pending promise to `{}`, so `fps.frames` was
undefined and `undefined < 5` never fired. It awaits the promise now — after `settle()`, and
retaken up to five times before it refuses a job: its first live full run refused two demo
shards with **3 frames in 1421 ms** while twelve browsers booted at once, which is a page
struggling, not a page that has stopped, and the bar exists to tell those apart. A
backgrounded renderer never produces a frame however often it is asked; a starved boot
recovers within a second or two.

## The heatmap grid always fits its box

Weeks are dropped before pixels: `heatGeom` picks columns from what fits at the 7px cell
floor, then grows the cell into what is there. The band must never need its scrollbar.

```javascript
__vg.heat.w <= document.getElementById("heatwrap").clientWidth
```

The failure this replaced is worth remembering because it did not look like a layout
bug: the grid scrolls from `scrollLeft` 0, which is the **oldest** end, so a narrow
viewport opened on empty months with every note off the right edge and was reported as a
missing stylesheet.

## The date strip is as wide as its slot, at every width

`fitCanvas` pins an inline pixel width on the strip's canvas — it has to, since the bitmap
is in device pixels and the CSS box is in CSS pixels — and an inline width beats the
stylesheet's `width:100%`. So **asking the canvas how wide it is returns the width it was
last drawn at, for ever.** Ask the *slot* instead. `#vg-years` is the honest answer: same
containing block, same stretch, and nothing pins its width.

```javascript
// at any window size, after the observer has run
Math.abs(document.querySelector("#vg-ribbon").getBoundingClientRect().width
       - document.querySelector("#vg-years").getBoundingClientRect().width) <= 1
```

Measured before the fix, on the real vault: the strip stayed **1168px in a 668px slot and
1168px again in a 1568px one**, with every year chip left exactly where it was — and on a
page whose first measurement ran before layout it came up at the **600px fallback in a
1284px band** and never moved. The ResizeObserver was wired and firing the whole time; it
redrew at the same stale number, which is why this read as "there is no resize handling"
when there was.

Three things have to hold together, and each covers a different failure:

- the canvas box matches the slot — the resize itself;
- the **inline width matches the box**, or a fractional slot leaves the bitmap half a pixel
  off the pixels behind it. `measureRibbon()` therefore restores the inline width it found
  rather than leaving the canvas stylesheet-sized;
- the **year chips move**, since they are positioned from `ribbonW()` and were the visible
  half of the bug.

`smoke.mjs`: *the ribbon rescales with its slot*, which overrides the viewport rather than
resizing the OS window — same layout, same observer delivery, no window manager involved.

## The intro sweeps the range end from one end of the strip to the other

The intro and a drag on the right-hand handle are the same statement, so the intro *is* that
handle travelling: it starts at the left end, never goes backwards, and lands exactly on the
right end rather than near it.

```javascript
__vg.brushNow()      // { from, to, x0, x1, w, sweeping } -- what the strip is DRAWING
```

`brushNow()` and not `state.from` / `state.to`: both a drag and the sweep are **previews**
that deliberately leave state alone, so state cannot answer "where is the handle". The
preview rule is itself the invariant — writing the state per frame would put a hard date cap
in `timeFactor` on top of the rank ramp the cascade is already animating, and a range change
goes through `applyRange` → `cascade` → `stopPlay`, so the second reveal would cancel the
first.

Measured, at `timeScale 0.25` on a 948px strip: 24–26 sweeping frames, first sample at
**0.002–0.054** of the strip, last at **1.000**, **0** backwards steps, landing at
`x1 === w`, `state.from`/`state.to` null throughout, and the handle labelled by `#vg-rtip`
while sweeping and not after.

**The handle's position comes from the RANK, not from the span.** Interpolating
`dateSpan.lo → dateSpan.hi` linearly would put it in 2020 while every note from 2026 was
already lit, because a vault is not spread evenly in time. The visible consequence on the
real vault — 0.70 of the strip crossed in the first ~5% of the run, then a crawl — is the
vault's own distribution and not a regression; both evenly-dated fixtures sweep at 0.05–0.06
at the same point. See `design/0007-timeline.md`.

## The window's travel is what the history exceeds the window by

The band shows `heat.cols` weeks ending no later than the current week, so the pill can
only move by however much the vault's history is *longer* than that. On a vault whose
history fits inside one window there is no travel, and `clampWinEnd` pinning the pill is
the right answer rather than a dead control.

Ask the control rather than deriving it — press at each end of the rail and compare:

```javascript
// after a press at x=1 and a press at x=w-1 on the window track
__vg.heat.start + __vg.heat.cols * 7 * 86400000    // differs iff the window can move
```

Two consequences that have each cost something:

- **A fixture whose newest note is in the future has less history than it looks like it
  has.** `make-shape-vault.mjs` stamped 68 days ahead of today and read as 425 days of
  span while owning 357 days of history against a 364-day window — so the window was
  correctly pinned, and two checks that assumed it could move failed against a page that
  was right (github#18). Every generator anchors its end date to today for this reason.
- **Aim points must come from the measured travel, never from a fraction of the ribbon.**
  Centring is a promise the control can only keep where it can still move; a fixed
  fraction aims off the end of the travel on a narrow-span vault and measures the clamp.

## The window pill centres on the pointer's PIXEL, not its date

`winEndCentredAtPx` (`src/page.js`) solves for the window's end by bisection in pixel
space — given the pointer's x, find the `end` whose drawn pill (`ribbonX(end-span, w)` to
`ribbonX(end, w)`) has that x as its midpoint. Replaced a formula that added half the
window's span in TIME to the pointer's own date (`ms + winSpan()/2`), which only centres
correctly when `ribbonX` is linear: that shortcut assumes a constant px-per-ms ratio to
turn "half the span in time" into "half the pill's width on screen", and github#23's
compact axis broke the assumption on purpose. Reported live: grabbing the pill visibly
resized as it crossed a density boundary and stopped tracking the pointer's actual pixel.

```javascript
// after a press or drag on the window track
__vg.heat.start + __vg.heat.cols * 7 * 86400000   // the (Monday-quantised) drawn end
__vg.ribbonXOf(end)                                // where that end actually sits
```

**Verified in isolation before trusting the check.** A `debugWinEndCentredAtPx(px, w)`
probe (removed once it had answered) confirmed the bisection itself lands the RAW end
exactly on target — 0px off at an achievable pixel, correctly clamped and non-zero off at
an unachievable one. The remaining error a check can observe is Monday quantisation
(`heatBuild()` snaps `heat.start`, up to ~7 days away from what the bisection solved for),
and how many pixels 7 days costs is not a constant — it depends on how dense the axis is
right there. Measured directly rather than assumed a flat budget: 1.4px on the demo vault,
3px on the 10k vault, but **37.2px on the dominant-folder vault**, whose 14 months are all
near the note-count ceiling (no real compaction happening, so a week costs as many pixels
as it always did on a narrow, largely-linear span). *a press on the window track centres
the window there* computes its own tolerance from the LOCAL px-per-week at the press point
(`ribbonXOf(end) - ribbonXOf(end - 7d)`, times 1.5 for margin) rather than a flat number,
for the same reason the target pixel itself is read off the control's own measured travel
(`winTravel`, github#18) rather than assumed — a flat pixel budget tuned on a decade-wide
vault is far too tight for a vault whose whole span is 14 months.

## The date axis weighs years by note count, not by calendar time

`compactAxis` (default on, github#23) gives each calendar YEAR a width between
`YEAR_FLOOR_MS` (about one month) and `YEAR_CEIL_MS` (about one real year), scaled by that
year's own note count against `yearRef` — the same p90-with-floor shape `nRef` already uses
for bar height, applied here to note count per year instead of per month. Within a year,
every one of its months gets an equal share of the year's own width — deliberately NOT
weighted by the month's own note count; that was tried and read as noise. The one exception
is the LAST month, which is the month in progress and takes only the fraction of that equal
share its elapsed days have earned — see *The strip's right edge is a day the vault has
reached* below.

```javascript
__vg.setCompactAxis(false); __vg.ribbonXOf(ms)   // the untouched linear formula
__vg.setCompactAxis(true);  __vg.ribbonXOf(ms)   // note-weighted by year
```

**Two earlier designs were tried and replaced, each measured wrong against the author's
own real vault (not a synthetic fixture — this is the one case in the ticket where the
fixtures could not have caught the defect, since none has the shape that broke it):**

1. *Weight a populated month by its own real ms duration, collapse only literally-empty
   runs.* This was an exact no-op whenever no month was literally empty (0px delta,
   provably, since the per-month weights telescope back to `dateSpan.lo/hi`) — but it
   never made a genuinely busy year wider than a quiet one. Measured on the real vault:
   **2023 (21 notes, spread thin enough to touch nearly every month) drew 172px against
   2026 (399 notes, the vault's busiest year by far) at only 114px** — 2023 read as "every
   month populated" and kept full real-time weight throughout, while 2026 is only
   partway through its own calendar year. A month being merely non-empty said nothing
   about how much it actually held.
2. *Weight populated months by their own note count too, not just years.* Fixed the
   above, but the user reviewing it live asked for equal-width months within a year
   instead — month-to-month variation inside one year reads as noise, and the current
   design (year-level weighting, uniform months within it) is what shipped.

**A collapsed year measures against the busiest one, not against a hypothetical
linear width.** *a year's width tracks its own note count* asserts the busiest year on
the live vault draws strictly wider than the quietest — measured on the real vault:
2026 (399 notes) at 408px against 2023's 90px once note-weighting replaced real-duration
weighting. *sparse years cluster near the same floor width* asserts every year at or
below the note-count median lands within a bounded spread of every other — not
identical (a 2-note year still edges out a 0-note one), but visibly equidistant rather
than each keeping whatever width its own internal month structure happened to produce.

**A third check needs no gap at all, and exists because a mismatched id can hide behind a
full re-render.** `$()` prepends `"vg-"` to every lookup (`src/page.js:103`) — a rendered
element's own id has to carry that prefix too, or a module-scope function using `$()` to
reach it will find nothing. The compact-axis settings-panel toggle shipped once with a
button id missing that prefix, and it read as working: the click handler always calls
`buildOptions()` right after, which replaces the whole row from live state regardless of
whether the broken lookup's direct DOM write landed. *the settings-panel toggle actually
flips the live state* drives the real gear-and-click path end to end and was confirmed to
fail with the id bug reintroduced and pass with it fixed — a check reading only the `__vg`
API surface (as the other two here do) cannot see this class of bug at all.

**The year-chip label-density estimate was also stale, and only a compacted axis exposed
it.** `buildYears()` decided whether to show every year or skip alternates from
`(w * 365.25days) / totalSpan` — a vault-wide AVERAGE px-per-year, accurate only while the
axis was linear. Once a handful of sparse years can sit much closer together than that
average while one busy year takes the rest of the strip, the average never sees the tight
spot: measured on the real vault, every year still showed (no skip) while adjacent chips'
actual rendered boxes overlapped. Fixed to measure the real minimum gap between any two
consecutive years' actual positions and skip alternates below ~28px (a chip's own
approximate rendered width) — the number that can actually collide, not an estimate that
cannot see a local squeeze.

**A vertical overflow was Obsidian-only, and no amount of standalone testing would have
found it.** The plugin, driven live under CDP (`scripts/spike-check.mjs`, pointed at a
`make-mirror-vault.mjs` copy of the real vault so no vault content left the machine),
measured year-chip buttons at **30px tall against a 16px row** — `line-height`, `font-size`
and `box-sizing` all read correctly as declared, meaning something in Obsidian's own theme
CSS was still contributing vertical padding this rule's shorthand did not survive against.
The standalone page never has competing `button` CSS to lose that fight to, so this was
invisible in every Chrome-only check this ticket ran, including the fixed-then-broken
label-density check above. Fixed with an explicit `height: 14px` on the button — with
`box-sizing: border-box` already in force, an explicit height is authoritative regardless
of what else contributes padding. **Any future date-strip change should get at least one
pass driven through the actual plugin, not only the standalone build**, precisely because
this class of defect has no standalone-visible symptom at all.

**There are TWO buttons that flip `compactAxis`, not one, and they live on different
hosts.** `#vg-opt-compactAxis` is the settings-panel row, standalone-only (the plugin's
gear opens Obsidian's own settings tab instead of `#vg-settings`). `#vg-compact` is a
view-level icon beside the date-range fields, present on BOTH hosts — added after the
settings-panel row alone left the plugin with no in-view way to flip it at all. `setCompactAxis`
syncs whichever of the two currently exist in the DOM; either may be absent depending on
host and whether the settings panel has been opened. Adding the second button reversed an
earlier call: `compactAxis`'s plugin-side dep was made read-only on the reasoning that "no
in-view control exists on that host" — true when written, false the moment `#vg-compact`
shipped, so `onCompactAxis` came back, matching `onPanEnabled`. *the view-level icon
actually flips the live state, and persists* covers it the same way the settings-row check
covers its own button, and was confirmed against the real plugin under CDP (22px tall, no
overflow, no overlap with the date fields) rather than assumed from the standalone.

## The strip's right edge is a day the vault has reached

`dateSpan.hi` used to be `Date.UTC(y1, m1 + 1, 0)` — the newest note's month, rounded UP to
that month's last calendar day (github#51). So the strip's last slice was the month *in
progress* drawn as if it were over: a full month's share of its year's width, running to a
date in the future, and scrubbable all the way there.

```javascript
__vg.dateSpan.hi                                  // the day the strip's right edge means
new Date(__vg.dateSpan.hi).toISOString().slice(0, 10)
__vg.ribbonXOf(__vg.dateSpan.hi)                  // == the strip's width, at rest
```

Measured on a scratch vault written up to the day of the run (2026-09-02, newest note
2026-09-02, 82 notes over 2025-01 → 2026-09, nine months of 2026 on the strip, 2228px
strip):

| | before | after |
|---|---|---|
| `dateSpan.hi` | **2026-09-30** | **2026-09-02** |
| 2026-09's share of 2026's width | **11.11%** (104.7px) | **0.83%** (7.3px) |
| 2026-09 against a complete month in 2026 | **100.0%** | **6.7%** (= 2/30 days) |

So **~97px of that strip — the last 4.3% of the whole control — was days that had not
happened**, and dragging the right handle across them changed nothing on the disc because
every one is past the newest note. The readout and the `to` field named them as dates too.

**`hi` is today's local day, clamped on BOTH sides, and the second clamp is not optional.**
Never before the newest dated note, because a note dated in the future (frontmatter says so,
and nothing stops it) would otherwise sit past the right edge where no gesture can select it.
And never past the newest note's own MONTH, because that is the last month the dense month
grid holds: `monthEndMs` returns `hi` for the last month, so a plain "clamp to today" on a
vault last written in June and read in September would hand one June segment three months of
time to interpolate across — and, worse, would compute the pro-rating as *September's*
day-of-month over *August's* length, collapsing a complete month to 2/31 of its width. All
three fixtures sat in exactly that state while this was written (generated 2026-08-28, read
2026-09-02), which is how it was caught.

**Extending the month grid forward to today's month instead was considered and rejected.**
It would make the right edge mean "now" unconditionally, which is the nicer promise — but the
cost is unbounded in the other direction: a vault last written years ago would spend years of
strip on empty months, and on the linear axis (`compactAxis: false`, where there is no
per-year floor to bound it) the whole informative history would squeeze into a fraction of
the control. The clamp above never *adds* width, only removes width that was never earned,
and the dead run it leaves is at most the remainder of one month.

**Both axis paths and both bar layouts inherit this from `buildDateSpan`, by construction.**
The compact path reads the pro-rated segment widths; the linear path reads the `lo`..`hi`
those widths are cut from. The linear bar layout was `i * (w / n)` — one equal slice per
month — while `ribbonXLinear` beside it divided real elapsed time, so a bar and the handle
standing on it disagreed by up to a day and a half per month even on a vault of whole months
(February drew as wide as July while the brush treated it as 28/31 of one). Harmless until
the trailing month stopped running to its own month end, at which point the equal pitch would
have been the whole bug surviving with compaction off. Now both bar edges come from
`ribbonXLinear`, so each bar *is* its month's slice. Measured with compaction off on the same
scratch vault: bars tile with **0 gaps** and end at **2228.0px of 2228.0px**, 2026-02 at
**102.44px** against 2026-07 at **113.41px** (= 28/31), the trailing 2026-09 at **3.66px**.

**The pro-rating counts days TOUCHED, not whole days elapsed** — the 2nd counts as two, so
the 1st of a month is 1/31 rather than 0. A zero-width segment is not a rounding detail: the
brush cannot grab it and `ribbonMsCompact` cannot interpolate inside it (both guard `w1 > w0`
and fall back to the segment's start), so the strip would lose its right end for a day every
month.

**The band is deliberately untouched.** It is a rolling window onto `heatParse(TODAY)`, and
`clampWinEnd` / `winEndCentredAtPx` already refused to scroll past today without going
through the span at all. The only line of it that reads `hi` is `heatGeom`'s "never wider
than the vault is old" column clamp, and moving the edge only tightens that toward the truth:
`lo → hi` is now `lo →` the last day the vault reaches rather than a month end up to thirty
days in the future, so the clamp can no longer hand the grid weeks of columns before the
first note.

*the ribbon's right edge is a day the vault has actually reached* asserts all of it: `hi` not
past today, `hi` not before the newest note, `hi` exactly the day the clamp says, `ribbonXOf(hi)`
at the strip's own right edge, and the trailing month's segment at exactly its elapsed-day
fraction of a complete sibling month in the same year. The expected values are restated in the
check from *today* and *the newest note* — the two facts outside the page — rather than read
back off `dateSpan.hi`, so a build that got the edge right and the pro-rating wrong cannot
agree with itself past it. **It goes partly vacuous on a fixture whose last month has since
ended** (the edge half still asserts; the width half correctly expects 100% and says so in its
own detail line), which is where all three fixtures sit between regenerations.

**The golden layout snapshots do NOT move.** `dateSpan` is read by the strip, the brush, the
year chips and the band's column clamp, and by nothing in the disc's layout — the ticket
expected every checked-in x to shift and it does not, because the snapshots hold node
positions and band assignment, not axis geometry. Confirmed: *layout matches its golden
snapshot* passes unchanged on `demo-vault`, 1403 notes, band unchanged, positions unchanged.

## A note in the hub has left the ring, and the ring closes behind it

Pinning takes a note out of `buildWedgePlan` entirely. Skip that and it keeps its seat, so
its wedge is drawn around a hole where it used to be — the note is in the hub and its chair
is still at the table.

```
node scripts/smoke.mjs --only "leaves no gap"
```

Measured as the worst neighbour gap within one row of the busiest wedge, against that
vault's own resting spread rather than an absolute: **1.69x median at rest, 1.68x with six
pinned** on the shape vault. A vacated seat roughly doubles it.

Three numbers hang off the same decision:

- **The hub's dots shrink as it fills**, and the size comes from the closest two *slots*,
  not from the count — the ball changes shape at 2 and again at 7. On the demo vault:
  **16.53px at one pinned, 13.76 at three, 11.02 at six, 6.79 at thirteen.** A lone note
  takes the cap outright; deriving its spacing from the hole gave it a *smaller* dot than
  three (10.93 against 11.73), because a ring of three sits further out than the spacing
  the hole implies.
- **The ball must not touch the innermost ring.** `HUB_R1` is measured against the first
  real note of the disc, not against `r0` — both the dot and the note carry a radius the
  hole knows nothing about. At 0.62 the outer edge reached **0.865** of that distance,
  8.8px of clearance, which reads as contact; at 0.50 it reaches **0.714**, ~19px.
- **A pin hidden by a filter is skipped, not released.** Filters are deliberately not
  persisted, so they must not quietly edit something that is. Releasing was the first
  version: hiding a folder dropped every pin in it and unhiding did not bring them back.

## The mark yields to the hub by fading, not by switching off

`hidden` popped the mark out on the frame the first pin landed, while the note it was
yielding to was still crossing the disc — the one hard cut in an otherwise tweened change.

```
node scripts/smoke.mjs --only "mark yields"
```

Opacity **0.95 at rest → 0 with three pinned → 0.95 cleared**, with `hidden` false
throughout. The check sleeps past the 380ms transition on every read; `settle()` waits for
the layout and knows nothing about a CSS transition, and reading straight after a clear
returned 0.1414 — the fade caught in progress, not a fact about the mark.

## Every unlinked note wears the (unlinked) swatch

A note of degree 0 belongs to the `(unlinked)` group, not to its folder, and the legend
draws one swatch for it. What the disc paints must agree with that swatch — through the
**renderer**, not through `colorOf`, which was correct throughout the failure.

```javascript
(function () {
  var g = __vg.graph, r = __vg.renderer, sw = __vg.colorOf("(unlinked)").toLowerCase();
  var ids = g.nodes().filter(function (id) { return g.degree(id) === 0; });
  return ids.filter(function (id) {
    return r.getNodeDisplayData(id).color.toLowerCase() === sw;
  }).length + " of " + ids.length;
})()
```

Must be **all of them**. Measured before the fix: **0 of 12** on a 700-note generated
vault (9 distinct colours under one legend row) and **6 of 148** on the 10,000-note
synthetic; after, 12 of 12 and 148 of 148. Those 6 are why the check asserts *all* and not
*any* — one folder's slot happens to be the same hex, so an `any` form passed on a broken
build.

`demo-vault` mirrors a real vault and has **0 of 452** unlinked notes, so the check
reports that it had nothing to measure rather than passing on that shape. A vault with no
orphans cannot exercise this.

## Nav counts share one right edge

Grid columns align only within one grid, and every legend row is its own grid — so the
alignment comes from `min-width: 3ch` on the last column, not from a shared template.

```javascript
new Set([].map.call(document.querySelectorAll("#legend .ct"),
        function (e) { return Math.round(e.getBoundingClientRect().right); })).size
```

Must be **1**, at any depth and whatever is unfolded. Measured 24 rows / 24 counts / one
edge at 266px with the tree open, and 9 / 9 / one edge at the folded default. The `only`
button is laid out at every depth with only its opacity changing on hover, so this holds
while hovering too.

**Opening the tree is how the check gets more rows, not part of the invariant** (github#86).
The check clicks every twisty and then requires more counts than it started with — a fair
demand on the three folder-organised fixtures, and one the tag-organised fixture cannot meet:
it has three top-level folders and **no subfolder at all**, so there is no twisty to click and
the count is 4 either way. It read as `the tree never opened` on the first full run after that
fixture joined the suite. The check now measures the twisties first and, where there are none,
asserts the shared edge on the folded rows alone and says why. A vault that *has* a subtree is
unchanged: every fixture that passed before had `open > folded`, which requires a twisty.

## The legend's count bar is a share of the largest folder currently shown

Each legend row whose count is a plain number carries a 2px rule along the bottom of `.lg`.
**Its length is that row's count against the largest count among the folders currently
visible**, so the biggest folder on screen fills its row and every other bar is read against
it. It is a **view setting, `countBars`, on by default** — the gear's "Count bars in the
legend" row on the page, and a toggle in the plugin's settings tab. The bar measures notes; the wedge next to it measures notes *within its own ring*, because
angular share is allocated per band (design/0001), so the two still disagree by design.

**The denominator is the largest VISIBLE folder, which means the bars re-scale on a visibility
toggle.** That is the opposite of the first shipped version, which divided by every note on the
page and therefore never moved when a folder was hidden. Chosen deliberately on 2026-09-08:
against the whole vault the largest bar was 62.8px of a 217px track on the demo and the small
folders were indistinguishable stubs; against the largest shown, 60 / 50 / 48 / 36 / 24 notes
read as visibly different lengths.

```javascript
// what each row declares, against what it should be
(function () {
  var rows = [].map.call(document.querySelectorAll("#vg-legend .lgr"), function (lgr) {
    var lg = lgr.querySelector(".lg");
    if (!lg) return null;
    var g = lg.getAttribute("data-g");
    return { g: g, count: __vg.groupCount(g),
             ct: lgr.querySelector(".ct").textContent,
             visible: lg.getAttribute("aria-pressed") === "true",
             declared: parseFloat(getComputedStyle(lg).getPropertyValue("--vg-share")),
             applied: getComputedStyle(lg).backgroundSize.indexOf("max(") === 0 };
  }).filter(Boolean);
  var basis = rows.filter(function (r) { return r.count > 0 && r.visible && /^\d+$/.test(r.ct); })
                  .reduce(function (m, r) { return Math.max(m, r.count); }, 0);
  return rows.filter(function (r) { return r.declared === r.declared; })
             .filter(function (r) {
    return !r.applied ||
           Math.abs(r.declared - Math.min(100, (r.count / basis) * 100)) > 0.01;
  });
})()
```

Must be **empty**. Measured: **17 of 18 rows barred** on the demo (basis **406**, `05 - Meeting
Notes`) and on the 10k (basis **4358**, same folder), **6 of 7** on the shape vault (basis
**738**, `projects`). Exactly **one row at a full bar** on each, at the full **217px** track;
thinnest **4.0px everywhere** among the folders that are *visible*, floored so a one-note
folder still marks its row — and so that the mark survives hover AND highlight, which is why
the floor is 4 and the bar starts 2px in (below). A hidden folder draws nothing at all.

**Hiding the largest folder promotes the runner-up to a full bar**, and that is asserted, not
merely allowed: hide `05 - Meeting Notes` on the demo and the basis must become 200 with
`01 - Projects` declaring 100%. Showing it again must restore the basis to 406.

**`getComputedStyle` cannot resolve the `max()`, and that is what makes this checkable.**
Chrome reports `background-size: max(3px, 49.261%) 2px` on a barred row and `auto` on a plain
one, so a size still beginning `max(3px,` proves `.lg.bar` won the cascade rather than one of
the `background` shorthands. The share is read from `--vg-share` beside it. Do not try to parse
it with a regex written inside the check's template literal: an escaped open paren is consumed
before the page sees it, the intended literal becomes a capturing group, and every row reads as
broken when nothing is.

**The painted length was verified against the declaration, in pixels**, by clipping each row
out of a screenshot and counting the run of bar-coloured pixels — Chrome decoding its own PNG
through a canvas, since no computed style can answer it. Re-measured on the demo at the new
basis: `05 - Meeting Notes` declares 100% and paints **217.00px exactly**, `01 - Projects`
declares 49.26% and paints 107.00px against 106.90px wanted, `14 - Reading List` paints
**4.00px** on the floor, and the **worst disagreement over all 17 rows is 0.83 CSS px** on
`11 - Clippings` — the antialiased tail of a 12.83px bar, which the pixel scan's colour
tolerance drops.

**What the new basis bought, in painted pixels.** The three folders that were indistinguishable
before are now clearly ordered:

| row | notes | painted, vault-wide | painted, largest shown |
|---|---|---|---|
| `03 - Resources` | 60 | 9.00px | **32.00px** |
| `04 - Daily Notes` | 50 | 7.50px | **26.00px** |
| `09 - Maps of Content` | 48 | 7.50px | **25.00px** |
| `05 - Meeting Notes` | 406 | 62.50px | **217.00px** |

### Turning the setting off leaves the rows and removes only the bars

`countBars` follows decisions/0009: the page holds no storage, the host hands it in as a dep
and gets it back through `onCountBars`. One gate inside `barShare` covers every caller, and
`setCountBars` rebuilds only the legend — the bar is sidebar DOM and CSS, so there is no
relayout, no cascade and no `renderer.refresh()`.

Measured on the demo: default **pressed=true, `__vg.countBars` true, 17 of 18 rows barred**.
Off: **0 barred, the first row's `background-size` back to `auto`, and still 18 rows** — the
rows, counts and alignment are untouched, only the bars go. On again: **17 barred**.

| break it like this | result |
|---|---|
| default the setting off | **FAIL** — default pressed=false state=false with 0 of 18 rows barred |
| `setCountBars` forgets to rebuild the legend | **FAIL** — state flips to false while 17 rows stay barred |

```bash
node scripts/smoke.mjs --only "on by default"    # the default, the toggle, and what it removes
```

### Two row states paint over the bar, and the bar starts 2px in because of it

The bar is a background layer, so **anything painted above a background eats into it**. Two
row states do:

| state | what it paints over the bar | cost |
|---|---|---|
| `:hover` | the row's `1px solid transparent` border turns visible, and antialiases | **1px** |
| `[data-hl="on"]` | the highlight's leading channel is `box-shadow: inset 2px 0 0 0` — and **inset shadows paint over a background image** | **2px** |

Both eat from the **leading** edge, which is exactly where a bar begins. So a bar flush to the
edge loses its first pixels in precisely the states a person is looking at it. Measured on the
demo at a 1px floor: three of eighteen rows lost their bar entirely on hover, and the same rows
lost it on highlight. `00 - Inbox` sampled in colour: at rest one pixel is the full
`rgb(217, 89, 38)` at contrast **4.83** against the sidebar; hovering, the brightest is
`rgb(140, 67, 37)`, a half blend at contrast **2.21**.

**The fix is `background-position: 2px 100%`** — the bar starts after the accent band, so
neither overlay reaches it — **with the floor at 4px** so the worst state still paints 3px.
Measured, every barred row on the demo:

| | at rest | hovering | highlighted |
|---|---|---|---|
| floored rows (≤ 0.74% of the basis) | 4px | 4px | **3px** |
| `01 - Projects` (49.26%) | 107px | 107px | 106px |
| `05 - Meeting Notes` (100%) | 215px | 214px | 214px |

**Every state now keeps a mark, and the check asserts the weakest of the three is at least 3px.**

**`background-origin: content-box` was tried first and is wrong.** It does put both overlays
outside the track, but it lifts the bar out of the padding strip and into the content row —
where the `only` chip lives, and that chip is an opaque element painted above the row's
background. Measured, it took the full bar from 205px to **152px on hover**, the chip punching
a hole in it. The bar belongs in the padding strip *below* the content, where no grid item can
reach it.

**It WAS Obsidian's doing as well, and the test that cleared it was measuring the wrong bar.**
`.lg` is a `<button>`, and Obsidian gives every button an inset shadow: white 9% at rest with
0.5px blur and 0.5px **spread**, roughly doubling on hover. Spread means it wraps all four
edges, including the bottom 2px strip where the bar lives, and inset shadows paint over a
background image. The earlier test applied Obsidian's exact shadows to the standalone page and
got **217px in all four states** — on the 100% bar, where a 1.5px haze at the edges is
invisible. On a **4px** bar it is the whole mark. Measuring the widest bar to clear a defect
that only shows on the thinnest one proves nothing, and this is the second time in this issue
that reading CSS or the wrong row passed a real bug.

**`.lg` resets `box-shadow` now**, so the host cannot decide whether the bar is visible.
Measured inside real Obsidian: `shadow=none` at rest and on hover, and the check asserts it —
`obsidian-smoke.mjs --only "hover"` fails if the host's shadow ever paints on this row again.

```bash
node scripts/smoke.mjs --only "thinnest count bar"    # pixels in all three row states
node scripts/obsidian-smoke.mjs --only "hover"        # the CSS half, in real Obsidian
```

**A file check is not an instance check, and this cost a round trip.** Obsidian caches
`main.js` and `styles.css` until the plugin reloads, so the files on disk can match the build
**byte for byte** while the open window still runs the previous one. The install was verified
by hashing all three files against the build, which passed, and the running instance was then
*assumed* from launch order. That assumption was wrong and the bug looked unfixed for another
round. `install-plugin.ps1` now prints a red warning naming the three ways to reload whenever
it copies under a live Obsidian, and a green line when it does not. **Do not judge a fix in
the plugin without a reload**, and prefer closing Obsidian, installing, then starting it —
that is the only order with nothing to remember.

Three things that check got wrong before it was right, all worth keeping:

- **`p.j` wraps its expression in `JSON.stringify`**, so it returns `undefined` for an async
  IIFE. Anything decoding a screenshot through a canvas must go through `p.eval`, which awaits.
- **A click rebuilds the legend**, so a marker attribute put on a row before the click is gone
  after it. Address rows by `data-g`, which `buildLegend` re-emits.
- **A bar whose hue is the accent's cannot be told from the highlight fill**, and it reads
  *high*, not low — 213px on the shape vault's `(vault root)`. That one reading is dropped
  rather than trusted, because a false pass is the failure mode this check exists to prevent.

### The bar rule carries an id, and that is the whole reason it survives a host

`.vault-graph .lg.bar` and `.vault-graph .lg:hover` have **identical specificity** (0,3,0), so
whichever comes last wins. Inside Obsidian that is not the page's decision: measured in a live
window, `document.styleSheets` held **two** inline sheets for this page — #8 with 224 rules and
the current CSS, and #9 with 241 rules, a stale copy carrying
`.vault-graph .lg:hover { background: var(--surface-2); }`. The **shorthand** resets every
background longhand, #9 came after #8, and the bar died on hover. On the same row: at rest
`background-image: linear-gradient(...)`, `background-size: max(4px, 0.405%) 2px`; hovering,
`background-image: none`, `background-size: auto`, `background-repeat: repeat`,
`background-position: 0% 0%`.

**The selector is `.vault-graph #vg-legend .lg.bar` for specificity, not scoping.** (1,3,0)
beats any `.lg:hover` rule a host or a stale sheet can produce without `!important`, so the
rule wins on merit instead of on document order. The check asserts the selector still contains
an id and reports it: `bar rule ".vault-graph #vg-legend .lg.bar"`.

**Neither harness could have caught this**, and that is worth knowing before trusting them.
`smoke.mjs` drives the standalone page, where nothing else styles `.lg`.
`obsidian-smoke.mjs` builds a **throwaway vault with a fresh profile**, so it has no stale
plugin stylesheet and reported `image=gradient` under a real hover while the user's window was
broken. It took attaching to the **user's own running Obsidian** on a debug port to see it:
4px at rest, **0px** hovering, `hovered=true`. After the fix, the same probe on the same row
reads 4px and 4px.

### A hidden folder draws no bar

The bar counts what is **on the disc**, so a folder hidden by its eye contributes nothing and
draws nothing — not a clamped bar, nothing. It is also out of the basis, so it cannot set the
scale for the rows that are still drawn. Measured on the demo:

| action | barred rows | basis |
|---|---|---|
| at rest | 17 of 18 | 406, `05 - Meeting Notes` |
| hide the largest | 16, and the hidden row has none | 200, `01 - Projects` at 100% |
| `only` one folder | **1**, at 100% | that folder |
| All again | 17 | 406 |

**`only` is the case worth naming**: it hides every other folder, so exactly one bar remains
and it fills its row. That is asserted.

Before this rule a hidden row kept a bar clamped at 100%, and the clamp was hiding a real
absurdity: with the largest folder hidden, its own row declared **`max(4px, 203%)`** — 203% of
a basis it was no longer part of. Removing the visibility test brings that straight back, which
is how the check catches it.

### The tooltip has to say which folder the bar is measured against

The count's `title` names the reference, because a proportion with an unnamed denominator is
not a measurement. The largest row reads `406 notes · the largest folder shown`; every other
row reads `143 notes · 35.2% of 05 - Meeting Notes`. **If the denominator ever changes again,
this string changes in the same commit** — that is the whole guard against the bar quietly
meaning something else.

### A bar belongs to a plain count and to nothing else

A parenthesised count means the notes are tallied somewhere other than this row's own wedge
— github#50's folder whose notes stand elsewhere, and the unlinked group kept separate — so
those rows **draw nothing**, and neither do the `.lgr-empty` rows at zero. They are also left
out of the basis, so a held count cannot set the scale for the rows that are drawn. Verified
byte for byte at the vault-wide denominator: the `(unlinked)` row's crop was **identical before
and after the change**, 6715 bytes both times.

**Subfolder rows are bare.** `subCount` is within one parent, so a sub-bar needs a second
denominator in the same list. The sub-wedge on the disc already shows the within-parent share.

### Hover and selection must not wipe it

`.lg:hover` and `.lg[data-hl="on"]` both used the `background` **shorthand**, which resets
`background-image`; both are `background-color` now. Measured with a real mouse move through
`Input.dispatchMouseEvent` and a real click, never inferred — a first cut walked
`document.styleSheets` instead and flagged `.lg`'s own `background: none`, which is harmless
because it cannot out-specify `.lg.bar`.

**Be precise about what that edit actually buys, because the obvious claim is wrong.**
`.vault-graph .lg:hover` and `.vault-graph .lg.bar` have the **same specificity** (two classes
and a pseudo-class against three classes), so order decides, and `.lg.bar` is written after
both shorthand rules. Measured: putting `background:` back on `:hover` leaves the bar **intact
and this check green**. What the longhand buys is independence from rule order — move
`.lg.bar` *above* `:hover` with the shorthand restored and the bar dies on hover, which is the
case the check does catch. So the shorthand is a latent hazard for whoever next reorders this
block, not a live one today.

**And the layout must not move at all**, because the bar exists to cost `.nm` nothing:

| | before | after |
|---|---|---|
| `.lg` row width | 219px every row | **219px** |
| `.nm` width (3-digit / 4-digit / no-`only` row) | 122 / 117 / 141px | **122 / 117 / 141px** |
| `.lgr` height | 28.84px | **28.84px** |
| names truncating (demo, 10k / shape) | 1 of 18 / 0 of 7 | **1 of 18 / 0 of 7** |
| `nav counts share one right edge` | 1 folded, 1 open | **1 folded, 1 open** |
| golden snapshot, all three fixtures | — | **band and positions unchanged** |

### The check was proved to have teeth, one regression at a time

A check that cannot fail is worse than none. Each of these was applied to a green tree, run,
and reverted:

| break it like this | result |
|---|---|
| delete the `.lg.bar` rule (the `develop` state) | **FAIL** — rows read `size=auto`, and hover reads wiped |
| divide by every note on the page instead of the largest shown | **FAIL** — `(vault root)`: 0.143% declared, 0.493% wanted |
| take the basis over all folders, ignoring visibility | **FAIL** — hiding `05 - Meeting Notes` did not promote `01 - Projects` to a full bar (49.261%) |
| draw a bar on the parenthesised rows | **FAIL** — `(unlinked)`: ct "(33)" but bar=true |
| move `.lg.bar` above `:hover`, shorthand restored | **FAIL** — hovering wiped the bar |
| make the bar resolve `var(--gN)` live while the swatch stays cached | **FAIL** — bar agrees with its swatch=false |

**The bracketed-row one passed until the check learned to flip the membership toggle**, and
that is the lesson worth keeping: a parenthesised count only *exists* while `(unlinked)` is
kept separate, which is not the default state, so the entire no-bar-on-brackets rule — the most
carefully argued edge case in the issue — went unasserted on the first cut. The check now sets
`unlinkedByFolder` false, re-reads every row, and restores it. Parenthesised rows found bare
that way: **1 on demo, 1 on the 10k, 3 on the shape vault** (`(vault root)`, `tiny`,
`(unlinked)` — the shape vault is the only fixture carrying github#50's notes-stand-elsewhere
case). A shape with none reports that it had nothing to bite on rather than passing.

### A row's bar and its own swatch never disagree

The bar's colour is an inline hex from `colorOf()`, the same as the swatch it sits under, so
both keep the old palette after a live theme flip while the picker's `.swatch.vg-g7` — a class
resolving `var(--g7)` — repaints. **That divergence is github#84 and predates this work**; it is
reported by the check, not asserted, so a known defect stays visible instead of failing a gate.

What IS asserted is the row staying internally coherent: the bar and its swatch move together
or not at all. Measured, dark to light on the demo fixture, slot `g7`:

| surface | dark | after |
|---|---|---|
| `--g7` token | `rgb(144, 133, 233)` | **`rgb(74, 58, 167)`** |
| picker `.swatch.vg-g7` | `rgb(144, 133, 233)` | **`rgb(74, 58, 167)`** |
| legend swatch | `rgb(144, 133, 233)` | `rgb(144, 133, 233)` |
| count bar | `rgb(144, 133, 233)` | `rgb(144, 133, 233)` |

Making the bar resolve `var(--gN)` live while the swatch stays cached fails it — measured, bar
moves, swatch stale, `bar agrees with its swatch=false`. That is the shape a partial fix to
github#84 would take, which is the point of asserting it now.

**The probe span must be appended inside `.vault-graph`.** `--gN` is scoped to that root, so a
`var()` normalised from `document.body` returns `rgb(0, 0, 0)` and reads as a broken colour
rather than a live one — the first cut of that mutation test reported exactly that.

### The bars walk on the disc's own clock, and the last frame is the resting layout

A bar's width is a fact about the layout, so when the layout walks the bar walks with it — on
the same frame loop, the same `pr = frame / span`, and the same `ease = pr * pr * (3 - 2 * pr)`
the notes use. There is no second timer and no CSS transition: a transition would run on its own
clock and land whenever it liked, which is precisely the class of bug `animation.md` forbids.

**The last frame of a bar's walk is the resting layout**, and it lands there by assignment, not
by convergence: `barWalkEnd()` paints `barNow` exactly rather than trusting the final lerp. It is
called from inside `settle()` itself, not only from the cascade's `converged` exit branch — the
400ms stall watchdog also calls `settle()` directly, and until github#78 that path skipped
`barWalkEnd()` entirely, leaving a bar stuck at whatever share the last tick reached on any
machine that stalls a frame. `settle()` is the one place every exit path converges, so that is
where the bar walk gets landed too. Measured on each fixture — hide the largest folder, watch the
runner-up grow to fill the row:

| fixture | row | rest to target | distinct values seen | restored |
|---|---|---|---|---|
| demo | `01 - Projects` | 49.261% to **100.000%** | 23 | 49.261% |
| 10k | `02 - Areas` | 35.291% to **100.000%** | 24 | 35.291% |
| shape | `notes` | 13.550% to **100.000%** | 23 | 13.550% |

A separate harness sampled the bar and a moving note's radius on the same ticks: the share went
49.261% to 100.000% while the watched note's radius moved on those same ticks (3328, 3405,
3302, 3252, 3354), and the settled frame was **identical to a fresh render on all 18 rows**.

**A bar that loses its folder shrinks; it does not blink out.** Pressing `only` hides every
other folder, so their resting share is 0 — and the first cut dropped the `bar` class on that
render, which took the bar off screen in one frame while the disc took 1600ms to re-pack. Three
things had to change together: `paintBars` owns the class (a row gains or loses its bar as its
painted width crosses zero, so `querySelectorAll` looks for `.lg[data-g]`, not `.lg.bar`), a
rebuild mid-cascade keeps the class while `shown` is still above zero, and the 4px presence floor
is lifted by `.bar-out` on a row walking down to nothing — otherwise the shrink ends in a 4px
stub that blinks out anyway. Measured on `only`:

| fixture | the widest row falls | the thinnest row | after | on All |
|---|---|---|---|---|
| demo | `05 - Meeting Notes` 100.0% → gone, 23 widths | `14 - Reading List` 0.246% → gone, 23 | 1 bar | 17 |
| 10k | `05 - Meeting Notes` 99.8% → gone, 17 widths | `14 - Reading List` 0.023% → gone, 15 | 1 bar | 17 |
| shape | `projects` 100.0% → gone, 25 widths | `(vault root)` 0.135% → gone, 24 | 1 bar | 6 |

The check asserts the descent is **monotone** — never a step back up — because a bar that walks
from the wrong endpoint bounces, and a bounce reads as a glitch rather than as a mistake.

**Every legend row carries its own bar colour, whether it has a bar or not** — and that is not
tidiness, it is the fix for a shrink that declared itself and painted nothing. The colour used to
be emitted only on rows that already had a bar; a row that *gained* one mid-walk (`paintBars`
adding the class) therefore had `--vg-bar` empty, `background-image: none`, and a perfectly
correct-looking `background-size: max(0px, 74.961%) 2px`. The CSS read right and the screen was
blank.

**The check that missed it read CSS, and that is the third time in this issue.** It asserted the
class, the share and the descent, all of which were correct. It now measures ink: mid-shrink it
compares the mean colour *inside* the bar against the mean *beyond its end*, in the same pixel
rows, from a real screenshot. Inside-vs-beyond rather than strip-vs-strip because the row
separator spans the full width and cancels out of a vertical comparison — the first cut of this
instrument passed the mutation for exactly that reason. Measured: **175 on the demo and the 10k,
119 on the shape vault**; with the colour restricted to already-barred rows the same reading is
**0** and the check fails with `the shrinking bar was DECLARED but not painted (ink 0)`.

A shrinking row sits at `opacity: .38`, so its bar is fainter than at rest and that is right: the
folder is leaving. Faint is not absent, and only a painted measurement can tell the two apart.

**Measured in the running Obsidian, not only on the page**, on his own 520-note vault at
~60fps, sampling every legend row's `--vg-share` on `requestAnimationFrame` from inside the
page:

| action | `03 - Resources` (the new basis) | `08 - Meeting Notes` (widest) | `07 - Yearly Reviews` (thinnest) |
|---|---|---|---|
| `only` the runner-up | 58.70% → 100%, **123 widths** | 100% → gone, 123 | 0.405% → gone, 116 |
| hide the widest by its eye | 58.70% → 100%, **123 widths** | 100% → gone, 124 | 0.405% → gone, 112 |

**Sample inside the page, not over CDP.** A probe that round-trips one `Runtime.evaluate` per
reading first reported *no walk at all* in Obsidian — every row already at its resting value on
the first sample — while an in-page rAF sampler on the same window recorded 123 distinct widths.
A round-trip cannot be aligned to a frame, so it reports whatever the page happens to look like
between two of them; only a sampler running in the page can be trusted about per-frame motion.
That is the same class of error as the fixed `sleep`, which is the next paragraph.

**Three maps, and the null at rest is the load-bearing part.** `barNow` and `barPrev` are the two
endpoints a cascade interpolates between, recorded once per render; `barShown` is what is on
screen mid-walk and is `null` at rest, so the resting value is authoritative — the same shape as
`colorShown` for a hue walk. The override is also gated on `cascadeRun`, so a walk that somehow
never ended cannot be observed: with no cascade running, `buildLegend` renders the resting share.

**A rebuild mid-cascade may not snap the bar back.** A click rebuilds the legend, so the row's
*class* comes from the resting share (which folders have a bar at all) while its *width* comes
from `barShown` (where the walk has got to). Deciding both from the same value gives either a
snap or a bar that outlives its folder.

**This is what made the bar checks flaky, and the fix was to stop sleeping.** Once the bars
moved, `count bars` read **63.807%** mid-walk where it expected 100% — a `sleep(700)` racing a
1600ms cascade. Every fixed sleep after a state change became `settleBars()`, polling until no
`--vg-share` changed between two 150ms reads — which was itself a false-positive trap, and
github#78 is the second fix here: two equal CSS reads mean the page painted nothing between
them, and a real machine can stall its own `requestAnimationFrame` loop for a beat without being
done. `settleBars()` now polls `__vg.demo.busy()` to actual completion, the same primitive the
suite's own `settle(p)` already used. A time-based wait, or a wait for "nothing changed," against
an animation is a false failure waiting for a slow machine either way — only a flag the animation
loop itself sets is authoritative.

```bash
node scripts/smoke.mjs --only "count bars"      # the basis, the edge cases, hover, selection
node scripts/smoke.mjs --only "walk on the"     # the bars ride the cascade's clock and land on rest
node scripts/smoke.mjs --only "last frame"      # the disc's own version of the same law
node scripts/smoke.mjs --only "theme flip"      # the bar follows its swatch; github#84 reported
node scripts/smoke.mjs --only "right edge"      # 1 edge, not 2 -- the column survived
node scripts/smoke.mjs --only "golden"          # the disc did not move
node scripts/obsidian-smoke.mjs --only "theme"  # the same, through a real css-change
```

## Animations are a fixed length, unless the page can't draw them

Durations are wall-clock (`TIMELINE_MS` 4500, `CASCADE_MS` 1600, `TWEEN_MS` 380), so
frame rate does not change how long a toggle takes. Below ~20fps the per-frame advance
clamps and the animation stretches rather than leaping.

**Every animation force-completes on stalled frames, never on a deadline.** A fixed
`setTimeout(settle, dur + margin)` fires part-way through on any page too slow to finish
in time and snaps the disc — this exact bug has been introduced twice. Watchdogs re-arm
while frames keep arriving.

## The focus web stays above the dim notes

Sigma paints every edge on its bottom layer and every node above that, so a lit (hover or
click) edge running under a dim note used to lose a bite of itself to every disc it
crossed — a well-connected hub read as dashed instead of solid (issue #2).

```javascript
__vg.checkFocusWeb()      // -> dimAtGaps: 0, webOK: true
```

Selects the best-connected note, composites the canvases in stacking order, and samples
every lit curve at 1% steps, keeping the samples that fall geometrically inside a
non-focus disc. `dimAtGaps` must be **0** — any sample landing on a dim disc means the web
is still running under it. Not frame-sensitive: the check selects rather than hovers, so
`hoverAmount()` is `1` immediately with no ramp to catch mid-flight.

Measured across the three vault shapes `scripts/smoke.mjs` builds: the demo vault (node
452, degree 71, 364 in-disc samples) **107 dim before the fix, 0 after**; the 10k
synthetic vault (node 1192, degree 54, 152 in-disc samples) **36 before, 0 after**; the
dominant-folder vault (node 157, degree 103, 1259 in-disc samples) **530 before, 0
after**. See `design/0005`.

## A link's stroke holds its width at any zoom

Sigma's edge shader draws `max(minEdgeThickness, size / sizeRatio)`, and `sizeRatio` **is**
the camera ratio here because `zoomToSizeRatioFunction` is identity — so a stroke grew as
`1/ratio`, exactly like a dot. That law is right for a dot, which is a thing and should hold
its proportion to the room it has, and wrong for a connector, which is a relationship rather
than a thing — nothing about a link gets stronger because the camera came closer (github#39).
The original wording here was "whose thickness is meant to carry link weight rather than
zoom"; github#43 removed the weight ramp and the argument outlives it, since a constant width
has even less business varying with the camera.

```javascript
__vg.edgeReport(id)       // -> maxPx <= capPx, and identical at any ratio below the knee
```

Reported through `edgePx`, the same function the focus-web overlay strokes with, so the
number and the canvas cannot drift apart. `ribbonPx` is the sum of one note's stroke widths
— the figure that says the fan has become a mass, where any single width still looks
reasonable beside the dot.

**Assert the equality, not just the cap.** The fix scales the whole web by one multiplier
(`edgeMult = min(1, EDGE_MAX_PX * ratio / EDGE_SIZE_MAX)`) rather than clamping each edge
against the cap, which makes the drawn width *constant* below the knee at
`EDGE_SIZE_MAX / EDGE_MAX_PX`. A per-edge `min()` would still satisfy a cap-only check while
flattening every link onto the same number — all 55 at 4.00px on the 10k hub, a 220px fan,
weight ordering gone. That is the regression the equality catches.

**Since github#43 the knee is 0.35, and the equality still has teeth.** `EDGE_SIZE_MAX` is no
longer the top of a weight ramp — it is derived from `EDGE_SIZE_LIT` (1.4), the widest size any
edge hands the shader — so the knee moved from 0.4 to 0.35 and the normalisation became exact:
a lit link below the knee draws **4.00px**, the cap itself, where before the widest thing on
the disc was 3.50px against an unreachable 4px. There is no weight ordering left for a `min()`
to flatten, but the ratio it would destroy is now the one between the **resting** width and
the **lit** width (2.33:1) — under a `min()` at ten notches in, a resting link (5.56px
uncapped) and a lit one (12.96px) both clamp to 4.00px and the lit web stops standing out at
the exact zoom where you are studying one note. The equality catches it as before: a `min()`
draws 2.78px at five notches and 4.00px at ten.

**And read it with a search running.** `edgeReducer`'s query branch **returns early**. The
first version of the fix applied the cap once before the final return, so every link went
back to growing as `1/ratio` for as long as anything was in the search box — with the suite
green. A cap applied at one exit of a function with three is not a cap; `capEdge` goes at
every drawing exit, and the check fails at **7.87px** without it.

Measured on the 10k fixture, one hub of degree 55 — drawn stroke, and the total ink of its
fan:

| | camera ratio | before | after |
|---|---|---|---|
| rest | 1.08 | 1.70px / fan 93.50px | 1.70px / fan 93.50px — **unchanged**, above the knee |
| 5x | 0.216 | 3.94px / fan 153.94px | 2.12px / fan 93.93px |
| 10x | 0.108 | 7.87px / fan 307.87px | 2.12px / fan 93.93px — **identical to 5x** |

307.87px of ink converging on a 20.44px dot is why the fan read as one mass with no link
traceable through it. The other two shapes cap the same way: the dominant-folder vault (node
158, degree 103) 3.38px / 184.6px, the demo vault (node 452, degree 71) 2.75px / 130.63px.

**What it costs, measured rather than assumed.** The camera hook re-runs the reducers, which
on the 10k shape is 14.5ms against 3.3ms for a render alone — so a zoom notch below the knee
runs at about 50fps for its 120ms. Above the knee it costs *nothing*: `edgeMult` pins at 1
and no refresh fires. A pan never fires it at any zoom, because a pan does not change the
ratio. See `design/0005`.

**Note the resting numbers above predate github#42**, which lowered `minEdgeThickness` from
1.7 to 1.0 — so this check's own detail line now reads 1.0px at rest and a 55.0px fan, not
1.70/93.50. Its assertions read `maxPx` and the 5x/10x equality, neither of which the floor
touches, so it stayed green through that change.

**And the deep-zoom numbers predate github#43**, which made width constant and moved the
clamp's denominator from 1.6 to 1.4. Rest is untouched (1.0px, fan 55.0px, `edgeMult` 1, the
resting web byte-identical), and below the knee every link now draws the same width instead of
a 1.50–2.12px spread: **1.71px, fan 94.29px** at both 5x and 10x on the 10k hub, so the
equality still holds at the tighter figure. The dominant-folder hub goes the other way, since
it held the heavier links — 3.38px / 184.6px becomes **1.71px / 176.57px**. A *lit* link at
either depth draws 4.00px, up from 3.50px, which is the cap finally being reached rather than
approached.

## The floor may round a hairline up, not widen the whole web

`minEdgeThickness` was never set, so it sat at sigma's default **1.7px** — while at rest every
link's natural width is **0.55–1.02px**. The floor caught 100% of them and inflated each two
to three times, and 3737 of those crossing the middle of the disc stacked into a grey fog that
veiled the inner rings and filled the hub hole (github#42). The same setting family as the
check above, from the other end: that one is strokes too thick when you zoom **in**, this one
at rest.

```javascript
__vg.edgeInk()      // -> the web's own coverage, with no note or label mixed in
```

**Two assertions, and they do different jobs:**

- `minEdgeThickness <= 1.0`. Blunt on purpose — the regression risk was a sigma upgrade
  restoring its default, and since the value was never set explicitly for the whole life of
  the file, nothing would have said so. The engine has no default to restore (github#58); the
  assertion stays because the number is a measured one.
- **The floor is at most 2x the median natural resting width.** This is *why* 1.0 rather than
  some other smaller number, and it is what a later change to `edgeAttrsOf`'s width would trip
  — make links thinner without revisiting the floor and the floor becomes dominant again.
  Measured **1.80x** (1.79 on the demo shape) against sigma's default's **3.06x**. The headroom
  is thin deliberately. Since github#43 that width is the single constant `EDGE_SIZE` (0.60)
  rather than the `0.35 + 0.25w` ramp, so the bound now covers the **whole** web instead of its
  median: every link asks for 0.556px at rest and the measured inflation is unchanged at 1.80x
  (1.78x on the dominant-folder shape, where the resting ratio is 1.07).

**`edgeInk()` is context, not asserted** — a bigger web covers more of the stage, so the
number belongs to its vault. Measured on the 10k fixture:

| floor | one degree-55 hub's fan | web covers | mean alpha where lit | ink |
|---|---|---|---|---|
| 1.7px | 93.5px | 30.49% | 0.76 | 0.231 |
| **1.0px** | **55.0px** | 25.76% | **0.44** | **0.114** |

The coverage barely moved and the **alpha halved**. That is what the fog was, and it is why
the stroke widths alone did not describe the defect.

**`litPct > 0` is asserted, and it is not a formality.** `edgeInk` reads a WebGL canvas, which
is only valid straight after a draw; a lost drawing buffer reports zero ink, which is
indistinguishable from a perfectly clean disc. Without that guard this check would pass
hardest exactly when it measured nothing.

**Not a fixture:** the 450-note shape that sets 1.0's *lower* bound (at 0.5 a sparse web all
but vanishes) is generated by hand, not committed —
`node scripts/make-test-vault.mjs --notes 450 --years 4 --out <dir> --seed 7`. Re-check it by
looking if the floor is ever retuned. See `design/0005`.

## A synthetic vault's folder/subfolder note counts do not depend on which day it was built

`make-demo-vault.mjs` and `make-shape-vault.mjs` both default their `--end` date to today
(deliberately — the heatmap's last-52-weeks window needs a note on it, per
`make-demo-vault.mjs`'s own header). That's a genuine, real difference in the generated
output from one day to the next, and it is tempting — costly, twice now (github#31/#32) —
to *reason* about whether that difference could explain some layout oddity rather than
measure it.

```bash
node scripts/check-generator-determinism.mjs
```

Runs each generator twice, `--end` years apart on the same seed, and diffs the resulting
folder/subfolder note-count trees. They must be **identical**. Confirmed empirically before
this check existed: `make-test-vault.mjs`'s per-note subfolder pick (`pick(f.paths)`) is a
pure seeded-PRNG draw over a *fixed* list of subfolder names (`YM(18)`/`YQ(n)`, hardcoded
from a constant base year, never consulting `END`), and `make-shape-vault.mjs`'s `subFor`
is a fixed index-share split with no PRNG or date involved at all — so only the *calendar
date* embedded in each note's frontmatter and file stamp moves with `--end`; which
folder/subfolder a note lands in never does. Measured with `--end` set to `2024-02-10` and
`2027-09-28` (different year, month, and quarter): 71 folders / 531 notes
(`make-demo-vault.mjs`) and 11 folders / 954 notes (`make-shape-vault.mjs`), byte-identical
counts both times.

Confirmed to actually catch a regression, not just measure a property that happens to
hold: a temporary probe that made `make-shape-vault.mjs`'s subfolder split shift by
`new Date(END).getUTCMonth() % 2` was caught immediately (7 of 11 folders differed by 1
note between the two `--end` dates), then reverted.

**Deliberately excludes `make-mirror-vault.mjs`** — it reproduces a real vault's own
structure and dates rather than generating synthetic ones from a seed, so "does the
generation day change the structure" isn't a question that applies to it.

Wired into `.githooks/pre-push` alongside the PII/scope/network checks: cheap (a few
seconds, no Chrome), so no skip flag, same reasoning as those three.

## Build order does not affect the band split

github#32's other half, once github#33 cleared the generator: `walk()` in
`src/build-graph.mjs` read each directory with bare `readdirSync(dir)`, whose order Node
documents as filesystem-dependent, not a contract. That order became `files`, then
`notes` (same order, no sort in between), then graph node insertion order, then the group
iteration order `balanceBands()` searches over. That search is exhaustive over which
folders go inner vs outer and picks strictly-less-than on cost, so two candidate splits
tied on cost kept whichever the loop reached first — which used to mean whichever order
the disk happened to hand groups back that run. Two builds of the *same* vault content
could therefore land on a different inner/outer split for a folder sitting on one of those
ties, which is exactly what was reported: `04 - Daily Notes` on the demo vault, `inner:
true, rows: 6` in one build and `inner: false, rows: 9` in another, same directory, same
command, minutes apart.

```bash
node scripts/check-build-order-determinism.mjs
```

Fixed with `readdirSync(dir).sort()`. The check guards it two ways:

- **Dynamic**: builds two throwaway vaults holding the same notes, created in reversed
  folder/note order, and asserts both produce the exact same, alphabetically-sorted
  note-id list.
- **Static**: reads `walk()`'s own source and asserts it still chains `.sort()` onto the
  `readdirSync` call.

The dynamic half alone is not adversarial on every filesystem — measured here, on this
NTFS checkout `readdirSync` already comes back alphabetical even for a directory whose
files were created in shuffled order, so reverting the fix and re-running *only* the
dynamic probe still reported clean. The static half caught it immediately: reverting the
same fix and re-running failed with "walk() no longer sorts its readdirSync(dir) result".
Both are kept — the dynamic half is the actual functional guarantee the page depends on,
the static half is what makes the check fail loud regardless of which filesystem happens
to be under the checkout.

Verified against all three `smoke.mjs` fixtures post-fix (`--only lattice --only "row
depth"`): demo vault inner 6 / outer 9 rows, 10k vault inner 15 / outer 23, dominant-folder
vault inner 5 / outer 7 — unchanged from pre-fix on every fixture that already had a stable
split.

Wired into `.githooks/pre-push` alongside the generator-determinism check: two tiny
subprocess builds, no Chrome, well under a second, so no skip flag.

## A dot never outgrows its resting size while a cascade walks

Solo the smallest group with two or more notes through its `only` chip and sample the biggest
full-alpha dot every frame until the cascade lands: no frame may draw it larger than the larger
of the two resting sizes, before and after (5 % over, for rounding). In **graph units**, because
the auto-fit that follows a solo zooms the camera (github#14) and a bound in pixels would be
met or missed by the zoom rather than by the dot.

```bash
node scripts/smoke.mjs --only "outgrows"
```

Why (github#66): `dotPx` is `ramp × room / pitch`, and all three are walked between the two
packings. Two quantities walked on the same clock keep their ratio only when the ends are
proportional; soloing a four-note folder on a ~500-note vault walked the inner room 96 → 923
against a pitch of 191 → 573 (ratio 0.5 → 1.88 mid-walk) while the ramp top rose 8.4 → 21.8,
so the notes still waiting to leave were drawn at **36 px** against a destination size of
**9 px** — the hub cap for a row-0 inner note, which only takes hold on the frame the survivors
arrive. Reported as "they grow a lot and overlap, then shrink again". Now `cascade()` measures
every note's drawn radius at both resting packings (the same `roomOf()` pass that measures the
room) and holds each note to the larger of the two for the run's duration.

Measured on the mirror that reported it, soloing its four-note folder: before, biggest dot
6.8 → **36.0** → 9.1 px and 12 overlapping pairs at worst 34 px; after, 6.8 → **9.1** → 9.1 px
and 9 pairs at worst 9.6 px (the leaving notes crossing as they fade). The check itself, on the
same mirror's two-note folder: **1.61x over** the bound on the old build, at the bound on the
new. Dense solos are untouched: the demo vault's 200-note folder grows monotonically to 14.8 px
with and without the cap (peak = rest, 1.00x). On the three fixtures the peak equals the resting
size after the solo exactly (shape 84.2, demo 102.2, 10k 286.2 graph units).

### What the law says when "Size dots from the frame" is on

2.0.0 ships the per-frame dot-size cap (`design/0011`, github#41) as a view setting, **on by
default** (off in Settings › Vault Graph › View, or `?nofit` on the standalone page; `?fit`
forces it on). With it on, `dotPx` also caps each dot at 0.46 of
its distance to the nearest visible note on the frame being drawn. The cap only ever lowers a
size, so the upper bound above is untouched; what changes is the lower one. **The law with the
setting on: a walking dot never outgrows the larger of its two resting sizes, and may be held
below both of them by its neighbours' clearance while rows slide — never above.** `design/0011`
records the spirit it gives up (a dot can shrink and grow back mid-walk, the motion github#66
was filed against in the other direction) and why the setting exists anyway.

```bash
node scripts/smoke.mjs --only "frame on"
```

The second check walks the same solo with `__vg.fitCap = true`, asserts the same upper bound,
and prints the trough: the lowest the biggest full-alpha dot went mid-walk, as a share under the
smaller resting size (demo 0.8 %, 10k 20.9 %, dominant-folder 1.1 %). Measured off against on,
2026-09-06, every fixture: the resting disc, the search and the solo are identical to the pixel;
after the biggest folder hides, one demo dot is capped 0.14 px smaller at ratio 1.08 (0.44 px at
0.35) — the tightest resting pair, as `design/0011` predicted — and no pixel crosses the bar.
Goldens are byte-identical either way, since the cap never moves a note.

## An arriving note's fade never reverses during a solo switch

Solo the smallest group with two or more notes, let it land, then solo the next smallest: every
arriving note's alpha must climb monotonically until it rests at its target. Sampled every frame
until the cascade lands; a drop of more than 0.02 after a rise is a reversal, which no monotone
fade produces at any frame rate.

```bash
node scripts/smoke.mjs --only "fade never reverses"
```

Why (github#67): the block that spreads a ramped group's fades across the whole cascade sat
inside the frame loop and re-sorted the arriving notes by their **current** radius every frame,
handing the sorted delays back out in that order. Arriving notes are being walked, so two that
swap radial order swap delays, and each fade restarts from wherever the other's delay puts it.
Accessors on the alpha entries showed **121 of 127 writes from the cascade's own `step`** — one
writer, two schedules; an arriving note read **0.43 0.5 0.58 0.65 1 0.79 0.82 0.87 0.07 0.11
0.99** across consecutive frames, and its dot flickered with it (the radius rides the alpha).
The schedule is computed once now, before the loop, hides ordered by `posSrc` and shows by
`finalPos`.

Measured on a mirror of the reporting vault, soloing a one-note folder then a four-note one:
before, 3 of 4 arriving notes reversed (9, 5 and 2 radius reversals; 8, 5 and 3 alpha
reversals); after, **0 reversals on all four**, alphas 0.01 → 1 monotone. Identical before and
after github#66, so unrelated to the size cap.

## A settled dot is the SAME size a fresh relayout gives it, not just the same position

github#21. `settle()` (the function every cascade hands off to once its frames are done)
reassigns POSITION from `finalPos` — a genuinely fresh layout, computed once at cascade
start — but never touched SIZE. `dotPx()`, which the Sigma node reducer calls for every
dot on every paint, reads `bandOf().room`, `cellRoom` and `edgeCap` as plain persistent
globals, not something it derives itself — and those are side effects of whichever
`ringsLayout()` call last ran. For 90-odd frames, that was the FRAME LOOP's own calls,
walking `roomNow`/`cellNow`/`edgeNow` from the source packing toward the destination's
*endpoint capture* (`roomOf()` over a `staticPlan`-built plan) one frame at a time — a
different, independently-computed answer from the one `finalPos` itself came from. Once
the loop stops, nothing ever asks for the correct figure again, so every dot is left
sized against the last animated frame's WALKED room until something UNRELATED forces a
real relayout (a resize, a fit, the next toggle) and it snaps to correct by accident.

Measured live (`__vg.setRange` on the demo vault, `05 - Meeting Notes / 2025-09-19 Vendor
call`): 26.5px right after a range-change cascade settled, 68.1px after nothing but a bare
`__vg.ringsLayout()` call with no position change — 157% off, position identical (the
sampler's own `dr`/`dtan` were 0 throughout, confirming the miss is size-only). 211 of 213
sampled notes were off by more than 5%. A folder toggle showed the same defect, smaller:
152 of 689 notes over 5%, worst 11.6%.

**Invisible to every check that existed before this one**, including the "last frame of a
cascade is the resting layout" check just above (`scripts/smoke.mjs`) — it compares the
last ANIMATED frame against REST, and both read the identical stale globals, so `dot 0%`
is what a fully broken build reports too. Confirmed by reverting the fix and re-running
this section's own commands: the existing check still passed clean.

**Fixed** by having `settle()` call `ringsLayout()` again after `assignPositions`,
discarding its position output (reusing it would reintroduce the "two plans disagree on
seats" 1517-unit jump documented at that same call site) and keeping only the
room/cellRoom/edgeCap side effects. **Once is not enough** — room and position are a
fixed point (documented at `finalPos`'s own "TWICE, and the first one is thrown away"),
and a single call still measures its margins against whatever room the frame loop left
behind. Measured: one call alone left 58 of 213 notes off by more than 5%, worst 39.1%; a
second immediate call converged all of them to 0%, and a third changed nothing, confirming
it is a genuine fixed point rather than still drifting.

```js
__vg.setRange("<a date inside the vault's span>", null);
// wait for __vg.demo.busy() === false, then:
__vg.relayout();               // what settle() should already have produced
// compare a note's renderer.getNodeDisplayData(id).size, scaled, before and after
```

**One correction to how this bug was first written up**: an earlier draft of github#21
claimed folder toggles were "fixed" by a settle-time refresh already on `develop`, citing
branch `fix/small-folder-animation`. That branch is unrelated (a stale, ~30-commit-behind
wedge-seam-overlay experiment ending in two reverts) and no such fix existed anywhere on
`develop` before this entry — folder toggles carried the identical defect, just smaller,
until now.

## A vault's layout matches its golden snapshot

github#37. Every check above asserts a *property* of the layout (rows balanced, no stray
small folders, dot sized right) — none of them would catch a layout that is internally
consistent and simply *different* from what it used to be. While working github#35, the
same folder split differently across rebuilds of the same mirror vault with no intentional
change; the cause turned out to be an in-progress, since-reverted fix rather than the
fixtures, but nothing in this suite would have caught either explanation.

`scripts/smoke.mjs`'s `"layout matches its golden snapshot"` check compares the current
build's band assignment (`buildWedgePlan(false)`'s `c.inner`, per folder) and every note's
`(x, y)` against a checked-in reference in `scripts/layout-snapshots/<fixture>.json`, for
each of the three named fixtures. A flipped band fails by name; a moved note fails with its
id and the delta in both radius and angle; an added/removed note id is reported separately
from a position drift, since it means the *fixture* changed, not the layout logic.

**Snapshots are deliberate, never automatic.** `scripts/update-layout-snapshots.mjs` writes
them by hand, on request — never from the check, never from the pre-push hook. When a
layout change is intentional: run that script, review the diff, commit the new snapshot in
the same change as the code that moved the layout.

**Why a snapshot taken today stays valid indefinitely — for two of the three.** The fixture
generators default `--end` to today (so the heatmap's 52-week window stays exercised), which
means the fixture store's weekly refresh (`FIXTURE_MAX_AGE_DAYS`, `smoke.mjs`) regenerates
each vault with a different `--end` periodically. Measured before trusting this at all: built
the demo and shape vaults twice each, 3.5 years apart in `--end`, and compared band
assignment plus every note's exact `(x, y)` — identical to the full float64, both vaults,
both dates. Layout depends on the seeded structure and each note's link weight, neither of
which `--end` touches there.

**The 10k vault was never in that measurement, and is not day-invariant.** Its daily notes
are filed into year-month subfolders derived from their dates (`make-test-vault.mjs`,
`YM(18)`), so moving `--end` moves notes between subfolders and the subfolder cells move with
them. Found 2026-09-04, the first weekly refresh after the goldens were recorded on
2026-08-28: the regenerated 10k vault failed this check with **893 notes moved, worst #5296:
radius 9317.1 → 9637.1, angle −80.4° → 169.1°**, identically on `develop@3aa9401`, on a
typing-only branch, and on the comment-strip branch — while the demo and shape goldens
survived the same regeneration. Since then the 10k fixture is generated with `--end
2026-08-28`, the day its golden was taken, in both `smoke.mjs` and
`update-layout-snapshots.mjs` (the args are part of the store digest, so the two must agree),
and a pinned fixture does not age in the store — regenerating it would write the same bytes.
The cost is the live half of the heatmap-window check on that one vault, which the two
ageing vaults still carry. Re-recording the 10k golden means choosing a new `--end` in both
scripts in the same commit.

**Reading raw positions off `demo.busy() === false` is NOT enough, on its own.** This is the
same defect as the section just above (github#21), for POSITION rather than SIZE: a
still-running cascade's next animation frame can land after a bare `applyLayout(false)` —
even called twice — and silently overwrite it. Measured taking the snapshot two different
ways: with `applyLayout(false)` (once, then twice), two consecutive measurements of the
IDENTICAL build disagreed by several graph units on 90%+ of the demo and 10k vaults' notes
(the shape vault, smaller and simpler, happened not to show it either way). With
`__vg.relayout()` — the debug API's, which cancels any in-flight cascade frame and clears
`roomNow`/`cellNow`/`edgeNow`/`bandLock`/`geomLock` before rebuilding, exactly as this
section's own code block above already recommends — repeated measurements of the identical
build are byte-for-byte identical, on all three vaults, across multiple runs.

```
node scripts/update-layout-snapshots.mjs                      # regenerate, on purpose
node scripts/smoke.mjs --only "matches its golden snapshot"   # check, all three vaults
```

Verified the check actually catches something: temporarily changed `INNER_SCALE` from 0.8
to 0.75 (one folder's real band-assignment threshold), reran the check without regenerating
the snapshot. It failed on all three vaults, naming the exact folder that flipped band on
the demo vault (`04 - Daily Notes: outer -> inner`) and reporting every moved note's id and
delta on the other two. Reverted immediately after.

## A row-0 dot may not eat past a fixed share of the hub's own radius

github#35, the dot-sizing half (the hub-boundary-*position* half shipped separately in
1.8.0). `placeCell` puts row 0 of the inner band at `r0 * INNER_SCALE` — the same circle
the hub boundary is drawn at — for every inner band, always. A row-0 note's centre sits
ON that boundary by construction, so nothing but the note's own drawn radius decides how
far it visually pokes into the hub; normally invisible, since a healthy dot is a small
fraction of `r0`.

Soloing a folder down to a single note that lands alone in the inner band collapses that
band to one row, so `spInner = thickI / rows` becomes the band's WHOLE radial thickness
instead of a normal row's slice, and `rampFor` sizes the dot off that pitch. Measured live
on the reported repro (`01 - Projects`, 5 notes, real vault mirrored via
`make-mirror-vault.mjs`): `room.i` 586, `pitchInnerUnits` 573, so the room/pitch shrink
factor `f` in `dotPx` came out to 1.02 — barely above 1, and NOT the cause, despite being
the first guess. The ramp itself balloons, from `spInner` alone.

A band-wide cap on `room` (the same `sqrt(full/now)` density ratio `bandDensity()` already
uses for row spacing) was tried and reverted the same day: it fixed the reported case but
broke `"filtered to the bone, the disc stays drawable"` on two other fixture vaults —
ordinary aggressive date filtering also produces sparse bands, nothing to do with the hub,
and a band-wide cap on `room` cannot distinguish the two. Bisected: dominant-folder vault
`range last 2.5%` diameter/step 0.07 against a 0.15 floor with the cap, 0.33 without;
10k vault `range last 0.5%` 0.12 with the cap, comfortably passing without.

**Fixed** with `HUB_ROW0_FRAC`, a per-note cap scoped to row 0 of the inner band only,
following the `edgeCap` pattern (a hard geometric bound computed once during placement,
consumed alongside `edgeCap`'s own cap at the end of `dotPx`) rather than touching
`room`/`sp`/the ramp — it cannot affect any other row or band, so it cannot repeat the
regression above. `HUB_ROW0_FRAC = 0.08`: measured a healthy row-0 dot's own radius as a
fraction of `r0 * INNER_SCALE * UNIT` on the demo vault at rest, 4.2% (36 of 851 units) —
doubled for margin.

```
node scripts/smoke.mjs --only "filtered to the bone"     # must stay green -- what broke last time
node scripts/smoke.mjs --only "soloed hub-adjacent"       # the new check for this fix
```

The second check tries every folder on a vault in turn, soloing each and reading
`__vg.debugDump().bands.inner.notes === 1` — the app's own live band count, not a
hand-rolled reconstruction (a `buildWedgePlan(false)` reconstruction was tried first and
is wrong here: `false` is `onlyVisible`, so it returns every folder's cell against the
FULL vault regardless of what is hidden). It asserts the WORST folder's fraction, not the
first hit, since which folder balloons worst shifts with the vault's own generated content
— none of the three fixtures' resting state hits this shape at all, which is how it
shipped unnoticed the first time.

## A handful of notes is still drawable, on any calendar day

`"filtered to the bone, the disc stays drawable"` squeezes the date range to the last
10 % / 2.5 % / 0.5 % of the history and judges each state. Two things about how it judges,
both settled by github#65 on 2026-09-05, when the gate failed on the dominant-folder fixture
one day after that fixture was generated and on nothing else.

**The windows are taken off the notes' own dated extent, never off the strip.** The strip's
right edge is today whenever the vault has reached it (github#57), so "the last 0.5 %" of
the strip was 0.5 % of a span that grew a day every day, measured back from a moving end;
the ageing fixtures date their newest notes to their generation day, so the window's
population followed the calendar: **8 notes on generation day, 6 the next, then 4, 2, 0**.
Measured off the oldest and newest *dated note* instead, with `to` left open, the population
is a property of the fixture: the shape vault generated for `--end 2026-08-20`, for
`2026-09-05` and the store's own copy all print **86 / 24 / 8 notes** for the three windows;
the demo and 10k fixtures print 1104 / 478 / 196 and 1306 / 591 / 195, the same regime the
thresholds were tuned in.

**`d/s` is asserted only when a step was measured.** The probe's step is the median arc of
the rows holding four or more notes; a state with four to seven notes spread over two rows
has no such row, `medStep` is 0, and the `0` it reported was read as "collapsed" for as long
as this check existed. Measured in that state (6 notes, 3 per row): **the smallest dot was
5.3 px against a resting median of 3.1 px** — nothing had collapsed. So when no row is dense
enough, the check asserts the github#53 class directly instead: **the smallest visible dot's
radius may not fall under the resting disc's median dot radius.** A handful of notes must
never be drawn smaller than the full disc draws its typical one. The detail line carries the
median dot in px beside `d/s`, and prints `d/s n/a` rather than `0` when there was no step.

```bash
node scripts/smoke.mjs --only "filtered to the bone"           # all three fixtures
node scripts/make-shape-vault.mjs --out /tmp/sv --end 2026-08-20   # then --vault /tmp/sv: same 86/24/8
```

The layout was not changed for this: the measurement said the dots were legible, and the
large outer-ring dots in a two-note ring (42–74 px) are `DOT_ROOM_MAX` doing what it is for.

## A folder that holds notes keeps its row, its slot and its colour

The twelve automatic colour slots are handed out by POSITION in `order[state.dim]`
(`buildColors`), so while that list was built only from groups currently holding a member,
anything that emptied a group renumbered every group behind it — each one inheriting the
colour of the one in front. `computeOrder` now seeds the list from where notes are **filed**
(each node's own `folder`), so every folder that holds a note keeps its row and its slot
whether or not its notes are standing in it, and the two membership states agree on the list
name for name.

```javascript
(function () {
  var snap = function () {
    var o = __vg.groupOrder(), c = {};
    o.forEach(function (g) { c[g] = String(__vg.colorOf(g)); });
    return { order: o, colour: c };
  };
  var a = snap();
  __vg.setUnlinkedByFolder(!__vg.unlinkedByFolder);
  var b = snap();
  return a.order.filter(function (g) {
    return b.order.indexOf(g) < 0 || b.colour[g] !== a.colour[g];
  });
})()
```

Must be **empty**, in both directions. Measured on the dominant-folder fixture before the
fix: turning membership off left **5 of 7 rows** (`gcount` `(7)` → `(5)`), `(vault root)` and
`tiny` — the two folders made entirely of unlinked notes — vanishing, and **4 of the
remaining 7 recoloured**, `misc #d95926 → #3987e5`, `notes #199e70 → #d95926`,
`projects #c98500 → #199e70`, `refs #008300 → #c98500`. After: **7 rows in both states, 0
recoloured, 0 vanished**, and the same on the demo (18 groups) and 10k (18 groups) fixtures.

**Read it at rest.** github#48's `colorWalk` fades a forced recolour over `TWEEN_MS`, so a
read taken straight after the toggle returns blends of the two values — measured, `misc` read
`#3f85dd` at 400ms against its resting `#3987e5`, which makes a renumbering look like a
near-miss rather than a change.

**A vault with no unlinked notes cannot exercise this**: with nothing to move, both states are
trivially identical and the check passes vacuously, so it reports that it had nothing to
measure instead.

### A row at zero costs no arc and no alignment

Two things this could have broken and did not, both of which have their own history here:

- **No cell, so no row and no hub radius.** `buildWedgePlan` filters to `cellsOf[g]`, and a
  group with no members seats no cell — so a memberless entry cannot repeat the seated
  zero-weight cell that asked for one row and moved the band balancer's split
  (see *A zero-weight member costs nothing*, above, found on this same fixture). Confirmed by
  the golden snapshots: **band unchanged, positions unchanged** on all three fixtures.
- **The count stays on the shared right edge.** A row at zero drops its eye and its `only`
  chip, and dropping the chip *outright* moved the count out of `.lg`'s last grid track,
  leaving it one 8px gap short — `nav counts share one right edge` measured **2 edges** where
  it demands 1. Both controls leave an invisible placeholder behind (`.eye.none`,
  `.only.none`, the treatment `.tw.none` already used), which is what holds the column. That
  invariant's own note says the alignment comes from `.ct`'s `min-width` rather than from the
  grid; that is half of it — the min-width fixes the count's *width*, being in the last track
  fixes its right *edge*.

### And it must not cost the row its way back

A row at zero drops its eye and its `only` chip, and `(unlinked)` at zero — the DEFAULT state —
is exactly such a row. That row exists at all because its right-click menu is the one way back
to its own membership toggle without a trip through settings, so stripping controls off it is
the one change here that could strand a setting. The handler closes on `.lg[data-g]`, which is
neither control, so it is unaffected — and that is reasoning, which is what this file exists to
replace, so it is asserted instead.

```
node scripts/smoke.mjs --only "membership toggle"          # slots survive the flip, both ways
node scripts/smoke.mjs --only "opens its menu with no notes"  # the row at zero keeps its menu
node scripts/smoke.mjs --only "right edge"                 # 1 edge, not 2
node scripts/smoke.mjs --only "golden"                     # band and positions unchanged
node scripts/smoke.mjs --only "zero-weight"                # no seated cell for a memberless group
```

**The first check reads `autoSlotOf`, not `colorOf`, and that is load-bearing.** Its first cut
compared `colorOf` either side of the flip and passed on the unfixed code: `colorWalk` answers
from `colorShown`, which begins AT THE OLD VALUE for precisely the groups that changed, so for
the first `TWEEN_MS` a renumbering reads as "nothing moved". The check would have asserted the
defect away. `autoSlotOf` is the rotation position itself — assigned in `buildColors`, never
animated — and it is what the defect actually moves. Verified by disabling the seeding and
re-running: **7 groups, 6 disturbed — lost `(vault root)`, `tiny`; renumbered `misc`, `notes`,
`projects`, `refs`.**

## The engine draws Sigma's picture

github#58. The renderer under `src/engine/` replaced sigma 3.0.2, and the only acceptance
criterion was that nothing on screen changes. The suite cannot see that: sixteen of its checks
assert numbers and none reads a disc's colour or a curve's bow. So the comparison is its own
harness:

```bash
node scripts/render-diff.mjs --against-dir <dir>              # every fixture, ratios 1.08 / 0.35 / 4.2
node scripts/render-diff.mjs --against-dir <dir> --query note # the same, in a search: labels and pills lit
```

It builds each fixture from the current tree and compares it against a reference build of the
same vault -- `<dir>/<fixture>*.html`, made from whatever commit the picture is being held to
(a worktree at that commit, its `node_modules` junctioned in, `src/build-graph.mjs --vault ...
--out ...`). Until the switch the reference was the same tree's `--renderer sigma` build; the
three Sigma-rendered references the switch was measured against are not kept in the repo,
because a built page carries every note title of its vault. It loads each build in one Chrome
tab in turn, puts the camera in the same state, and compares two things per ratio: **camera** --
`graphToViewport` for every node and `scaleSize` of its size, bar 1e-6 px; **pixels** -- the
composited `edges`, `nodes`, `labels`, `hovers` and `hoverNodes` layers over the surface colour,
bar 0.05 % of the stage differing by more than 8/255 in any channel, and `edgeInk` within 1 %
(decision 0012, D-5). Two builds in two tabs would not do: the background tab never gets a
frame, and the page defers its edge-cap refresh to one.

**Measured 2026-09-04 on all three fixtures at all three ratios, at rest and in a search: max
camera |Δ| 0 px, 0 pixels differing, edgeInk equal to five decimals.** The bar was set before
the numbers were known, and the numbers came in at zero; the bar stays where it was recorded,
because a later change that costs 0.01 % of pixels is a finding to look at, not a failure to
argue about.

**Verified a second way, against develop's own build.** `--mode screenshot` (part of `all`)
captures two `Page.captureScreenshot` clips per ratio, the stage and the whole page, so the
overlays the page paints from `graphToViewport` -- logo, heatmap band, ribbon, legend, wedge
labels -- are compared too, as PNG bytes first and decoded pixels when the bytes differ. Against
pages built from `develop@79d829a` (no engine at all), at five ratios, at rest and in a search:
stage screenshots PNG-byte-identical in every one of 30 cases; whole-page screenshots differ
only in the last digit of the sidebar's "Generated …" stamp, because the two builds were minutes
apart. A reference built at the same minute would be byte-identical throughout.

Two behaviours are different on purpose and were decided before the port: picking is by
geometry (within `size / ratio` px of the centre, the last-drawn node winning -- the answer
Sigma's half-resolution colour buffer gave, without the 2 px quantisation), and the label
density grid is gone, with the occasional plain label it drew for the hovered note during the
first half of the hover ramp.

## The Sigma notice ships in both artifacts

`src/engine` is a port of Sigma.js 3.0.2 under MIT, and the licence asks for the copyright
and permission notice in every copy or substantial portion. `src/engine/notice.mjs` hands it
to esbuild as a `/*!` banner for `main.js` and for the engine `<script>` of every exported
page; esbuild keeps `/*!` comments and drops every other comment, which is how both builds
shipped without a notice for two commits in 2026-09 (github#58) while the exporter's comment
claimed they carried one.

```bash
node scripts/check-notice.mjs
```

It builds the plugin and exports a two-note vault, then asserts that the `Copyright (C)` line
of `src/engine/NOTICE.md` (the URL trimmed) appears inside the run of comments each artifact
opens with — `main.js` from its first byte, the page from its engine `<script>` — and that a
`/*!` banner precedes it. Measured 2026-09-06: the line at byte 367 of `main.js` (after the
build's own header comment) and byte 101,719 of the page, each inside its banner. It runs in
the pre-push hook next to the network check, with no skip flag, and `releasing.md` says why a
release cannot go out without it.

## A torn-down mount holds nothing outside its root

`mountVaultGraph`'s handle has a `destroy()`, and the plugin's `teardown()` calls it. After
it, nothing this mount registered outside its own element is still registered: the
`ResizeObserver` on the root and the two on the heatmap band are disconnected, the document's
`mousemove` and `visibilitychange` listeners and the window `resize` fallbacks are removed,
every animation frame and timer in flight is cancelled, `cascade()` refuses to start, and the
renderer is killed last. The host still owns the root and empties it itself.

```bash
node scripts/teardown-check.mjs --vault ./demo-vault           # six destroy+remount cycles, at rest
node scripts/teardown-check.mjs --vault ./demo-vault --quick   # teardown mid-intro
```

Measured on the 10k fixture, six cycles of the plugin's sequence (destroy or `renderer.kill()`,
replace the root with fresh `page.html`, mount again), heap collected twice before each read:

| | heap MB (post-GC) | DOM nodes | JS listeners | document mousemove | document visibilitychange |
|---|---|---|---|---|---|
| before, load → cycle 6 | 14.1 → 55.9 | 632 → 4107 | 140 → 926 | 2 → 8 | 1 → 7 |
| after, load → cycle 6 | 14.1 → 14.4 | 632 → 633 | 140 → 140 | 2 → 2 | 1 → 1 |

Before: **+579 DOM nodes, +131 listeners, one more of each document listener and ~7 MB per
cycle**, every cycle. After: the load baseline, held. The harness keeps a reference to the
previous mount only long enough to ask about its cascade and drops it before counting, so a
retained mount shows up as growth and nothing else does; `--kill` runs the old sequence so
the leak can be seen on demand. Mid-intro
(`--quick`), the second half of github#62 shows: **a mount killed with `renderer.kill()` alone
was still `busy` 400 ms and 1.2 s after its teardown, its cascade at 159 then 182 frames,
converging at 207** — three seconds of main thread per close on a 10k vault, drawn to nothing;
with `destroy()` the same cascade stops where it stands (155 frames, `busy` false at 400 ms).

The check is manual and not in `smoke.mjs`: a cycle replaces the page's root and its `__vg`,
and the suite's checks share one page.

## The plugin behaves inside a real Obsidian

The exporter and the standalone page are what the suite drives; the plugin's host is
Obsidian, and a fix can be right in one and wrong in the other (github#34 was). Since
2.0.0 the things only Obsidian can answer are measured there:

```bash
node scripts/build-plugin.mjs
node scripts/obsidian-smoke.mjs                    # demo fixture; --fixture shape | 10k
node scripts/obsidian-smoke.mjs --only "reopen"    # one check by substring
```

It copies a store fixture into a throwaway vault under `%TEMP%\vault-graph-obsidian-smoke`,
installs the three built plugin files the way a release does, launches a **separate** Obsidian
with its own user-data directory on a debugging port (the running Obsidian and its vault are
never touched), drives it over CDP, and prints a number per check. Opt-in and not in the
pre-push hook: it needs Obsidian installed and takes two to four minutes. Fifteen checks:

| check | demo fixture (1,403 notes, 3,286 links) | 10k fixture (10,002 notes, 3,815 links) |
|---|---|---|
| the plugin loads and the cache resolves (fresh vault: Obsidian indexes every file) | cache stopped growing 2.8 s after enable | 38.4 s |
| the view opens with no console errors | 0 errors; open → `__vg` 446 ms (build 22 ms, mount 9 ms), intro landed and disc at rest 6.3 s | 0 errors; open → `__vg` 1,058 ms (build 136 ms: index 63, edges 16, words 58; mount 56 ms), at rest 7.0 s |
| **cold start** — a second launch of the same vault, cache restored from disk, file contents not | cache restored 150 ms after attach; open → `__vg` 685 ms (build 229 ms, **words 215**), at rest 6.6 s | open → `__vg` **2,837 ms** (build 1,917 ms: index 55, edges 16, **words 1,845**; mount 49 ms), at rest 8.9 s |
| layout positions match the exporter's build of the same vault | 0 of 1,403 moved, max \|d\| 0 | 0 of 10,002 moved, max \|d\| 0 |
| hover shows the tip and lifts | tip on, tip off | same |
| click opens the card, its close button closes it | downNode, upNode, clickNode; card names the note | same |
| right-click pins and persists, a second releases | pinned 0 → 1 → 0, one plugin instance | same |
| double-click fits the camera back | 1.08 → 0.432 → 1.08 | same |
| six close-and-reopen cycles (github#62) | heap 26.4 → 27.4 MB (0.20 MB/cycle), DOM 7,917 → 7,917, listeners 1,412 → 1,412, document mousemove 2 → 2 | heap 67.7 → 68.2 MB (0.10 MB/cycle), DOM 33,715 → 33,715, listeners 1,414 → 1,414 |
| Refresh rebuilds and remounts, destroying the old mount | 6.3 s (build 21 ms, mount 7 ms), old api gone | 7.0 s (build 130 ms, mount 44 ms) |
| theme switch recolours labels | `labelColor` #ffffff → #0b0b0b with `--text-1` | same |
| the settings tab renders from `getSettingDefinitions` (github#59) | 6 definitions, 9 items, 29 rows, 8 toggles; compact axis round-trips to the view and `data.json` | same |
| the view mounts in a popout window | separate document and window, 6 canvases, ready in 468 ms, 0 popouts left | ready in 1,056 ms |
| disabling and re-enabling the plugin with the view open (what `plugin:reload` does) | 0 canvases left after disable, view reopened in 6.3 s, 0 errors | — |

Measured 2026-09-06, Obsidian 1.13.7, Windows 11, before the word counts moved off the
mount (see the entry below in `changelog-detail.md`).

**Where the time goes.** On a fresh vault it is Obsidian's own indexing (38 s for 10k notes)
and nothing the plugin does. On the launch a person actually experiences — the cache restored
from disk — the plugin's build is **96 % word counts**: `cachedRead` of every note, cold, 1.85 s
of the 1.92 s build on the 10k fixture. The index and the edges come out of the cache in
under 80 ms, the mount takes 50 ms, and then the intro plays for six to nine seconds, which is
the animation's fixed length, not loading.

**Three things the harness had to learn**, each a false failure until measured: a view
opened before the cache had finished indexing builds from a partial cache (41 sources and
138 links of 3,286) and nobody tells it — wait until the file and link counts stop moving;
the intro has not landed when `timelineUntil` is null, because it is null *before* the intro
starts as well — wait until every note is shown, the row counts are whole and the positions
have stopped changing; and a first click on the view activates its leaf, which shifts the
workspace under the pointer — activate the leaf and click the stage once before aiming.
The layout is byte-identical to the exporter's only once all three hold; measured mid-intro it
read as 1,357 notes moved.

## A live rebuild lands on the layout a fresh build gives

github#72, `design/0014`, `decisions/0011`. The disc follows the vault while the view is open:
`api.applyData(next)` diffs a fresh build against the mounted graph and walks the disc to it
through the ordinary cascade, instead of tearing the mount down.

What makes it safe is `decisions/0006`, not new machinery. An arriving note is seated at
**alpha 0 before either cascade endpoint is built**, and a zero-weight member is already
guaranteed to change no plan, no row and no `maxR` -- so endpoint A is the disc exactly as
drawn, endpoint B is the new rest, and there is no second animation path.

Three properties, one check each, all three fixtures:

| | measured |
|---|---|
| the same data moves nothing and starts no cascade | 0 notes moved, `applied "words only"`, `cascaded false` |
| a one-note add settles on the resting layout | **0 moved / 0 resized / 0 band flips** against a fresh `relayout()`, on all three |
| a removed note re-added restores the disc exactly | 0 notes off their original position |
| the same, on the tag disc after a switch (github#86) | arrival filed under `(untagged)`, rings stay the folder disc's, r0 step 0.0009, 0 moved / 0 resized, restored exactly |

The second row is `settle()` staying a no-op, measured the way the law states it: the disc it
landed on IS the resting layout, so rebuilding from scratch moves nothing. `relayout()` is the
instrument, for the reason the golden-snapshot section gives -- a bare `applyLayout(false)` can
be overwritten by a still-running frame.

```bash
node scripts/smoke.mjs --only "live rebuild"    # three checks
node scripts/smoke.mjs --only "land by path"    # the index/id defect below
```

**A one-note add is NOT a small motion, and the ticket assumed it was.** Measured by building
each fixture, adding one note and rebuilding: **23% of notes move** on both the demo and the 10k
fixture (318 of 1,403; 2,339 of 10,002), worst 185 u, max |dr| **0.82 of a row**. Wedges *before*
the edited one in the sweep hold exactly; everything after it shifts by the one note's share of
arc. That is the deterministic layout being correct, not the diff being wrong, and it is why the
check asserts convergence rather than stillness.

**What it costs to apply, and this is the open number.** `applyData` is synchronous and blocks
the main thread before the cascade starts:

| | demo (1,403) | 10k (10,002) |
|---|---|---|
| total block | **1,081 ms** | **1,896 ms** |
| of which `hardRelayout` | 309 ms | 446 ms |
| of which cascade setup (2x `staticPlan`, 2x `roomOf`) | 237 ms | 152 ms |
| diff / ingest / invalidations | 4 / 8 / 7 ms | 30 / 63 / 28 ms |

The remainder is GC from dropping the old graph and building a new one. **Most of it is not
new**: a bare `__vg.relayout()` on the demo fixture already blocks 840 ms, so the relayout and
cascade-setup terms are the page's existing cost, which a folder toggle pays too. What is new is
paying it once per edit rather than once per interaction.

**Watchdog exits on these fixtures are pre-existing.** A live cascade on the demo fixture reports
`exit: "settle() called from outside the loop"` rather than `converged`, 3 runs of 3. So does an
ordinary folder toggle on the same page, same machine (35 frames, 2,110 ms) -- so this is the
harness's frame pacing under CDP, not the live path. `decisions/0003`'s rule is unchanged and the
positions still land exactly; the checks assert the landing, not the exit reason, for the reason
`perf-cascade-frame-cost.md` gives about automation's frame pacing.

**A rebuild waits for the leaf to be looked at.** Obsidian hides an inactive leaf with
`display: none`, and before this was handled the cascade ran to completion behind it: measured in
a real Obsidian, the disc moved on 20 samples **while hidden** and 0 after switching back, so the
reader returned to a disc that had silently changed. Held now, and the same run reports **0 while
hidden, 20 after** -- twice in a row. The wake is a 500 ms poll that runs only while a rebuild is
waiting, because `active-leaf-change` / `layout-change` do not carry the case: switching away
fired five of them and `revealLeaf` fired none.

```bash
node scripts/build-plugin.mjs
node scripts/obsidian-smoke.mjs --only live      # a real Obsidian, throwaway copy of a fixture
```

## Word counts land by path, and an index stopped meaning a node

github#72. The host reads word counts in the background after the mount and applies them one at a
time. It addressed them by the note's **index in the build** -- `setNodeAttribute(String(i), ...)`
-- which was the same string as the note's graph id only because nothing had ever rebuilt the
graph.

A live rebuild breaks that on its first arrival. Measured: after one note is removed from the
front of the demo fixture, **index and id disagree for 1,401 of 1,403 notes**; 10,000 of 10,002 on
the 10k fixture. Every count still in flight would then land on the wrong note -- a plausible
number on the wrong dot, which nothing would ever report.

`api.setWords(path, words)` is the fix, addressed by the one thing the host and the page agree on.
Verified the check catches it: with `setWords` reverted to index addressing, the check fails and
names the defect -- the count landed on the bystander at that index (`424242`) instead of the note
asked for.

```bash
node scripts/smoke.mjs --only "land by path"
```

## Comments are pointers, and the count only goes down

github#61 cut every comment in `plugin/`, `src/` and `scripts/` to a pointer — a bare
`github#N`, `decisions/NNNN` or `design/NNNN` — and moved the reasoning to `.ai-context/`,
with JSDoc type annotations, `/*!` licence banners, shebangs, lint directives and section
banners kept. What it did not do was stop the prose coming back, and 386 lines of it were
still there on 2026-09-06 (392 on `develop@fc7d157`): JSDoc blocks whose lines carry no tag,
the ribbon icon's design notes in `plugin/main.js`, the `.d.ts` file's explanation of itself,
`build-plugin.mjs`'s strip-marker essay.

```bash
node scripts/check-comments.mjs          # counts per file, the total, the baseline
node scripts/check-comments.mjs --list   # every counted line
```

The scanner tokenises strings, template literals and regex literals so a `//` inside them is
not a comment, and counts a line when it is neither a pointer (optionally with a label of up
to 60 characters after `--`, `-` or `:`), a JSDoc tag line, a directive, a banner rule nor a
`/*!` block line. `BASELINE` in the script is held at **exactly** the count: a push that adds
prose fails, and a commit that removes some fails too until the baseline is lowered to match,
so the number can only go down — the ratchet github#60 used for the no-unsafe meter. In the
pre-push hook next to the network check, with no skip flag.

## Our own code lints clean

`npm run lint` runs typescript-eslint over the plugin, the page, the exporter and `scripts/`
(github#55, github#60). **Every finding is held at zero — errors and warnings alike.** There
is no budget and no headroom: a value that lost its type fails the push, in the same run and
by the same rule as an unused variable.

**The five type-aware rules are errors.** `@typescript-eslint/no-unsafe-{member-access,
assignment,call,argument,return}` — the ones the community directory's review applies to every
published version, and the ones `eslint-plugin-obsidianmd` 0.4.1 ships off. Its board for
1.9.0 listed 77 findings against our 28 for exactly this reason. They are on here, as errors,
so a finding is caught on this machine rather than on the directory's board.

**How they got to zero, and why there was a budget at all.** Switched on, they fired **6,977**
times: 510 in `plugin/main.js`, 6,467 in `src/page.js`. As errors that would have been a wall,
so they ran as warnings under `scripts/lint.mjs --budget N`, held at exactly the measured
count and failing in EITHER direction — a new finding failed the push, and taking one off
meant lowering N in the same commit. That made the number a ratchet rather than a ceiling.
github#60 walked it down in eleven batches on 2026-09-04, typing `plugin/main.js` against
`obsidian.d.ts` and `src/page.js` section by section with JSDoc; `changelog-detail.md` carries
each batch with the count it moved. At zero the budget said nothing "error" does not say
better, so it is retired: `eslint.config.mjs` sets the five to `error`, `lint.mjs` fails on any
finding, and a `--budget` argument is accepted and ignored so an old hook does not break.

**Verified the gate catches what it exists for**, the same way the golden-snapshot check was:
added `function gateProbe(x) { return x.nope; }` to `src/page.js`, and the run failed with
`3 errors, 1 warning`, naming the file, the line and the rule. Removed again.

**Two things the typing taught, both of which cost time before they were understood:**

- **JSDoc is read; JSDoc casts are not.** typescript-eslint takes the type of the expression
  *inside* `/** @type {T} */ (expr)`, not the cast, so a cast at a use site moves nothing.
  A cast counts only once its value is bound to a declared variable. `unknown` is the other
  tool: `any` may flow into an `unknown`-typed variable and nowhere else.
- **An escaped comment terminator inside a JSDoc block silently breaks the whole block**, and
  the count goes UP rather than down — 1,112 to 1,816 on the run that found it. The number is
  the only tell; nothing else complains.

**`check-scope.mjs` pins the `$()` accessor line verbatim**, so the page's element helper is
typed through its JSDoc rather than by a cast inside the line. A cast there fails that check —
correctly, since the check is asserting the accessor is still root-scoped.

**The five reach `src/page.js` two ways, and `tsconfig.json` names it so only one has to
hold.** With `include` at `plugin/**/*.js` alone the page was in the type program as the
plugin's import, and the rules did run on it -- measured, the same 6,467 either way. It is
named in `include` regardless: a file in the program only because something imports it drops
out silently the day that import moves, and #55's Phase 1 runs `tsc` over the same config,
where an unlisted file is simply not checked. `plugin/bundler-modules.d.ts` is named there too
— it declares the bundler's `raw:`/`b64:` modules, which are otherwise an unresolved module
and an error type at every use.

```bash
npm run lint                          # typecheck: ok, then 0 errors, 0 warnings
```

**Since github#58 the same command runs `tsc --noEmit` first.** `src/engine/**/*.ts` -- the
graph store and renderer that replace the vendored bundles -- is TypeScript under `strict: true`,
and `scripts/lint.mjs` runs the compiler over `tsconfig.engine.json` ahead of eslint so a type
error fails the push by the same gate a lint finding does. **Two configs, because `strict`
cannot be per-file, and this was measured rather than assumed:** `strict` on the shared
`tsconfig.json` put **29** errors on `src/page.js` -- every one a `getAttribute()` result that is
`string | null` under `strictNullChecks` flowing into an index or a call, which is #55's Phase 4
ratchet -- and esbuild, which reads `tsconfig.json`'s `strict`, injected three `"use strict"`
directives into `main.js`. With the typedefs re-pointed to the engine and `strict` off the shared
program, lint stayed at 0 errors, 0 warnings and the plugin bundle byte-identical.

Wired into `.githooks/pre-push` after the two determinism checks and ahead of `SKIP_SMOKE`,
and into `scripts/release.ps1` right after the dirty-tree check: about five seconds, no
Chrome, so no skip flag. It **fails closed** on a checkout without `node_modules` -- eslint is
the one gate that is not a Node built-in, and a gate that skips when its tool is missing is the
gate that runs when someone remembers, which is how 27 warnings accumulated in the first place.

## Only a hop lengthens the trail

The card's hop trail (github#40, design/0012) records the linked-notes walk and nothing else. A
hop is a click on a linked-notes row; a disc click, a search hit, a stage click, the close button
and the reset button are not hops, and each of them starts a fresh trail. Re-selecting the
note already selected -- which is what the pin button does to re-render the card -- keeps it.

```bash
node scripts/smoke.mjs --only "only a hop"
node scripts/smoke.mjs --only "re-selecting"
```

Measured 2026-09-06 on all three fixtures: a search hit shows 0 crumbs, three hops show 3, a
fresh search hit shows 0 again, one more hop shows 1; the pin toggle keeps 3 of 3. Hiding the
folder of a crumb's note through the legend eye leaves the crumb count at 3 and marks the crumbs
whose notes are now hidden (2 of 3 on the demo and 10k fixtures, 3 of 3 on the dominant-folder
one); showing the folder again unmarks them. The marks are refreshed at the start of every
cascade, because that is the one path every visibility and range change goes through.

## Stepping back never re-collects a hop

The back arrow steps back one hop, and the place just left is not pushed onto the trail again,
so two steps back leave n-2 crumbs, not n.

```bash
node scripts/smoke.mjs --only "re-collects"
```

Measured 2026-09-07 on all three fixtures: after four hops the card shows 3 crumbs and an
ellipsis (first, ellipsis, last two); one press of the back arrow shows 3 with no ellipsis; a
second shows 2; `location.href` is unchanged throughout -- every crumb is a `<button>`, and
nothing in the card is a link that could navigate.

## A crumb click truncates the trail at the crumb

Clicking crumb i selects that note and cuts the trail to the i crumbs before it.

```bash
node scripts/smoke.mjs --only "crumb click"
```

Measured 2026-09-06: three crumbs, the second clicked, one crumb left, the card names the
clicked note -- on all three fixtures.

## The trail is not layout

Walking the trail moves the camera and re-renders one panel. No position, no plan, no room
changes: the serpentine, the rings, the hub and the lattice never hear about it.

```bash
node scripts/smoke.mjs --only "not layout"
```

Measured 2026-09-06: five hops and two steps back move 0 of 1,403 / 10,002 / 954 notes (worst
0.000 units) and leave `buildWedgePlan(false)` identical, cell for cell, on all three fixtures.

## The page claims no keyboard shortcut

The trail is driven by pointer alone, and that is a decision rather than an omission. The first
cut bound Backspace, Alt+ArrowLeft and Escape on the mount root; they came out on 2026-09-07
because **Obsidian users bind their own hotkeys, and a view that grabs keys of its own overrules
them** (design/0012, superseding its binding A/B question). The page's only key handling is the
two listeners that were always there and each belong to something already open: the context
menu's own Escape, and the search box's Enter.

```bash
node scripts/smoke.mjs --only "no keyboard shortcut"
node scripts/obsidian-smoke.mjs --only trail
```

Measured 2026-09-07 on all three fixtures: with the card open on two crumbs, Backspace,
Alt+ArrowLeft and Escape each change nothing -- 2 crumbs before and after, the card still open,
the selection and `location.href` unchanged -- while the search box still gets its own Backspace
(`ab` -> `a`). In a real Obsidian the same two keys leave a one-crumb trail at one crumb with the
card still open, in the same run that proves the back arrow does step it.

**This is a claim about what the page does NOT register**, which is the kind that rots quietly:
the check drives the keys rather than reading the source, so a listener added anywhere -- root,
document, or a card element -- fails it.

## A finger reaches the disc, and the pointer's pick floor is untouched

One finger pans, two pinch about their midpoint, a tap selects and a second tap resets the
view. All four exist because `captor.ts` binds `touchstart`/`touchmove`/`touchend`/
`touchcancel`; before github#73 it bound eight mouse listeners and nothing else, and a tap did
not even fall back to a click, because `touch-action: none` on the mouse layer suppresses the
browser's tap-to-click. design/0013.

**These two sections are checked by `scripts/mobile-check.mjs`, not by `smoke.mjs`.** That is a
gap, and it is named rather than glossed: the suite drives one shared page, and hosting touch
checks there means turning `Emulation.setTouchEmulationEnabled` on and off around them, which
changes `pointer: coarse` and `hover` for every other check in the run. Until that is measured,
the harness is the gate and it is manual. github#73 carries the follow-up.

**Three constants, and they are not interchangeable.** `PICK_FLOOR_PX` is **1.5 px**, sized for a
*floored pointer* being at most 1.41 px from a true centre, and is checked by "a sub-pixel dot
can still be hovered". `TOUCH_PICK_FLOOR_PX` is **14 px**, about half a fingertip, and applies
only to coords a finger produced (`fat` on the coords). `getNodeAtPosition` takes the floor per
call, so widening one never widens the other. `TOUCH_TAP_SLOP_PX` is **10 px**, and under it *nothing happens at all* -- no pan, no inertia.
A release that never left the slop is a tap; one that did is a pan, and the decision is the
gesture rather than any timer. `TOUCH_DOUBLE_TAP_PX` is **24 px**: a second tap further away
than that is a fresh single tap, not a double.

**A tap must also have been one finger throughout**, tracked as `maxTouches`. A two-finger tap
selects nothing, and `touchstart` on a gesture already in progress must not reset what the
gesture is -- both were live defects found by an adversarial review pass and are now what the
harness's three gesture probes assert.

**Pan is one code path for both inputs.** `panFrom()` and `glide()` were extracted from the
mouse handlers rather than written twice, and the check is a number: the same travel must move
the camera by the same amount whichever input delivered it.

```bash
node scripts/mobile-check.mjs --device desktop    # the control: pointer, the suite's window
node scripts/mobile-check.mjs --device iphone14
node scripts/smoke.mjs --only "sub-pixel"         # the pointer's 1.5 px, unchanged
```

Measured 2026-09-07 on the demo fixture, 60 px of travel:

| viewport | pointer dx | finger dx | ratio |
|---|---|---|---|
| desktop 1600x1000 | 0.1460 | 0.1460 | **1.000** |
| iPhone 14 390x844 | 0.3142 | 0.3142 | **1.000** |
| Pixel 7 412x915 | 0.2945 | 0.2945 | **1.000** |
| iPad mini 744x1133 | 0.2618 | 0.2618 | **1.000** |
| a 320 px leaf | 0.3988 | 0.3988 | **1.000** |

And a tap delivers `pointerdown, touchstart, touchend` with **no synthesized click behind it**,
on every phone viewport -- the check that a tap selects once rather than twice.

Three gesture probes cover what a motionless tap cannot, all on the iPhone 14 viewport:

| gesture | required | measured 2026-09-07 |
|---|---|---|
| tap after a 5 px wobble | selects, camera held | **selected, camera held** |
| a 45 px swipe | pans, selects nothing | **panned, nothing selected** |
| a two-finger tap | selects nothing, camera held | **nothing selected, camera held** |

The first row is the one that matters: the first cut of the captor failed it while every other
number on this page looked right, because the harness was sending a tap with no movement in it.

## Either panel folds away at any width, and the resting layout does not move

Below 720 px the disc takes the rest of the viewport and the legend, search and view buttons
slide up as a sheet. The band and date strip stay on and can be put away, never overlaid,
because design/0010 puts the band in its own grid row precisely so it cannot collide with the
disc. Showing the band costs no dot size at all, 1.38 px median with it and without, since the
disc is fit to the narrower axis; its control row wraps below the breakpoint, or the stage clips
the second date field and All dates off the right edge. The
detail card becomes a sheet at the foot at 46% and both control clusters move to the top
corners, clear of it. design/0013.

**The cluster rides the disc's corner, and the movement is animated rather than designed out.**
It sits one `--panels-inset` inside the disc box's top-left, the corner where the year strip
meets the legend counts — and that corner moves, by 288px left when the folder list folds and
230px up when the calendar does. `glidePanels()` measures the box either side of the attribute
write and plays the delta out with `el.animate()` over 180ms, a transform so it costs no layout.
Measured 2026-09-08 at 1600x1000 with motion allowed: 11 interpolated transforms per fold,
opening at exactly `matrix(1,0,0,1,0,230)` and `matrix(1,0,0,1,288,0)`, easing to `none`. Under
`prefers-reduced-motion: reduce` it creates no animation at all and the fold snaps, which is the
sheet's own treatment — and the author's machine reports `reduce: true`, so the glide does not
play there.

**The panel cluster has its own inset, and `--controls-inset` is the wrong one to reuse.** The
plugin raises that variable to **44px** because Obsidian's status bar floats over the
bottom-right corner where `#vg-cam` sits (github#4). Nothing floats over the top-left, so
inheriting it pushed the toggles 44px into the disc for a reason that was never theirs — and the
standalone hid it completely, since there the variable is 12px and every check read 12. Reported
from a real vault, not caught here. `--panels-inset` is 12px in both hosts, and the check now
applies the plugin's own override before measuring: the toggles must hold 12/12 while the camera
cluster moves to 44/44. It fails without the fix with that exact line. github#82.

**A CSS transition cannot do it, and that was measured rather than assumed.** Inside
`#vg-canvas` the cluster's own `left`/`top` stay 12px and only the container moves; CSS has
nothing to interpolate. Re-anchoring to the root with the offsets in a `calc()` over published
edge variables was tried and dropped in favour of the animation, which needs no re-parenting.

**Proximity and stability are exclusive here.** Folding moves exactly the box's left and top
edges, so every placement near what it controls moves, and the only still ones are the bottom
corners `#vg-cam` holds. The view's own top-left was built and rejected — it matches `#vg-cam`'s
inset arithmetically and puts the buttons over the folder list they fold — as was the
bottom-right, which holds still and is 1500px from that folder list. github#82.

**Above the breakpoint the same two toggles fold the same two panels, and the sidebar is a
column rather than a sheet.** `[data-sheet="off"]` collapses the grid to `1fr` and takes
`#vg-sidebar` out of the layout entirely, so the width goes to the stage; the sheet's
`translateY` treatment stays inside the ≤720 px branch, which is why the desktop rules sit in
`@media not all and (max-width: 720px)` — the exact complement, so no fractional viewport width
falls into neither, and so a `display: none` scoped by an attribute cannot outrank the sheet
rules on specificity and kill the phone's sheet. `display: none` rather than a zero-width
clipped column for the same reason a closed sheet is `visibility: hidden`: a panel nobody can
see must not keep its controls in the tab order while its own toggle says
`aria-expanded="false"`. The band needs no branch at all — `[data-band="off"]` hides
`#vg-heat` and pins the stage row at every width. github#82.

**The two folds buy different things, and only one of them buys dot size.**
`matrixFromCamera` scales by `min(width, height)`, so at a landscape window the constrained
axis is the height the band is eating. Measured 2026-09-08 at 1600x1000 on the demo fixture,
1403 notes:

| state | canvas | drawn radius min/p50/max | under 2 px |
|---|---|---|---|
| both panels up | 1312x770 | 0.89 / **2.19** / 4.06 px | 515 of 1403 |
| band folded | 1312x1000 | 1.05 / **2.68** / 5.38 px | **232** of 1403 |
| band + sidebar folded | 1600x1000 | 1.05 / **2.68** / 5.38 px | 232 of 1403 |
| sidebar folded alone | 1600x770 | 0.89 / **2.19** / 4.06 px | 515 of 1403 |
| both back up | 1312x770 | 0.89 / 2.19 / 4.06 px | 515 of 1403 |

The band is worth 22% of the median radius and halves the sub-2-px population; the sidebar is
worth framing and not one pixel of radius. **The camera is not touched and needs none**: ratio
1.08 at 0.5,0.5 through all five states, because the ratio is dimension-independent and
`render()` → `resize()` re-frames the disc in the new box by itself. Auto-fitting on a fold
would fight *a manually moved camera is left alone by a visibility toggle*.

**The resting desktop layout is unchanged by all of this**, which is the other half of the
claim: sidebar 288x1000, stage 1312x1000, heat 1312x230, canvas 1312x770, radius
0.89/2.19/4.06 — identical before and after github#82.

**Panel state is persisted, and the page still stores nothing.** It rides decisions/0009's
channel like every other saved setting: `sheetOpen` / `onSheetOpen` and `bandOpen` /
`onBandOpen` on the deps object, `localStorage` in `shell.html`, `data.json` in the plugin, and
no settings-tab row — "is the folder list folded right now" is a fact about the window, and a
tab row for it would be a second UI for one state. **The absence of the dep is load-bearing:**
it means nobody has chosen yet, so the width decides the first open — a phone summons the
legend, a desktop keeps it beside the disc. A write happens exactly when a call is not `quiet`,
because the only quiet calls are the mount putting back what was stored. The known cost:
Obsidian's `data.json` is shared between desktop and mobile, so a desktop user who has toggled
the sidebar back on gives their phone a sheet open at mount. Closable, so a wart rather than a
defect. This **reverses** design/0013's "panel state is session state ... nothing is
persisted", and 0013 says so at the paragraph itself.

**A panel never covers its own toggle.** The panel buttons live in `#vg-canvas`, which the band
pushes down by its own height, so they land under a sheet that is anchored to the bottom. The
cluster therefore outranks the sheet, and a tap on the remaining disc closes the sheet too. The
harness asserts the round trip: press, what is under the toggle, press back.

```bash
node scripts/mobile-check.mjs --device iphone14      # "sheet toggle round trip"
node scripts/mobile-check.mjs --device desktop       # the same line, at every width now
```

Measured 2026-09-07 before the fix: `opened on; under it while open: #vg-sidebar; second tap ->
on`. After: `under it while open: the toggle; second tap -> off`. The probe **re-reads the
button's box between the two presses**, and that is not caution: folding a grid column slides
`#vg-canvas` and the cluster inside it left by the sidebar's whole width, so pressing where the
button used to be lands on bare disc and reads as a toggle that cannot be put back.

**Neither auto-close survives above the breakpoint.** `clickStage` and `select(id)` both put the
sheet away — right for an overlay a tap should dismiss, and at desktop it would mean clicking
bare disc or opening a note folds the sidebar for no reason anybody asked for. Both are gated
on `narrow()`, whose `NARROW_PX` is `page.css`'s breakpoint duplicated on purpose and must
match it — the same deal decisions/0009 records for `SLOT_NAMES`, and for the same reason:
everything lives inside `mountVaultGraph`, so there is nothing to import. The check asserts the
round trip rather than the reasoning.

```bash
node scripts/smoke.mjs --only "panel toggles"   # "fold each panel away and give the space back"
```

**Two more traps, both measured rather than reasoned.** With the band hidden, `#vg-canvas` inherits
the stage's `auto` row and collapses to **zero height**, because every child of it is absolutely
positioned -- the row is pinned to `1fr` instead, and `[data-band="on"]` restores `auto 1fr`.
And both panels change the canvas box without changing the root's, so neither the engine's
window listener nor the page's root observer fires: every toggle calls `refreshSizeScale()`,
`placeLogo()` and an explicit `renderer.refresh()`.

```bash
node scripts/mobile-check.mjs --device iphone14 --shot after.png
node scripts/mobile-check.mjs --device desktop        # resting layout must be unchanged
node scripts/smoke.mjs --only "camera cluster"
```

Measured 2026-09-07, demo fixture, 1403 notes:

| | before | after |
|---|---|---|
| iPhone 14, disc box | 390x260, 31% of screen | **390x564 with the band, 390x844 without** |
| iPhone 14, dot radius p50 | 1.10 px | **1.38 px** |
| iPhone 14, dots under 1 px | 496 of 1403 | **153 of 1403** |
| Pixel 7, dot radius p50 | 1.19 px | **1.43 px** |
| desktop, sidebar / disc box | 288x1000 / 1312x770 | **unchanged** |
| desktop, dot radius min/p50/max | 0.89 / 2.19 / 4.06 px | **unchanged** |
| iPad mini (above the breakpoint) | 456x903 | **unchanged** |

Every dot on a phone is still under 2 px: the disc is fit to the narrower axis, so the extra
height buys margin rather than radius. The catchment is what makes a tap work; more radius
needs a filter or a zoom.

## A note cannot close the data script it is serialised into

The standalone exporter inlines the whole vault as one `<script>window.VAULT_DATA=…;</script>`
element, and `JSON.stringify` does not know it is inside HTML: it leaves `<` alone, so a
frontmatter value carrying a literal `</script>` closed that element early. Everything after
it was parsed as markup, a following `<script>` ran as script, `window.VAULT_DATA` never
existed, and the page failed on its first read of `nodes`. Any exported string can carry it —
`type`, a tag, the vault's own folder name on a filesystem that allows `<` — and a note only
has to *contain* the substring, not mean anything by it (github#96). The plugin passes its
data as an object and was never exposed.

Measured on a three-note synthetic vault whose `Marked` note declares
`type: "</script><script>window.__vg_escaped_type=1</script>"` and a tag of the same shape,
opened from disk in Chrome:

| | before | after |
|---|---|---|
| data script closes after | 149 chars in | at its real end, 951 chars in (30 of them the escapes) |
| marker scripts that ran | both | none |
| `window.VAULT_DATA` | undefined | 3 notes, both markers intact as text |
| page exceptions | `SyntaxError`, then `TypeError` reading `nodes` | none |
| `__vg.graph.order` | no mount | 3 |

Fixed with `jsonForScript()` in `src/build-graph.mjs`: `JSON.stringify` followed by
`.replace(/</g, "\u003c")`. The result is still JSON — `JSON.parse` decodes the escape —
and still the JavaScript the browser evaluates, so nothing reading `window.VAULT_DATA`
changed, including `check-build-order-determinism.mjs`, which regex-extracts the element and
parses it. Escaping `<` alone is enough: it is the only character that can open a tag or an
`<!--` in script data, and `>`, `&`, U+2028 and U+2029 are all inert there. Every
`window.VAULT_*` assignment goes through the helper, the logo mask included, so the rule is
"no inline data script carries a raw `<`", not "the data script escapes `</script>`".

```bash
node scripts/check-data-escape.mjs
node scripts/smoke.mjs --only "closing-script"
```

Two guards, one shape each:

- **Static, in the pre-push hook, no skip flag**: builds the payload vault, asserts no inline
  `window.VAULT_*` script contains a raw `<`, parses the data back and asserts both marker
  strings decode verbatim; and reads the exporter's own source to assert `VAULT_DATA` still
  goes through `jsonForScript(`. On the unfixed exporter it prints two FAIL lines: the source no longer routes through the helper, and six raw `<` in the data script -- the parse itself still succeeds, since a raw `<` is valid JSON, which is why the count of `<` is the assertion and not the parse.
- **In the suite**: builds the same vault, opens it in a second tab of the run's own Chrome
  (`Target.createTarget` from the page session — the first check to do so), and asserts no
  marker ran, the data decoded, and the graph mounted all three notes. This is the
  acceptance criterion as written: an actual generated file, opened.
## A folder can be named after anything on `Object.prototype`

`"a folder named after an Object.prototype member still lays out"` builds seven tiny vaults
once per run — one-note vaults in folders named `constructor`, `toString`, `hasOwnProperty`
and `__proto__`, one vault holding all four beside a plain folder, an empty vault, and a plain
one-note vault — navigates the running page to each, and asserts that the page reached ready
with no exception, the busy indicator is hidden, every note has a finite position, every
folder is a group, every note is shown, and `checkPlanParity()` agrees with itself. Then it
navigates back to the fixture page and waits for rest, so the checks after it start where
they always did.

The planner's maps are indexed by folder names, and a plain `{}` inherits `Object.prototype`:
`byCell["constructor"]` is a function before anything was stored, so the `if (!byCell[mKey])`
initialisation is skipped and `byCell[mKey].push(mId)` throws. Measured on `develop@f5e18f0`
(github#97, 2026-09-11): the four names and the combined vault all died at boot with
`TypeError: byCell[mKey].push is not a function`, the page never reached ready and the busy
indicator stayed up, while the two controls loaded clean — **2/7 pages**. Every map keyed by
a group name is now `dict()` (`Object.create(null)`): `count`/`counts`, `byCell`, `cellsOf`,
`groupInner` and the ring balancer's `assign`, `groupNotes`, `pinnedInner` — **7/7 pages on
all three fixtures**. The maps keyed by node id (`pos`, `out`, `from`, `hubOut`,
`neighbourCache`) stay plain: ids are integer strings and cannot collide with a prototype
member.

`__proto__` is the odd one, twice over. It starts with `_`, so it is an archive folder and
hidden by default — the check shows it explicitly through `setFolderShown` before judging,
and asserts `shown` equals the note count so a hidden group cannot pass as laid out. And a
plain object treats that key specially in both directions, measured in node 24: the literal
`{ "__proto__": true }` sets the prototype and has **no keys**; `Object.assign({}, m)`
**drops** the key on the way out; `JSON.parse` and `Object.assign(Object.create(null), m)`
both keep it as an own property. So the four places the page hands the host a copy of a
settings map (`saveFolderColors`, `saveSubfolderColors` twice, `saveFolderShown`) copy onto
`dict()`, and the plugin's settings tab copies onto a null-prototype map as well and reads
`folderColors[name]` through an own-property check. Without that, marking a `__proto__`
folder as shown by default was dropped on the way to `saveData` and forgotten on the next
load, and a `constructor` folder's colour row read `Object` as its pinned slot.

```bash
node scripts/smoke.mjs --only "Object.prototype"      # 7 pages per fixture, ~7s each
```

The layout equations were not touched: the golden snapshots on all three fixtures are the
proof, and the check itself asserts plan parity on every page that has a plan.
## A tree is gated once

A green full run of the suite (no `--only`, `--vault`, `--url` or `--fast`, every fixture, no
modified tracked files) stamps the git **tree** it measured together with the four fixtures it
ran against (`scripts/suite-stamp.mjs`, one JSON file per tree under `suite-passed/` in the
shared git common dir). `.githooks/pre-push` and `scripts/release.ps1` skip the suite when every
commit in front of them carries a stamp against the fixtures now in the store, and print the
run they trust. A partial run never stamps; a dirty tree never stamps; a stamp whose fixture
has been regenerated, or whose unpinned fixture is older than the seven-day refresh, misses.
A fixture is reused only when its stamp matches **and the vault is still usable**: the demo
fixture was found on 2026-09-11 with all twenty note folders and a valid stamp but **no
`.obsidian`**, which `build-graph.mjs` refuses at the vault root, and a freshness test that read
only the stamp handed that back to every run for ever — six jobs dead, 0 of 107 on that fixture,
in every worktree, until someone deleted the directory by hand. `gen()` tests for `.obsidian`
now, so a half-written fixture is rebuilt rather than reused (github#86).

A run in which a fixture could not be generated never stamps, and a stamp naming fewer than
every fixture in `FIXTURE_NAMES` misses (github#103) — **four names since github#86 added the
tag-organised fixture**, because a list that lags the suite is the same hole in a new place: the
three older fixtures would go green, the run would stamp, and the hook would skip the suite for a
tree the tag disc was never measured on. Both callers require the pass line, not exit 0 alone:
the CLI realpaths itself against `argv[1]`, because through a junction (every Orca worktree)
the two paths differed, the body never ran, and an empty exit 0 read as a stamp on every push.

```bash
node scripts/suite-stamp.mjs --selftest       # hit on the same tree from a different commit, miss otherwise;
                                              # a missing fixture (either of two cases) refuses to record,
                                              # a short stamp misses,
                                              # and the CLI answers through a junction
node scripts/suite-stamp.mjs check [<rev>]    # what a push of <rev> would do, and why
node scripts/smoke.mjs --only "intro landed"  # ends with "not stamping this run: --only is not the full suite"
```

Why (github#93, decisions/0013): every release paid the suite more than once against one tree.
`main` only ever receives `develop` — the ruleset requires a pull request with no bypass actors
— and the merge commits for 2.3.0, 2.4.0 and 2.4.1 each have a tree byte-identical to the
`develop` tip they merged, so a run on either measures the same content. Re-driving Chrome for
identical content is cost with nothing it could catch that the first run would not.

Measured 2026-09-10, one full run under the `suite` lock, 94/94 on all three fixtures:

| Phase | Wall |
|---|---|
| build three pages | 8 s |
| parallel lane, 4 Chromes, 60 checks per fixture | 133 s |
| serial lane, 1 Chrome, 34 frame-sensitive checks per fixture | 446 s |
| **total** | **587 s** |

The static gates ahead of the suite total 10.5 s (lint 6.3 s). The PR into `main` is not a
suite run: its one required check took 4 s on #95. `release.ps1`'s `git push origin HEAD` —
gone since github#94, since the ruleset refuses it — ran nothing after a website merge either:
an up-to-date push hands a pre-push hook zero ref lines (tested against a bare remote), and a
tag push is never gated. Tonight's two `develop` pushes landed 21 s and 29 s after their merge
commits, so both were skipped by hand; the stamp is the same skip with a record of what it
trusted.

Keyed by tree and not by commit because the merge into `main` is a new commit by construction
while its tree is not; not by time because `develop` moves several times a day and "a recent
green run" cannot say which tree it saw. While it runs, both gates hold the machine-wide
`suite` lock (`scripts/lock.mjs`) and release it on every exit path; a lock that cannot be had
blocks the push and names the holder rather than running on top of it.
