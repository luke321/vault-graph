#!/usr/bin/env node
// github#120 -- how to run it: .ai-context/live-growth-harness.md

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attach } from "./cdp.mjs";
import { placeElectronLeft } from "./screen.mjs";
import { keepFocus } from "./focus.mjs";

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
const PAN_ONLY = flag("pan-only");
const PAN = PAN_ONLY || flag("pan");
const BURSTS = Number(arg("bursts", "3"));
const BURST_NOTES = Number(arg("burst-notes", "250"));
// github#120 -- the control: with this on, the plugin does no work at all
const NO_LIVE = flag("no-live");
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

// github#120 -- above the debounce, at it, and below it
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
// github#87 -- this places a window on the leftmost screen

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
// github#120 -- the JS heap cannot see GPU memory; this can

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
  // github#129, github#135
  const focus = await keepFocus();
  const child = spawn(findObsidian(), ["--remote-debugging-port=" + PORT, "--user-data-dir=" + profile],
                      { stdio: "ignore" });
  void focus.watch(child.pid);
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

// github#120 -- enable the plugin, never click the trust dialog
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

// github#120 -- rest: nothing queued, nothing drawing, nothing moving
async function atRest(c, ms) {
  const deadline = Date.now() + ms;
  let prev = null, same = 0;
  for (;;) {
    // github#120 -- the plugin build has no __vg debug API
    const k = await c.eval("(function(){ var vg = window.__vg; if (!vg || !vg.graph) return 'no-vg';" +
      " var v = " + VIEW + ";" +
      " if (v && (v.liveBuilding || v.liveTimer !== null || v.liveAgain ||" +
      "           (v.dirtyPaths && v.dirtyPaths.size))) return 'busy';" +
      " var sum = 0; vg.graph.forEachNode(function (id, a) { sum += a.x + a.y + a.size; });" +
      " return vg.graph.order + '|' + sum.toFixed(3); })()").catch(() => "err");
    if (k !== "busy" && k !== "err" && k === prev) { if (++same >= 3) return true; } else { same = 0; }
    prev = k;
    if (Date.now() > deadline) return false;
    await sleep(400);
  }
}

/* ----------------------------------------------------------------- arrivals -- */
// design/0014 -- each arrival links a note, for the structural path

const ARRIVE = "(async function(path, link){" +
  " var body = 'Arrival note for github#120.\\n\\n[[' + link + ']]\\n\\nfiller ' + path + '\\n';" +
  " try { await app.vault.create(path, body); return { ok: 1 }; }" +
  " catch (e) { return { ok: 0, why: String((e && e.message) || e) }; } })";

// github#120 -- create() throws on a missing folder, silently
const ARRIVAL_DIR = "vg120";

async function makeArrivalDir(c) {
  return c.eval("(async function(){" +
    " try { await app.vault.createFolder(" + JSON.stringify(ARRIVAL_DIR) + "); return 'created'; }" +
    " catch (e) { var f = app.vault.getAbstractFileByPath(" + JSON.stringify(ARRIVAL_DIR) + ");" +
    " return f ? 'already there' : 'FAILED: ' + String((e && e.message) || e); } })()");
}

// github#120 -- taken, not merely quiet: the order is the only signal
async function awaitOrder(c, target, ms) {
  const deadline = Date.now() + ms;
  let last = -1;
  for (;;) {
    const o = await c.eval("(function(){ var vg = window.__vg;" +
      " return vg && vg.graph ? vg.graph.order : -1; })()").catch(() => -1);
    if (o >= target) return { reached: true, order: o };
    if (Date.now() > deadline) return { reached: false, order: o, wanted: target };
    if (o !== last) { last = o; }
    await sleep(500);
  }
}

/* ----------------------------------------------------------------- pan cadence -- */
// github#120 -- what an arrival mid-drag does to the frame cadence

const FRAMES_ON = "(function(){ window.__vgF = []; window.__vgFOn = true;" +
  " (function loop(t){ if (!window.__vgFOn) return; window.__vgF.push(t);" +
  "   requestAnimationFrame(loop); })(performance.now()); return true; })()";

const FRAMES_OFF = "(function(){ window.__vgFOn = false;" +
  " var a = window.__vgF || [], d = [];" +
  " for (var i = 1; i < a.length; i++) d.push(a[i] - a[i - 1]);" +
  " d.sort(function (x, y) { return x - y; });" +
  " var q = function (p) { return d.length ? +d[Math.min(d.length - 1, Math.floor(d.length * p))].toFixed(1) : -1; };" +
  " var long = 0, j; for (j = 0; j < d.length; j++) if (d[j] > 50) long++;" +
  " return { frames: a.length, median: q(0.5), p95: q(0.95)," +
  "   worst: d.length ? +d[d.length - 1].toFixed(1) : -1, long50: long }; })()";

const STAGE_BOX = "(function(){ var v = " + VIEW + ";" +
  " var el = v && v.contentEl ? v.contentEl.querySelector('#vg-graph') : null;" +
  " if (!el) return null; var r = el.getBoundingClientRect();" +
  " return { left: r.left, top: r.top, w: r.width, h: r.height }; })()";

// github#120 -- one slow circular drag, roughly 60 Hz
async function panDrag(c, box, ms) {
  const cx = box.left + box.w / 2, cy = box.top + box.h / 2;
  const rx = box.w * 0.18, ry = box.h * 0.18;
  const steps = Math.max(8, Math.round(ms / 16));
  await c.send("Input.dispatchMouseEvent",
    { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1, buttons: 1 });
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    await c.send("Input.dispatchMouseEvent",
      { type: "mouseMoved", x: cx + Math.sin(a) * rx, y: cy + Math.cos(a) * ry, button: "left", buttons: 1 });
    await sleep(16);
  }
  await c.send("Input.dispatchMouseEvent",
    { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1, buttons: 0 });
}

// github#120 -- the pair: the same drag quiet, then under arrivals
async function panProbe(c, tag, ms, withArrivals, targets, nextName) {
  const box = await c.eval(STAGE_BOX);
  if (!box || !box.w) { console.log("  " + tag + ": no stage to pan"); return null; }
  const t0 = Date.now();
  await c.eval(FRAMES_ON);
  // github#120 -- bounded by count too; an overrun once fed 292
  const cap = withArrivals ? Math.ceil((ms / 1000) * PAN_ARRIVAL_RATE) + 2 : 0;
  let arriving = true, made = 0;
  const feed = (async () => {
    if (!withArrivals) return;
    while (arriving && made < cap) {
      const r = await c.eval(ARRIVE + "(" + JSON.stringify(nextName()) + "," +
                             JSON.stringify(targets[made % targets.length]) + ")").catch(() => ({ ok: 0 }));
      if (r && r.ok) made++;
      await sleep(1000 / PAN_ARRIVAL_RATE);
    }
  })();
  await panDrag(c, box, ms);
  arriving = false;
  await feed;
  const f = await c.eval(FRAMES_OFF);
  const wallMs = Date.now() - t0;
  // github#120 -- suspension is ONE gap, not a probe that ran long
  const suspect = f.worst > wallMs * 0.5;
  const row = { tag, withArrivals, arrivalsDuring: made, wallMs, suspect, ...f };
  if (suspect) {
    console.log("  " + tag + ": DISCARDED -- one gap of " + f.worst + " ms in a " + wallMs +
                " ms probe, so rAF was suspended rather than slow. Not a frame time.");
    panRows.push(row);
    return row;
  }
  panRows.push(row);
  console.log("  " + tag.padEnd(30) +
              " frames " + String(f.frames).padStart(4) +
              "  median " + String(f.median).padStart(6) + " ms" +
              "  p95 " + String(f.p95).padStart(7) + " ms" +
              "  worst " + String(f.worst).padStart(8) + " ms" +
              "  >50ms " + String(f.long50).padStart(4) +
              (withArrivals ? "   (" + made + " notes arrived during the pan)" : "   (quiet)"));
  return row;
}

const PAN_ARRIVAL_RATE = Number(arg("pan-rate", "1"));
const PAN_MS = Number(arg("pan-ms", "6000"));
const panRows = [];

/* -------------------------------------------------------------- hidden burst -- */
// design/0014 -- only the hidden-leaf burst can rerun render()

const HIDE_GRAPH = "(function(){ var l = app.workspace.getLeaf('tab');" +
  " app.workspace.setActiveLeaf(l, { focus: true }); return true; })()";
const REVEAL_GRAPH = "(function(){ var ls = app.workspace.getLeavesOfType(" + JSON.stringify(VT) + ");" +
  " if (!ls[0]) return false; app.workspace.revealLeaf(ls[0]); return true; })()";
const IS_HIDDEN = "(function(){ var v = " + VIEW + ";" +
  " return !!(v && v.containerEl && v.containerEl.offsetParent === null); })()";

async function pickLinkTargets(c, n) {
  return c.eval("(function(){ var f = app.vault.getMarkdownFiles().slice(0, " + n + ");" +
                " return f.map(function (x) { return x.basename; }); })()");
}

/* ------------------------------------------------------------------ samples -- */

const samples = [];

async function sample(c, child, tag, extra) {
  // github#120 -- twice: the second collects what the first freed
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
    // github#120 -- Obsidian's emitters, invisible to DOM counters
    " var ev = function (o, n) { try { return (o && o._ && o._[n] ? o._[n].length : -1); } catch (e) { return -1; } };" +
    " var emit = { resolved: ev(app.metadataCache, 'resolved'), changed: ev(app.metadataCache, 'changed')," +
    "   create: ev(app.vault, 'create'), del: ev(app.vault, 'delete'), rename: ev(app.vault, 'rename')," +
    "   cssChange: ev(app.workspace, 'css-change') };" +
    " emit.total = ['resolved','changed','create','del','rename','cssChange']" +
    "   .reduce(function (a, k) { return a + Math.max(0, emit[k]); }, 0);" +
    " var viewEvents = -1; try { viewEvents = v && v._events ? v._events.length : -1; } catch (e) { void 0; }" +
    " var vg = w.__vg || null;" +
    " var pm = w.performance && w.performance.memory ? w.performance.memory : null;" +
    // github#120 -- the plugin build has no liveState()
    " var live = v ? { building: !!v.liveBuilding, timer: v.liveTimer !== null," +
    "   again: !!v.liveAgain, deferred: !!v.liveDeferred, wake: v.liveWake !== null," +
    "   dirty: v.dirtyPaths ? v.dirtyPaths.size : -1 } : null;" +
    " return { mounts: w.__vgGrowthN," +
    "   hasView: !!v, files: app.vault.getMarkdownFiles().length," +
    "   order: vg && vg.graph ? vg.graph.order : -1, size: vg && vg.graph ? vg.graph.size : -1," +
    "   live: live," +
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
              "  dirty " + String(row.live ? row.live.dirty : -1).padStart(4) +
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

  if (NO_LIVE) {
    const off = await cdp.eval("(function(){ var p = app.plugins.getPlugin(" + JSON.stringify(PLUGIN_ID) + ");" +
      " if (!p || !p.settings) return 'no settings'; p.settings.liveRefresh = false;" +
      " return p.settings.liveRefresh === false ? 'off' : 'STILL ON'; })()");
    console.log("  live refresh: " + off + " -- the plugin will do NO work on an arrival");
    if (off !== "off") throw new Error("could not turn live refresh off, so the control is meaningless");
  }

  if (VIEW_MODE === "open") {
    const ms = await openGraph(cdp);
    console.log("  graph open and at rest after " + ms + " ms");
  } else {
    console.log("  view deliberately NOT opened -- this is the control run");
    await sleep(4000);
  }

  const dir = await makeArrivalDir(cdp);
  console.log("  arrival folder " + ARRIVAL_DIR + "/: " + dir);
  if (String(dir).startsWith("FAILED")) throw new Error("cannot create " + ARRIVAL_DIR + "/ -- " + dir);

  console.log("\nsamples");
  const base = await sample(cdp, child, "baseline");
  const targets = await pickLinkTargets(cdp, 200);
  if (!targets.length) throw new Error("the fixture vault has no markdown files to link to");

  let n = 0;
  let firstRefusal = "";
  const nextName = () => ARRIVAL_DIR + "/arrival-" + String(++n).padStart(5, "0") + ".md";

  // github#120 -- the pair the pan report rests on
  if (VIEW_MODE === "open" && PAN) {
    console.log("\npan cadence at mount 1 (before any remount)");
    await panProbe(cdp, "mount 1 quiet", PAN_MS, false, targets, nextName);
    await atRest(cdp, 60000);
    await panProbe(cdp, "mount 1 + arrivals", PAN_MS, true, targets, nextName);
    await atRest(cdp, 60000);
  }

  for (const phase of PAN_ONLY ? [] : PHASES) {
    console.log("\n" + phase.name + " -- " + phase.note);
    const gap = 1000 / phase.rate;
    const end = Date.now() + PHASE_SEC * 1000;
    let nextSample = Date.now() + SAMPLE_SEC * 1000;
    let made = 0, failed = 0;
    while (Date.now() < end) {
      const t = Date.now();
      const path = ARRIVAL_DIR + "/arrival-" + String(++n).padStart(5, "0") + ".md";
      const link = targets[n % targets.length];
      const r = await cdp.eval(ARRIVE + "(" + JSON.stringify(path) + "," + JSON.stringify(link) + ")")
        .catch((e) => ({ ok: 0, why: "CDP: " + String(e && e.message ? e.message : e) }));
      if (r && r.ok) {
        made++;
      } else {
        failed++;
        if (!firstRefusal) {
          firstRefusal = (r && r.why) || "unknown";
          console.log("  REFUSED: " + firstRefusal + "   (first of what may be many)");
        }
      }
      if (Date.now() >= nextSample) {
        await sample(cdp, child, phase.name + " +" + Math.round((Date.now() - (end - PHASE_SEC * 1000)) / 1000) + "s",
                     { arrivals: n, phase: phase.name, rate: phase.rate });
        nextSample = Date.now() + SAMPLE_SEC * 1000;
      }
      const wait = gap - (Date.now() - t);
      if (wait > 0) await sleep(wait);
    }
    console.log("  arrivals: " + made + " created, " + failed + " refused");
    // github#120 -- refuse to be the run that measured nothing
    if (!made) {
      throw new Error("phase " + phase.name + " created no notes (" + failed + " refused: " +
                      (firstRefusal || "no reason given") + ") -- there is nothing to measure");
    }
    // github#120 -- let the debounce, the wake and the cascade finish
    const rested = VIEW_MODE === "open" ? await atRest(cdp, 90000) : (await sleep(4000), true);
    await sample(cdp, child, phase.name + " AT REST",
                 { arrivals: n, phase: phase.name, rate: phase.rate, rested });
    if (VIEW_MODE === "open" && !rested) console.log("  NOTE: the disc did not reach rest within 90 s");
  }

  // design/0014 -- the phase that can cross LIVE_MAX_CHANGED
  if (VIEW_MODE === "open" && BURSTS > 0) {
    for (let b = 1; b <= BURSTS; b++) {
      console.log("\nhidden burst " + b + " of " + BURSTS + " -- " + BURST_NOTES +
                  " notes arrive behind a hidden leaf, then it is revealed");
      await cdp.eval(HIDE_GRAPH);
      await sleep(1200);
      const hidden = await cdp.eval(IS_HIDDEN);
      console.log("  leaf hidden: " + hidden + (hidden ? "" : "   (the burst will NOT defer -- read the rest with that in mind)"));
      let made = 0;
      for (let i = 0; i < BURST_NOTES; i++) {
        const path = ARRIVAL_DIR + "/arrival-" + String(++n).padStart(5, "0") + ".md";
        const r = await cdp.eval(ARRIVE + "(" + JSON.stringify(path) + "," +
                                 JSON.stringify(targets[n % targets.length]) + ")").catch(() => ({ ok: 0 }));
        if (r && r.ok) made++;
      }
      const dirty = await cdp.eval("(function(){ var v = " + VIEW + ";" +
        " return v && v.dirtyPaths ? v.dirtyPaths.size : -1; })()").catch(() => -1);
      console.log("  " + made + " created while hidden; dirtyPaths holds " + dirty);
      await cdp.eval(REVEAL_GRAPH);
      // github#120 -- the non-note files are the allowance, not a guess
      const notesNow = await cdp.eval("app.vault.getMarkdownFiles().length").catch(() => -1);
      const want = notesNow - (base.files - base.order);
      const took = await awaitOrder(cdp, want, 180000);
      if (!took.reached) {
        console.log("  DISC NEVER TOOK THE BURST: order " + took.order + ", wanted " + want +
                    " -- the live rebuild did not land");
      }
      const rested = await atRest(cdp, 120000);
      const s = await sample(cdp, child, "burst " + b + " AT REST",
                             { arrivals: n, phase: "burst", burst: b, dirtyAtReveal: dirty, rested, tookBurst: took.reached, orderWanted: want });
      console.log("    churn reported by the last applyData: " + s.lastChurn +
                  (s.lastChurn !== null && s.lastChurn > 200 ? "  -- OVER LIVE_MAX_CHANGED, so render() reran" : ""));
      // github#120 -- does the pan degrade with mount count?
      if (PAN) {
        await panProbe(cdp, "mount " + s.mounts + " quiet", PAN_MS, false, targets, nextName);
        await atRest(cdp, 60000);
        await panProbe(cdp, "mount " + s.mounts + " + arrivals", PAN_MS, true, targets, nextName);
        await atRest(cdp, 60000);
      }
      if (!rested) console.log("    NOTE: the disc did not reach rest within 120 s");
    }
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

  if (panRows.length) {
    console.log("\n=== pan cadence ==========================================");
    console.log("  a drag is not in liveBusy(), so a rebuild lands mid-drag; these are the frames");
    for (const r of panRows) {
      console.log("  " + r.tag.padEnd(24) + (r.withArrivals ? " under arrivals " : " quiet          ") +
                  (r.suspect ? " DISCARDED (one " + r.worst + " ms gap in " + r.wallMs + " ms)" : "") +
                  " median " + String(r.median).padStart(6) + " ms" +
                  "  p95 " + String(r.p95).padStart(7) + " ms" +
                  "  worst " + String(r.worst).padStart(8) + " ms" +
                  "  frames over 50 ms: " + r.long50 + " of " + Math.max(0, r.frames - 1));
    }
    const good = panRows.filter((r) => !r.suspect);
    const quiet = good.filter((r) => !r.withArrivals);
    const busy = good.filter((r) => r.withArrivals);
    if (quiet.length > 1) {
      console.log("  quiet pan, first mount -> last: p95 " + quiet[0].p95 + " -> " + quiet[quiet.length - 1].p95 +
                  " ms, worst " + quiet[0].worst + " -> " + quiet[quiet.length - 1].worst + " ms");
    }
    if (busy.length > 1) {
      console.log("  pan under arrivals, first -> last: p95 " + busy[0].p95 + " -> " + busy[busy.length - 1].p95 +
                  " ms, worst " + busy[0].worst + " -> " + busy[busy.length - 1].worst + " ms");
    }
  }

  const out = OUT || join(WORK, "growth-" + VIEW_MODE + ".json");
  writeFileSync(out, JSON.stringify({ view: VIEW_MODE, fixture: src, phaseSec: PHASE_SEC, pan: panRows,
                                      arrivals: n, samples }, null, 2) + "\n", "utf8");
  console.log("\nwrote " + out);
  await shutdown(0);
}

main().catch(async (e) => {
  console.error(e && e.stack ? e.stack : String(e));
  await shutdown(1);
});
