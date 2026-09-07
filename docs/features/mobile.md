# The disc on a phone

A finger drives the disc. One finger pans, two pinch about their midpoint, a tap raises a note
and opens its card, and a double-tap fits the disc back into view — the same meaning the desktop
double-click has. Until 2.1.0 none of that worked: the renderer listened for a mouse and nothing
else, and the page's own `touch-action: none` suppressed even the click a tap would otherwise
have fallen back to.

Below 720 px the layout changes to match. The disc takes the screen instead of sitting under the
folder list; the folders, search and view buttons slide up as a sheet from two buttons at the top
left; the notes-added calendar and its date strip stay on and can be put away; and a note's card
rises as a sheet at the foot, so the disc stays visible above whatever you tapped. A tap on the
disc, or on the button that opened it, puts a sheet away again.

A finger is not a pointer, so picking learned the difference: a tap reaches for the nearest note
within about half a fingertip, while the mouse keeps the pixel-precise catchment it was measured
for. `.ai-context/design/0013-touch-input.md` carries that and the rest of the reasoning.

## Where it lives in the storyboard

`act: "mobile"` in `demoMode()` (`src/page.js`). It is in `FULL_RUN_EXCLUDES`, so the hero never
plays it — the beats only read as mobile in a narrow window, and the hero is recorded at
1600x1000.

## Regenerating this feature's clip

**Record this one narrow.** The act itself is only choreography; what makes it the phone layout
is the window it is recorded in, so both commands carry the size:

```powershell
.\scripts\record-demo.ps1 -Act mobile -Width 420 -Height 900 -Monitor right
# wrote demo-mobile-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-mobile-<timestamp>.mp4 -Out assets\features\mobile.webp
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
| **Last re-recorded** | `2026-09-07` — 20.3 s at 406x892, encoded at native width (729 KB) |
