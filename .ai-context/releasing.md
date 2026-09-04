# Releasing

**Every release gets a git tag, a GitHub Release, and a ready-to-run package attached.**
The tag alone is not a release: GitHub's auto-generated source archives include
`.ai-context/` (a few thousand lines of design records) and the dev tooling, which is not
what someone wanting to *run* this needs.

## One command

```powershell
.\scripts\release.ps1 1.5.3
```

**The version is bare semver, with no `v`.** Obsidian installs a plugin by matching the
release tag against `manifest.json`'s `version`, which cannot carry a prefix — so a
`v`-tagged release is one nobody can install. The script rejects a `v` with that reason,
and rejects a version the manifest does not already claim. (Its own check said `^v...`
until 1.5.3, which is why 1.5.0–1.5.2 were cut by hand.)

It refuses to release a dirty tree (a release must be reproducible from its tag), refuses a
version with no `## <version>` section in `CHANGELOG.md` (a version whose changes nobody
wrote down), runs the invariant suite, then tags, packages, pushes and creates the GitHub
Release with the zip attached. `-DryRun` stops after the suite. The tag message is the same
text as the release notes, so `git show <tag>` and the Release page agree.


## The release body is a highlight reel ON TOP of the CHANGELOG section, not instead of it

`release.ps1` drops the raw `## <version>` section from `CHANGELOG.md` straight into the
release notes by default — fine as a first draft, wrong as the finished thing.
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
4. **Run the suite.** `node scripts/smoke.mjs` — and it runs again on push via
   `.githooks/pre-push`, so a red suite cannot be released.
5. **Tag, annotated**, with the release summary as the message.
6. **Build the package** — `node scripts/make-package.mjs` writes
   `dist/vault-graph-<version>.zip` containing only what is needed to run: `src/`,
   `scripts/`, `assets/`, `package.json` and the lockfile (the exporter bundles the engine
   with esbuild, so `npm ci` once), `README.md`, `LICENSE`, `CHANGELOG.md`.
7. **Create the release** and attach it:
   `gh release create <version> dist/vault-graph-<version>.zip --notes-file <notes>`

## What the package must NOT contain

- **Any built `vault-graph.html`.** It embeds the note titles and folder structure of
  whichever vault produced it. Publishing one publishes that.
- `test-vault/` — generated, and large.
- `.ai-context/` — it belongs to the repo, not to a user of the tool.
