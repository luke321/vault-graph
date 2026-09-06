#!/usr/bin/env node
// github#31

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const GENERATORS = [
  { script: "make-demo-vault.mjs", args: ["--notes", "400"] },
  { script: "make-shape-vault.mjs", args: [] },
];
const END_A = "2024-02-10";
const END_B = "2027-09-28";

function countTree(dir) {
  const counts = {};
  (function walk(d) {
    for (const name of readdirSync(d)) {
      if (name === ".obsidian") continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!name.endsWith(".md")) continue;
      const rel = relative(dir, dirname(p)) || ".";
      counts[rel] = (counts[rel] || 0) + 1;
    }
  })(dir);
  return counts;
}

function diffCounts(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs = [];
  for (const k of [...keys].sort()) {
    if ((a[k] || 0) !== (b[k] || 0)) diffs.push(`${k}: ${a[k] || 0} vs ${b[k] || 0}`);
  }
  return diffs;
}

const problems = [];
for (const g of GENERATORS) {
  const outA = mkdtempSync(join(tmpdir(), "vg-detA-"));
  const outB = mkdtempSync(join(tmpdir(), "vg-detB-"));
  try {
    const base = [join(HERE, g.script), ...g.args];
    const rA = spawnSync(process.execPath, [...base, "--out", outA, "--end", END_A],
                          { stdio: ["ignore", "ignore", "inherit"] });
    const rB = spawnSync(process.execPath, [...base, "--out", outB, "--end", END_B],
                          { stdio: ["ignore", "ignore", "inherit"] });
    if (rA.status !== 0 || rB.status !== 0) {
      problems.push(`${g.script}: generation failed (status ${rA.status}/${rB.status})`);
    } else {
      const countsA = countTree(outA);
      const diffs = diffCounts(countsA, countTree(outB));
      if (diffs.length) {
        problems.push(`${g.script}: ${diffs.length} folder(s) differ between --end ${END_A} ` +
          `and --end ${END_B}:\n    ` + diffs.slice(0, 10).join("\n    ") +
          (diffs.length > 10 ? `\n    ...and ${diffs.length - 10} more` : ""));
      } else {
        const total = Object.values(countsA).reduce((s, n) => s + n, 0);
        console.log(`check-generator-determinism: ${g.script} clean (${total} notes, ` +
          `${Object.keys(countsA).length} folders, identical at both end dates)`);
      }
    }
  } finally {
    for (const dir of [outA, outB]) if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

if (!problems.length) process.exit(0);
console.error(`\ncheck-generator-determinism: ${problems.length} problem(s)\n`);
for (const p of problems) console.error("  " + p);
console.error(`
A generator's per-folder note counts should depend only on --seed, never on --end -- END
anchors WHICH CALENDAR DATES the notes get, not which folder/subfolder they land in (that's
a separate, --end-independent seeded draw). If this fails, something added a real dependency
on the generation day to note placement, which will make any layout measurement taken from
these fixtures non-reproducible depending on when it was built.`);
process.exit(1);
