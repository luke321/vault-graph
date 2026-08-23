#!/usr/bin/env node
// Screenshot the three date-range concepts, at rest and with a range applied.
//
//   node scripts/shoot-daterange.mjs --vault path/to/vault --out shots/daterange
//
// WHY ITS OWN SHOOTER. The concepts live in the heatmap band, which is 115px of a 1000px
// window -- shoot.mjs frames the disc and the band is a strip at the top of it. What has to
// be judged here is that strip: whether a year is findable, whether a brush reads as a
// selection, whether the empty years look like information or like a bug. So every frame is
// clipped to the band, plus one full frame per concept to check the disc is responding.

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
const PORT = Number(arg("port", 9411));
const OUT = resolve(arg("out", join(ROOT, "shots", "daterange")));
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

let url = arg("url", "");
if (!url) {
  const vault = arg("vault", "");
  const scratch = join(mkdtempSync(join(tmpdir(), "vg-dr-")), "vault-graph.html");
  const b = spawnSync(process.execPath,
    [join(ROOT, "src", "build-graph.mjs"), "--out", scratch].concat(vault ? ["--vault", vault] : []),
    { encoding: "utf8" });
  if (b.status !== 0) throw new Error("build failed:\n" + (b.stderr || ""));
  process.stdout.write(b.stdout || "");
  url = pathToFileURL(scratch).href;
}

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "vg-dr-prof-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check",
  "--window-position=-2400,0", "--window-size=1600,1000", `--app=${url}`,
], { stdio: "ignore" });

let page = null;
try {
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    try { page = await attach(PORT, ""); } catch { /* not up yet */ }
  }
  if (!page) throw new Error("could not attach to Chrome");
  page.j = async (e) => JSON.parse(await page.eval("JSON.stringify(" + e + ")"));

  for (let i = 0; i < 100; i++) {
    if (await page.j("!!(window.__vg && __vg.state.until === null)").catch(() => false)) break;
    await sleep(300);
  }
  await sleep(1400);

  const bandClip = async () => JSON.parse(await page.eval(`(function(){
    var b = document.querySelector("#vg-heat").getBoundingClientRect();
    return JSON.stringify({ x: b.left, y: b.top, width: b.width, height: b.height, scale: 1 });
  })()`));

  const shoot = async (name, whole) => {
    const opts = { format: "png", captureBeyondViewport: false };
    if (!whole) opts.clip = await bandClip();
    const r = await page.send("Page.captureScreenshot", opts);
    writeFileSync(join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
    console.log("  " + name + ".png");
  };

  const settle = async (ms = 6000) => {
    const dl = Date.now() + ms;
    for (;;) {
      if (!(await page.j("!!__vg.demo.busy()").catch(() => false))) { await sleep(250); return; }
      if (Date.now() > dl) return;
      await sleep(120);
    }
  };

  for (const ui of ["rail", "ribbon", "sliders"]) {
    console.log(ui + ":");
    await page.eval(`__vg.setRange(null, null); __vg.setHeatEnd(null); __vg.setDateUI(${JSON.stringify(ui)}); void 0`);
    await settle();
    await shoot(ui + "-1-rest");

    // A range in the MIDDLE of the history -- the part the 52-week window cannot reach, and
    // the whole reason any of these exist.
    await page.eval(`__vg.setRange("2019-01-01", "2020-06-30"); __vg.setHeatEnd("2020-06-30"); void 0`);
    await settle();
    await shoot(ui + "-2-mid-history");
    console.log("    " + JSON.stringify(await page.j("__vg.rangeReport()")));

    // And a recent slice, where all the density is.
    await page.eval(`__vg.setRange("2026-05-01", null); __vg.setHeatEnd(null); void 0`);
    await settle();
    await shoot(ui + "-3-recent");
    await shoot(ui + "-4-whole", true);
  }

  await page.eval(`__vg.setRange(null, null); __vg.setHeatEnd(null); void 0`);
} finally {
  if (page && page.close) { try { await page.close(); } catch { /* going away anyway */ } }
  chrome.kill();
}
console.log("wrote " + OUT);
