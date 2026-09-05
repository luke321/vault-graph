// github#58

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
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  sourcemap: false,
  minify: false,
  logLevel: "info",
  plugins: [rawLoader, stripDemoAndDebugPlugin],
  banner: {
    js: "/* Vault Graph -- built by scripts/build-plugin.mjs. Source: plugin/ and src/. */\n" +
        engineBanner(),
  },
};

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
