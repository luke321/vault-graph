#!/usr/bin/env node
// github#101

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const argAll = (n) => argv.reduce((out, a, i) => {
  if (a === "--" + n && argv[i + 1]) out.push(argv[i + 1]);
  return out;
}, []);

function usage(code) {
  console.log(
    "usage:\n" +
    "  node scripts/suite-repeat.mjs --runs <k> --out <dir> --mode <name>=<smoke.mjs args> [--mode ...]\n" +
    "  node scripts/suite-repeat.mjs --tally <dir>\n" +
    "\n" +
    "  --mode is repeatable. Example:\n" +
    "    --mode \"default=\" --mode \"fast=--serial-jobs 3\" --mode \"serial3=--serial-jobs 3 --jobs 3\"\n" +
    "\n" +
    "  Each run takes the \"suite\" lock (scripts/lock.mjs) around the smoke.mjs invocation and\n" +
    "  releases it after, so it never collides with a fixture-regenerating run elsewhere. Runs\n" +
    "  across modes are interleaved (run 1 of every mode, then run 2 of every mode, ...) rather\n" +
    "  than five-in-a-row, so machine drift does not land on one mode."
  );
  process.exit(code);
}

// github#101 -- leading-space count tells the two FAIL lines apart
const FAIL_RE = /^ FAIL {2}(.+?)(?: \d+\.\d+s)?$/;
const SECTION_RE = /^==\s+(.+?)\s*$/;
const baseFixture = (tag) => tag.replace(/\s+\((walk|intro|pristine)\)\s*$/, "");

function parseLog(text) {
  const perCheck = new Map();
  let section = null;
  for (const line of text.split("\n")) {
    const s = SECTION_RE.exec(line);
    if (s) { section = baseFixture(s[1]); continue; }
    const f = FAIL_RE.exec(line);
    if (f && section) perCheck.set(section + "\t" + f[1], (perCheck.get(section + "\t" + f[1]) || 0) + 1);
  }
  return perCheck;
}

function parseModes() {
  const specs = argAll("mode");
  if (!specs.length) return [];
  return specs.map((s) => {
    const eq = s.indexOf("=");
    if (eq < 0) throw new Error(`--mode "${s}" is not "name=args"`);
    const name = s.slice(0, eq).trim();
    const args = s.slice(eq + 1).trim();
    if (!name) throw new Error(`--mode "${s}" has an empty name`);
    return { name, args: args ? args.split(/\s+/) : [] };
  });
}

function acquireLock(owner) {
  const r = spawnSync(process.execPath,
    [join(HERE, "lock.mjs"), "acquire", "suite", "--owner", owner],
    { stdio: "inherit" });
  return r.status === 0;
}

function releaseLock(owner) {
  spawnSync(process.execPath, [join(HERE, "lock.mjs"), "release", "suite", "--owner", owner],
            { stdio: "ignore" });
}

function runOnce(mode, run, outDir) {
  const owner = `suite-repeat #101 ${mode.name} run${run}`;
  const logPath = join(outDir, `${mode.name}-run${run}.log`);
  const metaPath = join(outDir, `${mode.name}-run${run}.meta.json`);
  console.log(`\n>>> ${mode.name} run ${run}: waiting for the suite lock...`);
  if (!acquireLock(owner)) {
    writeFileSync(metaPath, JSON.stringify({ mode: mode.name, run, ok: false, why: "BUSY" }, null, 1));
    console.log(`>>> ${mode.name} run ${run}: BUSY, skipped`);
    return;
  }
  const started = Date.now();
  let r;
  try {
    r = spawnSync(process.execPath,
      [join(ROOT, "scripts", "smoke.mjs"), ...mode.args],
      { cwd: ROOT, encoding: "utf8" });
  } finally {
    releaseLock(owner);
  }
  const wallMs = Date.now() - started;
  const text = (r.stdout || "") + (r.stderr || "");
  writeFileSync(logPath, text);
  writeFileSync(metaPath, JSON.stringify({
    mode: mode.name, run, ok: r.status === 0, exitCode: r.status, wallMs,
  }, null, 1));
  console.log(`>>> ${mode.name} run ${run}: exit ${r.status}, ${Math.round(wallMs / 1000)}s -- ${logPath}`);
}

function tally(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".meta.json"));
  if (!files.length) { console.log(`no *.meta.json in ${dir}`); return; }
  const byMode = new Map();
  for (const f of files) {
    const meta = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const name = meta.mode;
    if (!byMode.has(name)) byMode.set(name, { runs: [], fails: new Map() });
    const m = byMode.get(name);
    m.runs.push(meta);
    if (!meta.ok && meta.why === "BUSY") continue;
    const logPath = join(dir, `${meta.mode}-run${meta.run}.log`);
    if (!existsSync(logPath)) continue;
    const perCheck = parseLog(readFileSync(logPath, "utf8"));
    for (const key of perCheck.keys()) m.fails.set(key, (m.fails.get(key) || 0) + 1);
  }
  for (const [name, m] of byMode) {
    const done = m.runs.filter((r) => r.why !== "BUSY");
    const busy = m.runs.length - done.length;
    const walls = done.filter((r) => typeof r.wallMs === "number").map((r) => r.wallMs);
    const avg = walls.length ? Math.round(walls.reduce((a, b) => a + b, 0) / walls.length / 1000) : null;
    const min = walls.length ? Math.round(Math.min(...walls) / 1000) : null;
    const max = walls.length ? Math.round(Math.max(...walls) / 1000) : null;
    console.log(`\n${"=".repeat(72)}`);
    console.log(`== ${name}  (${done.length} run(s)${busy ? `, ${busy} BUSY` : ""})`);
    console.log(`${"=".repeat(72)}`);
    console.log(`wall: avg ${avg}s, min ${min}s, max ${max}s`);
    const flaky = [...m.fails.entries()].sort((a, b) => b[1] - a[1]);
    if (!flaky.length) { console.log("no FAILs across these runs"); continue; }
    for (const [key, n] of flaky) {
      const [fixture, check] = key.split("\t");
      console.log(`  ${n}/${done.length}  ${fixture}  ${check}`);
    }
  }
}

function main() {
  if (argv.includes("--help") || argv.includes("-h")) usage(0);

  const tallyDir = arg("tally", "");
  if (tallyDir) { tally(tallyDir); return; }

  const runs = Number(arg("runs", ""));
  const outDir = arg("out", "");
  const modes = parseModes();
  if (!runs || runs < 1 || !outDir || !modes.length) usage(2);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "modes.json"), JSON.stringify(modes, null, 1) + "\n");

  console.log(`${runs} run(s) x ${modes.length} mode(s) = ${runs * modes.length} smoke.mjs run(s), ` +
              `interleaved, into ${outDir}`);
  // github#101 -- modes interleaved, not five-in-a-row
  for (let run = 1; run <= runs; run++) {
    for (const mode of modes) runOnce(mode, run, outDir);
  }

  console.log("\ndone. tally:");
  tally(outDir);
}

main();
