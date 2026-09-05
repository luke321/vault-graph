// github#58

/* ===================================================================== types ==
 * The three boundaries of this file, as JSDoc (github#60, batch 2): what comes IN as data
 * and deps, and what goes OUT as the __vg api. Comments only -- the exporter still inlines
 * this file as text and the plugin still bundles it as JavaScript; typescript-eslint reads
 * these through tsconfig.json's allowJs, and plugin/main.js imports them as
 * `import("../src/page.js").X`. Typedefs live at module scope for that reason: one declared
 * inside mountVaultGraph would be local to it.
 *
 * THE STORE AND THE RENDERER ARE TYPED AS EXACTLY THE MEMBERS THIS FILE CALLS and nothing
 * more -- the interfaces in src/engine/types.ts, which github#58 measured off the two vendored
 * bundles (graphology, Sigma) before replacing both with the engine under src/engine. Anything
 * a future caller needs that is not named there shows up on the meter, which is the point.
 */

/**
 * One note, as both producers emit it: src/build-graph.mjs into the standalone file, and
 * plugin/main.js's buildData from Obsidian's metadata cache. Nothing checked the two agreed
 * before this typedef; now the plugin's buildData is read against it.
 * @typedef {Object} VaultNode
 * @property {string} id           vault-relative path with "/" separators, or "ghost:<name>"
 * @property {string} label        the note's basename
 * @property {string} folder       first path segment; "(vault root)" or "(unresolved)"
 * @property {string[]} dirs       the named folders below it, month folders handled
 * @property {string} sub          dirs[0] or ""
 * @property {string} type         inferred note type ("note", "daily", "person", ...)
 * @property {string[]} tags
 * @property {string} created      YYYY-MM-DD, or ""
 * @property {string} touched      YYYY-MM-DD, or ""
 * @property {number} words
 * @property {number} deg          link degree, counted by the producer
 * @property {boolean} [ghost]     true for an unresolved-link placeholder
 */

/** @typedef {{ s: number, t: number, w: number }} VaultEdge */

/**
 * @typedef {Object} VaultStats
 * @property {number} files
 * @property {number} nodes
 * @property {number} edges
 * @property {number} unresolved
 * @property {number} orphans
 * @property {{ frontmatter: number, filename: number, stamp: number, none: number }} dates
 * @property {boolean} templatesExcluded
 * @property {boolean} ghostsIncluded
 */

/**
 * What mountVaultGraph is handed as `data`, from either producer.
 * @typedef {Object} VaultData
 * @property {string} vault          the vault's name
 * @property {string} generated      "YYYY-MM-DD HH:mm"
 * @property {VaultNode[]} nodes
 * @property {VaultEdge[]} edges
 * @property {VaultStats} stats
 * @property {boolean} [dev]         a --dev build of the standalone; nothing else sets it
 */

/**
 * The attributes this file puts on every graph node at addNode, and reads back. Declared in
 * src/engine/types.ts since github#58 -- the store and the renderer are checked against the
 * same declaration this file is -- and imported here as TYPES ONLY: the exporter still pastes
 * this file as text, and a JSDoc import is a comment to it.
 * @typedef {import("./engine/types").NodeAttrs} NodeAttrs
 * @typedef {import("./engine/types").EdgeAttrs} EdgeAttrs
 */

/**
 * The graph store: a keyed attribute bag with degree, ours since github#58 (src/engine/store.ts).
 * It has no event surface -- graphology's listener trio was used here for one thing, silencing
 * Sigma's subscription to the graph during bulk position writes, and both went together.
 * @typedef {import("./engine/types").GraphStore} GraphLike
 * @typedef {import("./engine/types").GraphStoreCtor} GraphCtor
 */

/** @typedef {import("./engine/types").Point} Point */
/** @typedef {import("./engine/types").CameraState} CameraState */
/** @typedef {import("./engine/types").Camera} CameraLike */
/** @typedef {import("./engine/types").NodeDisplayData} NodeDisplayData */
/** @typedef {import("./engine/types").EdgeDisplayData} EdgeDisplayData */
/** @typedef {import("./engine/types").RendererSettings} RendererSettings */
/** @typedef {import("./engine/types").MouseCoords} MouseCoords */
/** @typedef {{ node?: string, event: MouseCoords, preventDefault?: () => void }} RendererEvent */
// github#58
/** @typedef {import("./engine/types").Renderer} RendererLike */
/** @typedef {import("./engine/types").RendererCtor} RendererCtor */

/** @typedef {Record<string, string>} SlotMap */

/**
 * What mountVaultGraph is handed as `deps`. The header comment above says what each one is
 * for; this is the shape. Two constructors are required, the rest is optional and absent
 * means the documented default.
 * @typedef {Object} MountDeps
 * @property {GraphCtor} Graph
 * @property {RendererCtor} Renderer
 * @property {string} [logoMask]
 * @property {Window} [win]
 * @property {Document} [doc]
 * @property {SlotMap} [folderColors]
 * @property {SlotMap} [subfolderColors]
 * @property {Record<string, boolean>} [folderShown]
 * @property {boolean} [panEnabled]
 * @property {boolean} [compactAxis]
 * @property {boolean} [unlinkedByFolder]
 * @property {boolean} [unlinkedTintByFolder]
 * @property {string[]} [pinned]
 * @property {boolean} [settingsUI]
 * @property {() => void} [openSettings]
 * @property {(map: SlotMap) => void | Promise<void>} [onFolderColors]
 * @property {(map: SlotMap) => void | Promise<void>} [onSubfolderColors]
 * @property {(map: Record<string, boolean>) => void | Promise<void>} [onFolderShown]
 * @property {(v: boolean) => void | Promise<void>} [onPanEnabled]
 * @property {(v: boolean) => void | Promise<void>} [onCompactAxis]
 * @property {(v: boolean) => void | Promise<void>} [onUnlinkedByFolder]
 * @property {(v: boolean) => void | Promise<void>} [onUnlinkedTintByFolder]
 * @property {(ids: string[]) => void | Promise<void>} [onPinned]
 * @property {() => void} [onRefresh]
 */

/** @typedef {{ key: string, name: string, hex: string }} PaletteSlot */

/**
 * @typedef {Object} PlanParityReport
 * @property {number} shown
 * @property {number} threshold
 * @property {boolean} onlyVisible
 * @property {number} staticMaxR
 * @property {number} liveMaxR
 * @property {boolean} maxRMatches
 * @property {number} cellsStatic
 * @property {number} cellsLive
 * @property {Record<string, { staticPlan: number, livePlan: number }>} rowDiffs
 * @property {boolean} parityOK
 */

/**
 * The __vg api: what mountVaultGraph builds once its deferred init has run, and what
 * plugin/main.js and the settings UIs call. THESE 21 MEMBERS SHIP IN THE PLUGIN. The
 * standalone build adds ~70 more -- state, alpha, demo, probe and the rest of the debug
 * surface the invariant suite drives -- through Object.defineProperties inside the region
 * scripts/build-plugin.mjs strips, so they are deliberately not part of this type: nothing
 * typed consumes them (the suite reaches them by name over CDP), and naming them here would
 * let the plugin claim members it does not have.
 * @typedef {Object} VgApi
 * @property {GraphLike} graph
 * @property {RendererLike | undefined} renderer   set by makeRenderer() before the api exists; a getter, so a host reads the live one
 * @property {() => void} readTheme
 * @property {() => void} placeLogo
 * @property {() => PaletteSlot[]} palette
 * @property {() => string[]} groupOrder
 * @property {(group: string) => number} groupCount
 * @property {(group: string) => string} slotOf
 * @property {(group: string) => string} autoSlotOf
 * @property {(map: SlotMap) => void} setFolderColors
 * @property {(map: SlotMap) => void} setSubfolderColors
 * @property {(map: Record<string, boolean>) => void} setFolderShown
 * @property {(v: boolean) => void} setPanEnabled
 * @property {(v: boolean) => void} setCompactAxis
 * @property {(v: boolean) => void} setUnlinkedByFolder
 * @property {(v: boolean) => void} setUnlinkedTintByFolder
 * @property {() => void} applyHiddenDefaults
 * @property {() => void} heatBuild
 * @property {() => PlanParityReport} checkPlanParity
 * @property {() => unknown} checkFocusWeb
 * @property {() => unknown} debugDump
 */

/**
 * What mountVaultGraph returns: a getter onto the api, which does not exist until the
 * deferred init has run -- see the comment at the return statement for why a getter -- and
 * destroy(), which releases everything the mount holds outside its root (github#62).
 * @typedef {{ readonly api: VgApi | null, readonly ready: boolean, destroy: () => void }} MountHandle
 */

/**
 * @param {HTMLElement} root
 * @param {VaultData} data
 * @param {MountDeps} deps
 * @returns {MountHandle}
 */
function mountVaultGraph(root, data, deps) {
  "use strict";

  /**
   * A prototype-less dictionary, typed. Object.create(null) is `any` to the type program
   * and a cast at the call site is read as the expression inside it, so this is the ONE
   * place that any is laundered -- through unknown, once -- and every dictionary in this
   * file declares its own shape where it is made: `@type {Record<string, number>}` on the
   * var, `= dict()` after it. Same object as Object.create(null) gave (no prototype, so a
   * folder named "constructor" or "toString" is just a key); nothing about behaviour
   * changed. github#60.
   * @template T
   * @returns {Record<string, T>}
   */
  function dict() {
    /** @type {unknown} */
    var o = Object.create(null);
    return /** @type {Record<string, T>} */ (o);
  }

  var DATA = data;
  var Graph = deps.Graph;
  var RendererCls = deps.Renderer;
  var LOGO_MASK = deps.logoMask || "";
  var WIN = deps.win || window;
  var DOC = deps.doc || (root && root.ownerDocument) || (WIN && WIN.document) || null;
  /** @type {VgApi | null} */
  var API = null;
  /**
   * TEARDOWN. Everything this mount registers OUTSIDE its own root -- a ResizeObserver, a
   * listener on the document or the window, a timer that would call back into it -- pushes
   * the function that undoes it here, at the site that registered it, and destroy() runs
   * the list in reverse. Kept as a list rather than as named fields because the sites are
   * scattered across ten thousand lines and a field somebody forgets to add is exactly the
   * leak this exists to stop (github#62): before it, every view close and every Refresh in
   * Obsidian left the whole mount -- graph, layout arrays, legend DOM -- alive through one
   * more document mousemove listener and one more visibilitychange listener that nothing
   * removed. Measured over six kill+remount cycles on the 10k fixture: +579 DOM nodes,
   * +131 listeners and +7 MB of post-GC heap per cycle.
   * @type {(() => void)[]}
   */
  var onDestroy = [];
  var dead = false;

  var ID = "vg-";
  /**
   * One of the page's own elements by its bare id, the `vg-` prefix added here rather than
   * at the ~200 call sites. Typed as HTMLElement rather than Element: every id here belongs
   * to markup this file owns (src/page.html), and callers set `.style`, `.hidden` and
   * `.textContent` on the result. A caller wanting an input's `.value` or a canvas's context
   * casts at its own site, which is where the narrower claim belongs.
   * THE LINE BELOW IS MATCHED VERBATIM by scripts/check-scope.mjs, which asserts the accessor
   * is still the root-scoped form, character for character. So the type is declared here
   * rather than as a cast inside the line, which fails that check.
   *
   * @param {string} id
   * @returns {HTMLElement}
   */
  var $ = function (id) { return root.querySelector("#" + ID + id); };

  var ROOT = root;
  /** @param {HTMLElement} el @param {string} html */
  var setHTML = function (el, html) {
    var parsed = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
    el.replaceChildren.apply(el, Array.prototype.slice.call(parsed.body.childNodes));
  };

  /** @param {string} name */
  var css = function (name) {
    return getComputedStyle(ROOT).getPropertyValue(name).trim();
  };

  /** @param {number} c */
  var s2lin = function (c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  /** @param {number} c */
  var lin2s = function (c) {
    c = Math.max(0, Math.min(1, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  /** @param {string} h */
  function relLum(h) {
    h = String(h).trim().replace(/^#/, "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var c = [0, 2, 4].map(function (i) { return s2lin(parseInt(h.slice(i, i + 2), 16) / 255); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  /** @param {string} h @returns {number[]} OKLab, [L, a, b] */
  function hex2lab(h) {
    h = String(h).trim().replace(/^#/, "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = s2lin(parseInt(h.slice(0, 2), 16) / 255),
        g = s2lin(parseInt(h.slice(2, 4), 16) / 255),
        b = s2lin(parseInt(h.slice(4, 6), 16) / 255);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
        m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
        s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s2,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s2,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s2];
  }
  /** @param {number} L @param {number} A @param {number} B */
  function lab2hex(L, A, B) {
    var l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3),
        m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3),
        s2 = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
    var rgb = [
      lin2s(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s2),
      lin2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s2),
      lin2s(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s2)
    ];
    return "#" + rgb.map(function (v) {
      var n = Math.round(v * 255).toString(16);
      return n.length < 2 ? "0" + n : n;
    }).join("");
  }
  /** @param {string} hex @param {number} dh hue turn, degrees @param {number} dL lightness step */
  function shade(hex, dh, dL) {
    var lab = hex2lab(hex), C = Math.hypot(lab[1], lab[2]);
    var h = Math.atan2(lab[2], lab[1]) + dh * Math.PI / 180;
    var L = Math.max(0.18, Math.min(0.92, lab[0] + dL));
    return lab2hex(L, C * Math.cos(h), C * Math.sin(h));
  }

  // design/0004
  var SLOT_NAMES = ["Blue", "Orange", "Aqua", "Yellow", "Green", "Magenta",
                    "Violet", "Red", "Cyan", "Orchid", "Grey", "Slate"];

  /**
   * The palette, snapshotted from CSS by readTheme() -- once at init, again when the host
   * says the theme changed.
   * @typedef {Object} Theme
   * @property {boolean} dark
   * @property {string} text
   * @property {string} dim
   * @property {string} today
   * @property {string} edge
   * @property {string} edgeHi
   * @property {string} surface
   * @property {string} hoverBg
   * @property {string} hoverBorder
   * @property {string[]} slots          the twelve group colours, g1..g12
   * @property {string[]} neutrals
   * @property {Record<string, string>} byKey   "g7" -> its hex
   */
  var THEME = /** @type {Theme} */ ({});
  function readTheme() {
    var surf = css("--surface-1");
    THEME = {
      dark:        relLum(surf) < 0.4,
      text:        css("--text-1"),
      dim:         css("--dim"),
      today:       css("--today"),
      edge:        css("--edge"),
      edgeHi:      css("--edge-hi"),
      surface:     surf,
      hoverBg:     css("--surface-2"),
      hoverBorder: css("--border-strong"),
      slots:    ["--g1", "--g2", "--g3", "--g4", "--g5", "--g6",
                 "--g7", "--g8", "--g9", "--g10", "--g11", "--g12"].map(css),
      neutrals: ["--n1", "--n2", "--n3"].map(css)
    };
    THEME.byKey = dict();
    THEME.slots.forEach(function (hex, i) { THEME.byKey["g" + (i + 1)] = hex; });
    if (renderer) renderer.setSetting("labelColor", THEME.text);
  }
  readTheme();

  /** @param {Record<string, unknown> | undefined} raw @returns {SlotMap} */
  function cleanSlotMap(raw) {
    /** @type {SlotMap} */
    var out = dict();
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (k) {
      var v = raw[k];
      if (typeof v === "string" && /^g([1-9]|1[0-2])$/.test(v)) out[k] = v;
    });
    return out;
  }
  var folderColors = cleanSlotMap(deps.folderColors);
  var subfolderColors = cleanSlotMap(deps.subfolderColors);

  // github#4
  var panEnabled = deps.panEnabled === false ? false : true;
  var onPanEnabled = typeof deps.onPanEnabled === "function" ? deps.onPanEnabled : null;

  // github#23
  var compactAxis = deps.compactAxis === false ? false : true;
  var onCompactAxis = typeof deps.onCompactAxis === "function" ? deps.onCompactAxis : null;

  // github#3
  var unlinkedByFolder = deps.unlinkedByFolder === false ? false : true;
  var onUnlinkedByFolder = typeof deps.onUnlinkedByFolder === "function" ? deps.onUnlinkedByFolder : null;

  // github#3
  var unlinkedTintByFolder = deps.unlinkedTintByFolder === true ? true : false;
  var onUnlinkedTintByFolder = typeof deps.onUnlinkedTintByFolder === "function" ? deps.onUnlinkedTintByFolder : null;

  /** @param {string} g */
  function isArchiveGroup(g) { return String(g).charAt(0) === "_"; }

  var ARCHIVE_SLOT = "g11";

  /** @param {boolean} on */
  function eyeSvg(on) {
    var lid = '<path d="M1.6 8S4 3.9 8 3.9 14.4 8 14.4 8 12 12.1 8 12.1 1.6 8 1.6 8z"' +
              ' fill="none" stroke="currentColor" stroke-width="1.25"/>';
    return '<svg viewBox="0 0 16 16" aria-hidden="true">' + lid +
      (on ? '<circle cx="8" cy="8" r="2" fill="currentColor"/>'
          : '<path d="M3 13L13 3" stroke="currentColor" stroke-width="1.25"/>') +
      '</svg>';
  }

  // github#3
  /** @param {boolean} on */
  function dotSvg(on) {
    return '<svg viewBox="0 0 16 16" aria-hidden="true">' +
      (on ? '<circle cx="8" cy="8" r="5" fill="currentColor"/>'
          : '<circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.25"/>') +
      '</svg>';
  }

  /** @param {boolean} on */
  function pinSvg(on) {
    var head = '<circle cx="8" cy="5.6" r="3.35" ' +
      (on ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.25"') + '/>';
    var point = '<path d="M8 8.8V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 16 16" aria-hidden="true">' + head + point + '</svg>';
  }

  /** @param {string} attrs "" for a leaf, which gets a spacer instead of a button @param {boolean} open */
  function twBtn(attrs, open) {
    return attrs
      ? '<button class="tw" ' + attrs + ' aria-expanded="' + open + '">' +
        (open ? "▾" : "▸") + '</button>'
      : '<span class="tw none">▸</span>';
  }

  /** @param {Record<string, unknown> | undefined} raw @returns {Record<string, boolean>} */
  function cleanFolderShown(raw) {
    /** @type {Record<string, boolean>} */
    var out = dict();
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (g) {
      if (typeof raw[g] === "boolean") out[g] = raw[g];
    });
    return out;
  }
  var folderShown = cleanFolderShown(deps.folderShown);

  /** @param {string} g */
  function hiddenByDefault(g) {
    if (typeof folderShown[g] === "boolean") return !folderShown[g];
    return isArchiveGroup(g);
  }
  var SETTINGS_UI = !!deps.settingsUI;
  var openHostSettings = typeof deps.openSettings === "function" ? deps.openSettings : null;
  var saveFolderColors = typeof deps.onFolderColors === "function" ? deps.onFolderColors : null;
  var saveSubfolderColors = typeof deps.onSubfolderColors === "function" ? deps.onSubfolderColors : null;
  var saveFolderShown = typeof deps.onFolderShown === "function" ? deps.onFolderShown : null;
  var savePinned = typeof deps.onPinned === "function" ? deps.onPinned : null;

  /* ------------------------------------------------------------------ state */

  /**
   * Everything the disc is currently showing, and how. One object, mutated in place; the
   * cascade and the legend read it, the UI writes it.
   * @typedef {Object} State
   * @property {string} dim                                    grouping dimension; "folder"
   * @property {string} layout
   * @property {Record<string, boolean>} hiddenSub             "folder/sub" -> true
   * @property {Record<string, Record<string, boolean>>} hidden   dim -> { group: true }
   * @property {Record<string, boolean>} highlight             group -> true
   * @property {Record<string, boolean>} highlightSub          "folder/sub" -> true
   * @property {string | null} hoverGroup
   * @property {Record<string, boolean>} hoverSub
   * @property {Record<string, boolean>} collapsed
   * @property {Record<string, boolean>} tailOpen
   * @property {Record<string, boolean>} pathOpen
   * @property {string | null} selected                        node id
   * @property {string | null} hovered                         node id
   * @property {string | null} markDay                         heatmap cell key
   * @property {string | null} hoverDay
   * @property {number | null} hoverYear
   * @property {string} query
   * @property {number | null} until                           timeline rank, or null for all
   * @property {number | null} from                            ms, UTC midnight (heatParse)
   * @property {number | null} to
   * @property {number | null} heatEnd
   * @property {boolean} curveEdges
   * @property {boolean} logoTwoRing
   * @property {string[]} pinned
   */
  /** @type {State} */
  var state = {
    dim: "folder",
    layout: "rings",
    hiddenSub: dict(),
    hidden: dict(),
    highlight: dict(),
    highlightSub: dict(),
    hoverGroup: null,
    hoverSub: dict(),
    collapsed: dict(),
    tailOpen: dict(),
    pathOpen: dict(),
    selected: null,
    hovered: null,
    markDay: null,
    hoverDay: null,
    hoverYear: null,
    query: "",
    until: null,
    from: null,
    to: null,
    heatEnd: null,
    curveEdges: true,
    logoTwoRing: true,
    pinned: []
  };

  /* ------------------------------------------------- graph + base layout */

  var graph = new Graph();

  DATA.nodes.forEach(function (n, i) {
    graph.addNode(String(i), {
      label: n.label, x: 0, y: 0, size: 4,
      folder: n.folder, sub: n.sub || "", dirs: n.dirs || [], ntype: n.type || "note",
      tags: n.tags || [], path: n.id, deg: n.deg,
      created: n.created || "", touched: n.touched || "",
      words: n.words || 0, ghost: !!n.ghost
    });
  });
  // github#43
  var EDGE_RAMP_START = 2000, EDGE_RAMP_END = 10000, EDGE_FLOOR = 0.10;
  /** @type {Record<string, { o: string, w: number }[]>} */
  var adj = dict();
  var EDGE_TOTAL = 0;
  // github#43, github#42
  var EDGE_SIZE = 0.60;
  var EDGE_SIZE_LIT = 1.4;
  // github#43
  var EDGE_SIZE_MAX = EDGE_SIZE_LIT;
  /** @param {number} w @returns {EdgeAttrs} */
  var edgeAttrsOf = function (w) { return { weight: w, size: EDGE_SIZE }; };
  var EDGE_SHOWN = 0;
  var lazyEdges = false;
  (function () {
    /** @type {Record<string, number>} */
    var seen = dict();
    /** @type {{ a: string, b: string, w: number, k: string }[]} */
    var list = [];
    DATA.edges.forEach(function (e) {
      var a = String(e.s), b = String(e.t);
      var k = a < b ? a + "\u0000" + b : b + "\u0000" + a;
      if (seen[k]) return;
      seen[k] = 1;
      EDGE_TOTAL++;
      list.push({ a: a, b: b, w: e.w, k: k });
      (adj[a] || (adj[a] = [])).push({ o: b, w: e.w });
      if (b !== a) (adj[b] || (adj[b] = [])).push({ o: a, w: e.w });
    });
    var share = EDGE_TOTAL <= EDGE_RAMP_START ? 1
      : EDGE_TOTAL >= EDGE_RAMP_END ? EDGE_FLOOR
      : 1 - (1 - EDGE_FLOOR) * (EDGE_TOTAL - EDGE_RAMP_START) / (EDGE_RAMP_END - EDGE_RAMP_START);
    EDGE_SHOWN = Math.round(EDGE_TOTAL * share);
    lazyEdges = EDGE_SHOWN < EDGE_TOTAL;
    if (lazyEdges) {
      list.sort(function (p, q) { return q.w - p.w || (p.k < q.k ? -1 : 1); });
      list.length = EDGE_SHOWN;
    }
    list.forEach(function (e) {
      if (!graph.hasEdge(e.a, e.b)) graph.addUndirectedEdge(e.a, e.b, edgeAttrsOf(e.w));
    });
  })();

  var NODE_MIN = 2.6, NODE_MAX = 11, NODE_ORPHAN = 6;
  graph.forEachNode(function (id, a) {
    graph.setNodeAttribute(id, "size", a.deg === 0
      ? NODE_ORPHAN
      : Math.min(NODE_MAX, NODE_MIN + 1.55 * Math.sqrt(a.deg)));
  });

  // github#58
  /** @type {Record<string, number>} */
  var hubRank = dict();
  (function () {
    graph.nodes().slice().sort(function (a, b) {
      return graph.getNodeAttribute(b, "deg") - graph.getNodeAttribute(a, "deg") ||
             String(graph.getNodeAttribute(a, "label"))
               .localeCompare(String(graph.getNodeAttribute(b, "label")));
    }).forEach(function (id, i) { hubRank[id] = i; });
  })();

  /** @type {Record<string, string[]>} */
  var subOrder = dict();
  /** @type {Record<string, number>} */
  var subCount = dict();
  (function () {
    /** @type {Record<string, Record<string, number>>} */
    var tally = dict();
    graph.forEachNode(function (_id, a) {
      var f = a.folder, sb = a.sub || "";
      if (!tally[f]) tally[f] = dict();
      tally[f][sb] = (tally[f][sb] || 0) + 1;
    });
    Object.keys(tally).forEach(function (f) {
      subOrder[f] = Object.keys(tally[f]).sort(function (x, y) {
        return tally[f][y] - tally[f][x] || x.localeCompare(y);
      });
      subOrder[f].forEach(function (sb) { subCount[f + "/" + sb] = tally[f][sb]; });
    });
  })();

  var UNIT = 160;

 
 
  /* -------------------------------------------------------------- grouping */

  // github#3
  var UNLINKED = "(unlinked)";

  /** @type {Record<string, string> | null} */
  var moveFrom = null;

  /** @param {string} id @returns {string} */
  function groupOf(id) {
    if (moveFrom) { var mf = moveFrom[id]; if (mf !== undefined) return mf; }
    if (!adj[id]) return unlinkedByFolder ? graph.getNodeAttribute(id, "folder") : UNLINKED;
    return graph.getNodeAttribute(id, "folder");
  }

  var SLOT_COUNT = 12;
  /** @type {Record<string, string>} */
  var groupColor = dict();
  /** @type {Record<string, string>} */
  var groupSlot = dict();
  /** @type {Record<string, string>} */
  var groupAutoSlot = dict();
  /** @type {Record<string, string[]>} */
  var order = {};

  /** @returns {Record<string, number>} group -> note count, for the current dim */
  function computeOrder() {
    /** @type {Record<string, number>} */
    var count = {};
    /** @type {Record<string, number>} */
    var filed = dict();
    graph.forEachNode(function (id, a) {
      var g = groupOf(id);
      count[g] = (count[g] || 0) + 1;
      if (state.dim === "folder") filed[a.folder] = (filed[a.folder] || 0) + 1;
    });
    folderCount = filed;
    // github#50
    // github#48
    Object.keys(filed).forEach(function (f) {
      if (count[f] === undefined) count[f] = 0;
    });
    if (count[UNLINKED] === undefined) count[UNLINKED] = 0;
    var names = Object.keys(count).sort(function (a, b) {
      // github#3
      /** @param {string} s */
      var rank = function (s) {
        if (s === UNLINKED) return 3;
        var c = s.charAt(0);
        return c === "_" ? 0 : c === "(" ? 1 : 2;
      };
      return rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true });
    });
    order[state.dim] = names;
    return count;
  }

  /** @type {Record<string, number>} */
  var counts = {};
  // github#50
  /** @type {Record<string, number>} */
  var folderCount = dict();
  function buildColors() {
    groupColor = dict();

    var names = order[state.dim] || [];

    /** @type {SlotMap} */
    var byFolder = state.dim === "folder" ? folderColors : dict();

    groupSlot = dict();
    groupAutoSlot = dict();
    var auto = 0;
    names.forEach(function (g) {
      var k = byFolder[g];
      var picked = (k && THEME.byKey[k]) ? k : "";

      // github#3
      if (isArchiveGroup(g) || g === UNLINKED) {
        var akey = picked || ARCHIVE_SLOT;
        groupColor[g] = THEME.byKey[akey];
        groupSlot[g] = akey;
        groupAutoSlot[g] = ARCHIVE_SLOT;
        return;
      }

      var key = "g" + ((auto++ % SLOT_COUNT) + 1);
      var use = picked || key;
      groupColor[g] = THEME.byKey[use];
      groupSlot[g] = use;
      groupAutoSlot[g] = key;
    });
    buildSubShades();
    buildUnlinkedTint();
  }

  /** @returns {PaletteSlot[]} */
  function paletteInfo() {
    return SLOT_NAMES.map(function (name, i) {
      return { key: "g" + (i + 1), name: name, hex: THEME.slots[i] };
    });
  }

  /** @param {Record<string, unknown>} map */
  function applyFolderShown(map) {
    folderShown = cleanFolderShown(map);
    return folderShown;
  }

  /** @param {Record<string, unknown>} map */
  function applyFolderColors(map) {
    folderColors = cleanSlotMap(map);
    buildColors();
    if (renderer) renderer.refresh();
    try { placeLogo(); } catch { }
    try { heatBuild(); } catch { }
    try { buildLegend(); } catch { }
    return folderColors;
  }

  /** @param {Record<string, unknown>} map */
  function applySubfolderColors(map) {
    subfolderColors = cleanSlotMap(map);
    buildSubShades();
    if (renderer) renderer.refresh();
    try { placeLogo(); } catch { }
    try { heatBuild(); } catch { }
    try { buildLegend(); } catch { }
    return subfolderColors;
  }

  /** @param {string} g */
  function groupHasPinnedSub(g) {
    return (subOrder[g] || []).some(function (sb) {
      return !!subfolderColors[g + "/" + sb];
    });
  }

  // github#48
  /** @type {Record<string, string> | null} */
  var colorShown = null;
  var colorRaf = 0, colorPrev = 0;

  /** @param {string} group @returns {string} */
  function colorOf(group) {
    if (colorShown) { var c = colorShown[group]; if (c) return c; }
    return groupColor[group] || THEME.neutrals[0];
  }

  /** @param {Record<string, string> | null} before group -> hex, as it was */
  function colorWalk(before) {
    if (!before || !renderer) return;
    /** @type {Record<string, string> | null} */
    var origin = null;
    Object.keys(groupColor).forEach(function (g) {
      var was = before[g];
      if (was && was !== groupColor[g]) (origin || (origin = dict()))[g] = was;
    });
    if (!origin) return;
    if (colorRaf) { WIN.cancelAnimationFrame(colorRaf); colorRaf = 0; }
    colorShown = origin;
    var t = 0;
    colorPrev = NOW();
    (function step() {
      var now = NOW(), dt = now - colorPrev;
      colorPrev = now;
      t += Math.min(dt, TWEEN_MS) / (TWEEN_MS * TIME_SCALE);
      if (t > 1) t = 1;
      var e = t * t * (3 - 2 * t);
      /** @type {Record<string, string>} */
      var next = dict();
      Object.keys(origin).forEach(function (g) { next[g] = mixHex(origin[g], groupColor[g], e); });
      colorShown = next;
      renderer.refresh({ skipIndexation: true });
      if (t < 1) { colorRaf = WIN.requestAnimationFrame(step); return; }
      colorRaf = 0;
      colorShown = null;
      renderer.refresh({ skipIndexation: true });
    })();
  }

  /** @type {Record<string, string>} */
  var subShade = dict();
  /** @type {Record<string, string>} */
  var subSlot = dict();

  /** @type {string[]} */
  var unlinkedTintColors = [];

  var SLICE_GAP = 2;
  var SUB_GAP = 0.3;
  var EDGE_PAD_ARC = 0;
  var EDGE_PAD_MAX = 0;
  var INNER_SCALE = 0.8;
  // github#35
  var HUB_ROW0_FRAC = 0.08;
  var INNER_FILL = 0.8;
  var GAP_BAND = { i: 0.5, o: 1 };
  var CLEAR_OF_ROOM = 0.12;

  var MIN_SPAN = 6 * Math.PI / 180;
  var HL_PUSH = 0.9;

  // github#13
  var DENSITY_MAX = 2.6;

  /**
   * One of the two bands the disc is laid out in.
   * @typedef {Object} Band
   * @property {"i" | "o"} key
   * @property {number} sp        row pitch, in units
   * @property {number} rows
   * @property {number} room
   * @property {{ m: number, b: number, lo: number }} ramp
   * @property {number} gapDeg
   * @property {number} nG
   * @property {number} [nSub]   subfolder boundaries in this band, set by the allocator
   */
  /** @type {{ i: Band, o: Band } | null} */
  var BAND = null;
  /** @param {string} k "i" or "o" @returns {Band} */
  function bandOf(k) {
    if (!BAND) {
      BAND = {
        i: { key: "i", sp: 1, rows: 0, room: 0, ramp: { m: 1, b: 0, lo: 0 }, gapDeg: 0, nG: 0 },
        o: { key: "o", sp: 1, rows: 0, room: 0, ramp: { m: 1, b: 0, lo: 0 }, gapDeg: 0, nG: 0 },
      };
    }
    return k === "i" ? BAND.i : BAND.o;
  }
  /** @param {string} k */
  function bandScale(k) { return k === "i" ? INNER_SCALE : 1; }

  /** @param {string} band */
  function pitchUnits(band) {
    return UNIT * (bandOf(band).sp || 1) * bandScale(band);
  }

  var NEST_MIN = 2;
  var SMALL_GROUP = 0;
  var SUB_SLOTS = 4;
  var SUB_NAMED = 3;
  var HUE_BUDGET_FRACTION = 0.60;
  var SUB_L_SPAN = 0.28;
  var SUB_L_LIMIT = 0.90;

  /** @param {string} hex */
  function hueOf(hex) {
    var l = hex2lab(hex);
    return ((Math.atan2(l[2], l[1]) * 180 / Math.PI) % 360 + 360) % 360;
  }
  /** @param {string} basecol */
  function hueBudget(basecol) {
    var h = hueOf(basecol), gap = 180;
    Object.keys(groupColor).forEach(function (g) {
      var c = groupColor[g];
      if (c === basecol) return;
      var lab = hex2lab(c);
      if (Math.hypot(lab[1], lab[2]) < 0.02) return;
      var d = Math.abs(h - hueOf(c));
      d = Math.min(d, 360 - d);
      if (d < gap) gap = d;
    });
    return gap * HUE_BUDGET_FRACTION;
  }

  /** @param {string} folder @param {string} sub */
  function subTintIndex(folder, sub) {
    var subs = subOrder[folder] || [];
    var k = subs.indexOf(sub || "");
    return k < 0 ? 0 : Math.min(k, SUB_SLOTS - 1);
  }

  // github#18
  // github#31
  /** @param {string} folder @param {string} sub @param {number} n @param {number} [depth] */
  function subCellIndex(folder, sub, n, depth) {
    var idx = subTintIndex(folder, sub);
    if (idx === SUB_SLOTS - 1) return idx;
    return n >= (depth || REF_ROWS) ? idx : SUB_SLOTS - 1;
  }

  function buildSubShades() {
    subShade = dict();
    subSlot = dict();
    Object.keys(subOrder).forEach(function (f) {
      var subs = subOrder[f];
      var basecol = colorOf(f);
      var lab = hex2lab(basecol);
      var grey = Math.hypot(lab[1], lab[2]) < 0.02;
      var haveLadder = subs.length >= 2 && !grey;
      var sign = THEME.dark ? 1 : -1;
      var budget = haveLadder ? hueBudget(basecol) : 0;
      var Lend = haveLadder
        ? (THEME.dark ? Math.min(SUB_L_LIMIT, lab[0] + SUB_L_SPAN)
                      : Math.max(1 - SUB_L_LIMIT, lab[0] - SUB_L_SPAN))
        : 0;
      subs.forEach(function (sb) {
        var pk = f + "/" + sb;
        var pin = subfolderColors[pk];
        if (pin && THEME.byKey[pin]) {
          subShade[pk] = THEME.byKey[pin];
          subSlot[pk] = pin;
          return;
        }
        subSlot[pk] = "";
        if (subs.length < 2) return;
        if (grey) { subShade[pk] = basecol; return; }
        var t = subTintIndex(f, sb) / (SUB_SLOTS - 1);
        subShade[pk] = shade(basecol, sign * budget * t, (Lend - lab[0]) * t);
      });
    });
  }

  var UNLINKED_TINT_CAP = 6;

  function buildUnlinkedTint() {
    unlinkedTintColors = [];
    /** @type {Record<string, boolean>} */
    var seen = dict();
    graph.forEachNode(function (id) {
      if (unlinkedTintColors.length >= UNLINKED_TINT_CAP) return;
      if (groupOf(id) !== UNLINKED) return;
      var a = graph.getNodeAttributes(id);
      var c = subShade[a.folder + "/" + (a.sub || "")] || colorOf(a.folder);
      if (seen[c]) return;
      seen[c] = true;
      unlinkedTintColors.push(c);
    });
  }

  // github#3
  // github#3
  /** @param {string} id @returns {string} */
  function nodeColor(id) {
    var a = graph.getNodeAttributes(id);
    if (state.dim !== "folder") return colorOf(groupOf(id));
    if (groupOf(id) === UNLINKED && !unlinkedTintByFolder) return colorOf(UNLINKED);
    return subShade[a.folder + "/" + (a.sub || "")] || colorOf(a.folder);
  }

  /** @param {string} group */
  function isHidden(group) {
    var h = state.hidden[state.dim];
    return !!(h && h[group]);
  }

  /* --------------------------------------------------- positions per group */

 

  /* ------------------------------------------------------- rings layout */

  // github#60
  /** @typedef {Record<string, number>} BandNum */
  /**
   * One placed note inside a cell.
   * @typedef {Object} Slot
   * @property {string} id
   * @property {number} r        row radius in units (times UNIT for graph units)
   * @property {number} u        position along the cell's arc, 0..1
   * @property {number} row
   * @property {number} eA       dot size at this row's leading edge
   * @property {number} eB       and at its trailing edge
   */
  /**
   * A wedge cell: one group, one subfolder slice of a group, or the shared wedge of the
   * small groups (MERGED). Made as { g, k, list } and filled in as the plan proceeds --
   * every other field is written before anything reads it.
   * @typedef {Object} Cell
   * @property {string} g
   * @property {string} k          g, or g + SEP + subfolder cell index
   * @property {string[]} list     node ids, hub-rank order
   * @property {number} wsum
   * @property {boolean} inner
   * @property {number} band       arc share, radians
   * @property {number} bandRef    the share the rows were solved against
   * @property {number} pad
   * @property {number} rows
   * @property {Slot[]} slots
   * @property {number} geom       ringsLayout: geometric presence this frame
   * @property {number} live       ringsLayout: alpha-weighted presence this frame
   * @property {number} span
   * @property {number} pLead
   * @property {number} pTrail
   * @property {number} nB
   * @property {string} bandKey
   */
  /**
   * What buildWedgePlan returns.
   * @typedef {Object} Plan
   * @property {Cell[]} cells
   * @property {number} maxR
   * @property {number} total
   * @property {number} r0
   * @property {number} rOuter
   * @property {number} sp
   * @property {number} spInner
   * @property {number} density
   * @property {BandNum} room
   * @property {Record<string, number>} dbgLive
   * @property {Record<string, boolean>} dbgSplit
   * @property {Record<string, number>} presMax
   * @property {BandNum} rows
   */
  /**
   * The radii and band totals frozen at load -- see where it is set, below the legend.
   * @typedef {Object} GeomLock
   * @property {number} r0
   * @property {number} rOuter
   * @property {number} maxR
   * @property {number} total
   * @property {BandNum} bandTotal
   * @property {BandNum} bandR
   * @property {BandNum} rows
   */
  /**
   * buildWedgePlan's fourth argument when it is not a bare density: the previous plan's
   * spacings, room and depth, held so a re-plan does not move what it should not.
   * @typedef {{ i?: number, o?: number, room?: BandNum, depth?: BandNum }} SpHold
   */
  /**
   * @typedef {Object} AllocOpts
   * @property {boolean} subGaps
   * @property {number | null} clamp
   * @property {number} totFloor
   * @property {string} band
   * @property {Record<string, number>} [groupPres]
   */

  /** @type {Record<string, boolean> | null} */
  var bandLock = null;
  /** @type {GeomLock | null} */
  var geomLock = null;
  /**
   * One cell as the wedge-debug overlay records it: not a Cell, but the arc it was actually
   * drawn at this frame, in the fractions the seam maths works in.
   * @typedef {Object} DbgCell
   * @property {string} g
   * @property {string} k
   * @property {boolean} inner
   * @property {number} nB
   * @property {string} bandKey
   * @property {number} seams     how many seams precede it around the ring
   * @property {number} f0        leading edge, as a fraction of the arc going
   * @property {number} f1        trailing edge
   * @property {number} [pLead]   set once the cell has a locked lead/trail
   * @property {number} [pTrail]
   * @property {string[]} ids
   */
  /**
   * The overlay's own state: off by default, its canvas made on first use.
   * @typedef {Object} DebugState
   * @property {boolean} on
   * @property {DbgCell[] | null} cells
   * @property {HTMLCanvasElement | null} canvas
   * @property {unknown[] | null} [trace]
   * @property {number} [traceR]
   */
  /** @type {DebugState} */
  var DBG = { on: false, cells: null, canvas: null };
  var SEAM_YELLOW = "rgb(255,196,0)";
  var SEAM_YELLOW_45 = "rgba(255,196,0,0.45)";
  /** @type {Record<string, boolean>} */
  var ringsMerged = dict();
  var MERGED = "\u0001merged";

  /** @param {number} sw */
  function sweepAngle(sw) { return Math.PI / 2 - sw; }
  /** @param {number} a */
  function angleSweep(a) {
    var t = (Math.PI / 2 - a) % (2 * Math.PI);
    return t < 0 ? t + 2 * Math.PI : t;
  }

  /** @param {string} id */
  function isOrphan(id) { return !adj[id]; }

  var SEAM_ROWS = 0.3;

  var SEAM_MAX_ROWS = 0.16;
  var REF_ROWS = 5;
  var SEAM_FALL = 1.5;
  var GAP_FULL_TO = 1000;
  var GAP_ZERO_AT = 10000;
  function gapScale() {
    var n = graph.order;
    if (n <= GAP_FULL_TO) return 1;
    if (n >= GAP_ZERO_AT) return 0;
    return 1 - (n - GAP_FULL_TO) / (GAP_ZERO_AT - GAP_FULL_TO);
  }

  /** @param {string} band */
  function seamFall(band) {
    var k = band === "i" ? "i" : "o";
    var rows = bandOf(k).rows || REF_ROWS;
    return Math.pow(REF_ROWS / Math.max(1, rows), SEAM_FALL);
  }

  /** @param {string} band @param {number} frac */
  function seamAngle(band, frac) {
    var k = band === "i" ? "i" : "o";
    var r = geomLock && geomLock.bandR ? geomLock.bandR[k] : 0;
    if (!r) return SLICE_GAP * Math.PI / 180 * gapScale() * frac;
    var w = SEAM_ROWS * seamFall(band) * pitchUnits(band) * (GAP_BAND[k] || 1);
    var cap = SEAM_MAX_ROWS * UNIT;
    if (w > cap) w = cap;
    return (w * frac) / r;
  }

  /** @param {number} nGroups @param {string} band */
  function gapFor(nGroups, band) {
    var g = seamAngle(band, 1);
    return g * nGroups > Math.PI ? Math.PI / Math.max(1, nGroups) : g;
  }

  var SEAM_CAP = 0.45;
  /** @param {Cell} c @param {string} which "lead" or "trail" @param {number} rGraph */
  function edgeSweep(c, which, rGraph) {
    var sm = seamAt(rGraph, c.nB, c.bandKey);
    return which === "lead" ? c.pLead + sm.gap / 2 : c.pTrail - sm.gap / 2;
  }

  /** @param {number} r @param {number} nBoundaries @param {string} band */
  function seamAt(r, nBoundaries, band) {
    var g = r > 1e-6 ? (SEAM_ROWS * pitchUnits(band)) / r : 0;
    var tot = g * nBoundaries;
    var cap = 2 * Math.PI * SEAM_CAP;
    if (tot > cap) { g *= cap / tot; tot = cap; }
    return { gap: g, avail: 2 * Math.PI - tot };
  }

  /**
   * @param {Cell[]} list
   * @param {(c: Cell) => number} weightOf
   * @param {AllocOpts} opts
   */
  function allocateBand(list, weightOf, opts) {
    var TWO = 2 * Math.PI;
    var tot = 0;
    /** @type {Record<string, { w: number }>} */
    var gw = dict();
    list.forEach(function (c) {
      tot += weightOf(c);
      var g = gw[c.g] || (gw[c.g] = { w: 0 });
      g.w += weightOf(c);
    });
    /** @param {Cell} c */
    var presOf = function (c) { return Math.min(1, weightOf(c)); };
    var given = opts.groupPres || null;
    /** @type {Record<string, number>} */
    var groupPres = dict();
    var nG = 0;
    Object.keys(gw).forEach(function (k) {
      var p = (given && given[k] !== undefined) ? given[k] : gw[k].w;
      groupPres[k] = p < 0 ? 0 : p > 1 ? 1 : p;
      nG += groupPres[k];
    });
    var nSub = 0;
    if (opts.subGaps) {
      /** @type {Record<string, number>} */
      var firstOf = dict();
      list.forEach(function (c) {
        if (!firstOf[c.g]) { firstOf[c.g] = 1; return; }
        nSub += presOf(c);
      });
    }
    var gap = gapFor(nG, opts.band);
    var subGap = opts.subGaps ? gap : 0;
    var gapTotal = gap * nG + subGap * nSub;
    if (opts.clamp && gapTotal > TWO * opts.clamp) {
      var k = (TWO * opts.clamp) / gapTotal;
      gap *= k; subGap *= k; gapTotal *= k;
    }
    var avail = TWO - gapTotal;

    /* ------------------------------------------------------------- minimum arc --
     * A WEDGE MUST BE AT LEAST AS WIDE AS A NOTE.
     *
     * Arc is allotted in proportion to note count, which is what makes every cell equally full
     * and puts one pitch on the whole ring. It has no floor, and a folder of one note in a
     * 10,000-note vault therefore gets about a thousandth of the circle: measured, 14 - Reading
     * List came out at 0.1 degrees and 00 - Inbox at 0.4. A wedge that narrow is narrower than
     * the note it holds -- the note sits at its centre, its distance to its own boundary is
     * ~3.5 units, and dotPx correctly refuses to draw a dot that would cross out of it. Result:
     * radius 3 against 39-55 for the big folders, for a note whose degree is 7 and which is in
     * no way less important than its neighbours. Reported as small folders rendering tiny.
     *
     * So every cell is floored at the angular width of one lattice step, which is exactly the
     * room one note needs, and the surplus is taken back from the cells that are ABOVE the floor
     * in proportion to how far above they are. Cells at the floor are untouched, so the floor
     * cannot be undone by the redistribution that pays for it.
     *
     * Nothing is floored when there is no lock to measure a step against -- the one unfiltered
     * plan that produces geomLock -- and nothing is floored for a cell with no weight, which is
     * entitled to no arc at all (github#5).
     */
    var floorAng = 0;
    if (opts.band && geomLock && geomLock.bandR) {
      var rRef = geomLock.bandR[opts.band === "i" ? "i" : "o"] || 0;
      if (rRef > 1e-6) floorAng = 0.8 * pitchUnits(opts.band) / rRef;
    }
    /** @type {Record<string, number> | null} */
    var shareMap = null;
    if (floorAng > 0 && tot > opts.totFloor) {
      shareMap = dict();
      /** @param {number} w @param {Cell | null} c0 */
      var floorFor = function (w, c0) {
        if (colWalk && c0 && colWalk[c0.g] !== undefined) return floorAng * colWalk[c0.g].f;
        return floorAng * (w > 1 ? 1 : w < 0 ? 0 : w);
      };
      var over = 0, under = 0;
      /** @type {Cell[]} */
      var live = [];
      list.forEach(function (c) {
        var w = weightOf(c);
        var raw = w > 0.0001 ? avail * (w / Math.max(opts.totFloor, tot)) : 0;
        shareMap[c.k] = raw;
        if (raw <= 0) return;
        live.push(c);
        var fl = floorFor(w, c);
        if (raw < fl) under += fl - raw;
        else over += raw - fl;
      });
      var lift = under > 0 && over > 0 ? Math.min(1, over / under) : 0;
      if (lift > 0) {
        var take = (under * lift) / over;
        live.forEach(function (c) {
          var raw = shareMap[c.k], fl = floorFor(weightOf(c), c);
          shareMap[c.k] = raw < fl ? raw + (fl - raw) * lift : raw - (raw - fl) * take;
        });
      } else {
        shareMap = null;
      }
    }

    return {
      tot: tot, nG: nG, nSub: nSub, gap: gap, subGap: subGap, avail: avail,
      minArc: (function () { lastMinArc = shareMap ? floorAng : 0; return lastMinArc; })(),
      groupPres: groupPres, presOf: presOf,
      /** @param {Cell} c */
      shareOf: function (c) {
        if (shareMap && shareMap[c.k] !== undefined) return shareMap[c.k];
        return avail * (weightOf(c) / Math.max(opts.totFloor, tot));
      },
      /** @param {Cell} c */
      fracOf: function (c) {
        if (shareMap && shareMap[c.k] !== undefined) {
          return avail > 1e-9 ? shareMap[c.k] / avail : 0;
        }
        return weightOf(c) / Math.max(opts.totFloor, tot);
      }
    };
  }

  /**
   * @param {boolean} onlyVisible
   * @param {((id: string) => number) | null} [weightOf]   per-note weight; 1 when absent
   * @param {((c: Cell) => number) | null} [rowsOf]        rows to place a cell at; its own when absent
   * @param {number | SpHold | null} [spIn]                a density, or the spacings to hold
   * @returns {Plan | null}
   */
  function buildWedgePlan(onlyVisible, weightOf, rowsOf, spIn) {
    var W = weightOf || function () { return 1; };
    var all = order[state.dim] || [];
    var nested = state.dim === "folder";
    var SEP = "\u0000";
    /** @type {Record<string, string[]>} */
    var byCell = {};
    /** @type {Record<string, string[]>} */
    var cellsOf = {};
    var planTotal = 0;
    /** @type {Record<string, number>} */
    var presMax = dict();

    /** @type {Record<string, number>} */
    var liveG = dict();
    /** @type {Record<string, number>} */
    var liveN = dict();
    // github#31
    /** @type {Record<string, number>} */
    var liveSub = dict();
    // github#19
    /** @type {string[]} */
    var members = [];
    graph.forEachNode(function (id) {
      if (onlyVisible && !(planKeep || willShow)(id)) return;
      // github#18
      if (isPinned(id)) return;
      members.push(id);
      var g0 = groupOf(id);
      var wv = W(id);
      liveG[g0] = (liveG[g0] || 0) + (wv > 1 ? 1 : wv < 0 ? 0 : wv);
      liveN[g0] = (liveN[g0] || 0) + 1;
      var sk = g0 + "/" + (graph.getNodeAttributes(id).sub || "");
      liveSub[sk] = (liveSub[sk] || 0) + 1;
    });
    var bandLive = { i: 0, o: 0 };
    Object.keys(liveG).forEach(function (g) {
      bandLive[bandLock && bandLock[g] ? "i" : "o"] += liveG[g];
    });
    var depthOfBand = function (isInner) {
      if (!geomLock) return REF_ROWS;
      var n = bandLive[isInner ? "i" : "o"];
      var thick = isInner ? (geomLock.rOuter - geomLock.r0) * INNER_FILL
                          : geomLock.maxR - geomLock.rOuter;
      var scale = isInner ? INNER_SCALE : 1;
      var base = isInner ? geomLock.r0 : geomLock.rOuter;
      if (!(thick > 0) || !(n > 0.5)) return REF_ROWS;
      var T = thick * scale, R = (base + thick / 2) * scale;
      var rw = Math.round(T / Math.sqrt(2 * Math.PI * R * T / n));
      return rw < 1 ? 1 : rw > 200 ? 200 : rw;
    };
    /** @type {BandNum} */
    var bandDepth = { i: 0, o: 0 };
    /** @type {Record<string, boolean>} */
    var splitOf = dict();
    /** @param {string} g */
    var splitFor = function (g) {
      if (splitHold && splitHold[g] !== undefined) return splitHold[g];
      if (splitOf[g] === undefined) {
        var bk = bandLock && bandLock[g] ? "i" : "o";
        if (!bandDepth[bk]) bandDepth[bk] = depthOfBand(bk === "i");
        var nSubs = (subOrder[g] || []).length;
        var splitPieces = Math.min(nSubs, SUB_SLOTS);
        splitOf[g] = nested && nSubs > 1 &&
                     (liveN[g] || 0) >= Math.max(NEST_MIN, splitPieces * bandDepth[bk]);
      }
      return splitOf[g];
    };

    members.forEach(function (id) {
      var g = groupOf(id), a = graph.getNodeAttributes(id);
      var split = splitFor(g);
      var bk = bandLock && bandLock[g] ? "i" : "o";
      var key = split
        ? g + SEP + subCellIndex(g, a.sub, liveSub[g + "/" + (a.sub || "")] || 0, bandDepth[bk])
        : g;
      if (!byCell[key]) {
        byCell[key] = [];
        (cellsOf[g] || (cellsOf[g] = [])).push(key);
      }
      byCell[key].push(id);
      planTotal += W(id);
      var pw = W(id);
      if (colWalk && colWalk[g] !== undefined) pw = colWalk[g].f;
      if (!(presMax[g] >= pw)) presMax[g] = pw;
    });

    ringsMerged = dict();
    /** @type {string[]} */
    var big = [];
    /** @type {string[]} */
    var smallIds = [];
    all.filter(function (g) { return cellsOf[g]; }).forEach(function (g) {
      if ((counts[g] || 0) >= SMALL_GROUP) { big.push(g); return; }
      ringsMerged[g] = true;
      cellsOf[g].forEach(function (k) { smallIds = smallIds.concat(byCell[k]); });
    });

    /** @type {Cell[]} */
    var cells = [];
    big.forEach(function (g) {
      var ks = cellsOf[g];
      if (nested) {
        ks.sort(function (x, y) {
          return (+(x.split(SEP)[1] || 0)) - (+(y.split(SEP)[1] || 0));
        });
      }
      ks.forEach(function (k) { cells.push(/** @type {Cell} */ ({ g: g, k: k, list: byCell[k] })); });
    });
    if (smallIds.length) cells.push(/** @type {Cell} */ ({ g: MERGED, k: MERGED, list: smallIds }));
    if (!cells.length) return null;

    cells.forEach(function (c) {
      c.list.sort(function (a, b) { return hubRank[a] - hubRank[b]; });
      c.wsum = 0;
      c.list.forEach(function (id) { c.wsum += W(id); });
    });

    var TOTAL = planTotal;
    var MIN = MIN_SPAN, TWO = 2 * Math.PI;
    var smallAt = TOTAL * (MIN / TWO);
    /** @type {Record<string, boolean>} */
    var groupInner = {};
    cells.forEach(function (c) {
      var small = c.wsum < smallAt;
      if (groupInner[c.g] === undefined) groupInner[c.g] = small;
      else groupInner[c.g] = groupInner[c.g] || small;
    });

    if (bandLock) cells.forEach(function (c) {
      if (bandLock[c.g] !== undefined) groupInner[c.g] = bandLock[c.g];
    });
    cells.forEach(function (c) { c.inner = groupInner[c.g]; });
    var inner = cells.filter(function (c) { return c.inner; });
    var outer = cells.filter(function (c) { return !c.inner; });
    if (!outer.length && !bandLock) {
      inner.forEach(function (c) { c.inner = false; });
      outer = cells; inner = [];
    }

    /** @param {Cell[]} list @param {string} band */
    var share = function (list, band) {
      var a = allocateBand(list,
                           function (c) { return c.wsum; },
                           { subGaps: false, clamp: null, totFloor: 0.0001, band: band });
      lastGapN[band] = Math.round(a.nG * 1000) / 1000;
      list.forEach(function (c) { c.band = a.shareOf(c); });
    };
    share(inner, "i");
    share(outer, "o");

    cells.forEach(function (c) { c.bandRef = c.band; });

    // github#13
    var HOLE = 0.3;
    var fullTotal = geomLock && geomLock.total > 0 ? geomLock.total : planTotal;
    var density = (spIn && typeof spIn === "object") ? (spIn.o || 1)
      : spIn > 0 ? spIn
      : (planTotal > 0.0001
          ? Math.min(DENSITY_MAX, Math.sqrt(fullTotal / planTotal)) : 1);
    var SP = density;

    // github#13
    var given = (spIn && typeof spIn === "object") ? spIn : null;
    var givenRoom = given && given.room ? given.room : null;
    var SP_I = given && given.i > 0 ? given.i : SP;
    var SP_O = given && given.o > 0 ? given.o : SP;
    /** @param {Cell[]} cells @param {string} key */
    var bandDensity = function (cells, key) {
      if (!geomLock || !geomLock.bandTotal) return SP;
      var full = geomLock.bandTotal[key] || 0, now = 0;
      cells.forEach(function (c) { now += c.wsum; });
      if (!(full > 0.0001) || !(now > 0.0001)) return SP;
      return Math.min(DENSITY_MAX, Math.sqrt(full / now));
    };
    var r0 = geomLock ? geomLock.r0 : Math.max(1.5, HOLE * Math.sqrt(
      Math.max(1, TOTAL) / (Math.PI * (1 - HOLE * HOLE))));

    // github#5
    /** @param {number} span @param {number} n @param {number} st @param {number} [sp] */
    function rowsNeeded(span, n, st, sp) {
      if (!(n > 0)) return 0;
      var p = sp > 0 ? sp : SP;
      var i = 0, r = st, k = 0;
      while (i < n && k < 500) { i += Math.max(0.05, span * r / p); r += p; k++; }
      var cap = Math.ceil(n - 1e-9);
      return Math.max(1, cap > 0 && k > cap ? cap : k);
    }

    /** @param {number} base @param {number} ref */
    function padFor(base, ref) {
      var refArc = base * (ref || 0) * UNIT;
      return refArc > 1e-6 ? Math.min(EDGE_PAD_MAX, EDGE_PAD_ARC / refArc) : 0;
    }
    /** @param {Cell} c @param {number} base */
    function usableRef(c, base) {
      c.pad = padFor(base, c.bandRef);
      return c.bandRef * (1 - 2 * c.pad);
    }

    var GUTTER = 1.6 * SP;

    var BAND_RATIO = 0.55;

    if (!bandLock) (function balanceBands() {
      /** @type {string[]} */
      var names = [];
      cells.forEach(function (c) { if (names.indexOf(c.g) < 0) names.push(c.g); });
      if (names.length < 2) return;
      /** @type {Record<string, boolean>} */
      var assign = {};
      cells.forEach(function (c) { assign[c.g] = !!c.inner; });

      var PIN_BELOW = 10;
      /** @type {Record<string, number>} */
      var groupNotes = {};
      var totalNotes = 0;
      cells.forEach(function (c) {
        groupNotes[c.g] = (groupNotes[c.g] || 0) + c.list.length;
        totalNotes += c.list.length;
      });
      /** @type {Record<string, boolean>} */
      var pinnedInner = {};
      names.forEach(function (g) {
        if (assign[g] && (groupNotes[g] || 0) < PIN_BELOW) pinnedInner[g] = true;
      });
      var movable = names.filter(function (g) { return !pinnedInner[g]; });
      if (!movable.length) return;

      /** @param {Cell[]} ins @param {Cell[]} outs @param {number} rv */
      var spanFor = function (ins, outs, rv) {
        var iR = 0;
        ins.forEach(function (c) {
          var r = rowsNeeded(usableRef(c, rv), c.wsum, rv);
          if (r > iR) iR = r;
        });
        var rOut = ins.length ? rv + iR * SP + GUTTER : rv;
        var oR = 0;
        outs.forEach(function (c) {
          var r = rowsNeeded(usableRef(c, rOut), c.wsum, rOut);
          if (r > oR) oR = r;
        });
        return {
          inner: Math.max(0, iR - 1) * SP * INNER_SCALE,
          outer: Math.max(0, oR - 1) * SP,
          iR: iR, oR: oR,
          holeShare: (rOut + oR * SP) > 0 ? rv / (rOut + oR * SP) : 1
        };
      };

      var R0_BASE = r0;
      var HOLE_MAX = 0.36;
      /** @param {Record<string, boolean>} a group -> inner */
      var evaluate = function (a) {
        /** @type {Cell[]} */
        var ins = [];
        /** @type {Cell[]} */
        var outs = [];
        cells.forEach(function (c) { (a[c.g] ? ins : outs).push(c); });
        if (!ins.length || !outs.length) return { cost: Infinity, r0: R0_BASE };
        share(ins, "i"); share(outs, "o");
        cells.forEach(function (c) { c.bandRef = c.band; });

        var biggestInner = 0, smallestOuter = Infinity;
        names.forEach(function (g) {
          var n = groupNotes[g] || 0;
          if (a[g]) { if (n > biggestInner) biggestInner = n; }
          else if (n < smallestOuter) smallestOuter = n;
        });
        if (!isFinite(smallestOuter)) smallestOuter = biggestInner;
        var innerPeak = totalNotes
          ? Math.max(0, biggestInner - smallestOuter) / totalNotes
          : 0;

        var bc = Infinity, br = R0_BASE;
        for (var m = 100; m <= 300; m += 5) {
          var rv = R0_BASE * (m / 100), t = spanFor(ins, outs, rv);
          var c2 = Math.abs(t.inner - BAND_RATIO * t.outer) +
                   (t.iR > t.oR ? INVERT_WEIGHT * (t.iR - t.oR) : 0) +
                   SIZE_WEIGHT * SP * innerPeak +
                   (t.inner >= t.outer ? 1000 : 0) +
                   (t.holeShare > HOLE_MAX ? 4000 * (t.holeShare - HOLE_MAX) : 0);
          if (c2 < bc - 1e-9) { bc = c2; br = rv; }
        }
        return { cost: bc, r0: br };
      };
      var INVERT_WEIGHT = 0.5;

      var SIZE_WEIGHT = 5.0;
      /** @param {Record<string, boolean>} a */
      var cost = function (a) { return evaluate(a).cost; };

      var EXHAUSTIVE_UP_TO = 14;
      if (movable.length <= EXHAUSTIVE_UP_TO) {
        var bestMask = -1, bestCost = Infinity;
        for (var mask = 0; mask < (1 << movable.length); mask++) {
          for (var b = 0; b < movable.length; b++) assign[movable[b]] = !!(mask & (1 << b));
          var cm = cost(assign);
          if (cm < bestCost) { bestCost = cm; bestMask = mask; }
        }
        for (var b2 = 0; b2 < movable.length; b2++) {
          assign[movable[b2]] = !!(bestMask & (1 << b2));
        }
      } else {
        var best = cost(assign);
        for (var pass = 0; pass < 60 && best > 1e-9; pass++) {
          var move = null, bc = best;
          for (var i = 0; i < movable.length; i++) {
            assign[movable[i]] = !assign[movable[i]];
            var c2 = cost(assign);
            assign[movable[i]] = !assign[movable[i]];
            if (c2 < bc - 1e-9) { bc = c2; move = movable[i]; }
          }
          if (!move) break;
          assign[move] = !assign[move];
          best = bc;
        }
      }

      cells.forEach(function (c) { c.inner = !!assign[c.g]; });
      inner = cells.filter(function (c) { return c.inner; });
      outer = cells.filter(function (c) { return !c.inner; });
      share(inner, "i"); share(outer, "o");
      cells.forEach(function (c) { c.bandRef = c.band; });

      r0 = evaluate(assign).r0;
    })();

    if (!given) {
      SP_I = bandDensity(inner, "i");
      SP_O = bandDensity(outer, "o");
    }

    /** @param {Cell[]} list @param {number} base @param {number} thick @param {number} scale @param {number} sp */
    var solveBand = function (list, base, thick, scale, sp) {
      if (!list.length) return { sp: sp, rows: 0 };
      var n = 0;
      list.forEach(function (c) { n += c.wsum; });
      // github#5
      if (!(n > 0.0001)) return { sp: sp, rows: 0 };
      if (given || !(thick > 0) || !(n > 0.5)) {
        var rk = Math.round(thick > 0 && sp > 0 ? thick / sp : 1);
        return { sp: sp, rows: rk > 0 ? rk : 1 };
      }
      var T = thick * scale, R = (base + thick / 2) * scale;
      var s = Math.sqrt(2 * Math.PI * R * T / n);
      var rw = Math.round(T / s);
      if (rw < 1) rw = 1;
      if (rw > 200) rw = 200;
      return { sp: thick / rw, rows: rw };
    };

    var thickI = geomLock ? (geomLock.rOuter - geomLock.r0) * INNER_FILL : 0;
    var innerRows = 0;
    if (geomLock && thickI > 0) {
      var si = solveBand(inner, r0, thickI, INNER_SCALE, SP_I);
      SP_I = si.sp; innerRows = si.rows;
      // github#5
      inner.forEach(function (c) { c.rows = c.wsum > 0.0001 ? innerRows : 0; });
    } else {
      inner.forEach(function (c) {
        c.rows = rowsNeeded(usableRef(c, r0), c.wsum, r0, SP_I);
        if (c.rows > innerRows) innerRows = c.rows;
      });
    }
    var rOuter = geomLock ? geomLock.rOuter
               : (inner.length ? r0 + innerRows * SP_I + 1.6 * SP_I : r0);

    var thickO = geomLock ? geomLock.maxR - geomLock.rOuter : 0;
    var maxR = rOuter, outerRows = 0;
    if (geomLock && thickO > 0) {
      var so = solveBand(outer, rOuter, thickO, 1, SP_O);
      SP_O = so.sp; outerRows = so.rows;
      outer.forEach(function (c) { c.rows = c.wsum > 0.0001 ? outerRows : 0; });
      maxR = rOuter + outerRows * SP_O;
    } else {
      outer.forEach(function (c) {
        c.rows = rowsNeeded(usableRef(c, rOuter), c.wsum, rOuter, SP_O);
        if (c.rows > outerRows) outerRows = c.rows;
        var r = rOuter + c.rows * SP_O;
        if (r > maxR) maxR = r;
      });
    }
    /** @param {Cell} c @param {number} rows @param {number} base @param {number} bandRows @returns {Slot[]} */
    function placeCell(c, rows, base, bandRows) {
      var SP = c.inner ? SP_I : SP_O;
      var seq = c.list;
      var wTot = 0;
      seq.forEach(function (id) { wTot += W(id); });
      var nEff = wTot;

      var total = base * rows + SP * rows * rows / 2;
      var pad = typeof c.pad === "number" ? c.pad : padFor(base, c.bandRef);
      var span = 1 - 2 * pad;
      var centred = bandRows > 0 && nEff > 0.0001 && nEff < bandRows - 0.0001;
      var cStart = centred ? Math.round((bandRows - nEff) / 2) : 0;
      /** @type {{ id: string, w: number, row: number }[]} */
      var recs = [];
      var acc = 0;
      seq.forEach(function (id, idx) {
        var w = W(id);
        var s = wTot > 0.0001 ? (acc + w / 2) / wTot : 0.5;
        acc += w;
        s = s < 0 ? 0 : s > 1 ? 1 : s;

        var target = s * total;
        var pp = SP > 1e-9
          ? (-base + Math.sqrt(Math.max(0, base * base + 2 * SP * target))) / SP
          : target / Math.max(1e-9, base);
        if (pp < 0) pp = 0;
        if (pp > rows - 1e-9) pp = Math.max(0, rows - 1e-9);
        var cRow = 0;
        if (centred) {
          var top = Math.max(0, Math.ceil(nEff - 0.0001) - 1);
          cRow = cStart + Math.min(Math.floor(s * nEff), top);
        }
        recs.push({ id: id, w: w, row: centred ? cRow : Math.floor(pp) });
      });

      /** @type {Record<string, number>} */
      var rowW = dict();
      /** @type {Record<string, number>} */
      var rowFirst = dict();
      /** @type {Record<string, number>} */
      var rowLast = dict();
      /** @type {Record<string, number>} */
      var edgeA = dict();
      /** @type {Record<string, number>} */
      var edgeB = dict();
      recs.forEach(function (r) {
        rowW[r.row] = (rowW[r.row] || 0) + r.w;
        if (rowFirst[r.row] === undefined) rowFirst[r.row] = r.w;
        rowLast[r.row] = r.w;
        var dz = graph.getNodeAttribute(r.id, "size") || 4;
        if (edgeA[r.row] === undefined) edgeA[r.row] = dz;
        edgeB[r.row] = dz;
      });
      /** @type {Record<string, number>} */
      var rowAcc = dict();
      /** @type {Slot[]} */
      var out = [];
      recs.forEach(function (r) {
        var before = rowAcc[r.row] || 0, tot = rowW[r.row] || 0;
        var t = tot > 1e-9 ? (before + r.w / 2) / tot : 0.5;
        var hA = tot > 1e-9 ? (rowFirst[r.row] || 0) / (2 * tot) : 0;
        var hB = tot > 1e-9 ? (rowLast[r.row] || 0) / (2 * tot) : 0;
        var keep = 1 - hA - hB;
        if (keep > 1e-9) t = (t - hA) / keep;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        rowAcc[r.row] = before + r.w;
        var rr = (base + r.row * SP) * (c.inner ? INNER_SCALE : 1);
        var u0 = (r.row % 2 === 1) ? 1 - t : t;
        var eA = edgeA[r.row] || 0, eB = edgeB[r.row] || 0;
        out.push({ id: r.id, r: rr, u: pad + u0 * span, row: r.row,
                   eA: (r.row % 2 === 1) ? eB : eA,
                   eB: (r.row % 2 === 1) ? eA : eB });
      });
      return out;
    }

    cells.forEach(function (c) {
      var base = c.inner ? r0 : rOuter;
      var rf = rowsOf ? rowsOf(c) : c.rows;
      if (!rf) rf = c.rows;
      c.slots = placeCell(c, rf, base, c.inner ? innerRows : outerRows);
    });

    /** @param {Cell[]} list */
    var roomOf = function (list) {
      /** @type {number[]} */
      var v = [];
      list.forEach(function (c) {
        if (!c.slots || !c.slots.length) return;
        /** @type {Record<string, number>} */
        var rn = dict();
        c.slots.forEach(function (sl) { rn[sl.r] = (rn[sl.r] || 0) + 1; });
        c.slots.forEach(function (sl) {
          var n = rn[sl.r] || 1;
          var step = (c.band || 0) * sl.r * UNIT / n;
          if (step > 1) v.push(step);
        });
      });
      if (!v.length) return 0;
      v.sort(function (x, y) { return x - y; });
      return v[Math.floor(v.length * 0.1)];
    };
    var roomPlan = givenRoom || { i: roomOf(inner), o: roomOf(outer) };

    /** @param {Cell[]} list @param {number} fallback @param {string} band */
    var depthOf = function (list, fallback, band) {
      var given = spIn && typeof spIn === "object" && spIn.depth ? spIn.depth[band] : 0;
      if (given > 0) return given;
      return fallback;
    };

    return { cells: cells, maxR: maxR, total: planTotal, r0: r0, rOuter: rOuter,
             sp: SP_O, spInner: SP_I, density: density, room: roomPlan,
             dbgLive: liveG, dbgSplit: splitOf, presMax: presMax,
             rows: { i: depthOf(inner, innerRows, "i"),
                     o: depthOf(outer, outerRows || REF_ROWS, "o") } };
  }

  var REPACK_BELOW = 0.55;

  /**
   * @param {Plan | null} [planIn]   a plan to lay out; built from the live alphas when absent
   * @param {boolean} [strict]
   * @returns {Record<string, Point> | null}   node id -> position, or null with nothing to show
   */
  function ringsLayout(planIn, strict) {
    if (roomNow) {
      if (roomNow.i > 1) bandOf("i").room = roomNow.i;
      if (roomNow.o > 1) bandOf("o").room = roomNow.o;
    }
    // github#19
    // decisions/0001
    var plan = planIn || pinnedPlan ||
      buildWedgePlan(true,
                     function (id) { return alpha[id] || 0; });
    if (!plan) {
      if (!pinnedIds().length) return null;
      /** @type {Record<string, Point>} */
      var hubOut = {};
      hubPlace(hubOut, geomLock ? geomLock.r0 : 1.5, UNIT);
      return hubOut;
    }

    var live = 0;
    plan.cells.forEach(function (c) {
      c.geom = 0; c.live = 0;
      c.slots.forEach(function (sl) {
        var al = alpha[sl.id] || 0;
        // github#19
        if (colWalk) {
          var cw = colWalk[groupOf(sl.id)];
          if (cw !== undefined) { c.geom = c.live = cw.n * cw.f; return; }
        }
        c.geom += (fullRing || !willShow(sl.id)) ? al : 1;
        c.live += al;
      });
      live += c.geom;
    });
    var shown = plan.cells.filter(function (c) { return c.geom > 1e-4; });
    if (!shown.length || !live) return null;
    lastMaxR = plan.maxR || lastMaxR;
    if (plan.sp > 0) bandOf("o").sp = plan.sp;
    if (plan.spInner > 0) bandOf("i").sp = plan.spInner;
    if (plan.rows) { bandOf("i").rows = plan.rows.i; bandOf("o").rows = plan.rows.o; }

    var TWO = 2 * Math.PI;
    /** @type {Record<string, Point>} */
    var pos = {};
    /** @type {Record<string, number>} */
    var fit = dict();
    /** @type {Record<string, { t: number, id: string }> | null} */
    var lastAt = null;
    /** @type {Record<string, { t: number, id: string }> | null} */
    var firstAt = null;
    /** @type {Record<string, number[]>} */
    var roomPool = { i: [], o: [] };
    /** @type {Record<string, number>} */
    var cellRoomNext = dict();
    /** @type {Record<string, number>} */
    var cellMin = dict();
    /** @type {Record<string, string>} */
    var cellOf = dict();
    /** @type {Record<string, number>} */
    var edgeCapNext = dict();
    /** @type {Record<string, boolean>} */
    var hubRow0Next = dict();
    /** @type {DbgCell[] | null} */
    var dbgCells = DBG.on ? [] : null;
    if (probe) { lastStart = dict(); lastArc = dict(); lastBand = dict(); }
    [true, false].forEach(function (isInner) {
      var band = shown.filter(function (c) { return !!c.inner === isInner; });
      if (!band.length) return;
      var a = allocateBand(band,
                           function (c) { return c.geom; },
                           { subGaps: true, clamp: 0.45, totFloor: 1e-6,
                             groupPres: plan.presMax || null,
                             band: isInner ? "i" : "o" });
      var gap = a.gap;
      bandOf(isInner ? "i" : "o").gapDeg = Math.round(gap * 180 / Math.PI * 1000) / 1000;
      bandOf(isInner ? "i" : "o").nG = Math.round(a.nG * 1000) / 1000;
      bandOf(isInner ? "i" : "o").nSub = Math.round(a.nSub * 1000) / 1000;
      band.forEach(function (c) {
        c.span = a.shareOf(c);
        if (probe && lastArc) {
          lastArc[c.g] = (lastArc[c.g] || 0) + c.span * 180 / Math.PI;
          lastBand[c.g] = isInner ? "i" : "o";
        }
      });
      lastAt = dict();
      firstAt = dict();
      var nB = a.nG + a.nSub;
      var refR = geomLock && geomLock.bandR ? geomLock.bandR[isInner ? "i" : "o"] : 0;
      var sBand = refR > 0 ? seamAt(refR, nB, isInner ? "i" : "o") : null;
      /** @type {Record<string, { seams: number[], before: number[], frac: number[], nB: number }> | null} */
      var rowShare = null;
      if (rowArcOn()) {
        rowShare = dict();
        /** @type {Record<string, number[]>} */
        var presIn = dict();
        band.forEach(function (c0, ci) {
          c0.slots.forEach(function (sl0) {
            var w0 = alpha[sl0.id] || 0;
            if (!(w0 > 0.004)) return;
            if (w0 > 1) w0 = 1;
            var rk0 = Math.round(sl0.r * 1000);
            var arr0 = presIn[rk0] || (presIn[rk0] = []);
            if (!(arr0[ci] >= w0)) arr0[ci] = w0;
          });
        });
        Object.keys(presIn).forEach(function (rk0) {
          var arr0 = presIn[rk0], tot0 = 0;
          band.forEach(function (c0, ci) { tot0 += a.fracOf(c0) * (arr0[ci] || 0); });
          if (!(tot0 > 1e-9)) return;
          var acc0 = 0, sb0 = 0;
          /** @type {number[]} */
          var seams0 = [];
          /** @type {number[]} */
          var before0 = [];
          /** @type {number[]} */
          var frac0 = [];
          band.forEach(function (c0, ci) {
            var p0 = arr0[ci] || 0;
            sb0 += p0;
            seams0[ci] = sb0;
            before0[ci] = acc0;
            frac0[ci] = a.fracOf(c0) * p0 / tot0;
            acc0 += frac0[ci];
          });
          rowShare[rk0] = { seams: seams0, before: before0, frac: frac0, nB: sb0 };
        });
      }

      var seamsBefore = a.groupPres[band[0].g], fracBefore = 0, prevG = null;
      band.forEach(function (c, cIdx) {
        if (prevG !== null) seamsBefore += (c.g !== prevG) ? a.groupPres[c.g] : a.presOf(c);
        prevG = c.g;
        var frac = a.fracOf(c);
        if (probe && lastStart && lastStart[c.g] === undefined) {
          var sProbe = seamAt(refR, nB, isInner ? "i" : "o");
          lastStart[c.g] = Math.round((sProbe.gap * seamsBefore + sProbe.avail * fracBefore) *
                                      180 / Math.PI * 1000) / 1000;
        }
        var open = c.geom > 1e-6 ? c.live / c.geom : 0;
        c.bandKey = isInner ? "i" : "o";
        c.nB = nB;
        if (sBand) {
          var A0c = sBand.gap * seamsBefore + sBand.avail * fracBefore;
          c.pLead = A0c - sBand.gap;
          c.pTrail = A0c + sBand.avail * frac * open;
        } else {
          c.pLead = undefined; c.pTrail = undefined;
        }
        if (dbgCells) {
          dbgCells.push({ g: c.g, k: c.k, inner: !!c.inner, nB: nB, bandKey: c.bandKey,
                          seams: seamsBefore, f0: fracBefore,
                          f1: fracBefore + frac * open,
                          pLead: c.pLead, pTrail: c.pTrail,
                          ids: c.slots.map(function (sl) { return sl.id; }) });
        }

        /** @type {Record<string, number>} */
        var rowN = dict();
        c.slots.forEach(function (sl) {
          var w = alpha[sl.id] || 0;
          if (w > 0) rowN[sl.r] = (rowN[sl.r] || 0) + w;
        });
        var rowsUsed = 0;
        Object.keys(rowN).forEach(function (rk) {
          rowsUsed += rowN[rk] > 1 ? 1 : rowN[rk];
        });
        if (!(rowsUsed > 0)) rowsUsed = 1;
        var maxRowR = -1;
        Object.keys(rowN).forEach(function (rk) { if (+rk > maxRowR) maxRowR = +rk; });
        c.slots.forEach(function (sl) {
          if (!present(sl.id)) return;
          var rs = rowShare ? rowShare[Math.round(sl.r * 1000)] : null;
          var sm = seamAt(sl.r * UNIT, rs ? rs.nB : nB, isInner ? "i" : "o");
          var a0, a1;
          if (c.pLead !== undefined) {
            a0 = edgeSweep(c, "lead", sl.r * UNIT);
            a1 = edgeSweep(c, "trail", sl.r * UNIT);
          } else if (rs && rs.frac[cIdx] > 0) {
            a0 = sm.gap * rs.seams[cIdx] + sm.avail * rs.before[cIdx] - sm.gap / 2;
            a1 = a0 + sm.avail * rs.frac[cIdx] * open;
          } else {
            a0 = sm.gap * seamsBefore + sm.avail * fracBefore - sm.gap / 2;
            a1 = a0 + sm.avail * frac * open;
          }
          if (probe && probe.watch === sl.id) {
            probe.watched = { k: c.k, g: c.g, u: Math.round(sl.u * 1e5) / 1e5,
                              slotR: Math.round(sl.r), slots: c.slots.length,
                              a0: Math.round(a0 * 1e4) / 1e4, a1: Math.round(a1 * 1e4) / 1e4,
                              span: Math.round(c.span * 1e4) / 1e4,
                              open: Math.round((c.geom > 1e-6 ? c.live / c.geom : 0) * 1e4) / 1e4,
                              geom: Math.round(c.geom * 1e3) / 1e3,
                              live: Math.round(c.live * 1e3) / 1e3,
                              inner: !!c.inner };
          }
          var arc = a1 - a0;
          var rGraph = Math.max(1e-6, sl.r * UNIT);
          if (isInner && sl.row === 0) hubRow0Next[sl.id] = true;
          var bk = isInner ? "i" : "o";
          var room = bandOf(bk).room > 1 ? bandOf(bk).room : pitchUnits(bk);
          var clear = CLEAR_OF_ROOM * room * (GAP_BAND[bk] || 1);
          var nRow = rowN[sl.r] > 0.001 ? rowN[sl.r] : 1;
          if (nRow > 1.5) {
            var ownStep = arc * rGraph / nRow;
            roomPool[isInner ? "i" : "o"].push(ownStep);
            if (cellMin[c.k] === undefined || ownStep < cellMin[c.k]) cellMin[c.k] = ownStep;
          }
          cellOf[sl.id] = c.k;
          var side = function (z) {
            var f = (z || NODE_MAX) / NODE_MAX;
            if (f > 1) f = 1; else if (f < 0.15) f = 0.15;
            return (clear + DOT_OF_PITCH * room * f) / rGraph;
          };
          var mgA = side(sl.eA), mgB = side(sl.eB);
          var arcCap = arc * 0.66;
          if (mgA + mgB > arcCap) {
            var k = arcCap / (mgA + mgB);
            mgA *= k; mgB *= k;
          }
          var t = sweepAngle(a0 + mgA + (arc - mgA - mgB) * sl.u);
          var spanArc = arc - mgA - mgB;
          var dEdge = Math.min(mgA + spanArc * sl.u, mgB + spanArc * (1 - sl.u)) * rGraph;
          if (dEdge > 0) edgeCapNext[sl.id] = dEdge;
          var dLo = (mgA + spanArc * sl.u) * rGraph;
          var dHi = (mgB + spanArc * (1 - sl.u)) * rGraph;
          var edgeRoom = 2 * Math.min(dLo, dHi);
          if (edgeRoom > 1 && (fit[sl.id] === undefined || edgeRoom < fit[sl.id])) {
            fit[sl.id] = edgeRoom;
          }
          var prev = lastAt[sl.r];
          if (prev) {
            var step = Math.abs(t - prev.t) * rGraph;
            if (step > 1) {
              if (fit[sl.id] === undefined || step < fit[sl.id]) fit[sl.id] = step;
              if (fit[prev.id] === undefined || step < fit[prev.id]) fit[prev.id] = step;
            }
          }
          lastAt[sl.r] = { t: t, id: sl.id };
          if (firstAt[sl.r] === undefined) firstAt[sl.r] = { t: t, id: sl.id };
          var rr = sl.r + (isPushed(sl.id) ? HL_PUSH : 0);
          pos[sl.id] = { x: rr * Math.cos(t), y: rr * Math.sin(t) };
        });
        fracBefore += frac * open;
      });
      Object.keys(firstAt).forEach(function (rk) {
        var fst = firstAt[rk], lst = lastAt[rk];
        if (!fst || !lst || fst.id === lst.id) return;
        var d = fst.t - lst.t;
        while (d < 0) d += TWO;
        var step = d * Math.max(1e-6, (+rk) * UNIT);
        if (step > 1) {
          if (fit[fst.id] === undefined || step < fit[fst.id]) fit[fst.id] = step;
          if (fit[lst.id] === undefined || step < fit[lst.id]) fit[lst.id] = step;
        }
      });
    });

    var scale = UNIT;
    var out = {};
    graph.forEachNode(function (id) {
      var q = pos[id];
      if (q) out[id] = { x: q.x * scale, y: q.y * scale };
      else if (!strict) out[id] = { x: graph.getNodeAttribute(id, "x"),
                                    y: graph.getNodeAttribute(id, "y") };
    });

    var pool = roomPool;
    // github#35
    /** @param {number[]} v */
    var pick = function (v) {
      if (!v.length) return undefined;
      v.sort(function (x, y) { return x - y; });
      return v[Math.floor(v.length * 0.1)];
    };
    if (!roomNow) {
      bandOf("i").room = pick(pool.i); bandOf("o").room = pick(pool.o);
    }
    Object.keys(cellOf).forEach(function (id) {
      var m = cellMin[cellOf[id]];
      if (m > 1) cellRoomNext[id] = m;
    });
    cellRoom = cellNow || cellRoomNext;
    edgeCap = edgeNow || edgeCapNext;
    hubRow0 = hubRow0Next;
    dotFit = fit;
    if (dbgCells) DBG.cells = dbgCells;
    hubPlace(out, plan.r0, scale);
    return out;
  }

  /* ---------------------------------------------------------- the pinned hub */

  // github#12
  var PIN_MAX = 13;
  var HUB_R1 = 0.50;

  /** @param {Point[]} out @param {number} count @param {number} r @param {number} phase */
  function hubRing(out, count, r, phase) {
    for (var k = 0; k < count; k++) {
      var t = Math.PI / 2 - ((k + phase) / count) * Math.PI * 2;
      out.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
    }
  }

  /** @param {number} n @param {number} r0 @returns {Point[]} */
  function hubSlots(n, r0) {
    if (n <= 0) return [];
    if (n === 1) return [{ x: 0, y: 0 }];
    var R = r0 * HUB_R1;
    /** @type {Point[]} */
    var out = [];
    if (n <= 6) {
      hubRing(out, n, R * (n <= 4 ? 0.62 : 0.86), 0);
      return out;
    }
    out.push({ x: 0, y: 0 });
    var left = n - 1, inner = Math.min(6, left), outer = left - inner;
    hubRing(out, inner, outer ? R * 0.5 : R * 0.86, 0);
    if (outer) hubRing(out, outer, R, 0.5);
    return out;
  }

  // decisions/0009
  function pinnedIds() {
    return state.pinned.filter(function (id) {
      return graph.hasNode(id) && willShow(id);
    });
  }

  var hubSep = 0;

  /** @param {Record<string, Point>} out @param {number} r0 @param {number} scale */
  function hubPlace(out, r0, scale) {
    var ids = pinnedIds();
    hubSep = 0;
    if (!ids.length) return;
    var slots = hubSlots(ids.length, r0);
    if (slots.length < 2) {
      hubSep = HUB_SIZE_MAX / HUB_SIZE_K;
    } else {
      var best = Infinity;
      for (var a = 0; a < slots.length; a++) {
        for (var b = a + 1; b < slots.length; b++) {
          var d = Math.hypot(slots[a].x - slots[b].x, slots[a].y - slots[b].y);
          if (d < best) best = d;
        }
      }
      hubSep = best / r0;
    }
    ids.forEach(function (id, k) {
      if (nodeDrag && nodeDrag.id === id) return;
      if (slots[k]) out[id] = { x: slots[k].x * scale, y: slots[k].y * scale };
    });
  }

  var HUB_SIZE_K = 3.5, HUB_SIZE_MIN = 1.15, HUB_SIZE_MAX = 2.8;
  function hubSizeMult() {
    return Math.max(HUB_SIZE_MIN, Math.min(HUB_SIZE_MAX, HUB_SIZE_K * hubSep));
  }

  /** @param {string} id */
  function isPinned(id) { return state.pinned.indexOf(id) >= 0; }

  /** @param {string} id @param {number} [at] slot to insert at */
  function pin(id, at) {
    var i = state.pinned.indexOf(id);
    if (i >= 0) state.pinned.splice(i, 1);
    if (at === undefined || at > state.pinned.length) at = state.pinned.length;
    state.pinned.splice(at, 0, id);
    while (state.pinned.length > PIN_MAX) {
      state.pinned.splice(state.pinned[0] === id ? 1 : 0, 1);
    }
    return true;
  }

  /** @param {string} id */
  function unpin(id) {
    var i = state.pinned.indexOf(id);
    if (i < 0) return false;
    state.pinned.splice(i, 1);
    return true;
  }

  /** @param {string} id */
  function togglePin(id) {
    if (!unpin(id)) pin(id);
    hubChanged(true);
  }

  function releaseHover() {
    if (!state.hovered) return;
    hideTip();
    hoverTo(0);
  }

  function hubChanged(animate) {
    releaseHover();
    pinnedPlan = null;
    applyLayout(!!animate, releaseHover);
    placeLogo();
    if (savePinned) savePinned(state.pinned.slice());
  }

  // github#12
  function seedPins() {
    var want = deps.pinned;
    if (!want || !want.length || typeof want.length !== "number") return;
    /** @type {Record<string, number>} */
    var seen = dict();
    /** @type {string[]} */
    var out = [];
    for (var i = 0; i < want.length && out.length < PIN_MAX; i++) {
      var id = want[i];
      if (typeof id !== "string" || seen[id] || !graph.hasNode(id)) continue;
      seen[id] = 1;
      out.push(id);
    }
    state.pinned = out;
  }

  /**
   * The note currently under a drag, or null. `x0`/`y0` are set on the first move, so the
   * NODE_DRAG_MIN threshold measures from where the pointer actually started moving.
   * @typedef {Object} NodeDrag
   * @property {string} id
   * @property {boolean} moved
   * @property {boolean} over        pointer is inside the hub hole
   * @property {boolean} wasPinned
   * @property {number} [x0]
   * @property {number} [y0]
   */
  /** @type {NodeDrag | null} */
  var nodeDrag = null;
  var NODE_DRAG_MIN = 4;
  /** @type {string | null} */
  var dragJustMoved = null;

  // github#35
  /** @param {number} gx @param {number} gy */
  function inHubHole(gx, gy) {
    if (!geomLock) return false;
    return Math.hypot(gx, gy) / UNIT < geomLock.r0 * INNER_SCALE;
  }

  /* ---- BEGIN: demo automation + debug API -- stripped from the plugin build, see scripts/build-plugin.mjs (stripDemoAndDebug) ---- */
  function demoCursorAt(x, y) {
    var el = $("democursor");
    if (!el) return;
    var b = ROOT.getBoundingClientRect();
    el.style.left = (x - b.left) + "px";
    el.style.top = (y - b.top) + "px";
    el.hidden = false;
  }
  function demoCursorHide() {
    var el = $("democursor");
    if (el) el.hidden = true;
  }
  /* ---- END: demo automation + debug API ---- */

  function placeHubDrop() {
    var el = $("hubdrop");
    if (!el || !renderer || !geomLock) return;
    if (!nodeDrag || !nodeDrag.moved) { el.hidden = true; return; }
    var c = renderer.graphToViewport({ x: 0, y: 0 });
    var edge = renderer.graphToViewport({ x: geomLock.r0 * INNER_SCALE * UNIT, y: 0 });
    var d = Math.hypot(edge.x - c.x, edge.y - c.y) * 2;
    el.style.width = el.style.height = d + "px";
    el.style.left = c.x + "px";
    el.style.top = c.y + "px";
    el.setAttribute("data-over", nodeDrag.over ? "1" : "0");
    el.setAttribute("data-drop", nodeDrag.wasPinned && !nodeDrag.over ? "out" : "in");
    el.hidden = false;
  }

  function makeFrameCoalescer() {
    /** @type {(() => void) | null} */
    var pend = null;
    var raf = 0;
    var flush = function () {
      raf = 0;
      var f = pend; pend = null;
      if (f) f();
    };
    /** @param {() => void} fn */
    return function onFrame(fn) {
      pend = fn;
      if (!raf) raf = WIN.requestAnimationFrame(flush);
    };
  }

  function bindNodeDrag() {
    var onFrame = makeFrameCoalescer();
    var captor = renderer.getMouseCaptor && renderer.getMouseCaptor();
    if (!captor) return;

    renderer.on("downNode", function (e) {
      var o = e.event && e.event.original;
      if (o && o.button !== 0) return;
      nodeDrag = { id: e.node, moved: false, over: false, wasPinned: isPinned(e.node) };
      dragJustMoved = null;
    });

    captor.on("mousemovebody", function (e) {
      if (!nodeDrag) return;
      if (e.original && e.original.buttons !== undefined && !(e.original.buttons & 1)) {
        drop();
        return;
      }
      if (e.preventDefault) e.preventDefault();
      if (e.original) { e.original.preventDefault(); e.original.stopPropagation(); }
      if (!nodeDrag.moved) {
        if (nodeDrag.x0 === undefined) { nodeDrag.x0 = e.x; nodeDrag.y0 = e.y; }
        if (Math.hypot(e.x - nodeDrag.x0, e.y - nodeDrag.y0) < NODE_DRAG_MIN) return;
        nodeDrag.moved = true;
        dragJustMoved = nodeDrag.id;
      }
      var p = renderer.viewportToGraph(e);
      nodeDrag.over = inHubHole(p.x, p.y);
      var dragId = nodeDrag.id;
      onFrame(function () {
        if (!nodeDrag || nodeDrag.id !== dragId) return;
        graph.setNodeAttribute(dragId, "x", p.x);
        graph.setNodeAttribute(dragId, "y", p.y);
        // github#58
        renderer.refresh({ partialGraph: { nodes: [dragId] }, skipIndexation: false, schedule: true });
        placeHubDrop();
      });
    });

    var drop = function () {
      if (!nodeDrag) return;
      var d = nodeDrag;
      nodeDrag = null;
      placeHubDrop();
      if (!d.moved) return;
      if (d.over && !d.wasPinned) pin(d.id);
      else if (!d.over && d.wasPinned) unpin(d.id);
      hubChanged(true);
    };
    captor.on("mouseup", drop);
    captor.on("mouseleave", drop);
  }

  /* ------------------------------------------------------------- timeline */

  /**
   * The date axis (github#60, batch 3d), declared beside the objects that build it.
   * @typedef {{ key: string, y: number, m: number, ms: number, n: number }} Month
   * @typedef {{ y: number, n: number }} YearCount
   * @typedef {{ i: number, w0: number, w1: number }} AxisSeg
   * @typedef {Object} DateSpan
   * @property {Month[]} months
   * @property {YearCount[]} years
   * @property {Record<string, number>} index    "YYYY-MM" -> index into months
   * @property {number} lo                       ms, first month
   * @property {number} hi                       ms, the end of the newest day
   * @property {number} nMax
   * @property {number} nRef
   * @property {number} yMax
   * @property {number} dated
   * @property {number} undated
   * @property {{ segs: AxisSeg[], totalW: number, segOfMonth: number[] }} axis
   */
  /** @type {Record<string, number>} */
  var tlRank = dict();
  /** @type {string[]} */
  var tlDate = [];
  var tlMax = 0;
  /** @type {number[]} */
  var tlDateMs = [];
  /** @type {Record<string, number>} */
  var tlMs = dict();
  /** @type {DateSpan | null} */
  var dateSpan = null;
  function buildTimeline() {
    /** @type {[string, string][]} */
    var dated = [];
    graph.forEachNode(function (id, a) { if (a.created) dated.push([id, a.created]); });
    dated.sort(function (x, y) { return x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0; });
    tlRank = dict(); tlDate = []; tlDateMs = []; tlMs = dict();
    dated.forEach(function (pair, i) {
      tlRank[pair[0]] = i + 1;
      tlDate.push(pair[1]);
      var ms = heatParse(pair[1]);
      if (!Number.isNaN(ms)) tlMs[pair[0]] = ms;
      tlDateMs.push(ms);
    });
    tlMax = dated.length;
    buildDateSpan(dated);
  }

  /** @param {[string, string][]} dated */
  function buildDateSpan(dated) {
    dateSpan = null;
    if (!dated.length) return;
    var lo = heatParse(dated[0][1]), hi = heatParse(dated[dated.length - 1][1]);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return;
    var d0 = new Date(lo), d1 = new Date(hi);
    var y0 = d0.getUTCFullYear(), m0 = d0.getUTCMonth();
    var y1 = d1.getUTCFullYear(), m1 = d1.getUTCMonth();
    /** @type {Month[]} */
    var months = [];
    /** @type {Record<string, number>} */
    var index = dict();
    for (var y = y0, m = m0; y < y1 || (y === y1 && m <= m1);) {
      var key = y + "-" + (m < 9 ? "0" : "") + (m + 1);
      index[key] = months.length;
      months.push({ key: key, y: y, m: m, ms: Date.UTC(y, m, 1), n: 0 });
      if (++m > 11) { m = 0; y++; }
    }
    /** @type {Record<string, number>} */
    var years = dict();
    for (var i = 0; i < dated.length; i++) {
      var s = dated[i][1], k = s.slice(0, 7), ix = index[k];
      if (ix !== undefined) months[ix].n++;
      var yy = s.slice(0, 4);
      years[yy] = (years[yy] || 0) + 1;
    }
    /** @type {YearCount[]} */
    var ylist = [];
    for (var yk = y0; yk <= y1; yk++) ylist.push({ y: yk, n: years[String(yk)] || 0 });
    var nMax = 1, tot = 0;
    months.forEach(function (mm) { if (mm.n > nMax) nMax = mm.n; tot += mm.n; });
    var sorted = months.map(function (mm) { return mm.n; }).sort(function (x, y) { return x - y; });
    var p90 = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 1;
    var nRef = Math.max(1, p90, nMax * 0.35);
    var yMax = 1;
    ylist.forEach(function (yy) { if (yy.n > yMax) yMax = yy.n; });
    // github#23
    // github#51
    var AVG_MONTH_MS = 30.436875 * 86400000;
    var YEAR_FLOOR_MS = AVG_MONTH_MS;
    var YEAR_CEIL_MS = 12 * AVG_MONTH_MS;
    var yCounts = ylist.map(function (yy) { return yy.n; }).sort(function (a, b) { return a - b; });
    var yMax2 = yCounts.length ? yCounts[yCounts.length - 1] : 1;
    var yP90 = yCounts.length ? yCounts[Math.floor(yCounts.length * 0.9)] : 1;
    var yearRef = Math.max(1, yP90, yMax2 * 0.35);
    // github#51
    var lastMonthEnd = Date.UTC(y1, m1 + 1, 0);
    var endMs = Math.min(lastMonthEnd, Math.max(hi, heatParse(TODAY)));
    var lastFrac = new Date(endMs).getUTCDate() / new Date(lastMonthEnd).getUTCDate();
    /** @type {AxisSeg[]} */
    var segs = [];
    var segW = 0;
    /** @type {number[]} */
    var segOfMonth = new Array(months.length);
    ylist.forEach(function (yy) {
      var yFrac = Math.min(1, yy.n / yearRef);
      var yearWeight = YEAR_FLOOR_MS + yFrac * (YEAR_CEIL_MS - YEAR_FLOOR_MS);
      /** @type {number[]} */
      var idxs = [];
      for (var mi = 0; mi < months.length; mi++) if (months[mi].y === yy.y) idxs.push(mi);
      var mw = yearWeight / idxs.length;
      idxs.forEach(function (mi) {
        segOfMonth[mi] = segs.length;
        // github#51
        var mwOwn = mw * (mi === months.length - 1 ? lastFrac : 1);
        segs.push({ i: mi, w0: segW, w1: segW + mwOwn });
        segW += mwOwn;
      });
    });
    dateSpan = {
      months: months, years: ylist, index: index,
      // github#51
      lo: months[0].ms, hi: endMs,
      nMax: nMax, nRef: nRef, yMax: yMax, dated: tot,
      undated: graph.order - tot,
      axis: { segs: segs, totalW: segW || 1, segOfMonth: segOfMonth }
    };
  }

  function rangeLabel() {
    if (!dateSpan) return "";
    var f = state.from === null ? dateSpan.lo : state.from;
    var t = state.to === null ? dateSpan.hi : state.to;
    /** @param {number} ms */
    var iso = function (ms) { return new Date(ms).toISOString().slice(0, 10); };
    return iso(f) + "  \u2192  " + iso(t);
  }

  /** @param {number | null} from @param {number | null} to */
  function setRangeMs(from, to) {
    if (!dateSpan) return;
    if (from !== null && to !== null && from > to) { var sw = from; from = to; to = sw; }
    state.from = (from === null || from <= dateSpan.lo) ? null : from;
    state.to = (to === null || to >= dateSpan.hi) ? null : to;
    applyRange();
  }

  function rangeChrome() {
    var el = $("rangenote");
    if (el) el.textContent = rangeLabel();
    if (dateSpan) {
      var lo = isoDay(dateSpan.lo), hi = isoDay(dateSpan.hi);
      var f = $("from"), t = $("to");
      if (f) { f.min = lo; f.max = hi; f.value = isoDay(state.from === null ? dateSpan.lo : state.from); }
      if (t) { t.min = lo; t.max = hi; t.value = isoDay(state.to === null ? dateSpan.hi : state.to); }
    }
    var btn = $("rangeall");
    if (btn) btn.disabled = (state.from === null && state.to === null);
    drawDateUI();
  }

  function applyRange() {
    rangeChrome();
    cascade();
  }

  var TODAY = (function () {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  })();

  /** @param {string} id */
  function isMarkedDay(id) {
    if (!state.markDay && !state.hoverDay && state.hoverYear === null) return false;
    var c = graph.getNodeAttribute(id, "created");
    if (c === state.markDay || c === state.hoverDay) return true;
    return state.hoverYear !== null && !!c && c.slice(0, 4) === state.hoverYear;
  }

  /** @param {string} id */
  function isHighlighted(id) {
    if (isMarkedDay(id)) return true;
    var g = groupOf(id);
    if (state.highlight[g]) return true;
    if (state.hoverGroup === g) return true;
    var a = graph.getNodeAttributes(id), d = a.dirs || [];
    for (var k = 1; k <= d.length; k++) {
      var pk = pathKey(a, k);
      if (state.highlightSub[pk]) return true;
      if (state.hoverSub[pk]) return true;
    }
    return false;
  }

  /** @param {DbgCell} c */
  function cellNoteFrac(c) {
    if (!renderer || !c || !c.ids || !c.ids.length) return null;
    var q0 = renderer.graphToViewport({ x: 0, y: 0 });
    var q1 = renderer.graphToViewport({ x: UNIT, y: 0 });
    var d0 = Math.hypot(q1.x - q0.x, q1.y - q0.y);
    var perPx = d0 > 1e-3 ? UNIT / d0 : 0;
    var lo = Infinity, hi = -Infinity;
    c.ids.forEach(function (id) {
      if ((alpha[id] || 0) < 0.5) return;
      var at = graph.getNodeAttributes(id);
      var rl = Math.hypot(at.x, at.y) / UNIT;
      if (!(rl > 1e-6)) return;
      var dd = renderer.getNodeDisplayData(id);
      if (!dd || dd.hidden) return;
      var sn = seamAt(rl * UNIT, c.nB, c.inner ? "i" : "o");
      if (!(sn.avail > 1e-9)) return;
      var f = (angleSweep(Math.atan2(at.y, at.x)) + sn.gap / 2 - sn.gap * c.seams) / sn.avail;
      var half = (renderer.scaleSize(dd.size) * perPx) / (rl * UNIT) / sn.avail;
      if (f - half < lo) lo = f - half;
      if (f + half > hi) hi = f + half;
    });
    return lo < hi ? { lo: lo, hi: hi } : null;
  }

  /** @param {number} [rLattice] radius to measure at, in units; the band's own when absent */
  function wedgeEdges(rLattice) {
    var cells = DBG.cells;
    if (!cells || !cells.length) return [];
    /** @type {Record<string, number | string | null>[]} */
    var out = [];
    ["i", "o"].forEach(function (bk) {
      var band = cells.filter(function (c) { return (c.inner ? "i" : "o") === bk; });
      if (!band.length) return;
      var r = rLattice || (geomLock
        ? (bk === "i" ? geomLock.r0 + (geomLock.rOuter - geomLock.r0) * INNER_FILL * 0.5
                      : (geomLock.rOuter + geomLock.maxR) / 2)
        : 1);
      var sm = seamAt(r * UNIT, band[0].nB, bk);
      /**
       * @param {{ seams: number, f0: number, f1?: number, pLead?: number, pTrail?: number, nB?: number, bandKey?: string }} c
       * @param {string} which "f0" (leading) or "f1" (trailing)
       */
      var sw = function (c, which) {
        if (c.pLead !== undefined) return edgeSweep(/** @type {Cell} */ (/** @type {unknown} */ (c)),
                                                    which === "f0" ? "lead" : "trail", r * UNIT);
        return sm.gap * c.seams + sm.avail * c[which] - sm.gap / 2;
      };
      /** @type {{ g: string, band: string, a: DbgCell, b: DbgCell }[]} */
      var runs = [];
      band.slice().sort(function (x, y) { return x.f0 - y.f0; }).forEach(function (c) {
        var last = runs[runs.length - 1];
        if (last && last.g === c.g) { last.b = c; return; }
        runs.push({ g: c.g, band: bk, a: c, b: c });
      });
      /** @param {{ g: string, a: DbgCell, b: DbgCell }} run */
      var noteFrac = function (run) {
        var lo = Infinity, hi = -Infinity;
        band.filter(function (c) { return c.g === run.g && c.f0 >= run.a.f0 && c.f1 <= run.b.f1; })
            .forEach(function (c) {
              var e = cellNoteFrac(c);
              if (!e) return;
              if (e.lo < lo) lo = e.lo;
              if (e.hi > hi) hi = e.hi;
            });
        return lo < hi ? { lo: lo, hi: hi } : null;
      };

      runs.forEach(function (run, i) {
        var prev = runs[(i - 1 + runs.length) % runs.length];
        var next = runs[(i + 1) % runs.length];
        var lo = sw(prev.b, "f1"), hi = sw(next.a, "f0");
        if (runs.length < 2) { lo = sw(run.a, "f0") - sm.gap; hi = sw(run.b, "f1") + sm.gap; }
        else { while (hi < lo) hi += 2 * Math.PI; }
        /** @param {number} x */
        var deg = function (x) { return sweepAngle(x) * 180 / Math.PI; };
        var nf = noteFrac(run);
        out.push({ g: run.g, band: bk, r: r,
                   nf0: nf ? nf.lo : null, nf1: nf ? nf.hi : null,
                   nStart: nf ? deg(sw({ seams: run.a.seams, f0: nf.lo }, "f0")) : null,
                   nEnd: nf ? deg(sw({ seams: run.a.seams, f0: nf.hi }, "f0")) : null,
                   seams: run.a.seams, f0: run.a.f0, f1: run.b.f1,
                   gap: sm.gap * 180 / Math.PI, avail: sm.avail * 180 / Math.PI,
                   start: deg(sw(run.a, "f0")), end: deg(sw(run.b, "f1")),
                   arc: (sw(run.b, "f1") - sw(run.a, "f0")) * 180 / Math.PI,
                   centre: deg((lo + hi) / 2) });
      });
    });
    return out;
  }

  function drawWedgeDebug() {
    var cv = DBG.canvas;
    if (!cv) return;
    if (!DBG.on || !renderer || !geomLock) { cv.hidden = true; return; }
    cv.hidden = false;
    var host = $("graph");
    var w = host.clientWidth, h = host.clientHeight, dpr = WIN.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = w + "px"; cv.style.height = h + "px";
    }
    var g2 = /** @type {CanvasRenderingContext2D} */ (cv.getContext("2d"));
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, w, h);
    var perPx = (function () {
      var a0 = renderer.graphToViewport({ x: 0, y: 0 });
      var b0 = renderer.graphToViewport({ x: UNIT, y: 0 });
      var d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
      return d0 > 1e-3 ? UNIT / d0 : 0;
    })();
    /** @type {Record<string, { lo: number, hi: number } | null>} */
    var seen = { i: null, o: null };
    graph.forEachNode(function (id, a) {
      if ((alpha[id] || 0) < 0.5 || isOrphan(id)) return;
      var dd = renderer.getNodeDisplayData(id);
      if (!dd || dd.hidden) return;
      var rl = Math.hypot(a.x, a.y) / UNIT;
      var dot = renderer.scaleSize(dd.size) * perPx / UNIT;
      var k = bandLock && bandLock[groupOf(id)] ? "i" : "o";
      var bb = seen[k] || (seen[k] = { lo: Infinity, hi: -Infinity });
      if (rl - dot < bb.lo) bb.lo = rl - dot;
      if (rl + dot > bb.hi) bb.hi = rl + dot;
    });
    var thickI = (geomLock.rOuter - geomLock.r0) * INNER_FILL;
    /** @type {Record<string, number[]>} */
    var bandR = { i: [geomLock.r0, geomLock.r0 + thickI], o: [geomLock.rOuter, geomLock.maxR] };
    ["i", "o"].forEach(function (k) {
      if (seen[k] && seen[k].lo < seen[k].hi) bandR[k] = [seen[k].lo, seen[k].hi];
    });
    /** @param {number} rl @param {number} ang */
    var vp = function (rl, ang) {
      return renderer.graphToViewport({ x: rl * UNIT * Math.cos(ang), y: rl * UNIT * Math.sin(ang) });
    };
    /** @param {string} g0 @param {number} a @returns {{ c: string, a: number }} */
    var tint = function (g0, a) { return { c: colorOf(g0), a: a }; };
    g2.lineWidth = 1;
    g2.strokeStyle = SEAM_YELLOW_45;
    g2.lineWidth = 2;
    g2.setLineDash([4, 4]);
    [bandR.i[0], bandR.i[1], bandR.o[0], bandR.o[1]].forEach(function (rl) {
      g2.beginPath();
      for (var i = 0; i <= 96; i++) {
        var q = vp(rl, i / 96 * 2 * Math.PI);
        if (i) g2.lineTo(q.x, q.y); else g2.moveTo(q.x, q.y);
      }
      g2.stroke();
    });
    g2.setLineDash([]);
    var cells = DBG.cells || [];
    ["i", "o"].forEach(function (bk) {
      var band = cells.filter(function (c) { return (c.inner ? "i" : "o") === bk; });
      if (!band.length) return;
      var lo = bandR[bk][0], hi = bandR[bk][1];

      (function () {
        /** @type {{ g: string, cells: DbgCell[] }[]} */
        var runs = [];
        band.slice().sort(function (x, y) { return x.f0 - y.f0; }).forEach(function (c0) {
          var last = runs[runs.length - 1];
          if (last && last.g === c0.g) { last.cells.push(c0); return; }
          runs.push({ g: c0.g, cells: [c0] });
        });
        runs.forEach(function (run) {
          var a0c = run.cells[0], b0c = run.cells[run.cells.length - 1];
          var fMid = (a0c.f0 + b0c.f1) / 2;
          var host0 = a0c;
          run.cells.forEach(function (c0) { if (c0.f0 <= fMid && fMid <= c0.f1) host0 = c0; });
          void b0c;
          /** @param {number} rl */
          var mid = function (rl) {
            if (a0c.pLead !== undefined) {
              return sweepAngle((edgeSweep(/** @type {Cell} */ (/** @type {unknown} */ (a0c)), "lead", rl * UNIT)
                                 + edgeSweep(/** @type {Cell} */ (/** @type {unknown} */ (b0c)), "trail", rl * UNIT)) / 2);
            }
            var sm0 = seamAt(rl * UNIT, host0.nB, host0.inner ? "i" : "o");
            return sweepAngle(sm0.gap * host0.seams + sm0.avail * fMid - sm0.gap / 2);
          };
          /** @type {Point[]} */
          var pts = [];
          for (var qq = 0; qq <= 24; qq++) {
            var rq = lo + (hi - lo) * qq / 24;
            pts.push(vp(rq, mid(rq)));
          }
          g2.strokeStyle = "#fff"; g2.globalAlpha = 0.6; g2.lineWidth = 2;
          g2.setLineDash([5, 5]);
          g2.beginPath();
          pts.forEach(function (pt, qq) { if (qq) g2.lineTo(pt.x, pt.y); else g2.moveTo(pt.x, pt.y); });
          g2.stroke();
          g2.setLineDash([]); g2.globalAlpha = 1;
        });
      })();
      var sorted = band.slice().sort(function (x, y) { return x.f0 - y.f0; });
      sorted.forEach(function (c, i) {
        var next = sorted[(i + 1) % sorted.length];
        if (next === c) return;
        /** @param {DbgCell} cell @param {string} which "f0" or "f1" @param {number} rl */
        var angOf = function (cell, which, rl) {
          if (cell.pLead !== undefined) {
            return edgeSweep(/** @type {Cell} */ (/** @type {unknown} */ (cell)),
                             which === "f0" ? "lead" : "trail", rl * UNIT);
          }
          var sm0 = seamAt(rl * UNIT, cell.nB, cell.inner ? "i" : "o");
          return sm0.gap * cell.seams + sm0.avail * cell[which] - sm0.gap / 2;
        };
        /**
         * @param {(rl: number) => number} fn        the sweep angle at a radius
         * @param {{ c: string, a: number }} style
         * @param {number} width
         * @param {number[] | null} dash
         * @param {string} [tag]
         * @param {number} [rFrom]
         */
        var chord = function (fn, style, width, dash, tag, rFrom) {
          if (DBG.trace) DBG.trace.push({ tag: tag || "?", c: c.k, next: next.k,
                                          deg: sweepAngle(fn(DBG.traceR)) * 180 / Math.PI });
          g2.strokeStyle = style.c; g2.globalAlpha = style.a; g2.lineWidth = width;
          if (dash) g2.setLineDash(dash);
          var r0c = rFrom !== undefined ? rFrom : lo;
          g2.beginPath();
          for (var q = 0; q <= 48; q++) {
            var rl = r0c + (hi - r0c) * q / 48;
            var pt = vp(rl, sweepAngle(fn(rl)));
            if (q) g2.lineTo(pt.x, pt.y); else g2.moveTo(pt.x, pt.y);
          }
          g2.stroke();
          if (dash) g2.setLineDash([]);
          g2.globalAlpha = 1;
        };
        /** @param {number} rl */
        var sweepA = function (rl) { return angOf(c, "f1", rl); };
        /** @param {number} rl */
        var sweepB = function (rl) {
          var a = angOf(next, "f0", rl), b = sweepA(rl);
          while (a < b) a += 2 * Math.PI;
          while (a - b > Math.PI) a -= 2 * Math.PI;
          return a;
        };
        var groupBoundary = c.g !== next.g;
        (function () {
          /** @param {number} rl */
          var mid = function (rl) { return sweepAngle((sweepA(rl) + sweepB(rl)) / 2); };
          var pOut = { x: hi * UNIT * Math.cos(mid(hi)), y: hi * UNIT * Math.sin(mid(hi)) };
          var pIn = { x: lo * UNIT * Math.cos(mid(lo)), y: lo * UNIT * Math.sin(mid(lo)) };
          var dx = pIn.x - pOut.x, dy = pIn.y - pOut.y, L = Math.hypot(dx, dy);
          if (!(L > 1e-6)) return;
          var reach = Math.hypot(pIn.x, pIn.y);
          var pEnd = { x: pIn.x + dx / L * reach, y: pIn.y + dy / L * reach };
          var q0 = renderer.graphToViewport(pOut), q1 = renderer.graphToViewport(pEnd);
          g2.strokeStyle = SEAM_YELLOW;
          g2.globalAlpha = groupBoundary ? 0.75 : 0.45;
          g2.lineWidth = 2;
          g2.setLineDash([3, 4]);
          g2.beginPath(); g2.moveTo(q0.x, q0.y); g2.lineTo(q1.x, q1.y); g2.stroke();
          g2.setLineDash([]); g2.globalAlpha = 1;
        })();
        chord(sweepA, tint(c.g, groupBoundary ? 0.9 : 0.35), groupBoundary ? 3 : 2,
              null, c.g + " trailing");
        chord(sweepB, tint(next.g, groupBoundary ? 0.9 : 0.35), groupBoundary ? 3 : 2,
              null, next.g + " leading");
      });
    });
    drawWedgeLegend(g2);
  }

  /** @param {CanvasRenderingContext2D} g2 */
  function drawWedgeLegend(g2) {
    /** @type {string[][]} */
    var rows = [
      ["solid, folder colour", "wedge edge"],
      ["dashed white", "wedge centre"],
      ["dotted yellow", "seam centre"],
      ["dashed yellow", "band radius"]
    ];
    var pad = 8, lh = 16, sw = 34, x = 12, y = 12;
    g2.font = "11px ui-monospace, monospace";
    g2.textBaseline = "middle";
    var wide = 0;
    rows.forEach(function (r) { wide = Math.max(wide, g2.measureText(r[1]).width); });
    var w = sw + 8 + wide + pad * 2, h = lh * (rows.length + 1) + pad * 2;
    g2.globalAlpha = 0.72; g2.fillStyle = "#000";
    g2.fillRect(x, y, w, h);
    g2.globalAlpha = 1;
    rows.forEach(function (r, i) {
      var yy = y + pad + lh * i + lh / 2;
      g2.strokeStyle = i === 0 ? "#e66767" : i === 1 ? "#fff" : SEAM_YELLOW;
      g2.globalAlpha = i === 0 ? 0.9 : i === 1 ? 0.5 : i === 2 ? 0.75 : 0.45;
      g2.lineWidth = i === 0 ? 1.5 : 1;
      g2.setLineDash(i === 0 ? [] : i === 1 ? [5, 5] : i === 2 ? [3, 4] : [4, 4]);
      g2.beginPath(); g2.moveTo(x + pad, yy); g2.lineTo(x + pad + sw, yy); g2.stroke();
      g2.setLineDash([]);
      g2.globalAlpha = 0.85; g2.fillStyle = "#fff";
      g2.fillText(r[1], x + pad + sw + 8, yy);
    });
    g2.globalAlpha = 0.55; g2.fillStyle = "#fff";
    g2.fillText("built " + (DATA && DATA.generated ? DATA.generated : "?"),
                x + pad, y + pad + lh * rows.length + lh / 2);
    g2.globalAlpha = 1;
  }

  function wedgeDebug(v) {
    DBG.on = !!v;
    if (DBG.on && !DBG.canvas) {
      var host = $("graph");
      if (host) {
        var cv = DOC.createElement("canvas");
        cv.className = "vg-wedge-debug";
        host.appendChild(cv);
        DBG.canvas = cv;
      }
    }
    if (!DBG.on) { DBG.cells = null; if (DBG.canvas) DBG.canvas.hidden = true; }
    if (renderer) renderer.refresh({ skipIndexation: true });
    return DBG.on;
  }

  /** @param {string | null} group @param {string[]} [keys] */
  function hoverHighlight(group, keys) {
    group = group || null;
    /** @type {Record<string, boolean>} */
    var next = dict();
    (keys || []).forEach(function (k) { if (k) next[k] = true; });
    var a = Object.keys(state.hoverSub).sort().join(","),
        b = Object.keys(next).sort().join(",");
    if (state.hoverGroup === group && a === b) return;
    state.hoverGroup = group;
    state.hoverSub = next;
    if (renderer) renderer.refresh();
  }

  /** @param {string} folder @param {string} sub */
  function ownsWedge(folder, sub) {
    var subs = subOrder[folder] || [];
    var k = subs.indexOf(sub || "");
    if (k < 0) return false;
    return k < SUB_NAMED || subs.length === SUB_NAMED + 1;
  }

  /** @param {string} id */
  function isPushed(id) {
    if (state.highlight[groupOf(id)]) return true;
    var a = graph.getNodeAttributes(id);
    return !!state.highlightSub[pathKey(a, 1)] && ownsWedge(a.folder, a.sub || "");
  }

  /** @param {string} id */
  function willShow(id) { return visible(id) && timeFactor(id) > 0.004; }

  var TL_FADE = 8;
  /** @param {string} id */
  function timeFactor(id) {
    if (state.from !== null || state.to !== null) {
      var ms = tlMs[id];
      if (ms !== undefined) {
        if (state.from !== null && ms < state.from) return 0;
        if (state.to !== null && ms > state.to) return 0;
      }
    }
    if (state.until === null) return 1;
    var rk = tlRank[id];
    if (!rk) return 1;
    var f = (state.until - rk + 1) / TL_FADE;
    return f <= 0 ? 0 : f >= 1 ? 1 : f;
  }

  /* --------------------------------------------------------- reveal cascade */

  /** @type {Record<string, number>} */
  var alpha = dict();
  /** @param {string} id */
  function present(id) { return (alpha[id] || 0) > 0.004; }
  function syncAlpha() {
    graph.forEachNode(function (id) { alpha[id] = visible(id) ? timeFactor(id) : 0; });
  }
  function clearAlpha() { graph.forEachNode(function (id) { alpha[id] = 0; }); }

  /** @type {Record<string, number[]>} */
  var rgbCache = dict();
  /** @param {string} hex a #rgb / #rrggbb hex, or an rgb()/rgba() string @returns {number[]} */
  function toRgb(hex) {
    var c = rgbCache[hex];
    if (c) return c;
    var h = String(hex).trim();
    if (h.charAt(0) === "#") {
      if (h.length === 4) h = "#" + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2) + h.charAt(3) + h.charAt(3);
      c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    } else {
      var m = /(\d+)\D+(\d+)\D+(\d+)/.exec(h);
      c = m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
    }
    return (rgbCache[hex] = c);
  }
  /** @param {string} color @param {number} a */
  function withAlpha(color, a) {
    if (a >= 0.999) return color;
    var c = toRgb(color);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")";
  }

  var FADE_FRAMES = 12;
  var RADIAL_EASE = 0.25;
  var SPREAD_MAX  = 78;
  var SPREAD_PER  = 0.17;
  var SPREAD_MIN  = 24;
  var TIME_SCALE  = 1.25;
  var TIMELINE_MS = 4500;
  var CASCADE_MS  = 1600;
  var TWEEN_MS    = 380;
  var NOW = function () { return (window.performance || Date).now(); };
  var fullRing = false;
  /** @type {((id: string) => boolean) | null} */
  var planKeep = null;
  /** @type {{ raf: number, tick: number, guard: number, sizeCap: Record<string, number> | null } | null} */
  var cascadeRun = null;
  /** @type {Plan | null} */
  var pinnedPlan = null;
  var planMs = 0;
  /** @type {BandNum} */
  var lastGapN = { i: 0, o: 0 };
  /** @type {Record<string, number> | null} */
  var lastStart = null;
  /** @type {Record<string, number> | null} */
  var lastArc = null;
  /** @type {Record<string, string> | null} */
  var lastBand = null;
  var lastMaxR = 0;
  /** @type {Record<string, number>} */
  var dotFit = dict();
  var lastMinArc = 0;
  /** @type {BandNum | null} */
  var roomNow = null;
  /** @type {Record<string, { f: number, n: number }> | null} */
  var colWalk = null;
  /** @type {Record<string, boolean> | null} */
  var splitHold = null;
  /** @type {Record<string, Point> | null} */
  var posSrc = null;
  /** @type {Record<string, number>} */
  var cellRoom = dict();
  /** @type {Record<string, number> | null} */
  var cellNow = null;
  /** @type {Record<string, number> | null} */
  var edgeNow = null;
  /** @type {Record<string, number>} */
  var edgeCap = dict();
  /** @type {Record<string, boolean>} */
  var hubRow0 = dict();
  var lastCascade = { ins: 0, outs: 0, span: 0, path: "none", frames: 0, ms: 0 };

  function pinPlan() {
    var t0 = (window.performance || Date).now();
    pinnedPlan = buildWedgePlan(true);
    planMs = (window.performance || Date).now() - t0;
    return pinnedPlan;
  }

  /**
   * What a caller may hand cascade(). Every field optional; the header comment on the
   * function says what each does.
   * @typedef {Object} CascadeOpts
   * @property {boolean} [fullRing]
   * @property {boolean} [colToggle]
   * @property {Record<string, string>} [movesFrom]   id -> the group it is leaving
   * @property {(id: string) => number} [order]       arrival rank; clockwise when absent
   * @property {number} [spread]                      stagger window, frames
   * @property {number} [totalMs]
   * @property {(pr: number) => void} [onFrame]
   */
  /** @typedef {{ ids: string[], a: number[], b: number[], out: Record<string, number> }} WalkPair */
  /**
   * @param {(() => void) | null} done
   * @param {CascadeOpts} [opts]
   */
  function cascade(done, opts) {
    if (dead) return;                      // github#62
    opts = opts || {};
    stopPlay();
    if (anim) { WIN.cancelAnimationFrame(anim); anim = null; }
    if (animGuard) { WIN.clearTimeout(animGuard); animGuard = null; }
    if (cascadeRun) {
      WIN.cancelAnimationFrame(cascadeRun.raf);
      WIN.clearTimeout(cascadeRun.guard);
      cascadeRun = null;
    }
    moveFrom = null; splitHold = null;

    fullRing = false;
    graph.forEachNode(function (id) { if (present(id)) fullRing = true; });
    if (opts.fullRing !== undefined) fullRing = !!opts.fullRing;

    planKeep = function (id) { return willShow(id) || present(id); };
    pinPlan();
    colWalk = null;
    /** @type {Record<string, number>} */
    var keep = dict();
    graph.forEachNode(function (id) { keep[id] = alpha[id] || 0; alpha[id] = visible(id) ? timeFactor(id) : 0; });
    var pinWas = pinnedPlan, keepWas = planKeep, roomWas = roomNow;
    pinnedPlan = null; planKeep = null; roomNow = null; cellNow = null; edgeNow = null;
    colWalk = null;
    ringsLayout();
    /** @type {Record<string, Point>} */
    var finalPos = ringsLayout() || {};
    // github#14
    var deferredAutoFit = false;
    if (opts.colToggle && camAtRest) {
      if (fitRatio() < renderer.getCamera().getState().ratio) deferredAutoFit = true;
      else fit();
    }
    pinnedPlan = pinWas; planKeep = keepWas; roomNow = roomWas;
    graph.forEachNode(function (id) { alpha[id] = keep[id]; });
    /** @type {Record<string, number>} */
    var sweepOf = dict();
    graph.forEachNode(function (id) {
      var q = finalPos[id];
      sweepOf[id] = q ? angleSweep(Math.atan2(q.y, q.x)) : 0;
    });

    /** @type {string[]} */
    var moves = [];
    if (opts.movesFrom) {
      moveFrom = opts.movesFrom;
      Object.keys(opts.movesFrom).forEach(function (id) {
        if (!graph.hasNode(id)) return;
        moves.push(id);
      });
      if (!moves.length) moveFrom = null;
    }
    /** @type {Record<string, boolean>} */
    var isMove = dict();
    moves.forEach(function (id) { isMove[id] = true; });

    /** @type {string[]} */
    var ins = [];
    /** @type {string[]} */
    var outs = [];
    /** @type {Record<string, number>} */
    var to = dict();
    /** @type {Record<string, number>} */
    var from = dict();
    graph.forEachNode(function (id) {
      var want = visible(id) ? timeFactor(id) : 0;
      var now = alpha[id] || 0;
      if (moveFrom && moveFrom[id] !== undefined) { from[id] = now; return; }
      if (Math.abs(now - want) <= 0.004) return;
      to[id] = want; from[id] = now;
      (want ? ins : outs).push(id);
    });
    if (moves.length) {
      var saveMF = moveFrom;
      moveFrom = null;
      try {
        moves.forEach(function (id) { to[id] = visible(id) ? timeFactor(id) : 0; });
      } finally { moveFrom = saveMF; }
    }

    if (!ins.length && !outs.length && !moves.length) {
      lastCascade = { ins: 0, outs: 0, span: 0, path: "instant: nothing to move", frames: 0, ms: 0 };
      pinnedPlan = null; roomNow = null; cellNow = null; edgeNow = null; posSrc = null; applyLayout(true); return;
    }

    /** @param {string} a @param {string} b */
    var clockwise = function (a, b) { return sweepOf[a] - sweepOf[b]; };
    var rank = typeof opts.order === "function" ? opts.order : null;
    var arrival = rank ? /** @param {string} a @param {string} b */ function (a, b) { return rank(a) - rank(b); } : clockwise;
    ins.sort(arrival);
    outs.sort(arrival);
    moves.sort(arrival);

    /** @param {number} n */
    var windowFor = function (n) {
      if (opts.spread > 0) return opts.spread;
      return Math.max(SPREAD_MIN, Math.min(SPREAD_MAX, n * SPREAD_PER)) * TIME_SCALE;
    };
    /** @type {Record<string, number>} */
    var delay = dict();
    [ins, outs].forEach(function (set) {
      var w = windowFor(set.length);
      set.forEach(function (id, i) { delay[id] = set.length < 2 ? 0 : w * i / (set.length - 1); });
    });
    // github#49
    var moveSpan = moves.length
      ? Math.max(2 * windowFor(moves.length), 4 * FADE_FRAMES * TIME_SCALE) + 2 * FADE_FRAMES * TIME_SCALE
      : 0;
    var span = Math.max(windowFor(ins.length), windowFor(outs.length))
             + FADE_FRAMES * TIME_SCALE;
    if (moveSpan > span) span = moveSpan;
    /** @type {Record<string, number>} */
    var arriveAt = dict();
    /** @type {Record<string, number>} */
    var crossAt = dict();
    if (moves.length) (function () {
      var leaveW = span * 0.35;
      var landW = Math.max(1, span * 0.45 - FADE_FRAMES * TIME_SCALE);
      moves.forEach(function (id, i) {
        var f = moves.length < 2 ? 0 : i / (moves.length - 1);
        delay[id] = leaveW * f;
        arriveAt[id] = span * 0.55 + landW * f;
        var lo = delay[id] + FADE_FRAMES * TIME_SCALE;
        var hi = Math.max(lo, arriveAt[id] - FADE_FRAMES * TIME_SCALE);
        crossAt[id] = lo + (hi - lo) * f;
      });
    })();
    /** @type {Record<string, string>} */
    var tglDir = dict();
    /** @type {Record<string, number>} */
    var tglN = dict();
    /** @type {Record<string, number>} */
    var tglMv = dict();
    if (opts.colToggle) (function () {
      /** @type {Record<string, number>} */
      var startN = dict();
      /** @type {Record<string, number>} */
      var outN = dict();
      /** @type {Record<string, number>} */
      var inN = dict();
      graph.forEachNode(function (id) {
        if ((alpha[id] || 0) > 0.004) {
          var g0 = groupOf(id);
          startN[g0] = (startN[g0] || 0) + 1;
        }
      });
      outs.forEach(function (id) { var g0 = groupOf(id); outN[g0] = (outN[g0] || 0) + 1; });
      ins.forEach(function (id) { var g0 = groupOf(id); inN[g0] = (inN[g0] || 0) + 1; });
      // github#49
      /** @type {Record<string, number>} */
      var mvOutN = dict();
      /** @type {Record<string, number>} */
      var mvInN = dict();
      moves.forEach(function (id) { var g0 = groupOf(id); outN[g0] = (outN[g0] || 0) + 1; mvOutN[g0] = 1; });
      (function () {
        var save = moveFrom;
        moveFrom = null;
        try {
          moves.forEach(function (id) { var g0 = groupOf(id); inN[g0] = (inN[g0] || 0) + 1; mvInN[g0] = 1; });
        } finally { moveFrom = save; }
      })();
      Object.keys(outN).forEach(function (g0) {
        if (!inN[g0] && outN[g0] === (startN[g0] || 0)) { tglDir[g0] = "out"; tglN[g0] = outN[g0]; if (mvOutN[g0]) tglMv[g0] = true; }
      });
      Object.keys(inN).forEach(function (g0) {
        if (!outN[g0] && !(startN[g0] || 0)) { tglDir[g0] = "in"; tglN[g0] = inN[g0]; if (mvInN[g0]) tglMv[g0] = true; }
      });
    })();

    if (moves.length) (function () {
      /** @type {Record<string, string[]>} */
      var byG = dict();
      moves.forEach(function (id) {
        var g0 = moveFrom[id];
        if (tglDir[g0] === "out") (byG[g0] || (byG[g0] = [])).push(id);
      });
      var stretch = Math.max(1, span - 2 * FADE_FRAMES * TIME_SCALE);
      Object.keys(byG).forEach(function (g0) {
        var set = byG[g0];
        set.sort(function (p0, q0) {
          var ap = graph.getNodeAttributes(p0), aq = graph.getNodeAttributes(q0);
          return Math.hypot(ap.x, ap.y) - Math.hypot(aq.x, aq.y);
        });
        set.forEach(function (id, i) {
          delay[id] = set.length < 2 ? stretch : stretch * i / (set.length - 1);
          crossAt[id] = delay[id] + FADE_FRAMES * TIME_SCALE;
          arriveAt[id] = Math.max(span * 0.55, crossAt[id] + FADE_FRAMES * TIME_SCALE);
        });
      });
    })();

    if (moves.length) (function () {
      var save = moveFrom;
      moveFrom = null;
      /** @type {Record<string, string[]>} */
      var byDest = dict();
      try {
        moves.forEach(function (id) {
          var g0 = groupOf(id);
          (byDest[g0] || (byDest[g0] = [])).push(id);
        });
      } finally { moveFrom = save; }
      var lo1 = span * 0.55, hi1 = span - FADE_FRAMES * TIME_SCALE;
      Object.keys(byDest).forEach(function (g0) {
        var set = byDest[g0];
        set.sort(function (p0, q0) { return arriveAt[p0] - arriveAt[q0]; });
        set.forEach(function (id, i) {
          var f0 = set.length < 2 ? 0 : i / (set.length - 1);
          arriveAt[id] = Math.max(lo1 + (hi1 - lo1) * f0, crossAt[id] + FADE_FRAMES * TIME_SCALE);
        });
      });
    })();

    var moving = ins.concat(outs).concat(moves);
    lastCascade = { ins: ins.length, outs: outs.length, span: Math.round(span * 100) / 100,
                    path: "animated", frames: 0, ms: 0, t0: NOW() };

    var settle = function () {
      if (!lastCascade.exit) lastCascade.exit = "settle() called from outside the loop";
      moveFrom = null; splitHold = null;
      if (cascadeRun) {
        WIN.cancelAnimationFrame(cascadeRun.raf);
        WIN.clearTimeout(cascadeRun.guard);
        cascadeRun = null;
      }
      probeSample("pre-settle");
      moving.forEach(function (id) { alpha[id] = to[id]; });
      pinnedPlan = null;
      planKeep = null;
      roomNow = null; cellNow = null; edgeNow = null; posSrc = null;
      colWalk = null;
      assignPositions(finalPos);
      // github#21
      ringsLayout();
      ringsLayout();
      renderer.refresh({ skipIndexation: false });
      probeSample("settled");
      if (deferredAutoFit && camAtRest) fit();
      if (done) done();
    };

    /** @param {string} id */
    var weightOf = function (id) { return alpha[id] || 0; };

    /** @type {Record<string, boolean>} */
    var wasPresent = dict();
    graph.forEachNode(function (id) { wasPresent[id] = present(id); });

    var ovAfter = true;

    /** @type {BandNum} */
    var spSrcB = { i: 1, o: 1 };
    /** @type {BandNum} */
    var spDstB = { i: 1, o: 1 };
    /** @type {BandNum} */
    var roomSrcB = { i: 0, o: 0 };
    /** @type {BandNum} */
    var roomDstB = { i: 0, o: 0 };
    /** @type {Record<string, number> | null} */
    var cellSrc = null;
    /** @type {Record<string, number> | null} */
    var cellDst = null;
    /** @type {Record<string, number> | null} */
    var edgeSrc = null;
    /** @type {Record<string, number> | null} */
    var edgeDst = null;
    // github#19
    /** @type {WalkPair | null} */
    var cellPair = null;
    /** @type {WalkPair | null} */
    var edgePair = null;
    // github#66
    /** @type {Record<string, number> | null} */
    var sizeCap = null;
    /** @type {Record<string, number>} */
    var rowsSrc = dict();
    /** @type {Record<string, number>} */
    var rowsDst = dict();
    /** @type {BandNum} */
    var bandSrc = dict();
    /** @type {BandNum} */
    var bandDst = dict();
    /** @param {(id: string) => boolean} presentFn */
    var staticPlan = function (presentFn) {
      var save = planKeep;
      planKeep = presentFn;
      var p = buildWedgePlan(true,
                             function (id) { return presentFn(id) ? 1 : 0; });
      planKeep = save;
      return p;
    };
    (function () {
      var a = staticPlan(function (id) { return wasPresent[id]; });
      /** @param {Plan | null} p0 */
      var cellsOfG = function (p0) {
        /** @type {Record<string, number>} */
        var m = dict();
        if (p0) p0.cells.forEach(function (c) { m[c.g] = (m[c.g] || 0) + 1; });
        return m;
      };
      var b = (function () {
        var save = moveFrom;
        moveFrom = null;
        try { return staticPlan(function (id) { return willShow(id); }); }
        finally { moveFrom = save; }
      })();
      var aCells = cellsOfG(a), bCells = cellsOfG(b);
      if (moves.length) {
        splitHold = dict();
        Object.keys(bCells).forEach(function (g0) { splitHold[g0] = bCells[g0] > 1; });
        Object.keys(aCells).forEach(function (g0) {
          if (splitHold[g0] === undefined) splitHold[g0] = aCells[g0] > 1;
        });
      }
      Object.keys(tglDir).forEach(function (g0) {
        var n0 = tglDir[g0] === "out" ? aCells[g0] : bCells[g0];
        if (n0 !== 1) delete tglDir[g0];
      });
      /** @param {BandNum} m @param {Cell} c */
      var deepen = function (m, c) {
        var k = c.inner ? "i" : "o";
        if (m[k] === undefined || c.rows > m[k]) m[k] = c.rows;
      };
      /** @param {Record<string, number>} rows @param {BandNum} band */
      var record = function (rows, band) {
        /** @param {Cell} c */
        return function (c) {
          if (c.wsum <= 0.0001) return;
          rows[c.k] = c.rows;
          deepen(band, c);
        };
      };
      if (a) a.cells.forEach(record(rowsSrc, bandSrc));
      if (b) b.cells.forEach(record(rowsDst, bandDst));
      ["i", "o"].forEach(function (k) {
        if (bandSrc[k] === undefined && bandDst[k] !== undefined) bandSrc[k] = 1;
      });
      if (a) { spSrcB = { i: a.spInner || a.sp || 1, o: a.sp || 1 }; }
      if (b) { spDstB = { i: b.spInner || b.sp || 1, o: b.sp || 1 }; }
      /** @param {Plan | null} pl @param {((id: string) => number) | null} alphaFn */
      var roomOf = function (pl, alphaFn) {
        if (!pl) return null;
        /** @type {Record<string, Point> | null} */
        var outPos = null;
        /** @type {Record<string, number> | null} */
        var keepAlpha = null;
        if (alphaFn) {
          keepAlpha = dict();
          graph.forEachNode(function (id) { keepAlpha[id] = alpha[id]; alpha[id] = alphaFn(id); });
        }
        var keepI = bandOf("i").room, keepO = bandOf("o").room;
        var keepFit = dotFit, keepCell = cellRoom, keepEdge = edgeCap, keepHub = hubRow0;
        var keepRampI = bandOf("i").ramp, keepRampO = bandOf("o").ramp, keepScale = sizeScale;
        var keepPin = pinnedPlan, keepKeep = planKeep;
        var saved = roomNow, savedCell = cellNow, savedEdge = edgeNow;
        roomNow = null; cellNow = null; edgeNow = null; edgeNow = null;
        outPos = ringsLayout(pl, true);
        // github#66
        measureSizeScale();
        /** @type {Record<string, number>} */
        var sizes = dict();
        graph.forEachNode(function (id, at) {
          if ((alpha[id] || 0) > 0.004) sizes[id] = dotPx(at.size, id);
        });
        var got = { i: bandOf("i").room, o: bandOf("o").room, pos: outPos,
                    cells: cellRoom, edges: edgeCap, sizes: sizes };
        roomNow = saved; cellNow = savedCell; edgeNow = savedEdge;
        bandOf("i").room = keepI; bandOf("o").room = keepO;
        bandOf("i").ramp = keepRampI; bandOf("o").ramp = keepRampO; sizeScale = keepScale;
        dotFit = keepFit; cellRoom = keepCell; edgeCap = keepEdge; hubRow0 = keepHub;
        pinnedPlan = keepPin; planKeep = keepKeep;
        if (keepAlpha) graph.forEachNode(function (id) { alpha[id] = keepAlpha[id]; });
        return got;
      };
      var rA = roomOf(a, null);
      var rB = roomOf(b, function (id) { return willShow(id) ? timeFactor(id) : 0; });
      if (rA) roomSrcB = { i: rA.i || 0, o: rA.o || 0 };
      if (rB) roomDstB = { i: rB.i || 0, o: rB.o || 0 };
      cellSrc = (rA && rA.cells) || null; cellDst = (rB && rB.cells) || null;
      edgeSrc = (rA && rA.edges) || null; edgeDst = (rB && rB.edges) || null;
      // github#66
      if (rA || rB) {
        sizeCap = dict();
        /** @param {Record<string, number>} m */
        var takeCap = function (m) {
          Object.keys(m).forEach(function (id) {
            var v = m[id];
            if (sizeCap && (sizeCap[id] === undefined || v > sizeCap[id])) sizeCap[id] = v;
          });
        };
        if (rA) takeCap(rA.sizes);
        if (rB) takeCap(rB.sizes);
      }
      // github#19
      /**
       * @param {Record<string, number> | null} src
       * @param {Record<string, number> | null} dst
       * @returns {WalkPair | null}
       */
      var pairUp = function (src, dst) {
        if (!src && !dst) return null;
        /** @type {string[]} */
        var ids = [];
        /** @type {number[]} */
        var av = [];
        /** @type {number[]} */
        var bv = [];
        /** @type {Record<string, number>} */
        var seen = dict();
        /** @param {string} id */
        var take = function (id) {
          if (seen[id] !== undefined) return;
          var x = src ? src[id] : undefined, y = dst ? dst[id] : undefined;
          if (x === undefined && y === undefined) return;
          if (x === undefined) x = y;
          if (y === undefined) y = x;
          seen[id] = 1; ids.push(id); av.push(x); bv.push(y);
        };
        if (src) Object.keys(src).forEach(take);
        if (dst) Object.keys(dst).forEach(take);
        return { ids: ids, a: av, b: bv, out: dict() };
      };
      cellPair = pairUp(cellSrc, cellDst);
      edgePair = pairUp(edgeSrc, edgeDst);
      posSrc = dict();
      graph.forEachNode(function (id) {
        posSrc[id] = { x: graph.getNodeAttribute(id, "x"), y: graph.getNodeAttribute(id, "y") };
      });
    })();

    var STALL_MS = 400;
    var watchdog = function () {
      if (cascadeRun && NOW() - cascadeRun.tick < STALL_MS) {
        cascadeRun.guard = WIN.setTimeout(watchdog, STALL_MS);
        return;
      }
      settle();
    };
    var msPerFrame = (opts.totalMs > 0 ? opts.totalMs : CASCADE_MS * TIME_SCALE) / Math.max(1, span);
    var MIN_FRAMES = 20;
    var maxAdv = Math.max(1, span) / MIN_FRAMES;
    var frame = 0, tPrev = NOW(), tailFrames = 0;
    // github#67
    (function () {
      var stretch = Math.max(1, span - FADE_FRAMES * TIME_SCALE);
      /** @param {string} id @param {boolean} out */
      var radiusOf = function (id, out) {
        var pt = out ? posSrc[id] : finalPos[id];
        if (!pt) { var a0 = graph.getNodeAttributes(id); pt = { x: a0.x, y: a0.y }; }
        return Math.hypot(pt.x, pt.y);
      };
      Object.keys(tglDir).forEach(function (g0) {
        var out = tglDir[g0] === "out";
        var set = (out ? outs : ins).filter(function (id) {
          return groupOf(id) === g0;
        });
        if (!set.length) return;
        set.sort(function (p, q) {
          var d = radiusOf(p, out) - radiusOf(q, out);
          return out ? d : -d;
        });
        if (out) {
          set.forEach(function (id, i) {
            delay[id] = set.length < 2 ? stretch : stretch * i / (set.length - 1);
          });
        } else {
          var base0 = set.map(function (id) { return delay[id] || 0; }).sort(function (x, y) { return x - y; });
          set.forEach(function (id, i) { delay[id] = base0[i]; });
        }
      });
    })();
    cascadeRun = { raf: 0, tick: NOW(), guard: WIN.setTimeout(watchdog, STALL_MS), sizeCap: sizeCap };
    (function step() {
      var tn = NOW();
      var adv = (tn - tPrev) / msPerFrame;
      tPrev = tn;
      if (adv > maxAdv) adv = maxAdv;
      frame += adv;
      if (cascadeRun) cascadeRun.tick = tn;
      var pr = Math.min(1, frame / Math.max(1, span));
      var ease = pr * pr * (3 - 2 * pr);
      var busy = false;
      for (var i = 0; i < moving.length; i++) {
        var id = moving[i];
        if (isMove[id]) {
          if (moveFrom && moveFrom[id] !== undefined && frame >= crossAt[id]) delete moveFrom[id];
          if (frame < arriveAt[id]) {
            var q1 = (frame - delay[id]) / (FADE_FRAMES * TIME_SCALE);
            q1 = q1 < 0 ? 0 : q1 > 1 ? 1 : q1;
            alpha[id] = (from[id] === undefined ? 1 : from[id]) * (1 - q1 * q1 * (3 - 2 * q1));
          } else {
            var q2 = (frame - arriveAt[id]) / (FADE_FRAMES * TIME_SCALE);
            q2 = q2 < 0 ? 0 : q2 > 1 ? 1 : q2;
            alpha[id] = (to[id] === undefined ? 1 : to[id]) * (q2 * q2 * (3 - 2 * q2));
          }
          if (frame < arriveAt[id] + FADE_FRAMES * TIME_SCALE) busy = true;
          continue;
        }
        var q = (frame - delay[id]) / (FADE_FRAMES * TIME_SCALE);
        q = q < 0 ? 0 : q > 1 ? 1 : q;
        alpha[id] = from[id] + (to[id] - from[id]) * (q * q * (3 - 2 * q));
        if (q < 1) busy = true;
      }

      if (opts.onFrame) opts.onFrame(pr);

      /** @param {Cell} c */
      var rowsAt = function (c) {
        var s = rowsSrc[c.k], d = rowsDst[c.k];
        if (s === undefined && d === undefined) return 0;
        var bk = c.inner ? "i" : "o";
        if (s === undefined) s = bandSrc[bk] !== undefined ? bandSrc[bk] : d;
        if (d === undefined) d = bandDst[bk] !== undefined ? bandDst[bk] : s;
        return s + (d - s) * ease;
      };
      /** @param {string} k */
      var roomWalk = function (k) {
        var sv = roomSrcB[k], dv = roomDstB[k];
        if (!(sv > 1)) return dv;
        if (!(dv > 1)) return sv;
        return sv + (dv - sv) * ease;
      };
      /** @param {string} k */
      var depthWalk = function (k) {
        var a2 = bandSrc[k], b2 = bandDst[k];
        if (a2 === undefined && b2 === undefined) return 0;
        if (a2 === undefined) a2 = b2;
        if (b2 === undefined) b2 = a2;
        return a2 + (b2 - a2) * ease;
      };
      // github#44
      /** @param {string} k */
      var thickAt = function (k) {
        var ds = bandSrc[k], dd = bandDst[k];
        if (ds === undefined && dd === undefined) return 0;
        if (ds === undefined) ds = dd;
        if (dd === undefined) dd = ds;
        var ts = ds * spSrcB[k], td = dd * spDstB[k];
        return ts + (td - ts) * ease;
      };
      /** @param {string} k */
      var spWalk = function (k) {
        var rows = depthWalk(k), T = thickAt(k);
        if (!(rows > 0) || !(T > 0)) return spSrcB[k] + (spDstB[k] - spSrcB[k]) * ease;
        return T / rows;
      };
      var spNow = {
        i: spWalk("i"),
        o: spWalk("o"),
        depth: { i: depthWalk("i"), o: depthWalk("o") },
      };
      roomNow = { i: roomWalk("i"), o: roomWalk("o") };
      colWalk = dict();
      Object.keys(tglDir).forEach(function (g0) {
        var fRamp = tglDir[g0] === "out" ? 1 - pr : pr;
        if (tglMv[g0]) {
          var mvEdge = Math.min(0.45, (FADE_FRAMES * TIME_SCALE * 2) / Math.max(1, span));
          fRamp = tglDir[g0] === "out"
            ? Math.max(0, Math.min(1, (1 - mvEdge - pr) / (1 - mvEdge)))
            : Math.max(0, Math.min(1, (pr - mvEdge) / (0.55 - mvEdge)));
        }
        colWalk[g0] = { f: fRamp, n: tglN[g0] || 1 };
      });
      /** @param {WalkPair | null} p */
      var walkPair = function (p) {
        if (!p) return null;
        var ids = p.ids, av = p.a, bv = p.b, out = p.out;
        for (var i = 0, n = ids.length; i < n; i++) {
          out[ids[i]] = av[i] + (bv[i] - av[i]) * ease;
        }
        return out;
      };
      if (cellPair) cellNow = walkPair(cellPair);
      if (edgePair) edgeNow = walkPair(edgePair);
      var plan = buildWedgePlan(ovAfter, weightOf, rowsAt, spNow);
      var targets = plan ? ringsLayout(plan, true) : null;
      var ez = pr < 1 ? RADIAL_EASE
                      : Math.min(1, RADIAL_EASE + tailFrames * 0.15);
      var resid = 0;
      if (targets) graph.forEachNode(function (id) {
        var q = targets[id];
        if (!q) return;
        // github#41
        var h = Math.atan2(q.y, q.x);
        if ((alpha[id] || 0) < 0.05) {
          graph.mergeNodeAttributes(id, { x: q.x, y: q.y });
          return;
        }
        // github#41
        // github#41
        var x = graph.getNodeAttribute(id, "x"), y = graph.getNodeAttribute(id, "y");
        var rNow = Math.hypot(x, y), rWant = Math.hypot(q.x, q.y);
        var gap = rWant - rNow;
        if (gap < 0 ? -gap > resid : gap > resid) resid = gap < 0 ? -gap : gap;
        var r = rNow + gap * ez;
        graph.mergeNodeAttributes(id, { x: r * Math.cos(h), y: r * Math.sin(h) });
      });
      if (pr >= 1) tailFrames++;
      probeSample("cascade");
      lastCascade.frames++;
      lastCascade.ms = Math.round(NOW() - lastCascade.t0);
      renderer.refresh({ skipIndexation: true });
      if (probe) lastCascade.last = { adv: Math.round(adv * 1000) / 1000, frame: Math.round(frame * 100) / 100,
                           span: Math.round(span * 100) / 100, pr: Math.round(pr * 1000) / 1000,
                           busy: busy, resid: Math.round(resid * 100) / 100,
                           msPerFrame: Math.round(msPerFrame * 1000) / 1000,
                           moving: moving.length, run: !!cascadeRun };
      if (busy || pr < 1 || resid > 0.5) cascadeRun.raf = WIN.requestAnimationFrame(step);
      else { lastCascade.exit = "converged"; settle(); }
    })();
  }

  /* ------------------------------------------------------------- animation */

  /**
   * The per-frame layout probe behind __vg.probe(), standalone only: one flat record per
   * sampled frame, plus the fixed set of notes it measures (see where it is captured).
   * @typedef {Record<string, number | string | null>} ProbeSample
   * @typedef {Object} Probe
   * @property {number} t0
   * @property {ProbeSample[]} samples
   * @property {number | null} prevAng
   * @property {number | null} prevR
   * @property {Record<string, number>} set
   * @property {string} [watch]
   * @property {unknown} [watched]
   * @property {unknown[]} [watchSeries]
   */
  /** @type {Probe | null} */
  var probe = null;
  /** @param {string} tag */
  function probeSample(tag) {
    if (!probe) return;
    var iMin = Infinity, iMax = 0, oMin = Infinity, oMax = 0, iN = 0, oN = 0;
    var prev = probe.prevAng;
    /** @type {Record<string, number>} */
    var now = dict();
    var prevR = probe.prevR;
    /** @type {Record<string, number>} */
    var nowR = dict();
    var tanStep = 0, tanId = null, tanOver = 0, tanSum = 0, tanN = 0;
    var radStep = 0, radId = null, radSum = 0, radN = 0;
    graph.forEachNode(function (id, a) {
      var r = Math.hypot(a.x, a.y);
      if (present(id)) {
        var th = Math.atan2(a.y, a.x);
        now[id] = th;
        nowR[id] = r;
        if (prevR && prevR[id] !== undefined) {
          var dr = Math.abs(r - prevR[id]);
          if (dr > radStep) { radStep = dr; radId = id; }
          radSum += dr; radN++;
        }
        if (prev && prev[id] !== undefined) {
          var d = th - prev[id];
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          var moved = Math.abs(d) * r;
          if (moved > tanStep) { tanStep = moved; tanId = id; }
          if (moved > 160) tanOver++;
          tanSum += moved; tanN++;
        }
      }
      // github#17
      if (probe.set && !probe.set[id]) return;
      if (bandLock && bandLock[groupOf(id)]) {
        iN++; if (r < iMin) iMin = r; if (r > iMax) iMax = r;
      } else {
        oN++; if (r < oMin) oMin = r; if (r > oMax) oMax = r;
      }
    });
    probe.prevAng = now;
    probe.prevR = nowR;
    if (probe.watch) probe.watchSeries.push(probe.watched || null);
    probe.samples.push({
      tag: tag, ms: Math.round(NOW() - probe.t0), gapI: lastGapN.i, gapO: lastGapN.o,
      ngI: bandOf("i").nG, ngO: bandOf("o").nG,
      gapDegI: bandOf("i").gapDeg, gapDegO: bandOf("o").gapDeg,
      radStep: Math.round(radStep), radId: radId,
      radMean: Math.round(radN ? radSum / radN : 0),
      tanStep: Math.round(tanStep), tanId: tanId, tanOver: tanOver,
      tanMean: Math.round(tanN ? tanSum / tanN : 0),
      starts: lastStart,
      arcs: lastArc,
      bands: lastBand,
      innerN: iN, innerMin: Math.round(iMin === Infinity ? 0 : iMin), innerMax: Math.round(iMax),
      outerN: oN, outerMin: Math.round(oMin === Infinity ? 0 : oMin), outerMax: Math.round(oMax)
    });
  }

  /** @type {number | null} */
  var anim = null;
  /** @type {number | null} */
  var animGuard = null;

  // github#19, github#58
  /** @param {Record<string, Point>} targets */
  function assignPositions(targets) {
    graph.forEachNode(function (id) {
      var t = targets[id];
      if (t) graph.mergeNodeAttributes(id, { x: t.x, y: t.y });
    });
  }

  /** @param {Record<string, Point> | null} targets @param {(() => void)} [done] */
  function animateTo(targets, done) {
    if (anim) { WIN.cancelAnimationFrame(anim); anim = null; }
    if (animGuard) WIN.clearTimeout(animGuard);

    var polar = state.layout === "rings";
    /**
     * Where each note starts, and where it is going. Two shapes, one per branch of `polar`:
     * cartesian carries x/y and the target tx/ty, polar carries the start radius and angle
     * plus the deltas to walk. Both are read back in the step below under the same `polar`.
     * @type {Record<string, { x?: number, y?: number, tx?: number, ty?: number,
     *                         r?: number, h?: number, dr?: number, dh?: number }>}
     */
    var from = {};
    graph.forEachNode(function (id, a) {
      var t = targets[id] || { x: a.x, y: a.y };
      if (!polar) { from[id] = { x: a.x, y: a.y, tx: t.x, ty: t.y }; return; }
      var r0_ = Math.hypot(a.x, a.y), r1_ = Math.hypot(t.x, t.y);
      var h0 = Math.atan2(a.y, a.x), h1 = Math.atan2(t.y, t.x);
      var d = h1 - h0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      from[id] = { r: r0_, h: h0, dr: r1_ - r0_, dh: d };
    });

    var settle = function () {
      if (anim) { WIN.cancelAnimationFrame(anim); anim = null; }
      if (animGuard) { WIN.clearTimeout(animGuard); animGuard = null; }
      assignPositions(targets);
      renderer.refresh({ skipIndexation: false });
      if (done) done();
    };
    var dur = TWEEN_MS * TIME_SCALE;
    var lastFrame = NOW();
    var TWEEN_STALL = 400;
    var tweenDog = function () {
      if (anim && NOW() - lastFrame < TWEEN_STALL) { animGuard = WIN.setTimeout(tweenDog, TWEEN_STALL); return; }
      settle();
    };
    animGuard = WIN.setTimeout(tweenDog, TWEEN_STALL);

    var MIN_FRAMES = 20;
    var p = 0, tPrev = NOW();
    (function step() {
      var tn = NOW();
      lastFrame = tn;
      var adv = (tn - tPrev) / dur;
      tPrev = tn;
      if (adv > 1 / MIN_FRAMES) adv = 1 / MIN_FRAMES;
      p = Math.min(1, p + adv);
      var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      graph.forEachNode(function (id) {
        var f = from[id];
        if (!f) return;
        if (polar) {
          var r = f.r + f.dr * e, h = f.h + f.dh * e;
          graph.mergeNodeAttributes(id, { x: r * Math.cos(h), y: r * Math.sin(h) });
        } else {
          graph.mergeNodeAttributes(id, {
            x: f.x + (f.tx - f.x) * e,
            y: f.y + (f.ty - f.y) * e
          });
        }
      });
      probeSample("tween");
      renderer.refresh({ skipIndexation: false });
      if (p < 1) { anim = WIN.requestAnimationFrame(step); }
      else { settle(); }
    })();
  }

  /** @param {boolean} [animate] @param {() => void} [done] */
  function applyLayout(animate, done) {
    var targets = ringsLayout();
    if (!targets) { if (done) done(); return; }
    if (animate) animateTo(targets, done);
    else {
      assignPositions(targets);
      renderer.refresh({ skipIndexation: false });
      if (done) done();
    }
  }

  /* ---------------------------------------------------------------- render */

  /** @type {RendererLike | undefined} */
  var renderer;
  /** @type {Record<string, string[]> | null} */
  var neighbourCache = null;

  /** @param {string} id @returns {string[]} */
  function neighboursOf(id) {
    if (!neighbourCache) neighbourCache = {};
    if (!neighbourCache[id]) {
      neighbourCache[id] = (adj[id] || []).map(function (e) { return e.o; });
    }
    return neighbourCache[id];
  }

  /** @type {string | null} */
  var lazyShown = null;
  /** @type {[string, string][]} */
  var lazyAdded = [];
  function syncLazyEdges() {
    if (!lazyEdges) return;
    var want = state.hovered || state.selected || null;
    if (want === lazyShown) return;
    lazyAdded.forEach(function (pr) {
      if (graph.hasEdge(pr[0], pr[1])) graph.dropEdge(pr[0], pr[1]);
    });
    lazyAdded = [];
    if (want) (adj[want] || []).forEach(function (e) {
      if (!graph.hasEdge(want, e.o)) {
        graph.addUndirectedEdge(want, e.o, edgeAttrsOf(e.w));
        lazyAdded.push([want, e.o]);
      }
    });
    lazyShown = want;
  }

  // github#19
  /** @param {NodeAttrs} a @param {number} k how many folder levels deep */
  function pathKey(a, k) {
    var d = a.dirs;
    if (!d || !d.length) return a.folder + "/";
    if (!(k >= 1)) return a.folder + "/" + d.slice(0, k).join("/");
    var out = a.folder + "/" + d[0];
    for (var i = 1; i < k && i < d.length; i++) out += "/" + d[i];
    return out;
  }

  /** @param {string} id */
  function visible(id) {
    var a = graph.getNodeAttributes(id);
    if (isHidden(groupOf(id))) return false;
    if (state.dim === "folder") {
      var d = a.dirs || [];
      if (!d.length) {
        if (state.hiddenSub[a.folder + "/"]) return false;
      } else {
        // github#19
        var key = a.folder + "/" + d[0];
        if (state.hiddenSub[key]) return false;
        for (var k = 1; k < d.length; k++) {
          key += "/" + d[k];
          if (state.hiddenSub[key]) return false;
        }
      }
    }
    return true;
  }

  /* ------------------------------------------------------------ hover tween */

  var HOVER_MS = 150;
  var HOVER_GROW = 0.45;
  var hoverT = 0, hoverAim = 0, hoverRaf = 0, hoverPrev = 0;

  /** @type {Record<string, string>} */
  var mixCache = dict();
  /** @param {string} from hex @param {string} to hex @param {number} t 0..1 @returns {string} */
  function mixHex(from, to, t) {
    if (t <= 0) return from;
    if (t >= 1) return to;
    var key = from + to + t.toFixed(2);
    var hit = mixCache[key];
    if (hit) return hit;
    var a = toRgb(from), b = toRgb(to), out = "#";
    for (var i = 0; i < 3; i++) {
      var v = Math.round(a[i] + (b[i] - a[i]) * t).toString(16);
      out += v.length < 2 ? "0" + v : v;
    }
    return (mixCache[key] = out);
  }

  function hoverAmount() {
    return (state.hovered && state.hovered !== state.selected) ? hoverT : 1;
  }

  /** @param {number} aim */
  function hoverTo(aim) {
    hoverAim = aim;
    if (hoverRaf) return;
    hoverPrev = NOW();
    (function step() {
      var now = NOW(), dt = now - hoverPrev;
      hoverPrev = now;
      var adv = Math.min(dt, HOVER_MS) / (HOVER_MS * TIME_SCALE);
      hoverT += hoverAim > hoverT ? adv : -adv;
      if (hoverT > 1) hoverT = 1;
      if (hoverT < 0) hoverT = 0;
      var landed = hoverT === hoverAim;
      if (landed && hoverT === 0) { state.hovered = null; syncLazyEdges(); }
      renderer.refresh({ skipIndexation: true });
      if (landed) { hoverRaf = 0; return; }
      hoverRaf = WIN.requestAnimationFrame(step);
    })();
  }

  /* -------------------------------------------------------- highlight ramp */

  /** @type {Record<string, number>} */
  var hl = dict();
  var hlRaf = 0, hlPrev = 0, hlSig = "";
  var HL_GROW = 0.2;

  function hlSignature() {
    return Object.keys(state.highlight).join(",") + "|" +
           Object.keys(state.highlightSub).join(",") + "|" +
           (state.markDay || "") + "|" + (state.hoverDay || "") + "|" +
           (state.hoverGroup || "") + "|" + Object.keys(state.hoverSub).join(",") + "|" +
           (state.hoverYear || "");
  }

  function hlWalk() {
    if (hlRaf) return;
    hlPrev = NOW();
    (function step() {
      var now = NOW(), dt = now - hlPrev;
      hlPrev = now;
      var adv = Math.min(dt, TWEEN_MS) / (TWEEN_MS * TIME_SCALE);
      var moving = false;
      graph.forEachNode(function (id) {
        var aim = isHighlighted(id) ? 1 : 0, v = hl[id] || 0;
        if (v === aim) return;
        v += aim > v ? adv : -adv;
        if (v > 1) v = 1;
        if (v < 0) v = 0;
        hl[id] = v;
        if (v !== aim) moving = true;
      });
      renderer.refresh({ skipIndexation: true });
      if (!moving) { hlRaf = 0; return; }
      hlRaf = WIN.requestAnimationFrame(step);
    })();
  }

  function hlSync() {
    var sig = hlSignature();
    if (sig === hlSig) return;
    hlSig = sig;
    hlWalk();
  }

  /** @type {{ key: string | null | undefined, set: Record<string, boolean> | null }} */
  var focusSetCache = { key: undefined, set: null };
  function focusSet() {
    var f = state.hovered || state.selected;
    if (focusSetCache.key === f) return focusSetCache.set;
    /** @type {Record<string, boolean> | null} */
    var set = null;
    if (f) {
      set = dict();
      set[f] = true;
      neighboursOf(f).forEach(function (n) { set[n] = true; });
    }
    focusSetCache.key = f;
    focusSetCache.set = set;
    return set;
  }

  /** @param {string} e edge key @param {string} s @param {string} t */
  function edgeCurveGeom(e, s, t) {
    var ed = renderer.getEdgeDisplayData(e);
    if (!ed || ed.hidden) return null;
    var ps = renderer.graphToViewport(graph.getNodeAttributes(s));
    var pt = renderer.graphToViewport(graph.getNodeAttributes(t));
    var dx = pt.x - ps.x, dy = pt.y - ps.y, k = ed.type === "curve" ? (ed.curvature || 0) : 0;
    return { ed: ed, ps: ps, pt: pt, k: k, cp: { x: (ps.x + pt.x) / 2 + dy * k, y: (ps.y + pt.y) / 2 - dx * k } };
  }

  /** @param {CanvasRenderingContext2D} ctx @param {import("./engine/types").HoverData} data */
  function drawFocusWeb(ctx, data) {
    var f = state.hovered || state.selected;
    if (!f || data.key !== f || state.query) return;
    var ht = hoverAmount();
    if (ht <= 0) return;
    var set = focusSet();
    /** @type {Record<string, boolean>} */
    var seen = dict();
    ctx.save();
    ctx.globalAlpha = ht;
    ctx.lineCap = "round";
    Object.keys(set).forEach(function (n) {
      graph.forEachEdge(n, function (e, attrs, s, t) {
        if (seen[e]) return;
        seen[e] = true;
        if (!set[s] || !set[t]) return;
        var geo = edgeCurveGeom(e, s, t);
        if (!geo) return;
        ctx.beginPath();
        ctx.moveTo(geo.ps.x, geo.ps.y);
        if (geo.k) ctx.quadraticCurveTo(geo.cp.x, geo.cp.y, geo.pt.x, geo.pt.y);
        else ctx.lineTo(geo.pt.x, geo.pt.y);
        ctx.lineWidth = edgePx(geo.ed.size);
        ctx.strokeStyle = geo.ed.color;
        ctx.stroke();
      });
    });
    Object.keys(set).forEach(function (n) {
      if (n === f) return;
      var nd = renderer.getNodeDisplayData(n);
      if (!nd || nd.hidden || nd.type === "halo") return;
      var p = renderer.graphToViewport(graph.getNodeAttributes(n));
      ctx.beginPath();
      ctx.arc(p.x, p.y, renderer.scaleSize(nd.size), 0, 2 * Math.PI);
      ctx.fillStyle = nd.color;
      ctx.fill();
    });
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import("./engine/types").HoverData} data   the display data plus the node key, as the renderer hands it over
   * @param {RendererSettings & { labelSize: number, labelWeight: string, labelFont: string }} settings
   */
  function drawHover(ctx, data, settings) {
    drawFocusWeb(ctx, data);
    if (typeof data.label !== "string" || !data.label) return;
    var n = settings.labelSize;
    ctx.font = settings.labelWeight + " " + n + "px " + settings.labelFont;
    var w = ctx.measureText(data.label).width;
    var x0 = data.x + data.size, x1 = x0 + w + 9;
    var h = n + 9, y0 = data.y - h / 2, y1 = data.y + h / 2, r = 5;

    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x1 - r, y0); ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
    ctx.lineTo(x1, y1 - r); ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
    ctx.lineTo(x0 + r, y1); ctx.quadraticCurveTo(x0, y1, x0, y1 - r);
    ctx.lineTo(x0, y0 + r); ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
    ctx.closePath();
    ctx.fillStyle = THEME.hoverBg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = THEME.hoverBorder;
    ctx.stroke();

    ctx.fillStyle = THEME.text;
    ctx.fillText(data.label, data.x + data.size + 5, data.y + n / 3);
  }

  /** @param {string} id @param {NodeAttrs} a @returns {NodeDisplayData & { haloColor?: string }} */
  function nodeStyle(id, a) {
        var r = /** @type {NodeDisplayData & { haloColor?: string }} */ (Object.assign({}, a));
        r.color = nodeColor(id);
        var hv = hl[id] || 0;
        if (state.markDay && graph.getNodeAttribute(id, "created") === state.markDay) {
          r.color = mixHex(r.color, THEME.today, hv);
          r.zIndex = 3;
        }
        if (hv > 0.004) {
          r.type = "halo";
          r.haloColor = mixHex(nodeColor(id), THEME.today, hv);
          r.size = (r.size || a.size) * (1 + (0.3 + HL_GROW) * hv);
          r.zIndex = 4;
        }

        if (state.query) {
          if (a.label.toLowerCase().indexOf(state.query) < 0) {
            r.color = THEME.dim; r.label = ""; r.zIndex = 0; return r;
          }
          r.zIndex = 2; r.highlighted = true; r.forceLabel = true; return r;
        }

        var focusNode = state.hovered || state.selected;
        var focus = focusSet();
        var ht = hoverAmount();
        if (focus && !focus[id]) {
          r.color = mixHex(r.color || nodeColor(id), THEME.dim, ht);
          r.label = ""; r.zIndex = 0; return r;
        }
        if (focus) r.zIndex = 2;

        if (id === focusNode) {
          r.size = (r.size || a.size) * (1 + HOVER_GROW * ht);
          if (ht > 0.5) { r.highlighted = true; r.forceLabel = true; }
          return r;
        }
        r.label = "";
        return r;
  }

  /* ------------------------------------------------------------------ logo */

  var LOGO_OF_HOLE = 0.5;
  var LOGO_PX = 128;

  var RING_BUCKETS = 144;
  var LOGO_BLEND_BUCKETS = 5;
  var CORE_SOLID = 9, CORE_FADE = 34;
  var lastGradient = "", lastGradientInner = "";
  var logoMaskReady = false;
  /** @type {HTMLImageElement | null} */
  var logoMaskImg = null;
  var LOGO_INNER_FADE = "16%, 40%";

  /** @returns {string[]} one colour per ring bucket */
  function ringColors() {
    var o = bandColors(false), i = bandColors(true);
    if (!o) return i || /** @type {string[]} */ (new Array(RING_BUCKETS));
    if (!i) return o;
    var t = outerPresence();
    if (t >= 0.999) return o;
    if (t <= 0.001) return i;
    return mixColorArrays(i, o, t);
  }

  var BAND_HANDOVER = 0.5;
  function outerPresence() {
    var s = 0, n = 0;
    graph.forEachNode(function (id) {
      if (bandLock && bandLock[groupOf(id)]) return;
      n++; s += alpha[id] || 0;
    });
    if (!n) return 0;
    var t = Math.max(0, Math.min(1, (s / n) / BAND_HANDOVER));
    return t * t * (3 - 2 * t);
  }

  /** @param {string[]} a @param {string[]} b @param {number} t */
  function mixColorArrays(a, b, t) {
    /** @type {string[]} */
    var out = new Array(RING_BUCKETS);
    for (var i = 0; i < RING_BUCKETS; i++) {
      var x = toRgb(a[i] || "#888"), y = toRgb(b[i] || "#888");
      out[i] = "rgb(" + Math.round(x[0] + (y[0] - x[0]) * t) + "," +
                        Math.round(x[1] + (y[1] - x[1]) * t) + "," +
                        Math.round(x[2] + (y[2] - x[2]) * t) + ")";
    }
    return out;
  }

  /** @param {boolean} [wantInner] @returns {string[] | null} one colour per ring bucket, null when the band is empty */
  function bandColors(wantInner) {
    /** @type {string[]} */
    var col = new Array(RING_BUCKETS);
    /** @type {number[]} */
    var rad = new Array(RING_BUCKETS);
    var any = false;
    graph.forEachNode(function (id, a) {
      if (!present(id)) return;
      if ((bandLock ? !!bandLock[groupOf(id)] : false) !== wantInner) return;
      if (isPinned(id)) return;
      var r = Math.hypot(a.x, a.y);
      if (!(r > 1e-6)) return;
      var k = Math.floor(angleSweep(Math.atan2(a.y, a.x)) / (2 * Math.PI) * RING_BUCKETS);
      k = ((k % RING_BUCKETS) + RING_BUCKETS) % RING_BUCKETS;
      if (rad[k] === undefined || r > rad[k]) { rad[k] = r; col[k] = nodeColor(id); any = true; }
    });
    if (!any) return null;

    var first = -1;
    for (var i = 0; i < RING_BUCKETS; i++) if (col[i]) { first = i; break; }
    var carry = col[first];
    for (var n = 0; n < RING_BUCKETS; n++) {
      var j = (first + n) % RING_BUCKETS;
      if (col[j]) carry = col[j]; else col[j] = carry;
    }
    return col;
  }

  /** @param {string[]} [src] @returns {string[]} */
  function ringColorsSmooth(src) {
    var col = src || ringColors();
    if (!col || !col[0]) return col || /** @type {string[]} */ (new Array(RING_BUCKETS));
    var n = RING_BUCKETS, w = LOGO_BLEND_BUCKETS;
    /** @type {string[]} */
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var r = 0, g = 0, b = 0, k = 0;
      for (var d = -w; d <= w; d++) {
        var c = toRgb(col[((i + d) % n + n) % n]);
        r += c[0]; g += c[1]; b += c[2]; k++;
      }
      out[i] = "rgb(" + Math.round(r / k) + "," + Math.round(g / k) + "," + Math.round(b / k) + ")";
    }
    return out;
  }

  /** @param {string[]} [src] */
  function ringGradient(src) {
    var col = ringColorsSmooth(src);
    if (!col || !col[0]) return "";

    var step = 360 / RING_BUCKETS, stops = [];
    for (var i = 0; i < RING_BUCKETS; i++) {
      var prev = col[(i - 1 + RING_BUCKETS) % RING_BUCKETS];
      var next = col[(i + 1) % RING_BUCKETS];
      if (col[i] === prev && col[i] === next) continue;
      stops.push(col[i] + " " + ((i + 0.5) * step).toFixed(2) + "deg");
    }
    var seam = (function () {
      var a = toRgb(col[RING_BUCKETS - 1]), b = toRgb(col[0]);
      return "rgb(" + Math.round((a[0] + b[0]) / 2) + "," + Math.round((a[1] + b[1]) / 2) +
             "," + Math.round((a[2] + b[2]) / 2) + ")";
    })();
    stops.unshift(seam + " 0deg");
    stops.push(seam + " 360deg");
    var conic = "conic-gradient(from 0deg at 50% 50%, " + stops.join(", ") + ")";

    var m = [0, 0, 0], k = 0;
    for (var q = 0; q < RING_BUCKETS; q++) {
      var c = toRgb(col[q]); m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; k++;
    }
    k = Math.max(1, k);
    var mean = "rgba(" + Math.round(m[0] / k) + "," + Math.round(m[1] / k) + "," +
               Math.round(m[2] / k) + ",";
    var core = "radial-gradient(circle at 50% 50%, " +
      mean + "1) 0%, " + mean + "0.92) " + CORE_SOLID + "%, " +
      mean + "0) " + CORE_FADE + "%)";
    return core + ", " + conic;
  }

  function placeLogo() {
    var el = $("logo");
    if (!el || !logoMaskReady || !renderer || !geomLock) return;
    var yielded = pinnedIds().length > 0;
    el.style.opacity = yielded ? "0" : "";
    var two = state.logoTwoRing;
    var g = ringGradient();
    var inner = two ? bandColors(true) : null;
    var gi = (two && inner) ? ringGradient(inner) : "";
    if (g && g !== lastGradient) { lastGradient = g; el.style.background = g; }
    var eli = $("logoInner");
    if (eli) {
      if (gi) {
        if (gi !== lastGradientInner) { lastGradientInner = gi; eli.style.background = gi; }
      } else if (lastGradientInner) { lastGradientInner = ""; }
      eli.hidden = !gi;
      eli.style.opacity = yielded ? "0" : "";
    }
    var c = renderer.graphToViewport({ x: 0, y: 0 });
    var edge = renderer.graphToViewport({ x: geomLock.r0 * INNER_SCALE * UNIT, y: 0 });
    var holePx = Math.hypot(edge.x - c.x, edge.y - c.y);
    var size = Math.max(24, Math.min(LOGO_PX, holePx * 2 * LOGO_OF_HOLE));
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.left = c.x + "px";
    el.style.top = c.y + "px";
    el.hidden = false;
    if (eli && gi) {
      eli.style.width = size + "px";
      eli.style.height = size + "px";
      eli.style.left = c.x + "px";
      eli.style.top = c.y + "px";
    }
  }

  /* ------------------------------------------------------------ node sizes */

  // github#13
  var DOT_OF_PITCH = 11 / 28;
  var DOT_MIN_PX = 1.5;
  var DOT_MAX_SPREAD = DENSITY_MAX;
  var DOT_ROOM_MAX = DENSITY_MAX;
  var sizeScale = 1;

  function measureSizeScale() {
    if (!renderer) return sizeScale;
    var a = renderer.graphToViewport({ x: 0, y: 0 });
    var b = renderer.graphToViewport({ x: UNIT * (bandOf("o").sp || 1), y: 0 });
    var pitch = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(pitch > 0)) return sizeScale;
    var cam = renderer.getCamera().getState().ratio || 1;
    pitch *= cam;
    /** @param {number} units */
    var rampFor = function (units) {
      var bb = renderer.graphToViewport({ x: units, y: 0 });
      var pit = Math.hypot(bb.x - a.x, bb.y - a.y) * cam;
      var hi = DOT_OF_PITCH * pit;
      var hiCap = DOT_OF_PITCH * UNIT * DOT_MAX_SPREAD * cam;
      if (hi > hiCap) hi = hiCap;
      var lo = Math.min(hi, DOT_MIN_PX * cam);
      return { m: (hi - lo) / Math.max(1e-6, NODE_MAX - NODE_MIN),
               b: lo - (hi - lo) / Math.max(1e-6, NODE_MAX - NODE_MIN) * NODE_MIN,
               lo: lo, hi: hi };
    };
    var ro = rampFor(UNIT * (bandOf("o").sp || 1) * bandScale("o"));
    var ri = rampFor(UNIT * (bandOf("i").sp || 1) * bandScale("i"));
    bandOf("o").ramp = ro; bandOf("i").ramp = ri;
    return ro.hi / NODE_MAX;
  }

  /** @param {number} size @param {string} [id] */
  function dotPx(size, id) {
    var isIn = id !== undefined && bandLock && !!bandLock[groupOf(id)];
    var rp = bandOf(isIn ? "i" : "o").ramp;
    var v = rp.m * (size || 4) + rp.b;
    var scale = 1;
    if (id !== undefined) {
      var room = bandOf(isIn ? "i" : "o").room;
      var mine = cellRoom[id];
      if (colWalk) {
        var cwd = colWalk[groupOf(id)];
        if (cwd !== undefined) mine = (mine === undefined ? room : mine) * cwd.f;
      }
      if (mine !== undefined && mine > 1 && (!(room > 1) || mine < room)) room = mine;
      if (room !== undefined) room *= 0.92;
      var pit = pitchUnits(isIn ? "i" : "o");
      if (room !== undefined && pit > 1e-9) {
        var f = room / pit;
        if (f > DOT_ROOM_MAX) f = DOT_ROOM_MAX;
        v *= f;
        scale = f;
      }
    }
    var lo = (rp.lo || DOT_MIN_PX) * scale;
    if (v < lo) v = lo;
    var capU = edgeCap[id];
    if (capU !== undefined && capU > 0) {
      var pitU = pitchUnits(isIn ? "i" : "o");
      var hiU = DOT_OF_PITCH * pitU;
      if (hiU > 1e-6) {
        var capV = rp.m * NODE_MAX + rp.b;
        var vMax = capV * (capU / hiU);
        if (v > vMax) v = vMax;
      }
    }
    // github#35
    if (isIn && geomLock && hubRow0[id]) {
      var hubU = HUB_ROW0_FRAC * geomLock.r0 * INNER_SCALE * UNIT;
      var pitH = pitchUnits("i");
      var hiH = DOT_OF_PITCH * pitH;
      if (hiH > 1e-6) {
        var hubCapV = rp.m * NODE_MAX + rp.b;
        var hubVMax = hubCapV * (hubU / hiH);
        if (v > hubVMax) v = hubVMax;
      }
    }
    // github#66
    if (id !== undefined && cascadeRun && cascadeRun.sizeCap) {
      var scap = cascadeRun.sizeCap[id];
      if (scap !== undefined && v > scap) v = scap;
    }
    return v;
  }

  function syncSizeScale() {
    var next = measureSizeScale();
    if (Math.abs(next - sizeScale) < 0.01) return false;
    sizeScale = next;
    return true;
  }

  function refreshSizeScale() {
    if (syncSizeScale() && renderer) renderer.refresh();
  }

  /* ------------------------------------------------------------ edge width */

  // github#43
  // github#39
  // github#43
  // github#39
  var EDGE_MAX_PX = 4;
  var edgeMult = 1;

  function measureEdgeMult() {
    if (!renderer) return 1;
    var ratio = renderer.getCamera().getState().ratio || 1;
    var k = EDGE_MAX_PX * ratio / EDGE_SIZE_MAX;
    return k < 1 ? k : 1;
  }

  function syncEdgeMult() {
    var next = measureEdgeMult();
    if (Math.abs(next - edgeMult) < 0.002) return false;
    edgeMult = next;
    return true;
  }

  /** @param {EdgeAttrs & Partial<EdgeDisplayData>} r @param {EdgeAttrs} a */
  function capEdge(r, a) {
    if (edgeMult < 1) r.size = (r.size === undefined ? (a.size || 1) : r.size) * edgeMult;
    return r;
  }

  /** @param {number} size */
  function edgePx(size) {
    if (!renderer) return 0;
    return Math.max(renderer.getSetting("minEdgeThickness"), renderer.scaleSize(size || 1));
  }

  /* -------------------------------------------------------- edge curvature */

  var CURVE_MIN = 0.05, CURVE_MAX = 0.55;

  function discR() {
    return geomLock && geomLock.maxR ? geomLock.maxR * UNIT : 1;
  }

  /** @param {Point} s @param {Point} t */
  function curvatureFor(s, t) {
    var dx = t.x - s.x, dy = t.y - s.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (!len) return CURVE_MIN;
    var h = Math.abs(s.x * t.y - s.y * t.x) / len;
    var near = 1 - Math.min(1, h / (discR() * 0.5));
    var mag = CURVE_MIN + (CURVE_MAX - CURVE_MIN) * near * near;
    var out = (-dy / len) * (s.x + t.x) / 2 + (dx / len) * (s.y + t.y) / 2;
    return out >= 0 ? mag : -mag;
  }

  function makeRenderer() {
    renderer = new RendererCls(graph, $("graph"), {
      win: WIN,
      labelFont: 'ui-sans-serif, "Segoe UI", system-ui, sans-serif',
      labelSize: 11,
      labelWeight: "500",
      labelColor: THEME.text,
      drawHover: drawHover,
      // github#58
      minCameraRatio: 0.02,
      maxCameraRatio: 12,
      enableCameraPanning: panEnabled,
      zoomingRatio: 1.2,
      zoomDuration: 120,
      // github#42, github#39
      // github#43
      minEdgeThickness: 1.0,
      /** @param {string} id @param {NodeAttrs} a */
      nodeReducer: function (id, a) {
        var al = alpha[id] || 0;
        if (al <= 0.004) {
          var h = /** @type {NodeDisplayData} */ (Object.assign({}, a));
          h.hidden = true;
          return h;
        }
        var r = nodeStyle(id, a);
        if (al < 0.999) {
          r.color = withAlpha(r.color, al);
          r.size = (r.size || a.size) * (0.45 + 0.55 * al);
          if (al < 0.62) { r.label = ""; r.forceLabel = false; r.highlighted = false; }
        }
        if (colWalk) {
          var cwr = colWalk[groupOf(id)];
          if (cwr !== undefined) {
            r.size = Math.max(0.05, (r.size === undefined ? base : r.size) * cwr.f);
          }
        }
        var base = a.size || 4;
        r.size = dotPx(base, id) * ((r.size === undefined ? base : r.size) / base);
        if (isPinned(id)) {
          r.size = (r.size || a.size) * hubSizeMult();
          r.zIndex = 3;
        }
        return r;
      },
      /** @param {string} id @param {EdgeAttrs & Partial<EdgeDisplayData>} a */
      edgeReducer: function (id, a) {
        var r = /** @type {EdgeAttrs & Partial<EdgeDisplayData>} */ (Object.assign({}, a));
        var x = graph.extremities(id);
        var al = Math.min(alpha[x[0]] || 0, alpha[x[1]] || 0);
        if (al <= 0.004) { r.hidden = true; return r; }
        if (state.curveEdges) {
          r.type = "curve";
          r.curvature = curvatureFor(graph.getNodeAttributes(x[0]),
                                     graph.getNodeAttributes(x[1]));
        }
        r.color = THEME.edge;
        var focus = focusSet();
        if (state.query) { r.color = THEME.dim; return capEdge(r, a); }
        if (focus) {
          // github#43
          var ht = hoverAmount(), base = a.size || 1;
          if (focus[x[0]] && focus[x[1]]) {
            r.color = mixHex(THEME.edge, THEME.edgeHi, ht);
            r.size = base + (EDGE_SIZE_LIT - base) * ht;
            r.zIndex = 2;
          } else {
            r.color = mixHex(THEME.edge, THEME.dim, ht);
            r.zIndex = 0;
          }
        }
        if (al < 0.999) r.color = withAlpha(r.color, al * al);
        return capEdge(r, a);
      }
    });

    (function () {
      var cam = renderer.getCamera();
      var edgeRaf = 0;
      if (syncEdgeMult()) renderer.refresh({ skipIndexation: true });
      cam.on("updated", function () {
        // github#14
        if (!fitting) camAtRest = false;
        placeLogo(); refreshSizeScale();
        if (edgeRaf) return;
        edgeRaf = WIN.requestAnimationFrame(function () {
          edgeRaf = 0;
          if (syncEdgeMult() && renderer) renderer.refresh({ skipIndexation: true });
        });
      });
    })();

    /** @type {number | null} */
    var rzTimer = null;
    var onResize = function () {
      if (dead) return;
      if (rzTimer) WIN.clearTimeout(rzTimer);
      rzTimer = WIN.setTimeout(function () { rzTimer = null; refreshSizeScale(); placeLogo(); }, 120);
    };
    if (window.ResizeObserver) {
      var rootRO = new ResizeObserver(onResize);
      rootRO.observe(root);
      onDestroy.push(function () { rootRO.disconnect(); });
    } else {
      window.addEventListener("resize", onResize);
      onDestroy.push(function () { window.removeEventListener("resize", onResize); });
    }
    onDestroy.push(function () { if (rzTimer) { WIN.clearTimeout(rzTimer); rzTimer = null; } });

    renderer.on("afterRender", function () {
      if (DBG.on) drawWedgeDebug();
      placeLogo(); refreshSizeScale(); heatDraw(); hlSync();
      placeHubDrop();
    });

    renderer.on("enterNode", function (e) {
      state.hovered = e.node;
      syncLazyEdges();
      showTip(e.node); hoverTo(1);
    });
    renderer.on("leaveNode", function () { hideTip(); hoverTo(0); });
    renderer.on("clickNode", function (e) {
      if (dragJustMoved === e.node) { dragJustMoved = null; return; }
      select(e.node);
    });
    renderer.on("clickStage", function () { select(null); });
    renderer.on("rightClickNode", function (e) {
      if (e.event && e.event.original) e.event.original.preventDefault();
      togglePin(e.node);
    });
    bindNodeDrag();

    // github#58
    /** @param {RendererEvent} e */
    var onDoubleClick = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      fit();
    };
    renderer.on("doubleClickStage", onDoubleClick);
    renderer.on("doubleClickNode", onDoubleClick);
    if (wantWedgeDebug()) wedgeDebug(true);
  }

  /* ------------------------------------------------------- group labels */

  /* ------------------------------------------------------------ tooltip */

  /** @param {string} id */
  function showTip(id) {
    var a = graph.getNodeAttributes(id), t = $("tip");
    var p = renderer.graphToViewport({ x: a.x, y: a.y });
    setHTML(t, '<div class="t">' + esc(a.label) + '</div>' +
      '<div class="m">' + esc(groupOf(id)) + ' &middot; ' + a.deg + ' link' + (a.deg === 1 ? "" : "s") +
      '<br>' + esc(a.ntype) + ' &middot; ' + esc(a.folder) +
      (a.sub ? ' / ' + esc(a.sub) : '') +
      '</div>');
    t.hidden = false;
    var box = t.getBoundingClientRect(), st = $("canvas").getBoundingClientRect();
    var x = Math.min(p.x + 14, st.width - box.width - 8);
    var y = Math.min(Math.max(p.y - box.height - 10, 8), st.height - box.height - 8);
    t.style.left = x + "px"; t.style.top = y + "px";
  }
  function hideTip() { $("tip").hidden = true; }

  /* ------------------------------------------------------- detail panel */

  /** @param {string | null} id */
  function select(id) {
    state.selected = id;
    syncLazyEdges();
    var d = $("detail");
    if (!id) { d.hidden = true; renderer.refresh(); return; }

    var a = graph.getNodeAttributes(id);
    var nb = neighboursOf(id).slice().sort(function (p, q) {
      return graph.getNodeAttribute(q, "deg") - graph.getNodeAttribute(p, "deg");
    });
    var vault = encodeURIComponent(DATA.vault);
    var file = encodeURIComponent(a.path.replace(/\.md$/, ""));

    var h = '<button class="x" title="Close">&times;</button>' +
      '<h2>' + esc(a.label) + '</h2>' +
      '<div class="meta">' +
        '<span><b style="color:' + colorOf(groupOf(id)) + '">&#9632;</b> ' + esc(groupOf(id)) + '</span>' +
        '<span>' + a.deg + ' link' + (a.deg === 1 ? "" : "s") + '</span>' +
        (a.words ? '<span>' + a.words + ' words</span>' : "") +
        (a.created ? '<span>' + esc(a.created) + '</span>' : "") +
      '</div>' +
      '<div>' + (a.tags || []).slice(0, 8).map(function (t) {
        return '<span class="chip">#' + esc(t) + '</span>';
      }).join("") + '</div>' +
      '<div class="chip" style="border-style:dashed">' + esc(a.folder) +
        (a.sub ? ' / ' + esc(a.sub) : '') + ' / ' + esc(a.ntype) + '</div>' +
      '<div class="actions">' +
        (a.ghost ? "" : '<a class="open" href="obsidian://open?vault=' + vault + '&file=' + file + '">Open in Obsidian</a>') +
        '<button class="btn pin" data-pin="' + id + '" aria-pressed="' + isPinned(id) + '" title="' +
          (isPinned(id) ? "Unpin from hub" : "Pin to hub") + '">' + pinSvg(isPinned(id)) +
          ' Pin to hub</button>' +
      '</div>';

    if (nb.length) {
      h += '<div class="nb">Linked notes (' + nb.length + ')</div><ul>' +
        nb.slice(0, 40).map(function (n) {
          return '<li><button data-go="' + n + '">' +
                 esc(graph.getNodeAttribute(n, "label")) +
                 ' <span style="color:var(--text-3)">' + graph.getNodeAttribute(n, "deg") + '</span></button></li>';
        }).join("") + '</ul>';
    } else {
      h += '<div class="nb">No links</div>';
    }

    setHTML(d, h);
    d.hidden = false;
    d.querySelector(".x").onclick = function () { select(null); };
    d.querySelector(".pin").onclick = function () { togglePin(id); select(id); };
    Array.prototype.forEach.call(d.querySelectorAll("[data-go]"), /** @param {HTMLElement} b */ function (b) {
      b.onclick = function () { select(b.getAttribute("data-go")); centerOn(b.getAttribute("data-go")); };
    });
    renderer.refresh();
  }

  /** @param {string} id */
  function centerOn(id) {
    var d = renderer.getNodeDisplayData(id);
    if (!d) return;
    renderer.getCamera().animate({ x: d.x, y: d.y, ratio: 0.22 }, { duration: 420 });
  }

  /* ---------------------------------------------------------------- UI */

  /** @type {(() => void) | null} */
  var refreshSettingsPanel = null;

  /** @param {string} g */
  function swatchFill(g) {
    if (g === UNLINKED && unlinkedTintByFolder && unlinkedTintColors.length > 1) {
      var n = unlinkedTintColors.length, step = 360 / n;
      return "conic-gradient(" + unlinkedTintColors.map(function (c, i) {
        return c + " " + Math.round(i * step) + "deg " + Math.round((i + 1) * step) + "deg";
      }).join(", ") + ")";
    }
    return colorOf(g);
  }

  /** @param {string} g @param {Record<string, boolean> | null} bandLock */
  function swatchTitle(g, bandLock) {
    if (g === UNLINKED && unlinkedTintByFolder && unlinkedTintColors.length > 1) {
      return "Mixed — coloured by folder";
    }
    // github#3, github#50
    if (!counts[g]) return "No notes on the disc";
    return bandLock && bandLock[g] ? "Inner ring" : "Outer ring";
  }

  // github#50
  /** @param {string} g */
  function countText(g) {
    if (g === UNLINKED && !unlinkedByFolder) return "(" + counts[g] + ")";
    var held = folderCount[g] || 0;
    return !counts[g] && held ? "(" + held + ")" : String(counts[g]);
  }

  // github#46
  /** @type {Point | null} */
  var ptr = null;

  function buildLegend() {
    hoverHighlight(null, null);

    var names = order[state.dim] || [];
    $("gcount").textContent = "(" + names.length + ")";

    /** @type {Record<string, Record<string, number>>} */
    var kids = dict();
    if (state.dim === "folder") {
      graph.forEachNode(function (_id, a) {
        var d = a.dirs || [];
        for (var i = 0; i < d.length; i++) {
          var pk = a.folder + "/" + d.slice(0, i).join("/");
          if (!kids[pk]) kids[pk] = dict();
          kids[pk][d[i]] = (kids[pk][d[i]] || 0) + 1;
        }
      });
    }

    /** @param {string} attrs @param {boolean} on @param {string} what */
    var eyeBtn = function (attrs, on, what) {
      return '<button class="eye" ' + attrs + ' aria-pressed="' + on + '" title="' +
             (on ? "Hide " : "Show ") + esc(what) + '">' + eyeSvg(on) + '</button>';
    };

    /** @param {string} prefix @param {number} depth @param {string} col */
    var subtree = function (prefix, depth, col) {
      var m = kids[prefix];
      if (!m || !state.pathOpen[prefix]) return "";
      return Object.keys(m).sort(function (a, b) {
        return m[b] - m[a] || a.localeCompare(b);
      }).map(function (nm) {
        var pk = prefix + "/" + nm;
        var on = !state.hiddenSub[pk];
        var hlk = !!state.highlightSub[pk];
        return '<div class="lgr sub' + Math.min(depth, 4) + '">' +
          twBtn(kids[pk] ? 'data-twp="' + esc(pk) + '"' : null, !!state.pathOpen[pk]) +
          eyeBtn('data-epath="' + esc(pk) + '"', on, nm) +
          '<button class="lgs" data-hpath="' + esc(pk) + '" data-hl="' +
            (hlk ? "on" : "off") + '" aria-pressed="' + on +
            '" title="Highlight ' + esc(nm) + '">' +
          '<span class="sw" style="background:' + col + ';border-radius:50%"></span>' +
          '<span class="nm">' + esc(nm) + '</span>' +
          '<span class="only" data-only="1" title="Show only ' + esc(nm) + '">only</span>' +
          '<span class="ct">' + m[nm] + '</span></button>' +
          '</div>' + subtree(pk, depth + 1, col);
      }).join("");
    };

    setHTML($("legend"), names.map(function (g) {
      var vis = !isHidden(g);
      var hasSubs = state.dim === "folder" &&
                    (groupHasPinnedSub(g) ||
                     ((subOrder[g] || []).length > 1 && (counts[g] || 0) >= NEST_MIN));
      var open = hasSubs && !state.collapsed[g];
      var hl = !!state.highlight[g];

      // github#50
      var live = !!counts[g];
      var lgrClass = "lgr" + (live ? "" : " lgr-empty");
      var row = '<div class="' + lgrClass + '">' +
        twBtn(hasSubs ? 'data-tw="' + esc(g) + '"' : null, open) +
        (live ? eyeBtn('data-eye="' + esc(g) + '"', vis, g)
              : '<button class="eye none" disabled aria-hidden="true"></button>') +
        '<button class="lg" data-g="' + esc(g) + '" data-hl="' + (hl ? "on" : "off") +
          '" aria-pressed="' + vis + '" title="Highlight ' + esc(g) + '">' +
        '<span class="sw' + (bandLock && bandLock[g] ? ' sw-in' : '') +
          '" title="' + swatchTitle(g, bandLock) +
          '" style="background:' + swatchFill(g) + '"></span>' +
        '<span class="nm" title="' + esc(g) + '">' + esc(g) + '</span>' +
        (live ? '<span class="only" data-only="1" title="Show only ' + esc(g) + '">only</span>'
              : '<span class="only none" aria-hidden="true"></span>') +
        // github#50
        '<span class="ct">' + countText(g) + '</span></button>' +
        '</div>';

      if (open && vis) {
        var subs = subOrder[g];
        /**
         * @param {string} col @param {string} nm @param {number} ct
         * @param {string[]} idx  subfolder indexes this row stands for
         * @param {number} depth @param {string | null} twAttrs @param {boolean} twOpen
         */
        var srow = function (col, nm, ct, idx, depth, twAttrs, twOpen) {
          var on = !state.hiddenSub[g + "/" + subs[idx[0]]];
          var hlSub = idx.every(function (i) {
            return !!state.highlightSub[g + "/" + subs[+i]];
          });
          return '<div class="lgr ' + (depth === 2 ? "sub2" : "sub") + '">' +
            twBtn(twAttrs || null, !!twOpen) +
            eyeBtn('data-esub="' + esc(g) + '" data-idx="' + idx.join(",") + '"', on, nm) +
            '<button class="lgs" data-hsub="' + esc(g) + '" data-idx="' + idx.join(",") +
              '" data-hl="' + (hlSub ? "on" : "off") + '" aria-pressed="' + on +
              '" title="Highlight ' + esc(nm) + '">' +
            '<span class="sw" style="background:' + col + ';border-radius:50%"></span>' +
            '<span class="nm">' + esc(nm) + '</span>' +
            '<span class="only" data-only="1" title="Show only ' + esc(nm) + '">only</span>' +
            '<span class="ct">' + ct + '</span></button>' +
            '</div>';
        };
        subs.slice(0, SUB_NAMED).forEach(function (sb, k) {
          var pk = g + "/" + sb, tint = subShade[pk] || colorOf(g);
          row += srow(tint, sb || "(directly in folder)", subCount[pk] || 0, [k], 1,
                      (sb && kids[pk]) ? 'data-twp="' + esc(pk) + '"' : null,
                      !!state.pathOpen[pk]);
          if (sb) row += subtree(pk, 2, tint);
        });
        var tail = subs.slice(SUB_NAMED);
        if (tail.length) {
          var n = 0;
          tail.forEach(function (sb) { n += subCount[g + "/" + sb] || 0; });
          var tOpen = !!state.tailOpen[g];
          row += srow(subShade[g + "/" + tail[0]] || colorOf(g),
                      tail.length + " smaller subfolders", n,
                      tail.map(function (_, j) { return SUB_NAMED + j; }), 1,
                      'data-twtail="' + esc(g) + '"', tOpen);
          if (tOpen) {
            tail.forEach(function (sb, j) {
              var pk = g + "/" + sb, tint = subShade[pk] || colorOf(g);
              row += srow(tint, sb || "(directly in folder)", subCount[pk] || 0,
                          [SUB_NAMED + j], 2,
                          (sb && kids[pk]) ? 'data-twp="' + esc(pk) + '"' : null,
                          !!state.pathOpen[pk]);
              if (sb) row += subtree(pk, 3, tint);
            });
          }
        }
      }
      return row;
    }).join(""));

    /**
     * Every legend element matching a selector. The callback takes an HTMLElement: these are
     * the legend's own buttons and rows, and every caller reads `data-*` off them or wires a
     * handler onto them.
     * @param {string} sel
     * @param {(el: HTMLElement) => void} fn
     */
    var each = function (sel, fn) {
      Array.prototype.forEach.call($("legend").querySelectorAll(sel), fn);
    };

    /** @param {string} g @param {string[]} keep */
    var onlySubs = function (g, keep) {
      var h = state.hidden[state.dim] || (state.hidden[state.dim] = dict());
      (order[state.dim] || []).forEach(function (n) { h[n] = (n !== g); });
      state.hiddenSub = dict();
      (subOrder[g] || []).forEach(function (sb) {
        if (keep.indexOf(sb) < 0) state.hiddenSub[g + "/" + sb] = true;
      });
    };

    /** @param {string} g @param {string} path */
    var onlyUnder = function (g, path) {
      var h = state.hidden[state.dim] || (state.hidden[state.dim] = dict());
      (order[state.dim] || []).forEach(function (n) { h[n] = (n !== g); });
      state.hiddenSub = dict();
      var rest = path.slice(g.length + 1);
      var want = rest ? rest.split("/") : [];
      graph.forEachNode(function (_id, a) {
        if (a.folder !== g) return;
        var d = a.dirs || [], i = 0;
        while (i < want.length && i < d.length && d[i] === want[i]) i++;
        if (i === want.length) return;
        state.hiddenSub[g + "/" + d.slice(0, i + 1).join("/")] = true;
      });
    };

    each("[data-tw]", function (b) {
      var g = b.getAttribute("data-tw");
      b.onmouseenter = function () { hoverHighlight(g, null); };
      b.onmouseleave = function () { hoverHighlight(null, null); };
      b.onclick = function () {
        if (state.collapsed[g]) delete state.collapsed[g]; else state.collapsed[g] = true;
        buildLegend();
        if (refreshSettingsPanel) refreshSettingsPanel();
      };
    });
    each("[data-twp]", function (b) {
      b.onclick = function () {
        var p = b.getAttribute("data-twp");
        if (state.pathOpen[p]) delete state.pathOpen[p]; else state.pathOpen[p] = true;
        buildLegend();
      };
    });
    each("[data-epath]", function (b) {
      b.onclick = function () {
        var p = b.getAttribute("data-epath");
        if (state.hiddenSub[p]) delete state.hiddenSub[p]; else state.hiddenSub[p] = true;
        buildLegend();
        cascade(null, { colToggle: true });
      };
    });
    each("[data-hpath]", function (b) {
      var hp = b.getAttribute("data-hpath");
      b.onmouseenter = function () { hoverHighlight(null, [hp]); };
      b.onmouseleave = function () { hoverHighlight(null, null); };
      b.onclick = function (ev) {
        var p = b.getAttribute("data-hpath");
        if (ev && ev.target && /** @type {Element} */ (ev.target).getAttribute("data-only")) {
          onlyUnder(p.slice(0, p.indexOf("/")), p);
          buildLegend();
          cascade(null, { colToggle: true });
          return;
        }
        if (state.highlightSub[p]) delete state.highlightSub[p];
        else state.highlightSub[p] = true;
        buildLegend();
        applyLayout(true);
        renderer.refresh();
      };
    });

    each("[data-twtail]", function (b) {
      b.onclick = function () {
        var g = b.getAttribute("data-twtail");
        if (state.tailOpen[g]) delete state.tailOpen[g]; else state.tailOpen[g] = true;
        buildLegend();
      };
    });

    each("[data-eye]", function (b) {
      var g = b.getAttribute("data-eye");
      b.onclick = function () {
        var h = state.hidden[state.dim] || (state.hidden[state.dim] = dict());
        h[g] = !h[g];
        buildLegend();
        cascade(null, { colToggle: true });
      };
    });
    each("[data-esub]", function (b) {
      b.onclick = function () {
        var f = b.getAttribute("data-esub");
        var subs = subOrder[f] || [];
        var off = b.getAttribute("aria-pressed") === "true";
        b.getAttribute("data-idx").split(",").forEach(function (i) {
          var key = f + "/" + subs[+i];
          if (off) state.hiddenSub[key] = true; else delete state.hiddenSub[key];
        });
        buildLegend();
        cascade(null, { colToggle: true });
      };
    });

    each("[data-hsub]", function (b) {
      var hoverKeys = function () {
        var f = b.getAttribute("data-hsub");
        var subs = subOrder[f] || [];
        return b.getAttribute("data-idx").split(",").map(function (i) {
          return f + "/" + subs[+i];
        });
      };
      b.onmouseenter = function () { hoverHighlight(null, hoverKeys()); };
      b.onmouseleave = function () { hoverHighlight(null, null); };
      b.onclick = function (ev) {
        var f = b.getAttribute("data-hsub");
        var subs = subOrder[f] || [];
        var idx = b.getAttribute("data-idx").split(",");
        if (ev && ev.target && /** @type {Element} */ (ev.target).getAttribute("data-only")) {
          onlySubs(f, idx.map(function (i) { return subs[+i]; }));
          buildLegend();
          cascade(null, { colToggle: true });
          return;
        }
        var allOn = idx.every(function (i) { return !!state.highlightSub[f + "/" + subs[+i]]; });
        idx.forEach(function (i) {
          var key = f + "/" + subs[+i];
          if (allOn) delete state.highlightSub[key]; else state.highlightSub[key] = true;
        });
        buildLegend();
        applyLayout(true);
        renderer.refresh();
      };
    });

    each(".lg[data-g]", function (b) {
      var g = b.getAttribute("data-g");
      b.onmouseenter = function () { hoverHighlight(g, null); };
      b.onmouseleave = function () { hoverHighlight(null, null); };
      b.onclick = function (ev) {
        if (ev.target && /** @type {Element} */ (ev.target).getAttribute("data-only")) {
          var h = state.hidden[state.dim] || (state.hidden[state.dim] = dict());
          (order[state.dim] || []).forEach(function (n) { h[n] = (n !== g); });
          state.hiddenSub = dict();
          buildLegend();
          cascade(null, { colToggle: true });
          return;
        }
        if (state.highlight[g]) delete state.highlight[g]; else state.highlight[g] = true;
        buildLegend();
        applyLayout(true);
        renderer.refresh();
      };
    });

    // github#46
    if (ptr) {
      /** @type {Element | null} */
      var hit = null;
      /** @type {Element | null} */
      var hitSub = null;
      /** @type {Element | null} */
      var hitPath = null;
      for (var up = DOC.elementFromPoint(ptr.x, ptr.y); up && up !== DOC.body; up = up.parentElement) {
        if (!up.getAttribute) continue;
        if (up.getAttribute("data-hsub")) { hitSub = up; break; }
        if (up.getAttribute("data-hpath")) { hitPath = up; break; }
        if (up.getAttribute("data-g") && up.classList && up.classList.contains("lg")) { hit = up; break; }
      }
      if (hitSub) {
        var fSub = hitSub.getAttribute("data-hsub"), subsSub = subOrder[fSub] || [];
        hoverHighlight(null, (hitSub.getAttribute("data-idx") || "").split(",").map(function (i) {
          return fSub + "/" + subsSub[+i];
        }));
      } else if (hitPath) {
        hoverHighlight(null, [hitPath.getAttribute("data-hpath")]);
      } else if (hit) {
        hoverHighlight(hit.getAttribute("data-g"), null);
      }
    }
  }

  function seedHidden() {
    var h = state.hidden[state.dim] = dict();
    (order[state.dim] || []).forEach(function (g) {
      if (hiddenByDefault(g)) h[g] = true;
    });
  }

  function collapseAll() {
    state.collapsed = dict();
    (order[state.dim] || []).forEach(function (g) { state.collapsed[g] = true; });
  }
  var collapsedInit = false;

  // github#45
  /**
   * @param {boolean} [skipLayout]
   * @param {Record<string, boolean> | null} [bandHint]   group -> inner, to seed the lock with
   * @param {boolean} [keepAlpha]
   */
  function regroup(skipLayout, bandHint, keepAlpha) {
    counts = computeOrder();
    /** @type {Record<string, string> | null} */
    var colorsBefore = null;
    Object.keys(groupColor).forEach(function (g) {
      (colorsBefore || (colorsBefore = dict()))[g] = groupColor[g];
    });
    buildColors();
    colorWalk(colorsBefore);
    if (!collapsedInit) { collapsedInit = true; collapseAll(); seedHidden(); }
    if (!bandLock) {
      var base = buildWedgePlan(false);
      if (base) {
        bandLock = dict();
        base.cells.forEach(function (c) { bandLock[c.g] = c.inner; });
        if (bandHint) Object.keys(bandHint).forEach(function (g) { bandLock[g] = bandHint[g]; });
        var bandTotal = { i: 0, o: 0 };
        base.cells.forEach(function (c) { bandTotal[c.inner ? "i" : "o"] += c.wsum; });
        var bandR = { i: 0, o: 0 }, bandRows = { i: 0, o: 0 };
        base.cells.forEach(function (c) {
          var k = c.inner ? "i" : "o";
          if (c.rows > bandRows[k]) bandRows[k] = c.rows;
          (c.slots || []).forEach(function (sl) {
            var rr = sl.r * UNIT;
            if (rr > bandR[k]) bandR[k] = rr;
          });
        });
        geomLock = { r0: base.r0, rOuter: base.rOuter, maxR: base.maxR,
                     total: base.total, bandTotal: bandTotal,
                     bandR: bandR, rows: bandRows };

        var again = buildWedgePlan(false);
        if (again) geomLock = { r0: again.r0, rOuter: again.rOuter, maxR: again.maxR,
                                total: again.total, bandTotal: bandTotal,
                                bandR: bandR, rows: bandRows };

        if (renderer) {
          var span = base.maxR * UNIT * 1.02;
          renderer.setCustomBBox({ x: [-span, span], y: [-span, span] });
        }
      }
    }
    buildLegend();
    if (!keepAlpha) syncAlpha();
    if (!skipLayout) applyLayout(false);
    if (heat) { heatSig = ""; heatDraw(); }
  }

  // github#3
  function hardRelayout(animate, deferLayout) {
    stopPlay();
    if (cascadeRun) {
      WIN.cancelAnimationFrame(cascadeRun.raf);
      WIN.clearTimeout(cascadeRun.guard);
      cascadeRun = null;
    }
    if (anim) { WIN.cancelAnimationFrame(anim); anim = null; }
    if (animGuard) { WIN.clearTimeout(animGuard); animGuard = null; }
    moveFrom = null; splitHold = null;
    pinnedPlan = null; planKeep = null;
    roomNow = null; cellNow = null; edgeNow = null; colWalk = null;
    posSrc = null;
    var prevBand = bandLock, prevGeom = geomLock;
    bandLock = null; geomLock = null;
    if (deferLayout && prevBand) {
      regroup(true, prevBand, true);
      // github#49
      if (prevGeom) geomLock = prevGeom;
      return;
    }
    // github#45
    regroup(true);
    if (!deferLayout) applyLayout(!!animate);
    if (renderer) renderer.refresh();
  }

  function buildSearch() {
    var q = /** @type {HTMLInputElement} */ ($("q"));
    q.oninput = function () {
      state.query = q.value.trim().toLowerCase();
      var hits = $("hits");
      if (!state.query) { hits.replaceChildren(); renderer.refresh(); return; }
      /** @type {string[]} */
      var found = [];
      graph.forEachNode(function (id, a) {
        if (a.label.toLowerCase().indexOf(state.query) > -1) found.push(id);
      });
      found.sort(function (p, o) { return graph.getNodeAttribute(o, "deg") - graph.getNodeAttribute(p, "deg"); });
      setHTML(hits, found.slice(0, 40).map(function (id) {
        return '<button data-hit="' + id + '">' + esc(graph.getNodeAttribute(id, "label")) +
               ' <span style="color:var(--text-3)">' + graph.getNodeAttribute(id, "deg") + '</span></button>';
      }).join("") || '<div style="color:var(--text-3);font-size:11px;padding:4px">No match</div>');
      Array.prototype.forEach.call(hits.querySelectorAll("[data-hit]"), /** @param {HTMLElement} b */ function (b) {
        b.onclick = function () {
          var id = b.getAttribute("data-hit");
          q.value = ""; state.query = ""; hits.replaceChildren();
          select(id); centerOn(id);
        };
      });
      renderer.refresh();
    };
    q.onkeydown = function (e) {
      if (e.key !== "Enter") return;
      var first = /** @type {HTMLElement | null} */ ($("hits").querySelector("[data-hit]"));
      if (first) first.click();
    };
  }

  /** @type {{ raf: number, guard: number, viaCascade: boolean } | null} */
  var play = null;
  var introOwed = false;
  if (DOC && typeof DOC.addEventListener === "function") {
    /** @param {MouseEvent} ev */
    var onDocMove = function (ev) {
      ptr = { x: ev.clientX, y: ev.clientY };
    };
    DOC.addEventListener("mousemove", onDocMove, { capture: true, passive: true });
    onDestroy.push(function () { DOC.removeEventListener("mousemove", onDocMove, true); });
    var onVisibility = function () {
      var away = typeof DOC.visibilityState === "string"
        ? DOC.visibilityState === "hidden" : !!DOC.hidden;
      if (!away) {
        if (introOwed) { introOwed = false; playTimeline(); }
        return;
      }
      if (!play && !cascadeRun && !anim) return;
      var wasPlaying = !!play;
      stopPlay();
      if (cascadeRun) {
        WIN.cancelAnimationFrame(cascadeRun.raf);
        WIN.clearTimeout(cascadeRun.guard);
        cascadeRun = null;
      }
      if (anim) { WIN.cancelAnimationFrame(anim); anim = null; }
      if (animGuard) { WIN.clearTimeout(animGuard); animGuard = null; }
      pinnedPlan = null; planKeep = null; roomNow = null; cellNow = null; edgeNow = null;
    colWalk = null;
      posSrc = null;
      state.until = null;
      timelineFrame(true);
      if (wasPlaying) introOwed = true;
    };
    DOC.addEventListener("visibilitychange", onVisibility);
    onDestroy.push(function () { DOC.removeEventListener("visibilitychange", onVisibility); });
  }

  function stopPlay() {
    if (!play) return;
    var viaCascade = play.viaCascade;
    WIN.cancelAnimationFrame(play.raf);
    if (play.guard) WIN.clearTimeout(play.guard);
    play = null;
    endSweep();
    if (!viaCascade) return;
    if (cascadeRun) {
      WIN.cancelAnimationFrame(cascadeRun.raf);
      WIN.clearTimeout(cascadeRun.guard);
      cascadeRun = null;
    }
    pinnedPlan = null; planKeep = null; roomNow = null; cellNow = null; edgeNow = null; posSrc = null;
    colWalk = null;
    state.until = null;
    timelineFrame(true);
  }

  function timelineFrame(full) {
    fullRing = true;
    syncAlpha();
    var targets = ringsLayout();
    if (targets) assignPositions(targets);
    renderer.refresh({ skipIndexation: !full });
  }

  function playTimeline() {
    stopPlay();
    if (cascadeRun) {
      WIN.cancelAnimationFrame(cascadeRun.raf);
      WIN.clearTimeout(cascadeRun.guard);
      cascadeRun = null;
    }
    if (anim) { WIN.cancelAnimationFrame(anim); anim = null; }
    if (animGuard) { WIN.clearTimeout(animGuard); animGuard = null; }
    pinnedPlan = null; planKeep = null; roomNow = null; cellNow = null; edgeNow = null;
    colWalk = null;
    posSrc = null;

    var dur = TIMELINE_MS * TIME_SCALE;
    state.until = null;
    state.from = null; state.to = null;
    rangeChrome();
    clearAlpha();

    cascade(function () {
      if (play) play = null;
      endSweep();
    }, {
      fullRing: true,
      order: function (id) { return tlRank[id] || 0; },
      totalMs: dur,
      onFrame: function (pr) { sweepTo(pr); }
    });
    play = { raf: 0, guard: 0, viaCascade: true };
  }

  /** @param {number} pr 0..1 through the timeline */
  function sweepTo(pr) {
    if (!dateSpan || !tlMax) return;
    var k = Math.max(0, Math.min(1, pr)) * tlMax;
    var i = Math.round(k) - 1;
    if (i < 0) i = 0;
    if (i > tlDateMs.length - 1) i = tlDateMs.length - 1;
    var ms = tlDateMs[i];
    if (!(ms >= dateSpan.lo)) ms = dateSpan.lo;
    if (ms > dateSpan.hi) ms = dateSpan.hi;
    brushSweep = pr >= 1 ? dateSpan.hi : ms;
    drawRibbon();
    if (pr >= 1) { hideRTip(); return; }
    showRTip(ribbonX(brushSweep, ribbonW()), isoDay(brushSweep));
  }

  function endSweep() {
    if (brushSweep === null) return;
    brushSweep = null;
    hideRTip();
    drawDateUI();
  }

  function resetView() {
    stopPlay();
    seedHidden();
    state.hiddenSub = dict();
    state.highlight = dict();
    state.highlightSub = dict();
    collapseAll();
    state.tailOpen = dict();
    state.pathOpen = dict();
    state.markDay = null;
    state.hoverDay = null;
    state.until = null;
    state.query = "";
    state.hovered = null;
    select(null);
    hideTip();
    $("q").value = "";    $("hits").replaceChildren();
    state.from = null; state.to = null; state.heatEnd = null;
    rangeChrome();
    buildLegend();
  }

  function buildTools() {
    refreshSettingsPanel = buildSettings;

    $("allon").onclick = function () {
      seedHidden();
      state.hiddenSub = dict();
      buildLegend(); cascade(null, { colToggle: true });
    };
    $("alloff").onclick = function () {
      var h = state.hidden[state.dim] = dict();
      (order[state.dim] || []).forEach(function (g) { h[g] = true; });
      buildLegend(); cascade(null, { colToggle: true });
    };
    // github#6
    var onRefresh = typeof deps.onRefresh === "function" ? deps.onRefresh : null;
    if (onRefresh) {
      $("refresh").title = "Rebuild from the vault and replay. Picks up notes written " +
                           "since the graph was drawn, and clears every filter.";
    }
    $("refresh").onclick = function () {
      if (onRefresh) { onRefresh(); return; }
      resetView();
      fit();
      playTimeline();
    };
    // github#4
    if ($("reset")) $("reset").onclick = fit;
    if ($("zin")) $("zin").onclick = function () { zoomBy(1); };
    if ($("zout")) $("zout").onclick = function () { zoomBy(-1); };
    if ($("pan")) $("pan").onclick = function () { setPan(!panEnabled, true); };
    setPan(panEnabled, false);
    // github#23
    if ($("compact")) $("compact").onclick = function () { setCompactAxis(!compactAxis, true); };
    setCompactAxis(compactAxis, false);
    $("png").onclick = savePng;
    if ($("dbg")) $("dbg").onclick = function () {
      var txt = JSON.stringify(API.debugDump(), null, 2);
      /** @param {string} how */
      var done = function (how) {
        var b = $("dbg");
        b.textContent = how;
        WIN.setTimeout(function () { b.textContent = "Debug"; }, 1600);
      };
      // eslint-disable for it is itself an error. Correctly so -- the guideline is about
      var save = function () {
        try {
          var a = DOC.createElement("a");
          a.href = "data:application/json;charset=utf-8," + encodeURIComponent(txt);
          a.download = "vault-graph-debug.json";
          a.click();
          done("Saved");
        } catch {
          done("Failed");
        }
      };
      try {
        WIN.navigator.clipboard.writeText(txt).then(function () { done("Copied"); }, save);
      } catch {
        save();
      }
    };

    if (openHostSettings) {
      $("gear").hidden = false;
      $("gear").removeAttribute("aria-expanded");
      $("gear").removeAttribute("aria-controls");
      $("gear").onclick = function () { openHostSettings(); };
    } else if (SETTINGS_UI) {
      $("gear").hidden = false;
      $("gear").onclick = function () {
        var open = $("settings").hidden;
        $("settings").hidden = !open;
        $("gear").setAttribute("aria-expanded", String(open));
        if (open) { buildOptions(); buildSettings(); }
      };
      $("fcreset").onclick = function () {
        pickColor(null, null);
        var savedSub = applySubfolderColors({});
        if (saveSubfolderColors) saveSubfolderColors(Object.assign({}, savedSub));
        buildSettings();
      };
      $("setbody").addEventListener("click", function (ev) {
        var t = ev.target instanceof Element ? ev.target : null;
        if (!t) return;
        var v = t.closest("[data-vis]");
        if (v) { pickVisible(v.getAttribute("data-vis")); return; }
        var tw = t.closest("[data-stw]");
        if (tw) {
          var fg = tw.getAttribute("data-stw");
          if (state.collapsed[fg]) delete state.collapsed[fg]; else state.collapsed[fg] = true;
          buildSettings();
          buildLegend();
          return;
        }
        var s = t.closest("[data-sfc]");
        if (s) {
          var pk = s.getAttribute("data-sfc"), slash = pk.indexOf("/");
          pickSubColors(pk.slice(0, slash), [pk.slice(slash + 1)],
                        s.getAttribute("data-key") || null);
          return;
        }
        var b = t.closest("[data-fc]");
        if (b) pickColor(b.getAttribute("data-fc"), b.getAttribute("data-key") || null);
      });
      $("optbody").addEventListener("click", function (ev) {
        var t = ev.target instanceof Element ? ev.target : null;
        var b = t && t.closest("[data-opt]");
        if (!b) return;
        var key = b.getAttribute("data-opt");
        var row = OPTION_ROWS.filter(function (o) { return o.key === key; })[0];
        if (row) { row.set(!row.get()); buildOptions(); }
      });
    }

    function closeCtxMenu() {
      var el = $("ctxmenu");
      if (el) el.hidden = true;
      DOC.removeEventListener("mousedown", ctxOutside, true);
      DOC.removeEventListener("keydown", ctxKey, true);
      WIN.removeEventListener("resize", closeCtxMenu);
    }
    onDestroy.push(closeCtxMenu);
    /** @param {MouseEvent} ev */
    function ctxOutside(ev) {
      var el = $("ctxmenu");
      if (el && !el.hidden && !el.contains(/** @type {Node} */ (ev.target))) closeCtxMenu();
    }
    /** @param {KeyboardEvent} ev */
    function ctxKey(ev) { if (ev.key === "Escape") closeCtxMenu(); }

    /**
     * @param {PaletteSlot[]} pal
     * @param {{ role: string, current: string, autoKey?: string, dataAttr?: string,
     *           dataValue?: string, titleFor?: (on: boolean, isAuto: boolean) => string }} opts
     */
    function swatchButtonsHTML(pal, opts) {
      return pal.map(function (p) {
        var on = opts.current === p.key;
        var isAuto = !!opts.autoKey && opts.autoKey === p.key;
        return '<button class="swatch vg-' + p.key + '" role="' + opts.role + '"' +
               (opts.dataAttr ? ' data-' + opts.dataAttr + '="' + esc(opts.dataValue) + '"' : '') +
               ' data-key="' + p.key + '" aria-checked="' + on + '"' +
               (isAuto ? ' data-auto="1"' : '') +
               ' title="' + esc(p.name) + (opts.titleFor ? opts.titleFor(on, isAuto) : "") +
               '" aria-label="' + esc(p.name) + '"></button>';
      }).join("");
    }

    // github#34
    // github#3
    // github#3
    /**
     * @param {number} x @param {number} y
     * @param {string} current                       slot key in use, "" for none
     * @param {(key: string | null) => void} onPick
     * @param {string} autoKey                       the slot with no override, "" for none
     * @param {boolean} visShown @param {() => void} onToggleVisible
     * @param {boolean} [byFolderOn] @param {(() => void) | null} [onToggleByFolder]
     * @param {boolean} [tintOn] @param {(() => void) | null} [onToggleTint]
     */
    function openCtxMenu(x, y, current, onPick, autoKey, visShown, onToggleVisible, byFolderOn, onToggleByFolder, tintOn, onToggleTint) {
      var el = $("ctxmenu");
      if (!el) return;
      var pal = paletteInfo();
      var sws = swatchButtonsHTML(pal, {
        role: "menuitemradio", current: current, autoKey: autoKey,
        titleFor: function (on, isAuto) { return isAuto ? " (automatic)" : ""; }
      });
      var visTitle = visShown ? "Hide this folder by default" : "Show this folder by default";
      var visHTML = onToggleVisible
        ? '<button class="vis" data-vis aria-pressed="' + visShown + '" title="' + visTitle +
          '">' + eyeSvg(visShown) + '<span>Shown by default</span></button>'
        : "";
      var byFolderTitle = byFolderOn
        ? "Keep unlinked notes in their own group instead"
        : "Let each unlinked note join its own folder's group";
      var byFolderHTML = onToggleByFolder
        ? '<button class="vis" data-byfolder aria-pressed="' + byFolderOn + '" title="' +
          byFolderTitle + '">' + dotSvg(byFolderOn) + '<span>Joins its folder</span></button>'
        : "";
      var tintTitle = tintOn
        ? "Use the flat unlinked swatch instead"
        : "Give each unlinked note its own folder's colour";
      var tintHTML = onToggleTint
        ? '<button class="vis" data-tint aria-pressed="' + tintOn + '" title="' +
          tintTitle + '">' + dotSvg(tintOn) + '<span>Colour by folder</span></button>'
        : "";
      setHTML(el, '<div class="sws">' + sws + '</div>' +
                  '<button class="auto" data-key="" aria-pressed="' + !current +
                  '" title="Back to automatic">Auto</button>' + visHTML + byFolderHTML + tintHTML);
      Array.prototype.forEach.call(el.querySelectorAll("[data-key]"), /** @param {HTMLElement} b */ function (b) {
        b.onclick = function () { onPick(b.getAttribute("data-key") || null); closeCtxMenu(); };
      });
      if (onToggleVisible) {
        el.querySelector("[data-vis]").onclick = function () { onToggleVisible(); closeCtxMenu(); };
      }
      if (onToggleByFolder) {
        el.querySelector("[data-byfolder]").onclick = function () { onToggleByFolder(); closeCtxMenu(); };
      }
      if (onToggleTint) {
        el.querySelector("[data-tint]").onclick = function () { onToggleTint(); closeCtxMenu(); };
      }
      el.hidden = false;
      var root0 = ROOT.getBoundingClientRect();
      var rx = x - root0.left, ry = y - root0.top;
      var r = el.getBoundingClientRect();
      el.style.left = Math.max(4, Math.min(rx, ROOT.clientWidth - r.width - 4)) + "px";
      el.style.top = Math.max(4, Math.min(ry, ROOT.clientHeight - r.height - 4)) + "px";
      DOC.addEventListener("mousedown", ctxOutside, true);
      DOC.addEventListener("keydown", ctxKey, true);
      WIN.addEventListener("resize", closeCtxMenu);
    }

    $("legend").addEventListener("contextmenu", function (ev) {
      var t = ev.target instanceof Element ? ev.target : null;
      if (!t) return;
      var gBtn = t.closest(".lg[data-g]");
      if (gBtn) {
        ev.preventDefault();
        var g = gBtn.getAttribute("data-g");
        var isUnlinked = g === UNLINKED;
        var keptSeparate = isUnlinked && !unlinkedByFolder;
        openCtxMenu(ev.clientX, ev.clientY, folderColors[g] || groupSlot[g] || "",
                    function (key) { pickColor(g, key); }, groupAutoSlot[g] || "",
                    !hiddenByDefault(g), function () { pickVisible(g); },
                    isUnlinked ? unlinkedByFolder : undefined,
                    isUnlinked ? function () { setUnlinkedByFolder(!unlinkedByFolder, true); } : undefined,
                    keptSeparate ? unlinkedTintByFolder : undefined,
                    keptSeparate ? function () { setUnlinkedTintByFolder(!unlinkedTintByFolder, true); } : undefined);
        return;
      }
      var subBtn = t.closest(".lgs[data-hsub]");
      if (subBtn) {
        ev.preventDefault();
        var f = subBtn.getAttribute("data-hsub");
        var subs = subOrder[f] || [];
        var idx = subBtn.getAttribute("data-idx").split(",").map(Number);
        var picked = idx.map(function (i) { return subs[i]; });
        var cur = idx.length === 1 ? (subfolderColors[f + "/" + picked[0]] || "") : "";
        openCtxMenu(ev.clientX, ev.clientY, cur,
                    function (key) { pickSubColors(f, picked, key); });
        return;
      }
      // design/0003
    });

    /** @param {string} folder @param {string | null} key */
    function pickColor(folder, key) {
      /** @type {SlotMap} */
      var next = dict();
      if (folder) {
        Object.keys(folderColors).forEach(function (g) { next[g] = folderColors[g]; });
        if (key) next[folder] = key; else delete next[folder];
      }
      var saved = applyFolderColors(next);
      if (saveFolderColors) saveFolderColors(Object.assign({}, saved));
      buildSettings();
    }

    /** @param {string} folder @param {string[]} subs @param {string | null} key */
    function pickSubColors(folder, subs, key) {
      /** @type {SlotMap} */
      var next = dict();
      Object.keys(subfolderColors).forEach(function (k) { next[k] = subfolderColors[k]; });
      subs.forEach(function (sb) {
        var pk = folder + "/" + sb;
        if (key) next[pk] = key; else delete next[pk];
      });
      var saved = applySubfolderColors(next);
      if (saveSubfolderColors) saveSubfolderColors(Object.assign({}, saved));
      buildSettings();
    }

    /** @param {string} folder */
    function pickVisible(folder) {
      /** @type {Record<string, boolean>} */
      var next = dict();
      Object.keys(folderShown).forEach(function (g) { next[g] = folderShown[g]; });
      next[folder] = hiddenByDefault(folder);
      var saved = applyFolderShown(next);
      if (saveFolderShown) saveFolderShown(Object.assign({}, saved));
      var h = state.hidden[state.dim] || (state.hidden[state.dim] = dict());
      if (hiddenByDefault(folder)) h[folder] = true; else delete h[folder];
      buildLegend();
      cascade(null, { colToggle: true });
      buildSettings();
    }

    /** @param {string} g @param {PaletteSlot[]} pal */
    function subfolderRows(g, pal) {
      return (subOrder[g] || []).map(function (sb) {
        var pk = g + "/" + sb;
        var pin = subfolderColors[pk] || "";
        var tint = subShade[pk] || colorOf(g);
        var nm = sb || "(directly in folder)";
        var sws = swatchButtonsHTML(pal, {
          role: "radio", dataAttr: "sfc", dataValue: pk, current: pin,
          titleFor: function (on, isAuto) { return on ? " (chosen)" : ""; }
        });
        return '<div class="scr scrsub" role="radiogroup" aria-label="Colour for ' +
               esc(g + "/" + nm) + '">' +
               '<div class="scrh">' +
               '<span class="sw" style="background:' + tint + ';border-radius:50%"></span>' +
               '<span class="nm" title="' + esc(nm) + '">' + esc(nm) + '</span>' +
               '<span class="ct">' + (subCount[pk] || 0) + '</span>' +
               '<button class="auto" data-sfc="' + esc(pk) + '" data-key=""' +
               ' aria-pressed="' + (!pin) + '"' +
               ' title="Back to the automatic tint">Auto</button>' +
               '</div>' +
               '<span class="sws">' + sws + '</span></div>';
      }).join("");
    }

    // github#23, github#3
    var OPTION_ROWS = [
      { key: "compactAxis", label: "Compact date axis",
        title: "Give each year width by how many notes it holds, instead of every year reading the same width",
        get: function () { return compactAxis; },
        set: function (v) { setCompactAxis(v, true); } },
      { key: "unlinkedByFolder", label: "Unlinked notes join their folder",
        title: "A note with no links takes its own folder's wedge and colour, instead of sitting apart in a separate unlinked group -- also reachable by right-clicking the (unlinked) row",
        get: function () { return unlinkedByFolder; },
        set: function (v) { setUnlinkedByFolder(v, true); } },
      { key: "unlinkedTintByFolder", label: "Colour unlinked notes by folder",
        title: "While unlinked notes are kept as their own group, give each one its own folder's colour instead of the flat unlinked swatch -- also reachable by right-clicking the (unlinked) row",
        get: function () { return unlinkedTintByFolder; },
        set: function (v) { setUnlinkedTintByFolder(v, true); } }
    ];
    function buildOptions() {
      var host = $("optbody");
      if (!host) return;
      setHTML(host, OPTION_ROWS.map(function (o) {
        var on = !!o.get();
        return '<div class="row" style="margin-bottom:7px">' +
               '<div class="lbl" style="margin:0">' + esc(o.label) + '</div>' +
               '<div class="mini"><button id="vg-opt-' + o.key + '" data-opt="' + o.key + '"' +
               ' aria-pressed="' + on + '" title="' + esc(o.title) + '">Enabled' +
               '</button></div></div>';
      }).join(""));
    }

    function buildSettings() {
      var pal = paletteInfo();
      var rows = (order[state.dim] || []).map(function (g) {
        var pinned = folderColors[g] || "";
        var cur = pinned || groupSlot[g] || "";
        // github#29
        var autoKey = groupAutoSlot[g] || "";
        var sws = swatchButtonsHTML(pal, {
          role: "radio", dataAttr: "fc", dataValue: g, current: cur, autoKey: autoKey,
          titleFor: function (on, isAuto) {
            return on ? (pinned ? " (chosen)" : " (automatic)") : (isAuto ? " (automatic default)" : "");
          }
        });
        var shown = !hiddenByDefault(g);
        var hasSubs = state.dim === "folder" &&
                      (groupHasPinnedSub(g) ||
                       ((subOrder[g] || []).length > 1 && (counts[g] || 0) >= NEST_MIN));
        var open = hasSubs && !state.collapsed[g];
        return '<div class="scr" role="radiogroup" aria-label="Colour for ' + esc(g) + '">' +
               '<div class="scrh">' +
               twBtn(hasSubs ? 'data-stw="' + esc(g) + '"' : null, open) +
               '<button class="eye vis" data-vis="' + esc(g) + '" aria-pressed="' + shown +
               '" title="' + (shown ? "Shown by default" : "Hidden by default") +
               '" aria-label="' + (shown ? "Hide" : "Show") + " " + esc(g) + '">' +
               eyeSvg(shown) + '</button>' +
               '<span class="nm" title="' + esc(g) + '">' + esc(g) + '</span>' +
               '<button class="auto" data-fc="' + esc(g) + '" data-key=""' +
               ' aria-pressed="' + (!pinned) + '"' +
               ' title="Back to the slot this folder gets automatically">Auto</button>' +
               '</div>' +
               '<span class="sws">' + sws + '</span></div>' +
               (open ? subfolderRows(g, pal) : "");
      }).join("");
      setHTML($("setbody"), rows);
    }
  }

  var FIT_RATIO = 1.08;

  // github#14
  var camAtRest = true, fitting = false;

  function fitRatio() {
    var locked = geomLock && geomLock.maxR ? geomLock.maxR : 0;
    var live = lastMaxR;
    if (!locked || !live) return FIT_RATIO;
    // github#13
    var k = live / locked;
    if (k > 1.35) k = 1.35;
    if (k < 0.12) k = 0.12;
    return FIT_RATIO * k;
  }

  function fit() {
    var to = { x: 0.5, y: 0.5, ratio: fitRatio(), angle: 0 };
    fitting = true;
    var landed = function () { fitting = false; camAtRest = true; };
    // github#4
    if (!panEnabled) {
      renderer.setSetting("enableCameraPanning", true);
      renderer.getCamera().animate(to, { duration: 380 }, function () {
        renderer.setSetting("enableCameraPanning", false);
        landed();
      });
      return;
    }
    renderer.getCamera().animate(to, { duration: 380 }, landed);
  }

  function zoomBy(dir) {
    var cam = renderer.getCamera();
    var step = renderer.getSetting("zoomingRatio") || 1.2;
    var r = cam.getState().ratio * (dir > 0 ? 1 / step : step);
    var lo = renderer.getSetting("minCameraRatio"), hi = renderer.getSetting("maxCameraRatio");
    if (typeof lo === "number" && r < lo) r = lo;
    if (typeof hi === "number" && r > hi) r = hi;
    cam.animate({ ratio: r }, { duration: renderer.getSetting("zoomDuration") || 120 });
  }

  function setPan(on, persist) {
    panEnabled = !!on;
    var btn = $("pan");
    if (btn) btn.setAttribute("aria-pressed", panEnabled ? "true" : "false");
    if (renderer) {
      if (panEnabled) renderer.setSetting("enableCameraPanning", true);
      else fit();
    }
    if (persist && onPanEnabled) onPanEnabled(panEnabled);
    return panEnabled;
  }

  function setCompactAxis(on, persist) {
    compactAxis = !!on;
    // github#23
    ["opt-compactAxis", "compact"].forEach(function (id) {
      var btn = $(id);
      if (btn) btn.setAttribute("aria-pressed", compactAxis ? "true" : "false");
    });
    if (dateSpan) drawDateUI();
    if (persist && onCompactAxis) onCompactAxis(compactAxis);
    return compactAxis;
  }

  // github#3
  // github#45
  function setUnlinkedByFolder(on, persist, instant) {
    var next = !!on;
    /** @type {Record<string, string> | null} */
    var movesFrom = null;
    var n = 0;
    if (renderer && !instant && next !== unlinkedByFolder) {
      graph.forEachNode(function (id) {
        if (!isOrphan(id) || !visible(id) || (alpha[id] || 0) <= 0.004) return;
        if (!movesFrom) movesFrom = dict();
        movesFrom[id] = groupOf(id);
        n++;
      });
    }
    unlinkedByFolder = next;
    var btn = $("opt-unlinkedByFolder");
    if (btn) btn.setAttribute("aria-pressed", unlinkedByFolder ? "true" : "false");
    hardRelayout(false, !!n);
    try { placeLogo(); } catch { }
    try { heatBuild(); } catch { }
    try { buildLegend(); } catch { }
    if (persist && onUnlinkedByFolder) onUnlinkedByFolder(unlinkedByFolder);
    if (n) cascade(null, { colToggle: true, movesFrom: movesFrom });
    return unlinkedByFolder;
  }

  // github#3
  function setUnlinkedTintByFolder(on, persist) {
    unlinkedTintByFolder = !!on;
    buildUnlinkedTint();
    var btn = $("opt-unlinkedTintByFolder");
    if (btn) btn.setAttribute("aria-pressed", unlinkedTintByFolder ? "true" : "false");
    if (renderer) renderer.refresh();
    try { placeLogo(); } catch { }
    try { heatBuild(); } catch { }
    try { buildLegend(); } catch { }
    if (persist && onUnlinkedTintByFolder) onUnlinkedTintByFolder(unlinkedTintByFolder);
    return unlinkedTintByFolder;
  }

  function savePng() {
    var canvases = renderer.getCanvases();
    var src = canvases.nodes;
    var out = DOC.createElement("canvas");
    out.width = src.width; out.height = src.height;
    var ctx = out.getContext("2d");
    ctx.fillStyle = css("--surface-1");
    ctx.fillRect(0, 0, out.width, out.height);
    var lg = $("logo");
    if (lg && logoMaskImg && logoMaskImg.complete && !lg.hidden) {
      var w = parseFloat(lg.style.width) || 0;
      var dpr = src.width / ($("graph").clientWidth || src.width);
      if (w > 0) {
        var side = Math.round(w * dpr);
        /** @param {string[]} cols @returns {HTMLCanvasElement} */
        var layer = function (cols) {
          var lc = DOC.createElement("canvas");
          lc.width = side; lc.height = side;
          var lx = /** @type {CanvasRenderingContext2D} */ (lc.getContext("2d"));
          var cx = side / 2, step = 2 * Math.PI / RING_BUCKETS;
          for (var i = 0; i < RING_BUCKETS; i++) {
            if (!cols[i]) continue;
            lx.beginPath();
            lx.moveTo(cx, cx);
            lx.arc(cx, cx, side, i * step - Math.PI / 2, (i + 1) * step - Math.PI / 2);
            lx.closePath();
            lx.fillStyle = cols[i];
            lx.fill();
          }
          var mm = [0, 0, 0], mk = 0;
          for (var j = 0; j < RING_BUCKETS; j++) {
            if (!cols[j]) continue;
            var cc = toRgb(cols[j]); mm[0] += cc[0]; mm[1] += cc[1]; mm[2] += cc[2]; mk++;
          }
          if (mk) {
            var mr = Math.round(mm[0] / mk), mg = Math.round(mm[1] / mk), mb = Math.round(mm[2] / mk);
            var half = side / 2;
            var cg = lx.createRadialGradient(half, half, 0, half, half, half * CORE_FADE / 100);
            cg.addColorStop(0, "rgba(" + mr + "," + mg + "," + mb + ",1)");
            cg.addColorStop(CORE_SOLID / CORE_FADE, "rgba(" + mr + "," + mg + "," + mb + ",0.92)");
            cg.addColorStop(1, "rgba(" + mr + "," + mg + "," + mb + ",0)");
            lx.fillStyle = cg;
            lx.fillRect(0, 0, side, side);
          }
          lx.globalCompositeOperation = "destination-in";
          lx.drawImage(logoMaskImg, 0, 0, side, side);
          return lc;
        };

        var two = state.logoTwoRing;
        var base = layer(ringColorsSmooth());
        var innerRaw = two ? bandColors(true) : null;
        if (two && innerRaw) {
          var ic = layer(ringColorsSmooth(innerRaw));
          var ix = ic.getContext("2d");
          var f = LOGO_INNER_FADE.split(",");
          var r0f = parseFloat(f[0]) / 100 * (side / 2), r1f = parseFloat(f[1]) / 100 * (side / 2);
          var rg = ix.createRadialGradient(side / 2, side / 2, r0f, side / 2, side / 2, r1f);
          rg.addColorStop(0, "rgba(0,0,0,1)");
          rg.addColorStop(1, "rgba(0,0,0,0)");
          ix.globalCompositeOperation = "destination-in";
          ix.fillStyle = rg;
          ix.fillRect(0, 0, side, side);
          base.getContext("2d").drawImage(ic, 0, 0);
        }
        ctx.globalAlpha = 0.95;
        ctx.drawImage(base, (parseFloat(lg.style.left) - w / 2) * dpr,
                            (parseFloat(lg.style.top) - w / 2) * dpr, side, side);
        ctx.globalAlpha = 1;
      }
    }
    ["edges", "nodes", "labels"].forEach(function (k) {
      if (canvases[k]) ctx.drawImage(canvases[k], 0, 0);
    });
    var a = DOC.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "vault-graph.png";
    a.click();
  }

  function buildStats() {
    var s = DATA.stats;
    $("vname").textContent = DATA.vault + " graph";
    setHTML($("stats"), "<b>" + s.nodes + "</b> notes &middot; <b>" + s.edges + "</b> links &middot; <b>" +
      s.orphans + "</b> unlinked<br>" +
      "<b>" + s.unresolved + "</b> link(s) point at notes that do not exist" +
      (s.ghostsIncluded ? " (shown as ghosts)" : " (hidden)") + "<br>" +
      (s.templatesExcluded ? "Templates excluded. " : "") +
      "Generated " + esc(DATA.generated));
  }

  /** @param {unknown} s */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, /** @param {string} c */ function (c) {
      /** @type {Record<string, string>} */
      var map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return map[c];
    });
  }

  /* ------------------------------------------------------------- heatmap */

  var HEAT_WEEKS = 52;
  var HEAT_WEEKS_MIN = 8;
  var HEAT_GAP = 2, HEAT_CELL_MIN = 7, HEAT_CELL_MAX = 13;
  var HEAT_GUTTER = 18;
  var HEAT_MONTH_H = 12;
  var HEAT_ARROW_W = 9;
  var HEAT_EMPTY_A = 0.5;
  var DAY_MS = 86400000, WEEK_MS = 7 * DAY_MS;
  var MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  /**
   * The heatmap band (github#60, batch 3f).
   * @typedef {Object} HeatDay
   * @property {string} key      YYYY-MM-DD
   * @property {number} ms
   * @property {number} col      week column
   * @property {number} row      weekday row, 0 = Monday
   * @property {string[]} ids
   * @property {{ c: string, w: number }[]} parts   colour and weight per note drawn in the tile
   * @property {number} n        weighted count currently on screen
   * @typedef {Object} Heat
   * @property {number} cols
   * @property {number} cell
   * @property {number} pitch
   * @property {number} start    ms, the Monday of the first column
   * @property {Record<string, HeatDay>} days
   * @property {string[]} keys
   * @property {number[]} cuts   the level thresholds
   * @property {number} nMax
   * @property {number} before
   * @property {number} after
   * @property {number} undated
   * @property {number} dated
   * @property {number} w
   * @property {number} h
   */
  /** @type {Heat | null} */
  var heat = null;
  var heatSig = "";
  /** @type {number | null} */
  var heatRz = null;

  /** @param {string} s @returns {number} ms, or NaN */
  function heatParse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  }
  /** @param {number} ms */
  function heatKey(ms) {
    var d = new Date(ms);
    /** @param {number} n */
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
  }
  /** @param {number} ms */
  function heatMonday(ms) {
    return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS;
  }

  // github#51
  function heatGeom() {
    var wrap = $("heatwrap");
    var avail = ((wrap && wrap.clientWidth) || $("stage").clientWidth || 900) - HEAT_GUTTER;
    avail -= HEAT_ARROW_W;
    var want = Math.floor((avail + HEAT_GAP) / (HEAT_CELL_MAX + HEAT_GAP));
    var span = dateSpan ? Math.ceil((dateSpan.hi - dateSpan.lo) / WEEK_MS) + 1 : HEAT_WEEKS;
    var cols = Math.max(HEAT_WEEKS_MIN, Math.min(HEAT_WEEKS, span, want));
    var cell = Math.floor((avail - (cols - 1) * HEAT_GAP) / cols);
    return { cols: cols, cell: Math.max(HEAT_CELL_MIN, Math.min(HEAT_CELL_MAX, cell)) };
  }

  function heatBuild() {
    var wrap = $("heatwrap"), cv = $("heatc");
    if (!wrap || !cv) return;

    var g = heatGeom();
    var cols = g.cols, cell = g.cell;
    var pitch = cell + HEAT_GAP;
    var endMs = state.heatEnd === null ? heatParse(TODAY) : state.heatEnd;
    var start = heatMonday(endMs) - (cols - 1) * WEEK_MS;

    /** @type {Record<string, HeatDay>} */
    var days = dict();
    /** @type {string[]} */
    var keys = [];
    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < 7; r++) {
        var ms = start + c * WEEK_MS + r * DAY_MS;
        var k = heatKey(ms);
        days[k] = { key: k, ms: ms, col: c, row: r, ids: [], parts: [], n: 0 };
        keys.push(k);
      }
    }

    var before = 0, after = 0, undated = 0;
    /** @type {Record<string, number>} */
    var all = dict();
    graph.forEachNode(function (id, a) {
      var k = a.created;
      if (!heatParse(k)) { undated++; return; }
      all[k] = (all[k] || 0) + 1;
      var d = days[k];
      if (d) d.ids.push(id);
      else if (heatParse(k) < start) before++;
      else after++;
    });

    /** @type {number[]} */
    var counts = [];
    for (var kk in all) counts.push(all[kk]);
    counts.sort(function (x, y) { return x - y; });
    /** @param {number} p 0..1 quantile */
    var q = function (p) {
      return counts.length
        ? counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] : 1;
    };
    var cuts = [q(0.2), q(0.4), q(0.6), q(0.8)];
    var nMax = 1;
    for (var w = 0; w < keys.length; w++) {
      var wn = days[keys[w]].ids.length;
      if (wn > nMax) nMax = wn;
    }

    heat = {
      cols: cols, cell: cell, pitch: pitch, start: start, days: days, keys: keys,
      cuts: cuts, nMax: nMax, before: before, after: after, undated: undated,
      dated: counts.length,
      w: HEAT_GUTTER + cols * pitch - HEAT_GAP + HEAT_ARROW_W,
      h: HEAT_MONTH_H + 7 * pitch - HEAT_GAP
    };

    /** @type {Record<string, number[]>} */
    var hkey = dict();
    graph.forEachNode(function (id) {
      var c = nodeColor(id), l = hex2lab(c);
      hkey[id] = [hueOf(c), l[0]];
    });
    keys.forEach(function (k) {
      days[k].ids.sort(function (a, b) {
        return hkey[a][0] - hkey[b][0] || hkey[a][1] - hkey[b][1];
      });
    });

    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(heat.w * dpr);
    cv.height = Math.round(heat.h * dpr);
    cv.style.width = heat.w + "px";
    cv.style.height = heat.h + "px";

    var inWin = 0;
    for (var i = 0; i < keys.length; i++) inWin += days[keys[i]].ids.length;
    $("heatnote").textContent =
      "last " + cols + " weeks · " + inWin + " of " + graph.order + " notes" +
      (before ? " · " + before + " earlier" : "") +
      (after ? " · " + after + " later" : "") +
      (undated ? " · " + undated + " undated" : "");

    heatSig = "";
    heatDraw();
  }

  /** @param {number} n */
  function heatLevel(n) {
    var c = heat.cuts;
    for (var i = 0; i < c.length; i++) if (n <= c[i]) return i;
    return c.length;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x @param {number} y @param {number} side
   * @param {{ c: string, w: number }[]} parts
   */
  function heatTile(ctx, x, y, side, parts) {
    var n = parts.length;
    if (!n) return;
    var cols = Math.max(1, Math.round(Math.sqrt(n)));
    for (var c = 0; c < cols; c++) {
      var i0 = Math.floor(c * n / cols), i1 = Math.floor((c + 1) * n / cols);
      if (i1 <= i0) continue;
      var x0 = x + side * c / cols, x1 = x + side * (c + 1) / cols;
      var m = i1 - i0;
      for (var j = 0; j < m; j++) {
        var q = parts[i0 + j];
        var y0 = y + side * j / m, y1 = y + side * (j + 1) / m;
        ctx.globalAlpha = q.w;
        ctx.fillStyle = q.c;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    ctx.globalAlpha = 1;
  }

  function heatCompute() {
    for (var i = 0; i < heat.keys.length; i++) {
      var d = heat.days[heat.keys[i]];
      d.n = 0;
      d.parts.length = 0;
      for (var j = 0; j < d.ids.length; j++) {
        var id = d.ids[j], w = alpha[id] || 0;
        if (w <= 0.004) continue;
        d.n += w;
        d.parts.push({ c: nodeColor(id), w: w });
      }
    }
  }

  function heatDraw() {
    var cv = /** @type {HTMLCanvasElement} */ ($("heatc"));
    if (!heat || !cv || !cv.getContext) return;
    heatCompute();

    /** @type {(string | number)[]} */
    var sig = [];
    for (var i = 0; i < heat.keys.length; i++) {
      sig.push(Math.round(heat.days[heat.keys[i]].n * 4));
    }
    sig.push(state.markDay || "", state.hoverDay || "", heat.cell);
    sig = sig.join(",");
    if (sig === heatSig) return;
    heatSig = sig;

    var dpr = window.devicePixelRatio || 1;
    var ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext("2d"));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, heat.w, heat.h);

    var cell = heat.cell, pitch = heat.pitch;
    var R = Math.max(2, Math.round(cell * 0.22));

    var td = heat.days[TODAY];

    ctx.font = "9px ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = THEME.text;
    ctx.globalAlpha = 0.45;
    var lastEnd = -99;
    for (var c = 0; c < heat.cols; c++) {
      var first = new Date(heat.start + c * WEEK_MS);
      if (first.getUTCDate() > 7) continue;
      var x = HEAT_GUTTER + c * pitch;
      if (x < lastEnd + 4) continue;
      var lab2 = MONTH_ABBR[first.getUTCMonth()];
      ctx.fillText(lab2, x, HEAT_MONTH_H - 3);
      lastEnd = x + ctx.measureText(lab2).width;
    }
    ctx.globalAlpha = 1;

    if (td) {
      var ax = HEAT_GUTTER + heat.cols * pitch - HEAT_GAP;
      var ay = HEAT_MONTH_H + td.row * pitch + cell / 2;
      ctx.fillStyle = THEME.today;
      ctx.beginPath();
      ctx.moveTo(ax + 2.5, ay);
      ctx.lineTo(ax + HEAT_ARROW_W - 1, ay - 3.5);
      ctx.lineTo(ax + HEAT_ARROW_W - 1, ay + 3.5);
      ctx.closePath();
      ctx.fill();
    }

    var INIT = ["M", "", "W", "", "F", "", ""];
    ctx.fillStyle = THEME.text;
    ctx.globalAlpha = 0.45;
    for (var r = 0; r < 7; r++) {
      if (INIT[r]) ctx.fillText(INIT[r], 0, HEAT_MONTH_H + r * pitch + cell - 1);
    }
    ctx.globalAlpha = 1;

    for (var i2 = 0; i2 < heat.keys.length; i2++) {
      var d = heat.days[heat.keys[i2]];
      var x2 = HEAT_GUTTER + d.col * pitch, y2 = HEAT_MONTH_H + d.row * pitch;

      ctx.globalAlpha = HEAT_EMPTY_A;
      ctx.fillStyle = THEME.dim;
      heatRect(ctx, x2, y2, cell, cell, R);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (d.n > 0.004) {
        ctx.save();
        heatRect(ctx, x2, y2, cell, cell, R);
        ctx.clip();
        heatTile(ctx, x2, y2, cell, d.parts);
        ctx.restore();
      }

      if (d.key === state.markDay) {
        ctx.strokeStyle = THEME.today;
        ctx.lineWidth = 1.5;
        heatRect(ctx, x2 - 1, y2 - 1, cell + 2, cell + 2, R + 1);
        ctx.stroke();
      } else if (d.key === state.hoverDay) {
        ctx.strokeStyle = THEME.today;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1;
        heatRect(ctx, x2 - 1, y2 - 1, cell + 2, cell + 2, R + 1);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (d.key === TODAY) {
        ctx.strokeStyle = THEME.today;
        ctx.lineWidth = 1;
        heatRect(ctx, x2 - 1, y2 - 1, cell + 2, cell + 2, R + 1);
        ctx.stroke();
      }
    }

    heatDrawKey(cell, R);
  }

  /** @param {number} cell @param {number} R corner radius */
  function heatDrawKey(cell, R) {
    var cv = /** @type {HTMLCanvasElement} */ ($("heatkey"));
    if (!cv || !cv.getContext) return;
    /** @type {number[]} */
    var anchors = [];
    heat.cuts.concat([heat.nMax]).forEach(function (a) {
      if (anchors.indexOf(a) < 0) anchors.push(a);
    });
    var pitch = cell + 4;
    var dpr = window.devicePixelRatio || 1;
    var w = anchors.length * pitch - 4;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(cell * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(cell * dpr);
      cv.style.width = w + "px";
      cv.style.height = cell + "px";
    }
    var ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext("2d"));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, cell);
    var greys = [THEME.neutrals[0], THEME.neutrals[2]];
    for (var i = 0; i < anchors.length; i++) {
      /** @type {{ c: string, w: number }[]} */
      var parts = [];
      for (var j = 0; j < anchors[i]; j++) parts.push({ c: greys[j % 2], w: 1 });
      ctx.save();
      heatRect(ctx, i * pitch, 0, cell, cell, R);
      ctx.clip();
      heatTile(ctx, i * pitch, 0, cell, parts);
      ctx.restore();
    }
    cv.title = anchors.map(function (a) {
      return a + (a === 1 ? " note" : " notes");
    }).join("  ·  ");
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r
   */
  function heatRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** @param {MouseEvent} ev @returns {HeatDay | null} */
  function heatHit(ev) {
    if (!heat) return null;
    var b = $("heatc").getBoundingClientRect();
    var x = ev.clientX - b.left - HEAT_GUTTER, y = ev.clientY - b.top - HEAT_MONTH_H;
    if (x < 0 || y < 0) return null;
    var c = Math.floor(x / heat.pitch), r = Math.floor(y / heat.pitch);
    if (c < 0 || c >= heat.cols || r < 0 || r > 6) return null;
    if (x - c * heat.pitch > heat.cell || y - r * heat.pitch > heat.cell) return null;
    return heat.days[heatKey(heat.start + c * WEEK_MS + r * DAY_MS)] || null;
  }

  var HEAT_WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  /** @param {HeatDay} d */
  function heatShowTip(d) {
    var t = $("htip"), n = Math.round(d.n);
    /** @type {Record<string, number>} */
    var by = dict();
    for (var i = 0; i < d.ids.length; i++) {
      if ((alpha[d.ids[i]] || 0) <= 0.004) continue;
      var g = groupOf(d.ids[i]);
      by[g] = (by[g] || 0) + 1;
    }
    var top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).slice(0, 3);
    var wd = HEAT_WD[(new Date(d.ms).getUTCDay() + 6) % 7];
    setHTML(t, '<div class="t">' + esc(d.key) + " · " + wd +
      (d.key === TODAY ? " · today" : "") + "</div>" +
      '<div class="m">' +
      (n ? n + " note" + (n === 1 ? "" : "s") + " added" : "nothing added") +
      (top.length ? "<br>" + top.map(function (g2) {
        return '<b style="color:' + colorOf(g2) + '">■ </b> ' + esc(g2) + " " + by[g2];
      }).join("<br>") : "") +
      (n ? "<br><i>click to mark them on the disc</i>" : "") +
      "</div>");
    t.hidden = false;
    var box = t.getBoundingClientRect();
    var host = $("heat").getBoundingClientRect(), cv = $("heatc").getBoundingClientRect();
    var cx = cv.left - host.left + HEAT_GUTTER + d.col * heat.pitch + heat.cell / 2;
    var cy = cv.top - host.top + HEAT_MONTH_H + d.row * heat.pitch;
    t.style.left = Math.max(4, Math.min(cx - box.width / 2, host.width - box.width - 4)) + "px";
    var above = cy - box.height - 8;
    t.style.top = (above >= 2 ? above : cy + heat.cell + 8) + "px";
  }

  function buildHeatmapUI() {
    var cv = /** @type {HTMLCanvasElement} */ ($("heatc"));
    /** @param {string | null} key */
    var setHover = function (key) {
      if (state.hoverDay === key) return;
      state.hoverDay = key;
      heatSig = "";
      renderer.refresh();
    };
    cv.addEventListener("mousemove", function (ev) {
      var d = heatHit(ev);
      if (d) heatShowTip(d); else $("htip").hidden = true;
      cv.style.cursor = (d && d.n > 0.004) ? "pointer" : "default";
      setHover(d && d.n > 0.004 ? d.key : null);
    });
    cv.addEventListener("mouseleave", function () {
      $("htip").hidden = true;
      setHover(null);
    });
    cv.addEventListener("click", function (ev) {
      var d = heatHit(ev);
      if (!d || d.n <= 0.004) return;
      state.markDay = (state.markDay === d.key) ? null : d.key;
      heatSig = "";
      renderer.refresh();
    });
    var reflow = function () {
      if (dead) return;
      if (heatRz) WIN.clearTimeout(heatRz);
      heatRz = WIN.setTimeout(function () {
        heatRz = null;
        var g = heatGeom();
        if (heat && g.cell === heat.cell && g.cols === heat.cols) return;
        heatBuild();
      }, 60);
    };
    if (window.ResizeObserver) {
      var heatRO = new ResizeObserver(reflow);
      heatRO.observe($("heatwrap"));
      onDestroy.push(function () { heatRO.disconnect(); });
    } else {
      window.addEventListener("resize", reflow);
      onDestroy.push(function () { window.removeEventListener("resize", reflow); });
    }
    onDestroy.push(function () { if (heatRz) { WIN.clearTimeout(heatRz); heatRz = null; } });
  }

  /* ---------------------------------------------------------------- demo */

  var DEMO_DONE_TITLE = "vault-graph demo complete";

  /* ------------------------------------------------------------ date range --
   * A BRUSH OVER THE WHOLE HISTORY, under the band.
   *
   * The band is a 52-week sliding window onto today, so everything before it is
   * unreachable -- on a ten-year vault that is nine years with nothing to point at. This is
   * the axis that reaches them, and the two ends of the brush are the filter.
   *
   * WHY THE AXIS IS LINEAR IN TIME, which is the one real decision here. Measured on the
   * author's vault: 452 notes over 11.4 years, 389 of them in 2026, and a whole year (2021)
   * holding none. A time axis therefore spends most of its width on very little -- the
   * sidebar's timeline slider dodges exactly this by being linear in note count instead.
   *
   * It is kept anyway, because the two are not the same instrument. A slider is for
   * *setting* a value and wants its travel spent evenly. This is for *finding* one, and what
   * makes a date findable is that it sits where you expect on a calendar: 2019 is at 2019,
   * the burst is visibly a burst, and the year with nothing in it is visibly empty. Spending
   * the width proportionally to notes would put 2021 and 2026 side by side at the same size
   * and lose all three of those facts. Two other concepts were built -- a year rail beside
   * the band, and twin rank-linear sliders -- and this is the one that survived.
   *
   * The bars are sqrt-scaled for the same reason the disc's node sizes are: one month here
   * holds 631 notes and most hold under 40, so a linear height is one bar and a flat line.
   */

  var RIBBON_BARS = 26;
  var RIBBON_TRACK = 14;
  var RIBBON_H = RIBBON_BARS + RIBBON_TRACK;
  var GRAB_PX = 6;
  var DRAG_MIN = 3;

  /**
   * An in-flight drag on the date ribbon. `mode` says which part was grabbed; `pFrom`/`pTo`
   * are the pending range, which brushEnds() reads back while the drag is live -- state.from
   * and state.to are untouched until the pointer is released.
   * @typedef {Object} BrushDrag
   * @property {string} mode        "win" | "body" | "from" | "to" | "new"
   * @property {number} x0
   * @property {boolean} moved
   * @property {number} grab        ms under the pointer when the drag began
   * @property {number} [anchor]
   * @property {number} [from0]
   * @property {number} [to0]
   * @property {number} [pFrom]
   * @property {number} [pTo]
   */
  /** @type {BrushDrag | null} */
  var brushDrag = null;
  /** @type {number | null} */
  var brushSweep = null;

  function drawDateUI() {
    ribW = measureRibbon() || ribW;
    drawRibbon();
    buildYears();
  }

  function buildYears() {
    var host = $("years");
    if (!host) return;
    if (!dateSpan || !dateSpan.years.length) { host.textContent = ""; return; }
    var w = ribbonW();
    // github#23
    var positions = dateSpan.years.map(function (yy) {
      return Math.max(0, Math.min(w, ribbonX(Date.UTC(yy.y, 0, 1), w)));
    });
    var minGap = Infinity;
    for (var gi = 1; gi < positions.length; gi++) {
      minGap = Math.min(minGap, positions[gi] - positions[gi - 1]);
    }
    var every = (positions.length > 1 && minGap < 28) ? 2 : 1;
    var cur = null;
    var cf = state.from === null ? dateSpan.lo : state.from;
    var ct = state.to === null ? dateSpan.hi : state.to;
    var ca = new Date(cf), cb = new Date(ct);
    if (ca.getUTCFullYear() === cb.getUTCFullYear() &&
        ca.getUTCMonth() === 0 && ca.getUTCDate() === 1 &&
        (cb.getUTCMonth() === 11 && cb.getUTCDate() === 31 ||
         ct >= dateSpan.hi)) cur = ca.getUTCFullYear();
    var made = [];
    dateSpan.years.forEach(function (yy, yi) {
      if ((yy.y % every) !== 0) return;
      var at = positions[yi];
      var b = DOC.createElement("button");
      b.type = "button";
      b.setAttribute("data-yr", String(yy.y));
      b.setAttribute("aria-pressed", cur === yy.y ? "true" : "false");
      b.title = yy.y + " -- " + yy.n + " note" + (yy.n === 1 ? "" : "s");
      b.style.setProperty("left", Math.round(at) + "px");
      b.textContent = "'" + String(yy.y).slice(2);
      made.push(b);
    });
    host.replaceChildren.apply(host, made);
  }

  /** @param {HTMLCanvasElement} cv @param {number} w @param {number} h @returns {CanvasRenderingContext2D} */
  function fitCanvas(cv, w, h) {
    var dpr = Math.min(2, WIN.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + "px"; cv.style.height = h + "px";
    var cx = /** @type {CanvasRenderingContext2D} */ (cv.getContext("2d"));
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, w, h);
    return cx;
  }

  /** @param {number} t 0..1 */
  function dateRamp(t) {
    return t <= 0 ? css("--dim")
                  : mixHex(css("--surface-2"), css("--accent"), 0.25 + 0.75 * Math.min(1, t));
  }

  function scrubColor() { return mixHex(css("--accent"), css("--text-1"), 0.3); }

  /** @param {string} hex @param {number} a */
  function rgbaHex(hex, a) {
    var c = toRgb(hex);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  var ribW = 0;

  function measureRibbon() {
    var cv = /** @type {HTMLCanvasElement} */ ($("ribbon"));
    if (!cv) return 0;
    var keep = cv.style.width;
    cv.style.removeProperty("width");
    var w = cv.getBoundingClientRect().width;
    if (keep) cv.style.setProperty("width", keep);
    return w;
  }
  /** @returns {number} the ribbon's pixel width */
  function ribbonW() {
    if (!ribW) ribW = measureRibbon();
    return ribW || 600;
  }
  /** @param {number} ms @param {number} w */
  function ribbonXLinear(ms, w) {
    var span = dateSpan.hi - dateSpan.lo;
    return span > 0 ? ((ms - dateSpan.lo) / span) * w : 0;
  }
  /** @param {number} x @param {number} w */
  /** @param {number} x @param {number} w */
  function ribbonMsLinear(x, w) {
    return dateSpan.lo + (Math.max(0, Math.min(w, x)) / w) * (dateSpan.hi - dateSpan.lo);
  }

  /** @param {number} ms */
  function monthIndexOfMs(ms) {
    var d = new Date(ms), m0 = new Date(dateSpan.months[0].ms);
    var idx = (d.getUTCFullYear() - m0.getUTCFullYear()) * 12 + (d.getUTCMonth() - m0.getUTCMonth());
    return Math.max(0, Math.min(dateSpan.months.length - 1, idx));
  }
  // github#51
  /** @param {number} i index into dateSpan.months */
  function monthEndMs(i) {
    return (i + 1 < dateSpan.months.length) ? dateSpan.months[i + 1].ms : dateSpan.hi;
  }
  // github#23
  /** @param {AxisSeg} seg */
  function segSpanMs(seg) {
    return [dateSpan.months[seg.i].ms, monthEndMs(seg.i)];
  }

  // github#23
  /** @param {number} ms @param {number} w */
  function ribbonXCompact(ms, w) {
    var ax = dateSpan.axis, seg = ax.segs[ax.segOfMonth[monthIndexOfMs(ms)]];
    var span = segSpanMs(seg), lo = span[0], hi = span[1];
    var frac = hi > lo ? Math.max(0, Math.min(1, (ms - lo) / (hi - lo))) : 0;
    var wPos = seg.w0 + frac * (seg.w1 - seg.w0);
    return (wPos / ax.totalW) * w;
  }
  /** @param {number} x @param {number} w */
  function ribbonMsCompact(x, w) {
    var ax = dateSpan.axis, xc = Math.max(0, Math.min(w, x));
    var wPos = (xc / w) * ax.totalW, segs = ax.segs, seg = segs[segs.length - 1];
    for (var i = 0; i < segs.length; i++) {
      if (wPos <= segs[i].w1) { seg = segs[i]; break; }
    }
    var frac = seg.w1 > seg.w0 ? Math.max(0, Math.min(1, (wPos - seg.w0) / (seg.w1 - seg.w0))) : 0;
    var span = segSpanMs(seg);
    return span[0] + frac * (span[1] - span[0]);
  }

  /** @param {number} ms @param {number} w */
  function ribbonX(ms, w) {
    return (compactAxis && dateSpan.axis) ? ribbonXCompact(ms, w) : ribbonXLinear(ms, w);
  }
  /** @param {number} x @param {number} w */
  function ribbonMs(x, w) {
    return (compactAxis && dateSpan.axis) ? ribbonMsCompact(x, w) : ribbonMsLinear(x, w);
  }

  /** @returns {number[]} [from, to] in ms -- the pending range while a drag is live */
  function brushEnds() {
    if (brushDrag && brushDrag.pFrom !== undefined) return [brushDrag.pFrom, brushDrag.pTo];
    if (brushSweep !== null) return [dateSpan.lo, brushSweep];
    return [state.from === null ? dateSpan.lo : state.from,
            state.to === null ? dateSpan.hi : state.to];
  }

  function winEndNow() {
    if (state.heatEnd !== null) return state.heatEnd;
    return heat ? heat.start + heat.cols * WEEK_MS : heatParse(TODAY);
  }

  /** @param {CanvasRenderingContext2D} cx @param {number} top @param {Month} m @param {number} x @param {number} bw */
  function paintMonthBar(cx, top, m, x, bw) {
    var t = Math.min(1, m.n / dateSpan.nRef);
    var bh = m.n ? Math.max(1.5, (top - 2) * t) : 0;
    cx.fillStyle = m.n ? dateRamp(t) : css("--dim");
    cx.fillRect(x, top - bh, bw, bh || 1);
  }

  function drawRibbon() {
    var cv = /** @type {HTMLCanvasElement} */ ($("ribbon"));
    if (!cv || !dateSpan) return;
    var w = Math.max(200, ribbonW());
    var cx = fitCanvas(cv, w, RIBBON_H);
    var top = RIBBON_BARS;
    var ms = dateSpan.months, n = ms.length;
    var useCompact = compactAxis && dateSpan.axis;

    if (useCompact) {
      // github#23
      var segs = dateSpan.axis.segs, totalW = dateSpan.axis.totalW;
      for (var si = 0; si < segs.length; si++) {
        var seg = segs[si];
        var segX = (seg.w0 / totalW) * w;
        var segW = Math.max(1, ((seg.w1 - seg.w0) / totalW) * w - 0.6);
        paintMonthBar(cx, top, ms[seg.i], segX, segW);
      }
      // github#23
      for (var j = 0; j < n; j++) {
        if (ms[j].m !== 0) continue;
        var jSeg = segs[dateSpan.axis.segOfMonth[j]];
        cx.fillStyle = rgbaHex(css("--text-3"), 0.28);
        cx.fillRect((jSeg.w0 / totalW) * w, 0, 1, top);
      }
    } else {
      // github#51
      for (var i = 0; i < n; i++) {
        var bx = ribbonXLinear(ms[i].ms, w);
        paintMonthBar(cx, top, ms[i], bx, Math.max(1, ribbonXLinear(monthEndMs(i), w) - bx - 0.6));
      }
      for (var j2 = 0; j2 < n; j2++) {
        if (ms[j2].m !== 0) continue;
        cx.fillStyle = rgbaHex(css("--text-3"), 0.28);
        cx.fillRect(ribbonXLinear(ms[j2].ms, w), 0, 1, top);
      }
    }

    var tw = winTrack(w);
    cx.fillStyle = rgbaHex(css("--text-3"), 0.16);
    heatRect(cx, 0, tw.y + tw.h / 2 - 1, w, 2, 1);
    cx.fill();
    var pillW = Math.max(10, tw.x1 - tw.x0);
    cx.fillStyle = scrubColor();
    cx.globalAlpha = brushDrag && brushDrag.mode === "win" ? 1 : 0.86;
    heatRect(cx, tw.x0, tw.y, pillW, tw.h, tw.h / 2);
    cx.fill();
    cx.globalAlpha = 1;
    cx.strokeStyle = rgbaHex(css("--surface-0"), 0.9);
    cx.lineWidth = 1;
    heatRect(cx, tw.x0, tw.y, pillW, tw.h, tw.h / 2);
    cx.stroke();

    var e = brushEnds(), x0 = ribbonX(e[0], w), x1 = ribbonX(e[1], w);
    cx.fillStyle = rgbaHex(css("--surface-0"), 0.72);
    cx.fillRect(0, 0, x0, top);
    cx.fillRect(x1, 0, w - x1, top);

    var col = scrubColor(), rim = rgbaHex(css("--surface-0"), 0.92);
    var gw = 9, gh = Math.max(12, top - 8), gy = (top - gh) / 2;
    [x0, x1].forEach(function (x) {
      var gx = Math.max(0, Math.min(w - gw, x - gw / 2));
      cx.fillStyle = rim;
      cx.fillRect(x - 2.5, 0, 5, top);
      cx.fillStyle = col;
      cx.fillRect(x - 1.5, 0, 3, top);
      heatRect(cx, gx, gy, gw, gh, 3);
      cx.fill();
      cx.strokeStyle = rim;
      cx.lineWidth = 1;
      heatRect(cx, gx, gy, gw, gh, 3);
      cx.stroke();
      cx.fillStyle = rim;
      cx.fillRect(gx + gw / 2 - 2, gy + gh / 2 - 3, 1, 6);
      cx.fillRect(gx + gw / 2 + 1, gy + gh / 2 - 3, 1, 6);
    });
  }

  function rebuildBand() {
    var endMs = state.heatEnd === null ? heatParse(TODAY) : state.heatEnd;
    var wantStart = heatMonday(endMs) - ((heat ? heat.cols : HEAT_WEEKS) - 1) * WEEK_MS;
    var moved = !heat || heat.start !== wantStart;
    if (moved) heatBuild();
    drawDateUI();
    if (moved) heatDraw();
  }

  /** @param {number} w */
  function winTrack(w) {
    var span = (heat ? heat.cols : HEAT_WEEKS) * WEEK_MS;
    var end = winEndNow();
    return { x0: ribbonX(end - span, w), x1: ribbonX(end, w),
             y: RIBBON_BARS + 2, h: RIBBON_TRACK - 5 };
  }

  function inWinTrack(y) { return y >= RIBBON_BARS && y < RIBBON_BARS + RIBBON_TRACK; }

  /** @returns {number} the visible window, in ms */
  function winSpan() { return (heat ? heat.cols : HEAT_WEEKS) * WEEK_MS; }

  /** @param {number} ms */
  function clampWinEnd(ms) {
    var todayMs = heatParse(TODAY);
    var lo = dateSpan.lo + winSpan();
    return Math.max(Math.min(ms, todayMs), Math.min(lo, todayMs));
  }

  // github#23
  /** @param {number} px @param {number} w */
  function winEndCentredAtPx(px, w) {
    var span = winSpan(), todayMs = heatParse(TODAY);
    var lo = Math.min(dateSpan.lo + span, todayMs), hi = todayMs;
    if (lo >= hi) return clampWinEnd(hi);
    for (var i = 0; i < 24; i++) {
      var mid = (lo + hi) / 2;
      var midPx = (ribbonX(mid - span, w) + ribbonX(mid, w)) / 2;
      if (midPx < px) lo = mid; else hi = mid;
    }
    return clampWinEnd((lo + hi) / 2);
  }

  /** @param {number} x @param {number} w @param {number} [y] */
  function brushHit(x, w, y) {
    if (y !== undefined && inWinTrack(y)) return "win";
    var e = brushEnds(), x0 = ribbonX(e[0], w), x1 = ribbonX(e[1], w);
    var d0 = Math.abs(x - x0), d1 = Math.abs(x - x1);
    if (d0 <= GRAB_PX || d1 <= GRAB_PX) return d0 <= d1 ? "from" : "to";
    if (x > x0 && x < x1) {
      return (state.from === null && state.to === null) ? "new" : "body";
    }
    return "new";
  }

  /** @param {number} x @param {string} text */
  function showRTip(x, text) {
    var t = $("rtip"), rib = $("ribbon"), band = $("heat");
    if (!t || !rib || !band) return;
    setHTML(t, esc(text));
    t.hidden = false;
    var bb = band.getBoundingClientRect(), rb = rib.getBoundingClientRect();
    var tb = t.getBoundingClientRect();
    var left = Math.max(4, Math.min(bb.width - tb.width - 4, (rb.left - bb.left) + x - tb.width / 2));
    t.style.left = left + "px";
    t.style.top = ((rb.top - bb.top) - tb.height - 3) + "px";
  }
  function hideRTip() { var t = $("rtip"); if (t) t.hidden = true; }

  /** @param {number} ms */
  function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }

  function winLabel() {
    if (!heat) return "";
    return isoDay(heat.start) + "  \u2192  " + isoDay(heat.start + heat.cols * WEEK_MS - DAY_MS);
  }

  function buildDateUI() {
    var rib = $("ribbon");
    if (!rib) return;

    var onFrame = makeFrameCoalescer();

    $("rangeall").onclick = function () {
      state.from = null; state.to = null; state.heatEnd = null;
      heatBuild();
      applyRange();
      heatDraw();
    };

    /** @param {HTMLInputElement | null} el @returns {number | null} */
    var fieldMs = function (el) {
      var v = el && el.value;
      if (!v) return null;
      var t = heatParse(v);
      return isFinite(t) ? t : null;
    };
    ["from", "to"].forEach(function (which) {
      var el = $(which);
      if (!el) return;
      el.onchange = function () {
        setRangeMs(fieldMs($("from")), fieldMs($("to")));
      };
    });

    /** @param {PointerEvent} ev */
    var xOf = function (ev) { return ev.clientX - rib.getBoundingClientRect().left; };
    /** @param {PointerEvent} ev */
    var yOf = function (ev) { return ev.clientY - rib.getBoundingClientRect().top; };

    rib.addEventListener("pointerdown", function (ev) {
      if (!dateSpan) return;

      var w = ribbonW(), x = xOf(ev), mode = brushHit(x, w, yOf(ev)), e = brushEnds();
      brushDrag = { mode: mode, x0: ev.clientX, moved: false,
                    anchor: mode === "from" ? e[1] : e[0],
                    from0: e[0], to0: e[1], grab: ribbonMs(x, w),
                    winEnd0: heat ? heat.start + heat.cols * WEEK_MS : 0 };
      try { rib.setPointerCapture(ev.pointerId); } catch { }
      rib.setAttribute("data-grab", mode === "win" ? "moving"
                                  : mode === "body" ? "moving" : "edge");
      if (mode === "win") {
        state.heatEnd = winEndCentredAtPx(x, w);
        rebuildBand();
        showRTip(x, winLabel());
      }
    });

    rib.addEventListener("pointermove", function (ev) {
      if (!brushDrag) {
        if (dateSpan) {
          var x = xOf(ev), w2 = ribbonW(), m = brushHit(x, w2, yOf(ev));
          if (m === "win") rib.setAttribute("data-grab", "body");
          else if (m === "from" || m === "to") rib.setAttribute("data-grab", "edge");
          else if (m === "body") rib.setAttribute("data-grab", "body");
          else rib.removeAttribute("data-grab");
          showRTip(x, m === "win" ? winLabel() : isoDay(ribbonMs(x, w2)));
        }
        return;
      }
      if (Math.abs(ev.clientX - brushDrag.x0) > DRAG_MIN) brushDrag.moved = true;
      if (!brushDrag.moved) return;

      var w = ribbonW(), here = ribbonMs(xOf(ev), w);

      /** @type {number} */ var lo;

      /** @type {number} */ var hi;

      /** @type {number} */ var follow;

      if (brushDrag.mode === "win") {
        var wx = xOf(ev);
        onFrame(function () {
          if (!brushDrag) return;
          state.heatEnd = winEndCentredAtPx(wx, w);
          rebuildBand();
          showRTip(wx, winLabel());
        });
        return;
      }

      if (brushDrag.mode === "body") {
        var d = here - brushDrag.grab;
        var width = brushDrag.to0 - brushDrag.from0;
        lo = Math.max(dateSpan.lo, Math.min(dateSpan.hi - width, brushDrag.from0 + d));
        hi = lo + width;
        follow = hi;
      } else if (brushDrag.mode === "from" || brushDrag.mode === "to") {
        lo = Math.min(brushDrag.anchor, here);
        hi = Math.max(brushDrag.anchor, here);
        follow = here;
      } else {
        lo = Math.min(brushDrag.grab, here);
        hi = Math.max(brushDrag.grab, here);
        follow = here;
      }
      var mode = /** @type {string} */ (brushDrag.mode);
      brushDrag.pFrom = lo;
      brushDrag.pTo = hi;
      onFrame(function () {
        if (!brushDrag) return;
        showRTip(ribbonX(follow, w),
                 mode === "body" ? isoDay(lo) + "  \u2192  " + isoDay(hi) : isoDay(follow));
        drawDateUI();
        var el = $("rangenote");
        if (el) el.textContent = isoDay(lo) + "  \u2192  " + isoDay(hi);
      });
    });

    /** @param {PointerEvent} ev */
    var endDrag = function (ev) {
      if (!brushDrag) return;
      var d = brushDrag;
      brushDrag = null;
      rib.removeAttribute("data-grab");
      hideRTip();
      try { rib.releasePointerCapture(ev.pointerId); } catch { }

      if (d.mode === "win") return;
      if (d.moved && d.pFrom !== undefined) {
        state.from = d.pFrom <= dateSpan.lo ? null : d.pFrom;
        state.to = d.pTo >= dateSpan.hi ? null : d.pTo;
        applyRange();
      } else {
        rangeChrome();
      }
    };
    rib.addEventListener("pointerup", endDrag);
    rib.addEventListener("pointercancel", endDrag);

    rib.addEventListener("pointerleave", function () { if (!brushDrag) hideRTip(); });

    var yrHost = $("years");
    /** @param {string | null} yr */
    var hoverYear = function (yr) {
      if (state.hoverYear === yr) return;
      state.hoverYear = yr;
      if (renderer) renderer.refresh();
    };
    if (yrHost) {
      /** @param {MouseEvent} ev */
      /** @param {MouseEvent} ev @returns {string | null} */
      var yrOf = function (ev) {
        var t = /** @type {Element | null} */ (ev.target);
        var b = t && t.closest && t.closest("button[data-yr]");
        return b ? b.getAttribute("data-yr") : null;
      };
      yrHost.addEventListener("click", function (ev) {
        var yr = yrOf(ev);
        if (yr === null) return;
        state.hoverYear = null;
        setRangeMs(Date.UTC(+yr, 0, 1), Date.UTC(+yr, 11, 31));
      });
      yrHost.addEventListener("pointerover", function (ev) { hoverYear(yrOf(ev)); });
      yrHost.addEventListener("pointerout", function (ev) {
        if (!ev.relatedTarget || !yrHost.contains(ev.relatedTarget)) hoverYear(null);
      });
    }

    var onSlot = function () {
      if (dead) return;
      var w = measureRibbon();
      if (w && Math.abs(w - ribW) < 0.5) return;
      ribW = w;
      drawDateUI();
    };
      var winRO = /** @type {{ ResizeObserver?: new (cb: () => void) => { observe: (el: Element) => void, disconnect: () => void } }} */ (WIN);
    if (winRO.ResizeObserver) {
      var slotRO = new winRO.ResizeObserver(onSlot);
      slotRO.observe($("heat"));
      onDestroy.push(function () { slotRO.disconnect(); });
    } else {
      WIN.addEventListener("resize", onSlot);
      onDestroy.push(function () { WIN.removeEventListener("resize", onSlot); });
    }
    applyRange();
  }

  function wantWedgeDebug() {
    var q = String(WIN.location ? WIN.location.search : "") + " " +
            String(WIN.location ? WIN.location.hash : "");
    if (/(^|[?&#])nowedges\b/.test(q)) return false;
    if (/(^|[?&#])wedges\b/.test(q)) return true;
    return !!(DATA && DATA.dev);
  }

  function restOn() {
    return /(^|[?&#])rest\b/.test(String(location.search) + " " + String(location.hash));
  }

  function rowArcOn() {
    return /(^|[?&#])rowarc/.test(String(location.search) + " " + String(location.hash));
  }

  /**
   * The demo storyboard's own shapes (github#60, batch 3i). Every beat field is optional:
   * a beat is one of settle / click / dblclick / rightclick / hover / drag / wheel / park,
   * and `act` and `why` label it. `target` is a [kind, arg] pair demoFind resolves.
   * @typedef {Object} DemoBeat
   * @property {string} [act]
   * @property {string} [why]
   * @property {boolean} [settle]
   * @property {boolean} [park]
   * @property {boolean} [click]
   * @property {boolean} [dblclick]
   * @property {boolean} [rightclick]
   * @property {boolean} [hover]
   * @property {boolean} [drag]
   * @property {number} [wheel]
   * @property {string[]} [target]
   * @property {string[]} [to]
   *
   * What demoWhere reports about a resolved target: where it is on screen, and the label and
   * clearance the driver annotates its recording with.
   * @typedef {Object} DemoSpot
   * @property {number} x
   * @property {number} y
   * @property {number} w
   * @property {number} h
   * @property {unknown} expect
   * @property {number | null} gap
   * @property {string} [label]
   */
  function demoOn() {
    return /(^|[?&#])demo\b/.test(String(location.search) + " " + String(location.hash));
  }

  /* ---- BEGIN: demo automation + debug API -- stripped from the plugin build, see scripts/build-plugin.mjs (stripDemoAndDebug) ---- */

  function demoBusy() {
    return !!(play || cascadeRun || anim || hoverRaf || hlRaf);
  }

  /** @param {string} spec a name prefix, or "#N" for the Nth biggest */
  function demoGroup(spec) {
    var names = order[state.dim] || [];
    if (!names.length) return null;
    var bySize = names.slice().sort(function (a, b) { return (counts[b] || 0) - (counts[a] || 0); });
    if (/^#\d+$/.test(spec)) return bySize[parseInt(spec.slice(1), 10) - 1] || null;
    for (var i = 0; i < names.length; i++) {
      if (names[i].indexOf(spec) === 0) return names[i];
    }
    return bySize[0];
  }

  /**
   * Resolve a beat's [kind, arg] target. Returns either a real element, or a plain rect-like
   * stand-in that demoNoteRect / demoBigInnerNote / demoPoint build for things with no
   * element of their own -- a note on the disc, a heatmap cell, a point on the ribbon. Both
   * shapes answer the three questions demoWhere asks of them, which is why they are
   * interchangeable here; DemoTarget states that duck-typed contract rather than pretending
   * one is the other.
   * @typedef {Object} DemoTarget
   * @property {number} [left]
   * @property {number} [top]
   * @property {number} [width]
   * @property {number} [height]
   * @property {unknown} [expect]
   * @property {number} [gap]
   * @property {string} [demoLabel]
   * @property {string} [id]
   * @property {() => DOMRect} [getBoundingClientRect]
   * @property {(opts?: unknown) => void} [scrollIntoView]
   * @property {(name: string) => string | null} [getAttribute]
   * @property {(sel: string) => Element | null} [querySelector]
   *
   * @param {string} kind @param {string} arg
   * @returns {DemoTarget | null}
   */
  function demoFind(kind, arg) {
    if (kind === "id") return $(arg);
    if (kind === "stage") {
      var stageEl = $("graph");
      if (!stageEl) return null;
      var sb = stageEl.getBoundingClientRect();
      var f = (arg === "centre" || !arg) ? [0.5, 0.5] : String(arg).split(",").map(Number);
      return demoPoint(sb.left + sb.width * f[0], sb.top + sb.height * f[1],
                       2, 2, "stage " + (arg || "centre"));
    }
    if (kind === "brush") return demoRibbonPoint(arg);
    if (kind === "eye" || kind === "group") {
      var g = demoGroup(arg);
      if (!g) return null;
      var attr = kind === "eye" ? "data-eye" : "data-g";
      var all = $("legend").querySelectorAll("[" + attr + "]");
      for (var i = 0; i < all.length; i++) {
        if (all[i].getAttribute(attr) === g) return all[i];
      }
      return null;
    }
    if (kind === "sub") {
      var slash = arg.indexOf("/");
      var g2 = demoGroup(arg.slice(0, slash)), nm = arg.slice(slash + 1);
      if (!g2) return null;
      var subs2 = subOrder[g2] || [];
      var k2 = subs2.indexOf(nm);
      if (k2 < 0) k2 = subs2.length ? 0 : -1;
      if (k2 < 0) return null;
      var rows = $("legend").querySelectorAll("[data-hsub]");
      for (var j = 0; j < rows.length; j++) {
        if (rows[j].getAttribute("data-hsub") !== g2) continue;
        var idx = rows[j].getAttribute("data-idx").split(",");
        if (idx.indexOf(String(k2)) >= 0) return rows[j];
      }
      return null;
    }
    if (kind === "twisty") {
      var gt = demoGroup(arg);
      if (!gt) return null;
      var tws = $("legend").querySelectorAll("[data-tw]");
      for (var t = 0; t < tws.length; t++) {
        if (tws[t].getAttribute("data-tw") === gt) return tws[t];
      }
      return null;
    }
    if (kind === "only") {
      var row = demoFind("group", arg);
      return row ? row.querySelector(".only") : null;
    }
    if (kind === "swatch") {
      var cut = arg.indexOf("/");
      var gsw = demoGroup(arg.slice(0, cut)), key = arg.slice(cut + 1);
      if (!gsw) return null;
      var sw = $("setbody").querySelectorAll(".swatch");
      for (var s = 0; s < sw.length; s++) {
        if (sw[s].getAttribute("data-fc") === gsw &&
            sw[s].getAttribute("data-key") === key) return sw[s];
      }
      return null;
    }
    if (kind === "ctxswatch") {
      var cm = $("ctxmenu");
      if (!cm || cm.hidden) return null;
      var csw = cm.querySelectorAll("[data-key]");
      for (var cs = 0; cs < csw.length; cs++) {
        if (csw[cs].getAttribute("data-key") === (arg || "")) return csw[cs];
      }
      return null;
    }
    // github#34
    if (kind === "ctxvis") {
      var cmv = $("ctxmenu");
      if (!cmv || cmv.hidden) return null;
      return cmv.querySelector("[data-vis]");
    }
    // github#3
    if (kind === "ctxbyfolder") {
      var cmb = $("ctxmenu");
      if (!cmb || cmb.hidden) return null;
      return cmb.querySelector("[data-byfolder]");
    }
    if (kind === "ctxtint") {
      var cmt = $("ctxmenu");
      if (!cmt || cmt.hidden) return null;
      return cmt.querySelector("[data-tint]");
    }
    if (kind === "year") {
      var yh = $("years");
      if (!yh || !dateSpan) return null;
      var chips = Array.from(yh.querySelectorAll("button[data-yr]"));
      if (!chips.length) return null;
      /** @type {Record<string, number>} */
      var have = dict();
      dateSpan.years.forEach(function (yy) { have[String(yy.y)] = yy.n; });
      /** @type {(HTMLElement & { demoLabel?: string }) | null} */
      var pickY = null;
      var bestN = -1;
      chips.forEach(function (c) {
        var y = c.getAttribute("data-yr");
        if (arg && /^\d{4}$/.test(arg)) { if (y === arg) pickY = c; return; }
        var n = have[y] || 0;
        if (n > bestN) { bestN = n; pickY = c; }
      });
      if (!pickY || (!arg && bestN <= 0)) return null;
      pickY.demoLabel = "year " + pickY.getAttribute("data-yr") +
                        " (" + (have[pickY.getAttribute("data-yr")] || 0) + " notes)";
      return pickY;
    }
    if (kind === "note") return demoNoteRect(arg);
    if (kind === "biginner") return demoBigInnerNote();
    if (kind === "pin") {
      var dcard = $("detail");
      return dcard && !dcard.hidden ? dcard.querySelector(".pin") : null;
    }
    if (kind === "detailclose") {
      var dc2 = $("detail");
      return dc2 && !dc2.hidden ? dc2.querySelector(".x") : null;
    }
    if (kind === "day") return demoCellRect(heat && heat.days[arg]);
    if (kind === "busiest") {
      if (!heat) return null;
      var ds = [];
      for (var kk in heat.days) if (heat.days[kk].n > 0.004) ds.push(heat.days[kk]);
      ds.sort(function (a, b) { return b.n - a.n; });
      return demoCellRect(ds[Math.max(1, parseInt(arg, 10) || 1) - 1]);
    }
    return null;
  }

  /** @param {string} prefix */
  function demoNoteRect(prefix) {
    var g = demoGroup(prefix);
    if (!g || !renderer) return null;
    var org = $("graph").getBoundingClientRect();
    /** @type {{ id: string, x: number, y: number, r: number, mine: boolean, label: string }[]} */
    var pts = [];
    var maxR = 0;
    graph.forEachNode(function (id, a) {
      if ((alpha[id] || 0) < 0.5) return;
      var v = renderer.graphToViewport({ x: a.x, y: a.y });
      v = { x: v.x + org.left, y: v.y + org.top };
      var r = renderer.scaleSize ? renderer.scaleSize(dotPx(a.size, id)) : dotPx(a.size, id);
      if (r > maxR) maxR = r;
      pts.push({ id: id, x: v.x, y: v.y, r: r, mine: a.folder === g, label: a.label });
    });
    var best = null, bestGap = -1;
    for (var i = 0; i < pts.length; i++) {
      if (!pts[i].mine) continue;
      var gap = Infinity;
      for (var j = 0; j < pts.length; j++) {
        if (i === j) continue;
        var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        var d2 = dx * dx + dy * dy;
        if (d2 < gap) gap = d2;
      }
      if (gap > bestGap) { bestGap = gap; best = pts[i]; }
    }
    if (!best) return null;
    var box = Math.max(6, best.r * 1.5);
    return {
      left: best.x - box / 2, top: best.y - box / 2, width: box, height: box,
      expect: best.id,
      gap: Math.round(Math.sqrt(bestGap) * 10) / 10,
      demoLabel: "note " + best.label
    };
  }

  function demoBigInnerNote() {
    if (!renderer || !geomLock || !geomLock.bandR) return null;
    var org = $("graph").getBoundingClientRect();
    // github#60
    var lo = geomLock.r0;
    var hi = geomLock.r0 + (geomLock.rOuter - geomLock.r0) * INNER_FILL;
    /** @type {{ id: string, x: number, y: number, r: number, size: number, label: string }[]} */
    var pts = [];
    graph.forEachNode(function (id, a) {
      if ((alpha[id] || 0) < 0.5) return;
      var rNorm = Math.hypot(a.x, a.y) / UNIT;
      if (rNorm < lo || rNorm > hi) return;
      var v = renderer.graphToViewport({ x: a.x, y: a.y });
      v = { x: v.x + org.left, y: v.y + org.top };
      var rad = renderer.scaleSize ? renderer.scaleSize(dotPx(a.size, id)) : dotPx(a.size, id);
      pts.push({ id: id, x: v.x, y: v.y, r: rad, size: a.size || 0, label: a.label });
    });
    if (!pts.length) return null;
    pts.sort(function (a, b) { return b.size - a.size; });
    var top = pts.slice(0, Math.min(5, pts.length));
    /** @type {{ id: string, x: number, y: number, r: number, size: number, label: string } | null} */
    var best = null;
    var bestGap = -1;
    top.forEach(function (p) {
      var gap = Infinity;
      for (var j = 0; j < pts.length; j++) {
        if (pts[j].id === p.id) continue;
        var dx = p.x - pts[j].x, dy = p.y - pts[j].y;
        var d2 = dx * dx + dy * dy;
        if (d2 < gap) gap = d2;
      }
      if (gap > bestGap) { bestGap = gap; best = p; }
    });
    var box = Math.max(6, best.r * 1.5);
    return {
      left: best.x - box / 2, top: best.y - box / 2, width: box, height: box,
      expect: best.id,
      gap: Math.round(Math.sqrt(bestGap) * 10) / 10,
      demoLabel: "note " + best.label
    };
  }

  /** @param {HeatDay | null | undefined} d */
  function demoCellRect(d) {
    if (!d || !heat) return null;
    var b = $("heatc").getBoundingClientRect();
    return {
      left: b.left + HEAT_GUTTER + d.col * heat.pitch,
      top:  b.top + HEAT_MONTH_H + d.row * heat.pitch,
      width: heat.cell, height: heat.cell,
      demoLabel: "heatmap " + d.key + " (" + Math.round(d.n) + " notes)"
    };
  }

  /** @param {number} cx @param {number} cy @param {number} w @param {number} h @param {string} [label] */
  function demoPoint(cx, cy, w, h, label) {
    return {
      getBoundingClientRect: function () {
        return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
      },
      demoLabel: label
    };
  }

  /** @param {string} which */
  function demoRibbonPoint(which) {
    var rib = $("ribbon");
    if (!rib || !dateSpan) return null;
    var b = rib.getBoundingClientRect();
    var w = b.width;
    if (which === "window") {
      var t = winTrack(w);
      return demoPoint(b.left + (t.x0 + t.x1) / 2, b.top + t.y + t.h / 2, 8, 8, "band window");
    }
    var e = brushEnds();
    var x = ribbonX(which === "to" ? e[1] : e[0], w);
    x = Math.max(2, Math.min(w - 2, x));
    return demoPoint(b.left + x, b.top + RIBBON_BARS / 2, 8, 8,
                     which === "to" ? "range end" : "range start");
  }

  /** @param {string} kind @param {string} [arg] @returns {DemoSpot | null} */
  function demoWhere(kind, arg) {
    var el = demoFind(kind, arg);
    if (!el) return null;
    if (el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    var b = el.getBoundingClientRect ? el.getBoundingClientRect() : el;
    if (!b.width || !b.height) return null;
    return {
      x: Math.round(b.left + b.width / 2),
      y: Math.round(b.top + b.height / 2),
      w: Math.round(b.width), h: Math.round(b.height),
      expect: el.expect || null,
      gap: el.gap != null ? el.gap : null,
      label: (el.demoLabel ||
              (el.getAttribute && (el.getAttribute("title") || el.id)) ||
              (kind + " " + arg)).slice(0, 44)
    };
  }

  /** @returns {DemoBeat[]} */
  function demoMode() {
    return [
      { settle: true, act: "intro", why: "start from a disc at rest" },
      { click: true, target: ["id", "refresh"], act: "intro", why: "replay the intro on camera" },
      { settle: true, act: "intro", why: "the vault grows from its first note to now, and the range end sweeps with it" },

      { hover: true, target: ["note", "04"], act: "note", why: "hover a daily note" },
      { hover: true, target: ["note", "05"], act: "note", why: "hover a meeting note" },

      { drag: true, target: ["biginner"], act: "pin", to: ["stage", "centre"],
        why: "drag a note into the hole to pin it" },
      { settle: true, act: "pin", why: "the hub opens and the ring closes around where it was" },
      { rightclick: true, target: ["note", "05"], act: "pin", why: "right-click a note -- pins the same way" },
      { settle: true, act: "pin", why: "let the second pin land" },
      { click: true, target: ["note", "03"], act: "pin", why: "click a note to open its card" },
      { click: true, target: ["pin"], act: "pin", why: "...and pin it from the card itself" },
      { settle: true, act: "pin", why: "let the third pin land" },
      { click: true, target: ["detailclose"], act: "pin", why: "close the card" },

      // github#23
      { click: true, target: ["id", "compact"], act: "compactaxis", why: "turn off the compact axis -- back to one width per month" },
      { settle: true, act: "compactaxis", why: "let the strip spread back out to plain calendar time" },
      { click: true, target: ["id", "compact"], act: "compactaxis", why: "...and back on, weighted by note count again" },
      { settle: true, act: "compactaxis", why: "let it compact again" },

      { drag: [-320, 0], target: ["brush", "to"], act: "timeline", why: "pull the range end back by hand -- the handle the intro just swept" },
      { settle: true, act: "timeline", why: "let the disc thin out" },
      { drag: [200, 0], target: ["brush", "from"], act: "timeline", why: "...and bring the range start forward" },
      { settle: true, act: "timeline", why: "let it thin further" },

      { drag: [-260, 0], target: ["brush", "window"], act: "timeline", why: "slide the heatmap window back on its own" },
      { settle: true, act: "timeline", why: "let the band redraw" },
      { drag: [170, 0], target: ["brush", "window"], act: "timeline", why: "...and forward again" },
      { settle: true, act: "timeline", why: "let the band redraw" },

      { hover: true, target: ["year", "busiest"], act: "timeline", why: "hover a year to find it on the disc" },
      { click: true, target: ["year", "busiest"], act: "timeline", why: "...and click it to filter to that year" },
      { settle: true, act: "timeline", why: "let the year land" },

      { click: true, target: ["id", "rangeall"], act: "timeline", why: "clear the date range" },
      { settle: true, act: "timeline", why: "let the whole vault come back" },

      { hover: true, target: ["busiest", "1"], act: "heatmap", why: "hover the busiest day" },
      { hover: true, target: ["busiest", "2"], act: "heatmap", why: "...and the next" },
      { hover: true, target: ["busiest", "3"], act: "heatmap", why: "...and the next" },

      { click: true, target: ["busiest", "1"], act: "heatmap", why: "click a day to keep it marked -- recoloured, haloed, nothing moved" },
      { settle: true, act: "heatmap", why: "let the mark ramp in" },
      { click: true, target: ["busiest", "1"], act: "heatmap", why: "...and click again to let it go" },
      { settle: true, act: "heatmap", why: "let it ramp back" },

      { click: true, target: ["eye", "06"], act: "folders", why: "hide a folder -- the wedges reallocate" },
      { settle: true, act: "folders", why: "let the wedges reallocate" },

      // github#14
      { click: true, target: ["eye", "06"], act: "folders", why: "show it again -- the camera follows, since nothing has zoomed or panned since load" },
      { settle: true, act: "folders", why: "let the camera and the wedges land together" },

      // github#34
      { rightclick: true, target: ["group", "#1"], act: "folders",
        why: "right-click the biggest folder for its own menu" },
      { settle: true, act: "folders", why: "let the menu open" },
      { click: true, target: ["ctxvis", ""], act: "folders",
        why: "hide it by default too, from the same menu" },
      { settle: true, act: "folders", why: "the wedges reallocate around a much bigger gap" },

      { rightclick: true, target: ["group", "#1"], act: "folders", why: "right-click it again" },
      { settle: true, act: "folders", why: "let the menu open" },
      { click: true, target: ["ctxvis", ""], act: "folders",
        why: "...and put the default back, so later acts start clean" },
      { settle: true, act: "folders", why: "the wedges settle back" },

      { click: true, target: ["only", "08"], act: "folders", why: "solo a single folder" },
      { settle: true, act: "folders", why: "let everything else recede" },

      { click: true, target: ["id", "allon"], act: "folders", why: "show everything again" },
      { settle: true, act: "folders", why: "let the whole disc come back" },

      { click: true, target: ["twisty", "03"], act: "subfolders", why: "unfold a folder to reach its subfolders" },

      { hover: true, target: ["group", "01"], act: "subfolders", why: "hover a folder to find it on the disc" },
      { hover: true, target: ["sub", "03/People"], act: "subfolders", why: "...and one subfolder inside it" },

      { click: true, target: ["sub", "03/People"], act: "subfolders", why: "click it instead: haloed AND pushed out" },
      { settle: true, act: "subfolders", why: "let the sub-wedge push out" },
      { click: true, target: ["sub", "03/People"], act: "subfolders", why: "...and let it back down" },
      { settle: true, act: "subfolders", why: "let it settle back" },

      { click: true, target: ["twisty", "03"], act: "subfolders", why: "fold the subfolders away again" },

      { click: true, target: ["twisty", "03"], act: "subfoldercolor", why: "unfold a folder to reach its subfolders" },
      { settle: true, act: "subfoldercolor", why: "let the subfolder rows land" },
      { rightclick: true, target: ["sub", "03/People"], act: "subfoldercolor",
        why: "right-click a subfolder for its own colour menu" },
      { settle: true, act: "subfoldercolor", why: "let the menu open" },
      { click: true, target: ["ctxswatch", "g5"], act: "subfoldercolor", why: "give it a colour of its own" },
      { settle: true, act: "subfoldercolor", why: "the disc repaints" },
      { rightclick: true, target: ["sub", "03/People"], act: "subfoldercolor", why: "right-click it again" },
      { settle: true, act: "subfoldercolor", why: "let the menu open" },
      { click: true, target: ["ctxswatch", ""], act: "subfoldercolor", why: "...and put it back to automatic" },
      { settle: true, act: "subfoldercolor", why: "let the tint snap back" },
      { click: true, target: ["twisty", "03"], act: "subfoldercolor", why: "fold the subfolders away again" },

      { wheel: 4, target: ["stage", "0.42,0.40"], act: "camera", why: "zoom in, a fifth per notch" },
      { settle: true, act: "camera", why: "let the last notch land" },

      { drag: [190, 110], target: ["stage", "0.55,0.45"], act: "camera", why: "drag the disc around" },
      { settle: true, act: "camera", why: "let the pan settle" },

      { dblclick: true, target: ["stage", "centre"], act: "camera", why: "double-click anywhere to reset" },
      { settle: true, act: "camera", why: "let the view come back" },
      { wheel: 3, target: ["stage", "0.60,0.55"], act: "camera", why: "zoom in again, to have something to reset" },
      { settle: true, act: "camera", why: "let it land" },
      { click: true, target: ["id", "reset"], act: "camera", why: "...and the reset button in the corner" },
      { settle: true, act: "camera", why: "let the view come back" },

      { rightclick: true, target: ["group", "01"], act: "colours", why: "right-click a folder for its own colour menu" },
      { settle: true, act: "colours", why: "let the menu open" },
      { click: true, target: ["ctxswatch", "g8"], act: "colours", why: "give it a colour of its own" },
      { settle: true, act: "colours", why: "the disc repaints -- no relayout, nothing moves" },
      { rightclick: true, target: ["group", "03"], act: "colours", why: "right-click another folder" },
      { settle: true, act: "colours", why: "let the menu open" },
      { click: true, target: ["ctxswatch", "g11"], act: "colours", why: "...and let it go grey" },
      { settle: true, act: "colours", why: "let the second repaint land" },
      { rightclick: true, target: ["group", "01"], act: "colours", why: "right-click the first folder again" },
      { settle: true, act: "colours", why: "let the menu open" },
      { click: true, target: ["ctxswatch", ""], act: "colours", why: "put it back to automatic" },
      { settle: true, act: "colours", why: "let it snap back" },
      { rightclick: true, target: ["group", "03"], act: "colours", why: "...and the second" },
      { settle: true, act: "colours", why: "let the menu open" },
      { click: true, target: ["ctxswatch", ""], act: "colours", why: "put it back to automatic too" },
      { settle: true, act: "colours", why: "let the palette snap back" },

      // github#3
      { rightclick: true, target: ["group", "(unlinked)"], act: "unlinked",
        why: "right-click the (unlinked) row -- always last in the legend" },
      { settle: true, act: "unlinked", why: "let the menu open" },
      { click: true, target: ["ctxbyfolder", ""], act: "unlinked",
        why: "keep unlinked notes separate instead of joining their folder" },
      { settle: true, act: "unlinked", why: "the wedges reallocate -- unlinked notes get their own wedge back" },

      { rightclick: true, target: ["group", "(unlinked)"], act: "unlinked",
        why: "right-click it again, now that it holds its own notes" },
      { settle: true, act: "unlinked", why: "let the menu open" },
      { click: true, target: ["ctxtint", ""], act: "unlinked",
        why: "colour them by their own folder anyway -- the row's swatch goes mixed" },
      { settle: true, act: "unlinked", why: "the dots repaint, and the row's swatch turns into a gradient" },

      { rightclick: true, target: ["group", "(unlinked)"], act: "unlinked", why: "right-click it once more" },
      { settle: true, act: "unlinked", why: "let the menu open" },
      { click: true, target: ["ctxtint", ""], act: "unlinked", why: "...put the colour back to the flat swatch" },
      { settle: true, act: "unlinked", why: "let the swatch go flat again" },
      { rightclick: true, target: ["group", "(unlinked)"], act: "unlinked", why: "right-click it a last time" },
      { settle: true, act: "unlinked", why: "let the menu open" },
      { click: true, target: ["ctxbyfolder", ""], act: "unlinked",
        why: "...and let unlinked notes rejoin their folders, back to the default" },
      { settle: true, act: "unlinked", why: "the row empties and greys out again, back where it started" },

      { park: true, act: "unlinked", why: "leave the final frame clean" },

      // github#34
      { rightclick: true, target: ["group", "#1"], act: "hiddenbydefault",
        why: "right-click the biggest folder for its own menu" },
      { settle: true, act: "hiddenbydefault", why: "let the menu open" },
      { click: true, target: ["ctxvis", ""], act: "hiddenbydefault",
        why: "hide it by default, from the legend instead of the settings panel" },
      { settle: true, act: "hiddenbydefault", why: "the wedges reallocate around a much bigger gap" },

      { rightclick: true, target: ["group", "#1"], act: "hiddenbydefault", why: "right-click it again" },
      { settle: true, act: "hiddenbydefault", why: "let the menu open" },
      { click: true, target: ["ctxvis", ""], act: "hiddenbydefault",
        why: "...and put the default back, so the clip leaves nothing behind" },
      { settle: true, act: "hiddenbydefault", why: "the wedges settle back" }
    ];
  }

  // github#34
  var FULL_RUN_EXCLUDES = ["subfoldercolor", "hiddenbydefault"];

  /** @returns {DemoBeat[]} */
  function demoFullStoryboard() {
    var beats = demoMode().filter(function (b) { return FULL_RUN_EXCLUDES.indexOf(b.act) === -1; });
    if (!beats[beats.length - 1].park) {
      beats = beats.concat([{ park: true, act: beats[beats.length - 1].act, why: "leave the final frame clean" }]);
    }
    return beats;
  }

  /** @param {string} name @returns {DemoBeat[]} */
  function demoAct(name) {
    var beats = demoMode().filter(function (b) { return b.act === name; });
    if (!beats.length) {
      console.warn("demo: no beats tagged act=\"" + name + "\" -- check the name against demoMode()");
      return [];
    }
    if (name === "intro") return beats;
    var out = [{ settle: true, act: name, why: "start from a disc at rest" }].concat(beats);
    if (!beats[beats.length - 1].park) {
      out = out.concat([{ park: true, act: name, why: "leave the final frame clean" }]);
    }
    return out;
  }

  var demoApi = {
    on: demoOn,
    doneTitle: DEMO_DONE_TITLE,
    storyboard: demoFullStoryboard,
    act: demoAct,
    busy: demoBusy,
    busyWhy: function () {
      return { play: !!play, cascade: !!cascadeRun, anim: !!anim,
               hover: !!hoverRaf, highlight: !!hlRaf };
    },
    where: demoWhere,
    cursorAt: demoCursorAt,
    cursorHide: demoCursorHide,
    hovered: function () { return state.hovered; },
    finish: /** @param {number} ms @param {unknown[]} [trace] */ function (ms, trace) {
      /** @type {Window & { __vgDemoDone?: { ms: number, trace: unknown[] } }} */ (window).__vgDemoDone = { ms: ms, trace: trace || [] };
      DOC.title = DEMO_DONE_TITLE;
      return true;
    }
  };

  /* ---- END: demo automation + debug API ---- */

  /* ------------------------------------------------------------------ go */

  var bootTimer = WIN.setTimeout(function () {
    if (dead) return;
    makeRenderer();
    API = window.__vg = { graph: graph,
                    readTheme: readTheme, get renderer() { return renderer; },
                    placeLogo: placeLogo,
                    palette: paletteInfo,
                    groupOrder: function () { return (order[state.dim] || []).slice(); },
                    groupCount: /** @param {string} g */ function (g) { return counts[g] || 0; },
                    slotOf: /** @param {string} g */ function (g) { return groupSlot[g] || ""; },
                    autoSlotOf: /** @param {string} g */ function (g) { return groupAutoSlot[g] || ""; },
                    setFolderColors: applyFolderColors,
                    setSubfolderColors: applySubfolderColors,
                    setFolderShown: applyFolderShown,
                    setPanEnabled: function (v) { return setPan(v !== false, false); },
                    // github#23
                    setCompactAxis: function (v) { return setCompactAxis(v !== false, false); },
                    // github#3
                    setUnlinkedByFolder: function (v) { return setUnlinkedByFolder(v !== false, false, true); },
                    setUnlinkedTintByFolder: function (v) { return setUnlinkedTintByFolder(v === true, false); },
                    applyHiddenDefaults: function () {
                      seedHidden();
                      buildLegend();
                      cascade(null, { colToggle: true });
                    },
                    heatBuild: heatBuild,
                    checkPlanParity: function () {
                      var shown = 0;
                      graph.forEachNode(function (id) { if (visible(id)) shown++; });
                      var ov = true;
                      var stat = buildWedgePlan(ov, function (id) { return visible(id) ? 1 : 0; });
                      var live = buildWedgePlan(ov, function (id) { return alpha[id] || 0; });
                      /** @type {Record<string, object>} */
                      var diffs = {};
                      /** @param {Plan} p @returns {Record<string, number>} */
                      var rows = function (p) { /** @type {Record<string, number>} */ var m = {}; p.cells.forEach(function (c) { m[c.k] = c.rows; }); return m; };
                      var rs = rows(stat), rl = rows(live);
                      Object.keys(rs).concat(Object.keys(rl)).forEach(function (k) {
                        if (rs[k] !== rl[k]) diffs[k] = { staticPlan: rs[k], livePlan: rl[k] };
                      });
                      var out = {
                        shown: shown, threshold: Math.round(graph.order * REPACK_BELOW), onlyVisible: ov,
                        staticMaxR: Math.round(stat.maxR), liveMaxR: Math.round(live.maxR),
                        maxRMatches: Math.round(stat.maxR) === Math.round(live.maxR),
                        cellsStatic: stat.cells.length, cellsLive: live.cells.length,
                        rowDiffs: diffs, parityOK: Object.keys(diffs).length === 0 &&
                          Math.round(stat.maxR) === Math.round(live.maxR)
                      };
                      return out;
                    },
                    checkFocusWeb: function () {
                      var best = null, bd = -1;
                      graph.forEachNode(function (id) {
                        var d = renderer.getNodeDisplayData(id);
                        if (!d || d.hidden) return;
                        if (graph.degree(id) > bd) { bd = graph.degree(id); best = id; }
                      });
                      var keepSel = state.selected, keepHov = state.hovered;
                      state.selected = best; state.hovered = null;
                      renderer.refresh({ skipIndexation: true }); renderer.render();
                      var cv = renderer.getCanvases();
                      var order = ["edges", "nodes", "edgeLabels", "labels", "hovers", "hoverNodes"];
                      var W = cv.nodes.width, H = cv.nodes.height, dpr = W / renderer.getDimensions().width;
                      var off = DOC.createElement("canvas"); off.width = W; off.height = H;
                      var ctx = off.getContext("2d");
                      ctx.fillStyle = css("--surface-1"); ctx.fillRect(0, 0, W, H);
                      order.forEach(function (k) { if (cv[k]) ctx.drawImage(cv[k], 0, 0); });
                      var img = ctx.getImageData(0, 0, W, H).data;
                      var hov = DOC.createElement("canvas"); hov.width = W; hov.height = H;
                      var hctx = hov.getContext("2d"); hctx.drawImage(cv.hovers, 0, 0);
                      var himg = hctx.getImageData(0, 0, W, H).data;
                      /** @param {Uint8ClampedArray} data @param {number} x @param {number} y @returns {number[] | null} */
                      var at = function (data, x, y) {
                        var X = Math.round(x * dpr), Y = Math.round(y * dpr);
                        if (X < 0 || Y < 0 || X >= W || Y >= H) return null;
                        var i = (Y * W + X) * 4;
                        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
                      };
                      var hi = toRgb(THEME.edgeHi), dm = toRgb(THEME.dim);
                      /** @param {number[] | null} c @param {number[]} t */
                      var dist = function (c, t) { return c ? Math.abs(c[0] - t[0]) + Math.abs(c[1] - t[1]) + Math.abs(c[2] - t[2]) : 1e9; };
                      var set = focusSet() || {};
                      /** @type {{ x: number, y: number, rad: number }[]} */
                      var dims = [];
                      graph.forEachNode(function (id) {
                        if (set[id]) return;
                        var d = renderer.getNodeDisplayData(id);
                        if (!d || d.hidden) return;
                        var p = renderer.graphToViewport(graph.getNodeAttributes(id));
                        dims.push({ x: p.x, y: p.y, rad: renderer.scaleSize(d.size) });
                      });
                      var res = { node: best, degree: bd, edges: 0, samples: 0, geomGaps: 0,
                                  blueAtGaps: 0, dimAtGaps: 0, underLabel: 0, otherAtGaps: 0 };
                      /** @type {Record<string, boolean>} */
                      var seen = dict();
                      Object.keys(set).forEach(function (n) {
                        graph.forEachEdge(n, function (e, attrs, s, t) {
                          if (seen[e] || !set[s] || !set[t]) return;
                          seen[e] = true;
                          var geo = edgeCurveGeom(e, s, t);
                          if (!geo) return;
                          res.edges++;
                          var ps = geo.ps, pt = geo.pt, cp = geo.cp;
                          for (var u = 0.05; u <= 0.95; u += 0.01) {
                            var x = (1 - u) * (1 - u) * ps.x + 2 * (1 - u) * u * cp.x + u * u * pt.x;
                            var y = (1 - u) * (1 - u) * ps.y + 2 * (1 - u) * u * cp.y + u * u * pt.y;
                            res.samples++;
                            var covered = dims.some(function (d) {
                              var ddx = d.x - x, ddy = d.y - y;
                              return ddx * ddx + ddy * ddy <= (d.rad - 0.5) * (d.rad - 0.5);
                            });
                            if (!covered) continue;
                            res.geomGaps++;
                            var c = at(img, x, y), blue = dist(c, hi) < 60;
                            for (var ox = -1; ox <= 1 && !blue; ox++) {
                              for (var oy = -1; oy <= 1 && !blue; oy++) {
                                if (ox || oy) blue = dist(at(img, x + ox / dpr, y + oy / dpr), hi) < 60;
                              }
                            }
                            var h = at(himg, x, y);
                            if (blue) res.blueAtGaps++;
                            else if (h && h[3] >= 250) res.underLabel++;
                            else if (dist(c, dm) < 60) res.dimAtGaps++;
                            else res.otherAtGaps++;
                          }
                        });
                      });
                      state.selected = keepSel; state.hovered = keepHov; renderer.refresh();
                      res.webOK = res.dimAtGaps === 0;
                      return res;
                    },
                    debugDump: function () {
                      var a0 = renderer ? renderer.graphToViewport({ x: 0, y: 0 }) : null;
                      var b0 = renderer ? renderer.graphToViewport({ x: UNIT, y: 0 }) : null;
                      var pxPerRow = a0 && b0 ? Math.hypot(b0.x - a0.x, b0.y - a0.y) : 0;
                      var perPx = pxPerRow > 0 ? UNIT / pxPerRow : 0;
                      /** @type {{ r: number, th: number, rad: number, g: string }[]} */
                      var pts = [];
                      graph.forEachNode(function (id, a) {
                        if ((alpha[id] || 0) <= 0.004) return;
                        var d = renderer && renderer.getNodeDisplayData(id);
                        pts.push({ r: Math.hypot(a.x, a.y), th: Math.atan2(a.y, a.x),
                                   rad: (d && renderer ? renderer.scaleSize(d.size)
                                                       : 4) * perPx, g: a.folder });
                      });
                      pts.sort(function (x, y) { return x.r - y.r; });
                      var gi = 0, gap = 0;
                      for (var i = 1; i < pts.length; i++) {
                        var gg = pts[i].r - pts[i - 1].r;
                        if (gg > gap) { gap = gg; gi = i; }
                      }
                      var r3 = function (v) { return Math.round(v * 1000) / 1000; };
                      var r3n = function (v) { return v === undefined || v === null ? null : r3(v); };
                      /** @param {{ r: number, th: number, rad: number, g: string }[]} arr */
                      var bandStat = function (arr) {
                        if (!arr.length) return null;
                        /** @type {Record<string, { r: number, th: number, rad: number, g: string }[]>} */
                        var rows = {};
                        /** @type {number[]} */
                        var steps = [];
                        /** @type {number[]} */
                        var clears = [];
                        var worst = 1e9;
                        arr.forEach(function (q) {
                          var k = Math.round(q.r / 8) * 8;
                          (rows[k] || (rows[k] = [])).push(q);
                        });
                        Object.keys(rows).forEach(function (k) {
                          var row = rows[k].slice().sort(function (x, y) { return x.th - y.th; });
                          for (var i = 1; i < row.length; i++) {
                            var arc = (row[i].th - row[i - 1].th) * (+k);
                            if (!(arc > 1 && arc < 3000)) continue;
                            steps.push(arc);
                            var cl = arc - row[i].rad - row[i - 1].rad;
                            clears.push(cl);
                            if (cl < worst) worst = cl;
                          }
                        });
                        steps.sort(function (x, y) { return x - y; });
                        var q = function (f) {
                          return steps.length ? Math.round(steps[Math.floor(steps.length * f)]) : 0;
                        };
                        var radii = arr.map(function (x) { return x.rad; }).sort(function (x, y) { return x - y; });
                        return {
                          notes: arr.length, rows: Object.keys(rows).length,
                          inner: Math.round(arr[0].r), outer: Math.round(arr[arr.length - 1].r),
                          step35: q(0.35), step95: q(0.95),
                          channelRatio: q(0.35) ? r3(q(0.95) / q(0.35)) : 0,
                          dotRadius: { min: Math.round(radii[0]),
                                       med: Math.round(radii[Math.floor(radii.length / 2)]),
                                       max: Math.round(radii[radii.length - 1]) },
                          worstPairClearance: worst === 1e9 ? null : Math.round(worst),
                          overlappingPairs: clears.filter(function (c) { return c < 0; }).length,
                        };
                      };
                      var cam = renderer ? renderer.getCamera().getState() : null;
                      var hidden = Object.keys(state.hidden[state.dim] || {}).filter(function (k) {
                        return (state.hidden[state.dim] || {})[k];
                      });
                      return {
                        note: "vault-graph debug dump -- paste this back verbatim",
                        vault: { name: DATA.vault || "", notes: graph.order,
                                 links: EDGE_TOTAL, linksShown: EDGE_SHOWN, lazyEdges: lazyEdges,
                                 generated: DATA.generated || "" },
                        screen: { win: WIN.innerWidth + "x" + WIN.innerHeight,
                                  dpr: WIN.devicePixelRatio || 1,
                                  stage: $("canvas") ? Math.round($("canvas").clientWidth) + "x" +
                                         Math.round($("canvas").clientHeight) : "",
                                  pxPerRow: r3(pxPerRow) },
                        camera: cam ? { x: r3(cam.x), y: r3(cam.y), ratio: r3(cam.ratio) } : null,
                        filters: { hiddenFolders: hidden,
                                   hiddenSub: Object.keys(state.hiddenSub || {}),
                                   range: rangeLabel(),
                                   from: state.from, to: state.to, heatEnd: state.heatEnd,
                                   timelineUntil: state.until,
                                   markDay: state.markDay, shown: pts.length },
                        room: { i: r3n(bandOf("i").room), o: r3n(bandOf("o").room) },
                        minArcDeg: r3(lastMinArc * 180 / Math.PI),
                        spacing: { spOuter: r3(bandOf("o").sp),
                                   spInner: r3(bandOf("i").sp),
                                   rowsOuter: bandOf("o").rows,
                                   rowsInner: bandOf("i").rows,
                                   pitchOuterUnits: r3(pitchUnits("o")),
                                   pitchInnerUnits: r3(pitchUnits("i")) },
                        seam: { outerDeg: bandOf("o").gapDeg, innerDeg: bandOf("i").gapDeg,
                                nGOuter: bandOf("o").nG, nGInner: bandOf("i").nG,
                                nSubOuter: bandOf("o").nSub, nSubInner: bandOf("i").nSub,
                                fallOuter: r3(seamFall("o")), fallInner: r3(seamFall("i")) },
                        locked: geomLock ? { r0: r3(geomLock.r0), rOuter: r3(geomLock.rOuter),
                                             maxR: r3(geomLock.maxR), rows: geomLock.rows,
                                             bandTotal: geomLock.bandTotal } : null,
                        bands: { inner: bandStat(pts.slice(0, gi)), outer: bandStat(pts.slice(gi)) },
                        dots: { ofPitch: r3(DOT_OF_PITCH), minPx: DOT_MIN_PX,
                                maxSpread: DOT_MAX_SPREAD, m: r3(bandOf("o").ramp.m),
                                b: r3(bandOf("o").ramp.b), lo: r3(bandOf("o").ramp.lo) },
                      };
                    },
    };
    /* ---- BEGIN: demo automation + debug API -- stripped from the plugin build, see scripts/build-plugin.mjs (stripDemoAndDebug) ---- */
    var debugAPI = {
                    state: state,
                    ringsLayout: ringsLayout, visible: visible, groupOf: groupOf,
                    alpha: alpha, cascade: cascade, syncAlpha: syncAlpha,
                    syncLazyEdges: syncLazyEdges,
                    get lazyEdges() { return lazyEdges; },
                    isOrphan: isOrphan,
                    wedgeDebug: wedgeDebug, wedgeEdges: wedgeEdges,
                    bandRef: function () { return geomLock ? geomLock.bandR : null; },
                    wedgeTrace: /** @param {number} [rLattice] */ function (rLattice) {
                      DBG.trace = []; DBG.traceR = rLattice;
                      drawWedgeDebug();
                      var out = DBG.trace; DBG.trace = null;
                      return out;
                    },
                    wedgeCells: function () { return (DBG.cells || []).map(function (c) {
                      return { g: c.g, k: c.k, band: c.inner ? "i" : "o", seams: c.seams,
                               f0: c.f0, f1: c.f1, pLead: c.pLead, pTrail: c.pTrail,
                               n: (c.ids || []).length }; }); },
                    seamDeg: /** @param {string} bk */ function (bk) { return bandOf(bk).gapDeg || 0; },
                    seamNB: /** @param {string} bk */ function (bk) { return (bandOf(bk).nG || 0) + (bandOf(bk).nSub || 0); },
                    clearAlpha: clearAlpha, buildWedgePlan: buildWedgePlan,
                    applyLayout: applyLayout, isHighlighted: isHighlighted,
                    ringColors: ringColors,
                    colorOf: colorOf,
                    nodeColor: nodeColor,
                    isArchiveGroup: isArchiveGroup,
                    get folderColors() {
                      return Object.assign(dict(), folderColors);
                    },
                    get subfolderColors() {
                      return Object.assign(dict(), subfolderColors);
                    },
                    subColorOf: /** @param {string} folder @param {string} [sub] */ function (folder, sub) {
                      return subShade[folder + "/" + (sub || "")] || colorOf(folder);
                    },
                    subSlotOf: /** @param {string} folder @param {string} [sub] */ function (folder, sub) {
                      return subSlot[folder + "/" + (sub || "")] || "";
                    },
                    subOrderOf: /** @param {string} g */ function (g) { return (subOrder[g] || []).slice(); },
                    subCountOf: function (g, sub) { return subCount[g + "/" + (sub || "")] || 0; },
                    get folderShown() {
                      return Object.assign(dict(), folderShown);
                    },
                    get panEnabled() { return panEnabled; },
                    get compactAxis() { return compactAxis; },
                    get unlinkedByFolder() { return unlinkedByFolder; },
                    get unlinkedTintByFolder() { return unlinkedTintByFolder; },
                    get unlinkedTintColors() { return unlinkedTintColors.slice(); },
                    get subTailRank() { return SUB_SLOTS - 1; },
                    hiddenByDefault: hiddenByDefault,
                    heatDraw: heatDraw,
                    get heat() { return heat; },
                    get heatCell() { return HEAT_CELL_MAX; },
                    set heatCell(v) {
                      HEAT_CELL_MAX = Math.max(HEAT_CELL_MIN, +v || HEAT_CELL_MAX);
                      heatBuild();
                    },
                    // github#42
                    edgeInk: function () {
                      if (!renderer) return "no renderer";
                      renderer.render();
                      var cv = renderer.getCanvases();
                      if (!cv.edges) return "no edges canvas";
                      var W = cv.edges.width, H = cv.edges.height;
                      var off = DOC.createElement("canvas"); off.width = W; off.height = H;
                      var ctx = off.getContext("2d");
                      ctx.drawImage(cv.edges, 0, 0);
                      var d = ctx.getImageData(0, 0, W, H).data;
                      var sum = 0, lit = 0;
                      for (var i = 3; i < d.length; i += 4) {
                        if (d[i]) { sum += d[i]; lit++; }
                      }
                      var px = W * H;
                      return {
                        ink: Math.round(1e5 * sum / 255 / px) / 1e5,
                        litPct: Math.round(1e4 * lit / px) / 100,
                        meanAlphaOfLit: lit ? Math.round(100 * sum / 255 / lit) / 100 : 0,
                        edges: graph.size, px: px,
                      };
                    },
                    edgeReport: /** @param {string} [id] */ function (id) {
                      if (!renderer) return "no renderer";
                      var floor = renderer.getSetting("minEdgeThickness");
                      /** @type {number[]} */
                      var px = [];
                      /** @type {number[]} */
                      var raw = [];
                      /** @param {string} e */
                      var take = function (e) {
                        var ed = renderer.getEdgeDisplayData(e);
                        if (!ed || ed.hidden) return;
                        raw.push(ed.size);
                        px.push(edgePx(ed.size));
                      };
                      if (id === undefined) graph.forEachEdge(take); else graph.forEachEdge(id, take);
                      if (!px.length) return { ratio: renderer.getCamera().getState().ratio, shown: 0 };
                      var nd = id === undefined ? null : renderer.getNodeDisplayData(id);
                      var r2 = function (v) { return Math.round(v * 100) / 100; };
                      return {
                        ratio: r2(renderer.getCamera().getState().ratio),
                        mult: r2(edgeMult), capPx: EDGE_MAX_PX, floorPx: floor,
                        shown: px.length,
                        rawMin: r2(Math.min.apply(null, raw)), rawMax: r2(Math.max.apply(null, raw)),
                        minPx: r2(Math.min.apply(null, px)), maxPx: r2(Math.max.apply(null, px)),
                        dotPx: nd ? r2(2 * renderer.scaleSize(nd.size)) : null,
                        ribbonPx: r2(px.reduce(function (a, v) { return a + v; }, 0)),
                      };
                    },
                    heatReport: function () {
                      if (!heat) return "not built";
                      heatCompute();
                      var lv = [0, 0, 0, 0, 0];
                      var nz = 0;
                      /** @type {{ day: string, n: number } | null} */
                      var top = null;
                      heat.keys.forEach(function (k) {
                        var d = heat.days[k];
                        if (d.n <= 0.004) return;
                        nz++;
                        lv[heatLevel(d.n)]++;
                        if (!top || d.n > top.n) top = { day: k, n: Math.round(d.n) };
                      });
                      var out = {
                        cell: heat.cell, cols: heat.cols, canvas: heat.w + "x" + heat.h,
                        cuts: heat.cuts, nMax: heat.nMax,
                        daysWithNotes: nz, byLevel: lv,
                        blocksAtBusiest: heat.days[top ? top.day : ""]
                          ? heat.days[top.day].parts.length : 0,
                        pxPerNoteAtBusiest: top
                          ? +((heat.cell * heat.cell) / top.n).toFixed(2) : null,
                        busiest: top, inWindow: heat.keys.reduce(function (a, k) {
                          return a + heat.days[k].ids.length; }, 0),
                        earlier: heat.before, later: heat.after, undated: heat.undated,
                        markDay: state.markDay, hoverDay: state.hoverDay
                      };
                      return out;
                    },
                    bandColors: bandColors, outerPresence: outerPresence,
                    get planMs() { return planMs; },
                    get fullRing() { return fullRing; },
                    set fullRing(v) { fullRing = v; },
                    get timeScale() { return TIME_SCALE; },
                    set timeScale(v) { TIME_SCALE = +v > 0 ? +v : 1; },
                    get radialEase() { return RADIAL_EASE; },
                    set radialEase(v) { RADIAL_EASE = +v > 0 ? Math.min(1, +v) : 1; },
                    get subGap() { return SUB_GAP; },
                    set subGap(v) { SUB_GAP = +v; },
                    get edgePadArc() { return EDGE_PAD_ARC; },
                    set edgePadArc(v) { EDGE_PAD_ARC = +v; },
                    get edgePadMax() { return EDGE_PAD_MAX; },
                    set edgePadMax(v) { EDGE_PAD_MAX = +v; },
                    checkZeroWeightInvariance: function () {
                      /** @param {string} id */
                      var W = function (id) { return visible(id) ? 1 : 0; };
                      var save = planKeep;
                      planKeep = function (id) { return visible(id); };
                      var lean = buildWedgePlan(true, W);
                      planKeep = function () { return true; };
                      var padded = buildWedgePlan(true, W);
                      planKeep = save;
                      /** @param {Plan} p @returns {Record<string, number>} */
                      var rows = function (p) { /** @type {Record<string, number>} */ var m = {}; p.cells.forEach(function (c) { m[c.k] = c.rows; }); return m; };
                      var a = rows(lean), b = rows(padded), diffs = {};
                      // github#5
                      Object.keys(a).concat(Object.keys(b)).forEach(function (k) {
                        if ((a[k] || 0) !== (b[k] || 0)) {
                          diffs[k] = { withoutZeros: a[k] || 0, withZeros: b[k] || 0 };
                        }
                      });
                      var out = {
                        leanMaxR: Math.round(lean.maxR), paddedMaxR: Math.round(padded.maxR),
                        maxRMatches: Math.round(lean.maxR) === Math.round(padded.maxR),
                        cellsLean: lean.cells.length, cellsPadded: padded.cells.length,
                        rowDiffs: diffs,
                        invariantOK: Object.keys(diffs).length === 0 &&
                                     Math.round(lean.maxR) === Math.round(padded.maxR)
                      };
                      return out;
                    },
                    // github#13
                    densityReport: function () {
                      var shown = 0, lit = 0, shownI = 0, shownO = 0;
                      graph.forEachNode(function (id) {
                        if (visible(id)) {
                          shown++;
                          if (bandLock && bandLock[groupOf(id)]) shownI++; else shownO++;
                        }
                        if ((alpha[id] || 0) > 0.004) lit++;
                      });
                      var pitchPx = null, pitchPxI = null, unitPx = null;
                      if (renderer) {
                        var a = renderer.graphToViewport({ x: 0, y: 0 });
                        var u = renderer.graphToViewport({ x: UNIT, y: 0 });
                        unitPx = Math.hypot(u.x - a.x, u.y - a.y);
                        var b = renderer.graphToViewport({ x: UNIT * (bandOf("o").sp || 1), y: 0 });
                        pitchPx = Math.hypot(b.x - a.x, b.y - a.y);
                        var bi = renderer.graphToViewport({
                          x: UNIT * (bandOf("i").sp || 1) * bandScale("i"), y: 0 });
                        pitchPxI = Math.hypot(bi.x - a.x, bi.y - a.y);
                      }
                      /** @type {number[]} */
                      var sizes = [];
                      if (renderer) {
                        graph.forEachNode(function (id) {
                          if (!visible(id)) return;
                          var d = renderer.getNodeDisplayData(id);
                          if (d && d.size > 0) sizes.push(d.size);
                        });
                        sizes.sort(function (x, y) { return x - y; });
                      }
                      var med = sizes.length ? sizes[Math.floor(sizes.length / 2)] : null;
                      var r3 = function (v) { return v === null ? null : Math.round(v * 1000) / 1000; };
                      return {
                        shown: shown, lit: lit, total: graph.order,
                        lockedMaxR: geomLock ? Math.round(geomLock.maxR) : null,
                        liveMaxR: Math.round(lastMaxR || 0),
                        reach: geomLock && geomLock.maxR
                          ? r3((lastMaxR || 0) / geomLock.maxR) : null,
                        r0: geomLock ? r3(geomLock.r0) : null,
                        holeShare: lastMaxR ? r3((geomLock ? geomLock.r0 : 0) / lastMaxR) : null,
                        sp: r3(bandOf("o").sp),
                        unitPx: r3(unitPx),
                        pitchPx: r3(pitchPx),
                        shownInner: shownI, shownOuter: shownO,
                        pitchPxInner: r3(pitchPxI),
                        pitchRoot: pitchPx ? r3(pitchPx * Math.sqrt(Math.max(1, shown))) : null,
                        pitchRootOuter: pitchPx
                          ? r3(pitchPx * Math.sqrt(Math.max(1, shownO))) : null,
                        pitchRootInner: pitchPxI
                          ? r3(pitchPxI * Math.sqrt(Math.max(1, shownI))) : null,
                        sizeScale: r3(sizeScale),
                        sizeMedian: r3(med),
                        sizeMin: r3(sizes.length ? sizes[0] : null),
                        sizeMax: r3(sizes.length ? sizes[sizes.length - 1] : null),
                        cameraRatio: r3(renderer ? renderer.getCamera().ratio : null)
                      };
                    },
                    probe: function (on) {
                      probe = (on === false) ? null
                        : { t0: NOW(), samples: [], prevAng: null, prevR: null,
                            set: (function () {
                              /** @type {Record<string, number>} */
                              var m = dict();
                              graph.forEachNode(function (id) {
                                if ((alpha[id] || 0) >= 0.999) m[id] = 1;
                              });
                              return m;
                            })(),
                            watch: arguments.length > 1 ? String(arguments[1]) : null,
                            watched: null, watchSeries: [] };
                      return probe ? "recording" : "off";
                    },
                    probeReport: function () {
                      if (!probe || !probe.samples.length) return "nothing recorded -- call __vg.probe(true) first";
                      var s = probe.samples, worst = { inner: 0, outer: 0 }, at = { inner: 0, outer: 0 };
                      var tanWorst = 0, tanAt = 0, tanWho = null, ngWorst = 0, ngAt = 0;
                      var startWorst = 0, startAt = 0, startG = null;
                      for (var i = 1; i < s.length; i++) {
                        var di = Math.abs(s[i].innerMax - s[i - 1].innerMax);
                        var doo = Math.abs(s[i].outerMax - s[i - 1].outerMax);
                        if (di > worst.inner) { worst.inner = di; at.inner = s[i].ms; }
                        if (doo > worst.outer) { worst.outer = doo; at.outer = s[i].ms; }
                        if (s[i].tanStep > tanWorst) { tanWorst = s[i].tanStep; tanAt = s[i].ms; tanWho = s[i].tanId; }
                        var ds = 0;
                        /** @type {string | null} */
                        var dsG = null;
                        Object.keys(s[i].starts || {}).forEach(function (g) {
                          var was = /** @type {Record<string, number>} */ ((s[i - 1].starts || {}))[g];
                          if (was === undefined) return;
                          var dd = Math.abs(s[i].starts[g] - was);
                          if (dd > 180) dd = 360 - dd;
                          if (dd > ds) { ds = dd; dsG = g; }
                        });
                        if (ds > startWorst) { startWorst = ds; startAt = s[i].ms; startG = dsG; }
                        var dng = Math.max(Math.abs(s[i].ngO - s[i - 1].ngO), Math.abs(s[i].ngI - s[i - 1].ngI));
                        if (dng > ngWorst) { ngWorst = dng; ngAt = s[i].ms; }
                      }
                      var out = {
                        frames: s.length,
                        spanMs: s[s.length - 1].ms,
                        radMaxStep: (function () {
                          var w = 0, who = null, when = 0;
                          for (var j = 0; j < s.length; j++) {
                            if (s[j].radStep > w) { w = s[j].radStep; who = s[j].radId; when = s[j].ms; }
                          }
                          return { step: w, node: who, atMs: when };
                        })(),
                        radMeanStep: (function () {
                          var t = 0, k = 0;
                          for (var j = 0; j < s.length; j++) { t += s[j].radMean || 0; k++; }
                          return Math.round(k ? t / k : 0);
                        })(),
                        innerMaxStep: worst.inner, innerStepAtMs: at.inner,
                        outerMaxStep: worst.outer, outerStepAtMs: at.outer,
                        // github#13
                        innerTravel: Math.abs(s[s.length - 1].innerMax - s[0].innerMax),
                        outerTravel: Math.abs(s[s.length - 1].outerMax - s[0].outerMax),
                        innerPath: (function () {
                          var t = 0;
                          for (var j = 1; j < s.length; j++) t += Math.abs(s[j].innerMax - s[j - 1].innerMax);
                          return Math.round(t);
                        })(),
                        outerPath: (function () {
                          var t = 0;
                          for (var j = 1; j < s.length; j++) t += Math.abs(s[j].outerMax - s[j - 1].outerMax);
                          return Math.round(t);
                        })(),
                        tanMaxStep: tanWorst, tanStepAtMs: tanAt, tanStepNode: tanWho,
                        settleStep: (function () {
                          for (var j = 1; j < s.length; j++) {
                            if (s[j].tag === "settled") {
                              return { tan: s[j].tanStep, over: s[j].tanOver,
                                       mean: s[j].tanMean,
                                       ngBefore: s[j - 1].ngO, ngAfter: s[j].ngO,
                                       startsMoved: (function () {
                                         var m = 0, g = null, a = s[j].starts || {}, b = s[j - 1].starts || {};
                                         Object.keys(a).forEach(function (k) {
                                           if (b[k] === undefined) return;
                                           var d = Math.abs(a[k] - b[k]);
                                           if (d > 180) d = 360 - d;
                                           if (d > m) { m = d; g = k; }
                                         });
                                         return { deg: Math.round(m * 1000) / 1000, group: g };
                                       })() };
                            }
                          }
                          return null;
                        })(),
                        startMaxStep: Math.round(startWorst * 1000) / 1000,
                        startStepAtMs: startAt, startStepGroup: startG,
                        ngMaxStep: Math.round(ngWorst * 1000) / 1000, ngStepAtMs: ngAt,
                        first: s[0], last: s[s.length - 1], samples: s,
                        watch: probe.watch, watchSeries: probe.watchSeries
                      };
                      return out;
                    },
                    pushReport: function () {
                      /** @type {string[]} */
                      var pushed = [];
                      /** @type {string[]} */
                      var haloed = [];
                      graph.forEachNode(function (id) {
                        if (isPushed(id)) pushed.push(id);
                        if (isHighlighted(id)) haloed.push(id);
                      });
                      /** @param {string[]} ids */
                      var byPath = function (ids) {
                        /** @type {Record<string, number>} */
                        var m = dict();
                        ids.forEach(function (id) {
                          var a = graph.getNodeAttributes(id);
                          var k = a.folder + "/" + (a.dirs || []).join("/");
                          m[k] = (m[k] || 0) + 1;
                        });
                        return m;
                      };
                      var out = {
                        highlightSubKeys: Object.keys(state.highlightSub),
                        highlightGroups: Object.keys(state.highlight),
                        pushedCount: pushed.length,
                        pushedByPath: byPath(pushed),
                        haloedCount: haloed.length,
                        haloedByPath: byPath(haloed)
                      };
                      return out;
                    },
                    demo: demoApi,
                    get hoverT() { return hoverT; },
                    get hoverBusy() { return !!hoverRaf; },
                    // github#14
                    get camAtRest() { return camAtRest; },
                    hl: hl,
                    get hlBusy() { return !!hlRaf; },
                    get dateSpan() { return dateSpan; },
                    setRange: /** @param {string} [fromISO] @param {string} [toISO] */ function (fromISO, toISO) {
                      state.from = fromISO ? heatParse(fromISO) : null;
                      state.to = toISO ? heatParse(toISO) : null;
                      applyRange();
                      heatDraw();
                    },
                    setHeatEnd: /** @param {string} [iso] */ function (iso) {
                      state.heatEnd = iso ? heatParse(iso) : null;
                      heatBuild(); drawDateUI(); heatDraw();
                    },
                    // github#12
                    pin: /** @param {string} id */ function (id) { togglePin(id); },
                    pinned: function () { return state.pinned.slice(); },
                    clearPins: function () { state.pinned = []; hubChanged(false); },
                    lastCascade: function () { return lastCascade; },
                    ribbonXOf: /** @param {number} ms */ function (ms) { return ribbonX(ms, ribbonW()); },
                    brushNow: function () {
                      if (!dateSpan) return null;
                      var w = ribbonW(), e = brushEnds();
                      return { from: e[0], to: e[1], fromISO: isoDay(e[0]), toISO: isoDay(e[1]),
                               x0: ribbonX(e[0], w), x1: ribbonX(e[1], w), w: w,
                               sweeping: brushSweep !== null };
                    },
                    rings: function () {
                      if (!geomLock) return null;
                      return {
                        r0: geomLock.r0 * INNER_SCALE * UNIT,
                        rInnerOuter: (geomLock.r0 + (geomLock.maxR - geomLock.rOuter)) * INNER_SCALE * UNIT,
                        rOuter: geomLock.rOuter * UNIT,
                        maxR: geomLock.maxR * UNIT
                      };
                    },
                    lastGap: function () {
                      return { ngI: bandOf("i").nG, ngO: bandOf("o").nG,
                               gapDegI: bandOf("i").gapDeg, gapDegO: bandOf("o").gapDeg };
                    },
                    rangeReport: function () {
                      var lit = 0, dated = 0;
                      /** @type {Record<string, number>} */
                      var byYear = dict();
                      graph.forEachNode(function (id) {
                        if ((alpha[id] || 0) > 0.004) lit++;
                        if (tlMs[id] !== undefined) {
                          dated++;
                          var y = new Date(tlMs[id]).getUTCFullYear();
                          byYear[y] = (byYear[y] || 0) + 1;
                        }
                      });
                      return { byYear: byYear,
                               from: state.from, to: state.to, heatEnd: state.heatEnd,
                               lit: lit, dated: dated,
                               total: graph.order, label: rangeLabel() };
                    },
                    // github#31
                    // github#3
                    relayout: function () { hardRelayout(false); },
                    // github#62
                    destroy: destroy,
    };
    Object.defineProperties(window.__vg, Object.getOwnPropertyDescriptors(debugAPI));
    /* ---- END: demo automation + debug API ---- */
    seedPins();
    buildTimeline();
    buildSearch(); buildTools(); buildStats();
    if (LOGO_MASK) {
      var mu = 'url("' + LOGO_MASK + '")';
      $("logo").style.webkitMaskImage = mu;
      $("logo").style.maskImage = mu;
      var fade = "radial-gradient(circle at 50% 50%, #000 " + LOGO_INNER_FADE.split(",")[0].trim() +
                 ", transparent " + LOGO_INNER_FADE.split(",")[1].trim() + ")";
      var eli = $("logoInner");
      eli.style.webkitMaskImage = mu + ", " + fade;
      eli.style.maskImage = mu + ", " + fade;
      logoMaskReady = true;
      logoMaskImg = new Image();
      logoMaskImg.src = LOGO_MASK;
    }
    regroup();
    buildHeatmapUI();
    heatBuild();
    buildDateUI();
    fit();
    syncSizeScale();
    var hidden = DOC
      ? (typeof DOC.visibilityState === "string"
          ? DOC.visibilityState === "hidden" : !!DOC.hidden)
      : false;
    if (hidden && !demoOn() && !restOn()) introOwed = true;
    if (demoOn() || restOn() || hidden) {
      timelineFrame(true);
    } else {
      playTimeline();
    }
    $("busy").hidden = true;
  }, 20);
  // github#62
  return { get api() { return API; }, get ready() { return API !== null; }, destroy: destroy };

  function destroy() {
    if (dead) return;
    dead = true;
    WIN.clearTimeout(bootTimer);
    if (play) {
      WIN.cancelAnimationFrame(play.raf);
      if (play.guard) WIN.clearTimeout(play.guard);
      play = null;
    }
    if (cascadeRun) {
      WIN.cancelAnimationFrame(cascadeRun.raf);
      WIN.clearTimeout(cascadeRun.guard);
      cascadeRun = null;
    }
    if (anim) { WIN.cancelAnimationFrame(anim); anim = null; }
    if (animGuard) { WIN.clearTimeout(animGuard); animGuard = null; }
    if (hoverRaf) { WIN.cancelAnimationFrame(hoverRaf); hoverRaf = 0; }
    if (hlRaf) { WIN.cancelAnimationFrame(hlRaf); hlRaf = 0; }
    if (colorRaf) { WIN.cancelAnimationFrame(colorRaf); colorRaf = 0; }
    for (var i = onDestroy.length - 1; i >= 0; i--) {
      try { onDestroy[i](); } catch { }
    }
    onDestroy.length = 0;
    if (renderer) { try { renderer.kill(); } catch { } }
    if (window.__vg === API) delete window.__vg;
    API = null;
  }
}

export { mountVaultGraph };
