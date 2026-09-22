#!/usr/bin/env node
// github#155, decisions/0016 -- N runs of one lane, reported as a spread (local)

import { readFileSync } from "node:fs";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

/** @param {number[]} xs @returns {number} */
function median(xs) {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** github#155 -- one run's stdout, reduced to what a spread is made of
 * @param {string} text
 * @returns {{ wall: number | null, passed: number, ran: number, failures: string[] }} */
export function readRun(text) {
  const lines = text.split("\n");
  // github#155 -- "  123s wall over 7 Chrome(s)", once, from the summary
  const wallLine = lines.find((l) => /^\s*\d+s wall over \d+ Chrome/.test(l));
  const wall = wallLine ? Number(/(\d+)s wall/.exec(wallLine)[1]) : null;
  // github#155 -- "   ok   131/131  <vault>" / "  FAIL  62/63  <vault>"
  let passed = 0, ran = 0;
  for (const l of lines) {
    const m = /^\s+(ok|FAIL)\s+(\d+)\/(\d+)\s+\S/.exec(l);
    if (m) { passed += Number(m[2]); ran += Number(m[3]); }
  }
  // github#155 -- " FAIL  <name> 5.0s", the per-check line
  const failures = [];
  for (const l of lines) {
    const m = /^ FAIL\s+(.+?)(?:\s+[\d.]+s)?\s*$/.exec(l);
    if (m) failures.push(m[1].trim());
  }
  return { wall, passed, ran, failures };
}

// github#155 -- the CLI, so the selftest can import readRun
function main(files) {
  const runs = files.map((f, i) => ({ n: i + 1, file: f, ...readRun(readFileSync(f, "utf8")) }));
  const green = runs.filter((r) => r.ran > 0 && r.passed === r.ran);
  const walls = runs.map((r) => r.wall).filter((w) => typeof w === "number");

  console.log("run   wall   passed   failed checks");
  for (const r of runs) {
    const failed = r.ran - r.passed;
    console.log(
      String(r.n).padStart(3) + "  " +
      (r.wall === null ? "   ?" : (r.wall + "s").padStart(5)) + "   " +
      (r.ran ? `${r.passed}/${r.ran}` : "  no run").padStart(8) + "   " +
      (failed > 0 ? r.failures.join("; ") || `${failed} unnamed` : "")
    );
  }

  console.log("");
  if (walls.length) {
    console.log(`wall: min ${Math.min(...walls)}s  median ${median(walls)}s  max ${Math.max(...walls)}s` +
                `  spread ${(Math.max(...walls) / Math.max(1, Math.min(...walls))).toFixed(2)}x`);
  }
  console.log(`green: ${green.length} of ${runs.length} run(s)`);

  // github#155 -- every run is a real difference; some runs is flake
  const seen = new Map();
  for (const r of runs) for (const f of new Set(r.failures)) seen.set(f, (seen.get(f) || 0) + 1);
  if (seen.size) {
    console.log("");
    console.log("checks that failed at least once:");
    for (const [name, n] of [...seen].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}/${runs.length}  ${name}` +
                  (n === runs.length ? "   (every run -- a real difference, not flake)" : ""));
    }
  }

  // github#155 -- the ask is TWENTY runs; fewer proves nothing
  const ASKED = 20;
  console.log("");
  if (green.length !== runs.length) {
    console.log("NOT stable here. Do not require this lane, and do not move a threshold to make it pass.");
  } else if (runs.length < ASKED) {
    console.log(`All ${runs.length} run(s) green, but github#155 asks for ${ASKED}. ` +
                "Not enough to require anything on.");
  } else {
    console.log(`All ${runs.length} runs green. That is the evidence for requiring this lane -- ` +
                "the decision is still a human's.");
  }
}

// github#155 -- run only when invoked directly, not when imported
if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const files = argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!files.length) {
    console.error("usage: node scripts/soak-report.mjs <run-1.txt> <run-2.txt> ...");
    process.exit(2);
  }
  main(files);
}
