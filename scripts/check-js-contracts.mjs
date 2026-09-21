// github#145 -- the compiler's check on the JavaScript, and its probe
// github#156 -- two programs now, browser and node, each with its own probe
// github#145 -- 1. both configs must report ZERO diagnostics
// github#145 -- 2. a copy of src/page.js with `var DATA = 42` must NOT
// github#156 -- 3. a copy of src/build-graph.mjs with `nodes: 42` must NOT
// github#145 -- a probe's config extends the real one; rebuilding its
// github#145 -- options inline passed with checkJs OFF -- measured
// github#145 -- `files` beats `include`, not `exclude`, so --listFiles
// github#145 -- asserts the named files are really in the program
// github#145 -- zero, not a baseline; diagnostics print by identity
// github#156 -- src/page.js is in both programs, so they are deduped
// github#145 -- .ai-context/invariants.md has why

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSC = join(ROOT, "node_modules", "typescript", "bin", "tsc");

// github#145, github#156 -- the two real programs; covers is what --listFiles proves
const PROGRAMS = [
  { config: "tsconfig.contracts.json", label: "browser", covers: ["src/page.js", "plugin/main.js"] },
  { config: "tsconfig.contracts-node.json", label: "node", covers: ["src/build-graph.mjs"] },
];

// github#145, github#156 -- one probe per program: each config has its own checkJs
const PROBES = [
  {
    label: "page",
    source: "src/page.js",
    copy: "src/vg-contract-probe.js",
    config: "tsconfig.probe.json",
    extends: "./tsconfig.contracts.json",
    anchor: "var DATA = data;",
    mutant: '/** @type {VaultData} */ var DATA = 42;',
    binds: "the VaultData argument",
    expect: /VaultData/,
  },
  {
    label: "exporter",
    source: "src/build-graph.mjs",
    copy: "src/vg-exporter-probe.mjs",
    config: "tsconfig.exporter-probe.json",
    extends: "./tsconfig.contracts-node.json",
    anchor: "\n  nodes,\n  edges,\n",
    mutant: "\n  nodes: 42,\n  edges,\n",
    binds: "the VaultData the exporter emits",
    expect: /VaultNode|VaultData/,
  },
];

// github#145, github#156 -- gitignored; removed in a finally and on the way in
const ARTEFACTS = PROBES.flatMap((p) => [join(ROOT, p.copy), join(ROOT, p.config)]);

/** github#145 -- `path(line,col): error TSxxxx: message` */
const DIAG = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

function runTsc(project, listFiles) {
  const args = [TSC, "--noEmit", "-p", project];
  if (listFiles) args.push("--listFiles");
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const diags = [];
  const files = [];
  for (const line of out.split("\n")) {
    const t = line.trim();
    const m = DIAG.exec(t);
    // github#145 -- a continuation line belongs to the one above
    if (m) diags.push({ file: m[1], line: +m[2], col: +m[3], code: m[4], message: m[5] });
    // github#145 -- --listFiles prints platform separators
    else if (listFiles && t) files.push(t.replace(/\\/g, "/"));
  }
  return { diags, files, raw: out, status: r.status };
}

function cleanup() {
  for (const f of ARTEFACTS) rmSync(f, { force: true });
}

let failed = false;
cleanup();
try {
  if (!existsSync(TSC)) {
    console.log("js-contracts: FAIL -- node_modules/typescript is missing; run npm ci");
    process.exit(1);
  }

  /* ---------------------------------------------------------- the real checks */

  // github#156 -- src/page.js is in both programs; a diagnostic can repeat
  const seen = new Set();
  /** @type {{ file: string, line: number, col: number, code: string, message: string }[]} */
  const diags = [];
  const covers = [];

  for (const program of PROGRAMS) {
    const real = runTsc(join(ROOT, program.config), true);

    // github#145 -- a file out of the program reports zero for a dull reason
    for (const want of program.covers) {
      if (real.files.some((f) => f.endsWith("/" + want))) covers.push(want);
      else {
        failed = true;
        console.log(`js-contracts: FAIL -- ${want} is not in the program ${program.config}`);
        console.log("  builds. Its diagnostics are zero because nothing is reading it.");
      }
    }

    for (const d of real.diags) {
      const key = `${d.file}(${d.line},${d.col}) ${d.code} ${d.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      diags.push(d);
    }
  }

  if (diags.length) {
    failed = true;
    console.log(`js-contracts: FAIL -- ${diags.length} diagnostic(s) with checkJs on\n`);
    // github#145 -- by identity, never by total
    for (const d of diags) {
      console.log(`  ${d.file}(${d.line},${d.col})  ${d.code}  ${d.message}`);
    }
    console.log("\n  Fix them at their source. A broad cast, an `any` or an exclusion puts the");
    console.log("  gate back where github#145 found it: green, and worth nothing.");
  } else {
    // github#145 -- name what was read; claim no denied coverage
    console.log(`js-contracts: ok -- 0 diagnostics with checkJs on (${covers.join(", ") || "nothing in scope"})`);
  }

  /* ------------------------------------------------------------- the probes */

  for (const probe of PROBES) {
    const src = readFileSync(join(ROOT, probe.source), "utf8");
    const hits = src.split(probe.anchor).length - 1;
    if (hits !== 1) {
      // github#145 -- a probe testing nothing is the failure this prevents
      failed = true;
      const shown = JSON.stringify(probe.anchor);
      console.log(`js-contracts: FAIL -- the ${probe.label} probe's anchor ${shown} matched`);
      console.log(`  ${hits} times in ${probe.source}, not once. Re-point it at whatever now binds`);
      console.log(`  ${probe.binds}, or the acceptance test for it is measuring nothing.`);
      continue;
    }

    writeFileSync(join(ROOT, probe.copy), src.replace(probe.anchor, probe.mutant), "utf8");
    // github#145 -- the mutated file alone is the whole program
    writeFileSync(join(ROOT, probe.config), JSON.stringify({
      extends: probe.extends,
      files: [probe.copy, "src/globals.d.ts"],
    }, null, 2) + "\n", "utf8");

    const run = runTsc(join(ROOT, probe.config));
    const caught = run.diags.filter((d) => probe.expect.test(d.message));
    if (caught.length) {
      console.log(`js-contracts: ok -- the ${probe.label} probe is rejected (${caught[0].code}: ${caught[0].message})`);
    } else {
      failed = true;
      console.log(`js-contracts: FAIL -- the ${probe.label} probe was NOT rejected.`);
      console.log(`  A copy of ${probe.source} with ${JSON.stringify(probe.mutant.trim())} drew no`);
      console.log("  diagnostic naming the type it violates, which is what the whole gate did");
      console.log("  before github#145. Something has turned the check off: checkJs, the include,");
      console.log(`  the types, or an exclusion over ${probe.source}.`);
      if (run.raw.trim()) console.log("\n" + run.raw.trim());
    }
  }
} finally {
  cleanup();
}

process.exit(failed ? 1 : 0);
