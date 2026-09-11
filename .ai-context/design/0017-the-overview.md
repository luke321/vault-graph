# The overview beside Fit

**Status** as-built · 2026-09-08 · github#79

> A 96px schematic left of the pan button, absent entirely while the whole disc is in view. It
> says where the frame is and fits when clicked. Why it reads the plan and never a node, and why
> its footprint is never clamped.

## What was missing

Zoom in far enough and the disc stops being a disc: the frame holds a patch of dots and an arc,
with no hub, no rim and nothing that says which part of the circle you are looking at. The page
had four camera controls and none of them answered *where am I* — only *go back to the start*.
`#vg-reset` recovers by throwing away the zoom that got you there, so there was no way to stay
where you are **and** know where that is. On a phone that is the normal state rather than an
edge case: `design/0013` gives the disc the whole screen, and at 390px the frame shows a cropped
arc whose dots are readable and whose place in the disc is not.

## Three things and nothing else

The two band outlines, one coarse sector per folder per band, and the camera's footprint.
**No dots, no labels, no second renderer, no WebGL context** — one 2D canvas, the same kind of
drawing `#vg-heatkey` already is. The rule that keeps it honest: *if it needs a node position,
it has become a minimap and is the wrong thing*. Nothing in `ovSectors`, `ovShape` or `ovPaint`
reads `graph.getNodeAttributes` or `getNodeDisplayData`.

**The sectors come from the plan's own locked wedge edges.** `ringsLayout` already writes
`c.pLead` / `c.pTrail` on every cell it lays out — absolute sweep radians, the same space
`sweepAngle()` converts for the disc itself — so a group's sector is `[min lead, max trail]`
over its cells in that band. Sub-wedges nest inside their parent's arc (`design/0001`), so that
union is one contiguous arc by construction. `ringsLayout` hands the array over in a single
reference assignment beside the one that already feeds the wedge-debug overlay; the frame loop
does no extra work at all.

**The radii come from `geomLock`**, the same numbers the layout is solved against and
`__vg.rings()` reports: `r0 * INNER_SCALE * UNIT` and `bandR.i` for the inner band,
`rOuter * UNIT` and `bandR.o` for the outer. `bandR` is the largest slot radius actually placed
in each band and already carries `INNER_SCALE`, so the outlines sit where the dots really reach.
Note that `drawWedgeDebug`'s planned inner band omits `INNER_SCALE` and then overwrites itself
from measured dots — the overview uses the lock, not that.

## It hides itself, and the test is containment rather than the ratio

github#79 proposed the camera ratio against `fitRatio()`. That is right for a centred camera and
wrong for a panned one: **a camera panned at exactly the fit ratio crops the disc too**, and the
ratio test would hide the tile in precisely the panned-away case the feature exists for. So the
condition is containment — is the circle of radius `lastMaxR * UNIT` inside the footprint.

**The LIVE radius, not the locked one.** `fit()` frames the live disc through `fitRatio()`, so
after filtering down and fitting, nothing is cropped and the tile has no business appearing. Using
`geomLock.maxR` would leave a big locked circle poking out of a small frame and show the tile on a
resting, filtered page.

That choice buys a property worth stating: because `fitRatio()` carries the same `live / locked`
factor the radius does, **the margin `fit()` leaves is the same at every filter level**. Measured
2026-09-08 after a Fit click, the frame is **1.200× the live disc radius on all three fixtures** —
identical, because the margin is geometric (`FIT_RATIO` 1.08, the bbox's 1.02, and
`STAGE_PADDING`) and not a fact about any vault. From a hardcoded ratio of 1.08 it reads 1.282.
There is no hysteresis and none is needed at that distance from the boundary.

The one case where the margin can vanish is `fitRatio()`'s own clamp: `live / locked` is held to
1.35, so a live disc more than 35% larger than the locked one cannot be framed by Fit at all, and
the tile then correctly stays up.

## The footprint is never clamped, and that is the hard part

Zoomed out or panned away the viewport rectangle is larger than the disc or entirely off it.
Clamping it to the tile would draw a viewport that is not where the camera is. So the tile is a
**window onto the schematic at one fixed scale** — the disc occupies `OV_DISC_FRAC` (0.62) of the
half-tile — and the footprint is drawn to true scale as a tinted region with a stroked boundary.
The canvas clips it; the code never does. Three cases, one code path:

| | what is drawn |
|---|---|
| zoomed in | a small rectangle inside the rings, tinted |
| larger than the disc, partly off | edges cross the tile, the near side tinted, the far edges genuinely absent |
| entirely off the disc | no rectangle at all; a 6px chevron on the tile's rim, pointing at the frame |

Measured on the demo fixture: at ratio 0.35 the rect is **56.50px wide against 56.51 promised,
0.015% off**; panned on the tight axis at fit's own ratio it spans **-39..135 across a 96px
tile**; panned right off the disc it starts at **141**, outside the tile entirely, and the
chevron reads **0°**.

**The chevron says where the FRAME is, not where the disc is.** Panned to +x the frame sits to
the right of the disc the tile draws, so the arrow points right. It carries direction only, never
distance, and that is stated rather than faked.

The 0.62 margin is what makes case 2 legible: a footprint up to about 1.6× the disc *diameter*
still closes inside the tile, and beyond that it runs off, which is the honest picture.

**`OV_FILL_A` is 0.18 because 0.10 failed a visual pass.** In case 2 only one edge of the
rectangle crosses the tile, so the whole reading rests on which side of that line is tinted — and
at 0.10 white on the dark surface the two sides were indistinguishable, leaving a bare hairline
across the disc. At 0.18 the covered side reads while the small rectangle of case 1 is still an
outline rather than a blob. This is exactly the class of defect the suite cannot see: the checks
asserted the rectangle's coordinates, and its coordinates were right the whole time.

**Rejected: fit-both scaling** — shrink the schematic until disc and footprint both fit. It keeps
the rectangle closed and makes the disc a dot at large pans, unreadable exactly when orientation
is the point, and it makes the tile breathe on every pan. A schematic that moves while you are
trying to read your place in it is worse than one that runs off its own edge.

## Repaint discipline

`design/0010`'s band guard is the precedent, and the rule is the same: **a still camera draws
nothing**. `ovSync` runs from `afterRender` after `heatDraw`, and:

- not cropped → hide the tile and return. No string built, no canvas touched.
- cropped → build the signature and compare. Equal → return.

The signature is **the drawing's own inputs quantised to what moves a pixel**: the rect to a
quarter pixel, ring radii to half a pixel, each sector's group, band, colour and edges to one
degree, plus tile size, device pixel ratio and the two theme colours. A camera nudge too small to
shift the rect a quarter pixel is not a repaint, and neither is a cascade frame that leaves every
wedge inside the degree it was already in. Quantising the *output* rather than the camera is what
makes that true by construction rather than by argument.

At rest the renderer schedules no frames at all, so `afterRender` does not run; when something
else renders — a hover ramp's `refresh()`, `refreshSizeScale()`'s re-entrant one — the camera has
not moved and the signature is equal. `readTheme()` clears the signature, the way `regroup`
clears `heatSig`.

Measured 2026-09-08, all three fixtures:

| | paints |
|---|---|
| at rest, ever | **0** — there is nothing on the page to paint |
| at rest, five forced `refresh()` plus `placeLogo()` | **0** |
| at rest, 500 ms of stillness | **0** |
| three zoom-in notches (the camera genuinely moving) | 12–13 |
| 1.2 s of stillness while the tile is shown | **0** |

The reading that matters is the one taken **with the tile shown**: every reading taken while it is
hidden is guaranteed by the hide path, which returns before a signature is built at all, and would
still pass with the signature compare deleted. The mutation test below is what closes that.

## Absent at rest, after a detour through a persistent control

The placement went through Lukas twice and the visibility went through him twice, and the record is
worth keeping because the second answer overturned the first.

He first asked for it **left of the pan button, enabled only when the whole disc is not in view** —
a control always on the page whose *state* said whether there was anything to fit. That was built
and measured: a resting page then differed from `develop` by the control's own 98x98 box, 2399–2616
px at most 54 of 255 while dimmed. Then: **"don't show the control at default at all."** So it is
absent again, and the resting page is byte-identical once more.

What survives from the detour is the **placement**, which is better than where it started, and the
measurement of what the alternative cost. Neither is wasted: the numbers are here if a persistent
control is ever wanted, and the reason the card no longer has to yield is entirely down to moving
the tile beside the cluster instead of above it.

## Where it lives, and why the card does not yield

`#vg-ov` is a **sibling** of `#vg-cam`, not a fifth button inside it: the cluster's own check pins
four 31px buttons and their box, and a 96px tile inside the flex column would move it.

It sits **left of the pan button, bottom-aligned with the cluster**, and that placement pays for
itself. The cluster is four 31px buttons and three 6px gaps — 142px, which is exactly what
`--controls-h` names — and `#vg-detail`'s `max-height` already subtracts that. A 96px tile
bottom-aligned with the cluster therefore sits **entirely inside the band the card already
clears**, so neither has to give way. The first cut put the tile *above* the cluster and had to
shrink the card by 104px to make room; that rule is gone, and `data-ov` survives only as a state
hook the harness reads.

Measured desktop, 1600x1000, forced visible: **96x96**, bottom gap to the cluster **0px**, **8px**
to its left, **51px** from the stage edge, the card's computed `max-height` `calc(100% - 182px)`
**with `data-ov` on and off alike**, and a 400-paragraph card clearing the tile by 62px.

**On the phone the cluster moves to the top right, so the tile goes left of it there too**,
top-aligned, clear of `#vg-mob`'s corner on the left. Measured iPhone 14: **72x72 at 267,292**,
overlapping neither cluster, with the disc's dot radius median unchanged at 1.38px and the desktop
control unchanged at 2.19px.

## Four things an adversarial pass found that the checks could not

Recorded because each one was invisible to a green suite, which is this repo's recurring shape.

**The repaint guard had no coverage at all.** Every paint reading in the first cut was taken while
the tile was *hidden*, and `ovSync` returns on the hide path before it builds a signature — so the
readings were guaranteed by the early return, not by the guard, and deleting
`if (sig === ovSig) return;` left all four checks passing. The fix is one more reading taken with
the tile **shown** and the camera still. Proved by mutation: with the guard removed, five forced
refreshes and 500 ms of stillness add **5 paints** and the check fails; with it, 0.

**The canvas was two pixels smaller than the space it drew in.** `#vg-ov` is `--ov-size` (96 px)
under the page's `border-box`, so a 1 px border left the canvas a 94 px content box while
`ovPaint` drew in the 96-unit space the token names. The browser then resampled 96 → 94 and every
1 px stroke landed off-pixel: exactly the crispness the `devicePixelRatio` backing store exists to
buy, given away by a 2 % mismatch. No check could see it, because they all compare 96-space
numbers with each other and the cluster check measures the *button*, which really is 96. The ring
is a `box-shadow` now — it takes no layout room — and `ovSize()` reads the canvas's own
`clientWidth` first, so the drawing space is the space it is displayed in whatever the CSS does
later.

**`data-ov="on"` silently overrode the phone's card cap.** `design/0013` caps `#vg-detail` at 46 %
below 720 px, and `.vault-graph[data-ov="on"] #vg-detail` outranks `.vault-graph #vg-detail` —
media queries add no specificity — so the desktop calc took over the moment the tile appeared on a
phone: 302 px of an iPhone 14 instead of 259, which is the failure `design/0013` records as "48
linked notes filled the whole screen and the disc was gone". It is also backwards there, since the
tile is top-anchored below the breakpoint and the card is bottom-anchored and the two cannot
collide. The cap is restated inside the media query.

**`ovCells` went stale on the bail-out paths.** `ringsLayout` returns early when there is no plan
and when nothing is visible, and the assignment sits after both; it was also missing from
`roomOf`'s save/restore list, which exists precisely so a probe layout cannot leak into live
state. Filter every folder off while zoomed in and the tile would draw sectors for folders that
had left, with a signature that never changes to paint them out again. `ovCells` is cleared on
both returns and restored with its siblings.

Two assertions that could not fail were removed rather than left as decoration: waiting for
`camAtRest` after the pan-restore wait (that callback sets `camAtRest` in the same synchronous
block, so it was already true), and `discPx > 8` (the `geomLock` term cancels out of
`k * rings.maxR`, leaving `OV_DISC_FRAC * s / 2` — a constant compared with a constant).

## Checked at actual size, which is the only size that counts

A second review asked for the indicator at **1:1** rather than in the enlarged close-ups, on the
grounds that a 3× crop proves inspectability and not orientation. Measured 2026-09-08, cropped at
`scale: 1` and viewed at native size on both the 96 px desktop tile and the 72 px phone tile:

| camera | 96 px | 72 px |
|---|---|---|
| ratio 0.35 | the rectangle spans much of the ring; orientation plain | readable, tighter |
| ratio 0.16 | a clear small box, off-centre; orientation plain | readable |
| ratio 0.06 | **a ~8×5 px box — position reads, shape does not** | **~5×4 px, effectively a dot** |
| off the disc | the glyph is legible | legible |

So orientation is established at ordinary and deep zoom at both sizes, and **degrades at very deep
zoom**, where the footprint is honestly only a few pixels across. A minimum drawn size would keep
it legible at the cost of overstating the frame's extent; that is a question on github#79, not a
defect, and nothing is clamped today.

## The offscreen glyph: one meaning, now spoken

At 1:1 the review's concern is confirmed rather than softened — the filled triangle on the rim
reads as a **navigation arrow**, and in the worked example it points right while the disc is off
to the left. The two readings are opposite, and picking the wrong one sends the user the wrong way.

**The sign was not flipped**, because that changes what the control means: the glyph stands in for
the footprint, so it marks where the *viewport* is. What was missing was that nothing said so. The
control's `title` and its accessible name are now derived from the same angle the glyph is drawn
at — *"Viewport right of the disc. Click to fit."* — over eight compass words. An arrow that
explains itself is a different object from an unexplained one, and the accessible name went from a
static string to the actual state in the same change.

Whether the glyph itself should stop being an arrowhead — a hollow marker in the footprint's own
visual language instead — is the remaining half, and it is a preference on github#79 rather than a
correctness fix.

## The programmatic auto-fit does not raise the tile, and the gate is narrow

Measured on the dominant-folder fixture by sampling `#vg-ov.hidden` at animation rate in the page,
because the thing being measured is shorter than a CDP round trip is reliable: re-showing the big
folder made the tile appear at **81 ms and vanish at 295 ms — 214 ms, once**. A growth auto-fits
immediately (github#14) while the disc is still expanding, so for those frames the disc really is
bigger than the frame. True, and still a flicker with no information in it.

The gate is one condition, and its narrowness is the whole point:

```javascript
if (cropped && !ovOn && cascadeRun && fitting) cropped = false;
```

- **`!ovOn`** — it only ever suppresses a *new* appearance. A tile already up during a toggle stays
  up, so anyone already oriented keeps their orientation.
- **`cascadeRun && fitting`** — both, so it cannot catch a deliberate zoom, a pan, or a Fit the
  user pressed: none of those runs a cascade.

**After: 0 ms visible and 0 paints**, with the positive control in the same check — a deliberate
zoom immediately afterwards still shows it. A blanket "stay hidden while `fitting`" was rejected
for exactly the reason the review gave: it would also swallow the feedback when Fit is pressed.

## To exercise when the branches combine

- **After github#76 (roots):** the radii, the sectors and the signature all read `geomLock` and
  the plan, so a root change is a cache-invalidation question. Test a root change and the return to
  the whole vault, **including a root with no visible notes** — `ringsLayout` bails out there and
  `ovCells` is cleared on that path, which should leave bare rings rather than a stale wedge.
- **After github#80 (selected-note layout):** the tile's position and the card's `max-height` both
  assume today's host layout, and the card yields via `data-ov`. Re-measure both, and re-run the
  phone card cap, since that is the assumption that changes.

## What it deliberately does not do

**It does not own the pan gesture.** Dragging the footprint to pan is an attractive second feature
and a good way to break `#vg-pan`'s interaction with `fit()`'s temporary re-enable, so it is out
of the first version. Clicking calls `fit()` — the existing function, not a second camera path,
which is why panning-off behaviour comes along for free.

**One trap that cost a debugging pass**, recorded because it will catch the next person driving
`fit()` from a harness: `fit()` lends panning back for its whole 380ms flight when `#vg-pan` is
off, and `camSettle` — which waits for the camera to stop moving — returns *immediately* when the
camera is already at the fit target, while that loan is still outstanding. Every reading taken
after it is then of a page mid-fit, and the smoke check read `enableCameraPanning: true` and
reported a leak that was not there. Wait for the postcondition (`getSetting("enableCameraPanning")`
going false), not for a proxy. Confirmed against `develop`'s own build: identical behaviour, and
identical whether the click lands on `#vg-ov` or `#vg-reset`.
