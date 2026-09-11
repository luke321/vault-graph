# 0018 — The gallery's "New in" strip

**Date** 2026-09-11 · **Status** accepted · **Issue** github#127

`docs/features.md` lists all nineteen features with no sense of when each arrived. A returning
reader — including anyone who followed the plugin's own update strip (`design/0016`) down to the
gallery — landed on an undifferentiated list instead of "here's what's new since you last looked."

## What it is

One generated line at the top of the page, above the nav table:

```
> **New in 2.5.0** — [Grouping by tag](#grouping-by-tag)
```

Written by `scripts/gallery-nav.mjs` between `<!-- gallery-nav:start -->` / `:end` markers.
Default mode writes; `--check` diffs and exits 1 without writing, wired into the pre-push hook
next to `scripts/code-map.mjs --check` — the same contract, because this is the same shape of
problem: a markdown file generated from source that goes stale the moment someone forgets to
re-run the generator.

## Where it reads from

Each `docs/features/<name>.md` already states its own version in an **Introduced in** metadata
cell — free text, not always bare semver (`` `2.2.0 (github#82)` ``, `` `predates versioning` ``),
so only a leading `v?\d+(\.\d+){1,2}` token counts; anything else is excluded from "new"
consideration entirely, the same as it would be from a hand-written list.

The anchor a title links to is **not re-derived** — `docs/features.md`'s own nav table already
maps every linked feature's exact title to its anchor (`[Title](#anchor)`, and each feature
page's H1 matches that title verbatim), so the generator reads that map instead of reimplementing
a slugifier. A feature with no anchor there (`docs/features/live.md` — 2.4.0, never added to the
gallery page) is skipped rather than linked to nothing.

## Why it walks back, not just "the latest tag"

At the time this was written, no feature is tagged `2.6.0` — the three features that release
actually shipped (minimap, colour preview, update strip) have no `docs/features/<name>.md` page
yet, a separate pre-existing gap. Hard-coding "the newest release tag" would print `New in
2.6.0` linking to nothing. Instead the generator takes the newest version among entries that
*do* have both a parseable version and a resolvable anchor — currently `2.5.0` — so the strip
always points at something real, and starts naming 2.6.0's features the moment their pages land.

## Why one version, not a rolling window

The ticket's own example shows a single version; a multi-release window would need its own
heading structure for something nobody asked for, and the walk-back already covers the one case
a single "just the latest tag" reading would break on.

## Enforcement

`.githooks/pre-push` blocks a push to `develop`/`main` when `docs/features.md` disagrees with
what the generator would write, same as it already does for `.ai-context/code-map.md`.
`.claude/skills/cut-release/SKILL.md` step 4 reminds a release to run it after adding a feature
page — pre-push is the backstop if that step is missed.
