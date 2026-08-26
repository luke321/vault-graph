# The disc, growing

Every note is a dot; every top-level folder owns a wedge of the circle whose angle is its
share of the vault. Notes fill concentric rings from the middle outwards, best-connected
first, so the best-connected notes sit near the centre and leaves land on the rim. The
layout is deterministic, not force-directed — there is no simulation to settle and no seed
to get lucky with, so the same vault always draws the same picture.

**Refresh** replays this from nothing: the disc grows from the vault's first note to now,
and the date ribbon's range handle sweeps along with it — one control doing double duty as
both "here is the vault" and "here is the timeline that scrubs it."

## Where it lives in the storyboard

`act: "intro"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act intro
# wrote demo-intro-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-intro-<timestamp>.mp4 -Out assets\features\intro.webp
```

Commit `assets/features/intro.webp` and update `Last re-recorded` below in the same commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `v1.0` |
| **Last re-recorded** | `unreleased — 2026-08-26` |
