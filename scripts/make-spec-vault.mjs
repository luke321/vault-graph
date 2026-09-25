// github#71

// github#71 -- the only fixture not in name order; shape in invariants.md

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = arg("out", join(HERE, "..", "spec-vault"));

let seed = Number(arg("seed", 20260908));
const rnd = () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const localToday = () => {
  const d = new Date(), p = (n) => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
};
const SPAN_DAYS = 300;
const END = Date.parse(arg("end", localToday()) + "T00:00:00Z");
const DAY0 = END - (SPAN_DAYS - 1) * 86400000;
const day = (i) => new Date(DAY0 + (i % SPAN_DAYS) * 86400000).toISOString().slice(0, 10);

// github#71 -- name order alpha,beta,gamma,zeta; spec leads zeta,alpha
const FOLDERS = [
  { dir: "alpha", subs: [
    { name: "00 pinned tiny", n: 4 },      // github#71 -- D-10: pinned first and smallest
    { name: "01 big", n: 60 },
    { name: "02 middling", n: 28 },
    { name: "03 small", n: 11 },
    { name: "04 smaller", n: 7 },
  ] },
  { dir: "beta", subs: [{ name: "", n: 52 }] },
  { dir: "gamma", dated: true, n: 84 },
  { dir: "zeta", subs: [{ name: "", n: 21 }, { name: "notes", n: 18 }] },
];

const SORTSPEC = [
  "---",
  "sorting-spec: |-",
  "  target-folder: /",
  "  zeta",
  "  alpha",
  "",
  "  target-folder: alpha",
  "  00 pinned tiny",
  "  04 smaller",
  "",
  "  target-folder: gamma/*",
  "  order-desc: a-z",
  "",
  "  target-folder: zeta",
  "  order-desc: a-z",
  "",
  "  // a section aimed at a folder that no longer exists -- must be ignored, not fatal",
  "  target-folder: deleted-folder",
  "  something",
  "",
  "  // outside the subset this page reads -- skipped with the line named",
  "  target-folder: beta",
  "  order-asc: modified",
  "---",
  "",
  "# sortspec",
  "",
  "The ordering fixture's spec. Everything above the second `---` is the config.",
  "",
].join("\n");

const notes = [];
for (const f of FOLDERS) {
  if (f.dated) {
    for (let i = 0; i < f.n; i++) {
      const d = day(i * 3);
      notes.push({ dir: join(f.dir, d.slice(0, 7)), title: `${d} ${f.dir} log`, at: i * 3 });
    }
    continue;
  }
  let i = 0;
  for (const s of f.subs) {
    for (let k = 0; k < s.n; k++, i++) {
      notes.push({ dir: s.name ? join(f.dir, s.name) : f.dir,
                   title: `${f.dir} ${s.name || "root"} ${String(k + 1).padStart(3, "0")}`,
                   at: i });
    }
  }
}
notes.push({ dir: "", title: "Home", at: 0 });

const titles = notes.map((n) => n.title);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, ".obsidian"), { recursive: true });
writeFileSync(join(OUT, ".obsidian", "app.json"), "{}\n");
// github#71 -- registered globally from inside a folder
mkdirSync(join(OUT, ".obsidian", "plugins", "custom-sort"), { recursive: true });
writeFileSync(join(OUT, ".obsidian", "plugins", "custom-sort", "data.json"),
              JSON.stringify({ additionalSortspecFile: "beta/sortspec.md", suspended: false }, null, 2) + "\n");

for (const n of notes) if (n.dir) mkdirSync(join(OUT, n.dir), { recursive: true });
writeFileSync(join(OUT, "beta", "sortspec.md"), SORTSPEC, "utf8");

let links = 0, orphans = 0;
notes.forEach((n, i) => {
  const body = [];
  const orphan = i % 17 === 0;
  if (orphan) orphans++;
  else {
    const outs = rnd() < 0.05 ? int(10, 26) : int(1, 4);
    for (let k = 0; k < outs; k++) {
      const t = titles[Math.floor(Math.pow(rnd(), 2) * titles.length)];
      if (t && t !== n.title) { body.push(`[[${t}]]`); links++; }
    }
  }
  writeFileSync(join(OUT, n.dir, n.title + ".md"),
                `---\ncreated: ${day(n.at)}\n---\n\n` + body.join(" ") + "\n", "utf8");
});

console.log(`wrote ${notes.length} notes to ${OUT}`);
console.log(`  ${links} link refs, ${orphans} unlinked`);
console.log("  sortspec at beta/sortspec.md, registered via .obsidian/plugins/custom-sort/data.json");
console.log("  name order: alpha, beta, gamma, zeta -- explorer order: zeta, alpha, beta, gamma");
