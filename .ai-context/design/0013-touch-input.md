# Touch input, and the two panels

**Status** as-built · 2026-09-07 github#73 · extended 2026-09-08 github#82

> A finger pans, two pinch, a tap selects; and either panel folds away at any width -- summoned
> as a sheet on a narrow screen, collapsed out of the grid on a wide one. What had to be true
> for any of it to work.

## It was dropped on purpose, and the promise outlived the decision

`decisions/0012` lists **touch input** among what the engine port did not reimplement, and it
was right at the time: the page was a desktop page. But the plugin ships
`isDesktopOnly: false` and the README calls the exported file "how the graph reaches a phone",
so the absence became a contradiction rather than a scope line. Measured 2026-09-07 with
`scripts/mobile-check.mjs`: on every phone viewport a one-finger drag moved nothing, a
two-finger pinch moved nothing, and a tap selected nothing.

## Two defects, and the second one is ours

**The captor bound eight mouse listeners and no touch listener** (`captor.ts`), so a finger
reached nothing.

**And a tap did not even fall back to a click.** Recorded at the renderer's container during a
real synthetic tap: `pointerdown, touchstart, touchend`, and no `click`. `page.css` sets
`touch-action: none` on `.vg-layer-mouse`, which is correct — it stops the browser panning the
page out from under a drag — and it also suppresses the tap-to-click the captor was relying on.
The proof that only the input path was missing: the same coordinates with a hand-injected
`click` selected the right note.

## The captor is ours, not a port

The four WebGL programs and the camera are ports of Sigma 3.0.2 (`NOTICE.md`). **The touch
captor is not.** Sigma's own `touch.ts` could not be obtained at that tag, so this is written
in the engine's own idiom, reusing the mouse path's helpers. Nothing new is owed to the MIT
notice, and `NOTICE.md` says so.

## One code path, two inputs

`panFrom(prev, next)` and `glide()` were **extracted from the mouse handlers** rather than
written again for touch, so the two inputs cannot drift apart. The check that this holds is a
measurement, not a reading: the same 60 px of travel on the iPhone 14 viewport moves the camera
by **0.5184 for a pointer and 0.5184 for a finger, a ratio of 1.000**. `mobile-check.mjs`
reports that line on every run.

Pinch reuses the wheel's own pair — `camera.getBoundedRatio` and
`host.getViewportZoomedState(midpoint, ratio)` — so a pinch and a wheel notch zoom about a
point by the same arithmetic. The difference is that a pinch calls `setState` per move rather
than `animate`, because it has to track the fingers rather than ease toward them.

**A tap emits the events that already exist.** A release that never left the slop emits
`click`, which the renderer already maps to `clickNode`; a second tap emits `doubleClick`,
which the page already binds to `fit()`. So neither the renderer nor the page needed a new
event, and a double-tap means what a desktop double-click means.

**The tap gate is the gesture, never the clock, and that took two passes to get right.** The
first cut set `isMoving` on every single-finger move and then asked `isMoving` before it asked
how far the finger had travelled. `isMoving` decays 100 ms after the last move, so a tap only
survived if the finger held still for longer than that after its own wobble — on real hardware
tap-to-select would have been a coin flip, while the record already claimed the 10 px slop
decided it. An adversarial review pass found it by tracing the handlers; the harness could not,
because it sent `touchStart` then `touchEnd` with no move in between at all.

So: **under `TOUCH_TAP_SLOP_PX` (10 px) nothing happens at all** — no pan, no inertia, no
`isMoving`. Crossing it hands the pan the point the finger is at, so the dead zone costs no
jump. At release, `touchMoved` alone decides: a pan glides, anything else may be a tap. And two
more rules the same review earned:

- **A tap must have been one finger throughout.** `maxTouches` is tracked across the gesture,
  because a two-finger tap otherwise emitted `click` at whichever finger lifted last, and two
  of those reset the view.
- **A double-tap must be in the same place.** `TOUCH_DOUBLE_TAP_PX` is 24 px. Without it,
  tapping note A and then note B within 300 ms — the ordinary way to read a disc on a phone —
  called `fit()` instead of selecting B. The mouse path is position-blind in exactly this way
  and gets away with it because a pointer rarely double-clicks two different things by
  accident.

**A gesture also stops an inertia glide.** `touchstart` calls the camera's new
`stopAnimation()`, because a `setState` during a running `animate` is overwritten by the next
frame from the animation's own start state: without it a finger could not arrest a fling for
200 ms, and a tap during one picked against a camera mid-flight.

**A tap also does the hover's job for free.** `state.hovered || state.selected` is what drives
the focus ramp, the lit links and the dimming, so selecting a note raises it and lights its
links without any synthetic hover. Hover has no meaning on glass and none is faked.

**Nothing in the touch path emits `mousedown`**, so `bindNodeDrag` — armed on the renderer's
`downNode` — stays mouse-only. Dragging a note into the hub is a pointer gesture; on a phone
the same pin is one button on the note's own card. That is deliberate: a finger anywhere pans,
and on a full disc there is almost no empty space to start a pan from if dots claimed the
gesture.

Three re-seating cases are worth knowing, because each otherwise reads as a jump or a phantom
tap. A finger lifted **out of** a pinch leaves one behind; a **partial `touchcancel`** does the
same; and a finger added **to** a pan starts one. The first two re-seat `lastTouch` and the
pinch baseline instead of panning from a stale point. The third must *not* reset what the
gesture is: an earlier cut reset `touchMoved` on every `touchstart`, so panning and then
resting a second finger down turned a long pan into a tap on a note nobody aimed at. Only a
gesture that begins with no fingers down resets it.

## A finger is not a pointer, and picking had to learn that

`PICK_FLOOR_PX` is **1.5 px**, and `invariants.md` records why: the pointer reaches the page in
whole CSS pixels, so a floored pointer is at most 1.41 px from a true centre. That constant is
sized for a mouse and is checked by "a sub-pixel dot can still be hovered".

On a phone **every dot on the demo fixture draws under 2 px**, median 1.10 px. A tap that had to
land within 1.5 px of a 1.1 px dot would be technically supported and practically useless. So
`getNodeAtPosition` takes its floor **per call**, and a tap passes `TOUCH_PICK_FLOOR_PX`
(**14 px**, about half a fingertip) while the pointer keeps its measured 1.5 px exactly. The
nearest dot inside the catchment wins; an exact hit still beats a near miss.

**The honest cost:** at that dot spacing a 14 px catchment can select a neighbour of the dot
aimed at. The real fix is the layout below, which makes the dots bigger; the catchment is what
makes a tap work at all in the meantime.

## The phone's two panels

The one narrow-screen rule used to stack the legend **above** the stage at `42% / 58%`, which
on an iPhone left the disc 260 px of an 844 px screen — 31% — with the band taking 230 px of
the rest and 536 px of legend below the fold. The disc was a speckle under a page of controls.

Now, below 720 px: one column, one row, the disc taking all of it, and two buttons at the top
left of the stage summon what was in the way, at 44 px on a coarse pointer since they are the only route to the
legend and the search box.

- **The legend, search and view buttons** slide up as a sheet: `#vg-sidebar` leaves the grid
  (`position: absolute`, `translateY(101%)`), and `[data-sheet="on"]` on the root brings it in.
  It keeps its own scrolling, so the whole legend is reachable.
- **The band and the date strip stay on by default**, and can be put away. `design/0010` states
  the band sits in its own grid row of `#stage` "so the disc is centred in what is left and the
  two cannot collide however short the window gets" — hiding the row honours that, floating the
  band over the disc would not. `HEAT_WEEKS` stays the sanctioned lever if the axis ever needs
  to be shorter; the band must never grow a horizontal scrollbar, which `0010` records as an
  already-shipped, already-reported regression.

  **Showing it costs the disc no dot size**, which is why it is the default. Measured on the
  iPhone 14 viewport: with the band the disc box is 390x564 and the dot radius median is
  1.38 px; without it the box is 390x844 and the median is **the same 1.38 px**, because the
  disc is fit to the narrower axis and the extra height buys margin rather than radius. So the
  choice is between a calendar and empty space, and `bandOpen` starts true at every width,
  which also makes `data-band` tell the truth above the breakpoint where the band is always
  drawn.

  **Its control row has to wrap there.** That row is one line of five things: the label, the
  scale, the compact toggle, two date fields and All dates. At 390 px the stage clipped the
  second date field and the button off the right edge, unreachable. Below the breakpoint it
  wraps with the note line on its own row, so the band goes from 230 px to 280 px and every
  control is reachable.

**A panel may never cover its own toggle**, and this is the one defect the band's new default
produced rather than exposed. `#vg-mob` lives in `#vg-canvas`, so the band pushes it down by the
band's own height: with the band on, the two buttons sit at y 292 on an 844 px screen while the
sheet's top edge is at 236, and at `z-index: 7` against the sheet's 8 the sheet covered them.
The sheet opened and could not be closed. Measured before the fix: `elementFromPoint` at the
toggle's centre returned `#vg-sidebar`, and a second press left `data-sheet` at `on`. The cluster
now sits at `z-index: 9`, above the sheet, and the harness asserts the round trip rather than the
stacking order. **A tap on what is left of the disc also closes the sheet**, which is what a
scrim would do and is a second way out that does not depend on a z-index at all.

**The cluster rides a corner that moves, and the move is animated rather than removed.**
The pair sits one inset inside the disc box's top-left — where the year strip meets the legend
counts — and that is the corner folding changes: 288px off the box's left edge when the folder
list goes, 230px off its top when the calendar does. github#82 kept the placement and animated
the difference: `glidePanels()` measures the cluster's box, applies the attribute, measures
again, and plays the delta out with `el.animate()` over 180ms. It is a transform, so it costs no
layout, and it works wherever the element happens to live — which is why the element stayed
inside `#vg-canvas` instead of being re-parented.

**A CSS transition was tried first and cannot do this job.** Inside `#vg-canvas` the cluster's
own `left`/`top` never change — 12px throughout — and only the container moves, which CSS has
nothing to interpolate. Re-anchoring to the root with the offsets in a `calc()` over published
edge variables was the next attempt and was abandoned for the simpler measured animation.

**Proximity and stability cannot both be had, and proximity wins.** Folding moves exactly the
box's left and top edges, so every placement near what it controls moves, and the only ones that
hold still are the bottom corners where `#vg-cam` already sits. Both alternatives were built and
looked at on 2026-09-08: the view's own top-left, which matches `#vg-cam`'s 12px arithmetically
and puts the buttons on top of the folder list they fold; and the bottom-right beside the camera
cluster, which holds still and is 1500px from that same folder list. A button that far from its
panel has stopped being a handle.

**Reduced motion is not a detail here.** `glidePanels()` returns early under
`prefers-reduced-motion: reduce`, so the fold snaps — the same treatment the sheet's own
transition already gets. Measured on the author's own machine 2026-09-08: Chrome reports
`reduce: true`, so the glide never plays there at all, and the setting is why. With motion
emulated to `no-preference` the same fold produces **11 interpolated transforms**, opening at
exactly `matrix(1,0,0,1,0,230)` for the calendar and `matrix(1,0,0,1,288,0)` for the folder
list — the deltas themselves — and easing to `none`. Neither reading is a bug; they are the two
answers the setting asks for.

**The sheet stops where the disc starts, and the buttons land on its heading.** Raising the
cluster above the sheet made it reachable and put it over the search box, which reads like a
mistake. The two anchors are independent -- the cluster is offset from `#vg-canvas`, which the
band pushes down, and the sheet is anchored to the bottom of the viewport -- so the fix is to
make them meet: `syncCanvasTop()` publishes the disc area's own top as `--vg-canvas-top`, the
open sheet takes `min(72%, calc(100% - var(--vg-canvas-top)))`, and the heading row steps aside
with a left indent while the band is up. The sheet then covers the disc and never the band, and
the buttons read as part of its header rather than as something floating over the search box.
The variable is republished by both toggles, quiet or not, and on the resize beat, because the
band's own height moves with the viewport.

**Selecting a note closes the sheet.** The card is pinned to the foot and the sheet covers the
bottom 72% at a higher z-index, so tapping a note — or a search hit inside the sheet itself —
would otherwise open the card invisibly underneath it.

**A closed sheet is `visibility: hidden`, not merely translated away.** Left visible it keeps
every control inside it in the tab order and the accessibility tree while its button reports
`aria-expanded="false"`, and focusing one lets the browser scroll the `overflow: hidden` root
with no scrollbar to scroll back.

**Both panels change the canvas box without changing the root's**, and that is the trap in this
half. The engine listens for `resize` on the window only, and the page's own root
`ResizeObserver` never fires because the root did not move; `refreshSizeScale()` alone refreshes
only when the scale moved by more than 0.01. So a toggle would leave the layers at a stale size.
Every toggle therefore calls `refreshSizeScale()`, `placeLogo()` and an explicit
`renderer.refresh()`.

**The camera is left where it is**, which is what a window resize already does. Auto-fitting on
a panel toggle would fight "a manually moved camera is left alone by a visibility toggle". It
also turns out to be unnecessary rather than merely undesirable: the camera ratio is
dimension-independent, so `render()` → `resize()` re-frames the disc in the new box on its own.
Measured at 1600x1000 through both folds and back, ratio 1.08 at 0.5,0.5 in all five states.

~~Panel state is **session state, not a setting**: it is a fact about the screen in front of
you, not about the vault, so `decisions/0009`'s settings channel is not involved and nothing is
persisted.~~ **Reversed 2026-09-08, github#82.** That held while the panels were the phone's
alone, where a fold is a passing act. At desktop a folded layout is an arrangement somebody
chose and expects to find again, and the issue asked for it in as many words. So panel state
*does* go through `decisions/0009`'s channel — `sheetOpen` / `onSheetOpen` and `bandOpen` /
`onBandOpen` on the deps object, `localStorage` in `shell.html`, `data.json` in the plugin — and
0009's rule itself is untouched: the page still stores nothing, it only asks and hands changes
back. Three things follow.

- **Absence of the dep is load-bearing.** `undefined` means nobody has chosen yet, so the width
  decides the first open: `!narrow()` for the sheet, and `true` for the band at every width.
  Neither is in the plugin's `DEFAULTS` for exactly that reason.
- **No settings-tab row and no `api.setX`.** "Is the folder list folded away right now" is a
  fact about the window, and 0009's own argument against the standalone's gear in Obsidian
  applies to it doubly: two UIs for one state, and the second stops being updated. `pinned` is
  the precedent — persisted state with no row of its own.
- **A write happens exactly when a call is not `quiet`**, which is why neither setter grew a
  third boolean. The only quiet calls are at mount, putting back what was stored; there is no
  case for "change it but do not remember it".

## The same two panels above the breakpoint — github#82

Nothing in the state machine was ever touch-specific, and two users on the 2.0 thread asked for
the fold on a PC within a day of each other. So `#vg-mob` is drawn at every width now, at
`#vg-cam`'s own 31 px and `.55` opacity in the opposite corner of the same canvas — **permanent
chrome, because invisibility is the defect the issue reports**: the mechanism was already there
and reachable from a console, and nobody could find it.

**What had to be new is the sidebar's presentation, not its state.** A phone's sidebar is a
bottom sheet sliding over the disc; a desktop's is a grid column, and a column that wants to get
out of the way collapses rather than overlays. `[data-sheet="off"]` takes the grid to `1fr` and
the sidebar to `display: none`, and the width goes to the stage. Three notes on why it is
written the way it is:

- **`display: none`, not a zero-width clipped column** — which is what the issue sketched. A
  clipped column leaves every control inside it focusable while its own toggle reports
  `aria-expanded="false"`, and that is the same defect this record already fixed by making the
  closed sheet `visibility: hidden` rather than merely translated away.
- **`@media not all and (max-width: 720px)`, not `min-width: 721px`.** The two branches are then
  exact complements, so no fractional viewport width falls into neither, and the breakpoint is
  one number in the file. It has to be a media query at all because an attribute-scoped
  `display: none` outranks every one of the sheet's rules on specificity and would kill the
  sheet at ≤720 px.
- **The band needed no branch.** `[data-band="off"]` hides `#vg-heat` and pins the stage row at
  every width; the phone's branch keys the same two properties off `[data-band="on"]`, and one
  attribute cannot hold both values.

**The two folds do not buy the same thing, and the arithmetic says which.** `matrixFromCamera`
scales by `min(width, height)`, so at a landscape window the constrained axis is the height the
band is eating. At 1600x1000 on the demo fixture: both up, canvas 1312x770, drawn radius
0.89/**2.19**/4.06 px, 515 of 1403 dots under 2 px; band folded, 1312x1000, 1.05/**2.68**/5.38,
**232** under 2 px; band *and* sidebar folded, 1600x1000, radius **unchanged at 2.68**; sidebar
folded alone, 1600x770, radius **unchanged at 2.19**. So the band is worth 22% of the median
radius and halves the sub-2-px population, and the sidebar is worth framing and not one pixel of
radius. Which is the desktop restatement of what this record already measured on a phone, where
the band cost nothing at all.

**Two auto-closes had to learn the breakpoint.** `clickStage` and `select(id)` both put the sheet
away, and both are right for an overlay: a tap on what is left of the disc is the sheet's second
way out, and the card would otherwise open invisibly beneath it. Above the breakpoint neither
holds — the sidebar is beside the disc, not over it — so clicking bare disc or opening a note
would have folded it away for no reason anybody asked for. Both are gated on `narrow()`, and
`NARROW_PX` is `page.css`'s breakpoint duplicated on purpose, with the same must-match comment
`SLOT_NAMES` carries and for the same reason: everything lives inside `mountVaultGraph`, so
there is nothing to import from.

**And the harness's own round trip needed a second look.** It pressed the toggle twice at one
set of coordinates, which is sound while the panel is an overlay and wrong the moment folding
moves the button: collapsing the column slides `#vg-canvas`, and the cluster inside it, left by
the sidebar's whole width. The box is re-read between the presses now, so a fold that works does
not read as a toggle that cannot be put back. The probe also runs at every width rather than
only under touch emulation — it always pressed with mouse events, so nothing in it was ever
touch-specific; the gate was, which is why `--device desktop` used to report `n/a` for the one
control it now has.

## Known limits, stated rather than discovered later

- **A desktop choice reaches a phone.** Obsidian's `data.json` is shared between them, so a
  desktop user who has toggled the sidebar back on gives their phone a sheet that is open at
  mount. It closes with its own toggle or a tap on the disc, so this is a wart rather than a
  defect, and it is the accepted cost of persisting at every width rather than only above the
  breakpoint. github#82.
- **Dragging a window down across the breakpoint does not fold the sheet.** The stored state
  stays and the CSS switches branch, so an expanded sidebar at 1000 px becomes a sheet over the
  disc at 600 px. Coherent, and `--vg-canvas-top` is republished on the resize beat either way,
  but it is a surprise the first time. Forcing it closed means a `matchMedia` listener fighting
  the persisted state, which is a worse trade than the surprise. github#82.

- **`isMoving` and `movingTimeout` are shared with the mouse path.** On a hybrid device a touch
  can cancel a mouse drag's inertia and the reverse. Separating them means per-input state, and
  no such device has been measured here.
- **Two fingers only zoom.** A two-finger drag at constant spread does nothing; the midpoint is
  tracked for the pinch, not for a pan.
- **The catchment can select a neighbour.** At a 1.4 px median radius a 14 px catchment is
  coarse by construction. It is what makes a tap work at all; more radius wants a filter or a
  zoom, not a smaller catchment.

## github#170 -- a phone gets its own layout, not the desktop's with a sheet over it

**Status** as-built · 2026-09-17 · reported on Reddit: *"Its hard to appreciate the animation
in mobile, since the All and None buttons are inside the panel, which also cover the circle."*

github#73 above gave the disc touch input and got the sheet out of the way of the *band*. It
did not give the page a phone layout, and what it left is what the report describes: the disc
fills the viewport, the sheet slides over it, the camera cluster stands on it at desktop size,
and the band's controls are drawn for a pointer. Measured on `develop`, iPhone 14, demo
fixture: **six elements intersecting the disc box** (four 31 px camera buttons and the two
44 px panel toggles), **79 of 81 controls under 44x44**, the smallest a **25x14** year chip,
the page **does not scroll** (`overflow-y: hidden`, 844 of content in 844), and the band takes
**314 px** of the top before the disc starts.

### "A phone" is `(max-width: 720px) and (pointer: coarse)`

Both halves, and the pair is the decision this issue turned on.

**Not width alone.** That hands pan-off and 44 px chrome to a narrow desktop window and to a
320 px Obsidian side leaf on a PC, where a mouse loses function and gains nothing. **Not
coarse alone.** That hands it to a touchscreen laptop at 1440 px, where the two-column layout
is right -- the same judgement that left the iPad on the desktop layout above, for the same
reason.

**And it needs no host branch.** Obsidian mobile reports coarse at 390 px, so the plugin and
the exported page take one road, and `Platform.isMobile` -- which the exported page cannot ask
about at all -- never enters it. `NARROW_PX` carries the number for both queries, with the same
must-match comment it already had.

The closing section above parked coarse-pointer gating because it "needs
`Emulation.setTouchEmulationEnabled` on the shared page, which would change `pointer: coarse`
for every other check in the run". That was right about the mechanism and wrong about the
cost: the flag is scopeable per check, and `mobile-harness.md` has the measurement and the two
orderings that make it work.

### The disc is a square, and that is arithmetic

`matrixFromCamera` scales by `min(width, height)`, so the 390x530 box this replaces was already
fitting the disc to its 390 px width. A 390x390 box therefore draws **the same disc at the same
radius** -- p50 1.64 px before and after -- with no dead space above and below it and nothing
over it. The height that box was wasting becomes the scroll the page now has.

The root scrolls (`overflow-y: auto`), `#vg-stage` takes `order: 1` and `#vg-sidebar` `order: 2`
-- the sidebar comes first in the DOM, and the sheet rules made that irrelevant by taking it out
of the flow. Inside the stage the calendar keeps `order: 1` and `#vg-canvas` takes `2`, so the
reading order is **calendar, disc, folder list**. `#vg-canvas` is a three-row grid: the square
disc, the control row, the note card.

**The calendar stays at the top and keeps its toggle** (Lukas, 2026-09-17). An earlier cut put
the disc first and forced both panels on, since neither had a toggle left; with the calendar's
toggle drawn there is a way back, so `[data-band]` is honoured here rather than overridden and
folding it brings the disc up. `[data-sheet]` stays inert -- the folder list is in the flow and
has no toggle -- which is why the state machine needed no phone branch. Only the two auto-closes
did, and those for the *store's* sake rather than the layout's: `clickStage` and `select()` would
have gone on writing `sheetOpen: false` through `decisions/0009`'s channel and folded the sidebar
away on the next desktop session.

**Two grid traps, both measured rather than reasoned about, both silent.**

- **`align-self` decides which axis the aspect ratio is derived from.** A grid item stretches on
  both axes by default. With the calendar above it, the disc's *height* became the definite one
  and `aspect-ratio` derived the width from it: **319x319 in a 375 px column**, with all 1403
  dots under 2 px. `align-self: start` with `justify-self: stretch` makes the width definite and
  the square follow from it.
- **Two items naming the same row and no column do not share a cell.** `#vg-cam` and `#vg-mob`
  both took `grid-row: 2`, so auto-placement put them side by side and **created an implicit
  second column**, whose 56 px came straight out of the disc's `1fr` -- 334 px of square in a
  390 px canvas. Both carry `grid-column: 1` now and genuinely share the cell; they do not
  collide, because 56 px at the left ends well before a 152 px cluster centred at 119.

Neither failed anything. Both produced a smaller disc that still looked like a disc, which is the
failure mode this repo's own brief names: reasoning about the code instead of measuring it.

### Nothing is drawn over the disc, which is also the answer to "the buttons are too big"

- **`#vg-cam` stops floating** and becomes a centred row of three 44 px buttons under the disc.
  The buttons are sized for the width they are drawn at *because* they are no longer standing
  on a disc that needs the room.
- **The pan toggle is not drawn.** Pan is off and is not a choice here, so a toggle for it
  would be a lie. It takes `#vg-cam button#vg-pan` to say so: `#vg-cam button` carries an id, a
  class and a type, so a bare `#vg-pan` loses to it on specificity and the button stayed drawn.
- **`#vg-mob` loses one of its two buttons.** The sheet's toggle goes: the folder list is in the
  flow and there is nothing left to summon. *(The first pass also moved the calendar's toggle
  into that control row; the second pass put it back in the disc's corner — see below.)*
- **`#vg-ov` is not drawn.** `design/0017` built the tile as a hover-revealed pointer
  affordance, and with pan off only a zoom can crop the disc. Its whole job -- where the frame
  sits, click to fit -- is the Fit button now sitting at 44 px directly underneath.
- **`#vg-detail` joins the flow.** It was a sheet over the disc because there was nowhere else
  to put it; now there is, and in the flow it can be as tall as it needs instead of capped
  at 46%.

### Pan is a layout state, and it has to stay in step with a layout that is live

`setPan(false)` at mount when `phone()`, through the path "the pan toggle locks the camera and
flies home" already covers rather than a second one, and without `persist`, so a phone never
writes over a desk's stored choice. `storedPan` holds what the host chose; the pan button and
`setPanEnabled` both feed it, and `setPanEnabled` respects `phone()` for the same reason the
mount does.

**A mount-time read was not enough, and the harness is what found it.** The layout is a media
query and is therefore live; pan was read once. `syncPhonePan()` re-applies on the media-query
change *and* on the root's resize beat -- two paths because a pointer change fires no resize
and, in an emulated browser, a width change does not always fire the compound query. It is
guarded on the value actually differing, since `setPan(false)` flies the camera home and doing
that on every resize would be its own defect.

**Wheel and pinch zoom survive, deliberately.** At a 1.64 px median radius the 14 px touch
catchment is what makes a tap work at all; pinching to a readable dot is the only way in.
`enableCameraPanning: false` removes translation and nothing else.

**And the zoom is what arms pan** (Lukas, 2026-09-17: *"enable pan after zoom is hit"*). A fitted
disc has nowhere to pan to -- the whole of it is on screen, so a drag could only push it off --
but a zoomed one does, and a zoom you cannot move around is a zoom you cannot use. So on a phone
pan is not a stored choice at all: `phonePanWanted()` reads the camera, and pan is on while the
ratio is inside `fitRatio() * 0.995`. Fit turns it off again, which is the same `setPan(false)`
path flying the disc home. The toggle stays undrawn, because this is now automatic rather than a
choice.

`syncPhonePan()` is called from three places, and each covers a gap the others leave: the
media-query change (a pointer change fires no resize), the root's resize beat (in an emulated
browser a width change does not always fire the compound query), and the camera's own `updated`.

**That third one needs `fit()` to ask again when it lands, which is not obvious.** `syncPhonePan`
returns early while `fitting`, or a fit in flight would re-arm pan on every frame as the ratio
climbs back through the threshold -- and the camera's *last* `updated` is emitted by `setState`
**before** the animation's callback clears `fitting`. So every update during a fit is skipped,
including the one that lands on the answer, and returning to fit left pan armed. `landed()` calls
`syncPhonePan()` after clearing the flag. Measured as "at rest false, zoomed in true, back at fit
**true**" before the fix, which is a check reading a real defect rather than a flaky probe.

### The disc was the one place a thumb could not scroll from

This is the half that a layout change alone would have got wrong, and it is github#73's own
two mechanisms pointing the other way. `page.css` set `touch-action: none` on the mouse layer
and `captor.ts` called `preventDefault()` on every `touchstart` and every `touchmove`. Both
were right while the page itself panned -- they stop the browser panning the page out from
under a drag. With pan off and the page scrolling they are exactly backwards: the disc is the
top 375 px, so it is where a thumb lands.

So the captor claims a gesture only when it can use it -- `claimsTouch()`: more than one finger,
or `camera.enabledPanning` -- and the phone's layer is `touch-action: pan-y`. `touchend` keeps
its `preventDefault` at every width, because that one suppresses the compatibility mouse events
and a tap must still select once rather than twice; it is gated on `e.cancelable` only, so a
gesture the browser has already claimed does not log a warning per lift.

The gate is the camera's own flag rather than a width or a media query, which means the desktop
gets the same correction for free: with the pan toggle off at a desk, a touchscreen can now
scroll the page from the disc instead of being told nothing may move.

### The band's controls, and the one place 44x44 cannot be met

`#vg-compact` was **the only child of `.hrow` with no `order`**, so it stayed on line 1 beside
the source segment while `#vg-recent`, `#vg-heatnote` and `#vg-rangebox` were given 2, 3 and 4
and wrapped away from it -- measured at 390 px, x=191 on line 1, three lines and ~100 px from
the date range it compacts. It takes `order: 4` and joins that range's line. That is what
"the heatmap buttons render strangely" was.

**The rest of the row is `--vg-hrow-h: 32px`, and the 44 px sweep was wrong here** (Lukas,
2026-09-17, looking at it twice: *"the added and touched buttons are too big"*, *"the center and
dates stuff is also too big"*, *"way too much spacing around the year buttons"*). The calendar is
a **reference you read, not a keypad you drive**, and a row of 44 px controls made it the loudest
thing on the page: the band went from 314 px on `develop` to **409 px**. At 32 -- a bump on the
desktop's 26 rather than a doubling -- it comes back to **306 px**, under what it was before.
github#70's one-height rule is untouched; only the number changed, which is the whole point of
having declared it once.

**The recent lens is one line, and it sits beside the source segment rather than below it.** It
had `flex-basis: 100%` and `order: 2` from github#73, which gave it a line of its own; it takes
`order: 0` and `flex: 1 1 auto` now, so line 1 reads **NOTES / Added / Touched / Today / Last 7**.
It is also `flex-wrap: nowrap` with its own contained `overflow-x`: chips that do not fit scroll
inside the lens rather than making the band taller. `design/0010`'s "the band must never grow a
horizontal scrollbar" is about the band; this scroller is inside one control and the band's own
width is untouched. Chips are **26 px** against the row's 32.

**The year strip keeps its data-driven width and takes 22 px of height.** The chips are
absolutely positioned on a date axis, so their x *is* the data: measured at 390 px they sit
36-41 px apart, and widening each to 44 makes neighbours **overlap by about 8 px**, which is
strictly worse for a finger than 26 px chips with clear air between them. A 44 px-**tall** strip
was the first answer and it read as a band of empty space around six small words; 22 px is a real
bump on the desktop's 14 and the strip stops being a gap. The alternative still worth considering
is fewer, wider year chips on a phone, which is a product decision rather than a layout one.

**So the floor is two numbers, not one, and the check says so by name.** Outside the calendar,
44x44 -- the camera row, the calendar's toggle, the folder list, the sidebar's own controls.
Inside it, by height: 26 px for the row, 20 px for the year strip. Writing it as one relaxed
number would have lowered the bar everywhere to buy a compact calendar; writing it as two says
which controls are driven and which are read.

**The folder list is navigation now, not a legend.** It is what moved below the disc, so its
rows are targets: eye 20x18, twisty 16x18 and solo 29x17 all go to 44, and `.lg` gets a 44 px
minimum. The solo pill's border became a soft fill at that size, because 44x44 of 1 px border
draws a heavy empty box on every one of eighteen rows -- and the year strip's `::before` trick
does not carry over: inside `#vg-years` the button is positioned so the pseudo lands behind it,
while in the legend the nearest stacking context is the page root and the same pseudo disappears
behind the sidebar's background.

### Measured after

| | develop | here |
|---|---|---|
| over the disc box | `vg-zin, vg-zout, vg-reset, vg-pan, vg-sheet, vg-band` | **nothing** |
| the page scrolls | no -- `overflow-y: hidden`, 844 in 844 | **yes, by 1449 px** |
| disc box | 390x530, cropped left and right | **390x390, whole** |
| drawn radius p50 | 1.64 px | **1.64 px**, unchanged |
| controls under their floor | 79 of 81 | **0 of 79** |
| the band | 314 px | **306 px** |
| the recent lens | own line, free to wrap | **one line, beside the segment** |
| pan | on, toggle drawn | **off at fit, on once zoomed** |
| `#vg-compact` | line 1, x=191 | on the range's line |
| a thumb on the disc | `touchstart:prevented` | `TAKEN` by the browser |
| cascade while scrolled away | n/a | still walking, lit 166 -> 488 |

The cascade question `github#170` asked to have measured either way: it **keeps walking**. The
band and the count bars run on the same clock, so pausing one would desynchronise the others,
and nothing in the page watches scroll.

### Known limits, stated rather than discovered later

- **The scrollbar costs the disc 15 px in the harness and nothing on a phone.** `overflow-y:
  auto` reserves a classic scrollbar in desktop Chrome, so the square comes out 375 rather than
  390 and the radius reads 1.59 px instead of 1.64. Coarse-pointer devices use overlay
  scrollbars and lose nothing. It is a harness artifact, and the reason the two numbers in this
  record differ from each other.
- **A desktop choice still reaches a phone**, for the panels' *stored* state -- the layout now
  ignores it rather than obeying it, which is the fix for the symptom, not for the sharing.
- **Two fingers still only zoom**, unchanged from above.

## github#170, second pass — the calendar starts folded, and its toggle takes the disc's corner

The first pass shipped and was tried on a phone. Two asks came back, in his words: *"toggle
heatmap off by default and move heatmap toggle button to left upper corner of the graph view"*.
Both are about the phone layout only; the desktop default and the desktop toggle position are
untouched, and every measured desktop box is identical before and after.

### Folded is the layout's call, not the store's — corrected on the real vault

Two patterns were already in the file, one line apart, and they mean opposite things:

```js
var sheetOpen = typeof deps.sheetOpen === "boolean" ? deps.sheetOpen : !narrow();
var panEnabled = phone() ? false : storedPan;
```

`sheetOpen` is *"absent means nobody chose; the width decides"* (`decisions/0009`) — a stored
choice wins. `panEnabled` **overrides** a stored choice, because pan on a phone is not a choice at
all.

**This first shipped with the `sheetOpen` form, and installing it on the maintainer's own vault
proved that wrong the same afternoon.** His `data.json` already carried `"bandOpen": true` —
written by a click *on the desktop*, where the band is open anyway — so the phone obeyed a
preference he had never expressed for a phone, and "off by default" was unreachable there. Worse,
the only way to reach it was to fold the band on the phone, which would have written `false` back
and started his **desktop** folded too. One shared value cannot express two form factors.

So the band takes `panEnabled`'s form after all:

```js
var storedBand = typeof deps.bandOpen === "boolean" ? deps.bandOpen : true;
var bandOpen = phone() ? false : storedBand;
```

and `setBand` does not persist on a phone, exactly as `syncPhonePan` passes `setPan(want, false)` —
so a phone starts folded every time, a tap opens it for that session, and a desk's stored choice is
neither read nor written from there. Off a phone `storedBand` is the expression the literal `true`
always was, so the desktop path is unchanged — measured identical at 1600x1000, every box.

What was given up is real and was weighed: a phone reader who *wants* the calendar open taps once
per launch, because there is nowhere to remember that which is not the desk's setting. A separate
`bandOpenPhone` key would buy that back and is the obvious next step if anyone asks; it was not
worth a new setting and a migration for a band that is one tap away.

Not re-derived when the media query flips, either. `sheetOpen` is not, and re-folding a band the
reader opened two seconds ago on a rotate would be hostile.

> **Reversed by `github#173`.** It *is* re-derived now, in both directions — see
> "github#173 — what a mount-time read costs when the layout is live" at the end of this record.
> The paragraph above is kept because its reasoning is still the trade being made, not because
> the behaviour it describes survived.

### The corner needed no rule — it needed one deleted

The base rule has said this since `github#82`:

```css
.vault-graph #vg-mob {
  position: absolute; left: var(--panels-inset); top: var(--panels-inset); ...
}
```

`#vg-canvas` is `position: relative`, the phone block does not change that, and on a phone
`#vg-graph` is grid row 1, `justify-self: stretch; align-self: start` — so the canvas's own
corner **is** the graph view's corner. The first pass had overridden the rule to `position:
static; grid-row: 2`. Removing that override is the entire move, and it leaves one source of
truth for where the cluster sits rather than two that must agree.

`#vg-cam` keeps `grid-column: 1`. It reads like tidiness now that it is the row's only cluster,
and it is not: a grid item naming a row but no column auto-places, which creates an implicit
second column and takes its width out of the disc's `1fr` — measured at 334 px in a 390 px
canvas, every dot under 2 px.

### "Nothing over the disc" had to start meaning the disc

The first pass's own check measured every control against `#vg-graph`'s **bounding box**, and a
disc is a circle in a square. A control in the corner would have failed a check about a circle
it never touches, and the temptation is to except the corner — which would leave the check
unable to catch a control that really did cover dots.

So the check was made to say what it always meant. It takes the drawn disc from the renderer —
`graphToViewport` over the drawn nodes, plus each dot's `scaleSize` — and tests the nearest point
of each control's box against that radius. Every existing control sits wholly outside the square,
so no verdict changes. The corner passes on merit:

| at 390 px | |
|---|---|
| the disc square | 390x390 at 0,0 |
| the inscribed circle | radius 195 at 195,195 |
| the **drawn** disc | **radius 167** |
| the toggle | 44x44 at 12,12 |
| its nearest corner to the centre | **197 px** |
| clearance against the drawn disc | **~30 px** |

It clears the inscribed circle too, by 1.6 px — but the drawn disc is the honest measurement and
the one that survives a fit-cap change.

### Two traps in measuring a default, both of which made the check unable to fail

**`bandOpen` is read once, at mount.** The harness resized a page into a phone, so what it
measured was the default for the size the page *booted* at, not the phone. Both checks reboot
under the emulation now, which is what "a phone opening the page" actually is.

**And the exported page persists `bandOpen` to `localStorage`** (`shell.html`, `decisions/0009`).
The check taps the band open and shut to prove the fold has a way back — which stored `false`.
The next boot would then have started folded *because of the tap*, not because of the default:
the second device's assertion could never have failed, and neither could a future regression.
`reboot()` forgets that one key first. The other half is asserted on purpose, since it is the
design above: with `open` stored, a phone keeps it open.

### Measured after, at load, booted at size

| | first pass (`a0a7612`) | here |
|---|---|---|
| the calendar at load | open, 306 px | **folded** |
| the disc's top | y=306 | **y=0 — first on screen** |
| the toggle | 12,704 (iPhone) / 12,726 (Pixel) | **12,12, the disc's corner** |
| page height, iPhone 14 | 2210 | **1904** |
| page height, Pixel 7 | 2232 | **1926** |
| drawn disc radius | 167 / 178 | **167 / 178**, unchanged |
| over the drawn disc | nothing | **nothing** |
| a tap on the toggle | n/a | band open above the disc, tap again folds it |
| 390x844 on a mouse | calendar open | **calendar open** |
| a desk's stored `open`, on a phone | obeyed — band open | **ignored — band folded** |
| a phone's own tap | wrote the shared setting | **leaves the desk's value untouched** |
| desktop, 1600x1000 | every box | **identical, every box** |

### Known limits, stated rather than discovered later

- **A phone reader who wants the calendar open taps once per launch.** There is nowhere to
  remember that which is not the desk's setting, and the desk's setting is exactly what a phone
  must stop reading. A `bandOpenPhone` key would buy it back; it was judged not worth a new
  setting and a migration for a control one tap away.
- **The sheet still has the flaw the band just lost.** `sheetOpen` is one shared value across
  form factors too, and nothing here changed that — it simply was not what was reported.
- **The reboot is a real page load in the middle of a shared page's run.** It leaves the page
  cleaner than the state manipulation it replaced, but it is the one new cost in this check.

## The recording overlays, `#vg-demotap` and `#vg-democursor` (github#174)

`#vg-demotap`'s two rings animate through `el.animate()` rather than a CSS keyframe: the file
has no keyframes anywhere else, and one ripple does not earn the file its first one.
`#vg-democursor` swaps its arrow glyph for a finger glyph under the same `(max-width: 720px)`
breakpoint the layout uses, because a recording taken at a phone's width is showing a touch
gesture and a mouse arrow there would be showing the wrong input.

## github#173 — what a mount-time read costs when the layout is live

**Status** as-built · 2026-09-17 github#173

A code review of `2.8.0..develop` raised four claims about the work above, all unverified. Each was
reproduced first, on the demo fixture at iPhone 14 and Pixel 7, coarse, booted at size. **Three
were real. One was not, and the difference is the whole point of measuring first.**

The three share one shape: **something the phone layout decides was read once and then trusted**,
while the layout itself is a media query and therefore live. github#170 already learned this about
pan — `syncPhonePan()` exists precisely because "a mount-time read of pan was not enough" — and
then left three more reads in the same condition.

### A settings push is not a reader's choice, and on a phone it never was

`api.setPanEnabled` did `setPan(phone() ? false : storedPan, false)`. On a phone that is an
unconditional `setPan(false)`, which flies the camera home — and `applyHiddenDefaults()` pushes
`setPanEnabled` after **every** settings-tab change, so hiding a single folder discarded the
reader's zoom. Measured: zoomed **0.795** with pan armed, back to **0.954** with pan off.

It asks `phonePanWanted()` now, which is the same live read the mount path and `syncPhonePan`
already use. Off a phone `phonePanWanted()` **is** `storedPan`, so the settings row still decides
there — asserted separately, because a fix that merely left pan on would satisfy everything else.

### The band's re-derivation, and the guard that stops it eating itself

`bandOpen` came from `phone()` at mount; `setBand` gated persistence on a *live* `phone()`. Booted
coarse at 700x900 the band folded correctly. Rotated to 900x700 it **stayed folded** although the
host had stored `true` — and two taps at that width then wrote that stored `true` to **`false`**.
A phone rewriting the desk's setting by way of a resize is the exact failure the second pass
existed to prevent; the resize was the hole left in it.

`syncPhoneBand()` mirrors `syncPhonePan()`, and `storedBand` follows every deliberate desk choice
the way `storedPan` already did — without that second half, a tap made at desk width would be
undone by the next rotation, since `storedBand` was only ever read at mount.

**It fires only when the predicate itself flips, and that is not a refinement.** `setBand` changes
`data-band`, which reflows the root, which fires the root's own `ResizeObserver`. A
`syncPhoneBand` guarded merely on `want !== bandOpen` therefore folds the band back the instant a
phone reader opens it — the toggle stops working altogether. `bandPhone` holds the last answer and
the function returns early when it is unchanged. The new check's own last assertion caught this on
its first run; nothing existing would have, because the github#170 checks tap the band at one width.

What was given up is the paragraph reversed above: a reader who opens the calendar on a phone and
rotates to a desk width loses it **iff** the desk's own stored value is `false`. Weighed against a
phone silently rewriting that value, which is what was actually happening.

### A flight is not the reader panning

`fit()` turns `enableCameraPanning` on for its 380 ms flight, and it has to — `camera.validateState`
drops `x` and `y` while that flag is false, so a fly-home without it would not move. `claimsTouch`
reads `camera.enabledPanning`. So tapping Fit and swiping at once had the swipe claimed and the
page could not scroll, against an at-rest control that releases it:

```
at rest      touchstart/1:live:free      | touchmove/1:live:free | touchmove/1:TAKEN:free
after Fit    touchstart/1:live:prevented | touchmove/1:live:free | touchmove/1:live:free
```

`handleTouchStart` already called `stopAnimation()`, which runs `fit()`'s own `landed` callback
**synchronously** and restores the flag. It simply did it *after* `claimsTouch` had answered. That
call moves above the claim, so the claim is decided on the settled flag — two lines, and the engine
still knows nothing about `fit()`. The desktop gets the same correction for free, exactly as
`claimsTouch` itself did.

### `phone()` was not free, and it sat on the camera's per-frame path

It built a fresh `MediaQueryList` on every call, and `syncPhonePan` ran on every camera `updated`:
**1.00 `matchMedia` call per camera update**, on a desktop too, to conclude nothing had changed.
`phone()` reads the `phoneMq` held from mount — the bind block's own object, hoisted rather than a
second one — and the per-frame caller returns early off a phone. **0.00 per update** at both widths.
The media-query and resize-beat callers keep the full body, so the interrupted-flight repair above
stays reachable on a desktop.

### The claim that did not reproduce

"A late second finger loses the pinch." The premise is exactly right and is in the trace: the thumb
crosses the slop, the browser commits to the `pan-y` scroll, and every later `touchmove` arrives
non-cancelable.

```
touchstart/1:live:free | touchmove/1:live:free | touchmove/1:TAKEN:free
| touchstart/2:live:prevented | touchmove/2:TAKEN:free | touchmove/2:TAKEN:free
```

The conclusion is wrong. `handleTouchMove` runs the pinch arithmetic **after** the `claimsTouch`
guard, not inside it, so a non-cancelable move still zooms:

| | ratio | factor |
|---|---|---|
| both fingers down first | 0.954 → 0.21042 | **x4.534** |
| second finger late | 0.954 → 0.43-0.49 | **x2.2 – x2.9** |

Both track `pinchRatio * (pinchSpread / now)` to five decimals; the late run's smaller factor is its
smaller spread change, not a lost pinch. And `claimsTouch` short-circuits on `e.cancelable`, so
`preventDefault` is never called on an event that has none — no warning per move either. Closed with
the measurement, and asserted in the check so it cannot be reopened on a reading.

### Known limits, stated rather than discovered later

- **A phone reader who rotates to a desk width gets the desk's calendar.** That is the trade named
  above, and a `bandOpenPhone` key is still the way to buy it back.
- **`sheetOpen` still reads once at mount**, and nothing here changed that — it was not what was
  reported, and re-deriving it would need the same `bandPhone`-style flip guard.
- **The fix flight still lands early when a finger touches down.** `stopAnimation()` running
  `landed` is what makes the reorder work, and it also means a touch arrests a fit part-way. That
  was already true and is still what the design wants: a gesture stops an animation.

## github#175 -- the tail of the flight, and three smaller things

**Status** as-built · 2026-09-17 github#175

A second code review, of `fd08e12..develop`, raised five claims about the work above. Each was
reproduced first, on the demo fixture at iPhone 14 and Pixel 7, coarse, booted at size, headless
over CDP. **Four were real. One was not**, and again the difference is the whole point of
measuring first.

### github#173's repair was complete only until the flight's own tail

github#173 moved `stopAnimation()` above `claimsTouch` so the claim is decided on the settled flag.
That is right, and it is not enough, because of what `stopAnimation()` synchronously *does*:

```
handleTouchStart
  stopAnimation()            -> runs fit()'s landed, synchronously
    landed()                 -> fitting = false; enableCameraPanning = panEnabled (still true)
      syncPhonePan()         -> the tail has taken the ratio back over fitRatio() * 0.995,
                                so phonePanWanted() is now false
        setPan(false)        -> panEnabled = false, and then...
          fit()              -> forces enableCameraPanning TRUE for a fresh 380ms flight
  claimsTouch()              -> reads camera.enabledPanning === true, and TAKES the swipe
```

So the flag `claimsTouch` reads is not the settled one after all -- it is one a second `fit()` set
two frames earlier. Measured, zoomed 0.795 and a finger down at +345ms of the 380ms flight:

```
at rest      touchstart/1:live:free      | touchmove/1:live:free | touchmove/1:TAKEN:free
in the tail  touchstart/1:live:prevented | touchmove/1:live:prevented | touchmove/1:live:prevented
```

with `panning true` while `panEnabled false` at the moment of the touch -- the fingerprint of a
flight `setPan(false)` had just started, and the thing that names the cause rather than the
symptom.

**The fix is at the source: `setPan(false)` stops flying a disc that is already home.** It asks
`atFit()` and sets `enableCameraPanning` false directly instead. Nothing is added at the input
layer -- the engine still knows nothing about `fit()`, exactly as github#173 left it.

### The guard's band is the pan predicate's band, and its epsilon is not decoration

`atFit()` compares the camera against `fit()`'s own target (`fitTarget()`, so the two cannot
drift): the ratio within **0.5 % of `fitRatio()`**, which is the same 0.995 `phonePanWanted()`
reads, so the two are **exactly complementary** -- whenever pan is not wanted, no flight is owed.
Then x, y and angle within `1e-3`.

Measured at the instant the finger lands, both viewports and both zoom paths: `dRatio` **-0.0013 to
-0.0025**, and `dx`/`dy` **exactly 0.000000**. The zoom buttons animate `ratio` alone and a bare
`setState({ratio})` touches nothing else, so on the reported path the positional epsilon costs the
fix nothing -- and it is what keeps a genuinely **panned** disc flying home rather than being
stranded a few pixels off centre.

**`camAtRest` was the obvious guard and is the wrong one.** `landed` sets it true even when the
flight was **arrested**, which is precisely the case here -- so guarding on it would skip the
flight for a disc still far from home. The measurement that made the choice is the one above: the
tail is close in *ratio*, and `camAtRest` cannot tell a tail from a mid-flight.

A quieter win came with it: the disc now flies home **once**. `enableCameraPanning` went off at
**782 ms** against a 380 ms flight before, and **393 ms** after.

### A settings push mid-flight cannot arm pan, and that is structural

The claim: `api.setPanEnabled` asks `phonePanWanted()` with no `fitting` guard, so a push during a
fit flight reads the transient ratio, arms pan, and the landing flips it back -- the button
flickers and the disc flies home twice.

The premise is accurate about the code. The conclusion does not survive the same flight run twice:

| | ratio reaches fit | `panEnabled` off | `enableCameraPanning` off | flips |
|---|---|---|---|---|
| no push | 392 ms | 392 ms | 788 ms | 1 |
| push at +121 ms | 390 ms | 390 ms | 787 ms | 1 |

**1 ms apart** -- sampling noise. A push landing on the **boot** flight, which is what
`applyHiddenDefaults()` actually does, flips pan **0** times.

And the reason is structural rather than lucky. On a phone `syncPhonePan()` runs on the camera's
own `updated` and arms pan the instant the ratio drops below the threshold, so a flight *toward*
fit only ever starts from a state where pan is **already armed**: the push's
`setPan(phonePanWanted())` is a no-op on the way up, and at or above fit `phonePanWanted()` already
answers `false`, which is what the state already is. **There is no window in which the push sees a
sub-fit ratio with pan off.** The doubled flight the claim points at is the redundant `fit()`
above, present with or without any push.

So **no `fitting` guard was added**, defence in depth included -- a guard for a defect that cannot
occur is a constant nobody can justify from a measurement, and this file's own constants were each
earned. Closed with the numbers, and asserted in the check so it cannot be reopened on a reading.

### Two smaller ones from the same review

**Every rotation to landscape wrote the plugin's settings for nothing.** `syncPhoneBand`'s
phone->desk flip calls the non-quiet `setBand(storedBand)`; off a phone that re-assigns
`storedBand` to itself and still fired `onBandOpen`, so the host saved a value it had already
stored. Counted by wrapping the shell's `saveSettings`: **1** call across a rotation that changed
nothing, **0** after. The callback is gated on the stored value actually moving.

The **quiet** form would also have worked for the write and was rejected: `quiet` skips
`afterPanel()`, and the flip needs that to lay the band out -- github#173's own check asserts
`laidOut` on exactly that rotation. Gating the callback removes the write and keeps the relayout.
A deliberate desk tap still writes through; the gate is "the stored value moved", not "say nothing".

**`narrow()` was not free either.** It built a fresh `MediaQueryList` per call -- the allocation
github#173 took out of `phone()` -- at **1.00** `matchMedia` call per read against `phone()`'s
**0.00**, and it is read from `select()`, the sheet and the note-card toggles. `narrowMq` is held
from mount, and the read-panel listener binds to **that** object rather than building a second one
for the identical `(max-width: 720px)` query. **0.00** per read.

### Known limits, stated rather than discovered later

- **A disc arrested inside `atFit()`'s band stops there rather than finishing the last 0.5 %.**
  Measured at 0.26 % of the ratio and sub-pixel, and snapping it exactly was rejected because a
  `setState` would fire the camera's `updated` re-entrantly into `syncPhonePan` for nothing visible.
- **Outside the band, the flight and its 380 ms of armed panning are unchanged**, so a finger that
  lands early in a fit from a genuinely zoomed disc is still claimed -- which is correct, since pan
  is what that reader wants, and it is the same "a gesture stops an animation" the previous section
  names.
- **`sheetOpen` still reads once at mount.** Unchanged by this pass, and still not what was
  reported.
- **Turning pan off inside a zoom animation no longer cancels it.** `setPan(false)` used to call
  `fit()`, and `camera.animate` cancels whatever frame is in flight; the guard skips that, so a
  `zoomBy` animation started moments earlier now completes and leaves the disc slightly off fit
  with pan off, rather than flying home. Reachable only off a phone -- on one, no `setPan(false)`
  fires during a zoom, because `phonePanWanted()` only answers `false` at or above fit -- and only
  inside the first few milliseconds of the 120 ms zoom, while the ratio is still within
  `atFit()`'s band. Found by reading the diff rather than by a measurement, stated rather than
  guarded: it needs two inputs a few milliseconds apart, and the next Fit tap corrects it.

### github#182 named this guard as a suspect and CLEARED it

github#182 -- a fitted disc that does not re-centre when the window resizes -- opened by naming
`atFit()` as the likely cause: a resize keeps the ratio and moves the stage centre, so a camera
"at fit" by ratio would not be at fit by position, and any resize path reaching the camera through
`setPan` would skip the re-centre.

**It is not the cause, and the reasoning it rests on is not what the guard does.** `atFit()` has
never been a ratio-only test -- it compares x, y and angle within `1e-3` as well, as the band
section above says -- so an off-centre camera fails it and still flies home. And on the resize path
the question never arises: off a phone `phonePanWanted()` returns `storedPan`, which a resize does
not change, so `syncPhonePan()` calls `setPan` at all only on a real flip.

Measured rather than argued, on the demo fixture at `e4b962f` (the merge **before** github#175) and
at `62e235d`: **identical readings, to the pixel** -- 225 px down after the stage went `672x772` to
`672x322`, 320 px left after `672x772` to `1312x772`, with the camera at `(0.5, 0.5)` and the ratio
at `0.954` throughout in both. A defect that predates a change by one merge and reproduces
byte-identically on both sides of it was not introduced by that change.

The real cause was a stage the renderer never re-measured: `resize()` runs only inside `render()`,
and a container-only resize scheduled neither. github#182 has it, and nothing in this section
changed.

## github#178 — the host's CSS, and the promise github#170 made and did not keep

**Status** as-built · 2026-09-17 github#178

> Every phone check in this repo ran on a page that carries none of Obsidian's stylesheet. The
> one surface that decides how the band's controls are drawn was the one nothing measured.

github#170 saw this coming and got most of it right. `invariants.md` already says that `page.css` is
scoped so the page cannot style its host, that **nothing stops the host styling the page**, and that
"a bare `<button>` inside Obsidian wears Obsidian's radius, min-height and shadow" — it named
`#vg-heatsrc button` as the one control in the band declaring no radius, and gave it one. It even
stated the structural gap outright: a host-CSS collision "is invisible to every gate that runs on a
push", and that the fix was "confirmed only on the device".

Two things it did not do. It audited **which controls declare a `border-radius`** — and the property
that was actually breaking the segment is `height`, which nobody enumerated. And "confirmed only on
the device" stayed true, so the next regression had to be reported from a phone again, which is what
happened. This section is the harness that closes that, and the audit done by measurement instead of
by eye.

### The gap was in the harness, not in anyone's reasoning

`smoke.mjs`, `mobile-check.mjs` and every phone reading in this record drive **the exported page in
Chrome**. That page is one HTML file with `page.css` inline and nothing else. The plugin is a
different situation entirely: `page.css` is shipped as `styles.css` and injected into **Obsidian's
own document**, where `app.css` is already styling bare `button` and `input` elements. So a control
that sets its colour, its border and its font but not its `height` gets whatever the host says —
and no Chrome check can see that, because in Chrome there is no host.

`scripts/host-phone-check.mjs` is that surface. `CONTRIBUTING.md` has how to run it.

### What the host actually sets, read out of `app.css` rather than guessed

Obsidian ships its stylesheet inside `resources/obsidian.asar` as `/app.css` — 637 KB, 21,708
lines. The rules that reach the band:

| where | what |
|---|---|
| `app.css:7199` | `button { height: var(--input-height); padding: var(--size-4-1) var(--size-4-3); display: inline-flex; align-items: center; justify-content: center; font-size: var(--font-ui-small); font-weight: var(--input-font-weight); border-radius: var(--button-radius); border: 0; white-space: nowrap }` |
| `app.css:7219` | `button:not(.clickable-icon) { background-color: var(--interactive-normal); box-shadow: var(--input-shadow) }` |
| `app.css:8222` | `input[type='date'], input[type='text'], … { background; border; color; font-family: inherit; padding: var(--input-padding); font-size; border-radius: var(--input-radius); outline: none }` |
| `app.css:18747` | `.is-mobile { --input-height: var(--touch-size-m); --input-radius: var(--touch-radius-m); --input-border-width: 0px; --input-padding: var(--size-4-1) var(--size-4-4); --input-font-weight: var(--font-medium) }` |
| `app.css:2842` | `--touch-size-m: 44px`, and `--size-4-1: 4px`, `--size-4-3: 12px` |

So **inside Obsidian on a phone every bare `button` is 44 px tall**, and on the desktop 30 px.

### One control had no height, and it was the one in the photograph

`#vg-heatsrc` — the Added | Touched segment — is `height: var(--vg-hrow-h)` with `overflow: hidden`,
and its two buttons took their height from the flex stretch, which is to say they specified none.
Under the host they were 44 px inside a 32 px box: clipped top and bottom, and with the label
centred in the 44 rather than in the 30 that shows, **sitting about three quarters of the way down
the visible box**. That is exactly what "Added renders as a solid filled blue block, taller than
Touched, the outline broken between them" is.

**It was wrong on the desktop too**, and had been all along: 30 px halves in a 26 px row. Nobody
had looked, for the same reason nobody had looked at the phone.

**And github#70's check could not have caught either**, which is worth stating rather than
discovering again. "Every control in the band's row is the same height" measures `#vg-heatsrc` — the
*container* — along with `#vg-recent`'s chips, `#vg-compact`, the two date fields and `#vg-rangeall`.
The container was always the right height. The check never looked at the two buttons inside it.

### The reset is scoped to the band and deliberately weak

```css
.vault-graph #vg-heat :where(button),
.vault-graph #vg-heat :where(input) { height: auto; box-shadow: none; }
```

`:where()` contributes nothing, so this is **(1,1,0)**. That is above every `app.css` rule that
reaches these elements — `button` is (0,0,1), `button:not(.clickable-icon)` is (0,1,1),
`input[type='date']` is (0,1,1) — and at or below every rule of the band's own, so it sits *above*
them in the file and they still win:

| rule | specificity | wins against the reset by |
|---|---|---|
| `.vault-graph #vg-heatsrc button` | (1,1,1) | specificity |
| `.vault-graph #vg-recent .chip` | (1,2,0) | specificity |
| `.vault-graph #vg-rangebox .dt` | (1,2,0) | specificity |
| `.vault-graph #vg-years button` | (1,1,1) | specificity |
| `.vault-graph #vg-compact` | (1,1,0) | a tie, and it comes later |
| `.vault-graph #vg-rangeall` | (1,1,0) | a tie, and it comes later |

**Two declarations, not a sweep, and that is the finding rather than a shortcut.** Everything else
`app.css` sets — padding, background, border, radius, font — is already set by a band rule, so a
blanket reset would only have taken things *away*: `.vault-graph button.btn` is **(0,2,1)**, which
loses to anything carrying an id, so a reset at (1,1,0) would have stripped the chips and
`#vg-rangeall` of the `padding: 5px 8px` and the 6 px radius they get from `.btn`. `height` and
`box-shadow` are the only two properties the host sets that nothing in the band sets back.

No `!important` anywhere: the issue asked for specificity to do the work, and it can.

### The lens wrapped the line it was written to scroll inside

Also ours, and github#170 had already described the behaviour it was supposed to have: the lens is
`flex-wrap: nowrap` with its own contained `overflow-x`, so "chips that do not fit scroll inside the
lens rather than making the band taller". It was also `flex: 1 1 auto` — and an `auto` basis is the
item's *content* size, which is exactly what a flex line is broken on. So the lens never reached the
scroller it was given: with three chips it did not fit line 1 and took a line of its own, which is
the second item in github#178's list.

`flex: 1 1 0` never forces a wrap, and the lens still ends up the same width, because it is the only
item on that line with a non-zero `flex-grow` — so on the exported page the *box does not move at
all*, and only the declared basis changes.

**Two chips fit and three do not, which is why no fixture had ever shown this.** The exported page
has no "Since last open" chip at all (github#70), and a throwaway vault has no `lastSeen` for the
plugin to build one from — so every harness run until this one measured a two-chip lens. `--seen-days`
seeds it. This is `.ai-context/mobile-harness.md`'s rule about vault shape, one level down: the
shape that could not exhibit it was not the vault's notes but the plugin's own stored state.

**And then the third chip was dropped on a phone, which is Lukas's call and not the layout's.**
Looking at the fix (2026-09-17): *"you need to drop the since last open button it goes out of the
page, just don't show it on mobile as ui decisions rest looks good."* Scrolling it inside the lens
was the layout's answer, and it worked — but it leaves the chip reading `Sinc…`, clipped at the
lens's edge, and a word cut mid-syllable reads as broken to anyone who does not know the lens
scrolls. `.vault-graph #vg-recent [data-kind="open"] { display: none }` inside the phone block, and
the two remaining chips fit the line exactly (**181 in 181**, no scroll).

The lens keeps `flex: 1 1 0` anyway. It is what stops *any* future content wrapping the row — a
longer locale, a fourth control, a bigger count slot — and it costs nothing, since the box is
unchanged either way. Hiding the chip removes today's cause; the basis removes the class of cause.

**This is the phone dropping a control, not the page losing one.** `#vg-recent` still builds all
three (the chip is `display: none`, not absent), so nothing about the desktop, the exported page or
`recentCount` changes, and a rotate to a desk width brings it straight back — the same live-layout
discipline github#173 established for the band.

### The year strip was ours, and the phone only made it visible

Not a host problem at all. `buildYears` puts `left: <the year's x>` on a chip and the CSS centres it
there with `transform: translateX(-50%)`, so **the first chip — always at x=0 — hangs half its own
width to the left of the strip**. On the desktop that half is 12 px and the band's padding is 14, so
it lands in the padding and reads as deliberate. On a phone the chip is 28.38 px wide, half is
14.19, and the 0.19 px over the edge is the clipped `'14` in the photograph.

The thinning was the other half. `every = minGap < 28 ? 2 : 1` tests the **raw per-year gap** against
a constant that approximates a chip, and never re-checks the gap *after* thinning, nor against the
chip's real width. Measured headless on the demo fixture, the tightest gap between two kept chips is
**7.6 px at 390 and 0.6 px at 320** — so the strip was one denser vault away from the overlap that
was reported, and on a 650-note vault spanning 2014–2026 with the compact axis on, it was over it.

`fitYears` does two things and neither re-spaces anything:

- **Clamp, to the band and not to the strip.** A chip may still bleed into the band's padding —
  that is what the padding is for, and it is what keeps the chip's x equal to its data, which
  design/0013 says above is the whole point of the strip. It may not go past the band's edge. The
  bound is the exact float: an earlier cut used `Math.ceil` and the one pixel it overshot turned a
  0.6 px gap at 320 into an overlap and cost the strip a chip.
- **Sweep right to left and drop what still collides.** Backwards, because the newest year is the
  one worth keeping; the thinning rule github#23 wrote is untouched, so *which* years are round is
  unchanged.

`fitYears` caches the chip width and the band's padding against the ribbon width, because
`drawDateUI` runs inside `onFrame` during a brush drag and an uncached `getBoundingClientRect` after
`replaceChildren` forces a second layout every frame.

### Measured after

The exported page, every box and every computed property of every element under `#vg-heat`, against
the tree at `e4b962f`, headless, demo fixture:

| | |
|---|---|
| 1600 px | **identical**, 39 elements |
| 390 px | **two differences, and both are the fix** — the leftmost year chip, x −0.19 → 0.00, and `#vg-recent`'s `flex-basis: auto → 0px` **with its box unchanged** |

And the six items, in a real Obsidian — demo fixture, 390×844, mobile emulation, `--seen-days 7`
so the lens has the three chips a real vault has:

| | before | after |
|---|---|---|
| 1 the segment's halves | **44 / 44 px** in a 32 px box, labels **7 px low** | **30 / 30 px**, labels centred |
| 2 the recent lens | its **own line** (top 502 vs the segment's 462), the row on **5 lines**, three chips | **beside the segment** (462), **4 lines**, **two chips, 181 in 181** — the third is dropped on a phone |
| 3 the fold button and the date fields | **32 px, all four** | unchanged — **this one did not reproduce** |
| 4 the year strip | `'16` **outside the band** | inside, nothing dropped |
| 5 the band's boxes | `#vg-heatsrc` **116×44 in 116×30** | **nothing overflows**; ribbon and strip both 350@14 |
| 6 the calendar's fold | `data-band="off"` at first open | unchanged — **it already held** |

A bare host button stays 44 px throughout: the reset outranks `app.css`, it does not change it.

**Two of the six were not defects, and measuring them is the answer rather than a miss.** The fold
button and both date fields are 32 px, and the date fields carry the band's own 5 px radius and
12 px font rather than the host's 44 px radius — so "the inputs render as Obsidian text inputs" is
not what is happening. And the calendar *does* come up folded inside the host, which github#178
asked to have settled either way.

**The "three overlapping controls" is two, and both are the desktop's.** `drawRibbon` paints one
canvas: the month histogram, then the heatmap-window scrubber — a 2 px track across the full width
with a rounded pill for the window — and then the date-range brush, which dims outside the range and
draws a 9 px grab handle at each end. That is the pair github#70's "the band's window and the brush
move independently" is about. Nothing sits between the ribbon and the strip, and the two are the
same width and left edge. At 390 px they simply read as clutter, which is a product question and is
left alone here.

**The desktop's own halves are wrong too** — 30 px in a 26 px row, measured with `app.css` injected
ahead of `page.css` in headless Chrome rather than in Obsidian itself, and 24 px after. That reading
is a simulation and is labelled as one; the phone numbers above are from the real host.

### Known limits, stated rather than discovered later

- **`app.emulateMobile(true)` is not a phone.** It sets the `is-mobile` / `is-phone` classes and the
  mobile layout, and with CDP touch emulation and a 390 px override it is the closest thing that
  runs on this machine. Font metrics, the real safe-area insets and iOS's own form-control
  rendering are still Chrome-on-Windows.
- **The chip-width cache is keyed on the ribbon width.** A font or theme change that alters the chip
  at an identical ribbon width leaves it stale until the next resize. Cosmetic, and the alternative
  is a forced layout on every frame of a brush drag.
- **A chip the sweep drops has no label at all**, so at a very narrow width a year with notes in it
  can go unnamed. That is the conservative half of a question design/0013 already parked — fewer,
  wider year chips on a phone — and it stays parked.

## What this deliberately does not do

Coarse-pointer 44 px hit areas on the range handles, the year chips and the legend's eyes; node
dragging by touch; and the suite's own touch checks — those need
`Emulation.setTouchEmulationEnabled` on the shared page, which would change `pointer: coarse`
for every other check in the run, so they stay in `mobile-check.mjs` until that is worth its own
issue. The iPad is left on the desktop layout on purpose: 744 px is above the breakpoint and the
two-column layout is the better one there.
