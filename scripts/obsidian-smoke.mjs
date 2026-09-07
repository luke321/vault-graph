#!/usr/bin/env node
// github#62, github#59

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { attach } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const argAll = (n) => argv.flatMap((a, i) => (a === "--" + n ? [argv[i + 1]] : []));
const flag = (n) => argv.includes("--" + n);

const VT = "vault-graph-view";
const PLUGIN_ID = "vault-graph";
const PORT = Number(arg("port", "9447"));
const CYCLES = Math.max(2, Number(arg("cycles", "6")) || 6);
const VG_TIMEOUT_MS = Number(arg("timeout", "240")) * 1000;
const KEEP = flag("keep");
const ONLY = argAll("only").map((s) => s.toLowerCase());
const TEMP = process.env.TEMP || tmpdir();
const WORK = join(TEMP, "vault-graph-obsidian-smoke");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ inputs -- */

// design/0012 -- the harness belongs off the user's main screen
function leftmostScreen() {
  const fallback = { x: -2400, y: 40, w: 1600, h: 1000 };
  if (process.platform !== "win32") return fallback;
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Add-Type -AssemblyName System.Windows.Forms; " +
    "[System.Windows.Forms.Screen]::AllScreens | Sort-Object { $_.WorkingArea.Left } | Select-Object -First 1 | " +
    "ForEach-Object { '{0} {1} {2} {3}' -f $_.WorkingArea.Left, $_.WorkingArea.Top, $_.WorkingArea.Width, $_.WorkingArea.Height }"],
    { encoding: "utf8" });
  const m = /(-?\d+) (-?\d+) (\d+) (\d+)/.exec((ps.stdout || "").trim());
  return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : fallback;
}
const SCREEN = leftmostScreen();
const WIN_W = Math.min(1600, SCREEN.w - 40);
const WIN_H = Math.min(1000, SCREEN.h - 40);
const WIN_X = SCREEN.x + Math.max(0, Math.floor((SCREEN.w - WIN_W) / 2));
const WIN_Y = SCREEN.y + Math.max(0, Math.floor((SCREEN.h - WIN_H) / 2));
const POPOUT = JSON.stringify({ x: SCREEN.x + 70, y: SCREEN.y + 70,
                                size: { width: Math.min(1200, SCREEN.w - 140), height: Math.min(860, SCREEN.h - 140) } });

function findObsidian() {
  const named = arg("obsidian", "");
  if (named) return named;
  const guesses = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Obsidian", "Obsidian.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Obsidian", "Obsidian.exe"),
    "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
  ].filter(Boolean);
  for (const g of guesses) if (existsSync(g)) return g;
  throw new Error("Obsidian not found -- pass --obsidian <path>");
}

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
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(want) && statSync(join(store, d)).isDirectory()) : null;
  if (!hit) throw new Error("no " + want + "* fixture in " + store + " -- run node scripts/smoke.mjs --only \"no console errors\" once to generate the store");
  return join(store, hit);
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}

function makeThrowawayVault(src) {
  for (const f of ["main.js", "manifest.json", "styles.css"]) {
    if (!existsSync(join(ROOT, f))) throw new Error(f + " is missing at the repo root -- run: node scripts/build-plugin.mjs");
  }
  const dest = join(WORK, basename(src));
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  cpSync(src, dest, { recursive: true, filter: (p) => !/[\\/]\.obsidian[\\/](plugins|workspace\.json|workspace-mobile\.json)/.test(p) });
  const dot = join(dest, ".obsidian");
  mkdirSync(dot, { recursive: true });
  const plug = join(dot, "plugins", PLUGIN_ID);
  mkdirSync(plug, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) cpSync(join(ROOT, f), join(plug, f));
  writeFileSync(join(dot, "community-plugins.json"), JSON.stringify([PLUGIN_ID]) + "\n");
  return dest;
}

/* ------------------------------------------------------ exporter reference -- */

async function exporterPositions(vault) {
  const scratch = mkdtempSync(join(tmpdir(), "vg-obsidian-smoke-"));
  const out = join(scratch, "vault-graph.html");
  const b = spawnSync(process.execPath, [join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", out], { encoding: "utf8" });
  if (b.status !== 0) throw new Error("build-graph failed: " + (b.stderr || b.stdout));
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "vg-obsidian-smoke-chrome-"));
  const chrome = spawn(findChrome(), [
    "--remote-debugging-port=" + port, "--user-data-dir=" + profile,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
    "--disable-component-update", "--no-service-autorun", "--metrics-recording-only", "--no-pings", "--mute-audio",
    "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
    "--force-device-scale-factor=1", "--window-position=-2400,0", "--window-size=1600,1000",
    "--app=" + pathToFileURL(out).href + "?rest",
  ], { stdio: "ignore" });
  let p = null;
  try {
    for (let i = 0; i < 100 && !p; i++) {
      try { p = await attach(port, "vault-graph"); } catch { await sleep(200); }
    }
    if (!p) throw new Error("could not attach to Chrome for the exporter build");
    const deadline = Date.now() + 60000;
    for (;;) {
      const ready = await p.eval("!!(window.__vg && __vg.graph && __vg.renderer && __vg.demo && !__vg.demo.busy())").catch(() => false);
      if (ready) break;
      if (Date.now() > deadline) throw new Error("the exporter page never settled");
      await sleep(150);
    }
    const dump = await p.eval(
      "(function(){ var pos = {}, edges = 0; __vg.graph.forEachNode(function (id, a) { pos[a.path] = [a.x, a.y, a.size, a.folder, a.sub, a.deg, a.ntype, a.created]; });" +
      " edges = __vg.graph.size; var dd = __vg.debugDump ? __vg.debugDump() : {};" +
      " return { pos: pos, edges: edges, nodes: __vg.graph.order, order: window.VAULT_DATA.nodes.map(function (n) { return n.id; })," +
      " lattice: { stage: dd.screen && dd.screen.stage, pxPerRow: dd.screen && dd.screen.pxPerRow, spacing: dd.spacing, locked: dd.locked, camera: dd.camera, hidden: dd.filters && dd.filters.hiddenFolders, range: dd.filters && dd.filters.range, shown: dd.filters && dd.filters.shown } }; })()");
    return dump;
  } finally {
    try { p?.close(); } catch { }
    try { chrome.kill(); } catch { }
    if (process.platform === "win32") spawnSync("taskkill", ["/F", "/T", "/PID", String(chrome.pid)], { stdio: "ignore" });
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------- Obsidian -- */

async function launchObsidian(vault, profile, fresh = true) {
  if (fresh) {
    rmSync(profile, { recursive: true, force: true });
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "obsidian.json"),
      JSON.stringify({ vaults: { "0000obsidiansmoke": { path: vault, ts: Date.now(), open: true } } }), "utf8");
  }
  const t0 = Date.now();
  const child = spawn(findObsidian(), ["--remote-debugging-port=" + PORT, "--user-data-dir=" + profile], { stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    let c = null;
    try { c = await attach(PORT, "app://obsidian.md"); } catch { continue; }
    try {
      if (await c.eval("typeof app !== 'undefined' && !!app.workspace")) return { child, cdp: c, spawnedAt: t0, attachedAfterMs: Date.now() - t0 };
    } catch { }
    try { c.close(); } catch { }
  }
  try { child.kill(); } catch { }
  throw new Error("Obsidian never exposed its app on port " + PORT);
}

function killObsidian(child) {
  try { child.kill(); } catch { }
  if (process.platform === "win32") spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
}

/* --------------------------------------------------------------- checks -- */

const results = [];
const selected = (name) => !ONLY.length || ONLY.some((q) => name.toLowerCase().includes(q));
function report(ok, name, detail) {
  results.push({ ok, name, detail });
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + (detail ? "   (" + detail + ")" : ""));
}

const VIEW = "(function(){ var ls = app.workspace.getLeavesOfType(" + JSON.stringify(VT) + "); return ls[0] && ls[0].view; })()";

function evalIn(c) {
  return async (expr) => c.eval(expr);
}

async function waitFor(c, expr, ms, label) {
  const deadline = Date.now() + ms;
  for (;;) {
    let v = null;
    try { v = await c.eval(expr); } catch { v = null; }
    if (v) return v;
    if (Date.now() > deadline) throw new Error(label + " did not happen within " + ms + " ms");
    await sleep(120);
  }
}

const READY = "(function(){ var v = " + VIEW + "; if (!v || !v.handle || !v.handle.api) return null;" +
              " var api = v.handle.api; if (!api.graph || !api.renderer) return null;" +
              " var d = api.debugDump ? api.debugDump() : null;" +
              " var busy = v.contentEl.querySelector('#vg-busy'); if (busy && !busy.hidden) return null;" +
              " if (!d || !d.filters || d.filters.timelineUntil !== null) return null;" +
              " if (d.filters.shown !== api.graph.order) return null;" +
              " if (d.spacing && (d.spacing.rowsOuter % 1 !== 0 || d.spacing.rowsInner % 1 !== 0)) return null;" +
              " var sum = 0; api.graph.forEachNode(function (id, a) { sum += a.x + a.y; });" +
              " if (window.__vgSmokePos !== sum) { window.__vgSmokePos = sum; return null; }" +
              " return { order: api.graph.order, size: api.graph.size, canvases: v.contentEl.querySelectorAll('#vg-graph canvas').length, mountMs: v.mountMs, build: v.lastData && v.lastData._spike, stage: d.screen && d.screen.stage }; })()";

async function camSettle(c, ms = 5000) {
  const deadline = Date.now() + ms;
  let prev = null, same = 0;
  for (;;) {
    const k = await c.eval("(function(){ var v = " + VIEW + "; if (!v || !v.handle || !v.handle.api) return ''; var s = v.handle.api.renderer.getCamera().getState(); return [s.x, s.y, s.ratio].join('|'); })()").catch(() => "");
    if (k === prev) { if (++same >= 3) return; } else { same = 0; }
    prev = k;
    if (Date.now() > deadline) return;
    await sleep(150);
  }
}

async function openGraph(c) {
  const t0 = Date.now();
  await c.eval("window.__vgSmokePos = null; app.commands.executeCommandById('" + PLUGIN_ID + ":open'); void 0");
  const vgAt = await waitFor(c, "(function(){ var v = " + VIEW + "; return v && v.handle && v.handle.api && v.handle.api.graph ? Date.now() : null; })()", VG_TIMEOUT_MS, "__vg");
  const ready = await waitFor(c, READY, VG_TIMEOUT_MS, "the intro");
  const msToRest = Date.now() - t0;
  await camSettle(c);
  return { msToVg: vgAt - t0, msToRest, ...ready };
}

async function closeGraph(c) {
  await c.eval("(function(){ app.workspace.getLeavesOfType(" + JSON.stringify(VT) + ").forEach(function (l) { l.detach(); }); })(); void 0");
  await sleep(300);
}

async function counters(c) {
  await c.send("HeapProfiler.collectGarbage").catch(() => {});
  await sleep(300);
  await c.send("HeapProfiler.collectGarbage").catch(() => {});
  const heap = await c.send("Runtime.getHeapUsage");
  const dom = await c.send("Memory.getDOMCounters");
  const r = await c.send("Runtime.evaluate", {
    expression: "(function(){ var l = getEventListeners(document), w = getEventListeners(window);" +
                " return { move: (l.mousemove || []).length, vis: (l.visibilitychange || []).length, resize: (w.resize || []).length }; })()",
    returnByValue: true, includeCommandLineAPI: true });
  const ls = r.result?.value || { move: -1, vis: -1, resize: -1 };
  return { heapMB: +(heap.usedSize / 1048576).toFixed(1), nodes: dom.nodes, listeners: dom.jsEventListeners, ...ls };
}

const stageBox = (c) => c.eval("(function(){ var v = " + VIEW + "; var r = v.contentEl.querySelector('#vg-graph').getBoundingClientRect();" +
                               " return { left: r.left, top: r.top, w: r.width, h: r.height }; })()");

async function noteAt(c, id) {
  return c.eval("(function(){ var v = " + VIEW + ", api = v.handle.api; var a = api.graph.getNodeAttributes(" + JSON.stringify(id) + ");" +
                " var o = v.contentEl.querySelector('#vg-graph').getBoundingClientRect(); var p = api.renderer.graphToViewport({ x: a.x, y: a.y });" +
                " return { x: p.x + o.left, y: p.y + o.top, label: a.label }; })()");
}

const TOP_NOTE = "(function(){ var api = " + VIEW + ".handle.api, best = null, bd = -1; api.graph.forEachNode(function (id) {" +
                 " var d = api.graph.degree(id); if (d > bd || (d === bd && id < best)) { bd = d; best = id; } }); return best; })()";

async function mouse(c, type, x, y, extra = {}) {
  await c.send("Input.dispatchMouseEvent", { type, x, y, ...extra });
}

/* ------------------------------------------------------------------ run -- */

const src = sourceVault();
const obsidianExe = findObsidian();
console.log("obsidian-smoke: " + obsidianExe);
console.log("fixture: " + src);
const vault = makeThrowawayVault(src);
console.log("throwaway vault: " + vault + " (plugin " + JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version + " installed)");

let expo = null;
if (selected("positions match the exporter")) {
  console.log("building the exporter page and reading its resting layout in Chrome ...");
  expo = await exporterPositions(vault);
  console.log("  exporter: " + expo.nodes + " notes, " + expo.edges + " links");
}

const profile = join(WORK, "profile");
console.log("launching a separate Obsidian on port " + PORT + " ...");
let ob = await launchObsidian(vault, profile);
let c = ob.cdp;
let E = evalIn(c);
const errorsBefore = () => c.errors.length;
const errorsSince = (n) => c.errors.slice(n).map((e) => e.kind + ": " + String(e.text).split("\n")[0]);

try {
  await E("(function(){ window.__vgSmoke = { attachedAt: performance.now(), resolvedAt: null, layoutReadyAt: null, files: 0 };" +
          " app.metadataCache.on('resolved', function () { if (window.__vgSmoke.resolvedAt === null) window.__vgSmoke.resolvedAt = performance.now(); });" +
          " app.workspace.onLayoutReady(function () { window.__vgSmoke.layoutReadyAt = performance.now(); }); })(); void 0");

  // design/0012 -- Electron ignores moveTo for its own main window
  const shapeWindow = async () => {
    await E("(function(){ try { var e = window.require && window.require('electron');" +
            " var r = e && (e.remote || (window.require('@electron/remote')));" +
            " if (r && r.getCurrentWindow) { r.getCurrentWindow().setBounds({ x: " + WIN_X + ", y: " + WIN_Y +
            ", width: " + WIN_W + ", height: " + WIN_H + " }); return; } } catch (err) { }" +
            " try { window.moveTo(" + WIN_X + ", " + WIN_Y + "); window.resizeTo(" + WIN_W + ", " + WIN_H + "); } catch (err) { } })(); void 0");
    await E("new Promise(function (r) { app.workspace.onLayoutReady(function () { try { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); } catch (e) { } r(true); }); })");
    await sleep(500);
    return E("window.outerWidth + 'x' + window.outerHeight + ' at ' + window.screenX + ',' + window.screenY");
  };
  console.log("  window " + await shapeWindow() +
              " (leftmost screen " + SCREEN.w + "x" + SCREEN.h + " at " + SCREEN.x + "," + SCREEN.y + ")");
  const tEnable = Date.now();
  const already = await E("!!app.plugins.getPlugin('" + PLUGIN_ID + "')");
  if (!already) {
    await E("(async function(){ await app.plugins.setEnable(true); return true; })()");
    await sleep(1500);
    const afterRestricted = await E("!!app.plugins.getPlugin('" + PLUGIN_ID + "')");
    if (!afterRestricted) await E("(async function(){ await app.plugins.enablePluginAndSave('" + PLUGIN_ID + "'); return true; })()");
  }
  const loaded = await waitFor(c, "!!app.plugins.getPlugin('" + PLUGIN_ID + "')", 30000, "the plugin load");
  const msPluginLoad = Date.now() - tEnable;

  const cacheDeadline = Date.now() + VG_TIMEOUT_MS;
  const STABLE_MS = 2500;
  let cache = null, lastKey = "", stableSince = Date.now();
  const tCache0 = Date.now();
  for (;;) {
    cache = await E("(function(){ var r = app.metadataCache.resolvedLinks || {}; var n = Object.keys(r).length, links = 0;" +
                    " for (var k in r) for (var d in r[k]) links += r[k][d];" +
                    " return { files: app.vault.getMarkdownFiles().length, sources: n, links: links, resolvedAt: window.__vgSmoke.resolvedAt, initialized: app.metadataCache.initialized }; })()");
    const key = cache.files + "/" + cache.sources + "/" + cache.links;
    if (key !== lastKey) { lastKey = key; stableSince = Date.now(); }
    if (cache.resolvedAt !== null && Date.now() - stableSince >= STABLE_MS) break;
    if (Date.now() > cacheDeadline) break;
    await sleep(250);
  }
  const msCacheReady = Date.now() - tCache0 - STABLE_MS;
  const files = cache.files;
  const cacheDetail = files + " notes; resolvedLinks from " + cache.sources + " sources, " + cache.links + " links; the cache stopped growing " +
                      Math.max(0, msCacheReady) + " ms after the plugin was enabled (held " + STABLE_MS + " ms); attach " + ob.attachedAfterMs + " ms after spawn; plugin " + (already ? "already enabled by community-plugins.json" : "enabled now") + ", loaded in " + msPluginLoad + " ms";
  if (selected("plugin loads")) report(loaded === true, "the plugin loads and the metadata cache resolves", cacheDetail);

  if (selected("no console errors") || selected("load time")) {
    const n0 = errorsBefore();
    const open = await openGraph(c);
    const errs = errorsSince(n0);
    const b = open.build || {};
    const line = "open -> __vg " + open.msToVg + " ms (build " + b.msTotal + " ms: index " + b.msIndex + ", edges " + b.msEdges + ", words " + b.msWords + (b.msWordsBackground !== undefined ? " (+" + b.msWordsBackground + " in the background)" : "") +
                 "; mount " + open.mountMs + " ms), -> intro landed and the disc at rest " + open.msToRest + " ms; " + open.order + " notes, " + open.size + " links, " + open.canvases + " canvases, stage " + open.stage;
    if (selected("no console errors")) report(errs.length === 0, "the view opens with no console errors", errs.length ? errs.slice(0, 3).join(" | ") : "0 errors; " + line);
    if (selected("load time")) report(open.msToRest > 0, "load time breakdown (informational)", line);
  } else {
    await openGraph(c);
  }

  if (selected("positions match the exporter")) {
    const here = await E("(function(){ var v = " + VIEW + ", api = v.handle.api, pos = {}; api.graph.forEachNode(function (id, a) { pos[a.path] = [a.x, a.y, a.size, a.folder, a.sub, a.deg, a.ntype, a.created]; });" +
                         " var dd = api.debugDump ? api.debugDump() : {};" +
                         " return { pos: pos, edges: api.graph.size, nodes: api.graph.order, order: v.lastData.nodes.map(function (n) { return n.id; })," +
                         " lattice: { stage: dd.screen && dd.screen.stage, pxPerRow: dd.screen && dd.screen.pxPerRow, spacing: dd.spacing, locked: dd.locked, camera: dd.camera, hidden: dd.filters && dd.filters.hiddenFolders, range: dd.filters && dd.filters.range, shown: dd.filters && dd.filters.shown } }; })()");
    console.log("         exporter lattice " + JSON.stringify(expo.lattice));
    console.log("         obsidian lattice " + JSON.stringify(here.lattice));
    let orderDiff = 0, firstOrder = "";
    for (let i = 0; i < Math.max(expo.order.length, here.order.length); i++) {
      if (expo.order[i] !== here.order[i]) { orderDiff++; if (!firstOrder) firstOrder = "#" + i + " exporter " + expo.order[i] + " vs cache " + here.order[i]; }
    }
    let maxD = 0, maxSize = 0, missing = 0, extra = 0, attrDiff = 0, moved = 0, worst = null;
    const examples = [];
    for (const path of Object.keys(expo.pos)) {
      const a = expo.pos[path], b = here.pos[path];
      if (!b) { missing++; continue; }
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
      if (d > 1e-6) moved++;
      if (d > maxD) { maxD = d; worst = path; }
      maxSize = Math.max(maxSize, Math.abs(a[2] - b[2]));
      if (a[3] !== b[3] || a[4] !== b[4] || a[5] !== b[5] || a[6] !== b[6] || a[7] !== b[7]) {
        attrDiff++;
        if (examples.length < 3) examples.push(path + ": exporter " + JSON.stringify(a.slice(3)) + " cache " + JSON.stringify(b.slice(3)));
      }
    }
    for (const path of Object.keys(here.pos)) if (!expo.pos[path]) extra++;
    const sameData = missing === 0 && extra === 0 && expo.edges === here.edges && attrDiff === 0;
    report(sameData && maxD <= 1e-6 && maxSize <= 1e-6, "layout positions match the exporter build of the same vault",
      here.nodes + " notes (" + missing + " missing here, " + extra + " extra), links " + expo.edges + " exporter vs " + here.edges + " cache; " +
      moved + " moved, max |d| " + maxD.toExponential(2) + " units" + (worst && maxD > 1e-6 ? " (worst " + worst + ")" : "") + ", size max |d| " + maxSize.toExponential(2) +
      "; folder/sub/deg/type/created differ on " + attrDiff + (examples.length ? " -- " + examples.join("; ") : "") +
      "; data order differs at " + orderDiff + " of " + expo.order.length + " slots" + (firstOrder ? " (first " + firstOrder + ")" : ""));
  }

  await E("(function(){ var l = app.workspace.getLeavesOfType(" + JSON.stringify(VT) + ")[0]; if (l) app.workspace.setActiveLeaf(l, { focus: true }); })(); void 0");
  await sleep(300);
  {
    const box = await stageBox(c);
    const cx = box.left + 8, cy = box.top + box.h - 8;
    await mouse(c, "mouseMoved", cx, cy, { buttons: 0 });
    await mouse(c, "mousePressed", cx, cy, { button: "left", clickCount: 1, buttons: 1 });
    await mouse(c, "mouseReleased", cx, cy, { button: "left", clickCount: 1, buttons: 0 });
    await sleep(400);
    await camSettle(c);
  }
  const id = await E(TOP_NOTE);
  if (selected("hover")) {
    const at = await noteAt(c, id);
    await mouse(c, "mouseMoved", at.x, at.y, { buttons: 0 });
    await sleep(600);
    const on = await E("(function(){ var v = " + VIEW + "; var t = v.contentEl.querySelector('#vg-tip'); return { shown: !!t && !t.hidden, text: t ? (t.textContent || '').slice(0, 60) : '' }; })()");
    await mouse(c, "mouseMoved", 3, 3, { buttons: 0 });
    await sleep(500);
    const off = await E("(function(){ var v = " + VIEW + "; var t = v.contentEl.querySelector('#vg-tip'); return !!t && !t.hidden; })()");
    report(on.shown && on.text.includes(at.label) && !off, "hover shows the note's tip and lifts when the pointer leaves",
      "tip on hover: " + on.shown + " (" + JSON.stringify(on.text) + "), aimed at " + JSON.stringify(at.label) + " @ " + Math.round(at.x) + "," + Math.round(at.y) + "; tip after leaving: " + off);
  }

  if (selected("click")) {
    const at = await noteAt(c, id);
    await E("(function(){ var R = " + VIEW + ".handle.api.renderer; window.__vgSmokeEv = []; ['downNode','upNode','clickNode','clickStage','doubleClickNode','downStage'].forEach(function (k) {" +
            " R.on(k, function (e) { window.__vgSmokeEv.push(k + (e && e.node ? ':' + e.node : '')); }); }); })(); void 0");
    await mouse(c, "mouseMoved", at.x, at.y, { buttons: 0 });
    await sleep(150);
    await mouse(c, "mousePressed", at.x, at.y, { button: "left", clickCount: 1, buttons: 1 });
    await mouse(c, "mouseReleased", at.x, at.y, { button: "left", clickCount: 1, buttons: 0 });
    await sleep(600);
    const fired = await E("(window.__vgSmokeEv || []).join(' ')");
    const now = await noteAt(c, id);
    const drift = Math.hypot(now.x - at.x, now.y - at.y);
    const card = await E("(function(){ var v = " + VIEW + "; var d = v.contentEl.querySelector('#vg-detail'); return { open: !!d && !d.hidden, text: d ? (d.textContent || '').slice(0, 80) : '' }; })()");
    await E("(function(){ var v = " + VIEW + "; var x = v.contentEl.querySelector('#vg-detail .x'); if (x) x.click(); })(); void 0");
    await mouse(c, "mouseMoved", 3, 3, { buttons: 0 });
    await sleep(300);
    const closed = await E("(function(){ var v = " + VIEW + "; var d = v.contentEl.querySelector('#vg-detail'); return !d || d.hidden; })()");
    report(card.open && card.text.includes(at.label) && closed, "click opens the note's card, its close button closes it",
      "card open " + card.open + " naming " + JSON.stringify(at.label) + ": " + card.text.includes(at.label) + "; closed after x: " + closed + "; renderer events: " + (fired || "none") + "; target drifted " + drift.toFixed(2) + " px between aim and read-back");
  }

  if (selected("right-click")) {
    const before = await E("(" + VIEW + ").plugin.settings.pinned.length");
    await E("(function(){ var v = " + VIEW + "; window.__vgSmokeRc = { menu: 0, node: 0 };" +
            " v.contentEl.querySelector('#vg-graph').addEventListener('contextmenu', function () { window.__vgSmokeRc.menu++; }, true);" +
            " v.handle.api.renderer.on('rightClickNode', function () { window.__vgSmokeRc.node++; }); })(); void 0");
    const rightClick = async () => {
      const a = await noteAt(c, id);
      await mouse(c, "mouseMoved", a.x, a.y, { buttons: 0 });
      await sleep(150);
      await mouse(c, "mousePressed", a.x, a.y, { button: "right", clickCount: 1, buttons: 2 });
      await mouse(c, "mouseReleased", a.x, a.y, { button: "right", clickCount: 1, buttons: 0 });
      await mouse(c, "mouseMoved", 3, 3, { buttons: 0 });
      await waitFor(c, READY, 30000, "the pin cascade");
      return a;
    };
    const at = await rightClick();
    const pinned = await E("(" + VIEW + ").plugin.settings.pinned.slice()");
    const at2 = await noteAt(c, id);
    await rightClick();
    const after = await E("(" + VIEW + ").plugin.settings.pinned.length");
    const rc = await E("window.__vgSmokeRc");
    const instances = await E("(function(){ var v = " + VIEW + "; return v.plugin === app.plugins.getPlugin('" + PLUGIN_ID + "') ? 'one plugin instance' : 'TWO plugin instances (the view belongs to an earlier load)'; })()");
    const moved = Math.hypot(at2.x - at.x, at2.y - at.y);
    report(pinned.includes(id) && pinned.length === before + 1 && after === before, "right-click pins the note into the hub and persists it, a second right-click releases it",
      "pinned " + before + " -> " + pinned.length + " (" + (pinned.includes(id) ? "holds " + id : "does not hold " + id) + ") -> " + after + "; the note moved " + Math.round(moved) + " px into the hub; " +
      rc.menu + " contextmenu events, " + rc.node + " rightClickNode events over two right-clicks; " + instances);
  }

  if (selected("double-click")) {
    const box = await stageBox(c);
    const fitRatio = await E(VIEW + ".handle.api.renderer.getCamera().getState().ratio");
    await E(VIEW + ".handle.api.renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: " + (fitRatio * 0.4) + ", angle: 0 }); void 0");
    await sleep(400);
    const zoomed = await E(VIEW + ".handle.api.renderer.getCamera().getState().ratio");
    const cx = box.left + box.w * 0.5, cy = box.top + 40;
    await mouse(c, "mouseMoved", cx, cy, { buttons: 0 });
    for (const n of [1, 2]) {
      await mouse(c, "mousePressed", cx, cy, { button: "left", clickCount: n, buttons: 1 });
      await mouse(c, "mouseReleased", cx, cy, { button: "left", clickCount: n, buttons: 0 });
      await sleep(80);
    }
    await sleep(1500);
    const back = await E(VIEW + ".handle.api.renderer.getCamera().getState().ratio");
    report(Math.abs(zoomed - fitRatio * 0.4) < 1e-6 && Math.abs(back - fitRatio) < 0.02 * fitRatio, "double-clicking the stage fits the camera back",
      "fit ratio " + fitRatio.toFixed(4) + " -> zoomed " + zoomed.toFixed(4) + " -> after double-click " + back.toFixed(4));
  }

  if (selected("close and reopen")) {
    const rows = [];
    const load = await counters(c);
    console.log("         load      heap " + load.heapMB + " MB  nodes " + load.nodes + "  listeners " + load.listeners + "  document mousemove " + load.move + " visibilitychange " + load.vis + "  window resize " + load.resize);
    let msOpen = [];
    for (let i = 1; i <= CYCLES; i++) {
      await closeGraph(c);
      const open = await openGraph(c);
      msOpen.push(open.msToRest);
      const k = await counters(c);
      rows.push(k);
      console.log("         cycle " + i + "   heap " + k.heapMB + " MB  nodes " + k.nodes + "  listeners " + k.listeners + "  document mousemove " + k.move + " visibilitychange " + k.vis + "  window resize " + k.resize + "  (reopen " + open.msToRest + " ms)");
    }
    const first = rows[0], last = rows[rows.length - 1];
    const per = (a, b) => (b - a) / (rows.length - 1);
    const problems = [];
    if (last.nodes > first.nodes + 5) problems.push("DOM nodes " + first.nodes + " -> " + last.nodes);
    if (last.listeners > first.listeners + 2) problems.push("listeners " + first.listeners + " -> " + last.listeners);
    if (last.move !== first.move) problems.push("document mousemove " + first.move + " -> " + last.move);
    if (last.vis !== first.vis) problems.push("document visibilitychange " + first.vis + " -> " + last.vis);
    if (last.resize !== first.resize) problems.push("window resize " + first.resize + " -> " + last.resize);
    const heapPer = per(first.heapMB, last.heapMB);
    if (heapPer > 1.5) problems.push("post-GC heap +" + heapPer.toFixed(2) + " MB/cycle");
    report(problems.length === 0, "closing and reopening the view " + CYCLES + " times grows no listeners, DOM or heap",
      problems.length ? problems.join("; ") : "cycle 1 -> " + CYCLES + ": heap " + first.heapMB + " -> " + last.heapMB + " MB (" + heapPer.toFixed(2) + " MB/cycle), nodes " + first.nodes + " -> " + last.nodes +
      ", listeners " + first.listeners + " -> " + last.listeners + ", document mousemove " + first.move + "/" + last.move + ", reopen " + Math.min(...msOpen) + "-" + Math.max(...msOpen) + " ms");
  }

  if (selected("refresh")) {
    const n0 = errorsBefore();
    const oldHandle = await E("(function(){ var v = " + VIEW + "; window.__vgSmokeOld = v.handle; return !!v.handle; })()");
    const t0 = Date.now();
    await E(VIEW + ".contentEl.querySelector('#vg-refresh').click(); void 0");
    await sleep(200);
    const ready = await waitFor(c, "(function(){ var v = " + VIEW + "; if (!v || !v.handle || v.handle === window.__vgSmokeOld) return null; var r = " + READY + "; return r; })()", VG_TIMEOUT_MS, "the refreshed view");
    const ms = Date.now() - t0;
    const oldDead = await E("(function(){ var h = window.__vgSmokeOld; var dead = !h || !h.api; window.__vgSmokeOld = null; return dead; })()");
    const errs = errorsSince(n0);
    report(oldHandle && oldDead && ready.canvases > 0 && errs.length === 0, "the Refresh button rebuilds from the cache and remounts, destroying the old mount",
      "remounted in " + ms + " ms (build " + (ready.build && ready.build.msTotal) + " ms, mount " + ready.mountMs + " ms), " + ready.order + " notes, " + ready.canvases + " canvases, old mount api " + (oldDead ? "gone" : "STILL LIVE") + ", " + errs.length + " errors");
  }

  if (selected("theme")) {
    const readColours = "(function(){ var v = " + VIEW + ", api = v.handle.api, root = v.contentEl.querySelector('#vg-app'); var cs = getComputedStyle(root);" +
                        " return { theme: v.page.getAttribute('data-theme'), bodyLight: document.body.classList.contains('theme-light'), text: cs.getPropertyValue('--text-1').trim()," +
                        " surface: cs.getPropertyValue('--surface-1').trim(), labelColor: api.renderer.getSetting ? api.renderer.getSetting('labelColor') : null }; })()";
    const before = await E(readColours);
    const other = before.bodyLight ? "obsidian" : "moonstone";
    const changer = await E("typeof app.changeTheme === 'function' ? 'changeTheme' : (typeof app.setTheme === 'function' ? 'setTheme' : 'none')");
    if (changer === "none") {
      report(false, "switching Obsidian's theme recolours nodes, edges and labels", "no app.changeTheme/setTheme on this Obsidian");
    } else {
      await E("app." + changer + "('" + other + "'); void 0");
      await sleep(900);
      const after = await E(readColours);
      await E("app." + changer + "('" + (before.bodyLight ? "moonstone" : "obsidian") + "'); void 0");
      await sleep(600);
      const restored = await E(readColours);
      const flipped = after.theme !== before.theme && after.bodyLight !== before.bodyLight;
      const labelsFollow = after.labelColor && after.labelColor.toLowerCase() === after.text.toLowerCase();
      report(flipped && labelsFollow && restored.theme === before.theme, "switching Obsidian's theme recolours nodes, edges and labels",
        "data-theme " + before.theme + " -> " + after.theme + " -> " + restored.theme + "; --text-1 " + before.text + " -> " + after.text + "; labelColor " + before.labelColor + " -> " + after.labelColor +
        (labelsFollow ? " (follows)" : " (STALE)") + "; surface " + before.surface + " -> " + after.surface);
    }
  }

  if (selected("settings tab")) {
    const defs = await E("(function(){ var p = app.plugins.getPlugin('" + PLUGIN_ID + "'); var tab = app.setting.pluginTabs.find(function (t) { return t.id === '" + PLUGIN_ID + "'; });" +
                         " var d = tab && typeof tab.getSettingDefinitions === 'function' ? tab.getSettingDefinitions() : null;" +
                         " var count = function (items) { var n = 0; items.forEach(function (it) { n += it.items ? count(it.items) : 1; }); return n; };" +
                         " return { hasTab: !!tab, declarative: !!d, top: d ? d.length : 0, items: d ? count(d) : 0, compact: p.settings.compactAxis }; })()");
    await E("app.setting.open(); app.setting.openTabById('" + PLUGIN_ID + "'); void 0");
    await sleep(700);
    const shown = await E("(function(){ var t = app.setting.activeTab; var el = t && (t.containerEl || t.contentEl); return { id: t && t.id, rows: el ? el.querySelectorAll('.setting-item').length : 0," +
                          " toggles: el ? el.querySelectorAll('.checkbox-container').length : 0, headings: el ? el.querySelectorAll('.setting-item-heading').length : 0, swatches: el ? el.querySelectorAll('.vault-graph .swatch, .vault-graph [data-slot], .vg-colours button').length : 0 }; })()");
    const before = await E("!!" + VIEW + ".contentEl.querySelector('#vg-compact').getAttribute('aria-pressed')");
    const pressedBefore = await E(VIEW + ".contentEl.querySelector('#vg-compact').getAttribute('aria-pressed')");
    await E("(async function(){ var t = app.setting.activeTab; await t.setControlValue('compactAxis', " + (pressedBefore === "true" ? "false" : "true") + "); })()");
    await sleep(600);
    const pressedAfter = await E(VIEW + ".contentEl.querySelector('#vg-compact').getAttribute('aria-pressed')");
    const saved = await E("(async function(){ var raw = await app.vault.adapter.read(app.vault.configDir + '/plugins/" + PLUGIN_ID + "/data.json'); return JSON.parse(raw).compactAxis; })()");
    await E("(async function(){ var t = app.setting.activeTab; await t.setControlValue('compactAxis', " + (pressedBefore === "true") + "); })()");
    await sleep(400);
    await E("app.setting.close(); void 0");
    report(defs.declarative && defs.items >= 9 && shown.id === PLUGIN_ID && shown.rows >= 9 && pressedAfter !== pressedBefore && String(saved) === String(pressedBefore !== "true") && before,
      "the settings tab renders from getSettingDefinitions and a toggle round-trips to the view and to data.json",
      "definitions: " + defs.top + " top-level, " + defs.items + " items; rendered " + shown.rows + " rows, " + shown.toggles + " toggles, " + shown.headings + " headings; compact axis button " + pressedBefore + " -> " + pressedAfter + ", data.json compactAxis " + saved);
  }

  // github#40, design/0012
  const TRAIL = "(function(){ var v = " + VIEW + "; if (!v) return null; var d = v.contentEl.querySelector('#vg-detail'); var cr = d && !d.hidden ? d.querySelector('.crumbs') : null;" +
                " var doc = v.contentEl.ownerDocument, ae = doc.activeElement; return { open: !!d && !d.hidden," +
                " title: d && !d.hidden ? d.querySelector('h2').textContent : null, crumbs: cr ? cr.querySelectorAll('button.crumb').length : 0," +
                " active: ae ? ae.tagName + '#' + ae.id : '', inMount: !!(ae && v.contentEl.contains(ae)) }; })()";
  const HOP = "(function(){ var v = " + VIEW + "; var bs = v.contentEl.querySelectorAll('#vg-detail [data-go]'); var b = bs[Math.min(1, bs.length - 1)]; if (!b) return false; b.click(); return true; })()";
  const BACK = "(function(){ var v = " + VIEW + "; var b = v.contentEl.querySelector('#vg-detail .crumbs .nvb'); if (!b) return false; b.click(); return true; })()";
  // design/0012 -- assert each hop; a missed one reads as a short trail
  const cardOpen = () => waitFor(c, "(function(){ var v = " + VIEW + "; if (!v) return null;" +
                                    " var d = v.contentEl.querySelector('#vg-detail'); return d && !d.hidden ? true : null; })()",
                                 8000, "the detail card");
  const hopOnce = async () => { const ok = await E(HOP); await sleep(600); return ok === true; };
  const backOnce = async () => { const ok = await E(BACK); await sleep(400); return ok === true; };
  const keyIn = async (key, mods = 0) => {
    const ev = { key, code: key, windowsVirtualKeyCode: key === "Backspace" ? 8 : key === "ArrowLeft" ? 37 : 0, modifiers: mods };
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", ...ev });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", ...ev });
    await sleep(200);
  };
  const clickNote = async () => {
    const at = await noteAt(c, id);
    await mouse(c, "mouseMoved", at.x, at.y, { buttons: 0 });
    await sleep(150);
    await mouse(c, "mousePressed", at.x, at.y, { button: "left", clickCount: 1, buttons: 1 });
    await mouse(c, "mouseReleased", at.x, at.y, { button: "left", clickCount: 1, buttons: 0 });
    await sleep(400);
    await mouse(c, "mouseMoved", 3, 3, { buttons: 0 });
    return at;
  };
  if (selected("trail")) {
    const n0 = errorsBefore();
    await clickNote();
    await cardOpen();
    const s0 = await E(TRAIL);
    const hops = [await hopOnce(), await hopOnce()];
    const s2 = await E(TRAIL);
    const backs = [await backOnce()];
    const s1 = await E(TRAIL);
    await keyIn("Backspace");
    await keyIn("ArrowLeft", 1);
    const sKeys = await E(TRAIL);
    backs.push(await backOnce());
    const s0b = await E(TRAIL);
    await closeGraph(c);
    await openGraph(c);
    await clickNote();
    await cardOpen();
    hops.push(await hopOnce(), await hopOnce());
    const r2 = await E(TRAIL);
    backs.push(await backOnce());
    const r1 = await E(TRAIL);
    await E("(function(){ var v = " + VIEW + "; var x = v.contentEl.querySelector('#vg-detail .x'); if (x) x.click(); })(); void 0");
    const errs = errorsSince(n0);
    report(s0.open && s0.crumbs === 0 && s2.crumbs === 2 && s1.crumbs === 1 && sKeys.crumbs === 1 && sKeys.open &&
           s0b.crumbs === 0 && s0b.open && r2.crumbs === 2 && r1.crumbs === 1 && errs.length === 0 &&
           hops.every(Boolean) && backs.every(Boolean),
      "the hop trail works inside the view, claims no key of Obsidian's, and a reopened view starts fresh",
      "click: card " + (s0.open ? "open" : "CLOSED") + " with " + s0.crumbs + " crumbs; 2 hops: " + s2.crumbs + "; back arrow: " + s1.crumbs +
      "; Backspace and Alt+ArrowLeft (the page must ignore both): " + sKeys.crumbs + " crumbs, card " + (sKeys.open ? "still open" : "CLOSED") +
      "; back arrow: " + s0b.crumbs + " (card " + (s0b.open ? "open" : "closed") + "); reopened, 2 hops: " + r2.crumbs + ", back arrow: " + r1.crumbs + "; " + errs.length + " errors");
  }
  if (selected("moved-out")) {
    const n0 = errorsBefore();
    // design/0012 -- a hop leaves the camera off-frame for the next click
    await E("(function(){ var v = " + VIEW + "; var b = v.contentEl.querySelector('#vg-reset'); if (b) b.click(); })(); void 0");
    await camSettle(c);
    await clickNote();
    await cardOpen();
    const h0 = await E(TRAIL);
    const hopped = [await hopOnce()];
    const h1 = await E(TRAIL);
    hopped.push(await hopOnce());
    const before = await E(TRAIL);
    const walk = "card " + h0.crumbs + " crumbs -> hop " + h1.crumbs + " (" + JSON.stringify(h1.title) + ")" +
                 " -> hop " + before.crumbs + " (" + JSON.stringify(before.title) + ")" +
                 (hopped.every(Boolean) ? "" : " -- A HOP DID NOT LAND");
    const moved = await E("(async function(){ var ls = app.workspace.getLeavesOfType(" + JSON.stringify(VT) + "); if (!ls[0]) return 'no leaf'; var v0 = ls[0].view; var api0 = v0.handle.api;" +
                          " window.__vgSmokeEv = []; ['clickNode','clickStage','downStage'].forEach(function (k) { api0.renderer.on(k, function (e) { window.__vgSmokeEv.push(k + (e && e.node ? ':' + e.node : '')); }); });" +
                          " var d0 = v0.contentEl.querySelector('#vg-detail'); var t0 = d0.querySelector('h2').textContent; var log = [];" +
                          " var snap = function (why) { var h = d0.querySelector('h2'); log.push(why + ':' + (d0.hidden ? 'hidden' : (h ? h.textContent : '?')) + '/' + [].map.call(d0.querySelectorAll('button.crumb'), function (b) { return b.textContent; }).join('>')); };" +
                          " snap('before'); var mo = new MutationObserver(function () { snap('mut'); }); mo.observe(d0, { childList: true, attributes: true, attributeFilter: ['hidden'] });" +
                          " app.workspace.moveLeafToPopout(ls[0], " + POPOUT + "); await new Promise(function (r) { setTimeout(r, 1500); }); mo.disconnect(); snap('after');" +
                          " var v = ls[0].view; var doc = v.contentEl.ownerDocument; var d = v.contentEl.querySelector('#vg-detail'); var t1 = d && !d.hidden ? d.querySelector('h2').textContent : null;" +
                          " return { otherDoc: doc !== document, sameView: v === v0 && v.handle && v.handle.api === api0, crumbs: v.contentEl.querySelectorAll('#vg-detail button.crumb').length," +
                          " at: doc.defaultView.screenX + ',' + doc.defaultView.screenY," +
                          " open: !!d && !d.hidden, title: t1 === t0 ? 'same' : 'CHANGED ' + t0 + ' -> ' + t1, events: window.__vgSmokeEv.join(' ') || 'none', log: log.join(' | ') }; })()").catch((e) => e.message);
    const afterPop = await E("(function(){ var v = " + VIEW + "; var b = v.contentEl.querySelector('#vg-detail .crumbs .nvb'); if (!b) return 'no back arrow';" +
                             " b.click(); return v.contentEl.querySelectorAll('#vg-detail button.crumb').length; })()").catch((e) => e.message);
    await E("(function(){ app.workspace.getLeavesOfType(" + JSON.stringify(VT) + ").forEach(function (l) { l.detach(); }); })(); void 0");
    await sleep(800);
    const popouts = await E("(function(){ var fs = app.workspace.floatingSplit; return fs && fs.children ? fs.children.length : 0; })()").catch(() => -1);
    const errs = errorsSince(n0);
    const popAt = moved && typeof moved.at === "string" ? +moved.at.split(",")[0] : NaN;
    const onLeft = popAt >= SCREEN.x - 80 && popAt < SCREEN.x + SCREEN.w;
    report(hopped.every(Boolean) && before.crumbs === 2 && moved && moved.otherDoc && moved.sameView &&
           moved.crumbs === 2 && moved.open && afterPop === 1 && popouts === 0 && errs.length === 0 && onLeft,
      "the trail survives a view moved out to a popout, and its back arrow still steps there",
      walk + "; moved to a popout: " + JSON.stringify(moved) + "; the back arrow on the moved card: " + afterPop + " crumb(s) left" +
      "; popout " + (onLeft ? "on the leftmost screen" : "OFF the leftmost screen (" + SCREEN.x + ".." + (SCREEN.x + SCREEN.w) + ")") +
      "; popout windows left open: " + popouts + "; " + errs.length + " errors");
    await openGraph(c);
  }

  if (selected("popout")) {
    const n0 = errorsBefore();
    await closeGraph(c);
    const t0 = Date.now();
    const started = await E("(async function(){ var leaf = app.workspace.openPopoutLeaf(" + POPOUT + "); await leaf.setViewState({ type: '" + VT + "', active: true }); return !!leaf; })()").catch((e) => e.message);
    const ready = await waitFor(c, "(function(){ var v = " + VIEW + "; if (!v || !v.handle || !v.handle.api || !v.handle.api.graph) return null;" +
                                   " var doc = v.contentEl.ownerDocument; var busy = v.contentEl.querySelector('#vg-busy'); if (busy && !busy.hidden) return null;" +
                                   " return { otherDoc: doc !== document, otherWin: doc.defaultView !== window, canvases: v.contentEl.querySelectorAll('#vg-graph canvas').length," +
                                   " w: doc.defaultView.innerWidth, h: doc.defaultView.innerHeight, dpr: doc.defaultView.devicePixelRatio," +
                                   " at: doc.defaultView.screenX + ',' + doc.defaultView.screenY," +
                                   " stage: (function(){ var s = v.contentEl.querySelector('#vg-graph canvas'); return s ? s.width + 'x' + s.height : ''; })() }; })()",
                                VG_TIMEOUT_MS, "the popout view");
    const ms = Date.now() - t0;
    await sleep(500);
    const errs = errorsSince(n0);
    await E("(function(){ app.workspace.getLeavesOfType(" + JSON.stringify(VT) + ").forEach(function (l) { l.detach(); }); })(); void 0");
    await sleep(800);
    const popouts = await E("(function(){ var fs = app.workspace.floatingSplit; return fs && fs.children ? fs.children.length : 0; })()").catch(() => -1);
    report(started === true && ready.otherDoc && ready.otherWin && ready.canvases > 0 && errs.length === 0 && popouts === 0,
      "the view mounts in a popout window and tears down with it",
      "popout document " + ready.otherDoc + ", window " + ready.otherWin + " (" + ready.w + "x" + ready.h + " @" + ready.dpr + "x at " + ready.at + "), " + ready.canvases + " canvases, stage " + ready.stage + ", ready in " + ms + " ms, " + errs.length + " errors, popout windows left open: " + popouts);
    await openGraph(c);
  }
  if (selected("plugin reload")) {
    const n0 = errorsBefore();
    const t0 = Date.now();
    let alive = true, detail = "";
    try {
      await E("(async function(){ await app.plugins.disablePlugin('" + PLUGIN_ID + "'); return true; })()");
      const gone = await E("(function(){ return { leaves: app.workspace.getLeavesOfType(" + JSON.stringify(VT) + ").length, plugin: !!app.plugins.getPlugin('" + PLUGIN_ID + "'), canvases: document.querySelectorAll('#vg-graph canvas').length }; })()");
      await sleep(500);
      await E("(async function(){ await app.plugins.enablePlugin('" + PLUGIN_ID + "'); return true; })()");
      const back = await waitFor(c, "!!app.plugins.getPlugin('" + PLUGIN_ID + "')", 30000, "the plugin's second load");
      const open = await openGraph(c);
      const errs = errorsSince(n0);
      detail = "disabled: " + gone.leaves + " leaf, plugin " + gone.plugin + ", " + gone.canvases + " canvases left; re-enabled " + back + "; reopened in " + open.msToRest + " ms, " + open.order + " notes, " + open.canvases + " canvases, " + errs.length + " errors; " + (Date.now() - t0) + " ms in all";
      report(gone.canvases === 0 && errs.length === 0 && open.canvases > 0, "disabling and re-enabling the plugin with the view open (plugin:reload) leaves a working view", detail);
    } catch (e) {
      alive = !c.lost;
      report(false, "disabling and re-enabling the plugin with the view open (plugin:reload) leaves a working view",
        (alive ? "" : "THE OBSIDIAN WINDOW WENT AWAY: ") + e.message + (c.lost ? " (CDP: " + c.lost + ")" : ""));
      if (!alive) throw e;
    }
  }

  if (selected("cold start")) {
    await closeGraph(c);
    await E("(async function(){ if (app.workspace.requestSaveLayout) app.workspace.requestSaveLayout(); else await app.workspace.saveLayout(); return true; })()").catch(() => 0);
    await sleep(1500);
    c.close();
    killObsidian(ob.child);
    await sleep(1500);
    const spawnedAt = Date.now();
    ob = await launchObsidian(vault, profile, false);
    c = ob.cdp;
    E = evalIn(c);
    await E("(function(){ window.__vgSmoke = { attachedAt: performance.now(), resolvedAt: null }; app.metadataCache.on('resolved', function () { if (window.__vgSmoke.resolvedAt === null) window.__vgSmoke.resolvedAt = performance.now(); }); })(); void 0");
    await shapeWindow();
    const t0 = Date.now();
    let key0 = "", since0 = Date.now(), snap = null;
    for (;;) {
      snap = await E("(function(){ var r = app.metadataCache.resolvedLinks || {}; var n = 0; for (var k in r) n++; return { files: app.vault.getMarkdownFiles().length, sources: n, plugin: !!app.plugins.getPlugin('" + PLUGIN_ID + "'), resolvedAt: window.__vgSmoke.resolvedAt }; })()");
      const key = snap.files + "/" + snap.sources;
      if (key !== key0) { key0 = key; since0 = Date.now(); }
      if (snap.plugin && Date.now() - since0 >= 1500) break;
      if (Date.now() - t0 > VG_TIMEOUT_MS) break;
      await sleep(200);
    }
    const msCache = Date.now() - t0 - 1500;
    const n0 = errorsBefore();
    const open = await openGraph(c);
    const b = open.build || {};
    report(errorsSince(n0).length === 0 && open.order > 0, "cold start: a second launch of the same vault opens the graph",
      "attach " + ob.attachedAfterMs + " ms after spawn (" + (Date.now() - spawnedAt) + " ms total); " + snap.files + " files and " + snap.sources + " resolved sources restored, stable " + Math.max(0, msCache) + " ms after attach" +
      (snap.resolvedAt !== null ? " ('resolved' fired)" : " (no 'resolved' event)") + "; open -> __vg " + open.msToVg + " ms (build " + b.msTotal + " ms: index " + b.msIndex + ", edges " + b.msEdges + ", words " + b.msWords + (b.msWordsBackground !== undefined ? " (+" + b.msWordsBackground + " in the background)" : "") +
      "; mount " + open.mountMs + " ms), -> at rest " + open.msToRest + " ms; stage " + open.stage);
  }
} catch (e) {
  report(false, "the run aborted", e.message);
} finally {
  const late = c.errors.length;
  if (late) console.log("  note: " + late + " console error(s)/exception(s) over the whole run; first: " + c.firstError());
  try { c.close(); } catch { }
  killObsidian(ob.child);
  await sleep(500);
  if (!KEEP) {
    rmSync(profile, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  } else {
    console.log("kept " + vault + " and " + profile);
  }
}

const bad = results.filter((r) => !r.ok);
console.log("\n" + (bad.length ? "obsidian-smoke: FAILED " + bad.length + "/" + results.length : "obsidian-smoke: ok " + results.length + "/" + results.length + " passed"));
process.exit(bad.length ? 1 : 0);
