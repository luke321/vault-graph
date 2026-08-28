#!/usr/bin/env node
// DOES A DOT GET BIGGER MID-CASCADE THAN IT IS AT EITHER END?
//
//   node scripts/probe-dotsize.mjs --vault <vault>
//   node scripts/probe-dotsize.mjs --vault <vault> --scale 4 --group "04 - Daily Notes"
//
// Reported symptom: "notes touch during animation because some become very big early".
// The suite's overlap check (`filtered to the bone, the disc stays drawable`) measures the
// disc AT REST -- deliberately, after settle() plus a 600ms beat, because notes in flight
// reported overlaps "on a disc that has none at rest". That beat makes a transient
// invisible to the suite, and a transient is exactly what is being reported.
//
// So this measures the frames the suite skips. Per frame, for every note drawn:
//
//   dot radius, in GRAPH UNITS, through renderer.scaleSize -- the node attribute is the
//   reducer's INPUT and is off by the camera ratio (.ai-context/animation.md, "Two traps").
//
// and against the two RESTING sizes of the same note (before the toggle, and after it):
//
//   overshoot   dot(frame) / max(dotRestA, dotRestB). A dot bigger than at both ends is
//               growing for a reason that is not the layout it is travelling between.
//   overlaps    two dots intersecting, per row, among notes actually visible this frame.
//
// Rest is sampled twice, so a note that legitimately grows because its wedge got roomier
// is not counted: it can end anywhere between its two endpoint sizes for free.

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
const SCALE = Number(arg("scale", "4"));          // slow motion: more frames to look at
const ONLY_GROUP = arg("group", "");
const WATCH = arg("watch", "").split(",").map((s) => s.trim()).filter(Boolean);
const HEADED = argv.includes("--headed");

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
const html = join(mkdtempSync(join(tmpdir(), "vg-dot-")), "vault-graph.html");
const b = spawnSync(process.execPath,
  [join(ROOT, "src", "build-graph.mjs"), "--out", html, "--vault", vault], { encoding: "utf8" });
if (b.status !== 0) throw new Error("build failed:\n" + (b.stderr || ""));
process.stdout.write(b.stdout || "");

const PORT = await freePort();
const profile = mkdtempSync(join(tmpdir(), "vg-dot-prof-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check",
  "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  ...(HEADED ? [] : ["--window-position=-2400,0"]),
  "--window-size=1600,1000", `--app=${pathToFileURL(html).href}`,
], { stdio: "ignore" });

// ---------------------------------------------------------------- in-page instrumentation

// One resting snapshot: every drawn note's dot radius in graph units, plus where it sits.
// The locked ring geometry, in graph units. __vg.rings() is four numbers and no node walk, so
// it is cheap enough to read per cascade -- report() would walk every node to answer it.
const RINGS = "(__vg.rings ? __vg.rings() : null)";
const REST = `(function () {
  var a0 = __vg.renderer.graphToViewport({ x: 0, y: 0 });
  var b0 = __vg.renderer.graphToViewport({ x: 160, y: 0 });
  var perPx = 160 / Math.hypot(b0.x - a0.x, b0.y - a0.y);
  var out = Object.create(null);
  __vg.graph.forEachNode(function (id, at) {
    var d = __vg.renderer.getNodeDisplayData(id);
    if (!d || d.hidden) return;
    if ((__vg.alpha[id] || 0) < 0.999) return;
    out[id] = [Math.round(__vg.renderer.scaleSize(d.size) * perPx * 100) / 100,
               Math.round(Math.hypot(at.x, at.y))];
  });
  return out;
})()`;

// The sampler. Runs on its own rAF, which is the same clock the page draws on, and keeps
// one aggregate row per frame -- 10k notes x 150 frames cannot come back over CDP.
const INSTALL = `(function () {
  window.__dot = { rows: [], on: false, restMax: null };
  function perPx() {
    var a0 = __vg.renderer.graphToViewport({ x: 0, y: 0 });
    var b0 = __vg.renderer.graphToViewport({ x: 160, y: 0 });
    return 160 / Math.hypot(b0.x - a0.x, b0.y - a0.y);
  }
  function pctOf(arr, q) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return Math.round(a[Math.min(a.length - 1, Math.floor(a.length * q))] * 100) / 100;
  }
  function sample() {
    if (!window.__dot.on) return;
    var k = perPx(), rest = window.__dot.restMax, restR = window.__dot.restR;
    var pts = [], n = 0, vis = 0;
    var over = 1, overId = null, overRad = 0, overRest = 0, overAl = 0;
    var maxRad = 0, rads = [], radsStay = [];
    var rExc = 0, rExcId = null, nExc = 0;
    var outMax = 0, outMin = 1e12;
    // BREATHING: how much each dot changed size since the PREVIOUS frame. This is the metric
    // that killed the per-note cap the first time it was tried -- "252% in one frame, 72 of 122
    // frames past 5%" -- so any build that reintroduces one has to be judged on it. Relative,
    // because a 2u change on a 4u dot and on a 200u dot are not the same event.
    var prevRad = window.__dot.prevRad || Object.create(null);
    var nextRad = Object.create(null);
    var breathe = 0, breatheId = null, nBreathe = 0;
    // ...AND IN PIXELS, which is the only unit a person sees.
    //
    // The relative figure above is an extreme-value statistic over a RATIO, and near the pixel
    // floor a dot of 1.5px going to 4px is +167% while being an event nobody can perceive. So
    // the same change is also recorded as an absolute pixel delta, distributed rather than
    // maximised, plus the relative figure restricted to dots big enough to read as dots.
    var prevPx = window.__dot.prevPx || Object.create(null);
    var nextPx = Object.create(null);
    var dPxAll = [], nHalf = 0, nOne = 0, nTwo = 0, nFour = 0;
    var relBig = 0, relBigId = null, relBigPx = 0;
    __vg.graph.forEachNode(function (id, at) {
      var d = __vg.renderer.getNodeDisplayData(id);
      if (!d || d.hidden) return;
      var al = __vg.alpha[id];
      if (al === undefined) al = 1;
      if (al <= 0.01) return;
      n++;
      var radPx = __vg.renderer.scaleSize(d.size);
      var rad = radPx * k;
      rads.push(rad);
      nextRad[id] = rad;
      nextPx[id] = radPx;
      // Only notes at full opacity: a fading note's dot changes size because the ramp is
      // fading it, which is not breathing.
      if (al > 0.99) {
        var pr = prevRad[id];
        if (pr !== undefined && pr > 0.5) {
          var ch = Math.abs(rad - pr) / pr;
          if (ch > breathe) { breathe = ch; breatheId = id; }
          if (ch > 0.05) nBreathe++;
        }
        var pp2 = prevPx[id];
        if (pp2 !== undefined) {
          var dpx = Math.abs(radPx - pp2);
          dPxAll.push(dpx);
          if (dpx > 0.5) nHalf++;
          if (dpx > 1) nOne++;
          if (dpx > 2) nTwo++;
          if (dpx > 4) nFour++;
          // A DOT BIG ENOUGH TO READ AS ONE. Below ~2px radius a dot is a speck and its
          // relative change is not a thing a person can see change.
          if (pp2 >= 2 && radPx >= 2) {
            var rb = Math.abs(radPx - pp2) / pp2;
            if (rb > relBig) { relBig = rb; relBigId = id; relBigPx = Math.round(radPx * 10) / 10; }
          }
        }
      }
      // THE MEDIAN OVER STAYERS ONLY. The median over everything drawn is dominated by the
      // thousands of FADING notes on a big range change, and a fading note's dot shrinking is
      // not a fact about the disc a person is left looking at. Without this split, "the median
      // dot shrinks to a third and then jumps 7x at the end" is an artefact of who is in the set.
      if (window.__dot.kind && window.__dot.kind[id] === 2) radsStay.push(rad);
      if (rad > maxRad) maxRad = rad;
      // OVERSHOOT vs the note's own two RESTING sizes. Only notes present at both ends,
      // so an arriving or leaving note -- whose endpoint size is undefined at one end --
      // is not compared against a number that does not exist.
      var rm = rest ? rest[id] : undefined;
      if (rm !== undefined && rm > 0) {
        var f = rad / rm;
        if (f > over) { over = f; overId = id; overRad = rad; overRest = rm; overAl = al; }
        // Peak per note over the whole cascade, so the report can say whether this is a
        // handful of notes or the whole vault breathing -- the two have different causes.
        var pk = window.__dot.peak;
        if (!(pk[id] >= f)) pk[id] = f;
      }
      // RADIAL OVERSHOOT, the same question asked of position instead of size: a note that
      // rests at r=4000 before and r=4040 after has no business being at 4083 in between.
      // Expressed in ROW PITCHES, because that is the unit the excursion matters in -- half a
      // pitch of overshoot puts a note in the gap where the next row's dots can reach it.
      var rb = restR ? restR[id] : undefined;
      if (rb) {
        var rr = Math.hypot(at.x, at.y);
        var exc = rr > rb[1] ? rr - rb[1] : (rr < rb[0] ? rb[0] - rr : 0);
        if (exc > rExc) { rExc = exc; rExcId = id; }
        if (exc > 40) nExc++;
      }
      // Only notes a person can actually see contribute to an overlap: a pair at alpha
      // 0.02 is not a smear. 0.35 is the point a dot reads as a dot.
      if (al >= 0.35) {
        vis++;
        // HOW FAR THE DISC REACHES THIS FRAME. geomLock fixes r0 and maxR from the unfiltered
        // plan and the disc is supposed to stay inside them; reported as "exploding and
        // contracting back", so measure the extent per frame rather than at rest.
        var rr2 = Math.hypot(at.x, at.y);
        if (rr2 > outMax) outMax = rr2;
        if (rr2 < outMin) outMin = rr2;
        pts.push({ id: id, x: at.x, y: at.y, rad: rad, al: al,
                   g: (at.folder || at.group || at.dir || "?"),
                   // Is this note on its way out, on its way in, or staying? The three have
                   // different expectations: a departing note keeps its slot by design, so a
                   // pair of STAYERS touching is a different fact from a leaver being caught.
                   // Taken from the two resting snapshots rather than from willShow, which is
                   // module-scope: a note drawn at rest at both ends stays, one end only moves.
                   go: window.__dot.kind ? (window.__dot.kind[id] || 0) : -1 });
      }
    });
    // EVERY PAIR, NOT EVERY PAIR IN A ROW. The suite's resting check buckets by radius and
    // compares tangential neighbours, which is right for a lattice at rest -- rows are rows.
    // Mid-cascade they are not: notes are moving radially at different speeds, so two notes
    // touching across a row boundary are exactly the case a per-row check cannot see, and
    // "notes touch during the animation" is a claim about pixels rather than about rows.
    //
    // A uniform grid over the point set, cell = the largest dot's diameter, so a pair that
    // can touch is always within the 3x3 neighbourhood. O(n) at 10,000 notes, which is what
    // makes it affordable on every frame.
    var overlaps = 0, worstRel = 0, worstClear = 1e9, steps = [];
    var wa = null, wb = null, both = 0;      // both = pairs where NEITHER note is in motion
    var radialPairs = 0, tangPairs = 0, inflated = 0, pairBig = 1;
    var cell = Math.max(16, 2 * maxRad);
    var grid = Object.create(null);
    for (var gi = 0; gi < pts.length; gi++) {
      var p = pts[gi];
      var gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
      var gk = gx + ":" + gy;
      (grid[gk] || (grid[gk] = [])).push(p);
      p.gx = gx; p.gy = gy;
    }
    // Nearest-neighbour distance per note, which is the local step the clearance is judged
    // against -- the 2D analogue of the row median, and available in the same sweep.
    var nnAll = [];
    for (var pi = 0; pi < pts.length; pi++) {
      var a = pts[pi], nn = 1e9;
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var bucket = grid[(a.gx + dx) + ":" + (a.gy + dy)];
        if (!bucket) continue;
        for (var bi = 0; bi < bucket.length; bi++) {
          var bb = bucket[bi];
          if (bb === a) continue;
          var dist = Math.hypot(bb.x - a.x, bb.y - a.y);
          if (dist < nn) nn = dist;
          if (bb.id < a.id) continue;              // count each pair once
          var clr = dist - a.rad - bb.rad;
          if (clr < worstClear) { worstClear = clr; wa = a; wb = bb; }
          if (clr < 0) {
            overlaps++;
            // A pair of notes that are present at BOTH ends of the cascade: neither is
            // fading, so neither has any business touching at any point in between.
            if (a.go === 2 && bb.go === 2) both++;
            // WHICH WAY they are too close, because the two have different causes and only
            // one of them is about size. Radially separated but still intersecting means one
            // note is mid-flight between rows and has caught the note in the next row --
            // traffic, not crowding. Same radius, too close in angle, is crowding.
            var dr = Math.abs(Math.hypot(bb.x, bb.y) - Math.hypot(a.x, a.y));
            if (dr > 0.5 * Math.max(a.rad, bb.rad)) radialPairs++; else tangPairs++;
            // ...and whether EITHER of them is drawn bigger than it rests at, which is the
            // reported hypothesis. A pair where both are at resting size was moved together
            // by the layout; a pair where one is 40% over was inflated into its neighbour.
            var ra = rest && rest[a.id] ? a.rad / rest[a.id] : 1;
            var rb = rest && rest[bb.id] ? bb.rad / rest[bb.id] : 1;
            var big = Math.max(ra, rb);
            if (big > 1.05) inflated++;
            if (big > pairBig) pairBig = big;
          }
        }
      }
      if (nn < 1e9) nnAll.push(nn);
    }
    // THE ROW PITCH AS DRAWN, per wedge. Radius is base + row * SP with row an INTEGER and SP
    // walked continuously, so the two can disagree mid-cascade: SP moves every frame and a
    // note's row only ticks when its fractional coordinate crosses. Between those two moments
    // its row sits at the wrong radius, and the gap to the next row is no longer the pitch.
    // This measures that gap directly rather than inferring it -- cluster each wedge's radii
    // into rows and take the consecutive spacing.
    var byW = Object.create(null);
    for (var wi = 0; wi < pts.length; wi++) {
      // Keyed by folder AND a narrow angular slice, so this is one COLUMN of one wedge --
      // a folder split into sub-wedges places them independently, and lumping those together
      // would report the gap between two sub-wedges' rows as a collapsed pitch.
      var thD = Math.atan2(pts[wi].y, pts[wi].x) * 180 / Math.PI;
      var wk = pts[wi].g + "|" + Math.round(thD / 2);
      (byW[wk] || (byW[wk] = [])).push(Math.hypot(pts[wi].x, pts[wi].y));
    }
    var minPitch = 1e9, minPitchW = "", pitches = [];
    Object.keys(byW).forEach(function (g) {
      var rs = byW[g].sort(function (x, y) { return x - y; });
      if (rs.length < 8) return;
      var cent = [], run = [rs[0]];
      for (var i = 1; i < rs.length; i++) {
        if (rs[i] - rs[i - 1] <= 8) run.push(rs[i]);
        else { cent.push(run[0] + (run[run.length - 1] - run[0]) / 2); run = [rs[i]]; }
      }
      cent.push(run[0] + (run[run.length - 1] - run[0]) / 2);
      for (var c2 = 1; c2 < cent.length; c2++) {
        var gap = cent[c2] - cent[c2 - 1];
        if (gap < 8) continue;                 // same row, split by the crude clustering
        pitches.push(gap);
        if (gap < minPitch) { minPitch = gap; minPitchW = g; }
      }
    });
    pitches.sort(function (x, y) { return x - y; });
    nnAll.sort(function (x, y) { return x - y; });
    var medNN = nnAll.length ? nnAll[Math.floor(nnAll.length / 2)] : 0;
    if (worstClear < 0 && medNN > 0) worstRel = -worstClear / medNN;
    steps.push(medNN);
    rads.sort(function (x, y) { return x - y; });
    radsStay.sort(function (x, y) { return x - y; });
    window.__dot.prevRad = nextRad;
    window.__dot.prevPx = nextPx;
    window.__dot.rows.push({
      ms: Math.round((window.performance || Date).now() - window.__dot.t0),
      busy: !!(__vg.demo && __vg.demo.busy && __vg.demo.busy()),
      n: n, vis: vis,
      medRad: rads.length ? Math.round(rads[Math.floor(rads.length / 2)] * 10) / 10 : 0,
      medStay: radsStay.length ? Math.round(radsStay[Math.floor(radsStay.length / 2)] * 10) / 10 : 0,
      nStay: radsStay.length,
      maxRad: Math.round(maxRad),
      medStep: steps.length ? Math.round(steps[Math.floor(steps.length / 2)]) : 0,
      over: Math.round(over * 1000) / 1000, overId: overId,
      overRad: Math.round(overRad), overRest: Math.round(overRest),
      overAl: Math.round(overAl * 100) / 100,
      overlaps: overlaps,
      worstRel: Math.round(worstRel * 1000) / 10,
      worstClear: worstClear === 1e9 ? null : Math.round(worstClear),
      // WHO touched, and how big each of the two is against its own resting size. This is
      // the whole question: if the pair's dots are at their resting sizes then the geometry
      // moved them together, and if one is 40% over then the size did it.
      both: both, rad2: radialPairs, tan2: tangPairs,
      inflated: inflated, pairBig: Math.round(pairBig * 100) / 100,
      rExc: Math.round(rExc), rExcId: rExcId, nExc: nExc,
      outMax: Math.round(outMax), outMin: outMin === 1e12 ? null : Math.round(outMin),
      breathe: Math.round(breathe * 1000) / 10, breatheId: breatheId, nBreathe: nBreathe,
      dPxMax: dPxAll.length ? Math.round(Math.max.apply(null, dPxAll) * 100) / 100 : 0,
      dPxP50: pctOf(dPxAll, 0.5), dPxP90: pctOf(dPxAll, 0.9), dPxP99: pctOf(dPxAll, 0.99),
      nHalf: nHalf, nOne: nOne, nTwo: nTwo, nFour: nFour, nMeasured: dPxAll.length,
      relBig: Math.round(relBig * 1000) / 10, relBigId: relBigId, relBigPx: relBigPx,
      minPitch: minPitch === 1e9 ? null : Math.round(minPitch), minPitchW: minPitchW,
      medPitch: pitches.length ? Math.round(pitches[Math.floor(pitches.length / 2)]) : null,
      // A named pair's full trajectory, so "they met in the middle" can be read rather than
      // inferred: two notes 160 units apart at both ends have to stay 160 apart throughout.
      watch: (window.__dot.watch || []).map(function (id) {
        var at = __vg.graph.getNodeAttributes(id);
        var d = __vg.renderer.getNodeDisplayData(id);
        return at && d ? { id: id, r: Math.round(Math.hypot(at.x, at.y)),
                           th: Math.round(Math.atan2(at.y, at.x) * 18000 / Math.PI) / 100,
                           rad: Math.round(__vg.renderer.scaleSize(d.size) * k * 10) / 10 } : null;
      }),
      pair: wa && worstClear < 0 ? [wa, wb].map(function (q) {
        return { id: q.id, g: q.g, go: q.go, rad: Math.round(q.rad),
                 rest: rest && rest[q.id] !== undefined ? Math.round(rest[q.id]) : null,
                 al: Math.round(q.al * 100) / 100,
                 r: Math.round(Math.hypot(q.x, q.y)),
                 th: Math.round(Math.atan2(q.y, q.x) * 1800 / Math.PI) / 10 };
      }) : null,
    });
  }
  function loop() { sample(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__dot.start = function (restMax, kind, watch, restR) {
    window.__dot.rows = []; window.__dot.prevRad = null; window.__dot.prevPx = null; window.__dot.restMax = restMax; window.__dot.kind = kind;
    window.__dot.restR = restR;
    window.__dot.watch = watch || [];
    window.__dot.peak = Object.create(null);
    window.__dot.t0 = (window.performance || Date).now(); window.__dot.on = true;
  };
  window.__dot.stop = function () { window.__dot.on = false; return window.__dot.rows.length; };
  // How many notes overshot, and by how much, as a distribution rather than one maximum.
  window.__dot.peaks = function (thresh) {
    var pk = window.__dot.peak || {}, ids = Object.keys(pk);
    var over = ids.filter(function (id) { return pk[id] > thresh; });
    over.sort(function (a, b) { return pk[b] - pk[a]; });
    return {
      total: ids.length, over: over.length,
      top: over.slice(0, 10).map(function (id) {
        var at = __vg.graph.getNodeAttributes(id);
        return { id: id, x: Math.round(pk[id] * 100) / 100,
                 g: (at && (at.folder || at.group || at.dir)) || "?",
                 r: Math.round(Math.hypot(at.x, at.y)) };
      }),
    };
  };
  return "installed";
})()`;

// ---------------------------------------------------------------------------------- driver

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
  await page.eval(`__vg.timeScale = ${SCALE}; void 0`);
  // The experiment's toggle. One build, both modes, so nothing but the flag differs between
  // the two sets of numbers -- no rebuild, no second Chrome, no fixture drift.
  const FITCAP = arg("fitcap", "");
  if (FITCAP) {
    const got = await page.j(`(function(){ __vg.fitCap = ${FITCAP === "on"}; return __vg.fitCap; })()`);
    console.log(`__vg.fitCap = ${got}`);
  }
  console.log(await page.j(INSTALL));

  const settle = async () => {
    for (let k = 0; k < 400; k++) {
      if (!(await page.j("!!__vg.demo.busy()").catch(() => false))) break;
      await sleep(120);
    }
    await sleep(700);
  };

  const clickEye = (g) => page.j(`(function(){
    var b = document.querySelector('[data-eye="' + ${JSON.stringify(g)}.replace(/"/g, '\\\\"') + '"]');
    if (!b) return false; b.click(); return true; })()`);

  let groups = await page.j("__vg.groupOrder()");
  if (ONLY_GROUP) groups = groups.filter((g) => g === ONLY_GROUP);

  // THE OTHER CASCADE THE SUITE DRIVES. `filtered to the bone` squeezes the date range as
  // well as hiding folders, and a range change moves the same two quantities -- the walked
  // spacing and each note's integer row -- so it is the same question asked of the control
  // a person actually uses most.
  const RANGES = argv.includes("--range");
  const YEARS = argv.includes("--years");
  const GROWTH = argv.includes("--growth");
  const cascades = [];
  if (YEARS) {
    // A YEAR CHIP MOVES BOTH ENDS AT ONCE, which no "last N%" squeeze does -- and the demo
    // storyboard's timeline act is year chips and handle drags. Reported as the moves that
    // look worst, so they get measured rather than assumed to behave like the squeezes.
    const years = await page.j(`(function () {
      var out = [];
      var els = document.querySelectorAll("[data-yr]");
      for (var i = 0; i < els.length; i++) out.push(els[i].getAttribute("data-yr"));
      return out; })()`).catch(() => []);
    const pick = years.length ? years : [];
    for (const y of pick) {
      cascades.push({
        label: `year ${y}`,
        go: () => page.j(`(function(){ var b = document.querySelector('[data-yr="${y}"]');
          if (!b) return false; b.click(); return true; })()`),
        back: () => page.eval(`__vg.setRange(null, null); void 0`),
      });
    }
    if (!pick.length) console.log("no year chips found on this page");
  } else if (GROWTH) {
    // THE INTRO / REFRESH GROWTH ANIMATION -- the disc built from an empty screen through the
    // same cascade() a toggle uses, over TIMELINE_MS instead of CASCADE_MS. Nothing had
    // measured it, and it is the longest animation the page has.
    cascades.push({
      label: "growth (Refresh)",
      // "vg-refresh", not "refresh": the page namespaces every id, and the click silently
      // finding nothing is why the first run of this reported an empty sweep.
      go: () => page.j(`(function(){ var b = document.getElementById("vg-refresh");
        if (!b) return false; b.click(); return true; })()`),
      back: async () => { /* growth ends at the whole vault, which is where it starts */ },
    });
  } else if (RANGES) {
    const span = await page.j(`(function(){
      var f = document.querySelector("#vg-from");
      return f ? { min: f.min, max: f.max } : null; })()`);
    if (span && span.min && span.max) {
      const lo = Date.parse(span.min), hi = Date.parse(span.max);
      for (const frac of [0.5, 0.1, 0.025]) {
        const from = new Date(hi - (hi - lo) * frac).toISOString().slice(0, 10);
        cascades.push({
          label: `range last ${frac * 100}%`,
          go: () => page.eval(`__vg.setRange(${JSON.stringify(from)}, null); void 0`),
          back: () => page.eval(`__vg.setRange(null, null); void 0`),
        });
      }
    }
  } else {
    for (const g of groups) {
      cascades.push({ label: g, go: () => clickEye(g), back: () => clickEye(g) });
    }
  }

  const pad = (v, w) => String(v).padStart(w);
  console.log(`\ntimeScale ${SCALE}, ${groups.length} group toggle(s) on ${vault}\n`);

  const verdicts = [];
  for (const cas of cascades) {
    const g = cas.label;
    await cas.back();
    await settle();
    const restA = await page.j(REST);
    const rings = await page.j(RINGS).catch(() => null);
    // Both endpoints first, without recording, so the sampler has real numbers to
    // compare against rather than one end and a guess.
    if ((await cas.go()) === false) continue;
    await settle();
    const restB = await page.j(REST);
    await cas.back();
    await settle();

    // restMax per note: bigger of the two endpoint sizes.
    const restMax = Object.create(null);
    for (const id of Object.keys(restA)) restMax[id] = restA[id][0];
    for (const id of Object.keys(restB)) {
      if (restMax[id] === undefined || restB[id][0] > restMax[id]) restMax[id] = restB[id][0];
    }
    // The radial band a stayer is entitled to: between its two resting radii, and nowhere else.
    const restR = Object.create(null);
    for (const id of Object.keys(restA)) {
      if (restB[id] === undefined) continue;
      const a = restA[id][1], bb = restB[id][1];
      restR[id] = [Math.min(a, bb), Math.max(a, bb)];
    }

    // 2 = drawn at rest at BOTH ends (a stayer), 1 = one end only (arriving or leaving).
    const kind = Object.create(null);
    for (const id of Object.keys(restMax)) {
      kind[id] = (restA[id] !== undefined && restB[id] !== undefined) ? 2 : 1;
    }

    for (const dir of ["in", "out"]) {
      await page.eval(`__dot.start(${JSON.stringify(restMax)}, ${JSON.stringify(kind)}, ` +
                      `${JSON.stringify(WATCH)}, ${JSON.stringify(restR)}); void 0`);
      await (dir === "in" ? cas.go() : cas.back());
      await settle();
      const nf = await page.j("__dot.stop()");
      const rows = await page.j("__dot.rows");
      if (!rows.length) { console.log(`${g} ${dir}: nothing sampled`); continue; }
      const busySpan = rows.filter((r) => r.busy);
      const span = busySpan.length ? busySpan[busySpan.length - 1].ms : rows[rows.length - 1].ms;
      let worst = rows[0], worstOv = rows[0];
      for (const r of rows) {
        if (r.over > worst.over) worst = r;
        if (r.worstRel > worstOv.worstRel) worstOv = r;
      }
      const pct = (ms) => Math.round(100 * ms / Math.max(1, span));
      verdicts.push({ g, dir, over: worst.over, overAt: pct(worst.ms),
                      rel: worstOv.worstRel, relAt: pct(worstOv.ms),
                      pairs: worstOv.overlaps, frames: rows.length });
      console.log(`${g} :: ${dir}  (${rows.length} frames over ${span}ms)`);
      console.log(`   biggest overshoot  ${worst.over.toFixed(2)}x  at ${pct(worst.ms)}% ` +
                  `-- note ${worst.overId}, ${worst.overRad}u drawn vs ${worst.overRest}u ` +
                  `at rest, alpha ${worst.overAl}`);
      console.log(`   worst overlap      ${worstOv.worstRel}% of the local step at ` +
                  `${pct(worstOv.ms)}%  (${worstOv.overlaps} pair(s), clear ${worstOv.worstClear})`);
      if (worstOv.pair) {
        const s = (q) => `${q.id}@${q.g} ${q.rad}u/rest ${q.rest} a${q.al} ` +
                         `${q.go === 2 ? "stay" : "move"} r${q.r} th${q.th}`;
        console.log(`     the pair: ${s(worstOv.pair[0])}  vs  ${s(worstOv.pair[1])}`);
        console.log(`     of ${worstOv.overlaps} pair(s), ${worstOv.both} are stayer-vs-stayer`);
      }
      const pk = await page.j("__dot.peaks(1.05)");
      // HOW LONG, not just how bad. A single frame of overlap is invisible; a third of the
      // animation with a thousand dots merged is the thing being reported as "does not look
      // good". Measured over the frames the cascade was actually busy for.
      const busy = rows.filter((r) => r.busy);
      const dirty = busy.filter((r) => r.overlaps > 0);
      let run = 0, best = 0;
      for (const r of busy) { if (r.overlaps > 0) { run++; if (run > best) best = run; } else run = 0; }
      const medPairs = dirty.length
        ? dirty.map((r) => r.overlaps).sort((x, y) => x - y)[Math.floor(dirty.length / 2)] : 0;
      const msPerFrame = busy.length > 1
        ? (busy[busy.length - 1].ms - busy[0].ms) / (busy.length - 1) : 0;
      // THE WHOLE DISTRIBUTION, not one summary number. A median taken over "dirty" frames only
      // answers a different question from a median over the animation, and the two disagreed
      // badly enough here to look like a measurement error -- so both are printed, over every
      // busy frame, with quartiles either side.
      const pct2 = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : 0;
      const allP = busy.map((r) => r.overlaps).sort((x, y) => x - y);
      console.log(`   pairs per busy frame: p25 ${pct2(allP, 0.25)}  p50 ${pct2(allP, 0.5)}  ` +
                  `p75 ${pct2(allP, 0.75)}  p90 ${pct2(allP, 0.9)}  max ${allP[allP.length - 1] || 0}` +
                  `  (mean ${Math.round(allP.reduce((a2, b2) => a2 + b2, 0) / Math.max(1, allP.length))})`);
      console.log(`   overlapping for ${dirty.length} of ${busy.length} busy frames ` +
                  `(${Math.round(100 * dirty.length / Math.max(1, busy.length))}%), ` +
                  `longest unbroken run ${best} frames ~${Math.round(best * msPerFrame)}ms, ` +
                  `median ${medPairs} pair(s) while dirty`);
      let wb = rows[0];
      for (const r of rows) if (r.breathe > wb.breathe) wb = r;
      const breatheFrames = busy.filter((r) => r.nBreathe > 0).length;
      const bp = busy.map((r) => r.breathe).sort((x, y) => x - y);
      const mx = (f) => busy.length ? Math.max.apply(null, busy.map(f)) : 0;
      const med = (f) => { const a = busy.map(f).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
      let wr2 = busy[0] || rows[0];
      for (const r of busy) if (r.relBig > (wr2.relBig || 0)) wr2 = r;
      console.log(`   BREATHING IN PIXELS (radius delta between consecutive frames, ` +
                  `${med((r) => r.nMeasured)} notes/frame):`);
      console.log(`      per-frame p50 ${med((r) => r.dPxP50)}px  p90 ${med((r) => r.dPxP90)}px  ` +
                  `p99 ${med((r) => r.dPxP99)}px  worst frame's max ${mx((r) => r.dPxMax)}px`);
      console.log(`      notes moving >0.5px: median ${med((r) => r.nHalf)}/frame, worst ${mx((r) => r.nHalf)}  |  ` +
                  `>1px: ${med((r) => r.nOne)} / ${mx((r) => r.nOne)}  |  ` +
                  `>2px: ${med((r) => r.nTwo)} / ${mx((r) => r.nTwo)}  |  ` +
                  `>4px: ${med((r) => r.nFour)} / ${mx((r) => r.nFour)}`);
      console.log(`      worst change on a dot >=2px radius: ${wr2.relBig}% ` +
                  `(note ${wr2.relBigId}, now ${wr2.relBigPx}px)`);
      console.log(`   BREATHING: worst single-frame size change ${wb.breathe}% (note ${wb.breatheId}` +
                  ` at ${pct(wb.ms)}%); ${breatheFrames} of ${busy.length} busy frames have a note ` +
                  `past 5%; per-frame worst-change p50 ${bp[Math.floor(bp.length / 2)] || 0}% ` +
                  `p90 ${bp[Math.floor(bp.length * 0.9)] || 0}%`);
      console.log(`   notes over 1.05x: ${pk.over} of ${pk.total}` +
                  (pk.top.length ? " -- " + pk.top.map((t) => `${t.id}@${t.g}:${t.x}x`).join(", ") : ""));
      if (WATCH.length) {
        console.log(`   trajectory of ${WATCH.join(" and ")} (r, angle, drawn radius):`);
        const stepW = argv.includes("--watchall") ? 1 : Math.max(1, Math.floor(rows.length / 20));
        for (let i = 0; i < rows.length; i += stepW) {
          const w = rows[i].watch || [];
          if (!w.length || !w[0]) continue;
          const sep = w.length > 1 && w[0] && w[1]
            ? Math.round(Math.hypot(
                w[0].r * Math.cos(w[0].th * Math.PI / 180) - w[1].r * Math.cos(w[1].th * Math.PI / 180),
                w[0].r * Math.sin(w[0].th * Math.PI / 180) - w[1].r * Math.sin(w[1].th * Math.PI / 180)))
            : null;
          console.log("      " + pad(pct(rows[i].ms), 4) + "%  " +
            w.map((q) => q ? `${q.id}: r${pad(q.r, 5)} th${pad(q.th.toFixed(2), 8)} dot${pad(q.rad, 6)}` : "gone").join("   ") +
            (sep !== null ? `   apart ${sep}` +
              (w[0] && w[1] ? ` clear ${Math.round(sep - w[0].rad - w[1].rad)}` : "") : ""));
        }
      }
      // The shape of it over time, which is what "very big EARLY" is a claim about.
      // THE FIRST FEW FRAMES VERBATIM. A quantity that is computed one way at rest and
      // another way inside a cascade steps on frame 1, and a table sampled every twelfth
      // frame cannot tell that from a fast ramp.
      console.log("   first 8 frames:  " + rows.slice(0, 8).map((r) =>
        `${r.ms}ms ${r.over.toFixed(2)}x/${r.overlaps}p`).join("  "));
      const step = Math.max(1, Math.floor(rows.length / 12));
      let wr = rows[0];
      for (const r of rows) if (r.rExc > wr.rExc) wr = r;
      console.log(`   worst radial excursion beyond BOTH resting radii: ${wr.rExc}u ` +
                  `(${(wr.rExc / 160).toFixed(2)} pitches) at ${pct(wr.ms)}%, note ${wr.rExcId}; ` +
                  `${Math.max(...rows.map((r) => r.nExc))} notes past 40u at the peak`);
      if (rings) {
        let wo = rows[0], wi = rows[0];
        for (const r of rows) {
          if (r.outMax > wo.outMax) wo = r;
          if (r.outMin !== null && (wi.outMin === null || r.outMin < wi.outMin)) wi = r;
        }
        console.log(`   RINGS: locked r0 ${Math.round(rings.r0)}  maxR ${Math.round(rings.maxR)}` +
          `  |  furthest note ${wo.outMax}u at ${pct(wo.ms)}% = ` +
          `${(wo.outMax / rings.maxR).toFixed(3)}x maxR` +
          `  |  nearest note ${wi.outMin}u at ${pct(wi.ms)}% = ` +
          `${(wi.outMin / rings.r0).toFixed(3)}x r0`);
      }
      let wp = rows[0];
      for (const r of rows) if (r.minPitch !== null && (wp.minPitch === null || r.minPitch < wp.minPitch)) wp = r;
      console.log(`   tightest drawn row pitch: ${wp.minPitch}u at ${pct(wp.ms)}% in ` +
                  `"${wp.minPitchW}" (median pitch ${wp.medPitch}u)`);
      console.log("      %      over   pairs   stay  radial   infl   rel%   rExc  nExc  minPit  medPit  medRad medStay  nStay     n");
      for (let i = 0; i < rows.length; i += step) {
        const r = rows[i];
        console.log("   " + pad(pct(r.ms), 4) + pad(r.over.toFixed(2), 10) + pad(r.overlaps, 8) +
                    pad(r.both, 7) + pad(r.rad2, 8) + pad(r.inflated, 7) +
                    pad(r.worstRel, 7) + pad(r.rExc, 7) + pad(r.nExc, 6) +
                    pad(r.minPitch, 8) + pad(r.medPitch, 8) + pad(r.medRad, 8) +
                    pad(r.medStay, 8) + pad(r.nStay, 7) + pad(r.n, 6));
      }
      console.log("");
    }
  }
  console.log("\nWORST ACROSS EVERY TOGGLE\n");
  verdicts.sort((a, b) => b.over - a.over);
  for (const v of verdicts.slice(0, 12)) {
    console.log(`  ${v.over.toFixed(2)}x at ${v.overAt}%  overlap ${v.rel}% at ${v.relAt}% ` +
                `(${v.pairs} pairs)  -- ${v.g} ${v.dir}`);
  }
  const mo = verdicts.reduce((m, v) => Math.max(m, v.over), 0);
  const mr = verdicts.reduce((m, v) => Math.max(m, v.rel), 0);
  console.log(`\n  worst overshoot ${mo.toFixed(2)}x, worst overlap ${mr}% of a row median\n`);
} finally {
  try { if (page) await page.send("Browser.close"); } catch { /* going anyway */ }
  try { chrome.kill(); } catch { /* ditto */ }
}
