#!/usr/bin/env node
// github#58

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, basename, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
// github#58
// decisions/0012
import { buildSync } from "esbuild";
// github#6
import { localDay, resolveCreated, dateTally } from "./dates.mjs";
import { engineBanner } from "./engine/notice.mjs";

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
    } catch { }
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

/* ---------------------------------------------------------------- discovery */

const readJson = (rel) => {
  try { return JSON.parse(readFileSync(join(VAULT, rel), "utf8")); } catch { return null; }
};
const norm = (s) => String(s).split(/[\\/]/).filter(Boolean).join("/");

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

const DAILY_DIR = (() => {
  const dn = readJson(".obsidian/daily-notes.json");
  return dn && typeof dn.folder === "string" && dn.folder.trim() ? norm(dn.folder) : "";
})();

const SKIP_DIRS = new Set(["node_modules"]);

const SKIP_FILES = new Set(["claude.md", "readme.md", "license.md"]);

const under = (rel, dir) => dir && (rel === dir || rel.startsWith(dir + "/"));
const isTemplate = (rel) => TEMPLATE_DIRS.some((d) => under(rel, d));

function walk(dir, acc = []) {
  // github#32
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

const stripCode = (s) =>
  s.replace(/^```[\s\S]*?^```/gm, "\n")
   .replace(/^~~~[\s\S]*?^~~~/gm, "\n")
   .replace(/`[^`\n]*`/g, " ");

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

  for (const v of Object.values(fm)) {
    for (const s of (Array.isArray(v) ? v : [v])) {
      if (typeof s === "string" && s.includes("[[")) scan(s, WIKILINK);
    }
  }
  return out;
}

/* ------------------------------------------------------------ note taxonomy */

const MONTHISH = /^\d{4}(?:[-_ ]?(?:\d{2}|Q[1-4]|W\d{1,2}))?$/i;

const TYPE_ALIAS = {
  people: "person", person: "person",
  "zettel/permanent": "zettel", "zettel/fleeting": "zettel", "zettel/literature": "zettel",
};

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

const paraDirs = (relPath) => {
  const seg = relPath.split(sep).slice(1, -1);
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

const dates = dateTally();

/* ------------------------------------------------------------------- build */

const files = walk(VAULT).filter((abs) => {
  if (INCLUDE_TEMPLATES) return true;
  return !isTemplate(relative(VAULT, abs).split(sep).join("/"));
});
const notes = [];
const byKey = new Map();

for (const abs of files) {
  const relPath = relative(VAULT, abs);
  const raw = readFileSync(abs, "utf8");
  const { fm, body } = parseFrontmatter(raw);
  const name = basename(abs, ".md");
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
    dirs: paraDirs(relPath),
    sub: paraDirs(relPath)[0] || "",
    type: inferType(fm, relPath, tags),
    tags,
    // github#6
    created: dated.day,
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
    // github#6
    dates,
    templatesExcluded: !INCLUDE_TEMPLATES,
    ghostsIncluded: INCLUDE_GHOSTS,
  },
  dev: DEV_BUILD,
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

const dataUri = (f) => {
  try {
    return "data:image/png;base64," + readFileSync(join(ROOT, "assets", f)).toString("base64");
  } catch { return ""; }
};
const LOGO_MASK = dataUri("logo-mask.png");
const FAVICON = dataUri("favicon.png");
const assets =
  (FAVICON ? `<link rel="icon" href="${FAVICON}">` : "") +
  `\n<script>window.VAULT_LOGO_MASK=${JSON.stringify(LOGO_MASK)};</script>`;

const part = (f) => readFileSync(join(HERE, f), "utf8");

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
