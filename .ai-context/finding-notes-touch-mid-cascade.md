# Notes touch during a cascade

Reported as "notes touch during animation because some become very big early", then as "it really
does not look good when you do certain timeline moves". Investigated on
`investigate/node-overlap-animation`, entirely by measurement (`scripts/probe-dotsize.mjs`,
`scripts/probe-dotwhy.mjs`, `scripts/probe-trace.mjs`).

**Two independent defects. The reported cause is real but is the smaller one.** Dots do get very
big early — up to 1.81x, on frame 1, on every year chip. But that is not what makes the notes
touch, and the animation where the touching is worst has *zero* inflated dots.

**And it is not a transient.** On a folder toggle, dots are intersecting on **100% of the frames
the cascade is busy for**, with a median of 758 pairs merged. On the intro, 87% of frames, median
964 pairs, one unbroken run of 4.3 seconds. That is the animation's steady state, not a blip.

Neither defect is a regression: `main` (f50acbb) measures the same on the same fixture.

## How bad, per animation — 10k vault, normal speed

| animation | worst intersecting pairs | worst depth | frames overlapping | median pairs while dirty | dots over 1.05x |
|---|---|---|---|---|---|
| intro / Refresh growth | **1,747** | 108.8% of the local step | 87% (4.3s unbroken) | **964** | **0** |
| folder toggle (`02 - Areas`) | 1,080 | 68.4% | **100%** (2.2s) | 758 | 0 |
| year chip (worst of 11) | 199 | **212%** (−402u) | 81–95% | 100–226 | 0–1,599 |
| range squeeze to last 2.5% | 241 | 145% (−292u) | — | — | 1,147 |
| at rest, any state | 1 | 1.7% | — | — | 0 |

"212% of the local step" means one dot's centre is past the far edge of the other: the two are
drawn as a single blob. The worst pair on a year chip is notes 2503 and 3191, both
`05 - Meeting Notes`, both at r6365, 0.7° apart — dots of radius 232u and 227u with centres ~78u
apart, **both at or below their resting size**.

The intro is the row that matters most: it plays on every load and every Refresh, it is the
longest animation the page has, and it has no size involvement at all.

## Why the suite never sees it

`filtered to the bone, the disc stays drawable` is the only overlap check, and it is taken at rest
on purpose — `settle()` plus a 600ms beat, with a comment recording that notes in flight
"reported 16 overlapping pairs at -78 units on a disc that has none at rest". That reading was
correct; treating it as a measurement artefact was the mistake. The beat makes the defect
invisible, and there is no per-frame overlap check at all — `animation.md` says the per-frame step
"stays manual on purpose".

It also buckets by radius and compares tangential neighbours, which structurally cannot see a pair
touching *across* a row boundary. 97% of the touching pairs are radially separated.

## Defect 1 — the row ticks at once, the spacing that pays for it walks all animation

`r = (base + row * SP) * scale`. `SP` is walked continuously between the two endpoint packings.
`row` is `Math.floor(pp)` — an integer, ticking the instant the cell's fractional row count
crosses.

At rest the two are consistent by construction (band thickness `T = rows * SP`). Traced at the
source for note 3997 across a `02 - Areas` toggle (`probe-trace.mjs --what place`):

| | base | SP | row | rows | rr |
|---|---|---|---|---|---|
| rest, before | 39.781 | 1.000 | 7 | 23 | 46.781 |
| rest, after | 39.781 | 1.150 | 6 | 20 | 46.681 |

The resting radius barely moves — 0.1 lattice units, ~16 graph units — because the row losing one
and the spacing gaining 15% cancel. **During the cascade they do not cancel, because they do not
move together:**

    rows 22.986  SP 1.001  row 7   rr 46.786
    rows 22.979  SP 1.001  row 6   rr 45.787   <-- ROW TICK, rr steps a full SP
    rows 22.972  SP 1.001  row 6   rr 45.789
    ...
    rows 22.304  SP 1.035  row 6   rr 45.990   (still ~0.8 units short)

The tick happens within the first few frames of ~60. The spacing that compensates for it only
finishes walking at the end. So the note sits **up to one full row pitch (160 graph units) inside
its correct radius for most of the animation** — which is why the overlap lasts for 100% of the
busy frames instead of flashing.

Measured from outside, the same thing:

- **1,284 notes** (folder toggle) and **7,859** (intro) more than 40u outside the corridor between
  their two resting radii; worst 0.87 of a pitch on a toggle, 2.5–12.5 pitches on a range change.
- Tightest drawn row pitch in a single angular column: **8u against a resting 120u**, while the
  *median* pitch holds near its resting value. The lattice as a whole is fine; individual columns
  go out of step. Dots are ~48u radius, so 8u apart is total overlap.
- The trajectory of one note: rest 7469 → **7341** at 79% → rest 7485. 128 units below *both*
  resting radii, then eased back as its row finally settles.

`RADIAL_EASE` shapes the recovery but is not the cause — the excursion is in the target.

The suite already sees the tick and deliberately does not assert on it. `a range change animates
instead of snapping` reports, on its own "Context, not asserted" line:

    worst single note 164 at 25% through, mean note 8/frame

164 units is one row pitch, in one frame, on one note. That line is this defect, already measured
and already printed on every run — read as a frame-pacing artefact rather than as a note leaving
its lattice.

This is the failure mode `animation.md` already names: *an integer, or a set membership,
recomputed per frame*. `maxRowR` and `solveBand`'s `rows = round(T/s)` are on that file's own
"still derived per frame" list. This is the same class, on the term that decides radius.

## Defect 2 — `edgeCap` is measured with the destination's band room

Separate, and this one *is* about size. It is what the report saw.

On frame 1 of a range cascade or a year chip, several hundred dots step to as much as **1.81x**
their resting radius, hold it flat for the whole animation, and drop back at the end. A step, not
a ramp — frame 1 is 1.00x, frame 2 is 1.74x:

    year 2018:  116ms 1.74x   179ms 1.74x   235ms 1.74x   300ms 1.74x ...

478–1,599 of 10,002 notes per cascade, in the sliver folders (`08 - Archive`,
`09 - Maps of Content`, `11 - Clippings`, `15 - Courses`).

`__vg.dotWhy(id)` says every term of `dotPx` is identical between rest and frame 1 except one:

    8705  out 0.76 -> 1.32 (x1.74)  edgeCap 23.16 -> 49.72  bandRoom 111.25 -> 111.25  cellRoom 116.67 -> 116.67  pitch 120.15 -> 120.15  rampV 1.55 -> 1.55

`__vg.traceOn(id)` then decomposes `edgeCap` itself. `dEdge = min(mgA + spanArc*u, mgB +
spanArc*(1-u)) * rGraph`, and `mgA/mgB = side() = (clear + DOT_OF_PITCH * room * f) / rGraph`:

    rest vs endpoint-A (endpoint-A is meant to describe rest):
      u              1        ->  1              same
      arc            1.097    ->  1.097          same
      rGraph         4521.245 ->  4521.245       same
      nRow           41       ->  41             same
      mgA            0.006    ->  0.012          x2.1465  <-- DIFFERS
      mgB            0.005    ->  0.011          x2.1465  <-- DIFFERS
      sideRoom       111.247  ->  238.796        x2.1465  <-- DIFFERS
      dEdge          23.163   ->  49.721         x2.1465  <-- DIFFERS

**238.796 is the band room of the destination state** — identical to 13 digits with the resting
`bandRoom` measured *after* the cascade finishes. The pass sequence says how it got there:

    #  what      tag          roomIn    roomOut   roomNow?
    4  pass      rest         111.247         -    NO
    5  passEnd   rest         111.247   111.247
    6  pass      (none)       111.247         -    NO      <-- destination resting layout ...
    7  passEnd   (none)       238.796   238.796            <-- ... WRITES 238.796
   10  pass      endpoint-A   238.796         -    NO      <-- the SOURCE endpoint reads it
   11  passEnd   endpoint-A   111.247   111.247            <-- and then measures the right one
   14  pass      frame        238.796         -    yes
   15  passEnd   frame        111.247   111.247            <-- overridden before placement: fine

`roomIn` is recorded at ringsLayout's ENTRY, before the `roomNow` override runs, so a frame's
entry value looks stale even though the override then corrects it. Only the (roomIn, roomOut)
pair says whether a pass actually placed with the wrong number. **Frames are fine** — an earlier
draft of this file claimed the first frame was stale too, which was a misreading of the
instrument, not a measurement.

Pass 10/11 is the defect, and it is precise: endpoint-A **enters** with the destination's room
and spends its margins against it, then **measures** 111.247 — the right value for planA. So the
room WALK (`roomSrcB`) is correct and only the margins, hence `edgeSrc`, are wrong.

A range change lays out the destination at rest *before* starting the cascade. That pass writes
`bandOf().room`. `roomOf(planA)` then runs with `roomNow = null`, so it has no override and
`side()` reads the module variable — now holding the destination's value. planA's margins, and
therefore `edgeSrc`, are computed from the wrong room.

`ringsLayout`'s own opening comment states the hazard exactly:

> BEFORE ANY PLACEMENT, because the margins are spent during it. Assigned at the end of the pass
> — which is where the measured value has to be written — the margin would be reading the previous
> pass's number, which is the staleness this override also removes.

The `roomNow` override fixes it for frames. `roomOf` deliberately clears `roomNow` so each
endpoint measures its own room — and thereby opts the endpoint passes out of the fix.

Two consequences, both visible:

1. the step on frame 1;
2. it never comes down. Where the destination has no `edgeCap` for a note, the walk's `b1 = a1`
   fallback (`src/page.js`, `edgeNow`) holds the wrong source value flat for every frame.

`animation.md` states "the last frame of a cascade must be identical to the resting layout". There
is no equivalent for the **first** frame, and that is where this lives.

## Reproducing

    node scripts/probe-dotsize.mjs --vault <10k> --scale 1                        # every folder
    node scripts/probe-dotsize.mjs --vault <10k> --scale 1 --range                # date ranges
    node scripts/probe-dotsize.mjs --vault <10k> --scale 1 --years                # year chips
    node scripts/probe-dotsize.mjs --vault <10k> --scale 1 --growth               # intro / Refresh
    node scripts/probe-dotwhy.mjs  --vault <10k> --id 8705,8198,53                # which dotPx term
    node scripts/probe-trace.mjs   --vault <10k> --id 8705 --what edge            # which side() term
    node scripts/probe-trace.mjs   --vault <10k> --id 8705 --what pass            # which pass wrote it
    node scripts/probe-trace.mjs   --vault <10k> --id 3997 --what place --move folder

`probe-dotsize` measures every pair through a uniform grid rather than per radius bucket, and
reads dot radius through `renderer.scaleSize` per the trap `animation.md` names. `probe-trace`
needs `__vg.traceOn`, which exists only on this branch.

## Measurement caveats, so the numbers are not over-read

- **The radial-excursion figure does not apply to the intro.** Growth starts and ends at the whole
  vault, so a note's two resting radii are the same number and the "corridor" is a point: the
  20.5-pitch excursion there is the disc legitimately growing. The *overlap* and *pitch-collapse*
  numbers for the intro stand on their own — they are facts about drawn pixels.
- **The median dot radius is taken over stayers only.** Over everything drawn it is dominated by
  the thousands of fading notes on a big range change, which made it look like the median dot
  shrank to a third and then jumped 7x at the end. That was the set moving, not the disc.
- **Per-column pitch, not per-folder.** A folder split into sub-wedges places them independently,
  so clustering a whole folder's radii reports the gap between two sub-wedges as a collapsed
  pitch. Keyed by folder *and* a 2° slice.
- Overlap counts only notes at alpha ≥ 0.35. A pair at alpha 0.02 is not a smear.

## What is NOT wrong

- Sizes at rest, on every state measured.
- The resting lattice. `the resting disc is on the lattice` passes; median drawn pitch holds
  throughout an animation.
- Fading notes. 100% of the intro's touching pairs and 81% of a toggle's are notes present at rest
  at **both** ends.
- Easing. `RADIAL_EASE` shapes the return, not the excursion.

## Loose end

At rest on `develop` the 10k vault reports one intersecting pair at 1.7–1.8% of the local step;
`main` reports none. Far under the suite's 4% tolerance and unrelated to the above, but it is a
difference between the branches and it is written down so it is not rediscovered.


## Fix status (branch `fix/cascade-overlap-41`, github#41)

### Defect 2 — FIXED

`roomOf` runs each endpoint twice: pass one measures that packing's own room, pass two places
against it. So `side()` no longer spends its margins against whatever the previous pass left in
`bandOf().room`.

Verified at the source — every term of `dEdge` now agrees between rest and the endpoint pass:

    rest vs endpoint-A       before            after
      mgA          0.006 -> 0.012  x2.1465     0.006 -> 0.006  same
      mgB          0.005 -> 0.011  x2.1465     0.005 -> 0.005  same
      sideRoom   111.247 -> 238.796 x2.1465  111.247 -> 111.247 same
      dEdge       23.163 -> 49.721  x2.1465   23.163 -> 23.163  same

And end to end, across all eleven year chips on the 10k vault: **worst overshoot 1.81x -> 1.08x**.
On one named dot (note 8198, `08 - Archive`, resting radius 23.2u) captured mid-cascade with
identical framing on both branches: **41.5u -> 23.9u**, against 23.2u at rest.

Cost: two extra layout passes at cascade start, none per frame. Full suite 37/37 on the 10k
fixture, `the resting disc is on the lattice` unchanged.

**It is not visible in a still frame.** The notes this defect inflates are the ones `edgeCap`
pins — lone notes near a wedge edge, resting radius ~23u where the median dot is ~48u — so 1.8x
of tiny is still small, and at 10,000 notes a 460px crop of before and after are
indistinguishable by eye. The defect is real, measured and now gone; the *picture* of it is a
number, not a pixel.

### Defect 1 — NOT FIXED. Three attempts, all measured, all worse

See the long note on `placeCell`'s row assignment in `src/page.js`. Summary of what was tried
and what it measured, on `02 - Areas` at timeScale 8, pairs per busy frame:

| | p25 | p50 | p75 | p90 | max | mean |
|---|---|---|---|---|---|---|
| as shipped | 62 | 127 | 170 | 187 | 225 | **117** |
| walk the row, radius only | — | — | — | — | 2,138 peak | worse |
| walk the row, radius and angle | 7 | 31 | 571 | 803 | 1211 | **323** |
| ...plus pinning arrivals | — | — | — | — | 3,664 on the intro | much worse |

The middle row is the trap: it looks like a 4x win on any statistic conditioned on "frames that
have an overlap at all" (median dirty-frame pairs 758 -> 21) and is a **2.8x regression on the
mean over every busy frame**. Conditioning on dirtiness while the dirty set changes is not a
comparison. The distribution is what settles it.

The reason it cannot work is structural: when a cell loses a row its notes have to
**redistribute**, and a walk only translates them. A note whose row goes 7 -> 6 closes on the
note whose row stays at 6 — from a full pitch apart to nothing — and does it gradually, so it
spends the whole animation arriving instead of one frame. The integer tick is ugly for one
frame; the walk is wrong for a hundred.

Whatever fixes this has to keep the row assignment discrete while making the **spacing** absorb
the tick, so the two cancel per frame the way they already cancel at rest.

## The experiment, brought onto develop (`feature/per-frame-dot-size`, 2026-09-06)

The ten commits of `experiment/per-frame-dot-size` (off `fd7e461`) were re-applied onto
`develop@fc7d157` by cherry-pick. Every `src/page.js` hunk conflicted -- the page was typed
(github#55, github#60), its comments cut to pointers (github#61) and its renderer replaced
(github#58) in between -- so the page-side pieces are written again in that style; the scripts and
this note came over as they were. Two commits were dropped because their fix had landed:
`fec9d25` (github#53, on develop as `bacfc64`) and `b407e51` (github#41, closed). The frame
harness and the write-up `b407e51` carried are kept. **One thing to check before trusting the
"landed" for github#41:** develop's `roomOf` (the endpoint pass under `cascade()`) lays each
endpoint out once, and no commit between `fd7e461` and `fc7d157` names the two-pass change
described above under "Defect 2 -- FIXED". `probe-dotwhy.mjs` answers whether `edgeCap` still
steps on frame 1; it was not run for this rebase (another session held Chrome).

### What the experiment is

Every other cap in `dotPx` is a statistic over a **packing** -- the band's tenth-percentile room,
the cell's tightest pair, the note's distance to its own wedge edge. All of them describe where the
layout meant to put things, and during a cascade that is not where things are (Defect 1 above).
`measureFit` asks the other question: how much room does this note have **right now**, from the
drawn positions, per note, per frame. Each dot is capped at `FIT_SHARE` (0.46) of the distance to
its nearest visible neighbour (alpha >= 0.35), found through a uniform grid one row pitch wide.
The cap sits at the end of `dotPx`, above the pixel floor and beside github#66's `sizeCap`; both
only ever lower a size.

Two differences from the per-note cap that was tried and reverted before (see the note on
`dotFit`): it is a full 2-D nearest neighbour, not a within-row one, so it does not jump when a
note's nearest row-neighbour changes; and it depends on positions only, so there is no loop
between sizes to oscillate in.

The map is lazy: `posVer` is bumped **once per pass** by every writer of x/y (the cascade frame,
`assignPositions`, the tween) and `dotPx` re-measures when it is stale. Bumping per node instead
makes the recompute fire per node -- O(n^2), measured as a toggle falling from 148 frames to 46 at
2,001 notes and the tab going down at 10,002.

### How it is driven

| | |
|---|---|
| `?fit` | arms the cap at boot. **Off by default on this branch** -- develop's law (below) is what the page does unasked. |
| `?slow=3` | time scale at boot (default 1.25), so two takes are slowed the same. Works with or without `?fit`. |
| `__vg.fitCap`, `__vg.fitShare` | the live toggle and the share, no reload. |
| `?demo` acts `yearchip`, `only05` | clip-only acts: the year chip that still overlaps with the cap off, and a solo of an inner-band folder. |
| `scripts/probe-dotsize.mjs --fitcap on\|off`, `scripts/shoot-cascade-frame.mjs --fitcap on\|off` | the same build measured or shot in both modes. |
| `scripts/probe-dotwhy.mjs`, `__vg.traceOn/traceRows/traceOff`, `__vg.dotWhy` | the investigation accessors, additive. |

Measured on the original branch (10k fixture, `02 - Areas`, cap on against off): intersecting
pairs per busy frame mean 631 -> 0, p90 1085 -> 0; per-frame radius change p90 0.01px -> 0.45px,
worst frame 0.36px -> 1.36px, no note ever moving more than 2px; median dot dips ~15% mid-walk
(48.4 -> 41.3) and recovers; resting disc untouched (median 49.4 at the start, 47.5 at the end,
either way). 57 frames per cascade against 50.

### Where it contradicts the laws

- **"A dot never outgrows its two resting sizes while a cascade walks" (github#66, CLAUDE.md).**
  The letter holds: the cap only lowers a size, so `--only outgrows` cannot fail because of it.
  The spirit does not: the law says a walking dot's size is bounded by what the two packings give
  it, and the experiment sizes dots from the frame instead. Mid-walk a dot goes **below both** of
  its resting sizes and grows back as its neighbours clear -- the shrink-then-grow motion github#66
  was filed against, in the other direction. The two-resting-sizes bound and the per-frame cap are
  two answers to the same question, and a page that ships both is not sizing dots from one model.
- **"A zero-weight member costs nothing: a fading note changes no plan, no row, no room" (ADR
  0006).** A note under alpha 0.35 is excluded from the measurement, so a near-zero note costs
  nothing. A note between 0.35 and 1 is not excluded: while it fades in or out it shrinks the dots
  around it. No plan, row or room changes; a **size** does, which is what the law's "costs nothing"
  was written to rule out.
- **"A settled dot is the size a fresh relayout gives it."** The check passes, because a relayout
  puts every note where it already is and the cap reads positions. But the resting size is no
  longer the packing's alone: the band room is a tenth-percentile statistic, so the tightest tenth
  of pairs are closer than it, and the cap can bind on them at rest. On the 10k fixture it measured
  as not binding (medians above); on a smaller vault it may.

The golden layout snapshots are unaffected either way -- the cap never moves a note -- and pass on
all three fixtures with the experiment disarmed (2026-09-06).
