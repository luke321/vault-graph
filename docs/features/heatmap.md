# The heatmap

A band above the disc: one square per day, coloured from the notes that landed in it, so a
busy week is both taller and more colourful. Hovering a day haloes the notes added that
day, wherever they landed on the disc. Clicking keeps it — a picked day's notes take the
neutral extreme colour on top of the halo, and it stays when the pointer leaves. Clicking
the last cell of the grid is how you see what you wrote today.

## Where it lives in the storyboard

`act: "heatmap"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act heatmap
# wrote demo-heatmap-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-heatmap-<timestamp>.mp4 -Out assets\features\heatmap.webp
```

Commit `assets/features/heatmap.webp` and update `Last re-recorded` below in the same
commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `predates versioning` |
| **Last re-recorded** | `unreleased — 2026-08-26` |
