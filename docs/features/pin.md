# Pin a note to the hub

Drag a note into the hole at the centre, right-click it, or open its own detail card and
click **Pin to hub** — three ways to do the same thing: hold up to thirteen notes together
in the hub, out of the ring, closer than their own connectedness would otherwise place
them. The ring closes around wherever a pinned note came from, and reopens the moment it
is unpinned. Empty, the hole holds the mark; the first pin makes way for it and the last
unpin gives it back.

## Where it lives in the storyboard

`act: "pin"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act pin
# wrote demo-pin-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-pin-<timestamp>.mp4 -Out assets\features\pin.webp
```

Commit `assets/features/pin.webp` and update `Last re-recorded` below in the same
commit -- that's what `release.ps1`'s staleness check reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `unreleased` |
| **Last re-recorded** | `unreleased — 2026-08-25` |
