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
relationship, and its *thickness* is the channel carrying link weight — so making thickness a
function of zoom overwrites the one signal it has to give. Measured on the 10k fixture, one
hub of degree 55: strokes 1.70px at rest, 3.94px five notches in, 7.87px at ten, and 55 of
those converging on a 20.44px dot is **307.87px of ink**, so the fan drew as one solid mass
with no link traceable through it (github#39).

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
  10x, and the resting disc untouched.
- **Above the knee it costs nothing.** At `ratio >= EDGE_SIZE_MAX / EDGE_MAX_PX` (0.4) `k` is
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

**Not touched, and adjacent:** sigma's `minEdgeThickness` default of **1.7px** floors the
whole 0.60–0.85 weight range this vault produces, so at rest every stroke is identically
1.70px and the weight encoding is invisible until you zoom past ratio ~0.94. That is the
opposite defect — the floor hides weight, this section's is the ceiling burying notes — and
lowering it would change the resting appearance of every vault, so it belongs to its own
issue with its own before/after shots.

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
