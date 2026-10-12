#!/usr/bin/env node
// INVESTIGATION TOOLING for github#186 -- reads a probe.json written by probe-186.mjs and prints
// the numbers: resting layouts before/after, and per frame the wedge arc each group is allotted
// against the opacity inside it, the seam reservation, and the radial extent of each band.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

const file = process.argv[2];
const P = JSON.parse(readFileSync(file, "utf8"));
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const pad = (v, w) => String(v).padStart(w);

console.log(`== ${P.label}\n   act ${P.act}${P.dim ? " (dim " + P.dim + ")" : ""}, slow x${P.slow}; cascade ${P.lastCascade.frames} frames / ${P.lastCascade.ms} ms, exit "${P.lastCascade.exit}", ins ${P.lastCascade.ins} outs ${P.lastCascade.outs}`);

function restLine(tag, m) {
  const rl = m.rails, b = m.bands, pl = m.plan;
  const innerThick = rl.innerTop - rl.innerRow0, outerThick = rl.outerTop - rl.outerRow0;
  console.log(`\n-- ${tag}: dim ${m.dim}, lit ${m.density.lit}/${m.density.shown} shown, reach ${m.density.reach}, holeShare ${m.density.holeShare}`);
  console.log(`   rails (graph px): inner row0 ${r1(rl.innerRow0)} .. top ${r1(rl.innerTop)} (thick ${r1(innerThick)}); outer row0 ${r1(rl.outerRow0)} .. maxR ${r1(rl.outerTop)} (thick ${r1(outerThick)}); r0 ${r1(rl.r0)} rOuter ${r1(rl.rOuter)}`);
  for (const k of ["i", "o"]) {
    const bb = b[k], thick = k === "i" ? innerThick : outerThick, row0 = k === "i" ? rl.innerRow0 : rl.outerRow0;
    const rows = pl ? pl.rows[k] : "?", sp = pl ? (k === "i" ? pl.spInner : pl.sp) : 0;
    const pitchPx = sp * 160 * (k === "i" ? 0.8 : 1);
    const spanPx = bb.lit ? bb.rMax - bb.rMin : 0;
    const fill = bb.lit ? (spanPx + pitchPx) / (thick + pitchPx) : 0;
    console.log(`   band ${k}: ${bb.lit} lit of ${bb.n}; notes span ${r1(bb.rMin)} .. ${r1(bb.rMax)} on ${bb.rowsUsed} radii; plan rows ${rows} @ pitch ${r1(pitchPx)}px; ` +
                `radial fill of locked band ${(100 * fill).toFixed(0)}% (short of top by ${r1((k === "i" ? rl.innerTop : rl.outerTop) - bb.rMax)}px); ` +
                `seams: ${m.seams[k].nB} boundaries x ${r3(m.seams[k].deg)} deg = ${r1(m.seams[k].nB * m.seams[k].deg)} deg of 360; room ${pl ? r1(pl.room[k]) : "?"}`);
  }
  const ws = m.wedges.slice().sort((a, c) => a.band.localeCompare(c.band) || a.start - c.start);
  for (const w of ws) {
    const g = m.groups[w.g] || {};
    // nStart/nEnd are sweepAngle() degrees, which DEcrease clockwise, so the span runs end -> start
    const noteSpan = w.nStart != null ? angDiff(w.nEnd, w.nStart) : null;
    console.log(`     ${w.band} ${w.g.padEnd(22)} arc ${pad(r1(w.arc), 6)} deg  notes ${pad(g.lit || 0, 4)}/${pad(g.n || 0, 4)}  alphaSum ${pad(r1(g.alphaSum || 0), 7)}` +
                (noteSpan != null ? `  dots occupy ${pad(r1(noteSpan), 6)} deg of it (${(100 * noteSpan / Math.max(1e-9, w.arc)).toFixed(0)}%)` : "  dots occupy (none lit)"));
  }
}
function angDiff(a, b) { let d = b - a; while (d < 0) d += 360; while (d >= 360) d -= 360; return d; }

restLine("REST BEFORE", P.restA);
restLine("REST AFTER (cascade landed)", P.restB);
restLine("REST AFTER, fresh relayout()", P.restFresh);

// --- the frames
const S = P.samples.filter((s) => s.cascade);
if (!S.length) { console.log("\nno cascade frames sampled"); process.exit(0); }
const t0 = S[0].t;
const groups = Object.keys(S[0].groups);
const g0 = P.restA.groups, gEnd = P.restB.groups;
// which groups change
const changing = groups.filter((g) => Math.abs((g0[g] ? g0[g].alphaSum : 0) - (gEnd[g] ? gEnd[g].alphaSum : 0)) > 0.5);
const leaving = changing.filter((g) => (g0[g] ? g0[g].alphaSum : 0) > (gEnd[g] ? gEnd[g].alphaSum : 0));
const arriving = changing.filter((g) => !leaving.includes(g));
const staying = groups.filter((g) => !changing.includes(g) && g0[g] && g0[g].alphaSum > 0.5);
console.log(`\n-- frames: ${S.length} cascade frames over ${r1(S[S.length - 1].t - t0)} ms; leaving ${JSON.stringify(leaving)}, arriving ${JSON.stringify(arriving)}, staying ${JSON.stringify(staying)}`);

const arcOf = (s, g) => { let a = 0; for (const w of s.wedges) if (w.g === g) a += w.arc; return a; };
const noteArcOf = (s, g) => { let a = null; for (const w of s.wedges) if (w.g === g && w.nStart != null) a = (a || 0) + angDiff(w.nEnd, w.nStart); return a; };
const arc0 = {}, arcEnd = {};
for (const g of groups) { arc0[g] = arcOf(S[0], g); arcEnd[g] = arcOf(S[S.length - 1], g); }

// per-frame table, every ~5% of progress
console.log("\n   pr     ease   | " + changing.map((g) => (g.slice(0, 10) + " arc%  alpha%").padStart(22)).join(" | ") +
            " | seamI(deg) seamO(deg) | innerR min..max  outerR min..max | " + staying.map((g) => g.slice(0, 8) + " notes/arc%").join(" "));
let nextPr = 0;
const rows = [];
for (let i = 0; i < S.length; i++) {
  const s = S[i], pr = s.pr == null ? i / (S.length - 1) : s.pr;
  const row = {
    i, pr, t: s.t - t0,
    ease: pr * pr * (3 - 2 * pr),
    chg: changing.map((g) => {
      const A0 = g0[g] ? g0[g].alphaSum : 0, A1 = gEnd[g] ? gEnd[g].alphaSum : 0;
      const a = s.groups[g] ? s.groups[g].alphaSum : 0;
      const alphaFrac = leaving.includes(g) ? a / Math.max(1e-9, A0) : a / Math.max(1e-9, A1);
      const ar = arcOf(s, g);
      const arcFrac = leaving.includes(g) ? ar / Math.max(1e-9, arc0[g]) : ar / Math.max(1e-9, arcEnd[g]);
      return { g, alphaFrac, arcFrac, arc: ar, alpha: a };
    }),
    seamI: s.seams.i.nB * s.seams.i.deg, seamO: s.seams.o.nB * s.seams.o.deg,
    bi: s.bands.i, bo: s.bands.o,
    stay: staying.map((g) => ({ g, arc: arcOf(s, g), noteArc: noteArcOf(s, g), lit: s.groups[g] ? s.groups[g].lit : 0 })),
  };
  rows.push(row);
  if (pr >= nextPr - 1e-9 || i === S.length - 1) {
    nextPr += 0.05;
    console.log(`   ${pr.toFixed(3)}  ${row.ease.toFixed(3)}  | ` +
      row.chg.map((c) => `${pad((100 * c.arcFrac).toFixed(1), 12)} ${pad((100 * c.alphaFrac).toFixed(1), 8)}`).join(" | ") +
      ` | ${pad(r1(row.seamI), 9)} ${pad(r1(row.seamO), 9)} | ${pad(r1(row.bi.rMin), 6)}..${pad(r1(row.bi.rMax), 6)}  ${pad(r1(row.bo.rMin), 6)}..${pad(r1(row.bo.rMax), 6)} | ` +
      row.stay.map((x) => `${pad(x.lit, 4)}/${pad(r1(x.arc), 6)}deg${x.noteArc != null ? " dots " + (100 * x.noteArc / Math.max(1e-9, x.arc)).toFixed(0) + "%" : ""}`).join(" "));
  }
}

// steps: biggest single-frame change of each quantity, and where arc leads/lags alpha
console.log("\n-- per-frame steps (max single-frame change):");
for (const g of changing) {
  let dArc = 0, dAlpha = 0, atArc = 0, atAlpha = 0, lead = 0, leadAt = 0, lagSum = 0;
  let crossArc = null, crossAlpha = null;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i].chg.find((c) => c.g === g), b = rows[i - 1].chg.find((c) => c.g === g);
    const da = Math.abs(a.arcFrac - b.arcFrac), dl = Math.abs(a.alphaFrac - b.alphaFrac);
    if (da > dArc) { dArc = da; atArc = rows[i].pr; }
    if (dl > dAlpha) { dAlpha = dl; atAlpha = rows[i].pr; }
    const diff = a.arcFrac - a.alphaFrac;
    if (Math.abs(diff) > Math.abs(lead)) { lead = diff; leadAt = rows[i].pr; }
    lagSum += diff;
    if (crossArc === null && (leaving.includes(g) ? a.arcFrac <= 0.5 : a.arcFrac >= 0.5)) crossArc = rows[i].pr;
    if (crossAlpha === null && (leaving.includes(g) ? a.alphaFrac <= 0.5 : a.alphaFrac >= 0.5)) crossAlpha = rows[i].pr;
  }
  console.log(`   ${g.padEnd(22)} ${leaving.includes(g) ? "leaving " : "arriving"}: arc step max ${(100 * dArc).toFixed(2)}%/frame @pr ${atArc.toFixed(2)}; alpha step max ${(100 * dAlpha).toFixed(2)}%/frame @pr ${atAlpha.toFixed(2)}; ` +
              `arc-minus-alpha worst ${(100 * lead).toFixed(1)}% @pr ${leadAt.toFixed(2)}, mean ${(100 * lagSum / rows.length).toFixed(1)}%; arc crosses 50% at pr ${crossArc == null ? "-" : crossArc.toFixed(2)}, alpha at pr ${crossAlpha == null ? "-" : crossAlpha.toFixed(2)}`);
}
let dSeamI = 0, dSeamO = 0, dRi = 0, dRo = 0;
for (let i = 1; i < rows.length; i++) {
  dSeamI = Math.max(dSeamI, Math.abs(rows[i].seamI - rows[i - 1].seamI));
  dSeamO = Math.max(dSeamO, Math.abs(rows[i].seamO - rows[i - 1].seamO));
  if (rows[i].bi.lit && rows[i - 1].bi.lit) dRi = Math.max(dRi, Math.abs(rows[i].bi.rMax - rows[i - 1].bi.rMax), Math.abs(rows[i].bi.rMin - rows[i - 1].bi.rMin));
  if (rows[i].bo.lit && rows[i - 1].bo.lit) dRo = Math.max(dRo, Math.abs(rows[i].bo.rMax - rows[i - 1].bo.rMax), Math.abs(rows[i].bo.rMin - rows[i - 1].bo.rMin));
}
console.log(`   seam total step max: inner ${r2(dSeamI)} deg/frame, outer ${r2(dSeamO)} deg/frame; band extent step max: inner ${r1(dRi)} px/frame, outer ${r1(dRo)} px/frame`);
console.log(`   page probe: radMaxStep ${JSON.stringify(P.probeReport.radMaxStep)}, tanMaxStep ${P.probeReport.tanMaxStep} (${P.probeReport.tanStepNode} @${P.probeReport.tanStepAtMs}ms), ngMaxStep ${P.probeReport.ngMaxStep}, startMaxStep ${P.probeReport.startMaxStep} deg (${P.probeReport.startStepGroup}), settle ${JSON.stringify(P.probeReport.settleStep)}`);
if (P.errors && P.errors.length) console.log("   PAGE ERRORS: " + P.errors.map((e) => e.text).join(" | "));

// --- extended fields (second sampler): pitch per band, per-group extent/cells, watched notes
if (S[0].pitch) {
  const A = P.restA, B = P.restB;
  const thick = { i: A.rails.innerTop - A.rails.innerRow0, o: A.rails.outerTop - A.rails.outerRow0 };
  const areaPerNote = (b, p) => {
    if (!(b.lit > 0) || !(b.alphaSum > 0.5)) return null;
    const ro = b.rMax + p / 2, ri = Math.max(0, b.rMin - p / 2);
    return Math.PI * (ro * ro - ri * ri) / b.alphaSum;
  };
  const restApn = {};
  for (const k of ["i", "o"]) {
    const pA = (k === "i" ? A.plan.spInner * 0.8 : A.plan.sp) * 160;
    restApn[k] = areaPerNote(Object.assign({ alphaSum: A.bands[k].lit }, A.bands[k]), pA);
  }
  console.log("\n-- radial walk per band (pitch is the band's live row pitch; 'top' is the outermost lit note; band top rail inner " + r1(A.rails.innerTop) + ", outer " + r1(A.rails.outerTop) + "):");
  console.log("   pr     | inner: pitch   top    area/note vs rest | outer: pitch   top    area/note vs rest | liveMaxR");
  nextPr = 0;
  let peak = { i: { v: -Infinity, pr: 0 }, o: { v: -Infinity, pr: 0 } }, peakApn = { i: { v: 0, pr: 0 }, o: { v: 0, pr: 0 } };
  for (let i = 0; i < S.length; i++) {
    const s = S[i], pr = s.pr == null ? i / (S.length - 1) : s.pr;
    const cols = ["i", "o"].map((k) => {
      const b = s.bands[k], p = s.pitch[k];
      const apn = areaPerNote(b, p);
      const rel = apn && restApn[k] ? apn / restApn[k] : null;
      if (b.lit && b.rMax > peak[k].v) peak[k] = { v: b.rMax, pr };
      if (rel && rel > peakApn[k].v) peakApn[k] = { v: rel, pr };
      return `${pad(r1(p), 6)} ${pad(b.lit ? r1(b.rMax) : "-", 7)} ${pad(rel ? rel.toFixed(2) + "x" : "-", 9)}`;
    });
    if (pr >= nextPr - 1e-9 || i === S.length - 1) {
      nextPr += 0.1;
      console.log(`   ${pr.toFixed(3)}  | ${cols[0]}         | ${cols[1]}         | ${s.liveMaxR}`);
    }
  }
  for (const k of ["i", "o"]) {
    const endTop = B.bands[k].lit ? B.bands[k].rMax : null;
    console.log(`   band ${k}: outermost lit note peaks at ${r1(peak[k].v)} px @pr ${peak[k].pr.toFixed(2)} (rest before ${r1(A.bands[k].rMax)}, rest after ${endTop == null ? "empty" : r1(endTop)}, top rail ${r1(k === "i" ? A.rails.innerTop : A.rails.outerTop)}, locked maxR ${r1(A.rails.maxR)}); ` +
                `area per lit note peaks at ${peakApn[k].v.toFixed(2)}x rest @pr ${peakApn[k].pr.toFixed(2)}; plan pitch A ${r1((k === "i" ? A.plan.spInner * 0.8 : A.plan.sp) * 160)} -> B ${r1((k === "i" ? B.plan.spInner * 0.8 : B.plan.sp) * 160)} px`);
  }
  console.log("\n-- per group: cell count flips and radial overshoot of the outermost lit note beyond BOTH resting ends:");
  for (const g of groups) {
    let cells0 = S[0].groups[g].cells, flips = 0, rMaxPeak = 0, prPeak = 0;
    const endA = A.groups[g] && A.groups[g].lit ? null : null;
    for (const s of S) {
      const gg = s.groups[g];
      if (gg.cells !== cells0 && gg.lit) { flips++; cells0 = gg.cells; }
      if (gg.lit && gg.rMax > rMaxPeak) { rMaxPeak = gg.rMax; prPeak = s.pr; }
    }
    const a = S[0].groups[g], b = S[S.length - 1].groups[g];
    const restMax = Math.max(a.lit ? a.rMax : 0, b.lit ? b.rMax : 0);
    if (!a.lit && !b.lit) continue;
    console.log(`   ${g.padEnd(22)} cells ${S[0].groups[g].cells} -> ${b.cells} (${flips} flip${flips === 1 ? "" : "s"} while lit); outermost lit note ${r1(rMaxPeak)} @pr ${prPeak == null ? "-" : prPeak.toFixed(2)} vs ${r1(restMax)} at the ends (${restMax ? "+" + (100 * (rMaxPeak / restMax - 1)).toFixed(0) + "%" : "-"})`);
  }
  console.log("\n-- watched notes (alpha per frame): max single-frame change, reversals, and the radial step while visible:");
  for (const id of P.samples[0] && Object.keys(S[0].watched)) {
    let dMax = 0, rev = 0, dir = 0, drMax = 0, first = null, last = null, prev = null;
    for (const s of S) {
      const w = s.watched[id];
      if (prev) {
        const d = w.al - prev.al;
        if (Math.abs(d) > dMax) dMax = Math.abs(d);
        const sg = d > 1e-4 ? 1 : d < -1e-4 ? -1 : 0;
        if (sg && dir && sg !== dir) rev++;
        if (sg) dir = sg;
        if (w.al > 0.05 && prev.al > 0.05) drMax = Math.max(drMax, Math.abs(w.r - prev.r));
      }
      if (first === null && prev && Math.abs(w.al - prev.al) > 1e-4) first = s.pr;
      if (prev && Math.abs(w.al - prev.al) > 1e-4) last = s.pr;
      prev = w;
    }
    const g = P.samples[0] ? "" : "";
    console.log(`   note ${String(id).padEnd(6)} alpha ${S[0].watched[id].al} -> ${S[S.length - 1].watched[id].al}: fades between pr ${first == null ? "-" : first.toFixed(2)} and ${last == null ? "-" : last.toFixed(2)}, max step ${(100 * dMax).toFixed(1)}%/frame, ${rev} reversal${rev === 1 ? "" : "s"}; max radial step while visible ${r1(drMax)} px/frame`);
  }
}

// csv for plotting
const csv = ["pr,ease,t_ms,seamI_deg,seamO_deg,inner_rMin,inner_rMax,outer_rMin,outer_rMax," +
  changing.map((g) => `${g}_arcFrac,${g}_alphaFrac`).join(",") + "," + staying.map((g) => `${g}_arc,${g}_noteArc`).join(",")];
for (const r of rows) {
  csv.push([r.pr.toFixed(4), r.ease.toFixed(4), r1(r.t), r2(r.seamI), r2(r.seamO), r1(r.bi.rMin), r1(r.bi.rMax), r1(r.bo.rMin), r1(r.bo.rMax),
    ...r.chg.flatMap((c) => [r3(c.arcFrac), r3(c.alphaFrac)]), ...r.stay.flatMap((x) => [r1(x.arc), x.noteArc == null ? "" : r1(x.noteArc)])].join(","));
}
writeFileSync(join(dirname(file), "frames.csv"), csv.join("\n") + "\n");
console.log("   wrote " + join(dirname(file), "frames.csv"));
