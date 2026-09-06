#!/usr/bin/env node

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

const ALLOWED_REACHES = new Set(["document.createElement", "document.title"]);
const reaches = [...js.matchAll(/\bdocument\.[A-Za-z_$][\w$]*/g)].map((m) => m[0]);
for (const r of [...new Set(reaches)]) {
  if (!ALLOWED_REACHES.has(r)) problems.push(`page.js  reaches the host document: ${r}`);
}

if (!js.includes('var $ = function (id) { return root.querySelector("#" + ID + id); };')) {
  problems.push("page.js  the $ accessor is not the root-scoped form");
}
if (!js.includes('var ID = "' + PREFIX + '"')) {
  problems.push("page.js  the id prefix constant is missing");
}
if (!/export \{[^}]*mountVaultGraph[^}]*\}/.test(js)) {
  problems.push("page.js  does not export mountVaultGraph");
}
const lookups = reaches;

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
