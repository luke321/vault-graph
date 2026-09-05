#!/usr/bin/env node
// github#23

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

if (argv.includes("--vault")) {
  console.error(
    "make-demo-vault no longer takes --vault: the demo vault is a fixed invented structure\n" +
    "rather than a mirror of a real one. See the header of this file.\n" +
    "\n" +
    "For a mirror of your OWN vault -- which is what a layout bug report wants, since the\n" +
    "shape is the report -- that capability moved rather than went:\n" +
    "  node scripts/make-mirror-vault.mjs --vault <path> --out ./mirror-vault");
  process.exit(2);
}

const OUT = resolve(opt("out", join(ROOT, "demo-vault")));
const NOTES = opt("notes", "1400");
const YEARS = opt("years", "10");
const RECENT = opt("recent", "0.85");
const SEED = opt("seed", "1");
const END = opt("end", "");

const args = [join(HERE, "make-test-vault.mjs"),
              "--out", OUT, "--notes", NOTES, "--years", YEARS, "--recent", RECENT, "--seed", SEED];
if (END) args.push("--end", END);

const r = spawnSync(process.execPath, args, { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);

console.log("\ndemo vault: " + NOTES + " notes over " + YEARS + " years (recent share " +
            RECENT + "), seed " + SEED + (END ? ", ending " + END : ", ending today"));
console.log("build it:");
console.log('  node src/build-graph.mjs --vault "' + OUT + '" --out demo.html');
