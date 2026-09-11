<!--
  Scaffold for one entry in the feature gallery (docs/features.md). Copy this file to
  docs/features/<name>.md, fill it in, and add a row for it to docs/features.md.

  <name> is one of demoMode()'s `act:` tags in src/page.js -- the same name goes in every
  command below. Keeping the name the same in three places (this filename, the `act:` tag,
  and the clip's own filename) is what makes "regenerate this feature's clip" a single
  lookup instead of three.
-->

# <Feature name>

<One paragraph, in the README's own voice: what it does, not how it's built. This is the
text that ends up on the gallery page next to the clip.>

## Where it lives in the storyboard

`act: "<name>"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

Re-recording every clip and the hero is the default for a release (github#121), not a
per-feature judgment call -- `scripts\record-all.ps1` does the whole gallery in one pass, then
`scripts\update-feature-metadata.mjs --version <version>` rewrites every `Last re-recorded` row
below, for every feature at once.

For this one clip on its own (a single feature's beats changed and nothing else did), two
commands, same pipeline the hero uses -- just scoped to one act instead of the whole storyboard:

```powershell
.\scripts\record-demo.ps1 -Act <name>
# wrote demo-<name>-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-<name>-<timestamp>.mp4 -Out assets\features\<name>.webp
node scripts\update-feature-metadata.mjs --version <version> --only <name>
```

Commit `assets/features/<name>.webp` and the updated `Last re-recorded` row together -- that's
what `release.ps1`'s staleness check reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `<version, or "predates versioning">` |
| **Last re-recorded** | `<version — YYYY-MM-DD, or "never — clip not yet recorded">` |
