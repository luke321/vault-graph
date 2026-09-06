# Per-frame dot size

**Status** shipped in 2.0.0 as the view setting **Size dots from the frame**, on by default (merged from `feature/per-frame-dot-size` on 2026-09-06; `?nofit` turns it off on the page) · github#41

> Every dot capped at just under half its distance to the nearest visible note, measured on
> the frame being drawn rather than on the packing -- and where that stands against the
> two-resting-sizes law.

## The question it answers

Every other cap in `dotPx` is a statistic over a **packing**: the band's tenth-percentile
room, the cell's tightest pair, the note's distance to its own wedge edge. All of them describe
where the layout meant to put things. During a cascade that is not where things are: a note's
row is an integer that ticks in one frame while the spacing that pays for it walks the whole
animation, so rows slide out of step and dots drawn for the resting lattice fuse
(`finding-notes-touch-mid-cascade.md`, defect 1). Measured on the 10k fixture's 2016 year chip:
216 intersecting pairs at once, worst clearance -334 units, dots merged into sausages.

`measureFit` asks the other question -- how much room does this note have **right now** -- and
takes the answer from the drawn positions, per note, per frame.

## How it works

- **Who counts.** Every note with alpha at or above 0.35. A dot at alpha 0.02 is not something
  to make room for, and shrinking a stayer for one would make the disc breathe as notes fade.
- **Nearest neighbour** through a uniform grid one outer row pitch wide, so the 3x3
  neighbourhood holds anything closer than a pitch; nothing further matters, since no dot is
  drawn bigger than `DOT_OF_PITCH` of one. A note with nothing within a pitch is left uncapped
  rather than handed a cap taken from the grid's own reach.
- **The cap.** `FIT_SHARE` = 0.46 of that distance, converted to pixels through the band's ramp
  top -- each of a pair takes just under half the gap between them, the only share that cannot
  overlap without knowing the other's size. It sits at the end of `dotPx`, above the pixel
  floor for the same reason `edgeCap` is (a dot that cannot be both visible and separate is
  drawn separate) and beside github#66's `sizeCap`. Both only ever lower a size.
- **Laziness.** The map is keyed on `posVer`, which every writer of x/y bumps **once per
  pass** -- the cascade frame, `assignPositions`, the tween -- and `dotPx` re-measures when it
  is stale. Bumping per node instead makes the recompute fire per node: `mergeNodeAttributes`
  raises a graph event the renderer answers by re-reading display data, which reaches `dotPx`.
  That is O(n^2); at 2,001 notes it cut a toggle from 148 frames to 46, and at 10,002 it took
  the tab down hard enough to drop the CDP socket.

Two differences from the per-note cap that was tried and reverted before (the note on
`dotFit`): this is a full 2-D nearest neighbour, not a within-row one, so it does not jump when
a note's nearest row-neighbour changes while a closer note sits one row away; and it depends
on positions only, so there is no loop between sizes to oscillate in.

## How it is armed

| | |
|---|---|
| `?fit` | arms it at boot on the standalone page, through the door `?rest` and `?rowarc` use. A recording can only click what the page puts on screen, so a flag a recording has to reach cannot live only on `__vg`. |
| `deps.fitCap` / `api.setFitCap` | the plugin's view has no URL, so its "Size dots from the frame (experiment)" setting passes the flag in and flips it live. |
| `__vg.fitCap`, `__vg.fitShare` | the live toggle and the share, no reload. |
| `?slow=N` | time scale at boot (default 1.25), so two takes are slowed the same. Independent of `?fit`. |

**Off by default**, everywhere. Develop holds a walking dot to the larger of its two resting
sizes (github#66, a law in `CLAUDE.md`), and an experiment that sizes dots from the frame must
not be what the page does unasked.

## Harnesses

| | |
|---|---|
| `scripts/probe-dotsize.mjs --fitcap on\|off` | per-frame overlap and size, one build in both modes |
| `scripts/shoot-cascade-frame.mjs --vault <v> --out shots/x --label x [--fitcap on\|off] [--year 2018] [--zoom 0.2]` | a mid-cascade frame as PNG, full pane and a crop centred on one named note's resting position, captured at the same elapsed milliseconds after the click so two runs are comparable; each frame carries its own intersecting-pair count and the centre note's drawn radius |
| `scripts/probe-dotwhy.mjs --vault <v> --id 8705[,...]` | which term of `dotPx` steps between rest and the first cascade frame, through `__vg.dotWhy(id)` |
| `__vg.traceOn(id)`, `__vg.traceRows()`, `__vg.traceOff()` | one row per layout pass for one note, tagged `rest`, `frame`, `endpoint-A`, `endpoint-B`; `place` rows carry `base`, `SP`, `row`, `edge` rows carry `dEdge`'s four terms and `side()`'s inputs |
| `?demo` acts `yearchip`, `only05` | clip-only acts isolating the cascades it exists for: the year chip that still overlaps with the cap off, and a solo of an inner-band folder, where rows have the shortest arcs and the cap the least room |

The demo acts and the time scale exist for the same reason as `?fit`: at full speed a
mid-cascade defect is a fraction of a second.

## What it measured

10k fixture, `02 - Areas` toggle, cap on against off (`changelog-detail.md`, 2026-09-06):
intersecting pairs per busy frame mean 631 -> 0, p90 1085 -> 0, on both directions and on the
intro; per-frame radius change p50 0 -> 0 px, p90 0.01 -> 0.45 px, p99 0.01 -> 0.85 px, worst
frame 0.36 -> 1.36 px, no note ever moving more than 2 px; the median dot dips about 15 %
mid-walk (48.4 -> 41.3) and recovers smoothly; the resting disc is untouched either way
(median 49.4 at the start, 47.5 at the end). 57 frames per cascade against 50. The relative
figure the first pass reported (+4205 % on one dot) was a ratio over a radius under 2 px --
a real number describing an event nobody can see -- which is why the record is in pixels.

By eye, on a mirror of the reporting vault: soloing `06` reads slightly better with the cap
on (2026-09-06).

## Where it stands against the laws

- **"A dot never outgrows its two resting sizes while a cascade walks" (github#66).** The
  letter holds: the cap only lowers a size, so `--only outgrows` cannot fail because of it. The
  spirit does not. The law says a walking dot's size is bounded by what the two packings give
  it; the experiment sizes dots from the frame. Mid-walk a dot goes **below both** resting
  sizes and grows back as its neighbours clear -- the shrink-then-grow motion github#66 was
  filed against, in the other direction. The two bounds are two answers to one question, and a
  page shipping both is not sizing dots from one model.
- **"A zero-weight member costs nothing" (`decisions/0006`).** A note under alpha 0.35 is
  excluded, so a near-zero note costs nothing. A note between 0.35 and 1 is not: while it fades
  it shrinks the dots around it. No plan, row or room changes; a **size** does.
- **"A settled dot is the size a fresh relayout gives it."** Passes, because a relayout puts
  every note where it already is and the cap reads positions. But the resting size is no longer
  the packing's alone: the band room is a tenth-percentile statistic, so the tightest tenth of
  pairs are closer than it and the cap can bind on them at rest. Measured as not binding on the
  10k fixture; on a smaller vault it may.

The golden layout snapshots are unaffected either way -- the cap never moves a note.

## History

Ten commits on `experiment/per-frame-dot-size` (off `fd7e461`), re-applied onto
`develop@fc7d157` by cherry-pick and squashed. Every `src/page.js` hunk was written again in
the typed, pointer-comment page (github#55, github#60, github#61). Dropped as landed: `fec9d25`
(github#53, on develop as `bacfc64`) and `b407e51` (github#41's edgeCap fix, issue closed);
the frame harness and write-up `b407e51` carried are kept. Open: develop's `roomOf` lays each
endpoint out once and no develop commit names that two-pass fix, so whether `edgeCap` still
steps on frame 1 is a question for `probe-dotwhy.mjs`.
