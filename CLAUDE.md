# Vault Graph — read this first

An Obsidian plugin (and a standalone exporter used for testing) that draws a vault as one
disc: notes packed into folder wedges on a fixed lattice, animated by a cascade. The repo
is **public**. The recurring failure mode here is reasoning about the code instead of
measuring it: serve the page, drive it, read the numbers.

**Because the repo is public, this file carries only what is true for anyone who clones it.**
Absolute paths, session identity and naming, the session manager's commands, which physical
display a harness seizes, and anything about the maintainer's own setup live in an untracked
`CLAUDE.local.md` next to this one. If you are working on the machine that has one, it is
imported below; if you are a contributor, its absence is normal and nothing here depends on it.

@CLAUDE.local.md

## Laws — every one has a check in `scripts/smoke.mjs` and a section in `.ai-context/invariants.md`

- **The serpentine survives.** Nothing between a note's link weight and its position may step.
- **The rings are independent**, and their thickness is locked; a filter re-packs inside them.
- **The hub is a fraction of the disc, never a radius.** A row-0 dot may not eat into it.
- **The resting disc is on the lattice**, and a settled dot is the size a fresh relayout gives it.
- **`settle()` is a no-op**: the cascade converges before it lands; a jump at the end is a bug.
- **A zero-weight member costs nothing**: a fading note changes no plan, no row, no room.
- **A dot never outgrows its two resting sizes** while a cascade walks; a fade never reverses. With
  **Size dots from the frame** on (a view setting, on by default; `?nofit` turns it off on the page) a
  walking dot may also be held *below* them by its clearance on the frame being drawn, never above.
- **Only depth-1 subfolders with their own tint slot are pushed**; a sub-wedge earns a slot only if it can fill one.
- **The page is scoped**: every CSS rule under `.vault-graph`, every id through `$()`; nothing shipped reaches the network.
- **The layout matches its golden snapshot** on all three fixtures — never regenerate a golden to make a check pass.

## How to work here

- `node scripts/smoke.mjs --only "<substring>"` is the iteration loop. The full suite runs on
  the push to `develop` whose tree it has not measured yet (the pre-push hook; see
  `scripts/suite-stamp.mjs`); do not run it by hand unless asked.
- **Two things may not run twice at once, and `scripts/lock.mjs` is how you know.** Several
  agents work this repo in parallel worktrees, and they collide over two different resources.

  **A screen.** `record-demo.ps1` captures with `gdigrab -i desktop` — it copies a *region of the
  display*, so anything else drawn there lands in the take and ruins it silently: the file exists
  and looks plausible. A recording is not the only claimant — `smoke.mjs` parks every Chrome
  window it opens on one fixed display, and `spike-check.mjs` puts Obsidian there — so the
  lock is named after the **screen**, not the job: `screen-left`, `screen-right`,
  `screen-primary`. **Every harness that places a window takes its own screen lock and releases
  it on every way out** — `smoke.mjs`, `spike-check.mjs`, `record-demo.ps1` — so you do not have
  to remember, and so the claim names the physical display rather than the activity (github#87).

  **The shared fixture store.** Two full-suite runs do *not* fight over ports — ports are
  allocated free and each run gets its own Chrome profile. They fight over `.fixtures/`: a run that
  regenerates deletes every `<name>-*` directory there, including the one a concurrent run is
  reading. That is the `suite` lock, and **it is only about `.fixtures/`** — the display is a
  separate claim under its own name. It bites only when a fixture is stale, which is why it is
  rare and reads as a regression in your branch.

  Keeping them separate is what lets `pre-push` hold `suite` while the `smoke.mjs` it spawns
  holds `screen-left`: two names, two resources, no nesting. Aliasing the two instead — which
  this repo tried first — deadlocks that exact pair, because `aliasHold` blocks on whoever holds
  the alias, the asker included. A sister plugin hit the same deadlock and reached the same design
  independently.

  ```powershell
  node scripts/lock.mjs acquire screen-right --owner "#77 palette"   # blocks; exit 1 = give up
  node scripts/lock.mjs release screen-right --owner "#77 palette"   # always, even on failure
  node scripts/lock.mjs status                                       # who holds what
  ```

  You need those two by hand only for something that seizes a display and is **not** one of the
  three harnesses — a manual Chrome you are driving yourself, say. Never wrap one of the three:
  `smoke.mjs` takes `screen-left` itself, so an outer hold makes its own acquire wait out your
  stale window. `--no-lock` exists for the one caller that legitimately already holds it.

  The lock lives in the OS temp dir, not the worktree, so **every worktree shares one** — and the
  root (`obsidian-vault-locks`) is shared with a sister Obsidian plugin, so if you work on both,
  their jobs contend with each other, not just their own (github#92). A `mkdir` is the lock — atomic, and it survives a
  killed session as a stale entry (20 min) rather than a permanent one. **`make-hero.ps1` needs no
  lock**: it is an ffmpeg file-to-file transcode, not a capture. Screenshots need none either:
  `shoot.mjs` captures over CDP, so overlapping windows are harmless — but pass your own `--port`.

  **`.githooks/pre-push` takes the `suite` lock itself, around its own run, and releases it on
  every way out (github#92).** Do not also wrap a `git push` in an outer acquire/release, of
  **either** name: the hook takes `suite` and the `smoke.mjs` it spawns takes `screen-left`, so
  an outer hold of either one blocks the hook's own attempt and the push hangs until your stale
  window expires. A plain `git push origin develop`/`main` is correctly gated on its own, and so
  is a `smoke.mjs` run you drive directly — neither needs wrapping any more. A plain `git push origin develop`/`main` is correctly gated on its own; the wrapping
  above is only for a `smoke.mjs` run *you* are driving directly, never for a push.
- **Never serve Chrome unlabeled.** Any vault-graph page opened in Chrome from this worktree
  — `smoke.mjs`, `shoot.mjs`, a manual review build — sets the page's own top-left title to
  `<worktree/feature> — <what it's showing>`, e.g. `tag-grouping — demo vault`, instead of the
  default. Patch `window.VAULT_DATA`'s `vault` field in the built HTML, never the product: the
  title is a review aid, and several builds from different branches and vaults sit in tabs at
  once, so an unlabeled one is judged against the wrong build.
- **A vault Obsidian has not been told to trust opens in restricted mode, and the plugin does not
  load at all.** Any fixture or generated vault is "untrusted" on its first open: Obsidian puts up **"Trust
  author and enable plugins?"** and opens its Settings window behind it. Until that is confirmed
  *and* Settings is closed, `app.plugins.getPlugin("vault-graph")` is null, the ribbon icon and the
  `vault-graph:open` command do nothing, and **a perfectly good plugin reads as broken** -- the
  trap is that it looks like a code fault, so it gets diagnosed as one.

  **Driving over CDP, do not click the dialog -- enable it programmatically**, which is what the
  harnesses already do (`obsidian-smoke.mjs`, `spike-check.mjs`) and what any new one should copy:

  ```javascript
  if (!app.plugins.getPlugin(id)) {
    await app.plugins.setEnable(true);          // leave restricted mode
    await app.plugins.enablePluginAndSave(id);  // then enable ours
  }
  ```

  Judge nothing about the plugin's behaviour until `getPlugin(id)` is truthy. By hand: confirm the
  prompt, close Settings, then look.

- `git push` and merging into `develop` are separate asks, every time. `main` only ever
  receives `develop`.
- **Which session you are is decided by the checkout you are in, not by what you were asked to
  do.** The primary checkout — the one `git worktree list` names first — is the **orchestrator**:
  one session, the only one that pushes to `develop`, merges branches down, or cuts a release.
  Every other checkout, i.e. any tree whose `git rev-parse --show-toplevel` is not that path, is a
  **dispatched worker**, whatever its branch says. Settle this before the first write:
  `git rev-parse --show-toplevel` and `git worktree list` answer it in one call. Which paths those
  are on this machine, and what the orchestrator session calls itself, are in `CLAUDE.local.md`.
- **Only the orchestrator session pushes to `develop` or cuts a release.** A dispatched ticket
  worktree implements, runs its own gates, and stops at its own branch — it never pushes past
  that branch, never merges into `develop`, and never runs `release.ps1`, no matter how clean the
  result. Integrating finished branches and shipping them is the orchestrator's job alone, so one
  place is answerable for what's actually on `develop` and what a release contains.
- **The orchestrator dispatches a ticket; it never implements one.** Work that comes up gets its
  own worktree with its own chatable session, one ticket per checkout, so a ticket's branch, plan,
  review and gates all belong to one place instead of being tangled into whatever the coordinating
  session was doing. The session manager used here, the exact spawn command, and the ceiling on how
  many may run at once are in `CLAUDE.local.md` — the ceiling is real: fanning out past it starved
  CPU and disk enough to force a hard restart once.
- **Every issue filed here carries a label, and "unsure" is a question for the maintainer, not
  a reason to skip it.** `gh issue create` without `--label` silently succeeds, so an unlabelled
  issue is never caught at filing time — and unlabelled is what half this backlog was until it was
  backfilled on 2026-09-11, which is how a label stops being worth filtering on at all. The set is
  the GitHub default: `bug`, `enhancement`,
  `documentation`, `accessibility`, `question`, plus `duplicate` / `invalid` / `wontfix` for
  closing. Most work here is `bug` or `enhancement`, and the split is about what the issue
  *claims*: something the page already promises and does not do is a `bug`; something it does not
  promise yet is an `enhancement`. **When it is genuinely either — a behaviour that is defensible
  as designed but reads as broken — ask the maintainer which, and file after the answer.** Do not
  guess and do not file bare.
- **A release is the range, not the work in hand.** Everything it needs — a `CHANGELOG.md`
  section accounting for *every* merge since the last tag, every clip it embeds, every doc naming
  the version, the release body itself — is finished on `release/<version>` and read there before
  anything merges down. **Once the tag exists nothing changes**: a fix is the next patch version,
  because editing after the fact leaves the tag disagreeing with the published page. 2.1.0 was
  cut twice for skipping this; `.ai-context/releasing.md` opens with the commands that enumerate
  a range. **"Review the release body" means a human reviews it** — publish the drafted body as a
  Claude Artifact and get an explicit go-ahead before `release.ps1` or `gh release edit` touches
  anything live; self-review by the session that wrote the draft is not this step, however
  careful, and skipping straight to publishing is what happened cutting 2.5.0 (`.ai-context/
  releasing.md`, and the `cut-release` skill).
- Measure before and after; the numbers go into `.ai-context/changelog-detail.md`, which is
  the regression suite. A changed constant means `invariants.md` changes in the same commit.
- **Obsidian does not load the plugin in a vault it has not been told to trust.** Open any vault
  that is not the daily one -- a fixture vault, a generated test vault, anything under a temp dir
  -- and Obsidian asks *Trust author and enable plugins?* the first time, behind a Settings window.
  Until that is confirmed the plugin does not load **at all**, so skipping it leaves you staring at
  a plugin that looks broken for a reason that is nowhere in the code. Confirm the prompt, close
  Settings, then judge what the plugin is doing. `scripts/obsidian-smoke.mjs` handles this itself
  -- it writes `community-plugins.json` and calls `enablePluginAndSave` -- a hand-launched Obsidian
  does not.
- **Never serve Chrome unlabeled.** A page opened in Chrome from any worktree — a `smoke.mjs`
  run, a `shoot.mjs` capture, a manual review build — sets the page's own top-left title to
  `<worktree/feature> — <what it's showing>` (e.g. `tag-grouping — demo vault`), not the
  default. Patch the built HTML's `vault` field in `window.VAULT_DATA` rather than the product
  itself; the title is a review aid, not a feature. Several worktrees end up with visually
  similar tabs open in Chrome at once — without a label there is no way to tell which build is
  which, and judging a change against the wrong one is worse than not looking.
- Fixtures: three generated vaults (`scripts/make-*-vault.mjs`) in the shared store; never a
  real vault, never a built `vault-graph.html`, in anything that reaches the repo.
- `npm run lint` holds every finding at zero. `check-pii`, `check-scope`, `check-network` and
  the two determinism checks gate every push and have no skip flag.
- Commit messages are sentences; `Closes #n` on its own line closes the issue when the work
  reaches `develop` — a workflow does it, since GitHub itself only resolves it on `main`.

## Where things are

| | |
|---|---|
| `src/page.js` | the page: plan, layout, cascade, render, UI — one `mountVaultGraph()`, ~300 inner functions. **Do not read it top to bottom**; open `.ai-context/code-map.md` and go to the line range |
| `src/engine/` | the graph store and WebGL renderer (TypeScript) |
| `src/build-graph.mjs` | the exporter: vault → data → one HTML file |
| `plugin/main.js` | the Obsidian plugin: metadata cache → data → mounts the page in a view |
| `scripts/smoke.mjs` | the invariant suite (Chrome over CDP); `scripts/*-check.mjs` are the manual harnesses |
| `.ai-context/code-map.md` | **generated**: sections and functions of the two big files, with line numbers |
| `.ai-context/code-index.md` | **generated**: issue → code sites, ADR/DDR → code sites, invariant → check, `__vg.*` → callers |
| `.ai-context/README.md` | the map of the design records: `decisions/` (ADRs, why not the other thing), `design/` (DDRs, how a part works), `animation.md`, `invariants.md`, `changelog-detail.md` |
| `CONTRIBUTING.md` | the gates and the branch policy |

Both generated files come from `node scripts/code-map.mjs`; `--check` fails when they are
stale, and the pre-push hook runs it. Comments in the code are pointers (`github#N`,
`decisions/NNNN`, `design/NNNN`); the reasoning behind them is in `.ai-context/`, reached
through the index.
