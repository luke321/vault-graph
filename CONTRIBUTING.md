# Contributing

**Open an issue.** That is the way in for now, and it is a real invitation rather than a
polite deflection — bug reports, vaults that render badly, and "this number looks wrong to
me" are all useful, and the last one has already found three defects.

Pull requests are not being taken yet. The project is one person's, the layout is held
together by constants that were each measured against a real vault, and reviewing a change
to those properly takes longer than making it. That will change; until it does, an issue
with enough detail to reproduce is worth more than a patch.

## What makes a good issue here

**For anything about the layout, say what your vault looks like.** The disc is a function of
vault shape, and shape is most of the answer: how many notes, how many top-level folders,
whether one folder holds most of it, whether folders nest deeply. You do not need to name
anything — counts and depths are enough.

**For anything visual, a screenshot.** Sixteen of the seventeen automated checks assert
numbers; none of them can see that something looks wrong. Every visual defect in this
project so far was found by a person looking at it, including a centre mark that vanished
while every check stayed green.

**For anything that says "wrong number", say which number and what you expected.** The
footer and the tooltips print what the page thinks; the console has more
(`__vg.checkPlanParity()`, `__vg.heatReport()`, `__vg.pushReport()`). Pasting one of those
turns a report into a diagnosis.

**Never paste a built `vault-graph.html`, and be careful with screenshots of your own
vault.** The file contains every note title, path and tag in plain text. If you want to show
a problem without showing your notes, generate a mirror — same shape, none of the content:

```bash
node scripts/make-mirror-vault.mjs --vault "/path/to/your/vault" --out ./mirror-vault
node src/build-graph.mjs --vault ./mirror-vault --out ./mirror.html
```

Attach that, or a screenshot of it. The shape is what a layout report needs and the mirror
keeps the shape exactly: folder tree, per-folder counts, dates, word counts and the whole link
graph, under invented names.

For anything that is not about your particular vault, `node scripts/make-demo-vault.mjs`
builds the project's own fixed demo vault and needs no vault of yours at all.

## If you do want to work on it

Read [`.ai-context/`](.ai-context/) first, and the record for the part you are touching.
Several constants look arbitrary and are not: the twelve colour slots, the three named tint
slots, the six-degree minimum wedge, the fifty-two-week heatmap window. Each has a
measurement behind it, and the recurring failure mode in this repo is reasoning about the
code instead of measuring it.

Four commands, and all four are gates rather than suggestions:

```bash
npm run lint                    # tsc --noEmit on the engine, then typescript-eslint on our own code; every finding is held at zero
node scripts/smoke.mjs          # the invariant suite, over three vault shapes
node scripts/check-scope.mjs    # the page cannot style, or be styled by, its host
node scripts/check-network.mjs  # nothing shipped can make a network request
node scripts/check-notice.mjs   # the Sigma notice opens a fresh main.js and a fresh exported page
node scripts/check-comments.mjs # comments are pointers; the count of prose lines only goes down
node scripts/check-data-escape.mjs # a note's frontmatter cannot close the exported data script
```

Three more are manual, because each launches a real browser or a real Obsidian and takes a
minute or two. Run the first if you touch the view's lifecycle — `onOpen`, `currentView`,
`activate`, or anything that reaches for `leaf.view`; run the second if you touch what
Refresh does, or how the plugin builds its data:

```bash
node scripts/deferred-check.mjs --vault ./demo-vault
```

```bash
node scripts/refresh-check.mjs --vault ./demo-vault
```

The second one writes a probe note into the vault you point it at and deletes it again, so
point it at a generated vault. It is the only harness that covers the whole round trip —
write a file, Obsidian notices, rebuild, remount, the note is on the disc — which is what
`Refresh doesn't seem to pick up new files` turned out to be about.

Run the third if you register anything outside the page's own root — a listener on the
document or the window, a `ResizeObserver`, a timer or animation frame that calls back into
the mount — or touch the handle's `destroy()`:

```bash
node scripts/teardown-check.mjs --vault ./demo-vault
```

It runs the plugin's own teardown sequence six times on the standalone build (destroy, replace
the root, mount again) and reads heap, DOM nodes and listener counts after every cycle. Before
`destroy()` existed each cycle retained a whole mount — +579 DOM nodes, +131 listeners, +7 MB on
the 10k fixture — through two document listeners nothing removed. `--quick` tears down
mid-intro, which is the case where a dead mount used to keep animating.

One more if you touch the renderer (`src/engine/`): the suite asserts numbers, and none of
them can see a disc in the wrong colour. `node scripts/render-diff.mjs --against-dir <dir>`
compares the current build of every fixture, pixel by pixel and node by node, against
reference builds of the same vaults made from the commit you are holding the picture to —
at rest by default, and with `--state all` also in a search, after a hidden folder, a solo
and a date range, with a note hovered and clicked, and at the landing frame of a cascade;
`--theme light`, `--dpr 2` and `--window WxH` change the viewing conditions, `--now-dir`
compares two prebuilt trees. The bar and how to make the references are in
`.ai-context/invariants.md` ("The engine draws Sigma's picture").

And one that needs Obsidian itself, for the things the exporter cannot stand in for — the
metadata cache, the view lifecycle, popout windows, the settings tab, the theme switch:

```bash
node scripts/build-plugin.mjs
node scripts/obsidian-smoke.mjs                  # the demo fixture; --fixture shape | 10k
node scripts/obsidian-smoke.mjs --only "reopen"  # one check by substring, like smoke.mjs
```

It copies a store fixture into a throwaway vault under `%TEMP%`, installs the three built
plugin files into it exactly as a release installs them, launches a **separate** Obsidian
with its own user-data directory and a remote-debugging port (the Obsidian you have open is
not touched and not reused), drives it over CDP, and prints the number behind every check:
how long the cache, the build, the mount and the intro took; whether the layout matches the
exporter's build of the same vault; hover, click, right-click and double-click; six
close-and-reopen cycles with heap, DOM and listener counts (github#62); the Refresh button; a
theme switch; the settings tab (github#59); a popout window. It is opt-in and not in the
pre-push hook: it needs Obsidian installed and takes minutes. The numbers it measured on the
release day are in `.ai-context/invariants.md` ("The plugin behaves inside a real Obsidian").

Since Obsidian 1.7.2 a tab restored in the background is **deferred**: the leaf is real and
`getLeavesOfType` finds it, but `leaf.view` is a placeholder until something reveals it. Both
other harnesses open the graph in the foreground, which is the one state where that never
happens — so this one quits and relaunches to get the leaf into the state a person's first
restart of the day puts it in.

`git config core.hooksPath .githooks` once per clone runs those on every push to `develop` or
`main`, along with a check that refuses to publish other people's names, two that keep the
generated fixtures deterministic, one that keeps the generated navigation files
(`.ai-context/code-map.md`, `.ai-context/code-index.md`, from `node scripts/code-map.mjs`)
in step with the source, one that reads the Sigma copyright line back out of both freshly
built artifacts, and one that counts the comment lines that are not pointers and refuses a
push that raises the count. Only the invariant suite has a skip flag, on purpose:
everything else is a static read costing seconds at most, and what most of it prevents is
damage to somebody else's software, or to somebody else. The lint gate fails closed on a
clone that has not run `npm ci` — run it, then push.

**A tree is gated once.** A green full run of `smoke.mjs` stamps the git *tree* it measured
and the fixtures it ran against (`scripts/suite-stamp.mjs`, in the shared git common dir).
The hook and `release.ps1` skip the suite when every commit being pushed carries such a
stamp, and say which run they trust. A merge that changed the tree, or a fixture regenerated
since, runs it as before. `node scripts/suite-stamp.mjs check [<rev>]` says what a push would
do; `release.ps1 -ForceSuite` runs it anyway. `.ai-context/decisions/0013` has the reasoning.

## Branches, and how work reaches main

**`develop` is where work lands. `main` only ever receives `develop`.**

```
your branch  ->  develop  ->  main
```

`main` is what the Obsidian directory installs from and what a release is tagged on, so
nothing should reach it that has not already been through `develop`, where the invariant
suite runs on every push whose tree it has not measured yet. The rule is enforced twice, because there are two ways to move a
commit and neither mechanism can see the other:

| | |
|---|---|
| `.github/workflows/branch-policy.yml` | a pull request into `main` fails unless its head is `develop` in this repository — GitHub has no branch-protection setting for "the PR must come from X", so it is a required check |
| `.githooks/pre-push` | a `git push` to `main` is refused unless `develop` is already an ancestor of it — a merge of `develop` passes, a commit made straight on `main` does not |
| `.github/workflows/release.yml` | a release tag whose commit is not in `origin/main`'s history is refused before anything is built, signed or published — the same rule again, at the one moment it still matters, since a published tag cannot be moved |

`main` also carries a ruleset: pull request required, that check required, no force pushes,
no deletion.

## Comments are pointers

A comment in `plugin/`, `src/` or `scripts/` carries a reference and nothing else: a bare
`github#N`, `decisions/NNNN` or `design/NNNN`. The reasoning, the measurements and the
rejected alternatives live in `.ai-context/` — `changelog-detail.md` for what was measured,
the ADRs for why not the other thing, `invariants.md` for what a check asserts — and
`.ai-context/code-index.md` (generated) says which code cites which record. What stays in
the code besides pointers: JSDoc blocks carrying a tag (the type-aware lint reads them),
section banners (the code map reads them), the build's `BEGIN`/`END` strip markers, and
PowerShell `<# .SYNOPSIS #>` help blocks (Get-Help reads them). github#61 set this rule and
applied it: 15,399 → 8,173 lines in `src/page.js` alone.

`node scripts/check-comments.mjs` enforces it in the pre-push hook. It counts every comment
line in those three directories that is neither a bare pointer (`github#N`, `decisions/NNNN`,
`design/NNNN`, alone or with a short label) nor a JSDoc type annotation (`/**`, `* @param`,
`* @returns`, `* @typedef`, `* @property`, `* @type`, `*/`), nor a `/*!` licence banner, a
shebang, a lint directive or a section banner, prints the count per file, and holds the total
at exactly `BASELINE` — over fails, and under fails until the baseline is lowered to the new
count in the same commit, so the number can only go down. `--list` prints every counted line.

## Commit messages

Reference the issue with a **closing keyword** — `Closes #7` on its own line in the body:

```
Fix the suite's flake, which was two bugs and neither was the settle

...what changed and what was measured...

Closes #7
```

The issue closes when that commit reaches **`develop`**. GitHub itself resolves a closing
keyword only on the default branch, `main`, and has no per-branch switch; at one or two
releases a day that left issues open for hours after their fix had landed and been gated. So
`.github/workflows/close-issues.yml` runs on every push to `develop`, scans the pushed commits
for the keyword forms GitHub recognises (`close`, `fix`, `resolve` and their `-s`/`-d`
spellings, any case, followed by `#n`, `owner/repo#n` or the issue's URL — anywhere in the
message except inside a backtick code span, so a commit *about* the convention closes
nothing), and closes each issue it names with a comment giving the commit and saying the fix
is not yet released. The release merge into `main` then meets GitHub's own resolution on an
issue already closed. A closed issue therefore means *landed on `develop`*; whether it has
shipped is what the CHANGELOG is for. A bare `#7` links without closing, and is right for a
commit that only touches an issue in passing.

If a merge into `develop` needs to close issues its commits did not name, put the keywords in
the merge commit message; the workflow reads that commit too. The scanning is
`scripts/close-issues.mjs`, which can be rehearsed on any range without writing anything:

```bash
node scripts/close-issues.mjs --range <before>..<after> --dry-run
```

A push whose starting commit the workflow cannot see — `develop` force-pushed, or created from
nothing — fails the run and closes nothing, rather than guessing at the range.

For a visual change, take before-and-after screenshots of the same vault and compare them:

```bash
node scripts/shoot.mjs --vault ./demo-vault --out ./shots-after
```

It waits for the disc to settle before each shot, because sampling a moving disc makes two
runs of identical code differ by a sub-pixel offset across every dot — which reads exactly
like a rendering regression.

## Code of conduct

Be decent. Nothing here is important enough to be unpleasant about.
