/**
 * Vault Graph -- the Obsidian plugin.
 *
 * Grew out of the spike recorded in plugin/SPIKE.md, which established three things by
 * measurement: the page runs unchanged inside Obsidian, Obsidian's own index can produce
 * its data in ~12ms, and the iframe that made proving that cheap has to go.
 *
 * The iframe is gone. The page mounts directly into the view's element, so __vg is in this
 * window, the theme comes from Obsidian's own CSS variables, and the invariant suite can
 * reach the page without a message bridge.
 *
 * AN ES MODULE, not a script, and that is load-bearing rather than fashion: a script's
 * top-level `const Plugin` IS a global, so it collides with the DOM's own `Plugin` and
 * every top-level function trips no-implicit-globals. Seven of the twelve lint errors in
 * the first clean run were that one fact. esbuild emits CommonJS for Obsidian's loader.
 */

import { Plugin, ItemView, Notice, normalizePath, addIcon } from "obsidian";

// Compiled in by scripts/build-plugin.mjs. Obsidian installs only main.js, manifest.json
// and styles.css, so anything read from disk at runtime does not exist for a real user --
// the page and both libraries have to BE the bundle. `raw:` and `b64:` are the bundler's
// namespace loaders; see the esbuild plugin in that script.
// THE PAGE, AS CODE RATHER THAN AS TEXT.
//
// The iframe needed the page as one HTML string. Mounting it in the DOM needs the opposite:
// the script as a real import so it can be CALLED, the libraries as real imports so they
// can be passed to it, and only the markup still as text, because markup has to be parsed
// into nodes either way.
//
// page.css is absent on purpose -- it is no longer the plugin's business. It ships as
// styles.css, which Obsidian loads itself; see scripts/build-plugin.mjs.
import { mountVaultGraph } from "../src/page.js";
import graphology from "../vendor/graphology.umd.min.js";
import sigma from "../vendor/sigma.min.js";
import PAGE_HTML from "raw:../src/page.html";
import LOGO_MASK_B64 from "b64:../assets/logo-mask.png";

const VIEW_TYPE = "vault-graph-view";
const ICON_ID = "vault-graph-disc";

/* ====================================================================== icon ==
 * The ribbon started on Lucide's `git-fork`, which already sits in this vault's ribbon
 * for something else -- two identical icons, one of them ours. So the mark is its own.
 *
 * It is the product drawn literally: two concentric bands of notes around a hollow hub.
 * Emitted from geometry rather than hand-written path data, so the numbers that were
 * tuned are visible as numbers.
 *
 * THREE THINGS MEASURED, all of which look like arbitrary constants and are not:
 *
 * 1. NO WRAP GAP, even though the disc itself has one. Two attempts, both rejected by
 *    looking at them at 18px. Spreading N dots inclusively across a 344-degree arc leaves
 *    16 degrees between the first and last dot against a regular pitch of 31, so the gap
 *    is NARROWER than the spacing and reads as the dots bunching at the top. Skipping a
 *    slot instead makes the gap exactly twice the pitch -- correct, unmistakable, and at
 *    ribbon size it reads as a broken ring rather than as a deliberate opening. The disc
 *    can afford the gap at 1000px; a 18px icon cannot.
 *
 * 2. 8 AND 4 SLOTS, because the ribbon draws this at 18px. Rendered at that size and
 *    upscaled to look at, 12+6 slots and 10+5 slots both merge into a soft ring; 8+4 is
 *    the densest pair whose dots still resolve individually, and it keeps the two-band
 *    reading that a single ring loses.
 *
 * 3. THE INNER RING IS OFFSET BY HALF THE OUTER PITCH. With 8 outer and 4 inner slots,
 *    any whole-slot offset puts every inner dot on the same bearing as an outer one,
 *    which lines them up into four spokes and reads as a wheel. 22.5 degrees interleaves
 *    them, which is also what the real disc does -- its rows do not line up either.
 */
function discIcon() {
  const ring = (r, dot, slots, offset) => {
    let out = "";
    for (let i = 0; i < slots; i++) {
      const rad = (-90 + (offset || 0) + 360 * i / slots) * Math.PI / 180;
      out += '<circle cx="' + (50 + r * Math.cos(rad)).toFixed(2) +
                 '" cy="' + (50 + r * Math.sin(rad)).toFixed(2) +
                  '" r="' + dot + '"/>';
    }
    return out;
  };
  // currentColor, so it follows the theme and the ribbon's own hover state.
  return '<g fill="currentColor" stroke="none">' +
         ring(36, 8.5, 8, 0) + ring(16, 6.5, 4, 22.5) +
         "</g>";
}

/* ================================================================= taxonomy ==
 * Ported from src/build-graph.mjs, line-for-line wherever it is a pure function of the
 * path. Divergence here would make every measurement in SPIKE.md meaningless: the point
 * is to compare the SAME derivation fed by two different sources, so any difference in
 * the output is a difference in the SOURCE.
 *
 * One thing genuinely gets simpler: Obsidian hands out "a/b/c.md" with forward slashes
 * on every platform, so all the node:path `sep` juggling disappears.
 */

const MONTHISH = /^\d{4}(?:[-_ ]?(?:\d{2}|Q[1-4]|W\d{1,2}))?$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const TYPE_ALIAS = {
  people: "person", person: "person",
  "zettel/permanent": "zettel", "zettel/fleeting": "zettel", "zettel/literature": "zettel",
};

const SKIP_FILES = new Set(["claude.md", "readme.md", "license.md"]);

const deNumber = (s) => String(s).replace(/^[\s\d._)-]+/, "").trim();
const slug = (s) => deNumber(s).toLowerCase().replace(/[\s_]+/g, "-");
const singular = (s) => s.replace(/ies$/, "y").replace(/([^aeious])s$/, "$1");
const norm = (s) => String(s).split(/[\\/]/).filter(Boolean).join("/");
const under = (rel, dir) => !!dir && (rel === dir || rel.startsWith(dir + "/"));

// A date, or nothing. Obsidian's YAML parser is a real one, so unlike the hand-rolled
// frontmatter reader in build-graph.mjs this can be handed a Date object -- and it is
// still handed the unrendered Templater placeholder as a string, which is why the ISO
// test stays.
const day10 = (v) => {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p2 = (n) => String(n).padStart(2, "0");
    return v.getFullYear() + "-" + p2(v.getMonth() + 1) + "-" + p2(v.getDate());
  }
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return ISO_DAY.test(s) ? s : "";
};

const localDay = (ms) => {
  const d = new Date(ms), p2 = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
};

const paraFolder = (path) => {
  const seg = path.split("/");
  return seg.length > 1 ? seg[0] : "(vault root)";
};

const paraDirs = (path, flatMonths) => {
  const seg = path.split("/").slice(1, -1);
  const out = [];
  for (let i = 0; i < seg.length; i++) {
    if (MONTHISH.test(seg[i])) {
      if (i === 0 && !flatMonths) out.push(seg[i]);
      break;
    }
    out.push(seg[i]);
  }
  return out;
};

function inferType(fm, path, tags, dailyDir, isTemplate) {
  const raw = typeof fm.type === "string" ? fm.type.toLowerCase() : "";
  if (raw) return TYPE_ALIAS[raw] || raw;
  if (tags.indexOf("daily-note") >= 0) return "daily";
  if (under(path, dailyDir)) return "daily";
  if (isTemplate(path)) return "template";

  const dirs = path.split("/").slice(0, -1).filter(Boolean);
  const named = dirs.filter((d) => !MONTHISH.test(d));
  const pick = named.length ? named[named.length - 1] : dirs[0];
  const type = pick ? singular(slug(pick)) : "";
  return type || "note";
}

/* ==================================================================== config ==
 * Same principle as the Node builder: ask the vault which folders are templates and
 * daily notes rather than assuming a layout. The path must go through Vault#configDir --
 * a literal ".obsidian" is an ERROR under obsidianmd/eslint-plugin
 * (hardcoded-config-path), and it is wrong anyway in a vault whose config folder was
 * renamed.
 */
async function readConfigJson(app, name) {
  try {
    const p = normalizePath(app.vault.configDir + "/" + name);
    if (!(await app.vault.adapter.exists(p))) return null;
    return JSON.parse(await app.vault.adapter.read(p));
  } catch {
    return null;   // a vault that never configured this plugin is normal, not broken
  }
}

async function readFolders(app) {
  const dirs = new Set();
  const core = await readConfigJson(app, "templates.json");
  if (core && typeof core.folder === "string" && core.folder.trim()) dirs.add(norm(core.folder));
  const templater = await readConfigJson(app, "plugins/templater-obsidian/data.json");
  if (templater && typeof templater.templates_folder === "string" && templater.templates_folder.trim()) {
    dirs.add(norm(templater.templates_folder));
  }
  const dn = await readConfigJson(app, "daily-notes.json");
  const dailyDir = dn && typeof dn.folder === "string" && dn.folder.trim() ? norm(dn.folder) : "";
  return { templateDirs: Array.from(dirs), dailyDir: dailyDir };
}

/* ================================================================ the adapter ==
 * The crawl in build-graph.mjs, replaced by asking Obsidian. What used to be a walk, a
 * YAML parser, a wikilink miner, a resolver and an alias table is now four reads of an
 * index that is already in memory:
 *
 *   vault.getMarkdownFiles()        the file list       (was walk())
 *   metadataCache.getFileCache()    frontmatter + tags  (was parseFrontmatter())
 *   metadataCache.resolvedLinks     the edges           (was mineLinks() + resolve())
 *   metadataCache.unresolvedLinks   the ghosts          (was the resolve() failures)
 *   file.stat.mtime                 `touched`           (was statSync())
 *
 * Only `words` still needs a file body, and that is the only I/O left in the whole
 * build.
 */
async function buildData(app, opts) {
  const t0 = performance.now();
  const folders = await readFolders(app);
  const templateDirs = folders.templateDirs, dailyDir = folders.dailyDir;
  const isTemplate = (path) => templateDirs.some((d) => under(path, d));

  const files = app.vault.getMarkdownFiles().filter((f) => {
    if (SKIP_FILES.has(f.name.toLowerCase())) return false;
    return opts.templates ? true : !isTemplate(f.path);
  });

  const index = new Map();          // path -> node index
  const nodes = [];

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file) || {};
    const fm = cache.frontmatter || {};

    // Frontmatter tags only, matching the Node builder exactly. getAllTags(cache) would
    // ALSO return inline #tags from the body, which the builder never saw -- a free
    // improvement, but not one to smuggle into a comparison run.
    const tags = []
      .concat(fm.tags || [], fm.tag || [])
      .reduce((acc, t) => acc.concat(String(t).split(/[,\s]+/)), [])
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);

    const dirs = paraDirs(file.path, opts.flatMonths);
    index.set(file.path, nodes.length);
    nodes.push({
      id: file.path,
      label: file.basename,
      folder: paraFolder(file.path),
      dirs: dirs,
      sub: dirs[0] || "",
      type: inferType(fm, file.path, tags, dailyDir, isTemplate),
      tags: tags,
      created: day10(fm.created) || day10(fm.date),
      touched: localDay(file.stat.mtime),
      words: 0,                     // filled below; the one field still needing a read
      _file: file,
    });
  }
  const tIndex = performance.now();

  /* ---- edges: Obsidian's resolution, not ours ----------------------------- */
  // resolvedLinks is { src: { dest: count } } over EVERY link Obsidian resolved --
  // aliases, shortest-unique-path, frontmatter links, all of it. Non-markdown
  // destinations (attachments) and filtered-out templates simply miss the index; both
  // are counted so the comparison in SPIKE.md can account for every link.
  const weight = new Map();
  const addEdge = (i, j, w) => {
    if (i === j) return;
    const key = i < j ? i + " " + j : j + " " + i;
    weight.set(key, (weight.get(key) || 0) + w);
  };

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
  const ghosts = new Map();
  for (const src of Object.keys(unresolvedMap)) {
    const i = index.get(src);
    if (i === undefined) continue;
    for (const target of Object.keys(unresolvedMap[src])) {
      const n = unresolvedMap[src][target];
      unresolved += n;
      if (!opts.ghosts) continue;
      const key = target.split("/").pop();
      if (!ghosts.has(key)) ghosts.set(key, []);
      ghosts.get(key).push([i, n]);
    }
  }
  if (opts.ghosts) {
    for (const entry of ghosts) {
      const name = entry[0], sources = entry[1];
      const j = nodes.length;
      nodes.push({
        id: "ghost:" + name, label: name, folder: "(unresolved)", sub: "", dirs: [],
        type: "ghost", tags: [], created: "", touched: "", words: 0, ghost: true,
      });
      for (const pair of sources) addEdge(pair[0], j, pair[1]);
    }
  }

  /* ---- words: the only remaining I/O ------------------------------------- */
  // cachedRead, not read: Obsidian keeps recently-read bodies around, so on a warm vault
  // many of these never touch the disk. Timed separately, because "what does the one
  // expensive field cost" is a thing the spike exists to measure.
  const tEdges = performance.now();
  if (opts.words) {
    await Promise.all(nodes.filter((n) => n._file).map(async (n) => {
      try {
        const raw = await app.vault.cachedRead(n._file);
        const m = /^---\r?\n[\s\S]*?\r?\n---/.exec(raw.replace(/^\uFEFF/, ""));
        const body = m ? raw.slice(m[0].length) : raw;
        n.words = body.split(/\s+/).filter(Boolean).length;
      } catch { n.words = 0; }
    }));
  }
  const tWords = performance.now();

  const edges = Array.from(weight).map((entry) => {
    const ab = entry[0].split(" ");
    return { s: Number(ab[0]), t: Number(ab[1]), w: entry[1] };
  });

  const degree = new Array(nodes.length).fill(0);
  for (const e of edges) { degree[e.s]++; degree[e.t]++; }

  const out = nodes.map((n, i) => {
    const clean = Object.assign({}, n, { deg: degree[i] });
    delete clean._file;
    return clean;
  });

  const p2 = (n) => String(n).padStart(2, "0");
  const now = new Date();

  return {
    vault: app.vault.getName(),
    generated: now.getFullYear() + "-" + p2(now.getMonth() + 1) + "-" + p2(now.getDate()) +
               " " + p2(now.getHours()) + ":" + p2(now.getMinutes()),
    nodes: out,
    edges: edges,
    stats: {
      files: files.length,
      nodes: out.length,
      edges: edges.length,
      unresolved: unresolved,
      orphans: degree.filter((d) => d === 0).length,
      templatesExcluded: !opts.templates,
      ghostsIncluded: !!opts.ghosts,
    },
    // Spike-only. Not part of the shape the page reads; the view prints it and the CDP
    // harness asserts on it.
    _spike: {
      msIndex: Math.round(tIndex - t0),
      msEdges: Math.round(tEdges - tIndex),
      msWords: Math.round(tWords - tEdges),
      msTotal: Math.round(tWords - t0),
      templateDirs: templateDirs,
      dailyDir: dailyDir,
      attachmentLinks: attachmentLinks,
      filteredLinks: filteredLinks,
    },
  };
}

/* ====================================================================== view ==
 * IN THE DOM, not in an iframe.
 *
 * The spike hosted the page in a sandboxed <iframe>, which proved it ran inside Obsidian
 * and cost three things that all mattered (plugin/SPIKE.md has the measurements):
 *
 *   - the invariant suite could not reach it. An opaque-origin frame is site-isolated into
 *     its own CDP target, so smoke.mjs could not call __vg and every check would have
 *     needed a postMessage envelope, forever.
 *   - the host could not read into it either, so the plugin talked to its own page through
 *     a message bridge.
 *   - it inherited nothing, so the theme had to be handed across by rewriting an attribute.
 *
 * All three disappear here. __vg is in this window, the page is in this document, and the
 * theme is whatever Obsidian's CSS variables say -- because page.css is now the plugin's
 * stylesheet, loaded by Obsidian itself.
 */

class VaultGraphView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.api = null;         // what mountVaultGraph returned: the __vg surface
    this.lastData = null;
    this.mountMs = 0;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Vault graph"; }
  getIcon() { return ICON_ID; }

  async onOpen() {
    await this.render();
  }

  async onClose() {
    this.teardown();
  }

  // FREE THE WEBGL CONTEXT. Sigma holds one per renderer and a browser allows a small
  // number of them; opening and closing this view a dozen times without killing the
  // renderer exhausts them and the thirteenth mount draws nothing at all.
  teardown() {
    if (this.api && this.api.renderer) {
      try { this.api.renderer.kill(); } catch { /* already gone */ }
    }
    this.api = null;
    this.contentEl.empty();
  }

  // activeDocument, not document: a view torn out into a popout window lives in a different
  // document, and reading the main window's theme there gives the wrong answer.
  syncTheme() {
    if (!this.page) return;
    const want = activeDocument.body.classList.contains("theme-light") ? "light" : "dark";
    if (this.page.getAttribute("data-theme") === want) return;
    this.page.setAttribute("data-theme", want);

    // The palette is read from CSS variables as things are drawn, so the DOM follows the
    // attribute on its own -- but the canvases do not, because they only repaint when the
    // renderer is asked to. The logo and the heatmap band paint from `afterRender`, so a
    // refresh carries them along.
    if (this.api) {
      try {
        if (this.api.renderer) this.api.renderer.refresh();
        if (this.api.placeLogo) this.api.placeLogo();
        if (this.api.heatBuild) this.api.heatBuild();
      } catch { /* a half-built view is not worth an exception here */ }
    }
  }

  async render() {
    this.teardown();
    const root = this.contentEl;
    root.addClass("vault-graph-view");

    const data = await buildData(this.app, this.plugin.settings);
    this.lastData = data;

    // PARSED, NOT ASSIGNED. innerHTML with this markup would be safe -- it is a constant
    // from our own bundle, with no vault content in it -- but `prefer-create-el` is an
    // error under Obsidian's lint config and a reviewer should not have to take my word
    // for which strings are constants. DOMParser builds the same tree without ever
    // handing a string to the DOM.
    const parsed = new DOMParser().parseFromString(PAGE_HTML, "text/html");
    const page = parsed.body.firstElementChild;
    if (!page) throw new Error("page markup did not parse to an element");
    root.appendChild(page);

    // The page's palette lives on this element (page.css is scoped to it), so the theme is
    // set here rather than on <html> -- which is not ours to write.
    this.page = page;
    this.syncTheme();

    // AND IT HAS TO FOLLOW. Setting it once at mount was the first version, and a
    // screenshot of Obsidian in its light theme showed why that is not enough: light
    // chrome, black view. `css-change` is Obsidian's own signal for exactly this -- it
    // fires when the theme or a CSS snippet changes -- and it is the whole difference
    // between a view that is themed and one that happened to match at startup.
    this.registerEvent(this.app.workspace.on("css-change", () => this.syncTheme()));

    const t0 = performance.now();
    this.api = mountVaultGraph(page, data, {
      // Real module imports, not globals: the UMD wrappers take their `module.exports`
      // branch under esbuild, so nothing is ever assigned to `window`. This is exactly why
      // page.js takes its libraries as arguments.
      Graph: graphology.Graph || graphology,
      Sigma: sigma.Sigma || sigma,
      rendering: sigma.rendering || {},
      logoMask: "data:image/png;base64," + LOGO_MASK_B64,
    });
    this.mountMs = Math.round(performance.now() - t0);

    // The page renders `obsidian://open?...` links for each note. Following the URI would
    // work, but openLinkText is the thing that respects panes, history and modifier keys --
    // and it does not need the vault name, which the URI form has to guess at.
    this.registerDomEvent(page, "click", (ev) => {
      const a = ev.target instanceof Element ? ev.target.closest('a[href^="obsidian://"]') : null;
      if (!a) return;
      ev.preventDefault();
      try {
        const q = new URLSearchParams(a.getAttribute("href").split("?")[1] || "");
        const file = q.get("file");
        if (file) this.app.workspace.openLinkText(file, "", false);
      } catch { new Notice("Could not open that note."); }
    });
  }
}

/* ==================================================================== plugin ==*/

const DEFAULTS = {
  ghosts: false,        // --ghosts
  templates: false,     // --templates
  flatMonths: false,    // --flat-months
  words: true,          // the one field that still costs I/O
};

class VaultGraphPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());

    this.registerView(VIEW_TYPE, (leaf) => new VaultGraphView(leaf, this));

    // Registered before anything asks for it: the ribbon button and the view tab both
    // resolve the id at creation time, and an unknown id renders as an empty box.
    addIcon(ICON_ID, discIcon());

    this.addRibbonIcon(ICON_ID, "Vault graph", () => this.activate());

    this.addCommand({
      id: "open",
      name: "Open the graph",
      callback: () => this.activate(),
    });

    this.addCommand({
      id: "rebuild",
      name: "Rebuild from the metadata cache",
      callback: async () => {
        const view = this.currentView();
        if (!view) { new Notice("Open the graph first."); return; }
        await view.render();
      },
    });

    // Diagnostics, for the CDP harness and for anyone wondering where the time went.
    // No console.log: "avoid unnecessary logging" is a guideline and the linter enforces
    // it, and nothing was ever reading the log.
    this.addCommand({
      id: "report",
      name: "Report diagnostics",
      callback: () => {
        const view = this.currentView();
        if (!view) { new Notice("Open the graph first."); return; }
        const api = view.api;
        const report = {
          mount: "in-dom",
          mountMs: view.mountMs,
          hasApi: !!api,
          order: api && api.graph ? api.graph.order : 0,
          size: api && api.graph ? api.graph.size : 0,
          canvases: view.contentEl.querySelectorAll("#vg-graph canvas").length,
          planParity: api && api.checkPlanParity ? api.checkPlanParity() : null,
          build: view.lastData && view.lastData._spike,
          stats: view.lastData && view.lastData.stats,
        };
        window.__vgSpikeReport = report;
        new Notice("Diagnostics ready.");
        return report;
      },
    });
  }

  // Guidelines: don't hold a reference to the view, and don't detach leaves in onunload.
  currentView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    return leaves.length ? leaves[0].view : null;
  }

  async activate() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) { this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}

export default VaultGraphPlugin;
