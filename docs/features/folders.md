# Filtering by folder

Click any folder in the legend to hide it — the remaining wedges grow back into the angle
it vacated and the whole disc re-packs, because the layout is a statement about what's
currently visible, not a fixed seating plan with gaps in it. **Solo** a folder to hide
everything else in one click; **show everything** brings it all back.

Hide a folder big enough to matter and the **camera follows** — reframing to what's actually
left rather than leaving the disc stranded in the middle of a stage sized for the vault that
was there a moment ago. On a vault where one folder dominates this used to be dramatic:
hiding it could leave a hole nearly half the disc's own radius, floating in mostly empty
space. The reframe only ever happens while the camera is exactly where it was left — pan or
zoom yourself first and a folder toggle leaves the view alone, same as it always has. See
[The camera](camera.md) for the zoom/pan/reset controls themselves.

Right-click a folder for the same twelve-swatch colour menu (see [Colours](colours.md)) —
one row down from the swatches is an eye button for **"hidden by default"**: whether this
folder starts hidden every time the disc loads. That setting used to be reachable only from
the settings panel's own eye buttons; it's on the legend's own context menu now too, so it's
never more than a right-click away from the folder it belongs to.

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
| **Last re-recorded** | `1.9.0 — 2026-09-02` |
