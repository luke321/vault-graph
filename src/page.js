/**
 * Mount the disc into one element.
 *
 *   mountVaultGraph(root, data, deps) -> the __vg debug surface
 *
 * root  the element to build inside. Must be the page's own root -- the element carrying
 *       class="vault-graph", since every rule in page.css is scoped under it and every
 *       custom property is declared on it.
 * data  what build-graph.mjs or the plugin's adapter produced.
 * deps  { Graph, Sigma, rendering, logoMask } -- INJECTED rather than read off `window`,
 *       because in a plugin the libraries are bundled module imports and never become
 *       globals at all. The standalone page passes its UMD globals in; see shell.html.
 *
 *       Also, optionally:
 *         folderColors      { "<folder>": "g7" } -- the saved per-folder palette slots.
 *         folderShown       { "<folder>": true|false } -- saved per-folder visibility
 *                           DEFAULTS. Tri-state: absent means "whatever the `_` rule
 *                           says", which is hidden for a folder whose name starts with an
 *                           underscore and shown for everything else.
 *         onFolderShown(m)  as onFolderColors, for that map.
 *         panEnabled        false to start with drag-to-pan off. ABSENT MEANS ON -- a fresh
 *                           page has no saved answer, and dragging is what a graph does, so
 *                           the default cannot be "wait to be told". The corner control
 *                           flips it live; this is only where it starts.
 *         onPanEnabled(v)   as onFolderColors, for that flag.
 *         settingsUI        true to show the gear AND let it open the page's own panel.
 *                           The STANDALONE sets this, because nothing else there can hold
 *                           a setting.
 *         openSettings()    show the gear but hand its click to the host. The PLUGIN sets
 *                           this: the gear belongs in the view either way -- it is where
 *                           somebody looking at the disc goes to look for it -- but what
 *                           it opens is Obsidian's own settings tab, not a second panel
 *                           saying the same things. Mutually exclusive with settingsUI;
 *                           if both arrive, this one wins.
 *         onFolderColors(m) called after a change, with the new map. THE HOST PERSISTS,
 *                           not this file: the plugin writes it through saveData() and
 *                           the standalone into localStorage, and page.js knowing about
 *                           either store would put an Obsidian-forbidden API (or a
 *                           useless one) into the other target's bundle.
 *
 * WAS AN IIFE. Nothing about the body changed when it stopped being one: it already kept
 * every name to itself, which is what made this a signature change rather than a rewrite.
 */
function mountVaultGraph(root, data, deps) {
  "use strict";

  var DATA = data;
  var Graph = deps.Graph;
  var SigmaCls = deps.Sigma;
  // The programs hang off the UMD NAMESPACE object, not off the Sigma class that
  // SigmaCls resolves to -- the bundle sets both `Sigma.Sigma` and
  // `Sigma.rendering` on the same export, so `SigmaCls.rendering` is undefined and
  // reaching for a program through it throws during construction. That kills the
  // whole init inside its setTimeout, which surfaces as a page stuck on
  // "Laying out graph..." with nothing in the console.
  var RENDERING = deps.rendering || {};
  var LOGO_MASK = deps.logoMask || "";
  // The window this view lives in. Obsidian passes activeWindow so a popout schedules its
  // own timers; the standalone page passes nothing and gets its own window. Never the bare
  // global: in a popout that is the wrong window, and obsidianmd/prefer-active-window-timers
  // is an error for exactly that reason.
  var WIN = deps.win || window;
  var DOC = root.ownerDocument;
  var API = null;

  // Ids carry a `vg-` prefix so they cannot collide with the host document, and the
  // prefix is added HERE rather than at the ~200 call sites, which stay $("graph").
  var ID = "vg-";
  // querySelector on the ROOT, not getElementById on the document. Two views of this page
  // in one Obsidian window would otherwise share every id, and the second one would drive
  // the first one's DOM.
  var $ = function (id) { return root.querySelector("#" + ID + id); };

  // THE TOKENS LIVE ON OUR OWN ROOT, not on the document's.
  //
  // They used to be declared on `:root`, so reading them off documentElement worked. They
  // are on `.vault-graph` now -- the page's own #app element -- because a page that has to
  // mount inside somebody else's document must not put its palette on their <html>.
  //
  // This one line is the whole cost of that move, and getting it wrong is silent: every
  // getPropertyValue returns "", every colour parses to black, and the heatmap draws every
  // day as though it were empty. Measured exactly that way -- 88 days with notes, 88 of
  // them "partially filled" -- before this was pointed at the right element.
  // The container itself, which $() cannot return: querySelector only sees descendants.
  var ROOT = root;
  // Replace an element's children from a markup string, without an innerHTML sink.
  //
  // Parsed in an inert document -- no browsing context, so nothing executes during the
  // parse -- and the resulting nodes are moved across. Every caller escapes its
  // interpolations with esc(); the rest is this page's own constants.
  var setHTML = function (el, html) {
    var parsed = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
    el.replaceChildren.apply(el, Array.prototype.slice.call(parsed.body.childNodes));
  };

  var css = function (name) {
    return getComputedStyle(ROOT).getPropertyValue(name).trim();
  };

  // --- OKLCH, so a subfolder tint can rotate hue and nudge lightness without
  // --- drifting off the perceptual band the base palette was validated on.
  var s2lin = function (c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  var lin2s = function (c) {
    c = Math.max(0, Math.min(1, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  function relLum(h) {
    h = String(h).trim().replace(/^#/, "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var c = [0, 2, 4].map(function (i) { return s2lin(parseInt(h.slice(i, i + 2), 16) / 255); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
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
  // Rotate hue by dh degrees and shift lightness by dL, keeping chroma.
  function shade(hex, dh, dL) {
    var lab = hex2lab(hex), C = Math.hypot(lab[1], lab[2]);
    var h = Math.atan2(lab[2], lab[1]) + dh * Math.PI / 180;
    var L = Math.max(0.18, Math.min(0.92, lab[0] + dL));
    return lab2hex(L, C * Math.cos(h), C * Math.sin(h));
  }

  // Shapes are OFF: circles only. The machinery did work in the end
  // (createNodeBorderProgram lives on Sigma.rendering; borders[0] is the OUTER band
  // and the {fill:true} entry the CORE) but disc / ring / target / outline read as
  // visual noise at these node sizes, so colour carries subfolders on its own.
  // If shapes come back: an SVG data URI also needs explicit width/height, or it
  // rasterises to 0x0 and silently never draws.

  // THE PALETTE AS CHOOSABLE SLOTS.
  //
  // A folder override stores a slot KEY ("g7"), never a hex. The palette has separate
  // light and dark values -- see the two blocks in page.css -- so a stored hex would be
  // right in one theme and wrong in the other, and it would also let a colour be picked
  // that never went through the separation measurements in design/0004.
  //
  // TWELVE, including two greys. The greys are ordinary slots, pickable like any hue,
  // because "this folder should recede" is a real thing to want and the palette should
  // answer it with a choice rather than only as a side effect of running out of hues.
  var SLOT_NAMES = ["Blue", "Orange", "Aqua", "Yellow", "Green", "Magenta",
                    "Violet", "Red", "Cyan", "Orchid", "Grey", "Slate"];

  var THEME = {};
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
      // Still here, and still used: --dim's neighbours for the colorOf fallback. They
      // are no longer the overflow palette -- slots 11-12 carry the same two values as
      // real slots, and the automatic run cycles rather than falling back.
      neutrals: ["--n1", "--n2", "--n3"].map(css)
    };
    // key -> live hex, rebuilt on every theme read so an override follows the theme
    // instead of freezing whichever one was current when it was picked.
    THEME.byKey = Object.create(null);
    THEME.slots.forEach(function (hex, i) { THEME.byKey["g" + (i + 1)] = hex; });
  }
  readTheme();

  // Folder -> slot key. Comes in from the host: the plugin reads it out of its own
  // settings, the standalone page out of localStorage. Anything unrecognised is dropped
  // rather than trusted -- this map has been through a JSON file either way, and an
  // unknown key would otherwise resolve to undefined and paint a group black.
  function cleanFolderColors(raw) {
    var out = Object.create(null);
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (g) {
      var k = raw[g];
      if (typeof k === "string" && /^g([1-9]|1[0-2])$/.test(k)) out[g] = k;
    });
    return out;
  }
  var folderColors = cleanFolderColors(deps.folderColors);

  // DRAG-TO-PAN, ON UNLESS THE HOST SAYS OTHERWISE. Absent means on: a fresh page has no
  // saved answer and dragging is what a graph does, so the default cannot be "wait to be
  // told". Only an explicit false turns it off -- github#4 argued for off-by-default on a
  // 10k vault, and the reverse won: the rim is unreachable without it, and a control in the
  // corner is a cheaper way to find that out than a settings tab is.
  var panEnabled = deps.panEnabled === false ? false : true;
  var onPanEnabled = typeof deps.onPanEnabled === "function" ? deps.onPanEnabled : null;

  // ARCHIVE FOLDERS: the ones whose name starts with `_`.
  //
  // A leading underscore is how a vault says "sorts last, not part of the working set" --
  // `_ Archives`, `_old`, scratch. They are still notes and still in the graph, but they
  // are not what the disc is for, so they get three things done to them: no slot in the
  // colour rotation, a recessive grey, and hidden on arrival. All three are overridable
  // per folder, and none of them is a rule about FILES -- `_scratch.md` is a note like
  // any other. This asks about the top-level group name, which is the only level that
  // owns a wedge.
  function isArchiveGroup(g) { return String(g).charAt(0) === "_"; }

  // THE ARCHIVE GREY IS A PALETTE SLOT, not a neutral off to one side.
  //
  // It was `--n3` first, which looked right and was the wrong kind of answer: the settings
  // panel could not mark it, because the colour a folder was using was not one of the
  // twelve on offer, so an archive row rang no swatch and "Auto" pointed at nothing.
  //
  // g11 rather than g12, of the two greys. It is the LOWER-CONTRAST one against the
  // surface in both themes -- measured 4.99 vs 9.51 on light and 5.16 vs 9.12 on dark --
  // which is what recede means, and it is also the darker-looking of the two in the dark
  // theme the disc opens in.
  var ARCHIVE_SLOT = "g11";

  // The eye, shared between the legend and the settings panel: same mark for the live
  // filter and for the default it returns to, because they are the same question asked
  // about two different moments.
  function eyeSvg(on) {
    var lid = '<path d="M1.6 8S4 3.9 8 3.9 14.4 8 14.4 8 12 12.1 8 12.1 1.6 8 1.6 8z"' +
              ' fill="none" stroke="currentColor" stroke-width="1.25"/>';
    return '<svg viewBox="0 0 16 16" aria-hidden="true">' + lid +
      (on ? '<circle cx="8" cy="8" r="2" fill="currentColor"/>'
          : '<path d="M3 13L13 3" stroke="currentColor" stroke-width="1.25"/>') +
      '</svg>';
  }

  // Explicit per-folder visibility: true = shown, false = hidden, absent = the default
  // above. Tri-state on purpose -- "absent" has to stay distinguishable from "false", or
  // turning `_ Archives` off by hand would be indistinguishable from never having said
  // anything about it, and a later change to the default could not reach it.
  function cleanFolderShown(raw) {
    var out = Object.create(null);
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (g) {
      if (typeof raw[g] === "boolean") out[g] = raw[g];
    });
    return out;
  }
  var folderShown = cleanFolderShown(deps.folderShown);

  // Hidden unless something says otherwise: an explicit choice first, then the `_` rule.
  function hiddenByDefault(g) {
    if (typeof folderShown[g] === "boolean") return !folderShown[g];
    return isArchiveGroup(g);
  }
  var SETTINGS_UI = !!deps.settingsUI;
  var openHostSettings = typeof deps.openSettings === "function" ? deps.openSettings : null;
  var saveFolderColors = typeof deps.onFolderColors === "function" ? deps.onFolderColors : null;
  var saveFolderShown = typeof deps.onFolderShown === "function" ? deps.onFolderShown : null;

  /* ------------------------------------------------------------------ state */

  var state = {
    // Grouping is fixed to the PARA folder and there is only one layout now, so
    // both are constants rather than switchable state.
    dim: "folder",
    layout: "rings",
    hiddenSub: Object.create(null),   // "folder/sub" -> true
    hidden: Object.create(null),   // dim -> {group: true}
    // Highlighting is a SEPARATE axis from visibility, which is the whole point of
    // the eye icons: the row used to hide a group, so there was no way to say "show
    // me where this one is" without hiding everything else.
    highlight: Object.create(null),   // group -> true: pushed out and haloed
    highlightSub: Object.create(null),// "folder/sub" -> true: same, one subfolder
    // Hovering a legend row haloes its notes for as long as the pointer is on it. A
    // SEPARATE axis again, and transient: it never survives a rebuild of the legend and
    // it is never persisted, so it cannot leave the disc in a state nobody chose.
    hoverGroup: null,   // group name under the pointer, or null
    // Path keys under the pointer, as a SET rather than one string. A depth-1 row can
    // stand for several subfolders at once -- the "N smaller subfolders" tail row carries
    // every index it pools -- so one row is not one key, and hovering it has to light all
    // of them or it lights the wrong part of the wedge it points at.
    hoverSub: Object.create(null),
    // Every group starts COLLAPSED, so the legend opens as a list of the vault's
    // top-level folders and nothing else. It used to open with one level of subfolders
    // showing, on the reasoning that that level is what the pie already draws as
    // sub-wedges -- but on this vault that is 24 rows before you have asked anything,
    // and the folder names it is trying to show are the ones that get truncated. The
    // tree is still one click deep; it just is not unfolded for you.
    //
    // Filled by regroup(), which is the first place the group names exist.
    collapsed: Object.create(null),   // group -> true: its subfolder rows folded away
    tailOpen: Object.create(null),    // group -> true: "N smaller subfolders" unfolded
    // "PARA/a/b/..." -> true: that folder's children are unfolded. Any depth; the tree
    // comes from each note's own `dirs` chain, so nothing here assumes a level count.
    pathOpen: Object.create(null),
    selected: null,
    hovered: null,
    // Days marked on the heatmap: one picked by clicking, one under the pointer.
    // Both halo their notes without moving them (see isPushed), and both are
    // independent of markToday -- any combination can be on at once, and none of
    // them is a visibility filter.
    markDay: null,
    hoverDay: null,
    // The year label under the pointer, if any. Same shape as hoverDay and read the same
    // way -- a transient halo answering "where did this year go", with no push.
    hoverYear: null,
    query: "",
    until: null,        // timeline: reveal the oldest N notes, or null for all
    // DATE RANGE CAP. Two ends, either of which may be null for "no bound", in ms UTC at
    // midnight. Separate from `until` on purpose: that one reveals the oldest N notes and
    // is a growth animation, this one is a filter. They compose -- see timeFactor.
    from: null,
    to: null,
    // The RIGHT EDGE of the heatmap's 52-week window, or null for "the last 52 weeks".
    // The band was a fixed sliding window onto today, which is what made everything before
    // it unreachable: on the 10-year fixture that is nine years of the vault with no way to
    // point at it. Concepts that move the window write this.
    heatEnd: null,
    markToday: false,
    // Bow links away from the hub instead of chording across it. 91% of links cross
    // the disc, so straight is the case that would need the excuse. No longer a
    // control: these two are fixed, and the code paths for false are kept only
    // because flipping either here is still the way to compare the two renderings.
    curveEdges: true,
    // Logo colouring: true = the inner band's palette in the middle, fading out into
    // the outer's. false = the outer ring's palette across the whole mark.
    logoTwoRing: true
  };

  /* ------------------------------------------------- graph + base layout */

  var graph = new Graph({ type: "undirected" });
  var N = DATA.nodes.length;

  DATA.nodes.forEach(function (n, i) {
    graph.addNode(String(i), {
      label: n.label, x: 0, y: 0, size: 4,
      folder: n.folder, sub: n.sub || "", dirs: n.dirs || [], ntype: n.type || "note",
      tags: n.tags || [], path: n.id, deg: n.deg,
      created: n.created || "", touched: n.touched || "",
      words: n.words || 0, ghost: !!n.ghost
    });
  });
  DATA.edges.forEach(function (e) {
    if (!graph.hasEdge(String(e.s), String(e.t))) {
      graph.addUndirectedEdge(String(e.s), String(e.t), { weight: e.w, size: Math.min(1.6, 0.35 + e.w * 0.25) });
    }
  });

  // Node area tracks link count; sqrt keeps hubs from swallowing the canvas.
  // The cap is not cosmetic: measured row spacing in the Rings layout is ~28px, so
  // a radius above ~13 makes neighbouring notes in the same column overlap. 11
  // leaves a visible gap while still giving a 4x range between a leaf and a hub.
  var NODE_MIN = 2.6, NODE_MAX = 11, NODE_ORPHAN = 6;
  graph.forEachNode(function (id, a) {
    // Unlinked notes would take the smallest size of all and vanish in the hub,
    // which is the opposite of useful -- being unlinked is the thing to notice.
    // They all have degree 0, so a fixed size says "special case", not "important".
    graph.setNodeAttribute(id, "size", a.deg === 0
      ? NODE_ORPHAN
      : Math.min(NODE_MAX, NODE_MIN + 1.55 * Math.sqrt(a.deg)));
  });

  measureDotTyp();

  // Which notes deserve a permanent label: strictly the best-connected ones.
  // Sigma's own label thinning is grid-based, which assumes nodes are spread out --
  // false by construction in Rings, where every hub is packed into the centre so they
  // all compete for one grid cell. That made the choice effectively arbitrary and
  // could drop rank 1 entirely, so the ranking is decided here. Ties break on label
  // so the labelled set is identical on every reload.
  var hubRank = Object.create(null);
  (function () {
    graph.nodes().slice().sort(function (a, b) {
      return graph.getNodeAttribute(b, "deg") - graph.getNodeAttribute(a, "deg") ||
             String(graph.getNodeAttribute(a, "label"))
               .localeCompare(String(graph.getNodeAttribute(b, "label")));
    }).forEach(function (id, i) { hubRank[id] = i; });
  })();

  // Stable subfolder ordering per PARA folder: biggest first, name as tie-break.
  var subOrder = Object.create(null);
  (function () {
    var tally = Object.create(null);
    graph.forEachNode(function (_id, a) {
      var f = a.folder, sb = a.sub || "";
      if (!tally[f]) tally[f] = Object.create(null);
      tally[f][sb] = (tally[f][sb] || 0) + 1;
    });
    Object.keys(tally).forEach(function (f) {
      subOrder[f] = Object.keys(tally[f]).sort(function (x, y) {
        return tally[f][y] - tally[f][x] || x.localeCompare(y);
      });
    });
  })();

  var base = {};   // id -> {x, y} from ForceAtlas2, before any group separation

  // Graph-space distance for one layout unit (one row, one note along a row).
  // Fixed on purpose: see the note where it is used.
  var UNIT = 160;

 
 
  /* -------------------------------------------------------------- grouping */

  // Unlinked notes are their OWN GROUP, not their folder's. They used to be
  // sunflower-packed into the hub hole, which put them nowhere the rest of the language
  // applies: no wedge, no legend row, no way to filter or count them, and their folder
  // silently under-reported its size. As a group they get all of that, and they land in
  // whichever band their size earns like anything else.
  //
  // Named in parentheses so it sorts with "(vault root)" ahead of the numbered folders,
  // and so it cannot collide with a real folder name.
  var UNLINKED = "(unlinked)";
  function groupOf(id) {
    if (graph.degree(id) === 0) return UNLINKED;
    return graph.getNodeAttribute(id, "folder");
  }

  // Colour is assigned from FULL-dataset group sizes and cached per dimension, so a
  // filter never repaints the survivors.
  // Twelve categorical slots -- ten hues and two greys -- at the author's request. For
  // the record: only four hues clear the all-pairs colour-vision gate on freely-scattered
  // marks, and twelve cannot. What makes it workable here is that colour is NOT the only
  // channel: each group owns a contiguous wedge separated by a 2 degree gap, carries a
  // label on the rim, and is listed in the legend with its count.
  var SLOT_COUNT = 12;
  var groupColor = Object.create(null);   // group -> literal hex, rebuilt on regroup
  var groupSlot = Object.create(null);    // group -> slot key it is on, "" for none
  var order = {};   // dim -> [group names, biggest first]

  function computeOrder() {
    var count = {};
    graph.forEachNode(function (id) {
      var g = groupOf(id);
      count[g] = (count[g] || 0) + 1;
    });
    // Name order, not size order. For PARA folders that is their numbered order
    // (01, 02, 03, ...), so wedges run round the disc in the same sequence as the
    // vault's own folder list and a group keeps its colour as the vault grows.
    // Note: subfolder order stays size-based -- the "N smaller subfolders" fold
    // depends on knowing which are smallest.
    var names = Object.keys(count).sort(function (a, b) {
      // THREE RANKS, and the reason is that neither `_` nor `(` is a real folder name
      // competing with the others. Archives first, then the pseudo-folders --
      // "(vault root)" for notes sitting loose at the top and "(unlinked)" for notes
      // nothing points at -- then everything the vault actually filed. So the entries
      // that are not part of the working set stay together at the head of the list
      // instead of one of them landing above the archives and one below.
      //
      // This does not move any colour: archives take the grey slot without consuming
      // one, so the first pseudo-folder is still the first group in the rotation.
      var rank = function (s) {
        var c = s.charAt(0);
        return c === "_" ? 0 : c === "(" ? 1 : 2;
      };
      return rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true });
    });
    order[state.dim] = names;
    return count;
  }

  var counts = {};
  function buildColors() {
    groupColor = Object.create(null);

    var names = order[state.dim] || [];

    // IT GOES ROUND. Folder n takes slot n, and folder 13 comes back to slot 1.
    //
    // It used to stop at ten and drop everything past that into the neutrals, on the
    // reasoning that a repeated hue is a lie about identity. That trade is the wrong way
    // round: a repeat is still separated by its wedge, its rim label and its legend row,
    // whereas the grey tail was one undifferentiated blob where nothing was separated
    // from anything. The greys are slots 11 and 12 now, so grey is still reachable --
    // as a choice, for a folder that should recede, rather than as what you get for
    // being thirteenth.
    //
    // Overrides only apply to the folder dimension: they are keyed by folder name, and
    // any other grouping would be matching those names against something else entirely.
    var byFolder = state.dim === "folder" ? folderColors : Object.create(null);

    // AN OVERRIDE CHANGES EXACTLY ONE FOLDER. Position decides every other colour, and
    // nothing here looks at what anyone else picked.
    //
    // The first version tried to keep the palette a bijection: an override claimed its
    // slot, the automatic run stepped over it, and picking a slot another folder held
    // swapped the two. Both halves were wrong, and for the same reason -- they treated
    // "two folders share a hue" as a mistake to prevent. It is a choice. Grouping three
    // folders under one colour to say they belong together is a thing to want, and the
    // clever version made it unreachable while also moving folders nobody touched: one
    // pick could re-seat four other wedges, so the disc repainted around the one change
    // you were looking at.
    //
    // So: no claiming, no stepping over, no swapping. Duplicates are allowed because
    // they are allowed to be deliberate.
    //
    // ARCHIVES ARE OUT OF THE ROTATION, and that is why the counter is separate from the
    // index. Spending a hue on `_ Archives` costs twice: the archive gets a colour that
    // says "look at me", and every folder after it is pushed a slot along, so which hue a
    // working folder gets depends on how many archives happen to sort before it. A
    // recessive grey and no slot consumed fixes both. An explicit pick still wins -- the
    // rule is a default, not a prohibition.
    // WHICH SLOT EACH GROUP ENDED UP ON is recorded rather than recomputed. The settings
    // panels have to mark it, and the arithmetic is no longer `i % 12`: archives are
    // skipped, so the only thing that knows is the loop that did the skipping. Both UIs
    // read it back through the api.
    groupSlot = Object.create(null);
    var auto = 0;
    names.forEach(function (g) {
      var k = byFolder[g];
      var picked = (k && THEME.byKey[k]) ? k : "";

      // ARCHIVES NEVER CONSUME A SLOT, with or without a pick of their own. That is the
      // whole of "out of the rotation": `auto` does not advance here, so which hue a
      // working folder gets cannot depend on how many archives sort before it.
      if (isArchiveGroup(g)) {
        var akey = picked || ARCHIVE_SLOT;
        groupColor[g] = THEME.byKey[akey];
        groupSlot[g] = akey;
        return;
      }

      // EVERY OTHER FOLDER CONSUMES ITS POSITION, whether or not it uses the colour that
      // position hands it. `auto++` happens before the pick is considered, deliberately.
      //
      // Returning early on a pick -- which is how this read when the archive counter went
      // in -- silently reintroduced the blast radius this whole design exists to avoid:
      // an overridden folder did not advance the counter, so every folder after it slid
      // one slot along. Measured on the 17-folder vault, one click on one folder
      // recoloured FOURTEEN groups and repainted 624 notes outside the folder touched.
      // It was index-based (`i % SLOT_COUNT`) before the counter, which had this right by
      // construction; the counter has to be told.
      var key = "g" + ((auto++ % SLOT_COUNT) + 1);
      var use = picked || key;
      groupColor[g] = THEME.byKey[use];
      groupSlot[g] = use;
    });
    buildSubShades();
  }

  // The settings UIs need three things and none of them should reach into internals:
  // what can be picked, what is picked now, and what the groups are called.
  function paletteInfo() {
    return SLOT_NAMES.map(function (name, i) {
      return { key: "g" + (i + 1), name: name, hex: THEME.slots[i] };
    });
  }

  // Apply a new folder -> slot map and repaint everything that carries a group colour.
  //
  // A rebuild is NOT needed and is not done: colour is not an input to the layout, so the
  // ring plan, the band lock and every node position are untouched. What does have to be
  // told is each thing that cached a colour of its own -- the renderer's node reducers,
  // the logo's conic gradient, the heatmap's per-day mix, and the legend's swatches.
  // Visibility defaults do not touch colour, so this only replaces the map. The caller
  // applies it to the live filter -- see pickVisible -- because a *default* changing and
  // the disc changing are two decisions, and only one of them belongs to a host that is
  // loading saved settings at boot.
  function applyFolderShown(map) {
    folderShown = cleanFolderShown(map);
    return folderShown;
  }

  function applyFolderColors(map) {
    folderColors = cleanFolderColors(map);
    buildColors();
    if (renderer) renderer.refresh();
    try { placeLogo(); } catch { /* logo not mounted yet */ }
    try { heatBuild(); } catch { /* heatmap not built yet */ }
    try { buildLegend(); } catch { /* legend not built yet */ }
    return folderColors;
  }

  function colorOf(group) {
    return groupColor[group] || THEME.neutrals[0];
  }

  // Subfolders get a tint of their PARA folder's colour, not a colour of their own:
  // hue rotated a few degrees with a small lightness step, so "03 - Resources" still
  // reads as one family while People / Partners / Rezepte separate inside it. This is
  // deliberately BELOW the categorical separation floor -- it is a nested cue on top
  // of an already-labelled group, not an independent colour channel.
  var subShade = Object.create(null);

  // Four steps, not one per subfolder. Spreading N tints evenly across one hue
  // family collapses as N grows -- measured, nine subfolders land ~3 apart, below
  // the just-noticeable threshold, so nothing is actually differentiated. Four
  // steps hold adjacent separation at 6-10 (OKLab dE x100), which is legal given
  // the legend swatches and tooltips that name the subfolder. Subfolders past the
  // third therefore SHARE the last step; the legend says so rather than implying
  // each has its own shade.
  // Stepping symmetrically around the base colour forces one end toward the
  // surface and it loses contrast -- measured, the darkest step fell to 2.25:1 on
  // the dark surface. So the ladder always steps AWAY from the surface: lighter on
  // dark, darker on light. That buys a starker spread (adjacent dE 5.6-9.5, up from
  // ~3) AND better contrast, and it means the biggest subfolder keeps the folder's
  // own colour instead of being tinted.
  // How far a family may rotate is NOT a global constant: measured against this
  // palette, blue has 106deg of hue to its nearest neighbour but yellow only 69,
  // so a fixed rotation either wastes blue's headroom or turns yellow green. Each
  // family gets 40% of its own half-gap, computed from the live palette.
  var SLICE_GAP = 2;      // degrees of empty space between GROUPS
  // ...and between sub-wedges INSIDE a group. Smaller than SLICE_GAP on purpose:
  // the group boundary has to stay the more prominent of the two, or the disc reads
  // as one flat ring of subfolders rather than folders that contain them. The tint
  // ladder already separates sibling sub-wedges; this just stops them touching.
  var SUB_GAP = 0.3;
  // An angular gap cannot solve edge collisions on its own, and the arithmetic says
  // why: `u` is the fraction ACROSS a row, so a row's first and last notes sit right
  // on the wedge edges, and all that separates them from the neighbouring cell's
  // edge notes is the gap's arc -- 1 degree at r=1334 is 23 graph units against the
  // ~156 that two max-size dots need. Even 2 degrees only reaches 46.
  //
  // So notes are also held off the edges by an absolute ARC, converted to a
  // fraction of the cell's own reference width. Capped, because a narrow wedge
  // cannot afford much: without the cap a 16-note cell wanted 30% of its span at
  // each end, which squeezes its interior enough to trade edge collisions for
  // interior ones.
  // Tuned by sweeping, not derived -- because the pad trades three things off at
  // once (edge collisions, interior collisions, and how ragged the disc's outer edge
  // gets) and only measurement finds the corner. Swept at a fixed window:
  //
  //   arc  max   cross  interior  outer-radius spread  rows
  //     0  0     1      0         800  (baseline)      7-7
  //    25  0.08  0      0         800  (baseline)      7-8
  //    35  0.10  0      0         800  (baseline)      7-8   <- chosen
  //    55  0.16  0      0         960                  8-9
  //    70  0.22  0      0         1280                 8-11
  //
  // 70/0.22 was the first guess and it was wildly over-specified: it cleared the
  // collisions but pushed narrow cells from 8 rows to 11, which is the sparse-spoke
  // failure mode, and added 480 units of raggedness. 35/0.10 clears them at the
  // baseline 800 spread -- i.e. for free, since that raggedness exists with no pad
  // at all (cells' last rows are partly filled, so their outer radii differ anyway).
  // BOTH ZERO, and that is the point: within-row centring in placeCell now provides
  // the edge clearance for free, so the inset is not needed at all. Measured with the
  // pad at 0 AND the gap at 0 degrees: 0 collisions, 0 off-lattice rows of 418. The
  // mechanism is left in as a safety valve, and because the sweep that retired it is
  // worth keeping (see the table in the note).
  var EDGE_PAD_ARC = 0;
  var EDGE_PAD_MAX = 0;
  // Minimum wedge width. Not cosmetic: at the hub radius an arc of MIN_SPAN has to
  // be wide enough that two neighbouring cells' innermost notes do not touch.
  // Measured, 1.4 degrees left them ~9px apart against ~17px of node; 6 clears it.
  // The cost is proportional honesty at the bottom end -- the five smallest groups
  // take ~8% of the circle for 2.3% of the notes.
  // The inner ring is drawn at this fraction of its packed radius. Rows and
  // capacities are computed on the unscaled geometry and the whole band is scaled
  // afterwards, so the proportions are untouched -- it is purely a size trim.
  var INNER_SCALE = 0.8;

  var MIN_SPAN = 6 * Math.PI / 180;
  // Nest whenever a group HAS subfolders. This used to require 12+ notes, because
  // back when the minimum wedge was 1.4 degrees a 1-note subfolder became an
  // invisible sliver. MIN_SPAN is 6 degrees now, which guarantees every sub-wedge
  // is visible, so the threshold only served to hide real structure -- the quarter
  // folders under 05 - Weekly Reviews (10 notes) never showed up.
  // How far a highlighted note steps out, in ROWS (SP = 1, so 0.9 is just under one
  // row of spacing). Sized against the headroom that already exists rather than by
  // eye: the normalisation box is pinned at maxR * 1.02 and fit() frames at 1.08, so
  // there is ~6% of slack outside the outermost notes. 0.9 rows on a ~13.3-row disc
  // is 6.8% -- enough to read as protruding, small enough that the pushed wedge does
  // not need the box widened, which would shrink the resting disc for everyone.
  var HL_PUSH = 0.9;

  // How far the density solve is allowed to spread the lattice (github#13). sqrt has no
  // ceiling of its own, so isolating one folder out of a 1500-note vault would otherwise
  // ask for a spacing of 30 and draw a handful of boulders on the rim. 2.6 lets a vault
  // be filtered to ~15% of itself before the disc starts shrinking again instead of
  // spreading -- which covers isolating a single PARA folder, the gesture this is for.
  var DENSITY_MAX = 2.6;



  // The lattice spacing the last plan actually used. Read by measureSizeScale, which has
  // to know how wide a ROW is rather than how wide a lattice unit is -- they were the
  // same number until the density solve, and conflating them is why dot size did not
  // respond to filtering at all.
  var lastSP = 1;
  // The INNER band's spacing, alongside it. The two rings are solved separately, so one number
  // cannot answer for both -- and when it tried, the inner ring's geometry followed the outer
  // ring's filtering.
  var lastSPI = 1;
  // How deep each band is RIGHT NOW, in rows. The seam falls off against this rather than
  // against the locked full-vault depth: filter a 10,000-note vault down to 500 and it should
  // read like a 500-note vault, gaps included, not keep the hairline seam a ten-row-deep ring
  // earned. Locked depth got that wrong in the one direction nobody checked.
  var lastRows = { i: REF_ROWS, o: REF_ROWS };

  // ONE ROW OF THE LATTICE AT FULL VAULT, IN GRAPH UNITS -- and deliberately NOT the live
  // pitch, which is a different number at every filter state.
  //
  // The seam and a wedge's end margins are quoted in rows, so they need a row to measure
  // against. Using the LIVE pitch was the obvious reading and is wrong twice over:
  //
  //   * it makes the gap a function of the filter, which is the thing three earlier fixes were
  //     about. Toggling one folder visibly moved every channel on the disc -- reported as "you
  //     can see the gaps moving when toggling 08 Meeting Notes".
  //   * the live pitch is PER BAND now, and there is only one lastSP. It holds the outer band's,
  //     so the inner ring's seams were sized by the outer ring's spacing: hide outer folders,
  //     SP_O climbs, and the inner ring's gaps grow for a reason that has nothing to do with
  //     the inner ring. Reported as the inner gaps growing while outer folders were toggled.
  //
  // The full-vault pitch is one number, the same in both bands, and it does not move. A gap is
  // a statement about the vault's structure, so that is the right clock for it. What DOES scale
  // with the live lattice is the dots -- see dotUnits, which is about a dot and keeps the live
  // pitch on purpose.
  //
  // TIMES INNER_SCALE IN THE INNER BAND, which is the factor that made the inner ring's
  // channels read as much too wide. Inner radii are DRAWN at INNER_SCALE, so the inner band's
  // real step is 0.8 of its lattice pitch -- measured, 117 units against the outer band's 159.
  // Spending a full UNIT of margin there put the zero point alone at 160/117 = 1.37 steps,
  // before any seam: a boundary wider than a note-to-note gap by half again, purely from using
  // the wrong ring's ruler. Measured channels per band, before: inner 1.53/1.69/1.37 against
  // outer 1.27/1.20/1.07 on the three vaults.
  //
  // THE LIVE PITCH, per band, and times INNER_SCALE in the inner one. A seam is a distance
  // between notes, so it belongs on the same ruler the notes are spaced by -- and that ruler is
  // the band's own live spacing. The locked pitch was tried and is wrong in the direction that
  // was not being watched: it holds a filtered 10,000-note disc to the seam its full self
  // earned, when what a person sees on screen is 500 notes that should look like 500 notes.
  //
  // Per band and never one shared number, which is the error that made the inner ring's gaps
  // grow while outer folders were toggled.
  function pitchUnits(band) {
    var sp = band === "i" ? (lastSPI || 1) : (lastSP || 1);
    return UNIT * sp * (band === "i" ? INNER_SCALE : 1);
  }

  var NEST_MIN = 2;
  // Group folding is OFF now that there are 10 hues: it existed only because
  // groups past slot 4 all shared one grey and merged into an unreadable mass.
  // With its own colour, its own 2-degree gap and its own label, a 3-note group
  // reads fine as a thin slice. Set this above 0 to bring the shared wedge back.
  var SMALL_GROUP = 0;
  var SUB_SLOTS = 4;
  var SUB_NAMED = 3;
  var HUE_BUDGET_FRACTION = 0.60;   // share of its half-gap a family may rotate
  var SUB_L_SPAN = 0.28;            // how far the ladder travels in lightness
  var SUB_L_LIMIT = 0.90;           // stop before the top step washes out

  function hueOf(hex) {
    var l = hex2lab(hex);
    return ((Math.atan2(l[2], l[1]) * 180 / Math.PI) % 360 + 360) % 360;
  }
  // Degrees this group may rotate before it starts impersonating another group.
  function hueBudget(basecol) {
    var h = hueOf(basecol), gap = 180;
    Object.keys(groupColor).forEach(function (g) {
      var c = groupColor[g];
      if (c === basecol) return;
      var lab = hex2lab(c);
      if (Math.hypot(lab[1], lab[2]) < 0.02) return;   // neutrals have no hue to clash with
      var d = Math.abs(h - hueOf(c));
      d = Math.min(d, 360 - d);
      if (d < gap) gap = d;
    });
    return gap * HUE_BUDGET_FRACTION;
  }

  function subTintIndex(folder, sub) {
    var subs = subOrder[folder] || [];
    var k = subs.indexOf(sub || "");
    return k < 0 ? 0 : Math.min(k, SUB_SLOTS - 1);
  }

  function buildSubShades() {
    subShade = Object.create(null);
    Object.keys(subOrder).forEach(function (f) {
      var subs = subOrder[f];
      if (subs.length < 2) return;             // nothing to differentiate
      var basecol = colorOf(f);
      var lab = hex2lab(basecol);
      var grey = Math.hypot(lab[1], lab[2]) < 0.02;   // neutrals have no hue to turn
      if (grey) {        // neutrals share one lightness axis; a ladder would collide
        subs.forEach(function (sb) { subShade[f + "/" + sb] = basecol; });
        return;
      }
      // Lightness targets are spaced evenly between the base and a per-family end
      // point rather than being fixed deltas. Fixed deltas hit the wash-out cap and
      // the top two steps collapsed onto each other -- which is why simply turning
      // the numbers up made separation WORSE (adjacent dE 6.4 -> 4.1), not better.
      var sign = THEME.dark ? 1 : -1;
      var budget = hueBudget(basecol);
      var Lend = THEME.dark
        ? Math.min(SUB_L_LIMIT, lab[0] + SUB_L_SPAN)
        : Math.max(1 - SUB_L_LIMIT, lab[0] - SUB_L_SPAN);
      subs.forEach(function (sb) {
        var t = subTintIndex(f, sb) / (SUB_SLOTS - 1);
        subShade[f + "/" + sb] = shade(basecol, sign * budget * t, (Lend - lab[0]) * t);
      });
    });
  }

  // Group colour, tinted by subfolder when the folders are what we are looking at.
  //
  // UNLINKED IS A GROUP, NOT A FOLDER, and the folder dimension is the one place that can
  // forget it. Every other dimension asks groupOf; this one used to go straight to the
  // note's own folder, so a degree-0 note wore its folder's tint while the legend showed
  // it under one swatch -- measured 0 of 12 matching on a 700-note vault, 9 distinct
  // colours under a single legend row (github#3). `(vault root)` is NOT the same case:
  // the builder writes that as a real folder value, so colorOf resolves it already.
  function nodeColor(id) {
    var a = graph.getNodeAttributes(id);
    if (state.dim !== "folder") return colorOf(groupOf(id));
    if (groupOf(id) === UNLINKED) return colorOf(UNLINKED);
    return subShade[a.folder + "/" + (a.sub || "")] || colorOf(a.folder);
  }

  function isHidden(group) {
    var h = state.hidden[state.dim];
    return !!(h && h[group]);
  }

  /* --------------------------------------------------- positions per group */

 

  /* ------------------------------------------------------- rings layout */

  // A pie chart made of notes. Each group owns one wedge, its angle proportional
  // to the group's share of the vault; inside the wedge, notes fill concentric
  // rings from the middle outwards, best-connected first -- so hubs sit near the
  // hub of the disc and leaf notes land on the rim.
  //
  // Uniform packing density makes every wedge reach the same outer radius
  // regardless of its angle (area grows with the angle, and so does the node
  // count), which is what makes it read as a pie rather than a set of spokes.
  // group -> which ring it lives in, fixed for the life of this data. See the
  // band lock in buildWedgePlan.
  var bandLock = null;
  // The two bands' base radii, also fixed for the life of this data. The hub
  // radius used to be solved from the GLOBAL note count and the outer band's base
  // was derived from the inner band's row count, so enabling something in one
  // ring re-packed the other. Locking both makes the rings independent: each
  // one's rows depend on its own weights, at its own fixed base.
  var geomLock = null;
  // Kept for reference: locking the packing width per cell made a folder's rows
  // immune to other folders, but density then never adapted -- see the row count
  // note in buildWedgePlan.
  var bandRefLock = null;
  // Also kept for reference: freezing each note's SLOT -- every note in the cell's
  // whole-vault list counting 1 and holding its place whether visible or not -- was
  // tried 2026-08-21 to stop a depth-2 subfolder toggle repacking its parent cell.
  // It did stop the repack, but a hidden note then leaves a hole instead of the cell
  // closing up, and the fade read worse than the movement it removed. Reverted. The
  // depth-2 radial movement is still open; see the note.
  var ringsMerged = Object.create(null);   // groups folded into the shared wedge
  var MERGED = "\u0001merged";

  // The wedge PLAN -- which notes sit in which cell, in which row, at which
  // fraction across the wedge -- is built from the whole vault and never from
  // what happens to be visible. That is the fix for notes appearing to swap
  // seats: hiding something changes each wedge's ANGLE, but never any note's
  // row or its position within the row, so a reflow is a rotate-and-stretch and
  // nothing crosses over anything else.
  // Sigma renders graph +y UPWARD, so a plain accumulating angle sweeps
  // anticlockwise starting at 6 o'clock. Layouts accumulate a "sweep" from 0
  // instead and convert here, which puts the first group at 12 o'clock and runs
  // clockwise -- the direction people read a pie chart.
  function sweepAngle(sw) { return Math.PI / 2 - sw; }
  function angleSweep(a) {
    var t = (Math.PI / 2 - a) % (2 * Math.PI);
    return t < 0 ? t + 2 * Math.PI : t;
  }

  // A note with no links has nothing to be near, so it goes in the hub hole rather
  // than on the rim. Coreness 0 and degree 0 are the same set -- any note with a
  // link survives the first peel -- so this is exactly the 0-core.
  function isOrphan(id) { return graph.degree(id) === 0; }

  // THE SEAM IS A WIDTH, NOT AN ANGLE, and measuring it in degrees is why it looked wrong.
  //
  // SLICE_GAP was 2 degrees, tuned on a 450-note vault where that reads as a clean channel
  // between wedges. A degree is not a width, though: it buys arc in proportion to radius,
  // and the disc's radius grows with the vault. Measured at the outer ring:
  //
  //   454 notes    r 2141   2.000 deg    75 units   0.47 of a row pitch
  //   1402 notes   r 3879   1.911 deg   129 units   0.81 of a row pitch
  //   10001 notes  r 9885   0.000 deg     0 units   0.00
  //
  // On SCREEN all three were about the same 9px, because the camera fits the disc -- so the
  // setting looked consistent and was not. Against the lattice the notes actually sit on,
  // the same setting bought nearly twice the channel on the middle vault, which is exactly
  // where the gaps were reported as too big.
  //
  // So the seam is measured in ROW PITCHES -- the one length the whole disc is built on -- and
  // the angle falls out of the radius it sits at. That reproduces the old ramp's INTENT, the gap shrinking as the vault grows, as
  // arithmetic rather than as a hand-drawn line between two magic note counts, and it retires
  // the last place in the layout where note count stood in for something it is not a measure
  // of.
  //
  // The row pitch is UNIT. The lattice is very nearly square, so this is also about one
  // note-to-note step ALONG a row: measured, the along-row spacing at the outermost row of
  // three vaults is 161, 178 and 165 against a 160 row pitch -- within 12% on vaults spanning
  // 22x the note count, which is what makes a single constant safe here.
  //
  // ONE SEAM FOR EVERY BOUNDARY, group and subfolder alike, and it is the SUB-wedge width --
  // the narrower of the two. There were two widths on the reasoning that a group boundary
  // matters more than a subfolder one and should read as wider; in practice the colours and
  // the legend already carry that distinction, and the wide version reads as a slice missing
  // from the disc rather than as a seam between neighbours.
  //
  // AND THE CHANNEL HAS PARALLEL EDGES. A constant ANGLE is a wedge: it buys arc in
  // proportion to radius, so the channel fanned open toward the rim -- four times the width
  // at the outer row that it had at the inner one, on a band four rows deep. Sizing it in
  // width and dividing by the radius each note actually sits at inverts that: the angle
  // shrinks as the radius grows, every row is separated by the same arc, and the locus of the
  // edge is a straight line offset half a seam from the radius rather than the radius itself.
  // (A point at radius r offset by angle w/2r sits at perpendicular distance r*sin(w/2r), which
  // is w/2 for any r -- so the two edges of a channel are genuinely parallel, not merely
  // closer to it.)
  //
  // Per BAND, because the two rings sit at different radii and one angle cannot be the same
  // width at both.
  //
  // The circularity the note-count proxy existed to dodge is real but avoidable: the radius
  // here is the LOCKED one, fixed once from the full-vault plan, so it is a constant by the
  // time any of this runs rather than something the current plan is still deriving. For the
  // single plan that produces the lock, the old degrees-and-note-count rule stands in.
  // AND IT FALLS OFF AS A BAND GETS DEEPER. A seam that is a fixed width reads as generous on
  // a five-row ring and as a canyon on a twenty-three-row one: the deeper the band, the more
  // wedges it carries and the more of them any one seam competes with, so the same channel
  // asks for more of the eye. Rows are the right measure of that -- they say how big the disc
  // is AND how dense, where a note count says neither on its own.
  //
  // The exponent is fitted, not derived, and the three points it was fitted to are worth
  // keeping: at 5 outer rows (a 454-note vault) half the base seam, at 9 rows (1402 notes) a
  // quarter, and at 23 rows (10,001 notes) none to speak of. (REF/rows)^1.5 gives 0.50, 0.21
  // and 0.05 against those -- 12, 5 and 1 graph units of seam, the last of which is a fifth of
  // a pixel on screen and is the "no gap" the biggest vault wants.
  //
  // This is the third thing to stand where gapScale's note-count ramp used to. It is the same
  // intent -- less seam as a vault grows -- against a quantity that actually describes the
  // geometry rather than standing in for it.
  var SEAM_ROWS = 0.075;    // of a row pitch, at REF_ROWS

  // AND NEVER MORE THAN THIS, whatever the pitch does. The seam is a fraction of the live
  // pitch, which is right -- a sparse ring wants a proportionally sparse seam -- until the
  // pitch itself runs away: a heavily filtered band spreads its spacing by up to DENSITY_MAX,
  // and a seam riding that comes out several times wider than any gap on a full disc. On a
  // mostly-hidden demo vault it ate visible arcs out of the ring, which reads as the circle
  // not being closed rather than as a wide seam.
  //
  // Against UNIT and not against the live pitch, because the point is to bound the runaway
  // rather than to scale with it.
  var SEAM_MAX_ROWS = 0.16;
  var REF_ROWS = 5;
  var SEAM_FALL = 1.5;      // (REF_ROWS / rows) ^ this
  var GAP_FULL_TO = 1000;     // pre-lock fallback only, from here down
  var GAP_ZERO_AT = 10000;
  function gapScale() {
    var n = graph.order;
    if (n <= GAP_FULL_TO) return 1;
    if (n >= GAP_ZERO_AT) return 0;
    return 1 - (n - GAP_FULL_TO) / (GAP_ZERO_AT - GAP_FULL_TO);
  }

  // The angle that buys SEAM_ROWS of row pitch at this band's outer edge, or the legacy
  // rule if the geometry is not locked yet. `frac` lets sub-gaps ride the same width.
  // How much of the base separation a band of this depth gets. The band's OWN depth, because
  // the two rings differ and a shallow inner ring should not be held to the outer one's seam.
  function seamFall(band) {
    var k = band === "i" ? "i" : "o";
    var rows = lastRows[k] || REF_ROWS;
    return Math.pow(REF_ROWS / Math.max(1, rows), SEAM_FALL);
  }

  function seamAngle(band, frac) {
    var k = band === "i" ? "i" : "o";
    var r = geomLock && geomLock.bandR ? geomLock.bandR[k] : 0;
    if (!r) return SLICE_GAP * Math.PI / 180 * gapScale() * frac;
    var w = SEAM_ROWS * seamFall(band) * pitchUnits(band);
    var cap = SEAM_MAX_ROWS * UNIT;
    if (w > cap) w = cap;
    return (w * frac) / r;
  }

  function gapFor(nGroups, band) {
    var g = seamAngle(band, 1);
    return g * nGroups > Math.PI ? Math.PI / Math.max(1, nGroups) : g;
  }

  // THE SEAM AT ONE RADIUS, and the arc left over for wedges there. Called per note, because
  // the whole point is that the answer differs per row -- a constant width costs a different
  // angle at every radius.
  //
  // The clamp is the affordability rule the band allocation already had, applied here because
  // this is now where the total is known: near the hub a fixed width is a large angle, and a
  // deep enough inner ring could otherwise spend the whole circle on seams. Scaling the seam
  // rather than refusing it keeps the arithmetic continuous, so an inner row does not jump
  // when a group arrives.
  var SEAM_CAP = 0.45;      // of the circle, at any one radius
  // THE BOUNDARY, STATED AS WHAT IT ACTUALLY CONTROLS: how much further apart two notes are
  // across a wedge boundary than two notes inside one.
  //
  // It used to be stated as "half a row pitch of margin, plus this note's own radius, at each
  // end" -- and that phrasing is why three rounds of shrinking the SEAM changed nothing a
  // person could see. Measured, the boundary came to 1.43, 1.47 and 1.46 times a normal step
  // on the three vaults: the same ratio everywhere, and almost none of it the seam. The
  // additive radius was most of it, worth ~126 units of extra width at every boundary on the
  // disc, and the seam it dwarfed was 24 falling to 12.
  //
  // Half a pitch per side with nothing added is the ZERO point: two wedges each holding their
  // end note half a step in from their own edge puts those two notes exactly one step apart,
  // which is a boundary you cannot see. Everything above that is the seam a person reads, so
  // that is the number to name and to scale.
  //
  // EXCESS_BASE is what the disc had (0.44 of a step) and the falloff takes it from there, so
  // "half for a five-row band, a quarter at nine, none at twenty-three" is what comes out.
  var MARGIN_ROWS = 0.5;    // the zero point: half a pitch from the wedge edge, per side
  // HOW MUCH OF THE CHANNEL TO KEEP at REF_ROWS. The channel is what a boundary has OVER one
  // ordinary step, and this scales exactly that -- so 0.5 means "half the gap you can see",
  // which is what was asked for, rather than half of some term that turns out to contribute
  // little of it.
  //
  // Two earlier attempts moved the wrong number. Shrinking the SEAM took it from 24 units to
  // 12 and changed the measured channel from 1.60 to 1.60 -- the seam is a tenth of it. Adding
  // an excess ON TOP of the existing margin made it wider still (1.60 -> 1.90), because the
  // margin and the dot term were already the whole excess. Measured channels over an ordinary
  // step, before any of this: 1.60, 1.72, 1.52 on the three vaults -- so the excess to scale is
  // 0.60, 0.72 and 0.52 of a step, and it is emergent rather than a constant anyone set.
  var EXCESS_KEEP = 0.35;   // of the channel, at REF_ROWS

  // A TYPICAL dot's radius, in graph units. The end margin corrects for how this note differs
  // from typical rather than adding its whole radius: adding it made every boundary wider by
  // two radii, where the thing it was for -- both dots' EDGES equidistant from the seam -- only
  // needs the DIFFERENCE between them. A hub steps in, a leaf steps out, and a boundary between
  // two ordinary notes costs nothing at all.
  // PER BAND, because the correction is "how does this note differ from a typical one" and a
  // typical note is not the same size in both rings: the two bands have their own spacing, so
  // their dots have their own scale. Measuring against the outer band's typical dot inflated
  // every inner-band margin by the difference -- measured, the inner ring's channel sat at
  // 1.52 of a step against the outer ring's 1.20, with the zero point already correct at 1.03.
  // A correction whose average is not zero is not a correction, it is a bias.
  var DOT_TYP_I = 0, DOT_TYP_O = 0;
  var dotTyp = function (band) { return band === "i" ? DOT_TYP_I : DOT_TYP_O; };
  function measureDotTyp() {
    var sizes = [];
    graph.forEachNode(function (id, a) { sizes.push(a.size || 4); });
    sizes.sort(function (x, y) { return x - y; });
    var mid = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 4;
    DOT_TYP_I = dotUnits(mid, "i");
    DOT_TYP_O = dotUnits(mid, "o");
  }

  // A DOT'S RADIUS IN GRAPH UNITS. The layout needs a length, and `size` is in pixels -- but
  // the biggest dot is now pinned at DOT_OF_PITCH of the row pitch (see measureSizeScale), so
  // the conversion is a ratio of constants with no camera in it. That is the whole reason the
  // size rule was written that way round: a zoom-dependent radius could not be used here.
  // A dot's radius in graph units. The LIVE pitch, and per band: a dot is drawn against the
  // spacing it actually has, which is the whole point of solving that per ring. `band` is "i"
  // or "o"; anything else takes the outer, which is the one a caller without a band is
  // almost certainly asking about.
  function dotUnits(size, band) {
    var z = size || 4;
    if (z > NODE_MAX) z = NODE_MAX;
    var sp = band === "i" ? (lastSPI || 1) : (lastSP || 1);
    return DOT_OF_PITCH * UNIT * sp * (z / NODE_MAX);
  }

  function seamAt(r, nBoundaries) {
    var g = r > 1e-6 ? (SEAM_ROWS * pitchUnits()) / r : 0;
    var tot = g * nBoundaries;
    var cap = 2 * Math.PI * SEAM_CAP;
    if (tot > cap) { g *= cap / tot; tot = cap; }
    return { gap: g, avail: 2 * Math.PI - tot };
  }

  // ONE allocator, for every caller that divides the circle among cells.
  //
  // There were THREE copies of this arithmetic: share() in buildWedgePlan, the allocation
  // in ringsLayout, and a dead gapPlan/availPlan pair that was computed and never read.
  // Two of them counted groups with an INTEGER, and the one that positions the wedges is
  // where the toggle jump lived for an entire afternoon -- fixing the other one first
  // changed nothing visible and looked like the fix had failed.
  //
  // The differences between the two live callers are real, so they are OPTIONS rather than
  // one copy having quietly forgotten something:
  //
  //   subGaps   buildWedgePlan spends no sub-gaps. Its output is the reference width the
  //             row counts are solved against, not a rendered arc.
  //   clamp     only the rendered allocation can overflow the circle, because only it
  //             spends sub-gaps; it shrinks gap and subGap together rather than eating
  //             into the wedges.
  //   totFloor  the two callers floor the weight total differently (1e-4 vs 1e-6).
  //             Preserved exactly -- unifying it would move every wedge for no reason.
  //
  // PRESENCE IS "IS ANYTHING HERE", NOT "HOW FULL IS IT". A wedge earns one gap by
  // existing; a folder showing 30 of its 100 notes is one wedge and wants one gap, exactly
  // as it did at 100. So the gap total must not be a function of the note count -- and for
  // a long time it was, twice over.
  //
  // Weight over seats was the reading before, and it fails in both directions. Its own
  // note recorded the failure it was chosen to avoid -- weight ALONE keeps a 55-note folder
  // pinned at 1 all the way down to its last note and then collapses in two frames -- but
  // the denominator brought a worse one: seats are whatever the current plan happens to
  // seat, so the same group reads 0.3 mid-animation, 0.48 at rest with a range applied, and
  // 1.0 once the departed notes leave the plan. Measured: nG 7 -> 3.38 across settle() on a
  // date change, and 6.716 -> 7 merely from scrubbing the timeline.
  //
  // Both problems have one answer, and it is not a better formula here. The COLLAPSE case
  // is a group on its way out, and a group on its way out is something the cascade knows
  // about before the first frame -- so it supplies the presence itself, walked from 1 to 0
  // across the whole animation (opts.groupPres). What is left for this function is only
  // "does this group have anything at all", which min(1, weight) answers, ramps smoothly
  // over the first or last note's fade, and does not care how many notes there are.
  //
  // Seats are therefore not consulted at all any more, and the parameter is gone: every
  // reading of them was a way of dividing by a number that had nothing to do with the
  // question.
  //
  // ...EXCEPT WHEN THE PLANNER SUPPLIES IT (opts.groupPres). Weight over seats is the right
  // reading of "how present is this group" only while the seats are the group's own final
  // count. During a cascade they are not: the plan is rebuilt every frame from what is
  // still on screen, so a group that KEEPS 30 of its 100 notes reads 30/100 = 0.3 while
  // the departing 70 are still seated, and 1.0 the moment they leave the plan. Nothing
  // about that group's gap should have moved -- it is still there, still one wedge, still
  // entitled to one gap -- and the whole reservation moved twice instead.
  //
  // A legend toggle never showed it, which is why it survived: hiding a folder takes every
  // note in it to zero together, so presence runs 1 -> 0 cleanly and the survivors stay
  // pinned at 1. Only a filter that thins groups WITHOUT emptying them separates the two
  // readings, and the date range is the first such filter this page has had.
  //
  // So the cascade hands in a presence walked between the two packings by its own progress,
  // exactly as it already does for row counts -- one planner, one clock, and a group's gap
  // is about whether the group is there rather than how full it is.
  function allocateBand(list, weightOf, opts) {
    var TWO = 2 * Math.PI;
    var tot = 0, gw = Object.create(null);
    list.forEach(function (c) {
      tot += weightOf(c);
      var g = gw[c.g] || (gw[c.g] = { w: 0 });
      g.w += weightOf(c);
    });
    var presOf = function (c) { return Math.min(1, weightOf(c)); };
    var given = opts.groupPres || null;
    var groupPres = Object.create(null), nG = 0;
    Object.keys(gw).forEach(function (k) {
      var p = (given && given[k] !== undefined) ? given[k] : gw[k].w;
      groupPres[k] = p < 0 ? 0 : p > 1 ? 1 : p;
      nG += groupPres[k];
    });
    var nSub = 0;
    if (opts.subGaps) {
      var firstOf = Object.create(null);
      list.forEach(function (c) {
        if (!firstOf[c.g]) { firstOf[c.g] = 1; return; }
        nSub += presOf(c);
      });
    }
    var gap = gapFor(nG, opts.band);
    // The SAME seam between subfolders as between folders -- see SEAM_ROWS. It stays a
    // separate name because the two are counted separately (nG against nSub) and the
    // reference allocation spends no sub-seams at all.
    var subGap = opts.subGaps ? gap : 0;
    var gapTotal = gap * nG + subGap * nSub;
    if (opts.clamp && gapTotal > TWO * opts.clamp) {
      var k = (TWO * opts.clamp) / gapTotal;
      gap *= k; subGap *= k; gapTotal *= k;
    }
    var avail = TWO - gapTotal;
    return {
      tot: tot, nG: nG, nSub: nSub, gap: gap, subGap: subGap, avail: avail,
      groupPres: groupPres, presOf: presOf,
      shareOf: function (c) { return avail * (weightOf(c) / Math.max(opts.totFloor, tot)); },
      // The share as a plain FRACTION of whatever arc is going. The rendered placement needs
      // this rather than shareOf, because the arc going depends on the radius and so cannot be
      // baked in here.
      fracOf: function (c) { return weightOf(c) / Math.max(opts.totFloor, tot); }
    };
  }

  // weightOf lets a note count as a FRACTION of a place. Density -- how many rows
  // a cell needs, how wide its reference wedge is, where the hub sits -- is a pure
  // function of these weights, so feeding it opacity makes the packing re-derive
  // continuously as notes fade instead of switching from one packing to another.
  // Every frame is therefore a valid grid, and at opacity 0 the result is
  // identical to what a plain rebuild over the survivors produces.
  // rowsOf, when given, supplies a cell's row count as a REAL number so an
  // animation can walk the integers between two packings. Without it the count is
  // the plain integer, which is what a resting disc must have: a fractional count
  // blends two grids one row apart, and at rest that reads as a smeared disc
  // rather than a packed one.
  function buildWedgePlan(onlyVisible, weightOf, rowsOf, spIn) {
    var W = weightOf || function () { return 1; };
    var all = order[state.dim] || [];
    var nested = state.dim === "folder";
    var SEP = "\u0000";
    var byCell = {}, cellsOf = {}, planTotal = 0;

    // A SUB-WEDGE HAS TO BE ABLE TO HOLD A NOTE PER ROW, or it is dead arc.
    //
    // The gate used to be the group's own size alone, which says nothing about the wedges the
    // split produces. Measured on a 454-note vault: 02 - Areas, 4 notes over 3 subfolders, came
    // out as three cells of one and two notes, each allotted a fair 4 degrees -- and a 4-degree
    // wedge at that radius holds 0.26 notes per row, so rowsNeeded gave each of them 4 rows to
    // fit one note and the other three rows were empty. Four such cells adjacent, with their
    // seams, was a 641-unit hole in one row against a 172-unit step. Same cause as dot radii
    // coming out 8 beside 60: dotFit measures the room a note has, and beside a hole that room
    // is enormous.
    //
    // COUNTED FROM WHAT IS ON SCREEN, not from the vault. The first cut of this read counts[],
    // the whole-vault tally, on the theory that a static answer cannot pop mid-animation. It
    // cannot -- and it also cannot see a filter: under a one-month range 03 - Resources still
    // split on its 138 notes while ten were showing, which is the same dead arc again, and was
    // reported in the outer ring the moment the inner one stopped doing it.
    //
    // Stability comes from WHICH membership instead of from ignoring it. willShow is the
    // DESTINATION -- what the disc is settling into -- so it does not move while a cascade
    // runs, and the live per-frame plan agrees with the destination packing throughout. The
    // answer changes exactly once, when the filter does, before any frame is drawn; planA is
    // built on the old membership and keeps the old split, planB the new, and notes interpolate
    // between the two packings the way they already do for rows and spacing. Counting alpha
    // instead would let the threshold fall mid-flight, which is a change of cell IDENTITY
    // rather than of weight, and that is the one thing the cascade cannot walk.
    var liveG = Object.create(null);
    graph.forEachNode(function (id) {
      if (onlyVisible && !(planKeep || visible)(id)) return;
      if (onlyVisible && !willShow(id)) return;
      var g0 = groupOf(id);
      liveG[g0] = (liveG[g0] || 0) + 1;
    });
    var splitOf = Object.create(null);
    var splitFor = function (g) {
      if (splitOf[g] === undefined) {
        var nSubs = (subOrder[g] || []).length;
        splitOf[g] = nested && nSubs > 1 &&
                     (liveG[g] || 0) >= Math.max(NEST_MIN, nSubs * REF_ROWS);
      }
      return splitOf[g];
    };

    graph.forEachNode(function (id) {
      // While a cascade runs, "who gets a slot" is the UNION of what is staying
      // and what is still on screen on its way out. Filtering to visible() alone
      // gave a departing note no slot at all, so nothing held its space (the
      // wedge vanished instead of closing) and it had no target position (so it
      // faded at stale coordinates on top of the reflowed disc).
      if (onlyVisible && !(planKeep || visible)(id)) return;
      var g = groupOf(id), a = graph.getNodeAttributes(id);
      var split = splitFor(g);
      var key = split ? g + SEP + subTintIndex(g, a.sub) : g;
      if (!byCell[key]) {
        byCell[key] = [];
        (cellsOf[g] || (cellsOf[g] = [])).push(key);
      }
      byCell[key].push(id);
      planTotal += W(id);
    });

    // Groups too small for a readable wedge share one. Measured here, the
    // smallest few would each need ~11 degrees to read apart -- 16% of the circle
    // for 3.4% of the notes -- so at their proportional 2-4 degrees they merged
    // into a grey mass that looked like a cluster nobody asked for.
    ringsMerged = Object.create(null);
    var big = [], smallIds = [];
    all.filter(function (g) { return cellsOf[g]; }).forEach(function (g) {
      if ((counts[g] || 0) >= SMALL_GROUP) { big.push(g); return; }
      ringsMerged[g] = true;
      cellsOf[g].forEach(function (k) { smallIds = smallIds.concat(byCell[k]); });
    });

    var cells = [];
    big.forEach(function (g) {
      var ks = cellsOf[g];
      if (nested) {
        ks.sort(function (x, y) {
          return (+(x.split(SEP)[1] || 0)) - (+(y.split(SEP)[1] || 0));
        });
      }
      // k is the cell's identity -- group plus tint slot. It is derived from
      // global data (subOrder, counts), never from which notes happen to be
      // included, so the SAME cell key means the same cell in any packing.
      // That is what lets two packings be blended cell by cell.
      ks.forEach(function (k) { cells.push({ g: g, k: k, list: byCell[k] }); });
    });
    if (smallIds.length) cells.push({ g: MERGED, k: MERGED, list: smallIds });
    if (!cells.length) return null;

    cells.forEach(function (c) {
      // Best-connected first, so hubs sit near the centre of the disc.
      //
      // Grouping a POOLED cell by subfolder first was tried, to make a highlighted
      // tail folder move as a contiguous block instead of a scatter. It is not worth
      // it: total cross-collisions only fell 9 -> 7 across the tail folders and one
      // case got WORSE (04 Weekly Summaries 0 -> 3), while it perturbs the resting
      // position of every pooled cell and costs the hubs-near-the-centre property.
      c.list.sort(function (a, b) { return hubRank[a] - hubRank[b]; });
      c.wsum = 0;
      c.list.forEach(function (id) { c.wsum += W(id); });
    });

    // Reference angles: a cell's share of the vault, fixed, so the row plan below
    // never shifts when something is hidden.
    var TOTAL = planTotal;
    var MIN = MIN_SPAN, TWO = 2 * Math.PI;
    // The disc is split into TWO bands rather than floored.
    // A cell too small for a fair wedge (its proportional angle would fall under
    // MIN_SPAN) moves to an inner ring, where it is proportional among its peers
    // over the FULL circle. Measured on this vault that turns eight 6-degree
    // slivers into wedges of 14-97 degrees, and keeps the main ring strictly
    // proportional -- flooring them in one band spent 48 degrees (13% of the
    // circle) on 26 notes (6% of the vault).
    // Decide the band per GROUP, not per cell. Deciding per cell let one of a
    // group's sub-wedges sit inner while a sibling sat outer -- 07 - Weekly
    // Reviews rendered half in the middle and half in the main ring once a
    // re-pack moved the threshold past one of its quarters. A group's sub-wedges
    // are nested inside its arc, so they belong in the same band by definition.
    var smallAt = TOTAL * (MIN / TWO);
    var groupInner = {};
    cells.forEach(function (c) {
      var small = c.wsum < smallAt;
      if (groupInner[c.g] === undefined) groupInner[c.g] = small;
      else groupInner[c.g] = groupInner[c.g] || small;   // any small cell -> inner
    });

    // THE TWO BANDS ARE INDEPENDENT. Which ring a group lives in is decided once,
    // from the data as loaded, and then never changes -- filtering must never
    // migrate a group from one ring to the other. Only a fresh load of the data
    // may reassign it.
    //
    // Without this lock the split follows whatever is on screen, and the inner
    // band is proportional over the FULL circle: a group crossing the threshold
    // part-way through a fade leaps to the inner ring and spreads over ~300
    // degrees. Measured, that put 161 surviving notes inside the departing
    // wedge's arc; it also made wedges appear in the inner ring first and then
    // jump outward.
    if (bandLock) cells.forEach(function (c) {
      if (bandLock[c.g] !== undefined) groupInner[c.g] = bandLock[c.g];
    });
    cells.forEach(function (c) { c.inner = groupInner[c.g]; });
    var inner = cells.filter(function (c) { return c.inner; });
    var outer = cells.filter(function (c) { return !c.inner; });
    // Only when there is no outer band IN THE DATA -- i.e. before bandLock exists, at
    // load, on a vault small enough that every group is a sliver. Guarding on
    // bandLock matters because this line overrides the lock applied just above, and
    // `!outer.length` is also true whenever FILTERING has hidden every outer group.
    // In that case it moved all the inner cells to the outer band's base radius, so
    // the inner ring teleported outward on the single frame the last outer note
    // stopped being present: measured, 01 - Projects went from r=479 to r=1175 in one
    // frame, a 696-unit jump, at frame 206 of 210 with the outer band already still.
    // An empty outer band is a legitimate state -- the disc is just the inner ring,
    // small, which is what "fewer notes make a smaller disc" means here.
    if (!outer.length && !bandLock) {    // tiny vault: one band, no split
      inner.forEach(function (c) { c.inner = false; });
      outer = cells; inner = [];
    }

    // Reference width only -- no sub-gaps, no clamp. See allocateBand for why those are
    // options rather than an oversight.
    var share = function (list, band) {
      var a = allocateBand(list,
                           function (c) { return c.wsum; },
                           { subGaps: false, clamp: null, totFloor: 0.0001, band: band });
      // Recorded so the probe can show the gap total shrinking frame by frame -- the whole
      // point of making it continuous is that this series has no cliff in it.
      lastGapN[band] = Math.round(a.nG * 1000) / 1000;
      list.forEach(function (c) { c.band = a.shareOf(c); });
    };
    share(inner, "i");
    share(outer, "o");

    // The row COUNT has to follow the live span, or density collapses: isolate a
    // 55-note folder with the reference locked and it keeps 7 rows sized for its
    // ~47-degree share of the whole vault while now spanning 360, so it draws as a
    // scattered cloud across 7 sparse rings instead of a disc.
    //
    // Taking it live is safe in a way that is worth spelling out. cum[] below is
    // built from cap[row] / capSum, and a constant factor on every capacity
    // cancels in that ratio -- so WHICH notes land in WHICH row depends only on
    // the row count, never on the span. The span therefore has exactly one effect,
    // the count, and the count is walked by animation progress rather than read
    // off the live weights, so it changes smoothly.
    cells.forEach(function (c) { c.bandRef = c.band; });

    // Uniform density fills an annulus, so n notes need pi*(R^2 - r0^2) of area.
    // Fixing the hole at a FRACTION of the outer radius and solving for r0 keeps
    // the hub the same relative size whether 440 notes are showing or 55 -- a
    // fixed r0 gave a 32% hole at full size and a 69% one when filtered down.
    // THE DENSITY KNOB (github#13). SP is the lattice spacing -- radial between rows
    // AND tangential along them, which is what makes the packing uniform -- and it was
    // a hard 1. That made the disc a function of how many notes the VAULT holds rather
    // than how many are on screen: measured, screen row pitch was 19.481px at every
    // filter state of a 500-note vault and 12.064px at every state of a 1500-note one,
    // so filtering 503 notes down to 62 moved the median dot from 4.254px to 4.208px
    // and left 25% of the disc's radius as empty margin.
    //
    // Solve it instead. A lattice of spacing s holds 1/s^2 notes per unit area, so an
    // annulus with a hole at HOLE*R holds n = pi*R^2*(1-HOLE^2)/s^2, i.e.
    // R = s*sqrt(n / (pi*(1-HOLE^2))). Setting that equal to the FULL-vault R gives
    //
    //     s = sqrt(n_full / n_visible)
    //
    // exactly -- not an approximation, the same uniform-density assumption the r0
    // formula below already makes. The disc then always fills its box, notes move
    // outward as their neighbours leave, and each one gets proportionally more room.
    //
    // CONTINUOUS, WHICH IS THE WHOLE POINT. The retired REPACK_BELOW mechanism below
    // switched plan basis at 55% and its three failures were all failures of the
    // THRESHOLD: inconsistent either side, two packings inside one animation, and call
    // sites disagreeing about which side they were on. A smooth function of the visible
    // weight has no side to be on. It also holds the two invariants for free -- a
    // departing note sits at weight 0 and contributes nothing to planTotal, so
    // zero-weight invariance survives; and both the lean and padded plans derive it
    // from their own planTotal, so parity survives.
    //
    // Capped, because sqrt grows without bound: one surviving note would otherwise be
    // one boulder on the rim. At DENSITY_MAX the disc stops filling the box and starts
    // shrinking again, which is the honest end of the behaviour rather than a cliff.
    var HOLE = 0.3;
    // SUPPLIED, DURING A CASCADE, for the same reason rowsOf is. Deriving it here from
    // planTotal is right at rest and wrong mid-animation: the cascade weights membership
    // by alpha, so planTotal slides every frame and the lattice breathed with it --
    // measured, biggest single-frame radial step went from 0 to 94 units against a row of
    // 160, i.e. the whole disc shifting half a row per frame. The cascade hands in the
    // interpolation between its two endpoint packings instead, exactly as it does for
    // rows, so the last frame and rest agree by construction.
    var fullTotal = geomLock && geomLock.total > 0 ? geomLock.total : planTotal;
    var density = (spIn && typeof spIn === "object") ? (spIn.o || 1)
      : spIn > 0 ? spIn
      : (planTotal > 0.0001
          ? Math.min(DENSITY_MAX, Math.sqrt(fullTotal / planTotal)) : 1);
    var SP = density;

    // ...AND THEN ONE PER BAND, because the two rings are packed independently and a single
    // spacing makes each answer for the other's filtering.
    //
    // Hiding OUTER folders raises the disc-wide density -- fewer notes on screen, same box --
    // so the inner ring spreads outward even though its own occupancy never changed, while the
    // outer ring loses rows faster than the spreading puts back. The two close on each other.
    // Measured on the 1402-note vault, hiding outer groups one at a time: the inner ring's
    // outer edge went 1528 -> 1767 -> 1954 -> 2552 while the outer ring's fell 3761 -> 3762 ->
    // 3375 -> 3030, and the clear space between them collapsed 843 -> 89 units.
    //
    // A band's spacing is now solved from ITS OWN occupancy, so hiding a folder moves the ring
    // that folder is in and leaves the other one alone.
    //
    // Only once the split is LOCKED. Before that -- the one plan that produces bandLock -- the
    // split is what the balancer is still searching for, so per-band totals would depend on the
    // candidate being scored. That plan is the unfiltered one, where the density is 1 and the
    // two are the same number anyway.
    // HANDED IN DURING A CASCADE, never re-derived per frame. github#13 already established
    // this for the single spacing -- "hand the cascade its spacing instead of letting it
    // re-derive one per frame" -- and making the spacing per band quietly broke it: spIn fed
    // only `density`, so the two bands went back to solving themselves from the live weights on
    // every frame.
    //
    // That is visible and it is ugly. The row counts are integers and the rim solve below lands
    // on them, so a spacing re-derived per frame is a step function of the frame: the disc
    // jiggles, the inner ring stops animating at all because its own occupancy has not changed
    // enough to move its solve, and then it jumps when the solve finally ticks. Reported as
    // exactly that, disabling 04 and then 03.
    //
    // Walked between the two packings' own values, it is smooth by construction -- and the rim
    // pin comes along for free, because each endpoint solved its own pin at rest.
    var given = (spIn && typeof spIn === "object") ? spIn : null;
    // The band room, when the caller is walking it between two packings. Same channel as the
    // spacing, because it is the same kind of quantity and must not be re-derived per frame.
    var givenRoom = given && given.room ? given.room : null;
    var SP_I = given && given.i > 0 ? given.i : SP;
    var SP_O = given && given.o > 0 ? given.o : SP;
    var bandDensity = function (cells, key) {
      if (!geomLock || !geomLock.bandTotal) return SP;
      var full = geomLock.bandTotal[key] || 0, now = 0;
      cells.forEach(function (c) { now += c.wsum; });
      if (!(full > 0.0001) || !(now > 0.0001)) return SP;
      return Math.min(DENSITY_MAX, Math.sqrt(full / now));
    };
    var r0 = geomLock ? geomLock.r0 : Math.max(1.5, HOLE * Math.sqrt(
      Math.max(1, TOTAL) / (Math.PI * (1 - HOLE * HOLE))));

    // Rows needed to hold n notes, accumulating each row's capacity. The capacity
    // is proportional and unfloored, for the same reason as in placeCell: flooring
    // it clamped a narrow cell's rows to one note each, so a 19-note cell asked
    // for 8 rows and drew as a thin sparse spoke instead of a packed wedge.
    //
    // A CELL WITH NO WEIGHT NEEDS NO ROWS, and the floor below is why that has to be said
    // out loud. A departing cell stays seated in the plan at weight 0 while it fades, so
    // `Math.max(1, k)` handed it one row anyway -- and that row reaches the band
    // balancer's split search, which is how 738 zero-weight members moved the hub radius
    // and put the padded plan's maxR one row outside the lean plan's (github#5). The
    // cascade's row recorder already worked around the same floor by hand; the geometry
    // never did.
    // `sp` defaults to the disc-wide spacing, which is what the balancer wants: it is scoring
    // candidate splits and there is no per-band answer until one is chosen.
    function rowsNeeded(span, n, st, sp) {
      if (!(n > 0)) return 0;
      var p = sp > 0 ? sp : SP;
      var i = 0, r = st, k = 0;
      while (i < n && k < 500) { i += Math.max(0.05, span * r / p); r += p; k++; }
      // NEVER MORE ROWS THAN NOTES. The loop answers "how many rows of THIS arc does it take
      // to hold n notes at the lattice pitch", and for a narrow arc that answer exceeds n --
      // measured, a 4-degree wedge holds 0.26 notes per row, so one note was told it needed
      // four rows. One note fits in one row. It does not FILL one, which is a different thing
      // and not one that more rows repair: the extra rows are empty, they are dead arc in
      // every row the cell fails to reach, and because the band's depth is the deepest cell in
      // it, a single note in a small folder was setting a whole band four rows deep.
      //
      // That depth is what made the dots uneven. Rows are filled in proportion to their arc,
      // so the angular STEP should be one pitch everywhere -- but a row holds an integer
      // number of notes, and the shortest arc takes the worst rounding. A row with capacity
      // 2.5 given 3 notes is 20% crowded where a row with capacity 20 given 21 is 5%, dotFit
      // shrinks by exactly that, and the innermost row -- always the shortest -- always loses.
      // Reported as inner rows carrying visibly smaller dots than the rows outside them.
      // Fewer, fuller rows is the fix: the same notes over less depth round better.
      var cap = Math.ceil(n - 1e-9);
      return Math.max(1, cap > 0 && k > cap ? cap : k);
    }

    // The edge inset, per cell, from the cell's own band base. Held here so the row
    // count and the placement agree: capacity above is "one note per row-pitch of
    // arc", so if placement only uses (1 - 2*pad) of the arc and the count does not
    // know, the innermost row is handed more notes than it has room for. That was
    // measured as 2 crowded pairs in the month cells at 2.5-3.1px.
    function padFor(base, ref) {
      var refArc = base * (ref || 0) * UNIT;
      return refArc > 1e-6 ? Math.min(EDGE_PAD_MAX, EDGE_PAD_ARC / refArc) : 0;
    }
    // The span the notes actually occupy, which is what density must be solved for.
    function usableRef(c, base) {
      c.pad = padFor(base, c.bandRef);
      return c.bandRef * (1 - 2 * c.pad);
    }

    // Hoisted above the balancer, which needs it to place the outer base.
    // In LATTICE units, so it scales with SP: the gap between the rings has to stay the
    // same number of rows wide as the rows spread apart, or a filtered disc shows two
    // bands nearly touching where the full one showed a clear channel.
    var GUTTER = 1.6 * SP;

    // The inner ring is deliberately THINNER than the outer, not equal to it. Equal
    // thickness was tried first and reads oddly: the inner band sits at a smaller radius,
    // so the same thickness there is a much larger share of its own annulus and the middle
    // of the disc looks heavy. 0.75 was the next attempt and still read as two competing
    // rings; a little over half lets the outer ring carry the disc outright and the inner
    // read as subordinate to it.
    //
    // A TARGET, not a guarantee. Rows are integers, so the reachable ratios are a coarse
    // grid -- on a 450-note vault a single row is a third of a band -- and the two hard
    // rules (no small folder in the outer ring; see PIN_BELOW) come first. The balancer
    // gets as close as the constraints allow and the suite reports what it achieved.
    var BAND_RATIO = 0.55;   // target inner thickness as a fraction of the outer

    // BALANCE THE TWO BANDS' THICKNESS by moving whole groups between them.
    //
    // Size alone decides badly. Every group too small to earn its minimum wedge goes
    // inner, and on a large vault that is most of them -- measured on a 10,000-note
    // fixture, inner came out 35 rows deep against the outer band's 9. Two rings of
    // wildly different thickness read as a mistake rather than as two bands.
    //
    // THIS HAS TO RUN HERE, not where the split is decided. A first version sat next to
    // the size threshold ~150 lines up and was a silent no-op: `r0` is declared below it,
    // so `var` hoisting made it `undefined`, rowsNeeded returned 1 for every group, no
    // move ever looked like an improvement, and the measured thickness went 35/9 -> 34/9.
    // Everything the measurement needs -- r0, rowsNeeded, usableRef, GUTTER, and share --
    // only exists by this point.
    //
    // A trial has to re-run share(), because a cell's reference width is its share WITHIN
    // ITS BAND: moving one group changes the row count of every cell in both bands. That
    // is also why there is no closed form and why this is greedy descent -- repeatedly
    // make the single move that most reduces the difference, stop when none does. Groups
    // number in the tens and rowsNeeded is arithmetic, so the whole search is microseconds.
    //
    // Guarded on bandLock so it runs ONCE, on the full data, before the lock is taken --
    // the same guarantee the lock exists for. Re-balancing under a filter would migrate a
    // group between rings mid-cascade, which is the bug the lock was added to stop.
    if (!bandLock) (function balanceBands() {
      var names = [];
      cells.forEach(function (c) { if (names.indexOf(c.g) < 0) names.push(c.g); });
      if (names.length < 2) return;
      var assign = {};
      cells.forEach(function (c) { assign[c.g] = !!c.inner; });

      // SMALL FOLDERS ARE PINNED INNER. They are only in the inner ring in the first
      // place because they are too small to earn their minimum wedge, and the outer ring
      // is where that hurts most: at the larger radius a three-note folder is three lonely
      // dots holding open a 6-degree slice, and the minimum wedge distorts the
      // proportionality of every wedge beside it. Balancing must not buy an even pair of
      // rings by exiling them there.
      //
      // So the search only permutes groups the size rule put OUTER -- it may pull a big
      // group inward, and push it back out, and nothing else. That also shrinks the search
      // space enough that 16 groups still enumerate exhaustively: on the 10,000-note
      // fixture seven of the sixteen are pinned, leaving 2^9.
      // WHAT COUNTS AS SMALL IS ABSOLUTE, not a share of the vault. `smallAt` is
      // TOTAL * (MIN_SPAN / 2pi) because it answers a different question -- "is this group
      // too small to earn its minimum wedge" -- and that scales with the vault. Reusing it
      // as the pin meant a 148-note folder was "small" in a 10,000-note vault and got
      // nailed into the hub, which put 32 cells and ~550 notes in the inner ring and made
      // it 19 rows deep against the outer band's 7. No radius or assignment recovers from
      // that, and the ring came out thicker than the one outside it.
      //
      // A folder is small when it is a HANDFUL OF NOTES, at any vault size: below that it
      // is a few lonely dots holding open a minimum wedge at the rim, which is the thing
      // worth preventing. Above it, a folder can hold its own in the outer ring whatever
      // fraction of the vault it happens to be.
      //
      // On a 450-note vault this changes nothing -- smallAt is 7.5 there, so the two
      // thresholds already agree.
      var PIN_BELOW = 10;                      // notes; fewer than this never leaves the hub
      var groupNotes = {};
      var totalNotes = 0;
      cells.forEach(function (c) {
        groupNotes[c.g] = (groupNotes[c.g] || 0) + c.list.length;
        totalNotes += c.list.length;
      });
      var pinnedInner = {};
      names.forEach(function (g) {
        if (assign[g] && (groupNotes[g] || 0) < PIN_BELOW) pinnedInner[g] = true;
      });
      var movable = names.filter(function (g) { return !pinnedInner[g]; });
      if (!movable.length) return;             // nothing may move; the size rule stands

      // JOINT over the split AND the hub radius. Evaluating a split at the BASE radius and
      // only then solving r0 is two-stage and measurably wrong: on the 450-note vault it
      // chose 2/4 rows for a 0.27 ratio when 3/3 reaches 0.80, which is closer to the
      // target -- the split had been scored against a radius the layout then moved away
      // from. share() is the expensive part and depends only on the split, so it runs once
      // per split and the radius scan reuses it.
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
        // Compared as the VISIBLE BAND: n rows of notes span (n - 1) gaps, not n, so a
        // 3-row band is two pitches thick and not three. Optimising rows x pitch instead
        // put the real vault at 0.32 while the balancer believed it had 0.40 -- the
        // off-by-one is a fifth of the answer on a band this shallow. Scaled by
        // INNER_SCALE, because equal row counts are not equal drawn thickness.
        return {
          inner: Math.max(0, iR - 1) * SP * INNER_SCALE,
          outer: Math.max(0, oR - 1) * SP,
          iR: iR, oR: oR,
          // The hole as a share of the whole disc. Needed here because growing the hub to
          // hit a thickness ratio trades against the one thing HOLE exists to hold fixed.
          holeShare: (rOut + oR * SP) > 0 ? rv / (rOut + oR * SP) : 1
        };
      };

      // Best (cost, radius) for one split, scanning the hub outward. Bounded at 3x: past
      // that the hole stops being a hole and becomes the composition.
      var R0_BASE = r0;
      // THE HOLE MAY NOT RUN AWAY. HOLE is 0.3 precisely so the hub stays the same
      // FRACTION of the disc at any size -- its own note records that a fixed r0 once gave
      // "a 32% hole at full size and a 69% one when filtered down". Letting the balancer
      // grow the hub freely reintroduced that: measured, 47% of the disc on a 450-note
      // vault and 58% at 10,000, which is also why the centre logo visibly grew, since it
      // is drawn at half the hole. A little headroom above 0.3 buys most of the balancing;
      // beyond that the hole is the composition and the rings are trim.
      var HOLE_MAX = 0.36;
      var evaluate = function (a) {
        var ins = [], outs = [];
        cells.forEach(function (c) { (a[c.g] ? ins : outs).push(c); });
        // An empty band is the degenerate case the guard further up exists for, not a
        // balanced one. Price it out of the search.
        if (!ins.length || !outs.length) return { cost: Infinity, r0: R0_BASE };
        share(ins, "i"); share(outs, "o");
        cells.forEach(function (c) { c.bandRef = c.band; });

        // HOW FAR THIS SPLIT IS FROM BEING SIZE-ORDERED: the biggest folder it puts inside
        // minus the smallest it puts outside, as a share of the vault. Zero when every
        // outer folder is at least as big as every inner one -- which is exactly "the
        // largest folders are on the rim". Depends only on the split, so it is computed
        // once rather than per radius.
        //
        // TWO SIMPLER VERSIONS FAILED FIRST, and both failures say something:
        //
        //   TOTAL INNER SHARE cannot express this at all. The thickness target effectively
        //   fixes how much mass the inner band needs, so every candidate satisfying it has
        //   about the same total -- measured 27.5% before and 27.5% after, the term merely
        //   picking a different combination adding to the same figure. It moved two big
        //   folders out and pulled the second-largest in.
        //
        //   BIGGEST INNER FOLDER ALONE got the 10k vault exactly right and left the
        //   450-note one with an 11-note folder on the rim while a 59-note folder sat
        //   inside. Once the largest inner folder is fixed, moving anything smaller across
        //   does not change the term, so those candidates were ties again.
        //
        // The DIFFERENCE is the thing being asked for: not "less inside", not "nothing big
        // inside", but "nothing inside that is bigger than something outside".
        var biggestInner = 0, smallestOuter = Infinity;
        names.forEach(function (g) {
          var n = groupNotes[g] || 0;
          if (a[g]) { if (n > biggestInner) biggestInner = n; }
          else if (n < smallestOuter) smallestOuter = n;
        });
        // No outer groups is the degenerate case priced out above; guard anyway so this
        // reads as 0 rather than as -Infinity leaking into the cost.
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
                   // Priced, not forbidden: on a vault where nothing else works the least
                   // bad answer is still a slightly larger hub, and a wall would leave the
                   // search sitting on its starting point.
                   (t.holeShare > HOLE_MAX ? 4000 * (t.holeShare - HOLE_MAX) : 0);
          if (c2 < bc - 1e-9) { bc = c2; br = rv; }
        }
        return { cost: bc, r0: br };
      };
      // Fewer inner rows than outer is a PREFERENCE, not a hard rule, and that ordering
      // is forced rather than chosen. Three things were asked of this split:
      //
      //   1. no small folder in the outer ring        -- hard, and it wins
      //   2. inner rows <= outer rows                 -- preferred
      //   3. inner thickness ~= 0.75 x outer          -- target
      //
      // They are not simultaneously satisfiable. On a 10,000-note vault seven folders fall
      // under the minimum-wedge threshold and are therefore pinned inner, and those seven
      // alone need 34 rows at the hub radius -- so no assignment of the remaining nine
      // gets the inner ring below the outer's 9. The only lever that would is moving small
      // folders outward, which rule 1 forbids: an earlier version reached 20/22 rows
      // exactly by exiling them, which is what rule 1 was added to stop.
      //
      // So (2) is a weighted term. The balancer still prefers the right ordering and pays
      // for inverting, but a hard wall made every candidate infeasible and left the search
      // sitting on its starting point -- measured, 34/9 with nothing improved.
      var INVERT_WEIGHT = 0.5;   // per row of inversion, in drawn units

      // AND A FOURTH, WEAKER PREFERENCE: the big folders belong OUTSIDE.
      //
      //   4. as little of the vault inside as the rest of this allows
      //
      // The three rules above are all geometry -- thickness, row counts, hole size -- and
      // geometry does not care WHICH folders make up a band, only how many rows they need.
      // So among splits that score the same the search kept whichever it reached first,
      // and on the 10k vault that was `05 - Meeting Notes` (1679 notes) and `01 - Projects`
      // (1066) INSIDE while Journal (48), Clippings (92) and Literature Notes (148) sat on
      // the rim. Geometrically fine, and backwards: the outer ring has the circumference,
      // so that is where the folders that need room should go, and a huge folder in the hub
      // is what makes the inner band deep enough to crowd the middle.
      //
      // Expressed as a share of the vault rather than a folder count, and multiplied by SP
      // so it is in the same drawn units as everything else it is added to -- otherwise the
      // weight would mean something different at every disc size. Deliberately small: at
      // 0.275 inner share it costs about half of one row of inversion, so it breaks ties
      // and nudges near-ties, and the thickness target still wins whenever it disagrees.
      // "If possible", which is the whole of what was asked for.
      //
      // The pinned-inner folders are a constant in this term -- they cannot move, so they
      // shift every candidate equally and cannot bias the choice between them.
      var SIZE_WEIGHT = 5.0;
      var cost = function (a) { return evaluate(a).cost; };

      // EXHAUSTIVE when it is cheap, greedy when it is not. Single-move descent gets
      // stuck: on the 449-note vault it settled at a 0.32 ratio while an assignment
      // reachable only by moving two groups at once scores far better. With few groups
      // every split can simply be tried -- 9 groups is 512 candidates, and one candidate
      // is a share() pass over a few dozen cells.
      var EXHAUSTIVE_UP_TO = 14;               // 2^14 = 16384 candidates
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
        // Greedy descent, still only over the movable set. Gets stuck where exhaustive
        // does not -- measured, single-move descent settled at a 0.32 ratio on a vault
        // where a two-group move reaches 0.80 -- which is why the cheap case is exhausted.
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

      // Apply, and leave the pipeline consistent: the trials above mutated c.band and
      // c.bandRef as they went, so the winning assignment is re-shared here rather than
      // left holding whichever trial ran last.
      cells.forEach(function (c) { c.inner = !!assign[c.g]; });
      inner = cells.filter(function (c) { return c.inner; });
      outer = cells.filter(function (c) { return !c.inner; });
      share(inner, "i"); share(outer, "o");
      cells.forEach(function (c) { c.bandRef = c.band; });

      // The hub radius comes from the joint search above -- the winning split already
      // knows which radius produced its score, so it is read back rather than re-solved.
      r0 = evaluate(assign).r0;
    })();

    // Inner band first, from the hub outward; the main band starts past it.
    if (!given) {
      SP_I = bandDensity(inner, "i");
      SP_O = bandDensity(outer, "o");
    }

    // WHY THERE IS NO CONSTANT-EXTENT SOLVE HERE, having built one twice.
    //
    // Holding each ring's thickness fixed and letting the spacing fall out of it is the right
    // shape for the problem -- a disc that keeps its size under filtering is what a person
    // wants -- and it does not survive contact with the row count.
    //
    // The two relations are: rows = what this spacing needs (rowsNeeded RISES with spacing,
    // because a wider row holds fewer notes), and spacing = span / (rows - 1). The composite is
    // monotone DECREASING, so plain iteration flips between two extremes rather than settling --
    // measured on the 10k vault, the inner band landed on 31 rows at 4.096 units, a spacing 60x
    // narrower than the counts had been solved against, which drew a lattice of mostly-empty
    // rows (spread 112 against 0 for a clean band). Damping with the geometric mean converges,
    // and converges to a DEGENERATE point: as the spacing narrows the capacity per row grows
    // without bound, one row suffices, and that drives the spacing back to the cap. Measured
    // there: 18 rows at 0.313 units, spread 164.
    //
    // Fixing the spacing and NOT re-deriving the count holds the span exactly and is the same
    // failure by another route: the counts then belong to a spacing nobody drew.
    //
    // What would work is not an iteration at all. A band of thickness T over an angular span A
    // at radius r has a known area, and a square lattice of pitch s holds area/s^2 notes -- so
    // s and rows = T/s come out of one division, consistent by construction, with the count
    // never solved against a spacing it will not be drawn with. That is a rewrite of rowsNeeded
    // rather than a wrapper around it, so it is left for its own pass rather than bolted on at
    // the end of this one. The per-band density solve below is what ships: it stops the two
    // rings converging, which was the reported bug, and leaves the rim moving under heavy
    // filtering, which is measured in .ai-context/changelog-detail.md.
    var innerRows = 0;
    inner.forEach(function (c) {
      c.rows = rowsNeeded(usableRef(c, r0), c.wsum, r0, SP_I);
      if (c.rows > innerRows) innerRows = c.rows;
    });
    var rOuter = geomLock ? geomLock.rOuter
               : (inner.length ? r0 + innerRows * SP_I + 1.6 * SP_I : r0);

    var maxR = rOuter, outerRows = 0;
    outer.forEach(function (c) {
      c.rows = rowsNeeded(usableRef(c, rOuter), c.wsum, rOuter, SP_O);
      if (c.rows > outerRows) outerRows = c.rows;
      var r = rOuter + c.rows * SP_O;
      if (r > maxR) maxR = r;
    });
    // WHY THERE IS NO CORRECTION PASS HERE, having tried one.
    //
    // The open-loop solve leaves maxR a few percent past the locked extent -- measured,
    // reach 1.072 at a density of 1.023 -- and the obvious repair is to feed that back
    // and scale SP until maxR lands on the lock. It was written, and it MADE THINGS
    // WORSE: pitch * sqrt(shown) spread 1.10x -> 1.15x, because the loop drove SP back
    // to 1 in almost every state and undid the whole change.
    //
    // The reason is worth keeping, because it contradicts what this was built on.
    // Filtering a vault BARELY MOVES THE DISC'S RADIUS: maxR is the max over cells, and
    // hiding some folders leaves the deepest survivor holding all of its own notes, so
    // it still reaches the rim. Measured on the baseline, reach was 1.000 with 481, 465
    // and 382 of 503 notes showing -- there was no empty margin to reclaim at all. What
    // filtering does is make the disc SPARSER inside a radius that hardly changes.
    //
    // And that radius is quantised in whole rows. The outermost row already sits flush
    // against the box, so any spreading at all pushes it a full row out: 2.3% more
    // spacing bought 7% more radius. There is no SP between "no change" and "one row
    // over", which is exactly why a loop targeting the lock can only pick SP = 1.
    //
    // So the overshoot is accepted and handled where it belongs -- in the camera, which
    // is the thing that decides how much of the box is on screen. See fitRatio().
    // Rows sit SP apart in every cell -- spacing is never rescaled per cell, which
    // is what keeps density uniform. Each cell's first row is at its band's inner
    // edge, so columns grow outward and a cell ends where its notes run out.
    // Lay a cell's notes out on a grid of exactly `rows` rows. Position is a
    // continuous function of how far through the cell's weight a note sits: s
    // slides smoothly, the row changes only where s crosses a row boundary, and
    // the serpentine keeps u continuous across that boundary (an even row ends at
    // u = 1 and the next row starts at 1 and runs back down).
    // Where a note sits, as ONE continuous formula. Capacity grows linearly with
    // radius, so the cumulative capacity up to a continuous row x is proportional
    // to base*x + SP*x^2/2. Inverting that turns "how far through this cell's
    // weight am I" straight into a row coordinate, with no binning step anywhere.
    //
    // This replaced blending two adjacent integer grids. That blend was the last
    // source of jumps: a note's row differs by up to one between the two grids,
    // and the serpentine parity can differ with it, so u could swing from one end
    // of the wedge to the other -- measured at 1996 units in a frame. Here the row
    // count may be fractional and the coordinate simply slides: the row ticks when
    // the coordinate crosses a boundary, and the triangle wave keeps u continuous
    // across that tick (an even row runs 0 -> 1, the next runs 1 -> 0).
    function placeCell(c, rows, base, bandRows) {
      // The spacing of the band this cell is in -- rows sit this far apart, and the capacity
      // arithmetic below inverts against the same number.
      var SP = c.inner ? SP_I : SP_O;
      var live = [], dead = [];
      c.list.forEach(function (id) { (W(id) > 0.0001 ? live : dead).push(id); });
      var seq = live.concat(dead);
      var wTot = 0;
      live.forEach(function (id) { wTot += W(id); });

      var total = base * rows + SP * rows * rows / 2;
      // Computed from the cell's FIXED reference width, never the live span, for the
      // same reason its row count is: a pad that moved with other folders' weights
      // would slide every note sideways whenever anything else was toggled.
      // Reuses the pad the row count was solved with (see usableRef), so placement
      // and density cannot disagree. Recomputing it here is the fallback for a plan
      // built before that ran.
      var pad = typeof c.pad === "number" ? c.pad : padFor(base, c.bandRef);
      var span = 1 - 2 * pad;
      // PASS 1 -- which row each note lands in. Unchanged: a continuous row
      // coordinate inverted out of the cumulative capacity, so the count may be
      // fractional and the row simply ticks as it crosses a boundary.
      // A CELL WITH FEWER NOTES THAN ITS BAND IS DEEP GOES DOWN THE RADIUS, one note per row,
      // as a block centred in the band.
      //
      // The capacity inversion below is the right answer for a cell that fills its arc and the
      // wrong one for a narrow cell that cannot. A 4-degree wedge holds a quarter of a note per
      // row, so its notes pile into the innermost rows and the rest of its arc is empty at
      // every radius outside them -- and because a cell holds its arc for the WHOLE band, that
      // emptiness is a hole in every row it fails to reach. Measured on a 454-note vault, one
      // pair of folders had a gap between them at every date range tried: 1111, 1148, 1027 and
      // 1614 units against row medians of 331 to 767. Capping the row count moved that hole
      // outward instead of closing it, since the dead rows simply changed ends.
      //
      // One note per row occupies the arc at every radius the cell spans, so there is nothing
      // left to be a hole. Each note is then alone in its row, which the angular pass already
      // centres.
      //
      // CENTRED, and on INTEGER rows. A block of n rows in a band of R leaves R-n to divide,
      // and half of an odd remainder is a fractional row -- which is off the lattice, and the
      // lattice is a stated invariant with a check behind it. Rounded, so a one-row remainder
      // lands on one side rather than half a row off on both.
      var centred = bandRows > 0 && live.length > 0 && live.length < bandRows;
      var cStart = centred ? Math.round((bandRows - live.length) / 2) : 0;
      var recs = [], acc = 0;
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
        // The row is an INTEGER bucket, and the radius comes from it, so every frame
        // is a packed grid rather than a blend of two.
        //
        // Taking the radius from the continuous coordinate instead was tried on
        // 2026-08-22 and reverted the same day. It does remove the end-of-toggle
        // teleport -- measured, 04's worst single-frame step fell 160 -> 2 -- but it
        // puts every note off-lattice on every intermediate frame, which reads as a
        // smeared disc for the whole animation. That is the same failure the row-count
        // note above describes at rest, and trading one bad frame for ~120 mushy ones
        // is the wrong way round. See the changelog.
        // seq is live-then-dead, so an index past the live count is a note on its way out; it
        // keeps the last row of the block rather than inventing one below it.
        recs.push({ id: id, w: w,
                    row: centred ? cStart + Math.min(idx, live.length - 1) : Math.floor(pp) });
      });

      // PASS 2 -- where in that row it sits, measured WITHIN THE ROW rather than
      // taken from the fractional part of pp. This is the whole fix for sub-wedges
      // needing a wide gap.
      //
      // `frac` is where the cumulative sum happened to be when it crossed an integer,
      // which is arbitrary in [0,1) -- so a note could land hard against a wedge
      // edge, and the only thing separating it from the neighbouring sub-wedge's edge
      // note was the angular gap. Measured, that put pairs 17-67 graph units apart
      // where two dots need ~126, and shrinking the dot cap to 8 did not help because
      // the separation was the problem, not the size.
      //
      // A note's own half-share of its row's weight is its margin, so the first and
      // last notes of every row sit half a step in from the edges automatically --
      // half a row pitch, ~80 units, which is the clearance that was being bought
      // with a 10-22% inset before. Rows in adjacent sub-wedges now meet one step
      // apart, so they read as continuing each other.
      //
      // Weight-based, not `(i + 0.5) / n`, so it stays animation-safe: a fading note
      // gives up its share continuously instead of vanishing from the distribution.
      // And crossing a row boundary is still continuous because the serpentine
      // reverses -- the last note of row k and the first of row k+1 both sit near
      // u = 1.
      // Each row's total, and the half-share its FIRST and LAST notes would take. Those two
      // are what the margin used to be, and they are what gets stretched away below.
      var rowW = Object.create(null), rowFirst = Object.create(null), rowLast = Object.create(null);
      // ...and how fat the notes at the two ends of each row are. The margin is measured to a
      // note's EDGE, so the end notes' own radii are part of where their centres go.
      var edgeA = Object.create(null), edgeB = Object.create(null);
      recs.forEach(function (r) {
        rowW[r.row] = (rowW[r.row] || 0) + r.w;
        if (rowFirst[r.row] === undefined) rowFirst[r.row] = r.w;
        rowLast[r.row] = r.w;
        var dz = dotUnits(graph.getNodeAttribute(r.id, "size"), c.inner ? "i" : "o");
        if (edgeA[r.row] === undefined) edgeA[r.row] = dz;
        edgeB[r.row] = dz;
      });
      var rowAcc = Object.create(null);
      var out = [];
      recs.forEach(function (r) {
        var before = rowAcc[r.row] || 0, tot = rowW[r.row] || 0;
        var t = tot > 1e-9 ? (before + r.w / 2) / tot : 0.5;
        // STRETCHED TO FILL THE WEDGE, so the margin can be added as a constant arc instead of
        // being whatever half a note's share happens to come to here.
        //
        // The weight-based centring above leaves the first note at half its own share from 0
        // and the last at half of its own from 1. That margin is half a column pitch only
        // where a wedge's notes-per-row matches the disc's density; a wedge holding two notes
        // in a row has a share-per-note far wider than the lattice, so it held its end notes
        // much further in than a dense neighbour did -- and the channel between the two
        // stopped being centred on the boundary they share. Measured on the wrap seam at 12
        // o'clock: the outer band, dense and uniform, sat within 0.35 degrees, while the inner
        // band wandered to 4.5 -- 67 units, and visibly off.
        //
        // Taken from the row's own first and last weights rather than from each note's, so the
        // map is monotone: a per-note stretch reorders neighbours as soon as their weights
        // differ, which during a fade is always.
        var hA = tot > 1e-9 ? (rowFirst[r.row] || 0) / (2 * tot) : 0;
        var hB = tot > 1e-9 ? (rowLast[r.row] || 0) / (2 * tot) : 0;
        var keep = 1 - hA - hB;
        if (keep > 1e-9) t = (t - hA) / keep;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        rowAcc[r.row] = before + r.w;
        var rr = (base + r.row * SP) * (c.inner ? INNER_SCALE : 1);
        var u0 = (r.row % 2 === 1) ? 1 - t : t;
        // The serpentine reverses odd rows, so which end of the WEDGE this row's first note
        // sits at flips with it. The allowances flip with it too, or the fat note gets the
        // thin note's clearance every other row.
        var eA = edgeA[r.row] || 0, eB = edgeB[r.row] || 0;
        out.push({ id: r.id, r: rr, u: pad + u0 * span,
                   eA: (r.row % 2 === 1) ? eB : eA,
                   eB: (r.row % 2 === 1) ? eA : eB });
      });
      return out;
    }

    cells.forEach(function (c) {
      var base = c.inner ? r0 : rOuter;
      // At rest this is the integer count, so rows land on the lattice. During a
      // cascade it is walked from the source count to the destination's, and the
      // formula above takes a fractional count directly.
      var rf = rowsOf ? rowsOf(c) : c.rows;
      if (!rf) rf = c.rows;
      c.slots = placeCell(c, rf, base, c.inner ? innerRows : outerRows);
    });

    // THE ROOM EACH BAND HAS, as a property of the PLAN. dotPx sizes a whole band from one
    // figure so that size stays monotone in link weight; that figure has to come from here
    // rather than from the placed notes, for the same reason the spacing does. Derived per
    // frame from live weights it is a step function of the frame -- notes per row is an INTEGER
    // -- and every dot in the band breathed for the length of a cascade, measured at 252% in a
    // single frame with 72 of 122 frames moving more than 5%.
    //
    // Handed in during a cascade, exactly as the spacing and the gap presence are, so the last
    // frame and rest agree by construction rather than by coincidence.
    var roomOf = function (list) {
      var v = [];
      list.forEach(function (c) {
        if (!c.slots || !c.slots.length) return;
        var rn = Object.create(null);
        c.slots.forEach(function (sl) { rn[sl.r] = (rn[sl.r] || 0) + 1; });
        c.slots.forEach(function (sl) {
          var n = rn[sl.r] || 1;
          var step = (c.band || 0) * sl.r * UNIT / n;
          if (step > 1) v.push(step);
        });
      });
      if (!v.length) return 0;
      v.sort(function (x, y) { return x - y; });
      // A TENTH PERCENTILE, and the two neighbouring choices were both measured and are both
      // worse. The MINIMUM is the only value that cannot overlap, and one tight pair then sets
      // the size for its whole band -- the inner band's median dot came out at a quarter of
      // what its room allowed. The FIFTH is not a small step from the tenth: the low tail is
      // notes sitting in wedges only a few degrees wide, and it is steep enough that moving one
      // notch collapsed every dot in the vault onto the pixel floor, diameter over step 0.02 to
      // 0.10. The tenth holds 0.31 to 0.43 across every range with a single overlapping pair,
      // 19 units on a step of 330, at one of them.
      return v[Math.floor(v.length * 0.1)];
    };
    var roomPlan = givenRoom || { i: roomOf(inner), o: roomOf(outer) };

    // A BAND'S DEPTH, FRACTIONAL WHILE A CASCADE RUNS. The integer c.rows is what places notes
    // on the lattice, and it is the wrong thing to REPORT: this figure becomes lastRows, and
    // seamFall is a function of it -- (REF_ROWS/rows)^1.5, which multiplies every channel width
    // and every end margin on the disc.
    //
    // Measured on a folder toggle: rowsOuter went 5 to 4 in one frame and the falloff went 1 to
    // 1.398 with it, so every seam in the ring widened 40% between two frames. At one row it is
    // 11.18, so the step off two rows is larger still. That is the jump reported as the planner
    // failing to reach its end state cleanly -- and the positions were never the problem, which
    // is why walking them harder never helped.
    //
    // rowsOf is the cascade's own interpolation between the two endpoint packings' counts, so
    // taking the depth from it makes the falloff move at the same rate as everything else. At
    // rest rowsOf is absent and this is the integer, so the lattice is untouched.
    var depthOf = function (list, fallback) {
      if (!rowsOf || !list.length) return fallback;
      var m = 0;
      list.forEach(function (c) {
        var v = rowsOf(c) || c.rows || 0;
        if (v > m) m = v;
      });
      return m > 0 ? m : fallback;
    };

    return { cells: cells, maxR: maxR, total: planTotal, r0: r0, rOuter: rOuter,
             sp: SP_O, spInner: SP_I, density: density, room: roomPlan,
             rows: { i: depthOf(inner, innerRows), o: depthOf(outer, outerRows || REF_ROWS) } };
  }

  // RETIRED 2026-08-22. This used to switch the plan basis on how much of the vault
  // was left on screen -- whole-vault above 55%, a visible-only rebuild below -- and
  // that threshold was the root of a whole afternoon of "jumps". Planning must not
  // depend on HOW MANY notes were toggled:
  //
  //   - it made behaviour inconsistent. Hiding `08 - Meeting Notes` (221 notes) crossed
  //     the line and re-densified; hiding `04 - Daily Notes` (55) did not, so the same
  //     gesture shrank the ring or held it depending on the folder's size.
  //   - a toggle that CROSSED the line animated from a whole-vault planA to a
  //     visible-only planB -- two different packings inside one animation.
  //   - and any code path that hardcoded one side of it silently disagreed with the
  //     other, which is exactly how the ring came to change size after the animation
  //     had finished.
  //
  // The plan is now always built from what is visible. The failure that motivated the
  // whole-vault side -- notes appearing to swap seats on a light filter -- does not
  // apply: a cell's notes are sorted by hubRank, so hiding some COMPACTS the rest
  // inward in order and nothing crosses anything else. Density is then always right,
  // and there is one planner with one basis at every call site.
  var REPACK_BELOW = 0.55;   // kept only so the changelog entry has something to point at

  // planIn lays the same notes out under a DIFFERENT plan than the live one,
  // which is how the cascade interpolates between two packings.
  //
  // strict omits notes this plan did not place, instead of falling back to their
  // current position. That fallback is right for the normal callers -- a hidden
  // note should stay where it is -- but it silently hides "this note has no seat
  // in this packing" from the cascade, which needs to know: it was blending
  // departing notes toward the position they were already at, so a closing wedge
  // never migrated radially while the ring re-densified around it.
  function ringsLayout(planIn, strict) {
    // A cell's row count is what sets its density, and rows come from the plan.
    // Filter the vault down hard and the full-vault plan leaves each row holding
    // ~2 notes while its wedge grows to 120 degrees -- measured, 55 notes over 8
    // rows with 88-degree gaps, a spidery disc instead of a filled one. Below this
    // share of the vault the plan is rebuilt from the visible notes, which
    // re-densifies it.
    //
    // The threshold is deliberately generous: hiding one subfolder (82% left)
    // stays on the full-vault plan, which is what stops notes swapping seats.
    // Isolating a group is a big enough change that a reflow is expected anyway.
    var shownCount = 0;
    graph.forEachNode(function (id) { if (visible(id)) shownCount++; });
    // Weight the resting plan by visibility, exactly as a cascade weights it by
    // opacity. Without this the resting plan counted every note at full weight --
    // so a hidden folder still shaped everyone else's bands and row counts, and
    // the layout settle() assigned was the FULL-vault packing. The cascade would
    // close the wedge correctly and then the whole disc would snap back to a
    // different arrangement, which is the "jumps to a completely different frame"
    // at the end of every animation. Since alpha is exactly visible ? 1 : 0 once a
    // cascade settles, the two now agree by construction.
    var plan = planIn || pinnedPlan ||
      buildWedgePlan(true,
                     function (id) { return alpha[id] || 0; });
    if (!plan) return null;

    // Live angles: each wedge takes its share of what is VISIBLE, so hiding
    // something makes the rest grow back into a full circle.
    // TWO measures per cell. `geom` is how much room the cell is allocated;
    // `live` is the opacity-weighted count actually on screen. Their ratio is how
    // far open the wedge is within its own arc.
    //
    // What a note contributes to `geom` is the whole trick, and it has to be
    // SYMMETRIC between arriving and leaving or the ring breaks:
    //
    //   - A note on its way OUT counts whatever opacity is left of it. Hiding a
    //     group turns visible() false on frame one, so counting only visible
    //     notes struck the cell out of the allocation instantly and its
    //     neighbours snapped wider while its own notes were still fading in
    //     place on top of them.
    //   - A note on its way IN counts its opacity too, in `trade` mode. Counting
    //     it as a whole slot up front allocated the new wedge its full final
    //     span immediately, while `open` still rendered it at zero width -- so
    //     the ring carried a hole the size of the incoming group (~150 degrees
    //     for 08 - Meeting Notes) that the dots then popped into. Ramping it
    //     makes the other wedges give up their space at exactly the rate the new
    //     one takes it, so the circle stays full and only gets denser.
    //
    // In `draw` mode there is no ring to keep full, so an arriving note does
    // claim its whole slot and the occupied arc grows clockwise instead.
    var live = 0;
    plan.cells.forEach(function (c) {
      c.geom = 0; c.live = 0;
      c.slots.forEach(function (sl) {
        var al = alpha[sl.id] || 0;
        // willShow, not visible. A note on its way out counts what is left of it, and
        // the date range is a way out like any other -- visible() only knows about
        // hidden folders, so an excluded note was counting as a WHOLE SEAT at opacity
        // zero. Same asymmetry the cascade's destination plan had (see willShow), one
        // level down.
        var will = willShow(sl.id);
        c.geom += (fullRing || !will) ? al : 1;
        c.live += al;
      });
      live += c.geom;
    });
    var shown = plan.cells.filter(function (c) { return c.geom > 1e-4; });
    if (!shown.length || !live) return null;
    // How deep this plan reaches, for fit(). Recorded here rather than measured off node
    // positions later: this is plan.maxR, the same quantity geomLock holds for the full
    // vault, so the two divide to exactly 1 on an unfiltered disc. The outermost NOTE sits a
    // little inside the lattice radius it was packed against, so measuring positions made a
    // full disc read as 96% of itself and fit() zoomed slightly in on nothing.
    lastMaxR = plan.maxR || lastMaxR;
    // Recorded beside lastMaxR and for the same reason: both are properties of the
    // packing on screen, and both are read from render-time code that has no plan.
    if (plan.sp > 0) lastSP = plan.sp;
    if (plan.spInner > 0) lastSPI = plan.spInner;
    if (plan.rows) lastRows = plan.rows;

    // The inner and main bands are each a full circle, so they are allocated
    // separately -- a small cell competes only with the other small cells.
    var TWO = 2 * Math.PI;
    var pos = {};
    var fit = Object.create(null);   // id -> room to its nearer row neighbour
    // The last note placed at each radius, ACROSS cells: keyed by row, so the note at the end
    // of one wedge and the note at the start of the next are compared. Reset per band, since
    // the two rings have their own radii and never share a row.
    var lastAt = null, firstAt = null;
    // The interior step of every row of every cell, per band, collected as placement computes
    // it. See where bandRoom is taken from this: it has to be a function of the PLAN, not of
    // the positions that come out of it.
    var roomPool = { i: [], o: [] };
    // Per note, the step of the cell it belongs to. A bound, not a scale -- see dotPx.
    var cellRoomNext = Object.create(null);
    if (probe) lastStart = Object.create(null);
    [true, false].forEach(function (isInner) {
      var band = shown.filter(function (c) { return !!c.inner === isInner; });
      if (!band.length) return;
      var tot = 0;
      band.forEach(function (c) { tot += c.geom; });
      // The RENDERED allocation: sub-gaps and the affordability clamp both apply here.
      // Shared with buildWedgePlan through allocateBand -- see that function for the whole
      // story, including why the group count has to be continuous.
      var a = allocateBand(band,
                           function (c) { return c.geom; },
                           { subGaps: true, clamp: 0.45, totFloor: 1e-6,
                             groupPres: gapPres, band: isInner ? "i" : "o" });
      var gap = a.gap;
      lastGapDeg[isInner ? "i" : "o"] = Math.round(gap * 180 / Math.PI * 1000) / 1000;
      lastNG[isInner ? "i" : "o"] = Math.round(a.nG * 1000) / 1000;
      band.forEach(function (c) { c.span = a.shareOf(c); });
      // EVERY BOUNDARY COSTS ONE SEAM, group or subfolder, so there is a single count to
      // spend. The reference radius is the locked one, used only for the probe's readout and
      // for nothing the disc depends on.
      lastAt = Object.create(null);
      firstAt = Object.create(null);
      var nB = a.nG + a.nSub;
      var refR = geomLock && geomLock.bandR ? geomLock.bandR[isInner ? "i" : "o"] : 0;

      // A gap BEFORE EVERY GROUP, including the first -- that leading one is the wrap
      // boundary between the last group and the first, so the ring still reads as even.
      //
      // Every placed increment carries the same presence weight the reservation used, or the
      // two disagree and the wedges stop filling the circle. Placing one gap per group makes
      // the total exactly gap * nG, equal to the reservation, with nothing left over.
      //
      // It used to be half a gap at the start and half left at the end, which made the
      // leading offset depend on *which group happens to be first in the sweep*. When that
      // group's presence reached zero it dropped out of `band`, `band[0]` became the next
      // group at presence 1, and the offset jumped 0 -> gap/2 in a single frame: the whole
      // ring rotated ~1 degree. Reported as "toggling 03 makes 08 move slightly left on the
      // last frame". Now every term is continuous, so no group's departure can rotate the
      // disc. Costs a constant half-gap of rotation against the old layout -- 1 degree,
      // fixed, and invisible.
      // COUNTERS, NOT ANGLES. The sweep used to accumulate radians, which forced one gap width
      // on the whole band; it now accumulates how many SEAMS and how much of the wedge FRACTION
      // lie before each cell, and the angle is worked out per note from its own radius. Both
      // terms carry exactly the presence weights the reservation used, as before -- that is what
      // keeps a departing group from rotating the disc.
      var seamsBefore = a.groupPres[band[0].g], fracBefore = 0, prevG = null;
      band.forEach(function (c) {
        if (prevG !== null) seamsBefore += (c.g !== prevG) ? a.groupPres[c.g] : a.presOf(c);
        prevG = c.g;
        var frac = a.fracOf(c);
        // Recorded for the probe: the leading edge of each group's wedge, which is what
        // moves when the gap reservation changes. Only the first cell of a group writes,
        // so this is the group's own start rather than its last subfolder's.
        if (probe && lastStart && lastStart[c.g] === undefined) {
          var sRef = seamAt(refR, nB);
          lastStart[c.g] = Math.round((sRef.gap * seamsBefore + sRef.avail * fracBefore) *
                                      180 / Math.PI * 1000) / 1000;
        }
        // The wedge keeps its FINAL start angle and only its span opens, so an
        // arriving note fans its own wedge wider instead of shoving every other
        // wedge round the disc. Normalising by the running total instead would
        // hand the first arrival a 300-degree share that shrinks as the rest
        // land -- the whole pie sloshing about while it fills.
        // The wedge grows CLOCKWISE from its leading edge, and the ring stays
        // contiguous: theta advances by the OPEN span, not the full one, so a
        // half-arrived wedge is half as wide and its neighbour butts straight up
        // against it. A growing wedge therefore opens up *between* its two
        // neighbours and pushes what follows round the circle, which is what
        // makes the motion read along the circumference instead of radially.
        var open = c.geom > 1e-6 ? c.live / c.geom : 0;

        // How many notes this cell puts in each row -- what its end margins are made of, see
        // the zero point below. Counted over the notes that are actually there.
        var rowN = Object.create(null);
        c.slots.forEach(function (sl) {
          if (present(sl.id)) rowN[sl.r] = (rowN[sl.r] || 0) + 1;
        });
        var rowsUsed = Object.keys(rowN).length || 1;
        c.slots.forEach(function (sl) {
          if (!present(sl.id)) return;
          // The seam this note's own row pays for, and the wedge edges either side of it.
          //
          // TIMES UNIT, because sl.r is in LATTICE units -- the row pitch there is SP = 1,
          // and positions are scaled by UNIT on the way out (see `scale` below). Feeding a
          // lattice radius to a width measured in graph units made every seam 160x too
          // wide: 0.15 * 160 / 24 is a full radian, so the gaps ate the disc.
          //
          // sl.r and not the pushed radius: a highlight is a display offset and must not
          // change an angle.
          var sm = seamAt(sl.r * UNIT, nB);
          var a0 = sm.gap * seamsBefore + sm.avail * fracBefore;
          var a1 = a0 + sm.avail * frac * open;
          // ROTATED BACK BY HALF A GAP, so the WRAP GAP is centred on 12 o'clock rather
          // than starting there. The allocation places a full gap before the first group
          // (see the leading-offset note above), and sweep 0 is 12 o'clock -- so the gap
          // between the last group and the first spans [0, gap] and 12 o'clock sits on
          // its leading edge, which reads as the disc being rotated half a gap clockwise.
          //
          // Applied here, at the sweep-to-angle conversion, rather than by changing the
          // leading offset: the offset arithmetic is what makes every term continuous
          // when a group fades out, and it is not worth disturbing for a constant
          // rotation. `gap` is this BAND's own already-clamped gap, so each ring rotates
          // by its own half-gap -- one line covers both.
          //
          // A constant, deliberately not scaled by presence: anything presence-weighted
          // here would rotate the ring as notes arrive, which is the class of bug the
          // leading-offset note describes.
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
          // NO EDGE INSET HERE, and it is worth saying why not, because one was tried.
          //
          // Wedges visibly interleaved along their boundary at 10k, so each wedge was made to
          // give up one dot radius at each end. That fixed the symptom and was the wrong fix:
          // placeCell's half-share margin already holds the end note half a step in, ~80
          // units, which is comfortably more than a dot's 62-unit radius -- there was never a
          // shortage of room. What there was, was dots drawn at 175 units of radius because
          // the size floor had stopped tracking the lattice (see DOT_OF_PITCH). Insetting on
          // top of a sufficient margin just moved the boundary out to twice a normal step and
          // read as a slice missing from the disc.
          // THE END MARGIN: the zero point, plus this band's share of the extra separation,
          // plus how far this end note differs from a typical one.
          //
          // That last term is what keeps the channel centred between the two dots' EDGES rather
          // than their centres -- dot radius runs 4x from a leaf to a hub, so equal centre
          // distances put edges visibly unequal distances from the boundary, which is what a
          // screenshot of the 12 o'clock axis showed. It is a DIFFERENCE and not a radius, so
          // it costs no width on average.
          //
          // Capped together at two thirds of the arc, because a sliver wedge holding one hub
          // note could otherwise ask for more room than it has and invert.
          var arc = a1 - a0;
          var rGraph = Math.max(1e-6, sl.r * UNIT);
          // HALF A PITCH IS THE ZERO POINT: two wedges each holding their end note half a step
          // in from their own edge put those two notes exactly one step apart, which is a
          // boundary nobody can see. Everything past that is the channel, and the channel is
          // what gets scaled -- including the seam, which sits inside it.
          // HALF THIS WEDGE'S OWN STEP, which is what the sentence above always meant and not
          // what the code did. Half a PITCH is half a step only where a row is exactly full,
          // and rows usually are not: measured on an 89-note range, wedges in the outer band
          // had interior steps of 686 to 736 units on a pitch of 407, so their end notes sat
          // half a pitch in while their siblings stood a whole step apart -- boundary gap 431
          // against an interior 736. A channel TIGHTER than the spacing either side of it,
          // which reads as the notes drifting away from their own edges.
          //
          // For n notes in an arc A, asking that the end margin be half the interior step has
          // one solution: A = 2m + (n-1)s with m = s/2 gives s = A/n and m = A/2n. So the
          // margin is the row's own half-share of its own arc, and the interior step and the
          // boundary gap come out the same number by construction, at whatever density the
          // wedge happens to have. That also makes the room UNIFORM, which is what lets dotPx
          // size a whole band from its tightest pair without the tightest pair being an
          // outlier that shrinks everything.
          var nRow = rowN[sl.r] || 1;
          var zero = arc * rGraph / (2 * nRow);
          // THE STEP, but with a CONTINUOUS count. nRow is how many notes are present in this
          // row right now, an integer, so a step built on it is a step function of the frame --
          // and since dotPx sizes a whole band from a percentile of these, every dot in the
          // band moved whenever any row gained or lost a note. Measured: 211% in a single
          // frame, 28 of 122 frames past 5%.
          //
          // The cell's opacity-weighted count over the rows it occupies is the same quantity
          // with the staircase taken out -- a note arriving contributes its alpha rather than
          // suddenly contributing one -- so it slides where nRow ticked. The margin above keeps
          // nRow, which is right: a margin is where a note SITS, and it has to be the half-step
          // of the row the note is actually in.
          var ownStep = arc * rGraph * rowsUsed / Math.max(0.001, c.live);
          roomPool[isInner ? "i" : "o"].push(ownStep);
          // ...AND KEPT PER NOTE, as a bound. The band percentile is one number for a whole
          // ring, so a cell packed tighter than the tenth percentile overlaps -- measured by
          // hiding folders one at a time on the 1402-note vault, 16 pairs at -78 units. This is
          // the same continuous quantity as the pool, so bounding by it costs nothing in
          // smoothness, unlike the measured neighbour distance it replaces: that was a minimum
          // over WHICH note is nearest, and which note is nearest changes as the disc moves.
          //
          // Per CELL rather than per row, which is the point. A note's size may depend on how
          // densely its own folder is packed; it may not depend on which row of that folder it
          // landed in, because rows differ in arc and the innermost is always shortest -- that
          // is the gradient that made the most-connected note the smallest one.
          cellRoomNext[sl.id] = ownStep;
          var seamArc = sm.gap * rGraph / 2;      // this side's half of the seam, in units
          var keep = EXCESS_KEEP * seamFall(isInner ? "i" : "o");
          var typ = dotTyp(isInner ? "i" : "o");
          // ONE WIDTH PER BAND, not one per row. Sizing each half of the channel from the
          // END NOTE OF THAT ROW is exact per note and wobbly per disc, because the drawn dot
          // is min(dotUnits, dotFit) while the room reserved here was the uncapped dotUnits --
          // so wherever dotFit bites, the channel keeps room for a dot that never arrives.
          // Measured on the demo vault, the room beyond a wedge's own step ran -6 to +28 units
          // on a 160 pitch, with the two sides of one boundary disagreeing by up to 22: gaps
          // that read as notes not reaching the seam, worst where the end notes are fattest.
          //
          // The band-typical dot instead. A genuinely fat end note now sits marginally closer
          // to the channel than a typical one does, which is the trade: a channel of one
          // visible width beats a per-note-exact one that changes every row.
          var side = function () {
            var raw = zero;                          // what the boundary costs, per band
            var m = zero + keep * (raw - zero + seamArc) - seamArc;
            return m < 0 ? 0 : m / rGraph;
          };
          var mgA = side(), mgB = side();
          var room = arc * 0.66;
          if (mgA + mgB > room) {
            var k = room / (mgA + mgB);
            mgA *= k; mgB *= k;
          }
          var t = sweepAngle(a0 + mgA + (arc - mgA - mgB) * sl.u - sm.gap / 2);
          // Highlighted notes step outward by HL_PUSH rows. Applied here rather than
          // in the packing so it changes nothing about rows, capacities or wedge
          // angles -- a highlight is a pure display offset, and every stability
          // guarantee about reflows survives it untouched.
          // The previous note in THIS ROW, whichever wedge it belonged to. Both notes take the
          // gap and each keeps the SMALLER of its two sides: a dot has to clear whichever
          // neighbour is nearer, not the average of them.
          // AND BOUNDED BY ITS OWN WEDGE. The step above is measured to whichever note is
          // nearest in the row, and across a boundary that note is on the FAR side of the
          // channel -- so the room it reports includes the channel, and a dot allowed to take
          // the room it has will take the channel with it. Two edge notes each claiming their
          // share leaves a fifth of the seam visible, which is the seam gone.
          //
          // mgA and mgB already are the distance from this wedge's edges to its end notes, so
          // the distance from any note to the nearer edge falls straight out of its position
          // along the arc. Room is capped at twice that: a radius is DOT_OF_PITCH of the room,
          // so twice the edge distance keeps the dot inside its own wedge with a fifth of the
          // distance to spare -- the same proportion an interior note keeps from its
          // neighbour. The channel is then whatever it was reserved to be, whoever is standing
          // at the end of the row.
          var spanArc = arc - mgA - mgB;
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
          // HL_PUSH is NOT scaled by the plan's spacing, though it is quoted in rows. Scaling it
          // was tried and is wrong: the constant was sized as a FRACTION OF THE RADIUS
          // ("0.9 rows on a ~13.3-row disc is 6.8%"), and the radius is the thing the
          // density solve holds still -- it is the row COUNT that shrinks as the lattice
          // spreads. At the density cap the disc is ~5 rows deep, so 0.9 rows would have
          // been 18% of it and a highlighted note would have protruded off the stage.
          // Left in lattice units it stays the 6.8% it was tuned to be.
          var rr = sl.r + (isPushed(sl.id) ? HL_PUSH : 0);
          pos[sl.id] = { x: rr * Math.cos(t), y: rr * Math.sin(t) };
        });
        // Contiguous: the next wedge starts where this one's OPEN part ended. In fractions
        // rather than radians now, so it means the same thing at every radius.
        fracBefore += frac * open;
      });
      // THE PAIR AT 12 O'CLOCK, which nothing measured. Every row is walked once, left to
      // right, so its first and last note are never neighbours in the walk although they are
      // neighbours on the disc -- and each therefore took its room from its one inner side.
      // With dots only ever shrinking that was harmless; letting them GROW made it an overlap,
      // measured as a single pair at -13 units on one date range.
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

    // The hub hole is now EMPTY except for the logo. Unlinked notes used to be
    // sunflower-packed into it; they are a wedge of their own now (see groupOf), so
    // nothing is positioned outside the ring system and every note obeys the same
    // lattice. hubPositions is gone with it.

    // A layout unit is a FIXED distance. It used to be baseSpan*0.52/maxR, which
    // normalised the disc to a constant footprint -- so filtering down to 55 notes
    // spread them across the area 440 had used, and the ring structure dissolved
    // into a scattered cloud. With a fixed unit, fewer notes simply make a smaller
    // disc at the same density.
    var scale = UNIT;
    var out = {};
    graph.forEachNode(function (id) {
      var q = pos[id];
      if (q) out[id] = { x: q.x * scale, y: q.y * scale };
      else if (!strict) out[id] = { x: graph.getNodeAttribute(id, "x"),
                                    y: graph.getNodeAttribute(id, "y") };
    });

    // Committed once per pass, replacing the previous pass wholesale: a note that has left the
    // disc must not leave its old spacing behind for the next one to size against.
    // THE TIGHTEST PAIR IN EACH BAND. dotPx sizes every note in a band against this one
    // figure rather than against its own neighbours, so the ordering by link weight survives
    // -- and taking the minimum rather than an average is what makes that safe: the largest
    // dot in the band is sized to fit the closest pair in it, so no pair anywhere can touch.
    // FROM THE PLAN, NOT FROM THE POSITIONS. Taken from the fit map -- which is measured off
    // the placed notes -- this jittered every frame of a cascade: the set of notes in it
    // changes as notes arrive and leave, and a percentile over a moving set moves for reasons
    // that have nothing to do with any note. Every dot in the band therefore breathed for the
    // length of the animation, which was reported as exactly that.
    //
    // The interior step arc/n is a function of the same interpolated plan quantities that
    // produce the positions -- the cell's live arc, its radius, its notes per row -- so it is
    // as smooth as they are, which is the property #13 established for the spacing and the
    // seam. The fit map keeps its own job: bounding an individual dot, not sizing the band.
    var pool = roomPool;
    // THE PLAN'S OWN FIGURE WINS. It is the one the cascade walks, so taking it here is what
    // makes the final frame and the resting layout the same layout.
    var planRoom = plan.room || null;
    // A LOW PERCENTILE, NOT THE MINIMUM. The minimum is the correct bound and the wrong
    // statistic: it is one pair, and one pair that happens to be tight sets the size for every
    // note in its band. Measured on the 454-note vault, taking the minimum put the inner band's
    // median dot at 25 units with a diameter-to-step of 0.12 while its worst real clearance was
    // 93 -- dots a quarter of the size the room allowed, because of a single outlier.
    //
    // The tenth percentile keeps what matters -- ONE figure per band, so size stays strictly
    // monotone in link weight -- and lets the tightest tenth of pairs come closer to touching
    // than the rest. Overlaps are measured rather than assumed; see the changelog.
    var pick = function (v) {
      if (!v.length) return 0;
      v.sort(function (x, y) { return x - y; });
      return v[Math.floor(v.length * 0.1)];
    };
    // FROM THE LIVE ARCS, not from the plan's reference ones. The plan carries a room figure
    // too, and handing it in was tried first on the theory that a walked value must be smoother
    // than a measured one. It is smoother and it is wrong: plan.room is built from c.band, the
    // cell's REFERENCE width, while the disc is drawn from c.span, its live share -- and under
    // filtering those differ several-fold, so every dot collapsed onto the pixel floor,
    // diameter over step 0.02 to 0.10.
    //
    // The measured pool was never the problem. It is filled from arc/n as placement computes
    // it, which moves exactly as smoothly as the positions do; the breathing came entirely from
    // the per-note cap that used to sit on top of it, and with that gone the worst single-frame
    // size change is 2.2% against 252% before.
    bandRoom = { i: pick(pool.i), o: pick(pool.o) };
    cellRoom = cellRoomNext;
    if (planRoom) { /* kept on the plan for the probe; the live pool is what draws */ }
    dotFit = fit;
    return out;
  }

  /* ------------------------------------------------------------- timeline */

  // Notes ranked oldest-first. The slider is linear in RANK rather than in time
  // on purpose: measured on this vault, 409 of 442 notes fall in the last three
  // months while a handful carry content dates back to 2015, so a linear time
  // axis would spend 97% of its travel on empty years and the interesting part
  // would be the last pixel.
  var tlRank = Object.create(null), tlDate = [], tlMax = 0;
  // id -> created, in ms UTC. Absent for an undated note, which is what timeFactor keys on.
  var tlMs = Object.create(null);
  // The whole vault's dates, bucketed, built once. Every one of the three concepts needs
  // the same two things -- how many notes per month, and per year -- and building it once
  // is also what stops three controls disagreeing about where the vault starts.
  var dateSpan = null;
  function buildTimeline() {
    var dated = [];
    graph.forEachNode(function (id, a) { if (a.created) dated.push([id, a.created]); });
    dated.sort(function (x, y) { return x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0; });
    tlRank = Object.create(null); tlDate = []; tlMs = Object.create(null);
    dated.forEach(function (pair, i) {
      tlRank[pair[0]] = i + 1;
      tlDate.push(pair[1]);
      // heatParse returns NaN for anything that is not a bare ISO day -- an unrendered
      // Templater placeholder, most often -- and those must not get a position on any of
      // these axes. Written as isNaN rather than as ms === ms, which is the same test and
      // reads like a typo.
      var ms = heatParse(pair[1]);
      if (!Number.isNaN(ms)) tlMs[pair[0]] = ms;
    });
    tlMax = dated.length;
    buildDateSpan(dated);
  }

  /**
   * The whole vault's dates, bucketed by month and by year.
   *
   * Built once, from the FULL graph and never from what is visible, for the same reason the
   * disc's plan is: a control whose own axis moved when you used it would be unusable. All
   * three concepts read this, which is also what stops them disagreeing about where the
   * vault starts.
   *
   * MONTHS ARE DENSE, not sparse -- every month between the first and last gets an entry,
   * including the empty ones. The author's own vault has a whole year with no notes in it
   * (2021), and a control built from only the months that exist would silently close that
   * gap up and lie about the shape of the history.
   */
  function buildDateSpan(dated) {
    dateSpan = null;
    if (!dated.length) return;
    var lo = heatParse(dated[0][1]), hi = heatParse(dated[dated.length - 1][1]);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return;
    var d0 = new Date(lo), d1 = new Date(hi);
    var y0 = d0.getUTCFullYear(), m0 = d0.getUTCMonth();
    var y1 = d1.getUTCFullYear(), m1 = d1.getUTCMonth();
    var months = [], index = Object.create(null);
    for (var y = y0, m = m0; y < y1 || (y === y1 && m <= m1);) {
      var key = y + "-" + (m < 9 ? "0" : "") + (m + 1);
      index[key] = months.length;
      months.push({ key: key, y: y, m: m, ms: Date.UTC(y, m, 1), n: 0 });
      if (++m > 11) { m = 0; y++; }
    }
    var years = Object.create(null);
    for (var i = 0; i < dated.length; i++) {
      var s = dated[i][1], k = s.slice(0, 7), ix = index[k];
      if (ix !== undefined) months[ix].n++;
      var yy = s.slice(0, 4);
      years[yy] = (years[yy] || 0) + 1;
    }
    var ylist = [];
    for (var yk = y0; yk <= y1; yk++) ylist.push({ y: yk, n: years[String(yk)] || 0 });
    var nMax = 1, tot = 0;
    months.forEach(function (mm) { if (mm.n > nMax) nMax = mm.n; tot += mm.n; });
    // THE HEIGHT REFERENCE IS A PERCENTILE, NOT THE MAXIMUM, and the bars are linear against
    // it. Neither half of that is arbitrary; each fixes what the other choice broke.
    //
    // Against the MAX the scale is hostage to one month. On an eleven-year vault the busiest
    // month holds 631 and the median holds under 40, so every bar but one was a hairline --
    // which is what the sqrt was for, and sqrt then did the opposite damage on a two-year
    // vault where the ratio is only about three: every bar came out between 68% and 100% and
    // the strip read as a solid slab with no shape in it at all.
    //
    // p90 with a floor at a third of the max, linear, gives a readable spread in both. A
    // genuine spike clips at full height, which is honest -- it is the tallest thing there --
    // and costs one month's precision to give every other month some.
    var sorted = months.map(function (mm) { return mm.n; }).sort(function (x, y) { return x - y; });
    var p90 = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 1;
    var nRef = Math.max(1, p90, nMax * 0.35);
    var yMax = 1;
    ylist.forEach(function (yy) { if (yy.n > yMax) yMax = yy.n; });
    dateSpan = {
      months: months, years: ylist, index: index,
      lo: months[0].ms, hi: Date.UTC(y1, m1 + 1, 0),      // last day of the last month
      nMax: nMax, nRef: nRef, yMax: yMax, dated: tot,
      undated: graph.order - tot
    };
  }

  /**
   * The range as two ISO days. Null ends read as the span's own ends, and it says so rather
   * than saying "All dates".
   *
   * It DID say "All dates" when nothing was capped, which put the same two words in the
   * readout and on the button beside it -- one describing a state and one offering to return
   * to it, indistinguishable. Naming the actual dates is also the more useful answer at rest:
   * it is where the reader learns what eleven years of strip actually spans.
   */
  function rangeLabel() {
    if (!dateSpan) return "";
    var f = state.from === null ? dateSpan.lo : state.from;
    var t = state.to === null ? dateSpan.hi : state.to;
    var iso = function (ms) { return new Date(ms).toISOString().slice(0, 10); };
    return iso(f) + "  \u2192  " + iso(t);
  }

  /**
   * Set the range from anywhere, in the ends' own terms.
   *
   * The brush had this inline in its pointerup handler, including the rule that matters most:
   * an end AT the span's own end means "no bound" rather than "the first note", or brushing
   * the whole strip leaves a filter that excludes everything dated outside the known span.
   * Now the date fields and the year labels go through the same door, so they cannot get that
   * rule subtly different -- or forget it, which is the more likely of the two.
   */
  function setRangeMs(from, to) {
    if (!dateSpan) return;
    if (from !== null && to !== null && from > to) { var sw = from; from = to; to = sw; }
    state.from = (from === null || from <= dateSpan.lo) ? null : from;
    state.to = (to === null || to >= dateSpan.hi) ? null : to;
    applyRange();
  }

  /** The chrome that goes with a range, whichever path put it there. */
  function rangeChrome() {
    var el = $("rangenote");
    if (el) el.textContent = rangeLabel();
    // The two fields show the range's ACTUAL ends, which for an open end is the span's own.
    // Bounded by the span as well, so the picker cannot offer a month the vault has no notes
    // in -- and so a typed date is clamped by the control rather than by us.
    if (dateSpan) {
      var lo = isoDay(dateSpan.lo), hi = isoDay(dateSpan.hi);
      var f = $("from"), t = $("to");
      if (f) { f.min = lo; f.max = hi; f.value = isoDay(state.from === null ? dateSpan.lo : state.from); }
      if (t) { t.min = lo; t.max = hi; t.value = isoDay(state.to === null ? dateSpan.hi : state.to); }
    }
    // Nothing to clear when nothing is capped. A live button that does nothing is a worse
    // answer to "is a filter on?" than a dead one.
    var btn = $("rangeall");
    if (btn) btn.disabled = (state.from === null && state.to === null);
    drawDateUI();
  }

  /**
   * A range change that is a JUMP: the All-dates button, or the debug API. Animated, because
   * a discrete filter change animates everywhere else in this page.
   */
  function applyRange() {
    rangeChrome();
    cascade();
  }

  /* THE DRAG DOES NOT TOUCH THE DISC AT ALL.
   *
   * Two attempts got this wrong before it got simple. The first put cascade() on every
   * pointermove -- a 1600ms reveal that walks the disc one note at a time, cancelled and
   * restarted 120 times a second, so what you saw was dozens of animations each showing its
   * own first frame. The second replaced that with one cheap layout frame per pointermove,
   * which is what the timeline slider does and is right for the timeline: 452 notes.
   *
   * At 10,000 it is still too much. syncAlpha, the packer and a Sigma refresh are each O(n)
   * and they run between the pointer moving and the next paint, so the drag lags the cursor
   * however cleverly it is scheduled. The honest answer is that the disc is not a thing that
   * can be scrubbed at that size.
   *
   * So a drag only moves the RIBBON: the handles, the pill, the readout and the tooltip,
   * which are one small canvas and two spans. `state` is not written either -- the preview
   * lives on the drag object, so an abandoned drag leaves nothing half-applied and there is
   * exactly one moment when the filter changes. The disc updates once, on release, animated
   * like every other filter change in the page.
   */

  // Today's date, read at load rather than baked in at build time, so the mark
  // stays correct tomorrow without rebuilding the snapshot.
  var TODAY = (function () {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  })();
  // "Today" means created today OR edited today. `created` alone was not enough:
  // it comes from frontmatter, and this vault pre-creates daily notes from the
  // calendar, so today's daily note carries an import stamp from days earlier and
  // `created` takes precedence over `date`. Measured on 2026-08-21: 0 notes created
  // today against 3 touched, so the button reliably marked nothing.
  // CREATED ONLY, deliberately, and this has been both ways.
  //
  // It read `created || touched` because on the day it was written `created` matched 0
  // notes while 3 files had been touched, so the button looked broken. But `touched` is the
  // file's mtime, and a vault picks that up for reasons that have nothing to do with the
  // person using it -- a sync writing a file back, Obsidian rewriting frontmatter, a
  // formatter. On a real vault it marked far more than the heatmap's today column, which
  // counts notes ADDED and uses `created` alone.
  //
  // Two things answering "today" differently in one view is worse than a button that marks
  // nothing on a day nothing was written -- and marking nothing is the honest answer then,
  // which the band is already showing. The invariant in smoke.mjs now pins the two together.
  function isToday(id) {
    return graph.getNodeAttributes(id).created === TODAY;
  }

  // A day clicked on the heatmap. Haloed and recoloured, NOT pushed -- see isPushed.
  //
  // `created` ONLY, not touched: the band counts notes added, so clicking one of its
  // squares has to mark exactly the notes that square counted. Reusing isToday's
  // created-or-touched rule here would light up notes the square never included, which
  // reads as the heatmap lying about its own number.
  function isMarkedDay(id) {
    if (!state.markDay && !state.hoverDay && state.hoverYear === null) return false;
    var c = graph.getNodeAttribute(id, "created");
    if (c === state.markDay || c === state.hoverDay) return true;
    // A YEAR IS A PREFIX. `created` is an ISO day, so the year is its first four characters
    // -- no parsing, and it costs one string compare per note per frame.
    return state.hoverYear !== null && !!c && c.slice(0, 4) === state.hoverYear;
  }

  // Haloed: any highlight source at all -- a clicked group, a marked day, "mark today".
  // Whether a source also MOVES its notes is a separate question, asked of isPushed: a
  // group owns a contiguous wedge and can move as a block, while today's notes and a day's
  // notes are scattered through every wedge and cannot.
  function isHighlighted(id) {
    if (state.markToday && isToday(id)) return true;
    if (isMarkedDay(id)) return true;
    var g = groupOf(id);
    if (state.highlight[g]) return true;
    // HOVERING A LEGEND ROW haloes its notes, and deliberately does NOT push them --
    // isPushed does not ask about these two. A hover is a transient answer to "where is
    // this folder", and a wedge sliding out and back under a moving pointer is a lot of
    // motion to spend on a question that is answered the moment the halo lands. Clicking
    // the row still pushes; that is the difference between asking and choosing.
    if (state.hoverGroup === g) return true;
    var a = graph.getNodeAttributes(id), d = a.dirs || [];
    for (var k = 1; k <= d.length; k++) {
      var pk = pathKey(a, k);
      if (state.highlightSub[pk]) return true;
      if (state.hoverSub[pk]) return true;
    }
    return false;
  }

  // Set (or clear) the hovered legend row. afterRender picks the change up through
  // hlSignature and ramps it like any other highlight source.
  //
  // A FULL refresh, NOT `{ skipIndexation: true }`. That flag says "nothing moved, so do
  // not rebuild the spatial index", which is true inside hlWalk's own loop and is NOT true
  // here: this fires whenever the pointer crosses a legend row, which can be at any point
  // during a cascade or a layout tween, when nodes very much have moved. Skipping
  // indexation then leaves Sigma's quadtree describing where the disc used to be.
  //
  // Measured, when this said skipIndexation: the suite went from 17/17 to 9/17 on the demo
  // vault -- aiming at a note resolved nothing ("element at aim CANVAS.sigma-mouse"), the
  // legend reported itself folded while showing 18 subfolder rows, and buildWedgePlan came
  // back null inside the hidden-folder sweep. Three unrelated-looking failures, one stale
  // index. Hover is a per-row event, not a per-frame one, so the re-index costs nothing
  // worth having.
  // `keys` is an array of path keys, or null. Compared as a joined string rather than by
  // identity so that re-entering the same row does not repaint.
  function hoverHighlight(group, keys) {
    group = group || null;
    var next = Object.create(null);
    (keys || []).forEach(function (k) { if (k) next[k] = true; });
    var a = Object.keys(state.hoverSub).sort().join(","),
        b = Object.keys(next).sort().join(",");
    if (state.hoverGroup === group && a === b) return;
    state.hoverGroup = group;
    state.hoverSub = next;
    if (renderer) renderer.refresh();
  }

  // Does this subfolder own a contiguous wedge of its own? Cells are keyed by TINT
  // SLOT, and everything past the third-largest shares the last slot -- so the
  // "N smaller subfolders" are one cell between them, not one cell each.
  //
  // Only a sub with its OWN slot owns a wedge, and only those are pushed. A pooled
  // one's notes are interleaved with its cell-mates at the same angles, so pushing it
  // slides a subset out THROUGH them: the highlight meant to make the selection
  // legible is what creates the overlaps. `03 - Resources/Locations` is the case that
  // settled it -- 3 notes, seventh in the order, sharing the tail slot with six other
  // folders.
  //
  // This was briefly reversed on the argument that a tail folder is still a level-1
  // subfolder, so selecting one doing nothing looked inconsistent in the nav. The
  // overlaps are the worse of the two, and the ring already identifies a pooled
  // selection perfectly well.
  //
  // The exception is real: if the tail slot has exactly ONE occupant, it is that
  // folder's own wedge and it moves like a named one.
  function ownsWedge(folder, sub) {
    var subs = subOrder[folder] || [];
    var k = subs.indexOf(sub || "");
    if (k < 0) return false;
    return k < SUB_NAMED || subs.length === SUB_NAMED + 1;
  }

  // Pushed out radially. Anything that owns a contiguous wedge can move as a block:
  // a group, or a named subfolder whose sub-wedge is its own. What must NOT move is
  // one of the pooled "smaller subfolders", because its notes are interleaved
  // through a wedge shared with the others at the same angles -- so pushing it
  // slides a subset out THROUGH its own cell-mates, and the push meant to make the
  // selection legible is what creates the overlaps. Those are identified by the
  // ring alone.
  function isPushed(id) {
    // NOT mark-today. Its notes are scattered across every folder, so pushing them slides a
    // subset out through their own cell-mates at the same angles -- the same reason a marked
    // heatmap day does not push, and the same reason a pooled subfolder does not. It is
    // still haloed and recoloured; see isHighlighted.
    if (state.highlight[groupOf(id)]) return true;
    // Only the DEPTH-1 folder owns a wedge, so only it can move. A folder nested
    // deeper is a slice of its parent's arc, interleaved with its siblings at the same
    // angles -- pushing it would slide a subset out through them, which is the same
    // reason a pooled subfolder does not move.
    var a = graph.getNodeAttributes(id);
    return !!state.highlightSub[pathKey(a, 1)] && ownsWedge(a.folder, a.sub || "");
  }

  // How many notes' worth of ramp a note gets as the cutoff passes it. Ranks, not
  // days, for the same reason the slider is: it keeps the fade even whether the
  // vault gained one note that month or two hundred.
  /**
   * Does this note survive EVERY filter, not just the legend's?
   *
   * `visible()` answers one question -- is its group and its subfolder chain unhidden -- and
   * that was the whole answer for as long as it was the only filter. The timeline cutoff and
   * the date range both live in timeFactor instead, multiplied into opacity, which is what
   * lets them animate without a clause in visible().
   *
   * THE CASCADE PLANS WITH THIS, NOT WITH visible(). Its destination packing has to be the
   * one settle() will actually assign, and settle assigns whatever the packer derives from
   * the SETTLED OPACITIES -- so a note the date range excludes has no seat there. Planning
   * with visible() gave it one, so the animation walked toward a disc that still seated the
   * excluded notes and then re-densified in a single frame at the end.
   *
   * That is the jump, and it only appeared when a change REDUCED the note count: adding notes
   * back means the seats planB reserved are the seats they end up in, so the two agreed by
   * luck in that direction.
   *
   * The epsilon matches present(): a note part-way through a timeline ramp is on screen and
   * belongs in the packing, and only one at rest at zero does not.
   */
  function willShow(id) { return visible(id) && timeFactor(id) > 0.004; }

  var TL_FADE = 8;
  function timeFactor(id) {
    // THE DATE CAP FIRST, because it is a hard bound and the rank cutoff is a ramp: a note
    // outside the range is out whatever the slider says, and multiplying a ramp by zero
    // would give the same answer more slowly.
    //
    // UNDATED NOTES STAY, which is the same rule the rank cutoff already applies one line
    // down, and it matters more here than it looks: 20% of the notes in the 10-year fixture
    // carry no frontmatter at all. Dropping them from every range would mean a range filter
    // that also silently filters by "has frontmatter", which is not a date question.
    if (state.from !== null || state.to !== null) {
      var ms = tlMs[id];
      if (ms !== undefined) {
        if (state.from !== null && ms < state.from) return 0;
        if (state.to !== null && ms > state.to) return 0;
      }
    }
    if (state.until === null) return 1;
    var rk = tlRank[id];
    if (!rk) return 1;                     // undated notes are always present
    var f = (state.until - rk + 1) / TL_FADE;
    return f <= 0 ? 0 : f >= 1 ? 1 : f;
  }

  /* --------------------------------------------------------- reveal cascade */

  // Every note owns an opacity, and opacity is what the renderer reads -- never
  // visible() directly. A filter change therefore never pops anything in or out:
  // it retargets opacities and the cascade walks them there, one note at a time.
  var alpha = Object.create(null);           // id -> 0..1, the source of truth
  function present(id) { return (alpha[id] || 0) > 0.004; }
  // Opacity is filter AND timeline: the cutoff needs no clause in visible(), it
  // simply holds later notes at zero, and every density decision downstream is
  // already driven by these weights.
  function syncAlpha() {
    graph.forEachNode(function (id) { alpha[id] = visible(id) ? timeFactor(id) : 0; });
  }
  function clearAlpha() { graph.forEachNode(function (id) { alpha[id] = 0; }); }

  // Sigma's parseColor accepts rgba(r,g,b,a), but its channel regex is [0-9]*, so
  // the channels must be INTEGERS -- a CSS4 "rgb(0 0 0 / 50%)" silently fails to
  // parse and the node renders black. Hex in, integer rgba out.
  var rgbCache = Object.create(null);
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
  function withAlpha(color, a) {
    if (a >= 0.999) return color;
    var c = toRgb(color);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")";
  }

  // Frames one note takes to arrive, and the window the whole set is staggered
  // across. Frame-counted for the same reason the position tween is: a throttled
  // rAF must not leave the cascade stranded half-faded.
  var FADE_FRAMES = 12;
  // How far a note closes the gap to its target RADIUS each frame. This existed to
  // smooth row-count TICKS, and there are none left to smooth: the row coordinate
  // is continuous now. At 0.3 it only closed 30% of the gap per frame, so while
  // the target kept moving the position ran permanently behind -- and the leftover
  // lag was closed in one go when the animation stopped. Measured on the big
  // toggle, the disc contracted 2133 -> 1731 over 48 frames and then 1731 -> 1653
  // in the last one: the jump at the end of every animation. 1 means follow the
  // target exactly, so the animation simply ends where it already is.
  // ...and 1 was wrong, because the premise above is false: `Math.floor(pp)` makes a
  // note's radius DISCRETE, so a cell's fractional row count crossing an integer
  // teleports its outermost note a full pitch. There were ticks to smooth all along.
  // Measured on the `04 - Daily Notes` hide, worst single-frame step of the outer band:
  //
  //   ease 1 -> 160 units (one whole row)   ease 0.35 -> 56
  //   ease 0.5 -> 80                        ease 0.25 -> 40
  //
  // and the reason 1 was chosen -- the leftover lag closing in one go at the end -- does
  // not happen at any of them: final-frame delta is 0 throughout, and the resting radius
  // is 2138 in every case. That failure was measured over 48 frames; a toggle now runs
  // ~123, which is ample to converge.
  //
  // Unlike taking the radius from the continuous coordinate (tried and reverted the same
  // day), easing only moves notes whose TARGET changed, so the disc stays on its lattice
  // and just the crossing note glides.
  var RADIAL_EASE = 0.25;
  var SPREAD_MAX  = 78;      // longest stagger window, frames
  var SPREAD_PER  = 0.17;    // frames of stagger per note...
  // The floor matters more than it looks. A folder's wedge closes over the whole
  // stagger window, so a SHORT window on a BIG radius means high angular speed:
  // 04 - Daily Notes is 55 notes, which earned a 9.4-frame window, and its wedge
  // in the outer band swung ~6 degrees per frame -- about 210 units of arc for its
  // outermost notes, which reads as jumpy even though nothing is discontinuous.
  // 08 was smooth because 221 notes buy a 37-frame window, and 05 because the
  // inner band's radius makes the same angle a much shorter arc.
  var SPREAD_MIN  = 24;      // ...with a floor, so a mid-sized folder is not rushed
  // Stretches every frame count by this factor, for watching the animation in slow
  // motion. 1 is normal speed. Live: __vg.timeScale = 4 (no rebuild needed), which
  // is how the whole-disc snap at the end of a cascade was finally pinned down.
  // 1.25 = runs at 0.8x speed. Full speed read a shade too quick.
  var TIME_SCALE  = 1.25;
  // WALL-CLOCK, not frame counts. Every animation below runs for the same length of
  // time on every machine. Frame counting made duration a function of refresh rate:
  // the intro was 420 frames, so ~8.7s at 60Hz and ~3.6s at 144Hz on the same vault,
  // and a busy page stretched it further still. Progress is now elapsed/duration, so
  // a slow page draws FEWER intermediate frames instead of running longer.
  //
  // The original reason for frame counting still stands and is still handled: a
  // throttled or stopped rAF must never leave the disc smeared between two layouts.
  // Each animation keeps a timer that force-completes it -- the cascade's stall
  // watchdog, a hard deadline on the other two -- so the final layout is correct even
  // if no further frame ever arrives. That is what makes wall-clock safe here; the
  // earlier wall-clock attempt was reverted because it had no such backstop.
  //
  // TIME_SCALE still multiplies these, so __vg.timeScale = 4 remains a slow-motion
  // knob rather than a no-op.
  var TIMELINE_MS = 4500;   // intro / Refresh -- the vault growing from first note to now
  var CASCADE_MS  = 1600;   // a wedge arriving or leaving, and first paint
  var TWEEN_MS    = 380;    // a plain reflow, no fade
  var NOW = function () { return (window.performance || Date).now(); };
  // Two ways a cascade can fill the ring, and the difference is whether there is
  // already a ring to respect.
  //
  //   trade (fullRing = true)  -- something is on screen. The circle stays FULL
  //     and the wedges trade space: an arriving wedge grows while every other one
  //     shrinks to let it in, and a leaving wedge shrinks while the rest grow
  //     back. Enabling and disabling are exact mirrors of each other, and the
  //     disc only ever changes density, never its outline.
  //
  //   draw (fullRing = false) -- the screen is empty, so there is nothing to
  //     trade with and no ring to keep full. The pie draws itself clockwise from
  //     12 o'clock instead, the occupied arc growing to a full circle. This is
  //     first paint, and "none" then "all".
  var fullRing = false;
  var planKeep = null;       // during a cascade: visible-or-still-on-screen
  var cascadeRun = null;     // in-flight cascade
  var pinnedPlan = null;     // plan held still for the duration of one cascade
  var planMs = 0;            // cost of the last plan build, for measurement
  var lastGapN = { i: 0, o: 0 };   // continuous group count per band, behind the gap total
  // The RENDERED allocation's own numbers, which are the ones that place wedges: the
  // continuous group count it reserved for, and the gap angle it spent. lastGapN above
  // comes from the REFERENCE allocation, which sizes rows and never positions anything --
  // so it can look perfectly smooth while the arc the notes actually sit in jumps.
  var lastGapDeg = { i: 0, o: 0 }, lastNG = { i: 0, o: 0 };
  var lastStart = null;   // group -> wedge start angle in degrees, this frame
  // Group presences for the GAP reservation, walked between the cascade's two packings
  // and read by the rendered allocation. Null at rest, which is when weight-over-seats
  // is already the right answer -- see allocateBand.
  var gapPres = null;
  // How deep the LAST plan reached, in lattice units -- the same measure geomLock.maxR
  // holds for the full vault, so the two divide cleanly. Taken from the plan rather than
  // from node positions: the outermost note sits a little inside the lattice radius it was
  // packed against, so measuring the live extent made a full, unfiltered disc read as 96%
  // of itself and fit() zoomed in slightly on nothing.
  var lastMaxR = 0;
  // HOW MUCH ROOM EACH NOTE ACTUALLY HAS, in graph units: the gap to its nearer neighbour
  // along its own row, as the last layout placed them. Keyed by id.
  //
  // The row pitch is a constant and the ALONG-row pitch is not: a wedge's end margins come out
  // of the same circumference its notes are spread across, so a band carrying many wedges
  // packs its rows tighter than one carrying few. Sizing dots against the row pitch alone drew
  // them too big for their real neighbours -- measured, 126 units of diameter against a
  // 120-unit step, which is dots touching.
  //
  // PER NOTE rather than one figure for the disc, because one figure has to be the tightest
  // spot anywhere and that shrank every dot on the disc to fit the worst cell on it: measured,
  // diameter over spacing fell from 0.79 to 0.24 disc-wide for the sake of a handful of notes.
  // A note's size is now a statement about its own neighbourhood.
  //
  // Measured rather than derived because the spacing depends on the margins, the seam, the
  // wedge count and the presence weights at once, and every attempt in this file to predict
  // one of those from the others has been wrong at least once.
  var dotFit = Object.create(null);
  // The room a BAND has, one figure each, being the tightest pair in it. See dotPx: size has to
  // be a monotone function of link weight, so it cannot carry a per-note term.
  var bandRoom = { i: 0, o: 0 };
  // Per note, its own cell's step. Bounds a dot where its folder is packed tighter than the
  // band's tenth percentile; continuous, so it does not make dots breathe.
  var cellRoom = Object.create(null);
  // WHAT THE LAST CASCADE WAS ASKED TO DO. Every question about a jump starts with
  // "did it animate at all, and over how many notes", and inferring that from frame
  // counts is guesswork -- an instant apply and a one-frame animation look identical
  // from outside.
  var lastCascade = { ins: 0, outs: 0, span: 0, path: "none", frames: 0, ms: 0 };

  // Hold the wedge plan still while a cascade runs. visible() is already at its
  // final value the moment a filter changes, so buildWedgePlan would return the
  // very same plan on all ~90 frames -- this just stops paying for it 90 times.
  function pinPlan() {
    var t0 = (window.performance || Date).now();
    var keep = planKeep || visible;
    var shownCount = 0;
    graph.forEachNode(function (id) { if (keep(id)) shownCount++; });
    pinnedPlan = buildWedgePlan(true);
    planMs = (window.performance || Date).now() - t0;
    return pinnedPlan;
  }

  // Reveal (or withdraw) notes one at a time, sweeping CLOCKWISE from 12 o'clock
  // in both directions. Each note's opacity counts toward its wedge's span while
  // it fades, so the wedge fans open by exactly one note's worth per arrival and
  // pushes its clockwise neighbour along -- the space is made by the note taking
  // it, and the motion runs along the circumference rather than out from the hub.
  function cascade(done) {
    stopPlay();                            // a filter change interrupts playback
    if (anim) { WIN.cancelAnimationFrame(anim); anim = null; }
    if (animGuard) { WIN.clearTimeout(animGuard); animGuard = null; }
    if (cascadeRun) {
      WIN.cancelAnimationFrame(cascadeRun.raf);
      WIN.clearTimeout(cascadeRun.guard);
      cascadeRun = null;
    }
    gapPres = null;      // belongs to the run just abandoned; see allocateBand

    // A null plan is legitimate: "none" hides every note, so there is no
    // geometry left to lay out. The fade still has to run, with positions simply
    // frozen where they are, or the disc would blink out instead of receding.
    // Trade space against whatever is already on screen; only an empty screen
    // draws the pie from nothing.
    fullRing = false;
    graph.forEachNode(function (id) { if (present(id)) fullRing = true; });

    // willShow, not visible: membership is "staying, or still fading out", and "staying" has
    // to mean staying under every filter. See willShow.
    planKeep = function (id) { return willShow(id) || present(id); };
    var plan = pinPlan();
    // Arrival order is CLOCKWISE round the circumference. Work out where every
    // note ends up on the FINISHED disc and sort by that sweep angle: notes that
    // share an angle (a column, inner band and main band alike) arrive together,
    // so the frontier reads as a hand sweeping round the clock.
    //
    // Ordering by angle has a second effect that ordering by radius did not:
    // because wedges fill clockwise and the ring is contiguous, everything
    // upstream of the frontier is already complete when a note lands. So a note
    // arrives at its final angle and never moves again -- the only thing that
    // moves is what is still downstream, and that is still invisible.
    var keep = Object.create(null);
    graph.forEachNode(function (id) { keep[id] = alpha[id] || 0; alpha[id] = visible(id) ? timeFactor(id) : 0; });
    var finalPos = ringsLayout() || {};
    graph.forEachNode(function (id) { alpha[id] = keep[id]; });
    var sweepOf = Object.create(null);
    graph.forEachNode(function (id) {
      var q = finalPos[id];
      sweepOf[id] = q ? angleSweep(Math.atan2(q.y, q.x)) : 0;
    });

    var ins = [], outs = [], to = Object.create(null), from = Object.create(null);
    graph.forEachNode(function (id) {
      // timeFactor, not 1: a note the timeline or the date range excludes must not be
      // revealed by a filter change somewhere else. See the note on `keep` above.
      var want = visible(id) ? timeFactor(id) : 0;
      var now = alpha[id] || 0;
      if (Math.abs(now - want) <= 0.004) return;
      to[id] = want; from[id] = now;
      (want ? ins : outs).push(id);
    });
    if (!ins.length && !outs.length) {
      lastCascade = { ins: 0, outs: 0, span: 0, path: "instant: nothing to move", frames: 0, ms: 0 };
      pinnedPlan = null; applyLayout(true); return;
    }

    // Clockwise in BOTH directions -- notes leave in the same sweep they arrived
    // in, so the animation never runs backwards.
    var clockwise = function (a, b) { return sweepOf[a] - sweepOf[b]; };
    ins.sort(clockwise);
    outs.sort(clockwise);

    var windowFor = function (n) {
      return Math.max(SPREAD_MIN, Math.min(SPREAD_MAX, n * SPREAD_PER)) * TIME_SCALE;
    };
    var delay = Object.create(null);
    [ins, outs].forEach(function (set) {
      var w = windowFor(set.length);
      set.forEach(function (id, i) { delay[id] = set.length < 2 ? 0 : w * i / (set.length - 1); });
    });
    var span = Math.max(windowFor(ins.length), windowFor(outs.length))
             + FADE_FRAMES * TIME_SCALE;
    var moving = ins.concat(outs);
    lastCascade = { ins: ins.length, outs: outs.length, span: Math.round(span * 100) / 100,
                    path: "animated", frames: 0, ms: 0, t0: NOW() };

    var settle = function () {
      if (!lastCascade.exit) lastCascade.exit = "settle() called from outside the loop";
      // Back to weight-over-seats: at rest the seats ARE the group's own notes, so the
      // derived reading is right and a stale override would freeze the gap at whatever
      // the last frame happened to hold.
      gapPres = null;
      if (cascadeRun) {
        WIN.cancelAnimationFrame(cascadeRun.raf);
        WIN.clearTimeout(cascadeRun.guard);
        cascadeRun = null;
      }
      probeSample("pre-settle");
      moving.forEach(function (id) { alpha[id] = to[id]; });
      pinnedPlan = null;
      planKeep = null;
      // No tween needed: at p = 1 the notes are already laid out under planB,
      // which is exactly what an unpinned ringsLayout() produces now that the
      // departing notes are gone.
      applyLayout(false);
      probeSample("settled");
      if (done) done();
    };

    // TWO packings, interpolated across the fade rather than tweened before and
    // after it. Crossing REPACK_BELOW re-densifies the disc -- every surviving
    // note genuinely belongs in a different row, at a different radius -- and
    // doing that as its own animation gave three movements in a row: a reflow,
    // the fade, then a repack. Blending the two plans by cascade progress folds
    // the radial change INTO the fade, so the other wedges resize over the whole
    // time the big wedge is arriving or leaving.
    //
    //   planA -- the packing the notes are sitting in right now (pre-toggle)
    //   planB -- the packing they end in (post-toggle)
    //
    // A note missing from one plan simply uses the other: departing notes have no
    // seat in planB, arriving ones have none in planA.
    // Density comes from opacity. Feeding the packer each note's alpha as its
    // weight means rows, reference wedge widths and the hub radius are re-derived
    // every frame from what is actually on screen -- so an arriving note's own
    // wedge grows a row outward as it lands, at the same density as the rest of
    // the ring, while the wedge widens along the circumference at the same time.
    // Radial and circumferential, from one calculation.
    //
    // This replaced blending two finished packings, which could not work: two
    // separately-valid packings differ by a mean of 23.7 degrees, and lerping a
    // note's radius and its fraction-across-the-wedge independently pulled the
    // rows apart -- every note in 03 and 04 changed row, so mid-animation the
    // grid stopped being a grid. A packing derived from weights is a valid grid at
    // every value of those weights.
    var weightOf = function (id) { return alpha[id] || 0; };

    // Row counts at both ends of the move. The count is an integer and it ticks,
    // so instead of deriving it from the live weights (which made it tick at
    // arbitrary moments, reshaping the capacity ruler and flinging notes up to
    // 3191 units in a frame) it is walked from the source count to the
    // destination count by animation progress. At progress 0 that is exactly the
    // packing the notes are resting in; at 1, exactly the one settle() assigns.
    var wasPresent = Object.create(null);
    graph.forEachNode(function (id) { wasPresent[id] = present(id); });

    // WHICH PLAN BASIS settle() will use, decided once, up front.
    //
    // ringsLayout picks between the whole-vault plan and a visible-only rebuild on
    // `shown < order * REPACK_BELOW`. The cascade used to hardcode `true`, so for any
    // filter light enough to stay above that threshold the animation ran on the
    // visible-only packing and settle() then re-planned onto the whole-vault one --
    // a different plan, so the ring changed size AFTER the animation finished.
    //
    // Measured with `04 - Daily Notes` hidden (393 of 450 visible, threshold 248):
    // visible-only gave 16 cells / 64 rows / maxR 13, whole-vault 19 cells / 75 rows /
    // maxR 14, with every major cell differing by exactly one row (6 vs 7). One row is
    // the jump. `08 - Meeting Notes` never showed it because hiding it leaves 229
    // visible, below the threshold, so both sides agreed by luck.
    //
    // visible() is already at its post-toggle value on frame one, so this is exactly
    // the flag settle() will compute, and the contract above -- "at 1, exactly the one
    // settle() assigns" -- holds again.
    var shownAfter = 0;
    graph.forEachNode(function (id) { if (willShow(id)) shownAfter++; });
    var ovAfter = true;   // one basis everywhere; see REPACK_BELOW

    // The lattice spacing at each end of the toggle. Scalars, not per-cell maps: the
    // spacing is global by construction -- it is what makes the packing uniform -- so
    // there is one number per endpoint rather than one per cell.
    var spSrc = 1, spDst = 1;
    // Per band, for the same reason the layout is: one number cannot carry two rings, and a
    // ring whose spacing is interpolated from the other ring's endpoints is a ring that moves
    // when the other one is filtered.
    var spSrcB = { i: 1, o: 1 }, spDstB = { i: 1, o: 1 };
    // The two endpoint packings' band room, walked alongside their spacing. Zero means "this
    // packing had nothing in that band", and the walk below falls back to the other end rather
    // than interpolating toward an empty band.
    var roomSrcB = { i: 0, o: 0 }, roomDstB = { i: 0, o: 0 };
    var rowsSrc = Object.create(null), rowsDst = Object.create(null);
    var bandSrc = Object.create(null), bandDst = Object.create(null);
    // A group is PRESENT at an end if it has any seated weight there -- one wedge, one
    // gap, regardless of how many notes it keeps. The union of the two ends is walked.
    var presSrc = Object.create(null), presDst = Object.create(null), presKeys = [];
    // ONE planner, called the same way at both ends.
    //
    // The cascade's endpoints have to be *the static planner's own output* for the
    // before and after states, or the animation walks between two packings that
    // nothing else ever renders. Every jump chased on 2026-08-22 was this: the two
    // were called with different arguments and drifted apart one argument at a time --
    // `onlyVisible` hardcoded to true, weights defaulting to 1 instead of the 0/1 that
    // alpha settles to, `planKeep` set by hand at each call site.
    //
    // staticPlan() takes only "which notes are present" and derives the other three
    // from it exactly as ringsLayout does at rest, so planA is what the disc was
    // resting in and planB is what settle() will assign, by construction rather than
    // by coincidence.
    var staticPlan = function (presentFn) {
      var save = planKeep;
      planKeep = presentFn;
      var shown = 0;
      graph.forEachNode(function (id) { if (presentFn(id)) shown++; });
      var p = buildWedgePlan(true,
                             function (id) { return presentFn(id) ? 1 : 0; });
      planKeep = save;
      return p;
    };
    (function () {
      var a = staticPlan(function (id) { return wasPresent[id]; });
      // THE DESTINATION PACKING. willShow, so it is the packing settle() will assign rather
      // than one that still seats whatever the date range or the timeline has excluded.
      var b = staticPlan(function (id) { return willShow(id); });
      // Also the depth of each BAND at both ends -- the deepest cell in it, which is
      // what sets the ring's outer radius. A cell that exists at only one end takes
      // this instead of its own missing count, so it matches the ring rather than
      // running its own race. Keyed by band, because the two are packed
      // independently and their depths are unrelated.
      var deepen = function (m, c) {
        var k = c.inner ? "i" : "o";
        if (m[k] === undefined || c.rows > m[k]) m[k] = c.rows;
      };
      // A cell with no weight left at this end is the one arriving or leaving, and it
      // must stay UNDEFINED here so the band-depth fallback above applies to it. That
      // matters now in a way it did not before: planB is built on the same basis
      // settle() uses, and when that basis is the whole vault the departing cell is
      // still in the plan -- at weight 0, so rowsNeeded returns its floor of 1. Left
      // recorded, that walks the leaving wedge from 7 rows to 1 while the ring holds,
      // which is the "contracts faster than the ring, reads as sinking out of the disc"
      // failure this fallback was added to fix. Skipping it restores that.
      var record = function (rows, band) {
        return function (c) {
          if (c.wsum <= 0.0001) return;
          rows[c.k] = c.rows;
          deepen(band, c);
        };
      };
      if (a) a.cells.forEach(record(rowsSrc, bandSrc));
      if (b) b.cells.forEach(record(rowsDst, bandDst));
      // Taken from the endpoint plans themselves, which were built on binary presence --
      // so these are the two densities the disc genuinely rests at, not a sample of
      // whatever alpha happened to be on some frame.
      if (a && a.sp > 0) spSrc = a.sp;
      if (b && b.sp > 0) spDst = b.sp;
      if (a) { spSrcB = { i: a.spInner || a.sp || 1, o: a.sp || 1 }; }
      if (b) { spDstB = { i: b.spInner || b.sp || 1, o: b.sp || 1 }; }
      if (a && a.room) roomSrcB = { i: a.room.i || 0, o: a.room.o || 0 };
      if (b && b.room) roomDstB = { i: b.room.i || 0, o: b.room.o || 0 };
      var seen = Object.create(null);
      var presFor = function (p, m) {
        if (!p) return;
        p.cells.forEach(function (c) {
          if (c.wsum <= 0.0001) return;
          m[c.g] = 1;
          if (!seen[c.g]) { seen[c.g] = 1; presKeys.push(c.g); }
        });
      };
      presFor(a, presSrc);
      presFor(b, presDst);
    })();

    // The guard is a WATCHDOG on stalled frames, not a deadline. It used to be a
    // fixed setTimeout at roughly span/60 seconds, which assumes 60fps -- and this
    // page does not always manage that with 442 nodes and 1409 edges. Below about
    // 30fps the timeout fired part-way through and settle() snapped the disc to
    // its final layout: a jump at the end of every animation, on exactly the
    // machines where the animation mattered. It now only fires if no frame has
    // arrived for a while, so a slow page simply animates slower.
    var STALL_MS = 400;
    var watchdog = function () {
      if (cascadeRun && NOW() - cascadeRun.tick < STALL_MS) {
        cascadeRun.guard = WIN.setTimeout(watchdog, STALL_MS);
        return;
      }
      settle();
    };
    // `span` is measured in frames, and every stagger delay and fade window below is
    // expressed in the same unit. Rather than convert all of them, map one frame onto
    // however many milliseconds it must take for the whole span to land on CASCADE_MS.
    // The proportions -- which note starts when, how long each fade lasts -- are
    // untouched; only the clock changes.
    var msPerFrame = (CASCADE_MS * TIME_SCALE) / Math.max(1, span);
    // Real time drives the progress, but a single frame may never advance more than
    // 1/MIN_FRAMES of the whole span. `04 - Daily Notes` is the toggle that made this
    // necessary: 55 notes plus a repack drops the frame rate far enough that pure
    // wall-clock progress moved the disc in visible leaps. Clamped, a slow page takes
    // longer than CASCADE_MS instead of jumping -- the fixed duration holds whenever
    // there are enough frames to draw it, which is the only time it is worth having.
    var MIN_FRAMES = 20;
    var maxAdv = Math.max(1, span) / MIN_FRAMES;
    var frame = 0, tPrev = NOW(), tailFrames = 0;
    cascadeRun = { raf: 0, tick: NOW(), guard: WIN.setTimeout(watchdog, STALL_MS) };
    (function step() {
      var tn = NOW();
      var adv = (tn - tPrev) / msPerFrame;
      tPrev = tn;
      if (adv > maxAdv) adv = maxAdv;
      frame += adv;
      if (cascadeRun) cascadeRun.tick = tn;
      var busy = false;
      for (var i = 0; i < moving.length; i++) {
        var id = moving[i];
        var q = (frame - delay[id]) / (FADE_FRAMES * TIME_SCALE);
        q = q < 0 ? 0 : q > 1 ? 1 : q;
        alpha[id] = from[id] + (to[id] - from[id]) * (q * q * (3 - 2 * q));   // smoothstep
        if (q < 1) busy = true;
      }

      // Progress across the WHOLE cascade, not per note: this is what carries
      // the repack, so it has to finish exactly when the last note does.
      var pr = Math.min(1, frame / Math.max(1, span));
      var ease = pr * pr * (3 - 2 * pr);

      // THE GAP RESERVATION, WALKED. Same clock as the row counts below, so a group that
      // is leaving gives up its gap over the whole cascade and one that merely thins
      // never gives up any of it. At ease 0 this is the packing the disc is resting in;
      // at 1 it is what settle() assigns, so the last frame and rest agree exactly.
      gapPres = Object.create(null);
      for (var gi = 0; gi < presKeys.length; gi++) {
        var gk = presKeys[gi];
        var ps = presSrc[gk] || 0, pd = presDst[gk] || 0;
        gapPres[gk] = ps + (pd - ps) * ease;
      }

      // ONE allocation per frame, from a plan whose geometry is interpolated
      // between the two packings. Angles are therefore assigned once, in a single
      // contiguous sweep, and cannot overlap; the radial re-densification arrives
      // as the blended rows, spread across the whole fade.
      // Membership is the union of staying and still-on-screen (planKeep), and
      // the weights do the densifying.
      var rowsAt = function (c) {
        var s = rowsSrc[c.k], d = rowsDst[c.k];
        if (s === undefined && d === undefined) return 0;   // cell knows best
        // A cell missing from ONE end is the one arriving or leaving. It takes the
        // depth its BAND has at that end, so it carries the same number of rows as
        // the rest of the ring for the whole toggle and only its arc closes.
        //
        // Two earlier versions were both wrong in opposite directions. Mirroring the
        // other end (`s = d`, `d = s`) pinned its count, so the disc re-densified
        // around a wedge that held its radii and faded at full size. Walking to 0
        // fixed that but overshot: the wedge then contracted FASTER than the ring
        // -- measured, 1494 against the survivors' 1814 at 75% -- so it read as
        // sinking out of the disc rather than shrinking with it. The band's own
        // depth is the value that keeps the ring's outer edge continuous across the
        // toggling wedge from the first frame to the last.
        var bk = c.inner ? "i" : "o";
        if (s === undefined) s = bandSrc[bk] !== undefined ? bandSrc[bk] : d;
        if (d === undefined) d = bandDst[bk] !== undefined ? bandDst[bk] : s;
        return s + (d - s) * ease;
      };
      // Same clock as the rows and the gap reservation above: at ease 0 this is the
      // packing the disc is resting in and at 1 it is the one settle() assigns.
      var roomWalk = function (k) {
        var sv = roomSrcB[k], dv = roomDstB[k];
        if (!(sv > 1)) return dv;          // band was empty at this end
        if (!(dv > 1)) return sv;
        return sv + (dv - sv) * ease;
      };
      var spNow = {
        i: spSrcB.i + (spDstB.i - spSrcB.i) * ease,
        o: spSrcB.o + (spDstB.o - spSrcB.o) * ease,
        // Walked, not re-derived. Notes per row is an integer, so a room solved from the live
        // weights is a step function of the frame and every dot in the band breathes with it.
        room: { i: roomWalk("i"), o: roomWalk("o") },
      };
      var plan = buildWedgePlan(ovAfter, weightOf, rowsAt, spNow);
      var targets = plan ? ringsLayout(plan, true) : null;
      // CONVERGE BEFORE SETTLING. Easing closes only RADIAL_EASE of each note's gap
      // per frame, so when progress hits 1 a small remainder is still outstanding --
      // and settle() assigns exact targets, closing it in a single frame. That is the
      // "small jump at the end, like a skipped frame", and it is the cost the doc
      // attributes to easing.
      //
      // So the loop keeps running past pr = 1 while any note is still more than half a
      // unit from its target, and the ease ramps to 1 across that tail. The targets are
      // static by then, so the remainder decays fast: from a full row it is under half
      // a unit within a handful of frames, and settle() becomes a no-op rather than a
      // correction. Ramping only in the TAIL matters -- ramping across the whole
      // animation would restore the very tick the easing exists to smooth, which for
      // 04 lands around 90% of the way through.
      var ez = pr < 1 ? RADIAL_EASE
                      : Math.min(1, RADIAL_EASE + tailFrames * 0.15);
      var resid = 0;
      if (targets) graph.forEachNode(function (id) {
        var q = targets[id];
        if (!q) return;
        // The ANGLE is taken exactly -- it is the circumferential motion, and
        // easing it would put the wedge out of step with the ring again. Only the
        // RADIUS is eased, because that is what steps: a row count is an integer,
        // so it ticks rather than glides, and easing turns each tick into a short
        // slide of about one row instead of a jump.
        var x = graph.getNodeAttribute(id, "x"), y = graph.getNodeAttribute(id, "y");
        var h = Math.atan2(q.y, q.x);
        var rNow = Math.hypot(x, y), rWant = Math.hypot(q.x, q.y);
        var gap = rWant - rNow;
        if (gap < 0 ? -gap > resid : gap > resid) resid = gap < 0 ? -gap : gap;
        var r = rNow + gap * ez;
        graph.mergeNodeAttributes(id, { x: r * Math.cos(h), y: r * Math.sin(h) });
      });
      if (pr >= 1) tailFrames++;
      // skipIndexation while animating: the quadtree is only needed for hit
      // testing, and settle() rebuilds it. Re-indexing 442 nodes and 1409 edges
      // every frame was the reason the frame rate fell far enough for the old
      // fixed guard to fire mid-animation.
      probeSample("cascade");
      lastCascade.frames++;
      lastCascade.ms = Math.round(NOW() - lastCascade.t0);
      renderer.refresh({ skipIndexation: true });
      // `resid > 0.5` is the new clause: never hand over to settle() while a note is
      // still visibly short of its target. Bounded by the ramp above, so this adds a
      // few frames, not an open-ended tail.
      // Only while something is recording: this is one object per frame in the hot loop,
      // and the frame count and elapsed time above already answer "did it animate".
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

  // FRAME-BY-FRAME PROBE, ON BOTH AXES. Reasoning about which band can move the other has
  // been wrong twice, so measure it: this samples each band's radial extent on every
  // animated frame, and the report gives the biggest single-frame step per band. A
  // "jump" is a large step in one frame; a smooth animation is many small ones.
  //
  // THE TANGENTIAL HALF WAS MISSING FOR MONTHS, and a whole class of jump with it. Every
  // number here was a radius, so a change that left radii alone and slid every wedge round
  // the circle measured as perfectly smooth -- which is exactly what a change in the gap
  // reservation does. The date sliders jumped visibly while "a range change animates instead
  // of snapping" passed, because the only thing it could see was the radius.
  //
  // Tangential displacement is reported in GRAPH UNITS, not degrees: a degree at the rim is
  // four times the movement it is at the hub, and what a person sees is the distance. Only
  // notes present in both frames count -- a note fading in has no previous position, and
  // charging it for arriving would report a jump on every frame of every animation.
  var probe = null;
  function probeSample(tag) {
    if (!probe) return;
    var iMin = Infinity, iMax = 0, oMin = Infinity, oMax = 0, iN = 0, oN = 0;
    var prev = probe.prevAng, now = Object.create(null);
    var prevR = probe.prevR, nowR = Object.create(null);
    var tanStep = 0, tanId = null, tanOver = 0, tanSum = 0, tanN = 0;
    // PER-NOTE RADIAL STEP, which is what the tangential half has always measured and the
    // radial half never did. Both band extents below are a MAX OVER A SET, and the set churns
    // as notes arrive and leave -- so when the furthest note winks out the maximum is handed
    // to the next one in and the sample steps by the distance between them, reporting a jump
    // in a disc that did not move. Worse in the other direction: a stale note parked outside
    // every visible one pinned the extent flat across an entire cascade (path 0 over 154
    // frames), so a moving disc measured as perfectly still. A note's own change in radius has
    // neither failure, and "the disc jumped" is a statement about notes, not about a maximum.
    var radStep = 0, radId = null, radSum = 0, radN = 0;
    graph.forEachNode(function (id, a) {
      var r = Math.hypot(a.x, a.y);
      // Tangential step: the angle moved, times the radius it moved at.
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
          // Shortest way round, or a note crossing the 12 o'clock seam reports a
          // near-full-circle jump every time it wraps.
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          var moved = Math.abs(d) * r;
          if (moved > tanStep) { tanStep = moved; tanId = id; }
          if (moved > 160) tanOver++;         // further than one row, in one frame
          tanSum += moved; tanN++;
        }
      }
      // NOT FILTERED to present notes, and that is a known blind spot rather than an
      // oversight -- see github#17. Filtering was tried: the outermost notes are frequently
      // exactly the ones a date range excludes, so the extent COLLAPSED the instant the range
      // applied, measured as a single frame step of 3230 out of a total path of 4131. Left
      // unfiltered it is pinned by stale coordinates instead, which is stable but partly
      // blind. Stable and blind is the better failure of the two for a guard, and the honest
      // fix needs a set fixed across the whole probe rather than a filter.
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
      ngI: lastNG.i, ngO: lastNG.o, gapDegI: lastGapDeg.i, gapDegO: lastGapDeg.o,
      radStep: Math.round(radStep), radId: radId,
      radMean: Math.round(radN ? radSum / radN : 0),
      tanStep: Math.round(tanStep), tanId: tanId, tanOver: tanOver,
      tanMean: Math.round(tanN ? tanSum / tanN : 0),
      // Where each group's wedge STARTS. "The gap jumped" is precisely this series
      // moving in a step rather than a ramp, and it is what a person sees: every
      // wedge boundary shifting round the disc at once.
      starts: lastStart,
      innerN: iN, innerMin: Math.round(iMin === Infinity ? 0 : iMin), innerMax: Math.round(iMax),
      outerN: oN, outerMin: Math.round(oMin === Infinity ? 0 : oMin), outerMax: Math.round(oMax)
    });
  }

  var anim = null, animGuard = null;   // in-flight tween + its force-complete timer

  function assignPositions(targets) {
    graph.forEachNode(function (id) {
      var t = targets[id];
      if (t) graph.mergeNodeAttributes(id, { x: t.x, y: t.y });
    });
  }

  // Tween positions so a reflow reads as the pie rearranging rather than
  // teleporting. Runs for TWEEN_MS regardless of frame rate; the guard timer below
  // force-completes the move, so a throttled or stopped rAF cannot leave nodes
  // smeared between their old and new positions -- which is what sank the first
  // wall-clock attempt, before there was a backstop.

  function animateTo(targets, done) {
    if (anim) { WIN.cancelAnimationFrame(anim); anim = null; }
    if (animGuard) WIN.clearTimeout(animGuard);

    // In Rings, interpolate in POLAR space about the disc centre so nodes sweep
    // along arcs -- the pie reads as rotating into its new arrangement rather
    // than every dot cutting a straight line across the middle. Force keeps
    // cartesian interpolation, since that layout is not centred on the origin.
    var polar = state.layout === "rings";
    var from = {};
    graph.forEachNode(function (id, a) {
      var t = targets[id] || { x: a.x, y: a.y };
      if (!polar) { from[id] = { x: a.x, y: a.y, tx: t.x, ty: t.y }; return; }
      var r0_ = Math.hypot(a.x, a.y), r1_ = Math.hypot(t.x, t.y);
      var h0 = Math.atan2(a.y, a.x), h1 = Math.atan2(t.y, t.x);
      var d = h1 - h0;                       // take the short way round
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
    // WATCHDOG, not a deadline. A fixed `WIN.setTimeout(settle, dur + margin)` fires
    // part-way through whenever the page cannot render fast enough to finish in time,
    // and settle() then snaps the disc to its final layout -- a jump at the end of
    // every animation, on exactly the machines where the animation matters. This only
    // fires when no FRAME has arrived for STALL_MS, so a slow page animates slowly and
    // a stopped rAF still lands.
    var lastFrame = NOW();
    var TWEEN_STALL = 400;
    var tweenDog = function () {
      if (anim && NOW() - lastFrame < TWEEN_STALL) { animGuard = WIN.setTimeout(tweenDog, TWEEN_STALL); return; }
      settle();
    };
    animGuard = WIN.setTimeout(tweenDog, TWEEN_STALL);

    // Advance by real time so the tween is the same length everywhere, but never by
    // more than 1/MIN_FRAMES of it in a single frame. Below that frame rate the
    // animation stretches instead of teleporting: fixed duration is only worth having
    // while there are enough frames to draw it smoothly.
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



  function applyLayout(animate) {
    var targets = ringsLayout();
    if (!targets) return;
    if (animate) animateTo(targets);
    else { assignPositions(targets); renderer.refresh({ skipIndexation: false }); }
  }

  /* ---------------------------------------------------------------- render */

  var renderer, neighbourCache = null;

  function neighboursOf(id) {
    if (!neighbourCache) neighbourCache = {};
    if (!neighbourCache[id]) neighbourCache[id] = graph.neighbors(id);
    return neighbourCache[id];
  }

  // The key for a folder at depth k in a note's chain: "PARA/a", "PARA/a/b", ...
  // Depth 1 is the old `folder + "/" + sub`, so every existing key still matches.
  function pathKey(a, k) {
    return a.folder + "/" + (a.dirs || []).slice(0, k).join("/");
  }

  function visible(id) {
    var a = graph.getNodeAttributes(id);
    if (isHidden(groupOf(id))) return false;
    // Subfolder filtering only bites while the folders are what we group by.
    // Every ANCESTOR is checked, at whatever depth the vault happens to nest, so
    // hiding a folder hides its whole subtree without needing to know how deep it is.
    if (state.dim === "folder") {
      var d = a.dirs || [];
      if (!d.length && state.hiddenSub[a.folder + "/"]) return false;
      for (var k = 1; k <= d.length; k++) if (state.hiddenSub[pathKey(a, k)]) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------ hover tween */

  // Hovering a note used to SNAP: everything else went to --dim on one frame and the
  // label appeared with it. That is the same discrete step this whole project exists to
  // remove from the layout, and it reads the same way -- as the disc flinching rather
  // than responding. `hoverT` is how far the treatment has arrived, and every part of it
  // (the dim, the lift, the edge highlight, the label) is a function of it.
  //
  // Short, because this fires on every note the pointer crosses: anything slower reads
  // as lag rather than as motion. Measured against the tween that already exists for a
  // click (TWEEN_MS 380) -- a third of that is about right for something this frequent.
  var HOVER_MS = 150;
  // How much the hovered note lifts. Modest on purpose: the dot has to stay on its
  // lattice row, so this is the one place a note may change size without moving.
  var HOVER_GROW = 0.45;
  var hoverT = 0, hoverAim = 0, hoverRaf = 0, hoverPrev = 0;

  // sRGB, not OKLab. This runs per node per frame while a hover arrives, and the
  // endpoints are a group hue and the neutral dim -- a perceptual path between them buys
  // nothing visible and costs two cbrt per channel. Cached on a hundredth of t, which is
  // finer than the eye and coarse enough that the cache actually hits.
  var mixCache = Object.create(null);
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

  // How far the hover treatment should be applied for this frame. A CLICK selection has
  // no tween and must not be animated by whatever the pointer is doing, so it is always
  // fully applied; only a hover ramps.
  function hoverAmount() {
    return state.hovered ? hoverT : 1;
  }

  function hoverTo(aim) {
    hoverAim = aim;
    if (hoverRaf) return;            // already walking -- it will pick up the new aim
    hoverPrev = NOW();
    (function step() {
      var now = NOW(), dt = now - hoverPrev;
      hoverPrev = now;
      // Clamped like every other animation here: a stalled frame stretches the tween
      // rather than leaping it, so a backgrounded tab resumes mid-fade instead of
      // arriving already finished.
      var adv = Math.min(dt, HOVER_MS) / (HOVER_MS * TIME_SCALE);
      hoverT += hoverAim > hoverT ? adv : -adv;
      if (hoverT > 1) hoverT = 1;
      if (hoverT < 0) hoverT = 0;
      var landed = hoverT === hoverAim;
      // The hovered id is released only HERE, at zero. Clearing it in leaveNode would
      // empty focusSet() on that frame and snap the whole disc back to full colour --
      // the fade-out would never be drawn.
      if (landed && hoverT === 0) state.hovered = null;
      renderer.refresh({ skipIndexation: true });   // nothing moved; only colour and size
      if (landed) { hoverRaf = 0; return; }
      hoverRaf = WIN.requestAnimationFrame(step);
    })();
  }

  /* -------------------------------------------------------- highlight ramp */

  // How far each note has arrived at being highlighted. PER NOTE, not one global scalar,
  // and that is not over-engineering: highlights are additive. Two groups can be lit at
  // once, a subfolder can be lit inside an already-lit group, and a heatmap hover swaps
  // one whole set for another. A single ramp would pop the second set in at whatever
  // value the first had left it, and could not fade one set out while another fades in.
  // `alpha` already establishes the pattern -- a per-note value that something walks.
  var hl = Object.create(null);            // id -> 0..1
  var hlRaf = 0, hlPrev = 0, hlSig = "";
  // Deliberately TWEEN_MS, the same duration as the radial push in animateTo. Becoming
  // highlighted is ONE event that moves a note and grows it, so the two have to land
  // together; at different durations the dot arrives and then keeps swelling.
  // How much bigger a highlighted note gets, ON TOP of the 0.3 the halo ring already
  // needed to sit outside the dot. Small on purpose -- the ring and the radial push
  // already say "this one", so this is confirmation, not the signal.
  var HL_GROW = 0.2;

  // A cheap fingerprint of WHAT IS HIGHLIGHTED, so the per-note sweep below runs only
  // when the answer can have changed. Called every frame from afterRender; sweeping 450
  // nodes there instead would be pointless work on every frame of every animation.
  function hlSignature() {
    return Object.keys(state.highlight).join(",") + "|" +
           Object.keys(state.highlightSub).join(",") + "|" +
           (state.markToday ? "T" : "") + "|" +
           (state.markDay || "") + "|" + (state.hoverDay || "") + "|" +
           // Both hover sources belong here for the same reason everything else does:
           // this is what decides whether the per-note sweep runs at all, so a source
           // missing from it is a source whose highlight silently never ramps.
           (state.hoverGroup || "") + "|" + Object.keys(state.hoverSub).join(",") + "|" +
           // The hovered YEAR, for exactly that reason: it haloes notes, so it has to be
           // able to change the signature or the ramp never starts.
           (state.hoverYear || "");
  }

  function hlWalk() {
    if (hlRaf) return;                     // already walking; it re-reads the aims itself
    hlPrev = NOW();
    (function step() {
      var now = NOW(), dt = now - hlPrev;
      hlPrev = now;
      // Clamped like every other animation here, so a stalled frame stretches the ramp
      // rather than leaping it.
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
      renderer.refresh({ skipIndexation: true });   // size and colour only; nothing moved
      if (!moving) { hlRaf = 0; return; }
      hlRaf = WIN.requestAnimationFrame(step);
    })();
  }

  // Called from afterRender: no call site has to remember to start the ramp, which
  // matters because the highlight set is written from six different places (three legend
  // handlers, the today button, and the heatmap's click and hover).
  function hlSync() {
    var sig = hlSignature();
    if (sig === hlSig) return;
    hlSig = sig;
    hlWalk();
  }

  function focusSet() {
    var f = state.hovered || state.selected;
    if (!f) return null;
    var set = Object.create(null);
    set[f] = true;
    neighboursOf(f).forEach(function (n) { set[n] = true; });
    return set;
  }

  // Replaces Sigma's built-in hover label, whose pill is hardcoded to #FFF.
  // Geometry matches its label drawer: text at x + size + 3, y + labelSize/3.
  function drawHover(ctx, data, settings) {
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

  // The node's styling, independent of how far it has faded in. Visibility is
  // NOT decided here any more -- the reducer gates on opacity instead.
  function nodeStyle(id, a) {
        var r = Object.assign({}, a);
        r.color = nodeColor(id);
        // EVERYTHING about being highlighted is a function of hl[id], including whether
        // the treatment is applied at all -- not of isHighlighted(id). On the way out the
        // predicate is already false while the ramp is still above zero, so keying the
        // halo on the predicate would drop the ring on the first frame of the fade and
        // leave only a shrinking dot.
        var hv = hl[id] || 0;
        // Today's notes keep their own non-categorical fill -- the ring says
        // "highlighted", the fill still says what the note is.
        if (state.markToday && isToday(id)) {
          r.color = mixHex(r.color, THEME.today, hv);
          r.zIndex = 3;
        }
        // The halo is the same for both highlight sources. It is drawn in the extreme of
        // the neutral axis for the same reason the today colour is: it must not be
        // mistakable for one of the ten group hues.
        if (haloOn && hv > 0.004) {
          r.type = "halo";
          // Mixed from the note's own colour rather than faded with an alpha: the ring
          // then emerges from the dot instead of ghosting over it, and it stays a solid
          // hex, which is the only thing Sigma's colour parser is reliable about.
          r.haloColor = mixHex(nodeColor(id), THEME.today, hv);
          // 0.3 is the room the ring needs outside the dot; HL_GROW is the note actually
          // getting bigger. Both ramp together, so the dot swells and the ring arrives
          // around it as one movement.
          r.size = (r.size || a.size) * (1 + (0.3 + HL_GROW) * hv);
          r.zIndex = 4;
        }

        // Search wins: the whole result set is labelled, and nothing else is.
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
          // The name waits until the dim is most of the way there. Otherwise the label
          // box lands on top of notes that are still at full colour, and for the first
          // few frames it is unreadable.
          if (ht > 0.5) { r.highlighted = true; r.forceLabel = true; }
          return r;
        }
        // Nothing is permanently labelled. Notes are named on hover, on click and
        // in search results -- never by Sigma's viewport label grid, which assumes
        // nodes are spread out and is false by construction here: every hub is
        // packed into the centre, so they all compete for one grid cell and which
        // one wins is arbitrary.
        r.label = "";
        return r;
  }

  /* ------------------------------------------------------------------ logo */

  // The logo lives in the hub hole, sized as a fraction of it. Measured: the hole
  // is 90 units of radius on a 1016px stage at ratio 1.08, i.e. 180px across, so
  // 0.5 of that is ~114px on screen (it was 0.72 / ~163px, trimmed 30%). The
  // 192px asset is deliberately larger than that: at 2x DPR the same 114px box
  // wants ~228 device pixels.
  //
  // It is placed by projecting the disc centre and one point on the hole's edge
  // through the camera, rather than by assuming the stage centre: the centre is in
  // fact fixed (panning and rotation are off, and the pinned bbox is symmetric
  // about the origin, so camera 0.5,0.5 IS the disc centre) but the hole's radius
  // in PIXELS scales with the camera ratio, and hard-coding either would break on
  // zoom.
  var LOGO_OF_HOLE = 0.5;
  // A FIXED SIZE, in screen pixels. It used to be purely a fraction of the hub hole, which
  // meant it moved whenever the hole did -- and once the hub radius became something the
  // band balancer solves for, the logo started changing size with the folder layout, which
  // has nothing to do with it. Measured on the same vault across two balancer targets:
  // 160px, then 130px.
  //
  // LOGO_OF_HOLE stays as a CEILING rather than the rule. Zooming out shrinks the hole in
  // pixels, and a genuinely fixed size would then spill the mark out of the hub and under
  // the innermost notes. So: this size, or as much of it as the hole can hold.
  var LOGO_PX = 128;

  // Paint for the mask, taken from the ring itself: for each of RING_BUCKETS slices of
  // the circle, the colour of the OUTERMOST note sitting at that angle. So the logo
  // carries the same hues in the same directions as the wedges around it, and follows
  // every change to them -- palette, theme, filters, a group hidden and its neighbours
  // growing into the space -- with no second copy of the scheme to maintain.
  //
  // Sampled from positions rather than read off the plan on purpose: the plan knows
  // group spans, but what is actually on the rim at a given angle is a subfolder tint,
  // and the tints are most of what makes the disc look like itself.
  //
  // nodeColor, not the rendered display colour: hover and search deliberately dim
  // everything else, and the logo should not grey out when you search.
  var RING_BUCKETS = 144;         // 2.5 degrees each
  // Half-width of the colour blur, in buckets. 5 spreads each boundary over 11 buckets
  // (~27.5 degrees), which is wide enough that the mark reads as a wash of the disc's
  // palette rather than as wedges with soft joins. It was 2 (~12.5 degrees) first,
  // which still showed the wedge structure.
  var LOGO_BLEND_BUCKETS = 5;
  // The mean-coloured core that hides the conic gradient's centre singularity: solid
  // to CORE_SOLID% of the mark's half-width, gone by CORE_FADE%. Kept small -- past
  // ~30% the arcs are wide enough to blend on their own, and a bigger core just washes
  // the hue variation out of the middle of the mark.
  var CORE_SOLID = 9, CORE_FADE = 34;
  var lastGradient = "", lastGradientInner = "";
  var logoMaskReady = false, logoMaskImg = null;
  // Where the inner-band layer starts giving way to the outer one, as a fraction of
  // the mark's half-width. Opaque to the first stop, gone by the second -- so the
  // inner palette occupies a 40% core, not the 64% it started at, which let it take
  // over most of the mark.
  var LOGO_INNER_FADE = "16%, 40%";

  // One colour per angular bucket, shared by the CSS gradient and the PNG export so
  // the two cannot drift apart.
  function ringColors() {
    // Sample ONE band. The outer ring is what reads as "the disc" -- it is the big
    // one, it is what surrounds the mark, and its wedges are the subfolder tints worth
    // borrowing. The inner ring is six small groups packed close to the hub, so
    // including it crowded the mark with hues from an annulus barely wider than the
    // logo itself and fought the outer ring for the same angles.
    //
    // Except when the outer ring is empty -- filter down to only inner-band groups and
    // it becomes the disc, so it supplies the paint. Band membership comes from
    // bandLock, which is fixed at load, rather than from a radius test.
    var o = bandColors(false), i = bandColors(true);
    if (!o) return i || new Array(RING_BUCKETS);      // nothing on screen
    if (!i) return o;
    // Hand over CONTINUOUSLY rather than switching. `outer || inner` meant that the
    // frame the last outer note went invisible, the whole mark repainted from the
    // outer palette to the inner one in one step -- and in two-ring mode the core
    // layer was dropped at the same instant, so it jumped twice. Everything else in
    // this layout is driven by weights for exactly this reason; the logo was the last
    // discrete thing left.
    var t = outerPresence();
    if (t >= 0.999) return o;
    if (t <= 0.001) return i;
    return mixColorArrays(i, o, t);                  // t = 1 is pure outer
  }

  // How much of the outer band is on screen, as a 0..1 ramp. A ramp rather than a
  // boolean so the handover rides along with the cascade that causes it: alphas slide
  // continuously, so this does too.
  //
  // Measured as a SHARE of the band, not an absolute count. It was 12 notes' worth of
  // alpha, which on a 418-note outer band meant the ramp covered the last **2.9%** of
  // the fade -- continuous on paper, still a snap on screen. As a share, the knee sits
  // at a fixed fraction of the band however big the vault grows.
  //
  // The knee is what keeps ordinary filtering from tinting the mark: above it t is
  // pinned at 1, so hiding up to three quarters of the outer band changes nothing.
  // Below it the mark leans toward the inner palette, which is honest -- by then the
  // inner ring really is most of what is on screen.
  // ...and SMOOTHSTEPPED, not linear. A linear ramp has a kink where it meets the
  // knee -- the rate of colour change goes from nothing to full in one frame, which is
  // itself a visible event even though the value is continuous. Smoothstep is flat at
  // both ends, so the handover eases in and eases out.
  //
  // 0.5 rather than 0.25 because the ramp has to be long enough to read as a fade:
  // measured at 0.25 the last two tenths of the fade moved 92 and 93 (channel sum)
  // against a median of ~35, so the change was still piling up at the end.
  var BAND_HANDOVER = 0.5;          // share of the outer band at which the ramp starts
  function outerPresence() {
    var s = 0, n = 0;
    graph.forEachNode(function (id) {
      if (bandLock && bandLock[groupOf(id)]) return;  // inner band
      n++; s += alpha[id] || 0;
    });
    if (!n) return 0;
    var t = Math.max(0, Math.min(1, (s / n) / BAND_HANDOVER));
    return t * t * (3 - 2 * t);
  }

  function mixColorArrays(a, b, t) {
    var out = new Array(RING_BUCKETS);
    for (var i = 0; i < RING_BUCKETS; i++) {
      var x = toRgb(a[i] || "#888"), y = toRgb(b[i] || "#888");
      out[i] = "rgb(" + Math.round(x[0] + (y[0] - x[0]) * t) + "," +
                        Math.round(x[1] + (y[1] - x[1]) * t) + "," +
                        Math.round(x[2] + (y[2] - x[2]) * t) + ")";
    }
    return out;
  }

  // Raw sample of ONE band, gaps filled, or null if that band has nothing on screen.
  function bandColors(wantInner) {
    var col = new Array(RING_BUCKETS), rad = new Array(RING_BUCKETS), any = false;
    graph.forEachNode(function (id, a) {
      // present(), NOT a 0.5 cutoff. This was the last discrete step in the chain and
      // it defeated the smooth handover entirely: with a 0.5 threshold a band stops
      // being sampled the moment its last note passes half-faded, so the base snapped
      // from blended to pure-inner in one frame -- the jump between the final two
      // frames of the cascade, whatever `t` happened to be doing.
      //
      // Worth recording how this hid: every measurement of the handover set alphas to
      // exactly 0 or 1, so the threshold was never crossed and the curves looked
      // clean. A real cascade holds fractional alphas for most of its length. Test the
      // in-between states, not just the endpoints.
      if (!present(id)) return;
      if ((bandLock ? !!bandLock[groupOf(id)] : false) !== wantInner) return;
      var r = Math.hypot(a.x, a.y);
      if (!(r > 1e-6)) return;                       // hub notes have no direction
      var k = Math.floor(angleSweep(Math.atan2(a.y, a.x)) / (2 * Math.PI) * RING_BUCKETS);
      k = ((k % RING_BUCKETS) + RING_BUCKETS) % RING_BUCKETS;
      if (rad[k] === undefined || r > rad[k]) { rad[k] = r; col[k] = nodeColor(id); any = true; }
    });
    if (!any) return null;

    // Gaps -- the space between wedges, and any angle with nothing on it -- inherit
    // the last colour seen going clockwise, so a wedge's hue runs right up to its
    // neighbour's and the mark has no holes in it. With one band sampled these are
    // wider than before, which the blur then turns into long soft transitions.
    var first = -1;
    for (var i = 0; i < RING_BUCKETS; i++) if (col[i]) { first = i; break; }
    var carry = col[first];
    for (var n = 0; n < RING_BUCKETS; n++) {
      var j = (first + n) % RING_BUCKETS;
      if (col[j]) carry = col[j]; else col[j] = carry;
    }
    return col;
  }

  // Softened version of the same array: a circular box blur in RGB, so a wedge's hue
  // fades into its neighbour's instead of meeting it at a hard line. Hard edges were
  // the first version and read as a pie chart pasted inside the mark -- the disc's own
  // boundaries are crisp because they are separated by gaps and sit at a distance,
  // whereas here a dozen of them are crammed into ~130px with nothing between them.
  //
  // Blurred rather than eased per boundary because it is one pass over 144 buckets
  // that handles every boundary, the seam at 0/360, and runs too narrow to hold a
  // transition, without special cases for any of them.
  function ringColorsSmooth(src) {
    var col = src || ringColors();
    if (!col || !col[0]) return col || new Array(RING_BUCKETS);
    var n = RING_BUCKETS, w = LOGO_BLEND_BUCKETS, out = new Array(n);
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

  function ringGradient(src) {
    var col = ringColorsSmooth(src);
    if (!col || !col[0]) return "";

    // ONE position per bucket, at its centre, rather than a start/end pair. A pair
    // pins the colour flat across the whole bucket and steps at the join; a single
    // position lets the browser interpolate from each centre to the next, which is
    // the other half of the softening.
    var step = 360 / RING_BUCKETS, stops = [];
    for (var i = 0; i < RING_BUCKETS; i++) {
      var prev = col[(i - 1 + RING_BUCKETS) % RING_BUCKETS];
      var next = col[(i + 1) % RING_BUCKETS];
      // Skip only the INTERIOR of a flat run -- both of its ends have to be stated.
      // Dropping every repeat instead left one stop at the start of a run and the
      // next at the start of the following one, so the browser ramped across the
      // whole wedge: measured, a colour change spread over 47.5 degrees, which turns
      // every wedge into a smear rather than a plateau with soft joins.
      if (col[i] === prev && col[i] === next) continue;
      stops.push(col[i] + " " + ((i + 0.5) * step).toFixed(2) + "deg");
    }
    // Close the circle explicitly. The first and last bucket centres sit half a step
    // in from 0 and 360, so without these the seam is held flat at each end; the
    // blur already makes the two nearly equal, and this makes them exactly so.
    var seam = (function () {
      var a = toRgb(col[RING_BUCKETS - 1]), b = toRgb(col[0]);
      return "rgb(" + Math.round((a[0] + b[0]) / 2) + "," + Math.round((a[1] + b[1]) / 2) +
             "," + Math.round((a[2] + b[2]) / 2) + ")";
    })();
    stops.unshift(seam + " 0deg");
    stops.push(seam + " 360deg");
    // `from 0deg` is 12 o'clock running clockwise, which is exactly the sweep the disc
    // is laid out in -- so the mark's hues line up with the wedges behind it.
    var conic = "conic-gradient(from 0deg at 50% 50%, " + stops.join(", ") + ")";

    // A CORE of the palette's own mean, laid OVER the conic gradient.
    //
    // A conic gradient has a singularity at its centre: every angular stop converges
    // on one point, so a transition that is 29px wide out at the rim is 0px wide in
    // the middle. That is why the mark had a hard seam straight down the fissure no
    // matter how much angular blending was added -- the blend is measured in degrees
    // and degrees are worth nothing at r=0.
    //
    // Angle cannot help here, so the centre stops using it: it fades to the average of
    // all the buckets, which is the one colour that cannot clash with whatever meets
    // there. Radial, so the fix is strongest exactly where the problem is and gone by
    // the time the arcs are wide enough to blend on their own.
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
    // Core first = core on top.
    return core + ", " + conic;
  }

  function placeLogo() {
    var el = $("logo");
    if (!el || !logoMaskReady || !renderer || !geomLock) return;
    // Re-paint only when the ring's colours actually changed. This runs from
    // afterRender, so it fires on every frame of a cascade -- and assigning the same
    // background string 90 times would be 90 style recalculations for nothing.
    // The base layer is ringColors() in both modes -- the outer band, handing over to
    // the inner one as the outer empties. The core layer, in two-ring mode, is the
    // inner band on its own.
    var two = state.logoTwoRing;
    var g = ringGradient();
    var inner = two ? bandColors(true) : null;
    // Shown whenever the inner band has anything on screen. It used to also require a
    // non-empty outer band, on the grounds that the core would otherwise duplicate the
    // base -- but that dropped the layer on the exact frame the base finished handing
    // over to the inner palette, which is a second jump on top of the first. Letting
    // it duplicate is harmless: both layers converge on the same colours, so the mark
    // simply becomes uniformly inner-coloured with nothing popping.
    var gi = (two && inner) ? ringGradient(inner) : "";
    if (g && g !== lastGradient) { lastGradient = g; el.style.background = g; }
    var eli = $("logoInner");
    if (eli) {
      if (gi) {
        if (gi !== lastGradientInner) { lastGradientInner = gi; eli.style.background = gi; }
      } else if (lastGradientInner) { lastGradientInner = ""; }
      eli.hidden = !gi;
    }
    var c = renderer.graphToViewport({ x: 0, y: 0 });
    var edge = renderer.graphToViewport({ x: geomLock.r0 * UNIT, y: 0 });
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

  // Node sizes are SCREEN pixels and are fixed at graph build; the disc's pixel
  // radius is not, because the pinned bbox is mapped to the stage, so a shorter
  // window draws a smaller disc with the same size dots. The NODE_MAX cap of 11 was
  // tuned against a measured ~28px row pitch on a 1068x1270 stage -- and on a 1080p
  // screen the stage is barely 720px tall, where the same disc packs its rows 22.6px
  // apart. Measured there: 3 touching pairs, worst overlap 9.8px. The cap was doing
  // its job; the thing it was calibrated against had moved.
  //
  // So the sizes are scaled by the pitch actually on screen, which restores the
  // tuned radius-to-pitch relationship at any window size. Capped at 1 so a large
  // screen is untouched (measured 30.3px there, i.e. already above the reference),
  // and floored so dots cannot vanish. Zooming in raises the pitch and returns the
  // scale to 1, which is the right behaviour: zoom is how you get detail back.
  // A FLOOR ON THE SCALE IS A FLOOR ON OVERLAP, and that is what it turned into.
  //
  // Scaling every size by pitch/REF_PITCH keeps the tuned radius-to-pitch relationship, so
  // dots never outgrow the lattice -- but only while the scale is allowed to fall. The floor
  // was there so dots could not vanish, and it was set against vaults whose rows land 22-30px
  // apart. A 10,000-note disc fitted to the stage puts its rows 4.5px apart, where the honest
  // scale is 0.16 and the floor holds it at 0.45 -- so dots draw 2.8x too big for the lattice.
  // Measured there: the biggest dot 175 units of RADIUS against a 160-unit row pitch, 349
  // across, and the MEDIAN dot 192 across. At those sizes overlap is not a tuning problem,
  // it is arithmetic, and it was also what made wedges interleave along their boundaries.
  //
  // So the two ends are handled separately, because they want opposite things. The BIGGEST dot
  // is capped at a fraction of the pitch, which is the relationship that has to hold or notes
  // collide. The SMALLEST is floored in pixels, which is the one that has to hold or notes
  // disappear. In between it is linear, so the degree ordering survives wherever there is room
  // to show it -- and where there is not, the range simply flattens rather than overflowing.
  //
  // DOT_OF_PITCH is 11/28: the cap and reference pitch that were already tuned together, now
  // expressed as the ratio they always were. At the reference pitch this reproduces today's
  // sizes exactly; below it, it keeps doing what the multiplier was meant to.
  var REF_PITCH = 28;
  // NO FLOOR AND NO CEILING ON A MULTIPLIER, because the multiplier is gone. github#13
  // raised the ceiling from 1 to 2.4 for a good reason -- a filtered disc genuinely has more
  // room per note, and clamping at 1 kept the median dot at 4.2px while its neighbours' room
  // nearly tripled -- but a clamp at either end is a knee, and a knee is what dots growing as
  // you zoom in and then shrinking again actually is. Measured across a 21x zoom, diameter
  // over pitch: 0.786 flat below the old knee, then 0.55, 0.367, 0.092 above it.
  //
  // Both ends are now separate numbers with separate jobs, and neither is a clamp on the
  // other: the biggest dot is a fraction of the pitch (or notes collide), the smallest is a
  // floor in PIXELS (or notes vanish), and the range between them is linear. The room a
  // filtered disc gains is picked up per note by dotFit, which measures it rather than
  // inferring it from a ratio of counts.
  var DOT_OF_PITCH = 11 / 28;   // biggest dot RADIUS, as a fraction of the lattice pitch
  var DOT_MIN_PX = 1.5;         // and the smallest is still a dot
  // How far a dot may grow with a spreading lattice before it stops following it. 1.6 of a
  // normal row's worth: enough that a filtered disc reads as bigger dots, short of the point
  // where two of them are most of the space between their neighbours.
  // Up from 1.6, which was set when a filtered band's dots became blobs -- and most of that
  // was the inner band wearing the OUTER band's ramp, since there was only one. With a ramp per
  // band, a dot can follow its own lattice all the way to the spacing cap, which is what keeps
  // the proportion the design is stated in. Measured before: a 96-of-454 range spread the outer
  // pitch to 2.5 while the cap held dots at 1.6, so diameter over step came out 0.49 at the
  // largest dot against a design of 0.786 -- 0.786 * (1.6 / 2.5) exactly. Reported as gaps
  // between the seam and the edge notes, which is what a sparse ring of undersized dots is.
  var DOT_MAX_SPREAD = DENSITY_MAX;
  // How far a dot may outgrow its band's pitch on the strength of the room it measures. The
  // shrink direction is unbounded on purpose -- a crowded note gives up whatever it must.
  //
  // THE SAME FACTOR THE LATTICE MAY SPREAD BY, and it has to be, because a ring of fixed
  // diameter holding few notes spreads TANGENTIALLY without limit while its radial pitch is
  // capped at DENSITY_MAX. Measured on a 22-of-454 range: pitch 416 units, step 1046 -- 2.5x --
  // so a 1.6 ceiling drew dots at diameter/step 0.26 against a design of 0.786, and the ring
  // read as nine small dots adrift on a circle. Set to the spacing cap, the growth a dot is
  // allowed and the spread the lattice is allowed are one number instead of two that disagree.
  var DOT_ROOM_MAX = DENSITY_MAX;
  // display px = DOT_M * attr size + DOT_B, never below DOT_LO.
  var DOT_M = 1, DOT_B = 0, DOT_LO = DOT_MIN_PX;
  var DOT_MI = 1, DOT_BI = 0, DOT_LOI = DOT_MIN_PX;   // the inner band's own ramp
  var sizeScale = 1;            // kept for the probe and the report; = DOT_M at NODE_MAX

  // Whether the border program actually loaded. If the bundle ever ships without it,
  // highlighting still works -- the radial push carries it on its own -- rather than
  // asking Sigma for a node type it cannot draw.
  var haloOn = !!RENDERING.createNodeBorderProgram;

  function measureSizeScale() {
    if (!renderer) return sizeScale;
    // One row of spacing is lastSP LATTICE units, i.e. lastSP * UNIT graph units. That
    // distinction is the fix: measuring one lattice unit answered a question about the
    // camera, and the question here is how much room a note has next to its neighbour.
    var a = renderer.graphToViewport({ x: 0, y: 0 });
    var b = renderer.graphToViewport({ x: UNIT * (lastSP || 1), y: 0 });
    var pitch = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(pitch > 0)) return sizeScale;
    // TIMES THE CAMERA RATIO, because sigma now scales what we hand it by 1/ratio (see
    // zoomToSizeRatioFunction). pitch * ratio is the px-per-row at ratio 1 -- a property of the
    // stage and the normalisation box, not of the zoom -- so `hi` below comes out the same
    // number at every zoom and the dot keeps its proportion to the lattice. Without this the
    // two scalings compound and the dots grow as 1/ratio squared.
    var cam = renderer.getCamera().getState().ratio || 1;
    pitch *= cam;
    // The two ends, then the line between them.
    //
    // NO PIXEL CEILING ON THE TOP END, and taking one out is what fixed the strangest report
    // of the lot: dots that grew as you zoomed in and then shrank again. NODE_MAX is 11 and
    // was a PIXEL cap, tuned when `size` meant pixels -- but the rule now is that a dot is a
    // fraction of the row pitch, and the two disagree the moment the pitch passes 28px. Below
    // the knee the dots tracked the lattice; above it they froze at 11px while the lattice kept
    // growing, so they read as swelling and then dwindling. Measured, diameter over pitch:
    // 0.786, 0.786, 0.786, then 0.55, 0.367, 0.092 as the camera closed in.
    //
    // Unbounded is the honest answer: zoomed far enough in, one note SHOULD fill the view.
    // NODE_MAX stays as the top of the attribute range the line below maps from.
    // CAPPED IN ABSOLUTE TERMS TOO. DOT_OF_PITCH of the live pitch is the relationship that
    // has to hold -- a dot against the space it has -- but a heavily filtered band spreads its
    // pitch by up to DENSITY_MAX, and a dot riding that is a blob. The ratio is
    // preserved right up to the cap and then held, which reads as a sparse ring of ordinary
    // dots rather than a handful of balloons.
    // ONE RAMP PER BAND, because there is one pitch per band and a dot is a fraction of its
    // OWN pitch. Calibrated from lastSP alone, the whole disc was sized by the OUTER ring:
    // measured on a 96-of-454 date range, the outer pitch was 400 units and the inner 206, and
    // the same dots went into both -- worst pair clearance 239 in the outer band against 29 in
    // the inner. Reported exactly that way round, gaps at the outer seams and notes touching on
    // the inner ring, which is one bug seen from both ends.
    //
    // The floor is the one thing that IS about pixels on screen -- a dot has to stay visible --
    // so it is converted the other way, from px to the size units sigma will divide by ratio.
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
    var ro = rampFor(UNIT * (lastSP || 1));
    var ri = rampFor(UNIT * (lastSPI || 1) * INNER_SCALE);
    DOT_M = ro.m; DOT_B = ro.b; DOT_LO = ro.lo;
    DOT_MI = ri.m; DOT_BI = ri.b; DOT_LOI = ri.lo;
    return ro.hi / NODE_MAX;   // what the old multiplier would have been at the top end
  }

  // A dot's radius in display pixels. One place, so the renderer, the label placer and any
  // measurement all agree about how big a dot is.
  //
  // AND CAPPED BY THE ROOM THIS NOTE HAS. The mapping above sizes against the row pitch; a
  // note whose row neighbours sit closer than that gets scaled down to keep the same
  // proportion to the gap it actually has. Both directions matter and the nearer one wins,
  // which is what dotFit already holds.
  function dotPx(size, id) {
    // Which band this note is in, so both the ramp and the room it is measured against are
    // the ones that belong to it.
    var isIn = id !== undefined && bandLock && !!bandLock[groupOf(id)];
    var v = (isIn ? DOT_MI : DOT_M) * (size || 4) + (isIn ? DOT_BI : DOT_B);
    if (id !== undefined) {
      // THE BAND'S ROOM, NOT THIS NOTE'S. Sizing each note against its own neighbours makes
      // size a function of position as well as of link weight, and the two disagree: notes are
      // laid down in weight order from the inside out, so the innermost note is the most
      // connected one -- and the innermost row has the shortest arc, therefore the least room,
      // therefore the smallest dot. The most connected note came out smaller than its
      // neighbours and the graph read backwards, which is what a graph must not do.
      //
      // One figure per band, the tightest pair in it, makes size strictly monotone in link
      // weight: the ordering is the whole point of the encoding and nothing local may perturb
      // it. Taking the MINIMUM is what keeps that safe -- the biggest dot in the band is sized
      // to fit the closest pair in it, so nothing can touch. The price is that one crowded pair
      // sets the size for its whole band, which is the honest trade for an encoding that can be
      // read.
      var room = bandRoom[isIn ? "i" : "o"];
      var mine = cellRoom[id];
      if (mine !== undefined && mine > 1 && (!(room > 1) || mine < room)) room = mine;
      // AND NOTHING PER NOTE. A cap taken from this note's own measured room was tried, to stop
      // the tightest pairs touching, and it is the thing that made dots breathe: dotFit is
      // measured off live positions, and a note's NEAREST NEIGHBOUR is not a fixed neighbour --
      // it changes as the disc moves and as notes arrive, so a minimum over it jumps for
      // reasons that have nothing to do with the note. Measured directly, with the cap the
      // worst single-frame size change was 252% and 72 of 122 frames moved more than 5%;
      // without it, 2.2% and none. It also broke the ordering it was bolted onto, which is the
      // property the encoding exists for. Both requirements point the same way.
      var pit = pitchUnits(isIn ? "i" : "o");
      // BOTH WAYS. This only ever shrank a dot, which is half a rule: the ramp sizes a note
      // against the RADIAL pitch, dotFit measures the room it has ALONG its row, and those two
      // are the same number only when a row is exactly full. They usually are not. Measured on
      // a 96-of-454 range: pitch 400 units, step 640, so every note had 1.6x the room its size
      // was drawn from -- diameter over step 0.49 against a design of 0.786, which reads as a
      // sparse ring with gaps at every seam and was reported as exactly that. Letting the same
      // ratio grow a dot as well as shrink it restores the proportion the design is stated in,
      // in every filter state rather than only in the full one.
      //
      // Bounded, because room is unbounded: beside a hole a note would otherwise inflate to
      // fill it, which trades a gap for a balloon and hides the hole rather than fixing it.
      if (room !== undefined && pit > 1e-9) {
        var f = room / pit;
        if (f > DOT_ROOM_MAX) f = DOT_ROOM_MAX;
        v *= f;
      }
    }
    var lo = isIn ? DOT_LOI : DOT_LO;
    return v < lo ? lo : v;
  }

  // Returns true if it moved enough to be worth a repaint. The threshold is what
  // keeps this from oscillating when it is driven from render-time events.
  function syncSizeScale() {
    var next = measureSizeScale();
    if (Math.abs(next - sizeScale) < 0.01) return false;
    sizeScale = next;
    return true;
  }

  function refreshSizeScale() {
    if (syncSizeScale() && renderer) renderer.refresh();
  }

  /* -------------------------------------------------------- edge curvature */

  // Bow a link AWAY from the disc centre rather than letting it chord straight
  // across. Measured on this vault only 9% of links stay inside one folder, so
  // most of the 1419 of them join notes in different wedges -- and two rim notes
  // on opposite sides are joined by a line through the hub. At this count that is
  // a flat grey wash over the middle of the disc, which is exactly where the
  // inner ring lives.
  //
  // The bow is scaled by how close the chord would have passed to the centre, so
  // a link between neighbours in one wedge stays almost straight and only the
  // long cross-disc ones sweep round. Uniform curvature was tried first and reads
  // worse: it bends the short local links, which are the ones whose straightness
  // carries the "these two notes are near each other" signal.
  var CURVE_MIN = 0.05, CURVE_MAX = 0.55;

  function discR() {
    return geomLock && geomLock.maxR ? geomLock.maxR * UNIT : 1;
  }

  function curvatureFor(s, t) {
    var dx = t.x - s.x, dy = t.y - s.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (!len) return CURVE_MIN;
    // Perpendicular distance from the disc centre to the chord's LINE: a link
    // aimed through the hub scores ~0, one hugging the rim scores ~R.
    var h = Math.abs(s.x * t.y - s.y * t.x) / len;
    var near = 1 - Math.min(1, h / (discR() * 0.5));
    // Squared, so the ramp stays near CURVE_MIN for most links and only the ones
    // genuinely crossing the hub get the full bow.
    var mag = CURVE_MIN + (CURVE_MAX - CURVE_MIN) * near * near;
    // Sign picks the side to bow toward. Sigma bows to the +90deg side of
    // source->target, so test that normal against the chord's midpoint: if they
    // agree the bow points away from the centre, which is the one we want.
    var out = (-dy / len) * (s.x + t.x) / 2 + (dx / len) * (s.y + t.y) / 2;
    return out >= 0 ? mag : -mag;
  }

  function makeRenderer() {
    renderer = new SigmaCls(graph, $("graph"), {
      allowInvalidContainer: true,
      renderLabels: true,
      labelRenderedSizeThreshold: 11,
      labelDensity: 0.2,
      labelGridCellSize: 150,
      labelFont: 'ui-sans-serif, "Segoe UI", system-ui, sans-serif',
      labelSize: 11,
      labelWeight: "500",
      // Sigma defaults these to black-on-anything and a hardcoded #FFF hover pill,
      // which is illegible / jarring on the dark surface.
      labelColor: { color: THEME.text },
      defaultDrawNodeHover: drawHover,
      zIndex: true,
      // SIZES SCALE WITH THE LATTICE, NOT WITH ITS SQUARE ROOT.
      //
      // Sigma's default zoomToSizeRatioFunction is Math.sqrt, so a node's drawn radius goes as
      // 1/sqrt(ratio) while its POSITION goes as 1/ratio. The two therefore diverge on every
      // zoom, and no choice of size can hold a dot at a fixed fraction of the gap to its
      // neighbour. Measured, drawn diameter over row pitch: 0.76 at rest, 1.44 three notches
      // in, 3.51 at the far end -- dots that end up swallowing their neighbours, which is
      // exactly what "they still touch when zooming in" was.
      //
      // Identity makes the multiplier 1/ratio, the same law the positions follow, so the
      // relationship between a dot and the space it has is the one thing that does NOT change
      // as the camera moves. The sizes fed in are then pinned to the lattice once (see
      // measureSizeScale) rather than re-derived per frame.
      zoomToSizeRatioFunction: function (x) { return x; },
      minCameraRatio: 0.02,
      maxCameraRatio: 12,
      // PANNING IS ON, and the centre lock that used to fight it is gone.
      //
      // The disc was pinned to the middle of the stage on the reasoning that it is the whole
      // point of the view, with a camera listener that put x and y back to 0.5 after every
      // update. That is defensible while the only camera gesture is zoom -- but it also
      // makes zoom-toward-pointer a lie, since the camera is dragged back the moment it
      // moves, so zooming in on one wedge walks it off the far edge instead. Panning plus a
      // reset is the ordinary answer, and it costs nothing that a reset does not give back.
      //
      // Rotation stays off: the wedge labels and the heatmap's day rows both assume up is up.
      //
      // The initial value is the SETTING rather than a literal: the host may have persisted
      // it off, and starting on and correcting afterwards would let one drag through before
      // the lock arrived.
      enableCameraPanning: panEnabled,
      enableCameraRotation: false,
      enableCameraZooming: true,
      // ONE WHEEL NOTCH WAS 70%. Sigma's default zoomingRatio is 1.7, so every notch
      // multiplied or divided the ratio by that -- three notches and the disc has gone from
      // filling the stage to a sixth of it. 1.2 is about 32 notches across the whole
      // 0.02..12 range, which is a scroll rather than a teleport.
      //
      // The animation is shortened with it. 250ms per notch is fine at 70% and lags visibly
      // at 20%, because the next notch arrives before the last one has landed.
      zoomingRatio: 1.2,
      zoomDuration: 120,
      defaultEdgeType: "line",
      // Both programs are registered up front so the toggle is a per-edge `type`
      // in the reducer rather than a renderer rebuild. Sigma merges these with its
      // own defaults, so "line" survives. NB the programs live on
      // Sigma.rendering, NOT on Sigma -- getting that wrong makes a program
      // silently never appear, with no error anywhere.
      edgeProgramClasses: RENDERING.EdgeCurveProgram
        ? { curve: RENDERING.EdgeCurveProgram } : {},
      // A ring around highlighted notes. borders[0] is the OUTER band and the
      // {fill:true} entry is the CORE -- the reverse of what the option order
      // suggests, which is worth stating because getting it backwards silently
      // draws a solid blob in the halo colour.
      nodeProgramClasses: RENDERING.createNodeBorderProgram ? {
        halo: RENDERING.createNodeBorderProgram({
          borders: [
            { size: { value: 0.26 }, color: { attribute: "haloColor" } },
            { size: { fill: true }, color: { attribute: "color" } },
          ],
        }),
      } : {},
      enableEdgeEvents: false,
      // Opacity is applied here, once, rather than at each of nodeStyle's five
      // exits. Everything below 0.004 is genuinely hidden, so a fully faded note
      // costs nothing to render and drops out of hit-testing.
      nodeReducer: function (id, a) {
        var al = alpha[id] || 0;
        if (al <= 0.004) { var h = Object.assign({}, a); h.hidden = true; return h; }
        var r = nodeStyle(id, a);
        if (al < 0.999) {
          // Fade AND grow: opacity alone reads as a colour change, while a note
          // that also scales up reads as arriving. Labels wait until it is
          // mostly there, so the cascade is not a wall of half-legible text.
          r.color = withAlpha(r.color || a.color, al);
          r.size = (r.size || a.size) * (0.45 + 0.55 * al);
          if (al < 0.62) { r.label = ""; r.forceLabel = false; r.highlighted = false; }
        }
        // Applied last, so it carries the arrival ramp above as well as the resting size --
        // a fading note should grow toward the size it will actually hold. The ramp is a
        // RATIO against the attribute size, so it survives the switch from a multiplier to a
        // mapping: work out what fraction the ramp asked for, then take that fraction of the
        // size this dot is entitled to.
        var base = a.size || 4;
        r.size = dotPx(base, id) * ((r.size === undefined ? base : r.size) / base);
        return r;
      },
      edgeReducer: function (id, a) {
        var r = Object.assign({}, a);
        var x = graph.extremities(id);
        var al = Math.min(alpha[x[0]] || 0, alpha[x[1]] || 0);
        if (al <= 0.004) { r.hidden = true; return r; }
        if (state.curveEdges && RENDERING.EdgeCurveProgram) {
          r.type = "curve";
          r.curvature = curvatureFor(graph.getNodeAttributes(x[0]),
                                     graph.getNodeAttributes(x[1]));
        }
        r.color = THEME.edge;
        var focus = focusSet();
        if (state.query) { r.color = THEME.dim; return r; }
        if (focus) {
          // In step with the nodes, off the same hoverT -- the web separating from the
          // rest is most of what makes a hover legible, so it cannot lag behind it.
          var ht = hoverAmount(), base = a.size || 1;
          if (focus[x[0]] && focus[x[1]]) {
            r.color = mixHex(THEME.edge, THEME.edgeHi, ht);
            r.size = base + (1.4 - base) * ht;
            r.zIndex = 2;
          } else {
            r.color = mixHex(THEME.edge, THEME.dim, ht);
            r.zIndex = 0;
          }
        }
        // Squared, so links lag their notes: the dots land first and the web
        // draws itself in behind them rather than everything arriving at once.
        if (al < 0.999) r.color = withAlpha(r.color, al * al);
        return r;
      }
    });

    // The centre lock is gone -- see enableCameraPanning above. What it was bundled with is
    // not: a camera change moves the hub hole in screen pixels, so the logo has to be
    // re-placed and the row pitch re-measured whatever moved the camera.
    (function () {
      var cam = renderer.getCamera();
      cam.on("updated", function () { placeLogo(); refreshSizeScale(); });
    })();

    // A window resize changes the disc's pixel radius without touching the camera,
    // so it needs its own hook. Debounced, because a drag-resize fires continuously
    // and each change costs a full refresh.
    var rzTimer = null;
    // OBSERVE THE CONTAINER. A window resize listener is right for a page that fills the
    // window and wrong for a view inside an app: dragging an Obsidian sidebar resizes this
    // element without resizing the window, and closing a pane resizes it the other way.
    // Watching the element covers both, and still fires on a window resize, because the
    // container is sized from the window in the standalone.
    var onResize = function () {
      if (rzTimer) WIN.clearTimeout(rzTimer);
      rzTimer = WIN.setTimeout(function () { rzTimer = null; refreshSizeScale(); placeLogo(); }, 120);
    };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(root);
    else window.addEventListener("resize", onResize);

    // afterRender covers the cases a camera event does not: the first paint, a
    // container resize (Sigma re-reads its dimensions and renders without the camera
    // changing at all), and -- the one that actually bit -- the END of fit()'s 380ms
    // camera animation. Measuring the row pitch straight after calling fit() reads
    // the pre-animation ratio, which pinned sizeScale to its floor and drew every
    // dot at 4.95px instead of 8.9px.
    //
    // Safe against a repaint loop because syncSizeScale only reports a change worth
    // more than 0.01: change -> refresh -> afterRender -> no change -> stop.
    renderer.on("afterRender", function () {
      placeLogo(); refreshSizeScale(); heatDraw(); hlSync();
    });

    renderer.on("enterNode", function (e) { state.hovered = e.node; showTip(e.node); hoverTo(1); });
    // The tip goes at once -- it tracks the pointer, so leaving it behind would leave it
    // pointing at nothing -- but the DISC fades back out, which is why state.hovered is
    // released by the tween at zero rather than here.
    renderer.on("leaveNode", function () { hideTip(); hoverTo(0); });
    renderer.on("clickNode", function (e) { select(e.node); });
    renderer.on("clickStage", function () { select(null); });

    // DOUBLE CLICK RESETS THE VIEW, on the stage and on a note alike.
    //
    // preventSigmaDefault() is what makes it a reset rather than a reset AND sigma's own
    // double-click zoom: the captor emits the event and then checks that flag before doing
    // its own thing, synchronously, so setting it here is seen. Without it the two fight and
    // the camera lands somewhere neither asked for.
    //
    // A note gets the same treatment as the stage on purpose. "Double click zooms to this
    // note" is a defensible other answer, but then double click means two things depending
    // on a 6px target, and one of them is not what the tooltip says.
    var onDoubleClick = function (e) {
      if (e && e.preventSigmaDefault) e.preventSigmaDefault();
      fit();
    };
    renderer.on("doubleClickStage", onDoubleClick);
    renderer.on("doubleClickNode", onDoubleClick);
  }

  /* ------------------------------------------------------- group labels */


  /* ------------------------------------------------------------ tooltip */

  function showTip(id) {
    var a = graph.getNodeAttributes(id), t = $("tip");
    var p = renderer.graphToViewport({ x: a.x, y: a.y });
    setHTML(t, '<div class="t">' + esc(a.label) + '</div>' +
      '<div class="m">' + esc(groupOf(id)) + ' &middot; ' + a.deg + ' link' + (a.deg === 1 ? "" : "s") +
      '<br>' + esc(a.ntype) + ' &middot; ' + esc(a.folder) +
      (a.sub ? ' / ' + esc(a.sub) : '') +
      '</div>');
    t.hidden = false;
    // #canvas, NOT #stage: graphToViewport returns coordinates relative to
    // sigma's container, and the heatmap band means #stage's origin is now
    // above it. Measuring against #stage put every tooltip the height of the
    // band too low, and clamped it against the wrong bottom edge.
    var box = t.getBoundingClientRect(), st = $("canvas").getBoundingClientRect();
    var x = Math.min(p.x + 14, st.width - box.width - 8);
    var y = Math.min(Math.max(p.y - box.height - 10, 8), st.height - box.height - 8);
    t.style.left = x + "px"; t.style.top = y + "px";
  }
  function hideTip() { $("tip").hidden = true; }

  /* ------------------------------------------------------- detail panel */

  function select(id) {
    state.selected = id;
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
      (a.ghost ? "" : '<div><a class="open" href="obsidian://open?vault=' + vault + '&file=' + file + '">Open in Obsidian</a></div>');

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
    Array.prototype.forEach.call(d.querySelectorAll("[data-go]"), function (b) {
      b.onclick = function () { select(b.getAttribute("data-go")); centerOn(b.getAttribute("data-go")); };
    });
    renderer.refresh();
  }

  // The camera lives in framed-graph space, not graph space, so read the node's
  // display coords rather than its raw x/y.
  function centerOn(id) {
    var d = renderer.getNodeDisplayData(id);
    if (!d) return;
    renderer.getCamera().animate({ x: d.x, y: d.y, ratio: 0.22 }, { duration: 420 });
  }

  /* ---------------------------------------------------------------- UI */

  function buildLegend() {
    // EVERY ROW BELOW IS ABOUT TO BE REPLACED, and the one under the pointer goes with
    // them -- so its mouseleave will never fire and its halo would be left on with
    // nothing hovered. Clearing here is the only place that covers all of the callers
    // (a click, a colour pick, a filter) rather than each of them remembering to.
    hoverHighlight(null, null);

    var names = order[state.dim] || [];
    $("gcount").textContent = "(" + names.length + ")";

    // Count notes per subfolder so the nested rows can show their size.
    var subCount = Object.create(null);
    // ...and the folder TREE, as "prefix -> { childName: count }" at every depth. Built
    // by walking each note's own `dirs` chain, so the legend's nesting comes from the
    // vault rather than from any assumed number of levels: a folder five deep renders
    // the same way as one a single level down.
    var kids = Object.create(null);
    if (state.dim === "folder") {
      graph.forEachNode(function (_id, a) {
        var k = a.folder + "/" + (a.sub || "");
        subCount[k] = (subCount[k] || 0) + 1;
        var d = a.dirs || [];
        for (var i = 0; i < d.length; i++) {
          var pk = a.folder + "/" + d.slice(0, i).join("/");
          if (!kids[pk]) kids[pk] = Object.create(null);
          kids[pk][d[i]] = (kids[pk][d[i]] || 0) + 1;
        }
      });
    }

    // One eye, two states. Drawn as inline SVG rather than an emoji or a font glyph
    // so it is the same 14px shape on every machine and inherits currentColor.
    var eyeBtn = function (attrs, on, what) {
      return '<button class="eye" ' + attrs + ' aria-pressed="' + on + '" title="' +
             (on ? "Hide " : "Show ") + esc(what) + '">' + eyeSvg(on) + '</button>';
    };
    // A disclosure twisty, or an invisible placeholder so labels stay aligned.
    var twBtn = function (attrs, open) {
      return attrs
        ? '<button class="tw" ' + attrs + ' aria-expanded="' + open + '">' +
          (open ? "▾" : "▸") + '</button>'
        : '<span class="tw none">▸</span>';
    };

    // Everything BELOW a sub-wedge row, recursively, at whatever depth the vault goes.
    // These levels take no tint and cut no wedge -- they inherit their parent's swatch
    // colour, because that is the truth: the pie does not distinguish them, and the
    // legend must not claim otherwise. What they do get is their own eye and their own
    // highlight, which is what makes a person's 1-on-1s selectable.
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
      var hasSubs = state.dim === "folder" && (subOrder[g] || []).length > 1 &&
                    (counts[g] || 0) >= NEST_MIN;
      var open = hasSubs && !state.collapsed[g];
      var hl = !!state.highlight[g];

      var row = '<div class="lgr">' +
        twBtn(hasSubs ? 'data-tw="' + esc(g) + '"' : null, open) +
        eyeBtn('data-eye="' + esc(g) + '"', vis, g) +
        '<button class="lg" data-g="' + esc(g) + '" data-hl="' + (hl ? "on" : "off") +
          '" aria-pressed="' + vis + '" title="Highlight ' + esc(g) + '">' +
        // THE SWATCH SAYS WHICH RING, by its size: a small square for the inner band and a
        // full one for the outer. The legend named a colour and a count and said nothing about
        // where on the disc to look, which is the one thing a two-ring layout needs it to say.
        // Size rather than another glyph or another colour: it costs no room, adds no
        // vocabulary, and the inner ring IS the smaller ring -- so the mark and the thing it
        // stands for read the same way round.
        '<span class="sw' + (bandLock && bandLock[g] ? ' sw-in' : '') +
          '" title="' + (bandLock && bandLock[g] ? 'Inner ring' : 'Outer ring') +
          '" style="background:' + colorOf(g) + '"></span>' +
        '<span class="nm" title="' + esc(g) + '">' + esc(g) + '</span>' +
        '<span class="only" data-only="1" title="Show only ' + esc(g) + '">only</span>' +
        '<span class="ct">' + counts[g] + '</span></button>' +
        '</div>';

      // Subfolders are listed only when they actually get their own wedges, so the
      // legend never promises a split the pie does not show -- and only when the
      // group is unfolded and visible.
      if (open && vis) {
        var subs = subOrder[g];
        // One row per subfolder: an eye, a tint swatch, a name and a count. The tail
        // row stands for several subfolders at once, so it carries all their indices
        // and its eye toggles every folder it represents.
        var srow = function (col, nm, ct, idx, depth, twAttrs, twOpen) {
          var on = !state.hiddenSub[g + "/" + subs[idx[0]]];
          // Highlighted only when EVERY subfolder the row stands for is highlighted,
          // so the aggregate tail row reports the truth rather than lighting up for
          // a partial selection made further down.
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
          // A named sub-wedge gets a twisty of its own when the vault nests deeper
          // under it -- that is how `00 1 on 1` keeps being one wedge of 62 notes AND
          // opens to the seven people inside it.
          row += srow(tint, sb || "(directly in folder)", subCount[pk] || 0, [k], 1,
                      kids[pk] ? 'data-twp="' + esc(pk) + '"' : null,
                      !!state.pathOpen[pk]);
          row += subtree(pk, 2, tint);
        });
        var tail = subs.slice(SUB_NAMED);
        if (tail.length) {
          var n = 0;
          tail.forEach(function (sb) { n += subCount[g + "/" + sb] || 0; });
          var tOpen = !!state.tailOpen[g];
          // The aggregate row keeps its own eye (toggling all of them at once) and
          // gains a twisty, because "7 smaller subfolders" is exactly the row you
          // want to look inside. They all share the last tint step, so the swatches
          // beneath are deliberately identical -- the pie does not distinguish them
          // either, and pretending otherwise in the legend would be a lie.
          row += srow(subShade[g + "/" + tail[0]] || colorOf(g),
                      tail.length + " smaller subfolders", n,
                      tail.map(function (_, j) { return SUB_NAMED + j; }), 1,
                      'data-twtail="' + esc(g) + '"', tOpen);
          if (tOpen) {
            tail.forEach(function (sb, j) {
              var pk = g + "/" + sb, tint = subShade[pk] || colorOf(g);
              row += srow(tint, sb || "(directly in folder)", subCount[pk] || 0,
                          [SUB_NAMED + j], 2,
                          kids[pk] ? 'data-twp="' + esc(pk) + '"' : null,
                          !!state.pathOpen[pk]);
              row += subtree(pk, 3, tint);
            });
          }
        }
      }
      return row;
    }).join(""));

    var each = function (sel, fn) {
      Array.prototype.forEach.call($("legend").querySelectorAll(sel), fn);
    };

    // "only" at a LEVEL-1 row: keep the named subfolders this row stands for (the tail
    // row stands for several) and hide every sibling. subOrder[g] carries "" for notes
    // sitting directly in the folder, and "<g>/" is exactly the key visible() checks
    // for those, so the empty name needs no special case.
    var onlySubs = function (g, keep) {
      var h = state.hidden[state.dim] || (state.hidden[state.dim] = Object.create(null));
      (order[state.dim] || []).forEach(function (n) { h[n] = (n !== g); });
      state.hiddenSub = Object.create(null);
      (subOrder[g] || []).forEach(function (sb) {
        if (keep.indexOf(sb) < 0) state.hiddenSub[g + "/" + sb] = true;
      });
    };

    // "only" at any DEEPER row, keyed by full path. Hiding is inherited by a subtree,
    // so the right thing to hide is the shallowest key on each note's own chain that
    // DIVERGES from the wanted path -- one key per sibling branch, at whatever depth it
    // branches. Derived from the notes rather than from the tree the legend drew,
    // because the legend only renders what is unfolded.
    var onlyUnder = function (g, path) {
      var h = state.hidden[state.dim] || (state.hidden[state.dim] = Object.create(null));
      (order[state.dim] || []).forEach(function (n) { h[n] = (n !== g); });
      state.hiddenSub = Object.create(null);
      var rest = path.slice(g.length + 1);
      var want = rest ? rest.split("/") : [];
      graph.forEachNode(function (_id, a) {
        if (a.folder !== g) return;
        var d = a.dirs || [], i = 0;
        while (i < want.length && i < d.length && d[i] === want[i]) i++;
        if (i === want.length) return;                  // at or under the wanted path
        // Diverged at i, or ran out of depth before reaching it. slice(0, i + 1) is the
        // branch to hide; for a note directly in the folder that is "" -> "<g>/".
        state.hiddenSub[g + "/" + d.slice(0, i + 1).join("/")] = true;
      });
    };

    // Twisties: pure disclosure. No layout consequence at all, so no cascade -- the
    // pie already shows every sub-wedge whether or not the legend lists it.
    each("[data-tw]", function (b) {
      var g = b.getAttribute("data-tw");
      // THE WHOLE ROW ANSWERS "WHERE IS THIS FOLDER", not just the label. The halo was bound
      // to the label button alone, and the eye and the twisty are its SIBLINGS -- so reaching
      // for the control you actually wanted lost the answer you were using to aim with.
      b.onmouseenter = function () { hoverHighlight(g, null); };
      b.onmouseleave = function () { hoverHighlight(null, null); };
      b.onclick = function () {
        if (state.collapsed[g]) delete state.collapsed[g]; else state.collapsed[g] = true;
        buildLegend();
      };
    });
    // Deeper folder levels: a twisty, an eye and a highlight each, keyed by full path
    // so one handler serves every depth.
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
        cascade();
      };
    });
    each("[data-hpath]", function (b) {
      var hp = b.getAttribute("data-hpath");
      b.onmouseenter = function () { hoverHighlight(null, [hp]); };
      b.onmouseleave = function () { hoverHighlight(null, null); };
      b.onclick = function (ev) {
        var p = b.getAttribute("data-hpath");
        if (ev && ev.target && ev.target.getAttribute("data-only")) {
          onlyUnder(p.slice(0, p.indexOf("/")), p);
          buildLegend();
          cascade();
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

    // Eyes: visibility, which is what the whole row used to do.
    each("[data-eye]", function (b) {
      var g = b.getAttribute("data-eye");
      // Same as the twisty: hovering the eye haloes what the eye is about to hide.
      b.onmouseenter = function () { hoverHighlight(g, null); };
      b.onmouseleave = function () { hoverHighlight(null, null); };
      b.onclick = function () {
        var h = state.hidden[state.dim] || (state.hidden[state.dim] = Object.create(null));
        h[g] = !h[g];
        buildLegend();
        cascade();
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
        cascade();               // one note at a time, and the wedge opens for it
      };
    });

    // Subfolder label: highlight that subfolder. The tail row stands for several, so
    // it toggles them as a block -- all on if any were off, all off once they are all
    // on, which is the same "make it so" behaviour the tail's eye has.
    each("[data-hsub]", function (b) {
      // Hover lights every subfolder the row stands for -- which for the pooled tail row
      // is several. Resolved here rather than in hoverHighlight, because the row carries
      // tint-slot INDICES and only subOrder can turn those back into names.
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
        if (ev && ev.target && ev.target.getAttribute("data-only")) {
          onlySubs(f, idx.map(function (i) { return subs[+i]; }));
          buildLegend();
          cascade();
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

    // The label: HIGHLIGHT, not hide. Only a radius changes, so this animates the
    // positions rather than running a reveal cascade -- nothing appears or leaves.
    each(".lg[data-g]", function (b) {
      var g = b.getAttribute("data-g");
      b.onmouseenter = function () { hoverHighlight(g, null); };
      b.onmouseleave = function () { hoverHighlight(null, null); };
      b.onclick = function (ev) {
        if (ev.target && ev.target.getAttribute("data-only")) {
          var h = state.hidden[state.dim] || (state.hidden[state.dim] = Object.create(null));
          (order[state.dim] || []).forEach(function (n) { h[n] = (n !== g); });
          buildLegend();
          cascade();
          return;
        }
        if (state.highlight[g]) delete state.highlight[g]; else state.highlight[g] = true;
        buildLegend();
        applyLayout(true);       // tween the push; the halo lands with the refresh
        renderer.refresh();
      };
    });
  }

  // THE DEFAULT VISIBILITY, in one place, for the same reason collapseAll exists: boot and
  // Refresh have to agree about what "default" means, and two copies of that answer drift.
  //
  // This is what changes Refresh's meaning slightly, and the change is deliberate: it used
  // to clear every filter to "everything visible", and now it returns to the CONFIGURED
  // default, which hides archives. Anything else would make Refresh the one control that
  // disagrees with the settings.
  function seedHidden() {
    var h = state.hidden[state.dim] = Object.create(null);
    (order[state.dim] || []).forEach(function (g) {
      if (hiddenByDefault(g)) h[g] = true;
    });
  }

  // Collapse every group. Used for the initial state and by resetView, so "collapsed by
  // default" has one definition rather than two that can drift apart.
  function collapseAll() {
    state.collapsed = Object.create(null);
    (order[state.dim] || []).forEach(function (g) { state.collapsed[g] = true; });
  }
  var collapsedInit = false;

  function regroup() {
    counts = computeOrder();
    buildColors();
    // Once, at boot. Not on every regroup: __vg.relayout() calls this too, and
    // re-collapsing there would throw away whatever the user had opened -- which is
    // exactly why seedHidden belongs in here with it rather than beside it. Seeding the
    // hidden set on every regroup would put the archives back every time the layout was
    // rebuilt, silently undoing an eye the user had just clicked.
    if (!collapsedInit) { collapsedInit = true; collapseAll(); seedHidden(); }
    // Fix the ring each group belongs to, from the whole data set, before
    // anything is filtered.
    if (!bandLock) {
      var base = buildWedgePlan(false);
      if (base) {
        bandLock = Object.create(null);
        base.cells.forEach(function (c) { bandLock[c.g] = c.inner; });
        // maxR is kept as well as the two band radii: the edge curvature needs to
        // know how big the disc is to judge which chords pass near its centre.
        // Each band's OUTER EDGE, in graph units, which is what the seam is sized against.
        // Taken from the full-vault plan's own slots -- the radius a note actually sits at,
        // rather than the lattice figure maxR holds, because a seam is a width between dots.
        // PER BAND as well as in total, because the spacing is solved per band now: each ring
        // asks how much of ITS OWN notes are showing, so hiding a folder moves the ring that
        // folder is in and leaves the other one alone.
        var bandTotal = { i: 0, o: 0 };
        base.cells.forEach(function (c) { bandTotal[c.inner ? "i" : "o"] += c.wsum; });
        var bandR = { i: 0, o: 0 }, bandRows = { i: 0, o: 0 };
        base.cells.forEach(function (c) {
          var k = c.inner ? "i" : "o";
          // How deep the band is: the deepest cell in it, which is what sets its outer edge
          // and is the number the seam falls off against.
          if (c.rows > bandRows[k]) bandRows[k] = c.rows;
          // sl.r is in LATTICE units and UNIT converts to the graph coordinates the seam
          // width is expressed in -- a note at graph radius 3879 has slotR 24. Skipping
          // this made the seam 160x too wide, and because a wider seam eats avail, forces
          // narrower wedges and so more rows, the disc GREW to absorb it: 3879 -> 4840 on
          // the 1402-note vault and 9885 -> 12444 on the 10k one.
          (c.slots || []).forEach(function (sl) {
            var rr = sl.r * UNIT;
            if (rr > bandR[k]) bandR[k] = rr;
          });
        });
        // total is the DENOMINATOR of the density solve: every later plan asks "how much of
        // the vault is on screen" and this is the "of the vault" half. Captured from the same
        // unfiltered plan as the radii, so the two cannot disagree.
        geomLock = { r0: base.r0, rOuter: base.rOuter, maxR: base.maxR,
                     total: base.total, bandTotal: bandTotal,
                     bandR: bandR, rows: bandRows };

        // AND THEN AGAIN, now that bandR exists. This plan was built before it did, so its
        // gaps came from the pre-lock fallback rule rather than from the seam -- a different
        // reservation, so a different maxR. Every later plan uses the seam, which left the
        // full-vault disc measuring 96% of its own locked reference: fit() then zoomed to
        // 1.0372 where the whole page assumes 1.08, and two camera checks failed on a number
        // that was right about the disc and wrong about the constant.
        //
        // One extra plan build at load, once, and only the radii are taken from it -- bandLock
        // stays with the first, because which ring a group belongs to must not depend on a gap.
        var again = buildWedgePlan(false);
        if (again) geomLock = { r0: again.r0, rOuter: again.rOuter, maxR: again.maxR,
                                total: again.total, bandTotal: bandTotal,
                                bandR: bandR, rows: bandRows };

        // PIN THE NORMALISATION BOX. Sigma rescales node coordinates against the
        // graph's bounding box on every refresh (autoRescale, on by default), so
        // as the disc shrinks the box shrinks and the whole thing is re-normalised
        // -- measured, hiding one folder moved the graph origin 13px on screen and
        // zoomed everything 8.2%, with the camera provably untouched at
        // x=0.5 y=0.5 ratio=1.08. That is the ring centre appearing to jump, and
        // during a cascade it happens every single frame.
        //
        // Fixing the box to the full-vault extent means the disc genuinely shrinks
        // on screen when filtered, instead of the camera silently zooming to
        // refill the viewport. The box is symmetric about the origin, so the
        // camera's (0.5, 0.5) is still the centre of the disc and fit() is
        // unaffected.
        if (renderer) {
          var span = base.maxR * UNIT * 1.02;
          renderer.setCustomBBox({ x: [-span, span], y: [-span, span] });
        }
      }
    }
    buildLegend();
    syncAlpha();
    applyLayout(false);
    // The band paints with nodeColor(), which buildColors() just re-derived. That is
    // invisible to heatDraw's signature -- it tracks counts, not hues -- so the
    // cached paint is dropped explicitly rather than waiting for a count to move.
    if (heat) { heatSig = ""; heatDraw(); }
  }


  function buildSearch() {
    var q = $("q");
    q.oninput = function () {
      state.query = q.value.trim().toLowerCase();
      var hits = $("hits");
      if (!state.query) { hits.replaceChildren(); renderer.refresh(); return; }
      var found = [];
      graph.forEachNode(function (id, a) {
        if (a.label.toLowerCase().indexOf(state.query) > -1) found.push(id);
      });
      found.sort(function (p, o) { return graph.getNodeAttribute(o, "deg") - graph.getNodeAttribute(p, "deg"); });
      setHTML(hits, found.slice(0, 40).map(function (id) {
        return '<button data-hit="' + id + '">' + esc(graph.getNodeAttribute(id, "label")) +
               ' <span style="color:var(--text-3)">' + graph.getNodeAttribute(id, "deg") + '</span></button>';
      }).join("") || '<div style="color:var(--text-3);font-size:11px;padding:4px">No match</div>');
      Array.prototype.forEach.call(hits.querySelectorAll("[data-hit]"), function (b) {
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
      var first = $("hits").querySelector("[data-hit]");
      if (first) first.click();
    };
  }

  var play = null;                       // in-flight timeline playback
  function stopPlay() {
    if (!play) return;
    WIN.cancelAnimationFrame(play.raf);
    if (play.guard) WIN.clearTimeout(play.guard);   // or the deadline lands after a manual stop
    play = null;
    $("tlplay").textContent = "Play";
  }

  // `full` forces a re-indexing refresh. Pass it on any frame that LANDS -- the end
  // of playback, or a jump to "all" -- and leave it off while scrubbing.
  //
  // It matters because curved edges take their curvature from node POSITIONS, and
  // the disc moves every frame of the timeline. skipIndexation does not re-upload
  // edge data, so the GPU keeps whatever curvature was computed when the edge
  // buffers were last built -- and if that was the `until = 0` frame, where
  // ringsLayout() returns null and positions are degenerate, every value collapses
  // to CURVE_MIN and the finished disc draws with visibly straight links. The edge
  // reducer still reports type "curve" the whole time, which is what makes this
  // invisible to measurement: the data is right and the buffer is stale.
  function timelineFrame(full) {
    // The timeline ALWAYS grows a ring: the disc keeps its full circle and simply
    // gets denser as notes arrive. This line is why -- `fullRing` was written in
    // exactly one place, inside cascade(), and read in another, inside the packer,
    // so this path silently inherited whatever mode the last cascade had left
    // behind. After a fresh load that is false (first paint has an empty screen,
    // so it draws the pie clockwise in wedges); after any legend toggle it is
    // true. Same Play button, two different animations, and which one you got
    // depended on whether you had touched a filter first.
    //
    // Detecting the mode from what is present() is not merely unset here, it is
    // actively wrong: draw mode exists for a screen with no ring to trade
    // against, and the timeline empties the screen itself on its first frame
    // (until = 0). It would therefore choose draw mode every single time it was
    // asked honestly. The timeline is a density animation by construction, so the
    // mode is a constant, not an observation.
    fullRing = true;
    syncAlpha();
    var targets = ringsLayout();
    if (targets) assignPositions(targets);
    renderer.refresh({ skipIndexation: !full });
    var el = $("tlv");
    if (state.until === null || state.until >= tlMax) { el.textContent = "All"; return; }
    var i = Math.round(state.until) - 1;
    var d = tlDate[i < 0 ? 0 : i > tlDate.length - 1 ? tlDate.length - 1 : i] || "";
    el.textContent = d + "  \u00b7  " + Math.round(state.until);
  }

  // The vault growing from its first note to now. Extracted from the Play button
  // so the intro and Refresh run the same animation rather than three subtly
  // different ones.
  function playTimeline() {
    var tl = $("tl");
    stopPlay();
    // Anything else that drives positions has to be cancelled first, or it fights
    // the playback frame for frame. A load cascade still in flight was the other
    // half of the "wrong animation" report: press Play before the intro finished
    // and two loops wrote node coordinates on the same frames.
    if (cascadeRun) {
      WIN.cancelAnimationFrame(cascadeRun.raf);
      WIN.clearTimeout(cascadeRun.guard);
      cascadeRun = null;
      gapPres = null;    // belongs to the run just abandoned; see allocateBand
    }
    if (anim) { WIN.cancelAnimationFrame(anim); anim = null; }
    if (animGuard) { WIN.clearTimeout(animGuard); animGuard = null; }
    pinnedPlan = null; planKeep = null; gapPres = null;

    // Fixed length: TIMELINE_MS whatever the frame rate, so load, Refresh and Play
    // are the same few seconds every time. A slow page shows fewer steps of the
    // vault's growth rather than taking twice as long to get there.
    var dur = TIMELINE_MS * TIME_SCALE;
    state.until = 0;
    tl.value = "0";
    timelineFrame();
    $("tlplay").textContent = "Stop";

    // Landing frame: re-index, so the edge buffers are rebuilt against the final
    // positions instead of keeping the curvature from the first frame.
    var land = function () {
      stopPlay();
      state.until = null;
      tl.value = String(tlMax);
      timelineFrame(true);
    };
    // WATCHDOG on stalled frames, not a deadline -- same reason as the tween's. A
    // `WIN.setTimeout(land, dur + margin)` would land the timeline early on any page too
    // slow to finish in time, snapping the vault to fully grown mid-playback. This
    // only fires once no frame has arrived for a while, which still covers a
    // backgrounded tab where rAF stops entirely.
    var lastFrame = NOW();
    var PLAY_STALL = 500;
    var playDog = function () {
      if (play && NOW() - lastFrame < PLAY_STALL) { play.guard = WIN.setTimeout(playDog, PLAY_STALL); return; }
      land();
    };
    var MIN_FRAMES = 20;
    var p = 0, tPrev = NOW();
    play = { raf: 0, guard: WIN.setTimeout(playDog, PLAY_STALL) };
    (function step() {
      if (!play) return;
      var tn = NOW();
      lastFrame = tn;
      var adv = (tn - tPrev) / dur;
      tPrev = tn;
      if (adv > 1 / MIN_FRAMES) adv = 1 / MIN_FRAMES;
      p = Math.min(1, p + adv);
      var k = tlMax * p;
      state.until = p >= 1 ? null : k;
      tl.value = String(Math.round(Math.min(tlMax, k)));
      timelineFrame();
      if (p < 1) play.raf = WIN.requestAnimationFrame(step);
      else land();
    })();
  }

  function buildTimelineUI() {
    var tl = $("tl");
    tl.max = String(tlMax);
    tl.value = String(tlMax);
    tl.oninput = function () {
      stopPlay();
      var n = +this.value;
      state.until = n >= tlMax ? null : n;
      timelineFrame();              // dragging: stay cheap, skip indexation
    };
    // Releasing the slider is a landing frame, so the curves get rebuilt against
    // wherever the scrub left the disc.
    tl.onchange = function () { timelineFrame(true); };
    $("tlall").onclick = function () {
      stopPlay();
      state.until = null;
      tl.value = String(tlMax);
      timelineFrame(true);          // a landing frame too
    };
    $("tlplay").onclick = function () {
      if (play) { stopPlay(); return; }
      playTimeline();
    };
    $("today").onclick = function () {
      state.markToday = !state.markToday;
      this.setAttribute("aria-pressed", state.markToday ? "true" : "false");
      // Same treatment as a highlighted group: pushed out and haloed, not just
      // recoloured. A colour swap alone was easy to miss among ten group hues --
      // and on this vault it is often a handful of notes scattered across the
      // whole disc, which is exactly the case a position change solves.
      applyLayout(true);
      renderer.refresh();
    };
  }

  // Every filter back to its default, in state AND in the controls that show it.
  // Both halves matter: leaving a control showing one value while the state holds
  // another is worse than not resetting at all, because the next interaction jumps
  // from a value the user can see to one they cannot.
  function resetView() {
    stopPlay();
    seedHidden();
    state.hiddenSub = Object.create(null);
    state.highlight = Object.create(null);
    state.highlightSub = Object.create(null);
    collapseAll();                // back to the DEFAULT, which is folded, not unfolded
    state.tailOpen = Object.create(null);
    state.pathOpen = Object.create(null);
    state.markToday = false;
    state.markDay = null;
    state.hoverDay = null;
    state.until = null;
    state.query = "";
    state.hovered = null;
    select(null);                 // closes the detail card and clears state.selected
    hideTip();
    $("q").value = "";    $("hits").replaceChildren();
    $("tl").value = String(tlMax); $("tlv").textContent = "All";
    $("today").setAttribute("aria-pressed", "false");
    buildLegend();
  }

  function buildTools() {
    $("allon").onclick = function () {
      state.hidden[state.dim] = Object.create(null);
      state.hiddenSub = Object.create(null);
      buildLegend(); cascade();
    };
    $("alloff").onclick = function () {
      var h = state.hidden[state.dim] = Object.create(null);
      (order[state.dim] || []).forEach(function (g) { h[g] = true; });
      buildLegend(); cascade();            // recedes rim-inward; nothing to lay out
    };
    // Refresh clears every filter and replays the intro, in-page -- no navigation.
    //
    // It used to navigate to its own URL with a cache-busting "?t=" query, on the
    // theory that it was re-reading the file from disk. That was never worth what
    // it cost: the data is BAKED IN at build time, so a reload can only ever
    // redisplay the same bytes unless refresh-graph.ps1 has rewritten the file in
    // the meantime -- and picking up new notes is that script's job anyway, since
    // it rebuilds and opens in one step. Meanwhile the navigation itself is
    // unreliable on the one protocol this page actually runs on: a query string
    // on a file:// URL is not honoured consistently, so the click could do
    // nothing at all, which is exactly how it was reported.
    //
    // Resetting state directly always works, costs no reload, and -- the point --
    // always plays the animation.
    //
    // THE PLUGIN CAN DO BETTER, AND NOW DOES. Everything above is about a file whose
    // data was baked in at build time -- true of the standalone page and only of the
    // standalone page. Mounted in Obsidian the vault is right there, and the view can
    // rebuild from the metadata cache in a few hundred milliseconds, so the host passes
    // `onRefresh` and the button means what everybody assumed it meant: pick up what I
    // have written since. Reported as "Refresh doesn't seem to pick up new files"
    // (github#6), which was a fair reading of a button labelled Refresh.
    var onRefresh = typeof deps.onRefresh === "function" ? deps.onRefresh : null;
    if (onRefresh) {
      $("refresh").title = "Rebuild from the vault and replay. Picks up notes written " +
                           "since the graph was drawn, and clears every filter.";
    }
    $("refresh").onclick = function () {
      // The host tears this mount down and builds a new one, so there is nothing to
      // reset here and no animation to start -- the fresh mount plays its own intro.
      if (onRefresh) { onRefresh(); return; }
      resetView();
      fit();
      playTimeline();
    };
    // THE CAMERA CLUSTER (github#4). The Fit button in View is gone: it did exactly what
    // the corner control does, and two buttons for one job is one too many to explain.
    if ($("reset")) $("reset").onclick = fit;
    if ($("zin")) $("zin").onclick = function () { zoomBy(1); };
    if ($("zout")) $("zout").onclick = function () { zoomBy(-1); };
    if ($("pan")) $("pan").onclick = function () { setPan(!panEnabled, true); };
    // The saved default, applied once the renderer exists. Not persisted -- writing here
    // would save a value the host just handed us.
    setPan(panEnabled, false);
    $("png").onclick = savePng;
    // COPIES THE DUMP, and falls back to the console when the clipboard refuses -- which it
    // does on a page opened from a file in some builds. Either way the text exists somewhere
    // it can be pasted from, which is the whole job.
    if ($("dbg")) $("dbg").onclick = function () {
      var txt = JSON.stringify(API.debugDump(), null, 2);
      var done = function (how) {
        var b = $("dbg");
        b.textContent = how;
        WIN.setTimeout(function () { b.textContent = "Debug"; }, 1600);
      };
      try {
        WIN.navigator.clipboard.writeText(txt).then(function () { done("Copied"); },
                                                    function () { console.log(txt); done("In console"); });
      } catch (e) {
        console.log(txt);
        done("In console");
      }
    };

    // THE GEAR, if a host asked for it in either of the two ways. It is hidden by default
    // because a page that cannot store a setting should not offer to change one.
    if (openHostSettings) {
      // HOSTED: the gear is a shortcut to the host's own settings, so it opens nothing
      // here. `aria-expanded` is removed rather than left at "false" -- it would be
      // claiming to control a panel this button no longer has.
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
        if (open) buildSettings();
      };
      $("fcreset").onclick = function () { pickColor(null, null); };
      // DELEGATED on the container, which survives -- buildSettings replaces its
      // children on every pick, so a listener bound to a swatch would be bound to an
      // element that is about to be thrown away.
      $("setbody").addEventListener("click", function (ev) {
        var t = ev.target instanceof Element ? ev.target : null;
        if (!t) return;
        var v = t.closest("[data-vis]");
        if (v) { pickVisible(v.getAttribute("data-vis")); return; }
        var b = t.closest("[data-fc]");
        if (b) pickColor(b.getAttribute("data-fc"), b.getAttribute("data-key") || null);
      });
    }

    // One folder's slot, or -- with both arguments null -- every override dropped.
    // Nothing else in the map is touched: two folders may hold the same slot, and that
    // is a way of saying they belong together rather than a collision to resolve.
    function pickColor(folder, key) {
      var next = Object.create(null);
      if (folder) {
        Object.keys(folderColors).forEach(function (g) { next[g] = folderColors[g]; });
        if (key) next[folder] = key; else delete next[folder];
      }
      var saved = applyFolderColors(next);
      if (saveFolderColors) saveFolderColors(Object.assign({}, saved));
      buildSettings();
    }

    // Flip one folder's DEFAULT visibility, and apply it now so the click does something
    // visible. Written as an explicit true/false rather than by deleting the key: the
    // point of the tri-state is that "shown, and I said so" survives a later change to
    // what `_` folders do by default.
    function pickVisible(folder) {
      var next = Object.create(null);
      Object.keys(folderShown).forEach(function (g) { next[g] = folderShown[g]; });
      next[folder] = hiddenByDefault(folder);      // was hidden -> show it, and back
      var saved = applyFolderShown(next);
      if (saveFolderShown) saveFolderShown(Object.assign({}, saved));
      // The live filter follows the default it just changed. Without this the setting
      // would only take effect on the next Refresh, which reads as the click not working.
      var h = state.hidden[state.dim] || (state.hidden[state.dim] = Object.create(null));
      if (hiddenByDefault(folder)) h[folder] = true; else delete h[folder];
      buildLegend();
      cascade();                                   // notes fade in or out; nothing jumps
      buildSettings();
    }

    // Rebuilt whole on every pick. The list is one row per top-level folder and the
    // vault has tens of those, not thousands, so there is nothing here worth the bugs
    // that come with patching rows in place.
    function buildSettings() {
      var pal = paletteInfo();
      var rows = (order[state.dim] || []).map(function (g) {
        var pinned = folderColors[g] || "";
        // THE SLOT THIS FOLDER IS ACTUALLY USING, read back from buildColors rather than
        // recomputed -- archives are skipped in the rotation, so `i % SLOT_COUNT` is no
        // longer the answer and an archive is on no slot at all.
        //
        // Marking only the pinned one meant that a folder on Auto, which is every folder
        // until somebody changes something, had no mark anywhere: the panel showed twelve
        // colours and would not say which of them the folder was. The two states are
        // marked differently because "this is the colour" and "this is the colour I chose"
        // are different facts, and the Auto button is otherwise the only thing saying so.
        var cur = pinned || groupSlot[g] || "";
        var sws = pal.map(function (p) {
          var on = cur === p.key;
          // The colour comes from `.vg-<key>` in page.css, not from an inline style: a
          // hex baked in here would not survive the theme flip that readTheme handles.
          return '<button class="swatch vg-' + p.key + '" role="radio"' +
                 ' data-fc="' + esc(g) + '" data-key="' + p.key + '"' +
                 ' aria-checked="' + on + '"' +
                 (on && !pinned ? ' data-auto="1"' : '') +
                 ' title="' + esc(p.name) + (on ? (pinned ? " (chosen)" : " (automatic)") : "") +
                 '" aria-label="' + esc(p.name) + '"></button>';
        }).join("");
        // AUTO SITS ON THE NAME LINE, not at the end of the swatches. As a thirteenth
        // item in that row it was the one thing that could not fit beside twelve
        // swatches in a 288px sidebar, so the row wrapped and left a single swatch and
        // a button stranded on a line of their own. Up here it costs no width at all --
        // the name was already short of the full line -- and the swatches below are a
        // fixed twelve-column grid that cannot wrap however narrow the sidebar gets.
        // The eye sits with the colour, because "which folders am I looking at" and "what
        // colour are they" are the two things this panel is for. It is a DEFAULT, not the
        // live filter: the legend's own eye is the live one, and this is what the disc
        // comes back to on Refresh.
        var shown = !hiddenByDefault(g);
        return '<div class="scr" role="radiogroup" aria-label="Colour for ' + esc(g) + '">' +
               '<div class="scrh">' +
               '<button class="eye vis" data-vis="' + esc(g) + '" aria-pressed="' + shown +
               '" title="' + (shown ? "Shown by default" : "Hidden by default") +
               '" aria-label="' + (shown ? "Hide" : "Show") + " " + esc(g) + '">' +
               eyeSvg(shown) + '</button>' +
               '<span class="nm" title="' + esc(g) + '">' + esc(g) + '</span>' +
               '<button class="auto" data-fc="' + esc(g) + '" data-key=""' +
               ' aria-pressed="' + (!pinned) + '"' +
               ' title="Back to the slot this folder gets automatically">Auto</button>' +
               '</div>' +
               '<span class="sws">' + sws + '</span></div>';
      }).join("");
      setHTML($("setbody"), rows);
    }
    // No theme toggle: the page is dark, always. `<html data-theme="dark">` is set in
    // the markup, which outranks both the bare :root tokens and the
    // prefers-color-scheme block, so a light OS still gets the dark disc. The wedge
    // hues were validated against the dark surface anyway -- see [[Vault Graph]] on
    // why the tint ladder steps away from the surface rather than toward it.
  }

  // ratio 1 frames the NODES exactly, which clips their labels at the edges;
  // pull back a little so the outermost labels stay on screen.
  // With the rim labels gone there is nothing outside the node extent, so the disc
  // can fill more of the canvas. A little margin still keeps the outermost notes
  // clear of the edge.
  // Fit is now purely a zoom reset: the centre never moves, so this only has to
  // put the ratio back.
  var FIT_RATIO = 1.08;      // the full disc, filling the stage

  /**
   * FIT THE DISC THAT IS THERE, not the one the vault started with.
   *
   * The normalisation box is pinned to the FULL-VAULT extent on purpose -- see the note on
   * setCustomBBox -- so that filtering makes the disc genuinely shrink instead of the camera
   * silently zooming to refill the viewport every frame of every cascade. That is right
   * during an animation and wrong the moment somebody asks to be centred: hide half the
   * vault and "fit" would frame the empty ring the notes used to occupy.
   *
   * So the ratio is scaled by how much of the locked extent the disc currently uses. At full
   * vault that is 1 and this is exactly the old constant; with the outer ring toggled away it
   * closes in on what is left. The box does the not-moving and the camera does the zooming,
   * which keeps the two jobs apart -- renormalising the box per frame is what moved the ring
   * centre 13px and zoomed 8.2% with the camera provably untouched.
   *
   * Measured on the live radius rather than the plan's: a plan is what the layout intends and
   * this question is about what is on screen, which after a cascade are the same thing and
   * during one are not.
   */
  function fitRatio() {
    var locked = geomLock && geomLock.maxR ? geomLock.maxR : 0;
    var live = lastMaxR;
    if (!locked || !live) return FIT_RATIO;
    // The upper clamp used to be 1, on the reasoning that the box is the full-vault size
    // so anything beyond it is empty margin. That stopped being true with the density
    // solve (github#13): a filtered disc spreads its lattice to keep its notes at an
    // honest density, and the outermost row lands a few percent PAST the locked extent
    // -- measured up to 1.079. That is disc, not margin, and clamping at 1 framed it
    // with its rim cut off. Allowed out to 1.35, which covers a full row of overshoot at
    // any density the cap permits, and no further: past that something else is wrong and
    // framing empty space would hide it.
    // Clamped low as well, or a single surviving note in the hub would fill the stage.
    var k = live / locked;
    if (k > 1.35) k = 1.35;
    if (k < 0.12) k = 0.12;
    return FIT_RATIO * k;
  }

  function fit() {
    var to = { x: 0.5, y: 0.5, ratio: fitRatio(), angle: 0 };
    // SIGMA DROPS x AND y WHILE PANNING IS OFF (Camera.validateState), so with the pan
    // toggle off this would apply the ratio and leave the disc wherever it was last
    // dragged -- centring that does not centre. Panning is turned back on for the flight
    // and taken away again in the callback, which sigma also fires if the animation is
    // cut short. Reported on github#4, which hit it from the other direction.
    if (!panEnabled) {
      renderer.setSetting("enableCameraPanning", true);
      renderer.getCamera().animate(to, { duration: 380 }, function () {
        renderer.setSetting("enableCameraPanning", false);
      });
      return;
    }
    renderer.getCamera().animate(to, { duration: 380 });
  }

  // The wheel's own step, so a button press and a notch agree. Sigma's zoomingRatio is the
  // setting the wheel reads; reading it back rather than repeating 1.2 means they cannot
  // drift apart.
  function zoomBy(dir) {
    var cam = renderer.getCamera();
    var step = renderer.getSetting("zoomingRatio") || 1.2;
    var r = cam.getState().ratio * (dir > 0 ? 1 / step : step);
    var lo = renderer.getSetting("minCameraRatio"), hi = renderer.getSetting("maxCameraRatio");
    if (typeof lo === "number" && r < lo) r = lo;
    if (typeof hi === "number" && r > hi) r = hi;
    cam.animate({ ratio: r }, { duration: renderer.getSetting("zoomDuration") || 120 });
  }

  // PAN IS A MODE, and the host owns its default. Turning it off flies home FIRST and
  // re-locks on landing, for the validateState reason in fit(): a camera left off-centre
  // with panning disabled cannot be recovered by anything that sets x or y, which includes
  // fit() itself.
  function setPan(on, persist) {
    panEnabled = !!on;
    var btn = $("pan");
    if (btn) btn.setAttribute("aria-pressed", panEnabled ? "true" : "false");
    if (renderer) {
      if (panEnabled) renderer.setSetting("enableCameraPanning", true);
      else fit();      // fit() re-locks in its own callback
    }
    if (persist && onPanEnabled) onPanEnabled(panEnabled);
    return panEnabled;
  }

  function savePng() {
    var canvases = renderer.getCanvases();
    var src = canvases.nodes;
    var out = DOC.createElement("canvas");
    out.width = src.width; out.height = src.height;
    var ctx = out.getContext("2d");
    ctx.fillStyle = css("--surface-1");
    ctx.fillRect(0, 0, out.width, out.height);
    // The logo is a DOM overlay rather than one of Sigma's canvases, and it is CSS
    // masked, so it cannot be drawImage'd. It is rebuilt here instead: paint the same
    // ring gradient into a scratch canvas, then punch it to the mask's alpha with
    // `destination-in`. Drawn underneath the graph layers, matching the on-screen
    // stacking.
    var lg = $("logo");
    if (lg && logoMaskImg && logoMaskImg.complete && !lg.hidden) {
      var w = parseFloat(lg.style.width) || 0;
      var dpr = src.width / ($("graph").clientWidth || src.width);
      if (w > 0) {
        var side = Math.round(w * dpr);
        // One masked layer. Same sweep as the CSS conic gradient (12 o'clock,
        // clockwise) drawn as filled wedges, because canvas has no conic gradient --
        // and a conic gradient is a fan of wedges anyway. Both paths take their
        // colours from ringColorsSmooth, so screen and export cannot drift.
        var layer = function (cols) {
          var lc = DOC.createElement("canvas");
          lc.width = side; lc.height = side;
          var lx = lc.getContext("2d");
          var cx = side / 2, step = 2 * Math.PI / RING_BUCKETS;
          for (var i = 0; i < RING_BUCKETS; i++) {
            if (!cols[i]) continue;
            lx.beginPath();
            lx.moveTo(cx, cx);
            // -90deg puts 0 at 12 o'clock; canvas arcs already run clockwise.
            lx.arc(cx, cx, side, i * step - Math.PI / 2, (i + 1) * step - Math.PI / 2);
            lx.closePath();
            lx.fillStyle = cols[i];
            lx.fill();
          }
          // Same mean-coloured core as the CSS gradient, over the wedges, so the
          // export does not reintroduce the centre singularity the screen hides.
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
          // The inner layer gets the same radial fade the CSS mask applies, as a
          // second destination-in pass.
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

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ------------------------------------------------------------- heatmap */

  // How many notes were ADDED on each day, as a calendar of squares above the disc,
  // each square coloured by the notes that landed in it.
  //
  // WHICH DATE. `created` (frontmatter, falling back to `date`), which is the same
  // field the timeline ranks by -- so the band and the slider tell one story instead
  // of two. The two alternatives were measured and both are wrong for "added":
  //
  //   birthtime  472 of 934 files "born" today. OneDrive re-creates files on sync,
  //              so NTFS creation time says when this MACHINE first saw the file.
  //   mtime      2026-08-19 shows 240 files, which was the folder renumbering. It
  //              answers "what did I touch", which is what `mark today` wants and
  //              is not what this asks.
  //   created    894 valid of 916, and its big day (2026-06-27, 180 notes) is the
  //              initial import -- i.e. the day those notes really were added.
  //
  // WEEKS START MONDAY, because the vault's own weeks do: weekly reviews are filed
  // by ISO week, and an ISO week starts Monday. This is not GitHub's grid.
  // A CEILING, not the answer: heatGeom picks the count that fills the band at a legible cell
  // and clamps to this. Three years, because past that the window stops being "recently" and
  // the ribbon below is the instrument for picking a year.
  // A ROLLING YEAR. It was raised to three so a wide band could be filled, and filling it is
  // not worth the trade: the window is what "notes added" is about, and a year is the span a
  // person reads a year-over-year grid as. A wide band therefore has room left over, which is
  // handled by CENTRING the grid rather than by inventing more history to put in it.
  var HEAT_WEEKS = 52;
  // 52 columns of the trailing year, WHEN THEY FIT. Measured on this vault that window
  // holds 420 of 454 dated notes; the other 30 carry CONTENT dates back to 2015 (books,
  // quotes) and are reported as a count rather than either stretching the axis over
  // eleven years of empty columns or being silently dropped -- the same call the
  // timeline makes for undated notes.
  //
  // When they do not fit, the window CROPS to the most recent weeks that do, rather
  // than the band scrolling. Scrolling was the first behaviour and it was wrong in the
  // worst possible way: the grid starts at scrollLeft 0, which is the OLDEST end, so a
  // narrow window opened on eleven empty months with every note off the right edge --
  // it read as a broken stylesheet, and was reported as one. Cropping keeps the recent
  // weeks, which is the half anyone is looking at, and it costs no chrome.
  var HEAT_WEEKS_MIN = 8;
  var HEAT_GAP = 2, HEAT_CELL_MIN = 7, HEAT_CELL_MAX = 13;
  var HEAT_GUTTER = 18;    // weekday initials
  var HEAT_MONTH_H = 12;   // month labels above the grid
  var HEAT_ARROW_W = 9;    // right margin, for the today arrow
  // NO AVERAGING, AND NO PARTIAL SQUARES. A day with any notes fills its whole cell,
  // and the cell is PIECED TOGETHER out of that day's notes: one block per note, in
  // that note's exact colour. Nothing on screen is a colour no note has. The count is
  // carried by how finely the square is divided -- one note is a solid block, 180 are
  // about a pixel each -- so a busy day reads as fine-grained and mixed and a quiet one
  // as a flat slab of a single folder's colour.
  //
  // Two earlier versions are worth knowing about, because both were measured to fail.
  //
  // AVERAGING the day's colours failed in both directions. Mixing many hues in OKLab
  // collapses toward grey, so the busiest day -- being also the most mixed -- came out
  // DULLER than a quiet single-colour day: 180 notes at OKLab L=0.713 against L=0.781
  // for a 13-note day. And with five quantile levels the count channel was flat at the
  // top (every day from 8 notes up shared the last bucket) and overlapping at the
  // bottom (1-note days reached L=0.47 while 2-note days started at 0.45).
  //
  // SIZING the square by the count worked -- measured strictly monotonic, 5.2px at one
  // note to the full 13px at 180 -- but a grid of squares that are mostly not touching
  // stops reading as a calendar, and it spends the cell's area on an axis the tooltip
  // already reports exactly. Full squares read as a surface. The cost is real and worth
  // stating: two days with the same folder mix and different counts now differ only in
  // granularity, which below about four notes is nearly invisible. The number is in the
  // tooltip; the band is for the shape of the year.
  var HEAT_EMPTY_A = 0.5;  // the unfilled lattice, so the calendar reads as a grid
  var DAY_MS = 86400000, WEEK_MS = 7 * DAY_MS;
  var MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var heat = null;         // grid geometry + per-day buckets, rebuilt on resize
  var heatSig = "";        // last painted state, so a resting page repaints nothing
  var heatRz = null;

  // UTC throughout. `created` is a bare calendar date with no zone, and doing the
  // week arithmetic in local time means an hour of DST can slide a note into the
  // neighbouring column twice a year.
  function heatParse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  }
  function heatKey(ms) {
    var d = new Date(ms), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
  }
  function heatMonday(ms) {
    return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS;
  }

  // Grid geometry and the day -> notes index. Rebuilt on resize (the cell size is a
  // function of the width available) and cheap enough that it need not be
  // incremental: one pass over the nodes.
  // ONE definition of the geometry, used by the build and by the reflow guard. Two
  // copies of this arithmetic is how the guard ends up disagreeing with the build and
  // the band quietly stops resizing.
  //
  // THE WINDOW IS AS MANY WEEKS AS THE BAND CAN SHOW at a legible cell -- not 52 of them with
  // the rest of the band left empty.
  //
  // It used to take 52 and grow the cell to fill, which cannot work: the cell is capped at
  // HEAT_CELL_MAX because the band is seven cells TALL and a 33px cell would be a 245px band
  // eating the disc. So the cap bound first and the leftover width simply stayed empty --
  // measured, 52 cols at 13px is 805px of a 1268px band, and on a 1900px window barely half of
  // it. Two instruments about the same axis, the strip below spanning the full width and the
  // grid above stopping in the middle.
  //
  // So the CELL is what is fixed and the COLUMNS are what flex: pick the count that lands the
  // cell near its cap and fills the width. A wide band shows more history at the same
  // legibility, which is the useful direction -- and the readout already says "last N weeks"
  // from this number, so it stays honest without a second change.
  //
  // Bounded by the vault's own span, because a window reaching past the first note is empty
  // columns pretending to be data.
  function heatGeom() {
    var wrap = $("heatwrap");
    var avail = ((wrap && wrap.clientWidth) || $("stage").clientWidth || 900) - HEAT_GUTTER;
    avail -= HEAT_ARROW_W;
    // At the target cell, then clamped: never below the minimum legible count, never past the
    // ceiling, never wider than the vault is old.
    var want = Math.floor((avail + HEAT_GAP) / (HEAT_CELL_MAX + HEAT_GAP));
    var span = dateSpan ? Math.ceil((dateSpan.hi - dateSpan.lo) / WEEK_MS) + 1 : HEAT_WEEKS;
    var cols = Math.max(HEAT_WEEKS_MIN, Math.min(HEAT_WEEKS, span, want));
    // Whatever the count came out as, spend the width on the cell rather than leaving a gap.
    var cell = Math.floor((avail - (cols - 1) * HEAT_GAP) / cols);
    return { cols: cols, cell: Math.max(HEAT_CELL_MIN, Math.min(HEAT_CELL_MAX, cell)) };
  }

  function heatBuild() {
    var wrap = $("heatwrap"), cv = $("heatc");
    if (!wrap || !cv) return;

    var g = heatGeom();
    var cols = g.cols, cell = g.cell;
    var pitch = cell + HEAT_GAP;
    // THE WINDOW'S RIGHT EDGE IS STATE NOW, not always today. A fixed sliding window onto
    // today is what made everything before it unreachable -- on the 10-year fixture that is
    // nine years of the vault with nothing to point at. `heatEnd` is null for "the last 52
    // weeks", which is still the default and still where it opens.
    var endMs = state.heatEnd === null ? heatParse(TODAY) : state.heatEnd;
    var start = heatMonday(endMs) - (cols - 1) * WEEK_MS;

    var days = Object.create(null), keys = [];
    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < 7; r++) {
        var ms = start + c * WEEK_MS + r * DAY_MS;
        var k = heatKey(ms);
        days[k] = { key: k, ms: ms, col: c, row: r, ids: [], parts: [], n: 0 };
        keys.push(k);
      }
    }

    // Every dated note, bucketed. Notes outside the window are counted, not binned:
    // the readout says how many, so a short axis never reads as a complete one.
    var before = 0, after = 0, undated = 0, all = Object.create(null);
    graph.forEachNode(function (id, a) {
      var k = a.created;
      if (!heatParse(k)) { undated++; return; }
      all[k] = (all[k] || 0) + 1;
      var d = days[k];
      if (d) d.ids.push(id);
      else if (heatParse(k) < start) before++;
      else after++;
    });

    // Quantile cuts from the FULL data set, exactly as the group colours are: a
    // filter must not re-scale the survivors, or hiding one folder repaints every
    // remaining day a different shade for no reason the reader can see.
    var counts = [];
    for (var kk in all) counts.push(all[kk]);
    counts.sort(function (x, y) { return x - y; });
    var q = function (p) {
      return counts.length
        ? counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] : 1;
    };
    var cuts = [q(0.2), q(0.4), q(0.6), q(0.8)];
    // The top of the size ramp. Taken from the WINDOW's days only: a day off the left
    // edge cannot grow a square that is on screen, so letting it set the scale would
    // do nothing but shrink every square the reader can actually see.
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

    // Sorted by HUE, so each square is its own little gradient -- a mini heatmap
    // inside the heatmap -- rather than confetti.
    //
    // Folder order was the first attempt and it is the wrong key: the group palette is
    // assigned in NAME order (01, 02, 03 ...) precisely so a folder keeps its colour as
    // the vault grows, and name order is not hue order. Measured on this palette,
    // consecutive folders run blue 264deg, orange 42deg, aqua 168deg -- so grouping by
    // folder puts the three most distant hues on the wheel side by side. Hue angle
    // groups the folders that ARE close (aqua next to green next to cyan) and reads as
    // one surface.
    //
    // Tie-broken by lightness, which is the axis the subfolder tints move along, so
    // siblings inside one hue family also come out in order instead of shuffled.
    //
    // Done here rather than per frame: it depends on nodeColor(), which regroup() has
    // already settled by the time heatBuild runs, and the palette is stable for the
    // life of the data. Re-deriving it 60 times a second buys nothing.
    var hkey = Object.create(null);
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

  // Which of the five legend steps a day falls in. Not used for drawing -- the ramp is
  // continuous -- but it is what heatReport counts, and the quantile cuts are still
  // the honest way to ask whether the band is using its range.
  function heatLevel(n) {
    var c = heat.cuts;
    for (var i = 0; i < c.length; i++) if (n <= c[i]) return i;
    return c.length;
  }

  // Tile a square with one block per note, exactly -- no gaps, no overlap, no colour
  // that is not a note's own.
  //
  // Vertical strips, each strip split into horizontal bands. Blocks come out roughly
  // square (strips = round(sqrt(n))) and the arithmetic tiles the square exactly at
  // any n, which a row-major grid does not: ceil(sqrt(n)) rows leaves the last one
  // part-empty, and a ragged corner reads as a different count.
  //
  // The notes arrive sorted by hue and are consumed in order, strip by strip and top
  // to bottom within a strip -- so the square sweeps the hue wheel from its top-left
  // to its bottom-right, and a day's folder mix reads as bands rather than as noise.
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

  // Weight is ALPHA, not membership -- the same source of truth the disc reads. So the
  // band fills in as the timeline plays and dims as a folder fades out, and it needs no
  // filter clause of its own. A note mid-fade contributes a translucent block, so it
  // arrives the way it arrives on the disc rather than popping in.
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
    var cv = $("heatc");
    if (!heat || !cv || !cv.getContext) return;
    heatCompute();

    // Repaint only when something changed. This runs from afterRender, so it fires
    // on every frame of every animation; at rest that would be 364 rectangles of
    // identical work per frame. Quantising to a quarter of a note keeps the guard
    // from flickering on floating-point noise while still catching a real fade.
    var sig = [];
    for (var i = 0; i < heat.keys.length; i++) {
      sig.push(Math.round(heat.days[heat.keys[i]].n * 4));
    }
    sig.push(state.markDay || "", state.hoverDay || "", state.markToday ? 1 : 0, heat.cell);
    sig = sig.join(",");
    if (sig === heatSig) return;
    heatSig = sig;

    var dpr = window.devicePixelRatio || 1;
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, heat.w, heat.h);

    var cell = heat.cell, pitch = heat.pitch;
    var R = Math.max(2, Math.round(cell * 0.22));

    // WHERE TODAY IS. Always the LAST column, by construction: `start` is
    // (cols - 1) weeks before this Monday, so the trailing column is always the
    // current week. That is exactly why the marker does not point at the column --
    // the column is a foregone conclusion and pointing at it says nothing. The row
    // is the part that moves, so the arrow lives in the right margin and points at
    // today's cell, which names the weekday as well as the day.
    var td = heat.days[TODAY];

    // Month labels, at the first column whose week opens a month. Skipped when one
    // would collide with the previous, which is what happens at the 7px cell floor.
    ctx.font = "9px ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = THEME.text;
    ctx.globalAlpha = 0.45;
    var lastEnd = -99;
    for (var c = 0; c < heat.cols; c++) {
      var first = new Date(heat.start + c * WEEK_MS);
      if (first.getUTCDate() > 7) continue;      // this week does not open a month
      var x = HEAT_GUTTER + c * pitch;
      if (x < lastEnd + 4) continue;
      var lab2 = MONTH_ABBR[first.getUTCMonth()];
      ctx.fillText(lab2, x, HEAT_MONTH_H - 3);
      lastEnd = x + ctx.measureText(lab2).width;
    }
    ctx.globalAlpha = 1;

    // TODAY: an arrow in the right margin, on today's row, pointing back at its cell.
    // Drawn unconditionally -- NOT as one more ring. Every ring on this band is
    // --today and they differ only in weight, so today's own ring is structurally the
    // one that loses: it is the weakest of three, and it disappears entirely the
    // moment the same cell is hovered or picked, because the three are one if/else
    // chain. A mark outside that competition is what makes "where is today"
    // answerable at a glance whatever else is selected.
    if (td) {
      var ax = HEAT_GUTTER + heat.cols * pitch - HEAT_GAP;   // right edge of the grid
      var ay = HEAT_MONTH_H + td.row * pitch + cell / 2;
      ctx.fillStyle = THEME.today;
      ctx.beginPath();
      ctx.moveTo(ax + 2.5, ay);
      ctx.lineTo(ax + HEAT_ARROW_W - 1, ay - 3.5);
      ctx.lineTo(ax + HEAT_ARROW_W - 1, ay + 3.5);
      ctx.closePath();
      ctx.fill();
    }

    // Weekday initials: Mon / Wed / Fri only. Seven labels at a 9px font on a 9px
    // pitch is a grey smear, and three is enough to orient the grid.
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

      // The empty slot first, always: it is what makes the band read as a CALENDAR
      // rather than as a scatter of squares, and it gives the eye the frame that the
      // filled square's size is judged against.
      ctx.globalAlpha = HEAT_EMPTY_A;
      ctx.fillStyle = THEME.dim;
      heatRect(ctx, x2, y2, cell, cell, R);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Then the day itself: the WHOLE cell, one block per note, each block that
      // note's exact colour. Clipped to the same rounded rect as the empty slot, so a
      // one-note day and a 180-note day are the same shape and only their grain
      // differs. Blocks are plain rectangles; the corners come from the clip, which is
      // one path per cell instead of one per note.
      if (d.n > 0.004) {
        ctx.save();
        heatRect(ctx, x2, y2, cell, cell, R);
        ctx.clip();
        heatTile(ctx, x2, y2, cell, d.parts);
        ctx.restore();
      }

      // Rings, all in --today: the neutral extreme of the palette, deliberately not
      // a group hue, so a ring can never be misread as a folder. Three weights --
      // picked, hovered, and today -- in that priority, because a cell can be all
      // three at once and only one ring can be drawn.
      if (d.key === state.markDay || (state.markToday && d.key === TODAY)) {
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
        // Full strength, but 1px against a selection's 1.5px -- it was 0.4 alpha and
        // simply could not be seen. The caret above the column carries the finding;
        // this ring is what confirms which cell the caret is pointing at.
        ctx.strokeStyle = THEME.today;
        ctx.lineWidth = 1;
        heatRect(ctx, x2 - 1, y2 - 1, cell + 2, cell + 2, R + 1);
        ctx.stroke();
      }
    }

    heatDrawKey(cell, R);
  }

  // The legend is a GRANULARITY ramp, because grain is what the count is encoded in.
  // Sampled at the vault's OWN quantiles (1 / 2 / 3 / 7 / busiest) rather than at five
  // arbitrary steps, so each square is a count this vault actually has, and drawn
  // through the same heatTile as the cells so it cannot drift from them.
  //
  // Two NEUTRALS, alternating, deliberately: the legend is about how finely a square
  // is divided, and any hue here would read as a claim about which folder. They are the
  // palette's own greys, so they belong to the same family as everything else.
  function heatDrawKey(cell, R) {
    var cv = $("heatkey");
    if (!cv || !cv.getContext) return;
    // Deduped: the quantiles collapse on a vault whose days are mostly 1 note --
    // measured here they came out 1/1/2/5, and two identical swatches read as a
    // rendering fault rather than as a tie. Fewer steps is the honest answer; the
    // canvas width follows the count.
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
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, cell);
    var greys = [THEME.neutrals[0], THEME.neutrals[2]];
    for (var i = 0; i < anchors.length; i++) {
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

  // roundRect is not everywhere yet, and this page runs from file:// in whatever
  // browser is set as default, so the path is built by hand.
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

  // Which day is under the pointer, or null. Hit-tested arithmetically rather than
  // by walking the cells -- it is a lattice, so there is nothing to search.
  function heatHit(ev) {
    if (!heat) return null;
    var b = $("heatc").getBoundingClientRect();
    var x = ev.clientX - b.left - HEAT_GUTTER, y = ev.clientY - b.top - HEAT_MONTH_H;
    if (x < 0 || y < 0) return null;
    var c = Math.floor(x / heat.pitch), r = Math.floor(y / heat.pitch);
    if (c < 0 || c >= heat.cols || r < 0 || r > 6) return null;
    // Inside the cell, not merely inside its slot: the gap between two squares
    // should not report the one to its left.
    if (x - c * heat.pitch > heat.cell || y - r * heat.pitch > heat.cell) return null;
    return heat.days[heatKey(heat.start + c * WEEK_MS + r * DAY_MS)] || null;
  }

  var HEAT_WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function heatShowTip(d) {
    var t = $("htip"), n = Math.round(d.n);
    var by = Object.create(null);
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
        return '<b style="color:' + colorOf(g2) + '">■</b> ' + esc(g2) + " " + by[g2];
      }).join("<br>") : "") +
      (n ? "<br><i>click to mark them on the disc</i>" : "") +
      "</div>");
    t.hidden = false;
    var box = t.getBoundingClientRect();
    var host = $("heat").getBoundingClientRect(), cv = $("heatc").getBoundingClientRect();
    var cx = cv.left - host.left + HEAT_GUTTER + d.col * heat.pitch + heat.cell / 2;
    var cy = cv.top - host.top + HEAT_MONTH_H + d.row * heat.pitch;
    t.style.left = Math.max(4, Math.min(cx - box.width / 2, host.width - box.width - 4)) + "px";
    // Below the square when there is no room above it, which there is not for the
    // top rows of a band this short.
    var above = cy - box.height - 8;
    t.style.top = (above >= 2 ? above : cy + heat.cell + 8) + "px";
  }

  function buildHeatmapUI() {
    var cv = $("heatc");
    // Hovering a square haloes that day's notes on the disc. Refreshed only when the
    // day under the pointer actually CHANGES -- mousemove fires many times per cell,
    // and a renderer refresh per event would repaint the disc dozens of times while
    // crossing one square.
    var setHover = function (key) {
      if (state.hoverDay === key) return;
      state.hoverDay = key;
      heatSig = "";            // the hovered cell gets its own ring
      renderer.refresh();      // colour and halo only; nothing moves
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
    // Clicking a day marks its notes on the disc -- the same treatment as
    // `mark today`, and the whole reason the band sits above the rings rather than
    // in the sidebar: the question a heatmap raises is "what were those notes?"
    cv.addEventListener("click", function (ev) {
      var d = heatHit(ev);
      if (!d || d.n <= 0.004) return;
      state.markDay = (state.markDay === d.key) ? null : d.key;
      heatSig = "";
      // No applyLayout: a marked day only changes colour and halo, so no note's
      // target position moves. Running the tween anyway would animate every note
      // from where it is to where it already is.
      renderer.refresh();
    });
    // The cell size is a function of the width available, so the grid has to be
    // re-derived whenever that width moves. A window `resize` listener is NOT
    // enough, and this was measured: the band came up at the 7px cell floor in a
    // 1124px slot, because boot ran before the embedded pane had settled to its
    // final width and no window resize event ever followed. A ResizeObserver
    // answers the question actually being asked -- how wide is this box -- and
    // fires on its first observation as well, so the boot race is the same code
    // path as a later resize rather than a special case.
    //
    // No rebuild loop: heatBuild only writes the CANVAS size, which changes the
    // wrapper's scroll width and not its client width. Guarded on the derived cell
    // size anyway, so an observation that changes nothing costs nothing.
    var reflow = function () {
      if (heatRz) WIN.clearTimeout(heatRz);
      heatRz = WIN.setTimeout(function () {
        heatRz = null;
        var g = heatGeom();
        if (heat && g.cell === heat.cell && g.cols === heat.cols) return;
        heatBuild();
      }, 60);
    };
    if (window.ResizeObserver) new ResizeObserver(reflow).observe($("heatwrap"));
    else window.addEventListener("resize", reflow);
  }

  /* ---------------------------------------------------------------- demo */

  // A scripted walkthrough, for watching and for recording. `?demo` in the URL arms it.
  //
  // THE PAGE DOES NOT PERFORM THE INPUT. It publishes a storyboard and answers two
  // questions about itself -- where is that control, and are you still moving -- and a
  // driver outside the browser does the clicking through Chrome's DevTools protocol
  // (`Input.dispatchMouseEvent`). See `scripts/demo.mjs`.
  //
  // Why not just call el.click() from in here, which is far less machinery: because
  // that is not what a user does, and the difference is exactly the part worth
  // demonstrating. A dispatched click skips hit-testing entirely -- it fires on an
  // element that is covered by something else, or scrolled out of view, or 0x0 -- so an
  // in-page demo keeps passing after the button it aims at has become unclickable. CDP
  // input goes in at the top of the same pipeline a mouse does: it hit-tests, it raises
  // the hover states the page draws for real, and it fails when a real click would.
  //
  // An earlier cut drew its own SVG arrow and dispatched synthetic MouseEvents to move
  // it. Removed. Besides the hit-testing hole, the mark fought the physical mouse:
  // measured, it finished a run at (0, 847) instead of on the button it had just
  // clicked at (42, 650), because clicking the eye rebuilds the legend's DOM and Chrome
  // then re-dispatches a mousemove at the REAL cursor -- so a mouse parked anywhere
  // teleported the mark on every rebuild.

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

  /* THREE LANES, because the strip carries two independent things and a legend.
   *
   *   bars    the months, and the BRUSH -- the two ends of the date filter
   *   track   the band's own 52-week window, draggable on its own
   *   labels  the year ticks
   *
   * The window used to follow whichever brush end was being dragged, which is convenient
   * right up to the point where you want to look at one stretch while filtering to another.
   * They are separate instruments -- the brush says which notes count, the window says which
   * weeks the grid above is drawing -- so they get separate lanes and separate gestures.
   * Which lane the pointer is in decides what it grabs; nothing has to be moded.
   */
  var RIBBON_BARS = 26;      // the bars and the brush
  var RIBBON_TRACK = 14;     // the band-window track
  // The year labels used to be painted in a band at the bottom of this canvas. They are real
  // buttons under it now (#vg-years), so the canvas is shorter by exactly that band and the
  // strip is nothing but the strip.
  var RIBBON_H = RIBBON_BARS + RIBBON_TRACK;
  var GRAB_PX = 6;           // how close to an edge counts as grabbing it
  var DRAG_MIN = 3;          // px before a press counts as a drag rather than a click

  var brushDrag = null;

  function drawDateUI() { drawRibbon(); buildYears(); }

  /**
   * One button per year, under the strip, at that year's own position on it.
   *
   * Rebuilt rather than repositioned, because the set of years that FITS changes with the
   * width: at 11 years on a narrow band the labels collide, so alternate ones are dropped --
   * and a dropped year should not be a button nobody can see. Cheap enough to redo: a dozen
   * elements, and only when the band is laid out or the range changes.
   *
   * The pressed state is a real one: a range that spans exactly one calendar year marks that
   * year, so the strip says which one is selected rather than only offering to select.
   */
  function buildYears() {
    var host = $("years");
    if (!host) return;
    if (!dateSpan || !dateSpan.years.length) { host.textContent = ""; return; }
    var w = ribbonW();
    var span = dateSpan.hi - dateSpan.lo;
    // Room for a label is about 20px; below that, name every other year.
    var pitchY = span > 0 ? (w * (365.25 * 86400000)) / span : w;
    var every = pitchY < 20 ? 2 : 1;
    // WHICH YEAR IS SELECTED, read through the same clamping that setting it goes through.
    // An end AT the span's own end is stored as null -- "no bound" -- so the newest year, whose
    // December is past the last note, comes back as `to === null` and compared as itself: the
    // button for the year you just clicked read unpressed, on every vault whose span ends
    // mid-year. Resolving nulls to the span's ends first is all it needs.
    var cur = null;
    var cf = state.from === null ? dateSpan.lo : state.from;
    var ct = state.to === null ? dateSpan.hi : state.to;
    var ca = new Date(cf), cb = new Date(ct);
    if (ca.getUTCFullYear() === cb.getUTCFullYear() &&
        ca.getUTCMonth() === 0 && ca.getUTCDate() === 1 &&
        (cb.getUTCMonth() === 11 && cb.getUTCDate() === 31 ||
         ct >= dateSpan.hi)) cur = ca.getUTCFullYear();
    var html = "";
    dateSpan.years.forEach(function (yy) {
      if ((yy.y % every) !== 0) return;
      var at = Math.max(0, Math.min(w, ribbonX(Date.UTC(yy.y, 0, 1), w)));
      html += '<button type="button" data-yr="' + yy.y + '"' +
              ' style="left:' + Math.round(at) + 'px"' +
              ' aria-pressed="' + (cur === yy.y) + '"' +
              ' title="' + yy.y + ' -- ' + yy.n + ' note' + (yy.n === 1 ? "" : "s") + '">' +
              "'" + String(yy.y).slice(2) + "</button>";
    });
    host.innerHTML = html;
  }

  // A canvas sized for the device, drawn in CSS pixels. Same treatment the heat band gets;
  // without it every one-pixel rule in here lands on a half pixel and greys out.
  function fitCanvas(cv, w, h) {
    var dpr = Math.min(2, WIN.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + "px"; cv.style.height = h + "px";
    var cx = cv.getContext("2d");
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, w, h);
    return cx;
  }

  /**
   * The bar ramp: the surface at nothing, the accent at the busiest month.
   *
   * It read `heat.mean` first, falling back to the accent -- and `heat.mean` is set to null
   * where the heat object is built and never assigned anywhere, so the fallback has always
   * been the whole function. Written as what it does. The accent is a validated colour and
   * "the mean of the group palette" was a guess, so this is the better of the two anyway.
   */
  function dateRamp(t) {
    return t <= 0 ? css("--dim")
                  : mixHex(css("--surface-2"), css("--accent"), 0.25 + 0.75 * Math.min(1, t));
  }

  /**
   * The scrubbers' colour: the bars' own hue, pushed for contrast against them.
   *
   * "Same colour as the bars" was already true and that was the problem -- the handles were
   * drawn at the accent and a busy month's bar IS the accent, so a handle standing on a tall
   * bar disappeared into it. Same hue, moved along the light/dark axis instead: toward
   * --text-1, which is near-black on the light theme and white on the dark one, so the shift
   * is away from the bars in both rather than toward white in one and invisible in the other.
   */
  function scrubColor() { return mixHex(css("--accent"), css("--text-1"), 0.3); }

  // withAlpha takes an rgba string and mixHex takes two hexes; neither does this one thing.
  function rgbaHex(hex, a) {
    var c = toRgb(hex);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  function ribbonW() {
    var cv = $("ribbon");
    var r = cv && cv.getBoundingClientRect();
    return r && r.width ? r.width : 600;
  }
  function ribbonX(ms, w) {
    var span = dateSpan.hi - dateSpan.lo;
    return span > 0 ? ((ms - dateSpan.lo) / span) * w : 0;
  }
  function ribbonMs(x, w) {
    return dateSpan.lo + (Math.max(0, Math.min(w, x)) / w) * (dateSpan.hi - dateSpan.lo);
  }

  /**
   * The brush's two ends, with null meaning "the end of the span".
   *
   * Reads the in-flight drag first, so the handles follow the cursor while the disc behind
   * them stays put. This is the one place the preview and the applied state are allowed to
   * disagree, and it is what makes a drag cost a canvas repaint instead of a relayout.
   */
  function brushEnds() {
    if (brushDrag && brushDrag.pFrom !== undefined) return [brushDrag.pFrom, brushDrag.pTo];
    return [state.from === null ? dateSpan.lo : state.from,
            state.to === null ? dateSpan.hi : state.to];
  }

  /**
   * Where the band's window is.
   *
   * Reads state directly -- the window drag is LIVE and writes state on every frame, unlike
   * the brush, which previews. The two are not inconsistent: dragging the brush re-lays out
   * the whole disc, which is O(n) three times over and cannot keep up at ten thousand notes,
   * while dragging the window only re-buckets the band. Those are different budgets, so they
   * get different answers, and the one that can afford to be live is live.
   */
  function winEndNow() {
    if (state.heatEnd !== null) return state.heatEnd;
    return heat ? heat.start + heat.cols * WEEK_MS : heatParse(TODAY);
  }

  function drawRibbon() {
    var cv = $("ribbon");
    if (!cv || !dateSpan) return;
    var w = Math.max(200, ribbonW());
    var cx = fitCanvas(cv, w, RIBBON_H);
    var top = RIBBON_BARS;                     // the bars live above this line
    var ms = dateSpan.months, n = ms.length;
    var pitch = w / n;

    for (var i = 0; i < n; i++) {
      var m = ms[i];
      var t = Math.min(1, m.n / dateSpan.nRef);
      var bh = m.n ? Math.max(1.5, (top - 2) * t) : 0;
      cx.fillStyle = m.n ? dateRamp(t) : css("--dim");
      cx.fillRect(i * pitch, top - bh, Math.max(1, pitch - 0.6), bh || 1);
    }

    // Year boundaries. Only January gets a rule, so the strip reads as years rather than as
    // 121 months. The years themselves are named by the buttons below -- see buildYears.
    for (var j = 0; j < n; j++) {
      if (ms[j].m !== 0) continue;
      cx.fillStyle = rgbaHex(css("--text-3"), 0.28);
      cx.fillRect(j * pitch, 0, 1, top);
    }

    // THE BAND'S WINDOW, on its own track and draggable. A rail the full width of the span
    // with a pill on it showing the 52 weeks the grid above is drawing -- which is also a
    // scrollbar, and reads as one, which is the point: it is the thing you move to look
    // somewhere else.
    var tw = winTrack(w);
    cx.fillStyle = rgbaHex(css("--text-3"), 0.16);
    heatRect(cx, 0, tw.y + tw.h / 2 - 1, w, 2, 1);
    cx.fill();
    // The pill in the bars' own hue, so the whole strip reads as one instrument, with a rim
    // in the band's background so its ends are legible against the rail behind them.
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

    // The brush: a wash over everything OUTSIDE it, two hard edges, and a grip on each.
    // 0.72 of the surface rather than 0.62 -- at the lower value the difference between
    // inside and outside was a few percent of luminance on a dark ground and the brush read
    // as two lines with nothing between them.
    //
    // DRAWN UNCONDITIONALLY, with the handles resting on the ends of the span when nothing
    // is filtered. They used to appear only once a range existed, which meant the control
    // opened as a bar chart with no visible way to operate it -- you had to guess that
    // dragging it did something. The wash needs no condition either: at rest the handles are
    // at the ends, so there is nothing outside them and both rectangles are zero-width.
    //
    // `from`/`to` stay NULL at rest rather than being set to the span's ends. Null means "no
    // bound", which is what lets timeFactor skip the comparison entirely and what keeps a
    // note dated outside the known span -- a bad stamp, a note edited later -- from being
    // excluded by a filter nobody asked for.
    var e = brushEnds(), x0 = ribbonX(e[0], w), x1 = ribbonX(e[1], w);
    cx.fillStyle = rgbaHex(css("--surface-0"), 0.72);
    cx.fillRect(0, 0, x0, top);
    cx.fillRect(x1, 0, w - x1, top);

    // The two scrubbers. Each is a full-height rule plus a grip, and each is outlined in the
    // band's own background -- which is what makes it legible standing on a bar of any height,
    // and the reason a plain accent-coloured handle was invisible on a busy month.
    var col = scrubColor(), rim = rgbaHex(css("--surface-0"), 0.92);
    var gw = 9, gh = Math.max(12, top - 8), gy = (top - gh) / 2;
    [x0, x1].forEach(function (x) {
      // The RULE sits exactly on the date; the GRIP is nudged to stay inside the canvas. At
      // rest the two handles are at the ends of the span, so a grip centred on the date has
      // half of itself outside the element -- which is the one moment it most needs to be
      // seen, since that is the state the control opens in.
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
      // Two notches, so the grip reads as something to take hold of rather than as a tab.
      cx.fillStyle = rim;
      cx.fillRect(gx + gw / 2 - 2, gy + gh / 2 - 3, 1, 6);
      cx.fillRect(gx + gw / 2 + 1, gy + gh / 2 - 3, 1, 6);
    });
  }

  /**
   * Repaint the band for the current window, doing as little as the change allows.
   *
   * THE GRID IS COLUMNED BY WEEK. heatMonday() quantises the window's end, so a drag across a
   * few pixels inside one week produces a byte-identical grid -- and heatBuild() re-buckets
   * every note in the vault to produce it, ten thousand of them on the fixture. So the week is
   * computed first and the rebuild is skipped when it has not moved.
   *
   * The ribbon is redrawn either way, which is what makes the pill glide while the grid steps.
   * That difference is not a compromise, it is the truth about the two things: the pill is a
   * continuous position and the band is a row of weeks.
   */
  function rebuildBand() {
    var endMs = state.heatEnd === null ? heatParse(TODAY) : state.heatEnd;
    var wantStart = heatMonday(endMs) - ((heat ? heat.cols : HEAT_WEEKS) - 1) * WEEK_MS;
    var moved = !heat || heat.start !== wantStart;
    if (moved) heatBuild();
    drawDateUI();
    if (moved) heatDraw();
  }

  /** The window pill's box on the track, in canvas pixels. Follows a drag if one is live. */
  function winTrack(w) {
    var span = (heat ? heat.cols : HEAT_WEEKS) * WEEK_MS;
    var end = winEndNow();
    return { x0: ribbonX(end - span, w), x1: ribbonX(end, w),
             y: RIBBON_BARS + 2, h: RIBBON_TRACK - 5 };
  }

  /** True when a press at this height is aiming at the window track rather than the bars. */
  function inWinTrack(y) { return y >= RIBBON_BARS && y < RIBBON_BARS + RIBBON_TRACK; }

  /**
   * Move the band's window so it ENDS at `ms`, clamped to today and to the span.
   *
   * Ends rather than starts, because the window is 52 weeks looking backwards -- that is what
   * it has always been, and a window that started where you pointed would show the year after
   * the date you picked rather than the year up to it.
   */
  /** The window's span, in ms. */
  function winSpan() { return (heat ? heat.cols : HEAT_WEEKS) * WEEK_MS; }

  function clampWinEnd(ms) {
    var todayMs = heatParse(TODAY);
    var lo = dateSpan.lo + winSpan();         // never scroll off the left end of the history
    return Math.max(Math.min(ms, todayMs), Math.min(lo, todayMs));
  }

  /**
   * The window end that puts the pointer in the MIDDLE of the pill.
   *
   * Grabbing it used to set the window's END to the pointer, so the pill jumped to sit
   * entirely to the left of the hand and the thing being dragged was somewhere else. Centring
   * is what a scrollbar thumb does when you click the trough, and it means the date under the
   * cursor is the middle of what the grid is showing -- which is the date you were pointing at.
   */
  function winEndCentred(ms) { return clampWinEnd(ms + winSpan() / 2); }

  /**
   * What a press at `x` grabs: an existing edge, the span between them, or empty strip.
   *
   * THE BUG THIS EXISTS TO FIX: every press used to start a NEW brush anchored where the
   * pointer went down, with the other end following the pointer. So grabbing the left edge
   * and dragging moved the right edge as well -- reported as "when I move the left slider
   * the right one moves too", and it was not a slider at all, it was a fresh selection every
   * time. An edge has to be a thing you can take hold of.
   */
  function brushHit(x, w, y) {
    if (y !== undefined && inWinTrack(y)) return "win";
    var e = brushEnds(), x0 = ribbonX(e[0], w), x1 = ribbonX(e[1], w);
    // The nearer edge wins when both are in reach, or a narrow brush has one grabbable edge.
    var d0 = Math.abs(x - x0), d1 = Math.abs(x - x1);
    if (d0 <= GRAB_PX || d1 <= GRAB_PX) return d0 <= d1 ? "from" : "to";
    // A press INSIDE the brush pans it -- unless the brush is the whole span, where panning
    // is a clamped no-op and what the press obviously means is "select from about here".
    // Without that exception the resting control had no way to start a range except by
    // finding one of the two handles at the very ends of the strip.
    if (x > x0 && x < x1) {
      return (state.from === null && state.to === null) ? "new" : "body";
    }
    return "new";
  }

  /**
   * The date under the handle, floated above the strip.
   *
   * Positioned against #vg-heat, which is the band's own positioning context -- the same one
   * #vg-htip uses. Clamped to the band so a handle at either extreme does not push its own
   * label off the edge, which is the failure every tooltip in this page has had once.
   */
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

  /** A range end as a plain ISO day. */
  function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }

  /** What the grid above is currently drawing, for the track's tooltip. */
  function winLabel() {
    if (!heat) return "";
    return isoDay(heat.start) + "  \u2192  " + isoDay(heat.start + heat.cols * WEEK_MS - DAY_MS);
  }

  function buildDateUI() {
    var rib = $("ribbon");
    if (!rib) return;

    // ONE UPDATE PER FRAME. A pointermove fires 120+ times a second on a decent mouse and
    // each update re-lays out the disc; without this the handler is the bottleneck and the
    // drag lags behind the cursor. The last position is the only one that matters.
    var pend = null, pendRaf = 0;
    var flush = function () {
      pendRaf = 0;
      var f = pend; pend = null;
      if (f) f();
    };
    var onFrame = function (fn) {
      pend = fn;
      if (!pendRaf) pendRaf = WIN.requestAnimationFrame(flush);
    };

    $("rangeall").onclick = function () {
      state.from = null; state.to = null; state.heatEnd = null;
      heatBuild();
      applyRange();
      heatDraw();
    };

    // THE TWO DATE FIELDS. `change` and not `input`: a picker fires input on every keystroke
    // while a date is half-typed, and "2" parses as the year 2 -- which would relayout the
    // disc for a range nobody asked for, twice per digit.
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
        // An emptied field means "no bound on this end", which is exactly what the span's own
        // end means to setRangeMs.
        setRangeMs(fieldMs($("from")), fieldMs($("to")));
      };
    });

    var xOf = function (ev) { return ev.clientX - rib.getBoundingClientRect().left; };
    var yOf = function (ev) { return ev.clientY - rib.getBoundingClientRect().top; };

    rib.addEventListener("pointerdown", function (ev) {
      if (!dateSpan) return;

      var w = ribbonW(), x = xOf(ev), mode = brushHit(x, w, yOf(ev)), e = brushEnds();
      brushDrag = { mode: mode, x0: ev.clientX, moved: false,
                    // For an edge drag the OTHER end is the anchor and does not move. For a
                    // body drag both ends move together, so both originals are kept.
                    anchor: mode === "from" ? e[1] : e[0],
                    from0: e[0], to0: e[1], grab: ribbonMs(x, w),
                    winEnd0: heat ? heat.start + heat.cols * WEEK_MS : 0 };
      try { rib.setPointerCapture(ev.pointerId); } catch { /* fine */ }
      rib.setAttribute("data-grab", mode === "win" ? "moving"
                                  : mode === "body" ? "moving" : "edge");
      // A PRESS ON THE TRACK IS ALSO A JUMP. Dragging the pill across eleven years to reach
      // 2018 is a lot of mouse; pressing at 2018 puts it there and the drag then refines it.
      if (mode === "win") {
        state.heatEnd = winEndCentred(ribbonMs(x, w));
        rebuildBand();
        showRTip(x, winLabel());
      }
    });

    rib.addEventListener("pointermove", function (ev) {
      if (!brushDrag) {
        // Cursor as affordance: the edges are 2px of paint and nothing else says they can be
        // taken hold of.
        if (dateSpan) {
          var x = xOf(ev), w2 = ribbonW(), m = brushHit(x, w2, yOf(ev));
          if (m === "win") rib.setAttribute("data-grab", "body");
          else if (m === "from" || m === "to") rib.setAttribute("data-grab", "edge");
          else if (m === "body") rib.setAttribute("data-grab", "body");
          else rib.removeAttribute("data-grab");
          // The date under the pointer, hovering as well as dragging. This is a date axis
          // eleven years wide in 1268px -- a month is nine pixels, and reading one off the
          // year ticks alone is guesswork. On the track it names the window instead, because
          // there the thing being moved is a 52-week span rather than a day.
          showRTip(x, m === "win" ? winLabel() : isoDay(ribbonMs(x, w2)));
        }
        return;
      }
      if (Math.abs(ev.clientX - brushDrag.x0) > DRAG_MIN) brushDrag.moved = true;
      if (!brushDrag.moved) return;

      var w = ribbonW(), here = ribbonMs(xOf(ev), w), lo, hi, follow;

      // The band's window, moved on its own and touching neither end of the brush. LIVE:
      // rebuildBand() only does the expensive half when the window crosses a week boundary,
      // so this costs one canvas per frame and one re-bucket per week travelled.
      if (brushDrag.mode === "win") {
        var wx = xOf(ev);
        onFrame(function () {
          if (!brushDrag) return;
          state.heatEnd = winEndCentred(here);
          rebuildBand();
          showRTip(wx, winLabel());
        });
        return;
      }

      if (brushDrag.mode === "body") {
        // Pan the whole range, clamped so it keeps its width at either end of the span.
        var d = here - brushDrag.grab;
        var width = brushDrag.to0 - brushDrag.from0;
        lo = Math.max(dateSpan.lo, Math.min(dateSpan.hi - width, brushDrag.from0 + d));
        hi = lo + width;
        follow = hi;
      } else if (brushDrag.mode === "from" || brushDrag.mode === "to") {
        // One end moves, the anchor does not. Crossing over is allowed and simply swaps
        // which end is which, so a drag past the far edge does not stick.
        lo = Math.min(brushDrag.anchor, here);
        hi = Math.max(brushDrag.anchor, here);
        follow = here;                    // the band follows the end being dragged
      } else {
        lo = Math.min(brushDrag.grab, here);
        hi = Math.max(brushDrag.grab, here);
        follow = here;
      }
      // THE BAND'S WINDOW IS NOT TOUCHED HERE. It used to follow whichever end was moving,
      // which is convenient until you want to read one stretch while filtering to another --
      // and it made the window impossible to place deliberately, since the next brush nudge
      // took it back. It has its own track now.
      var mode = brushDrag.mode;
      brushDrag.pFrom = lo;
      brushDrag.pTo = hi;
      onFrame(function () {
        if (!brushDrag) return;
        // Both ends labelled while panning, since both are moving; otherwise just the one
        // under the hand. A label naming the end you are not touching is noise.
        showRTip(ribbonX(follow, w),
                 mode === "body" ? isoDay(lo) + "  \u2192  " + isoDay(hi) : isoDay(follow));
        drawDateUI();               // the handles only; the disc waits for release
        var el = $("rangenote");
        if (el) el.textContent = isoDay(lo) + "  \u2192  " + isoDay(hi);
      });
    });

    // THE ONE MOMENT THE FILTER CHANGES. Everything the drag did was a preview on a canvas;
    // this is where it becomes state, and where the disc animates to it exactly as it does
    // for a legend toggle.
    var endDrag = function (ev) {
      if (!brushDrag) return;
      var d = brushDrag;
      brushDrag = null;
      rib.removeAttribute("data-grab");
      hideRTip();
      try { rib.releasePointerCapture(ev.pointerId); } catch { /* fine */ }

      // Nothing to apply for a window drag: it has been applying itself all along.
      if (d.mode === "win") return;
      if (d.moved && d.pFrom !== undefined) {
        // The ends of the span mean "no bound" rather than "the first and last note", so a
        // drag that lands on an end clears that half of the filter. Without this, brushing
        // the whole strip left a range that excluded anything dated outside the known span.
        state.from = d.pFrom <= dateSpan.lo ? null : d.pFrom;
        state.to = d.pTo >= dateSpan.hi ? null : d.pTo;
        applyRange();
      } else {
        rangeChrome();              // an abandoned drag: put the readout back
      }
    };
    rib.addEventListener("pointerup", endDrag);
    rib.addEventListener("pointercancel", endDrag);

    rib.addEventListener("pointerleave", function () { if (!brushDrag) hideRTip(); });

    // THE YEAR BUTTONS. Delegated, because buildYears replaces them whenever the band is laid
    // out -- binding per button would leak a listener per relayout and miss the new ones.
    //
    // HOVER HALOES THE YEAR'S NOTES, the same way hovering a legend row haloes a folder's: the
    // strip says how MANY notes a year holds, and the disc is where they are. Set through the
    // same state a marked day uses, so it ramps and clears with every other halo rather than
    // being a second highlight mechanism.
    var yrHost = $("years");
    var hoverYear = function (yr) {
      if (state.hoverYear === yr) return;
      state.hoverYear = yr;
      if (renderer) renderer.refresh();
    };
    if (yrHost) {
      var yrOf = function (ev) {
        var b = ev.target && ev.target.closest && ev.target.closest("button[data-yr]");
        return b ? b.getAttribute("data-yr") : null;
      };
      yrHost.addEventListener("click", function (ev) {
        var yr = yrOf(ev);
        if (yr === null) return;
        state.hoverYear = null;
        setRangeMs(Date.UTC(+yr, 0, 1), Date.UTC(+yr, 11, 31));
      });
      // pointerover/out rather than enter/leave: these delegate, and the button is a child.
      yrHost.addEventListener("pointerover", function (ev) { hoverYear(yrOf(ev)); });
      yrHost.addEventListener("pointerout", function (ev) {
        if (!ev.relatedTarget || !yrHost.contains(ev.relatedTarget)) hoverYear(null);
      });
    }

    if (WIN.ResizeObserver) new WIN.ResizeObserver(function () { drawDateUI(); }).observe($("heat"));
    applyRange();
  }

  // ?rest -- COME UP AT REST, with no intro. The intro is TIMELINE_MS * TIME_SCALE, 5.6
  // seconds, and it is the single largest cost in an automated run: every page a measurement
  // opens pays it before the first check, and the suite opens one per lane per vault.
  //
  // Same door ?demo already used for the same reason -- timelineFrame(true) is the resting
  // full disc, derived once with no animation -- so this is that branch given its own name
  // rather than a second way of doing it.
  function restOn() {
    return /(^|[?&#])rest\b/.test(String(location.search) + " " + String(location.hash));
  }

  function demoOn() {
    return /(^|[?&#])demo\b/.test(String(location.search) + " " + String(location.hash));
  }

  // Is anything moving? Every animation in this page owns one of these three, so this
  // is the whole answer rather than a sample of it. The driver polls this instead of
  // sleeping: a fixed wait fires part-way through on a page too slow to finish in time,
  // and the demo would then act on a disc that is still moving -- which is precisely
  // what the layout bugs in this project's history look like.
  function demoBusy() {
    return !!(play || cascadeRun || anim || hoverRaf || hlRaf);
  }

  /* --- resolving a target ------------------------------------------------ */

  // Groups are matched by PREFIX -- the storyboard says "05" and the vault says
  // "05 - Weekly Reviews" -- with two escapes so the demo runs on a vault that shares
  // none of those names:
  //
  //   "#2"   the second-largest group, by note count
  //   fallback: an unmatched prefix resolves to the largest group rather than nothing,
  //            so a beat degrades to "some folder" instead of being skipped
  //
  // That matters for a tool other people run: a storyboard that names this vault's
  // folders would silently skip half its beats on anyone else's.
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

  // A beat's target -> the actual element. Looked up by the attribute the handler reads,
  // never by position, so re-ordering the legend cannot silently aim a beat at a
  // different folder.
  function demoFind(kind, arg) {
    if (kind === "id") return $(arg);
    // A point on the STAGE, for the camera beats. "centre", or a fraction pair like "0.3,0.4"
    // measured from the stage's top-left, so a pan can start somewhere with disc under it.
    if (kind === "stage") {
      var stageEl = $("graph");
      if (!stageEl) return null;
      var sb = stageEl.getBoundingClientRect();
      var f = (arg === "centre" || !arg) ? [0.5, 0.5] : String(arg).split(",").map(Number);
      return demoPoint(sb.left + sb.width * f[0], sb.top + sb.height * f[1],
                       2, 2, "stage " + (arg || "centre"));
    }
    // A BRUSH HANDLE on the date ribbon, "from" or "to", or the window pill, "window".
    // Resolved from the same geometry the control draws with, so a beat aims where the
    // handle is rather than where the storyboard guessed it would be.
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
    if (kind === "sub") {                       // "03/People" -- a subfolder's label
      var slash = arg.indexOf("/");
      var g2 = demoGroup(arg.slice(0, slash)), nm = arg.slice(slash + 1);
      if (!g2) return null;
      // Rows carry the group and the tint-slot INDICES they stand for, not the name, so
      // the name is resolved through subOrder the same way the row itself was built.
      var subs2 = subOrder[g2] || [];
      var k2 = subs2.indexOf(nm);
      // Same reasoning as demoGroup: an unknown subfolder name becomes the group's
      // biggest one rather than a skipped beat. subOrder is size-ordered already.
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
    if (kind === "twisty") {                    // a group's disclosure triangle
      var gt = demoGroup(arg);
      if (!gt) return null;
      var tws = $("legend").querySelectorAll("[data-tw]");
      for (var t = 0; t < tws.length; t++) {
        if (tws[t].getAttribute("data-tw") === gt) return tws[t];
      }
      return null;                              // no subfolders, so no triangle
    }
    if (kind === "only") {                      // the `only` chip on a group's row
      var row = demoFind("group", arg);
      return row ? row.querySelector(".only") : null;
    }
    if (kind === "swatch") {                    // "01/g8" -- one slot in a folder's row
      var cut = arg.indexOf("/");
      var gsw = demoGroup(arg.slice(0, cut)), key = arg.slice(cut + 1);
      if (!gsw) return null;
      // Compared attribute by attribute rather than built into a selector, like every
      // other resolver here: a folder name goes into `data-fc` verbatim, and quoting one
      // into an attribute selector is an escaping problem this does not need to have.
      var sw = $("setbody").querySelectorAll(".swatch");
      for (var s = 0; s < sw.length; s++) {
        if (sw[s].getAttribute("data-fc") === gsw &&
            sw[s].getAttribute("data-key") === key) return sw[s];
      }
      return null;                              // the panel is closed, so nothing to aim at
    }
    if (kind === "note") return demoNoteRect(arg);
    if (kind === "day") return demoCellRect(heat && heat.days[arg]);
    if (kind === "busiest") {
      // Ranked by what is VISIBLE right now, not by membership -- `n` is the sum of the
      // day's alphas. So this never picks a cell that looks empty because the folder it
      // belongs to is hidden, which matters since the storyboard hides one first.
      if (!heat) return null;
      var ds = [];
      for (var kk in heat.days) if (heat.days[kk].n > 0.004) ds.push(heat.days[kk]);
      ds.sort(function (a, b) { return b.n - a.n; });
      return demoCellRect(ds[Math.max(1, parseInt(arg, 10) || 1) - 1]);
    }
    return null;
  }

  // A note in a group, picked as THE MOST ISOLATED one on screen -- the visible note of
  // that group whose nearest visible neighbour, in pixels, is furthest away.
  //
  // Not the best-connected one, which would be the obvious choice for showing edges light
  // up. Two reasons, and the second is the important one.
  //
  // The driver's input hit-tests for real, so aiming at a dot in a crowd means whichever
  // dot actually owns that pixel gets hovered -- and hubs are packed into the middle of
  // the disc where the rows are tightest. The best-connected note is therefore the least
  // reliable thing to aim at.
  //
  // And a miss is not merely a wrong note: hovering NAMES the note on camera. Land one dot
  // over and the label on screen belongs to whatever else was there, which on this vault
  // could be a person's note. So the aim has to be provably unambiguous, not just
  // probably right.
  //
  // THE BOUND. Sigma picks the node whose drawn disc contains the pointer, so the aim is
  // unambiguous exactly when no OTHER node's disc can reach it: the nearest neighbour must
  // be further than this note's radius plus the largest radius on screen. A first version
  // required only twice this note's own size and it was measured to fail -- aiming at the
  // daily note 2026-06-20 hovered 2026-W27 in a neighbouring wedge instead, because the
  // neighbour was a bigger dot than the margin allowed for. Returns null rather than a
  // risky target, and the beat is skipped and logged.
  function demoNoteRect(prefix) {
    var g = demoGroup(prefix);
    if (!g || !renderer) return null;
    // SIGMA'S VIEWPORT IS ITS CONTAINER, NOT THE PAGE. graphToViewport returns
    // coordinates relative to the #graph element, and this vault's disc sits at
    // (288, 155) in the page -- the sidebar's width and the heatmap band's height. The
    // driver dispatches input in PAGE coordinates, so every position needs that origin
    // added or the aim lands a sidebar and a band away from the note.
    //
    // Measured: node 158 (2026-06-20) reports (888, 607) from graphToViewport, and
    // pointing there hovered 2026-W27 instead -- a different note that happens to live
    // where those numbers land on the page. #tip gets away with the raw numbers because
    // it is positioned inside #canvas, whose box is exactly the sigma container's.
    var org = $("graph").getBoundingClientRect();
    var pts = [], maxR = 0;
    graph.forEachNode(function (id, a) {
      if ((alpha[id] || 0) < 0.5) return;                 // not on screen right now
      var v = renderer.graphToViewport({ x: a.x, y: a.y });
      v = { x: v.x + org.left, y: v.y + org.top };
      // THROUGH scaleSize, because everything else in this loop is in VIEWPORT pixels and
      // dotPx is in the units sigma divides by the camera ratio. They agree to within 8% at
      // rest and are a factor of 20 apart zoomed in, which would put every label collision
      // radius wrong by that much.
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
    // NO ISOLATION THRESHOLD. Two were tried and both were unmeetable on a dense disc:
    // "gap > own radius + largest radius on screen" found nothing at 3000 notes, and
    // "gap > own radius + 4px" found nothing at 10000 -- the beat silently skipped and
    // the suite reported "no safely isolated note to aim at" instead of testing anything.
    //
    // The threshold was trying to PROVE the hit-test outcome from geometry. It does not
    // need to: every target carries `expect`, and the driver compares it against what
    // actually got hovered and warns on a miss. Verifying the outcome is both stronger
    // than a bound and available at any density, so the most isolated candidate is
    // returned unconditionally and the check asserts where the pointer landed.
    //
    // `bestGap` is still reported, so how much clearance the aim actually had is
    // measurable rather than assumed.
    var box = Math.max(6, best.r * 1.5);
    return {
      left: best.x - box / 2, top: best.y - box / 2, width: box, height: box,
      // `expect` lets the driver confirm afterwards that the hover landed where it aimed.
      // The title is logged because it is on camera anyway -- and the storyboard aims only
      // at date-titled folders, which is what makes that safe.
      expect: best.id,
      gap: Math.round(Math.sqrt(bestGap) * 10) / 10,
      demoLabel: "note " + best.label
    };
  }

  // Heatmap cells are PAINTED, not DOM, so there is no element to hand back -- a
  // synthetic rect in viewport coordinates is what the driver needs and all it needs.
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

  // Viewport coordinates for the driver, or null if the target is not there. Scrolled
  // into view first, because CDP input hit-tests for real -- a control below the fold
  // is a control that cannot be clicked, and reporting its off-screen coordinates would
  // make the driver click whatever is at that spot instead.
  /**
   * A synthetic target: something with a bounding box that is not an element.
   *
   * demoWhere reads getBoundingClientRect off whatever demoFind returns, so anything that can
   * answer that question can be a target. The camera and the ribbon handles are positions
   * rather than elements, and inventing a DOM node for each would be a lot of DOM for a
   * recording.
   */
  function demoPoint(cx, cy, w, h, label) {
    return {
      getBoundingClientRect: function () {
        return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
      },
      demoLabel: label
    };
  }

  /** Where a ribbon handle is, in page coordinates. */
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
    // Nudged inside the strip: an end handle sits exactly on the edge at rest, and half of a
    // press at x = 0 lands outside the element.
    x = Math.max(2, Math.min(w - 2, x));
    return demoPoint(b.left + x, b.top + RIBBON_BARS / 2, 8, 8,
                     which === "to" ? "range end" : "range start");
  }

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
      // How much clear space the aim actually had, when the target knows. Reported rather
      // than asserted: the driver verifies the hit itself, and this is the number that
      // explains a miss.
      gap: el.gap != null ? el.gap : null,
      // Truncated: a control's `title` is help text, not a name -- Refresh's runs to
      // 180 characters and swamped the driver's log line for that beat.
      label: (el.demoLabel ||
              (el.getAttribute && (el.getAttribute("title") || el.id)) ||
              (kind + " " + arg)).slice(0, 44)
    };
  }

  /* --- the storyboard ---------------------------------------------------- */

  // THE DEMO ITSELF. Everything above is machinery; this is the script, and it is meant
  // to grow -- append beats here and the driver picks them up with no other change.
  //
  // Beats are DATA, not functions, because the thing executing them is in another
  // process. Seven verbs:
  //   {settle}                          wait until nothing is animating
  //   {click, target}                   move the real pointer there and click it
  //   {hover, target}                   move there and stop, to let a hover state show
  //   {dblclick, target}                two clicks inside the double-click window
  //   {drag: [dx, dy], target}          press there, glide by the offset, release
  //   {wheel: n, target}                n notches over it; positive zooms in
  //   {park}                            pointer back to the vetted nothing-under-it spot
  //
  // A target is [kind, arg]. Beyond the legend kinds there are two synthetic ones, because
  // the camera and the date ribbon's handles are positions rather than elements:
  //   ["stage", "centre"] or ["stage", "0.3,0.4"]   a point on the graph
  //   ["brush", "from" | "to" | "window"]           a handle on the date ribbon
  // `why` is for the log and the eventual captions -- it is the only part of a beat a
  // person reads.
  function demoMode() {
    return [
      // The intro is a BEAT, not the page's own boot animation -- see the `?demo` branch
      // at the bottom of this file. Refresh is the real control for "replay it", so the
      // demo presses it rather than calling playTimeline() behind the scenes.
      { settle: true, why: "start from a disc at rest" },
      { click: true, target: ["id", "refresh"], why: "replay the intro on camera" },
      { settle: true, why: "let the vault grow from its first note to now" },

      // Hovering a note names it, lifts it, and lights its links while the rest of the
      // disc recedes. The FOLDERS here are chosen, not incidental: daily notes and
      // weekly reviews are titled by date, so the label that appears on camera carries
      // no personal information -- unlike a note in 03 - Resources / People. Both are
      // hovered before 04 is hidden below, or the first target would not be on screen.
      // "04"/"05" resolve by prefix on a PARA-ish vault and fall back to the largest
      // group elsewhere. Both are date-titled folders on the vaults this is recorded
      // against, which is why the label that appears on camera carries no personal
      // information -- see the note on demoNoteRect.
      { hover: true, target: ["note", "04"], why: "hover a daily note" },
      { hover: true, target: ["note", "05"], why: "hover a meeting note" },

      // Hiding: the wedges reallocate and the disc stays a full circle.
      { click: true, target: ["eye", "04"], why: "hide a folder — the wedges reallocate" },
      { settle: true, why: "let the wedges reallocate" },

      // The tree starts folded, so getting to a subfolder means opening its folder
      // first. That is the honest sequence and it is worth showing: the disc already
      // draws 03's sub-wedges, and this is where the legend admits they are there.
      // It is also load-bearing -- the row the next beat clicks does not exist until
      // this one has run.
      { click: true, target: ["twisty", "03"], why: "unfold a folder to reach its subfolders" },

      // HOVER FIRST, and at both levels. It is the cheaper question and the one you would
      // try first: a halo, with nothing hidden and no wedge moved. A whole folder, then
      // one subfolder inside the folder just unfolded -- both rows do it, so both are
      // worth showing, and the second is only reachable because the twisty above ran.
      //
      // These two used to sit AFTER the heatmap, on the way to the gear, which sent the
      // pointer back up to the legend between two things that had nothing to do with it.
      // The legend work belongs together, and the trip to the gear should be one trip.
      { hover: true, target: ["group", "01"], why: "hover a folder to find it on the disc" },
      { hover: true, target: ["sub", "03/People"], why: "...and one subfolder inside it" },

      // Then the click, which is the same question answered permanently: highlighting is
      // a SEPARATE axis from visibility -- the whole point of the eye being its own
      // control -- and on a subfolder that owns a sub-wedge it moves as a block rather
      // than only being ringed. Hover haloes; a click also pushes. Shown back to back so
      // the difference is visible rather than asserted.
      { click: true, target: ["sub", "03/People"], why: "click it instead: haloed AND pushed out" },
      { settle: true, why: "let the sub-wedge push out" },
      { click: true, target: ["sub", "03/People"], why: "...and let it back down" },
      { settle: true, why: "let it settle back" },

      // The heatmap: hovering a day haloes the notes added that day, wherever they
      // landed on the disc. Ranked rather than dated, so this works on any vault and
      // never lands on a cell emptied by the hide above.
      { hover: true, target: ["busiest", "1"], why: "hover the busiest day" },
      { hover: true, target: ["busiest", "2"], why: "...and the next" },
      { hover: true, target: ["busiest", "3"], why: "...and the next" },

      // THE COLOUR PICKER. The gear has to come first -- the panel's swatches do not
      // exist in the DOM until buildSettings has run, so the `swatch` targets below
      // resolve to nothing without this beat. Two folders are recoloured rather than
      // one, because one swatch click looks like a highlight and two look like a
      // choice; and the second is a grey, which is the answer to "can a folder recede
      // on purpose" that the archives rule only implies.
      { click: true, target: ["id", "gear"], why: "open the settings panel" },
      { click: true, target: ["swatch", "01/g8"], why: "give a folder a colour of its own" },
      { settle: true, why: "the disc repaints -- no relayout, nothing moves" },
      { click: true, target: ["swatch", "03/g11"], why: "...and let another one go grey" },
      { settle: true, why: "let the second repaint land" },
      { click: true, target: ["id", "fcreset"], why: "put every folder back to automatic" },
      { settle: true, why: "let the palette snap back" },
      { click: true, target: ["id", "gear"], why: "close the panel" },

      // FOLD 03 BACK UP before soloing, and this is not tidiness.
      //
      // `only` hides every other group, and a hidden group stops rendering its subfolder
      // rows -- so soloing while 03 is unfolded deletes those rows and pulls everything
      // below them UP, by 97px measured. The pointer does not move, so it ends up over a
      // row three below the one it clicked, whose `only` chip then lights up with its own
      // tooltip. The take ended on a tooltip for the wrong folder, which reads exactly
      // like the demo having mis-clicked.
      { click: true, target: ["twisty", "03"], why: "fold the subfolders away again" },

      // And `only`, which is the fastest way to answer "where does one folder live".
      { click: true, target: ["only", "08"], why: "solo a single folder" },
      { settle: true, why: "let everything else recede" },

      /* --- the camera --------------------------------------------------- */
      // Put everything back first: the camera act is about the camera, and a disc still
      // filtered from the beats above makes it look like the zoom did something to the data.
      { click: true, target: ["id", "allon"], why: "show everything again" },
      { settle: true, why: "let the whole disc come back" },

      // Zoom in a few notches rather than one. One notch is a fifth now, which is the point
      // -- it is a scroll and not a teleport -- and a single notch on camera looks like
      // nothing happened.
      { wheel: 4, target: ["stage", "0.42,0.40"], why: "zoom in, a fifth per notch" },
      { settle: true, why: "let the last notch land" },

      // Then pan, which is only possible now that the disc is not pinned to the middle. Held
      // button the whole way, or the page sees a click and a release with nothing between.
      { drag: [190, 110], target: ["stage", "0.55,0.45"], why: "drag the disc around" },
      { settle: true, why: "let the pan settle" },

      // Two ways back, both shown, because the button is discoverable and the double-click is
      // faster once you know it.
      { dblclick: true, target: ["stage", "centre"], why: "double-click anywhere to reset" },
      { settle: true, why: "let the view come back" },
      { wheel: 3, target: ["stage", "0.60,0.55"], why: "zoom in again, to have something to reset" },
      { settle: true, why: "let it land" },
      { click: true, target: ["id", "reset"], why: "...and the reset button in the corner" },
      { settle: true, why: "let the view come back" },

      /* --- the date range ----------------------------------------------- */
      // The ribbon under the band carries every month of the vault. Its two handles are the
      // filter; the pill below them is the 52 weeks the grid above is drawing, and they move
      // independently -- which is most of what this act is for.
      //
      // The disc waits for the release on each of these, deliberately: a drag repaints one
      // small canvas and the filter lands once, when the button comes up.
      { drag: [300, 0], target: ["brush", "from"], why: "drag the range start forward" },
      { settle: true, why: "let the disc thin out" },
      { drag: [-170, 0], target: ["brush", "to"], why: "and pull the range end back" },
      { settle: true, why: "let it thin further" },

      // The band's window, moved on its own. The range above stays exactly where it was.
      { drag: [-260, 0], target: ["brush", "window"], why: "slide the heatmap window back on its own" },
      { settle: true, why: "let the band redraw" },
      { drag: [170, 0], target: ["brush", "window"], why: "...and forward again" },
      { settle: true, why: "let the band redraw" },

      // Clear it, so the recording ends on the whole vault rather than on a filtered slice
      // that the next viewer would read as the default.
      { click: true, target: ["id", "rangeall"], why: "clear the date range" },
      { settle: true, why: "let the whole vault come back" },

      // Pointer out of the way, so the last frame is the disc rather than a hover state
      // left behind by the last click.
      { park: true, why: "leave the final frame clean" }
    ];
  }

  // Everything the driver needs, and nothing it does not.
  var demoApi = {
    on: demoOn,
    doneTitle: DEMO_DONE_TITLE,
    storyboard: demoMode,
    busy: demoBusy,
    /**
     * WHICH of the five things busy() ors together is still running.
     *
     * busy() answers "is anything moving", which is the right question for a driver deciding
     * whether to act. It is the wrong question for a driver that has GIVEN UP waiting: then
     * the only useful thing to know is what it was waiting for, and a boolean cannot say.
     * Every "settle timed out" before this was a guess between five candidates.
     */
    busyWhy: function () {
      return { play: !!play, cascade: !!cascadeRun, anim: !!anim,
               hover: !!hoverRaf, highlight: !!hlRaf };
    },
    where: demoWhere,
    // What is hovered right now. The driver compares this against a target's `expect`
    // after a hover beat: aiming at a dot is only as good as the hit-test agreeing, and
    // a silent miss puts the wrong note's NAME on camera.
    hovered: function () { return state.hovered; },
    // Called by the driver when the last beat lands. The title is the signal on
    // purpose: a screen recorder outside the browser can poll a window title with no
    // debugging port of its own, no extension and nothing injected.
    finish: function (ms, trace) {
      window.__vgDemoDone = { ms: ms, trace: trace || [] };
      DOC.title = DEMO_DONE_TITLE;
      return true;
    }
  };

  /* ------------------------------------------------------------------ go */

  WIN.setTimeout(function () {
    makeRenderer();
    // Debug handle: lets a test page inspect live layout state from outside.
    API = window.__vg = { graph: graph, state: state,
                    // Re-read the palette from CSS. Called once at init, and again by a
                    // host whose theme changed: THEME is a snapshot, so without this a
                    // theme flip restyles the DOM and leaves every canvas colour behind.
                    readTheme: readTheme, get renderer() { return renderer; },
                    ringsLayout: ringsLayout, visible: visible, groupOf: groupOf,
                    alpha: alpha, cascade: cascade, syncAlpha: syncAlpha,
                    clearAlpha: clearAlpha, buildWedgePlan: buildWedgePlan,
                    // Both added after wanting them from a test page: applyLayout to
                    // settle without waiting on rAF (which a hidden tab throttles,
                    // making a working animation look like a no-op), and
                    // isHighlighted to check the predicate directly.
                    applyLayout: applyLayout, isHighlighted: isHighlighted,
                    isToday: isToday,
                    // Logo internals: placeLogo has to be callable directly, because
                    // refresh() only schedules a render and a tab that is not being
                    // composited never runs one -- so testing the mark through the
                    // renderer silently measures a stale DOM.
                    placeLogo: placeLogo, ringColors: ringColors,
                    // Folder colours, for the two settings UIs and for the suite. The
                    // setter repaints rather than rebuilds -- colour is not an input to
                    // the layout, and an override must not be able to move a node.
                    palette: paletteInfo,
                    groupOrder: function () { return (order[state.dim] || []).slice(); },
                    groupCount: function (g) { return counts[g] || 0; },
                    colorOf: colorOf,
                    // The slot a group is ON, which is not derivable from its position any
                    // more: archives are skipped in the rotation, and sit on no slot at
                    // all. "" means exactly that.
                    slotOf: function (g) { return groupSlot[g] || ""; },
                    isArchiveGroup: isArchiveGroup,
                    get folderColors() {
                      return Object.assign(Object.create(null), folderColors);
                    },
                    setFolderColors: applyFolderColors,
                    // Visibility DEFAULTS. Setting these does not move the live filter --
                    // the host is expected to apply them, which is what setHiddenDefaults
                    // is for.
                    get folderShown() {
                      return Object.assign(Object.create(null), folderShown);
                    },
                    setFolderShown: applyFolderShown,
                    // The saved default, applied live. Mirrors setFolderShown: the host owns
                    // the store and this owns the camera.
                    setPanEnabled: function (v) { return setPan(v !== false, false); },
                    get panEnabled() { return panEnabled; },
                    hiddenByDefault: hiddenByDefault,
                    // Push the defaults into the live filter and repaint. This is the
                    // "and now show it" half, kept separate so loading saved settings at
                    // boot cannot be confused with a person clicking an eye.
                    applyHiddenDefaults: function () {
                      seedHidden();
                      buildLegend();
                      cascade();
                    },
                    // The band, for the same reason placeLogo is exposed: it paints
                    // from afterRender, so a tab that is not being composited never
                    // repaints it and testing through the renderer measures a stale
                    // canvas.
                    heatBuild: heatBuild, heatDraw: heatDraw,
                    get heat() { return heat; },
                    // Live, for the same reason radialEase and subGap are: the cell
                    // size trades how legible the mosaic inside one square is against
                    // how much of the stage the band takes from the disc, and that is
                    // a looking-at-it decision, not a derivable one. The cap is what
                    // moves; the floor and the width still decide the actual size, so
                    // a narrow window is unaffected.
                    get heatCell() { return HEAT_CELL_MAX; },
                    set heatCell(v) {
                      HEAT_CELL_MAX = Math.max(HEAT_CELL_MIN, +v || HEAT_CELL_MAX);
                      heatBuild();
                      // No return: a setter returning a value is a TypeError under
                      // "use strict", which this file is.
                    },
                    heatReport: function () {
                      if (!heat) return "not built";
                      heatCompute();
                      var lv = [0, 0, 0, 0, 0], nz = 0, top = null;
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
                      return out;   // the caller is a console; it prints this itself
                    },
                    bandColors: bandColors, outerPresence: outerPresence,
                    get planMs() { return planMs; },
                    get fullRing() { return fullRing; },
                    set fullRing(v) { fullRing = v; },
                    get timeScale() { return TIME_SCALE; },
                    set timeScale(v) { TIME_SCALE = +v > 0 ? +v : 1; },
                    // Spacing knobs, live. Same motive as timeScale: these three
                    // trade edge collisions against interior ones against how much
                    // whitespace the disc carries, and that balance is only findable
                    // by measuring, not by reasoning. Setting any of them needs
                    // bandLock cleared, since pads feed the row counts.
                    // How far a note closes the gap to its target RADIUS per frame.
                    // 1 = follow exactly. Below 1 it smooths a row-count TICK, which
                    // the code above wrongly assumed no longer existed. Live, so it
                    // can be swept against the probe.
                    get radialEase() { return RADIAL_EASE; },
                    set radialEase(v) { RADIAL_EASE = +v > 0 ? Math.min(1, +v) : 1; },
                    get subGap() { return SUB_GAP; },
                    set subGap(v) { SUB_GAP = +v; },
                    get edgePadArc() { return EDGE_PAD_ARC; },
                    set edgePadArc(v) { EDGE_PAD_ARC = +v; },
                    get edgePadMax() { return EDGE_PAD_MAX; },
                    set edgePadMax(v) { EDGE_PAD_MAX = +v; },
                    // ZERO-WEIGHT INVARIANCE. The strongest of the plan guarantees, and the
                    // one that actually catches this class of bug: **a member with no weight
                    // must not change any output.**
                    //
                    // The cascade and the resting path legitimately disagree on MEMBERSHIP --
                    // a departing note is still in the plan while it fades, and gone once it
                    // has -- so they can never be made identical. What must hold instead is
                    // that the extra zero-weight members cost nothing. They did not: the gap
                    // count counted GROUPS PRESENT rather than weight present, so handing over
                    // from one membership set to the other moved every wedge by one 2-degree
                    // gap. Measured, one isolated frame of 33 graph units / 6 screen px after
                    // the animation had already converged.
                    //
                    // This compares the plan over visible notes against the same plan with
                    // every hidden note added back at weight 0. Every cell's rows and maxR must
                    // be identical.
                    checkZeroWeightInvariance: function () {
                      var W = function (id) { return visible(id) ? 1 : 0; };
                      var save = planKeep;
                      planKeep = function (id) { return visible(id); };
                      var lean = buildWedgePlan(true, W);
                      planKeep = function () { return true; };          // hidden notes seated too
                      var padded = buildWedgePlan(true, W);
                      planKeep = save;
                      var rows = function (p) { var m = {}; p.cells.forEach(function (c) { m[c.k] = c.rows; }); return m; };
                      var a = rows(lean), b = rows(padded), diffs = {};
                      // THE UNION, not the lean plan's keys. A cell that exists only in
                      // the padded plan is exactly the seated zero-weight cell this is
                      // about, and iterating `a` alone never compared it -- which is how
                      // github#5 came back as an empty rowDiffs beside a maxR that
                      // differed by a row. checkPlanParity has always done the union.
                      // Missing counts as ZERO on both sides. A cell whose notes are all
                      // hidden is absent from the lean plan and seated at 0 rows in the
                      // padded one, and those are the same statement -- comparing
                      // undefined against 0 would fail every hidden folder on every
                      // vault, which is exactly what it did when this first went in.
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
                      return out;   // the caller is a console; it prints this itself
                    },
                    // DENSITY. The question github#13 is about: does the disc that is on
                    // screen depend on how many notes are on screen, or on how many the
                    // vault happens to hold? Everything here is measured, not planned --
                    // the plan is what the layout intends, and after a cascade the two
                    // agree while during one they do not.
                    //
                    // pitchPx is the whole point. It is one lattice row in SCREEN pixels,
                    // which is what decides whether two notes in a column touch, and with
                    // the normalisation box pinned and the camera still it is invariant to
                    // note count by construction -- so it reads the same at 1500 notes and
                    // at 500, which is the bug.
                    //
                    // pitchRoot is that made scale-free: if a filtered disc were to refill
                    // its box, area per note would scale as 1/n and pitch as its root, so
                    // pitchPx * sqrt(shown) would hold still across every filter state.
                    // That product is the invariant, and it does not need a second vault to
                    // compare against.
                    densityReport: function () {
                      var shown = 0, lit = 0;
                      graph.forEachNode(function (id) {
                        if (visible(id)) shown++;
                        if ((alpha[id] || 0) > 0.004) lit++;
                      });
                      // One lattice row, mapped through the same camera the notes are drawn
                      // with. graphToViewport is the only honest way to ask: it goes through
                      // the pinned bbox, so it answers in the pixels a person sees.
                      var pitchPx = null, unitPx = null, discPx = null;
                      if (renderer) {
                        var a = renderer.graphToViewport({ x: 0, y: 0 });
                        var u = renderer.graphToViewport({ x: UNIT, y: 0 });
                        unitPx = Math.hypot(u.x - a.x, u.y - a.y);
                        // A ROW, not a lattice unit. These were the same number before the
                        // density solve, and pitchPx is the one that decides whether two
                        // notes in a column touch.
                        var b = renderer.graphToViewport({ x: UNIT * (lastSP || 1), y: 0 });
                        pitchPx = Math.hypot(b.x - a.x, b.y - a.y);
                        // How far the disc actually reaches on screen, from the live radius
                        // rather than the locked one -- the gap between them IS the empty
                        // margin the notes no longer fill.
                        var e = renderer.graphToViewport({ x: (lastMaxR || 0) * UNIT, y: 0 });
                        discPx = Math.hypot(e.x - a.x, e.y - a.y);
                      }
                      // Drawn sizes, as the reducer leaves them -- sizeScale included, which
                      // is the multiplier NODE_MAX does not clamp.
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
                        // The locked geometry, and how much of it the notes reach.
                        lockedMaxR: geomLock ? Math.round(geomLock.maxR) : null,
                        liveMaxR: Math.round(lastMaxR || 0),
                        reach: geomLock && geomLock.maxR
                          ? r3((lastMaxR || 0) / geomLock.maxR) : null,
                        r0: geomLock ? r3(geomLock.r0) : null,
                        // The hole as a SHARE of what is drawn. The r0 formula exists to hold
                        // this constant; pinning r0 while the disc shrinks is what breaks it.
                        holeShare: lastMaxR ? r3((geomLock ? geomLock.r0 : 0) / lastMaxR) : null,
                        sp: r3(lastSP),
                        unitPx: r3(unitPx),
                        pitchPx: r3(pitchPx),
                        pitchRoot: pitchPx ? r3(pitchPx * Math.sqrt(Math.max(1, shown))) : null,
                        sizeScale: r3(sizeScale),
                        sizeMedian: r3(med),
                        sizeMin: r3(sizes.length ? sizes[0] : null),
                        sizeMax: r3(sizes.length ? sizes[sizes.length - 1] : null),
                        cameraRatio: r3(renderer ? renderer.getCamera().ratio : null)
                      };
                    },
                    // PLAN PARITY. The cascade must animate between the static
                    // planner's own outputs, or it walks between packings nothing else
                    // renders -- which is every jump chased on 2026-08-22. This
                    // compares, for the CURRENT visibility state, the plan the static
                    // path builds against the one the cascade would end on. Per-cell
                    // row counts and maxR must match exactly. Run it with a folder
                    // hidden, not just at full vault, since the REPACK_BELOW flag is
                    // what used to differ.
                    checkPlanParity: function () {
                      var shown = 0;
                      graph.forEachNode(function (id) { if (visible(id)) shown++; });
                      var ov = true;
                      var stat = buildWedgePlan(ov, function (id) { return visible(id) ? 1 : 0; });
                      var live = buildWedgePlan(ov, function (id) { return alpha[id] || 0; });
                      var diffs = {};
                      var rows = function (p) { var m = {}; p.cells.forEach(function (c) { m[c.k] = c.rows; }); return m; };
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
                      return out;   // the caller is a console; it prints this itself
                    },
                    // Record each band's radial extent per animated frame. probe(true)
                    // then toggle, then probeReport() -- it names the biggest single
                    // frame step per band, which is what "a jump" actually is.
                    probe: function (on) {
                      probe = (on === false) ? null
                        : { t0: NOW(), samples: [], prevAng: null, prevR: null,
                            watch: arguments.length > 1 ? String(arguments[1]) : null,
                            watched: null, watchSeries: [] };
                      return probe ? "recording" : "off";
                    },
                    probeReport: function () {
                      if (!probe || !probe.samples.length) return "nothing recorded -- call __vg.probe(true) first";
                      var s = probe.samples, worst = { inner: 0, outer: 0 }, at = { inner: 0, outer: 0 };
                      var tanWorst = 0, tanAt = 0, tanWho = null, ngWorst = 0, ngAt = 0;
                      var startWorst = 0, startAt = 0, startG = null, overWorst = 0;
                      for (var i = 1; i < s.length; i++) {
                        var di = Math.abs(s[i].innerMax - s[i - 1].innerMax);
                        var doo = Math.abs(s[i].outerMax - s[i - 1].outerMax);
                        if (di > worst.inner) { worst.inner = di; at.inner = s[i].ms; }
                        if (doo > worst.outer) { worst.outer = doo; at.outer = s[i].ms; }
                        if (s[i].tanStep > tanWorst) { tanWorst = s[i].tanStep; tanAt = s[i].ms; tanWho = s[i].tanId; }
                        var ds = 0, dsG = null;
                        Object.keys(s[i].starts || {}).forEach(function (g) {
                          var was = (s[i - 1].starts || {})[g];
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
                        // The per-note radial worst, and the mean note's move. This is the
                        // radial counterpart of tanMaxStep and the number to judge a jump by;
                        // the band extents below are kept for context but are a max over a
                        // churning set, so their step is not a step in the disc.
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
                        // HOW FAR EACH BAND WENT IN TOTAL. A per-frame step means nothing
                        // on its own: a smooth animation over a long distance and a snap
                        // over a short one produce the same number. Reported so a caller
                        // can ask the only question that scales -- is this frame's move a
                        // reasonable multiple of the average frame's share of the trip.
                        // Needed once the lattice spacing began following the visible count
                        // (github#13), which made a range cascade travel much further.
                        innerTravel: Math.abs(s[s.length - 1].innerMax - s[0].innerMax),
                        outerTravel: Math.abs(s[s.length - 1].outerMax - s[0].outerMax),
                        // AND THE PATH, which is the honest denominator. Travel is net, so a
                        // band that moves out and part-way back reports less than it went --
                        // and comparing a frame's step against a net figure then flags a
                        // smooth animation whose target was moving. The path is the sum of
                        // the steps, so path / frames is the mean frame, and a frame can be
                        // judged as a multiple of that.
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
                        // The tangential jump, and the gap reservation behind it.
                        tanMaxStep: tanWorst, tanStepAtMs: tanAt, tanStepNode: tanWho,
                        // The handover frame, called out on its own: settle() replacing
                        // the interpolation with a fresh rest computation.
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
                        // A wedge boundary moving in one step IS the gap jumping.
                        startMaxStep: Math.round(startWorst * 1000) / 1000,
                        startStepAtMs: startAt, startStepGroup: startG,
                        ngMaxStep: Math.round(ngWorst * 1000) / 1000, ngStepAtMs: ngAt,
                        first: s[0], last: s[s.length - 1], samples: s,
                        watch: probe.watch, watchSeries: probe.watchSeries
                      };
                      return out;   // the caller is a console; it prints this itself
                    },
                    // What is ACTUALLY pushed and haloed right now, grouped by full
                    // path, plus the highlight keys that are set. Reading the code was
                    // not enough to settle whether a depth-2 selection pushes: every
                    // write path stores the clicked path and isPushed only reads
                    // pathKey(a,1), yet the movement is visible. Click the row, then
                    // run this -- if PUSHED is 0 the movement is coming from somewhere
                    // other than the highlight, and the paths tell us where.
                    pushReport: function () {
                      var pushed = [], haloed = [];
                      graph.forEachNode(function (id) {
                        if (isPushed(id)) pushed.push(id);
                        if (isHighlighted(id)) haloed.push(id);
                      });
                      var byPath = function (ids) {
                        var m = Object.create(null);
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
                      return out;   // the caller is a console; it prints this itself
                    },
                    // The demo, as data plus two questions about the page. The driver
                    // lives in scripts/demo.mjs and does the input through CDP; nothing
                    // in here clicks anything.
                    demo: demoApi,
                    // The hover tween, for measuring it. Everything visible about a
                    // hover is a function of hoverT, so a ramp that is wrong is only
                    // findable by sampling it -- reading the reducers proves nothing.
                    get hoverT() { return hoverT; },
                    get hoverBusy() { return !!hoverRaf; },
                    // The highlight ramp, per note. Same motive as hoverT: the size and
                    // the ring are functions of it, so a ramp that is wrong is only
                    // findable by sampling it.
                    hl: hl,
                    get hlBusy() { return !!hlRaf; },
                    // Re-derive the locked geometry, then settle. Needed after any of
                    // the above, because r0/rOuter/band membership are locked at load.
                    // The date range, for the suite and the shooter.
                    get dateSpan() { return dateSpan; },
                    setRange: function (fromISO, toISO) {
                      state.from = fromISO ? heatParse(fromISO) : null;
                      state.to = toISO ? heatParse(toISO) : null;
                      applyRange();
                      heatDraw();
                    },
                    setHeatEnd: function (iso) {
                      state.heatEnd = iso ? heatParse(iso) : null;
                      heatBuild(); drawDateUI(); heatDraw();
                    },
                    lastCascade: function () { return lastCascade; },
                    // The gap the LAST layout pass actually spent, per band. The probe
                    // reports this per frame during an animation; a resting disc has no
                    // frames, and "do two rest states agree about the gap" is the whole
                    // question behind a jump at the end of one.
                    // Where the strip puts a date, for checking the year buttons line up.
                    ribbonXOf: function (ms) { return ribbonX(ms, ribbonW()); },
                    /**
                     * EVERYTHING NEEDED TO REPRODUCE WHAT IS ON SCREEN, as one object.
                     *
                     * Reporting a layout problem by describing it costs a round trip per
                     * unknown -- which folders were hidden, what the range was, how deep each
                     * band was, what the spacing came out as. Most of this session's
                     * measurements were a probe written to answer one of those and then thrown
                     * away. This is those probes, kept, behind a button.
                     *
                     * Measured off the LIVE state, not the plan: what matters is the disc a
                     * person is looking at, and the two have disagreed more than once.
                     */
                    debugDump: function () {
                      var a0 = renderer ? renderer.graphToViewport({ x: 0, y: 0 }) : null;
                      var b0 = renderer ? renderer.graphToViewport({ x: UNIT, y: 0 }) : null;
                      var pxPerRow = a0 && b0 ? Math.hypot(b0.x - a0.x, b0.y - a0.y) : 0;
                      var perPx = pxPerRow > 0 ? UNIT / pxPerRow : 0;
                      // Radii and drawn sizes of everything on screen, split into bands on the
                      // largest radial gap -- the same split every probe in this session used.
                      var pts = [];
                      graph.forEachNode(function (id, a) {
                        if ((alpha[id] || 0) <= 0.004) return;
                        var d = renderer && renderer.getNodeDisplayData(id);
                        // THROUGH scaleSize. getNodeDisplayData().size is what the reducer
                        // RETURNED, not what gets drawn -- sigma scales it again on the way to
                        // the canvas. Read raw, every radius in this dump was short by that
                        // factor, so it reported clearances that were not there and
                        // overlappingPairs: 0 on states that had sixteen. The same trap this
                        // file's dot measurements hit twice before.
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
                      var bandStat = function (arr) {
                        if (!arr.length) return null;
                        var rows = {}, steps = [], clears = [], worst = 1e9;
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
                                 links: graph.size, generated: DATA.generated || "" },
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
                                   markToday: !!state.markToday, shown: pts.length },
                        spacing: { spOuter: r3(lastSP), spInner: r3(lastSPI),
                                   rowsOuter: lastRows.o, rowsInner: lastRows.i,
                                   pitchOuterUnits: r3(pitchUnits("o")),
                                   pitchInnerUnits: r3(pitchUnits("i")) },
                        seam: { outerDeg: lastGapDeg.o, innerDeg: lastGapDeg.i,
                                nGOuter: lastNG.o, nGInner: lastNG.i,
                                fallOuter: r3(seamFall("o")), fallInner: r3(seamFall("i")) },
                        locked: geomLock ? { r0: r3(geomLock.r0), rOuter: r3(geomLock.rOuter),
                                             maxR: r3(geomLock.maxR), rows: geomLock.rows,
                                             bandTotal: geomLock.bandTotal } : null,
                        bands: { inner: bandStat(pts.slice(0, gi)), outer: bandStat(pts.slice(gi)) },
                        dots: { ofPitch: r3(DOT_OF_PITCH), minPx: DOT_MIN_PX,
                                maxSpread: DOT_MAX_SPREAD, m: r3(DOT_M), b: r3(DOT_B), lo: r3(DOT_LO) },
                      };
                    },
                    lastGap: function () {
                      return { ngI: lastNG.i, ngO: lastNG.o,
                               gapDegI: lastGapDeg.i, gapDegO: lastGapDeg.o };
                    },
                    rangeReport: function () {
                      var lit = 0, dated = 0;
                      graph.forEachNode(function (id) {
                        if ((alpha[id] || 0) > 0.004) lit++;
                        if (tlMs[id] !== undefined) dated++;
                      });
                      return { from: state.from, to: state.to, heatEnd: state.heatEnd,
                               lit: lit, dated: dated,
                               total: graph.order, label: rangeLabel() };
                    },
                    relayout: function () {
                      bandLock = null; geomLock = null;
                      regroup();
                      applyLayout(false);
                      renderer.refresh();
                    } };
    buildTimeline();
    buildTimelineUI();
    buildSearch(); buildTools(); buildStats();
    // Inlined at build time by build-graph.mjs; absent if logo-mask.png was missing,
    // in which case the element simply stays display:none.
    if (LOGO_MASK) {
      var mu = 'url("' + LOGO_MASK + '")';
      $("logo").style.webkitMaskImage = mu;
      $("logo").style.maskImage = mu;
      // The inner layer masks by the logo AND a radial fade, so it occupies the middle
      // of the mark only. mask-size: contain applies to both images, which is what
      // keeps the radial concentric with the art.
      var fade = "radial-gradient(circle at 50% 50%, #000 " + LOGO_INNER_FADE.split(",")[0].trim() +
                 ", transparent " + LOGO_INNER_FADE.split(",")[1].trim() + ")";
      var eli = $("logoInner");
      eli.style.webkitMaskImage = mu + ", " + fade;
      eli.style.maskImage = mu + ", " + fade;
      logoMaskReady = true;
      // Also decoded as an Image, because Save PNG has to composite the mask onto a
      // canvas by hand -- a CSS-masked element cannot be drawImage'd.
      logoMaskImg = new Image();
      logoMaskImg.src = LOGO_MASK;
    }
    regroup();
    // After regroup, because the band paints with nodeColor() and the sub-shade
    // ladder does not exist until buildColors() has run. Before playTimeline(),
    // so the band grows with the disc instead of appearing fully lit.
    buildHeatmapUI();
    heatBuild();
    buildDateUI();
    fit();                 // frame the FULL disc first, so the camera holds still
    syncSizeScale();       // ...then size the dots to the pitch this window gives us
    // ...then grow the vault from its first note to now. This used to be
    // clearAlpha() + cascade(), which on an empty screen means DRAW mode: the pie
    // arriving clockwise in wedges. The timeline tells the truer story -- the disc
    // densifies in note order, so the shape of the vault's own history is the
    // first thing you see -- and it means load, Refresh and Play are one
    // animation instead of two that were easy to mistake for a bug.
    // UNDER ?demo THE INTRO DOES NOT PLAY HERE. A recorder cannot start before the page
    // does -- ffmpeg needs Chrome's window to exist and its rect to be readable first,
    // measured at ~2.8s -- so an intro that begins on load is most of the way through by
    // the time the first frame lands. Measured on a take: one second in, the disc was
    // already at 250 of 449 notes.
    //
    // So under ?demo the page comes up AT REST and the storyboard replays the intro
    // itself, through the Refresh button, once the recording is rolling.
    // timelineFrame(true) is the resting full disc: `until` is null by default, so every
    // note is present and the layout is derived once, with no animation.
    if (demoOn() || restOn()) {
      timelineFrame(true);
      // No log. scripts/demo.mjs prints every beat to the terminal as it drives them, so
      // this said the same thing twice -- and console noise is a guideline the linter
      // enforces.
    } else {
      playTimeline();
    }
    $("busy").hidden = true;
  }, 20);
  // A LIVE HANDLE, not the API itself.
  //
  // Init runs inside a setTimeout so the browser can paint "Laying out graph..." first, so
  // API does not exist yet when this returns. Returning it directly returned null -- and
  // null is indistinguishable from "no api" to every `if (this.api)` guard on the plugin
  // side, which is how the theme repaint, the renderer teardown and the diagnostics all
  // became silent no-ops at once. Measured: the canvas held #e8e7e1 while its own CSS token
  // said #333330, and a manual readTheme() + refresh() fixed it instantly.
  //
  // A getter cannot go stale, and it cannot be mistaken for a value that never arrived.
  return { get api() { return API; }, get ready() { return API !== null; } };
}

export { mountVaultGraph };
