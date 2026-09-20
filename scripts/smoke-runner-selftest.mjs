#!/usr/bin/env node
// github#146 -- the smoke runner's own scoring, with no Chrome

import { makeErrorLog, runChecks, summarise } from "./smoke-runner.mjs";
// github#151
import { allowedToLeave, couplingReport, diffState, keysRead, leakReport, newLeaks,
         readable, tokensFor } from "./smoke-state.mjs";

let failed = 0;
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail) {
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + (detail ? "   (" + detail + ")" : ""));
  if (!ok) failed++;
}

// github#146 -- a page that answers only what the loop asks
function fakePage(opts = {}) {
  const busy = (opts.busy || []).slice();
  const p = {
    lost: opts.lost || null,
    sent: [],
    dead: opts.dead || false,
    captured: (opts.captured || []).slice(),
    get errors() { return p.captured.slice(); },
    async send(method, params) { p.sent.push(method); void params; },
    // github#151 -- the page state the probe reads back, for the audit's own regressions
    state: Object.assign({}, opts.state || {}),
    async eval(expr) {
      if (p.dead) throw new Error("Inspector.detached");
      // github#146 -- honour the grace, so a window can close too early
      const grace = /setTimeout\(r, (\d+)\)/.exec(String(expr));
      if (grace) { await new Promise((r) => setTimeout(r, Number(grace[1]))); return undefined; }
      // github#151 -- the state probe is the only expression that names this key
      if (String(expr).includes("page.mounted")) return JSON.stringify(p.state);
      return expr === "1" ? 1 : undefined;
    },
    async j(expr) {
      if (expr === "__vg.demo.busyWhy()") {
        const next = busy.shift();
        return next ? Object.fromEntries(next.map((k) => [k, true])) : null;
      }
      return null;
    },
  };
  return p;
}

// github#146 -- the real settle() yields, so this one must too
const settle = async () => { await new Promise((r) => setTimeout(r, 0)); return true; };
const quietLog = () => { const lines = []; const log = (m) => lines.push(String(m)); log.lines = lines; return log; };

async function run(checks, opts = {}) {
  const page = fakePage(opts);
  const errorLog = makeErrorLog(page);
  const ctx = { get errors() { return errorLog.errors; } };
  for (const e of opts.errors || []) ctx.errors.push(e);
  const log = quietLog();
  // github#151 -- so a test can assert the wrapper was handed back
  const beforeEval = page.eval;
  const r = await runChecks({
    checks, page, ctx, log, settle,
    chromeState: () => ({ gone: opts.gone || null, said: opts.said || [] }),
    fastClock: 0.1, nativeClock: 1.25,
    finalGraceMs: opts.finalGraceMs === undefined ? 0 : opts.finalGraceMs,
    // github#151
    stateAudit: !!opts.stateAudit, stateBoundary: !!opts.stateBoundary
  });
  r.evalRestored = page.eval === beforeEval;
  return { ...r, lines: log.lines, text: log.lines.join("\n"), errors: ctx.errors, page };
}

const pass = (name) => ({ name, fn: async () => ({ ok: true, detail: "fine" }) });

console.log("the audit around every check");

// github#146 -- the defect, in the shape the review measured it
{
  const r = await run([
    pass("reads an empty error list"),
    { name: "passes its assertion and throws on the way out",
      fn: async (p, ctx) => { ctx.errors.push("exception: TypeError: x is not a function (line 42)"); return { ok: true, detail: "42 notes" }; } }
  ]);
  check("a later check that appends an error fails, though its assertion passed",
        r.failed === 1, "failed " + r.failed + " of " + r.ran);
  check("...and the failure line says what was thrown",
        /threw during this check: exception: TypeError: x is not a function \(line 42\)$/m.test(r.text),
        (r.lines[1] || "").trim());
  check("...while its own detail is kept",
        /42 notes \| threw during this check/.test(r.text));
  check("...and the check before it is untouched", r.text.includes("  ok   reads an empty error list"));
}

// github#146 -- an error that belongs to no check's window
{
  const r = await run([
    pass("one"),
    { name: "two",
      fn: async (p) => { setTimeout(() => p.captured.push({ kind: "console", text: "late boom" }), 30);
                         return { ok: true, detail: "ok" }; } }
  ], { finalGraceMs: 120 });
  check("an error arriving after the last check's own window fails the job",
        r.failed === 1, "failed " + r.failed);
  check("...as a line of its own, not attributed to a check",
        /the page threw after the last check finished/.test(r.text) &&
        /1 error\(s\) nothing accounted for: console: late boom/.test(r.text), r.lines.join(" / "));
  check("...and neither check is blamed for it",
        r.text.includes("  ok   one") && r.text.includes("  ok   two"));
  check("...and it is counted in the denominator", r.ran === 3, "ran " + r.ran);
}

// github#146
{
  const r = await run([
    pass("one"),
    { name: "two",
      fn: async (p) => { setTimeout(() => p.captured.push({ kind: "console", text: "on the way out" }), 0);
                         return { ok: true, detail: "ok" }; } },
    pass("three")
  ]);
  check("an error thrown as a check returns is attributed to that check",
        r.failed === 1 && r.text.includes(" FAIL  two"), "failed " + r.failed);
  check("...and not to the innocent check after it", r.text.includes("  ok   three"));
}

// github#146 -- a load-time error falls into the first window
{
  const r = await run([pass("whatever runs first here")], { errors: ["load-time boom"] });
  check("an error captured before the first check fails that check",
        r.failed === 1 && /threw during this check: load-time boom/.test(r.text),
        "failed " + r.failed);
}

// github#146 -- a check must see what the page threw while IT was running
{
  let sawDuringRun = null;
  const r = await run([
    { name: "reads the list while it runs",
      fn: async (p, ctx) => {
        const before = ctx.errors.length;
        p.captured.push({ kind: "console", text: "thrown mid-check" });
        sawDuringRun = ctx.errors.slice(before);
        ctx.errors.splice(before);
        return { ok: true, detail: "d" };
      } }
  ]);
  check("a check reading ctx.errors mid-run sees what arrived since it started",
        sawDuringRun && sawDuringRun.length === 1 && sawDuringRun[0] === "console: thrown mid-check",
        JSON.stringify(sawDuringRun));
  check("...and having handled them itself, it is not failed for them",
        r.failed === 0, "failed " + r.failed);
}

// github#146 -- the one allowlist: a check forgiving its own window
{
  const r = await run([
    pass("one"),
    { name: "forgives its own window",
      fn: async (p, ctx) => {
        const mark = ctx.errors.length;
        ctx.errors.push("expected: payload vault threw");
        ctx.errors.splice(mark);
        return { ok: true, detail: "4 pages" };
      } },
    pass("three")
  ]);
  check("a check that splices its own window back is not failed",
        r.failed === 0 && r.text.includes("  ok   forgives its own window"), "failed " + r.failed);
}

// github#146
{
  const r = await run([
    { name: "one", fn: async (p, ctx) => { ctx.errors.push("a"); ctx.errors.push("b"); return { ok: true, detail: "d" }; } },
    { name: "two", fn: async (p, ctx) => { ctx.errors.splice(0); ctx.errors.push("c"); return { ok: true, detail: "d" }; } },
    pass("three")
  ]);
  check("a splice below the runner's mark cannot hide a later error",
        r.failed === 2 && r.text.includes(" FAIL  two"), "failed " + r.failed);
}

console.log("what the runner already did, unchanged");

{
  const r = await run([pass("one"), pass("two"), pass("three")]);
  check("a clean run fails nothing", r.failed === 0, "failed " + r.failed);
  check("...counts every check", r.ran === 3 && r.timings.length === 3);
  check("...names each one in order",
        r.timings.map((t) => t.name).join(",") === "one,two,three");
  check("...and emulates reduced motion around a fast check",
        r.page.sent.filter((m) => m === "Emulation.setEmulatedMedia").length === 6,
        r.page.sent.filter((m) => m === "Emulation.setEmulatedMedia").length + " calls");
}

{
  const r = await run([{ name: "real", clock: "real", fn: async () => ({ ok: true, detail: "d" }) }]);
  check("a real-clock check is not put under reduced motion",
        !r.page.sent.includes("Emulation.setEmulatedMedia"));
}

{
  const r = await run([{ name: "throws", fn: async () => { throw new Error("boom"); } }]);
  check("a check whose callback throws fails with its message",
        r.failed === 1 && /threw: boom/.test(r.text));
}

{
  const r = await run([{ name: "leaks", fn: async () => ({ ok: true, detail: "d" }) }], { busy: [["cascade"]] });
  check("a check that leaves the page busy still fails",
        r.failed === 1 && /left the page busy: cascade/.test(r.text));
}

{
  const r = await run([pass("one"), pass("two"), pass("three")], { lost: "socket closed" });
  check("a lost connection fails every check that did not run",
        r.failed === 3 && /CDP connection lost \(socket closed\) -- 3 check\(s\) not run/.test(r.text),
        "failed " + r.failed);
  check("...and reports what chrome said", /chrome process: exit 1/.test(
    (await run([pass("one")], { lost: "x", gone: "exit 1" })).text));
}

{
  const r = await run([pass("one")], { dead: true });
  check("a page that stops answering fails the rest",
        r.failed === 1 && /stopped answering after "\(before the first check\)"/.test(r.text));
  check("...and says why the round-trip failed", /-- Inspector.detached/.test(r.text));
  check("...and does not then wait out a settle it cannot finish",
        !/nothing accounted for/.test(r.text));
}

console.log("the error log");

{
  // github#146 -- what cdp.mjs hands over, in its shape
  const page = fakePage({ captured: [
    { kind: "exception", text: "Error: nope\n  at x", line: 11 },
    { kind: "exception", text: "Uncaught (in promise) Error: no" },
    { kind: "console", text: "bad Error: worse" }
  ] });
  const errorLog = makeErrorLog(page);
  check("an exception is read back with its line",
        errorLog.errors[0] === "exception: Error: nope (line 12)", errorLog.errors[0]);
  check("a stack is cut to its first line", !errorLog.errors[0].includes("at x"));
  check("console.error is read back, and labelled as one",
        errorLog.errors[2] === "console: bad Error: worse", errorLog.errors[2]);
  check("a second read adds nothing", errorLog.errors.length === 3, errorLog.errors.length + " held");
  page.captured.push({ kind: "console", text: "later" });
  check("...and a later capture is picked up on the next read",
        errorLog.errors[3] === "console: later", errorLog.errors.length + " held");
  errorLog.errors.splice(0);
  check("a check that splices the list does not make it re-report what it audited",
        errorLog.errors.length === 0, errorLog.errors.length + " held");
}

{
  check("a long list is summarised, with a count of the rest",
        summarise(["a", "b", "c", "d"]) === "a | b | c (+1 more)",
        summarise(["a", "b", "c", "d"]));
}

console.log("");
console.log("github#151 -- the state audit");

// github#151 -- off unless asked for, and it leaves page.eval exactly as it found it
{
  const r = await run([pass("one"), pass("two")]);
  check("the audit is off by default", r.audit === null, String(r.audit));
  check("...and page.eval is never wrapped when it is off", r.evalRestored);
}

// github#151 -- what a check changed, and what it left off the job's baseline
{
  const r = await run([
    { name: "leaves the camera moved",
      fn: async (p) => { p.state["cam.ratio"] = "0.5"; return { ok: true, detail: "" }; } },
    pass("changes nothing"),
    { name: "moves it and puts it back",
      fn: async (p) => { p.state["cam.ratio"] = "9"; p.state["cam.ratio"] = "0.5";
                         return { ok: true, detail: "" }; } }
  ], { stateAudit: true,
       state: { "page.mounted": "true", "cam.ratio": "1", "state.selected": "null" } });

  const rows = r.audit.rows;
  check("the audit records one row per check", rows.length === 3, rows.length + " row(s)");
  check("a check that moved a key reports it as changed",
        rows[0].changed.length === 1 && rows[0].changed[0].key === "cam.ratio",
        JSON.stringify(rows[0].changed));
  check("...with the value on both sides",
        rows[0].changed[0].from === "1" && rows[0].changed[0].to === "0.5");
  check("...and as still off baseline", rows[0].dirty.some((d) => d.key === "cam.ratio"));
  check("a check that changed nothing reports nothing changed", rows[1].changed.length === 0);
  check("...but still reports what its predecessor left dirty",
        rows[1].dirty.some((d) => d.key === "cam.ratio"));
  check("the baseline is the state before the first check, not the first check's own",
        r.audit.base["cam.ratio"] === "1", r.audit.base["cam.ratio"]);
  check("a key moved and put back inside one check is not reported as changed by it",
        rows[2].changed.length === 0 && rows[2].dirty.length === 1,
        JSON.stringify(rows[2].changed) + " / " + JSON.stringify(rows[2].dirty));
}

// github#151 -- what a check read, and what the probe's own read must not be counted as
{
  const r = await run([
    { name: "reads the selection",
      fn: async (p) => { await p.eval("__vg.state.selected"); return { ok: true, detail: "" }; } }
  ], { stateAudit: true,
       state: { "page.mounted": "true", "state.selected": "null", "cam.ratio": "1",
                "store.settings": "{}" } });
  const reads = r.audit.rows[0].reads;
  check("an expression naming a key counts as a read of it",
        reads.includes("state.selected"), reads.join(", "));
  check("...and a key it never names does not", !reads.includes("cam.ratio"), reads.join(", "));
  // github#151 -- the probe itself names SETTINGS_KEY and localStorage, so store.settings
  // github#151 -- appearing here would mean the probe's own eval landed in the check's list
  check("the probe's own read is not counted as the check's",
        !reads.includes("store.settings"), reads.join(", "));
  check("the mount flag is never a read -- every expression names __vg",
        !reads.includes("page.mounted") && tokensFor("page.mounted").length === 0,
        reads.join(", "));
  check("page.eval is handed back after the run", r.evalRestored);
}

// github#151 -- keysRead is an upper bound by construction: it matches tokens, not semantics
{
  const keys = { "state.selected": "", "cam.ratio": "", "ui.vg-q": "", "store.settings": "" };
  check("a DOM id is the token for its own key",
        keysRead(keys, ['document.getElementById("vg-q").value']).join() === "ui.vg-q");
  check("the camera is reached through any of its accessors",
        keysRead(keys, ["__vg.renderer.getCamera().getState()"]).join() === "cam.ratio");
  check("the stored settings are reached through localStorage",
        keysRead(keys, ["window.localStorage.getItem(k)"]).join() === "store.settings");
  check("an expression naming none of them reads none",
        keysRead(keys, ["__vg.graph.order"]).length === 0);
  // github#151 -- the whole-word rule, which is what keeps the report worth reading
  check("a bare identifier is not read out of a longer word",
        keysRead({ "state.dim": "" }, ["res.dimAtGaps + dimmed"]).length === 0,
        keysRead({ "state.dim": "" }, ["res.dimAtGaps + dimmed"]).join());
  check("...but is found as a word", keysRead({ "state.dim": "" }, ["__vg.state.dim"]).length === 1);
  check("a DOM id with a dash still matches literally, where a word boundary means nothing",
        keysRead({ "ui.vg-q": "" }, ['$("vg-q")']).length === 1);
  check("a camera key carries its accessors as tokens, never the bare word",
        tokensFor("cam.ratio").includes("getCamera") && !tokensFor("cam.ratio").includes("ratio"),
        tokensFor("cam.ratio").join(", "));
}

// github#151 -- the coupling: a read of a key an earlier check left off baseline
{
  const job = {
    base: { "cam.ratio": "1", "state.selected": "null" },
    rows: [
      { name: "A moves the camera", changed: [{ key: "cam.ratio" }],
        dirty: [{ key: "cam.ratio", from: "1", to: "0.5" }], reads: [] },
      { name: "B reads the camera", changed: [],
        dirty: [{ key: "cam.ratio", from: "1", to: "0.5" }], reads: ["cam.ratio"] },
      { name: "C reads the selection", changed: [],
        dirty: [{ key: "cam.ratio", from: "1", to: "0.5" }], reads: ["state.selected"] }
    ]
  };
  const c = couplingReport(job);
  check("a check reading a key left dirty before it is reported as coupled",
        c.length === 1 && c[0].check === "B reads the camera", JSON.stringify(c));
  check("...and the report names who left it", c[0].leftBy === "A moves the camera", c[0].leftBy);
  check("...with the value it inherited", c[0].was === "0.5", c[0].was);
  check("a read of a key still at baseline is not a coupling",
        !c.some((x) => x.key === "state.selected"));
  check("the check that left the key is not reported as coupled to itself",
        !c.some((x) => x.check === "A moves the camera"));

  const leaks = leakReport(job);
  check("a leak is reported once, at the check that first took the key off baseline",
        leaks.length === 1 && leaks[0].check === "A moves the camera" &&
        leaks[0].keys.join() === "cam.ratio", JSON.stringify(leaks));
}

// github#151 -- diffing, both directions
{
  const d = diffState({ a: "1", gone: "x" }, { a: "2", fresh: "y" });
  const by = Object.fromEntries(d.map((x) => [x.key, x]));
  check("a changed key reports both sides", by.a && by.a.from === "1" && by.a.to === "2");
  check("a key that disappeared is reported as absent", by.gone && by.gone.to === "(absent)");
  check("a key that appeared is reported as absent before",
        by.fresh && by.fresh.from === "(absent)");
  check("an unchanged map diffs to nothing", diffState({ a: "1" }, { a: "1" }).length === 0);
}

console.log("");
console.log("github#151 -- the reset boundary");

// github#151 -- a check that leaves a key changed fails, and the one after it does not
{
  const r = await run([
    pass("leaves nothing behind"),
    { name: "leaves the camera moved",
      fn: async (p) => { p.state["cam.ratio"] = "0.5"; return { ok: true, detail: "42 notes" }; } },
    pass("inherits it and touches nothing")
  ], { stateBoundary: true,
       state: { "page.mounted": "true", "cam.ratio": "1", "state.selected": "null" } });

  check("a check that left a key off baseline fails", r.failed === 1, "failed " + r.failed);
  check("...naming the key and both values",
        /left the page off its baseline: cam\.ratio 1 -> 0\.5/.test(r.text),
        r.text.split("\n").join(" / "));
  check("...while its own detail is kept",
        /42 notes \| left the page off its baseline/.test(r.text));
  check("the check before it is untouched", / {2}ok {3}leaves nothing behind/.test(r.text));
  check("the check AFTER it passes -- one leak must not fail every check that follows",
        / {2}ok {3}inherits it and touches nothing/.test(r.text), r.text.split("\n").join(" / "));
}

// github#151 -- a key moved and put back inside one check is not a leak
{
  const r = await run([
    { name: "moves the camera and puts it back",
      fn: async (p) => { p.state["cam.ratio"] = "9"; p.state["cam.ratio"] = "1";
                         return { ok: true, detail: "" }; } }
  ], { stateBoundary: true, state: { "page.mounted": "true", "cam.ratio": "1" } });
  check("a check that restores what it changed is clean", r.failed === 0, "failed " + r.failed);
}

// github#151 -- and a check may DECLARE what it leaves, which is the point: the coupling
// github#151 -- becomes visible in the source instead of implicit in the order
{
  const r = await run([
    { name: "switches the disc and says so", leaves: ["state.dim"],
      fn: async (p) => { p.state["state.dim"] = "tag"; return { ok: true, detail: "" }; } },
    { name: "switches the disc back, cleaning up after it",
      fn: async (p) => { p.state["state.dim"] = "folder"; return { ok: true, detail: "" }; } },
    { name: "switches the disc and declares nothing",
      fn: async (p) => { p.state["state.dim"] = "tag"; return { ok: true, detail: "" }; } }
  ], { stateBoundary: true, state: { "page.mounted": "true", "state.dim": "folder" } });
  check("a declared key may be left off baseline",
        / {2}ok {3}switches the disc and says so/.test(r.text), r.text.split("\n").join(" / "));
  check("a check that puts an inherited key BACK is not scored for touching it",
        / {2}ok {3}switches the disc back, cleaning up after it/.test(r.text),
        r.text.split("\n").join(" / "));
  check("...and an undeclared leak still fails", r.failed === 1, "failed " + r.failed);
}

// github#151 -- the rule itself: newly off baseline, never merely changed
{
  const base = { a: "1", b: "1" };
  check("a key taken off baseline is a new leak",
        newLeaks(base, { a: "1", b: "1" }, { a: "2", b: "1" }).map((d) => d.key).join() === "a");
  check("a key already off baseline is not the next check's leak",
        newLeaks(base, { a: "2", b: "1" }, { a: "2", b: "1" }).length === 0);
  check("a key moved from one off-baseline value to another is not a new leak either",
        newLeaks(base, { a: "2", b: "1" }, { a: "3", b: "1" }).length === 0);
  check("restoring an inherited key is never a leak",
        newLeaks(base, { a: "2", b: "1" }, { a: "1", b: "1" }).length === 0);
}

// github#151 -- the declaration covers a family by prefix, and nothing wider
{
  check("an exact key is allowed", allowedToLeave("state.dim", ["state.dim"]));
  check("a trailing dot covers the family", allowedToLeave("state.hidden", ["state."]));
  check("...and nothing outside it", !allowedToLeave("cam.ratio", ["state."]));
  check("a bare prefix with no dot is not a wildcard",
        !allowedToLeave("state.dim", ["state"]));
  check("declaring nothing allows nothing", !allowedToLeave("state.dim", []) &&
        !allowedToLeave("state.dim", undefined));
}

// github#151 -- the boundary is off unless asked for, and costs nothing when it is
{
  const r = await run([
    { name: "leaves the camera moved",
      fn: async (p) => { p.state["cam.ratio"] = "0.5"; return { ok: true, detail: "" }; } }
  ], { state: { "page.mounted": "true", "cam.ratio": "1" } });
  check("with the boundary off, a leak does not fail anything", r.failed === 0,
        "failed " + r.failed);
  check("...and nothing is audited either", r.audit === null);
}

// github#151 -- the boundary alone needs no audit rows, and the audit alone scores nothing
{
  const leak = [{ name: "leaves the camera moved",
                  fn: async (p) => { p.state["cam.ratio"] = "0.5"; return { ok: true, detail: "" }; } }];
  const b = await run(leak, { stateBoundary: true,
                              state: { "page.mounted": "true", "cam.ratio": "1" } });
  check("the boundary without the audit still fails the leak and reports no rows",
        b.failed === 1 && b.audit === null, "failed " + b.failed + ", audit " + b.audit);
  const a = await run(leak, { stateAudit: true,
                              state: { "page.mounted": "true", "cam.ratio": "1" } });
  check("the audit without the boundary records the leak and fails nothing",
        a.failed === 0 && a.audit.rows[0].changed.length === 1,
        "failed " + a.failed);
}

// github#151 -- a probe that could not run scores nothing, rather than reading as the whole
// github#151 -- page vanishing and failing every check after it with 125 keys
{
  check("a good sample is readable", readable({ "page.mounted": "true", "cam.ratio": "1" }));
  check("a probe that threw is not", !readable({ "probe.error": "page threw" }));
  check("a page that is not mounted is not", !readable({ "page.mounted": "false" }));
  check("nothing at all is not", !readable(null) && !readable({}));

  const r = await run([
    { name: "kills the probe",
      fn: async (p) => { p.state = { "probe.error": "page threw" }; return { ok: true, detail: "" }; } },
    pass("runs after it")
  ], { stateBoundary: true, state: { "page.mounted": "true", "cam.ratio": "1" } });
  check("an unreadable sample fails nothing on its own", r.failed === 0, "failed " + r.failed);
}

console.log("");
console.log(failed ? failed + " FAILED" : "all good");
process.exit(failed ? 1 : 0);
