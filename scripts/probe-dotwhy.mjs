#!/usr/bin/env node
// WHICH TERM IN dotPx STEPS ON THE FIRST FRAME OF A CASCADE?
//
//   node scripts/probe-dotwhy.mjs --vault <vault> --id 8705
//
// probe-dotsize.mjs measures that a few hundred dots jump to as much as 1.8x their resting
// radius on frame 1 of a range cascade and hold it until the animation ends. That is the
// answer; this is the reason. It reads dotPx's own intermediate terms (__vg.dotWhy) at rest
// and then on every frame of the cascade, so the step can be attributed to the term that
// moved rather than to the one that seems likeliest.

import { attach } from "./cdp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IDS = arg("id", "8705").split(",").map((s) => s.trim()).filter(Boolean);
const FRAC = Number(arg("frac", "0.1"));

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
const html = join(mkdtempSync(join(tmpdir(), "vg-why-")), "vault-graph.html");
const b = spawnSync(process.execPath,
  [join(ROOT, "src", "build-graph.mjs"), "--out", html, "--vault", vault], { encoding: "utf8" });
if (b.status !== 0) throw new Error("build failed:\n" + (b.stderr || ""));
process.stdout.write(b.stdout || "");

const PORT = await freePort();
const profile = mkdtempSync(join(tmpdir(), "vg-why-prof-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check",
  "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
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
  await sleep(2000);
  if (!(await page.j("!!__vg.dotWhy").catch(() => false))) {
    throw new Error("this build has no __vg.dotWhy -- it is only on the investigation branch");
  }
  await page.eval(`__vg.timeScale = 4; void 0`);

  const settle = async () => {
    for (let k = 0; k < 400; k++) {
      if (!(await page.j("!!__vg.demo.busy()").catch(() => false))) break;
      await sleep(120);
    }
    await sleep(700);
  };

  // Sample dotWhy for the watched notes on every frame, in-page.
  await page.eval(`(function () {
    window.__why = { rows: [], on: false, ids: ${JSON.stringify(IDS)} };
    function loop() {
      if (window.__why.on) {
        window.__why.rows.push({
          ms: Math.round((window.performance || Date).now() - window.__why.t0),
          w: window.__why.ids.map(function (id) { return __vg.dotWhy(id); }),
        });
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    window.__why.start = function () {
      window.__why.rows = []; window.__why.t0 = (window.performance || Date).now();
      window.__why.on = true;
    };
    window.__why.stop = function () { window.__why.on = false; };
  })(); void 0`);

  await page.eval(`__vg.setRange(null, null); void 0`);
  await settle();
  const restAll = await page.j(`${JSON.stringify(IDS)}.map(function (id) { return __vg.dotWhy(id); })`);
  const rest = restAll[0];
  console.log("\nAT REST:");
  console.log("  " + JSON.stringify(rest));

  const span = await page.j(`(function(){
    var f = document.querySelector("#vg-from");
    return f ? { min: f.min, max: f.max } : null; })()`);
  const lo = Date.parse(span.min), hi = Date.parse(span.max);
  const from = new Date(hi - (hi - lo) * FRAC).toISOString().slice(0, 10);

  await page.eval(`__why.start(); void 0`);
  await page.eval(`__vg.setRange(${JSON.stringify(from)}, null); void 0`);
  await settle();
  await page.eval(`__why.stop(); void 0`);
  const rows = await page.j("__why.rows");

  console.log(`\nDURING a squeeze to the last ${FRAC * 100}% (${rows.length} frames), note ${IDS[0]}:`);
  const hdr = ["ms", "out", "rampV", "bandRoom", "cellRoom", "colWalk", "pitch", "edgeCap", "walking"];
  console.log("  " + hdr.map((h) => h.padStart(10)).join(""));
  const show = (r) => {
    const w = r.w[0];
    if (!w) return;
    const f = (v) => (v === null || v === undefined ? "-" : (typeof v === "number" ? (Math.round(v * 100) / 100) : v));
    console.log("  " + [r.ms, f(w.out), f(w.rampV), f(w.bandRoom), f(w.cellRoom), f(w.colWalk),
                        f(w.pitch), f(w.edgeCap),
                        (w.walking.room ? "R" : "-") + (w.walking.cell ? "C" : "-") + (w.walking.edge ? "E" : "-")]
      .map((v) => String(v).padStart(10)).join(""));
  };
  rows.slice(0, 6).forEach(show);
  console.log("  ...");
  const step = Math.max(1, Math.floor(rows.length / 10));
  for (let i = 6; i < rows.length; i += step) show(rows[i]);
  console.log("  ...");
  rows.slice(-2).forEach(show);
  // ONE LINE PER WATCHED NOTE: rest, then the first cascade frame, term by term. The claim
  // "edgeCap is what steps" is only worth making if it holds for more than one note.
  console.log("\nREST vs FIRST CASCADE FRAME, per note:");
  const f1 = rows[0];
  for (let i = 0; i < IDS.length; i++) {
    const w = f1 && f1.w[i], r0 = restAll[i];
    if (!w || !r0) continue;
    const d = (a2, b2) => `${a2 === undefined ? "-" : Math.round(a2 * 100) / 100}` +
                          ` -> ${b2 === undefined ? "-" : Math.round(b2 * 100) / 100}`;
    console.log(`  ${IDS[i]}  out ${d(r0.out, w.out)} (x${(w.out / r0.out).toFixed(2)})` +
                `  edgeCap ${d(r0.edgeCap, w.edgeCap)}` +
                `  bandRoom ${d(r0.bandRoom, w.bandRoom)}` +
                `  cellRoom ${d(r0.cellRoom, w.cellRoom)}` +
                `  pitch ${d(r0.pitch, w.pitch)}  rampV ${d(r0.rampV, w.rampV)}`);
  }
  console.log("\nAT REST AFTER:");
  console.log("  " + JSON.stringify(await page.j(`__vg.dotWhy(${JSON.stringify(IDS[0])})`)));
} finally {
  try { if (page) await page.send("Browser.close"); } catch { /* going anyway */ }
  try { chrome.kill(); } catch { /* ditto */ }
}
