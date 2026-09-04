#!/usr/bin/env node
/**
 * build-graph.mjs -- turn this Obsidian vault into ONE self-contained HTML page.
 *
 * Walks every .md file, resolves [[wikilinks]] (body + frontmatter), derives four
 * grouping dimensions, and inlines the data, our own engine (bundled here with esbuild,
 * github#58) and the Sigma bundle into vault-graph.html. No server, no network, no build
 * step at view time.
 *
 * Usage:  node "03 - Resources/Vault Graph/build-graph.mjs"
 *          [--ghosts] [--templates] [--flat-months] [--no-nav] [--dev] [--out FILE]
 *          [--renderer sigma|own]   (transitional, github#58: which renderer draws the page)
 *
 * Vault-agnostic: it crawls every folder and reads which folders are templates
 * and daily notes from the vault's own .obsidian config, so no folder name or
 * numbering is baked in.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, basename, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
// THE ONE DEPENDENCY THIS SCRIPT HAS, and it used to have none. The engine -- the graph store,
// and the renderer as github#58 lands it -- is TypeScript under src/engine, and a .ts file
// cannot be pasted into a <script> the way page.js is. esbuild bundles it here, on demand,
// into one IIFE; the same tool the plugin build has always used, already installed, no network
// at build time. The alternative was a committed dist/engine.js, which is guaranteed to drift
// from its source (.ai-context/decisions/0012-*.md).
import { buildSync } from "esbuild";
// Sigma is read through this rather than straight off disk: it strips Sigma's two
// unreachable fetch() calls, so the generated page makes no network requests at all. Same
// module the plugin build uses -- see src/vendor.mjs. github#1
import { readVendorSource } from "./vendor.mjs";
// When a note was written -- the one rule, shared with plugin/main.js so the two
// mounts cannot drift. See src/dates.mjs for the order and why. github#6
import { localDay, resolveCreated, dateTally } from "./dates.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Repo root. Everything this script reads that is not source lives beside src/,
// not inside it: vendor/ for the inlined libraries, assets/ for the logo and
// favicon. Derived from HERE so the layout is declared in one place.
const ROOT = resolvePath(HERE, "..");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes("--" + n);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };

// ASK OBSIDIAN WHERE ITS VAULTS ARE.
//
// Obsidian keeps a registry of every vault it knows, with absolute paths and which one
// is open. Reading it is how this stays machine-independent: the same vault lives on a
// different drive, path and user profile on each machine, so any hardcoded default is
// wrong on at least one of them. Same rule as the rest of the script -- read the answer
// from Obsidian's own config rather than assuming a layout.
const obsidianVaults = () => {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    process.env.APPDATA && join(process.env.APPDATA, "obsidian", "obsidian.json"),
    join(home, "Library", "Application Support", "obsidian", "obsidian.json"),  // macOS
    join(home, ".config", "obsidian", "obsidian.json"),                          // Linux
  ].filter(Boolean);
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const reg = JSON.parse(readFileSync(p, "utf8"));
      return Object.values(reg.vaults || {})
        .filter((v) => v && v.path && existsSync(join(v.path, ".obsidian")))
        .map((v) => ({ path: resolvePath(v.path), open: !!v.open, ts: v.ts || 0 }));
    } catch { /* a malformed registry is not fatal -- fall through to the walk-up */ }
  }
  return [];
};

// WHICH VAULT, in order:
//   1. --vault <path>            explicit wins, always
//   2. VAULT_GRAPH_VAULT         this tool's own override
//   3. OBSIDIAN_VAULT            the machine's general "where is my vault" variable
//   4. --vault-name <name>       pick from Obsidian's registry by folder name
//   5. Obsidian's registry       the only entry, or the one currently open
//   6. walk up for .obsidian     so dropping this folder inside a vault still works
//
// The script only ever walked up (6), which was right while it lived inside the vault
// and threw the moment the source moved out to its own repo on 2026-08-22. A hardcoded
// default replaced it briefly and was wrong for the same reason a hardcoded anything is
// here: the vault is at a different absolute path on each of the two machines.
//
// Both env vars are honoured, tool-specific first: OBSIDIAN_VAULT is the machine-wide
// answer other tooling can share, VAULT_GRAPH_VAULT overrides it for this tool alone
// (pointing the graph at a second vault without disturbing anything else).
const VAULT = (() => {
  const check = (v, why) => {
    const p = resolvePath(v);
    if (!existsSync(join(p, ".obsidian"))) {
      throw new Error("no .obsidian in " + p + " (" + why + ") -- must be the vault ROOT");
    }
    return p;
  };

  const explicit = opt("vault", process.env.VAULT_GRAPH_VAULT || process.env.OBSIDIAN_VAULT);
  if (explicit) {
    const why = argv.includes("--vault") ? "--vault"
              : process.env.VAULT_GRAPH_VAULT ? "VAULT_GRAPH_VAULT"
              : "OBSIDIAN_VAULT";
    return check(explicit, why);
  }

  const known = obsidianVaults();
  const wanted = opt("vault-name");
  if (wanted) {
    const hit = known.filter((v) => basename(v.path).toLowerCase() === wanted.toLowerCase());
    if (hit.length === 1) return hit[0].path;
    throw new Error(
      "--vault-name " + wanted + (hit.length ? " is ambiguous" : " matched nothing") +
      ". Obsidian knows: " + (known.map((v) => v.path).join(", ") || "(none)")
    );
  }
  if (known.length === 1) return known[0].path;
  if (known.length > 1) {
    const open = known.filter((v) => v.open);
    if (open.length === 1) return open[0].path;
    throw new Error(
      "Obsidian knows " + known.length + " vaults and none is unambiguously open: " +
      known.map((v) => v.path).join(", ") +
      " -- pass --vault <path> or --vault-name <folder name>"
    );
  }

  let d = HERE;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, ".obsidian"))) return d;
    const up = resolvePath(d, "..");
    if (up === d) break;
    d = up;
  }
  throw new Error(
    "no vault given, none registered with Obsidian, and no .obsidian found above " + HERE +
    " -- pass --vault <path> or set VAULT_GRAPH_VAULT"
  );
})();

const INCLUDE_GHOSTS = flag("ghosts");        // unresolved [[links]] as phantom nodes
// A DEVELOPMENT BUILD: turns the wedge overlay (wedge edges, band radii, envelope centres)
// on by default. It is off in every normal build, and `?nowedges` turns it off in a dev one --
// the flag decides the DEFAULT, not the availability, so a shipped page can still be asked
// for it with `?wedges` when a reported animation bug needs looking at.
const DEV_BUILD = flag("dev");
const INCLUDE_TEMPLATES = flag("templates");
// Default output goes NEXT TO THE VAULT'S copy, not next to the source: the HTML is what
// has to travel to the other devices, and the vault is what syncs.
const OUT = opt("out", join(VAULT, "03 - Resources", "Vault Graph", "vault-graph.html"));
// Month buckets (04 - Daily Notes/2026-08) are real subfolders and shown as such.
// Pass --flat-months to fold them into their parent instead.
const FLAT_MONTHS = flag("flat-months");
// The daily-note prev/next line IS a real link and counts by default. It was
// stripped originally because chaining 55 dailies into a spine dominated the old
// force layout -- that layout is gone, and measured on this vault counting the
// chain leaves the deepest core untouched (8-core, 33 notes) while removing the
// two phantom "orphans" it created. Pass --no-nav to strip it again.
const STRIP_NAV = flag("no-nav");

/* ---------------------------------------------------------------- discovery */

// Read a vault config file, tolerating absence -- every vault differs in which
// core plugins and community plugins it has ever configured.
const readJson = (rel) => {
  try { return JSON.parse(readFileSync(join(VAULT, rel), "utf8")); } catch { return null; }
};
const norm = (s) => String(s).split(/[\\/]/).filter(Boolean).join("/");

// Folders THIS vault declares, rather than folder names we assume. Hardcoding
// "05 - Templates" broke the moment the vault was renumbered.   path-check: ok
// It would never have matched anybody else's vault either -- Obsidian records the answer.
const TEMPLATE_DIRS = (() => {
  const out = new Set();
  const core = readJson(".obsidian/templates.json");
  if (core && typeof core.folder === "string" && core.folder.trim()) out.add(norm(core.folder));
  const templater = readJson(".obsidian/plugins/templater-obsidian/data.json");
  if (templater && typeof templater.templates_folder === "string" && templater.templates_folder.trim()) {
    out.add(norm(templater.templates_folder));
  }
  return [...out];
})();

// The daily-notes folder, so a daily note can be typed without guessing at a
// folder number. Same idea: the vault tells us.
const DAILY_DIR = (() => {
  const dn = readJson(".obsidian/daily-notes.json");
  return dn && typeof dn.folder === "string" && dn.folder.trim() ? norm(dn.folder) : "";
})();

// Infrastructure only. Dot-folders are skipped by the crawl itself, so this is
// just the one directory that is never notes. Everything else in the vault --
// archives, attachments folders, whatever a given vault happens to call things
// -- is crawled, because the whole point is to graph the whole vault.
const SKIP_DIRS = new Set(["node_modules"]);

// Agent/tooling config that lives in the vault but is not a note. The graph's
// own doc is NOT here: it is a real note ("Vault Graph.md"), linked from the
// daily note, so it belongs in the graph like any other.
const SKIP_FILES = new Set(["claude.md", "readme.md", "license.md"]);

const under = (rel, dir) => dir && (rel === dir || rel.startsWith(dir + "/"));
const isTemplate = (rel) => TEMPLATE_DIRS.some((d) => under(rel, d));

function walk(dir, acc = []) {
  // SORTED, not whatever order the filesystem hands back. readdirSync's order is not
  // part of any contract -- Node documents it as filesystem-dependent -- and this walk's
  // order becomes `notes`' order (the loop below reads `files` in the order `walk`
  // returns it, no sort after), which becomes graph node insertion order, which becomes
  // the group iteration order `balanceBands()` searches over (github#32). That search
  // is exhaustive-with-ties: candidates of equal cost keep whichever the loop reached
  // first, so a tie that used to break on unspecified disk order could pick a different
  // inner/outer split for the SAME vault content from one build to the next -- see
  // .ai-context/invariants.md.
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

/* ------------------------------------------------------------- frontmatter */

// Minimal YAML: `k: v`, `k: [a, b]`, and `k:` + `- item` blocks. Enough for a vault.
function parseFrontmatter(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  const lines = m[1].split(/\r?\n/);
  let key = null;
  for (const line of lines) {
    const li = /^\s*-\s+(.*)$/.exec(line);
    if (li && key) {
      (Array.isArray(fm[key]) ? fm[key] : (fm[key] = [])).push(unquote(li[1]));
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1];
    const v = kv[2].trim();
    if (v === "") { fm[key] = []; continue; }
    if (v.startsWith("[") && v.endsWith("]")) {
      fm[key] = v.slice(1, -1).split(",").map(unquote).filter(Boolean);
    } else {
      fm[key] = unquote(v);
    }
  }
  return { fm, body: text.slice(m[0].length) };
}
const unquote = (s) => String(s).trim().replace(/^["']|["']$/g, "").trim();

/* -------------------------------------------------------------- link mining */

// Fenced code (dataview/dataviewjs) and inline code hold no real links.
const stripCode = (s) =>
  s.replace(/^```[\s\S]*?^```/gm, "\n")
   .replace(/^~~~[\s\S]*?^~~~/gm, "\n")
   .replace(/`[^`\n]*`/g, " ");

// Daily-note nav scaffolding: `[[2026-08-20]] <- | -> [[2026-08-22]]`.
const NAV_LINE = new RegExp(
  "^\\s*!?\\[\\[[^\\]]+\\]\\]\\s*(?:\\u2190|<-|<)\\s*\\|\\s*(?:\\u2192|->|>)\\s*!?\\[\\[[^\\]]+\\]\\]\\s*$",
  "gm"
);
const stripDailyNav = (s) => (STRIP_NAV ? s.replace(NAV_LINE, "") : s);

const WIKILINK = /!?\[\[([^[\]|#^]+)(?:[#^][^[\]|]*)?(?:\|[^[\]]*)?\]\]/g;
const MDLINK = /\[[^\]]*\]\(([^)\s]+\.md)(?:\s[^)]*)?\)/g;

function mineLinks(body, fm) {
  const out = [];
  const push = (t) => { t = t.trim(); if (t) out.push(t); };
  const scan = (text, re) => {
    let m; re.lastIndex = 0;
    while ((m = re.exec(text))) {
      try { push(decodeURIComponent(m[1])); } catch { push(m[1]); }
    }
  };

  const clean = stripDailyNav(stripCode(body));
  scan(clean, WIKILINK);
  scan(clean, MDLINK);

  // Frontmatter links are real links in Obsidian: `person: "[[Ada Lovelace]]"`.
  for (const v of Object.values(fm)) {
    for (const s of (Array.isArray(v) ? v : [v])) {
      if (typeof s === "string" && s.includes("[[")) scan(s, WIKILINK);
    }
  }
  return out;
}

/* ------------------------------------------------------------ note taxonomy */

// Date-bucket folders: "2026", "2026-08", "2026-Q3", "2026-W34". They say when a
// note was filed, not what it is, so neither the type nor the subfolder tint
// should come from them. Quarters and ISO weeks are here because vaults bucket by
// them too -- this vault's weekly reviews sit in "2026-Q3".
const MONTHISH = /^\d{4}(?:[-_ ]?(?:\d{2}|Q[1-4]|W\d{1,2}))?$/i;

const TYPE_ALIAS = {
  people: "person", person: "person",
  "zettel/permanent": "zettel", "zettel/fleeting": "zettel", "zettel/literature": "zettel",
};

// Type comes from the note itself where it can, and otherwise from the folder
// that holds it -- whatever that folder is called. The old version mapped
// hardcoded numeric prefixes ("06" -> daily, "09" -> meeting), which silently
// mistyped every note the day the vault was renumbered and meant nothing in any
// other vault.
const deNumber = (s) => String(s).replace(/^[\s\d._)-]+/, "").trim();
const slug = (s) => deNumber(s).toLowerCase().replace(/[\s_]+/g, "-");
const singular = (s) => s.replace(/ies$/, "y").replace(/([^aeious])s$/, "$1");

function inferType(fm, relPath, tags) {
  const raw = typeof fm.type === "string" ? fm.type.toLowerCase() : "";
  if (raw) return TYPE_ALIAS[raw] ?? raw;
  if (tags.includes("daily-note")) return "daily";

  const rel = relPath.split(sep).join("/");
  if (under(rel, DAILY_DIR)) return "daily";
  if (isTemplate(rel)) return "template";

  // The deepest folder that actually names something: date buckets like
  // "2026-08" describe when, not what, so they are skipped.
  const dirs = relPath.split(sep).slice(0, -1).filter(Boolean);
  const named = dirs.filter((d) => !MONTHISH.test(d));
  const pick = named.length ? named[named.length - 1] : dirs[0];
  const type = pick ? singular(slug(pick)) : "";
  return type || "note";
}

const paraFolder = (relPath) => {
  const seg = relPath.split(sep);
  return seg.length > 1 ? seg[0] : "(vault root)";
};

// Subfolder path inside the PARA folder, used to tint nodes and to cut sub-wedges.
//
// TWO levels deep, because one was not enough for this vault: it read only the
// immediate child, so `08 - Meeting Notes/00 1 on 1/<person>` collapsed 62 notes into
// a single "00 1 on 1" wedge and hid *who* the 1-on-1s are with, and
// `03 - Resources/People/{Professional,Personal}` collapsed 81 the same way. Measured,
// 136 notes sat in meaningfully-named second-level folders that the graph was
// flattening.
//
// Date buckets stop the walk, on the same reasoning inferType already uses: a folder
// called "2026-06" says WHEN a note was filed, not what it is. As the FIRST level it
// is still the only division its folder has -- that is what Daily Notes are -- so it
// is kept; deeper down it sits under a real name and is noise, so
// `03 Sprint Reviews/2026-06` stays "03 Sprint Reviews".
// The WHOLE folder chain below the PARA folder, however deep it happens to go. No
// level count is baked in anywhere: the page builds its legend tree by recursing over
// this array, so a folder nested five deep works the same as one nested one deep, on
// any vault.
//
// The one rule applied is the date-bucket rule inferType already uses: a folder called
// `2026-06` says WHEN a note was filed, not what it is. As the FIRST segment it is
// still the only division its folder has -- that is what Daily Notes are -- so it is
// kept; anywhere deeper it sits under a real name and is noise, so
// `03 Sprint Reviews/2026-06` stops at `03 Sprint Reviews`.
const paraDirs = (relPath) => {
  const seg = relPath.split(sep).slice(1, -1);   // drop the PARA folder and the filename
  const out = [];
  for (let i = 0; i < seg.length; i++) {
    if (MONTHISH.test(seg[i])) {
      if (i === 0 && !FLAT_MONTHS) out.push(seg[i]);
      break;
    }
    out.push(seg[i]);
  }
  return out;
};

// How every note got dated, for the summary line. See src/dates.mjs.
const dates = dateTally();

/* ------------------------------------------------------------------- build */

const files = walk(VAULT).filter((abs) => {
  if (INCLUDE_TEMPLATES) return true;
  return !isTemplate(relative(VAULT, abs).split(sep).join("/"));
});
const notes = [];
const byKey = new Map();   // lowercased basename / alias / relpath -> note index

for (const abs of files) {
  const relPath = relative(VAULT, abs);
  const raw = readFileSync(abs, "utf8");
  const { fm, body } = parseFrontmatter(raw);
  const name = basename(abs, ".md");
  // ONE stat call, feeding both dates below. It used to be made inside `touched` alone;
  // `created` needs the creation stamp now, and statting the same file twice per note is
  // the kind of thing that only shows up on somebody else's 10,000-note vault.
  let st = null; try { st = statSync(abs); } catch { st = null; }
  const dated = resolveCreated(fm, name, st && st.ctimeMs, st && st.mtimeMs);
  dates[dated.source]++;

  const tags = []
    .concat(fm.tags ?? [], fm.tag ?? [])
    .flatMap((t) => String(t).split(/[,\s]+/))
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);

  const note = {
    id: relPath.split(sep).join("/"),
    label: name,
    folder: paraFolder(relPath),
    // `dirs` is the full chain; `sub` is just its first segment, kept because that is
    // the level that owns a wedge and a tint. That is a RENDERING limit (the tint
    // ladder has four usable steps, and a wedge is one folder on the disc), not an
    // assumption about how deep vaults nest -- everything below it lives in `dirs`.
    dirs: paraDirs(relPath),
    sub: paraDirs(relPath)[0] || "",
    type: inferType(fm, relPath, tags),
    tags,
    // Frontmatter, then a date at the front of the filename, then the file's own
    // creation stamp -- see src/dates.mjs. It was frontmatter or nothing until
    // github#6, which left a vault that does not write `created:` with an empty
    // heatmap and everything piled into "undated".
    created: dated.day,
    // When the FILE was last written, which is not the same question as `created`
    // and is the one "mark today" actually wants to answer. Frontmatter `created`
    // on a daily note is its IMPORT stamp -- this vault pre-creates dailies from
    // the calendar, so 2026-08-21's note carries created: 2026-08-17 -- and
    // `created` wins over `date`, so "created today" matched 0 notes on a day when
    // nothing new was imported, and the button looked broken. Measured here: 3
    // files touched today against 0 created today.
    touched: st ? localDay(st.mtimeMs) : "",
    words: body.split(/\s+/).filter(Boolean).length,
    _links: mineLinks(body, fm),
  };
  const idx = notes.push(note) - 1;

  const keys = [name, note.id, note.id.replace(/\.md$/, "")]
    .concat(fm.aliases ?? [], fm.alias ?? []);
  for (const k of keys) {
    const kk = String(k).toLowerCase().trim();
    if (kk && !byKey.has(kk)) byKey.set(kk, idx);
  }
}

// Resolve links. Obsidian resolves by shortest unique path, so try full path then basename.
const edgeWeight = new Map();
const ghosts = new Map();
let unresolved = 0;

const resolve = (target) => {
  const t = target.toLowerCase().trim().replace(/\.md$/, "");
  if (byKey.has(t)) return byKey.get(t);
  const base = t.split("/").pop();
  return byKey.has(base) ? byKey.get(base) : -1;
};

const addEdge = (i, j) => {
  if (i === j) return;
  const key = i < j ? `${i} ${j}` : `${j} ${i}`;
  edgeWeight.set(key, (edgeWeight.get(key) ?? 0) + 1);
};

for (let i = 0; i < notes.length; i++) {
  for (const target of notes[i]._links) {
    const j = resolve(target);
    if (j < 0) {
      unresolved++;
      if (INCLUDE_GHOSTS) {
        const key = target.split("/").pop();
        if (!ghosts.has(key)) ghosts.set(key, []);
        ghosts.get(key).push(i);
      }
      continue;
    }
    addEdge(i, j);
  }
}

if (INCLUDE_GHOSTS) {
  for (const [name, sources] of ghosts) {
    const g = {
      id: `ghost:${name}`, label: name, folder: "(unresolved)", sub: "", type: "ghost",
      tags: [], created: "", words: 0, ghost: true,
    };
    const j = notes.push(g) - 1;
    for (const i of sources) addEdge(i, j);
  }
}

const edges = [...edgeWeight].map(([k, w]) => {
  const [a, b] = k.split(" ").map(Number);
  return { s: a, t: b, w };
});

const degree = new Array(notes.length).fill(0);
for (const e of edges) { degree[e.s]++; degree[e.t]++; }

const nodes = notes.map((n, i) => {
  const { _links, ...rest } = n;
  return { ...rest, deg: degree[i] };
});

const data = {
  vault: basename(VAULT),
  // Local time, not UTC: the page footer is how you tell which build you are
  // looking at, and a UTC stamp read two hours behind the wall clock here.
  generated: (() => {
    const d = new Date(), p2 = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
           `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  })(),
  nodes,
  edges,
  stats: {
    files: files.length,
    nodes: nodes.length,
    edges: edges.length,
    unresolved,
    orphans: degree.filter((d) => d === 0).length,
    // Where every note's date came from. Carried into the page (and the plugin's
    // diagnostics command) so "why is everything undated" is a question the build
    // already answered. github#6
    dates,
    templatesExcluded: !INCLUDE_TEMPLATES,
    ghostsIncluded: INCLUDE_GHOSTS,
  },
  dev: DEV_BUILD,
};

/* ------------------------------------------------------------------ emit */

// THE ENGINE, BUNDLED ON DEMAND. src/engine/index.ts and everything it imports become one
// classic script that sets `window.VaultGraphEngine`; shell.html reads the constructors off
// it, the same way it read graphology's and Sigma's UMD globals. Unminified, like the plugin
// bundle: the shipped file is read by people. `write: false` keeps it in memory -- there is
// no dist/ to drift. esbuild's output is deterministic for a fixed input, so
// check-build-order-determinism still holds byte-for-byte.
const engine = buildSync({
  entryPoints: [join(ROOT, "src", "engine", "index.ts")],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "VaultGraphEngine",
  platform: "browser",
  target: "es2020",
  minify: false,
  logLevel: "silent",
}).outputFiles[0].text;

// The output REDISTRIBUTES Sigma, so it carries Sigma's notice. The minified build had its
// own header stripped upstream, so the notice cannot ride along inside it -- it is emitted
// here instead. Full text in vendor/NOTICE.md. (graphology used to be inlined beside it; the
// graph store is our own since github#58.)
const LIB_NOTICE = `<!--
  This file inlines one MIT-licensed library:
    Sigma.js    (c) Alexis Jacomy, Guillaume Plique and Sigma.js contributors
                https://github.com/jacomyal/sigma.js
  Full licence text: vendor/NOTICE.md in the vault-graph repository.
-->`;

// WHICH RENDERER DRAWS THE PAGE -- transitional (github#58, step 3). While the engine's
// renderer is being brought up to Sigma's picture, both ship in the file and shell.html hands
// the page whichever this flag names, so scripts/render-diff.mjs can build the same vault twice
// and compare the two frame for frame. Sigma stays the default until the switch (step 3.6);
// after it the flag, the Sigma script and the notice above all go.
// VG_RENDERER in the environment is the default for the flag, so a harness that builds through
// this script without passing flags -- scripts/smoke.mjs -- can be pointed at the engine too:
// `VG_RENDERER=own node scripts/smoke.mjs --only hover` runs the suite's own checks against it.
const RENDERER = opt("renderer", process.env.VG_RENDERER || "sigma");
if (RENDERER !== "sigma" && RENDERER !== "own") {
  console.error(`build-graph: --renderer must be "sigma" or "own", not "${RENDERER}"`);
  process.exit(2);
}

const libs = `<script>window.VAULT_RENDERER=${JSON.stringify(RENDERER)};</script>\n` +
  `<script>\n${engine.trimEnd()}\n</script>\n` + LIB_NOTICE + "\n" +
  `<script>\n${readVendorSource(ROOT, "sigma.min.js")}\n</script>`;

// The logo and favicon are inlined as data URIs for the same reason the libraries
// are: one self-contained file, no network, and `file://` will not fetch a sibling
// image reliably either. They are pre-sized derivatives of logo-source.png -- see
// make-logo.ps1, which exists because this script is node-builtins-only and node
// has no image decoder, so it can base64 a PNG but cannot resize one. Both are
// optional: a missing file just means no logo, not a broken build. (The script's only
// dependency is esbuild, which bundles code and does not decode images either.)
const dataUri = (f) => {
  try {
    return "data:image/png;base64," + readFileSync(join(ROOT, "assets", f)).toString("base64");
  } catch { return ""; }
};
// The centre logo is a MASK, not a picture: white art on transparent, whose alpha the
// page paints with the disc's own wedge colours. The favicon stays full-colour, having
// no disc behind it to borrow from.
const LOGO_MASK = dataUri("logo-mask.png");
const FAVICON = dataUri("favicon.png");
const assets =
  (FAVICON ? `<link rel="icon" href="${FAVICON}">` : "") +
  `\n<script>window.VAULT_LOGO_MASK=${JSON.stringify(LOGO_MASK)};</script>`;

// ONE PAGE, TWO MOUNTS.
//
// This used to be one read of template.html. The page is four files now -- shell.html plus
// page.css, page.html and page.js -- because the Obsidian plugin has to mount the same page
// INSIDE an existing document, where a doctype, a <head> and a stylesheet full of `:root`
// tokens are not things it can use. The plugin imports the three parts and puts them in a
// view; this assembles them into a standalone document, which is the shape that travels to
// a phone.
//
// Neither mount is the other's poor relation, and the split is exactly a split: at the
// commit that introduced it, the file produced here was byte-identical to the one the
// single template produced, apart from its own build timestamp.
const part = (f) => readFileSync(join(HERE, f), "utf8");

// page.js is an ES module because the plugin imports it. A standalone page cannot be one:
// a module served from file:// is blocked by CORS, and opening this file straight off a
// disk is its entire reason to exist. So the export statement -- which is a syntax error in
// a classic script -- comes off on the way in, and shell.html calls the function directly.
const asScript = (js) => js.replace(/^export \{[^}]*\};?\s*$/m, "").trimEnd();

const html = part("shell.html")
  .replace("<!--CSS-->", () => part("page.css").trimEnd())
  .replace("<!--MARKUP-->", () => part("page.html").trimEnd())
  .replace("<!--SCRIPT-->", () => asScript(part("page.js")))
  .replace("<!--LIBS-->", () => libs)
  .replace("<!--ASSETS-->", () => assets)
  .replace("<!--DATA-->", () => `<script>window.VAULT_DATA=${JSON.stringify(data)};</script>`);

writeFileSync(OUT, html, "utf8");

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`vault-graph: ${data.stats.nodes} notes, ${data.stats.edges} links, ` +
            `${data.stats.orphans} orphans, ${unresolved} unresolved link(s)`);
console.log(`dated: ${dates.frontmatter} from frontmatter, ${dates.filename} from the ` +
            `filename, ${dates.stamp} from the file stamp` +
            (dates.none ? `, ${dates.none} UNDATED` : ", none undated"));
console.log(`wrote ${OUT} (${kb} KB)`);
