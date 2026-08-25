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


## Re-record the hero

**`assets/demo.webp` is part of the release, and it is the only part that goes stale
without anything failing.** It is a recording of the page, so it drifts out of date every
time the page changes visually, and nothing about a build, a suite run or a package
notices. Re-record and re-encode as part of cutting a release, before the tag:

```powershell
.\scripts\record-demo.ps1     # takes the physical mouse for ~30s, so ask first
.\scripts\make-hero.ps1       # animated WebP, 30fps, 700px
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
   `vendor/`, `scripts/`, `assets/`, `README.md`, `LICENSE`, `CHANGELOG.md`.
7. **Create the release** and attach it:
   `gh release create <version> dist/vault-graph-<version>.zip --notes-file <notes>`

## What the package must NOT contain

- **Any built `vault-graph.html`.** It embeds the note titles and folder structure of
  whichever vault produced it. Publishing one publishes that.
- `test-vault/` — generated, and large.
- `.ai-context/` — it belongs to the repo, not to a user of the tool.
