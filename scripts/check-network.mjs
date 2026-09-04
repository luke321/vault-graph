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
// Those two were Sigma's, unreachable, and were stripped at build time by src/vendor.mjs for
// as long as Sigma was vendored. Since github#58 the renderer is our own code and there is
// nothing to strip: "zero network calls" is a property of what we wrote, and this check is
// the gate that keeps the answer at zero, from two directions:
//
//   1. our own sources, which should never contain a request in the first place -- the
//      plugin, the page, the engine, the markup and the stylesheets
//   2. the built artifacts, if they are lying around, because those are what people run
//
// It is STATIC and takes milliseconds: no build, no browser. That is what makes it cheap
// enough to run on every push with no skip flag.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

// A bare `fetch(` -- not `.fetch(`, which would be a method on somebody's object and none
// of our business.
const FETCH_CALL = /(^|[^.\w$])fetch\s*\(/g;

/* Everything that would make a request. Names, not call shapes, so a check over the
 * shipped bundle catches an assignment or an alias as well as a direct call. */
export const NETWORK_PRIMITIVES = [
  ["fetch(", FETCH_CALL],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/g],
  ["WebSocket", /\bWebSocket\b/g],
  ["EventSource", /\bEventSource\b/g],
  ["sendBeacon", /\bsendBeacon\b/g],
  ["importScripts", /\bimportScripts\b/g],
  // Obsidian's own HTTP helper. Nothing here should reach for it either, and it is the one
  // a reader of the plugin API would think to use.
  ["requestUrl", /\brequestUrl\b/g],
];

/** Every network primitive in `text`, as `[{ name, count }]`. Empty is the good answer. */
export function findNetworkPrimitives(text) {
  const hits = [];
  for (const [name, re] of NETWORK_PRIMITIVES) {
    re.lastIndex = 0;
    const count = (text.match(re) || []).length;
    if (count) hits.push({ name, count });
  }
  return hits;
}

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

/* ---- 2. what a build produced ------------------------------------------- */

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

Remove the call. If it is genuinely needed, it has to be disclosed to users -- see
.ai-context/decisions/0008-zero-network-calls.md -- not hidden from this check.
`);
process.exit(1);
