#!/usr/bin/env node
// github#19
// github#19

import { attach } from "./cdp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.indexOf("--" + n) >= 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPS = Number(arg("reps", "8"));
const GROUP = arg("group", "");

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
const html = join(mkdtempSync(join(tmpdir(), "vg-fr-")), "vault-graph.html");
const b = spawnSync(process.execPath,
  [join(ROOT, "src", "build-graph.mjs"), "--out", html, "--vault", vault], { encoding: "utf8" });
if (b.status !== 0) throw new Error("build failed:\n" + (b.stderr || ""));
process.stdout.write(b.stdout || "");

const PORT = await freePort();
const profile = mkdtempSync(join(tmpdir(), "vg-fr-prof-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check",
  "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--window-position=-2400,0", "--window-size=1600,1000", `--app=${pathToFileURL(html).href}`,
], { stdio: "ignore" });

const pad = (v, w) => String(v).padStart(w);
const q = (xs, p) => (xs.length ? xs.slice().sort((a, c) => a - c)[
  Math.min(xs.length - 1, Math.floor(p * (xs.length - 1)))] : 0);
const r1 = (x) => Math.round(x * 10) / 10;

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
    const out = {};
    for (const m of r.metrics) out[m.name] = m.value;
    return out;
  };
  for (let i = 0; i < 120; i++) {
    if (await page.j("!!(window.__vg && __vg.state.until === null)").catch(() => false)) break;
    await sleep(300);
  }
  await sleep(2000);

  const size = await page.j(`({ nodes: __vg.graph.order, edges: __vg.graph.size })`);
  console.log(`\n${size.nodes} notes, ${size.edges} links in the graph\n`);

  // ---------------------------------------------------------------- the terms
  const terms = await page.j(`(function () {
    var g = __vg.graph, R = __vg.renderer;
    var W = function (id) { return __vg.alpha[id] || 0; };
    var nodes = g.nodes(), edges = g.edges();
    var med = function (xs) { xs.sort(function (a, b) { return a - b; });
                              return Math.round(xs[xs.length >> 1] * 100) / 100; };
    var time = function (fn) {
      var out = [];
      for (var i = 0; i < ${REPS}; i++) { var t = performance.now(); fn(); out.push(performance.now() - t); }
      return med(out);
    };
    var plan = __vg.buildWedgePlan(true, W);
    return {
      walk:        time(function () { var n = 0; g.forEachNode(function () { n++; }); return n; }),
      plan:        time(function () { __vg.buildWedgePlan(true, W); }),
      layout:      time(function () { __vg.ringsLayout(plan, true); }),
      refreshSkip: time(function () { R.refresh({ skipIndexation: true }); }),
      refreshFull: time(function () { R.refresh({ skipIndexation: false }); }),
      // The path sigma actually documents as the cheap one, and which this page never used.
      // Included as a TERM rather than as a change, so the "is skipIndexation cheap" claim in
      // github#19 can be checked against the alternative in the same run.
      refreshPart: time(function () {
        R.refresh({ partialGraph: { nodes: nodes, edges: edges }, skipIndexation: true });
      }),
      render:      time(function () { R.render(); }),
      // THE LOGO, which repaints from afterRender and therefore once per animated frame.
      // Worth a line of its own because it is not obviously part of a frame at all: it
      // samples the ring's colours, and each sample is a full graph walk.
      logo:        time(function () { __vg.placeLogo(); }),
      // THE FOLLOWER LOOP, which nothing in github#19 measured and which is not free.
      // graphology emits nodeAttributesUpdated per call, and sigma is listening: its handler
      // runs updateNode (one nodeReducer pass for that node) and then refresh({partialGraph:
      // {nodes:[id]}}), which runs updateNode AGAIN and arms needToProcess. So the cascade's
      // one write per note is three reducer passes over the vault per frame, two of them
      // thrown away by the explicit refresh that follows.
      follow: time(function () {
        g.forEachNode(function (id, a) { g.mergeNodeAttributes(id, { x: a.x, y: a.y }); });
      }),
      // The same loop with sigma's per-node listener off. The difference is the prize.
      followQuiet: (function () {
        var h = R.activeListeners && R.activeListeners.updateNodeGraphUpdate;
        if (!h) return null;
        g.removeListener("nodeAttributesUpdated", h);
        try {
          return time(function () {
            g.forEachNode(function (id, a) { g.mergeNodeAttributes(id, { x: a.x, y: a.y }); });
          });
        } finally { g.on("nodeAttributesUpdated", h); }
      })(),
    };
  })()`);
  console.log("  one call at rest, median of " + REPS + " (ms)\n");
  for (const [k, v] of Object.entries(terms)) console.log("    " + k.padEnd(14) + pad(v, 8));
  console.log("\n    plan + layout + refreshSkip = " +
              r1(terms.plan + terms.layout + terms.refreshSkip) + " ms of nominal frame\n");

  // --------------------------------------------------------------- the frames
  const group = GROUP || await page.j(`(function () {
    // The biggest folder that is not the whole vault: the worst toggle is the one that moves
    // the most notes, and a probe that picks a small one reports a page that is fine.
    var gs = __vg.groupOrder(), best = null, bn = 0;
    gs.forEach(function (g) { var n = __vg.groupCount(g); if (n > bn) { bn = n; best = g; } });
    return best;
  })()`);
  // github#19
  const profile = has("profile");
  if (profile) {
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
    if (profile) await page.send("Profiler.start", {});
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
    const prof = profile ? await page.send("Profiler.stop", {}) : null;
    const t1 = await page.j("performance.now()");
    const ft = await page.j("window.__ft");
    const t0 = await page.j("window.__t0");
    const inWin = ft.filter((t) => t >= t0 && t <= t1);
    const gaps = [];
    for (let i = 1; i < inWin.length; i++) gaps.push(inWin[i] - inWin[i - 1]);
    const over = (n) => gaps.filter((g) => g > n).length;
    console.log(`  ${dir}: ${gaps.length} frames over ${Math.round(t1 - t0)} ms` +
                `  p50 ${r1(q(gaps, 0.5))}  p90 ${r1(q(gaps, 0.9))}` +
                `  p99 ${r1(q(gaps, 0.99))}  max ${r1(Math.max(0, ...gaps))}` +
                `  >50ms ${over(50)}/${gaps.length}`);
    const lc = await page.j("(function(){ var c = __vg.lastCascade(); return c ? { frames: c.frames, ms: c.ms," +
      " path: c.path, exit: c.exit || null, ins: c.ins, outs: c.outs } : null; })()").catch(() => null);
    if (lc) console.log(`        the page's own count: ${lc.frames} cascade frames in ${lc.ms} ms` +
                        ` (${r1(lc.ms / Math.max(1, lc.frames))} ms/frame)` +
                        `  [${lc.path}; in ${lc.ins} out ${lc.outs}; exit ${lc.exit}]`);
    const scriptMs = (m1.ScriptDuration - m0.ScriptDuration) * 1000;
    const layoutMs = (m1.LayoutDuration - m0.LayoutDuration) * 1000;
    const nf = Math.max(1, lc ? lc.frames : gaps.length);
    console.log(`        script ${r1(scriptMs)} ms total, ${r1(scriptMs / nf)} ms/frame` +
                ` (layout+style ${r1(layoutMs)} ms total)`);
    if (prof && prof.profile) {
      const p = prof.profile;
      const byId = new Map(p.nodes.map((n) => [n.id, n]));
      const self = new Map();
      const dt = p.timeDeltas || [];
      for (let i = 0; i < p.samples.length; i++) {
        const n = byId.get(p.samples[i]);
        if (!n) continue;
        const cf = n.callFrame;
        const key = (cf.functionName || "(anonymous)") + ":" + cf.lineNumber;
        self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000);
      }
      const rows = [...self.entries()].sort((a, c) => c[1] - a[1]).slice(0, 22);
      const tot = [...self.values()].reduce((a, c) => a + c, 0);
      console.log(`\n        self time over the cascade (${r1(tot)} ms sampled, ${nf} frames)\n`);
      for (const [k, v] of rows) {
        console.log("          " + k.padEnd(42) + pad(r1(v), 8) + " ms " +
                    pad(r1(v / nf), 7) + " ms/frame");
      }
      console.log("");
    }
    await sleep(900);
  }

  if (has("keep")) { console.log("\n  --keep: leaving the page open, ^C to quit\n"); await sleep(600000); }
} finally {
  try { if (page) await page.send("Browser.close"); } catch { }
  try { chrome.kill(); } catch { }
}
