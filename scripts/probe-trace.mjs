#!/usr/bin/env node

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
const ID = arg("id", "8705");
const WHAT = arg("what", "edge");
const MOVE = arg("move", "range");
const FRAC = Number(arg("frac", "0.1"));
const GROUP = arg("group", "02 - Areas");

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
const html = join(mkdtempSync(join(tmpdir(), "vg-tr-")), "vault-graph.html");
const b = spawnSync(process.execPath,
  [join(ROOT, "src", "build-graph.mjs"), "--out", html, "--vault", vault], { encoding: "utf8" });
if (b.status !== 0) throw new Error("build failed:\n" + (b.stderr || ""));
process.stdout.write(b.stdout || "");

const PORT = await freePort();
const profile = mkdtempSync(join(tmpdir(), "vg-tr-prof-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check",
  "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--window-position=-2400,0", "--window-size=1600,1000", `--app=${pathToFileURL(html).href}`,
], { stdio: "ignore" });

const num = (v) => (v === null || v === undefined ? "-" :
  (typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v)));

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
  await sleep(2000);
  if (!(await page.j("!!__vg.traceOn").catch(() => false))) {
    throw new Error("this build has no __vg.traceOn -- investigation branch only");
  }
  await page.eval(`__vg.timeScale = 4; void 0`);

  const settle = async () => {
    for (let k = 0; k < 500; k++) {
      if (!(await page.j("!!__vg.demo.busy()").catch(() => false))) break;
      await sleep(120);
    }
    await sleep(800);
  };

  await page.eval(`__vg.setRange(null, null); void 0`);
  await settle();

  const span = await page.j(`(function(){
    var f = document.querySelector("#vg-from");
    return f ? { min: f.min, max: f.max } : null; })()`);
  const lo = Date.parse(span.min), hi = Date.parse(span.max);

  const moves = {
    range: async () => {
      const from = new Date(hi - (hi - lo) * FRAC).toISOString().slice(0, 10);
      await page.eval(`__vg.setRange(${JSON.stringify(from)}, null); void 0`);
    },
    year: async () => {
      const y = new Date(lo + (hi - lo) * 0.35).getUTCFullYear();
      await page.eval(`__vg.setRange("${y}-01-01", "${y}-12-31"); void 0`);
    },
    folder: async () => {
      await page.j(`(function(){
        var b = document.querySelector('[data-eye="' + ${JSON.stringify(GROUP)}.replace(/"/g, '\\\\"') + '"]');
        if (!b) return false; b.click(); return true; })()`);
    },
    timeline: async () => {
      await page.eval(`(function(){ var b = document.getElementById("vg-refresh");
        if (b) b.click(); return !!b; })(); void 0`);
    },
  };
  if (!moves[MOVE]) throw new Error(`unknown --move ${MOVE}`);

  await page.eval(`__vg.traceOn(${JSON.stringify(ID)}); void 0`);
  await page.eval(`__vg.setRange(null, null); void 0`);
  await settle();
  await page.eval(`__vg.applyFilters ? __vg.applyFilters() : void 0`).catch(() => 0);
  let restRows = await page.j("__vg.traceRows()");

  await moves[MOVE]();
  await settle();
  const rows = await page.j("__vg.traceRows()");
  await page.eval(`__vg.traceOff(); void 0`);

  const all = restRows.concat(rows);
  const want = (r) => WHAT === "both" || r.what === WHAT ||
                      (WHAT === "pass" && r.what === "passEnd");
  const sel = all.filter(want);
  if (!sel.length) {
    console.log(`\nnothing traced for note ${ID} (${sel.length} of ${all.length} rows matched ` +
                `--what ${WHAT}). Is the note drawn in this state?`);
  } else {
    console.log(`\nnote ${ID}, --move ${MOVE}, --what ${WHAT}: ` +
                `${sel.length} pass records (${all.length} traced in total)\n`);
    if (WHAT === "pass") {
      console.log("  " + ["#", "what", "tag", "roomIn_i", "roomOut_i", "roomNow?", "strict", "plan"]
        .map((c) => c.padStart(11)).join(""));
      sel.forEach((r, i) => {
        console.log("  " + [i, r.what, r.tag || "(none)",
          num(r.roomIn_i !== undefined ? r.roomIn_i : r.roomOut_i),
          num(r.roomOut_i), r.hasRoomNow === undefined ? "-" : (r.hasRoomNow ? "yes" : "NO"),
          r.strict === undefined ? "-" : String(!!r.strict),
          r.givenPlan === undefined ? "-" : String(!!r.givenPlan)]
          .map((v) => String(v).padStart(11)).join(""));
      });
      console.log("");
    }
    const cols = WHAT === "place"
      ? ["tag", "base", "SP", "row", "rows", "bandRows", "nEff", "rr"]
      : ["tag", "u", "arc", "mgA", "mgB", "sideClear", "sideRoom", "sideEA", "sideEB",
         "rGraph", "slotR", "dEdge", "nRow"];
    const w = 11;
    if (WHAT !== "pass") console.log("  " + cols.map((c) => c.padStart(w)).join(""));
    const seen = new Set();
    const keep = [];
    sel.forEach((r, i) => {
      const k = r.tag;
      if (k !== "frame") { keep.push(r); return; }
      if (!seen.has("frame-first")) { seen.add("frame-first"); keep.push(r); }
      if (i === sel.length - 1 || sel[i + 1].tag !== "frame") keep.push(r);
    });
    if (WHAT === "place") {
      let prev = null;
      sel.forEach((r) => {
        const flag = prev && prev.row !== r.row ? "  <-- ROW TICK" : "";
        console.log("  " + cols.map((c) => num(r[c]).padStart(w)).join("") + flag);
        prev = r;
      });
    } else if (WHAT !== "pass") {
      for (const r of keep) console.log("  " + cols.map((c) => num(r[c]).padStart(w)).join(""));
    }
    console.log("");
    const rest = sel.find((r) => r.tag === "rest");
    const epAs = sel.filter((r) => r.tag === "endpoint-A");
    const epA = epAs.length ? epAs[epAs.length - 1] : undefined;
    if (epAs.length > 1) console.log(`  (${epAs.length} endpoint-A passes; comparing the last)`);
    if (rest && epA) {
      console.log("  rest vs endpoint-A (endpoint-A is meant to describe rest):");
      for (const c of cols) {
        if (c === "tag" || c === "g") continue;
        const a = rest[c], b2 = epA[c];
        if (typeof a !== "number" || typeof b2 !== "number") continue;
        const ratio = a !== 0 ? b2 / a : null;
        const same = Math.abs(b2 - a) < 1e-6;
        console.log(`    ${c.padEnd(9)} ${num(a).padStart(12)} -> ${num(b2).padStart(12)}` +
                    (same ? "   same" : `   x${ratio === null ? "-" : (Math.round(ratio * 10000) / 10000)}  <-- DIFFERS`));
      }
    } else {
      console.log(`  (no rest/endpoint-A pair in the trace: rest=${!!rest} endpointA=${!!epA})`);
    }
  }
} finally {
  try { if (page) await page.send("Browser.close"); } catch { }
  try { chrome.kill(); } catch { }
}
