# The disc on a phone

A finger drives the disc: two fingers pinch to zoom about their midpoint, a tap raises a note
and opens its card, and a double-tap fits the disc back into view — the same meaning the desktop
double-click has. Until 2.1.0 none of that worked: the renderer listened for a mouse and nothing
else, and the page's own `touch-action: none` suppressed even the click a tap would otherwise
have fallen back to.

**Panning is off on a phone.** A finger dragging the disc used to pan it the way a mouse drag
does; github#170 turned that off — the disc doesn't move under your thumb — and the page scrolls
instead. The pan button in the camera cluster isn't drawn at all, since there's nothing for it to
toggle. Pinch-to-zoom is unaffected: it's the disc's own scale, not the camera's pan.

**The panel lives below the disc, not over it.** Below 720 px on a real touchscreen (github#170;
a mouse-driven window that width keeps the older behaviour below), the disc sits whole at the top
of a page that scrolls, the folder list and the rest of the panel follow underneath it in the
normal flow, and a note's card opens inline in that same scroll rather than as a sheet. Nothing
is drawn over the circle — that's the point: a reader on Reddit found the old layout's own
buttons and panel covering the animation the page exists to show.

Buttons throughout are sized for a finger — the camera cluster becomes a row of 44px buttons
under the disc — and the heatmap band's own controls, which used to overflow their row at this
width, now fit it: the recent-window chips scroll inside their own row instead of wrapping, and
the widest one (**Since last open**) drops rather than crowding the rest out.

At a *narrow desktop window* rather than a real phone — no touch, just a resize — the older
sheet-over-the-disc panel from 2.1.0 still applies unchanged: the folders, search and view
buttons slide up as a sheet from two buttons at the top left, and a tap on the disc or the
button that opened it puts the sheet away again. See [`collapse.md`](collapse.md) for that case
and for the same two buttons' desktop behaviour, where they fold panels rather than summon them.
Which of the two a given window gets is decided by width **and** a coarse pointer together, not
by width alone (github#170) — precisely so a mouse-driven narrow window keeps the sheet.

A finger is not a pointer, so picking learned the difference: a tap reaches for the nearest note
within about half a fingertip, while the mouse keeps the pixel-precise catchment it was measured
for. `.ai-context/design/0013-touch-input.md` carries that and the rest of the reasoning.

## Where it lives in the storyboard

`act: "mobile"` in `demoMode()` (`src/page.js`). It is in `FULL_RUN_EXCLUDES`, so the hero never
plays it — the beats only read as mobile in a narrow window, and the hero is recorded at
1600x1000.

**It zooms in before it taps anything.** At a phone's resting zoom a dot is under 2 px, and a
clip that taps one of those is showing something nobody would do: the act spends its first two
beats zooming toward the note it is about to open. The zoom is a wheel, because only one pointer
glyph is drawn and a pinch would look identical on camera; what proves the pinch itself works is
the harness, below. It ends on a double-tap.

**The pointer is a finger below the breakpoint.** `#vg-democursor` carries two glyphs and the CSS
swaps them at 720 px, so a narrow recording shows a fingertip and a desktop one shows the arrow.
Nothing decides this per act — it follows the layout, so it cannot be forgotten.

**And the driver drives a finger, not a mouse.** The `touchmode` beat switches the rest of the
run: the glyph is placed through `__vg.demo.cursorAt`, an eval with no input event behind it, and
the disc is activated with real synthesized touch. That matters because a pointer *move* is what
paints a hover, and a finger cannot produce one — the first take showed tooltips and lit notes
that no phone would ever show. Measured on one note at one point: finger only leaves
`state.hovered` at none with the tooltip hidden, while a mouse move to the same pixel hovers it
and shows the tooltip. Every tap also drops a ring (`__vg.demo.tapAt`), because a finger that
does not move leaves nothing else behind on camera.

DOM targets take a mouse press at the point, with no move before it: Chrome's touch emulation
does not turn a synthesized tap into a click on an ordinary button, which is the same reason the
disc needed a touch captor in the first place.

**The old sheet beats are gone — confirmed, not just reasoned about.** A full re-record of this
act crashed partway on exactly the risk above: the two `["id", "sheet"]` clicks target
`#vg-sheet`, which `(max-width: 720px) and (pointer: coarse)` hides outright, so its bounding box
is zero-size and the driver's own `demoWhere()` returns `null` for it rather than a soft
"not found" — the act aborted mid-run rather than skipping the beat. The act now clicks
`["only", "01"]` directly instead: on a phone the folder list is already in the page's own scroll
flow with nothing to open, so soloing a folder from it scrolls straight there on its own
(`Element.scrollIntoView`, the same mechanism every other act's on-disc targets already use). The
folder is then shown again (`["id", "allon"]`), and a hover on `#vg-graph` scrolls the page back
up before the closing double-tap — otherwise that beat's coordinates would land on whatever the
scroll had left under them, not the disc.

## Regenerating this feature's clip

**Record this one narrow.** The act itself is only choreography; what makes it the phone layout
is the window it is recorded in, so both commands carry the size — `make-hero.ps1` defaults
to 960 px, and on a 406 px capture that is an upscale costing 2.5x the bytes for no more
detail (1.09 MB against 2.67 MB, measured):

```powershell
.\scripts\record-demo.ps1 -Act mobile -Width 420 -Height 900 -Monitor right
# wrote demo-mobile-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-mobile-<timestamp>.mp4 -Out assets\features\mobile.webp -Width 406
```

Commit `assets/features/mobile.webp` and update `Last re-recorded` below in the same commit —
that's what `release.ps1`'s staleness check reads.

**What the clip is not.** The driver sends pointer events, so the gestures on camera are not
evidence that the touch path works. That is what `scripts/mobile-check.mjs` is for: it drives the
browser's own synthetic touches and reports whether a drag pans, a pinch zooms, a tap selects, a
tap after a 5 px wobble still selects, a 45 px swipe selects nothing, and a two-finger tap
selects nothing. See `.ai-context/mobile-harness.md`.

## Metadata

| | |
|---|---|
| **Introduced in** | `2.1.0 (github#73)` |
| **Last re-recorded** | `2.9.0 — 2026-09-19` — 21.3 s at 420x900, encoded at native width (1.64 MB) |
