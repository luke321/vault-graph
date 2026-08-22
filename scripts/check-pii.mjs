#!/usr/bin/env node
// Refuse to publish other people's names.
//
//   node scripts/check-pii.mjs              # scan tracked files, exit 1 on a hit
//   node scripts/check-pii.mjs --staged     # scan what is about to be committed
//   node scripts/check-pii.mjs --list       # show the rules and stop
//
// WHY THIS EXISTS. This repo is developed against a real personal vault and is now
// public. Two leaks got through before anyone looked: a design record naming seven
// colleagues with a note count each, and a code comment carrying a colleague's full name
// as an example. Neither was malicious and neither was noticed for weeks -- which is
// exactly the failure mode a checklist does not fix and a check does.
//
// WHAT IT IS NOT. Not a general PII detector; those are unreliable and this needs to be
// trustworthy enough to gate a push. It answers one narrow question -- does this text
// contain a name from the deny list, or something shaped like the identifiers that have
// leaked before. False negatives are expected. False positives are the thing to avoid,
// because a noisy gate gets bypassed.
//
// The deny list holds first names as well as full ones, deliberately: they are the vault's
// own colleagues, and "just a first name" next to a repository about somebody's personal
// notes is more identifying than a first name on its own.
//
// The list itself is NOT in this repository -- see below.

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

// THE DENY LIST LIVES OUTSIDE THE REPOSITORY.
//
// It was an inline array first, with a comment calling the irony "real but acceptable":
// anyone who can read the list can already read the repo. That reasoning collapsed the
// moment the history was rewritten to remove those very names -- purging ten names from
// every commit while publishing all ten of them, permanently, in the file doing the
// purging. A checker that leaks what it checks for is worse than no checker.
//
// So: one name per line in `.pii-names` at the repo root, which is gitignored. See
// .pii-names.example. PII_NAMES=a,b,c overrides it, for CI or a one-off run.
//
// MISSING IS LOUD, NOT SILENT. Without the file the patterns still run, but the check says
// so on every invocation -- a gate that quietly degrades to "clean" is the failure mode
// this whole file exists to prevent.
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

// Things that are identifiers rather than names.
const PATTERNS = [
  { name: "work email",        re: /[a-zA-Z0-9._%+-]+@humaneticsgroup\.com/gi },
  { name: "jira key",          re: /\b(?:TC|ASTBSPD)-\d+\b/g },
  { name: "atlassian host",    re: /[a-z0-9-]+\.atlassian\.net/gi },
  { name: "windows user path", re: /[A-Z]:\\Users\\[a-zA-Z0-9._-]+/g },
  { name: "vault absolute path", re: /[A-Z]:[\\/](?:SecondBrain|Obsidian)\b/gi },
];

// Files that are allowed to contain a name: this checker itself, and the licence, which
// names the copyright holder on purpose.
const ALLOW_FILES = new Set([
  "scripts/check-pii.mjs",
  "LICENSE",
  "manifest.json",     // the plugin author field
  "package.json",
]);

// Binary and generated files: scanning them produces noise, and none of them is
// hand-written text where a name could be smuggled in.
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

// A name only counts as a hit when it stands as a word: "Ada" must not fire on "adapter".
// And word boundaries alone are not enough, because a name can also BE an ordinary word --
// so the match is case-SENSITIVE, on the reasoning that a real name in prose is
// capitalised while an identifier or a colour keyword is not.
//
// (The examples here were real first names until they were noticed in a verification pass:
// this file is on the allowlist, so the gate cannot catch its own comments. Illustrating a
// name rule with a real name is the third time that shape of mistake has appeared.)
const nameRes = (NAMES || []).map((n) => ({
  name: n,
  re: new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"),
}));

const hits = [];

// PATHS FIRST, because a name hides there just as easily -- and this check missed exactly
// that once already. A hand grep over file CONTENTS reported "clean" on a generated vault
// whose DIRECTORY NAMES carried two colleagues' names. Contents are the obvious place to
// look and not the only one.
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
  // A NUL in the first chunk means binary that slipped past the extension list. Built
  // with fromCharCode rather than written as a literal or an escape: this line has now
  // been mangled twice -- once into a literal control character that made the file
  // binary to git, once into an empty string that made the check skip every file and
  // report clean. A named constant cannot be silently corrupted by a tool.
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
