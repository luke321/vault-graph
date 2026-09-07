# The mobile harness, and the four ways it lied first

**Status** as-built · 2026-09-07 · `scripts/mobile-check.mjs`, github#73

> The page at a phone's viewport with real touch, and why this harness needs a control
> column to be believed at all.

## Running it

```bash
node scripts/mobile-check.mjs                       # demo fixture, iPhone 14
node scripts/mobile-check.mjs --device desktop      # THE CONTROL: the suite's own window
node scripts/mobile-check.mjs --device pixel7 --keep
node scripts/mobile-check.mjs --vault <path> --shot out.png
node scripts/mobile-check.mjs --url file:///...     # an already-built page
```

Devices: `iphone14`, `iphonese`, `pixel7`, `ipadmini`, `sidebar` (320x900, an Obsidian side
leaf), `desktop`. `--w` / `--h` override any of them. It opens on the **leftmost screen**
through `screen.mjs`, the harness convention, in its own throwaway profile, and `--keep`
leaves the browser for a hand.

**Always read the desktop row before believing a phone row.** `--device desktop` runs the
same code with a pointer instead of a finger on the window the suite drives, where pan, zoom
and selection are known to work. If the control does not pan, zoom and select, the run is
measuring the harness.

## What it reports

Element boxes for the sidebar, stage, band and disc; how much of the sidebar sits below its
fold; the drawn dot radius as min / median / max with counts under 1 px and 2 px; whether a
one-finger drag and a two-finger pinch move the camera; whether a tap selects, **by two
injection paths**, with the DOM events each one actually delivered.

Two paths, because they are not equivalent and either alone can mislead. The gesture path
(`Input.synthesizeTapGesture`, source `touch`) is what a finger really is. The injected path
adds `mousedown`/`mouseup` a phone never sends, and is what `smoke.mjs` uses, so it is known
to select. A tap that reaches the note by neither is the defect; by the injected path only
means the input path is the whole gap, which is exactly what github#73 measured.

## The four traps

Every one was a plausible reading of a real mechanism that measured the wrong thing. This is
the same failure shape the `.ai-context/README.md` preamble is about, so they are written
down rather than fixed silently.

1. **`Emulation.setDeviceMetricsOverride` plus aimed gestures do not mix.** The override
   tells the page it has 390 px, while `Input.synthesize*Gesture` injects in the **real
   window's** coordinates. Every aimed tap therefore missed by the ratio between the two,
   about 10% on a phone, which is tens of pixels and every dot. Symptom: nothing selected at
   any size, including the desktop control. The harness resizes the real window until
   `window.innerWidth/innerHeight` equal the device instead, so page coordinates and gesture
   coordinates are the same space. The cost is a device pixel ratio of 1, which does not
   matter here: the layout and `scaleSize`'s drawn radius are both in CSS pixels.

2. **`?rest` leaves the page in a state no phone reaches.** It skips the intro, which is
   convenient, and read as dead input. The run waits on `__vg.demo.busy()`, the suite's own
   settle predicate, after the resize reflow rather than before it. `--rest` opts back in
   deliberately.

3. **The tap target was computed before the drag and the pinch.** Both move the disc, so the
   tap landed where the dot had been. The target is computed after the gestures now.

4. **`graphToViewport` takes graph attributes, not display data.** Display-data `x`/`y` are in
   the framed space, so handing them over maps every node to about the middle of the
   container — a plausible-looking coordinate that is over the mouse layer and on no dot.
   Symptom: "picking is broken at every size". Use `graph.getNodeAttributes(id)` for the
   position and `getNodeDisplayData(id).size` for the radius, which is what `smoke.mjs` and
   `render-diff.mjs` both do. Add `#vg-graph`'s own page offset, or the aim lands in another
   panel.

## The measurement that opened github#73

Demo fixture, 1403 notes, dark, at rest. The desktop column is the control.

| | iPhone 14 390x844 | Pixel 7 412x915 | iPad mini 744x1133 | desktop 1600x1000 |
|---|---|---|---|---|
| disc gets | 390x260 | 412x301 | 456x903 | 1312x770 |
| share of screen | 31% | 33% | 40% | 77% |
| sidebar below the fold | 536 px | — | 0 | 0 |
| dot radius min/p50/max | 0.46 / 1.10 / 1.14 | 0.55 / 1.19 / 1.38 | 0.69 / 1.53 / 2.27 | 0.89 / 2.19 / 4.06 |
| dots under 2 px | 1403 of 1403 | 1403 of 1403 | 1355 of 1403 | 515 of 1403 |
| one-finger drag | nothing moved | nothing moved | nothing moved | ratio 1.46x |
| two-finger pinch | nothing moved | nothing moved | nothing moved | ratio 0.60x |
| tap, gesture | nothing selected | nothing selected | nothing selected | selected |
| tap, injected | selected | selected | selected | selected |

The last two rows are the finding. A real tap delivers `pointerdown, touchstart, touchend`
and no click, because `page.css` sets `touch-action: none` on the mouse layer — right for
stopping the browser panning the page under a drag, and it suppresses the tap-to-click the
captor depends on, while `src/engine/captor.ts` binds no touch listener to take over.
Picking and selection are fine: the same coordinates with a `click` select the right note.

The iPad mini keeps the two-column desktop layout, since 744 px is above the 720 px
breakpoint, and it is the one viewport where the disc has a sensible size. Its touch is just
as dead.
