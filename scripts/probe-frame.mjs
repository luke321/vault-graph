#!/usr/bin/env node
// github#19

import { attach } from "./cdp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leftWindowArgs } from "./screen.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.indexOf("--" + n) >= 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPS = Number(arg("reps", "8"));
const GROUP = arg("group", "");
const ROUNDS = Math.max(1, Number(arg("rounds", "1")));
const PROFILE = has("profile");
const MODES = [];
if (has("fit")) MODES.push("fit");
if (has("nofit")) MODES.push("nofit");
if (!MODES.length) MODES.push("fit");

function findChrome() {
  const named = arg("chrome", "");
  if (named) return named;
  const win = ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]
    .map((v) => process.env[v]).filter(Boolean)
    .map((b) => join(b, "Google", "Chrome", "Application", "chrome.exe"));
  for (const g of win.concat([
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"])) if (existsSync(g)) return g;
  throw new Error("Chrome not found; pass --chrome <path>");
}

function freePort() {
  return new Promise((res, rej) => import("node:net").then(({ createServer }) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  }));
}

const vault = resolve(arg("vault", join(ROOT, "test-vault")));
let html = arg("html", "");
if (!html) {
  html = join(mkdtempSync(join(tmpdir(), "vg-fr-")), "vault-graph.html");
  const b = spawnSync(process.execPath,
    [join(ROOT, "src", "build-graph.mjs"), "--out", html, "--vault", vault], { encoding: "utf8" });
  if (b.status !== 0) throw new Error("build failed:\n" + (b.stderr || ""));
  process.stdout.write(b.stdout || "");
}

const pad = (v, w) => String(v).padStart(w);
const q = (xs, p) => (xs.length ? xs.slice().sort((a, c) => a - c)[
  Math.min(xs.length - 1, Math.floor(p * (xs.length - 1)))] : 0);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

const ANCHOR = "function mountVaultGraph(";
const htmlLines = readFileSync(html, "utf8").split("\n");
const pageLines = readFileSync(join(ROOT, "src", "page.js"), "utf8").split("\n");
const OFF = htmlLines.findIndex((l) => l.includes(ANCHOR)) - pageLines.findIndex((l) => l.includes(ANCHOR));
const where = (ln0) => {
  const p = ln0 - OFF;
  return p >= 0 && p < pageLines.length ? "page.js:" + (p + 1) : "L" + ln0;
};

const TARGETS = ["step", "buildWedgePlan", "ringsLayout", "refresh", "addNode", "measureFit", "dotPx",
                 "process", "render", "placeLogo", "heatDraw", "placeCell", "roomOf", "isPushed",
                 "settle", "(garbage collector)"];

function profileTables(p, nf) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const selfOf = new Map();
  const dt = p.timeDeltas || [];
  for (let i = 0; i < p.samples.length; i++) {
    selfOf.set(p.samples[i], (selfOf.get(p.samples[i]) || 0) + (dt[i] || 0) / 1000);
  }
  const name = (n) => (n.callFrame.functionName || "(anonymous)");
  const key = (n) => name(n) + "@" + where(n.callFrame.lineNumber);
  const incl = new Map();
  const inclOf = (n) => {
    if (incl.has(n.id)) return incl.get(n.id);
    let s = selfOf.get(n.id) || 0;
    for (const c of (n.children || [])) s += inclOf(byId.get(c));
    incl.set(n.id, s);
    return s;
  };
  const isChild = new Set();
  for (const n of p.nodes) for (const c of (n.children || [])) isChild.add(c);
  const roots = p.nodes.filter((n) => !isChild.has(n.id));
  const total = roots.reduce((a, n) => a + inclOf(n), 0);
  const inclByName = new Map();
  const visit = (n, active) => {
    const nm = name(n);
    let act = active;
    if (TARGETS.includes(nm) && !active.has(nm)) {
      inclByName.set(nm, (inclByName.get(nm) || 0) + inclOf(n));
      act = new Set(active); act.add(nm);
    }
    for (const c of (n.children || [])) visit(byId.get(c), act);
  };
  for (const n of roots) visit(n, new Set());
  console.log(`\n        profile: ${r1(total)} ms sampled over ${nf} frames = ${r1(total / nf)} ms/frame; inclusive per frame:\n`);
  for (const t of TARGETS) {
    const v = inclByName.get(t);
    if (v === undefined) continue;
    console.log("          " + t.padEnd(22) + pad(r2(v / nf), 8) + " ms/frame " + pad(r1(v), 9) + " ms");
  }
  const subtreeSelf = (rootName) => {
    const acc = new Map();
    const walk = (n) => {
      acc.set(key(n), (acc.get(key(n)) || 0) + (selfOf.get(n.id) || 0));
      for (const c of (n.children || [])) walk(byId.get(c));
    };
    for (const n of p.nodes) if (name(n) === rootName) walk(n);
    return [...acc.entries()].sort((a, c) => c[1] - a[1]);
  };
  for (const rootName of ["buildWedgePlan", "ringsLayout", "refresh"]) {
    const rows = subtreeSelf(rootName);
    if (!rows.length) continue;
    const tot = rows.reduce((a, r) => a + r[1], 0);
    console.log(`\n        self time inside ${rootName} (${r2(tot / nf)} ms/frame):\n`);
    for (const [k, v] of rows.slice(0, 12)) console.log("          " + k.padEnd(48) + pad(r2(v / nf), 8) + " ms/frame");
  }
  const selfByKey = new Map();
  for (const n of p.nodes) selfByKey.set(key(n), (selfByKey.get(key(n)) || 0) + (selfOf.get(n.id) || 0));
  console.log("\n        self-time leaders (ms/frame):\n");
  for (const [k, v] of [...selfByKey.entries()].sort((a, c) => c[1] - a[1]).slice(0, 22)) {
    console.log("          " + k.padEnd(48) + pad(r2(v / nf), 8));
  }
  console.log("");
}

async function runMode(mode, round) {
  const url = pathToFileURL(html).href + (mode === "nofit" ? "?nofit" : "");
  const PORT = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "vg-fr-prof-"));
  const chrome = spawn(findChrome(), [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check",
    "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    ...leftWindowArgs(1600, 1000), `--app=${url}`,
  ], { stdio: "ignore" });
  const out = { mode, round, terms: null, dirs: {} };
  let page = null;
  try {
    for (let i = 0; i < 60 && !page; i++) {
      await sleep(500);
      try { page = await attach(PORT, ""); } catch { }
    }
    if (!page) throw new Error("could not attach");
    page.j = async (e) => JSON.parse(await page.eval("JSON.stringify(" + e + ")"));
    await page.send("Performance.enable", {});
    const metrics = async () => {
      const r = await page.send("Performance.getMetrics", {});
      const o = {};
      for (const m of r.metrics) o[m.name] = m.value;
      return o;
    };
    for (let i = 0; i < 120; i++) {
      if (await page.j("!!(window.__vg && __vg.lastCascade().exit && !__vg.demo.busy())").catch(() => false)) break;
      await sleep(300);
    }
    await sleep(2000);

    const info = await page.j(`({ nodes: __vg.graph.order, edges: __vg.graph.size, fit: !!__vg.fitCap })`);
    if (info.fit !== (mode === "fit")) throw new Error(`the page reports fitCap=${info.fit} in mode ${mode}`);
    console.log(`\n=== ${mode}${ROUNDS > 1 ? " round " + round : ""}: ${info.nodes} notes, ${info.edges} links in the graph` +
                `, Size dots from the frame ${info.fit ? "on" : "off"}\n`);

    const terms = await page.j(`(function () {
      var g = __vg.graph, R = __vg.renderer;
      var W = function (id) { return __vg.alpha[id] || 0; };
      var med = function (xs) { xs.sort(function (a, b) { return a - b; });
                                return Math.round(xs[xs.length >> 1] * 100) / 100; };
      var time = function (fn) {
        var o = [];
        for (var i = 0; i < ${REPS}; i++) { var t = performance.now(); fn(); o.push(performance.now() - t); }
        return med(o);
      };
      var plan = __vg.buildWedgePlan(true, W);
      return {
        cells: plan ? plan.cells.length : 0,
        walk:    time(function () { var n = 0; g.forEachNode(function () { n++; }); return n; }),
        plan:    time(function () { __vg.buildWedgePlan(true, W); }),
        layout:  time(function () { __vg.ringsLayout(plan, true); }),
        refresh: time(function () { R.refresh(); }),
        render:  time(function () { R.render(); }),
        logo:    time(function () { __vg.placeLogo(); }),
        follow:  time(function () {
          g.forEachNode(function (id, a) { g.mergeNodeAttributes(id, { x: a.x, y: a.y }); });
        }),
      };
    })()`);
    out.terms = terms;
    console.log(`  one call at rest, median of ${REPS} (ms); the plan has ${terms.cells} cells\n`);
    for (const k of ["walk", "plan", "layout", "refresh", "render", "logo", "follow"]) {
      console.log("    " + k.padEnd(10) + pad(terms[k], 8));
    }
    console.log("\n    plan + layout + refresh = " + r1(terms.plan + terms.layout + terms.refresh) + " ms of nominal frame\n");

    const group = GROUP || await page.j(`(function () {
      var gs = __vg.groupOrder(), best = null, bn = 0;
      gs.forEach(function (g) { var n = __vg.groupCount(g); if (n > bn) { bn = n; best = g; } });
      return best;
    })()`);
    if (PROFILE) {
      await page.send("Profiler.enable", {});
      await page.send("Profiler.setSamplingInterval", { interval: 100 });
    }
    const gn = await page.j(`__vg.groupCount(${JSON.stringify(group)})`);
    console.log(`  toggling ${JSON.stringify(group)} (${gn} notes) from rest\n`);

    for (const dir of ["hide", "show"]) {
      await page.eval(`(function () {
        window.__ft = [];
        if (!window.__ftOn) {
          window.__ftOn = true;
          (function loop(t) { window.__ft.push(t); requestAnimationFrame(loop); })(performance.now());
        }
      })(); void 0`);
      await sleep(700);
      await page.eval(`(function () { window.__ft.length = 0; window.__t0 = performance.now(); })(); void 0`);
      const clicked = await page.j(`(function () {
        var b = document.querySelector('[data-eye="' +
          ${JSON.stringify(group)}.replace(/"/g, '\\\\"') + '"]');
        if (!b) return false; b.click(); return true; })()`);
      if (!clicked) throw new Error(`no eye button for ${group}`);
      if (PROFILE) await page.send("Profiler.start", {});
      const m0 = await metrics();
      for (let k = 0; k < 40; k++) {
        if (await page.j("!!__vg.demo.busy()").catch(() => false)) break;
        await sleep(50);
      }
      for (let k = 0; k < 600; k++) {
        if (!(await page.j("!!__vg.demo.busy()").catch(() => false))) break;
        await sleep(120);
      }
      const m1 = await metrics();
      const prof = PROFILE ? await page.send("Profiler.stop", {}) : null;
      const t1 = await page.j("performance.now()");
      const ft = await page.j("window.__ft");
      const t0 = await page.j("window.__t0");
      const inWin = ft.filter((t) => t >= t0 && t <= t1);
      const gaps = [];
      for (let i = 1; i < inWin.length; i++) gaps.push(inWin[i] - inWin[i - 1]);
      const over = (n) => gaps.filter((g) => g > n).length;
      const lc = await page.j("(function(){ var c = __vg.lastCascade(); return c ? { frames: c.frames, ms: c.ms," +
        " path: c.path, exit: c.exit || null, ins: c.ins, outs: c.outs } : null; })()").catch(() => null);
      const nf = Math.max(1, lc ? lc.frames : gaps.length);
      const scriptMs = (m1.ScriptDuration - m0.ScriptDuration) * 1000;
      const rec = {
        rafFrames: gaps.length, p50: r1(q(gaps, 0.5)), p90: r1(q(gaps, 0.9)), p99: r1(q(gaps, 0.99)),
        max: r1(Math.max(0, ...gaps)), over50: over(50),
        frames: lc ? lc.frames : 0, msPerFrame: lc ? r1(lc.ms / Math.max(1, lc.frames)) : 0,
        scriptPerFrame: r1(scriptMs / nf),
      };
      out.dirs[dir] = rec;
      console.log(`  ${dir}: ${gaps.length} frames over ${Math.round(t1 - t0)} ms` +
                  `  p50 ${rec.p50}  p90 ${rec.p90}  p99 ${rec.p99}  max ${rec.max}  >50ms ${rec.over50}/${gaps.length}`);
      if (lc) console.log(`        the page's own count: ${lc.frames} cascade frames in ${lc.ms} ms` +
                          ` (${rec.msPerFrame} ms/frame)  [${lc.path}; in ${lc.ins} out ${lc.outs}; exit ${lc.exit}]`);
      console.log(`        script ${r1(scriptMs)} ms total, ${rec.scriptPerFrame} ms/frame` +
                  ` (layout+style ${r1((m1.LayoutDuration - m0.LayoutDuration) * 1000)} ms total)`);
      if (prof && prof.profile && lc && lc.frames > 5) profileTables(prof.profile, lc.frames);
      await sleep(900);
    }
    if (has("keep")) { console.log("\n  --keep: leaving the page open, ^C to quit\n"); await sleep(600000); }
  } finally {
    try { if (page) await page.send("Browser.close"); } catch { }
    try { chrome.kill(); } catch { }
  }
  return out;
}

const results = [];
for (let r = 1; r <= ROUNDS; r++) for (const m of MODES) results.push(await runMode(m, r));

if (results.length > 1) {
  console.log("\n===== summary =====\n");
  console.log("  mode/round   plan  layout  refresh | dir   cascade frames  ms/frame  script/frame  rAF p50   p90  >50ms");
  for (const o of results) {
    const t = o.terms;
    for (const [d, rec] of Object.entries(o.dirs)) {
      if (!rec.frames) continue;
      console.log("  " + (o.mode + "/" + o.round).padEnd(12) + pad(t.plan, 5) + pad(t.layout, 8) + pad(t.refresh, 9) +
                  " | " + d.padEnd(5) + pad(rec.frames, 15) + pad(rec.msPerFrame, 10) + pad(rec.scriptPerFrame, 14) +
                  pad(rec.p50, 9) + pad(rec.p90, 6) + pad(rec.over50 + "/" + rec.rafFrames, 8));
    }
  }
  console.log("");
}
