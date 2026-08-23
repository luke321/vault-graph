#!/usr/bin/env node
// Build the DEMO vault: a fixed, invented vault for recordings and screenshots.
//
//   node scripts/make-demo-vault.mjs                    # ./demo-vault
//   node scripts/make-demo-vault.mjs --out /tmp/demo --seed 7 --notes 1400
//
// WHY THIS EXISTS AT ALL. The README's demo GIF was once recorded against a real vault, so it
// published somebody's folder names and counts, and a hover tooltip in a future take would
// have published note titles. Everything shown in a recording has to be invented.
//
// IT NO LONGER MIRRORS ANYONE'S VAULT. It used to: it walked a real vault and reproduced its
// folder tree, its per-folder counts, its dates and its link graph under invented names, on
// the reasoning that the layout is tuned against a real shape so a demo should have one. Two
// problems with that, and the second is the one that killed it.
//
//   * The output depended on whose machine it ran on. A GIF recorded here and a GIF recorded
//     by a contributor were different vaults, so "does this look right" had no fixed answer,
//     and neither did a screenshot comparison across machines.
//   * It inherited that vault's DATE SHAPE, and the shape of one real vault is 86% of its
//     notes in a single year with a thin tail of ten more. That is honest, and it is terrible
//     for a demo: the heatmap band shows one dense year, the date ribbon shows one spike and
//     nine years of near-empty strip, and the feature the ribbon exists for cannot be
//     demonstrated on it at all.
//
// So the structure is DECLARED, in make-test-vault.mjs, which already carried a full fixed
// spec: eighteen top-level folders with realistic names, nesting five levels deep, sliver
// folders beside one holding a quarter of the vault. This is a preset over that rather than a
// second generator, because two generators for one job drift apart.
//
// THE PRESET IS TWO DENSE YEARS. Every month populated, ramping toward the present the way a
// vault in real use does, and no tail of ancient notes -- so the heatmap band is full to its
// right-hand edge, the ribbon has shape along its whole width, and dragging a range over it
// selects something at every position rather than nothing for four fifths of its travel.
//
// Deterministic apart from the end date, which defaults to today so the band's last-52-weeks
// window has notes in it. Pass --end to pin that too and get a byte-identical vault.

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

// A loud failure rather than a silently ignored flag: anyone passing --vault is expecting the
// old mirroring behaviour and would otherwise get a generic vault and not notice.
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
const YEARS = opt("years", "2");
const SEED = opt("seed", "1");
const END = opt("end", "");

const args = [join(HERE, "make-test-vault.mjs"),
              "--out", OUT, "--notes", NOTES, "--years", YEARS, "--seed", SEED];
if (END) args.push("--end", END);

const r = spawnSync(process.execPath, args, { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);

console.log("\ndemo vault: " + NOTES + " notes over " + YEARS + " years, seed " + SEED +
            (END ? ", ending " + END : ", ending today"));
console.log("build it:");
console.log('  node src/build-graph.mjs --vault "' + OUT + '" --out demo.html');
