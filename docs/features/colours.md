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

A note with no links at all wears one flat colour by default, so `(unlinked)` reads as one
population rather than a note wearing its folder's tint while looking like every other
group already lost its own colour. Right-click the `(unlinked)` row for a second toggle
below the swatches — "Colour by folder" — to give an unlinked note its own folder's tint
instead; the row's own swatch turns into a gradient of whatever colours are actually in
play, since one flat colour would no longer say what's underneath.

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
