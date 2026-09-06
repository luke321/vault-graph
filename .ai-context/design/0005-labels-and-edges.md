# Labels and edges

**Status** as-built · extracted from the README on 2026-08-22

> Which notes get a label, and how edges are curved so chords do not cross the hub.

## Labels


**Nothing is permanently labelled.** Notes are named on hover, on click, and in
search results, and that is the whole of it. A *Labels (hubs)* slider used to add
the N most-linked notes; it was removed along with *Min. links* — see the changelog.

Labels are never left to Sigma to thin. Sigma thins them on a viewport grid, which
assumes nodes are spread out — false by construction here, where every hub is packed
into the centre and they all compete for one grid cell. The result was arbitrary:
rank 1 (142 links) went unlabelled while rank 16 showed. So `nodeStyle` clears
`label` outright for anything that is not hovered, selected or a search hit, and
nothing reaches the grid to be thinned.

There are no group labels on the canvas either. Groups are identified by the sidebar
legend (name, colour, count) and by hovering a note. The rim-label ring that used to
sit outside the disc is gone, which is also why `fit()` now frames tighter — nothing
extends past the outermost notes.

`hubRank` survived both removals and is still load-bearing: it orders notes
best-connected-first *within* a cell (which is what puts hubs near the centre of the
disc) and orders the unlinked notes packed into the hub hole. It is no longer read by
anything to do with labels.

## Edges


Links are curved **by default**; the **Curve away from hub** switch turns them back
into straight lines. The default follows the single most consequential number in the
diagnostics: **only 8.9% of links stay inside one PARA folder.** The other 91% join
notes in different wedges, and two rim notes on opposite sides of the disc are joined
by a line straight through the middle. At 1419 links that is a flat grey wash over
the hub — which is exactly where the inner ring lives. Straight is the case that
needs the excuse, so it is the one behind the switch.

Curved, the dead centre clears completely and the density reorganises into a swirl
just outside it. It is **not a strict win**, which is why the switch exists at all
rather than the curves simply replacing the lines: the inner ring still sits inside
that swirl, so the haze moved rather than vanished. Which reads better depends on
whether you are looking at the hub or at one folder's wedge.

The switch is deliberately **not** reset by Refresh. It changes how the canvas is
drawn rather than what it shows, so it behaves as a preference that persists, unlike
every filter around it.

Three things make it work:

- **The bow is scaled by how close the chord would have passed to the centre**, not
  applied uniformly. Distance from the origin to the chord's *line* gives ~0 for a
  link aimed through the hub and ~R for one hugging the rim; the ramp is squared, so
  most links stay near `CURVE_MIN` (0.05) and only the genuine hub crossings reach
  `CURVE_MAX` (0.55). Uniform curvature was tried first and reads worse — it bends
  the short intra-wedge links, and their straightness is what carries "these two
  notes are near each other".
- **The sign is chosen per edge so the bow always points outward.** Sigma bows to
  the +90° side of source→target, which is an arbitrary side relative to the disc, so
  the normal is tested against the chord's midpoint and negated when it disagrees.
  Measured on this vault, 63% of edges come out negative — that is the sign doing its
  job, not a bug.
- **The toggle is a per-edge `type` in the edge reducer**, so both programs are
  registered up front and switching costs a `refresh()` rather than a renderer
  rebuild.

One trap, and it cost the page's whole init: **the programs hang off the UMD
namespace object, not off the Sigma class.** The bundle sets `Sigma.Sigma` and
`Sigma.rendering` on the same export, so `SigmaCls`, which resolves to
`Sigma.Sigma`, has no `.rendering` at all. Reaching through it throws inside the
init `setTimeout`, which presents as a page stuck forever on "Laying out graph..."
with an empty console. The existing warning in this note about `Sigma.rendering` vs
`Sigma` meant the namespace; this is the same trap one level down.

## A stroke is capped in pixels; a dot is not

Sigma's edge shader draws `max(minEdgeThickness, size / sizeRatio)`, and `sizeRatio` **is**
the camera ratio here, because `zoomToSizeRatioFunction` is identity. That identity is
load-bearing and stays — it is what pins a dot to a fixed fraction of its row pitch, and
`measureSizeScale` already cancels the same `1/ratio` for nodes with `pitch *= cam`. Edges
never got the equivalent cancellation, so a stroke grew as `1/ratio` too.

**The two are not the same kind of thing.** A dot represents a note, and holding its
proportion to the room it has is the entire point of the identity law. A line represents a
relationship, and nothing about a relationship gets stronger because the camera came closer.
(This paragraph originally read "its *thickness* is the channel carrying link weight — so
making thickness a function of zoom overwrites the one signal it has to give". github#43
deleted that channel; see "Every link is the same width" below. The conclusion is unchanged,
and a constant width has even less business tracking the camera than a weighted one did.)
Measured on the 10k fixture, one hub of degree 55: strokes 1.70px at rest, 3.94px five notches
in, 7.87px at ten, and 55 of those converging on a 20.44px dot is **307.87px of ink**, so the
fan drew as one solid mass with no link traceable through it (github#39).

Worth stating because the obvious diagnosis is wrong: **stroke-to-dot ratio is constant**
(0.385 at both 5x and 10x), since dots grow as `1/ratio` as well. No single stroke ever
exceeds the dot it lands on. What breaks is *absolute* legibility, not proportion.

Three things make the fix work:

- **One multiplier for the whole web**, not a per-edge `min()` against the cap:
  `edgeMult = min(1, EDGE_MAX_PX * ratio / EDGE_SIZE_MAX)`, with `EDGE_MAX_PX` 4 and
  `EDGE_SIZE_MAX` 1.6, the ceiling `edgeAttrsOf` can produce. A `min()` flattens every link
  onto the same number the moment it binds — all 55 at 4.00px, a 220px fan, weight ordering
  gone — while a single `k` holds the ratios between weights at any zoom and lands only the
  heaviest link there can be on the cap. Below the knee it also makes `size * k / ratio` a
  **constant**, so the drawn web is invariant under zoom rather than merely bounded, which is
  what lets the invariant assert an equality. Measured after: 2.12px / 93.93px at both 5x and
  10x, and the resting disc untouched. **github#43 changed which two widths this is about, not
  the argument:** `EDGE_SIZE_MAX` is now derived from `EDGE_SIZE_LIT` (1.4), there is no weight
  ordering left to flatten, and the ratio a `min()` would destroy is the 2.33:1 between a
  resting link and a lit one — at ten notches in it clamps both to 4.00px and the lit web
  stops standing out at the one zoom where you are studying a note's connections.
- **Above the knee it costs nothing.** At `ratio >= EDGE_SIZE_MAX / EDGE_MAX_PX` (0.4 as
  shipped for github#39, 0.35 since github#43 moved the denominator to 1.4) `k` is
  1, no refresh fires, and not one pixel of the resting disc moves — the whole cost lives
  inside the zoom that needed the fix. The camera hook is rAF-throttled and gated on
  `syncEdgeMult`, so it runs at most once a frame; a **pan** never runs it at any zoom,
  because a pan does not change the ratio. The reducer pass it does run costs 14.5ms on the
  10k shape against 3.3ms for a render alone, i.e. about 50fps through a 120ms zoom notch.
- **`capEdge` is applied at every drawing exit of the reducer**, not once before the return.
  The query branch returns early, so a single application left the whole web unclamped for as
  long as anything was in the search box — and the suite stayed green until the check learned
  to read that state, where it now fails at 7.87px.

`edgePx(size)` is the shader's law in one place, shared by the focus-web overlay (which has
to stroke exactly what the GPU would) and by `__vg.edgeReport()` — the same reason
`edgeCurveGeom` is shared with `checkFocusWeb` rather than duplicated in it.

## The floor is the same setting from the other end

`minEdgeThickness` was never set, so it sat at sigma's default **1.7px** — while at the
resting zoom every link's natural width is **0.55–1.02px**. The floor caught 100% of them and
inflated each two to three times. One link 1.2px too wide is invisible; 3737 of them sweeping
through the middle of the disc and stacking ink at every crossing is a grey fog that veiled
the inner rings and filled the hub hole (github#42). Now **1.0px**.

Measured on the 10k fixture, mean coverage of the edges canvas alone — the web with no note or
label mixed in (`__vg.edgeInk()`):

| floor | one degree-55 hub's fan | web covers | mean alpha where lit | ink |
|---|---|---|---|---|
| 1.7px | 93.5px | 30.49% | 0.76 | 0.231 |
| **1.0px** | **55.0px** | 25.76% | **0.44** | **0.114** |

The area barely moved and the **alpha halved** — which is what fog is, and why the width
alone did not describe it.

- **A floor is still needed.** At 0.5px the web on a 450-note vault all but vanishes; the
  hairline risk it exists for is real. 1.0 keeps a sparse web reading as individual strands.
- **Flat, not scaled by edge count** — and the issue expected the opposite, since fog grows
  with the number of links while the hairline risk is worst when there are few. Looking at
  both ends says one number does it. Regenerate the sparse shape with
  `node scripts/make-test-vault.mjs --notes 450 --years 4 --out <dir> --seed 7` to re-check;
  it is deliberately not a suite fixture, so this is a by-hand check. If a shape ever breaks
  the single number, `EDGE_RAMP_START`/`EDGE_FLOOR` is the precedent to follow.
- **The lit web got thinner too, by 23%.** A focused link is sized toward 1.4, i.e. 1.30px at
  rest — *below* the old 1.7 floor, so the floor was inflating the hover web as well. It now
  draws its own 1.30px. `checkFocusWeb` still reports **0 dim** on all three fixtures, which
  was the risk worth checking: it samples a lit curve's centreline for blue, and a thinner
  stroke antialiases more.

**Link weight still reaches the screen nowhere, and this did not fix it.** The three weights
that exist draw 0.556 / 0.787 / 1.019px at rest, so a 1.0 floor still flattens the first two;
separating them needs **≤0.55**, which is exactly where the sparse web disappears. The two
goals genuinely conflict through this one number, so weight needs a different channel and its
own issue. Zoomed in it is marginally better than it was — the deep-zoom range widens from
1.7–2.12px to 1.5–2.12px, because the light edges are no longer floored up to meet the heavy
ones. Worth knowing before spending effort on it: **3 distinct weights exist in the whole
graph and 97–98% of links are weight 1** (3628 of 3737 on the 10k fixture, 3219 of 3288 on the
demo), so there is little to reveal. Separately, the lit web overwrites weight anyway —
`edgeReducer` sizes every focused edge toward 1.4 regardless, measured as 3.50px at 10x at
every floor value.

Also from the same measurements: **nothing reaches `EDGE_SIZE_MAX`.** The observed maximum
size is 1.10 (weight 3) against the 1.6 ceiling, so `EDGE_MAX_PX`'s 4px is never actually
reached and the real deep-zoom maximum is 2.75px. Calibration, not a defect — but normalising
by the observed maximum rather than the theoretical one is the knob if links should ever be
heavier when zoomed in.

**Everything above about weight is now history**, kept because it is what the next section
was decided from: two consecutive days of tuning the two ends of one stroke, each of which
had to work out what width was *for* before it could pick a number.

## Every link is the same width

`edgeAttrsOf` returns a constant `size` (`EDGE_SIZE`, **0.60**) and the weight ramp
`min(1.6, 0.35 + 0.25w)` is gone (github#43). A thicker line used to read as "these two notes
are more strongly related", and the reading was false three ways:

- **It said two unlike things at once.** Weight counts every `[[wikilink]]` mention between
  two notes with both directions merged into one key, so weight 2 is *either* "one note
  mentioned the other twice" *or* "the two notes reference each other".
- **It was legible in one state of four.** Measured on the 10k fixture, one hub of degree 55
  plus the whole 3815-link resting web:

  | state | drawn | weight readable |
  |---|---|---|
  | at rest, not selected | 1.000–1.019px over the entire web | no |
  | at rest, selected | 1.30px flat | no |
  | zoomed in, not selected | 1.50–2.12px | yes |
  | zoomed in, selected | 3.50px flat | no |

  At rest `size / ratio` compresses the ramp to 0.556–1.019px and the 1.0px floor above takes
  the rest of it — 0.019px of spread across a whole vault. Selected, `edgeReducer` sizes every
  focused edge toward `EDGE_SIZE_LIT` regardless of weight, which is right and erases the
  channel. The one state that separated weights is the one where you are *not* looking at a
  particular note.
- **There was almost nothing to show.** Remeasured on all three fixtures at this change:
  **three or four distinct weights in an entire graph, and 98.35–99.72% of links weight 1**
  (38048/38154 on the 10k, 4723/4787 on the demo, 3106/3158 on the dominant-folder shape),
  observed maximum size 1.35.

0.60 is what weight 1 already drew, so 98–99% of links do not move at all and the resting web
measures identical either side of the change — `edgeInk` 29.24% coverage / 0.1486 ink on the
10k, unchanged to four decimals. At rest the floor absorbs the rest: weight 2 asked for
0.787px and was already floored to 1.0px, so the only links that change there are the two
weight-3 ones, 1.019px → 1.000px on a web of 38,154. What
the disc actually reads out is **degree**, and degree is already carried twice — by dot size
and by hub rank pulling well-connected notes toward the centre. Width was a fourth channel on
the weakest available variable.

**Rejected: rescue width by lowering the floor.** It cannot be tuned back — at floor 0.2 the
ramp's best case is 0.32–1.48px, and 0.55, the floor that would separate the three weights
that exist, is exactly where a sparse vault's web disappears (measured for github#42 above).
**Also rejected: move weight to opacity, or to the lit web where there is pixel budget.** That
is a new channel rather than a repair, and the distribution says there is nothing worth
spending one on until a real vault shows a fat tail.

**Weight itself stays and still earns its keep**, in one place: the resting-web budget picks
which links survive by sorting weight-descending, so the ~10% drawn on the 10k fixture are the
repeated and mutual ones rather than an arbitrary sample. That reads the raw number off
`DATA.edges` and never needed the stroke to show it. The `weight` edge attribute is carried
through too, though nothing that draws reads it — it is now the only place a materialised
link's weight is legible at all.

**What this does to the cap.** `EDGE_SIZE_MAX` is derived from `EDGE_SIZE_LIT` rather than
being the literal 1.6, because with the ramp gone the widest size that reaches the shader is
the lit width — and 1.6 was never the true maximum anyway, the reducer's 1.4 was, which is why
4px was unreachable. The cap is **still needed**: constant in size is not constant in pixels,
and uncapped at ten notches in a resting link draws 5.56px and a lit one 12.96px, so 55 lit
links would be 713px of ink on a 42.66px dot. Measured either side of the change, 10k hub of
degree 55:

| state | before | after |
|---|---|---|
| rest (1.08), not selected | 1.00px / fan 55.0px | **unchanged** — `edgeMult` is 1 above the knee |
| rest, selected | 1.30px | **unchanged** |
| 5x (0.216) and 10x (0.108), not selected | 1.50–2.12px / fan 83.12px | 1.71px / fan 94.29px |
| 5x and 10x, selected | 3.50px / fan 192.5px | **4.00px** / fan 220px — the cap, exactly |

(The two zoom levels share a row because below the knee they are *identical*, which is what
the invariant asserts; the unselected figures are the suite's own, the selected ones from a
scratch probe that pins `state.selected` and reads `__vg.edgeReport(hub)`.)

So the deep-zoom web is ~14% more ink than 1.9.0 shipped, and 4.00px is `EDGE_MAX_PX` finally
being reached rather than approached — 4px was the reporter's own measurement against a 21px
hub dot, and this dot is 42.66px. The dominant-folder hub moves the other way, because it held
the heavy links: 3.38px / 184.6px becomes 1.71px / 176.57px. **Leaving the denominator at 1.6
was considered** and rejected: it keeps every pixel identical to 1.9.0, but it leaves a
constant whose referent has been deleted and keeps the cap unreachable, which is half of what
github#43 is for.

## The focus web sits above the dim notes

Sigma paints every edge on its bottom layer and every node above that, so the edges lit
by a hover or a click ran **under** the notes they crossed, and each dim disc cut a grey
gap out of a blue line -- on a well-connected hub the web read as dashed (issue #2). The
hovers canvas sits above the nodes layer -- so `drawFocusWeb` strokes every edge with both
ends in the focus set there once more (the neighbour-to-neighbour ones included -- the
edge reducer lights those too; the curve program's own geometry: control point = chord
midpoint + curvature x chord normal; thickness `max(minEdgeThickness, scaleSize(size))`),
then re-draws the focus neighbours' discs over the web on the same canvas, and `drawHover`
paints the label pill last. Stacking becomes dim notes < web < lit notes < pill. Not by
marking the neighbours `highlighted`: that lifts them onto `hoverNodes`, which is above the
pill as well, and in the plugin the lit discs covered the focus note's name. Halo-typed
notes are left as they are (their ring would be flattened), so a highlighted neighbour
stays under the web. Alpha follows the hover ramp, so the web arrives with the dim rather
than popping in over it.

The approach here follows the diagnosis and geometry already diffed on the fork branch
linked from issue #2 (`bartolli/vault-graph@21a618c`) -- reimplemented against this file's
current state rather than applied verbatim.

Measured across the three vault shapes `scripts/smoke.mjs` already builds, with the
best-connected note selected, sampling every lit curve at 1% steps and keeping the samples
that fall geometrically inside a non-focus disc: the demo vault (452, degree 71, 169
edges, 364 in-disc samples): **107 dim before, 0 after**; the 10k synthetic vault (1192,
degree 54, 55 edges, 152 in-disc samples): **36 dim before, 0 after**; the dominant-folder
vault (157, degree 103, 206 edges, 1259 in-disc samples): **530 dim before, 0 after**.
`__vg.checkFocusWeb()` in the console does exactly that -- composite `renderer.getCanvases()`
onto a 2D canvas, sample the curves inside every non-focus `scaleSize(size)` radius and
report `{ blueAtGaps, dimAtGaps, underLabel, otherAtGaps, webOK }`. A sample the hovers
canvas itself has painted opaque and not blue is under the label pill or a lit neighbour's
disc, told apart by that alpha rather than by colour. `scripts/smoke.mjs` runs this as an
automated invariant ("focus web stays above dim notes") on every push, across all three
vault shapes -- confirmed it fails correctly with the fix disabled (`dimAtGaps` 107/36/530
respectively) before being wired to pass.
