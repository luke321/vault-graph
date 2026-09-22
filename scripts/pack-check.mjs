#!/usr/bin/env node
// github#186
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ROOT = resolve(argv.find((a) => !a.startsWith("--")) || ".");
const JSON_OUT = arg("json", "");
const RAIL_TOL = Number(arg("rail-tol", "0.005"));
const AREA_TOL = Number(arg("area-tol", "0.07"));
const SEAM_TOL = Number(arg("seam-tol", "0.05"));
const FILL_TOL = Number(arg("fill-tol", "0.10"));
// github#186 -- an integer row count steps the pitch
const STEP_TOL = Number(arg("step-tol", "0.03"));
// github#186, decisions/0002 -- the transient cost the row cap is allowed
const TOUCH_MARGIN = Number(arg("touch-margin", "0.6"));
const TICK_REL = Number(arg("tick-rel", "0.3"));
const SEAM_MIN_LIT = 3;
const FILL_MIN_LIT = 8;
const DOT_OF_PITCH = 11 / 28;

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const angDiff = (a, b) => { let d = b - a; while (d < 0) d += 360; while (d >= 360) d -= 360; return d; };

function runDirs(root) {
  if (existsSync(join(root, "probe.json"))) return [root];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, "probe.json")))
    .map((e) => join(root, e.name)).sort();
}

function covers(wedges) {
  const out = new Map();
  for (const w of wedges || []) {
    if (w.nStart == null || !(w.arc > 0.5)) continue;
    const c = Math.min(1, angDiff(w.nEnd, w.nStart) / w.arc);
    const key = w.g + "|" + w.band;
    const prev = out.get(key);
    if (!prev || c < prev.cover) out.set(key, { g: w.g, band: w.band, arc: w.arc, cover: c });
  }
  return out;
}

const AREA_MIN_LIT = 3;
const areaPerNote = (b) => (b && b.lit >= AREA_MIN_LIT && b.rMax > b.rMin
  ? Math.PI * (b.rMax * b.rMax - b.rMin * b.rMin) / b.lit : null);

const report = {};
let seen = 0;
let failures = 0;
for (const dir of runDirs(ROOT)) {
  seen++;
  const P = JSON.parse(readFileSync(join(dir, "probe.json"), "utf8"));
  const rl = P.restA && P.restA.rails;
  if (!rl) throw new Error(`${dir}: the run recorded no rails -- geomLock was null`);
  const rails = { i: { row0: rl.innerRow0, top: rl.innerTop }, o: { row0: rl.outerRow0, top: rl.outerTop } };
  const frames = P.samples.filter((s) => s.cascade && s.pr != null);
  if (!frames.length) throw new Error(`${dir}: no cascade frames sampled`);
  const restCov = { A: covers(P.restA.wedges), B: covers(P.restB.wedges) };
  // github#186
  if (!frames.some((s) => Object.values(s.groups || {}).some((g) => g && g.byBand))) {
    throw new Error(`${dir}: the run has no per-band group stats -- re-take it with the current probe-186.mjs`);
  }
  const rest = {};
  for (const k of ["i", "o"]) {
    const a = P.restA.bands[k], b = P.restB.bands[k];
    rest[k] = { aMax: a && a.lit ? a.rMax : null, bMax: b && b.lit ? b.rMax : null,
                aArea: areaPerNote(a), bArea: areaPerNote(b) };
    const ms = [rest[k].aMax, rest[k].bMax, rails[k].top].filter((x) => x != null);
    rest[k].bound = Math.max(...ms);
    const as = [rest[k].aArea, rest[k].bArea].filter((x) => x != null);
    rest[k].areaLo = as.length ? Math.min(...as) : null;
    rest[k].areaHi = as.length ? Math.max(...as) : null;
  }

  const fail = { rails: [], rest: [], area: [], seam: [], fill: [], step: [], touch: [], tick: [] };
  let worst = { over: 0, under: 0, restX: 0, areaX: 0 };
  const seamWorst = new Map();

  for (const s of frames) {
    for (const k of ["i", "o"]) {
      const b = s.bands[k];
      if (!b || !b.lit) continue;
      const pitch = (s.pitch && s.pitch[k]) || 0;
      const over = b.rMax / rails[k].top, under = rails[k].row0 / Math.max(1e-6, b.rMin);
      if (over > worst.over) worst = { ...worst, over, overAt: { pr: r3(s.pr), band: k, rMax: r2(b.rMax), top: r2(rails[k].top) } };
      if (under > worst.under) worst = { ...worst, under, underAt: { pr: r3(s.pr), band: k, rMin: r2(b.rMin), row0: r2(rails[k].row0) } };
      if (over > 1 + RAIL_TOL || under > 1 + RAIL_TOL) {
        fail.rails.push({ pr: r3(s.pr), band: k, rMax: r2(b.rMax), rMin: r2(b.rMin), pitch: r2(pitch),
                          top: r2(rails[k].top), row0: r2(rails[k].row0), over: r2(over), under: r2(under),
                          dotEdge: r2((b.rMax + DOT_OF_PITCH * pitch) / rails[k].top) });
      }
      const rx = b.rMax / rest[k].bound;
      if (rx > worst.restX) worst = { ...worst, restX: rx, restAt: { pr: r3(s.pr), band: k, rMax: r2(b.rMax), bound: r2(rest[k].bound) } };
      if (rx > 1 + RAIL_TOL) fail.rest.push({ pr: r3(s.pr), band: k, rMax: r2(b.rMax), bound: r2(rest[k].bound), x: r2(rx) });
      const ap = areaPerNote(b);
      if (ap != null && rest[k].aArea != null && rest[k].bArea != null) {
        // github#186 -- outside the rail is the worse fault
        const over = ap > rest[k].areaHi;
        const ax = over ? ap / rest[k].areaHi : rest[k].areaLo / ap;
        if (ax > worst.areaX) worst = { ...worst, areaX: ax, areaAt: { pr: r3(s.pr), band: k, area: r2(ap), lo: r2(rest[k].areaLo), hi: r2(rest[k].areaHi) } };
        if (ax > 1 + AREA_TOL) {
          fail.area.push({ pr: r3(s.pr), band: k, area: r2(ap), lo: r2(rest[k].areaLo), hi: r2(rest[k].areaHi), x: r2(ax), over: over });
        }
      }
    }
    for (const [key, c] of covers(s.wedges)) {
      const a = restCov.A.get(key), b = restCov.B.get(key);
      if (!a && !b) continue;
      // github#186
      const gs = s.groups[c.g] && s.groups[c.g].byBand ? s.groups[c.g].byBand[c.band] : null;
      if (!(gs && gs.lit >= SEAM_MIN_LIT)) continue;
      const seen = gs.alphaSum > 1e-6 ? Math.min(1, gs.lit / gs.alphaSum) : 1;
      const owed = (a && b ? Math.min(a.cover, b.cover) : (a || b).cover) * seen;
      const slack = c.cover - owed;
      const prev = seamWorst.get(key);
      if (!prev || slack < prev.slack) seamWorst.set(key, { ...c, owed, slack, pr: r3(s.pr) });
      if (slack < -SEAM_TOL) {
        fail.seam.push({ pr: r3(s.pr), g: c.g, band: c.band, arc: r2(c.arc),
                         cover: r2(c.cover), owed: r2(owed), slack: r2(slack) });
      }
    }
  }
  const seamWorstList = [...seamWorst.values()].sort((x, y) => x.slack - y.slack).slice(0, 6);

  // github#186
  const fillOf = (s, key) => {
    const [g, band] = key.split("|");
    const gs = s.groups[g] && s.groups[g].byBand ? s.groups[g].byBand[band] : null;
    if (!gs || gs.lit < FILL_MIN_LIT || !(gs.alphaSum > 0.5) || !(gs.rMax > gs.rMin)) return null;
    const pitch = (s.pitch && s.pitch[band]) || 0;
    if (!(pitch > 1e-6)) return null;
    let arc = 0;
    for (const w of s.wedges || []) if (w.g === g && w.band === band) arc += w.arc;
    arc = (arc * Math.PI) / 180;
    if (!(arc > 1e-6)) return null;
    const rows = Math.max(1, Math.round((gs.rMax - gs.rMin) / pitch) + 1);
    const sumR = (rows * (gs.rMin + gs.rMax)) / 2;
    // github#186
    const w = gs.wsum > 1e-6 ? gs.wsum : gs.alphaSum;
    return (arc * sumR) / pitch / w;
  };
  const first = frames[0], last = frames[frames.length - 1];
  const keys = new Set();
  for (const s of [first, last]) for (const w of s.wedges || []) keys.add(w.g + "|" + w.band);
  const arcGap = [];
  for (const key of keys) {
    const bf = fillOf(first, key), bl = fillOf(last, key);
    const base = Math.max(bf || 0, bl || 0);
    if (!(base > 1e-6)) continue;
    let w = 1, atPr = null, atArc = 0, atN = 0;
    for (const s of frames) {
      const f = fillOf(s, key);
      if (f == null) continue;
      if (f / base > w) {
        const [gg, bb] = key.split("|");
        let ar = 0;
        for (const ww of s.wedges || []) if (ww.g === gg && ww.band === bb) ar += ww.arc;
        const gb = s.groups[gg] && s.groups[gg].byBand ? s.groups[gg].byBand[bb] : null;
        w = f / base; atPr = r3(s.pr); atArc = r2(ar); atN = r2(gb ? gb.alphaSum : 0);
      }
    }
    if (w > 1.0001) arcGap.push({ g: key.replace("|", " "), worst: r2(w - 1), pr: atPr, arcFrac: atArc, noteFrac: atN });
  }
  arcGap.sort((x, y) => y.worst - x.worst);
  for (const a of arcGap) if (a.worst > FILL_TOL) fail.fill.push(a);

  // github#186 -- pitch is row spacing: a step moves the band
  for (let k = 1; k < frames.length; k++) {
    for (const b of ["i", "o"]) {
      const a = frames[k - 1].pitch && frames[k - 1].pitch[b];
      const c = frames[k].pitch && frames[k].pitch[b];
      if (!(a > 1e-6) || !(c > 1e-6)) continue;
      const rel = Math.abs(c - a) / a;
      // github#186 -- an emptied band's fallback moves no note
      const lit = frames[k].bands && frames[k].bands[b] ? frames[k].bands[b].lit : 0;
      if (rel > STEP_TOL && lit > 0) {
        fail.step.push({ band: b, pr: r3(frames[k].pr), from: r2(a), to: r2(c), rel: r3(rel), lit: lit });
      }
    }
  }
  fail.step.sort((x, y) => y.rel - x.rel);

  // github#186 -- a band's live row count, from its own lit extent
  const rowsLive = (s, b) => {
    const bd = s.bands && s.bands[b];
    const pitch = (s.pitch && s.pitch[b]) || 0;
    if (!bd || !bd.lit || !(pitch > 1e-6)) return 0;
    return Math.max(1, Math.round((bd.rMax - bd.rMin) / pitch) + 1);
  };
  // github#186 -- a note per row, three, and a tenth of rest
  const restLit = {};
  for (const k of ["i", "o"]) {
    const a = P.restA.bands[k], b = P.restB.bands[k];
    restLit[k] = Math.max((a && a.lit) || 0, (b && b.lit) || 0);
  }
  const populated = (s, b) => {
    const rows = rowsLive(s, b);
    if (!rows) return 0;
    const floorLit = Math.max(AREA_MIN_LIT, rows, Math.ceil(0.1 * restLit[b]));
    return s.bands[b].lit >= floorLit ? rows : 0;
  };
  // github#186 -- the cap's own guarantee is the bar
  let touch = { x: Infinity, bar: 0, pr: null, band: null };
  let touchThin = { x: Infinity, pr: null, band: null };
  for (const s of frames) {
    for (const b of ["i", "o"]) {
      const bd = s.bands && s.bands[b];
      const pitch = (s.pitch && s.pitch[b]) || 0;
      if (!bd || !bd.lit || !(pitch > 1e-6)) continue;
      const x = (bd.rMax + pitch / 2) / rails[b].top;
      const rows = rowsLive(s, b);
      const at = { x, pr: r3(s.pr), band: b, rMax: r2(bd.rMax), pitch: r2(pitch), lit: bd.lit, rows: rows };
      if (x < touchThin.x) touchThin = at;
      if (!populated(s, b)) continue;
      const bar = 1 - TOUCH_MARGIN / rows;
      const slack = x - bar;
      if (slack < touch.x - touch.bar) touch = { ...at, bar: r3(bar), slack: r3(slack) };
    }
  }
  if (!isFinite(touch.x)) touch = { x: 1, bar: 0, pr: null, band: null, thin: true };
  if (touch.x < touch.bar) fail.touch.push(touch);
  // github#186, decisions/0002 -- the eased tick, on a LIT note rather than the band edge
  let tick = { step: 0, rel: 0, pr: null, band: null };
  let tickEdge = { step: 0, rel: 0, pr: null, band: null };
  const edge = { i: null, o: null };
  for (const s of frames) {
    for (const b of ["i", "o"]) {
      const bd = s.bands && s.bands[b];
      const pitch = (s.pitch && s.pitch[b]) || 0;
      if (!bd || !bd.lit || !(pitch > 1e-6)) { edge[b] = null; continue; }
      const was = edge[b];
      if (was != null && populated(s, b)) {
        const rel = Math.abs(bd.rMax - was) / pitch;
        if (rel > tickEdge.rel) tickEdge = { step: Math.round(Math.abs(bd.rMax - was)), rel: r3(rel), pr: r3(s.pr), band: b, pitch: r2(pitch) };
      }
      edge[b] = bd.rMax;
      const ls = s.litStep && s.litStep[b];
      if (ls == null || !populated(s, b)) continue;
      const rel = ls / pitch;
      if (rel > tick.rel) {
        tick = { step: Math.round(ls), rel: r3(rel), pr: r3(s.pr), band: b, pitch: r2(pitch),
                 lit: bd.lit, node: s.litStepId ? s.litStepId[b] : null };
      }
    }
  }
  const tickSeen = frames.some((s) => s.litStep);
  if (tickSeen && tick.rel > TICK_REL) fail.tick.push(tick);

  const ok = { rails: !fail.rails.length, rest: !fail.rest.length, area: !fail.area.length,
               seam: !fail.seam.length, fill: !fail.fill.length, step: !fail.step.length,
               touch: !fail.touch.length, tick: !fail.tick.length };
  if (!ok.rails || !ok.rest || !ok.area || !ok.seam || !ok.fill || !ok.step || !ok.touch || !ok.tick) failures++;
  report[basename(dir)] = { label: P.label, frames: frames.length, ok, worst, rest,
                            counts: { rails: fail.rails.length, rest: fail.rest.length, area: fail.area.length,
                                      seam: fail.seam.length, fill: fail.fill.length, step: fail.step.length,
                                      touch: fail.touch.length, tick: fail.tick.length },
                            touch: touch, tick: tick,
                            railRows: fail.rails.slice(0, 6), seamWorstList, arcGap: arcGap.slice(0, 6),
                            stepList: fail.step.slice(0, 8) };

  const mark = (b) => (b ? "ok  " : "FAIL");
  console.log(`\n== ${P.label}  (${frames.length} cascade frames)`);
  console.log(`   RAILS ${mark(ok.rails)} ${fail.rails.length} frame-bands past a rail; worst top ${worst.over.toFixed(3)}x` +
              (worst.overAt ? ` (band ${worst.overAt.band} ${worst.overAt.rMax} of ${worst.overAt.top} @pr ${worst.overAt.pr})` : "") +
              `, worst row0 ${worst.under.toFixed(3)}x`);
  for (const x of fail.rails.slice(0, 3)) {
    console.log(`         pr ${x.pr} band ${x.band}: centre ${x.rMax} of top ${x.top} (${x.over}x, dot edge ${x.dotEdge}x), pitch ${x.pitch}`);
  }
  console.log(`   REST  ${mark(ok.rest)} ${fail.rest.length} frames past max(restA, restB, rail); worst ${worst.restX.toFixed(3)}x` +
              (worst.restAt ? ` (band ${worst.restAt.band} ${worst.restAt.rMax} of ${worst.restAt.bound} @pr ${worst.restAt.pr})` : ""));
  console.log(`   AREA  ${mark(ok.area)} ${fail.area.length} frames outside the two rests; worst ${worst.areaX.toFixed(3)}x` +
              (worst.areaAt ? ` (band ${worst.areaAt.band} ${worst.areaAt.area} against ${worst.areaAt.lo}..${worst.areaAt.hi} @pr ${worst.areaAt.pr})` : ""));
  for (const x of fail.area.slice(0, 3)) {
    console.log(`         pr ${x.pr} band ${x.band}: ${x.area} ${x.over ? "OVER" : "under"} ${x.over ? x.hi : x.lo} (${x.x}x)`);
  }
  console.log(`   SEAM  ${mark(ok.seam)} ${fail.seam.length} wedge-frames under their resting coverage`);
  for (const w of seamWorstList) {
    console.log(`         ${w.g.slice(0, 24).padEnd(26)} band ${w.band} worst ${r2(w.cover)} vs owed ${r2(w.owed)}` +
                ` (slack ${r2(w.slack)}) at pr ${w.pr}, arc ${r2(w.arc)} deg`);
  }
  for (const k of ["i", "o"]) {
    const t = rest[k];
    console.log(`   band ${k}: rest rMax ${t.aMax == null ? "-" : r2(t.aMax)} -> ${t.bMax == null ? "-" : r2(t.bMax)},` +
                ` rail ${r2(rails[k].top)}; area/note ${t.aArea == null ? "-" : r2(t.aArea)} -> ${t.bArea == null ? "-" : r2(t.bArea)}`);
  }
  console.log(`   FILL  ${mark(ok.fill)} ${fail.fill.length} wedges wider than their notes fill`);
  for (const a of arcGap.slice(0, 4)) {
    console.log(`         ${a.g.slice(0, 24).padEnd(26)} ${(1 + a.worst).toFixed(2)}x its resting fill -- arc ${a.arcFrac} deg over ${a.noteFrac} notes, at pr ${a.pr}`);
  }
  console.log(`   STEP  ${mark(ok.step)} ${fail.step.length} frames where a lit band's pitch jumps over ${(STEP_TOL * 100).toFixed(0)}%`);
  for (const x of fail.step.slice(0, 4)) {
    console.log(`         band ${x.band} pitch ${x.from} -> ${x.to} (${(x.rel * 100).toFixed(0)}%) at pr ${x.pr}, ${x.lit} notes lit`);
  }
  console.log(`   TOUCH ${mark(ok.touch)} top slot edge ${touch.x.toFixed(3)} of the rail against a ${touch.bar.toFixed(3)} bar` +
              (touch.pr != null ? ` (band ${touch.band}, ${touch.rows} live rows, ${touch.lit} lit @pr ${touch.pr})` : " -- never populated enough to assert") +
              (isFinite(touchThin.x) && touchThin.x < touch.x
                ? `; ${touchThin.x.toFixed(3)} while thinner (${touchThin.lit} lit @pr ${touchThin.pr}), not asserted` : ""));
  console.log(`   TICK  ${mark(ok.tick)} worst lit-note step ${tick.rel.toFixed(2)} of a pitch` +
              (tick.pr != null ? ` (${tick.step} units of a ${tick.pitch} pitch, band ${tick.band} @pr ${tick.pr})`
                               : tickSeen ? "" : " -- this run predates litStep, re-take it") +
              `; band edge ${tickEdge.rel.toFixed(2)} of a pitch, reported not asserted`);
}

if (!seen) { console.log(`no probe runs under ${ROOT}`); process.exit(1); }
if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(report, null, 2)); console.log(`\nwrote ${JSON_OUT}`); }
console.log(`\n${failures ? failures + " run(s) FAIL" : "all runs hold every criterion"}`);
process.exit(failures ? 1 : 0);
