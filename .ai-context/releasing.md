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

## What it does, in case you need to do it by hand

1. **Decide the bump** from `CHANGELOG.md`'s own table — MAJOR breaks output or invocation,
   MINOR is a new capability or an intentional visual change, PATCH is fixes and docs.
2. **Write the release section in `CHANGELOG.md`** — human-readable, what shipped, no
   before/after numbers. Those go in `changelog-detail.md`, which is the regression suite.
3. **Run the suite.** `node scripts/smoke.mjs` — and it runs again on push via
   `.githooks/pre-push`, so a red suite cannot be released.
4. **Tag, annotated**, with the release summary as the message.
5. **Build the package** — `node scripts/make-package.mjs` writes
   `dist/vault-graph-<version>.zip` containing only what is needed to run: `src/`,
   `vendor/`, `scripts/`, `assets/`, `README.md`, `LICENSE`, `CHANGELOG.md`.
6. **Create the release** and attach it:
   `gh release create <version> dist/vault-graph-<version>.zip --notes-file <notes>`

## What the package must NOT contain

- **Any built `vault-graph.html`.** It embeds the note titles and folder structure of
  whichever vault produced it. Publishing one publishes that.
- `test-vault/` — generated, and large.
- `.ai-context/` — it belongs to the repo, not to a user of the tool.
