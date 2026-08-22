#!/usr/bin/env node
// Assert the page cannot style, or be styled by, the document it is mounted in.
//
//   node scripts/check-scope.mjs
//
// WHY THIS EXISTS. page.css is dropped straight into Obsidian as the plugin's stylesheet,
// so a single unscoped selector does not style this page -- it styles the whole app. One
// `body { overflow: hidden }` would break the editor, and the failure would look like an
// Obsidian bug rather than ours. The same goes the other way for ids: a bare `#graph` in a
// document that already has one is a silent mis-target.
//
// This is a STATIC check, deliberately. The browser suite can only see what the page does
// to itself, and the interesting damage here is what it does to everything else.
//
// Three invariants:
//   1. every rule in page.css is scoped under `.vault-graph`
//   2. every id in page.html carries the `vg-` prefix
//   3. page.js reaches ids through its one prefixing accessor, not through a bare lookup

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const CLASS = ".vault-graph";
const PREFIX = "vg-";

const problems = [];

/* ---- 1. css ------------------------------------------------------------- */

const css = readFileSync(join(SRC, "page.css"), "utf8");
let depth = 0, inComment = false, rules = 0;
css.split("\n").forEach((line, i) => {
  // Strip comments before counting braces, so prose containing one cannot shift the depth.
  let scan = line, code = "";
  while (scan.length) {
    if (inComment) {
      const end = scan.indexOf("*/");
      if (end < 0) { scan = ""; } else { scan = scan.slice(end + 2); inComment = false; }
    } else {
      const start = scan.indexOf("/*");
      if (start < 0) { code += scan; scan = ""; }
      else { code += scan.slice(0, start); scan = scan.slice(start + 2); inComment = true; }
    }
  }
  const opens = (code.match(/\{/g) || []).length;
  const closes = (code.match(/\}/g) || []).length;

  if (opens > 0 && (depth === 0 || depth === 1) && !/^\s*@/.test(code)) {
    rules++;
    const sel = code.slice(0, code.indexOf("{")).trim();
    for (const part of sel.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (part !== CLASS && !part.startsWith(CLASS + " ") && !part.startsWith(CLASS + ":") &&
          !part.startsWith(CLASS + "[") && !part.startsWith(CLASS + ".") &&
          !part.startsWith(CLASS + ">")) {
        problems.push(`page.css:${i + 1}  unscoped selector: ${part}`);
      }
    }
  }
  depth += opens - closes;
});
if (depth !== 0) problems.push(`page.css  unbalanced braces (depth ${depth} at EOF)`);

/* ---- 2. markup ---------------------------------------------------------- */

const html = readFileSync(join(SRC, "page.html"), "utf8");
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
for (const id of ids) {
  if (!id.startsWith(PREFIX)) problems.push(`page.html  unprefixed id: ${id}`);
}
if (!html.includes('class="vault-graph"')) {
  problems.push("page.html  the root element does not carry class=\"vault-graph\"");
}

/* ---- 3. script ---------------------------------------------------------- */

const js = readFileSync(join(SRC, "page.js"), "utf8");
// The one legitimate getElementById is inside the $ accessor, which adds the prefix.
const lookups = [...js.matchAll(/getElementById\(([^)]*)\)/g)].map((m) => m[1].trim());
for (const arg of lookups) {
  if (arg !== "ID + id") problems.push(`page.js  direct id lookup outside the accessor: getElementById(${arg})`);
}
if (!js.includes('var ID = "' + PREFIX + '"')) {
  problems.push("page.js  the id prefix constant is missing");
}
// A stylesheet read off the host's root would come back empty now that the tokens are ours.
if (js.includes("getComputedStyle(document.documentElement)")) {
  problems.push("page.js  reads custom properties off documentElement; the tokens are on the container");
}

/* ---- report ------------------------------------------------------------- */

if (!problems.length) {
  console.log(`check-scope: clean (${rules} css rules, ${ids.length} ids, ` +
              `${lookups.length} id lookup${lookups.length === 1 ? "" : "s"})`);
  process.exit(0);
}
console.error(`check-scope: ${problems.length} problem(s)\n`);
for (const p of problems) console.error("  " + p);
console.error(`
The page mounts inside Obsidian's own document. An unscoped rule styles the whole app, and
a bare id can hit the app's element instead of ours. Scope it under ${CLASS}, or prefix the
id with ${PREFIX} and reach it through $().`);
process.exit(1);
