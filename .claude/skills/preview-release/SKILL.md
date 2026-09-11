---
name: preview-release
description: >
  Draft just the TOP of the next vault-graph release note -- the highlight reel a reader sees
  before the CHANGELOG appendix -- from whatever is on LOCAL develop right now (not
  origin/develop -- this repo routinely carries local-only work ahead of what's pushed), and
  publish it as a Claude Artifact to look at. Read-only: touches no file, bumps no version,
  never runs release.ps1 or git push/tag, never fetches or pushes. Use when the user asks
  "preview the release note", "show me what the release would say", "what's the top of the next
  release look like", or "/preview-release". Safe to run from any session, unlike cut-release.
---

# Previewing the top of the next release note

This is a look-ahead, not a release step. `.ai-context/releasing.md` ("The release body is a
highlight reel ON TOP of the CHANGELOG section, not instead of it") defines five pieces of a
real release body; this skill drafts only the first four -- the part above the `---` divider --
against whatever is on `develop` right now, whether or not a release is actually being cut. It
never touches `CHANGELOG.md`, `manifest.json`, or any ref, and it is not the "explicit go-ahead"
review `cut-release` step 10 requires before a tag goes out -- that step drafts the real thing
from a `release/<version>` branch and needs a yes before anything publishes live. This is
earlier and lower-stakes: a way to see the shape of the note before there's a version number to
put on it.

## 1. Find the range

**Against local `develop`, not `origin/develop`.** No `git fetch`, no remote comparison -- this
session's own checkout is the source of truth for "what's actually there right now", and this
repo routinely carries local-only merges the remote hasn't seen yet (push is always its own
separate ask). Local tags only, same reasoning.

```bash
PREV_TAG=$(git tag --sort=-creatordate | head -1)
git log --oneline --merges "$PREV_TAG"..develop
git log "$PREV_TAG"..develop --format=%s%n%b | grep -oE "(Closes|Refs) #[0-9]+" | sort | uniq -c
git diff --stat "$PREV_TAG"..develop -- src plugin
```

If local `develop` **is** `$PREV_TAG` (nothing merged since the last release), say so plainly
and stop -- there is nothing to preview, not an empty section.

## 2. Read the last published release before drafting anything

The house style is not in this file and cannot be inferred from the range -- read it off the
thing itself, every time:

```bash
gh release view "$PREV_TAG" --json body -q .body
```

What it looks like, and what a draft keeps getting wrong if it skips this step:

- **The lead is one bold sentence naming the problem or the thing**, then at most a sentence or
  two of context. `**Tags.** A second way to cut the disc, alongside folders...` Not a thesis
  about what the release "is about".
- **Bullets carry the detail, each opening with a bold clause.** Prose paragraphs under a feature
  heading are the tell of a draft written from the design records instead of from a release.
- **The clip is embedded inside its section**, not described. `<img src="..." width="100%"
  alt="...">` with a real alt that narrates the clip beat by beat.
- **`### Smaller things` is a flat bullet list** at the end.
- **It is short.** 2.5.0's whole reel is under 300 words. If a section runs past a short
  paragraph plus four or five bullets, it is too long.
- A known defect gets a `**Known:**` line rather than being left out.

Release names are one word in quotes -- "Tags", "Auto", "Gauge" -- which is why this skill leaves
the name as an empty slot rather than inventing one.

## 3. Walk the merge list, the same way a real cut does

For each merge in the range, ask: is this genuinely new or visibly changed, or is it a fix/
tooling commit with nothing to show? Reuse the same two traps `releasing.md` names:

- **Don't call something new that already shipped.** Check the source at `$PREV_TAG` before
  claiming a feature is new to this range: `git show $PREV_TAG:src/page.js | grep ...`.
- **Don't skip something that shipped silently.** A merge with no picture is still a line under
  it, or its own "Smaller things" bullet -- never just absent because it's not visual.

Sort into: features worth their own `###` section, and fixes/tooling that are not release-note
material at all (skip these from the draft, same as a real release would).

## 4. Check what clips exist for what you're about to claim

```bash
ls "docs/features/"*.md | grep -v _template
ls "assets/features/"*.webp 2>&1
```

For each feature section drafted, note plainly whether a matching clip already exists and looks
current, or would need recording before this could actually ship — **do not record anything
here**, `cut-release`'s own step (with the `record` lock, and an ask first) owns that. This
preview is allowed to say "needs a clip" and move on.

## 5. Draft it

Structure, matching `releasing.md` items 1–4 exactly (nothing from item 5 — no CHANGELOG
appendix, no divider, this is only the reel):

1. One bold line naming what this batch is actually about, in the release's own voice — not a
   commit-log summary. There is no name yet (that's step 5 of a real cut, his pick), so head the
   draft `**[working title]**` or similar rather than inventing one that would look chosen.
2. No hero image.
3. One `###` per feature sorted into that bucket in step 3, in the shape step 2 read off the
   last release -- bold-led bullets, not paragraphs -- each noting its clip status from step 4
   (`clip: assets/features/<name>.webp, current` / `clip: needed, not recorded`).
4. The standing line, verbatim, every time: `☕ If Vault Graph is useful to you, [support it on
   Ko-fi](https://ko-fi.com/luke321).`

Mark the whole thing **DRAFT — <n> commits past `<PREV_TAG>`, unreleased** at the top so it's
never mistaken for a real release body.

## 6. Publish it and hand over the link

Publish the draft as a Claude Artifact and hand over the link — same reason the real release
review does: a person reading rendered markdown catches things a chat wall of text doesn't, and
nothing here is being asked to be approved, only looked at. No go-ahead needed to publish this
one (it isn't going anywhere live), but say plainly that it's a preview against `develop` as of
right now, not a finished release body.
