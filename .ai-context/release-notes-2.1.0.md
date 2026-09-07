**Mobile.** The disc claimed to work on a phone and did not: a finger could neither pan it,
pinch it, nor tap a note, and it was drawn in under a third of the screen. Both halves are fixed,
and the desktop picture is unchanged — asserted rather than assumed.

### A finger drives the disc

<img src="https://raw.githubusercontent.com/luke321/vault-graph/develop/assets/features/mobile.webp" width="406" alt="A phone-sized window with a fingertip for a pointer: the disc zoomed in until its dots are finger-sized, a note tapped so its card rises as a sheet at the foot, the folder list slid up as a sheet and a folder hidden from inside it, the disc re-packing when the sheet goes away, the calendar put away and brought back, then a double-tap fitting the whole disc back into view">

One finger pans, two pinch about their midpoint, a tap raises a note and opens its card, and a
double-tap fits the disc back into view — the same meaning the desktop double-click has.

Two things were in the way. The renderer's input layer listened for a mouse and nothing else. And
a tap did not even fall back to a click, because the page sets `touch-action: none` on the layer
that takes input — right for stopping the browser panning the page out from under a drag, and it
suppresses the tap-to-click with it. Picking was fine all along: the same coordinates with a click
always selected the right note.

**A finger is not a pointer**, so picking learned the difference. The pointer's catchment is sized
for a mouse arriving in whole pixels; every dot on a phone draws under 2 px, so a tap reaches for
the nearest note within about half a fingertip while the mouse keeps its own measured catchment
exactly.

### The disc gets the screen

Below 720 px the disc takes the viewport instead of 31% of it under a folder list. The folders,
search and view buttons slide up as a sheet from two buttons at the top left. The notes-added
calendar and its date strip stay on and can be put away — showing them costs the disc no dot size
at all, because the disc is fit to the narrower axis and the extra height buys margin rather than
radius. A note's card rises as a sheet at the foot, so the disc stays visible above whatever you
tapped.

The iPad keeps the two-column desktop layout on purpose: at 744 px it is above the breakpoint, and
there it is the better one.

### Nothing on the desktop moved

Compared against 2.0.0's page across all three fixtures, seven states and three camera ratios:
node positions identical, drawn radii identical, not one stage pixel different, and the stage,
canvas, heatmap, ribbon and legend screenshots byte-identical. The only pixels that differ
anywhere are the build clock in the sidebar's footer.

### Smaller things

- The calendar's control row wraps on a narrow screen. At 390 px the second date field and **All
  dates** were clipped off the right edge, invisible and unreachable.
- A closed sheet leaves the tab order and the accessibility tree, rather than staying focusable
  off-screen where focusing a control scrolls the page out of view with no way back.
- `scripts/mobile-check.mjs` is new: it sizes a real Chrome window to a device, turns touch on,
  and reports the layout, the drawn dot sizes and whether real gestures reach the camera.

Every asset here was built on GitHub's runner from the tagged commit and carries a build
provenance attestation; check one with `gh attestation verify main.js --repo luke321/vault-graph`.

---

## 2.1.0 — "Mobile" — 2026-09-07

**The disc works on a phone.** It always claimed to: the plugin ships as not desktop-only and
the README calls the exported single file "how the graph reaches a phone". Measured, a finger
could neither pan it, pinch it, nor tap a note — and the disc was given under a third of the
screen. Both halves are fixed, and the desktop picture is unchanged, which is asserted rather
than assumed.

### A finger drives the disc

One finger pans, two pinch about their midpoint, a tap raises a note and opens its card, and a
double-tap fits the disc back into view — the same meaning the desktop double-click has. Node
dragging stays a pointer gesture; on a phone the same pin is the button on the note's own card.

Two things were in the way. The renderer's input layer listened for a mouse and nothing else, so
a finger reached nothing. And a tap did not even fall back to a click, because the page sets
`touch-action: none` on the layer that takes input — right for stopping the browser panning the
page out from under a drag, and it suppresses the tap-to-click as well. Picking and selection
were fine all along: the same coordinates with a click always selected the right note.

**A tap also does the hover's job**, because selecting a note is what raises it, lights its links
and dims the rest. Nothing fakes a hover on a surface that has none.

**A finger is not a pointer, and picking learned the difference.** The pointer's catchment is
sized for a mouse arriving in whole pixels — at most 1.41 px from a true centre. Every dot on a
phone draws under 2 px, so a tap that had to land within a pixel and a half would be supported
and useless. A tap reaches for the nearest note within about half a fingertip instead; the
pointer keeps its own measured catchment exactly.

### The disc gets the screen

Below 720 px the disc takes the viewport instead of 31% of it under a folder list. The folders,
search and view buttons slide up as a sheet from two buttons at the top left. The notes-added
calendar and its date strip stay on and can be put away — showing them costs the disc no dot
size at all, since the disc is fit to the narrower axis and the extra height buys margin rather
than radius. A note's card rises as a sheet at the foot, so the disc stays visible above whatever
you tapped, and both control clusters moved to the top corners to clear it. A tap on the disc, or
on the button that opened it, puts a sheet away.

The iPad keeps the two-column desktop layout on purpose: at 744 px it is above the breakpoint,
and there it is the better one.

### Nothing on the desktop moved

Compared against 2.0.0's page across all three fixtures, seven states and three camera ratios:
node positions identical, drawn radii identical, not one stage pixel different, and the stage,
canvas, heatmap, ribbon and legend screenshots byte-identical. The only pixels that differ
anywhere are the build clock in the sidebar's footer.

### Smaller things

- The band's control row wraps on a narrow screen. At 390 px the second date field and **All
  dates** were clipped off the right edge, invisible and unreachable.
- A closed sheet leaves the tab order and the accessibility tree, rather than staying focusable
  off-screen where focusing a control scrolls the page out of view with no way back.
- `scripts/mobile-check.mjs` is new: it sizes a real Chrome window to a device, turns touch on,
  and reports the layout, the drawn dot sizes and whether real gestures reach the camera. It
  carries a desktop control column, because it measured the wrong thing four times before it
  agreed with a window where pan, zoom and selection are known to work.

---
