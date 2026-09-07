# What an animated frame costs, and what is left to take out of it

github#19 — "10k vault animates at 14 fps: every frame re-plans the whole vault".

The issue's diagnosis is that the cascade re-plans the whole vault on every frame, and that
this is deliberate (see `animation.md`: a frame is a *valid packing*, not a point interpolated
between two of them). Both halves of that are true. What the first pass at this found is that
the re-plan was **not the largest part of a frame**, and that a large share of every frame was
work with no output at all.

This file records the measurement, what was removed, and — because none of the four routes the
issue proposes has been taken — what a second pass should do and in what order. The picture was
re-measured on the 2.0.0 engine on 2026-09-06; that section is at the end and supersedes the
"what is left" table where they differ.

## How to measure it

```bash
node scripts/probe-frame.mjs --vault .fixtures/test-vault-<digest>
node scripts/probe-frame.mjs --vault .fixtures/test-vault-<digest> --profile
node scripts/probe-frame.mjs --html <built page> --fit --nofit --rounds 2 --profile
```

The digest is in the fixture directory's name under `.fixtures/`; it changes when a generator
changes. `--fit` / `--nofit` pick the page's mode (`?nofit` is appended to the URL; the default
is the page's default, fit on), `--rounds N` alternates the requested modes N times so machine
drift shows up as disagreement between rounds rather than as a result, and `--html` reuses a
build. With `--profile` the inclusive table is per function per frame and the self-time rows
are mapped back to `page.js` line numbers (the exporter inlines the page; the offset is taken
from the `function mountVaultGraph(` anchor).

**Wait for the intro to converge before the first click.** Until 2026-09-06 the harness waited
for `state.until === null`, which is the date range's upper bound and is null from the first
frame; the first click therefore landed inside the intro cascade, where `cascade()` read the
half-faded alphas as "nothing to move" and reported `instant` — the earlier note here that
"`05 - Meeting Notes` is hidden by default there" was that harness bug misread. The terms at
rest in those runs were also timed against a running intro. The wait is now
`__vg.lastCascade().exit && !__vg.demo.busy()`, and a folder visible at rest hides on the first
click and shows on the second, so both directions are measured.

Two halves, and they answer different questions.

- **Terms** — each candidate call timed on its own, at rest, median of `--reps`.
- **Frames** — a folder toggle from rest, with the frame period sampled by a plain
  `requestAnimationFrame` chain, plus Chrome's `ScriptDuration` counter over the cascade
  divided by the page's own frame count.

Read **both**. A rAF delta is a multiple of the display's period — 16.7 / 33.3 / 50.0 at
60 Hz — so the percentiles cannot see an improvement until it crosses a vsync boundary, and a
change that takes 46 ms of work down to 35 reports the identical 50.0. `ScriptDuration / frames`
moves with the work rather than with the display. `--profile` adds a self-time table, which is
the only view that tells one term from another (a call tree says "step() costs the whole frame",
which is true and useless).

`__vg.probe(true)` is *not* a frame timer, though it looks like one: `probeSample` walks every
node with a `hypot` and an `atan2` per note, which on 10 002 notes is a term of the same order
as the ones being measured. It reports a frame timer plus itself.

## The frame, measured

10k fixture (10 002 notes, 3 815 edges in the graph at rest — the rest of the 38 154 links are
lazy), showing `05 - Meeting Notes` (4 358 notes) from rest. Two alternating A/B runs on one
machine, because run-to-run drift on this box is about 10% and a single pair cannot see past it.

| | before | after |
|---|---|---|
| script ms per cascade frame | 40.4 / 41.1 | **30.3 / 28.8** |
| cascade frames drawn (same ~2.3 s) | 57 / 56 | **72 / 75** |
| rAF frame period p90 | 50.1 / 50.1 ms | **33.6 / 33.5 ms** |
| frames over 50 ms | 11/56, 19/56 | **5/74, 6/78** |
| `buildWedgePlan` at rest | 9.6 / 9.6 ms | **8.0 / 8.1 ms** |
| `ringsLayout` at rest | 6.6 / 6.4 ms | **3.8 / 4.2 ms** |

The suite sees it too, on the check the issue says has thin guards:
`a range change animates instead of snapping` on the 10k fixture reported **96 frames of a
nominal 407** when the issue was written and **250** after.

## The finding the issue asked for: `skipIndexation: true` is a no-op

The issue measured `refresh({ skipIndexation: true })` at 35.6 ms against 30.3 for a full
reindex and said "that wants explaining, because it may be the bigger half". It is explained by
sigma's own source, and it is not a measurement artefact — the two calls execute the **same
code**:

```js
refresh(e) {
  const t = e?.skipIndexation ?? false;
  const i = !e || !e.partialGraph;              // <- no partialGraph means "full"
  if (i) { this.clearEdgeIndices(); this.clearNodeIndices();
           this.graph.forEachNode(s => this.addNode(s));
           this.graph.forEachEdge(s => this.addEdge(s)); }
  else { /* per-item update, using nodeProgramIndex */ }
  if (i || !t) this.needToProcess = true;       // <- `i` is true, so `t` cannot prevent this
  return e?.schedule ? this.scheduleRender() : this.render();
}
```

`skipIndexation` only means anything **alongside `partialGraph`**. Without one, the flag reaches
`i || !t` where `i` is already true, so even the flag it guards is set anyway. Every
`refresh({ skipIndexation: true })` in this page is a full reindex plus `process()`.

The genuinely cheap path exists — `refresh({ partialGraph: { nodes, edges }, skipIndexation: true })`
measured 8.7–9.7 ms against 9.9–10.8 for the full one — but it is **not a free swap**, and it was
deliberately not taken:

- `clearNodeIndices()` replaces the label grid, and `process()` rebuilds it. The partial path
  touches neither, so `renderLabels()` would spend the cascade choosing labels from the
  positions the disc had *before* it started moving. That is a change to the drawn result, mid
  animation, which is exactly what this branch was not allowed to do.
- `addNodeToProgram` writes into `nodeProgramIndex[id]`, the slot the node held in its
  program's buffer. A node whose `type` changes (this page has a `halo` program alongside the
  default) would be written into the wrong program's array. Sigma's own graph handler guards
  this by forcing a reindex whenever `type` is among the changed attributes.
- It buys about 1.2 ms. Not worth either of the above.

## What was removed

All four are removals of work with no output, not changes to the arithmetic. The resting layout
is byte-identical: `layout matches its golden snapshot` reports "positions unchanged" on all
three fixtures, and `the last frame of a cascade is the resting layout` reports `dr 0 dtan 0
dot 0%` on all three.

1. **Sigma was recomputing every frame's node data three times** (~5 ms/frame). Sigma subscribes
   to the graph, so each of the ~10 000 `mergeNodeAttributes` calls in a bulk position loop
   emitted `nodeAttributesUpdated`, and the handler runs `updateNode(id)` and then
   `refresh({ partialGraph: { nodes: [id] } })`, which runs `updateNode(id)` again. Every bit of
   that is then discarded by the explicit full refresh at the bottom of the same frame. See
   `quietWrites` in `page.js`: it detaches the event's listeners for the duration of a bulk
   write and restores them in a `finally`. Taken off graphology's public `rawListeners`, not off
   `renderer.activeListeners`, so it does not depend on a private field of a vendored bundle.
   Measured in isolation: a 10 002-note position loop is 5.3–5.6 ms with sigma listening and
   0.5–0.6 ms without.
2. **`ringsLayout` opened with a dead graph walk** (~1 ms/frame). It counted visible notes into a
   local nothing read — the input to the `REPACK_BELOW` threshold that `decisions/0001` removed.
   eslint had been reporting it as an unused variable all along.
3. **`buildWedgePlan` applied its membership test twice per note.** It walks the vault once for
   the gate inputs and once to seat notes in cells, and both walks ran the same two-clause
   predicate. The first walk now records who passed, in graph order, and the second walks that
   array. Same set, same order — which matters, because `planTotal` is a running sum of doubles
   and a reordered sum has a different last bit, which then divides into
   `density = sqrt(fullTotal / planTotal)`.
4. **`ringsLayout` asked `willShow` for every note and threw the answer away** (~1.4 ms/frame).
   The expression is `(fullRing || !will)`, and `fullRing` is true in every state with anything
   on screen, so `||` short-circuits it — but `will` was computed on its own line above. Plus
   `pathKey` no longer allocates a throwaway array and string per ancestor per call, and
   `visible()` extends one key through the folder chain instead of rebuilding the whole prefix
   per level. Together these took `visible()` from 4.3 ms per frame to 0.7.
5. **The two per-note room maps were flattened once per cascade** rather than rebuilt per frame
   (`pairUp` / `walkPair`). Four 10 000-entry `Object.keys` arrays and two 10 000-property
   dictionaries per frame became three arrays built once and one object refilled in place. This
   one is inside the run-to-run noise on its own; it is kept because it removes real allocation
   and its output is provably bit-identical, not because it can be shown to pay.

## What is left, and in what order

The frame is now roughly (10k fixture, at rest, ms):

| term | ms | note |
|---|---|---|
| `renderer.refresh` | 10.5 | the largest single term, and now the largest |
| `buildWedgePlan` | 8.0 | |
| `ringsLayout` | 4.0 | |
| `placeLogo` | 1.6 | runs from `afterRender`, so once per frame |
| follower loop | 0.5 | was 5.3 |

and the profile's remaining self-time leaders per frame are sigma's `addNode` (3.1),
sigma's `process` (2.5), `isPushed` (2.1), the `c.slots` presence loop (2.1), `groupOf` (1.8)
and the garbage collector (1.5).

Against the issue's four routes:

1. **Make the refresh cheap, or rarer.** *Understood, not done.* The "why is the cheap path not
   cheap" question is answered above — it is not a path at all without `partialGraph`. Making it
   genuinely cheap means taking the partial path and dealing with the label grid and the
   per-node `type`, which is the biggest remaining prize (about 10 ms of a 30 ms frame) and the
   one most likely to change the picture. A sound version would: pass
   `partialGraph: { nodes: graph.nodes(), edges: graph.edges() }`; assert no node's `type`
   changed since the last full refresh (or fall back to a full one when it did); and either
   accept a frozen label grid for the length of a cascade **with a suite check that says so**,
   or rebuild only the grid. Do not attempt it without a probe that samples the *set of drawn
   labels* per frame, because nothing here currently measures that and the golden snapshots
   cannot see it.
2. **Make `ringsLayout` incremental.** Not attempted. It is 4 ms now, so the payoff has shrunk
   by half since the issue was written, and it is the function whose output every invariant in
   `animation.md` is about. Lowest ratio of the four.
3. **Cache what the plan re-derives.** Half done — the membership test is computed once instead
   of twice. The other half named in the issue is the per-cell `c.list.sort(hubRank)`, which
   sorts the whole vault every frame. `hubRank` is static and cell membership only changes when
   a split gate flips or a note's alpha crosses the plan's floor, so bucketing notes in
   globally hub-ranked order would leave each cell's list *already* sorted and V8's TimSort
   would then cost one pass over it instead of `n log n`. Provably identical output, **but** it
   moves the order of the second walk, and `planTotal` is summed in that walk — so `planTotal`
   has to move to the first walk (which visits the identical set in graph order) in the same
   change, or the sum's last bit moves and the whole disc with it.
4. **Drop the frame rate deliberately at scale.** Not attempted, and it should stay last. It is
   the only one of the four that makes the animation worse on purpose, and the measured frame is
   now 30 ms rather than 70 — a plan-every-Nth-frame scheme would be spending the disc's
   smoothness to buy something the other three routes still have in stock.

## What is still unmeasured here

- **Mid-cascade label selection.** Nothing in the suite or in these probes samples which labels
  are drawn on a given frame. Route 1 above cannot be done safely until something does.
- **Subfolder filtering.** The `visible()` rewrite is exactly equivalent — checked against the
  old form over 200 000 random folder/`dirs`/`hiddenSub` shapes, 120 000 of which hit the
  hidden path, and `pathKey` over 1.6 million comparisons — but **no suite check hides a
  subfolder**, so nothing in the repo covers it. That is a gap worth closing on its own.
- **The `hide` direction of a folder toggle on the 10k fixture.** *Measured on 2026-09-06 — see
  the last section.* The earlier reading that `05 - Meeting Notes` is hidden by default there was
  wrong: the harness clicked during the intro (see *How to measure it*), and every folder on
  that fixture is visible at rest.

## Re-measured on the 2.0.0 engine (2026-09-06)

`develop@745aacf`: own TypeScript store and renderer (`decisions/0012`), lazy edges, and **Size
dots from the frame** on by default (`design/0011`, `?nofit` turns it off). 10k fixture
`.fixtures/test-vault-f0a57814` (10 002 notes, 3 815 edges in the graph at rest, 40 cells),
showing `05 - Meeting Notes` (4 358 notes) from rest, two alternating fit / nofit rounds on one
machine; `06 - Zettelkasten` (200 notes on this fixture) once in each mode. These runs still
carried the intro-wait bug described under *How to measure it*: the first click landed
mid-intro and was swallowed, so the frame tables below are all **show** cascades from a settled
disc, and the "terms at rest" were timed against a running intro (read them as ±2 ms). Profile
at a 100 µs sampling interval, inclusive time per function divided by the page's own cascade
frame count.

### The terms at rest (one call, median of 8, ms)

| | fit on | `?nofit` | 2026-09-02 (Sigma) |
|---|---|---|---|
| bare `forEachNode` walk | 0.1 | 0.1 | |
| `buildWedgePlan` | 7.5–8.2 | 7.6–7.9 | 8.0 |
| `ringsLayout` | 4.4–6.8 | 3.9–4.4 | 4.0 |
| `renderer.refresh()` | 9.4–9.5 | 8.4 | 10.5 |
| `renderer.refresh({ skipIndexation: true })` | 9.6–10.9 | 9.7–10.1 | |
| `renderer.render()` | 1.8 | 1.8 | |
| `placeLogo` | 1.5–1.6 | 1.6 | 1.6 |
| follower loop (10 002 `mergeNodeAttributes`) | 0.4 | 0.4 | 0.5 |

`skipIndexation` is still a no-op on the own engine — `refresh` ignores it, as it did in Sigma
without a `partialGraph` — and the frame loop still passes it.

### The frames (show `05 - Meeting Notes`)

| | fit r1 | fit r2 | nofit r1 | nofit r2 | 2026-09-02 |
|---|---|---|---|---|---|
| script ms per cascade frame | **37.3** | **39.3** | **30.0** | **28.7** | 30.3 / 28.8 |
| cascade frames drawn (~2.35 s) | 59 | 56 | 67 | 72 | 72 / 75 |
| rAF period p50 / p90 | 33.4 / 50.1 | 33.4 / 50.1 | 33.4 / 47.7 | 33.3 / 50.0 | – / 33.6 |
| rAF p99 / max | 133 / 150 | 134 / 150 | 150 / 200 | 117 / 167 | |
| frames over 50 ms | 12/61 | 13/55 | 6/67 | 8/73 | 5/74, 6/78 |
| frames over 33.5 ms | 22/61 | 21/55 | 9/67 | 9/73 | |

`06 - Zettelkasten` (200 notes moving): **39.6 ms/frame, 54 frames** with fit on and **28.1,
74** off — the same cost as moving 4 358 notes, which is the issue's diagnosis holding exactly:
the frame re-plans the whole vault whatever moved. `probe-cascade.mjs` on the 2018→2021 range
at time scale 1: 56 frames (fit) against 68 (nofit) in 1.8 s, settle handover `tan 0 over 0
mean 0` in both modes. The per-frame sizing costs frames; it breaks no law.

### Where the frame goes (profile, inclusive ms per cascade frame, fit r1 / r2 ; nofit r1 / r2)

| | fit | nofit |
|---|---|---|
| `step` (the whole frame callback) | 35.1 / 37.1 | 28.2 / 27.0 |
| `buildWedgePlan` | 7.5 / 7.6 | 7.7 / 7.5 |
| `ringsLayout` | 6.6 / 7.2 | 6.8 / 6.3 |
| `renderer.refresh` | **19.7 / 21.1** | **12.2 / 11.7** |
| · `addNode` (the reducer pass: `nodeStyle`, `dotPx`) | 12.7 / 13.4 | 4.9 / 5.0 |
| · · `measureFit` (inside `dotPx`, once per frame) | **6.6 / 7.0** | – |
| · · `dotPx` self, the fit branch included | 2.0 / 2.0 | 0.5 / 0.5 |
| · `process` | 1.9 / 2.2 | 2.1 / 1.8 |
| · `addEdge` | 0.9 | 0.8 |
| · `render` (GL draw, labels, `afterRender`) | 6.7 / 7.2 | 6.7 / 6.3 |
| · · `placeLogo` (from `afterRender`, per frame) | 2.4 / 2.5 | 2.4 / 2.4 |
| · · `heatDraw` (per frame since the 2026-09-06 repaint fix) | 1.2 / 1.3 | 1.2 / 1.1 |
| follower loop + `probeSample` | ~1.0 | ~1.0 |
| garbage collector | 1.9 / 2.0 | 1.9 / 1.7 |

With the sizing on, `measureFit` is the single largest self-time term on the page, ahead of the
engine's `addNode` (2.2–2.5) and the planner's hottest loop (2.0–2.2). On the `06` toggle it was
9.0 ms, because more notes sit at or above alpha 0.35. Its grid keys are strings
(`gx + ":" + gy`) built once per point and nine more times per neighbourhood lookup — about
100 000 short-lived strings a frame on this fixture.

### Where `buildWedgePlan` spends its 7.5 ms (self time, ms per frame)

| | ms | what |
|---|---|---|
| membership walk (`forEachNode` callback at 1291, `planKeep`, `attrsOf`) | ~1.8 | `planKeep` alone 0.5–0.6 |
| seating walk (`members.forEach` at 1337, `getNodeAttribute`, `weightOf`) | ~1.3 | |
| `c.list.sort(hubRank)` comparator | 0.9 | plus the sort's own time in the caller |
| `placeCell` | 1.5–1.6 | |
| `roomOf` | 1.3 | a sort of every slot's step |
| `wsum` loop | 0.45 | |

Within a cascade `willShow` is constant per note and the split gates read `liveN`, a count of
members rather than a weight — **but `planKeep` is `willShow || present`**, so a *departing*
note is a member only while its alpha is above the plan's floor (0.004) and leaves membership
mid-cascade as it fades, taking one from `liveN`, one from `liveSub`, and sometimes its whole
cell with it. In the show direction nothing leaves, and `members`, the cell keys and each
cell's hub-ranked order are the same on every frame; in the hide direction the member set
shrinks on most frames, because departures are staggered across the cascade. This was written
down as "constant" first and measured second: the step-C parity assertion reported 0 mismatches
on every show cascade, **61 of 69 frames** mismatched on hiding `02 - Areas` (`total` off by
0.011 — a few notes at alpha ≈ 0.003), and a **10-vs-9 cell count** on the shape fixture's
range change. `bandDepth` is weight-derived as well (`depthOfBand` reads `bandLive`), so a split
gate can flip on a weight, rarely. The first three rows — about 3.5 ms — are re-derivations of
a constant on a show; on a hide only the membership walk (1.8) is, and the seating and the sort
have to run whenever a note has left.

### Where `ringsLayout` spends its 6.5–7.2 ms

| | ms | what |
|---|---|---|
| per-slot placement loop (1957) | 2.0–2.2 | `seamAt`, `edgeSweep`, `side`, `sweepAngle`, `cos`/`sin` |
| `isPushed` | **1.5–1.8** | one call per slot: `groupOf`, `getNodeAttributes`, `pathKey`, `ownsWedge` — with nothing highlighted |
| the `rowN` / `c.geom` loops (1946, 1917, 1810) | ~1.3 | |
| the output `forEachNode` (2053) | 0.1–0.3 | |

Every cell's arc start moves whenever any weight moves, because `allocateBand` shares the band
among all cells — so "only cells whose inputs changed" is every cell on every frame of a
cascade, and an incremental `ringsLayout` has nothing to skip. What it does have is a 1.5–1.8 ms
predicate whose answer is `false` on every note whenever `state.highlight` and
`state.highlightSub` are empty.

## What is left after the second pass (2026-09-06, end of the day)

Three steps landed on `perf/planner-frame-cost`, each bit-identical in output and each measured
on its own (`changelog-detail.md`, 2026-09-06): `measureFit` on integer grid keys (step A, the
sizing 6.8 → 1.0 ms/frame), `isPushed` asked only when something is highlighted (step B,
`ringsLayout` 6.9 → 4.9), and the plan skeleton a cascade carries (step C, `buildWedgePlan`
7.5 → 3.5 on a show, 4.1 on a hide). The 10k frame, `05 - Meeting Notes` in both directions,
two alternating rounds, harness waiting for the intro:

| ms of script per cascade frame | before this pass | after |
|---|---|---|
| Size dots from the frame on (the default) | 37.3 / 39.3 | **23.6 / 23.8** show, **24.2 / 24.4** hide |
| `?nofit` | 30.0 / 28.7 | **23.0 / 22.7** show, **23.1 / 23.6** hide |
| cascade frames drawn in ~2.3 s | 56–59 (fit), 67–72 | **81–89** |
| rAF period p50 | 33.4 | **16.8** on every show and the nofit hide; 33.3 on the fit hide |

The frame is now roughly (fit on, show, ms): `refresh` 12.4 (reducer pass 6, `process` 2,
`placeLogo` 2.4 + `heatDraw` 1.2 from `afterRender`, edges 0.9), `ringsLayout` 4.5,
`buildWedgePlan` 3.6, GC 1.7, follower loop + `probeSample` ~1, `measureFit` 1.0.

Against the issue's four routes, as they stand now:

1. **Make the refresh cheap, or rarer.** It is the largest term again, at about half the frame,
   and it is real per-frame work: alpha and size change for every note every frame, so the
   reducer pass has something to compute. What is not the reducer's: `placeLogo` and `heatDraw`
   repaint from `afterRender` on every frame (3.6 ms together). Left alone **on purpose** —
   throttling them changes what is drawn mid-cascade (the ring colours and the heat band would
   trail the disc), and that was decided at the plan gate against doing it (D-4). A cheaper
   `bandColors` walk at the same cadence would keep the drawn frame and is the one thing here
   with no law against it.
2. **Make `ringsLayout` incremental.** Dropped (D-6), with the reason measured rather than
   argued: `allocateBand` shares a band among all its cells, so every cell's arc start moves
   whenever any weight moves and there is no cell to skip mid-cascade. Its 4.5 ms is the per-slot
   placement (2.1) and the `rowN` / `geom` loops; `isPushed` was the removable part.
3. **Cache what the plan re-derives.** Done, as far as it is sound: the show direction reuses
   everything but the weight sums; the hide direction reuses the member walk and re-seats when a
   departing note crosses the plan's floor, which on a staggered hide is most frames. The next
   cut here, if wanted, is re-seating only the *groups* a departure touched (the others' keys
   and lists are provably unchanged) — worth about 1 ms on a hide, and a fair amount of code in
   the hottest function; not taken.
4. **Drop the frame rate deliberately at scale.** Dropped from github#19 (D-3). With the frame
   at ~24 ms the disc already runs at the display's every-other-vsync on this box in both
   directions, and the show direction touches 60 Hz (rAF p50 16.8); a planned cadence would now
   be spending smoothness to buy nothing the other routes have not already bought. The door
   stays open for a vault where the frame is still over 33 ms.

Still unmeasured: mid-cascade label selection (nothing samples the drawn label set per frame),
and no suite check hides a subfolder — both unchanged from the first pass.
