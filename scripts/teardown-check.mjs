#!/usr/bin/env node
// github#62

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
const KILL = argv.includes("--kill");     // github#62
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
    if (QUICK) await sleep(1000);
    else if (!(await ready(120000))) problems.push(`cycle ${c}: the remount never settled`);
    await p.eval(`window.__vgOld = null; void 0`);
    const c1 = await counters();
    rows.push(c1);
    console.log(row(`cycle ${c}`, c1, old));
  }
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
  try { await p?.send("Browser.close"); } catch { }
  try { p?.close(); } catch { }
  await sleep(300);
  try { chrome.kill(); } catch { }
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
