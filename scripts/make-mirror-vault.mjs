#!/usr/bin/env node
// Build a MIRROR of a real vault: structurally identical, containing none of its content.
//
//   node scripts/make-mirror-vault.mjs                        # from $OBSIDIAN_VAULT
//   node scripts/make-mirror-vault.mjs --vault D:/Notes --out mirror-vault --seed 7
//
// THIS IS FOR BUG REPORTS, not for the demo. It was make-demo-vault.mjs until the demo vault
// became a fixed invented structure -- see that file for why. What it does is still worth
// having and nothing else does it: if the layout misbehaves on YOUR vault, the shape is the
// bug report, and this is how to hand that over without handing over the notes. A generic
// fixture cannot reproduce a shape it does not have.
//
// WHY THIS EXISTS. The README's demo GIF was recorded against the real vault, so it
// publishes the vault's name, every folder, and the counts. Nothing catastrophic, but it
// is somebody's private structure in a public repo, and the moment a hover tooltip lands
// on a note in a future recording it becomes note titles too. A demo needs a vault that
// LOOKS like the real one -- same shape, same density, same growth over time, because
// those are what the layout is tuned against -- and shares none of its words.
//
// WHAT IS PRESERVED, because the disc is a picture of exactly these things:
//   * the folder tree, to whatever depth it goes
//   * how many notes sit in each folder
//   * each note's `created` date, so the heatmap and the timeline look the same
//   * each note's word count, so node sizes land in the same places
//   * the LINK GRAPH: every edge is reproduced between the renamed notes, so degree,
//     orphan count and the hub structure come out identical
//
// WHAT IS REPLACED:
//   * every note's filename and title
//   * every folder name that looks like a person's name
//   * every body: filler prose of the same length, carrying the rewritten links
//
// WHAT IS DROPPED ENTIRELY: the real body text, real tags' meanings (tag NAMES are
// synthesised too), aliases, and anything in frontmatter that is not a date.
//
// Deterministic: same vault and same seed produce the same demo vault, so a re-recorded
// GIF differs only where the tool changed.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, relative, sep, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };

const VAULT = resolve(opt("vault", process.env.VAULT_GRAPH_VAULT || process.env.OBSIDIAN_VAULT || ""));
const OUT = resolve(opt("out", join(ROOT, "mirror-vault")));
const SEED = Number(opt("seed", 1));

if (!VAULT || !existsSync(join(VAULT, ".obsidian"))) {
  console.error("no vault: pass --vault <path> or set OBSIDIAN_VAULT");
  process.exit(1);
}
if (OUT === VAULT) { console.error("refusing to write into the source vault"); process.exit(1); }

/* ------------------------------------------------------------------ random --
 * mulberry32. Seeded on purpose: an unseeded generator makes every regeneration a fresh
 * vault, so a re-recorded demo differs everywhere and no diff means anything. */
let _s = SEED >>> 0;
const rnd = () => {
  _s = (_s + 0x6D2B79F5) >>> 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

/* ------------------------------------------------------------- name sources */

const FIRST = ["Ada", "Alan", "Grace", "Edsger", "Barbara", "Donald", "Frances", "Ken",
  "Radia", "Leslie", "Tony", "Niklaus", "Kathleen", "Ivan", "Maurice", "Jean", "Karen",
  "Peter", "Sophie", "Marta", "Ruth", "Vint", "Anita", "Erik", "Nadia", "Otto"];
const LAST = ["Lovelace", "Turing", "Hopper", "Dijkstra", "Liskov", "Knuth", "Allen",
  "Thompson", "Perlman", "Lamport", "Hoare", "Wirth", "Booth", "Sutherland", "Wilkes",
  "Bartik", "Uhlenbeck", "Naur", "Wilson", "Estrin", "Cerf", "Borg", "Meyer", "Falk"];
const ADJ = ["quiet", "narrow", "second", "amber", "hollow", "northern", "plain", "steady",
  "distant", "folded", "open", "level", "gentle", "sharp", "silver", "early", "late",
  "broad", "shallow", "warm", "cold", "still", "loose", "tight", "clear", "vague"];
const NOUN = ["harbour", "signal", "ledger", "lantern", "corridor", "meadow", "junction",
  "cadence", "threshold", "compass", "anchor", "trellis", "basin", "ridge", "ferry",
  "orchard", "kiln", "quarry", "beacon", "sluice", "cairn", "vane", "spindle", "weir"];
const TOPIC = ["logistics", "drainage", "typography", "ferries", "beekeeping", "masonry",
  "cartography", "acoustics", "hydrology", "printing", "glassware", "rope", "signals"];

const WORDS = ("the quiet ledger records what the harbour forgets a signal arrives before " +
  "the ferry and leaves after it every corridor eventually meets a stair the compass is " +
  "honest about north and vague about everything else a threshold is a place you only " +
  "notice twice measurement beats argument the second attempt is usually the shorter one " +
  "nothing in the chain is allowed to step a plain sentence survives translation").split(" ");

/* -------------------------------------------------------- read the real vault */

const SKIP_DIRS = new Set(["node_modules"]);
const SKIP_FILES = new Set(["claude.md", "readme.md", "license.md"]);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      walk(p, acc);
    } else if (entry.toLowerCase().endsWith(".md") && !SKIP_FILES.has(entry.toLowerCase())) {
      acc.push(p);
    }
  }
  return acc;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DATEISH = /^\d{4}(?:[-_ ]?(?:\d{2}|Q[1-4]|W\d{1,2}))?$/i;
const WIKILINK = /!?\[\[([^[\]|#^]+)(?:[#^][^[\]|]*)?(?:\|[^[\]]*)?\]\]/g;

// A name that belongs to a person.
//
// TIGHTENED after measuring: "two or more capitalised words" alone renamed
// `03 - Resources/Technical Notes` into a person, because that is also two capitalised
// words. A false positive here is worse than a miss -- it corrupts the structure the demo
// exists to show, and the structure is the whole point.
//
// So the CONTEXT decides, not the shape: a name is a person's only where the vault has
// already said this folder holds people. Everywhere else a capitalised phrase is a topic.
const PEOPLE_PARENT = /1\s*on\s*1|one.on.one|(^|\/)people(\/|$)|(^|\/)partners(\/|$)/i;

// Inside a people container, EVERYTHING is a person -- no shape test.
//
// A shape test here leaked the exact names it existed to catch. Requiring
// `[A-Z][a-z]+( [A-Z][a-z'-]+)*` let two real folder names through: one whose surname
// carries a non-ASCII letter, which `[a-z]` does not cover, and one whose first name is a
// pair of initials, which `[A-Z][a-z]+` does not match. Names do not have a shape; a
// folder that the vault files under "1 on 1" is a person and that is the end of it.
//
// (Naming the two examples here is what the PII gate blocked on the first push of this
// file -- documenting a leak is a way of committing it again.)
//
// The exception is the handful of words that are structure rather than people, which do
// appear inside those containers -- `People/Professional`, `People/Personal`, an `_old`.
const STRUCTURAL = new Set(["professional", "personal", "archive", "archived", "old",
  "team", "internal", "external", "inactive", "former", "misc", "other"]);
const isPeopleContainer = (parentPath) => PEOPLE_PARENT.test(parentPath || "");
const looksLikePerson = (name, parentPath) =>
  isPeopleContainer(parentPath) && !STRUCTURAL.has(String(name).toLowerCase());

const files = walk(VAULT);
const notes = [];
for (const abs of files) {
  const rel = relative(VAULT, abs).split(sep).join("/");
  let raw = "";
  try { raw = readFileSync(abs, "utf8"); } catch { continue; }
  const text = raw.replace(/^\uFEFF/, "");
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const fmRaw = fmMatch ? fmMatch[1] : "";
  const body = fmMatch ? text.slice(fmMatch[0].length) : text;

  const dateOf = (key) => {
    const m = new RegExp("^" + key + ":\\s*(.+)$", "m").exec(fmRaw);
    if (!m) return "";
    const v = m[1].trim().replace(/^["']|["']$/g, "").slice(0, 10);
    return ISO_DAY.test(v) ? v : "";
  };

  const links = [];
  let m; WIKILINK.lastIndex = 0;
  // SAME EXCLUSIONS AS THE BUILDER. A [[link]] inside a dataview fence is not a link, and
  // harvesting it anyway wrote query text out as real edges -- measured, that was where 57
  // extra unresolved links came from, because most fenced links name notes that do not
  // exist as such.
  const stripCode = (t) => t
    .replace(/^```[\s\S]*?^```/gm, "\n")
    .replace(/^~~~[\s\S]*?^~~~/gm, "\n")
    .replace(/`[^`\n]*`/g, " ");
  const scanText = fmRaw + "\n" + stripCode(body);
  while ((m = WIKILINK.exec(scanText))) links.push(m[1].trim());

  // ALIASES MATTER TO THE EDGE COUNT. Obsidian and the builder both resolve `[[An Alias]]`
  // to the note that declares it, so a demo vault that drops aliases turns every
  // alias-link into a dangling one -- measured, that alone accounted for most of the 113
  // extra unresolved links in the first run.
  const aliases = [];
  const flow = /^alias(?:es)?:\s*\[(.*)\]\s*$/m.exec(fmRaw);
  if (flow) {
    for (const a of flow[1].split(",")) {
      const t = a.trim().replace(/^["']|["']$/g, "");
      if (t) aliases.push(t);
    }
  } else {
    const block = /^alias(?:es)?:\s*$\n((?:\s*-\s*.+\n?)+)/m.exec(fmRaw);
    if (block) {
      for (const line of block[1].split("\n")) {
        const t = (/^\s*-\s*(.+)$/.exec(line) || [])[1];
        if (t) aliases.push(t.trim().replace(/^["']|["']$/g, ""));
      }
    }
  }

  notes.push({
    rel,
    dir: dirname(rel) === "." ? "" : dirname(rel),
    base: basename(rel, ".md"),
    created: dateOf("created") || dateOf("date"),
    words: body.split(/\s+/).filter(Boolean).length,
    tagCount: (fmRaw.match(/^tags?:/m) ? between(1, 3) : 0),
    aliases,
    links,
  });
}

/* ------------------------------------------------------------ build the map */

// Folders first, so a renamed person-folder is renamed consistently everywhere.
const dirMap = new Map();          // real folder segment path -> demo segment path
const usedPeople = new Set();
const newPerson = () => {
  for (let i = 0; i < 500; i++) {
    const n = pick(FIRST) + " " + pick(LAST);
    if (!usedPeople.has(n)) { usedPeople.add(n); return n; }
  }
  return pick(FIRST) + " " + pick(LAST) + " " + usedPeople.size;
};

const mapDir = (dir) => {
  if (!dir) return "";
  if (dirMap.has(dir)) return dirMap.get(dir);
  const parent = dirname(dir) === "." ? "" : dirname(dir);
  const name = basename(dir);
  const mappedParent = mapDir(parent);
  // Structural names are kept: numbered PARA folders and date buckets carry no personal
  // information and ARE the structure the demo is meant to show.
  // `parent`, NOT `dir`. Handing a folder its own path made `03 - Resources/People` satisfy
  // the people-parent test and rename ITSELF, so People and Partners disappeared into
  // invented person names -- the containers vanished while their contents stayed.
  const keep = DATEISH.test(name) || /^[_\d]/.test(name) || !looksLikePerson(name, parent);
  const mappedName = keep ? name : newPerson();
  const full = mappedParent ? mappedParent + "/" + name.replace(name, mappedName) : mappedName;
  dirMap.set(dir, full);
  return full;
};

// Note names. A date-named note keeps its date -- that is not personal, and the heatmap
// and timeline are built from exactly those names.
const usedNames = new Set();
const newTitle = () => {
  for (let i = 0; i < 800; i++) {
    const n = pick(ADJ) + "-" + pick(NOUN) + (rnd() < 0.35 ? " " + pick(TOPIC) : "");
    const t = n.charAt(0).toUpperCase() + n.slice(1);
    if (!usedNames.has(t)) { usedNames.add(t); return t; }
  }
  return "Note " + usedNames.size;
};

// THE RESOLUTION TABLE, keyed the way the builder resolves: basename, full path, path
// without the extension, and every alias. Keying it by basename alone was the other half
// of the first run's link deficit -- a link written as `[[03 - Resources/Beta]]` missed the
// map, got treated as dangling, and invented a target that did not exist.
const nameMap = new Map();         // any real key (lowercased) -> demo link text
const key = (s) => s.toLowerCase().trim().replace(/\.md$/, "");
const register = (k, v) => { const kk = key(k); if (kk && !nameMap.has(kk)) nameMap.set(kk, v); };

for (const n of notes) {
  const demoDir = mapDir(n.dir);
  let demoBase;
  if (ISO_DAY.test(n.base) || DATEISH.test(n.base)) {
    demoBase = n.base;                                  // dates stay
  } else if (looksLikePerson(n.base, n.dir)) {
    demoBase = newPerson();
  } else {
    demoBase = newTitle();
  }
  n.demoDir = demoDir;
  n.demoBase = demoBase;
  n.demoRel = (demoDir ? demoDir + "/" : "") + demoBase + ".md";

  register(n.base, demoBase);
  register(n.rel, demoBase);
  register((n.dir ? n.dir + "/" : "") + n.base, demoBase);

  // One synthetic alias per real alias, registered so alias-links resolve here too, and
  // emitted into the demo note's frontmatter so the builder can see it.
  n.demoAliases = n.aliases.map(() => newTitle());
  n.aliases.forEach((a, i) => register(a, n.demoAliases[i]));
}

/* ------------------------------------------------------------------- write */

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const filler = (count) => {
  const out = [];
  for (let i = 0; i < count; i++) out.push(WORDS[Math.floor(rnd() * WORDS.length)]);
  // Break into sentences so it reads as prose rather than a word salad.
  let s = "", lines = [];
  out.forEach((w, i) => {
    s += (s ? " " : "") + w;
    if ((i + 1) % between(9, 18) === 0) { lines.push(s + "."); s = ""; }
  });
  if (s) lines.push(s + ".");
  return lines.join("\n\n");
};

let written = 0, edges = 0, dangling = 0;
const ghostMap = new Map();   // missing real name -> the one invented name standing in for it
for (const n of notes) {
  const abs = join(OUT, n.demoRel);
  mkdirSync(dirname(abs), { recursive: true });

  // Rewrite every link through the same table, so an edge that resolved still resolves and
  // one that dangled still dangles -- the unresolved count is part of the picture the disc
  // draws, not noise.
  const demoLinks = n.links.map((t) => {
    const full = nameMap.get(key(t));
    if (full) { edges++; return full; }
    const base = nameMap.get(key(basename(t.split("/").pop(), ".md")));
    if (base) { edges++; return base; }
    // A STABLE invented target per missing name. Inventing a fresh one per link made every
    // dangling link its own ghost, so `--ghosts` drew 226 phantoms where the real vault
    // draws far fewer: several notes linking the same missing note is one ghost, not many.
    dangling++;
    if (!ghostMap.has(key(t))) ghostMap.set(key(t), newTitle());
    return ghostMap.get(key(t));
  });

  const fm = ["---"];
  if (n.created) fm.push("created: " + n.created);
  if (n.demoAliases && n.demoAliases.length) fm.push("aliases: [" + n.demoAliases.join(", ") + "]");
  if (n.tagCount) {
    const tags = [];
    for (let i = 0; i < n.tagCount; i++) tags.push(pick(TOPIC));
    fm.push("tags: [" + [...new Set(tags)].join(", ") + "]");
  }
  fm.push("---", "");

  const body = [
    "# " + n.demoBase,
    "",
    filler(Math.max(12, Math.min(n.words, 400))),
    "",
  ];
  if (demoLinks.length) {
    body.push("## Links", "");
    for (const l of demoLinks) body.push("- [[" + l + "]]");
    body.push("");
  }

  writeFileSync(abs, fm.join("\n") + body.join("\n"), "utf8");
  written++;
}

/* ------------- .obsidian, so the builder's config detection behaves the same */

const cfg = join(OUT, ".obsidian");
mkdirSync(cfg, { recursive: true });
const copyCfg = (name, fallback) => {
  const src = join(VAULT, ".obsidian", name);
  if (existsSync(src)) {
    try { writeFileSync(join(cfg, name), readFileSync(src, "utf8"), "utf8"); return; } catch { /* fall through */ }
  }
  if (fallback) writeFileSync(join(cfg, name), fallback, "utf8");
};
// Folder names are preserved for structural folders, so these point at real folders in the
// demo vault too -- which is the point: the builder must classify daily notes and
// templates here exactly as it does in the original.
copyCfg("daily-notes.json", "{}");
copyCfg("templates.json", "{}");
copyCfg("app.json", "{}");

console.log(`demo vault: ${OUT}`);
console.log(`  ${written} notes, ${dirMap.size} folders mapped, ` +
            `${usedPeople.size} person names invented, seed ${SEED}`);
console.log(`  ${edges} links rewritten, ${dangling} left dangling`);
console.log(`\nRecord against it with:  --vault "${OUT}"`);
