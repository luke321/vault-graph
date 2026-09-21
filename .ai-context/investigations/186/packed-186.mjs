#!/usr/bin/env node
// INVESTIGATION TOOLING for github#186 -- "packed" as Lukas defined it on 2026-09-21: at all times
// every wedge has enough notes to touch both seam sides and the inner and outer rings. Per frame,
// from a probe run: seam coverage of every lit wedge (the angular span of its dots, at alpha >= 0.5,
// over the arc it was allotted) and ring reach of every band (outermost lit note against the
// band's locked top rail, innermost against its row-0 rail).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const sp = process.argv[2];
const runs = [["only03", "run-only03"], ["hide03", "run-eye03"], ["show03", "run-show03-film"], ["shapeInbox", "run-shape-tag-inbox2"]];
const angDiff = (a, b) => { let d = b - a; while (d < 0) d += 360; while (d >= 360) d -= 360; return d; };
const r2 = (x) => Math.round(x * 100) / 100;
const out = {};
for (const [key, dir] of runs) {
  const P = JSON.parse(readFileSync(join(sp, dir, "probe.json"), "utf8"));
  const rails = P.restA.rails;
  const S = P.samples.filter((s) => s.cascade && s.pr != null);
  const frameStat = (s) => {
    const covers = [];
    for (const w of s.wedges) {
      if (w.nStart == null || !(w.arc > 0.5)) continue;
      covers.push({ g: w.g, band: w.band, arc: w.arc, cover: Math.min(1, angDiff(w.nEnd, w.nStart) / w.arc) });
    }
    covers.sort((a, b) => a.cover - b.cover);
    const med = covers.length ? covers[Math.floor(covers.length / 2)].cover : null;
    const bands = {};
    for (const k of ["i", "o"]) {
      const b = s.bands[k]; if (!b || !b.lit) { bands[k] = null; continue; }
      const top = k === "i" ? rails.innerTop : rails.outerTop, row0 = k === "i" ? rails.innerRow0 : rails.outerRow0;
      const pitch = s.pitch ? s.pitch[k] : 0;
      bands[k] = { rMax: r2(b.rMax), rMin: r2(b.rMin), top, row0, pitch: r2(pitch),
                   reachTop: r2((b.rMax + pitch / 2) / top), reachBottom: r2((b.rMin - pitch / 2) / row0), crossesTop: b.rMax > top };
    }
    return { pr: +s.pr.toFixed(3), wedges: covers.length, median: med == null ? null : r2(med), min: covers.length ? r2(covers[0].cover) : null,
             minG: covers.length ? covers[0].g : null, under85: covers.filter((c) => c.cover < 0.85).length, bands,
             worst3: covers.slice(0, 3).map((c) => ({ g: c.g, band: c.band, arc: r2(c.arc), cover: r2(c.cover) })) };
  };
  const frames = S.map(frameStat);
  const restStat = (m) => {
    const covers = m.wedges.filter((w) => w.nStart != null && w.arc > 0.5).map((w) => ({ g: w.g, band: w.band, arc: r2(w.arc), cover: r2(Math.min(1, angDiff(w.nEnd, w.nStart) / w.arc)) })).sort((a, b) => a.cover - b.cover);
    const bands = {};
    for (const k of ["i", "o"]) { const b = m.bands[k]; if (!b.lit) { bands[k] = null; continue; }
      const top = k === "i" ? rails.innerTop : rails.outerTop; const pitch = (k === "i" ? m.plan.spInner * 0.8 : m.plan.sp) * 160; const room = m.plan.room[k];
      const dot = 11 / 28 * Math.min(pitch, 2.6 * 160) * Math.min(room * 0.92 / pitch, 2.6);   // the dotPx ceiling in graph px, as github#160 estimates it
      bands[k] = { rMax: r2(b.rMax), top, pitch: r2(pitch), rows: m.plan.rows[k], dotR: r2(dot), reachTopSlot: r2((b.rMax + pitch / 2) / top), reachTopDot: r2((b.rMax + dot) / top) }; }
    return { covers, bands, median: covers.length ? covers[Math.floor(covers.length / 2)].cover : null, min: covers.length ? covers[0] : null };
  };
  out[key] = { label: P.label, frames, restA: restStat(P.restA), restB: restStat(P.restB) };
  console.log(`\n== ${P.label}`);
  const pr = (m, tag) => console.log(`   ${tag}: ${m.covers.length} lit wedges, seam coverage median ${m.median}, min ${m.min ? m.min.cover + " (" + m.min.g + ", " + m.min.arc + " deg)" : "-"}; ` +
    ["i", "o"].map((k) => m.bands[k] ? `${k}: top row ${m.bands[k].rMax} of rail ${Math.round(m.bands[k].top)} (slot edge ${m.bands[k].reachTopSlot}, dot edge ${m.bands[k].reachTopDot}; ${m.bands[k].rows} rows @ ${m.bands[k].pitch}, dot r ${m.bands[k].dotR})` : `${k}: empty`).join("; "));
  pr(out[key].restA, "rest before"); pr(out[key].restB, "rest after ");
  console.log("   pr     wedges  median  min    (worst wedge)                 <0.85 | inner reach top   crosses | outer reach top   crosses");
  let next = 0;
  frames.forEach((f, i) => { if (f.pr >= next - 1e-9 || i === frames.length - 1) { next += 0.1;
    const bi = f.bands.i, bo = f.bands.o;
    console.log(`   ${f.pr.toFixed(3)}  ${String(f.wedges).padStart(5)}   ${String(f.median).padEnd(5)}   ${String(f.min).padEnd(5)}  ${(f.minG || "").slice(0, 22).padEnd(24)} ${String(f.under85).padStart(5)} | ${bi ? String(bi.reachTop).padEnd(16) + (bi.crossesTop ? "YES" : "no ") : "empty           -  "} | ${bo ? String(bo.reachTop).padEnd(16) + (bo.crossesTop ? "YES" : "no ") : "empty           -  "}`); } });
  const crossI = frames.filter((f) => f.bands.i && f.bands.i.crossesTop).length, crossO = frames.filter((f) => f.bands.o && f.bands.o.crossesTop).length;
  const worstMed = frames.reduce((a, f) => f.median != null && f.median < a.v ? { v: f.median, pr: f.pr } : a, { v: 2, pr: 0 });
  console.log(`   frames with the top row past the rail: inner ${crossI}/${frames.length}, outer ${crossO}/${frames.length}; lowest median seam coverage ${worstMed.v} at pr ${worstMed.pr}`);
}
writeFileSync(join(sp, "packed-data.json"), JSON.stringify(out));
console.log("\nwrote packed-data.json");
