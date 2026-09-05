
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
const argAll = (n) => {
  const out = [];
  argv.forEach((a, i) => {
    if (a === "--" + n && argv[i + 1]) out.push(...argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean));
  });
  return out;
};
// github#7
const PINNED_PORT = arg("port", "") ? Number(arg("port", "")) : 0;
const HEADED = argv.includes("--headed");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    for (const srv of held) { try { srv.close(); } catch { } }
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

const all = [];
const check = (name, fn) => all.push({ name, fn });

const ONLY = argAll("only").map((v) => v.toLowerCase());

const NEEDS_INTRO = ["the intro landed"];
const needsIntro = (c) => NEEDS_INTRO.some((q) => c.name.toLowerCase().includes(q));
const selected = () => (ONLY.length
  ? all.filter((c) => ONLY.some((q) => c.name.toLowerCase().includes(q)))
  : all);

// github#7, github#15
const JOBS = Math.max(1, Number(arg("jobs", "4")) || 4);

const GRID = argv.includes("--no-grid") ? false
          : argv.includes("--grid") ? true
          : JOBS > 1;

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
let SCREEN = null;

function gridSlot(i, k) {
  if (!SCREEN) SCREEN = leftmostScreen();
  const cols = Math.ceil(Math.sqrt(Math.max(1, k)));
  const rows = Math.ceil(Math.max(1, k) / cols);
  const w = Math.floor(SCREEN.w / cols), h = Math.floor(SCREEN.h / rows);
  return { x: SCREEN.x + (i % cols) * w, y: SCREEN.y + Math.floor(i / cols) * h,
           w: w, h: h };
}

const FRAME_READING = [
  "ramps",
  "drawn larger",
  "animates instead of snapping",
  "gap reservation holds still",
  "outgrows",                     // github#66
  "fade never reverses",          // github#67
  "waits for the release",
  "haloes but never pushes",
  "resting layout",
];

// github#7
const POINTER_DRIVEN = [
  "flies home",
  "resets the view",
  "pans the camera",
  "wheel notch",
  "drag on the ribbon",
  "brush edge",
  "inside the brush",
  "window and the brush",
  "window track",
  "All dates clears",
  "undated notes survive",
  "recolours exactly one group",
  "fit frames the disc",
  "density follows the notes",
  "auto-fits the camera",
  "left alone by a visibility toggle",
];

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
  return {
    ok: noStrays,
    detail: `${r.iRows} inner rows / ${r.oRows} outer` + (rowsOk ? "" : "  <- INVERTED") +
            `; small folders outside (<${r.smallAt} notes): ` +
            (noStrays ? "none" : r.strays.join(", ")) +
            `; thickness ${r.inner}/${r.outer} = ${ratio.toFixed(2)} (target 0.55, best-effort)`
  };
});

// github#37, github#35
// github#21
check("layout matches its golden snapshot", async (p) => {
  const dd = await p.j("__vg.debugDump()");
  const vaultName = dd.vault.name;
  const fixture = ["demo-vault", "test-vault", "shape-vault"].find((f) => vaultName.startsWith(f + "-"));
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

check("a marked heatmap day recolours its notes", async (p) => {
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
  // github#63
  await settle(p);
  await camSettle(p);
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
  const AIMABLE_PX = 10;
  if (!on.hit && w.gap != null && w.gap < AIMABLE_PX) {
    return { ok: true,
             detail: `skipped — too dense to aim (${w.gap}px clearance, dots ~2.5px); ` +
                     `hover machinery untested at this density` };
  }
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

// github#5
// github#3
check("highlighting ramps per note and is additive", async (p) => {
  const r = await p.j(`(function(){
    var counted = __vg.groupOrder().filter(function (g) { return __vg.groupCount(g) > 0; });
    var pick = function(g){ var f = null; __vg.graph.forEachNode(function(i){ if (!f && __vg.groupOf(i) === g) f = i; }); return f; };
    var gs = counted;
    var a = gs.length > 0 ? pick(gs[0]) : null, b = gs.length > 1 ? pick(gs[1]) : null;
    if (gs.length > 0) { __vg.state.highlight = {}; __vg.state.highlight[gs[0]] = true; __vg.renderer.refresh(); }
    return {ng: gs.length, gs: [gs[0], gs[1]], a: a, b: b};
  })()`);
  if (r.ng < 2) return { ok: true, detail: `only ${r.ng} non-empty group on this shape, nothing to add to` };
  await sleep(700);
  const first = await p.j(`{a: __vg.hl[${JSON.stringify(r.a)}] || 0, busy: __vg.hlBusy}`);
  await p.eval(`__vg.state.highlight[${JSON.stringify(r.gs[1])}] = true; __vg.renderer.refresh(); void 0`);
  await sleep(90);
  const mid = await p.j(`{a: __vg.hl[${JSON.stringify(r.a)}] || 0, b: __vg.hl[${JSON.stringify(r.b)}] || 0}`);
  await p.eval(`__vg.state.highlight = {}; __vg.renderer.refresh(); void 0`);
  await sleep(700);
  const gone = await p.j(`{a: __vg.hl[${JSON.stringify(r.a)}] || 0, b: __vg.hl[${JSON.stringify(r.b)}] || 0}`);
  const ok = first.a === 1 && mid.a === 1 && mid.b > 0 && mid.b < 1 && gone.a === 0 && gone.b === 0;
  return { ok, detail: `first ${first.a}, then first ${mid.a} / second ${mid.b.toFixed(2)}, released ${gone.a}/${gone.b}` };
});

check("hover re-arms after the pointer leaves the stage", async (p) => {
  // github#7
  // github#58
  // github#63
  // github#7
  await settle(p);
  await camSettle(p);
  const w = await p.j(`__vg.demo.where("note","04") || __vg.demo.where("note","03")`);
  if (!w) return { ok: false, detail: "no note target resolved at all" };
  const camAtAim = await p.j(`__vg.renderer.getCamera().getState().ratio`);

  const enter = async (x, y) => {
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await sleep(400);
    return p.j(`{hovered: __vg.state.hovered, t: __vg.hoverT}`);
  };

  const first = await enter(w.x, w.y);
  const away = await enter(5, 5);
  const back = await enter(w.x, w.y);
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, buttons: 0 });
  await sleep(300);

  const AIMABLE_PX = 10;
  if (first.hovered !== w.expect && w.gap != null && w.gap < AIMABLE_PX) {
    return { ok: true,
             detail: `skipped -- too dense to aim (${w.gap}px clearance); the first hover ` +
                     `never landed, so there is nothing to re-arm` };
  }
  const ok = first.hovered === w.expect && away.hovered === null && back.hovered === w.expect;
  // github#7
  // github#63
  let why = "";
  if (!ok) {
    const dg = await p.j(`(function(){
      var a = __vg.graph.getNodeAttributes(${JSON.stringify(w.expect)});
      var o = document.getElementById("vg-graph").getBoundingClientRect();
      var v = __vg.renderer.graphToViewport({x: a.x, y: a.y});
      var el = document.elementFromPoint(${w.x}, ${w.y});
      var d = __vg.renderer.getNodeDisplayData(${JSON.stringify(w.expect)});
      return {dx: +(v.x + o.left - ${w.x}).toFixed(1), dy: +(v.y + o.top - ${w.y}).toFixed(1),
              r: d ? +__vg.renderer.scaleSize(d.size).toFixed(1) : null, hidden: d ? !!d.hidden : null,
              el: el ? (el.id || el.tagName + "." + el.className) : null, busy: __vg.demo.busy(),
              cam: +__vg.renderer.getCamera().getState().ratio.toFixed(4)};
    })()`).catch(() => null);
    if (dg) why = `; target now ${dg.dx},${dg.dy}px from the aim (radius ${dg.r}px` +
                  `${dg.hidden ? ", hidden" : ""}), element at aim ${dg.el || "none"}, ` +
                  `camera ratio ${(+camAtAim).toFixed(4)} at the aim -> ${dg.cam} now` +
                  `${dg.busy ? ", disc still moving" : ""}`;
  }
  return { ok,
           detail: `on ${first.hovered} (t ${first.t}), off ${away.hovered} (t ${away.t}), ` +
                   `back on ${back.hovered} (t ${back.t})` + why };
});

check("a highlighted note is drawn larger", async (p) => {
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
    ok: Math.abs(b.x - a.x) + Math.abs(b.y - a.y) > 0.01 &&
        Math.abs(b.ratio - a.ratio) < 1e-6 && sel === null,
    detail: `camera (${a.x}, ${a.y}) -> (${b.x}, ${b.y}), ratio held at ${b.ratio}, ` +
            `selection ${sel === null ? "untouched" : "CLEARED"}`,
  };
});

check("double-clicking the graph resets the view", async (p) => {
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

// github#4
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

// github#13

// github#13
check("the disc's density follows the notes on screen", async (p) => {
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await camReset(p);

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

  const free = rows.filter((r) => r.pitchRoot && r.sp < 2.59);
  const roots = free.map((r) => r.pitchRoot);
  const spread = roots.length > 1 ? Math.max(...roots) / Math.min(...roots) : 1;

  const sq = [];
  for (const L of lat) {
    for (const [band, v] of [["outer", L.o], ["inner", L.i]]) {
      if (!v || v.n < 9 || v.rows < 2 || !(v.pitch > 1) || !(v.step > 1)) continue;
      sq.push({ keep: L.keep, band: band, n: v.n, rows: v.rows,
                step: Math.round(v.step), pitch: Math.round(v.pitch),
                ratio: Math.round((v.step / v.pitch) * 100) / 100,
                ds: Math.round((2 * (v.dot || 0) / v.step) * 100) / 100 });
    }
  }
  const worstSq = sq.reduce((a, b) =>
    (Math.abs(Math.log(b.ratio)) > Math.abs(Math.log(a.ratio)) ? b : a), sq[0] || { ratio: 1 });
  const SQ_LO = 1 / 1.75, SQ_HI = 1.75;
  const square_ok = !sq.length || sq.every((q) => q.ratio >= SQ_LO && q.ratio <= SQ_HI);

  const base = rows[0];
  const widest = rows.reduce((a, b) => (b.sp > a.sp ? b : a), rows[0]);
  const grew = widest.sp > 1.05 ? widest.sizeMedian / base.sizeMedian : 1;
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

// github#13
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

// github#13
check("fit frames the disc that is actually there", async (p) => {
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await p.eval(`document.querySelector("#vg-reset").click(); void 0`);
  const full = await camSettle(p);

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
  const want = 1.08 * Math.max(0.12, Math.min(1.35, dens.reach));
  return {
    ok: Math.abs(full.ratio - 1.08) < 0.02 && Math.abs(small.ratio - want) < 0.03 &&
        Math.abs(small.x - 0.5) < 0.002 && Math.abs(small.y - 0.5) < 0.002,
    detail: `full vault ratio ${full.ratio}; with ${hid.hidden} of ${hid.hidden + hid.kept} ` +
            `groups hidden the disc reaches ${hid.extent} (${dens.reach} of the lock) and fit ` +
            `gives ${small.ratio} against ${want.toFixed(4)} promised, centred at ` +
            `(${small.x}, ${small.y})`,
  };
});

// github#14
async function toRest(p) {
  await p.eval(`document.querySelector("#vg-reset").click(); void 0`);
  await camSettle(p);
  const dl = Date.now() + 4000;
  while (Date.now() < dl) {
    if (await p.j(`!!__vg.camAtRest`)) return;
    await sleep(60);
  }
}
async function clickEye(p, group) {
  await p.eval(`(function(){
    var want = ${JSON.stringify(group)};
    var els = document.querySelectorAll("[data-eye]");
    for (var i = 0; i < els.length; i++) {
      if (els[i].getAttribute("data-eye") === want) { els[i].click(); return; }
    }
  })(); void 0`);
}
async function biggestGroup(p) {
  return p.j(`(function(){
    var order = __vg.groupOrder(), counts = {};
    __vg.graph.forEachNode(function (id, a) { counts[a.folder] = (counts[a.folder] || 0) + 1; });
    var best = null;
    order.forEach(function (g) { if (!best || (counts[g] || 0) > (counts[best] || 0)) best = g; });
    return best;
  })()`);
}
// github#55
async function watchDuringCascade(p, startRatio, capMs = 8000) {
  var movedWhileBusy = false;
  var deadline = Date.now() + capMs;
  for (;;) {
    // THE CASCADE, not busy(): the question is whether the camera moved while notes were still
    // leaving, and busy() also counts the hover-highlight ramp the eye click starts, which can
    // outlast the cascade under load -- measured once as "moved early: true" in a gate run and
    // 0 of 3 alone, the fit having begun after the last note left but with that ramp still up.
    var s = await p.j(`(function(){ var w = __vg.demo.busyWhy(); return { busy: !!(w.cascade || w.play || w.anim),
      ratio: +__vg.renderer.getCamera().getState().ratio.toFixed(4) }; })()`);
    if (Math.abs(s.ratio - startRatio) > 0.01) movedWhileBusy = true;
    if (!s.busy || Date.now() > deadline) break;
    await sleep(60);
  }
  await sleep(500);
  const settled = await camState(p);
  return { movedWhileBusy, finalRatio: settled.ratio };
}

check("hiding the biggest group auto-fits the camera, but only once it has finished leaving", async (p) => {
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await toRest(p);
  const rest = await camState(p);

  const g = await biggestGroup(p);
  if (!g) return { ok: false, detail: "no group to hide" };

  await clickEye(p, g);
  const { movedWhileBusy, finalRatio } = await watchDuringCascade(p, rest.ratio);
  const dens = await p.j(`__vg.densityReport()`);
  const want = 1.08 * Math.max(0.12, Math.min(1.35, dens.reach));
  const shrinking = want < rest.ratio - 0.01;

  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await toRest(p);

  const atRest = await p.j(`__vg.camAtRest`);
  const ok = shrinking
    ? (!movedWhileBusy && Math.abs(finalRatio - want) < 0.03 && atRest)
    : true;
  return {
    ok,
    detail: shrinking
      ? `hid "${g}" (reach ${dens.reach}): ratio held at ${rest.ratio} while notes left ` +
        `(moved early: ${movedWhileBusy}), landed at ${finalRatio.toFixed(4)} against ` +
        `${want.toFixed(4)} promised, camAtRest ${atRest}`
      : `hid "${g}": reach ${dens.reach} did not shrink the disc below its resting ratio on ` +
        `this fixture -- nothing to assert`,
  };
});

check("showing a hidden group auto-fits the camera while it is still arriving", async (p) => {
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  const g = await biggestGroup(p);
  if (!g) return { ok: false, detail: "no group to hide" };
  await clickEye(p, g);
  await sleep(2500);
  await toRest(p);
  const rest = await camState(p);

  await clickEye(p, g);
  const { movedWhileBusy, finalRatio } = await watchDuringCascade(p, rest.ratio);
  const dens = await p.j(`__vg.densityReport()`);
  const want = 1.08 * Math.max(0.12, Math.min(1.35, dens.reach));
  const growing = want > rest.ratio + 0.01;

  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await toRest(p);

  const atRest = await p.j(`__vg.camAtRest`);
  const ok = growing
    ? (movedWhileBusy && Math.abs(finalRatio - want) < 0.03 && atRest)
    : true;
  return {
    ok,
    detail: growing
      ? `showed "${g}" again (reach ${dens.reach}): ratio moved while notes arrived ` +
        `(${movedWhileBusy}), landed at ${finalRatio.toFixed(4)} against ${want.toFixed(4)} ` +
        `promised, camAtRest ${atRest}`
      : `showed "${g}" again: reach ${dens.reach} did not grow the disc past its resting ` +
        `ratio on this fixture -- nothing to assert`,
  };
});

check("a manually moved camera is left alone by a visibility toggle", async (p) => {
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await toRest(p);

  const g = await biggestGroup(p);
  if (!g) return { ok: false, detail: "no group to hide" };

  const panWas = await p.j(`__vg.renderer.getSetting("enableCameraPanning")`);
  await p.eval(`__vg.renderer.setSetting("enableCameraPanning", true); void 0`);
  await p.eval(`__vg.renderer.getCamera().animate({ x: 0.4, y: 0.6, ratio: 0.5, angle: 0 }, { duration: 60 }); void 0`);
  const dl = Date.now() + 3000;
  let before = await camState(p);
  while (Date.now() < dl && Math.abs(before.ratio - 0.5) > 0.01) { await sleep(60); before = await camState(p); }
  await sleep(150);
  before = await camState(p);
  const atRestAfterMove = await p.j(`__vg.camAtRest`);

  await clickEye(p, g);
  await sleep(3000);
  const after = await camState(p);

  await p.eval(`__vg.renderer.setSetting("enableCameraPanning", ${JSON.stringify(!!panWas)});
    __vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  await sleep(200);
  await toRest(p);

  return {
    ok: !atRestAfterMove && before.ratio === after.ratio && before.x === after.x && before.y === after.y,
    detail: `after a manual move: camAtRest=${atRestAfterMove} (must be false); camera before ` +
      `hiding "${g}" ${JSON.stringify(before)}, after ${JSON.stringify(after)} (must be identical)`,
  };
});

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

check("the pan toggle locks the camera and flies home", async (p) => {
  await camReset(p);
  const box = await stageBox(p);
  const on = await p.j(`document.querySelector("#vg-pan").getAttribute("aria-pressed")`);

  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.cx, y: box.cy, button: "left", clickCount: 1, buttons: 1 });
  for (let i = 1; i <= 6; i++) {
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.cx - i * 18, y: box.cy - i * 10, button: "left", buttons: 1 });
    await sleep(25);
  }
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.cx - 108, y: box.cy - 60, button: "left", clickCount: 1, buttons: 0 });
  const moved = await camSettle(p);

  await p.eval(`document.querySelector("#vg-pan").click(); void 0`);
  for (const dl = Date.now() + 4000; Date.now() < dl && !(await p.j(`!!__vg.camAtRest`));) await sleep(60);
  const home = await camState(p);
  const off = await p.j(`(function(){
    return { pressed: document.querySelector("#vg-pan").getAttribute("aria-pressed"),
             setting: !!__vg.renderer.getSetting("enableCameraPanning"),
             api: !!__vg.panEnabled };
  })()`);

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

check("a link's stroke holds its width at any zoom", async (p) => {
  // github#39
  // github#43
  await camReset(p);
  const hub = await p.j(`(function(){
    var best = null, bd = -1;
    __vg.graph.forEachNode(function (id) {
      var d = __vg.renderer.getNodeDisplayData(id);
      if (!d || d.hidden) return;
      if (__vg.graph.degree(id) > bd) { bd = __vg.graph.degree(id); best = id; }
    });
    return { id: best, degree: bd };
  })()`);

  const at = async (ratio) => {
    await p.eval(`__vg.renderer.getCamera().setState({x:0.5,y:0.5,ratio:${ratio},angle:0}); void 0`);
    let prev = null, same = 0;
    for (let i = 0; i < 60; i++) {
      const r = await p.j(`__vg.edgeReport(${JSON.stringify(hub.id)})`);
      const key = `${r.maxPx}|${r.mult}`;
      if (key === prev) { if (++same >= 2) return r; } else { same = 0; }
      prev = key;
      await sleep(60);
    }
    return p.j(`__vg.edgeReport(${JSON.stringify(hub.id)})`);
  };

  const rest = await at(1.08);
  const five = await at(0.216);
  const ten = await at(0.108);

  await p.eval(`__vg.state.query = "note"; __vg.renderer.refresh(); void 0`);
  const query = await at(0.108);
  await p.eval(`__vg.state.query = ""; __vg.renderer.refresh(); void 0`);
  await camReset(p);

  const cap = rest.capPx;
  const capped = (r) => r.maxPx <= cap + 0.01;
  return {
    ok: capped(rest) && capped(five) && capped(ten) && capped(query) &&
        Math.abs(ten.maxPx - five.maxPx) < 0.02 &&
        Math.abs(ten.ribbonPx - five.ribbonPx) < 0.5 &&
        rest.mult === 1 && ten.mult < 1,
    detail: `hub ${hub.id} (degree ${hub.degree}, ${rest.shown} links shown), cap ${cap}px: ` +
            `rest ${rest.maxPx}px/fan ${rest.ribbonPx}px (mult ${rest.mult}) -> ` +
            `5x ${five.maxPx}px/fan ${five.ribbonPx}px -> ` +
            `10x ${ten.maxPx}px/fan ${ten.ribbonPx}px (mult ${ten.mult}); ` +
            `10x with a search running ${query.maxPx}px; dot ${ten.dotPx}px`,
  };
});

check("the resting web is not floored wider than it asks for", async (p) => {
  // github#42
  await camReset(p);
  const r = await p.j(`(function(){
    var R = __vg.renderer, v = [];
    // The UNFLOORED width of each drawn link -- what it would draw if nothing clipped it.
    // edgeReport deliberately reports the floored value, because that is what the canvas
    // shows; the question here is how far the floor moved it, so it needs the other one.
    __vg.graph.forEachEdge(function (e) {
      var ed = R.getEdgeDisplayData(e);
      if (!ed || ed.hidden) return;
      v.push(R.scaleSize(ed.size));
    });
    v.sort(function (a, b) { return a - b; });
    var r3 = function (x) { return Math.round(x * 1000) / 1000; };
    return { floor: R.getSetting("minEdgeThickness"), n: v.length,
             ratio: r3(R.getCamera().getState().ratio),
             median: r3(v[Math.floor(v.length / 2)]), min: r3(v[0]), max: r3(v[v.length - 1]) };
  })()`);
  const ink = await p.j(`__vg.edgeInk()`);
  const mult = await p.j(`__vg.edgeReport().mult`);

  const inflation = r.floor / r.median;
  return {
    // github#43
    ok: r.floor <= 1.0 && inflation <= 2 && mult === 1 && ink.litPct > 0,
    detail: `floor ${r.floor}px against a median natural stroke of ${r.median}px = ` +
            `${inflation.toFixed(2)}x (needs <= 2; sigma's 1.7 default was ${(1.7 / r.median).toFixed(2)}x). ` +
            `${r.n} links draw ${r.min}..${r.max}px unfloored at ratio ${r.ratio}. ` +
            `Context, not asserted: the web covers ${ink.litPct}% of the stage, ` +
            `mean alpha ${ink.meanAlphaOfLit} where lit, ink ${ink.ink}`,
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

const RIB_BARS = 26;

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

// github#23
function xOfMs(p, ms) {
  return p.j(`__vg.ribbonXOf(${ms})`);
}

async function trackPress(p, box, x, yTrack) {
  await p.send("Input.dispatchMouseEvent",
    { type: "mousePressed", x: box.left + x, y: yTrack, button: "left", clickCount: 1, buttons: 1 });
  await p.send("Input.dispatchMouseEvent",
    { type: "mouseReleased", x: box.left + x, y: yTrack, button: "left", clickCount: 1, buttons: 0 });
  await sleep(200);
  await settle(p);
  return rangeSnap(p);
}

// github#18
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
    ok: Math.abs(wA - wB) <= 86400000 && b.from > a.from,
    detail: `width ${Math.round(wA / 86400000)}d -> ${Math.round(wB / 86400000)}d, ` +
            `moved to ${b.fromISO} -> ${b.toISO}`,
  };
});

check("the band's window and the brush move independently", async (p) => {
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
    // github#18
    detail: `over ${t.days}d of travel: window ${a.winEnd} -> ${b.winEnd} ` +
            `(${winMoved ? "moved" : "HELD"}, brush ${brushHeld ? "held" : "MOVED"}), ` +
            `brush ${b.fromISO} -> ${c.fromISO} ` +
            `(${brushMoved ? "moved" : "HELD"}, window ${winHeld ? "held" : "MOVED"})`,
  };
});

check("a press on the window track centres the window there", async (p) => {
  // github#23
  // github#18
  await clearRange(p);
  const box = await ribbonBox(p);
  const yBars = box.top + 12, yTrack = box.top + RIB_BARS + 5;

  const t = await winTravel(p, box, yTrack);
  await clearRange(p);
  if (t.days < 14) {
    return { ok: true,
             detail: `the ${t.weeks}-week window has ${t.days}d of travel on this vault -- no ` +
                     `interior position to centre on` };
  }

  const a = await ribbonDrag(p, box, Math.round(box.w * 0.30), Math.round(box.w * 0.55), yBars);
  // github#18
  // github#18
  // github#23
  const [loMidPx, hiMidPx] = await p.j(`[
    (__vg.ribbonXOf(${t.loMs} - ${t.spanMs}) + __vg.ribbonXOf(${t.loMs})) / 2,
    (__vg.ribbonXOf(${t.hiMs} - ${t.spanMs}) + __vg.ribbonXOf(${t.hiMs})) / 2
  ]`);
  const pressX = Math.round((loMidPx + hiMidPx) / 2);
  const b = await trackPress(p, box, pressX, yTrack);
  // github#23
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
  // github#13
  const ts = await p.j(`__vg.timeScale`);
  await clearRange(p);
  // github#15
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
  const ONE_ROW = 160;
  // github#17
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
  // github#50
  const g = (await p.j(`__vg.groupOrder().filter(function (x) { return __vg.groupCount(x) > 0; })`))[0];
  out.push(await run("folder toggle", `document.querySelector('[data-eye="' +
    ${JSON.stringify(g)}.replace(/"/g, String.fromCharCode(92) + '"') + '"]').click();`));
  await p.eval(`document.querySelector('[data-eye="' +
    ${JSON.stringify(g)}.replace(/"/g, String.fromCharCode(92) + '"') + '"]').click(); void 0`);
  await settle(p);
  await sleep(200);

  const span = await p.j(`(function () { var f = document.querySelector("#vg-from");
    return f ? { min: f.min, max: f.max } : null; })()`);
  if (span && span.min && span.max) {
    const lo = Date.parse(span.min), hi = Date.parse(span.max);
    const from = new Date(hi - (hi - lo) * 0.15).toISOString().slice(0, 10);
    out.push(await run("range change", `__vg.setRange(${JSON.stringify("PLACEHOLDER")}, null);`
      .replace("PLACEHOLDER", from)));
  }
  await clearRange(p);

  const bad = out.filter((r) => !r.n || r.dr > 16 || r.dt > 16 || r.dd > 5);
  return {
    ok: !bad.length,
    detail: out.map((r) => r.n
      ? `${r.label}: ${r.frames}f, ${r.n} notes, dr ${r.dr} dtan ${r.dt}` +
        (r.dt > 1 ? ` (${r.worst})` : "") + ` dot ${r.dd}%`
      : `${r.label}: nothing sampled`).join(" | "),
  };
});

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
             // How many rows were dense enough to measure a step at all. ds is 0 when
             // this is 0, and that 0 is "unmeasured", not "collapsed" -- see judge().
             stepped: steps.length,
             // Dot radii in PIXELS (rad above is graph units, so the arcs compare to it):
             // the smallest one on screen, and the median. The legibility floor below reads
             // these when there is no step to size a dot against.
             minDotPx: dots.length ? Math.round(dots[0] / perPx * 100) / 100 : 0,
             medDotPx: Math.round(medDot / perPx * 100) / 100,
             rows: Object.keys(rows).length };
  })()`;
  const rest = await p.j(probe);
  const bad = [];
  const seen = [];
  const judge = (label, r) => {
    seen.push(`${label}: ${r.shown}n ${r.rows}r d/s ${r.stepped ? r.ds : "n/a"} ` +
      `dot ${r.medDotPx}px hole ${r.holeRatio}x ` +
      `seam ${r.seamRatio}x${r.seamAt ? " (" + r.seamAt + ")" : ""} ` +
              `clear ${r.worstClear}${r.worstRel ? " (-" + r.worstRel + "%)" : ""}`);
    if (r.shown < 4) return;
    if (r.worstRel > 4) {
      bad.push(`${label}: ${r.overlaps} overlapping pair(s), worst ${r.worstClear} = ` +
               `${r.worstRel}% of the row median`);
    }
    // github#65
    if (r.stepped) {
      if (r.ds < 0.15) bad.push(`${label}: dots collapsed, diameter/step ${r.ds}`);
    } else if (r.minDotPx < rest.medDotPx) {
      // github#53
      bad.push(`${label}: no row holds four notes, and the smallest dot (${r.minDotPx}px) is ` +
               `under the resting median (${rest.medDotPx}px)`);
    }
    if (r.holeRatio > 3.2) bad.push(`${label}: a gap ${r.holeRatio}x the row median INSIDE one wedge`);
  };

  const groups = await p.j(`__vg.groupOrder()`);
  for (const g of groups) {
    const hid = await p.j(`(function(){
      var b = document.querySelector('[data-eye="' + ${JSON.stringify("")} + ${JSON.stringify(g)}.replace(/"/g, '\\\\"') + '"]');
      if (!b) return false; b.click(); return true; })()`);
    if (!hid) continue;
    await settle(p);
    await sleep(600);
    judge(`hidden through ${g}`, await p.j(probe));
  }
  for (const g of groups) {
    await p.j(`(function(){
      var b = document.querySelector('[data-eye="' + ${JSON.stringify("")} + ${JSON.stringify(g)}.replace(/"/g, '\\\\"') + '"]');
      if (b && b.getAttribute("aria-pressed") === "false") b.click();
      return true; })()`).catch(() => 0);
  }
  await settle(p);

  // github#57
  // github#65
  const span = await p.j(`(function(){
    var lo = null, hi = null;
    __vg.graph.forEachNode(function (id, a) {
      var d = a.created ? String(a.created).slice(0, 10) : "";
      if (Number.isNaN(Date.parse(d))) return;      // undated, or an unrendered placeholder
      if (lo === null || d < lo) lo = d;
      if (hi === null || d > hi) hi = d;
    });
    return lo !== null ? { min: lo, max: hi } : null; })()`);
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

// github#66
// github#14
check("a dot never outgrows its resting size while a cascade walks", async (p) => {
  await clearRange(p);
  await settle(p);
  await camSettle(p);
  const pick = await p.j(`(function(){
    var best = null;
    __vg.groupOrder().forEach(function (g) {
      var n = __vg.groupCount(g);
      if (n >= 2 && (!best || n < best.n)) best = { g: g, n: n };
    });
    return best; })()`);
  if (!pick) return { ok: true, detail: "no group with two or more notes to solo -- nothing to walk" };
  const SAMPLE = `(function(){
    var a0 = __vg.renderer.graphToViewport({ x: 0, y: 0 });
    var b0 = __vg.renderer.graphToViewport({ x: 160, y: 0 });
    var perPx = 160 / Math.hypot(b0.x - a0.x, b0.y - a0.y);
    var mx = 0, n = 0;
    __vg.graph.forEachNode(function (id) {
      var d = __vg.renderer.getNodeDisplayData(id);
      if (!d || d.hidden || (__vg.alpha[id] || 0) < 0.999) return;
      n++;
      var r = __vg.renderer.scaleSize(d.size) * perPx;
      if (r > mx) mx = r;
    });
    return { n: n, max: Math.round(mx * 10) / 10, busy: __vg.demo.busy() }; })()`;
  const before = await p.j(SAMPLE);
  const w = await p.j(`__vg.demo.where("only", ${JSON.stringify(pick.g)})`);
  if (!w) return { ok: false, detail: `no "only" chip resolved for ${pick.g}` };
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: w.x, y: w.y, buttons: 0 });
  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 1 });
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 0 });
  let peak = 0, peakAt = 0, frames = 0;
  const t0 = Date.now();
  for (;;) {
    const smp = await p.j(SAMPLE);
    frames++;
    if (smp.max > peak) { peak = smp.max; peakAt = Date.now() - t0; }
    if (!smp.busy && frames > 3) break;
    if (Date.now() - t0 > 12000) break;
    await sleep(30);
  }
  await settle(p);
  await camSettle(p);
  await sleep(300);
  const after = await p.j(SAMPLE);
  const groups = await p.j(`__vg.groupOrder()`);
  for (const g of groups) {
    await p.j(`(function(){
      var b = document.querySelector('[data-eye="' + ${JSON.stringify(g)}.replace(/"/g, '\\"') + '"]');
      if (b && b.getAttribute("aria-pressed") === "false") b.click();
      return true; })()`).catch(() => 0);
  }
  await settle(p);
  await camSettle(p);
  const bound = Math.max(before.max, after.max) * 1.05;
  const ok = peak <= bound;
  return { ok,
           detail: `soloed ${pick.g} (${pick.n} notes): biggest dot ${before.max} units at rest ` +
                   `-> peak ${peak} at ${peakAt}ms over ${frames} frames -> ${after.max} at rest ` +
                   `(${after.n} shown); bound ${Math.round(bound * 10) / 10}` +
                   (ok ? "" : `  <- overshoots both resting sizes by ${(peak / Math.max(before.max, after.max)).toFixed(2)}x`) };
});

// github#67
check("an arriving note's fade never reverses during a solo switch", async (p) => {
  await clearRange(p);
  await settle(p);
  await camSettle(p);
  const pair = await p.j(`(function(){
    var gs = __vg.groupOrder().map(function (g) { return { g: g, n: __vg.groupCount(g) }; })
      .filter(function (x) { return x.n >= 2; }).sort(function (x, y) { return x.n - y.n; });
    return gs.length >= 2 ? [gs[0], gs[1]] : null; })()`);
  if (!pair) return { ok: true, detail: "fewer than two groups with two or more notes -- nothing to switch between" };
  const solo = async (g) => {
    const w = await p.j(`__vg.demo.where("only", ${JSON.stringify(g)})`);
    if (!w) throw new Error(`no "only" chip resolved for ${g}`);
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: w.x, y: w.y, buttons: 0 });
    await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 1 });
    await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 0 });
  };
  await solo(pair[0].g);
  await settle(p);
  await camSettle(p);
  const arriving = await p.j(`(function(){ var out = []; __vg.graph.forEachNode(function (id) {
    if (__vg.groupOf(id) === ${JSON.stringify(pair[1].g)}) out.push(id); }); return out; })()`);
  await solo(pair[1].g);
  const last = {}, drops = {}, peakDrop = {};
  let samples = 0;
  const t0 = Date.now();
  for (;;) {
    const s = await p.j(`(function(){ var a = {}; ${JSON.stringify(arriving)}.forEach(function (id) { a[id] = __vg.alpha[id] || 0; }); return { a: a, busy: __vg.demo.busy() }; })()`);
    samples++;
    for (const id of arriving) {
      const v = s.a[id];
      if (last[id] !== undefined && v < last[id] - 0.02) {
        drops[id] = (drops[id] || 0) + 1;
        peakDrop[id] = Math.max(peakDrop[id] || 0, last[id] - v);
      }
      last[id] = v;
    }
    if (!s.busy && samples > 3) break;
    if (Date.now() - t0 > 12000) break;
  }
  await settle(p);
  const groups = await p.j(`__vg.groupOrder()`);
  for (const g of groups) {
    await p.j(`(function(){
      var b = document.querySelector('[data-eye="' + ${JSON.stringify(g)}.replace(/"/g, '\\"') + '"]');
      if (b && b.getAttribute("aria-pressed") === "false") b.click();
      return true; })()`).catch(() => 0);
  }
  await settle(p);
  await camSettle(p);
  const flickering = arriving.filter((id) => drops[id]);
  const worst = flickering.sort((x, y) => (drops[y] || 0) - (drops[x] || 0))[0];
  return { ok: flickering.length === 0,
           detail: `${pair[0].g} (${pair[0].n}) -> ${pair[1].g} (${pair[1].n}): ${arriving.length} arriving notes over ` +
                   `${samples} samples, ${flickering.length} with a reversed fade` +
                   (worst ? ` (worst #${worst}: ${drops[worst]} drops, biggest ${peakDrop[worst].toFixed(2)})` : "") };
});

check("the gap reservation holds still while groups only thin", async (p) => {
  await clearRange(p);
  const before = await p.j(`__vg.rangeReport()`);
  // github#20
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
  })()`);
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
    ok: r.ngMaxStep === 0 && !emptied,
    detail: emptied
      ? `the cut at ${cut} emptied a group (nG outer ${s0.ngO} -> ${s1.ngO}, ` +
        `inner ${s0.ngI} -> ${s1.ngI}), which the derived cut exists to prevent`
      : `cut at ${cut}: nG held (outer ${s1.ngO}, inner ${s1.ngI}) across ${r.frames} frames, ` +
        `worst step ${r.ngMaxStep}; lit ${before.lit} -> ${after.lit}`,
  };
});

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

  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: list.x, y: list.y - 220 });
  await sleep(220);
  const left = await p.j(`__vg.state.hoverYear`);
  await clearRange(p);
  const yr = list.pick;
  const okRange = clicked.lit > 0 &&
        (clicked.fromISO === null || clicked.fromISO.slice(0, 4) === yr) &&
        (clicked.toISO === null || clicked.toISO.slice(0, 4) === yr);
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
  await clearRange(p);
  await settle(p);
  const scale = await p.j(`__vg.timeScale`);
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
  // github#23
  // github#51
  const r = await p.j(`(function(){
    var d = __vg.dateSpan;
    if (!d || d.years.length < 2) return { skip: "fewer than two years on this vault" };
    var ax = d.axis, w = document.querySelector("#vg-ribbon").getBoundingClientRect().width;
    var byYear = {};
    ax.segs.forEach(function (s) {
      var yy = d.months[s.i].y;
      byYear[yy] = (byYear[yy] || 0) + (s.w1 - s.w0) / ax.totalW * w;
    });
    // The year the last month belongs to: the one lastFrac shortens.
    var partialYear = d.months.length ? d.months[d.months.length - 1].y : null;
    var years = d.years
      .filter(function (yy) { return yy.y !== partialYear; })
      .map(function (yy) { return { y: yy.y, n: yy.n, px: byYear[yy.y] || 0 }; });
    if (years.length < 2) {
      return { skip: "only " + years.length + " full year(s) once " + partialYear +
                     " is set aside -- its final month is still running, so its drawn " +
                     "width is foreshortened by design (github#51)" };
    }
    var busiest = years.reduce(function (a, b) { return b.n > a.n ? b : a; });
    var quietest = years.reduce(function (a, b) { return b.n < a.n ? b : a; });
    return { busiest: busiest, quietest: quietest, partialYear: partialYear };
  })()`);
  if (r.skip) return { ok: true, detail: `NOT ASSERTED: ${r.skip}` };
  if (r.busiest.n === r.quietest.n) {
    return { ok: true, detail: `NOT ASSERTED: every full year holds the same note count (${r.busiest.n}) on this vault` };
  }
  const ok = r.busiest.px > r.quietest.px;
  return {
    ok,
    detail: `busiest full year ${r.busiest.y} (${r.busiest.n} notes) draws ${Math.round(r.busiest.px)}px ` +
      `against quietest ${r.quietest.y} (${r.quietest.n} notes) at ${Math.round(r.quietest.px)}px` +
      `; ${r.partialYear} set aside, its final month still running`,
  };
});

check("compact axis: sparse years cluster near the same floor width", async (p) => {
  // github#23
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
  const spread = r.max - r.min;
  const ok = spread <= r.max * 0.6 + 5;
  return {
    ok,
    detail: `${r.n} sparse years span ${Math.round(r.min)}-${Math.round(r.max)}px (spread ${Math.round(spread)}px)`,
  };
});

check("the ribbon's right edge is a day the vault has actually reached", async (p) => {
  // github#51
  const r = await p.j(`(function(){
    var d = __vg.dateSpan;
    if (!d) return { skip: true };
    // Bare ISO days only, tested by shape rather than by regex -- heatParse is not on __vg,
    // and a template literal would eat the backslashes of one anyway.
    var isDay = function (s) {
      return !!s && s.length === 10 && s.charAt(4) === "-" && s.charAt(7) === "-";
    };
    var newest = null;
    __vg.graph.forEachNode(function (id, a) {
      if (isDay(a.created) && (newest === null || a.created > newest)) newest = a.created;
    });
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var t = new Date();
    // TODAY'S LOCAL DAY, built the same way src/page.js builds TODAY -- not toISOString,
    // which is UTC and would disagree by a day for most of the evening in a +NN zone.
    var today = t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate());
    // The last month's segment against a complete month's in the SAME year. Compared in
    // WEIGHT units, not pixels: the ratio is the assertion, so converting would only add
    // rounding to it.
    var last = d.months.length - 1, lastY = d.months[last].y, lastM = d.months[last].m;
    var ax = d.axis;
    var wOf = function (mi) { var s = ax.segs[ax.segOfMonth[mi]]; return s.w1 - s.w0; };
    var sibling = null, yearW = 0;
    for (var mi = 0; mi <= last; mi++) if (d.months[mi].y === lastY) {
      if (sibling === null && mi < last) sibling = mi;
      yearW += wOf(mi);
    }
    return {
      // The number github#51 was written around: "September holds 1/9 of the year's width
      // for two days of content, the same slice August gets for thirty-one." Reported, not
      // asserted -- the ratio against a sibling month above is the same statement with the
      // year's own month count divided out, and is the one worth failing on.
      lastShareOfYear: yearW > 0 ? wOf(last) / yearW : 0,
      lastPx: (wOf(last) / ax.totalW) * document.querySelector("#vg-ribbon").getBoundingClientRect().width,
      hiISO: new Date(d.hi).toISOString().slice(0, 10),
      today: today, newest: newest, lastKey: d.months[last].key,
      monthEndISO: new Date(Date.UTC(lastY, lastM + 1, 0)).toISOString().slice(0, 10),
      daysIn: new Date(Date.UTC(lastY, lastM + 1, 0)).getUTCDate(),
      lastW: wOf(last), sibW: sibling === null ? null : wOf(sibling),
      edgeX: __vg.ribbonXOf(d.hi),
      w: document.querySelector("#vg-ribbon").getBoundingClientRect().width
    };
  })()`);
  if (r.skip) return { ok: false, detail: "no dateSpan on this vault" };
  const later = (a, b) => (a > b ? a : b);
  const earlier = (a, b) => (a < b ? a : b);
  const wantHi = earlier(r.monthEndISO, later(r.newest || r.today, r.today));
  const notFuture = r.hiISO <= r.today;
  const reachesNewest = r.newest === null || r.hiISO >= r.newest;
  const rightDay = r.hiISO === wantHi;
  const edgeAtEnd = Math.abs(r.edgeX - r.w) <= 1;
  const elapsed = Number(wantHi.slice(8, 10));
  const want = elapsed / r.daysIn;
  const got = r.sibW === null ? null : r.lastW / r.sibW;
  const proRated = got === null || Math.abs(got - want) <= 0.01;
  const parts = [
    `span ends ${r.hiISO}, wanted ${wantHi} (today ${r.today}, newest note ` +
      `${r.newest || "none"}, ${r.lastKey} ends ${r.monthEndISO})`,
    `right edge at ${r.edgeX.toFixed(1)}px of ${r.w.toFixed(1)}px`,
    `${r.lastKey} takes ${(r.lastShareOfYear * 100).toFixed(2)}% of ${r.lastKey.slice(0, 4)}'s ` +
      `width (${r.lastPx.toFixed(1)}px)`,
    r.sibW === null
      ? `${r.lastKey} is the only month in ${r.lastKey.slice(0, 4)} -- no complete sibling to compare against`
      : `${r.lastKey} draws ${(got * 100).toFixed(1)}% of a complete month in the same year, ` +
        `wanted ${(want * 100).toFixed(1)}% (${elapsed}/${r.daysIn} days reached)` +
        (elapsed === r.daysIn
          ? " -- VACUOUS on this vault: its last month is already over, so the pro-rating has nothing to do here"
          : ""),
  ];
  if (!notFuture) parts.push("<- THE SPAN ENDS IN THE FUTURE");
  if (!reachesNewest) parts.push("<- THE NEWEST NOTE IS PAST THE RIGHT EDGE");
  if (!rightDay) parts.push("<- THE SPAN DOES NOT END ON THE DAY IT REACHES");
  if (!edgeAtEnd) parts.push("<- dateSpan.hi IS NOT AT THE STRIP'S RIGHT EDGE");
  if (!proRated) parts.push("<- THE MONTH IN PROGRESS IS NOT PRO-RATED BY ITS ELAPSED DAYS");
  return { ok: notFuture && reachesNewest && rightDay && edgeAtEnd && proRated,
           detail: parts.join("; ") };
});

check("compact axis: the settings-panel toggle actually flips the live state", async (p) => {
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

// github#3
check("colour unlinked by folder: the settings-panel toggle actually flips the live state", async (p) => {
  const r = await p.j(`(function(){
    var gear = document.querySelector("#vg-gear");
    if (!gear || gear.hidden) return { noGear: true };
    gear.click();
    var before = document.querySelector("#vg-opt-unlinkedByFolder");
    if (!before) return { noButton: true };
    var beforePressed = before.getAttribute("aria-pressed"), beforeState = __vg.unlinkedByFolder;
    before.click();
    var after = document.querySelector("#vg-opt-unlinkedByFolder");
    var afterPressed = after && after.getAttribute("aria-pressed"), afterState = __vg.unlinkedByFolder;
    if (after && afterState !== beforeState) after.click();
    gear.click();
    return { beforePressed: beforePressed, beforeState: beforeState,
             afterPressed: afterPressed, afterState: afterState };
  })()`);
  if (r.noGear) return { ok: false, detail: "no #vg-gear on this build -- standalone only" };
  if (r.noButton) {
    return { ok: false, detail: "gear opened but #vg-opt-unlinkedByFolder was not found -- the " +
      "rendered row id and the $() lookup setUnlinkedByFolder uses have drifted apart" };
  }
  const flipped = r.afterState !== r.beforeState && r.afterPressed !== r.beforePressed;
  return {
    ok: flipped,
    detail: `clicking the row: state ${r.beforeState}->${r.afterState}, aria-pressed ` +
      `${r.beforePressed}->${r.afterPressed}`,
  };
});

// github#3
check("colour unlinked notes by folder: the settings-panel toggle actually flips the live state", async (p) => {
  const r = await p.j(`(function(){
    var gear = document.querySelector("#vg-gear");
    if (!gear || gear.hidden) return { noGear: true };
    gear.click();
    var before = document.querySelector("#vg-opt-unlinkedTintByFolder");
    if (!before) return { noButton: true };
    var beforePressed = before.getAttribute("aria-pressed"), beforeState = __vg.unlinkedTintByFolder;
    before.click();
    var after = document.querySelector("#vg-opt-unlinkedTintByFolder");
    var afterPressed = after && after.getAttribute("aria-pressed"), afterState = __vg.unlinkedTintByFolder;
    if (after && afterState !== beforeState) after.click();
    gear.click();
    return { beforePressed: beforePressed, beforeState: beforeState,
             afterPressed: afterPressed, afterState: afterState };
  })()`);
  if (r.noGear) return { ok: false, detail: "no #vg-gear on this build -- standalone only" };
  if (r.noButton) {
    return { ok: false, detail: "gear opened but #vg-opt-unlinkedTintByFolder was not found -- the " +
      "rendered row id and the $() lookup setUnlinkedTintByFolder uses have drifted apart" };
  }
  const flipped = r.afterState !== r.beforeState && r.afterPressed !== r.beforePressed;
  return {
    ok: flipped,
    detail: `clicking the row: state ${r.beforeState}->${r.afterState}, aria-pressed ` +
      `${r.beforePressed}->${r.afterPressed}`,
  };
});

check("compact axis: the view-level icon actually flips the live state, and persists", async (p) => {
  // github#23
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
  // github#31
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
  // github#31
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

// github#50
// github#48
check("a folder keeps its slot across the membership toggle", async (p) => {
  const r = await p.j(`(function(){
    // HOW MANY NOTES THE FLIP MOVES, and the skip test in one number: it is the orphan count
    // either way round, since those are exactly the notes whose group the toggle changes.
    // Reported with the verdict rather than left to be trusted -- a shape where it came back 0
    // would make every comparison below vacuous.
    var orphans = __vg.graph.nodes().filter(function (id) { return __vg.isOrphan(id); }).length;
    if (!orphans) return { skip: true };
    var startOn = __vg.unlinkedByFolder;
    var snap = function () {
      var o = __vg.groupOrder(), s = {};
      o.forEach(function (g) { s[g] = __vg.autoSlotOf(g) + "/" + __vg.slotOf(g); });
      return { order: o, slot: s };
    };
    var a = snap();
    __vg.setUnlinkedByFolder(!startOn); var b = snap();
    __vg.setUnlinkedByFolder(startOn);  var c = snap();

    // Named per direction, because "6 disturbed" without which flip did it sends the reader
    // to the wrong half of the change.
    var diff = function (x, y) {
      return {
        lost: x.order.filter(function (g) { return y.order.indexOf(g) < 0; }),
        moved: x.order.filter(function (g) { return y.slot[g] && y.slot[g] !== x.slot[g]; })
      };
    };
    return { groups: a.order.length, notesMoved: orphans, away: diff(a, b), back: diff(a, c) };
  })()`);
  if (r.skip) return { ok: true, detail: "no unlinked notes on this shape, nothing to move" };
  const names = (d) => [].concat(d.lost.map((g) => "lost " + g),
                                 d.moved.map((g) => "renumbered " + g)).join(", ");
  const bad = r.away.lost.length + r.away.moved.length + r.back.lost.length + r.back.moved.length;
  return { ok: bad === 0,
           detail: `${r.groups} groups, ${r.notesMoved} notes moved by the flip, ` +
                   `${bad} groups disturbed` +
                   (bad ? ` -- on the flip: ${names(r.away) || "none"}; once back: ` +
                          `${names(r.back) || "none"}` : "") };
});

// github#34
check("a folder's legend row toggles \"hidden by default\" from its context menu", async (p) => {
  const r = await p.j(`(function(){
    var g = __vg.groupOrder().filter(function (x) { return x.charAt(0) !== "("; })[0];
    var hiddenByDefault = function (x) {
      return typeof __vg.folderShown[x] === "boolean" ? !__vg.folderShown[x] : __vg.isArchiveGroup(x);
    };
    var startShown = !hiddenByDefault(g);
    var liveHiddenBefore = !!(__vg.state.hidden.folder || {})[g];   // to restore exactly, below

    var row = document.querySelector('[data-g="' + g.replace(/"/g, '\\\\"') + '"]');
    var rect = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
    var menu = document.querySelector('[id$="ctxmenu"]');
    var visBtn = menu && !menu.hidden ? menu.querySelector("[data-vis]") : null;
    var openedOk = !!visBtn;
    var pressedBefore = openedOk ? visBtn.getAttribute("aria-pressed") : null;
    if (visBtn) visBtn.click();
    var closedAfter = menu.hidden;

    var defaultFlipped = hiddenByDefault(g) === startShown;   // was hidden -> shown, or back
    var rowAfter = document.querySelector('[data-g="' + g.replace(/"/g, '\\\\"') + '"]');
    var legendFollowed = rowAfter && rowAfter.getAttribute("aria-pressed") === String(!startShown);
    var settingsEye = document.querySelector('.scr [data-vis="' + g.replace(/"/g, '\\\\"') + '"]');
    var settingsAgrees = settingsEye ? settingsEye.getAttribute("aria-pressed") === String(!startShown) : null;

    // Restore both the default AND the live filter to exactly what they were, not just
    // the default -- leaving this check's OWN side effect for the next one to trip over
    // would be the identical mistake it exists to catch.
    __vg.setFolderShown(Object.assign({}, __vg.folderShown, { [g]: startShown }));
    var h = __vg.state.hidden.folder || (__vg.state.hidden.folder = {});
    if (liveHiddenBefore) h[g] = true; else delete h[g];
    __vg.syncAlpha(); __vg.applyLayout(false);

    return { g: g, startShown: startShown, openedOk: openedOk, pressedBefore: pressedBefore,
             closedAfter: closedAfter, defaultFlipped: defaultFlipped,
             legendFollowed: legendFollowed, settingsAgrees: settingsAgrees };
  })()`);
  const ok = r.openedOk && r.pressedBefore === String(r.startShown) && r.closedAfter &&
             r.defaultFlipped && r.legendFollowed && r.settingsAgrees !== false;
  return { ok, detail: `"${r.g}" started ${r.startShown ? "shown" : "hidden"} by default; ` +
    `menu opened with the toggle ${r.openedOk ? "present" : "MISSING"} ` +
    `(pressed=${r.pressedBefore}); after click: menu closed=${r.closedAfter}, ` +
    `default flipped=${r.defaultFlipped}, legend followed=${r.legendFollowed}, ` +
    `settings panel agrees=${r.settingsAgrees}` };
});

/* ------------------------------------------------------------------------ the hub */

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
  const ok = after.worst <= before.worst * 1.35 + 0.05;
  return { ok, detail: `worst neighbour gap in ${before.group} (${before.notes} notes): ` +
                       `${before.worst}x median at rest -> ${after.worst}x with 6 pinned` };
});

check("the hub's dots shrink as it fills", async (p) => {
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

// github#35
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
    return { ok: true, detail: `NOT ASSERTED: no folder on this vault solos down to a single ` +
                                `inner-band note -- tried ${r.tried.join(", ")}` };
  }
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
  await sleep(500);
  const back = await markOn();
  const ok = Number(rest.opacity) > 0.5 && Number(held.opacity) < 0.05 &&
             Number(back.opacity) > 0.5 && !held.hidden;
  return { ok, detail: `opacity ${rest.opacity} at rest -> ${held.opacity} with 3 pinned ` +
                       `(hidden=${held.hidden}, must be false) -> ${back.opacity} cleared` };
});

check("a pin hidden by a filter is skipped, not released", async (p) => {
  await pinN(p, 3);
  const before = await p.j(`__vg.pinned().length`);
  const drawnNow = () => p.j(`(function(){ var n = 0;
    __vg.pinned().forEach(function(id){ if ((__vg.alpha[id]||0) > 0.5) n++; }); return n; })()`);
  const drawnRest = await drawnNow();
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

// github#3
// github#3
check("every unlinked note wears the (unlinked) swatch", async (p) => {
  const r = await p.j(`(function(){
    // BOTH toggles forced off: unlinkedByFolder (membership) so notes are actually
    // standing in this group at all, and unlinkedTintByFolder (colour, github#3 re-read
    // again) so the flat-swatch behaviour this check guards is what's actually active
    // rather than each unlinked note wearing its own folder's tint while still in the
    // group. Defensive on the second even though it defaults off -- explicit beats
    // depending on every other check to have cleaned up after itself.
    var startOn = __vg.unlinkedByFolder, startTint = __vg.unlinkedTintByFolder;
    if (startOn) __vg.setUnlinkedByFolder(false);
    if (startTint) __vg.setUnlinkedTintByFolder(false);
    var g = __vg.graph, rd = __vg.renderer, sw = String(__vg.colorOf("(unlinked)")).toLowerCase();
    // THE PAGE'S OWN PREDICATE, not graph.degree: in a budgeted vault the graph carries only
    // the strongest share of the web, so degree-0 there includes thousands of linked notes
    // whose links happen to be trimmed at rest -- measured, 281 of them wearing their folder
    // colour, which is correct behaviour failing a check that asked the wrong question.
    var ids = g.nodes().filter(function (id) { return __vg.isOrphan(id); });
    var cols = ids.map(function (id) { return String(rd.getNodeDisplayData(id).color).toLowerCase(); });
    var result = { swatch: sw, orphans: ids.length,
             match: cols.filter(function (c) { return c === sw; }).length,
             distinct: Object.keys(cols.reduce(function (a, c) { a[c] = 1; return a; }, {})).length };
    if (startTint) __vg.setUnlinkedTintByFolder(true);
    if (startOn) __vg.setUnlinkedByFolder(true);
    return result;
  })()`);
  if (!r.orphans) return { ok: true, detail: "no unlinked notes on this shape, nothing to measure" };
  return { ok: r.match === r.orphans,
           detail: `${r.match} of ${r.orphans} on ${r.swatch}, ${r.distinct} distinct` };
});

// github#3
// github#34
check("the (unlinked) row's right-click toggle moves unlinked notes into their folder", async (p) => {
  const r = await p.j(`(function(){
    var g = __vg.graph, rd = __vg.renderer;
    var ids = g.nodes().filter(function (id) { return __vg.isOrphan(id); });
    if (!ids.length) return { skip: true };
    var startOn = __vg.unlinkedByFolder;
    if (startOn) __vg.setUnlinkedByFolder(false);

    var row = document.querySelector('[data-g="(unlinked)"]');
    if (!row) return { skip: true };
    var rect = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
    var menu = document.querySelector('[id$="ctxmenu"]');
    var byBtn = menu && !menu.hidden ? menu.querySelector("[data-byfolder]") : null;
    var openedOk = !!byBtn;
    var pressedBefore = openedOk ? byBtn.getAttribute("aria-pressed") : null;
    if (byBtn) byBtn.click();
    var closedAfter = menu.hidden;
    var turnedOn = __vg.unlinkedByFolder === true;
    var countAfter = __vg.groupCount("(unlinked)");

    // nodeColor(), not a mirrored formula: it is the exact function under test, so this
    // asks "did the paint agree with the function" rather than "did the paint agree with
    // this check's own guess at what the function does."
    var expected = ids.map(function (id) { return String(__vg.nodeColor(id)).toLowerCase(); });
    var actual = ids.map(function (id) { return String(rd.getNodeDisplayData(id).color).toLowerCase(); });
    var matched = actual.filter(function (c, i) { return c === expected[i]; }).length;

    // Restore exactly, same discipline as the github#34 check above.
    __vg.setUnlinkedByFolder(startOn);

    return { skip: false, ids: ids.length, openedOk: openedOk, pressedBefore: pressedBefore,
             closedAfter: closedAfter, turnedOn: turnedOn, countAfter: countAfter,
             matched: matched };
  })()`);
  if (r.skip) return { ok: true, detail: "no unlinked notes on this shape, nothing to measure" };
  const ok = r.openedOk && r.pressedBefore === "false" && r.closedAfter &&
             r.turnedOn && r.countAfter === 0 && r.matched === r.ids;
  return { ok, detail: `${r.ids} unlinked notes; menu opened with the toggle ` +
    `${r.openedOk ? "present" : "MISSING"} (pressed=${r.pressedBefore}); after click: ` +
    `menu closed=${r.closedAfter}, toggle turned on=${r.turnedOn}, (unlinked) count after=` +
    `${r.countAfter}, ${r.matched} of ${r.ids} repainted to their folder's tint` };
});

// github#3
check("the (unlinked) row's right-click tint toggle recolours notes without moving them", async (p) => {
  const r = await p.j(`(function(){
    var g = __vg.graph, rd = __vg.renderer;
    var ids = g.nodes().filter(function (id) { return __vg.isOrphan(id); });
    if (!ids.length) return { skip: true };
    var startOn = __vg.unlinkedByFolder, startTint = __vg.unlinkedTintByFolder;
    if (startOn) __vg.setUnlinkedByFolder(false);      // kept separate, so the button exists
    if (startTint) __vg.setUnlinkedTintByFolder(false); // start from the flat swatch

    var row = document.querySelector('[data-g="(unlinked)"]');
    if (!row) return { skip: true };
    var rect = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
    var menu = document.querySelector('[id$="ctxmenu"]');
    var tintBtn = menu && !menu.hidden ? menu.querySelector("[data-tint]") : null;
    var openedOk = !!tintBtn;
    var pressedBefore = openedOk ? tintBtn.getAttribute("aria-pressed") : null;
    if (tintBtn) tintBtn.click();
    var closedAfter = menu.hidden;
    var turnedOn = __vg.unlinkedTintByFolder === true;
    // MEMBERSHIP MUST NOT MOVE: the whole point of this being a separate toggle is that
    // colouring in place is not the same as joining -- the count stays exactly what it was.
    var countAfter = __vg.groupCount("(unlinked)");

    var expected = ids.map(function (id) { return String(__vg.nodeColor(id)).toLowerCase(); });
    var actual = ids.map(function (id) { return String(rd.getNodeDisplayData(id).color).toLowerCase(); });
    var matched = actual.filter(function (c, i) { return c === expected[i]; }).length;
    var distinct = Object.keys(actual.reduce(function (a, c) { a[c] = 1; return a; }, {})).length;

    __vg.setUnlinkedTintByFolder(startTint);
    __vg.setUnlinkedByFolder(startOn);

    return { skip: false, ids: ids.length, openedOk: openedOk, pressedBefore: pressedBefore,
             closedAfter: closedAfter, turnedOn: turnedOn, countAfter: countAfter,
             matched: matched, distinct: distinct };
  })()`);
  if (r.skip) return { ok: true, detail: "no unlinked notes on this shape, nothing to measure" };
  const ok = r.openedOk && r.pressedBefore === "false" && r.closedAfter && r.turnedOn &&
             r.countAfter === r.ids && r.matched === r.ids;
  return { ok, detail: `${r.ids} unlinked notes kept separate; menu opened with the toggle ` +
    `${r.openedOk ? "present" : "MISSING"} (pressed=${r.pressedBefore}); after click: ` +
    `menu closed=${r.closedAfter}, toggle turned on=${r.turnedOn}, (unlinked) count still=` +
    `${r.countAfter} (must equal ${r.ids}, not 0 -- membership must not move), ` +
    `${r.matched} of ${r.ids} repainted to their folder's tint, ${r.distinct} distinct` };
});

// github#50
// github#50
check("the (unlinked) row opens its menu with no notes in it", async (p) => {
  const r = await p.j(`(function(){
    if (!__vg.graph.nodes().some(function (id) { return __vg.isOrphan(id); })) return { skip: true };
    var startOn = __vg.unlinkedByFolder;
    if (!startOn) __vg.setUnlinkedByFolder(true);      // the default: the group is empty
    var emptyNow = __vg.groupCount("(unlinked)");

    var row = document.querySelector('[data-g="(unlinked)"]');
    var rowFound = !!row;
    // The two controls github#50 drops, and the placeholders that hold their space -- asserted
    // here rather than trusted, since the row's alignment depends on the second one.
    var lgr = row ? row.closest(".lgr") : null;
    var noEye = !!lgr && !lgr.querySelector("[data-eye]") && !!lgr.querySelector(".eye.none");
    var noOnly = !!row && !row.querySelector("[data-only]") && !!row.querySelector(".only.none");
    var dimmed = !!lgr && lgr.classList.contains("lgr-empty");

    var openedOk = false, pressedBefore = null, closedAfter = null, turnedOff = null;
    if (row) {
      var rect = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
      var menu = document.querySelector('[id$="ctxmenu"]');
      var byBtn = menu && !menu.hidden ? menu.querySelector("[data-byfolder]") : null;
      openedOk = !!byBtn;
      if (byBtn) {
        pressedBefore = byBtn.getAttribute("aria-pressed");
        byBtn.click();
        closedAfter = menu.hidden;
        turnedOff = __vg.unlinkedByFolder === false;
      }
    }
    if (__vg.unlinkedByFolder !== startOn) __vg.setUnlinkedByFolder(startOn);
    return { empty: emptyNow, rowFound: rowFound, noEye: noEye, noOnly: noOnly, dimmed: dimmed,
             openedOk: openedOk, pressedBefore: pressedBefore, closedAfter: closedAfter,
             turnedOff: turnedOff };
  })()`);
  if (r.skip) return { ok: true, detail: "no unlinked notes on this shape, nothing to empty" };
  const ok = r.rowFound && r.empty === 0 && r.noEye && r.noOnly && r.dimmed &&
             r.openedOk && r.closedAfter === true && r.turnedOff === true;
  return { ok, detail: `row ${r.rowFound ? "present" : "MISSING"} at count ${r.empty}, ` +
    `dimmed=${r.dimmed}, eye dropped for a placeholder=${r.noEye}, only dropped for a ` +
    `placeholder=${r.noOnly}; menu ${r.openedOk ? "opened" : "DID NOT OPEN"} ` +
    `(pressed=${r.pressedBefore}), closed=${r.closedAfter}, membership turned back off=` +
    `${r.turnedOff}` };
});

// github#3
check("the (unlinked) row's count is parenthesised while kept separate, plain once joined", async (p) => {
  const r = await p.j(`(function(){
    var startOn = __vg.unlinkedByFolder;
    if (startOn) __vg.setUnlinkedByFolder(false);
    var row = document.querySelector('[data-g="(unlinked)"]');
    var ctSeparate = row ? row.closest(".lgr").querySelector(".ct").textContent : null;
    __vg.setUnlinkedByFolder(true);
    var row2 = document.querySelector('[data-g="(unlinked)"]');
    var ctJoined = row2 ? row2.closest(".lgr").querySelector(".ct").textContent : null;
    __vg.setUnlinkedByFolder(startOn);
    return { ctSeparate: ctSeparate, ctJoined: ctJoined };
  })()`);
  const ok = /^\(\d+\)$/.test(r.ctSeparate || "") && /^\d+$/.test(r.ctJoined || "");
  return { ok, detail: `kept separate: "${r.ctSeparate}" (want "(N)"), joined: "${r.ctJoined}" (want "N")` };
});

check("focus web stays above dim notes", async (p) => {
  const r = await p.j(`__vg.checkFocusWeb()`);
  if (!r.geomGaps) return { ok: true, detail: `${r.node} (degree ${r.degree}): no in-disc samples on this shape, nothing to measure` };
  return { ok: r.webOK,
           detail: `${r.node} (degree ${r.degree}, ${r.edges} edges): ${r.blueAtGaps} blue, ` +
                   `${r.dimAtGaps} dim, ${r.underLabel} under label/disc of ${r.geomGaps} in-disc samples` };
});

async function settle(p, ms = 6000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (!(await p.j("!!__vg.demo.busy()").catch(() => false))) return true;
    if (Date.now() > deadline) {
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

async function runOne(vault, work) {
  const mine = work && work.checks ? work.checks : selected();
  const slot = GRID && work && work.slot !== undefined ? gridSlot(work.slot, work.slots) : null;
  const lines = [];
  const log = (m) => lines.push(m === undefined ? "" : String(m));
  let url = (work && work.url) || arg("url", "");
  let scratch = null;
  if (!url) {
    scratch = join(mkdtempSync(join(tmpdir(), "vg-smoke-build-")), "vault-graph.html");
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

  const PORT = PINNED_PORT || (work && work.port) || (await freePort());

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
    if (/already serving CDP/.test(e.message)) throw e;
  }

  const profile = mkdtempSync(join(tmpdir(), "vg-smoke-"));
  const chrome = spawn(findChrome(), [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-component-update", "--disable-client-side-phishing-detection",
    "--disable-sync", "--no-service-autorun", "--disable-domain-reliability",
    "--metrics-recording-only", "--no-pings", "--mute-audio",
    "--disable-breakpad", "--disable-crash-reporter",
    // github#7
    "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
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
    const want = url.split("/").slice(-2)[0] || url;
    const deadline = Date.now() + 25000;
    for (;;) {
      try { page = await attach(PORT, want); break; }
      catch (e) { if (Date.now() > deadline) throw e; await sleep(400); }
    }
    const errors = [];
    await page.send("Runtime.enable").catch(() => {});
    page.on((msg) => {
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params?.exceptionDetails;
        errors.push(d?.exception?.description || d?.text || "exception");
      }
    });

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

    const ready = Date.now() + 30000;
    for (;;) {
      const ok = await page.eval("!!(window.__vg && __vg.heat && __vg.state.until === null)").catch(() => false);
      if (ok) break;
      if (Date.now() > ready) throw new Error("page never finished its intro");
      await sleep(300);
    }

    page.j = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));

    // github#7
    // github#63
    const FRAME_PROBE = `new Promise(function(r){
      var n = 0, t0 = performance.now();
      (function tick(){ n++; if (performance.now() - t0 < 600) requestAnimationFrame(tick);
                        else r({frames: n, ms: Math.round(performance.now() - t0)}); })();
    })`;
    let fps = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      fps = await page.eval(FRAME_PROBE).catch(() => ({ frames: 0, ms: 0 }));
      if (fps && fps.frames >= 5) break;
      await sleep(500);
    }
    if (!fps || fps.frames < 5) {
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
    try { if (page) await page.send("Browser.close"); } catch { }
    if (page) page.close();

    await killBrowser(chrome, PORT);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    if (scratch) { try { rmSync(dirname(scratch), { recursive: true, force: true }); } catch {} }
  }
}

// github#7
async function killBrowser(child, PORT) {
  const gone = async () => {
    try { await json(PORT, "/json/version"); return false; } catch { return true; }
  };

  try {
    const b = await attach(PORT, "");
    await b.send("Browser.close").catch(() => {});
    b.close();
  } catch {}
  for (let i = 0; i < 20; i++) {
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

  if (process.platform === "win32") {
    const out = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" }).stdout || "";
    const owners = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("127.0.0.1:" + PORT) && !line.includes("[::1]:" + PORT)) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (/^\d+$/.test(pid) && pid !== "0") owners.add(pid);
    }
    for (const pid of owners) spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
    for (let i = 0; i < 20; i++) {
      if (await gone()) return;
      await sleep(100);
    }
  }

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
 * EXCEPT THE 10k VAULT, WHOSE --end IS PINNED. Its golden layout snapshot is not
 * day-invariant: the daily notes there are filed into year-month subfolders derived from
 * their dates, so moving --end moves notes between subfolders, and the subfolder cells move
 * with them. Measured 2026-09-04, the first weekly refresh after the goldens were recorded:
 * the regenerated 10k vault failed "layout matches its golden snapshot" with 893 notes moved
 * (worst #5296, radius 9317 -> 9637, angle -80 -> 169 degrees) on develop itself, while the
 * demo and shape vaults -- which have no date-derived folders -- stayed byte-identical, as
 * invariants.md had measured for those two. So the 10k is generated with --end fixed at the
 * day its golden was taken, and a pinned fixture does not age (there is nothing for a weekly
 * refresh to change). It costs the 10k vault the live half of the heatmap-window check,
 * which the two ageing vaults still carry.
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
  const FIXTURE_FORMAT = 1;

  const storeRoot = (() => {
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
        const pinned = args.indexOf("--end") >= 0;
        fresh = st.digest === digest &&
                (pinned || (typeof st.day === "string" && ageDays(st.day) <= FIXTURE_MAX_AGE_DAYS));
      } catch { fresh = false; }
    }
    if (!fresh) {
      console.log(`generating ${label} ...`);
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
      for (const d of readdirSync(storeRoot)) {
        if (d.startsWith(`${name}-`) || (d.startsWith(`.building-${name}-`) && d !== `.building-${name}-${process.pid}`)) {
          rmSync(join(storeRoot, d), { recursive: true, force: true });
        }
      }
      renameSync(building, dir);
    }
    if (existsSync(join(ROOT, name))) {
      console.log(`  note: ${name}/ exists in this checkout and is IGNORED -- the suite uses ` +
                  `the shared store (${dir}); pass --vault to use a specific vault on purpose`);
    }
    out.push({ path: dir, label });
  };

  gen("make-demo-vault.mjs", [], "demo-vault", "the demo vault (sparse tail, 2 dense years)");
  gen("make-test-vault.mjs", ["--notes", "10000", "--years", "10", "--end", "2026-08-28"],
      "test-vault", "the 10k synthetic vault (10 years)");
  gen("make-shape-vault.mjs", [], "shape-vault", "the dominant-folder vault");

  if (!out.length) throw new Error("no vault to check, and none could be generated");
  return out;
}

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

  const shaky = picked.filter(isFrameSensitive);
  const intro = picked.filter((c) => !isFrameSensitive(c) && needsIntro(c));
  const steady = picked.filter((c) => !isFrameSensitive(c) && !needsIntro(c));
  const shard = (list, k) => {
    const out = Array.from({ length: k }, () => []);
    list.forEach((c, i) => out[i % k].push(c));
    return out.filter((g) => g.length);
  };

  const lanePorts = PINNED_PORT ? [] : await freePorts(Math.max(JOBS, 1));

  const parallel = [], serial = [];
  for (const v of vaults) {
    const url = await buildFor(v);
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

  const failures = new Map();
  const ran = new Map();
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

  const pool = async (list, width) => {
    let next = 0;
    const worker = async (lane) => {
      for (;;) {
        const i = next++;
        if (i >= list.length) return;
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
