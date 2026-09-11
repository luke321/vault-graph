// design/0004
// github#77
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const s2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex = (h) => {
  h = h.trim().replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const relLum = (h) => {
  const c = hex(h).map(s2lin);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const lab = (h) => {
  const [r0, g0, b0] = hex(h).map(s2lin);
  const l = Math.cbrt(0.4122214708 * r0 + 0.5363325363 * g0 + 0.0514459929 * b0);
  const m = Math.cbrt(0.2119034982 * r0 + 0.6806995451 * g0 + 0.1073969566 * b0);
  const s = Math.cbrt(0.0883024619 * r0 + 0.2817188376 * g0 + 0.6299787005 * b0);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
};
const chroma = (h) => { const [, A, B] = lab(h); return Math.hypot(A, B); };
const hueDeg = (h) => { const [, A, B] = lab(h); return (Math.atan2(B, A) * 180 / Math.PI + 360) % 360; };
// design/0004
const dE = (a, b) => {
  const p = lab(a), q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
};
const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const NAMES = ["Blue", "Orange", "Aqua", "Yellow", "Green", "Magenta",
               "Violet", "Red", "Cyan", "Orchid", "Grey", "Slate"];

// github#77, design/0004
/** @param {string} cssText */
export function measurePalette(cssText) {
  const grab = (name) => {
    const m = cssText.match(new RegExp("--" + name + "\\s*:\\s*(#[0-9a-fA-F]{3,6})"));
    return m ? m[1] : null;
  };

  // github#77
  const strays = [];
  for (const m of cssText.matchAll(/--(g\d+|surface-1)\s*:\s*(#[0-9a-fA-F]{3,6})/g)) {
    strays.push(`--${m[1]}: ${m[2]}`);
  }

  const themes = {};
  for (const [label, suffix] of [["LIGHT", "l"], ["DARK", "d"]]) {
    const surface = grab("surface-1-" + suffix);
    const slots = NAMES.map((n, i) => ({
      name: n, key: "g" + (i + 1), hex: grab("g" + (i + 1) + "-" + suffix),
    }));
    const missing = slots.filter((s) => !s.hex).map((s) => s.key);
    if (missing.length || !surface) { themes[label] = { label, surface, missing, slots: [] }; continue; }
    for (const s of slots) {
      s.chroma = chroma(s.hex);
      s.hue = hueDeg(s.hex);
      s.contrast = contrast(s.hex, surface);
    }
    let worst = { d: Infinity };
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const d = dE(slots[i].hex, slots[j].hex);
        if (d < worst.d) worst = { d, a: slots[i], b: slots[j] };
      }
    }
    themes[label] = {
      label, surface, slots, missing: [], worst,
      under3: slots.filter((s) => s.contrast < 3).map((s) => s.key),
      lowChroma: slots.filter((s) => s.chroma < 0.10 && !["g11", "g12"].includes(s.key)),
    };
  }
  return { light: themes.LIGHT, dark: themes.DARK, strays };
}

function report(cssText) {
  const p = measurePalette(cssText);
  for (const t of [p.light, p.dark]) {
    if (t.missing.length || !t.surface) {
      console.log(`${t.label}: MISSING ${(t.missing.length ? t.missing : ["surface-1"]).join(", ")}`);
      continue;
    }
    console.log(`\n=== ${t.label}  surface ${t.surface} ===`);
    console.log("slot  name      hex       chroma  hue    contrast");
    for (const s of t.slots) {
      console.log(
        s.key.padEnd(5), s.name.padEnd(9), s.hex.padEnd(9),
        s.chroma.toFixed(3).padStart(6),
        s.hue.toFixed(0).padStart(4),
        s.contrast.toFixed(2).padStart(9),
      );
    }
    const cs = t.slots.slice(0, 10).map((s) => s.chroma);
    console.log(`hue chroma range: ${Math.min(...cs).toFixed(3)} - ${Math.max(...cs).toFixed(3)}`);
    console.log(`hues under chroma 0.10: ${t.lowChroma.length ? t.lowChroma.map((s) => s.key + " " + s.name).join(", ") : "none"}`);
    console.log(`slots under 3:1 on the surface: ${t.under3.length ? t.under3.join(", ") : "none"}`);
    console.log(`worst pair: ${t.worst.a.name} vs ${t.worst.b.name} = dE ${t.worst.d.toFixed(1)}`);
  }
  if (p.strays.length) {
    console.log(`\nPALETTE DECLARED TWICE: ${p.strays.join(", ")}`);
    console.log("Every slot hex belongs in the --gN-l / --gN-d pair tokens on .vault-graph;");
    console.log("a theme block may only map --gN onto one of them. github#77");
    return 1;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  process.exit(report(readFileSync(process.argv[2] || "src/page.css", "utf8")));
}
