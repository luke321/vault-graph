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

## Ask everything first, then run

**One gate at the front, then go.** A release is an hour of mechanical work with four or five
decisions buried in it, and stopping at each one turns an hour into an afternoon. Gather the
decisions up front, get them answered in one exchange, then run every step to the end without
stopping again.

**Front-load these, before step 1:**

1. **The release name** (step 5) -- propose 2-4 candidates unless he has already said one.
2. **Anything visual to re-record beyond the default.** Everything is re-recorded every release
   (github#121); what needs asking is whether a feature shipped with *no* clip and no storyboard
   act, because writing one is product work and changes what this cut is.
3. **This release's own polish/fix asks**, if he has any.
4. **The drafts, both of them, together:** the `CHANGELOG.md` section and the release body.
   Write them from the range at step 1, publish the body as an Artifact, and get them approved in
   the same exchange as the questions above. Do not draft the body at step 13 and ask then -- by
   then he has been waiting through the suite, the clips and three pushes for a question you
   could have asked at the start.

**Then run steps 1-16 without stopping**, except for these, which are not optional:

- **The clip review (step 8) and the update strip (step 9).** He looks at what was recorded
  before it is committed, and at the strip rendered, before either ships. These catch a capture
  that grabbed the wrong window and a strip nobody has seen — neither of which any gate sees.
- **The `develop` -> `main` PR (step 12).** Merge it yourself if you can; the ruleset requires a
  PR, not a human.
- **Anything that fails.** A red gate, a failing check, a workflow that goes red: stop, fix it,
  say what it was. Never route around a gate to keep the run moving.
- **Anything genuinely new.** A decision the questions above did not cover, or a finding that
  changes what the release contains.

Everything else -- the branch, the bump, the dry run, the pushes, the tag, the Ko-fi post -- runs
without asking. Invoking this skill is the authorization for all of it.


## Keep the chat short

**The table is the report.** Post it after every step, then at most two lines of prose: what is
newly done, and what is blocked or waiting on him. Nothing else.

Everything that explains or justifies a step goes where it can be read on demand and skipped by
default — the commit message, the issue, `.ai-context/changelog-detail.md`, or the artifact being
reviewed. Do not restate it in chat. Specifically, do not narrate gates that passed ("suite
green" is the whole sentence), do not list the numbers behind a decision, do not summarise an
artifact you just linked, and do not recap what earlier steps did. He is reading to decide, not
to audit; a long report buries the one line he needs.

## The status table

Post this after every step below, updated — not just at the end. Columns: `#`, `Step`, `Status`
(✅ done, ⏳ not started/in progress, ⏸️ blocked — name what it's blocked on). Drop rows that don't
apply to this release; add one row per this release's own polish/fix asks at the top.

```markdown
| # | Step | Status |
|---|---|---|
| 1 | <this release's own polish/fix asks, one row each> | |
| 2 | Any new-feature doc page(s) + clip(s) under `docs/features/` | |
| 3 | `CHANGELOG.md` section for `<version>`, covering every merge since the last tag | |
| 4 | Version bump: `manifest.json` → `<version>` | |
| 5 | Release name — propose 2-4 candidates, his pick | |
| 6 | Re-record every clip and the hero (github#121) | |
| 7 | **Look at every re-recorded clip in one Artifact, and get a yes, before committing any of them** | |
| 8 | **Render the update strip and show it** (MINOR/MAJOR only) — a real screenshot, not the markdown | |
| 9 | Merge `release/<version>` → `develop` (local) | |
| 10 | **One** plain `git push origin develop` | |
| 11 | PR/merge `develop` → `main` | |
| 12 | Draft the release body, publish as an Artifact, get an explicit go-ahead | |
| 13 | `release.ps1` on `main` — gates, tag, push | |
| 14 | GitHub Actions publishes the release — automatic once tagged | |
| 15 | Post to Ko-fi: title, disc screenshot, community-page link then release link; open the page | |
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
new entry. Then `node scripts/gallery-nav.mjs` (github#127) so the gallery's "New in" strip picks
up whatever this release's `Introduced in` lines make newest — pre-push checks this the same way
it checks the code map, so a forgotten run is caught there if not here.

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

## 7. Re-record every clip and the hero, then look at them

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

## 8. Look at every clip before committing it

**`record-demo.ps1` captures a *region of the desktop*, so whatever is drawn over that
rectangle is what lands in the take — and the take still looks plausible: right dimensions,
right duration, a real file.** On 2026-09-11 a full re-record silently captured an Obsidian
window sitting on the target monitor, open on Lukas's own vault, and five clips were
overwritten with footage of his personal frontmatter before anything caught it. What caught
it was a size comparison, not an eye: **0.04 MB against a committed 4.37 MB**, because a
static capture compresses to almost nothing. github#122 raises the window now, which removes
the common cause but not the need to look.

Two gates, in this order, neither optional:

1. **Check the first take before running the rest.** One act, then look at a frame. Nineteen
   blind takes is how five bad clips happen instead of one.
2. **Publish every re-recorded clip and the hero in ONE Artifact and get an explicit yes.** Each
   clip at its published size, its name and byte size beside it, and the previously committed
   size next to that so a collapse is obvious at a glance. `git checkout -- assets/` restores
   everything if the answer is no — the old clips are in git, which is the only reason this is
   recoverable.

An artifact loads nothing external, so inline each `.webp` as a `data:` URI; if the set will not
fit under 16MB, declare the `assets` capability and `upload_asset` them instead (load
`artifact-capabilities` first). Fixtures only, never a real vault — which is exactly what went
wrong the day this rule was written.

Commit the new assets only after that yes — a dirty tree is never stamped (step 10) and
`release.ps1` refuses one.

## 9. Render the update strip and show it — MINOR and MAJOR only

`plugin/whats-new.md` is markdown; **what ships is a strip above the disc in a real Obsidian**,
and reading the markdown is not seeing it. `release.ps1` only proves the file exists and names
this version. 2.6.0 shipped the strip without anyone having looked at it rendered once, which is
how the Got it button's placement (github#126) was first noticed *after* the release.

```bash
node scripts/lock.mjs acquire screen-left --owner "release <version>"
node scripts/update-note-check.mjs --out <scratchpad>/strip
node scripts/lock.mjs release screen-left --owner "release <version>"
```

It mounts the plugin in a real Obsidian, upgrades a vault from a `data.json` without
`lastSeenVersion`, and writes `01-strip-up.png` (the strip as a user first sees it),
`02-dismissed.png` and `03-chain.png` (several missed releases chained). It drives Obsidian on a
display, so it takes the screen lock; it is also a 29-assertion check, so a failure here is a
real one.

**Put `01-strip-up.png` in front of him** — in the same Artifact as the clips (step 8) if that
step ran, otherwise its own. What to look at: the bullets say something a user understands, the
release links point at the right version, and the control the note names is the one pulsing.

Skip on a PATCH: no strip is shown, by design.

## 10. Rehearse the local half — this is the run that pays the suite

```powershell
.\scripts\release.ps1 <version> -DryRun -AllowAnyBranch *> dryrun.log
```

Runs every gate and the full invariant suite (serialized, ~9-10 min), stops before the tag, and
on green ends with `stamped tree <sha> as passed` — that stamp is what lets every push after this
one skip re-running the suite. A dirty tree is never stamped; commit first. If it fails, fix and
re-run **on this branch** — don't chase the failure downstream.

`node scripts/suite-stamp.mjs check` says what the next push will do; `... list` shows every
stamped tree on this machine.

## 11. Push the release branch

```bash
git push origin release/<version>
gh run list --workflow=release.yml --limit 1
gh run watch
```

This runs `release.yml` as a **dry run** on GitHub's runner: builds, gates, attests the three
files, creates no Release. It rehearses the half `release.ps1` can't run locally. Read the run's
summary — three SHA-256 lines and an attestation URL, no Release created.

## 12. Merge into `develop`, then the one push

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

## 13. Merge `develop` → `main`

On the website: open the PR, merge it. The ruleset requires this and has no bypass for a direct
push (github#94). The only required check is the branch-policy job.

```bash
git switch main && git pull --ff-only
```

## 14. Review the release body — before the tag, not after

**Once the tag exists nothing changes.** `release.yml` publishes live the instant the tag lands —
no draft gate, and the workflow drops the raw `## <version>` CHANGELOG section straight into the
release body as its literal content. This review is the actual gate; `release.ps1`'s pre-flight
suite is not a substitute for reading the page a stranger will land on.

**Read the last published release before writing a word of this one.**

```bash
gh release view "$PREV_TAG" --json body -q .body
```

Not optional and not from memory: the voice lives in the artifact, not in this file. Match what
you see there, and check the draft against it on two axes that go wrong every time:

- **Plain, not technical.** Write what the thing does for someone using the plugin. A reader of
  the notes does not want breakpoints, band outlines, function names, or what a value is measured
  against — that is what `.ai-context/` is for. 2.6.0's first draft was written straight out of
  the design records and came back as "to verbose and technical"; it shipped as "a small map
  appears next to Fit, with a box marking the part you are looking at".
- **Short.** 2.5.0's whole reel is under 300 words. Bullets carry the detail and each section is
  bullets throughout — the only prose is the one bold opening line.

Structure (see `.ai-context/releasing.md`'s full section):

1. One bold line naming the release and what it's actually about, in the release's own voice.
2. **No hero at the top** — `assets/demo.webp` is large and unspecific; use the feature clips.
3. One `###` per genuinely new or visibly-changed feature (from step 1's range, not memory), its
   matching clip embedded.
4. The Ko-fi ask, always the same spot, right after the highlight reel: the line
   `If Vault Graph is useful to you:`, then the button on its own line —
   `[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/luke321)`
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

## 15. Tag and push — `release.ps1` on `main`

```powershell
.\scripts\release.ps1 <version>
```

Refuses: a `v`-prefixed tag, a version `manifest.json` doesn't claim, a missing `## <version>`
CHANGELOG section, a branch other than `main`, a dirty tree, a `main` that isn't exactly
`origin/main`. Finds the stamp for `HEAD`'s tree (from step 10, carried through the merges) and
skips the suite — it does not re-run it. Writes the annotated tag (`--cleanup=verbatim`, or the
markdown headings in the tag message get silently stripped) with the CHANGELOG section as its
message, pushes the tag. **Never pushes `main` itself.**

## 16. Let the workflow publish

The tag push triggers `.github/workflows/release.yml`: re-verifies the version, runs the static
gates again, attests the three files (`main.js`, `manifest.json`, `styles.css`) via Sigstore/OIDC,
creates the Release with the reviewed body. Automatic — watch it if you want:

```bash
gh run watch
gh release view <version> --json tagName,name,assets,isDraft
```

## 17. Post to Ko-fi

Once the Release exists (step 16), post an update at ko-fi.com/luke321. **Do it yourself with the
Claude in Chrome tools** -- he is signed in there; do not hand him a link and a block of text to
paste. The flow, as measured on 2.6.0:

- `ko-fi.com/Manage` -> the **Add something** button, then **Image** in the modal (not "Write a
  quick update", which has no title field).
- `read_page` gives the Title and Description fields; `form_input` fills them.
- **The image needs `find`, not `read_page`.** The dropzone's `<input type=file>` is not in the
  accessibility tree, and clicking **Add +** opens nothing useful. `find` for "hidden file input
  for uploading post images (dropzone)" returns it, then `file_upload` attaches the PNG.
- Screenshot the filled dialog, confirm the exact wording with him, then click **Post image** --
  that publishes publicly and is the one click in this step that needs a yes.

The content:

- **Title**: `Vault Graph <version> - <Name>` — always the repo/plugin name first, exactly as the
  GitHub Release is titled but with the plugin name prefixed (`gh release view <version> --json
  name` gives the `<version> - <Name>` half).
- **Image**: a real disc, not a mockup. **Wait for the cascade to land before you capture.**
  The disc animates into place over ~1.6 s and a frame taken before it settles has half a ring
  drawn -- it reads as a rendering bug, not as a product. Poll until `__vg.state.until === null`
  and `__vg.demo.busy()` is false, then give it another couple of seconds, and only then
  screenshot. 2.6.0's first Ko-fi post went out mid-cascade and had to be deleted and reposted,
  which is worse than it sounds: Ko-fi's post editor can change the title, the text and the
  audience but **not the image**, and deleting the feed item leaves the image in the gallery, so
  the real undo is deleting the gallery item itself.

  Capture it **square** and over CDP, which needs no screen lock:
  `Emulation.setDeviceMetricsOverride` at 1000x1000 with `deviceScaleFactor: 2`, then
  `__vg.renderer.getCamera().setState({x:0.5,y:0.5,ratio:0.42,angle:0})` so the disc is cropped
  and the release's own overview tile is actually in the shot. Build from the actual mirror vault
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
