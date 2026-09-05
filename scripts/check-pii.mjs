#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const STAGED = argv.includes("--staged");
const NUL = String.fromCharCode(0);

// ---------------------------------------------------------------- the rules

const NAMES = (() => {
  if (process.env.PII_NAMES) {
    return process.env.PII_NAMES.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const f = join(ROOT, ".pii-names");
  if (!existsSync(f)) return null;
  return readFileSync(f, "utf8")
    .split(/\r?\n/)
    .map((s) => s.replace(/#.*$/, "").trim())
    .filter(Boolean);
})();

const PATTERNS = [
  { name: "work email",        re: /[a-zA-Z0-9._%+-]+@humaneticsgroup\.com/gi },
  { name: "jira key",          re: /\b(?:TC|ASTBSPD)-\d+\b/g },
  { name: "atlassian host",    re: /[a-z0-9-]+\.atlassian\.net/gi },
  { name: "windows user path", re: /[A-Z]:\\Users\\[a-zA-Z0-9._-]+/g },
  { name: "vault absolute path", re: /[A-Z]:[\\/](?:SecondBrain|Obsidian)\b/gi },
];

const ALLOW_FILES = new Set([
  "scripts/check-pii.mjs",
  "LICENSE",
  "manifest.json",
  "package.json",
]);

const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".mp4", ".zip", ".ico", ".woff", ".woff2"]);

if (argv.includes("--list")) {
  console.log("names:    " + (NAMES ? NAMES.length + " loaded from .pii-names" : "NONE -- .pii-names missing"));
  console.log("patterns: " + PATTERNS.map((p) => p.name).join(", "));
  console.log("allowed:  " + [...ALLOW_FILES].join(", "));
  process.exit(0);
}

const WARN = `
` +
  `  !! No .pii-names file and no PII_NAMES -- names were NOT checked, only patterns.\n` +
  `     Copy .pii-names.example to .pii-names and fill it in. A clean result above\n` +
  `     means the patterns found nothing, not that the text is free of names.`;

// ---------------------------------------------------------------- the scan

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const files = (STAGED
  ? git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
  : git("ls-files"))
  .split("\n").map((s) => s.trim()).filter(Boolean)
  .filter((f) => !ALLOW_FILES.has(f))
  .filter((f) => { const i = f.lastIndexOf("."); return i < 0 || !SKIP_EXT.has(f.slice(i).toLowerCase()); });

const nameRes = (NAMES || []).map((n) => ({
  name: n,
  re: new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"),
}));

const hits = [];

for (const file of files) {
  for (const { name, re } of nameRes) {
    re.lastIndex = 0;
    if (re.test(file)) hits.push({ file, line: 0, what: "name in path: " + name, text: file });
  }
}

for (const file of files) {
  const abs = join(ROOT, file);
  if (!existsSync(abs) || statSync(abs).isDirectory()) continue;
  let text;
  try { text = readFileSync(abs, "utf8"); } catch { continue; }
  if (text.slice(0, 4096).includes(NUL)) continue;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const { name, re } of nameRes) {
      re.lastIndex = 0;
      if (re.test(line)) hits.push({ file, line: i + 1, what: "name: " + name, text: line.trim() });
    }
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      const m = re.exec(line);
      if (m) hits.push({ file, line: i + 1, what: name + ": " + m[0], text: line.trim() });
    }
  });
}

if (!hits.length) {
  const names = NAMES ? `${NAMES.length} names` : "NO NAME LIST";
  console.log(`check-pii: clean (${files.length} files, ${names}, ${PATTERNS.length} patterns)`);
  if (!NAMES) console.warn(WARN);
  process.exit(0);
}

console.error(`check-pii: ${hits.length} hit(s) -- this repo is PUBLIC\n`);
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  [${h.what}]`);
  console.error(`    ${h.text.slice(0, 120)}`);
}
console.error(`
Fix the text, or -- if the hit is legitimate -- add the file to ALLOW_FILES in
scripts/check-pii.mjs with a comment saying why. Do not delete the name from the deny
list to make the check pass; that is how the leak got out the first time.`);
process.exit(1);
