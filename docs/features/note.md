# Reading one note

Hover a note to raise it and dim everything unconnected to it — a halo, with nothing
hidden and no wedge moved. Click it and the sidebar switches to its reading: folder, type,
tags, word count, and its linked notes, each one clickable to jump across the disc. The
card sits in the sidebar rather than over the graph, so the disc stays whole while you read
— the tab strip above it says **Groups** or **Selected note**, and either the card's close
button or a click on empty stage takes you back to the groupings. On a phone the card still
slides up over the canvas, where there is no room for a second column. In the plugin,
**Open** opens the note in a pane from there.

## Where it lives in the storyboard

`act: "note"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act note
# wrote demo-note-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-note-<timestamp>.mp4 -Out assets\features\note.webp
```

Commit `assets/features/note.webp` and update `Last re-recorded` below in the same commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `v1.0` |
| **Last re-recorded** | `2.7.0 — 2026-09-12` — 6.2 s at 1000x1000, encoded at 1000 px (0.76 MB) |
