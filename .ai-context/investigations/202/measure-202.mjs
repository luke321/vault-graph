// github#202 -- every variant on every fixture, at rest, headless at the tuned viewport.
//   node .ai-context/investigations/202/measure-202.mjs --out <dir> [--only demo-vault] [--variants base,curve:0.5] [--write]
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { attach } from "../../../scripts/cdp.mjs";
import { fixtureDigest, fixtureStore } from "../../../scripts/suite-stamp.mjs";
import { patch } from "./variants-202.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = resolve(arg("out", mkdtempSync(join(tmpdir(), "vg-202-"))));
const W = 1584, H = 961;
const LABEL = "vault-graph-202-dot-half-room";
const VARIANTS = arg("variants", "base,curve:0.5,curve:0.35,edge,share:0.6,share:0.45").split(",").map((s) => {
  const [v, p] = s.split(":");
  return { v, p: p === undefined ? undefined : Number(p), key: s };
});
const FIXTURES = [
  ["demo-vault", ["--end", "2026-09-22"]],
  ["test-vault", ["--notes", "10000", "--years", "10", "--end", "2026-08-28"]],
  ["shape-vault", []],
  ["tag-vault", ["--end", "2026-09-09"], ["make-tag-vault.mjs"]],
  ["spec-vault", ["--end", "2026-09-08"], ["make-spec-vault.mjs"]],
].filter(([n]) => !arg("only", "") || arg("only", "").split(",").includes(n));

const chromePath = () => [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
  .filter(Boolean).map((b) => join(b, "Google", "Chrome", "Application", "chrome.exe")).find(existsSync);
const freePort = () => new Promise((res, rej) => import("node:net").then(({ createServer }) => {
  const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); s.on("error", rej);
}));

const MEASURE = `(function () {
  var R = __vg.renderer, G = __vg.graph, ns = [], groups = {};
  var cv = R.getCanvases(), st = cv[Object.keys(cv)[0]].getBoundingClientRect();
  G.forEachNode(function (id, at) {
    var d = R.getNodeDisplayData(id);
    if (!d || d.hidden || (__vg.alpha[id] || 0) < 0.999) return;
    var w = __vg.dotWhy(id);
    var vp = R.framedGraphToViewport ? R.framedGraphToViewport({ x: d.x, y: d.y }) : R.graphToViewport({ x: at.x, y: at.y });
    var g = __vg.groupOf(id);
    groups[g] = (groups[g] || 0) + 1;
    ns.push({ id: id, g: g, band: w.band, deg: at.deg || 0, out: w.out, ceil: w.ceil, lo: w.floorPx,
              ramp: w.rampV, px: R.scaleSize(d.size), x: vp.x + st.left, y: vp.y + st.top });
  });
  return { ns: ns, groups: groups, floor: ns.length ? ns[0].lo : null };
})()`;

const q = (v, f) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : null; };
const med = (v) => q(v, 0.5);
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const r3 = (n) => n === null || n === undefined || !isFinite(n) ? null : Math.round(n * 1000) / 1000;
function pearson(xs, ys) {
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}
function ranks(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), out = new Array(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) out[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return out;
}
function overlaps(ns) {
  const cell = 16, grid = new Map();
  ns.forEach((n, i) => { const k = Math.floor(n.x / cell) + "," + Math.floor(n.y / cell); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  let over = 0, near = 0;
  ns.forEach((a, i) => {
    const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of grid.get((cx + dx) + "," + (cy + dy)) || []) {
        if (j <= i) continue;
        const b = ns[j], gap = Math.hypot(a.x - b.x, a.y - b.y) - a.px - b.px;
        if (gap < 0) over++; else if (gap < 0.5) near++;
      }
    }
  });
  return { over, near };
}
function inversions(ns, groups) {
  const by = new Map();
  for (const n of ns) if (n.deg > 0) (by.get(n.g + "|" + n.band) || by.set(n.g + "|" + n.band, []).get(n.g + "|" + n.band)).push(n);
  let pairs = 0, inv = 0, smallPairs = 0, smallInv = 0;
  for (const [, v] of by) {
    const small = groups[v[0].g] <= 3;
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      const a = v[i], b = v[j];
      if (a.deg === b.deg) continue;
      const hi = a.deg > b.deg ? a : b, lo = a.deg > b.deg ? b : a;
      pairs++; if (small) smallPairs++;
      if (hi.out < lo.out - 0.05) { inv++; if (small) smallInv++; }
    }
  }
  return { inv: r3(pairs ? inv / pairs : 0), invSmall: smallPairs ? `${smallInv}/${smallPairs}` : "-" };
}
function summarise(r) {
  const out = { notes: r.ns.length, floorPx: r3(r.floor), bands: {} };
  for (const band of ["o", "i"]) {
    const v = r.ns.filter((n) => n.band === band);
    if (!v.length) continue;
    const linked = v.filter((n) => n.deg > 0);
    const byDeg = linked.slice().sort((a, b) => a.deg - b.deg);
    const lo = byDeg.slice(0, Math.max(1, Math.floor(byDeg.length * 0.1)));
    const hi = byDeg.slice(Math.floor(byDeg.length * 0.9));
    const narrow = v.filter((n) => r.groups[n.g] <= 3), wide = v.filter((n) => r.groups[n.g] > 3);
    out.bands[band] = {
      n: v.length, capPx: r3(med(v.map((n) => n.ceil))), dotPx: r3(med(v.map((n) => n.out))),
      dotOverCap: r3(med(v.map((n) => n.out / n.ceil))), ramp: r3(med(v.map((n) => n.ramp))),
      atLeast80: r3(v.filter((n) => n.out >= 0.8 * n.ceil).length / v.length),
      pearson: linked.length > 8 ? r3(pearson(linked.map((n) => n.deg), linked.map((n) => n.out))) : null,
      spearman: linked.length > 8 ? r3(pearson(ranks(linked.map((n) => n.deg)), ranks(linked.map((n) => n.out)))) : null,
      decileRatio: lo.length && hi.length ? r3(mean(hi.map((n) => n.out)) / mean(lo.map((n) => n.out))) : null,
      narrow: narrow.length ? { n: narrow.length, dotPx: r3(med(narrow.map((n) => n.out))), restPx: r3(med(wide.map((n) => n.out))) } : null,
    };
  }
  Object.assign(out, overlaps(r.ns));
  Object.assign(out, inversions(r.ns, r.groups));
  return out;
}

async function run(fixture, html, variant, shots) {
  const dir = mkdtempSync(join(tmpdir(), "vg-202-run-"));
  const file = join(dir, "page.html");
  writeFileSync(file, html);
  const PORT = await freePort();
  const chrome = spawn(chromePath(), ["--headless=new", `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(dir, "prof")}`, "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
  let page = null;
  try {
    for (let i = 0; i < 80 && !page; i++) { await sleep(250); try { page = await attach(PORT, ""); } catch { } }
    if (!page) throw new Error("could not attach");
    page.j = async (e) => JSON.parse(await page.eval("JSON.stringify(" + e + ")"));
    await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await page.send("Page.enable");
    await page.send("Page.navigate", { url: pathToFileURL(file).href + "?rest" });
    for (let i = 0; i < 200; i++) {
      if (await page.eval("!!(window.__vg && __vg.renderer && __vg.state.until === null)").catch(() => false)) break;
      await sleep(150);
    }
    for (let i = 0; i < 300; i++) { if (!(await page.eval("!!(__vg.demo && __vg.demo.busy())").catch(() => true))) break; await sleep(100); }
    await sleep(800);
    await page.eval("__vg.renderer.refresh(); void 0");
    await sleep(500);
    const raw = await page.j(MEASURE);
    if (page.errors.length) console.log("  page errors: " + page.errors.map((e) => e.text).join(" | ").slice(0, 300));
    const sum = summarise(raw);
    if (shots) {
      const full = await page.send("Page.captureScreenshot", { format: "webp", quality: 82 });
      writeFileSync(join(OUT, `${fixture}-${variant}-full.webp`), Buffer.from(full.data, "base64"));
      const focus = shots.focus || pickFocus(raw);
      shots.focus = focus;
      const S = 180;
      const zoom = await page.send("Page.captureScreenshot", { format: "webp", quality: 88,
        clip: { x: Math.max(0, focus.x - S / 2), y: Math.max(0, focus.y - S / 2), width: S, height: S, scale: 4 } });
      writeFileSync(join(OUT, `${fixture}-${variant}-zoom.webp`), Buffer.from(zoom.data, "base64"));
      if (shots.narrow === undefined) shots.narrow = pickNarrow(raw);
      if (shots.narrow) {
        const S2 = 120;
        const nz = await page.send("Page.captureScreenshot", { format: "webp", quality: 88,
          clip: { x: Math.max(0, shots.narrow.x - S2 / 2), y: Math.max(0, shots.narrow.y - S2 / 2), width: S2, height: S2, scale: 6 } });
        writeFileSync(join(OUT, `${fixture}-${variant}-narrow.webp`), Buffer.from(nz.data, "base64"));
      }
    }
    return sum;
  } finally {
    try { if (page) await page.send("Browser.close"); } catch { }
    try { chrome.kill(); } catch { }
  }
}
function pickNarrow(raw) {
  const by = new Map();
  for (const n of raw.ns) if (raw.groups[n.g] <= 3) (by.get(n.g) || by.set(n.g, []).get(n.g)).push(n);
  let best = null;
  for (const [g, v] of by) {
    const c = { x: Math.round(mean(v.map((n) => n.x))), y: Math.round(mean(v.map((n) => n.y))), g };
    c.n = v.length;
    if (!best || c.n > best.n) best = c;
  }
  return best;
}
function pickFocus(raw) {
  const o = raw.ns.filter((n) => n.band === "o").sort((a, b) => a.deg - b.deg || (a.id < b.id ? -1 : 1));
  const n = o[Math.floor(o.length / 2)] || raw.ns[0];
  return { x: Math.round(n.x), y: Math.round(n.y) };
}

mkdirSync(OUT, { recursive: true });
const store = fixtureStore(ROOT);
const result = { schema: 1, base: spawnSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout.trim(),
  viewport: `${W}x${H} headless ?rest`, fixtures: {} };
for (const [name, args, gens] of FIXTURES) {
  const vault = join(store, `${name}-${fixtureDigest(args, gens)}`);
  if (!existsSync(vault)) { console.log(`${name}: not in the store (${vault}) -- run smoke.mjs once to generate it`); continue; }
  const built = join(OUT, `${name}.html`);
  const b = spawnSync(process.execPath, [join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", built], { encoding: "utf8" });
  if (b.status !== 0) throw new Error("build failed: " + b.stderr);
  const base = readFileSync(built, "utf8");
  const vaultName = JSON.stringify(vault.split(/[\\/]/).pop());
  const shots = {};
  result.fixtures[name] = {};
  for (const { v, p, key } of VARIANTS) {
    const label = JSON.stringify(`${LABEL} - ${name} ${key}`);
    const html = patch(base, v, p).replace(`"vault":${vaultName}`, () => `"vault":${label}`);
    const sum = await run(name, html, key.replace(":", "-"), key === "base" || !key.includes(":") || ["curve:0.5", "share:0.6"].includes(key) ? shots : null);
    result.fixtures[name][key] = sum;
    const b2 = (k) => sum.bands[k] ? `${k} cap ${sum.bands[k].capPx} dot ${sum.bands[k].dotPx} (${sum.bands[k].dotOverCap}) rho ${sum.bands[k].spearman} dec ${sum.bands[k].decileRatio}` : "";
    console.log(`${name.padEnd(12)} ${key.padEnd(11)} ${b2("o")}  |  ${b2("i")}  | over ${sum.over} near ${sum.near} inv ${sum.inv} small ${sum.invSmall}`);
  }
}
const json = JSON.stringify(result, null, 1) + "\n";
writeFileSync(join(OUT, "measurements.json"), json);
if (argv.includes("--write")) writeFileSync(join(HERE, "measurements.json"), json);
console.log("written to " + OUT);
