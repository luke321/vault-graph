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

**It ends by fitting the disc, and that click is on camera on purpose.** A walk moves the camera,
and the act after it in the full run drags a named note into the hub — with the camera left where
the last hop flew, that note is off-screen and the drag grabs nothing. So the act hands the
camera back fitted. Standalone it costs a click on a disc that is already fitted; in the full
walk it is what makes everything after it aim at something. github#82.

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
| **Introduced in** | `2.1.0 (github#40)` |
| **Last re-recorded** | `2026-09-08` — 19.6 s at 1586x992, encoded at 960 px (1.26 MB) |
