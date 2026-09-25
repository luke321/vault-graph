#!/usr/bin/env node
// github#58

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { attach } from "./cdp.mjs";
import { leftWindowPos } from "./screen.mjs";
import { keepFocus } from "./focus.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PORT = 9334;

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const argAll = (n) => argv.flatMap((a, i) => (a === "--" + n ? [argv[i + 1]] : []));
const flag = (n) => argv.includes("--" + n);

const RATIOS = String(arg("ratios", "1.08,0.35,4.2")).split(",").map(Number);
const THRESHOLD = Number(arg("threshold", "8"));
const MODE = arg("mode", "all");
const HEADED = flag("headed");
const QUERY = arg("query", "");
const AGAINST_DIR = arg("against-dir", "");
const NOW_DIR = arg("now-dir", "");
const THEME = arg("theme", "dark");
const DPR = Number(arg("dpr", "1"));
const WINDOW = String(arg("window", "1600x1000")).split("x").map(Number);
const OUT_JSON = arg("out", "");
const LABEL = arg("label", "");
const SETTLE_MS = Number(arg("settle-ms", "1500"));
const DUMP_DIR = arg("dump", "");
const ALL_STATES = ["rest", "search", "hidden", "solo", "range", "hover", "click", "cascade"];
const STATES = (() => {
  const given = argAll("state");
  if (given.includes("all")) return ALL_STATES;
  if (given.length) return given;
  return [QUERY ? "search" : "rest"];
})();
const PIXEL_BAR = 0.0005;
const INK_BAR = 0.01;
const CAMERA_BAR = 1e-6;

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

function fixtureVaults() {
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const store = join(dirname(resolve(ROOT, common)), ".fixtures");
  if (!existsSync(store)) return [];
  return readdirSync(store).map((d) => join(store, d))
    .filter((d) => statSync(d).isDirectory() && existsSync(join(d, ".obsidian")));
}

function pageIn(dir, vault) {
  const want = basename(vault);
  const hit = readdirSync(dir).find((f) => f.startsWith(want) && f.endsWith(".html"));
  return hit ? join(dir, hit) : null;
}

function referenceFor(vault, i) {
  const given = argAll("against")[i];
  if (given) return given;
  if (!AGAINST_DIR) return null;
  return pageIn(AGAINST_DIR, vault);
}

function currentFor(vault, i) {
  const given = argAll("now")[i];
  if (given) return given;
  if (!NOW_DIR) return null;
  return pageIn(NOW_DIR, vault);
}

function build(vault, out) {
  const r = spawnSync(process.execPath, [join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("build-graph failed for " + vault + ":\n" + r.stdout + "\n" + r.stderr);
}

const toUrl = (p) => "file:///" + resolve(p).replace(/\\/g, "/") + "?rest";

async function waitReady(p, label) {
  const deadline = Date.now() + 30000;
  for (;;) {
    const err = p.firstError();
    if (err) throw new Error(label + ": page error -- " + err);
    const ready = await p.eval(
      "(function () {" +
      "  var v = window.__vg; if (!v || !v.renderer || !v.graph) return false;" +
      "  if (v.demo && typeof v.demo.busy === 'function' && v.demo.busy()) return false;" +
      "  return true;" +
      "})()").catch(() => false);
    if (ready) return;
    if (Date.now() > deadline) throw new Error(label + ": page never became ready");
    await sleep(150);
  }
}

async function settle(p, ms = 20000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const busy = await p.eval("!!(__vg.demo && __vg.demo.busy())").catch(() => true);
    if (!busy) return true;
    if (Date.now() > deadline) return false;
    await sleep(100);
  }
}

async function snapRest(p) {
  await settle(p);
  await sleep(SETTLE_MS);
  await p.eval("__vg.syncAlpha(); __vg.applyLayout(false); void 0");
  await twoFrames(p);
  await sleep(300);
  await camSettle(p);
}

async function camSettle(p, ms = 4000) {
  const deadline = Date.now() + ms;
  let prev = null, same = 0;
  for (;;) {
    const c = await p.eval("(function(){ var c = __vg.renderer.getCamera().getState(); return [c.x, c.y, c.ratio].join('|'); })()");
    if (c === prev) { if (++same >= 2) return; } else { same = 0; }
    prev = c;
    if (Date.now() > deadline) return;
    await sleep(120);
  }
}

async function twoFrames(p) {
  await p.eval(
    "new Promise(function (r) {" +
    "  var done = false, fin = function () { if (!done) { done = true; r(true); } };" +
    "  requestAnimationFrame(function () { requestAnimationFrame(fin); });" +
    "  setTimeout(fin, 700);" +
    "})");
}

async function placeCamera(p, ratio) {
  await p.eval("__vg.renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: " + ratio + ", angle: 0 }); " +
               "__vg.renderer.refresh(); void 0");
  await twoFrames(p);
}

async function applyTheme(p) {
  if (THEME === "dark") return;
  await p.eval(
    "(function () {" +
    "  var root = document.querySelector('.vault-graph'); root.setAttribute('data-theme', " + JSON.stringify(THEME) + ");" +
    "  if (__vg.readTheme) __vg.readTheme();" +
    "  __vg.renderer.refresh();" +
    "  if (__vg.placeLogo) __vg.placeLogo();" +
    "  if (__vg.heatBuild) __vg.heatBuild();" +
    "})(); void 0");
  await twoFrames(p);
}

const BIGGEST = "(function(){ var best = null, bn = -1; __vg.groupOrder().forEach(function (g) {" +
                " var n = __vg.groupCount(g); if (n > bn) { bn = n; best = g; } }); return best; })()";
const SMALLEST2 = "(function(){ var best = null, bn = 1e9; __vg.groupOrder().forEach(function (g) {" +
                  " var n = __vg.groupCount(g); if (n >= 2 && n < bn) { bn = n; best = g; } }); return best; })()";
const TOP_NOTE = "(function(){ var best = null, bd = -1; __vg.graph.forEachNode(function (id) {" +
                 " if ((__vg.alpha[id] || 0) < 0.999) return; var d = __vg.graph.degree(id);" +
                 " if (d > bd || (d === bd && id < best)) { bd = d; best = id; } }); return best; })()";

async function clickEye(p, group) {
  await p.eval("(function(){ var els = document.querySelectorAll('[data-eye]');" +
               " for (var i = 0; i < els.length; i++) if (els[i].getAttribute('data-eye') === " + JSON.stringify(group) + ") { els[i].click(); return; } })(); void 0");
}

async function noteAt(p, id) {
  return p.eval("(function(){ var a = __vg.graph.getNodeAttributes(" + JSON.stringify(id) + ");" +
                " var o = document.getElementById('vg-graph').getBoundingClientRect();" +
                " var v = __vg.renderer.graphToViewport({ x: a.x, y: a.y });" +
                " return { x: v.x + o.left, y: v.y + o.top }; })()");
}

async function mouse(p, type, x, y, extra = {}) {
  await p.send("Input.dispatchMouseEvent", { type, x, y, ...extra });
}

async function hoverNote(p, id) {
  const at = await noteAt(p, id);
  await mouse(p, "mouseMoved", at.x, at.y, { buttons: 0 });
  const deadline = Date.now() + 4000;
  let s = null;
  for (;;) {
    s = await p.eval("({ t: __vg.hoverT, hovered: __vg.state.hovered, busy: !!__vg.hoverBusy })");
    if (s.hovered === id && s.t >= 1 && !s.busy) break;
    if (Date.now() > deadline) break;
    await sleep(60);
  }
  await twoFrames(p);
  return { hit: s.hovered === id, t: s.t, hovered: s.hovered };
}

async function unhover(p) {
  await mouse(p, "mouseMoved", 5, 5, { buttons: 0 });
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const s = await p.eval("({ t: __vg.hoverT, hovered: __vg.state.hovered })");
    if (!s.hovered && s.t === 0) break;
    await sleep(60);
  }
}

async function enterState(p, state) {
  if (state === "rest") return {};
  if (state === "search") {
    const q = (QUERY || "note").toLowerCase();
    await p.eval("(function(){ var q = document.getElementById('vg-q'); q.value = " + JSON.stringify(q) + ";" +
                 " if (q.oninput) q.oninput(); else q.dispatchEvent(new Event('input', { bubbles: true })); })(); void 0");
    await settle(p);
    await twoFrames(p);
    const hits = await p.eval("document.querySelectorAll('#vg-hits *').length");
    return { query: q, hitRows: hits };
  }
  if (state === "hidden") {
    const g = await p.eval(BIGGEST);
    await clickEye(p, g);
    await snapRest(p);
    return { group: g };
  }
  if (state === "solo") {
    const g = await p.eval(SMALLEST2);
    if (!g) return { skipped: "no group with two or more notes" };
    const w = await p.eval("__vg.demo.where('only', " + JSON.stringify(g) + ")");
    if (!w) return { skipped: "no only chip for " + g };
    await mouse(p, "mouseMoved", w.x, w.y, { buttons: 0 });
    await mouse(p, "mousePressed", w.x, w.y, { button: "left", clickCount: 1, buttons: 1 });
    await mouse(p, "mouseReleased", w.x, w.y, { button: "left", clickCount: 1, buttons: 0 });
    await mouse(p, "mouseMoved", 5, 5, { buttons: 0 });
    await snapRest(p);
    return { group: g };
  }
  if (state === "range") {
    const span = await p.eval("(function(){ var lo = null, hi = null; (window.VAULT_DATA.nodes || []).forEach(function (n) {" +
                              " if (!n.created) return; var t = Date.parse(n.created + 'T00:00:00Z'); if (isNaN(t)) return;" +
                              " if (lo === null || t < lo) lo = t; if (hi === null || t > hi) hi = t; }); return lo === null ? null : { lo: lo, hi: hi }; })()");
    if (!span) return { skipped: "no dated notes" };
    const from = Math.round(span.lo + (span.hi - span.lo) * 0.3), to = Math.round(span.lo + (span.hi - span.lo) * 0.7);
    const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
    await p.eval("__vg.setRange(" + JSON.stringify(iso(from)) + ", " + JSON.stringify(iso(to)) + "); void 0");
    await snapRest(p);
    return { from: iso(from), to: iso(to) };
  }
  if (state === "hover") {
    const id = await p.eval(TOP_NOTE);
    return { note: id, perRatio: true };
  }
  if (state === "click") {
    const id = await p.eval(TOP_NOTE);
    const at = await noteAt(p, id);
    await mouse(p, "mouseMoved", at.x, at.y, { buttons: 0 });
    await sleep(120);
    await mouse(p, "mousePressed", at.x, at.y, { button: "left", clickCount: 1, buttons: 1 });
    await mouse(p, "mouseReleased", at.x, at.y, { button: "left", clickCount: 1, buttons: 0 });
    await settle(p);
    await unhover(p);
    const sel = await p.eval("({ selected: __vg.state.selected, card: !document.getElementById('vg-detail').hidden })");
    return { note: id, selected: sel.selected, cardOpen: sel.card, hit: sel.selected === id };
  }
  if (state === "cascade") {
    const g = await p.eval(BIGGEST);
    await p.eval("__vg.probe(true); void 0");
    await clickEye(p, g);
    await settle(p, 60000);
    await camSettle(p);
    await sleep(SETTLE_MS);
    await twoFrames(p);
    const report = await p.eval("(function(){ var r = __vg.probeReport(); __vg.probe(false); return typeof r === 'string' ? { note: r } : r; })()");
    const cam = await p.eval("(function(){ var c = __vg.renderer.getCamera().getState(); return { x: c.x, y: c.y, ratio: c.ratio }; })()");
    return { group: g, report, cam };
  }
  throw new Error("unknown state " + state);
}

async function cameraSample(p) {
  return p.eval(
    "(function () {" +
    "  var R = __vg.renderer, G = __vg.graph;" +
    "  R.render();" +
    "  var out = [], pos = [], ids = [];" +
    "  G.forEachNode(function (id) {" +
    "    var a = G.getNodeAttributes(id), v = R.graphToViewport(a), d = R.getNodeDisplayData(id);" +
    "    out.push(v.x, v.y, R.scaleSize(d ? d.size : 1));" +
    "    pos.push(a.x, a.y, a.size, d && !d.hidden ? 1 : 0);" +
    "    ids.push(id);" +
    "  });" +
    "  var inv = R.viewportToGraph({ x: 100.5, y: 200.25 });" +
    "  return { xyz: out, pos: pos, ids: ids, inv: [inv.x, inv.y], dims: R.getDimensions(), ratio: R.getCamera().getState().ratio };" +
    "})()");
}

async function labelSample(p) {
  return p.eval(
    "(function () {" +
    "  var R = __vg.renderer, G = __vg.graph, out = [];" +
    "  R.render();" +
    "  G.forEachNode(function (id) {" +
    "    var d = R.getNodeDisplayData(id);" +
    "    if (d && !d.hidden && d.label && (d.forceLabel || d.highlighted)) out.push(id + '\\u0001' + d.label + '\\u0001' + (d.color || ''));" +
    "  });" +
    "  out.sort();" +
    "  var lc = typeof R.getSetting === 'function' ? R.getSetting('labelColor') : null;" +
    "  if (lc && typeof lc === 'object') lc = lc.color || JSON.stringify(lc);" +
    "  return { labels: out, labelColor: lc," +
    "           tip: (function () { var t = document.getElementById('vg-tip'); return t && !t.hidden ? (t.textContent || '').slice(0, 80) : ''; })() };" +
    "})()");
}

async function pixelSample(p) {
  const meta = await p.eval(
    "(function () {" +
    "  var R = __vg.renderer;" +
    "  R.render();" +
    "  var cv = R.getCanvases();" +
    "  var W = cv.nodes.width, H = cv.nodes.height;" +
    "  var off = document.createElement('canvas'); off.width = W; off.height = H;" +
    "  var ctx = off.getContext('2d');" +
    "  var root = document.querySelector('.vault-graph');" +
    "  ctx.fillStyle = (getComputedStyle(root).getPropertyValue('--surface-1') || '#000').trim();" +
    "  ctx.fillRect(0, 0, W, H);" +
    "  ['edges', 'nodes', 'edgeLabels', 'labels', 'hovers', 'hoverNodes'].forEach(function (k) { if (cv[k]) ctx.drawImage(cv[k], 0, 0); });" +
    "  var d = ctx.getImageData(0, 0, W, H).data;" +
    "  var parts = [], CH = 8192;" +
    "  for (var i = 0; i < d.length; i += CH) parts.push(String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length))));" +
    "  window.__rdPix = btoa(parts.join(''));" +
    "  var ink = typeof __vg.edgeInk === 'function' ? __vg.edgeInk() : null;" +
    "  return { w: W, h: H, len: window.__rdPix.length, ink: ink && typeof ink === 'object' ? ink.ink : null };" +
    "})()");
  const CHUNK = 2000000;
  const chunks = [];
  for (let i = 0; i < meta.len; i += CHUNK) chunks.push(await p.eval("window.__rdPix.slice(" + i + ", " + (i + CHUNK) + ")"));
  await p.eval("delete window.__rdPix; void 0");
  return { w: meta.w, h: meta.h, ink: meta.ink, data: Buffer.from(chunks.join(""), "base64") };
}

function compareCamera(a, b) {
  if (a.xyz.length !== b.xyz.length) return { ok: false, detail: "node counts differ: " + a.xyz.length / 3 + " vs " + b.xyz.length / 3 };
  let maxD = 0, over = 0;
  for (let i = 0; i < a.xyz.length; i += 3) {
    const d = Math.max(Math.abs(a.xyz[i] - b.xyz[i]), Math.abs(a.xyz[i + 1] - b.xyz[i + 1]), Math.abs(a.xyz[i + 2] - b.xyz[i + 2]));
    if (d > maxD) maxD = d;
    if (d > CAMERA_BAR) over++;
  }
  const invD = Math.max(Math.abs(a.inv[0] - b.inv[0]), Math.abs(a.inv[1] - b.inv[1]));
  const ok = maxD <= CAMERA_BAR && invD <= 1e-6 * Math.max(1, Math.abs(a.inv[0]), Math.abs(a.inv[1]));
  return {
    ok, maxD, over,
    detail: a.xyz.length / 3 + " nodes, max |d| " + maxD.toExponential(2) + " px (" + over + " over " + CAMERA_BAR + "), " +
            "viewportToGraph |d| " + invD.toExponential(2) + ", stage " + a.dims.width + "x" + a.dims.height,
  };
}

function comparePositions(a, b) {
  if (a.ids.length !== b.ids.length) return { ok: false, detail: "node counts differ: " + a.ids.length + " vs " + b.ids.length };
  const idx = new Map();
  b.ids.forEach((id, i) => idx.set(id, i));
  let maxD = 0, maxSize = 0, moved = 0, shownA = 0, shownB = 0, shownDiff = 0, missing = 0, worst = null;
  for (let i = 0; i < a.ids.length; i++) {
    const j = idx.get(a.ids[i]);
    if (j === undefined) { missing++; continue; }
    const d = Math.max(Math.abs(a.pos[i * 4] - b.pos[j * 4]), Math.abs(a.pos[i * 4 + 1] - b.pos[j * 4 + 1]));
    const ds = Math.abs(a.pos[i * 4 + 2] - b.pos[j * 4 + 2]);
    if (d > maxD) { maxD = d; worst = a.ids[i]; }
    if (ds > maxSize) maxSize = ds;
    if (d > 1e-6) moved++;
    shownA += a.pos[i * 4 + 3]; shownB += b.pos[j * 4 + 3];
    if (a.pos[i * 4 + 3] !== b.pos[j * 4 + 3]) shownDiff++;
  }
  const ok = missing === 0 && maxD <= 1e-6 && maxSize <= 1e-6 && shownDiff === 0;
  return {
    ok, maxD, maxSize, moved, shownDiff,
    detail: a.ids.length + " notes, " + moved + " moved (max " + maxD.toExponential(2) + " units" + (worst && moved ? ", worst " + worst : "") +
            "), size max |d| " + maxSize.toExponential(2) + ", shown " + shownA + " vs " + shownB + " (" + shownDiff + " differ)" +
            (missing ? ", " + missing + " ids missing" : ""),
  };
}

function compareLabels(a, b) {
  const A = new Set(a.labels), B = new Set(b.labels);
  const onlyA = a.labels.filter((x) => !B.has(x)), onlyB = b.labels.filter((x) => !A.has(x));
  const idOf = (s) => s.split("\u0001")[0];
  const idsA = new Set(a.labels.map(idOf)), idsB = new Set(b.labels.map(idOf));
  const idOnlyA = [...idsA].filter((x) => !idsB.has(x)).length, idOnlyB = [...idsB].filter((x) => !idsA.has(x)).length;
  const colourOnly = onlyA.length + onlyB.length > 0 && idOnlyA === 0 && idOnlyB === 0;
  const ok = onlyA.length === 0 && onlyB.length === 0 && a.labelColor === b.labelColor && a.tip === b.tip;
  return {
    ok, refCount: a.labels.length, nowCount: b.labels.length, idOnlyRef: idOnlyA, idOnlyNow: idOnlyB, colourOnly,
    detail: "labels drawn " + a.labels.length + " vs " + b.labels.length + " (ids only in ref " + idOnlyA + ", only in now " + idOnlyB +
            (colourOnly ? "; same ids, " + Math.max(onlyA.length, onlyB.length) + " differ in colour" : "") +
            "); labelColor " + a.labelColor + " vs " + b.labelColor + (a.tip !== b.tip ? "; tip differs: " + JSON.stringify(a.tip) + " vs " + JSON.stringify(b.tip) : "; tip same"),
  };
}

function comparePixels(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { ok: false, detail: "stage sizes differ: " + a.w + "x" + a.h + " vs " + b.w + "x" + b.h };
  const n = a.w * a.h;
  let over = 0, any = 0, maxD = 0;
  let x0 = a.w, y0 = a.h, x1 = -1, y1 = -1;
  const hist = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]),
                       Math.abs(a.data[o + 2] - b.data[o + 2]), Math.abs(a.data[o + 3] - b.data[o + 3]));
    if (d === 0) { hist[0]++; continue; }
    any++;
    if (d > maxD) maxD = d;
    if (d <= 8) hist[1]++; else if (d <= 32) hist[2]++; else hist[3]++;
    if (d > THRESHOLD) {
      over++;
      const x = i % a.w, y = (i - x) / a.w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const share = over / n;
  const inkOk = a.ink === null || b.ink === null || a.ink === 0 ? true : Math.abs(a.ink - b.ink) / a.ink <= INK_BAR;
  const ok = share <= PIXEL_BAR && inkOk;
  const pct = (v) => (100 * v).toFixed(4) + "%";
  return {
    ok, over, any, maxD, share, inkRef: a.ink, inkNow: b.ink,
    detail: a.w + "x" + a.h + ": " + over + " px over " + THRESHOLD + "/255 (" + pct(share) + ", bar " + pct(PIXEL_BAR) + "); " +
            "any diff " + any + " (" + pct(any / n) + "), max " + maxD + "; hist 1-8:" + hist[1] + " 9-32:" + hist[2] + " 33+:" + hist[3] +
            (over ? "; box x " + x0 + ".." + x1 + " y " + y0 + ".." + y1 : "") +
            "; edgeInk ref " + a.ink + " now " + b.ink + (inkOk ? "" : " (over 1%)"),
  };
}

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, w = 0, h = 0, colorType = 0, bitDepth = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error("unexpected PNG layout: depth " + bitDepth + " type " + colorType + " interlace " + interlace);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * bpp;
      out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { w, h, data: out };
}

const shotTag = { side: "", vault: "", state: "", ratio: "" };
const SHOT_REGIONS = [["stage", "#vg-stage"], ["page", "#vg-app"], ["canvas", "#vg-graph"], ["heatmap", "#vg-heatwrap"], ["ribbon", "#vg-ribbon"], ["legend", "#vg-legend"]];

async function screenshotSample(p) {
  await p.send("Page.enable").catch(() => {});
  const shots = {};
  for (const [name, sel] of SHOT_REGIONS) {
    const r = await p.eval("(function () { var el = document.querySelector(" + JSON.stringify(sel) + "); if (!el) return null; var r = el.getBoundingClientRect(); " +
                           "return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()");
    if (!r || !r.w || !r.h) continue;
    await p.eval("__vg.renderer.render(); void 0");
    const shot = await p.send("Page.captureScreenshot", { format: "png", clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    shots[name] = shot.data;
    if (DUMP_DIR) {
      mkdirSync(DUMP_DIR, { recursive: true });
      writeFileSync(join(DUMP_DIR, [shotTag.side, shotTag.vault, shotTag.state, shotTag.ratio, name].join("__") + ".png"), Buffer.from(shot.data, "base64"));
    }
  }
  return shots;
}

function compareShots(a, b) {
  const parts = [];
  let ok = true;
  const nums = {};
  for (const [name] of SHOT_REGIONS) {
    if (!(name in a) || !(name in b)) continue;
    if (a[name] === b[name]) { parts.push(name + ": identical"); nums[name] = 0; continue; }
    const A = decodePng(Buffer.from(a[name], "base64")), B = decodePng(Buffer.from(b[name], "base64"));
    if (A.w !== B.w || A.h !== B.h) { ok = false; parts.push(name + ": sizes differ " + A.w + "x" + A.h + " vs " + B.w + "x" + B.h); nums[name] = -1; continue; }
    const r = comparePixels({ w: A.w, h: A.h, ink: null, data: A.data }, { w: B.w, h: B.h, ink: null, data: B.data });
    if (!r.ok && (name === "stage" || name === "page")) ok = false;
    nums[name] = r.over;
    parts.push(name + ": " + r.over + " px over " + THRESHOLD + " of " + A.w + "x" + A.h + (r.over ? " (max " + r.maxD + ", box x " + r.detail.replace(/^.*box x /, "").replace(/;.*$/, "") + ")" : ""));
  }
  return { ok, regions: nums, stageOver: nums.stage, pageOver: nums.page, detail: parts.join(" | ") };
}

const want = (k) => MODE === "all" || MODE === k;

async function sampleAt(p) {
  const s = {};
  if (want("camera")) s.camera = await cameraSample(p);
  if (want("labels") || want("positions")) s.labels = await labelSample(p);
  if (want("pixels")) s.pixels = await pixelSample(p);
  if (want("screenshot")) s.shots = await screenshotSample(p);
  return s;
}

async function sampleBuild(p, url, label) {
  const out = new Map();
  for (const state of STATES) {
    await p.send("Page.enable").catch(() => {});
    await p.send("Page.navigate", { url });
    const nav = Date.now() + 15000;
    for (;;) {
      const here = await p.eval("location.href").catch(() => "");
      if (String(here).includes(basename(url.split("?")[0])) && await p.eval("!!window.__vg").catch(() => false)) break;
      if (Date.now() > nav) throw new Error(label + ": the tab never reached " + url);
      await sleep(150);
    }
    await sleep(200);
    await waitReady(p, label);
    await applyTheme(p);
    await placeCamera(p, RATIOS[0]);
    await settle(p);
    const info = await enterState(p, state);
    const per = new Map();
    shotTag.side = label.split(" ")[0]; shotTag.state = state; shotTag.ratio = "landed";
    if (state === "cascade") {
      per.set("landed", await sampleAt(p));
    } else if (!info.skipped) {
      for (const ratio of RATIOS) {
        shotTag.ratio = String(ratio);
        await placeCamera(p, ratio);
        let extra = {};
        if (info.perRatio) extra = await hoverNote(p, info.note);
        const s = await sampleAt(p);
        s.extra = extra;
        per.set(ratio, s);
        if (info.perRatio) await unhover(p);
      }
    }
    out.set(state, { info, per, errors: p.firstError() });
  }
  return out;
}

function compareState(state, ref, now) {
  const results = [];
  const push = (ratio, kind, r, more = {}) => results.push({ ...r, state, ratio, kind, ...more });
  if (ref.info.skipped || now.info.skipped) {
    push("-", "state", { ok: !!ref.info.skipped === !!now.info.skipped, detail: "skipped: ref " + (ref.info.skipped || "no") + ", now " + (now.info.skipped || "no") });
    return results;
  }
  const infoRef = JSON.stringify({ ...ref.info, report: undefined, cam: undefined }), infoNow = JSON.stringify({ ...now.info, report: undefined, cam: undefined });
  if (infoRef !== infoNow) push("-", "state", { ok: false, detail: "state differs: ref " + infoRef + " now " + infoNow });
  else if (state !== "rest") push("-", "state", { ok: true, detail: "same target: " + infoRef });
  if (state === "cascade") {
    const a = ref.info.report || {}, b = now.info.report || {};
    const keys = ["frames", "spanMs", "innerMaxStep", "outerMaxStep", "startMaxStep", "ngMaxStep"];
    const line = keys.map((k) => k + " " + JSON.stringify(a[k]) + "/" + JSON.stringify(b[k])).join(", ") +
                 ", radMaxStep " + (a.radMaxStep && a.radMaxStep.step) + "/" + (b.radMaxStep && b.radMaxStep.step) +
                 ", tanMaxStep " + (a.tanMaxStep && a.tanMaxStep.step !== undefined ? a.tanMaxStep.step : JSON.stringify(a.tanMaxStep)) + "/" +
                 (b.tanMaxStep && b.tanMaxStep.step !== undefined ? b.tanMaxStep.step : JSON.stringify(b.tanMaxStep));
    const camD = ref.info.cam && now.info.cam ? Math.max(Math.abs(ref.info.cam.x - now.info.cam.x), Math.abs(ref.info.cam.y - now.info.cam.y), Math.abs(ref.info.cam.ratio - now.info.cam.ratio)) : null;
    const near = (x, y, tol) => (x === y) || (typeof x === "number" && typeof y === "number" && Math.abs(x - y) <= tol * Math.max(Math.abs(x), Math.abs(y), 1));
    const probeOk = near(a.innerMaxStep, b.innerMaxStep, 0.15) && near(a.outerMaxStep, b.outerMaxStep, 0.15) && near(a.frames, b.frames, 0.15);
    push("landed", "probe", { ok: probeOk, detail: "ref/now: " + line + "; landed camera |d| " + (camD === null ? "n/a" : camD.toExponential(2)) }, { report: { ref: a, now: b } });
  }
  for (const [ratio, r] of ref.per) {
    const n = now.per.get(ratio);
    if (!n) { push(ratio, "sample", { ok: false, detail: "no sample in the current build" }); continue; }
    if (r.extra && n.extra && (r.extra.hit !== undefined)) {
      push(ratio, "hover", { ok: r.extra.hit === n.extra.hit && r.extra.hovered === n.extra.hovered, detail: "aimed-hit ref " + r.extra.hit + " now " + n.extra.hit + " (hovered " + r.extra.hovered + " / " + n.extra.hovered + ")" });
    }
    if (r.camera && want("positions")) push(ratio, "positions", comparePositions(r.camera, n.camera));
    if (r.camera && want("camera")) push(ratio, "camera", compareCamera(r.camera, n.camera));
    if (r.labels && want("labels")) push(ratio, "labels", compareLabels(r.labels, n.labels));
    if (r.pixels) push(ratio, "pixels", comparePixels(r.pixels, n.pixels));
    if (r.shots) push(ratio, "shots", compareShots(r.shots, n.shots));
  }
  const errs = [ref.errors, now.errors].filter(Boolean);
  if (errs.length) push("-", "errors", { ok: false, detail: errs.join(" | ") });
  return results;
}

async function runVault(vault, reference, current, chrome) {
  const dir = mkdtempSync(join(tmpdir(), "vg-render-diff-"));
  let nowHtml = current;
  if (!nowHtml) { nowHtml = join(dir, "now.html"); build(vault, nowHtml); }
  const profile = mkdtempSync(join(tmpdir(), "vg-render-diff-profile-"));
  // github#129
  const focus = await keepFocus();
  const proc = spawn(chrome, [
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
    "--disable-component-update", "--no-service-autorun", "--metrics-recording-only", "--no-pings", "--mute-audio",
    "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
    "--force-device-scale-factor=" + DPR,
    ...(HEADED ? [] : [leftWindowPos(WINDOW[0], WINDOW[1])]), "--window-size=" + WINDOW[0] + "," + WINDOW[1],
    "--app=data:text/html,render-diff",
  ], { stdio: "ignore" });
  void focus.watch(proc.pid);
  const results = [];
  shotTag.vault = basename(vault).replace(/-[0-9a-f]{8}$/, "");
  try {
    let page = null;
    const deadline = Date.now() + 25000;
    for (;;) {
      try { page = await attach(PORT, "data:text/html"); break; }
      catch (e) { if (Date.now() > deadline) throw e; await sleep(400); }
    }
    const ref = await sampleBuild(page, toUrl(reference), "reference build");
    const now = await sampleBuild(page, toUrl(nowHtml), "current build");
    for (const state of STATES) results.push(...compareState(state, ref.get(state), now.get(state)));
    page.close();
  } finally {
    try { proc.kill(); } catch { }
    await sleep(300);
    try { rmSync(dir, { recursive: true, force: true }); } catch { }
    try { rmSync(profile, { recursive: true, force: true }); } catch { }
  }
  return results;
}

const vaults = argAll("vault").length ? argAll("vault") : fixtureVaults();
if (!vaults.length) {
  console.error("render-diff: no vaults -- pass --vault <dir> or generate the fixture store with smoke.mjs");
  process.exit(2);
}
const chrome = findChrome();
let failed = 0;
const report = [];
console.log("render-diff: states " + STATES.join(",") + "; ratios " + RATIOS.join(",") + "; theme " + THEME + "; dpr " + DPR + "; window " + WINDOW.join("x") + (LABEL ? "; " + LABEL : ""));
for (const [i, vault] of vaults.entries()) {
  console.log("== " + basename(vault));
  const reference = referenceFor(vault, i);
  if (!reference || !existsSync(reference)) {
    console.log("  FAIL no reference build -- pass --against <ref.html> or --against-dir <dir> holding " + basename(vault) + "*.html");
    failed++;
    continue;
  }
  const current = currentFor(vault, i);
  const results = await runVault(vault, reference, current, chrome);
  for (const r of results) {
    console.log("  " + (r.ok ? "ok  " : "FAIL") + " " + String(r.state).padEnd(7) + " ratio " + String(r.ratio).padEnd(6) + " " + String(r.kind).padEnd(9) + " " + r.detail);
    if (!r.ok) failed++;
    report.push({ vault: basename(vault), theme: THEME, dpr: DPR, window: WINDOW.join("x"), label: LABEL, ...r });
  }
}
if (OUT_JSON) writeFileSync(OUT_JSON, JSON.stringify(report, null, 1) + "\n");
console.log(failed ? "render-diff: " + failed + " comparison(s) over the bar" : "render-diff: every comparison within the bar");
process.exit(failed ? 1 : 0);
