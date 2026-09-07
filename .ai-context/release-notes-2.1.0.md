**Mobile.** The disc claimed to work on a phone and did not: a finger could neither pan it, pinch
it, nor tap a note, and it was drawn in under a third of the screen. Both halves are fixed. Two
other things ride along in this release — a way back along the linked-notes walk, and cascades
that draw nearly twice the frames on a large vault.

### The disc, in a hand

<img src="https://raw.githubusercontent.com/luke321/vault-graph/develop/assets/features/mobile.webp" width="406" alt="A phone-sized window with a fingertip for a pointer, each tap leaving a ring: the disc zoomed in until its dots are finger-sized, a note tapped so its card rises as a sheet at the foot, the folder list slid up as a sheet, one folder soloed from inside it, the sheet put away so the rest recedes, then a double-tap fitting what is left back into view">

One finger pans, two pinch about their midpoint, a tap raises a note and opens its card, a
double-tap fits the disc back. Below 720 px the disc takes the screen: the folder list, search and
view buttons slide up as a sheet, the calendar stays on and can be put away, and a note's card
rises as a sheet at the foot so the disc is still visible above what you tapped.

Two things had been in the way — the renderer listened for a mouse and nothing else, and the
page's own `touch-action: none` suppressed even the click a tap would have fallen back to. And
because a fingertip is nothing like a mouse arriving in whole pixels, a tap now reaches for the
nearest note within about half a fingertip while the pointer keeps its own measured catchment.

### Walking the links, and back

<img src="https://raw.githubusercontent.com/luke321/vault-graph/develop/assets/features/hoptrail.webp" width="100%" alt="A card opened on a well-linked note, four of its linked notes clicked in turn so the trail grows a back arrow and crumbs, folded to the first and the last two, then two steps back with the arrow and a jump straight to the first crumb, which truncates the walk there">

Click a linked note on a card and the graph walks there — a hop. The card grows a back arrow and
a trail of where you came from, folded to the first and the last two once the walk gets long. The
arrow steps back one hop; any crumb jumps straight to that note and drops everything after it.
Pointer-only on purpose: a view that claimed a hotkey would overrule one you had bound yourself.

### Faster cascades on a big vault

Every frame of a cascade used to re-derive the whole plan; it now carries a skeleton through the
frame loop. On the 10,000-note fixture that is **37.3 → 23.6 ms of script per frame** and
**56–59 → 85–89 frames** drawn per cascade. The disc at rest is untouched.

Every asset here was built on GitHub's runner from the tagged commit and carries a build
provenance attestation; check one with `gh attestation verify main.js --repo luke321/vault-graph`.

The full technical record follows, verbatim from `CHANGELOG.md`.

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

### Walking the links, and back

The linked notes on a card are clickable, and clicking one walks the graph — a hop. Each hop is
remembered: the card grows a back arrow and a trail of where you came from, oldest first, folded
to the first and the last two once the walk gets long. The arrow steps back one hop; any crumb
jumps straight to that note and drops everything after it. A crumb whose note a filter or the
date range is currently hiding greys out and stays clickable. Opening a note from the disc or the
search box starts a new walk, and closing the card ends it.

**It claims no keyboard shortcut, and that is a decision rather than an omission.** The first cut
bound Backspace, Alt+ArrowLeft and Escape; they came out a day later, because Obsidian users bind
their own hotkeys and a view that takes a key overrules a setting the user made, invisibly. The
trail is pointer-only: the back arrow and the crumbs. The keyboard cost is real and unmitigated —
Tab reaches the crumbs, which are buttons in a nav, and that is the whole keyboard story.

The feature came from a contributor's patch (github#40), reworked; the credit is in the README.

### Cascades draw nearly twice the frames on a big vault

Every frame of a cascade used to re-derive the whole plan. It now carries a skeleton through the
frame loop — the membership walk, the seating walk and the per-cell hub-rank sort are cached,
while everything the weights actually change is re-summed each frame — and `isPushed` is only
asked when something is highlighted.

Measured on the 10,000-note fixture, hiding and showing one folder: script per cascade frame
**37.3 / 39.3 → 23.6 / 23.8 ms** with *Size dots from the frame* on, **30.0 / 28.7 → 23.0 / 22.7**
with it off, and **56–59 → 85–89 frames** drawn per cascade. The disc at rest is untouched.

This is a pass at github#19 rather than the end of it, so the issue stays open.

### The mobile work moved nothing on the desktop

Compared against the page as it stood immediately before it — `develop`'s own source, which
already carried the hop trail and the cascade work above — across all three fixtures, seven
states and three camera ratios: node positions identical, drawn radii identical, not one stage
pixel different, and the stage, canvas, heatmap, ribbon and legend screenshots byte-identical.
The only pixels that differ anywhere are the build clock in the sidebar's footer.

That is a claim about the mobile change alone, and it is worth being exact about the baseline:
the hop trail *does* change the desktop picture, because it adds the back arrow and the crumbs to
a note's card.

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
