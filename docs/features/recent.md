# The recent lens

Three chips under the calendar band — **Today**, **Last 7** and **Since last open** — that
halo the notes from a recent window wherever they sit on the disc, and dim everything else a
little. Nothing moves: a lens is a way of looking, not a filter. **Last 7** is a rolling seven
days, so it never collapses into Today on a Monday, and **Since last open** appears only inside
Obsidian, which is the one host that keeps that clock. The band counts either date — Added or
Touched — and every chip says which one it means.

## Where it lives in the storyboard

`act: "recent"` in `demoMode()` (`src/page.js`). The act is recorded with `?today=vault`, so
the chips count from the fixture's own newest day rather than the wall clock — on a fixture
whose last note is weeks old, the real clock would leave every chip at zero.

## Regenerating this feature's clip

Re-recording every clip and the hero is the default for a release (github#121), not a
per-feature judgment call -- `scripts\record-all.ps1` does the whole gallery in one pass, then
`scripts\update-feature-metadata.mjs --version <version>` rewrites every `Last re-recorded` row
below, for every feature at once.

For this one clip on its own:

```powershell
.\scripts\record-demo.ps1 -Act recent
# wrote demo-recent-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-recent-<timestamp>.mp4 -Out assets\features\recent.webp
node scripts\update-feature-metadata.mjs --version <version> --only recent
```

Commit `assets/features/recent.webp` and the updated `Last re-recorded` row together -- that's
what `release.ps1`'s staleness check reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `2.8.0` |
| **Last re-recorded** | `2.9.0 — 2026-09-19` — 14.5 s at 1000x1000, encoded at 1000 px (1.08 MB) |
