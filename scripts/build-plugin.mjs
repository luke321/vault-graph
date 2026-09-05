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
// So the page, the engine and the logo are compiled INTO main.js. That is the only shape
// that survives installation.
//
// The exporter in src/ assembles the same sources into a standalone HTML file, bundling the
// engine with the same esbuild (github#58). One page, two mounts.

import { build, context } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { engineBanner } from "../src/engine/notice.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const WATCH = process.argv.includes("--watch");

/* ------------------------------------------------------------------ assets --
 * `raw:` and `b64:` import prefixes, so main.js can say what it needs and the bundler
 * decides how it travels. Without a namespace plugin there is no way to say "this .html is
 * text, that .png is base64" -- esbuild keys loaders off the extension alone.
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

/* -------------------------------------------------------------- demo/debug --
 * The demo storyboard (?demo, `demoMode`/`demoAct`), its input-driving helpers
 * (`demoCursorAt` and friends), and the large `window.__vg` debug surface
 * (wedge-overlay probes, internal getters, `checkZeroWeightInvariance`, ...) all live
 * in src/page.js because that is the one file both hosts share -- but none of it can do
 * anything inside Obsidian: every one of them is armed by a `location.search` query
 * string, and the plugin's view has no URL of its own to put one on. Shipping ~2,000
 * lines of automation-driving and internals-probing code that can never activate is
 * both dead weight and a larger review surface than the plugin actually needs.
 *
 * Three regions in src/page.js are marked with matching BEGIN/END comments (the
 * `demoCursorAt` cluster, the `demoMode`/`demoAct`/`demoApi` cluster, and the
 * non-host slice of the `window.__vg` object -- see that file for exactly what stayed:
 * the ~15 properties plugin/main.js actually calls, like `readTheme` and
 * `setFolderColors`). This removes the TEXT between each marker pair before esbuild
 * ever parses the file -- not a runtime flag, because a flag would still ship the source and only hide
 * it, which answers "can a user reach this" but not "is this code in the file".
 *
 * The exporter (src/build-graph.mjs, src/shell.html) does not go through esbuild at
 * all and is untouched: record-demo.ps1, smoke.mjs and the invariant suite all run
 * against that build and need every one of these regions intact.
 *
 * COUNT-CHECKED, not just pattern-matched: a marker pair that silently stops matching
 * (a typo introduced while editing near one) would ship 2,000 lines of dead demo code
 * into main.js with no error at all. Three is the number of regions in src/page.js
 * today; if that count ever changes on either side, the build fails loudly instead of
 * silently shipping (or over-stripping) the wrong amount.
 */
const DEMO_MARKER_BEGIN =
  "/* ---- BEGIN: demo automation + debug API -- stripped from the plugin build, see scripts/build-plugin.mjs (stripDemoAndDebug) ---- */";
const DEMO_MARKER_END = "/* ---- END: demo automation + debug API ---- */";
const EXPECTED_DEMO_REGIONS = 3;

function stripDemoAndDebug(source, filePath) {
  const beginCount = source.split(DEMO_MARKER_BEGIN).length - 1;
  const endCount = source.split(DEMO_MARKER_END).length - 1;
  if (beginCount !== EXPECTED_DEMO_REGIONS || endCount !== EXPECTED_DEMO_REGIONS) {
    throw new Error(
      `stripDemoAndDebug: expected ${EXPECTED_DEMO_REGIONS} BEGIN/END marker pairs in ` +
      `${filePath}, found ${beginCount} BEGIN and ${endCount} END -- a marker was added, ` +
      `removed or mistyped. Fix the markers before building.`
    );
  }
  let out = source;
  for (let i = 0; i < EXPECTED_DEMO_REGIONS; i++) {
    const start = out.indexOf(DEMO_MARKER_BEGIN);
    const end = out.indexOf(DEMO_MARKER_END, start);
    if (start < 0 || end < 0 || end < start) {
      throw new Error(`stripDemoAndDebug: marker pair ${i + 1} is out of order in ${filePath}`);
    }
    out = out.slice(0, start) + out.slice(end + DEMO_MARKER_END.length);
  }
  return out;
}

const stripDemoAndDebugPlugin = {
  name: "strip-demo-and-debug",
  setup(b) {
    b.onLoad({ filter: /[\\/]page\.js$/, namespace: "file" }, (args) => ({
      contents: stripDemoAndDebug(readFileSync(args.path, "utf8"), args.path),
      loader: "js",
    }));
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
  plugins: [rawLoader, stripDemoAndDebugPlugin],
  // The second block is Sigma's MIT notice, which the ported engine obliges this file to
  // carry (src/engine/NOTICE.md). A `/*!` comment, so a minifier would keep it too.
  banner: {
    js: "/* Vault Graph -- built by scripts/build-plugin.mjs. Source: plugin/ and src/. */\n" +
        engineBanner(),
  },
};

// styles.css is CONCATENATED, not bundled: Obsidian loads it itself as a sibling of
// main.js, so nothing in the module graph imports it.
//
// Two parts, in this order:
//   plugin/styles.css   the host chrome -- how the view's element behaves inside Obsidian
//   src/page.css        the page itself, every rule scoped under .vault-graph
//
// THE PAGE'S STYLESHEET IS NOW THE PLUGIN'S STYLESHEET. That is the whole reason
// check-scope.mjs exists and has no skip flag: one unscoped selector in page.css and this
// file restyles Obsidian instead of the graph.
function copyStyles() {
  const host = readFileSync(join(ROOT, "plugin", "styles.css"), "utf8");
  const page = readFileSync(join(ROOT, "src", "page.css"), "utf8");
  writeFileSync(join(ROOT, "styles.css"),
    "/* Built by scripts/build-plugin.mjs from plugin/styles.css + src/page.css. */\n" +
    host.trimEnd() + "\n\n" +
    "/* ---- src/page.css ---------------------------------------------------- */\n" +
    page.trimEnd() + "\n", "utf8");
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
