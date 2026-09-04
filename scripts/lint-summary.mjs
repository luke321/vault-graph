// The lint formatter: every finding in full, except the meter, which is counted.
//
// Five type-aware rules -- @typescript-eslint/no-unsafe-* -- run on the plugin and the page
// as warnings because the Obsidian directory's review runs them on every published version
// (github#55). They fire ~7,000 times on code that was never typed, and a run that prints
// 7,000 lines is a run nobody reads -- a handful of actionable findings would vanish into it
// and the lint would go back to being ignored. This formatter prints the actionable ones the
// way eslint would, and reduces the five to per-rule and per-file counts plus the budget line.
//
// THE BUDGET is `--budget N` in package.json's lint script, held at exactly the measured
// total: scripts/lint.mjs fails the run when the meter differs from N in either direction,
// and when any warning outside the meter appears at all. This formatter only shows where the
// count stands, so whoever is about to change N sees what it was and why. Read from argv
// because the wrapper is the process this runs in (eslint's own `--max-warnings` is read too,
// for a bare `eslint -f ./scripts/lint-summary.mjs` run).
//
// Node built-ins only, like every script here. Loaded by scripts/lint.mjs, or by eslint
// directly via `-f ./scripts/lint-summary.mjs`.

import { relative } from "node:path";

// The meter. eslint.config.mjs imports this list rather than repeating it, so the rules
// that are counted here are exactly the rules that are set to warn there.
export const METER_RULES = [
  "@typescript-eslint/no-unsafe-assignment",
  "@typescript-eslint/no-unsafe-member-access",
  "@typescript-eslint/no-unsafe-call",
  "@typescript-eslint/no-unsafe-argument",
  "@typescript-eslint/no-unsafe-return",
];

function budgetFromArgv(argv) {
  for (const flag of ["--budget", "--max-warnings"]) {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === flag && argv[i + 1] !== undefined) return Number(argv[i + 1]);
      if (a.startsWith(flag + "=")) return Number(a.slice(flag.length + 1));
    }
  }
  return null;
}

export default function summarise(results, context) {
  const cwd = (context && context.cwd) || process.cwd();
  const meter = new Set(METER_RULES);
  const lines = [];
  const perRule = new Map();
  const perFile = new Map();
  let errors = 0, warnings = 0, metered = 0;

  for (const r of results) {
    const file = relative(cwd, r.filePath).split("\\").join("/");
    for (const m of r.messages) {
      if (m.severity === 2) errors++; else warnings++;
      if (meter.has(m.ruleId)) {
        metered++;
        perRule.set(m.ruleId, (perRule.get(m.ruleId) || 0) + 1);
        perFile.set(file, (perFile.get(file) || 0) + 1);
        continue;
      }
      const sev = m.fatal || m.severity === 2 ? "error" : "warning";
      lines.push(`${file}:${m.line}:${m.column}  ${sev}  ${m.message}${m.ruleId ? `  (${m.ruleId})` : ""}`);
    }
  }

  const out = [];
  if (lines.length) { out.push(...lines, ""); }
  if (metered) {
    const rules = METER_RULES.filter((k) => perRule.has(k))
      .map((k) => `${k.replace("@typescript-eslint/no-unsafe-", "")} ${perRule.get(k)}`).join(" · ");
    const files = [...perFile.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(", ");
    out.push(`no-unsafe meter (warned, counted, not listed): ${rules}`);
    out.push(`  by file: ${files}`);
  }
  const budget = budgetFromArgv(process.argv);
  if (budget !== null && Number.isFinite(budget)) {
    const diff = metered - budget;
    out.push(`budget: ${budget} · meter ${metered} · ${diff === 0 ? "exact" : diff > 0 ? `OVER BY ${diff}` : `UNDER BY ${-diff}`}`);
  }
  out.push(`${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}` +
           (metered ? ` (${metered} on the meter, ${warnings - metered} elsewhere)` : ""));
  return out.join("\n") + "\n";
}
