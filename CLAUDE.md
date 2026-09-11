# Vault Graph — read this first

An Obsidian plugin (and a standalone exporter used for testing) that draws a vault as one
disc: notes packed into folder wedges on a fixed lattice, animated by a cascade. The repo
is **public**. The recurring failure mode here is reasoning about the code instead of
measuring it: serve the page, drive it, read the numbers.

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
  window it opens on the leftmost monitor, and `spike-check.mjs` puts Obsidian there — so the
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
  the alias, the asker included. Vault Shelf measured it (`vault-shelf#37`) and reached the same
  design independently.

  ```bash
  node scripts/lock.mjs acquire screen-right --owner "#77 palette"   # blocks; exit 1 = give up
  node scripts/lock.mjs release screen-right --owner "#77 palette"   # always, even on failure
  node scripts/lock.mjs status                                       # who holds what
  ```

  You need those two by hand only for something that seizes a display and is **not** one of the
  three harnesses — a manual Chrome you are driving yourself, say. Never wrap one of the three:
  `smoke.mjs` takes `screen-left` itself, so an outer hold makes its own acquire wait out your
  stale window. `--no-lock` exists for the one caller that legitimately already holds it.

  The lock lives in the OS temp dir, not the worktree, so **every worktree shares one** — and the
  root is shared with Vault Shelf (`obsidian-vault-locks`), so the two plugins' jobs contend with
  each other, not just their own (github#92). A `mkdir` is the lock — atomic, and it survives a
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
- **A vault that is not Lukas's own opens in restricted mode, and the plugin does not load at
  all.** Any fixture or generated vault is "untrusted" on its first open: Obsidian puts up **"Trust
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
  do.** The main checkout, `C:\git-personal\vault-graph` on `develop`, is the **orchestrator**:
  one session, the only one that pushes to `develop`, merges branches down, or cuts a release.
  Every other checkout — anything under `C:\git-personal\worktrees\`, i.e. any tree whose
  `git rev-parse --show-toplevel` is not that path — is a **dispatched worker**, whatever its
  branch says. Settle this before the first write: `git rev-parse --show-toplevel` and
  `git worktree list` answer it in one call.
- **Only the orchestrator session pushes to `develop` or cuts a release.** A dispatched ticket
  worktree implements, runs its own gates, and stops at its own branch — it never pushes past
  that branch, never merges into `develop`, and never runs `release.ps1`, no matter how clean the
  result. Integrating finished branches and shipping them is the orchestrator's job alone, so one
  place is answerable for what's actually on `develop` and what a release contains.
- **The orchestrator dispatches a ticket; it never implements one.** Work that comes up here gets
  its own Orca worktree with its own chatable Claude session running `/implement-ticket <n>` inside
  it, spawned unasked — not this session, not an Agent-tool subagent (invisible from the phone, and
  a plan gate that cannot be argued with is not a gate), and never a raw `git worktree add`, which
  Orca reclaims out from under you because it did not create it.

  ```bash
  orca worktree create --repo id:<repoId> --name vault-graph-<issue>-<slug> --no-parent \
    --agent claude --prompt "/implement-ticket <issue>" --json
  ```

  **`--no-parent` is not optional, and it is the half that gets forgotten.** Run from inside a
  worktree — which the orchestrator always is — Orca infers the *caller* as the parent, so every
  dispatched ticket ends up nested under the orchestrator's own tree instead of standing as its own
  worktree in the project. Both halves were got wrong on 2026-09-11: this session implemented a
  ticket itself, and the ones it did dispatch came out as child trees. Read `parentWorktreeId` from
  `orca worktree list --json` to check, and repair one with
  `orca worktree set --worktree <selector> --no-parent`.
- **An orchestrator stops spawning new sessions once 6 Orca worktrees are already working.**
  Each active worktree can mean its own Claude process plus Chrome over CDP plus node/npm —
  fanning out further than that starved CPU and disk enough to force a hard restart on
  2026-09-11, even with RAM nowhere near full. Count `orca worktree list --json` entries with
  `workspaceStatus: in-progress` before dispatching another; at six, queue the rest and dispatch
  only as one finishes and is merged.
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
