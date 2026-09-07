// github#73 -- see .ai-context/mobile-harness.md
// decisions/0007 -- gestures go through CDP, never el.click()

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { attach } from "./cdp.mjs";
import { leftmostScreen } from "./screen.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const arg = (k, d = "") => {
  const i = process.argv.indexOf("--" + k);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1] : d;
};
const flag = (k) => process.argv.includes("--" + k);

const DEVICES = {
  iphone14: { w: 390, h: 844, name: "iPhone 14" },
  iphonese: { w: 375, h: 667, name: "iPhone SE" },
  pixel7:   { w: 412, h: 915, name: "Pixel 7" },
  ipadmini: { w: 744, h: 1133, name: "iPad mini" },
  sidebar:  { w: 320, h: 900, name: "a 320px sidebar" },
  desktop:  { w: 1600, h: 1000, name: "desktop control", touch: false },
};

function findChrome() {
  const named = arg("chrome");
  if (named) return named;
  const guesses = [
    process.env["PROGRAMFILES"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["LOCALAPPDATA"] + "\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ];
  for (const g of guesses) if (g && existsSync(g)) return g;
  throw new Error("could not find Chrome; pass --chrome <path to chrome.exe>");
}

const freePort = () => new Promise((res, rej) => {
  const srv = createServer();
  srv.on("error", rej);
  srv.listen(0, "127.0.0.1", () => {
    const port = srv.address().port;
    srv.close(() => res(port));
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fixtureVault(want) {
  const dir = join(ROOT, ".fixtures");
  if (!existsSync(dir)) return "";
  const hit = readdirSync(dir).find((d) => d.startsWith(want + "-"));
  return hit ? join(dir, hit) : "";
}

async function fitViewport(p, w, h) {
  const { windowId } = await p.send("Browser.getWindowForTarget");
  let inner = await p.eval("[window.innerWidth, window.innerHeight]");
  for (let i = 0; i < 8; i++) {
    const dw = w - inner[0], dh = h - inner[1];
    if (dw === 0 && dh === 0) break;
    const b = (await p.send("Browser.getWindowBounds", { windowId })).bounds;
    await p.send("Browser.setWindowBounds", {
      windowId, bounds: { width: b.width + dw, height: b.height + dh },
    });
    await sleep(250);
    inner = await p.eval("[window.innerWidth, window.innerHeight]");
  }
  return { w: inner[0], h: inner[1] };
}

async function main() {
  const dev = DEVICES[arg("device", "iphone14")] || DEVICES.iphone14;
  const W = +arg("w", 0) || dev.w, H = +arg("h", 0) || dev.h;
  const touch = dev.touch !== false;
  const source = touch ? "touch" : "mouse";

  let url = arg("url", "");
  if (!url) {
    const vault = arg("vault", "") || fixtureVault("demo-vault");
    if (!vault) throw new Error("no vault: pass --vault, or generate the fixtures first");
    const out = join(mkdtempSync(join(tmpdir(), "vg-mobile-")), "vault-graph.html");
    const b = spawnSync(process.execPath,
      [join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", out],
      { encoding: "utf8" });
    if (b.status !== 0) throw new Error("build-graph.mjs failed:\n" + (b.stderr || b.stdout));
    url = pathToFileURL(out).href;
    console.log("built  " + out);
  }
  // github#73 -- ?rest leaves a state no phone reaches
  const bootUrl = flag("rest") ? url + (url.includes("?") ? "&" : "?") + "rest" : url;

  const PORT = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "vg-mobile-profile-"));
  const scr = leftmostScreen();
  const chrome = spawn(findChrome(), [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-component-update", "--disable-sync", "--mute-audio",
    "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    ...(touch ? ["--touch-events=enabled"] : []),
    `--window-position=${scr.x + 60},${scr.y + 60}`,
    `--window-size=${Math.min(scr.w, W + 20)},${Math.min(scr.h, H + 60)}`,
    `--app=${bootUrl}`,
  ], { stdio: ["ignore", "ignore", "ignore"] });

  const kill = () => { try { chrome.kill(); } catch { /* github#73 */ } };
  process.on("exit", () => { if (!flag("keep")) kill(); });

  let p = null;
  for (let i = 0; i < 60 && !p; i++) {
    try { p = await attach(PORT, "vault-graph"); } catch { await sleep(250); }
  }
  if (!p) { kill(); throw new Error("Chrome never offered the page on CDP"); }

  if (touch) {
    await p.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await p.send("Emulation.setUserAgentOverride", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
                 "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    }).catch(() => {});
  }

  for (let i = 0; i < 80; i++) {
    if (await p.eval("!!(window.__vg && __vg.renderer && __vg.graph)").catch(() => false)) break;
    await sleep(250);
  }

  // github#73 -- no metrics override; see the harness note
  const got = await fitViewport(p, W, H);
  let settled = false;
  for (let i = 0; i < 200 && !settled; i++) {
    settled = !(await p.eval("!!__vg.demo.busy()").catch(() => false));
    if (!settled) await sleep(150);
  }
  if (!settled) {
    console.log("  ! never settled, still busy: " +
                await p.eval("JSON.stringify(__vg.demo.busyWhy())").catch(() => "could not ask"));
  }
  await sleep(400);
  await p.eval("__vg.renderer.render(); void 0");

  const layout = await p.eval(
    "(function () {" +
    "  var box = function (id) {" +
    "    var el = document.getElementById(id); if (!el) return null;" +
    "    var r = el.getBoundingClientRect();" +
    "    return { w: Math.round(r.width), h: Math.round(r.height)," +
    "             x: Math.round(r.left), y: Math.round(r.top) };" +
    "  };" +
    "  var d = document.documentElement;" +
    "  var leg = document.getElementById('vg-legend');" +
    "  return { vw: d.clientWidth, vh: d.clientHeight," +
    "           overflowX: d.scrollWidth - d.clientWidth," +
    "           sidebar: box('vg-sidebar'), stage: box('vg-stage')," +
    "           heat: box('vg-heat'), canvas: box('vg-canvas'), graph: box('vg-graph')," +
    "           legendHidden: leg ? Math.max(0, leg.scrollHeight - leg.clientHeight) : null," +
    "           sidebarHidden: (function () { var sb = document.getElementById('vg-sidebar');" +
    "             return sb ? Math.max(0, sb.scrollHeight - sb.clientHeight) : null; })()," +
    "           groups: (function () { var g = document.getElementById('vg-gcount');" +
    "             return g ? (g.textContent || '').trim() : ''; })()," +
    "           dims: __vg.renderer.getDimensions() };" +
    "})()");

  const dots = await p.eval(
    "(function () {" +
    "  var R = __vg.renderer, G = __vg.graph, r = [];" +
    "  G.forEachNode(function (id) {" +
    "    var d = R.getNodeDisplayData(id);" +
    "    if (d && !d.hidden) r.push(R.scaleSize(d.size));" +
    "  });" +
    "  r.sort(function (a, b) { return a - b; });" +
    "  var q = function (f) { return r.length ? r[Math.min(r.length - 1, Math.floor(r.length * f))] : 0; };" +
    "  return { n: r.length, min: q(0), p50: q(0.5), max: r[r.length - 1] || 0," +
    "           under1: r.filter(function (v) { return v < 1; }).length," +
    "           under2: r.filter(function (v) { return v < 2; }).length };" +
    "})()");

  const cam = () => p.eval(
    "(function () { var c = __vg.renderer.getCamera().getState();" +
    " return { x: c.x, y: c.y, ratio: c.ratio }; })()");
  const same = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 &&
                         Math.abs(a.ratio - b.ratio) < 1e-6;
  const moved = (a, b) => same(a, b) ? "NOTHING MOVED"
    : `x ${(b.x - a.x).toFixed(4)}  y ${(b.y - a.y).toFixed(4)}  ratio ${(b.ratio / a.ratio).toFixed(3)}x`;

  const cx = Math.round(layout.graph ? layout.graph.x + layout.graph.w / 2 : W / 2);
  const cy = Math.round(layout.graph ? layout.graph.y + layout.graph.h / 2 : H / 2);

  const before = await cam();
  await p.send("Input.synthesizeScrollGesture",
    { x: cx, y: cy, xDistance: -80, yDistance: -80, gestureSourceType: source, speed: 800 })
    .catch((e) => console.log("  drag refused: " + e.message));
  await sleep(800);
  const afterDrag = await cam();

  await p.send("Input.synthesizePinchGesture",
    { x: cx, y: cy, scaleFactor: 2, gestureSourceType: source, relativeSpeed: 800 })
    .catch((e) => console.log("  pinch refused: " + e.message));
  await sleep(800);
  const afterPinch = await cam();

  const tap = await p.eval(
    "(function () {" +
    "  var R = __vg.renderer, G = __vg.graph, best = null, br = -1;" +
    "  var o = document.getElementById('vg-graph').getBoundingClientRect();" +
    "  G.forEachNode(function (id) {" +
    "    var d = R.getNodeDisplayData(id); if (!d || d.hidden) return;" +
    "    var r = R.scaleSize(d.size);" +
    "    if (r > br) {" +
    // github#73
    "      var v = R.graphToViewport(G.getNodeAttributes(id));" +
    "      br = r; best = { id: id, r: r, x: Math.round(v.x + o.left), y: Math.round(v.y + o.top) };" +
    "    }" +
    "  });" +
    "  return best;" +
    "})()");

  const atPoint = tap ? await p.eval(
    "(function () { var el = document.elementFromPoint(" + tap.x + ", " + tap.y + ");" +
    " return el ? el.tagName.toLowerCase() +" +
    "   (el.className ? '.' + String(el.className).split(' ').join('.') : '') : 'nothing'; })()")
    : "n/a";

  await p.eval(
    "(function () {" +
    "  window.__seen = [];" +
    "  var el = document.getElementById('vg-graph');" +
    "  ['mousedown','mouseup','click','pointerdown','touchstart','touchend']" +
    "    .forEach(function (t) { el.addEventListener(t, function () { window.__seen.push(t); }, true); });" +
    "  return true;" +
    "})()");
  const clear = () => p.eval("window.__seen = []; __vg.state.selected = null; __vg.state.hovered = null; void 0");
  const seen = () => p.eval("(window.__seen || []).join(',')");
  const taps = [];
  if (tap) {
    await clear();
    await p.send("Input.synthesizeTapGesture",
      { x: tap.x, y: tap.y, duration: 80, gestureSourceType: source })
      .catch((e) => console.log("  tap gesture refused: " + e.message));
    await sleep(900);
    taps.push(["gesture", await p.eval("__vg.state.selected || null"),
                          await p.eval("__vg.state.hovered || null"), await seen()]);

    await clear();
    if (touch) {
      await p.send("Input.dispatchTouchEvent",
        { type: "touchStart", touchPoints: [{ x: tap.x, y: tap.y, id: 1 }] }).catch(() => {});
      await sleep(80);
      await p.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {});
    } else {
      await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, buttons: 0 });
      await sleep(120);
      await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: tap.x, y: tap.y, buttons: 0 });
      await sleep(200);
      for (const type of ["mousePressed", "mouseReleased"]) {
        await p.send("Input.dispatchMouseEvent", {
          type, x: tap.x, y: tap.y, button: "left",
          buttons: type === "mousePressed" ? 1 : 0, clickCount: 1,
        }).catch(() => {});
      }
    }
    await sleep(900);
    taps.push(["injected", await p.eval("__vg.state.selected || null"),
                           await p.eval("__vg.state.hovered || null"), await seen()]);
  }

  const shot = arg("shot", "");
  if (shot) {
    const img = await p.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(shot, Buffer.from(img.data, "base64"));
  }

  const pad = (v, n) => String(v).padEnd(n);
  console.log("");
  console.log(`  ${dev.name}   asked ${W}x${H}, page has ${got.w}x${got.h}   ` +
              `input: ${source}   left screen ${scr.x},${scr.y} (${scr.w}x${scr.h})`);
  console.log(`  stage canvas ${Math.round(layout.dims.width)}x${Math.round(layout.dims.height)}`);
  console.log("");
  for (const k of ["sidebar", "stage", "heat", "canvas", "graph"]) {
    const b = layout[k];
    console.log("  " + pad("#vg-" + k, 12) +
                (b ? `${pad(b.w + "x" + b.h, 12)} at ${b.x},${b.y}` : "absent"));
  }
  console.log("");
  console.log(`  horizontal overflow      ${layout.overflowX} px`);
  console.log(`  legend rows              ${layout.groups}`);
  console.log(`  sidebar below the fold   ${layout.sidebarHidden} px`);
  console.log(`  dots drawn               ${dots.n}`);
  console.log(`  drawn radius min/p50/max ${dots.min.toFixed(2)} / ${dots.p50.toFixed(2)} / ${dots.max.toFixed(2)} px`);
  console.log(`  radius under 1 px        ${dots.under1} of ${dots.n}`);
  console.log(`  radius under 2 px        ${dots.under2} of ${dots.n}`);
  console.log("");
  console.log(`  one-finger drag          ${moved(before, afterDrag)}`);
  console.log(`  two-finger pinch         ${moved(afterDrag, afterPinch)}`);
  console.log(`  aimed at                 ${tap ? `note ${tap.id}, ${tap.r.toFixed(2)}px radius, at ${tap.x},${tap.y}` : "no dot found"}`);
  console.log(`  element under that point ${atPoint}`);
  for (const [how, sel, hov, evs] of taps) {
    console.log("  " + pad(`tap, ${how}`, 25).slice(0, 25) +
                (sel ? "selected " + sel : hov ? "hovered only: " + hov : "NOTHING SELECTED") +
                "   events: " + (evs || "none"));
  }
  if (!taps.length) console.log("  tap                      n/a");
  console.log(`  page errors              ${p.firstError() || "none"}`);
  if (shot) console.log(`  screenshot               ${shot}`);
  console.log("");

  if (flag("keep")) {
    console.log("  --keep: the browser is yours; close it when done.");
    return;
  }
  p.close();
  kill();
}

main().catch((e) => { console.error(String((e && e.stack) || e)); process.exit(1); });
