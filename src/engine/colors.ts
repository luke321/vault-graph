/**
 * Colour strings to the packed float the shaders read (github#58).
 *
 * A colour travels to the GPU as one 32-bit float whose bytes are r, g, b, a -- the buffer
 * declares the attribute as four normalised unsigned bytes over the same memory. The packing
 * is Sigma 3.0.2's exactly, including the `& 0xfeffffff` mask: it clears the top bit of the
 * alpha byte so the float can never be a NaN pattern, which some GPUs would canonicalise and
 * silently change. The shaders multiply alpha back by 255/254 to undo the mask.
 *
 * The page hands over hex (`#rrggbb`, `#rgb`, `#rrggbbaa`) and `rgba(r, g, b, a)` strings and
 * nothing else -- every theme token in page.css is hex, and `withAlpha` writes rgba with
 * integer channels, which is what the regex below expects (the same regex Sigma had, quirks
 * included; page.js:6126 already writes around them). Anything else is normalised once
 * through a 2D context's fillStyle, which is the browser's own parser, and cached.
 */

const INT8 = new Int8Array(4);
const INT32 = new Int32Array(INT8.buffer, 0, 1);
const FLOAT32 = new Float32Array(INT8.buffer, 0, 1);

const RGBA_TEST = /^\s*rgba?\s*\(/;
const RGBA_EXTRACT = /^\s*rgba?\s*\(\s*([0-9]*)\s*,\s*([0-9]*)\s*,\s*([0-9]*)(?:\s*,\s*(.*)?)?\)\s*$/;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(val: string): Rgba | null {
  let r = 0, g = 0, b = 0, a = 1;
  if (val[0] === "#") {
    if (val.length === 4) {
      r = parseInt(val.charAt(1) + val.charAt(1), 16);
      g = parseInt(val.charAt(2) + val.charAt(2), 16);
      b = parseInt(val.charAt(3) + val.charAt(3), 16);
    } else {
      r = parseInt(val.charAt(1) + val.charAt(2), 16);
      g = parseInt(val.charAt(3) + val.charAt(4), 16);
      b = parseInt(val.charAt(5) + val.charAt(6), 16);
    }
    if (val.length === 9) a = parseInt(val.charAt(7) + val.charAt(8), 16) / 255;
    return { r, g, b, a };
  }
  if (RGBA_TEST.test(val)) {
    const match = RGBA_EXTRACT.exec(val);
    if (match) {
      r = +match[1];
      g = +match[2];
      b = +match[3];
      if (match[4]) a = +match[4];
    }
    return { r, g, b, a };
  }
  return null;
}

function rgbaToFloat(r: number, g: number, b: number, a: number): number {
  INT32[0] = ((a << 24) | (b << 16) | (g << 8) | r) & 0xfeffffff;
  return FLOAT32[0];
}

// Keyed by the string as given AND by its lower-case form, so a hit costs no allocation: the
// page hands over 10,000 colour strings a frame during a cascade, and lower-casing each one
// before the lookup was 10,000 short-lived strings a frame for the collector. Bounded, because
// a cascade's per-frame alphas produce strings that never recur; Sigma's cache grew without
// limit for the life of the page.
const CACHE_LIMIT = 200000;
const cache = new Map<string, number>();
let scratch: OffscreenCanvasRenderingContext2D | null = null;

/**
 * Normalises a colour the regexes do not know through the browser's own parser -- an
 * OffscreenCanvas, not a canvas ELEMENT: nothing here needs a node, and the engine runs in the
 * standalone page as well as inside Obsidian, where the directory's linter asks for its own
 * DOM helpers over document.createElement. A 1x1 offscreen context parses `fillStyle` the same.
 */
function normalise(val: string): string {
  if (!scratch) scratch = new OffscreenCanvas(1, 1).getContext("2d");
  if (!scratch) return "#000000";
  scratch.fillStyle = "#000000";
  scratch.fillStyle = val;
  return scratch.fillStyle;
}

/**
 * The packed float for a colour string. The browser's parser is only consulted for a string
 * that is neither hex nor rgba, and only the first time that string is seen.
 */
export function floatColor(val: string): number {
  const direct = cache.get(val);
  if (direct !== undefined) return direct;
  const key = val.toLowerCase();
  let color = cache.get(key);
  if (color === undefined) {
    let parsed = parseColor(key);
    if (!parsed) parsed = parseColor(normalise(key).toLowerCase()) ?? { r: 0, g: 0, b: 0, a: 1 };
    color = rgbaToFloat(parsed.r, parsed.g, parsed.b, (parsed.a * 255) | 0);
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, color);
  }
  if (val !== key) cache.set(val, color);
  return color;
}
