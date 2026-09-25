#!/usr/bin/env node
// github#144 -- loses each WebGL layer and asserts it draws again
// github#144 -- why, and the numbers: .ai-context/invariants.md
// github#144 -- node scripts/webgl-recovery-check.mjs [--vault <d>]

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { attach } from "./cdp.mjs";
import { findChrome } from "./chrome.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const KEEP = argv.includes("--keep");
const HEADED = argv.includes("--headed");
const NOTES = Math.max(60, Number(arg("notes", "400")) || 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LAYERS = ["edges", "nodes", "hoverNodes"];
// github#144 -- must outlast GLOST_STALL_MS in src/page.js
const STALL_WAIT_MS = 5200;
// github#144 -- the real assertion is against the baseline, not this
const PAINT_FLOOR = 8;

/* --------------------------------------------------------------- the page -- */

const scratch = [];
const scratchDir = (tag) => {
  const d = mkdtempSync(join(tmpdir(), "vg-glr-" + tag + "-"));
  scratch.push(d);
  return d;
};

let url = arg("url", "");
if (!url) {
  let vault = arg("vault", "");
  if (!vault) {
    vault = join(scratchDir("vault"), "v");
    console.log("generating a " + NOTES + "-note vault ...");
    const g = spawnSync(process.execPath,
                        [join(HERE, "make-test-vault.mjs"), "--notes", String(NOTES), "--out", vault],
                        { encoding: "utf8" });
    if (g.status !== 0) { console.error(g.stderr || g.stdout); process.exit(1); }
  }
  const out = join(scratchDir("build"), "vault-graph.html");
  const b = spawnSync(process.execPath,
                      [join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", out],
                      { encoding: "utf8" });
  if (b.status !== 0) { console.error(b.stderr || b.stdout); process.exit(1); }
  console.log((b.stdout || "").trimEnd());
  // github#144 -- ?rest skips the intro; a scenario asks for a cascade
  url = pathToFileURL(out).href + "?rest";
}
console.log("checking " + url + "\n");

/* ------------------------------------------------------------------ chrome -- */

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => { const port = s.address().port; s.close(() => res(port)); });
  s.on("error", rej);
});

const PORT = await freePort();
const profile = scratchDir("profile");
const chrome = spawn(findChrome(arg("chrome", "")), [
  ...(HEADED ? [] : ["--headless=new"]),
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-component-update", "--disable-sync", "--mute-audio",
  "--disable-breakpad", "--disable-crash-reporter",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling", "--allow-file-access-from-files",
  "--window-size=1400,900", url,
], { stdio: ["ignore", "ignore", "ignore"] });

let p = null;
for (let i = 0; i < 150 && !p; i++) {
  try { p = await attach(PORT, "vault-graph"); } catch { await sleep(200); }
}
if (!p) { chrome.kill(); throw new Error("could not attach to Chrome on port " + PORT); }

const j = async (expr) =>
  JSON.parse(await p.eval("JSON.stringify((function(){ return (" + expr + "); })())") ?? "null");

/* ------------------------------------------------------------- the driver -- */

const DRIVER = `(function(){
  var R = __vg.renderer, cv = R.getCanvases();
  var H = { ctx: {}, ext: {}, events: [] };
  window.__glr = H;

  H.layers = ${JSON.stringify(LAYERS)};
  H.layers.forEach(function (name) {
    var el = cv[name];
    // The extension is unreachable once the context is gone, so it is taken now and kept.
    var gl = el.getContext("webgl2");
    H.ctx[name] = gl;
    H.ext[name] = gl.getExtension("WEBGL_lose_context");
    // Added AFTER the engine's own, so defaultPrevented reports what the engine did.
    el.addEventListener("webglcontextlost", function (e) {
      H.events.push({ kind: "lost", layer: name, prevented: e.defaultPrevented });
    });
    el.addEventListener("webglcontextrestored", function () {
      H.events.push({ kind: "restored", layer: name });
    });
  });
  R.on("contextLost", function (e) { H.events.push({ kind: "engineLost", layer: e.layer }); });
  R.on("contextRestored", function (e) { H.events.push({ kind: "engineRestored", layer: e.layer }); });

  // preserveDrawingBuffer is false, so a layer is only true inside the task that drew it.
  var painted = function (el) {
    var c = document.createElement("canvas");
    c.width = el.width; c.height = el.height;
    var x = c.getContext("2d");
    x.drawImage(el, 0, 0);
    var d = x.getImageData(0, 0, c.width, c.height).data, n = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n;
  };

  H.paint = function () {
    R.render();
    var out = {};
    H.layers.forEach(function (name) { out[name] = painted(cv[name]); });
    return out;
  };

  H.lostFlags = function () {
    var out = {};
    H.layers.forEach(function (name) { out[name] = H.ctx[name].isContextLost(); });
    return out;
  };

  H.sameContexts = function () {
    return H.layers.every(function (name) {
      return R.getCanvases()[name].getContext("webgl2") === H.ctx[name];
    });
  };

  H.lose = function (names) { names.forEach(function (n) { H.ext[n].loseContext(); }); return true; };
  H.restore = function (names) { names.forEach(function (n) { H.ext[n].restoreContext(); }); return true; };

  H.notice = function () {
    var el = document.querySelector("#vg-glost");
    return { present: !!el, hidden: !el || el.hidden, text: el ? el.textContent : "" };
  };

  // What the ticket asks to survive the recovery.
  H.state = function () {
    var s = __vg.state;
    return { camera: R.getCamera().getState(), selected: s.selected, hovered: s.hovered,
             pinned: s.pinned.slice(), query: s.query, dim: s.dim };
  };

  H.arm = function () { H.events.length = 0; return true; };
  H.busy = function () { return !!__vg.demo.busy(); };
  // A query, a selection and a pin, so the hover layer has real work of its own: a search
  // highlights every match, and the highlighted set is what that layer draws.
  H.seed = function (q) {
    var ids = __vg.graph.nodes();
    var id = ids[Math.floor(ids.length / 2)];
    __vg.select(id);
    __vg.togglePin(ids[0]);
    if (q) {
      var box = document.querySelector("#vg-q");
      box.value = q;
      box.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return { id: id, highlighted: __vg.graph.nodes().filter(function (n) {
      var d = R.getNodeDisplayData(n);
      return !!(d && d.highlighted);
    }).length };
  };
  return true;
})()`;

/* -------------------------------------------------------------- the checks -- */

const results = [];
const check = (ok, label, detail) => {
  results.push({ ok, label, detail });
  console.log("  " + (ok ? "ok  " : "NO  ") + label + (detail ? "   (" + detail + ")" : ""));
};
const show = (px) => LAYERS.map((n) => n + " " + px[n]).join(", ");
const evLine = (ev) => ev.map((e) => e.kind + ":" + e.layer).join(", ") || "none";
const table = [];

const waitRest = async (ms = 25000) => {
  const deadline = Date.now() + ms;
  for (;;) {
    if (!(await j("window.__glr.busy()").catch(() => true))) return true;
    if (Date.now() > deadline) return false;
    await sleep(120);
  }
};

const waitRestored = async (names, ms = 8000) => {
  const deadline = Date.now() + ms;
  for (;;) {
    const flags = await j("window.__glr.lostFlags()");
    if (names.every((n) => flags[n] === false)) return true;
    if (Date.now() > deadline) return false;
    await sleep(80);
  }
};

try {
  for (let i = 0; i < 300; i++) {
    if (await j("!!(window.__vg && __vg.renderer && __vg.demo)").catch(() => false)) break;
    await sleep(100);
  }
  if (!(await j("!!window.__vg"))) {
    throw new Error("the page never mounted (" + (p.firstError() || "no page error") + ")");
  }
  await waitRest();
  await j(DRIVER);
  const seed = await j('window.__glr.seed(' + JSON.stringify(arg("query", "a")) + ')');
  await waitRest();
  await sleep(400);

  /* -- 1: the disc as it stands --------------------------------------------- */
  console.log("=== 1: baseline ===");
  const base = await j("window.__glr.paint()");
  const baseState = await j("window.__glr.state()");
  const baseLost = await j("window.__glr.lostFlags()");
  console.log("  " + show(base));
  check(LAYERS.every((n) => baseLost[n] === false), "all three contexts are live",
        LAYERS.map((n) => n + " lost=" + baseLost[n]).join(", "));
  check(LAYERS.every((n) => base[n] > PAINT_FLOOR), "all three layers are painting",
        show(base) + "; " + seed.highlighted + " notes highlighted, selected " + seed.id);
  check((await j("window.__glr.notice()")).hidden === true, "nothing is being said yet");

  /* -- 2: each layer on its own, at rest ------------------------------------ */
  for (const layer of LAYERS) {
    console.log("\n=== 2." + (LAYERS.indexOf(layer) + 1) + ": " + layer + " is lost, at rest ===");
    await j("window.__glr.arm()");
    await j("window.__glr.lose(" + JSON.stringify([layer]) + ")");
    await sleep(250);
    const evLost = await j("window.__glr.events");
    const during = await j("window.__glr.paint()");
    const noticeDuring = await j("window.__glr.notice()");
    console.log("  during: " + show(during));
    check(evLost.some((e) => e.kind === "lost" && e.layer === layer && e.prevented),
          "the " + layer + " loss event is prevented", evLine(evLost));
    check(evLost.some((e) => e.kind === "engineLost" && e.layer === layer),
          "the engine reports " + layer + " lost");
    check(during[layer] === 0, "the " + layer + " layer draws nothing while it is gone",
          layer + " " + during[layer] + " px");
    check(LAYERS.filter((n) => n !== layer).every((n) => during[n] === base[n]),
          "the other two layers draw exactly what they drew before", show(during));
    check(noticeDuring.hidden === false && /restoring/i.test(noticeDuring.text),
          "the page says a layer went", JSON.stringify(noticeDuring.text));

    await j("window.__glr.arm()");
    await j("window.__glr.restore(" + JSON.stringify([layer]) + ")");
    const came = await waitRestored([layer]);
    await sleep(200);
    const after = await j("window.__glr.paint()");
    const evBack = await j("window.__glr.events");
    const nowState = await j("window.__glr.state()");
    const noticeAfter = await j("window.__glr.notice()");
    console.log("  after:  " + show(after));
    table.push({ what: layer + ", at rest", during, after });
    check(came && evBack.some((e) => e.kind === "engineRestored" && e.layer === layer),
          "the engine rebuilds " + layer + " on restoration", evLine(evBack));
    check(after[layer] === base[layer] && base[layer] > PAINT_FLOOR,
          "the " + layer + " layer draws its own picture again, to the pixel",
          base[layer] + " -> " + during[layer] + " -> " + after[layer] + " px");
    check(await j("window.__glr.sameContexts()"),
          "the restored context is the same object, so no canvas was replaced");
    check(JSON.stringify(nowState) === JSON.stringify(baseState),
          "camera, selection and pins are untouched",
          "ratio " + nowState.camera.ratio + ", selected " + nowState.selected +
          ", pinned " + nowState.pinned.length);
    check(noticeAfter.hidden === true, "the page stops saying it", JSON.stringify(noticeAfter.text));
  }

  /* -- 3: all three at once ------------------------------------------------- */
  console.log("\n=== 3: all three lost at once ===");
  await j("window.__glr.arm()");
  await j("window.__glr.lose(" + JSON.stringify(LAYERS) + ")");
  await sleep(250);
  const allDuring = await j("window.__glr.paint()");
  const allNotice = await j("window.__glr.notice()");
  console.log("  during: " + show(allDuring));
  check(LAYERS.every((n) => allDuring[n] === 0), "the disc is blank", show(allDuring));
  check(allNotice.hidden === false && /3 graphics layers were lost/.test(allNotice.text),
        "the page counts all three", JSON.stringify(allNotice.text));
  await j("window.__glr.arm()");
  await j("window.__glr.restore(" + JSON.stringify(LAYERS) + ")");
  const allBack = await waitRestored(LAYERS);
  await sleep(250);
  const allAfter = await j("window.__glr.paint()");
  const allState = await j("window.__glr.state()");
  console.log("  after:  " + show(allAfter));
  table.push({ what: "all three, at rest", during: allDuring, after: allAfter });
  check(allBack && LAYERS.every((n) => allAfter[n] === base[n]), "all three draw again",
        show(allAfter));
  check(JSON.stringify(allState) === JSON.stringify(baseState),
        "camera, selection and pins survived all three going at once");
  check((await j("window.__glr.notice()")).hidden === true, "the page stops saying it");

  /* -- 4: lost while the cascade is walking --------------------------------- */
  console.log("\n=== 4: all three lost mid-cascade ===");
  await j("window.__glr.arm()");
  await j("(function(){ __vg.cascade(null, {}); return true; })()");
  await sleep(350);
  const walking = await j("window.__glr.busy()");
  await j("window.__glr.lose(" + JSON.stringify(LAYERS) + ")");
  await sleep(200);
  const midDuring = await j("window.__glr.paint()");
  await j("window.__glr.restore(" + JSON.stringify(LAYERS) + ")");
  const midBack = await waitRestored(LAYERS);
  const landed = await waitRest();
  await sleep(250);
  const midAfter = await j("window.__glr.paint()");
  console.log("  during: " + show(midDuring) + "\n  after:  " + show(midAfter));
  table.push({ what: "all three, mid-cascade", during: midDuring, after: midAfter });
  check(walking, "the cascade was actually walking when the contexts went");
  check(LAYERS.every((n) => midDuring[n] === 0), "the disc is blank mid-cascade", show(midDuring));
  check(midBack && landed, "the contexts came back and the cascade landed");
  check(LAYERS.every((n) => midAfter[n] >= Math.max(PAINT_FLOOR, base[n] * 0.9)),
        "the settled disc draws again", show(midAfter) + " against a baseline of " + show(base));

  /* -- 5: a loss nobody comes back from ------------------------------------- */
  console.log("\n=== 5: no restore arrives ===");
  await j("window.__glr.arm()");
  await j("window.__glr.lose(" + JSON.stringify(["nodes"]) + ")");
  await sleep(STALL_WAIT_MS);
  const stalled = await j("window.__glr.notice()");
  check(stalled.hidden === false && /has not come back/.test(stalled.text),
        "the page stops promising a recovery it has not had", JSON.stringify(stalled.text));
  await j("window.__glr.restore(" + JSON.stringify(["nodes"]) + ")");
  await waitRestored(["nodes"]);
  await sleep(250);
  const lateAfter = await j("window.__glr.paint()");
  check(lateAfter.nodes >= base.nodes * 0.9, "a late restore still rebuilds the layer",
        "nodes " + lateAfter.nodes + " px against a baseline of " + base.nodes);
  check((await j("window.__glr.notice()")).hidden === true, "and the page goes quiet");

  /* -- 6: a partial restore does not un-say what stands ---------------------- */
  console.log("\n=== 6: one of three comes back after the wait ===");
  // github#144 -- its own baseline: scenario 4 replayed the cascade
  const base6 = await j("window.__glr.paint()");
  await j("window.__glr.arm()");
  await j("window.__glr.lose(" + JSON.stringify(LAYERS) + ")");
  await sleep(STALL_WAIT_MS);
  const threeStalled = await j("window.__glr.notice()");
  check(/3 graphics layers were lost and have not come back/.test(threeStalled.text),
        "three gone and none back reads as three", JSON.stringify(threeStalled.text));
  await j("window.__glr.restore(" + JSON.stringify(["edges"]) + ")");
  await waitRestored(["edges"]);
  await sleep(300);
  const partial = await j("window.__glr.notice()");
  check(/2 graphics layers were lost and have not come back/.test(partial.text),
        "one back is no promise about the other two", JSON.stringify(partial.text));
  const partialPaint = await j("window.__glr.paint()");
  check(partialPaint.edges === base6.edges && partialPaint.nodes === 0 &&
        partialPaint.hoverNodes === 0,
        "and the layer that came back is the only one drawing", show(partialPaint));
  await j("window.__glr.restore(" + JSON.stringify(["nodes", "hoverNodes"]) + ")");
  await waitRestored(LAYERS);
  await sleep(300);
  const endPaint = await j("window.__glr.paint()");
  check((await j("window.__glr.notice()")).hidden === true && endPaint.nodes === base6.nodes,
        "the last two back clears it", show(endPaint));

  /* -- the table ------------------------------------------------------------ */
  console.log("\n| scenario | " + LAYERS.join(" | ") + " |");
  console.log("|---|" + LAYERS.map(() => "---|").join(""));
  console.log("| baseline | " + LAYERS.map((n) => base[n]).join(" | ") + " |");
  for (const row of table) {
    console.log("| " + row.what + ", lost | " + LAYERS.map((n) => row.during[n]).join(" | ") + " |");
    console.log("| " + row.what + ", restored | " + LAYERS.map((n) => row.after[n]).join(" | ") + " |");
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + (failed.length ? failed.length + " of " + results.length + " FAILED"
                                    : results.length + "/" + results.length + " pass"));
  if (failed.length) process.exitCode = 1;
} finally {
  try { await p.close(); } catch { void 0; }
  try { chrome.kill(); } catch { void 0; }
  await sleep(300);
  if (KEEP) console.log("\nkept: " + scratch.join(", "));
  else for (const d of scratch) rmSync(d, { recursive: true, force: true });
}
