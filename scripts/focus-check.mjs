#!/usr/bin/env node
// github#129, design/0018 -- does a harness run leave the keyboard where it found it?
//
//   node scripts/focus-check.mjs --runs 5 -- node scripts/shoot.mjs --vault .fixtures/x --out shots
//
// Everything after `--` is the harness to run. It is run `--runs` times because the theft is
// intermittent: two identical runs measured 8445 ms stolen and 0 ms stolen, so a single clean run
// proves nothing. What counts is the rate and the worst case.
//
// Not a smoke check, and deliberately so: it needs its own foreground window and it measures
// something that varies run to run, which is a flaky gate rather than an invariant.

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
  console.error("usage: node scripts/focus-check.mjs [--runs N] [--no-lock] -- <harness command>");
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

// github#87 -- a stand-in window takes the keyboard and the harness draws on a screen
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
    };
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

// github#129's "done when": the keyboard comes back, and any loss is under a second
const ok = lost.length === 0 && worst < 1000;
console.log(ok ? "PASS -- every run ended holding the keyboard, and no loss reached a second"
               : "FAIL -- a run lost the keyboard for a second or more, or never got it back");
process.exit(ok ? 0 : 1);
