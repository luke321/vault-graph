# Unlinked notes join their folder

A note with no links at all joins its own folder's group by default — same wedge, same
colour, same everything as any other note filed there. Right-click the `(unlinked)` row,
always the last one in the legend, and switch off its "Joins its folder" toggle to pull
unlinked notes back into their own population instead: one flat grey swatch, its own wedge, a
parenthesised count. A third toggle, "Colour by folder", appears one row further down once
the group actually holds someone: a note can stay in that population and still take its own
folder's tint, turning the row's own swatch into a gradient of whatever colours are
actually in play. Both extra toggles are also settings-panel rows, for anyone who would
rather work down a list than right-click.

## Where it lives in the storyboard

`act: "unlinked"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act unlinked
# wrote demo-unlinked-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-unlinked-<timestamp>.mp4 -Out assets\features\unlinked.webp
```

Commit `assets/features/unlinked.webp` and update `Last re-recorded` below in the same
commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `1.9.0` — "Belonging" |
| **Last re-recorded** | `unreleased — 2026-08-28` |
