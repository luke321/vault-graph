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
  the push to `develop` (the pre-push hook); do not run it by hand unless asked.
- **Two things may not run twice at once, and `scripts/lock.mjs` is how you know.** Several
  agents work this repo in parallel worktrees, and two of them collide invisibly: a **screen
  recording** (`record-demo.ps1`, `make-hero.ps1`) grabs a display region, so a second take
  captures the first one's window; the **full suite** drives Chrome over CDP, so two runs fight
  for ports and each blames the code. Take the lock, do the thing, release it — always release,
  even on failure, or everyone else waits out the stale window (20 min for `record`, 30 for
  `suite`):

  ```bash
  node scripts/lock.mjs acquire record --owner "#77 palette"   # blocks; exit 1 = give up, do not record
  node scripts/lock.mjs release record --owner "#77 palette"
  node scripts/lock.mjs status                                  # who holds what
  ```

  The lock lives in the OS temp dir, not the worktree, so **every worktree shares one**. A
  `mkdir` is the lock — atomic, and it survives a killed session as a stale entry rather than a
  permanent one. Screenshots need no lock: `shoot.mjs` captures over CDP, so overlapping windows
  are harmless — but pass your own `--port`.
- **A vault that is not Lukas's own opens behind a trust prompt, and the plugin does not load
  until you clear it.** Any fixture or generated vault — `demo-vault`, `test-vault`, a
  scratch mirror — is a *new* vault to Obsidian, so the first open shows **"Trust author and
  enable plugins?"** and leaves a Settings window behind. Until both are dealt with the plugin
  is not loaded **at all**: no ribbon icon, no view, no `__vg`. That looks exactly like a
  broken build, and has been misdiagnosed as one. So the order is always: open the vault,
  confirm the trust prompt, close Settings, **then** judge what the plugin is doing. This
  applies to `deferred-check.mjs` and `refresh-check.mjs` too — they launch a real Obsidian.
- `git push` and merging into `develop` are separate asks, every time. `main` only ever
  receives `develop`.
- **A release is the range, not the work in hand.** Everything it needs — a `CHANGELOG.md`
  section accounting for *every* merge since the last tag, every clip it embeds, every doc naming
  the version, the release body itself — is finished on `release/<version>` and read there before
  anything merges down. **Once the tag exists nothing changes**: a fix is the next patch version,
  because editing after the fact leaves the tag disagreeing with the published page. 2.1.0 was
  cut twice for skipping this; `.ai-context/releasing.md` opens with the commands that enumerate
  a range.
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
- Fixtures: three generated vaults (`scripts/make-*-vault.mjs`) in the shared store; never a
  real vault, never a built `vault-graph.html`, in anything that reaches the repo.
- `npm run lint` holds every finding at zero. `check-pii`, `check-scope`, `check-network` and
  the two determinism checks gate every push and have no skip flag.
- Commit messages are sentences; `Closes #n` on its own line closes the issue when the work
  reaches `main`.

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
