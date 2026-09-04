/**
 * The engine's entry point: what the two hosts hand into `deps` (github#58).
 *
 * The plugin imports this module; esbuild compiles the TypeScript as part of bundling
 * main.js. The exporter bundles it separately -- src/build-graph.mjs runs esbuild over this
 * file into one IIFE that sets `window.VaultGraphEngine`, inlined into vault-graph.html where
 * the vendored library bundles used to be, and shell.html reads the two constructors off that
 * global. Same shape the UMD bundles had, which is why page.js needed no change to receive it.
 */

export { GraphStore } from "./store";
export { Renderer } from "./renderer";
export type * from "./types";
