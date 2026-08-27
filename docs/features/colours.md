# Folder colours

Folders are coloured from twelve slots — ten hues and two greys — handed out in folder
order and round again, so a thirteenth folder comes back to the first slot rather than
falling into a grey pile. Right-click a folder in the legend for the same twelve-swatch
picker at the row itself, no settings panel needed: click a slot to hold that folder to
a colour, **Auto** hands it back to its positional slot. Setting one folder never changes
another, and two folders may share a colour — useful for saying they belong together. A
saved choice is a *slot*, not a colour value, so it follows the theme between light and
dark. The same picker is also reachable from the gear's settings panel, for anyone who
would rather work down a list than right-click each row.

A note with no links at all joins its own folder's group by default — same wedge, same
colour, same everything as any other note filed there. Right-click the `(unlinked)` row
for a second toggle below the swatches — "Kept separate" — to pull unlinked notes back
into their own population instead: one flat grey swatch, its own wedge, counted apart from
the folder it's actually filed in. The row itself is always in the legend, so the toggle is
reachable from the graph either way — but at 0 (the default) it's greyed out and pushed to
the very end, since a dormant control isn't worth the same prime seat a real population
gets. Turn it off, from there or from settings, and it jumps back up to sit right after any
archive folders, at full colour, the moment it has someone in it.

## Where it lives in the storyboard

`act: "colours"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act colours
# wrote demo-colours-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-colours-<timestamp>.mp4 -Out assets\features\colours.webp
```

Commit `assets/features/colours.webp` and update `Last re-recorded` below in the same
commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `1.8.0` — "The Hub" |
| **Last re-recorded** | `unreleased — 2026-08-27` |
