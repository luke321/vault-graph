# The disc follows the vault

Write a note, and the disc takes it in: one cascade, two seconds, the new dot fading in where
its folder puts it while everything around it re-packs. Nothing is torn down, so the filters,
the date range, the pins and the camera all survive — which is what **Refresh** clears. Delete
or rename a note and the same cascade runs the other way. It is a view setting, **Follow the
vault**, on by default; with it off the graph waits for Refresh as it always did.

The exported page cannot watch a vault, so its clip hands the storyboard exactly what the
plugin hands it after a save — the build in hand, one note more — and the cascade from there
is the plugin's own. The first note goes into the biggest folder, so the outer ring absorbs
it; the second into a small folder on the inner ring. Each arrival is hovered where it landed.

<img src="../../assets/features/live-page.webp" width="100%" alt="The standalone page handed one note into its biggest folder, the outer ring absorbing it in one cascade and the new dot hovered where it landed, then a second note into a small folder and the inner ring taking it the same way">

## Where it lives

`act: "live"` in `demoMode()` (`src/page.js`). Two `live` beats, each followed by a settle and
a hover of the note that just arrived: the first files the note in the biggest folder shown,
so the outer ring absorbs it; the second in the biggest folder on the inner ring. The note is
`Untitled`, the way Obsidian names a fresh one, dated the newest day the disc holds so the date
range cannot hide it, and linked once to its folder's best-connected note.

**Left out of the full run on purpose.** It adds two notes, and every act after it would then be
walking a different vault from the one the intro grew.

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act live -Monitor right
# wrote demo-live-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-live-<timestamp>.mp4 -Out assets\features\live-page.webp
```

Commit `assets/features/live-page.webp` and update `Last re-recorded` below in the same
commit — that's what `release.ps1`'s staleness check reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `2.4.0 (github#72)` |
| **Last re-recorded** | `2.5.0 — 2026-09-11` — 11.9 s at 1586x992, encoded at 960 px (0.41 MB) |
