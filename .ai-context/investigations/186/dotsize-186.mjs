// github#186 -- what the weight model cost: dot size against link weight, and column alignment.
//   node .ai-context/investigations/186/dotsize-186.mjs --repo . --html <built page> [--dim tag]
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPO = resolve(arg("repo", process.cwd()));
const { attach } = await import(pathToFileURL(join(REPO, "scripts", "cdp.mjs")).href);
const HTML = resolve(arg("html", ""));
const LABEL = arg("label", "regress");
const DIM = arg("dim", "");
const JSON_OUT = arg("json", "");
const dir = mkdtempSync(join(tmpdir(), "vg-reg-"));
const html = join(dir, "page.html");
writeFileSync(html, readFileSync(HTML, "utf8"));
const find = () => [process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
  process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe"].find((c) => c && existsSync(c));
const PORT = await new Promise((res, rej) => import("node:net").then(({ createServer }) => {
  const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); s.on("error", rej);
}));
const chrome = spawn(find(), ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "vg-reg-prof-"))}`, "--no-first-run",
  "--no-default-browser-check", "--hide-scrollbars", "--force-device-scale-factor=1",
  "--window-size=1200,1000", pathToFileURL(html).href + "?rest"], { stdio: "ignore" });

const MEASURE = `(function () {
  var R = __vg.renderer, G = __vg.graph;
  var a0 = R.graphToViewport({ x: 0, y: 0 }), b0 = R.graphToViewport({ x: 160, y: 0 });
  var perPx = 160 / Math.hypot(b0.x - a0.x, b0.y - a0.y);   // graph units per rendered px
  var ns = [];
  G.forEachNode(function (id, at) {
    var d = R.getNodeDisplayData(id);
    if (!d || d.hidden || (__vg.alpha[id] || 0) < 0.999) return;
    if (__vg.isOrphan(id) || __vg.isPinned(id)) return;
    // github#186 -- the CEILING the note's own wedge sets, so the ramp can be read alone
    var w = __vg.dotWhy ? __vg.dotWhy(id) : null;
    var ceil = w && w.ceil > w.floorPx ? w.ceil : null;
    ns.push({ id: id, g: __vg.groupOf(id), band: __vg.isInner(id) ? "i" : "o",
              deg: at.deg, size: at.size, r: Math.hypot(at.x, at.y),
              th: Math.atan2(at.y, at.x), px: R.scaleSize(d.size),
              ceil: ceil,
              rel: ceil ? (w.out - w.floorPx) / (ceil - w.floorPx) : null });
  });
  if (!ns.length) return null;
  /* ---- 1. does the DOT still say anything about the note's links? ---- */
  var pxs = ns.map(function (n) { return n.px; }).sort(function (x, y) { return x - y; });
  var q = function (v, f) { return v[Math.min(v.length - 1, Math.floor(v.length * f))]; };
  var mean = function (v) { return v.reduce(function (a, b) { return a + b; }, 0) / v.length; };
  var corr = function (xs, ys) {
    var mx = mean(xs), my = mean(ys), sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < xs.length; i++) { var dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : 0;
  };
  // the dot a well-linked note gets against the dot a leaf gets, per band
  var byBand = {};
  ns.forEach(function (n) { (byBand[n.band] || (byBand[n.band] = [])).push(n); });
  var bandDot = {};
  Object.keys(byBand).forEach(function (k) {
    var v = byBand[k].slice().sort(function (x, y) { return x.deg - y.deg; });
    var lo = v.slice(0, Math.max(1, Math.floor(v.length * 0.1)));
    var hi = v.slice(Math.floor(v.length * 0.9));
    bandDot[k] = { n: v.length,
      degLo: Math.round(mean(lo.map(function (z) { return z.deg; })) * 10) / 10,
      degHi: Math.round(mean(hi.map(function (z) { return z.deg; })) * 10) / 10,
      pxLo: Math.round(mean(lo.map(function (z) { return z.px; })) * 100) / 100,
      pxHi: Math.round(mean(hi.map(function (z) { return z.px; })) * 100) / 100,
      corr: Math.round(corr(v.map(function (z) { return z.deg; }), v.map(function (z) { return z.px; })) * 1000) / 1000,
      corrRel: (function () {
        var w2 = v.filter(function (z) { return z.rel != null && isFinite(z.rel); });
        return w2.length > 8 ? Math.round(corr(w2.map(function (z) { return z.deg; }),
                                               w2.map(function (z) { return z.rel; })) * 1000) / 1000 : null;
      })() };
    bandDot[k].ratio = bandDot[k].pxLo > 0 ? Math.round(bandDot[k].pxHi / bandDot[k].pxLo * 100) / 100 : 0;
  });
  /* ---- 2. are the COLUMNS still there? ---- */
  // within one cell, a column means a note in row r sits at the same angle as one in row r+1.
  // For each adjacent row pair, take each note of the outer row and measure its angular distance
  // to the nearest note of the inner row, as a fraction of the inner row's own median step.
  // 0 = dead-on columns, 0.25 = no relationship (uniform random over a step).
  var cells = {};
  ns.forEach(function (n) {
    var k = n.g + "|" + n.band;
    var c = cells[k] || (cells[k] = {});
    var rk = Math.round(n.r * 10) / 10;
    (c[rk] || (c[rk] = [])).push(n);
  });
  var offs = [], pairs = 0;
  Object.keys(cells).forEach(function (k) {
    var rows = Object.keys(cells[k]).map(Number).sort(function (x, y) { return x - y; });
    for (var i = 1; i < rows.length; i++) {
      var lo2 = cells[k][rows[i - 1]], hi2 = cells[k][rows[i]];
      if (lo2.length < 4 || hi2.length < 4) continue;
      var la = lo2.map(function (z) { return z.th; }).sort(function (x, y) { return x - y; });
      var steps = [];
      for (var j = 1; j < la.length; j++) steps.push(la[j] - la[j - 1]);
      steps.sort(function (x, y) { return x - y; });
      var med = steps[Math.floor(steps.length / 2)];
      if (!(med > 1e-6)) continue;
      pairs++;
      hi2.forEach(function (n2) {
        var best = Infinity;
        la.forEach(function (t) { var d2 = Math.abs(n2.th - t); if (d2 < best) best = d2; });
        offs.push(Math.min(0.5, best / med));
      });
    }
  });
  offs.sort(function (x, y) { return x - y; });
  return {
    notes: ns.length, dim: __vg.state.dim,
    dot: { min: Math.round(pxs[0] * 100) / 100, p50: Math.round(q(pxs, 0.5) * 100) / 100,
           max: Math.round(pxs[pxs.length - 1] * 100) / 100,
           spread: Math.round(pxs[pxs.length - 1] / Math.max(0.01, pxs[0]) * 100) / 100,
           distinct: (function () { var s = {}; pxs.forEach(function (v) { s[Math.round(v * 4) / 4] = 1; }); return Object.keys(s).length; })() },
    byBand: bandDot,
    columns: { rowPairs: pairs, samples: offs.length,
               median: offs.length ? Math.round(offs[Math.floor(offs.length / 2)] * 1000) / 1000 : null,
               p90: offs.length ? Math.round(offs[Math.floor(offs.length * 0.9)] * 1000) / 1000 : null,
               onColumn: offs.length ? Math.round(offs.filter(function (v) { return v < 0.08; }).length / offs.length * 1000) / 1000 : null }
  };
})()`;

let page = null;
try {
  for (let i = 0; i < 80 && !page; i++) { await sleep(300); try { page = await attach(PORT, "page.html"); } catch { } }
  page.j = async (e) => JSON.parse(await page.eval("JSON.stringify(" + e + ")"));
  for (let i = 0; i < 120; i++) {
    if (await page.eval("!!(window.__vg && __vg.renderer && __vg.state.until === null)").catch(() => false)) break;
    await sleep(250);
  }
  const settle = async () => { for (let i = 0; i < 300; i++) { if (!(await page.eval("!!(__vg.demo && __vg.demo.busy())").catch(() => true))) { await sleep(250); return; } await sleep(100); } };
  await settle();
  if (DIM) {
    const w = await page.j(`__vg.demo.where("dim", ${JSON.stringify(DIM)})`);
    if (w) {
      await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 1 });
      await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 0 });
      await sleep(400); await settle();
      await page.eval("__vg.relayout(); void 0"); await sleep(300); await settle();
    }
  }
  const r = await page.j(MEASURE);
  const b = r.byBand;
  console.log(`\n== ${LABEL} (${r.notes} notes, ${r.dim})`);
  console.log(`   DOT   ${r.dot.min} .. ${r.dot.max} px, median ${r.dot.p50}, spread ${r.dot.spread}x, ${r.dot.distinct} distinct sizes (quarter-px buckets)`);
  for (const k of Object.keys(b)) {
    console.log(`         band ${k}: bottom-decile deg ${b[k].degLo} -> ${b[k].pxLo} px, top-decile deg ${b[k].degHi} -> ${b[k].pxHi} px` +
                `  (${b[k].ratio}x), corr(deg, px) ${b[k].corr}, corr(deg, ramp) ${b[k].corrRel}`);
  }
  const c = r.columns;
  console.log(`   COLS  ${c.samples} notes over ${c.rowPairs} adjacent row pairs: median offset ${c.median} of a step` +
              ` (0 = dead on, 0.25 = unrelated), p90 ${c.p90}, ${(c.onColumn * 100).toFixed(0)}% within 0.08`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ label: LABEL, ...r }, null, 1));
  if (page.errors.length) console.log("PAGE ERRORS: " + page.errors.map((e) => e.text).join(" | "));
} finally {
  try { if (page) await page.send("Browser.close"); } catch { }
  try { chrome.kill(); } catch { }
}
