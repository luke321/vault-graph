# Folder order

Wedges and the legend used to run in name order, numbers read as numbers, no matter what
order the vault's own file explorer showed. **Folder order**, a setting in the gear menu,
gives you two other ways to read it: **File explorer**, which follows a
[Custom File Explorer Sorting](https://github.com/SebastianMC/obsidian-custom-sort) spec if
your vault has one — pinned names first, then ascending or descending over name, created or
modified, in that plugin's own precedence — and **Size**, biggest folder first. The vault's
own root notes take their place among the folders under either mode, instead of always
sitting first or last.

Only the top-level wedges and both levels of the legend follow the chosen order. A
sub-wedge's own order stays by size regardless — that's what gives a folder's fan of
subfolders its tint gradient, biggest and darkest first, and reordering it to match the
spec would trade that gradient away for nothing the legend actually needed fixed.

A spec that can't be read falls back to name order rather than applying half of it, the same
way the plugin it mirrors reports its own syntax errors: silently, and by naming the line it
skipped rather than refusing the whole file.

## Where it lives in the storyboard

`act: "sort"` in `demoMode()` (`src/page.js`). Unlike every other act it needs a vault that
actually ships a sortspec — the fixture recorded here is `spec-vault`
(`scripts/make-spec-vault.mjs`), not the shared `demo-vault` every other clip uses, which is
why it's excluded from the full run and the hero (`FULL_RUN_EXCLUDES`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act sort
# wrote demo-sort-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-sort-<timestamp>.mp4 -Out assets\features\sort.webp
node scripts\update-feature-metadata.mjs --version <version> --only sort
```

Commit `assets/features/sort.webp` and the updated `Last re-recorded` row together —
that's what `release.ps1`'s staleness check reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `2.9.0 (github#71)` |
| **Last re-recorded** | `2.9.0 — 2026-09-19` — 10.4 s at 1000x1000, encoded at 1000 px (0.56 MB) |
