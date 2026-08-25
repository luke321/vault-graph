# The timeline

A strip under the heatmap band carries every month of the vault. Two handles cap the date
range — drag either one and the disc thins to what's left, and dragging inside the range
slides it while keeping its width, so you can walk a three-month window through the year.
A pill on its own track sets the 52 weeks the heatmap above is drawing, separate from the
range on purpose: "which notes count" and "which weeks am I looking at" are different
questions. A chip per year jumps straight to a calendar year — hover to find it on the
disc, click to filter to it.

This replaced the sidebar's old rank slider entirely: the ribbon is the only timeline now,
and **Refresh** is Play.

## Where it lives in the storyboard

`act: "timeline"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act timeline
# wrote demo-timeline-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-timeline-<timestamp>.mp4 -Out assets\features\timeline.webp
```

Commit `assets/features/timeline.webp` and update `Last re-recorded` below in the same
commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `1.7.0` — "The Timeline Update" |
| **Last re-recorded** | `never — clip not yet recorded` |
