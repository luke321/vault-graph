#!/usr/bin/env node
// github#13

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
const SCALES = (arg("scales", "1,2,4,8")).split(",").map(Number);
const FROM = arg("from", "2018-01-01"), TO = arg("to", "2021-01-01");

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
const html = join(mkdtempSync(join(tmpdir(), "vg-probe-")), "vault-graph.html");
const b = spawnSync(process.execPath,
  [join(ROOT, "src", "build-graph.mjs"), "--out", html, "--vault", vault], { encoding: "utf8" });
if (b.status !== 0) throw new Error("build failed:\n" + (b.stderr || ""));
process.stdout.write(b.stdout || "");

const PORT = await freePort();
const profile = mkdtempSync(join(tmpdir(), "vg-probe-prof-"));
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
    try { page = await attach(PORT, ""); } catch { }
  }
  if (!page) throw new Error("could not attach");
  page.j = async (e) => JSON.parse(await page.eval("JSON.stringify(" + e + ")"));
  for (let i = 0; i < 100; i++) {
    if (await page.j("!!(window.__vg && __vg.state.until === null)").catch(() => false)) break;
    await sleep(300);
  }
  await sleep(1600);

  console.log(`\nthe same range cascade (${FROM} -> ${TO}) at several time scales\n`);
  console.log("  scale  frames   spanMs   outerStep  innerStep   step*frames");
  const rows = [];
  for (const sc of SCALES) {
    await page.eval(`__vg.setRange(null, null); void 0`);
    await sleep(900);
    await page.eval(`__vg.timeScale = ${sc}; __vg.probe(true); void 0`);
    await page.eval(`__vg.setRange("${FROM}", "${TO}"); void 0`);
    await sleep(300);
    for (let k = 0; k < 400; k++) {
      if (!(await page.j("!!__vg.demo.busy()").catch(() => false))) break;
      await sleep(150);
    }
    await sleep(400);
    const r = await page.j("__vg.probeReport()");
    await page.eval(`__vg.probe(false); void 0`);
    rows.push({ sc, ...r });
    const pad = (v, w) => String(v).padStart(w);
    console.log("  " + pad(sc, 5) + pad(r.frames, 8) + pad(r.spanMs, 9) +
                pad(r.outerMaxStep, 12) + pad(r.innerMaxStep, 11) +
                pad(Math.round(r.outerMaxStep * r.frames), 14));
    console.log(`         worst outer step at ${r.outerStepAtMs}ms of ${r.spanMs}` +
                ` (${Math.round(100 * r.outerStepAtMs / Math.max(1, r.spanMs))}% through),` +
                ` travelled ${Math.round(r.outerTravel)}`);
    if (r.settleStep) console.log("         settle handover: " + JSON.stringify(r.settleStep).slice(0, 220));
  }
  console.log("\n  step*frames roughly CONSTANT  => smooth, and the per-frame threshold is");
  console.log("  measuring frame count rather than smoothness.");
  console.log("  step roughly constant instead   => a real discontinuity, independent of frames.\n");
} finally {
  try { if (page) await page.send("Browser.close"); } catch { }
  try { chrome.kill(); } catch { }
}
