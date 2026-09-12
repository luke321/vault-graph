#!/usr/bin/env node
// github#120 -- does anything grow while notes arrive continuously with the view open?
//
// Not a gate. This drives a REAL Obsidian for minutes; scripts/smoke.mjs stays Chrome-only
// and ~100 s. Run it by hand, read the table, and put the numbers in
// .ai-context/changelog-detail.md.
//
//   node scripts/live-growth-check.mjs --view open    --phase-sec 90
//   node scripts/live-growth-check.mjs --view closed  --phase-sec 90
//
// The closed run is the control: the same arrivals with no view, which separates the
// live-rebuild path (github#72, design/0014) from the mere act of writing files.

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attach } from "./cdp.mjs";
import { placeElectronLeft } from "./screen.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes("--" + n);

const VT = "vault-graph-view";
const PLUGIN_ID = "vault-graph";
const PORT = Number(arg("port", "9451"));
const VIEW_MODE = arg("view", "open");
const PHASE_SEC = Number(arg("phase-sec", "90"));
const SAMPLE_SEC = Number(arg("sample-sec", "15"));
const KEEP = flag("keep");
const NO_LOCK = flag("no-lock");
const OUT = arg("out", "");
const TEMP = process.env.TEMP || tmpdir();
const WORK = join(TEMP, "vault-graph-live-growth");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (VIEW_MODE !== "open" && VIEW_MODE !== "closed") {
  console.error("--view must be open or closed");
  process.exit(2);
}

// The three arrival rates github#120 names: well above the debounce, at it, below it.
const PHASES = [
  { name: "fast", rate: 5, note: "5/s -- every arrival cancels and re-arms the debounce" },
  { name: "debounce", rate: 1, note: "1/s -- at LIVE_DEBOUNCE_MS" },
  { name: "slow", rate: 0.5, note: "0.5/s -- below it, one rebuild per arrival" },
];

/* ------------------------------------------------------------------ inputs -- */

function findObsidian() {
  const named = arg("obsidian", "");
  if (named) return named;
  const guesses = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Obsidian", "Obsidian.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Obsidian", "Obsidian.exe"),
    "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
  ].filter(Boolean);
  for (const g of guesses) if (existsSync(g)) return g;
  throw new Error("Obsidian not found -- pass --obsidian <path to the executable>");
}

function fixtureStore() {
  const g = spawnSync("git", ["-C", ROOT, "rev-parse", "--git-common-dir"], { encoding: "utf8" });
  const common = g.status === 0 ? g.stdout.trim() : "";
  const abs = common ? (/^[A-Za-z]:[\\/]|^\//.test(common) ? common : join(ROOT, common)) : join(ROOT, ".git");
  return join(dirname(abs), ".fixtures");
}

function sourceVault() {
  const explicit = arg("vault", "");
  if (explicit) return resolve(explicit);
  const want = { demo: "demo-vault-", shape: "shape-vault-", "10k": "test-vault-" }[arg("fixture", "demo")];
  if (!want) throw new Error("--fixture must be demo, shape or 10k");
  const store = fixtureStore();
  const hit = existsSync(store)
    ? readdirSync(store).find((d) => d.startsWith(want) && statSync(join(store, d)).isDirectory())
    : null;
  if (!hit) {
    throw new Error("no " + want + "* fixture in " + store +
                    " -- run node scripts/smoke.mjs --only \"no console errors\" once to generate the store");
  }
  return join(store, hit);
}

function makeThrowawayVault(src) {
  for (const f of ["main.js", "manifest.json", "styles.css"]) {
    if (!existsSync(join(ROOT, f))) {
      throw new Error(f + " is missing at the repo root -- run: node scripts/build-plugin.mjs");
    }
  }
  const dest = join(WORK, basename(src));
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  cpSync(src, dest, { recursive: true,
                      filter: (p) => !/[\\/]\.obsidian[\\/](plugins|workspace\.json|workspace-mobile\.json)/.test(p) });
  const dot = join(dest, ".obsidian");
  mkdirSync(dot, { recursive: true });
  const plug = join(dot, "plugins", PLUGIN_ID);
  mkdirSync(plug, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) cpSync(join(ROOT, f), join(plug, f));
  writeFileSync(join(dot, "community-plugins.json"), JSON.stringify([PLUGIN_ID]) + "\n");
  return dest;
}

/* -------------------------------------------------------------------- lock -- */
// github#87 -- this harness places an Electron window on the leftmost screen, so it takes
// that display's own lock and releases it on every way out.

const LOCK = "screen-left";
const lockOwner = "live-growth-check #120 [" + process.pid + "]";
let holdsLock = false;

function takeLock() {
  if (NO_LOCK) return;
  const r = spawnSync(process.execPath, [join(HERE, "lock.mjs"), "acquire", LOCK, "--owner", lockOwner],
                      { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("could not take the " + LOCK + " lock -- something else is driving that display.");
    console.error("  who: node scripts/lock.mjs status");
    process.exit(1);
  }
  holdsLock = true;
}

function dropLock() {
  if (!holdsLock) return;
  holdsLock = false;
  try {
    spawnSync(process.execPath, [join(HERE, "lock.mjs"), "release", LOCK, "--owner", lockOwner], { stdio: "ignore" });
  } catch { void 0; }
}

/* ----------------------------------------------------------- working set -- */
// The JS heap cannot see WebGL buffers, textures or the GPU process. This can.

const PS_TREE = (rootPid) => [
  "$root = [int]" + rootPid + ";",
  "$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,PrivatePageCount;",
  "$byParent = @{}; foreach ($p in $all) { $k = [string]$p.ParentProcessId; if (-not $byParent.ContainsKey($k)) { $byParent[$k] = @() }; $byParent[$k] += $p };",
  "$seen = @{}; $queue = New-Object System.Collections.Queue; $queue.Enqueue($root); $out = @();",
  "while ($queue.Count -gt 0) { $pid2 = $queue.Dequeue(); if ($seen.ContainsKey([string]$pid2)) { continue }; $seen[[string]$pid2] = $true;",
  "  $self = $all | Where-Object { $_.ProcessId -eq $pid2 }; if ($self) { $out += $self };",
  "  $kids = $byParent[[string]$pid2]; if ($kids) { foreach ($k in $kids) { $queue.Enqueue($k.ProcessId) } } };",
  "$ws = ($out | Measure-Object -Property WorkingSetSize -Sum).Sum;",
  "$pv = ($out | Measure-Object -Property PrivatePageCount -Sum).Sum;",
  "[Console]::Out.Write((ConvertTo-Json @{ procs = $out.Count; ws = [double]$ws; priv = [double]$pv } -Compress))",
].join(" ");

function processTree(rootPid) {
  if (process.platform !== "win32") return { procs: -1, ws: -1, priv: -1 };
  const r = spawnSync("powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", PS_TREE(rootPid)],
    { encoding: "utf8", timeout: 30000 });
  if (r.status !== 0 || !r.stdout) return { procs: -1, ws: -1, priv: -1 };
  try { return JSON.parse(r.stdout.trim()); } catch { return { procs: -1, ws: -1, priv: -1 }; }
}

/* ---------------------------------------------------------------- Obsidian -- */

async function launchObsidian(vault, profile) {
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "obsidian.json"),
    JSON.stringify({ vaults: { "0000livegrowth00": { path: vault, ts: Date.now(), open: true } } }), "utf8");
  const child = spawn(findObsidian(), ["--remote-debugging-port=" + PORT, "--user-data-dir=" + profile],
                      { stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    let c = null;
    try { c = await attach(PORT, "app://obsidian.md"); } catch { continue; }
    try {
      if (await c.eval("typeof app !== 'undefined' && !!app.workspace")) return { child, cdp: c };
    } catch { void 0; }
    try { c.close(); } catch { void 0; }
  }
  try { child.kill(); } catch { void 0; }
  throw new Error("Obsidian never exposed its app on port " + PORT);
}

function killObsidian(child) {
  try { child.kill(); } catch { void 0; }
  if (process.platform === "win32") spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
}

// CLAUDE.md -- a generated vault opens untrusted, and until this runs the plugin reads as broken.
async function enablePlugin(c) {
  if (await c.eval("!!app.plugins.getPlugin(" + JSON.stringify(PLUGIN_ID) + ")")) return "already enabled";
  await c.eval("(async function(){ await app.plugins.setEnable(true); return true; })()");
  if (!(await c.eval("!!app.plugins.getPlugin(" + JSON.stringify(PLUGIN_ID) + ")"))) {
    await c.eval("(async function(){ await app.plugins.enablePluginAndSave(" + JSON.stringify(PLUGIN_ID) + "); return true; })()");
  }
  for (let i = 0; i < 120; i++) {
    if (await c.eval("!!app.plugins.getPlugin(" + JSON.stringify(PLUGIN_ID) + ")")) return "enabled now";
    await sleep(250);
  }
  const known = await c.eval("Object.keys(app.plugins.manifests || {})");
  throw new Error("plugin never loaded. Manifests Obsidian can see: " + JSON.stringify(known));
}

const VIEW = "(function(){ var ls = app.workspace.getLeavesOfType(" + JSON.stringify(VT) + "); return ls[0] && ls[0].view; })()";

async function openGraph(c) {
  const t0 = Date.now();
  await c.eval("app.commands.executeCommandById(" + JSON.stringify(PLUGIN_ID + ":open") + "); void 0");
  for (let i = 0; i < 400; i++) {
    const ok = await c.eval("(function(){ var v = " + VIEW + ";" +
      " return !!(v && v.handle && v.handle.api && v.handle.api.graph && window.__vg); })()").catch(() => false);
    if (ok) break;
    await sleep(300);
  }
  await atRest(c, 60000);
  return Date.now() - t0;
}

/** The disc is at rest when nothing is queued, nothing is drawing, and no dot moved. */
async function atRest(c, ms) {
  const deadline = Date.now() + ms;
  let prev = null, same = 0;
  for (;;) {
    const k = await c.eval("(function(){ var vg = window.__vg; if (!vg) return 'no-vg';" +
      " var s = vg.liveState(); if (s.pending || s.draining || s.busy) return 'busy';" +
      " var sum = 0; vg.graph.forEachNode(function (id, a) { sum += a.x + a.y + a.size; });" +
      " return vg.graph.order + '|' + sum.toFixed(3); })()").catch(() => "err");
    if (k !== "busy" && k !== "err" && k === prev) { if (++same >= 3) return true; } else { same = 0; }
    prev = k;
    if (Date.now() > deadline) return false;
    await sleep(400);
  }
}

/* ----------------------------------------------------------------- arrivals -- */
// One note per tick, each linking to an existing note so the rebuild takes the structural
// path (design/0014 -- a words-only diff moves nothing and is not what github#120 reports).

const ARRIVE = "(async function(path, link){" +
  " var body = 'Arrival note for github#120.\\n\\n[[' + link + ']]\\n\\nfiller ' + path + '\\n';" +
  " try { await app.vault.create(path, body); return 1; } catch (e) { return 0; } })";

async function pickLinkTargets(c, n) {
  return c.eval("(function(){ var f = app.vault.getMarkdownFiles().slice(0, " + n + ");" +
                " return f.map(function (x) { return x.basename; }); })()");
}

/* ------------------------------------------------------------------ samples -- */

const samples = [];

async function sample(c, child, tag, extra) {
  // Twice: the first pass frees, the second collects what the first made unreachable.
  await c.send("HeapProfiler.collectGarbage").catch(() => {});
  await sleep(250);
  await c.send("HeapProfiler.collectGarbage").catch(() => {});
  await sleep(150);
  const heap = await c.send("Runtime.getHeapUsage").catch(() => ({ usedSize: -1, totalSize: -1 }));
  const dom = await c.send("Memory.getDOMCounters").catch(() => ({ nodes: -1, jsEventListeners: -1, documents: -1 }));
  const tree = processTree(child.pid);
  const page = await c.eval("(function(){" +
    " var w = window; w.__vgGrowthN = w.__vgGrowthN || 0;" +
    " if (w.__vg && !w.__vg.__growthStamp) { w.__vgGrowthN++; try { w.__vg.__growthStamp = w.__vgGrowthN; } catch (e) { void 0; } }" +
    " var v = " + VIEW + ";" +
    // github#120 -- Obsidian's own emitters, which Memory.getDOMCounters cannot see.
    // subscribeLive() and the css-change registration both sit inside render(), so a
    // rebuild that remounts adds handlers here and nowhere a DOM counter looks.
    " var ev = function (o, n) { try { return (o && o._ && o._[n] ? o._[n].length : -1); } catch (e) { return -1; } };" +
    " var emit = { resolved: ev(app.metadataCache, 'resolved'), changed: ev(app.metadataCache, 'changed')," +
    "   create: ev(app.vault, 'create'), del: ev(app.vault, 'delete'), rename: ev(app.vault, 'rename')," +
    "   cssChange: ev(app.workspace, 'css-change') };" +
    " emit.total = ['resolved','changed','create','del','rename','cssChange']" +
    "   .reduce(function (a, k) { return a + Math.max(0, emit[k]); }, 0);" +
    " var viewEvents = -1; try { viewEvents = v && v._events ? v._events.length : -1; } catch (e) { void 0; }" +
    " var vg = w.__vg || null;" +
    " var pm = w.performance && w.performance.memory ? w.performance.memory : null;" +
    " var ls = vg && vg.liveState ? vg.liveState() : null;" +
    " return { mounts: w.__vgGrowthN," +
    "   hasView: !!v, files: app.vault.getMarkdownFiles().length," +
    "   order: vg && vg.graph ? vg.graph.order : -1, size: vg && vg.graph ? vg.graph.size : -1," +
    "   invalidations: vg && vg.invalidations ? vg.invalidations().length : -1," +
    "   paths: ls ? ls.paths : -1, nextId: ls ? ls.nextId : -1," +
    "   pending: ls ? !!ls.pending : false, draining: ls ? !!ls.draining : false, busy: ls ? !!ls.busy : false," +
    "   canvases: v && v.contentEl ? v.contentEl.querySelectorAll('#vg-graph canvas').length : -1," +
    "   lastChurn: v && v.lastLive && v.lastLive.churn !== undefined ? v.lastLive.churn : null," +
    "   emit: emit, viewEvents: viewEvents," +
    "   jsHeap: pm ? pm.usedJSHeapSize : -1 }; })()").catch(() => ({}));
  const row = {
    tag, at: Date.now(),
    heapMB: +(heap.usedSize / 1048576).toFixed(1),
    heapTotalMB: +(heap.totalSize / 1048576).toFixed(1),
    jsHeapMB: page.jsHeap > 0 ? +(page.jsHeap / 1048576).toFixed(1) : -1,
    wsMB: tree.ws > 0 ? +(tree.ws / 1048576).toFixed(1) : -1,
    privMB: tree.priv > 0 ? +(tree.priv / 1048576).toFixed(1) : -1,
    procs: tree.procs,
    domNodes: dom.nodes, listeners: dom.jsEventListeners, documents: dom.documents,
    ...page, ...(extra || {}),
  };
  samples.push(row);
  console.log("  " + tag.padEnd(22) +
              " heap " + String(row.heapMB).padStart(7) + " MB" +
              "  ws " + String(row.wsMB).padStart(8) + " MB" +
              "  dom " + String(row.domNodes).padStart(6) +
              "  lst " + String(row.listeners).padStart(5) +
              "  notes " + String(row.files).padStart(5) +
              "  order " + String(row.order).padStart(5) +
              "  mounts " + row.mounts +
              "  inval " + row.invalidations +
              "  emit " + String(row.emit ? row.emit.total : -1).padStart(4) +
              "  vEv " + String(row.viewEvents).padStart(4));
  return row;
}

/* ---------------------------------------------------------------------- run -- */

let child = null;
let cdp = null;

async function shutdown(code) {
  try { if (cdp) cdp.close(); } catch { void 0; }
  if (child && !KEEP) killObsidian(child);
  dropLock();
  process.exit(code);
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => { void shutdown(130); });
}

async function main() {
  const src = sourceVault();
  console.log("live-growth-check (github#120)");
  console.log("  fixture:  " + src);
  console.log("  view:     " + VIEW_MODE);
  console.log("  phases:   " + PHASES.map((p) => p.name + " " + p.rate + "/s").join(", ") + " x " + PHASE_SEC + " s each");
  takeLock();

  const vault = makeThrowawayVault(src);
  console.log("  vault:    " + vault);
  const profile = join(WORK, "profile-" + VIEW_MODE);
  console.log("launching Obsidian on port " + PORT + " ...");
  const ob = await launchObsidian(vault, profile);
  child = ob.child; cdp = ob.cdp;
  await placeElectronLeft((x) => cdp.eval(x)).catch(() => {});
  console.log("  " + (await enablePlugin(cdp)));

  if (VIEW_MODE === "open") {
    const ms = await openGraph(cdp);
    console.log("  graph open and at rest after " + ms + " ms");
  } else {
    console.log("  view deliberately NOT opened -- this is the control run");
    await sleep(4000);
  }

  console.log("\nsamples");
  const base = await sample(cdp, child, "baseline");
  const targets = await pickLinkTargets(cdp, 200);
  if (!targets.length) throw new Error("the fixture vault has no markdown files to link to");

  let n = 0;
  for (const phase of PHASES) {
    console.log("\n" + phase.name + " -- " + phase.note);
    const gap = 1000 / phase.rate;
    const end = Date.now() + PHASE_SEC * 1000;
    let nextSample = Date.now() + SAMPLE_SEC * 1000;
    let made = 0, failed = 0;
    while (Date.now() < end) {
      const t = Date.now();
      const path = "vg120/arrival-" + String(++n).padStart(5, "0") + ".md";
      const link = targets[n % targets.length];
      const ok = await cdp.eval(ARRIVE + "(" + JSON.stringify(path) + "," + JSON.stringify(link) + ")")
        .catch(() => 0);
      if (ok) made++; else failed++;
      if (Date.now() >= nextSample) {
        await sample(cdp, child, phase.name + " +" + Math.round((Date.now() - (end - PHASE_SEC * 1000)) / 1000) + "s",
                     { arrivals: n, phase: phase.name, rate: phase.rate });
        nextSample = Date.now() + SAMPLE_SEC * 1000;
      }
      const wait = gap - (Date.now() - t);
      if (wait > 0) await sleep(wait);
    }
    console.log("  arrivals: " + made + " created, " + failed + " refused");
    // Let the debounce, the wake and any cascade finish before the rest sample.
    const rested = VIEW_MODE === "open" ? await atRest(cdp, 90000) : (await sleep(4000), true);
    await sample(cdp, child, phase.name + " AT REST",
                 { arrivals: n, phase: phase.name, rate: phase.rate, rested });
    if (VIEW_MODE === "open" && !rested) console.log("  NOTE: the disc did not reach rest within 90 s");
  }

  console.log("\nsettling, then a final rest sample ...");
  await sleep(10000);
  if (VIEW_MODE === "open") await atRest(cdp, 90000);
  const last = await sample(cdp, child, "final", { arrivals: n });

  /* ------------------------------------------------------------- verdict -- */

  const d = (k) => +(last[k] - base[k]).toFixed(1);
  const per = (k) => n ? +((last[k] - base[k]) * 1024 / n).toFixed(1) : 0;
  console.log("\n=== growth over " + n + " arrivals (" + VIEW_MODE + " view) =================");
  console.log("  JS heap        " + base.heapMB + " -> " + last.heapMB + " MB   (" +
              (d("heapMB") >= 0 ? "+" : "") + d("heapMB") + " MB, " + per("heapMB") + " KB/arrival)");
  console.log("  working set    " + base.wsMB + " -> " + last.wsMB + " MB   (" +
              (d("wsMB") >= 0 ? "+" : "") + d("wsMB") + " MB, " + per("wsMB") + " KB/arrival)");
  console.log("  DOM nodes      " + base.domNodes + " -> " + last.domNodes + "   (" +
              (last.domNodes - base.domNodes >= 0 ? "+" : "") + (last.domNodes - base.domNodes) + ")");
  console.log("  listeners      " + base.listeners + " -> " + last.listeners + "   (" +
              (last.listeners - base.listeners >= 0 ? "+" : "") + (last.listeners - base.listeners) + ")");
  console.log("  invalidations  " + base.invalidations + " -> " + last.invalidations +
              "   (onData handlers; a per-rebuild registration would grow this)");
  console.log("  mounts         " + base.mounts + " -> " + last.mounts +
              "   (a churn above LIVE_MAX_CHANGED remounts the page)");
  if (base.emit && last.emit) {
    console.log("  vault/cache listeners " + base.emit.total + " -> " + last.emit.total +
                "   (resolved " + base.emit.resolved + "->" + last.emit.resolved +
                ", changed " + base.emit.changed + "->" + last.emit.changed +
                ", create " + base.emit.create + "->" + last.emit.create +
                ", delete " + base.emit.del + "->" + last.emit.del +
                ", rename " + base.emit.rename + "->" + last.emit.rename +
                ", css-change " + base.emit.cssChange + "->" + last.emit.cssChange + ")");
  }
  console.log("  view event refs " + base.viewEvents + " -> " + last.viewEvents +
              "   (Component registrations, released only when the view unloads)");
  console.log("  notes in vault " + base.files + " -> " + last.files +
              ",  graph order " + base.order + " -> " + last.order);
  const notRested = samples.filter((s) => s.rested === false).length;
  if (VIEW_MODE === "open") {
    console.log("  phases that never reached rest: " + notRested + " of " + PHASES.length);
  }

  const out = OUT || join(WORK, "growth-" + VIEW_MODE + ".json");
  writeFileSync(out, JSON.stringify({ view: VIEW_MODE, fixture: src, phaseSec: PHASE_SEC,
                                      arrivals: n, samples }, null, 2) + "\n", "utf8");
  console.log("\nwrote " + out);
  await shutdown(0);
}

main().catch(async (e) => {
  console.error(e && e.stack ? e.stack : String(e));
  await shutdown(1);
});
