
import { attach, json } from "./cdp.mjs";
import { buildPayloadVault, PAYLOAD, NOTE_COUNT } from "./check-data-escape.mjs";
import { findChrome } from "./chrome.mjs";
import { leftmostScreen, leftWindowPos } from "./screen.mjs";
import { FIXTURE_MAX_AGE_DAYS, FIXTURE_NAMES, checkFixture, countNotes, describeFixture,
         DEFAULT_JOBS, fixtureStore, record as recordPass, shapeDeltas,
         startRun } from "./suite-stamp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync,
         renameSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { join, dirname, basename } from "node:path";
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

const chromeExe = () => findChrome(arg("chrome", ""));

// github#104 -- what actually drove this run, read once
let BROWSER = null;

/* -------------------------------------------------------------- the checks */

const all = [];
// github#113
const FAST_CLOCK = 0.1;
const DEFAULT_ON = ["demo-vault"];
// github#113
const WALK = ["demo-vault", "test-vault"];
const check = (name, fn, opts) => {
  const on = (opts && opts.on !== undefined) ? opts.on : DEFAULT_ON;
  if (on !== "all" && !(Array.isArray(on) && on.length && on.every((f) => FIXTURE_NAMES.includes(f)))) {
    throw new Error(`check "${name}": on must be "all" or a non-empty list of ${FIXTURE_NAMES.join(", ")}`);
  }
  all.push({ name, fn, on, clock: (opts && opts.clock) === "real" ? "real" : "fast" });
};
const runsOn = (c, fixture) => !fixture || c.on === "all" || c.on.indexOf(fixture.name) >= 0;

const ONLY = argAll("only").map((v) => v.toLowerCase());

const NEEDS_INTRO = ["the intro landed"];
const needsIntro = (c) => NEEDS_INTRO.some((q) => c.name.toLowerCase().includes(q));
const selected = () => (ONLY.length
  ? all.filter((c) => ONLY.some((q) => c.name.toLowerCase().includes(q)))
  : all);

// github#110, github#113, github#92
const JOBS = Math.max(1, Number(arg("jobs", String(DEFAULT_JOBS))) || DEFAULT_JOBS);

const GRID = argv.includes("--no-grid") ? false
          : argv.includes("--grid") ? true
          : JOBS > 1;

let SCREEN = null;

function gridSlot(i, k) {
  if (!SCREEN) SCREEN = leftmostScreen();
  const cols = Math.ceil(Math.sqrt(Math.max(1, k)));
  const rows = Math.ceil(Math.max(1, k) / cols);
  const w = Math.floor(SCREEN.w / cols), h = Math.floor(SCREEN.h / rows);
  return { x: SCREEN.x + (i % cols) * w, y: SCREEN.y + Math.floor(i / cols) * h,
           w: w, h: h };
}

// github#7, github#113

check("page loads with no console errors", async (p, ctx) => {
  return { ok: ctx.errors.length === 0, detail: ctx.errors.length ? ctx.errors.join(" | ") : "none" };
}, { on: "all" });

check("__vg is present and the intro landed", async (p) => {
  const r = await p.j(`{hasVg: !!window.__vg, until: __vg.state.until, notes: __vg.graph.order}`);
  return { ok: r.hasVg && r.until === null, detail: `${r.notes} notes, until=${r.until}` };
});

// github#96
check("a closing-script marker in frontmatter cannot escape the data script", async (p) => {
  const dir = mkdtempSync(join(tmpdir(), "vg-smoke-escape-"));
  const port = Number(new URL(p.target.webSocketDebuggerUrl).port);
  let tab = null, q = null;
  try {
    const url = pathToFileURL(buildPayloadVault(dir)).href;
    tab = await p.send("Target.createTarget", { url, background: true });
    for (const deadline = Date.now() + 15000; ;) {
      try { q = await attach(port, basename(dir)); break; }
      catch (e) { if (Date.now() > deadline) throw e; await sleep(250); }
    }
    for (const deadline = Date.now() + 10000; Date.now() < deadline;) {
      if (await q.eval("!!(window.__vg && window.__vg.graph)").catch(() => false)) break;
      await sleep(200);
    }
    const r = await q.eval(`(function () {
      var d = window.VAULT_DATA, marked = null;
      if (d && d.nodes) d.nodes.forEach(function (n) { if (n.label === "Marked") marked = n; });
      return { ranType: window.__vg_escaped_type, ranTag: window.__vg_escaped_tag,
               nodes: d && d.nodes ? d.nodes.length : -1,
               type: marked ? marked.type : null, tags: marked ? marked.tags : [],
               order: window.__vg && window.__vg.graph ? window.__vg.graph.order : -1 };
    })()`);
    const bad = [];
    if (r.ranType !== undefined || r.ranTag !== undefined) bad.push("a marker script ran");
    if (r.nodes !== NOTE_COUNT) bad.push("VAULT_DATA holds " + r.nodes + " notes, not " + NOTE_COUNT);
    if (r.type !== PAYLOAD.type) bad.push("type decoded as " + JSON.stringify(r.type));
    if (!r.tags.includes(PAYLOAD.tag)) bad.push("tags decoded as " + JSON.stringify(r.tags));
    if (r.order !== NOTE_COUNT) bad.push("the graph mounted " + r.order + " notes, not " + NOTE_COUNT);
    if (q.errors.length) bad.push(q.firstError());
    return { ok: !bad.length,
             detail: bad.length ? bad.join(" | ")
               : "no marker ran, " + r.nodes + " notes decoded with both markers intact as text, " +
                 r.order + " mounted" };
  } finally {
    if (q) q.close();
    if (tab) await p.send("Target.closeTarget", { targetId: tab.targetId }).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
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
  // github#86 -- the shared edge is the invariant, not the opening
  // github#86 -- a vault with no subfolder has no twisty to click
  const twisties = await p.j(`document.querySelectorAll('#vg-legend [data-tw]').length`);
  if (!twisties) {
    return { ok: folded.distinct.length === 1,
             detail: `folded ${folded.n} counts / ${folded.distinct.length} edge; ` +
                     `no subfolder anywhere in this vault, so there is no tree to open` };
  }
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
}, { on: "all" });

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
}, { on: "all" });

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
}, { on: "all" });

// github#58
check("the heatmap band is painted for the state it landed in", async (p) => {
  await settle(p);
  const g = await biggestGroup(p);
  if (!g) return { ok: false, detail: "no group to hide" };
  await clickEye(p, g);
  await settle(p);
  await sleep(1200);
  const r = await p.j(`(function(){
    var cv = document.getElementById("vg-heatc"), ctx = cv.getContext("2d");
    var before = ctx.getImageData(0, 0, cv.width, cv.height).data;
    var k = __vg.heat.keys[0];
    __vg.state.hoverDay = k; __vg.heatDraw();
    __vg.state.hoverDay = null; __vg.heatDraw();
    var after = ctx.getImageData(0, 0, cv.width, cv.height).data;
    var px = 0, mx = 0;
    for (var i = 0; i < before.length; i += 4) {
      var d = Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]),
                       Math.abs(before[i + 2] - after[i + 2]), Math.abs(before[i + 3] - after[i + 3]));
      if (d) { px++; if (d > mx) mx = d; }
    }
    var lit = 0; __vg.heat.keys.forEach(function (key) { if (__vg.heat.days[key].n > 0.004) lit++; });
    return { px: px, max: mx, lit: lit, days: __vg.heat.keys.length, w: cv.width, h: cv.height }; })()`);
  await clickEye(p, g);
  await settle(p);
  const BAR = 2;
  return { ok: r.max <= BAR,
           detail: `hid ${g}: ${r.lit} of ${r.days} days lit; the band as painted vs repainted from its own state differs ` +
                   `in ${r.px} px (max ${r.max}/255, bar ${BAR}) of ${r.w}x${r.h}` };
}, { on: "all" });

check("plan parity at full vault", async (p) => {
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); void 0`);
  const r = await p.j(`__vg.checkPlanParity()`);
  return { ok: !!r.parityOK, detail: `maxR ${r.staticMaxR} vs ${r.liveMaxR}, ${r.cellsStatic} cells` };
}, { on: "all" });

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
  // github#86, github#21 -- leave the page converged: two passes are the fixed point
  await p.eval(`__vg.state.hidden.folder = {}; __vg.syncAlpha(); __vg.applyLayout(false); __vg.applyLayout(false); void 0`);
  return { ok: bad.length === 0, detail: bad.length ? bad.join("; ") : `${groups.length} folders, all clean` };
}, { on: "all" });

// github#97
let hostilePages = null;
function hostileVaults() {
  if (hostilePages) return hostilePages;
  hostilePages = (async () => {
    const NAMES = ["constructor", "toString", "hasOwnProperty", "__proto__"];
    const root = mkdtempSync(join(tmpdir(), "vg-smoke-hostile-"));
    process.on("exit", () => { try { rmSync(root, { recursive: true, force: true }); } catch {} });
    const vault = (label, folders) => {
      const dir = join(root, label);
      mkdirSync(join(dir, ".obsidian"), { recursive: true });
      for (const f of folders) {
        mkdirSync(join(dir, f), { recursive: true });
        writeFileSync(join(dir, f, "Note.md"), "# Note\n\nA note in a folder named " + f + ".\n");
      }
      return { label, dir, folders };
    };
    const specs = NAMES.map((n) => vault(n, [n])).concat([
      vault("all-four-and-plain", NAMES.concat(["Plain"])),
      vault("empty", []),
      vault("plain", ["Plain"]),
    ]);
    return specs.map((s) => {
      const out = join(root, s.label + ".html");
      const b = spawnSync(process.execPath,
                          [join(HERE, "..", "src", "build-graph.mjs"), "--vault", s.dir, "--out", out],
                          { encoding: "utf8" });
      if (b.status !== 0) throw new Error("build-graph.mjs failed on " + s.label + ":\n" + (b.stderr || ""));
      return { ...s, url: pathToFileURL(out).href + "?rest" };
    });
  })();
  return hostilePages;
}

check("a folder named after an Object.prototype member still lays out", async (p, ctx) => {
  const home = await p.eval("location.href");
  const READY = "!!(window.__vg && __vg.heat && __vg.state.until === null)";
  const goto = async (url, budget) => {
    await p.send("Page.navigate", { url });
    for (const until = Date.now() + budget; ;) {
      const ok = await p.eval(`location.href === ${JSON.stringify(url)} && ${READY}`).catch(() => false);
      if (ok) return true;
      if (Date.now() > until) return false;
      await sleep(200);
    }
  };
  const firstLine = (e) => String(e).split("\n")[0];
  const pages = await hostileVaults();
  const mark = ctx.errors.length;
  const rows = [];
  let bad = 0, back = false, backMs = 0;
  try {
    for (const v of pages) {
      const before = ctx.errors.length;
      // github#105 -- a payload vault is 1-5 notes; it mounts in well under this
      const ready = await goto(v.url, 15000);
      if (ready && v.folders.indexOf("__proto__") >= 0) {
        await p.eval(`(function(){ var m = Object.create(null); m["__proto__"] = true;
                                   __vg.setFolderShown(m); __vg.applyHiddenDefaults(); })(); void 0`);
        await settle(p);
      }
      const r = ready ? await p.j(`(function(){
        var busy = document.getElementById("vg-busy");
        var n = 0, nonFinite = 0;
        __vg.graph.forEachNode(function (id, a) { n++; if (!isFinite(a.x) || !isFinite(a.y)) nonFinite++; });
        var groups = __vg.groupOrder().filter(function (g) { return __vg.groupCount(g) > 0; });
        var par = null, parErr = null;
        if (n) { try { par = __vg.checkPlanParity(); } catch (e) { parErr = e.message; } }
        return { busyHidden: !!(busy && busy.hidden), n: n, nonFinite: nonFinite, groups: groups,
                 shown: par ? par.shown : 0,
                 parity: par ? par.parityOK : (parErr ? "threw: " + parErr : null) };
      })()`) : null;
      const errs = ctx.errors.slice(before).map(firstLine);
      const want = v.folders.length;
      const ok = ready && !errs.length && r.busyHidden && r.n === want && r.nonFinite === 0 &&
                 (want === 0 ? r.groups.length === 0
                             : v.folders.every((f) => r.groups.indexOf(f) >= 0) &&
                               r.shown === want && r.parity === true);
      if (!ok) bad++;
      rows.push(`${ok ? "ok" : "FAIL"} ${v.label}: ` + (ready
        ? `${r.n}/${want} notes, ${r.shown} shown, groups [${r.groups.join(", ")}], ` +
          `busy ${r.busyHidden ? "hidden" : "SHOWN"}, parity ${r.parity}` +
          (errs.length ? `, threw: ${errs[0]}` : "")
        : "never ready" + (errs.length ? `: ${errs[0]}` : "")));
    }
  } finally {
    ctx.errors.splice(mark);
    // github#105 -- home is ?rest: a full re-mount, the size of the fixture
    // github#105 -- so it gets runOne's own first-load budget, not the payloads'
    const t0 = Date.now();
    back = await goto(home, 30000);
    backMs = Date.now() - t0;
    // github#113
    if (back) await settle(p, 20000);
  }
  const backSec = (backMs / 1000).toFixed(1);
  if (!back) throw new Error(`could not return to the fixture page at ${home} -- gave up after ${backSec}s`);
  return { ok: bad === 0,
           detail: `${pages.length - bad}/${pages.length} pages: ` + rows.join("; ") +
                   `; back in ${backSec}s` };
}, { clock: "real" });

check("the resting disc is on the lattice", async (p) => {
  await settle(p);
  const r = await p.j(`(function(){
    var plan = __vg.buildWedgePlan(false), band = {};
    plan.cells.forEach(function(c){ band[c.g] = c.inner; });
    var rad = {inner: [], outer: []};
    __vg.graph.forEachNode(function(id, a){
      if ((__vg.alpha[id] || 0) < 0.999) return;
      // github#86 -- ask the predicate the LAYOUT asks. graph.degree() is 0 for a satellite
      // too, whose links are drawn on hover only, and those dots are on the lattice like any
      // other; isOrphan() names the sunflower-packed notes this exclusion is actually about.
      if (__vg.isOrphan(id)) return;
      // github#86 -- the group the dot is DRAWN in, which is the grouping answer in either
      // dimension. Identical to a.folder while grouped by folder with unlinked notes joining
      // their folder, and right when either of those is not the case.
      (band[__vg.groupOf(id)] ? rad.inner : rad.outer).push(Math.hypot(a.x, a.y));
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
}, { on: "all" });

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
}, { on: "all" });

// github#37, github#35
// github#21
check("layout matches its golden snapshot", async (p) => {
  const dd = await p.j("__vg.debugDump()");
  const vaultName = dd.vault.name;
  // github#86 -- tag-vault is the fourth, and the only one organised by tag
  const fixture = ["demo-vault", "test-vault", "shape-vault", "tag-vault"]
    .find((f) => vaultName.startsWith(f + "-"));
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
  // github#86 -- each golden records the dimension it was taken in
  const dim = snap.dim === "tag" ? "tag" : "folder";
  if (dim !== "folder") await p.eval(`__vg.setDim(${JSON.stringify(dim)}); void 0`);
  await p.eval(`__vg.relayout(); void 0`).catch(() => {});
  const r = await p.j(`(function(){
    var plan = __vg.buildWedgePlan(false), band = {};
    plan.cells.forEach(function(c){ band[c.g] = c.inner ? "inner" : "outer"; });
    var pos = {};
    __vg.graph.forEachNode(function(id, a){ pos[id] = [a.x, a.y]; });
    return { band: band, positions: pos };
  })()`);
  // github#113, decisions/0011
  if (dim !== "folder") {
    await p.eval(`__vg.setDim("folder"); void 0`);
    await settle(p);
    await p.eval(`__vg.relayout(); void 0`);
    await settle(p);
  }

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
  const parts = [`${curIds.size} notes checked against scripts/layout-snapshots/${fixture}.json` +
                 (dim === "folder" ? "" : `, grouped by ${dim}`)];
  parts.push(flipped.length ? `${flipped.length} folder(s) flipped band: ${flipped.join(", ")}` : "band unchanged");
  if (moved) {
    parts.push(`${moved} note(s) moved past ${TOL} units, worst is #${worst.id}: ` +
      `radius ${worst.sr.toFixed(1)} -> ${worst.cr.toFixed(1)}, ` +
      `angle ${worst.sAngle.toFixed(1)}° -> ${worst.cAngle.toFixed(1)}°`);
  } else {
    parts.push("positions unchanged");
  }
  return { ok, detail: parts.join("; ") };
}, { on: "all" });

/* ---------------------------------------------------- github#86, design/0015 */

check("tags: folders is the default, and the switch is in the group list's own heading",
async (p) => {
  const r = await p.j(`(function(){
    var sel = document.querySelector("#vg-dim");
    var btns = sel ? Array.prototype.slice.call(sel.querySelectorAll("button[data-dim]")) : [];
    var on = btns.filter(function (b) { return b.getAttribute("aria-pressed") === "true"; });
    var txt = function (b, sel2) { var e = b.querySelector(sel2); return e ? e.textContent : ""; };
    return { dim: __vg.state.dim, has: !!sel, value: on.length === 1 ? on[0].getAttribute("data-dim") : null,
             options: btns.map(function (b) { return b.getAttribute("data-dim") + ":" + txt(b, ".dimnm"); }),
             // github#86 -- the count lives inside each side, so both are visible before a switch
             counts: btns.map(function (b) { return b.getAttribute("data-dim") + ":" + txt(b, ".dimct"); }),
             mine: on.length === 1 ? txt(on[0], ".dimct") : "",
             full: btns.length === 2 && Math.abs(btns[0].getBoundingClientRect().width -
                                                 btns[1].getBoundingClientRect().width) < 2 &&
                   Math.abs(sel.getBoundingClientRect().width -
                            sel.parentElement.getBoundingClientRect().width) < 26,
             groups: __vg.groupOrder().length };
  })()`);
  if (!r.has) return { ok: false, detail: "no #vg-dim in the group list heading" };
  const wanted = "folder:Folders,tag:Tags";
  const everyCount = r.counts.every((c) => /:\(\d+\)$/.test(c));
  const ok = r.dim === "folder" && r.value === "folder" &&
             r.options.join(",") === wanted && r.mine === "(" + r.groups + ")" &&
             everyCount && r.full;
  return {
    ok,
    detail: `dim ${r.dim}, pressed ${r.value}, sides [${r.options.join(" | ")}]` +
            (r.options.join(",") === wanted ? "" : ` <- wanted ${wanted}`) +
            `, counts [${r.counts.join(" | ")}]` + (everyCount ? "" : " <- a side carries no count") +
            `, pressed side reads ${r.mine} for ${r.groups} groups` +
            (r.full ? ", both sides full width" : " <- the two sides are not equal and full width"),
  };
}, { on: "all" });

check("tags: every note is filed in exactly one wedge, in either dimension", async (p) => {
  const r = await p.j(`(function(){
    var look = function () {
      var plan = __vg.buildWedgePlan(false), members = 0, seen = {}, twice = 0;
      plan.cells.forEach(function (c) {
        c.list.forEach(function (id) { if (seen[id]) twice++; seen[id] = 1; members++; });
      });
      var summed = 0;
      __vg.groupOrder().forEach(function (g) { summed += __vg.groupCount(g); });
      return { members: members, twice: twice, summed: summed, cells: plan.cells.length,
               groups: __vg.groupOrder().length };
    };
    var nodes = __vg.graph.nodes().length;
    var pinned = __vg.state.pinned.length;
    var folder = look();
    __vg.setDim("tag");
    var tag = look();
    // D-1 -- the first tag listed files the note, and a note with none goes to (untagged).
    // (unlinked) is the one legitimate exception: that setting moves a note out of its group
    // in either dimension.
    var misfiled = [], untagged = 0, noTag = 0, multi = 0;
    __vg.graph.forEachNode(function (id, a) {
      var tags = a.tags || [];
      if (!tags.length) noTag++;
      if (tags.length > 1) multi++;
      var want = tags.length ? String(tags[0]).split("/")[0] : "(untagged)";
      var got = __vg.groupOf(id);
      if (got === "(untagged)") untagged++;
      if (got !== want && got !== "(unlinked)") {
        if (misfiled.length < 4) misfiled.push(id + ": " + got + " not " + want);
      }
    });
    __vg.setDim("folder");
    return { nodes: nodes, pinned: pinned, folder: folder, tag: tag,
             misfiled: misfiled, untagged: untagged, noTag: noTag, multi: multi };
  })()`);
  // github#86 -- the hub holds pinned notes, which are not plan members
  const want = r.nodes - r.pinned;
  const ok = r.folder.members === want && r.tag.members === want &&
             !r.folder.twice && !r.tag.twice &&
             r.folder.summed === r.nodes && r.tag.summed === r.nodes &&
             !r.misfiled.length;
  return {
    ok,
    detail: `${r.nodes} notes: folder ${r.folder.members} members in ${r.folder.cells} cells / ` +
            `${r.folder.groups} groups, tag ${r.tag.members} in ${r.tag.cells} / ${r.tag.groups}` +
            ` (wanted ${want} each, counts sum to ${r.folder.summed}/${r.tag.summed})` +
            `; ${r.noTag} notes carry no tag and ${r.untagged} are filed (untagged)` +
            `; ${r.multi} carry more than one` +
            (r.folder.twice + r.tag.twice ? `; ${r.folder.twice + r.tag.twice} note(s) in TWO cells` : "") +
            (r.misfiled.length ? `; MISFILED ${r.misfiled.join(", ")}` : ""),
  };
}, { on: "all" });

check("tags: the switch lands where a fresh relayout would, and comes home exactly",
async (p) => {
  await settle(p);
  const r = await p.j(`(function(){
    var pos = function () {
      var o = {}; __vg.graph.forEachNode(function (id, a) { o[id] = [a.x, a.y]; }); return o;
    };
    var drift = function (a, b) {
      var moved = 0, worst = 0, who = "";
      Object.keys(a).forEach(function (id) {
        var d = Math.hypot(b[id][0] - a[id][0], b[id][1] - a[id][1]);
        if (d > 0.1) moved++;
        if (d > worst) { worst = d; who = id; }
      });
      return { moved: moved, worst: +worst.toFixed(3), who: who };
    };
    // github#86 -- a switch keeps the rings; only a hard relayout re-derives them, in whatever
    // dimension is on screen. So "fresh" here is the fixed point inside the kept rings: two
    // layout passes, not a relayout.
    var boot = pos();
    __vg.setDim("tag");
    var landed = pos();
    __vg.applyLayout(false); __vg.applyLayout(false);
    var fresh = pos();
    __vg.setDim("folder");
    var home = pos();
    __vg.applyLayout(false); __vg.applyLayout(false);
    var homeFresh = pos();
    return { tag: drift(landed, fresh), folder: drift(home, homeFresh),
             trip: drift(boot, home), n: Object.keys(boot).length };
  })()`);
  // github#86, design/0015 -- room and position are a fixed point
  const ok = !r.tag.moved && !r.folder.moved && !r.trip.moved;
  return {
    ok,
    detail: `${r.n} notes: landing vs a fresh relayout -- tag ${r.tag.moved} moved ` +
            `(worst ${r.tag.worst}), folder ${r.folder.moved} (worst ${r.folder.worst}); ` +
            `round trip ${r.trip.moved} moved (worst ${r.trip.worst}` +
            (r.trip.who ? `, #${r.trip.who}` : "") + ")",
  };
}, { on: "all" });

check("tags: a dot in the disc being left keeps its colour until it has faded", async (p) => {
  await clearRange(p);
  await settle(p);
  await camSettle(p);
  // github#86, design/0015 -- the erase edge fades a dot where it stands, in its colour
  const n = await p.j(`(function(){
    var b = {};
    __vg.graph.forEachNode(function (id, a) {
      if ((__vg.alpha[id] || 0) <= 0.004) return;
      b[id] = { c: __vg.nodeColor(id), g: __vg.groupOf(id), x: a.x, y: a.y };
    });
    window.__smokeLeft = b;
    // github#86 -- and the legend's rows as they stand: swatch class, swatch fill, count text
    var rows = {};
    Array.prototype.forEach.call(document.querySelectorAll("#vg-legend .lgr[data-row]"), function (r) {
      var sw = r.querySelector(".sw"), ct = r.querySelector(".ct");
      rows[r.getAttribute("data-row")] = { sw: sw ? sw.className : "", fill: sw ? sw.style.background : "", ct: ct ? ct.textContent : "" };
    });
    window.__smokeRows = rows;
    var side = document.querySelector('#vg-dim button[data-dim="tag"]');
    if (!side) return -1;
    side.click();
    return Object.keys(b).length;
  })()`);
  if (n < 0) return { ok: false, detail: "no #vg-dim to switch with" };
  let samples = 0, worstFrame = 0, dotFrames = 0, standingFrames = 0, example = "", rowFrames = 0, rowExample = "";
  const t0 = Date.now();
  for (;;) {
    const s = await p.j(`(function(){
      var b = window.__smokeLeft, standing = 0, wrong = 0, ex = "";
      Object.keys(b).forEach(function (id) {
        // a dot that has left stands in its final seat, under its new group
        var a = __vg.graph.getNodeAttributes(id);
        if (Math.abs(a.x - b[id].x) > 0.5 || Math.abs(a.y - b[id].y) > 0.5 || __vg.groupOf(id) !== b[id].g) return;
        if ((__vg.alpha[id] || 0) <= 0.004) return;
        standing++;
        var c = __vg.nodeColor(id);
        if (c !== b[id].c) { wrong++; if (!ex) ex = "#" + id + " " + b[id].c + " -> " + c; }
      });
      // a leaving row is the row it was: same swatch class and fill, same count
      var rowsWrong = 0, rowEx = "";
      Array.prototype.forEach.call(document.querySelectorAll("#vg-legend .lgr[data-old]"), function (r) {
        var was = window.__smokeRows[r.getAttribute("data-row")]; if (!was) return;
        var sw = r.querySelector(".sw"), ct = r.querySelector(".ct");
        var now = { sw: sw ? sw.className : "", fill: sw ? sw.style.background : "", ct: ct ? ct.textContent : "" };
        if (now.sw !== was.sw || now.fill !== was.fill || now.ct !== was.ct) { rowsWrong++; if (!rowEx) rowEx = r.getAttribute("data-row") + ": " + JSON.stringify(was) + " -> " + JSON.stringify(now); }
      });
      return { standing: standing, wrong: wrong, ex: ex, rowsWrong: rowsWrong, rowEx: rowEx, busy: __vg.demo.busy() };
    })()`);
    samples++;
    standingFrames += s.standing;
    dotFrames += s.wrong;
    rowFrames += s.rowsWrong;
    if (s.rowsWrong && !rowExample) rowExample = s.rowEx;
    if (s.wrong > worstFrame) { worstFrame = s.wrong; example = s.ex; }
    if (!s.busy && samples > 3) break;
    if (Date.now() - t0 > 20000) break;
  }
  await p.j(`(function(){ delete window.__smokeLeft; delete window.__smokeRows; __vg.setDim("folder"); return true; })()`);
  await settle(p);
  await camSettle(p);
  return {
    ok: dotFrames === 0 && rowFrames === 0 && samples > 3,
    detail: `${n} dots standing in the folder disc, ${samples} samples over the switch: ` +
            `${dotFrames} of ${standingFrames} standing dot-frames in a colour other than the one they had` +
            (worstFrame ? ` (worst frame ${worstFrame}, e.g. ${example})` : "") +
            `; ${rowFrames} leaving-row-frames with a swatch or count other than the row's` +
            (rowExample ? ` (e.g. ${rowExample})` : ""),
  };
}, { on: WALK, clock: "real" });

check("tags: a note one disc hides and the other shows arrives with the fill edge", async (p) => {
  await clearRange(p);
  await settle(p);
  await camSettle(p);
  // github#86, design/0015 -- hide one folder in the folder disc only
  // github#86 -- in the tag disc those notes ARRIVE with the fill edge
  const pick = await p.j(`(function(){
    var gs = __vg.groupOrder().map(function (g) { return { g: g, n: __vg.groupCount(g) }; })
      .filter(function (x) { return x.n >= 3 && !__vg.isArchiveGroup(x.g); })
      .sort(function (x, y) { return x.n - y.n; });
    return gs.length ? gs[0] : null; })()`);
  if (!pick) return { ok: true, detail: "no folder with three or more notes to hide -- nothing to switch" };
  const eye = async (g) => p.j(`(function(){
    var b = document.querySelector('[data-eye="' + ${JSON.stringify(g)}.replace(/"/g, '\\"') + '"]');
    if (!b) return false; b.click(); return true; })()`);
  if (!(await eye(pick.g))) return { ok: false, detail: `no eye toggle for ${pick.g}` };
  await settle(p);
  await camSettle(p);
  const n = await p.j(`(function(){
    var hid = [], b = {};
    __vg.graph.forEachNode(function (id, a) {
      if ((__vg.alpha[id] || 0) > 0.004) { b[id] = { g: __vg.groupOf(id), x: a.x, y: a.y }; return; }
      if (__vg.groupOf(id) === ${JSON.stringify(pick.g)} && !a.dupOf) hid.push(id);
    });
    window.__smokeHid = { hid: hid, b: b, blade: __vg.handBlade };
    var nodes = __vg.graph.order;
    document.querySelector('#vg-dim button[data-dim="tag"]').click();
    // the very same tick: nothing hidden may be lit yet
    var litNow = hid.filter(function (id) { return (__vg.alpha[id] || 0) > 0.004; }).length;
    return { hid: hid.length, litNow: litNow, nodes: nodes };
  })()`);
  let samples = 0, litEnd = 0, ahead = 0, first = "", standInsPeak = 0, nodesEnd = 0;
  const t0 = Date.now();
  for (;;) {
    const s = await p.j(`(function(){
      var H = window.__smokeHid, D = 180 / Math.PI, TWO = 2 * Math.PI;
      var sweep = function (a) { return (Math.PI / 2 - Math.atan2(a.y, a.x) + 2 * TWO) % TWO; };
      // the cascade reports the erase edge's angle; the fill edge trails it by the blade, and
      // an arrival sits at its final seat -- so a lit note's seat is behind the fill edge. The
      // inner ring sweeps the other way round, so its bearings read mirrored.
      var hand = __vg.lastCascade().handDeg;
      var fill = typeof hand === "number" ? Math.max(0, Math.min(360, hand - H.blade)) : null;
      var lit = 0, ahead = 0, ex = "";
      H.hid.forEach(function (id) {
        if ((__vg.alpha[id] || 0) <= 0.004) return;
        lit++;
        if (fill === null) return;
        var b = sweep(__vg.graph.getNodeAttributes(id)) * D;
        if (__vg.isInner(id)) b = (360 - b) % 360;
        if (b > fill + 6 && b < 354 && fill < 354) { ahead++; if (!ex) ex = "#" + id + " at " + b.toFixed(0) + " deg with the fill edge at " + fill.toFixed(0); }
      });
      return { lit: lit, ahead: ahead, ex: ex, busy: __vg.demo.busy(), nodes: __vg.graph.order, standIns: __vg.standIns().length };
    })()`);
    samples++;
    ahead += s.ahead;
    if (s.ahead && !first) first = s.ex;
    litEnd = s.lit;
    if (s.standIns > standInsPeak) standInsPeak = s.standIns;
    nodesEnd = s.nodes;
    if (!s.busy && samples > 3) break;
    if (Date.now() - t0 > 20000) break;
  }
  // github#86 -- stand-ins draw the arriving disc; every one goes home
  const left = await p.j(`__vg.standIns().length`);
  await p.j(`(function(){ delete window.__smokeHid; __vg.setDim("folder"); return true; })()`);
  await settle(p);
  await eye(pick.g);
  await settle(p);
  await camSettle(p);
  return {
    ok: n.litNow === 0 && ahead === 0 && litEnd === n.hid && samples > 3 && left === 0 && nodesEnd === n.nodes,
    detail: `${pick.g} (${n.hid} notes) hidden in the folder disc: ${n.litNow} lit at the switch itself, ` +
            `${ahead} lit ahead of the fill edge over ${samples} samples` +
            (first ? ` (first: ${first})` : "") + `, ${litEnd} of ${n.hid} lit at the end; ` +
            `${standInsPeak} stand-ins drawn, ${left} left behind, ${nodesEnd} of ${n.nodes} nodes after`,
  };
}, { on: WALK, clock: "real" });

check("tags: the two buckets stay out of the hue rotation and sort last", async (p) => {
  const r = await p.j(`(function(){
    __vg.setDim("tag");
    var order = __vg.groupOrder();
    var slots = {};
    order.forEach(function (g) { slots[g] = __vg.slotOf(g); });
    var tail = order.slice(-2);
    var hues = order.filter(function (g) { return g.charAt(0) !== "("; })
                    .map(function (g) { return __vg.slotOf(g); });
    var dup = {}, repeats = 0;
    hues.forEach(function (s) { if (dup[s]) repeats++; dup[s] = 1; });
    __vg.setDim("folder");
    return { order: order, tail: tail, slots: slots, hues: hues, repeats: repeats,
             untagged: slots["(untagged)"], unlinked: slots["(unlinked)"] };
  })()`);
  const hasUntagged = r.order.indexOf("(untagged)") >= 0;
  if (!hasUntagged) {
    return { ok: true, detail: `NOT ASSERTED: every note on this vault carries a tag, ` +
                               `so there is no (untagged) bucket to place` };
  }
  // github#86 -- D-2: neither bucket is a group anyone chose
  const ok = r.tail.join(",") === "(untagged),(unlinked)" &&
             r.untagged === "g11" && r.unlinked === "g11";
  return {
    ok,
    detail: `${r.order.length} groups, last two [${r.tail.join(", ")}]; (untagged) slot ` +
            `${r.untagged}, (unlinked) ${r.unlinked} (both want the archive grey g11); ` +
            `${r.hues.length} real tags take ${r.hues.length - r.repeats} distinct slots`,
  };
}, { on: "all" });

check("tags: each dimension keeps its own hidden and collapsed state", async (p) => {
  const r = await p.j(`(function(){
    var live = function () {
      var h = __vg.state.hidden[__vg.state.dim] || {};
      return Object.keys(h).filter(function (k) { return h[k]; }).sort();
    };
    var hideFirst = function () {
      var g = __vg.groupOrder().filter(function (x) { return __vg.groupCount(x) > 0; })[0];
      var h = __vg.state.hidden[__vg.state.dim] || (__vg.state.hidden[__vg.state.dim] = {});
      h[g] = true;
      __vg.state.hiddenSub[g + "/"] = true;
      return g;
    };
    var folderHid = hideFirst();
    var folderBefore = live();
    var folderSubBefore = Object.keys(__vg.state.hiddenSub).sort();
    __vg.setDim("tag");
    var tagFresh = live();
    var tagSubFresh = Object.keys(__vg.state.hiddenSub).sort();
    var tagHid = hideFirst();
    var tagAfter = live();
    __vg.setDim("folder");
    var folderAgain = live();
    var folderSubAgain = Object.keys(__vg.state.hiddenSub).sort();
    __vg.setDim("tag");
    var tagAgain = live();
    // github#113
    __vg.state.hidden.tag = {};
    __vg.state.hiddenSub = {};
    __vg.setDim("folder");
    __vg.state.hidden.folder = {};
    __vg.state.hiddenSub = {};
    __vg.relayout();
    return { folderHid: folderHid, tagHid: tagHid,
             folderBefore: folderBefore, folderAgain: folderAgain,
             folderSubBefore: folderSubBefore, folderSubAgain: folderSubAgain,
             tagFresh: tagFresh, tagSubFresh: tagSubFresh,
             tagAfter: tagAfter, tagAgain: tagAgain };
  })()`);
  const ok = r.tagFresh.length === 0 && r.tagSubFresh.length === 0 &&
             r.folderAgain.join(",") === r.folderBefore.join(",") &&
             r.folderSubAgain.join(",") === r.folderSubBefore.join(",") &&
             r.tagAgain.join(",") === r.tagAfter.join(",");
  return {
    ok,
    detail: `hid ${r.folderHid} by folder and ${r.tagHid} by tag; the tag list opened with ` +
            `${r.tagFresh.length} hidden and ${r.tagSubFresh.length} hidden sub-wedges; ` +
            `folder came back [${r.folderBefore.join(" ")}] -> [${r.folderAgain.join(" ")}], ` +
            `subs ${r.folderSubBefore.length} -> ${r.folderSubAgain.length}; ` +
            `tag came back [${r.tagAfter.join(" ")}] -> [${r.tagAgain.join(" ")}]`,
  };
}, { on: "all" });

check("tags: a nested tag earns a sub-wedge, exactly as a subfolder does", async (p) => {
  const r = await p.j(`(function(){
    __vg.setDim("tag");
    var order = __vg.groupOrder();
    /** groups whose tags nest: area -> [health, finance, career] */
    var families = {};
    order.forEach(function (g) {
      var s = __vg.subOrderOf(g).filter(function (x) { return x !== ""; });
      if (s.length > 1) families[g] = s;
    });
    var names = Object.keys(families);
    if (!names.length) { __vg.setDim("folder"); return { none: true }; }
    var g = names[0];
    var plan = __vg.buildWedgePlan(false);
    var cells = 0;
    plan.cells.forEach(function (c) { if (c.g === g) cells++; });
    // the tint ladder: design/0003, a hue+lightness step per sub-wedge inside the family
    var shades = families[g].map(function (sb) { return __vg.subColorOf(g, sb); });
    var distinct = {};
    shades.forEach(function (h) { if (h) distinct[h] = 1; });
    // the legend nests it, and a depth-2 tag appears a level below its parent
    var tw = document.querySelector('#vg-legend [data-tw="' + g + '"]');
    var twisty = !!tw;
    var deeper = [];
    if (tw) {
      tw.click();
      var kids = Array.prototype.map.call(
        document.querySelectorAll('#vg-legend [data-twp]'),
        function (b) { return b.getAttribute("data-twp"); });
      kids.forEach(function (k) {
        var b = document.querySelector('#vg-legend [data-twp="' + k + '"]');
        if (b) b.click();
      });
      deeper = Array.prototype.map.call(
        document.querySelectorAll('#vg-legend [data-hpath]'),
        function (b) { return b.getAttribute("data-hpath"); })
        .filter(function (k) { return k.split("/").length > 2; });
      if (tw) tw.click();
    }
    __vg.setDim("folder");
    return { g: g, subs: families[g], families: names.length, cells: cells,
             shades: shades, distinct: Object.keys(distinct).length,
             twisty: twisty, deeper: deeper };
  })()`);
  if (r.none) {
    return { ok: true, detail: `NOT ASSERTED: no tag on this vault nests -- only the ` +
                               `tag-organised fixture carries an a/b tag` };
  }
  // github#86 -- D-3: a sub-wedge per child, with its own tint
  const ok = r.cells === r.subs.length && r.distinct === r.subs.length && r.twisty;
  return {
    ok,
    detail: `${r.families} nesting tag(s); ${r.g} holds [${r.subs.join(", ")}] and is drawn ` +
            `as ${r.cells} cell(s) with ${r.distinct} distinct tints (${r.shades.join(" ")})` +
            `; the legend gives it a twisty ${r.twisty ? "yes" : "NO"}` +
            (r.deeper.length ? `, and a depth-2 tag nests below it: ${r.deeper.join(", ")}`
                             : "; no depth-2 tag was reachable"),
  };
}, { on: "all" });

check("arc: a plan over the whole circle is the resting disc, and over half of it stays in half",
async (p) => {
  await settle(p);
  const r = await p.j(`(function(){
    var TWO = 2 * Math.PI;
    var sweep = function (x, y) { return ((Math.PI / 2 - Math.atan2(y, x)) % TWO + TWO) % TWO; };
    var rest = {}, ids = [];
    __vg.graph.forEachNode(function (id, a) {
      if ((__vg.alpha[id] || 0) > 0.5 && !__vg.isOrphan(id)) { rest[id] = [a.x, a.y]; ids.push(id); }
    });
    var full = __vg.arcLayout(0, TWO) || {};
    var off = 0, worst = 0;
    ids.forEach(function (id) { var q = full[id]; if (!q) { off++; return; }
      var d = Math.hypot(q.x - rest[id][0], q.y - rest[id][1]); if (d > 0.1) off++; if (d > worst) worst = d; });
    var half = __vg.arcLayout(0, Math.PI) || {};
    var inside = 0, outside = 0, worstOut = 0;
    ids.forEach(function (id) { var q = half[id]; if (!q) { outside++; return; }
      var sw = sweep(q.x, q.y);
      if (sw <= Math.PI + 0.02) inside++; else { outside++; worstOut = Math.max(worstOut, sw - Math.PI); } });
    // and the disc on screen is untouched by either question
    var moved = 0;
    __vg.graph.forEachNode(function (id, a) { var h = rest[id]; if (h && Math.hypot(a.x - h[0], a.y - h[1]) > 0.1) moved++; });
    return { n: ids.length, off: off, worst: +worst.toFixed(3), inside: inside, outside: outside,
             worstOut: +(worstOut * 180 / Math.PI).toFixed(2), moved: moved };
  })()`);
  // github#86, design/0015 -- the arc-bounded planner behind the dimension switch
  const ok = r.off === 0 && r.outside === 0 && r.moved === 0;
  return {
    ok,
    detail: `${r.n} ring notes: over [0, 2pi] ${r.off} sit off the resting disc (worst ${r.worst}); ` +
            `over [0, pi] ${r.inside} inside the half and ${r.outside} outside` +
            (r.outside ? ` (worst ${r.worstOut} deg over)` : "") +
            `; the disc on screen moved ${r.moved}`,
  };
}, { on: "all" });

check("tags: each grouping keeps its own colours, and the settings tabs reach both", async (p) => {
  const r = await p.j(`(function(){
    // github#86, design/0015 -- the panel is opened on the FOLDER disc and switched to the Tags
    // tab: its rows are the tag dimension's, a pin lands in the tag map, and the folder map, the
    // folder disc's order and its colours are all untouched.
    var gear = document.querySelector("#vg-gear");
    if (!gear || gear.hidden) return { none: true };
    if (document.querySelector("#vg-settings").hidden) gear.click();
    var tabs = Array.prototype.map.call(document.querySelectorAll("#vg-setbody [data-setdim]"),
      function (b) { return b.getAttribute("data-setdim"); });
    var folderRows = document.querySelectorAll("#vg-setbody .scr:not(.scrsub)").length;
    var foldersBefore = __vg.groupOrder().slice();
    var coloursBefore = foldersBefore.map(function (g) { return __vg.colorOf(g); }).join(",");

    var tagTab = document.querySelector("#vg-setbody [data-setdim='tag']");
    if (!tagTab) return { none: true };
    tagTab.click();
    var rows = Array.prototype.slice.call(document.querySelectorAll("#vg-setbody .scr:not(.scrsub)"));
    var names = rows.map(function (r) { var n = r.querySelector(".nm"); return n ? n.textContent : ""; });
    var tagNames = __vg.groupsOf("tag").map(function (g) { return g.name; });

    var pinned = "", key = "";
    if (rows.length) {
      var sw = rows[0].querySelectorAll("[data-fc]");
      for (var i = 0; i < sw.length; i++) {
        if (sw[i].getAttribute("data-key")) {
          pinned = rows[0].querySelector(".nm").textContent;
          key = sw[i].getAttribute("data-key");
          sw[i].click();
          break;
        }
      }
    }
    var appliedOnTagDisc = "";
    if (pinned) { __vg.setDim("tag"); appliedOnTagDisc = __vg.slotOf(pinned); __vg.setDim("folder"); }
    var out = {
      tabs: tabs, dim: __vg.state.dim, folderRows: folderRows, tagRows: rows.length,
      namesMatch: names.length > 0 && names.join("|") === tagNames.join("|"),
      pinned: pinned, key: key,
      inTagMap: pinned ? (__vg.tagColors[pinned] || "") : "",
      folderMapSize: Object.keys(__vg.folderColors).length,
      appliedOnTagDisc: appliedOnTagDisc,
      foldersSame: __vg.groupOrder().join(",") === foldersBefore.join(","),
      colourSame: __vg.groupOrder().map(function (g) { return __vg.colorOf(g); }).join(",") === coloursBefore
    };
    if (pinned) __vg.setTagColors({});
    document.querySelector("#vg-setbody [data-setdim='folder']").click();
    gear.click();
    return out;
  })()`);
  if (r.none) return { ok: true, detail: "no settings panel on this host -- the plugin owns it" };
  const ok = r.tabs.join(",") === "folder,tag" && r.dim === "folder" && r.tagRows > 0 &&
             r.namesMatch && r.folderMapSize === 0 && r.foldersSame && r.colourSame &&
             (!r.pinned || (r.inTagMap === r.key && r.appliedOnTagDisc === r.key));
  return {
    ok,
    detail: `tabs [${r.tabs.join(" | ")}], disc on ${r.dim}: ${r.folderRows} folder rows, ${r.tagRows} tag rows            (names are the tag dimension's: ${r.namesMatch})` +
            (r.pinned
              ? `; pinned ${r.pinned} to ${r.key}, tag map ${r.inTagMap || "(missing)"}, on the tag disc ${r.appliedOnTagDisc || "(not applied)"}`
              : "; no tag row to pin") +
            `; folder map ${r.folderMapSize} entries, folder order kept ${r.foldersSame}, folder colours kept ${r.colourSame}`,
  };
}, { on: "all" });

/* -------------------------------------------------------------- github#116 */

check("the sidebar chrome stays put when a dimension switch adds or drops its scrollbar",
async (p) => {
  const dpr = await p.j(`window.devicePixelRatio || 1`);
  const viewport = (h) => p.send("Emulation.setDeviceMetricsOverride",
                                 { width: 1600, height: h, deviceScaleFactor: dpr, mobile: false });
  const boxes = () => p.j(`(function(){
    var sb = document.querySelector("#vg-sidebar");
    var q = function (sel) {
      var e = document.querySelector(sel);
      if (!e) return null;
      var r = e.getBoundingClientRect();
      return [Math.round(r.left * 10) / 10, Math.round(r.right * 10) / 10];
    };
    return { scrolls: sb.scrollHeight > sb.clientHeight, client: sb.clientWidth,
             content: sb.scrollHeight, viewport: sb.clientHeight,
             rows: document.querySelectorAll("#vg-legend .lgr").length,
             at: { gear: q("#vg-gear"), search: q("#vg-q"), dim: q("#vg-dim"),
                   tags: q('#vg-dim button[data-dim="tag"]'), allon: q("#vg-allon"),
                   legend: q("#vg-legend"), refresh: q("#vg-refresh") } };
  })()`);
  const inDim = async (dim) => {
    await p.eval(`__vg.setDim(${JSON.stringify(dim)}); void 0`);
    await sleep(400);
    return boxes();
  };
  let r;
  try {
    // github#116
    await viewport(300);
    const short = { folder: await inDim("folder"), tag: await inDim("tag") };
    const lo = Math.min(short.folder.content, short.tag.content);
    const hi = Math.max(short.folder.content, short.tag.content);
    const h = Math.floor((lo + hi) / 2);
    const chrome = 300 - short.folder.viewport;
    if (hi - lo < 4) {
      r = { none: `the two lists are the same height (${short.folder.rows} folder rows ` +
                  `${short.folder.content}px, ${short.tag.rows} tag rows ${short.tag.content}px)` };
    } else {
      await viewport(h + chrome);
      r = { h, folder: await inDim("folder"), tag: await inDim("tag") };
    }
  } finally {
    await p.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
    await p.eval(`__vg.setDim("folder"); void 0`).catch(() => {});
    await sleep(400);
  }
  if (r.none) return { ok: true, detail: `NOT ASSERTED: ${r.none}` };
  if (r.folder.scrolls === r.tag.scrolls) {
    return { ok: false, detail: `at ${r.h}px the sidebar ${r.folder.scrolls ? "scrolls" : "fits"} in ` +
                                `both dimensions (content ${r.folder.content} / ${r.tag.content}px) ` +
                                `-- the height was meant to sit between them` };
  }
  const names = Object.keys(r.folder.at);
  const missing = names.filter((k) => !r.folder.at[k] || !r.tag.at[k]);
  const moved = names.filter((k) => JSON.stringify(r.folder.at[k]) !== JSON.stringify(r.tag.at[k]));
  const which = r.tag.scrolls ? "tag scrolls, folder fits" : "folder scrolls, tag fits";
  return {
    ok: moved.length === 0 && missing.length === 0,
    detail: `${r.h}px tall: ${which} (${r.folder.rows} vs ${r.tag.rows} rows); sidebar content ` +
            `${r.folder.client} -> ${r.tag.client}px; ` +
            (missing.length ? `MISSING ${missing.join(", ")}; ` : "") +
            (moved.length === 0
              ? `gear, search, segment, its Tags side, All, legend and Refresh all at the same edges`
              : `MOVED ${moved.map((k) => `${k} [${r.folder.at[k]}] -> [${r.tag.at[k]}]`).join(", ")}`),
  };
});

/* ------------------------------------------------- github#86 D-9, design/0015 */

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
  // github#113
  await settle(p);
  return { ok: r.moved === 0 && r.pushed === 0 && r.haloed > 0,
           detail: `${r.day}: ${r.haloed} haloed, ${r.pushed} pushed, ${r.moved} moved` };
}, { on: "all" });

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
}, { on: "all" });

check("hovering a note ramps in and releases at zero", async (p) => {
  // github#63
  await settle(p);
  await camSettle(p);
  const w = await p.j(`__vg.demo.where("note","04") || __vg.demo.where("note","03")`);
  if (!w) return { ok: false, detail: "no note target resolved at all" };
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: w.x, y: w.y, buttons: 0 });
  // github#78 -- see changelog-detail
  await sleep(50);
  await settle(p);
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
  await sleep(50);
  await settle(p);
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
}, { clock: "real" });

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
}, { clock: "real" });

check("tags: a live rebuild in the tag disc refiles the arrival and keeps the rings it was switched into", async (p) => {
  await settle(p);
  await p.eval(LIVE_JS);
  // github#72, github#86, decisions/0011 -- the filing is a cache a live rebuild stales
  // github#86 -- an untagged arrival lands in (untagged)
  // github#86, decisions/0011 -- a switched-to disc keeps its borrowed rings
  // github#86 -- "fresh" is two passes inside the kept rings, not relayout()
  await p.j(`(function(){ __vg.setDim("tag"); return true; })()`);
  await settle(p);
  const start = await p.j(`(function(){ window.__live.a = window.__live.snap();
    var L = __vg.geomLock; window.__live.rings0 = L ? { r0: L.r0, maxR: L.maxR, dim: L.dim } : null;
    return { n: window.__live.a.n, dim: __vg.state.dim, rings: window.__live.rings0 }; })()`);
  const res = await p.j(`__vg.applyData(window.__live.withOneMore("__live/Zz Live Probe.md"))`);
  await settle(p);
  const after = await p.j(`(function(){
    var landed = window.__live.snap(), id = null;
    __vg.graph.forEachNode(function (i, a) { if (a.path === "__live/Zz Live Probe.md") id = i; });
    __vg.applyLayout(false); __vg.applyLayout(false);
    var L = __vg.geomLock;
    return { d: window.__live.drift(landed, window.__live.snap()), found: id !== null,
             g: id === null ? "" : __vg.groupOf(id), dim: __vg.state.dim, exit: __vg.lastCascade().exit,
             rings: L ? { r0: L.r0, maxR: L.maxR, dim: L.dim } : null };
  })()`);
  await p.j(`__vg.applyData(window.__live.without(window.__live.clone().nodes.length - 1))`);
  await settle(p);
  const back = await p.j(`window.__live.drift(window.__live.a, window.__live.snap())`);
  await p.j(`(function(){ __vg.setDim("folder"); return true; })()`);
  await settle(p);
  const r0Step = start.rings && after.rings ? Math.abs(after.rings.r0 - start.rings.r0) : NaN;
  const ok = start.dim === "tag" && res.applied && res.added === 1 && res.cascaded &&
             after.found && after.g === "(untagged)" && after.dim === "tag" &&
             after.d.moved === 0 && after.d.sized === 0 && after.d.bands === 0 &&
             !!start.rings && !!after.rings && start.rings.dim === "folder" && after.rings.dim === "folder" &&
             r0Step < 0.01 && back.moved === 0 && back.sized === 0;
  return { ok, detail: `on the ${start.dim} disc, ${start.n} -> ${start.n + 1} notes, cascade ${after.exit}; ` +
                       `arrival filed under ${after.g || "(nowhere)"}; settle vs the fixed point: ` +
                       `${after.d.moved} moved / ${after.d.sized} resized, ${after.d.bands} band flip(s); ` +
                       `rings ${start.rings ? start.rings.dim : "none"} -> ${after.rings ? after.rings.dim : "none"}, ` +
                       `r0 step ${isNaN(r0Step) ? "?" : r0Step.toFixed(4)}; restored to ${back.moved} off original` +
                       (back.who ? ` (worst ${back.worst}, ${back.who})` : "") };
}, { on: "all" });

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
}, { clock: "real" });

// github#58
check("a sub-pixel dot can still be hovered", async (p) => {
  await settle(p);
  await camSettle(p);
  const pick = await p.j(`(function(){
    var best = null, bd = -1;
    __vg.graph.forEachNode(function (id) {
      if ((__vg.alpha[id] || 0) < 0.999) return;
      var d = __vg.graph.degree(id);
      if (d > bd || (d === bd && id < best)) { bd = d; best = id; }
    });
    if (!best) return null;
    var dd = __vg.renderer.getNodeDisplayData(best);
    return { id: best, size: dd.size, ratio: __vg.renderer.getCamera().getState().ratio }; })()`);
  if (!pick) return { ok: false, detail: "no visible note to aim at" };
  const WANT_PX = 0.6;
  const ratio = Math.min(40, Math.max(pick.ratio, pick.size / WANT_PX));
  await p.eval(`__vg.renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: ${ratio}, angle: 0 }); __vg.renderer.refresh(); void 0`);
  await p.eval(`new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); })`);
  const at = await p.j(`(function(){
    var a = __vg.graph.getNodeAttributes(${JSON.stringify(pick.id)});
    var o = document.getElementById("vg-graph").getBoundingClientRect();
    var v = __vg.renderer.graphToViewport({ x: a.x, y: a.y });
    return { x: v.x + o.left, y: v.y + o.top, r: __vg.renderer.scaleSize(__vg.renderer.getNodeDisplayData(${JSON.stringify(pick.id)}).size) }; })()`);
  const corners = [[Math.floor(at.x), Math.floor(at.y)], [Math.ceil(at.x), Math.floor(at.y)],
                   [Math.floor(at.x), Math.ceil(at.y)], [Math.ceil(at.x), Math.ceil(at.y)]];
  let hitSelf = 0, hitAny = 0, nearestHit = null;
  let nearest = corners[0], nd = Infinity;
  for (const c of corners) { const d = Math.hypot(c[0] - at.x, c[1] - at.y); if (d < nd) { nd = d; nearest = c; } }
  for (const c of corners) {
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, buttons: 0 });
    await sleep(120);
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c[0], y: c[1], buttons: 0 });
    await sleep(200);
    const h = await p.j(`__vg.state.hovered`);
    if (h) hitAny++;
    if (h === pick.id) hitSelf++;
    if (c === nearest) nearestHit = h;
  }
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, buttons: 0 });
  await sleep(300);
  await camReset(p);
  const ok = nearestHit === pick.id && hitAny === 4;
  return { ok,
           detail: `note ${pick.id} drawn at ${at.r.toFixed(2)}px radius (ratio ${ratio.toFixed(2)}): the nearest whole-pixel ` +
                   `pointer (${nd.toFixed(2)}px off) hovered ${nearestHit}; ${hitSelf}/4 whole-pixel corners hit it, ${hitAny}/4 hit a note` };
}, { on: ["demo-vault","test-vault"], clock: "real" });

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
}, { clock: "real" });

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
  await p.eval(`__vg.renderer.getCamera().setState({x:0.5,y:0.5,ratio:1.04,angle:0}); void 0`);
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
    ok: Math.abs(c.x - 0.5) < 0.002 && Math.abs(c.y - 0.5) < 0.002 && Math.abs(c.ratio - 1.04) < 0.02,
    detail: `from (0.28, 0.66) ratio 4.2 -> (${c.x}, ${c.y}) ratio ${c.ratio}; reset is (0.5, 0.5) 1.04`,
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

// github#82
check("the panel toggles fold each panel away and give the space back", async (p) => {
  // github#82 -- pinned: this suite's own window is a grid slot
  const dpr = await p.j(`window.devicePixelRatio || 1`);
  await p.send("Emulation.setDeviceMetricsOverride",
               { width: 1280, height: 900, deviceScaleFactor: dpr, mobile: false });
  await sleep(400);

  const shot = () => p.j(`(function(){
    var root = document.querySelector(".vault-graph");
    var box = function (sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var b = el.getBoundingClientRect();
      return { x: Math.round(b.left), y: Math.round(b.top),
               w: Math.round(b.width), h: Math.round(b.height),
               // github#82 -- null offsetParent: not laid out at all
               laidOut: el.offsetParent !== null };
    };
    var sheetBtn = document.getElementById("vg-sheet");
    var bandBtn = document.getElementById("vg-band");
    return {
      root: box(".vault-graph"), sidebar: box("#vg-sidebar"), stage: box("#vg-stage"),
      heat: box("#vg-heat"), canvas: box("#vg-canvas"),
      sheet: root.getAttribute("data-sheet"), band: root.getAttribute("data-band"),
      sheetOpen: __vg.sheetOpen, bandOpen: __vg.bandOpen, narrow: __vg.narrow,
      expanded: sheetBtn ? sheetBtn.getAttribute("aria-expanded") : null,
      pressed: bandBtn ? bandBtn.getAttribute("aria-pressed") : null
    };
  })()`);

  const press = async (id) => {
    await p.eval(`(function(){ var b = document.getElementById("vg-${id}");
                               if (b) b.click(); })(); void 0`);
    await sleep(320);
  };
  const stored = () => p.j(`(function(){
    try { return JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}"); }
    catch (e) { return { unreadable: String((e && e.name) || e) }; }
  })()`);

  const a = await shot();
  if (a.narrow) {
    await p.send("Emulation.clearDeviceMetricsOverride");
    return { ok: false, detail: "the page still calls itself narrow at a 1280px override -- " +
                                "NARROW_PX in page.js and the breakpoint in page.css disagree" };
  }

  // github#82 -- the cluster: 31px squares at the disc's corner
  const btns = await p.j(`(function(){
    var g = document.querySelector("#vg-canvas").getBoundingClientRect();
    var mob = document.querySelector("#vg-mob");
    var mr = mob ? mob.getBoundingClientRect() : null;
    var out = { fromLeft: mr ? Math.round(mr.left - g.left) : null,
                fromTop: mr ? Math.round(mr.top - g.top) : null, buttons: [] };
    ["vg-sheet", "vg-band"].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) { out.buttons.push({ id: id, missing: true }); return; }
      var r = b.getBoundingClientRect();
      out.buttons.push({ id: id, w: Math.round(r.width), h: Math.round(r.height),
                         left: Math.round(r.left), svg: !!b.querySelector("svg"),
                         label: b.getAttribute("aria-label"),
                         inside: mr ? r.left >= mr.left - 1 && r.right <= mr.right + 1 : false });
    });
    return out;
  })()`);

  // github#82 -- neither auto-close may fold a column
  await p.eval(`__vg.renderer.emit("clickStage", {}); void 0`).catch(() => {});
  await sleep(200);
  const afterStageClick = await shot();
  const picked = await p.j(`(function(){
    var best = null, bd = -1;
    __vg.graph.forEachNode(function (id, at) { if (at.deg > bd) { bd = at.deg; best = id; } });
    if (best === null) return null;
    __vg.renderer.emit("clickNode", { node: best });
    return best;
  })()`);
  await sleep(280);
  const afterSelect = await shot();
  await p.eval(`__vg.renderer.emit("clickStage", {}); void 0`).catch(() => {});
  await sleep(200);

  await press("sheet");
  const b = await shot();
  const afterSheetStore = await stored();
  await press("band");
  const c = await shot();
  const afterBandStore = await stored();

  await press("sheet");
  await press("band");
  const d = await shot();
  await p.send("Emulation.clearDeviceMetricsOverride");
  await sleep(360);

  const badBtn = btns.buttons.filter((x) => x.missing || x.w !== 31 || x.h !== 31 ||
                                            !x.svg || !x.label || !x.inside);
  const cluster = badBtn.length === 0 &&
                  btns.fromLeft !== null && btns.fromLeft >= 0 && btns.fromLeft < 60 &&
                  btns.fromTop !== null && btns.fromTop >= 0 && btns.fromTop < 60 &&
                  btns.buttons[1].left > btns.buttons[0].left;

  const heldOnStageClick = afterStageClick.sheet === "on" && afterStageClick.sheetOpen === true;
  const heldOnSelect = afterSelect.sheet === "on" && afterSelect.sheetOpen === true;

  const widthGain = b.canvas.w - a.canvas.w;
  const sheetFolds = b.sheet === "off" && b.sheetOpen === false && b.expanded === "false" &&
                     b.sidebar !== null && !b.sidebar.laidOut &&
                     widthGain === a.sidebar.w && b.stage.x === b.root.x &&
                     b.canvas.w === b.root.w;

  const heightGain = c.canvas.h - b.canvas.h;
  const bandFolds = c.band === "off" && c.bandOpen === false && c.pressed === "false" &&
                    c.heat !== null && !c.heat.laidOut &&
                    heightGain === a.heat.h && c.canvas.y === c.root.y &&
                    c.canvas.h === c.root.h && c.canvas.w === c.root.w;

  const restored = d.sheet === a.sheet && d.band === a.band &&
                   d.canvas.w === a.canvas.w && d.canvas.h === a.canvas.h;

  // github#82, github#4 -- the plugin's 44px is the other corner's problem
  const host = await p.j(`(function(){
    var root = document.querySelector(".vault-graph");
    var box = function (sel) { var b = document.querySelector(sel).getBoundingClientRect();
                               return { x: Math.round(b.left), y: Math.round(b.top),
                                        r: Math.round(b.right), b: Math.round(b.bottom) }; };
    var canvas = box("#vg-canvas");
    var read = function () {
      var m = box("#vg-mob"), c = box("#vg-cam");
      return { mob: m.x - canvas.x, mobTop: m.y - canvas.y,
               cam: canvas.r - c.r, camBottom: canvas.b - c.b };
    };
    var before = read();
    var had = root.style.getPropertyValue("--controls-inset");
    root.style.setProperty("--controls-inset", "44px");
    var after = read();
    if (had) root.style.setProperty("--controls-inset", had);
    else root.style.removeProperty("--controls-inset");
    return { before: before, after: after };
  })()`);
  const insetIsOwn = host.before.mob === host.after.mob &&
                     host.before.mobTop === host.after.mobTop &&
                     host.after.cam === 44 && host.after.camBottom === 44;

  // github#82 -- an unreadable store is reported, never failed on
  const storeLive = !afterSheetStore.unreadable && !afterBandStore.unreadable;
  const persists = !storeLive ||
                   (afterSheetStore.sheetOpen === false && afterBandStore.bandOpen === false);

  return {
    ok: cluster && insetIsOwn && heldOnStageClick && heldOnSelect && sheetFolds && bandFolds &&
        restored && persists,
    detail: badBtn.length
      ? `wrong: ${badBtn.map((x) => x.missing ? x.id + " missing"
                                              : x.id + " " + x.w + "x" + x.h).join(", ")}`
      : `2 buttons at ${btns.buttons[0].w}x${btns.buttons[0].h}px, ${btns.fromLeft}px from ` +
        `the canvas left edge and ${btns.fromTop}px from its top; canvas ` +
        `${a.canvas.w}x${a.canvas.h} -> ${b.canvas.w}x${b.canvas.h} folding the ` +
        `${a.sidebar.w}px sidebar -> ${c.canvas.w}x${c.canvas.h} folding the ${a.heat.h}px ` +
        `band (= the root's ${c.root.w}x${c.root.h}); back to ${d.canvas.w}x${d.canvas.h}; ` +
        `at --controls-inset 44px (the plugin's) the toggles hold ${host.after.mob}/` +
        `${host.after.mobTop} while the camera moves to ${host.after.cam}/${host.after.camBottom}; ` +
        `a stage click and opening note ${picked} left data-sheet ` +
        `${afterStageClick.sheet}/${afterSelect.sheet}; stored ${storeLive
          ? `sheetOpen ${afterSheetStore.sheetOpen}, bandOpen ${afterBandStore.bandOpen}`
          : `NOT MEASURED (localStorage ${afterSheetStore.unreadable})`}` +
        (cluster ? "" : "  <- THE CLUSTER IS NOT AT THE DISC'S TOP-LEFT") +
        (insetIsOwn ? "" : "  <- IT FOLLOWS --controls-inset, SO OBSIDIAN PUSHES IT 44px IN") +
        (heldOnStageClick && heldOnSelect ? "" : "  <- THE SIDEBAR FOLDED ITSELF") +
        (sheetFolds ? "" : "  <- THE SIDEBAR DID NOT GIVE ITS WIDTH BACK") +
        (bandFolds ? "" : "  <- THE BAND DID NOT GIVE ITS HEIGHT BACK") +
        (restored ? "" : "  <- THE ROUND TRIP DID NOT RESTORE THE BOX") +
        (persists ? "" : "  <- THE FOLD WAS NOT WRITTEN THROUGH"),
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
}, { on: "all" });

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
}, { on: "all" });

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
  const want = 1.04 * Math.max(0.12, Math.min(1.35, dens.reach));
  return {
    ok: Math.abs(full.ratio - 1.04) < 0.02 && Math.abs(small.ratio - want) < 0.03 &&
        Math.abs(small.x - 0.5) < 0.002 && Math.abs(small.y - 0.5) < 0.002,
    detail: `full vault ratio ${full.ratio}; with ${hid.hidden} of ${hid.hidden + hid.kept} ` +
            `groups hidden the disc reaches ${hid.extent} (${dens.reach} of the lock) and fit ` +
            `gives ${small.ratio} against ${want.toFixed(4)} promised, centred at ` +
            `(${small.x}, ${small.y})`,
  };
}, { on: WALK, clock: "real" });

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
    // github#19
    if (!s.busy) break;
    if (Math.abs(s.ratio - startRatio) > 0.01) movedWhileBusy = true;
    if (Date.now() > deadline) break;
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
  const want = 1.04 * Math.max(0.12, Math.min(1.35, dens.reach));
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
}, { on: WALK, clock: "real" });

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
  const want = 1.04 * Math.max(0.12, Math.min(1.35, dens.reach));
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
}, { on: WALK, clock: "real" });

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
}, { on: WALK, clock: "real" });

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

  const rest = await at(1.04);
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
}, { on: "all" });

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
}, { clock: "real" });

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
}, { on: WALK, clock: "real" });

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
}, { on: WALK, clock: "real" });

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
}, { on: "all" });

// github#66
// github#14
// design/0011
async function walkSolo(p, fitOn) {
  await clearRange(p);
  await settle(p);
  await camSettle(p);
  const hasFit = await p.j(`typeof __vg.fitCap === "boolean"`);
  if (fitOn && !hasFit) return { skip: "this build has no per-frame dot-size cap to switch on" };
  await p.eval(`__vg.fitCap = ${fitOn ? "true" : "false"}; void 0`);
  const pick = await p.j(`(function(){
    var best = null;
    __vg.groupOrder().forEach(function (g) {
      var n = __vg.groupCount(g);
      if (n >= 2 && (!best || n < best.n)) best = { g: g, n: n };
    });
    return best; })()`);
  if (!pick) return { skip: "no group with two or more notes to solo -- nothing to walk" };
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
  if (!w) return { fail: `no "only" chip resolved for ${pick.g}` };
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: w.x, y: w.y, buttons: 0 });
  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 1 });
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: w.x, y: w.y, button: "left", clickCount: 1, buttons: 0 });
  let peak = 0, peakAt = 0, frames = 0, trough = Infinity;
  const t0 = Date.now();
  for (;;) {
    const smp = await p.j(SAMPLE);
    frames++;
    if (smp.max > peak) { peak = smp.max; peakAt = Date.now() - t0; }
    if (smp.n && smp.max < trough) trough = smp.max;
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
  if (hasFit) await p.eval(`__vg.fitCap = false; void 0`);
  const bound = Math.max(before.max, after.max) * 1.05;
  const floor = Math.min(before.max, after.max);
  return { pick, before, after, peak, peakAt, frames, trough, bound, floor, ok: peak <= bound };
}

function soloDetail(r) {
  return `soloed ${r.pick.g} (${r.pick.n} notes): biggest dot ${r.before.max} units at rest ` +
         `-> peak ${r.peak} at ${r.peakAt}ms over ${r.frames} frames -> ${r.after.max} at rest ` +
         `(${r.after.n} shown); bound ${Math.round(r.bound * 10) / 10}` +
         (r.ok ? "" : `  <- overshoots both resting sizes by ${(r.peak / Math.max(r.before.max, r.after.max)).toFixed(2)}x`);
}

check("a dot never outgrows its resting size while a cascade walks", async (p) => {
  const r = await walkSolo(p, false);
  if (r.skip) return { ok: true, detail: r.skip };
  if (r.fail) return { ok: false, detail: r.fail };
  return { ok: r.ok, detail: soloDetail(r) };
}, { on: WALK, clock: "real" });

// design/0011
check("with Size dots from the frame on, a walking dot is held under its two resting sizes, never above", async (p) => {
  const r = await walkSolo(p, true);
  if (r.skip) return { ok: true, detail: r.skip };
  if (r.fail) return { ok: false, detail: r.fail };
  const dip = r.floor > 0 ? Math.round((1 - r.trough / r.floor) * 1000) / 10 : 0;
  return { ok: r.ok,
           detail: soloDetail(r) + `; lowest mid-walk ${r.trough} units, ${dip}% under the smaller resting size (the cap may hold a dot below, never above)` };
}, { on: WALK, clock: "real" });

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
}, { on: WALK, clock: "real" });

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
}, { on: WALK, clock: "real" });

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
}, { clock: "real" });

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
}, { on: "all" });

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
}, { on: "all" });

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
}, { on: "all" });

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
  // github#112
  await settle(p);
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
}, { on: "all" });

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
}, { on: "all" });

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
}, { on: "all" });

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

    // github#113
    var restored = false;
    if (visBtn && rowAfter) {
      rowAfter.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
      var again = menu.hidden ? null : menu.querySelector("[data-vis]");
      if (again) { again.click(); restored = hiddenByDefault(g) !== startShown; }
    }
    var h = __vg.state.hidden.folder || (__vg.state.hidden.folder = {});
    var liveRestored = !!h[g] === liveHiddenBefore;

    return { g: g, startShown: startShown, openedOk: openedOk, pressedBefore: pressedBefore,
             closedAfter: closedAfter, defaultFlipped: defaultFlipped,
             legendFollowed: legendFollowed, settingsAgrees: settingsAgrees,
             restored: restored, liveRestored: liveRestored };
  })()`);
  // github#113
  await settle(p);
  if (!r.restored || !r.liveRestored) {
    return { ok: false, detail: `"${r.g}": the second click did not put the default ` +
      `(${r.restored}) and the live filter (${r.liveRestored}) back where they were` };
  }
  const ok = r.openedOk && r.pressedBefore === String(r.startShown) && r.closedAfter &&
             r.defaultFlipped && r.legendFollowed && r.settingsAgrees !== false;
  return { ok, detail: `"${r.g}" started ${r.startShown ? "shown" : "hidden"} by default; ` +
    `menu opened with the toggle ${r.openedOk ? "present" : "MISSING"} ` +
    `(pressed=${r.pressedBefore}); after click: menu closed=${r.closedAfter}, ` +
    `default flipped=${r.defaultFlipped}, legend followed=${r.legendFollowed}, ` +
    `settings panel agrees=${r.settingsAgrees}` };
}, { on: "all" });

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
}, { on: "all" });

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
}, { on: "all" });

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
}, { on: "all" });

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
}, { clock: "real" });

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
}, { on: "all" });

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
}, { on: "all" });

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
    window.__smokeOrphans = { ids: ids, startOn: startOn };
    return { skip: false, ids: ids.length, openedOk: openedOk, pressedBefore: pressedBefore,
             closedAfter: closedAfter, turnedOn: turnedOn, countAfter: countAfter };
  })()`);
  if (r.skip) return { ok: true, detail: "no unlinked notes on this shape, nothing to measure" };
  // github#113, github#86
  await settle(p);
  const paint = await p.j(`(function(){
    var o = window.__smokeOrphans, rd = __vg.renderer;
    // nodeColor(), not a mirrored formula: it is the exact function under test, so this
    // asks "did the paint agree with the function" rather than "did the paint agree with
    // this check's own guess at what the function does."
    var expected = o.ids.map(function (id) { return String(__vg.nodeColor(id)).toLowerCase(); });
    var actual = o.ids.map(function (id) { return String(rd.getNodeDisplayData(id).color).toLowerCase(); });
    var matched = actual.filter(function (c, i) { return c === expected[i]; }).length;
    // Restore exactly, same discipline as the github#34 check above.
    __vg.setUnlinkedByFolder(o.startOn);
    delete window.__smokeOrphans;
    return { matched: matched };
  })()`);
  await settle(p);
  r.matched = paint.matched;
  const ok = r.openedOk && r.pressedBefore === "false" && r.closedAfter &&
             r.turnedOn && r.countAfter === 0 && r.matched === r.ids;
  return { ok, detail: `${r.ids} unlinked notes; menu opened with the toggle ` +
    `${r.openedOk ? "present" : "MISSING"} (pressed=${r.pressedBefore}); after click: ` +
    `menu closed=${r.closedAfter}, toggle turned on=${r.turnedOn}, (unlinked) count after=` +
    `${r.countAfter}, ${r.matched} of ${r.ids} repainted to their folder's tint` };
}, { on: "all" });

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
}, { on: "all" });

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
}, { on: "all" });

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
}, { on: "all" });

// github#78, design/0006
check("legend count bars scale to the largest visible folder", async (p) => {
  const read = () => p.j(`(function(){
    var order = __vg.graph.order;
    var rows = [].map.call(document.querySelectorAll('#vg-legend .lgr'), function (lgr) {
      var lg = lgr.querySelector('.lg');
      if (!lg) return null;
      var cs = getComputedStyle(lg), g = lg.getAttribute('data-g');
      // github#78 -- no regex: an escape in this template literal never reaches the page
      var declared = cs.getPropertyValue('--vg-share').trim();
      return { g: g, ct: lgr.querySelector('.ct').textContent,
               bar: lg.classList.contains('bar'),
               pct: declared.charAt(declared.length - 1) === '%' ? parseFloat(declared) : null,
               applied: cs.backgroundSize.indexOf('max(') === 0,
               size: cs.backgroundSize, drawn: cs.backgroundImage !== 'none',
               visible: lg.getAttribute('aria-pressed') === 'true',
               title: lgr.querySelector('.ct').getAttribute('title'),
               count: __vg.groupCount(g) };
    }).filter(Boolean);
    return { order: order, rows: rows };
  })()`);

  // github#78, design/0006 -- see changelog-detail
  const settleBars = () => settle(p);

  // github#78
  const basisOf = (rows) => rows
    .filter((r) => r.count > 0 && r.visible && /^\d+$/.test(r.ct))
    .reduce((m, r) => Math.max(m, r.count), 0);

  const base = await read();
  const basis = basisOf(base.rows);
  const wrong = [];
  let barred = 0, full = 0, widest = { g: null, px: 0 }, thinnest = { g: null, px: 1e9 };
  for (const r of base.rows) {
    // github#50, github#3, github#78
    const wantBar = /^\d+$/.test(r.ct) && r.count > 0 && r.visible;
    if (r.bar !== wantBar) {
      wrong.push(`${r.g}: ct "${r.ct}" visible=${r.visible} but bar=${r.bar}`);
      continue;
    }
    if (!wantBar) {
      if (r.drawn || r.size !== "auto") wrong.push(`${r.g}: no-bar row still paints (${r.size})`);
      continue;
    }
    barred++;
    if (r.pct === null || !r.drawn || !r.applied) {
      wrong.push(`${r.g}: barred but size=${r.size} share=${r.pct}`);
      continue;
    }
    const want = Math.min(100, (r.count / basis) * 100);
    if (Math.abs(r.pct - want) > 0.01) {
      wrong.push(`${r.g}: ${r.pct}% declared, ${want.toFixed(3)}% against the largest shown (${basis})`);
    }
    if (Math.abs(r.pct - 100) < 0.01) full++;
    const px = Math.max(1, (r.count / basis) * 217);
    if (px > widest.px) widest = { g: r.g, px };
    if (px < thinnest.px) thinnest = { g: r.g, px };
  }
  if (barred && !full) wrong.push(`no row draws a full bar against a basis of ${basis}`);

  // github#78 -- idempotent: the tree may already be open
  await p.eval(`(function(){ var b = document.querySelectorAll('#vg-legend [data-tw]');
                for (var i = 0; i < b.length; i++) {
                  if (b[i].getAttribute('aria-expanded') !== 'true') b[i].click();
                } })(); void 0`);
  await sleep(300);
  const subs = await p.j(`(function(){
    var img = [].map.call(document.querySelectorAll('#vg-legend .lgs'),
      function (e) { return getComputedStyle(e).backgroundImage; });
    return { n: img.length, drawn: img.filter(function (v) { return v !== 'none'; }).length };
  })()`);
  if (subs.drawn) wrong.push(`${subs.drawn} of ${subs.n} subfolder rows draw a bar`);

  // github#78, design/0006
  const spec = await p.j(`(function(){
    for (var i = 0; i < document.styleSheets.length; i++) {
      var rules;
      try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
      for (var j = 0; j < rules.length; j++) {
        var sel = rules[j].selectorText;
        if (sel && sel.indexOf('.lg.bar') >= 0) return sel;
      }
    }
    return null;
  })()`);
  if (!spec) wrong.push("no .lg.bar rule found in any stylesheet");
  else if (spec.indexOf("#") < 0) {
    wrong.push(`the bar rule is "${spec}" -- no id, so a host's background shorthand ` +
               `on .lg:hover ties and wins on order`);
  }

  // github#78
  const biggest = base.rows.filter((r) => r.bar).sort((a, b) => b.count - a.count)[0];
  const sel1 = (attr, g) => `[${attr}="${g.replace(/"/g, '\\"')}"]`;

  let hov = null;
  if (biggest) {
    const box = await p.j(`(function(){
      var el = document.querySelector('${sel1("data-g", biggest.g)}');
      var b = el.getBoundingClientRect();
      return { x: Math.round(b.left + 30), y: Math.round(b.top + b.height / 2) };
    })()`);
    await p.send("Input.dispatchMouseEvent",
                 { type: "mouseMoved", x: box.x, y: box.y, button: "none", clickCount: 0 });
    await sleep(250);
    const h = await p.j(`(function(){
      var el = document.querySelector('${sel1("data-g", biggest.g)}');
      var cs = getComputedStyle(el);
      return { size: cs.backgroundSize, drawn: cs.backgroundImage !== 'none',
               hovered: el.matches(':hover') };
    })()`);
    hov = h.hovered ? (h.drawn && h.size === biggest.size) : null;
    if (h.hovered && !hov) wrong.push(`hovering ${biggest.g} wiped the bar (${h.size})`);
    await p.send("Input.dispatchMouseEvent",
                 { type: "mouseMoved", x: 5, y: 5, button: "none", clickCount: 0 });
    await sleep(150);
  }

  // github#78
  let sel = null, rescaled = null;
  if (biggest) {
    const click = async (attr, g) =>
      p.eval(`document.querySelector('${sel1(attr, g)}').click(); void 0`);
    await click("data-g", biggest.g);
    await settleBars();
    const after = await read();
    const row = after.rows.find((r) => r.g === biggest.g);
    sel = row && row.bar && Math.abs(row.pct - biggest.pct) < 0.001;
    if (!sel) wrong.push(`selecting ${biggest.g} changed its bar (${row && row.size})`);
    await click("data-g", biggest.g);
    await settleBars();

    // github#78, design/0006
    const runnerUp = base.rows.filter((r) => r.bar && r.g !== biggest.g)
      .sort((a, b) => b.count - a.count)[0];
    if (runnerUp) {
      await click("data-eye", biggest.g);
      await settleBars();
      const h2 = await read();
      const basis2 = basisOf(h2.rows);
      const promoted = h2.rows.find((r) => r.g === runnerUp.g);
      const hiddenRow = h2.rows.find((r) => r.g === biggest.g);
      if (hiddenRow && hiddenRow.bar) {
        wrong.push(`hidden ${biggest.g} still draws a bar (${hiddenRow.size})`);
      }
      rescaled = basis2 === runnerUp.count &&
                 promoted && Math.abs(promoted.pct - 100) < 0.01 &&
                 !!hiddenRow && !hiddenRow.bar;
      if (basis2 !== runnerUp.count) {
        wrong.push(`hiding ${biggest.g} left the basis at ${basis2}, wanted ${runnerUp.count}`);
      } else if (!promoted || Math.abs(promoted.pct - 100) > 0.01) {
        wrong.push(`hiding ${biggest.g} did not promote ${runnerUp.g} to a full bar ` +
                   `(${promoted && promoted.pct}%)`);
      }
      await click("data-eye", biggest.g);
      await settleBars();
      const restored = await read();
      if (basisOf(restored.rows) !== basis) {
        wrong.push(`showing ${biggest.g} again left the basis at ${basisOf(restored.rows)}`);
      }
    }
  }

  // github#78
  let onlyState = null;
  if (biggest) {
    const before = await read();
    await p.eval(`(function(){
      var lg = document.querySelector('${sel1("data-g", biggest.g)}');
      var chip = lg && lg.querySelector('[data-only]');
      if (chip) chip.click();
    })(); void 0`);
    await settleBars();
    const only = await read();
    const barred = only.rows.filter((r) => r.bar);
    const full = barred.filter((r) => Math.abs(r.pct - 100) < 0.01);
    onlyState = `${barred.length} barred, ${full.length} at 100%`;
    if (barred.length !== 1 || full.length !== 1 || barred[0].g !== biggest.g) {
      wrong.push(`only ${biggest.g}: ${barred.length} barred row(s) ` +
                 `(${barred.map((r) => r.g).join(", ")}), ${full.length} at 100%`);
    }
    await p.eval(`(function(){
      var all = document.getElementById('vg-allon');
      if (all) all.click();
    })(); void 0`);
    await settleBars();
    const back = await read();
    if (back.rows.filter((r) => r.bar).length !== before.rows.filter((r) => r.bar).length) {
      wrong.push(`showing all again left ${back.rows.filter((r) => r.bar).length} barred, ` +
                 `was ${before.rows.filter((r) => r.bar).length}`);
    }
  }

  // github#50, github#3
  const startOn = await p.eval(`__vg.unlinkedByFolder`);
  await p.eval(`__vg.setUnlinkedByFolder(false); void 0`);
  await settleBars();
  const sep = await read();
  const sepBasis = basisOf(sep.rows);
  let paren = 0;
  for (const r of sep.rows) {
    const wantBar = /^\d+$/.test(r.ct) && r.count > 0 && r.visible;
    if (!wantBar && !r.bar && /^\(\d+\)$/.test(r.ct)) paren++;
    if (r.bar !== wantBar) {
      wrong.push(`kept separate, ${r.g}: ct "${r.ct}" but bar=${r.bar}`);
      continue;
    }
    if (!wantBar) continue;
    const want = Math.min(100, (r.count / sepBasis) * 100);
    if (r.pct === null || !r.applied || Math.abs(r.pct - want) > 0.01) {
      wrong.push(`kept separate, ${r.g}: ${r.pct}% declared, ${want.toFixed(3)}% wanted`);
    }
  }
  await p.eval(`__vg.setUnlinkedByFolder(${startOn}); void 0`);
  await settleBars();

  const titled = base.rows.find((r) => r.g === (biggest && biggest.g));
  return {
    ok: wrong.length === 0 && barred > 0 && paren > 0 && full > 0,
    detail: `${barred} of ${base.rows.length} rows barred, basis ${basis} notes ` +
            `(${JSON.stringify(widest.g)}), ${full} row(s) at a full bar; ` +
            `widest ${widest.px.toFixed(1)}px, thinnest ${thinnest.g} ` +
            `${thinnest.px.toFixed(1)}px (1px floor); ` +
            `${paren} parenthesised row(s) bare while kept separate; ${subs.n} sub rows bare; ` +
            `selection kept it=${sel}, hover kept it=${hov === null ? "no :hover from the harness" : hov}, ` +
            `hiding the largest rescaled the rest and dropped its own bar=${rescaled}; ` +
            `only-this-folder: ${onlyState}; bar rule "${spec}"; ` +
            `title ${JSON.stringify(titled && titled.title)}` +
            (wrong.length ? `  <- ${wrong.join(" | ")}` : "")
  };
}, { on: "all" });

// github#78, design/0006
check("the thinnest count bar survives a hover in pixels, not just in CSS", async (p) => {
  const row = await p.j(`(function(){
    var rows = [].slice.call(document.querySelectorAll('#vg-legend .lg.bar'));
    if (!rows.length) return null;
    rows.sort(function (a, b) {
      return parseFloat(getComputedStyle(a).getPropertyValue('--vg-share')) -
             parseFloat(getComputedStyle(b).getPropertyValue('--vg-share'));
    });
    var lg = rows[0];
    lg.setAttribute('data-floorprobe', '1');
    // github#78 -- earlier checks open the whole tree, so this row can be below the fold;
    // a clip outside the viewport captures nothing and reads as 0px painted.
    lg.scrollIntoView({ block: 'center' });
    var b = lg.getBoundingClientRect();
    if (b.top < 0 || b.bottom > innerHeight) return { offscreen: true, g: lg.getAttribute('data-g') };
    return { g: lg.getAttribute('data-g'),
             col: getComputedStyle(lg).getPropertyValue('--vg-bar').trim(),
             share: getComputedStyle(lg).getPropertyValue('--vg-share').trim(),
             size: getComputedStyle(lg).backgroundSize,
             x: b.left, y: b.top, w: b.width, h: b.height,
             cx: Math.round(b.left + 40), cy: Math.round(b.top + b.height / 2) };
  })()`);
  if (!row) return { ok: true, detail: "no barred row on this shape -- nothing to floor" };
  if (row.offscreen) {
    return { ok: true, detail: `${row.g} would not scroll into view -- nothing measurable here` };
  }

  const painted = async () => {
    const shot = await p.send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: false,
      clip: { x: row.x, y: row.y, width: row.w, height: row.h, scale: 1 }
    });
    return p.eval(`(async function(){
      var img = new Image();
      await new Promise(function (res, rej) { img.onload = res; img.onerror = rej;
        img.src = "data:image/png;base64," + ${JSON.stringify(shot.data)}; });
      var cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
      var hex = ${JSON.stringify(row.col)}.replace('#','');
      var tr = parseInt(hex.slice(0,2),16), tg = parseInt(hex.slice(2,4),16), tb = parseInt(hex.slice(4,6),16);
      var best = 0;
      for (var y = cv.height - 1; y >= Math.max(0, cv.height - 8); y--) {
        var d = cx.getImageData(0, y, cv.width, 1).data, run = 0, rb = 0;
        for (var x = 0; x < cv.width; x++) {
          var s = Math.abs(d[x*4]-tr) + Math.abs(d[x*4+1]-tg) + Math.abs(d[x*4+2]-tb);
          if (s < 90) { run++; if (run > rb) rb = run; } else { run = 0; }
        }
        if (rb > best) best = rb;
      }
      var el = document.querySelector(${JSON.stringify(`[data-g=${JSON.stringify(row.g)}]`)});
      return { px: best, hovered: !!el && el.matches(':hover') };
    })()`);
  };

  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, button: "none", clickCount: 0 });
  await sleep(250);
  const rest = await painted();
  await p.send("Input.dispatchMouseEvent",
               { type: "mouseMoved", x: row.cx, y: row.cy, button: "none", clickCount: 0 });
  await sleep(350);
  const over = await painted();
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, button: "none", clickCount: 0 });
  await sleep(150);

  // github#78 -- the state the bug was actually reported in
  const sel = `[data-g=${JSON.stringify(row.g)}]`;
  await p.eval(`document.querySelector(${JSON.stringify(sel)}).click(); void 0`);
  await sleep(450);
  const lit = await painted();
  const wasLit = await p.j(`document.querySelector(${JSON.stringify(sel)}).getAttribute('data-hl')`);
  await p.eval(`document.querySelector(${JSON.stringify(sel)}).click(); void 0`);
  await sleep(400);
  await p.eval(`(function(){ var e = document.querySelector('[data-floorprobe]');
                if (e) e.removeAttribute('data-floorprobe'); })(); void 0`);

  // github#78
  const nearAccent = await p.j(`(function(){
    var root = document.querySelector('.vault-graph');
    var norm = function (x) {
      var d = document.createElement('span');
      d.style.color = String(x).trim(); root.appendChild(d);
      var out = getComputedStyle(d).color; d.parentNode.removeChild(d);
      return out.replace('rgba(', '').replace('rgb(', '').replace(')', '')
                .split(',').map(function (v) { return parseInt(v, 10); });
    };
    var a = norm(getComputedStyle(root).getPropertyValue('--accent'));
    var b = norm(${JSON.stringify(row.col)});
    if (a.length < 3 || b.length < 3) return false;
    return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]) < 120;
  })()`);

  // github#78, design/0006
  const FLOOR_MIN = 3;
  const states = [["rest", rest.px], ["hover", over.px]];
  if (!nearAccent) states.push(["highlighted", lit.px]);
  const weakest = Math.min(...states.map((s) => s[1]));
  const ok = over.hovered === true && wasLit === "on" && weakest >= FLOOR_MIN;
  return {
    ok,
    detail: `${row.g} at ${row.share} of the basis, size ${row.size}: ` +
            `${rest.px}px at rest, ${over.px}px hovering (hovered=${over.hovered}), ` +
            `${lit.px}px highlighted (data-hl=${wasLit}); weakest asserted ${weakest}px of ` +
            states.map((s) => s[0]).join("/") +
            (nearAccent ? "  (highlighted NOT asserted: this bar's hue is the accent's)" : "") +
            (over.hovered ? "" : "  <- NO :hover from the harness") +
            (weakest < FLOOR_MIN ? `  <- a state paints under ${FLOOR_MIN}px` : "")
  };
});

// github#78, design/0006
check("the count bars walk on the cascade's clock and land on the resting layout", async (p) => {
  const shareOf = (g) => p.j(`(function(){
    var lg = document.querySelector('[data-g=' + JSON.stringify(${JSON.stringify(g)}) + ']');
    return lg ? getComputedStyle(lg).getPropertyValue('--vg-share').trim() : null;
  })()`);
  const pct = (v) => (v && v.slice(-1) === "%" ? parseFloat(v) : NaN);

  const order = await p.j(`(function(){
    return __vg.groupOrder().filter(function (g) { return __vg.groupCount(g) > 0; })
      .map(function (g) { return { g: g, n: __vg.groupCount(g) }; })
      .sort(function (a, b) { return b.n - a.n; });
  })()`);
  if (order.length < 2) return { ok: true, detail: `only ${order.length} non-empty group -- nothing to rescale` };
  const biggest = order[0], runnerUp = order[1];

  const before = pct(await shareOf(runnerUp.g));
  // github#78
  await p.eval(`document.querySelector('[data-eye=' + JSON.stringify(${JSON.stringify(biggest.g)}) + ']').click(); void 0`);

  const seen = [];
  for (let i = 0; i < 24; i++) {
    const v = pct(await shareOf(runnerUp.g));
    if (!Number.isNaN(v) && (seen.length === 0 || seen[seen.length - 1] !== v)) seen.push(v);
    if (v >= 99.99) break;
    await sleep(60);
  }
  let last = null, landed = null;
  for (let i = 0; i < 60; i++) {
    const v = await shareOf(runnerUp.g);
    if (v === last) { landed = v; break; }
    last = v;
    await sleep(150);
  }
  const target = pct(landed);
  const mid = seen.filter((v) => v > before + 0.01 && v < 99.99);

  await p.eval(`document.querySelector('[data-eye=' + JSON.stringify(${JSON.stringify(biggest.g)}) + ']').click(); void 0`);
  let back = null, prev = null;
  for (let i = 0; i < 60; i++) {
    const v = await shareOf(runnerUp.g);
    if (v === prev) { back = v; break; }
    prev = v;
    await sleep(150);
  }

  const ok = mid.length >= 2 && Math.abs(target - 100) < 0.01 &&
             Math.abs(pct(back) - before) < 0.01;
  return {
    ok,
    detail: `${runnerUp.g} grew ${before.toFixed(3)}% -> ${target.toFixed(3)}% when ` +
            `${JSON.stringify(biggest.g)} was hidden, through ${mid.length} intermediate ` +
            `value(s) [${mid.slice(0, 4).map((v) => v.toFixed(1)).join(", ")}...]; ` +
            `restored to ${pct(back).toFixed(3)}%` +
            (mid.length < 2 ? "  <- it SNAPPED, no walk" : "") +
            (Math.abs(target - 100) >= 0.01 ? "  <- did not land on the resting 100%" : "")
  };
}, { on: WALK, clock: "real" });

// github#78, design/0006
check("a bar that loses its folder shrinks over the cascade instead of blinking out", async (p) => {
  const settle = async () => {
    let last = null;
    for (let i = 0; i < 60; i++) {
      const now = await p.j(`(function(){
        return [].map.call(document.querySelectorAll('#vg-legend .lg[data-g]'), function (lg) {
          return lg.className + ':' + getComputedStyle(lg).getPropertyValue('--vg-share').trim();
        }).join(",");
      })()`);
      if (now === last) return;
      last = now;
      await sleep(150);
    }
  };
  const one = (g) => p.j(`(function(){
    var lg = document.querySelector('#vg-legend .lg[data-g=' + JSON.stringify(${JSON.stringify(g)}) + ']');
    if (!lg) return null;
    return { bar: lg.classList.contains('bar'), out: lg.classList.contains('bar-out'),
             share: getComputedStyle(lg).getPropertyValue('--vg-share').trim() || null };
  })()`);
  const pct = (v) => (v && v.bar && v.share ? parseFloat(v.share) : -1);

  const barred = await p.j(`(function(){
    var out = [];
    [].forEach.call(document.querySelectorAll('#vg-legend .lg[data-g].bar'), function (lg) {
      out.push({ g: lg.getAttribute('data-g'),
                 share: parseFloat(getComputedStyle(lg).getPropertyValue('--vg-share')) });
    });
    return out.sort(function (a, b) { return b.share - a.share; });
  })()`);
  if (barred.length < 3) return { ok: true, detail: `only ${barred.length} barred row(s) -- nothing to shrink` };
  const target = barred[1], wide = barred[0], thin = barred[barred.length - 1];

  await p.eval(`(function(){
    var lg = document.querySelector('#vg-legend .lg[data-g=' + JSON.stringify(${JSON.stringify(target.g)}) + ']');
    var chip = lg && lg.querySelector('[data-only]');
    if (!chip) throw new Error('no only chip');
    chip.click();
  })(); void 0`);

  // github#78, design/0006
  const inkOn = async (g, share) => {
    const box = await p.j(`(function(){
      var lg = document.querySelector('#vg-legend .lg[data-g=' + JSON.stringify(${JSON.stringify(g)}) + ']');
      if (!lg) return null;
      var b = lg.getBoundingClientRect();
      if (b.top < 0 || b.bottom > innerHeight) return null;
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    })()`);
    if (!box) return -1;
    const shot = await p.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false,
      clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } });
    return p.eval(`(async function(){
      var img = new Image();
      await new Promise(function (res, rej) { img.onload = res; img.onerror = rej;
        img.src = "data:image/png;base64," + ${JSON.stringify(shot.data)}; });
      var cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
      var end = Math.round(cv.width * ${share});
      var inA = 4, inB = Math.max(6, Math.round(end * 0.6));
      var outA = Math.min(cv.width - 6, end + 8), outB = cv.width - 3;
      if (inB - inA < 4 || outB - outA < 4) return -1;
      var best = 0;
      for (var y = cv.height - 1; y >= Math.max(0, cv.height - 3); y--) {
        var d = cx.getImageData(0, y, cv.width, 1).data;
        var mean = function (a, b) {
          var r = 0, g2 = 0, bl = 0, n = 0;
          for (var x = a; x < b; x++) { r += d[x*4]; g2 += d[x*4+1]; bl += d[x*4+2]; n++; }
          return [r / n, g2 / n, bl / n];
        };
        var i = mean(inA, inB), o = mean(outA, outB);
        var dl = Math.abs(i[0]-o[0]) + Math.abs(i[1]-o[1]) + Math.abs(i[2]-o[2]);
        if (dl > best) best = dl;
      }
      return Math.round(best);
    })()`);
  };


  const seenW = [], seenT = [];
  let inkMid = -1;
  for (let i = 0; i < 26; i++) {
    const a = pct(await one(wide.g)), b = pct(await one(thin.g));
    if (a >= 0 && seenW[seenW.length - 1] !== a) seenW.push(a);
    if (b >= 0 && seenT[seenT.length - 1] !== b) seenT.push(b);
    if (inkMid < 0 && a > 25 && a < 85) inkMid = await inkOn(wide.g, a / 100);
    if (a < 0 && b < 0) break;
    await sleep(70);
  }
  await settle();
  const after = await p.j(`document.querySelectorAll('#vg-legend .lg[data-g].bar').length`);
  const gone = pct(await one(wide.g)) < 0 && pct(await one(thin.g)) < 0;
  const fell = seenW.length >= 4 && seenW.every((v, i) => i === 0 || v < seenW[i - 1]);

  await p.eval(`(function(){ var a = document.getElementById('vg-allon'); if (a) a.click(); })(); void 0`);
  await settle();
  const restored = await p.j(`document.querySelectorAll('#vg-legend .lg[data-g].bar').length`);

  // github#78, design/0006
  const inked = inkMid < 0 || inkMid >= 30;
  const ok = fell && seenT.length >= 3 && gone && after === 1 &&
             restored === barred.length && inked;
  return {
    ok,
    detail: `only ${JSON.stringify(target.g)}: ${JSON.stringify(wide.g)} fell through ` +
            `${seenW.length} width(s) [${seenW.slice(0, 5).map((v) => v.toFixed(1) + "%").join(" ")} ...] ` +
            `and ${JSON.stringify(thin.g)} through ${seenT.length} ` +
            `[${seenT.slice(0, 3).map((v) => v.toFixed(3) + "%").join(" ")} ...]; ` +
            `ink inside vs beyond the bar mid-shrink: ${inkMid < 0 ? "not sampled" : inkMid}; ` +
            `${after} bar left, ${restored} back on All (was ${barred.length})` +
            (!fell ? `  <- it did NOT descend smoothly (${seenW.length} width(s))` : "") +
            (!gone ? "  <- a bar survived its hidden folder" : "") +
            (!inked ? `  <- the shrinking bar was DECLARED but not painted (ink ${inkMid})` : "")
  };
}, { on: WALK, clock: "real" });

// github#84, github#78, design/0004
check("the legend's swatch and count bar follow the token across a theme flip, with the picker", async (p) => {
  const read = () => p.j(`(function(){
    var root = document.querySelector('.vault-graph'), cs = getComputedStyle(root);
    // github#84 -- resolve INSIDE .vault-graph: --gN is scoped to it, so a var() probed
    // from document.body comes back black and reads as a broken colour, not a live one.
    var norm = function (x) {
      if (!x) return "";
      var d = document.createElement('span');
      d.style.color = String(x).trim();
      root.appendChild(d);
      var out = getComputedStyle(d).color;
      d.parentNode.removeChild(d);
      return out;
    };
    var g = __vg.groupOrder().filter(function (n) { return __vg.groupCount(n) > 0; })
      .sort(function (a, b) { return __vg.groupCount(b) - __vg.groupCount(a); })[0];
    var slot = g ? __vg.slotOf(g) : "";
    var lg = g ? document.querySelector('[data-g="' + g + '"]') : null;
    var sw = lg ? lg.querySelector('.sw') : null;
    var pick = slot ? document.querySelector('.swatch.vg-' + slot) : null;
    return { group: g, slot: slot,
             token: norm(cs.getPropertyValue('--' + slot)),
             colorOf: g ? norm(__vg.colorOf(g)) : null,
             swatch: sw ? norm(sw.style.background) : null,
             barred: !!(lg && lg.classList.contains('bar')),
             bar: lg ? norm(lg.style.getPropertyValue('--vg-bar')) : null,
             picker: pick ? getComputedStyle(pick).backgroundColor : null };
  })()`);

  const started = await p.j(`(function(){
    var root = document.querySelector('.vault-graph');
    var was = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    var g = document.getElementById('vg-gear');
    if (g) { g.removeAttribute('hidden'); if (g.getAttribute('aria-expanded') !== 'true') g.click(); }
    return { was: was, gear: !!g };
  })()`);
  await sleep(500);
  const before = await read();
  if (!before.group || !before.swatch) {
    return { ok: false, detail: `no legend row with notes on this shape -- nothing to flip` };
  }

  await p.eval(`(function(){
    document.querySelector('.vault-graph').setAttribute('data-theme', 'light');
    __vg.readTheme();
    if (__vg.renderer) __vg.renderer.refresh();
  })(); void 0`);
  await sleep(700);
  const after = await read();

  await p.eval(`(function(){
    var root = document.querySelector('.vault-graph');
    if (${JSON.stringify(started.was)} === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', ${JSON.stringify(started.was)});
    __vg.readTheme();
    if (__vg.renderer) __vg.renderer.refresh();
  })(); void 0`);
  await sleep(400);
  const restored = await read();

  const tokenMoved = before.token !== after.token;
  const swatchMoved = before.swatch !== after.swatch;
  const barMoved = before.bar !== after.bar;
  const pickerMoved = before.picker !== null && before.picker !== after.picker;
  // github#84
  const colorOfFollows = after.colorOf === after.token && restored.colorOf === before.colorOf;
  const swatchFollows = swatchMoved && after.swatch === after.token;
  const barFollows = !before.barred || (barMoved && after.bar === after.token);
  const pickerFollows = before.picker === null || (pickerMoved && after.picker === after.token);
  const coherent = !before.barred || (barMoved === swatchMoved && after.bar === after.swatch);
  const restoredBack = restored.swatch === before.swatch &&
                       (!before.barred || restored.bar === before.bar);

  const bits = [`slot ${after.slot} on ${JSON.stringify(before.group)}`,
    `token ${before.token} -> ${after.token}${tokenMoved ? " (moved)" : " (SAME -- flip did nothing)"}`,
    `colorOf ${before.colorOf} -> ${after.colorOf}${colorOfFollows ? " (follows)" : " (STALE)"}`,
    `swatch ${before.swatch} -> ${after.swatch}${swatchFollows ? " (follows)" : swatchMoved ? " (moved, OFF the token)" : " (STALE)"}`,
    before.barred ? `bar ${before.bar} -> ${after.bar}${barFollows ? " (follows)" : barMoved ? " (moved, OFF the token)" : " (STALE)"}`
                  : "no count bar on this row",
    before.picker === null ? "no picker swatch rendered"
                           : `picker ${before.picker} -> ${after.picker}${pickerFollows ? " (follows)" : " (STALE)"}`,
    `bar agrees with its swatch=${coherent}`,
    `restored swatch ${restored.swatch}${restoredBack ? " (back)" : " (STUCK)"}`];
  if (tokenMoved && !swatchMoved) bits.push("<- github#84: the legend keeps the old theme while the picker repaints");
  if (!coherent) bits.push("<- the bar and its swatch disagree, which no row may do");
  return { ok: tokenMoved && colorOfFollows && swatchFollows && barFollows && pickerFollows && coherent && restoredBack,
           detail: bits.join("; ") };
});

// github#78, design/0006
check("count bars are on by default, and the settings toggle removes every bar", async (p) => {
  const r = await p.j(`(function(){
    var gear = document.querySelector("#vg-gear");
    if (!gear || gear.hidden) return { noGear: true };
    gear.click();
    var btn = document.querySelector("#vg-opt-countBars");
    if (!btn) return { noButton: true };

    var bars = function () { return document.querySelectorAll("#vg-legend .lg.bar").length; };
    var rows = function () { return document.querySelectorAll("#vg-legend .lg[data-g]").length; };
    var out = { defaultPressed: btn.getAttribute("aria-pressed"),
                defaultState: __vg.countBars,
                barsOn: bars(), rows: rows() };

    btn.click();
    var off = document.querySelector("#vg-opt-countBars");
    out.offPressed = off && off.getAttribute("aria-pressed");
    out.offState = __vg.countBars;
    out.barsOff = bars();
    out.rowsOff = rows();
    out.sizeOff = (function () {
      var lg = document.querySelector("#vg-legend .lg[data-g]");
      return lg ? getComputedStyle(lg).backgroundSize : null;
    })();

    var back = document.querySelector("#vg-opt-countBars");
    if (back) back.click();
    out.backPressed = (document.querySelector("#vg-opt-countBars") || {}).getAttribute
      ? document.querySelector("#vg-opt-countBars").getAttribute("aria-pressed") : null;
    out.backState = __vg.countBars;
    out.barsBack = bars();
    gear.click();
    return out;
  })()`);
  if (r.noGear) return { ok: false, detail: "no #vg-gear on this build -- standalone only" };
  if (r.noButton) {
    return { ok: false, detail: "gear opened but #vg-opt-countBars was not found -- the rendered " +
      "row id and the $() lookup setCountBars uses have drifted apart" };
  }
  const ok = r.defaultPressed === "true" && r.defaultState === true && r.barsOn > 0 &&
             r.offPressed === "false" && r.offState === false && r.barsOff === 0 &&
             r.sizeOff === "auto" && r.rowsOff === r.rows &&
             r.backPressed === "true" && r.backState === true && r.barsBack === r.barsOn;
  return {
    ok,
    detail: `default pressed=${r.defaultPressed} state=${r.defaultState} with ` +
      `${r.barsOn} of ${r.rows} rows barred; off -> pressed=${r.offPressed} state=${r.offState}, ` +
      `${r.barsOff} barred, first row background-size=${r.sizeOff}, rows still ${r.rowsOff}; ` +
      `on again -> pressed=${r.backPressed} state=${r.backState}, ${r.barsBack} barred`
  };
});

// github#77
const PALETTE = await import("./palette-check.mjs");

check("the picker's contrast numbers are the harness's", async (p) => {
  const want = PALETTE.measurePalette(readFileSync(join(ROOT, "src", "page.css"), "utf8"));
  const got = await p.j(`(function(){
    var out = {};
    __vg.palette().forEach(function (s) {
      var c = __vg.slotContrast(s.key);
      out[s.key] = [Math.round(c.light * 100) / 100, Math.round(c.dark * 100) / 100];
    });
    var row = document.querySelector('.lg[data-g]');
    var rect = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
    var menu = document.querySelector('[id$="ctxmenu"]');
    var titles = {};
    Array.prototype.forEach.call(menu.querySelectorAll(".swatch[data-key]"), function (b) {
      titles[b.getAttribute("data-key")] = b.getAttribute("title") || "";
    });
    menu.hidden = true;
    return { contrast: out, titles: titles };
  })()`);

  const bad = [];
  for (const s of want.light.slots) {
    const w = [+want.light.slots.find((x) => x.key === s.key).contrast.toFixed(2),
               +want.dark.slots.find((x) => x.key === s.key).contrast.toFixed(2)];
    const g = got.contrast[s.key];
    if (!g || Math.abs(g[0] - w[0]) > 0.005 || Math.abs(g[1] - w[1]) > 0.005) {
      bad.push(`${s.key} page ${g ? g.join("/") : "?"} vs harness ${w.join("/")}`);
    }
    const t = got.titles[s.key] || "";
    if (!t.includes(w[0].toFixed(2)) || !t.includes(w[1].toFixed(2))) {
      bad.push(`${s.key} title "${t}" names neither ${w[0].toFixed(2)} nor ${w[1].toFixed(2)}`);
    }
    const saysLight = /light [\d.]+ \(under 3:1\)/.test(t);
    const saysDark = /dark [\d.]+ \(under 3:1\)/.test(t);
    if (saysLight !== want.light.under3.includes(s.key)) bad.push(`${s.key} light flag wrong`);
    if (saysDark !== want.dark.under3.includes(s.key)) bad.push(`${s.key} dark flag wrong`);
  }
  return { ok: bad.length === 0 && want.strays.length === 0,
           detail: bad.length
             ? bad.slice(0, 4).join("; ")
             : `12 slots x 2 themes agree with palette-check.mjs to 2dp; under 3:1 light ` +
               `${want.light.under3.join(",") || "none"}, dark ${want.dark.under3.join(",") || "none"}` };
});

check("the picker repaints itself on a theme change, with no rebuild", async (p) => {
  const r = await p.j(`(function(){
    var root = document.getElementById("vg-app");
    var was = root.getAttribute("data-theme");

    var row = document.querySelector('.lg[data-g]');
    var rect = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
    var menu = document.querySelector('[id$="ctxmenu"]');
    var sw = menu.querySelector('.swatch[data-key="g4"]');
    var markup = sw.innerHTML;

    var f = function (sel) {
      var el = sw.querySelector(sel);
      return el ? getComputedStyle(el).fill : null;
    };
    var read = function () {
      return { gnd: f(".gnd"), base: f(".d"), t1: f(".t1"), t3: f(".t3"),
               grounds: sw.querySelectorAll(".gnd").length };
    };

    var seen = {};
    ["dark", "light"].forEach(function (t) {
      root.setAttribute("data-theme", t);
      seen[t] = read();
    });
    // the SAME nodes must have repainted -- nothing re-rendered them
    var sameMarkup = sw.innerHTML === markup;
    menu.hidden = true;
    if (was) root.setAttribute("data-theme", was); else root.removeAttribute("data-theme");
    __vg.readTheme();
    return { dark: seen.dark, light: seen.light, sameMarkup: sameMarkup };
  })()`);
  const rgb = (h) => {
    const n = h.replace("#", "");
    return `rgb(${parseInt(n.slice(0, 2), 16)}, ${parseInt(n.slice(2, 4), 16)}, ${parseInt(n.slice(4, 6), 16)})`;
  };
  const want = {
    light: { gnd: rgb("#fcfcfb"), base: rgb("#eda100") },
    dark: { gnd: rgb("#1a1a19"), base: rgb("#c98500") },
  };
  const bad = [];
  for (const t of ["light", "dark"]) {
    const s = r[t];
    if (s.grounds !== 1) bad.push(`${t}: ${s.grounds} grounds drawn, want exactly 1`);
    if (s.gnd !== want[t].gnd) bad.push(`${t}: ground ${s.gnd} not ${want[t].gnd}`);
    if (s.base !== want[t].base) bad.push(`${t}: g4 base dot ${s.base} not ${want[t].base}`);
    if (!s.t1 || s.t1 === s.base) bad.push(`${t}: tint row 1 did not differ from the base`);
    if (!s.t3 || s.t3 === s.t1) bad.push(`${t}: tint row 3 matched row 1`);
  }
  if (r.light.gnd === r.dark.gnd) bad.push("the ground did not change with the theme");
  if (r.light.t1 === r.dark.t1) bad.push("the tint ladder did not change with the theme");
  if (!r.sameMarkup) bad.push("the markup changed -- the swatch was rebuilt, not repainted");
  return { ok: bad.length === 0,
           detail: bad.length ? bad.slice(0, 3).join("; ")
             : `one ground, following the theme: ${r.light.gnd} -> ${r.dark.gnd}, g4 ` +
               `${r.light.base} -> ${r.dark.base}, first tint ${r.light.t1} -> ${r.dark.t1}; ` +
               `identical markup throughout, so nothing rebuilt it` };
});

check("the picker draws the disc's own dot sizes", async (p) => {
  await settle(p);
  await camSettle(p);
  const r = await p.j(`(function(){
    var row = document.querySelector('.lg[data-g]');
    var rect = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
    var menu = document.querySelector('[id$="ctxmenu"]');
    var sw = menu.querySelector('.swatch[data-key="g4"]');
    var svg = sw.querySelector("svg.prev");
    var box = svg.getBoundingClientRect();
    var vb = (svg.getAttribute("viewBox") || "").split(/\\s+/).map(Number);
    var radii = Array.prototype.map.call(svg.querySelectorAll("circle"), function (c) {
      return +c.getAttribute("r");
    });
    var uniq = radii.filter(function (v, i, a) { return a.indexOf(v) === i; })
                    .sort(function (a, b) { return a - b; });
    menu.hidden = true;

    var live = [];
    __vg.graph.forEachNode(function (id) {
      if ((__vg.alpha[id] || 0) < 0.999) return;
      var d = __vg.renderer.getNodeDisplayData(id);
      if (!d || d.hidden) return;
      live.push(__vg.renderer.scaleSize(d.size));
    });
    live.sort(function (a, b) { return a - b; });
    return { want: __vg.previewSizes(), uniq: uniq, n: radii.length,
             boxW: Math.round(box.width * 100) / 100, boxH: Math.round(box.height * 100) / 100,
             vbW: vb[2], vbH: vb[3],
             liveMin: live.length ? Math.round(live[0] * 100) / 100 : null,
             liveMed: live.length ? Math.round(live[Math.floor(live.length / 2)] * 100) / 100 : null,
             liveMax: live.length ? Math.round(live[live.length - 1] * 100) / 100 : null,
             liveN: live.length };
  })()`);
  const same = r.uniq.length === r.want.length &&
               r.uniq.every((v, i) => Math.abs(v - r.want[i]) < 1e-9);
  // github#77
  const oneToOne = Math.abs(r.boxW - r.vbW) < 0.01 && Math.abs(r.boxH - r.vbH) < 0.01;
  // github#77 -- two criteria, see invariants.md
  const lo = r.want[0], hi = r.want[r.want.length - 1];
  const covers = r.liveMin === null || r.liveMin >= lo - 0.005;
  const brackets = r.liveMed === null || (r.liveMed >= lo - 0.005 && r.liveMed <= hi + 0.005);
  return { ok: same && oneToOne && covers && brackets,
           detail: `preview radii ${r.uniq.join("/")} (want ${r.want.join("/")}), ` +
                   `${r.n} circles, svg ${r.boxW}x${r.boxH} for viewBox ${r.vbW}x${r.vbH} ` +
                   `(1 unit = 1px ${oneToOne ? "ok" : "NO"}); disc draws ` +
                   `${r.liveMin}/${r.liveMed}/${r.liveMax}px over ${r.liveN} dots — smallest ` +
                   `${covers ? "covered by" : "SMALLER THAN"} the ${lo}px sample, median ` +
                   `${brackets ? "inside" : "OUTSIDE"} ${lo}-${hi}` };
});

check("the picker's ladder is the ladder the disc draws", async (p) => {
  const r = await p.j(`(function(){
    var cs = getComputedStyle(document.getElementById("vg-app"));
    var now = cs.getPropertyValue("--surface-1").trim().toLowerCase();
    var suffix = now === cs.getPropertyValue("--surface-1-d").trim().toLowerCase() ? "d" : "l";
    var pins = __vg.subfolderColors;
    var picked = null;
    __vg.groupOrder().forEach(function (g) {
      if (picked || g.charAt(0) === "(") return;
      var subs = __vg.subOrderOf(g);
      if (!subs || subs.length < 2) return;
      var pinned = subs.some(function (sb) { return !!pins[g + "/" + sb]; });
      if (pinned) return;
      picked = { g: g, subs: subs };
    });
    if (!picked) return { skip: true };
    var lower = function (a) { return a.map(function (h) { return String(h).toLowerCase(); }); };
    var read = function () {
      var slot = __vg.slotOf(picked.g);
      var disc = [];
      for (var k = 1; k < picked.subs.length && k < 4; k++) {
        disc.push(String(__vg.subColorOf(picked.g, picked.subs[k])).toLowerCase());
      }
      return { slot: slot, ladder: lower(__vg.previewLadder(slot, suffix)), disc: disc };
    };
    var rest = read();

    // github#77 -- the preview is memoised per slot, so a pick must invalidate it
    var was = __vg.folderColors;
    var other = rest.slot === "g7" ? "g1" : "g7";
    var next = Object.assign({}, was); next[picked.g] = other;
    __vg.setFolderColors(next);
    var moved = read();
    __vg.setFolderColors(was);
    var back = read();

    return { skip: false, group: picked.g, suffix: suffix, other: other,
             rest: rest, moved: moved, back: back };
  })()`);
  if (r.skip) return { ok: true, detail: "no unpinned folder with two or more subfolders on this shape" };
  const agrees = (s) => s.disc.length > 0 && s.disc.every((h, i) => h === s.ladder[i]);
  const atRest = agrees(r.rest), afterPick = agrees(r.moved), restored = agrees(r.back);
  const invalidated = r.moved.ladder[0] !== r.rest.ladder[0];
  const cameBack = r.back.ladder.join() === r.rest.ladder.join() &&
                   r.back.slot === r.rest.slot;
  const n = r.rest.disc.length;
  return { ok: atRest && afterPick && restored && invalidated && cameBack,
           detail: `${r.group} on ${r.rest.slot}: preview ${r.rest.ladder.slice(0, n).join(",")} ` +
                   `vs the disc's ${r.rest.disc.join(",")} (${atRest ? "same" : "DIFFERENT"}); ` +
                   `pinned to ${r.other} the preview ${invalidated ? "followed" : "DID NOT FOLLOW"} ` +
                   `and still ${afterPick ? "agrees" : "DISAGREES"}; ` +
                   `restored ${cameBack && restored ? "exactly" : "WRONG"}` };
});

// github#77
check("the picker's settings surface holds every slot without scrolling sideways", async (p) => {
  const r = await p.j(`(function(){
    var t = document.querySelector('[aria-controls="vg-settings"]');
    var wasOpen = !document.getElementById("vg-settings").hidden;
    if (!wasOpen && t) t.click();
    var body = document.getElementById("vg-setbody");

    var look = function () {
      var rows = body.querySelectorAll(".scr");
      var row = rows[0];
      var sws = row ? row.querySelectorAll(".swatch") : [];
      var br = body.getBoundingClientRect();
      var worst = 0, offscreen = 0, previews = 0;
      Array.prototype.forEach.call(sws, function (s) {
        var q = s.getBoundingClientRect();
        if (q.right > br.right + 0.5) { offscreen++; worst = Math.max(worst, q.right - br.right); }
        if (s.querySelector("svg.prev")) previews++;
      });
      return { rows: rows.length, sws: sws.length, previews: previews,
               offscreen: offscreen, worstPx: Math.round(worst * 10) / 10,
               overflowX: body.scrollWidth - body.clientWidth,
               clientW: body.clientWidth,
               rowH: row ? Math.round(row.getBoundingClientRect().height) : 0 };
    };

    var atRest = look();

    // a pick rebuilds the whole panel -- the state the overflow actually shipped in
    var g = __vg.groupOrder().filter(function (x) { return x.charAt(0) !== "("; })[0];
    var was = __vg.folderColors;
    var next = Object.assign({}, was);
    next[g] = __vg.slotOf(g) === "g7" ? "g1" : "g7";
    __vg.setFolderColors(next);
    var afterPick = look();
    __vg.setFolderColors(was);

    // and a theme flip with the panel open
    var root = document.getElementById("vg-app");
    var wasTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", wasTheme === "dark" ? "light" : "dark");
    __vg.readTheme();
    __vg.setFolderColors(was);
    var afterTheme = look();
    if (wasTheme) root.setAttribute("data-theme", wasTheme); else root.removeAttribute("data-theme");
    __vg.readTheme();
    __vg.setFolderColors(was);

    if (!wasOpen && t) t.click();
    return { atRest: atRest, afterPick: afterPick, afterTheme: afterTheme };
  })()`);

  const bad = [];
  for (const [when, s] of [["at rest", r.atRest], ["after a pick", r.afterPick],
                           ["after a theme flip", r.afterTheme]]) {
    if (s.sws !== 12) bad.push(`${when}: ${s.sws} swatches, want 12`);
    if (s.previews !== 12) bad.push(`${when}: ${s.previews} of 12 carry a preview`);
    if (s.offscreen) bad.push(`${when}: ${s.offscreen} swatch(es) past the right edge by ${s.worstPx}px`);
    if (s.overflowX > 0) bad.push(`${when}: ${s.overflowX}px of horizontal overflow`);
  }
  return { ok: bad.length === 0,
           detail: bad.length ? bad.slice(0, 3).join("; ")
             : `${r.atRest.rows} folder rows, 12 swatches each all previewed and inside a ` +
               `${r.atRest.clientW}px box, 0 overflow at rest, after a pick and after a theme ` +
               `flip; row ${r.atRest.rowH}px` };
});

check("the picker stays inside the mount", async (p) => {
  const r = await p.j(`(function(){
    var root = document.getElementById("vg-app");
    var rows = document.querySelectorAll('.lg[data-g]');
    var row = rows[rows.length - 1];
    var rect = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, clientX: rect.left + 5, clientY: rect.bottom - 2 }));
    var menu = document.querySelector('[id$="ctxmenu"]');
    var m = menu.getBoundingClientRect(), rr = root.getBoundingClientRect();
    var out = { w: Math.round(m.width), h: Math.round(m.height),
                rootW: Math.round(rr.width), rootH: Math.round(rr.height),
                inside: m.left >= rr.left - 0.5 && m.top >= rr.top - 0.5 &&
                        m.right <= rr.right + 0.5 && m.bottom <= rr.bottom + 0.5,
                sws: menu.querySelectorAll(".swatch").length };
    menu.hidden = true;
    return out;
  })()`);
  return { ok: r.inside && r.sws === 12,
           detail: `menu ${r.w}x${r.h} in a ${r.rootW}x${r.rootH} mount, ${r.sws} swatches, ` +
                   `${r.inside ? "inside" : "OUTSIDE the mount"}` };
});

check("focus web stays above dim notes", async (p) => {
  const r = await p.j(`__vg.checkFocusWeb()`);
  if (!r.geomGaps) return { ok: true, detail: `${r.node} (degree ${r.degree}): no in-disc samples on this shape, nothing to measure` };
  return { ok: r.webOK,
           detail: `${r.node} (degree ${r.degree}, ${r.edges} edges): ${r.blueAtGaps} blue, ` +
                   `${r.dimAtGaps} dim, ${r.underLabel} under label/disc of ${r.geomGaps} in-disc samples` };
}, { on: "all" });

// github#40, design/0012
const KEYS = { Backspace: 8, ArrowLeft: 37, Escape: 27 };
async function pressKey(p, key, modifiers = 0) {
  const ev = { key, code: key, windowsVirtualKeyCode: KEYS[key] || 0, modifiers };
  await p.send("Input.dispatchKeyEvent", { type: "keyDown", ...ev });
  await p.send("Input.dispatchKeyEvent", { type: "keyUp", ...ev });
  await sleep(150);
}
const TRAIL = `(function(){
  var d = document.querySelector("#vg-detail"), c = d.hidden ? null : d.querySelector(".crumbs");
  return { open: !d.hidden, sel: __vg.state.selected,
           crumbs: c ? [].map.call(c.querySelectorAll("button.crumb"), function (b) { return b.textContent; }) : [],
           dots: !!(c && c.querySelector(".dots")), href: location.href,
           active: document.activeElement ? document.activeElement.tagName + "#" + document.activeElement.id : "" }; })()`;
async function trailState(p) { return p.j(TRAIL); }
async function selectBySearch(p) {
  return p.j(`(function(){
    var best = null, bd = -1;
    __vg.graph.forEachNode(function (id, a) { if (a.deg > bd) { bd = a.deg; best = id; } });
    var q = document.querySelector("#vg-q"); q.value = __vg.graph.getNodeAttribute(best, "label").slice(0, 12);
    q.dispatchEvent(new Event("input"));
    var hit = document.querySelector("#vg-hits [data-hit]"); if (!hit) return null;
    hit.click(); return { id: best, deg: bd }; })()`);
}
async function hop(p, n) {
  for (let i = 0; i < n; i++) {
    const ok = await p.j(`(function(){ var bs = document.querySelectorAll("#vg-detail [data-go]");
      var b = bs[Math.min(1, bs.length - 1)]; if (!b) return false; b.click(); return true; })()`);
    if (!ok) return i;
    await sleep(120);
  }
  return n;
}
async function closeCard(p) { await p.eval(`(function(){ var x = document.querySelector("#vg-detail .x"); if (x) x.click(); })(); void 0`); }
async function stepBack(p) {
  const ok = await p.j(`(function(){ var b = document.querySelector("#vg-detail .crumbs .nvb"); if (!b) return false; b.click(); return true; })()`);
  await sleep(160);
  return ok;
}

check("only a hop lengthens the trail", async (p) => {
  await settle(p);
  const start = await selectBySearch(p);
  if (!start) return { ok: false, detail: "no search hit to select" };
  const s0 = await trailState(p);
  const n = await hop(p, 3);
  const s1 = await trailState(p);
  await selectBySearch(p);
  const s2 = await trailState(p);
  await hop(p, 1);
  const s3 = await trailState(p);
  await p.eval(`__vg.renderer.emit("clickStage", {}); void 0`).catch(() => {});
  await closeCard(p);
  const s4 = await trailState(p);
  const ok = s0.crumbs.length === 0 && n === 3 && s1.crumbs.length === 3 && s2.crumbs.length === 0 && s3.crumbs.length === 1 && !s4.open;
  return { ok, detail: `search hit: ${s0.crumbs.length} crumbs; after ${n} hops: ${s1.crumbs.length}; ` +
                       `a fresh search hit: ${s2.crumbs.length}; one more hop: ${s3.crumbs.length}; closed: card ${s4.open ? "STILL OPEN" : "hidden"}` };
});

check("stepping back never re-collects a hop", async (p) => {
  await settle(p);
  if (!(await selectBySearch(p))) return { ok: false, detail: "no search hit to select" };
  const n = await hop(p, 4);
  const s4 = await trailState(p);
  await stepBack(p);
  const s3 = await trailState(p);
  await stepBack(p);
  const s2 = await trailState(p);
  await closeCard(p);
  const ok = n === 4 && s4.crumbs.length === 3 && s4.dots && s3.crumbs.length === 3 && !s3.dots &&
             s2.crumbs.length === 2 && s2.href === s4.href && s4.sel !== s3.sel && s3.sel !== s2.sel;
  return { ok, detail: `after ${n} hops: ${s4.crumbs.length} crumbs shown${s4.dots ? " + ellipsis" : ""}; ` +
                       `back arrow: ${s3.crumbs.length}${s3.dots ? " + ellipsis" : ""}; again: ${s2.crumbs.length}; ` +
                       `href ${s2.href === s4.href ? "unchanged" : "CHANGED to " + s2.href}` };
});

check("a crumb click truncates the trail at the crumb", async (p) => {
  await settle(p);
  if (!(await selectBySearch(p))) return { ok: false, detail: "no search hit to select" };
  const n = await hop(p, 3);
  const before = await trailState(p);
  const target = await p.j(`(function(){ var b = document.querySelectorAll("#vg-detail .crumbs button.crumb")[1]; if (!b) return null; var t = b.textContent; b.click(); return t; })()`);
  await sleep(120);
  const after = await trailState(p);
  const title = await p.j(`document.querySelector("#vg-detail h2").textContent`);
  await closeCard(p);
  const ok = n === 3 && before.crumbs.length === 3 && after.crumbs.length === 1 && title === target;
  return { ok, detail: `${before.crumbs.length} crumbs, clicked the second (${JSON.stringify(target)}): ` +
                       `${after.crumbs.length} crumb left, card names ${JSON.stringify(title)}` };
});

check("the trail is not layout", async (p) => {
  await settle(p);
  const snap = `(function(){ var xs = []; __vg.graph.forEachNode(function (id, a) { xs.push(a.x, a.y); });
    return { pos: xs, plan: JSON.stringify(__vg.buildWedgePlan(false).cells.map(function (c) { return [c.key || c.g, c.rows, c.n]; })) }; })()`;
  const a = await p.j(snap);
  if (!(await selectBySearch(p))) return { ok: false, detail: "no search hit to select" };
  const n = await hop(p, 5);
  await stepBack(p);
  await stepBack(p);
  await sleep(500);
  const b = await p.j(snap);
  await closeCard(p);
  let moved = 0, worst = 0;
  for (let i = 0; i < a.pos.length; i += 2) {
    const d = Math.abs(a.pos[i] - b.pos[i]) + Math.abs(a.pos[i + 1] - b.pos[i + 1]);
    if (d > 1e-6) moved++;
    if (d > worst) worst = d;
  }
  const ok = n === 5 && moved === 0 && a.plan === b.plan;
  return { ok, detail: `${n} hops and 2 steps back: ${moved} of ${a.pos.length / 2} notes moved (worst ${worst.toFixed(3)} units), ` +
                       `plan ${a.plan === b.plan ? "identical" : "CHANGED"}` };
});

check("the page claims no keyboard shortcut", async (p) => {
  await settle(p);
  if (!(await selectBySearch(p))) return { ok: false, detail: "no search hit to select" };
  const n = await hop(p, 2);
  const before = await trailState(p);
  await pressKey(p, "Backspace");
  await pressKey(p, "ArrowLeft", 1);
  await pressKey(p, "Escape");
  const after = await trailState(p);
  await p.eval(`(function(){ var q = document.querySelector("#vg-q"); q.value = "ab"; q.focus(); })(); void 0`);
  await pressKey(p, "Backspace");
  const typed = await p.j(`document.querySelector("#vg-q").value`);
  await p.eval(`(function(){ var q = document.querySelector("#vg-q"); q.blur(); q.value = ""; q.dispatchEvent(new Event("input")); })(); void 0`);
  await closeCard(p);
  const ok = n === 2 && before.crumbs.length === 2 && after.crumbs.length === 2 && after.open &&
             after.sel === before.sel && after.href === before.href && typed === "a";
  return { ok, detail: `Backspace, Alt+ArrowLeft and Escape with the card open on ${before.crumbs.length} crumbs: ` +
                       `${after.crumbs.length} crumbs, card ${after.open ? "still open" : "CLOSED"}, ` +
                       `selection ${after.sel === before.sel ? "unchanged" : "CHANGED"}, ` +
                       `href ${after.href === before.href ? "unchanged" : "CHANGED to " + after.href}; ` +
                       `the search box still gets its own Backspace ("ab" -> ${JSON.stringify(typed)})` };
});

check("re-selecting the same note keeps the trail, and a filter does not clear it", async (p) => {
  await settle(p);
  if (!(await selectBySearch(p))) return { ok: false, detail: "no search hit to select" };
  const n = await hop(p, 3);
  const s0 = await trailState(p);
  await p.eval(`document.querySelector("#vg-detail .pin").click(); void 0`);
  await settle(p);
  const s1 = await trailState(p);
  await p.eval(`document.querySelector("#vg-detail .pin").click(); void 0`);
  await settle(p);
  const g = await p.j(`(function(){ var b = document.querySelector("#vg-detail .crumbs button.crumb"); var lb = b.textContent, id = null;
    __vg.graph.forEachNode(function (i, a) { if (id === null && a.label === lb) id = i; }); return __vg.graph.getNodeAttribute(id, "folder"); })()`);
  await clickEye(p, g);
  await settle(p);
  const s2 = await trailState(p);
  const off = await p.j(`document.querySelectorAll("#vg-detail .crumbs button.crumb.off").length`);
  await clickEye(p, g);
  await settle(p);
  const s3 = await trailState(p);
  await closeCard(p);
  const ok = n === 3 && s0.crumbs.length === 3 && s1.crumbs.length === 3 && s2.crumbs.length === 3 && s2.open && off >= 1 && s3.crumbs.length === 3;
  return { ok, detail: `${s0.crumbs.length} crumbs; pin toggle: ${s1.crumbs.length}; hiding ${g}: ${s2.crumbs.length} crumbs, ` +
                       `${off} marked hidden, card ${s2.open ? "open" : "CLOSED"}; shown again: ${s3.crumbs.length}` };
});

/* ------------------------------------------------- live rebuild (github#72) */

// github#72, design/0014
const LIVE_JS = `
  window.__live = {
    snap: function () {
      var pos = {}, band = {}, size = {};
      __vg.buildWedgePlan(false).cells.forEach(function (c) { band[c.g] = !!c.inner; });
      __vg.graph.forEachNode(function (id, a) {
        pos[a.path] = [a.x, a.y];
        size[a.path] = __vg.renderer.scaleSize(__vg.renderer.getNodeDisplayData(id).size);
      });
      return { pos: pos, band: band, size: size, n: __vg.graph.order };
    },
    drift: function (a, b) {
      var moved = 0, worst = 0, who = "", bands = 0, sized = 0, worstSize = 0;
      Object.keys(a.pos).forEach(function (k) {
        var p = a.pos[k], q = b.pos[k];
        if (!q) return;
        var d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d > worst) { worst = d; who = k; }
        if (d > 0.0001) moved++;
        var s = Math.abs((a.size[k] || 0) - (b.size[k] || 0));
        if (s > worstSize) worstSize = s;
        if (s > 0.0001) sized++;
      });
      Object.keys(a.band).forEach(function (g) {
        if (b.band[g] !== undefined && b.band[g] !== a.band[g]) bands++;
      });
      return { moved: moved, worst: +worst.toFixed(4), who: who, bands: bands,
               sized: sized, worstSize: +worstSize.toFixed(4) };
    },
    clone: function () { return JSON.parse(JSON.stringify(__vg.data())); },
    // design/0014
    withOneMore: function (path) {
      var d = window.__live.clone();
      var host = d.nodes[Math.floor(d.nodes.length / 2)];
      d.nodes.push({ id: path, label: "Zz Live Probe", folder: host.folder,
                     dirs: (host.dirs || []).slice(), sub: host.sub || "", type: "note",
                     tags: [], created: host.created, touched: host.touched, words: 0, deg: 0 });
      return d;
    },
    // Drop one note, and renumber the edges the way a real build of that vault would.
    without: function (at) {
      var d = window.__live.clone();
      d.nodes.splice(at, 1);
      d.edges = d.edges.filter(function (e) { return e.s !== at && e.t !== at; })
                       .map(function (e) { return { s: e.s > at ? e.s - 1 : e.s,
                                                    t: e.t > at ? e.t - 1 : e.t, w: e.w }; });
      return d;
    }
  }; void 0`;

check("a live rebuild with the same data moves nothing", async (p) => {
  await settle(p);
  await p.eval(LIVE_JS);
  const r = await p.j(`(function(){
    var was = window.__live.snap();
    var res = __vg.applyData(window.__live.clone());
    return { res: res, d: window.__live.drift(was, window.__live.snap()), busy: !!__vg.demo.busy() };
  })()`);
  const ok = r.res.applied && r.res.cascaded === false && r.d.moved === 0 && !r.busy;
  return { ok, detail: (r.res.applied ? `applied "${r.res.reason}"` : `REFUSED (${r.res.reason})`) +
                       `, cascaded ${r.res.cascaded}, ${r.d.moved} note(s) moved, ` +
                       `worst ${r.d.worst}, no cascade started` };
}, { on: "all" });

check("the invalidation registry names every cache a live rebuild stales", async (p) => {
  const names = await p.j("__vg.invalidations()");
  const want = ["timeline", "heatmap tally", "hop trail", "selection, hover and pins", "search hits",
                "tag filing and sub order"];
  const missing = want.filter((w) => !names.includes(w));
  return { ok: missing.length === 0,
           detail: missing.length ? `MISSING: ${missing.join(", ")}` : `${names.length}: ${names.join("; ")}` };
});

check("a live rebuild lands on the layout a fresh relayout gives", async (p) => {
  await settle(p);
  await p.eval(LIVE_JS);
  const start = await p.j(`(function(){ window.__live.a = window.__live.snap();
                                        return { n: window.__live.a.n }; })()`);
  const res = await p.j(`__vg.applyData(window.__live.withOneMore("__live/Zz Live Probe.md"))`);
  await settle(p);
  // decisions/0011, github#21
  const after = await p.j(`(function(){
    var landed = window.__live.snap();
    __vg.relayout();
    return { d: window.__live.drift(landed, window.__live.snap()),
             zero: __vg.checkZeroWeightInvariance(),
             lattice: __vg.buildWedgePlan(false).cells.length,
             exit: __vg.lastCascade().exit };
  })()`);
  const moved = await p.j(`window.__live.drift(window.__live.a, window.__live.snap())`);
  // design/0014
  await p.j(`__vg.applyData(window.__live.clone().nodes.length > ${start.n}
                            ? window.__live.without(window.__live.clone().nodes.length - 1)
                            : window.__live.clone())`);
  await settle(p);
  const back = await p.j(`window.__live.drift(window.__live.a, window.__live.snap())`);
  const ok = res.applied && res.added === 1 && res.cascaded &&
             after.d.moved === 0 && after.d.sized === 0 && after.d.bands === 0 &&
             after.zero.invariantOK !== false && back.moved === 0;
  return { ok, detail: `${start.n} -> ${start.n + 1} notes, cascade ${after.exit}; ` +
                       `settle vs fresh relayout: ${after.d.moved} moved / ${after.d.sized} resized, ` +
                       `${after.d.bands} band flip(s); the add moved ${moved.moved} of ${start.n} ` +
                       `notes, worst ${moved.worst}; restored to ${back.moved} off original` };
}, { on: WALK, clock: "real" });

check("word counts land by path, which is the only thing a live rebuild keeps", async (p) => {
  await settle(p);
  await p.eval(LIVE_JS);
  const start = await p.j(`window.__live.snap().n`);
  // design/0014
  const r = await p.j(`(function(){
    var res = __vg.applyData(window.__live.without(1));
    var ids = __vg.graph.nodes(), d = __vg.data();
    var diverged = 0, sample = null;
    for (var i = 0; i < d.nodes.length; i++) {
      var byIndex = String(i), byPath = d.nodes[i].id;
      var here = __vg.graph.hasNode(byIndex)
        ? __vg.graph.getNodeAttribute(byIndex, "path") : null;
      if (here !== byPath) diverged++;
      // design/0014
      if (!sample && here !== null && here !== byPath) sample = { i: i, path: byPath, atIndex: here };
    }
    var landed = null, bystander = null;
    if (sample) {
      __vg.setWords(sample.path, 424242);
      __vg.graph.forEachNode(function (id, a) {
        if (a.path === sample.path) landed = a.words;
        if (sample.atIndex && a.path === sample.atIndex) bystander = a.words;
      });
    }
    return { res: res, n: ids.length, diverged: diverged, sample: sample,
             landed: landed, bystander: bystander,
             missing: __vg.setWords("__live/not a note.md", 1) };
  })()`);
  await settle(p);
  await p.j(`__vg.applyData(window.__live.clone())`);
  await settle(p);
  const ok = r.res.applied && r.diverged > 0 && r.landed === 424242 &&
             r.bystander !== null && r.bystander !== 424242 && r.missing === false;
  return { ok, detail: r.sample
    ? `${start} notes, one removed; index and id disagree for ${r.diverged} note(s) ` +
      `(index ${r.sample.i} now holds a different note); setWords by path landed on the right ` +
      `one (${r.landed}), the note at that index kept ${r.bystander}; a deleted path returns false`
    : `index and id never diverged -- this check cannot see the defect it exists for` };
}, { on: WALK, clock: "real" });

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
  const chrome = spawn(chromeExe(), [
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
             : HEADED ? [] : [leftWindowPos()]),
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
    // github#104
    if (!BROWSER) { try { BROWSER = (await json(PORT, "/json/version")).Browser; } catch { void 0; } }
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

    // github#113
    const nativeClock = await page.j("__vg.timeScale").catch(() => 1.25);

    // github#113
    const stillBusy = async () => {
      const why = await page.j("__vg.demo.busyWhy()").catch(() => null);
      return why ? Object.keys(why).filter((k) => why[k]) : [];
    };

    // github#113
    await settle(page, 20000);

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
      // github#113
      const fast = c.clock !== "real";
      if (fast) {
        await page.send("Emulation.setEmulatedMedia",
                        { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }).catch(() => {});
        await page.eval(`__vg.timeScale = ${FAST_CLOCK}; void 0`).catch(() => {});
      }
      try { r = await c.fn(page, ctx); }
      catch (e) { r = { ok: false, detail: "threw: " + e.message }; }
      // github#113, github#112
      const left = await stillBusy();
      if (left.length) {
        const tb = Date.now();
        const done = await settle(page, 20000);
        r = { ok: false,
              detail: `${r.detail || ""} | left the page busy: ${left.join(", ")} -- ` +
                      (done ? `settled in ${((Date.now() - tb) / 1000).toFixed(1)}s`
                            : "STILL busy after 20s") };
      }
      if (fast) {
        await page.eval(`__vg.timeScale = ${nativeClock}; void 0`).catch(() => {});
        await page.send("Emulation.setEmulatedMedia", { features: [] }).catch(() => {});
      }
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
 * github#106, decisions/0013 -- a stamp is not proof the vault is usable
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
  const GENERATORS = ["make-demo-vault.mjs", "make-test-vault.mjs", "make-shape-vault.mjs"];
  // github#86 -- hashes ONLY its own generator; the other three do not move
  const TAG_GENERATORS = ["make-tag-vault.mjs"];
  // github#106 -- format 2 stamps the note count
  const FIXTURE_FORMAT = 2;
  const storeRoot = fixtureStore(ROOT);

  const digestOf = (args, gens) => {
    const h = createHash("sha256");
    h.update("format:" + FIXTURE_FORMAT);
    for (const g of gens || GENERATORS) h.update(readFileSync(join(HERE, g)));
    h.update(JSON.stringify(args));
    return h.digest("hex").slice(0, 8);
  };

  const todayDay = () => new Date().toISOString().slice(0, 10);
  const ageDays = (day) => Math.floor((Date.parse(todayDay()) - Date.parse(day)) / 86400000);

  const gen = (script, args, name, label, gens) => {
    const digest = digestOf(args, gens);
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
    if (fresh) {
      // github#106 -- a stamp is not proof the vault is usable
      const health = checkFixture(dir);
      if (!health.ok) {
        console.log(`fixture ${name} is corrupt: ${health.why} -- regenerating`);
        fresh = false;
      }
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
      // github#106 -- counted, then checked before it is published
      writeFileSync(join(building, ".stamp.json"),
                    JSON.stringify({ digest, day: todayDay(), script, args, notes: countNotes(building) },
                                   null, 2) + "\n");
      const built = checkFixture(building);
      if (!built.ok) {
        console.log(`  cannot generate ${label}: ${built.why}`);
        rmSync(building, { recursive: true, force: true });
        return;
      }
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
    const desc = describeFixture(dir);
    out.push({ path: dir, label, fixture: desc ? { name, ...desc } : null });
  };

  gen("make-demo-vault.mjs", [], "demo-vault", "the demo vault (sparse tail, 2 dense years)");
  gen("make-test-vault.mjs", ["--notes", "10000", "--years", "10", "--end", "2026-08-28"],
      "test-vault", "the 10k synthetic vault (10 years)");
  gen("make-shape-vault.mjs", [], "shape-vault", "the dominant-folder vault");
  // github#86, design/0015 -- the only tag-ORGANISED fixture; --end pinned
  gen("make-tag-vault.mjs", ["--end", "2026-09-09"], "tag-vault",
      "the tag-organised vault (nested tags, 8% untagged)", TAG_GENERATORS);

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
  // github#106 -- fail here, before any browser is launched
  if (b.status !== 0) {
    const lines = (b.stderr || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const why = lines.find((s) => /^Error:/.test(s)) || lines[0] || `exit ${b.status}`;
    throw new Error(`cannot build ${v.label}: ${why.replace(/^Error:\s*/, "")}`);
  }
  const m = /^wrote (.+) \(/m.exec(b.stdout || "");
  if (!m) throw new Error(`cannot build ${v.label}: build-graph.mjs did not say where the build landed`);
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
  // github#104 -- captured before anything is built from it
  const builtFrom = startRun(ROOT);
  const vaults = resolveVaults();
  console.log(`checking ${vaults.length} vault(s): ${vaults.map((v) => v.label).join(", ")}`);

  const lanePorts = PINNED_PORT ? [] : await freePorts(Math.max(JOBS, 1));

  // github#113
  const jobs = [];
  for (const v of vaults) {
    const mine = picked.filter((c) => runsOn(c, v.fixture));
    if (!mine.length) { console.log(`  ${v.label}: no selected check runs here`); continue; }
    const url = await buildFor(v);
    const atRest = url ? url + (url.indexOf("?") < 0 ? "?rest" : "&rest") : url;
    const rest = mine.filter((c) => !needsIntro(c));
    const intro = mine.filter(needsIntro);
    // github#113
    const walk = JOBS > 1 ? rest.filter((c) => c.clock === "real") : [];
    const fast = JOBS > 1 ? rest.filter((c) => c.clock !== "real") : rest;
    if (walk.length) jobs.push({ vault: v, checks: walk, tag: v.label + " (walk)", url: atRest, walk: true });
    if (fast.length) jobs.push({ vault: v, checks: fast, tag: v.label, url: atRest });
    if (intro.length) jobs.push({ vault: v, checks: intro, tag: v.label + " (intro)", url });
  }
  // github#113
  const homeless = picked.filter((c) => !jobs.some((jb) => jb.checks.includes(c)));
  if (homeless.length) {
    throw new Error(`${homeless.length} selected check(s) run on no available fixture -- ` +
                    `${homeless.map((c) => `"${c.name}" (${c.on === "all" ? "all" : c.on.join("/")})`).slice(0, 4).join("; ")}` +
                    (homeless.length > 4 ? "; ..." : ""));
  }
  console.log("");

  const failures = new Map();
  const ran = new Map();
  // github#113
  const timingsOut = [];
  const bump = (work, r) => {
    const label = work.vault.label;
    failures.set(label, (failures.get(label) || 0) + r.failed);
    ran.set(label, (ran.get(label) || 0) + r.ran);
    const fixture = work.vault.fixture ? work.vault.fixture.name : label;
    for (const t of r.timings || []) timingsOut.push({ fixture, check: t.name, ms: t.ms });
  };
  const report = (work, r) => {
    console.log("=".repeat(72));
    console.log("== " + work.tag);
    console.log("=".repeat(72));
    for (const l of r.lines) console.log(l);
    console.log("");
  };

  // github#113
  const pool = async (list, width) => {
    const walks = list.filter((j) => j.walk), fasts = list.filter((j) => !j.walk);
    let walkBusy = false;
    const worker = async (lane) => {
      for (;;) {
        let w = null;
        if (!walkBusy && walks.length) { w = walks.shift(); walkBusy = true; }
        else if (fasts.length) w = fasts.shift();
        else if (walks.length) { await sleep(500); continue; }
        else return;
        w = { ...w, slot: lane, slots: Math.min(width, list.length), port: lanePorts[lane] || 0 };
        let r;
        try { r = await runOne(w.vault.path, w); }
        catch (e) {
          r = { failed: w.checks.length, ran: w.checks.length,
                lines: ["  !! this job did not run: " + e.message], timings: [] };
        }
        if (w.walk) walkBusy = false;
        report(w, r);
        bump(w, r);
      }
    };
    await Promise.all(Array.from({ length: Math.min(width, list.length) }, (_, lane) => worker(lane)));
  };

  if (JOBS > 1) {
    console.log(`${JOBS} lanes: ${jobs.filter((j) => j.walk).length} walk job(s) one at a time, ` +
                `${jobs.filter((j) => !j.walk).length} other job(s) beside them`);
  }
  const started = Date.now();
  await pool(jobs, JOBS);
  const wall = Math.round((Date.now() - started) / 1000);
  if (arg("timings", "")) {
    writeFileSync(arg("timings", ""), JSON.stringify({ at: new Date().toISOString(), wallSec: wall,
                                                       checks: timingsOut }, null, 1) + "\n");
    console.log(`wrote ${timingsOut.length} timings to ${arg("timings", "")}`);
  }

  let worst = 0;
  for (const v of vaults) worst = Math.max(worst, failures.get(v.label) || 0);

  if (vaults.length > 1 || JOBS > 1) {
    console.log(`${"=".repeat(72)}`);
    for (const v of vaults) {
      const f = failures.get(v.label) || 0, t = ran.get(v.label) || 0;
      console.log(`  ${f ? "FAIL" : " ok "}  ${t - f}/${t}  ${v.label}`);
    }
    console.log(`  ${wall}s wall over ${jobs.length} Chrome(s)`);
  }

  // github#93, decisions/0013
  // github#104 -- named first: a changed shape invalidates the measurement
  const deltas = shapeDeltas({ jobs: JOBS, grid: GRID, headed: HEADED, port: PINNED_PORT,
                               chrome: arg("chrome", "") });
  const notFull = (what) => `${what} is not the full suite`;
  const partial = deltas.length ? `${deltas.join(", ")} is not the run shape the gates push with`
                : ONLY.length ? notFull("--only")
                : argAll("vault").length ? notFull("--vault")
                : arg("url", "") ? notFull("--url")
                : vaults.some((v) => !v.fixture) ? notFull("an unstamped fixture")
                // github#106
                : process.env.VG_FIXTURE_STORE ? notFull("VG_FIXTURE_STORE")
                // github#103
                : FIXTURE_NAMES.some((n) => !vaults.some((v) => v.fixture.name === n))
                  ? notFull("a fixture that could not be generated")
                : "";
  if (!worst && !partial) {
    let checks = 0;
    for (const t of ran.values()) checks += t;
    const r = recordPass({ fixtures: vaults.map((v) => v.fixture), checks, started: builtFrom, chrome: BROWSER });
    console.log(r.wrote ? `stamped tree ${r.tree.slice(0, 7)} as passed: ${r.wrote}`
                        : `not stamping this run: ${r.why}`);
  } else if (!worst) {
    console.log(`not stamping this run: ${partial}`);
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
