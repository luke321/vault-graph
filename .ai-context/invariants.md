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

## The rings are independent

Toggling an inner-band group must not move the outer band. Measured, an `05` toggle
leaves the outer band constant — 0 units of movement.

## Only depth-1 subfolders with their own tint slot are pushed

A group or a *named* subfolder moves as a block when highlighted. Pooled tail subfolders
and everything at depth 2+ get the ring only, because their notes are interleaved with
cell-mates at the same angles and pushing a subset slides it out *through* them.

```javascript
__vg.pushReport()           // pushedCount / pushedByPath vs haloedByPath
```

`03 - Resources/Locations` is the case that settled it: 3 notes, seventh in the order,
sharing the tail slot with six others. `pushedCount` must be 0 when it is selected.

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

`renderer.refresh({ skipIndexation: true })` tells Sigma "nothing moved, do not rebuild the
spatial index". Inside `hlWalk` that is true by construction: its loop writes `hl[id]` and
nothing else, so it earns the flag and needs it — it runs every frame of a ramp.

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

## Hover re-arms after the pointer leaves the stage

Hover a note, move the pointer off the canvas entirely, move back onto **the same note**.
It must light up again.

```bash
node scripts/smoke.mjs      # "hover re-arms after the pointer leaves the stage"
```

It did not, for as long as this project has existed. Sigma's `handleLeave` emits
`leaveNode` without clearing its own `hoveredNode`, so on re-entry
`hoveredNode !== nodeAtPosition` is false and nothing is emitted — glance at the sidebar,
come back to the note you were reading, no highlight. `src/vendor.mjs` patches it at read
time; `handleMove`, two lines earlier in the same bundle, always did it correctly.

It is also what made this suite flaky, which is the more expensive half of the story: the
hover checks failed whenever anything earlier had moved the pointer off the canvas.
Measured on the 450-note vault by repeating the hover: **1 hit in 40 before, 40 in 40
after.**

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

## The date axis weighs years by note count, not by calendar time

`compactAxis` (default on, github#23) gives each calendar YEAR a width between
`YEAR_FLOOR_MS` (about one month) and `YEAR_CEIL_MS` (about one real year), scaled by that
year's own note count against `yearRef` — the same p90-with-floor shape `nRef` already uses
for bar height, applied here to note count per year instead of per month. Within a year,
every one of its months gets an equal share of the year's own width — deliberately NOT
weighted by the month's own note count; that was tried and read as noise.

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

## Animations are a fixed length, unless the page can't draw them

Durations are wall-clock (`TIMELINE_MS` 4500, `CASCADE_MS` 1600, `TWEEN_MS` 380), so
frame rate does not change how long a toggle takes. Below ~20fps the per-frame advance
clamps and the animation stretches rather than leaping.

**Every animation force-completes on stalled frames, never on a deadline.** A fixed
`setTimeout(settle, dur + margin)` fires part-way through on any page too slow to finish
in time and snaps the disc — this exact bug has been introduced twice. Watchdogs re-arm
while frames keep arriving.
