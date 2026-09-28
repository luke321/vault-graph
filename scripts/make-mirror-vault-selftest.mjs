#!/usr/bin/env node
// github#176, github#191

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { translateSortSpec } from "./mirror-sortspec.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

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

/* github#191 -- no real folder segment survives into the mirror */

console.log("make-mirror-vault.mjs on a fixture with distinctive folder names");

const FOLDER_PREFIX = /^[_\d][\d_.\s-]*(?:[QW]\d{1,2}[\s_.-]*)?/i;
const DATEISH = /^\d{4}(?:[-_ ]?(?:\d{2}|Q[1-4]|W\d{1,2}))?$/i;

/** @type {Record<string, string[]>} real folder -> note titles in it */
const FIXTURE = {
  "": ["Inbox Gribble"],
  "Zorbulax Holdings": ["Ledger one", "Ledger two", "Ledger three"],
  "Zorbulax Holdings/Kelpwright Initiative": ["Kickoff", "Retro"],
  "01 - Quinzelbright": ["Roadmap", "Budget"],
  "01 - Quinzelbright/2024": ["2024-03-01", "2024-03-02"],
  "01 - Quinzelbright/2024-Q3 Wrenthistle": ["Quarter plan"],
  "_ Vexmoor Archive": ["Tmpl Flargle"],
  "People/Tarquin Fossbender": ["Tarquin Fossbender"],
  "05 - Dailies Ostrakon": ["2024-05-01", "2024-05-02"],
};
const SORTSPEC = [
  "---", "sorting-spec: |-",
  "  target-folder: /", "  01 - Quinzelbright", "  Zorbulax Holdings", "  Inbox Gribble.md", "",
  "  target-folder: 01 - Quinzelbright", "  2024-Q3 Wrenthistle", "  order-desc: a-z", "",
  "  target-folder: Zorbulax Holdings/*", "  order-asc: a-z",
  "---", "", "# sortspec", "",
].join("\n");
const CONFIG = {
  "daily-notes.json": { folder: "05 - Dailies Ostrakon", format: "YYYY-MM-DD",
                        template: "_ Vexmoor Archive/Tmpl Flargle", autorun: false },
  "templates.json": { folder: "_ Vexmoor Archive", dateFormat: "YYYY-MM-DD" },
  "app.json": { attachmentFolderPath: "attachments", newFileFolderPath: "Zorbulax Holdings",
                newFileLocation: "folder", cssTheme: "Minimal", vimMode: false,
                userIgnoreFilters: ["Zorbulax Holdings/Kelpwright Initiative/", "nowhere/"] },
};

/** @param {string} root */
function writeFixture(root) {
  mkdirSync(join(root, ".obsidian"), { recursive: true });
  for (const [name, json] of Object.entries(CONFIG)) {
    writeFileSync(join(root, ".obsidian", name), JSON.stringify(json, null, 2) + "\n", "utf8");
  }
  mkdirSync(join(root, "attachments"), { recursive: true });
  writeFileSync(join(root, "attachments", "pic.png"), "", "utf8");
  for (const [dir, titles] of Object.entries(FIXTURE)) {
    mkdirSync(join(root, dir), { recursive: true });
    for (const t of titles) {
      const body = "---\ncreated: 2024-03-01\ntags: [x]\n---\n# " + t + "\n\nBody words here.\n\n- [[Inbox Gribble]]\n";
      writeFileSync(join(root, dir, t + ".md"), body, "utf8");
    }
  }
  writeFileSync(join(root, "sortspec.md"), SORTSPEC, "utf8");
}

/** @param {string} root @returns {{ rel: string, text: string }[]} every file, and every folder as a path */
function readTree(root) {
  const out = [];
  (function walk(d) {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const rel = relative(root, p).split("\\").join("/");
      if (statSync(p).isDirectory()) { out.push({ rel, text: "" }); walk(p); continue; }
      out.push({ rel, text: readFileSync(p, "utf8") });
    }
  })(root);
  return out;
}

const realSegments = [...new Set([
  ...Object.keys(FIXTURE).flatMap((d) => d.split("/")).filter(Boolean),
  "attachments", "nowhere",
])].filter((s) => !DATEISH.test(s));
const hunted = realSegments.map((s) => s.replace(FOLDER_PREFIX, "")).filter((s) => s.length >= 3);

/** @param {{ rel: string, text: string }[]} tree @returns {string[]} the real remainders found, with where */
function leaks(tree) {
  const found = [];
  for (const h of hunted) {
    const needle = h.toLowerCase();
    for (const { rel, text } of tree) {
      if (rel.toLowerCase().includes(needle)) { found.push(`${h} in path ${rel}`); break; }
      if (text.toLowerCase().includes(needle)) { found.push(`${h} in ${rel}`); break; }
    }
  }
  return found;
}

/** @param {{ rel: string, text: string }[]} tree */
const digest = (tree) => createHash("sha1").update(tree.map((f) => f.rel + "\0" + f.text).join("\n")).digest("hex");

/** @param {string} vault @param {string} out @param {number} seed */
function mirror(vault, out, seed) {
  return spawnSync(process.execPath, [join(HERE, "make-mirror-vault.mjs"), "--vault", vault, "--out", out, "--seed", String(seed)],
                   { encoding: "utf8" });
}

const tmp = mkdtempSync(join(tmpdir(), "vg-mirror-selftest-"));
try {
  const vault = join(tmp, "source");
  writeFixture(vault);
  const source = readTree(vault);
  check("the hunter sees every real segment in the source (negative control)",
        leaks(source).length === hunted.length,
        `${leaks(source).length} of ${hunted.length} found`);

  const outA = join(tmp, "mirror-a");
  const rA = mirror(vault, outA, 1);
  check("the generator exits 0 on the fixture", rA.status === 0, (rA.stderr || rA.stdout || "").trim().slice(0, 200));
  const tree = readTree(outA);

  const found = leaks(tree);
  check("no real folder segment survives anywhere in the mirror -- tree, .obsidian, sortspec",
        found.length === 0, found.join("; ") || "none");

  const dirs = tree.filter((f) => !f.rel.includes("."));
  const srcDirs = [...new Set(Object.keys(FIXTURE).filter(Boolean).flatMap((d) => {
    const parts = d.split("/");
    return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
  }))];
  check("the folder count is the source's", dirs.length === srcDirs.length, `${dirs.length} folders (want ${srcDirs.length})`);
  const top = dirs.filter((f) => !f.rel.includes("/")).map((f) => f.rel);
  const numbered = top.find((n) => /^01 - \S/.test(n));
  const dailies = top.find((n) => /^05 - \S/.test(n));
  const under = top.find((n) => /^_ \S/.test(n));
  check("a numbered prefix survives with an invented remainder", !!numbered && !!dailies, top.join(", "));
  check("an underscore prefix survives with an invented remainder", !!under, top.join(", "));
  check("a date-shaped folder keeps its name", dirs.some((f) => f.rel === numbered + "/2024"), "want " + numbered + "/2024");
  check("a quarter keeps its digits and loses its word",
        dirs.some((f) => new RegExp("^" + numbered.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/2024-Q3 [A-Z][a-z]").test(f.rel)),
        dirs.map((f) => f.rel).join(", "));
  const person = dirs.find((f) => /^[^/]+\/[A-Z][a-z]+ [A-Z][a-z]+$/.test(f.rel) && !f.rel.startsWith(numbered) && f.rel.split("/")[0] !== under);
  check("a person folder under a people parent is still a person name", !!person, dirs.map((f) => f.rel).join(", "));

  const json = (n) => JSON.parse(tree.find((f) => f.rel === ".obsidian/" + n).text);
  const dn = json("daily-notes.json"), tp = json("templates.json"), app = json("app.json");
  const hasDir = (p) => dirs.some((f) => f.rel === p);
  check("daily-notes.json points at the mirrored dailies folder and keeps its format",
        dn.folder === dailies && dn.format === "YYYY-MM-DD" && dn.autorun === undefined, JSON.stringify(dn));
  check("daily-notes.json's template resolves to the mirrored note",
        typeof dn.template === "string" && tree.some((f) => f.rel === dn.template + ".md"), JSON.stringify(dn.template));
  check("templates.json points at the mirrored template folder, and only that",
        tp.folder === under && Object.keys(tp).length === 1, JSON.stringify(tp));
  check("app.json keeps only mapped paths: an attachments folder with no notes and a theme are dropped",
        app.attachmentFolderPath === undefined && app.cssTheme === undefined && app.newFileLocation === undefined &&
        hasDir(app.newFileFolderPath), JSON.stringify(app));
  check("app.json's ignore filters are mapped one by one and the unmappable one is dropped",
        Array.isArray(app.userIgnoreFilters) && app.userIgnoreFilters.length === 1 &&
        /\/$/.test(app.userIgnoreFilters[0]) && hasDir(app.userIgnoreFilters[0].slice(0, -1)), JSON.stringify(app.userIgnoreFilters));
  check("the summary line counts the two dropped config paths", /2 path\(s\) dropped/.test(rA.stdout), (rA.stdout.match(/.*dropped as unmappable.*/) || [""])[0]);

  const spec = tree.find((f) => f.rel === "sortspec.md");
  const specLines = spec ? (spec.text.match(/sorting-spec: \|-\n([\s\S]*?)\n(?:[a-z-]+:|---)/) || ["", ""])[1].split("\n").map((l) => l.trim()) : [];
  const holdings = app.newFileFolderPath;
  check("the sortspec is translated: root pins name the invented folders",
        specLines.includes(numbered) && !!holdings && specLines.includes(holdings), specLines.join(" | "));
  check("the sortspec's .md pin resolves to a mirrored root note",
        specLines.some((l) => /\.md$/.test(l) && tree.some((f) => f.rel === l)), specLines.filter((l) => /\.md$/.test(l)).join(", "));
  check("the sortspec's nested target and its quarter pin follow the new names",
        specLines.includes("target-folder: " + numbered) && specLines.some((l) => /^2024-Q3 [A-Z]/.test(l)) &&
        specLines.includes("target-folder: " + holdings + "/*"), specLines.join(" | "));

  const outB = join(tmp, "mirror-b"), outC = join(tmp, "mirror-c");
  mirror(vault, outB, 1); mirror(vault, outC, 2);
  check("two runs at the same seed are byte-identical", digest(tree) === digest(readTree(outB)));
  check("a different seed gives a different mirror", digest(tree) !== digest(readTree(outC)));
} finally {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}

if (failed) { console.log("make-mirror-vault selftest: " + failed + " FAILED"); process.exit(1); }
console.log("make-mirror-vault selftest: all passed");
