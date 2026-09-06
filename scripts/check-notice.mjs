#!/usr/bin/env node
// github#58

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const notice = readFileSync(join(ROOT, "src", "engine", "NOTICE.md"), "utf8").split(/\r?\n/);
const copyright = notice.find((l) => /^Copyright \(C\) /.test(l.trim()));
if (!copyright) {
  console.error("check-notice: src/engine/NOTICE.md carries no 'Copyright (C) ...' line");
  process.exit(1);
}
const LINE = copyright.trim().replace(/\s+https?:\/\/\S+$/, "");

const problems = [];

/** @param {string} text @returns {number} */
function leadingComments(text) {
  let i = 0;
  const n = text.length;
  for (;;) {
    while (i < n && /\s/.test(text[i])) i++;
    if (text.startsWith("/*", i)) { const e = text.indexOf("*/", i + 2); if (e < 0) return n; i = e + 2; continue; }
    if (text.startsWith("//", i)) { const e = text.indexOf("\n", i); if (e < 0) return n; i = e + 1; continue; }
    return i;
  }
}
const run = (args, label) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) problems.push(label + " failed:\n" + (r.stderr || r.stdout).trim().split("\n").slice(-3).join("\n"));
  return r.status === 0;
};

/* ---- 1. the plugin bundle, freshly built ---------------------------------- */

let pluginHit = null;
if (run([join(ROOT, "scripts", "build-plugin.mjs")], "build-plugin.mjs")) {
  const main = readFileSync(join(ROOT, "main.js"), "utf8");
  const at = main.indexOf(LINE);
  pluginHit = at;
  if (at < 0) problems.push("main.js: the upstream copyright line is missing");
  else if (at > leadingComments(main) || !main.slice(0, at).includes("/*!")) problems.push("main.js: the notice is present but not in the /*! banner the file opens with (first code at byte " + leadingComments(main) + ")");
}

/* ---- 2. an exported page, freshly built from a two-note vault ------------ */

const scratch = mkdtempSync(join(tmpdir(), "vg-check-notice-"));
let pageHit = null;
try {
  const vault = join(scratch, "vault");
  mkdirSync(join(vault, ".obsidian"), { recursive: true });
  writeFileSync(join(vault, "A.md"), "---\ncreated: 2026-01-01\n---\nLinks [[B]].\n");
  writeFileSync(join(vault, "B.md"), "---\ncreated: 2026-01-02\n---\nLinks [[A]].\n");
  const out = join(scratch, "vault-graph.html");
  if (run([join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", out], "build-graph.mjs") && existsSync(out)) {
    const html = readFileSync(out, "utf8");
    const at = html.indexOf(LINE);
    pageHit = at;
    if (at < 0) problems.push("vault-graph.html: the upstream copyright line is missing");
    else {
      const open = html.lastIndexOf("<script>", at);
      const script = open < 0 ? "" : html.slice(open + "<script>".length);
      const rel = at - (open + "<script>".length);
      if (open < 0 || rel > leadingComments(script) || !script.slice(0, rel).includes("/*!")) {
        problems.push("vault-graph.html: the notice is not in the /*! banner its <script> opens with");
      }
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

/* ---- report ------------------------------------------------------------- */

if (!problems.length) {
  console.log("check-notice: clean -- \"" + LINE + "\" at byte " + pluginHit + " of main.js and byte " + pageHit + " of a fresh vault-graph.html, each in a /*! banner");
  process.exit(0);
}
console.error("check-notice: " + problems.length + " problem(s)\n");
for (const p of problems) console.error("  " + p);
console.error(`
The engine under src/engine is a port of Sigma.js (MIT), and the licence asks for its copyright
and permission notice in every copy. src/engine/notice.mjs hands it to both builds as a /*!
banner; esbuild keeps /*! comments and drops the rest, which is how it went missing once
(.ai-context/invariants.md, "The engine draws Sigma's picture"). Restore the banner rather than
this check.
`);
process.exit(1);
