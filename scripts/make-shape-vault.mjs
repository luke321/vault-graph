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

// github#107 -- a long tag tail from a real vault
// github#107 -- folder layout stays byte-identical
const TAG_STEMS = ["anchor", "beacon", "cinder", "delta", "ember", "fathom",
                   "girder", "harbor", "ingot", "jetty", "kiln", "lumen"];
const TAG_LEAVES = ["brief", "draft", "field", "guide", "index", "log",
                    "memo", "plan", "query", "sketch", "trace"];
// github#119 -- two tails: hierarchical (stem-leaf) and unrelated words
// github#119 -- real vault's tail is 20% clustered at 3+ chars, not 0%
const TAIL_UNRELATED = [
  "abacus", "ballast", "cadence", "dovetail", "eaves", "ferrule", "gantry", "halyard",
  "isthmus", "jigsaw", "keystone", "lintel", "mortise", "nacelle", "obelisk", "plinth",
  "quarry", "rafter", "spandrel", "tiller", "undertow", "vellum", "wainscot", "xylem",
  "yardarm", "zephyr", "alcove", "brazier", "cistern", "dowel", "escarp", "flange",
  "grommet", "hasp", "inglenook", "joist", "kerf", "louver", "mullion", "newel",
  "oriel", "parapet", "quoin", "rebate", "soffit", "transom", "uprise", "valance",
  "weir", "yoke", "apse", "buttress", "corbel", "dado", "embrasure", "finial",
  "gable", "impost", "jamb", "keel", "lancet", "muntin", "nosing", "ogee",
  "pilaster", "quirk", "reveal", "tracery", "undercroft", "verge", "wicket", "zinc",
  "cupola", "dormer", "eyelet", "fascia", "gusset", "hinge", "inlay", "knurl",
  "ledger", "mantel", "niche", "ochre",
];
const TAIL_HIERARCHICAL = [];
for (const s of TAG_STEMS) for (const l of TAG_LEAVES) TAIL_HIERARCHICAL.push(`${s}-${l}`);
// github#119 -- one in five of the tail is hierarchical
const TAIL_NAMES = [];
for (let i = 0; i < 15; i++) TAIL_NAMES.push(TAIL_HIERARCHICAL[i]);
for (let i = 0, h = 15, u = 0; i < 100; i++) {
  TAIL_NAMES.push(i % 5 === 0 ? TAIL_HIERARCHICAL[h++] : TAIL_UNRELATED[u++]);
}

const DOMINANT = "inbox";
// github#107 -- [name, note count]; mid band named, tail generated
const TAG_BANDS = [[DOMINANT, 600], ["review", 30], ["archive", 24], ["spec", 18], ["thread", 14]];
// github#107 -- 15 tags of 4-9, 12 of three, 13 of two, 75 of one
let tail = 0;
for (let i = 0; i < 15; i++) TAG_BANDS.push([TAIL_NAMES[tail++], 4 + (i % 6)]);
for (let i = 0; i < 12; i++) TAG_BANDS.push([TAIL_NAMES[tail++], 3]);
for (let i = 0; i < 13; i++) TAG_BANDS.push([TAIL_NAMES[tail++], 2]);
for (let i = 0; i < 75; i++) TAG_BANDS.push([TAIL_NAMES[tail++], 1]);

// github#107 -- a coprime stride scatters tags across folders
const slots = [];
for (const [name, n] of TAG_BANDS) for (let i = 0; i < n; i++) slots.push(name);
const STRIDE = 379;   // github#107 -- prime, shares no factor with 954 = 2*3*3*53
slots.forEach((name, i) => {
  const note = notes[(i * STRIDE) % notes.length];
  (note.tags || (note.tags = [])).push(name);
  // github#107 -- double-tags with DOMINANT for coverage
  if (name !== DOMINANT && i % 2 === 0) note.tags.push(DOMINANT);
});

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
  // github#107 -- tags after created, byte-identical when untagged
  const fm = [`created: ${day(i)}`];
  if (n.tags && n.tags.length) fm.push(`tags: [${n.tags.join(", ")}]`);
  writeFileSync(join(OUT, n.dir, n.title + ".md"),
                `---\n${fm.join("\n")}\n---\n\n` + body.join(" ") + "\n", "utf8");
});

const orphans = notes.filter((n) => n.orphan).length;
console.log(`wrote ${notes.length} notes to ${OUT}`);
console.log(`  ${links} link refs, ${orphans} unlinked, one of them at the vault root`);
console.log(`  dominant folder: ${FOLDERS[0].dir} ${FOLDERS[0].n}/${notes.length} = ` +
            `${Math.round(FOLDERS[0].n / notes.length * 100)}%`);
// github#107 -- the tag dimension is degenerate too; this reports the shape
const per = new Map();
let pairs = 0, tagged = 0;
for (const n of notes) {
  if (!n.tags || !n.tags.length) continue;
  tagged++;
  for (const t of n.tags) { per.set(t, (per.get(t) || 0) + 1); pairs++; }
}
const counts = [...per.values()].sort((a, b) => a - b);
const atMost = (k) => counts.filter((v) => v <= k).length;
console.log(`  ${per.size} tags over ${tagged} tagged notes (${notes.length - tagged} untagged), ` +
            `${pairs} tag refs = ${(pairs / tagged).toFixed(2)} a note`);
console.log(`  tail: ${atMost(1)} tags on exactly one note ` +
            `(${Math.round(atMost(1) / per.size * 100)}%), ${atMost(3)} on three or fewer ` +
            `(${Math.round(atMost(3) / per.size * 100)}%)`);
console.log(`  dominant tag: ${DOMINANT} ${per.get(DOMINANT)}/${notes.length} = ` +
            `${Math.round(per.get(DOMINANT) / notes.length * 100)}%`);
// github#119 -- how much of the tail a leading-prefix clustering catches
const lcp = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; };
const smallNames = [...per.entries()].filter(([, v]) => v <= 3).map(([t]) => t).sort();
for (const min of [3, 4]) {
  let grouped = 0, runs = 0, run = 1;
  for (let i = 1; i <= smallNames.length; i++) {
    if (i < smallNames.length && lcp(smallNames[i - 1], smallNames[i]) >= min) { run++; continue; }
    if (run > 1) { runs++; grouped += run; }
    run = 1;
  }
  console.log(`  tail names sharing >=${min} leading chars: ${grouped}/${smallNames.length} ` +
              `(${Math.round(grouped / smallNames.length * 100)}%) in ${runs} clusters`);
}
