#!/usr/bin/env node
// github#129, design/0018

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const argv = process.argv.slice(2);
const dashdash = argv.indexOf("--");
if (dashdash < 0 || dashdash === argv.length - 1) {
  console.error("usage: node scripts/focus-check.mjs [--runs N] [--no-lock] -- <harness command>\n" +
    "  --no-lock is REQUIRED when the harness takes screen-left itself (smoke.mjs, spike-check.mjs,\n" +
    "  obsidian-smoke.mjs): holding it out here makes their own acquire wait out this run. github#87");
  process.exit(2);
}
const opts = argv.slice(0, dashdash);
const command = argv.slice(dashdash + 1).join(" ");
const arg = (n, d) => { const i = opts.indexOf("--" + n); return i >= 0 && opts[i + 1] ? opts[i + 1] : d; };
const RUNS = Math.max(1, Number(arg("runs", 3)));
// github#87
const NO_LOCK = opts.includes("--no-lock");

if (process.platform !== "win32") {
  console.error("focus-check only means anything on Windows -- the defect is Win32 foreground activation");
  process.exit(2);
}

// github#87
const LOCK = "screen-left";
const owner = "focus-check [" + process.pid + "]";
let holdsLock = false;
if (!NO_LOCK) {
  const r = spawnSync(process.execPath, [join(HERE, "lock.mjs"), "acquire", LOCK, "--owner", owner],
    { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("could not take the " + LOCK + " lock -- something else is driving that display.");
    process.exit(1);
  }
  holdsLock = true;
}
const releaseLock = () => {
  if (!holdsLock) return;
  holdsLock = false;
  try {
    spawnSync(process.execPath, [join(HERE, "lock.mjs"), "release", LOCK, "--owner", owner], { stdio: "ignore" });
  } catch { void 0; }
};
process.once("exit", releaseLock);

const scratch = mkdtempSync(join(tmpdir(), "vg-focus-check-"));
console.log(`${RUNS} run(s) of: ${command}\n`);

const results = [];
try {
  for (let i = 1; i <= RUNS; i++) {
    const log = join(scratch, `run-${i}.log`);
    const out = join(scratch, `run-${i}.out`);
    const r = spawnSync("powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
       "-File", join(HERE, "focus-standin.ps1"),
       "-ArgLine", command, "-Log", log, "-Out", out, "-WorkDir", ROOT],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

    let text = "";
    try { text = readFileSync(log, "utf8"); } catch { void 0; }
    const line = /^RESULT (.*)$/m.exec(text)?.[1];
    if (!line) {
      const why = /^ABORT (.*)$/m.exec(text)?.[1] || (r.stderr || "").trim().split("\n").slice(-1)[0] || "no result";
      console.log(`run ${i}: could not measure -- ${why}`);
      results.push(null);
      continue;
    }
    const f = Object.fromEntries(line.split(" ").map((kv) => kv.split("=")));
    const res = {
      steals: Number(f.steals), away: Number(f.away_ms), longest: Number(f.longest_ms),
      run: Number(f.run_ms), kept: f.kept === "True", exit: Number(f.exit),
      lockTimeout: Number(f.locktimeout),
    };
    // github#129
    if (res.exit !== 0) {
      console.log(`run ${i}: harness exited ${res.exit} after ${res.run} ms -- not a measurement. ` +
                  `Run it on its own and fix that first.`);
      results.push(null);
      continue;
    }
    results.push(res);
    const who = text.match(/^EVENT \d+ (?!.*focus check)(.*)$/m)?.[1];
    console.log(`run ${i}: ${res.steals} steal(s), ${res.away} ms without the keyboard ` +
                `(longest ${res.longest} ms) of ${res.run} ms; ended holding it: ${res.kept}` +
                (res.exit === 0 ? "" : `; harness exited ${res.exit}`) +
                (who ? `\n        first thief: ${who}` : ""));
  }
} finally {
  try { rmSync(scratch, { recursive: true, force: true }); } catch { void 0; }
  releaseLock();
}

const got = results.filter(Boolean);
if (!got.length) { console.error("\nnothing measured"); process.exit(1); }
const stole = got.filter((r) => r.steals > 0);
const worst = Math.max(...got.map((r) => r.longest));
const lost = got.filter((r) => !r.kept);
console.log(`\n${stole.length}/${got.length} run(s) lost the keyboard at all; ` +
            `worst single loss ${worst} ms; ${lost.length} ended without it.`);

// github#129, design/0018
const failed = lost.length > 0 || worst >= 1000;
if (failed) {
  console.log("FAIL -- a run lost the keyboard for a second or more, or never got it back");
  process.exit(1);
}
if (!stole.length) {
  const lt = got[0].lockTimeout;
  console.log(
    `INCONCLUSIVE -- no run was ever stolen from, so nothing was exercised. A fixed harness and a\n` +
    `machine that is refusing every activation look identical from here, and Windows is currently\n` +
    `set to ForegroundLockTimeout = ${lt} ms${lt > 1000 ? " (it refuses them)" : ""}.\n` +
    `Confirm the environment can still reproduce it before believing a clean run:\n` +
    `  VG_NO_FOCUS_GUARD=1 on the same command must show steals. If it does not, the machine is\n` +
    `  masking the defect rather than the guard fixing it.`);
  process.exit(2);
}
console.log(`PASS -- ${stole.length} run(s) were stolen from and every one got the keyboard back ` +
            `within ${worst} ms`);
process.exit(0);
