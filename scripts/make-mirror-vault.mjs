#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync, utimesSync, realpathSync } from "node:fs";
import { join, relative, sep, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// github#71
import { readSortingSpec } from "../src/sortspec-file.mjs";
// github#176
import { translateSortSpec } from "./mirror-sortspec.mjs";
import { parseFrontmatter, mineLinks } from "../src/note-source.mjs";
import { resolveCreated } from "../src/dates.mjs";
import { canonicalDest, isRelativeDest, resolveAgainst, ghostKey } from "../src/links.mjs";
import { countWords, inferType, normalizeTags, under } from "../src/taxonomy.mjs";
import { mirrorSettings } from "./mirror-settings.mjs";

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
// github#186
const realTarget = (p) => existsSync(p) ? realpathSync(p) : join(realTarget(dirname(p)), basename(p));
const sourceRoot = realTarget(VAULT).toLowerCase(), outputRoot = realTarget(OUT).toLowerCase();
if (outputRoot === sourceRoot || sourceRoot.startsWith(outputRoot + sep) || outputRoot.startsWith(sourceRoot + sep) || dirname(OUT) === OUT) {
  console.error("source and output must be separate, non-nested directories"); process.exit(1);
}

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
  for (const entry of readdirSync(dir).sort()) {
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

const PEOPLE_PARENT = /1\s*on\s*1|one.on.one|(^|\/)people(\/|$)|(^|\/)partners(\/|$)/i;

const STRUCTURAL = new Set(["professional", "personal", "archive", "archived", "old",
  "team", "internal", "external", "inactive", "former", "misc", "other"]);
const isPeopleContainer = (parentPath) => PEOPLE_PARENT.test(parentPath || "");
const looksLikePerson = (name, parentPath) =>
  isPeopleContainer(parentPath) && !STRUCTURAL.has(String(name).toLowerCase());

const files = walk(VAULT);
const readConfig = (rel) => { try { return JSON.parse(readFileSync(join(VAULT, ".obsidian", rel), "utf8")); } catch { return {}; } };
const daily = readConfig("daily-notes.json"), templates = readConfig("templates.json"), templater = readConfig("plugins/templater-obsidian/data.json");
const templateDirs = [templates.folder, templater.templates_folder].filter((p) => typeof p === "string" && p);
const notes = [];
for (const abs of files) {
  const rel = relative(VAULT, abs).split(sep).join("/");
  const raw = readFileSync(abs, "utf8");
  const { fm, body } = parseFrontmatter(raw), st = statSync(abs);
  const tags = normalizeTags(fm);
  const aliases = [].concat(fm.aliases || [], fm.alias || []).map(String);

  notes.push({
    rel,
    dir: dirname(rel) === "." ? "" : dirname(rel),
    base: basename(rel, ".md"),
    created: resolveCreated(fm, basename(rel, ".md"), st.ctimeMs, st.mtimeMs).day,
    mtime: st.mtime,
    words: countWords(body),
    tags,
    type: inferType(fm, rel, tags, daily.folder || "", (p) => templateDirs.some((d) => under(p, d))),
    aliases,
    links: mineLinks(body, fm),
    // github#71 -- a sortspec IS a note; captured here, translated later
    specRaw: readSortingSpec(raw),
  });
}

/* ------------------------------------------------------------ build the map */

const dirMap = new Map();
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
  const keep = DATEISH.test(name) || /^[_\d]/.test(name) || !looksLikePerson(name, parent);
  const mappedName = keep ? name : newPerson();
  const full = mappedParent ? mappedParent + "/" + name.replace(name, mappedName) : mappedName;
  dirMap.set(dir, full);
  return full;
};

const usedNames = new Set();
const newTitle = () => {
  for (let i = 0; i < 800; i++) {
    const n = pick(ADJ) + "-" + pick(NOUN) + (rnd() < 0.35 ? " " + pick(TOPIC) : "");
    const t = n.charAt(0).toUpperCase() + n.slice(1);
    if (!usedNames.has(t)) { usedNames.add(t); return t; }
  }
  return "Note " + usedNames.size;
};

const nameMap = new Map();
const key = (s) => s.toLowerCase().trim().replace(/\.md$/, "");
const register = (k, v) => { const kk = key(k); if (kk && !nameMap.has(kk)) nameMap.set(kk, v); };
const byPath = new Map(), byName = new Map();
for (const n of notes) {
  byPath.set(key(n.rel), n);
  for (const k of [n.base, ...n.aliases]) if (!byName.has(key(k))) byName.set(key(k), n);
}
const labelOrder = new Map([...new Set(notes.map((n) => n.base))]
  .sort((a, b) => a.localeCompare(b)).map((name, i) => [name, i + 1]));
// github#186
const tagMap = new Map();
const tagPaths = new Set();
for (const n of notes) for (const tag of n.tags) {
  const parts = tag.split("/");
  for (let i = 1; i <= parts.length; i++) tagPaths.add(parts.slice(0, i).join("/"));
}
for (const tag of [...tagPaths].sort()) {
  const at = tag.lastIndexOf("/"), parent = at < 0 ? "" : tag.slice(0, at);
  const prefix = tag.slice(at + 1).startsWith("_") ? "_tag" : "tag";
  tagMap.set(tag, (parent ? tagMap.get(parent) + "/" : "") + prefix + String(tagMap.size + 1).padStart(6, "0"));
}

for (const n of notes) {
  const demoDir = mapDir(n.dir);
  let demoBase;
  if (n.specRaw) {
    // github#71, decisions/0015 -- a spec is found by its name, so the name holds
    demoBase = n.base.toLowerCase() === "sortspec" ? n.base : (demoDir.split("/").pop() || n.base);
  } else if (ISO_DAY.test(n.base) || DATEISH.test(n.base)) {
    demoBase = n.base;
  } else {
    demoBase = "Note-" + String(labelOrder.get(n.base)).padStart(8, "0");
  }
  n.demoDir = demoDir;
  n.demoBase = demoBase;
  n.demoRel = (demoDir ? demoDir + "/" : "") + demoBase + ".md";

  register(n.base, demoBase);
  register(n.rel, demoBase);
  register((n.dir ? n.dir + "/" : "") + n.base, demoBase);

  n.demoAliases = n.aliases.map(() => newTitle());
  n.aliases.forEach((a, i) => register(a, n.demoAliases[i]));
}

/* github#71, decisions/0015 -- the spec is TRANSLATED, never copied */

const specNotes = notes.filter((n) => n.specRaw);
let specDropped = 0;

if (specNotes.length) {
  /** @type {Map<string, string | null>} github#71 -- real folder path -> the mirror's */
  const mapPath = (p) => {
    const clean = String(p).split(/[\\/]/).filter(Boolean).join("/");
    if (!clean) return "";
    return dirMap.has(clean) ? dirMap.get(clean) : null;
  };

  for (const n of specNotes) {
    const { text, dropped } = translateSortSpec(n.specRaw, n.dir, mapPath, nameMap);
    n.specText = text;
    specDropped += dropped;
  }
}

/* ------------------------------------------------------------------- write */

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const filler = (count) => {
  const out = [];
  for (let i = 0; i < count; i++) out.push(WORDS[Math.floor(rnd() * WORDS.length)]);
  let s = "", lines = [];
  out.forEach((w, i) => {
    s += (s ? " " : "") + w;
    if ((i + 1) % between(9, 18) === 0) { lines.push(s + "."); s = ""; }
  });
  if (s) lines.push(s + ".");
  return lines.join("\n\n");
};

let written = 0, edges = 0, dangling = 0;
const ghostMap = new Map();
for (const n of notes) {
  const abs = join(OUT, n.demoRel);
  mkdirSync(dirname(abs), { recursive: true });

  const demoLinks = n.links.map((t) => {
    const hit = byPath.get(key(resolveAgainst(n.rel, t))) || (!isRelativeDest(t) &&
      (byPath.get(key(canonicalDest(n.rel, t))) || byName.get(key(t))));
    if (hit) { edges++; return hit.demoRel.slice(0, -3); }
    dangling++;
    const k = ghostKey(canonicalDest(n.rel, t));
    if (!ghostMap.has(k)) ghostMap.set(k, "Missing-" + String(ghostMap.size + 1).padStart(6, "0"));
    return ghostMap.get(k);
  });

  const fm = ["---"];
  // github#71 -- the spec is this note's front matter
  if (n.specText) {
    fm.push("sorting-spec: |-");
    for (const line of n.specText.split("\n")) fm.push(line ? "  " + line : "");
  }
  if (n.created) fm.push("created: " + n.created);
  if (inferType({ type: n.type }, n.rel, [], "", () => false) === n.type) {
    fm.push("type: " + JSON.stringify(n.type));
  }
  for (const [key, values] of [["aliases", n.demoAliases], ["tags", n.tags.map((t) => tagMap.get(t))],
    ["links", demoLinks.map((l) => "[[" + encodeURI(l).replace(/#/g, "%23") + "]]")]]) {
    if (values.length) fm.push(key + ":", ...values.map((v) => "  - " + JSON.stringify(v)));
  }
  fm.push("---", "");
  writeFileSync(abs, fm.join("\n") + filler(n.words) + "\n", "utf8");
  utimesSync(abs, n.mtime, n.mtime);
  written++;
}

/* ------------- .obsidian, so the builder's config detection behaves the same */

const cfg = join(OUT, ".obsidian");
mkdirSync(cfg, { recursive: true });
const writeCfg = (name, data) => {
  const dest = join(cfg, name);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(data, null, 2) + "\n");
};
for (const [file, data, key] of [["daily-notes.json", daily, "folder"], ["templates.json", templates, "folder"],
  ["plugins/templater-obsidian/data.json", templater, "templates_folder"]]) {
  writeCfg(file, typeof data[key] === "string" && data[key] ? { [key]: mapDir(data[key]) } : {});
}
writeCfg("app.json", {});
// github#186
const specialGroups = new Set(["(vault root)", "(unlinked)", "(unresolved)", "(untagged)"]);
const settings = mirrorSettings(readConfig("plugins/vault-graph/data.json"),
  (p) => specialGroups.has(p) ? p : dirMap.get(p),
  (p) => specialGroups.has(p) ? p : tagMap.get(p),
  (p) => typeof p === "string" ? byPath.get(key(p))?.demoRel : null);
writeCfg("plugins/vault-graph/data.json", settings);
writeFileSync(join(OUT, ".vault-graph-mirror.json"), JSON.stringify({ version: 1, settings }, null, 2) + "\n");
// github#71, decisions/0015 -- rewritten to point at the MIRRORED note
const cfgSpec = (() => {
  try {
    const cs = JSON.parse(readFileSync(join(VAULT, ".obsidian", "plugins", "custom-sort", "data.json"), "utf8"));
    const want = String(cs.additionalSortspecFile || "").split(/[\\/]/).filter(Boolean).join("/");
    if (!want) return null;
    const hit = specNotes.find((n) => n.rel === want);
    return hit ? hit.demoRel : null;
  } catch { return null; }   // github#71 -- the plugin is not installed in the source vault
})();
if (cfgSpec) {
  mkdirSync(join(cfg, "plugins", "custom-sort"), { recursive: true });
  writeFileSync(join(cfg, "plugins", "custom-sort", "data.json"),
    JSON.stringify({ additionalSortspecFile: cfgSpec, suspended: false }, null, 2) + "\n", "utf8");
}

console.log(`mirror vault: ${OUT}`);
console.log(`  ${written} notes, ${dirMap.size} folders mapped, ` +
            `${usedPeople.size} person names invented, seed ${SEED}`);
console.log(`  ${edges} links rewritten, ${dangling} left dangling`);
if (specNotes.length) {
  console.log(`  sortspec: ${specNotes.length} note(s) translated in place -> ` +
              specNotes.map((n) => n.demoRel).join(", ") +
              `, ${specDropped} line(s) dropped as unmappable or prose` +
              (cfgSpec ? `; registered via .obsidian/plugins/custom-sort` : ""));
} else {
  console.log("  sortspec: none in the source vault -- the mirror carries none either");
}
console.log(`\nRecord against it with:  --vault "${OUT}"`);
