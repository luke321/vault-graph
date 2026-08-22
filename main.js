/* Vault Graph -- built by scripts/build-plugin.mjs. Source: plugin/ and src/. */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugin/main.js
var main_exports = {};
__export(main_exports, {
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// raw::C:\git-personal\worktrees\vault-graph-plugin\src\template.html
var template_default = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vault Graph</title>
<!--ASSETS-->
<style>
  /* ---- tokens: light is the base, dark redefines only what changes -------- */
  :root {
    color-scheme: light;
    --surface-0: #f4f3f0;
    --surface-1: #fcfcfb;
    --surface-2: #ffffff;
    --border:    #dedcd5;
    --border-strong: #c4c2b8;
    --text-1: #0b0b0b;
    --text-2: #52514e;
    --text-3: #86857d;
    --edge:      #d9d7cf;
    --edge-hi:   #2a78d6;
    --dim:       #e6e5df;
    /* Today is deliberately NOT one of the categorical hues -- it is the extreme
       of the neutral axis, so it cannot be mistaken for a group colour. */
    --today:     #0b0b0b;
    /* 10 categorical slots. Slots 1-8 are the documented palette in its
       documented order; 9-10 sit in its two largest hue gaps (measured 93 and 74
       degrees) at the median lightness and chroma of the other eight, so they
       belong to the same family rather than being arbitrary additions. */
    --g1: #2a78d6;  /* blue    */
    --g2: #eb6834;  /* orange  */
    --g3: #1baf7a;  /* aqua    */
    --g4: #eda100;  /* yellow  */
    /* Slots 5 and 6 are TRANSPOSED against the source palette's order: green sits in
       5 and magenta in 6. On a PARA vault slot 5 lands on the daily-notes folder,
       which is one of the largest groups and owns one of the widest wedges -- and a
       wide wedge of magenta next to the yellow of slot 4 read as a pink cast over a
       third of the disc. Green there is quieter at that size, and magenta is better
       spent on slot 6, which is usually a small group. */
    --g5: #008300;  /* green   */
    --g6: #e87ba4;  /* magenta */
    --g7: #4a3aa7;  /* violet  */
    --g8: #e34948;  /* red     */
    --g9: #00aecb;  /* cyan    */
    --g10:#c26ed3;  /* orchid  */
    --n1: #6f6e67;  /* neutrals for groups past slot 4: lightness-distinct, */
    --n2: #45443f;  /* all clearing 3:1 on this surface, no competing hues */
    --n3: #8a897f;
    --accent: #2a78d6;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --surface-0: #121211;
      --surface-1: #1a1a19;
      --surface-2: #232322;
      --border:    #33332f;
      --border-strong: #4a4a45;
      --text-1: #ffffff;
      --text-2: #c3c2b7;
      --text-3: #8d8c84;
      --edge:      #333330;
      --edge-hi:   #3987e5;
      --dim:       #2a2a28;
      --today:     #ffffff;
      --g1: #3987e5; --g2: #d95926; --g3: #199e70; --g4: #c98500;
      --g5: #008300; --g6: #d55181; --g7: #9085e9; --g8: #e66767;
      --g9: #009fbb; --g10:#b560bd;
      --n1: #8d8c84; --n2: #bdbcb2; --n3: #77766d;
      --accent: #3987e5;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --surface-0: #121211;
    --surface-1: #1a1a19;
    --surface-2: #232322;
    --border:    #33332f;
    --border-strong: #4a4a45;
    --text-1: #ffffff;
    --text-2: #c3c2b7;
    --text-3: #8d8c84;
    --edge:      #333330;
    --edge-hi:   #3987e5;
    --dim:       #2a2a28;
    --today:     #ffffff;
    --g1: #3987e5; --g2: #d95926; --g3: #199e70; --g4: #c98500;
    --g5: #008300; --g6: #d55181; --g7: #9085e9; --g8: #e66767;
    --g9: #009fbb; --g10:#b560bd;
    --n1: #8d8c84; --n2: #bdbcb2; --n3: #77766d;
    --accent: #3987e5;
  }

  * { box-sizing: border-box; }
  /* .row/.lbl set an explicit display, which would otherwise beat [hidden] */
  [hidden] { display: none !important; }
  html, body { height: 100%; margin: 0; }
  body {
    background: var(--surface-1);
    color: var(--text-1);
    font: 13px/1.45 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
    overflow: hidden;
  }

  #app { display: grid; grid-template-columns: 288px 1fr; height: 100%; }

  /* ---------------------------------------------------------- sidebar ----- */
  #sidebar {
    background: var(--surface-0);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    padding: 14px 14px 28px;
    display: flex; flex-direction: column; gap: 18px;
  }
  .brand { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .brand h1 { font-size: 14px; margin: 0; letter-spacing: -0.01em; }
  .brand .sub { font-size: 11px; color: var(--text-3); }

  .block > .lbl {
    font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--text-3); margin-bottom: 7px; font-weight: 600;
  }

  .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .seg button {
    font: inherit; font-size: 12px; padding: 6px 8px; cursor: pointer;
    background: var(--surface-2); color: var(--text-2);
    border: 1px solid var(--border); border-radius: 6px; text-align: left;
  }
  .seg button:hover { border-color: var(--border-strong); color: var(--text-1); }
  .seg button[aria-pressed="true"] {
    background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600;
  }

  input[type="search"] {
    width: 100%; font: inherit; padding: 7px 9px; border-radius: 6px;
    background: var(--surface-2); color: var(--text-1); border: 1px solid var(--border);
  }
  input[type="search"]:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  input[type="range"] { width: 100%; accent-color: var(--accent); }

  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .row .val { font-variant-numeric: tabular-nums; color: var(--text-2); font-size: 11px; }

  /* legend = the identity carrier past 4 colors */
  #legend { display: flex; flex-direction: column; gap: 1px; }

  /* A row is now three controls, not one button: a twisty, an eye, and the label.
     They do different things (unfold / show-hide / highlight), so they have to be
     separately clickable -- and separately focusable, which nesting would break. */
  .lgr { display: flex; align-items: center; gap: 2px; }
  /* One indent step per folder level. Capped at four because the sidebar runs out of
     width, not because the vault runs out of depth -- deeper folders keep the last
     indent rather than being hidden. */
  .lgr.sub { padding-left: 14px; }
  .lgr.sub2 { padding-left: 28px; }
  .lgr.sub3 { padding-left: 42px; }
  .lgr.sub4 { padding-left: 54px; }

  .tw, .eye {
    flex: none; background: none; border: 0; padding: 2px; cursor: pointer;
    color: var(--text-3); line-height: 0; border-radius: 4px;
  }
  .tw { width: 16px; height: 18px; font: inherit; font-size: 9px; line-height: 1;
        color: var(--text-3); }
  .tw:hover, .eye:hover { color: var(--text-1); background: var(--surface-2); }
  .tw[aria-expanded="true"] { color: var(--text-2); }
  /* An empty slot where a group has no subfolders, so every label still lines up. */
  .tw.none { visibility: hidden; cursor: default; }
  .eye { width: 20px; height: 18px; }
  .eye svg { width: 14px; height: 14px; display: block; }
  /* Hidden reads as dimmed-and-struck on the label; the eye itself just loses its
     pupil, so the icon is legible at 14px rather than relying on colour alone. */
  .eye[aria-pressed="false"] { color: var(--text-3); opacity: .6; }

  /* sw | name | only | count. The count is LAST and fixed-width, so it lands on the
     same x in every row -- see the .ct rule. */
  .lg {
    display: grid; grid-template-columns: 12px 1fr auto auto; align-items: center;
    gap: 8px; padding: 4px 6px; border-radius: 5px; cursor: pointer;
    border: 1px solid transparent; text-align: left; background: none;
    font: inherit; color: var(--text-1); flex: 1; min-width: 0;
  }
  /* Selected in the nav = highlighted on the canvas, and it has to be unmistakable
     at a glance across a 20-row list. Three channels, not one: a tinted fill, an
     accent border, and an inset bar down the leading edge -- the bar is what carries
     it for the indented subfolder rows, whose smaller type makes a fill alone easy
     to skim past. Same treatment at both levels so the state reads the same wherever
     it is. */
  .lg[data-hl="on"], .lgs[data-hl="on"] {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    border-color: var(--accent);
    box-shadow: inset 2px 0 0 0 var(--accent);
    color: var(--text-1);
  }
  .lg[data-hl="on"] .ct, .lgs[data-hl="on"] .ct { color: var(--text-2); }
  .lg:hover { background: var(--surface-2); border-color: var(--border); }
  .lg .sw { width: 11px; height: 11px; border-radius: 3px; }
  .lg .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lg .ct { font-size: 11px; }
  /* Counts line up down the whole tree. Grid columns only align WITHIN one grid, and
     every row here is its own grid -- so the alignment has to come from a fixed width
     on the last column, not from the grid. 3ch covers three digits, which is what this
     vault's biggest group needs (225), and tabular-nums keeps the digits on a lattice
     so 11 and 141 have their units in the same place.
     Indentation does not break it: .lgr.subN pads the LEFT, and every row still ends
     at the container's right edge with the same 6px of padding. */
  .lg .ct, .lgs .ct {
    color: var(--text-3); font-variant-numeric: tabular-nums;
    min-width: 3ch; text-align: right;
  }
  /* Reserved space, not conditional space: the button is laid out at every depth and
     only its OPACITY changes on hover, so revealing it never shifts a count sideways.
     It sits after the name and before the count, which is the reading order -- what
     the row is, what you can do to it, how big it is. */
  .lg .only, .lgs .only {
    font-size: 10px; color: var(--text-3); opacity: 0; padding: 1px 4px;
    border: 1px solid var(--border-strong); border-radius: 4px;
    background: var(--surface-1); line-height: 1.3; white-space: nowrap;
  }
  .lgs .only { font-size: 9px; }
  .lg:hover .only, .lgs:hover .only { opacity: 1; }
  .lg .only:hover, .lgs .only:hover {
    color: var(--text-1); border-color: var(--accent);
  }
  /* nested subfolder rows: swatch + name, indented under their PARA folder */
  /* sw | name | only | count, the same four columns as .lg so the two read as one
     tree rather than as two lists. */
  .lgs {
    display: grid; grid-template-columns: 10px 1fr auto auto; align-items: center;
    gap: 7px; padding: 2px 6px; color: var(--text-2);
    font: inherit; font-size: 11px; background: none;
    border: 1px solid transparent; border-radius: 5px;
    flex: 1; min-width: 0; text-align: left; cursor: pointer;
  }
  .lgs:hover { background: var(--surface-2); border-color: var(--border); color: var(--text-1); }
  .lgs[aria-pressed="false"] { opacity: .35; }
  .lgs[aria-pressed="false"] .nm { text-decoration: line-through; }
  .lgs .sw { width: 10px; height: 10px; border-radius: 2px; }
  .lgs .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lg[aria-pressed="false"] { opacity: .38; }
  .lg[aria-pressed="false"] .nm { text-decoration: line-through; }

  /* Every control in the sidebar is a button and looks like one -- these used to
     be underlined text links, which read as navigation rather than as controls. */
  .mini { display: flex; flex-wrap: wrap; gap: 5px; }

  #stats { font-size: 11px; color: var(--text-3); line-height: 1.6; }
  #stats b { color: var(--text-2); font-variant-numeric: tabular-nums; font-weight: 600; }

  .tools { display: flex; flex-wrap: wrap; gap: 5px; }
  .tools button, .mini button, button.btn {
    font: inherit; font-size: 11px; padding: 5px 8px; cursor: pointer;
    background: var(--surface-2); color: var(--text-2);
    border: 1px solid var(--border); border-radius: 6px;
  }
  .tools button:hover, .mini button:hover, button.btn:hover {
    color: var(--text-1); border-color: var(--border-strong);
  }
  /* A toggle shows its state by being filled, so its label can stay constant --
     a button whose text changes makes you read it to find out what it did. */
  .mini button[aria-pressed="true"], button.btn[aria-pressed="true"] {
    background: var(--accent); border-color: var(--accent); color: #fff;
  }

  /* ------------------------------------------------------------ stage ----- */
  /* Two rows: the heatmap band, then everything else. The band gets its OWN ROW
     rather than floating over the canvas, because the disc is centred in whatever
     is left -- so the two can never collide however short the window gets, and no
     arithmetic has to keep an overlay clear of the rim. Sigma re-reads its
     container size on its own, and refreshSizeScale already exists to re-tune the
     dot sizes to a shorter stage. */
  #stage { position: relative; overflow: hidden; background: var(--surface-1);
           display: grid; grid-template-rows: auto 1fr; }
  /* The canvas row is the positioning context for everything that used to measure
     itself against #stage: the logo, the tooltip, the detail card. graphToViewport
     returns coordinates relative to SIGMA's container, so anything placed from it
     has to live in the same box -- with the band above, #stage and #graph no longer
     share an origin. #busy stays a child of #stage on purpose (inset:0, out of
     grid flow), so the loading cover still hides the band as well. */
  #canvas { position: relative; overflow: hidden; }
  #graph { position: absolute; inset: 0; }

  /* ---------------------------------------------------------- heatmap ----- */
  /* Notes ADDED per day. One canvas, not 364 divs: it repaints from afterRender
     alongside the logo, so the band densifies frame for frame with the disc during
     the intro and the timeline, and a per-frame DOM write for every cell would not
     survive that. */
  #heat {
    position: relative; padding: 9px 14px 8px;
    border-bottom: 1px solid var(--border); background: var(--surface-0);
    display: flex; flex-direction: column; gap: 6px; min-width: 0;
  }
  #heat .hrow { display: flex; align-items: center; gap: 10px; min-width: 0; }
  #heat .hrow .lbl {
    font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--text-3); font-weight: 600; flex: 0 0 auto;
  }
  #heatnote {
    font-size: 11px; color: var(--text-3); min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* The ramp is drawn in the palette's own MEAN colour, the same trick the logo's
     core uses: it says "this is the intensity axis" without claiming a hue that
     belongs to some group. */
  #heatscale {
    margin-left: auto; flex: 0 0 auto; display: flex; align-items: center; gap: 3px;
    font-size: 10px; color: var(--text-3);
  }
  #heatscale canvas { display: block; }
  /* The grid is sized to FIT (heatGeom drops weeks before it drops pixels),
     so this normally never scrolls -- it is a safety valve for a window narrower than
     the 8-week floor. Thin and dim, because when it does appear it is 5px of chrome
     inside a 115px band. */
  #heatwrap { overflow-x: auto; overflow-y: hidden; scrollbar-width: thin;
              scrollbar-color: var(--border-strong) transparent; }
  #heatwrap::-webkit-scrollbar { height: 5px; }
  #heatwrap::-webkit-scrollbar-track { background: transparent; }
  #heatwrap::-webkit-scrollbar-thumb {
    background: var(--border-strong); border-radius: 3px;
  }
  /* Centred, so a band with room to spare reads as deliberate rather than as content
     that ran out. margin:auto still lets it scroll when it genuinely overflows. */
  #heatc { display: block; cursor: pointer; margin: 0 auto; }
  #htip {
    position: absolute; pointer-events: none; z-index: 7; max-width: 240px;
    background: var(--surface-2); border: 1px solid var(--border-strong);
    border-radius: 7px; padding: 6px 9px; font-size: 12px;
    box-shadow: 0 6px 20px rgba(0,0,0,.18); display: none;
  }
  #htip .t { font-weight: 600; margin-bottom: 2px; }
  #htip .m { color: var(--text-2); font-size: 11px; }

  /* The logo sits in the hub hole. Position and size come from JS, because the hole
     radius in PIXELS depends on the camera ratio -- the disc centre itself never
     moves (panning is off and the bbox is pinned symmetric about the origin), so
     only zoom and resize have to be tracked. Hidden until placed, so it cannot
     flash at 0,0 before the first measurement. */
  /* The logo is an ALPHA MASK, not a picture: the art is white on transparent, and
     what shows through it is a conic gradient built from the ring's own wedge colours
     (see ringGradient). So the mark is literally painted by the disc it sits in, and
     it re-colours itself when the palette, the theme or the filters change -- there is
     no second copy of the colour scheme to keep in sync.
     mask-image is set from JS, since the PNG arrives as a base64 data URI. */
  #logo, #logoInner {
    position: absolute; display: none; pointer-events: none;
    transform: translate(-50%, -50%);
    opacity: .95;
    -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
    -webkit-mask-position: center;  mask-position: center;
    -webkit-mask-size: contain;     mask-size: contain;
  }
  /* The inner-band layer is the SAME logo mask intersected with a radial fade, so it
     covers the middle of the mark and dissolves into the layer beneath. Two mask
     images plus mask-composite does this in one element -- no extra clipping wrapper,
     and the two layers stay in exact registration because they share a mask-size. */
  #logoInner {
    -webkit-mask-composite: source-in;   /* older WebKit keyword for the same thing */
    mask-composite: intersect;
  }
  /* The wedge hues were validated against the dark surface; on the light one the same
     fills sit lighter than the paper, so the mark is deepened a touch to hold its
     edges instead of dissolving into the background. */
  :root[data-theme="light"] #logo { opacity: .9; filter: saturate(1.05) brightness(.86); }

  #tip {
    position: absolute; pointer-events: none; z-index: 5; max-width: 260px;
    background: var(--surface-2); border: 1px solid var(--border-strong);
    border-radius: 7px; padding: 7px 9px; font-size: 12px;
    box-shadow: 0 6px 20px rgba(0,0,0,.18); display: none;
  }
  #tip .t { font-weight: 600; margin-bottom: 3px; }
  #tip .m { color: var(--text-2); font-size: 11px; }

  /* node detail card */
  #detail {
    position: absolute; right: 12px; top: 12px; width: 278px; z-index: 6;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 9px; padding: 12px; display: none;
    box-shadow: 0 8px 28px rgba(0,0,0,.16); max-height: calc(100% - 24px); overflow-y: auto;
  }
  #detail h2 { font-size: 13px; margin: 0 22px 6px 0; line-height: 1.3; }
  #detail .meta { font-size: 11px; color: var(--text-2); margin-bottom: 9px; }
  #detail .meta span { display: inline-block; margin-right: 8px; }
  #detail .chip {
    display: inline-block; font-size: 10px; padding: 1px 6px; margin: 0 3px 3px 0;
    border: 1px solid var(--border); border-radius: 999px; color: var(--text-2);
  }
  #detail .nb { font-size: 10px; text-transform: uppercase; letter-spacing: .07em;
                color: var(--text-3); margin: 10px 0 5px; font-weight: 600; }
  #detail a.open {
    display: inline-block; font-size: 11px; color: var(--accent);
    text-decoration: none; border: 1px solid var(--accent);
    border-radius: 6px; padding: 4px 8px; margin-top: 4px;
  }
  #detail a.open:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  #detail ul { list-style: none; margin: 0; padding: 0; }
  #detail li button {
    background: none; border: 0; padding: 2px 0; font: inherit; font-size: 12px;
    color: var(--text-2); cursor: pointer; text-align: left; width: 100%;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #detail li button:hover { color: var(--accent); text-decoration: underline; }
  #detail .x {
    position: absolute; right: 8px; top: 7px; background: none; border: 0;
    color: var(--text-3); font-size: 16px; cursor: pointer; line-height: 1; padding: 2px 5px;
  }
  #detail .x:hover { color: var(--text-1); }

  #hits { margin-top: 6px; max-height: 168px; overflow-y: auto; }
  #hits button {
    display: block; width: 100%; text-align: left; font: inherit; font-size: 12px;
    background: none; border: 0; padding: 3px 5px; border-radius: 4px;
    color: var(--text-2); cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #hits button:hover { background: var(--surface-2); color: var(--text-1); }

  #busy {
    position: absolute; inset: 0; display: grid; place-items: center;
    background: var(--surface-1); z-index: 20; font-size: 13px; color: var(--text-2);
  }

  @media (max-width: 720px) {
    #app { grid-template-columns: 1fr; grid-template-rows: 42% 58%; }
    #sidebar { border-right: 0; border-bottom: 1px solid var(--border); }
    #detail { width: auto; left: 12px; }
  }
</style>
</head>
<body>
<div id="app">
  <aside id="sidebar">
    <div class="brand">
      <h1 id="vname">Vault Graph</h1>
    </div>

    <div class="block">
    </div>

    <div class="block">
      <div class="lbl">Search</div>
      <input type="search" id="q" placeholder="Find a note...">
      <div id="hits"></div>
    </div>

    <div class="block">
      <div class="row"><div class="lbl" style="margin:0">Timeline</div><span class="val" id="tlv">all</span></div>
      <input type="range" id="tl" min="0" max="100" value="100"
             title="Reveal notes oldest-first. The slider is linear in NOTE COUNT, not in time: nearly every note is from the last few months, so a time axis would spend most of its travel on empty years.">
      <div class="mini" style="margin-top:7px">
        <button id="tlplay" title="Grow the vault from its first note to now">play</button>
        <button id="tlall">all</button>
        <button id="today" aria-pressed="false" title="Colour, push out and halo every note created or edited today">mark today</button>
      </div>
    </div>

    <div class="block">
      <div class="row" style="margin-bottom:7px">
        <div class="lbl" style="margin:0">Groups <span id="gcount" class="val"></span></div>
        <div class="mini"><button id="allon">all</button><button id="alloff">none</button></div>
      </div>
      <div id="legend"></div>
    </div>

    <div class="block">
      <div class="lbl">View</div>
      <div class="tools">
        <button id="refresh" title="Re-read the file from disk and reset all filters. Re-reads this file from disk and clears every filter. To pick up notes written since it was built, run refresh-graph.ps1 (or build-graph.mjs) first.">Refresh</button>
        <button id="fit">Fit</button>
        <button id="png">Save PNG</button>
      </div>
    </div>

    <div id="stats"></div>
  </aside>

  <main id="stage">
    <!-- Notes added per day, above the disc. Its own grid row, so the disc is
         centred in what is left rather than being overlapped. -->
    <div id="heat">
      <div class="hrow">
        <div class="lbl">Notes added</div>
        <span id="heatnote"></span>
        <div id="heatscale" aria-hidden="true">
          <span>fewer</span><canvas id="heatkey"></canvas><span>more</span>
        </div>
      </div>
      <div id="heatwrap"><canvas id="heatc"></canvas></div>
      <div id="htip"></div>
    </div>

    <div id="canvas">
      <!-- Before #graph on purpose: the canvases then paint OVER the logo, so if an
           unlinked note is ever sunflower-packed into the hub hole it draws on top of
           the logo rather than being hidden behind it. (This vault currently has 0
           unlinked notes, so the hole is empty -- but that is data, not a guarantee.) -->
      <div id="logo" aria-hidden="true"></div>
      <!-- Two-ring mode only: the inner band's palette, masked to the middle of the mark
           so it fades out into the outer band's colours. Same logo mask, intersected
           with a radial fade. -->
      <div id="logoInner" aria-hidden="true"></div>
      <div id="graph"></div>
      <div id="tip"></div>
      <div id="detail"></div>
    </div>

    <div id="busy">Laying out graph...</div>
  </main>
</div>

<!--LIBS-->
<!--DATA-->

<script>
(function () {
  "use strict";

  var DATA = window.VAULT_DATA;
  var Graph = window.graphology.Graph || window.graphology;
  var SigmaCls = (window.Sigma && window.Sigma.Sigma) || window.Sigma;
  // The programs hang off the UMD NAMESPACE object, not off the Sigma class that
  // SigmaCls resolves to -- the bundle sets both \`Sigma.Sigma\` and
  // \`Sigma.rendering\` on the same export, so \`SigmaCls.rendering\` is undefined and
  // reaching for a program through it throws during construction. That kills the
  // whole init inside its setTimeout, which surfaces as a page stuck on
  // "Laying out graph..." with nothing in the console.
  var RENDERING = (window.Sigma && window.Sigma.rendering) || {};

  var $ = function (id) { return document.getElementById(id); };
  var css = function (name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
      slots:    ["--g1", "--g2", "--g3", "--g4", "--g5",
                 "--g6", "--g7", "--g8", "--g9", "--g10"].map(css),
      neutrals: ["--n1", "--n2", "--n3"].map(css)
    };
  }
  readTheme();

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
    // comes from each note's own \`dirs\` chain, so nothing here assumes a level count.
    pathOpen: Object.create(null),
    selected: null,
    hovered: null,
    // Days marked on the heatmap: one picked by clicking, one under the pointer.
    // Both halo their notes without moving them (see isPushed), and both are
    // independent of markToday -- any combination can be on at once, and none of
    // them is a visibility filter.
    markDay: null,
    hoverDay: null,
    query: "",
    until: null,        // timeline: reveal the oldest N notes, or null for all
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
    graph.forEachNode(function (id, a) {
      var f = a.folder, sb = a.sub || "";
      (tally[f] || (tally[f] = Object.create(null)));
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
  // filter never repaints the survivors. Only the 4 validated slots are used; the
  // rest go neutral and lean on the legend + floating labels for identity.
  // Ten categorical slots, at the author's request. For the record: only four
  // hues clear the all-pairs colour-vision gate on freely-scattered marks, and ten
  // cannot -- measured on this set the worst pair is red vs orange at normal-vision
  // dE 7.1 and CVD dE 1.6. What makes ten workable here is that colour is NOT the
  // only channel: each group owns a contiguous wedge separated by a 2 degree gap,
  // carries a label on the rim, and is listed in the legend with its count.
  var SLOT_COUNT = 10;
  var groupColor = Object.create(null);   // group -> literal hex, rebuilt on regroup
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
      // "(vault root)" is a pseudo-folder for notes sitting loose at the top of the
      // vault, so it leads the numbered folders rather than trailing them.
      var pa = a.charAt(0) === "(" ? 0 : 1, pb = b.charAt(0) === "(" ? 0 : 1;
      return pa - pb || a.localeCompare(b, undefined, { numeric: true });
    });
    order[state.dim] = names;
    return count;
  }

  var counts = {};
  function buildColors() {
    groupColor = Object.create(null);

    // Groups sharing the small-folder wedge share ONE grey -- they are one wedge.
    // Every group that owns its own wedge must then get a DIFFERENT grey, or it
    // reads as part of that shared blob. Reserving the first neutral for the
    // shared wedge and cycling the rest keeps them apart; when nothing is folded
    // (Force layout, or any non-folder grouping) all three neutrals are in play.
    var folded = state.layout === "rings" && state.dim === "folder";
    var pool = folded ? THEME.neutrals.slice(1) : THEME.neutrals;
    var seq = 0;

    (order[state.dim] || []).forEach(function (g, i) {
      if (i < SLOT_COUNT) { groupColor[g] = THEME.slots[i]; return; }
      if (folded && (counts[g] || 0) < SMALL_GROUP) {
        groupColor[g] = THEME.neutrals[0];      // the shared wedge's grey
        return;
      }
      groupColor[g] = pool[seq++ % pool.length];
    });
    buildSubShades();
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
  // why: \`u\` is the fraction ACROSS a row, so a row's first and last notes sit right
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
  function nodeColor(id) {
    var a = graph.getNodeAttributes(id);
    if (state.dim !== "folder") return colorOf(groupOf(id));
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
  var MERGED = "\\u0001merged";

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

  // THE GAP SHRINKS AS THE VAULT GROWS, to nothing by ten thousand notes.
  //
  // SLICE_GAP is 2 degrees, tuned on a 450-note vault where the rows are ~28px apart and
  // a 2-degree channel reads as a clean seam between wedges. The disc's pixel size is
  // fixed, so ten thousand notes pack the same area far tighter -- the lattice closes up
  // while the seam does not, and 2 degrees stops looking like a separator and starts
  // looking like a missing slice. At that density the wedge colours and the rim
  // boundaries separate the groups on their own.
  //
  // Note COUNT is the proxy for density here, not an approximation of it: the radius is
  // pinned by the normalisation box, so notes-per-unit-arc is a function of the count
  // alone. Using the radius instead would be circular -- gapFor is called to compute the
  // reference width the radius is derived from.
  var GAP_FULL_TO = 1000;     // notes: at or below this, the full 2 degrees
  var GAP_ZERO_AT = 10000;    // notes: at or above this, no gap at all
  function gapScale() {
    var n = graph.order;
    if (n <= GAP_FULL_TO) return 1;
    if (n >= GAP_ZERO_AT) return 0;
    return 1 - (n - GAP_FULL_TO) / (GAP_ZERO_AT - GAP_FULL_TO);
  }

  function gapFor(nGroups) {
    var g = SLICE_GAP * Math.PI / 180 * gapScale();
    return g * nGroups > Math.PI ? Math.PI / Math.max(1, nGroups) : g;
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
  // Presence is OPACITY, weight over seats, never weight alone: a 55-note folder fading
  // from 55 down to 1 keeps min(1, weight) pinned at 1 the whole way and then collapses in
  // two frames, which relocates a discontinuity instead of removing it.
  function allocateBand(list, weightOf, seatsOf, opts) {
    var TWO = 2 * Math.PI;
    var tot = 0, gw = Object.create(null);
    list.forEach(function (c) {
      tot += weightOf(c);
      var g = gw[c.g] || (gw[c.g] = { w: 0, seats: 0 });
      g.w += weightOf(c);
      g.seats += seatsOf(c);
    });
    var presOf = function (c) { return Math.min(1, weightOf(c) / Math.max(1, seatsOf(c))); };
    var groupPres = Object.create(null), nG = 0;
    Object.keys(gw).forEach(function (k) {
      groupPres[k] = Math.min(1, gw[k].w / Math.max(1, gw[k].seats));
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
    var gap = gapFor(nG);
    // Sub-gaps ride the same scale. Leaving them fixed would keep a 0.3-degree seam
    // between sub-wedges at a density where the 2-degree one between GROUPS has gone,
    // which inverts the hierarchy the two gaps exist to express.
    var subGap = (opts.subGaps ? SUB_GAP : 0) * Math.PI / 180 * gapScale();
    var gapTotal = gap * nG + subGap * nSub;
    if (opts.clamp && gapTotal > TWO * opts.clamp) {
      var k = (TWO * opts.clamp) / gapTotal;
      gap *= k; subGap *= k; gapTotal *= k;
    }
    var avail = TWO - gapTotal;
    return {
      tot: tot, nG: nG, nSub: nSub, gap: gap, subGap: subGap, avail: avail,
      groupPres: groupPres, presOf: presOf,
      shareOf: function (c) { return avail * (weightOf(c) / Math.max(opts.totFloor, tot)); }
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
  function buildWedgePlan(onlyVisible, weightOf, rowsOf) {
    var W = weightOf || function () { return 1; };
    var all = order[state.dim] || [];
    var nested = state.dim === "folder";
    var SEP = "\\u0000";
    var byCell = {}, cellsOf = {}, planTotal = 0;

    graph.forEachNode(function (id) {
      // While a cascade runs, "who gets a slot" is the UNION of what is staying
      // and what is still on screen on its way out. Filtering to visible() alone
      // gave a departing note no slot at all, so nothing held its space (the
      // wedge vanished instead of closing) and it had no target position (so it
      // faded at stale coordinates on top of the reflowed disc).
      if (onlyVisible && !(planKeep || visible)(id)) return;
      var g = groupOf(id), a = graph.getNodeAttributes(id);
      var split = nested && (subOrder[g] || []).length > 1 && (counts[g] || 0) >= NEST_MIN;
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
    // \`!outer.length\` is also true whenever FILTERING has hidden every outer group.
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
                           function (c) { return c.list.length; },
                           { subGaps: false, clamp: null, totFloor: 0.0001 });
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
    var SP = 1, HOLE = 0.3;
    var r0 = geomLock ? geomLock.r0 : Math.max(1.5, HOLE * Math.sqrt(
      Math.max(1, TOTAL) / (Math.PI * (1 - HOLE * HOLE))));

    // Rows needed to hold n notes, accumulating each row's capacity. The capacity
    // is proportional and unfloored, for the same reason as in placeCell: flooring
    // it clamped a narrow cell's rows to one note each, so a 19-note cell asked
    // for 8 rows and drew as a thin sparse spoke instead of a packed wedge.
    function rowsNeeded(span, n, st) {
      var i = 0, r = st, k = 0;
      while (i < n && k < 500) { i += Math.max(0.05, span * r / SP); r += SP; k++; }
      return Math.max(1, k);
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
    var GUTTER = 1.6;

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
    // the size threshold ~150 lines up and was a silent no-op: \`r0\` is declared below it,
    // so \`var\` hoisting made it \`undefined\`, rowsNeeded returned 1 for every group, no
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
      // WHAT COUNTS AS SMALL IS ABSOLUTE, not a share of the vault. \`smallAt\` is
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
      cells.forEach(function (c) {
        groupNotes[c.g] = (groupNotes[c.g] || 0) + c.list.length;
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
        var bc = Infinity, br = R0_BASE;
        for (var m = 100; m <= 300; m += 5) {
          var rv = R0_BASE * (m / 100), t = spanFor(ins, outs, rv);
          var c2 = Math.abs(t.inner - BAND_RATIO * t.outer) +
                   (t.iR > t.oR ? INVERT_WEIGHT * (t.iR - t.oR) : 0) +
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
    var innerRows = 0;
    inner.forEach(function (c) {
      c.rows = rowsNeeded(usableRef(c, r0), c.wsum, r0);
      if (c.rows > innerRows) innerRows = c.rows;
    });
    var rOuter = geomLock ? geomLock.rOuter
               : (inner.length ? r0 + innerRows * SP + GUTTER : r0);

    var maxR = rOuter;
    outer.forEach(function (c) {
      c.rows = rowsNeeded(usableRef(c, rOuter), c.wsum, rOuter);
      var r = rOuter + c.rows * SP;
      if (r > maxR) maxR = r;
    });

    // Rows sit SP apart in every cell -- spacing is never rescaled per cell, which
    // is what keeps density uniform. Each cell's first row is at its band's inner
    // edge, so columns grow outward and a cell ends where its notes run out.
    // Lay a cell's notes out on a grid of exactly \`rows\` rows. Position is a
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
    function placeCell(c, rows, base) {
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
      var recs = [], acc = 0;
      seq.forEach(function (id) {
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
        recs.push({ id: id, w: w, row: Math.floor(pp) });
      });

      // PASS 2 -- where in that row it sits, measured WITHIN THE ROW rather than
      // taken from the fractional part of pp. This is the whole fix for sub-wedges
      // needing a wide gap.
      //
      // \`frac\` is where the cumulative sum happened to be when it crossed an integer,
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
      // Weight-based, not \`(i + 0.5) / n\`, so it stays animation-safe: a fading note
      // gives up its share continuously instead of vanishing from the distribution.
      // And crossing a row boundary is still continuous because the serpentine
      // reverses -- the last note of row k and the first of row k+1 both sit near
      // u = 1.
      var rowW = Object.create(null);
      recs.forEach(function (r) { rowW[r.row] = (rowW[r.row] || 0) + r.w; });
      var rowAcc = Object.create(null);
      var out = [];
      recs.forEach(function (r) {
        var before = rowAcc[r.row] || 0, tot = rowW[r.row] || 0;
        var t = tot > 1e-9 ? (before + r.w / 2) / tot : 0.5;
        rowAcc[r.row] = before + r.w;
        var rr = (base + r.row * SP) * (c.inner ? INNER_SCALE : 1);
        var u0 = (r.row % 2 === 1) ? 1 - t : t;
        out.push({ id: r.id, r: rr, u: pad + u0 * span });
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
      c.slots = placeCell(c, rf, base);
    });

    return { cells: cells, maxR: maxR, total: planTotal, r0: r0, rOuter: rOuter };
  }

  // RETIRED 2026-08-22. This used to switch the plan basis on how much of the vault
  // was left on screen -- whole-vault above 55%, a visible-only rebuild below -- and
  // that threshold was the root of a whole afternoon of "jumps". Planning must not
  // depend on HOW MANY notes were toggled:
  //
  //   - it made behaviour inconsistent. Hiding \`08 - Meeting Notes\` (221 notes) crossed
  //     the line and re-densified; hiding \`04 - Daily Notes\` (55) did not, so the same
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
    // TWO measures per cell. \`geom\` is how much room the cell is allocated;
    // \`live\` is the opacity-weighted count actually on screen. Their ratio is how
    // far open the wedge is within its own arc.
    //
    // What a note contributes to \`geom\` is the whole trick, and it has to be
    // SYMMETRIC between arriving and leaving or the ring breaks:
    //
    //   - A note on its way OUT counts whatever opacity is left of it. Hiding a
    //     group turns visible() false on frame one, so counting only visible
    //     notes struck the cell out of the allocation instantly and its
    //     neighbours snapped wider while its own notes were still fading in
    //     place on top of them.
    //   - A note on its way IN counts its opacity too, in \`trade\` mode. Counting
    //     it as a whole slot up front allocated the new wedge its full final
    //     span immediately, while \`open\` still rendered it at zero width -- so
    //     the ring carried a hole the size of the incoming group (~150 degrees
    //     for 08 - Meeting Notes) that the dots then popped into. Ramping it
    //     makes the other wedges give up their space at exactly the rate the new
    //     one takes it, so the circle stays full and only gets denser.
    //
    // In \`draw\` mode there is no ring to keep full, so an arriving note does
    // claim its whole slot and the occupied arc grows clockwise instead.
    var live = 0;
    plan.cells.forEach(function (c) {
      c.geom = 0; c.live = 0;
      c.slots.forEach(function (sl) {
        var al = alpha[sl.id] || 0;
        c.geom += (fullRing || !visible(sl.id)) ? al : 1;
        c.live += al;
      });
      live += c.geom;
    });
    var shown = plan.cells.filter(function (c) { return c.geom > 1e-4; });
    if (!shown.length || !live) return null;

    // The inner and main bands are each a full circle, so they are allocated
    // separately -- a small cell competes only with the other small cells.
    var TWO = 2 * Math.PI;
    var pos = {};
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
                           function (c) { return c.slots.length; },
                           { subGaps: true, clamp: 0.45, totFloor: 1e-6 });
      var gap = a.gap, subGap = a.subGap;
      band.forEach(function (c) { c.span = a.shareOf(c); });

      // A gap BEFORE EVERY GROUP, including the first -- that leading one is the wrap
      // boundary between the last group and the first, so the ring still reads as even.
      //
      // Every placed increment carries the same presence weight the reservation used, or the
      // two disagree and the wedges stop filling the circle. Placing one gap per group makes
      // the total exactly gap * nG, equal to the reservation, with nothing left over.
      //
      // It used to be half a gap at the start and half left at the end, which made the
      // leading offset depend on *which group happens to be first in the sweep*. When that
      // group's presence reached zero it dropped out of \`band\`, \`band[0]\` became the next
      // group at presence 1, and the offset jumped 0 -> gap/2 in a single frame: the whole
      // ring rotated ~1 degree. Reported as "toggling 03 makes 08 move slightly left on the
      // last frame". Now every term is continuous, so no group's departure can rotate the
      // disc. Costs a constant half-gap of rotation against the old layout -- 1 degree,
      // fixed, and invisible.
      var theta = gap * a.groupPres[band[0].g], prevG = null;   // theta is a sweep
      band.forEach(function (c) {
        if (prevG !== null) theta += (c.g !== prevG) ? gap * a.groupPres[c.g] : subGap * a.presOf(c);
        prevG = c.g;
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
        var base = theta, open = c.geom > 1e-6 ? c.live / c.geom : 0;
        var a0 = base;
        var a1 = a0 + c.span * open;
        c.slots.forEach(function (sl) {
          if (!present(sl.id)) return;
          // ROTATED BACK BY HALF A GAP, so the WRAP GAP is centred on 12 o'clock rather
          // than starting there. The allocation places a full gap before the first group
          // (see the leading-offset note above), and sweep 0 is 12 o'clock -- so the gap
          // between the last group and the first spans [0, gap] and 12 o'clock sits on
          // its leading edge, which reads as the disc being rotated half a gap clockwise.
          //
          // Applied here, at the sweep-to-angle conversion, rather than by changing the
          // leading offset: the offset arithmetic is what makes every term continuous
          // when a group fades out, and it is not worth disturbing for a constant
          // rotation. \`gap\` is this BAND's own already-clamped gap, so each ring rotates
          // by its own half-gap -- one line covers both.
          //
          // A constant, deliberately not scaled by presence: anything presence-weighted
          // here would rotate the ring as notes arrive, which is the class of bug the
          // leading-offset note describes.
          var t = sweepAngle(a0 + (a1 - a0) * sl.u - gap / 2);
          // Highlighted notes step outward by HL_PUSH rows. Applied here rather than
          // in the packing so it changes nothing about rows, capacities or wedge
          // angles -- a highlight is a pure display offset, and every stability
          // guarantee about reflows survives it untouched.
          var rr = sl.r + (isPushed(sl.id) ? HL_PUSH : 0);
          pos[sl.id] = { x: rr * Math.cos(t), y: rr * Math.sin(t) };
        });
        theta = a1;                  // contiguous: the next wedge starts here
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

    return out;
  }

  /* ------------------------------------------------------------- timeline */

  // Notes ranked oldest-first. The slider is linear in RANK rather than in time
  // on purpose: measured on this vault, 409 of 442 notes fall in the last three
  // months while a handful carry content dates back to 2015, so a linear time
  // axis would spend 97% of its travel on empty years and the interesting part
  // would be the last pixel.
  var tlRank = Object.create(null), tlDate = [], tlMax = 0;
  function buildTimeline() {
    var dated = [];
    graph.forEachNode(function (id, a) { if (a.created) dated.push([id, a.created]); });
    dated.sort(function (x, y) { return x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0; });
    tlRank = Object.create(null); tlDate = [];
    dated.forEach(function (pair, i) { tlRank[pair[0]] = i + 1; tlDate.push(pair[1]); });
    tlMax = dated.length;
  }

  // Today's date, read at load rather than baked in at build time, so the mark
  // stays correct tomorrow without rebuilding the snapshot.
  var TODAY = (function () {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  })();
  // "Today" means created today OR edited today. \`created\` alone was not enough:
  // it comes from frontmatter, and this vault pre-creates daily notes from the
  // calendar, so today's daily note carries an import stamp from days earlier and
  // \`created\` takes precedence over \`date\`. Measured on 2026-08-21: 0 notes created
  // today against 3 touched, so the button reliably marked nothing.
  function isToday(id) {
    var a = graph.getNodeAttributes(id);
    return a.created === TODAY || a.touched === TODAY;
  }

  // A day clicked on the heatmap. Haloed and recoloured, NOT pushed -- see isPushed.
  //
  // \`created\` ONLY, not touched: the band counts notes added, so clicking one of its
  // squares has to mark exactly the notes that square counted. Reusing isToday's
  // created-or-touched rule here would light up notes the square never included, which
  // reads as the heatmap lying about its own number.
  function isMarkedDay(id) {
    if (!state.markDay && !state.hoverDay) return false;
    var c = graph.getNodeAttribute(id, "created");
    return c === state.markDay || c === state.hoverDay;
  }

  // One predicate for both highlight sources -- a clicked group and "mark today" --
  // so they get identical treatment (pushed out radially, haloed) and there is only
  // one thing for the layout and the renderer to ask about.
  // Haloed: any highlight source at all.
  function isHighlighted(id) {
    if (state.markToday && isToday(id)) return true;
    if (isMarkedDay(id)) return true;
    if (state.highlight[groupOf(id)]) return true;
    var a = graph.getNodeAttributes(id), d = a.dirs || [];
    for (var k = 1; k <= d.length; k++) if (state.highlightSub[pathKey(a, k)]) return true;
    return false;
  }

  // Does this subfolder own a contiguous wedge of its own? Cells are keyed by TINT
  // SLOT, and everything past the third-largest shares the last slot -- so the
  // "N smaller subfolders" are one cell between them, not one cell each.
  //
  // Only a sub with its OWN slot owns a wedge, and only those are pushed. A pooled
  // one's notes are interleaved with its cell-mates at the same angles, so pushing it
  // slides a subset out THROUGH them: the highlight meant to make the selection
  // legible is what creates the overlaps. \`03 - Resources/Locations\` is the case that
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
    if (state.markToday && isToday(id)) return true;
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
  var TL_FADE = 8;
  function timeFactor(id) {
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
      c = [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
    } else {
      var m = /(\\d+)\\D+(\\d+)\\D+(\\d+)/.exec(h);
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
  // ...and 1 was wrong, because the premise above is false: \`Math.floor(pp)\` makes a
  // note's radius DISCRETE, so a cell's fractional row count crossing an integer
  // teleports its outermost note a full pitch. There were ticks to smooth all along.
  // Measured on the \`04 - Daily Notes\` hide, worst single-frame step of the outer band:
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
    if (anim) { cancelAnimationFrame(anim); anim = null; }
    if (animGuard) { clearTimeout(animGuard); animGuard = null; }
    if (cascadeRun) {
      cancelAnimationFrame(cascadeRun.raf);
      clearTimeout(cascadeRun.guard);
      cascadeRun = null;
    }

    // A null plan is legitimate: "none" hides every note, so there is no
    // geometry left to lay out. The fade still has to run, with positions simply
    // frozen where they are, or the disc would blink out instead of receding.
    // Trade space against whatever is already on screen; only an empty screen
    // draws the pie from nothing.
    fullRing = false;
    graph.forEachNode(function (id) { if (present(id)) fullRing = true; });

    planKeep = function (id) { return visible(id) || present(id); };
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
    graph.forEachNode(function (id) { keep[id] = alpha[id] || 0; alpha[id] = visible(id) ? 1 : 0; });
    var finalPos = ringsLayout() || {};
    graph.forEachNode(function (id) { alpha[id] = keep[id]; });
    var sweepOf = Object.create(null);
    graph.forEachNode(function (id) {
      var q = finalPos[id];
      sweepOf[id] = q ? angleSweep(Math.atan2(q.y, q.x)) : 0;
    });

    var ins = [], outs = [], to = Object.create(null), from = Object.create(null);
    graph.forEachNode(function (id) {
      var want = visible(id) ? 1 : 0;
      var now = alpha[id] || 0;
      if (Math.abs(now - want) <= 0.004) return;
      to[id] = want; from[id] = now;
      (want ? ins : outs).push(id);
    });
    if (!ins.length && !outs.length) { pinnedPlan = null; applyLayout(true); return; }

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

    var settle = function () {
      if (cascadeRun) {
        cancelAnimationFrame(cascadeRun.raf);
        clearTimeout(cascadeRun.guard);
        cascadeRun = null;
      }
      moving.forEach(function (id) { alpha[id] = to[id]; });
      pinnedPlan = null;
      planKeep = null;
      // No tween needed: at p = 1 the notes are already laid out under planB,
      // which is exactly what an unpinned ringsLayout() produces now that the
      // departing notes are gone.
      applyLayout(false);
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
    // \`shown < order * REPACK_BELOW\`. The cascade used to hardcode \`true\`, so for any
    // filter light enough to stay above that threshold the animation ran on the
    // visible-only packing and settle() then re-planned onto the whole-vault one --
    // a different plan, so the ring changed size AFTER the animation finished.
    //
    // Measured with \`04 - Daily Notes\` hidden (393 of 450 visible, threshold 248):
    // visible-only gave 16 cells / 64 rows / maxR 13, whole-vault 19 cells / 75 rows /
    // maxR 14, with every major cell differing by exactly one row (6 vs 7). One row is
    // the jump. \`08 - Meeting Notes\` never showed it because hiding it leaves 229
    // visible, below the threshold, so both sides agreed by luck.
    //
    // visible() is already at its post-toggle value on frame one, so this is exactly
    // the flag settle() will compute, and the contract above -- "at 1, exactly the one
    // settle() assigns" -- holds again.
    var shownAfter = 0;
    graph.forEachNode(function (id) { if (visible(id)) shownAfter++; });
    var ovAfter = true;   // one basis everywhere; see REPACK_BELOW

    var rowsSrc = Object.create(null), rowsDst = Object.create(null);
    var bandSrc = Object.create(null), bandDst = Object.create(null);
    // ONE planner, called the same way at both ends.
    //
    // The cascade's endpoints have to be *the static planner's own output* for the
    // before and after states, or the animation walks between two packings that
    // nothing else ever renders. Every jump chased on 2026-08-22 was this: the two
    // were called with different arguments and drifted apart one argument at a time --
    // \`onlyVisible\` hardcoded to true, weights defaulting to 1 instead of the 0/1 that
    // alpha settles to, \`planKeep\` set by hand at each call site.
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
      var b = staticPlan(function (id) { return visible(id); });
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
        cascadeRun.guard = setTimeout(watchdog, STALL_MS);
        return;
      }
      settle();
    };
    // \`span\` is measured in frames, and every stagger delay and fade window below is
    // expressed in the same unit. Rather than convert all of them, map one frame onto
    // however many milliseconds it must take for the whole span to land on CASCADE_MS.
    // The proportions -- which note starts when, how long each fade lasts -- are
    // untouched; only the clock changes.
    var msPerFrame = (CASCADE_MS * TIME_SCALE) / Math.max(1, span);
    // Real time drives the progress, but a single frame may never advance more than
    // 1/MIN_FRAMES of the whole span. \`04 - Daily Notes\` is the toggle that made this
    // necessary: 55 notes plus a repack drops the frame rate far enough that pure
    // wall-clock progress moved the disc in visible leaps. Clamped, a slow page takes
    // longer than CASCADE_MS instead of jumping -- the fixed duration holds whenever
    // there are enough frames to draw it, which is the only time it is worth having.
    var MIN_FRAMES = 20;
    var maxAdv = Math.max(1, span) / MIN_FRAMES;
    var frame = 0, tPrev = NOW(), tailFrames = 0;
    cascadeRun = { raf: 0, tick: NOW(), guard: setTimeout(watchdog, STALL_MS) };
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
        // other end (\`s = d\`, \`d = s\`) pinned its count, so the disc re-densified
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
      var plan = buildWedgePlan(ovAfter, weightOf, rowsAt);
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
      renderer.refresh({ skipIndexation: true });
      // \`resid > 0.5\` is the new clause: never hand over to settle() while a note is
      // still visibly short of its target. Bounded by the ramp above, so this adds a
      // few frames, not an open-ended tail.
      if (busy || pr < 1 || resid > 0.5) cascadeRun.raf = requestAnimationFrame(step);
      else settle();
    })();
  }

  /* ------------------------------------------------------------- animation */

  // FRAME-BY-FRAME RADIAL PROBE. Reasoning about which band can move the other has
  // been wrong twice, so measure it: this samples each band's radial extent on every
  // animated frame, and the report gives the biggest single-frame step per band. A
  // "jump" is a large step in one frame; a smooth animation is many small ones.
  var probe = null;
  function probeSample(tag) {
    if (!probe) return;
    var iMin = Infinity, iMax = 0, oMin = Infinity, oMax = 0, iN = 0, oN = 0;
    graph.forEachNode(function (id, a) {
      var r = Math.hypot(a.x, a.y);
      if (bandLock && bandLock[groupOf(id)]) {
        iN++; if (r < iMin) iMin = r; if (r > iMax) iMax = r;
      } else {
        oN++; if (r < oMin) oMin = r; if (r > oMax) oMax = r;
      }
    });
    probe.samples.push({
      tag: tag, ms: Math.round(NOW() - probe.t0), gapI: lastGapN.i, gapO: lastGapN.o,
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
    if (anim) { cancelAnimationFrame(anim); anim = null; }
    if (animGuard) clearTimeout(animGuard);

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
      if (anim) { cancelAnimationFrame(anim); anim = null; }
      if (animGuard) { clearTimeout(animGuard); animGuard = null; }
      assignPositions(targets);
      renderer.refresh({ skipIndexation: false });
      if (done) done();
    };
    var dur = TWEEN_MS * TIME_SCALE;
    // WATCHDOG, not a deadline. A fixed \`setTimeout(settle, dur + margin)\` fires
    // part-way through whenever the page cannot render fast enough to finish in time,
    // and settle() then snaps the disc to its final layout -- a jump at the end of
    // every animation, on exactly the machines where the animation matters. This only
    // fires when no FRAME has arrived for STALL_MS, so a slow page animates slowly and
    // a stopped rAF still lands.
    var lastFrame = NOW();
    var TWEEN_STALL = 400;
    var tweenDog = function () {
      if (anim && NOW() - lastFrame < TWEEN_STALL) { animGuard = setTimeout(tweenDog, TWEEN_STALL); return; }
      settle();
    };
    animGuard = setTimeout(tweenDog, TWEEN_STALL);

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
      if (p < 1) { anim = requestAnimationFrame(step); }
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
  // Depth 1 is the old \`folder + "/" + sub\`, so every existing key still matches.
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
  // than responding. \`hoverT\` is how far the treatment has arrived, and every part of it
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
      hoverRaf = requestAnimationFrame(step);
    })();
  }

  /* -------------------------------------------------------- highlight ramp */

  // How far each note has arrived at being highlighted. PER NOTE, not one global scalar,
  // and that is not over-engineering: highlights are additive. Two groups can be lit at
  // once, a subfolder can be lit inside an already-lit group, and a heatmap hover swaps
  // one whole set for another. A single ramp would pop the second set in at whatever
  // value the first had left it, and could not fade one set out while another fades in.
  // \`alpha\` already establishes the pattern -- a per-note value that something walks.
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
           (state.markDay || "") + "|" + (state.hoverDay || "");
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
      hlRaf = requestAnimationFrame(step);
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
    // Hand over CONTINUOUSLY rather than switching. \`outer || inner\` meant that the
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
      // frames of the cascade, whatever \`t\` happened to be doing.
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
    // \`from 0deg\` is 12 o'clock running clockwise, which is exactly the sweep the disc
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
      eli.style.display = gi ? "block" : "none";
    }
    var c = renderer.graphToViewport({ x: 0, y: 0 });
    var edge = renderer.graphToViewport({ x: geomLock.r0 * UNIT, y: 0 });
    var holePx = Math.hypot(edge.x - c.x, edge.y - c.y);
    var size = Math.max(24, Math.min(LOGO_PX, holePx * 2 * LOGO_OF_HOLE));
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.left = c.x + "px";
    el.style.top = c.y + "px";
    el.style.display = "block";
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
  var REF_PITCH = 28;
  var SIZE_FLOOR = 0.45;
  var sizeScale = 1;

  // Whether the border program actually loaded. If the bundle ever ships without it,
  // highlighting still works -- the radial push carries it on its own -- rather than
  // asking Sigma for a node type it cannot draw.
  var haloOn = !!RENDERING.createNodeBorderProgram;

  function measureSizeScale() {
    if (!renderer) return 1;
    // One row of spacing is SP (=1) layout units, i.e. UNIT graph units.
    var a = renderer.graphToViewport({ x: 0, y: 0 });
    var b = renderer.graphToViewport({ x: UNIT, y: 0 });
    var pitch = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(pitch > 0)) return sizeScale;
    return Math.max(SIZE_FLOOR, Math.min(1, pitch / REF_PITCH));
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
      minCameraRatio: 0.02,
      maxCameraRatio: 12,
      // The disc is the whole point of this view, so it stays centred: panning and
      // rotation are off, zoom stays. With the normalisation box pinned symmetric
      // about the origin, the camera's (0.5, 0.5) IS the centre of the disc, so
      // holding the camera there keeps the ring centred in the stage whatever is
      // filtered. Zoom still moves the camera toward the pointer, so it is pulled
      // back on every camera update -- see the centre lock below.
      enableCameraPanning: false,
      enableCameraRotation: false,
      enableCameraZooming: true,
      defaultEdgeType: "line",
      // Both programs are registered up front so the toggle is a per-edge \`type\`
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
        // Applied last, so it scales the arrival ramp above as well as the resting
        // size -- a fading note should grow toward the size it will actually hold.
        if (sizeScale !== 1) r.size = (r.size || a.size) * sizeScale;
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

    // Centre lock: zooming with the wheel recentres toward the pointer, which
    // would slide the disc off-centre over time. Ratio changes are kept, x and y
    // are not.
    (function () {
      var cam = renderer.getCamera(), fixing = false;
      cam.on("updated", function (st) {
        if (fixing) return;
        if (Math.abs(st.x - 0.5) < 1e-9 && Math.abs(st.y - 0.5) < 1e-9) return;
        fixing = true;
        cam.setState({ x: 0.5, y: 0.5, ratio: st.ratio, angle: 0 });
        fixing = false;
      });
      // Zoom changes the hole's pixel radius, so the logo is re-placed with it --
      // and the row pitch with it, so the dot sizes are rechecked too.
      cam.on("updated", function () { placeLogo(); refreshSizeScale(); });
    })();

    // A window resize changes the disc's pixel radius without touching the camera,
    // so it needs its own hook. Debounced, because a drag-resize fires continuously
    // and each change costs a full refresh.
    var rzTimer = null;
    window.addEventListener("resize", function () {
      if (rzTimer) clearTimeout(rzTimer);
      rzTimer = setTimeout(function () { rzTimer = null; refreshSizeScale(); placeLogo(); }, 120);
    });

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
  }

  /* ------------------------------------------------------- group labels */


  /* ------------------------------------------------------------ tooltip */

  function showTip(id) {
    var a = graph.getNodeAttributes(id), t = $("tip");
    var p = renderer.graphToViewport({ x: a.x, y: a.y });
    t.innerHTML = '<div class="t">' + esc(a.label) + '</div>' +
      '<div class="m">' + esc(groupOf(id)) + ' &middot; ' + a.deg + ' link' + (a.deg === 1 ? "" : "s") +
      '<br>' + esc(a.ntype) + ' &middot; ' + esc(a.folder) +
      (a.sub ? ' / ' + esc(a.sub) : '') +
      '</div>';
    t.style.display = "block";
    // #canvas, NOT #stage: graphToViewport returns coordinates relative to
    // sigma's container, and the heatmap band means #stage's origin is now
    // above it. Measuring against #stage put every tooltip the height of the
    // band too low, and clamped it against the wrong bottom edge.
    var box = t.getBoundingClientRect(), st = $("canvas").getBoundingClientRect();
    var x = Math.min(p.x + 14, st.width - box.width - 8);
    var y = Math.min(Math.max(p.y - box.height - 10, 8), st.height - box.height - 8);
    t.style.left = x + "px"; t.style.top = y + "px";
  }
  function hideTip() { $("tip").style.display = "none"; }

  /* ------------------------------------------------------- detail panel */

  function select(id) {
    state.selected = id;
    var d = $("detail");
    if (!id) { d.style.display = "none"; renderer.refresh(); return; }

    var a = graph.getNodeAttributes(id);
    var nb = neighboursOf(id).slice().sort(function (p, q) {
      return graph.getNodeAttribute(q, "deg") - graph.getNodeAttribute(p, "deg");
    });
    var vault = encodeURIComponent(DATA.vault);
    var file = encodeURIComponent(a.path.replace(/\\.md$/, ""));

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

    d.innerHTML = h;
    d.style.display = "block";
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
    var names = order[state.dim] || [];
    $("gcount").textContent = "(" + names.length + ")";

    // Count notes per subfolder so the nested rows can show their size.
    var subCount = Object.create(null);
    // ...and the folder TREE, as "prefix -> { childName: count }" at every depth. Built
    // by walking each note's own \`dirs\` chain, so the legend's nesting comes from the
    // vault rather than from any assumed number of levels: a folder five deep renders
    // the same way as one a single level down.
    var kids = Object.create(null);
    if (state.dim === "folder") {
      graph.forEachNode(function (id, a) {
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
    var eyeSvg = function (on) {
      var lid = '<path d="M1.6 8S4 3.9 8 3.9 14.4 8 14.4 8 12 12.1 8 12.1 1.6 8 1.6 8z"' +
                ' fill="none" stroke="currentColor" stroke-width="1.25"/>';
      return '<svg viewBox="0 0 16 16" aria-hidden="true">' + lid +
        (on ? '<circle cx="8" cy="8" r="2" fill="currentColor"/>'
            : '<path d="M3 13L13 3" stroke="currentColor" stroke-width="1.25"/>') +
        '</svg>';
    };
    var eyeBtn = function (attrs, on, what) {
      return '<button class="eye" ' + attrs + ' aria-pressed="' + on + '" title="' +
             (on ? "Hide " : "Show ") + esc(what) + '">' + eyeSvg(on) + '</button>';
    };
    // A disclosure twisty, or an invisible placeholder so labels stay aligned.
    var twBtn = function (attrs, open) {
      return attrs
        ? '<button class="tw" ' + attrs + ' aria-expanded="' + open + '">' +
          (open ? "\u25BE" : "\u25B8") + '</button>'
        : '<span class="tw none">\u25B8</span>';
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

    $("legend").innerHTML = names.map(function (g) {
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
        '<span class="sw" style="background:' + colorOf(g) + '"></span>' +
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
          // under it -- that is how \`00 1 on 1\` keeps being one wedge of 62 notes AND
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
    }).join("");

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
      graph.forEachNode(function (id, a) {
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
      b.onclick = function () {
        var g = b.getAttribute("data-tw");
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
      b.onclick = function () {
        var g = b.getAttribute("data-eye");
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
    // re-collapsing there would throw away whatever the user had opened.
    if (!collapsedInit) { collapsedInit = true; collapseAll(); }
    // Fix the ring each group belongs to, from the whole data set, before
    // anything is filtered.
    if (!bandLock) {
      var base = buildWedgePlan(false);
      if (base) {
        bandLock = Object.create(null);
        base.cells.forEach(function (c) { bandLock[c.g] = c.inner; });
        // maxR is kept as well as the two band radii: the edge curvature needs to
        // know how big the disc is to judge which chords pass near its centre.
        geomLock = { r0: base.r0, rOuter: base.rOuter, maxR: base.maxR };

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
      if (!state.query) { hits.innerHTML = ""; renderer.refresh(); return; }
      var found = [];
      graph.forEachNode(function (id, a) {
        if (a.label.toLowerCase().indexOf(state.query) > -1) found.push(id);
      });
      found.sort(function (p, o) { return graph.getNodeAttribute(o, "deg") - graph.getNodeAttribute(p, "deg"); });
      hits.innerHTML = found.slice(0, 40).map(function (id) {
        return '<button data-hit="' + id + '">' + esc(graph.getNodeAttribute(id, "label")) +
               ' <span style="color:var(--text-3)">' + graph.getNodeAttribute(id, "deg") + '</span></button>';
      }).join("") || '<div style="color:var(--text-3);font-size:11px;padding:4px">No match</div>';
      Array.prototype.forEach.call(hits.querySelectorAll("[data-hit]"), function (b) {
        b.onclick = function () {
          var id = b.getAttribute("data-hit");
          q.value = ""; state.query = ""; hits.innerHTML = "";
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
    cancelAnimationFrame(play.raf);
    if (play.guard) clearTimeout(play.guard);   // or the deadline lands after a manual stop
    play = null;
    $("tlplay").textContent = "play";
  }

  // \`full\` forces a re-indexing refresh. Pass it on any frame that LANDS -- the end
  // of playback, or a jump to "all" -- and leave it off while scrubbing.
  //
  // It matters because curved edges take their curvature from node POSITIONS, and
  // the disc moves every frame of the timeline. skipIndexation does not re-upload
  // edge data, so the GPU keeps whatever curvature was computed when the edge
  // buffers were last built -- and if that was the \`until = 0\` frame, where
  // ringsLayout() returns null and positions are degenerate, every value collapses
  // to CURVE_MIN and the finished disc draws with visibly straight links. The edge
  // reducer still reports type "curve" the whole time, which is what makes this
  // invisible to measurement: the data is right and the buffer is stale.
  function timelineFrame(full) {
    // The timeline ALWAYS grows a ring: the disc keeps its full circle and simply
    // gets denser as notes arrive. This line is why -- \`fullRing\` was written in
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
    if (state.until === null || state.until >= tlMax) { el.textContent = "all"; return; }
    var i = Math.round(state.until) - 1;
    var d = tlDate[i < 0 ? 0 : i > tlDate.length - 1 ? tlDate.length - 1 : i] || "";
    el.textContent = d + "  \\u00b7  " + Math.round(state.until);
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
      cancelAnimationFrame(cascadeRun.raf);
      clearTimeout(cascadeRun.guard);
      cascadeRun = null;
    }
    if (anim) { cancelAnimationFrame(anim); anim = null; }
    if (animGuard) { clearTimeout(animGuard); animGuard = null; }
    pinnedPlan = null; planKeep = null;

    // Fixed length: TIMELINE_MS whatever the frame rate, so load, Refresh and Play
    // are the same few seconds every time. A slow page shows fewer steps of the
    // vault's growth rather than taking twice as long to get there.
    var dur = TIMELINE_MS * TIME_SCALE;
    state.until = 0;
    tl.value = "0";
    timelineFrame();
    $("tlplay").textContent = "stop";

    // Landing frame: re-index, so the edge buffers are rebuilt against the final
    // positions instead of keeping the curvature from the first frame.
    var land = function () {
      stopPlay();
      state.until = null;
      tl.value = String(tlMax);
      timelineFrame(true);
    };
    // WATCHDOG on stalled frames, not a deadline -- same reason as the tween's. A
    // \`setTimeout(land, dur + margin)\` would land the timeline early on any page too
    // slow to finish in time, snapping the vault to fully grown mid-playback. This
    // only fires once no frame has arrived for a while, which still covers a
    // backgrounded tab where rAF stops entirely.
    var lastFrame = NOW();
    var PLAY_STALL = 500;
    var playDog = function () {
      if (play && NOW() - lastFrame < PLAY_STALL) { play.guard = setTimeout(playDog, PLAY_STALL); return; }
      land();
    };
    var MIN_FRAMES = 20;
    var p = 0, tPrev = NOW();
    play = { raf: 0, guard: setTimeout(playDog, PLAY_STALL) };
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
      if (p < 1) play.raf = requestAnimationFrame(step);
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
    state.hidden[state.dim] = Object.create(null);
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
    $("q").value = "";    $("hits").innerHTML = "";
    $("tl").value = String(tlMax); $("tlv").textContent = "all";
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
    $("refresh").onclick = function () {
      resetView();
      fit();
      playTimeline();
    };
    $("fit").onclick = fit;
    $("png").onclick = savePng;
    // No theme toggle: the page is dark, always. \`<html data-theme="dark">\` is set in
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
  function fit() {
    renderer.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1.08, angle: 0 }, { duration: 380 });
  }

  function savePng() {
    var canvases = renderer.getCanvases();
    var src = canvases.nodes;
    var out = document.createElement("canvas");
    out.width = src.width; out.height = src.height;
    var ctx = out.getContext("2d");
    ctx.fillStyle = css("--surface-1");
    ctx.fillRect(0, 0, out.width, out.height);
    // The logo is a DOM overlay rather than one of Sigma's canvases, and it is CSS
    // masked, so it cannot be drawImage'd. It is rebuilt here instead: paint the same
    // ring gradient into a scratch canvas, then punch it to the mask's alpha with
    // \`destination-in\`. Drawn underneath the graph layers, matching the on-screen
    // stacking.
    var lg = $("logo");
    if (lg && logoMaskImg && logoMaskImg.complete && lg.style.display !== "none") {
      var w = parseFloat(lg.style.width) || 0;
      var dpr = src.width / ($("graph").clientWidth || src.width);
      if (w > 0) {
        var side = Math.round(w * dpr);
        // One masked layer. Same sweep as the CSS conic gradient (12 o'clock,
        // clockwise) drawn as filled wedges, because canvas has no conic gradient --
        // and a conic gradient is a fan of wedges anyway. Both paths take their
        // colours from ringColorsSmooth, so screen and export cannot drift.
        var layer = function (cols) {
          var lc = document.createElement("canvas");
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
    var a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "vault-graph.png";
    a.click();
  }

  function buildStats() {
    var s = DATA.stats;
    $("vname").textContent = DATA.vault + " graph";
    $("stats").innerHTML =
      "<b>" + s.nodes + "</b> notes &middot; <b>" + s.edges + "</b> links &middot; <b>" +
      s.orphans + "</b> unlinked<br>" +
      "<b>" + s.unresolved + "</b> link(s) point at notes that do not exist" +
      (s.ghostsIncluded ? " (shown as ghosts)" : " (hidden)") + "<br>" +
      (s.templatesExcluded ? "Templates excluded. " : "") +
      "Generated " + esc(DATA.generated);
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
  // WHICH DATE. \`created\` (frontmatter, falling back to \`date\`), which is the same
  // field the timeline ranks by -- so the band and the slider tell one story instead
  // of two. The two alternatives were measured and both are wrong for "added":
  //
  //   birthtime  472 of 934 files "born" today. OneDrive re-creates files on sync,
  //              so NTFS creation time says when this MACHINE first saw the file.
  //   mtime      2026-08-19 shows 240 files, which was the folder renumbering. It
  //              answers "what did I touch", which is what \`mark today\` wants and
  //              is not what this asks.
  //   created    894 valid of 916, and its big day (2026-06-27, 180 notes) is the
  //              initial import -- i.e. the day those notes really were added.
  //
  // WEEKS START MONDAY, because the vault's own weeks do: weekly reviews are filed
  // by ISO week, and an ISO week starts Monday. This is not GitHub's grid.
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

  // UTC throughout. \`created\` is a bare calendar date with no zone, and doing the
  // week arithmetic in local time means an hour of DST can slide a note into the
  // neighbouring column twice a year.
  function heatParse(s) {
    var m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(s || "");
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
  // Weeks are dropped BEFORE pixels: columns are how many fit at the smallest legible
  // cell, then the cell grows to fill what is actually there. So a wide window gets the
  // full year and a narrow one gets fewer weeks at a readable size -- never 52 weeks of
  // 3px smear, and never a scrollbar.
  function heatGeom() {
    var wrap = $("heatwrap");
    var avail = ((wrap && wrap.clientWidth) || $("stage").clientWidth || 900) - HEAT_GUTTER;
    avail -= HEAT_ARROW_W;
    var fits = Math.floor((avail + HEAT_GAP) / (HEAT_CELL_MIN + HEAT_GAP));
    var cols = Math.max(HEAT_WEEKS_MIN, Math.min(HEAT_WEEKS, fits));
    var cell = Math.floor((avail - (cols - 1) * HEAT_GAP) / cols);
    return { cols: cols, cell: Math.max(HEAT_CELL_MIN, Math.min(HEAT_CELL_MAX, cell)) };
  }

  function heatBuild() {
    var wrap = $("heatwrap"), cv = $("heatc");
    if (!wrap || !cv) return;

    var g = heatGeom();
    var cols = g.cols, cell = g.cell;
    var pitch = cell + HEAT_GAP;
    var start = heatMonday(heatParse(TODAY)) - (cols - 1) * WEEK_MS;

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
      dated: counts.length, mean: null,
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
      "last " + cols + " weeks \xB7 " + inWin + " of " + graph.order + " notes" +
      (before ? " \xB7 " + before + " earlier" : "") +
      (after ? " \xB7 " + after + " later" : "") +
      (undated ? " \xB7 " + undated + " undated" : "");

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

    // WHERE TODAY IS. Always the LAST column, by construction: \`start\` is
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
    }).join("  \xB7  ");
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
    t.innerHTML =
      '<div class="t">' + esc(d.key) + " \xB7 " + wd +
      (d.key === TODAY ? " \xB7 today" : "") + "</div>" +
      '<div class="m">' +
      (n ? n + " note" + (n === 1 ? "" : "s") + " added" : "nothing added") +
      (top.length ? "<br>" + top.map(function (g2) {
        return '<b style="color:' + colorOf(g2) + '">\u25A0</b> ' + esc(g2) + " " + by[g2];
      }).join("<br>") : "") +
      (n ? "<br><i>click to mark them on the disc</i>" : "") +
      "</div>";
    t.style.display = "block";
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
      if (d) heatShowTip(d); else $("htip").style.display = "none";
      cv.style.cursor = (d && d.n > 0.004) ? "pointer" : "default";
      setHover(d && d.n > 0.004 ? d.key : null);
    });
    cv.addEventListener("mouseleave", function () {
      $("htip").style.display = "none";
      setHover(null);
    });
    // Clicking a day marks its notes on the disc -- the same treatment as
    // \`mark today\`, and the whole reason the band sits above the rings rather than
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
    // re-derived whenever that width moves. A window \`resize\` listener is NOT
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
      if (heatRz) clearTimeout(heatRz);
      heatRz = setTimeout(function () {
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

  // A scripted walkthrough, for watching and for recording. \`?demo\` in the URL arms it.
  //
  // THE PAGE DOES NOT PERFORM THE INPUT. It publishes a storyboard and answers two
  // questions about itself -- where is that control, and are you still moving -- and a
  // driver outside the browser does the clicking through Chrome's DevTools protocol
  // (\`Input.dispatchMouseEvent\`). See \`scripts/demo.mjs\`.
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

  function demoOn() {
    return /(^|[?&#])demo\\b/.test(String(location.search) + " " + String(location.hash));
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
    if (/^#\\d+$/.test(spec)) return bySize[parseInt(spec.slice(1), 10) - 1] || null;
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
    if (kind === "only") {                      // the \`only\` chip on a group's row
      var row = demoFind("group", arg);
      return row ? row.querySelector(".only") : null;
    }
    if (kind === "note") return demoNoteRect(arg);
    if (kind === "day") return demoCellRect(heat && heat.days[arg]);
    if (kind === "busiest") {
      // Ranked by what is VISIBLE right now, not by membership -- \`n\` is the sum of the
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
      var r = (a.size || 4) * sizeScale;
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
    // need to: every target carries \`expect\`, and the driver compares it against what
    // actually got hovered and warns on a miss. Verifying the outcome is both stronger
    // than a bound and available at any density, so the most isolated candidate is
    // returned unconditionally and the check asserts where the pointer landed.
    //
    // \`bestGap\` is still reported, so how much clearance the aim actually had is
    // measurable rather than assumed.
    var box = Math.max(6, best.r * 1.5);
    return {
      left: best.x - box / 2, top: best.y - box / 2, width: box, height: box,
      // \`expect\` lets the driver confirm afterwards that the hover landed where it aimed.
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
      // Truncated: a control's \`title\` is help text, not a name -- Refresh's runs to
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
  // process. Three verbs so far:
  //   {settle}                     wait until nothing is animating
  //   {click, target:[kind, arg]}  move the real pointer there and click it
  //   {hover, target:[kind, arg]}  move there and stop, to let a hover state show
  // \`why\` is for the log and the eventual captions -- it is the only part of a beat a
  // person reads.
  function demoMode() {
    return [
      // The intro is a BEAT, not the page's own boot animation -- see the \`?demo\` branch
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
      { click: true, target: ["eye", "04"], why: "hide a folder \u2014 the wedges reallocate" },
      { settle: true, why: "let the wedges reallocate" },

      // The tree starts folded, so getting to a subfolder means opening its folder
      // first. That is the honest sequence and it is worth showing: the disc already
      // draws 03's sub-wedges, and this is where the legend admits they are there.
      // It is also load-bearing -- the row the next beat clicks does not exist until
      // this one has run.
      { click: true, target: ["twisty", "03"], why: "unfold a folder to reach its subfolders" },

      // Highlighting is a SEPARATE axis from visibility -- that is the whole point of
      // the eye being its own control -- so show it on a subfolder: People is the
      // biggest thing inside 03 and owns a sub-wedge of its own, which means it moves
      // as a block rather than just being ringed.
      { click: true, target: ["sub", "03/People"], why: "highlight one subfolder" },
      { settle: true, why: "let the sub-wedge push out" },
      { click: true, target: ["sub", "03/People"], why: "...and let it back down" },
      { settle: true, why: "let it settle back" },

      // The heatmap: hovering a day haloes the notes added that day, wherever they
      // landed on the disc. Ranked rather than dated, so this works on any vault and
      // never lands on a cell emptied by the hide above.
      { hover: true, target: ["busiest", "1"], why: "hover the busiest day" },
      { hover: true, target: ["busiest", "2"], why: "...and the next" },
      { hover: true, target: ["busiest", "3"], why: "...and the next" },

      // And \`only\`, which is the fastest way to answer "where does one folder live".
      { click: true, target: ["only", "08"], why: "solo a single folder" },
      { settle: true, why: "let everything else recede" }
    ];
  }

  // Everything the driver needs, and nothing it does not.
  var demoApi = {
    on: demoOn,
    doneTitle: DEMO_DONE_TITLE,
    storyboard: demoMode,
    busy: demoBusy,
    where: demoWhere,
    // What is hovered right now. The driver compares this against a target's \`expect\`
    // after a hover beat: aiming at a dot is only as good as the hit-test agreeing, and
    // a silent miss puts the wrong note's NAME on camera.
    hovered: function () { return state.hovered; },
    // Called by the driver when the last beat lands. The title is the signal on
    // purpose: a screen recorder outside the browser can poll a window title with no
    // debugging port of its own, no extension and nothing injected.
    finish: function (ms, trace) {
      window.__vgDemoDone = { ms: ms, trace: trace || [] };
      document.title = DEMO_DONE_TITLE;
      return true;
    }
  };

  /* ------------------------------------------------------------------ go */

  setTimeout(function () {
    makeRenderer();
    // Debug handle: lets a test page inspect live layout state from outside.
    window.__vg = { graph: graph, state: state, get renderer() { return renderer; },
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
                      return HEAT_CELL_MAX;
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
                      console.log(out);
                      return out;
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
                      Object.keys(a).forEach(function (k) { if (a[k] !== b[k]) diffs[k] = { withoutZeros: a[k], withZeros: b[k] }; });
                      var out = {
                        leanMaxR: Math.round(lean.maxR), paddedMaxR: Math.round(padded.maxR),
                        maxRMatches: Math.round(lean.maxR) === Math.round(padded.maxR),
                        cellsLean: lean.cells.length, cellsPadded: padded.cells.length,
                        rowDiffs: diffs,
                        invariantOK: Object.keys(diffs).length === 0 &&
                                     Math.round(lean.maxR) === Math.round(padded.maxR)
                      };
                      console.log(out);
                      return out;
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
                      console.log(out);
                      return out;
                    },
                    // Record each band's radial extent per animated frame. probe(true)
                    // then toggle, then probeReport() -- it names the biggest single
                    // frame step per band, which is what "a jump" actually is.
                    probe: function (on) {
                      probe = (on === false) ? null : { t0: NOW(), samples: [] };
                      return probe ? "recording" : "off";
                    },
                    probeReport: function () {
                      if (!probe || !probe.samples.length) return "nothing recorded -- call __vg.probe(true) first";
                      var s = probe.samples, worst = { inner: 0, outer: 0 }, at = { inner: 0, outer: 0 };
                      for (var i = 1; i < s.length; i++) {
                        var di = Math.abs(s[i].innerMax - s[i - 1].innerMax);
                        var doo = Math.abs(s[i].outerMax - s[i - 1].outerMax);
                        if (di > worst.inner) { worst.inner = di; at.inner = s[i].ms; }
                        if (doo > worst.outer) { worst.outer = doo; at.outer = s[i].ms; }
                      }
                      var out = {
                        frames: s.length,
                        spanMs: s[s.length - 1].ms,
                        innerMaxStep: worst.inner, innerStepAtMs: at.inner,
                        outerMaxStep: worst.outer, outerStepAtMs: at.outer,
                        first: s[0], last: s[s.length - 1], samples: s
                      };
                      console.log(out);
                      return out;
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
                      console.log(out);
                      return out;
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
    if (window.VAULT_LOGO_MASK) {
      var mu = 'url("' + window.VAULT_LOGO_MASK + '")';
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
      logoMaskImg.src = window.VAULT_LOGO_MASK;
    }
    regroup();
    // After regroup, because the band paints with nodeColor() and the sub-shade
    // ladder does not exist until buildColors() has run. Before playTimeline(),
    // so the band grows with the disc instead of appearing fully lit.
    buildHeatmapUI();
    heatBuild();
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
    // timelineFrame(true) is the resting full disc: \`until\` is null by default, so every
    // note is present and the layout is derived once, with no animation.
    if (demoOn()) {
      timelineFrame(true);
      if (window.console) {
        console.log("[demo] armed at rest: " + demoMode().length +
                    " beats. Run scripts/demo.mjs to drive it (CDP does the input).");
      }
    } else {
      playTimeline();
    }
    $("busy").style.display = "none";
  }, 20);
})();
<\/script>
</body>
</html>
`;

// raw::C:\git-personal\worktrees\vault-graph-plugin\vendor\graphology.umd.min.js
var graphology_umd_min_default = `!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):(t="undefined"!=typeof globalThis?globalThis:t||self).graphology=e()}(this,(function(){"use strict";function t(t){if(void 0===t)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return t}function e(t,e,n){return(e=function(t){var e=function(t,e){if("object"!=typeof t||!t)return t;var n=t[Symbol.toPrimitive];if(void 0!==n){var r=n.call(t,e||"default");if("object"!=typeof r)return r;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===e?String:Number)(t)}(t,"string");return"symbol"==typeof e?e:e+""}(e))in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function n(t){return n=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(t){return t.__proto__||Object.getPrototypeOf(t)},n(t)}function r(t,e){t.prototype=Object.create(e.prototype),t.prototype.constructor=t,o(t,e)}function i(){try{var t=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],(function(){})))}catch(t){}return(i=function(){return!!t})()}function o(t,e){return o=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(t,e){return t.__proto__=e,t},o(t,e)}function a(t){return a="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"==typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},a(t)}function c(t){var e="function"==typeof Map?new Map:void 0;return c=function(t){if(null===t||!function(t){try{return-1!==Function.toString.call(t).indexOf("[native code]")}catch(e){return"function"==typeof t}}(t))return t;if("function"!=typeof t)throw new TypeError("Super expression must either be null or a function");if(void 0!==e){if(e.has(t))return e.get(t);e.set(t,r)}function r(){return function(t,e,n){if(i())return Reflect.construct.apply(null,arguments);var r=[null];r.push.apply(r,e);var a=new(t.bind.apply(t,r));return n&&o(a,n.prototype),a}(t,arguments,n(this).constructor)}return r.prototype=Object.create(t.prototype,{constructor:{value:r,enumerable:!1,writable:!0,configurable:!0}}),o(r,t)},c(t)}var u=function(){for(var t=arguments[0],e=1,n=arguments.length;e<n;e++)if(arguments[e])for(var r in arguments[e])t[r]=arguments[e][r];return t};function d(t,e,n,r){var i=t._nodes.get(e),o=null;return i?o="mixed"===r?i.out&&i.out[n]||i.undirected&&i.undirected[n]:"directed"===r?i.out&&i.out[n]:i.undirected&&i.undirected[n]:o}function s(t){return"object"===a(t)&&null!==t}function h(t){var e;for(e in t)return!1;return!0}function p(t,e,n){Object.defineProperty(t,e,{enumerable:!1,configurable:!1,writable:!0,value:n})}function f(t,e,n){var r={enumerable:!0,configurable:!0};"function"==typeof n?r.get=n:(r.value=n,r.writable=!1),Object.defineProperty(t,e,r)}function l(t){return!!s(t)&&!(t.attributes&&!Array.isArray(t.attributes))}function g(){var t=arguments,n=null,r=-1;return e(e({},Symbol.iterator,(function(){return this})),"next",(function(){for(var e=null;;){if(null===n){if(++r>=t.length)return{done:!0};n=t[r][Symbol.iterator]()}if(!(e=n.next()).done)break;n=null}return e}))}function y(){return e(e({},Symbol.iterator,(function(){return this})),"next",(function(){return{done:!0}}))}"function"==typeof Object.assign&&(u=Object.assign);var w,v={exports:{}},b="object"==typeof Reflect?Reflect:null,m=b&&"function"==typeof b.apply?b.apply:function(t,e,n){return Function.prototype.apply.call(t,e,n)};w=b&&"function"==typeof b.ownKeys?b.ownKeys:Object.getOwnPropertySymbols?function(t){return Object.getOwnPropertyNames(t).concat(Object.getOwnPropertySymbols(t))}:function(t){return Object.getOwnPropertyNames(t)};var k=Number.isNaN||function(t){return t!=t};function _(){_.init.call(this)}v.exports=_,v.exports.once=function(t,e){return new Promise((function(n,r){function i(n){t.removeListener(e,o),r(n)}function o(){"function"==typeof t.removeListener&&t.removeListener("error",i),n([].slice.call(arguments))}j(t,e,o,{once:!0}),"error"!==e&&function(t,e,n){"function"==typeof t.on&&j(t,"error",e,n)}(t,i,{once:!0})}))},_.EventEmitter=_,_.prototype._events=void 0,_.prototype._eventsCount=0,_.prototype._maxListeners=void 0;var G=10;function x(t){if("function"!=typeof t)throw new TypeError('The "listener" argument must be of type Function. Received type '+typeof t)}function E(t){return void 0===t._maxListeners?_.defaultMaxListeners:t._maxListeners}function A(t,e,n,r){var i,o,a,c;if(x(n),void 0===(o=t._events)?(o=t._events=Object.create(null),t._eventsCount=0):(void 0!==o.newListener&&(t.emit("newListener",e,n.listener?n.listener:n),o=t._events),a=o[e]),void 0===a)a=o[e]=n,++t._eventsCount;else if("function"==typeof a?a=o[e]=r?[n,a]:[a,n]:r?a.unshift(n):a.push(n),(i=E(t))>0&&a.length>i&&!a.warned){a.warned=!0;var u=new Error("Possible EventEmitter memory leak detected. "+a.length+" "+String(e)+" listeners added. Use emitter.setMaxListeners() to increase limit");u.name="MaxListenersExceededWarning",u.emitter=t,u.type=e,u.count=a.length,c=u,console&&console.warn&&console.warn(c)}return t}function L(){if(!this.fired)return this.target.removeListener(this.type,this.wrapFn),this.fired=!0,0===arguments.length?this.listener.call(this.target):this.listener.apply(this.target,arguments)}function S(t,e,n){var r={fired:!1,wrapFn:void 0,target:t,type:e,listener:n},i=L.bind(r);return i.listener=n,r.wrapFn=i,i}function D(t,e,n){var r=t._events;if(void 0===r)return[];var i=r[e];return void 0===i?[]:"function"==typeof i?n?[i.listener||i]:[i]:n?function(t){for(var e=new Array(t.length),n=0;n<e.length;++n)e[n]=t[n].listener||t[n];return e}(i):N(i,i.length)}function U(t){var e=this._events;if(void 0!==e){var n=e[t];if("function"==typeof n)return 1;if(void 0!==n)return n.length}return 0}function N(t,e){for(var n=new Array(e),r=0;r<e;++r)n[r]=t[r];return n}function j(t,e,n,r){if("function"==typeof t.on)r.once?t.once(e,n):t.on(e,n);else{if("function"!=typeof t.addEventListener)throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type '+typeof t);t.addEventListener(e,(function i(o){r.once&&t.removeEventListener(e,i),n(o)}))}}Object.defineProperty(_,"defaultMaxListeners",{enumerable:!0,get:function(){return G},set:function(t){if("number"!=typeof t||t<0||k(t))throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received '+t+".");G=t}}),_.init=function(){void 0!==this._events&&this._events!==Object.getPrototypeOf(this)._events||(this._events=Object.create(null),this._eventsCount=0),this._maxListeners=this._maxListeners||void 0},_.prototype.setMaxListeners=function(t){if("number"!=typeof t||t<0||k(t))throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received '+t+".");return this._maxListeners=t,this},_.prototype.getMaxListeners=function(){return E(this)},_.prototype.emit=function(t){for(var e=[],n=1;n<arguments.length;n++)e.push(arguments[n]);var r="error"===t,i=this._events;if(void 0!==i)r=r&&void 0===i.error;else if(!r)return!1;if(r){var o;if(e.length>0&&(o=e[0]),o instanceof Error)throw o;var a=new Error("Unhandled error."+(o?" ("+o.message+")":""));throw a.context=o,a}var c=i[t];if(void 0===c)return!1;if("function"==typeof c)m(c,this,e);else{var u=c.length,d=N(c,u);for(n=0;n<u;++n)m(d[n],this,e)}return!0},_.prototype.addListener=function(t,e){return A(this,t,e,!1)},_.prototype.on=_.prototype.addListener,_.prototype.prependListener=function(t,e){return A(this,t,e,!0)},_.prototype.once=function(t,e){return x(e),this.on(t,S(this,t,e)),this},_.prototype.prependOnceListener=function(t,e){return x(e),this.prependListener(t,S(this,t,e)),this},_.prototype.removeListener=function(t,e){var n,r,i,o,a;if(x(e),void 0===(r=this._events))return this;if(void 0===(n=r[t]))return this;if(n===e||n.listener===e)0==--this._eventsCount?this._events=Object.create(null):(delete r[t],r.removeListener&&this.emit("removeListener",t,n.listener||e));else if("function"!=typeof n){for(i=-1,o=n.length-1;o>=0;o--)if(n[o]===e||n[o].listener===e){a=n[o].listener,i=o;break}if(i<0)return this;0===i?n.shift():function(t,e){for(;e+1<t.length;e++)t[e]=t[e+1];t.pop()}(n,i),1===n.length&&(r[t]=n[0]),void 0!==r.removeListener&&this.emit("removeListener",t,a||e)}return this},_.prototype.off=_.prototype.removeListener,_.prototype.removeAllListeners=function(t){var e,n,r;if(void 0===(n=this._events))return this;if(void 0===n.removeListener)return 0===arguments.length?(this._events=Object.create(null),this._eventsCount=0):void 0!==n[t]&&(0==--this._eventsCount?this._events=Object.create(null):delete n[t]),this;if(0===arguments.length){var i,o=Object.keys(n);for(r=0;r<o.length;++r)"removeListener"!==(i=o[r])&&this.removeAllListeners(i);return this.removeAllListeners("removeListener"),this._events=Object.create(null),this._eventsCount=0,this}if("function"==typeof(e=n[t]))this.removeListener(t,e);else if(void 0!==e)for(r=e.length-1;r>=0;r--)this.removeListener(t,e[r]);return this},_.prototype.listeners=function(t){return D(this,t,!0)},_.prototype.rawListeners=function(t){return D(this,t,!1)},_.listenerCount=function(t,e){return"function"==typeof t.listenerCount?t.listenerCount(e):U.call(t,e)},_.prototype.listenerCount=U,_.prototype.eventNames=function(){return this._eventsCount>0?w(this._events):[]};var O=function(t){function e(e){var n;return(n=t.call(this)||this).name="GraphError",n.message=e,n}return r(e,t),e}(c(Error)),C=function(e){function n(r){var i;return(i=e.call(this,r)||this).name="InvalidArgumentsGraphError","function"==typeof Error.captureStackTrace&&Error.captureStackTrace(t(i),n.prototype.constructor),i}return r(n,e),n}(O),M=function(e){function n(r){var i;return(i=e.call(this,r)||this).name="NotFoundGraphError","function"==typeof Error.captureStackTrace&&Error.captureStackTrace(t(i),n.prototype.constructor),i}return r(n,e),n}(O),z=function(e){function n(r){var i;return(i=e.call(this,r)||this).name="UsageGraphError","function"==typeof Error.captureStackTrace&&Error.captureStackTrace(t(i),n.prototype.constructor),i}return r(n,e),n}(O);function W(t,e){this.key=t,this.attributes=e,this.clear()}function P(t,e){this.key=t,this.attributes=e,this.clear()}function K(t,e){this.key=t,this.attributes=e,this.clear()}function T(t,e,n,r,i){this.key=e,this.attributes=i,this.undirected=t,this.source=n,this.target=r}W.prototype.clear=function(){this.inDegree=0,this.outDegree=0,this.undirectedDegree=0,this.undirectedLoops=0,this.directedLoops=0,this.in={},this.out={},this.undirected={}},P.prototype.clear=function(){this.inDegree=0,this.outDegree=0,this.directedLoops=0,this.in={},this.out={}},K.prototype.clear=function(){this.undirectedDegree=0,this.undirectedLoops=0,this.undirected={}},T.prototype.attach=function(){var t="out",e="in";this.undirected&&(t=e="undirected");var n=this.source.key,r=this.target.key;this.source[t][r]=this,this.undirected&&n===r||(this.target[e][n]=this)},T.prototype.attachMulti=function(){var t="out",e="in",n=this.source.key,r=this.target.key;this.undirected&&(t=e="undirected");var i=this.source[t],o=i[r];if(void 0===o)return i[r]=this,void(this.undirected&&n===r||(this.target[e][n]=this));o.previous=this,this.next=o,i[r]=this,this.target[e][n]=this},T.prototype.detach=function(){var t=this.source.key,e=this.target.key,n="out",r="in";this.undirected&&(n=r="undirected"),delete this.source[n][e],delete this.target[r][t]},T.prototype.detachMulti=function(){var t=this.source.key,e=this.target.key,n="out",r="in";this.undirected&&(n=r="undirected"),void 0===this.previous?void 0===this.next?(delete this.source[n][e],delete this.target[r][t]):(this.next.previous=void 0,this.source[n][e]=this.next,this.target[r][t]=this.next):(this.previous.next=this.next,void 0!==this.next&&(this.next.previous=this.previous))};var I=0,R=1,F=3;function B(t,e,n,r,i,o,a){var c,u,d,s;if(r=""+r,n===I){if(!(c=t._nodes.get(r)))throw new M("Graph.".concat(e,': could not find the "').concat(r,'" node in the graph.'));d=i,s=o}else if(n===F){if(i=""+i,!(u=t._edges.get(i)))throw new M("Graph.".concat(e,': could not find the "').concat(i,'" edge in the graph.'));var h=u.source.key,p=u.target.key;if(r===h)c=u.target;else{if(r!==p)throw new M("Graph.".concat(e,': the "').concat(r,'" node is not attached to the "').concat(i,'" edge (').concat(h,", ").concat(p,")."));c=u.source}d=o,s=a}else{if(!(u=t._edges.get(r)))throw new M("Graph.".concat(e,': could not find the "').concat(r,'" edge in the graph.'));c=n===R?u.source:u.target,d=i,s=o}return[c,d,s]}var Y=[{name:function(t){return"get".concat(t,"Attribute")},attacher:function(t,e,n){t.prototype[e]=function(t,r,i){var o=B(this,e,n,t,r,i),a=o[0],c=o[1];return a.attributes[c]}}},{name:function(t){return"get".concat(t,"Attributes")},attacher:function(t,e,n){t.prototype[e]=function(t,r){return B(this,e,n,t,r)[0].attributes}}},{name:function(t){return"has".concat(t,"Attribute")},attacher:function(t,e,n){t.prototype[e]=function(t,r,i){var o=B(this,e,n,t,r,i),a=o[0],c=o[1];return a.attributes.hasOwnProperty(c)}}},{name:function(t){return"set".concat(t,"Attribute")},attacher:function(t,e,n){t.prototype[e]=function(t,r,i,o){var a=B(this,e,n,t,r,i,o),c=a[0],u=a[1],d=a[2];return c.attributes[u]=d,this.emit("nodeAttributesUpdated",{key:c.key,type:"set",attributes:c.attributes,name:u}),this}}},{name:function(t){return"update".concat(t,"Attribute")},attacher:function(t,e,n){t.prototype[e]=function(t,r,i,o){var a=B(this,e,n,t,r,i,o),c=a[0],u=a[1],d=a[2];if("function"!=typeof d)throw new C("Graph.".concat(e,": updater should be a function."));var s=c.attributes,h=d(s[u]);return s[u]=h,this.emit("nodeAttributesUpdated",{key:c.key,type:"set",attributes:c.attributes,name:u}),this}}},{name:function(t){return"remove".concat(t,"Attribute")},attacher:function(t,e,n){t.prototype[e]=function(t,r,i){var o=B(this,e,n,t,r,i),a=o[0],c=o[1];return delete a.attributes[c],this.emit("nodeAttributesUpdated",{key:a.key,type:"remove",attributes:a.attributes,name:c}),this}}},{name:function(t){return"replace".concat(t,"Attributes")},attacher:function(t,e,n){t.prototype[e]=function(t,r,i){var o=B(this,e,n,t,r,i),a=o[0],c=o[1];if(!s(c))throw new C("Graph.".concat(e,": provided attributes are not a plain object."));return a.attributes=c,this.emit("nodeAttributesUpdated",{key:a.key,type:"replace",attributes:a.attributes}),this}}},{name:function(t){return"merge".concat(t,"Attributes")},attacher:function(t,e,n){t.prototype[e]=function(t,r,i){var o=B(this,e,n,t,r,i),a=o[0],c=o[1];if(!s(c))throw new C("Graph.".concat(e,": provided attributes are not a plain object."));return u(a.attributes,c),this.emit("nodeAttributesUpdated",{key:a.key,type:"merge",attributes:a.attributes,data:c}),this}}},{name:function(t){return"update".concat(t,"Attributes")},attacher:function(t,e,n){t.prototype[e]=function(t,r,i){var o=B(this,e,n,t,r,i),a=o[0],c=o[1];if("function"!=typeof c)throw new C("Graph.".concat(e,": provided updater is not a function."));return a.attributes=c(a.attributes),this.emit("nodeAttributesUpdated",{key:a.key,type:"update",attributes:a.attributes}),this}}}];var J=[{name:function(t){return"get".concat(t,"Attribute")},attacher:function(t,e,n){t.prototype[e]=function(t,r){var i;if("mixed"!==this.type&&"mixed"!==n&&n!==this.type)throw new z("Graph.".concat(e,": cannot find this type of edges in your ").concat(this.type," graph."));if(arguments.length>2){if(this.multi)throw new z("Graph.".concat(e,": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));var o=""+t,a=""+r;if(r=arguments[2],!(i=d(this,o,a,n)))throw new M("Graph.".concat(e,': could not find an edge for the given path ("').concat(o,'" - "').concat(a,'").'))}else{if("mixed"!==n)throw new z("Graph.".concat(e,": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));if(t=""+t,!(i=this._edges.get(t)))throw new M("Graph.".concat(e,': could not find the "').concat(t,'" edge in the graph.'))}return i.attributes[r]}}},{name:function(t){return"get".concat(t,"Attributes")},attacher:function(t,e,n){t.prototype[e]=function(t){var r;if("mixed"!==this.type&&"mixed"!==n&&n!==this.type)throw new z("Graph.".concat(e,": cannot find this type of edges in your ").concat(this.type," graph."));if(arguments.length>1){if(this.multi)throw new z("Graph.".concat(e,": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));var i=""+t,o=""+arguments[1];if(!(r=d(this,i,o,n)))throw new M("Graph.".concat(e,': could not find an edge for the given path ("').concat(i,'" - "').concat(o,'").'))}else{if("mixed"!==n)throw new z("Graph.".concat(e,": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));if(t=""+t,!(r=this._edges.get(t)))throw new M("Graph.".concat(e,': could not find the "').concat(t,'" edge in the graph.'))}return r.attributes}}},{name:function(t){return"has".concat(t,"Attribute")},attacher:function(t,e,n){t.prototype[e]=function(t,r){var i;if("mixed"!==this.type&&"mixed"!==n&&n!==this.type)throw new z("Graph.".concat(e,": cannot find this type of edges in your ").concat(this.type," graph."));if(arguments.length>2){if(this.multi)throw new z("Graph.".concat(e,": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));var o=""+t,a=""+r;if(r=arguments[2],!(i=d(this,o,a,n)))throw new M("Graph.".concat(e,': could not find an edge for the given path ("').concat(o,'" - "').concat(a,'").'))}else{if("mixed"!==n)throw new z("Graph.".concat(e,": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));if(t=""+t,!(i=this._edges.get(t)))throw new M("Graph.".concat(e,': could not find the "').concat(t,'" edge in the graph.'))}return i.attributes.hasOwnProperty(r)}}},{name:function(t){return"set".concat(t,"Attribute")},attacher:function(t,e,n){t.prototype[e]=function(t,r,i){var o;if("mixed"!==this.type&&"mixed"!==n&&n!==this.type)throw new z("Graph.".concat(e,": cannot find this type of edges in your ").concat(this.type," graph."));if(arguments.length>3){if(this.multi)throw new z("Graph.".concat(e,": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));var a=""+t,c=""+r;if(r=arguments[2],i=arguments[3],!(o=d(this,a,c,n)))throw new M("Graph.".concat(e,': could not find an edge for the given path ("').concat(a,'" - "').concat(c,'").'))}else{if("mixed"!==n)throw new z("Graph.".concat(e,": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));if(t=""+t,!(o=this._edges.get(t)))throw new M("Graph.".concat(e,': could not find the "').concat(t,'" edge in the graph.'))}return o.attributes[r]=i,this.emit("edgeAttributesUpdated",{key:o.key,type:"set",attributes:o.attributes,name:r}),this}}},{name:function(t){return"update".concat(t,"Attribute")},attacher:function(t,e,n){t.prototype[e]=function(t,r,i){var o;if("mixed"!==this.type&&"mixed"!==n&&n!==this.type)throw new z("Graph.".concat(e,": cannot find this type of edges in your ").concat(this.type," graph."));if(arguments.length>3){if(this.multi)throw new z("Graph.".concat(e,": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));var a=""+t,c=""+r;if(r=arguments[2],i=arguments[3],!(o=d(this,a,c,n)))throw new M("Graph.".concat(e,': could not find an edge for the given path ("').concat(a,'" - "').concat(c,'").'))}else{if("mixed"!==n)throw new z("Graph.".concat(e,": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));if(t=""+t,!(o=this._edges.get(t)))throw new M("Graph.".concat(e,': could not find the "').concat(t,'" edge in the graph.'))}if("function"!=typeof i)throw new C("Graph.".concat(e,": updater should be a function."));return o.attributes[r]=i(o.attributes[r]),this.emit("edgeAttributesUpdated",{key:o.key,type:"set",attributes:o.attributes,name:r}),this}}},{name:function(t){return"remove".concat(t,"Attribute")},attacher:function(t,e,n){t.prototype[e]=function(t,r){var i;if("mixed"!==this.type&&"mixed"!==n&&n!==this.type)throw new z("Graph.".concat(e,": cannot find this type of edges in your ").concat(this.type," graph."));if(arguments.length>2){if(this.multi)throw new z("Graph.".concat(e,": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));var o=""+t,a=""+r;if(r=arguments[2],!(i=d(this,o,a,n)))throw new M("Graph.".concat(e,': could not find an edge for the given path ("').concat(o,'" - "').concat(a,'").'))}else{if("mixed"!==n)throw new z("Graph.".concat(e,": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));if(t=""+t,!(i=this._edges.get(t)))throw new M("Graph.".concat(e,': could not find the "').concat(t,'" edge in the graph.'))}return delete i.attributes[r],this.emit("edgeAttributesUpdated",{key:i.key,type:"remove",attributes:i.attributes,name:r}),this}}},{name:function(t){return"replace".concat(t,"Attributes")},attacher:function(t,e,n){t.prototype[e]=function(t,r){var i;if("mixed"!==this.type&&"mixed"!==n&&n!==this.type)throw new z("Graph.".concat(e,": cannot find this type of edges in your ").concat(this.type," graph."));if(arguments.length>2){if(this.multi)throw new z("Graph.".concat(e,": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));var o=""+t,a=""+r;if(r=arguments[2],!(i=d(this,o,a,n)))throw new M("Graph.".concat(e,': could not find an edge for the given path ("').concat(o,'" - "').concat(a,'").'))}else{if("mixed"!==n)throw new z("Graph.".concat(e,": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));if(t=""+t,!(i=this._edges.get(t)))throw new M("Graph.".concat(e,': could not find the "').concat(t,'" edge in the graph.'))}if(!s(r))throw new C("Graph.".concat(e,": provided attributes are not a plain object."));return i.attributes=r,this.emit("edgeAttributesUpdated",{key:i.key,type:"replace",attributes:i.attributes}),this}}},{name:function(t){return"merge".concat(t,"Attributes")},attacher:function(t,e,n){t.prototype[e]=function(t,r){var i;if("mixed"!==this.type&&"mixed"!==n&&n!==this.type)throw new z("Graph.".concat(e,": cannot find this type of edges in your ").concat(this.type," graph."));if(arguments.length>2){if(this.multi)throw new z("Graph.".concat(e,": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));var o=""+t,a=""+r;if(r=arguments[2],!(i=d(this,o,a,n)))throw new M("Graph.".concat(e,': could not find an edge for the given path ("').concat(o,'" - "').concat(a,'").'))}else{if("mixed"!==n)throw new z("Graph.".concat(e,": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));if(t=""+t,!(i=this._edges.get(t)))throw new M("Graph.".concat(e,': could not find the "').concat(t,'" edge in the graph.'))}if(!s(r))throw new C("Graph.".concat(e,": provided attributes are not a plain object."));return u(i.attributes,r),this.emit("edgeAttributesUpdated",{key:i.key,type:"merge",attributes:i.attributes,data:r}),this}}},{name:function(t){return"update".concat(t,"Attributes")},attacher:function(t,e,n){t.prototype[e]=function(t,r){var i;if("mixed"!==this.type&&"mixed"!==n&&n!==this.type)throw new z("Graph.".concat(e,": cannot find this type of edges in your ").concat(this.type," graph."));if(arguments.length>2){if(this.multi)throw new z("Graph.".concat(e,": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));var o=""+t,a=""+r;if(r=arguments[2],!(i=d(this,o,a,n)))throw new M("Graph.".concat(e,': could not find an edge for the given path ("').concat(o,'" - "').concat(a,'").'))}else{if("mixed"!==n)throw new z("Graph.".concat(e,": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));if(t=""+t,!(i=this._edges.get(t)))throw new M("Graph.".concat(e,': could not find the "').concat(t,'" edge in the graph.'))}if("function"!=typeof r)throw new C("Graph.".concat(e,": provided updater is not a function."));return i.attributes=r(i.attributes),this.emit("edgeAttributesUpdated",{key:i.key,type:"update",attributes:i.attributes}),this}}}];var q=[{name:"edges",type:"mixed"},{name:"inEdges",type:"directed",direction:"in"},{name:"outEdges",type:"directed",direction:"out"},{name:"inboundEdges",type:"mixed",direction:"in"},{name:"outboundEdges",type:"mixed",direction:"out"},{name:"directedEdges",type:"directed"},{name:"undirectedEdges",type:"undirected"}];function H(t,e,n,r){var i=!1;for(var o in e)if(o!==r){var a=e[o];if(i=n(a.key,a.attributes,a.source.key,a.target.key,a.source.attributes,a.target.attributes,a.undirected),t&&i)return a.key}}function Q(t,e,n,r){var i,o,a,c=!1;for(var u in e)if(u!==r){i=e[u];do{if(o=i.source,a=i.target,c=n(i.key,i.attributes,o.key,a.key,o.attributes,a.attributes,i.undirected),t&&c)return i.key;i=i.next}while(void 0!==i)}}function V(t,n){var r,i=Object.keys(t),o=i.length,a=0;return e(e({},Symbol.iterator,(function(){return this})),"next",(function(){do{if(r)r=r.next;else{if(a>=o)return{done:!0};var e=i[a++];if(e===n){r=void 0;continue}r=t[e]}}while(!r);return{done:!1,value:{edge:r.key,attributes:r.attributes,source:r.source.key,target:r.target.key,sourceAttributes:r.source.attributes,targetAttributes:r.target.attributes,undirected:r.undirected}}}))}function X(t,e,n,r){var i=e[n];if(i){var o=i.source,a=i.target;return r(i.key,i.attributes,o.key,a.key,o.attributes,a.attributes,i.undirected)&&t?i.key:void 0}}function Z(t,e,n,r){var i=e[n];if(i){var o=!1;do{if(o=r(i.key,i.attributes,i.source.key,i.target.key,i.source.attributes,i.target.attributes,i.undirected),t&&o)return i.key;i=i.next}while(void 0!==i)}}function $(t,n){var r=t[n];if(void 0!==r.next)return e(e({},Symbol.iterator,(function(){return this})),"next",(function(){if(!r)return{done:!0};var t={edge:r.key,attributes:r.attributes,source:r.source.key,target:r.target.key,sourceAttributes:r.source.attributes,targetAttributes:r.target.attributes,undirected:r.undirected};return r=r.next,{done:!1,value:t}}));var i=!1;return e(e({},Symbol.iterator,(function(){return this})),"next",(function(){return!0===i?{done:!0}:(i=!0,{done:!1,value:{edge:r.key,attributes:r.attributes,source:r.source.key,target:r.target.key,sourceAttributes:r.source.attributes,targetAttributes:r.target.attributes,undirected:r.undirected}})}))}function tt(t,e,n,r){if(0!==e.size)for(var i,o,a="mixed"!==n&&n!==e.type,c="undirected"===n,u=!1,d=e._edges.values();!0!==(i=d.next()).done;)if(o=i.value,!a||o.undirected===c){var s=o,h=s.key,p=s.attributes,f=s.source,l=s.target;if(u=r(h,p,f.key,l.key,f.attributes,l.attributes,o.undirected),t&&u)return h}}function et(t,e,n,r,i,o){var a,c=e?Q:H;if("undirected"!==n){if("out"!==r&&(a=c(t,i.in,o),t&&a))return a;if("in"!==r&&(a=c(t,i.out,o,r?void 0:i.key),t&&a))return a}if("directed"!==n&&(a=c(t,i.undirected,o),t&&a))return a}function nt(t,e,n,r,i,o,a){var c,u=n?Z:X;if("undirected"!==e){if(void 0!==i.in&&"out"!==r&&(c=u(t,i.in,o,a),t&&c))return c;if(void 0!==i.out&&"in"!==r&&(r||i.key!==o)&&(c=u(t,i.out,o,a),t&&c))return c}if("directed"!==e&&void 0!==i.undirected&&(c=u(t,i.undirected,o,a),t&&c))return c}function rt(t,e){var n=e.name,r=e.type,i=e.direction;t.prototype[n]=function(t,e){if("mixed"!==r&&"mixed"!==this.type&&r!==this.type)return[];if(!arguments.length)return function(t,e){if(0===t.size)return[];if("mixed"===e||e===t.type)return Array.from(t._edges.keys());for(var n,r,i="undirected"===e?t.undirectedSize:t.directedSize,o=new Array(i),a="undirected"===e,c=t._edges.values(),u=0;!0!==(n=c.next()).done;)(r=n.value).undirected===a&&(o[u++]=r.key);return o}(this,r);if(1===arguments.length){t=""+t;var o=this._nodes.get(t);if(void 0===o)throw new M("Graph.".concat(n,': could not find the "').concat(t,'" node in the graph.'));return function(t,e,n,r){var i=[];return et(!1,t,e,n,r,(function(t){i.push(t)})),i}(this.multi,"mixed"===r?this.type:r,i,o)}if(2===arguments.length){t=""+t,e=""+e;var a=this._nodes.get(t);if(!a)throw new M("Graph.".concat(n,':  could not find the "').concat(t,'" source node in the graph.'));if(!this._nodes.has(e))throw new M("Graph.".concat(n,':  could not find the "').concat(e,'" target node in the graph.'));return function(t,e,n,r,i){var o=[];return nt(!1,t,e,n,r,i,(function(t){o.push(t)})),o}(r,this.multi,i,a,e)}throw new C("Graph.".concat(n,": too many arguments (expecting 0, 1 or 2 and got ").concat(arguments.length,")."))}}function it(t,n){var r=n.name,i=n.type,o=n.direction,a=r.slice(0,-1)+"Entries";t.prototype[a]=function(t,n){if("mixed"!==i&&"mixed"!==this.type&&i!==this.type)return y();if(!arguments.length)return function(t,n){if(0===t.size)return y();var r="mixed"!==n&&n!==t.type,i="undirected"===n,o=t._edges.values();return e(e({},Symbol.iterator,(function(){return this})),"next",(function(){for(var t,e;;){if((t=o.next()).done)return t;if(e=t.value,!r||e.undirected===i)break}return{value:{edge:e.key,attributes:e.attributes,source:e.source.key,target:e.target.key,sourceAttributes:e.source.attributes,targetAttributes:e.target.attributes,undirected:e.undirected},done:!1}}))}(this,i);if(1===arguments.length){t=""+t;var r=this._nodes.get(t);if(!r)throw new M("Graph.".concat(a,': could not find the "').concat(t,'" node in the graph.'));return function(t,e,n){var r=y();return"undirected"!==t&&("out"!==e&&void 0!==n.in&&(r=g(r,V(n.in))),"in"!==e&&void 0!==n.out&&(r=g(r,V(n.out,e?void 0:n.key)))),"directed"!==t&&void 0!==n.undirected&&(r=g(r,V(n.undirected))),r}(i,o,r)}if(2===arguments.length){t=""+t,n=""+n;var c=this._nodes.get(t);if(!c)throw new M("Graph.".concat(a,':  could not find the "').concat(t,'" source node in the graph.'));if(!this._nodes.has(n))throw new M("Graph.".concat(a,':  could not find the "').concat(n,'" target node in the graph.'));return function(t,e,n,r){var i=y();return"undirected"!==t&&(void 0!==n.in&&"out"!==e&&r in n.in&&(i=g(i,$(n.in,r))),void 0!==n.out&&"in"!==e&&r in n.out&&(e||n.key!==r)&&(i=g(i,$(n.out,r)))),"directed"!==t&&void 0!==n.undirected&&r in n.undirected&&(i=g(i,$(n.undirected,r))),i}(i,o,c,n)}throw new C("Graph.".concat(a,": too many arguments (expecting 0, 1 or 2 and got ").concat(arguments.length,")."))}}var ot=[{name:"neighbors",type:"mixed"},{name:"inNeighbors",type:"directed",direction:"in"},{name:"outNeighbors",type:"directed",direction:"out"},{name:"inboundNeighbors",type:"mixed",direction:"in"},{name:"outboundNeighbors",type:"mixed",direction:"out"},{name:"directedNeighbors",type:"directed"},{name:"undirectedNeighbors",type:"undirected"}];function at(){this.A=null,this.B=null}function ct(t,e,n,r,i){for(var o in r){var a=r[o],c=a.source,u=a.target,d=c===n?u:c;if(!e||!e.has(d.key)){var s=i(d.key,d.attributes);if(t&&s)return d.key}}}function ut(t,e,n,r,i){if("mixed"!==e){if("undirected"===e)return ct(t,null,r,r.undirected,i);if("string"==typeof n)return ct(t,null,r,r[n],i)}var o,a=new at;if("undirected"!==e){if("out"!==n){if(o=ct(t,null,r,r.in,i),t&&o)return o;a.wrap(r.in)}if("in"!==n){if(o=ct(t,a,r,r.out,i),t&&o)return o;a.wrap(r.out)}}if("directed"!==e&&(o=ct(t,a,r,r.undirected,i),t&&o))return o}function dt(t,n,r){var i=Object.keys(r),o=i.length,a=0;return e(e({},Symbol.iterator,(function(){return this})),"next",(function(){var e=null;do{if(a>=o)return t&&t.wrap(r),{done:!0};var c=r[i[a++]],u=c.source,d=c.target;e=u===n?d:u,t&&t.has(e.key)&&(e=null)}while(null===e);return{done:!1,value:{neighbor:e.key,attributes:e.attributes}}}))}function st(t,e){var n=e.name,r=e.type,i=e.direction;t.prototype[n]=function(t){if("mixed"!==r&&"mixed"!==this.type&&r!==this.type)return[];t=""+t;var e=this._nodes.get(t);if(void 0===e)throw new M("Graph.".concat(n,': could not find the "').concat(t,'" node in the graph.'));return function(t,e,n){if("mixed"!==t){if("undirected"===t)return Object.keys(n.undirected);if("string"==typeof e)return Object.keys(n[e])}var r=[];return ut(!1,t,e,n,(function(t){r.push(t)})),r}("mixed"===r?this.type:r,i,e)}}function ht(t,e){var n=e.name,r=e.type,i=e.direction,o=n.slice(0,-1)+"Entries";t.prototype[o]=function(t){if("mixed"!==r&&"mixed"!==this.type&&r!==this.type)return y();t=""+t;var e=this._nodes.get(t);if(void 0===e)throw new M("Graph.".concat(o,': could not find the "').concat(t,'" node in the graph.'));return function(t,e,n){if("mixed"!==t){if("undirected"===t)return dt(null,n,n.undirected);if("string"==typeof e)return dt(null,n,n[e])}var r=y(),i=new at;return"undirected"!==t&&("out"!==e&&(r=g(r,dt(i,n,n.in))),"in"!==e&&(r=g(r,dt(i,n,n.out)))),"directed"!==t&&(r=g(r,dt(i,n,n.undirected))),r}("mixed"===r?this.type:r,i,e)}}function pt(t,e,n,r,i){for(var o,a,c,u,d,s,h,p=r._nodes.values(),f=r.type;!0!==(o=p.next()).done;){var l=!1;if(a=o.value,"undirected"!==f)for(c in u=a.out){d=u[c];do{if(s=d.target,l=!0,h=i(a.key,s.key,a.attributes,s.attributes,d.key,d.attributes,d.undirected),t&&h)return d;d=d.next}while(d)}if("directed"!==f)for(c in u=a.undirected)if(!(e&&a.key>c)){d=u[c];do{if((s=d.target).key!==c&&(s=d.source),l=!0,h=i(a.key,s.key,a.attributes,s.attributes,d.key,d.attributes,d.undirected),t&&h)return d;d=d.next}while(d)}if(n&&!l&&(h=i(a.key,null,a.attributes,null,null,null,null),t&&h))return null}}function ft(t){if(!s(t))throw new C('Graph.import: invalid serialized node. A serialized node should be a plain object with at least a "key" property.');if(!("key"in t))throw new C("Graph.import: serialized node is missing its key.");if("attributes"in t&&(!s(t.attributes)||null===t.attributes))throw new C("Graph.import: invalid attributes. Attributes should be a plain object, null or omitted.")}function lt(t){if(!s(t))throw new C('Graph.import: invalid serialized edge. A serialized edge should be a plain object with at least a "source" & "target" property.');if(!("source"in t))throw new C("Graph.import: serialized edge is missing its source.");if(!("target"in t))throw new C("Graph.import: serialized edge is missing its target.");if("attributes"in t&&(!s(t.attributes)||null===t.attributes))throw new C("Graph.import: invalid attributes. Attributes should be a plain object, null or omitted.");if("undirected"in t&&"boolean"!=typeof t.undirected)throw new C("Graph.import: invalid undirectedness information. Undirected should be boolean or omitted.")}at.prototype.wrap=function(t){null===this.A?this.A=t:null===this.B&&(this.B=t)},at.prototype.has=function(t){return null!==this.A&&t in this.A||null!==this.B&&t in this.B};var gt,yt=(gt=255&Math.floor(256*Math.random()),function(){return gt++}),wt=new Set(["directed","undirected","mixed"]),vt=new Set(["domain","_events","_eventsCount","_maxListeners"]),bt={allowSelfLoops:!0,multi:!1,type:"mixed"};function mt(t,e,n){var r=new t.NodeDataClass(e,n);return t._nodes.set(e,r),t.emit("nodeAdded",{key:e,attributes:n}),r}function kt(t,e,n,r,i,o,a,c){if(!r&&"undirected"===t.type)throw new z("Graph.".concat(e,": you cannot add a directed edge to an undirected graph. Use the #.addEdge or #.addUndirectedEdge instead."));if(r&&"directed"===t.type)throw new z("Graph.".concat(e,": you cannot add an undirected edge to a directed graph. Use the #.addEdge or #.addDirectedEdge instead."));if(c&&!s(c))throw new C("Graph.".concat(e,': invalid attributes. Expecting an object but got "').concat(c,'"'));if(o=""+o,a=""+a,c=c||{},!t.allowSelfLoops&&o===a)throw new z("Graph.".concat(e,': source & target are the same ("').concat(o,"\\"), thus creating a loop explicitly forbidden by this graph 'allowSelfLoops' option set to false."));var u=t._nodes.get(o),d=t._nodes.get(a);if(!u)throw new M("Graph.".concat(e,': source node "').concat(o,'" not found.'));if(!d)throw new M("Graph.".concat(e,': target node "').concat(a,'" not found.'));var h={key:null,undirected:r,source:o,target:a,attributes:c};if(n)i=t._edgeKeyGenerator();else if(i=""+i,t._edges.has(i))throw new z("Graph.".concat(e,': the "').concat(i,'" edge already exists in the graph.'));if(!t.multi&&(r?void 0!==u.undirected[a]:void 0!==u.out[a]))throw new z("Graph.".concat(e,': an edge linking "').concat(o,'" to "').concat(a,"\\" already exists. If you really want to add multiple edges linking those nodes, you should create a multi graph by using the 'multi' option."));var p=new T(r,i,u,d,c);t._edges.set(i,p);var f=o===a;return r?(u.undirectedDegree++,d.undirectedDegree++,f&&(u.undirectedLoops++,t._undirectedSelfLoopCount++)):(u.outDegree++,d.inDegree++,f&&(u.directedLoops++,t._directedSelfLoopCount++)),t.multi?p.attachMulti():p.attach(),r?t._undirectedSize++:t._directedSize++,h.key=i,t.emit("edgeAdded",h),i}function _t(t,e,n,r,i,o,a,c,d){if(!r&&"undirected"===t.type)throw new z("Graph.".concat(e,": you cannot merge/update a directed edge to an undirected graph. Use the #.mergeEdge/#.updateEdge or #.addUndirectedEdge instead."));if(r&&"directed"===t.type)throw new z("Graph.".concat(e,": you cannot merge/update an undirected edge to a directed graph. Use the #.mergeEdge/#.updateEdge or #.addDirectedEdge instead."));if(c)if(d){if("function"!=typeof c)throw new C("Graph.".concat(e,': invalid updater function. Expecting a function but got "').concat(c,'"'))}else if(!s(c))throw new C("Graph.".concat(e,': invalid attributes. Expecting an object but got "').concat(c,'"'));var h;if(o=""+o,a=""+a,d&&(h=c,c=void 0),!t.allowSelfLoops&&o===a)throw new z("Graph.".concat(e,': source & target are the same ("').concat(o,"\\"), thus creating a loop explicitly forbidden by this graph 'allowSelfLoops' option set to false."));var p,f,l=t._nodes.get(o),g=t._nodes.get(a);if(!n&&(p=t._edges.get(i))){if(!(p.source.key===o&&p.target.key===a||r&&p.source.key===a&&p.target.key===o))throw new z("Graph.".concat(e,': inconsistency detected when attempting to merge the "').concat(i,'" edge with "').concat(o,'" source & "').concat(a,'" target vs. ("').concat(p.source.key,'", "').concat(p.target.key,'").'));f=p}if(f||t.multi||!l||(f=r?l.undirected[a]:l.out[a]),f){var y=[f.key,!1,!1,!1];if(d?!h:!c)return y;if(d){var w=f.attributes;f.attributes=h(w),t.emit("edgeAttributesUpdated",{type:"replace",key:f.key,attributes:f.attributes})}else u(f.attributes,c),t.emit("edgeAttributesUpdated",{type:"merge",key:f.key,attributes:f.attributes,data:c});return y}c=c||{},d&&h&&(c=h(c));var v={key:null,undirected:r,source:o,target:a,attributes:c};if(n)i=t._edgeKeyGenerator();else if(i=""+i,t._edges.has(i))throw new z("Graph.".concat(e,': the "').concat(i,'" edge already exists in the graph.'));var b=!1,m=!1;l||(l=mt(t,o,{}),b=!0,o===a&&(g=l,m=!0)),g||(g=mt(t,a,{}),m=!0),p=new T(r,i,l,g,c),t._edges.set(i,p);var k=o===a;return r?(l.undirectedDegree++,g.undirectedDegree++,k&&(l.undirectedLoops++,t._undirectedSelfLoopCount++)):(l.outDegree++,g.inDegree++,k&&(l.directedLoops++,t._directedSelfLoopCount++)),t.multi?p.attachMulti():p.attach(),r?t._undirectedSize++:t._directedSize++,v.key=i,t.emit("edgeAdded",v),[i,!0,b,m]}function Gt(t,e){t._edges.delete(e.key);var n=e.source,r=e.target,i=e.attributes,o=e.undirected,a=n===r;o?(n.undirectedDegree--,r.undirectedDegree--,a&&(n.undirectedLoops--,t._undirectedSelfLoopCount--)):(n.outDegree--,r.inDegree--,a&&(n.directedLoops--,t._directedSelfLoopCount--)),t.multi?e.detachMulti():e.detach(),o?t._undirectedSize--:t._directedSize--,t.emit("edgeDropped",{key:e.key,attributes:i,source:n.key,target:r.key,undirected:o})}var xt=function(n){function i(e){var r;if(r=n.call(this)||this,"boolean"!=typeof(e=u({},bt,e)).multi)throw new C("Graph.constructor: invalid 'multi' option. Expecting a boolean but got \\"".concat(e.multi,'".'));if(!wt.has(e.type))throw new C('Graph.constructor: invalid \\'type\\' option. Should be one of "mixed", "directed" or "undirected" but got "'.concat(e.type,'".'));if("boolean"!=typeof e.allowSelfLoops)throw new C("Graph.constructor: invalid 'allowSelfLoops' option. Expecting a boolean but got \\"".concat(e.allowSelfLoops,'".'));var i="mixed"===e.type?W:"directed"===e.type?P:K;p(t(r),"NodeDataClass",i);var o="geid_"+yt()+"_",a=0;return p(t(r),"_attributes",{}),p(t(r),"_nodes",new Map),p(t(r),"_edges",new Map),p(t(r),"_directedSize",0),p(t(r),"_undirectedSize",0),p(t(r),"_directedSelfLoopCount",0),p(t(r),"_undirectedSelfLoopCount",0),p(t(r),"_edgeKeyGenerator",(function(){var t;do{t=o+a++}while(r._edges.has(t));return t})),p(t(r),"_options",e),vt.forEach((function(e){return p(t(r),e,r[e])})),f(t(r),"order",(function(){return r._nodes.size})),f(t(r),"size",(function(){return r._edges.size})),f(t(r),"directedSize",(function(){return r._directedSize})),f(t(r),"undirectedSize",(function(){return r._undirectedSize})),f(t(r),"selfLoopCount",(function(){return r._directedSelfLoopCount+r._undirectedSelfLoopCount})),f(t(r),"directedSelfLoopCount",(function(){return r._directedSelfLoopCount})),f(t(r),"undirectedSelfLoopCount",(function(){return r._undirectedSelfLoopCount})),f(t(r),"multi",r._options.multi),f(t(r),"type",r._options.type),f(t(r),"allowSelfLoops",r._options.allowSelfLoops),f(t(r),"implementation",(function(){return"graphology"})),r}r(i,n);var o=i.prototype;return o._resetInstanceCounters=function(){this._directedSize=0,this._undirectedSize=0,this._directedSelfLoopCount=0,this._undirectedSelfLoopCount=0},o.hasNode=function(t){return this._nodes.has(""+t)},o.hasDirectedEdge=function(t,e){if("undirected"===this.type)return!1;if(1===arguments.length){var n=""+t,r=this._edges.get(n);return!!r&&!r.undirected}if(2===arguments.length){t=""+t,e=""+e;var i=this._nodes.get(t);return!!i&&i.out.hasOwnProperty(e)}throw new C("Graph.hasDirectedEdge: invalid arity (".concat(arguments.length,", instead of 1 or 2). You can either ask for an edge id or for the existence of an edge between a source & a target."))},o.hasUndirectedEdge=function(t,e){if("directed"===this.type)return!1;if(1===arguments.length){var n=""+t,r=this._edges.get(n);return!!r&&r.undirected}if(2===arguments.length){t=""+t,e=""+e;var i=this._nodes.get(t);return!!i&&i.undirected.hasOwnProperty(e)}throw new C("Graph.hasDirectedEdge: invalid arity (".concat(arguments.length,", instead of 1 or 2). You can either ask for an edge id or for the existence of an edge between a source & a target."))},o.hasEdge=function(t,e){if(1===arguments.length){var n=""+t;return this._edges.has(n)}if(2===arguments.length){t=""+t,e=""+e;var r=this._nodes.get(t);return!!r&&(void 0!==r.out&&r.out.hasOwnProperty(e)||void 0!==r.undirected&&r.undirected.hasOwnProperty(e))}throw new C("Graph.hasEdge: invalid arity (".concat(arguments.length,", instead of 1 or 2). You can either ask for an edge id or for the existence of an edge between a source & a target."))},o.directedEdge=function(t,e){if("undirected"!==this.type){if(t=""+t,e=""+e,this.multi)throw new z("Graph.directedEdge: this method is irrelevant with multigraphs since there might be multiple edges between source & target. See #.directedEdges instead.");var n=this._nodes.get(t);if(!n)throw new M('Graph.directedEdge: could not find the "'.concat(t,'" source node in the graph.'));if(!this._nodes.has(e))throw new M('Graph.directedEdge: could not find the "'.concat(e,'" target node in the graph.'));var r=n.out&&n.out[e]||void 0;return r?r.key:void 0}},o.undirectedEdge=function(t,e){if("directed"!==this.type){if(t=""+t,e=""+e,this.multi)throw new z("Graph.undirectedEdge: this method is irrelevant with multigraphs since there might be multiple edges between source & target. See #.undirectedEdges instead.");var n=this._nodes.get(t);if(!n)throw new M('Graph.undirectedEdge: could not find the "'.concat(t,'" source node in the graph.'));if(!this._nodes.has(e))throw new M('Graph.undirectedEdge: could not find the "'.concat(e,'" target node in the graph.'));var r=n.undirected&&n.undirected[e]||void 0;return r?r.key:void 0}},o.edge=function(t,e){if(this.multi)throw new z("Graph.edge: this method is irrelevant with multigraphs since there might be multiple edges between source & target. See #.edges instead.");t=""+t,e=""+e;var n=this._nodes.get(t);if(!n)throw new M('Graph.edge: could not find the "'.concat(t,'" source node in the graph.'));if(!this._nodes.has(e))throw new M('Graph.edge: could not find the "'.concat(e,'" target node in the graph.'));var r=n.out&&n.out[e]||n.undirected&&n.undirected[e]||void 0;if(r)return r.key},o.areDirectedNeighbors=function(t,e){t=""+t,e=""+e;var n=this._nodes.get(t);if(!n)throw new M('Graph.areDirectedNeighbors: could not find the "'.concat(t,'" node in the graph.'));return"undirected"!==this.type&&(e in n.in||e in n.out)},o.areOutNeighbors=function(t,e){t=""+t,e=""+e;var n=this._nodes.get(t);if(!n)throw new M('Graph.areOutNeighbors: could not find the "'.concat(t,'" node in the graph.'));return"undirected"!==this.type&&e in n.out},o.areInNeighbors=function(t,e){t=""+t,e=""+e;var n=this._nodes.get(t);if(!n)throw new M('Graph.areInNeighbors: could not find the "'.concat(t,'" node in the graph.'));return"undirected"!==this.type&&e in n.in},o.areUndirectedNeighbors=function(t,e){t=""+t,e=""+e;var n=this._nodes.get(t);if(!n)throw new M('Graph.areUndirectedNeighbors: could not find the "'.concat(t,'" node in the graph.'));return"directed"!==this.type&&e in n.undirected},o.areNeighbors=function(t,e){t=""+t,e=""+e;var n=this._nodes.get(t);if(!n)throw new M('Graph.areNeighbors: could not find the "'.concat(t,'" node in the graph.'));return"undirected"!==this.type&&(e in n.in||e in n.out)||"directed"!==this.type&&e in n.undirected},o.areInboundNeighbors=function(t,e){t=""+t,e=""+e;var n=this._nodes.get(t);if(!n)throw new M('Graph.areInboundNeighbors: could not find the "'.concat(t,'" node in the graph.'));return"undirected"!==this.type&&e in n.in||"directed"!==this.type&&e in n.undirected},o.areOutboundNeighbors=function(t,e){t=""+t,e=""+e;var n=this._nodes.get(t);if(!n)throw new M('Graph.areOutboundNeighbors: could not find the "'.concat(t,'" node in the graph.'));return"undirected"!==this.type&&e in n.out||"directed"!==this.type&&e in n.undirected},o.inDegree=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.inDegree: could not find the "'.concat(t,'" node in the graph.'));return"undirected"===this.type?0:e.inDegree},o.outDegree=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.outDegree: could not find the "'.concat(t,'" node in the graph.'));return"undirected"===this.type?0:e.outDegree},o.directedDegree=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.directedDegree: could not find the "'.concat(t,'" node in the graph.'));return"undirected"===this.type?0:e.inDegree+e.outDegree},o.undirectedDegree=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.undirectedDegree: could not find the "'.concat(t,'" node in the graph.'));return"directed"===this.type?0:e.undirectedDegree},o.inboundDegree=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.inboundDegree: could not find the "'.concat(t,'" node in the graph.'));var n=0;return"directed"!==this.type&&(n+=e.undirectedDegree),"undirected"!==this.type&&(n+=e.inDegree),n},o.outboundDegree=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.outboundDegree: could not find the "'.concat(t,'" node in the graph.'));var n=0;return"directed"!==this.type&&(n+=e.undirectedDegree),"undirected"!==this.type&&(n+=e.outDegree),n},o.degree=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.degree: could not find the "'.concat(t,'" node in the graph.'));var n=0;return"directed"!==this.type&&(n+=e.undirectedDegree),"undirected"!==this.type&&(n+=e.inDegree+e.outDegree),n},o.inDegreeWithoutSelfLoops=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.inDegreeWithoutSelfLoops: could not find the "'.concat(t,'" node in the graph.'));return"undirected"===this.type?0:e.inDegree-e.directedLoops},o.outDegreeWithoutSelfLoops=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.outDegreeWithoutSelfLoops: could not find the "'.concat(t,'" node in the graph.'));return"undirected"===this.type?0:e.outDegree-e.directedLoops},o.directedDegreeWithoutSelfLoops=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.directedDegreeWithoutSelfLoops: could not find the "'.concat(t,'" node in the graph.'));return"undirected"===this.type?0:e.inDegree+e.outDegree-2*e.directedLoops},o.undirectedDegreeWithoutSelfLoops=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.undirectedDegreeWithoutSelfLoops: could not find the "'.concat(t,'" node in the graph.'));return"directed"===this.type?0:e.undirectedDegree-2*e.undirectedLoops},o.inboundDegreeWithoutSelfLoops=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.inboundDegreeWithoutSelfLoops: could not find the "'.concat(t,'" node in the graph.'));var n=0,r=0;return"directed"!==this.type&&(n+=e.undirectedDegree,r+=2*e.undirectedLoops),"undirected"!==this.type&&(n+=e.inDegree,r+=e.directedLoops),n-r},o.outboundDegreeWithoutSelfLoops=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.outboundDegreeWithoutSelfLoops: could not find the "'.concat(t,'" node in the graph.'));var n=0,r=0;return"directed"!==this.type&&(n+=e.undirectedDegree,r+=2*e.undirectedLoops),"undirected"!==this.type&&(n+=e.outDegree,r+=e.directedLoops),n-r},o.degreeWithoutSelfLoops=function(t){t=""+t;var e=this._nodes.get(t);if(!e)throw new M('Graph.degreeWithoutSelfLoops: could not find the "'.concat(t,'" node in the graph.'));var n=0,r=0;return"directed"!==this.type&&(n+=e.undirectedDegree,r+=2*e.undirectedLoops),"undirected"!==this.type&&(n+=e.inDegree+e.outDegree,r+=2*e.directedLoops),n-r},o.source=function(t){t=""+t;var e=this._edges.get(t);if(!e)throw new M('Graph.source: could not find the "'.concat(t,'" edge in the graph.'));return e.source.key},o.target=function(t){t=""+t;var e=this._edges.get(t);if(!e)throw new M('Graph.target: could not find the "'.concat(t,'" edge in the graph.'));return e.target.key},o.extremities=function(t){t=""+t;var e=this._edges.get(t);if(!e)throw new M('Graph.extremities: could not find the "'.concat(t,'" edge in the graph.'));return[e.source.key,e.target.key]},o.opposite=function(t,e){t=""+t,e=""+e;var n=this._edges.get(e);if(!n)throw new M('Graph.opposite: could not find the "'.concat(e,'" edge in the graph.'));var r=n.source.key,i=n.target.key;if(t===r)return i;if(t===i)return r;throw new M('Graph.opposite: the "'.concat(t,'" node is not attached to the "').concat(e,'" edge (').concat(r,", ").concat(i,")."))},o.hasExtremity=function(t,e){t=""+t,e=""+e;var n=this._edges.get(t);if(!n)throw new M('Graph.hasExtremity: could not find the "'.concat(t,'" edge in the graph.'));return n.source.key===e||n.target.key===e},o.isUndirected=function(t){t=""+t;var e=this._edges.get(t);if(!e)throw new M('Graph.isUndirected: could not find the "'.concat(t,'" edge in the graph.'));return e.undirected},o.isDirected=function(t){t=""+t;var e=this._edges.get(t);if(!e)throw new M('Graph.isDirected: could not find the "'.concat(t,'" edge in the graph.'));return!e.undirected},o.isSelfLoop=function(t){t=""+t;var e=this._edges.get(t);if(!e)throw new M('Graph.isSelfLoop: could not find the "'.concat(t,'" edge in the graph.'));return e.source===e.target},o.addNode=function(t,e){var n=function(t,e,n){if(n&&!s(n))throw new C('Graph.addNode: invalid attributes. Expecting an object but got "'.concat(n,'"'));if(e=""+e,n=n||{},t._nodes.has(e))throw new z('Graph.addNode: the "'.concat(e,'" node already exist in the graph.'));var r=new t.NodeDataClass(e,n);return t._nodes.set(e,r),t.emit("nodeAdded",{key:e,attributes:n}),r}(this,t,e);return n.key},o.mergeNode=function(t,e){if(e&&!s(e))throw new C('Graph.mergeNode: invalid attributes. Expecting an object but got "'.concat(e,'"'));t=""+t,e=e||{};var n=this._nodes.get(t);return n?(e&&(u(n.attributes,e),this.emit("nodeAttributesUpdated",{type:"merge",key:t,attributes:n.attributes,data:e})),[t,!1]):(n=new this.NodeDataClass(t,e),this._nodes.set(t,n),this.emit("nodeAdded",{key:t,attributes:e}),[t,!0])},o.updateNode=function(t,e){if(e&&"function"!=typeof e)throw new C('Graph.updateNode: invalid updater function. Expecting a function but got "'.concat(e,'"'));t=""+t;var n=this._nodes.get(t);if(n){if(e){var r=n.attributes;n.attributes=e(r),this.emit("nodeAttributesUpdated",{type:"replace",key:t,attributes:n.attributes})}return[t,!1]}var i=e?e({}):{};return n=new this.NodeDataClass(t,i),this._nodes.set(t,n),this.emit("nodeAdded",{key:t,attributes:i}),[t,!0]},o.dropNode=function(t){t=""+t;var e,n=this._nodes.get(t);if(!n)throw new M('Graph.dropNode: could not find the "'.concat(t,'" node in the graph.'));if("undirected"!==this.type){for(var r in n.out){e=n.out[r];do{Gt(this,e),e=e.next}while(e)}for(var i in n.in){e=n.in[i];do{Gt(this,e),e=e.next}while(e)}}if("directed"!==this.type)for(var o in n.undirected){e=n.undirected[o];do{Gt(this,e),e=e.next}while(e)}this._nodes.delete(t),this.emit("nodeDropped",{key:t,attributes:n.attributes})},o.dropEdge=function(t){var e;if(arguments.length>1){var n=""+arguments[0],r=""+arguments[1];if(!(e=d(this,n,r,this.type)))throw new M('Graph.dropEdge: could not find the "'.concat(n,'" -> "').concat(r,'" edge in the graph.'))}else if(t=""+t,!(e=this._edges.get(t)))throw new M('Graph.dropEdge: could not find the "'.concat(t,'" edge in the graph.'));return Gt(this,e),this},o.dropDirectedEdge=function(t,e){if(arguments.length<2)throw new z("Graph.dropDirectedEdge: it does not make sense to try and drop a directed edge by key. What if the edge with this key is undirected? Use #.dropEdge for this purpose instead.");if(this.multi)throw new z("Graph.dropDirectedEdge: cannot use a {source,target} combo when dropping an edge in a MultiGraph since we cannot infer the one you want to delete as there could be multiple ones.");var n=d(this,t=""+t,e=""+e,"directed");if(!n)throw new M('Graph.dropDirectedEdge: could not find a "'.concat(t,'" -> "').concat(e,'" edge in the graph.'));return Gt(this,n),this},o.dropUndirectedEdge=function(t,e){if(arguments.length<2)throw new z("Graph.dropUndirectedEdge: it does not make sense to drop a directed edge by key. What if the edge with this key is undirected? Use #.dropEdge for this purpose instead.");if(this.multi)throw new z("Graph.dropUndirectedEdge: cannot use a {source,target} combo when dropping an edge in a MultiGraph since we cannot infer the one you want to delete as there could be multiple ones.");var n=d(this,t,e,"undirected");if(!n)throw new M('Graph.dropUndirectedEdge: could not find a "'.concat(t,'" -> "').concat(e,'" edge in the graph.'));return Gt(this,n),this},o.clear=function(){this._edges.clear(),this._nodes.clear(),this._resetInstanceCounters(),this.emit("cleared")},o.clearEdges=function(){for(var t,e=this._nodes.values();!0!==(t=e.next()).done;)t.value.clear();this._edges.clear(),this._resetInstanceCounters(),this.emit("edgesCleared")},o.getAttribute=function(t){return this._attributes[t]},o.getAttributes=function(){return this._attributes},o.hasAttribute=function(t){return this._attributes.hasOwnProperty(t)},o.setAttribute=function(t,e){return this._attributes[t]=e,this.emit("attributesUpdated",{type:"set",attributes:this._attributes,name:t}),this},o.updateAttribute=function(t,e){if("function"!=typeof e)throw new C("Graph.updateAttribute: updater should be a function.");var n=this._attributes[t];return this._attributes[t]=e(n),this.emit("attributesUpdated",{type:"set",attributes:this._attributes,name:t}),this},o.removeAttribute=function(t){return delete this._attributes[t],this.emit("attributesUpdated",{type:"remove",attributes:this._attributes,name:t}),this},o.replaceAttributes=function(t){if(!s(t))throw new C("Graph.replaceAttributes: provided attributes are not a plain object.");return this._attributes=t,this.emit("attributesUpdated",{type:"replace",attributes:this._attributes}),this},o.mergeAttributes=function(t){if(!s(t))throw new C("Graph.mergeAttributes: provided attributes are not a plain object.");return u(this._attributes,t),this.emit("attributesUpdated",{type:"merge",attributes:this._attributes,data:t}),this},o.updateAttributes=function(t){if("function"!=typeof t)throw new C("Graph.updateAttributes: provided updater is not a function.");return this._attributes=t(this._attributes),this.emit("attributesUpdated",{type:"update",attributes:this._attributes}),this},o.updateEachNodeAttributes=function(t,e){if("function"!=typeof t)throw new C("Graph.updateEachNodeAttributes: expecting an updater function.");if(e&&!l(e))throw new C("Graph.updateEachNodeAttributes: invalid hints. Expecting an object having the following shape: {attributes?: [string]}");for(var n,r,i=this._nodes.values();!0!==(n=i.next()).done;)(r=n.value).attributes=t(r.key,r.attributes);this.emit("eachNodeAttributesUpdated",{hints:e||null})},o.updateEachEdgeAttributes=function(t,e){if("function"!=typeof t)throw new C("Graph.updateEachEdgeAttributes: expecting an updater function.");if(e&&!l(e))throw new C("Graph.updateEachEdgeAttributes: invalid hints. Expecting an object having the following shape: {attributes?: [string]}");for(var n,r,i,o,a=this._edges.values();!0!==(n=a.next()).done;)i=(r=n.value).source,o=r.target,r.attributes=t(r.key,r.attributes,i.key,o.key,i.attributes,o.attributes,r.undirected);this.emit("eachEdgeAttributesUpdated",{hints:e||null})},o.forEachAdjacencyEntry=function(t){if("function"!=typeof t)throw new C("Graph.forEachAdjacencyEntry: expecting a callback.");pt(!1,!1,!1,this,t)},o.forEachAdjacencyEntryWithOrphans=function(t){if("function"!=typeof t)throw new C("Graph.forEachAdjacencyEntryWithOrphans: expecting a callback.");pt(!1,!1,!0,this,t)},o.forEachAssymetricAdjacencyEntry=function(t){if("function"!=typeof t)throw new C("Graph.forEachAssymetricAdjacencyEntry: expecting a callback.");pt(!1,!0,!1,this,t)},o.forEachAssymetricAdjacencyEntryWithOrphans=function(t){if("function"!=typeof t)throw new C("Graph.forEachAssymetricAdjacencyEntryWithOrphans: expecting a callback.");pt(!1,!0,!0,this,t)},o.nodes=function(){return Array.from(this._nodes.keys())},o.forEachNode=function(t){if("function"!=typeof t)throw new C("Graph.forEachNode: expecting a callback.");for(var e,n,r=this._nodes.values();!0!==(e=r.next()).done;)t((n=e.value).key,n.attributes)},o.findNode=function(t){if("function"!=typeof t)throw new C("Graph.findNode: expecting a callback.");for(var e,n,r=this._nodes.values();!0!==(e=r.next()).done;)if(t((n=e.value).key,n.attributes))return n.key},o.mapNodes=function(t){if("function"!=typeof t)throw new C("Graph.mapNode: expecting a callback.");for(var e,n,r=this._nodes.values(),i=new Array(this.order),o=0;!0!==(e=r.next()).done;)n=e.value,i[o++]=t(n.key,n.attributes);return i},o.someNode=function(t){if("function"!=typeof t)throw new C("Graph.someNode: expecting a callback.");for(var e,n,r=this._nodes.values();!0!==(e=r.next()).done;)if(t((n=e.value).key,n.attributes))return!0;return!1},o.everyNode=function(t){if("function"!=typeof t)throw new C("Graph.everyNode: expecting a callback.");for(var e,n,r=this._nodes.values();!0!==(e=r.next()).done;)if(!t((n=e.value).key,n.attributes))return!1;return!0},o.filterNodes=function(t){if("function"!=typeof t)throw new C("Graph.filterNodes: expecting a callback.");for(var e,n,r=this._nodes.values(),i=[];!0!==(e=r.next()).done;)t((n=e.value).key,n.attributes)&&i.push(n.key);return i},o.reduceNodes=function(t,e){if("function"!=typeof t)throw new C("Graph.reduceNodes: expecting a callback.");if(arguments.length<2)throw new C("Graph.reduceNodes: missing initial value. You must provide it because the callback takes more than one argument and we cannot infer the initial value from the first iteration, as you could with a simple array.");for(var n,r,i=e,o=this._nodes.values();!0!==(n=o.next()).done;)i=t(i,(r=n.value).key,r.attributes);return i},o.nodeEntries=function(){var t=this._nodes.values();return e(e({},Symbol.iterator,(function(){return this})),"next",(function(){var e=t.next();if(e.done)return e;var n=e.value;return{value:{node:n.key,attributes:n.attributes},done:!1}}))},o.export=function(){var t=this,e=new Array(this._nodes.size),n=0;this._nodes.forEach((function(t,r){e[n++]=function(t,e){var n={key:t};return h(e.attributes)||(n.attributes=u({},e.attributes)),n}(r,t)}));var r=new Array(this._edges.size);return n=0,this._edges.forEach((function(e,i){r[n++]=function(t,e,n){var r={key:e,source:n.source.key,target:n.target.key};return h(n.attributes)||(r.attributes=u({},n.attributes)),"mixed"===t&&n.undirected&&(r.undirected=!0),r}(t.type,i,e)})),{options:{type:this.type,multi:this.multi,allowSelfLoops:this.allowSelfLoops},attributes:this.getAttributes(),nodes:e,edges:r}},o.import=function(t){var e,n,r,o,a,c=this,u=arguments.length>1&&void 0!==arguments[1]&&arguments[1];if(t instanceof i)return t.forEachNode((function(t,e){u?c.mergeNode(t,e):c.addNode(t,e)})),t.forEachEdge((function(t,e,n,r,i,o,a){u?a?c.mergeUndirectedEdgeWithKey(t,n,r,e):c.mergeDirectedEdgeWithKey(t,n,r,e):a?c.addUndirectedEdgeWithKey(t,n,r,e):c.addDirectedEdgeWithKey(t,n,r,e)})),this;if(!s(t))throw new C("Graph.import: invalid argument. Expecting a serialized graph or, alternatively, a Graph instance.");if(t.attributes){if(!s(t.attributes))throw new C("Graph.import: invalid attributes. Expecting a plain object.");u?this.mergeAttributes(t.attributes):this.replaceAttributes(t.attributes)}if(t.nodes){if(r=t.nodes,!Array.isArray(r))throw new C("Graph.import: invalid nodes. Expecting an array.");for(e=0,n=r.length;e<n;e++){ft(o=r[e]);var d=o,h=d.key,p=d.attributes;u?this.mergeNode(h,p):this.addNode(h,p)}}if(t.edges){var f=!1;if("undirected"===this.type&&(f=!0),r=t.edges,!Array.isArray(r))throw new C("Graph.import: invalid edges. Expecting an array.");for(e=0,n=r.length;e<n;e++){lt(a=r[e]);var l=a,g=l.source,y=l.target,w=l.attributes,v=l.undirected,b=void 0===v?f:v;"key"in a?(u?b?this.mergeUndirectedEdgeWithKey:this.mergeDirectedEdgeWithKey:b?this.addUndirectedEdgeWithKey:this.addDirectedEdgeWithKey).call(this,a.key,g,y,w):(u?b?this.mergeUndirectedEdge:this.mergeDirectedEdge:b?this.addUndirectedEdge:this.addDirectedEdge).call(this,g,y,w)}}return this},o.nullCopy=function(t){var e=new i(u({},this._options,t));return e.replaceAttributes(u({},this.getAttributes())),e},o.emptyCopy=function(t){var e=this.nullCopy(t);return this._nodes.forEach((function(t,n){var r=u({},t.attributes);t=new e.NodeDataClass(n,r),e._nodes.set(n,t)})),e},o.copy=function(t){if("string"==typeof(t=t||{}).type&&t.type!==this.type&&"mixed"!==t.type)throw new z('Graph.copy: cannot create an incompatible copy from "'.concat(this.type,'" type to "').concat(t.type,'" because this would mean losing information about the current graph.'));if("boolean"==typeof t.multi&&t.multi!==this.multi&&!0!==t.multi)throw new z("Graph.copy: cannot create an incompatible copy by downgrading a multi graph to a simple one because this would mean losing information about the current graph.");if("boolean"==typeof t.allowSelfLoops&&t.allowSelfLoops!==this.allowSelfLoops&&!0!==t.allowSelfLoops)throw new z("Graph.copy: cannot create an incompatible copy from a graph allowing self loops to one that does not because this would mean losing information about the current graph.");for(var e,n,r=this.emptyCopy(t),i=this._edges.values();!0!==(e=i.next()).done;)kt(r,"copy",!1,(n=e.value).undirected,n.key,n.source.key,n.target.key,u({},n.attributes));return r},o.toJSON=function(){return this.export()},o.toString=function(){return"[object Graph]"},o.inspect=function(){var t=this,e={};this._nodes.forEach((function(t,n){e[n]=t.attributes}));var n={},r={};this._edges.forEach((function(e,i){var o,a=e.undirected?"--":"->",c="",u=e.source.key,d=e.target.key;e.undirected&&u>d&&(o=u,u=d,d=o);var s="(".concat(u,")").concat(a,"(").concat(d,")");i.startsWith("geid_")?t.multi&&(void 0===r[s]?r[s]=0:r[s]++,c+="".concat(r[s],". ")):c+="[".concat(i,"]: "),n[c+=s]=e.attributes}));var i={};for(var o in this)this.hasOwnProperty(o)&&!vt.has(o)&&"function"!=typeof this[o]&&"symbol"!==a(o)&&(i[o]=this[o]);return i.attributes=this._attributes,i.nodes=e,i.edges=n,p(i,"constructor",this.constructor),i},i}(v.exports.EventEmitter);"undefined"!=typeof Symbol&&(xt.prototype[Symbol.for("nodejs.util.inspect.custom")]=xt.prototype.inspect),[{name:function(t){return"".concat(t,"Edge")},generateKey:!0},{name:function(t){return"".concat(t,"DirectedEdge")},generateKey:!0,type:"directed"},{name:function(t){return"".concat(t,"UndirectedEdge")},generateKey:!0,type:"undirected"},{name:function(t){return"".concat(t,"EdgeWithKey")}},{name:function(t){return"".concat(t,"DirectedEdgeWithKey")},type:"directed"},{name:function(t){return"".concat(t,"UndirectedEdgeWithKey")},type:"undirected"}].forEach((function(t){["add","merge","update"].forEach((function(e){var n=t.name(e),r="add"===e?kt:_t;t.generateKey?xt.prototype[n]=function(i,o,a){return r(this,n,!0,"undirected"===(t.type||this.type),null,i,o,a,"update"===e)}:xt.prototype[n]=function(i,o,a,c){return r(this,n,!1,"undirected"===(t.type||this.type),i,o,a,c,"update"===e)}}))})),function(t){Y.forEach((function(e){var n=e.name,r=e.attacher;r(t,n("Node"),I),r(t,n("Source"),R),r(t,n("Target"),2),r(t,n("Opposite"),F)}))}(xt),function(t){J.forEach((function(e){var n=e.name,r=e.attacher;r(t,n("Edge"),"mixed"),r(t,n("DirectedEdge"),"directed"),r(t,n("UndirectedEdge"),"undirected")}))}(xt),function(t){q.forEach((function(e){rt(t,e),function(t,e){var n=e.name,r=e.type,i=e.direction,o="forEach"+n[0].toUpperCase()+n.slice(1,-1);t.prototype[o]=function(t,e,n){if("mixed"===r||"mixed"===this.type||r===this.type){if(1===arguments.length)return tt(!1,this,r,n=t);if(2===arguments.length){t=""+t,n=e;var a=this._nodes.get(t);if(void 0===a)throw new M("Graph.".concat(o,': could not find the "').concat(t,'" node in the graph.'));return et(!1,this.multi,"mixed"===r?this.type:r,i,a,n)}if(3===arguments.length){t=""+t,e=""+e;var c=this._nodes.get(t);if(!c)throw new M("Graph.".concat(o,':  could not find the "').concat(t,'" source node in the graph.'));if(!this._nodes.has(e))throw new M("Graph.".concat(o,':  could not find the "').concat(e,'" target node in the graph.'));return nt(!1,r,this.multi,i,c,e,n)}throw new C("Graph.".concat(o,": too many arguments (expecting 1, 2 or 3 and got ").concat(arguments.length,")."))}};var a="map"+n[0].toUpperCase()+n.slice(1);t.prototype[a]=function(){var t,e=Array.prototype.slice.call(arguments),n=e.pop();if(0===e.length){var i=0;"directed"!==r&&(i+=this.undirectedSize),"undirected"!==r&&(i+=this.directedSize),t=new Array(i);var a=0;e.push((function(e,r,i,o,c,u,d){t[a++]=n(e,r,i,o,c,u,d)}))}else t=[],e.push((function(e,r,i,o,a,c,u){t.push(n(e,r,i,o,a,c,u))}));return this[o].apply(this,e),t};var c="filter"+n[0].toUpperCase()+n.slice(1);t.prototype[c]=function(){var t=Array.prototype.slice.call(arguments),e=t.pop(),n=[];return t.push((function(t,r,i,o,a,c,u){e(t,r,i,o,a,c,u)&&n.push(t)})),this[o].apply(this,t),n};var u="reduce"+n[0].toUpperCase()+n.slice(1);t.prototype[u]=function(){var t,e,n=Array.prototype.slice.call(arguments);if(n.length<2||n.length>4)throw new C("Graph.".concat(u,": invalid number of arguments (expecting 2, 3 or 4 and got ").concat(n.length,")."));if("function"==typeof n[n.length-1]&&"function"!=typeof n[n.length-2])throw new C("Graph.".concat(u,": missing initial value. You must provide it because the callback takes more than one argument and we cannot infer the initial value from the first iteration, as you could with a simple array."));2===n.length?(t=n[0],e=n[1],n=[]):3===n.length?(t=n[1],e=n[2],n=[n[0]]):4===n.length&&(t=n[2],e=n[3],n=[n[0],n[1]]);var r=e;return n.push((function(e,n,i,o,a,c,u){r=t(r,e,n,i,o,a,c,u)})),this[o].apply(this,n),r}}(t,e),function(t,e){var n=e.name,r=e.type,i=e.direction,o="find"+n[0].toUpperCase()+n.slice(1,-1);t.prototype[o]=function(t,e,n){if("mixed"!==r&&"mixed"!==this.type&&r!==this.type)return!1;if(1===arguments.length)return tt(!0,this,r,n=t);if(2===arguments.length){t=""+t,n=e;var a=this._nodes.get(t);if(void 0===a)throw new M("Graph.".concat(o,': could not find the "').concat(t,'" node in the graph.'));return et(!0,this.multi,"mixed"===r?this.type:r,i,a,n)}if(3===arguments.length){t=""+t,e=""+e;var c=this._nodes.get(t);if(!c)throw new M("Graph.".concat(o,':  could not find the "').concat(t,'" source node in the graph.'));if(!this._nodes.has(e))throw new M("Graph.".concat(o,':  could not find the "').concat(e,'" target node in the graph.'));return nt(!0,r,this.multi,i,c,e,n)}throw new C("Graph.".concat(o,": too many arguments (expecting 1, 2 or 3 and got ").concat(arguments.length,")."))};var a="some"+n[0].toUpperCase()+n.slice(1,-1);t.prototype[a]=function(){var t=Array.prototype.slice.call(arguments),e=t.pop();return t.push((function(t,n,r,i,o,a,c){return e(t,n,r,i,o,a,c)})),!!this[o].apply(this,t)};var c="every"+n[0].toUpperCase()+n.slice(1,-1);t.prototype[c]=function(){var t=Array.prototype.slice.call(arguments),e=t.pop();return t.push((function(t,n,r,i,o,a,c){return!e(t,n,r,i,o,a,c)})),!this[o].apply(this,t)}}(t,e),it(t,e)}))}(xt),function(t){ot.forEach((function(e){st(t,e),function(t,e){var n=e.name,r=e.type,i=e.direction,o="forEach"+n[0].toUpperCase()+n.slice(1,-1);t.prototype[o]=function(t,e){if("mixed"===r||"mixed"===this.type||r===this.type){t=""+t;var n=this._nodes.get(t);if(void 0===n)throw new M("Graph.".concat(o,': could not find the "').concat(t,'" node in the graph.'));ut(!1,"mixed"===r?this.type:r,i,n,e)}};var a="map"+n[0].toUpperCase()+n.slice(1);t.prototype[a]=function(t,e){var n=[];return this[o](t,(function(t,r){n.push(e(t,r))})),n};var c="filter"+n[0].toUpperCase()+n.slice(1);t.prototype[c]=function(t,e){var n=[];return this[o](t,(function(t,r){e(t,r)&&n.push(t)})),n};var u="reduce"+n[0].toUpperCase()+n.slice(1);t.prototype[u]=function(t,e,n){if(arguments.length<3)throw new C("Graph.".concat(u,": missing initial value. You must provide it because the callback takes more than one argument and we cannot infer the initial value from the first iteration, as you could with a simple array."));var r=n;return this[o](t,(function(t,n){r=e(r,t,n)})),r}}(t,e),function(t,e){var n=e.name,r=e.type,i=e.direction,o=n[0].toUpperCase()+n.slice(1,-1),a="find"+o;t.prototype[a]=function(t,e){if("mixed"===r||"mixed"===this.type||r===this.type){t=""+t;var n=this._nodes.get(t);if(void 0===n)throw new M("Graph.".concat(a,': could not find the "').concat(t,'" node in the graph.'));return ut(!0,"mixed"===r?this.type:r,i,n,e)}};var c="some"+o;t.prototype[c]=function(t,e){return!!this[a](t,e)};var u="every"+o;t.prototype[u]=function(t,e){return!this[a](t,(function(t,n){return!e(t,n)}))}}(t,e),ht(t,e)}))}(xt);var Et=function(t){function e(e){var n=u({type:"directed"},e);if("multi"in n&&!1!==n.multi)throw new C("DirectedGraph.from: inconsistent indication that the graph should be multi in given options!");if("directed"!==n.type)throw new C('DirectedGraph.from: inconsistent "'+n.type+'" type in given options!');return t.call(this,n)||this}return r(e,t),e}(xt),At=function(t){function e(e){var n=u({type:"undirected"},e);if("multi"in n&&!1!==n.multi)throw new C("UndirectedGraph.from: inconsistent indication that the graph should be multi in given options!");if("undirected"!==n.type)throw new C('UndirectedGraph.from: inconsistent "'+n.type+'" type in given options!');return t.call(this,n)||this}return r(e,t),e}(xt),Lt=function(t){function e(e){var n=u({multi:!0},e);if("multi"in n&&!0!==n.multi)throw new C("MultiGraph.from: inconsistent indication that the graph should be simple in given options!");return t.call(this,n)||this}return r(e,t),e}(xt),St=function(t){function e(e){var n=u({type:"directed",multi:!0},e);if("multi"in n&&!0!==n.multi)throw new C("MultiDirectedGraph.from: inconsistent indication that the graph should be simple in given options!");if("directed"!==n.type)throw new C('MultiDirectedGraph.from: inconsistent "'+n.type+'" type in given options!');return t.call(this,n)||this}return r(e,t),e}(xt),Dt=function(t){function e(e){var n=u({type:"undirected",multi:!0},e);if("multi"in n&&!0!==n.multi)throw new C("MultiUndirectedGraph.from: inconsistent indication that the graph should be simple in given options!");if("undirected"!==n.type)throw new C('MultiUndirectedGraph.from: inconsistent "'+n.type+'" type in given options!');return t.call(this,n)||this}return r(e,t),e}(xt);function Ut(t){t.from=function(e,n){var r=u({},e.options,n),i=new t(r);return i.import(e),i}}return Ut(xt),Ut(Et),Ut(At),Ut(Lt),Ut(St),Ut(Dt),xt.Graph=xt,xt.DirectedGraph=Et,xt.UndirectedGraph=At,xt.MultiGraph=Lt,xt.MultiDirectedGraph=St,xt.MultiUndirectedGraph=Dt,xt.InvalidArgumentsGraphError=C,xt.NotFoundGraphError=M,xt.UsageGraphError=z,xt}));
//# sourceMappingURL=graphology.umd.min.js.map
`;

// raw::C:\git-personal\worktrees\vault-graph-plugin\vendor\sigma.min.js
var sigma_min_default = '(function(Ee,ue){typeof exports=="object"&&typeof module<"u"?module.exports=ue():typeof define=="function"&&define.amd?define(ue):(Ee=typeof globalThis<"u"?globalThis:Ee||self,Ee.Sigma=ue())})(this,function(){"use strict";function Ee(r,e){if(typeof r!="object"||!r)return r;var t=r[Symbol.toPrimitive];if(t!==void 0){var n=t.call(r,e);if(typeof n!="object")return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(r)}function ue(r){var e=Ee(r,"string");return typeof e=="symbol"?e:e+""}function ne(r,e){if(!(r instanceof e))throw new TypeError("Cannot call a class as a function")}function oi(r,e){for(var t=0;t<e.length;t++){var n=e[t];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(r,ue(n.key),n)}}function ie(r,e,t){return e&&oi(r.prototype,e),Object.defineProperty(r,"prototype",{writable:!1}),r}function he(r){return he=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(e){return e.__proto__||Object.getPrototypeOf(e)},he(r)}function lr(){try{var r=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){}))}catch{}return(lr=function(){return!!r})()}function ai(r){if(r===void 0)throw new ReferenceError("this hasn\'t been initialised - super() hasn\'t been called");return r}function si(r,e){if(e&&(typeof e=="object"||typeof e=="function"))return e;if(e!==void 0)throw new TypeError("Derived constructors may only return object or undefined");return ai(r)}function Te(r,e,t){return e=he(e),si(r,lr()?Reflect.construct(e,t||[],he(r).constructor):e.apply(r,t))}function tt(r,e){return tt=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(t,n){return t.__proto__=n,t},tt(r,e)}function Re(r,e){if(typeof e!="function"&&e!==null)throw new TypeError("Super expression must either be null or a function");r.prototype=Object.create(e&&e.prototype,{constructor:{value:r,writable:!0,configurable:!0}}),Object.defineProperty(r,"prototype",{writable:!1}),e&&tt(r,e)}var rt={black:"#000000",silver:"#C0C0C0",gray:"#808080",grey:"#808080",white:"#FFFFFF",maroon:"#800000",red:"#FF0000",purple:"#800080",fuchsia:"#FF00FF",green:"#008000",lime:"#00FF00",olive:"#808000",yellow:"#FFFF00",navy:"#000080",blue:"#0000FF",teal:"#008080",aqua:"#00FFFF",darkblue:"#00008B",mediumblue:"#0000CD",darkgreen:"#006400",darkcyan:"#008B8B",deepskyblue:"#00BFFF",darkturquoise:"#00CED1",mediumspringgreen:"#00FA9A",springgreen:"#00FF7F",cyan:"#00FFFF",midnightblue:"#191970",dodgerblue:"#1E90FF",lightseagreen:"#20B2AA",forestgreen:"#228B22",seagreen:"#2E8B57",darkslategray:"#2F4F4F",darkslategrey:"#2F4F4F",limegreen:"#32CD32",mediumseagreen:"#3CB371",turquoise:"#40E0D0",royalblue:"#4169E1",steelblue:"#4682B4",darkslateblue:"#483D8B",mediumturquoise:"#48D1CC",indigo:"#4B0082",darkolivegreen:"#556B2F",cadetblue:"#5F9EA0",cornflowerblue:"#6495ED",rebeccapurple:"#663399",mediumaquamarine:"#66CDAA",dimgray:"#696969",dimgrey:"#696969",slateblue:"#6A5ACD",olivedrab:"#6B8E23",slategray:"#708090",slategrey:"#708090",lightslategray:"#778899",lightslategrey:"#778899",mediumslateblue:"#7B68EE",lawngreen:"#7CFC00",chartreuse:"#7FFF00",aquamarine:"#7FFFD4",skyblue:"#87CEEB",lightskyblue:"#87CEFA",blueviolet:"#8A2BE2",darkred:"#8B0000",darkmagenta:"#8B008B",saddlebrown:"#8B4513",darkseagreen:"#8FBC8F",lightgreen:"#90EE90",mediumpurple:"#9370DB",darkviolet:"#9400D3",palegreen:"#98FB98",darkorchid:"#9932CC",yellowgreen:"#9ACD32",sienna:"#A0522D",brown:"#A52A2A",darkgray:"#A9A9A9",darkgrey:"#A9A9A9",lightblue:"#ADD8E6",greenyellow:"#ADFF2F",paleturquoise:"#AFEEEE",lightsteelblue:"#B0C4DE",powderblue:"#B0E0E6",firebrick:"#B22222",darkgoldenrod:"#B8860B",mediumorchid:"#BA55D3",rosybrown:"#BC8F8F",darkkhaki:"#BDB76B",mediumvioletred:"#C71585",indianred:"#CD5C5C",peru:"#CD853F",chocolate:"#D2691E",tan:"#D2B48C",lightgray:"#D3D3D3",lightgrey:"#D3D3D3",thistle:"#D8BFD8",orchid:"#DA70D6",goldenrod:"#DAA520",palevioletred:"#DB7093",crimson:"#DC143C",gainsboro:"#DCDCDC",plum:"#DDA0DD",burlywood:"#DEB887",lightcyan:"#E0FFFF",lavender:"#E6E6FA",darksalmon:"#E9967A",violet:"#EE82EE",palegoldenrod:"#EEE8AA",lightcoral:"#F08080",khaki:"#F0E68C",aliceblue:"#F0F8FF",honeydew:"#F0FFF0",azure:"#F0FFFF",sandybrown:"#F4A460",wheat:"#F5DEB3",beige:"#F5F5DC",whitesmoke:"#F5F5F5",mintcream:"#F5FFFA",ghostwhite:"#F8F8FF",salmon:"#FA8072",antiquewhite:"#FAEBD7",linen:"#FAF0E6",lightgoldenrodyellow:"#FAFAD2",oldlace:"#FDF5E6",magenta:"#FF00FF",deeppink:"#FF1493",orangered:"#FF4500",tomato:"#FF6347",hotpink:"#FF69B4",coral:"#FF7F50",darkorange:"#FF8C00",lightsalmon:"#FFA07A",orange:"#FFA500",lightpink:"#FFB6C1",pink:"#FFC0CB",gold:"#FFD700",peachpuff:"#FFDAB9",navajowhite:"#FFDEAD",moccasin:"#FFE4B5",bisque:"#FFE4C4",mistyrose:"#FFE4E1",blanchedalmond:"#FFEBCD",papayawhip:"#FFEFD5",lavenderblush:"#FFF0F5",seashell:"#FFF5EE",cornsilk:"#FFF8DC",lemonchiffon:"#FFFACD",floralwhite:"#FFFAF0",snow:"#FFFAFA",lightyellow:"#FFFFE0",ivory:"#FFFFF0"},ur=new Int8Array(4),Oe=new Int32Array(ur.buffer,0,1),hr=new Float32Array(ur.buffer,0,1),ci=/^\\s*rgba?\\s*\\(/,li=/^\\s*rgba?\\s*\\(\\s*([0-9]*)\\s*,\\s*([0-9]*)\\s*,\\s*([0-9]*)(?:\\s*,\\s*(.*)?)?\\)\\s*$/;function ui(r){var e=0,t=0,n=0,i=1;if(r[0]==="#")r.length===4?(e=parseInt(r.charAt(1)+r.charAt(1),16),t=parseInt(r.charAt(2)+r.charAt(2),16),n=parseInt(r.charAt(3)+r.charAt(3),16)):(e=parseInt(r.charAt(1)+r.charAt(2),16),t=parseInt(r.charAt(3)+r.charAt(4),16),n=parseInt(r.charAt(5)+r.charAt(6),16)),r.length===9&&(i=parseInt(r.charAt(7)+r.charAt(8),16)/255);else if(ci.test(r)){var o=r.match(li);o&&(e=+o[1],t=+o[2],n=+o[3],o[4]&&(i=+o[4]))}return{r:e,g:t,b:n,a:i}}var de={};for(var De in rt)de[De]=X(rt[De]),de[rt[De]]=de[De];function dr(r,e,t,n,i){return Oe[0]=n<<24|t<<16|e<<8|r,Oe[0]=Oe[0]&4278190079,hr[0]}function X(r){if(r=r.toLowerCase(),typeof de[r]<"u")return de[r];var e=ui(r),t=e.r,n=e.g,i=e.b,o=e.a;o=o*255|0;var a=dr(t,n,i,o);return de[r]=a,a}function nt(r,e){hr[0]=X(r);var t=Oe[0],n=t&255,i=t>>8&255,o=t>>16&255,a=t>>24&255;return[n,i,o,a]}var it={};function fr(r){if(typeof it[r]<"u")return it[r];var e=(r&16711680)>>>16,t=(r&65280)>>>8,n=r&255,i=255,o=dr(e,t,n,i);return it[r]=o,o}function I(r,e,t){return(e=ue(e))in r?Object.defineProperty(r,e,{value:t,enumerable:!0,configurable:!0,writable:!0}):r[e]=t,r}function gr(r,e){var t=Object.keys(r);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(r);e&&(n=n.filter(function(i){return Object.getOwnPropertyDescriptor(r,i).enumerable})),t.push.apply(t,n)}return t}function fe(r){for(var e=1;e<arguments.length;e++){var t=arguments[e]!=null?arguments[e]:{};e%2?gr(Object(t),!0).forEach(function(n){I(r,n,t[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(r,Object.getOwnPropertyDescriptors(t)):gr(Object(t)).forEach(function(n){Object.defineProperty(r,n,Object.getOwnPropertyDescriptor(t,n))})}return r}function hi(r,e){for(;!{}.hasOwnProperty.call(r,e)&&(r=he(r))!==null;);return r}function ot(){return ot=typeof Reflect<"u"&&Reflect.get?Reflect.get.bind():function(r,e,t){var n=hi(r,e);if(n){var i=Object.getOwnPropertyDescriptor(n,e);return i.get?i.get.call(arguments.length<3?r:t):i.value}},ot.apply(null,arguments)}function mr(r,e,t,n){var i=ot(he(r.prototype),e,t);return typeof i=="function"?function(o){return i.apply(t,o)}:i}function di(r){return r.normalized?1:r.size}function at(r){var e=0;return r.forEach(function(t){return e+=di(t)}),e}function vr(r,e,t){var n=r==="VERTEX"?e.VERTEX_SHADER:e.FRAGMENT_SHADER,i=e.createShader(n);if(i===null)throw new Error("loadShader: error while creating the shader");e.shaderSource(i,t),e.compileShader(i);var o=e.getShaderParameter(i,e.COMPILE_STATUS);if(!o){var a=e.getShaderInfoLog(i);throw e.deleteShader(i),new Error(`loadShader: error while compiling the shader:\n`.concat(a,`\n`).concat(t))}return i}function fi(r,e){return vr("VERTEX",r,e)}function gi(r,e){return vr("FRAGMENT",r,e)}function mi(r,e){var t=r.createProgram();if(t===null)throw new Error("loadProgram: error while creating the program.");var n,i;for(n=0,i=e.length;n<i;n++)r.attachShader(t,e[n]);r.linkProgram(t);var o=r.getProgramParameter(t,r.LINK_STATUS);if(!o)throw r.deleteProgram(t),new Error("loadProgram: error while linking the program.");return t}function pr(r){var e=r.gl,t=r.buffer,n=r.program,i=r.vertexShader,o=r.fragmentShader;e.deleteShader(i),e.deleteShader(o),e.deleteProgram(n),e.deleteBuffer(t)}function st(r){return r%1===0?r.toFixed(1):r.toString()}var _r=`#define PICKING_MODE\n`,vi=I(I(I(I(I(I(I(I({},WebGL2RenderingContext.BOOL,1),WebGL2RenderingContext.BYTE,1),WebGL2RenderingContext.UNSIGNED_BYTE,1),WebGL2RenderingContext.SHORT,2),WebGL2RenderingContext.UNSIGNED_SHORT,2),WebGL2RenderingContext.INT,4),WebGL2RenderingContext.UNSIGNED_INT,4),WebGL2RenderingContext.FLOAT,4),br=function(){function r(e,t,n){ne(this,r),I(this,"array",new Float32Array),I(this,"constantArray",new Float32Array),I(this,"capacity",0),I(this,"verticesCount",0);var i=this.getDefinition();if(this.VERTICES=i.VERTICES,this.VERTEX_SHADER_SOURCE=i.VERTEX_SHADER_SOURCE,this.FRAGMENT_SHADER_SOURCE=i.FRAGMENT_SHADER_SOURCE,this.UNIFORMS=i.UNIFORMS,this.ATTRIBUTES=i.ATTRIBUTES,this.METHOD=i.METHOD,this.CONSTANT_ATTRIBUTES="CONSTANT_ATTRIBUTES"in i?i.CONSTANT_ATTRIBUTES:[],this.CONSTANT_DATA="CONSTANT_DATA"in i?i.CONSTANT_DATA:[],this.isInstanced="CONSTANT_ATTRIBUTES"in i,this.ATTRIBUTES_ITEMS_COUNT=at(this.ATTRIBUTES),this.STRIDE=this.VERTICES*this.ATTRIBUTES_ITEMS_COUNT,this.renderer=n,this.normalProgram=this.getProgramInfo("normal",e,i.VERTEX_SHADER_SOURCE,i.FRAGMENT_SHADER_SOURCE,null),this.pickProgram=t?this.getProgramInfo("pick",e,_r+i.VERTEX_SHADER_SOURCE,_r+i.FRAGMENT_SHADER_SOURCE,t):null,this.isInstanced){var o=at(this.CONSTANT_ATTRIBUTES);if(this.CONSTANT_DATA.length!==this.VERTICES)throw new Error("Program: error while getting constant data (expected ".concat(this.VERTICES," items, received ").concat(this.CONSTANT_DATA.length," instead)"));this.constantArray=new Float32Array(this.CONSTANT_DATA.length*o);for(var a=0;a<this.CONSTANT_DATA.length;a++){var s=this.CONSTANT_DATA[a];if(s.length!==o)throw new Error("Program: error while getting constant data (one vector has ".concat(s.length," items instead of ").concat(o,")"));for(var l=0;l<s.length;l++)this.constantArray[a*o+l]=s[l]}this.STRIDE=this.ATTRIBUTES_ITEMS_COUNT}}return ie(r,[{key:"kill",value:function(){pr(this.normalProgram),this.pickProgram&&(pr(this.pickProgram),this.pickProgram=null)}},{key:"getProgramInfo",value:function(t,n,i,o,a){var s=this.getDefinition(),l=n.createBuffer();if(l===null)throw new Error("Program: error while creating the WebGL buffer.");var c=fi(n,i),u=gi(n,o),d=mi(n,[c,u]),h={};s.UNIFORMS.forEach(function(b){var E=n.getUniformLocation(d,b);E&&(h[b]=E)});var m={};s.ATTRIBUTES.forEach(function(b){m[b.name]=n.getAttribLocation(d,b.name)});var g;if("CONSTANT_ATTRIBUTES"in s&&(s.CONSTANT_ATTRIBUTES.forEach(function(b){m[b.name]=n.getAttribLocation(d,b.name)}),g=n.createBuffer(),g===null))throw new Error("Program: error while creating the WebGL constant buffer.");return{name:t,program:d,gl:n,frameBuffer:a,buffer:l,constantBuffer:g||{},uniformLocations:h,attributeLocations:m,isPicking:t==="pick",vertexShader:c,fragmentShader:u}}},{key:"bindProgram",value:function(t){var n=this,i=0,o=t.gl,a=t.buffer;this.isInstanced?(o.bindBuffer(o.ARRAY_BUFFER,t.constantBuffer),i=0,this.CONSTANT_ATTRIBUTES.forEach(function(s){return i+=n.bindAttribute(s,t,i,!1)}),o.bufferData(o.ARRAY_BUFFER,this.constantArray,o.STATIC_DRAW),o.bindBuffer(o.ARRAY_BUFFER,t.buffer),i=0,this.ATTRIBUTES.forEach(function(s){return i+=n.bindAttribute(s,t,i,!0)}),o.bufferData(o.ARRAY_BUFFER,this.array,o.DYNAMIC_DRAW)):(o.bindBuffer(o.ARRAY_BUFFER,a),i=0,this.ATTRIBUTES.forEach(function(s){return i+=n.bindAttribute(s,t,i)}),o.bufferData(o.ARRAY_BUFFER,this.array,o.DYNAMIC_DRAW)),o.bindBuffer(o.ARRAY_BUFFER,null)}},{key:"unbindProgram",value:function(t){var n=this;this.isInstanced?(this.CONSTANT_ATTRIBUTES.forEach(function(i){return n.unbindAttribute(i,t,!1)}),this.ATTRIBUTES.forEach(function(i){return n.unbindAttribute(i,t,!0)})):this.ATTRIBUTES.forEach(function(i){return n.unbindAttribute(i,t)})}},{key:"bindAttribute",value:function(t,n,i,o){var a=vi[t.type];if(typeof a!="number")throw new Error(\'Program.bind: yet unsupported attribute type "\'.concat(t.type,\'"\'));var s=n.attributeLocations[t.name],l=n.gl;if(s!==-1){l.enableVertexAttribArray(s);var c=this.isInstanced?(o?this.ATTRIBUTES_ITEMS_COUNT:at(this.CONSTANT_ATTRIBUTES))*Float32Array.BYTES_PER_ELEMENT:this.ATTRIBUTES_ITEMS_COUNT*Float32Array.BYTES_PER_ELEMENT;if(l.vertexAttribPointer(s,t.size,t.type,t.normalized||!1,c,i),this.isInstanced&&o)if(l instanceof WebGL2RenderingContext)l.vertexAttribDivisor(s,1);else{var u=l.getExtension("ANGLE_instanced_arrays");u&&u.vertexAttribDivisorANGLE(s,1)}}return t.size*a}},{key:"unbindAttribute",value:function(t,n,i){var o=n.attributeLocations[t.name],a=n.gl;if(o!==-1&&(a.disableVertexAttribArray(o),this.isInstanced&&i))if(a instanceof WebGL2RenderingContext)a.vertexAttribDivisor(o,0);else{var s=a.getExtension("ANGLE_instanced_arrays");s&&s.vertexAttribDivisorANGLE(o,0)}}},{key:"reallocate",value:function(t){t!==this.capacity&&(this.capacity=t,this.verticesCount=this.VERTICES*t,this.array=new Float32Array(this.isInstanced?this.capacity*this.ATTRIBUTES_ITEMS_COUNT:this.verticesCount*this.ATTRIBUTES_ITEMS_COUNT))}},{key:"hasNothingToRender",value:function(){return this.verticesCount===0}},{key:"renderProgram",value:function(t,n){var i=n.gl,o=n.program;i.enable(i.BLEND),i.useProgram(o),this.setUniforms(t,n),this.drawWebGL(this.METHOD,n)}},{key:"render",value:function(t){this.hasNothingToRender()||(this.pickProgram&&(this.pickProgram.gl.viewport(0,0,t.width*t.pixelRatio/t.downSizingRatio,t.height*t.pixelRatio/t.downSizingRatio),this.bindProgram(this.pickProgram),this.renderProgram(fe(fe({},t),{},{pixelRatio:t.pixelRatio/t.downSizingRatio}),this.pickProgram),this.unbindProgram(this.pickProgram)),this.normalProgram.gl.viewport(0,0,t.width*t.pixelRatio,t.height*t.pixelRatio),this.bindProgram(this.normalProgram),this.renderProgram(t,this.normalProgram),this.unbindProgram(this.normalProgram))}},{key:"drawWebGL",value:function(t,n){var i=n.gl,o=n.frameBuffer;if(i.bindFramebuffer(i.FRAMEBUFFER,o),!this.isInstanced)i.drawArrays(t,0,this.verticesCount);else if(i instanceof WebGL2RenderingContext)i.drawArraysInstanced(t,0,this.VERTICES,this.capacity);else{var a=i.getExtension("ANGLE_instanced_arrays");a&&a.drawArraysInstancedANGLE(t,0,this.VERTICES,this.capacity)}}}])}(),ke=function(r){function e(){return ne(this,e),Te(this,e,arguments)}return Re(e,r),ie(e,[{key:"kill",value:function(){mr(e,"kill",this)([])}},{key:"process",value:function(n,i,o){var a=i*this.STRIDE;if(o.hidden){for(var s=a+this.STRIDE;a<s;a++)this.array[a]=0;return}return this.processVisibleItem(fr(n),a,o)}}])}(br),ct=function(r){function e(){var t;ne(this,e);for(var n=arguments.length,i=new Array(n),o=0;o<n;o++)i[o]=arguments[o];return t=Te(this,e,[].concat(i)),I(t,"drawLabel",void 0),t}return Re(e,r),ie(e,[{key:"kill",value:function(){mr(e,"kill",this)([])}},{key:"process",value:function(n,i,o,a,s){var l=i*this.STRIDE;if(s.hidden||o.hidden||a.hidden){for(var c=l+this.STRIDE;l<c;l++)this.array[l]=0;return}return this.processVisibleItem(fr(n),l,o,a,s)}}])}(br);function pi(r,e){return function(){function t(n,i,o){ne(this,t),I(this,"drawLabel",e),this.programs=r.map(function(a){return new a(n,i,o)})}return ie(t,[{key:"reallocate",value:function(i){this.programs.forEach(function(o){return o.reallocate(i)})}},{key:"process",value:function(i,o,a,s,l){this.programs.forEach(function(c){return c.process(i,o,a,s,l)})}},{key:"render",value:function(i){this.programs.forEach(function(o){return o.render(i)})}},{key:"kill",value:function(){this.programs.forEach(function(i){return i.kill()})}}])}()}var _i=`\nprecision highp float;\n\nvarying vec4 v_color;\nvarying vec2 v_diffVector;\nvarying float v_radius;\n\nuniform float u_correctionRatio;\n\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nvoid main(void) {\n  float border = u_correctionRatio * 2.0;\n  float dist = length(v_diffVector) - v_radius + border;\n\n  // No antialiasing for picking mode:\n  #ifdef PICKING_MODE\n  if (dist > border)\n    gl_FragColor = transparent;\n  else\n    gl_FragColor = v_color;\n\n  #else\n  float t = 0.0;\n  if (dist > border)\n    t = 1.0;\n  else if (dist > 0.0)\n    t = dist / border;\n\n  gl_FragColor = mix(v_color, transparent, t);\n  #endif\n}\n`,bi=_i,yi=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_position;\nattribute float a_size;\nattribute float a_angle;\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_correctionRatio;\n\nvarying vec4 v_color;\nvarying vec2 v_diffVector;\nvarying float v_radius;\nvarying float v_border;\n\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;\n  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));\n  vec2 position = a_position + diffVector;\n  gl_Position = vec4(\n    (u_matrix * vec3(position, 1)).xy,\n    0,\n    1\n  );\n\n  v_diffVector = diffVector;\n  v_radius = size / 2.0;\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,Ei=yi,yr=WebGLRenderingContext,Er=yr.UNSIGNED_BYTE,lt=yr.FLOAT,Ti=["u_sizeRatio","u_correctionRatio","u_matrix"],ut=function(r){function e(){return ne(this,e),Te(this,e,arguments)}return Re(e,r),ie(e,[{key:"getDefinition",value:function(){return{VERTICES:3,VERTEX_SHADER_SOURCE:Ei,FRAGMENT_SHADER_SOURCE:bi,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Ti,ATTRIBUTES:[{name:"a_position",size:2,type:lt},{name:"a_size",size:1,type:lt},{name:"a_color",size:4,type:Er,normalized:!0},{name:"a_id",size:4,type:Er,normalized:!0}],CONSTANT_ATTRIBUTES:[{name:"a_angle",size:1,type:lt}],CONSTANT_DATA:[[e.ANGLE_1],[e.ANGLE_2],[e.ANGLE_3]]}}},{key:"processVisibleItem",value:function(n,i,o){var a=this.array,s=X(o.color);a[i++]=o.x,a[i++]=o.y,a[i++]=o.size,a[i++]=s,a[i++]=n}},{key:"setUniforms",value:function(n,i){var o=i.gl,a=i.uniformLocations,s=a.u_sizeRatio,l=a.u_correctionRatio,c=a.u_matrix;o.uniform1f(l,n.correctionRatio),o.uniform1f(s,n.sizeRatio),o.uniformMatrix3fv(c,!1,n.matrix)}}])}(ke);I(ut,"ANGLE_1",0),I(ut,"ANGLE_2",2*Math.PI/3),I(ut,"ANGLE_3",4*Math.PI/3);var Ri=`\nprecision mediump float;\n\nvarying vec4 v_color;\n\nvoid main(void) {\n  gl_FragColor = v_color;\n}\n`,Ci=Ri,wi=`\nattribute vec2 a_position;\nattribute vec2 a_normal;\nattribute float a_radius;\nattribute vec3 a_barycentric;\n\n#ifdef PICKING_MODE\nattribute vec4 a_id;\n#else\nattribute vec4 a_color;\n#endif\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_correctionRatio;\nuniform float u_minEdgeThickness;\nuniform float u_lengthToThicknessRatio;\nuniform float u_widenessToThicknessRatio;\n\nvarying vec4 v_color;\n\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  float minThickness = u_minEdgeThickness;\n\n  float normalLength = length(a_normal);\n  vec2 unitNormal = a_normal / normalLength;\n\n  // These first computations are taken from edge.vert.glsl and\n  // edge.clamped.vert.glsl. Please read it to get better comments on what\'s\n  // happening:\n  float pixelsThickness = max(normalLength / u_sizeRatio, minThickness);\n  float webGLThickness = pixelsThickness * u_correctionRatio;\n  float webGLNodeRadius = a_radius * 2.0 * u_correctionRatio / u_sizeRatio;\n  float webGLArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;\n  float webGLArrowHeadThickness = webGLThickness * u_widenessToThicknessRatio;\n\n  float da = a_barycentric.x;\n  float db = a_barycentric.y;\n  float dc = a_barycentric.z;\n\n  vec2 delta = vec2(\n      da * (webGLNodeRadius * unitNormal.y)\n    + db * ((webGLNodeRadius + webGLArrowHeadLength) * unitNormal.y + webGLArrowHeadThickness * unitNormal.x)\n    + dc * ((webGLNodeRadius + webGLArrowHeadLength) * unitNormal.y - webGLArrowHeadThickness * unitNormal.x),\n\n      da * (-webGLNodeRadius * unitNormal.x)\n    + db * (-(webGLNodeRadius + webGLArrowHeadLength) * unitNormal.x + webGLArrowHeadThickness * unitNormal.y)\n    + dc * (-(webGLNodeRadius + webGLArrowHeadLength) * unitNormal.x - webGLArrowHeadThickness * unitNormal.y)\n  );\n\n  vec2 position = (u_matrix * vec3(a_position + delta, 1)).xy;\n\n  gl_Position = vec4(position, 0, 1);\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,Ai=wi,Tr=WebGLRenderingContext,Rr=Tr.UNSIGNED_BYTE,Ie=Tr.FLOAT,Si=["u_matrix","u_sizeRatio","u_correctionRatio","u_minEdgeThickness","u_lengthToThicknessRatio","u_widenessToThicknessRatio"],ze={extremity:"target",lengthToThicknessRatio:2.5,widenessToThicknessRatio:2};function Cr(r){var e=fe(fe({},ze),{});return function(t){function n(){return ne(this,n),Te(this,n,arguments)}return Re(n,t),ie(n,[{key:"getDefinition",value:function(){return{VERTICES:3,VERTEX_SHADER_SOURCE:Ai,FRAGMENT_SHADER_SOURCE:Ci,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Si,ATTRIBUTES:[{name:"a_position",size:2,type:Ie},{name:"a_normal",size:2,type:Ie},{name:"a_radius",size:1,type:Ie},{name:"a_color",size:4,type:Rr,normalized:!0},{name:"a_id",size:4,type:Rr,normalized:!0}],CONSTANT_ATTRIBUTES:[{name:"a_barycentric",size:3,type:Ie}],CONSTANT_DATA:[[1,0,0],[0,1,0],[0,0,1]]}}},{key:"processVisibleItem",value:function(o,a,s,l,c){if(e.extremity==="source"){var u=[l,s];s=u[0],l=u[1]}var d=c.size||1,h=l.size||1,m=s.x,g=s.y,b=l.x,E=l.y,v=X(c.color),T=b-m,_=E-g,f=T*T+_*_,p=0,y=0;f&&(f=1/Math.sqrt(f),p=-_*f*d,y=T*f*d);var R=this.array;R[a++]=b,R[a++]=E,R[a++]=-p,R[a++]=-y,R[a++]=h,R[a++]=v,R[a++]=o}},{key:"setUniforms",value:function(o,a){var s=a.gl,l=a.uniformLocations,c=l.u_matrix,u=l.u_sizeRatio,d=l.u_correctionRatio,h=l.u_minEdgeThickness,m=l.u_lengthToThicknessRatio,g=l.u_widenessToThicknessRatio;s.uniformMatrix3fv(c,!1,o.matrix),s.uniform1f(u,o.sizeRatio),s.uniform1f(d,o.correctionRatio),s.uniform1f(h,o.minEdgeThickness),s.uniform1f(m,e.lengthToThicknessRatio),s.uniform1f(g,e.widenessToThicknessRatio)}}])}(ct)}Cr();var xi=`\nprecision mediump float;\n\nvarying vec4 v_color;\nvarying vec2 v_normal;\nvarying float v_thickness;\nvarying float v_feather;\n\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nvoid main(void) {\n  // We only handle antialiasing for normal mode:\n  #ifdef PICKING_MODE\n  gl_FragColor = v_color;\n  #else\n  float dist = length(v_normal) * v_thickness;\n\n  float t = smoothstep(\n    v_thickness - v_feather,\n    v_thickness,\n    dist\n  );\n\n  gl_FragColor = mix(v_color, transparent, t);\n  #endif\n}\n`,Li=xi,Fi=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_normal;\nattribute float a_normalCoef;\nattribute vec2 a_positionStart;\nattribute vec2 a_positionEnd;\nattribute float a_positionCoef;\nattribute float a_radius;\nattribute float a_radiusCoef;\n\nuniform mat3 u_matrix;\nuniform float u_zoomRatio;\nuniform float u_sizeRatio;\nuniform float u_pixelRatio;\nuniform float u_correctionRatio;\nuniform float u_minEdgeThickness;\nuniform float u_lengthToThicknessRatio;\nuniform float u_feather;\n\nvarying vec4 v_color;\nvarying vec2 v_normal;\nvarying float v_thickness;\nvarying float v_feather;\n\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  float minThickness = u_minEdgeThickness;\n\n  float radius = a_radius * a_radiusCoef;\n  vec2 normal = a_normal * a_normalCoef;\n  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;\n\n  float normalLength = length(normal);\n  vec2 unitNormal = normal / normalLength;\n\n  // These first computations are taken from edge.vert.glsl. Please read it to\n  // get better comments on what\'s happening:\n  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);\n  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;\n\n  // Here, we move the point to leave space for the arrow head:\n  float direction = sign(radius);\n  float webGLNodeRadius = direction * radius * 2.0 * u_correctionRatio / u_sizeRatio;\n  float webGLArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;\n\n  vec2 compensationVector = vec2(-direction * unitNormal.y, direction * unitNormal.x) * (webGLNodeRadius + webGLArrowHeadLength);\n\n  // Here is the proper position of the vertex\n  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness + compensationVector, 1)).xy, 0, 1);\n\n  v_thickness = webGLThickness / u_zoomRatio;\n\n  v_normal = unitNormal;\n\n  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,Ni=Fi,wr=WebGLRenderingContext,Ar=wr.UNSIGNED_BYTE,oe=wr.FLOAT,Pi=["u_matrix","u_zoomRatio","u_sizeRatio","u_correctionRatio","u_pixelRatio","u_feather","u_minEdgeThickness","u_lengthToThicknessRatio"],Oi={lengthToThicknessRatio:ze.lengthToThicknessRatio};function Sr(r){var e=fe(fe({},Oi),{});return function(t){function n(){return ne(this,n),Te(this,n,arguments)}return Re(n,t),ie(n,[{key:"getDefinition",value:function(){return{VERTICES:6,VERTEX_SHADER_SOURCE:Ni,FRAGMENT_SHADER_SOURCE:Li,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Pi,ATTRIBUTES:[{name:"a_positionStart",size:2,type:oe},{name:"a_positionEnd",size:2,type:oe},{name:"a_normal",size:2,type:oe},{name:"a_color",size:4,type:Ar,normalized:!0},{name:"a_id",size:4,type:Ar,normalized:!0},{name:"a_radius",size:1,type:oe}],CONSTANT_ATTRIBUTES:[{name:"a_positionCoef",size:1,type:oe},{name:"a_normalCoef",size:1,type:oe},{name:"a_radiusCoef",size:1,type:oe}],CONSTANT_DATA:[[0,1,0],[0,-1,0],[1,1,1],[1,1,1],[0,-1,0],[1,-1,-1]]}}},{key:"processVisibleItem",value:function(o,a,s,l,c){var u=c.size||1,d=s.x,h=s.y,m=l.x,g=l.y,b=X(c.color),E=m-d,v=g-h,T=l.size||1,_=E*E+v*v,f=0,p=0;_&&(_=1/Math.sqrt(_),f=-v*_*u,p=E*_*u);var y=this.array;y[a++]=d,y[a++]=h,y[a++]=m,y[a++]=g,y[a++]=f,y[a++]=p,y[a++]=b,y[a++]=o,y[a++]=T}},{key:"setUniforms",value:function(o,a){var s=a.gl,l=a.uniformLocations,c=l.u_matrix,u=l.u_zoomRatio,d=l.u_feather,h=l.u_pixelRatio,m=l.u_correctionRatio,g=l.u_sizeRatio,b=l.u_minEdgeThickness,E=l.u_lengthToThicknessRatio;s.uniformMatrix3fv(c,!1,o.matrix),s.uniform1f(u,o.zoomRatio),s.uniform1f(g,o.sizeRatio),s.uniform1f(m,o.correctionRatio),s.uniform1f(h,o.pixelRatio),s.uniform1f(d,o.antiAliasingFeather),s.uniform1f(b,o.minEdgeThickness),s.uniform1f(E,e.lengthToThicknessRatio)}}])}(ct)}Sr();function Di(r){return pi([Sr(),Cr()])}Di();function ki(r){return r&&r.__esModule&&Object.prototype.hasOwnProperty.call(r,"default")?r.default:r}var ht,xr;function Ii(){return xr||(xr=1,ht=function(e){return e!==null&&typeof e=="object"&&typeof e.addUndirectedEdgeWithKey=="function"&&typeof e.dropNode=="function"&&typeof e.multi=="boolean"}),ht}var zi=Ii();const Gi=ki(zi);function Mi(r,e){if(typeof r!="object"||!r)return r;var t=r[Symbol.toPrimitive];if(t!==void 0){var n=t.call(r,e);if(typeof n!="object")return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(r)}function Lr(r){var e=Mi(r,"string");return typeof e=="symbol"?e:e+""}function Fr(r,e,t){return(e=Lr(e))in r?Object.defineProperty(r,e,{value:t,enumerable:!0,configurable:!0,writable:!0}):r[e]=t,r}function Nr(r,e){var t=Object.keys(r);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(r);e&&(n=n.filter(function(i){return Object.getOwnPropertyDescriptor(r,i).enumerable})),t.push.apply(t,n)}return t}function Ge(r){for(var e=1;e<arguments.length;e++){var t=arguments[e]!=null?arguments[e]:{};e%2?Nr(Object(t),!0).forEach(function(n){Fr(r,n,t[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(r,Object.getOwnPropertyDescriptors(t)):Nr(Object(t)).forEach(function(n){Object.defineProperty(r,n,Object.getOwnPropertyDescriptor(t,n))})}return r}function Ui(r,e){if(!(r instanceof e))throw new TypeError("Cannot call a class as a function")}function Bi(r,e){for(var t=0;t<e.length;t++){var n=e[t];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(r,Lr(n.key),n)}}function Hi(r,e,t){return e&&Bi(r.prototype,e),Object.defineProperty(r,"prototype",{writable:!1}),r}function Me(r){return Me=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(e){return e.__proto__||Object.getPrototypeOf(e)},Me(r)}function Pr(){try{var r=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){}))}catch{}return(Pr=function(){return!!r})()}function $i(r){if(r===void 0)throw new ReferenceError("this hasn\'t been initialised - super() hasn\'t been called");return r}function ji(r,e){if(e&&(typeof e=="object"||typeof e=="function"))return e;if(e!==void 0)throw new TypeError("Derived constructors may only return object or undefined");return $i(r)}function Vi(r,e,t){return e=Me(e),ji(r,Pr()?Reflect.construct(e,t||[],Me(r).constructor):e.apply(r,t))}function dt(r,e){return dt=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(t,n){return t.__proto__=n,t},dt(r,e)}function Wi(r,e){if(typeof e!="function"&&e!==null)throw new TypeError("Super expression must either be null or a function");r.prototype=Object.create(e&&e.prototype,{constructor:{value:r,writable:!0,configurable:!0}}),Object.defineProperty(r,"prototype",{writable:!1}),e&&dt(r,e)}function ft(r,e){(e==null||e>r.length)&&(e=r.length);for(var t=0,n=Array(e);t<e;t++)n[t]=r[t];return n}function Yi(r){if(Array.isArray(r))return ft(r)}function Xi(r){if(typeof Symbol<"u"&&r[Symbol.iterator]!=null||r["@@iterator"]!=null)return Array.from(r)}function qi(r,e){if(r){if(typeof r=="string")return ft(r,e);var t={}.toString.call(r).slice(8,-1);return t==="Object"&&r.constructor&&(t=r.constructor.name),t==="Map"||t==="Set"?Array.from(r):t==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?ft(r,e):void 0}}function Ki(){throw new TypeError(`Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function gt(r){return Yi(r)||Xi(r)||qi(r)||Ki()}function Or(r,e,t,n){var i=Math.pow(1-r,2)*e.x+2*(1-r)*r*t.x+Math.pow(r,2)*n.x,o=Math.pow(1-r,2)*e.y+2*(1-r)*r*t.y+Math.pow(r,2)*n.y;return{x:i,y:o}}function Zi(r,e,t){for(var n=20,i=0,o=r,a=0;a<n;a++){var s=Or((a+1)/n,r,e,t);i+=Math.sqrt(Math.pow(o.x-s.x,2)+Math.pow(o.y-s.y,2)),o=s}return i}function Qi(r){var e=r.curvatureAttribute,t=r.defaultCurvature,n=r.keepLabelUpright,i=n===void 0?!0:n;return function(o,a,s,l,c){var u=c.edgeLabelSize,d=a[e]||t,h=c.edgeLabelFont,m=c.edgeLabelWeight,g=c.edgeLabelColor.attribute?a[c.edgeLabelColor.attribute]||c.edgeLabelColor.color||"#000":c.edgeLabelColor.color,b=a.label;if(b){o.fillStyle=g,o.font="".concat(m," ").concat(u,"px ").concat(h);var E=!i||s.x<l.x,v=E?s.x:l.x,T=E?s.y:l.y,_=E?l.x:s.x,f=E?l.y:s.y,p=(v+_)/2,y=(T+f)/2,R=_-v,S=f-T,F=Math.sqrt(Math.pow(R,2)+Math.pow(S,2)),x=E?1:-1,O=p+S*d*x,k=y-R*d*x,z=a.size*.7+5,M={x:k-T,y:-(O-v)},H=Math.sqrt(Math.pow(M.x,2)+Math.pow(M.y,2)),w={x:f-k,y:-(_-O)},C=Math.sqrt(Math.pow(w.x,2)+Math.pow(w.y,2));v+=z*M.x/H,T+=z*M.y/H,_+=z*w.x/C,f+=z*w.y/C,O+=z*S/F,k-=z*R/F;var A={x:O,y:k},N={x:v,y:T},L={x:_,y:f},P=Zi(N,A,L);if(!(P<s.size+l.size)){var D=o.measureText(b).width,U=P-s.size-l.size;if(D>U){var B="\u2026";for(b=b+B,D=o.measureText(b).width;D>U&&b.length>1;)b=b.slice(0,-2)+B,D=o.measureText(b).width;if(b.length<4)return}for(var Y={},J=0,ee=b.length;J<ee;J++){var sr=b[J];Y[sr]||(Y[sr]=o.measureText(sr).width*(1+d*.35))}for(var ye=.5-D/P/2,cr=0,fs=b.length;cr<fs;cr++){var ni=b[cr],ii=Or(ye,N,A,L),gs=2*(1-ye)*(O-v)+2*ye*(_-O),ms=2*(1-ye)*(k-T)+2*ye*(f-k),vs=Math.atan2(ms,gs);o.save(),o.translate(ii.x,ii.y),o.rotate(vs),o.fillText(ni,0,0),o.restore(),ye+=Y[ni]/P}}}}}function Ji(r){var e=r.arrowHead,t=(e==null?void 0:e.extremity)==="target"||(e==null?void 0:e.extremity)==="both",n=(e==null?void 0:e.extremity)==="source"||(e==null?void 0:e.extremity)==="both",i=`\nprecision highp float;\n\nvarying vec4 v_color;\nvarying float v_thickness;\nvarying float v_feather;\nvarying vec2 v_cpA;\nvarying vec2 v_cpB;\nvarying vec2 v_cpC;\n`.concat(t?`\nvarying float v_targetSize;\nvarying vec2 v_targetPoint;`:"",`\n`).concat(n?`\nvarying float v_sourceSize;\nvarying vec2 v_sourcePoint;`:"",`\n`).concat(e?`\nuniform float u_lengthToThicknessRatio;\nuniform float u_widenessToThicknessRatio;`:"",`\n\nfloat det(vec2 a, vec2 b) {\n  return a.x * b.y - b.x * a.y;\n}\n\nvec2 getDistanceVector(vec2 b0, vec2 b1, vec2 b2) {\n  float a = det(b0, b2), b = 2.0 * det(b1, b0), d = 2.0 * det(b2, b1);\n  float f = b * d - a * a;\n  vec2 d21 = b2 - b1, d10 = b1 - b0, d20 = b2 - b0;\n  vec2 gf = 2.0 * (b * d21 + d * d10 + a * d20);\n  gf = vec2(gf.y, -gf.x);\n  vec2 pp = -f * gf / dot(gf, gf);\n  vec2 d0p = b0 - pp;\n  float ap = det(d0p, d20), bp = 2.0 * det(d10, d0p);\n  float t = clamp((ap + bp) / (2.0 * a + b + d), 0.0, 1.0);\n  return mix(mix(b0, b1, t), mix(b1, b2, t), t);\n}\n\nfloat distToQuadraticBezierCurve(vec2 p, vec2 b0, vec2 b1, vec2 b2) {\n  return length(getDistanceVector(b0 - p, b1 - p, b2 - p));\n}\n\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nvoid main(void) {\n  float dist = distToQuadraticBezierCurve(gl_FragCoord.xy, v_cpA, v_cpB, v_cpC);\n  float thickness = v_thickness;\n`).concat(t?`\n  float distToTarget = length(gl_FragCoord.xy - v_targetPoint);\n  float targetArrowLength = v_targetSize + thickness * u_lengthToThicknessRatio;\n  if (distToTarget < targetArrowLength) {\n    thickness = (distToTarget - v_targetSize) / (targetArrowLength - v_targetSize) * u_widenessToThicknessRatio * thickness;\n  }`:"",`\n`).concat(n?`\n  float distToSource = length(gl_FragCoord.xy - v_sourcePoint);\n  float sourceArrowLength = v_sourceSize + thickness * u_lengthToThicknessRatio;\n  if (distToSource < sourceArrowLength) {\n    thickness = (distToSource - v_sourceSize) / (sourceArrowLength - v_sourceSize) * u_widenessToThicknessRatio * thickness;\n  }`:"",`\n\n  float halfThickness = thickness / 2.0;\n  if (dist < halfThickness) {\n    #ifdef PICKING_MODE\n    gl_FragColor = v_color;\n    #else\n    float t = smoothstep(\n      halfThickness - v_feather,\n      halfThickness,\n      dist\n    );\n\n    gl_FragColor = mix(v_color, transparent, t);\n    #endif\n  } else {\n    gl_FragColor = transparent;\n  }\n}\n`);return i}function eo(r){var e=r.arrowHead,t=(e==null?void 0:e.extremity)==="target"||(e==null?void 0:e.extremity)==="both",n=(e==null?void 0:e.extremity)==="source"||(e==null?void 0:e.extremity)==="both",i=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute float a_direction;\nattribute float a_thickness;\nattribute vec2 a_source;\nattribute vec2 a_target;\nattribute float a_current;\nattribute float a_curvature;\n`.concat(t?`attribute float a_targetSize;\n`:"",`\n`).concat(n?`attribute float a_sourceSize;\n`:"",`\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_pixelRatio;\nuniform vec2 u_dimensions;\nuniform float u_minEdgeThickness;\nuniform float u_feather;\n\nvarying vec4 v_color;\nvarying float v_thickness;\nvarying float v_feather;\nvarying vec2 v_cpA;\nvarying vec2 v_cpB;\nvarying vec2 v_cpC;\n`).concat(t?`\nvarying float v_targetSize;\nvarying vec2 v_targetPoint;`:"",`\n`).concat(n?`\nvarying float v_sourceSize;\nvarying vec2 v_sourcePoint;`:"",`\n`).concat(e?`\nuniform float u_widenessToThicknessRatio;`:"",`\n\nconst float bias = 255.0 / 254.0;\nconst float epsilon = 0.7;\n\nvec2 clipspaceToViewport(vec2 pos, vec2 dimensions) {\n  return vec2(\n    (pos.x + 1.0) * dimensions.x / 2.0,\n    (pos.y + 1.0) * dimensions.y / 2.0\n  );\n}\n\nvec2 viewportToClipspace(vec2 pos, vec2 dimensions) {\n  return vec2(\n    pos.x / dimensions.x * 2.0 - 1.0,\n    pos.y / dimensions.y * 2.0 - 1.0\n  );\n}\n\nvoid main() {\n  float minThickness = u_minEdgeThickness;\n\n  // Selecting the correct position\n  // Branchless "position = a_source if a_current == 1.0 else a_target"\n  vec2 position = a_source * max(0.0, a_current) + a_target * max(0.0, 1.0 - a_current);\n  position = (u_matrix * vec3(position, 1)).xy;\n\n  vec2 source = (u_matrix * vec3(a_source, 1)).xy;\n  vec2 target = (u_matrix * vec3(a_target, 1)).xy;\n\n  vec2 viewportPosition = clipspaceToViewport(position, u_dimensions);\n  vec2 viewportSource = clipspaceToViewport(source, u_dimensions);\n  vec2 viewportTarget = clipspaceToViewport(target, u_dimensions);\n\n  vec2 delta = viewportTarget.xy - viewportSource.xy;\n  float len = length(delta);\n  vec2 normal = vec2(-delta.y, delta.x) * a_direction;\n  vec2 unitNormal = normal / len;\n  float boundingBoxThickness = len * a_curvature;\n\n  float curveThickness = max(minThickness, a_thickness / u_sizeRatio);\n  v_thickness = curveThickness * u_pixelRatio;\n  v_feather = u_feather;\n\n  v_cpA = viewportSource;\n  v_cpB = 0.5 * (viewportSource + viewportTarget) + unitNormal * a_direction * boundingBoxThickness;\n  v_cpC = viewportTarget;\n\n  vec2 viewportOffsetPosition = (\n    viewportPosition +\n    unitNormal * (boundingBoxThickness / 2.0 + sign(boundingBoxThickness) * (`).concat(e?"curveThickness * u_widenessToThicknessRatio":"curveThickness",` + epsilon)) *\n    max(0.0, a_direction) // NOTE: cutting the bounding box in half to avoid overdraw\n  );\n\n  position = viewportToClipspace(viewportOffsetPosition, u_dimensions);\n  gl_Position = vec4(position, 0, 1);\n    \n`).concat(t?`\n  v_targetSize = a_targetSize * u_pixelRatio / u_sizeRatio;\n  v_targetPoint = viewportTarget;\n`:"",`\n`).concat(n?`\n  v_sourceSize = a_sourceSize * u_pixelRatio / u_sizeRatio;\n  v_sourcePoint = viewportSource;\n`:"",`\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`);return i}var Dr=.25,to={arrowHead:null,curvatureAttribute:"curvature",defaultCurvature:Dr},kr=WebGLRenderingContext,Ir=kr.UNSIGNED_BYTE,te=kr.FLOAT;function mt(r){var e=Ge(Ge({},to),r||{}),t=e,n=t.arrowHead,i=t.curvatureAttribute,o=t.drawLabel,a=(n==null?void 0:n.extremity)==="target"||(n==null?void 0:n.extremity)==="both",s=(n==null?void 0:n.extremity)==="source"||(n==null?void 0:n.extremity)==="both",l=["u_matrix","u_sizeRatio","u_dimensions","u_pixelRatio","u_feather","u_minEdgeThickness"].concat(gt(n?["u_lengthToThicknessRatio","u_widenessToThicknessRatio"]:[]));return function(c){function u(){var d;Ui(this,u);for(var h=arguments.length,m=new Array(h),g=0;g<h;g++)m[g]=arguments[g];return d=Vi(this,u,[].concat(m)),Fr(d,"drawLabel",o||Qi(e)),d}return Wi(u,c),Hi(u,[{key:"getDefinition",value:function(){return{VERTICES:6,VERTEX_SHADER_SOURCE:eo(e),FRAGMENT_SHADER_SOURCE:Ji(e),METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:l,ATTRIBUTES:[{name:"a_source",size:2,type:te},{name:"a_target",size:2,type:te}].concat(gt(a?[{name:"a_targetSize",size:1,type:te}]:[]),gt(s?[{name:"a_sourceSize",size:1,type:te}]:[]),[{name:"a_thickness",size:1,type:te},{name:"a_curvature",size:1,type:te},{name:"a_color",size:4,type:Ir,normalized:!0},{name:"a_id",size:4,type:Ir,normalized:!0}]),CONSTANT_ATTRIBUTES:[{name:"a_current",size:1,type:te},{name:"a_direction",size:1,type:te}],CONSTANT_DATA:[[0,1],[0,-1],[1,1],[0,-1],[1,1],[1,-1]]}}},{key:"processVisibleItem",value:function(h,m,g,b,E){var v,T=E.size||1,_=g.x,f=g.y,p=b.x,y=b.y,R=X(E.color),S=(v=E[i])!==null&&v!==void 0?v:Dr,F=this.array;F[m++]=_,F[m++]=f,F[m++]=p,F[m++]=y,a&&(F[m++]=b.size),s&&(F[m++]=g.size),F[m++]=T,F[m++]=S,F[m++]=R,F[m++]=h}},{key:"setUniforms",value:function(h,m){var g=m.gl,b=m.uniformLocations,E=b.u_matrix,v=b.u_pixelRatio,T=b.u_feather,_=b.u_sizeRatio,f=b.u_dimensions,p=b.u_minEdgeThickness;if(g.uniformMatrix3fv(E,!1,h.matrix),g.uniform1f(v,h.pixelRatio),g.uniform1f(_,h.sizeRatio),g.uniform1f(T,h.antiAliasingFeather),g.uniform2f(f,h.width*h.pixelRatio,h.height*h.pixelRatio),g.uniform1f(p,h.minEdgeThickness),n){var y=b.u_lengthToThicknessRatio,R=b.u_widenessToThicknessRatio;g.uniform1f(y,n.lengthToThicknessRatio),g.uniform1f(R,n.widenessToThicknessRatio)}}}])}(ct)}var ro=mt();mt({arrowHead:ze}),mt({arrowHead:Ge(Ge({},ze),{},{extremity:"both"})});function no(r){if(Array.isArray(r))return r}function io(r,e){var t=r==null?null:typeof Symbol<"u"&&r[Symbol.iterator]||r["@@iterator"];if(t!=null){var n,i,o,a,s=[],l=!0,c=!1;try{if(o=(t=t.call(r)).next,e!==0)for(;!(l=(n=o.call(t)).done)&&(s.push(n.value),s.length!==e);l=!0);}catch(u){c=!0,i=u}finally{try{if(!l&&t.return!=null&&(a=t.return(),Object(a)!==a))return}finally{if(c)throw i}}return s}}function vt(r,e){(e==null||e>r.length)&&(e=r.length);for(var t=0,n=Array(e);t<e;t++)n[t]=r[t];return n}function zr(r,e){if(r){if(typeof r=="string")return vt(r,e);var t={}.toString.call(r).slice(8,-1);return t==="Object"&&r.constructor&&(t=r.constructor.name),t==="Map"||t==="Set"?Array.from(r):t==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?vt(r,e):void 0}}function oo(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function ao(r,e){return no(r)||io(r,e)||zr(r,e)||oo()}function so(r,e){if(!(r instanceof e))throw new TypeError("Cannot call a class as a function")}function co(r,e){if(typeof r!="object"||!r)return r;var t=r[Symbol.toPrimitive];if(t!==void 0){var n=t.call(r,e);if(typeof n!="object")return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(r)}function Gr(r){var e=co(r,"string");return typeof e=="symbol"?e:e+""}function lo(r,e){for(var t=0;t<e.length;t++){var n=e[t];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(r,Gr(n.key),n)}}function uo(r,e,t){return e&&lo(r.prototype,e),Object.defineProperty(r,"prototype",{writable:!1}),r}function Ue(r){return Ue=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(e){return e.__proto__||Object.getPrototypeOf(e)},Ue(r)}function Mr(){try{var r=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){}))}catch{}return(Mr=function(){return!!r})()}function ho(r){if(r===void 0)throw new ReferenceError("this hasn\'t been initialised - super() hasn\'t been called");return r}function fo(r,e){if(e&&(typeof e=="object"||typeof e=="function"))return e;if(e!==void 0)throw new TypeError("Derived constructors may only return object or undefined");return ho(r)}function go(r,e,t){return e=Ue(e),fo(r,Mr()?Reflect.construct(e,t||[],Ue(r).constructor):e.apply(r,t))}function pt(r,e){return pt=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(t,n){return t.__proto__=n,t},pt(r,e)}function mo(r,e){if(typeof e!="function"&&e!==null)throw new TypeError("Super expression must either be null or a function");r.prototype=Object.create(e&&e.prototype,{constructor:{value:r,writable:!0,configurable:!0}}),Object.defineProperty(r,"prototype",{writable:!1}),e&&pt(r,e)}function ge(r,e,t){return(e=Gr(e))in r?Object.defineProperty(r,e,{value:t,enumerable:!0,configurable:!0,writable:!0}):r[e]=t,r}function vo(r){if(Array.isArray(r))return vt(r)}function po(r){if(typeof Symbol<"u"&&r[Symbol.iterator]!=null||r["@@iterator"]!=null)return Array.from(r)}function _o(){throw new TypeError(`Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function _t(r){return vo(r)||po(r)||zr(r)||_o()}function Ur(r,e){var t=Object.keys(r);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(r);e&&(n=n.filter(function(i){return Object.getOwnPropertyDescriptor(r,i).enumerable})),t.push.apply(t,n)}return t}function Br(r){for(var e=1;e<arguments.length;e++){var t=arguments[e]!=null?arguments[e]:{};e%2?Ur(Object(t),!0).forEach(function(n){ge(r,n,t[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(r,Object.getOwnPropertyDescriptors(t)):Ur(Object(t)).forEach(function(n){Object.defineProperty(r,n,Object.getOwnPropertyDescriptor(t,n))})}return r}var bo="relative",yo={drawLabel:void 0,drawHover:void 0,borders:[{size:{value:.1},color:{attribute:"borderColor"}},{size:{fill:!0},color:{attribute:"color"}}]},Eo="#000000";function To(r){var e=r.borders,t=st(e.filter(function(i){var o=i.size;return"fill"in o}).length),n=`\nprecision highp float;\n\nvarying vec2 v_diffVector;\nvarying float v_radius;\n\n#ifdef PICKING_MODE\nvarying vec4 v_color;\n#else\n// For normal mode, we use the border colors defined in the program:\n`.concat(e.flatMap(function(i,o){var a=i.size;return"attribute"in a?["varying float v_borderSize_".concat(o+1,";")]:[]}).join(`\n`),`\n`).concat(e.flatMap(function(i,o){var a=i.color;return"attribute"in a?["varying vec4 v_borderColor_".concat(o+1,";")]:"value"in a?["uniform vec4 u_borderColor_".concat(o+1,";")]:[]}).join(`\n`),`\n#endif\n\nuniform float u_correctionRatio;\n\nconst float bias = 255.0 / 254.0;\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nvoid main(void) {\n  float dist = length(v_diffVector);\n  float aaBorder = 2.0 * u_correctionRatio;\n  float v_borderSize_0 = v_radius;\n  vec4 v_borderColor_0 = transparent;\n\n  // No antialiasing for picking mode:\n  #ifdef PICKING_MODE\n  if (dist > v_radius)\n    gl_FragColor = transparent;\n  else {\n    gl_FragColor = v_color;\n    gl_FragColor.a *= bias;\n  }\n  #else\n  // Sizes:\n`).concat(e.flatMap(function(i,o){var a=i.size;if("fill"in a)return[];a=a;var s="attribute"in a?"v_borderSize_".concat(o+1):st(a.value),l=(a.mode||bo)==="pixels"?"u_correctionRatio":"v_radius";return["  float borderSize_".concat(o+1," = ").concat(l," * ").concat(s,";")]}).join(`\n`),`\n  // Now, let\'s split the remaining space between "fill" borders:\n  float fillBorderSize = (v_radius - (`).concat(e.flatMap(function(i,o){var a=i.size;return"fill"in a?[]:["borderSize_".concat(o+1)]}).join(" + "),") ) / ").concat(t,`;\n`).concat(e.flatMap(function(i,o){var a=i.size;return"fill"in a?["  float borderSize_".concat(o+1," = fillBorderSize;")]:[]}).join(`\n`),`\n\n  // Finally, normalize all border sizes, to start from the full size and to end with the smallest:\n  float adjustedBorderSize_0 = v_radius;\n`).concat(e.map(function(i,o){return"  float adjustedBorderSize_".concat(o+1," = adjustedBorderSize_").concat(o," - borderSize_").concat(o+1,";")}).join(`\n`),`\n\n  // Colors:\n  vec4 borderColor_0 = transparent;\n`).concat(e.map(function(i,o){var a=i.color,s=[];return"attribute"in a?s.push("  vec4 borderColor_".concat(o+1," = v_borderColor_").concat(o+1,";")):"transparent"in a?s.push("  vec4 borderColor_".concat(o+1," = vec4(0.0, 0.0, 0.0, 0.0);")):s.push("  vec4 borderColor_".concat(o+1," = u_borderColor_").concat(o+1,";")),s.push("  borderColor_".concat(o+1,".a *= bias;")),s.push("  if (borderSize_".concat(o+1," <= 1.0 * u_correctionRatio) { borderColor_").concat(o+1," = borderColor_").concat(o,"; }")),s.join(`\n`)}).join(`\n`),`\n  if (dist > adjustedBorderSize_0) {\n    gl_FragColor = borderColor_0;\n  } else `).concat(e.map(function(i,o){return"if (dist > adjustedBorderSize_".concat(o,` - aaBorder) {\n    gl_FragColor = mix(borderColor_`).concat(o+1,", borderColor_").concat(o,", (dist - adjustedBorderSize_").concat(o,` + aaBorder) / aaBorder);\n  } else if (dist > adjustedBorderSize_`).concat(o+1,`) {\n    gl_FragColor = borderColor_`).concat(o+1,`;\n  } else `)}).join(""),` { /* Nothing to add here */ }\n  #endif\n}\n`);return n}function Ro(r){var e=r.borders,t=`\nattribute vec2 a_position;\nattribute float a_size;\nattribute float a_angle;\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_correctionRatio;\n\nvarying vec2 v_diffVector;\nvarying float v_radius;\n\n#ifdef PICKING_MODE\nattribute vec4 a_id;\nvarying vec4 v_color;\n#else\n`.concat(e.flatMap(function(n,i){var o=n.size;return"attribute"in o?["attribute float a_borderSize_".concat(i+1,";"),"varying float v_borderSize_".concat(i+1,";")]:[]}).join(`\n`),`\n`).concat(e.flatMap(function(n,i){var o=n.color;return"attribute"in o?["attribute vec4 a_borderColor_".concat(i+1,";"),"varying vec4 v_borderColor_".concat(i+1,";")]:[]}).join(`\n`),`\n#endif\n\nconst float bias = 255.0 / 254.0;\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nvoid main() {\n  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;\n  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));\n  vec2 position = a_position + diffVector;\n  gl_Position = vec4(\n    (u_matrix * vec3(position, 1)).xy,\n    0,\n    1\n  );\n\n  v_radius = size / 2.0;\n  v_diffVector = diffVector;\n\n  #ifdef PICKING_MODE\n  v_color = a_id;\n  #else\n`).concat(e.flatMap(function(n,i){var o=n.size;return"attribute"in o?["  v_borderSize_".concat(i+1," = a_borderSize_").concat(i+1,";")]:[]}).join(`\n`),`\n`).concat(e.flatMap(function(n,i){var o=n.color;return"attribute"in o?["  v_borderColor_".concat(i+1," = a_borderColor_").concat(i+1,";")]:[]}).join(`\n`),`\n  #endif\n}\n`);return t}var Hr=WebGLRenderingContext,$r=Hr.UNSIGNED_BYTE,Be=Hr.FLOAT;function jr(r){var e,t=Br(Br({},yo),r||{}),n=t.borders,i=t.drawLabel,o=t.drawHover,a=["u_sizeRatio","u_correctionRatio","u_matrix"].concat(_t(n.flatMap(function(s,l){var c=s.color;return"value"in c?["u_borderColor_".concat(l+1)]:[]})));return e=function(s){function l(){var c;so(this,l);for(var u=arguments.length,d=new Array(u),h=0;h<u;h++)d[h]=arguments[h];return c=go(this,l,[].concat(d)),ge(c,"drawLabel",i),ge(c,"drawHover",o),c}return mo(l,s),uo(l,[{key:"getDefinition",value:function(){return{VERTICES:3,VERTEX_SHADER_SOURCE:Ro(t),FRAGMENT_SHADER_SOURCE:To(t),METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:a,ATTRIBUTES:[{name:"a_position",size:2,type:Be},{name:"a_id",size:4,type:$r,normalized:!0},{name:"a_size",size:1,type:Be}].concat(_t(n.flatMap(function(u,d){var h=u.color;return"attribute"in h?[{name:"a_borderColor_".concat(d+1),size:4,type:$r,normalized:!0}]:[]})),_t(n.flatMap(function(u,d){var h=u.size;return"attribute"in h?[{name:"a_borderSize_".concat(d+1),size:1,type:Be}]:[]}))),CONSTANT_ATTRIBUTES:[{name:"a_angle",size:1,type:Be}],CONSTANT_DATA:[[l.ANGLE_1],[l.ANGLE_2],[l.ANGLE_3]]}}},{key:"processVisibleItem",value:function(u,d,h){var m=this.array;m[d++]=h.x,m[d++]=h.y,m[d++]=u,m[d++]=h.size,n.forEach(function(g){var b=g.color;"attribute"in b&&(m[d++]=X(h[b.attribute]||b.defaultValue||Eo))}),n.forEach(function(g){var b=g.size;"attribute"in b&&(m[d++]=h[b.attribute]||b.defaultValue)})}},{key:"setUniforms",value:function(u,d){var h=d.gl,m=d.uniformLocations,g=m.u_sizeRatio,b=m.u_correctionRatio,E=m.u_matrix;h.uniform1f(b,u.correctionRatio),h.uniform1f(g,u.sizeRatio),h.uniformMatrix3fv(E,!1,u.matrix),n.forEach(function(v,T){var _=v.color;if("value"in _){var f=m["u_borderColor_".concat(T+1)],p=nt(_.value),y=ao(p,4),R=y[0],S=y[1],F=y[2],x=y[3];h.uniform4f(f,R/255,S/255,F/255,x/255)}})}}])}(ke),ge(e,"ANGLE_1",0),ge(e,"ANGLE_2",2*Math.PI/3),ge(e,"ANGLE_3",4*Math.PI/3),e}jr();var He={exports:{}},Vr;function Co(){if(Vr)return He.exports;Vr=1;var r=typeof Reflect=="object"?Reflect:null,e=r&&typeof r.apply=="function"?r.apply:function(p,y,R){return Function.prototype.apply.call(p,y,R)},t;r&&typeof r.ownKeys=="function"?t=r.ownKeys:Object.getOwnPropertySymbols?t=function(p){return Object.getOwnPropertyNames(p).concat(Object.getOwnPropertySymbols(p))}:t=function(p){return Object.getOwnPropertyNames(p)};function n(f){console&&console.warn&&console.warn(f)}var i=Number.isNaN||function(p){return p!==p};function o(){o.init.call(this)}He.exports=o,He.exports.once=v,o.EventEmitter=o,o.prototype._events=void 0,o.prototype._eventsCount=0,o.prototype._maxListeners=void 0;var a=10;function s(f){if(typeof f!="function")throw new TypeError(\'The "listener" argument must be of type Function. Received type \'+typeof f)}Object.defineProperty(o,"defaultMaxListeners",{enumerable:!0,get:function(){return a},set:function(f){if(typeof f!="number"||f<0||i(f))throw new RangeError(\'The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received \'+f+".");a=f}}),o.init=function(){(this._events===void 0||this._events===Object.getPrototypeOf(this)._events)&&(this._events=Object.create(null),this._eventsCount=0),this._maxListeners=this._maxListeners||void 0},o.prototype.setMaxListeners=function(p){if(typeof p!="number"||p<0||i(p))throw new RangeError(\'The value of "n" is out of range. It must be a non-negative number. Received \'+p+".");return this._maxListeners=p,this};function l(f){return f._maxListeners===void 0?o.defaultMaxListeners:f._maxListeners}o.prototype.getMaxListeners=function(){return l(this)},o.prototype.emit=function(p){for(var y=[],R=1;R<arguments.length;R++)y.push(arguments[R]);var S=p==="error",F=this._events;if(F!==void 0)S=S&&F.error===void 0;else if(!S)return!1;if(S){var x;if(y.length>0&&(x=y[0]),x instanceof Error)throw x;var O=new Error("Unhandled error."+(x?" ("+x.message+")":""));throw O.context=x,O}var k=F[p];if(k===void 0)return!1;if(typeof k=="function")e(k,this,y);else for(var z=k.length,M=g(k,z),R=0;R<z;++R)e(M[R],this,y);return!0};function c(f,p,y,R){var S,F,x;if(s(y),F=f._events,F===void 0?(F=f._events=Object.create(null),f._eventsCount=0):(F.newListener!==void 0&&(f.emit("newListener",p,y.listener?y.listener:y),F=f._events),x=F[p]),x===void 0)x=F[p]=y,++f._eventsCount;else if(typeof x=="function"?x=F[p]=R?[y,x]:[x,y]:R?x.unshift(y):x.push(y),S=l(f),S>0&&x.length>S&&!x.warned){x.warned=!0;var O=new Error("Possible EventEmitter memory leak detected. "+x.length+" "+String(p)+" listeners added. Use emitter.setMaxListeners() to increase limit");O.name="MaxListenersExceededWarning",O.emitter=f,O.type=p,O.count=x.length,n(O)}return f}o.prototype.addListener=function(p,y){return c(this,p,y,!1)},o.prototype.on=o.prototype.addListener,o.prototype.prependListener=function(p,y){return c(this,p,y,!0)};function u(){if(!this.fired)return this.target.removeListener(this.type,this.wrapFn),this.fired=!0,arguments.length===0?this.listener.call(this.target):this.listener.apply(this.target,arguments)}function d(f,p,y){var R={fired:!1,wrapFn:void 0,target:f,type:p,listener:y},S=u.bind(R);return S.listener=y,R.wrapFn=S,S}o.prototype.once=function(p,y){return s(y),this.on(p,d(this,p,y)),this},o.prototype.prependOnceListener=function(p,y){return s(y),this.prependListener(p,d(this,p,y)),this},o.prototype.removeListener=function(p,y){var R,S,F,x,O;if(s(y),S=this._events,S===void 0)return this;if(R=S[p],R===void 0)return this;if(R===y||R.listener===y)--this._eventsCount===0?this._events=Object.create(null):(delete S[p],S.removeListener&&this.emit("removeListener",p,R.listener||y));else if(typeof R!="function"){for(F=-1,x=R.length-1;x>=0;x--)if(R[x]===y||R[x].listener===y){O=R[x].listener,F=x;break}if(F<0)return this;F===0?R.shift():b(R,F),R.length===1&&(S[p]=R[0]),S.removeListener!==void 0&&this.emit("removeListener",p,O||y)}return this},o.prototype.off=o.prototype.removeListener,o.prototype.removeAllListeners=function(p){var y,R,S;if(R=this._events,R===void 0)return this;if(R.removeListener===void 0)return arguments.length===0?(this._events=Object.create(null),this._eventsCount=0):R[p]!==void 0&&(--this._eventsCount===0?this._events=Object.create(null):delete R[p]),this;if(arguments.length===0){var F=Object.keys(R),x;for(S=0;S<F.length;++S)x=F[S],x!=="removeListener"&&this.removeAllListeners(x);return this.removeAllListeners("removeListener"),this._events=Object.create(null),this._eventsCount=0,this}if(y=R[p],typeof y=="function")this.removeListener(p,y);else if(y!==void 0)for(S=y.length-1;S>=0;S--)this.removeListener(p,y[S]);return this};function h(f,p,y){var R=f._events;if(R===void 0)return[];var S=R[p];return S===void 0?[]:typeof S=="function"?y?[S.listener||S]:[S]:y?E(S):g(S,S.length)}o.prototype.listeners=function(p){return h(this,p,!0)},o.prototype.rawListeners=function(p){return h(this,p,!1)},o.listenerCount=function(f,p){return typeof f.listenerCount=="function"?f.listenerCount(p):m.call(f,p)},o.prototype.listenerCount=m;function m(f){var p=this._events;if(p!==void 0){var y=p[f];if(typeof y=="function")return 1;if(y!==void 0)return y.length}return 0}o.prototype.eventNames=function(){return this._eventsCount>0?t(this._events):[]};function g(f,p){for(var y=new Array(p),R=0;R<p;++R)y[R]=f[R];return y}function b(f,p){for(;p+1<f.length;p++)f[p]=f[p+1];f.pop()}function E(f){for(var p=new Array(f.length),y=0;y<p.length;++y)p[y]=f[y].listener||f[y];return p}function v(f,p){return new Promise(function(y,R){function S(x){f.removeListener(p,F),R(x)}function F(){typeof f.removeListener=="function"&&f.removeListener("error",S),y([].slice.call(arguments))}_(f,p,F,{once:!0}),p!=="error"&&T(f,S,{once:!0})})}function T(f,p,y){typeof f.on=="function"&&_(f,"error",p,y)}function _(f,p,y,R){if(typeof f.on=="function")R.once?f.once(p,y):f.on(p,y);else if(typeof f.addEventListener=="function")f.addEventListener(p,function S(F){R.once&&f.removeEventListener(p,S),y(F)});else throw new TypeError(\'The "emitter" argument must be of type EventEmitter. Received type \'+typeof f)}return He.exports}var Wr=Co();function bt(r,e){(e==null||e>r.length)&&(e=r.length);for(var t=0,n=Array(e);t<e;t++)n[t]=r[t];return n}function wo(r){if(Array.isArray(r))return bt(r)}function Ao(r){if(typeof Symbol<"u"&&r[Symbol.iterator]!=null||r["@@iterator"]!=null)return Array.from(r)}function So(r,e){if(r){if(typeof r=="string")return bt(r,e);var t={}.toString.call(r).slice(8,-1);return t==="Object"&&r.constructor&&(t=r.constructor.name),t==="Map"||t==="Set"?Array.from(r):t==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?bt(r,e):void 0}}function xo(){throw new TypeError(`Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function yt(r){return wo(r)||Ao(r)||So(r)||xo()}function Et(r,e){if(!(r instanceof e))throw new TypeError("Cannot call a class as a function")}function Lo(r,e){if(typeof r!="object"||!r)return r;var t=r[Symbol.toPrimitive];if(t!==void 0){var n=t.call(r,e);if(typeof n!="object")return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(r)}function Yr(r){var e=Lo(r,"string");return typeof e=="symbol"?e:e+""}function Fo(r,e){for(var t=0;t<e.length;t++){var n=e[t];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(r,Yr(n.key),n)}}function Tt(r,e,t){return e&&Fo(r.prototype,e),Object.defineProperty(r,"prototype",{writable:!1}),r}function me(r){return me=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(e){return e.__proto__||Object.getPrototypeOf(e)},me(r)}function Xr(){try{var r=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){}))}catch{}return(Xr=function(){return!!r})()}function No(r){if(r===void 0)throw new ReferenceError("this hasn\'t been initialised - super() hasn\'t been called");return r}function Po(r,e){if(e&&(typeof e=="object"||typeof e=="function"))return e;if(e!==void 0)throw new TypeError("Derived constructors may only return object or undefined");return No(r)}function qr(r,e,t){return e=me(e),Po(r,Xr()?Reflect.construct(e,t||[],me(r).constructor):e.apply(r,t))}function Oo(r,e){for(;!{}.hasOwnProperty.call(r,e)&&(r=me(r))!==null;);return r}function Rt(){return Rt=typeof Reflect<"u"&&Reflect.get?Reflect.get.bind():function(r,e,t){var n=Oo(r,e);if(n){var i=Object.getOwnPropertyDescriptor(n,e);return i.get?i.get.call(arguments.length<3?r:t):i.value}},Rt.apply(null,arguments)}function Kr(r,e,t,n){var i=Rt(me(r.prototype),e,t);return typeof i=="function"?function(o){return i.apply(t,o)}:i}function Ct(r,e){return Ct=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(t,n){return t.__proto__=n,t},Ct(r,e)}function Zr(r,e){if(typeof e!="function"&&e!==null)throw new TypeError("Super expression must either be null or a function");r.prototype=Object.create(e&&e.prototype,{constructor:{value:r,writable:!0,configurable:!0}}),Object.defineProperty(r,"prototype",{writable:!1}),e&&Ct(r,e)}function G(r,e,t){return(e=Yr(e))in r?Object.defineProperty(r,e,{value:t,enumerable:!0,configurable:!0,writable:!0}):r[e]=t,r}function Do(r,e){if(r==null)return{};var t={};for(var n in r)if({}.hasOwnProperty.call(r,n)){if(e.indexOf(n)!==-1)continue;t[n]=r[n]}return t}function ko(r,e){if(r==null)return{};var t,n,i=Do(r,e);if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(r);for(n=0;n<o.length;n++)t=o[n],e.indexOf(t)===-1&&{}.propertyIsEnumerable.call(r,t)&&(i[t]=r[t])}return i}function Qr(r,e){var t=Object.keys(r);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(r);e&&(n=n.filter(function(i){return Object.getOwnPropertyDescriptor(r,i).enumerable})),t.push.apply(t,n)}return t}function $(r){for(var e=1;e<arguments.length;e++){var t=arguments[e]!=null?arguments[e]:{};e%2?Qr(Object(t),!0).forEach(function(n){G(r,n,t[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(r,Object.getOwnPropertyDescriptors(t)):Qr(Object(t)).forEach(function(n){Object.defineProperty(r,n,Object.getOwnPropertyDescriptor(t,n))})}return r}function Io(r){var e=r.texturesCount,t=`\nprecision highp float;\n\nvarying vec4 v_color;\nvarying vec2 v_diffVector;\nvarying float v_radius;\nvarying vec4 v_texture;\nvarying float v_textureIndex;\n\nuniform sampler2D u_atlas[`.concat(e,`];\nuniform float u_correctionRatio;\nuniform float u_cameraAngle;\nuniform float u_percentagePadding;\nuniform bool u_colorizeImages;\nuniform bool u_keepWithinCircle;\n\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nconst float radius = 0.5;\n\nvoid main(void) {\n  float border = 2.0 * u_correctionRatio;\n  float dist = length(v_diffVector);\n  vec4 color = gl_FragColor;\n\n  float c = cos(-u_cameraAngle);\n  float s = sin(-u_cameraAngle);\n  vec2 diffVector = mat2(c, s, -s, c) * (v_diffVector);\n\n  // No antialiasing for picking mode:\n  #ifdef PICKING_MODE\n  border = 0.0;\n  color = v_color;\n\n  #else\n  // First case: No image to display\n  if (v_texture.w <= 0.0) {\n    if (!u_colorizeImages) {\n      color = v_color;\n    }\n  }\n\n  // Second case: Image loaded into the texture\n  else {\n    float paddingRatio = 1.0 + 2.0 * u_percentagePadding;\n    float coef = u_keepWithinCircle ? 1.0 : `).concat(Math.SQRT2,`;\n    vec2 coordinateInTexture = diffVector * vec2(paddingRatio, -paddingRatio) / v_radius / 2.0 * coef + vec2(0.5, 0.5);\n    int index = int(v_textureIndex + 0.5); // +0.5 avoid rounding errors\n\n    bool noTextureFound = false;\n    vec4 texel;\n\n    `).concat(yt(new Array(e)).map(function(n,i){return"if (index == ".concat(i,") texel = texture2D(u_atlas[").concat(i,"], (v_texture.xy + coordinateInTexture * v_texture.zw), -1.0);")}).join(`\n    else `)+`else {\n      texel = texture2D(u_atlas[0], (v_texture.xy + coordinateInTexture * v_texture.zw), -1.0);\n      noTextureFound = true;\n    }`,`\n\n    if (noTextureFound) {\n      color = v_color;\n    } else {\n      // Colorize all visible image pixels:\n      if (u_colorizeImages) {\n        color = mix(gl_FragColor, v_color, texel.a);\n      }\n\n      // Colorize background pixels, keep image pixel colors:\n      else {\n        color = vec4(mix(v_color, texel, texel.a).rgb, max(texel.a, v_color.a));\n      }\n\n      // Erase pixels "in the padding":\n      if (abs(diffVector.x) > v_radius / paddingRatio || abs(diffVector.y) > v_radius / paddingRatio) {\n        color = u_colorizeImages ? gl_FragColor : v_color;\n      }\n    }\n  }\n  #endif\n\n  // Crop in a circle when u_keepWithinCircle is truthy:\n  if (u_keepWithinCircle) {\n    if (dist < v_radius - border) {\n      gl_FragColor = color;\n    } else if (dist < v_radius) {\n      gl_FragColor = mix(transparent, color, (v_radius - dist) / border);\n    }\n  }\n\n  // Crop in a square else:\n  else {\n    float squareHalfSize = v_radius * `).concat(Math.SQRT1_2*Math.cos(Math.PI/12),`;\n    if (abs(diffVector.x) > squareHalfSize || abs(diffVector.y) > squareHalfSize) {\n      gl_FragColor = transparent;\n    } else {\n      gl_FragColor = color;\n    }\n  }\n}\n`);return t}var zo=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_position;\nattribute float a_size;\nattribute float a_angle;\nattribute vec4 a_texture;\nattribute float a_textureIndex;\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_correctionRatio;\n\nvarying vec4 v_color;\nvarying vec2 v_diffVector;\nvarying float v_radius;\nvarying vec4 v_texture;\nvarying float v_textureIndex;\n\nconst float bias = 255.0 / 254.0;\nconst float marginRatio = 1.05;\n\nvoid main() {\n  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;\n  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));\n  vec2 position = a_position + diffVector * marginRatio;\n  gl_Position = vec4(\n    (u_matrix * vec3(position, 1)).xy,\n    0,\n    1\n  );\n\n  v_diffVector = diffVector;\n  v_radius = size / 2.0 / marginRatio;\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n\n  // Pass the texture coordinates:\n  v_textureIndex = a_textureIndex;\n  v_texture = a_texture;\n  #endif\n\n  v_color.a *= bias;\n}\n`,Go=zo;function ae(){ae=function(){return e};var r,e={},t=Object.prototype,n=t.hasOwnProperty,i=Object.defineProperty||function(w,C,A){w[C]=A.value},o=typeof Symbol=="function"?Symbol:{},a=o.iterator||"@@iterator",s=o.asyncIterator||"@@asyncIterator",l=o.toStringTag||"@@toStringTag";function c(w,C,A){return Object.defineProperty(w,C,{value:A,enumerable:!0,configurable:!0,writable:!0}),w[C]}try{c({},"")}catch{c=function(C,A,N){return C[A]=N}}function u(w,C,A,N){var L=C&&C.prototype instanceof v?C:v,P=Object.create(L.prototype),D=new M(N||[]);return i(P,"_invoke",{value:x(w,A,D)}),P}function d(w,C,A){try{return{type:"normal",arg:w.call(C,A)}}catch(N){return{type:"throw",arg:N}}}e.wrap=u;var h="suspendedStart",m="suspendedYield",g="executing",b="completed",E={};function v(){}function T(){}function _(){}var f={};c(f,a,function(){return this});var p=Object.getPrototypeOf,y=p&&p(p(H([])));y&&y!==t&&n.call(y,a)&&(f=y);var R=_.prototype=v.prototype=Object.create(f);function S(w){["next","throw","return"].forEach(function(C){c(w,C,function(A){return this._invoke(C,A)})})}function F(w,C){function A(L,P,D,U){var B=d(w[L],w,P);if(B.type!=="throw"){var Y=B.arg,J=Y.value;return J&&typeof J=="object"&&n.call(J,"__await")?C.resolve(J.__await).then(function(ee){A("next",ee,D,U)},function(ee){A("throw",ee,D,U)}):C.resolve(J).then(function(ee){Y.value=ee,D(Y)},function(ee){return A("throw",ee,D,U)})}U(B.arg)}var N;i(this,"_invoke",{value:function(L,P){function D(){return new C(function(U,B){A(L,P,U,B)})}return N=N?N.then(D,D):D()}})}function x(w,C,A){var N=h;return function(L,P){if(N===g)throw Error("Generator is already running");if(N===b){if(L==="throw")throw P;return{value:r,done:!0}}for(A.method=L,A.arg=P;;){var D=A.delegate;if(D){var U=O(D,A);if(U){if(U===E)continue;return U}}if(A.method==="next")A.sent=A._sent=A.arg;else if(A.method==="throw"){if(N===h)throw N=b,A.arg;A.dispatchException(A.arg)}else A.method==="return"&&A.abrupt("return",A.arg);N=g;var B=d(w,C,A);if(B.type==="normal"){if(N=A.done?b:m,B.arg===E)continue;return{value:B.arg,done:A.done}}B.type==="throw"&&(N=b,A.method="throw",A.arg=B.arg)}}}function O(w,C){var A=C.method,N=w.iterator[A];if(N===r)return C.delegate=null,A==="throw"&&w.iterator.return&&(C.method="return",C.arg=r,O(w,C),C.method==="throw")||A!=="return"&&(C.method="throw",C.arg=new TypeError("The iterator does not provide a \'"+A+"\' method")),E;var L=d(N,w.iterator,C.arg);if(L.type==="throw")return C.method="throw",C.arg=L.arg,C.delegate=null,E;var P=L.arg;return P?P.done?(C[w.resultName]=P.value,C.next=w.nextLoc,C.method!=="return"&&(C.method="next",C.arg=r),C.delegate=null,E):P:(C.method="throw",C.arg=new TypeError("iterator result is not an object"),C.delegate=null,E)}function k(w){var C={tryLoc:w[0]};1 in w&&(C.catchLoc=w[1]),2 in w&&(C.finallyLoc=w[2],C.afterLoc=w[3]),this.tryEntries.push(C)}function z(w){var C=w.completion||{};C.type="normal",delete C.arg,w.completion=C}function M(w){this.tryEntries=[{tryLoc:"root"}],w.forEach(k,this),this.reset(!0)}function H(w){if(w||w===""){var C=w[a];if(C)return C.call(w);if(typeof w.next=="function")return w;if(!isNaN(w.length)){var A=-1,N=function L(){for(;++A<w.length;)if(n.call(w,A))return L.value=w[A],L.done=!1,L;return L.value=r,L.done=!0,L};return N.next=N}}throw new TypeError(typeof w+" is not iterable")}return T.prototype=_,i(R,"constructor",{value:_,configurable:!0}),i(_,"constructor",{value:T,configurable:!0}),T.displayName=c(_,l,"GeneratorFunction"),e.isGeneratorFunction=function(w){var C=typeof w=="function"&&w.constructor;return!!C&&(C===T||(C.displayName||C.name)==="GeneratorFunction")},e.mark=function(w){return Object.setPrototypeOf?Object.setPrototypeOf(w,_):(w.__proto__=_,c(w,l,"GeneratorFunction")),w.prototype=Object.create(R),w},e.awrap=function(w){return{__await:w}},S(F.prototype),c(F.prototype,s,function(){return this}),e.AsyncIterator=F,e.async=function(w,C,A,N,L){L===void 0&&(L=Promise);var P=new F(u(w,C,A,N),L);return e.isGeneratorFunction(C)?P:P.next().then(function(D){return D.done?D.value:P.next()})},S(R),c(R,l,"Generator"),c(R,a,function(){return this}),c(R,"toString",function(){return"[object Generator]"}),e.keys=function(w){var C=Object(w),A=[];for(var N in C)A.push(N);return A.reverse(),function L(){for(;A.length;){var P=A.pop();if(P in C)return L.value=P,L.done=!1,L}return L.done=!0,L}},e.values=H,M.prototype={constructor:M,reset:function(w){if(this.prev=0,this.next=0,this.sent=this._sent=r,this.done=!1,this.delegate=null,this.method="next",this.arg=r,this.tryEntries.forEach(z),!w)for(var C in this)C.charAt(0)==="t"&&n.call(this,C)&&!isNaN(+C.slice(1))&&(this[C]=r)},stop:function(){this.done=!0;var w=this.tryEntries[0].completion;if(w.type==="throw")throw w.arg;return this.rval},dispatchException:function(w){if(this.done)throw w;var C=this;function A(B,Y){return P.type="throw",P.arg=w,C.next=B,Y&&(C.method="next",C.arg=r),!!Y}for(var N=this.tryEntries.length-1;N>=0;--N){var L=this.tryEntries[N],P=L.completion;if(L.tryLoc==="root")return A("end");if(L.tryLoc<=this.prev){var D=n.call(L,"catchLoc"),U=n.call(L,"finallyLoc");if(D&&U){if(this.prev<L.catchLoc)return A(L.catchLoc,!0);if(this.prev<L.finallyLoc)return A(L.finallyLoc)}else if(D){if(this.prev<L.catchLoc)return A(L.catchLoc,!0)}else{if(!U)throw Error("try statement without catch or finally");if(this.prev<L.finallyLoc)return A(L.finallyLoc)}}}},abrupt:function(w,C){for(var A=this.tryEntries.length-1;A>=0;--A){var N=this.tryEntries[A];if(N.tryLoc<=this.prev&&n.call(N,"finallyLoc")&&this.prev<N.finallyLoc){var L=N;break}}L&&(w==="break"||w==="continue")&&L.tryLoc<=C&&C<=L.finallyLoc&&(L=null);var P=L?L.completion:{};return P.type=w,P.arg=C,L?(this.method="next",this.next=L.finallyLoc,E):this.complete(P)},complete:function(w,C){if(w.type==="throw")throw w.arg;return w.type==="break"||w.type==="continue"?this.next=w.arg:w.type==="return"?(this.rval=this.arg=w.arg,this.method="return",this.next="end"):w.type==="normal"&&C&&(this.next=C),E},finish:function(w){for(var C=this.tryEntries.length-1;C>=0;--C){var A=this.tryEntries[C];if(A.finallyLoc===w)return this.complete(A.completion,A.afterLoc),z(A),E}},catch:function(w){for(var C=this.tryEntries.length-1;C>=0;--C){var A=this.tryEntries[C];if(A.tryLoc===w){var N=A.completion;if(N.type==="throw"){var L=N.arg;z(A)}return L}}throw Error("illegal catch attempt")},delegateYield:function(w,C,A){return this.delegate={iterator:H(w),resultName:C,nextLoc:A},this.method==="next"&&(this.arg=r),E}},e}function Jr(r,e,t,n,i,o,a){try{var s=r[o](a),l=s.value}catch(c){return void t(c)}s.done?e(l):Promise.resolve(l).then(n,i)}function wt(r){return function(){var e=this,t=arguments;return new Promise(function(n,i){var o=r.apply(e,t);function a(l){Jr(o,n,i,a,s,"next",l)}function s(l){Jr(o,n,i,a,s,"throw",l)}a(void 0)})}}var At={size:{mode:"max",value:512},objectFit:"cover",correctCentering:!1,maxTextureSize:4096,debounceTimeout:500,crossOrigin:"anonymous"},Mo=1;function St(r){var e=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},t=e.crossOrigin;return new Promise(function(n,i){var o=new Image;o.addEventListener("load",function(){n(o)},{once:!0}),o.addEventListener("error",function(a){i(a.error)},{once:!0}),t&&o.setAttribute("crossOrigin",t),o.src=r})}function Uo(r){return xt.apply(this,arguments)}function xt(){return xt=wt(ae().mark(function r(e){var t,n,i,o,a,s,l,c,u,d,h,m,g,b=arguments;return ae().wrap(function(v){for(;;)switch(v.prev=v.next){case 0:if(t=b.length>1&&b[1]!==void 0?b[1]:{},n=t.size,i=t.crossOrigin,i!=="use-credentials"){v.next=7;break}return v.next=4,fetch(e,{credentials:"include"});case 4:o=v.sent,v.next=10;break;case 7:return v.next=9,fetch(e);case 9:o=v.sent;case 10:return v.next=12,o.text();case 12:if(a=v.sent,s=new DOMParser().parseFromString(a,"image/svg+xml"),l=s.documentElement,c=l.getAttribute("width"),u=l.getAttribute("height"),!(!c||!u)){v.next=19;break}throw new Error("loadSVGImage: cannot use `size` if target SVG has no definite dimensions.");case 19:return typeof n=="number"&&(l.setAttribute("width",""+n),l.setAttribute("height",""+n)),d=new XMLSerializer().serializeToString(s),h=new Blob([d],{type:"image/svg+xml"}),m=URL.createObjectURL(h),g=St(m),g.finally(function(){return URL.revokeObjectURL(m)}),v.abrupt("return",g);case 26:case"end":return v.stop()}},r)})),xt.apply(this,arguments)}function Bo(r){return Lt.apply(this,arguments)}function Lt(){return Lt=wt(ae().mark(function r(e){var t,n,i,o,a,s,l=arguments;return ae().wrap(function(u){for(;;)switch(u.prev=u.next){case 0:if(n=l.length>1&&l[1]!==void 0?l[1]:{},i=n.size,o=n.crossOrigin,a=((t=e.split(/[#?]/)[0].split(".").pop())===null||t===void 0?void 0:t.trim().toLowerCase())==="svg",!(a&&i)){u.next=16;break}return u.prev=3,u.next=6,Uo(e,{size:i,crossOrigin:o});case 6:s=u.sent,u.next=14;break;case 9:return u.prev=9,u.t0=u.catch(3),u.next=13,St(e,{crossOrigin:o});case 13:s=u.sent;case 14:u.next=19;break;case 16:return u.next=18,St(e,{crossOrigin:o});case 18:s=u.sent;case 19:return u.abrupt("return",s);case 20:case"end":return u.stop()}},r,null,[[3,9]])})),Lt.apply(this,arguments)}function Ho(r,e,t){var n=t.objectFit,i=t.size,o=t.correctCentering,a=n==="contain"?Math.max(r.width,r.height):Math.min(r.width,r.height),s=i.mode==="auto"?a:i.mode==="force"?i.value:Math.min(i.value,a),l=(r.width-a)/2,c=(r.height-a)/2;if(o){var u=e.getCorrectionOffset(r,a);l=u.x,c=u.y}return{sourceX:l,sourceY:c,sourceSize:a,destinationSize:s}}function $o(r,e,t){for(var n=e.canvas,i=n.width,o=n.height,a=[],s=t.x,l=t.y,c=t.rowHeight,u=t.maxRowWidth,d={},h=0,m=r.length;h<m;h++){var g=r[h],b=g.key,E=g.image,v=g.sourceSize,T=g.sourceX,_=g.sourceY,f=g.destinationSize,p=f+Mo;l+p>o||s+p>i&&l+p+c>o||(s+p>i&&(u=Math.max(u,s),s=0,l+=c,c=p),a.push({key:b,image:E,sourceX:T,sourceY:_,sourceSize:v,destinationX:s,destinationY:l,destinationSize:f}),d[b]={x:s,y:l,size:f},s+=p,c=Math.max(c,p))}u=Math.max(u,s);for(var y=u,R=l+c,S=0,F=a.length;S<F;S++){var x=a[S],O=x.image,k=x.sourceSize,z=x.sourceX,M=x.sourceY,H=x.destinationSize,w=x.destinationX,C=x.destinationY;e.drawImage(O,z,M,k,k,w,C,H,H)}return{atlas:d,texture:e.getImageData(0,0,y,R),cursor:{x:s,y:l,rowHeight:c,maxRowWidth:u}}}function jo(r,e,t){var n=r.atlas,i=r.textures,o=r.cursor,a={atlas:$({},n),textures:yt(i.slice(0,-1)),cursor:$({},o)},s=[];for(var l in e){var c,u=e[l];if(u.status==="ready"){var d=(c=n[l])===null||c===void 0?void 0:c.textureIndex;typeof d!="number"&&s.push($({key:l},u))}}for(var h=function(){var g=$o(s,t,a.cursor),b=g.atlas,E=g.texture,v=g.cursor;a.cursor=v;var T=[];s.forEach(function(_){b[_.key]?a.atlas[_.key]=$($({},b[_.key]),{},{textureIndex:a.textures.length}):T.push(_)}),a.textures.push(E),s=T,s.length&&(a.cursor={x:0,y:0,rowHeight:0,maxRowWidth:0},t.clearRect(0,0,t.canvas.width,t.canvas.height))};s.length;)h();return a}var Vo=function(){function r(){Et(this,r),this.canvas=document.createElement("canvas"),this.context=this.canvas.getContext("2d",{willReadFrequently:!0})}return Tt(r,[{key:"getCorrectionOffset",value:function(t,n){this.canvas.width=n,this.canvas.height=n,this.context.clearRect(0,0,n,n),this.context.drawImage(t,0,0,n,n);for(var i=this.context.getImageData(0,0,n,n).data,o=new Uint8ClampedArray(i.length/4),a=0;a<i.length;a++)o[a]=i[a*4+3];for(var s=0,l=0,c=0,u=0;u<n;u++)for(var d=0;d<n;d++){var h=o[u*n+d];c+=h,s+=h*d,l+=h*u}var m=s/c,g=l/c;return{x:m-n/2,y:g-n/2}}}])}(),$e=function(r){function e(){var t,n=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};return Et(this,e),t=qr(this,e),G(t,"canvas",document.createElement("canvas")),G(t,"ctx",t.canvas.getContext("2d",{willReadFrequently:!0})),G(t,"corrector",new Vo),G(t,"imageStates",{}),G(t,"textures",[t.ctx.getImageData(0,0,1,1)]),G(t,"lastTextureCursor",{x:0,y:0,rowHeight:0,maxRowWidth:0}),G(t,"atlas",{}),t.options=$($({},At),n),t.canvas.width=t.options.maxTextureSize,t.canvas.height=t.options.maxTextureSize,t}return Zr(e,r),Tt(e,[{key:"scheduleGenerateTexture",value:function(){var n=this;typeof this.frameId!="number"&&(typeof this.options.debounceTimeout=="number"?this.frameId=window.setTimeout(function(){n.generateTextures(),n.frameId=void 0},this.options.debounceTimeout):this.generateTextures())}},{key:"generateTextures",value:function(){var n=jo({atlas:this.atlas,textures:this.textures,cursor:this.lastTextureCursor},this.imageStates,this.ctx),i=n.atlas,o=n.textures,a=n.cursor;this.atlas=i,this.textures=o,this.lastTextureCursor=a,this.emit(e.NEW_TEXTURE_EVENT,{atlas:i,textures:o})}},{key:"registerImage",value:function(){var t=wt(ae().mark(function i(o){var a,s;return ae().wrap(function(c){for(;;)switch(c.prev=c.next){case 0:if(!this.imageStates[o]){c.next=2;break}return c.abrupt("return");case 2:return this.imageStates[o]={status:"loading"},c.prev=3,a=this.options.size,c.next=7,Bo(o,{size:a.mode==="force"?a.value:void 0,crossOrigin:this.options.crossOrigin||void 0});case 7:s=c.sent,this.imageStates[o]=$({status:"ready",image:s},Ho(s,this.corrector,this.options)),this.scheduleGenerateTexture(),c.next=15;break;case 12:c.prev=12,c.t0=c.catch(3),this.imageStates[o]={status:"error"};case 15:case"end":return c.stop()}},i,this,[[3,12]])}));function n(i){return t.apply(this,arguments)}return n}()},{key:"getAtlas",value:function(){return this.atlas}},{key:"getTextures",value:function(){return this.textures}}])}(Wr.EventEmitter);G($e,"NEW_TEXTURE_EVENT","newTexture");var Wo=["drawHover","drawLabel","drawingMode","keepWithinCircle","padding","colorAttribute","imageAttribute"],en=WebGLRenderingContext,tn=en.UNSIGNED_BYTE,Ce=en.FLOAT,Yo=$($({},At),{},{drawingMode:"background",keepWithinCircle:!0,drawLabel:void 0,drawHover:void 0,padding:0,colorAttribute:"color",imageAttribute:"image"}),Xo=["u_sizeRatio","u_correctionRatio","u_cameraAngle","u_percentagePadding","u_matrix","u_colorizeImages","u_keepWithinCircle","u_atlas"];function Ft(r){var e,t=document.createElement("canvas").getContext("webgl"),n=Math.min(t.getParameter(t.MAX_TEXTURE_SIZE),At.maxTextureSize);t.canvas.remove();var i=$($($({},Yo),{maxTextureSize:n}),r||{}),o=i.drawHover,a=i.drawLabel,s=i.drawingMode,l=i.keepWithinCircle,c=i.padding,u=i.colorAttribute,d=i.imageAttribute,h=ko(i,Wo),m=new $e(h);return e=function(g){function b(E,v,T){var _;return Et(this,b),_=qr(this,b,[E,v,T]),G(_,"drawLabel",a),G(_,"drawHover",o),G(_,"textureManagerCallback",null),_.textureManagerCallback=function(f){var p=f.atlas,y=f.textures,R=y.length!==_.textures.length;_.atlas=p,_.textureImages=y,R&&_.upgradeShaders(),_.bindTextures(),_.latestRenderParams&&_.render(_.latestRenderParams),_.renderer&&_.renderer.refresh&&_.renderer.refresh()},m.on($e.NEW_TEXTURE_EVENT,_.textureManagerCallback),_.atlas=m.getAtlas(),_.textureImages=m.getTextures(),_.textures=_.textureImages.map(function(){return E.createTexture()}),_.bindTextures(),_}return Zr(b,g),Tt(b,[{key:"getDefinition",value:function(){return{VERTICES:3,VERTEX_SHADER_SOURCE:Go,FRAGMENT_SHADER_SOURCE:Io({texturesCount:m.getTextures().length}),METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Xo,ATTRIBUTES:[{name:"a_position",size:2,type:Ce},{name:"a_size",size:1,type:Ce},{name:"a_color",size:4,type:tn,normalized:!0},{name:"a_id",size:4,type:tn,normalized:!0},{name:"a_texture",size:4,type:Ce},{name:"a_textureIndex",size:1,type:Ce}],CONSTANT_ATTRIBUTES:[{name:"a_angle",size:1,type:Ce}],CONSTANT_DATA:[[b.ANGLE_1],[b.ANGLE_2],[b.ANGLE_3]]}}},{key:"upgradeShaders",value:function(){var v=this.getDefinition(),T=this.normalProgram,_=T.program,f=T.buffer,p=T.vertexShader,y=T.fragmentShader,R=T.gl;R.deleteProgram(_),R.deleteBuffer(f),R.deleteShader(p),R.deleteShader(y),this.normalProgram=this.getProgramInfo("normal",R,v.VERTEX_SHADER_SOURCE,v.FRAGMENT_SHADER_SOURCE,null)}},{key:"kill",value:function(){var v,T=(v=this.normalProgram)===null||v===void 0?void 0:v.gl;if(T)for(var _=0;_<this.textures.length;_++)T.deleteTexture(this.textures[_]);this.textureManagerCallback&&(m.off($e.NEW_TEXTURE_EVENT,this.textureManagerCallback),this.textureManagerCallback=null),Kr(b,"kill",this)([])}},{key:"bindTextures",value:function(){for(var v=this.normalProgram.gl,T=0;T<this.textureImages.length;T++){if(T>=this.textures.length){var _=v.createTexture();_&&this.textures.push(_)}v.activeTexture(v.TEXTURE0+T),v.bindTexture(v.TEXTURE_2D,this.textures[T]),v.texImage2D(v.TEXTURE_2D,0,v.RGBA,v.RGBA,v.UNSIGNED_BYTE,this.textureImages[T]),v.generateMipmap(v.TEXTURE_2D)}}},{key:"renderProgram",value:function(v,T){if(!T.isPicking)for(var _=T.gl,f=0;f<this.textureImages.length;f++)_.activeTexture(_.TEXTURE0+f),_.bindTexture(_.TEXTURE_2D,this.textures[f]);Kr(b,"renderProgram",this)([v,T])}},{key:"processVisibleItem",value:function(v,T,_){var f=this.array,p=X(_[u]),y=_[d],R=y?this.atlas[y]:void 0;if(typeof y=="string"&&!R&&m.registerImage(y),f[T++]=_.x,f[T++]=_.y,f[T++]=_.size,f[T++]=p,f[T++]=v,R&&typeof R.textureIndex=="number"){var S=this.textureImages[R.textureIndex],F=S.width,x=S.height;f[T++]=R.x/F,f[T++]=R.y/x,f[T++]=R.size/F,f[T++]=R.size/x,f[T++]=R.textureIndex}else f[T++]=0,f[T++]=0,f[T++]=0,f[T++]=0,f[T++]=0}},{key:"setUniforms",value:function(v,T){var _=T.gl,f=T.uniformLocations,p=f.u_sizeRatio,y=f.u_correctionRatio,R=f.u_matrix,S=f.u_atlas,F=f.u_colorizeImages,x=f.u_keepWithinCircle,O=f.u_cameraAngle,k=f.u_percentagePadding;this.latestRenderParams=v,_.uniform1f(y,v.correctionRatio),_.uniform1f(p,l?v.sizeRatio:v.sizeRatio/Math.SQRT2),_.uniform1f(O,v.cameraAngle),_.uniform1f(k,c),_.uniformMatrix3fv(R,!1,v.matrix),_.uniform1iv(S,yt(new Array(this.textureImages.length)).map(function(z,M){return M})),_.uniform1i(F,s==="color"?1:0),_.uniform1i(x,l?1:0)}}])}(ke),G(e,"ANGLE_1",0),G(e,"ANGLE_2",2*Math.PI/3),G(e,"ANGLE_3",4*Math.PI/3),G(e,"textureManager",m),e}Ft(),Ft({keepWithinCircle:!1,size:{mode:"force",value:256},drawingMode:"color",correctCentering:!0});function qo(r){if(Array.isArray(r))return r}function Ko(r,e){var t=r==null?null:typeof Symbol<"u"&&r[Symbol.iterator]||r["@@iterator"];if(t!=null){var n,i,o,a,s=[],l=!0,c=!1;try{if(o=(t=t.call(r)).next,e!==0)for(;!(l=(n=o.call(t)).done)&&(s.push(n.value),s.length!==e);l=!0);}catch(u){c=!0,i=u}finally{try{if(!l&&t.return!=null&&(a=t.return(),Object(a)!==a))return}finally{if(c)throw i}}return s}}function Nt(r,e){(e==null||e>r.length)&&(e=r.length);for(var t=0,n=Array(e);t<e;t++)n[t]=r[t];return n}function rn(r,e){if(r){if(typeof r=="string")return Nt(r,e);var t={}.toString.call(r).slice(8,-1);return t==="Object"&&r.constructor&&(t=r.constructor.name),t==="Map"||t==="Set"?Array.from(r):t==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?Nt(r,e):void 0}}function Zo(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function nn(r,e){return qo(r)||Ko(r,e)||rn(r,e)||Zo()}function Qo(r,e){if(!(r instanceof e))throw new TypeError("Cannot call a class as a function")}function Jo(r,e){if(typeof r!="object"||!r)return r;var t=r[Symbol.toPrimitive];if(t!==void 0){var n=t.call(r,e);if(typeof n!="object")return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(r)}function on(r){var e=Jo(r,"string");return typeof e=="symbol"?e:e+""}function ea(r,e){for(var t=0;t<e.length;t++){var n=e[t];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(r,on(n.key),n)}}function ta(r,e,t){return e&&ea(r.prototype,e),Object.defineProperty(r,"prototype",{writable:!1}),r}function je(r){return je=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(e){return e.__proto__||Object.getPrototypeOf(e)},je(r)}function an(){try{var r=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){}))}catch{}return(an=function(){return!!r})()}function ra(r){if(r===void 0)throw new ReferenceError("this hasn\'t been initialised - super() hasn\'t been called");return r}function na(r,e){if(e&&(typeof e=="object"||typeof e=="function"))return e;if(e!==void 0)throw new TypeError("Derived constructors may only return object or undefined");return ra(r)}function ia(r,e,t){return e=je(e),na(r,an()?Reflect.construct(e,t||[],je(r).constructor):e.apply(r,t))}function Pt(r,e){return Pt=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(t,n){return t.__proto__=n,t},Pt(r,e)}function oa(r,e){if(typeof e!="function"&&e!==null)throw new TypeError("Super expression must either be null or a function");r.prototype=Object.create(e&&e.prototype,{constructor:{value:r,writable:!0,configurable:!0}}),Object.defineProperty(r,"prototype",{writable:!1}),e&&Pt(r,e)}function ve(r,e,t){return(e=on(e))in r?Object.defineProperty(r,e,{value:t,enumerable:!0,configurable:!0,writable:!0}):r[e]=t,r}function aa(r){if(Array.isArray(r))return Nt(r)}function sa(r){if(typeof Symbol<"u"&&r[Symbol.iterator]!=null||r["@@iterator"]!=null)return Array.from(r)}function ca(){throw new TypeError(`Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function we(r){return aa(r)||sa(r)||rn(r)||ca()}function sn(r,e){var t=Object.keys(r);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(r);e&&(n=n.filter(function(i){return Object.getOwnPropertyDescriptor(r,i).enumerable})),t.push.apply(t,n)}return t}function cn(r){for(var e=1;e<arguments.length;e++){var t=arguments[e]!=null?arguments[e]:{};e%2?sn(Object(t),!0).forEach(function(n){ve(r,n,t[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(r,Object.getOwnPropertyDescriptors(t)):sn(Object(t)).forEach(function(n){Object.defineProperty(r,n,Object.getOwnPropertyDescriptor(t,n))})}return r}function la(r){var e=r.slices,t=r.offset,n=`\nprecision highp float;\n\nvarying vec2 v_diffVector;\nvarying float v_radius;\n\n#ifdef PICKING_MODE\nvarying vec4 v_color;\n#else\n// For normal mode, we use the border colors defined in the program:\n`.concat(e.flatMap(function(i,o){var a=i.value;return"attribute"in a?["varying float v_sliceValue_".concat(o+1,";")]:[]}).join(`\n`),`\n`).concat(e.map(function(i,o){var a=i.color;return"attribute"in a?"varying vec4 v_sliceColor_".concat(o+1,";"):"uniform vec4 u_sliceColor_".concat(o+1,";")}).join(`\n`),`\n#endif\n\nuniform vec4 u_defaultColor;\nuniform float u_cameraAngle;\nuniform float u_correctionRatio;\n\n`).concat("attribute"in t?`varying float v_offset;\n`:"",`\n`).concat("value"in t?`uniform float u_offset;\n`:"",`\n\nconst float bias = 255.0 / 254.0;\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nvoid main(void) {\n  float aaBorder = u_correctionRatio * 2.0;;\n  float dist = length(v_diffVector);\n  float offset = `).concat("attribute"in t?"v_offset":"u_offset",`;\n  float angle = atan(v_diffVector.y / v_diffVector.x);\n  if (v_diffVector.x < 0.0 && v_diffVector.y < 0.0) angle += `).concat(Math.PI,`;\n  else if (v_diffVector.x < 0.0) angle += `).concat(Math.PI,`;\n  else if (v_diffVector.y < 0.0) angle += `).concat(2*Math.PI,`;\n  angle = angle - u_cameraAngle + offset;\n  angle = mod(angle, `).concat(2*Math.PI,`);\n\n  // No antialiasing for picking mode:\n  #ifdef PICKING_MODE\n  if (dist > v_radius)\n    gl_FragColor = transparent;\n  else {\n    gl_FragColor = v_color;\n    gl_FragColor.a *= bias;\n  }\n  #else\n  // Colors:\n`).concat(e.map(function(i,o){var a=i.color,s=[];return"attribute"in a?s.push("  vec4 sliceColor_".concat(o+1," = v_sliceColor_").concat(o+1,";")):"transparent"in a?s.push("  vec4 sliceColor_".concat(o+1," = vec4(0.0, 0.0, 0.0, 0.0);")):s.push("  vec4 sliceColor_".concat(o+1," = u_sliceColor_").concat(o+1,";")),s.push("  sliceColor_".concat(o+1,".a *= bias;")),s.join(`\n`)}).join(`\n`),`\n  vec4 color = u_defaultColor;\n  color.a *= bias;\n\n  // Sizes:\n`).concat(e.map(function(i,o){var a=i.value;return"  float sliceValue_".concat(o+1," = ").concat("attribute"in a?"v_sliceValue_".concat(o+1):st(a.value),";")}).join(`\n`),`\n\n  // Angles and final color:\n  float total = `).concat(e.map(function(i,o){return"sliceValue_".concat(o+1)}).join(" + "),`;\n  float angle_0 = 0.0;\n  if (total > 0.0) {\n`).concat(e.map(function(i,o){return"    float angle_".concat(o+1," = angle_").concat(o," + sliceValue_").concat(o+1," * ").concat(2*Math.PI," / total;")}).join(`\n`),`\n    `).concat(e.map(function(i,o){return"if (angle < angle_".concat(o+1,") color = sliceColor_").concat(o+1,";")}).join(`\n    else `),`\n  }\n\n  if (dist < v_radius - aaBorder) {\n    gl_FragColor = color;\n  } else if (dist < v_radius) {\n    gl_FragColor = mix(transparent, color, (v_radius - dist) / aaBorder);\n  }\n  #endif\n}\n`);return n}function ua(r){var e=r.slices,t=r.offset,n=`\nattribute vec4 a_id;\nattribute vec2 a_position;\nattribute float a_size;\nattribute float a_angle;\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_correctionRatio;\n\nvarying vec2 v_diffVector;\nvarying float v_radius;\n\n`.concat("attribute"in t?`attribute float a_offset;\n`:"",`\n`).concat("attribute"in t?`varying float v_offset;\n`:"",`\n\n#ifdef PICKING_MODE\nvarying vec4 v_color;\n#else\n`).concat(e.flatMap(function(i,o){var a=i.value;return"attribute"in a?["attribute float a_sliceValue_".concat(o+1,";"),"varying float v_sliceValue_".concat(o+1,";")]:[]}).join(`\n`),`\n`).concat(e.flatMap(function(i,o){var a=i.color;return"attribute"in a?["attribute vec4 a_sliceColor_".concat(o+1,";"),"varying vec4 v_sliceColor_".concat(o+1,";")]:[]}).join(`\n`),`\n#endif\n\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nvoid main() {\n  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;\n  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));\n  vec2 position = a_position + diffVector;\n  gl_Position = vec4(\n    (u_matrix * vec3(position, 1)).xy,\n    0,\n    1\n  );\n\n  v_radius = size / 2.0;\n  v_diffVector = diffVector;\n  `).concat("attribute"in t?`v_offset = a_offset;\n`:"",`\n\n  #ifdef PICKING_MODE\n  v_color = a_id;\n  #else\n`).concat(e.flatMap(function(i,o){var a=i.value;return"attribute"in a?["  v_sliceValue_".concat(o+1," = a_sliceValue_").concat(o+1,";")]:[]}).join(`\n`),`\n`).concat(e.flatMap(function(i,o){var a=i.color;return"attribute"in a?["  v_sliceColor_".concat(o+1," = a_sliceColor_").concat(o+1,";")]:[]}).join(`\n`),`\n  #endif\n}\n`);return n}var Ot="#000000",ha={drawLabel:void 0,drawHover:void 0,defaultColor:Ot,offset:{value:0}},ln=WebGLRenderingContext,un=ln.UNSIGNED_BYTE,Ae=ln.FLOAT;function da(r){var e,t=cn(cn({},ha),r),n=t.slices,i=t.offset,o=t.drawHover,a=t.drawLabel,s=["u_sizeRatio","u_correctionRatio","u_cameraAngle","u_matrix","u_defaultColor"].concat(we("value"in i?["u_offset"]:[]),we(n.flatMap(function(l,c){var u=l.color;return"value"in u?["u_sliceColor_".concat(c+1)]:[]})));return e=function(l){function c(){var u;Qo(this,c);for(var d=arguments.length,h=new Array(d),m=0;m<d;m++)h[m]=arguments[m];return u=ia(this,c,[].concat(h)),ve(u,"drawLabel",a),ve(u,"drawHover",o),u}return oa(c,l),ta(c,[{key:"getDefinition",value:function(){return{VERTICES:3,VERTEX_SHADER_SOURCE:ua(t),FRAGMENT_SHADER_SOURCE:la(t),METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:s,ATTRIBUTES:[{name:"a_position",size:2,type:Ae},{name:"a_id",size:4,type:un,normalized:!0},{name:"a_size",size:1,type:Ae}].concat(we("attribute"in i?[{name:"a_offset",size:1,type:Ae}]:[]),we(n.flatMap(function(d,h){var m=d.color;return"attribute"in m?[{name:"a_sliceColor_".concat(h+1),size:4,type:un,normalized:!0}]:[]})),we(n.flatMap(function(d,h){var m=d.value;return"attribute"in m?[{name:"a_sliceValue_".concat(h+1),size:1,type:Ae}]:[]}))),CONSTANT_ATTRIBUTES:[{name:"a_angle",size:1,type:Ae}],CONSTANT_DATA:[[c.ANGLE_1],[c.ANGLE_2],[c.ANGLE_3]]}}},{key:"processVisibleItem",value:function(d,h,m){var g=this.array;g[h++]=m.x,g[h++]=m.y,g[h++]=d,g[h++]=m.size,"attribute"in i&&(g[h++]=m[i.attribute]||0),n.forEach(function(b){var E=b.color;"attribute"in E&&(g[h++]=X(m[E.attribute]||E.defaultValue||Ot))}),n.forEach(function(b){var E=b.value;"attribute"in E&&(g[h++]=m[E.attribute]||0)})}},{key:"setUniforms",value:function(d,h){var m=h.gl,g=h.uniformLocations,b=g.u_sizeRatio,E=g.u_correctionRatio,v=g.u_cameraAngle,T=g.u_matrix,_=g.u_defaultColor;m.uniform1f(E,d.correctionRatio),m.uniform1f(b,d.sizeRatio),m.uniform1f(v,d.cameraAngle),m.uniformMatrix3fv(T,!1,d.matrix),"value"in i&&m.uniform1f(g.u_offset,i.value);var f=nt(t.defaultColor||Ot),p=nn(f,4),y=p[0],R=p[1],S=p[2],F=p[3];m.uniform4f(_,y/255,R/255,S/255,F/255),n.forEach(function(x,O){var k=x.color;if("value"in k){var z=g["u_sliceColor_".concat(O+1)],M=nt(k.value),H=nn(M,4),w=H[0],C=H[1],A=H[2],N=H[3];m.uniform4f(z,w/255,C/255,A/255,N/255)}})}}])}(ke),ve(e,"ANGLE_1",0),ve(e,"ANGLE_2",2*Math.PI/3),ve(e,"ANGLE_3",4*Math.PI/3),e}const hn=r=>r,dn=r=>r*r,fn=r=>r*(2-r),gn=r=>(r*=2)<1?.5*r*r:-.5*(--r*(r-2)-1),mn=r=>r*r*r,vn=r=>--r*r*r+1,pn=r=>(r*=2)<1?.5*r*r*r:.5*((r-=2)*r*r+2),Dt={linear:hn,quadraticIn:dn,quadraticOut:fn,quadraticInOut:gn,cubicIn:mn,cubicOut:vn,cubicInOut:pn},kt={easing:"quadraticInOut",duration:150};function fa(r,e,t,n){const i=Object.assign({},kt,t),o=typeof i.easing=="function"?i.easing:Dt[i.easing],a=Date.now(),s={};for(const u in e){const d=e[u];s[u]={};for(const h in d)s[u][h]=r.getNodeAttribute(u,h)}let l=null;const c=()=>{l=null;let u=(Date.now()-a)/i.duration;if(u>=1){for(const d in e){const h=e[d];for(const m in h)r.setNodeAttribute(d,m,h[m])}typeof n=="function"&&n();return}u=o(u);for(const d in e){const h=e[d],m=s[d];for(const g in h)r.setNodeAttribute(d,g,h[g]*u+m[g]*(1-u))}l=requestAnimationFrame(c)};return c(),()=>{l&&cancelAnimationFrame(l)}}const Ve={black:"#000000",silver:"#C0C0C0",gray:"#808080",grey:"#808080",white:"#FFFFFF",maroon:"#800000",red:"#FF0000",purple:"#800080",fuchsia:"#FF00FF",green:"#008000",lime:"#00FF00",olive:"#808000",yellow:"#FFFF00",navy:"#000080",blue:"#0000FF",teal:"#008080",aqua:"#00FFFF",darkblue:"#00008B",mediumblue:"#0000CD",darkgreen:"#006400",darkcyan:"#008B8B",deepskyblue:"#00BFFF",darkturquoise:"#00CED1",mediumspringgreen:"#00FA9A",springgreen:"#00FF7F",cyan:"#00FFFF",midnightblue:"#191970",dodgerblue:"#1E90FF",lightseagreen:"#20B2AA",forestgreen:"#228B22",seagreen:"#2E8B57",darkslategray:"#2F4F4F",darkslategrey:"#2F4F4F",limegreen:"#32CD32",mediumseagreen:"#3CB371",turquoise:"#40E0D0",royalblue:"#4169E1",steelblue:"#4682B4",darkslateblue:"#483D8B",mediumturquoise:"#48D1CC",indigo:"#4B0082",darkolivegreen:"#556B2F",cadetblue:"#5F9EA0",cornflowerblue:"#6495ED",rebeccapurple:"#663399",mediumaquamarine:"#66CDAA",dimgray:"#696969",dimgrey:"#696969",slateblue:"#6A5ACD",olivedrab:"#6B8E23",slategray:"#708090",slategrey:"#708090",lightslategray:"#778899",lightslategrey:"#778899",mediumslateblue:"#7B68EE",lawngreen:"#7CFC00",chartreuse:"#7FFF00",aquamarine:"#7FFFD4",skyblue:"#87CEEB",lightskyblue:"#87CEFA",blueviolet:"#8A2BE2",darkred:"#8B0000",darkmagenta:"#8B008B",saddlebrown:"#8B4513",darkseagreen:"#8FBC8F",lightgreen:"#90EE90",mediumpurple:"#9370DB",darkviolet:"#9400D3",palegreen:"#98FB98",darkorchid:"#9932CC",yellowgreen:"#9ACD32",sienna:"#A0522D",brown:"#A52A2A",darkgray:"#A9A9A9",darkgrey:"#A9A9A9",lightblue:"#ADD8E6",greenyellow:"#ADFF2F",paleturquoise:"#AFEEEE",lightsteelblue:"#B0C4DE",powderblue:"#B0E0E6",firebrick:"#B22222",darkgoldenrod:"#B8860B",mediumorchid:"#BA55D3",rosybrown:"#BC8F8F",darkkhaki:"#BDB76B",mediumvioletred:"#C71585",indianred:"#CD5C5C",peru:"#CD853F",chocolate:"#D2691E",tan:"#D2B48C",lightgray:"#D3D3D3",lightgrey:"#D3D3D3",thistle:"#D8BFD8",orchid:"#DA70D6",goldenrod:"#DAA520",palevioletred:"#DB7093",crimson:"#DC143C",gainsboro:"#DCDCDC",plum:"#DDA0DD",burlywood:"#DEB887",lightcyan:"#E0FFFF",lavender:"#E6E6FA",darksalmon:"#E9967A",violet:"#EE82EE",palegoldenrod:"#EEE8AA",lightcoral:"#F08080",khaki:"#F0E68C",aliceblue:"#F0F8FF",honeydew:"#F0FFF0",azure:"#F0FFFF",sandybrown:"#F4A460",wheat:"#F5DEB3",beige:"#F5F5DC",whitesmoke:"#F5F5F5",mintcream:"#F5FFFA",ghostwhite:"#F8F8FF",salmon:"#FA8072",antiquewhite:"#FAEBD7",linen:"#FAF0E6",lightgoldenrodyellow:"#FAFAD2",oldlace:"#FDF5E6",magenta:"#FF00FF",deeppink:"#FF1493",orangered:"#FF4500",tomato:"#FF6347",hotpink:"#FF69B4",coral:"#FF7F50",darkorange:"#FF8C00",lightsalmon:"#FFA07A",orange:"#FFA500",lightpink:"#FFB6C1",pink:"#FFC0CB",gold:"#FFD700",peachpuff:"#FFDAB9",navajowhite:"#FFDEAD",moccasin:"#FFE4B5",bisque:"#FFE4C4",mistyrose:"#FFE4E1",blanchedalmond:"#FFEBCD",papayawhip:"#FFEFD5",lavenderblush:"#FFF0F5",seashell:"#FFF5EE",cornsilk:"#FFF8DC",lemonchiffon:"#FFFACD",floralwhite:"#FFFAF0",snow:"#FFFAFA",lightyellow:"#FFFFE0",ivory:"#FFFFF0"};function ga(r,e,t,n){const i=n||new Uint8Array(4);return r.readPixels(e,t,1,1,r.RGBA,r.UNSIGNED_BYTE,i),i}const _n=new Int8Array(4),We=new Int32Array(_n.buffer,0,1),bn=new Float32Array(_n.buffer,0,1),ma=/^\\s*rgba?\\s*\\(/,va=/^\\s*rgba?\\s*\\(\\s*([0-9]*)\\s*,\\s*([0-9]*)\\s*,\\s*([0-9]*)(?:\\s*,\\s*(.*)?)?\\)\\s*$/;function yn(r){let e=0,t=0,n=0,i=1;if(r[0]==="#")r.length===4?(e=parseInt(r.charAt(1)+r.charAt(1),16),t=parseInt(r.charAt(2)+r.charAt(2),16),n=parseInt(r.charAt(3)+r.charAt(3),16)):(e=parseInt(r.charAt(1)+r.charAt(2),16),t=parseInt(r.charAt(3)+r.charAt(4),16),n=parseInt(r.charAt(5)+r.charAt(6),16)),r.length===9&&(i=parseInt(r.charAt(7)+r.charAt(8),16)/255);else if(ma.test(r)){const o=r.match(va);o&&(e=+o[1],t=+o[2],n=+o[3],o[4]&&(i=+o[4]))}return{r:e,g:t,b:n,a:i}}const pe={};for(const r in Ve)pe[r]=V(Ve[r]),pe[Ve[r]]=pe[r];function It(r,e,t,n,i){return We[0]=n<<24|t<<16|e<<8|r,i&&(We[0]=We[0]&4278190079),bn[0]}function V(r){if(r=r.toLowerCase(),typeof pe[r]<"u")return pe[r];const e=yn(r),{r:t,g:n,b:i}=e;let{a:o}=e;o=o*255|0;const a=It(t,n,i,o,!0);return pe[r]=a,a}function pa(r,e){bn[0]=V(r);let t=We[0];e&&(t=t|16777216);const n=t&255,i=t>>8&255,o=t>>16&255,a=t>>24&255;return[n,i,o,a]}const zt={};function Gt(r){if(typeof zt[r]<"u")return zt[r];const e=(r&16711680)>>>16,t=(r&65280)>>>8,n=r&255,o=It(e,t,n,255,!0);return zt[r]=o,o}function Mt(r,e,t,n){return t+(e<<8)+(r<<16)}function Ut(r,e,t,n,i,o){const a=Math.floor(t/o*i),s=Math.floor(r.drawingBufferHeight/o-n/o*i),l=new Uint8Array(4);r.bindFramebuffer(r.FRAMEBUFFER,e),r.readPixels(a,s,1,1,r.RGBA,r.UNSIGNED_BYTE,l);const[c,u,d,h]=l;return[c,u,d,h]}function j(){return Float32Array.of(1,0,0,0,1,0,0,0,1)}function Se(r,e,t){return r[0]=e,r[4]=typeof t=="number"?t:e,r}function Bt(r,e){const t=Math.sin(e),n=Math.cos(e);return r[0]=n,r[1]=t,r[3]=-t,r[4]=n,r}function Ht(r,e,t){return r[6]=e,r[7]=t,r}function q(r,e){const t=r[0],n=r[1],i=r[2],o=r[3],a=r[4],s=r[5],l=r[6],c=r[7],u=r[8],d=e[0],h=e[1],m=e[2],g=e[3],b=e[4],E=e[5],v=e[6],T=e[7],_=e[8];return r[0]=d*t+h*o+m*l,r[1]=d*n+h*a+m*c,r[2]=d*i+h*s+m*u,r[3]=g*t+b*o+E*l,r[4]=g*n+b*a+E*c,r[5]=g*i+b*s+E*u,r[6]=v*t+T*o+_*l,r[7]=v*n+T*a+_*c,r[8]=v*i+T*s+_*u,r}function Ye(r,e,t=1){const n=r[0],i=r[1],o=r[3],a=r[4],s=r[6],l=r[7],c=e.x,u=e.y;return{x:c*n+u*o+s*t,y:c*i+u*a+l*t}}function En(r,e){const t=r.height/r.width,n=e.height/e.width;return t<1&&n>1||t>1&&n<1?1:Math.min(Math.max(n,1/n),Math.max(1/t,t))}function _e(r,e,t,n,i){const{angle:o,ratio:a,x:s,y:l}=r,{width:c,height:u}=e,d=j(),h=Math.min(c,u)-2*n,m=En(e,t);return i?(q(d,Ht(j(),s,l)),q(d,Se(j(),a)),q(d,Bt(j(),o)),q(d,Se(j(),c/h/2/m,u/h/2/m))):(q(d,Se(j(),2*(h/c)*m,2*(h/u)*m)),q(d,Bt(j(),-o)),q(d,Se(j(),1/a)),q(d,Ht(j(),-s,-l))),d}function Tn(r,e,t){const{x:n,y:i}=Ye(r,{x:Math.cos(e.angle),y:Math.sin(e.angle)},0);return 1/Math.sqrt(Math.pow(n,2)+Math.pow(i,2))/t.width}function $t(r,e){const t=e.size;if(t===0)return;const n=r.length;r.length+=t;let i=0;e.forEach(o=>{r[n+i]=o,i++})}function Rn(r){return typeof r=="object"&&r!==null&&r.constructor===Object}function Xe(r,...e){r=r||{};for(let t=0,n=e.length;t<n;t++){const i=e[t];i&&Object.assign(r,i)}return r}function Cn(r,...e){r=r||{};for(let t=0,n=e.length;t<n;t++){const i=e[t];if(i)for(const o in i)Rn(i[o])?r[o]=Cn(r[o],i[o]):r[o]=i[o]}return r}function wn(r){if(!r.order)return{x:[0,1],y:[0,1]};let e=1/0,t=-1/0,n=1/0,i=-1/0;return r.forEachNode((o,a)=>{const{x:s,y:l}=a;s<e&&(e=s),s>t&&(t=s),l<n&&(n=l),l>i&&(i=l)}),{x:[e,t],y:[n,i]}}function An(r){if(!Gi(r))throw new Error("Sigma: invalid graph instance.");r.forEachNode((e,t)=>{if(!Number.isFinite(t.x)||!Number.isFinite(t.y))throw new Error(`Sigma: Coordinates of node ${e} are invalid. A node must have a numeric \'x\' and \'y\' attribute.`)})}function Sn(r,e,t){const n=document.createElement(r);if(e)for(const i in e)n.style[i]=e[i];if(t)for(const i in t)n.setAttribute(i,t[i]);return n}function jt(){return typeof window.devicePixelRatio<"u"?window.devicePixelRatio:1}function Vt(r,e,t){return t.sort(function(n,i){const o=e(n)||0,a=e(i)||0;return o<a?-1:o>a?1:0})}function Wt(r){const{x:[e,t],y:[n,i]}=r;let o=Math.max(t-e,i-n),a=(t+e)/2,s=(i+n)/2;(o===0||Math.abs(o)===1/0||isNaN(o))&&(o=1),isNaN(a)&&(a=0),isNaN(s)&&(s=0);const l=c=>({x:.5+(c.x-a)/o,y:.5+(c.y-s)/o});return l.applyTo=c=>{c.x=.5+(c.x-a)/o,c.y=.5+(c.y-s)/o},l.inverse=c=>({x:a+o*(c.x-.5),y:s+o*(c.y-.5)}),l.ratio=o,l}const _a=Object.freeze(Object.defineProperty({__proto__:null,ANIMATE_DEFAULTS:kt,HTML_COLORS:Ve,animateNodes:fa,assign:Xe,assignDeep:Cn,colorToArray:pa,colorToIndex:Mt,createElement:Sn,createNormalizationFunction:Wt,cubicIn:mn,cubicInOut:pn,cubicOut:vn,easings:Dt,extend:$t,extractPixel:ga,floatColor:V,getCorrectionRatio:En,getMatrixImpact:Tn,getPixelColor:Ut,getPixelRatio:jt,graphExtent:wn,identity:j,indexToColor:Gt,isPlainObject:Rn,linear:hn,matrixFromCamera:_e,multiply:q,multiplyVec2:Ye,parseColor:yn,quadraticIn:dn,quadraticInOut:gn,quadraticOut:fn,rgbaToFloat:It,rotate:Bt,scale:Se,translate:Ht,validateGraph:An,zIndexOrdering:Vt},Symbol.toStringTag,{value:"Module"}));function xn(r){return r.normalized?1:r.size}function qe(r){let e=0;return r.forEach(t=>e+=xn(t)),e}function Ln(r,e,t){const n=r==="VERTEX"?e.VERTEX_SHADER:e.FRAGMENT_SHADER,i=e.createShader(n);if(i===null)throw new Error("loadShader: error while creating the shader");if(e.shaderSource(i,t),e.compileShader(i),!e.getShaderParameter(i,e.COMPILE_STATUS)){const a=e.getShaderInfoLog(i);throw e.deleteShader(i),new Error(`loadShader: error while compiling the shader:\n${a}\n${t}`)}return i}function Fn(r,e){return Ln("VERTEX",r,e)}function Nn(r,e){return Ln("FRAGMENT",r,e)}function Pn(r,e){const t=r.createProgram();if(t===null)throw new Error("loadProgram: error while creating the program.");let n,i;for(n=0,i=e.length;n<i;n++)r.attachShader(t,e[n]);if(r.linkProgram(t),!r.getProgramParameter(t,r.LINK_STATUS))throw r.deleteProgram(t),new Error("loadProgram: error while linking the program.");return t}function Yt({gl:r,buffer:e,program:t,vertexShader:n,fragmentShader:i}){r.deleteShader(n),r.deleteShader(i),r.deleteProgram(t),r.deleteBuffer(e)}function ba(r){return r%1===0?r.toFixed(1):r.toString()}const On=`#define PICKING_MODE\n`,ya={[WebGL2RenderingContext.BOOL]:1,[WebGL2RenderingContext.BYTE]:1,[WebGL2RenderingContext.UNSIGNED_BYTE]:1,[WebGL2RenderingContext.SHORT]:2,[WebGL2RenderingContext.UNSIGNED_SHORT]:2,[WebGL2RenderingContext.INT]:4,[WebGL2RenderingContext.UNSIGNED_INT]:4,[WebGL2RenderingContext.FLOAT]:4};class Xt{constructor(e,t,n){}}class qt{constructor(e,t,n){this.array=new Float32Array,this.constantArray=new Float32Array,this.capacity=0,this.verticesCount=0;const i=this.getDefinition();if(this.VERTICES=i.VERTICES,this.VERTEX_SHADER_SOURCE=i.VERTEX_SHADER_SOURCE,this.FRAGMENT_SHADER_SOURCE=i.FRAGMENT_SHADER_SOURCE,this.UNIFORMS=i.UNIFORMS,this.ATTRIBUTES=i.ATTRIBUTES,this.METHOD=i.METHOD,this.CONSTANT_ATTRIBUTES="CONSTANT_ATTRIBUTES"in i?i.CONSTANT_ATTRIBUTES:[],this.CONSTANT_DATA="CONSTANT_DATA"in i?i.CONSTANT_DATA:[],this.isInstanced="CONSTANT_ATTRIBUTES"in i,this.ATTRIBUTES_ITEMS_COUNT=qe(this.ATTRIBUTES),this.STRIDE=this.VERTICES*this.ATTRIBUTES_ITEMS_COUNT,this.renderer=n,this.normalProgram=this.getProgramInfo("normal",e,i.VERTEX_SHADER_SOURCE,i.FRAGMENT_SHADER_SOURCE,null),this.pickProgram=t?this.getProgramInfo("pick",e,On+i.VERTEX_SHADER_SOURCE,On+i.FRAGMENT_SHADER_SOURCE,t):null,this.isInstanced){const o=qe(this.CONSTANT_ATTRIBUTES);if(this.CONSTANT_DATA.length!==this.VERTICES)throw new Error(`Program: error while getting constant data (expected ${this.VERTICES} items, received ${this.CONSTANT_DATA.length} instead)`);this.constantArray=new Float32Array(this.CONSTANT_DATA.length*o);for(let a=0;a<this.CONSTANT_DATA.length;a++){const s=this.CONSTANT_DATA[a];if(s.length!==o)throw new Error(`Program: error while getting constant data (one vector has ${s.length} items instead of ${o})`);for(let l=0;l<s.length;l++)this.constantArray[a*o+l]=s[l]}this.STRIDE=this.ATTRIBUTES_ITEMS_COUNT}}kill(){Yt(this.normalProgram),this.pickProgram&&(Yt(this.pickProgram),this.pickProgram=null)}getProgramInfo(e,t,n,i,o){const a=this.getDefinition(),s=t.createBuffer();if(s===null)throw new Error("Program: error while creating the WebGL buffer.");const l=Fn(t,n),c=Nn(t,i),u=Pn(t,[l,c]),d={};a.UNIFORMS.forEach(g=>{const b=t.getUniformLocation(u,g);b&&(d[g]=b)});const h={};a.ATTRIBUTES.forEach(g=>{h[g.name]=t.getAttribLocation(u,g.name)});let m;if("CONSTANT_ATTRIBUTES"in a&&(a.CONSTANT_ATTRIBUTES.forEach(g=>{h[g.name]=t.getAttribLocation(u,g.name)}),m=t.createBuffer(),m===null))throw new Error("Program: error while creating the WebGL constant buffer.");return{name:e,program:u,gl:t,frameBuffer:o,buffer:s,constantBuffer:m||{},uniformLocations:d,attributeLocations:h,isPicking:e==="pick",vertexShader:l,fragmentShader:c}}bindProgram(e){let t=0;const{gl:n,buffer:i}=e;this.isInstanced?(n.bindBuffer(n.ARRAY_BUFFER,e.constantBuffer),t=0,this.CONSTANT_ATTRIBUTES.forEach(o=>t+=this.bindAttribute(o,e,t,!1)),n.bufferData(n.ARRAY_BUFFER,this.constantArray,n.STATIC_DRAW),n.bindBuffer(n.ARRAY_BUFFER,e.buffer),t=0,this.ATTRIBUTES.forEach(o=>t+=this.bindAttribute(o,e,t,!0)),n.bufferData(n.ARRAY_BUFFER,this.array,n.DYNAMIC_DRAW)):(n.bindBuffer(n.ARRAY_BUFFER,i),t=0,this.ATTRIBUTES.forEach(o=>t+=this.bindAttribute(o,e,t)),n.bufferData(n.ARRAY_BUFFER,this.array,n.DYNAMIC_DRAW)),n.bindBuffer(n.ARRAY_BUFFER,null)}unbindProgram(e){this.isInstanced?(this.CONSTANT_ATTRIBUTES.forEach(t=>this.unbindAttribute(t,e,!1)),this.ATTRIBUTES.forEach(t=>this.unbindAttribute(t,e,!0))):this.ATTRIBUTES.forEach(t=>this.unbindAttribute(t,e))}bindAttribute(e,t,n,i){const o=ya[e.type];if(typeof o!="number")throw new Error(`Program.bind: yet unsupported attribute type "${e.type}"`);const a=t.attributeLocations[e.name],s=t.gl;if(a!==-1){s.enableVertexAttribArray(a);const l=this.isInstanced?(i?this.ATTRIBUTES_ITEMS_COUNT:qe(this.CONSTANT_ATTRIBUTES))*Float32Array.BYTES_PER_ELEMENT:this.ATTRIBUTES_ITEMS_COUNT*Float32Array.BYTES_PER_ELEMENT;if(s.vertexAttribPointer(a,e.size,e.type,e.normalized||!1,l,n),this.isInstanced&&i)if(s instanceof WebGL2RenderingContext)s.vertexAttribDivisor(a,1);else{const c=s.getExtension("ANGLE_instanced_arrays");c&&c.vertexAttribDivisorANGLE(a,1)}}return e.size*o}unbindAttribute(e,t,n){const i=t.attributeLocations[e.name],o=t.gl;if(i!==-1&&(o.disableVertexAttribArray(i),this.isInstanced&&n))if(o instanceof WebGL2RenderingContext)o.vertexAttribDivisor(i,0);else{const a=o.getExtension("ANGLE_instanced_arrays");a&&a.vertexAttribDivisorANGLE(i,0)}}reallocate(e){e!==this.capacity&&(this.capacity=e,this.verticesCount=this.VERTICES*e,this.array=new Float32Array(this.isInstanced?this.capacity*this.ATTRIBUTES_ITEMS_COUNT:this.verticesCount*this.ATTRIBUTES_ITEMS_COUNT))}hasNothingToRender(){return this.verticesCount===0}renderProgram(e,t){const{gl:n,program:i}=t;n.enable(n.BLEND),n.useProgram(i),this.setUniforms(e,t),this.drawWebGL(this.METHOD,t)}render(e){this.hasNothingToRender()||(this.pickProgram&&(this.pickProgram.gl.viewport(0,0,e.width*e.pixelRatio/e.downSizingRatio,e.height*e.pixelRatio/e.downSizingRatio),this.bindProgram(this.pickProgram),this.renderProgram({...e,pixelRatio:e.pixelRatio/e.downSizingRatio},this.pickProgram),this.unbindProgram(this.pickProgram)),this.normalProgram.gl.viewport(0,0,e.width*e.pixelRatio,e.height*e.pixelRatio),this.bindProgram(this.normalProgram),this.renderProgram(e,this.normalProgram),this.unbindProgram(this.normalProgram))}drawWebGL(e,{gl:t,frameBuffer:n}){if(t.bindFramebuffer(t.FRAMEBUFFER,n),!this.isInstanced)t.drawArrays(e,0,this.verticesCount);else if(t instanceof WebGL2RenderingContext)t.drawArraysInstanced(e,0,this.VERTICES,this.capacity);else{const i=t.getExtension("ANGLE_instanced_arrays");i&&i.drawArraysInstancedANGLE(e,0,this.VERTICES,this.capacity)}}}class Ea extends Xt{}class Kt extends qt{kill(){super.kill()}process(e,t,n){let i=t*this.STRIDE;if(n.hidden){for(let o=i+this.STRIDE;i<o;i++)this.array[i]=0;return}return this.processVisibleItem(Gt(e),i,n)}}function Ta(r,e,t){return class{constructor(i,o,a){this.drawLabel=e,this.drawHover=t,this.programs=r.map(s=>new s(i,o,a))}reallocate(i){this.programs.forEach(o=>o.reallocate(i))}process(i,o,a){this.programs.forEach(s=>s.process(i,o,a))}render(i){this.programs.forEach(o=>o.render(i))}kill(){this.programs.forEach(i=>i.kill())}}}class Ra extends Xt{}class se extends qt{constructor(){super(...arguments),this.drawLabel=void 0}kill(){super.kill()}process(e,t,n,i,o){let a=t*this.STRIDE;if(o.hidden||n.hidden||i.hidden){for(let s=a+this.STRIDE;a<s;a++)this.array[a]=0;return}return this.processVisibleItem(Gt(e),a,n,i,o)}}function Zt(r,e){return class{constructor(n,i,o){this.drawLabel=e,this.programs=r.map(a=>new a(n,i,o))}reallocate(n){this.programs.forEach(i=>i.reallocate(n))}process(n,i,o,a,s){this.programs.forEach(l=>l.process(n,i,o,a,s))}render(n){this.programs.forEach(i=>i.render(n))}kill(){this.programs.forEach(n=>n.kill())}}}function Dn(r,e,t,n,i){const o=i.edgeLabelSize,a=i.edgeLabelFont,s=i.edgeLabelWeight,l=i.edgeLabelColor.attribute?e[i.edgeLabelColor.attribute]||i.edgeLabelColor.color||"#000":i.edgeLabelColor.color;let c=e.label;if(!c)return;r.fillStyle=l,r.font=`${s} ${o}px ${a}`;const u=t.size,d=n.size;let h=t.x,m=t.y,g=n.x,b=n.y,E=(h+g)/2,v=(m+b)/2,T=g-h,_=b-m,f=Math.sqrt(T*T+_*_);if(f<u+d)return;h+=T*u/f,m+=_*u/f,g-=T*d/f,b-=_*d/f,E=(h+g)/2,v=(m+b)/2,T=g-h,_=b-m,f=Math.sqrt(T*T+_*_);let p=r.measureText(c).width;if(p>f){const R="\u2026";for(c=c+R,p=r.measureText(c).width;p>f&&c.length>1;)c=c.slice(0,-2)+R,p=r.measureText(c).width;if(c.length<4)return}let y;T>0?_>0?y=Math.acos(T/f):y=Math.asin(_/f):_>0?y=Math.acos(T/f)+Math.PI:y=Math.asin(T/f)+Math.PI/2,r.save(),r.translate(E,v),r.rotate(y),r.fillText(c,-p/2,e.size/2+o),r.restore()}function Qt(r,e,t){if(!e.label)return;const n=t.labelSize,i=t.labelFont,o=t.labelWeight,a=t.labelColor.attribute?e[t.labelColor.attribute]||t.labelColor.color||"#000":t.labelColor.color;r.fillStyle=a,r.font=`${o} ${n}px ${i}`,r.fillText(e.label,e.x+e.size+3,e.y+n/3)}function kn(r,e,t){const n=t.labelSize,i=t.labelFont,o=t.labelWeight;r.font=`${o} ${n}px ${i}`,r.fillStyle="#FFF",r.shadowOffsetX=0,r.shadowOffsetY=0,r.shadowBlur=8,r.shadowColor="#000";const a=2;if(typeof e.label=="string"){const s=r.measureText(e.label).width,l=Math.round(s+5),c=Math.round(n+2*a),u=Math.max(e.size,n/2)+a,d=Math.asin(c/2/u),h=Math.sqrt(Math.abs(Math.pow(u,2)-Math.pow(c/2,2)));r.beginPath(),r.moveTo(e.x+h,e.y+c/2),r.lineTo(e.x+u+l,e.y+c/2),r.lineTo(e.x+u+l,e.y-c/2),r.lineTo(e.x+h,e.y-c/2),r.arc(e.x,e.y,u,d,-d),r.closePath(),r.fill()}else r.beginPath(),r.arc(e.x,e.y,e.size+a,0,Math.PI*2),r.closePath(),r.fill();r.shadowOffsetX=0,r.shadowOffsetY=0,r.shadowBlur=0,Qt(r,e,t)}const Ca=`\nprecision highp float;\n\nvarying vec4 v_color;\nvarying vec2 v_diffVector;\nvarying float v_radius;\n\nuniform float u_correctionRatio;\n\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nvoid main(void) {\n  float border = u_correctionRatio * 2.0;\n  float dist = length(v_diffVector) - v_radius + border;\n\n  // No antialiasing for picking mode:\n  #ifdef PICKING_MODE\n  if (dist > border)\n    gl_FragColor = transparent;\n  else\n    gl_FragColor = v_color;\n\n  #else\n  float t = 0.0;\n  if (dist > border)\n    t = 1.0;\n  else if (dist > 0.0)\n    t = dist / border;\n\n  gl_FragColor = mix(v_color, transparent, t);\n  #endif\n}\n`,wa=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_position;\nattribute float a_size;\nattribute float a_angle;\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_correctionRatio;\n\nvarying vec4 v_color;\nvarying vec2 v_diffVector;\nvarying float v_radius;\nvarying float v_border;\n\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;\n  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));\n  vec2 position = a_position + diffVector;\n  gl_Position = vec4(\n    (u_matrix * vec3(position, 1)).xy,\n    0,\n    1\n  );\n\n  v_diffVector = diffVector;\n  v_radius = size / 2.0;\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,{UNSIGNED_BYTE:In,FLOAT:Jt}=WebGLRenderingContext,Aa=["u_sizeRatio","u_correctionRatio","u_matrix"],re=class re extends Kt{getDefinition(){return{VERTICES:3,VERTEX_SHADER_SOURCE:wa,FRAGMENT_SHADER_SOURCE:Ca,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Aa,ATTRIBUTES:[{name:"a_position",size:2,type:Jt},{name:"a_size",size:1,type:Jt},{name:"a_color",size:4,type:In,normalized:!0},{name:"a_id",size:4,type:In,normalized:!0}],CONSTANT_ATTRIBUTES:[{name:"a_angle",size:1,type:Jt}],CONSTANT_DATA:[[re.ANGLE_1],[re.ANGLE_2],[re.ANGLE_3]]}}processVisibleItem(e,t,n){const i=this.array,o=V(n.color);i[t++]=n.x,i[t++]=n.y,i[t++]=n.size,i[t++]=o,i[t++]=e}setUniforms(e,{gl:t,uniformLocations:n}){const{u_sizeRatio:i,u_correctionRatio:o,u_matrix:a}=n;t.uniform1f(o,e.correctionRatio),t.uniform1f(i,e.sizeRatio),t.uniformMatrix3fv(a,!1,e.matrix)}};re.ANGLE_1=0,re.ANGLE_2=2*Math.PI/3,re.ANGLE_3=4*Math.PI/3;let Ke=re;const Sa=`\nprecision mediump float;\n\nvarying vec4 v_color;\nvarying float v_border;\n\nconst float radius = 0.5;\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nvoid main(void) {\n  vec2 m = gl_PointCoord - vec2(0.5, 0.5);\n  float dist = radius - length(m);\n\n  // No antialiasing for picking mode:\n  #ifdef PICKING_MODE\n  if (dist > v_border)\n    gl_FragColor = v_color;\n  else\n    gl_FragColor = transparent;\n\n  #else\n  float t = 0.0;\n  if (dist > v_border)\n    t = 1.0;\n  else if (dist > 0.0)\n    t = dist / v_border;\n\n  gl_FragColor = mix(transparent, v_color, t);\n  #endif\n}\n`,xa=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_position;\nattribute float a_size;\n\nuniform float u_sizeRatio;\nuniform float u_pixelRatio;\nuniform mat3 u_matrix;\n\nvarying vec4 v_color;\nvarying float v_border;\n\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  gl_Position = vec4(\n    (u_matrix * vec3(a_position, 1)).xy,\n    0,\n    1\n  );\n\n  // Multiply the point size twice:\n  //  - x SCALING_RATIO to correct the canvas scaling\n  //  - x 2 to correct the formulae\n  gl_PointSize = a_size / u_sizeRatio * u_pixelRatio * 2.0;\n\n  v_border = (0.5 / a_size) * u_sizeRatio;\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,{UNSIGNED_BYTE:zn,FLOAT:Gn}=WebGLRenderingContext,La=["u_sizeRatio","u_pixelRatio","u_matrix"];class Fa extends Kt{getDefinition(){return{VERTICES:1,VERTEX_SHADER_SOURCE:xa,FRAGMENT_SHADER_SOURCE:Sa,METHOD:WebGLRenderingContext.POINTS,UNIFORMS:La,ATTRIBUTES:[{name:"a_position",size:2,type:Gn},{name:"a_size",size:1,type:Gn},{name:"a_color",size:4,type:zn,normalized:!0},{name:"a_id",size:4,type:zn,normalized:!0}]}}processVisibleItem(e,t,n){const i=this.array;i[t++]=n.x,i[t++]=n.y,i[t++]=n.size,i[t++]=V(n.color),i[t++]=e}setUniforms({sizeRatio:e,pixelRatio:t,matrix:n},{gl:i,uniformLocations:o}){const{u_sizeRatio:a,u_pixelRatio:s,u_matrix:l}=o;i.uniform1f(s,t),i.uniform1f(a,e),i.uniformMatrix3fv(l,!1,n)}}const Na=`\nprecision mediump float;\n\nvarying vec4 v_color;\n\nvoid main(void) {\n  gl_FragColor = v_color;\n}\n`,Pa=`\nattribute vec2 a_position;\nattribute vec2 a_normal;\nattribute float a_radius;\nattribute vec3 a_barycentric;\n\n#ifdef PICKING_MODE\nattribute vec4 a_id;\n#else\nattribute vec4 a_color;\n#endif\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_correctionRatio;\nuniform float u_minEdgeThickness;\nuniform float u_lengthToThicknessRatio;\nuniform float u_widenessToThicknessRatio;\n\nvarying vec4 v_color;\n\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  float minThickness = u_minEdgeThickness;\n\n  float normalLength = length(a_normal);\n  vec2 unitNormal = a_normal / normalLength;\n\n  // These first computations are taken from edge.vert.glsl and\n  // edge.clamped.vert.glsl. Please read it to get better comments on what\'s\n  // happening:\n  float pixelsThickness = max(normalLength / u_sizeRatio, minThickness);\n  float webGLThickness = pixelsThickness * u_correctionRatio;\n  float webGLNodeRadius = a_radius * 2.0 * u_correctionRatio / u_sizeRatio;\n  float webGLArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;\n  float webGLArrowHeadThickness = webGLThickness * u_widenessToThicknessRatio;\n\n  float da = a_barycentric.x;\n  float db = a_barycentric.y;\n  float dc = a_barycentric.z;\n\n  vec2 delta = vec2(\n      da * (webGLNodeRadius * unitNormal.y)\n    + db * ((webGLNodeRadius + webGLArrowHeadLength) * unitNormal.y + webGLArrowHeadThickness * unitNormal.x)\n    + dc * ((webGLNodeRadius + webGLArrowHeadLength) * unitNormal.y - webGLArrowHeadThickness * unitNormal.x),\n\n      da * (-webGLNodeRadius * unitNormal.x)\n    + db * (-(webGLNodeRadius + webGLArrowHeadLength) * unitNormal.x + webGLArrowHeadThickness * unitNormal.y)\n    + dc * (-(webGLNodeRadius + webGLArrowHeadLength) * unitNormal.x - webGLArrowHeadThickness * unitNormal.y)\n  );\n\n  vec2 position = (u_matrix * vec3(a_position + delta, 1)).xy;\n\n  gl_Position = vec4(position, 0, 1);\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,{UNSIGNED_BYTE:Mn,FLOAT:Ze}=WebGLRenderingContext,Oa=["u_matrix","u_sizeRatio","u_correctionRatio","u_minEdgeThickness","u_lengthToThicknessRatio","u_widenessToThicknessRatio"],Qe={extremity:"target",lengthToThicknessRatio:2.5,widenessToThicknessRatio:2};function xe(r){const e={...Qe,...r||{}};return class extends se{getDefinition(){return{VERTICES:3,VERTEX_SHADER_SOURCE:Pa,FRAGMENT_SHADER_SOURCE:Na,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Oa,ATTRIBUTES:[{name:"a_position",size:2,type:Ze},{name:"a_normal",size:2,type:Ze},{name:"a_radius",size:1,type:Ze},{name:"a_color",size:4,type:Mn,normalized:!0},{name:"a_id",size:4,type:Mn,normalized:!0}],CONSTANT_ATTRIBUTES:[{name:"a_barycentric",size:3,type:Ze}],CONSTANT_DATA:[[1,0,0],[0,1,0],[0,0,1]]}}processVisibleItem(n,i,o,a,s){e.extremity==="source"&&([o,a]=[a,o]);const l=s.size||1,c=a.size||1,u=o.x,d=o.y,h=a.x,m=a.y,g=V(s.color),b=h-u,E=m-d;let v=b*b+E*E,T=0,_=0;v&&(v=1/Math.sqrt(v),T=-E*v*l,_=b*v*l);const f=this.array;f[i++]=h,f[i++]=m,f[i++]=-T,f[i++]=-_,f[i++]=c,f[i++]=g,f[i++]=n}setUniforms(n,{gl:i,uniformLocations:o}){const{u_matrix:a,u_sizeRatio:s,u_correctionRatio:l,u_minEdgeThickness:c,u_lengthToThicknessRatio:u,u_widenessToThicknessRatio:d}=o;i.uniformMatrix3fv(a,!1,n.matrix),i.uniform1f(s,n.sizeRatio),i.uniform1f(l,n.correctionRatio),i.uniform1f(c,n.minEdgeThickness),i.uniform1f(u,e.lengthToThicknessRatio),i.uniform1f(d,e.widenessToThicknessRatio)}}}const Da=xe(),er=`\nprecision mediump float;\n\nvarying vec4 v_color;\nvarying vec2 v_normal;\nvarying float v_thickness;\nvarying float v_feather;\n\nconst vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);\n\nvoid main(void) {\n  // We only handle antialiasing for normal mode:\n  #ifdef PICKING_MODE\n  gl_FragColor = v_color;\n  #else\n  float dist = length(v_normal) * v_thickness;\n\n  float t = smoothstep(\n    v_thickness - v_feather,\n    v_thickness,\n    dist\n  );\n\n  gl_FragColor = mix(v_color, transparent, t);\n  #endif\n}\n`,ka=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_normal;\nattribute float a_normalCoef;\nattribute vec2 a_positionStart;\nattribute vec2 a_positionEnd;\nattribute float a_positionCoef;\nattribute float a_radius;\nattribute float a_radiusCoef;\n\nuniform mat3 u_matrix;\nuniform float u_zoomRatio;\nuniform float u_sizeRatio;\nuniform float u_pixelRatio;\nuniform float u_correctionRatio;\nuniform float u_minEdgeThickness;\nuniform float u_lengthToThicknessRatio;\nuniform float u_feather;\n\nvarying vec4 v_color;\nvarying vec2 v_normal;\nvarying float v_thickness;\nvarying float v_feather;\n\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  float minThickness = u_minEdgeThickness;\n\n  float radius = a_radius * a_radiusCoef;\n  vec2 normal = a_normal * a_normalCoef;\n  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;\n\n  float normalLength = length(normal);\n  vec2 unitNormal = normal / normalLength;\n\n  // These first computations are taken from edge.vert.glsl. Please read it to\n  // get better comments on what\'s happening:\n  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);\n  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;\n\n  // Here, we move the point to leave space for the arrow head:\n  float direction = sign(radius);\n  float webGLNodeRadius = direction * radius * 2.0 * u_correctionRatio / u_sizeRatio;\n  float webGLArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;\n\n  vec2 compensationVector = vec2(-direction * unitNormal.y, direction * unitNormal.x) * (webGLNodeRadius + webGLArrowHeadLength);\n\n  // Here is the proper position of the vertex\n  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness + compensationVector, 1)).xy, 0, 1);\n\n  v_thickness = webGLThickness / u_zoomRatio;\n\n  v_normal = unitNormal;\n\n  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,{UNSIGNED_BYTE:Un,FLOAT:ce}=WebGLRenderingContext,Ia=["u_matrix","u_zoomRatio","u_sizeRatio","u_correctionRatio","u_pixelRatio","u_feather","u_minEdgeThickness","u_lengthToThicknessRatio"],Bn={lengthToThicknessRatio:Qe.lengthToThicknessRatio};function tr(r){const e={...Bn,...r||{}};return class extends se{getDefinition(){return{VERTICES:6,VERTEX_SHADER_SOURCE:ka,FRAGMENT_SHADER_SOURCE:er,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Ia,ATTRIBUTES:[{name:"a_positionStart",size:2,type:ce},{name:"a_positionEnd",size:2,type:ce},{name:"a_normal",size:2,type:ce},{name:"a_color",size:4,type:Un,normalized:!0},{name:"a_id",size:4,type:Un,normalized:!0},{name:"a_radius",size:1,type:ce}],CONSTANT_ATTRIBUTES:[{name:"a_positionCoef",size:1,type:ce},{name:"a_normalCoef",size:1,type:ce},{name:"a_radiusCoef",size:1,type:ce}],CONSTANT_DATA:[[0,1,0],[0,-1,0],[1,1,1],[1,1,1],[0,-1,0],[1,-1,-1]]}}processVisibleItem(n,i,o,a,s){const l=s.size||1,c=o.x,u=o.y,d=a.x,h=a.y,m=V(s.color),g=d-c,b=h-u,E=a.size||1;let v=g*g+b*b,T=0,_=0;v&&(v=1/Math.sqrt(v),T=-b*v*l,_=g*v*l);const f=this.array;f[i++]=c,f[i++]=u,f[i++]=d,f[i++]=h,f[i++]=T,f[i++]=_,f[i++]=m,f[i++]=n,f[i++]=E}setUniforms(n,{gl:i,uniformLocations:o}){const{u_matrix:a,u_zoomRatio:s,u_feather:l,u_pixelRatio:c,u_correctionRatio:u,u_sizeRatio:d,u_minEdgeThickness:h,u_lengthToThicknessRatio:m}=o;i.uniformMatrix3fv(a,!1,n.matrix),i.uniform1f(s,n.zoomRatio),i.uniform1f(d,n.sizeRatio),i.uniform1f(u,n.correctionRatio),i.uniform1f(c,n.pixelRatio),i.uniform1f(l,n.antiAliasingFeather),i.uniform1f(h,n.minEdgeThickness),i.uniform1f(m,e.lengthToThicknessRatio)}}}const za=tr(),Ga=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_normal;\nattribute float a_normalCoef;\nattribute vec2 a_positionStart;\nattribute vec2 a_positionEnd;\nattribute float a_positionCoef;\nattribute float a_sourceRadius;\nattribute float a_targetRadius;\nattribute float a_sourceRadiusCoef;\nattribute float a_targetRadiusCoef;\n\nuniform mat3 u_matrix;\nuniform float u_zoomRatio;\nuniform float u_sizeRatio;\nuniform float u_pixelRatio;\nuniform float u_correctionRatio;\nuniform float u_minEdgeThickness;\nuniform float u_lengthToThicknessRatio;\nuniform float u_feather;\n\nvarying vec4 v_color;\nvarying vec2 v_normal;\nvarying float v_thickness;\nvarying float v_feather;\n\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  float minThickness = u_minEdgeThickness;\n\n  vec2 normal = a_normal * a_normalCoef;\n  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;\n\n  float normalLength = length(normal);\n  vec2 unitNormal = normal / normalLength;\n\n  // These first computations are taken from edge.vert.glsl. Please read it to\n  // get better comments on what\'s happening:\n  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);\n  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;\n\n  // Here, we move the point to leave space for the arrow heads:\n  // Source arrow head\n  float sourceRadius = a_sourceRadius * a_sourceRadiusCoef;\n  float sourceDirection = sign(sourceRadius);\n  float webGLSourceRadius = sourceDirection * sourceRadius * 2.0 * u_correctionRatio / u_sizeRatio;\n  float webGLSourceArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;\n  vec2 sourceCompensationVector =\n    vec2(-sourceDirection * unitNormal.y, sourceDirection * unitNormal.x)\n    * (webGLSourceRadius + webGLSourceArrowHeadLength);\n    \n  // Target arrow head\n  float targetRadius = a_targetRadius * a_targetRadiusCoef;\n  float targetDirection = sign(targetRadius);\n  float webGLTargetRadius = targetDirection * targetRadius * 2.0 * u_correctionRatio / u_sizeRatio;\n  float webGLTargetArrowHeadLength = webGLThickness * u_lengthToThicknessRatio * 2.0;\n  vec2 targetCompensationVector =\n  vec2(-targetDirection * unitNormal.y, targetDirection * unitNormal.x)\n    * (webGLTargetRadius + webGLTargetArrowHeadLength);\n\n  // Here is the proper position of the vertex\n  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness + sourceCompensationVector + targetCompensationVector, 1)).xy, 0, 1);\n\n  v_thickness = webGLThickness / u_zoomRatio;\n\n  v_normal = unitNormal;\n\n  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,{UNSIGNED_BYTE:Hn,FLOAT:K}=WebGLRenderingContext,Ma=["u_matrix","u_zoomRatio","u_sizeRatio","u_correctionRatio","u_pixelRatio","u_feather","u_minEdgeThickness","u_lengthToThicknessRatio"],$n={lengthToThicknessRatio:Qe.lengthToThicknessRatio};function rr(r){const e={...$n,...r||{}};return class extends se{getDefinition(){return{VERTICES:6,VERTEX_SHADER_SOURCE:Ga,FRAGMENT_SHADER_SOURCE:er,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Ma,ATTRIBUTES:[{name:"a_positionStart",size:2,type:K},{name:"a_positionEnd",size:2,type:K},{name:"a_normal",size:2,type:K},{name:"a_color",size:4,type:Hn,normalized:!0},{name:"a_id",size:4,type:Hn,normalized:!0},{name:"a_sourceRadius",size:1,type:K},{name:"a_targetRadius",size:1,type:K}],CONSTANT_ATTRIBUTES:[{name:"a_positionCoef",size:1,type:K},{name:"a_normalCoef",size:1,type:K},{name:"a_sourceRadiusCoef",size:1,type:K},{name:"a_targetRadiusCoef",size:1,type:K}],CONSTANT_DATA:[[0,1,-1,0],[0,-1,1,0],[1,1,0,1],[1,1,0,1],[0,-1,1,0],[1,-1,0,-1]]}}processVisibleItem(n,i,o,a,s){const l=s.size||1,c=o.x,u=o.y,d=a.x,h=a.y,m=V(s.color),g=d-c,b=h-u,E=o.size||1,v=a.size||1;let T=g*g+b*b,_=0,f=0;T&&(T=1/Math.sqrt(T),_=-b*T*l,f=g*T*l);const p=this.array;p[i++]=c,p[i++]=u,p[i++]=d,p[i++]=h,p[i++]=_,p[i++]=f,p[i++]=m,p[i++]=n,p[i++]=E,p[i++]=v}setUniforms(n,{gl:i,uniformLocations:o}){const{u_matrix:a,u_zoomRatio:s,u_feather:l,u_pixelRatio:c,u_correctionRatio:u,u_sizeRatio:d,u_minEdgeThickness:h,u_lengthToThicknessRatio:m}=o;i.uniformMatrix3fv(a,!1,n.matrix),i.uniform1f(s,n.zoomRatio),i.uniform1f(d,n.sizeRatio),i.uniform1f(u,n.correctionRatio),i.uniform1f(c,n.pixelRatio),i.uniform1f(l,n.antiAliasingFeather),i.uniform1f(h,n.minEdgeThickness),i.uniform1f(m,e.lengthToThicknessRatio)}}}const Ua=rr();function jn(r){return Zt([tr(r),xe(r)])}const Vn=jn();function Wn(r){return Zt([rr(r),xe(r),xe({...r,extremity:"source"})])}const Ba=Wn(),Ha=`\nprecision mediump float;\n\nvarying vec4 v_color;\n\nvoid main(void) {\n  gl_FragColor = v_color;\n}\n`,$a=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_position;\n\nuniform mat3 u_matrix;\n\nvarying vec4 v_color;\n\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  // Scale from [[-1 1] [-1 1]] to the container:\n  gl_Position = vec4(\n    (u_matrix * vec3(a_position, 1)).xy,\n    0,\n    1\n  );\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,{UNSIGNED_BYTE:Yn,FLOAT:ja}=WebGLRenderingContext,Va=["u_matrix"];class Wa extends se{getDefinition(){return{VERTICES:2,VERTEX_SHADER_SOURCE:$a,FRAGMENT_SHADER_SOURCE:Ha,METHOD:WebGLRenderingContext.LINES,UNIFORMS:Va,ATTRIBUTES:[{name:"a_position",size:2,type:ja},{name:"a_color",size:4,type:Yn,normalized:!0},{name:"a_id",size:4,type:Yn,normalized:!0}]}}processVisibleItem(e,t,n,i,o){const a=this.array,s=n.x,l=n.y,c=i.x,u=i.y,d=V(o.color);a[t++]=s,a[t++]=l,a[t++]=d,a[t++]=e,a[t++]=c,a[t++]=u,a[t++]=d,a[t++]=e}setUniforms(e,{gl:t,uniformLocations:n}){const{u_matrix:i}=n;t.uniformMatrix3fv(i,!1,e.matrix)}}const Ya=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_normal;\nattribute float a_normalCoef;\nattribute vec2 a_positionStart;\nattribute vec2 a_positionEnd;\nattribute float a_positionCoef;\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_zoomRatio;\nuniform float u_pixelRatio;\nuniform float u_correctionRatio;\nuniform float u_minEdgeThickness;\nuniform float u_feather;\n\nvarying vec4 v_color;\nvarying vec2 v_normal;\nvarying float v_thickness;\nvarying float v_feather;\n\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  float minThickness = u_minEdgeThickness;\n\n  vec2 normal = a_normal * a_normalCoef;\n  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;\n\n  float normalLength = length(normal);\n  vec2 unitNormal = normal / normalLength;\n\n  // We require edges to be at least "minThickness" pixels thick *on screen*\n  // (so we need to compensate the size ratio):\n  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);\n\n  // Then, we need to retrieve the normalized thickness of the edge in the WebGL\n  // referential (in a ([0, 1], [0, 1]) space), using our "magic" correction\n  // ratio:\n  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;\n\n  // Here is the proper position of the vertex\n  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness, 1)).xy, 0, 1);\n\n  // For the fragment shader though, we need a thickness that takes the "magic"\n  // correction ratio into account (as in webGLThickness), but so that the\n  // antialiasing effect does not depend on the zoom level. So here\'s yet\n  // another thickness version:\n  v_thickness = webGLThickness / u_zoomRatio;\n\n  v_normal = unitNormal;\n\n  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,{UNSIGNED_BYTE:Xn,FLOAT:Le}=WebGLRenderingContext,Xa=["u_matrix","u_zoomRatio","u_sizeRatio","u_correctionRatio","u_pixelRatio","u_feather","u_minEdgeThickness"];class qn extends se{getDefinition(){return{VERTICES:6,VERTEX_SHADER_SOURCE:Ya,FRAGMENT_SHADER_SOURCE:er,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Xa,ATTRIBUTES:[{name:"a_positionStart",size:2,type:Le},{name:"a_positionEnd",size:2,type:Le},{name:"a_normal",size:2,type:Le},{name:"a_color",size:4,type:Xn,normalized:!0},{name:"a_id",size:4,type:Xn,normalized:!0}],CONSTANT_ATTRIBUTES:[{name:"a_positionCoef",size:1,type:Le},{name:"a_normalCoef",size:1,type:Le}],CONSTANT_DATA:[[0,1],[0,-1],[1,1],[1,1],[0,-1],[1,-1]]}}processVisibleItem(e,t,n,i,o){const a=o.size||1,s=n.x,l=n.y,c=i.x,u=i.y,d=V(o.color),h=c-s,m=u-l;let g=h*h+m*m,b=0,E=0;g&&(g=1/Math.sqrt(g),b=-m*g*a,E=h*g*a);const v=this.array;v[t++]=s,v[t++]=l,v[t++]=c,v[t++]=u,v[t++]=b,v[t++]=E,v[t++]=d,v[t++]=e}setUniforms(e,{gl:t,uniformLocations:n}){const{u_matrix:i,u_zoomRatio:o,u_feather:a,u_pixelRatio:s,u_correctionRatio:l,u_sizeRatio:c,u_minEdgeThickness:u}=n;t.uniformMatrix3fv(i,!1,e.matrix),t.uniform1f(o,e.zoomRatio),t.uniform1f(c,e.sizeRatio),t.uniform1f(l,e.correctionRatio),t.uniform1f(s,e.pixelRatio),t.uniform1f(a,e.antiAliasingFeather),t.uniform1f(u,e.minEdgeThickness)}}const qa=`\nprecision mediump float;\n\nvarying vec4 v_color;\n\nvoid main(void) {\n  gl_FragColor = v_color;\n}\n`,Ka=`\nattribute vec4 a_id;\nattribute vec4 a_color;\nattribute vec2 a_normal;\nattribute float a_normalCoef;\nattribute vec2 a_positionStart;\nattribute vec2 a_positionEnd;\nattribute float a_positionCoef;\n\nuniform mat3 u_matrix;\nuniform float u_sizeRatio;\nuniform float u_correctionRatio;\n\nvarying vec4 v_color;\n\nconst float minThickness = 1.7;\nconst float bias = 255.0 / 254.0;\n\nvoid main() {\n  vec2 normal = a_normal * a_normalCoef;\n  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;\n\n  // The only different here with edge.vert.glsl is that we need to handle null\n  // input normal vector. Apart from that, you can read edge.vert.glsl more info\n  // on how it works:\n  float normalLength = length(normal);\n  vec2 unitNormal = normal / normalLength;\n  if (normalLength <= 0.0) unitNormal = normal;\n  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);\n  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;\n\n  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness, 1)).xy, 0, 1);\n\n  #ifdef PICKING_MODE\n  // For picking mode, we use the ID as the color:\n  v_color = a_id;\n  #else\n  // For normal mode, we use the color:\n  v_color = a_color;\n  #endif\n\n  v_color.a *= bias;\n}\n`,{UNSIGNED_BYTE:Kn,FLOAT:Fe}=WebGLRenderingContext,Za=["u_matrix","u_sizeRatio","u_correctionRatio","u_minEdgeThickness"];class Qa extends se{getDefinition(){return{VERTICES:3,VERTEX_SHADER_SOURCE:Ka,FRAGMENT_SHADER_SOURCE:qa,METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:Za,ATTRIBUTES:[{name:"a_positionStart",size:2,type:Fe},{name:"a_positionEnd",size:2,type:Fe},{name:"a_normal",size:2,type:Fe},{name:"a_color",size:4,type:Kn,normalized:!0},{name:"a_id",size:4,type:Kn,normalized:!0}],CONSTANT_ATTRIBUTES:[{name:"a_positionCoef",size:1,type:Fe},{name:"a_normalCoef",size:1,type:Fe}],CONSTANT_DATA:[[0,1],[0,-1],[1,0]]}}processVisibleItem(e,t,n,i,o){const a=o.size||1,s=n.x,l=n.y,c=i.x,u=i.y,d=V(o.color),h=c-s,m=u-l;let g=h*h+m*m,b=0,E=0;g&&(g=1/Math.sqrt(g),b=-m*g*a,E=h*g*a);const v=this.array;v[t++]=s,v[t++]=l,v[t++]=c,v[t++]=u,v[t++]=b,v[t++]=E,v[t++]=d,v[t++]=e}setUniforms(e,{gl:t,uniformLocations:n}){const{u_matrix:i,u_sizeRatio:o,u_correctionRatio:a,u_minEdgeThickness:s}=n;t.uniformMatrix3fv(i,!1,e.matrix),t.uniform1f(o,e.sizeRatio),t.uniform1f(a,e.correctionRatio),t.uniform1f(s,e.minEdgeThickness)}}const Ja=Object.freeze(Object.defineProperty({__proto__:null,AbstractEdgeProgram:Ra,AbstractNodeProgram:Ea,AbstractProgram:Xt,DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS:Qe,DEFAULT_EDGE_CLAMPED_PROGRAM_OPTIONS:Bn,DEFAULT_EDGE_DOUBLE_CLAMPED_PROGRAM_OPTIONS:$n,EdgeArrowHeadProgram:Da,EdgeArrowProgram:Vn,EdgeClampedProgram:za,EdgeDoubleArrowProgram:Ba,EdgeDoubleClampedProgram:Ua,EdgeLineProgram:Wa,EdgeProgram:se,EdgeRectangleProgram:qn,EdgeTriangleProgram:Qa,NodeCircleProgram:Ke,NodePointProgram:Fa,NodeProgram:Kt,Program:qt,createEdgeArrowHeadProgram:xe,createEdgeArrowProgram:jn,createEdgeClampedProgram:tr,createEdgeCompoundProgram:Zt,createEdgeDoubleArrowProgram:Wn,createEdgeDoubleClampedProgram:rr,createNodeCompoundProgram:Ta,drawDiscNodeHover:kn,drawDiscNodeLabel:Qt,drawStraightEdgeLabel:Dn,getAttributeItemsCount:xn,getAttributesItemsCount:qe,killProgram:Yt,loadFragmentShader:Nn,loadProgram:Pn,loadVertexShader:Fn,numberToGLSLFloat:ba},Symbol.toStringTag,{value:"Module"}));class nr extends Wr.EventEmitter{constructor(){super(),this.rawEmitter=this}}const Je=1.5;class be extends nr{constructor(){super(),this.x=.5,this.y=.5,this.angle=0,this.ratio=1,this.minRatio=null,this.maxRatio=null,this.enabledZooming=!0,this.enabledPanning=!0,this.enabledRotation=!0,this.clean=null,this.nextFrame=null,this.previousState=null,this.enabled=!0,this.previousState=this.getState()}static from(e){return new be().setState(e)}enable(){return this.enabled=!0,this}disable(){return this.enabled=!1,this}getState(){return{x:this.x,y:this.y,angle:this.angle,ratio:this.ratio}}hasState(e){return this.x===e.x&&this.y===e.y&&this.ratio===e.ratio&&this.angle===e.angle}getPreviousState(){const e=this.previousState;return e?{x:e.x,y:e.y,angle:e.angle,ratio:e.ratio}:null}getBoundedRatio(e){let t=e;return typeof this.minRatio=="number"&&(t=Math.max(t,this.minRatio)),typeof this.maxRatio=="number"&&(t=Math.min(t,this.maxRatio)),t}validateState(e){const t={};return this.enabledPanning&&typeof e.x=="number"&&(t.x=e.x),this.enabledPanning&&typeof e.y=="number"&&(t.y=e.y),this.enabledZooming&&typeof e.ratio=="number"&&(t.ratio=this.getBoundedRatio(e.ratio)),this.enabledRotation&&typeof e.angle=="number"&&(t.angle=e.angle),this.clean?this.clean({...this.getState(),...t}):t}isAnimated(){return!!this.nextFrame}setState(e){if(!this.enabled)return this;this.previousState=this.getState();const t=this.validateState(e);return typeof t.x=="number"&&(this.x=t.x),typeof t.y=="number"&&(this.y=t.y),typeof t.ratio=="number"&&(this.ratio=t.ratio),typeof t.angle=="number"&&(this.angle=t.angle),this.hasState(this.previousState)||this.emit("updated",this.getState()),this}updateState(e){return this.setState(e(this.getState())),this}animate(e,t={},n){if(!n)return new Promise(u=>this.animate(e,t,u));if(!this.enabled)return;const i={...kt,...t},o=this.validateState(e),a=typeof i.easing=="function"?i.easing:Dt[i.easing],s=Date.now(),l=this.getState(),c=()=>{const u=(Date.now()-s)/i.duration;if(u>=1){this.nextFrame=null,this.setState(o),this.animationCallback&&(this.animationCallback.call(null),this.animationCallback=void 0);return}const d=a(u),h={};typeof o.x=="number"&&(h.x=l.x+(o.x-l.x)*d),typeof o.y=="number"&&(h.y=l.y+(o.y-l.y)*d),this.enabledRotation&&typeof o.angle=="number"&&(h.angle=l.angle+(o.angle-l.angle)*d),typeof o.ratio=="number"&&(h.ratio=l.ratio+(o.ratio-l.ratio)*d),this.setState(h),this.nextFrame=requestAnimationFrame(c)};this.nextFrame?(cancelAnimationFrame(this.nextFrame),this.animationCallback&&this.animationCallback.call(null),this.nextFrame=requestAnimationFrame(c)):c(),this.animationCallback=n}animatedZoom(e){return e?typeof e=="number"?this.animate({ratio:this.ratio/e}):this.animate({ratio:this.ratio/(e.factor||Je)},e):this.animate({ratio:this.ratio/Je})}animatedUnzoom(e){return e?typeof e=="number"?this.animate({ratio:this.ratio*e}):this.animate({ratio:this.ratio*(e.factor||Je)},e):this.animate({ratio:this.ratio*Je})}animatedReset(e){return this.animate({x:.5,y:.5,ratio:1,angle:0},e)}copy(){return be.from(this.getState())}}const ir={hideEdgesOnMove:!1,hideLabelsOnMove:!1,renderLabels:!0,renderEdgeLabels:!1,enableEdgeEvents:!1,defaultNodeColor:"#999",defaultNodeType:"circle",defaultEdgeColor:"#ccc",defaultEdgeType:"line",labelFont:"Arial",labelSize:14,labelWeight:"normal",labelColor:{color:"#000"},edgeLabelFont:"Arial",edgeLabelSize:14,edgeLabelWeight:"normal",edgeLabelColor:{attribute:"color"},stagePadding:30,defaultDrawEdgeLabel:Dn,defaultDrawNodeLabel:Qt,defaultDrawNodeHover:kn,minEdgeThickness:1.7,antiAliasingFeather:1,dragTimeout:100,draggedEventsTolerance:3,inertiaDuration:200,inertiaRatio:3,zoomDuration:250,zoomingRatio:1.7,doubleClickTimeout:300,doubleClickZoomingRatio:2.2,doubleClickZoomingDuration:200,tapMoveTolerance:10,zoomToSizeRatioFunction:Math.sqrt,itemSizesReference:"screen",autoRescale:!0,autoCenter:!0,labelDensity:1,labelGridCellSize:100,labelRenderedSizeThreshold:6,nodeReducer:null,edgeReducer:null,zIndex:!1,minCameraRatio:null,maxCameraRatio:null,enableCameraZooming:!0,enableCameraPanning:!0,enableCameraRotation:!0,cameraPanBoundaries:null,allowInvalidContainer:!1,nodeProgramClasses:{},nodeHoverProgramClasses:{},edgeProgramClasses:{}},es={circle:Ke},ts={arrow:Vn,line:qn};function or(r){if(typeof r.labelDensity!="number"||r.labelDensity<0)throw new Error("Settings: invalid `labelDensity`. Expecting a positive number.");const{minCameraRatio:e,maxCameraRatio:t}=r;if(typeof e=="number"&&typeof t=="number"&&t<e)throw new Error("Settings: invalid camera ratio boundaries. Expecting `maxCameraRatio` to be greater than `minCameraRatio`.")}function rs(r){const e=Xe({},ir,r);return e.nodeProgramClasses=Xe({},es,e.nodeProgramClasses),e.edgeProgramClasses=Xe({},ts,e.edgeProgramClasses),e}function W(r,e){const t=e.getBoundingClientRect();return{x:r.clientX-t.left,y:r.clientY-t.top}}function Z(r,e){const t={...W(r,e),sigmaDefaultPrevented:!1,preventSigmaDefault(){t.sigmaDefaultPrevented=!0},original:r};return t}function Ne(r){const e="x"in r?r:{...r.touches[0]||r.previousTouches[0],original:r.original,sigmaDefaultPrevented:r.sigmaDefaultPrevented,preventSigmaDefault:()=>{r.sigmaDefaultPrevented=!0,e.sigmaDefaultPrevented=!0}};return e}function ns(r,e){return{...Z(r,e),delta:Zn(r)}}const is=2;function et(r){const e=[];for(let t=0,n=Math.min(r.length,is);t<n;t++)e.push(r[t]);return e}function Pe(r,e,t){const n={touches:et(r.touches).map(i=>W(i,t)),previousTouches:e.map(i=>W(i,t)),sigmaDefaultPrevented:!1,preventSigmaDefault(){n.sigmaDefaultPrevented=!0},original:r};return n}function Zn(r){if(typeof r.deltaY<"u")return r.deltaY*-3/360;if(typeof r.detail<"u")return r.detail/-9;throw new Error("Captor: could not extract delta from event.")}class Qn extends nr{constructor(e,t){super(),this.container=e,this.renderer=t}}const os=["doubleClickTimeout","doubleClickZoomingDuration","doubleClickZoomingRatio","dragTimeout","draggedEventsTolerance","inertiaDuration","inertiaRatio","zoomDuration","zoomingRatio"].reduce((r,e)=>({...r,[e]:ir[e]}),{});class Jn extends Qn{constructor(e,t){super(e,t),this.enabled=!0,this.draggedEvents=0,this.downStartTime=null,this.lastMouseX=null,this.lastMouseY=null,this.isMouseDown=!1,this.isMoving=!1,this.movingTimeout=null,this.startCameraState=null,this.clicks=0,this.doubleClickTimeout=null,this.currentWheelDirection=0,this.settings=os,this.handleClick=this.handleClick.bind(this),this.handleRightClick=this.handleRightClick.bind(this),this.handleDown=this.handleDown.bind(this),this.handleUp=this.handleUp.bind(this),this.handleMove=this.handleMove.bind(this),this.handleWheel=this.handleWheel.bind(this),this.handleLeave=this.handleLeave.bind(this),this.handleEnter=this.handleEnter.bind(this),e.addEventListener("click",this.handleClick,{capture:!1}),e.addEventListener("contextmenu",this.handleRightClick,{capture:!1}),e.addEventListener("mousedown",this.handleDown,{capture:!1}),e.addEventListener("wheel",this.handleWheel,{capture:!1}),e.addEventListener("mouseleave",this.handleLeave,{capture:!1}),e.addEventListener("mouseenter",this.handleEnter,{capture:!1}),document.addEventListener("mousemove",this.handleMove,{capture:!1}),document.addEventListener("mouseup",this.handleUp,{capture:!1})}kill(){const e=this.container;e.removeEventListener("click",this.handleClick),e.removeEventListener("contextmenu",this.handleRightClick),e.removeEventListener("mousedown",this.handleDown),e.removeEventListener("wheel",this.handleWheel),e.removeEventListener("mouseleave",this.handleLeave),e.removeEventListener("mouseenter",this.handleEnter),document.removeEventListener("mousemove",this.handleMove),document.removeEventListener("mouseup",this.handleUp)}handleClick(e){if(this.enabled){if(this.clicks++,this.clicks===2)return this.clicks=0,typeof this.doubleClickTimeout=="number"&&(clearTimeout(this.doubleClickTimeout),this.doubleClickTimeout=null),this.handleDoubleClick(e);setTimeout(()=>{this.clicks=0,this.doubleClickTimeout=null},this.settings.doubleClickTimeout),this.draggedEvents<this.settings.draggedEventsTolerance&&this.emit("click",Z(e,this.container))}}handleRightClick(e){this.enabled&&this.emit("rightClick",Z(e,this.container))}handleDoubleClick(e){if(!this.enabled)return;e.preventDefault(),e.stopPropagation();const t=Z(e,this.container);if(this.emit("doubleClick",t),t.sigmaDefaultPrevented)return;const n=this.renderer.getCamera(),i=n.getBoundedRatio(n.getState().ratio/this.settings.doubleClickZoomingRatio);n.animate(this.renderer.getViewportZoomedState(W(e,this.container),i),{easing:"quadraticInOut",duration:this.settings.doubleClickZoomingDuration})}handleDown(e){if(this.enabled){if(e.button===0){this.startCameraState=this.renderer.getCamera().getState();const{x:t,y:n}=W(e,this.container);this.lastMouseX=t,this.lastMouseY=n,this.draggedEvents=0,this.downStartTime=Date.now(),this.isMouseDown=!0}this.emit("mousedown",Z(e,this.container))}}handleUp(e){if(!this.enabled||!this.isMouseDown)return;const t=this.renderer.getCamera();this.isMouseDown=!1,typeof this.movingTimeout=="number"&&(clearTimeout(this.movingTimeout),this.movingTimeout=null);const{x:n,y:i}=W(e,this.container),o=t.getState(),a=t.getPreviousState()||{x:0,y:0};this.isMoving?t.animate({x:o.x+this.settings.inertiaRatio*(o.x-a.x),y:o.y+this.settings.inertiaRatio*(o.y-a.y)},{duration:this.settings.inertiaDuration,easing:"quadraticOut"}):(this.lastMouseX!==n||this.lastMouseY!==i)&&t.setState({x:o.x,y:o.y}),this.isMoving=!1,setTimeout(()=>{const s=this.draggedEvents>0;this.draggedEvents=0,s&&this.renderer.getSetting("hideEdgesOnMove")&&this.renderer.refresh()},0),this.emit("mouseup",Z(e,this.container))}handleMove(e){if(!this.enabled)return;const t=Z(e,this.container);if(this.emit("mousemovebody",t),(e.target===this.container||e.composedPath()[0]===this.container)&&this.emit("mousemove",t),!t.sigmaDefaultPrevented&&this.isMouseDown){this.isMoving=!0,this.draggedEvents++,typeof this.movingTimeout=="number"&&clearTimeout(this.movingTimeout),this.movingTimeout=window.setTimeout(()=>{this.movingTimeout=null,this.isMoving=!1},this.settings.dragTimeout);const n=this.renderer.getCamera(),{x:i,y:o}=W(e,this.container),a=this.renderer.viewportToFramedGraph({x:this.lastMouseX,y:this.lastMouseY}),s=this.renderer.viewportToFramedGraph({x:i,y:o}),l=a.x-s.x,c=a.y-s.y,u=n.getState(),d=u.x+l,h=u.y+c;n.setState({x:d,y:h}),this.lastMouseX=i,this.lastMouseY=o,e.preventDefault(),e.stopPropagation()}}handleLeave(e){this.emit("mouseleave",Z(e,this.container))}handleEnter(e){this.emit("mouseenter",Z(e,this.container))}handleWheel(e){const t=this.renderer.getCamera();if(!this.enabled||!t.enabledZooming)return;const n=Zn(e);if(!n)return;const i=ns(e,this.container);if(this.emit("wheel",i),i.sigmaDefaultPrevented){e.preventDefault(),e.stopPropagation();return}const o=t.getState().ratio,a=n>0?1/this.settings.zoomingRatio:this.settings.zoomingRatio,s=t.getBoundedRatio(o*a),l=n>0?1:-1,c=Date.now();o!==s&&(e.preventDefault(),e.stopPropagation(),!(this.currentWheelDirection===l&&this.lastWheelTriggerTime&&c-this.lastWheelTriggerTime<this.settings.zoomDuration/5)&&(t.animate(this.renderer.getViewportZoomedState(W(e,this.container),s),{easing:"quadraticOut",duration:this.settings.zoomDuration},()=>{this.currentWheelDirection=0}),this.currentWheelDirection=l,this.lastWheelTriggerTime=c))}setSettings(e){this.settings=e}}const as=["dragTimeout","inertiaDuration","inertiaRatio","doubleClickTimeout","doubleClickZoomingRatio","doubleClickZoomingDuration","tapMoveTolerance"].reduce((r,e)=>({...r,[e]:ir[e]}),{});class ss extends Qn{constructor(e,t){super(e,t),this.enabled=!0,this.isMoving=!1,this.hasMoved=!1,this.touchMode=0,this.startTouchesPositions=[],this.lastTouches=[],this.lastTap=null,this.settings=as,this.handleStart=this.handleStart.bind(this),this.handleLeave=this.handleLeave.bind(this),this.handleMove=this.handleMove.bind(this),e.addEventListener("touchstart",this.handleStart,{capture:!1}),e.addEventListener("touchcancel",this.handleLeave,{capture:!1}),document.addEventListener("touchend",this.handleLeave,{capture:!1,passive:!1}),document.addEventListener("touchmove",this.handleMove,{capture:!1,passive:!1})}kill(){const e=this.container;e.removeEventListener("touchstart",this.handleStart),e.removeEventListener("touchcancel",this.handleLeave),document.removeEventListener("touchend",this.handleLeave),document.removeEventListener("touchmove",this.handleMove)}getDimensions(){return{width:this.container.offsetWidth,height:this.container.offsetHeight}}handleStart(e){if(!this.enabled)return;e.preventDefault();const t=et(e.touches);if(this.touchMode=t.length,this.startCameraState=this.renderer.getCamera().getState(),this.startTouchesPositions=t.map(n=>W(n,this.container)),this.touchMode===2){const[{x:n,y:i},{x:o,y:a}]=this.startTouchesPositions;this.startTouchesAngle=Math.atan2(a-i,o-n),this.startTouchesDistance=Math.sqrt(Math.pow(o-n,2)+Math.pow(a-i,2))}this.emit("touchdown",Pe(e,this.lastTouches,this.container)),this.lastTouches=t,this.lastTouchesPositions=this.startTouchesPositions}handleLeave(e){if(!(!this.enabled||!this.startTouchesPositions.length)){switch(e.cancelable&&e.preventDefault(),this.movingTimeout&&(this.isMoving=!1,clearTimeout(this.movingTimeout)),this.touchMode){case 2:if(e.touches.length===1){this.handleStart(e),e.preventDefault();break}case 1:if(this.isMoving){const t=this.renderer.getCamera(),n=t.getState(),i=t.getPreviousState()||{x:0,y:0};t.animate({x:n.x+this.settings.inertiaRatio*(n.x-i.x),y:n.y+this.settings.inertiaRatio*(n.y-i.y)},{duration:this.settings.inertiaDuration,easing:"quadraticOut"})}this.hasMoved=!1,this.isMoving=!1,this.touchMode=0;break}if(this.emit("touchup",Pe(e,this.lastTouches,this.container)),!e.touches.length){const t=W(this.lastTouches[0],this.container),n=this.startTouchesPositions[0],i=(t.x-n.x)**2+(t.y-n.y)**2;if(!e.touches.length&&i<this.settings.tapMoveTolerance**2)if(this.lastTap&&Date.now()-this.lastTap.time<this.settings.doubleClickTimeout){const o=Pe(e,this.lastTouches,this.container);if(this.emit("doubletap",o),this.lastTap=null,!o.sigmaDefaultPrevented){const a=this.renderer.getCamera(),s=a.getBoundedRatio(a.getState().ratio/this.settings.doubleClickZoomingRatio);a.animate(this.renderer.getViewportZoomedState(t,s),{easing:"quadraticInOut",duration:this.settings.doubleClickZoomingDuration})}}else{const o=Pe(e,this.lastTouches,this.container);this.emit("tap",o),this.lastTap={time:Date.now(),position:o.touches[0]||o.previousTouches[0]}}}this.lastTouches=et(e.touches),this.startTouchesPositions=[]}}handleMove(e){if(!this.enabled||!this.startTouchesPositions.length)return;e.preventDefault();const t=et(e.touches),n=t.map(c=>W(c,this.container)),i=this.lastTouches;this.lastTouches=t,this.lastTouchesPositions=n;const o=Pe(e,i,this.container);if(this.emit("touchmove",o),o.sigmaDefaultPrevented||(this.hasMoved||(this.hasMoved=n.some((c,u)=>{const d=this.startTouchesPositions[u];return d&&(c.x!==d.x||c.y!==d.y)})),!this.hasMoved))return;this.isMoving=!0,this.movingTimeout&&clearTimeout(this.movingTimeout),this.movingTimeout=window.setTimeout(()=>{this.isMoving=!1},this.settings.dragTimeout);const a=this.renderer.getCamera(),s=this.startCameraState,l=this.renderer.getSetting("stagePadding");switch(this.touchMode){case 1:{const{x:c,y:u}=this.renderer.viewportToFramedGraph((this.startTouchesPositions||[])[0]),{x:d,y:h}=this.renderer.viewportToFramedGraph(n[0]);a.setState({x:s.x+c-d,y:s.y+u-h});break}case 2:{const c={x:.5,y:.5,angle:0,ratio:1},{x:u,y:d}=n[0],{x:h,y:m}=n[1],g=Math.atan2(m-d,h-u)-this.startTouchesAngle,b=Math.hypot(m-d,h-u)/this.startTouchesDistance,E=a.getBoundedRatio(s.ratio/b);c.ratio=E,c.angle=s.angle+g;const v=this.getDimensions(),T=this.renderer.viewportToFramedGraph((this.startTouchesPositions||[])[0],{cameraState:s}),_=Math.min(v.width,v.height)-2*l,f=_/v.width,p=_/v.height,y=E/_;let R=u-_/2/f,S=d-_/2/p;[R,S]=[R*Math.cos(-c.angle)-S*Math.sin(-c.angle),S*Math.cos(-c.angle)+R*Math.sin(-c.angle)],c.x=T.x-R*y,c.y=T.y+S*y,a.setState(c);break}}}setSettings(e){this.settings=e}}class ei{constructor(e,t){this.key=e,this.size=t}static compare(e,t){return e.size>t.size?-1:e.size<t.size||e.key>t.key?1:-1}}class ti{constructor(){this.width=0,this.height=0,this.cellSize=0,this.columns=0,this.rows=0,this.cells={}}resizeAndClear(e,t){this.width=e.width,this.height=e.height,this.cellSize=t,this.columns=Math.ceil(e.width/t),this.rows=Math.ceil(e.height/t),this.cells={}}getIndex(e){const t=Math.floor(e.x/this.cellSize);return Math.floor(e.y/this.cellSize)*this.columns+t}add(e,t,n){const i=new ei(e,t),o=this.getIndex(n);let a=this.cells[o];a||(a=[],this.cells[o]=a),a.push(i)}organize(){for(const e in this.cells)this.cells[e].sort(ei.compare)}getLabelsToDisplay(e,t){const n=this.cellSize*this.cellSize,o=n/e/e*t/n,a=Math.ceil(o),s=[];for(const l in this.cells){const c=this.cells[l];for(let u=0;u<Math.min(a,c.length);u++)s.push(c[u].key)}return s}}function cs(r){const{graph:e,hoveredNode:t,highlightedNodes:n,displayedNodeLabels:i}=r,o=[];return e.forEachEdge((a,s,l,c)=>{(l===t||c===t||n.has(l)||n.has(c)||i.has(l)&&i.has(c))&&o.push(a)}),o}const ls=150,us=50,Q=Object.prototype.hasOwnProperty;function hs(r,e,t){if(!Q.call(t,"x")||!Q.call(t,"y"))throw new Error(`Sigma: could not find a valid position (x, y) for node "${e}". All your nodes must have a number "x" and "y". Maybe your forgot to apply a layout or your "nodeReducer" is not returning the correct data?`);return t.color||(t.color=r.defaultNodeColor),!t.label&&t.label!==""&&(t.label=null),t.label!==void 0&&t.label!==null?t.label=""+t.label:t.label=null,t.size||(t.size=2),Q.call(t,"hidden")||(t.hidden=!1),Q.call(t,"highlighted")||(t.highlighted=!1),Q.call(t,"forceLabel")||(t.forceLabel=!1),(!t.type||t.type==="")&&(t.type=r.defaultNodeType),t.zIndex||(t.zIndex=0),t}function ds(r,e,t){return t.color||(t.color=r.defaultEdgeColor),t.label||(t.label=""),t.size||(t.size=.5),Q.call(t,"hidden")||(t.hidden=!1),Q.call(t,"forceLabel")||(t.forceLabel=!1),(!t.type||t.type==="")&&(t.type=r.defaultEdgeType),t.zIndex||(t.zIndex=0),t}let ri=class extends nr{constructor(e,t,n={}){if(super(),this.elements={},this.canvasContexts={},this.webGLContexts={},this.pickingLayers=new Set,this.textures={},this.frameBuffers={},this.activeListeners={},this.labelGrid=new ti,this.nodeDataCache={},this.edgeDataCache={},this.nodeProgramIndex={},this.edgeProgramIndex={},this.nodesWithForcedLabels=new Set,this.edgesWithForcedLabels=new Set,this.nodeExtent={x:[0,1],y:[0,1]},this.nodeZExtent=[1/0,-1/0],this.edgeZExtent=[1/0,-1/0],this.matrix=j(),this.invMatrix=j(),this.correctionRatio=1,this.customBBox=null,this.normalizationFunction=Wt({x:[0,1],y:[0,1]}),this.graphToViewportRatio=1,this.itemIDsIndex={},this.nodeIndices={},this.edgeIndices={},this.width=0,this.height=0,this.pixelRatio=jt(),this.pickingDownSizingRatio=2*this.pixelRatio,this.displayedNodeLabels=new Set,this.displayedEdgeLabels=new Set,this.highlightedNodes=new Set,this.hoveredNode=null,this.hoveredEdge=null,this.renderFrame=null,this.renderHighlightedNodesFrame=null,this.needToProcess=!1,this.checkEdgesEventsFrame=null,this.nodePrograms={},this.nodeHoverPrograms={},this.edgePrograms={},this.settings=rs(n),or(this.settings),An(e),!(t instanceof HTMLElement))throw new Error("Sigma: container should be an html element.");this.graph=e,this.container=t,this.createWebGLContext("edges",{picking:n.enableEdgeEvents}),this.createCanvasContext("edgeLabels"),this.createWebGLContext("nodes",{picking:!0}),this.createCanvasContext("labels"),this.createCanvasContext("hovers"),this.createWebGLContext("hoverNodes"),this.createCanvasContext("mouse",{style:{touchAction:"none",userSelect:"none"}}),this.resize();for(const i in this.settings.nodeProgramClasses)this.registerNodeProgram(i,this.settings.nodeProgramClasses[i],this.settings.nodeHoverProgramClasses[i]);for(const i in this.settings.edgeProgramClasses)this.registerEdgeProgram(i,this.settings.edgeProgramClasses[i]);this.camera=new be,this.bindCameraHandlers(),this.mouseCaptor=new Jn(this.elements.mouse,this),this.mouseCaptor.setSettings(this.settings),this.touchCaptor=new ss(this.elements.mouse,this),this.touchCaptor.setSettings(this.settings),this.bindEventHandlers(),this.bindGraphHandlers(),this.handleSettingsUpdate(),this.refresh()}registerNodeProgram(e,t,n){return this.nodePrograms[e]&&this.nodePrograms[e].kill(),this.nodeHoverPrograms[e]&&this.nodeHoverPrograms[e].kill(),this.nodePrograms[e]=new t(this.webGLContexts.nodes,this.frameBuffers.nodes,this),this.nodeHoverPrograms[e]=new(n||t)(this.webGLContexts.hoverNodes,null,this),this}registerEdgeProgram(e,t){return this.edgePrograms[e]&&this.edgePrograms[e].kill(),this.edgePrograms[e]=new t(this.webGLContexts.edges,this.frameBuffers.edges,this),this}unregisterNodeProgram(e){if(this.nodePrograms[e]){const{[e]:t,...n}=this.nodePrograms;t.kill(),this.nodePrograms=n}if(this.nodeHoverPrograms[e]){const{[e]:t,...n}=this.nodeHoverPrograms;t.kill(),this.nodePrograms=n}return this}unregisterEdgeProgram(e){if(this.edgePrograms[e]){const{[e]:t,...n}=this.edgePrograms;t.kill(),this.edgePrograms=n}return this}resetWebGLTexture(e){const t=this.webGLContexts[e],n=this.frameBuffers[e],i=this.textures[e];i&&t.deleteTexture(i);const o=t.createTexture();return t.bindFramebuffer(t.FRAMEBUFFER,n),t.bindTexture(t.TEXTURE_2D,o),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,this.width,this.height,0,t.RGBA,t.UNSIGNED_BYTE,null),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,o,0),this.textures[e]=o,this}bindCameraHandlers(){return this.activeListeners.camera=()=>{this.scheduleRender()},this.camera.on("updated",this.activeListeners.camera),this}unbindCameraHandlers(){return this.camera.removeListener("updated",this.activeListeners.camera),this}getNodeAtPosition(e){const{x:t,y:n}=e,i=Ut(this.webGLContexts.nodes,this.frameBuffers.nodes,t,n,this.pixelRatio,this.pickingDownSizingRatio),o=Mt(...i),a=this.itemIDsIndex[o];return a&&a.type==="node"?a.id:null}bindEventHandlers(){this.activeListeners.handleResize=()=>{this.scheduleRefresh()},window.addEventListener("resize",this.activeListeners.handleResize),this.activeListeners.handleMove=t=>{const n=Ne(t),i={event:n,preventSigmaDefault(){n.preventSigmaDefault()}},o=this.getNodeAtPosition(n);if(o&&this.hoveredNode!==o&&!this.nodeDataCache[o].hidden){this.hoveredNode&&this.emit("leaveNode",{...i,node:this.hoveredNode}),this.hoveredNode=o,this.emit("enterNode",{...i,node:o}),this.scheduleHighlightedNodesRender();return}if(this.hoveredNode&&this.getNodeAtPosition(n)!==this.hoveredNode){const a=this.hoveredNode;this.hoveredNode=null,this.emit("leaveNode",{...i,node:a}),this.scheduleHighlightedNodesRender();return}if(this.settings.enableEdgeEvents){const a=this.hoveredNode?null:this.getEdgeAtPoint(i.event.x,i.event.y);a!==this.hoveredEdge&&(this.hoveredEdge&&this.emit("leaveEdge",{...i,edge:this.hoveredEdge}),a&&this.emit("enterEdge",{...i,edge:a}),this.hoveredEdge=a)}},this.activeListeners.handleMoveBody=t=>{const n=Ne(t);this.emit("moveBody",{event:n,preventSigmaDefault(){n.preventSigmaDefault()}})},this.activeListeners.handleLeave=t=>{const n=Ne(t),i={event:n,preventSigmaDefault(){n.preventSigmaDefault()}};this.hoveredNode&&(this.emit("leaveNode",{...i,node:this.hoveredNode}),this.scheduleHighlightedNodesRender()),this.settings.enableEdgeEvents&&this.hoveredEdge&&(this.emit("leaveEdge",{...i,edge:this.hoveredEdge}),this.scheduleHighlightedNodesRender()),this.emit("leaveStage",{...i})},this.activeListeners.handleEnter=t=>{const n=Ne(t),i={event:n,preventSigmaDefault(){n.preventSigmaDefault()}};this.emit("enterStage",{...i})};const e=t=>n=>{const i=Ne(n),o={event:i,preventSigmaDefault:()=>{i.preventSigmaDefault()}},a=this.getNodeAtPosition(i);if(a)return this.emit(`${t}Node`,{...o,node:a});if(this.settings.enableEdgeEvents){const s=this.getEdgeAtPoint(i.x,i.y);if(s)return this.emit(`${t}Edge`,{...o,edge:s})}return this.emit(`${t}Stage`,o)};return this.activeListeners.handleClick=e("click"),this.activeListeners.handleRightClick=e("rightClick"),this.activeListeners.handleDoubleClick=e("doubleClick"),this.activeListeners.handleWheel=e("wheel"),this.activeListeners.handleDown=e("down"),this.activeListeners.handleUp=e("up"),this.mouseCaptor.on("mousemove",this.activeListeners.handleMove),this.mouseCaptor.on("mousemovebody",this.activeListeners.handleMoveBody),this.mouseCaptor.on("click",this.activeListeners.handleClick),this.mouseCaptor.on("rightClick",this.activeListeners.handleRightClick),this.mouseCaptor.on("doubleClick",this.activeListeners.handleDoubleClick),this.mouseCaptor.on("wheel",this.activeListeners.handleWheel),this.mouseCaptor.on("mousedown",this.activeListeners.handleDown),this.mouseCaptor.on("mouseup",this.activeListeners.handleUp),this.mouseCaptor.on("mouseleave",this.activeListeners.handleLeave),this.mouseCaptor.on("mouseenter",this.activeListeners.handleEnter),this.touchCaptor.on("touchdown",this.activeListeners.handleDown),this.touchCaptor.on("touchdown",this.activeListeners.handleMove),this.touchCaptor.on("touchup",this.activeListeners.handleUp),this.touchCaptor.on("touchmove",this.activeListeners.handleMove),this.touchCaptor.on("tap",this.activeListeners.handleClick),this.touchCaptor.on("doubletap",this.activeListeners.handleDoubleClick),this.touchCaptor.on("touchmove",this.activeListeners.handleMoveBody),this}bindGraphHandlers(){const e=this.graph,t=new Set(["x","y","zIndex","type"]);return this.activeListeners.eachNodeAttributesUpdatedGraphUpdate=n=>{var a;const i=(a=n.hints)==null?void 0:a.attributes;this.graph.forEachNode(s=>this.updateNode(s));const o=!i||i.some(s=>t.has(s));this.refresh({partialGraph:{nodes:e.nodes()},skipIndexation:!o,schedule:!0})},this.activeListeners.eachEdgeAttributesUpdatedGraphUpdate=n=>{var a;const i=(a=n.hints)==null?void 0:a.attributes;this.graph.forEachEdge(s=>this.updateEdge(s));const o=i&&["zIndex","type"].some(s=>i==null?void 0:i.includes(s));this.refresh({partialGraph:{edges:e.edges()},skipIndexation:!o,schedule:!0})},this.activeListeners.addNodeGraphUpdate=n=>{const i=n.key;this.addNode(i),this.refresh({partialGraph:{nodes:[i]},skipIndexation:!1,schedule:!0})},this.activeListeners.updateNodeGraphUpdate=n=>{const i=n.key;this.refresh({partialGraph:{nodes:[i]},skipIndexation:!1,schedule:!0})},this.activeListeners.dropNodeGraphUpdate=n=>{const i=n.key;this.removeNode(i),this.refresh({schedule:!0})},this.activeListeners.addEdgeGraphUpdate=n=>{const i=n.key;this.addEdge(i),this.refresh({partialGraph:{edges:[i]},schedule:!0})},this.activeListeners.updateEdgeGraphUpdate=n=>{const i=n.key;this.refresh({partialGraph:{edges:[i]},skipIndexation:!1,schedule:!0})},this.activeListeners.dropEdgeGraphUpdate=n=>{const i=n.key;this.removeEdge(i),this.refresh({schedule:!0})},this.activeListeners.clearEdgesGraphUpdate=()=>{this.clearEdgeState(),this.clearEdgeIndices(),this.refresh({schedule:!0})},this.activeListeners.clearGraphUpdate=()=>{this.clearEdgeState(),this.clearNodeState(),this.clearEdgeIndices(),this.clearNodeIndices(),this.refresh({schedule:!0})},e.on("nodeAdded",this.activeListeners.addNodeGraphUpdate),e.on("nodeDropped",this.activeListeners.dropNodeGraphUpdate),e.on("nodeAttributesUpdated",this.activeListeners.updateNodeGraphUpdate),e.on("eachNodeAttributesUpdated",this.activeListeners.eachNodeAttributesUpdatedGraphUpdate),e.on("edgeAdded",this.activeListeners.addEdgeGraphUpdate),e.on("edgeDropped",this.activeListeners.dropEdgeGraphUpdate),e.on("edgeAttributesUpdated",this.activeListeners.updateEdgeGraphUpdate),e.on("eachEdgeAttributesUpdated",this.activeListeners.eachEdgeAttributesUpdatedGraphUpdate),e.on("edgesCleared",this.activeListeners.clearEdgesGraphUpdate),e.on("cleared",this.activeListeners.clearGraphUpdate),this}unbindGraphHandlers(){const e=this.graph;e.removeListener("nodeAdded",this.activeListeners.addNodeGraphUpdate),e.removeListener("nodeDropped",this.activeListeners.dropNodeGraphUpdate),e.removeListener("nodeAttributesUpdated",this.activeListeners.updateNodeGraphUpdate),e.removeListener("eachNodeAttributesUpdated",this.activeListeners.eachNodeAttributesUpdatedGraphUpdate),e.removeListener("edgeAdded",this.activeListeners.addEdgeGraphUpdate),e.removeListener("edgeDropped",this.activeListeners.dropEdgeGraphUpdate),e.removeListener("edgeAttributesUpdated",this.activeListeners.updateEdgeGraphUpdate),e.removeListener("eachEdgeAttributesUpdated",this.activeListeners.eachEdgeAttributesUpdatedGraphUpdate),e.removeListener("edgesCleared",this.activeListeners.clearEdgesGraphUpdate),e.removeListener("cleared",this.activeListeners.clearGraphUpdate)}getEdgeAtPoint(e,t){const n=Ut(this.webGLContexts.edges,this.frameBuffers.edges,e,t,this.pixelRatio,this.pickingDownSizingRatio),i=Mt(...n),o=this.itemIDsIndex[i];return o&&o.type==="edge"?o.id:null}process(){this.emit("beforeProcess");const e=this.graph,t=this.settings,n=this.getDimensions();if(this.nodeExtent=wn(this.graph),!this.settings.autoRescale){const{width:g,height:b}=n,{x:E,y:v}=this.nodeExtent;this.nodeExtent={x:[(E[0]+E[1])/2-g/2,(E[0]+E[1])/2+g/2],y:[(v[0]+v[1])/2-b/2,(v[0]+v[1])/2+b/2]}}this.normalizationFunction=Wt(this.customBBox||this.nodeExtent);const i=new be,o=_e(i.getState(),n,this.getGraphDimensions(),this.getStagePadding());this.labelGrid.resizeAndClear(n,t.labelGridCellSize);const a={},s={},l={},c={};let u=1,d=e.nodes();for(let g=0,b=d.length;g<b;g++){const E=d[g],v=this.nodeDataCache[E],T=e.getNodeAttributes(E);v.x=T.x,v.y=T.y,this.normalizationFunction.applyTo(v),typeof v.label=="string"&&!v.hidden&&this.labelGrid.add(E,v.size,this.framedGraphToViewport(v,{matrix:o})),a[v.type]=(a[v.type]||0)+1}this.labelGrid.organize();for(const g in this.nodePrograms){if(!Q.call(this.nodePrograms,g))throw new Error(`Sigma: could not find a suitable program for node type "${g}"!`);this.nodePrograms[g].reallocate(a[g]||0),a[g]=0}this.settings.zIndex&&this.nodeZExtent[0]!==this.nodeZExtent[1]&&(d=Vt(this.nodeZExtent,g=>this.nodeDataCache[g].zIndex,d));for(let g=0,b=d.length;g<b;g++){const E=d[g];s[E]=u,c[s[E]]={type:"node",id:E},u++;const v=this.nodeDataCache[E];this.addNodeToProgram(E,s[E],a[v.type]++)}const h={};let m=e.edges();for(let g=0,b=m.length;g<b;g++){const E=m[g],v=this.edgeDataCache[E];h[v.type]=(h[v.type]||0)+1}this.settings.zIndex&&this.edgeZExtent[0]!==this.edgeZExtent[1]&&(m=Vt(this.edgeZExtent,g=>this.edgeDataCache[g].zIndex,m));for(const g in this.edgePrograms){if(!Q.call(this.edgePrograms,g))throw new Error(`Sigma: could not find a suitable program for edge type "${g}"!`);this.edgePrograms[g].reallocate(h[g]||0),h[g]=0}for(let g=0,b=m.length;g<b;g++){const E=m[g];l[E]=u,c[l[E]]={type:"edge",id:E},u++;const v=this.edgeDataCache[E];this.addEdgeToProgram(E,l[E],h[v.type]++)}return this.itemIDsIndex=c,this.nodeIndices=s,this.edgeIndices=l,this.emit("afterProcess"),this}handleSettingsUpdate(e){const t=this.settings;if(this.camera.minRatio=t.minCameraRatio,this.camera.maxRatio=t.maxCameraRatio,this.camera.enabledZooming=t.enableCameraZooming,this.camera.enabledPanning=t.enableCameraPanning,this.camera.enabledRotation=t.enableCameraRotation,t.cameraPanBoundaries?this.camera.clean=n=>this.cleanCameraState(n,t.cameraPanBoundaries&&typeof t.cameraPanBoundaries=="object"?t.cameraPanBoundaries:{}):this.camera.clean=null,this.camera.setState(this.camera.validateState(this.camera.getState())),e){if(e.edgeProgramClasses!==t.edgeProgramClasses){for(const n in t.edgeProgramClasses)t.edgeProgramClasses[n]!==e.edgeProgramClasses[n]&&this.registerEdgeProgram(n,t.edgeProgramClasses[n]);for(const n in e.edgeProgramClasses)t.edgeProgramClasses[n]||this.unregisterEdgeProgram(n)}if(e.nodeProgramClasses!==t.nodeProgramClasses||e.nodeHoverProgramClasses!==t.nodeHoverProgramClasses){for(const n in t.nodeProgramClasses)(t.nodeProgramClasses[n]!==e.nodeProgramClasses[n]||t.nodeHoverProgramClasses[n]!==e.nodeHoverProgramClasses[n])&&this.registerNodeProgram(n,t.nodeProgramClasses[n],t.nodeHoverProgramClasses[n]);for(const n in e.nodeProgramClasses)t.nodeProgramClasses[n]||this.unregisterNodeProgram(n)}}return this.mouseCaptor.setSettings(this.settings),this.touchCaptor.setSettings(this.settings),this}cleanCameraState(e,{tolerance:t=0,boundaries:n}={}){const i={...e},{x:[o,a],y:[s,l]}=n||this.nodeExtent,c=[this.graphToViewport({x:o,y:s},{cameraState:e}),this.graphToViewport({x:a,y:s},{cameraState:e}),this.graphToViewport({x:o,y:l},{cameraState:e}),this.graphToViewport({x:a,y:l},{cameraState:e})];let u=1/0,d=-1/0,h=1/0,m=-1/0;c.forEach(({x:f,y:p})=>{u=Math.min(u,f),d=Math.max(d,f),h=Math.min(h,p),m=Math.max(m,p)});const g=d-u,b=m-h,{width:E,height:v}=this.getDimensions();let T=0,_=0;if(g>=E?d<E-t?T=d-(E-t):u>t&&(T=u-t):d>E+t?T=d-(E+t):u<-t&&(T=u+t),b>=v?m<v-t?_=m-(v-t):h>t&&(_=h-t):m>v+t?_=m-(v+t):h<-t&&(_=h+t),T||_){const f=this.viewportToFramedGraph({x:0,y:0},{cameraState:e}),p=this.viewportToFramedGraph({x:T,y:_},{cameraState:e});T=p.x-f.x,_=p.y-f.y,i.x+=T,i.y+=_}return i}renderLabels(){if(!this.settings.renderLabels)return this;const e=this.camera.getState(),t=this.labelGrid.getLabelsToDisplay(e.ratio,this.settings.labelDensity);$t(t,this.nodesWithForcedLabels),this.displayedNodeLabels=new Set;const n=this.canvasContexts.labels;for(let i=0,o=t.length;i<o;i++){const a=t[i],s=this.nodeDataCache[a];if(this.displayedNodeLabels.has(a)||s.hidden)continue;const{x:l,y:c}=this.framedGraphToViewport(s),u=this.scaleSize(s.size);if(!s.forceLabel&&u<this.settings.labelRenderedSizeThreshold||l<-150||l>this.width+ls||c<-50||c>this.height+us)continue;this.displayedNodeLabels.add(a);const{defaultDrawNodeLabel:d}=this.settings,h=this.nodePrograms[s.type];((h==null?void 0:h.drawLabel)||d)(n,{key:a,...s,size:u,x:l,y:c},this.settings)}return this}renderEdgeLabels(){if(!this.settings.renderEdgeLabels)return this;const e=this.canvasContexts.edgeLabels;e.clearRect(0,0,this.width,this.height);const t=cs({graph:this.graph,hoveredNode:this.hoveredNode,displayedNodeLabels:this.displayedNodeLabels,highlightedNodes:this.highlightedNodes});$t(t,this.edgesWithForcedLabels);const n=new Set;for(let i=0,o=t.length;i<o;i++){const a=t[i],s=this.graph.extremities(a),l=this.nodeDataCache[s[0]],c=this.nodeDataCache[s[1]],u=this.edgeDataCache[a];if(n.has(a)||u.hidden||l.hidden||c.hidden)continue;const{defaultDrawEdgeLabel:d}=this.settings,h=this.edgePrograms[u.type];((h==null?void 0:h.drawLabel)||d)(e,{key:a,...u,size:this.scaleSize(u.size)},{key:s[0],...l,...this.framedGraphToViewport(l),size:this.scaleSize(l.size)},{key:s[1],...c,...this.framedGraphToViewport(c),size:this.scaleSize(c.size)},this.settings),n.add(a)}return this.displayedEdgeLabels=n,this}renderHighlightedNodes(){const e=this.canvasContexts.hovers;e.clearRect(0,0,this.width,this.height);const t=a=>{const s=this.nodeDataCache[a],{x:l,y:c}=this.framedGraphToViewport(s),u=this.scaleSize(s.size),{defaultDrawNodeHover:d}=this.settings,h=this.nodePrograms[s.type];((h==null?void 0:h.drawHover)||d)(e,{key:a,...s,size:u,x:l,y:c},this.settings)},n=[];this.hoveredNode&&!this.nodeDataCache[this.hoveredNode].hidden&&n.push(this.hoveredNode),this.highlightedNodes.forEach(a=>{a!==this.hoveredNode&&n.push(a)}),n.forEach(a=>t(a));const i={};n.forEach(a=>{const s=this.nodeDataCache[a].type;i[s]=(i[s]||0)+1});for(const a in this.nodeHoverPrograms)this.nodeHoverPrograms[a].reallocate(i[a]||0),i[a]=0;n.forEach(a=>{const s=this.nodeDataCache[a];this.nodeHoverPrograms[s.type].process(0,i[s.type]++,s)}),this.webGLContexts.hoverNodes.clear(this.webGLContexts.hoverNodes.COLOR_BUFFER_BIT);const o=this.getRenderParams();for(const a in this.nodeHoverPrograms)this.nodeHoverPrograms[a].render(o)}scheduleHighlightedNodesRender(){this.renderHighlightedNodesFrame||this.renderFrame||(this.renderHighlightedNodesFrame=requestAnimationFrame(()=>{this.renderHighlightedNodesFrame=null,this.renderHighlightedNodes(),this.renderEdgeLabels()}))}render(){this.emit("beforeRender");const e=()=>(this.emit("afterRender"),this);if(this.renderFrame&&(cancelAnimationFrame(this.renderFrame),this.renderFrame=null),this.resize(),this.needToProcess&&this.process(),this.needToProcess=!1,this.clear(),this.pickingLayers.forEach(c=>this.resetWebGLTexture(c)),!this.graph.order)return e();const t=this.mouseCaptor,n=this.camera.isAnimated()||t.isMoving||t.draggedEvents||t.currentWheelDirection,i=this.camera.getState(),o=this.getDimensions(),a=this.getGraphDimensions(),s=this.getStagePadding();this.matrix=_e(i,o,a,s),this.invMatrix=_e(i,o,a,s,!0),this.correctionRatio=Tn(this.matrix,i,o),this.graphToViewportRatio=this.getGraphToViewportRatio();const l=this.getRenderParams();for(const c in this.nodePrograms)this.nodePrograms[c].render(l);if(!this.settings.hideEdgesOnMove||!n)for(const c in this.edgePrograms)this.edgePrograms[c].render(l);return this.settings.hideLabelsOnMove&&n||(this.renderLabels(),this.renderEdgeLabels(),this.renderHighlightedNodes()),e()}addNode(e){let t=Object.assign({},this.graph.getNodeAttributes(e));this.settings.nodeReducer&&(t=this.settings.nodeReducer(e,t));const n=hs(this.settings,e,t);this.nodeDataCache[e]=n,this.nodesWithForcedLabels.delete(e),n.forceLabel&&!n.hidden&&this.nodesWithForcedLabels.add(e),this.highlightedNodes.delete(e),n.highlighted&&!n.hidden&&this.highlightedNodes.add(e),this.settings.zIndex&&(n.zIndex<this.nodeZExtent[0]&&(this.nodeZExtent[0]=n.zIndex),n.zIndex>this.nodeZExtent[1]&&(this.nodeZExtent[1]=n.zIndex))}updateNode(e){this.addNode(e);const t=this.nodeDataCache[e];this.normalizationFunction.applyTo(t)}removeNode(e){delete this.nodeDataCache[e],delete this.nodeProgramIndex[e],this.highlightedNodes.delete(e),this.hoveredNode===e&&(this.hoveredNode=null),this.nodesWithForcedLabels.delete(e)}addEdge(e){let t=Object.assign({},this.graph.getEdgeAttributes(e));this.settings.edgeReducer&&(t=this.settings.edgeReducer(e,t));const n=ds(this.settings,e,t);this.edgeDataCache[e]=n,this.edgesWithForcedLabels.delete(e),n.forceLabel&&!n.hidden&&this.edgesWithForcedLabels.add(e),this.settings.zIndex&&(n.zIndex<this.edgeZExtent[0]&&(this.edgeZExtent[0]=n.zIndex),n.zIndex>this.edgeZExtent[1]&&(this.edgeZExtent[1]=n.zIndex))}updateEdge(e){this.addEdge(e)}removeEdge(e){delete this.edgeDataCache[e],delete this.edgeProgramIndex[e],this.hoveredEdge===e&&(this.hoveredEdge=null),this.edgesWithForcedLabels.delete(e)}clearNodeIndices(){this.labelGrid=new ti,this.nodeExtent={x:[0,1],y:[0,1]},this.nodeDataCache={},this.edgeProgramIndex={},this.nodesWithForcedLabels=new Set,this.nodeZExtent=[1/0,-1/0],this.highlightedNodes=new Set}clearEdgeIndices(){this.edgeDataCache={},this.edgeProgramIndex={},this.edgesWithForcedLabels=new Set,this.edgeZExtent=[1/0,-1/0]}clearIndices(){this.clearEdgeIndices(),this.clearNodeIndices()}clearNodeState(){this.displayedNodeLabels=new Set,this.highlightedNodes=new Set,this.hoveredNode=null}clearEdgeState(){this.displayedEdgeLabels=new Set,this.highlightedNodes=new Set,this.hoveredEdge=null}clearState(){this.clearEdgeState(),this.clearNodeState()}addNodeToProgram(e,t,n){const i=this.nodeDataCache[e],o=this.nodePrograms[i.type];if(!o)throw new Error(`Sigma: could not find a suitable program for node type "${i.type}"!`);o.process(t,n,i),this.nodeProgramIndex[e]=n}addEdgeToProgram(e,t,n){const i=this.edgeDataCache[e],o=this.edgePrograms[i.type];if(!o)throw new Error(`Sigma: could not find a suitable program for edge type "${i.type}"!`);const a=this.graph.extremities(e),s=this.nodeDataCache[a[0]],l=this.nodeDataCache[a[1]];o.process(t,n,s,l,i),this.edgeProgramIndex[e]=n}getRenderParams(){return{matrix:this.matrix,invMatrix:this.invMatrix,width:this.width,height:this.height,pixelRatio:this.pixelRatio,zoomRatio:this.camera.ratio,cameraAngle:this.camera.angle,sizeRatio:1/this.scaleSize(),correctionRatio:this.correctionRatio,downSizingRatio:this.pickingDownSizingRatio,minEdgeThickness:this.settings.minEdgeThickness,antiAliasingFeather:this.settings.antiAliasingFeather}}getStagePadding(){const{stagePadding:e,autoRescale:t}=this.settings;return t&&e||0}createLayer(e,t,n={}){if(this.elements[e])throw new Error(`Sigma: a layer named "${e}" already exists`);const i=Sn(t,{position:"absolute"},{class:`sigma-${e}`});return n.style&&Object.assign(i.style,n.style),this.elements[e]=i,"beforeLayer"in n&&n.beforeLayer?this.elements[n.beforeLayer].before(i):"afterLayer"in n&&n.afterLayer?this.elements[n.afterLayer].after(i):this.container.appendChild(i),i}createCanvas(e,t={}){return this.createLayer(e,"canvas",t)}createCanvasContext(e,t={}){const n=this.createCanvas(e,t),i={preserveDrawingBuffer:!1,antialias:!1};return this.canvasContexts[e]=n.getContext("2d",i),this}createWebGLContext(e,t={}){const n=(t==null?void 0:t.canvas)||this.createCanvas(e,t);t.hidden&&n.remove();const i={preserveDrawingBuffer:!1,antialias:!1,...t};let o;o=n.getContext("webgl2",i),o||(o=n.getContext("webgl",i)),o||(o=n.getContext("experimental-webgl",i));const a=o;if(this.webGLContexts[e]=a,a.blendFunc(a.ONE,a.ONE_MINUS_SRC_ALPHA),t.picking){this.pickingLayers.add(e);const s=a.createFramebuffer();if(!s)throw new Error(`Sigma: cannot create a new frame buffer for layer ${e}`);this.frameBuffers[e]=s}return a}killLayer(e){var n;const t=this.elements[e];if(!t)throw new Error(`Sigma: cannot kill layer ${e}, which does not exist`);return this.webGLContexts[e]?((n=this.webGLContexts[e].getExtension("WEBGL_lose_context"))==null||n.loseContext(),delete this.webGLContexts[e]):this.canvasContexts[e]&&delete this.canvasContexts[e],t.remove(),delete this.elements[e],this}getCamera(){return this.camera}setCamera(e){this.unbindCameraHandlers(),this.camera=e,this.bindCameraHandlers()}getContainer(){return this.container}getGraph(){return this.graph}setGraph(e){e!==this.graph&&(this.hoveredNode&&!e.hasNode(this.hoveredNode)&&(this.hoveredNode=null),this.hoveredEdge&&!e.hasEdge(this.hoveredEdge)&&(this.hoveredEdge=null),this.unbindGraphHandlers(),this.checkEdgesEventsFrame!==null&&(cancelAnimationFrame(this.checkEdgesEventsFrame),this.checkEdgesEventsFrame=null),this.graph=e,this.bindGraphHandlers(),this.refresh())}getMouseCaptor(){return this.mouseCaptor}getTouchCaptor(){return this.touchCaptor}getDimensions(){return{width:this.width,height:this.height}}getGraphDimensions(){const e=this.customBBox||this.nodeExtent;return{width:e.x[1]-e.x[0]||1,height:e.y[1]-e.y[0]||1}}getNodeDisplayData(e){const t=this.nodeDataCache[e];return t?Object.assign({},t):void 0}getEdgeDisplayData(e){const t=this.edgeDataCache[e];return t?Object.assign({},t):void 0}getNodeDisplayedLabels(){return new Set(this.displayedNodeLabels)}getEdgeDisplayedLabels(){return new Set(this.displayedEdgeLabels)}getSettings(){return{...this.settings}}getSetting(e){return this.settings[e]}setSetting(e,t){const n={...this.settings};return this.settings[e]=t,or(this.settings),this.handleSettingsUpdate(n),this.scheduleRefresh(),this}updateSetting(e,t){return this.setSetting(e,t(this.settings[e])),this}setSettings(e){const t={...this.settings};return this.settings={...this.settings,...e},or(this.settings),this.handleSettingsUpdate(t),this.scheduleRefresh(),this}resize(e){const t=this.width,n=this.height;if(this.width=this.container.offsetWidth,this.height=this.container.offsetHeight,this.pixelRatio=jt(),this.width===0)if(this.settings.allowInvalidContainer)this.width=1;else throw new Error("Sigma: Container has no width. You can set the allowInvalidContainer setting to true to stop seeing this error.");if(this.height===0)if(this.settings.allowInvalidContainer)this.height=1;else throw new Error("Sigma: Container has no height. You can set the allowInvalidContainer setting to true to stop seeing this error.");if(!e&&t===this.width&&n===this.height)return this;for(const i in this.elements){const o=this.elements[i];o.style.width=this.width+"px",o.style.height=this.height+"px"}for(const i in this.canvasContexts)this.elements[i].setAttribute("width",this.width*this.pixelRatio+"px"),this.elements[i].setAttribute("height",this.height*this.pixelRatio+"px"),this.pixelRatio!==1&&this.canvasContexts[i].scale(this.pixelRatio,this.pixelRatio);for(const i in this.webGLContexts){this.elements[i].setAttribute("width",this.width*this.pixelRatio+"px"),this.elements[i].setAttribute("height",this.height*this.pixelRatio+"px");const o=this.webGLContexts[i];if(o.viewport(0,0,this.width*this.pixelRatio,this.height*this.pixelRatio),this.pickingLayers.has(i)){const a=this.textures[i];a&&o.deleteTexture(a)}}return this.emit("resize"),this}clear(){return this.emit("beforeClear"),this.webGLContexts.nodes.bindFramebuffer(WebGLRenderingContext.FRAMEBUFFER,null),this.webGLContexts.nodes.clear(WebGLRenderingContext.COLOR_BUFFER_BIT),this.webGLContexts.edges.bindFramebuffer(WebGLRenderingContext.FRAMEBUFFER,null),this.webGLContexts.edges.clear(WebGLRenderingContext.COLOR_BUFFER_BIT),this.webGLContexts.hoverNodes.clear(WebGLRenderingContext.COLOR_BUFFER_BIT),this.canvasContexts.labels.clearRect(0,0,this.width,this.height),this.canvasContexts.hovers.clearRect(0,0,this.width,this.height),this.canvasContexts.edgeLabels.clearRect(0,0,this.width,this.height),this.emit("afterClear"),this}refresh(e){var o,a;const t=(e==null?void 0:e.skipIndexation)!==void 0?e==null?void 0:e.skipIndexation:!1,n=(e==null?void 0:e.schedule)!==void 0?e.schedule:!1,i=!e||!e.partialGraph;if(i)this.clearEdgeIndices(),this.clearNodeIndices(),this.graph.forEachNode(s=>this.addNode(s)),this.graph.forEachEdge(s=>this.addEdge(s));else{const s=((o=e.partialGraph)==null?void 0:o.nodes)||[];for(let c=0,u=(s==null?void 0:s.length)||0;c<u;c++){const d=s[c];if(this.updateNode(d),t){const h=this.nodeProgramIndex[d];if(h===void 0)throw new Error(`Sigma: node "${d}" can\'t be repaint`);this.addNodeToProgram(d,this.nodeIndices[d],h)}}const l=((a=e==null?void 0:e.partialGraph)==null?void 0:a.edges)||[];for(let c=0,u=l.length;c<u;c++){const d=l[c];if(this.updateEdge(d),t){const h=this.edgeProgramIndex[d];if(h===void 0)throw new Error(`Sigma: edge "${d}" can\'t be repaint`);this.addEdgeToProgram(d,this.edgeIndices[d],h)}}}return(i||!t)&&(this.needToProcess=!0),n?this.scheduleRender():this.render(),this}scheduleRender(){return this.renderFrame||(this.renderFrame=requestAnimationFrame(()=>{this.render()})),this}scheduleRefresh(e){return this.refresh({...e,schedule:!0})}getViewportZoomedState(e,t){const{ratio:n,angle:i,x:o,y:a}=this.camera.getState(),{minCameraRatio:s,maxCameraRatio:l}=this.settings;typeof l=="number"&&(t=Math.min(t,l)),typeof s=="number"&&(t=Math.max(t,s));const c=t/n,u={x:this.width/2,y:this.height/2},d=this.viewportToFramedGraph(e),h=this.viewportToFramedGraph(u);return{angle:i,x:(d.x-h.x)*(1-c)+o,y:(d.y-h.y)*(1-c)+a,ratio:t}}viewRectangle(){const e=this.viewportToFramedGraph({x:0,y:0}),t=this.viewportToFramedGraph({x:this.width,y:0}),n=this.viewportToFramedGraph({x:0,y:this.height});return{x1:e.x,y1:e.y,x2:t.x,y2:t.y,height:t.y-n.y}}framedGraphToViewport(e,t={}){const n=!!t.cameraState||!!t.viewportDimensions||!!t.graphDimensions,i=t.matrix?t.matrix:n?_e(t.cameraState||this.camera.getState(),t.viewportDimensions||this.getDimensions(),t.graphDimensions||this.getGraphDimensions(),t.padding||this.getStagePadding()):this.matrix,o=Ye(i,e);return{x:(1+o.x)*this.width/2,y:(1-o.y)*this.height/2}}viewportToFramedGraph(e,t={}){const n=!!t.cameraState||!!t.viewportDimensions||!t.graphDimensions,i=t.matrix?t.matrix:n?_e(t.cameraState||this.camera.getState(),t.viewportDimensions||this.getDimensions(),t.graphDimensions||this.getGraphDimensions(),t.padding||this.getStagePadding(),!0):this.invMatrix,o=Ye(i,{x:e.x/this.width*2-1,y:1-e.y/this.height*2});return isNaN(o.x)&&(o.x=0),isNaN(o.y)&&(o.y=0),o}viewportToGraph(e,t={}){return this.normalizationFunction.inverse(this.viewportToFramedGraph(e,t))}graphToViewport(e,t={}){return this.framedGraphToViewport(this.normalizationFunction(e),t)}getGraphToViewportRatio(){const e={x:0,y:0},t={x:1,y:1},n=Math.sqrt(Math.pow(e.x-t.x,2)+Math.pow(e.y-t.y,2)),i=this.graphToViewport(e),o=this.graphToViewport(t);return Math.sqrt(Math.pow(i.x-o.x,2)+Math.pow(i.y-o.y,2))/n}getBBox(){return this.nodeExtent}getCustomBBox(){return this.customBBox}setCustomBBox(e){return this.customBBox=e,this.scheduleRender(),this}kill(){this.emit("kill"),this.removeAllListeners(),this.unbindCameraHandlers(),window.removeEventListener("resize",this.activeListeners.handleResize),this.mouseCaptor.kill(),this.touchCaptor.kill(),this.unbindGraphHandlers(),this.clearIndices(),this.clearState(),this.nodeDataCache={},this.edgeDataCache={},this.highlightedNodes.clear(),this.renderFrame&&(cancelAnimationFrame(this.renderFrame),this.renderFrame=null),this.renderHighlightedNodesFrame&&(cancelAnimationFrame(this.renderHighlightedNodesFrame),this.renderHighlightedNodesFrame=null);const e=this.container;for(;e.firstChild;)e.removeChild(e.firstChild);for(const t in this.nodePrograms)this.nodePrograms[t].kill();for(const t in this.nodeHoverPrograms)this.nodeHoverPrograms[t].kill();for(const t in this.edgePrograms)this.edgePrograms[t].kill();this.nodePrograms={},this.nodeHoverPrograms={},this.edgePrograms={};for(const t in this.elements)this.killLayer(t);this.canvasContexts={},this.webGLContexts={},this.elements={}}scaleSize(e=1,t=this.camera.ratio){return e/this.settings.zoomToSizeRatioFunction(t)*(this.getSetting("itemSizesReference")==="positions"?t*this.graphToViewportRatio:1)}getCanvases(){const e={};for(const t in this.elements)this.elements[t]instanceof HTMLCanvasElement&&(e[t]=this.elements[t]);return e}};const le=class le extends ri{};le.Camera=be,le.MouseCaptor=Jn,le.Sigma=ri,le.rendering={...Ja,createNodeBorderProgram:jr,createNodeImageProgram:Ft,createNodePiechartProgram:da,EdgeCurveProgram:ro},le.utils=_a;let ar=le;return ar});\n';

// b64::C:\git-personal\worktrees\vault-graph-plugin\assets\logo-mask.png
var logo_mask_default = "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";

// plugin/main.js
var VIEW_TYPE = "vault-graph-view";
var ICON_ID = "vault-graph-disc";
function discIcon() {
  const ring = (r, dot, slots, offset) => {
    let out = "";
    for (let i = 0; i < slots; i++) {
      const rad = (-90 + (offset || 0) + 360 * i / slots) * Math.PI / 180;
      out += '<circle cx="' + (50 + r * Math.cos(rad)).toFixed(2) + '" cy="' + (50 + r * Math.sin(rad)).toFixed(2) + '" r="' + dot + '"/>';
    }
    return out;
  };
  return '<g fill="currentColor" stroke="none">' + ring(36, 8.5, 8, 0) + ring(16, 6.5, 4, 22.5) + "</g>";
}
var HANDSHAKE_MS = 6e3;
var MONTHISH = /^\d{4}(?:[-_ ]?(?:\d{2}|Q[1-4]|W\d{1,2}))?$/i;
var ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
var TYPE_ALIAS = {
  people: "person",
  person: "person",
  "zettel/permanent": "zettel",
  "zettel/fleeting": "zettel",
  "zettel/literature": "zettel"
};
var SKIP_FILES = /* @__PURE__ */ new Set(["claude.md", "readme.md", "license.md"]);
var deNumber = (s) => String(s).replace(/^[\s\d._)-]+/, "").trim();
var slug = (s) => deNumber(s).toLowerCase().replace(/[\s_]+/g, "-");
var singular = (s) => s.replace(/ies$/, "y").replace(/([^aeious])s$/, "$1");
var norm = (s) => String(s).split(/[\\/]/).filter(Boolean).join("/");
var under = (rel, dir) => !!dir && (rel === dir || rel.startsWith(dir + "/"));
var day10 = (v) => {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p2 = (n) => String(n).padStart(2, "0");
    return v.getFullYear() + "-" + p2(v.getMonth() + 1) + "-" + p2(v.getDate());
  }
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return ISO_DAY.test(s) ? s : "";
};
var localDay = (ms) => {
  const d = new Date(ms), p2 = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
};
var paraFolder = (path) => {
  const seg = path.split("/");
  return seg.length > 1 ? seg[0] : "(vault root)";
};
var paraDirs = (path, flatMonths) => {
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
async function readConfigJson(app, name) {
  try {
    const p = (0, import_obsidian.normalizePath)(app.vault.configDir + "/" + name);
    if (!await app.vault.adapter.exists(p)) return null;
    return JSON.parse(await app.vault.adapter.read(p));
  } catch {
    return null;
  }
}
async function readFolders(app) {
  const dirs = /* @__PURE__ */ new Set();
  const core = await readConfigJson(app, "templates.json");
  if (core && typeof core.folder === "string" && core.folder.trim()) dirs.add(norm(core.folder));
  const templater = await readConfigJson(app, "plugins/templater-obsidian/data.json");
  if (templater && typeof templater.templates_folder === "string" && templater.templates_folder.trim()) {
    dirs.add(norm(templater.templates_folder));
  }
  const dn = await readConfigJson(app, "daily-notes.json");
  const dailyDir = dn && typeof dn.folder === "string" && dn.folder.trim() ? norm(dn.folder) : "";
  return { templateDirs: Array.from(dirs), dailyDir };
}
async function buildData(app, opts) {
  const t0 = performance.now();
  const folders = await readFolders(app);
  const templateDirs = folders.templateDirs, dailyDir = folders.dailyDir;
  const isTemplate = (path) => templateDirs.some((d) => under(path, d));
  const files = app.vault.getMarkdownFiles().filter((f) => {
    if (SKIP_FILES.has(f.name.toLowerCase())) return false;
    return opts.templates ? true : !isTemplate(f.path);
  });
  const index = /* @__PURE__ */ new Map();
  const nodes = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file) || {};
    const fm = cache.frontmatter || {};
    const tags = [].concat(fm.tags || [], fm.tag || []).reduce((acc, t) => acc.concat(String(t).split(/[,\s]+/)), []).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
    const dirs = paraDirs(file.path, opts.flatMonths);
    index.set(file.path, nodes.length);
    nodes.push({
      id: file.path,
      label: file.basename,
      folder: paraFolder(file.path),
      dirs,
      sub: dirs[0] || "",
      type: inferType(fm, file.path, tags, dailyDir, isTemplate),
      tags,
      created: day10(fm.created) || day10(fm.date),
      touched: localDay(file.stat.mtime),
      words: 0,
      // filled below; the one field still needing a read
      _file: file
    });
  }
  const tIndex = performance.now();
  const weight = /* @__PURE__ */ new Map();
  const addEdge = (i, j, w) => {
    if (i === j) return;
    const key = i < j ? i + " " + j : j + " " + i;
    weight.set(key, (weight.get(key) || 0) + w);
  };
  let attachmentLinks = 0, filteredLinks = 0;
  const resolved = app.metadataCache.resolvedLinks || {};
  for (const src of Object.keys(resolved)) {
    const i = index.get(src);
    if (i === void 0) continue;
    for (const dest of Object.keys(resolved[src])) {
      const j = index.get(dest);
      if (j === void 0) {
        if (dest.toLowerCase().endsWith(".md")) filteredLinks++;
        else attachmentLinks++;
        continue;
      }
      addEdge(i, j, resolved[src][dest]);
    }
  }
  const unresolvedMap = app.metadataCache.unresolvedLinks || {};
  let unresolved = 0;
  const ghosts = /* @__PURE__ */ new Map();
  for (const src of Object.keys(unresolvedMap)) {
    const i = index.get(src);
    if (i === void 0) continue;
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
        id: "ghost:" + name,
        label: name,
        folder: "(unresolved)",
        sub: "",
        dirs: [],
        type: "ghost",
        tags: [],
        created: "",
        touched: "",
        words: 0,
        ghost: true
      });
      for (const pair of sources) addEdge(pair[0], j, pair[1]);
    }
  }
  const tEdges = performance.now();
  if (opts.words) {
    await Promise.all(nodes.filter((n) => n._file).map(async (n) => {
      try {
        const raw = await app.vault.cachedRead(n._file);
        const m = /^---\r?\n[\s\S]*?\r?\n---/.exec(raw.replace(/^\uFEFF/, ""));
        const body = m ? raw.slice(m[0].length) : raw;
        n.words = body.split(/\s+/).filter(Boolean).length;
      } catch {
        n.words = 0;
      }
    }));
  }
  const tWords = performance.now();
  const edges = Array.from(weight).map((entry) => {
    const ab = entry[0].split(" ");
    return { s: Number(ab[0]), t: Number(ab[1]), w: entry[1] };
  });
  const degree = new Array(nodes.length).fill(0);
  for (const e of edges) {
    degree[e.s]++;
    degree[e.t]++;
  }
  const out = nodes.map((n, i) => {
    const clean = Object.assign({}, n, { deg: degree[i] });
    delete clean._file;
    return clean;
  });
  const p2 = (n) => String(n).padStart(2, "0");
  const now = /* @__PURE__ */ new Date();
  return {
    vault: app.vault.getName(),
    generated: now.getFullYear() + "-" + p2(now.getMonth() + 1) + "-" + p2(now.getDate()) + " " + p2(now.getHours()) + ":" + p2(now.getMinutes()),
    nodes: out,
    edges,
    stats: {
      files: files.length,
      nodes: out.length,
      edges: edges.length,
      unresolved,
      orphans: degree.filter((d) => d === 0).length,
      templatesExcluded: !opts.templates,
      ghostsIncluded: !!opts.ghosts
    },
    // Spike-only. Not part of the shape the page reads; the view prints it and the CDP
    // harness asserts on it.
    _spike: {
      msIndex: Math.round(tIndex - t0),
      msEdges: Math.round(tEdges - tIndex),
      msWords: Math.round(tWords - tEdges),
      msTotal: Math.round(tWords - t0),
      templateDirs,
      dailyDir,
      attachmentLinks,
      filteredLinks
    }
  };
}
var PRE_SCRIPT = [
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
  "<\/script>"
].join("\n");
var BRIDGE = [
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
  `    var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="obsidian://"]') : null;`,
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
  "<\/script>"
].join("\n");
function assemblePage(data) {
  const libs = "<script>\n" + graphology_umd_min_default + "\n<\/script>\n<script>\n" + sigma_min_default + "\n<\/script>";
  const assets = PRE_SCRIPT + "\n<script>window.VAULT_LOGO_MASK=" + JSON.stringify("data:image/png;base64," + logo_mask_default) + ";<\/script>";
  const theme = activeDocument.body.classList.contains("theme-light") ? "light" : "dark";
  return template_default.replace('<html lang="en" data-theme="dark">', '<html lang="en" data-theme="' + theme + '">').replace("<!--LIBS-->", () => libs).replace("<!--ASSETS-->", () => assets).replace("<!--DATA-->", () => "<script>window.VAULT_DATA=" + JSON.stringify(data) + ";<\/script>").replace("</body>", BRIDGE + "\n</body>");
}
var VaultGraphView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.frame = null;
    this.blobUrl = null;
    this.ready = null;
    this.strategy = null;
    this.pending = /* @__PURE__ */ new Map();
    this.probeSeq = 0;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Vault graph";
  }
  getIcon() {
    return ICON_ID;
  }
  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("vault-graph-view");
    this.status = root.createDiv({ cls: "vgs-status" });
    this.stage = root.createDiv({ cls: "vgs-stage" });
    this.registerDomEvent(window, "message", (ev) => this.onFrameMessage(ev));
    await this.reload();
  }
  async onClose() {
    this.teardownFrame();
  }
  teardownFrame() {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    if (this.frame) {
      this.frame.remove();
      this.frame = null;
    }
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
    this.say(s.nodes + " notes, " + s.edges + " links, " + s.orphans + " orphans, " + s.unresolved + " unresolved -- built in " + m.msTotal + "ms (index " + m.msIndex + ", links " + m.msEdges + ", words " + m.msWords + ")");
    const html = assemblePage(data);
    this.pageBytes = html.length;
    const order = this.plugin.settings.forceStrategy ? [this.plugin.settings.forceStrategy] : ["srcdoc", "blob"];
    for (const strategy of order) {
      const ready = await this.tryMount(html, strategy);
      if (ready) {
        this.strategy = strategy;
        this.ready = ready;
        this.say(this.status.getText() + " | mounted via " + strategy + ", " + Math.round(html.length / 1024) + "KB, " + ready.canvases + " canvases, __vg " + (ready.hasVg ? "present" : "MISSING"));
        return;
      }
      this.teardownFrame();
    }
    this.say("MOUNT FAILED -- neither srcdoc nor blob produced a handshake. " + (this.lastError || "no error reported"));
  }
  tryMount(html, strategy) {
    return new Promise((resolve) => {
      const frame = this.stage.createEl("iframe", { cls: "vgs-frame" });
      this.frame = frame;
      this.lastError = null;
      let done = false;
      const finish = (v) => {
        if (!done) {
          done = true;
          this.awaitingReady = null;
          resolve(v);
        }
      };
      this.awaitingReady = finish;
      window.setTimeout(() => finish(null), HANDSHAKE_MS);
      if (strategy === "srcdoc") {
        frame.setAttribute("sandbox", "allow-scripts allow-popups");
        frame.srcdoc = html;
      } else {
        this.blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        frame.src = this.blobUrl;
      }
    });
  }
  onFrameMessage(ev) {
    if (!this.frame || ev.source !== this.frame.contentWindow) return;
    const m = ev.data;
    if (!m || !m.vgSpike) return;
    if (m.vgSpike === "ready" && this.awaitingReady) {
      this.awaitingReady(m);
      return;
    }
    if (m.vgSpike === "error") {
      this.lastError = "page error: " + m.message + (m.line ? " (line " + m.line + ")" : "");
      console.error("[vault-graph]", this.lastError);
      return;
    }
    if (m.vgSpike === "open") {
      try {
        const q = new URLSearchParams(m.href.slice(m.href.indexOf("?") + 1));
        const file = q.get("file");
        if (file) this.app.workspace.openLinkText(file, "", false);
      } catch (e) {
        new import_obsidian.Notice("Could not open that note: " + e.message);
      }
      return;
    }
    if (m.vgSpike === "probe-result") {
      const fn = this.pending.get(m.id);
      if (fn) {
        this.pending.delete(m.id);
        fn(m);
      }
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
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ error: "probe timed out" });
        }
      }, 4e3);
      this.frame.contentWindow.postMessage({ vgSpike: "probe", id }, "*");
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
};
var DEFAULTS = {
  ghosts: false,
  // --ghosts
  templates: false,
  // --templates
  flatMonths: false,
  // --flat-months
  words: true,
  // the one field that still costs I/O
  forceStrategy: null
  // "srcdoc" | "blob" | null (try both, first to handshake wins)
};
var VaultGraphSpikePlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.registerView(VIEW_TYPE, (leaf) => new VaultGraphView(leaf, this));
    (0, import_obsidian.addIcon)(ICON_ID, discIcon());
    this.addRibbonIcon(ICON_ID, "Vault graph", () => this.activate());
    this.addCommand({
      id: "open",
      name: "Open the graph",
      callback: () => this.activate()
    });
    this.addCommand({
      id: "rebuild",
      name: "Rebuild from the metadata cache",
      callback: async () => {
        const view = this.currentView();
        if (!view) {
          new import_obsidian.Notice("Open the graph first.");
          return;
        }
        await view.reload();
      }
    });
    this.addCommand({
      id: "report",
      // Sentence case, and the linter checks it -- the previous wording also named the
      // console, which is no longer where this goes.
      name: "Report diagnostics",
      callback: async () => {
        const view = this.currentView();
        if (!view) {
          new import_obsidian.Notice("Open the graph first.");
          return;
        }
        const report = {
          mountStrategy: view.strategy,
          pageKB: Math.round((view.pageBytes || 0) / 1024),
          handshake: view.ready,
          hostCanReachFrame: view.reachIntoFrame(),
          probeOverPostMessage: await view.probe(),
          build: view.lastData && view.lastData._spike,
          stats: view.lastData && view.lastData.stats
        };
        window.__vgSpikeReport = report;
        new import_obsidian.Notice("Diagnostics ready.");
        return report;
      }
    });
  }
  // Guidelines: don't hold a reference to the view, and don't detach leaves in onunload.
  currentView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    return leaves.length ? leaves[0].view : null;
  }
  async activate() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
};
var main_default = VaultGraphSpikePlugin;
