#!/usr/bin/env node
// github#80, design/0019

import { attach } from "./cdp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leftWindowArgs } from "./screen.mjs";
import { keepFocus } from "./focus.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = Number(arg("port", 9450));
/* github#131, design/0019 -- what the sidebar is showing, and what the card offers */
const READING = `(function () {
  var d = document.getElementById("vg-detail");
  var sb = document.getElementById("vg-sidebar");
  var tn = document.getElementById("vg-tabnote");
  var pg = document.getElementById("vg-readgroups");
  var open = d ? d.querySelector("a.open") : null;
  return { cardParent: d && d.parentElement ? d.parentElement.id : null,
           cardHidden: !!(d && d.hidden),
           reading: tn && tn.getAttribute("aria-selected") === "true" ? "note" : "groups",
           noteTab: tn ? (tn.disabled ? "disabled" : "live") : "absent",
           groupsShown: !!(pg && !pg.hidden),
           openLabel: open ? open.textContent : null,
           openTitle: open ? open.getAttribute("title") : null,
           sidebarHidden: sb ? Math.max(0, sb.scrollHeight - sb.clientHeight) : null }; })()`;
const WINDOW = String(arg("window", "1600x1000")).split("x").map(Number);
const SHOTS = arg("shots", "");
const OUT_JSON = arg("json", "");
const LABEL = arg("label", "");
const RANK = Number(arg("rank", 1));
const HOLD = Number(arg("hold", 0));
const FILM = arg("film", "");
const FPS = Number(arg("fps", 30));
const NO_LOCK = argv.includes("--no-lock");

// github#87
const SCREEN_LOCK = "screen-left";
const SCREEN_OWNER = "probe-room.mjs " + branchName() + " [" + process.pid + "]";

// github#87
function takeScreen() {
  if (NO_LOCK) return false;
  const r = spawnSync(process.execPath,
    [join(HERE, "lock.mjs"), "acquire", SCREEN_LOCK, "--owner", SCREEN_OWNER],
    { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("");
    console.error("could not take the " + SCREEN_LOCK + " lock -- something else is driving that");
    console.error("display, and this harness parks a Chrome window on it.");
    console.error("Who holds it:  node scripts/lock.mjs status");
    console.error("Pass --no-lock ONLY when the caller already holds it.");
    process.exit(1);
  }
  return true;
}

// github#87
function dropScreen(held) {
  if (!held) return;
  try {
    spawnSync(process.execPath,
      [join(HERE, "lock.mjs"), "release", SCREEN_LOCK, "--owner", SCREEN_OWNER],
      { stdio: "ignore" });
  } catch { /* github#87 */ }
}

function findChrome() {
  const named = arg("chrome", "");
  if (named) return named;
  const guesses = [
    process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ];
  for (const g of guesses) if (g && existsSync(g)) return g;
  throw new Error("Chrome not found; pass --chrome <path>");
}

function branchName() {
  const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: ROOT, encoding: "utf8" });
  return (r.stdout || "").trim() || "detached";
}

/** @param {string} file @param {string} title */
function labelPage(file, title) {
  const src = readFileSync(file, "utf8");
  const out = src.replace(/(window\.VAULT_DATA=\{[\s\S]*?"vault":)("(?:\\.|[^"\\])*")/,
    (_m, head) => head + JSON.stringify(title));
  if (out === src) throw new Error(`could not label ${file}: no VAULT_DATA vault field`);
  writeFileSync(file, out);
}

function findFfmpeg() {
  const named = arg("ffmpeg", "");
  if (named) return named;
  const onPath = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (onPath.status === 0) return "ffmpeg";
  const winget = join(process.env.LOCALAPPDATA || "",
    "Microsoft", "WinGet", "Links", "ffmpeg.exe");
  if (existsSync(winget)) return winget;
  throw new Error("ffmpeg not found; pass --ffmpeg <path>");
}

/* github#80, design/0019 */
function encodeFilm() {
  if (!frames.length) throw new Error("no screencast frames arrived; nothing to encode");
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const next = frames[i + 1];
    const dur = next ? Math.max(1 / FPS, next.t - frames[i].t) : 1.2;
    lines.push(`file '${frames[i].file.replace(/\\/g, "/")}'`, `duration ${dur.toFixed(4)}`);
  }
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, "/")}'`);
  const list = join(filmDir, "frames.txt");
  writeFileSync(list, lines.join("\n") + "\n");

  const span = frames[frames.length - 1].t - frames[0].t;
  const r = spawnSync(findFfmpeg(), [
    "-hide_banner", "-loglevel", "warning",
    "-f", "concat", "-safe", "0", "-i", list,
    "-vf", `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-movflags", "+faststart", "-y", resolve(FILM),
  ], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg exited " + r.status);
  console.log(`\nfilmed ${frames.length} frames over ${span.toFixed(1)}s -> ${resolve(FILM)}`);
}

let html = arg("html", "");
if (!html) {
  const vault = arg("vault", "");
  if (!vault) throw new Error("pass --vault <path> or --html <built page>");
  html = join(mkdtempSync(join(tmpdir(), "vg-room-")), "vault-graph.html");
  const b = spawnSync(process.execPath,
    [join(ROOT, "src", "build-graph.mjs"), "--out", html, "--vault", resolve(vault)],
    { encoding: "utf8" });
  if (b.status !== 0) throw new Error("build failed:\n" + (b.stderr || ""));
  console.log((b.stdout || "").trimEnd());
  labelPage(html, `${branchName()} — ${basename(resolve(vault))}${LABEL ? " " + LABEL : ""}`);
}
const baseUrl = pathToFileURL(html).href;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/* ------------------------------------------------------------------ the page expressions */

const MEASURE = `(function () {
  var R = __vg.renderer, G = __vg.graph, sel = __vg.state.selected;
  var gEl = document.getElementById("vg-graph");
  var gb = gEl.getBoundingClientRect();
  var out = { sel: sel, box: { w: Math.round(gb.width), h: Math.round(gb.height) },
              lit: 0, inBox: 0, inFrame: 0, underCard: 0, underCam: 0, offCanvas: 0,
              overlays: [], frameArea: 0, boxArea: Math.round(gb.width * gb.height),
              discX: null, discY: null, wrongElement: 0, checked: 0 };

  out.curve = { samples: 0, inFrame: 0, underCard: 0, underCam: 0, offCanvas: 0, edges: 0 };

  var ids = {};
  if (sel) {
    ids[sel] = true;
    G.forEachEdge(sel, function (e, attrs, s, t) { ids[s] = true; ids[t] = true; });
  }

  var ov = [];
  ["vg-detail", "vg-cam"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el || el.hidden) return;
    var r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    var x0 = Math.max(r.left, gb.left), x1 = Math.min(r.right, gb.right);
    var y0 = Math.max(r.top, gb.top), y1 = Math.min(r.bottom, gb.bottom);
    var w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
    ov.push({ id: id, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
              overlapArea: Math.round(w * h) });
  });
  out.overlays = ov;
  /* Disjoint in every prototype, but subtract the intersection anyway. */
  var area = 0;
  for (var i = 0; i < ov.length; i++) area += ov[i].overlapArea;
  if (ov.length === 2) {
    var ix0 = Math.max(ov[0].left, ov[1].left), ix1 = Math.min(ov[0].right, ov[1].right);
    var iy0 = Math.max(ov[0].top, ov[1].top), iy1 = Math.min(ov[0].bottom, ov[1].bottom);
    area -= Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
  }
  out.frameArea = Math.max(0, out.boxArea - Math.round(area));

  var origin = R.graphToViewport({ x: 0, y: 0 });
  out.discX = Math.round(gb.left + origin.x);
  out.discY = Math.round(gb.top + origin.y);

  Object.keys(ids).forEach(function (id) {
    var d = R.getNodeDisplayData(id);
    if (!d || d.hidden) return;
    var al = __vg.alpha[id];
    if (al !== undefined && al <= 0.004) return;
    out.lit++;
    var p = R.graphToViewport(G.getNodeAttributes(id));
    /* graphToViewport is container-relative; lift it into the viewport. */
    var x = gb.left + p.x, y = gb.top + p.y;
    var inBox = x >= gb.left && x <= gb.right && y >= gb.top && y <= gb.bottom;
    if (!inBox) { out.offCanvas++; return; }
    out.inBox++;
    var hitCard = false, hitCam = false;
    ov.forEach(function (o) {
      if (x >= o.left && x <= o.right && y >= o.top && y <= o.bottom) {
        if (o.id === "vg-detail") hitCard = true; else hitCam = true;
      }
    });
    if (hitCard) out.underCard++;
    if (hitCam) out.underCam++;
    if (!hitCard && !hitCam) {
      out.inFrame++;
      /* Cross-check against the browser; sampled, elementFromPoint is slow. */
      if (out.checked < 40) {
        out.checked++;
        var el = document.elementFromPoint(Math.round(x), Math.round(y));
        var ok = el && (String(el.className || "").indexOf("vg-layer") >= 0 ||
                        el.id === "vg-graph" || el.id === "vg-canvas");
        if (!ok) out.wrongElement++;
      }
    }
  });

  /* drawFocusWeb's own quadratic, sampled as checkFocusWeb does. src/page.js:4251 */
  var inside = function (x, y, o) { return x >= o.left && x <= o.right && y >= o.top && y <= o.bottom; };
  var seen = {};
  Object.keys(ids).forEach(function (n) {
    G.forEachEdge(n, function (e, attrs, s, t) {
      if (seen[e] || !ids[s] || !ids[t]) return;
      seen[e] = true;
      var ed = R.getEdgeDisplayData(e);
      if (!ed || ed.hidden) return;
      var ps = R.graphToViewport(G.getNodeAttributes(s));
      var pt = R.graphToViewport(G.getNodeAttributes(t));
      var dx = pt.x - ps.x, dy = pt.y - ps.y;
      var k = ed.type === "curve" ? (ed.curvature || 0) : 0;
      var cx = (ps.x + pt.x) / 2 + dy * k, cy = (ps.y + pt.y) / 2 - dx * k;
      out.curve.edges++;
      for (var u = 0.05; u <= 0.95; u += 0.01) {
        var iu = 1 - u;
        var x = gb.left + iu * iu * ps.x + 2 * iu * u * cx + u * u * pt.x;
        var y = gb.top + iu * iu * ps.y + 2 * iu * u * cy + u * u * pt.y;
        out.curve.samples++;
        if (!(x >= gb.left && x <= gb.right && y >= gb.top && y <= gb.bottom)) {
          out.curve.offCanvas++; continue;
        }
        var hc = false, hm = false;
        for (var j = 0; j < ov.length; j++) {
          if (inside(x, y, ov[j])) { if (ov[j].id === "vg-detail") hc = true; else hm = true; }
        }
        if (hc) out.curve.underCard++;
        else if (hm) out.curve.underCam++;
        else out.curve.inFrame++;
      }
    });
  });
  return out;
})()`;

const SELECT = `(function () {
  var rank = __RANK__;
  var all = [];
  __vg.graph.forEachNode(function (id, a) { all.push({ id: id, deg: a.deg }); });
  all.sort(function (x, y) { return y.deg - x.deg || (x.id < y.id ? -1 : 1); });
  var chosen = all[Math.min(rank, all.length) - 1];
  if (!chosen) return null;
  var best = chosen.id, bd = chosen.deg;
  var q = document.querySelector("#vg-q");
  q.value = __vg.graph.getNodeAttribute(best, "label").slice(0, 12);
  q.dispatchEvent(new Event("input"));
  var hit = document.querySelector("#vg-hits [data-hit]");
  if (!hit) return null;
  hit.click();
  return { id: best, deg: bd, rank: rank, label: __vg.graph.getNodeAttribute(best, "label") };
})()`;

/* ------------------------------------------------------------------------------- the run */

const profile = mkdtempSync(join(tmpdir(), "vg-room-profile-"));
const held = takeScreen();

const rows = [];
/** @type {{ file: string, t: number }[]} */
const frames = [];
let filmDir = "";
let page = null;
let chrome = null;
try {
  // github#129, github#135
  const focus = await keepFocus();
  chrome = spawn(findChrome(), [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-component-update", "--disable-sync", "--mute-audio",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    ...leftWindowArgs(WINDOW[0], WINDOW[1]), `--app=${baseUrl}`,
  ], { stdio: "ignore" });
  void focus.watch(chrome.pid);

  for (let i = 0; i < 60 && !page; i++) {
    await sleep(400);
    try { page = await attach(PORT, "vault-graph"); } catch { /* github#80 */ }
  }
  if (!page) throw new Error("could not attach to Chrome on port " + PORT);
  page.j = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));

  /* github#80, github#122 */
  if (FILM) {
    filmDir = mkdtempSync(join(tmpdir(), "vg-room-film-"));
    page.on((msg) => {
      if (msg.method !== "Page.screencastFrame") return;
      page.send("Page.screencastFrameAck", { sessionId: msg.params.sessionId })
          .catch(() => { /* github#80 */ });
      const file = join(filmDir, String(frames.length).padStart(5, "0") + ".png");
      writeFileSync(file, Buffer.from(msg.params.data, "base64"));
      frames.push({ file, t: msg.params.metadata.timestamp });
    });
    await page.send("Page.enable");
    await page.send("Page.startScreencast",
      { format: "png", everyNthFrame: 1, maxWidth: WINDOW[0], maxHeight: WINDOW[1] });
  }

  const settle = async (ms = 12000) => {
    const deadline = Date.now() + ms;
    for (;;) {
      const busy = await page.eval("!!(window.__vg && __vg.demo && __vg.demo.busy())").catch(() => true);
      if (!busy) { await sleep(250); return true; }
      if (Date.now() > deadline) return false;
      await sleep(150);
    }
  };
  const ready = async () => {
    for (let i = 0; i < 90; i++) {
      const ok = await page.eval("!!(window.__vg && __vg.renderer && __vg.state.until === null)")
                           .catch(() => false);
      if (ok) return true;
      await sleep(250);
    }
    return false;
  };
  const shoot = async (name) => {
    if (SHOTS) {
      const r = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(join(SHOTS, name + ".png"), Buffer.from(r.data, "base64"));
    }
    if (HOLD > 0) await sleep(HOLD);
  };

  {
    await page.send("Page.navigate", { url: baseUrl });
    await sleep(1200);
    if (!(await ready())) throw new Error("the page never became ready");
    await settle();

    const rest = await page.j(MEASURE);
    await shoot("1-rest");

    const picked = await page.j(SELECT.replace("__RANK__", String(RANK)));
    if (!picked) throw new Error("no search hit to select");
    await sleep(900);
    await settle();
    const walk = await page.j(MEASURE);
    await shoot("2-walk");

    /* github#131 -- back to the groupings the way a reader gets there */
    await page.eval(`document.querySelector("#vg-detail .x").click(); void 0`);
    await sleep(500);
    await settle();
    const closed = await page.j(READING);
    await shoot("3-closed");

    await page.j(SELECT.replace("__RANK__", String(RANK)));
    await sleep(700);
    await settle();
    await page.eval(`document.querySelector("#vg-reset").click(); void 0`);
    await sleep(900);
    await settle();
    const fit = await page.j(MEASURE);
    await shoot("4-fit");

    const chrome_ = await page.j(READING);

    /* github#131, github#82 */
    const spot = await page.j(`(function () {
      var g = document.getElementById("vg-graph").getBoundingClientRect();
      return { x: Math.round(g.right - 24), y: Math.round(g.top + 24) }; })()`);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await page.send("Input.dispatchMouseEvent", {
        type, x: spot.x, y: spot.y, button: "left", clickCount: 1,
        buttons: type === "mousePressed" ? 1 : 0,
      });
    }
    await sleep(500);
    await settle();
    const stage = await page.j(READING);
    await shoot("5-stage");

    rows.push({ note: picked, rest, walk, fit, closed, stage, chrome: chrome_,
                consoleError: page.firstError() });
    console.log(`\n${LABEL ? LABEL + " " : ""}note ${picked.label} (deg ${picked.deg})`);
    for (const [k, m] of [["rest", rest], ["walk", walk], ["fit", fit]]) {
      console.log(`  ${k.padEnd(5)} box ${m.box.w}x${m.box.h}  lit ${String(m.lit).padStart(4)}  ` +
        `inFrame ${String(m.inFrame).padStart(4)}  underCard ${String(m.underCard).padStart(3)}  ` +
        `underCam ${String(m.underCam).padStart(3)}  off ${String(m.offCanvas).padStart(4)}  ` +
        `frame ${(m.frameArea / 1000).toFixed(0)}k px2  discX ${m.discX}  ` +
        `xcheck ${m.wrongElement}/${m.checked}`);
      const c = m.curve;
      const pct = (v) => (c.samples ? (100 * v / c.samples).toFixed(1) : "0.0");
      console.log(`        curve ${c.edges} edges, ${c.samples} samples: ` +
        `inFrame ${c.inFrame} (${pct(c.inFrame)}%)  underCard ${c.underCard} (${pct(c.underCard)}%)  ` +
        `underCam ${c.underCam}  off ${c.offCanvas} (${pct(c.offCanvas)}%)`);
    }
    console.log(`  selected: card in #${chrome_.cardParent}, reading "${chrome_.reading}", ` +
      `note tab ${chrome_.noteTab}, open button "${chrome_.openLabel}", ` +
      `sidebar scrollable by ${chrome_.sidebarHidden}px`);
    for (const [how, m] of [["the card's x", closed], ["a click on the stage", stage]]) {
      console.log(`  after ${how}: reading "${m.reading}", note tab ${m.noteTab}, ` +
        `card ${m.cardHidden ? "hidden" : "SHOWN"}, groups ${m.groupsShown ? "shown" : "HIDDEN"}`);
    }
    if (chrome_.consoleError) console.log(`  CONSOLE ERROR: ${chrome_.consoleError}`);
  }

  if (FILM) {
    await page.send("Page.stopScreencast").catch(() => { /* github#80 */ });
    await sleep(400);
    encodeFilm();
  }

  if (OUT_JSON) {
    writeFileSync(OUT_JSON, JSON.stringify({ html, window: WINDOW, label: LABEL, rows }, null, 1));
    console.log("\nwrote " + OUT_JSON);
  }
} finally {
  if (page) page.close();
  try { if (chrome) chrome.kill(); } catch { /* github#80 */ }
  await sleep(300);
  dropScreen(held);
}
