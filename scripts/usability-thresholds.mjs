#!/usr/bin/env node
// github#200 -- see .ai-context/usability-thresholds.md
import { pathToFileURL } from "node:url";

export const SOURCES = {
  wcag258: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum",
  wcag255: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced",
  wcag143: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum",
  wcag1411: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast",
  wcag1413: "https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus",
  wcag251: "https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures",
  wcag257: "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements",
  appleHig: "https://developer.apple.com/design/human-interface-guidelines/accessibility",
  material: "https://support.google.com/accessibility/android/answer/7101858",
  microsoft: "https://learn.microsoft.com/windows/apps/design/input/guidelines-for-targeting",
  parhi2006: "https://doi.org/10.1145/1152215.1152260",
  hoober2013: "https://www.uxmatters.com/mt/archives/2013/11/design-for-fingers-and-thumbs-instead-of-touch.php",
  holz2010: "https://www.christianholz.net/generalized_perceived_input_point_model",
  hourcade2006: "https://course.ccs.neu.edu/csg170/ssl/hourcade06.pdf",
  cssPx: "https://www.w3.org/TR/css-values-4/#reference-pixel",
  acuity: "https://eyewiki.org/Visual_Acuity_Testing_in_Adults",
  hfes100: "https://hfes.org/Publications/Technical-Standards",
  bababekova2011: "https://pubmed.ncbi.nlm.nih.gov/21499163/",
  osha: "https://www.osha.gov/etools/computer-workstations/components/monitors",
  stone2014: "https://graphics.cs.wisc.edu/Papers/2014/SAS14/2014CIC_48_Stone_v3.pdf",
  machado2009: "https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html",
  android: "https://developer.android.com/reference/android/view/ViewConfiguration",
  mq4: "https://www.w3.org/TR/mediaqueries-4/#hover",
};

export const T = {
  targetMin: { px: 24, src: "wcag258", what: "WCAG 2.5.8 AA: target >= 24x24 CSS px, or a 24 px circle on its centre clear of other targets" },
  targetEnhanced: { px: 44, src: "wcag255", what: "WCAG 2.5.5 AAA: target >= 44x44 CSS px" },
  apple: { px: 44, src: "appleHig", what: "Apple HIG: hit target >= 44x44 pt (1 pt = 1 CSS px in iOS Safari)" },
  material: { px: 48, gap: 8, src: "material", what: "Material / Android: >= 48x48 dp with >= 8 dp between targets" },
  microsoft: { mm: 7.5, src: "microsoft", what: "Microsoft Fluent: touch target 7.5 mm (40 epx)" },
  hooberCentre: { mm: 7, src: "hoober2013", what: "Hoober: finger accuracy ~7 mm at screen centre (10-12 mm at top/bottom edges)" },
  hooberEdge: { mm: 11, src: "hoober2013", what: "Hoober: 10-12 mm spacing at top and bottom edges" },
  parhi: { mm: 9.2, serialMm: 9.6, src: "parhi2006", what: "Parhi et al. 2006: 9.2 mm discrete / 9.6 mm serial thumb targets" },
  holz: { mm: 4.9, src: "holz2010", what: "Holz & Baudisch 2010: 4.9 mm is the floor even with per-user offset correction" },
  olderMouse: { px: 24, src: "hourcade2006", what: "Hourcade 2006: 65-84 year-olds err on 16 px targets, recover at 24 px" },
  acuity: { arcmin: 1, src: "acuity", what: "20/20 resolves 1 arcmin of detail (logMAR 0)" },
  optotype: { arcmin: 5, src: "acuity", what: "a 20/20 letter subtends 5 arcmin -- the smallest shape a normal eye identifies" },
  olderAcuity: { arcmin: 1.6, src: "acuity", what: "20/32 (logMAR 0.2), common best-corrected acuity past 70" },
  symbolMin: { arcmin: 16, src: "hfes100", what: "ANSI/HFES 100: 16 arcmin minimum character/symbol height" },
  symbolGood: { arcmin: 20, src: "hfes100", what: "ANSI/HFES 100: 20-22 arcmin preferred character height" },
  colourSizeFloor: { deg: 1 / 3, src: "stone2014", what: "Stone et al. 2014 measured colour difference down to 1/3 deg (20 arcmin); smaller is extrapolation" },
  textContrast: { ratio: 4.5, large: 3, src: "wcag143", what: "WCAG 1.4.3 AA: 4.5:1 text, 3:1 large (>= 24 px, or >= 18.66 px bold)" },
  uiContrast: { ratio: 3, src: "wcag1411", what: "WCAG 1.4.11 AA: 3:1 for graphical objects and UI parts" },
  touchSlop: { px: 8, src: "android", what: "Android touch slop 8 dp before a touch becomes a scroll" },
  doubleTapMs: { ms: 300, src: "android", what: "Android double-tap timeout 300 ms" },
  doubleTapSlop: { px: 100, src: "android", what: "Android double-tap slop 100 dp between the two taps" },
};

// github#200 -- mmPerPx from CSS px per inch; distance in cm
export const PROFILES = {
  "phone-small": { w: 375, h: 667, dpr: 2, cssPpi: 163, coarse: true, cm: 33, what: "iPhone SE class, held close" },
  phone: { w: 390, h: 844, dpr: 3, cssPpi: 153, coarse: true, cm: 36, what: "iPhone 14 class; 36 cm per Bababekova 2011" },
  tablet: { w: 820, h: 1180, dpr: 2, cssPpi: 132, coarse: true, cm: 40, what: "iPad Air class" },
  laptop: { w: 1470, h: 956, dpr: 2, cssPpi: 113, coarse: false, cm: 50, what: "13.6 in laptop at its default scale" },
  desktop: { w: 1920, h: 1080, dpr: 1, cssPpi: 92, coarse: false, cm: 65, what: "24 in 1080p at 100%; OSHA 50-100 cm" },
  "desktop-large": { w: 2560, h: 1440, dpr: 1, cssPpi: 109, coarse: false, cm: 70, what: "27 in 1440p at 100%" },
  sidebar: { w: 320, h: 900, dpr: 1, cssPpi: 92, coarse: false, cm: 65, what: "an Obsidian side leaf on that desktop" },
};

/** @param {{ cssPpi: number }} p */
export const mmPerPx = (p) => 25.4 / p.cssPpi;

/** @param {number} mm @param {number} cm */
export const arcmin = (mm, cm) => 2 * Math.atan(mm / (2 * cm * 10)) * 180 / Math.PI * 60;

/** @param {string} s @returns {[number, number, number, number] | null} */
export function parseColour(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((v) => v.endsWith("%") ? parseFloat(v) / 100 * 255 : parseFloat(v));
    return [p[0], p[1], p[2], p.length > 3 ? (m[1].includes("%") && p[3] > 1 ? p[3] / 255 : p[3]) : 1];
  }
  return null;
}

/** @param {number[]} top @param {number[]} under */
export function over(top, under) {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
}

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const unlin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** @param {number[]} rgb */
export const luminance = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);

/** @param {number[]} a @param {number[]} b */
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// github#200 -- Machado 2009, severity 1.0, applied in linear RGB
export const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};

/** @param {number[]} rgb @param {keyof typeof CVD} kind */
export function simulate(rgb, kind) {
  const M = CVD[kind], l = [lin(rgb[0]), lin(rgb[1]), lin(rgb[2])];
  return M.map((row) => Math.max(0, Math.min(255, unlin(Math.max(0, Math.min(1, row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))))));
}

/** @param {number[]} rgb @returns {[number, number, number]} */
export function cielab(rgb) {
  const [r, g, b] = [lin(rgb[0]), lin(rgb[1]), lin(rgb[2])];
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

// github#200 -- Stone, Szafir & Setlur 2014, Table 3: ND(50) = C + K / s
export const ND50 = { C: [5.079, 5.339, 5.349], K: [0.751, 1.541, 2.871] };

/** @param {number[]} a @param {number[]} b @param {number} deg -- >= 1 means half of viewers see a difference */
export function noticeable(a, b, deg) {
  const p = cielab(a), q = cielab(b);
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const nd = ND50.C[i] + ND50.K[i] / deg;
    s += ((p[i] - q[i]) / nd) ** 2;
  }
  return Math.sqrt(s);
}

/**
 * github#200 -- nearest centre per point, grid-hashed
 * @param {{ x: number, y: number }[]} pts @returns {number[]}
 */
export function nearest(pts) {
  const out = new Array(pts.length).fill(Infinity);
  if (pts.length < 2) return out;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const cell = Math.max(1, Math.sqrt(((maxX - minX) * (maxY - minY) || 1) / pts.length) * 2);
  /** @type {Map<string, number[]>} */
  const grid = new Map();
  pts.forEach((p, i) => {
    const k = Math.floor((p.x - minX) / cell) + "," + Math.floor((p.y - minY) / cell);
    const list = grid.get(k);
    if (list) list.push(i); else grid.set(k, [i]);
  });
  pts.forEach((p, i) => {
    const cx = Math.floor((p.x - minX) / cell), cy = Math.floor((p.y - minY) / cell);
    for (let ring = 1; ring < 1e6; ring++) {
      for (let gx = cx - ring; gx <= cx + ring; gx++) {
        for (let gy = cy - ring; gy <= cy + ring; gy++) {
          for (const j of grid.get(gx + "," + gy) || []) {
            if (j === i) continue;
            const d = Math.hypot(pts[j].x - p.x, pts[j].y - p.y);
            if (d < out[i]) out[i] = d;
          }
        }
      }
      if (out[i] <= (ring - 1) * cell || ring * cell > (maxX - minX) + (maxY - minY) + cell) break;
    }
  });
  return out;
}

/**
 * github#200 -- WCAG 2.5.8's spacing rule
 * @param {{ x: number, y: number, w: number, h: number }[]} boxes @returns {boolean[]}
 */
export function spacingPass(boxes) {
  const R = T.targetMin.px / 2;
  const small = boxes.map((b) => b.w < T.targetMin.px || b.h < T.targetMin.px);
  const c = boxes.map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }));
  return boxes.map((a, i) => {
    if (!small[i]) return true;
    for (let j = 0; j < boxes.length; j++) {
      if (j === i) continue;
      const b = boxes[j];
      if (small[j]) { if (Math.hypot(c[j].x - c[i].x, c[j].y - c[i].y) < 2 * R) return false; continue; }
      const qx = Math.max(b.x, Math.min(c[i].x, b.x + b.w)), qy = Math.max(b.y, Math.min(c[i].y, b.y + b.h));
      if (Math.hypot(qx - c[i].x, qy - c[i].y) < R) return false;
    }
    return true;
  });
}

function selftest() {
  const fails = [];
  const near = (name, got, want, tol) => { if (!(Math.abs(got - want) <= tol)) fails.push(`${name}: ${got} vs ${want}`); };
  near("CSS reference pixel, deg", arcmin(25.4 / 96, 71.12) / 60, 0.0213, 0.0002);
  near("contrast black/white", contrast([0, 0, 0], [255, 255, 255]), 21, 1e-9);
  for (const k of /** @type {(keyof typeof CVD)[]} */ (Object.keys(CVD))) {
    const g = simulate([128, 128, 128], k);
    near(k + " keeps grey", Math.max(...g) - Math.min(...g), 0, 1.5);
  }
  near("Lab of white L", cielab([255, 255, 255])[0], 100, 0.01);
  near("ND50 L at 2 deg", ND50.C[0] + ND50.K[0] / 2, 5.454, 0.001);
  near("ND50 b at 1/3 deg", ND50.C[2] + ND50.K[2] * 3, 13.96, 0.01);
  const nn = nearest([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 100, y: 0 }]);
  near("nearest 0", nn[0], 5, 1e-9);
  near("nearest 2", nn[2], Math.hypot(97, 4), 1e-9);
  const sp = spacingPass([{ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 0, w: 10, h: 10 }, { x: 45, y: 0, w: 10, h: 10 }]);
  if (sp.join() !== "true,false,false") fails.push("spacingPass " + sp.join());
  const pc = parseColour("rgba(10, 20, 30, 0.5)");
  if (!pc || pc[3] !== 0.5) fails.push("parseColour rgba");
  console.log(fails.length ? "usability-thresholds selftest: FAIL\n  " + fails.join("\n  ") : "usability-thresholds selftest: ok");
  return fails.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--selftest")) process.exit(selftest());
  for (const [k, v] of Object.entries(T)) console.log(k.padEnd(16), v.what, "--", SOURCES[/** @type {keyof typeof SOURCES} */ (v.src)]);
}
