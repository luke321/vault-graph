#!/usr/bin/env node
// github#61

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const rootArg = argv.indexOf("--root");
const ROOT = rootArg >= 0 ? resolve(argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["plugin", "src", "scripts"];
const JS_EXT = /\.(m?js|ts)$/;
const CSS_EXT = /\.css$/;

// github#61, github#174, github#188
const BASELINE = 350;

const VERBOSE = argv.includes("--verbose");
const LIST = argv.includes("--list");
const SELFTEST = argv.includes("--selftest");

const POINTER = /^(github#\d+|decisions\/\d{4}|design\/\d{4})(\s*[,;]\s*(github#\d+|decisions\/\d{4}|design\/\d{4}))*(\s*(--|-|:|\u2014)\s*.{1,60})?$/;
const JSDOC_TAG = /^\*?\s*@(param|returns?|typedef|property|type|callback|template|this|import)\b/;
const DIRECTIVE = /^(eslint-|@ts-|prettier-|BEGIN:|END:|---- (BEGIN|END))/;
const BANNER = /^[-=]{4,}|[-=]{8,}/;

function walk(dir, acc, allowCss) {
  for (const entry of readdirSync(dir).sort()) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc, allowCss);
    else if (JS_EXT.test(entry) || (allowCss && CSS_EXT.test(entry))) acc.push(p);
  }
  return acc;
}

// github#177 -- CSS mode: block comments and strings only, no // or regex
/** @param {string} src @param {"js"|"css"} mode @returns {{ kind: string, text: string, line: number }[]} */
function comments(src, mode) {
  const out = [];
  const n = src.length;
  let i = 0, line = 1, prevSig = "";
  const push = (kind, text, at) => out.push({ kind, text, line: at });
  while (i < n) {
    const ch = src[i], nx = src[i + 1];
    if (ch === "\n") { line++; i++; continue; }
    if (mode === "js" && ch === "/" && nx === "/") {
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
    if (mode === "css" && (ch === '"' || ch === "'")) {
      const q = ch;
      let j = i + 1;
      while (j < n) {
        const c = src[j];
        if (c === "\\") { j += 2; continue; }
        if (c === q) break;
        if (c === "\n") line++;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (mode === "js" && (ch === '"' || ch === "'" || ch === "`")) {
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
    if (mode === "js" && ch === "/" && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prevSig) && !/[)\]\w$]/.test(prevSig)) {
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

// github#177
function selftest() {
  let failed = 0;
  /** @param {string} name @param {boolean} ok @param {string} [detail] */
  const check = (name, ok, detail) => {
    console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + (detail ? "   (" + detail + ")" : ""));
    if (!ok) failed++;
  };
  const bad = (src, mode) => comments(src, mode).filter(offending);

  check("css: a url() value is not a comment",
        comments('a { background: url(https://example.test/x.png); }', "css").length === 0);
  check("css: calc(a / b) followed by a block comment still sees the block comment",
        bad('.x { width: calc(100% / 3); /* the reasoning here */ }', "css").length === 1);
  check("css: a pointer block comment passes",
        bad('/* github#177 */\n.y { color: red; }', "css").length === 0);
  check("css: a prose block comment fails",
        bad('/* just some prose here */\n.z { color: blue; }', "css").length === 1);
  check("css: a string literal's // is not a comment",
        comments('a::before { content: "http://example.test"; }', "css").length === 0);

  check("js: a // line comment is still tokenized",
        bad("const x = 1; // prose here", "js").length === 1);
  check("js: a /* pointer */ block comment still passes",
        bad("/* github#61 */\nconst y = 2;", "js").length === 0);
  check("js: a regex literal after a binary operator is still consumed, not read as CSS-string-less prose",
        bad("const r = a % /ab/.test(b); // prose", "js").length === 1);

  console.log(failed ? "\ncheck-comments selftest: " + failed + " FAILED" : "\ncheck-comments selftest: all passed");
  return failed ? 1 : 0;
}

if (SELFTEST) process.exit(selftest());

const files = DIRS.flatMap((d) => walk(join(ROOT, d), [], d === "src"));
let total = 0;
const rows = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const mode = CSS_EXT.test(f) ? "css" : "js";
  const bad = comments(src, mode).filter(offending);
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
