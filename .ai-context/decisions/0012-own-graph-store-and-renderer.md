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
  and `quietWrites` leaves with the thing it worked around. (Until step 3.6 the store also
  carries a marked transitional facet for Sigma itself, which holds the graph and validates it
  with graphology-utils' `isGraph`: no-op `on`/`removeListener`, `getEdgeAttributes`, `edges()`,
  `multi`, and the two members `isGraph` probes. It goes with Sigma.)
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

## Measured while porting

Things Sigma's source did not say and the harness did.

- **`stagePadding` is 30 by default and the page never set it.** The first camera comparison
  was off by a constant ≈28 px × ratio at every ratio (25.9 / 79.8 / 6.65 px at 1.08 / 0.35 /
  4.2); one constant later, 0. Every measured pixel constant in page.js assumes that padding.
- **The hover drawer is handed the node's key.** Sigma spread `{ key: node, ...data }` into the
  data it gave `defaultDrawNodeHover`, and page.js's `drawFocusWeb` opens with
  `if (data.key !== f) return`. Without the key the focus web never painted and `focus web
  stays above dim notes` failed on every fixture (shape: 23 blue, 921 dim samples; 985 / 0
  after). The interface now says so: `HoverData extends NodeDisplayData { key }`.
- **Two type programs must agree on variance.** The lint reads the shared `tsconfig.json`, the
  engine's `tsc` reads `tsconfig.engine.json` with `strict`; with `strictFunctionTypes` only in
  the second, a listener cast was "unnecessary" to one and required by the other. The shared
  config sets that one flag. It changes no JavaScript report.
- **The label grid held every visible node, empty labels included**, and its
  `getLabelsToDisplay` admits at least one candidate per cell at any ratio. So the "dead" grid
  did draw one thing: the hovered note's plain label during the first half of the hover ramp
  (before `forceLabel` takes over at `ht > 0.5`), whenever that note happened to be the largest
  in its 150 px cell. D-3 stands -- forced set only -- and that intermittent label is the one
  thing about labels the engine does not reproduce.
- **Picking is exact where Sigma's was quantised.** Sigma rendered node ids into a colour
  framebuffer at half resolution (`pickingDownSizingRatio` = 2 × DPR) and read one pixel; the
  engine tests the pointer against each drawn radius (`size / ratio` px) in draw order, last hit
  winning, haloed notes over plain. Same answer to within 2 px, no framebuffer, no texture per
  resize.
- **The two builds must be compared one at a time in one tab.** A background tab gets no
  animation frame, and the page defers its edge-cap refresh to one; two tabs side by side
  measured a settled page against an unsettled one.

## Landed

2026-09-04, one branch, four commits, in the order the issue sequenced: the interface and
toolchain; the store; the renderer behind a `--renderer sigma|own` switch, measured against the
Sigma build of the same vault; then the switch. **Steps 3.6 and 4 merged into one commit**:
once page.js constructs the engine's typed options the Sigma path is dead code, so the flag, the
shim, `src/vendor.mjs`, the `vendor-no-network` esbuild plugin, the licence header and
`vendor/` went with it. `deps.Sigma` is `deps.Renderer`, `preventSigmaDefault` is the payload's
`preventDefault`, and the reducers keep their names (`nodeReducer`, `edgeReducer`) because the
page talks about them by those names throughout.

| | before | after |
|---|---|---|
| `main.js` | 694 KB | **417 KB** |
| third-party code under lint | 261 KB, unpinned | none |
| build-time patches on someone else's bundle | 2 | 0 |
| WebGL contexts per renderer | 3 (+ a picking framebuffer) | 3 |
| pixels differing from the Sigma build, 3 fixtures × 3 ratios, at rest and in a search | -- | **0** |

The exporter needs `npm ci` once now (esbuild bundles the engine), so the release package
carries `package.json` and the lockfile and `releasing.md` says so. `scripts/render-diff.mjs`
stays as the before/after harness for any renderer change, comparing the current build against
reference pages built from the commit the picture is held to.

## Verify

```bash
npm run lint                                        # typecheck + eslint, 0 errors, 0 warnings
node scripts/smoke.mjs --only "golden snapshot"     # positions unchanged, all three fixtures
node scripts/render-diff.mjs --against-dir <refs>   # camera |d| 0, 0 pixels differing, every fixture
node scripts/render-diff.mjs --against-dir <refs> --query note   # the same in a search
```

Measured at step 1 (interface + toolchain, no runtime change): plugin bundle byte-identical to
`develop@79d829a`'s build, `tsc --noEmit` clean, lint 0/0 with `strict: true`.
