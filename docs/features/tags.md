# Grouping by tag

The group list's heading is a segmented control, **Folders** or **Tags**. Cut by tag, every
note sits in one wedge: the first tag it lists files it, a nested tag such as `area/health`
nests as a sub-wedge of *area* the way a subfolder does, and a note with no tag goes to
*(untagged)*, shown in grey. Where a tag's wedge holds fewer notes than carry the tag, its row
says so. Switching draws both discs at once: one hand erases the folder disc where it stands,
the other lights the tag disc at its seats, with the links, the heat strip and the group list
following the notes, and the disc keeps its hub and its rings across the switch.

## Where it lives in the storyboard

`act: "tags"` in `demoMode()` (`src/page.js`) — the first act after the intro.

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act tags
# wrote demo-tags-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-tags-<timestamp>.mp4 -Out assets\features\tags.webp
```

Commit `assets/features/tags.webp` and update `Last re-recorded` below in the same commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `the release that carries github#86` |
| **Last re-recorded** | `never — clip not yet recorded` |
