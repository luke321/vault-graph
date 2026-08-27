// Drive the page's demo storyboard with REAL input, over CDP.
//
//   node scripts/demo.mjs                     # attach to Chrome on 9222
//   node scripts/demo.mjs --port 9223
//   node scripts/demo.mjs --slow 1.5          # stretch every move and dwell
//   node scripts/demo.mjs --act timeline      # just one act, not the whole storyboard
//
// The storyboard lives in the page (`__vg.demo.storyboard()`), so adding a beat means
// editing `demoMode()` in src/page.js and nothing here. This file only knows how to
// perform three verbs and how to wait.
//
// --act NAME plays `__vg.demo.act(NAME)` instead of the full storyboard -- one of the
// `act:` tags demoMode()'s own beats carry (intro, note, pin, compactaxis, timeline,
// heatmap, folders, subfolders, subfoldercolor, camera, colours). Same driver, same
// verbs; only which beats it gets differs.
//
// WHY CDP AND NOT el.click(): a dispatched click skips hit-testing, so an in-page demo
// keeps passing after the button it aims at has become covered, scrolled away or 0x0.
// Input.dispatchMouseEvent goes in at the top of the same pipeline a mouse does -- it
// hit-tests, it raises the hover states the page draws for real, and it fails when a
// real click would fail. That is the entire point of demonstrating something.
//
// CDP input does not move the operating system's cursor -- it is delivered straight to
// the renderer -- so a recording of a CDP-driven demo would show every effect and no
// arrow without help. The driver always draws one INSIDE THE PAGE (see demoCursorAt in
// page.js) and moves it by eval from this same loop, in the same coordinates dispatched
// to CDP. Unconditional, not a flag: there is no reason left to leave it off, and one
// fewer thing to remember to pass.
//
// NOT the real OS pointer -- that was the first version (scripts/cursor.ps1,
// SetCursorPos) and it worked for clicks and broke on drags. Windows delivers real
// input for wherever the OS pointer physically sits regardless of which process put it
// there, so moving the real cursor is a SECOND, genuinely native mouse-event stream
// landing in the same window as the CDP-injected one -- and the two disagree on
// `buttons`: real hardware reports none pressed, while CDP's dispatched drag says 1.
// bindNodeDrag's own "the button came up outside the window" safety check -- there for
// the real case of a person's drag actually leaving the tab -- read the native stream's
// buttons:0 as exactly that, dropped the note mid-glide, and let sigma's default panning
// take over for the rest of the gesture. Measured: every CDP-only take pinned correctly;
// every take with the real cursor on did not. A page element never touches the OS
// pointer and generates no second stream, so there is nothing left to misread.

import { attach } from "./cdp.mjs";

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const PORT = Number(arg("port", 9222));
const SLOW = Number(arg("slow", 1));
const MATCH = arg("match", "");
const ACT = arg("act", "");

const MOVE_MS = 413 * SLOW;    // how long a glide across the page takes -- 620 read as
                                // sluggish on camera; 50% faster (620 / 1.5)
const DWELL_MS = 420 * SLOW;   // pause on a control before clicking, for the viewer
const STEP_MS = 16;            // ~60fps of pointer positions
const SETTLE_QUIET_MS = 250;   // busy must stay false this long before we believe it
const SETTLE_CAP_MS = 30000;   // a genuinely stuck page, not a slow one

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

let at = { x: 0, y: 0 };

// AWAITED, not fire-and-forget. The first version did not wait for this, on the theory
// that a dropped or delayed cosmetic update is invisible on camera -- which is true, but
// missed that the eval and the drag's own Input.dispatchMouseEvent share one WebSocket
// with no ordering guarantee between them. An un-awaited eval could still be in flight
// (or reordered against) the next move, and interleaved with a NODE drag specifically --
// which reads `buttons` and a live drop target on every intervening move -- that was
// enough to lose track of the gesture mid-glide and hand it to sigma's default panning.
// Measured: the exact same failure with the real OS pointer removed and only these calls
// added back in. Sequencing it costs a small round trip per step; that is cheaper than a
// drag that silently does not land.
async function cursorTo(page, x, y) {
  await page.eval(`__vg.demo.cursorAt(${Math.round(x)}, ${Math.round(y)})`).catch(() => {});
}

function cursorHide(page) {
  page.eval("__vg.demo.cursorHide()").catch(() => {});
}

async function moveTo(page, x, y) {
  const x0 = at.x, y0 = at.y;
  const steps = Math.max(1, Math.round(MOVE_MS / STEP_MS));
  for (let i = 1; i <= steps; i++) {
    const e = ease(i / steps);
    const cx = Math.round(x0 + (x - x0) * e), cy = Math.round(y0 + (y - y0) * e);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy, buttons: 0 });
    await cursorTo(page, cx, cy);
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

// Chrome raises a native `contextmenu` off a right mouseReleased the same way a real
// right-click does, and that is the event sigma's rightClickNode listens for -- so this
// is `click` with the other button, not a different pipeline.
async function rightClick(page, x, y) {
  const base = { x, y, button: "right", buttons: 2, clickCount: 1 };
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
  await sleep(60);
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base, buttons: 0 });
}

async function doubleClick(page, x, y) {
  for (const clickCount of [1, 2]) {
    const base = { x, y, button: "left", buttons: 1, clickCount };
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
    await sleep(40);
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base, buttons: 0 });
    await sleep(40);
  }
}

/**
 * Press, glide, release -- with the button HELD the whole way.
 *
 * Not moveTo followed by a click: a drag is a different gesture and the page can tell. The
 * ribbon's brush and the disc's pan both read `buttons` on every move, and a sequence of
 * button-up moves between a press and a release is a press and a release with nothing in
 * between. Eased and paced like moveTo so it looks like a hand on camera, and the cursor
 * overlay is driven with it so it sees the same path.
 */
async function drag(page, x0, y0, x1, y1) {
  const steps = Math.max(6, Math.round(MOVE_MS / STEP_MS));
  await page.send("Input.dispatchMouseEvent",
    { type: "mousePressed", x: x0, y: y0, button: "left", buttons: 1, clickCount: 1 });
  await sleep(90);
  for (let i = 1; i <= steps; i++) {
    const e = ease(i / steps);
    const cx = Math.round(x0 + (x1 - x0) * e), cy = Math.round(y0 + (y1 - y0) * e);
    await page.send("Input.dispatchMouseEvent",
      { type: "mouseMoved", x: cx, y: cy, button: "left", buttons: 1 });
    await cursorTo(page, cx, cy);
    await sleep(STEP_MS);
  }
  // FLUSH THE MOVE QUEUE before releasing. Dragging a graph NODE (as opposed to a DOM
  // handle like the ribbon's brush) forces a layout read and a re-render on every one of
  // these moves, and firing them 16ms apart can outrun that: the release then races a
  // backlog of still-queued moves and can win, landing on a STALE mid-glide position
  // instead of where the cursor visibly ended up -- measured as a drag into the hub that
  // looked right on camera and did not pin. A round-trip eval only returns once every
  // input command dispatched ahead of it has reached the renderer's own task queue, which
  // makes it a real flush rather than a guessed extra delay.
  await page.eval("1").catch(() => {});
  await sleep(150);
  await page.send("Input.dispatchMouseEvent",
    { type: "mouseReleased", x: x1, y: y1, button: "left", buttons: 0, clickCount: 1 });
  at = { x: x1, y: y1 };
}

/**
 * Wheel notches, one at a time with a beat between them.
 *
 * Sigma animates each notch over zoomDuration, so firing them back to back would show one
 * blurred move instead of the steps a person would see. Positive n zooms in.
 */
async function wheel(page, x, y, n) {
  const dir = n < 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(n); i++) {
    await page.send("Input.dispatchMouseEvent",
      { type: "mouseWheel", x, y, deltaX: 0, deltaY: dir * 120 });
    await sleep(170);
  }
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

  const storyboard = ACT
    ? JSON.parse(await page.eval(`JSON.stringify(__vg.demo.act(${JSON.stringify(ACT)}))`))
    : JSON.parse(await page.eval("JSON.stringify(__vg.demo.storyboard())"));
  if (ACT && !storyboard.length) throw new Error(`--act ${ACT} matched no beats -- see the page's own console warning`);
  console.log(`[${el()}] storyboard: ${storyboard.length} beats${ACT ? ` (act: ${ACT})` : ""}`);

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
  console.log(`[${el()}] drawing the demo cursor in-page`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, buttons: 0 });
  await cursorTo(page, at.x, at.y);
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
    // Verbs that act on a target the page resolves for us. Everything below shares the
    // "find it, glide to it, then do the thing" shape; only the thing differs.
    if (beat.click || beat.hover || beat.dblclick || beat.drag || beat.wheel || beat.rightclick) {
      const w = await where(page, beat.target);
      if (!w) {
        console.warn(`${n} ! target ${JSON.stringify(beat.target)} not found — skipping`);
        trace.push(`missing: ${JSON.stringify(beat.target)}`);
        continue;
      }
      if (beat.drag) {
        // Either a fixed [dx, dy] offset (the brush handles, the camera drags -- targets
        // whose destination is a distance from where they start), or a second target the
        // page resolves the same way as the first (pinning a note by dragging it into the
        // hub: the hub's screen position is a build-time unknown, but the page can still
        // answer where its own hole is right now).
        let dx, dy, dstLabel = "";
        if (Array.isArray(beat.drag)) { [dx, dy] = beat.drag; }
        else {
          const w2 = await where(page, beat.to);
          if (!w2) {
            console.warn(`${n} ! drag target ${JSON.stringify(beat.to)} not found — skipping`);
            trace.push(`missing: ${JSON.stringify(beat.to)}`);
            continue;
          }
          dx = w2.x - w.x; dy = w2.y - w.y; dstLabel = ` to ${w2.label}`;
        }
        console.log(`[${el()}] ${n} drag ${w.label} from ${w.x},${w.y} by ${dx},${dy}${dstLabel} — ${beat.why || ""}`);
        await moveTo(page, w.x, w.y);
        await sleep(DWELL_MS);
        // RE-RESOLVED RIGHT BEFORE THE PRESS, not reused from the top of the beat. A note
        // is a much smaller target than the hub it is heading for, and under real load --
        // ffmpeg's gdigrab competing for the same CPU the renderer needs -- the ~1s of
        // moveTo + dwell between the first resolve and the press is enough for a
        // still-settling disc to drift the note off of it: measured,
        // the press missed the note entirely and sigma's OWN default took over, panning
        // the camera instead of dragging anything. Re-resolving here shrinks that window
        // to milliseconds; a corrective micro-move only fires if the note actually moved.
        let press = w;
        if (w.expect) {
          const fresh = await where(page, beat.target);
          if (fresh && (fresh.x !== w.x || fresh.y !== w.y)) {
            await moveTo(page, fresh.x, fresh.y);
            press = fresh;
          }
          const gotHover = await page.eval("JSON.stringify(__vg.demo.hovered())");
          const hit = gotHover && JSON.parse(gotHover);
          if (hit !== w.expect) {
            console.warn(`  ! aiming to drag ${w.expect} but hovered ${hit} — the press may miss`);
          }
        }
        await drag(page, press.x, press.y, press.x + dx, press.y + dy);
        // Verified, not assumed -- same reasoning as the hover/click `expect` check above.
        // Only meaningful for a note dragged at a second target (the hub): the app's own
        // pinned list says whether the drop actually registered, which the drag itself
        // cannot report since it never reads the app's state, only dispatches input.
        if (w.expect && !Array.isArray(beat.drag)) {
          const pinned = JSON.parse(await page.eval("JSON.stringify(__vg.state.pinned)"));
          if (pinned.indexOf(w.expect) < 0) {
            console.warn(`  ! dragged ${w.expect} but it is not pinned afterward — the drop missed the hub`);
            trace.push(`MISSED: ${JSON.stringify(beat.target)}`);
          }
        }
        trace.push(`drag: ${w.label} by ${dx},${dy}${dstLabel}`);
        continue;
      }
      if (beat.rightclick) {
        console.log(`[${el()}] ${n} right-click ${w.label} at ${w.x},${w.y} — ${beat.why || ""}`);
        await moveTo(page, w.x, w.y);
        await sleep(DWELL_MS);
        await rightClick(page, w.x, w.y);
        trace.push(`rightclick: ${w.label}`);
        continue;
      }
      if (beat.wheel) {
        console.log(`[${el()}] ${n} wheel ${beat.wheel > 0 ? "in" : "out"} x${Math.abs(beat.wheel)} ` +
                    `over ${w.label} — ${beat.why || ""}`);
        await moveTo(page, w.x, w.y);
        await sleep(DWELL_MS);
        await wheel(page, w.x, w.y, beat.wheel);
        trace.push(`wheel: ${w.label} ${beat.wheel}`);
        continue;
      }
      if (beat.dblclick) {
        console.log(`[${el()}] ${n} double-click ${w.label} at ${w.x},${w.y} — ${beat.why || ""}`);
        await moveTo(page, w.x, w.y);
        await sleep(DWELL_MS);
        await doubleClick(page, w.x, w.y);
        trace.push(`dblclick: ${w.label}`);
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
  cursorHide(page);
  page.close();
}

main().catch((e) => {
  console.error("demo failed:", e.message);
  process.exit(1);
});
