# Releasing

**Every release gets a git tag, a GitHub Release, a ready-to-run package, and a build
provenance attestation on every asset.** The tag alone is not a release: GitHub's
auto-generated source archives include `.ai-context/` (a few thousand lines of design
records) and the dev tooling, which is not what someone wanting to *run* this needs.

## Two halves: a command, then a workflow

```powershell
.\scripts\release.ps1 1.5.3          # gates, tags, pushes -- and stops
```

The push of the tag is the trigger. `.github/workflows/release.yml` does the rest: builds
`main.js` and `styles.css` from the tagged commit, packages the zip, **attests all four
assets**, and creates the Release with the `CHANGELOG.md` section as a first-draft body.

**This used to be one command that did everything, and the split is not tidiness
(github#10).** An artifact attestation is signed through Sigstore using a workflow's OIDC
token. `id-token: write` is a permission only an Actions run can hold, so a local
`gh release create` cannot mint one and never could — attesting `main.js` was therefore
never a flag that could be added to `release.ps1`. Either publication moved into CI or the
assets stayed unattestable. The Obsidian directory's automated review had asked for this on
every release since 1.5.2.

**What stayed local is the invariant suite, and that was the real decision.** It drives a
real Chrome against two vaults, one of which is a structural mirror of a private vault that
cannot exist on a runner, and the other a 10,000-note synthetic that takes minutes. So the
gate is still `release.ps1` — it will not tag a red suite — and `.githooks/pre-push` runs
it again on the push of `main` that carries the tagged commit. **CI trusts the tag** for
that, and runs the three checks that are static, need no vault and no browser, and are
about what the release *ships* rather than about the layout: `check-scope.mjs`,
`check-network.mjs`, `check-pii.mjs`. The alternative — a reduced suite against the
synthetic vault only — buys a weaker version of a gate that already ran, and costs several
minutes of every release.

`check-pii.mjs` runs in CI **without its deny list**, and says so loudly on every run: the
list of real names lives in a gitignored `.pii-names`, deliberately outside this
repository. Its identifier patterns (work email, Jira keys, an Atlassian host, a Windows
user path, a vault absolute path) do run, and those are what has actually leaked before.
Setting a `PII_NAMES` repository secret would restore the name half; that means putting
those names into repository settings, and that call has not been made.

## What `release.ps1` still does

**The version is bare semver, with no `v`.** Obsidian installs a plugin by matching the
release tag against `manifest.json`'s `version`, which cannot carry a prefix — so a
`v`-tagged release is one nobody can install. The script rejects a `v` with that reason,
and rejects a version the manifest does not already claim. (Its own check said `^v...`
until 1.5.3, which is why 1.5.0–1.5.2 were cut by hand.)

It refuses to release a dirty tree (a release must be reproducible from its tag), refuses a
version the manifest does not claim, refuses a version with no `## <version>` section in
`CHANGELOG.md` (a version whose changes nobody wrote down), refuses to tag anywhere but
`main` (github#47), builds the plugin as a pre-flight, runs the invariant suite, then tags,
pushes `main`, pushes the tag and stops. `-DryRun` stops after the suite. The tag message
is the same `CHANGELOG.md` section the workflow uses for the release body, so `git show
<tag>` and the Release page still agree.

**The pre-flight build is there for the one failure mode the split introduces.** Nothing
local consumes `main.js` at release time — the workflow builds its own copy from the tagged
commit, which is the copy it attests — but a build that fails *in CI* leaves a tag with no
release, and a published tag cannot be re-cut. Ten seconds locally buys that.

**`-Notes` and `-Title` are gone.** The body is drafted by the workflow from the CHANGELOG
section and rewritten by hand afterwards, so a one-liner passed at tag time had nowhere to
land. The title now comes out of the CHANGELOG heading — `## 1.9.0 — "Belonging" —
2026-09-02` gives `1.9.0 - Belonging` — so the title and the section it sits above cannot
disagree, which a hand-typed argument allowed. A heading with no quoted name (1.7.0) falls
back to the bare version.

## The attestation, and what it is worth

Every asset is attested: `main.js`, `manifest.json`, `styles.css` **and the zip**. The zip
was an open question when this was filed — it is the thing that makes a tag runnable, and
an unattested asset sitting next to three attested ones is exactly the one a forger would
replace. Anyone can check one:

```bash
gh attestation verify main.js --repo luke321/vault-graph
```

**An attestation is not a reproducibility claim** — it binds *these bytes* to this
repository, this commit and this workflow run. The zip's bytes are not reproducible at all
(it carries file mtimes from the checkout) and that is fine. But the claim reads better if
the build is stable, so it was measured rather than assumed:

**Measured 2026-09-02.** Two consecutive builds of `build-plugin.mjs` in the same directory
are byte-identical. They were **not** identical across two different checkouts, and the
whole difference was two comment lines: esbuild prints a `// <namespace>:<path>` header
above each namespaced module, and the `raw:`/`b64:` loader resolved to an absolute path — so
the published 1.9.0 `main.js` carries the maintainer's own directory layout twice, for no
reason. The loader now resolves repo-relative and posix-separated, which makes the bundle
path- and platform-independent: a bundle built on the runner can be diffed byte-for-byte
against one built on Windows from the same tag. The change is inert otherwise — the two
builds were identical apart from those two lines.

## What the workflow needs, and what it does not

It needs no secrets. `GITHUB_TOKEN` with `contents: write`, `id-token: write` and
`attestations: write` — all three declared in the file — is the whole grant, and
attestations for a public repository work on that alone. It pins Node to the major the
releases so far were cut on (v24), installs with `npm ci` so the lockfile decides the
bundle, and pins its three actions to major tags rather than commit SHAs: all three are
GitHub's own, the token is scoped to one job, and a SHA nobody bumps silently freezes the
Sigstore client.

It needs no change to `main`'s ruleset either: it never pushes to `main`, it only reads
`origin/main` to check the tag is in its history. **Two repository settings can still stop
it, and neither is visible from the file**: if the default workflow permissions for this
repository are restrictive, confirm the run actually receives `contents: write` (the
`permissions:` block asks for it, and a workflow may ask for more than the default — but
this has not been observed on this repository yet); and if a *tag* protection rule is ever
added, pushing `1.x.y` from a laptop is what would start failing, not the workflow.

**It publishes immediately rather than creating a draft**, which is what `release.ps1` did,
so nothing about the visible behaviour of a release changed. The trade is that the
changelog-dump first draft is public until it is rewritten. If that turns out to be the
wrong way round, `--draft` on the create and a `gh release edit --draft=false` at the end
of the human's flow is the whole change — and the `develop`-pinned asset URLs below exist
partly so a draft *can* be previewed.

**A re-run is a way forward, not a dead end.** If the release already exists the workflow
re-uploads the assets over it with `--clobber` and leaves the notes alone, because by then
a person may have rewritten them. That matters because a published tag cannot be re-cut, so
re-running is the remedy for anything that fails after the tag lands — including the
main-ancestry guard, which can lose a race if the tag reaches GitHub before the branch does
(`release.ps1` pushes the branch first for exactly that reason).

**And there is a `workflow_dispatch` with a `tag` input, for one specific trap.** A
workflow triggered by a tag push runs *the version of that file which is at the tag*. So a
bug in `release.yml` that only shows up on a real release cannot be fixed by re-running
(same broken file), nor by fixing `main` (the tag does not move), and the tag cannot be
re-cut once published — the only way out would be publishing four assets by hand, which is
unattested and is the thing this all exists to prevent. Dispatching from a branch runs
*that branch's* file against a tag you name, which turns that into fix-and-re-run:

```bash
gh workflow run release.yml --ref main -f tag=1.9.1
```

Worth knowing because **the workflow cannot be exercised without cutting a real tag, so the
first genuine release is its first full test.** Everything that could be checked short of
that was: the YAML parses, every `run` block passes `bash -n`, and the guard, notes-draft
and summary steps were executed against this repository with `VERSION=1.9.0` (they accept
`1.9.0`, reject `v1.9.0`, `1.9` and `1.9.1`, and derive the title `1.9.0 - Belonging` from
the CHANGELOG heading). The attestation step, the `gh release` calls and `make-package.mjs`'s
Linux `zip`/`unzip` path are the parts only a real run can prove.

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

Write and review this by hand (or have it drafted and then reviewed) as soon as the
workflow goes green — `gh release edit <version> --notes-file <file>` replaces the body in
place, same command whether the notes came from the workflow's first draft or were
rewritten once already. **It is the first thing to do after a release, not the last**: the
workflow publishes immediately rather than as a draft, so the changelog dump is what the
page says until this is done.

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
5. **Tag, annotated**, with the release summary as the message, on `main`.
6. **Push `main`, then the tag.** That order, so the workflow's main-ancestry guard cannot
   lose the race. Everything below is what the workflow then does for you.
7. **Build the plugin** — `node scripts/build-plugin.mjs` writes `main.js` and
   `styles.css`. Obsidian downloads exactly those two plus `manifest.json` from the release
   and never opens the zip; 1.6.0 shipped with only the zip and the directory's scan came
   back with two errors.
8. **Build the package** — `node scripts/make-package.mjs` writes
   `dist/vault-graph-<version>.zip` containing only what is needed to run: `src/`,
   `vendor/`, `scripts/`, `assets/`, `README.md`, `LICENSE`, `CHANGELOG.md`.
9. **Create the release** and attach all four:
   `gh release create <version> main.js manifest.json styles.css dist/vault-graph-<version>.zip --notes-file <notes>`

**Steps 7–9 by hand produce an unattested release**, and there is no way around that from a
laptop — see the top of this file. So they are the *second* fallback for a broken workflow:
try `gh workflow run release.yml --ref main -f tag=<version>` first, which runs a fixed
`release.yml` against the tag that already exists and still attests. Hand-publishing is the
last resort, and what it produces is the thing github#10 was filed about.

## What the package must NOT contain

- **Any built `vault-graph.html`.** It embeds the note titles and folder structure of
  whichever vault produced it. Publishing one publishes that.
- `test-vault/` — generated, and large.
- `.ai-context/` — it belongs to the repo, not to a user of the tool.
