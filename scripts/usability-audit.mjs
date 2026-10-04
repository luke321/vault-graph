#!/usr/bin/env node
// github#200 -- see .ai-context/usability-thresholds.md
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { attach } from "./cdp.mjs";
import { findChrome } from "./chrome.mjs";
import { claimScreen, noFreeScreen, release } from "./harness-hook.mjs";
import { harnessScreen } from "./screen.mjs";
import {
  PROFILES, SOURCES, T, arcmin, contrast, mmPerPx, nearest, noticeable, over, parseColour, simulate, spacingPass,
} from "./usability-thresholds.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const argv = process.argv.slice(2);
const arg = (k, d = "") => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const flag = (k) => argv.includes("--" + k);
const list = (k, d) => arg(k, d).split(",").map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FIXTURES = list("fixtures", "demo-vault,test-vault,shape-vault,spec-vault,tag-vault");
const PROFILE_NAMES = list("profiles", Object.keys(PROFILES).join(","));
const THEMES = list("themes", "dark,light");
const HEADED = flag("headed");
const OWNER = "usability-audit [" + process.pid + "]";

for (const p of PROFILE_NAMES) if (!PROFILES[p]) throw new Error("unknown profile " + p + " -- known: " + Object.keys(PROFILES).join(", "));

function fixtureStore() {
  const g = spawnSync("git", ["-C", ROOT, "rev-parse", "--git-common-dir"], { encoding: "utf8" });
  if (g.status === 0 && g.stdout.trim()) {
    const common = g.stdout.trim();
    const abs = /^[A-Za-z]:[\\/]|^\//.test(common) ? common : join(ROOT, common);
    return join(dirname(abs), ".fixtures");
  }
  return join(ROOT, ".fixtures");
}

function fixtureVault(want) {
  const dir = fixtureStore();
  if (!existsSync(dir)) return "";
  const hit = readdirSync(dir).find((d) => d.startsWith(want + "-"));
  return hit ? join(dir, hit) : "";
}

function branchName() {
  const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  return (r.stdout || "").trim().replace(/^.*\//, "") || "detached";
}

/** @param {string} vault @param {string} label */
function build(vault, label) {
  const out = join(mkdtempSync(join(tmpdir(), "vg-usability-")), "vault-graph.html");
  const b = spawnSync(process.execPath, [join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", out], { encoding: "utf8" });
  if (b.status !== 0) throw new Error("build-graph.mjs failed:\n" + (b.stderr || b.stdout));
  const src = readFileSync(out, "utf8");
  const labelled = src.replace(/(window\.VAULT_DATA=\{[\s\S]*?"vault":)("(?:\\.|[^"\\])*")/, (_m, head) => head + JSON.stringify(label));
  writeFileSync(out, labelled);
  return out;
}

const freePort = () => new Promise((res, rej) => {
  const srv = createServer();
  srv.on("error", rej);
  srv.listen(0, "127.0.0.1", () => { const port = /** @type {import("node:net").AddressInfo} */ (srv.address()).port; srv.close(() => res(port)); });
});

// github#200 -- the page's own pick and gesture constants, read from source
function pageConstants() {
  const ren = readFileSync(join(ROOT, "src", "engine", "renderer.ts"), "utf8");
  const cap = readFileSync(join(ROOT, "src", "engine", "captor.ts"), "utf8");
  const page = readFileSync(join(ROOT, "src", "page.js"), "utf8");
  const num = (src, name) => { const m = new RegExp("\\b" + name + "\\s*[=:]\\s*([0-9.]+)").exec(src); return m ? Number(m[1]) : null; };
  return {
    pickFloor: num(ren, "PICK_FLOOR_PX"), touchPickFloor: num(ren, "TOUCH_PICK_FLOOR_PX"),
    tapSlop: num(cap, "TOUCH_TAP_SLOP_PX"), doubleTapPx: num(cap, "TOUCH_DOUBLE_TAP_PX"),
    doubleClickMs: num(cap, "DOUBLE_CLICK_TIMEOUT"), dragTolerance: num(cap, "DRAGGED_EVENTS_TOLERANCE"),
    labelSize: num(page, "labelSize"), minCameraRatio: num(page, "minCameraRatio"),
  };
}

// github#200 -- runs in the page; returns plain data
/** @param {{ titles: boolean }} o */
function pageProbe(o) {
  const w = /** @type {any} */ (globalThis), doc = w.document, vg = w.__vg;
  const root = doc.querySelector(".vault-graph");
  const cs = (el) => w.getComputedStyle(el);
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    for (let e = el; e && e !== doc.documentElement; e = e.parentElement) {
      const s = cs(e);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const opacityChain = (el) => { let a = 1; for (let e = el; e; e = e.parentElement) a *= Number(cs(e).opacity); return a; };
  const bgChain = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const s = cs(e); layers.push({ bg: s.backgroundColor, img: s.backgroundImage !== "none" }); }
    return layers;
  };
  const rootCs = cs(root);
  const surface = rootCs.getPropertyValue("--surface-1").trim();
  const text1 = rootCs.getPropertyValue("--text-1").trim();
  const out = { vw: w.innerWidth, vh: w.innerHeight,
    coarse: w.matchMedia("(pointer: coarse)").matches, hoverNone: w.matchMedia("(hover: none)").matches,
    phone: !!vg.phone, bandOpen: !!vg.bandOpen, surface, text1, theme: root.getAttribute("data-theme"),
    dots: [], rings: vg.rings ? vg.rings() : null, ratio: vg.renderer.getCamera().ratio,
    controls: [], texts: [], titles: [], hoverRules: [], cam: [] };

  const R = vg.renderer, G = vg.graph;
  const gb = doc.getElementById("vg-graph").getBoundingClientRect();
  G.forEachNode((id, at) => {
    const d = R.getNodeDisplayData(id);
    if (!d || d.hidden) return;
    if ((vg.alpha[id] === undefined ? 1 : vg.alpha[id]) < 0.35) return;
    const v = R.graphToViewport(at);
    const x = v.x + gb.left, y = v.y + gb.top;
    if (x < gb.left || x > gb.right || y < gb.top || y > gb.bottom) return;
    out.dots.push({ x, y, r: R.scaleSize(d.size), rad: Math.hypot(at.x, at.y), g: vg.groupOf(id), c: d.color });
  });

  const SEL = "button, a[href], input, select, textarea, summary, [role=button], [role=checkbox], [role=tab], [tabindex]:not([tabindex='-1']), .lg .eye, .lg .only";
  root.querySelectorAll(SEL).forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const owner = el.id || (el.closest("[id]") ? el.closest("[id]").id : "");
    const cls = typeof el.className === "string" ? el.className.split(" ")[0] : "";
    out.controls.push({ name: (el.id ? "#" + el.id : owner + " " + el.tagName.toLowerCase() + (cls ? "." + cls : "")).trim(),
      x: r.left, y: r.top, w: r.width, h: r.height,
      label: (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().slice(0, 40) });
  });

  const walker = doc.createTreeWalker(root, 4);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.nodeValue.trim()) continue;
    seen.add(el);
    if (!visible(el) || el.closest("svg, canvas, script, style")) continue;
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    const s = cs(el);
    const off = el.closest("[disabled], [aria-disabled='true']");
    out.texts.push({ tag: el.tagName.toLowerCase(), cls: typeof el.className === "string" ? el.className.split(" ")[0] : "",
      disabled: !!off,
      owner: el.id || (el.closest("[id]") ? el.closest("[id]").id : ""),
      size: parseFloat(s.fontSize), weight: Number(s.fontWeight) || 400, color: s.color,
      opacity: opacityChain(el), bgs: bgChain(el), sample: n.nodeValue.trim().slice(0, 24) });
  }

  if (o.titles) {
    root.querySelectorAll("[title]").forEach((el) => {
      if (!visible(el)) return;
      const t = el.getAttribute("title").trim();
      if (!t) return;
      const txt = (el.innerText || "").replace(/\s+/g, " ").trim();
      const aria = (el.getAttribute("aria-label") || "").trim();
      const clipped = el.scrollWidth > el.clientWidth + 1 && cs(el).textOverflow === "ellipsis";
      out.titles.push({ owner: el.id || (el.closest("[id]") ? el.closest("[id]").id : ""), tag: el.tagName.toLowerCase(),
        cls: typeof el.className === "string" ? el.className.split(" ")[0] : "",
        title: t.slice(0, 60), extra: t !== txt && t !== aria && !txt.includes(t), clipped,
        iconOnly: !aria && !/[A-Za-z0-9]/.test(txt) });
    });
    const HIDE = /^(display|visibility|opacity|max-height|clip-path)$/;
    const faint = (el, props) => {
      const s = cs(el);
      if (s.display === "none") return props.includes("display");
      if (s.visibility === "hidden") return props.includes("visibility");
      return opacityChain(el) < 0.15 && props.includes("opacity");
    };
    const walk = (rules, media) => {
      for (const r of Array.from(rules)) {
        if (r.cssRules && r.media) { walk(r.cssRules, r.media.mediaText); continue; }
        if (!r.selectorText || !r.selectorText.includes(":hover")) continue;
        const props = Array.from(r.style).filter((p) => HIDE.test(p));
        if (!props.length) continue;
        let hidden = 0, total = 0;
        for (const one of r.selectorText.split(",")) {
          if (!one.includes(":hover")) continue;
          let els = [];
          try { els = Array.from(doc.querySelectorAll(one.replace(/:hover/g, ""))); } catch (e) { void e; }
          for (const el of els) { if (!el.parentElement || !el.parentElement.getClientRects().length) continue; total++; if (faint(el, props)) hidden++; }
        }
        out.hoverRules.push({ sel: r.selectorText, props: props.map((p) => p + ": " + r.style.getPropertyValue(p)).join("; "), media: media || "",
          hidden, total, focusInList: /:focus/.test(r.selectorText) });
      }
    };
    for (const sh of Array.from(doc.styleSheets)) { try { walk(sh.cssRules, ""); } catch (e) { void e; } }
    out.focusSelectors = [];
    for (const sh of Array.from(doc.styleSheets)) {
      try {
        const grab = (rules) => { for (const r of Array.from(rules)) { if (r.cssRules) grab(r.cssRules); else if (r.selectorText && /:focus/.test(r.selectorText)) out.focusSelectors.push(r.selectorText); } };
        grab(sh.cssRules);
      } catch (e) { void e; }
    }
    doc.querySelectorAll("#vg-cam button").forEach((b) => out.cam.push((b.getAttribute("title") || b.getAttribute("aria-label") || b.textContent || "").trim()));
  }
  return out;
}

/** @param {any} t @param {number[]} surf */
function textColours(t, surf) {
  let under = surf.slice(0, 3).concat(1);
  let img = false;
  for (let i = t.bgs.length - 1; i >= 0; i--) {
    const c = parseColour(t.bgs[i].bg);
    if (t.bgs[i].img) img = true;
    if (c && c[3] > 0) under = over(c, under);
  }
  const fg = parseColour(t.color) || [0, 0, 0, 1];
  const top = over([fg[0], fg[1], fg[2], fg[3] * t.opacity], under);
  return { ratio: contrast(top, under), img };
}

const pct = (n, d) => d ? Math.round(1000 * n / d) / 10 : 0;
const q = (arr, f) => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * f))]; };
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/** @param {any[]} dots @param {any} prof @param {ReturnType<typeof pageConstants>} k */
function dotStats(dots, prof, k) {
  const mm = mmPerPx(prof);
  const nn = nearest(dots);
  const floor = prof.coarse ? k.touchPickFloor : k.pickFloor;
  const rows = dots.map((d, i) => {
    const diam = 2 * d.r;
    const eff = Math.min(Math.max(diam, 2 * floor), nn[i]);
    return { ...d, diam, nn: nn[i], eff, am: arcmin(diam * mm, prof.cm),
      fail258: diam < T.targetMin.px && nn[i] < T.targetMin.px };
  });
  const sum = (rs) => ({
    n: rs.length,
    diamPx: { p10: r2(q(rs.map((r) => r.diam), 0.1)), p50: r2(q(rs.map((r) => r.diam), 0.5)), p90: r2(q(rs.map((r) => r.diam), 0.9)) },
    diamArcmin: r1(q(rs.map((r) => r.am), 0.5)),
    spacingPx: r1(q(rs.map((r) => r.nn), 0.5)),
    under1: pct(rs.filter((r) => r.am < T.acuity.arcmin).length, rs.length),
    under5: pct(rs.filter((r) => r.am < T.optotype.arcmin).length, rs.length),
    under16: pct(rs.filter((r) => r.am < T.symbolMin.arcmin).length, rs.length),
    under20: pct(rs.filter((r) => r.am < T.symbolGood.arcmin).length, rs.length),
    fail258: pct(rs.filter((r) => r.fail258).length, rs.length),
    effUnder7: prof.coarse ? pct(rs.filter((r) => r.eff * mm < T.hooberCentre.mm).length, rs.length) : null,
    effUnder92: prof.coarse ? pct(rs.filter((r) => r.eff * mm < T.parhi.mm).length, rs.length) : null,
    effMm: r2(q(rs.map((r) => r.eff * mm), 0.5)),
  });
  return { rows, all: sum(rows), sum };
}

/** @param {any} probe @param {any[]} rows @param {any} sum */
function byRingBand(probe, rows, sum) {
  const rg = probe.rings;
  const split = rg ? rg.rInnerOuter : Infinity;
  const out = {};
  for (const [ring, rs] of [["inner", rows.filter((r) => r.rad <= split)], ["outer", rows.filter((r) => r.rad > split)]]) {
    if (!rs.length) continue;
    const lo = Math.min(...rs.map((r) => r.rad)), hi = Math.max(...rs.map((r) => r.rad));
    const bands = [0, 1, 2, 3].map((b) => rs.filter((r) => Math.min(3, Math.floor(4 * (r.rad - lo) / ((hi - lo) || 1))) === b));
    out[ring] = { all: sum(rs), bands: bands.map((b) => sum(b)) };
  }
  return out;
}

/** @param {any[]} dots */
function groupTints(dots) {
  const by = new Map();
  for (const d of dots) {
    if (!by.has(d.g)) by.set(d.g, new Map());
    const m = by.get(d.g);
    m.set(d.c, (m.get(d.c) || 0) + 1);
  }
  const out = [];
  for (const [g, m] of by) {
    let best = null, n = 0, tot = 0;
    for (const [c, k] of m) { tot += k; if (k > n) { n = k; best = c; } }
    out.push({ g, c: best, n: tot });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** @param {{ g: string, c: string }[]} tints @param {number[]} surf @param {number} deg */
function colourStats(tints, surf, deg) {
  const rgb = tints.map((t) => ({ g: t.g, rgb: (parseColour(t.c) || [0, 0, 0, 1]).slice(0, 3) }));
  const lowContrast = rgb.map((t) => ({ g: t.g, ratio: r2(contrast(t.rgb, surf)) })).filter((t) => t.ratio < T.uiContrast.ratio);
  const shared = new Set();
  for (let i = 0; i < rgb.length; i++) for (let j = i + 1; j < rgb.length; j++) {
    if (rgb[i].rgb.every((v, n) => Math.abs(v - rgb[j].rgb[n]) < 0.5)) shared.add(rgb[i].g + "\u0000" + rgb[j].g);
  }
  const vision = {};
  for (const kind of ["normal", "protan", "deutan", "tritan"]) {
    const sim = rgb.map((t) => ({ g: t.g, rgb: kind === "normal" ? t.rgb : simulate(t.rgb, /** @type {any} */ (kind)) }));
    const pairs = [];
    for (let i = 0; i < sim.length; i++) for (let j = i + 1; j < sim.length; j++) {
      pairs.push({ a: sim[i].g, b: sim[j].g, nd: noticeable(sim[i].rgb, sim[j].rgb, deg) });
    }
    pairs.sort((x, y) => x.nd - y.nd);
    const distinct = pairs.filter((p) => !shared.has(p.a + "\u0000" + p.b));
    const floorDeg = Math.max(deg, T.colourSizeFloor.deg);
    vision[kind] = { pairs: distinct.length, under: distinct.filter((p) => p.nd < 1).length,
      underAtFloor: distinct.filter((p) => noticeable(sim.find((s) => s.g === p.a).rgb, sim.find((s) => s.g === p.b).rgb, floorDeg) < 1).length,
      worst: distinct.slice(0, 3).map((p) => ({ a: p.a, b: p.b, nd: r2(p.nd) })) };
  }
  return { groups: rgb.length, sharedPairs: shared.size, lowContrast, vision, deg: r2(deg), extrapolated: deg < T.colourSizeFloor.deg };
}

/** @param {any[]} texts @param {number[]} surf @param {any} prof */
function textStats(texts, surf, prof) {
  const mm = mmPerPx(prof);
  const rows = new Map();
  for (const t of texts) {
    const { ratio, img } = textColours(t, surf);
    const large = t.size >= 24 || (t.size >= 18.66 && t.weight >= 700);
    const need = large ? T.textContrast.large : T.textContrast.ratio;
    const cap = arcmin(0.7 * t.size * mm, prof.cm);
    const key = [t.owner, t.tag + (t.cls ? "." + t.cls : ""), t.size, r2(ratio)].join("|");
    const row = rows.get(key) || { where: (t.owner ? "#" + t.owner + " " : "") + t.tag + (t.cls ? "." + t.cls : ""), size: t.size, weight: t.weight,
      ratio: r2(ratio), need, pass: ratio >= need || t.disabled, disabled: t.disabled, cap: r1(cap), img, n: 0, sample: t.sample };
    row.n++;
    rows.set(key, row);
  }
  const all = Array.from(rows.values());
  return { styles: all.length, elements: texts.length,
    contrastFails: all.filter((r) => !r.pass && !r.img).sort((a, b) => a.ratio - b.ratio),
    tooSmall: all.filter((r) => r.cap < T.symbolMin.arcmin).sort((a, b) => a.cap - b.cap),
    minSize: Math.min(...all.map((r) => r.size)) };
}

/** @param {any[]} controls @param {any} prof */
function controlStats(controls, prof) {
  const mm = mmPerPx(prof);
  const ok = spacingPass(controls);
  const rows = controls.map((c, i) => ({ ...c, w: r1(c.w), h: r1(c.h), pass258: ok[i], min: Math.min(c.w, c.h) }));
  return { n: rows.length,
    fail258: rows.filter((r) => !r.pass258),
    under44: pct(rows.filter((r) => r.min < T.targetEnhanced.px).length, rows.length),
    under48: pct(rows.filter((r) => r.min < T.material.px).length, rows.length),
    underMs: prof.coarse ? pct(rows.filter((r) => r.min * mm < T.microsoft.mm).length, rows.length) : null,
    underParhi: prof.coarse ? pct(rows.filter((r) => r.min * mm < T.parhi.mm).length, rows.length) : null,
    smallest: rows.slice().sort((a, b) => a.min - b.min).slice(0, 5).map((r) => ({ name: r.name, w: r.w, h: r.h, label: r.label })) };
}

async function audit(page, url, prof, k, fixture) {
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: !!prof.coarse, maxTouchPoints: prof.coarse ? 5 : 1 });
  await page.send("Emulation.setDeviceMetricsOverride", { width: prof.w, height: prof.h, deviceScaleFactor: prof.dpr, mobile: !!prof.coarse });
  await page.eval("(function(){ try { localStorage.clear(); } catch (e) { void e; } })(); void 0").catch(() => {});
  await page.send("Page.navigate", { url: url + "?rest" });
  await sleep(600);
  for (let i = 0; i < 200; i++) {
    if (await page.eval("!!(window.__vg && __vg.renderer && __vg.graph && __vg.demo && !__vg.demo.busy())").catch(() => false)) break;
    await sleep(150);
  }
  await sleep(500);
  const themed = {};
  let geo = null;
  for (const theme of THEMES) {
    await page.eval(`(function(){ var el = document.querySelector(".vault-graph"); el.setAttribute("data-theme", ${JSON.stringify(theme)});
      __vg.readTheme(); __vg.renderer.refresh(); })(); void 0`);
    await sleep(400);
    const probe = await page.eval(`(${pageProbe.toString()})(${JSON.stringify({ titles: !geo })})`);
    if (!geo && arg("shots")) {
      const shot = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
      writeFileSync(join(resolve(arg("shots")), `${fixture}-${prof.name}-${theme}.jpg`), Buffer.from(shot.data, "base64"));
    }
    if (!geo) geo = probe;
    const surf = (parseColour(probe.surface) || [0, 0, 0, 1]).slice(0, 3);
    themed[theme] = { probe, surf };
  }
  const ds = dotStats(geo.dots, prof, k);
  const medDeg = arcmin(ds.all.diamPx.p50 * mmPerPx(prof), prof.cm) / 60;
  const res = { fixture, profile: prof.name, viewport: geo.vw + "x" + geo.vh, coarse: geo.coarse, hoverNone: geo.hoverNone,
    phone: geo.phone, bandOpen: geo.bandOpen, dots: ds.all, rings: byRingBand(geo, ds.rows, ds.sum),
    zoomFor24: ds.all.spacingPx ? r1(T.targetMin.px / ds.all.spacingPx) : null,
    maxZoom: k.minCameraRatio ? r1(geo.ratio / k.minCameraRatio) : null,
    controls: controlStats(geo.controls, prof), themes: {},
    hover: { titleExtra: geo.titles.filter((t) => t.extra), titleClipped: geo.titles.filter((t) => t.clipped), rules: geo.hoverRules,
      focusSelectors: geo.focusSelectors, cam: geo.cam } };
  for (const theme of THEMES) {
    const { probe, surf } = themed[theme];
    const tints = groupTints(probe.dots);
    const label = parseColour(probe.text1);
    res.themes[theme] = { surface: probe.surface, text: textStats(probe.texts, surf, prof),
      canvasLabel: label ? { size: k.labelSize, ratio: r2(contrast(label.slice(0, 3), surf)),
        cap: r1(arcmin(0.7 * (k.labelSize || 11) * mmPerPx(prof), prof.cm)) } : null,
      colour: colourStats(tints, surf, medDeg) };
  }
  return res;
}

/** @param {any[]} results @param {ReturnType<typeof pageConstants>} k */
function findings(results, k) {
  const f = [];
  const add = (sev, text) => { if (!f.some((x) => x.text === text)) f.push({ sev, text }); };
  for (const r of results) {
    const tag = r.fixture + " @ " + r.profile;
    if (r.dots.fail258 > 0) add("WCAG 2.5.8 (dots)", `${tag}: ${r.dots.fail258}% of ${r.dots.n} dots are under 24 px with a neighbour closer than 24 px (median spacing ${r.dots.spacingPx} px; ${r.zoomFor24}x zoom reaches 24 px, the camera allows ${r.maxZoom}x)`);
    if (r.dots.under5 > 0) add("perception", `${tag}: ${r.dots.under5}% of dots are below 5 arcmin (the 20/20 letter), ${r.dots.under1}% below 1 arcmin (unresolvable); median dot ${r.dots.diamArcmin} arcmin`);
    if (r.coarse && r.dots.effUnder7 > 0) add("touch", `${tag}: ${r.dots.effUnder7}% of dots have an effective tap width under 7 mm (Hoober), ${r.dots.effUnder92}% under 9.2 mm (Parhi); median ${r.dots.effMm} mm`);
    const failed = new Map();
    for (const c of r.controls.fail258) {
      const key = c.name + " " + Math.round(c.w) + "x" + Math.round(c.h);
      failed.set(key, (failed.get(key) || 0) + 1);
    }
    for (const [key, n] of failed) add("WCAG 2.5.8 (controls)", `${r.profile}: ${key} px${n > 1 ? " (x" + n + ")" : ""} has no clear 24 px circle`);
    if (r.coarse && r.controls.under44 > 0) add("touch", `${r.profile}: ${r.controls.under44}% of ${r.controls.n} controls are under 44 px (Apple / WCAG 2.5.5), ${r.controls.under48}% under 48 dp (Material), ${r.controls.underParhi}% under 9.2 mm (Parhi)`);
    const first = Object.values(r.themes)[0];
    if (first) {
      const small = first.text.tooSmall;
      if (small.length) add("legibility", `${r.profile}: ${small.length} of ${first.text.styles} text styles have a cap height under HFES's 16 arcmin (${Math.min(...small.map((x) => x.size))}-${Math.max(...small.map((x) => x.size))} px, ${Math.min(...small.map((x) => x.cap))}-${Math.max(...small.map((x) => x.cap))} arcmin at ${PROFILES[r.profile] ? PROFILES[r.profile].cm : "?"} cm)`);
      if (first.canvasLabel && first.canvasLabel.cap < T.symbolMin.arcmin) add("legibility", `${r.profile}: the canvas label (${first.canvasLabel.size} px) has a ${first.canvasLabel.cap} arcmin cap height`);
    }
    for (const [theme, t] of Object.entries(r.themes)) {
      for (const x of t.text.contrastFails) add("WCAG 1.4.3", `${theme}: ${x.where} "${x.sample}" ${x.size}px at ${x.ratio}:1, needs ${x.need}:1`);
      if (t.canvasLabel && t.canvasLabel.ratio < T.textContrast.ratio) add("WCAG 1.4.3", `${theme}: the canvas label (${t.canvasLabel.size}px) is ${t.canvasLabel.ratio}:1`);
      for (const x of t.colour.lowContrast) add("WCAG 1.4.11", `${r.fixture}/${theme}: the tint for "${x.g}" is ${x.ratio}:1 on the surface, under 3:1`);
      if (t.colour.sharedPairs) add("colour", `${r.fixture}/${theme}: ${t.colour.sharedPairs} pair(s) of groups share one tint (${t.colour.groups} groups drawn)`);
      for (const [kind, v] of Object.entries(t.colour.vision)) {
        if (v.under) add("colour", `${tag}/${theme}, ${kind}: ${v.under} of ${v.pairs} distinct tint pairs are under one noticeable difference at the median dot (${t.colour.deg} deg${t.colour.extrapolated ? ", extrapolated" : ""}), ${v.underAtFloor} even at 1/3 deg; worst ${v.worst[0].a} vs ${v.worst[0].b} = ${v.worst[0].nd}`);
      }
    }
    if (r.coarse) {
      const kinds = new Map();
      for (const t of r.hover.titleExtra) {
        const key = (t.owner ? "#" + t.owner + " " : "") + t.tag + (t.cls ? "." + t.cls : "");
        const k2 = kinds.get(key) || { titles: [], icon: 0 };
        k2.titles.push(t.title); if (t.iconOnly) k2.icon++;
        kinds.set(key, k2);
      }
      for (const [key, v] of kinds) add("hover-only", `${r.profile}: ${key} x${v.titles.length} ${v.icon ? "has no visible text and is named only by" : "explains itself only in"} its title tooltip, e.g. "${v.titles[0]}"`);
      for (const t of r.hover.titleClipped) add("hover-only", `${r.profile}: ${t.tag}${t.cls ? "." + t.cls : ""} "${t.title}" is ellipsised; the full text is only in its title`);
    }
    for (const h of r.hover.rules) {
      if (!h.hidden) continue;
      const norm = (s) => s.trim().replace(/:focus(-visible|-within)?/g, ":hover");
      const twin = h.focusInList || h.sel.split(",").every((one) => r.hover.focusSelectors.some((f) => f.split(",").some((s) => norm(s) === one.trim())));
      add("hover-only (CSS)", `${r.profile}: ${h.sel.replace(/\.vault-graph /g, "")} { ${h.props} }${h.media ? " in @media " + h.media : ""} reveals ${h.hidden} of ${h.total} element(s) that are invisible at rest; ${twin ? "keyboard focus reveals them too, touch has neither" : "no :focus twin either"}`);
    }
  }
  const cam = results.length ? results[0].hover.cam : [];
  const has = (re) => cam.some((s) => re.test(s));
  const camList = cam.length ? cam.map((s) => '"' + s + '"').join(", ") : "nothing";
  if (!(has(/zoom in/i) && has(/zoom out/i))) add("WCAG 2.5.1", `pinch-zoom has no single-pointer alternative: the camera row holds ${camList}`);
  if (!has(/^(pan |move |scroll )?(left|right|up|down)\b/i)) add("WCAG 2.5.7", `panning is drag-only: no button moves the camera sideways (the camera row holds ${camList})`);
  if (k.tapSlop !== null && k.tapSlop > T.touchSlop.px) add("gesture", `tap slop is ${k.tapSlop} px against Android's ${T.touchSlop.px} dp: a 9-10 px wobble still taps here where Android would start a scroll`);
  if (k.doubleTapPx !== null && k.doubleTapPx < T.doubleTapSlop.px) add("gesture", `double-tap radius is ${k.doubleTapPx} px against Android's ${T.doubleTapSlop.px} dp: a second tap 25-100 px away counts as two taps here`);
  if (k.doubleClickMs !== null && k.doubleClickMs !== T.doubleTapMs.ms) add("gesture", `double-tap window is ${k.doubleClickMs} ms against Android's ${T.doubleTapMs.ms} ms`);
  return f;
}

/** @param {any[]} results @param {any[]} fs @param {ReturnType<typeof pageConstants>} k */
function markdown(results, fs, k) {
  const L = [];
  L.push("# Usability audit", "", `github#200 -- ${new Date().toISOString().slice(0, 10)} -- profiles ${PROFILE_NAMES.join(", ")}`, "");
  L.push("## Dots", "", "| fixture | profile | dots | diam p50 px | arcmin p50 | <1' | <5' | <16' | spacing p50 | 2.5.8 fail | eff mm p50 | eff <7 mm | eff <9.2 mm | zoom to 24 / max |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const d = r.dots;
    L.push(`| ${r.fixture} | ${r.profile} | ${d.n} | ${d.diamPx.p50} | ${d.diamArcmin} | ${d.under1}% | ${d.under5}% | ${d.under16}% | ${d.spacingPx} | ${d.fail258}% | ${d.effMm} | ${d.effUnder7 === null ? "-" : d.effUnder7 + "%"} | ${d.effUnder92 === null ? "-" : d.effUnder92 + "%"} | ${r.zoomFor24} / ${r.maxZoom} |`);
  }
  L.push("", "## Dots by ring and band (radial quartile, inside out)", "", "| fixture | profile | ring | band | n | diam px p50 | arcmin p50 | <5' | 2.5.8 fail | eff <7 mm |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) for (const [ring, v] of Object.entries(r.rings)) {
    v.bands.forEach((b, i) => { if (b.n) L.push(`| ${r.fixture} | ${r.profile} | ${ring} | ${i + 1} | ${b.n} | ${b.diamPx.p50} | ${b.diamArcmin} | ${b.under5}% | ${b.fail258}% | ${b.effUnder7 === null ? "-" : b.effUnder7 + "%"} |`); });
  }
  L.push("", "## Controls", "", "| fixture | profile | controls | 2.5.8 fail | <44 px | <48 px | <7.5 mm | <9.2 mm | smallest |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const c = r.controls;
    L.push(`| ${r.fixture} | ${r.profile} | ${c.n} | ${c.fail258.length} | ${c.under44}% | ${c.under48}% | ${c.underMs === null ? "-" : c.underMs + "%"} | ${c.underParhi === null ? "-" : c.underParhi + "%"} | ${c.smallest.slice(0, 2).map((s) => `${s.name} ${s.w}x${s.h}`).join("; ")} |`);
  }
  L.push("", "## Text and colour", "", "Tint pairs: distinct pairs under one noticeable difference (Stone et al. 2014) at the median dot's size, then at 1/3 deg, the smallest size the model was measured at.", "",
    "| fixture | profile | theme | text styles | contrast fails | smallest px | cap <16' | canvas label | tint <3:1 | shared tints | dot size deg | <1 ND normal / protan / deutan / tritan | same at 1/3 deg |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const kinds = ["normal", "protan", "deutan", "tritan"];
  for (const r of results) for (const [theme, t] of Object.entries(r.themes)) {
    const v = t.colour.vision;
    L.push(`| ${r.fixture} | ${r.profile} | ${theme} | ${t.text.styles} | ${t.text.contrastFails.length} | ${t.text.minSize} | ${t.text.tooSmall.length} | ${t.canvasLabel ? t.canvasLabel.ratio + ":1, " + t.canvasLabel.cap + "'" : "-"} | ${t.colour.lowContrast.length}/${t.colour.groups} | ${t.colour.sharedPairs} | ${t.colour.deg} | ${kinds.map((x) => v[x].under).join(" / ")} of ${v.normal.pairs} | ${kinds.map((x) => v[x].underAtFloor).join(" / ")} |`);
  }
  L.push("", "## Page constants", "", "```", JSON.stringify(k), "```", "");
  L.push("## Findings", "");
  const bySev = new Map();
  for (const x of fs) { if (!bySev.has(x.sev)) bySev.set(x.sev, []); bySev.get(x.sev).push(x.text); }
  for (const [sev, items] of bySev) { L.push(`### ${sev} (${items.length})`, ""); for (const t of items) L.push("- " + t); L.push(""); }
  L.push("## Thresholds", "");
  for (const [key, v] of Object.entries(T)) L.push(`- \`${key}\` ${v.what} -- ${SOURCES[v.src]}`);
  return L.join("\n") + "\n";
}

async function main() {
  const k = pageConstants();
  const vaults = arg("url") ? [{ name: "url", url: arg("url") }] : FIXTURES.map((name) => {
    const v = arg("vault") && FIXTURES.length === 1 ? arg("vault") : fixtureVault(name);
    if (!v) throw new Error("no fixture " + name + " in " + fixtureStore() + " -- generate the fixtures first, or pass --vault");
    return { name, url: pathToFileURL(build(v, branchName() + " -- usability audit, " + name)).href };
  });

  /** @type {string | null} */
  let held = null;
  if (HEADED) {
    const s = claimScreen(OWNER);
    if (!s.ok) { noFreeScreen(); process.exit(1); }
    held = s.lock;
  }
  process.on("exit", () => release(held, OWNER));

  const PORT = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "vg-usability-profile-"));
  const scr = harnessScreen();
  const chrome = spawn(findChrome(arg("chrome")), [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    ...(HEADED ? [`--window-position=${scr.x + 40},${scr.y + 40}`, `--window-size=${Math.min(scr.w, 1600)},${Math.min(scr.h, 1000)}`]
               : ["--headless=new", "--window-size=2600,1500"]),
    "about:blank",
  ], { stdio: "ignore" });
  const kill = () => { try { chrome.kill(); } catch (e) { void e; } };
  process.on("exit", kill);

  let page = null;
  for (let i = 0; i < 60 && !page; i++) { try { page = await attach(PORT, ""); } catch { await sleep(250); } }
  if (!page) throw new Error("Chrome never offered a page on CDP");
  await page.send("Page.enable").catch(() => {});

  const results = [];
  try {
    for (const v of vaults) {
      for (const name of PROFILE_NAMES) {
        const prof = { ...PROFILES[name], name };
        const r = await audit(page, v.url, prof, k, v.name);
        results.push(r);
        const d = r.dots;
        console.log(`${v.name.padEnd(11)} ${name.padEnd(13)} dots ${String(d.n).padStart(5)}  diam p50 ${String(d.diamPx.p50).padStart(5)} px ${String(d.diamArcmin).padStart(5)}'  <5' ${String(d.under5).padStart(5)}%  2.5.8 ${String(d.fail258).padStart(5)}%` +
          (r.coarse ? `  eff<7mm ${String(d.effUnder7).padStart(5)}%` : "") +
          `  controls ${r.controls.n} (2.5.8 fail ${r.controls.fail258.length})`);
      }
    }
  } finally {
    page.close();
    kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) { void e; }
  }

  const fs = findings(results, k);
  console.log("\nfindings: " + fs.length);
  const counts = new Map();
  for (const x of fs) counts.set(x.sev, (counts.get(x.sev) || 0) + 1);
  for (const [sev, n] of counts) console.log(`  ${sev}: ${n}`);
  if (arg("json")) writeFileSync(resolve(arg("json")), JSON.stringify({ constants: k, results, findings: fs }, null, 1));
  if (arg("md")) writeFileSync(resolve(arg("md")), markdown(results, fs, k));
  if (arg("md") || arg("json")) console.log("wrote " + [arg("md"), arg("json")].filter(Boolean).join(", "));
  if (flag("strict")) {
    const hard = fs.filter((x) => /^WCAG (2\.5\.8 \(controls\)|1\.4\.3|1\.4\.11)/.test(x.sev));
    if (hard.length) { console.log(`strict: ${hard.length} WCAG AA finding(s)`); process.exit(1); }
  }
}

await main();
