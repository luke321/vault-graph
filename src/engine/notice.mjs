// The licence notice both bundles carry (github#58).
//
// The engine is a port of Sigma.js 3.0.2 (MIT), and MIT asks that its copyright and permission
// notice travel with every copy or substantial portion of the software -- which main.js and
// every exported vault-graph.html are. esbuild drops ordinary comments, so the notice goes in
// as a `/*!` legal comment through each build's `banner`, read from NOTICE.md beside this file
// so there is one text to keep right. Build tooling, not shipped code: nothing here runs in a
// browser.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The MIT block of NOTICE.md: from its "MIT License" line to the line ending "SOFTWARE." */
export function engineNotice() {
  const lines = readFileSync(join(HERE, "NOTICE.md"), "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "MIT License");
  const end = lines.findIndex((l, i) => i > start && l.trim().endsWith("SOFTWARE."));
  if (start < 0 || end < 0) throw new Error("src/engine/NOTICE.md: the MIT block was not found");
  return lines.slice(start, end + 1).join("\n");
}

/** The notice as a legal comment esbuild keeps verbatim, for a build's `banner.js`. */
export function engineBanner() {
  const body = engineNotice().split("\n").map((l) => (" * " + l).replace(/ +$/, "")).join("\n");
  return "/*!\n" +
    " * Vault Graph engine -- the camera, viewport, pointer handling and WebGL programs under\n" +
    " * src/engine are ported from Sigma.js 3.0.2 (https://www.sigmajs.org), whose notice\n" +
    " * follows. The full attribution is src/engine/NOTICE.md in the source repository.\n" +
    " *\n" + body + "\n */";
}
