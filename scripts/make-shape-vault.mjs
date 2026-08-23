// Generate a vault with ONE DOMINANT FOLDER and an UNLINKED ROOT NOTE.
// Writes nothing outside its output directory, and that directory is gitignored.
//
//   node scripts/make-shape-vault.mjs                   # ./shape-vault, 954 notes
//   node scripts/make-shape-vault.mjs --out /tmp/sv
//   node scripts/make-shape-vault.mjs --end 2026-08-24  # pin the newest date
//
// It is CHEAP -- 954 notes, measured 13s through the whole suite, against a minute or two
// for the 10,000-note one. That is why it runs by default rather than on request.
//
// WHY THIS EXISTS, and why the suite runs it by default. The other two fixtures cannot
// produce this shape: the mirror follows a real vault (~450 notes, no orphans at all) and
// the 10k synthetic spreads itself across 17 top-level folders. Neither has a group
// holding three quarters of the vault, and neither has a single unlinked note sitting at
// the vault root. Both passed happily while a reported vault failed three checks
// (github#5), and both failures were shape-dependent:
//
//   * ONE GROUP AT 77%. Hiding it leaves a disc small enough that one spurious row moves
//     the outer radius, which is how a seated zero-weight cell was caught costing a row
//     it had no right to. On a vault where no group dominates, the same row disappears
//     into the maximum and nothing shows.
//   * AN UNLINKED NOTE AT THE VAULT ROOT. "(vault root)" sorts ahead of every real folder
//     and the note is degree 0, so it lands in "(unlinked)" -- which is what caught two
//     checks picking a note by its folder and then highlighting by group.
//   * MOST OF ONE FOLDER UNLINKED (96 of 100), so the group a note is filed under and the
//     group it is drawn in disagree in bulk rather than once.
//
// The proportions are the ones from the report: 954 notes, six top-level groups at
// 738 / 100 / 82 / 27 / 6 plus a single root note, and 139 orphans. Names are generic on
// purpose -- this fixture is about SHAPE, and the realistic-names argument belongs to
// make-test-vault.mjs, which is the one the demo is recorded against.
//
// Deterministic apart from the end date: no Math.random, so the same run gives the same
// vault and a measurement is repeatable.
//
// THE END DATE DEFAULTS TO TODAY, the same deliberate break make-test-vault.mjs takes, and
// for the same reason plus one of its own. The shared reason is that the heatmap band shows
// the last 52 weeks against the real clock, so a fixture anchored to a fixed day drifts out
// of it. The one specific to this file is that the anchor WAS fixed, at 2025-09-01, and the
// 420-day cycle then ran forwards from it -- which by 2026-08-24 put 68 days of `created`
// stamps in the FUTURE. No real note has one: a file cannot have been created after today,
// whatever date the note is about. Discounting them left 357 days of real history against a
// 364-day window, so the band already covered everything and the window had nothing to
// scroll -- and two checks that assume it can move failed against a fixture that was wrong
// rather than a page that was (github#18). The cycle runs BACKWARDS from the end date now.
//
// Pass --end to get the byte-reproducible guarantee back.

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = arg("out", join(HERE, "..", "shape-vault"));

// mulberry32, seeded fixed. Same reasoning as the other generator: an unrepeatable
// fixture is not a fixture.
let seed = Number(arg("seed", 20260823));
const rnd = () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// name, count, how many of them are unlinked, and how many subfolders to spread them over.
//
// THE DOMINANT FOLDER IS NESTED, and that is not decoration. A flat vault has no twisties,
// so the nav-alignment check cannot open the tree and reports that it never did -- a
// fixture that silently disables one of the suite's own checks is a worse fixture. Five
// subfolders also puts the dominant group past NEST_MIN and SUB_SLOTS, so hiding it seats
// several zero-weight cells rather than one, which is a stricter version of the case this
// vault exists to catch.
const FOLDERS = [
  { dir: "projects", n: 738, orphans: 30, subs: 5 },   // the dominant folder, 77% of the vault
  { dir: "notes",    n: 100, orphans: 96, subs: 0 },   // almost all unlinked
  { dir: "refs",     n:  82, orphans:  4, subs: 2 },
  { dir: "misc",     n:  27, orphans:  2, subs: 0 },
  { dir: "tiny",     n:   6, orphans:  6, subs: 0 },   // every note unlinked
];

// Spread over the 420 days ENDING at the end date, so the heatmap band has something to
// draw and nothing is stamped later than today. 420 against a 364-day window leaves the
// window ~8 weeks of travel, which is what makes this shape worth pointing the ribbon
// checks at: narrow enough that the pill fills most of the rail, wide enough that it moves.
const SPAN_DAYS = 420;
const END = Date.parse(arg("end", new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
const DAY0 = END - (SPAN_DAYS - 1) * 86400000;
const day = (i) => new Date(DAY0 + (i % SPAN_DAYS) * 86400000).toISOString().slice(0, 10);

// Subfolders are UNEVEN on purpose: an even split is the one case where the four tint
// slots and the "N smaller subfolders" fold never have to decide anything.
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

// The note list is built before anything is written, so links can point at real titles.
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
    // Power-law-ish out-degree, the same shape make-test-vault uses: most notes link to a
    // few, a handful are hubs, and a few links point at nothing.
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
