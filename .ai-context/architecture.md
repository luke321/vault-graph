# Architecture

Two pieces: a Node build script that turns a vault into data, and a single HTML template
that turns that data into an interactive disc. Nothing runs at serve time — there is no
serve time.

```
build-graph.mjs                          template.html
─────────────────                        ─────────────
crawl vault ─┐
             ├─ nodes + edges ─┐
read .obsidian config ─────────┼──► window.VAULT_DATA ──► graph (src/engine/store.ts)
                               │                              │
src/engine (bundled) ──────────┘                              ▼
                                                    plan ──► layout ──► render (src/engine)
                                                     ▲          │
                                                     └── cascade ┘
```

## Build side — `build-graph.mjs`

- **Vault-agnostic by construction.** No folder name or numbering is baked in. Which
  folders are templates and which are daily notes comes from the vault's own
  `.obsidian` config (`templates.json`, `daily-notes.json`, Templater's settings).
  Hardcoding `05 - Templates` broke the day the vault was renumbered — see
  `decisions/0005-*`.
- **Vault located explicitly**, `--vault` / `VAULT_GRAPH_VAULT`, falling back to walking
  up for `.obsidian`. The source lives outside the vault now; the output goes in.
- **Links are resolved the way Obsidian resolves them**: basename, then alias, then full
  path, reading `[[wikilinks]]` from both body and frontmatter. Fenced code blocks are
  skipped so Dataview queries don't invent edges.
- Output is one self-contained HTML file with the data and both libraries inlined.

## Render side — `template.html`

Four stages, and the bugs live in the seams between them.

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
github#58, a port of sigma 3.0.2's camera math and programs) draws them in WebGL2. It keeps no
spatial index -- picking is geometric -- so the `skipIndexation: true` the page still passes
while animating is accepted and ignored; `settle()` refreshes once at the end.

## The through-line

> **Nothing in the chain from weight to position is allowed to step.**

A step in a value that changes every frame is a teleport on screen. Most of the
changelog is finding one more discrete thing in that chain and removing it — integer row
counts, floored row coordinates, a re-packed reference width, a switched plan basis. The
one remaining discrete step is `Math.floor(pp)` for the row bucket, which is smoothed
rather than removed (`decisions/0002-*`); taking the radius from the continuous
coordinate instead was tried and reverted, because it smears every note on every frame.
