// github#186
import test from "node:test";
import assert from "node:assert/strict";
import { rehearse } from "./recording-rehearsal.mjs";

function fixture({ replaced = true, report, after } = {}) {
  const initial = { state: { dim: "folder", hidden: {} }, nodes: [["a", { x: 1, y: 2 }]],
    camera: { ratio: 1 }, viewport: [1080, 1080, 1] };
  const calls = [], evidence = [];
  let snapshots = 0;
  const page = {
    async eval(expression) {
      calls.push(expression);
      if (expression.startsWith("JSON.stringify")) return JSON.stringify(++snapshots === 1 ? initial : after || initial);
      if (expression.startsWith("Object.fromEntries")) return { dimension: "folder" };
      if (expression.startsWith("({report:")) return { replaced, started: 10,
        report: report || { frames: 120, exit: "converged", t0: 11 } };
      return true;
    },
    async send(method) { calls.push(method); }
  };
  return { calls, evidence, run: () => rehearse({ page, trigger: "trigger()", setup: "setup()",
    until: async fn => assert.equal(await fn(), true), pause: async () => {}, maxMs: 30000,
    save: e => evidence.push(e) }) };
}

test("rehearsal restores storage before reload and verifies the fresh document's complete state", async () => {
  const f = fixture(); await f.run();
  const restore = f.calls.findIndex(c => c.startsWith("localStorage.clear()"));
  assert.ok(restore >= 0 && restore < f.calls.indexOf("Page.reload"));
  assert.match(f.calls[restore], /"dimension":"folder"/);
  assert.equal(f.evidence[0].equal, true);
});

test("stale or interrupted rehearsal cannot be reported as warmed", async () => {
  for (const options of [{ replaced: false }, { report: { frames: 0, path: "other" } },
    { report: { frames: 20, exit: "watchdog", t0: 11 } }, { report: { frames: 120, exit: "converged", t0: 1 } }]) {
    const f = fixture(options);
    await assert.rejects(f.run(), /fresh action/);
    assert.equal(f.calls.includes("Page.reload"), false);
    assert.equal(f.evidence[0].equal, false);
  }
});

test("a changed camera, filter or node position after reload rejects the comparison", async () => {
  for (const after of [{ camera: { ratio: 2 } }, { state: { dim: "tag" } }, { nodes: [["a", { x: 9, y: 2 }]] }]) {
    const f = fixture({ after });
    await assert.rejects(f.run(), /changed the initial graph/);
    assert.equal(f.evidence[0].equal, false);
    assert.deepEqual(f.evidence[0].after, after);
  }
});

test("fresh expected-static preparation can rehearse, but an old static report cannot", async () => {
  const report = { frames: 0, path: "instant: nothing to move" };
  await fixture({ report }).run();
  await assert.rejects(fixture({ report, replaced: false }).run(), /fresh action/);
});
