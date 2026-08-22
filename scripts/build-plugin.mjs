// Bundle the Obsidian plugin into the three files Obsidian actually installs.
//
//   node scripts/build-plugin.mjs            # once
//   node scripts/build-plugin.mjs --watch    # rebuild on change
//
// WHY THIS EXISTS AT ALL, given the repo's pride in having no build step: Obsidian
// downloads exactly main.js, manifest.json and styles.css from the release whose tag
// matches the manifest version. Nothing else. The spike read src/template.html and
// vendor/*.js out of its own plugin folder at runtime, which works when a script copied
// them there and fails for every real user, because those files are never installed.
//
// So the page, both libraries and the logo are compiled INTO main.js. That is the only
// shape that survives installation.
//
// The exporter in src/ is untouched and still node-builtins-only: it assembles the same
// three sources into a standalone HTML file with no npm anywhere near it. One page, two
// mounts -- see .ai-context/decisions/0008-one-page-two-mounts.md.

import { build, context } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const WATCH = process.argv.includes("--watch");

/* ------------------------------------------------------------------ assets --
 * `raw:` and `b64:` import prefixes, so main.js can say what it needs and the bundler
 * decides how it travels. Without a namespace plugin there is no way to say "this .js is
 * text, that .js is code" -- esbuild keys loaders off the extension alone, and vendor/
 * holds .js files that must NOT be parsed as modules (they are UMD bundles that would be
 * torn apart by tree-shaking).
 */
const rawLoader = {
  name: "raw-and-base64",
  setup(b) {
    for (const [prefix, loader] of [["raw:", "text"], ["b64:", "base64"]]) {
      const filter = new RegExp("^" + prefix);
      b.onResolve({ filter }, (args) => ({
        path: resolve(dirname(args.importer), args.path.slice(prefix.length)),
        namespace: prefix,
      }));
      b.onLoad({ filter: /.*/, namespace: prefix }, (args) => ({
        contents: readFileSync(args.path),
        loader,
      }));
    }
  },
};

const options = {
  entryPoints: [join(ROOT, "plugin", "main.js")],
  outfile: join(ROOT, "main.js"),
  bundle: true,
  // CommonJS, because that is what Obsidian's plugin loader requires -- it does not
  // matter that the source is ESM; the source being ESM is what keeps its top-level
  // names out of the global scope, which is half the lint report.
  format: "cjs",
  platform: "browser",
  target: "es2020",
  // Provided by the host at runtime. Bundling any of these would either fail or ship a
  // second copy of Obsidian's own internals.
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  sourcemap: false,
  // Not minified, deliberately: the directory's automated review reads the shipped file,
  // and "source is not minified-only" is easiest to satisfy by shipping readable code.
  minify: false,
  logLevel: "info",
  plugins: [rawLoader],
  banner: {
    js: "/* Vault Graph -- built by scripts/build-plugin.mjs. Source: plugin/ and src/. */",
  },
};

// styles.css is copied rather than bundled: Obsidian loads it itself, as a sibling of
// main.js, and it is not reachable from the module graph.
function copyStyles() {
  const css = readFileSync(join(ROOT, "plugin", "styles.css"), "utf8");
  writeFileSync(join(ROOT, "styles.css"),
    "/* Built by scripts/build-plugin.mjs from plugin/styles.css. */\n" + css, "utf8");
}

if (WATCH) {
  const ctx = await context(options);
  await ctx.watch();
  copyStyles();
  console.log("watching plugin/ -- ctrl-c to stop");
} else {
  await build(options);
  copyStyles();
  const kb = (n) => (n / 1024).toFixed(0) + " KB";
  const sizes = ["main.js", "styles.css", "manifest.json"]
    .map((f) => f + " " + kb(readFileSync(join(ROOT, f)).length));
  console.log("built: " + sizes.join(", "));
}
