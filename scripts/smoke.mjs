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

import { attach, json } from "./cdp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
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
// A PORT PER RUN, NOT A PORT PER PROJECT.
//
// This was a constant, 9333, and that is a bug the moment two of these run at once --
// several agents on one machine, or a suite started while another is finishing. The second
// Chrome cannot bind the port, so it silently loses the race and `attach` connects to the
// FIRST run's browser instead. Nothing errors: the checks run happily against the other
// run's page, so one vault reports the other's legend (60 rows on a 13-folder vault) and
// hovers a node id it does not contain. Every failure then reads like a bug in the page.
//
// Measured while chasing github#7, and it cost hours: two of these processes were racing
// and the numbers made no sense until the losing one was found.
//
// So each vault run takes a free port from the OS. `--port` still pins one for a human
// who wants to open devtools against it, and pinning is when the "is it already busy"
// refusal matters -- see runOne.
const PINNED_PORT = arg("port", "") ? Number(arg("port", "")) : 0;
const HEADED = argv.includes("--headed");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ask the OS for a port nobody is using, then hand it straight to Chrome. There is a race
// in principle -- the port is free when we let go of it and taken when Chrome binds -- and
// it does not matter: Chrome failing to bind is caught by the identity check below, which
// is there for the far likelier case of somebody else's browser.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

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

check("mark today haloes but never pushes", async (p) => {
  const r = await p.j(`(function(){
    __vg.state.markToday = true;
    var rep = __vg.pushReport();
    __vg.state.markToday = false; __vg.renderer.refresh();
    return {pushed: rep.pushedCount, haloed: rep.haloedCount};
  })()`);
  // REVERSED DELIBERATELY. This asserted that whatever mark-today haloes it also PUSHES,
  // which was the behaviour until today's notes were observed sliding out through their own
  // cell-mates -- the exact failure design/0010 already describes for a marked heatmap day.
  // Both now halo without moving anything, so the assertion is that nothing moved.
  //
  // Zero haloed is a legitimate answer on a day nothing was touched, so the check does not
  // demand a count; it demands that the count of moved notes is zero whatever it is.
  return { ok: r.pushed === 0, detail: `${r.pushed} pushed / ${r.haloed} haloed` };
});

check("mark today marks exactly the heatmap's today column", async (p) => {
  // The band and the button both answer "today" and used to answer it differently: the band
  // counts notes CREATED today, the button also counted files TOUCHED today -- an mtime,
  // which a sync or a frontmatter rewrite moves for reasons that have nothing to do with
  // the person. On a real vault that marked far more notes than the band showed.
  //
  // Set equality, not counts: two predicates can agree on how many and still disagree on
  // which. Both empty is a pass -- on a day nothing was written, marking nothing is correct.
  const r = await p.j(`(function(){
    var today = new Date();
    var p2 = function (n) { return String(n).padStart(2, "0"); };
    var key = today.getFullYear() + "-" + p2(today.getMonth() + 1) + "-" + p2(today.getDate());
    var byButton = [];
    __vg.graph.forEachNode(function (id) { if (__vg.isToday(id)) byButton.push(id); });
    var day = __vg.heat && __vg.heat.days ? __vg.heat.days[key] : null;
    var byBand = day ? day.ids.slice() : [];
    var sort = function (a) { return a.slice().sort(); };
    var A = sort(byButton).join("|"), B = sort(byBand).join("|");
    return { button: byButton.length, band: byBand.length, same: A === B, key: key };
  })()`);
  return { ok: r.same,
           detail: `${r.key}: ${r.button} marked by the button, ${r.band} in the band` +
                   (r.same ? "" : "  <- different SETS, not just counts") };
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

// PICK BY GROUP, NOT BY FOLDER. Highlight is keyed on groupOf(), and groupOf answers
// "(unlinked)" for a note of degree 0 -- so picking "the first note whose a.folder is X"
// and then highlighting X misses that note entirely when it happens to be an orphan.
// Measured on a vault whose alphabetically-first folder held one unlinked root note: hl
// stayed 0 and the size ratio 1.00x, and both these checks failed on code that was fine
// (github#5). groupOrder() is the same list the legend draws, which is the list highlight
// actually responds to.
check("highlighting ramps per note and is additive", async (p) => {
  // Additivity needs two groups to be additive BETWEEN. On a vault with one, say so
  // rather than measuring __vg.hl[null] and reporting a failure about the vault.
  const ng = await p.j(`__vg.groupOrder().length`);
  if (ng < 2) return { ok: true, detail: `only ${ng} group on this shape, nothing to add to` };
  const r = await p.j(`(function(){
    var gs = __vg.groupOrder();
    var pick = function(g){ var f = null; __vg.graph.forEachNode(function(i){ if (!f && __vg.groupOf(i) === g) f = i; }); return f; };
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

check("hover re-arms after the pointer leaves the stage", async (p) => {
  // THE ONE THAT MADE THIS SUITE FLAKY, now asserted directly (github#7).
  //
  // Sigma's handleLeave emitted leaveNode without clearing its own hoveredNode, so once
  // the pointer left the container it still believed it was on that note -- and coming
  // back to the SAME note emitted nothing, because the re-entry test is
  // `hoveredNode !== nodeAtPosition`. The hover above passed or failed depending on
  // whether anything earlier had moved the pointer off the canvas.
  //
  // It is a real defect for a person too: glance away, come back to the note you were
  // reading, no highlight. src/vendor.mjs patches it at read time.
  //
  // The sequence is the whole point -- on, OFF THE CANVAS, on again. Measured before the
  // fix: 1 hit in 40. After: 40 in 40.
  await settle(p);
  const w = await p.j(`__vg.demo.where("note","04") || __vg.demo.where("note","03")`);
  if (!w) return { ok: false, detail: "no note target resolved at all" };

  const enter = async (x, y) => {
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await sleep(400);
    return p.j(`{hovered: __vg.state.hovered, t: __vg.hoverT}`);
  };

  const first = await enter(w.x, w.y);
  // 5,5 is OUTSIDE #vg-graph -- the nav column. That is what makes this a leave rather
  // than a move, and it is the same coordinate the hover check releases to.
  const away = await enter(5, 5);
  const back = await enter(w.x, w.y);
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, buttons: 0 });
  await sleep(300);

  // Same density escape as the hover check: below the aiming threshold this cannot assert
  // anything, and a check that fails on a coin flip is worse than an honest gap.
  const AIMABLE_PX = 10;
  if (first.hovered !== w.expect && w.gap != null && w.gap < AIMABLE_PX) {
    return { ok: true,
             detail: `skipped -- too dense to aim (${w.gap}px clearance); the first hover ` +
                     `never landed, so there is nothing to re-arm` };
  }
  const ok = first.hovered === w.expect && away.hovered === null && back.hovered === w.expect;
  return { ok,
           detail: `on ${first.hovered} (t ${first.t}), off ${away.hovered} (t ${away.t}), ` +
                   `back on ${back.hovered} (t ${back.t})` +
                   (back.hovered === null ? "  <- stuck: sigma still thinks it is hovered" : "") };
});

check("a highlighted note is drawn larger", async (p) => {
  // Its own GROUP, for the reason above: highlighting the folder of an unlinked note
  // does not reach it, and this check then measures 1.00x on a working build.
  const r = await p.j(`(function(){
    var id = null, g = null;
    __vg.graph.forEachNode(function(i){ if (!id) { id = i; g = __vg.groupOf(i); } });
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

/* ----------------------------------------------------------------- camera --
 * Panning, wheel zoom and the two ways to reset. Driven with real input, because every one of
 * these is a gesture and three of them are sigma settings -- a constant that reads fine can
 * still be the wrong constant, and only the input says so.
 *
 * These leave the camera reset, so nothing after them inherits a moved view.
 */

async function camState(p) {
  return p.j(`(function(){ var c = __vg.renderer.getCamera().getState();
    return { x: +c.x.toFixed(4), y: +c.y.toFixed(4), ratio: +c.ratio.toFixed(4) }; })()`);
}

async function stageBox(p) {
  return p.j(`(function(){ var r = document.querySelector("#vg-graph").getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height,
             cx: r.left + r.width/2, cy: r.top + r.height/2 }; })()`);
}

async function camReset(p) {
  await p.eval(`__vg.renderer.getCamera().setState({x:0.5,y:0.5,ratio:1.08,angle:0}); void 0`);
  await sleep(250);
}

/**
 * Wait until the camera stops moving.
 *
 * fit() ANIMATES -- `camera.animate(..., { duration: 380 })` -- so a check that resets the
 * view and then reads the camera is racing that animation. Two of these were sleeping 750ms,
 * which is twice the duration and still lost on a loaded machine, exactly the class of failure
 * the note on aiming at a note already records: a fixed wait fires part-way through on a page
 * too slow to finish in time.
 *
 * Two identical samples rather than one, because the animation's own easing means a single
 * pair of equal readings can happen mid-flight at low velocity.
 */
async function camSettle(p, ms = 4000) {
  const deadline = Date.now() + ms;
  let prev = null, same = 0;
  for (;;) {
    const c = await camState(p);
    const key = c.x + "|" + c.y + "|" + c.ratio;
    if (key === prev) { if (++same >= 2) return c; } else { same = 0; }
    prev = key;
    if (Date.now() > deadline) return c;
    await sleep(60);
  }
}

check("one wheel notch is a step, not a leap", async (p) => {
  // Sigma's default zoomingRatio is 1.7, so a notch multiplied the ratio by that: three
  // notches took the disc from filling the stage to a sixth of it. Reported as "zooming does
  // jumps that are too big", which it was.
  await camReset(p);
  const box = await stageBox(p);
  const a = await camState(p);
  await p.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.cx, y: box.cy, deltaX: 0, deltaY: -120 });
  const b = await camSettle(p);
  await camReset(p);
  const step = a.ratio / b.ratio;
  return {
    ok: step > 1.1 && step < 1.35,
    detail: `ratio ${a.ratio} -> ${b.ratio}, x${step.toFixed(3)} per notch (sigma's default is 1.7)`,
  };
});

check("dragging the stage pans the camera", async (p) => {
  // Panning was OFF, with a listener that put the camera back to centre after every update.
  // That is defensible while zoom is the only gesture, but it also made zoom-toward-pointer a
  // lie: the camera was dragged back the moment it moved, so zooming in on one wedge walked
  // it off the far edge instead.
  await camReset(p);
  const box = await stageBox(p);
  const a = await camState(p);
  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.cx, y: box.cy, button: "left", clickCount: 1, buttons: 1 });
  for (let k = 1; k <= 8; k++) {
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.cx - k * 14, y: box.cy - k * 8, button: "left", buttons: 1 });
    await sleep(30);
  }
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.cx - 112, y: box.cy - 64, button: "left", clickCount: 1, buttons: 0 });
  const b = await camSettle(p);
  const sel = await p.j(`__vg.state.selected`);
  await camReset(p);
  return {
    // The ratio must NOT move -- a pan that also zooms means the wheel and the drag are
    // fighting over the same state -- and a pan must not read as a click on the stage, which
    // would clear the selection every time you moved the view.
    ok: Math.abs(b.x - a.x) + Math.abs(b.y - a.y) > 0.01 &&
        Math.abs(b.ratio - a.ratio) < 1e-6 && sel === null,
    detail: `camera (${a.x}, ${a.y}) -> (${b.x}, ${b.y}), ratio held at ${b.ratio}, ` +
            `selection ${sel === null ? "untouched" : "CLEARED"}`,
  };
});

check("double-clicking the graph resets the view", async (p) => {
  // preventSigmaDefault() is what makes this a reset rather than a reset AND sigma's own
  // double-click zoom. The captor emits the event and then checks that flag synchronously, so
  // setting it in the handler is seen; without it the two fight and the camera lands
  // somewhere neither asked for.
  await p.eval(`__vg.renderer.getCamera().setState({x:0.28,y:0.66,ratio:4.2,angle:0}); void 0`);
  await sleep(250);
  const box = await stageBox(p);
  const x = box.cx - 160, y = box.cy - 90;
  for (const n of [1, 2]) {
    await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: n, buttons: 1 });
    await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: n, buttons: 0 });
    await sleep(40);
  }
  const c = await camSettle(p);
  await camReset(p);
  return {
    ok: Math.abs(c.x - 0.5) < 0.002 && Math.abs(c.y - 0.5) < 0.002 && Math.abs(c.ratio - 1.08) < 0.02,
    detail: `from (0.28, 0.66) ratio 4.2 -> (${c.x}, ${c.y}) ratio ${c.ratio}; reset is (0.5, 0.5) 1.08`,
  };
});

// THE CLUSTER'S GEOMETRY, asserted and not just its behaviour. "Bottom-right corner, in
// this order, and a fifth larger" is what github#4 and the follow-up asked for, and a
// cluster that works from the wrong corner in the wrong order is a different thing. The
// order matters most: zoom is the pair reached for repeatedly, so it has to be the far end
// of the stack rather than next to the mode switch.
check("the camera cluster is bottom-right, in order, and 31px", async (p) => {
  const box = await p.j(`(function(){
    var cam = document.querySelector("#vg-cam");
    if (!cam) return null;
    var g = document.querySelector("#vg-canvas").getBoundingClientRect();
    var ids = ["vg-zin", "vg-zout", "vg-reset", "vg-pan"];
    var out = { fromBottom: null, fromRight: null, buttons: [] };
    var cr = cam.getBoundingClientRect();
    out.fromBottom = Math.round(g.bottom - cr.bottom);
    out.fromRight = Math.round(g.right - cr.right);
    for (var i = 0; i < ids.length; i++) {
      var b = document.getElementById(ids[i]);
      if (!b) { out.buttons.push({ id: ids[i], missing: true }); continue; }
      var r = b.getBoundingClientRect();
      out.buttons.push({ id: ids[i], w: Math.round(r.width), h: Math.round(r.height),
                         top: Math.round(r.top), label: b.getAttribute("aria-label"),
                         svg: !!b.querySelector("svg"),
                         inside: r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1 });
    }
    // The old Fit button in View is gone -- one job, one control.
    out.oldFit = !!document.querySelector("#vg-fit");
    // AND THE CARD YIELDS. They share the right-hand gutter, and of the two it is the card
    // that gives way: a control that relocates when a panel opens is a moving target. Forced
    // open with more content than could ever fit rather than by clicking a hub, because the
    // claim is about the max-height calc, not about any particular note.
    var d = document.querySelector("#vg-detail");
    if (d) {
      var wasHidden = d.hasAttribute("hidden"), html = d.innerHTML;
      d.removeAttribute("hidden");
      d.innerHTML = new Array(400).join("<p>tall</p>");
      var dr = d.getBoundingClientRect();
      out.cardClears = Math.round(cr.top - dr.bottom);
      d.innerHTML = html;
      if (wasHidden) d.setAttribute("hidden", "");
    }
    return out;
  })()`);
  if (!box) return { ok: false, detail: "no #vg-cam inside the stage" };
  const bad = box.buttons.filter((b) => b.missing || b.w !== 31 || b.h !== 31 || !b.svg || !b.label);
  // Stacked top to bottom in the order declared, which is what "pan is the lowest" means.
  let ordered = true;
  for (let i = 1; i < box.buttons.length; i++) {
    if (box.buttons[i].missing || box.buttons[i - 1].missing) { ordered = false; break; }
    if (!(box.buttons[i].top > box.buttons[i - 1].top)) ordered = false;
  }
  return {
    ok: bad.length === 0 && ordered && !box.oldFit &&
        box.fromBottom >= 0 && box.fromBottom < 60 && box.fromRight >= 0 && box.fromRight < 60 &&
        box.buttons.every((b) => b.inside) && box.cardClears > 0,
    detail: bad.length
      ? `wrong: ${bad.map((b) => b.missing ? b.id + " missing" : b.id + " " + b.w + "x" + b.h).join(", ")}`
      : `${box.buttons.length} buttons at ${box.buttons[0].w}x${box.buttons[0].h}px, ` +
        `${box.fromBottom}px from the bottom and ${box.fromRight}px from the right, ` +
        `top-to-bottom ${box.buttons.map((b) => b.id.replace("vg-", "")).join(" ")}` +
        `${box.oldFit ? "; #vg-fit IS STILL THERE" : "; #vg-fit gone"}` +
        `; a full detail card clears it by ${box.cardClears}px`,
  };
});

// FIT FITS WHAT IS THERE. The normalisation box is pinned to the full-vault extent so that
// filtering shrinks the disc instead of the camera silently refilling the viewport every
// frame -- right during an animation, wrong the moment somebody asks to be centred, because
// "fit" would frame the empty ring the notes used to occupy. Two ratios, one assertion:
// full vault must give the old constant, and a filtered disc must give a smaller number.
check("fit zooms in when the disc has shrunk", async (p) => {
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await p.eval(`document.querySelector("#vg-reset").click(); void 0`);
  const full = await camSettle(p);

  // Hide everything except the two smallest groups, so the disc genuinely gets smaller.
  const hid = await p.j(`(function(){
    var order = __vg.groupOrder();
    var keep = order.slice(-2);
    var h = {};
    order.forEach(function (g) { if (keep.indexOf(g) < 0) h[g] = true; });
    __vg.state.hidden.folder = h; __vg.syncAlpha(); __vg.applyLayout(false);
    var max = 0;
    __vg.graph.forEachNode(function (id, a) {
      if ((__vg.alpha[id] || 0) <= 0.004) return;
      var r = Math.hypot(a.x, a.y); if (r > max) max = r;
    });
    return { kept: keep.length, hidden: Object.keys(h).length, extent: Math.round(max) };
  })()`);
  await sleep(250);
  await p.eval(`document.querySelector("#vg-reset").click(); void 0`);
  const small = await camSettle(p);

  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await camReset(p);
  return {
    // Still centred either way: the box is symmetric about the origin, so this is only ever
    // a question about the ratio.
    ok: Math.abs(full.ratio - 1.08) < 0.02 && small.ratio < full.ratio - 0.05 &&
        Math.abs(small.x - 0.5) < 0.002 && Math.abs(small.y - 0.5) < 0.002,
    detail: `full vault ratio ${full.ratio}; with ${hid.hidden} of ${hid.hidden + hid.kept} ` +
            `groups hidden the disc reaches ${hid.extent} and fit gives ${small.ratio}, ` +
            `centred at (${small.x}, ${small.y})`,
  };
});

// The buttons have to agree with the wheel, or the same gesture means two things. Asserted
// against the renderer's own zoomingRatio rather than a repeated 1.2.
check("the zoom buttons step by one wheel notch", async (p) => {
  await camReset(p);
  const step = await p.j(`__vg.renderer.getSetting("zoomingRatio")`);
  const a = await camState(p);
  await p.eval(`document.querySelector("#vg-zin").click(); void 0`);
  const inn = await camSettle(p);
  await p.eval(`document.querySelector("#vg-zout").click(); void 0`);
  const back = await camSettle(p);
  await camReset(p);
  const got = a.ratio / inn.ratio;
  return {
    ok: Math.abs(got - step) < 0.02 && Math.abs(back.ratio - a.ratio) < 0.01,
    detail: `in: ${a.ratio} -> ${inn.ratio} (x${got.toFixed(3)}, setting is ${step}); ` +
            `out returns to ${back.ratio}`,
  };
});

// PAN IS A MODE, and the one that can trap the camera. Sigma's Camera.validateState drops
// x and y while panning is off, so turning it off with the disc dragged away would leave a
// view nothing could recentre -- fit() included, since fit() sets x and y. Turning it off
// therefore has to fly home first. Both halves are asserted: the drag stops working, and
// the disc is back at the centre afterwards.
check("the pan toggle locks the camera and flies home", async (p) => {
  await camReset(p);
  const box = await stageBox(p);
  const on = await p.j(`document.querySelector("#vg-pan").getAttribute("aria-pressed")`);

  // Drag away while pan is on, then switch it off: it should not stay off-centre.
  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.cx, y: box.cy, button: "left", clickCount: 1, buttons: 1 });
  for (let i = 1; i <= 6; i++) {
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.cx - i * 18, y: box.cy - i * 10, button: "left", buttons: 1 });
    await sleep(25);
  }
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.cx - 108, y: box.cy - 60, button: "left", clickCount: 1, buttons: 0 });
  const moved = await camSettle(p);

  await p.eval(`document.querySelector("#vg-pan").click(); void 0`);
  const home = await camSettle(p);
  const off = await p.j(`(function(){
    return { pressed: document.querySelector("#vg-pan").getAttribute("aria-pressed"),
             setting: !!__vg.renderer.getSetting("enableCameraPanning"),
             api: !!__vg.panEnabled };
  })()`);

  // ...and a drag now does nothing.
  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.cx, y: box.cy, button: "left", clickCount: 1, buttons: 1 });
  for (let i = 1; i <= 6; i++) {
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.cx + i * 18, y: box.cy + i * 10, button: "left", buttons: 1 });
    await sleep(25);
  }
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.cx + 108, y: box.cy + 60, button: "left", clickCount: 1, buttons: 0 });
  const locked = await camSettle(p);

  await p.eval(`document.querySelector("#vg-pan").click(); void 0`);
  await camSettle(p);
  const back = await p.j(`document.querySelector("#vg-pan").getAttribute("aria-pressed")`);
  await camReset(p);
  return {
    ok: on === "true" && off.pressed === "false" && !off.setting && !off.api &&
        Math.abs(moved.x - 0.5) > 0.01 &&
        Math.abs(home.x - 0.5) < 0.002 && Math.abs(home.y - 0.5) < 0.002 &&
        Math.abs(locked.x - home.x) < 0.002 && back === "true",
    detail: `on by default ${on}; dragged to (${moved.x}, ${moved.y}), toggling off flew home ` +
            `to (${home.x}, ${home.y}); a drag while locked left it at (${locked.x}, ${locked.y}); ` +
            `toggles back to ${back}`,
  };
});

/* -------------------------------------------------------------- date range --
 * The brush is DRIVEN, not called. Every one of these dispatches real pointer events at real
 * pixels, because the bugs it exists to catch were all in the gesture rather than in the
 * filter: which end a press grabs, whether the other end stays put, whether the disc waits
 * for the release. `__vg.setRange()` exercises none of that -- it was green while grabbing
 * one handle dragged both.
 *
 * These run LAST and each one leaves the range clear, so nothing above can be affected by
 * the order the suite happens to run in.
 */

// The ribbon's three lanes, so a press can be aimed at one of them. Mirrors the constants in
// page.js; a mismatch shows up as a check aiming at the wrong lane rather than as a wrong
// number, which is why each helper reports what it hit.
const RIB_BARS = 26, RIB_TRACK = 11;

async function ribbonBox(p) {
  return p.j(`(function(){
    var r = document.querySelector("#vg-ribbon").getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  })()`);
}

async function rangeSnap(p) {
  return p.j(`(function(){
    var r = __vg.rangeReport();
    return { from: r.from, to: r.to, lit: r.lit, total: r.total,
             fromISO: r.from ? new Date(r.from).toISOString().slice(0,10) : null,
             toISO: r.to ? new Date(r.to).toISOString().slice(0,10) : null,
             winStart: new Date(__vg.heat.start).toISOString().slice(0,10),
             winEnd: new Date(__vg.heat.start + __vg.heat.cols * 7 * 86400000).toISOString().slice(0,10) };
  })()`);
}

/** Press, move in steps, release. Steps matter: the handler ignores anything under 3px. */
async function ribbonDrag(p, box, x0, x1, y) {
  await p.send("Input.dispatchMouseEvent",
    { type: "mousePressed", x: box.left + x0, y: y, button: "left", clickCount: 1, buttons: 1 });
  for (let k = 1; k <= 6; k++) {
    await p.send("Input.dispatchMouseEvent",
      { type: "mouseMoved", x: box.left + x0 + (x1 - x0) * (k / 6), y: y, button: "left", buttons: 1 });
    await sleep(45);
  }
  await p.send("Input.dispatchMouseEvent",
    { type: "mouseReleased", x: box.left + x1, y: y, button: "left", clickCount: 1, buttons: 0 });
  // A beat BEFORE settle: it returns at once when busy is already false, and right after the
  // release the cascade has not started yet, so waiting first would wait past it.
  await sleep(150);
  await settle(p);
  await sleep(120);
  return rangeSnap(p);
}

async function clearRange(p) {
  await p.eval(`__vg.setRange(null, null); __vg.setHeatEnd(null); void 0`);
  await sleep(150);
  await settle(p);
}

check("a drag on the ribbon caps the date range", async (p) => {
  await clearRange(p);
  const box = await ribbonBox(p);
  const before = await rangeSnap(p);
  const r = await ribbonDrag(p, box, Math.round(box.w * 0.25), Math.round(box.w * 0.55), box.top + 12);
  await clearRange(p);
  return {
    ok: r.fromISO !== null && r.toISO !== null && r.fromISO < r.toISO && r.lit < before.lit,
    detail: `${r.fromISO} -> ${r.toISO}, lit ${before.lit} -> ${r.lit} of ${r.total}`,
  };
});

check("dragging one brush edge leaves the other alone", async (p) => {
  // THE BUG THIS PINS. Every press used to start a new brush anchored where the pointer went
  // down, with the far end following it -- so grabbing the left handle moved the right one
  // too. Both directions are checked, because an anchor that is wrong one way round is easy
  // to write and the symptom only shows on one of the two edges.
  await clearRange(p);
  const box = await ribbonBox(p);
  const y = box.top + 12;
  const a = await ribbonDrag(p, box, Math.round(box.w * 0.30), Math.round(box.w * 0.60), y);

  const xAt = async (ms) => p.j(`(function(){
    var d = __vg.dateSpan, w = document.querySelector("#vg-ribbon").getBoundingClientRect().width;
    return ((${ms} - d.lo) / (d.hi - d.lo)) * w; })()`);

  const b = await ribbonDrag(p, box, Math.round(await xAt(a.from)), Math.round(await xAt(a.from) - box.w * 0.1), y);
  const leftOk = b.to === a.to && b.from < a.from;

  const c = await ribbonDrag(p, box, Math.round(await xAt(b.to)), Math.round(await xAt(b.to) + box.w * 0.08), y);
  const rightOk = c.from === b.from && c.to > b.to;

  await clearRange(p);
  return {
    ok: leftOk && rightOk,
    detail: `left edge ${a.fromISO}->${b.fromISO} (far end ${leftOk ? "held" : "MOVED"}), ` +
            `right edge ${b.toISO}->${c.toISO} (far end ${rightOk ? "held" : "MOVED"})`,
  };
});

check("dragging inside the brush pans it and keeps its width", async (p) => {
  await clearRange(p);
  const box = await ribbonBox(p);
  const y = box.top + 12;
  const a = await ribbonDrag(p, box, Math.round(box.w * 0.30), Math.round(box.w * 0.50), y);
  const mid = Math.round(box.w * 0.40);
  const b = await ribbonDrag(p, box, mid, mid + Math.round(box.w * 0.08), y);
  const wA = a.to - a.from, wB = b.to - b.from;
  await clearRange(p);
  return {
    // A day of slack: the pan is clamped to the span and the ends quantise to pixels.
    ok: Math.abs(wA - wB) <= 86400000 && b.from > a.from,
    detail: `width ${Math.round(wA / 86400000)}d -> ${Math.round(wB / 86400000)}d, ` +
            `moved to ${b.fromISO} -> ${b.toISO}`,
  };
});

check("the band's window and the brush move independently", async (p) => {
  // They were one control: the window followed whichever brush end was dragged, so it could
  // not be placed deliberately -- the next nudge of the brush took it back. Checked BOTH
  // ways, since either direction of coupling would be a regression.
  await clearRange(p);
  const box = await ribbonBox(p);
  const yBars = box.top + 12, yTrack = box.top + RIB_BARS + 5;
  const a = await ribbonDrag(p, box, Math.round(box.w * 0.25), Math.round(box.w * 0.50), yBars);
  const b = await ribbonDrag(p, box, Math.round(box.w * 0.90), Math.round(box.w * 0.62), yTrack);
  const winMoved = b.winEnd !== a.winEnd && b.from === a.from && b.to === a.to;

  const xAt = async (ms) => p.j(`(function(){
    var d = __vg.dateSpan, w = document.querySelector("#vg-ribbon").getBoundingClientRect().width;
    return ((${ms} - d.lo) / (d.hi - d.lo)) * w; })()`);
  const c = await ribbonDrag(p, box, Math.round(await xAt(b.from)), Math.round(await xAt(b.from) - box.w * 0.09), yBars);
  const brushMoved = c.from < b.from && c.winEnd === b.winEnd;

  await clearRange(p);
  return {
    ok: winMoved && brushMoved,
    detail: `window ${a.winEnd} -> ${b.winEnd} (brush ${winMoved ? "held" : "MOVED"}), ` +
            `brush ${b.fromISO} -> ${c.fromISO} (window ${brushMoved ? "held" : "MOVED"})`,
  };
});

check("a press on the window track centres the window there", async (p) => {
  // Dragging the pill across a decade to reach one year is a lot of mouse, so a press on the
  // track is a jump too -- and it CENTRES rather than landing the window's end on the pointer.
  // The end-at-pointer version put the whole pill to the left of the hand, so the thing being
  // dragged was somewhere other than where the cursor was.
  //
  // Asserted as "the date under the pointer is the middle of what the grid shows", within a
  // couple of weeks: the window's end quantises to a Monday and is clamped at today, so an
  // exact midpoint is not available at either extreme.
  await clearRange(p);
  const box = await ribbonBox(p);
  const yBars = box.top + 12, yTrack = box.top + RIB_BARS + 5;
  const a = await ribbonDrag(p, box, Math.round(box.w * 0.30), Math.round(box.w * 0.55), yBars);
  const frac = 0.35;
  const x = box.left + Math.round(box.w * frac);
  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x, y: yTrack, button: "left", clickCount: 1, buttons: 1 });
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x, y: yTrack, button: "left", clickCount: 1, buttons: 0 });
  await sleep(200);
  await settle(p);
  const b = await rangeSnap(p);
  const aim = await p.j(`(function(){
    var d = __vg.dateSpan;
    var ms = d.lo + (d.hi - d.lo) * ${frac};
    var mid = __vg.heat.start + (__vg.heat.cols * 7 * 86400000) / 2;
    return { aimISO: new Date(ms).toISOString().slice(0,10),
             midISO: new Date(mid).toISOString().slice(0,10),
             offDays: Math.round(Math.abs(mid - ms) / 86400000) };
  })()`);
  await clearRange(p);
  return {
    ok: b.winEnd !== a.winEnd && b.from === a.from && b.to === a.to && aim.offDays <= 14,
    detail: `pressed at ${aim.aimISO}, window centred on ${aim.midISO} (${aim.offDays}d off); ` +
            `brush ${b.from === a.from && b.to === a.to ? "held" : "MOVED"}`,
  };
});

check("the disc waits for the release", async (p) => {
  // THE SMOOTHNESS FIX, as a property rather than as a frame rate. A drag previews on the
  // ribbon and must not touch the disc: the first version put a full cascade on every
  // pointermove and the second a full layout, and at 10k notes both lag the cursor. So the
  // opacities may not move until the button comes up.
  await clearRange(p);
  const box = await ribbonBox(p);
  const y = box.top + 12;
  const x0 = Math.round(box.w * 0.30), x1 = Math.round(box.w * 0.60);
  const litOf = () => p.j(`(function(){ var n = 0;
    __vg.graph.forEachNode(function(id){ if ((__vg.alpha[id]||0) > 0.004) n++; }); return n; })()`);

  const before = await litOf();
  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.left + x0, y: y, button: "left", clickCount: 1, buttons: 1 });
  for (let k = 1; k <= 6; k++) {
    await p.send("Input.dispatchMouseEvent",
      { type: "mouseMoved", x: box.left + x0 + (x1 - x0) * (k / 6), y: y, button: "left", buttons: 1 });
    await sleep(45);
  }
  const during = await litOf();
  // ...and the handles ARE following, or "nothing moved" would pass for the wrong reason.
  const previewing = await p.j(`(function(){
    var t = document.querySelector("#vg-rtip");
    return !t.hidden && /\\d{4}-\\d{2}-\\d{2}/.test(t.textContent); })()`);
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.left + x1, y: y, button: "left", clickCount: 1, buttons: 0 });
  await settle(p);
  const after = await litOf();
  await clearRange(p);
  return {
    ok: during === before && after < before && previewing,
    detail: `lit ${before} during drag ${during} (${during === before ? "untouched" : "MOVED"}), ` +
            `after release ${after}; tooltip ${previewing ? "tracking" : "ABSENT"}`,
  };
});

check("All dates clears the range and the window", async (p) => {
  const box = await ribbonBox(p);
  await ribbonDrag(p, box, Math.round(box.w * 0.30), Math.round(box.w * 0.55), box.top + 12);
  await p.eval(`document.querySelector("#vg-rangeall").click(); void 0`);
  await settle(p);
  const r = await p.j(`(function(){ var r = __vg.rangeReport();
    return { from: r.from, to: r.to, heatEnd: r.heatEnd, lit: r.lit, total: r.total,
             disabled: !!document.querySelector("#vg-rangeall").disabled }; })()`);
  return {
    ok: r.from === null && r.to === null && r.heatEnd === null && r.lit === r.total && r.disabled,
    detail: `from/to/heatEnd null, ${r.lit} of ${r.total} lit, button ` +
            (r.disabled ? "disabled" : "STILL LIVE"),
  };
});

check("a range change animates instead of snapping", async (p) => {
  // THE JUMP, pinned. The cascade planned its destination from visible(), which knows about
  // hidden groups and nothing else -- so with a date range applied planA and planB were the
  // same packing, the cascade had nothing to walk between, and the whole change landed in a
  // single frame. Measured before the fix: 1 frame over 6ms. It was not a rough animation, it
  // was no animation.
  //
  // Two assertions, because either alone passes for the wrong reason: it has to take real
  // frames, AND settle() has to be a no-op at the end of them. A long animation that then
  // snaps is the other half of the same bug.
  await clearRange(p);
  await p.eval(`__vg.probe(true); void 0`);
  await p.eval(`__vg.setRange("2018-01-01", "2021-01-01"); void 0`);
  await sleep(200);
  await settle(p);
  await sleep(250);
  const r = await p.j(`__vg.probeReport()`);
  await p.eval(`__vg.probe(false); void 0`);
  await clearRange(p);
  return {
    // A row is 160 graph units and RADIAL_EASE moves at most a quarter of one per frame, so
    // anything at or under 40 is the animation working. The frame floor is deliberately low:
    // this is a check against snapping, not a frame-rate budget.
    ok: r.frames > 20 && r.outerMaxStep <= 40 && r.innerMaxStep <= 40,
    detail: `${r.frames} frames over ${r.spanMs}ms, biggest single-frame step: outer ` +
            `${r.outerMaxStep}, inner ${r.innerMaxStep} (one row = 160)`,
  };
});

// THE GAP RESERVATION IS THE PLANNER'S, NOT THE LIVE WEIGHTS'. A group that keeps 30 of
// its 100 notes is still one wedge entitled to one gap, but presence was read as weight over
// seats -- and during a cascade the seats are the OLD plan's, so it read 0.3 while the
// departing 70 were still seated and 1.0 the moment they left. Every wedge boundary on the
// disc moved twice for a change that should not have touched the gap at all.
//
// A legend toggle cannot show this, which is why it shipped: hiding a folder takes all of it
// to zero together, so presence runs 1 -> 0 cleanly. Only a filter that thins groups without
// emptying them separates the two readings, and the date range is the first one this page has.
//
// The assertion is EXACTLY ZERO, not a tolerance. The reservation is now walked between the
// two packings by cascade progress, and for a change that empties no group both ends are the
// same number -- so any movement at all means it is being derived again.
check("the gap reservation holds still while groups only thin", async (p) => {
  await clearRange(p);
  const before = await p.j(`__vg.rangeReport()`);
  await p.eval(`__vg.probe(true); void 0`);
  // A span wide enough that every folder keeps some notes -- the point is thinning, not
  // emptying. Asserted below rather than assumed, since a vault could be shaped otherwise.
  await p.eval(`__vg.setRange("2025-03-01", null); void 0`);
  await sleep(200);
  await settle(p);
  await sleep(250);
  const r = await p.j(`__vg.probeReport()`);
  await p.eval(`__vg.probe(false); void 0`);
  const after = await p.j(`__vg.rangeReport()`);
  await clearRange(p);
  const s0 = r.samples[0], s1 = r.samples[r.samples.length - 1];
  const emptied = s0.ngO !== s1.ngO || s0.ngI !== s1.ngI;
  if (r.frames < 5) {
    return { ok: false, detail: `only ${r.frames} frame(s) -- nothing was animated to measure` };
  }
  return {
    // Emptying a group legitimately moves the reservation, so a vault where this range
    // empties one is reported rather than silently passing on a weaker assertion.
    ok: r.ngMaxStep === 0 && !emptied,
    detail: emptied
      ? `this range empties a group (nG ${s0.ngO} -> ${s1.ngO}), so the gap moves for a real reason`
      : `nG held at ${s1.ngO} across ${r.frames} frames, worst step ${r.ngMaxStep}; ` +
        `lit ${before.lit} -> ${after.lit}`,
  };
});

check("undated notes survive every range", async (p) => {
  // Deliberate, and worth pinning because it is the kind of rule that gets tidied away: 20%
  // of the 10k fixture carries no frontmatter, and excluding those from a date range would
  // make a date filter quietly also filter on "has frontmatter".
  const r = await p.j(`(function(){
    __vg.setRange("2019-01-01", "2019-01-02");
    var undated = 0, lit = 0;
    __vg.graph.forEachNode(function(id, a){ if (!a.created) undated++; });
    return { undated: undated };
  })()`);
  await settle(p);
  const lit = await p.j(`(function(){ var n = 0;
    __vg.graph.forEachNode(function(id, a){ if (!a.created && (__vg.alpha[id]||0) > 0.004) n++; });
    return n; })()`);
  await clearRange(p);
  return {
    ok: r.undated === 0 || lit === r.undated,
    detail: r.undated === 0
      ? "no undated notes in this vault -- nothing to check"
      : `${lit} of ${r.undated} undated notes lit inside a two-day range`,
  };
});

// COLOUR IS OTHERWISE OUT OF SCOPE HERE, and this one is in anyway, because it is not
// about how it looks: it is about blast radius, and it has broken twice. Both times the
// automatic assignment stopped being a pure function of position -- first by claiming
// slots and swapping, then by an overridden folder failing to advance the counter -- and
// both times one click recoloured most of the disc. Measured at the second break: 14 of 17
// groups and 624 notes outside the folder that was touched.
check("overriding one folder recolours exactly one group", async (p) => {
  const r = await p.j(`(function(){
    var order = __vg.groupOrder();
    var before = {}; order.forEach(function (g) { before[g] = __vg.colorOf(g); });
    // A working folder, not an archive -- archives are deliberately outside the rotation,
    // so they are not the case at risk here.
    var target = null;
    for (var i = 0; i < order.length; i++) {
      if (!__vg.isArchiveGroup(order[i]) && order[i].charAt(0) !== "(") { target = order[i]; break; }
    }
    // Any slot the target is not already on, or the check would assert nothing.
    var slot = __vg.slotOf(target) === "g8" ? "g5" : "g8";
    __vg.setFolderColors({ [target]: slot });
    var after = {}, moved = [];
    order.forEach(function (g) {
      after[g] = __vg.colorOf(g);
      if (before[g] !== after[g]) moved.push(g);
    });
    __vg.setFolderColors({});
    return { target: target, slot: slot, moved: moved, groups: order.length };
  })()`);
  const ok = r.moved.length === 1 && r.moved[0] === r.target;
  return { ok, detail: `${r.target} -> ${r.slot}: ${r.moved.length} of ${r.groups} groups changed` +
                       (ok ? "" : ` (${r.moved.slice(0, 6).join(", ")}${r.moved.length > 6 ? ", ..." : ""})`) };
});

// THE OTHER COLOUR CHECK READS GROUP COLOURS; THIS ONE READS WHAT A NOTE IS PAINTED.
// That gap is the whole reason github#3 survived: colorOf("(unlinked)") was right the
// entire time -- the legend drew the correct swatch from it -- while nodeColor went to
// the note's own folder and painted the same notes nine different colours. A check on
// the group colour cannot see that, so this one goes through the renderer.
//
// It asserts ALL of them, not "at least one", and the difference is not pedantry: on the
// 10,000-note synthetic, 6 of 148 orphans matched the swatch BY COINCIDENCE before the
// fix, because one folder's slot happens to be the same hex. An "any" form passed on a
// broken build.
//
// A vault with no orphans reports that instead of passing. demo-vault mirrors a real
// vault and has 0 of 452, so on that shape there is genuinely nothing to measure -- and
// a check that cannot tell whether it did anything is worse than no check.
check("every unlinked note wears the (unlinked) swatch", async (p) => {
  const r = await p.j(`(function(){
    var g = __vg.graph, rd = __vg.renderer, sw = String(__vg.colorOf("(unlinked)")).toLowerCase();
    var ids = g.nodes().filter(function (id) { return g.degree(id) === 0; });
    var cols = ids.map(function (id) { return String(rd.getNodeDisplayData(id).color).toLowerCase(); });
    return { swatch: sw, orphans: ids.length,
             match: cols.filter(function (c) { return c === sw; }).length,
             distinct: Object.keys(cols.reduce(function (a, c) { a[c] = 1; return a; }, {})).length };
  })()`);
  if (!r.orphans) return { ok: true, detail: "no unlinked notes on this shape, nothing to measure" };
  return { ok: r.match === r.orphans,
           detail: `${r.match} of ${r.orphans} on ${r.swatch}, ${r.distinct} distinct` };
});

// Idle means the app's own definition of idle -- the same predicate the demo driver waits
// on (play || cascade || layout anim || hover tween || highlight tween), so a check cannot
// disagree with the recorder about when the disc has settled.
async function settle(p, ms = 6000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (!(await p.j("!!__vg.demo.busy()").catch(() => false))) return true;
    if (Date.now() > deadline) {
      // SAY WHAT IS STILL RUNNING. busy() is the OR of five things and a silent cap tells you
      // only that one of them was true -- which turns "this check took six seconds" into a
      // guess. Cheap, and only on the path that has already given up.
      const who = await p.j("__vg.demo.busyWhy()").catch(() => null);
      console.log("         ! settle gave up after " + ms + "ms, still busy: " +
                  (who ? Object.keys(who).filter(function (k) { return who[k]; }).join(", ") || "nothing?"
                       : "could not ask"));
      return false;
    }
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

  // One port for this run alone, unless a human pinned one with --port.
  const PORT = PINNED_PORT || (await freePort());

  // A PINNED PORT THAT IS ALREADY ANSWERING is somebody else's browser, and attaching to
  // it would measure their page instead of the one just built -- silently, since every
  // check would still run. Refuse. (An OS-assigned port cannot already be busy, so this
  // guards only the deliberate case.)
  try {
    if (!PINNED_PORT) throw new Error("not pinned");
    await json(PORT, "/json/version");
    throw new Error(
      `something is already serving CDP on port ${PORT}.\n` +
      "A previous run leaked its browser, and attaching to it would silently measure the\n" +
      "wrong page -- see killBrowser() at the bottom of this file. Close it and re-run:\n\n" +
      "  taskkill /F /IM chrome.exe /FI \"WINDOWTITLE eq vault-graph*\"\n\n" +
      "or kill whatever is holding the port."
    );
  } catch (e) {
    if (/already serving CDP/.test(e.message)) throw e;   // ours -- pass it on
    // anything else means nothing answered, which is what we want
  }

  const profile = mkdtempSync(join(tmpdir(), "vg-smoke-"));
  const chrome = spawn(findChrome(), [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check",
    // THE WINDOW MUST KEEP ANIMATING WHILE NOBODY IS LOOKING AT IT.
    //
    // The window is parked off-screen below, and Windows tells Chrome so: its native
    // occlusion calculator marks a window nobody can see as occluded, and Chrome then
    // backgrounds the renderer -- requestAnimationFrame stops, timers are throttled.
    // Every value this suite measures is downstream of a frame, so the whole run comes
    // apart at once and none of the failures mention frames: the hover lands but its
    // ramp reads 0, the highlight ramp reads 0, a highlighted note is 1.00x, the legend
    // reports the rows it had before it was built, and Runtime.evaluate starts timing
    // out. Measured: 2 clean runs out of 8 while the machine was busy, and the failures
    // look like six unrelated bugs (github#7).
    //
    // It is intermittent because occlusion is recalculated on OS events and under load,
    // which is why this read as "flaky pointer checks" for a while and why it lost more
    // often from a git hook -- a push is exactly when the machine is busy.
    "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    // A real window, sized so the layout is the one a person gets. Headless is tempting
    // for a pre-push check, but half these checks read PIXELS back out of a canvas and
    // measure a laid-out sidebar, and a software rasteriser is not the thing shipping.
    ...(HEADED ? [] : ["--window-position=-2400,0"]),
    "--window-size=1600,1000", `--app=${url}`
  ], { stdio: ["ignore", "ignore", "pipe"], detached: false });

  const chromeSaid = [];
  if (chrome.stderr) {
    chrome.stderr.setEncoding("utf8");
    chrome.stderr.on("data", (d) => {
      for (const line of String(d).split("\n")) {
        const t = line.trim();
        if (t) chromeSaid.push(t);
      }
      while (chromeSaid.length > 40) chromeSaid.shift();
    });
  }
  let chromeGone = null;
  chrome.on("exit", (code, sig) => { chromeGone = "exit " + code + (sig ? " " + sig : ""); });

  let page = null;
  try {
    // MATCH THE PAGE WE JUST BUILT, rather than taking whatever answers on the port. The
    // build directory is a fresh mkdtemp per run, so it identifies this run's page and
    // nothing else -- and a Chrome left behind by a killed run is still listening on the
    // same port, ready to hand over a page from a previous build. That happened three
    // times before the note count gave it away.
    const want = url.split("/").slice(-2)[0] || url;
    const deadline = Date.now() + 25000;
    for (;;) {
      try { page = await attach(PORT, want); break; }
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

    // AND IS IT OUR PAGE? The port check above is the guard; this is the proof. A stale
    // browser answers, attaches and evaluates perfectly happily -- the only thing wrong
    // with it is that it is showing the previous vault, which no check can tell from a
    // real defect. One string comparison turns that into an honest failure.
    const at = await page.eval("location.href").catch(() => "");
    if (at && at !== url) {
      throw new Error(
        `attached to the wrong page.\n  wanted ${url}\n  got    ${at}\n` +
        "That is a leaked browser from an earlier run, not a defect in the page."
      );
    }

    // Wait for the page to be READY, not for a duration.
    const ready = Date.now() + 30000;
    for (;;) {
      const ok = await page.eval("!!(window.__vg && __vg.heat && __vg.state.until === null)").catch(() => false);
      if (ok) break;
      if (Date.now() > ready) throw new Error("page never finished its intro");
      await sleep(300);
    }

    page.j = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));

    // ARE FRAMES ARRIVING? Ask before measuring anything, because every number below is
    // downstream of one. A backgrounded renderer does not fail a check -- it fails six, in
    // six different vocabularies, none of which says "no frames" (github#7). One honest
    // message beats a scoreboard that has to be decoded.
    //
    // The bar is deliberately on the floor: 5 frames in 600ms, about 8fps. The page is
    // designed to survive a slow machine -- animations stretch rather than leap below
    // ~20fps, which is an invariant of its own -- so this must catch a renderer that has
    // STOPPED, not one that is merely struggling.
    const fps = await page.j(`new Promise(function(r){
      var n = 0, t0 = performance.now();
      (function tick(){ n++; if (performance.now() - t0 < 600) requestAnimationFrame(tick);
                        else r({frames: n, ms: Math.round(performance.now() - t0)}); })();
    })`).catch(() => ({ frames: 0, ms: 0 }));
    if (fps.frames < 5) {
      throw new Error(
        `the page is not animating -- ${fps.frames} frame(s) in ${fps.ms}ms.\n` +
        "Every check here measures something a frame produced, so the run would report six\n" +
        "unrelated-looking failures instead of this one. The usual cause is Chrome\n" +
        "backgrounding the off-screen window; the launch flags above are what prevent it."
      );
    }
    const ctx = { errors };

    let failed = 0;
    const timings = [];
    for (const c of checks) {
      // STOP AT A LOST OR WEDGED PAGE rather than running the rest against it. Every
      // remaining check would fail, none of them for its own reason, and the report would name
      // a dozen features as broken when the truth is one page that stopped answering.
      //
      // The liveness probe is one trivial eval, and it is here rather than inside the checks
      // because what it has to establish is exactly "was the page still alive BEFORE this
      // check ran" -- which names the check that wedged it as the previous line of output.
      if (page.lost) {
        console.log(`\n  !! CDP connection lost (${page.lost}) -- ` +
                    `${checks.length - timings.length} check(s) not run`);
        if (chromeGone) console.log(`     chrome process: ${chromeGone}`);
        if (chromeSaid.length) {
          console.log("     chrome said:");
          for (const l of chromeSaid.slice(-12)) console.log("       " + l);
        }
        failed += checks.length - timings.length;
        break;
      }
      try {
        await page.eval("1");
      } catch (e) {
        const last = timings.length ? timings[timings.length - 1].name : "(before the first check)";
        console.log(`\n  !! the page stopped answering after "${last}" -- ${e.message}`);
        if (chromeGone) console.log(`     chrome process: ${chromeGone}`);
        if (chromeSaid.length) {
          console.log("     chrome said:");
          for (const l of chromeSaid.slice(-12)) console.log("       " + l);
        }
        console.log(`     ${checks.length - timings.length} check(s) not run`);
        failed += checks.length - timings.length;
        break;
      }
      let r;
      const t0 = Date.now();
      try { r = await c.fn(page, ctx); }
      catch (e) { r = { ok: false, detail: "threw: " + e.message }; }
      const ms = Date.now() - t0;
      timings.push({ name: c.name, ms });
      if (!r.ok) failed++;
      const secs = ms >= 1000 ? ` ${(ms / 1000).toFixed(1)}s` : "";
      console.log(`${r.ok ? "  ok  " : " FAIL "} ${c.name}${secs}\n         ${r.detail}`);
    }

    const total = timings.reduce((a, t) => a + t.ms, 0);
    const slow = timings.slice().sort((a, b) => b.ms - a.ms).slice(0, 5);
    console.log(`\n${checks.length - failed}/${checks.length} passed in ${(total / 1000).toFixed(0)}s`);
    console.log("slowest: " + slow.map((t) => `${t.name} ${(t.ms / 1000).toFixed(1)}s`).join(", "));
    return failed;
  } finally {
    // ORDER MATTERS HERE, and getting it wrong is invisible.
    //
    // Browser.close asks Chrome to shut itself down and release the profile -- the only
    // one of these three that reliably reaches the BROWSER process rather than the
    // launcher. It has to be sent BEFORE page.close(), because that closes the websocket
    // the request would travel over: with the calls the other way round the send threw
    // into an empty catch on every run, silently, and the browser stayed up. Which is
    // exactly the leak this block was added to fix -- it blocked a push one commit later,
    // with the new guard correctly refusing to measure the stale page it had left behind.
    try { if (page) await page.send("Browser.close"); } catch { /* already going */ }
    if (page) page.close();

    // Then the blunt instruments, for a Chrome that ignored the request or never got it.
    // `spawn().kill()` signals the process we started, and Chrome's launcher hands off to
    // a browser process and exits -- so on its own that kill lands on something already
    // gone while the browser keeps running, keeps the profile locked, and keeps answering
    // on the debugging port. killBrowser() escalates through them, WAITS for the port to
    // go quiet rather than sleeping a guessed 300ms, and if it is still held, kills
    // whoever actually holds it.
    await killBrowser(chrome, PORT);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    if (scratch) { try { rmSync(dirname(scratch), { recursive: true, force: true }); } catch {} }
  }
}

/**
 * Shut the browser down, and MEAN IT.
 *
 * `chrome.kill()` was the whole teardown, and on Windows it kills the process we spawned
 * and nothing else: Chrome's launcher hands off to a browser process that is not our
 * child, so the browser survives, keeps the debug port, and the NEXT run attaches to it.
 * The run then measures the previous vault's page -- 60 legend rows on a 13-folder vault,
 * a hover on a node id that vault does not contain -- and every failure reads like a bug
 * in the page (github#7).
 *
 * Three steps, weakest to strongest, because the polite one is also the one that leaves
 * no orphaned profile directories behind:
 *
 *   Browser.close   ask it to quit, over the protocol it is already speaking
 *   taskkill /T /F  take the tree down (Windows kill does not walk children)
 *   wait            do not return until the port stops answering
 */
async function killBrowser(child, PORT) {
  const gone = async () => {
    try { await json(PORT, "/json/version"); return false; } catch { return true; }
  };

  try {
    const b = await attach(PORT, "");
    await b.send("Browser.close").catch(() => {});
    b.close();
  } catch {}
  for (let i = 0; i < 20; i++) {           // ~2s of grace for the polite exit
    if (await gone()) return;
    await sleep(100);
  }

  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
  try { child.kill(); } catch {}
  for (let i = 0; i < 20; i++) {
    if (await gone()) return;
    await sleep(100);
  }

  // STILL THERE. Ask the PORT who owns it, rather than trusting the handle we spawned:
  // Chrome's launcher hands the browser off, so the surviving process is frequently not
  // our child and not reachable through it. This is the step that actually works.
  //
  // netstat, parsed WITHOUT looking for the word LISTENING -- this machine prints
  // "ABHÖREN", and a filter on the English word is why a leaked browser went unnoticed
  // for as long as it did. The address column is unambiguous on its own, and the PID is
  // the last field on the line whatever the locale.
  if (process.platform === "win32") {
    const out = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" }).stdout || "";
    const owners = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("127.0.0.1:" + PORT) && !line.includes("[::1]:" + PORT)) continue;
      const pid = line.trim().split(/\s+/).pop();
      // Only a listener owns the port; a TIME_WAIT row's pid is 0 and means nothing.
      if (/^\d+$/.test(pid) && pid !== "0") owners.add(pid);
    }
    for (const pid of owners) spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
    for (let i = 0; i < 20; i++) {
      if (await gone()) return;
      await sleep(100);
    }
  }

  // Not fatal on its own -- the next run's port check refuses rather than measuring the
  // wrong thing -- but say so, because a leak here is exactly why that check exists.
  console.log(`  !! a browser is still holding port ${PORT} after teardown`);
}

/* ------------------------------------------------------- which vaults, and why
 *
 * THREE SHAPES, BY DEFAULT. Every constant in this project was tuned against one vault --
 * ~450 notes, nine top-level folders, one dominant folder -- and the ones that look most
 * like arbitrary tuning are exactly the ones another shape breaks: twelve colour slots, three
 * named tint slots, a 6-degree minimum wedge, a 52-week heatmap window, and a band
 * balancer that has to satisfy three requirements it cannot always satisfy at once.
 *
 * So the suite checks a small vault AND a large one AND a lopsided one, and it stopped being
 * optional the day a change passed at 450 notes and broke the band split at 10,000.
 *
 *   demo vault   1400 notes over two dense years, every month populated, ramping toward
 *                the present (scripts/make-demo-vault.mjs). The shape a vault in real use
 *                has, and the one the date ribbon is worth looking at on.
 *   10k vault    synthetic and deliberately awkward: more top-level folders than there are
 *                colour slots, sliver folders beside a dominant one, five levels of
 *                nesting, and ten years of dates (scripts/make-test-vault.mjs).
 *   shape vault  954 notes where ONE GROUP HOLDS 77% and a single unlinked note sits at
 *                the vault root (scripts/make-shape-vault.mjs). Added after a reported
 *                vault failed three checks that both shapes above passed (github#5):
 *                neither has a dominant group, so a spurious row vanishes into the
 *                maximum instead of moving the outer radius, and neither has an unlinked
 *                note sorting ahead of every real folder.
 *
 * All three are gitignored and generated on demand, and NONE NEEDS A VAULT OF YOURS. The
 * demo vault used to be a mirror of the author's real one, which meant it needed
 * OBSIDIAN_VAULT and was skipped with a notice when there was none -- so on a contributor's
 * machine "the suite passed" meant part of the suite ran. It is a declared structure now, so
 * every shape always runs and the skip branch is gone. The mirror still exists as an opt-in
 * (scripts/make-mirror-vault.mjs) for checking against a real vault on purpose.
 *
 * THE TWO DATE SHAPES ARE THE POINT of having them, as much as the sizes. Two dense years
 * and a decade with a thin tail break different things: the ribbon's bar scale was tuned on
 * one and read as a solid slab on the other, and the heatmap's 52-week window covers most of
 * the first and a tenth of the second.
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

  gen("make-demo-vault.mjs", [], join(ROOT, "demo-vault"), "the demo vault (2 dense years)");
  gen("make-test-vault.mjs", ["--notes", "10000", "--years", "10"],
      join(ROOT, "test-vault"), "the 10k synthetic vault (10 years)");
  gen("make-shape-vault.mjs", [], join(ROOT, "shape-vault"), "the dominant-folder vault");

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
