#!/usr/bin/env node
// INVESTIGATION TOOLING for github#186 -- condenses the probe runs into one small JSON the review
// page draws its charts from: per act, every 3rd cascade frame with pr, band pitch/top/area-per-note
// (relative to rest before), and arc% vs alpha% for a few named groups.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const sp = process.argv[2];
const runs = [
  { key: "only03", dir: "run-only03", groups: ["00 - Inbox", "01 - Projects", "07 - Weekly Reviews", "13 - Someday Maybe"] },
  { key: "hide03", dir: "run-eye03", groups: ["03 - Resources"] },
  { key: "show03", dir: "run-show03-film", groups: ["03 - Resources"] },
  { key: "shapeInbox", dir: "run-shape-tag-inbox2", groups: ["inbox", "(untagged)"] },
];
const out = {};
const angDiff = (a, b) => { let d = b - a; while (d < 0) d += 360; while (d >= 360) d -= 360; return d; };
for (const r of runs) {
  const P = JSON.parse(readFileSync(join(sp, r.dir, "probe.json"), "utf8"));
  const S = P.samples.filter((s) => s.cascade && s.pr != null);
  const A = P.restA, B = P.restB;
  const apn = (b, p) => (b.lit > 0 && b.alphaSum > 0.5) ? Math.PI * ((b.rMax + p / 2) ** 2 - Math.max(0, b.rMin - p / 2) ** 2) / b.alphaSum : null;
  const rest = {};
  for (const k of ["i", "o"]) {
    const pA = (k === "i" ? A.plan.spInner * 0.8 : A.plan.sp) * 160;
    rest[k] = apn(Object.assign({}, A.bands[k], { alphaSum: A.bands[k].lit }), pA);
  }
  const arcOf = (s, g) => { let a = 0; for (const w of s.wedges) if (w.g === g) a += w.arc; return a; };
  const g0 = {}, gEnd = {};
  for (const g of r.groups) { g0[g] = arcOf(S[0], g); gEnd[g] = arcOf(S[S.length - 1], g); }
  const frames = [];
  for (let i = 0; i < S.length; i += 3) {
    const s = S[i];
    const f = { pr: +s.pr.toFixed(3), i: {}, o: {}, g: {} };
    for (const k of ["i", "o"]) {
      const b = s.bands[k], p = s.pitch[k], v = apn(b, p);
      f[k] = { pitch: Math.round(p), top: b.lit ? Math.round(b.rMax) : null, apn: v && rest[k] ? +(v / rest[k]).toFixed(2) : null };
    }
    for (const g of r.groups) {
      const A0 = A.groups[g] ? A.groups[g].alphaSum : 0, A1 = B.groups[g] ? B.groups[g].alphaSum : 0;
      const leaving = A0 > A1;
      const a = s.groups[g] ? s.groups[g].alphaSum : 0;
      f.g[g] = { alpha: +(leaving ? a / Math.max(1e-9, A0) : a / Math.max(1e-9, A1)).toFixed(3),
                 arc: +(leaving ? arcOf(s, g) / Math.max(1e-9, g0[g]) : arcOf(s, g) / Math.max(1e-9, gEnd[g])).toFixed(3),
                 arcDeg: +arcOf(s, g).toFixed(1) };
    }
    frames.push(f);
  }
  out[r.key] = {
    label: P.label, act: P.act, dim: P.dim, frames,
    rails: A.rails,
    restBefore: { i: { top: Math.round(A.bands.i.rMax), pitch: Math.round(A.plan.spInner * 0.8 * 160), rows: A.plan.rows.i, lit: A.bands.i.lit },
                  o: { top: Math.round(A.bands.o.rMax), pitch: Math.round(A.plan.sp * 160), rows: A.plan.rows.o, lit: A.bands.o.lit } },
    restAfter: { i: { top: B.bands.i.lit ? Math.round(B.bands.i.rMax) : null, pitch: Math.round(B.plan.spInner * 0.8 * 160), rows: B.plan.rows.i, lit: B.bands.i.lit,
                      apn: rest.i && B.bands.i.lit ? +(apn(Object.assign({}, B.bands.i, { alphaSum: B.bands.i.lit }), B.plan.spInner * 0.8 * 160) / rest.i).toFixed(2) : null },
                 o: { top: B.bands.o.lit ? Math.round(B.bands.o.rMax) : null, pitch: Math.round(B.plan.sp * 160), rows: B.plan.rows.o, lit: B.bands.o.lit,
                      apn: rest.o && B.bands.o.lit ? +(apn(Object.assign({}, B.bands.o, { alphaSum: B.bands.o.lit }), B.plan.sp * 160) / rest.o).toFixed(2) : null } },
    cascade: P.lastCascade,
  };
}
writeFileSync(join(sp, "chart-data.json"), JSON.stringify(out));
console.log("wrote chart-data.json: " + Object.keys(out).map((k) => k + " " + out[k].frames.length + " frames").join(", "));
