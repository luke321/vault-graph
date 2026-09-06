#!/usr/bin/env node
// A MID-CASCADE FRAME, AS A PNG, FRAMED THE SAME WAY EVERY RUN.
//
//   node scripts/shoot-cascade-frame.mjs --vault <vault> --out shots/before --label before
//
// github#41 is about what a frame LOOKS like, and every other probe in this repo answers with
// numbers. This one answers with the frame. Run it on two checkouts with the same arguments and
// the two PNGs are comparable, because everything that decides framing is pinned:
//
//   * the same cascade (one folder's eye), at the same --scale, captured at the same ELAPSED
//     MILLISECONDS after the click -- so the same interpolation point, not the same frame index,
//     which would depend on how fast the machine drew;
//   * the crop is centred on ONE NAMED NOTE's resting viewport position. The resting layout is
//     identical across the branches this compares (`the resting disc is on the lattice` reports
//     the same numbers), so the same note puts the same pixels in the box.
//
// It writes the full pane and a tight crop. The crop is the point: at 10k notes a dot is about
// 4 CSS px across, so a full-pane shot cannot show two of them touching.

import { attach } from "./cdp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OUT = resolve(arg("out", join(ROOT, "shots")));
const LABEL = arg("label", "frame");
const GROUP = arg("group", "02 - Areas");
// A YEAR CHIP INSTEAD OF A FOLDER EYE. Defect 2 -- the dot drawn 1.74-1.81x its resting radius
// from the first cascade frame -- shows on range changes, and a year chip is the range change a
// person actually clicks. Both ends of the range move at once, which no folder toggle does.
const YEAR = arg("year", "");
const CENTRE = arg("centre", "2163");          // the note the crop is centred on
const SCALE = Number(arg("scale", "8"));       // slow motion, so a target ms is reachable
const CROP = Number(arg("crop", "460"));       // CSS px, square
const DSF = Number(arg("dsf", "3"));           // deviceScaleFactor for the crop
// CAMERA RATIO, or 0 to leave the camera where the page put it. At 10k notes a dot is ~4 CSS px
// across, so a crop of the fitted view cannot show two of them touching however far it is
// upscaled -- upscaling adds pixels, not detail. Zooming the CAMERA adds detail. Pinned to the
// same number and the same centre note in both runs, so the two frames stay comparable.
const ZOOM = Number(arg("zoom", "0"));
// The github#41 experiment's toggle, so the same build shoots both modes and nothing but the
// flag differs between the two PNGs.
const FITCAP = arg("fitcap", "");
// WHEN. Elapsed ms after the click, at --scale. CASCADE_MS is 1600 and TIME_SCALE 1.25, so at
// scale 8 a cascade runs ~12.8s and these three land near 25%, 40% and 55% of it.
const ATS = (arg("at", "3200,5100,7000")).split(",").map(Number);

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
const html = join(mkdtempSync(join(tmpdir(), "vg-shot-")), "vault-graph.html");
const b = spawnSync(process.execPath,
  [join(ROOT, "src", "build-graph.mjs"), "--out", html, "--vault", vault], { encoding: "utf8" });
if (b.status !== 0) throw new Error("build failed:\n" + (b.stderr || ""));
process.stdout.write(b.stdout || "");
mkdirSync(OUT, { recursive: true });

const PORT = await freePort();
const profile = mkdtempSync(join(tmpdir(), "vg-shot-prof-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check",
  "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling", "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-position=-2400,0", "--window-size=1600,1000", `--app=${pathToFileURL(html).href}`,
], { stdio: "ignore" });

let page = null;
try {
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    try { page = await attach(PORT, ""); } catch { /* not up yet */ }
  }
  if (!page) throw new Error("could not attach");
  page.j = async (e) => JSON.parse(await page.eval("JSON.stringify(" + e + ")"));
  for (let i = 0; i < 100; i++) {
    if (await page.j("!!(window.__vg && __vg.state.until === null)").catch(() => false)) break;
    await sleep(300);
  }
  await sleep(2500);

  const settle = async () => {
    for (let k = 0; k < 600; k++) {
      if (!(await page.j("!!__vg.demo.busy()").catch(() => false))) break;
      await sleep(120);
    }
    await sleep(800);
  };
  await settle();

  // ZOOM AND CENTRE, before anything is measured or captured: everything below reads the
  // camera, so it has to be settled first. Sigma's camera lives in framed-graph coordinates,
  // hence the round trip through the viewport rather than assigning graph coordinates to it.
  if (ZOOM > 0) {
    await page.eval(`(function () {
      var a = __vg.graph.getNodeAttributes(${JSON.stringify(CENTRE)});
      var v = __vg.renderer.graphToViewport({ x: a.x, y: a.y });
      var fg = __vg.renderer.viewportToFramedGraph(v);
      __vg.renderer.getCamera().setState({ x: fg.x, y: fg.y, ratio: ${ZOOM}, angle: 0 });
    })(); void 0`);
    await sleep(900);
  }

  // Where the crop goes: the centre note's RESTING viewport position, in CSS px.
  const at = await page.j(`(function () {
    var a = __vg.graph.getNodeAttributes(${JSON.stringify(CENTRE)});
    if (!a) return null;
    var v = __vg.renderer.graphToViewport({ x: a.x, y: a.y });
    var c = __vg.renderer.getContainer().getBoundingClientRect();
    return { x: Math.round(v.x + c.left), y: Math.round(v.y + c.top),
             stage: { w: Math.round(c.width), h: Math.round(c.height) } };
  })()`);
  if (!at) throw new Error(`note ${CENTRE} is not in this vault`);
  const clip = {
    x: Math.max(0, at.x - CROP / 2), y: Math.max(0, at.y - CROP / 2),
    width: CROP, height: CROP, scale: DSF,
  };
  console.log(`crop ${CROP}x${CROP} CSS px at (${clip.x}, ${clip.y}) around note ${CENTRE}, ` +
              `x${DSF}; stage ${at.stage.w}x${at.stage.h}`);

  // The crop centre in GRAPH coordinates, so the frame's own numbers can be restricted to it.
  await page.eval(`(function () {
    var a = __vg.graph.getNodeAttributes(${JSON.stringify(CENTRE)});
    var k = ${CROP} / 2;
    var v0 = __vg.renderer.viewportToGraph({ x: 0, y: 0 });
    var v1 = __vg.renderer.viewportToGraph({ x: k, y: 0 });
    window.__shotClip = { gx: { x: a.x, y: a.y, r: Math.abs(v1.x - v0.x) } };
  })(); void 0`).catch(() => 0);

  const shoot = async (name, withClip) => {
    const r = await page.send("Page.captureScreenshot",
      withClip ? { format: "png", clip, captureBeyondViewport: false }
               : { format: "png", captureBeyondViewport: false });
    const f = join(OUT, `${LABEL}-${name}.png`);
    writeFileSync(f, Buffer.from(r.data, "base64"));
    console.log("  wrote " + f);
    return f;
  };

  const restRad = await page.j(`(function () {
    var a0 = __vg.renderer.graphToViewport({ x: 0, y: 0 });
    var b0 = __vg.renderer.graphToViewport({ x: 160, y: 0 });
    var k = 160 / Math.hypot(b0.x - a0.x, b0.y - a0.y);
    var d = __vg.renderer.getNodeDisplayData(${JSON.stringify(CENTRE)});
    return d ? Math.round(__vg.renderer.scaleSize(d.size) * k * 10) / 10 : null; })()`);
  console.log(`note ${CENTRE} at rest: ${restRad}u drawn`);

  // A resting reference, so a reader can see what the same pixels look like with nothing moving.
  await shoot("rest-crop", true);
  await shoot("rest-full", false);

  if (FITCAP) {
    const got = await page.j(`(function(){ __vg.fitCap = ${FITCAP === "on"}; return __vg.fitCap; })()`);
    console.log(`__vg.fitCap = ${got}`);
    await sleep(400);
  }
  await page.eval(`__vg.timeScale = ${SCALE}; void 0`);
  // Hidden first, so the captured cascade is the SHOW -- the direction that measured worst, and
  // the one where the disc has to open up for a wedge arriving.
  const clickEye = () => (YEAR
    ? page.j(`(function(){ var b = document.querySelector('[data-yr="${YEAR}"]');
        if (!b) return false; b.click(); return true; })()`)
    : page.j(`(function(){
        var b = document.querySelector('[data-eye="' + ${JSON.stringify(GROUP)}.replace(/"/g, '\\"') + '"]');
        if (!b) return false; b.click(); return true; })()`));
  if (YEAR) {
    // A year chip has no "off", so the captured cascade is the chip pressed from the whole
    // vault -- the direction the size step appears in. No pre-click to undo.
    if (!(await page.j(`!!document.querySelector('[data-yr="${YEAR}"]')`))) {
      throw new Error(`no year chip for ${YEAR}`);
    }
  } else {
    // Hidden first, so the captured cascade is the SHOW -- the direction that measured worst.
    if (!(await clickEye())) throw new Error(`no legend eye for ${GROUP}`);
    await settle();
  }

  // Live overlap count for the captured frame, from the same geometry the probes use, so the
  // picture carries its own number instead of being asserted about afterwards.
  const COUNT = `(function () {
    var a0 = __vg.renderer.graphToViewport({ x: 0, y: 0 });
    var b0 = __vg.renderer.graphToViewport({ x: 160, y: 0 });
    var k = 160 / Math.hypot(b0.x - a0.x, b0.y - a0.y);
    var pts = [], maxRad = 0;
    __vg.graph.forEachNode(function (id, a) {
      var d = __vg.renderer.getNodeDisplayData(id);
      if (!d || d.hidden) return;
      var al = __vg.alpha[id]; if (al === undefined) al = 1;
      if (al < 0.35) return;
      var rad = __vg.renderer.scaleSize(d.size) * k;
      if (rad > maxRad) maxRad = rad;
      pts.push({ x: a.x, y: a.y, rad: rad });
    });
    var cell = Math.max(16, 2 * maxRad), grid = Object.create(null);
    pts.forEach(function (p) {
      p.gx = Math.floor(p.x / cell); p.gy = Math.floor(p.y / cell);
      var kk = p.gx + ":" + p.gy;
      (grid[kk] || (grid[kk] = [])).push(p);
    });
    var pairs = 0, worst = 1e9;
    pts.forEach(function (a1) {
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var bk = grid[(a1.gx + dx) + ":" + (a1.gy + dy)];
        if (!bk) continue;
        bk.forEach(function (b1) {
          if (b1 === a1) return;
          var dist = Math.hypot(b1.x - a1.x, b1.y - a1.y);
          var clr = dist - a1.rad - b1.rad;
          if (clr < worst) worst = clr;
          if (clr < 0 && a1.x * 1e6 + a1.y < b1.x * 1e6 + b1.y) pairs++;
        });
      }
    });
    // The biggest dot on screen, and the biggest one INSIDE THE CROP -- defect 2 is a dot drawn
    // too large, so the picture needs the number that describes it.
    var big = 0, bigIn = 0;
    var cx = window.__shotClip ? window.__shotClip.gx : null;
    pts.forEach(function (p) {
      if (p.rad > big) big = p.rad;
      if (cx && Math.abs(p.x - cx.x) < cx.r && Math.abs(p.y - cx.y) < cx.r && p.rad > bigIn) bigIn = p.rad;
    });
    // THE CENTRE NOTE'S OWN DRAWN RADIUS. Defect 2 is one dot drawn too large, so the frame has
    // to carry that dot's number and not only the crowd's. Through scaleSize, per the trap in
    // .ai-context/animation.md.
    var me = null;
    var dm = __vg.renderer.getNodeDisplayData(${JSON.stringify(CENTRE)});
    if (dm && !dm.hidden) me = Math.round(__vg.renderer.scaleSize(dm.size) * k * 10) / 10;
    return { shown: pts.length, pairs: pairs, maxRad: Math.round(big),
             maxRadInCrop: Math.round(bigIn), centreRad: me,
             worst: worst === 1e9 ? null : Math.round(worst) };
  })()`;

  const t0 = Date.now();
  await clickEye();
  const notes = [];
  for (const ms of ATS) {
    const wait = ms - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    const c = await page.j(COUNT);
    const el = Date.now() - t0;
    notes.push({ ms: el, ...c });
    console.log(`  ${el}ms: ${c.shown} drawn, ${c.pairs} intersecting pair(s), ` +
                `clearance ${c.worst}, note ${CENTRE} drawn ${c.centreRad}u, ` +
                `biggest in crop ${c.maxRadInCrop}u`);
    await shoot(`t${ms}-crop`, true);
    await shoot(`t${ms}-full`, false);
  }
  await settle();
  writeFileSync(join(OUT, `${LABEL}-frames.json`),
                JSON.stringify({ label: LABEL, group: GROUP, scale: SCALE, centre: CENTRE,
                                 crop: CROP, dsf: DSF, clip: clip, frames: notes }, null, 2) + "\n");
  console.log(`\n${LABEL}: ${notes.map((n) => `${n.ms}ms ${n.pairs}p`).join("  ")}`);
} finally {
  try { if (page) await page.send("Browser.close"); } catch { /* going anyway */ }
  try { chrome.kill(); } catch { /* ditto */ }
}
