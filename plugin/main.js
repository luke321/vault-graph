/**
 * Vault Graph -- SPIKE. Not a submission candidate; see plugin/SPIKE.md.
 *
 * Answers three questions and nothing else:
 *
 *   1. Does template.html run unchanged inside Obsidian?        -> the mount strategies
 *   2. Can Obsidian's own index produce window.VAULT_DATA?      -> buildData()
 *   3. Can the invariant suite still reach __vg from out here?  -> the probe bridge
 *
 * Deliberately hand-written CommonJS: no esbuild, no node_modules, so the spike keeps
 * the property the repo is proud of. A REAL plugin cannot -- it has to bundle sigma and
 * graphology from npm rather than string-replacing vendored minified files into a
 * template -- and that is a finding, not an oversight.
 *
 * The page is hosted in an IFRAME, which is what makes this a spike rather than a port:
 * the template is a whole HTML document (doctype, head, 422 lines of :root tokens) and
 * an iframe is the one container that takes it verbatim. The costs of that choice are
 * measured rather than guessed -- see SPIKE.md.
 */
"use strict";

const { Plugin, ItemView, Notice, normalizePath, arrayBufferToBase64, addIcon } = require("obsidian");

const VIEW_TYPE = "vault-graph-spike";
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

// How long a mount strategy gets to say "ready" before it is called dead. The page posts
// its handshake from the END of its own boot, so this measures "did the whole thing come
// up", not "did the iframe load".
const HANDSHAKE_MS = 6000;

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

const deNumber = (s) => String(s).replace(/^[\s\d._)\-]+/, "").trim();
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
  } catch (e) {
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
        const m = /^---\r?\n[\s\S]*?\r?\n---/.exec(raw.replace(/^﻿/, ""));
        const body = m ? raw.slice(m[0].length) : raw;
        n.words = body.split(/\s+/).filter(Boolean).length;
      } catch (e) { n.words = 0; }
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

/* ============================================================ page assembly ==
 * Exactly the three seams build-graph.mjs uses -- <!--LIBS-->, <!--ASSETS-->,
 * <!--DATA--> -- which is the whole reason an iframe spike is cheap. Nothing in
 * template.html changes.
 *
 * Plus two spike-only injections that a real port would not carry:
 *   - a pre-script at the ASSETS seam, so a boot-time throw is reported rather than
 *     silently timing out the handshake;
 *   - a bridge before </body>, which posts "ready", forwards obsidian:// clicks to the
 *     host, and answers probe requests.
 */
const PRE_SCRIPT = [
  "<script>",
  "(function () {",
  "  var post = function (m) { try { parent.postMessage(m, '*'); } catch (e) {} };",
  "  window.addEventListener('error', function (e) {",
  "    post({ vgSpike: 'error', message: String(e.message), line: e.lineno || 0 });",
  "  });",
  "  window.addEventListener('unhandledrejection', function (e) {",
  "    post({ vgSpike: 'error', message: 'unhandled rejection: ' + String(e.reason), line: 0 });",
  "  });",
  "})();",
  "</script>",
].join("\n");

const BRIDGE = [
  "<script>",
  "(function () {",
  "  var post = function (m) { try { parent.postMessage(m, '*'); } catch (e) {} };",
  "  var D = window.VAULT_DATA || {};",
  "  // WAIT FOR __vg, do not just read it. Measured: this script runs at the end of the",
  "  // document, which is BEFORE the template has finished booting -- sigma is",
  "  // constructed later, off the boot path. The first version reported hasVg:false and",
  "  // canvases:0 and the verdict table called a working page broken, while a probe two",
  "  // seconds later found 11 nodes and plan parity OK. So the handshake polls, and says",
  "  // how long it waited.",
  "  var t0 = Date.now();",
  "  var tick = function () {",
  "    var canvases = document.querySelectorAll('#graph canvas').length;",
  "    var up = !!window.__vg && canvases > 0;",
  "    if (!up && Date.now() - t0 < 5000) { setTimeout(tick, 100); return; }",
  "    post({ vgSpike: 'ready',",
  "           nodes: (D.nodes || []).length,",
  "           edges: (D.edges || []).length,",
  "           hasVg: !!window.__vg,",
  "           canvases: canvases,",
  "           bootMs: Date.now() - t0 });",
  "  };",
  "  tick();",
  "  // obsidian:// hrefs cannot navigate from inside a sandboxed frame, and should not:",
  "  // the host has workspace.openLinkText, which respects panes and history.",
  "  document.addEventListener('click', function (ev) {",
  "    var a = ev.target && ev.target.closest ? ev.target.closest('a[href^=\"obsidian://\"]') : null;",
  "    if (!a) return;",
  "    ev.preventDefault();",
  "    post({ vgSpike: 'open', href: a.getAttribute('href') });",
  "  }, true);",
  "  // The probe channel. A sandboxed frame is a different origin, so the host cannot",
  "  // touch window.__vg directly -- it has to ask. This is the shape the invariant",
  "  // suite would use if the page stays in a frame.",
  "  window.addEventListener('message', function (ev) {",
  "    var m = ev.data;",
  "    if (!m || m.vgSpike !== 'probe') return;",
  "    var out = { vgSpike: 'probe-result', id: m.id, hasVg: !!window.__vg };",
  "    try {",
  "      if (window.__vg && window.__vg.checkPlanParity) out.planParity = window.__vg.checkPlanParity();",
  "      if (window.__vg && window.__vg.graph) {",
  "        out.order = window.__vg.graph.order; out.size = window.__vg.graph.size;",
  "      }",
  "    } catch (e) { out.error = String(e && e.message || e); }",
  "    post(out);",
  "  });",
  "})();",
  "</script>",
].join("\n");

async function assemblePage(plugin, data) {
  const dir = plugin.manifest.dir;
  const read = (rel) => plugin.app.vault.adapter.read(normalizePath(dir + "/" + rel));

  const template = await read("template.html");

  const libNames = ["graphology.umd.min.js", "sigma.min.js"];
  const libSrc = [];
  for (const name of libNames) libSrc.push("<script>\n" + (await read("vendor/" + name)) + "\n</script>");
  const libs = libSrc.join("\n");

  // The logo is optional -- a missing file means no mark, not a broken page, same as in
  // the Node builder. arrayBufferToBase64 is Obsidian's own helper; node's Buffer is not
  // available on mobile.
  let logoMask = "";
  try {
    const buf = await plugin.app.vault.adapter.readBinary(normalizePath(dir + "/assets/logo-mask.png"));
    logoMask = "data:image/png;base64," + arrayBufferToBase64(buf);
  } catch (e) { /* no logo, fine */ }

  const assets = PRE_SCRIPT +
    "\n<script>window.VAULT_LOGO_MASK=" + JSON.stringify(logoMask) + ";</script>";

  // The template hardcodes data-theme="dark" on <html>, deliberately (design/0009).
  // An iframe inherits nothing from Obsidian, so the host has to hand the theme over --
  // which is exactly the integration a real port would get for free by living in the
  // DOM. Doing it here proves the light path renders too.
  const theme = document.body.classList.contains("theme-light") ? "light" : "dark";

  return template
    .replace('<html lang="en" data-theme="dark">', '<html lang="en" data-theme="' + theme + '">')
    .replace("<!--LIBS-->", () => libs)
    .replace("<!--ASSETS-->", () => assets)
    .replace("<!--DATA-->", () => "<script>window.VAULT_DATA=" + JSON.stringify(data) + ";</script>")
    .replace("</body>", BRIDGE + "\n</body>");
}

/* ====================================================================== view ==*/

class VaultGraphView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.frame = null;
    this.blobUrl = null;
    this.ready = null;          // whatever the page reported at handshake
    this.strategy = null;       // which mount strategy won
    this.pending = new Map();   // probe id -> resolve
    this.probeSeq = 0;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Vault graph (spike)"; }
  getIcon() { return ICON_ID; }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("vault-graph-spike");

    this.status = root.createDiv({ cls: "vgs-status" });
    this.stage = root.createDiv({ cls: "vgs-stage" });

    // One listener for the lifetime of the view, registered so it unhooks on unload.
    this.registerDomEvent(window, "message", (ev) => this.onFrameMessage(ev));

    await this.reload();
  }

  async onClose() {
    this.teardownFrame();
  }

  teardownFrame() {
    if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = null; }
    if (this.frame) { this.frame.remove(); this.frame = null; }
  }

  say(text) {
    if (this.status) this.status.setText(text);
  }

  async reload() {
    this.teardownFrame();
    this.say("Building from the metadata cache...");

    const data = await buildData(this.app, this.plugin.settings);
    this.lastData = data;
    const s = data.stats, m = data._spike;
    this.say(s.nodes + " notes, " + s.edges + " links, " + s.orphans + " orphans, " +
             s.unresolved + " unresolved -- built in " + m.msTotal + "ms " +
             "(index " + m.msIndex + ", links " + m.msEdges + ", words " + m.msWords + ")");

    const html = await assemblePage(this.plugin, data);
    this.pageBytes = html.length;

    // Two strategies, in order, because which one Obsidian's CSP tolerates is precisely
    // what the spike is measuring. srcdoc first: it is sandboxable, so the page cannot
    // reach back into the app. forceStrategy pins one, so the harness can run both and
    // compare what each costs -- they differ in reachability, not just in posture.
    const order = this.plugin.settings.forceStrategy
      ? [this.plugin.settings.forceStrategy]
      : ["srcdoc", "blob"];
    for (const strategy of order) {
      const ready = await this.tryMount(html, strategy);
      if (ready) {
        this.strategy = strategy;
        this.ready = ready;
        this.say(this.status.getText() + " | mounted via " + strategy +
                 ", " + Math.round(html.length / 1024) + "KB, " +
                 ready.canvases + " canvases, __vg " + (ready.hasVg ? "present" : "MISSING"));
        return;
      }
      this.teardownFrame();
    }

    this.say("MOUNT FAILED -- neither srcdoc nor blob produced a handshake. " +
             (this.lastError || "no error reported"));
  }

  tryMount(html, strategy) {
    return new Promise((resolve) => {
      const frame = this.stage.createEl("iframe", { cls: "vgs-frame" });
      this.frame = frame;
      this.lastError = null;

      let done = false;
      const finish = (v) => { if (!done) { done = true; this.awaitingReady = null; resolve(v); } };
      this.awaitingReady = finish;
      window.setTimeout(() => finish(null), HANDSHAKE_MS);

      if (strategy === "srcdoc") {
        // No allow-same-origin: the frame gets an opaque origin and cannot touch the
        // app. That is the right posture, and it is also why the probe channel has to
        // exist -- see BRIDGE.
        frame.setAttribute("sandbox", "allow-scripts allow-popups");
        frame.srcdoc = html;
      } else {
        // A blob URL cannot be fetched by a frame with an opaque origin, so this path
        // runs UNSANDBOXED. Strictly worse posture; kept only as the fallback.
        this.blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        frame.src = this.blobUrl;
      }
    });
  }

  onFrameMessage(ev) {
    if (!this.frame || ev.source !== this.frame.contentWindow) return;
    const m = ev.data;
    if (!m || !m.vgSpike) return;

    if (m.vgSpike === "ready" && this.awaitingReady) { this.awaitingReady(m); return; }

    if (m.vgSpike === "error") {
      this.lastError = "page error: " + m.message + (m.line ? " (line " + m.line + ")" : "");
      console.error("[vault-graph-spike]", this.lastError);
      return;
    }

    if (m.vgSpike === "open") {
      // obsidian://open?vault=X&file=Y -- only the file matters; the host already knows
      // which vault it is. openLinkText beats the URI: it honours pane state and history.
      try {
        const q = new URLSearchParams(m.href.slice(m.href.indexOf("?") + 1));
        const file = q.get("file");
        if (file) this.app.workspace.openLinkText(file, "", false);
      } catch (e) { new Notice("Could not open that note: " + e.message); }
      return;
    }

    if (m.vgSpike === "probe-result") {
      const fn = this.pending.get(m.id);
      if (fn) { this.pending.delete(m.id); fn(m); }
      return;
    }
  }

  // Ask the page to run __vg.checkPlanParity() and hand the result back. This is the
  // shape scripts/smoke.mjs would have to take if the page stays in a frame.
  probe() {
    if (!this.frame || !this.frame.contentWindow) return Promise.resolve({ error: "no frame" });
    const id = ++this.probeSeq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      window.setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); resolve({ error: "probe timed out" }); }
      }, 4000);
      this.frame.contentWindow.postMessage({ vgSpike: "probe", id: id }, "*");
    });
  }

  // What the host can see WITHOUT asking. Under srcdoc+sandbox this must fail; the
  // failure is the finding, so it is reported rather than swallowed.
  reachIntoFrame() {
    try {
      const w = this.frame && this.frame.contentWindow;
      return { reachable: !!(w && w.__vg), note: w ? "contentWindow readable" : "no frame" };
    } catch (e) {
      return { reachable: false, note: "blocked: " + (e && e.message) };
    }
  }
}

/* ==================================================================== plugin ==*/

const DEFAULTS = {
  ghosts: false,        // --ghosts
  templates: false,     // --templates
  flatMonths: false,    // --flat-months
  words: true,          // the one field that still costs I/O
  forceStrategy: null,  // "srcdoc" | "blob" | null (try both, first to handshake wins)
};

class VaultGraphSpikePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());

    this.registerView(VIEW_TYPE, (leaf) => new VaultGraphView(leaf, this));

    // Registered before anything asks for it: the ribbon button and the view tab both
    // resolve the id at creation time, and an unknown id renders as an empty box.
    addIcon(ICON_ID, discIcon());

    this.addRibbonIcon(ICON_ID, "Vault graph (spike)", () => this.activate());

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
        await view.reload();
      },
    });

    // The spike's actual verdict, printed where a person and the CDP harness can both
    // read it. Everything this reports is a number somebody would otherwise guess at.
    this.addCommand({
      id: "report",
      name: "Report spike findings to the console",
      callback: async () => {
        const view = this.currentView();
        if (!view) { new Notice("Open the graph first."); return; }
        const report = {
          mountStrategy: view.strategy,
          pageKB: Math.round((view.pageBytes || 0) / 1024),
          handshake: view.ready,
          hostCanReachFrame: view.reachIntoFrame(),
          probeOverPostMessage: await view.probe(),
          build: view.lastData && view.lastData._spike,
          stats: view.lastData && view.lastData.stats,
        };
        console.log("[vault-graph-spike] report", report);
        window.__vgSpikeReport = report;      // so CDP can read it without parsing logs
        new Notice("Spike report written to the console and window.__vgSpikeReport.");
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

module.exports = VaultGraphSpikePlugin;
