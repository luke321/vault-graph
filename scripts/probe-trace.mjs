#!/usr/bin/env node
// ONE NOTE, EVERY LAYOUT PASS, TERM BY TERM.
//
//   node scripts/probe-trace.mjs --vault <vault> --id 8705 --what edge
//   node scripts/probe-trace.mjs --vault <vault> --id 3997 --what place
//
// Two claims in .ai-context/finding-notes-touch-mid-cascade.md were inferred from the shape of
// a trajectory rather than measured at the source:
//
//   defect 1  "SP walks every frame while `row` is an integer that ticks late, so rows slide
//             out of step" -- from outside, only the PRODUCT (base + row*SP)*scale is visible.
//   defect 2  "edgeSrc disagrees with the resting edgeCap" -- true, but WHICH of dEdge's four
//             terms disagrees was open, and the answer decides where a fix goes.
//
// __vg.traceOn(id) (investigation branch only) records one row per layout pass, tagged with
// which pass it was: "rest", "frame", "endpoint-A", "endpoint-B". This prints them.

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
const WHAT = arg("what", "edge");                 // "edge" | "place" | "both"
const MOVE = arg("move", "range");                // "range" | "year" | "folder" | "timeline"
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
    try { page = await attach(PORT, ""); } catch { /* not up yet */ }
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

  // THE MOVE. "certain timeline moves" was the report, so the year chip and the growth
  // animation are here alongside the squeeze the first pass measured -- a year chip moves
  // BOTH ends of the range at once and can land anywhere, which a "last N%" squeeze never does.
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
      // The intro / Refresh growth animation, which nothing has measured yet: the disc grows
      // from an empty screen to the whole vault through the same cascade() a toggle uses.
      await page.eval(`(function(){ var b = document.getElementById("vg-refresh");
        if (b) b.click(); return !!b; })(); void 0`);
    },
  };
  if (!moves[MOVE]) throw new Error(`unknown --move ${MOVE}`);

  // Rest first, so there is a resting row to compare the cascade's against. A layout pass only
  // happens when something asks for one, so the range is nudged and put back.
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
  // passEnd alongside pass: roomIn is recorded at function ENTRY, before the roomNow override
  // is applied, so a frame's roomIn looks stale even when the override then corrects it. Only
  // the pair (roomIn, roomOut) says whether a pass actually placed with the wrong room.
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
    if (WHAT === "pass") { /* already printed above */ }
    else console.log("  " + cols.map((c) => c.padStart(w)).join(""));
    // Every distinct pass ONCE, plus the first and last frame of the cascade: the interesting
    // rows are the boundaries between passes, and a 200-frame cascade would bury them.
    const seen = new Set();
    const keep = [];
    sel.forEach((r, i) => {
      const k = r.tag;
      if (k !== "frame") { keep.push(r); return; }
      if (!seen.has("frame-first")) { seen.add("frame-first"); keep.push(r); }
      if (i === sel.length - 1 || sel[i + 1].tag !== "frame") keep.push(r);
    });
    if (WHAT === "place") {
      // EVERY frame, not the boundaries: the claim is about how `row` and `SP` move relative to
      // each other over the whole cascade, which is a series and not two endpoints.
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
    // THE DIFF THAT MATTERS: the resting record against the first endpoint-A record, since
    // endpoint-A is supposed to BE the rest the cascade starts from.
    const rest = sel.find((r) => r.tag === "rest");
    // THE LAST endpoint-A record, not the first. roomOf runs the endpoint twice on purpose --
    // pass one measures the packing's own room, pass two places against it -- and pass two is
    // the one whose edgeCap is kept. Taking the first record reports the measuring pass, which
    // is still contaminated by design and is not what the cascade walks from.
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
  try { if (page) await page.send("Browser.close"); } catch { /* going anyway */ }
  try { chrome.kill(); } catch { /* ditto */ }
}
