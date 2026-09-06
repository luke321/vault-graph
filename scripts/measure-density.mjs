#!/usr/bin/env node
// github#13

import { attach } from "./cdp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = (arg("sizes", "500,1500")).split(",").map(Number);

function findChrome() {
  const named = arg("chrome", "");
  if (named) return named;
  const win = ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]
    .map((v) => process.env[v])
    .filter(Boolean)
    .map((base) => join(base, "Google", "Chrome", "Application", "chrome.exe"));
  const guesses = win.concat([
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ]);
  for (const g of guesses) if (g && existsSync(g)) return g;
  throw new Error("Chrome not found; pass --chrome <path>");
}

function freePort() {
  return new Promise((res, rej) => {
    import("node:net").then(({ createServer }) => {
      const s = createServer();
      s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
      s.on("error", rej);
    });
  });
}

function buildVault(notes) {
  const dir = join(tmpdir(), `vg-dens-vault-${notes}`);
  if (!existsSync(dir)) {
    const g = spawnSync(process.execPath,
      [join(HERE, "make-test-vault.mjs"), "--out", dir, "--notes", String(notes), "--years", "10"],
      { encoding: "utf8" });
    if (g.status !== 0) throw new Error(`vault ${notes} failed:\n${g.stderr || ""}`);
  }
  const html = join(mkdtempSync(join(tmpdir(), "vg-dens-")), "vault-graph.html");
  const b = spawnSync(process.execPath,
    [join(ROOT, "src", "build-graph.mjs"), "--out", html, "--vault", dir],
    { encoding: "utf8" });
  if (b.status !== 0) throw new Error(`build ${notes} failed:\n${b.stderr || ""}`);
  return pathToFileURL(html).href;
}

const STEP_SCRIPT = (keepFrac) => `(function () {
  var order = __vg.groupOrder();
  var keep = Math.max(1, Math.round(order.length * ${keepFrac}));
  var h = {};
  order.forEach(function (g, i) { if (i >= keep) h[g] = true; });
  __vg.state.hidden.folder = h;
  __vg.syncAlpha();
  __vg.applyLayout(false);
  __vg.renderer.refresh();
  return { groups: order.length, kept: keep };
})()`;

async function measureOne(notes, steps) {
  const url = buildVault(notes);
  const PORT = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "vg-dens-prof-"));
  const chrome = spawn(findChrome(), [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check",
    "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--window-position=-2400,0", "--window-size=1600,1000", `--app=${url}`,
  ], { stdio: "ignore" });

  const rows = [];
  let page = null;
  try {
    for (let i = 0; i < 60 && !page; i++) {
      await sleep(500);
      try { page = await attach(PORT, ""); } catch { }
    }
    if (!page) throw new Error("could not attach to Chrome");
    page.j = async (e) => JSON.parse(await page.eval("JSON.stringify(" + e + ")"));
    for (let i = 0; i < 100; i++) {
      if (await page.j("!!(window.__vg && __vg.state.until === null)").catch(() => false)) break;
      await sleep(300);
    }
    await sleep(1600);

    for (let s = 0; s <= steps; s++) {
      const frac = 1 - s / (steps + 1);
      if (s > 0) {
        await page.eval(STEP_SCRIPT(frac));
        await sleep(500);
      }
      rows.push(await page.j("__vg.densityReport()"));
    }
  } finally {
    try { if (page) await page.send("Browser.close"); } catch { }
    try { chrome.kill(); } catch { }
  }
  return rows;
}

const pad = (v, w) => String(v === null || v === undefined ? "-" : v).padStart(w);

console.log("Measuring density against note count (github#13).\n");
const all = [];
for (const n of SIZES) {
  const steps = Number(arg("steps", "5"));
  console.log(`--- a ${n}-note vault, filtered down in ${steps + 1} steps ---`);
  console.log("  shown    sp  reach  hole   pitchPx  pitch*sqrt(n)  sizeMed  sizeScale");
  const rows = await measureOne(n, steps);
  for (const r of rows) {
    console.log("  " + pad(r.shown, 5) + pad(r.sp, 6) + pad(r.reach, 7) +
                pad(r.holeShare, 6) + pad(r.pitchPx, 9) + pad(r.pitchRoot, 15) +
                pad(r.sizeMedian, 9) + pad(r.sizeScale, 11));
  }
  const roots = rows.map((r) => r.pitchRoot).filter((v) => v);
  const spread = roots.length ? Math.max(...roots) / Math.min(...roots) : 0;
  console.log(`  spread of pitch*sqrt(n) across these states: ${spread.toFixed(2)}x` +
              `  (1.00x is the target)\n`);
  all.push({ n, rows, spread });
}

if (all.length > 1) {
  console.log("--- across vaults, at comparable visible counts ---");
  console.log("  a note count reached two ways should give the same pitch");
  const flat = all.flatMap((a) => a.rows.map((r) => ({ vault: a.n, ...r })));
  flat.sort((x, y) => x.shown - y.shown);
  for (const r of flat) {
    console.log("  vault " + pad(r.vault, 5) + "  shown " + pad(r.shown, 5) +
                "  pitchPx " + pad(r.pitchPx, 8) + "  sizeMed " + pad(r.sizeMedian, 7));
  }
}
