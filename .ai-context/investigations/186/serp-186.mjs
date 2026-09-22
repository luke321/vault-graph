#!/usr/bin/env node
// INVESTIGATION TOOLING for github#186 -- does the serpentine survive on a built page? For every
// cell at rest: walk the notes in rank order (c.list), read each one's row and its drawn angle,
// and test that consecutive rows run in opposite angular directions (the snake), and that the
// drawn dot radius falls along the rank order (the size gradient that makes the snake visible).
//   node serp-186.mjs --repo <tree to build from> --html <built page> --out <dir> --label <text>
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPO = resolve(arg("repo", process.cwd()));
const { attach } = await import(pathToFileURL(join(REPO, "scripts", "cdp.mjs")).href);
const OUT = resolve(arg("out", "out")); mkdirSync(OUT, { recursive: true });
const LABEL = arg("label", "serp");
const html = join(OUT, "page.html");
{ const src = readFileSync(resolve(arg("html")), "utf8");
  writeFileSync(html, src.replace(/(window\.VAULT_DATA=\{[\s\S]*?"vault":)("(?:\\.|[^"\\])*")/, (_m, h) => h + JSON.stringify(LABEL))); }
const port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--remote-debugging-port=" + port,
  "--user-data-dir=" + mkdtempSync(join(tmpdir(), "vg-serp-")), "--no-first-run", "--hide-scrollbars", "--force-device-scale-factor=1",
  "--window-size=1200,1000", pathToFileURL(html).href + "?rest"], { stdio: "ignore" });
let page = null;
try {
  for (let i = 0; i < 60 && !page; i++) { await sleep(400); try { page = await attach(port, "page.html"); } catch {} }
  for (let i = 0; i < 100; i++) { if (await page.eval("!!(window.__vg && __vg.renderer && __vg.state.until === null && !__vg.demo.busy())").catch(() => false)) break; await sleep(250); }
  await sleep(1200);
  const r = JSON.parse(await page.eval(`JSON.stringify((function () {
    var G = __vg.graph, R = __vg.renderer;
    var plan = __vg.buildWedgePlan(true, function (id) { return __vg.alpha[id] || 0; });
    var cells = [];
    plan.cells.forEach(function (c) {
      if (c.list.length < 6) return;
      var rows = {};
      var seq = [];
      c.list.forEach(function (id, rank) {
        var a = G.getNodeAttributes(id), d = R.getNodeDisplayData(id);
        if (!a || !d) return;
        var sw = (Math.PI / 2 - Math.atan2(a.y, a.x)); while (sw < 0) sw += 2 * Math.PI;   // clockwise from 12
        var sl = c.slots.find(function (s) { return s.id === id; });
        var rec = { rank: rank, row: sl ? sl.row : -1, sw: sw, px: R.scaleSize(d.size), deg: a.deg || 0 };
        seq.push(rec); (rows[rec.row] || (rows[rec.row] = [])).push(rec);
      });
      // direction of each row: sign of sweep change with rank inside the row
      var dirs = [];
      Object.keys(rows).map(Number).sort(function (x, y) { return x - y; }).forEach(function (rw) {
        var L = rows[rw]; if (L.length < 2) { dirs.push({ row: rw, n: L.length, dir: 0 }); return; }
        var up = 0, down = 0;
        for (var i = 1; i < L.length; i++) { var d0 = L[i].sw - L[i - 1].sw; if (d0 > Math.PI) d0 -= 2 * Math.PI; if (d0 < -Math.PI) d0 += 2 * Math.PI; if (d0 > 1e-6) up++; else if (d0 < -1e-6) down++; }
        dirs.push({ row: rw, n: L.length, dir: up > down ? 1 : down > up ? -1 : 0, up: up, down: down });
      });
      var alternations = 0, pairs = 0;
      for (var k = 1; k < dirs.length; k++) { if (dirs[k].dir && dirs[k - 1].dir) { pairs++; if (dirs[k].dir !== dirs[k - 1].dir) alternations++; } }
      // size gradient along rank: Spearman-ish via Kendall pairs on (rank, px)
      var conc = 0, disc = 0;
      for (var i2 = 0; i2 < seq.length; i2++) for (var j = i2 + 1; j < seq.length; j++) { var dp = seq[j].px - seq[i2].px; if (dp < -1e-6) conc++; else if (dp > 1e-6) disc++; }
      var sizes = seq.map(function (s) { return Math.round(s.px * 4) / 4; }); var distinct = {}; sizes.forEach(function (s) { distinct[s] = 1; });
      cells.push({ g: c.g, k: c.k, inner: !!c.inner, n: seq.length, rows: dirs.length, dirs: dirs.map(function (d) { return d.dir; }).join(""),
                   alternations: alternations, pairs: pairs, tau: (conc + disc) ? (conc - disc) / (conc + disc) : 0,
                   pxFirst: seq.length ? Math.round(seq[0].px * 100) / 100 : 0, pxLast: seq.length ? Math.round(seq[seq.length - 1].px * 100) / 100 : 0,
                   distinct: Object.keys(distinct).length });
    });
    return { cells: cells, total: G.order };
  })())`));
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, "rest.png"), Buffer.from(shot.data, "base64"));
  writeFileSync(join(OUT, "serp.json"), JSON.stringify(r));
  const cs = r.cells;
  const pairs = cs.reduce((a, c) => a + c.pairs, 0), alts = cs.reduce((a, c) => a + c.alternations, 0);
  const tauMed = cs.map((c) => c.tau).sort((a, b) => a - b)[Math.floor(cs.length / 2)];
  console.log(`\n== ${LABEL}: ${cs.length} cells with 6+ notes; row-pairs alternating direction ${alts}/${pairs} (${(100 * alts / Math.max(1, pairs)).toFixed(0)}%); size falls along rank: Kendall tau median ${tauMed.toFixed(2)}, cells with tau < 0.3: ${cs.filter((c) => c.tau < 0.3).length}`);
  console.log("   cell                                 n rows  dirs        alt/pairs  tau    px first->last  distinct");
  cs.sort((a, b) => b.n - a.n).slice(0, 14).forEach((c) => console.log(`   ${(c.inner ? "i " : "o ") + c.k.replace(/\u0000/g, "/").slice(0, 32).padEnd(34)} ${String(c.n).padStart(4)} ${String(c.rows).padStart(3)}  ${c.dirs.replace(/-1/g, "<").replace(/1/g, ">").replace(/0/g, ".").padEnd(11)} ${String(c.alternations + "/" + c.pairs).padStart(8)}  ${c.tau.toFixed(2).padStart(5)}  ${String(c.pxFirst + " -> " + c.pxLast).padStart(14)}  ${c.distinct}`));
} finally { try { await page.send("Browser.close"); } catch {} chrome.kill(); }
