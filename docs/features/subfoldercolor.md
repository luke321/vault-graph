# Subfolder colours

The same right-click colour menu a top-level folder's row opens, reached from a
subfolder's row instead — recolour "People" inside "03 - Resources" without touching its
parent's own hue. The row only exists once its folder's twisty is open, the same
precondition the subfolders feature needs. **Auto** hands the tint back to whatever the
parent folder and position would give it anyway.

## Where it lives in the storyboard

`act: "subfoldercolor"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act subfoldercolor
# wrote demo-subfoldercolor-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-subfoldercolor-<timestamp>.mp4 -Out assets\features\subfoldercolor.webp
```

Commit `assets/features/subfoldercolor.webp` and update `Last re-recorded` below in the
same commit -- that's what `release.ps1`'s staleness check reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `unreleased` |
| **Last re-recorded** | `unreleased — 2026-08-27` |
