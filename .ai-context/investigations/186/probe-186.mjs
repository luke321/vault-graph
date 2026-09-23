#!/usr/bin/env node
// INVESTIGATION TOOLING for github#186 -- not a fix, not part of the repo.
// Drives a built vault-graph page in HEADLESS Chrome over CDP, fires one act (an `only` chip,
// an eye toggle, or a dimension switch followed by an eye toggle), and samples EVERY animation
// frame of the cascade that follows: per group, the wedge arc the packer allots against the
// opacity actually inside it; per band, the seam reservation and the radial extent of the
// notes on screen. Snapshots the resting layout before, after, and after a fresh relayout.
// Optionally films the stage through Page.startScreencast and encodes a square, CROPPED clip.
//
//   node probe-186.mjs --repo <worktree> --html <built page> --out <dir> --label <text>
//                      --act "only:03 - Resources" [--slow 4] [--film] [--dim tag]
//
// Headless: no window is placed on any monitor, so the screen guard and the repo's
// screen-* locks are not involved.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.indexOf("--" + n) >= 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REPO = resolve(arg("repo", process.cwd()));
const { attach } = await import(pathToFileURL(join(REPO, "scripts", "cdp.mjs")).href);
const HTML_IN = resolve(arg("html", ""));
const OUT = resolve(arg("out", join(process.cwd(), "out")));
const LABEL = arg("label", "186-pack-investigation");
const ACT = arg("act", "");
const DIM = arg("dim", "");
const SLOW = Number(arg("slow", "4"));
const FILM = has("film");
// github#186 -- PNG encode cost drops 12-16% of a heavy act's frames; jpeg keeps them
const FILM_FMT = arg("film-format", "png");
const FILM_Q = Number(arg("film-quality", "95"));
const W = 1200, H = 1000;
// github#186 -- a denser capture, so a clip can fill 1200px without being scaled up
const DSF = Number(arg("dsf", "1"));
if (!HTML_IN || !existsSync(HTML_IN)) throw new Error("pass --html <built page>");
mkdirSync(OUT, { recursive: true });

// label the page title the way the repo asks (never serve Chrome unlabeled)
const html = join(OUT, "page.html");
{
  const src = readFileSync(HTML_IN, "utf8");
  const out = src.replace(/(window\.VAULT_DATA=\{[\s\S]*?"vault":)("(?:\\.|[^"\\])*")/,
    (_m, head) => head + JSON.stringify(LABEL));
  if (out === src) throw new Error("could not label the page: no VAULT_DATA vault field");
  writeFileSync(html, out);
}

function findChrome() {
  const g = [process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
             process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
             process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe"];
  for (const c of g) if (c && existsSync(c)) return c;
  throw new Error("Chrome not found");
}
function freePort() {
  return new Promise((res, rej) => import("node:net").then(({ createServer }) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  }));
}

const PORT = await freePort();
const profile = mkdtempSync(join(tmpdir(), "vg-186-prof-"));
// github#186 -- --clean films the page as a person sees it, without the wedge overlay
const url = pathToFileURL(html).href + (has("clean") ? "?rest&slow=" : "?rest&wedges&slow=") + SLOW
  + (arg("query", "") ? "&" + arg("query", "") : "");
const HEADED = has("headed");
// headed: a real window on the free monitor, under the repo's own screen lock and focus guard,
// exactly as smoke.mjs / probe-room.mjs do -- headless Chrome starves rAF on this page and the
// cascade's 400 ms watchdog settles it after a handful of frames.
let lockHeld = false, focus = null;
const LOCK = "screen-left", OWNER = "probe-186 [" + process.pid + "]";
if (HEADED) {
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "lock.mjs"), "acquire", LOCK, "--owner", OWNER], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("could not take " + LOCK);
  lockHeld = true;
  const { keepFocus } = await import(pathToFileURL(join(REPO, "scripts", "focus.mjs")).href);
  focus = await keepFocus();
}
const { leftWindowArgs } = await import(pathToFileURL(join(REPO, "scripts", "screen.mjs")).href);
const chrome = spawn(findChrome(), [
  ...(HEADED ? [] : ["--headless=new"]), `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows", "--hide-scrollbars", `--force-device-scale-factor=${DSF}`,
  ...(HEADED ? [...leftWindowArgs(W, H), `--app=${url}`] : [`--window-size=${W},${H}`, url]),
], { stdio: "ignore" });
if (focus) void focus.watch(chrome.pid);

/* ------------------------------------------------------------- page expressions */

// one full snapshot of the resting layout
const MEASURE = `(function () {
  var G = __vg.graph, R = __vg.renderer, gl = __vg.geomLock;
  var UNIT = 160, INNER_SCALE = 0.8, INNER_FILL = 0.8;
  var plan = __vg.buildWedgePlan(true, function (id) { return __vg.alpha[id] || 0; });
  var bands = { i: { n: 0, lit: 0, rMin: Infinity, rMax: 0, radii: {} }, o: { n: 0, lit: 0, rMin: Infinity, rMax: 0, radii: {} } };
  var groups = {};
  G.forEachNode(function (id, a) {
    var g = __vg.groupOf(id), bk = __vg.isInner(id) ? "i" : "o";
    var al = __vg.alpha[id] || 0;
    var gg = groups[g] || (groups[g] = { n: 0, alphaSum: 0, lit: 0, band: bk });
    gg.n++; gg.alphaSum += al; if (al > 0.004) gg.lit++;
    if (__vg.isOrphan(id) || __vg.isPinned(id)) return;
    var b = bands[bk]; b.n++;
    if (al > 0.5) {
      var r = Math.hypot(a.x, a.y);
      b.lit++; if (r < b.rMin) b.rMin = r; if (r > b.rMax) b.rMax = r;
      var rk = Math.round(r); b.radii[rk] = (b.radii[rk] || 0) + 1;
    }
  });
  var rails = gl ? {
    innerRow0: gl.r0 * INNER_SCALE * UNIT,
    innerTop: (gl.r0 + (gl.rOuter - gl.r0) * INNER_FILL) * INNER_SCALE * UNIT,
    outerRow0: gl.rOuter * UNIT, outerTop: gl.maxR * UNIT,
    r0: gl.r0 * UNIT, rOuter: gl.rOuter * UNIT, maxR: gl.maxR * UNIT
  } : null;
  var cells = plan ? plan.cells.map(function (c) {
    return { g: c.g, k: c.k, inner: !!c.inner, n: c.list.length, wsum: Math.round(c.wsum * 1000) / 1000,
             rows: c.rows, bandDeg: Math.round(c.band * 180 / Math.PI * 1000) / 1000 };
  }) : [];
  Object.keys(bands).forEach(function (k) {
    var b = bands[k]; var rs = Object.keys(b.radii).map(Number).sort(function (x, y) { return x - y; });
    b.rowsUsed = rs.length; b.radiiList = rs; if (b.rMin === Infinity) b.rMin = 0;
  });
  return {
    plan: plan ? { r0: plan.r0, rOuter: plan.rOuter, maxR: plan.maxR, sp: plan.sp, spInner: plan.spInner,
                   rows: plan.rows, room: plan.room, total: plan.total, cells: cells } : null,
    geomLock: gl ? { r0: gl.r0, rOuter: gl.rOuter, maxR: gl.maxR, rows: gl.rows, bandR: gl.bandR, bandTotal: gl.bandTotal, dim: gl.dim } : null,
    rails: rails, bands: bands, groups: groups,
    seams: { i: { deg: __vg.seamDeg("i"), nB: __vg.seamNB("i") }, o: { deg: __vg.seamDeg("o"), nB: __vg.seamNB("o") } },
    lastGap: __vg.lastGap(), wedges: __vg.wedgeEdges(),
    density: (function () { var d = __vg.densityReport(); return { shown: d.shown, lit: d.lit, reach: d.reach, holeShare: d.holeShare, shownInner: d.shownInner, shownOuter: d.shownOuter, sp: d.sp }; })(),
    dim: __vg.state.dim
  };
})()`;

// the per-frame sampler, installed once; records while a cascade runs and a tail after it
const SAMPLER = `(function () {
  if (window.__p186) return "already";
  var P = window.__p186 = { samples: [], armed: false, tail: 0, done: false };
  // a handful of notes to watch individually: the first, middle and last of each band by id order
  var watch = (function () {
    var byBand = { i: [], o: [] };
    __vg.graph.forEachNode(function (id) { if (!__vg.isOrphan(id) && !__vg.isPinned(id)) byBand[__vg.isInner(id) ? "i" : "o"].push(id); });
    var out = [];
    ["i", "o"].forEach(function (k) { var l = byBand[k]; if (!l.length) return; [0, 0.25, 0.5, 0.75, 1].forEach(function (f) { out.push(l[Math.min(l.length - 1, Math.floor(f * (l.length - 1)))]); }); });
    return out;
  })();
  P.watch = watch;
  var lite = function () {
    var G = __vg.graph, gl = __vg.geomLock;
    var groups = {}, bands = { i: { lit: 0, rMin: Infinity, rMax: 0, alphaSum: 0 }, o: { lit: 0, rMin: Infinity, rMax: 0, alphaSum: 0 } };
    G.forEachNode(function (id, a) {
      var al = __vg.alpha[id] || 0;
      var g = __vg.groupOf(id);
      var gg = groups[g] || (groups[g] = { n: 0, alphaSum: 0, lit: 0, rMin: Infinity, rMax: 0, cells: 0, byBand: {} });
      gg.n++; gg.alphaSum += al; if (al > 0.004) gg.lit++;
      if (__vg.isOrphan(id) || __vg.isPinned(id)) return;
      var bk = __vg.isInner(id) ? "i" : "o";
      // github#186 -- per BAND, so a group with cells in both is judged wedge by wedge
      var gb = gg.byBand[bk] || (gg.byBand[bk] = { n: 0, alphaSum: 0, wsum: 0, lit: 0, rMin: Infinity, rMax: 0 });
      gb.n++; gb.alphaSum += al;
      // github#186 -- the arc follows WEIGHT, so the fill measure has to as well
      gb.wsum += al;
      if (al > 0.5) { var rb = Math.hypot(a.x, a.y); gb.lit++;
                      if (rb < gb.rMin) gb.rMin = rb; if (rb > gb.rMax) gb.rMax = rb; }
      var b = bands[bk];
      b.alphaSum += al;
      if (al > 0.5) { var r = Math.hypot(a.x, a.y); b.lit++; if (r < b.rMin) b.rMin = r; if (r > b.rMax) b.rMax = r;
                      if (r < gg.rMin) gg.rMin = r; if (r > gg.rMax) gg.rMax = r; }
    });
    ["i", "o"].forEach(function (k) { if (bands[k].rMin === Infinity) bands[k].rMin = 0; });
    Object.keys(groups).forEach(function (g) { if (groups[g].rMin === Infinity) groups[g].rMin = 0;
      Object.keys(groups[g].byBand).forEach(function (k) { if (groups[g].byBand[k].rMin === Infinity) groups[g].byBand[k].rMin = 0; }); });
    __vg.wedgeCells().forEach(function (c) { if (groups[c.g]) groups[c.g].cells++; });
    var d = __vg.densityReport();
    var pitch = { o: d.pitchPx && d.unitPx ? 160 * d.pitchPx / d.unitPx : 0, i: d.pitchPxInner && d.unitPx ? 160 * d.pitchPxInner / d.unitPx : 0 };
    var watched = {};
    watch.forEach(function (id) { var a = G.getNodeAttributes(id); watched[id] = { al: Math.round((__vg.alpha[id] || 0) * 1e4) / 1e4, r: Math.round(Math.hypot(a.x, a.y) * 10) / 10, th: Math.round(Math.atan2(a.y, a.x) * 1e4) / 1e4 }; });
    var lc = __vg.lastCascade();
    var w = __vg.demo.busyWhy();
    // github#186, decisions/0002 -- the eased tick, read on notes that are LIT: a fade is not a move
    var litStep = { i: 0, o: 0 }, litWho = { i: null, o: null };
    var seenR = {};
    G.forEachNode(function (id, a) {
      if ((__vg.alpha[id] || 0) < 0.5) return;
      if (__vg.isOrphan(id) || __vg.isPinned(id)) return;
      var r = Math.hypot(a.x, a.y);
      seenR[id] = r;
      var was = window.__p186 && __p186.prevR ? __p186.prevR[id] : undefined;
      if (was === undefined) return;
      var bk = __vg.isInner(id) ? "i" : "o";
      var dr = Math.abs(r - was);
      if (dr > litStep[bk]) { litStep[bk] = dr; litWho[bk] = id; }
    });
    if (window.__p186) __p186.prevR = seenR;
    return { t: performance.now(), epoch: Date.now() / 1000,
             litStep: litStep, litStepId: litWho,
             pr: lc && lc.last ? lc.last.pr : null, frame: lc && lc.last ? lc.last.frame : null,
             cascade: !!w.cascade, anim: !!w.anim, exit: lc ? lc.exit || null : null,
             seams: { i: { deg: __vg.seamDeg("i"), nB: __vg.seamNB("i") }, o: { deg: __vg.seamDeg("o"), nB: __vg.seamNB("o") } },
             pitch: pitch, liveMaxR: d.liveMaxR, watched: watched,
             groups: groups, bands: bands, wedges: __vg.wedgeEdges() };
  };
  (function loop() {
    if (P.done) return;
    var w = __vg.demo.busyWhy();
    if (P.armed) {
      if (w.cascade || w.anim) { P.samples.push(lite()); P.tail = 0; }
      else if (P.samples.length) { P.samples.push(lite()); P.tail++; if (P.tail >= 6) { P.done = true; return; } }
    }
    requestAnimationFrame(loop);
  })();
  return "installed";
})()`;

/* ------------------------------------------------------------------------- run */

let page = null;
const frames = [];
let filmDir = "";
try {
  for (let i = 0; i < 80 && !page; i++) { await sleep(400); try { page = await attach(PORT, "page.html"); } catch { } }
  if (!page) throw new Error("could not attach");
  page.j = async (e) => JSON.parse(await page.eval("JSON.stringify(" + e + ")"));
  // github#186 -- Chrome 153 headless reports reduce, and the page rightly snaps every cascade
  await page.send("Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }).catch(() => {});
  if (await page.eval(`matchMedia("(prefers-reduced-motion: reduce)").matches`).catch(() => false)) {
    throw new Error("this Chrome still reports prefers-reduced-motion: reduce -- every cascade would snap");
  }
  const ready = async () => {
    for (let i = 0; i < 120; i++) {
      if (await page.eval("!!(window.__vg && __vg.renderer && __vg.state.until === null)").catch(() => false)) return true;
      await sleep(250);
    }
    return false;
  };
  const settle = async (ms = 60000) => {
    const dl = Date.now() + ms;
    for (;;) {
      const busy = await page.eval("!!(window.__vg && __vg.demo && __vg.demo.busy())").catch(() => true);
      if (!busy) { await sleep(300); return true; }
      if (Date.now() > dl) return false;
      await sleep(100);
    }
  };
  const click = async (kind, argv0) => {
    const w = await page.j(`__vg.demo.where(${JSON.stringify(kind)}, ${JSON.stringify(argv0)})`);
    if (!w) throw new Error(`no target for ${kind} ${argv0}`);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: w.x, y: w.y, buttons: 0 });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 0 });
    return w;
  };

  if (!(await ready())) throw new Error("page never became ready");
  await settle();
  await sleep(800);
  console.log("page ready; timeScale " + await page.j("__vg.timeScale") + ", fitCap " + await page.j("__vg.fitCap") +
              ", wedge overlay " + await page.j(has("clean") ? "__vg.wedgeDebug(false)" : "__vg.wedgeDebug(true)"));
  await sleep(300);
  await settle();

  if (DIM) {
    await click("dim", DIM);
    await settle();
    await sleep(800);
    await page.eval("__vg.relayout(); void 0");
    await sleep(500);
    await settle();
    console.log("dimension now " + await page.j("__vg.state.dim"));
  }

  // --pre "kind:arg;kind:arg": acts to run and settle BEFORE the measured one, e.g. hide a group
  // so the measured act can show it again
  // github#186 -- "range:<fraction>" narrows the date range to the last <fraction> of the span
  const doAct = async (kind, target) => {
    if (kind !== "range") return click(kind, target);
    const frac = Number(target);
    const from = await page.j(`(function () { var lo = null, hi = null;
      __vg.graph.forEachNode(function (id, a) { var d = a.created ? String(a.created).slice(0, 10) : ""; if (Number.isNaN(Date.parse(d))) return; if (lo === null || d < lo) lo = d; if (hi === null || d > hi) hi = d; });
      var L = Date.parse(lo), H = Date.parse(hi); return new Date(H - (H - L) * ${frac}).toISOString().slice(0, 10); })()`);
    await page.eval(`__vg.setRange(${JSON.stringify(from)}, null); void 0`);
    return { x: 0, y: 0, label: "range from " + from };
  };
  for (const a of (arg("pre", "") ? arg("pre", "").split(";") : [])) {
    const [kind, ...rest] = a.split(":");
    const w = await doAct(kind, rest.join(":"));
    console.log(`pre: ${kind} ${JSON.stringify(rest.join(":"))} (${w.label})`);
    await sleep(300);
    await settle();
    await sleep(500);
  }

  // where the disc is on screen, for the crop
  const geom = await page.j(`(function () {
    var R = __vg.renderer, gb = document.getElementById("vg-graph").getBoundingClientRect();
    var o = R.graphToViewport({ x: 0, y: 0 }), e = R.graphToViewport({ x: __vg.geomLock.maxR * 160, y: 0 });
    return { cx: gb.left + o.x, cy: gb.top + o.y, rpx: Math.hypot(e.x - o.x, e.y - o.y), stage: { l: gb.left, t: gb.top, w: gb.width, h: gb.height } };
  })()`);
  console.log("disc centre " + Math.round(geom.cx) + "," + Math.round(geom.cy) + " radius " + Math.round(geom.rpx) + "px on a " +
              Math.round(geom.stage.w) + "x" + Math.round(geom.stage.h) + " stage");

  const restA = await page.j(MEASURE);
  await page.eval(SAMPLER);
  await page.eval("__vg.probe(true); void 0");

  if (FILM) {
    filmDir = mkdtempSync(join(tmpdir(), "vg-186-film-"));
    page.on((msg) => {
      if (msg.method !== "Page.screencastFrame") return;
      page.send("Page.screencastFrameAck", { sessionId: msg.params.sessionId }).catch(() => {});
      const file = join(filmDir, String(frames.length).padStart(5, "0") + "." + FILM_FMT);
      writeFileSync(file, Buffer.from(msg.params.data, "base64"));
      frames.push({ file, t: msg.params.metadata.timestamp });
    });
    await page.send("Page.enable");
    await page.send("Page.startScreencast", Object.assign(
      { format: FILM_FMT, everyNthFrame: 1, maxWidth: W * DSF, maxHeight: H * DSF },
      FILM_FMT === "jpeg" ? { quality: FILM_Q } : {}));
    await sleep(700);
  }

  let actWhere = null;
  const acts = ACT ? ACT.split(";") : [];
  const t0 = Date.now();
  for (const a of acts) {
    const [kind, ...rest] = a.split(":");
    const target = rest.join(":");
    await page.eval("window.__p186.armed = true; void 0");
    actWhere = await doAct(kind, target);
    console.log(`act ${kind} ${JSON.stringify(target)} at ${actWhere.x},${actWhere.y} (${actWhere.label})`);
    await sleep(300);
    await settle();
    for (let k = 0; k < 100; k++) { if (await page.j("!!(window.__p186 && window.__p186.done)")) break; await sleep(60); }
  }
  const actMs = Date.now() - t0;
  if (FILM) { await sleep(600); await page.send("Page.stopScreencast").catch(() => {}); await sleep(300); }

  const samples = await page.j("window.__p186.samples");
  const probeReport = await page.j(`(function () { var r = __vg.probeReport(); if (typeof r === "string") return r;
    delete r.samples; delete r.first; delete r.last; delete r.watchSeries; return r; })()`);
  await page.eval("__vg.probe(false); void 0");
  const lastCascade = await page.j("(function () { var c = __vg.lastCascade(); return { frames: c.frames, ms: c.ms, span: c.span, ins: c.ins, outs: c.outs, exit: c.exit || null, path: c.path }; })()");
  const restB = await page.j(MEASURE);
  await page.eval("__vg.relayout(); void 0");
  await sleep(400);
  await settle();
  const restFresh = await page.j(MEASURE);
  const errors = page.errors;

  const out = { label: LABEL, act: ACT, dim: DIM, slow: SLOW, dsf: DSF, actMs, geom, lastCascade, probeReport,
                restA, restB, restFresh, samples, frames: frames.map((f) => ({ file: f.file, t: f.t })), errors };
  writeFileSync(join(OUT, "probe.json"), JSON.stringify(out));
  console.log(`\n${samples.length} frames sampled over ${actMs} ms; cascade said ${lastCascade.frames} frames / ${lastCascade.ms} ms, exit ${lastCascade.exit}`);
  console.log("wrote " + join(OUT, "probe.json") + (frames.length ? ` and ${frames.length} screencast frames in ${filmDir}` : ""));
  if (errors.length) console.log("PAGE ERRORS: " + errors.map((e) => e.text).join(" | "));
  writeFileSync(join(OUT, "filmdir.txt"), filmDir);
} finally {
  try { if (page) await page.send("Browser.close"); } catch { }
  try { chrome.kill(); } catch { }
  if (lockHeld) {
    await sleep(300);
    spawnSync(process.execPath, [join(REPO, "scripts", "lock.mjs"), "release", LOCK, "--owner", OWNER], { stdio: "ignore" });
  }
}
