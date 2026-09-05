#!/usr/bin/env node
// github#1
// github#58

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const OURS = [
  "plugin/main.js",
  "src/page.js",
  // github#58
  ...readdirSync(join(ROOT, "src", "engine")).filter((f) => f.endsWith(".ts")).sort()
    .map((f) => "src/engine/" + f),
  "src/page.html",
  "src/shell.html",
  "src/page.css",
  "plugin/styles.css",
];

const BUILT = ["main.js", "styles.css"];

const FETCH_CALL = /(^|[^.\w$])fetch\s*\(/g;

export const NETWORK_PRIMITIVES = [
  ["fetch(", FETCH_CALL],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/g],
  ["WebSocket", /\bWebSocket\b/g],
  ["EventSource", /\bEventSource\b/g],
  ["sendBeacon", /\bsendBeacon\b/g],
  ["importScripts", /\bimportScripts\b/g],
  ["requestUrl", /\brequestUrl\b/g],
];

export function findNetworkPrimitives(text) {
  const hits = [];
  for (const [name, re] of NETWORK_PRIMITIVES) {
    re.lastIndex = 0;
    const count = (text.match(re) || []).length;
    if (count) hits.push({ name, count });
  }
  return hits;
}

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
