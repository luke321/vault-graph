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
//
// TYPECHECK FIRST (github#58). src/engine is TypeScript, and a type error in it is the same
// kind of finding as a lint error -- so `tsc --noEmit` over tsconfig.engine.json runs here,
// ahead of eslint, and the hook and release.ps1 inherit it through `npm run lint` without a
// second entry. That config is the engine alone under `strict`; the shared tsconfig.json the
// lint rules read stays non-strict for the reasons written in both files. Fails closed like
// the rest of this file: a checkout without node_modules has no tsc, and a gate that skips
// when its tool is missing is the gate that runs when someone remembers.

import { ESLint } from "eslint";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE = ["plugin", "src", "scripts"];

const TSC = join(ROOT, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(TSC)) {
  console.log("typecheck: FAIL -- node_modules/typescript is missing; run npm ci");
  process.exit(1);
}
const tsc = spawnSync(process.execPath, [TSC, "--noEmit", "-p", join(ROOT, "tsconfig.engine.json")],
                      { cwd: ROOT, encoding: "utf8" });
if (tsc.stdout) process.stdout.write(tsc.stdout);
if (tsc.stderr) process.stderr.write(tsc.stderr);
if (tsc.status !== 0) {
  console.log("typecheck: FAIL -- tsc --noEmit reported the errors above");
  process.exit(1);
}
console.log("typecheck: ok -- tsc --noEmit clean");

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
