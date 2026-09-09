#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, relative, sep, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// github#71
import { readSortingSpec } from "../src/sortspec-file.mjs";

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

const PEOPLE_PARENT = /1\s*on\s*1|one.on.one|(^|\/)people(\/|$)|(^|\/)partners(\/|$)/i;

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
  const stripCode = (t) => t
    .replace(/^```[\s\S]*?^```/gm, "\n")
    .replace(/^~~~[\s\S]*?^~~~/gm, "\n")
    .replace(/`[^`\n]*`/g, " ");
  const scanText = fmRaw + "\n" + stripCode(body);
  while ((m = WIKILINK.exec(scanText))) links.push(m[1].trim());

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

for (const n of notes) {
  const demoDir = mapDir(n.dir);
  let demoBase;
  if (ISO_DAY.test(n.base) || DATEISH.test(n.base)) {
    demoBase = n.base;
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

  n.demoAliases = n.aliases.map(() => newTitle());
  n.aliases.forEach((a, i) => register(a, n.demoAliases[i]));
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
    const full = nameMap.get(key(t));
    if (full) { edges++; return full; }
    const base = nameMap.get(key(basename(t.split("/").pop(), ".md")));
    if (base) { edges++; return base; }
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


/* ------------------------------------------------------ sortspec (github#71) --
 * The mirror exists to check the real vault's SHAPE without its content, and since
 * github#71 a vault's shape includes the order its file explorer is in. Without this the
 * mirror could not exercise the one feature the source vault leans on hardest, which makes
 * it the wrong tool for exactly the check it exists for.
 *
 * The spec is TRANSLATED, never copied. Every `target-folder:` path and every pinned name
 * goes through the same dirMap and nameMap the notes did, so the mirror carries the spec's
 * STRUCTURE -- its pins, its order- lines, its precedence, its depth -- and none of its real
 * names. That is not tidiness: a person folder under a 1-on-1 tree IS a real person, and
 * copying the spec verbatim would put every one of them into a vault whose entire purpose is
 * that it holds none. Comments go too, for the same reason -- they are prose someone wrote.
 *
 * A line naming something that is not in the mirror is dropped rather than passed through.
 * The page treats an unresolvable pin as ordinary wear and would carry on, but a mirror that
 * silently kept real names for the folders it failed to map would be leaking exactly what it
 * cannot leak.
 */

const specOut = (() => {
  const sources = [];
  const seen = new Set();
  const addSource = (abs) => {
    const key = resolve(abs);
    if (seen.has(key) || !existsSync(abs)) return;
    seen.add(key);
    let raw; try { raw = readFileSync(abs, "utf8"); } catch { return; }
    const text = readSortingSpec(raw);
    if (!text.trim()) return;
    const rel = relative(VAULT, abs).split(sep).join("/");
    sources.push({ rel, dir: rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "", text });
  };

  for (const n of notes) {
    const parent = n.dir.includes("/") ? n.dir.slice(n.dir.lastIndexOf("/") + 1) : n.dir;
    if (n.base.toLowerCase() === "sortspec" || (parent && n.base === parent)) {
      addSource(join(VAULT, n.rel.split("/").join(sep)));
    }
  }
  let cfgExtra = "";
  try {
    const cs = JSON.parse(readFileSync(join(VAULT, ".obsidian", "plugins", "custom-sort", "data.json"), "utf8"));
    if (typeof cs.additionalSortspecFile === "string" && cs.additionalSortspecFile.trim()) {
      cfgExtra = cs.additionalSortspecFile.split(/[\\/]/).filter(Boolean).join("/");
      addSource(join(VAULT, cfgExtra.split("/").join(sep)));
    }
  } catch { /* the plugin is not installed in the source vault */ }

  if (!sources.length) return null;

  /** a real folder path -> the mirror's, or null when it is not in the mirror */
  const mapPath = (p) => {
    const clean = String(p).split(/[\\/]/).filter(Boolean).join("/");
    if (!clean) return "";
    return dirMap.has(clean) ? dirMap.get(clean) : null;
  };

  let dropped = 0;
  const translate = (src) => {
    const out = [];
    let target = src.dir;          // the real path the current section aims at
    for (const raw of src.text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) { out.push(""); continue; }
      if (line.startsWith("//")) { dropped++; continue; }
      const tf = /^target-folder\s*:\s*(.*)$/.exec(line);
      if (tf) {
        const v = tf[1].trim();
        if (v === "/" || v === "/*") { target = ""; out.push(line); continue; }
        const wild = /\/\*$/.test(v);
        const bare = wild ? v.slice(0, -2) : v;
        const mapped = bare === "." ? mapPath(src.dir) : mapPath(bare);
        if (mapped === null) { target = null; dropped++; continue; }
        target = bare === "." ? src.dir : bare.split(/[\\/]/).filter(Boolean).join("/");
        out.push("target-folder: " + (mapped || "/") + (wild ? "/*" : ""));
        continue;
      }
      if (target === null) { dropped++; continue; }   // inside a section we could not map
      if (/^order-(asc|desc)\s*:/.test(line)) { out.push(line); continue; }
      // a bare line is a pin: a folder inside the target, or a note in it
      const asFolder = mapPath((target ? target + "/" : "") + line.replace(/\.md$/, ""));
      if (asFolder) { out.push(asFolder.split("/").pop()); continue; }
      const asNote = nameMap.get(key(line));
      if (asNote) { out.push(asNote + (/\.md$/i.test(line) ? ".md" : "")); continue; }
      dropped++;
    }
    while (out.length && !out[out.length - 1].trim()) out.pop();
    return out.join("\n");
  };

  const first = sources[0];
  const body = sources.map(translate).filter((t) => t.trim()).join("\n\n");
  if (!body.trim()) return null;

  const destDir = mapPath(first.dir) || "";
  const destRel = (destDir ? destDir + "/" : "") + "sortspec.md";
  const destAbs = join(OUT, destRel.split("/").join(sep));
  mkdirSync(dirname(destAbs), { recursive: true });
  writeFileSync(destAbs,
    "---\nsorting-spec: |-\n" + body.split("\n").map((l) => (l ? "  " + l : "")).join("\n") +
    "\n---\n\n# sortspec\n\nTranslated from the source vault by make-mirror-vault.mjs " +
    "(github#71): the same structure, none of the names.\n", "utf8");
  return { destRel, sources: sources.length, dropped, viaConfig: !!cfgExtra };
})();

/* ------------- .obsidian, so the builder's config detection behaves the same */

const cfg = join(OUT, ".obsidian");
mkdirSync(cfg, { recursive: true });
const copyCfg = (name, fallback) => {
  const src = join(VAULT, ".obsidian", name);
  if (existsSync(src)) {
    try { writeFileSync(join(cfg, name), readFileSync(src, "utf8"), "utf8"); return; } catch { }
  }
  if (fallback) writeFileSync(join(cfg, name), fallback, "utf8");
};
copyCfg("daily-notes.json", "{}");
copyCfg("templates.json", "{}");
copyCfg("app.json", "{}");
// github#71 -- the plugin's own config, rewritten to point at the translated spec, so the
// mirror's builder finds it exactly the way the source vault's does.
if (specOut && specOut.viaConfig) {
  mkdirSync(join(cfg, "plugins", "custom-sort"), { recursive: true });
  writeFileSync(join(cfg, "plugins", "custom-sort", "data.json"),
    JSON.stringify({ additionalSortspecFile: specOut.destRel, suspended: false }, null, 2) + "\n", "utf8");
}

console.log(`demo vault: ${OUT}`);
console.log(`  ${written} notes, ${dirMap.size} folders mapped, ` +
            `${usedPeople.size} person names invented, seed ${SEED}`);
console.log(`  ${edges} links rewritten, ${dangling} left dangling`);
if (specOut) {
  console.log(`  sortspec: ${specOut.sources} source(s) translated -> ${specOut.destRel}` +
              `, ${specOut.dropped} line(s) dropped as unmappable or prose`);
} else {
  console.log("  sortspec: none in the source vault -- the mirror carries none either");
}
console.log(`\nRecord against it with:  --vault "${OUT}"`);
