#!/usr/bin/env node
// github#58

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { attach } from "./cdp.mjs";

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

function referenceFor(vault, i) {
  const given = argAll("against")[i];
  if (given) return given;
  if (!AGAINST_DIR) return null;
  const want = basename(vault);
  const hit = readdirSync(AGAINST_DIR).find((f) => f.startsWith(want) && f.endsWith(".html"));
  return hit ? join(AGAINST_DIR, hit) : null;
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

async function placeCamera(p, ratio) {
  await p.eval("__vg.renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: " + ratio + ", angle: 0 }); " +
               "__vg.renderer.refresh(); void 0");
  await p.eval(
    "new Promise(function (r) {" +
    "  var done = false, fin = function () { if (!done) { done = true; r(true); } };" +
    "  requestAnimationFrame(function () { requestAnimationFrame(fin); });" +
    "  setTimeout(fin, 700);" +
    "})");
}

async function cameraSample(p) {
  return p.eval(
    "(function () {" +
    "  var R = __vg.renderer, G = __vg.graph;" +
    "  R.render();" +
    "  var out = [];" +
    "  G.forEachNode(function (id) {" +
    "    var a = G.getNodeAttributes(id), v = R.graphToViewport(a), d = R.getNodeDisplayData(id);" +
    "    out.push(v.x, v.y, R.scaleSize(d ? d.size : 1));" +
    "  });" +
    "  var inv = R.viewportToGraph({ x: 100.5, y: 200.25 });" +
    "  return { xyz: out, inv: [inv.x, inv.y], dims: R.getDimensions(), ratio: R.getCamera().getState().ratio };" +
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
    ok,
    detail: a.xyz.length / 3 + " nodes, max |d| " + maxD.toExponential(2) + " px (" + over + " over " + CAMERA_BAR + "), " +
            "viewportToGraph |d| " + invD.toExponential(2) + ", stage " + a.dims.width + "x" + a.dims.height,
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
    ok,
    detail: a.w + "x" + a.h + ": " + over + " px over " + THRESHOLD + "/255 (" + pct(share) + ", bar " + pct(PIXEL_BAR) + "); " +
            "any diff " + any + " (" + pct(any / n) + "), max " + maxD + "; hist 1-8:" + hist[1] + " 9-32:" + hist[2] + " 33+:" + hist[3] +
            (over ? "; box x " + x0 + ".." + x1 + " y " + y0 + ".." + y1 : "") +
            "; edgeInk ref " + a.ink + " now " + b.ink + (inkOk ? "" : " (over 1%)"),
  };
}

/* ---- screenshots: what a person sees, overlays and chrome included ---------------------------
 * The layer diff above reads the renderer's canvases and nothing else. The logo, the heatmap
 * band, the ribbon, the legend and the wedge labels are the page's own, painted from
 * graphToViewport and afterRender, so a renderer that got a coordinate wrong would show it
 * there first. Page.captureScreenshot sees all of it. Two clips: the stage (#vg-stage) and the
 * whole page (#vg-app). Compared as PNGs first -- the same Chrome encodes identical pixels to
 * identical bytes -- and decoded only when the bytes differ, to say how many pixels and where.
 */

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

async function screenshotSample(p) {
  await p.send("Page.enable").catch(() => {});
  const shots = {};
  for (const [name, sel] of [["stage", "#vg-stage"], ["page", "#vg-app"]]) {
    const r = await p.eval("(function () { var r = document.querySelector(" + JSON.stringify(sel) + ").getBoundingClientRect(); " +
                           "return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()");
    await p.eval("__vg.renderer.render(); void 0");
    const shot = await p.send("Page.captureScreenshot", { format: "png", clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    shots[name] = shot.data;
  }
  return shots;
}

function compareShots(a, b) {
  const parts = [];
  let ok = true;
  for (const name of ["stage", "page"]) {
    if (a[name] === b[name]) { parts.push(name + ": PNG bytes identical"); continue; }
    const A = decodePng(Buffer.from(a[name], "base64")), B = decodePng(Buffer.from(b[name], "base64"));
    if (A.w !== B.w || A.h !== B.h) { ok = false; parts.push(name + ": sizes differ " + A.w + "x" + A.h + " vs " + B.w + "x" + B.h); continue; }
    const r = comparePixels({ w: A.w, h: A.h, ink: null, data: A.data }, { w: B.w, h: B.h, ink: null, data: B.data });
    if (!r.ok) ok = false;
    parts.push(name + ": " + r.detail);
  }
  return { ok, detail: parts.join(" | ") };
}

async function sampleBuild(p, label) {
  await waitReady(p, label);
  if (QUERY) await p.eval("__vg.state.query = " + JSON.stringify(QUERY.toLowerCase()) + "; __vg.renderer.refresh(); void 0");
  const out = new Map();
  for (const ratio of RATIOS) {
    await placeCamera(p, ratio);
    const s = {};
    if (MODE === "all" || MODE === "camera") s.camera = await cameraSample(p);
    if (MODE === "all" || MODE === "pixels") s.pixels = await pixelSample(p);
    if (MODE === "all" || MODE === "screenshot") s.shots = await screenshotSample(p);
    out.set(ratio, s);
  }
  return out;
}

async function runVault(vault, reference, chrome) {
  const dir = mkdtempSync(join(tmpdir(), "vg-render-diff-"));
  const nowHtml = join(dir, "now.html");
  build(vault, nowHtml);
  const profile = mkdtempSync(join(tmpdir(), "vg-render-diff-profile-"));
  const proc = spawn(chrome, [
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
    "--disable-component-update", "--no-service-autorun", "--metrics-recording-only", "--no-pings", "--mute-audio",
    "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
    "--force-device-scale-factor=1",
    ...(HEADED ? [] : ["--window-position=-2400,0"]), "--window-size=1600,1000",
    "--app=" + toUrl(reference),
  ], { stdio: "ignore" });
  const results = [];
  try {
    let page = null;
    const deadline = Date.now() + 25000;
    const refName = basename(reference);
    for (;;) {
      try { page = await attach(PORT, refName); break; }
      catch (e) { if (Date.now() > deadline) throw e; await sleep(400); }
    }
    const ref = await sampleBuild(page, "reference build");
    const refErrors = page.firstError();
    await page.send("Page.enable").catch(() => {});
    await page.send("Page.navigate", { url: toUrl(nowHtml) });
    const nav = Date.now() + 15000;
    for (;;) {
      const here = await page.eval("location.href").catch(() => "");
      if (String(here).includes("now.html")) break;
      if (Date.now() > nav) throw new Error("the tab never reached the current build");
      await sleep(200);
    }
    const now = await sampleBuild(page, "current build");
    for (const ratio of RATIOS) {
      const r = ref.get(ratio), n = now.get(ratio);
      if (r.camera) results.push({ ratio, kind: "camera", ...compareCamera(r.camera, n.camera) });
      if (r.pixels) results.push({ ratio, kind: "pixels", ...comparePixels(r.pixels, n.pixels) });
      if (r.shots) results.push({ ratio, kind: "shots", ...compareShots(r.shots, n.shots) });
    }
    const err = page.firstError();
    if (refErrors || err) results.push({ ratio: "-", kind: "errors", ok: false, detail: [refErrors, err].filter(Boolean).join(" | ") });
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
for (const [i, vault] of vaults.entries()) {
  console.log("== " + basename(vault));
  const reference = referenceFor(vault, i);
  if (!reference || !existsSync(reference)) {
    console.log("  FAIL no reference build -- pass --against <ref.html> or --against-dir <dir> holding " + basename(vault) + "*.html");
    failed++;
    continue;
  }
  const results = await runVault(vault, reference, chrome);
  for (const r of results) {
    console.log("  " + (r.ok ? "ok  " : "FAIL") + " ratio " + r.ratio + " " + String(r.kind).padEnd(7) + " " + r.detail);
    if (!r.ok) failed++;
  }
}
console.log(failed ? "render-diff: " + failed + " comparison(s) over the bar" : "render-diff: every comparison within the bar");
process.exit(failed ? 1 : 0);
