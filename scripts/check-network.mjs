#!/usr/bin/env node
// Assert that nothing this project ships can make a network request.
//
//   node scripts/check-network.mjs
//
// WHY THIS EXISTS. Both artifacts are meant to be offline objects. The standalone page is
// one HTML file people mail to themselves and open from a USB stick; the plugin reads a
// vault that is nobody else's business. Neither has a reason to talk to anything, and the
// promise is only worth as much as it is checkable -- the Obsidian directory's review
// counts network calls in the shipped main.js and reports the number to users, which is
// how we found out we were shipping two (github#1).
//
// Those two were Sigma's, unreachable, and are stripped at build time by src/vendor.mjs.
// This check is the gate that keeps the answer at zero, from three directions:
//
//   1. our own sources, which should never contain a request in the first place
//   2. the vendored bundles AFTER stripping -- and readVendorSource fails loudly if the
//      number of calls in a bundle is not the number we have read and accounted for
//   3. the built artifacts, if they are lying around, because those are what people run
//
// It is STATIC and takes milliseconds: no build, no browser. That is what makes it cheap
// enough to run on every push with no skip flag.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_FETCHES, findNetworkPrimitives, readVendorSource } from "../src/vendor.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Everything of ours that ends up inside a shipped artifact. Build tooling is deliberately
// not here: it runs on a developer's machine, where reaching the network would be a
// different question, and it would trip over its own prose about not doing so.
const OURS = [
  "plugin/main.js",   // the plugin entry point
  "src/page.js",      // the page, bundled into main.js and inlined into the HTML
  // The engine (github#58): every .ts under src/engine, bundled into both artifacts. Listed
  // by reading the directory so a file added there is checked without anyone remembering.
  ...readdirSync(join(ROOT, "src", "engine")).filter((f) => f.endsWith(".ts")).sort()
    .map((f) => "src/engine/" + f),
  "src/page.html",
  "src/shell.html",
  "src/page.css",
  "plugin/styles.css",
];

// Built output. Gitignored, so present only after a build -- checked when it is there,
// since it is the file a user actually runs and the file the directory's review reads.
const BUILT = ["main.js", "styles.css"];

// A remote resource is a request too, and a quieter one: no JS anywhere in the file, just
// a font or a script that only loads when someone is online and is logged by whoever
// serves it. Anchors are not included on purpose -- a link a person may choose to click is
// not the page reaching out on its own.
const REMOTE = [
  ["absolute src=", /\bsrc\s*=\s*["']?(https?:)?\/\//gi],
  ["stylesheet href=", /<link[^>]+href\s*=\s*["']?(https?:)?\/\//gi],
  ["css @import", /@import[^;]*(https?:)?\/\//gi],
  ["css url()", /url\(\s*["']?(https?:)?\/\//gi],
];

const problems = [];
let scanned = 0;

function scan(label, text) {
  scanned++;
  for (const hit of findNetworkPrimitives(text)) {
    problems.push(label + "  " + hit.name + " x" + hit.count);
  }
  for (const [name, re] of REMOTE) {
    re.lastIndex = 0;
    const n = (text.match(re) || []).length;
    if (n) problems.push(label + "  remote resource (" + name + ") x" + n);
  }
}

/* ---- 1. ours ------------------------------------------------------------ */

for (const f of OURS) scan(f, readFileSync(join(ROOT, f), "utf8"));

/* ---- 2. vendor, as it is shipped ---------------------------------------- */

// readVendorSource throws rather than returning problems: a bundle whose call count has
// moved is not a lint failure, it is a thing to go and read. Let it stop the run.
for (const f of Object.keys(EXPECTED_FETCHES)) scan("vendor/" + f + " (stripped)", readVendorSource(ROOT, f));

/* ---- 3. what a build produced ------------------------------------------- */

let built = 0;
for (const f of BUILT) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  built++;
  scan(f + " (built)", readFileSync(p, "utf8"));
}

/* ---- report ------------------------------------------------------------- */

if (!problems.length) {
  console.log(
    "check-network: clean (" + scanned + " files, " +
    (built ? built + " built artifact" + (built === 1 ? "" : "s") : "no build present") + ")"
  );
  process.exit(0);
}
console.error("check-network: " + problems.length + " problem(s)\n");
for (const p of problems) console.error("  " + p);
console.error(`
Both artifacts are offline objects: one HTML file that works off a USB stick, and a plugin
that reads a private vault. A request here is a promise broken, and the directory's review
counts them and tells users the number.

If a request is genuinely needed, it has to be DISCLOSED, not hidden: say so in the README
and the manifest description before adding it here. If it came in with a vendored bundle,
read what it does and account for it in src/vendor.mjs.`);
process.exit(1);
