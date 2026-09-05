# How an animation is handled

Written because six separate bugs in one session were the same bug, and each was diagnosed by
guessing. They were all one thing: **a quantity that decides where a note goes, or how big it is,
being derived from the current frame instead of from the two packings the cascade runs between.**

Read this before changing anything about the cascade, the seam, the dot size, or plan membership.

## The one invariant

> **The last frame of a cascade must be identical to the resting layout.**
> Not close. Identical, per note, in radius, angle and drawn radius.

Everything below exists to serve that, and every animation bug reported against this project has
been a violation of it. It is directly measurable — see *Checking* at the end. The target is 0.

A corollary that is easy to miss: it is not enough for the last frame to *converge* on rest. The
resting layout is computed by a different call with different arguments, and if any argument
differs, the two answers differ — however smooth the frames leading up to it were.

## The two packings

A cascade is not an animation of a layout. It is an interpolation between **two complete
layouts**, both computed once, at the start:

    planA = staticPlan(wasPresent)   // what the disc is resting in
    planB = staticPlan(willShow)     // what settle() will assign

`staticPlan(fn)` sets `planKeep = fn` and calls `buildWedgePlan(true, id => fn(id) ? 1 : 0)`.
Binary weights, so each endpoint is a real resting packing rather than a sample of some frame.

From those two, the cascade records:

| recorded | from | used for |
|---|---|---|
| `rowsSrc` / `rowsDst` | `c.rows` per cell | `rowsAt(c)` — the fractional row count per frame |
| `bandSrc` / `bandDst` | deepest cell per band | fallback for a cell that exists at one end only |
| `spSrcB` / `spDstB` | `plan.sp`, `plan.spInner` | `spNow` — the per-band spacing per frame |
| `roomSrcB` / `roomDstB` | `plan.room` | walked, but not used to draw — see *Still derived* |
| `presSrc` / `presDst` | per-group presence | `gapPres` — the seam reservation per frame |

Each frame then builds **one** plan with those interpolations handed in:

    buildWedgePlan(ovAfter, weightOf, rowsAt, spNow)

`weightOf` is opacity, not membership — a fading note contributes a fraction of a place, so the
packing re-derives continuously instead of switching from one arrangement to another.

## What decides a note's position

Every term below is either handed in from the endpoints or derived per frame. **Derived per frame
is where the bugs are.** When something jumps, find the term whose source is the current frame.

### Radius

`r = (base + row * SP) * scale * UNIT`

| term | source | walked? |
|---|---|---|
| `base` | `geomLock.r0` / `geomLock.rOuter` | locked once, from the unfiltered plan |
| `row` | `rowsOf(c)` = `rowsAt` | **yes** — fractional between the endpoints |
| `SP` | `spNow.i` / `spNow.o` | **yes** |
| `scale` | `INNER_SCALE` (inner) or 1 | constant |

### Angle

`θ = sweepAngle(a0 + mgA + (arc - mgA - mgB) * u - seam/2)`

| term | source | walked? |
|---|---|---|
| `a0`, `arc` | sweep of `seamsBefore * gap + fracBefore * avail` | via `c.geom` and `gapPres` |
| `c.geom` | opacity-weighted membership | continuous **only if membership matches** — see below |
| `gap`, `avail` | `allocateBand` with `gapPres` | **yes** |
| `u` | `placeCell` — weight position within the row, stretched | continuous (weights) |
| `mgA`, `mgB` | `side()`: `arc*r/(2*nRow)`; rim row capped by `DOT_OF_PITCH*bandRoom` | see below |
| `seamFall` | `(REF_ROWS / plan.rows)^SEAM_FALL` | **yes**, `plan.rows` is `depthOf` |
| `nRow` | **alpha-weighted** notes in that row of that cell | continuous |

### Drawn radius

`dotPx(size, id)` = `ramp(size) * min(bandRoom, cellRoom[id]) / pitch`, floored at `DOT_LO`
scaled by the same factor.

| term | source | walked? |
|---|---|---|
| ramp `DOT_M`/`DOT_B`, per band | `measureSizeScale()` from `lastSP` / `lastSPI` | via the walked spacing |
| `bandRoom` | 10th percentile of `arc * r * rowsUsed / c.live` over the band | per frame, continuous |
| `cellRoom[id]` | the same expression for the note's own cell | per frame, continuous |
| `DOT_LO` | pixel floor, scaled by the room factor | continuous |
| `sizeCap[id]` | the larger of the note's two RESTING radii, measured by `roomOf()` at each end | constant across the cascade; a bound, not a walk |

**The product of walked terms is not walked.** `room`, `pitch` and the ramp are each walked
between the two packings, and `dotPx` multiplies them; two quantities walked on the same clock
keep their ratio only when the ends are proportional. Soloing a four-note folder on a ~500-note
vault walked the inner room 96 → 923 against a pitch of 191 → 573, so `room / pitch` rose
0.5 → 1.88 mid-walk while the ramp top rose 8.4 → 21.8, and the notes still waiting to leave
were drawn at 36 px against a destination of 9 px (github#66). The destination is the hub cap
for a row-0 inner note, which only takes hold on the frame the survivors arrive. So every note
is held to the larger of what the two resting packings draw it at — never smaller than either
end, never past both. The bound lives on `cascadeRun` and dies with it.

Size must stay **monotone in link weight**: notes are laid down in weight order from the inside
out, so the innermost note is the most connected one, and anything that modulates size by
position makes the most connected note the smallest. That is why the room figure is one number
per band rather than one per note, and why a per-note `dotFit` cap was removed rather than
softened.

## Membership is part of the layout

This one cost the most to find, so it gets its own section.

`buildWedgePlan(onlyVisible, ...)` decides who gets a **slot**:

    if (onlyVisible && !(planKeep || willShow)(id)) return;

During a cascade `planKeep` is *staying or still on screen*, so a departing note keeps a slot and
its space closes continuously instead of vanishing. At rest `planKeep` is null and the fallback
applies — and that fallback **must be `willShow`, the predicate planB was built with**.

It used to be `visible`, the folder filter alone. A note excluded by the date range therefore
stayed a member at weight 0 — and a member creates a **cell**. Measured on one date range: the
resting plan held 11 cells where the final frame held 9, the extra two being empty sub-cells of
one folder, and the same arc divided 11 ways instead of 9 moved wedges by up to 10.6° and notes
by 320 units of pure tangential travel. Radii and drawn radii were identical to the unit, which
is exactly why it read as an unexplainable sideways twitch and survived several rounds of looking
at the wrong thing.

**A weight-0 cell is not free.** It takes no arc and spends no seam, but it exists, and the cell
count is a divisor.

## The failure mode, stated generally

An integer, or a set membership, recomputed per frame.

Six instances, all measured:

| what | symptom | measured |
|---|---|---|
| spacing re-derived from live weights | disc jiggles; inner ring stalls, then jumps | frames >300u: 38 → 13 |
| `seamFall` from the integer row count | every channel widens at once, mid-animation | rows 5→4 in one frame, falloff 1 → 1.398 |
| dot ramp from `lastSP` alone | inner ring's notes touch while the outer ring gaps | clearance 239 outer vs 29 inner |
| per-note `dotFit` — a min over *which* neighbour is nearest | dots breathe for the whole cascade | 252% in one frame, 72/122 frames >5% |
| `nRow` as a count of *present* notes | end margins step on the last frame | up to 301.9u tangential |
| membership fallback `visible` instead of `willShow` | a jump at the end of every animation | 11 cells vs 9, up to 10.6° |

When a report says "it jumps at the end", the shape of the answer is the last row: find the
argument that differs between the final frame's call and the resting call. It will not be the
easing.

## Still derived per frame

Honest list, so the next person does not assume otherwise. All are continuous today, which is why
they are tolerable; none is endpoint-walked.

- `bandRoom` and `cellRoom` — percentiles of `arc/n`, continuous because both the arc and the
  weighted `n` are. `plan.room` exists and *is* walked, but is **not** used to draw: it is built
  from `c.band`, the cell's reference arc, while the disc is drawn from `c.span`, its live share,
  and under filtering those differ several-fold. Drawing from it collapsed every dot onto the
  pixel floor (diameter/step 0.02–0.10).
- `maxRowR` — which row is a cell's outermost. An integer identity, and the rim row's margin rule
  keys off it, so it steps when a cell gains or loses a row.
- `rowsUsed` — a sum of per-row occupancy rather than a count of rows, hence continuous.
- `solveBand`'s `rows = round(T/s)` at rest. During a cascade the spacing is handed in and the
  depth follows from it, so the pair stays consistent; at rest it is a round().

## Filling the box

A wedge is a box in polar coordinates: an inner radius, an outer radius, and two edges running
out to the seams. The layout's job is to fill it as evenly as the note count allows, with the
highest-weighted notes innermost and largest.

Rows and spacing therefore come from the band's **area**, in one division:

    T = thickness, R = mean radius, n = notes
    s    = sqrt(2*pi*R*T / n)
    rows = round(T / s)
    SP   = T / rows

One division, so the two are consistent by construction — no count solved against a spacing it
will not be drawn with. Iterating instead does not converge: `rowsNeeded` rises with spacing
while `span/(rows-1)` falls with rows, so the composite is monotone decreasing, plain iteration
flips between extremes, and damping settles on a degenerate point.

Every cell then takes the **band's** row count, not its own. With arc allocated in proportion to
note count, equal depth makes every cell equally full, which is what puts one step on the whole
ring. Two exceptions, both for low-count folders:

- a folder too small for each sub-wedge to fill a column does not get split into sub-wedges;
- a cell with fewer notes than the band is deep is placed one note per row, centred in the band.

And the end margin is **half the row's own step**, `arc/(2n)` — not half a pitch. For n notes in
an arc A, asking that the end margin be half the interior step has one solution, `m = A/2n` and
`s = A/n`, which makes the boundary gap and the interior step the same number at whatever density
the wedge happens to have. Half a pitch is half a step only where a row is exactly full.

The outermost row is the exception: it is the partial one, and it draws the rim. It spends only
what the band's largest dot needs to clear the seam, so its notes reach their edges — unless it
holds a single note, which has no two ends and is centred.

## Checking

The invariant itself: sample every note's radius, angle and drawn radius on each frame while
`__vg.demo.busy()`, then again after it clears, and diff the last frame against rest. Target 0 on
all three.

Two traps in writing that probe, both of which produced confident wrong answers here:

- **`getNodeDisplayData().size` is the reducer's output, not the drawn radius.** Use
  `renderer.scaleSize(d.size)`. Read raw, dot measurements are short by that factor and overlap
  counts come out 0 on states that have sixteen.
- **`settle()` returning is not the page being still.** It clears when `busy()` does, and the
  final assignment lands after. Read without a beat, a moving disc reports two interleaved
  lattices 4 units apart — which looks exactly like a degenerate spacing solve.

The suite covers the resting end (`the resting disc is on the lattice`, `the gap reservation
holds still while groups only thin`, `filtered to the bone, the disc stays drawable`). The
per-frame step stays manual on purpose: automation's frame pacing is not a person's, so a
threshold tuned under it measures the harness rather than the page.
