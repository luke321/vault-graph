# Reading one note

Hover a note to raise it and dim everything unconnected to it — a halo, with nothing
hidden and no wedge moved. Click for a panel: folder, type, tags, word count, and its
linked notes, each one clickable to jump across the disc. In the plugin, **Open in
Obsidian** opens the note in a pane from there.

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
| **Last re-recorded** | `unreleased — 2026-08-26` |
