#!/usr/bin/env node
// github#176

import { translateSortSpec } from "./mirror-sortspec.mjs";

let failed = 0;
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail) {
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + (detail ? "   (" + detail + ")" : ""));
  if (!ok) failed++;
}

const FAKE_DIRS = new Map([
  ["Projects", "Foo"],
  ["Archive/Projects", "Old/Foo"],
  ["SomeFolder", "Mapped"],
]);
const mapPath = (p) => {
  const clean = String(p).split(/[\\/]/).filter(Boolean).join("/");
  if (!clean) return "";
  return FAKE_DIRS.has(clean) ? FAKE_DIRS.get(clean) : null;
};
const nameMap = new Map([["two", "Two"]]);

console.log("translateSortSpec");

{
  const spec = ["target-folder:", "SomeFolder"].join("\n");
  const { text, dropped } = translateSortSpec(spec, "Home", mapPath, nameMap);
  check("an empty target-folder drops its section, never resolves to the mirror's root",
        text === "" && dropped === 2,
        `text ${JSON.stringify(text)}, dropped ${dropped} (want "", 2)`);
}

{
  const spec = "target-folder: /Projects";
  const { text, dropped } = translateSortSpec(spec, "", mapPath, nameMap);
  check("a leading-slash target keeps its anchor once mapped",
        text === "target-folder: /Foo" && dropped === 0,
        `text ${JSON.stringify(text)}, dropped ${dropped} (want "target-folder: /Foo", 0)`);
}

{
  const spec = "target-folder: ./Projects";
  const { text, dropped } = translateSortSpec(spec, "", mapPath, nameMap);
  check("./ from a top-level spec dir keeps its anchor once mapped",
        text === "target-folder: /Foo" && dropped === 0,
        `text ${JSON.stringify(text)}, dropped ${dropped} (want "target-folder: /Foo", 0)`);
}

{
  const spec = "target-folder: /Archive/Projects";
  const { text, dropped } = translateSortSpec(spec, "", mapPath, nameMap);
  check("a nested anchored target maps with its anchor, unaffected either way",
        text === "target-folder: /Old/Foo" && dropped === 0,
        `text ${JSON.stringify(text)}, dropped ${dropped} (want "target-folder: /Old/Foo", 0)`);
}

{
  const spec = "target-folder: Projects/*";
  const { text, dropped } = translateSortSpec(spec, "", mapPath, nameMap);
  check("a bare wildcard target stays unanchored",
        text === "target-folder: Foo/*" && dropped === 0,
        `text ${JSON.stringify(text)}, dropped ${dropped} (want "target-folder: Foo/*", 0)`);
}

{
  const spec = "target-folder: /Projects/*";
  const { text, dropped } = translateSortSpec(spec, "", mapPath, nameMap);
  check("an anchored wildcard target still stays unanchored",
        text === "target-folder: Foo/*" && dropped === 0,
        `text ${JSON.stringify(text)}, dropped ${dropped} (want "target-folder: Foo/*", 0)`);
}

{
  const spec = ["target-folder: Nowhere", "one", "target-folder: /", "two"].join("\n");
  const { text, dropped } = translateSortSpec(spec, "", mapPath, nameMap);
  check("an unmappable target-folder still drops its own section, not just the value",
        text === "target-folder: /\nTwo" && dropped === 2,
        `text ${JSON.stringify(text)}, dropped ${dropped} (want "target-folder: /\\nTwo", 2)`);
}

if (failed) { console.log("make-mirror-vault selftest: " + failed + " FAILED"); process.exit(1); }
console.log("make-mirror-vault selftest: all passed");
