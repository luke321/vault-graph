// Run every invariant this project can check automatically, against a real built page.
//
//   node scripts/smoke.mjs                    # build, then check
//   node scripts/smoke.mjs --url http://127.0.0.1:8765/
//   node scripts/smoke.mjs --headed           # watch it happen
//   node scripts/smoke.mjs --port 9333
//
// Exits 0 if everything passes, 1 otherwise, so it can gate a push.
//
// WHY THIS EXISTS. The documented failure mode of this repo is reasoning about the code
// instead of measuring it -- see .ai-context/README.md. Every invariant in
// .ai-context/invariants.md already carries the one-line command that checks it; until
// now running them was something a person had to remember to do, one at a time, in a
// console. This is those commands in one place.
//
// WHAT IT DOES NOT COVER, so a green run is not mistaken for proof:
//   * "No jump at the end of an animation" -- __vg.probe/probeReport measure per-FRAME
//     steps, and frame pacing under automation is not the frame pacing a person gets.
//     Toggle a folder by hand and read probeReport().
//   * Anything about how it LOOKS. Colour, spacing and legibility are decided by
//     looking; this only asserts the things with numbers.

import { attach } from "./cdp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
// Repeatable, and comma-splitting, so `--vault a --vault b` and `--vault a,b` both work.
const argAll = (n) => {
  const out = [];
  argv.forEach((a, i) => {
    if (a === "--" + n && argv[i + 1]) out.push(...argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean));
  });
  return out;
};
const PORT = Number(arg("port", 9333));      // not 9222: do not fight a debug session
const HEADED = argv.includes("--headed");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ chrome */

function findChrome() {
  const named = arg("chrome", "");
  if (named) return named;
  const guesses = [
    process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"
  ];
  for (const g of guesses) if (g && existsSync(g)) return g;
  throw new Error("Chrome not found; pass --chrome <path>");
}

/* -------------------------------------------------------------- the checks */

// A check is a name and a function returning {ok, detail}. Each one MEASURES and reports
// the number it measured, pass or fail -- a check that only says "ok" teaches nothing the
// next time it breaks.
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check("page loads with no console errors", async (p, ctx) => {
  return { ok: ctx.errors.length === 0, detail: ctx.errors.length ? ctx.errors.join(" | ") : "none" };
});

check("__vg is present and the intro landed", async (p) => {
  const r = await p.j(`{hasVg: !!window.__vg, until: __vg.state.until, notes: __vg.graph.order}`);
  return { ok: r.hasVg && r.until === null, detail: `${r.notes} notes, until=${r.until}` };
});

check("legend opens folded to top-level folders", async (p) => {
  const r = await p.j(`{
    rows: document.querySelectorAll('#vg-legend .lgr').length,
    subs: document.querySelectorAll('#vg-legend .lgs').length,
    groups: (__vg.state.dim, Object.keys(__vg.state.collapsed).length)
  }`);
  return { ok: r.subs === 0 && r.rows > 0, detail: `${r.rows} rows, ${r.subs} subfolder rows` };
});

check("nav counts share one right edge", async (p) => {
  const edges = async () => p.j(`(function(){
    var xs = [].map.call(document.querySelectorAll('#vg-legend .ct'),
      function(e){return Math.round(e.getBoundingClientRect().right);});
    return {n: xs.length, distinct: Array.from(new Set(xs))};
  })()`);
  const folded = await edges();
  // ...and again with the tree OPENED, since grid columns align only within one grid and
  // every row is its own: the alignment comes from a fixed width, so depth must not matter.
  //
  // Unfolded by clicking each twisty, and nothing else. A first version also cleared
  // state.collapsed first -- which does not re-render, so the clicks then TOGGLED the
  // groups shut and this measured the folded tree twice while reporting that it had
  // checked both. Hence the row-count assertion below: a check that cannot tell whether
  // it did anything is worse than no check.
  await p.eval(`(function(){ var b = document.querySelectorAll('#vg-legend [data-tw]');
                for (var i = 0; i < b.length; i++) b[i].click(); })(); void 0`);
  await sleep(300);
  const open = await edges();
  const ok = folded.distinct.length === 1 && open.distinct.length === 1 && open.n > folded.n;
  return { ok, detail: `folded ${folded.n} counts / ${folded.distinct.length} edge, ` +
                       `open ${open.n} counts / ${open.distinct.length} edge` +
                       (open.n > folded.n ? "" : "  <- the tree never opened") };
});

check("every heatmap day with notes fills its cell", async (p) => {
  const r = await p.j(`(function(){
    var h = __vg.heat, cv = document.getElementById('vg-heatc'), ctx = cv.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var at = function(x,y){ var q = ctx.getImageData(Math.round(x*dpr), Math.round(y*dpr),1,1).data;
                            return q[0]+','+q[1]+','+q[2]; };
    var dim = null;
    h.keys.forEach(function(k){ var d=h.days[k];
      if (d.n <= 0.004 && !dim) dim = at(18+d.col*h.pitch+h.cell/2, 12+d.row*h.pitch+h.cell/2); });
    var withNotes = 0, notFull = 0;
    h.keys.forEach(function(k){ var d=h.days[k]; if (d.n <= 0.004) return; withNotes++;
      var x = 18+d.col*h.pitch, y = 12+d.row*h.pitch, c = h.cell;
      if ([at(x+2,y+2), at(x+c-3,y+2), at(x+2,y+c-3), at(x+c-3,y+c-3)].indexOf(dim) >= 0) notFull++; });
    return {withNotes: withNotes, notFull: notFull};
  })()`);
  return { ok: r.notFull === 0 && r.withNotes > 0,
           detail: `${r.withNotes} days with notes, ${r.notFull} partially filled` };
});

check("heatmap grid fits its box", async (p) => {
  const r = await p.j(`{w: __vg.heat.w, box: document.getElementById('vg-heatwrap').clientWidth,
                        cols: __vg.heat.cols, cell: __vg.heat.cell}`);
  return { ok: r.w <= r.box, detail: `${r.cols} cols at ${r.cell}px = ${r.w}px in ${r.box}px` };
});

check("no note is dropped from a heatmap cell's tiling", async (p) => {
  const r = await p.j(`(function(){ var h = __vg.heat, worst = null;
    h.keys.forEach(function(k){ var d = h.days[k];
      if (d.parts.length !== Math.round(d.n)) worst = {day: k, n: Math.round(d.n), parts: d.parts.length}; });
    var busiest = null;
    h.keys.forEach(function(k){ var d = h.days[k]; if (!busiest || d.n > busiest.n) busiest = d; });
    return {mismatch: worst, busiest: {day: busiest.key, n: Math.round(busiest.n), parts: busiest.parts.length}};
  })()`);
  return { ok: !r.mismatch,
           detail: r.mismatch ? `${r.mismatch.day}: ${r.mismatch.n} notes but ${r.mismatch.parts} blocks`
                              : `busiest ${r.busiest.day}: ${r.busiest.n} notes, ${r.busiest.parts} blocks` };
});

check("plan parity at full vault", async (p) => {
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  const r = await p.j(`__vg.checkPlanParity()`);
  return { ok: !!r.parityOK, detail: `maxR ${r.staticMaxR} vs ${r.liveMaxR}, ${r.cellsStatic} cells` };
});

check("plan parity and zero-weight invariance with each folder hidden", async (p) => {
  const groups = await p.j(`(function(){ var g = []; __vg.graph.forEachNode(function(i,a){
    if (g.indexOf(a.folder) < 0) g.push(a.folder); }); return g; })()`);
  const bad = [];
  for (const g of groups) {
    await p.eval(`__vg.state.hidden.folder = {${JSON.stringify(g)}: true};
                  __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
    const r = await p.j(`{p: __vg.checkPlanParity().parityOK, z: __vg.checkZeroWeightInvariance().invariantOK}`);
    if (!r.p || !r.z) bad.push(`${g}${r.p ? "" : " parity"}${r.z ? "" : " zero-weight"}`);
  }
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  return { ok: bad.length === 0, detail: bad.length ? bad.join("; ") : `${groups.length} folders, all clean` };
});

check("the resting disc is on the lattice", async (p) => {
  // Stated in invariants.md as "radius is base + an integer row x SP", which is not
  // checkable from out here: SP, INNER_SCALE, UNIT and geomLock are all locked inside the
  // layout. The EQUIVALENT claim is checkable from positions alone -- the distinct radii
  // within one band must be evenly spaced -- and it is strictly stronger, because it also
  // catches a band whose spacing has drifted rather than only a fractional radius.
  //
  // Two exclusions, both load-bearing. Only notes at full alpha: mid-cascade radii are
  // legitimately fractional, which is the entire point of `rowsOf`. And no degree-0 notes:
  // those are sunflower-packed into the hub hole and were never on the lattice. This vault
  // has 0 orphans so that one is moot today, but it would fail spuriously on a vault that
  // has them.
  const r = await p.j(`(function(){
    var plan = __vg.buildWedgePlan(false), band = {};
    plan.cells.forEach(function(c){ band[c.g] = c.inner; });
    var rad = {inner: [], outer: []};
    __vg.graph.forEachNode(function(id, a){
      if ((__vg.alpha[id] || 0) < 0.999) return;
      if (__vg.graph.degree(id) === 0) return;
      (band[a.folder] ? rad.inner : rad.outer).push(Math.hypot(a.x, a.y));
    });
    var lattice = function(rs){
      if (rs.length < 3) return {notes: rs.length, rows: 0, skipped: true};
      var seen = {}, d = [];
      rs.forEach(function(v){ var k = v.toFixed(3); if (!seen[k]) { seen[k] = 1; d.push(+k); } });
      d.sort(function(x, y){ return x - y; });
      if (d.length < 2) return {notes: rs.length, rows: d.length, spread: 0, even: true};
      var gaps = [];
      for (var i = 1; i < d.length; i++) gaps.push(d[i] - d[i - 1]);
      var lo = Math.min.apply(null, gaps), hi = Math.max.apply(null, gaps);
      // Half a graph unit. A real off-lattice radius is a fraction of a ROW -- 160 units
      // out here -- so anything genuinely wrong is orders of magnitude past this, and
      // float noise never reaches it.
      return {notes: rs.length, rows: d.length, gap: +lo.toFixed(3),
              spread: +(hi - lo).toFixed(4), even: (hi - lo) < 0.5};
    };
    return {inner: lattice(rad.inner), outer: lattice(rad.outer)};
  })()`);
  const bands = [["inner", r.inner], ["outer", r.outer]];
  const ok = bands.every(([, b]) => b.skipped || b.even);
  const detail = bands.map(([n, b]) => b.skipped
    ? `${n} ${b.notes} notes (too few to judge)`
    : `${n} ${b.rows} rows at ${b.gap}, spread ${b.spread}`).join("; ");
  return { ok, detail };
});

check("band assignment obeys its two hard rules", async (p) => {
  // THREE requirements, and they cannot all hold on every vault:
  //   1. no small folder in the outer ring        -- hard
  //   2. inner rows <= outer rows                 -- hard
  //   3. inner thickness ~= 0.55 x outer          -- a TARGET, best-effort
  //
  // (3) is reachable only when enough big groups are free to move. On a 450-note vault
  // with small folders pinned, three groups are movable -- eight candidate splits -- and
  // the reachable ratios are a coarse grid. Asserting the target there would fail a balancer that
  // is doing exactly what it was told, so the ratio is REPORTED and the two hard rules
  // are what gate.
  const r = await p.j(`(function(){
    var plan = __vg.buildWedgePlan(false), band = {}, rows = {i: 0, o: 0};
    plan.cells.forEach(function(c){
      band[c.g] = c.inner;
      if (c.inner) { if (c.rows > rows.i) rows.i = c.rows; }
      else if (c.rows > rows.o) rows.o = c.rows;
    });
    var count = {};
    __vg.graph.forEachNode(function(id){ var g = __vg.groupOf(id); count[g] = (count[g]||0)+1; });
    // The PIN threshold, which is absolute -- not smallAt, which scales with the vault and
    // answers a different question (see PIN_BELOW in buildWedgePlan).
    var smallAt = 10;
    var strays = Object.keys(count).filter(function(g){ return !band[g] && count[g] < smallAt; });
    var rad = {i: [], o: []};
    __vg.graph.forEachNode(function(id, a){
      if ((__vg.alpha[id] || 0) < 0.999) return;
      (band[__vg.groupOf(id)] ? rad.i : rad.o).push(Math.hypot(a.x, a.y));
    });
    var t = function(v){ return v.length ? Math.max.apply(null, v) - Math.min.apply(null, v) : 0; };
    return { iRows: rows.i, oRows: rows.o, strays: strays,
             inner: Math.round(t(rad.i)), outer: Math.round(t(rad.o)),
             iN: rad.i.length, oN: rad.o.length,
             smallAt: Math.round(smallAt * 10) / 10 };
  })()`);
  if (!r.iN || !r.oN) return { ok: true, detail: `single band (${r.iN}/${r.oN}) — nothing to balance` };
  const ratio = r.outer ? r.inner / r.outer : 0;
  const rowsOk = r.iRows <= r.oRows;
  const noStrays = r.strays.length === 0;
  // Only rule 1 gates. The row ordering is a preference the balancer pays for breaking,
  // and on a large vault it cannot satisfy it at all without breaking rule 1 -- so
  // asserting it would fail a balancer that is obeying its instructions.
  return {
    ok: noStrays,
    detail: `${r.iRows} inner rows / ${r.oRows} outer` + (rowsOk ? "" : "  <- INVERTED") +
            `; small folders outside (<${r.smallAt} notes): ` +
            (noStrays ? "none" : r.strays.join(", ")) +
            `; thickness ${r.inner}/${r.outer} = ${ratio.toFixed(2)} (target 0.55, best-effort)`
  };
});

check("a marked heatmap day haloes but never pushes", async (p) => {
  const day = await p.j(`(function(){ var h = __vg.heat, b = null;
    h.keys.forEach(function(k){ var d = h.days[k]; if (!b || d.n > b.n) b = d; }); return b.key; })()`);
  const r = await p.j(`(function(){
    var pos = {}; __vg.graph.forEachNode(function(i,a){ pos[i] = a.x.toFixed(4)+','+a.y.toFixed(4); });
    __vg.state.markDay = ${JSON.stringify(day)}; __vg.renderer.refresh();
    var moved = 0; __vg.graph.forEachNode(function(i,a){ if (pos[i] !== a.x.toFixed(4)+','+a.y.toFixed(4)) moved++; });
    var pushed = 0, haloed = 0;
    __vg.graph.forEachNode(function(i){ if (__vg.isHighlighted(i)) haloed++; });
    var rep = __vg.pushReport();
    __vg.state.markDay = null; __vg.renderer.refresh();
    return {moved: moved, pushed: rep.pushedCount, haloed: haloed, day: ${JSON.stringify(day)}};
  })()`);
  return { ok: r.moved === 0 && r.pushed === 0 && r.haloed > 0,
           detail: `${r.day}: ${r.haloed} haloed, ${r.pushed} pushed, ${r.moved} moved` };
});

check("mark today still pushes", async (p) => {
  const r = await p.j(`(function(){
    __vg.state.markToday = true;
    var rep = __vg.pushReport();
    __vg.state.markToday = false; __vg.renderer.refresh();
    return {pushed: rep.pushedCount, haloed: rep.haloedCount};
  })()`);
  // Zero is a legitimate answer on a day nothing was touched, so this asserts the
  // RELATIONSHIP -- whatever is haloed by mark today is also pushed by it -- rather than
  // a count that depends on when the vault was last edited.
  return { ok: r.pushed === r.haloed, detail: `${r.pushed} pushed / ${r.haloed} haloed` };
});

check("hovering a note ramps in and releases at zero", async (p) => {
  // WAIT FOR THE DISC TO STOP MOVING FIRST. The two checks above set markDay/markToday,
  // which pushes notes radially, and clearing it animates them back. Aiming at a note
  // while that is in flight measures a position the note has already left: measured, this
  // check missed roughly one run in six with 19.9px of clearance, which is far more than
  // an aiming problem and exactly the size of the drift. The miss looked like a hover bug
  // and was a timing bug -- the flavour of flake that trains you to re-run instead of read.
  await settle(p);
  const w = await p.j(`__vg.demo.where("note","04") || __vg.demo.where("note","03")`);
  if (!w) return { ok: false, detail: "no note target resolved at all" };
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: w.x, y: w.y, buttons: 0 });
  await sleep(400);
  const on = await p.j(`(function(){
    var f = __vg.state.hovered, nb = f ? __vg.graph.neighbors(f) : [], far = null;
    __vg.graph.forEachNode(function(i){ if (far || i === f || nb.indexOf(i) >= 0) return;
      if ((__vg.alpha[i]||0) > 0.9) far = i; });
    return {t: __vg.hoverT, hit: f === ${JSON.stringify(w.expect)},
            farColour: far ? __vg.renderer.getNodeDisplayData(far).color : null,
            // #vg-app, not documentElement: the palette is declared on the page's own root
            // so it can mount inside another document. Read from the wrong element and this
            // comes back "", which fails as "the far node is the wrong colour".
            dim: getComputedStyle(document.getElementById('vg-app')).getPropertyValue('--dim').trim()};
  })()`);
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, buttons: 0 });
  await sleep(400);
  const off = await p.j(`{t: __vg.hoverT, held: !!__vg.state.hovered}`);
  const dimmed = on.farColour && on.dim && on.farColour.toLowerCase() === on.dim.toLowerCase();
  // TOO DENSE TO AIM is a reported condition, not a failure. At 10,000 notes the dots are
  // ~2.5px in radius and the most isolated one has ~6px of clearance, so aiming at its
  // centre lands in the gap on some runs and on the dot on others -- measured, the same
  // build passed at 5.2px and missed at 6.1px. Failing on that turns the suite into a coin
  // flip, and a flaky check is worse than an honest gap: it trains you to re-run rather
  // than to read. Below the threshold the miss is reported and the hover machinery is left
  // untested; above it, the aim is a real assertion.
  const AIMABLE_PX = 10;
  if (!on.hit && w.gap != null && w.gap < AIMABLE_PX) {
    return { ok: true,
             detail: `skipped — too dense to aim (${w.gap}px clearance, dots ~2.5px); ` +
                     `hover machinery untested at this density` };
  }
  // On a miss, say WHY: whether the note is still where the aim was computed (a stale
  // hit-test index) or has moved since (a drifting layout). Without this the detail line
  // reports only that the hover did not land, which is the one thing already obvious.
  let why = "";
  if (!on.hit) {
    const d = await p.j(`(function(){
      var a = __vg.graph.getNodeAttributes(${JSON.stringify(w.expect)});
      var o = document.getElementById("vg-graph").getBoundingClientRect();
      var v = __vg.renderer.graphToViewport({x: a.x, y: a.y});
      var el = document.elementFromPoint(${w.x}, ${w.y});
      return {dx: +(v.x + o.left - ${w.x}).toFixed(1), dy: +(v.y + o.top - ${w.y}).toFixed(1),
              got: __vg.state.hovered,
              // Occlusion is the other candidate: anything painted over the canvas at that
              // point (the tooltip, a panel) swallows the move and sigma never sees it.
              el: el ? (el.id || el.tagName + "." + el.className) : null};
    })()`).catch(() => null);
    if (d) why = `; target drifted ${d.dx},${d.dy}px, hovered ${d.got || "nothing"}, ` +
                 `element at aim ${d.el || "none"}`;
  }
  return { ok: on.t === 1 && on.hit && dimmed && off.t === 0 && !off.held,
           detail: `in ${on.t}, aimed-hit ${on.hit} (${w.gap}px clearance), ` +
                   `far node ${on.farColour}, out ${off.t}${why}` };
});

check("highlighting ramps per note and is additive", async (p) => {
  const r = await p.j(`(function(){
    var gs = []; __vg.graph.forEachNode(function(i,a){ if (gs.indexOf(a.folder) < 0) gs.push(a.folder); });
    gs.sort();
    var pick = function(g){ var f = null; __vg.graph.forEachNode(function(i,a){ if (!f && a.folder === g) f = i; }); return f; };
    var a = pick(gs[0]), b = pick(gs[1]);
    __vg.state.highlight = {}; __vg.state.highlight[gs[0]] = true; __vg.renderer.refresh();
    return {gs: [gs[0], gs[1]], a: a, b: b};
  })()`);
  await sleep(700);                                     // TWEEN_MS plus slack
  const first = await p.j(`{a: __vg.hl[${JSON.stringify(r.a)}] || 0, busy: __vg.hlBusy}`);
  await p.eval(`__vg.state.highlight[${JSON.stringify(r.gs[1])}] = true; __vg.renderer.refresh(); void 0`);
  await sleep(90);
  const mid = await p.j(`{a: __vg.hl[${JSON.stringify(r.a)}] || 0, b: __vg.hl[${JSON.stringify(r.b)}] || 0}`);
  await p.eval(`__vg.state.highlight = {}; __vg.renderer.refresh(); void 0`);
  await sleep(700);
  const gone = await p.j(`{a: __vg.hl[${JSON.stringify(r.a)}] || 0, b: __vg.hl[${JSON.stringify(r.b)}] || 0}`);
  // The point of a per-note ramp: the second group must start from 0 while the first
  // stays lit. A single global scalar would show b already at 1 here.
  const ok = first.a === 1 && mid.a === 1 && mid.b > 0 && mid.b < 1 && gone.a === 0 && gone.b === 0;
  return { ok, detail: `first ${first.a}, then first ${mid.a} / second ${mid.b.toFixed(2)}, released ${gone.a}/${gone.b}` };
});

check("a highlighted note is drawn larger", async (p) => {
  const r = await p.j(`(function(){
    var g = null; __vg.graph.forEachNode(function(i,a){ if (!g) g = a.folder; });
    var id = null; __vg.graph.forEachNode(function(i,a){ if (!id && a.folder === g) id = i; });
    return {g: g, id: id, before: +__vg.renderer.getNodeDisplayData(id).size.toFixed(2)};
  })()`);
  await p.eval(`__vg.state.highlight = {${JSON.stringify(r.g)}: true}; __vg.renderer.refresh(); void 0`);
  await sleep(700);
  const after = await p.j(`+__vg.renderer.getNodeDisplayData(${JSON.stringify(r.id)}).size.toFixed(2)`);
  await p.eval(`__vg.state.highlight = {}; __vg.renderer.refresh(); void 0`);
  await sleep(700);
  const ratio = after / r.before;
  return { ok: ratio > 1.3 && ratio < 1.7, detail: `${r.before} -> ${after} (${ratio.toFixed(2)}x)` };
});

// Idle means the app's own definition of idle -- the same predicate the demo driver waits
// on (play || cascade || layout anim || hover tween || highlight tween), so a check cannot
// disagree with the recorder about when the disc has settled.
async function settle(p, ms = 6000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (!(await p.j("!!__vg.demo.busy()").catch(() => false))) return true;
    if (Date.now() > deadline) return false;
    await sleep(120);
  }
}

/* ---------------------------------------------------------------- the run */

async function runOne(vault) {
  let url = arg("url", "");
  let scratch = null;
  if (!url) {
    // Built to a TEMP file, not to the builder's default output -- that default is inside
    // the vault, and a check you run before every push must not rewrite the snapshot the
    // user actually reads. Learns where it landed from the builder's own "wrote <path>"
    // line all the same, which is the contract refresh-graph.ps1 and record-demo.ps1 use.
    scratch = join(mkdtempSync(join(tmpdir(), "vg-smoke-build-")), "vault-graph.html");
    // --vault goes straight through to the builder. A 450-note vault and a 10,000-note
    // vault exercise different branches of the band balancer and the gap scaling, and four
    // defects were found only because both were checked -- so the default is now to check
    // BOTH, one after the other, rather than whichever one somebody remembered to pass.
    const b = spawnSync(process.execPath,
                        [join(HERE, "..", "src", "build-graph.mjs"), "--out", scratch]
                          .concat(vault ? ["--vault", vault] : []),
                        { encoding: "utf8" });
    process.stdout.write(b.stdout || "");
    if (b.status !== 0) throw new Error("build-graph.mjs failed:\n" + (b.stderr || ""));
    const m = /^wrote (.+) \(/m.exec(b.stdout || "");
    if (!m) throw new Error("could not tell where the build landed; pass --url");
    url = pathToFileURL(m[1].trim()).href;
  }
  console.log(`checking ${url}\n`);

  const profile = mkdtempSync(join(tmpdir(), "vg-smoke-"));
  const chrome = spawn(findChrome(), [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-features=Translate,TranslateUI",
    // A real window, sized so the layout is the one a person gets. Headless is tempting
    // for a pre-push check, but half these checks read PIXELS back out of a canvas and
    // measure a laid-out sidebar, and a software rasteriser is not the thing shipping.
    ...(HEADED ? [] : ["--window-position=-2400,0"]),
    "--window-size=1600,1000", `--app=${url}`
  ], { stdio: "ignore", detached: false });

  let page = null;
  try {
    const deadline = Date.now() + 25000;
    for (;;) {
      try { page = await attach(PORT, ""); break; }
      catch (e) { if (Date.now() > deadline) throw e; await sleep(400); }
    }
    // Collect console errors from the load, which is why Runtime is enabled before waiting.
    const errors = [];
    await page.send("Runtime.enable").catch(() => {});
    page.on((msg) => {
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params?.exceptionDetails;
        errors.push(d?.exception?.description || d?.text || "exception");
      }
    });

    // Wait for the page to be READY, not for a duration.
    const ready = Date.now() + 30000;
    for (;;) {
      const ok = await page.eval("!!(window.__vg && __vg.heat && __vg.state.until === null)").catch(() => false);
      if (ok) break;
      if (Date.now() > ready) throw new Error("page never finished its intro");
      await sleep(300);
    }

    page.j = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));
    const ctx = { errors };

    let failed = 0;
    for (const c of checks) {
      let r;
      try { r = await c.fn(page, ctx); }
      catch (e) { r = { ok: false, detail: "threw: " + e.message }; }
      if (!r.ok) failed++;
      console.log(`${r.ok ? "  ok  " : " FAIL "} ${c.name}\n         ${r.detail}`);
    }

    console.log(`\n${checks.length - failed}/${checks.length} passed`);
    return failed;
  } finally {
    if (page) page.close();
    try { chrome.kill(); } catch {}
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    if (scratch) { try { rmSync(dirname(scratch), { recursive: true, force: true }); } catch {} }
  }
}

/* ------------------------------------------------------- which vaults, and why
 *
 * TWO SHAPES, BY DEFAULT. Every constant in this project was tuned against one vault --
 * ~450 notes, nine top-level folders, one dominant folder -- and the ones that look most
 * like arbitrary tuning are exactly the ones another shape breaks: ten colour slots, three
 * named tint slots, a 6-degree minimum wedge, a 52-week heatmap window, and a band
 * balancer that has to satisfy three requirements it cannot always satisfy at once.
 *
 * So the suite checks a small vault AND a large one, and it stopped being optional the day
 * a change passed at 450 notes and broke the band split at 10,000.
 *
 *   demo vault   a structural mirror of the author's real vault, names replaced
 *                (scripts/make-demo-vault.mjs). Same folder tree, same counts, same
 *                dates, same link graph -- so it exercises the real shape without
 *                carrying anyone's content. Needs a real vault to mirror.
 *   10k vault    synthetic, deliberately awkward: more top-level folders than there are
 *                colour slots, sliver folders beside a dominant one, five levels of
 *                nesting (scripts/make-test-vault.mjs). Needs nothing.
 *
 * Both are gitignored and generated on demand. The synthetic one always can be; the mirror
 * needs OBSIDIAN_VAULT, and is SKIPPED WITH A NOTICE rather than silently, because "the
 * suite passed" must never quietly mean "half the suite ran".
 */
function resolveVaults() {
  const explicit = argAll("vault");
  if (explicit.length) return explicit.map((v) => ({ path: v, label: v }));
  if (arg("url", "")) return [{ path: "", label: "the page passed with --url" }];

  const out = [];
  const gen = (script, args, dir, label) => {
    if (!existsSync(dir)) {
      console.log(`generating ${label} ...`);
      const r = spawnSync(process.execPath, [join(HERE, script), "--out", dir, ...args],
                          { encoding: "utf8" });
      if (r.status !== 0) {
        console.log(`  cannot generate ${label}: ${(r.stderr || "").trim().split("\n")[0]}`);
        return;
      }
    }
    out.push({ path: dir, label });
  };

  const real = process.env.VAULT_GRAPH_VAULT || process.env.OBSIDIAN_VAULT || "";
  if (real) gen("make-demo-vault.mjs", ["--vault", real], join(ROOT, "demo-vault"), "the demo vault (mirror)");
  else console.log("SKIPPING the demo vault: no OBSIDIAN_VAULT to mirror.");

  gen("make-test-vault.mjs", ["--notes", "10000"], join(ROOT, "test-vault"), "the 10k synthetic vault");

  if (!out.length) throw new Error("no vault to check, and none could be generated");
  return out;
}

async function main() {
  const vaults = resolveVaults();
  console.log(`checking ${vaults.length} vault(s): ${vaults.map((v) => v.label).join(", ")}\n`);

  let worst = 0;
  const summary = [];
  for (const v of vaults) {
    console.log(`${"=".repeat(72)}\n== ${v.label}\n${"=".repeat(72)}`);
    const failed = await runOne(v.path);
    summary.push({ label: v.label, failed });
    worst = Math.max(worst, failed);
  }

  if (vaults.length > 1) {
    console.log(`\n${"=".repeat(72)}`);
    for (const s of summary) {
      console.log(`  ${s.failed ? "FAIL" : " ok "}  ${checks.length - s.failed}/${checks.length}  ${s.label}`);
    }
  }
  if (worst) {
    console.log("\nNot covered here, check by hand: per-frame animation steps\n" +
                "(__vg.probe/probeReport), and anything about how it looks.");
  }
  return worst ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error("smoke failed to run:", e.message);
  process.exit(1);
});
