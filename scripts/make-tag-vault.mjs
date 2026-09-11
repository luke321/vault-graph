// github#86, design/0015

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = arg("out", join(HERE, "..", "tag-vault"));

let seed = Number(arg("seed", 20260909));
const rnd = () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];

// github#86, design/0015 -- 13 top-level tags, two families, one two deep
const TAGS = [
  { tag: "area/health", n: 78 },
  { tag: "area/health/sleep", n: 21 },
  { tag: "area/finance", n: 44 },
  { tag: "area/career", n: 31 },
  { tag: "project/greenhouse", n: 66 },
  { tag: "project/website", n: 52 },
  { tag: "project/thesis", n: 19 },
  { tag: "reference", n: 74 },
  { tag: "howto", n: 58 },
  { tag: "meeting", n: 96 },
  { tag: "person", n: 41 },
  { tag: "recipe", n: 27 },
  { tag: "review", n: 35 },
  { tag: "seedling", n: 62 },
  { tag: "evergreen", n: 24 },
  { tag: "question", n: 16 },
  { tag: "book", n: 29 },
  { tag: "idea", n: 47 },
];

// github#86 -- flat; one folder holds most, the degenerate picture
const FOLDERS = [
  { dir: "notes", share: 0.82 },
  { dir: "archive", share: 0.11 },
  { dir: "attachments", share: 0.07 },
];

const SPAN_DAYS = 900;
const localToday = () => {
  const d = new Date(), p = (n) => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
};
const END = Date.parse(arg("end", localToday()) + "T00:00:00Z");
const DAY0 = END - (SPAN_DAYS - 1) * 86400000;
const day = (i) => new Date(DAY0 + (i % SPAN_DAYS) * 86400000).toISOString().slice(0, 10);

// github#86 -- tag-first, with a second tag on one note in six (D-1)
const notes = [];
let n = 0;
for (const t of TAGS) {
  for (let i = 0; i < t.n; i++) {
    const tags = [t.tag];
    if (rnd() < 0.17) {
      const other = pick(TAGS).tag;
      if (other.split("/")[0] !== t.tag.split("/")[0]) tags.push(other);
    }
    notes.push({ title: `${t.tag.replace(/\//g, " ")} ${String(i + 1).padStart(3, "0")}`,
                 tags, orphan: rnd() < 0.05 });
    n++;
  }
}
// github#86 -- the untagged minority, ~8%
const untagged = Math.round(n * 0.08 / 0.92);
for (let i = 0; i < untagged; i++) {
  notes.push({ title: `loose note ${String(i + 1).padStart(3, "0")}`, tags: [],
               orphan: rnd() < 0.25 });
}

// github#86 -- folders come after the tags, so they cut across them
let at = 0;
FOLDERS.forEach((f, fi) => {
  const take = fi === FOLDERS.length - 1 ? notes.length - at
                                         : Math.round(notes.length * f.share);
  for (let i = at; i < at + take && i < notes.length; i++) notes[i].dir = f.dir;
  at += take;
});

const titles = notes.filter((x) => !x.orphan).map((x) => x.title);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, ".obsidian"), { recursive: true });
writeFileSync(join(OUT, ".obsidian", "app.json"), "{}\n");
for (const f of FOLDERS) mkdirSync(join(OUT, f.dir), { recursive: true });

let links = 0;
notes.forEach((x, i) => {
  const body = [];
  if (!x.orphan) {
    const outs = rnd() < 0.05 ? int(12, 34) : int(1, 5);
    for (let k = 0; k < outs; k++) {
      const t = titles[Math.floor(Math.pow(rnd(), 2) * titles.length)];
      if (t && t !== x.title) { body.push(`[[${t}]]`); links++; }
    }
  }
  const fm = ["---", `created: ${day(i)}`];
  if (x.tags.length) fm.push(`tags: [${x.tags.join(", ")}]`);
  fm.push("---", "");
  writeFileSync(join(OUT, x.dir, x.title + ".md"),
                fm.join("\n") + "\n" + body.join(" ") + "\n", "utf8");
});

const multi = notes.filter((x) => x.tags.length > 1).length;
const nested = notes.filter((x) => x.tags.some((t) => t.includes("/"))).length;
const tops = new Set(notes.flatMap((x) => x.tags.map((t) => t.split("/")[0])));
console.log(`wrote ${notes.length} notes to ${OUT}`);
console.log(`  ${links} link refs, ${notes.filter((x) => x.orphan).length} unlinked`);
console.log(`  ${tops.size} top-level tags, ${nested} notes on a nested tag, ` +
            `${multi} carrying more than one`);
console.log(`  ${untagged} untagged = ${Math.round(untagged / notes.length * 100)}% ` +
            `(the demo vault is 55%, the dominant-folder vault 100%)`);
console.log(`  folders: ${FOLDERS.map((f) => f.dir).join(", ")} -- flat, and one holds most`);
