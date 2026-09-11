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

/* ------------------------------------------------------------------ tags --
 * github#107 -- this fixture is the DEGENERATE-DISTRIBUTION vault, and until now it was
 * degenerate in one dimension only: one folder holding 77% of the notes. Its tag dimension
 * did not exist at all, and no other fixture has a tail below 16 notes a group -- tag-vault's
 * smallest is 16 -- so "many tags, nearly all of them holding one or two notes" was a shape
 * the tag disc had never been laid out against. It is the shape a real vault reaches: measured
 * on the vault that prompted this, 76 top-level tags, 53% of them holding exactly one note,
 * 72% holding three or fewer, and a dominant tag on 49% of the vault.
 *
 * The bands below are deliberately HARDER than that, because a fixture that only just
 * reproduces today's complaint stops catching it the moment the complaint is answered.
 *
 * TWO THINGS KEEP THE FOLDER LAYOUT BYTE-IDENTICAL, and both matter: this generator's rnd()
 * is one shared stream that the link loop draws from, so anything here that touched it would
 * reshuffle every link and move every note -- the assignment below is purely index-based and
 * draws from rnd() not once. And tags ride in frontmatter beside a `created` date that does
 * not move, so no note changes folder, date or degree. shape-vault's golden is recorded in the
 * FOLDER dimension and stays green; the check that proves it is "layout matches its golden
 * snapshot", not this comment. */
const TAG_STEMS = ["anchor", "beacon", "cinder", "delta", "ember", "fathom",
                   "girder", "harbor", "ingot", "jetty", "kiln", "lumen"];
const TAG_LEAVES = ["brief", "draft", "field", "guide", "index", "log",
                    "memo", "plan", "query", "sketch", "trace"];
// 12 x 11 = 132 names, taken in a fixed order; the tail needs 115 of them
const TAIL_NAMES = [];
for (const s of TAG_STEMS) for (const l of TAG_LEAVES) TAIL_NAMES.push(`${s}-${l}`);

const DOMINANT = "inbox";
// [name, notes carrying it] -- the mid band is named, the tail is generated
const TAG_BANDS = [[DOMINANT, 600], ["review", 30], ["archive", 24], ["spec", 18], ["thread", 14]];
// 15 tags of 4-9 notes, then 12 of three, 13 of two, 75 of exactly one
let tail = 0;
for (let i = 0; i < 15; i++) TAG_BANDS.push([TAIL_NAMES[tail++], 4 + (i % 6)]);
for (let i = 0; i < 12; i++) TAG_BANDS.push([TAIL_NAMES[tail++], 3]);
for (let i = 0; i < 13; i++) TAG_BANDS.push([TAIL_NAMES[tail++], 2]);
for (let i = 0; i < 75; i++) TAG_BANDS.push([TAIL_NAMES[tail++], 1]);

// One tag per slot, then a stride that is coprime with the note count so the slots land on
// distinct notes and a tag's members are scattered ACROSS the folders rather than sitting
// inside one -- a tag dimension that merely re-drew the folder wedges would test nothing.
const slots = [];
for (const [name, n] of TAG_BANDS) for (let i = 0; i < n; i++) slots.push(name);
const STRIDE = 379;   // prime, and 954 = 2 * 3 * 3 * 53, so the two share no factor
slots.forEach((name, i) => {
  const note = notes[(i * STRIDE) % notes.length];
  (note.tags || (note.tags = [])).push(name);
  // A note off the dominant tag takes it as a SECOND tag on every other slot, so the
  // dimension carries copies -- a multi-tagged note is drawn once per tag, and the real
  // vault runs 1.53 tags a note. Without this the disc would have none to place.
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
  // github#107 -- tags after created, so an untagged note's frontmatter is byte-identical
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
// github#107 -- the tag dimension is degenerate too, and this is the shape it is degenerate in
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
