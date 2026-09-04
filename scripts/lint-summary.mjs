// The lint formatter: every finding in full, except the meter, which is counted.
//
// Five type-aware rules -- @typescript-eslint/no-unsafe-* -- run on the plugin and the page
// as warnings because the Obsidian directory's review runs them on every published version
// (github#55). They fire ~7,000 times on code that was never typed, and a run that prints
// 7,000 lines is a run nobody reads -- a handful of actionable findings would vanish into it
// and the lint would go back to being ignored. This formatter prints the actionable ones the
// way eslint would, and reduces the five to per-rule and per-file counts plus the budget line.
//
// THE BUDGET is `--max-warnings N` in package.json's lint script, held at exactly the
// measured total: any new warning of any kind fails the gate, and lowering N is a deliberate
// edit with the new number. eslint enforces it; this just shows where the count stands, so
// whoever is about to bump N can see what it was and why. Read from argv because eslint
// only hands a formatter the limit once it has been exceeded.
//
// Node built-ins only, like every script here. Loaded by eslint via `-f ./scripts/...`.

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

function maxWarningsFromArgv(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max-warnings" && argv[i + 1] !== undefined) return Number(argv[i + 1]);
    if (a.startsWith("--max-warnings=")) return Number(a.slice("--max-warnings=".length));
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
  const budget = maxWarningsFromArgv(process.argv);
  if (budget !== null && Number.isFinite(budget)) {
    const head = budget - warnings;
    out.push(`budget: --max-warnings ${budget} · warnings ${warnings} · ${head >= 0 ? `headroom ${head}` : `OVER BY ${-head}`}`);
  }
  out.push(`${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}` +
           (metered ? ` (${metered} on the meter, ${warnings - metered} elsewhere)` : ""));
  return out.join("\n") + "\n";
}
