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

## The measurement that opened github#73, and what it reads now

Demo fixture, 1403 notes, dark, at rest. The desktop column is the control. Before is
2026-09-07 on `develop`; after is the same day with github#73 landed.

| | iPhone 14 before | iPhone 14 after | iPad mini after | desktop control |
|---|---|---|---|---|
| disc gets | 390x260 | **390x844** | 456x903 | 1312x770 |
| share of screen | 31% | **100%** | 40% | 77% |
| dot radius p50 | 1.10 px | **1.38 px** | 1.53 px | 2.19 px |
| dots under 1 px | 496 of 1403 | **153 of 1403** | 30 | 4 |
| one-finger drag | nothing moved | **pans** | pans | ratio 1.55x |
| two-finger pinch | nothing moved | **ratio 0.403x** | 0.403x | 0.596x |
| tap, gesture | nothing selected | **selects** | selects | selects |
| pan parity, 60 px | n/a | **1.000x** | 1.000x | 1.000x |

The row that was the finding: a real tap used to deliver `pointerdown, touchstart, touchend`
and no click, because `page.css` sets `touch-action: none` on the mouse layer -- right for
stopping the browser panning the page under a drag, and it suppressed the tap-to-click the
captor depended on, while `src/engine/captor.ts` bound no touch listener to take over. Picking
and selection were always fine: the same coordinates with a `click` selected the right note.

It still delivers only those three events, and now that is the point -- there is no synthesized
click behind the tap, so a tap selects once rather than twice. design/0013 has the rest.

The iPad mini keeps the two-column desktop layout, since 744 px is above the 720 px
breakpoint, and it is the one viewport where the disc always had a sensible size.

## Three more traps, found while verifying the fix

- **The fixture store is not under a worktree.** `ROOT/.fixtures` exists beside the *main*
  repo, so the harness resolves it through `git rev-parse --git-common-dir`, the way
  `smoke.mjs` does.
- **A fling plus a pinch can carry the target dot off the stage**, so the run resets the camera
  before aiming a tap. Without it the tap reported nothing selected while pan and pinch were
  working perfectly.
- **The detail card covers the disc on a phone**, and the second tap path was landing on one of
  its own links and selecting a neighbour. The run closes the card through its own button
  between the two paths. `--shot-selected` keeps it open on purpose, for looking at.
