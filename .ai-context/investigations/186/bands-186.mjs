#!/usr/bin/env node
// INVESTIGATION TOOLING for github#186 -- the band table: which group rests in which ring, on a
// built page, in one or both dimensions. This is what the weight model's acceptance is read
// against ("no group changes band between L = 0 and the chosen L unless it is called out").
//
//   node .ai-context/investigations/186/bands-186.mjs --repo . --html <page> [--dim tag] [--json f]
//
// Headless: no window, so the screen guard and the repo's screen-* locks are not involved.

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
const HTML_IN = resolve(arg("html", ""));
const LABEL = arg("label", "bands-186");
const DIMS = arg("dim", "") ? [arg("dim", "")] : ["folder", "tag"];
const JSON_OUT = arg("json", "");
if (!HTML_IN || !existsSync(HTML_IN)) throw new Error("pass --html <built page>");

const dir = mkdtempSync(join(tmpdir(), "vg-186-bands-"));
const html = join(dir, "page.html");
{
  const src = readFileSync(HTML_IN, "utf8");
  const mark = '"vault":';
  const at = src.indexOf(mark, src.indexOf("window.VAULT_DATA"));
  if (at < 0) throw new Error("could not label the page");
  let i = at + mark.length, j = i + 1;
  while (j < src.length) { if (src[j] === "\\") j += 2; else if (src[j] === '"') break; else j++; }
  writeFileSync(html, src.slice(0, i) + JSON.stringify(LABEL) + src.slice(j + 1));
}

function findChrome() {
  const g = [process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
             process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
             process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe"];
  for (const c of g) if (c && existsSync(c)) return c;
  throw new Error("Chrome not found");
}
const PORT = await new Promise((res, rej) => import("node:net").then(({ createServer }) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
  s.on("error", rej);
}));
const profile = mkdtempSync(join(tmpdir(), "vg-186-bprof-"));
const chrome = spawn(findChrome(), [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
  "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1200,1000",
  pathToFileURL(html).href + "?rest",
], { stdio: "ignore" });

const TABLE = `(function () {
  var plan = __vg.buildWedgePlan(true, function (id) { return __vg.alpha[id] || 0; });
  var gl = __vg.geomLock;
  var rows = {}, wTot = { i: 0, o: 0 };
  if (plan) plan.cells.forEach(function (c) {
    var bk = c.inner ? "i" : "o";
    var r = rows[c.g] || (rows[c.g] = { g: c.g, band: bk, cells: 0, n: 0, w: 0, rows: c.rows, deg: 0 });
    r.cells++; r.n += c.list.length; r.w += c.wsum; r.deg += c.band * 180 / Math.PI;
    wTot[bk] += c.wsum;
  });
  var sizes = [], wl = [];
  __vg.graph.forEachNode(function (id, a) { sizes.push(a.size); wl.push(1); });
  var mean = function (v) { return v.length ? v.reduce(function (x, y) { return x + y; }, 0) / v.length : 0; };
  return { dim: __vg.state.dim,
           plan: plan ? { r0: plan.r0, rOuter: plan.rOuter, maxR: plan.maxR, sp: plan.sp,
                          spInner: plan.spInner, rows: plan.rows, total: plan.total } : null,
           lock: gl ? { r0: gl.r0, rOuter: gl.rOuter, maxR: gl.maxR, rows: gl.rows } : null,
           wTot: wTot,
           link: { mean: mean(wl), min: Math.min.apply(null, wl), max: Math.max.apply(null, wl),
                   sizeMean: mean(sizes) },
           groups: Object.keys(rows).map(function (g) { return rows[g]; }) };
})()`;

let page = null;
try {
  for (let i = 0; i < 80 && !page; i++) { await sleep(300); try { page = await attach(PORT, "page.html"); } catch { } }
  if (!page) throw new Error("could not attach");
  page.j = async (e) => JSON.parse(await page.eval("JSON.stringify(" + e + ")"));
  for (let i = 0; i < 120; i++) {
    if (await page.eval("!!(window.__vg && __vg.renderer && __vg.state.until === null)").catch(() => false)) break;
    await sleep(250);
  }
  const settle = async () => {
    for (let i = 0; i < 300; i++) {
      if (!(await page.eval("!!(window.__vg && __vg.demo && __vg.demo.busy())").catch(() => true))) { await sleep(250); return; }
      await sleep(100);
    }
  };
  await settle();
  const out = { label: LABEL, dims: {} };
  for (const d of DIMS) {
    const w = await page.j(`__vg.demo.where("dim", ${JSON.stringify(d)})`);
    if (w) {
      await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 1 });
      await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 0 });
      await sleep(400); await settle();
      await page.eval("__vg.relayout(); void 0"); await sleep(300); await settle();
    }
    out.dims[d] = await page.j(TABLE);
  }
  for (const [d, t] of Object.entries(out.dims)) {
    if (!t || !t.plan) { console.log(`\n== ${LABEL} / ${d}: no plan`); continue; }
    console.log(`\n== ${LABEL} / ${d}   link weight mean ${t.link.mean.toFixed(3)} (${t.link.min.toFixed(3)}..${t.link.max.toFixed(3)}), size mean ${t.link.sizeMean.toFixed(3)}`);
    console.log(`   r0 ${Math.round(t.plan.r0)} rOuter ${Math.round(t.plan.rOuter)} maxR ${Math.round(t.plan.maxR)}` +
                `  rows i${t.plan.rows.i}/o${t.plan.rows.o}  pitch i${t.plan.spInner.toFixed(3)}/o${t.plan.sp.toFixed(3)}` +
                `  weight i${t.wTot.i.toFixed(1)}/o${t.wTot.o.toFixed(1)}`);
    const gs = t.groups.slice().sort((a, b) => (a.band === b.band ? b.w - a.w : (a.band === "i" ? -1 : 1)));
    for (const g of gs) {
      console.log(`   ${g.band}  ${g.g.slice(0, 26).padEnd(28)} ${String(g.cells).padStart(2)} cells ` +
                  `${String(g.n).padStart(5)} notes  w ${g.w.toFixed(1).padStart(8)}  arc ${g.deg.toFixed(2).padStart(7)} deg`);
    }
  }
  if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(out, null, 2)); console.log(`\nwrote ${JSON_OUT}`); }
  if (page.errors.length) console.log("PAGE ERRORS: " + page.errors.map((e) => e.text).join(" | "));
} finally {
  try { if (page) await page.send("Browser.close"); } catch { }
  try { chrome.kill(); } catch { }
}
