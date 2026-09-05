// github#58

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

const CACHE_LIMIT = 200000;
const cache = new Map<string, number>();
let scratch: OffscreenCanvasRenderingContext2D | null = null;

function normalise(val: string): string {
  if (!scratch) scratch = new OffscreenCanvas(1, 1).getContext("2d");
  if (!scratch) return "#000000";
  scratch.fillStyle = "#000000";
  scratch.fillStyle = val;
  return scratch.fillStyle;
}

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
