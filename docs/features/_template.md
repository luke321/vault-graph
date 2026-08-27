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

Two commands, same pipeline the hero uses -- just scoped to one act instead of the whole
storyboard:

```powershell
.\scripts\record-demo.ps1 -Act <name>
# wrote demo-<name>-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-<name>-<timestamp>.mp4 -Out assets\features\<name>.webp
```

Commit `assets/features/<name>.webp` and update `Last re-recorded` below in the same
commit -- that's what `release.ps1`'s staleness check reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `<version, or "predates versioning">` |
| **Last re-recorded** | `<version — YYYY-MM-DD, or "never — clip not yet recorded">` |
