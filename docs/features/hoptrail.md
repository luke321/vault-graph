# Walking the links, and back

The linked notes on a card are clickable, and clicking one walks the graph — a hop. Each hop
is remembered: the card grows a back arrow and a trail of where you came from, oldest first,
folded to the first and the last two once the walk gets long. The arrow steps back one hop;
any crumb jumps straight to that note and drops everything after it. A crumb whose note a
filter or the date range is currently hiding greys out and stays clickable. Opening a note
from the disc or the search box starts a new walk, and closing the card ends it.

The trail is pointer-only on purpose. Obsidian users bind their own hotkeys, and a view that
grabbed keys of its own would overrule them — `.ai-context/design/0012-hop-trail.md` carries
that decision and what it cost.

## Where it lives in the storyboard

`act: "hoptrail"` in `demoMode()` (`src/page.js`).

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act hoptrail
# wrote demo-hoptrail-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-hoptrail-<timestamp>.mp4 -Out assets\features\hoptrail.webp
```

Commit `assets/features/hoptrail.webp` and update `Last re-recorded` below in the same
commit — that's what `release.ps1`'s staleness check reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `unreleased — next minor (github#40)` |
| **Last re-recorded** | `never — clip not yet recorded` |
