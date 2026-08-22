# Logo and favicon

**Status** as-built · extracted from the README on 2026-08-22

> Two sources for two jobs: a mask painted by the disc, and a full-colour favicon.


A brain — itself a node-link drawing — sits in the **hub hole**, and it is **painted by
the disc around it**. The art is white on transparent and is used as an **alpha mask**;
what shows through it is a conic gradient built from the ring's own wedge colours. So
the mark carries the same hues in the same directions as the wedges behind it, and
follows every change to them with no second copy of the colour scheme to keep in sync:

- flip the theme and it repaints in the light palette (measured, every stop changes and
  returns exactly on flipping back)
- hide a folder and its hue leaves the mark, while its neighbours' hues grow into the
  angle it vacated (measured: hiding `08 - Meeting Notes` removes its teal entirely and
  re-cuts the gradient from 26 stops to 44)

`bandColors()` samples **the outermost note at each of 144 angular buckets** and takes
its colour. Sampled from positions rather than read off the plan on purpose: the plan
knows group spans, but what is actually on the rim at a given angle is a *subfolder*
tint, and the tints are most of what makes the disc look like itself. Verified
angularly — at 45° the mark is `People`'s orange, at 135° `2026-06`'s pink, at 180° the
`1 on 1` teal, at 315° the Sprint Reviews cyan, each matching the wedge at that bearing.

**Only the OUTER band is sampled** — that is the ring that surrounds the mark and
carries the subfolder tints worth borrowing. Including the inner band crowded the mark
with hues from an annulus barely wider than the logo itself, and the two bands
competed for the same angles. Band membership comes from `bandLock`, fixed at load,
not from a radius test.

**The handover to the inner band is a ramp, not a switch.** Filter the outer band away
entirely and the inner ring *becomes* the disc, so it has to supply the paint — but
`outer || inner` meant that on the single frame the last outer note went invisible, the
whole mark repainted from one palette to the other in one step, and in two-ring mode
the core layer was dropped at the same instant, so it jumped twice. `outerPresence()`
is the outer band's mean opacity, and the two palettes are mixed per bucket by it.
Because it reads *opacity*, the handover rides along with the cascade that causes it,
exactly as the layout's own density does.

Two things about that ramp took a further pass each, and both were "continuous on paper,
still a snap on screen":

- **It is a SHARE of the band, not an absolute count.** At 12 notes' worth of alpha, the
  ramp covered the last **2.9%** of a 418-note fade. As a share the knee sits at a fixed
  fraction however big the vault grows. `BAND_HANDOVER` is 0.5, so the ramp spans the
  last half of the fade; 0.25 was tried and the last two tenths still moved 92 and 93
  against a median of ~35.
- **It is smoothstepped, not linear.** A linear ramp has a kink where it meets the knee:
  the *rate* of colour change goes from nothing to full in one frame, which is a visible
  event even though the value is continuous. Smoothstep is flat at both ends, so the
  handover eases in and eases out.

Measured over an even fade of the outer band, `t` runs
1 · 0.97 · 0.90 · 0.79 · 0.65 · 0.50 · 0.35 · 0.22 · 0.10 · 0.03 · 0, and the base's
per-step colour change has a **peak only 1.65× its median** (was ~2.6). The last five
steps are 33, 31, 26, 17, 7 — decelerating into the final state rather than piling up at
it — and it lands exactly on the pure-inner reference `70,137,96`.

Above the knee `t` is pinned at 1, so hiding up to half the outer band does not tint the
mark at all. Below it the mark leans toward the inner palette, which is honest: by then
the inner ring really is most of what is on screen.

The core layer is now shown whenever the inner band has anything on screen, even once
the base has finished handing over. Both layers then converge on the same colours, so
letting them duplicate costs nothing — and it removes a second jump, since the layer
used to be dropped on the exact frame the base arrived at the inner palette.

**Two-ring colouring** is a switch under *Logo*, off by default. On, the inner band's
palette paints a **40% core** of the mark (`LOGO_INNER_FADE`, opaque to 16% and gone by
40%) and dissolves outward into the outer band's, so
the mark carries the disc's radial structure as well as its angular one. It is a second
layer using the **same logo mask intersected with a radial fade** —
`mask-image: url(mask), radial-gradient(...)` plus `mask-composite: intersect`, which
needs no clipping wrapper and keeps both layers in exact registration because they
share a `mask-size`. The layer is skipped when the inner band is empty, or when it is
already the thing painting the base layer.

Details worth keeping:

- **`nodeColor`, not the rendered display colour.** Hover and search deliberately dim
  everything else; the logo should not grey out when you type in the search box.
- **`from 0deg` in CSS is 12 o'clock running clockwise**, which is exactly the sweep the
  disc is laid out in, so the two line up with no conversion.
- **Gaps inherit the last colour seen clockwise.** The space between wedges has no note
  to sample, so a wedge's hue runs right up to its neighbour's and the mark has no
  holes in it.
- **A conic gradient has a SINGULARITY at its centre, and no amount of angular
  blending fixes it.** Every angular stop converges on one point, so a transition that
  is ~29px wide out at the rim is 0px wide in the middle — which is why the mark kept a
  hard seam straight down the fissure however wide the blur got. Blending is measured in
  degrees, and degrees are worth nothing at r=0.
  The centre therefore stops using angle: a **radial core in the palette's own mean**
  is laid over the conic gradient, solid to `CORE_SOLID` (9%) and gone by `CORE_FADE`
  (34%). The mean is the one colour that cannot clash with whatever meets there, and
  the core is deliberately small — past ~30% the arcs are wide enough to blend on their
  own, and a bigger core just washes the hue variation out of the middle of the mark.
  Save PNG paints the same core over its wedges, or the export would reintroduce the
  seam the screen hides.
  (The faint vertical line that remains is the *artwork's* own hemisphere divider, in
  the mask itself — not a gradient edge.)
- **Boundaries are blended, interiors are not.** Hard edges were the first version and
  read as a pie chart pasted inside the mark: the disc's own boundaries look crisp
  because they are separated by gaps and seen at a distance, whereas here a dozen of
  them are crammed into ~130px with nothing between them. The bucket colours get a
  **circular box blur** (`LOGO_BLEND_BUCKETS` = 5, so each boundary spreads over 11
  buckets ≈ 27.5°). One pass handles every boundary, the seam at 0/360, and runs too
  narrow to hold a transition, with no special case for any of them. It was 2
  (≈12.5°) first, which still read as wedges with soft joins rather than a wash; at 5
  nearly every bucket ends up its own colour (measured: 103 stops, 97 distinct).
- **Stops sit at bucket centres, and both ends of a flat run are stated.** A start/end
  pair per bucket pins the colour flat and steps at the join; a single centre position
  lets the browser interpolate, which is the other half of the softening. But skipping
  *every* repeat inside a run was wrong — that left one stop at a run's start and the
  next at the following run's start, so the browser ramped across the whole wedge:
  measured, one colour change spread over **47.5°**, turning each wedge into a smear
  instead of a plateau with soft joins. Only the interior of a flat run is skipped.
  Measured after: **222.5° of the circle flat, 137.5° ramping, 0 ramps wider than 15°.**
- **Repainted only when the colours actually change.** This runs from `afterRender`,
  i.e. every frame of a cascade, and assigning the same background string 90 times is
  90 style recalculations for nothing.
- **Save PNG rebuilds it by hand.** A CSS-masked element cannot be `drawImage`d, so the
  export paints the same buckets as filled canvas wedges and punches them to the mask's
  alpha with `destination-in`. Canvas has no conic gradient, but a hard-edged conic
  gradient *is* a fan of wedges. Both paths share `ringColors()` so they cannot drift.

**Two sources, because the two jobs want opposite things:**

| file | role |
|---|---|
| `logo-mask-source.png` | white-on-transparent art, full res |
| `logo-mask.png` | 192² derivative, the centre mask |
| `logo-source.png` | the colour neon art, full res |
| `favicon.png` | 64² derivative, the page favicon |

The centre logo must carry **no colour of its own** — only alpha matters, since the disc
supplies the paint. The favicon is a standalone 64px icon with no disc behind it to
borrow from, so it keeps the full-colour art. `make-logo.ps1` builds both derivatives;
it exists as a separate PowerShell step because `build-graph.mjs` is deliberately
node-builtins-only and node has no image decoder — it can base64 a PNG but not resize
one. Both derivatives are optional in the build: a missing file yields no logo rather
than a broken page.

Sizing and placement, measured rather than guessed:

- **Cropped to the alpha bounding box first.** The art fills only ~73% × ~69% of its
  frame; cropping means every pixel kept is artwork. That matters because base64 puts
  every byte into the HTML at 4/3 size.
- **The crop is square and centred on the content**, because the logo is positioned by
  its centre on the disc's centre — an off-centre crop reads as the mark sitting
  slightly wrong in the hole.
- **192² against a 180px hole.** The hub hole measures 90 units of radius on a 1016px
  stage at ratio 1.08, and the logo draws at `LOGO_OF_HOLE` = 0.5 of it, so ~113px on
  screen; the asset is larger because at 2x DPR that box wants ~226 device pixels.
- **Placed by projecting through the camera**, not by centring in the stage. The disc
  centre genuinely *is* the stage centre (panning and rotation are off and the pinned
  bbox is symmetric about the origin), but the hole's radius in **pixels** scales with
  the camera ratio, so zoom has to be tracked. `placeLogo()` projects (0,0) and
  (r0·UNIT, 0) and sizes from the distance between them, hooked to the camera's
  `updated` event for zoom and to `afterRender` for first paint and resize.
- **The element sits BEFORE `#graph` in the DOM**, so Sigma's canvases paint over it. If
  an unlinked note is ever sunflower-packed into the hub hole it draws on top of the
  logo instead of vanishing behind it. This vault has 0 unlinked notes today, but that
  is data, not a guarantee.

Switching from a colour PNG to a mask took the page from 644 KB to **607 KB**: the
monochrome art compresses better (40 KB against 73 KB) and there is one fewer
full-colour derivative to inline.
