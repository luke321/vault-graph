# Parent tags only

In the tag view a **Parent tags** chip sits beside All and None. Turn it on and every parent tag
folds into one solid wedge: `area/health` and `area/work` both draw as *area*, with no sub-tag
slivers and no sub-tag tints, so you can read how the vault spreads across its top-level tags.
The disc re-packs inside the rings it already has, and the setting is remembered like the other
view settings, in the plugin and in the standalone page. Sub-tags you hid before turning it on
stay hidden, and the parent's row says *some sub-tags hidden*.

## Where it lives in the storyboard

`act: "parenttags"` in `demoMode()` (`src/page.js`), right after the tags act: switch to the tag
view, turn the chip on, turn it off, switch back to folders. It is left out of the hero take
(`FULL_RUN_EXCLUDES`), which already shows the tag switch.

## Regenerating this feature's clip

Re-recording every clip and the hero is the default for a release (github#121), not a
per-feature judgment call -- `scripts\record-all.ps1` does the whole gallery in one pass, then
`scripts\update-feature-metadata.mjs --version <version>` rewrites every `Last re-recorded` row
below, for every feature at once.

For this one clip on its own:

```powershell
.\scripts\record-demo.ps1 -Act parenttags
# wrote demo-parenttags-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-parenttags-<timestamp>.mp4 -Out assets\features\parenttags.webp
node scripts\update-feature-metadata.mjs --version <version> --only parenttags
```

Commit `assets/features/parenttags.webp` and the updated `Last re-recorded` row together --
that's what `release.ps1`'s staleness check reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `2.10.0` |
| **Last re-recorded** | `2.10.0 — 2026-10-21` — 23.3 s at 1000x1000, encoded at 1000 px (9.64 MB) |
