#!/usr/bin/env node
// github#61

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const rootArg = argv.indexOf("--root");
const ROOT = rootArg >= 0 ? resolve(argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["plugin", "src", "scripts"];
const EXT = /\.(m?js|ts)$/;

// github#61
const BASELINE = 384;

const VERBOSE = argv.includes("--verbose");
const LIST = argv.includes("--list");

const POINTER = /^(github#\d+|decisions\/\d{4}|design\/\d{4})(\s*[,;]\s*(github#\d+|decisions\/\d{4}|design\/\d{4}))*(\s*(--|-|:|\u2014)\s*.{1,60})?$/;
const JSDOC_TAG = /^\*?\s*@(param|returns?|typedef|property|type|callback|template|this|import)\b/;
const DIRECTIVE = /^(eslint-|@ts-|prettier-|BEGIN:|END:|---- (BEGIN|END))/;
const BANNER = /^[-=]{4,}|[-=]{8,}/;

function walk(dir, acc) {
  for (const entry of readdirSync(dir).sort()) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (EXT.test(entry)) acc.push(p);
  }
  return acc;
}

/** @param {string} src @returns {{ kind: string, text: string, line: number }[]} */
function comments(src) {
  const out = [];
  const n = src.length;
  let i = 0, line = 1, prevSig = "";
  const push = (kind, text, at) => out.push({ kind, text, line: at });
  while (i < n) {
    const ch = src[i], nx = src[i + 1];
    if (ch === "\n") { line++; i++; continue; }
    if (ch === "/" && nx === "/") {
      let j = i + 2;
      while (j < n && src[j] !== "\n") j++;
      push("line", src.slice(i + 2, j), line);
      i = j;
      continue;
    }
    if (ch === "/" && nx === "*") {
      const bang = src[i + 2] === "!";
      const doc = src[i + 2] === "*" && src[i + 3] !== "/";
      let j = i + 2;
      while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
      const body = src.slice(i, j + 2);
      let at = line;
      for (const l of body.split("\n")) { push(bang ? "bang" : doc ? "doc" : "block", l, at); at++; }
      line += body.split("\n").length - 1;
      i = j + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      let j = i + 1, depth = 0;
      while (j < n) {
        const c = src[j];
        if (c === "\\") { j += 2; continue; }
        if (q === "`" && c === "$" && src[j + 1] === "{") { depth++; j += 2; continue; }
        if (q === "`" && depth && c === "}") { depth--; j++; continue; }
        if (c === q && !depth) break;
        if (c === "\n") line++;
        j++;
      }
      i = j + 1;
      prevSig = q;
      continue;
    }
    if (ch === "/" && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prevSig) && !/[)\]\w$]/.test(prevSig)) {
      let j = i + 1, cls = false;
      while (j < n) {
        const c = src[j];
        if (c === "\\") { j += 2; continue; }
        if (c === "\n") break;
        if (c === "[") cls = true;
        else if (c === "]") cls = false;
        else if (c === "/" && !cls) break;
        j++;
      }
      i = j + 1;
      prevSig = "/";
      continue;
    }
    if (!/\s/.test(ch)) prevSig = ch;
    i++;
  }
  return out;
}

function offending(c) {
  let t = c.text.trim();
  if (c.kind === "bang") return false;
  if (c.kind === "line") {
    if (t.startsWith("/") && c.line === 1) return false;
    t = t.replace(/^\/\s*/, "");
    if (!t) return false;
    if (POINTER.test(t) || DIRECTIVE.test(t)) return false;
    return true;
  }
  t = t.replace(/^\/\*\*?/, "").replace(/\*\/$/, "").trim();
  if (!t || t === "*") return false;
  if (c.kind === "doc") {
    if (JSDOC_TAG.test(t)) return false;
    const inner = t.replace(/^\*\s*/, "");
    if (!inner || POINTER.test(inner)) return false;
    return true;
  }
  const inner = t.replace(/^\*\s*/, "");
  if (!inner || POINTER.test(inner) || DIRECTIVE.test(inner) || BANNER.test(inner)) return false;
  return true;
}

const files = DIRS.flatMap((d) => walk(join(ROOT, d), []));
let total = 0;
const rows = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const bad = comments(src).filter(offending);
  total += bad.length;
  const rel = relative(ROOT, f).split("\\").join("/");
  if (bad.length || VERBOSE) rows.push([rel, bad.length]);
  if (LIST) for (const b of bad) console.log(rel + ":" + b.line + "  " + b.text.trim().slice(0, 100));
}
rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
for (const [rel, k] of rows) console.log("  " + String(k).padStart(5) + "  " + rel);
console.log("check-comments: " + total + " comment line(s) that are neither a pointer nor a type annotation across " + files.length + " files (baseline " + BASELINE + ")");
if (total > BASELINE) {
  console.error("\ncheck-comments: " + (total - BASELINE) + " over the baseline. Comments in plugin/, src/ and scripts/ are pointers --\n" +
                "a bare github#N, decisions/NNNN or design/NNNN -- and the reasoning goes to .ai-context/ (CONTRIBUTING.md, github#61).\n" +
                "Run with --list to see each line.");
  process.exit(1);
}
if (total < BASELINE) {
  console.error("\ncheck-comments: " + (BASELINE - total) + " under the baseline -- lower BASELINE in scripts/check-comments.mjs to " + total + " in this commit, so it cannot creep back.");
  process.exit(1);
}
process.exit(0);
