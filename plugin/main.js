
import { Plugin, ItemView, Notice, PluginSettingTab, Setting, normalizePath, addIcon } from "obsidian";

import { mountVaultGraph } from "../src/page.js";
// github#58
import { GraphStore, Renderer } from "../src/engine/index";
// github#149 -- the producer is its own module, so a gate can run it
import { buildData } from "./build-data.mjs";
// github#149 -- what the settings tab still needs of the shared policy
import { isSkippedFile, paraDirs, paraFolder } from "../src/taxonomy.mjs";
import PAGE_HTML from "raw:../src/page.html";
import LOGO_MASK_B64 from "b64:../assets/logo-mask.png";
// github#83, design/0016
import WHATS_NEW from "raw:./whats-new.md";
import RELEASES from "vg:releases";
import { CHAIN_MAX, decideNote, minorOf, parseNote, releaseChain } from "./update-note.mjs";

const VIEW_TYPE = "vault-graph-view";
const ICON_ID = "vault-graph-disc";
// github#72, design/0014
const LIVE_DEBOUNCE_MS = 1000;
// github#72, design/0014
const LIVE_WAKE_MS = 500;

// github#60
/** @returns {Record<string, string>} */
function pathMap() {
  /** @type {unknown} */
  const o = Object.create(null);
  return /** @type {Record<string, string>} */ (o);
}

// github#97
/** @template T @returns {Record<string, T>} */
function bareMap() {
  /** @type {unknown} */
  const o = Object.create(null);
  return /** @type {Record<string, T>} */ (o);
}

/* ===================================================================== types ==
 * JSDoc, not TypeScript: the file stays plain JavaScript (see the header) and
 * typescript-eslint reads these through tsconfig.json's allowJs, so every value that gets
 * a type here takes findings off the no-unsafe meter in scripts/lint.mjs. github#60.
 *
 * The plugin's own shapes live here -- Settings, the rows the settings tab draws. The two
 * contracts shared with src/page.js (what mountVaultGraph takes and hands back) are declared
 * there, where the objects are built, and imported below.
 */

/** @typedef {import("obsidian").App} App */
/** @typedef {import("obsidian").TFile} TFile */
/** @typedef {import("obsidian").EventRef} EventRef */

/**
 * What data.json holds. Mirrors DEFAULTS below, which is the one place a default is
 * written; a saved file may carry any subset, and loading merges it over DEFAULTS.
 * @typedef {Object} Settings
 * @property {boolean} ghosts
 * @property {boolean} templates
 * @property {boolean} flatMonths
 * @property {boolean} words
 * @property {Record<string, string>} folderColors      folder name -> slot key ("g7")
 * @property {Record<string, string>} subfolderColors   "folder/sub" -> slot key
 * @property {Record<string, string>} tagColors         github#86 -- tag -> slot key
 * @property {Record<string, string>} subtagColors      github#86 -- "tag/sub" -> slot key
 * @property {Record<string, boolean>} tagShown         github#86 -- tag -> shown by default
 * @property {Record<string, boolean>} folderShown      folder name -> shown by default
 * @property {string[]} pinned                          github#143 -- opaque; the page owns it
 * @property {boolean} panEnabled
 * @property {boolean} compactAxis
 * @property {boolean} unlinkedByFolder
 * @property {"name" | "explorer" | "size" | undefined} folderOrder
 * @property {boolean} unlinkedTintByFolder
 * @property {boolean} countBars                        github#78, design/0006
 * @property {boolean} rootInOrder                      github#164
 * @property {boolean} devTools                        github#165
 * @property {boolean} fitCap                           github#41, design/0011
 * @property {"folder" | "tag"} dim                     github#86 -- grouping dimension
 * @property {boolean} liveRefresh                      github#72
 * @property {number} [lastSeen]                       github#70 -- ms, when the view was last
 * @property {boolean} [sheetOpen]                      github#82 -- absent until folded once
 * @property {boolean} [bandOpen]                       github#82
 * @property {string} [lastSeenVersion]                 github#83 -- absent until the first load records it
 */

/**
 * github#149 -- the producer's shapes live in plugin/build-data.mjs
 * @typedef {import("./build-data.mjs").BuildResult} BuildResult
 */

/**
 * github#140 -- the only four settings buildData reads, per render
 * @typedef {Pick<Settings, "ghosts" | "templates" | "flatMonths" | "words">} BuildOptions
 */

/**
 * The page's own boundary types, declared where the object is built (src/page.js, the
 * `types` section): what mountVaultGraph returns, and the __vg api it builds. Every member
 * `VgApi` names ships in the plugin; the debug surface the standalone adds is not in it.
 * @typedef {import("../src/page.js").MountHandle} MountHandle
 * @typedef {import("../src/page.js").VgApi} VgApi
 * @typedef {import("../src/page.js").MountDeps} MountDeps
 */

/** @typedef {{ name: string, n: number, slot: string, autoSlot: string }} GroupRow */
/** @typedef {{ name: string, n: number }} SubRow */

/**
 * `app.setting` is NOT in the public API and so not in obsidian.d.ts. This is the shape
 * openSettings() below guards for, and nothing more.
 * @typedef {App & { setting?: { open?: () => void, openTabById?: (id: string) => void } }} AppWithSetting
 */

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
  return '<g fill="currentColor" stroke="none">' +
         ring(36, 8.5, 8, 0) + ring(16, 6.5, 4, 22.5) +
         "</g>";
}

/* ================================================================= taxonomy ==
 * github#149 -- policy moved to src/taxonomy.mjs, the adapter to build-data
 */

// github#62
/** @param {() => void} fn @returns {unknown} */
const attempt = (fn) => { try { fn(); return null; } catch (e) { return e; } };

// github#83, design/0016 -- built from the version; the note file carries text only
const RELEASE_URL = "https://github.com/luke321/vault-graph/releases/tag/";
const RELEASES_URL = "https://github.com/luke321/vault-graph/releases";
const NEW_CLASS = "vg-new";
const GALLERY_URL = "https://luke321.github.io/vault-graph/features.html";


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
  /**
   * @param {import("obsidian").WorkspaceLeaf} leaf
   * @param {VaultGraphPlugin} plugin
   */
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    /** @type {MountHandle | null} */
    this.handle = null;
    // github#140 -- teardown() drops it, so it is declared here
    /** @type {HTMLElement | null} */
    this.page = null;
    /** @type {BuildResult | null} */
    this.lastData = null;
    this.mountMs = 0;
    // github#72
    /** @type {number | null} */
    this.liveTimer = null;
    this.pendingRenames = pathMap();
    /** @type {Set<string>} */
    this.dirtyPaths = new Set();
    this.liveBuilding = false;
    this.liveAgain = false;
    this.liveDeferred = false;
    /** @type {number | null} */
    this.liveWake = null;
    /** @type {import("../src/page.js").LiveResult | null} */
    this.lastLive = null;
    // github#120 -- these two register once for the view's life
    /** @type {EventRef | null} */
    this.cssRef = null;
    /** @type {EventRef[] | null} */
    this.liveRefs = null;
    // github#140 -- the current render; only teardown() moves it
    this.renderGen = 0;
    // github#184 -- one per word read started, so a late read can be told apart
    this.buildGen = 0;
    // github#184 -- path -> the build that owns that path's count
    /** @type {Map<string, number>} */
    this.wordsGen = new Map();
    // github#140 -- render() owns this now, not the Refresh button
    this.rebuilding = false;
     // github#70
    /** @type {number | undefined} */
    this.lastSeenPrev = undefined;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Vault graph"; }
  getIcon() { return ICON_ID; }

  async onOpen() {
    // github#70, decisions/0009 -- the HOST owns this clock; the page only receives it.
    this.lastSeenPrev = this.plugin.settings.lastSeen;
    // github#70 -- a failed stamp must not skip the render or the teardown
    try { await this.plugin.stampOpen(); } finally { await this.render(); }
  }

  async onClose() {
    try { await this.plugin.stampOpen(); } finally { this.teardown(); }
  }

  // github#62; github#140 -- the one place a render is invalidated
  teardown() {
    this.renderGen++;
    // github#184 -- a pending word read outlives the mount it was started for
    this.wordsGen.clear();
    // github#140 -- nothing is current after this, so nothing is busy
    this.rebuilding = false;
    // github#72
    this.cancelLive();
    if (this.handle) {
      attempt(() => this.handle.destroy());
    }
    this.handle = null;
    // github#140 -- never hold a reference to a removed element
    this.page = null;
    this.contentEl.empty();
  }

  /* ------------------------------------------------------- live rebuild (github#72) */

  liveOn() { return this.plugin.settings.liveRefresh !== false; }

  cancelLive() {
    if (this.liveTimer !== null) { window.clearTimeout(this.liveTimer); this.liveTimer = null; }
    this.stopLiveWake();
    this.dirtyPaths.clear();
    this.pendingRenames = pathMap();
    this.liveAgain = false;
    this.liveDeferred = false;
  }

  // github#120 -- is a hand on the disc? absent on an older page
  interacting() {
    const api = this.handle && this.handle.api;
    return !!(api && typeof api.interacting === "function" && api.interacting());
  }

  // github#72, design/0014
  startLiveWake() {
    if (this.liveWake !== null) return;
    this.liveWake = window.setInterval(() => {
      // github#120 -- both reasons to wait: unseen, or being dragged
      if (!this.liveVisible() || this.interacting()) return;
      this.stopLiveWake();
      this.scheduleLive();
    }, LIVE_WAKE_MS);
  }

  stopLiveWake() {
    if (this.liveWake !== null) { window.clearInterval(this.liveWake); this.liveWake = null; }
  }

  // github#72, design/0014
  liveVisible() {
    const el = this.containerEl;
    return !!(el && el.offsetParent !== null);
  }

  // github#72, design/0014
  liveSettingChanged() {
    if (!this.liveOn()) this.cancelLive();
  }

  // github#72, design/0014
  // github#120 -- ONCE FOR THE VIEW'S LIFE, NOT ONCE PER RENDER
  subscribeLive() {
    if (this.liveRefs) return;
    const cache = this.app.metadataCache, vault = this.app.vault;
    /** @type {EventRef[]} */
    const refs = [];
    this.liveRefs = refs;
    const keep = /** @param {EventRef} r */ (r) => { refs.push(r); this.registerEvent(r); };
    keep(cache.on("resolved", () => this.scheduleLive()));
    keep(cache.on("changed", (file) => this.scheduleLive(file && file.path)));
    keep(vault.on("create", (file) => this.scheduleLive(file && file.path)));
    keep(vault.on("delete", (file) => this.scheduleLive(file && file.path)));
    keep(vault.on("rename", (file, oldPath) => {
      const to = file && file.path;
      if (to && oldPath) {
        // design/0014
        let from = oldPath;
        for (const k of Object.keys(this.pendingRenames)) {
          if (this.pendingRenames[k] === oldPath) { from = k; break; }
        }
        this.pendingRenames[from] = to;
        this.dirtyPaths.add(oldPath);
      }
      this.scheduleLive(to);
    }));
  }

  /** @param {string} [path] */
  scheduleLive(path) {
    if (!this.liveOn() || !this.handle) return;
    if (path) this.dirtyPaths.add(path);
    if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
    this.liveTimer = window.setTimeout(() => {
      this.liveTimer = null;
      void this.liveRebuild();
    }, LIVE_DEBOUNCE_MS);
  }

  // github#72, design/0014 -- whether the disc MOVES is applyData's call, not this one's
  async liveRebuild() {
    const handle = this.handle;
    const api = handle && handle.api;
    if (!api || typeof api.applyData !== "function") return;
    // github#72, design/0014
    if (!this.liveVisible()) { this.liveDeferred = true; this.startLiveWake(); return; }
    // github#120 -- and not while a hand is on the disc
    if (this.interacting()) { this.liveDeferred = true; this.startLiveWake(); return; }
    this.liveDeferred = false;
    this.stopLiveWake();
    if (this.liveBuilding) { this.liveAgain = true; return; }
    this.liveBuilding = true;
    const dirty = this.dirtyPaths;
    this.dirtyPaths = new Set();
    const renames = this.pendingRenames;
    this.pendingRenames = pathMap();
    try {
      const next = await buildData({ app: this.app, normalizePath }, this.plugin.settings, this.plugin.manifest.version);
      if (this.handle !== handle || handle.api !== api) return;   // github#62

      // github#58, design/0014
      /** @type {Map<string, number>} */
      const had = new Map();
      for (const n of (this.lastData ? this.lastData.nodes : [])) had.set(n.id, n.words || 0);
      /** @type {Map<string, string>} */
      const cameFrom = new Map();
      for (const from of Object.keys(renames)) cameFrom.set(renames[from], from);
      /** @param {string} path */
      const wordsBefore = (path) => {
        const was = cameFrom.get(path);
        return had.has(path) ? had.get(path) : (was !== undefined ? had.get(was) : undefined);
      };
      for (const n of next.nodes) {
        const before = wordsBefore(n.id);
        if (!dirty.has(n.id) && before !== undefined) n.words = before;
      }

      const r = api.applyData(next, { renames: renames });
      this.lastLive = r;
      if (r && r.churn !== undefined) {
        // design/0014 -- a sync, an import or a folder move. Do what Refresh does.
        this.lastData = null;
        await this.render();
        return;
      }
      this.lastData = next;
      if (!this.plugin.settings.words) return;
      /** @type {Set<string>} */
      const want = new Set(dirty);
      for (const n of next.nodes) if (wordsBefore(n.id) === undefined) want.add(n.id);
      if (!want.size) return;
      // github#184 -- claim these paths, so a read still out for them is dropped
      const claim = ++this.buildGen;
      // github#184 -- rebuilt from next.nodes: a path that is gone cannot pile up
      const held = this.wordsGen;
      this.wordsGen = new Map();
      for (const n of next.nodes) {
        if (want.has(n.id)) { this.wordsGen.set(n.id, claim); continue; }
        const was = held.get(n.id);
        if (was !== undefined) this.wordsGen.set(n.id, was);
      }
      void next.readWords((i, words) => {
        const node = next.nodes[i];
        if (!node) return;
        // github#184 -- identity cannot separate two builds of the same mount
        if (this.wordsGen.get(node.id) !== claim) return;
        node.words = words;
        api.setWords(node.id, words);
      }, want).catch(() => {});
    } catch (e) {
      new Notice("Vault Graph: live refresh failed -- " + (e instanceof Error ? e.message : String(e)));
    } finally {
      this.liveBuilding = false;
      if (this.liveAgain) { this.liveAgain = false; this.scheduleLive(); }
    }
  }

  syncTheme() {
    if (!this.page) return;
    // github#140 -- THIS view's document, not whichever one has focus
    const want = this.contentEl.doc.body.classList.contains("theme-light") ? "light" : "dark";
    if (this.page.getAttribute("data-theme") === want) return;
    this.page.setAttribute("data-theme", want);

    const api = this.handle && this.handle.api;
    if (api) {
      attempt(() => {
        if (api.readTheme) api.readTheme();
        if (api.renderer) api.renderer.refresh();
        if (api.placeLogo) api.placeLogo();
        if (api.heatBuild) api.heatBuild();
      });
    }
  }

  /* ------------------------------------------------------ update note (github#83) */

  // github#83, design/0016 -- above the page root, so the page's own resize path re-fits
  mountNote() {
    const note = this.plugin.pendingNote;
    if (!note) return;
    const strip = this.contentEl.createDiv({ cls: "vg-whatsnew", attr: { role: "status" } });
    const head = strip.createDiv({ cls: "vg-whatsnew-head" });
    head.createEl("strong", { text: "What's new in Vault Graph " + minorOf(note.version) });
    const links = { target: "_blank", rel: "noopener" };
    // github#83 -- every release since the one last seen, oldest first
    const chain = head.createSpan({ cls: "vg-whatsnew-chain" });
    const all = this.plugin.pendingChain;
    const shown = all.length > CHAIN_MAX ? all.slice(all.length - CHAIN_MAX) : all;
    if (shown.length < all.length) {
      chain.createEl("a", { text: "\u2026", href: RELEASES_URL,
                            attr: Object.assign({ title: (all.length - shown.length) + " earlier releases" }, links) });
      chain.appendText(" \u2013 ");
    }
    shown.forEach((r, i) => {
      if (i) chain.appendText(" \u2013 ");
      chain.createEl("a", { text: r.version, href: RELEASE_URL + r.version,
                            attr: r.name ? Object.assign({ title: r.name }, links) : links });
    });
    head.createEl("a", { text: "Feature gallery", href: GALLERY_URL, attr: links });
    const list = strip.createEl("ul");
    for (const line of note.lines) list.createEl("li", { text: line });
    const ok = strip.createEl("button", { text: "Got it", cls: "vg-whatsnew-ok", attr: { type: "button" } });
    this.registerDomEvent(ok, "click", () => { void this.dismissNote(strip); });
  }

  // github#83, design/0016 -- the controls the note points at, pulsing while it is up
  markNew() {
    const note = this.plugin.pendingNote;
    if (!note || !this.page) return;
    for (const id of note.points) {
      const el = this.page.querySelector("#" + id);
      if (el instanceof HTMLElement) el.addClass(NEW_CLASS);
    }
  }

  // github#83 -- dismissing is the write that marks the version seen
  /** @param {HTMLElement} strip */
  async dismissNote(strip) {
    strip.remove();
    this.plugin.pendingNote = null;
    // github#83 -- a second leaf has its own copy, and its own pulse
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof VaultGraphView) {
        leaf.view.contentEl.querySelectorAll(".vg-whatsnew").forEach((el) => el.remove());
        leaf.view.contentEl.querySelectorAll("." + NEW_CLASS).forEach((el) => el.removeClass(NEW_CLASS));
      }
    }
    await this.plugin.recordVersion();
  }

  // github#140 -- a superseded render writes nothing, on every path
  // github#140 -- and render() owns `rebuilding`, not just Refresh
  async render() {
    this.teardown();
    const gen = this.renderGen;
    // github#140 -- a snapshot, taken before the await
    /** @type {BuildOptions} */
    const opts = {
      ghosts: this.plugin.settings.ghosts,
      templates: this.plugin.settings.templates,
      flatMonths: this.plugin.settings.flatMonths,
      words: this.plugin.settings.words,
    };
    this.rebuilding = true;
    try {
      await this.renderPass(gen, opts);
    } catch (e) {
      // github#140 -- clean up, but only while still the current one
      if (this.renderGen === gen) this.teardown();
      throw e;
    } finally {
      if (this.renderGen === gen) this.rebuilding = false;
    }
  }

  /**
   * github#140 -- one render's body; the bookkeeping above stays short
   * @param {number} gen
   * @param {BuildOptions} opts
   */
  async renderPass(gen, opts) {
    const root = this.contentEl;
    root.addClass("vault-graph-view");
    this.mountNote();

    const data = await buildData({ app: this.app, normalizePath }, opts, this.plugin.manifest.version);
    // github#140 -- THE CHECK: everything below writes view state
    if (this.renderGen !== gen) return;
    this.lastData = data;

    const parsed = new DOMParser().parseFromString(PAGE_HTML, "text/html");
    // github#145 -- PAGE_HTML's root is a div; the narrow claim is made here
    const page = /** @type {HTMLElement | null} */ (parsed.body.firstElementChild);
    if (!page) throw new Error("page markup did not parse to an element");
    root.appendChild(page);

    this.page = page;
    this.syncTheme();
    this.markNew();

    // github#120 -- one listener for the view's life, not per render
    if (!this.cssRef) {
      this.cssRef = this.app.workspace.on("css-change", () => this.syncTheme());
      this.registerEvent(this.cssRef);
    }

    const t0 = performance.now();
    this.handle = mountVaultGraph(page, data, {
      Graph: GraphStore,
      Renderer: Renderer,
      logoMask: "data:image/png;base64," + LOGO_MASK_B64,
      folderColors: this.plugin.settings.folderColors,
      subfolderColors: this.plugin.settings.subfolderColors,
      // github#86 -- every grouping keeps its own pins
      tagColors: this.plugin.settings.tagColors,
      subtagColors: this.plugin.settings.subtagColors,
      tagShown: this.plugin.settings.tagShown,
      /** @param {Record<string, string>} map */
      onTagColors: async (map) => {
        this.plugin.settings.tagColors = map;
        await this.plugin.saveSettings();
      },
      /** @param {Record<string, string>} map */
      onSubtagColors: async (map) => {
        this.plugin.settings.subtagColors = map;
        await this.plugin.saveSettings();
      },
      /** @param {Record<string, boolean>} map */
      onTagShown: async (map) => {
        this.plugin.settings.tagShown = map;
        await this.plugin.saveSettings();
      },
      /** @param {Record<string, string>} map */
      onFolderColors: async (map) => {
        this.plugin.settings.folderColors = map;
        await this.plugin.saveSettings();
      },
      /** @param {Record<string, string>} map */
      onSubfolderColors: async (map) => {
        this.plugin.settings.subfolderColors = map;
        await this.plugin.saveSettings();
      },
      // github#34
      // github#3
      /** @param {Record<string, boolean>} map */
      onFolderShown: async (map) => {
        this.plugin.settings.folderShown = map;
        await this.plugin.saveSettings();
      },
      folderShown: this.plugin.settings.folderShown,
      // github#70
      lastOpen: this.lastSeenPrev,
      panEnabled: this.plugin.settings.panEnabled,
      /** @param {boolean} v */
      onPanEnabled: async (v) => {
        this.plugin.settings.panEnabled = !!v;
        await this.plugin.saveSettings();
      },
      // github#23
      compactAxis: this.plugin.settings.compactAxis,
      /** @param {boolean} v */
      onCompactAxis: async (v) => {
        this.plugin.settings.compactAxis = !!v;
        await this.plugin.saveSettings();
      },
      // github#71
      // github#71 -- undefined until the reader picks
      folderOrder: this.plugin.settings.folderOrder,
      /** @param {"name" | "explorer" | "size"} v */
      onFolderOrder: async (v) => {
        this.plugin.settings.folderOrder = v;
        await this.plugin.saveSettings();
      },
      // github#3
      unlinkedByFolder: this.plugin.settings.unlinkedByFolder,
      /** @param {boolean} v */
      onUnlinkedByFolder: async (v) => {
        this.plugin.settings.unlinkedByFolder = !!v;
        await this.plugin.saveSettings();
      },
      // github#78, design/0006
      countBars: this.plugin.settings.countBars,
      /** @param {boolean} v */
      onCountBars: async (v) => {
        this.plugin.settings.countBars = !!v;
        await this.plugin.saveSettings();
      },
      // github#164
      rootInOrder: this.plugin.settings.rootInOrder === true,
      /** @param {boolean} v */
      onRootInOrder: async (v) => {
        this.plugin.settings.rootInOrder = !!v;
        await this.plugin.saveSettings();
      },
      // github#165
      devTools: this.plugin.settings.devTools === true,
      /** @param {boolean} v */
      onDevTools: async (v) => {
        this.plugin.settings.devTools = !!v;
        await this.plugin.saveSettings();
      },
      // github#3
      unlinkedTintByFolder: this.plugin.settings.unlinkedTintByFolder,
      /** @param {boolean} v */
      onUnlinkedTintByFolder: async (v) => {
        this.plugin.settings.unlinkedTintByFolder = !!v;
        await this.plugin.saveSettings();
      },
      // github#86, design/0015, decisions/0009 -- the host only remembers it
      dim: this.plugin.settings.dim,
      /** @param {"folder" | "tag"} v */
      onDim: async (v) => {
        this.plugin.settings.dim = v === "tag" ? "tag" : "folder";
        await this.plugin.saveSettings();
      },
      // github#82, decisions/0009 -- no tab row; absent = width decides
      sheetOpen: this.plugin.settings.sheetOpen,
      /** @param {boolean} v */
      onSheetOpen: async (v) => {
        this.plugin.settings.sheetOpen = !!v;
        await this.plugin.saveSettings();
      },
      bandOpen: this.plugin.settings.bandOpen,
      /** @param {boolean} v */
      onBandOpen: async (v) => {
        this.plugin.settings.bandOpen = !!v;
        await this.plugin.saveSettings();
      },
      // github#41, design/0011
      fitCap: this.plugin.settings.fitCap !== false,
      pinned: this.plugin.settings.pinned,
      /** @param {string[]} ids */
      onPinned: async (ids) => {
        this.plugin.settings.pinned = ids;
        await this.plugin.saveSettings();
      },
      openSettings: () => this.plugin.openSettings(),
      // github#140 -- this view's window, not whichever one has focus now
      win: this.contentEl.win,
      // github#6; github#140 -- render() owns the busy flag, this only declines to re-enter
      onRefresh: () => {
        if (this.rebuilding) return;
        this.render()
          .catch(/** @param {Error} e */ (e) => new Notice("Vault Graph: rebuild failed -- " + e.message));
      },
    });
    this.mountMs = Math.round(performance.now() - t0);

    const handle = this.handle;
    // github#184 -- this sweep owns every path until a newer build claims one
    const claim = ++this.buildGen;
    for (const node of data.nodes) this.wordsGen.set(node.id, claim);
    // github#58; github#72, design/0014 -- by PATH, never by index
    void data.readWords((i, words) => {
      const node = data.nodes[i];
      if (!node) return;
      // github#184 -- per path, never per build: an unclaimed path still lands
      if (this.wordsGen.get(node.id) !== claim) return;
      node.words = words;
      const api = handle.api;
      if (api && api.setWords) api.setWords(node.id, words);
    }).then((ms) => { data._spike.msWordsBackground = ms; }, () => {});

    // github#72
    this.subscribeLive();

    // github#120 -- a PLAIN listener: registerDomEvent retains the page
    page.addEventListener("click", (ev) => {
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

/** @type {Settings} */
const DEFAULTS = {
  ghosts: false,
  templates: false,
  flatMonths: false,
  words: true,
  folderColors: {},
  subfolderColors: {},
  tagColors: {},
  subtagColors: {},
  tagShown: {},
  folderShown: {},
  pinned: [],
  panEnabled: true,
  // github#23
  compactAxis: true,
  // github#3
  unlinkedByFolder: true,
  // github#3
  unlinkedTintByFolder: false,
  // github#78, design/0006
  countBars: true,
  // github#164 -- off is the order the disc has always drawn
  rootInOrder: false,
  // github#165 -- off; the disc's right-click stays the host's
  devTools: false,
  // github#41, design/0011
  fitCap: true,
  // github#86 -- folder is the default
  dim: "folder",
  // github#72
  liveRefresh: true,
  // github#71, decisions/0009 -- absent means nobody has chosen yet
  folderOrder: undefined,
};

/* github#71 -- the one view setting that is not a boolean */
const FOLDER_ORDER_SETTING = {
  key: /** @type {const} */ ("folderOrder"),
  name: "Folder order",
  desc: "Which way the wedges run round the disc. Name is the vault's own folder order, " +
        "numbers reading as numbers. File explorer follows a Custom File Explorer sorting " +
        "sortspec -- pinned names first, then order-asc/order-desc a-z, by that plugin's own " +
        "precedence; only the sections aimed at the vault root and at a top-level folder can " +
        "reach the disc, and a spec that cannot be read falls back to Name. Size puts the " +
        "biggest folder first. A folder keeps its colour whichever you pick.",
  options: { name: "Name", explorer: "File explorer", size: "Size" },
};

/** @type {{ key: "ghosts" | "templates" | "flatMonths" | "words", name: string, desc: string }[]} */
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

/**
 * @typedef {Object} ViewSetting
 * @property {"panEnabled" | "compactAxis" | "unlinkedByFolder" | "unlinkedTintByFolder" | "countBars" | "rootInOrder" | "fitCap" | "liveRefresh" | "devTools"} key
 * @property {string} name
 * @property {string} desc
 * @property {boolean} defaultOn
 * @property {"setPanEnabled" | "setCompactAxis" | "setUnlinkedByFolder" | "setUnlinkedTintByFolder" | "setCountBars" | "setRootInOrder" | "setFitCap" | "setDevTools" | ""} api
 * @property {boolean} [host]   the HOST owns this one, not the page, so there is no api to call
 */
/** @type {ViewSetting[]} */
const VIEW_SETTINGS = [
  { key: "panEnabled", name: "Drag to pan", defaultOn: true, api: "setPanEnabled",
    desc: "Drag the graph to move it, and zoom toward the pointer. Off pins the disc to the centre of the view. The control in the graph's bottom-right corner flips it too, and lands back here." },
  { key: "compactAxis", name: "Compact date axis", defaultOn: true, api: "setCompactAxis",
    desc: "Give each year on the date strip width by how many notes it holds, instead of every year and month reading the same width regardless of content." },
  { key: "unlinkedByFolder", name: "Unlinked notes join their folder", defaultOn: true, api: "setUnlinkedByFolder",
    desc: "A note with no links takes its own folder's wedge and colour, instead of sitting apart in a separate unlinked group. The (unlinked) row's right-click menu flips this too, and lands back here." },
  { key: "unlinkedTintByFolder", name: "Colour unlinked notes by folder", defaultOn: false, api: "setUnlinkedTintByFolder",
    desc: "While unlinked notes are kept as their own group (the toggle just above is off), give each one its own folder's colour instead of the flat unlinked swatch. The (unlinked) row's right-click menu carries this too." },
  // github#78, design/0006
  { key: "countBars", name: "Count bars in the legend", defaultOn: true, api: "setCountBars",
    desc: "Draw a short rule along the bottom of each folder row in the legend, in that folder's own colour, scaled so the largest folder currently shown fills its row and the rest are read against it. The count alone makes a 406-note folder and a 1-note folder look identical. Hovering a count says which folder the bar is measured against." },
  // github#164
  { key: "rootInOrder", name: "Vault root sorts with the folders", defaultOn: false, api: "setRootInOrder",
    desc: "Let (vault root) take the place its own notes sort to, in among the folders, instead of sitting at the front of the disc. It sorts as its alphabetically first note does, which is where the file explorer starts showing them -- so the disc and the tree agree. The archives keep the front, and (untagged) and (unlinked) stay at the end. Off by default, so no disc moves until you ask." },
  // github#41, design/0011
  { key: "fitCap", name: "Size dots from the frame", defaultOn: true, api: "setFitCap",
    desc: "While the disc animates, cap every dot at just under half its distance to the nearest visible note, measured on the frame being drawn, so dots stay apart while rows slide. The disc at rest is unchanged. Experimental: dots breathe while a cascade walks." },
  // github#72
  { key: "liveRefresh", name: "Follow the vault", defaultOn: true, api: "", host: true,
    desc: "Take a note you have just written, moved or linked into the disc where it stands, instead of waiting for Refresh to rebuild the whole thing. Only a change that decides where a note SITS moves anything -- writing prose does not, so typing is still. Off, the disc is a snapshot until you press Refresh." },
  // github#165 -- last on purpose
  { key: "devTools", name: "Developer debug", defaultOn: false, api: "setDevTools",
    desc: "Right-click the disc for a developer menu: draw the wedge lattice the notes are packed onto over the top of them, and slow every animation down 2x, 4x or 8x so a cascade can be read a dot at a time. Off, the disc's right-click does nothing and Obsidian's own menu is untouched." },
];

const COLOURS_DESC = "Twelve slots, handed out in group order and round again. Folders and tags keep their own colours; the tabs choose which. Setting one group never moves another, and two may share a colour. Each swatch shows the slot at the sizes the disc really draws, over both grounds. Its contrast figure is for a solid area of the colour; a dot a pixel across is mostly antialiasing and reads lower than the number.";

const SLOT_NAMES = ["Blue", "Orange", "Aqua", "Yellow", "Green", "Magenta",
                    "Violet", "Red", "Cyan", "Orchid", "Grey", "Slate"];

/** @param {string} name */
const isArchiveGroup = (name) => String(name).charAt(0) === "_";
const ARCHIVE_SLOT = "g11";

/**
 * @param {App} app
 * @returns {{ name: string, n: number }[]}
 */
function topFolders(app) {
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const file of app.vault.getMarkdownFiles()) {
    if (isSkippedFile(file.name)) continue;
    const g = paraFolder(file.path);
    count.set(g, (count.get(g) || 0) + 1);
  }
  /** @param {string} s */
  const rank = (s) => (s.charAt(0) === "_" ? 0 : s.charAt(0) === "(" ? 1 : 2);
  return Array.from(count.entries())
    .sort((a, b) => rank(a[0]) - rank(b[0]) ||
                    a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([name, n]) => ({ name, n }));
}

/**
 * @param {App} app
 * @param {boolean} flatMonths
 * @returns {Map<string, SubRow[]>}   top folder -> its subfolder rows, biggest first
 */
function allSubfolders(app, flatMonths) {
  /** @type {Map<string, Map<string, number>>} */
  const byFolder = new Map();
  for (const file of app.vault.getMarkdownFiles()) {
    if (isSkippedFile(file.name)) continue;
    const g = paraFolder(file.path);
    let count = byFolder.get(g);
    if (!count) {
      /** @type {Map<string, number>} */
      const fresh = new Map();
      byFolder.set(g, count = fresh);
    }
    const sb = paraDirs(file.path, flatMonths)[0] || "";
    count.set(sb, (count.get(sb) || 0) + 1);
  }
  /** @type {Map<string, SubRow[]>} */
  const out = new Map();
  for (const [g, count] of byFolder) {
    out.set(g, Array.from(count.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, n]) => ({ name, n })));
  }
  return out;
}

class VaultGraphSettingTab extends PluginSettingTab {
  /**
   * @param {App} app
   * @param {VaultGraphPlugin} plugin
   */
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    // github#97
    /** @type {Record<string, boolean>} */
    this.subOpen = bareMap();
    /** @type {HTMLElement | null} */
    this.scope = null;
    // github#77
    /** @type {EventRef | null} */
    this.cssRef = null;
  }

  /* ----------------------------------------------------------- two render paths --
   * Obsidian 1.13 renders a settings tab from getSettingDefinitions() -- that is also what
   * its settings search indexes -- and does not call display() when the definitions are
   * non-empty. Below 1.13 only display() exists. minAppVersion is 1.7.2, so both are here,
   * built from the same tables (BUILD_SETTINGS, VIEW_SETTINGS) and the same colour section
   * (renderColourSection), so that what one path shows the other shows too. github#59. */

  /**
   * The declarative tab: the four build toggles, the four view toggles under a heading, and
   * the folder-colour picker as one imperatively rendered row, since a per-folder swatch grid
   * with expandable subfolder rows is nothing a declarative control expresses.
   * @returns {import("obsidian").SettingDefinitionItem[]}
   */
  getSettingDefinitions() {
    /** @param {{ key: string, name: string, desc: string }} s @param {boolean} defaultOn */
    const toggle = (s, defaultOn) => ({
      name: s.name, desc: s.desc,
      control: { type: /** @type {"toggle"} */ ("toggle"), key: s.key, defaultValue: defaultOn },
    });
    return [
      ...BUILD_SETTINGS.map((s) => toggle(s, false)),
      { type: /** @type {"group"} */ ("group"), heading: "View",
        items: [
          // github#71
          { name: FOLDER_ORDER_SETTING.name, desc: FOLDER_ORDER_SETTING.desc,
            aliases: ["sortspec", "sort", "order", "explorer", "custom sort"],
            control: { type: /** @type {"dropdown"} */ ("dropdown"), key: FOLDER_ORDER_SETTING.key,
                       defaultValue: "name", options: FOLDER_ORDER_SETTING.options } },
          ...VIEW_SETTINGS.map((s) => toggle(s, s.defaultOn)),
        ] },
      { type: /** @type {"group"} */ ("group"), heading: "Group colours",
        items: [{
          name: "Group and sub-wedge colours", desc: COLOURS_DESC,
          aliases: ["colour", "color", "swatch", "palette", "subfolder", "hidden by default", "archive"],
          /** @param {Setting} setting */
          render: (setting) => {
            this.renderColourSection(setting);
            return () => { if (this.scope) { this.scope.remove(); this.scope = null; } };
          },
        }] },
    ];
  }

  /** @param {string} key */
  getControlValue(key) {
    // github#71 -- report what the page chose, not the declarative default
    if (key === FOLDER_ORDER_SETTING.key) {
      return this.plugin.settings.folderOrder || this.liveFolderOrder() || "name";
    }
    return this.plugin.settings[/** @type {keyof Settings} */ (key)];
  }
  /** @param {string} key @param {unknown} value */
  async setControlValue(key, value) {
    // github#71 -- the only non-boolean, settled before the !!value below
    if (key === FOLDER_ORDER_SETTING.key) {
      await this.setFolderOrder(String(value));
      return;
    }
    const build = BUILD_SETTINGS.find((s) => s.key === key);
    const view = VIEW_SETTINGS.find((s) => s.key === key);
    if (!build && !view) return;
    this.plugin.settings[/** @type {"ghosts" | "templates" | "flatMonths" | "words" | ViewSetting["key"]} */ (key)] = !!value;
    await this.plugin.saveSettings();
    if (build) { await this.plugin.rebuildViews(); return; }
    if (view) await this.applyView(view, !!value);
  }

  /** @param {ViewSetting} def */
  viewValue(def) {
    const v = this.plugin.settings[def.key];
    return def.defaultOn ? v !== false : v === true;
  }
  /** @param {ViewSetting} def @param {boolean} v */
  async applyView(def, v) {
    const view = await this.plugin.currentView();
    // github#72, design/0014 -- a host-owned setting has no page api to call
    if (def.host) { if (view) view.liveSettingChanged(); return; }
    const api = view && view.handle && view.handle.api;
    if (api && def.api && api[def.api]) api[def.api](v);
  }

  // github#71
  /** @param {string} v */
  async setFolderOrder(v) {
    const next = ["name", "explorer", "size"].includes(v)
      ? /** @type {"name" | "explorer" | "size"} */ (v) : "name";
    this.plugin.settings.folderOrder = next;
    await this.plugin.saveSettings();
    const view = await this.plugin.currentView();
    const api = view && view.handle && view.handle.api;
    if (api && api.setFolderOrder) api.setFolderOrder(next);
  }

  /**
   * github#71, decisions/0015 -- what the disc is ACTUALLY ordered by
   * @returns {"" | "name" | "explorer" | "size"}
   */
  liveFolderOrder() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (!(view instanceof VaultGraphView)) continue;
      const api = view.handle && view.handle.api;
      if (!api || !api.folderOrder) continue;
      const v = api.folderOrder();
      if (v === "name" || v === "explorer" || v === "size") return v;
    }
    return "";
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
            await this.plugin.rebuildViews();
          }));
    }

    new Setting(containerEl).setName("View").setHeading();
    // github#71
    new Setting(containerEl)
      .setName(FOLDER_ORDER_SETTING.name)
      .setDesc(FOLDER_ORDER_SETTING.desc)
      .addDropdown((d) => d
        .addOptions(FOLDER_ORDER_SETTING.options)
        .setValue(this.plugin.settings.folderOrder || this.liveFolderOrder() || "name")
        .onChange(async (v) => { await this.setFolderOrder(v); }));
    for (const s of VIEW_SETTINGS) {
      new Setting(containerEl)
        .setName(s.name)
        .setDesc(s.desc)
        .addToggle((t) => t
          .setValue(this.viewValue(s))
          .onChange(async (v) => {
            this.plugin.settings[s.key] = v;
            await this.plugin.saveSettings();
            await this.applyView(s, v);
          }));
    }

    new Setting(containerEl).setName("Group colours").setHeading();
    this.renderColourSection(new Setting(containerEl).setDesc(COLOURS_DESC));
  }

  // github#86 -- the grouping the colour section shows
  /** @type {"folder" | "tag"} */
  colourDim = "folder";

  /**
   * The folder-colours section: the Reset-all button on `row`, then the swatch rows in a
   * palette-scoped wrapper INSIDE the row, which is told to wrap so the wrapper takes the
   * next line (styles.css, .vg-colour-row). Inside the row rather than after it, and this
   * was measured: Obsidian 1.13's declarative renderer replaces the group list's children
   * once the render callbacks have run, so a wrapper appended beside the row was created,
   * filled with 18 swatch rows and detached before the tab was shown. The row itself is
   * ours to fill in both paths -- display() hands over a row it just made, the render item
   * the row Obsidian made for the definition.
   * @param {Setting} row
   */
  renderColourSection(row) {
    row.addButton((b) => b
      .setButtonText("Reset all")
      .setTooltip("Also drops every sub-wedge override, for the grouping shown")
      .onClick(async () => {
        // github#86 -- the tab you are on, not the other grouping's pins
        const tag = this.colourDim === "tag";
        this.plugin.settings[tag ? "tagColors" : "folderColors"] = {};
        this.plugin.settings[tag ? "subtagColors" : "subfolderColors"] = {};
        await this.plugin.saveSettings();
        await this.plugin.applyFolderColors();
        await this.plugin.applySubfolderColors();
        this.redrawColours();
      }));

    row.settingEl.addClass("vg-colour-row");
    const scope = row.settingEl.createDiv({ cls: ["vault-graph", "vg-tokens"] });

    this.scope = scope;
    this.syncScopeTheme(false);
    // github#77
    if (!this.cssRef) {
      this.cssRef = this.app.workspace.on("css-change", () => this.syncScopeTheme(true));
      this.plugin.registerEvent(this.cssRef);
    }
    this.redrawColours();
  }

  // github#77
  syncScopeTheme(defer) {
    if (defer) {
      window.requestAnimationFrame(() => this.syncScopeTheme(false));
      return;
    }
    if (!this.scope) return;
    this.scope.setAttribute("data-theme",
      activeDocument.body.classList.contains("theme-light") ? "light" : "dark");
  }

  redrawColours() {
    if (!this.scope) return;
    // github#86 -- the vault's folders are the first guess, folder tab only;
    // github#86 -- the open view answers for either grouping a moment later
    if (this.colourDim === "folder") {
      let auto = 0;
      this.renderColours(topFolders(this.app).map((f) => {
        const s = isArchiveGroup(f.name) ? ARCHIVE_SLOT : "g" + ((auto++ % SLOT_NAMES.length) + 1);
        return { name: f.name, n: f.n, slot: s, autoSlot: s };
      }));
    } else {
      this.renderColours([]);
    }

    this.refreshFromView();
  }

  async refreshFromView() {
    const scope = this.scope;
    const view = await this.plugin.currentView();
    const api = view && view.handle && view.handle.api;
    if (!api || !api.groupOrder || !api.palette || !scope || !scope.isConnected) return;
    // github#86 -- the page answers for the tab's grouping, on screen or not
    const groups = api.groupsOf
      ? api.groupsOf(this.colourDim).map((g) => ({ name: g.name, n: g.n, slot: g.slot, autoSlot: g.autoSlot }))
      : api.groupOrder().map((name) => ({
        name,
        n: api.groupCount(name),
        slot: api.slotOf ? api.slotOf(name) : "",
        autoSlot: api.autoSlotOf ? api.autoSlotOf(name) : "",
      }));
    if (groups.length) this.renderColours(groups, api);
  }

  // github#77
  /**
   * @param {VgApi | null} api @param {HTMLElement} btn
   * @param {string} key @param {string} name @param {string} tail @param {string} [group]
   */
  fillSwatch(api, btn, key, name, tail, group) {
    if (!api || !api.swatchPreview) return;
    const doc = new DOMParser().parseFromString(
      "<body>" + api.swatchPreview(key, group) + "</body>", "text/html");
    btn.replaceChildren.apply(btn, Array.prototype.slice.call(doc.body.childNodes));
    if (api.slotTitle) btn.setAttribute("title", api.slotTitle(key, name) + tail);
  }

  // github#77
  /** @param {GroupRow[]} groups @param {VgApi | null} [api] */
  renderColours(groups, api) {
    const scope = this.scope;
    scope.empty();
    // github#86 -- one tab per grouping, above the rows
    const tabs = scope.createDiv({ cls: ["dimseg", "setseg"] });
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Set colours for");
    for (const [dim, label] of [["folder", "Folders"], ["tag", "Tags"]]) {
      const b = tabs.createEl("button", { text: label });
      b.type = "button";
      b.setAttribute("aria-pressed", String(dim === this.colourDim));
      b.onclick = () => {
        if (this.colourDim === dim) return;
        this.colourDim = /** @type {"folder" | "tag"} */ (dim);
        this.redrawColours();
      };
    }
    if (!groups.length) {
      scope.createEl("p", { text: this.colourDim === "tag"
        ? "Open the graph to colour this vault's tags."
        : "No folders to colour yet." });
      return;
    }

    const subsByFolder = allSubfolders(this.app, this.plugin.settings.flatMonths);

    for (const group of groups) {
      // github#97
      const colors = this.plugin.settings.folderColors;
      const pinned = (Object.prototype.hasOwnProperty.call(colors, group.name) && colors[group.name]) || "";
      const current = pinned || group.slot;
      const shown = this.shownByDefault(group.name);
      const subs = subsByFolder.get(group.name) || [];
      const hasPin = subs.some((s) => this.plugin.settings.subfolderColors[group.name + "/" + s.name]);
      const hasSubs = subs.length > 1 || hasPin;
      const open = hasSubs && !!this.subOpen[group.name];

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
            this.renderColours(groups, api);
          }));
      }
      row.addExtraButton((b) => b
        .setIcon(shown ? "eye" : "eye-off")
        .setTooltip(shown ? "Shown by default" : "Hidden by default")
        .onClick(() => this.pickVisible(group.name)));
      row.controlEl.addClass("sws");
      // github#77
      const grid = row.controlEl.createDiv({ cls: "sw-grid" });

      SLOT_NAMES.forEach((name, i) => {
        const key = "g" + (i + 1);
        const on = current === key;
        const isAuto = group.autoSlot === key;
        const tail = on ? (pinned ? " (chosen)" : " (automatic)")
                        : (isAuto ? " (automatic default)" : "");
        const attr = {
          role: "radio", "aria-checked": String(on), "aria-label": name,
          title: name + tail,
        };
        if (isAuto) attr["data-auto"] = "1";
        const b = grid.createEl("button", { cls: ["swatch", "vg-" + key], attr });
        this.fillSwatch(api, b, key, name, tail, group.name);
        b.addEventListener("click", () => this.pick(group.name, key));
      });

      const auto = row.controlEl.createEl("button", {
        cls: "auto", text: "Auto",
        attr: { "aria-pressed": String(!pinned),
                title: "Back to the slot this folder gets automatically" },
      });
      auto.addEventListener("click", () => this.pick(group.name, null));

      if (open) this.renderSubRows(scope, group.name, subs, api);
    }
  }

  /**
   * @param {HTMLElement} scope
   * @param {string} folder
   * @param {SubRow[]} subs
   * @param {VgApi | null} [api]
   */
  renderSubRows(scope, folder, subs, api) {
    for (const s of subs) {
      const pk = folder + "/" + s.name;
      const pinned = this.plugin.settings.subfolderColors[pk] || "";
      const row = new Setting(scope)
        .setName(s.name || "(directly in folder)")
        .setDesc(s.n === 1 ? "1 note" : s.n + " notes");
      row.settingEl.addClass("vg-subrow");
      row.controlEl.addClass("sws");
      // github#77
      const grid = row.controlEl.createDiv({ cls: "sw-grid" });

      SLOT_NAMES.forEach((name, i) => {
        const key = "g" + (i + 1);
        const on = pinned === key;
        const b = grid.createEl("button", {
          cls: ["swatch", "vg-" + key],
          attr: { role: "radio", "aria-checked": String(on), "aria-label": name,
                  title: name + (on ? " (chosen)" : "") },
        });
        this.fillSwatch(api, b, key, name, on ? " (chosen)" : "");
        b.addEventListener("click", () => this.pickSub(folder, s.name, key));
      });

      const auto = row.controlEl.createEl("button", {
        cls: "auto", text: "Auto",
        attr: { "aria-pressed": String(!pinned), title: "Back to the automatic tint" },
      });
      auto.addEventListener("click", () => this.pickSub(folder, s.name, null));
    }
  }

  /** @param {string} folder */
  shownByDefault(folder) {
    const saved = this.plugin.settings.folderShown[folder];
    if (typeof saved === "boolean") return saved;
    return !isArchiveGroup(folder);
  }

  /** @param {string} folder */
  async pickVisible(folder) {
    // github#97
    const map = Object.assign(bareMap(), this.plugin.settings.folderShown);
    map[folder] = !this.shownByDefault(folder);
    this.plugin.settings.folderShown = map;
    await this.plugin.saveSettings();
    await this.plugin.applyHiddenDefaults();
    this.redrawColours();
  }

  /**
   * @param {"folderColors" | "subfolderColors" | "tagColors" | "subtagColors"} settingsKey
   * @param {string} mapKey
   * @param {string | null} key
   * @param {"applyFolderColors" | "applySubfolderColors"} applyMethod
   */
  async setOverride(settingsKey, mapKey, key, applyMethod) {
    // github#97
    const map = Object.assign(bareMap(), this.plugin.settings[settingsKey]);
    if (key) map[mapKey] = key; else delete map[mapKey];
    this.plugin.settings[settingsKey] = map;
    await this.plugin.saveSettings();
    await this.plugin[applyMethod]();
    this.redrawColours();
  }

  /** @param {string} folder @param {string | null} key */
  async pick(folder, key) {
    // github#86 -- into the grouping this tab is on
    return this.setOverride(this.colourDim === "tag" ? "tagColors" : "folderColors",
                            folder, key, "applyFolderColors");
  }

  /** @param {string} folder @param {string} sub @param {string | null} key */
  async pickSub(folder, sub, key) {
    return this.setOverride(this.colourDim === "tag" ? "subtagColors" : "subfolderColors",
                            folder + "/" + sub, key, "applySubfolderColors");
  }
}

class VaultGraphPlugin extends Plugin {
  /** @type {Settings} */
  settings = DEFAULTS;
  // github#83 -- the note the next view mount shows, until it is dismissed
  /** @type {import("./update-note.mjs").UpdateNote | null} */
  pendingNote = null;
  /** @type {import("./update-note.mjs").Release[]} */
  pendingChain = [];

  async onload() {
    /** @type {unknown} */
    const saved = await this.loadData();
    /** @type {Settings} */
    this.settings = Object.assign({}, DEFAULTS, saved);

    // github#83, design/0016 -- decided once per load; a shown note is recorded on dismiss
    const verdict = decideNote({
      installed: this.manifest.version,
      lastSeen: this.settings.lastSeenVersion,
      hadData: saved !== null && saved !== undefined,
      note: parseNote(WHATS_NEW).note,
    });
    this.pendingNote = verdict.show;
    this.pendingChain = verdict.show
      ? releaseChain({ releases: RELEASES, lastSeen: this.settings.lastSeenVersion,
                       installed: this.manifest.version, note: verdict.show })
      : [];
    if (verdict.record) await this.recordVersion(saved);
    this.addSettingTab(new VaultGraphSettingTab(this.app, this));

    this.registerView(VIEW_TYPE, (leaf) => new VaultGraphView(leaf, this));

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

  // github#83, design/0016 -- the marker alone, never the defaults onto an empty file
  /** @param {unknown} [saved] */
  async recordVersion(saved) {
    /** @type {unknown} */
    const disk = saved === undefined ? await this.loadData() : saved;
    const base = disk && typeof disk === "object" ? /** @type {Record<string, unknown>} */ (disk) : {};
    this.settings.lastSeenVersion = this.manifest.version;
    await this.saveData(Object.assign({}, base, { lastSeenVersion: this.manifest.version }));
  }

  // github#70, design/0016 -- the stamp alone onto what is on disk, like recordVersion
  async stampOpen() {
    /** @type {unknown} */
    const disk = await this.loadData();
    const base = disk && typeof disk === "object" ? /** @type {Record<string, unknown>} */ (disk) : {};
    this.settings.lastSeen = Date.now();
    await this.saveData(Object.assign({}, base, { lastSeen: this.settings.lastSeen }));
  }

  openSettings() {
    const setting = /** @type {AppWithSetting} */ (this.app).setting;
    if (!setting || typeof setting.open !== "function") {
      new Notice("Open the plugin's settings tab from the community plugins list.");
      return;
    }
    setting.open();
    if (typeof setting.openTabById === "function") setting.openTabById(this.manifest.id);
  }

  async applyFolderColors() {
    const view = await this.currentView();
    const api = view && view.handle && view.handle.api;
    if (api && api.setFolderColors) api.setFolderColors(this.settings.folderColors);
  }

  async applySubfolderColors() {
    const view = await this.currentView();
    const api = view && view.handle && view.handle.api;
    if (api && api.setSubfolderColors) api.setSubfolderColors(this.settings.subfolderColors);
  }

  async applyHiddenDefaults() {
    const view = await this.currentView();
    const api = view && view.handle && view.handle.api;
    if (!api || !api.setFolderShown) return;
    api.setFolderShown(this.settings.folderShown);
    if (api.setPanEnabled) api.setPanEnabled(this.settings.panEnabled !== false);
    if (api.setCompactAxis) api.setCompactAxis(this.settings.compactAxis !== false);
    if (api.setUnlinkedByFolder) api.setUnlinkedByFolder(this.settings.unlinkedByFolder !== false);
    if (api.setUnlinkedTintByFolder) api.setUnlinkedTintByFolder(this.settings.unlinkedTintByFolder === true);
    if (api.setCountBars) api.setCountBars(this.settings.countBars !== false);
    // github#164
    if (api.setRootInOrder) api.setRootInOrder(this.settings.rootInOrder === true);
    // github#165
    if (api.setDevTools) api.setDevTools(this.settings.devTools === true);
    if (api.setFitCap) api.setFitCap(this.settings.fitCap !== false);
    // github#71
    // github#71 -- only push a STORED choice, never a default
    if (api.setFolderOrder && this.settings.folderOrder) api.setFolderOrder(this.settings.folderOrder);
    if (api.applyHiddenDefaults) api.applyHiddenDefaults();
  }

  async rebuildViews() {
    const view = await this.currentView();
    if (view) await view.render();
  }

  async activate() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) { await this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}

export default VaultGraphPlugin;
