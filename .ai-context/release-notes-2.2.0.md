**Fold.** The folder list and the notes-added calendar could be put away on a phone; on a PC the
two buttons that do it were not drawn, so a small monitor had no way to give the disc the screen.
Two people asked for it within a day of each other. Now either panel folds at any width, and the
way you leave it is how the graph opens next time.

### The disc gets the window

<img src="https://raw.githubusercontent.com/luke321/vault-graph/2.2.0/assets/features/collapse.webp" width="100%" alt="A desktop-width window with the folder list beside the disc and the calendar band above it: the band folded away first, so the disc grows into the row it had, then the folder list folded away, so its column collapses and the disc re-centres in the whole window with nothing beside it">

Two buttons at the top left of the disc. A phone summons its folder list as a sheet over the
disc; a PC collapses the column and hands its width to the graph, so the panel leaves the layout
rather than covering it.

**Only the calendar's fold makes the dots bigger**, and it is worth knowing which one to reach
for: the disc is fitted to the shorter side of the window, so on a landscape monitor that is the
height the calendar is eating. On a 1600x1000 window over 1403 notes, folding it takes the median
dot from **2.19 px to 2.68 px** and the dots under 2 px from **515 to 232**. Folding the folder
list buys 288 px of framing and not one pixel of radius. The camera stays where you put it in
both cases.

The untouched desktop layout is unchanged against 2.1.0 — the same source exactly — and the
≤720 px layout is unchanged with it.

Every asset here was built on GitHub's runner from the tagged commit and carries a build
provenance attestation; check one with `gh attestation verify main.js --repo luke321/vault-graph`.

The full technical record follows, verbatim from `CHANGELOG.md`.

---

## 2.2.0 — "Fold" — 2026-09-08

**Either panel folds away, at any width.** The folder list and the notes-added calendar could
already be put away on a phone; on a PC the two buttons that do it were not drawn, so a small
monitor or a narrow window had no way to give the disc the screen. Two people asked for it on
the 2.0 thread within a day of each other, which is what a control nobody can find looks like
from the outside — the state machine had shipped in 2.1.0 and was reachable only from a console.

### The panels fold on a PC too

Two buttons at the top left of the disc, wearing the camera cluster's look in the opposite
corner of the same canvas. One folds the folder list, search and view buttons; the other folds
the calendar and its date strip. Fold both and the disc has the window to itself.

**A wide window gets a different fold from a phone's, and that is the only new thing here.** On
a phone the folder list is a sheet that slides up over the disc. On a PC it is a grid column, and
a column gets out of the way by collapsing rather than overlaying: it goes to zero and hands its
width to the graph. It leaves the layout entirely rather than being clipped to zero width, so it
also leaves the tab order and the accessibility tree — a panel nobody can see must not keep its
controls focusable while its own button reports that it is closed. The calendar needed no new
presentation at all: it already had its own row, and hiding the row is what 2.1.0 chose over
floating the band above the disc.

**Whichever way you leave it is how the graph opens next time**, per vault in the exported file
and per vault in the plugin. This reverses a decision 2.1.0 made deliberately — panel state was
session state there, on the grounds that a fold on a phone is a passing act. At a desktop it is
an arrangement somebody chose. The page itself still stores nothing; it takes the state in and
hands changes back, the same channel the folder colours have used since 2.0.0. Nothing stored
yet means the width decides the first open, so a phone still summons its legend and a desktop
still starts with it beside the disc.

**One consequence, stated rather than left to be discovered:** Obsidian shares one settings file
between desktop and mobile, so a desktop user who has folded the sidebar and put it back gives
their phone a sheet that is already up when the view opens. It closes with its own button or a
tap on the disc.

### Only one of the two folds makes the dots bigger

The disc is fitted to whichever side of the window is shorter, so on a landscape monitor that is
the height — and the calendar is what is eating it. Measured on a 1600x1000 window over 1403
notes:

| | canvas | drawn radius min/p50/max | dots under 2 px |
|---|---|---|---|
| both panels up | 1312x770 | 0.89 / **2.19** / 4.06 px | 515 of 1403 |
| calendar folded | 1312x1000 | 1.05 / **2.68** / 5.38 px | **232** of 1403 |
| calendar + folder list folded | 1600x1000 | 1.05 / **2.68** / 5.38 px | 232 of 1403 |
| folder list folded alone | 1600x770 | 0.89 / **2.19** / 4.06 px | 515 of 1403 |
| both back up | 1312x770 | 0.89 / 2.19 / 4.06 px | 515 of 1403 |

The calendar is worth 22% of the median dot radius and halves the population under 2 px. The
folder list is worth 288 px of framing and not one pixel of radius — worth knowing which one to
reach for when the dots are too small to aim at. It is the same effect 2.1.0 measured on a phone,
where showing the band cost no dot size at all.

**The camera is left where it is, and needs no help.** Neither fold re-centres or re-zooms
anything you had moved; the camera ratio held at 1.08 at 0.5,0.5 through all five states above,
because the disc simply re-fills the box it has now. Auto-fitting on a fold would have fought a
rule this suite has asserted since 1.9.0 — that a camera you moved by hand is left alone by a
visibility toggle.

### The resting desktop layout does not move

Compared against 2.1.0's page — which is the same source exactly, since nothing between that tag
and this feature touched `src` or `plugin` — the untouched desktop layout is identical: folder
list 288x1000, stage 1312x1000, calendar 1312x230, disc box 1312x770, drawn radii 0.89/2.19/4.06.
The two new buttons are the only pixels that differ, and they are the point.

The ≤720 px layout is unchanged too: disc box 390x564 on an iPhone 14 viewport, median dot
1.38 px, the sheet's 44 px targets, the calendar still on by default, the round trip still
closing.

### Two defects the phone's code was carrying into the desktop

Clicking bare disc, and opening a note, both put the sheet away — right for a panel that covers
the disc, and both would have folded the sidebar out from under you on a PC, where it sits beside
the disc rather than over it. Neither was reachable before this release, because the toggles were
not drawn; both are fixed with it, and the suite asserts the round trip rather than the reasoning.

### One lock for the two things two agents cannot do at once

Not user-facing, and the reason five parallel worktrees stopped blaming each other's code.
A screen recording grabs a display region, so a second take started while the first is rolling
captures the first one's window — both files exist, both look plausible, both are ruined. A full
invariant-suite run has the same shape through its debugging ports, and there the symptom is
worse: two runs fight and each reads as a regression in the branch. `scripts/lock.mjs` is one
mutex for both, living in the OS temp directory so every worktree shares it rather than guarding
its own, with a stale entry after 20 minutes for a recording and 30 for a suite rather than a
lock nobody can release. Screenshots deliberately need none: they are captured over the
debugging port, so overlapping windows are harmless.

### Smaller things

- **The full demo walk ends on the fold.** The `collapse` act is the storyboard's last one, so
  nothing after it needs the legend it folds away, and the hero closes on the disc with the
  window to itself. All sixteen clips under `docs/features/` and the README's hero were
  re-recorded for this release, because the two buttons are now part of the desktop disc and no
  clip taken before them showed it — the hero is 159.9 s of the 126-beat walk.
- **An act that flies the camera hands it back fitted, and the hero was broken without it.** The
  linked-notes walk leaves the camera wherever its last hop flew, and the act that follows drags
  a specific note into the hub. Re-recording found what that costs: two of the three pins missed,
  because their notes were off-screen — one target at y **-1205**, another at **-1293** — so the
  driver reported *the drop missed the hub* and skipped the card beats after it. It has been
  broken since the walk was recorded, which is why nobody saw it: the hero last came out at
  2.0.0, and the linked-notes walk landed in 2.1.0, so the two acts had never been filmed in
  sequence. The walk now fits the disc before it hands over, and the whole 126 beats run with no
  missed target.
- **`scripts/mobile-check.mjs` reports its panel round trip at every width**, not only under
  touch emulation — it always pressed with mouse events, so nothing in it was ever
  touch-specific. It also re-reads the button's box between the two presses, because folding a
  grid column slides the whole cluster left and pressing where the button used to be lands on
  bare disc and reads as a toggle that cannot be put back.
- **The release procedure says what a release is**, after 2.1.0 was cut twice: everything a
  release needs is finished on its own branch and read there, the section must account for every
  merge in the range rather than for the work in hand, and once the tag exists nothing changes —
  a fix is the next patch version, because editing after the fact leaves the tag disagreeing with
  the published page.
