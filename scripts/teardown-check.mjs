#!/usr/bin/env node
// Does tearing a mount down release it?
//
//   node scripts/teardown-check.mjs --vault ./demo-vault            # 6 cycles, at rest
//   node scripts/teardown-check.mjs --vault ./demo-vault --quick    # tear down mid-intro
//   node scripts/teardown-check.mjs --url file:///.../vault-graph.html --cycles 10
//   node scripts/teardown-check.mjs --vault ./demo-vault --kill     # the pre-#62 sequence: it fails
//
// WHY THIS EXISTS. The plugin's teardown used to be `api.renderer.kill()` and an emptied
// container, which released the WebGL contexts and nothing else (github#62): the mount stayed
// alive through the mousemove and visibilitychange listeners it had put on the document and
// the ResizeObservers on its root, so every view close, popout and Refresh in Obsidian retained
// a whole graph. Measured on the 10k fixture over six kill+remount cycles: +579 DOM nodes, +131
// listeners, one more document mousemove and one more visibilitychange listener, +7 MB of
// post-GC heap, per cycle. mountVaultGraph's handle carries destroy() now, and this is the
// check that it releases what the issue lists -- run on the standalone build, because the
// plugin's teardown is the same sequence (destroy, then empty the root) and the standalone is
// the one host CDP can read heap and listener counts out of.
//
// MANUAL, NOT PART OF smoke.mjs, because a cycle replaces the page's root and mounts a new
// __vg; the suite's checks share one page and none of them could run after that. It launches
// its own Chrome for about a minute and is otherwise self-contained.
//
// What one cycle does is the plugin's own sequence: the old handle's destroy(), the root
// replaced with a fresh copy of src/page.html, mountVaultGraph() on it. After each cycle the
// heap is collected twice and four numbers are read: post-GC heap, DOM nodes, JS event
// listeners (Memory.getDOMCounters), and the document's own mousemove / visibilitychange
// listener counts (getEventListeners). The OLD mount is also asked, 400ms after its teardown,
// whether it is still animating -- a torn-down mount that answers busy is running a cascade
// nobody can see.
//
// A reference to the previous mount's api is kept across the remount so it can be asked about
// its cascade, and dropped before the counters are read, so a retained mount shows up as growth
// and nothing else does. Growth is measured from cycle 1 (a remount is the same markup and the
// same registrations every time). Measured with destroy() on the 10k fixture: 14.1 -> 14.4 MB,
// 632 -> 633 nodes, 140 -> 140 listeners, 2/1 -> 2/1 document listeners over six cycles -- the
// load baseline, held. --kill runs the sequence the plugin used before (renderer.kill() and
// nothing else) so the leak can be seen on demand: it fails on every build, which is the point.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { attach } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const CYCLES = Math.max(2, Number(arg("cycles", "6")) || 6);
const QUICK = argv.includes("--quick");
const KILL = argv.includes("--kill");     // renderer.kill() alone -- the sequence before github#62
const MARKUP = readFileSync(join(ROOT, "src", "page.html"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const named = arg("chrome", "");
  if (named) return named;
  const guesses = [
    process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ];
  for (const g of guesses) if (g && existsSync(g)) return g;
  throw new Error("Chrome not found; pass --chrome <path>");
}

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
  s.on("error", rej);
});

// The page: --url as given, else built from --vault into a temp file (never into the vault).
let url = arg("url", "");
let scratch = null;
if (!url) {
  const vault = arg("vault", "");
  if (!vault) { console.error("pass --vault <generated vault> or --url <built page>"); process.exit(2); }
  scratch = mkdtempSync(join(tmpdir(), "vg-teardown-build-"));
  const out = join(scratch, "vault-graph.html");
  const b = spawnSync(process.execPath, [join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", out],
                      { encoding: "utf8" });
  if (b.status !== 0) { console.error(b.stderr || b.stdout); process.exit(1); }
  console.log((b.stdout || "").trimEnd());
  url = pathToFileURL(out).href + (QUICK ? "" : "?rest");
}

const PORT = await freePort();
const profile = mkdtempSync(join(tmpdir(), "vg-teardown-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-component-update", "--disable-sync", "--no-service-autorun",
  "--metrics-recording-only", "--no-pings", "--mute-audio", "--disable-breakpad",
  "--disable-crash-reporter",
  // Off-screen but never occluded -- the same reasoning as smoke.mjs: every number here is
  // downstream of a frame, and Windows backgrounds a window nobody can see.
  "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--window-position=-2400,0", "--window-size=1600,1000", `--app=${url}`,
], { stdio: ["ignore", "ignore", "ignore"] });

let p = null;
for (let i = 0; i < 100 && !p; i++) {
  try { p = await attach(PORT, "vault-graph"); } catch { await sleep(200); }
}
if (!p) { chrome.kill(); throw new Error("could not attach to Chrome on port " + PORT); }

const j = async (expr) => JSON.parse(await p.eval(`JSON.stringify((function(){ return (${expr}); })())`) ?? "null");
// getEventListeners is a console command-line API, so it needs the flag eval() does not pass.
const cli = async (expr) => {
  const r = await p.send("Runtime.evaluate", { expression: expr, returnByValue: true, includeCommandLineAPI: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
const ready = async (ms) => {
  const dl = Date.now() + ms;
  for (;;) {
    if (await j("!!window.__vg && !!__vg.demo && !!__vg.graph && !__vg.demo.busy()").catch(() => false)) return true;
    if (Date.now() > dl) return false;
    await sleep(200);
  }
};
const counters = async () => {
  await p.send("HeapProfiler.collectGarbage").catch(() => {});
  await sleep(300);
  await p.send("HeapProfiler.collectGarbage").catch(() => {});
  const heap = await p.send("Runtime.getHeapUsage");
  const dom = await p.send("Memory.getDOMCounters");
  const ls = await cli(`(function(){ var l = getEventListeners(document);
    return { move: (l.mousemove || []).length, vis: (l.visibilitychange || []).length }; })()`);
  return { heapMB: +(heap.usedSize / 1048576).toFixed(1), nodes: dom.nodes,
           listeners: dom.jsEventListeners, docMove: ls.move, docVis: ls.vis };
};
const row = (label, c, old) =>
  `${label.padEnd(8)} heap ${String(c.heapMB).padStart(6)} MB  nodes ${String(c.nodes).padStart(5)}  ` +
  `listeners ${String(c.listeners).padStart(4)}  document mousemove ${c.docMove}  visibilitychange ${c.docVis}` +
  (old ? `   old mount +400ms: busy ${old.busy}, cascade ${old.path} ${old.frames}f` : "");

const problems = [];
try {
  if (!(await ready(120000))) throw new Error("the page never settled (" + (p.firstError() || "no page error") + ")");
  await sleep(800);
  const load = await counters();
  console.log(row("load", load));
  const rows = [];
  for (let c = 1; c <= CYCLES; c++) {
    // THE PLUGIN'S SEQUENCE: destroy the handle, replace the root, mount again. The handle of
    // the first mount is the debug api's own destroy (the standalone keeps no handle); every
    // later one is the handle this loop was given back.
    await p.eval(`(function(){
      window.__vgOld = window.__vg;
      var h = window.__vgH || window.__vg;
      ${KILL ? "h.api ? h.api.renderer.kill() : h.renderer.kill();" : "h.destroy();"}
      var root = document.getElementById("vg-app");
      var t = document.createElement("template"); t.innerHTML = ${JSON.stringify(MARKUP)};
      var fresh = t.content.firstElementChild;
      root.replaceWith(fresh);
      var noop = function () {};
      window.__vgH = mountVaultGraph(fresh, window.VAULT_DATA, {
        Graph: window.VaultGraphEngine.GraphStore, Renderer: window.VaultGraphEngine.Renderer,
        logoMask: window.VAULT_LOGO_MASK || "", settingsUI: true,
        onFolderColors: noop, onSubfolderColors: noop, onFolderShown: noop, onPanEnabled: noop,
        onCompactAxis: noop, onUnlinkedByFolder: noop, onUnlinkedTintByFolder: noop, onPinned: noop });
    })(); void 0`);
    await sleep(400);
    const old = await j(`(function(){ var o = window.__vgOld, lc = o.lastCascade();
      return { busy: o.demo.busy(), path: lc.path, frames: lc.frames }; })()`);
    if (old.busy) problems.push(`cycle ${c}: the torn-down mount is still animating 400ms later (${old.path}, ${old.frames} frames)`);
    // Under --quick the next teardown lands mid-intro on purpose; otherwise wait for rest.
    if (QUICK) await sleep(1000);
    else if (!(await ready(120000))) problems.push(`cycle ${c}: the remount never settled`);
    // Drop the probe's own reference before counting, so the previous mount is collectable.
    await p.eval(`window.__vgOld = null; void 0`);
    const c1 = await counters();
    rows.push(c1);
    console.log(row(`cycle ${c}`, c1, old));
  }
  // GROWTH FROM CYCLE 1, not from load. Nodes and listeners must hold exactly
  // -- a remount is the same markup and the same registrations every time -- and the document's
  // two listeners must not gain one per cycle, which was the defect. Heap is allowed a little
  // drift per cycle (GC is not exhaustive), well under the 7 MB the leak cost.
  const first = rows[0], last = rows[rows.length - 1];
  const per = (a, b) => (b - a) / (rows.length - 1);
  if (last.nodes > first.nodes) problems.push(`DOM nodes grew ${first.nodes} -> ${last.nodes} (${per(first.nodes, last.nodes).toFixed(0)}/cycle)`);
  if (last.listeners > first.listeners) problems.push(`JS listeners grew ${first.listeners} -> ${last.listeners} (${per(first.listeners, last.listeners).toFixed(0)}/cycle)`);
  if (last.docMove !== load.docMove) problems.push(`document mousemove listeners ${load.docMove} -> ${last.docMove}`);
  if (last.docVis !== load.docVis) problems.push(`document visibilitychange listeners ${load.docVis} -> ${last.docVis}`);
  const HEAP_MB_PER_CYCLE = 1.5;
  if (per(first.heapMB, last.heapMB) > HEAP_MB_PER_CYCLE) {
    problems.push(`post-GC heap grew ${first.heapMB} -> ${last.heapMB} MB (${per(first.heapMB, last.heapMB).toFixed(2)} MB/cycle, bound ${HEAP_MB_PER_CYCLE})`);
  }
} catch (e) {
  problems.push(e.message);
} finally {
  try { await p?.send("Browser.close"); } catch { /* already gone */ }
  try { p?.close(); } catch { /* already gone */ }
  await sleep(300);
  try { chrome.kill(); } catch { /* already gone */ }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(chrome.pid)], { stdio: "ignore" });
  }
  rmSync(profile, { recursive: true, force: true });
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}

if (!problems.length) {
  console.log(`\nteardown-check: clean -- ${CYCLES} ${KILL ? "kill" : "destroy"}+remount cycles${QUICK ? " (mid-intro)" : ""}, nothing grew`);
  process.exit(0);
}
console.error(`\nteardown-check: ${problems.length} problem(s)`);
for (const m of problems) console.error("  " + m);
process.exit(1);
