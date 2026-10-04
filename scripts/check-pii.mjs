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

// github#196 -- typed entries: `email:`, `jira:`, `vault:`
const KINDS = ["email", "jira", "vault"];

const LIST = (() => {
  let from, entries;
  if (process.env.PII_NAMES) {
    from = "PII_NAMES";
    entries = process.env.PII_NAMES.split(",");
  } else {
    const f = join(ROOT, ".pii-names");
    if (!existsSync(f)) return null;
    from = ".pii-names";
    entries = readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.replace(/#.*$/, ""));
  }
  const list = { from, names: [], email: [], jira: [], vault: [] };
  for (const raw of entries.map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-z]+)\s*:\s*(.+)$/.exec(raw);
    if (!m) { list.names.push(raw); continue; }
    if (!KINDS.includes(m[1])) {
      console.error(`check-pii: unknown entry kind "${m[1]}:" in ${from} -- expected ${KINDS.join(", ")}`);
      process.exit(1);
    }
    list[m[1]].push(m[2].trim());
  }
  return list;
})();
const NAMES = LIST ? LIST.names : null;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const any = (xs) => xs.map(esc).join("|");

const PATTERNS = [
  { name: "email address",     re: /[a-zA-Z0-9._%+-]+@(?!(?:example\.|users\.noreply\.github\.com|noreply\.))[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/gi },
  { name: "atlassian host",    re: /[a-z0-9-]+\.atlassian\.net/gi },
  { name: "windows user path", re: /[A-Z]:\\Users\\[a-zA-Z0-9._-]+/g },
  { name: "vault absolute path", re: /[A-Z]:[\\/]Obsidian\b/gi },
];
if (LIST?.email.length) PATTERNS.push({ name: "work email", re: new RegExp(`[a-zA-Z0-9._%+-]+@(?:${any(LIST.email)})\\b`, "gi") });
if (LIST?.jira.length) PATTERNS.push({ name: "jira key", re: new RegExp(`\\b(?:${any(LIST.jira)})-\\d+\\b`, "g") });
if (LIST?.vault.length) PATTERNS.push({ name: "vault absolute path", re: new RegExp(`[A-Z]:[\\\\/](?:${any(LIST.vault)})\\b`, "gi") });

const MISSING = LIST ? KINDS.filter((k) => !LIST[k].length) : [];
const ALLOW_FILES = new Set([
  "scripts/check-pii.mjs",
  "LICENSE",
  "manifest.json",
  "package.json",
]);

const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".mp4", ".zip", ".ico", ".woff", ".woff2"]);

const counts = () => LIST ? KINDS.map((k) => `${LIST[k].length} ${k}`).join(", ") : "no rules";

if (argv.includes("--list")) {
  console.log("names:    " + (NAMES ? NAMES.length + " loaded from " + LIST.from : "NONE -- .pii-names missing"));
  console.log("rules:    " + counts());
  console.log("patterns: " + PATTERNS.map((p) => p.name).join(", "));
  console.log("allowed:  " + [...ALLOW_FILES].join(", "));
  process.exit(0);
}

const WARN = `
` +
  `  !! No .pii-names file and no PII_NAMES -- names were NOT checked, only patterns.\n` +
  `     Copy .pii-names.example to .pii-names and fill it in. A clean result above\n` +
  `     means the patterns found nothing, not that the text is free of names.`;

const WARN_KINDS = `
` +
  `  !! ${LIST?.from} declares no ${MISSING.join(", ")} entry -- that rule was NOT checked.\n` +
  `     See .pii-names.example for the typed lines.`;

// github#196 -- CI cannot run half the rules
if (LIST?.from === "PII_NAMES" && MISSING.length) {
  console.error(`check-pii: PII_NAMES declares no ${MISSING.join(", ")} entry -- refusing` +
    ` to pass without that rule. See .pii-names.example.`);
  process.exit(1);
}

// ---------------------------------------------------------------- the scan

const nameRes = (NAMES || []).map((n) => ({
  name: n,
  re: new RegExp("\\b" + esc(n) + "\\b", "g"),
}));

/** @param {string} line @returns {{ what: string, match: string }[]} */
function scanLine(line) {
  const out = [];
  for (const { name, re } of nameRes) {
    re.lastIndex = 0;
    if (re.test(line)) out.push({ what: "name: " + name, match: name });
  }
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(line);
    if (m) out.push({ what: name + ": " + m[0], match: m[0] });
  }
  return out;
}

// github#196 -- a control names its kind and index, never the value
const CONTROLS = [
  { label: "email address", expect: "email address", line: "write to someone@acme-corp.io" },
  { label: "atlassian host", expect: "atlassian host", line: "see acme.atlassian.net/browse" },
  { label: "windows user path", expect: "windows user path", line: "C:\\Users\\someone\\notes" },
  { label: "vault absolute path", expect: "vault absolute path", line: "open C:/Obsidian/inbox" },
  ...(LIST ? LIST.email.map((d, i) => ({ label: `email #${i + 1}`, expect: "work email", line: `mail someone.else@${d} today` })) : []),
  ...(LIST ? LIST.jira.map((k, i) => ({ label: `jira #${i + 1}`, expect: "jira key", line: `fixed in ${k}-123.` })) : []),
  ...(LIST ? LIST.vault.map((v, i) => ({ label: `vault #${i + 1}`, expect: "vault absolute path", line: `C:\\${v}\\note.md` })) : []),
  ...(NAMES || []).map((n, i) => ({ label: `name #${i + 1}`, expect: "name", line: `met ${n} today` })),
];
const uncaught = CONTROLS.filter((c) => !scanLine(c.line).some((h) => h.what.startsWith(c.expect + ": ")));
if (uncaught.length) {
  console.error(`check-pii: ${uncaught.length} negative control(s) not caught -- the rules are broken:`);
  for (const c of uncaught) console.error(`  ${c.label}`);
  process.exit(1);
}

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const files = (STAGED
  ? git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
  : git("ls-files"))
  .split("\n").map((s) => s.trim()).filter(Boolean)
  .filter((f) => !ALLOW_FILES.has(f))
  .filter((f) => { const i = f.lastIndexOf("."); return i < 0 || !SKIP_EXT.has(f.slice(i).toLowerCase()); });

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
    for (const { what } of scanLine(line)) hits.push({ file, line: i + 1, what, text: line.trim() });

  });
}

if (!hits.length) {
  const names = NAMES ? `${NAMES.length} names` : "NO NAME LIST";
  console.log(`check-pii: clean (${files.length} files, ${names}, rules ${counts()}, ` +
    `${PATTERNS.length} patterns, ${CONTROLS.length} negative controls caught)`);
  if (!NAMES) console.warn(WARN);
  else if (MISSING.length) console.warn(WARN_KINDS);
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
