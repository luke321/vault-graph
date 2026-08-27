#!/usr/bin/env node
// Write the golden layout snapshots scripts/layout-snapshots/*.json checked against by
// smoke.mjs's "layout matches its golden snapshot" check (github#37).
//
//   node scripts/update-layout-snapshots.mjs
//
// DELIBERATE AND EXPLICIT ONLY. This never runs on its own -- not from the pre-push hook,
// not from smoke.mjs itself -- because a snapshot that regenerates itself on every failure
// is not a regression test, it is a check that can never fail. Run this by hand when a
// layout change is INTENDED, review the diff it produces, and commit the new snapshot in
// the same change as the code that moved the layout -- the same "measured before, measured
// after, and the after is committed on purpose" discipline changelog-detail.md already asks
// for everywhere else.
//
// WHY THIS IS SOUND AT ALL: the three fixture generators default --end to today, so two
// runs of the same generator on two different days produce different note dates -- but
// measured (see the github#37 plan/issue), band assignment and every note's exact (x, y)
// come out byte-for-byte identical across a 3.5-year --end shift, on both the demo and
// shape vaults. Layout depends on the SEEDED structure and each note's link weight, neither
// of which --end touches, so a snapshot taken today stays valid indefinitely -- it does not
// need regenerating on the fixture store's own weekly refresh, only when the layout logic
// itself changes on purpose.
//
// Positions are rounded to 2 decimal places (graph units): plenty of headroom over the
// float noise floor (measured exact-equal to float64 in the determinism check above), and
// it keeps the checked-in file diffable and reasonably sized (~250-350KB for the 10k vault
// at this precision, a few tens of KB for the other two).

import { spawnSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { attach } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT_DIR = join(ROOT, "scripts", "layout-snapshots");

// Same three shapes and args smoke.mjs's resolveVaults() builds -- see that function's own
// header comment for why these three and not some other set.
const FIXTURES = [
  { script: "make-demo-vault.mjs", args: [], name: "demo-vault" },
  { script: "make-test-vault.mjs", args: ["--notes", "10000", "--years", "10"], name: "test-vault" },
  { script: "make-shape-vault.mjs", args: [], name: "shape-vault" },
];

// THE SAME SHARED STORE resolveVaults() uses in smoke.mjs, duplicated rather than imported
// (smoke.mjs is a script, not a module with exports -- check-generator-determinism.mjs
// duplicates its own minimal generator-calling logic the same way). This has to resolve to
// the EXACT SAME directory smoke.mjs's own check will read its vault from: a first attempt
// at this script built its own private temp vault per fixture instead, and even though
// --end doesn't affect layout (measured, see this script's header), a completely SEPARATE
// generation of the 10k vault came out close but not byte-identical to smoke.mjs's cached
// one -- 9282 of 10002 notes off by a fraction of a degree, which is not float noise, it's
// two different builds. Reusing the identical cached directory removes the question
// entirely: the snapshot and the check are then always reading the SAME vault.
const GENERATORS = ["make-demo-vault.mjs", "make-test-vault.mjs", "make-shape-vault.mjs"];
const FIXTURE_FORMAT = 1;

function storeRoot() {
  const g = spawnSync("git", ["-C", ROOT, "rev-parse", "--git-common-dir"], { encoding: "utf8" });
  if (g.status === 0 && g.stdout.trim()) {
    const common = g.stdout.trim();
    const abs = /^[A-Za-z]:[\\/]|^\//.test(common) ? common : join(ROOT, common);
    return join(dirname(abs), ".fixtures");
  }
  return join(ROOT, ".fixtures");
}

function digestOf(args) {
  const h = createHash("sha256");
  h.update("format:" + FIXTURE_FORMAT);
  for (const g of GENERATORS) h.update(readFileSync(join(HERE, g)));
  h.update(JSON.stringify(args));
  return h.digest("hex").slice(0, 8);
}

function findChrome() {
  const guesses = [
    process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ];
  for (const g of guesses) if (g && existsSync(g)) return g;
  throw new Error("Chrome not found");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Resolve (generating if missing) the SAME shared-store vault directory smoke.mjs's
// resolveVaults() would use for this fixture, then build vault-graph.html from it into a
// scratch location. Returns the built HTML's absolute path; caller owns cleanup of
// `htmlDir` (the vault directory itself is the shared store's and is never removed here).
function buildFixture(fx) {
  const digest = digestOf(fx.args);
  const dir = join(storeRoot(), `${fx.name}-${digest}`);
  if (!existsSync(join(dir, ".stamp.json"))) {
    console.log(`  ${fx.name}: not in the shared fixture store yet, generating ...`);
    mkdirSync(storeRoot(), { recursive: true });
    const gen = spawnSync(process.execPath, [join(HERE, fx.script), ...fx.args, "--out", dir],
      { encoding: "utf8" });
    if (gen.status !== 0) throw new Error(`${fx.script} failed:\n${gen.stderr || ""}`);
    writeFileSync(join(dir, ".stamp.json"),
      JSON.stringify({ digest, day: new Date().toISOString().slice(0, 10) }, null, 2) + "\n");
  }
  const htmlDir = mkdtempSync(join(tmpdir(), `vg-snap-${fx.name}-`));
  const htmlPath = join(htmlDir, "vault-graph.html");
  const build = spawnSync(process.execPath,
    [join(ROOT, "src", "build-graph.mjs"), "--vault", dir, "--out", htmlPath],
    { encoding: "utf8" });
  if (build.status !== 0) throw new Error(`build-graph.mjs failed:\n${build.stderr || ""}`);
  return { dir: htmlDir, htmlPath };
}

// Launch Chrome on `htmlPath?rest` (skip the intro, same as every non-intro smoke.mjs
// check), wait for the page to be ready, measure band + positions, close, return the data.
async function measure(htmlPath) {
  const port = await new Promise((res, rej) => {
    const srv = createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => { const { port: p } = srv.address(); srv.close(() => res(p)); });
  });
  const profile = mkdtempSync(join(tmpdir(), "vg-snap-profile-"));
  const url = pathToFileURL(htmlPath).href + "?rest";
  const chrome = spawn(findChrome(), [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-component-update", "--disable-client-side-phishing-detection",
    "--disable-sync", "--no-service-autorun", "--disable-domain-reliability",
    "--metrics-recording-only", "--no-pings", "--mute-audio",
    "--disable-breakpad", "--disable-crash-reporter",
    "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--window-position=-2400,0", "--window-size=1600,1000", `--app=${url}`,
  ], { stdio: "ignore", detached: false });

  try {
    let page;
    const deadline = Date.now() + 20000;
    for (;;) {
      try { page = await attach(port, "vault-graph.html"); break; }
      catch (e) { if (Date.now() > deadline) throw e; await sleep(400); }
    }
    const ready = Date.now() + 30000;
    for (;;) {
      const ok = await page.eval("!!(window.__vg && __vg.heat && __vg.state.until === null)").catch(() => false);
      if (ok) break;
      if (Date.now() > ready) throw new Error("page never finished its intro");
      await sleep(300);
    }
    // AND STILL, THE SAME WAY smoke.mjs's settle() DOES: state.until===null only means the
    // intro/date-sweep finished, not that every one of demo.busy()'s conditions (cascades,
    // ramps) has too.
    const settleDeadline = Date.now() + 6000;
    for (;;) {
      const busy = await page.eval("!!__vg.demo.busy()").catch(() => false);
      if (!busy) break;
      if (Date.now() > settleDeadline) throw new Error("page never settled (demo.busy() stayed true)");
      await sleep(120);
    }
    // __vg.relayout() (the debug API's, not applyLayout directly): cancels any in-flight
    // cascade frame, clears roomNow/cellNow/edgeNow/bandLock/geomLock, and rebuilds from
    // scratch. Plain applyLayout(false) -- once, even twice -- was NOT enough on its own:
    // measured, two consecutive runs of the identical build disagreed by up to several
    // graph units on 90%+ of notes on the demo and 10k vaults (shape-vault, smaller and
    // simpler, happened not to show it). relayout()'s own comment explains why a bare
    // applyLayout can still disagree with itself -- "a still-running cascade's next
    // animation frame lands after this snap and silently overwrites it" -- and it is
    // exactly the class of bug github#21 fixed for dot SIZE, here for POSITION. With
    // relayout(), repeated measurements of the identical build are byte-for-byte identical.
    await page.eval(`__vg.relayout(); void 0`).catch(() => {});
    const data = await page.eval(`JSON.stringify((function(){
      var plan = __vg.buildWedgePlan(false), band = {};
      plan.cells.forEach(function(c){ band[c.g] = c.inner ? "inner" : "outer"; });
      var pos = {};
      __vg.graph.forEachNode(function(id, a){
        pos[id] = [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100];
      });
      return { band: band, positions: pos, notes: __vg.graph.order };
    })())`);
    page.close();
    return JSON.parse(data);
  } finally {
    chrome.kill();
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const fx of FIXTURES) {
    const built = buildFixture(fx);
    try {
      const { band, positions, notes } = await measure(built.htmlPath);
      const folders = Object.keys(band).sort();
      const sortedBand = {};
      for (const f of folders) sortedBand[f] = band[f];
      const sortedPositions = {};
      for (const id of Object.keys(positions).sort((a, b) => Number(a) - Number(b))) {
        sortedPositions[id] = positions[id];
      }
      const out = { vault: fx.name, notes, folders: folders.length, band: sortedBand, positions: sortedPositions };
      const outPath = join(OUT_DIR, `${fx.name}.json`);
      writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
      const inner = folders.filter((f) => band[f] === "inner").length;
      console.log(`${fx.name}: wrote ${outPath} (${notes} notes, ${folders.length} folders, ` +
        `${inner} inner / ${folders.length - inner} outer)`);
    } finally {
      rmSync(built.dir, { recursive: true, force: true });
    }
  }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
