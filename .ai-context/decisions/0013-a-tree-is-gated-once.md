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
hook looks up the tip of every ref being pushed to `develop` or `main` — those tips only,
never every commit in the range (github#105); `release.ps1` looks up `HEAD`. A hit skips
the suite and prints what it trusts. A miss runs it, under the `suite` lock, and stamps. A
push that only *deletes* one of those refs carries no tree at all, so there is nothing to
look up and nothing to claim: the hook says so and exits (github#105).

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
- **A fixture's own stamp is not proof the vault is usable** (2026-09-11,
  [#106](https://github.com/luke321/vault-graph/issues/106)). One was found with its note
  folders and a valid stamp but no `.obsidian` — a half-written fixture from two worktrees
  regenerating the same name at once, which the store does not exclude. `smoke.mjs` reused it
  on the stamp alone, swallowed build-graph's refusal, and the dead jobs failed only when the
  pool reached them: 0/107 at the end of an ~8-minute run. So `checkFixture()` walks every
  fixture before a browser is launched — `.obsidian` is a directory and the `.md` count
  outside dot-folders equals the `notes` the stamp records at generation (stamp format 2); 87 /
  456 / 36 ms for the three. A fixture that fails is regenerated with a line saying why, the
  same path a stale one takes; a vault that then does not build ends the run before Chrome
  starts. `currentFixtures()` runs the same walk, so a suite stamp naming a fixture that has
  since gone corrupt misses instead of skipping the suite over it. `VG_FIXTURE_STORE` points a
  run at a scratch store, on purpose, so the path can be driven against a corrupt copy without
  touching the shared one. The race itself is a separate fix.
- **A stamp names exactly the run that earned it** (2026-09-11,
  [#104](https://github.com/luke321/vault-graph/issues/104)). The adversarial review of the
  #93 range found three ways it did not, none a silent no-op like the fixture bug above, but
  together enough to make a stamp weaker evidence than the hook and `release.ps1` treat it as.
  - **The `suite` lock had no per-process component.** The hook acquired it as
    `pre-push <branch>` and `release.ps1` as `release.ps1 <version>`; `lock.mjs` treats a
    same-owner acquire as already held and exits 0, and lets that owner release. Measured: two
    acquires with the identical owner both returned `ACQUIRED` / `ALREADY HELD` and exit 0, and
    one release deleted the lock for both. So a second push from one worktree while the first
    was still driving Chrome started a second suite immediately — the exact collision the lock
    exists to prevent — and two worktrees on detached HEAD both read `pre-push HEAD`. Both call
    sites now carry their pid. `lock.mjs` itself is unchanged: with owners unique per process
    its same-owner branch only ever fires for the same process, where exit 0 is right. Making
    the primitive treat a same-owner acquire as contended was rejected — it would make the
    documented human `record` workflow wait out a 20-minute stale window after a dead session.
  - **`record()` stamped HEAD at the end of the run, not the tree that was built.** The pages
    are built when the run starts and `record()` resolved `treeOf('HEAD')` ten minutes later,
    so a commit landing in the same worktree during the run — this repo commits as work lands —
    left the tree clean, passed the dirty guard, and stamped a tree the suite never measured.
    Measured in a throwaway repo: pages built from tree `702b51e`, a commit mid-run, and
    `record()` stamped `b18a4a5` while `702b51e` went unstamped. `startRun()` now captures the
    tree and the dirty list before the first build, and `record()` refuses when the tree was
    dirty at the start, is dirty at the end, or when HEAD names a different tree by the end.
    Stamping the captured tree instead was rejected: the four fixture builds run in sequence, so
    content can move between them too, and a stamp naming a tree HEAD no longer carries is a
    second kind of lie. The cost is a re-run, and it will be paid — that is the point.
  - **Non-default runs earned the default stamp.** `partial` recognised only `--only`, `--vault`
    and `--url` (`--fast` went with github#113), so `--jobs 1`, `--chrome`, `--headed`,
    `--no-grid` or `--port` stamped the tree while measuring something else — `changelog-detail`
    (2026-09-10) records that `--jobs 1` changes the window size and flips "focus web stays
    above dim notes". `shapeDeltas()` now compares the run's **effective** shape against the
    default, so `--jobs 2` still stamps and `--jobs 1` does not, and the reason names the flag.
    Fingerprinting the flags and comparing them in `lookup()` was rejected: the hook and
    `release.ps1` always push with the default shape, so every such stamp would miss anyway.
  - **The stamp records the Chrome that drove it, and `lookup()` compares.** `-ForceSuite`'s
    own comment already named a changed Chrome as a reason not to trust a stamp, and it was the
    one part of the run's identity nothing recorded. `smoke.mjs` reads `/json/version` once from
    the first lane to attach; `lookup()` reads the version on the machine now and misses on a
    difference. Measured: `chrome.exe --version` on Windows launches the browser and prints
    nothing (8 s timeout, empty stdout), while the version directory beside `chrome.exe` reads
    in 0 ms and matched `/json/version` exactly — both `152.0.7977.83`. So `chromeVersion()`
    (`scripts/chrome.mjs`, which also now holds the `findChrome()` the suite uses) reads that
    directory on Windows and falls back to `--version` elsewhere. Unknown on either side never
    blocks, so stamps written before this change stay valid.
