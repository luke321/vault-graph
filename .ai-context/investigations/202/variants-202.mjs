// github#202 -- the three directions as exact edits to src/page.js, applied to a built page or a
// throwaway working copy, never committed into the product.
//   node .ai-context/investigations/202/variants-202.mjs --apply curve|edge|share [--param n]
//   node .ai-context/investigations/202/variants-202.mjs --restore
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAMP = "var v = lo + (hi - lo) * (id !== undefined ? dotRamp(id) : 1);";
const REST_T = "    restT[id] = t;\n    var v = dotPx(a.size || NODE_MIN, id), hi = lastDotHi, lo = Math.min(hi, floorPx());";
const REST_AT = "var hi = restHiU[id] * pxPerUnit, lo = Math.min(hi, floorPx());";
const LO = "var lo = Math.min(hi, camLo);";
const CELL = "if (mine !== undefined && mine > 0 && mine * DOT_CLEAR < u) u = mine * DOT_CLEAR;";
const SMALL = (n) => `(function () {
      var m = dotPx.small;
      if (!m || m.ver !== posVer) {
        m = dotPx.small = { ver: posVer, c: dict() };
        graph.forEachNode(function (o) { if ((alpha[o] || 0) > 0) m.c[groupOf(o)] = (m.c[groupOf(o)] || 0) + 1; });
      }
      return (m.c[groupOf(id)] || 0) <= ${n}; })()`;

export const DEFAULTS = { curve: 0.5, edge: 3, share: 0.6 };

export function edits(variant, p) {
  if (variant === "base") return [];
  if (variant === "curve") return [
    [RAMP, `var v = lo + (hi - lo) * (id !== undefined ? Math.pow(dotRamp(id), ${p}) : 1);`],
    [REST_T, REST_T.replace("restT[id] = t;", `restT[id] = Math.pow(t, ${p});`)],
  ];
  if (variant === "edge") return [
    [CELL, "if (fitCap && id !== undefined && fitVer !== posVer) measureFit();\n    " +
           "var roomy = fitCap && id !== undefined && fitNow && fitNow[id] > 0 && " + SMALL(p) + ";\n    " +
           "if (roomy && pit * DOT_CLEAR < u) u = pit * DOT_CLEAR;\n    " +
           "else if (mine !== undefined && mine > 0 && mine * DOT_CLEAR < u) u = mine * DOT_CLEAR;"],
  ];
  if (variant === "share") return [
    [LO, `var lo = Math.max(Math.min(hi, camLo), ${p} * hi);`],
    [REST_T, REST_T.replace("lo = Math.min(hi, floorPx());", `lo = Math.max(Math.min(hi, floorPx()), ${p} * hi);`)],
    [REST_AT, `var hi = restHiU[id] * pxPerUnit, lo = Math.max(Math.min(hi, floorPx()), ${p} * hi);`],
  ];
  throw new Error("unknown variant " + variant);
}

export function patch(text, variant, p) {
  let out = text;
  for (const [from, to] of edits(variant, p === undefined ? DEFAULTS[variant] : p)) {
    const n = out.split(from).length - 1;
    if (n !== 1) throw new Error(`${variant}: expected one match, found ${n}: ${from.slice(0, 60)}`);
    out = out.replace(from, () => to);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const page = join(ROOT, "src", "page.js");
  const argv = process.argv.slice(2);
  const at = (n) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes("--restore")) {
    execFileSync("git", ["-C", ROOT, "checkout", "--", "src/page.js"]);
    console.log("restored src/page.js");
  } else {
    const v = at("apply");
    const p = at("param") !== undefined ? Number(at("param")) : undefined;
    writeFileSync(page, patch(readFileSync(page, "utf8"), v, p));
    console.log(`applied ${v} (${p === undefined ? DEFAULTS[v] : p}) to src/page.js -- --restore before committing`);
  }
}
