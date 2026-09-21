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
- **The layout matches its golden snapshot** on all five fixtures — never regenerate a golden to make a check pass.

## How to work here

- **`--headless` runs the suite with no window and no screen lock, and `--lane fast|walk|all`
  runs one half of it** (github#155). `CI` implies `--headless`; `--headed` beats both. A
  headless run corrects its viewport to the tuned 1584×961 rather than inheriting Chrome's, and
  both flags are run-shape deltas, so neither stamps a tree. **The suite has no CI gate and is
  not getting one**: measured 2026-09-21, a GitHub-hosted runner takes 30.9 min against 5 min
  here and goes 0-for-3 green, every failure a timeout rather than a disagreement
  (decisions/0016). `--headless` is for local runs that must not seize a screen.
- `node scripts/smoke.mjs --only "<substring>"` is the iteration loop. The full suite runs on
  the push to `develop` whose tree it has not measured yet (the pre-push hook; see
  `scripts/suite-stamp.mjs`); do not run it by hand unless asked.
- **Two things may not run twice at once, and `scripts/lock.mjs` is how you know.** Several
  agents work this repo in parallel worktrees, and they collide over two different resources: a
  **screen** (`smoke.mjs`, `spike-check.mjs`, `record-demo.ps1` each place a window, so the lock
  is named after the monitor — `screen-left`, `screen-right`, `screen-primary` — not the job), and
  the **shared fixture store** (`.fixtures/`, under the name `suite`) that a regenerating run
  deletes out from under a concurrent one. The two names are deliberately not aliased — the
  deadlock that taught us that, and the github issues behind each one, are in
  `.ai-context/locking.md`.

  ```powershell
  node scripts/lock.mjs acquire screen-right --owner "#77 palette"   # blocks; exit 1 = give up
  node scripts/lock.mjs release screen-right --owner "#77 palette"   # always, even on failure
  node scripts/lock.mjs status                                       # who holds what
  ```

  You need those two by hand only for something that seizes a display and is **not** one of the
  three harnesses (`smoke.mjs`, `spike-check.mjs`, `record-demo.ps1`) — **never wrap one of
  them**, since its own acquire would wait out your stale hold; `--no-lock` exists for the one
  caller that already holds it. **Never wrap a `git push` either**: `.githooks/pre-push` takes
  `suite` itself around its own run, so an outer hold blocks the hook's own attempt and the push
  hangs until your stale window expires. A plain `git push origin develop`/`main`, or a
  `smoke.mjs` run you drive directly, is correctly gated on its own. `make-hero.ps1` and
  `shoot.mjs` need no lock (a transcode and a CDP capture — pass `shoot.mjs` its own `--port`).
- **Never serve Chrome unlabeled.** Any vault-graph page opened in Chrome from this worktree
  — `smoke.mjs`, `shoot.mjs`, a manual review build — sets the page's own top-left title to
  `<worktree/feature> — <what it's showing>`, e.g. `tag-grouping — demo vault`, instead of the
  default. Patch `window.VAULT_DATA`'s `vault` field in the built HTML, never the product: the
  title is a review aid, and several builds from different branches and vaults sit in tabs at
  once, so an unlabeled one is judged against the wrong build.
- **A vault Obsidian has not been told to trust opens in restricted mode, and the plugin does not
  load at all** — it reads as a broken plugin rather than an unconfirmed dialog. The CDP workaround
  and the full trap are in `.ai-context/obsidian-trust-mode.md`.
- `git push` and merging into `develop` are separate asks, every time; only the primary checkout
  pushes to `develop` or cuts a release. `main` only ever receives `develop`.
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
- Fixtures: five generated vaults (`scripts/make-*-vault.mjs`) in the shared store; never a
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
