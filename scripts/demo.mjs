
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

const MOVE_MS = 413 * SLOW;
const DWELL_MS = 420 * SLOW;
const STEP_MS = 16;
const SETTLE_QUIET_MS = 250;
const SETTLE_CAP_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

let at = { x: 0, y: 0 };

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
  await page.eval("1").catch(() => {});
  await sleep(150);
  await page.send("Input.dispatchMouseEvent",
    { type: "mouseReleased", x: x1, y: y1, button: "left", buttons: 0, clickCount: 1 });
  at = { x: x1, y: y1 };
}

async function wheel(page, x, y, n) {
  const dir = n < 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(n); i++) {
    await page.send("Input.dispatchMouseEvent",
      { type: "mouseWheel", x, y, deltaX: 0, deltaY: dir * 120 });
    await sleep(170);
  }
}

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

  const vp = JSON.parse(await page.eval("JSON.stringify([innerWidth,innerHeight])"));
  const candidates = [
    [18, Math.round(vp[1] - 18)],
    [Math.round(vp[0] - 24), Math.round(vp[1] - 24)],
    [Math.round(vp[0] - 24), Math.round(vp[1] * 0.5)],
    [Math.round(vp[0] * 0.62), Math.round(vp[1] * 0.55)]
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
    if (beat.park) {
      console.log(`[${el()}] ${n} park — ${beat.why || ""}`);
      await moveTo(page, parkAt.x, parkAt.y);
      trace.push(`park: ${beat.why || ""}`);
      continue;
    }
    if (beat.click || beat.hover || beat.dblclick || beat.drag || beat.wheel || beat.rightclick) {
      const w = await where(page, beat.target);
      if (!w) {
        console.warn(`${n} ! target ${JSON.stringify(beat.target)} not found — skipping`);
        trace.push(`missing: ${JSON.stringify(beat.target)}`);
        continue;
      }
      if (beat.drag) {
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
