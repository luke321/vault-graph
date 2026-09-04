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
npm run lint                   # tsc --noEmit on the engine, then typescript-eslint on our own code; every finding is held at zero
node scripts/smoke.mjs         # 17 invariants, over two vault shapes
node scripts/check-scope.mjs   # the page cannot style, or be styled by, its host
node scripts/check-network.mjs # nothing shipped can make a network request
```

Two more are manual, because they launch a real Obsidian and take a minute or two each.
Run the first if you touch the view's lifecycle — `onOpen`, `currentView`, `activate`, or
anything that reaches for `leaf.view`; run the second if you touch what Refresh does, or
how the plugin builds its data:

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

Since Obsidian 1.7.2 a tab restored in the background is **deferred**: the leaf is real and
`getLeavesOfType` finds it, but `leaf.view` is a placeholder until something reveals it. Both
other harnesses open the graph in the foreground, which is the one state where that never
happens — so this one quits and relaunches to get the leaf into the state a person's first
restart of the day puts it in.

`git config core.hooksPath .githooks` once per clone runs those on every push to `develop` or
`main`, along with a check that refuses to publish other people's names and two that keep the
generated fixtures deterministic. Only the invariant suite has a skip flag, on purpose:
everything else is a static read costing seconds at most, and what most of it prevents is
damage to somebody else's software, or to somebody else. The lint gate fails closed on a
clone that has not run `npm ci` — run it, then push.

## Branches, and how work reaches main

**`develop` is where work lands. `main` only ever receives `develop`.**

```
your branch  ->  develop  ->  main
```

`main` is what the Obsidian directory installs from and what a release is tagged on, so
nothing should reach it that has not already been through `develop`, where the invariant
suite runs on every push. The rule is enforced twice, because there are two ways to move a
commit and neither mechanism can see the other:

| | |
|---|---|
| `.github/workflows/branch-policy.yml` | a pull request into `main` fails unless its head is `develop` in this repository — GitHub has no branch-protection setting for "the PR must come from X", so it is a required check |
| `.githooks/pre-push` | a `git push` to `main` is refused unless `develop` is already an ancestor of it — a merge of `develop` passes, a commit made straight on `main` does not |

`main` also carries a ruleset: pull request required, that check required, no force pushes,
no deletion.

## Commit messages

Reference the issue with a **closing keyword** — `Closes #7` on its own line in the body:

```
Fix the suite's flake, which was two bugs and neither was the settle

...what changed and what was measured...

Closes #7
```

GitHub resolves closing keywords when the commit reaches the **default branch**, which is
`main`. So an issue fixed on a branch stays open through `develop` and closes by itself
when the release merge lands — which is exactly when it is true to say it is fixed. A bare
`#7` links without closing, and is right for a commit that only touches an issue in passing.

If a merge into `main` needs to close issues its commits did not name, put the keywords in
the merge commit message; that works the same way.

For a visual change, take before-and-after screenshots of the same vault and compare them:

```bash
node scripts/shoot.mjs --vault ./demo-vault --out ./shots-after
```

It waits for the disc to settle before each shot, because sampling a moving disc makes two
runs of identical code differ by a sub-pixel offset across every dot — which reads exactly
like a rendering regression.

## Code of conduct

Be decent. Nothing here is important enough to be unpleasant about.
