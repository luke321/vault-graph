#!/usr/bin/env node
// github#37
// github#37

import { spawnSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { attach } from "./cdp.mjs";
import { leftWindowArgs } from "./screen.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT_DIR = join(ROOT, "scripts", "layout-snapshots");

// github#76
const FIXTURES = [
  { script: "make-demo-vault.mjs", args: [], name: "demo-vault", drill: "03 - Resources" },
  { script: "make-test-vault.mjs", args: ["--notes", "10000", "--years", "10", "--end", "2026-08-28"], name: "test-vault", drill: "03 - Resources" },
  { script: "make-shape-vault.mjs", args: [], name: "shape-vault", drill: "projects" },
  // github#86, design/0015 -- recorded in the TAG dimension; that is its picture. A root is a
  // FOLDER, so the tag disc has no drilled golden: there is nothing to drill into (github#76).
  { script: "make-tag-vault.mjs", args: ["--end", "2026-09-09"], name: "tag-vault",
    gens: ["make-tag-vault.mjs"], dim: "tag" },
];

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

// github#86 -- `gens` must match the list scripts/smoke.mjs hashes
function digestOf(args, gens) {
  const h = createHash("sha256");
  h.update("format:" + FIXTURE_FORMAT);
  for (const g of gens || GENERATORS) h.update(readFileSync(join(HERE, g)));
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

function buildFixture(fx) {
  const digest = digestOf(fx.args, fx.gens);
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

async function measure(htmlPath, dim, drill) {
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
    ...leftWindowArgs(1600, 1000), `--app=${url}`,
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
    const settleDeadline = Date.now() + 6000;
    for (;;) {
      const busy = await page.eval("!!__vg.demo.busy()").catch(() => false);
      if (!busy) break;
      if (Date.now() > settleDeadline) throw new Error("page never settled (demo.busy() stayed true)");
      await sleep(120);
    }
    // github#86 -- before the relayout, so this is the disc measured
    if (dim && dim !== "folder") {
      await page.eval(`__vg.setDim(${JSON.stringify(dim)}); void 0`);
    }
    // github#21
    // github#76
    const read = `JSON.stringify((function(){
      __vg.relayout();
      var plan = __vg.buildWedgePlan(false), band = {};
      plan.cells.forEach(function(c){ band[c.g] = c.inner ? "inner" : "outer"; });
      var pos = {}, n = 0;
      __vg.graph.forEachNode(function(id, a){
        if (!__vg.inRoot(id)) return;
        pos[id] = [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100];
        n++;
      });
      return { band: band, positions: pos, notes: n };
    })())`;
    await page.eval(`__vg.relayout(); void 0`).catch(() => {});
    const vault = JSON.parse(await page.eval(read));
    let drilled = null;
    if (drill) {
      await page.eval(`__vg.setRoot(${JSON.stringify(drill)}, true); void 0`);
      drilled = JSON.parse(await page.eval(read));
      drilled.root = drill;
    }
    page.close();
    return { vault, drilled };
  } finally {
    chrome.kill();
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const fx of FIXTURES) {
    const built = buildFixture(fx);
    try {
      const both = await measure(built.htmlPath, fx.dim, fx.drill);
      for (const [kind, m] of [["", both.vault], [".drill", both.drilled]]) {
        if (!m) continue;
        const { band, positions, notes } = m;
        const folders = Object.keys(band).sort();
        const sortedBand = {};
        for (const f of folders) sortedBand[f] = band[f];
        const sortedPositions = {};
        for (const id of Object.keys(positions).sort((a, b) => Number(a) - Number(b))) {
          sortedPositions[id] = positions[id];
        }
        const out = { vault: fx.name, dim: fx.dim || "folder", notes, folders: folders.length,
                      band: sortedBand, positions: sortedPositions };
        // github#76
        if (m.root) out.root = m.root;
        const outPath = join(OUT_DIR, `${fx.name}${kind}.json`);
        writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
        const inner = folders.filter((f) => band[f] === "inner").length;
        console.log(`${fx.name}${kind}: wrote ${outPath} (${notes} notes, ${folders.length} groups, ` +
          `${inner} inner / ${folders.length - inner} outer, grouped by ${fx.dim || "folder"}` +
          (m.root ? `, root ${JSON.stringify(m.root)}` : "") + ")");
      }
    } finally {
      rmSync(built.dir, { recursive: true, force: true });
    }
  }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
