// github#60
// github#58

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
