#!/usr/bin/env node
// github#58

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, basename, dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
// github#58
// decisions/0012
import { buildSync } from "esbuild";
// github#6
import { localDay, resolveCreated, dateTally } from "./dates.mjs";
// github#141
import { canonicalDest, cleanTarget, ghostKey, isExternalTarget, isRelativeDest, resolveAgainst } from "./links.mjs";
// github#149 -- the policy this producer shares with plugin/build-data.mjs
import {
  countWords, degrees, edgeBook, generatedStamp, ghostNode, inferType, isSkippedFile,
  noteBody, normalizeTags, normSlashes, paraDirs, paraFolder, under,
} from "./taxonomy.mjs";
import { engineBanner } from "./engine/notice.mjs";
// github#71
import { readSortingSpec } from "./sortspec-file.mjs";

// github#156 -- tsconfig.contracts-node.json is what reads these
/**
 * @typedef {import("./page.js").VaultNode} VaultNode
 * @typedef {import("./page.js").VaultEdge} VaultEdge
 * @typedef {import("./page.js").VaultData} VaultData
 */
/**
 * github#156 -- a note before its degree is counted, so not a VaultNode yet
 * @typedef {Omit<VaultNode, "deg"> & { _links?: string[] }} RawNote
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes("--" + n);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };

const obsidianVaults = () => {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    process.env.APPDATA && join(process.env.APPDATA, "obsidian", "obsidian.json"),
    join(home, "Library", "Application Support", "obsidian", "obsidian.json"),
    join(home, ".config", "obsidian", "obsidian.json"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const reg = JSON.parse(readFileSync(p, "utf8"));
      return Object.values(reg.vaults || {})
        .filter((v) => v && v.path && existsSync(join(v.path, ".obsidian")))
        .map((v) => ({ path: resolvePath(v.path), open: !!v.open, ts: v.ts || 0 }));
    } catch { continue; }
  }
  return [];
};

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

const INCLUDE_GHOSTS = flag("ghosts");
const DEV_BUILD = flag("dev");
const INCLUDE_TEMPLATES = flag("templates");
// decisions/0005
// github#64
const OUT = opt("out", join(VAULT, "vault-graph.html"));
const FLAT_MONTHS = flag("flat-months");
const STRIP_NAV = flag("no-nav");
// github#71, decisions/0009 -- --folder-order overrides; absent, the page decides
const SORTSPEC_ARG = opt("sortspec", "");
// github#156 -- the page's own union; .includes() narrows nothing
/** @type {"" | NonNullable<import("./page.js").MountDeps["folderOrder"]>} */
const FOLDER_ORDER = (() => {
  const v = String(opt("folder-order", ""));
  if (!v) return "";   // github#71 -- absent: the page decides from the vault
  if (v === "name" || v === "explorer" || v === "size") return v;
  console.error(`build-graph: --folder-order ${v} is not name|explorer|size -- letting the page decide`);
  return "";
})();

/* ---------------------------------------------------------------- discovery */

const readJson = (rel) => {
  try { return JSON.parse(readFileSync(join(VAULT, rel), "utf8")); } catch { return null; }
};

const TEMPLATE_DIRS = (() => {
  const out = new Set();
  const core = readJson(".obsidian/templates.json");
  if (core && typeof core.folder === "string" && core.folder.trim()) out.add(normSlashes(core.folder));
  const templater = readJson(".obsidian/plugins/templater-obsidian/data.json");
  if (templater && typeof templater.templates_folder === "string" && templater.templates_folder.trim()) {
    out.add(normSlashes(templater.templates_folder));
  }
  return [...out];
})();

const DAILY_DIR = (() => {
  const dn = readJson(".obsidian/daily-notes.json");
  return dn && typeof dn.folder === "string" && dn.folder.trim() ? normSlashes(dn.folder) : "";
})();

const SKIP_DIRS = new Set(["node_modules"]);

const isTemplate = (rel) => TEMPLATE_DIRS.some((d) => under(rel, d));

function walk(dir, acc = []) {
  // github#32
  for (const entry of readdirSync(dir).sort()) {
    const p = join(dir, entry);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      walk(p, acc);
    } else if (entry.toLowerCase().endsWith(".md") && !isSkippedFile(entry)) {
      acc.push(p);
    }
  }
  return acc;
}

/* ------------------------------------------------------------- frontmatter */

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
  // github#149
  return { fm, body: noteBody(raw) };
}
const unquote = (s) => String(s).trim().replace(/^["']|["']$/g, "").trim();

/* -------------------------------------------------------------- link mining */

const stripCode = (s) =>
  s.replace(/^```[\s\S]*?^```/gm, "\n")
   .replace(/^~~~[\s\S]*?^~~~/gm, "\n")
   .replace(/`[^`\n]*`/g, " ");

const NAV_LINE = new RegExp(
  "^\\s*!?\\[\\[[^\\]]+\\]\\]\\s*(?:\\u2190|<-|<)\\s*\\|\\s*(?:\\u2192|->|>)\\s*!?\\[\\[[^\\]]+\\]\\]\\s*$",
  "gm"
);
const stripDailyNav = (s) => (STRIP_NAV ? s.replace(NAV_LINE, "") : s);

// github#141
const WIKILINK = /!?\[\[([^[\]|#]+)(?:#[^[\]|]*)?(?:\|[^[\]]*)?\]\]/g;
// github#141
const MDLINK = /\[[^\]]*\]\(([^)\s#]+\.md)(?:#[^)\s]*)?(?:\s[^)]*)?\)/g;

function mineLinks(body, fm) {
  const out = [];
  // github#141
  const push = (raw, url) => {
    if (url && isExternalTarget(raw)) return;
    const dest = cleanTarget(raw);
    if (dest) out.push(dest);
  };
  const scan = (text, re, url) => {
    let m; re.lastIndex = 0;
    while ((m = re.exec(text))) push(m[1], url);
  };

  const clean = stripDailyNav(stripCode(body));
  scan(clean, WIKILINK, false);
  scan(clean, MDLINK, true);

  for (const v of Object.values(fm)) {
    for (const s of (Array.isArray(v) ? v : [v])) {
      if (typeof s === "string" && s.includes("[[")) scan(s, WIKILINK, false);
    }
  }
  return out;
}

/* ------------------------------------------------------------ note taxonomy */

// github#149 -- below this line everything is "/" separated
/** @param {string} relPath @returns {string} */
const slashed = (relPath) => relPath.split(sep).join("/");

const dates = dateTally();

/* ------------------------------------------------------------------- build */

const files = walk(VAULT).filter((abs) => {
  if (INCLUDE_TEMPLATES) return true;
  return !isTemplate(slashed(relative(VAULT, abs)));
});
/* github#71, decisions/0015 -- the three places a spec is read, plus --sortspec */
const SORT_SPECS = (() => {
  // github#156 -- typed, or it reaches VaultData.sortSpecs as any[]
  /** @type {NonNullable<VaultData["sortSpecs"]>} */
  const out = [];
  const seen = new Set();
  const add = (abs, origin) => {
    const key = resolvePath(abs);
    if (seen.has(key)) return;
    seen.add(key);
    let raw; try { raw = readFileSync(abs, "utf8"); } catch { return; }
    const text = readSortingSpec(raw);
    if (!text.trim()) return;
    const rel = slashed(relative(VAULT, abs));
    const home = rel.indexOf("/") < 0 ? "" : rel.slice(0, rel.lastIndexOf("/"));
    out.push({ folder: home, text, origin: origin || rel });
  };

  for (const abs of files) {
    const rel = slashed(relative(VAULT, abs));
    const name = basename(abs, ".md");
    const dir = rel.indexOf("/") < 0 ? "" : rel.slice(0, rel.lastIndexOf("/"));
    const parent = dir.indexOf("/") < 0 ? dir : dir.slice(dir.lastIndexOf("/") + 1);
    // github#71 -- a sortspec.md, or a folder note carrying the key
    if (name.toLowerCase() === "sortspec" || (parent && name === parent)) add(abs, rel);
  }

  const cfg = readJson(".obsidian/plugins/custom-sort/data.json");
  if (cfg && typeof cfg.additionalSortspecFile === "string" && cfg.additionalSortspecFile.trim()) {
    add(join(VAULT, normSlashes(cfg.additionalSortspecFile)), normSlashes(cfg.additionalSortspecFile));
  }
  if (SORTSPEC_ARG) {
    const abs = isAbsolute(SORTSPEC_ARG) ? SORTSPEC_ARG : join(VAULT, normSlashes(SORTSPEC_ARG));
    if (!existsSync(abs)) console.error(`build-graph: --sortspec ${SORTSPEC_ARG} does not exist -- ignored`);
    else add(abs, "--sortspec");
  }
  return out;
})();

/** @type {RawNote[]} */
const notes = [];
/** @type {Map<string, number>} */
const byKey = new Map();
// github#141
/** @type {Map<string, number>} */
const byPath = new Map();

for (const abs of files) {
  const path = slashed(relative(VAULT, abs));
  const raw = readFileSync(abs, "utf8");
  const { fm, body } = parseFrontmatter(raw);
  const name = basename(abs, ".md");
  let st = null; try { st = statSync(abs); } catch { st = null; }
  const dated = resolveCreated(fm, name, st && st.ctimeMs, st && st.mtimeMs);
  dates[dated.source]++;

  // github#149
  const tags = normalizeTags(fm);
  const dirs = paraDirs(path, FLAT_MONTHS);

  /** @type {RawNote} */
  const note = {
    id: path,
    label: name,
    folder: paraFolder(path),
    dirs,
    sub: dirs[0] || "",
    type: inferType(fm, path, tags, DAILY_DIR, isTemplate),
    tags,
    // github#6
    created: dated.day,
    touched: st ? localDay(st.mtimeMs) : "",
    words: countWords(body),
    _links: mineLinks(body, fm),
  };
  const idx = notes.push(note) - 1;

  // github#141
  const key = note.id.replace(/\.md$/, "").toLowerCase();
  if (!byPath.has(key)) byPath.set(key, idx);

  const keys = [name].concat(fm.aliases ?? [], fm.alias ?? []);
  for (const k of keys) {
    const kk = String(k).toLowerCase().trim();
    if (kk && !byKey.has(kk)) byKey.set(kk, idx);
  }
}

/** @type {Map<string, { dest: string, sources: number[] }>} */
const ghosts = new Map();
let unresolved = 0;

// github#141
const exact = (p) => {
  const k = p.toLowerCase();
  return k && byPath.has(k) ? byPath.get(k) : -1;
};

// github#141
const resolve = (dest, sourceId) => {
  const here = exact(resolveAgainst(sourceId, dest));
  if (here >= 0) return here;
  if (isRelativeDest(dest)) return -1;
  const there = exact(canonicalDest(sourceId, dest));
  if (there >= 0) return there;
  // github#141 -- byKey holds no paths now, so an alias may carry a slash
  const k = dest.toLowerCase().trim();
  return byKey.has(k) ? byKey.get(k) : -1;
};

// github#149
const book = edgeBook();
const addEdge = (i, j) => book.add(i, j, 1);

for (let i = 0; i < notes.length; i++) {
  for (const target of notes[i]._links) {
    const j = resolve(target, notes[i].id);
    if (j < 0) {
      unresolved++;
      if (INCLUDE_GHOSTS) {
        // github#141
        const dest = canonicalDest(notes[i].id, target);
        const key = ghostKey(dest);
        let slot = ghosts.get(key);
        if (!slot) { slot = { dest, sources: [] }; ghosts.set(key, slot); }
        else if (dest < slot.dest) slot.dest = dest;
        slot.sources.push(i);
      }
      continue;
    }
    addEdge(i, j);
  }
}

if (INCLUDE_GHOSTS) {
  // github#141
  for (const { dest, sources } of ghosts.values()) {
    // github#149, github#152 -- one factory, so a ghost cannot lose a field in one host only
    /** @type {RawNote} */
    const g = ghostNode(dest);
    const j = notes.push(g) - 1;
    for (const i of sources) addEdge(i, j);
  }
}

/** @type {VaultEdge[]} */
const edges = book.edges();
const degree = degrees(edges, notes.length);

/** @type {VaultNode[]} */
const nodes = notes.map((n, i) => {
  const { _links, ...rest } = n;
  return { ...rest, deg: degree[i] };
});

// github#108
const VERSION = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version;

/** @type {VaultData} */
const data = {
  vault: basename(VAULT),
  version: VERSION,
  // github#149
  generated: generatedStamp(),
  nodes,
  edges,
  stats: {
    files: files.length,
    nodes: nodes.length,
    edges: edges.length,
    unresolved,
    orphans: degree.filter((d) => d === 0).length,
    // github#6
    dates,
    templatesExcluded: !INCLUDE_TEMPLATES,
    ghostsIncluded: INCLUDE_GHOSTS,
  },
  dev: DEV_BUILD,
  // github#71 -- omitted unless told, so absence means nobody has chosen
  ...(FOLDER_ORDER ? { folderOrder: FOLDER_ORDER } : {}),
  sortSpecs: SORT_SPECS,
};

/* ------------------------------------------------------------------ emit */

// github#58
const engine = (() => {
  try {
    return buildSync({
      absWorkingDir: ROOT,
      entryPoints: [join(ROOT, "src", "engine", "index.ts")],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "VaultGraphEngine",
      platform: "browser",
      target: "es2020",
      minify: false,
      logLevel: "silent",
      banner: { js: engineBanner() },
    }).outputFiles[0].text;
  } catch (e) {
    const messages = Array.isArray(e.errors) ? e.errors.map((m) => m.text + (m.location ? ` (${m.location.file}:${m.location.line})` : "")) : [String(e.message || e)];
    console.error("build-graph: the engine did not bundle:\n  " + messages.join("\n  "));
    process.exit(1);
  }
})();

const libs = `<script>\n${engine.trimEnd()}\n</script>`;

// github#96
const jsonForScript = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

const dataUri = (f) => {
  try {
    return "data:image/png;base64," + readFileSync(join(ROOT, "assets", f)).toString("base64");
  } catch { return ""; }
};
const LOGO_MASK = dataUri("logo-mask.png");
const FAVICON = dataUri("favicon.png");
const assets =
  (FAVICON ? `<link rel="icon" href="${FAVICON}">` : "") +
  `\n<script>window.VAULT_LOGO_MASK=${jsonForScript(LOGO_MASK)};</script>`;

const part = (f) => readFileSync(join(HERE, f), "utf8");

const asScript = (js) => js.replace(/^export \{[^}]*\};?\s*$/m, "").trimEnd();

const html = part("shell.html")
  .replace("<!--CSS-->", () => part("page.css").trimEnd())
  .replace("<!--MARKUP-->", () => part("page.html").trimEnd())
  .replace("<!--SCRIPT-->", () => asScript(part("page.js")))
  .replace("<!--LIBS-->", () => libs)
  .replace("<!--ASSETS-->", () => assets)
  .replace("<!--DATA-->", () => `<script>window.VAULT_DATA=${jsonForScript(data)};</script>`);

writeFileSync(OUT, html, "utf8");

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`vault-graph: ${data.stats.nodes} notes, ${data.stats.edges} links, ` +
            `${data.stats.orphans} orphans, ${unresolved} unresolved link(s)`);
if (SORT_SPECS.length) {
  console.log(`sortspec: ${SORT_SPECS.length} source(s) -- ` +
              SORT_SPECS.map((x) => x.origin).join(", ") + `; folder order: ${FOLDER_ORDER || "from the vault (explorer)"}`);
} else if (FOLDER_ORDER === "explorer") {
  console.log("sortspec: --folder-order explorer, but no sortspec was found -- the page will " +
              "fall back to name order");
}
console.log(`dated: ${dates.frontmatter} from frontmatter, ${dates.filename} from the ` +
            `filename, ${dates.stamp} from the file stamp` +
            (dates.none ? `, ${dates.none} UNDATED` : ", none undated"));
console.log(`wrote ${OUT} (${kb} KB)`);
