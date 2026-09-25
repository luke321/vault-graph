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
  between the two paths. `--shot-selected` keeps it open on purpose, for looking at. (It no
  longer covers the disc: github#170 put it in the flow.)

## What github#170 added, and the two readings that cost a morning

**The harness now takes the `screen-left` lock**, which it seized without asking for two
weeks. `spike-check.mjs` already took it, and the two place a window on the same display
through the same `leftmostScreen()`. `--no-lock` is the opt-out for a caller that holds it.
The release is registered at module scope, not beside the browser's teardown, so a throw
before Chrome is spawned still gives it back; `--keep` deliberately holds it, because the
window it leaves behind is still on that display.

Six readings were added, all reported at every width, because the desktop answer to each is
how "desktop unchanged" gets checked: which elements intersect the disc box, whether the root
scrolls and by how much, where the band and the panel land relative to the disc, every
control's hit box with the ones under 44x44 named, the band's control row with any child that
falls outside it, and whether the cascade is still walking while the disc is scrolled away.

**Reading `scrollTop` cannot tell you whether a swipe scrolls the page, and the reading that
looks like it works is the wrong one.** `Input.synthesizeScrollGesture` drives the *root*
scroller. On a phone the scroller is `.vault-graph`, so the gesture moves nothing wherever it
starts -- the disc, the band, the panel -- and the run reports "the disc is eating the
gesture" three times for three places that are all fine. What is actually ours is the page's
half: whether the disc's own listeners cancel a one-finger move. So the harness dispatches raw
touch events and reads two things off them:

```
develop   touchstart:cancelable:prevented | touchmove:cancelable:prevented | touchmove:cancelable:prevented
after     touchstart:cancelable:free      | touchmove:cancelable:free      | touchmove:TAKEN:free
```

`TAKEN` is a touchmove arriving **non-cancelable**, which is the browser saying it has taken
the gesture over for scrolling. That, and nothing being prevented, is the whole precondition;
what the compositor then does with it is not the page's business and not this harness's.

**`pointer: coarse` is reachable from CDP, and design/0013 said it was not worth finding out.**
`Emulation.setTouchEmulationEnabled{enabled: true}` flips `(pointer: coarse)` and `(hover:
none)` to true, and disabling it restores `(pointer: fine)` -- measured 2026-09-17, headless.
So `smoke.mjs` can exercise the phone predicate, scoped per check exactly like the
`setDeviceMetricsOverride` it already toggles. Two orderings matter there:

- **The device before its viewport.** Emulating touch first, then the metrics, means the width
  change re-evaluates `(max-width: 720px) and (pointer: coarse)` with coarse already true. The
  other order leaves the compound query never firing its `change`.
- **`enableCameraPanning` is transient and `panEnabled` is not.** `fit()` enables panning for
  its 380 ms flight and disables it on landing, and `toRest()` clicks Fit, so a read taken
  right after `toRest` lands *inside* a flight and sees panning on. `settlePan()` waits for the
  pair to stop changing, and the assertion is on `__vg.panEnabled`, which `setPan` writes
  synchronously. The first cut of the check polled for stability *before* the resize beat's
  120 ms debounce had even fired, found the value trivially stable at its old reading, and
  failed on a page that was already correct.

## What the second pass added: a default cannot be measured on a page that is already up

`github#170`'s second pass folds the calendar on a phone, and a *default* turned out to be the
one thing this harness could not read. Three orderings, each of which made the check pass for
the wrong reason.

- **`bandOpen` is read once, at mount.** Every reading here was taken by resizing a page into a
  phone, which measures the default belonging to the size the page *booted* at. Both smoke
  checks and `mobile-check.mjs` reload under the emulation now -- and in `mobile-check.mjs` the
  reload goes **after** `fitViewport`, because the window opens near the device's size and only
  reaches it after that loop.
- **The exported page persists `bandOpen` to `localStorage`** (`shell.html`, `decisions/0009`,
  keyed on `window.SETTINGS_KEY`). The check taps the band open and shut to prove the fold has a
  way back, which stores `false` -- so the *next* boot starts folded because of the tap, not
  because of the default. On the second device the assertion could no longer fail, and neither
  could a regression. `reboot()` deletes that one key first; it deletes only that key, because
  other checks in the same job have their own stored state.
- **Storing the opposite is the other half, and it is asserted rather than assumed.** Write
  `bandOpen: true`, boot a phone, and the band must come up open. That is the whole difference
  between `sheetOpen`'s "absent means nobody chose" and `panEnabled`'s override, and without the
  assertion nothing distinguishes them.

**"Over the disc" is measured against the drawn disc, not the graph's box.** The disc is a
circle in a square, so the corners are empty by construction and a bounding-box test calls a
control in one of them a collision. The probe reads the drawn radius off the renderer --
`graphToViewport` over the drawn nodes, plus each dot's `scaleSize` -- and tests the nearest
point of each control's box against it. No existing control's verdict changes, since they all
sit wholly outside the square; `mobile-check.mjs` prints that radius beside the square's
inscribed circle so the clearance is on screen rather than inferred.

**Anything inside the band has to be measured with the band open.** A folded band is
`display: none`, so the lens's line count reads 0, the row has no children to fall outside it,
and `#vg-compact`'s line is `undefined` -- all of which read as "passing" against a test written
for the open state. Those assertions moved to a second probe taken after the toggle is tapped.
