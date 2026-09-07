# Touch input, and the phone's two panels

**Status** as-built · 2026-09-07 · github#73

> A finger pans, two pinch, a tap selects; and on a narrow screen the disc gets the screen
> while the legend and the band are summoned. What had to be true for any of it to work.

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
a panel toggle would fight "a manually moved camera is left alone by a visibility toggle".

Panel state is **session state, not a setting**: it is a fact about the screen in front of you,
not about the vault, so `decisions/0009`'s settings channel is not involved and nothing is
persisted.

## Known limits, stated rather than discovered later

- **`isMoving` and `movingTimeout` are shared with the mouse path.** On a hybrid device a touch
  can cancel a mouse drag's inertia and the reverse. Separating them means per-input state, and
  no such device has been measured here.
- **Two fingers only zoom.** A two-finger drag at constant spread does nothing; the midpoint is
  tracked for the pinch, not for a pan.
- **The catchment can select a neighbour.** At a 1.4 px median radius a 14 px catchment is
  coarse by construction. It is what makes a tap work at all; more radius wants a filter or a
  zoom, not a smaller catchment.

## What this deliberately does not do

Coarse-pointer 44 px hit areas on the range handles, the year chips and the legend's eyes; node
dragging by touch; and the suite's own touch checks — those need
`Emulation.setTouchEmulationEnabled` on the shared page, which would change `pointer: coarse`
for every other check in the run, so they stay in `mobile-check.mjs` until that is worth its own
issue. The iPad is left on the desktop layout on purpose: 744 px is above the breakpoint and the
two-column layout is the better one there.
