# 0013 — A tree is gated once

**Date** 2026-09-11 · **Status** accepted · **Issue** [#93](https://github.com/luke321/vault-graph/issues/93)

## Context

The invariant suite drives a real Chrome against three generated vaults. Measured on
2026-09-10, one full run under the `suite` lock: **587 s** wall, of which 446 s is the serial
lane of frame-sensitive checks. Every release was paying that more than once for one tree:
the dry run on `release/<version>`, the hook on the `release/<version>` → `develop` push,
and `release.ps1`'s own run before the tag. The issue counted a fourth, the PR's status
check, which turned out to be a 4-second branch-policy job; and `releasing.md` claimed a
fifth, the hook re-running on the push of `main`, which never happened — an up-to-date push
hands a pre-push hook zero ref lines.

The premise the issue asked to have checked held exactly. `main` only ever receives
`develop`: the ruleset requires a pull request with no bypass actors, and the merge commits
for 2.3.0, 2.4.0 and 2.4.1 each have a tree byte-identical to the `develop` tip they merged.
A run on either measures the same content. What was actually happening on the night 2.4.0
was cut: both `develop` pushes went out with `SKIP_SMOKE=1`, 21 and 29 seconds after their
merge commits, because the suite "had just passed" — a true statement that nothing recorded.

## Decision

**A green full run of `smoke.mjs` stamps the git tree it measured, and the two local gates
trust the stamp.** `scripts/suite-stamp.mjs` writes one JSON file per tree under
`suite-passed/` in the shared git common dir: the tree, the commit it was taken from, the
time, the check count, and every fixture in `FIXTURE_NAMES` (name, digest, generation day,
pinned) — three when this was written, four since github#86. The
hook looks up every commit being pushed to `develop` or `main`; `release.ps1` looks up
`HEAD`. A hit skips the suite and prints what it trusts. A miss runs it, under the `suite`
lock, and stamps.

A stamp is written only by a **full** default run — no `--only`, `--vault`, `--url` or
`--fast` — of a tree with **no modified tracked files**, so it never names a measurement no
commit can reproduce. It misses when a fixture in the store no longer matches the one that
passed, or when an unpinned fixture has crossed the seven-day refresh, because the next run
would regenerate it and measure something else. `SKIP_SMOKE` stays as the manual override;
`release.ps1 -ForceSuite` re-earns a stamp on demand.

## Alternatives weighed

| Option | Why not |
|---|---|
| **Key by commit hash** | The merge into `main` is a new commit by construction while its tree is not, so the one case the issue is about would always miss. |
| **Trust a recent green run by time** | `develop` moved three times in an hour that night. A window says a suite passed recently; it cannot say which tree it saw, and two of those pushes had skipped it. |
| **Drop the run in `release.ps1` and keep the hook's** | The tag is the point of no return, and the dry run on the release branch is where a failure is cheapest. Keeping the release script's run and making it conditional keeps the safety net where it costs least. |
| **Keep `SKIP_SMOKE` as the way** | It is what was happening. It leaves no record, so a wrong skip and a right one look the same afterwards. |
| **Shrink the suite instead** | Orthogonal, and worth doing — the serial lane is 76% of a run — but it changes what a run costs, not how many runs one tree pays for. Split to [#101](https://github.com/luke321/vault-graph/issues/101), with the experiment that should decide it. |

## Consequences

- The release path pays the suite once, on the release branch's dry run. The merge into
  `develop` skips when `develop` had not moved and runs when it had, which is the right
  answer both times; the merge into `main` and the tag never pay it. `releasing.md` lays the
  path out step by step.
- Both gates now hold the `suite` lock while a real run is in progress and release it on
  every exit path, including a signal. Neither did before; four sessions contended for the
  lock in eighteen minutes on the night this was measured.
- `node scripts/suite-stamp.mjs check [<rev>]` answers "what will this push do" before it is
  made; `list` shows every tree the machine has passed. The self-test (`--selftest`) proves
  the hit and miss cases against a throwaway repository.
- The stamp is only as good as the store it was taken against. That is why the fixtures'
  identity is part of the key rather than assumed from the generator sources in the tree.
