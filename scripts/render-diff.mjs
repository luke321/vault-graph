#!/usr/bin/env node
// Does the engine draw the same picture as Sigma? (github#58, step 3)
//
//   node scripts/render-diff.mjs                       # every fixture in the store, 3 ratios
//   node scripts/render-diff.mjs --vault <dir> [--vault <dir>]...
//   node scripts/render-diff.mjs --ratios 1.08,0.35,4.2 --threshold 8 --mode all|camera|pixels
//   node scripts/render-diff.mjs --query note            # compare in a search: labels + pills lit
//   node scripts/render-diff.mjs --headed              # a visible window instead of off-screen
//
// WHY THIS EXISTS. The invariant suite asserts numbers about the layout and the camera, and
// none of them can see that a disc is the wrong colour, a curve bows the wrong way, or a layer
// is missing. Replacing the renderer is exactly the change those checks are blind to, so this
// builds the same vault twice -- `--renderer sigma` and `--renderer own` -- opens each in turn
// in one Chrome tab, puts the camera in the same state, and compares:
//
//   camera   graphToViewport for every node and scaleSize of its size, both builds, at each
//            ratio. Pure math; the bar is 1e-6 px (decision 0012, step 3.1).
//   pixels   the composited layers (edges, nodes, labels, hovers, hoverNodes on the surface
//            colour), pixel by pixel. The bar is 0.05 % of the stage differing by more than
//            `--threshold` (8) in any channel, plus edgeInk within 1 % (decision 0012, D-5).
//
// ONE TAB, TWO LOADS. Two tabs in one window would leave one a background tab, where
// requestAnimationFrame never fires -- and the page defers its own edge-cap refresh to a
// frame, so a background build would settle differently from a foreground one. Each page is
// rendered synchronously inside the same evaluate call that reads its canvases: with
// preserveDrawingBuffer off, a WebGL canvas read in a later task can come back blank, which
// is the trap edgeInk in page.js already documents.
//
// Node built-ins plus scripts/cdp.mjs, like every harness here. Not a gate: it launches Chrome
// and takes a minute, and it is what the step commits cite rather than what the hook runs.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
// --query puts both pages into a search: every hit is highlighted and force-labelled, which
// is the one deterministic state that paints the labels, hovers and hoverNodes layers. Hover
// itself rides a timed ramp and is left to the suite's own checks.
const QUERY = arg("query", "");
const PIXEL_BAR = 0.0005;     // share of the stage allowed past the threshold
const INK_BAR = 0.01;         // relative edgeInk difference allowed
const CAMERA_BAR = 1e-6;      // px

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

/** The fixture store the suite uses: <main repo>/.fixtures, one directory per fixture. */
function fixtureVaults() {
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const store = join(dirname(resolve(ROOT, common)), ".fixtures");
  if (!existsSync(store)) return [];
  return readdirSync(store).map((d) => join(store, d))
    .filter((d) => statSync(d).isDirectory() && existsSync(join(d, ".obsidian")));
}

function build(vault, out, renderer) {
  const r = spawnSync(process.execPath,
    [join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", out, "--renderer", renderer],
    { encoding: "utf8" });
  if (r.status !== 0) throw new Error("build-graph (" + renderer + ") failed for " + vault + ":\n" + r.stdout + "\n" + r.stderr);
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

/** Puts the camera at `ratio`, refreshes, and lets the page's own follow-up frames settle. */
async function placeCamera(p, ratio) {
  await p.eval("__vg.renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: " + ratio + ", angle: 0 }); " +
               "__vg.renderer.refresh(); void 0");
  // Two frames, bounded: a tab that is not being painted never fires requestAnimationFrame,
  // and a wait that hangs there says less than one that returns and lets the numbers speak.
  await p.eval(
    "new Promise(function (r) {" +
    "  var done = false, fin = function () { if (!done) { done = true; r(true); } };" +
    "  requestAnimationFrame(function () { requestAnimationFrame(fin); });" +
    "  setTimeout(fin, 700);" +
    "})");
}

/** Every node's viewport position and drawn radius, straight off the renderer the page holds. */
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

/** Renders and composites the layers over the surface colour; the pixels come back in base64. */
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
  const hist = [0, 0, 0, 0];   // 0 · 1-8 · 9-32 · 33+
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
            "; edgeInk sigma " + a.ink + " own " + b.ink + (inkOk ? "" : " (over 1%)"),
  };
}

/** Samples one build at every ratio: Map ratio -> { camera?, pixels? }. */
async function sampleBuild(p, label) {
  await waitReady(p, label);
  if (QUERY) await p.eval("__vg.state.query = " + JSON.stringify(QUERY.toLowerCase()) + "; __vg.renderer.refresh(); void 0");
  const out = new Map();
  for (const ratio of RATIOS) {
    await placeCamera(p, ratio);
    const s = {};
    if (MODE === "all" || MODE === "camera") s.camera = await cameraSample(p);
    if (MODE === "all" || MODE === "pixels") s.pixels = await pixelSample(p);
    out.set(ratio, s);
  }
  return out;
}

async function runVault(vault, chrome) {
  const dir = mkdtempSync(join(tmpdir(), "vg-render-diff-"));
  const sigmaHtml = join(dir, "sigma.html"), ownHtml = join(dir, "own.html");
  build(vault, sigmaHtml, "sigma");
  build(vault, ownHtml, "own");
  const profile = mkdtempSync(join(tmpdir(), "vg-render-diff-profile-"));
  const proc = spawn(chrome, [
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
    "--disable-component-update", "--no-service-autorun", "--metrics-recording-only", "--no-pings", "--mute-audio",
    "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
    "--force-device-scale-factor=1",
    ...(HEADED ? [] : ["--window-position=-2400,0"]), "--window-size=1600,1000",
    "--app=" + toUrl(sigmaHtml),
  ], { stdio: "ignore" });
  const results = [];
  try {
    let page = null;
    const deadline = Date.now() + 25000;
    for (;;) {
      try { page = await attach(PORT, "sigma.html"); break; }
      catch (e) { if (Date.now() > deadline) throw e; await sleep(400); }
    }
    const sigma = await sampleBuild(page, "sigma build");
    const sigmaErrors = page.firstError();
    await page.send("Page.enable").catch(() => {});
    await page.send("Page.navigate", { url: toUrl(ownHtml) });
    const nav = Date.now() + 15000;
    for (;;) {
      const here = await page.eval("location.href").catch(() => "");
      if (String(here).includes("own.html")) break;
      if (Date.now() > nav) throw new Error("the tab never reached the engine build");
      await sleep(200);
    }
    const own = await sampleBuild(page, "own build");
    for (const ratio of RATIOS) {
      const s = sigma.get(ratio), o = own.get(ratio);
      if (s.camera) results.push({ ratio, kind: "camera", ...compareCamera(s.camera, o.camera) });
      if (s.pixels) results.push({ ratio, kind: "pixels", ...comparePixels(s.pixels, o.pixels) });
    }
    const err = page.firstError();
    if (sigmaErrors || err) results.push({ ratio: "-", kind: "errors", ok: false, detail: [sigmaErrors, err].filter(Boolean).join(" | ") });
    page.close();
  } finally {
    try { proc.kill(); } catch { /* already gone */ }
    await sleep(300);
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* chrome may still hold it */ }
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
for (const vault of vaults) {
  console.log("== " + basename(vault));
  const results = await runVault(vault, chrome);
  for (const r of results) {
    console.log("  " + (r.ok ? "ok  " : "FAIL") + " ratio " + r.ratio + " " + String(r.kind).padEnd(7) + " " + r.detail);
    if (!r.ok) failed++;
  }
}
console.log(failed ? "render-diff: " + failed + " comparison(s) over the bar" : "render-diff: every comparison within the bar");
process.exit(failed ? 1 : 0);
