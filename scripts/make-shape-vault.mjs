// github#5
// github#18

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = arg("out", join(HERE, "..", "shape-vault"));

let seed = Number(arg("seed", 20260823));
const rnd = () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const FOLDERS = [
  { dir: "projects", n: 738, orphans: 30, subs: 5 },
  { dir: "notes",    n: 100, orphans: 96, subs: 0 },
  { dir: "refs",     n:  82, orphans:  4, subs: 2 },
  { dir: "misc",     n:  27, orphans:  2, subs: 0 },
  { dir: "tiny",     n:   6, orphans:  6, subs: 0 },
];

const SPAN_DAYS = 420;
const localToday = () => {
  const d = new Date(), p = (n) => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
};
const END = Date.parse(arg("end", localToday()) + "T00:00:00Z");
const DAY0 = END - (SPAN_DAYS - 1) * 86400000;
const day = (i) => new Date(DAY0 + (i % SPAN_DAYS) * 86400000).toISOString().slice(0, 10);

const SUB_SHARE = [0.44, 0.26, 0.15, 0.09, 0.06];
const subFor = (f, i) => {
  if (!f.subs) return "";
  let acc = 0;
  for (let s = 0; s < f.subs; s++) {
    acc += Math.round(f.n * (SUB_SHARE[s] || 0.05));
    if (i < acc) return `sub ${String.fromCharCode(97 + s)}`;
  }
  return `sub ${String.fromCharCode(97 + f.subs - 1)}`;
};

const notes = [{ dir: "", title: "Root Note", orphan: true }];
for (const f of FOLDERS) {
  for (let i = 0; i < f.n; i++) {
    const sub = subFor(f, i);
    notes.push({ dir: sub ? join(f.dir, sub) : f.dir,
                 title: `${f.dir} ${String(i + 1).padStart(4, "0")}`,
                 orphan: i < f.orphans });
  }
}
const titles = notes.filter((n) => !n.orphan).map((n) => n.title);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, ".obsidian"), { recursive: true });
writeFileSync(join(OUT, ".obsidian", "app.json"), "{}\n");
for (const n of notes) if (n.dir) mkdirSync(join(OUT, n.dir), { recursive: true });

let links = 0;
notes.forEach((n, i) => {
  const body = [];
  if (!n.orphan) {
    const outs = rnd() < 0.04 ? int(14, 40) : int(1, 5);
    for (let k = 0; k < outs; k++) {
      const t = titles[Math.floor(Math.pow(rnd(), 2) * titles.length)];
      if (t && t !== n.title) { body.push(`[[${t}]]`); links++; }
    }
    if (rnd() < 0.05) body.push(`[[Nowhere ${int(900, 999)}]]`);
  }
  writeFileSync(join(OUT, n.dir, n.title + ".md"),
                `---\ncreated: ${day(i)}\n---\n\n` + body.join(" ") + "\n", "utf8");
});

const orphans = notes.filter((n) => n.orphan).length;
console.log(`wrote ${notes.length} notes to ${OUT}`);
console.log(`  ${links} link refs, ${orphans} unlinked, one of them at the vault root`);
console.log(`  dominant folder: ${FOLDERS[0].dir} ${FOLDERS[0].n}/${notes.length} = ` +
            `${Math.round(FOLDERS[0].n / notes.length * 100)}%`);
