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
- **A filtered dot keeps its link rank and gains a count-based readability floor.** Balanced adds
  0.7 CSS pixels of radius per halving of the visible count, from 1.5 up to 7.5 pixels. Growth is
  bounded by the larger of that floor and `DOT_GROW_MAX` times its baseline size; spatial and
  animation endpoint caps still apply. Groups hidden in settings contribute no members or links
  to that baseline; temporary legend and date filters retain its locked rings.
- **Only depth-1 subfolders with their own tint slot are pushed**; a sub-wedge earns a slot only if it can fill one.
- **The page is scoped**: every CSS rule under `.vault-graph`, every id through `$()`; nothing shipped reaches the network.
- **The layout matches its golden snapshot** on all five fixtures — never regenerate a golden to make a check pass.

## How to work here

- **`--headless` runs the suite with no window, and `--lane fast|walk|all`
  runs one half of it** (github#155). Both are opt-in: the default is still a real window on
  the harness screen, and **`CI` does not imply `--headless`**. A
  headless run corrects its viewport to the tuned 1584×961 rather than inheriting Chrome's, and
  both flags are run-shape deltas, so neither stamps a tree. **The suite has no CI gate and is
  not getting one**: measured 2026-09-21, a GitHub-hosted runner takes 30.9 min against 5 min
  here and goes 0-for-3 green, every failure a timeout rather than a disagreement
  (decisions/0016). `--headless` is for local runs that must not seize a screen.
- `node scripts/smoke.mjs --only "<substring>"` is the iteration loop. The full suite runs on
  the push to `develop` whose tree it has not measured yet (the pre-push hook; see
  `scripts/suite-stamp.mjs`); do not run it by hand unless asked.
- **The harnesses take no lock of their own** (github#192). `smoke.mjs`, `spike-check.mjs`,
  `record-demo.ps1`, the other window-placing checks and the pre-push hook call an optional
  harness hook when one is configured outside the repo (`VAULT_GRAPH_HARNESS_HOOK`, or
  `git config vaultgraph.harnessHook`): it can hold a screen or the fixture store, and name the
  monitor a window goes on. With none configured they run as a fresh clone should — no lock, no
  waiting, windows on the leftmost screen. The contract is `.ai-context/harness-hook.md`.
  `shoot.mjs` is a CDP capture: pass it its own `--port`.
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
- `npm run lint` holds every finding at zero. `check-pii`, `check-scope`, `check-network`,
  `check-comments` and the two determinism checks gate every push and have no skip flag.
  **`check-comments` is a ratchet, not a snapshot**: it fails the push once the repo holds more
  non-pointer comment lines than `BASELINE`, wherever they landed. A branch that finds the ratchet
  already over baseline still owes it not going higher — treating existing debt as licence to add
  more is how nine tickets in one session pushed `develop` from exactly 0 over to 272 over, none
  of them individually far enough over their own diff to notice (github#188). Run
  `node scripts/check-comments.mjs` before calling anything done, same as `npm run lint`.
- Commit messages are sentences; `Closes #n` on its own line closes the issue when the work
  reaches `develop` — a workflow does it, since GitHub itself only resolves it on `main`.

## Where things are

| | |
|---|---|
| `src/page.js` | the page: plan, layout, cascade, render, UI — one `mountVaultGraph()`, ~300 inner functions. **Do not read it top to bottom**; open `.ai-context/code-map.md` and go to the line range |
| `src/engine/` | the graph store and WebGL renderer (TypeScript) |
| `src/build-graph.mjs` | the exporter: vault → data → one HTML file |
| `src/taxonomy.mjs`, `src/contract.mjs` | what both producers share: the policy, and the output shape as data (github#149, `design/0020`) |
| `plugin/build-data.mjs` | the plugin's producer: metadata cache → data. No `obsidian` import at runtime, so a gate can run it (github#149) |
| `plugin/main.js` | the Obsidian plugin: the view, its lifecycle, the settings tab, the live rebuild |
| `scripts/smoke.mjs` | the invariant suite (Chrome over CDP); `scripts/*-check.mjs` are the manual harnesses |
| `.ai-context/code-map.md` | **generated**: sections and functions of the two big files, with line numbers |
| `.ai-context/code-index.md` | **generated**: issue → code sites, ADR/DDR → code sites, invariant → check, `__vg.*` → callers |
| `.ai-context/README.md` | the map of the design records: `decisions/` (ADRs, why not the other thing), `design/` (DDRs, how a part works), `animation.md`, `invariants.md`, `changelog-detail.md` |
| `CONTRIBUTING.md` | the gates and the branch policy |

Both generated files come from `node scripts/code-map.mjs`; `--check` fails when they are
stale, and the pre-push hook runs it. Comments in the code are pointers (`github#N`,
`decisions/NNNN`, `design/NNNN`); the reasoning behind them is in `.ai-context/`, reached
through the index.
