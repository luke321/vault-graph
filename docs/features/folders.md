# Filtering by folder

Click any folder in the legend to hide it — the remaining wedges grow back into the angle
it vacated and the whole disc re-packs, because the layout is a statement about what's
currently visible, not a fixed seating plan with gaps in it. **Solo** a folder to hide
everything else in one click; **show everything** brings it all back.

Search narrows to matching notes and lists the hits — a related way to cut down what's
shown, but not part of this act (there's no `search` beat in the storyboard), so it has no
clip of its own here.

## Where it lives in the storyboard

`act: "folders"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act folders
# wrote demo-folders-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-folders-<timestamp>.mp4 -Out assets\features\folders.webp
```

Commit `assets/features/folders.webp` and update `Last re-recorded` below in the same
commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `v1.0` |
| **Last re-recorded** | `never — clip not yet recorded` |
