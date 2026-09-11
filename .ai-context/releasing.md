# Releasing

**Show the status table after every step.** Whoever is driving a release — orchestrator or
otherwise — keeps a table of every step the release still needs (the polish asks, the docs and
clips it must carry, the version bump, the name, the merge-down sequence, the tag) and re-posts
it, updated, after each step lands. Set 2026-09-11, cutting 2.5.0: Lukas asked for this after
seeing one mid-release, and it stays standing practice, not a one-off. Columns: step, status.
Call out what's newly done since the last table and what's still blocked or awaiting a decision
(a release name, whether an in-flight ticket gates this release or becomes a follow-up). Template
(drop rows that don't apply to a given release, add rows for its own polish asks):

```markdown
| # | Step | Status |
|---|---|---|
| 1 | <this release's own polish/fix asks, one row each> | |
| 2 | Any new-feature doc page(s) + clip(s) under `docs/features/` | |
| 3 | `CHANGELOG.md` section for `<version>`, covering every merge since the last tag — and, for a MINOR or MAJOR, `plugin/whats-new.md` rewritten for it: the three-to-five-line note the plugin shows once after the update (github#83, `design/0016`). A PATCH leaves the file alone. `release.ps1` refuses an `x.y.0` whose note is for another version | |
| 4 | Version bump: `manifest.json` → `<version>` | |
| 5 | Release name — propose 2-4 candidates, his pick | |
| 6 | **Re-record every clip the UI change touches** — if anything visual changed this release (a constant like `FIT_RATIO`, a storyboard reorder, a sizing fix), the hero *and every existing feature-gallery clip* are stale, not just the ones whose own beats moved. Needs the `record` lock; ask before recording. Before merge, not after — the merged tree is what the clips should show. | |
| 7 | Merge `release/<version>` → `develop` (local) | |
| 8 | **One** plain `git push origin develop` (the hook takes the `suite` lock itself, github#92 — never wrap the push in your own acquire/release, it deadlocks against the hook's) | |
| 9 | PR/merge `develop` → `main` | |
| 10 | **Draft the release body, publish it as a Claude Artifact, and get an explicit go-ahead before the tag goes out** — `release.yml` publishes live the moment the tag lands, using the `## <version>` CHANGELOG section verbatim as the body and no `--draft` gate; the artifact is what puts the actual rendered page a stranger will land on in front of a human, not a changelog entry read back by the same session that wrote it. This is the actual review step, not `release.ps1`'s pre-flight suite. | |
| 11 | `release.ps1` on `main` — gates, tag, push | |
| 12 | GitHub Actions publishes the release (attestation, assets) — automatic once tagged | |
```

Status values: ✅ done, ⏳ not started / in progress, ⏸️ blocked (name what it's blocked on).

**Why step 10 exists as its own line, added 2026-09-11.** `release.yml`'s own step summary tells
a human to edit the published body afterward ("the release body is the raw CHANGELOG section, a
first draft... edit it in place") — which is exactly the *after-the-tag* editing `CLAUDE.md`'s laws
forbid ("once the tag exists nothing changes"). The workflow creates no GitHub draft to review;
the CHANGELOG section going out is the actual publish. So the review has to happen before the tag,
on `release/<version>`, not after — read the `## <version>` section once as the page it's about to
become, not as a changelog entry, before `release.ps1` runs.

**Step 10 was skipped by substitution, cutting 2.5.0, the same day it was written.** The highlight
reel was drafted, read back by the same session that wrote it, judged fine, and pushed live with
`gh release edit` — no human had seen it. Caught only because Lukas asked directly whether the
guidelines had actually been followed. **"Review" means a human reviews it — publish the drafted
body as a Claude Artifact (the rendered highlight reel, its clip, the verbatim CHANGELOG section
underneath, exactly as it will read on the release page) and wait for an explicit reaction before
running `release.ps1` or touching the live release with `gh release edit`.** A chat summary of the
draft is not the artifact and does not satisfy this; neither does the agent's own read-through,
however careful — the entire reason this step exists is that nobody but Lukas can tell whether the
highlight reel reads as a page he'd want representing the release, and that judgment cannot be
delegated to whoever wrote the draft. Mechanically, `gh release edit` can only run after
`release.ps1` has created the release (the Release object doesn't exist before the tag), but the
drafting, the artifact, and the go-ahead all happen before that — the edit that follows the tag is
applying an already-approved body, not asking for approval after the fact.

**Every release gets a git tag and a GitHub Release with the plugin's three files attached —
`main.js`, `manifest.json`, `styles.css` — each carrying a build provenance attestation.** The
tag alone is not a release: Obsidian installs from those three assets and nothing else. Until
2026-09-05 the Release also carried a `vault-graph-<version>.zip` of the exporter; the release
is plugin-only now. The exporter and the standalone page stay in the repo — the invariant suite
drives them — and anyone wanting to run the exporter clones.

## Two halves: a command, then a workflow

```powershell
.\scripts\release.ps1 2.0.0            # the local half: check, gate, tag, push the tag
```

**`release.ps1` does what only a person can do, and stops at the tag push.** It refuses a `v`
(Obsidian matches the release tag against `manifest.json`'s `version`, which cannot carry a
prefix, so a `v`-tagged release is one nobody can install), a version the manifest does not
claim, a version with no `## <version>` section in `CHANGELOG.md`, a branch other than `main`
(github#47), a dirty tree and a `main` that is not exactly `origin/main` (github#94: behind
means missing what is already published, ahead means a local merge the ruleset will never let
through); prints the hero and feature-clip warnings; runs lint, `check-notice.mjs` and the
invariant suite; builds the plugin once as a pre-flight (the one failure the split introduces
is a build that only fails in CI, leaving a tag with no release, and a tag cannot be re-cut);
then writes the annotated tag with the CHANGELOG section as its message and pushes the tag.
**It never pushes `main`.** The ruleset on `main` requires a pull request and has no bypass,
so the `develop → main` merge happens on the website before the script runs; the first cut of
2.4.0 made its tag and then had `git push origin HEAD` come back with GH013, which is the
dangling-tag case this file warns about. `-DryRun` stops after the suite.

**`.github/workflows/release.yml` is the publisher (github#10).** The tag push triggers it. It
checks out the tagged commit, resolves and re-checks the version against the manifest and the
CHANGELOG, refuses a commit that is not in `origin/main`'s history, runs the static gates
(lint, scope, PII, comments, code map, and `check-notice.mjs`, which builds `main.js` and reads
the Sigma copyright line back out of it and of a fresh exported page), refuses to publish
without all three files, **attests** them with `actions/attest-build-provenance`, drafts the
release body from the `## <version>` section, names the release from that heading, and creates
the Release (or re-uploads over one that exists). Its step summary prints the SHA-256 of each
file and the attestation URL.

**Why publication had to move.** An attestation is signed through Sigstore with the run's OIDC
token, and `id-token: write` is a permission only an Actions run can hold — no script on a
laptop can mint one. After it, anyone can check a downloaded file:

```bash
gh attestation verify main.js --repo luke321/vault-graph
```

The invariant suite stays local: it drives a real Chrome against three generated vaults for
about ten minutes, and **a tree is gated once** (github#93, `decisions/0013`). A green full run
stamps the git tree it measured; `release.ps1` and `.githooks/pre-push` skip the suite when the
tree in front of them already carries that stamp, and name the run they trust. The workflow
trusts the tag. (This file used to say the hook runs the suite *again* on the push of `main`
that carries the tagged commit. It never did: `main` is merged on the website, so the `HEAD`
push `release.ps1` used to make was already up to date, and git hands a pre-push hook zero
refs for an up-to-date push — measured against a bare remote, 2026-09-10. Since github#94 the
script pushes only the tag.)

**Rehearse the local half too.** The workflow's dry run runs on a Linux runner, where
`release.ps1` never executes; the first cut of 2.0.0 stopped at the script's own pre-flight
build (esbuild writing its summary to stderr under `$ErrorActionPreference = 'Stop'`), a
failure no workflow run could have shown. Before every cut, run the script as it will run:

```powershell
.\scripts
elease.ps1 <version> -DryRun -AllowAnyBranch *> dryrun.log   # on the release branch, redirected
```

It runs every gate and the suite and stops before the tag; a green dry run of both halves is
what "ready to cut" means.

**The dry run, and the escape hatch.** A tag-triggered run executes the version of the file
that is *at* the tag, so a bug in it shows up on the first real release and cannot be fixed by
re-running or by fixing `main`. Two things answer that. `workflow_dispatch` with a `tag` input
runs the dispatched branch's file against an existing tag — fix, re-run, still attested. And
**every push to a `release/*` branch runs the workflow as a dry run**: it builds, gates and
attests the three files from that commit, taking the version from `manifest.json`, and creates
no Release — so the whole publishing half is rehearsed on the release branch before any tag
exists. (`workflow_dispatch` with `dry_run` ticked does the same from any branch, but GitHub
only lets a workflow be dispatched once its file is on the default branch, which a new
`release.yml` is not yet.)

```bash
git push origin release/2.0.0      # the dry run starts on its own
gh run list --workflow=release.yml --limit 1
gh run watch
```

What to look at afterwards: the run's summary (three SHA-256 lines and an attestation URL);
`gh attestation verify main.js --repo luke321/vault-graph --format json` against the `main.js`
downloaded from the run's artifact or rebuilt locally from the same commit, which must name the
repository, the workflow file and the commit; and that no Release was created. A dry run's
attestation is a real one, recorded in the repository's attestation store for bytes that were
never published — harmless, and the reason the dry run is not a substitute for the tag run.

Measured 2026-09-06 on `release/2.0.0`: the dry run passed every gate, attested the three files
and skipped the Release; `gh attestation verify main.js --repo luke321/vault-graph` against a
`main.js` built locally from the same commit succeeded, the SHA-256s equal on Windows and on the
Linux runner — the bundle is byte-reproducible across platforms since the loaders resolve
repo-relative. The first attempt failed at the code-map gate: the generator walked directories
in filesystem order, which NTFS sorts and ext4 does not. A gate that only runs on one platform
is the kind of thing the dry run exists to find.

## The release body is a highlight reel ON TOP of the CHANGELOG section, not instead of it

The workflow drops the raw `## <version>` section from `CHANGELOG.md` straight into the
release notes — fine as a first draft, wrong as the finished thing.
`CHANGELOG.md` is the technical record: dense, bug-by-bug, written for someone reading the
project's history. The GitHub Release page is what someone deciding whether to update
actually reads first, and a wall of bug-fix prose with no picture buries the one or two
things that changed for them. **1.7.0's published release is the reference** — read it
(`gh release view 1.7.0 --json body`) before writing another one; the shape below is
reverse-engineered from it, not invented.

**Structure, top to bottom:**

1. **One line naming the release** (`**The Hub.**` style, bold) and the two or three things
   it's actually about, in the release's own voice — not a commit-log summary.
2. **NOT the hero.** `assets/demo.webp` is the README's walkthrough and it is 32 MB — at
   the top of a release page it is the slowest thing on it and the least specific, since it
   shows the whole tool rather than what changed. 1.8.0 left it out; 1.9.0 left it out
   deliberately, after looking at the draft with it in. Embed the FEATURE clips below
   instead, which are a tenth the size each and actually about this release. (Earlier
   releases did carry it, and this file used to say "every release gets this, whether or not
   anything else does" — that was written when the hero was 3 MB and there were no
   per-feature clips to carry the page.)
3. **One `###` (h3, not h2) section per genuinely new or visibly-changed feature** — and the
   set of them comes from the merge list in *First, list what is actually in the release*, not
   from memory, so nothing in the range goes unmentioned. Each
   with its matching clip from `assets/features/*.webp` embedded the same way. Only
   feature clips that exist and are current belong here; don't call something "new" that
   already shipped in an earlier release — check the source at the previous tag first
   (`git show <prev-tag>:src/page.js | grep ...`). Bug fixes real enough to matter but not
   visually demonstrable go in prose under the nearest relevant `###`, or their own
   "Smaller things" `###` list, with no clip forced onto them.
4. **The Ko-fi ask, every release, always the same spot** — right after the highlight reel,
   right before the divider below. One line of text, then the button on its own line:

   ```markdown
   If Vault Graph is useful to you:

   [![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/luke321)
   ```

   Added 2026-09-11 alongside the manifest `fundingUrl`, the README badge and the GitHub
   Sponsor button — this is where it reaches someone who just updated and is reading what's
   new, which is the natural moment for it. It was a plain inline link until 2.6.0 and is
   Ko-fi's own button now, which reads as something to press rather than as a sentence to
   skim. Never embellished, never repeated elsewhere on the page.
5. **A `---` divider**, then the CHANGELOG.md section **appended verbatim, unedited,
   heading included** (`## <version> — "<Name>" — <date>` through to its own trailing
   `---`). This is not a link out — the full technical writeup lives IN the release body,
   underneath the highlight reel, so nothing written for the changelog is lost and nothing
   needs maintaining in two places with two different edit histories.

**On the raw.githubusercontent.com URLs: PIN THEM TO `develop`.** The tag does not exist
until the release is actually published, so a URL pinned to `<version>` (matching how a
*published* release like 1.7.0 references itself) 404s while previewing a draft. This file
used to say: use the release branch (`release/1.8.0`), it "keeps working after publish too,
since the branch doesn't disappear on tag creation". **That advice was wrong, and it broke a
published release.** The branch does not disappear on tag creation — it disappears later,
when somebody cleans up merged branches, which is not an event anybody is thinking about at
release time. Measured 2026-09-02, while drafting 1.9.0: every image on the published 1.8.0
release page is a 404, because `release/1.8.0` is gone. `.../release/1.8.0/assets/features/pin.webp`
answers 404; `.../develop/assets/features/pin.webp` answers 200.

`develop` is the pin because it is the one ref that is never deleted and always carries the
assets — nothing reaches `main` except through it. A commit SHA is equally permanent, and is
the better choice if you want a page frozen against later re-records; the trade is that a
re-recorded clip then never reaches the older release page, which for a *hero* is usually
the wrong way round. Either way: **never a release branch, and never a tag that does not
exist yet.**

Write and review this by hand (or have it drafted and then reviewed) before the release is
published — `gh release edit <version> --notes-file <file>` updates a draft in place, same
command whether the notes came from `release.ps1`'s default or were rewritten after.

## Re-record the hero

**`assets/demo.webp` is part of the release, and it is the only part that goes stale
without anything failing.** It is a recording of the page, so it drifts out of date every
time the page changes visually, and nothing about a build, a suite run or a package
notices. Re-record and re-encode as part of cutting a release, before the tag:

```powershell
.\scripts\record-demo.ps1     # takes the physical mouse for ~30s, so ask first
.\scripts\make-hero.ps1       # animated WebP, 15fps, 960px, quality 60
```

Then commit the new asset, because `release.ps1` refuses a dirty tree.

**The encoder's defaults are what a phone can play.** The 2.0.0 takes first went out at 30 fps and
1200 px, quality 70 — the hero 30.1 MB, 3,722 frames — and Safari on an iPhone played them
visibly slowly off the GitHub README. Measured re-encodes of the same take: 15 fps / 1200 px
17.8 MB, 15 / 960 / q70 12.9 MB, **15 / 960 / q60 11.0 MB** (the default now: a third of the pixels per
second to decode, the cascades still read as motion), 12 / 800 / q60 7.1 MB (choppy on the
cascades, the next step down if a phone still struggles). The feature clips scale the same way;
the biggest, `folders`, went 10.3 → 3.8 MB.

`release.ps1` prints a `=== hero ===` warning when `src/` has commits newer than
`assets/demo.webp`. It is a warning rather than a gate on purpose: only a person can say
whether anything *visible* changed, and a hard stop on a docs-only patch would be wrong
often enough to get skipped by reflex.

It compares **commit** dates, which is a proxy: encoding an old take and committing it
today makes a stale hero look fresh. That is not hypothetical — the WebP asset was
committed 2026-08-23 from the 2026-08-22 recording, so the check would have stayed quiet
on a hero that was already behind. Silence means no *evidence* of staleness, not that the
hero is current.

### The hero take failed for a day, and the bug was in the driver's own arithmetic

Between 2026-09-08 and 2026-09-09 the whole-storyboard take died every time at the first `pin`
beat: `! dragged 371 but it is not pinned afterward — the drop missed the hub`, always at ~32.6 s
of a ~32.5 s drive. Recording a single act worked, so it read like state the preceding act left
behind. It was not.

`demo.mjs` measured the drag delta from where the target *was*, then corrected the press point
for drift and applied the stale delta to the corrected point:

```js
dx = w2.x - w.x;                            // delta from the ORIGINAL resolution
press = fresh;                              // press point corrected for drift
drag(press.x, press.y, press.x + dx, ...);  // ...stale delta applied to it
```

So a drop aimed at an absolute destination landed short by exactly how far the disc had moved
between resolving the target and pressing it. Back to back after `hoptrail`'s camera flight the
drift was enough to miss the hub; with a few seconds' pause — which is what recording one act in
isolation gives you — there was no drift and it passed. **An absolute destination is now
re-resolved and aimed at; only a relative `drag: [dx, dy]` keeps its delta**, because there the
delta is the intent.

Measured: the hero take went from dying at 32.6 s to a complete **162 s** run with zero missed
beats. Two lessons worth more than the fix. **A harness that passes in isolation and fails in
sequence is suspect in the harness, not only in the thing it drives** — the same shape as the
count-bar check that passed alone and failed after earlier checks had scrolled its row off
screen. And **a correction applied to one half of a computed pair is a bug waiting for a
deadline**: correcting the press without recomputing the destination was strictly worse than
correcting neither, because it looked careful.

## Feature clips are different from the hero — regenerate on judgment, not every release

`docs/features.md` and `assets/features/*.webp` are the per-feature gallery (see
`docs/features/_template.md`). Unlike the hero, **these are not regenerated every
release.** Re-record a feature's clip only when it's new or when this release visibly
changed it — that's a call for whoever is cutting the release to make, looking at what the
`CHANGELOG.md` entry actually says, not something to automate:

```powershell
.\scripts\record-demo.ps1 -Act <name>        # e.g. -Act timeline
.\scripts\make-hero.ps1 -In demo-<name>-<timestamp>.mp4 -Out assets\features\<name>.webp
```

Commit the new clip and update that feature's `Last re-recorded` line in
`docs/features/<name>.md` together — that pair is what the `=== features ===` warning
below reads.

`release.ps1` prints `=== features ===`, one line per feature whose `Last re-recorded`
predates a commit touching `src/page.js` — the same non-blocking severity as `=== hero
===`, for the same reason: it's evidence worth a look, not proof anything actually needs
re-recording. It checks the whole file rather than which `act:` a commit touched, so it can
over-warn (a `colours`-only change flags every feature) but never under-warns silently.

### A tag message loses every markdown heading unless you say `--cleanup=verbatim`

`git tag -F` defaults to `--cleanup=strip`, which treats a line starting with `#` as a comment
and deletes it. The tag message is the CHANGELOG section, so that quietly ate the
`## <version>` heading and every `###` section heading from it — measured on the tags
themselves: **2.0.0, 2.1.0 and 2.2.0 each carry zero heading lines**, against 8 in 2.3.0's
source section. `git show <tag>` was supposed to tell the same story as the Release page and
had been telling a flattened one since the script was written.

`release.ps1` passes `--cleanup=verbatim` now. Caught before 2.3.0's tag was pushed, so that
one has its headings; the three older tags keep the defect, because a published tag is not
edited.

## First, list what is actually in the release

**A release is the RANGE, not the work you happen to have just finished.** Before the bump is
decided or a word of the section is written, enumerate everything between the previous tag and
the commit being cut, and account for every line of it:

```bash
git log --oneline --merges <prev-tag>..HEAD          # one line per body of work
git log <prev-tag>..HEAD --format=%s%n%b | grep -oE "(Closes|Refs) #[0-9]+" | sort | uniq -c
git diff --stat <prev-tag>..HEAD -- src plugin       # did the page itself change?
```

Then walk the merge list and ask of each one: **is it in the CHANGELOG section?** A body of work
that is not named there ships invisibly — the tag carries it, the release page does not mention
it, and nobody reading the release ever learns it exists.

**This is written down because 2.1.0 shipped that way once.** Its section described the mobile
view and nothing else, while the range also held the hop trail (github#40, a whole user-visible
feature with its own gallery entry) and a pass at the cascade's per-frame planner cost
(github#19, script per frame 37.3 → 23.6 ms on the 10k fixture). The section had been written
from the work in hand rather than from the range. The instruction further up to *check the source
at the previous tag* had been read only as "do not call something new that already shipped" — the
inverse mistake, saying nothing about something that did ship, was not covered until now. The
release was deleted and re-cut.

The same pass catches the other half of it: **a claim about the picture has to name the tree it
was measured against.** That release said "compared against 2.0.0's page, nothing on the desktop
moved", when the reference pages had been built from `develop`'s own source — which already
carried the hop trail, and the hop trail *does* change the desktop picture, since it adds a back
arrow and crumbs to a note's card. A render-diff run is only ever a statement about the two trees
it compared. Name them.

**The body's images are pinned to the tag, never to a branch.** Write
`raw.githubusercontent.com/luke321/vault-graph/<version>/assets/...`, not `.../develop/...`.
A branch ref makes the release page's pictures change every time that branch moves, which is
the same rule as *once the tag exists nothing changes* -- broken by construction rather than by
anyone editing. It is not hypothetical: on 2.2.0's branch the reel pointed at `develop`, where
`collapse.webp` was still the take from before that day's storyboard fix, so the page would have
shown a clip the release did not contain. 2.1.0's body has the same branch refs and its pictures
are still moving.

**And a count in the section is a measurement like any other.** 2.2.0's first draft said
"all fifteen clips" with sixteen in `docs/features/`; `ls docs/features/*.md | grep -v _template
| wc -l` is the answer, not memory.

## The release branch is where everything lands, and the tag is the end of it

**Everything the release needs is finished ON `release/<version>` and checked there**: the
CHANGELOG section covering the whole range, every clip the section will embed, every doc that
mentions the version, and the release body itself. Only then does it go
`release/<version>` → `develop` → `main` → tag → publish.

**After the tag exists, nothing changes.** Not the body, not the docs, not the changelog. If
something is wrong enough to fix, it is the next patch version — an edit after the fact leaves
the tag's tree disagreeing with the published page, and nobody can tell afterwards which one was
meant.

**2.1.0 was cut twice and edited after both, which is what this section is for.** The branch was
used as a version-bump holder: the bump and the changelog went on it, and the work of finding out
what the release actually contained happened after the tag. So the release was deleted and re-cut
with the hop trail and the planner pass named and the hop trail's clip finally recorded — and
then the body was edited twice more, because the highlight reel was written in the same voice as
the changelog it sits above and the published page said everything twice. The tag and `develop`
still differ by the commit that trimmed it. The order below is not bureaucracy; every one of
those edits was avoidable by doing it on the branch.

## What the release branch owes before `develop`, and what happens after

The suite runs **once per distinct tree**, and the release path is arranged so that the one
run happens on the release branch, where a failure is still cheap. Measured while cutting
2.4.0 (github#93): a full run is **587 s** on the reference machine — 8 s of builds, 133 s of
four parallel Chromes, **446 s of the serial lane** of frame-sensitive checks — and the
static gates ahead of it total 10.5 s. Everything below is written so that number is paid
exactly once.

**Before merging into `develop`** — all of it on `release/<version>`:

1. Finish everything the release needs on the branch (the section above).
2. Rehearse the local half: `.\scripts\release.ps1 <version> -DryRun -AllowAnyBranch`. **This is
   the run that pays the suite.** It ends with `stamped tree <sha> as passed`, which records the
   branch's tree and the three fixtures it ran against in the shared git common dir. A dirty tree
   is never stamped; commit first — and **do not commit while it runs**, because the tree is
   captured before the first build and a moved HEAD refuses the stamp (github#104), which costs
   the suite again at step 3. Nor with `--jobs`, `--chrome`, `--headed`, `--no-grid` or `--port`:
   that is not the shape the gates push with, and it stamps nothing.
3. Push the branch: the workflow's dry run builds, gates and attests the three files on a Linux
   runner (static gates only, no Chrome, under a minute). Read its summary.

**After** — three moves, none of which should pay the suite again:

4. Merge `release/<version>` into `develop` and push. The hook checks the pushed commit's tree:
   **if `develop` had not moved, the merge commit's tree is the branch's tree and the hook
   skips**, printing the stamp it trusts. If `develop` *had* moved, the merge is new content and
   the hook runs the suite for real — and stamps the new tree. Do not reach for `SKIP_SMOKE`
   here; the stamp is what makes the skip honest, and a skipped run leaves no record of what
   was trusted.
5. Open `develop` → `main` on the website and merge it. The only required check is the
   branch-policy job (4 s). The merge commit carries `develop`'s tree byte for byte — measured
   on 2.3.0, 2.4.0 and 2.4.1.
6. `git switch main && git pull --ff-only`, then `.\scripts\release.ps1 <version>`. It checks
   that `main` is exactly `origin/main` (github#94: a `main` that is ahead is a local merge the
   ruleset will never accept, and the script stops before any tag exists), finds the stamp for
   `HEAD`'s tree and skips the suite, tags, and pushes the tag (never gated). The workflow
   publishes.

`node scripts/suite-stamp.mjs check` says what step 4 or 6 will do before you push, and
`node scripts/suite-stamp.mjs list` shows every tree this machine has passed.
`-ForceSuite` on `release.ps1` re-earns a stamp when there is a reason not to trust one.

What used to happen, for the record: 2.4.0 was cut with the suite run on the release branch's
dry run, skipped by hand (`SKIP_SMOKE`) on both `develop` pushes because it had "just passed",
and run again in full inside `release.ps1` — while the issue that filed it counted the PR's
status check as a third run, which it never was. The stamp replaces the by-hand skip with one
that can say what it trusted.

## What it does, in case you need to do it by hand

1. **List the range** as above, and check every merge in it against the section you are about to
   write.

2. **Decide the bump** from `CHANGELOG.md`'s own table — MAJOR breaks output or invocation,
   MINOR is a new capability or an intentional visual change, PATCH is fixes and docs.
3. **Write the release section in `CHANGELOG.md`** — human-readable, what shipped, no
   before/after numbers. Those go in `changelog-detail.md`, which is the regression suite.
4. **Re-record the hero** if the page changed visually, then commit `assets/demo.webp` —
   `record-demo.ps1` to take the recording, `make-hero.ps1` to encode it. **Re-record any
   feature clip** this release changed, same two commands with `-Act <name>` — see above;
   this one's a judgment call, not "always."
5. **Run the gates.** `npm run lint`, `node scripts/check-notice.mjs`, `node scripts/smoke.mjs`
   — and they run again on push via `.githooks/pre-push`, so a red suite cannot be released.
6. **Get the commit onto `origin/main` first**: merge `develop → main` through a pull request
   on the website — the ruleset refuses a direct push (github#94) — then `git switch main &&
   git pull --ff-only`.
7. **Tag, annotated**, with the release summary as the message, on that `main`, and **push the
   tag.** The commit is already on `origin/main`, so the workflow's main-ancestry guard has no
   race to lose. Everything below is what the workflow then does for you.
8. **Build the plugin** — `node scripts/build-plugin.mjs` writes `main.js` and `styles.css`
   at the repo root (gitignored); `manifest.json` is tracked.
9. **Create the release** and attach exactly those three:
   `gh release create <version> main.js manifest.json styles.css --notes-file <notes>`

**Steps 8–9 by hand produce an unattested release**, and there is no way around that from a
laptop. They are the *second* fallback for a broken workflow: try
`gh workflow run release.yml --ref main -f tag=<version>` first, which runs a fixed
`release.yml` against the tag that already exists and still attests. Hand-publishing is the
last resort, and what it produces is the thing github#10 was filed about.

## What the release must carry: the Sigma notice

The engine is a port of Sigma.js under MIT, and a `main.js` or exported page without its
copyright and permission notice is a licence violation, not a cosmetic slip. It went missing
once (github#58): esbuild keeps only `/*!` comments, and the banner was a plain one. Since
2.0.0 `node scripts/check-notice.mjs` builds both artifacts and reads the copyright line back
out of each, and the pre-push hook runs it with no skip flag on every push to `develop`, and
`release.yml` runs it again on the tag before anything is attested (the merge into `main`
happens on the website, where no hook runs). A release cannot be cut from a tree whose builds
lack the notice, and the three attached files are the ones that build makes.

## What the release must NOT contain

- **Any built `vault-graph.html`.** It embeds the note titles and folder structure of
  whichever vault produced it. Publishing one publishes that. (The exporter's zip used to
  carry its own check for this; with the zip gone, the rule is that nothing but the three
  plugin files is attached.)
- Anything else: the directory's scanner calls every other asset an extra unsupported file.
