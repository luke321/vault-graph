#!/usr/bin/env node
// Assert the synthetic vault generators produce the same folder/subfolder note COUNTS no
// matter which real calendar day they're run on.
//
//   node scripts/check-generator-determinism.mjs
//
// WHY THIS EXISTS. make-demo-vault.mjs and make-shape-vault.mjs both default their `--end`
// date to today, deliberately (so the heatmap's last-52-weeks window has notes in it --
// see make-demo-vault.mjs's own header). That's a real day-to-day difference in the
// generated output, and chasing what it does or doesn't affect by re-reasoning about it
// from scratch is exactly the kind of thing this repo's own convention says to measure
// instead (github#31/#32 both cost real time to a layout difference that turned out to
// have nothing to do with which day the fixture was built). This makes the actual claim
// -- that structure is unaffected, only the calendar labels shift -- a permanent, gated
// fact instead of something re-derived by hand each time it's in doubt.
//
// NOT covered: make-mirror-vault.mjs, deliberately -- it reproduces a REAL vault's own
// structure and dates rather than generating synthetic ones, so "does the generation day
// change the structure" isn't a question that applies to it.
//
// Each generator is run twice, `--end` dates chosen far enough apart (different year,
// different month, different quarter) that a real day-dependence would have to show up
// somewhere. The comparison is FOLDER/SUBFOLDER NOTE COUNTS -- not file contents, which
// are expected to differ (titles, frontmatter dates, links) -- because that's the thing
// `buildWedgePlan`'s row/band math actually reads.

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
  // try/finally, not a trailing cleanup line -- a thrown fs error while walking a freshly
  // written tree (countTree) would otherwise skip cleanup entirely and leak both temp
  // vaults into %TEMP% on every run that hits it.
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
