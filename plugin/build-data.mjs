// github#149, design/0020 -- the plugin's producer, out of main.js for the gate
// github#149 -- nothing from "obsidian" at runtime; normalizePath comes in
// github#149 -- JSDoc obsidian types are erased, and are checked by tsc

// github#6
import { dateTally, localDay, resolveCreated } from "../src/dates.mjs";
// github#141
import { canonicalDest, ghostKey } from "../src/links.mjs";
// github#149 -- the policy this producer shares with src/build-graph.mjs
import {
  countWords, degrees, edgeBook, generatedStamp, ghostNode, inferType, isSkippedFile,
  noteBody, normalizeTags, normSlashes, paraDirs, paraFolder, under,
} from "../src/taxonomy.mjs";

/** @typedef {import("obsidian").App} App */
/** @typedef {import("obsidian").TFile} TFile */

// github#149 -- all this producer needs of Obsidian that is not `app`
/**
 * @typedef {Object} Host
 * @property {App} app
 * @property {(path: string) => string} normalizePath   obsidian own; NFC, and not reimplementable
 */

/**
 * github#149, design/0020 -- one note as buildData emits it
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} label
 * @property {string} folder
 * @property {string[]} dirs
 * @property {string} sub
 * @property {string} type
 * @property {string[]} tags
 * @property {string} created
 * @property {string} touched
 * @property {number} words
 * @property {boolean} [ghost]
 * @property {TFile} [_file]
 */

/** @typedef {Awaited<ReturnType<typeof buildData>>} BuildResult */

/**
 * github#140 -- the only four settings buildData reads, per render
 * @typedef {{ ghosts: boolean, templates: boolean, flatMonths: boolean, words: boolean }} BuildOptions
 */

// github#32
/** @param {string} a @param {string} b */
const walkOrder = (a, b) => {
  const sa = a.split("/"), sb = b.split("/");
  const n = Math.min(sa.length, sb.length);
  for (let i = 0; i < n; i++) {
    if (sa[i] !== sb[i]) return sa[i] < sb[i] ? -1 : 1;
  }
  return sa.length - sb.length;
};

/* ==================================================================== config ==
 * github#149, design/0020 -- ask the vault, through Vault#configDir
 */
/**
 * @param {Host} host
 * @param {string} name   path under the config dir
 * @returns {Promise<unknown>}   the parsed file, or null when absent or unreadable. `unknown`
 *   github#149 -- unknown on purpose: no schema this plugin owns
 */
async function readConfigJson(host, name) {
  try {
    const app = host.app;
    const p = host.normalizePath(app.vault.configDir + "/" + name);
    if (!(await app.vault.adapter.exists(p))) return null;
    /** @type {unknown} */
    const parsed = JSON.parse(await app.vault.adapter.read(p));
    return parsed;
  } catch {
    return null;
  }
}

/**
 * github#149 -- one string field, or "" -- untrimmed
 * @param {unknown} obj @param {string} key
 */
const strField = (obj, key) => {
  if (!obj || typeof obj !== "object" || !(key in obj)) return "";
  const v = /** @type {Record<string, unknown>} */ (obj)[key];
  return typeof v === "string" ? v : "";
};

/** @param {Host} host */
async function readFolders(host) {
  /** @type {Set<string>} */
  const dirs = new Set();
  const core = strField(await readConfigJson(host, "templates.json"), "folder");
  if (core.trim()) dirs.add(normSlashes(core));
  const templater = strField(await readConfigJson(host, "plugins/templater-obsidian/data.json"), "templates_folder");
  if (templater.trim()) dirs.add(normSlashes(templater));
  const dn = strField(await readConfigJson(host, "daily-notes.json"), "folder");
  const dailyDir = dn.trim() ? normSlashes(dn) : "";
  return { templateDirs: Array.from(dirs), dailyDir: dailyDir };
}

/** github#71, decisions/0015 -- the three places a spec is read; cache-parsed here
 * @param {Host} host
 */
async function readSortSpecs(host) {
  const app = host.app;
  /** @type {{ folder: string, text: string, origin: string }[]} */
  const out = [];
  const seen = new Set();
  /** @param {import("obsidian").TFile} file */
  const add = (file) => {
    if (!file || seen.has(file.path)) return;
    seen.add(file.path);
    const fm = (app.metadataCache.getFileCache(file) || {}).frontmatter || {};
    const text = typeof fm["sorting-spec"] === "string" ? fm["sorting-spec"] : "";
    if (!text.trim()) return;
    const dir = file.parent && file.parent.path && file.parent.path !== "/" ? file.parent.path : "";
    out.push({ folder: dir, text: text, origin: file.path });
  };

  for (const file of app.vault.getMarkdownFiles()) {
    const dir = file.parent && file.parent.path && file.parent.path !== "/" ? file.parent.path : "";
    const parent = dir.indexOf("/") < 0 ? dir : dir.slice(dir.lastIndexOf("/") + 1);
    // github#71 -- a sortspec.md, or a folder note carrying the key
    if (file.basename.toLowerCase() === "sortspec" || (parent && file.basename === parent)) add(file);
  }

  const extra = strField(await readConfigJson(host, "plugins/custom-sort/data.json"), "additionalSortspecFile");
  if (extra.trim()) {
    const f = app.vault.getFileByPath(host.normalizePath(normSlashes(extra)));
    if (f) add(/** @type {import("obsidian").TFile} */ (f));
  }
  return out;
}

/* ================================================================ the adapter ==
 * github#149, design/0020 -- four reads of an in-memory index, not a crawl
 */
/**
 * @param {Host} host
 * @param {BuildOptions} opts   only the four build settings are read
 * @param {string} [version]   github#108 -- this.plugin.manifest.version, shown in the stats line
 */
export async function buildData(host, opts, version) {
  const app = host.app;
  const t0 = performance.now();
  const folders = await readFolders(host);
  // github#71
  const sortSpecs = await readSortSpecs(host);
  const templateDirs = folders.templateDirs, dailyDir = folders.dailyDir;
  /** @param {string} path */
  const isTemplate = (path) => templateDirs.some((d) => under(path, d));

  const files = app.vault.getMarkdownFiles().filter((f) => {
    if (isSkippedFile(f.name)) return false;
    return opts.templates ? true : !isTemplate(f.path);
  });
  // github#32
  files.sort((a, b) => walkOrder(a.path, b.path));

  /** @type {Map<string, number>} */
  const index = new Map();
  /** @type {GraphNode[]} */
  const nodes = [];
  const dates = dateTally();

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file) || {};
    /** @type {Record<string, unknown>} */
    const fm = cache.frontmatter || {};

    // github#149
    const tags = normalizeTags(fm);

    const dirs = paraDirs(file.path, opts.flatMonths);
    // github#6
    const dated = resolveCreated(fm, file.basename, file.stat.ctime, file.stat.mtime);
    dates[dated.source]++;
    index.set(file.path, nodes.length);
    nodes.push({
      id: file.path,
      label: file.basename,
      folder: paraFolder(file.path),
      dirs: dirs,
      sub: dirs[0] || "",
      type: inferType(fm, file.path, tags, dailyDir, isTemplate),
      tags: tags,
      created: dated.day,
      touched: localDay(file.stat.mtime),
      words: 0,
      _file: file,
    });
  }
  const tIndex = performance.now();

  /* ---- edges: Obsidian's resolution, not ours ----------------------------- */
  // github#149
  const book = edgeBook();
  /** @param {number} i @param {number} j @param {number} w */
  const addEdge = (i, j, w) => book.add(i, j, w);

  let attachmentLinks = 0, filteredLinks = 0;
  const resolved = app.metadataCache.resolvedLinks || {};
  for (const src of Object.keys(resolved)) {
    const i = index.get(src);
    if (i === undefined) continue;
    for (const dest of Object.keys(resolved[src])) {
      const j = index.get(dest);
      if (j === undefined) {
        if (dest.toLowerCase().endsWith(".md")) filteredLinks++;
        else attachmentLinks++;
        continue;
      }
      addEdge(i, j, resolved[src][dest]);
    }
  }

  /* ---- ghosts: unresolvedLinks, for free --------------------------------- */
  const unresolvedMap = app.metadataCache.unresolvedLinks || {};
  let unresolved = 0;
  // github#141
  /** @type {Map<string, { dest: string, sources: [number, number][] }>} */
  const ghosts = new Map();
  for (const src of Object.keys(unresolvedMap)) {
    const i = index.get(src);
    if (i === undefined) continue;
    for (const target of Object.keys(unresolvedMap[src])) {
      const n = unresolvedMap[src][target];
      unresolved += n;
      if (!opts.ghosts) continue;
      const dest = canonicalDest(src, target);
      const key = ghostKey(dest);
      let slot = ghosts.get(key);
      if (!slot) { slot = { dest: dest, sources: [] }; ghosts.set(key, slot); }
      else if (dest < slot.dest) slot.dest = dest;
      slot.sources.push([i, n]);
    }
  }
  if (opts.ghosts) {
    for (const slot of ghosts.values()) {
      const j = nodes.length;
      // github#149, github#152 -- one factory, so a ghost cannot lose a field in one host only
      nodes.push(ghostNode(slot.dest));
      for (const pair of slot.sources) addEdge(pair[0], j, pair[1]);
    }
  }

  /* ---- words: the only remaining I/O, read after the mount ---------------- */
  const tEdges = performance.now();
  const wordFiles = opts.words ? nodes.map((n) => n._file || null) : null;
  // github#58
  /**
   * @param {(index: number, words: number) => void} apply
   * @param {Set<string>} [only]   github#72: read just these paths, for a live rebuild
   * @returns {Promise<number>}
   */
  const readWords = async (apply, only) => {
    const t = performance.now();
    if (!wordFiles) return 0;
    await Promise.all(wordFiles.map(async (file, i) => {
      if (!file) return;
      if (only && !only.has(file.path)) return;
      let words = 0;
      try {
        // github#149
        const raw = await app.vault.cachedRead(file);
        words = countWords(noteBody(raw));
      } catch { words = 0; }
      apply(i, words);
    }));
    return Math.round(performance.now() - t);
  };
  const tWords = performance.now();

  const edges = book.edges();
  const degree = degrees(edges, nodes.length);

  const out = nodes.map((n, i) => {
    const clean = Object.assign({}, n, { deg: degree[i] });
    delete clean._file;
    return clean;
  });

  return {
    vault: app.vault.getName(),
    version: version,
    // github#149
    generated: generatedStamp(),
    nodes: out,
    edges: edges,
    stats: {
      files: files.length,
      nodes: out.length,
      edges: edges.length,
      unresolved: unresolved,
      orphans: degree.filter((d) => d === 0).length,
      // github#6
      dates: dates,
      templatesExcluded: !opts.templates,
      ghostsIncluded: !!opts.ghosts,
    },
    readWords: readWords,
    // github#71
    sortSpecs: sortSpecs,
    _spike: {
      msIndex: Math.round(tIndex - t0),
      msEdges: Math.round(tEdges - tIndex),
      msWords: Math.round(tWords - tEdges),
      msWordsBackground: /** @type {number | null} */ (null),
      msTotal: Math.round(tWords - t0),
      templateDirs: templateDirs,
      dailyDir: dailyDir,
      attachmentLinks: attachmentLinks,
      filteredLinks: filteredLinks,
    },
  };
}
