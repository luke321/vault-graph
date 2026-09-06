// github#58

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export function engineNotice() {
  const lines = readFileSync(join(HERE, "NOTICE.md"), "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "MIT License");
  const end = lines.findIndex((l, i) => i > start && l.trim().endsWith("SOFTWARE."));
  if (start < 0 || end < 0) throw new Error("src/engine/NOTICE.md: the MIT block was not found");
  return lines.slice(start, end + 1).join("\n");
}

export function engineBanner() {
  const body = engineNotice().split("\n").map((l) => (" * " + l).replace(/ +$/, "")).join("\n");
  return "/*!\n" +
    " * Vault Graph engine -- the camera, viewport, pointer handling and WebGL programs under\n" +
    " * src/engine are ported from Sigma.js 3.0.2 (https://www.sigmajs.org), whose notice\n" +
    " * follows. The full attribution is src/engine/NOTICE.md in the source repository.\n" +
    " *\n" + body + "\n */";
}
