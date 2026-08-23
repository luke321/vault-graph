// Drive the page's demo storyboard with REAL input, over CDP.
//
//   node scripts/demo.mjs                     # attach to Chrome on 9222
//   node scripts/demo.mjs --port 9223
//   node scripts/demo.mjs --slow 1.5          # stretch every move and dwell
//
// The storyboard lives in the page (`__vg.demo.storyboard()`), so adding a beat means
// editing `demoMode()` in template.html and nothing here. This file only knows how to
// perform three verbs and how to wait.
//
// WHY CDP AND NOT el.click(): a dispatched click skips hit-testing, so an in-page demo
// keeps passing after the button it aims at has become covered, scrolled away or 0x0.
// Input.dispatchMouseEvent goes in at the top of the same pipeline a mouse does -- it
// hit-tests, it raises the hover states the page draws for real, and it fails when a
// real click would fail. That is the entire point of demonstrating something.
//
// CDP input does not move the operating system's cursor -- it is delivered straight to
// the renderer -- so a recording of a CDP-driven demo shows every effect and no arrow.
// `--cursor` fixes that by moving the REAL pointer alongside, through scripts/cursor.ps1,
// which gdigrab then draws. Off by default because it genuinely takes the mouse; the
// recorder turns it on.
//
// The two pointers cannot drift: both are driven from the same coordinates in the same
// loop. The clicks stay on CDP even with --cursor on, so input still hit-tests and still
// works whether or not the window has focus.

import { attach } from "./cdp.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const PORT = Number(arg("port", 9222));
const SLOW = Number(arg("slow", 1));
const MATCH = arg("match", "");
const CURSOR = argv.includes("--cursor");
const HERE = dirname(fileURLToPath(import.meta.url));

const MOVE_MS = 620 * SLOW;    // how long a glide across the page takes
const DWELL_MS = 420 * SLOW;   // pause on a control before clicking, for the viewer
const STEP_MS = 16;            // ~60fps of pointer positions
const SETTLE_QUIET_MS = 250;   // busy must stay false this long before we believe it
const SETTLE_CAP_MS = 30000;   // a genuinely stuck page, not a slow one

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

let at = { x: 0, y: 0 };

// One long-lived PowerShell process fed coordinates on stdin. Spawning one per position
// would cost ~80ms each against a 16ms step, so a glide would crawl.
let cursor = null;
let origin = null;      // page (0,0) in screen pixels, plus the device scale

function cursorStart() {
  if (!CURSOR) return;
  cursor = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass",
                                "-File", join(HERE, "cursor.ps1")],
                 { stdio: ["pipe", "inherit", "inherit"] });
  cursor.on("error", (e) => {
    console.warn(`  ! cursor helper failed (${e.message}); carrying on without it`);
    cursor = null;
  });
}

function cursorTo(x, y) {
  if (!cursor || !origin) return;
  const sx = Math.round((origin.x + x) * origin.dpr);
  const sy = Math.round((origin.y + y) * origin.dpr);
  try { cursor.stdin.write(`${sx} ${sy}\n`); } catch { cursor = null; }
}

function cursorStop() {
  if (!cursor) return;
  try { cursor.stdin.end(); } catch {}
  cursor = null;
}

// Where the page's (0,0) sits on screen. Asked of the page rather than computed from the
// window rect, because the page is the only thing that knows how much of its own window
// is browser chrome -- and with --app= that is a title bar and essentially no side
// border, which is why the horizontal inset is halved and subtracted from the vertical.
async function cursorOrigin(page) {
  const g = JSON.parse(await page.eval(`JSON.stringify({
    sx: window.screenX, sy: window.screenY,
    ow: window.outerWidth, oh: window.outerHeight,
    iw: window.innerWidth, ih: window.innerHeight,
    dpr: window.devicePixelRatio
  })`));
  const inset = Math.max(0, (g.ow - g.iw) / 2);
  return { x: g.sx + inset, y: g.sy + (g.oh - g.ih) - inset, dpr: g.dpr || 1 };
}

async function moveTo(page, x, y) {
  const x0 = at.x, y0 = at.y;
  const steps = Math.max(1, Math.round(MOVE_MS / STEP_MS));
  for (let i = 1; i <= steps; i++) {
    const e = ease(i / steps);
    const cx = Math.round(x0 + (x - x0) * e), cy = Math.round(y0 + (y - y0) * e);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy, buttons: 0 });
    cursorTo(cx, cy);
    await sleep(STEP_MS);
  }
  at = { x, y };
}

async function click(page, x, y) {
  const base = { x, y, button: "left", buttons: 1, clickCount: 1 };
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
  await sleep(60);
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base, buttons: 0 });
}

// Wait for the page to stop moving, by ASKING it -- never by sleeping a guessed
// duration. A fixed wait fires part-way through on a page too slow to finish in time,
// and the next beat then acts on a disc that is still animating. The quiet period
// matters because `busy` dips false for a frame between a cascade ending and the tween
// that follows it starting.
async function settle(page, label) {
  const t0 = Date.now();
  let quietSince = null;
  for (;;) {
    const busy = await page.eval("__vg.demo.busy()");
    if (busy) quietSince = null;
    else if (quietSince == null) quietSince = Date.now();
    else if (Date.now() - quietSince >= SETTLE_QUIET_MS) return true;
    if (Date.now() - t0 > SETTLE_CAP_MS) {
      console.warn(`  ! gave up waiting for ${label || "the page"} after ${SETTLE_CAP_MS}ms`);
      return false;
    }
    await sleep(50);
  }
}

async function where(page, target) {
  const [kind, a] = target;
  const w = await page.eval(`JSON.stringify(__vg.demo.where(${JSON.stringify(kind)},${JSON.stringify(a)}))`);
  return w ? JSON.parse(w) : null;
}

async function main() {
  // Elapsed-since-launch on every line. Not decoration: the recorder stops ffmpeg when
  // this process returns, so any second spent in here is a second of video, and a phase
  // that quietly costs 30s is invisible without a stamp on each step.
  const T0 = Date.now();
  const el = () => ((Date.now() - T0) / 1000).toFixed(2) + "s";

  const page = await attach(PORT, MATCH);
  console.log(`[${el()}] attached: ${page.target.url}`);
  await page.send("Runtime.enable").catch(() => {});

  const armed = await page.eval("!!(window.__vg && __vg.demo)");
  if (!armed) throw new Error("this page has no __vg.demo -- is it a vault-graph build?");

  const storyboard = JSON.parse(await page.eval("JSON.stringify(__vg.demo.storyboard())"));
  console.log(`[${el()}] storyboard: ${storyboard.length} beats`);

  // PARK THE POINTER SOMEWHERE THAT HOVERS NOTHING, and prove it rather than assume it.
  // The first version parked at 62% x 55% of the viewport to avoid 0,0 on the sidebar, and
  // overshot onto the disc: the recording opened with a note already lifted and labelled,
  // before the demo had pressed anything. Which is worse than the corner it was avoiding,
  // because it looks like the page did it by itself.
  //
  // The disc is inscribed in its container, so the container's corners and its right edge
  // at mid-height are outside it -- but "outside the disc" is a guess about a layout that
  // changes with the window, and the page can answer instead. Each candidate is tried and
  // kept only if nothing is hovered afterwards.
  const vp = JSON.parse(await page.eval("JSON.stringify([innerWidth,innerHeight])"));
  // Lower-left first: it is the corner nearest the first control the demo presses, so the
  // opening move is short and reads as deliberate rather than as a dash across the window.
  const candidates = [
    [18, Math.round(vp[1] - 18)],                            // bottom-left corner
    [Math.round(vp[0] - 24), Math.round(vp[1] - 24)],        // bottom-right corner
    [Math.round(vp[0] - 24), Math.round(vp[1] * 0.5)],       // right edge, mid-height
    [Math.round(vp[0] * 0.62), Math.round(vp[1] * 0.55)]     // the old spot, as a last resort
  ];
  at = candidates[candidates.length - 1];
  for (const [cx, cy] of candidates) {
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy, buttons: 0 });
    await sleep(160);
    const clean = await page.eval(
      `JSON.stringify((function(){
         var el = document.elementFromPoint(${cx}, ${cy});
         return { h: __vg.demo.hovered(),
                  // #vg-tip: the page prefixes its ids so it can mount inside Obsidian without
                  // colliding with the app DOM. With the old id this resolved to null and
                  // getComputedStyle threw, which the recorder reported as "demo failed"
                  // seven seconds into a take.
                  tip: getComputedStyle(document.getElementById('vg-tip')).display,
                  // A legend row lights up under the pointer. Harmless, but it is still
                  // the page appearing to react before the demo has done anything.
                  row: !!(el && el.closest && el.closest('.row, #vg-legend .lbl')) };
       })())`);
    const c = JSON.parse(clean);
    if (!c.h && c.tip === "none" && !c.row) { at = { x: cx, y: cy }; break; }
  }
  at = Array.isArray(at) ? { x: at[0], y: at[1] } : at;
  if (CURSOR) {
    origin = await cursorOrigin(page);
    cursorStart();
    console.log(`[${el()}] real cursor on — page origin at screen ${origin.x},${origin.y} (dpr ${origin.dpr})`);
  }
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, buttons: 0 });
  cursorTo(at.x, at.y);
  console.log(`[${el()}] pointer parked at ${at.x},${at.y}`);
  // Kept, so a {park} beat can send the pointer back to the one position this run has
  // already PROVEN hovers nothing.
  const parkAt = { x: at.x, y: at.y };

  const t0 = Date.now();
  const trace = [];
  for (const [i, beat] of storyboard.entries()) {
    const n = `${i + 1}/${storyboard.length}`;
    if (beat.settle) {
      console.log(`[${el()}] ${n} settle — ${beat.why || ""}`);
      await settle(page, beat.why);
      console.log(`[${el()}] ${n} settled`);
      trace.push(`settle: ${beat.why || ""}`);
      continue;
    }
    // {park} -- get the pointer out of the way, so a take does not END on whatever the
    // last click happened to leave under it. Worth a verb of its own because the position
    // is the vetted one from startup, not a guess.
    if (beat.park) {
      console.log(`[${el()}] ${n} park — ${beat.why || ""}`);
      await moveTo(page, parkAt.x, parkAt.y);
      trace.push(`park: ${beat.why || ""}`);
      continue;
    }
    if (beat.click || beat.hover) {
      const w = await where(page, beat.target);
      if (!w) {
        console.warn(`${n} ! target ${JSON.stringify(beat.target)} not found — skipping`);
        trace.push(`missing: ${JSON.stringify(beat.target)}`);
        continue;
      }
      console.log(`[${el()}] ${n} ${beat.click ? "click" : "hover"} ${w.label} at ${w.x},${w.y} — ${beat.why || ""}`);
      await moveTo(page, w.x, w.y);
      await sleep(DWELL_MS);
      // A hover target may name the node it expects. Verified rather than assumed:
      // aiming at a dot is only as good as the hit-test agreeing, and a silent miss puts
      // a note the storyboard never chose -- and its NAME -- on camera.
      if (w.expect) {
        const got = await page.eval("JSON.stringify(__vg.demo.hovered())");
        const hit = got && JSON.parse(got);
        if (hit !== w.expect) {
          console.warn(`  ! aimed at ${w.expect} but hovered ${hit} — the target was not isolated enough`);
          trace.push(`MISSED: ${beat.target.join(" ")}`);
        }
      }
      if (beat.click) await click(page, w.x, w.y);
      trace.push(`${beat.click ? "click" : "hover"}: ${w.label}`);
      continue;
    }
    console.warn(`${n} ! unknown beat ${JSON.stringify(beat)}`);
  }

  const ms = Date.now() - t0;
  await page.eval(`__vg.demo.finish(${ms}, ${JSON.stringify(trace)})`);
  console.log(`[${el()}] done — beats took ${ms}ms, process ${el()} total`);
  cursorStop();
  page.close();
}

main().catch((e) => {
  console.error("demo failed:", e.message);
  cursorStop();
  process.exit(1);
});
