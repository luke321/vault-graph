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
