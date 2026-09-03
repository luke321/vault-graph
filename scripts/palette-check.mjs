// Measure the palette in src/page.css: chroma, hue, contrast against the surface, and the
// worst all-pairs separation, for both themes.
//
//   node scripts/palette-check.mjs src/page.css
//
// WHY THIS EXISTS. Every number in .ai-context/design/0004-group-colours.md came out of
// here, and the one that matters is the last line of each block: the palette's worst pair.
// Twelve slots and two much stronger hues cost it nothing -- Orange vs Red at dE 7.1 before
// and after -- and that is only knowable by measuring, because the binding pair is not one
// of the ones that changed. The first attempt at documenting the pastel swap guessed
// "chroma around 0.09" and was wrong: their chroma was mid-pack, and it was LIGHTNESS that
// made them read as pale.
//
// NOT part of the smoke suite, on purpose. smoke.mjs checks behaviour that a change can
// break silently; a palette does not drift on its own, and what makes a hue right is
// looking at it. This is for the moment somebody edits a colour and wants the numbers.
//
// Same OKLab math as src/page.js, so these numbers and the ones the page computes at
// runtime are directly comparable. Node builtins only, like the rest of src/.
import { readFileSync } from "node:fs";

const css = readFileSync(process.argv[2] || "src/page.css", "utf8");

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
// dE in the same units design/0004 quotes: OKLab distance x 100.
const dE = (a, b) => {
  const p = lab(a), q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
};
const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Blocks: the bare :root-ish rule is light; the [data-theme="dark"] rule is dark.
const block = (re) => {
  const m = css.match(re);
  if (!m) throw new Error("block not found: " + re);
  return m[0];
};
const light = block(/\.vault-graph \{[\s\S]*?\n {2}\}/);
const dark = block(/\.vault-graph\[data-theme="dark"\] \{[\s\S]*?\n {2}\}/);

const NAMES = ["Blue", "Orange", "Aqua", "Yellow", "Green", "Magenta",
               "Violet", "Red", "Cyan", "Orchid", "Grey", "Slate"];

for (const [label, text] of [["LIGHT", light], ["DARK", dark]]) {
  const grab = (name) => {
    const m = text.match(new RegExp("--" + name + "\\s*:\\s*(#[0-9a-fA-F]{3,6})"));
    return m ? m[1] : null;
  };
  const surface = grab("surface-1");
  const slots = NAMES.map((n, i) => ({ name: n, key: "g" + (i + 1), hex: grab("g" + (i + 1)) }));
  const missing = slots.filter((s) => !s.hex);
  if (missing.length) { console.log(`${label}: MISSING ${missing.map((s) => s.key).join(", ")}`); continue; }

  console.log(`\n=== ${label}  surface ${surface} ===`);
  console.log("slot  name      hex       chroma  hue    contrast");
  for (const s of slots) {
    console.log(
      s.key.padEnd(5), s.name.padEnd(9), s.hex.padEnd(9),
      chroma(s.hex).toFixed(3).padStart(6),
      hueDeg(s.hex).toFixed(0).padStart(4),
      contrast(s.hex, surface).toFixed(2).padStart(9),
    );
  }
  // Only hues carry a chroma claim; the greys are meant to be flat.
  const hues = slots.slice(0, 10);
  const cs = hues.map((s) => chroma(s.hex));
  console.log(`hue chroma range: ${Math.min(...cs).toFixed(3)} - ${Math.max(...cs).toFixed(3)}`);
  const lowC = slots.filter((s) => chroma(s.hex) < 0.10 && !["g11", "g12"].includes(s.key));
  console.log(`hues under chroma 0.10: ${lowC.length ? lowC.map((s) => s.key + " " + s.name).join(", ") : "none"}`);
  const under3 = slots.filter((s) => contrast(s.hex, surface) < 3);
  console.log(`slots under 3:1 on the surface: ${under3.length ? under3.map((s) => s.key).join(", ") : "none"}`);

  let worst = { d: Infinity };
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const d = dE(slots[i].hex, slots[j].hex);
      if (d < worst.d) worst = { d, a: slots[i], b: slots[j] };
    }
  }
  console.log(`worst pair: ${worst.a.name} vs ${worst.b.name} = dE ${worst.d.toFixed(1)}`);
}
