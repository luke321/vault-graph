# Folding the panels away

Two buttons at the top left of the disc. One folds the folder list, search and view buttons
away; the other folds the notes-added calendar and its date strip. Fold both and the disc has
the window to itself. Press them again and everything comes back where it was — and whichever
way you left it is how the graph opens next time.

The mechanism shipped in 2.1.0 for phones, where the same two buttons summon the folder list as
a sheet over the disc. Nothing about it was ever touch-specific; it was simply gated behind a
720 px window, so on a PC the state machine was there and the buttons that drive it were not
drawn. Two people asked for the same thing on the 2.0 thread within a day of each other, which
is how a control nobody can find reads from the outside.

**A wide window gets a different fold from a phone's.** On a phone the folder list is a sheet
that slides up over the disc. On a PC it is a column beside it, so it collapses to nothing and
hands its width to the graph rather than covering it. The calendar behaves the same way at every
width: its own row in the layout, hidden or shown, never floated over the disc.

**Only one of the two folds makes the dots bigger, and it is the calendar.** The disc is fitted
to whichever side of the window is shorter, so on a landscape monitor that is the height — and
the calendar is what is eating it. Measured on a 1600x1000 window over 1403 notes: folding the
calendar takes the median dot from 2.19 px to 2.68 px and cuts the dots under 2 px from 515 to
232. Folding the folder list gains 288 px of width and not one pixel of radius; what it buys is
the disc centred in the whole window with nothing beside it. Worth knowing which one to reach
for when the dots are too small to aim at.

**The camera stays where you put it.** Neither fold re-centres or re-zooms anything you had
moved: the disc simply re-fills the box it has now. That is the same promise a window resize
already makes.

## Where it lives in the storyboard

`act: "collapse"` in `demoMode()` (`src/page.js`). It is in `FULL_RUN_EXCLUDES`, so the hero
never plays it — the act ends with both panels folded, and the hero's later beats point at a
legend that would no longer be drawn.

**Record this one wide.** Below 720 px the same two buttons summon a sheet instead, so the fold
has nothing to show there. The calendar goes first, because it is the fold that changes the dot
size, and the folder list second, because the disc visibly re-centres when the column goes.

## Regenerating this feature's clip

```powershell
node scripts/lock.mjs acquire record --owner "#82 collapse"
.\scripts\record-demo.ps1 -Act collapse -Monitor right
# wrote demo-collapse-<timestamp>.mp4
.\scripts\make-hero.ps1 -In demo-collapse-<timestamp>.mp4 -Out assets\features\collapse.webp
node scripts/lock.mjs release record --owner "#82 collapse"
```

Commit `assets/features/collapse.webp` and update `Last re-recorded` below in the same commit —
that's what `release.ps1`'s staleness check reads.

**Note for whoever cuts the next release.** This feature put two permanent buttons on the disc
at desktop widths, so every clip under `assets/features/` recorded before it shows a disc
without them. `release.ps1` will report them stale, correctly. Re-recording them is the release
branch's job, not this feature's — a release finishes every clip it embeds.

## What proves it works

```bash
node scripts/smoke.mjs --only "panel toggles"    # both folds, the pixels each gives back
node scripts/mobile-check.mjs --device desktop   # the toggle round trip, and a resting layout
                                                 # that has not moved
node scripts/mobile-check.mjs --device iphone14  # the sheet below the breakpoint, unchanged
```

`.ai-context/design/0013-touch-input.md` carries the reasoning, and
`.ai-context/invariants.md` the numbers.

## Metadata

| | |
|---|---|
| **Introduced in** | `github#82` |
| **Last re-recorded** | `never — clip not yet recorded` |
