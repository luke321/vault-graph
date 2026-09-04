# 0012 — Own the graph store and the renderer, in TypeScript

**Date** 2026-09-04 · **Status** accepted, in progress · **Issue** [#58](https://github.com/luke321/vault-graph/issues/58) · **Relates to** `0008`, [#55](https://github.com/luke321/vault-graph/issues/55), [#60](https://github.com/luke321/vault-graph/issues/60)

## Context

The picture is drawn by two vendored, minified UMD bundles: `vendor/sigma.min.js` and
`vendor/graphology.umd.min.js`, 261 KB of the 711 KB `main.js`. They were vendored without a
recorded version (identified on 2026-09-04 by hashing against npm: **sigma 3.0.2** and
**graphology 0.26.0**, byte-exact). We already patch Sigma twice by regex at build time (`0008`,
#7), the community directory lints `vendor/` as if it were ours (44 of the 77 findings on
1.9.0, 7,666 `no-unsafe-*` hits), and Sigma holds WebGL contexts the plugin has to free by hand.

What we actually use, measured on `develop@79d829a`: 16 of graphology's methods as a keyed
attribute bag with degree; 16 of Sigma's methods, one camera, one mouse captor, nine events,
six runtime settings. And a list of Sigma behaviour that page.js has switched off or works
around by construction:

- **The label density grid never draws a label.** `nodeStyle` blanks every label it does not
  force, so the drawn set is exactly the forced set (hover, selection past the dim, search hits).
  `labelDensity`, `labelGridCellSize`, `labelRenderedSizeThreshold` decide nothing.
- Rotation is off and `angle` is 0 in every camera state the suite issues.
- No node image program is registered (the `fetch` calls `0008` strips are that program's).
- Edge events, edge labels, hide-on-move: off.
- Double-click zoom is always `preventSigmaDefault()`ed in favour of `fit()`.
- `skipIndexation` without `partialGraph` is a no-op in Sigma's own source
  (`perf-cascade-frame-cost.md`).
- Sigma's subscription to the graph: 11 of the 12 graph-write sites are followed by an explicit
  `renderer.refresh`, and `quietWrites` exists only to silence the subscription during the
  twelfth kind of write, the bulk position loops (github#19).

## Alternatives weighed

| Option | Why not |
|---|---|
| **Keep vendoring, pin the versions** | Closes the version gap and nothing else: the patches, the lint findings and the 261 KB stay. |
| **Install from npm and tree-shake** | Same objection as in `0008`: a lockfile, a network at build time and a supply chain for a project whose selling point is having none -- and Sigma's UMD is one expression to a bundler anyway. |
| **Extract Sigma's programs verbatim as our source** | Smaller change, but then 187 KB of someone else's code sits under our lint, which is the finding this decision exists to remove. |
| **Canvas 2D instead of WebGL** | Fewer lines and no context cap, but a different rasteriser: "the same picture" would need an anti-aliasing tolerance argued for every pixel diff. Considered, and a spike was planned; decided against at the plan gate so the pixel bar can stay tight. |
| **page.js imports the engine** | Cleaner in the long run, but it forces the exporter to bundle page.js itself in the same change (#55 Phase 1), and page.js's toolchain is out of scope here. |

## Decision

**Write the store and the renderer ourselves, in TypeScript, as the smallest thing that draws
the same picture** -- and inject them where the bundles are injected today.

- **The interface first.** `src/engine/types.ts` declares `GraphStore` (16 members),
  `Renderer` (16 members), `Camera`, `RendererSettings`, `RendererOptions`, `RendererEvents`
  (nine), `MouseCaptor`. They are the measured surface, not a design; page.js re-points its
  JSDoc typedefs to them, so the page and the engine are checked against one declaration and
  anything new shows up on the lint meter.
- **Through the deps slot.** `deps.Graph` and `deps.Sigma` stay the injection points, retyped.
  shell.html hands in a global; plugin/main.js imports `src/engine/index`. page.js stays a
  pasted classic script with no `import`. No rename, no split, no page.js bundling.
- **WebGL stays for nodes and edges.** Own minimal WebGL2 programs ported from sigma 3.0.2's
  (MIT, attribution kept): circle, border ("halo"), rectangle and curve edges. Labels and hover
  pills stay Canvas 2D, as in Sigma. Same rasteriser, so the bar for "the same picture" is
  tight: **≤ 0.05 % of stage pixels differ by more than 8/255 in any channel**, dot centres and
  radii exact, `edgeInk` within ± 1 %. The context cap stays a fact, and the plugin's `kill()`
  stays with it.
- **Dropped, not reimplemented**: the label grid and its three settings; node images; rotation;
  edge events and labels; touch input; double-click zoom; the quadtree (picking is a linear scan
  over visible nodes); program registries (`type` stays a field, "halo" and "curve"/"line" are
  fixed draw paths); and **the graph subscription**. The store has no event emitter. The one
  write that leaned on Sigma's reaction -- the node-drag frame -- gets an explicit `refresh()`,
  and `quietWrites` leaves with the thing it worked around.
- **The exporter gains a compile step.** `src/build-graph.mjs` bundles `src/engine/index.ts`
  with esbuild into one IIFE `<script>`, inlined where the two vendor scripts sit. That ends the
  exporter's node-builtins-only stance (`package.json`'s description, the header of
  `scripts/build-plugin.mjs`). esbuild was already the plugin's bundler and already installed;
  `refresh-graph.ps1` runs from the repo, where `node_modules` is. Node 24's
  `module.stripTypeScriptTypes` would have kept the stance, at the cost of a single-file engine
  and a stability-1.2 API, and was not taken.
- **The toolchain the new files need**: `tsconfig.json` includes `src/engine/**/*.ts` so the
  lint rules read the engine with the same types as the page; `tsconfig.engine.json` extends it
  with `strict: true` over the engine alone, and `tsc --noEmit -p tsconfig.engine.json` runs
  inside `npm run lint` ahead of eslint, so the pre-push hook and `release.ps1` inherit it;
  `eslint.config.mjs` puts the engine in the block that carries the five `no-unsafe-*` errors.
  Two configs because `strict` cannot be per-file -- measured: `strict` on the shared program put
  29 errors on `src/page.js` (#55's ratchet, not this) and had esbuild inject `"use strict"`
  into `main.js`. Everything new is fully typed; `any` does not leak.
- **One long-lived branch, sequenced as the issue is**: interface, then graphology, then Sigma
  layer by layer behind a `--renderer sigma|own` switch in the exporter, then the vendor layer
  out. One gated merge into `develop` at the end.

## Consequences

- `0008` is rewritten when the vendor layer goes: "zero network calls" becomes a property of
  code we wrote, checked by `check-network.mjs` over our own sources and the built artifacts,
  rather than a patch we apply to someone else's.
- `vendor/NOTICE.md` goes with `vendor/`; a short attribution for the ported camera math and
  shader geometry replaces it.
- The two upstream patches survive as behaviour: `hover re-arms after the pointer leaves the
  stage` (the #7 fix is the engine's own now) and `check-network` (the #1 count).
- A new `scripts/render-diff.mjs` compares the Sigma build and the engine build of one fixture
  at three camera ratios, and `invariants.md` records the bar above.

## Verify

```bash
npm run lint                                        # typecheck + eslint, 0 errors, 0 warnings
node scripts/smoke.mjs --only "golden snapshot"     # positions unchanged, all three fixtures
```

Measured at step 1 (interface + toolchain, no runtime change): plugin bundle byte-identical to
`develop@79d829a`'s build, `tsc --noEmit` clean, lint 0/0 with `strict: true`.
