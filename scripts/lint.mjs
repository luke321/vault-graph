// `npm run lint`: eslint over our own code, with the one gate eslint alone cannot express.
//
// EVERY FINDING IS ZERO NOW -- errors and warnings alike -- so the gate is simply "nothing at
// all". eslint's own `--max-warnings 0` would express that; this wrapper stays because the
// formatter it drives is what makes a failing run readable, and because "no findings" is a
// claim worth stating in one line rather than inferring from silence.
//
// IT WAS NOT ALWAYS THIS SIMPLE. The five type-aware no-unsafe-* rules (the "meter", see
// lint-summary.mjs) fired 6,977 times when they were first switched on -- 510 in
// plugin/main.js, 6,467 in src/page.js -- far too many to be errors, so they ran as warnings
// under `--budget N` held at exactly the measured count, failing in EITHER direction: a new
// finding failed the push, and taking one off meant lowering N in the same commit. That made
// the number a ratchet rather than a ceiling, and github#60 walked it down to zero in eleven
// batches on 2026-09-04. With the count at zero the budget says nothing "error" does not say
// better, so eslint.config.mjs sets the five to error and the budget is gone. A `--budget`
// argument is still accepted and ignored, so an old hook or script does not break on it.
//
// Runs eslint through its Node API so the same results feed the formatter and the gate; the
// scope (plugin, src, scripts) and the config are the ones eslint.config.mjs describes.

import { ESLint } from "eslint";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE = ["plugin", "src", "scripts"];

const eslint = new ESLint({ cwd: ROOT });
const results = await eslint.lintFiles(SCOPE);
const formatter = await eslint.loadFormatter("./scripts/lint-summary.mjs");
process.stdout.write(await formatter.format(results));

let errors = 0, warnings = 0;
for (const r of results) for (const m of r.messages) {
  if (m.severity === 2) errors++; else warnings++;
}

if (errors || warnings) {
  const parts = [];
  if (errors) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  console.log(`\nlint: FAIL -- ${parts.join(", ")}; this repo holds every finding at zero`);
  process.exit(1);
}
console.log("lint: ok -- 0 errors, 0 warnings");
