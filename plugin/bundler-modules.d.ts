// The two import prefixes scripts/build-plugin.mjs resolves, described to the type program.
//
// `raw:` inlines a file as text and `b64:` as base64 -- both are esbuild namespace loaders
// of our own (see the plugin in that script), so no typing anywhere knows them, and without
// this file an `import PAGE_HTML from "raw:..."` is an unresolved module: an error type
// that every use of the value then carries onto the no-unsafe meter (github#60). A
// declaration file, not a cast at the use site: typescript-eslint reads the type of the
// expression inside a JSDoc cast, not the cast, so `/** @type {string} */ (PAGE_HTML)`
// changes nothing there -- measured.
//
// Not a compile step, and nothing bundles or ships it: esbuild follows imports and this is
// imported by nothing. tsconfig.json names it so the program has it.
declare module "raw:*" {
  const text: string;
  export default text;
}

declare module "b64:*" {
  const base64: string;
  export default base64;
}
