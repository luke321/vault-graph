// Generate a synthetic Obsidian vault for development and for recording the demo.
// Writes nothing outside its output directory, and that directory is gitignored.
//
//   node scripts/make-test-vault.mjs                    # ./test-vault, ~3000 notes
//   node scripts/make-test-vault.mjs --notes 8000
//   node scripts/make-test-vault.mjs --notes 10000 --years 10
//   node scripts/make-test-vault.mjs --out /tmp/tv --seed 7
//
// WHY THIS EXISTS. Every measurement in .ai-context/ was taken against ONE vault: ~450
// notes, 9 top-level folders, one dominant folder. Anyone else's vault is a different
// shape, and the constants that look like tuning are the ones most likely to break on it --
// twelve colour slots, three named tint slots, a 6-degree minimum wedge. This generates the
// shapes that vault cannot produce:
//
//   * MORE top-level folders than there are colour slots (12), so the palette has to wrap
//     and the wedge minimum gets exercised. 17 folders means slots g1-g12 and then g1-g5
//     again -- the only shape that proves the cycle, since a 9-folder vault never reaches
//     the end of the palette at all
//   * SLIVER folders at root with 1-3 notes, beside a folder holding a third of the vault
//   * DEEP nesting, five levels, past the point the legend indents
//   * MANY subfolders in one folder, past the three that get their own tint
//   * date-named folders at several depths, to exercise the date-bucket rule
//   * notes with no frontmatter, no links, no tags -- and some with all three
//
// The names are DELIBERATELY REALISTIC. It is the vault the demo is recorded against, and
// a recording made from a real vault publishes that vault's note titles -- so the public
// video is made from this one instead. Realistic names also surface layout problems that
// `foo-12` hides: real titles are long, they collide, and they truncate.
//
// Every person, project and place here is invented. Any resemblance is coincidence.
//
// Deterministic: the same --seed gives the same vault, so a measurement is repeatable.

import { mkdirSync, writeFileSync, rmSync, existsSync, utimesSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = arg("out", join(HERE, "..", "test-vault"));
const TARGET = Number(arg("notes", 3000));
let seed = Number(arg("seed", 1));

// mulberry32. Math.random would make every run a different vault and every measurement
// unrepeatable, which defeats the point of having a fixture at all.
const rnd = () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const some = (a, n) => { const c = a.slice(); const o = []; while (o.length < n && c.length) o.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return o; };

/* ---------------------------------------------------------------- vocabulary */

const PEOPLE = ["Mara Lindqvist", "Tobias Reuter", "Priya Raghavan", "Elena Duarte",
  "Samuel Achebe", "Nora Vikander", "Ivan Petrov", "Yuki Tanabe", "Claire Beaumont",
  "Dmitri Sokolov", "Amara Okoro", "Lars Bergqvist", "Sofia Marchetti", "Owen Fitzgerald",
  "Hana Kowalski", "Rafael Mendes", "Ingrid Halvorsen", "Kwame Mensah", "Beatrix Vogel",
  "Julien Rousseau", "Mei Lin Chen", "Anders Holm", "Rosa Delgado", "Viktor Novak"];

const PROJECTS = ["Greenhouse Rebuild", "Website Migration", "Thesis Chapter 3",
  "Kitchen Renovation", "Language Exchange", "Marathon Training Block",
  "Home Server Rebuild", "Photo Archive Cleanup", "Bee Hive Setup",
  "Camper Van Conversion", "Family Recipe Book", "Allotment Plan"];

const AREAS = ["Health", "Finance", "Career", "Home", "Learning", "Relationships"];

const BOOKS = ["Thinking in Systems", "The Timeless Way of Building", "How to Take Smart Notes",
  "Seeing Like a State", "The Design of Everyday Things", "A Pattern Language",
  "Deep Work", "The Origin of Consciousness", "Gödel Escher Bach", "The Art of Doing Science",
  "Understanding Comics", "Range", "The Making of the Atomic Bomb", "Debt: The First 5000 Years"];

const CONCEPTS = ["Zettelkasten", "Second brain", "Spaced repetition", "Progressive summarisation",
  "Feedback loops", "Antifragility", "Slack in systems", "Legibility", "Chesterton's fence",
  "Goodhart's law", "Affordance", "Path dependence", "Sunk cost", "Signal and noise",
  "Emergence", "Stigmergy", "Bus factor", "Yak shaving", "Cargo cult", "Conway's law",
  "Hyrum's law", "Second-order thinking", "Inversion", "Via negativa"];

const RECIPES = ["Sourdough starter", "Ragù bolognese", "Miso aubergine", "Dal tarka",
  "Kimchi pancakes", "Tarte tatin", "Shakshuka", "Congee", "Focaccia", "Green curry paste",
  "Preserved lemons", "Pickled red onion", "Cardamom buns", "Kouign-amann"];

const PLACES = ["Lisbon", "Trieste", "Bergen", "Kyoto", "Ljubljana", "Porto", "Tallinn",
  "Utrecht", "Galway", "Split", "Bruges", "Valencia", "Gdansk", "Bologna"];

const MEETINGS = ["Sprint planning", "Design review", "Retrospective", "Roadmap sync",
  "Architecture review", "Hiring debrief", "Budget check-in", "Vendor call",
  "Onboarding session", "Incident review", "Quarterly planning", "Team sync"];

const ARTICLES = ["Notes on distributed systems", "Why interfaces rot",
  "On writing less code", "The cost of abstraction", "Reading a codebase",
  "How to run a postmortem", "Estimation without lying", "On technical debt",
  "The shape of a good API", "Documentation that survives"];

const TAGS = ["idea", "reference", "howto", "review", "draft", "question", "decision",
  "seedling", "evergreen", "permanent"];

const WORDS = ("the argument here is less about tooling than about attention which is the " +
  "scarce resource and the reason a system that demands upkeep tends to collapse into the " +
  "one that does not while the notes that survive are the ones written for a reader who " +
  "has forgotten everything including their own reasons").split(" ");

/* -------------------------------------------------------------------- shape */

// share: fraction of the vault. subs: explicit subfolder names, or a generator.
const YM = (n) => Array.from({ length: n }, (_, i) =>
  `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
const YQ = (n) => Array.from({ length: n }, (_, i) =>
  `${2025 + Math.floor(i / 4)}-Q${(i % 4) + 1}`);

const FOLDERS = [
  // FIXED, not shared -- an exact count regardless of --notes, the same way the three
  // slivers at the bottom of this list already are. Daily Notes was the biggest share
  // by far (0.26) and is deliberately cut down here, well below several folders it
  // used to dwarf.
  { name: "04 - Daily Notes",   fixed: 50, subs: YM(18), kind: "daily" },
  { name: "05 - Meeting Notes", share: 0.17, subs: YM(14), kind: "meeting",
    deep: { "2025-03": ["Acme Corp", "Northwind"], "2025-09": ["Acme Corp"] } },
  // Resources deliberately smaller than Zettelkasten now, rather than the other way
  // share alone would have given it.
  { name: "03 - Resources",     fixed: 60, kind: "resource",
    subs: ["Books", "Articles", "Concepts", "People", "Recipes", "Travel", "Quotes", "Software", "Languages"],
    deep: { People: ["Colleagues", "Family", "Authors"], Travel: ["Europe", "Asia"],
            Books: ["Read", "Reading", "To read"] } },
  { name: "01 - Projects",      fixed: 200, kind: "project", subs: PROJECTS.slice(0, 7),
    deep: { "Greenhouse Rebuild": ["Notes", "Suppliers"], "Website Migration": ["Content", "Redirects"] } },
  { name: "06 - Zettelkasten",  fixed: 200, kind: "zettel", subs: ["Permanent", "Literature", "Fleeting"] },
  { name: "02 - Areas",         share: 0.06, kind: "area", subs: AREAS,
    deep: { Health: ["Training", "Nutrition"], Finance: ["Budget", "Investments"] } },
  { name: "07 - Weekly Reviews", share: 0.04, kind: "review", subs: YQ(6) },
  { name: "08 - Archive",       share: 0.03, kind: "archive", subs: YM(8),
    deep: { "2025-01": ["Old projects"], "2025-05": ["Old projects", "Superseded"] } },
  { name: "09 - Maps of Content", share: 0.02, kind: "moc", subs: [] },
  { name: "10 - Literature Notes", share: 0.015, kind: "literature", subs: [] },
  // Past the twelve colour slots on purpose: everything below wraps to the start of the
  // palette, so the same hue appears on two wedges and the cycle is actually exercised.
  { name: "11 - Clippings",     share: 0.01, kind: "article", subs: [] },
  { name: "12 - Journal",       share: 0.005, kind: "daily", subs: [] },
  // One more, so the wedge count is still past what a ten-slot palette can name. Two
  // siblings of this one (Media Log, Ideas) were trimmed to thin the outer ring --
  // this is the one of the three with real subfolder structure to lose testing it.
  { name: "15 - Courses",       share: 0.02, kind: "literature",
    subs: ["Enrolled", "Completed", "Wishlist"] },
  // Slivers, beside a folder holding a quarter of the vault.
  { name: "00 - Inbox",         fixed: 3, kind: "fleeting", subs: [] },
  { name: "13 - Someday Maybe", fixed: 2, kind: "fleeting", subs: [] },
  { name: "14 - Reading List",  fixed: 1, kind: "fleeting", subs: [] }
];

/* ---------------------------------------------------------------- titles */

/* ------------------------------------------------------------------- dates --
 * HOW FAR BACK THE VAULT GOES, and how its notes are spread over that.
 *
 *   --years 10                 span ten years instead of the default 560 days
 *   --end 2026-08-23           pin the newest date, for a byte-reproducible vault
 *
 * The END DEFAULTS TO TODAY, which is a deliberate break from "the same --seed gives the
 * same vault". It has to: the heatmap band shows the last 52 WEEKS relative to the real
 * clock, so a fixture whose newest note is a year in the past exercises none of it. The
 * anchor used to be a hardcoded 2025-01-06 and had already drifted a month behind. Pass
 * --end to get the old guarantee back.
 *
 * THE SPREAD IS A MIXTURE, NOT A CURVE, because that is what a real vault looks like: a
 * long stretch of occasional use and then the point where it got adopted properly.
 * Measured on the author's own 452-note vault -- 389 notes in the last twelve months and 52
 * spread over the eleven years before it, with one year holding none at all. A single power
 * law cannot produce both halves of that: tuned to put 86% in the last year it leaves the
 * earlier years empty, and tuned to fill them it flattens the burst.
 *
 * So: RECENT_SHARE of the notes land in the last twelve months, the rest spread back over
 * the whole span with a mild recency lean. Both halves are visible on a year-scale control,
 * which is the point of generating this at all.
 */
const endStr = arg("end", new Date().toISOString().slice(0, 10));
const END = Date.parse(endStr + "T00:00:00Z");
const YEARS = Number(arg("years", 0));
/**
 * Fraction of notes dated within the last twelve months.
 *
 * 0.55 for the default 560-day span, which is the shape described above and is what that
 * fixture has always had. For a MULTI-YEAR span it is 1.4 / YEARS -- the last year gets 1.4x
 * an even share and the rest spread out -- because at 0.55 a ten-year vault is not a ten-year
 * vault. Measured before this: 4707 notes in 2026 and 1310 in 2025 out of 10 001, against
 * 300-600 for each of the nine years before, so 60% of it sat in the last twenty months and
 * every year-scale control was reading one year with a tail.
 *
 * --recent 0.55 restores the old shape on any span.
 */
const RECENT_SHARE = Number(arg("recent", YEARS > 1 ? 1.4 / YEARS : 0.55));
const DAYS = YEARS > 0 ? Math.round(YEARS * 365.25) : 560;
const DAY0 = END - DAYS * 86400000;
const dayStr = (i) => new Date(DAY0 + i * 86400000).toISOString().slice(0, 10);

/**
 * A day index for one note, 0 = oldest, DAYS = the end date.
 *
 * `Math.pow(rnd(), 0.45)` is what this was, and it is kept for the single-span default so
 * the existing fixture is unchanged. The mixture only engages once --years asks for a span
 * longer than the recent window it is meant to sit behind.
 */
// The day drawn for each note, so the file stamp below can reuse it rather than draw again.
const dayByNote = new WeakMap();
const createdDayOf = (n) => dayByNote.get(n);
createdDayOf.set = (n, d) => dayByNote.set(n, d);

function createdDay() {
  if (YEARS <= 0 || DAYS <= 365) return Math.floor(Math.pow(rnd(), 0.45) * DAYS);
  if (rnd() < RECENT_SHARE) {
    // The burst: the last twelve months, leaning to the most recent weeks.
    //
    // THE EXPONENT HAS TO BE ABOVE 1 HERE and below 1 in the tail below, which is not
    // symmetry it is the opposite: this one is a distance BACK from the end of the span, the
    // other is a distance FORWARD from the start, and both want to lean toward the present.
    // It was 0.55, which leans a distance-back toward LARGER -- so the burst landed at the
    // beginning of its own twelve months and the newest weeks came out emptiest. Visible as a
    // heatmap whose right-hand edge, the part that is today, was the sparsest thing on it.
    return DAYS - Math.floor(Math.pow(rnd(), 1.8) * 365);
  }
  // The tail: everything before that, spread EVENLY. Never reaches into the burst, so the two
  // shares stay the shares they say they are.
  //
  // This leaned later, at pow(rnd(), 0.75), which compounded with the burst: the years nearest
  // the burst took the most of the remainder and the oldest took the least, so a ten-year vault
  // ramped instead of spanning. Uniform here, and the recency lean lives entirely in
  // RECENT_SHARE, where it can be set.
  return Math.floor(rnd() * Math.max(1, DAYS - 365));
}
// Anchored to the span's own first year rather than a hardcoded 2025, or a --years 10 vault
// files a decade of weekly reviews under years it has no notes in.
const YEAR0 = new Date(DAY0).getUTCFullYear();
const weekStr = (i) => `${YEAR0 + Math.floor(i / 52)}-W${String((i % 52) + 1).padStart(2, "0")}`;

let nth = 0;
function titleFor(kind) {
  nth++;
  switch (kind) {
    case "daily":     return dayStr(int(0, DAYS));
    case "review":    return weekStr(int(0, 70));
    case "meeting":   return `${dayStr(int(0, DAYS))} ${pick(MEETINGS)}`;
    case "project":   return `${pick(PROJECTS)} — ${pick(["scope", "log", "budget", "next steps", "retro", "open questions"])}`;
    case "area":      return `${pick(AREAS)} — ${pick(["review", "goals", "notes", "tracker"])} ${nth}`;
    case "zettel":    return pick(CONCEPTS) + (rnd() < 0.4 ? ` and ${pick(CONCEPTS).toLowerCase()}` : "");
    case "literature": return `${pick(BOOKS)} — notes`;
    case "article":   return pick(ARTICLES);
    case "moc":       return `${pick(["Systems", "Writing", "Cooking", "Travel", "Software", "Health"])} MOC`;
    case "fleeting":  return `${pick(["Look into", "Ask about", "Try", "Read"])} ${pick(CONCEPTS).toLowerCase()}`;
    default:
      // resources: pick by the subfolder they landed in, handled by the caller
      return pick(CONCEPTS) + " " + nth;
  }
}
function resourceTitle(sub) {
  if (/People|Colleagues|Family|Authors/.test(sub)) return pick(PEOPLE);
  if (/Books|Read/.test(sub)) return pick(BOOKS);
  if (/Recipes/.test(sub)) return pick(RECIPES);
  if (/Travel|Europe|Asia/.test(sub)) return pick(PLACES);
  if (/Articles/.test(sub)) return pick(ARTICLES);
  if (/Quotes/.test(sub)) return `"${pick(WORDS)} ${pick(WORDS)}" — ${pick(PEOPLE)}`;
  if (/Concepts/.test(sub)) return pick(CONCEPTS);
  if (/Software/.test(sub)) return `${pick(["Setting up", "Notes on", "Cheatsheet:"])} ${pick(["ripgrep", "tmux", "Syncthing", "Caddy", "restic", "fzf", "Zotero"])}`;
  if (/Languages/.test(sub)) return `${pick(["Italian", "Japanese", "Portuguese", "Swedish"])} — ${pick(["grammar", "vocab", "listening"])} ${nth}`;
  return pick(CONCEPTS) + " " + nth;
}

/* -------------------------------------------------------------------- paths */

function pathsFor(f) {
  const out = [f.name];
  for (const s of (f.subs || [])) {
    const p = `${f.name}/${s}`;
    out.push(p);
    for (const d of (f.deep && f.deep[s]) || []) {
      out.push(`${p}/${d}`);
      // one more level, so something in the vault is five deep
      if (rnd() < 0.5) out.push(`${p}/${d}/${pick(["Drafts", "Archive", "Assets", "Sources"])}`);
    }
  }
  return out;
}

/* -------------------------------------------------------------------- write */

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, ".obsidian"), { recursive: true });
writeFileSync(join(OUT, ".obsidian", "app.json"), "{}\n");
writeFileSync(join(OUT, ".obsidian", "templates.json"),
  JSON.stringify({ folder: "99 - Templates" }, null, 2) + "\n");
writeFileSync(join(OUT, ".obsidian", "daily-notes.json"),
  JSON.stringify({ folder: "04 - Daily Notes", format: "YYYY-MM-DD" }, null, 2) + "\n");

const fixedTotal = FOLDERS.reduce((a, f) => a + (f.fixed || 0), 0);
const shareTotal = FOLDERS.reduce((a, f) => a + (f.share || 0), 0);
const plan = FOLDERS.map((f) => ({
  ...f,
  paths: pathsFor(f),
  count: f.fixed != null ? f.fixed
       : Math.max(1, Math.round((TARGET - fixedTotal) * f.share / shareTotal))
}));

// Titles first, so links can point at notes that exist. Keyed by folder so a note in
// People links mostly to other people.
const notes = [];
for (const f of plan) {
  for (let i = 0; i < f.count; i++) {
    const dir = pick(f.paths);
    const sub = dir.slice(f.name.length + 1);
    const title = f.kind === "resource" ? resourceTitle(sub || "Concepts") : titleFor(f.kind);
    notes.push({ dir, title, kind: f.kind });
  }
}
// De-duplicate titles -- a real vault cannot have two notes with the same name in one
// folder, and Obsidian's basename link resolution gets ambiguous across folders too.
const used = new Set();
for (const n of notes) {
  let t = n.title, k = 2;
  while (used.has(t.toLowerCase())) t = `${n.title} (${k++})`;
  used.add(t.toLowerCase());
  n.title = t;
}

const titles = notes.map((n) => n.title);
let written = 0;
for (const n of notes) {
  const dir = join(OUT, n.dir);
  mkdirSync(dir, { recursive: true });

  const bare = rnd() < 0.2;                              // some notes have no frontmatter
  // One draw per note, used by BOTH the frontmatter line and the file stamp below -- drawing
  // twice would date a note's text and its stamp differently, which is a disagreement the
  // builder would then have to resolve and this fixture has no business creating.
  const day = createdDay();
  createdDayOf.set(n, day);
  const created = dayStr(day);
  const tags = rnd() < 0.55 ? some(TAGS, int(1, 2)) : [];
  const fm = bare ? "" : ["---", `created: ${created}`,
    tags.length ? `tags: [${tags.join(", ")}]` : null,
    n.kind === "meeting" && rnd() < 0.7 ? `person: "[[${pick(PEOPLE)}]]"` : null,
    rnd() < 0.05 ? `aliases: ["${n.title.split(" ")[0]} note"]` : null,
    "---", ""].filter(Boolean).join("\n");

  // Power-law-ish out-degree: most notes link to a few, a handful are hubs, some links
  // point at nothing (unresolved links are normal and must not break the build).
  const outs = rnd() < 0.04 ? int(20, 55) : int(0, 5);
  const links = [];
  for (let k = 0; k < outs; k++) {
    if (rnd() < 0.07) links.push(`[[${pick(CONCEPTS)} ${int(900, 999)}]]`);
    else links.push(`[[${titles[Math.floor(Math.pow(rnd(), 2) * titles.length)]}]]`);
  }

  const paras = [];
  for (let p = 0; p < int(1, 4); p++) {
    paras.push(Array.from({ length: int(15, 70) }, () => pick(WORDS)).join(" ") + ".");
  }
  const fence = rnd() < 0.08
    ? "\n```dataview\nLIST FROM [[" + pick(CONCEPTS) + " nonexistent]]\n```\n" : "";

  const file = join(dir, n.title.replace(/[\\/:*?"<>|]/g, "-") + ".md");
  writeFileSync(file,
    `${fm}# ${n.title}\n\n${paras.join("\n\n")}\n${fence}\n${links.join(" ")}\n`);
  // THE FILE STAMP IS A DATE SOURCE, so it has to carry the note's own date.
  //
  // A fifth of these notes deliberately have no frontmatter, which is what exercises the
  // builder's fallback path -- and the fallback is the file's mtime, which is the moment the
  // generator ran. So every one of them landed on the same day: measured, 1173 notes of 10 001
  // all dated today, on top of the burst. Stamping the file with the date the note was supposed
  // to have keeps the fallback path exercised AND lets those notes spread like the rest.
  const stamp = new Date(DAY0 + createdDayOf(n) * 86400000);
  try { utimesSync(file, stamp, stamp); } catch { /* a stamp is a nicety, not a requirement */ }
  written++;
}

// Templates, which the builder must EXCLUDE by default.
mkdirSync(join(OUT, "99 - Templates"), { recursive: true });
for (const t of ["Daily Note", "Meeting Note", "Person Note", "Book Note"]) {
  writeFileSync(join(OUT, "99 - Templates", t + ".md"),
    `---\ncreated: {{date:YYYY-MM-DD}}\n---\n# {{title}}\n\nTemplate for ${t}.\n`);
}
// Loose at the root -- the "(vault root)" pseudo-folder.
for (const t of ["Home", "Dashboard"]) {
  writeFileSync(join(OUT, t + ".md"),
    `# ${t}\n\n[[${titles[0]}]] · [[${titles[1]}]] · [[${titles[2]}]]\n`);
}

console.log(`wrote ${written} notes + 4 templates + 2 root notes to ${OUT}\n`);
console.log(`${plan.length} top-level folders (${plan.length - 10} past the colour slots):`);
for (const f of plan) {
  console.log(`  ${String(f.count).padStart(5)}  ${f.name.padEnd(24)} ${String(f.paths.length).padStart(3)} folder(s)`);
}
console.log(`\ndeepest path: ${plan.flatMap((f) => f.paths).reduce((a, p) => p.split("/").length > a.split("/").length ? p : a)}`);
console.log(`\nbuild it:\n  node src/build-graph.mjs --vault "${OUT}" --out "${join(OUT, "graph.html")}"`);
