// `npm run lint`: eslint over our own code, with two gates eslint alone cannot express.
//
// eslint's own `--max-warnings N` gates one number, the total. That leaves a hole this repo
// would fall into: the five no-unsafe-* rules (the "meter", see lint-summary.mjs) are ~7,000
// warnings on purpose, so if a later change takes ten of them away without lowering N, ten NEW
// warnings of any other kind pass inside the headroom -- an unused value, an undefined name --
// and the lint is back to being ignored, this time with a green tick. Hence this wrapper:
//
//   1. errors: zero.
//   2. actionable warnings -- every warning that is NOT one of the five meter rules: zero.
//   3. the meter: EXACTLY --budget. Not at most: a count below the budget means somebody typed
//      something and did not record it, and the budget would quietly stop describing the code.
//      Whoever takes findings off the meter lowers --budget in package.json in the same commit;
//      whoever adds one either types it or raises the budget knowingly, with the new number.
//
// Rule 3 is what makes the budget an invariant rather than a ceiling -- .ai-context/invariants.md
// ("The lint warning count does not grow") records the figure, and this is what keeps that file
// and the code in step. github#55, Phase 0.
//
// Runs eslint through its Node API so the same results feed the formatter and the gate; the
// scope (plugin, src, scripts) and the config are the ones eslint.config.mjs describes.

import { ESLint } from "eslint";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { METER_RULES } from "./lint-summary.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE = ["plugin", "src", "scripts"];

function budgetFromArgv(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--budget" && argv[i + 1] !== undefined) return Number(argv[i + 1]);
    if (argv[i].startsWith("--budget=")) return Number(argv[i].slice("--budget=".length));
  }
  return null;
}

const budget = budgetFromArgv(process.argv);
if (budget === null || !Number.isInteger(budget) || budget < 0) {
  console.error("lint: pass --budget <N>, the meter count recorded in package.json");
  process.exit(2);
}

const eslint = new ESLint({ cwd: ROOT });
const results = await eslint.lintFiles(SCOPE);
const formatter = await eslint.loadFormatter("./scripts/lint-summary.mjs");
process.stdout.write(await formatter.format(results));

const meter = new Set(METER_RULES);
let errors = 0, actionable = 0, metered = 0;
for (const r of results) for (const m of r.messages) {
  if (m.severity === 2) errors++;
  else if (meter.has(m.ruleId)) metered++;
  else actionable++;
}

const failures = [];
if (errors) failures.push(`${errors} error${errors === 1 ? "" : "s"}`);
if (actionable) failures.push(`${actionable} actionable warning${actionable === 1 ? "" : "s"} -- these are held at zero`);
if (metered !== budget) {
  failures.push(metered > budget
    ? `meter at ${metered}, budget ${budget}: ${metered - budget} new no-unsafe finding${metered - budget === 1 ? "" : "s"} -- type the value, or raise --budget in package.json knowingly`
    : `meter at ${metered}, budget ${budget}: the count fell by ${budget - metered} -- lower --budget in package.json to ${metered} so the budget keeps describing the code`);
}
if (failures.length) {
  console.log(`\nlint: FAIL -- ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`lint: ok -- 0 errors, 0 actionable warnings, meter ${metered} = budget`);
