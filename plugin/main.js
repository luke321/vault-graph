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

import { Plugin, ItemView, Notice, PluginSettingTab, Setting, normalizePath, addIcon } from "obsidian";

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
// When a note was written. The SAME module build-graph.mjs uses -- the two crawls stay
// separate on purpose, the date rule does not. github#6
import { localDay, resolveCreated, dateTally } from "../src/dates.mjs";
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
  const dates = dateTally();        // how each note got dated; reported in stats

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
    // Frontmatter, then a date at the front of the filename, then the file's own creation
    // stamp -- the same chain build-graph.mjs walks, from the same module. `file.stat` is
    // Obsidian's own cached stat, so this costs nothing and needs no read. github#6
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
      // Where every note's date came from. Surfaced by the "Report diagnostics" command,
      // so "why is everything undated" is answerable without a rebuild. github#6
      dates: dates,
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
    // A HANDLE, not the api. mountVaultGraph returns before its deferred init has built
    // the api, so anything captured here would be null forever -- and null reads exactly
    // like "no api" to every guard below, which is how the theme repaint, the renderer
    // teardown and the diagnostics all became silent no-ops together.
    this.handle = null;
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
    const api = this.handle && this.handle.api;
    if (api && api.renderer) {
      try { api.renderer.kill(); } catch { /* already gone */ }
    }
    this.handle = null;
    this.contentEl.empty();
  }

  // activeDocument, not document: a view torn out into a popout window lives in a different
  // document, and reading the main window's theme there gives the wrong answer.
  syncTheme() {
    if (!this.page) return;
    const want = activeDocument.body.classList.contains("theme-light") ? "light" : "dark";
    if (this.page.getAttribute("data-theme") === want) return;
    this.page.setAttribute("data-theme", want);

    // READ THE PALETTE AGAIN FIRST. The page snapshots its colours into one object at init,
    // so the attribute alone restyles the DOM and leaves every canvas colour behind -- the
    // disc keeps the old theme's node and edge colours. That is subtle in one direction and
    // ugly in the other: dark-theme edges are near-black, and on a white background they
    // read as a hard grey scribble over the whole disc rather than as faint connections.
    //
    // Then repaint: the renderer only draws when asked, and the logo and heatmap band paint
    // from `afterRender`, so a refresh carries them along.
    const api = this.handle && this.handle.api;
    if (api) {
      try {
        if (api.readTheme) api.readTheme();
        if (api.renderer) api.renderer.refresh();
        if (api.placeLogo) api.placeLogo();
        if (api.heatBuild) api.heatBuild();
      } catch { /* a half-built view is not worth an exception here */ }
    } else {
      // Still initialising. It will mount with the current theme anyway, because render()
      // sets the attribute before calling mountVaultGraph.
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
    this.handle = mountVaultGraph(page, data, {
      // Real module imports, not globals: the UMD wrappers take their `module.exports`
      // branch under esbuild, so nothing is ever assigned to `window`. This is exactly why
      // page.js takes its libraries as arguments.
      Graph: graphology.Graph || graphology,
      Sigma: sigma.Sigma || sigma,
      rendering: sigma.rendering || {},
      logoMask: "data:image/png;base64," + LOGO_MASK_B64,
      // The saved per-folder and per-subfolder palette slots, and visibility defaults.
      folderColors: this.plugin.settings.folderColors,
      subfolderColors: this.plugin.settings.subfolderColors,
      // COLOURS GET A WRITER, unlike folderShown below: the settings tab is no longer
      // the only place a pick can happen, since #22 put a right-click menu in the view
      // itself, and a pick made there has nowhere else to be saved. Mirrors the
      // settings tab's own pick()/pickSub(), which write the same two settings keys and
      // then push into the view through applyFolderColors()/applySubfolderColors() --
      // neither of which calls this callback, so there is no write-back loop between
      // the two paths.
      onFolderColors: async (map) => {
        this.plugin.settings.folderColors = map;
        await this.plugin.saveSettings();
      },
      onSubfolderColors: async (map) => {
        this.plugin.settings.subfolderColors = map;
        await this.plugin.saveSettings();
      },
      // Visibility defaults have no view-side control to write back from -- the eye in
      // the settings tab is still the only way to change one -- so this stays read-only.
      folderShown: this.plugin.settings.folderShown,
      // Pan DOES get a writer, unlike the two maps above: the control that flips it is in
      // the view rather than in the settings tab, so the view is what has to persist it.
      panEnabled: this.plugin.settings.panEnabled,
      onPanEnabled: async (v) => {
        this.plugin.settings.panEnabled = !!v;
        await this.plugin.saveSettings();
      },
      // Compact date axis (github#23) DOES get a writer, same reasoning as pan just above
      // -- it has its own view-level icon now (beside the date range, since the gear on
      // this host leads to Obsidian's settings tab, not an in-view panel), so the view is
      // what has to persist a click there. The settings-tab toggle below saves and pushes
      // live itself either way, same as it already does for pan.
      compactAxis: this.plugin.settings.compactAxis,
      onCompactAxis: async (v) => {
        this.plugin.settings.compactAxis = !!v;
        await this.plugin.saveSettings();
      },
      // The hub, for the same reason pan gets a writer: it is changed in the view, by
      // right-clicking a note or dragging one into the middle, so the view is what has to
      // persist it. Not in the settings tab either -- "which notes are in the hub" is a
      // thing you point at, not a thing you type.
      pinned: this.plugin.settings.pinned,
      onPinned: async (ids) => {
        this.plugin.settings.pinned = ids;
        await this.plugin.saveSettings();
      },
      // The gear IS shown here -- it is where somebody looking at the disc goes to look
      // for the colours -- but it opens Obsidian's settings tab rather than a second
      // panel inside the view saying the same things. `settingsUI` is deliberately not
      // set: that is the standalone's mode, where nothing else can hold a setting.
      openSettings: () => this.plugin.openSettings(),
      // The window this view is actually in. A view dragged out into a popout must schedule
      // its timers and animation frames there, not on the main window -- which is what
      // obsidianmd/prefer-active-window-timers is about. The standalone page passes nothing
      // and gets its own window, because `activeWindow` is an Obsidian global.
      win: activeWindow,
      // What the standalone page cannot do. There the data is baked into the file, so
      // Refresh can only reset filters and replay -- and it was reported, fairly, as a
      // button that does not pick up new files (github#6). Here the vault is right
      // there: render() tears this view down, rebuilds from the metadata cache and
      // mounts again, so the button means what its label says.
      //
      // Guarded, because a rebuild triggered from inside the mount it is about to
      // destroy will re-enter if the user leans on it. render() is async and the click
      // handler cannot await it.
      onRefresh: () => {
        if (this.rebuilding) return;
        this.rebuilding = true;
        this.render()
          .catch((e) => new Notice("Vault Graph: rebuild failed -- " + e.message))
          // Cleared on the NEW view state, not the old one: render() replaces
          // this.handle, and the flag lives on the view rather than the mount.
          .finally(() => { this.rebuilding = false; });
      },
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
  // folder name -> palette slot key ("g7"). A SLOT, not a hex: the palette has separate
  // light and dark values, so a saved hex would be right in one Obsidian theme and wrong
  // in the other. Empty means every folder takes the slot its position gives it.
  folderColors: {},
  // "folder/sub" -> palette slot key, one level down. Same slot-not-hex reasoning, and
  // the same "" means the automatic tint -- which for a subfolder is a computed shade,
  // never one of the twelve slots, so there is nothing to fall back to but the ladder.
  subfolderColors: {},
  // folder name -> true (shown) / false (hidden), as a DEFAULT. Absent means the `_` rule
  // decides: a folder whose name starts with an underscore is an archive, so it is out of
  // the colour rotation, grey, and hidden until somebody says otherwise.
  folderShown: {},
  // Note ids pinned into the hub, in slot order. Empty means the mark is in the middle,
  // which is the state the graph has always opened in. The plugin rebuilds in place, so
  // these are re-checked against the graph on every mount -- a renamed or deleted note
  // drops out rather than holding a slot nothing can fill.
  pinned: [],
  // Drag-to-pan in the view. ON by default: the rim of a big vault is unreachable without
  // it, and the corner control is a cheaper way to discover that than a settings tab is.
  // Held here so a vault where dragging gets in the way can start locked.
  panEnabled: true,
  // Weight the date strip's years and months by note count instead of giving every one
  // equal width, so a sparse decade doesn't cost the same room as one busy year. ON by
  // default -- the better axis should not need anyone to find a toggle first (github#23).
  compactAxis: true,
};

// The four build settings, described once. They live here rather than inline in display()
// so the tab is a list of what exists rather than 60 lines of chained calls.
const BUILD_SETTINGS = [
  { key: "ghosts", name: "Include notes that do not exist yet",
    desc: "Wikilinks pointing at a note nobody has written. They are intentions rather than notes, so they are off by default." },
  { key: "templates", name: "Include templates",
    desc: "Notes under the template folders. Off by default: a template links to nothing and is linked from nothing, so it lands in the hub as noise." },
  { key: "flatMonths", name: "Flatten month folders",
    desc: "Treat 2026-08 and its siblings as one folder rather than as a subfolder each. Turn this on if a year of daily notes is drowning its parent's legend row." },
  { key: "words", name: "Count words",
    desc: "Sizes each note by its length. The one setting that costs real I/O: it reads every file rather than answering from the metadata cache." },
];

// MUST MATCH src/page.js's SLOT_NAMES: ten hues, then two greys. Kept as a copy rather
// than imported because page.js keeps every name inside mountVaultGraph, and it has to --
// the standalone build turns that module into a plain <script>, where anything at module
// scope would become a browser global.
const SLOT_NAMES = ["Blue", "Orange", "Aqua", "Yellow", "Green", "Magenta",
                    "Violet", "Red", "Cyan", "Orchid", "Grey", "Slate"];

// Same rule as page.js's isArchiveGroup, and a copy for the same reason. A leading
// underscore means archive: out of the colour rotation, grey, hidden by default.
const isArchiveGroup = (name) => String(name).charAt(0) === "_";
// ...and the slot it lands on, matching ARCHIVE_SLOT in page.js. g11 of the two greys:
// the lower-contrast one against the surface in both themes, which is what recede means.
const ARCHIVE_SLOT = "g11";

// The folders the graph will group by, in the order it will lay them out: first path
// segment, "(vault root)" for a note sitting loose at the top. Sorted exactly as
// computeOrder does it, so the third row here is the third wedge on the disc.
//
// Derived from the vault rather than read off an open view, because the settings tab has
// to work with no graph open. One knowing difference from buildData: templates are not
// filtered out, which needs an async folder read. It only matters for a vault whose
// template folder is a TOP-LEVEL one, and then it shows a row that colours nothing.
function topFolders(app) {
  const count = new Map();
  for (const file of app.vault.getMarkdownFiles()) {
    if (SKIP_FILES.has(file.name.toLowerCase())) continue;
    const g = paraFolder(file.path);
    count.set(g, (count.get(g) || 0) + 1);
  }
  // Same three ranks as computeOrder in page.js: archives, then the pseudo-folders, then
  // the folders the vault actually filed. A copy for the same reason SLOT_NAMES is one.
  const rank = (s) => (s.charAt(0) === "_" ? 0 : s.charAt(0) === "(" ? 1 : 2);
  return Array.from(count.entries())
    .sort((a, b) => rank(a[0]) - rank(b[0]) ||
                    a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([name, n]) => ({ name, n }));
}

// As topFolders, one level down: every depth-1 subfolder of EVERY top folder, in one
// pass over the vault rather than one per folder -- a per-folder version was tried
// first and rescanned app.vault.getMarkdownFiles() once per row renderColours draws,
// which is O(folders x files) on every render of the settings tab. Reuses paraDirs --
// the same helper buildData calls -- rather than reparsing paths a second way. Same
// no-view-open role as topFolders: the settings tab needs this before any graph has
// been opened, and there is nothing for refreshFromView to correct it against once one
// has (see renderColours' own comment on why).
function allSubfolders(app, flatMonths) {
  const byFolder = new Map();
  for (const file of app.vault.getMarkdownFiles()) {
    if (SKIP_FILES.has(file.name.toLowerCase())) continue;
    const g = paraFolder(file.path);
    let count = byFolder.get(g);
    if (!count) byFolder.set(g, count = new Map());
    const sb = paraDirs(file.path, flatMonths)[0] || "";
    count.set(sb, (count.get(sb) || 0) + 1);
  }
  // Same tie-break subOrder uses in page.js: biggest first, plain name compare (no
  // {numeric:true} -- that is topFolders' own choice for top-level folder names, not
  // subOrder's).
  const out = new Map();
  for (const [g, count] of byFolder) {
    out.set(g, Array.from(count.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, n]) => ({ name, n })));
  }
  return out;
}

class VaultGraphSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    // Which folders' subfolder rows are expanded. Tab-local UI state, not settings -- it
    // does not need to survive a restart, only a re-render, so it lives here rather than
    // in this.plugin.settings. display() rebuilds the whole tab but never touches this,
    // which is the point: a pick calls this.display() too, and reopening after a click
    // must not collapse the section the click was made in.
    this.subOpen = {};
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    for (const s of BUILD_SETTINGS) {
      new Setting(containerEl)
        .setName(s.name)
        .setDesc(s.desc)
        .addToggle((t) => t
          .setValue(!!this.plugin.settings[s.key])
          .onChange(async (v) => {
            this.plugin.settings[s.key] = v;
            await this.plugin.saveSettings();
            // These four change what is IN the graph, so the view is built again.
            // A colour, below, only repaints.
            await this.plugin.rebuildViews();
          }));
    }

    // VIEW, not build: it changes how you look rather than what you see, so it applies
    // live through the api and never rebuilds. Same reasoning as the curve switch.
    //
    // The toggle and the corner control write the SAME setting, which is the point -- the
    // button is how you find the feature and this is where the default lives. Reading
    // `!== false` rather than a plain truthiness keeps "absent means on" true here too, so
    // a settings file written before this existed shows the toggle on.
    new Setting(containerEl).setName("View").setHeading();

    new Setting(containerEl)
      .setName("Drag to pan")
      .setDesc("Drag the graph to move it, and zoom toward the pointer. Off pins the disc to the centre of the view. The control in the graph's bottom-right corner flips it too, and lands back here.")
      .addToggle((t) => t
        .setValue(this.plugin.settings.panEnabled !== false)
        .onChange(async (v) => {
          this.plugin.settings.panEnabled = v;
          await this.plugin.saveSettings();
          const view = await this.plugin.currentView();
          const api = view && view.handle && view.handle.api;
          if (api && api.setPanEnabled) api.setPanEnabled(v);
        }));

    new Setting(containerEl)
      .setName("Compact date axis")
      .setDesc("Give each year on the date strip width by how many notes it holds, instead of every year and month reading the same width regardless of content.")
      .addToggle((t) => t
        .setValue(this.plugin.settings.compactAxis !== false)
        .onChange(async (v) => {
          this.plugin.settings.compactAxis = v;
          await this.plugin.saveSettings();
          const view = await this.plugin.currentView();
          const api = view && view.handle && view.handle.api;
          if (api && api.setCompactAxis) api.setCompactAxis(v);
        }));

    new Setting(containerEl).setName("Folder colours").setHeading();

    new Setting(containerEl)
      .setDesc("Twelve slots, handed out in folder order and round again. Setting one folder never moves another, and two folders may share a colour.")
      .addButton((b) => b
        .setButtonText("Reset all")
        .setTooltip("Also drops every subfolder override")
        .onClick(async () => {
          // BOTH MAPS, not just folderColors -- "Reset all" under a "Folder colours"
          // heading that now covers subfolders too should not leave a subfolder pin
          // behind for the user to go find and clear by hand.
          this.plugin.settings.folderColors = {};
          this.plugin.settings.subfolderColors = {};
          await this.plugin.saveSettings();
          await this.plugin.applyFolderColors();
          await this.plugin.applySubfolderColors();
          this.display();
        }));

    // THE PALETTE TOKENS LIVE ON .vault-graph, and this pane is not inside one. The
    // wrapper carries that class so `var(--g7)` resolves here; `vg-tokens` turns off the
    // page's own grid layout, which comes with the class and is not wanted in a settings
    // pane. Nothing in this file knows a single hex.
    const scope = containerEl.createDiv({ cls: ["vault-graph", "vg-tokens"] });

    // AND IT NEEDS THE THEME, for the same reason the view does -- page.css carries a
    // light palette and a dark one, and picks between them on this attribute. Without it
    // the wrapper falls through to prefers-color-scheme, which is the OS's answer to a
    // question only Obsidian can answer: a light OS running a dark Obsidian would show
    // twelve light-theme swatches in a dark settings pane, none of them the colour the
    // disc is actually painting. Same source as VaultGraphView.syncTheme.
    scope.setAttribute("data-theme",
      activeDocument.body.classList.contains("theme-light") ? "light" : "dark");

    this.scope = scope;
    // Archives are skipped in the rotation here too, or the fallback would disagree with
    // the disc about which slot every folder after an archive is on. Hence the separate
    // counter -- the same reason buildColors has one.
    let auto = 0;
    // `slot` doubles as `autoSlot` here: this list is path-derived and never consults
    // settings.folderColors, so what it computes already IS the automatic guess -- there
    // is no override applied yet for autoSlot to differ from.
    this.renderColours(topFolders(this.app).map((f) => {
      const s = isArchiveGroup(f.name) ? ARCHIVE_SLOT : "g" + ((auto++ % SLOT_NAMES.length) + 1);
      return { name: f.name, n: f.n, slot: s, autoSlot: s };
    }));

    // ...and then ask the graph itself, which is the only thing that actually knows.
    //
    // The list above is derived from paths, and the disc's is not quite: a note with no
    // links at all is grouped under "(unlinked)" rather than under its folder, so a vault
    // with unlinked notes has one group here that no path produces -- and since the
    // automatic slot is decided by POSITION in that list, every folder after it would be
    // marked one slot out. Close enough to look right and wrong on exactly the vaults
    // that have orphans.
    //
    // A view can only be reached asynchronously and display() cannot wait, so the
    // path-derived list renders first and this corrects it. With no view open there is
    // nothing to correct against, and the fallback is what stands.
    this.refreshFromView();
  }

  // Re-render the colour rows from the live graph's own grouping and colours.
  async refreshFromView() {
    const scope = this.scope;
    const view = await this.plugin.currentView();
    const api = view && view.handle && view.handle.api;
    if (!api || !api.groupOrder || !api.palette || !scope || !scope.isConnected) return;

    // api.slotOf, not a hex lookup against the palette. An archive folder is on NO slot --
    // it takes a neutral, which is deliberately not one of the twelve -- so matching by
    // colour returns nothing for it, and the first version filtered those rows out
    // entirely. The archives were the rows most in need of the eye.
    const groups = api.groupOrder().map((name) => ({
      name,
      n: api.groupCount(name),
      slot: api.slotOf ? api.slotOf(name) : "",
      autoSlot: api.autoSlotOf ? api.autoSlotOf(name) : "",
    }));
    if (groups.length) this.renderColours(groups);
  }

  // One row per group: its name, its note count, and the twelve slots.
  //
  // `slot` is the slot the group is CURRENTLY USING, whether or not anybody chose it.
  // Marking only the chosen one meant a folder on Auto -- every folder, until somebody
  // changes something -- had no mark anywhere, so the panel showed twelve colours and
  // would not say which of them the folder was.
  renderColours(groups) {
    const scope = this.scope;
    scope.empty();
    if (!groups.length) {
      scope.createEl("p", { text: "No folders to colour yet." });
      return;
    }

    // ONE SCAN FOR THE WHOLE RENDER, not one per group -- see allSubfolders' own
    // comment. Path-derived, not from the live api: unlike a top-level folder, a
    // subfolder's identity never needs an open view to resolve (there is no
    // "(unlinked)"-style group at this level), so there is nothing for refreshFromView
    // to correct here. The one thing the live api could add is a note count adjusted
    // for ghosts/templates, which is not worth a second async round trip for a
    // settings pane.
    const subsByFolder = allSubfolders(this.app, this.plugin.settings.flatMonths);

    for (const group of groups) {
      const pinned = this.plugin.settings.folderColors[group.name] || "";
      const current = pinned || group.slot;
      const shown = this.shownByDefault(group.name);
      const subs = subsByFolder.get(group.name) || [];
      // A PIN BYPASSES THE SIZE GATE -- mirrors page.js's own groupHasPinnedSub. Without
      // it, pinning a folder's one differentiated subfolder and then letting it shrink
      // to a single subfolder (notes moved elsewhere) makes the twisty vanish here with
      // the pin still silently in effect and no remaining control in this tab to clear
      // it short of "Reset all", which drops every override in the vault.
      const hasPin = subs.some((s) => this.plugin.settings.subfolderColors[group.name + "/" + s.name]);
      const hasSubs = subs.length > 1 || hasPin;
      const open = hasSubs && !!this.subOpen[group.name];

      // The eye comes FIRST (after the twisty, when there is one), because "am I
      // looking at this folder at all" comes before what colour it is. Obsidian's own
      // `eye` / `eye-off` icons through an extra button, rather than a glyph of our
      // own: it is the mark the rest of the app uses for exactly this, it comes with
      // the hover and focus treatment for free, and it stays right if Obsidian
      // restyles its icons.
      //
      // It sets a DEFAULT. The legend's eye inside the graph is the live filter; this
      // is what the disc comes back to.
      const row = new Setting(scope)
        .setName(group.name)
        .setDesc((group.n === 1 ? "1 note" : group.n + " notes") +
                 (shown ? "" : " · hidden by default"));
      if (hasSubs) {
        row.addExtraButton((b) => b
          .setIcon(open ? "chevron-down" : "chevron-right")
          .setTooltip(open ? "Hide subfolder colours" : "Subfolder colours")
          .onClick(() => {
            this.subOpen[group.name] = !open;
            this.renderColours(groups);
          }));
      }
      row.addExtraButton((b) => b
        .setIcon(shown ? "eye" : "eye-off")
        .setTooltip(shown ? "Shown by default" : "Hidden by default")
        .onClick(() => this.pickVisible(group.name)));
      row.controlEl.addClass("sws");

      SLOT_NAMES.forEach((name, i) => {
        const key = "g" + (i + 1);
        const on = current === key;
        // The slot with no override at all -- distinct from `current` exactly when the
        // folder is pinned to something else, and marked regardless of `on` so it stays
        // visible after a pin. Before this, the mark and the checked ring were the same
        // fact and a pin erased the only trace of what Auto would give back.
        const isAuto = group.autoSlot === key;
        const attr = {
          role: "radio", "aria-checked": String(on), "aria-label": name,
          title: name + (on ? (pinned ? " (chosen)" : " (automatic)") :
                         (isAuto ? " (automatic default)" : "")),
        };
        if (isAuto) attr["data-auto"] = "1";
        const b = row.controlEl.createEl("button", { cls: ["swatch", "vg-" + key], attr });
        b.addEventListener("click", () => this.pick(group.name, key));
      });

      const auto = row.controlEl.createEl("button", {
        cls: "auto", text: "Auto",
        attr: { "aria-pressed": String(!pinned),
                title: "Back to the slot this folder gets automatically" },
      });
      auto.addEventListener("click", () => this.pick(group.name, null));

      if (open) this.renderSubRows(scope, group.name, subs);
    }
  }

  // One row per subfolder, indented (see .vg-subrow in styles.css). Same twelve
  // swatches a folder row gets, but NEVER marking one "current" while unpinned: unlike
  // a folder, a subfolder's automatic colour is a computed tint, not one of the twelve
  // slot hexes, so there is nothing among them to ring -- exactly the same distinction
  // page.js's own settings panel draws for the same reason. Only the Auto button's own
  // pressed state says "this one is automatic".
  renderSubRows(scope, folder, subs) {
    for (const s of subs) {
      const pk = folder + "/" + s.name;
      const pinned = this.plugin.settings.subfolderColors[pk] || "";
      const row = new Setting(scope)
        .setName(s.name || "(directly in folder)")
        .setDesc(s.n === 1 ? "1 note" : s.n + " notes");
      row.settingEl.addClass("vg-subrow");
      row.controlEl.addClass("sws");

      SLOT_NAMES.forEach((name, i) => {
        const key = "g" + (i + 1);
        const on = pinned === key;
        const b = row.controlEl.createEl("button", {
          cls: ["swatch", "vg-" + key],
          attr: { role: "radio", "aria-checked": String(on), "aria-label": name,
                  title: name + (on ? " (chosen)" : "") },
        });
        b.addEventListener("click", () => this.pickSub(folder, s.name, key));
      });

      const auto = row.controlEl.createEl("button", {
        cls: "auto", text: "Auto",
        attr: { "aria-pressed": String(!pinned), title: "Back to the automatic tint" },
      });
      auto.addEventListener("click", () => this.pickSub(folder, s.name, null));
    }
  }

  // Shown unless something says otherwise: an explicit choice first, then the `_` rule.
  // Mirrors hiddenByDefault in page.js.
  shownByDefault(folder) {
    const saved = this.plugin.settings.folderShown[folder];
    if (typeof saved === "boolean") return saved;
    return !isArchiveGroup(folder);
  }

  // Flip one folder's DEFAULT visibility. Written as an explicit boolean rather than by
  // deleting the key, so "shown, and I said so" survives a later change to what the `_`
  // rule does.
  async pickVisible(folder) {
    const map = Object.assign({}, this.plugin.settings.folderShown);
    map[folder] = !this.shownByDefault(folder);
    this.plugin.settings.folderShown = map;
    await this.plugin.saveSettings();
    await this.plugin.applyHiddenDefaults();
    this.display();
  }

  // One folder's slot. `key` null clears the override. Nothing else in the map is
  // touched -- two folders may hold the same slot on purpose.
  async pick(folder, key) {
    const map = Object.assign({}, this.plugin.settings.folderColors);
    if (key) map[folder] = key; else delete map[folder];
    this.plugin.settings.folderColors = map;
    await this.plugin.saveSettings();
    await this.plugin.applyFolderColors();
    this.display();
  }

  // As pick(), one level down. this.display() re-collapses nothing -- see this.subOpen
  // in the constructor -- so the section this pick was made in stays open.
  async pickSub(folder, sub, key) {
    const map = Object.assign({}, this.plugin.settings.subfolderColors);
    const pk = folder + "/" + sub;
    if (key) map[pk] = key; else delete map[pk];
    this.plugin.settings.subfolderColors = map;
    await this.plugin.saveSettings();
    await this.plugin.applySubfolderColors();
    this.display();
  }
}

class VaultGraphPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new VaultGraphSettingTab(this.app, this));

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
        const view = await this.currentView();
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
      callback: async () => {
        const view = await this.currentView();
        if (!view) { new Notice("Open the graph first."); return; }
        const api = view.handle && view.handle.api;
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
  //
  // The `instanceof` is NOT belt and braces, and neither is the await. Since 1.7.2 a leaf
  // restored from a saved workspace is DEFERRED: the leaf is real and getLeavesOfType finds
  // it, but until something reveals it `leaf.view` is a DeferredView placeholder rather than
  // this plugin's view. Handing that placeholder back made "Rebuild" a TypeError -- the stub
  // has no `render` -- and made the diagnostics report say hasApi:false about a graph that
  // was perfectly fine. Both read as bugs in the graph, and neither is.
  async currentView() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      await leaf.loadIfDeferred();
      if (leaf.view instanceof VaultGraphView) return leaf.view;
    }
    return null;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Open this plugin's own settings tab, for the gear in the view.
  //
  // `app.setting` is NOT in the public API. It is what every plugin uses for this, because
  // there is nothing else -- there is no documented "open my settings tab" -- so it is
  // guarded at both steps and falls back to telling the user where to click rather than
  // throwing inside a click handler. If a future Obsidian drops it, the gear degrades to a
  // signpost instead of doing nothing.
  openSettings() {
    const setting = this.app.setting;
    if (!setting || typeof setting.open !== "function") {
      // Worded to survive obsidianmd/ui/sentence-case, which flags any capitalised word
      // mid-string -- and its suggested fix lowercased the plugin's own name.
      new Notice("Open the plugin's settings tab from the community plugins list.");
      return;
    }
    setting.open();
    if (typeof setting.openTabById === "function") setting.openTabById(this.manifest.id);
  }

  // A COLOUR CHANGE REPAINTS. It does not rebuild, and the difference is the whole
  // reason setFolderColors exists on the page's api: colour is not an input to the
  // layout, so going through render() would throw away a settled disc and replay the
  // reveal animation because somebody clicked a swatch.
  async applyFolderColors() {
    const view = await this.currentView();
    const api = view && view.handle && view.handle.api;
    if (api && api.setFolderColors) api.setFolderColors(this.settings.folderColors);
  }

  // As applyFolderColors, one level down.
  async applySubfolderColors() {
    const view = await this.currentView();
    const api = view && view.handle && view.handle.api;
    if (api && api.setSubfolderColors) api.setSubfolderColors(this.settings.subfolderColors);
  }

  // Visibility defaults changed: push them into the live filter and let the notes fade.
  // Like a colour, this repaints rather than rebuilding -- the notes are all still in the
  // graph, they are just not being drawn.
  async applyHiddenDefaults() {
    const view = await this.currentView();
    const api = view && view.handle && view.handle.api;
    if (!api || !api.setFolderShown) return;
    api.setFolderShown(this.settings.folderShown);
    if (api.setPanEnabled) api.setPanEnabled(this.settings.panEnabled !== false);
    if (api.setCompactAxis) api.setCompactAxis(this.settings.compactAxis !== false);
    if (api.applyHiddenDefaults) api.applyHiddenDefaults();
  }

  // The four build settings DO change the data, so they get the full path.
  async rebuildViews() {
    const view = await this.currentView();
    if (view) await view.render();
  }

  // `revealLeaf` is awaited on purpose: since 1.7.2 it resolves once the view is really
  // loaded rather than merely fronted, which is the difference between a tab that shows a
  // graph and a tab that shows nothing until you click it.
  async activate() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) { await this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}

export default VaultGraphPlugin;
