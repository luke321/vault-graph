# Architecture

**Two producers, one page.** A vault becomes `VaultData`; `VaultData` becomes a disc. The
producer is either a Node script writing one self-contained HTML file, or an Obsidian plugin
reading the metadata cache — and from the page's point of view they are interchangeable,
because the contract between them is declared in one place and both are read against it.
Nothing runs at serve time. There is no serve time.

```
  src/build-graph.mjs                 plugin/build-data.mjs
  (Node: crawl the vault)             (Obsidian: read metadataCache)
          │                                   │
          ├──────── src/links.mjs ────────────┤   shared pure rules:
          ├──────── src/dates.mjs ────────────┤   link destinations, ghost ids, dates,
          ├──────── src/taxonomy.mjs ─────────┤   folders, types, tags, words, ghosts
          ├──────── src/contract.mjs ─────────┤   the shape itself, as data
          │                                   │
          ▼                                   ▼
      VaultData  ────────────────────────  VaultData        contract: src/page.js "types"
          │                                   │
  window.VAULT_DATA                   mountVaultGraph(root, data, deps)
          │                                   │
          └───────────────┬───────────────────┘
                          ▼
              src/page.js — mountVaultGraph()
                          │
           graph (src/engine/store.ts)
                          │
              plan ──► layout ──► render (src/engine)
               ▲          │
               └── cascade ┘
```

## The contract — `src/page.js`, section `types`

`VaultNode`, `VaultEdge`, `VaultStats` and `VaultData` are JSDoc typedefs at the top of
`src/page.js`, at module scope so that `plugin/main.js` can reach them as
`import("../src/page.js").VaultData`. They are the only written statement of what the two
producers must agree on, and the plugin's `buildData` is checked against them by
`npm run lint`. A node is its vault-relative path, or `ghost:<canonical destination>` for an
unresolved link.

The engine's own surfaces — the store and the renderer — are typed in `src/engine/types.ts`
as **exactly the members `page.js` calls** and nothing more (github#58, `decisions/0012`), so
anything a future caller reaches for shows up rather than being absorbed.

## Shared pure modules — `links`, `dates`, `taxonomy`, `contract`

Host-independent rules that both producers import rather than port. **None of the four imports
anything**, because all four are bundled into the plugin: a `node:` import in any of them would
reach `main.js`.

- `dates.mjs` (github#6) decides a note's day: frontmatter, then filename, then file stamp.
- `links.mjs` (github#141) cleans a link target, resolves it against the note it was written in,
  and derives a ghost's id, key and label.
- `taxonomy.mjs` (github#149) is everything else a producer decides about a note: its wedge and
  subfolders, the month-folder rule, its type, its tags, its word count, the ghost factory, the
  edge book.
- `contract.mjs` (github#149) is not a rule but the **shape** — every field of `VaultNode`,
  `VaultEdge`, `VaultStats` and `VaultData` with its type and whether it is required, plus the
  host differences that are declared rather than accidental.

They matter structurally, not just as tidiness: a change to any of them moves **both** hosts at
once, which is why `scripts/check-link-resolution.mjs` and `scripts/check-producer-contract.mjs`
gate them with no skip flag. Until github#149 the last two did not exist and the policy in them
was written out twice — 7 byte-identical duplications and 5 near-duplicates, measured.

Everything else stays in its adapter, because Obsidian owns its own metadata resolution while
the exporter parses files — and where the two therefore cannot agree, the difference is
**declared in `contract.mjs` with its reason and asserted to still happen**, rather than assumed
away (`design/0020`, and see *Link resolution*, below).

## Producer 1 — `src/build-graph.mjs` (the exporter)

- **Vault-agnostic by construction.** No folder name or numbering is baked in. Which folders
  are templates and which are daily notes comes from the vault's own `.obsidian` config
  (`templates.json`, `daily-notes.json`, Templater's settings). Hardcoding `05 - Templates`
  broke the day the vault was renumbered — see `decisions/0005-*`.
- **Vault located in four steps**, in order, each failing loudly rather than guessing:
  explicit (`--vault`, or `VAULT_GRAPH_VAULT` / `OBSIDIAN_VAULT`); then Obsidian's own
  registry read out of `obsidian.json` (`--vault-name`, or the sole known vault, or the sole
  *open* one); then walking up from the script for a `.obsidian`. The source lives outside the
  vault; the output goes in.
- **Links resolve against the note they were written in** — see below.
- Output is one self-contained HTML file: `src/shell.html` with `page.css`, `page.html`,
  `page.js`, the engine bundle, the assets and the data substituted into it. Every
  `window.VAULT_*` assignment goes through `jsonForScript()`, so a note cannot close the
  element it is serialised into (github#96, `scripts/check-data-escape.mjs`).

## Producer 2 — `plugin/build-data.mjs` and `plugin/main.js` (the Obsidian plugin)

Reads Obsidian's `metadataCache` rather than the filesystem, and emits the same `VaultData`.

**The data half is `plugin/build-data.mjs`, and it imports nothing from `obsidian` at runtime**
(github#149): the host's `normalizePath` is handed in on an explicit `host` argument, so the
adapter can be run in plain Node and compared against the exporter by
`scripts/check-producer-contract.mjs`. `plugin/main.js` is the rest, and it owns three things the
exporter has no equivalent of:

- **The view lifecycle.** `VaultGraphView extends ItemView`: `onOpen()` renders, `onClose()`
  tears down.
- **A render generation** (github#140). `teardown()` is **the one place a render is
  invalidated**: it increments `renderGen`, clears `rebuilding`, cancels the live rebuild,
  destroys the mount handle, drops the element reference and empties `contentEl`. Every
  asynchronous continuation inside `render()` re-checks `this.renderGen === gen` before
  touching anything, so a stale build cannot mount over a current one.
- **The live rebuild** (github#72, `design/0014`,
  `decisions/0011-a-live-rebuild-retakes-the-geometry-lock-at-rest`): the disc follows the
  vault while the view is open, debounced, and retakes the geometry lock only at rest.

## Persistence — the host owns it (`decisions/0009`)

`page.js` stores nothing. It takes settings in on the deps object and hands changes back
through `on*` callbacks; the standalone reads and writes `localStorage` in `shell.html`'s
bootstrap, and the plugin reads and writes `saveData()` / `loadData()`. Only the standalone
gets the in-page gear (`settingsUI`), because Obsidian already gives every plugin a settings
tab. Pins name their note's path, not its position in the input (`decisions/0014`).

## The page — `src/page.js`

Four stages, and the bugs live in the seams between them. `src/page.js` is ~11,000 lines in 36
sections: **do not read it top to bottom** — open `.ai-context/code-map.md` and go to the line
range.

### 1. Plan — `buildWedgePlan(onlyVisible, weightOf, rowsOf)`

Decides **which note sits in which cell, in which row, at which fraction across the
wedge**. A *cell* is a group plus a tint slot, so it is keyed at depth 1: a top-level
folder, subdivided by its first-level subfolders, of which only three are ever named
(`SUB_NAMED`) with the rest pooled into a shared tail slot.

- `weightOf` lets a note count as a *fraction* of a place. Feeding it opacity is what
  makes the packing re-derive continuously during a fade instead of switching between
  two packings.
- `rowsOf` supplies a cell's row count as a **real** number so an animation can walk
  between two packings. At rest it is absent and the count is a plain integer, which is
  what keeps the resting disc on its lattice.
- **One basis, always visible-only.** There is no longer a threshold that switches the
  plan basis — see `decisions/0001-*`.

A group is a folder or a tag, depending on the grouping dimension (`design/0015`); the
planner does not care which.

### 2. Layout — `ringsLayout(plan, strict)`

Turns a plan into coordinates. Two bands (inner ring and main ring), each a full circle
allocated independently. Wedge angle is the group's share of what is *visible*, so
hiding something makes the rest grow back into a full circle.

Locked once at load, from the whole vault, and never re-derived from what is visible:

| Lock | What it pins | Why |
|---|---|---|
| `bandLock` | which band each group is in | otherwise enabling something in one ring re-packs the other |
| `geomLock` | `r0`, `rOuter`, `maxR` | the hub radius and the outer base, so the rings are independent |
| normalisation box | the renderer's custom bbox | hiding one folder otherwise moved the origin 13px and zoomed 8.2% |

Every layout quantity is per band, held as a pair of scalars in which the unqualified name
means the outer one — `decisions/0011-band-state-is-a-keyed-descriptor` has the tally.

### 3. Cascade — the reveal/hide animation

Interpolates between the packing the notes are resting in (`planA`) and the one
`settle()` will assign (`planB`), blending **row counts** across the fade so the radial
re-densification arrives as part of the same movement.

Both endpoints come from `staticPlan(presentFn)`, which derives every argument from
"which notes are present" exactly as the resting path does. That is deliberate: every
jump chased on 2026-08-22 was the animation planner and the static planner being called
with *different arguments* and drifting apart one argument at a time.

### 4. Render — the engine (`src/engine/`)

Node reducers apply colour, size, halo and the highlight push; the renderer (ours since
github#58, a port of sigma 3.0.2's camera math and programs — `decisions/0012`) draws them in
WebGL2. It keeps no spatial index -- picking is geometric -- so the `skipIndexation: true` the
page still passes while animating is accepted and ignored; `settle()` refreshes once at the
end. A lost WebGL context is recovered per layer rather than silently drawing nothing
(github#144).

## Link resolution — and the one place it differs from Obsidian

The lookup order is **`<source folder>/<dest>` exact, then vault-relative exact, then the
ambiguous basename/alias index**, and the first two read a separate `byPath` map, so a
destination naming a path can never silently resolve to an unrelated basename. An explicit
`./` or `../` destination stops after the first step, which is what Obsidian does too.
A ghost's id is `ghost:<canonical full destination>`, with the basename kept as the display
*label* only — in both producers, from `src/links.mjs`.

**The equivalence is close but not total, and the gap is measured rather than claimed.**
The exporter and a real Obsidian mount agree on every node id and every edge weight on the
miniature probe vault github#141 built for it, ghost ids included. Exactly one divergence remains and is deliberate:
`[[Nickname]]` stays unresolved in Obsidian's `resolvedLinks` while the exporter resolves it
through its alias index, so the plugin grows a `ghost:Nickname` the exporter does not —
adopting the cache's answer would delete real edges. `invariants.md`, *Link resolution*, has
the numbers, the four-fixture blast-radius comparison, and the check.

## Build entry points

| | |
|---|---|
| `node src/build-graph.mjs --vault <path>` | the standalone. Substitutes into `src/shell.html`; `asScript()` strips `page.js`'s `export` line so the module becomes a plain `<script>`. No esbuild for the page itself — only the engine is bundled |
| `npm run build` (`scripts/build-plugin.mjs`) | the plugin. esbuild, with `raw:` / `b64:` / `vg:` import prefixes, and `stripDemoAndDebug` removing **exactly three** marked regions of `src/page.js` (the demo automation and the `__vg` debug API) — a count mismatch throws rather than shipping the wrong amount |

Both bundle `src/engine`, and both must carry the Sigma notice
(`src/engine/NOTICE.md`, `scripts/check-notice.mjs`).

## The gates

`.githooks/pre-push` runs these **only on a push whose remote ref is `develop` or `main`** —
a feature-branch push runs none of them and proves nothing. In order:

`check-pii` · `check-scope` · `check-network` · `check-notice` · `check-comments` ·
`check-generator-determinism` · `check-build-order-determinism` · `check-data-escape` ·
`update-note-selftest` · `smoke-runner-selftest` · `check-link-resolution` ·
`check-producer-contract` · `code-map.mjs --check` · `gallery-nav.mjs --check` ·
`check-ci-parity` · `npm run lint`

**None of those sixteen has a skip flag.** `SKIP_SMOKE=1` reaches only the last step, the
invariant suite (`scripts/smoke.mjs`), which runs each check on the fixtures its assertion is
about and skips entirely on a tree already stamped green (`decisions/0013`).

Enable the hook once per clone:

```bash
git config core.hooksPath .githooks
```

## The through-line

> **Nothing in the chain from weight to position is allowed to step.**

A step in a value that changes every frame is a teleport on screen. Most of the
changelog is finding one more discrete thing in that chain and removing it — integer row
counts, floored row coordinates, a re-packed reference width, a switched plan basis. The
one remaining discrete step is `Math.floor(pp)` for the row bucket, which is smoothed
rather than removed (`decisions/0002-*`); taking the radius from the continuous
coordinate instead was tried and reverted, because it smears every note on every frame.
