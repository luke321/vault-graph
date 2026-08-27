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
| **Introduced in** | `predates versioning` |
| **Last re-recorded** | `unreleased — 2026-08-27` |
