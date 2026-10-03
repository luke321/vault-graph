// github#186
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, startProcess, measuredRegion, retention, repeatRuns, durationCheck, cleanupAll } from "./native-recording.mjs";

test("failed evidence and browser cleanup cannot bypass either resource release", async () => {
  const calls = [];
  const errors = await cleanupAll([
    () => { throw Error("disk full"); },
    () => { calls.push("browser"); throw Error("browser transport closed"); },
    () => { calls.push("screen"); },
    () => { calls.push("record"); }
  ]);
  assert.deepEqual(calls, ["browser", "screen", "record"]);
  assert.deepEqual(errors, ["disk full", "browser transport closed"]);
});

test("native region retains the full viewport and rejects scaling or clipping", () => {
  const d = { screenX: -1800, screenY: 20, outerWidth: 1096, outerHeight: 1127,
    innerWidth: 1080, innerHeight: 1080, dpr: 1 };
  const m = { x: -1920, y: 0, w: 1920, h: 1400 };
  assert.deepEqual(measuredRegion(d, m, 1080), { x: -1792, y: 59, size: 1080 });
  assert.throws(() => measuredRegion({ ...d, dpr: 1.25 }, m, 1080), /DPR/);
  assert.throws(() => measuredRegion({ ...d, screenY: 500 }, m, 1080), /outside/);
});

test("duration checks reject retiming and identity reports missing and invented states", () => {
  assert.equal(durationCheck(7.250, 7.250).withinOneFrame, true);
  assert.equal(durationCheck(7.250, 7.300).withinOneFrame, false);
  assert.throws(() => durationCheck(NaN, 7.250), /invalid/);
  assert.deepEqual(retention(["a", "b", "c", "c"], ["a", "a", "c", "d"]), {
    sourceFrames: 4, sourceDistinct: 3, referenceFrames: 4, retainedDistinct: 2, sampledOut: 1, invented: 1
  });
  assert.throws(() => retention([], ["a"]), /Empty/);
});

test("freeze detection excludes idle tails but finds an active three-frame hold", () => {
  const r = repeatRuns(["idle", "idle", "idle", "a", "b", "b", "b", "c", "end", "end"], 3 / 60, 8 / 60);
  assert.deepEqual(r, [{ start: 4 / 60, frames: 3, activeFrames: 3 }]);
});

test("subprocess failures and closed stdin are handled", async () => {
  await assert.rejects(run("vg-nonexistent-executable-186", [], { priority: false }), /failed/);
  await assert.rejects(run(process.execPath, ["-e", "process.exit(7)"], { priority: false }), /failed \(7\)/);
  const p = startProcess(process.execPath, ["-e", "process.stdin.destroy();setTimeout(()=>process.exit(0),100)"], { priority: false });
  await p.done;
  p.child.stdin.end("q\n");
  await p.result();
});

test("rejecting an existing output leaves its contents untouched", { skip: process.platform !== "win32" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "vg-native-test-"));
  try {
    const source = join(dir, "source.html");
    writeFileSync(source, 'window.VAULT_DATA={"vault":"test"};');
    writeFileSync(join(dir, "sentinel"), "keep");
    await assert.rejects(run(process.execPath, ["scripts/record-native.mjs", "--html", source,
      "--out", dir, "--label", "test"], { priority: false }), /already exists/);
    assert.deepEqual(readdirSync(dir).sort(), ["sentinel", "source.html"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
