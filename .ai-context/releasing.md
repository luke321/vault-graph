# Releasing

**Every release gets a git tag and a GitHub Release with the plugin's three files attached —
`main.js`, `manifest.json`, `styles.css` — each carrying a build provenance attestation.** The
tag alone is not a release: Obsidian installs from those three assets and nothing else. Until
2026-09-05 the Release also carried a `vault-graph-<version>.zip` of the exporter; the release
is plugin-only now. The exporter and the standalone page stay in the repo — the invariant suite
drives them — and anyone wanting to run the exporter clones.

## Two halves: a command, then a workflow

```powershell
.\scripts\release.ps1 2.0.0            # the local half: check, gate, tag, push
```

**`release.ps1` does what only a person can do, and stops at the tag push.** It refuses a `v`
(Obsidian matches the release tag against `manifest.json`'s `version`, which cannot carry a
prefix, so a `v`-tagged release is one nobody can install), a version the manifest does not
claim, a version with no `## <version>` section in `CHANGELOG.md`, a branch other than `main`
(github#47), a dirty tree and a `main` behind `origin`; prints the hero and feature-clip
warnings; runs lint, `check-notice.mjs` and the invariant suite; builds the plugin once as a
pre-flight (the one failure the split introduces is a build that only fails in CI, leaving a
tag with no release, and a tag cannot be re-cut); then writes the annotated tag with the
CHANGELOG section as its message and pushes the branch, then the tag. `-DryRun` stops after
the suite.

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
minutes, `release.ps1` runs it before the tag, and `.githooks/pre-push` runs it again on the
push of `main` that carries the tagged commit. The workflow trusts the tag.

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
3. **One `###` (h3, not h2) section per genuinely new or visibly-changed feature**, each
   with its matching clip from `assets/features/*.webp` embedded the same way. Only
   feature clips that exist and are current belong here; don't call something "new" that
   already shipped in an earlier release — check the source at the previous tag first
   (`git show <prev-tag>:src/page.js | grep ...`). Bug fixes real enough to matter but not
   visually demonstrable go in prose under the nearest relevant `###`, or their own
   "Smaller things" `###` list, with no clip forced onto them.
4. **A `---` divider**, then the CHANGELOG.md section **appended verbatim, unedited,
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
.\scripts\make-hero.ps1       # animated WebP, 30fps, 1200px
```

Then commit the new asset, because `release.ps1` refuses a dirty tree.

`release.ps1` prints a `=== hero ===` warning when `src/` has commits newer than
`assets/demo.webp`. It is a warning rather than a gate on purpose: only a person can say
whether anything *visible* changed, and a hard stop on a docs-only patch would be wrong
often enough to get skipped by reflex.

It compares **commit** dates, which is a proxy: encoding an old take and committing it
today makes a stale hero look fresh. That is not hypothetical — the WebP asset was
committed 2026-08-23 from the 2026-08-22 recording, so the check would have stayed quiet
on a hero that was already behind. Silence means no *evidence* of staleness, not that the
hero is current.

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

## What it does, in case you need to do it by hand

1. **Decide the bump** from `CHANGELOG.md`'s own table — MAJOR breaks output or invocation,
   MINOR is a new capability or an intentional visual change, PATCH is fixes and docs.
2. **Write the release section in `CHANGELOG.md`** — human-readable, what shipped, no
   before/after numbers. Those go in `changelog-detail.md`, which is the regression suite.
3. **Re-record the hero** if the page changed visually, then commit `assets/demo.webp` —
   `record-demo.ps1` to take the recording, `make-hero.ps1` to encode it. **Re-record any
   feature clip** this release changed, same two commands with `-Act <name>` — see above;
   this one's a judgment call, not "always."
4. **Run the gates.** `npm run lint`, `node scripts/check-notice.mjs`, `node scripts/smoke.mjs`
   — and they run again on push via `.githooks/pre-push`, so a red suite cannot be released.
5. **Tag, annotated**, with the release summary as the message, on `main`.
6. **Push `main`, then the tag.** That order, so the workflow's main-ancestry guard cannot
   lose the race. Everything below is what the workflow then does for you.
7. **Build the plugin** — `node scripts/build-plugin.mjs` writes `main.js` and `styles.css`
   at the repo root (gitignored); `manifest.json` is tracked.
8. **Create the release** and attach exactly those three:
   `gh release create <version> main.js manifest.json styles.css --notes-file <notes>`

**Steps 7–8 by hand produce an unattested release**, and there is no way around that from a
laptop. They are the *second* fallback for a broken workflow: try
`gh workflow run release.yml --ref main -f tag=<version>` first, which runs a fixed
`release.yml` against the tag that already exists and still attests. Hand-publishing is the
last resort, and what it produces is the thing github#10 was filed about.

## What the release must carry: the Sigma notice

The engine is a port of Sigma.js under MIT, and a `main.js` or exported page without its
copyright and permission notice is a licence violation, not a cosmetic slip. It went missing
once (github#58): esbuild keeps only `/*!` comments, and the banner was a plain one. Since
2.0.0 `node scripts/check-notice.mjs` builds both artifacts and reads the copyright line back
out of each, and the pre-push hook runs it with no skip flag on every push to `develop` or
`main` — the merge into `main` that *is* the release included. A release cannot be cut from a
tree whose builds lack the notice, and the three attached files are the ones that build makes.

## What the release must NOT contain

- **Any built `vault-graph.html`.** It embeds the note titles and folder structure of
  whichever vault produced it. Publishing one publishes that. (The exporter's zip used to
  carry its own check for this; with the zip gone, the rule is that nothing but the three
  plugin files is attached.)
- Anything else: the directory's scanner calls every other asset an extra unsupported file.
