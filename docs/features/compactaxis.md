# Compact date axis

Years and months on the date strip now draw by how many notes they hold, not by the
calendar. A decade with one busy year and nine quiet ones used to spend most of the strip
on nothing; a sparse year now collapses toward the same narrow width every other sparse
year gets, and a busy one keeps growing to fit what it actually holds. Off, in the gear
or the icon beside the date fields, gives every year and month back its plain calendar
width.

## Where it lives in the storyboard

`act: "compactaxis"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act compactaxis
# wrote demo-compactaxis-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-compactaxis-<timestamp>.mp4 -Out assets\features\compactaxis.webp
```

Commit `assets/features/compactaxis.webp` and update `Last re-recorded` below in the same
commit -- that's what `release.ps1`'s staleness check reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `unreleased` |
| **Last re-recorded** | `unreleased — 2026-08-27` |
