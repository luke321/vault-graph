# Subfolders

The legend tree starts folded — open a folder's twisty to reach the subfolders inside it.
Subfolders take their parent's hue at a lighter tint and cut sub-wedges inside the parent's
wedge; the three largest get their own tint, the rest share a pooled one. Hovering a
subfolder haloes it on the disc, the cheap question with nothing hidden and no wedge moved.
Clicking answers the same question permanently: it's haloed *and* pushed out as a block,
since highlighting is a separate axis from visibility.

## Where it lives in the storyboard

`act: "subfolders"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act subfolders
# wrote demo-subfolders-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-subfolders-<timestamp>.mp4 -Out assets\features\subfolders.webp
```

Commit `assets/features/subfolders.webp` and update `Last re-recorded` below in the same
commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `predates versioning` |
| **Last re-recorded** | `never — clip not yet recorded` |
