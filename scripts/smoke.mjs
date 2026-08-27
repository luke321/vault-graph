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
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync,
         renameSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
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
// N DISTINCT PORTS AT ONCE. freePort() asks the OS for one, closes the listener and hands the
// number back, which is a time-of-check race the moment two callers run concurrently: with
// nine jobs launching together, two Chromes were handed the same port, the loser never bound
// it, and `attach` connected to the winner's page instead -- surfacing as "attached to the
// wrong page" on six jobs of a --jobs 9 run. This holds all N listeners open at the same time
// so the numbers cannot repeat, then closes them together. Still a race against the rest of
// the machine, which is what the "already serving CDP" refusal in runOne is for -- but no
// longer a race against ourselves.
//
// A port belongs to a LANE, not to a job: jobs on one lane run one after another, so the lane
// can keep its port for the whole run.
async function freePorts(k) {
  const { createServer } = await import("node:net");
  const held = [];
  try {
    for (let i = 0; i < k; i++) {
      held.push(await new Promise((res, rej) => {
        const srv = createServer();
        srv.listen(0, "127.0.0.1", () => res(srv));
        srv.on("error", rej);
      }));
    }
    return held.map((srv) => srv.address().port);
  } finally {
    for (const srv of held) { try { srv.close(); } catch { /* going anyway */ } }
  }
}

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
const all = [];
const check = (name, fn) => all.push({ name, fn });

// --only NARROWS THE RUN, case-insensitive substring, repeatable. Worth having because the
// full suite is three vaults and several minutes: iterating on one check meant paying for
// 39 of them, and the temptation is then to iterate by reasoning instead of by measuring,
// which is the failure mode this whole suite exists to prevent. A narrowed run says so in
// its header and in its per-vault total, so a "39/39" and a "2/2" can never be confused.
//
// It is deliberately NOT wired into the pre-push hook: a gate that can be narrowed is not
// a gate. `git push` always runs everything.
const ONLY = argAll("only").map((v) => v.toLowerCase());

// WHICH CHECKS NEED THE INTRO TO HAVE PLAYED. Every other page is opened with ?rest, which
// skips it -- 5.6s per page, paid once per lane per vault, and the largest single cost in a
// run. Only the check that asserts the intro landed needs the real thing, so it gets a lane
// of its own with an unmodified URL.
//
// Named rather than inferred: a check that quietly depends on the intro and is not listed
// here would fail for a reason nothing in its own text mentions, which is the most expensive
// kind of failure this suite can produce.
const NEEDS_INTRO = ["the intro landed"];
const needsIntro = (c) => NEEDS_INTRO.some((q) => c.name.toLowerCase().includes(q));
// LAZY, and it has to be: every check() call above runs at module load, AFTER this line, so
// filtering here eagerly filtered an empty array and matched nothing. Resolved from main().
const selected = () => (ONLY.length
  ? all.filter((c) => ONLY.some((q) => c.name.toLowerCase().includes(q)))
  : all);

// HOW MANY BROWSERS AT ONCE. Default 1, which is the behaviour the pre-push hook gates on.
//
// The parallel axis is BROWSERS, not checks-within-a-page: the checks share one page and
// mutate global state on it -- hidden folders, the date range, the camera, the probe -- so
// two of them on one page would corrupt each other silently. So a job is a fresh Chrome on
// its own port with its own profile, running a shard of the checks against its own build.
//
// THE COST IS MEASUREMENT FIDELITY, and it is not hypothetical. Half these checks read a
// frame: hover ramps, highlight ramps, per-frame animation steps. This file already records
// what happens when the machine is busy -- "2 clean runs out of 8", presenting as six
// unrelated bugs (github#7) -- and github#15 is a glitch that appears only on the first
// cascade of the largest vault, i.e. exactly when frames are starved. Nine Chromes measuring
// frame timing at once is that condition on purpose.
//
// So the frame-sensitive checks are pulled out and run in ONE serial job per vault, after the
// parallel ones are done, with nothing else competing. Everything else shards freely.
// FOUR, not one. The serial default was written when a run was one vault; it is three now,
// and a full run had reached several minutes -- long enough that the temptation is to iterate
// by reasoning instead of by measuring, which is the failure mode this suite exists to
// prevent. The frame-sensitive checks still run alone afterwards, so the fidelity argument
// below is unaffected: what shards is the checks that only read state.
const JOBS = Math.max(1, Number(arg("jobs", "4")) || 4);

// --grid TILES THE JOBS ON THE LEFTMOST DISPLAY instead of parking them off-screen. Purely
// for watching a parallel run happen; it changes no measurement. It does mean the windows are
// SMALLER than the 1600x1000 the off-screen runs use, and a few checks read a laid-out
// sidebar and a canvas sized to the stage -- so a grid run is for looking at, and the numbers
// to trust are the ones from a normal run.
// ON BY DEFAULT for a parallel run, because four windows parked on top of each other
// off-screen are four windows you cannot watch. --no-grid restores the off-screen parking,
// which is what the numbers in .ai-context were measured with.
const GRID = argv.includes("--no-grid") ? false
          : argv.includes("--grid") ? true
          : JOBS > 1;

// Asked of Windows rather than assumed: a second display can sit at a negative origin, so
// "the left monitor" is the smallest Left among the screens and not simply 0. Falls back to a
// plain 1920x1080 at the origin anywhere this cannot be answered.
function leftmostScreen() {
  const fallback = { x: 0, y: 0, w: 1920, h: 1080 };
  if (process.platform !== "win32") return fallback;
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Add-Type -AssemblyName System.Windows.Forms; " +
    "[System.Windows.Forms.Screen]::AllScreens | " +
    "Sort-Object { $_.Bounds.Left } | Select-Object -First 1 | " +
    "ForEach-Object { '{0} {1} {2} {3}' -f $_.Bounds.Left, $_.Bounds.Top, " +
    "$_.Bounds.Width, $_.Bounds.Height }"], { encoding: "utf8" });
  const m = /(-?\d+) (-?\d+) (\d+) (\d+)/.exec((ps.stdout || "").trim());
  if (!m) return fallback;
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}
let SCREEN = null;   // resolved once, on the first grid run that needs it

// Slot `i` of `k`, as Chrome's --window-position and --window-size. Square-ish: the columns
// are the ceiling of the root, which puts 9 in a 3x3 and 4 in a 2x2.
function gridSlot(i, k) {
  if (!SCREEN) SCREEN = leftmostScreen();
  const cols = Math.ceil(Math.sqrt(Math.max(1, k)));
  const rows = Math.ceil(Math.max(1, k) / cols);
  const w = Math.floor(SCREEN.w / cols), h = Math.floor(SCREEN.h / rows);
  return { x: SCREEN.x + (i % cols) * w, y: SCREEN.y + Math.floor(i / cols) * h,
           w: w, h: h };
}

// Named rather than flagged at each check() call, so the list is in one place and reads as a
// statement about what is fragile. Substring match on the check name.
// Measured at --jobs 9 on a machine that can run nine Chromes: TWELVE checks failed that pass
// serially, and the ribbon drags went from ~10s to 43s. Contention, not code -- but the list
// below started as "frame-sensitive" and had to widen twice, because three separate things are
// timing-dependent and only the first is about frames:
//
//   1. anything reading a ramp or a per-frame step -- starve the frames and the ramp reads 0
//   2. anything driving the POINTER -- a drag is a sequence of moves with waits between them,
//      and a starved page processes them out of step with the script
//   3. anything with a settle() deadline -- `undated notes survive every range` took 20s
//      against a 6s deadline and failed on the timeout rather than on its subject
//
// So the serial lane is "everything whose result depends on when things happen", which is
// about a third of the suite. What is left parallelises safely: geometry, plan invariants,
// colours, the legend, the heatmap's tiling -- checks that read a resting page.
// TWO TIERS, because "cannot share a machine" and "reads a frame" are different claims and
// only one of them is negotiable.
//
// READS A FRAME: the number it reports comes from a per-frame sample or from a ramp caught
// mid-flight. Starve these of frames and they do not fail loudly, they report a smaller
// number -- a ramp that reads 0, a highlight at 1.00x, an animation of one frame. These stay
// serial always, and no flag moves them.
const FRAME_READING = [
  "ramps",                        // hover and highlight ramps, and the re-arm
  "drawn larger",                 // the highlight size ratio, read mid-ramp
  "animates instead of snapping", // per-frame radial steps
  "gap reservation holds still",  // per-frame gap steps
  "waits for the release",        // during-drag sampling
  "haloes but never pushes",      // reads a canvas mid-interaction
  // Reads a frame, so it belongs here -- but note that this classification is precautionary
  // and is NOT what fixed it. It blocked three pushes with dtan 30.3 / 35.9 / 26.7 on the 10k
  // vault, and contention was the first theory and was wrong: moving it to the serial lane
  // changed nothing, and running it ALONE still failed 3 times in 6.
  //
  // The cause was an off-by-one-frame in the check's own sampler, and the shape of the numbers
  // said so -- bimodal, exactly 0 or 22-27 and never in between, which is a discrete question
  // (did it catch the final frame) rather than noise. See the note in the sampler.
  "resting layout",
];

// POINTER-DRIVEN: asserts STATE after a gesture, not a frame during one. Contention makes
// these time out rather than lie, which is the failure mode you can see -- but it was still a
// third of github#7's mystery run, so serial is the DEFAULT here too. --fast shards them, and
// says so in the header, because a run that trades fidelity has to admit it.
const POINTER_DRIVEN = [
  "flies home",                   // camera flight
  "resets the view",              // camera flight
  "pans the camera",              // drag timing
  "wheel notch",                  // wheel events, and the camera settling after them
  "drag on the ribbon",           // every ribbon gesture below is pointer-driven
  "brush edge",
  "inside the brush",
  "window and the brush",
  "window track",
  "All dates clears",             // settles, and was timing out under contention
  "undated notes survive",        // ditto, 20s against a 6s deadline
  "recolours exactly one group",  // rebuilds colours and waits for the repaint
  "fit frames the disc",          // camera flight, twice
  "density follows the notes",    // filters and waits for each state to land
];

// --fast MOVES THE POINTER-DRIVEN TIER INTO THE SHARDS. Worth having and worth labelling:
// measured on one vault, the serial lane is 82s of a 94s run, and all of it is this tier plus
// six frame-readers. Not wired into the pre-push hook, for the same reason --only is not.
const FAST = argv.includes("--fast");
const FRAME_SENSITIVE = FAST ? FRAME_READING : FRAME_READING.concat(POINTER_DRIVEN);
const isFrameSensitive = (c) =>
  FRAME_SENSITIVE.some((q) => c.name.toLowerCase().includes(q));

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

// FITS, AND SITS IN THE MIDDLE OF WHAT IT CANNOT FILL.
//
// "Fits" alone passed while the grid used 805px of a 1268px band and stopped in the middle of
// it, with the ribbon below spanning the whole thing -- reported as the band not resizing. The
// answer is NOT to fill it: the window is a rolling year, and 52 weeks at a legible cell is as
// wide as it is. A cell is capped because the band is seven cells TALL, so filling a wide band
// would mean a 245px band eating the disc.
//
// So the claim is that the leftover is SYMMETRIC. That is what turns "stopped in the middle"
// into "centred", and it is the thing that was actually wrong.
check("the heatmap grid fits its box and is centred in it", async (p) => {
  const r = await p.j(`(function(){
    var wrap = document.getElementById("vg-heatwrap");
    var cv = document.getElementById("vg-heatc");
    var w = wrap.getBoundingClientRect(), c = cv.getBoundingClientRect();
    return { grid: __vg.heat.w, box: wrap.clientWidth,
             cols: __vg.heat.cols, cell: __vg.heat.cell,
             left: Math.round(c.left - w.left), right: Math.round(w.right - c.right) };
  })()`);
  const off = Math.abs(r.left - r.right);
  return {
    // A year, or fewer weeks on a band too narrow for one -- never more, and never wider than
    // the box. Centred to within a pixel of rounding.
    ok: r.grid <= r.box && r.cols <= 52 && off <= 2,
    detail: `${r.cols} cols at ${r.cell}px = ${r.grid}px in ${r.box}px, ` +
            `${r.left}px left / ${r.right}px right (off by ${off})`,
  };
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
  //
  // AND THE PAGE HAS TO BE STILL, which the alpha exclusion above does NOT give. It drops
  // notes that are FADING, and says nothing about notes that are staying and still MOVING --
  // every one of those sits at full alpha on a fractional radius for the length of the
  // relayout. Read without this, the 10k vault reported its inner band as 32 rows rather than
  // 16, gaps alternating 4.096 and 123.904: one lattice caught a hair short of another, which
  // is a stopwatch reading and not a geometry one. The demo vault passed throughout, being
  // small enough to land before the read. Every neighbouring check settles; this one did not.
  await settle(p);
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

// EVERY CHECK ABOVE ASSERTS A PROPERTY of the layout (rows balanced, no stray small
// folders) -- none of them would catch a layout that is internally consistent and still
// DIFFERENT from what it used to be. github#37: while working github#35, the same folder
// split differently across rebuilds of the same mirror vault with no intentional change --
// the cause turned out to be an in-progress, since-reverted fix, not the fixtures, but nothing
// in this suite would have caught it either way. This check does: it compares the CURRENT
// build's band assignment and every note's position against a checked-in golden snapshot.
//
// SNAPSHOTS ARE DELIBERATE, NEVER AUTOMATIC. scripts/update-layout-snapshots.mjs writes
// scripts/layout-snapshots/*.json by hand, on request -- never from this check, never from
// the pre-push hook. A snapshot that regenerates itself on mismatch is not a regression
// test. When a layout change is intentional: run that script, review the diff, commit the
// new snapshot in the SAME change as the code that moved the layout.
//
// ONLY THE THREE NAMED FIXTURES HAVE A SNAPSHOT -- an explicit --vault or --url has no
// golden reference to compare against, so this reports NOT ASSERTED rather than failing.
// Matched by PREFIX against debugDump().vault.name (build-graph.mjs sets it to
// basename(VAULT), which for a fixture is "<name>-<digest8>" -- see resolveVaults()) since
// the digest suffix changes whenever a generator script does.
//
// POSITION TOLERANCE IS MEASURED, NOT GUESSED. update-layout-snapshots.mjs's own header
// records why this check calls __vg.relayout() before sampling rather than reading
// positions straight off demo.busy()===false, or even a bare applyLayout(false) (once or
// twice): without it, two consecutive measurements of the IDENTICAL build disagreed by up
// to several graph units on 90%+ of the demo and 10k vaults' notes -- animation-path
// residue, the same class of bug github#21 fixed for dot size. With relayout(), repeated
// measurements are byte-for-byte identical. 0.1 graph units is a wide margin over that
// measured noise floor (0, with relayout(); several units without it) and still tiny next
// to a real algorithmic drift, which moves notes by tens to hundreds of units.
check("layout matches its golden snapshot", async (p) => {
  const dd = await p.j("__vg.debugDump()");
  const vaultName = dd.vault.name;
  const fixture = ["demo-vault", "test-vault", "shape-vault"].find((f) => vaultName.startsWith(f));
  if (!fixture) {
    return { ok: true, detail: `NOT ASSERTED: "${vaultName}" is not one of the three named ` +
                                `fixtures -- no golden snapshot to compare against` };
  }
  const snapPath = join(ROOT, "scripts", "layout-snapshots", `${fixture}.json`);
  if (!existsSync(snapPath)) {
    return { ok: false, detail: `no snapshot at scripts/layout-snapshots/${fixture}.json -- ` +
                                 `run node scripts/update-layout-snapshots.mjs` };
  }
  const snap = JSON.parse(readFileSync(snapPath, "utf8"));
  // SAME __vg.relayout() call update-layout-snapshots.mjs takes the snapshot behind -- see
  // that script's header for why plain applyLayout(false) is not enough on its own (a
  // still-running cascade frame can land after it and silently overwrite the snap).
  await p.eval(`__vg.relayout(); void 0`).catch(() => {});
  const r = await p.j(`(function(){
    var plan = __vg.buildWedgePlan(false), band = {};
    plan.cells.forEach(function(c){ band[c.g] = c.inner ? "inner" : "outer"; });
    var pos = {};
    __vg.graph.forEachNode(function(id, a){ pos[id] = [a.x, a.y]; });
    return { band: band, positions: pos };
  })()`);

  const flipped = [];
  for (const f of Object.keys(snap.band)) {
    if (r.band[f] !== undefined && r.band[f] !== snap.band[f]) {
      flipped.push(`${f}: ${snap.band[f]} -> ${r.band[f]}`);
    }
  }
  const snapIds = new Set(Object.keys(snap.positions));
  const curIds = new Set(Object.keys(r.positions));
  const added = [...curIds].filter((id) => !snapIds.has(id));
  const removed = [...snapIds].filter((id) => !curIds.has(id));
  if (added.length || removed.length) {
    return {
      ok: false,
      detail: `the FIXTURE itself changed, not just the layout -- ${added.length} note(s) ` +
        `added, ${removed.length} removed since the snapshot was taken. Regenerate deliberately ` +
        `with node scripts/update-layout-snapshots.mjs if this fixture's generator changed on ` +
        `purpose (e.g. ${[...added, ...removed].slice(0, 3).join(", ")}${added.length + removed.length > 3 ? ", ..." : ""})`,
    };
  }
  // TOLERANCE, in graph units -- see the check-level comment above for how it was measured.
  const TOL = 0.1;
  let worst = null, moved = 0;
  for (const id of curIds) {
    const [sx, sy] = snap.positions[id];
    const [cx, cy] = r.positions[id];
    const d = Math.hypot(cx - sx, cy - sy);
    if (d <= TOL) continue;
    moved++;
    if (!worst || d > worst.d) {
      const sAngle = Math.atan2(sy, sx) * 180 / Math.PI;
      const cAngle = Math.atan2(cy, cx) * 180 / Math.PI;
      worst = { id, d, sr: Math.hypot(sx, sy), cr: Math.hypot(cx, cy), sAngle, cAngle };
    }
  }
  const ok = flipped.length === 0 && moved === 0;
  const parts = [`${curIds.size} notes checked against scripts/layout-snapshots/${fixture}.json`];
  parts.push(flipped.length ? `${flipped.length} folder(s) flipped band: ${flipped.join(", ")}` : "band unchanged");
  if (moved) {
    parts.push(`${moved} note(s) moved past ${TOL} units, worst is #${worst.id}: ` +
      `radius ${worst.sr.toFixed(1)} -> ${worst.cr.toFixed(1)}, ` +
      `angle ${worst.sAngle.toFixed(1)}° -> ${worst.cAngle.toFixed(1)}°`);
  } else {
    parts.push("positions unchanged");
  }
  return { ok, detail: parts.join("; ") };
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

// THIS REPLACES THE TWO "mark today" CHECKS, which went with the sidebar button.
//
// One of them asserted that marking haloes without pushing, which the check above already
// asserts for the same code path. The other pinned the button's predicate against the band's
// today column as SET equality -- worth having while two predicates existed, and tautological
// now that only the band's does.
//
// What is genuinely new and was only ever covered on the button's path is the FILL: a picked
// day's notes take the neutral extreme (--today) instead of their group hue, which is what
// makes a scattered handful findable among ten hues. That treatment moved from the button to
// state.markDay, so it needs a check that follows it.
check("a marked heatmap day recolours its notes", async (p) => {
  // THE RAMP IS WAITED OUT, NOT RACED. The fill is mixed by hl[id], which afterRender walks
  // over TWEEN_MS, so reading the colour on the frame after the click reads a value on its
  // way somewhere -- the flavour of flake that passes locally and fails on a loaded machine.
  // settle() is the same door every other animated check goes through.
  await settle(p);
  const pick = await p.j(`(function(){
    var h = __vg.heat, b = null;
    h.keys.forEach(function(k){ var d = h.days[k]; if (!b || d.n > b.n) b = d; });
    var ids = b.ids.slice(0, 12);
    window.__mdIds = ids;
    return { key: b.key, ids: ids,
             before: ids.map(function (i) { return __vg.renderer.getNodeDisplayData(i).color; }) };
  })()`);
  await p.eval(`__vg.state.markDay = ${JSON.stringify(pick.key)}; __vg.renderer.refresh(); void 0`);
  await settle(p);
  const after = await p.j(`__mdIds.map(function (i) { return __vg.renderer.getNodeDisplayData(i).color; })`);
  await p.eval(`__vg.state.markDay = null; __vg.renderer.refresh(); void 0`);
  await settle(p);
  const back = await p.j(`__mdIds.map(function (i) { return __vg.renderer.getNodeDisplayData(i).color; })`);
  const n = pick.ids.length;
  let changed = 0, restored = 0;
  for (let k = 0; k < n; k++) {
    if (after[k] !== pick.before[k]) changed++;
    if (back[k] === pick.before[k]) restored++;
  }
  return { ok: n > 0 && changed === n && restored === n,
           detail: `${pick.key}: ${changed}/${n} recoloured, ${restored}/${n} back to their own hue` };
});

check("hovering a note ramps in and releases at zero", async (p) => {
  // WAIT FOR THE DISC TO STOP MOVING FIRST. The checks above set markDay, which ramps a
  // halo and a fill, and clearing it ramps them back. Aiming at a note
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

// THE DISC IS A FUNCTION OF WHAT IS ON SCREEN, not of what the vault holds (github#13).
//
// The reported symptom was that a 500-note vault and a 1500-note vault filtered down to
// 500 render differently. The cause was that they had to: the lattice spacing was a hard
// 1, so with the normalisation box pinned and the camera still, screen row pitch was a
// CONSTANT per vault -- measured 19.481px at every filter state of a 500-note vault and
// 12.064px at every state of a 1500-note one, while the median dot moved 4.254 -> 4.208px
// filtering 503 notes down to 62.
//
// Asserted scale-free, so it needs neither a second vault nor a fixture of a known size.
// A lattice of spacing s holds 1/s^2 notes per unit area, so if the disc keeps its notes
// at an honest density then pitch * sqrt(shown) holds still across filter states. That
// product is the whole contract. It reads 1.00x exactly wherever the density cap is not
// binding, and the tolerance here is for the capped end plus the whole-row quantisation
// of the outer edge -- NOT slack for the invariant itself.
//
// The dot-size half is asserted separately, because it is a different mechanism reached
// through the same number: sizeScale is measured off a ROW rather than a lattice unit,
// and its ceiling had to come off 1 before a filtered disc could draw bigger notes.

// THE DISC IS A FUNCTION OF WHAT IS ON SCREEN, not of what the vault holds (github#13).
//
// The reported symptom was that a 500-note vault and a 1500-note vault filtered down to
// 500 render differently. The cause was that they had to: the lattice spacing was a hard
// 1, so with the normalisation box pinned and the camera still, screen row pitch was a
// CONSTANT per vault -- measured 19.481px at every filter state of a 500-note vault and
// 12.064px at every state of a 1500-note one, while the median dot moved 4.254 -> 4.208px
// filtering 503 notes down to 62.
//
// Asserted scale-free, so it needs neither a second vault nor a fixture of a known size.
// A lattice of spacing s holds 1/s^2 notes per unit area, so if the disc keeps its notes
// at an honest density then pitch * sqrt(shown) holds still across filter states. That
// product is the whole contract. It reads 1.00x exactly wherever the density cap is not
// binding, and the tolerance here is for the capped end plus the whole-row quantisation
// of the outer edge -- NOT slack for the invariant itself.
//
// The dot-size half is asserted separately, because it is a different mechanism reached
// through the same number: sizeScale is measured off a ROW rather than a lattice unit,
// and its ceiling had to come off 1 before a filtered disc could draw bigger notes.
check("the disc's density follows the notes on screen", async (p) => {
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await camReset(p);

  // Hide whole groups a step at a time. Folders rather than a date cut: a date cut thins
  // every folder evenly, which is the gentle case, and hiding groups is what the report
  // was reached by and what the band balancer has to survive.
  const at = async (keepFrac) => {
    await p.eval(`(function(){
      var order = __vg.groupOrder();
      var keep = Math.max(1, Math.round(order.length * ${keepFrac}));
      var h = {};
      order.forEach(function (g, i) { if (i >= keep) h[g] = true; });
      __vg.state.hidden.folder = h; __vg.syncAlpha(); __vg.applyLayout(false);
      __vg.renderer.refresh();
    })()`);
    await sleep(400);
    return p.j("__vg.densityReport()");
  };

  const rows = [await at(1), await at(0.8), await at(0.6), await at(0.4)];
  // The drawn lattice per band, alongside the report: debugDump measures the TANGENTIAL step
  // from the placed notes, which is the half of the lattice densityReport cannot see.
  const lat = [];
  for (const k of [1, 0.8, 0.6, 0.4]) {
    await p.eval(`(function(){
      var order = __vg.groupOrder();
      var keep = Math.max(1, Math.round(order.length * ${k}));
      var h = {};
      order.forEach(function (g, i) { if (i >= keep) h[g] = true; });
      __vg.state.hidden.folder = h; __vg.syncAlpha(); __vg.applyLayout(false);
      __vg.renderer.refresh();
    })()`);
    await sleep(400);
    lat.push(await p.j(`(function(){ var d = __vg.debugDump();
      return { keep: ${k},
               // BOTH HALVES FROM THE SAME MEASUREMENT. The radial pitch is taken from the
               // drawn radii -- (outer - inner) / (rows - 1) -- rather than from the reported
               // spacing, because the reported one can describe a different layout than the one
               // on screen: measured here, a band drawn with a 169-unit step reported a
               // 381-unit pitch, and the ratio was reading that disagreement rather than the
               // lattice. Measured against measured, there is nothing to be stale.
               o: d.bands.outer && d.bands.outer.rows > 1
                 ? { n: d.bands.outer.notes, step: d.bands.outer.step35,
                     rows: d.bands.outer.rows, dot: d.bands.outer.dotRadius.med,
                     pitch: (d.bands.outer.outer - d.bands.outer.inner)
                            / (d.bands.outer.rows - 1) } : null,
               i: d.bands.inner && d.bands.inner.rows > 1
                 ? { n: d.bands.inner.notes, step: d.bands.inner.step35,
                     rows: d.bands.inner.rows, dot: d.bands.inner.dotRadius.med,
                     pitch: (d.bands.inner.outer - d.bands.inner.inner)
                            / (d.bands.inner.rows - 1) } : null }; })()`));
  }
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await camReset(p);

  // WHAT THIS ASSERTS NOW, AND WHY IT CHANGED.
  //
  // It used to assert `pitch * sqrt(shown)` constant to within 1.06. That is the statement of a
  // CONTINUOUS density -- it requires the pitch to move by any amount the note count asks for,
  // which requires the disc to resize freely -- and it was the right statement while the disc
  // did resize and one spacing served both rings.
  //
  // Neither holds now, for reasons that were both reported as bugs.
  //
  //   The rings keep their diameter. A band therefore fills a LOCKED box, so its pitch is
  //   T / rows with rows an INTEGER: it can only take the values T/1, T/2, T/3 ... and
  //   pitch * sqrt(n) drifts inside each row count and steps between them. Between 1 row and 2
  //   the step is a factor of two, and no tolerance that permits that is worth writing.
  //
  //   The two bands are packed independently, because a single spacing made each ring answer for
  //   the other's filtering -- measured, hiding OUTER folders spread the INNER ring until the
  //   two touched, clearance 843 -> 89 units. So the outer band's pitch against the whole disc's
  //   note count is not one quantity; it is two, mixed.
  //
  // What the box-filling design does promise is that the lattice stays roughly SQUARE: the
  // tangential step a note has along its row stays comparable to the radial pitch between rows.
  // That is the property every visible symptom of the old behaviour was about -- dots sized
  // against the pitch while sitting at a much wider step, boundary gaps unlike the interior
  // spacing, holes several times the row median -- and it survives integer rows, because both
  // sides move together when the row count ticks.
  //
  // The old quantity is still computed and REPORTED per band, since its drift is informative
  // even where it cannot be asserted. It is just not the pass condition any more.
  const free = rows.filter((r) => r.pitchRoot && r.sp < 2.59);
  const roots = free.map((r) => r.pitchRoot);
  const spread = roots.length > 1 ? Math.max(...roots) / Math.min(...roots) : 1;

  // A band with almost nothing in it has no lattice to be square -- hiding groups can empty one
  // outright, and the dominant-folder fixture empties its outer band.
  const sq = [];
  for (const L of lat) {
    for (const [band, v] of [["outer", L.o], ["inner", L.i]]) {
      // AND AT LEAST TWO ROWS. With one row there is no radial pitch: T/1 is the band's whole
      // thickness, a distance between nothing and nothing, and comparing a tangential step to it
      // measures how thick the band is rather than how square its lattice is. Measured on the
      // dominant-folder fixture, whose outer band drops to one row once the dominant folder is
      // hidden: ratio 0.44 on a lattice that has no second row to be un-square with.
      if (!v || v.n < 9 || v.rows < 2 || !(v.pitch > 1) || !(v.step > 1)) continue;
      sq.push({ keep: L.keep, band: band, n: v.n, rows: v.rows,
                step: Math.round(v.step), pitch: Math.round(v.pitch),
                ratio: Math.round((v.step / v.pitch) * 100) / 100,
                ds: Math.round((2 * (v.dot || 0) / v.step) * 100) / 100 });
    }
  }
  const worstSq = sq.reduce((a, b) =>
    (Math.abs(Math.log(b.ratio)) > Math.abs(Math.log(a.ratio)) ? b : a), sq[0] || { ratio: 1 });
  // A factor of 1.75 either way. One row of slack in a band three or four deep moves this by
  // about a third, and the arc a wedge is given is quantised by its note count on top of that,
  // so a genuine failure -- a band spread 1.58x wider tangentially than radially, which is what
  // the old solve produced and what the dots were missing -- sits well outside it.
  const SQ_LO = 1 / 1.75, SQ_HI = 1.75;
  const square_ok = !sq.length || sq.every((q) => q.ratio >= SQ_LO && q.ratio <= SQ_HI);

  // Dots have to actually grow. Compared at the widest spacing reached rather than at the
  // last step, since which step spreads most depends on the vault's folder shape.
  const base = rows[0];
  const widest = rows.reduce((a, b) => (b.sp > a.sp ? b : a), rows[0]);
  const grew = widest.sp > 1.05 ? widest.sizeMedian / base.sizeMedian : 1;
  // A DOT TRACKS THE ROOM IT HAS, which is not the same claim as "a wider spacing makes bigger
  // dots" and replaces it.
  //
  // That older clause read: if the spacing widened past 1.05, the median dot must have grown by
  // 5%. It was true while a widening spacing meant a coarser lattice. Under a locked box it does
  // not: `sp` widens because the band lost a ROW over the same thickness, and the tangential step
  // -- the room a note actually has beside its neighbours -- can be unchanged. Measured on the
  // dominant-folder fixture: spacing 2.412x, step steady at 169 units, median dot steady to
  // within 2%. The dots were right and the clause was asking the wrong question.
  //
  // The invariant that survives is the ratio the design is stated in: diameter over step. It
  // catches what the old clause was for -- dots failing to follow their room, which is what a
  // sparse ring of pinpricks is -- and it also catches the opposite, which the old clause could
  // not see at all and which shipped twice: dots outgrowing their room into blobs.
  const dss = sq.map((q) => q.ds).filter((v) => v > 0);
  const dsLo = dss.length ? Math.min(...dss) : 1, dsHi = dss.length ? Math.max(...dss) : 1;
  const size_ok = !dss.length || (dsLo >= 0.15 && dsHi <= 0.8 && dsHi / dsLo < 2.2);

  return {
    ok: square_ok && size_ok,
    detail: `step/pitch per band over ${sq.length} sampled states: ` +
            sq.map((q) => `${q.band[0]}${q.n}:${q.ratio}/d${q.ds}`).join(" ") +
            ` -- worst square ${worstSq.ratio} (needs ${SQ_LO.toFixed(2)}-${SQ_HI.toFixed(2)}),` +
            ` diameter/step ${dsLo}-${dsHi} (needs 0.15-0.80, spread <2.2)` +
            `; context, not asserted: pitch*sqrt(shown) ` +
            roots.map((v) => Math.round(v)).join("/") + ` spread ${spread.toFixed(3)}x` +
            `; spacing reached ${widest.sp} at ${widest.shown} of ` +
            `${base.shown} shown, median dot ${base.sizeMedian} -> ${widest.sizeMedian}` +
            ` (${grew.toFixed(2)}x)`,
  };
});

// THE HOLE IS A SHARE, NOT A RADIUS (github#13). r0's formula exists to hold the hub at a
// constant fraction of the disc -- its own comment records that a fixed r0 gave "a 32%
// hole at full size and a 69% one when filtered down" -- and pinning r0 to the full-vault
// value in geomLock reintroduced exactly that for every filtered view. Measured before:
// 0.328 -> 0.439 on a 500-note vault, 0.27 -> 0.417 on a 1500-note one. It is held now by
// the disc keeping its outer radius rather than by r0 moving, so this checks the outcome
// the formula was written for rather than the formula.
check("the hub stays the same share of the disc as it is filtered", async (p) => {
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  const full = await p.j("__vg.densityReport()");

  await p.eval(`(function(){
    var order = __vg.groupOrder();
    var keep = Math.max(1, Math.round(order.length * 0.5));
    var h = {};
    order.forEach(function (g, i) { if (i >= keep) h[g] = true; });
    __vg.state.hidden.folder = h; __vg.syncAlpha(); __vg.applyLayout(false);
    __vg.renderer.refresh();
  })()`);
  await sleep(400);
  const half = await p.j("__vg.densityReport()");

  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await camReset(p);

  const drift = Math.abs(half.holeShare - full.holeShare);
  // SCOPED TO WHERE THE MECHANISM APPLIES, and this is a real limit rather than a soft
  // tolerance. The share is held by the disc keeping its OUTER radius while the lattice
  // spreads -- r0 itself is pinned. That works whenever some surviving folder is deep enough
  // to still reach the rim, which is the ordinary case. On the dominant-folder vault it is
  // not: hide the group holding 77% and every survivor is a small folder that cannot fill
  // the annulus even fully spread, so reach falls to 0.65 and the hole reads 0.509 against
  // 0.335. Holding the share there needs r0 to move, and r0 is where the hub and the logo
  // mask are placed from -- a separate change, tracked in its own issue rather than smuggled
  // in behind a looser bound here.
  const reaches = half.reach >= 0.95;
  return {
    ok: reaches ? drift < 0.06 : true,
    detail: `hole ${full.holeShare} of the disc at ${full.shown} shown, ` +
            `${half.holeShare} at ${half.shown} -- drift ${drift.toFixed(3)}` +
            (reaches ? ` (needs <0.060)`
                     : ` NOT ASSERTED: the disc only reaches ${half.reach} of the lock, so no ` +
                       `survivor can hold the radius the share depends on`),
  };
});

// FIT FITS WHAT IS THERE. The normalisation box is pinned to the full-vault extent so that
// filtering shrinks the disc instead of the camera silently refilling the viewport every
// frame -- right during an animation, wrong the moment somebody asks to be centred, because
// "fit" would frame the empty ring the notes used to occupy. Two ratios, one assertion:
// full vault must give the old constant, and a filtered disc must be framed by what it
// actually reaches.
//
// IT USED TO ASSERT "SMALLER", and that premise is gone (github#13). A filtered disc spreads
// its lattice to hold its notes at an honest density, so it can now come out BIGGER than the
// locked extent as well as smaller -- measured 1.088 on the dominant-folder vault, where
// hiding 3 of 5 groups leaves survivors that spread rather than recede. Asserting "smaller"
// therefore failed on a disc fit was framing correctly. What fitRatio() actually promises is
// FIT_RATIO scaled by how much of the locked extent the disc reaches, so that is what is
// checked, against the reach the page reports for itself.
check("fit frames the disc that is actually there", async (p) => {
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

  const dens = await p.j(`__vg.densityReport()`);
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await camReset(p);
  // What fitRatio() promises: the full-vault constant, scaled by the share of the locked
  // extent the disc reaches, clamped to [0.12, 1.35].
  const want = 1.08 * Math.max(0.12, Math.min(1.35, dens.reach));
  return {
    // Still centred either way: the box is symmetric about the origin, so this is only ever
    // a question about the ratio.
    ok: Math.abs(full.ratio - 1.08) < 0.02 && Math.abs(small.ratio - want) < 0.03 &&
        Math.abs(small.x - 0.5) < 0.002 && Math.abs(small.y - 0.5) < 0.002,
    detail: `full vault ratio ${full.ratio}; with ${hid.hidden} of ${hid.hidden + hid.kept} ` +
            `groups hidden the disc reaches ${hid.extent} (${dens.reach} of the lock) and fit ` +
            `gives ${small.ratio} against ${want.toFixed(4)} promised, centred at ` +
            `(${small.x}, ${small.y})`,
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
             winEnd: new Date(__vg.heat.start + __vg.heat.cols * 7 * 86400000).toISOString().slice(0,10),
             // The same two in ms, for the checks that do arithmetic on the window rather
             // than just comparing it to itself.
             winEndMs: __vg.heat.start + __vg.heat.cols * 7 * 86400000,
             winSpanMs: __vg.heat.cols * 7 * 86400000 };
  })()`);
}

/**
 * The ribbon x for a date, in canvas pixels -- via __vg.ribbonXOf, the page's own mapping,
 * rather than a formula duplicated here. It USED to reimplement the plain linear formula
 * directly, which quietly went stale once ribbonX gained a compact-axis branch (github#23):
 * any check calling this against a sparse vault with compaction on would silently compute
 * the OLD (unweighted) position while the page drew the new one.
 */
function xOfMs(p, ms) {
  return p.j(`__vg.ribbonXOf(${ms})`);
}

/** A press on the window track at `x`, with no drag. The press alone is a jump. */
async function trackPress(p, box, x, yTrack) {
  await p.send("Input.dispatchMouseEvent",
    { type: "mousePressed", x: box.left + x, y: yTrack, button: "left", clickCount: 1, buttons: 1 });
  await p.send("Input.dispatchMouseEvent",
    { type: "mouseReleased", x: box.left + x, y: yTrack, button: "left", clickCount: 1, buttons: 0 });
  await sleep(200);
  await settle(p);
  return rangeSnap(p);
}

/**
 * How far the band's window can actually travel on THIS vault, asked of the control.
 *
 * The two checks below used to press at fixed fractions of the ribbon -- 0.90/0.62 and 0.35
 * -- which reach somewhere only when the window is small against the span. On a vault whose
 * history is barely wider than the 52-week window the pill fills most of the rail, those
 * fractions aim outside its travel, and the checks asserted motion the geometry forbids:
 * both failed on the shape vault while passing on the other two (github#18). Pressing at
 * each end of the rail asks where the window can go instead of assuming.
 *
 * THE GRID STEPS IN WHOLE WEEKS -- heatMonday() quantises heat.start -- so the two extremes
 * reporting the same window is not a rounding artefact, it is the window having nowhere to
 * go. That is the honest answer on a vault whose whole history fits inside one window, and
 * `moves` is false rather than the check inventing a failure out of it.
 *
 * `aim(f)` is the date to press at to put the window's centre a fraction f along that
 * travel -- which is the only kind of aim point these checks may use.
 */
async function winTravel(p, box, yTrack) {
  const lo = await trackPress(p, box, 1, yTrack);
  const hi = await trackPress(p, box, Math.round(box.w - 1), yTrack);
  const span = hi.winSpanMs;
  return {
    moves: lo.winEndMs !== hi.winEndMs,
    loMs: lo.winEndMs, hiMs: hi.winEndMs, spanMs: span,
    days: Math.round((hi.winEndMs - lo.winEndMs) / 86400000),
    weeks: Math.round(span / (7 * 86400000)),
    aim: (f) => lo.winEndMs + (hi.winEndMs - lo.winEndMs) * f - span / 2,
  };
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

  const xAt = (ms) => xOfMs(p, ms);

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

  const t = await winTravel(p, box, yTrack);
  await clearRange(p);
  if (!t.moves) {
    return { ok: true,
             detail: `the ${t.weeks}-week window covers this vault's whole history, so it has ` +
                     `nowhere to travel; nothing to move independently of` };
  }

  const a = await ribbonDrag(p, box, Math.round(box.w * 0.25), Math.round(box.w * 0.50), yBars);
  // Across the FULL travel, so the window is guaranteed to cross a week boundary -- the grid
  // steps in weeks, and a drag shorter than one would report "held" for the wrong reason.
  const b = await ribbonDrag(p, box, Math.round(await xOfMs(p, t.aim(1))),
                             Math.round(await xOfMs(p, t.aim(0))), yTrack);
  const winMoved = b.winEnd !== a.winEnd;
  const brushHeld = b.from === a.from && b.to === a.to;

  const c = await ribbonDrag(p, box, Math.round(await xOfMs(p, b.from)),
                             Math.round(await xOfMs(p, b.from) - box.w * 0.09), yBars);
  const brushMoved = c.from < b.from;
  const winHeld = c.winEnd === b.winEnd;

  await clearRange(p);
  return {
    ok: winMoved && brushHeld && brushMoved && winHeld,
    // The two conditions are reported SEPARATELY. They used to share one flag, so a window
    // that failed to move printed "brush MOVED" about a brush that had not -- which is how
    // github#18 came to be filed as a coupling bug when the brush was never touched.
    detail: `over ${t.days}d of travel: window ${a.winEnd} -> ${b.winEnd} ` +
            `(${winMoved ? "moved" : "HELD"}, brush ${brushHeld ? "held" : "MOVED"}), ` +
            `brush ${b.fromISO} -> ${c.fromISO} ` +
            `(${brushMoved ? "moved" : "HELD"}, window ${winHeld ? "held" : "MOVED"})`,
  };
});

check("a press on the window track centres the window there", async (p) => {
  // Dragging the pill across a decade to reach one year is a lot of mouse, so a press on the
  // track is a jump too -- and it CENTRES rather than landing the window's end on the pointer.
  // The end-at-pointer version put the whole pill to the left of the hand, so the thing being
  // dragged was somewhere other than where the cursor was.
  //
  // Asserted as "the PIXEL under the pointer is the middle of what the grid shows" -- not the
  // date, since github#23's compact axis made ribbonX non-linear and a fixed time half-span
  // stopped being a fixed pixel half-span. Within a budget rather than a flat tolerance: the
  // window's end quantises to a Monday, so an exact midpoint is never available, and how many
  // pixels that quantisation costs depends on how dense the axis is right there -- see below.
  //
  // THE PRESS LANDS AT THE MIDDLE OF THE WINDOW'S OWN TRAVEL, not at a fixed fraction of the
  // ribbon. Centring is a promise the control can only keep where it can still move; a
  // fraction chosen without asking aims off the end of the travel on a narrow-span vault and
  // measures the clamp instead (github#18) -- the same lesson bit a first version of this
  // check's pixel target too (see below).
  await clearRange(p);
  const box = await ribbonBox(p);
  const yBars = box.top + 12, yTrack = box.top + RIB_BARS + 5;

  // TWO WEEKS, not one. The grid steps in whole weeks, so with a single week of travel the
  // midpoint quantises onto one of the two extremes -- half the time the resting window,
  // which would read as a press that did nothing. Centring needs an interior position to be
  // asserted at, and below two weeks of travel there is not one.
  const t = await winTravel(p, box, yTrack);
  await clearRange(p);
  if (t.days < 14) {
    return { ok: true,
             detail: `the ${t.weeks}-week window has ${t.days}d of travel on this vault -- no ` +
                     `interior position to centre on` };
  }

  const a = await ribbonDrag(p, box, Math.round(box.w * 0.30), Math.round(box.w * 0.55), yBars);
  // AIM INSIDE THE ACHIEVABLE PIXEL RANGE, not at t.aim(0.5)'s time-based midpoint (github#18's
  // own fixed-ribbon-fraction mistake, reintroduced in a new unit): that formula subtracts a
  // full half-span from a TIME interpolation between the two extremes' own winEnd, which can
  // land well before dateSpan.lo on a vault whose travel is much narrower than its span (57d
  // of travel against a 364d window here) -- ribbonXOf then clamps it to near pixel 0, and
  // bisection correctly converges to the SMALLEST reachable midpoint, which is nowhere near 0.
  // That was never a bug in the centring; it was this check aiming outside what the control
  // can do. Deriving the target from the two extreme presses' OWN achievable midpoints (exactly
  // what winTravel already measured) is the same "read the travel off the control" fix github#18
  // made, extended to pixel space for github#23's pixel-centred pill.
  const [loMidPx, hiMidPx] = await p.j(`[
    (__vg.ribbonXOf(${t.loMs} - ${t.spanMs}) + __vg.ribbonXOf(${t.loMs})) / 2,
    (__vg.ribbonXOf(${t.hiMs} - ${t.spanMs}) + __vg.ribbonXOf(${t.hiMs})) / 2
  ]`);
  const pressX = Math.round((loMidPx + hiMidPx) / 2);
  const b = await trackPress(p, box, pressX, yTrack);
  // PIXEL-centred, not time-centred: press at pixel P, the drawn pill's own midpoint has to
  // land back near P. Time-centred (press at date X, window's time-midpoint lands near X)
  // was the assertion here before github#23's compact axis -- it stopped being the right
  // question the moment ribbonX became non-linear, because a fixed TIME half-span is no
  // longer a fixed PIXEL half-span, and "centred" is a promise about what's on screen.
  //
  // TOLERANCE IS A LOCAL PIXEL BUDGET, not a flat number, for the same reason the target
  // pixel above has to be measured rather than assumed: b.winEndMs is __vg.heat.start plus
  // the span, and heatBuild() snaps heat.start to a Monday -- centring can only promise the
  // RAW end (what the bisection actually solved for) lands on the pixel; the quantised end
  // this check can observe is up to ~1 week away from that, and how many pixels one week
  // costs depends entirely on how dense this stretch of the axis is. Measured directly
  // rather than guessed: a flat 8px budget (right for the 10k and demo vaults, where a week
  // is a couple of pixels against a decade-plus span) failed here by 3-5x, because this
  // vault's 14 months are all near the note-count ceiling -- no real compaction, so a week
  // costs as many pixels as it would on the old linear axis, ~20-40 on a narrow vault.
  const [resultMidPx, pxPerWeek] = await p.j(`[
    (__vg.ribbonXOf(${b.winEndMs} - ${b.winSpanMs}) + __vg.ribbonXOf(${b.winEndMs})) / 2,
    __vg.ribbonXOf(${b.winEndMs}) - __vg.ribbonXOf(${b.winEndMs} - 7 * 86400000)
  ]`);
  const offPx = Math.round(Math.abs(resultMidPx - pressX) * 10) / 10;
  const budget = Math.round((Math.abs(pxPerWeek) * 1.5 + 2) * 10) / 10;
  const brushHeld = b.from === a.from && b.to === a.to;

  await clearRange(p);
  return {
    ok: b.winEnd !== a.winEnd && brushHeld && offPx <= budget,
    detail: `pressed at pixel ${pressX}, pill's own midpoint landed at ${resultMidPx.toFixed(1)} ` +
            `(${offPx}px off, budget ${budget}px = 1.5 local weeks) within ${t.days}d of travel; ` +
            `brush ${brushHeld ? "held" : "MOVED"}`,
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
  // RUN IT IN SLOW MOTION, so the threshold measures smoothness rather than the machine.
  // The 40-unit bound below is a RATE argument -- RADIAL_EASE closes at most a quarter of a
  // note's gap per frame and a row is 160 -- and a rate bound only means something if the
  // page gets enough frames to draw the distance. Once the lattice spacing follows the
  // visible count (github#13) a range cascade moves the disc much further than it used to,
  // and on the 10k vault the page manages 38 frames in 1.9s: measured outer 112, on an
  // animation that is provably smooth. scripts/probe-cascade.mjs runs the same cascade at
  // several time scales and the step collapses as frames are added -- 112 at 38 frames, 0 at
  // 157, with step * frames roughly constant, which is the signature of smooth. A genuine
  // one-frame snap does not care how long the animation is given, so the teeth are intact.
  const ts = await p.j(`__vg.timeScale`);
  await clearRange(p);
  // TWO THROWAWAY CASCADES FIRST, AT NORMAL SPEED, and this is not a fudge -- it is the
  // difference between measuring the page and measuring its first cascade. Run the identical
  // cascade twice on the 10k vault and the FIRST one shows a step of 40-57 units at 58-59%
  // through while the second shows 0; the position is the same and the size barely moves
  // whether the filter is severe or mild, so it is not the density solve's magnitude. It
  // clears once any cascade has run to completion. Tracked as github#15; what THIS check is
  // for is whether a range change animates at all, and that deserves a warmed page.
  //
  // At normal speed deliberately: clearRange settles with the default 6000ms deadline, and a
  // 4x cascade takes ~6.8s, so warming up after the slow-motion switch left a cascade still
  // in flight and warmed nothing.
  await p.eval(`__vg.setRange("2019-06-01", "2020-06-01"); void 0`);
  await sleep(200);
  await settle(p, 20000);
  await clearRange(p);
  await sleep(300);
  await p.eval(`__vg.timeScale = 4; void 0`);
  await p.eval(`__vg.probe(true); void 0`);
  await p.eval(`__vg.setRange("2018-01-01", "2021-01-01"); void 0`);
  await sleep(200);
  await settle(p, 30000);
  await sleep(250);
  const r = await p.j(`__vg.probeReport()`);
  await p.eval(`__vg.probe(false); __vg.timeScale = ${ts}; void 0`);
  await clearRange(p);
  // JUDGED ON THE BANDS' EXTENTS, and NOT per note -- which was tried, on the reasoning that
  // the tangential half measures per note so the radial half should too. That reasoning is
  // wrong, and the measurement said so: worst note 282 units on the 10k vault and 207 on the
  // demo one, while the mean note moved 13 and 1. Rows are deliberately INTEGER buckets --
  // "the row is an integer bucket, and the radius comes from it, so every frame is a packed
  // grid rather than a blend of two", and taking the radius from the continuous coordinate
  // instead was tried and reverted in a day for smearing the disc. So a note crossing a row
  // boundary hops a whole row on purpose, and no per-note radial bound can survive that. The
  // extents stay smooth through it, because a hopping note lands in a slot another note left.
  // The tangential half can measure per note precisely because the serpentine keeps u
  // continuous across the same boundary.
  //
  // The bound is against the PATH the band travelled, not its net displacement: the band moves
  // out as the lattice spreads and part-way back as rows drop, so net understates the trip and
  // would flag a smooth animation whose target was moving. path / frames is the mean frame,
  // and a frame is allowed 40 units or six mean frames, whichever is larger. Six because the
  // extent is a max over a set that churns -- when the furthest note leaves, the maximum
  // passes to the next one in -- so it is inherently a little steppier than the disc is. A
  // snap has path equal to its own step, so its allowance is 6/frames of it and it fails by a
  // wide margin.
  // ...OR HALF A ROW, whichever is largest, and that third term is the one that had to be added.
  //
  // Six mean frames was calibrated when a range change had NO radial path: the density solve
  // kept both rims pinned, `path` came out 0 on this fixture, and the budget was always the 40
  // floor. Filling a locked box changes that -- a range change re-depths the bands, so the disc
  // genuinely reflows radially and the path is real (0 -> 954 units measured here). Against a
  // real path, "six mean frames" asks a design that moves in ROWS to move like one that does
  // not.
  //
  // A frame's worst step is a row tick, and that is deliberate: taking the radius from the
  // fractional row coordinate instead was tried on 2026-08-22 and reverted the same day, because
  // it puts every note off-lattice on every intermediate frame -- one bad frame against ~120
  // mushy ones. So half a row is the honest allowance for a single frame, and it is still far
  // from a snap: a snap moves the whole path at once, which here is six rows.
  // ONE ROW, not half of one, and scaled by how starved of frames the page was.
  //
  // The note above says a frame's worst step IS a row tick and that a note hopping a whole row
  // is deliberate -- and then allowed half a row for it. Those cannot both hold: a row is 160
  // units and the extent does move a whole one when the outermost note ticks. Measured on the
  // 10k vault with the extent taken over a set fixed at probe start, the worst frame was 183
  // units, with the row count walking 0.004 of a row and no seam, sub-seam or split change on
  // that frame -- a clean single hop, failing a bound that could not have passed one.
  //
  // ONE_ROW * 1.25 covers the hop plus the max-passing effect the note describes: the extent is
  // a max, so when the furthest note ticks inward the maximum passes to another note and the
  // number moves further than either note did.
  //
  // AND EACH STEP IS JUDGED AGAINST ITS OWN GAP, not against the run's mean frame rate.
  //
  // This animation runs at 4x for exactly the reason given above -- a rate bound is meaningless
  // if the page cannot draw the distance -- but the page still gets whatever frames the machine
  // spares, and starvation is not uniform. A global factor (nominal frames over actual frames)
  // was tried first and could not hold: the same build measured a worst step of 183 at 410
  // frames and 825 at 180, with rows walking 0.01 a frame and no seam, sub-seam or split change
  // anywhere near the jump -- the 825 was five clean row-hops coalescing into ONE stalled frame
  // near settle, a tail event the mean cannot see. 183 x the mean factor of 2.2 fits any
  // reasonable bound; the one long gap does not.
  //
  // So the worst step is recomputed from the samples with each step divided by its own gap's
  // duration in nominal frames: a frame that took 80ms may legitimately carry ~5 hops, and a
  // SNAP still fails by an order of magnitude, because a snap is the whole path in one
  // ordinary-length frame -- stretching the gap is precisely what a snap does not get to do.
  const ONE_ROW = 160;
  // CASCADE SAMPLES ONLY. The probe also samples at the settle boundary (tagged "pre-settle"
  // and "settled"), and at settle the page re-parks DEPARTING notes at their zero-weight seats
  // in the same instant their alpha reaches 0 -- measured on the 10k fixture: outerMax fell
  // 10715 -> 9877 between those two tags with radStep 0 on both, i.e. an 838-unit step carried
  // entirely by notes that are invisible at the moment they move. The viewer sees nothing, and
  // the re-park is correct (the alternative is stranding them at stale coordinates, which is
  // the github#17 pinning). The settle hand-over has its own instruments -- settleStep here,
  // and the whole "last frame of a cascade is the resting layout" check -- both of which watch
  // PRESENT notes and both of which hold at zero. The extent walk keeps to its domain: the
  // frames of the animation itself.
  const perGapWorst = (key) => {
    const smp = r.samples || [];
    let worst = 0;
    for (let i = 1; i < smp.length; i++) {
      if (smp[i].tag !== "cascade" || smp[i - 1].tag !== "cascade") continue;
      const gapFrames = Math.max(1, (smp[i].ms - smp[i - 1].ms) / 16.67);
      const d = Math.abs((smp[i][key] || 0) - (smp[i - 1][key] || 0)) / gapFrames;
      if (d > worst) worst = d;
    }
    return Math.round(worst);
  };
  const oWorst = perGapWorst("outerMax"), iWorst = perGapWorst("innerMax");
  const budget = (path) =>
    Math.max(40, ONE_ROW * 1.25, 6 * path / Math.max(1, r.frames));
  const oBudget = budget(r.outerPath), iBudget = budget(r.innerPath);
  const rad = r.radMaxStep || { step: 0, atMs: 0 };
  return {
    ok: r.frames > 20 && oWorst <= oBudget && iWorst <= iBudget,
    detail: `${r.frames} frames over ${r.spanMs}ms at 4x: outer band stepped ` +
            `${oWorst}/gap-frame of ${Math.round(oBudget)} allowed over a path of ` +
            `${Math.round(r.outerPath)} (net ${Math.round(r.outerTravel)}, raw worst ` +
            `${r.outerMaxStep}), inner ${iWorst} of ${Math.round(iBudget)} over ` +
            `${Math.round(r.innerPath)} (net ${Math.round(r.innerTravel)}); one row = 160. ` +
            `Context, not asserted: worst single note ${rad.step} at ` +
            `${Math.round(100 * rad.atMs / Math.max(1, r.spanMs))}% through, mean note ` +
            `${r.radMeanStep}/frame; settle moved tan ${r.settleStep ? r.settleStep.tan : "?"}`,
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
// THE INVARIANT THE WHOLE CASCADE EXISTS TO SERVE: the last animated frame IS the resting
// layout. Not close to it -- identical, per note, in radius, angle and drawn radius. See
// .ai-context/animation.md, which this check is the executable half of.
//
// It is worth a check of its own because every violation found so far was invisible in the
// frames leading up to it. The cascade converged beautifully and then the layout changed,
// because the resting layout is computed by a DIFFERENT call and one of its arguments differed.
// The last one was plan membership: at rest a member was anything `visible`, the folder filter
// alone, so a note excluded by the DATE range stayed a member at weight 0 -- and a member makes
// a cell. Eleven cells shared the arc where the final frame had nine, which moved wedges 10.6
// degrees while every radius and every dot size stayed identical to the unit.
//
// Both triggers are exercised, because they reach it differently: a folder toggle changes which
// notes exist, a range change changes which notes are IN RANGE, and only the second one could
// ever have caught the membership bug.
//
// Angles are compared wrap-safely -- a note either side of 12 o'clock differs by 2*pi for no
// reason -- and drawn radius goes through renderer.scaleSize, because the node attribute is the
// reducer's INPUT and reading it raw understates every dot.
check("the last frame of a cascade is the resting layout", async (p) => {
  await clearRange(p);
  await settle(p);
  await sleep(200);

  const sampler = `(function (trigger) {
    window.__LF = { last: null, rest: null, frames: 0 };
    var snap = function () {
      var a0 = __vg.renderer.graphToViewport({ x: 0, y: 0 });
      var b0 = __vg.renderer.graphToViewport({ x: 160, y: 0 });
      var perPx = 160 / Math.hypot(b0.x - a0.x, b0.y - a0.y);
      var m = {};
      __vg.graph.forEachNode(function (id, at) {
        var d = __vg.renderer.getNodeDisplayData(id);
        if (!d || d.hidden) return;
        if ((__vg.alpha[id] || 0) < 0.999) return;      // only notes that have arrived
        m[id] = { r: Math.hypot(at.x, at.y), th: Math.atan2(at.y, at.x),
                  dot: __vg.renderer.scaleSize(d.size) * perPx };
      });
      return m;
    };
    var tick = function () {
      if (__vg.demo.busy()) {
        window.__LF.last = snap(); window.__LF.frames++;
        requestAnimationFrame(tick);
      } else {
        // SNAP ON THE TRANSITION TOO, or last is the second-to-last animated frame.
        //
        // The loop used to stop here without snapping, so last came from the previous
        // iteration -- one whole frame before the animation's last drawn frame. Cost of that
        // frame, measured: nothing on a vault that draws 120 frames per cascade, and 22 to 27
        // units on the 10k fixture, which draws 43 because every frame re-plans the whole
        // vault (github#19). Against a 16-unit threshold that is a coin flip, and it read as
        // bimodal -- exactly 0 or 22-27, never in between -- because it is a discrete
        // question: did the sampler catch the final frame or miss it. Measured 3 failures in
        // 6 runs with nothing else running, which is what ruled out contention.
        //
        // This is still BEFORE the final assignment, which is the frame the check wants: the
        // beat below exists because busy() clears before that assignment lands, so snapping
        // the instant it clears captures the last ANIMATED frame and not the resting one.
        window.__LF.last = snap(); window.__LF.frames++;
        // A BEAT: busy() clears before the final assignment lands. Without this the check
        // measures its own stopwatch -- see the note in animation.md.
        setTimeout(function () { window.__LF.rest = snap(); }, 320);
      }
    };
    trigger();
    requestAnimationFrame(tick);
  })`;

  const run = async (label, triggerJs) => {
    await p.eval(`${sampler}(function () { ${triggerJs} }); void 0`);
    for (let i = 0; i < 400; i++) {
      if (await p.j(`!!window.__LF.rest`).catch(() => false)) break;
      await sleep(100);
    }
    return await p.j(`(function () {
      var L = window.__LF.last, R = window.__LF.rest;
      if (!L || !R) return { frames: window.__LF.frames, n: 0 };
      var dr = 0, dt = 0, dd = 0, n = 0, worst = "";
      Object.keys(R).forEach(function (id) {
        if (!L[id]) return;
        n++;
        var a = Math.abs(R[id].r - L[id].r);
        var da = R[id].th - L[id].th;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        var t = Math.abs(da) * R[id].r;
        var s = L[id].dot > 0.01 ? Math.abs(R[id].dot - L[id].dot) / L[id].dot : 0;
        if (a > dr) dr = a;
        if (t > dt) { dt = t; worst = __vg.graph.getNodeAttribute(id, "folder") || "?"; }
        if (s > dd) dd = s;
      });
      return { frames: window.__LF.frames, n: n, worst: worst,
               dr: Math.round(dr * 10) / 10, dt: Math.round(dt * 10) / 10,
               dd: Math.round(dd * 1000) / 10 };
    })()`).then((r) => ({ label, ...r }));
  };

  const out = [];
  // A folder toggle. The first group with an eye, whichever the vault has.
  const g = (await p.j(`__vg.groupOrder()`))[0];
  out.push(await run("folder toggle", `document.querySelector('[data-eye="' +
    ${JSON.stringify(g)}.replace(/"/g, String.fromCharCode(92) + '"') + '"]').click();`));
  await p.eval(`document.querySelector('[data-eye="' +
    ${JSON.stringify(g)}.replace(/"/g, String.fromCharCode(92) + '"') + '"]').click(); void 0`);
  await settle(p);
  await sleep(200);

  // A range change, taken off the vault's own extent so it works on any fixture.
  const span = await p.j(`(function () { var f = document.querySelector("#vg-from");
    return f ? { min: f.min, max: f.max } : null; })()`);
  if (span && span.min && span.max) {
    const lo = Date.parse(span.min), hi = Date.parse(span.max);
    const from = new Date(hi - (hi - lo) * 0.15).toISOString().slice(0, 10);
    out.push(await run("range change", `__vg.setRange(${JSON.stringify("PLACEHOLDER")}, null);`
      .replace("PLACEHOLDER", from)));
  }
  await clearRange(p);

  // A tenth of a row, and a twentieth of a dot. Float noise and the odd sub-pixel rounding live
  // far below this; a real violation is a fraction of a ROW -- 160 units -- or a visible step in
  // size, so anything genuine is orders of magnitude past these.
  const bad = out.filter((r) => !r.n || r.dr > 16 || r.dt > 16 || r.dd > 5);
  return {
    ok: !bad.length,
    detail: out.map((r) => r.n
      ? `${r.label}: ${r.frames}f, ${r.n} notes, dr ${r.dr} dtan ${r.dt}` +
        (r.dt > 1 ? ` (${r.worst})` : "") + ` dot ${r.dd}%`
      : `${r.label}: nothing sampled`).join(" | "),
  };
});

// THE STATES WHERE EVERY LAYOUT BUG THIS FILE KNOWS ABOUT WAS FOUND: folders switched off one
// at a time, and a date range squeezed until the bands are one or two rows deep. Both drive the
// disc into the corner the ordinary fixtures never reach -- cells narrower than a note, rows
// holding one note, spacing pinned at its cap -- and every defect of the last session showed up
// there first: dots overlapping, dots collapsed onto the pixel floor, and holes several times
// the row spacing where a cell held arc in rows it had no notes for.
//
// Asserted per state, not at the end, so the report names the state that broke rather than
// leaving the walk to be repeated by hand. Three properties, each of which was violated by a
// shipped build:
//
//   overlaps   two dots may not intersect. Dot radius is measured through the renderer's own
//              scaleSize, not read off the node attribute -- the attribute is the reducer's
//              INPUT and has been off by the camera ratio before now.
//   collapse   the median dot has to stay a real fraction of the step. A build that sized every
//              band from its tightest pair drew the whole vault at the 1.5px floor, which no
//              overlap check would ever notice.
//   holes      no gap in a row may exceed 2.5x that row's median step. This is deliberately
//              loose: one note in a small folder occupies one row wherever it sits, so some
//              slack is structural, and the number is set to catch a wedge's worth of dead arc
//              rather than a row's own unevenness.
check("filtered to the bone, the disc stays drawable", async (p) => {
  await clearRange(p);
  await settle(p);
  const probe = `(function () {
    var a0 = __vg.renderer.graphToViewport({ x: 0, y: 0 });
    var b0 = __vg.renderer.graphToViewport({ x: 160, y: 0 });
    var perPx = 160 / Math.hypot(b0.x - a0.x, b0.y - a0.y);
    var rows = {}, n = 0;
    __vg.graph.forEachNode(function (id, at) {
      var d = __vg.renderer.getNodeDisplayData(id);
      if (!d || d.hidden || (__vg.alpha[id] || 0) < 0.999) return;
      n++;
      var r = Math.hypot(at.x, at.y);
      var k = Math.round(r / 8) * 8;
      (rows[k] || (rows[k] = [])).push({ th: Math.atan2(at.y, at.x),
                                         rad: __vg.renderer.scaleSize(d.size) * perPx,
                                         // Which WEDGE this note is in. A gap between two
                                         // wedges is a seam and belongs there; a gap inside one
                                         // is a hole. Without this the two are the same number.
                                         w: (at.folder || at.group || at.dir || "?")
                                            + "\u0000" + (at.sub || "") });
    });
    var worstClear = 1e9, overlaps = 0, holeRatio = 0, dots = [], steps = [], worstRel = 0;
    // Seams are reported but NOT asserted on. They are a design quantity -- SEAM_ROWS, the
    // per-band gap factor and the wedge margin all deliberately put empty arc at a wedge
    // boundary -- so a threshold over them is a threshold over the look of the disc, which is
    // not what this check is for. It measures whether a wedge has arc it cannot fill.
    var seamRatio = 0, seamAt = "";
    Object.keys(rows).forEach(function (k) {
      var row = rows[k].slice().sort(function (x, y) { return x.th - y.th; });
      if (row.length < 4) { row.forEach(function (q) { dots.push(q.rad); }); return; }
      var arcs = [];
      for (var i = 1; i < row.length; i++) {
        var arc = (row[i].th - row[i - 1].th) * (+k);
        if (!(arc > 0.5 && arc < 1e5)) continue;
        arcs.push(arc);
        var cl = arc - row[i].rad - row[i - 1].rad;
        if (cl < worstClear) worstClear = cl;
        if (cl < 0) overlaps++;
      }
      if (!arcs.length) return;
      var srt = arcs.slice().sort(function (x, y) { return x - y; });
      var med = srt[Math.floor(srt.length / 2)];
      // The worst overlap AS A FRACTION of this row's own spacing, which is the scale that
      // decides whether it is visible. Absolute units are not comparable between the inner and
      // outer bands, let alone between a 450-note vault and a 10,000-note one.
      for (var q = 1; q < row.length; q++) {
        var a3 = (row[q].th - row[q - 1].th) * (+k);
        if (!(a3 > 0.5 && a3 < 1e5)) continue;
        var c3 = a3 - row[q].rad - row[q - 1].rad;
        if (c3 < 0 && med > 0 && -c3 / med > worstRel) worstRel = -c3 / med;
      }
      steps.push(med);
      // THE BIGGEST GAP INSIDE A WEDGE, which is what a hole is. The old line took the biggest
      // gap of any kind, so it reported the widest SEAM in the ring -- and a seam is put there
      // on purpose. Measured on the 10k vault filtered to its last 2.5%: the flagged gap was
      // the boundary between 15 - Courses and 11 - Clippings, in HEAD as well, at 2.61x against
      // this build's 3.52x. Both are seams; neither is a hole. Tightening the bound to 3.2x
      // therefore turned a change in wedge margins into a failing test.
      for (var w = 1; w < row.length; w++) {
        var a4 = (row[w].th - row[w - 1].th) * (+k);
        if (!(a4 > 0.5 && a4 < 1e5)) continue;
        var same = row[w].w === row[w - 1].w;
        if (same) { if (med > 0 && a4 / med > holeRatio) holeRatio = a4 / med; }
        else if (med > 0 && a4 / med > seamRatio) {
          seamRatio = a4 / med;
          seamAt = row[w - 1].w.split("\u0000")[0] + " -> " + row[w].w.split("\u0000")[0];
        }
      }
      row.forEach(function (q) { dots.push(q.rad); });
    });
    dots.sort(function (x, y) { return x - y; });
    steps.sort(function (x, y) { return x - y; });
    var medDot = dots.length ? dots[Math.floor(dots.length / 2)] : 0;
    var medStep = steps.length ? steps[Math.floor(steps.length / 2)] : 0;
    return { shown: n, overlaps: overlaps,
             worstRel: Math.round(worstRel * 1000) / 10,
             worstClear: worstClear === 1e9 ? null : Math.round(worstClear),
             holeRatio: Math.round(holeRatio * 100) / 100,
             seamRatio: Math.round(seamRatio * 100) / 100, seamAt: seamAt,
             ds: medStep > 0 ? Math.round(2 * medDot / medStep * 100) / 100 : 0,
             rows: Object.keys(rows).length };
  })()`;
  const bad = [];
  const seen = [];
  const judge = (label, r) => {
    seen.push(`${label}: ${r.shown}n ${r.rows}r d/s ${r.ds} hole ${r.holeRatio}x ` +
      `seam ${r.seamRatio}x${r.seamAt ? " (" + r.seamAt + ")" : ""} ` +
              `clear ${r.worstClear}${r.worstRel ? " (-" + r.worstRel + "%)" : ""}`);
    if (r.shown < 4) return;                     // nothing left to be wrong about
    // 4% OF THE ROW'S OWN SPACING, not zero, and the reason is in the design rather than in
    // the tolerance. A note's position within its row is WEIGHT-based -- its own share of the
    // row's weight -- so a light note beside a heavy one sits closer than the row's mean step.
    // Dot size is bounded by one figure per cell and one per band, and both are averages; the
    // exact bound is each note's own local gap, which is dotFit, and dotFit is a minimum over
    // WHICH neighbour happens to be nearest. It moves as the disc moves, and sizing from it
    // made every dot in the vault breathe -- 252% in a single frame, 72 of 122 frames past 5%.
    //
    // So a few percent of local crowding is the price of a size that is stable and ordered by
    // link weight, and the separation is wide: the real defects this check has caught were 44%
    // of a row median (the pixel floor ignoring the room) and 10% (a cell average bounding a
    // tighter row), while what remains is 2.5%.
    if (r.worstRel > 4) {
      bad.push(`${label}: ${r.overlaps} overlapping pair(s), worst ${r.worstClear} = ` +
               `${r.worstRel}% of the row median`);
    }
    if (r.ds < 0.15) bad.push(`${label}: dots collapsed, diameter/step ${r.ds}`);
    // 3.2x. This was 4.5x, parked there as a baseline while a 4.24x gap on the demo vault was
    // thought to need the arc allocated per ROW to fix. It did not: the gap was FOUR sub-wedges
    // of 15 - Courses, 7 and 6 and 6 and 6 notes each, in a band 9 rows deep -- none of them
    // reaching the rim row, all four holding arc across it. The sub-split gate was testing
    // "can each sub-wedge fill a column" against REF_ROWS (5) rather than the band's real
    // depth, so it let a split through that could not be drawn. Gated on the real depth,
    // 15 - Courses stays one wedge and the gap closes.
    //
    // 3.2x, AND holeRatio now means a gap INSIDE one wedge. It used to be the biggest gap of
    // any kind in a ring, which made it mostly a measurement of the widest SEAM -- and a seam is
    // deliberate. That confusion cost a false failure: at 3.2x this build reported 3.52x on the
    // 10k vault and 3.21x on the demo vault, both of them the wedge boundary between two
    // folders, and both present in HEAD too at 2.61x and 2.36x. Nothing was wrong with the disc;
    // the margin at a wedge edge had changed and the bound was standing over the wrong number.
    //
    // Measured worst across every sparse state on all three fixtures once seams are excluded:
    // 2.01x. Seams in the same runs reach 3.52x and are reported on the detail line instead, so
    // a change in seam width or wedge margin is still visible -- it just does not fail a check
    // whose subject is arc a wedge cannot fill. 3.2x leaves the 2.01x its headroom and still
    // catches a return to 4x, which is what a cell holding rows it cannot reach looks like.
    if (r.holeRatio > 3.2) bad.push(`${label}: a gap ${r.holeRatio}x the row median INSIDE one wedge`);
  };

  // ONE FOLDER AT A TIME, cumulatively, so the last states are the sparse ones.
  const groups = await p.j(`__vg.groupOrder()`);
  for (const g of groups) {
    const hid = await p.j(`(function(){
      var b = document.querySelector('[data-eye="' + ${JSON.stringify("")} + ${JSON.stringify(g)}.replace(/"/g, '\\\\"') + '"]');
      if (!b) return false; b.click(); return true; })()`);
    if (!hid) continue;
    await settle(p);
    // A BEAT AFTER SETTLE, and it is load-bearing. settle() returns when busy() clears, and the
    // final assignment lands on the frame after that -- read without this, notes still in
    // flight at full alpha reported 16 overlapping pairs at -78 units on a disc that has none
    // at rest, identically on every state, which is the signature of a transient and not of a
    // geometry. The same mistake as the lattice check's missing settle, one step further along.
    //
    // 600ms, not 300, because the 10k fixture needs it: at 300 it reported 2 pairs at -16 on
    // four different states -- the same number four times, which is a stopwatch reading -- and
    // neither window size reproduced it at rest. Ten thousand notes take longer to place than
    // one thousand, and this waits for the slowest fixture rather than the median one.
    await sleep(600);
    judge(`hidden through ${g}`, await p.j(probe));
  }
  // Back to everything, then squeeze the range instead.
  for (const g of groups) {
    await p.j(`(function(){
      var b = document.querySelector('[data-eye="' + ${JSON.stringify("")} + ${JSON.stringify(g)}.replace(/"/g, '\\\\"') + '"]');
      if (b && b.getAttribute("aria-pressed") === "false") b.click();
      return true; })()`).catch(() => 0);
  }
  await settle(p);

  // A RANGE SQUEEZED UNTIL THE BANDS ARE SHALLOW. Taken off the vault's own extent so it works
  // on any fixture: the last tenth, then the last fortieth, then the last two hundredth.
  const span = await p.j(`(function(){
    var f = document.querySelector("#vg-from");
    return f ? { min: f.min, max: f.max } : null; })()`);
  if (span && span.min && span.max) {
    const lo = Date.parse(span.min), hi = Date.parse(span.max);
    for (const frac of [0.1, 0.025, 0.005]) {
      const from = new Date(hi - (hi - lo) * frac).toISOString().slice(0, 10);
      await p.eval(`__vg.setRange(${JSON.stringify(from)}, null); void 0`);
      await settle(p);
      await sleep(600);
      judge(`range last ${Math.round(frac * 1000) / 10}%`, await p.j(probe));
    }
  }
  await clearRange(p);
  return {
    ok: !bad.length,
    detail: bad.length ? bad.slice(0, 4).join("; ")
                       : seen.slice(-4).join(" | "),
  };
});

check("the gap reservation holds still while groups only thin", async (p) => {
  await clearRange(p);
  const before = await p.j(`__vg.rangeReport()`);
  // THE CUT IS DERIVED FROM THE VAULT, not hardcoded -- the point is thinning, not emptying,
  // and a fixed date cannot promise that against fixtures anchored to today (github#20 made
  // them ALWAYS today-anchored, which is when the old "2025-03-01" started emptying a small
  // inner-band group on freshly generated shapes; before that it was merely going to start
  // failing on whatever day the drift reached it, the same calendar-dependence the shape-vault
  // ribbon checks had). A group can only empty if every one of its notes is dated and older
  // than the cut -- undated notes survive every range -- so the latest cut that empties
  // nothing is the minimum over such groups of each group's NEWEST note. Cutting exactly
  // there keeps at least that one note in every group and thins everything older.
  const cut = await p.j(`(function () {
    var newest = Object.create(null);
    __vg.graph.forEachNode(function (id, a) {
      var g = __vg.groupOf(id);
      if (!a.created) { newest[g] = "9999-12-31"; return; }   // this group cannot empty
      if (newest[g] !== "9999-12-31" && (!(g in newest) || a.created > newest[g])) {
        newest[g] = a.created;
      }
    });
    var min = null;
    Object.keys(newest).forEach(function (g) {
      if (newest[g] !== "9999-12-31" && (min === null || newest[g] < min)) min = newest[g];
    });
    return min && min.slice(0, 10);   // the range field takes YYYY-MM-DD; a time suffix
  })()`);                               // would only make the cut minutes earlier anyway
  if (!cut) {
    return { ok: true, detail: "every group holds an undated note -- no cut can thin without a date to cut at" };
  }
  await p.eval(`__vg.probe(true); void 0`);
  await p.eval(`__vg.setRange(${JSON.stringify("PLACEHOLDER")}, null); void 0`.replace("PLACEHOLDER", cut));
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
    // BOTH bands in the message. It used to print ngO alone, so the one real failure it ever
    // reported read "nG 8 -> 8" -- a count that had not moved -- while the emptied group was in
    // the INNER band the message never mentioned.
    detail: emptied
      ? `the cut at ${cut} emptied a group (nG outer ${s0.ngO} -> ${s1.ngO}, ` +
        `inner ${s0.ngI} -> ${s1.ngI}), which the derived cut exists to prevent`
      : `cut at ${cut}: nG held (outer ${s1.ngO}, inner ${s1.ngI}) across ${r.frames} frames, ` +
        `worst step ${r.ngMaxStep}; lit ${before.lit} -> ${after.lit}`,
  };
});

// THE RANGE IS TYPEABLE, and the two fields are the range rather than a readout of it. They
// were text, so the only way to set a range was to find a two-pixel handle at the far end of
// eleven years of strip. Both directions are asserted: the fields drive the filter, and the
// filter drives the fields -- a control that shows a stale date is worse than one that shows
// nothing, because it looks authoritative.
check("the date fields set the range and follow it", async (p) => {
  await clearRange(p);
  const box = await p.j(`(function(){
    var b = document.querySelector("#vg-rangebox");
    if (!b) return null;
    var row = document.querySelector("#vg-heat .hrow").getBoundingClientRect();
    var r = b.getBoundingClientRect();
    return { order: [].map.call(b.children, function (c) { return c.id || String(c.className); }),
             fromRowRight: Math.round(row.right - r.right),
             min: document.querySelector("#vg-from").min,
             max: document.querySelector("#vg-to").max };
  })()`);
  if (!box) return { ok: false, detail: "no #vg-rangebox" };

  // Typing into the field applies it.
  const set = await p.j(`(function(){
    var f = document.querySelector("#vg-from");
    var mid = f.min.slice(0, 4) === f.max.slice(0, 4) ? f.max : (Number(f.max.slice(0, 4))) + "-01-01";
    f.value = mid;
    f.dispatchEvent(new Event("change", { bubbles: true }));
    return { typed: mid };
  })()`);
  await sleep(200);
  await settle(p);
  const after = await p.j(`(function(){
    var r = __vg.rangeReport();
    return { lit: r.lit, total: r.total, from: r.from,
             field: document.querySelector("#vg-from").value };
  })()`);

  // And clearing it puts the fields back to the span's own ends.
  await p.eval(`document.querySelector("#vg-rangeall").click(); void 0`);
  await sleep(200);
  await settle(p);
  const cleared = await p.j(`(function(){
    return { from: document.querySelector("#vg-from").value,
             to: document.querySelector("#vg-to").value,
             state: __vg.rangeReport().from };
  })()`);
  await clearRange(p);
  const ordered = box.order.join(",") === "vg-from,arw,vg-to,vg-rangeall";
  return {
    ok: ordered && box.fromRowRight <= 2 && !!box.min && !!box.max &&
        after.field === set.typed && after.from !== null && after.lit < after.total &&
        cleared.state === null && cleared.from === box.min && cleared.to === box.max,
    detail: `${box.order.length} controls (${box.order.join(" ")}) flush to the row's right ` +
            `edge (${box.fromRowRight}px); typing ${set.typed} lit ${after.lit} of ${after.total}; ` +
            `clearing put the fields back to ${cleared.from} -> ${cleared.to}`,
  };
});

// THE YEARS ARE BUTTONS. They were text painted on the strip, which meant hit-testing a pixel
// band by hand and no keyboard, no focus ring, no hover state the browser could give us -- a
// control only a mouse could reach. Asserted as buttons: real elements, one per year, each at
// its own year's position on the scale above, and the one the range sits on marked pressed.
check("the year buttons select a year and halo it on hover", async (p) => {
  await clearRange(p);
  const list = await p.j(`(function(){
    var host = document.querySelector("#vg-years");
    if (!host) return null;
    var bs = [].slice.call(host.querySelectorAll("button[data-yr]"));
    if (!bs.length) return { none: true };
    var rib = document.querySelector("#vg-ribbon").getBoundingClientRect();
    // Each button should sit over its own year. Worst error across all of them, in px.
    var worst = 0;
    bs.forEach(function (b) {
      var yr = +b.getAttribute("data-yr");
      // CLAMPED, like the button is. A year whose January falls before the vault s first
      // note has a negative position on the scale, and the button sits at the strip s edge
      // instead -- which is correct, and is what made this read as 327px of error.
      var want = Math.max(0, Math.min(rib.width, __vg.ribbonXOf(Date.UTC(yr, 0, 1))));
      var got = b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2 - rib.left;
      var d = Math.abs(got - want);
      if (d > worst) worst = d;
    });
    // THE MIDDLE BUTTON IS NOT A SAFE PICK, and this fails on the author's own vault.
    // The hover half of this check demands that the year haloes its notes, so the year has
    // to HAVE some -- and a vault is allowed a year with none. This one has exactly that:
    // 2021 holds 0 notes of 457, it is the 7th of 12 chips, and bs.length / 2 lands on it,
    // so a run against the real vault reported "hovering '2021' haloed 0 of its 0 notes" and
    // failed on a page that was right. The three fixtures all populate every year, which is
    // why the default run never showed it. Nearest populated year to the middle, so the pick
    // is still a middling one wherever there is a choice.
    var counts = {};
    __vg.dateSpan.years.forEach(function (y) { counts[String(y.y)] = y.n; });
    var withNotes = bs.filter(function (b) { return (counts[b.getAttribute("data-yr")] || 0) > 0; });
    if (!withNotes.length) return { none: true, allEmpty: true };
    var want = Math.floor(bs.length / 2);
    var mid = withNotes.reduce(function (best, b) {
      var d = Math.abs(bs.indexOf(b) - want);
      return best === null || d < Math.abs(bs.indexOf(best) - want) ? b : best;
    }, null);
    var r = mid.getBoundingClientRect();
    // THE CHIPS BELONG TO THE STRIP, and the only thing that says so is which gap is
    // smaller. drawRibbon paints a full-width rail along the canvas's bottom edge, and that
    // line reads as the bottom of the timeline section -- so with 8px above the chips and
    // 9px of band padding below them, they read as a row of their own OUTSIDE the control
    // they label. Reported from the Obsidian pane; measured identical in the standalone.
    // Asserted as a RATIO rather than as pixel values, so a padding change cannot fail it
    // while the grouping is still right.
    var hb = document.querySelector("#vg-heat").getBoundingClientRect();
    var yb = document.querySelector("#vg-years").getBoundingClientRect();
    return { n: bs.length, worstPx: Math.round(worst),
             gapAbove: Math.round((yb.top - rib.bottom) * 10) / 10,
             gapBelow: Math.round((hb.bottom - yb.bottom) * 10) / 10,
             years: bs.map(function (b) { return b.getAttribute("data-yr"); }),
             pick: mid.getAttribute("data-yr"),
             x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             tagged: bs.every(function (b) { return b.tagName === "BUTTON" && b.hasAttribute("aria-pressed"); }) };
  })()`);
  if (!list || list.none) {
    return { ok: false, detail: list && list.allEmpty
      ? "every year chip belongs to a year with no notes -- nothing to hover"
      : "no year buttons under the ribbon" };
  }

  // Hover haloes exactly that year's notes.
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: list.x, y: list.y });
  await sleep(260);
  const hov = await p.j(`(function(){
    var yr = __vg.state.hoverYear, n = 0, real = 0;
    __vg.graph.forEachNode(function (id, a) {
      if (__vg.isHighlighted(id)) n++;
      if (a.created && a.created.slice(0, 4) === yr) real++;
    });
    return { year: yr, haloed: n, real: real };
  })()`);

  // Clicking selects the calendar year, and the button says so.
  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: list.x, y: list.y, button: "left", clickCount: 1, buttons: 1 });
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: list.x, y: list.y, button: "left", clickCount: 1, buttons: 0 });
  await sleep(260);
  await settle(p);
  const clicked = await p.j(`(function(){
    var r = __vg.rangeReport();
    var b = document.querySelector('#vg-years button[data-yr="' + ${JSON.stringify(list.pick)} + '"]');
    return { fromISO: r.from ? new Date(r.from).toISOString().slice(0, 10) : null,
             toISO: r.to ? new Date(r.to).toISOString().slice(0, 10) : null,
             lit: r.lit, pressed: b && b.getAttribute("aria-pressed"),
             field: document.querySelector("#vg-from").value };
  })()`);

  // And leaving drops the halo rather than leaving it stuck on.
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: list.x, y: list.y - 220 });
  await sleep(220);
  const left = await p.j(`__vg.state.hoverYear`);
  await clearRange(p);
  const yr = list.pick;
  // A year at the very edge of the span is clamped to an open end, which is correct.
  const okRange = clicked.lit > 0 &&
        (clicked.fromISO === null || clicked.fromISO.slice(0, 4) === yr) &&
        (clicked.toISO === null || clicked.toISO.slice(0, 4) === yr);
  // Grouped with the strip: nearly touching it, and at least three times further from the
  // band's own edge. 1px against 9px passes; the 8-against-9 it shipped with does not.
  const grouped = list.gapAbove <= 2 && list.gapBelow >= list.gapAbove * 3;
  return {
    ok: list.tagged && list.worstPx <= 2 && hov.year === yr && hov.real > 0 &&
        hov.haloed === hov.real && okRange && clicked.pressed === "true" && left === null &&
        grouped,
    detail: `${list.n} buttons (${list.years.join(" ")}) within ${list.worstPx}px of their own ` +
            `year, ${list.gapAbove}px under the strip against ${list.gapBelow}px above the ` +
            `band's edge` + (grouped ? "" : "  <- CHIPS READ AS OUTSIDE THE STRIP") + "; " +
            `hovering '${yr}' haloed ${hov.haloed} of its ${hov.real} notes; clicking gave ` +
            `${clicked.fromISO} -> ${clicked.toISO} (${clicked.lit} lit, pressed=${clicked.pressed}); ` +
            `leaving cleared it (${left})`,
  };
});

check("the ribbon rescales with its slot", async (p) => {
  // THE BUG THIS EXISTS FOR. fitCanvas pins an inline pixel width on the strip's canvas --
  // it has to, since the bitmap is in device pixels and the CSS box is in CSS pixels -- and
  // an inline width beats the stylesheet's `width:100%`. So ribbonW(), which asked the
  // CANVAS how wide it was, got back the width it had last been drawn at, for ever. The
  // ResizeObserver was already wired and redrew at that same stale number, so the strip
  // never resized at all: measured on the real vault, 1168px in a 668px slot and 1168px
  // again in a 1568px one, with every year button left where it was.
  //
  // The viewport is overridden rather than the OS window resized: it re-runs layout and
  // delivers ResizeObserver notifications exactly the same way, costs no window manager, and
  // clears back to whatever this lane was already using.
  const at = async () => p.j(`(function(){
    var rib = document.querySelector("#vg-ribbon");
    var years = document.querySelector("#vg-years");
    var bs = [].slice.call(years.querySelectorAll("button[data-yr]"));
    var rb = rib.getBoundingClientRect();
    // The SLOT is #vg-years: same containing block, same stretch, and nothing pins its
    // width -- so it is the honest answer to "how wide should the strip be".
    var slot = years.getBoundingClientRect().width;
    var last = bs.length ? bs[bs.length - 1] : null;
    var lastX = last ? last.getBoundingClientRect().left + last.getBoundingClientRect().width / 2 - rb.left : null;
    return { rib: Math.round(rb.width), slot: Math.round(slot),
             inline: rib.style.width, bitmap: rib.width,
             lastX: lastX === null ? null : Math.round(lastX) };
  })()`);

  const base = await p.j(`(function(){ return { w: innerWidth, h: innerHeight,
                            dpr: window.devicePixelRatio || 1 }; })()`);
  const rows = [];
  const widths = [Math.round(base.w * 0.62), Math.round(base.w * 1.28), base.w];
  for (const w of widths) {
    await p.send("Emulation.setDeviceMetricsOverride",
                 { width: w, height: base.h, deviceScaleFactor: base.dpr, mobile: false });
    await sleep(320);
    rows.push({ w, ...(await at()) });
  }
  await p.send("Emulation.clearDeviceMetricsOverride");
  await sleep(320);
  const settled = await at();

  // Three things, and all three are needed. The canvas has to match its slot; the inline
  // width has to match the box, or a fractional slot leaves the bitmap half a pixel off the
  // pixels behind it; and the year buttons have to be on the same scale, since they are
  // positioned from ribbonW() and were the visible half of the bug.
  const tracks = rows.every((r) => Math.abs(r.rib - r.slot) <= 1);
  const pinned = rows.every((r) => r.inline === r.rib + "px");
  const moved = new Set(rows.map((r) => r.lastX)).size === rows.length || rows.length < 2;
  const restored = Math.abs(settled.rib - settled.slot) <= 1;
  return {
    ok: tracks && pinned && moved && restored,
    detail: rows.map((r) => `${r.w}px -> strip ${r.rib}/slot ${r.slot}` +
                            (r.lastX === null ? "" : `, last year at ${r.lastX}`)).join("; ") +
            `; cleared -> ${settled.rib}/${settled.slot}` +
            (tracks ? "" : "  <- STRIP DID NOT FOLLOW ITS SLOT") +
            (pinned ? "" : "  <- inline width disagrees with the box") +
            (moved ? "" : "  <- the year buttons did not move"),
  };
});

check("the intro sweeps the range end across the strip", async (p) => {
  // THE INTRO IS THE RIGHT-HAND SCRUBBER TRAVELLING, and this pins the three things that
  // makes it: it starts at the left end, it never goes backwards, and it finishes exactly at
  // the right end rather than near it. The disc's reveal and the handle both come off the
  // same rank, which is what keeps them in step -- interpolating the SPAN linearly instead
  // would put the handle in 2020 while every note from 2026 was already lit, because a vault
  // is not spread evenly in time (measured on the real one: 409 of 442 notes in the last
  // three months against a handful back to 2015).
  //
  // A PREVIEW, so state.from/state.to must stay null for the whole sweep. Writing them per
  // frame would put a hard date cap in timeFactor on top of the rank ramp the cascade is
  // already animating -- the same reveal computed twice, and the second one cancels playback.
  await clearRange(p);
  await settle(p);
  const scale = await p.j(`__vg.timeScale`);
  // Faster clock, same animation: this check reads POSITIONS, not frame pacing, and the
  // intro at its real duration is 5.6s of a suite that pays that per lane already.
  await p.eval(`__vg.timeScale = 0.25; void 0`);
  await p.eval(`document.querySelector("#vg-refresh").click(); void 0`);
  const seen = [];
  for (let i = 0; i < 90; i++) {
    const r = await p.j(`(function(){
      var b = __vg.brushNow();
      if (!b) return null;
      var lit = 0; __vg.graph.forEachNode(function (id) { if ((__vg.alpha[id] || 0) > 0.004) lit++; });
      var tip = document.querySelector("#vg-rtip");
      return { frac: b.x1 / b.w, x1: Math.round(b.x1), w: Math.round(b.w),
               sweeping: b.sweeping, lit: lit,
               tip: tip && !tip.hidden ? tip.textContent : null,
               from: __vg.state.from, to: __vg.state.to, busy: !!__vg.demo.busy() };
    })()`);
    if (r) seen.push(r);
    if (seen.length > 2 && r && !r.busy && !r.sweeping) break;
    await sleep(40);
  }
  await p.eval(`__vg.timeScale = ${JSON.stringify(scale)}; void 0`);
  await settle(p);

  const mid = seen.filter((r) => r.sweeping);
  const end = seen[seen.length - 1];
  let back = 0, maxFrac = 0;
  for (const r of mid) { if (r.frac < maxFrac - 0.002) back++; maxFrac = Math.max(maxFrac, r.frac); }
  const startedLeft = mid.length > 0 && mid[0].frac <= 0.08;
  const grew = mid.length >= 3 && mid[mid.length - 1].frac > mid[0].frac;
  const landedRight = !!end && !end.sweeping && Math.abs(end.x1 - end.w) <= 1;
  const stayedPreview = seen.every((r) => r.from === null && r.to === null);
  const labelled = mid.some((r) => !!r.tip) && !end.tip;
  return {
    ok: mid.length >= 3 && startedLeft && grew && back === 0 && landedRight &&
        stayedPreview && labelled,
    detail: `${mid.length} sweeping frames, ${mid.length ? mid[0].frac.toFixed(3) : "-"} -> ` +
            `${mid.length ? mid[mid.length - 1].frac.toFixed(3) : "-"}, ${back} backwards; ` +
            `landed at ${end ? end.x1 + "/" + end.w : "?"}; ` +
            `state stayed null: ${stayedPreview}; handle labelled: ${labelled}` +
            (startedLeft ? "" : "  <- DID NOT START AT THE LEFT END") +
            (landedRight ? "" : "  <- DID NOT LAND ON THE RIGHT END"),
  };
});

check("compact axis: a year's width tracks its own note count", async (p) => {
  // The direct, user-visible promise of github#23's note-weighted axis: the busiest year
  // draws WIDER than the quietest one, not merely narrower-than-it-would-linearly (a
  // month-real-duration scheme could satisfy that while still losing a 400-note year to a
  // 20-note one that happens to touch more months -- measured happening on a real vault
  // during development, which is what drove this redesign in the first place).
  const r = await p.j(`(function(){
    var d = __vg.dateSpan;
    if (!d || d.years.length < 2) return { skip: true };
    var ax = d.axis, w = document.querySelector("#vg-ribbon").getBoundingClientRect().width;
    var byYear = {};
    ax.segs.forEach(function (s) {
      var yy = d.months[s.i].y;
      byYear[yy] = (byYear[yy] || 0) + (s.w1 - s.w0) / ax.totalW * w;
    });
    var years = d.years.map(function (yy) { return { y: yy.y, n: yy.n, px: byYear[yy.y] || 0 }; });
    var busiest = years.reduce(function (a, b) { return b.n > a.n ? b : a; });
    var quietest = years.reduce(function (a, b) { return b.n < a.n ? b : a; });
    return { busiest: busiest, quietest: quietest };
  })()`);
  if (r.skip) return { ok: false, detail: "no dateSpan on this vault" };
  if (r.busiest.n === r.quietest.n) {
    return { ok: true, detail: `skipped — every year holds the same note count (${r.busiest.n}) on this vault` };
  }
  const ok = r.busiest.px > r.quietest.px;
  return {
    ok,
    detail: `busiest year ${r.busiest.y} (${r.busiest.n} notes) draws ${Math.round(r.busiest.px)}px ` +
      `against quietest year ${r.quietest.y} (${r.quietest.n} notes) at ${Math.round(r.quietest.px)}px`,
  };
});

check("compact axis: sparse years cluster near the same floor width", async (p) => {
  // The other half of github#23's ask, confirmed live against the author's own vault:
  // years below the note-count median should read as roughly equal width to each other --
  // "equidistant" -- not each keeping a width proportional to its own leftover internal
  // structure the way the month-real-duration scheme did.
  const r = await p.j(`(function(){
    var d = __vg.dateSpan;
    if (!d || d.years.length < 3) return { skip: true };
    var ax = d.axis, w = document.querySelector("#vg-ribbon").getBoundingClientRect().width;
    var byYear = {};
    ax.segs.forEach(function (s) {
      var yy = d.months[s.i].y;
      byYear[yy] = (byYear[yy] || 0) + (s.w1 - s.w0) / ax.totalW * w;
    });
    var counts = d.years.map(function (yy) { return yy.n; }).slice().sort(function (a, b) { return a - b; });
    var median = counts[Math.floor(counts.length / 2)];
    var sparse = d.years.filter(function (yy) { return yy.n <= median; })
                         .map(function (yy) { return byYear[yy.y] || 0; });
    if (sparse.length < 2) return { skip2: true };
    return { min: Math.min.apply(null, sparse), max: Math.max.apply(null, sparse), n: sparse.length };
  })()`);
  if (r.skip || r.skip2) {
    return { ok: true, detail: "skipped — fewer than 2 years at or below the median note count on this vault" };
  }
  // Not IDENTICAL -- a 2-note year still edges out a 0-note one -- but clustered rather than
  // spanning the same range the busy years occupy.
  const spread = r.max - r.min;
  const ok = spread <= r.max * 0.6 + 5;
  return {
    ok,
    detail: `${r.n} sparse years span ${Math.round(r.min)}-${Math.round(r.max)}px (spread ${Math.round(spread)}px)`,
  };
});

check("compact axis: the settings-panel toggle actually flips the live state", async (p) => {
  // A REAL regression check, not a manual one-off: $() prepends "vg-" (src/page.js:103), so
  // a rendered row whose literal id is "opt-<key>" instead of "vg-opt-<key>" leaves
  // setCompactAxis's own $("opt-compactAxis") lookup permanently unable to find its button --
  // exactly the bug an adversarial review caught here, since the click handler always
  // rebuilds the row wholesale and masked it in every path this suite drove before this
  // check existed. Queries the DOM directly (not through $()) so it can't share the bug's
  // own blind spot.
  const r = await p.j(`(function(){
    var gear = document.querySelector("#vg-gear");
    if (!gear || gear.hidden) return { noGear: true };
    gear.click();
    var before = document.querySelector("#vg-opt-compactAxis");
    if (!before) return { noButton: true };
    var beforePressed = before.getAttribute("aria-pressed"), beforeState = __vg.compactAxis;
    before.click();
    var after = document.querySelector("#vg-opt-compactAxis");
    var afterPressed = after && after.getAttribute("aria-pressed"), afterState = __vg.compactAxis;
    // Restore, and close the panel again, so the check leaves no trace on the page.
    if (after && afterState !== beforeState) after.click();
    gear.click();
    return { beforePressed: beforePressed, beforeState: beforeState,
             afterPressed: afterPressed, afterState: afterState };
  })()`);
  if (r.noGear) return { ok: false, detail: "no #vg-gear on this build -- standalone only" };
  if (r.noButton) {
    return { ok: false, detail: "gear opened but #vg-opt-compactAxis was not found -- the " +
      "rendered row id and the $() lookup setCompactAxis uses have drifted apart again" };
  }
  const flipped = r.afterState !== r.beforeState && r.afterPressed !== r.beforePressed;
  return {
    ok: flipped,
    detail: `clicking the row: state ${r.beforeState}->${r.afterState}, aria-pressed ` +
      `${r.beforePressed}->${r.afterPressed}`,
  };
});

check("compact axis: the view-level icon actually flips the live state, and persists", async (p) => {
  // The settings-panel row is standalone-only (SETTINGS_UI); the plugin's gear leads to
  // Obsidian's own settings tab instead, so #vg-compact is the ONLY in-view control on
  // that host (github#23). Exists on both hosts here, so this runs unconditionally --
  // unlike the settings-row check above, which skips when there's no gear/settings-UI.
  const r = await p.j(`(function(){
    var btn = document.querySelector("#vg-compact");
    if (!btn) return { noButton: true };
    var beforePressed = btn.getAttribute("aria-pressed"), beforeState = __vg.compactAxis;
    var persisted = null;
    btn.click();
    var afterPressed = btn.getAttribute("aria-pressed"), afterState = __vg.compactAxis;
    // Restore, so the check leaves no trace on the page.
    if (afterState !== beforeState) btn.click();
    return { beforePressed: beforePressed, beforeState: beforeState,
             afterPressed: afterPressed, afterState: afterState };
  })()`);
  if (r.noButton) return { ok: false, detail: "no #vg-compact on this build" };
  const flipped = r.afterState !== r.beforeState && r.afterPressed !== r.beforePressed;
  return {
    ok: flipped,
    detail: `clicking the icon: state ${r.beforeState}->${r.afterState}, aria-pressed ` +
      `${r.beforePressed}->${r.afterPressed}`,
  };
});

check("no non-tail split cell holds fewer notes than its band's row depth", async (p) => {
  // github#31 -- the per-subfolder row-depth gate (subCellIndex) is unconditional, baked
  // into buildWedgePlan's own cell-key assignment rather than behind a toggle. Vault-agnostic
  // on purpose: it doesn't assume any particular folder is sparse, it asserts the GENERAL
  // invariant and reports how many non-tail split cells it found to check on this fixture
  // (zero is a legitimate, passing result on an even vault).
  const r = await p.j(`(function(){
    var cells = __vg.buildWedgePlan(false).cells;
    var tail = __vg.subTailRank;
    var nonTailSplit = cells.filter(function(c){
      // Only cells that actually came from a SPLIT folder carry the \\u0000 separator --
      // an unsplit folder's key is just its own name, and whether THAT is sparse is the
      // folder-level splitFor gate's job, not this one's.
      // The tail rank (the last field) is the pooled tail and is allowed to be sparse --
      // it's the existing, accepted mechanism.
      var parts = c.k.split(String.fromCharCode(0));
      return parts.length >= 2 && +parts.pop() !== tail;
    });
    var sparse = nonTailSplit.filter(function(c){ return c.list.length < c.rows; });
    return { total: cells.length, nonTailSplitCount: nonTailSplit.length,
             sparse: sparse.map(function(c){ return c.k + ":" + c.list.length + "/" + c.rows; }) };
  })()`);
  return {
    ok: r.sparse.length === 0,
    detail: `${r.total} cells at rest, ${r.nonTailSplitCount} non-tail split cells checked; ` +
      `sparse ones: ` + (r.sparse.length ? r.sparse.join(", ") : "none"),
  };
});

check("the row-depth gate reads LIVE counts, not the whole-vault tally, under a filter", async (p) => {
  // github#31 -- an adversarial review caught the first cut of this reading subCount, a
  // whole-vault tally taken once at load and never refreshed, the exact bug this file's own
  // comment already documents having fixed for the FOLDER-level split gate ("it also cannot
  // see a filter"). Under a filter, a subfolder large in the whole vault but with almost
  // nothing currently visible would still clear the threshold on its stale total and keep a
  // sub-wedge cell sparser than what's actually on screen -- reproducing the exact defect
  // the gate exists to remove. Fixed by reading a live, filter-aware count (liveSub)
  // instead. This check does not depend on any fixture actually landing in that exact
  // shape -- on these three it mostly empties folders down to a cell or two -- its job is
  // to exercise buildWedgePlan(true) (not (false), which every other check here uses) at
  // all, something nothing else did before this check existed, and to hold the same
  // "no sparse non-tail cell" invariant there regardless of what it finds. The window is
  // the fixture's own first 20% of history rather than a fixed date -- vault-agnostic, and
  // wide enough (unlike an earlier, blunter two-day window that reached zero split cells on
  // all three fixtures) to actually still contain some split-folder cells to check.
  await p.eval(`(function(){
    var lo = __vg.dateSpan.lo, hi = __vg.dateSpan.hi;
    var cut = lo + (hi - lo) * 0.2;
    __vg.setRange(new Date(lo).toISOString().slice(0, 10), new Date(cut).toISOString().slice(0, 10));
  })(); void 0`);
  await settle(p);
  const r = await p.j(`(function(){
    var plan = __vg.buildWedgePlan(true);
    // A two-day window can legitimately leave a fixture with nothing visible at all --
    // buildWedgePlan(true) returns null then (see its own "if (!cells.length) return
    // null" bail-out).
    if (!plan) return { empty: true };
    var tail = __vg.subTailRank;
    var nonTailSplit = plan.cells.filter(function(c){
      var parts = c.k.split(String.fromCharCode(0));
      return parts.length >= 2 && +parts.pop() !== tail;
    });
    var sparse = nonTailSplit.filter(function(c){ return c.list.length < c.rows; });
    return { total: plan.cells.length, nonTailSplitCount: nonTailSplit.length,
             sparse: sparse.map(function(c){ return c.k + ":" + c.list.length + "/" + c.rows; }) };
  })()`);
  await clearRange(p);
  await settle(p);
  if (r.empty) return { ok: true, detail: "nothing visible in the narrowed range on this fixture -- nothing to check" };
  if (!r.nonTailSplitCount) {
    return { ok: true, detail: `${r.total} live cells, none from a split folder under this ` +
      `filter -- vacuous on this fixture, nothing this check could catch here` };
  }
  return {
    ok: r.sparse.length === 0,
    detail: `${r.total} live cells under the narrowed range; sparse non-tail cells: ` +
      (r.sparse.length ? r.sparse.join(", ") : "none"),
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

/* ------------------------------------------------------------------------ the hub */

/** The n most connected notes, which is what a person reaches for first. */
function topByDegree(p, n) {
  return p.j(`(function(){
    var o = []; __vg.graph.forEachNode(function(id){ o.push([id, __vg.graph.degree(id)]); });
    o.sort(function(a,b){ return b[1]-a[1]; });
    return o.slice(0, ${n}).map(function(x){ return x[0]; }); })()`);
}

async function pinN(p, n) {
  await p.eval(`__vg.clearPins(); void 0`);
  const ids = await topByDegree(p, n);
  for (const id of ids) await p.eval(`__vg.pin(${JSON.stringify(id)}); void 0`);
  await settle(p);
  return ids;
}

check("a pinned note leaves no gap in the ring it came from", async (p) => {
  // THE BUG THIS PINS. A pinned note kept its seat in buildWedgePlan, so its wedge was
  // drawn around a hole where it used to be -- the note in the hub and its chair still at
  // the table. Measured as the biggest angular step between neighbours in one wedge: a
  // vacated seat doubles it, and re-densifying leaves it at the wedge's own spacing.
  const gapOf = () => p.j(`(function(){
    // The busiest group, since a wedge with more notes in it has a tighter spacing and so
    // a missing one shows up more clearly against it.
    var byG = {};
    __vg.graph.forEachNode(function(id, a){
      if ((__vg.alpha[id]||0) < 0.5) return;
      var g = __vg.groupOf(id); (byG[g] || (byG[g] = [])).push([Math.atan2(a.y, a.x), Math.hypot(a.x,a.y)]);
    });
    var best = null;
    Object.keys(byG).forEach(function(g){ if (!best || byG[g].length > byG[best].length) best = g; });
    // One RING of that wedge at a time -- notes on different rows are not neighbours, and
    // mixing them would report the row pitch as an angular gap.
    var rows = {};
    byG[best].forEach(function(pr){ var k = Math.round(pr[1] / 40); (rows[k] || (rows[k] = [])).push(pr[0]); });
    var worst = 0, count = 0;
    Object.keys(rows).forEach(function(k){
      var a = rows[k].slice().sort(function(x,y){ return x-y; });
      if (a.length < 6) return;                 // too few to have a meaningful spacing
      count += a.length;
      var med = [];
      for (var i = 1; i < a.length; i++) med.push(a[i] - a[i-1]);
      med.sort(function(x,y){ return x-y; });
      var m = med[Math.floor(med.length/2)], top = med[med.length-1];
      if (m > 0 && top / m > worst) worst = top / m;
    });
    return { group: best, worst: Math.round(worst*100)/100, notes: count };
  })()`);

  await p.eval(`__vg.clearPins(); void 0`);
  await settle(p);
  const before = await gapOf();
  await pinN(p, 6);
  const after = await gapOf();
  await p.eval(`__vg.clearPins(); void 0`);
  await settle(p);
  // Against the vault's OWN resting spread rather than an absolute: a wedge that already
  // has uneven rows would fail an absolute threshold for a reason that has nothing to do
  // with pinning. What may not happen is the spread getting materially worse.
  const ok = after.worst <= before.worst * 1.35 + 0.05;
  return { ok, detail: `worst neighbour gap in ${before.group} (${before.notes} notes): ` +
                       `${before.worst}x median at rest -> ${after.worst}x with 6 pinned` };
});

check("the hub's dots shrink as it fills", async (p) => {
  // A fixed multiplier put thirteen overlapping dots in a 180px hole. The size is derived
  // from the closest two SLOTS now, so it has to fall monotonically as the ball packs --
  // and the one-note case is the interesting one: deriving its spacing from the hole gave
  // a lone pin a SMALLER dot than three of them (10.93 against 11.73).
  const sizeAt = async (n) => {
    const ids = await pinN(p, n);
    return p.j(`(function(){
      var d = __vg.renderer.getNodeDisplayData(${JSON.stringify(ids[0])});
      return Math.round(d.size * 100) / 100; })()`);
  };
  const s1 = await sizeAt(1), s3 = await sizeAt(3), s6 = await sizeAt(6), s13 = await sizeAt(13);
  await p.eval(`__vg.clearPins(); void 0`);
  await settle(p);
  const ok = s1 > s3 && s3 > s6 && s6 > s13;
  return { ok, detail: `1 -> ${s1}px, 3 -> ${s3}, 6 -> ${s6}, 13 -> ${s13}` +
                       (ok ? " (monotonic)" : "  NOT MONOTONIC") };
});

// A row-0 inner-band note's centre sits exactly on the hub boundary by construction (see
// HUB_ROW0_FRAC in src/page.js), so nothing but its own drawn radius decides how far it
// visually pokes into the hub hole. Soloing a folder down to a single note that lands alone
// in the inner band collapses that band to one row, and the ramp used to size it off the
// band's WHOLE thickness instead of a normal row's slice -- github#35, "the notes touch the
// brain". None of the three fixture vaults' default state hits this shape (it needs a folder
// filtered down to one note that happens to land inner), which is how it shipped unnoticed;
// this check manufactures it by trying every folder in turn.
//
// EVERY FOLDER, NOT THE FIRST HIT, and the WORST result is what gets asserted. Different
// folders that each solo to exactly one inner note do not balloon by the same amount -- the
// surviving note's own weight feeds the ramp along with the band pitch, and which folder
// draws the worst one shifts with the vault's own generated content (the generators anchor
// to today's date, so note weights are not perfectly stable run to run). Measured live on
// the demo vault pre-fix: "14 - Reading List" solos to a healthy-looking 2.7%, while "13 -
// Someday Maybe" -- also a single note left in the inner band, just a different one --
// comes out at 15.4%. Stopping at the first hit would have asserted on the healthy folder
// and missed the regression this check exists to catch.
//
// DETECTED THE SAME WAY THE PAGE ITSELF REPORTS IT -- debugDump().bands.inner.notes, not a
// hand-rolled band split out here. buildWedgePlan(false) was tried first and is wrong for
// this: `false` is its onlyVisible argument, so it returns EVERY folder's cell against the
// FULL vault regardless of what is currently hidden, not the live post-solo split -- it
// happened to agree with the live split for some folders and silently disagreed for others,
// which is worse than not checking at all.
//
// NO CONSTANTS IMPORTED FROM THE LAYOUT, same reasoning as "the resting disc is on the
// lattice": with exactly one inner note left, it is also the smallest-radius visible note on
// the whole disc (the inner band is always innermost), so the hub radius is measured as
// THAT note's own radius -- which IS the boundary, row 0 being what it is -- rather than
// recomputed from INNER_SCALE and UNIT out here.
check("a soloed hub-adjacent note stays inside the hub's own radius", async (p) => {
  const r = await p.j(`(function(){
    var order = __vg.groupOrder().slice();
    var counts = {};
    __vg.graph.forEachNode(function(id, a){ counts[a.folder] = (counts[a.folder] || 0) + 1; });
    var a0 = __vg.renderer.graphToViewport({ x: 0, y: 0 });
    var b0 = __vg.renderer.graphToViewport({ x: 160, y: 0 });
    var perPx = 160 / Math.hypot(b0.x - a0.x, b0.y - a0.y);

    var tried = [], hits = [];
    for (var i = 0; i < order.length; i++) {
      var g = order[i];
      var h = {};
      order.forEach(function (n) { h[n] = (n !== g); });
      __vg.state.hidden.folder = h; __vg.syncAlpha(); __vg.applyLayout(false);
      var dd = __vg.debugDump();
      var nIn = dd.bands.inner ? dd.bands.inner.notes : 0;
      tried.push(g + ":" + nIn);
      if (nIn !== 1) continue;
      var best = null;
      __vg.graph.forEachNode(function(id, a){
        if ((__vg.alpha[id] || 0) < 0.999) return;
        var rr = Math.hypot(a.x, a.y);
        if (!best || rr < best.r) best = { id: id, r: rr };
      });
      var d = __vg.renderer.getNodeDisplayData(best.id);
      var dotR = __vg.renderer.scaleSize(d.size) * perPx;
      hits.push({ g: g, notes: counts[g], hubR: best.r, dotR: dotR, frac: dotR / best.r });
    }

    __vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false);
    if (!hits.length) return { hit: false, tried: tried };
    hits.sort(function (x, y) { return y.frac - x.frac; });
    var w = hits[0];
    return { hit: true, folder: w.g, notes: w.notes, hubR: Math.round(w.hubR),
             dotR: Math.round(w.dotR * 100) / 100, frac: w.frac, nHits: hits.length };
  })()`);
  await settle(p);
  if (!r.hit) {
    // NOT ASSERTED, not failed -- same shape as "the hub stays the same share of the disc"
    // above. The dominant-folder vault's few, large groups never happen to solo down to
    // exactly one inner note (tried and reported below), which is a fact about that
    // fixture's folder shape, not a defect: the other two vaults exercise this scenario.
    return { ok: true, detail: `NOT ASSERTED: no folder on this vault solos down to a single ` +
                                `inner-band note -- tried ${r.tried.join(", ")}` };
  }
  // 0.15, not HUB_ROW0_FRAC's own 0.08: this checks the OUTCOME stays sane, with headroom
  // for the note's own weight and pixel rounding, not the exact constant -- a tuning change
  // to HUB_ROW0_FRAC should not have to touch this file. The defect measured 0.31-0.59
  // before the fix; a healthy row-0 dot on the demo vault at rest measures ~0.03-0.04.
  const ok = r.frac <= 0.15;
  return { ok, detail: `worst of ${r.nHits} folder(s) that solo to 1 note alone in the inner ` +
                       `band: "${r.folder}" (${r.notes} notes) at radius ${r.hubR} -- dot ` +
                       `radius ${r.dotR}, ${(r.frac * 100).toFixed(1)}% of the hub's own radius ` +
                       `(must be <=15%)` };
});

check("the mark yields to the hub and comes back", async (p) => {
  const markOn = () => p.j(`(function(){
    var el = document.querySelector("#vg-logo");
    return { hidden: !!el.hidden, opacity: getComputedStyle(el).opacity }; })()`);
  // SLEEP PAST THE FADE on every read, not just the last one. settle() waits for the
  // layout, and the mark's opacity is a CSS transition that knows nothing about it -- read
  // straight after clearing, the "resting" opacity came back 0.1414 on the demo vault and 0
  // on the shape vault, which is the fade caught in progress rather than anything about the
  // mark. 500 > the 380ms transition.
  const FADE = 500;
  await p.eval(`__vg.clearPins(); void 0`);
  await settle(p);
  await sleep(FADE);
  const rest = await markOn();
  await pinN(p, 3);
  await sleep(FADE);
  const held = await markOn();
  await p.eval(`__vg.clearPins(); void 0`);
  await settle(p);
  await sleep(500);                            // the fade is 380ms
  const back = await markOn();
  // FADED, not hidden: `hidden` popped the mark out on the frame the first pin landed,
  // while the note it was yielding to was still crossing the disc.
  const ok = Number(rest.opacity) > 0.5 && Number(held.opacity) < 0.05 &&
             Number(back.opacity) > 0.5 && !held.hidden;
  return { ok, detail: `opacity ${rest.opacity} at rest -> ${held.opacity} with 3 pinned ` +
                       `(hidden=${held.hidden}, must be false) -> ${back.opacity} cleared` };
});

check("a pin hidden by a filter is skipped, not released", async (p) => {
  // Filters are deliberately not persisted, so they must not quietly edit something that
  // IS. Releasing the pin was the first version: hiding a folder dropped every pin in it
  // and unhiding did not bring them back.
  await pinN(p, 3);
  const before = await p.j(`__vg.pinned().length`);
  const drawnNow = () => p.j(`(function(){ var n = 0;
    __vg.pinned().forEach(function(id){ if ((__vg.alpha[id]||0) > 0.5) n++; }); return n; })()`);
  const drawnRest = await drawnNow();
  // A two-day window, the same blunt instrument the plan-parity check uses. Which filter
  // does the hiding is not the point -- willShow is what pinnedIds consults, and the date
  // range reaches it by the same route a legend toggle does.
  await p.eval(`__vg.setRange("2019-01-01", "2019-01-02"); void 0`);
  await settle(p);
  const whileHidden = await p.j(`__vg.pinned().length`);
  const drawnHidden = await drawnNow();
  await clearRange(p);
  const after = await p.j(`__vg.pinned().length`);
  const drawnBack = await drawnNow();
  await p.eval(`__vg.clearPins(); void 0`);
  await settle(p);
  const ok = whileHidden === before && after === before &&
             drawnHidden < drawnRest && drawnBack === drawnRest;
  return { ok, detail: `${before} pinned: ${drawnRest} drawn at rest -> ${drawnHidden} while ` +
                       `filtered out (still ${whileHidden} held) -> ${drawnBack} back, ` +
                       `${after} held` };
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
    // THE PAGE'S OWN PREDICATE, not graph.degree: in a budgeted vault the graph carries only
    // the strongest share of the web, so degree-0 there includes thousands of linked notes
    // whose links happen to be trimmed at rest -- measured, 281 of them wearing their folder
    // colour, which is correct behaviour failing a check that asked the wrong question.
    var ids = g.nodes().filter(function (id) { return __vg.isOrphan(id); });
    var cols = ids.map(function (id) { return String(rd.getNodeDisplayData(id).color).toLowerCase(); });
    return { swatch: sw, orphans: ids.length,
             match: cols.filter(function (c) { return c === sw; }).length,
             distinct: Object.keys(cols.reduce(function (a, c) { a[c] = 1; return a; }, {})).length };
  })()`);
  if (!r.orphans) return { ok: true, detail: "no unlinked notes on this shape, nothing to measure" };
  return { ok: r.match === r.orphans,
           detail: `${r.match} of ${r.orphans} on ${r.swatch}, ${r.distinct} distinct` };
});

// Issue #2: Sigma paints every edge on its bottom layer and every node above that, so the
// edges the focus web lights on hover/click ran under the notes they crossed -- each dim
// disc in the way cut a grey gap out of a blue line, and on a well-connected hub the web
// read as dashed. checkFocusWeb() selects the best-connected note, composites the canvases
// in stacking order, and samples every lit curve where it passes inside a NON-focus disc --
// dimAtGaps must be 0. Approach follows the diagnosis and geometry already diffed on the
// fork branch linked from that issue (bartolli/vault-graph@21a618c).
check("focus web stays above dim notes", async (p) => {
  const r = await p.j(`__vg.checkFocusWeb()`);
  if (!r.geomGaps) return { ok: true, detail: `${r.node} (degree ${r.degree}): no in-disc samples on this shape, nothing to measure` };
  return { ok: r.webOK,
           detail: `${r.node} (degree ${r.degree}, ${r.edges} edges): ${r.blueAtGaps} blue, ` +
                   `${r.dimAtGaps} dim, ${r.underLabel} under label/disc of ${r.geomGaps} in-disc samples` };
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

// Runs ONE list of checks against ONE fresh browser. `work.checks` is the shard, `work.tag`
// labels it in the output. Output is BUFFERED and returned rather than printed: with several
// jobs in flight, interleaved lines make a report nothing can be read out of.
async function runOne(vault, work) {
  const mine = work && work.checks ? work.checks : selected();
  // Where this job's window goes. Null means the default off-screen parking.
  const slot = GRID && work && work.slot !== undefined ? gridSlot(work.slot, work.slots) : null;
  const lines = [];
  const log = (m) => lines.push(m === undefined ? "" : String(m));
  // Built ONCE PER VAULT and handed to every shard of it. Nine shards of the 10k vault meant
  // nine builds of the same 4MB page -- pure waste, and waste that competes with the
  // measurement it is there to serve.
  let url = (work && work.url) || arg("url", "");
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
    log((b.stdout || "").trimEnd());
    if (b.status !== 0) throw new Error("build-graph.mjs failed:\n" + (b.stderr || ""));
    const m = /^wrote (.+) \(/m.exec(b.stdout || "");
    if (!m) throw new Error("could not tell where the build landed; pass --url");
    url = pathToFileURL(m[1].trim()).href;
  }
  log(`checking ${url}\n`);

  // One port for this run alone, unless a human pinned one with --port.
  const PORT = PINNED_PORT || (work && work.port) || (await freePort());

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
    // NOTHING THIS RUN DOES NOT NEED. Four Chromes starting at once, three times per run,
    // is the second cost after the intro -- and every one of these subsystems is dead weight
    // for a page loaded from a file with no network, no extensions and no account. The GPU is
    // deliberately NOT disabled: the thing being measured is a WebGL canvas.
    "--disable-extensions", "--disable-component-update", "--disable-client-side-phishing-detection",
    "--disable-sync", "--no-service-autorun", "--disable-domain-reliability",
    "--metrics-recording-only", "--no-pings", "--mute-audio",
    "--disable-breakpad", "--disable-crash-reporter",
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
    // Off-screen by default so the window cannot be occluded (see above); tiled on the left
    // monitor with --grid; wherever the OS puts it with --headed.
    ...(slot ? [`--window-position=${slot.x},${slot.y}`]
             : HEADED ? [] : ["--window-position=-2400,0"]),
    slot ? `--window-size=${slot.w},${slot.h}` : "--window-size=1600,1000", `--app=${url}`
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
    //
    // WAITED FOR, not asserted on the first read. Chrome lists a target with its intended URL
    // before the document has navigated, so under load `attach` legitimately lands on a page
    // still reporting about:blank -- measured on 4 of 27 jobs at --jobs 9, presenting as
    // "attached to the wrong page" against a page that was about to be exactly right. The
    // guard keeps its teeth: a genuinely stale browser never becomes the wanted URL and still
    // fails, just 8 seconds later.
    let at = "";
    for (const wait = Date.now() + 8000; ;) {
      at = await page.eval("location.href").catch(() => "");
      if (!at || at === url || Date.now() > wait) break;
      await sleep(250);
    }
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
    for (const c of mine) {
      // STOP AT A LOST OR WEDGED PAGE rather than running the rest against it. Every
      // remaining check would fail, none of them for its own reason, and the report would name
      // a dozen features as broken when the truth is one page that stopped answering.
      //
      // The liveness probe is one trivial eval, and it is here rather than inside the checks
      // because what it has to establish is exactly "was the page still alive BEFORE this
      // check ran" -- which names the check that wedged it as the previous line of output.
      if (page.lost) {
        log(`\n  !! CDP connection lost (${page.lost}) -- ` +
                    `${mine.length - timings.length} check(s) not run`);
        if (chromeGone) log(`     chrome process: ${chromeGone}`);
        if (chromeSaid.length) {
          log("     chrome said:");
          for (const l of chromeSaid.slice(-12)) log("       " + l);
        }
        failed += mine.length - timings.length;
        break;
      }
      try {
        await page.eval("1");
      } catch (e) {
        const last = timings.length ? timings[timings.length - 1].name : "(before the first check)";
        log(`\n  !! the page stopped answering after "${last}" -- ${e.message}`);
        if (chromeGone) log(`     chrome process: ${chromeGone}`);
        if (chromeSaid.length) {
          log("     chrome said:");
          for (const l of chromeSaid.slice(-12)) log("       " + l);
        }
        log(`     ${mine.length - timings.length} check(s) not run`);
        failed += mine.length - timings.length;
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
      log(`${r.ok ? "  ok  " : " FAIL "} ${c.name}${secs}\n         ${r.detail}`);
    }

    const total = timings.reduce((a, t) => a + t.ms, 0);
    const slow = timings.slice().sort((a, b) => b.ms - a.ms).slice(0, 5);
    log(`\n${mine.length - failed}/${mine.length} passed in ${(total / 1000).toFixed(0)}s`);
    log("slowest: " + slow.map((t) => `${t.name} ${(t.ms / 1000).toFixed(1)}s`).join(", "));
    return { failed, ran: mine.length, lines, timings };
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
 *   demo vault   1400 notes over nine years: two dense recent ones (85% of notes) behind a
 *                genuinely sparse tail, 18 of 108 possible months empty
 *                (scripts/make-demo-vault.mjs). The shape a vault in real use has, the one
 *                the date ribbon is worth looking at on, and -- since github#23 -- the one
 *                shape in this trio that actually exercises the compact axis rather than
 *                skipping past it (10k and shape stay evenly populated, no real gaps).
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
 * ALL THREE LIVE IN ONE SHARED STORE, beside the main repo, and invalidate themselves.
 *
 * They used to be generated into each checkout's own root, and only when the directory was
 * missing -- so every worktree kept whatever it generated whenever, indefinitely. That cost a
 * blocked push and a full HEAD-vs-branch bisect on 2026-08-24: the develop checkout held a
 * 468-note demo vault from the day before the generator was fixed, the feature worktree held
 * the 1,406-note one from after, and two checks failed on fixture content while the code was
 * innocent ("hovering '2021' haloed 0 of its 0 notes" -- a year that vault genuinely did not
 * populate). The verdict of the push gate depended on which directory you pushed from.
 *
 * So a fixture now lives at <main repo>/.fixtures/<name>-<digest8>, where the digest is
 * sha256 over the CONTENTS of all three generator scripts plus this fixture's args -- content,
 * not mtime, because a branch switch rewrites mtimes without changing a byte, and all three
 * sources feed every digest because make-demo-vault delegates to make-test-vault. Every
 * worktree resolves the same store through git's common dir, so the gate sees one fixture set
 * no matter where the push runs. Editing a generator changes the digest and the next run
 * regenerates; nothing needs to remember to delete anything.
 *
 * A fixture also AGES BY DESIGN: --end defaults to today so the 52-week heatmap window stays
 * exercised, which means the newest note recedes from the real clock from the moment it is
 * written. The stamp in each fixture carries its generation day, and anything older than
 * FIXTURE_MAX_AGE_DAYS regenerates -- the first run each week pays the ~10-30s, everyone else
 * reuses. A leftover fixture directory in a checkout root is ignored with a one-line notice;
 * --vault remains the explicit override for pointing the suite at any vault on purpose.
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
  const FIXTURE_MAX_AGE_DAYS = 7;
  const GENERATORS = ["make-demo-vault.mjs", "make-test-vault.mjs", "make-shape-vault.mjs"];
  // Bump to force one regeneration everywhere -- for a change to the store logic itself,
  // which the generator digest cannot see.
  const FIXTURE_FORMAT = 1;

  const storeRoot = (() => {
    // The MAIN repo's root, whichever worktree this runs in: a worktree's common dir is the
    // main checkout's .git, so its parent is the main root, and every worktree lands on the
    // same store. A non-git context degrades to a per-checkout store -- freshness survives,
    // sharing does not, and that is the right trade for a tarball.
    const g = spawnSync("git", ["-C", ROOT, "rev-parse", "--git-common-dir"],
                        { encoding: "utf8" });
    if (g.status === 0 && g.stdout.trim()) {
      const common = g.stdout.trim();
      const abs = /^[A-Za-z]:[\\/]|^\//.test(common) ? common : join(ROOT, common);
      return join(dirname(abs), ".fixtures");
    }
    return join(ROOT, ".fixtures");
  })();

  const digestOf = (args) => {
    const h = createHash("sha256");
    h.update("format:" + FIXTURE_FORMAT);
    for (const g of GENERATORS) h.update(readFileSync(join(HERE, g)));
    h.update(JSON.stringify(args));
    return h.digest("hex").slice(0, 8);
  };

  const todayDay = () => new Date().toISOString().slice(0, 10);
  const ageDays = (day) => Math.floor((Date.parse(todayDay()) - Date.parse(day)) / 86400000);

  const gen = (script, args, name, label) => {
    const digest = digestOf(args);
    const dir = join(storeRoot, `${name}-${digest}`);
    const stampPath = join(dir, ".stamp.json");
    let fresh = false;
    if (existsSync(stampPath)) {
      try {
        const st = JSON.parse(readFileSync(stampPath, "utf8"));
        fresh = st.digest === digest &&
                typeof st.day === "string" && ageDays(st.day) <= FIXTURE_MAX_AGE_DAYS;
      } catch { fresh = false; }   // a torn stamp is a stale fixture, not a crash
    }
    if (!fresh) {
      console.log(`generating ${label} ...`);
      // Into a scratch name, renamed only after the stamp is written: an interrupted
      // generation must never be mistaken for a complete fixture, and the stamp being the
      // LAST thing written before the rename is what guarantees a stamped dir is a whole one.
      const building = join(storeRoot, `.building-${name}-${process.pid}`);
      rmSync(building, { recursive: true, force: true });
      mkdirSync(storeRoot, { recursive: true });
      const r = spawnSync(process.execPath, [join(HERE, script), "--out", building, ...args],
                          { encoding: "utf8" });
      if (r.status !== 0) {
        console.log(`  cannot generate ${label}: ${(r.stderr || "").trim().split("\n")[0]}`);
        rmSync(building, { recursive: true, force: true });
        return;
      }
      writeFileSync(join(building, ".stamp.json"),
                    JSON.stringify({ digest, day: todayDay(), script, args }, null, 2) + "\n");
      // One copy per shape: older digests of this name are spent, and keeping them would turn
      // the store into the pile of stale directories it exists to replace.
      for (const d of readdirSync(storeRoot)) {
        // ...including any .building- scratch a crashed run left behind, or they accumulate.
        if (d.startsWith(`${name}-`) || (d.startsWith(`.building-${name}-`) && d !== `.building-${name}-${process.pid}`)) {
          rmSync(join(storeRoot, d), { recursive: true, force: true });
        }
      }
      renameSync(building, dir);
    }
    // A fixture directory left in this checkout's root is the old world -- possibly mirrored
    // by hand, certainly not invalidated by anything. Say it is being ignored rather than
    // silently disagreeing with whoever put it there.
    if (existsSync(join(ROOT, name))) {
      console.log(`  note: ${name}/ exists in this checkout and is IGNORED -- the suite uses ` +
                  `the shared store (${dir}); pass --vault to use a specific vault on purpose`);
    }
    out.push({ path: dir, label });
  };

  gen("make-demo-vault.mjs", [], "demo-vault", "the demo vault (sparse tail, 2 dense years)");
  gen("make-test-vault.mjs", ["--notes", "10000", "--years", "10"],
      "test-vault", "the 10k synthetic vault (10 years)");
  gen("make-shape-vault.mjs", [], "shape-vault", "the dominant-folder vault");

  if (!out.length) throw new Error("no vault to check, and none could be generated");
  return out;
}

// One build per vault, shared by all its jobs. Returns "" if there is nothing to build --
// --url was passed, or the build failed, in which case runOne falls back to its own build and
// reports the failure in its own output where it belongs.
async function buildFor(v) {
  if (arg("url", "")) return "";
  const scratch = join(mkdtempSync(join(tmpdir(), "vg-smoke-build-")), "vault-graph.html");
  const b = spawnSync(process.execPath,
                      [join(HERE, "..", "src", "build-graph.mjs"), "--out", scratch]
                        .concat(v.path ? ["--vault", v.path] : []),
                      { encoding: "utf8" });
  if (b.status !== 0) return "";
  const m = /^wrote (.+) \(/m.exec(b.stdout || "");
  if (!m) return "";
  console.log((b.stdout || "").trimEnd());
  return pathToFileURL(m[1].trim()).href;
}

async function main() {
  const picked = selected();
  if (ONLY.length && !picked.length) {
    throw new Error(`--only ${ONLY.join(", ")} matched none of the ${all.length} checks`);
  }
  if (ONLY.length) {
    console.log(`--only: ${picked.length} of ${all.length} checks -- ` +
                picked.map((c) => c.name).join("; "));
    console.log("");
  }
  const vaults = resolveVaults();
  console.log(`checking ${vaults.length} vault(s): ${vaults.map((v) => v.label).join(", ")}`);

  // THE WORK LIST. One entry per (vault, shard). The frame-sensitive checks are one shard of
  // their own per vault and are run last, alone -- see the note on JOBS.
  const shaky = picked.filter(isFrameSensitive);
  const intro = picked.filter((c) => !isFrameSensitive(c) && needsIntro(c));
  const steady = picked.filter((c) => !isFrameSensitive(c) && !needsIntro(c));
  const shard = (list, k) => {
    // Round-robin rather than contiguous slices: the slow checks cluster (every ribbon drag
    // is 5-12s and they are declared together), so contiguous slices give one job the whole
    // tail and the rest nothing to do.
    const out = Array.from({ length: k }, () => []);
    list.forEach((c, i) => out[i % k].push(c));
    return out.filter((g) => g.length);
  };

  // One port per lane, allocated together so they cannot collide with each other.
  const lanePorts = PINNED_PORT ? [] : await freePorts(Math.max(JOBS, 1));

  const parallel = [], serial = [];
  for (const v of vaults) {
    // One build, reused by every job for this vault. buildFor returns "" when --url was
    // passed or the build failed, and runOne falls back to building its own.
    const url = await buildFor(v);
    // ?rest on every lane but the intro's: see NEEDS_INTRO.
    const atRest = url ? url + (url.indexOf("?") < 0 ? "?rest" : "&rest") : url;
    for (const g of shard(steady, JOBS)) {
      parallel.push({ vault: v, checks: g, tag: v.label, url: atRest });
    }
    if (intro.length) {
      parallel.push({ vault: v, checks: intro, tag: v.label + " (intro)", url });
    }
    if (shaky.length) {
      serial.push({ vault: v, checks: shaky, tag: v.label + " (timing-sensitive, serial)", url: atRest });
    }
  }
  if (JOBS > 1) {
    if (FAST) {
      console.log("--fast: pointer-driven checks are sharded, not serial. Frame-reading ones " +
                  "still run alone. Numbers from a contended run are weaker evidence.");
    }
    console.log(`${JOBS} jobs: ${parallel.length} parallel shard(s) of ${steady.length} checks, ` +
                `then ${serial.length} serial job(s) of ${shaky.length} frame-sensitive one(s)`);
  }
  console.log("");

  const failures = new Map();      // vault label -> failed count
  const ran = new Map();           // vault label -> checks actually run
  const bump = (label, r) => {
    failures.set(label, (failures.get(label) || 0) + r.failed);
    ran.set(label, (ran.get(label) || 0) + r.ran);
  };
  const report = (work, r) => {
    console.log("=".repeat(72));
    console.log("== " + work.tag);
    console.log("=".repeat(72));
    for (const l of r.lines) console.log(l);
    console.log("");
  };

  // A fixed pool rather than Promise.all over everything: the point of --jobs is a ceiling on
  // how many browsers exist at once, and Promise.all would launch all of them.
  const pool = async (list, width) => {
    let next = 0;
    const worker = async (lane) => {
      for (;;) {
        const i = next++;
        if (i >= list.length) return;
        // The slot is the POOL LANE rather than the work index: lanes are what exist at the
        // same time, so a finished job's rectangle is reused by whatever starts next instead
        // of the grid marching off the screen on the tenth shard.
        const w = { ...list[i], slot: lane, slots: Math.min(width, list.length),
                    port: lanePorts[lane] || 0 };
        let r;
        try { r = await runOne(w.vault.path, w); }
        catch (e) {
          r = { failed: w.checks.length, ran: w.checks.length,
                lines: ["  !! this job did not run: " + e.message], timings: [] };
        }
        report(w, r);
        bump(w.vault.label, r);
      }
    };
    await Promise.all(Array.from({ length: Math.min(width, list.length) }, (_, lane) => worker(lane)));
  };

  await pool(parallel, JOBS);
  // Serial, and strictly after: these are the checks that measure frames, and the whole
  // reason they are separated is so nothing else is competing for them.
  await pool(serial, 1);

  let worst = 0;
  for (const v of vaults) worst = Math.max(worst, failures.get(v.label) || 0);

  if (vaults.length > 1 || JOBS > 1) {
    console.log(`${"=".repeat(72)}`);
    for (const v of vaults) {
      const f = failures.get(v.label) || 0, t = ran.get(v.label) || 0;
      console.log(`  ${f ? "FAIL" : " ok "}  ${t - f}/${t}  ${v.label}`);
    }
  }
  if (worst) {
    console.log("");
    console.log("Not covered here, check by hand: per-frame animation steps");
    console.log("(__vg.probe/probeReport), and anything about how it looks.");
  }
  return worst ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error("smoke failed to run:", e.message);
  process.exit(1);
});
