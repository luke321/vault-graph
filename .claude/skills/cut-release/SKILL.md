---
name: cut-release
description: >
  Cut a vault-graph release end to end, following .ai-context/releasing.md and CLAUDE.md to the
  letter: enumerate the range, build the release/<version> branch, write the CHANGELOG section
  and release body, re-record whatever clips went stale, rehearse and pay the suite once, merge
  down, tag, and let the workflow publish. Use when the user says "cut a release", "ship
  <version>", "release <name>", or "/cut-release". Orchestrator-only: refuses to run from a
  dispatched ticket worktree. Invoking this skill IS the standing authorization for the pushes
  and merges it describes -- it does not ask again at each one, but it does show the status
  table after every step and stops at any named decision point.
---

# Cutting a vault-graph release

This skill is a runbook, not a reference -- `.ai-context/releasing.md` is the reference, with the
measurements and incidents behind every rule here. Read it once before the first release you cut
with this skill; after that, this file is enough to drive the mechanics. Where the two disagree,
`.ai-context/releasing.md` is right and this file is stale -- fix this file, don't work around it.

## Before starting

- **Orchestrator only.** `CLAUDE.md`: "Only the orchestrator session pushes to `develop` or cuts
  a release." If this session is a dispatched ticket worktree, stop and say so instead of running
  any of this.
- **Confirm no other release or suite run is in flight**: `node scripts/lock.mjs status`.
- Ask for the release name only if the user hasn't given one; everything else below should not
  need a question unless a step's own instructions say to stop and ask.

## The status table

Post this after every step below, updated — not just at the end. Columns: `#`, `Step`, `Status`
(✅ done, ⏳ not started/in progress, ⏸️ blocked — name what it's blocked on). Drop rows that don't
apply to this release; add one row per this release's own polish/fix asks at the top. Call out in
prose what's newly done since the last table and what's still blocked or awaiting a decision.

```markdown
| # | Step | Status |
|---|---|---|
| 1 | <this release's own polish/fix asks, one row each> | |
| 2 | Any new-feature doc page(s) + clip(s) under `docs/features/` | |
| 3 | `CHANGELOG.md` section for `<version>`, covering every merge since the last tag | |
| 4 | Version bump: `manifest.json` → `<version>` | |
| 5 | Release name — propose 2-4 candidates, his pick | |
| 6 | Re-record every clip the UI change touches (hero + gallery, not just touched acts) if anything visual changed | |
| 7 | Merge `release/<version>` → `develop` (local) | |
| 8 | **One** plain `git push origin develop` | |
| 9 | PR/merge `develop` → `main` | |
| 10 | Draft the release body, publish as an Artifact, get an explicit go-ahead | |
| 11 | `release.ps1` on `main` — gates, tag, push | |
| 12 | GitHub Actions publishes the release — automatic once tagged | |
| 13 | Post to Ko-fi: title, disc screenshot, community-page link then release link; open the page | |
```

## 1. List the range — before anything else

The release is the range since the last tag, not the work in hand. 2.1.0 shipped once having
described only part of its own range and had to be deleted and re-cut; don't repeat that.

**Do not use `git describe` to find the last tag here.** Tags are cut on `main`, and `main`
only ever receives `develop`, so no release tag is an ancestor of `develop` --
`git describe --tags --abbrev=0` walks past every 2.x tag and answers `1.8.0`. Measured on
2026-09-11 cutting 2.6.0: `describe` gave a **455-commit** range where the real one was **88**.
Sort the tags by creation date instead.

```bash
PREV_TAG=$(git tag --sort=-creatordate | head -1)                  # NOT git describe -- see above
echo "$PREV_TAG"                                                   # sanity-check it against `gh release list`
git log --oneline --merges "$PREV_TAG"..HEAD                       # one line per body of work
git log "$PREV_TAG"..HEAD --format=%s%n%b | grep -oE "(Closes|Refs) #[0-9]+" | sort | uniq -c
git diff --stat "$PREV_TAG"..HEAD -- src plugin                    # did the page itself change?
```

Walk the merge list. Every entry either lands in the `CHANGELOG.md` section this release writes,
or you can say why it doesn't (internal-only, already released, superseded). Keep this list; step
3 checks the written section against it before moving on.

## 2. Create the release branch

```bash
git switch develop && git pull --ff-only
git switch -c release/<version>
```

Everything from here through step 6 happens **on this branch**, checked there, before any merge
down — the branch is where the release finishes, not a version-bump holder to fix up after the
tag.

## 3. Do the release's own asks

Whatever polish/fix work the user asked for this release. One status-table row each. This is the
only step whose content isn't dictated by the release process itself.

## 4. Docs for anything new

New or visibly-changed features get a `docs/features/<name>.md` page (copy
`docs/features/_template.md`) and a clip. `docs/features.md`'s nav and inline sections get the
new entry.

## 5. Write the `CHANGELOG.md` section

- **Decide the bump** from `CHANGELOG.md`'s own table: MAJOR breaks output or invocation, MINOR
  is a new capability or an intentional visual change, PATCH is fixes and docs.
- **Human-readable, what shipped, no before/after numbers** — those go in
  `.ai-context/changelog-detail.md`, the regression suite, not here.
- Cross-check against step 1's merge list: everything in the range is named or accounted for.
- A claim about the picture names the tree it was measured against (branch or commit, not "the
  page").

## 6. Version bump

`manifest.json` → `"version": "<version>"`.

## 7. Re-record clips — judgment call, then commit

**The hero (`assets/demo.webp`) goes stale on any visible page change, silently — nothing fails.**
`release.ps1` warns (`=== hero ===`, `=== features ===`) by comparing commit dates, which is a
proxy, not proof. Decide by looking at what actually changed:

```powershell
node scripts/lock.mjs acquire record --owner "release <version>"   # ask before taking the mouse
.\scripts\record-demo.ps1                       # or -Act <name> for one feature clip
.\scripts\make-hero.ps1                          # or -Out assets\features\<name>.webp
node scripts/lock.mjs release record --owner "release <version>"
```

If a shared constant changed (a margin, `FIT_RATIO`, a storyboard reorder), **every existing
clip is stale, not just the ones whose own beats moved** — re-record all of them, not a subset.
Update each re-recorded feature's `Last re-recorded` line in its `docs/features/<name>.md`.
Commit the new assets — a dirty tree is never stamped (step 8) and `release.ps1` refuses one.

## 8. Rehearse the local half — this is the run that pays the suite

```powershell
.\scripts\release.ps1 <version> -DryRun -AllowAnyBranch *> dryrun.log
```

Runs every gate and the full invariant suite (serialized, ~9-10 min), stops before the tag, and
on green ends with `stamped tree <sha> as passed` — that stamp is what lets every push after this
one skip re-running the suite. A dirty tree is never stamped; commit first. If it fails, fix and
re-run **on this branch** — don't chase the failure downstream.

`node scripts/suite-stamp.mjs check` says what the next push will do; `... list` shows every
stamped tree on this machine.

## 9. Push the release branch

```bash
git push origin release/<version>
gh run list --workflow=release.yml --limit 1
gh run watch
```

This runs `release.yml` as a **dry run** on GitHub's runner: builds, gates, attests the three
files, creates no Release. It rehearses the half `release.ps1` can't run locally. Read the run's
summary — three SHA-256 lines and an attestation URL, no Release created.

## 10. Merge into `develop`, then the one push

```bash
git switch develop && git merge --no-ff release/<version>
```

Then **exactly one** plain push:

```bash
git push origin develop
```

**Never wrap this in `scripts/lock.mjs acquire/release suite`** — `.githooks/pre-push` takes that
lock itself around its own run and releases it on every exit (github#92); an outer lock deadlocks
against it. If `develop` hadn't moved since the branch was cut, the merge commit's tree equals
the stamped one and the hook skips the suite, printing the stamp it trusts — this is correct
behavior, not a shortcut; don't reach for `SKIP_SMOKE` to force the same outcome by hand, because
the stamp is what makes the skip honest and a manual skip leaves no record of what was trusted.
If `develop` *had* moved, the hook runs the suite for real on the new tree and stamps it.

If the push fails on a real gate or check failure: fix it, re-verify (isolate with `--only` before
re-running the whole suite blind), commit, and push again — plain, still no outer lock. A push
that fails on a genuinely flaky check is rare after github#110 (the suite is fully serialized);
don't assume flake without isolating the specific check first.

## 11. Merge `develop` → `main`

On the website: open the PR, merge it. The ruleset requires this and has no bypass for a direct
push (github#94). The only required check is the branch-policy job.

```bash
git switch main && git pull --ff-only
```

## 12. Review the release body — before the tag, not after

**Once the tag exists nothing changes.** `release.yml` publishes live the instant the tag lands —
no draft gate, and the workflow drops the raw `## <version>` CHANGELOG section straight into the
release body as its literal content. This review is the actual gate; `release.ps1`'s pre-flight
suite is not a substitute for reading the page a stranger will land on.

Structure (see `.ai-context/releasing.md`'s full section — 1.7.0 is the worked reference,
`gh release view 1.7.0 --json body`):

1. One bold line naming the release and what it's actually about, in the release's own voice.
2. **No hero at the top** — `assets/demo.webp` is large and unspecific; use the feature clips.
3. One `###` per genuinely new or visibly-changed feature (from step 1's range, not memory), its
   matching clip embedded.
4. One line, always the same spot, right after the highlight reel: `☕ If Vault Graph is useful
   to you, [support it on Ko-fi](https://ko-fi.com/luke321).`
5. A `---`, then the `CHANGELOG.md` section **appended verbatim**, heading included.

**Image URLs in the body are pinned to `<version>` or a commit SHA — never to `develop` and never
to `release/<version>`.** The tag doesn't exist yet while drafting, so preview against `develop`,
but the published body's URLs must read `raw.githubusercontent.com/luke321/vault-graph/<version>/...`
— a `develop`-pinned URL keeps moving after publish, and a release-branch-pinned one 404s once the
branch is cleaned up (measured on 1.8.0).

**Draft the body, then publish it as a Claude Artifact and wait for an explicit go-ahead before
touching the live release.** Self-reviewing your own draft and calling that "reviewed" is exactly
the gap that got skipped cutting 2.5.0 — the draft was written, read back by the same session
that wrote it, and pushed live with `gh release edit` before the user had ever seen it. A
one-sentence summary in chat is not a substitute either; publish the actual rendered body (the
highlight reel, the embedded clip, the verbatim CHANGELOG section underneath) as an HTML artifact
so it can be read as the page it's about to become, and treat "saw it, it's good" (or specific
edits) as the actual gate before step 13 runs. `gh release edit <version> --notes-file <file>`
then applies the approved version — after `release.ps1` has created the draft-from-CHANGELOG
release (the Release object doesn't exist before the tag), but the *content* and the *approval*
both happened before this step, not as a post-hoc edit nobody signed off on.

## 13. Tag and push — `release.ps1` on `main`

```powershell
.\scripts\release.ps1 <version>
```

Refuses: a `v`-prefixed tag, a version `manifest.json` doesn't claim, a missing `## <version>`
CHANGELOG section, a branch other than `main`, a dirty tree, a `main` that isn't exactly
`origin/main`. Finds the stamp for `HEAD`'s tree (from step 8, carried through the merges) and
skips the suite — it does not re-run it. Writes the annotated tag (`--cleanup=verbatim`, or the
markdown headings in the tag message get silently stripped) with the CHANGELOG section as its
message, pushes the tag. **Never pushes `main` itself.**

## 14. Let the workflow publish

The tag push triggers `.github/workflows/release.yml`: re-verifies the version, runs the static
gates again, attests the three files (`main.js`, `manifest.json`, `styles.css`) via Sigstore/OIDC,
creates the Release with the reviewed body. Automatic — watch it if you want:

```bash
gh run watch
gh release view <version> --json tagName,name,assets,isDraft
```

## 15. Post to Ko-fi

Once the Release exists (step 14), post an update at ko-fi.com/luke321:

- **Title**: `Vault Graph <version> - <Name>` — always the repo/plugin name first, exactly as the
  GitHub Release is titled but with the plugin name prefixed (`gh release view <version> --json
  name` gives the `<version> - <Name>` half).
- **Image**: a real disc, not a mockup. Build from the actual mirror vault
  (`node src/build-graph.mjs --vault ../vault-graph-mirror --out mirror.html`, or wherever this
  machine's mirror lives — never the real SecondBrain vault, and never a fixture, which would
  publish an invented-looking shape instead of the real one), serve it locally, open it, switch to
  whatever grouping/view this release's headline feature actually changed, and screenshot the
  page. A square crop (pad to square with the page's own `--surface-0` background rather than
  cropping content away) reads best as a post thumbnail.
- **Description**: one or two sentences on what shipped, in the release's own voice — not the
  full changelog. Then two links, **in this order**: the Obsidian community plugin page first
  (`https://community.obsidian.md/plugins/vault-graph`), the GitHub release second
  (`https://github.com/luke321/vault-graph/releases/tag/<version>`). The community page is what
  actually gets someone using it; the release notes are for someone who already knows the tool.
- Post via **Create → Image** (not "Write a quick update", which has no title field).
- **Open the page when done** — `Start-Process "https://ko-fi.com/luke321"` in the user's normal
  browser, not the Claude-in-Chrome automation tab, so what gets reviewed is what a visitor
  actually sees.

This is separate from the cover image (`Add a cover image`, 1200×400, 3:1) — the cover is
standing page furniture, refreshed on its own judgment, not part of every release's own post.

## If something's wrong after the tag

**Don't edit the release or the tag.** Fix on `develop`, cut the next patch version. The one
sanctioned exception is re-running the *unchanged* tag's workflow (nothing here to fix, just a
broken publish) via the escape hatch: `gh workflow run release.yml --repo luke321/vault-graph
--ref main -f tag=<version> -f dry_run=false` — used 2026-09-11 to restore a Release someone had
deleted by hand; the tag and its tree were untouched, only the Release object was gone.
