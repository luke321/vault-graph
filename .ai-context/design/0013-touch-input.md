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

**A tap emits the events that already exist.** A release under `TOUCH_TAP_SLOP_PX` (10) of
travel emits `click`, which the renderer already maps to `clickNode`; a second tap inside the
mouse path's own `DOUBLE_CLICK_TIMEOUT` (300 ms) emits `doubleClick`, which the page already
binds to `fit()`. So neither the renderer nor the page needed a new event, and a double-tap
means what a desktop double-click means.

**A tap also does the hover's job for free.** `state.hovered || state.selected` is what drives
the focus ramp, the lit links and the dimming, so selecting a note raises it and lights its
links without any synthetic hover. Hover has no meaning on glass and none is faked.

**Nothing in the touch path emits `mousedown`**, so `bindNodeDrag` — armed on the renderer's
`downNode` — stays mouse-only. Dragging a note into the hub is a pointer gesture; on a phone
the same pin is one button on the note's own card. That is deliberate: a finger anywhere pans,
and on a full disc there is almost no empty space to start a pan from if dots claimed the
gesture.

Two re-seating cases are worth knowing, because both otherwise read as a jump. A finger lifted
**out of** a pinch leaves one behind, and a finger added **to** a pan starts one: in both the
handler re-seats `lastTouch` and the pinch baseline instead of panning from a stale point.

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
left of the stage summon what was in the way.

- **The legend, search and view buttons** slide up as a sheet: `#vg-sidebar` leaves the grid
  (`position: absolute`, `translateY(101%)`), and `[data-sheet="on"]` on the root brings it in.
  It keeps its own scrolling, so the whole legend is reachable.
- **The band and the date strip** are hidden and shown, never overlaid. `design/0010` states
  the band sits in its own grid row of `#stage` "so the disc is centred in what is left and the
  two cannot collide however short the window gets" — hiding the row honours that, floating the
  band over the disc would not. `HEAT_WEEKS` stays the sanctioned lever if the axis ever needs
  to be shorter; the band must never grow a horizontal scrollbar, which `0010` records as an
  already-shipped, already-reported regression.

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

## What this deliberately does not do

Coarse-pointer 44 px hit areas on the range handles, the year chips and the legend's eyes; node
dragging by touch; and the suite's own touch checks — those need
`Emulation.setTouchEmulationEnabled` on the shared page, which would change `pointer: coarse`
for every other check in the run, so they stay in `mobile-check.mjs` until that is worth its own
issue. The iPad is left on the desktop layout on purpose: 744 px is above the breakpoint and the
two-column layout is the better one there.
