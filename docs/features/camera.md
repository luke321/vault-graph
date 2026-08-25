# The camera

Scroll to zoom, drag to pan once the disc isn't pinned to the middle — a held button the
whole way, not a click and a release with nothing between. Double-click anywhere to reset,
or use the reset button in the corner; both do the same thing.

Never written up in the README before this gallery, despite existing in the demo storyboard
since it grew a `camera` act — one of the gaps this restructure exists to close.

## Where it lives in the storyboard

`act: "camera"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act camera
# wrote demo-camera-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-camera-<timestamp>.mp4 -Out assets\features\camera.webp
```

Commit `assets/features/camera.webp` and update `Last re-recorded` below in the same
commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `predates versioning — undocumented until this gallery` |
| **Last re-recorded** | `never — clip not yet recorded` |
