/**
 * The engine's entry point: what the two hosts hand into `deps` (github#58).
 *
 * The plugin imports this module; esbuild compiles the TypeScript as part of bundling
 * main.js. The exporter bundles it separately -- src/build-graph.mjs runs esbuild over this
 * file into one IIFE that sets `window.VaultGraphEngine`, inlined into vault-graph.html where
 * the vendored library bundles used to be, and shell.html reads the constructors off that
 * global. Same shape the UMD bundles had, which is why page.js needed no change to receive it.
 *
 * The viewport math is exported as well, for scripts/render-diff.mjs: it compares these pure
 * functions against Sigma's `graphToViewport` in the same page, which is how step 3.1 is proved.
 */

export { GraphStore } from "./store";
export { Renderer } from "./renderer";
export { optionsFromSigmaSettings } from "./compat";
export { createNormalization, easings, getCorrectionRatio, getMatrixImpact, identity, matrixFromCamera,
         multiplyVec2 } from "./viewport";
export type * from "./types";
