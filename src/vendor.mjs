/**
 * vendor.mjs -- read a vendored library, with its unreachable network paths removed.
 *
 * WHY THIS EXISTS. The Obsidian directory's automated review reads the shipped main.js and
 * reports, under "Disclosures", how many network request calls it contains: "All network
 * requests should be necessary and disclosed to users." Ours said **2 network calls**, and
 * a plugin that draws a picture of the vault has no business making any -- github#1.
 *
 * Both are Sigma.js's `loadSVGImage`, which fetches an SVG so a NODE IMAGE can be drawn
 * from it. Nothing here draws image nodes: the page registers exactly two programs,
 * `EdgeCurveProgram` and `createNodeBorderProgram` (src/page.js, the Sigma constructor).
 * So the calls were unreachable, and shipping them meant asking every user to take on
 * trust that a code path they can see is one we never take.
 *
 * They cannot be tree-shaken away. `vendor/` holds pre-built UMD bundles committed rather
 * than installed -- no package manager, no network at build time -- and a UMD bundle is
 * one opaque expression to any bundler. So the removal is textual, and it happens HERE,
 * once, for both consumers:
 *
 *   src/build-graph.mjs      inlines the libraries into the standalone HTML file
 *   scripts/build-plugin.mjs bundles them into the plugin's main.js
 *
 * `vendor/` itself stays byte-identical to upstream, which is the point of doing it at
 * read time rather than editing the file: the committed bundle can still be diffed against
 * the release it came from. The modification travels with the build instead, and
 * vendor/NOTICE.md records it, as MIT redistribution asks.
 *
 * THE COUNT IS THE GATE. Each file declares how many calls it is expected to contain, and
 * a mismatch is a hard error rather than a silent strip. An upstream update that adds a
 * network call should stop the build and be read, not be quietly neutered.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/* How many `fetch(` calls each vendored bundle contains, and what they are. Update these
 * in the same commit as the bundle, having read what the new call does. */
export const EXPECTED_FETCHES = {
  // Both inside loadSVGImage(): one with `credentials: "include"`, one without.
  "sigma.min.js": 2,
  "graphology.umd.min.js": 0,
};

// A bare `fetch(` -- not `.fetch(`, which would be a method on somebody's object and none
// of our business. The leading character is captured so it can be put back.
const FETCH_CALL = /(^|[^.\w$])fetch\s*\(/g;

// What replaces it. A thrower rather than a rejected promise, because the throw lands
// inside Sigma's own try/catch (loadImage falls back to a plain `new Image()` for the SVG
// case) and, if the path ever did become reachable, a stack trace naming this file is a
// better outcome than an image that quietly never appears. Written as one self-contained
// expression so no helper has to be injected into either bundle's scope.
const THROWER =
  '(function(){throw new Error("vault-graph: this build makes no network requests")})';

/* Everything that would make a request. Names, not call shapes, so a check over the
 * shipped bundle catches an assignment or an alias as well as a direct call. */
export const NETWORK_PRIMITIVES = [
  ["fetch(", FETCH_CALL],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/g],
  ["WebSocket", /\bWebSocket\b/g],
  ["EventSource", /\bEventSource\b/g],
  ["sendBeacon", /\bsendBeacon\b/g],
  ["importScripts", /\bimportScripts\b/g],
  // Obsidian's own HTTP helper. Nothing here should reach for it either, and it is the one
  // a reader of the plugin API would think to use.
  ["requestUrl", /\brequestUrl\b/g],
];

/** Every network primitive in `text`, as `[{ name, count }]`. Empty is the good answer. */
export function findNetworkPrimitives(text) {
  const hits = [];
  for (const [name, re] of NETWORK_PRIMITIVES) {
    re.lastIndex = 0;
    const count = (text.match(re) || []).length;
    if (count) hits.push({ name, count });
  }
  return hits;
}

/**
 * Read `vendor/<file>` and hand back its source with the network calls replaced.
 *
 * Throws if the number of calls is not the number declared above, or if anything else
 * that makes a request survives -- either means the bundle changed and a person has to
 * look at it.
 */
export function readVendorSource(root, file) {
  const expected = EXPECTED_FETCHES[file];
  if (expected === undefined) {
    throw new Error(
      "vendor.mjs: no expected-call count declared for vendor/" + file + ".\n" +
      "Add one to EXPECTED_FETCHES after reading what the bundle's network calls do."
    );
  }

  const raw = readFileSync(join(root, "vendor", file), "utf8");
  let found = 0;
  const out = raw.replace(FETCH_CALL, (_m, lead) => { found++; return lead + THROWER + "("; });

  if (found !== expected) {
    throw new Error(
      "vendor.mjs: vendor/" + file + " has " + found + " fetch call(s), expected " +
      expected + ".\n" +
      "The bundle changed. Read what the new call does before touching EXPECTED_FETCHES:\n" +
      "a call that is genuinely needed has to be disclosed to users, not stripped, and a\n" +
      "call that is not needed is one more reason this transform exists."
    );
  }

  const left = findNetworkPrimitives(out);
  if (left.length) {
    throw new Error(
      "vendor.mjs: vendor/" + file + " still reaches the network after stripping: " +
      left.map((h) => h.name + " x" + h.count).join(", ") + ".\n" +
      "Only fetch() is handled here. Read the new call and decide deliberately."
    );
  }

  return out;
}
