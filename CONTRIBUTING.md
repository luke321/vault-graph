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
node scripts/make-demo-vault.mjs --vault "/path/to/your/vault" --out ./demo-vault
node src/build-graph.mjs --vault ./demo-vault --out ./demo.html
```

Every screenshot and the demo clip in the README were made that way.

## If you do want to work on it

Read [`.ai-context/`](.ai-context/) first, and the record for the part you are touching.
Several constants look arbitrary and are not: the ten colour slots, the three named tint
slots, the six-degree minimum wedge, the fifty-two-week heatmap window. Each has a
measurement behind it, and the recurring failure mode in this repo is reasoning about the
code instead of measuring it.

Two commands, and both are gates rather than suggestions:

```bash
node scripts/smoke.mjs        # 17 invariants, over two vault shapes
node scripts/check-scope.mjs  # the page cannot style, or be styled by, its host
```

One more is manual, because it launches a real Obsidian twice and takes about ninety seconds.
Run it if you touch the view's lifecycle — `onOpen`, `currentView`, `activate`, or anything
that reaches for `leaf.view`:

```bash
node scripts/deferred-check.mjs --vault ./demo-vault
```

Since Obsidian 1.7.2 a tab restored in the background is **deferred**: the leaf is real and
`getLeavesOfType` finds it, but `leaf.view` is a placeholder until something reveals it. Both
other harnesses open the graph in the foreground, which is the one state where that never
happens — so this one quits and relaunches to get the leaf into the state a person's first
restart of the day puts it in.

`git config core.hooksPath .githooks` once per clone runs those on every push, along with a
check that refuses to publish other people's names. Two of the three have no skip flag, on
purpose: what they prevent is damage to somebody else's software, or to somebody else.

For a visual change, take before-and-after screenshots of the same vault and compare them:

```bash
node scripts/shoot.mjs --vault ./demo-vault --out ./shots-after
```

It waits for the disc to settle before each shot, because sampling a moving disc makes two
runs of identical code differ by a sub-pixel offset across every dot — which reads exactly
like a rendering regression.

## Code of conduct

Be decent. Nothing here is important enough to be unpleasant about.
