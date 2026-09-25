#!/usr/bin/env node
// github#178, design/0013

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attach } from "./cdp.mjs";
import { placeElectronLeft } from "./screen.mjs";
import { keepFocus } from "./focus.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes("--" + n);

const PLUGIN_ID = "vault-graph";
const VT = "vault-graph-view";
const PORT = Number(arg("port", "9449"));
const W = Number(arg("w", "390"));
const H = Number(arg("h", "844"));
const KEEP = flag("keep");
// github#87
const NO_LOCK = flag("no-lock");
const JSON_OUT = arg("json", "");
const SHOT = arg("shot", "");
const SEEN_DAYS = Number(arg("seen-days", "0")) || 0;
const TEMP = process.env.TEMP || tmpdir();
const WORK = join(TEMP, "vault-graph-host-phone");
const PROFILE = join(TEMP, "vault-graph-host-phone-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findObsidian() {
  const named = arg("obsidian", "");
  if (named) return named;
  const guesses = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Obsidian", "Obsidian.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Obsidian", "Obsidian.exe"),
    "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
  ].filter(Boolean);
  for (const g of guesses) if (existsSync(g)) return g;
  throw new Error("Obsidian not found -- pass --obsidian <path to the executable>");
}

// github#73 -- the store sits beside the main repo
function fixtureStore() {
  const g = spawnSync("git", ["-C", ROOT, "rev-parse", "--git-common-dir"], { encoding: "utf8" });
  const common = g.status === 0 ? g.stdout.trim() : "";
  const abs = common ? (/^[A-Za-z]:[\\/]|^\//.test(common) ? common : join(ROOT, common)) : join(ROOT, ".git");
  return join(dirname(abs), ".fixtures");
}

function sourceVault() {
  const explicit = arg("vault", "");
  if (explicit) return resolve(explicit);
  const want = { demo: "demo-vault-", shape: "shape-vault-", "10k": "test-vault-", tag: "tag-vault-" }[arg("fixture", "demo")];
  if (!want) throw new Error("--fixture must be demo, shape, 10k or tag");
  const store = fixtureStore();
  const hit = existsSync(store)
    ? readdirSync(store).find((d) => d.startsWith(want) && statSync(join(store, d)).isDirectory())
    : null;
  if (!hit) {
    throw new Error("no " + want + "* fixture in " + store +
      " -- run node scripts/smoke.mjs --only \"no console errors\" once to generate the store");
  }
  return join(store, hit);
}

// github#178 -- --plugin-from keeps one harness over two builds
const BUILT = ["main.js", "manifest.json", "styles.css"];
function pluginDir() {
  const from = arg("plugin-from", "");
  const dir = from ? resolve(from) : ROOT;
  for (const f of BUILT) {
    if (!existsSync(join(dir, f))) {
      throw new Error(f + " is missing in " + dir +
        (from ? "" : " -- run: node scripts/build-plugin.mjs"));
    }
  }
  return dir;
}

function makeThrowawayVault(src, plugin) {
  const dest = join(WORK, basename(src));
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  cpSync(src, dest, { recursive: true, filter: (p) => !/[\\/]\.obsidian[\\/](plugins|workspace\.json|workspace-mobile\.json)/.test(p) });
  const dot = join(dest, ".obsidian");
  mkdirSync(dot, { recursive: true });
  const plug = join(dot, "plugins", PLUGIN_ID);
  mkdirSync(plug, { recursive: true });
  for (const f of BUILT) cpSync(join(plugin, f), join(plug, f));
  writeFileSync(join(dot, "community-plugins.json"), JSON.stringify([PLUGIN_ID]) + "\n");
  // github#70 -- lastSeen is what puts the third chip in the lens
  if (SEEN_DAYS) {
    writeFileSync(join(plug, "data.json"), JSON.stringify({
      dim: "folder", liveRefresh: true, compactAxis: true,
      lastSeen: Date.now() - SEEN_DAYS * 86400000
    }) + "\n");
  }
  return dest;
}

/* ----------------------------------------------------------------- checks -- */

const results = [];
function report(ok, name, detail) {
  results.push({ ok, name, detail });
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + (detail ? "   (" + detail + ")" : ""));
}

const ROOTQ = "(document.querySelector('.workspace-leaf-content .vault-graph') || document.querySelector('.vault-graph'))";

// github#178 -- everything the six items are read off
const PROBE = `(function () {
  var root = ${ROOTQ};
  if (!root) return { mounted: false };
  var q = function (id) { return root.querySelector('#vg-' + id); };
  var box = function (el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2),
             right: +r.right.toFixed(2), bottom: +r.bottom.toFixed(2) };
  };
  var cs = function (el, props) {
    if (!el) return null;
    var c = getComputedStyle(el), out = {};
    props.forEach(function (p) { out[p] = c.getPropertyValue(p); });
    return out;
  };
  var textBox = function (el) {
    if (!el || !el.firstChild) return null;
    var rg = document.createRange();
    rg.selectNodeContents(el);
    var r = rg.getBoundingClientRect();
    rg.detach && rg.detach();
    return r.height ? { y: +r.top.toFixed(2), h: +r.height.toFixed(2), mid: +((r.top + r.bottom) / 2).toFixed(2) } : null;
  };
  var CTRL = ['height', 'min-height', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
              'font-weight', 'font-size', 'box-shadow', 'border-radius', 'line-height'];

  var heat = q('heat'), src = q('heatsrc'), recent = q('recent'), years = q('years'), ribbon = q('ribbon');
  var hrow = heat ? heat.querySelector('.hrow') : null;

  var segBox = src ? src.getBoundingClientRect() : null;
  var segMid = segBox ? (segBox.top + segBox.bottom) / 2 : 0;
  // github#178 -- the label is read against the box that SHOWS, not the one clipped
  var segButtons = src ? [].slice.call(src.querySelectorAll('button')).map(function (b) {
    var bb = box(b), tb = textBox(b);
    return { label: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'), box: bb,
             text: tb, textOff: tb ? +(tb.mid - segMid).toFixed(2) : null,
             css: cs(b, CTRL) };
  }) : [];

  var chips = recent ? [].slice.call(recent.querySelectorAll('button')).map(function (b) {
    return { label: b.textContent.trim(), kind: b.getAttribute('data-kind'),
             shown: getComputedStyle(b).display !== 'none', box: box(b), css: cs(b, CTRL) };
  }) : [];

  var yearChips = years ? [].slice.call(years.querySelectorAll('button')).map(function (b) {
    return { yr: b.getAttribute('data-yr'), left: b.style.left, box: box(b), css: cs(b, CTRL) };
  }) : [];

  var rowKids = hrow ? [].slice.call(hrow.children).map(function (el) {
    return { id: el.id || el.className, order: getComputedStyle(el).order, box: box(el) };
  }) : [];

  var scrollers = [], overRibbon = [];
  if (heat) {
    var rb = ribbon ? ribbon.getBoundingClientRect() : null;
    [].slice.call(heat.querySelectorAll('*')).forEach(function (el) {
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
        scrollers.push({ id: el.id || el.className, sw: el.scrollWidth, cw: el.clientWidth,
                         sh: el.scrollHeight, ch: el.clientHeight,
                         overflowX: getComputedStyle(el).overflowX, box: box(el) });
      }
      if (rb && el !== ribbon && el.offsetParent !== null) {
        var r = el.getBoundingClientRect();
        if (r.width && r.height && r.left < rb.right && r.right > rb.left && r.top < rb.bottom && r.bottom > rb.top) {
          overRibbon.push({ id: el.id || el.className, box: box(el) });
        }
      }
    });
  }

  var below = [];
  if (heat && ribbon) {
    var rb2 = ribbon.getBoundingClientRect(), yb = years ? years.getBoundingClientRect() : null;
    [].slice.call(heat.querySelectorAll('*')).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.top >= rb2.bottom - 1 && (!yb || r.bottom <= yb.top + 1)) {
        below.push({ id: el.id || el.className, box: box(el) });
      }
    });
  }

  var hostCs = getComputedStyle(document.body);
  return {
    mounted: true,
    win: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    host: {
      isMobile: document.body.classList.contains('is-mobile'),
      isPhone: document.body.classList.contains('is-phone'),
      coarse: window.matchMedia('(pointer: coarse)').matches,
      phoneQuery: window.matchMedia('(max-width: 720px) and (pointer: coarse)').matches,
      inputHeight: hostCs.getPropertyValue('--input-height').trim(),
      touchSizeM: hostCs.getPropertyValue('--touch-size-m').trim(),
      hostButtonHeight: (function () {
        var p = document.createElement('button');
        p.textContent = 'x';
        document.body.appendChild(p);
        var c = getComputedStyle(p), out = { height: c.height, padding: c.paddingLeft + ' ' + c.paddingTop };
        p.remove();
        return out;
      })()
    },
    band: { dataBand: root.getAttribute('data-band'), dataSheet: root.getAttribute('data-sheet'),
            heat: box(heat), heatHidden: heat ? getComputedStyle(heat).display === 'none' : null },
    hrowH: hrow ? getComputedStyle(hrow).getPropertyValue('--vg-hrow-h').trim() : null,
    seg: { box: box(src), css: cs(src, CTRL), buttons: segButtons },
    lens: { box: box(recent), sw: recent ? recent.scrollWidth : 0, cw: recent ? recent.clientWidth : 0, chips: chips },
    row: rowKids,
    range: { compact: box(q('compact')), from: box(q('from')), to: box(q('to')), all: box(q('rangeall')),
             compactCss: cs(q('compact'), CTRL), fromCss: cs(q('from'), CTRL), allCss: cs(q('rangeall'), CTRL) },
    years: { box: box(years), chips: yearChips },
    ribbon: { box: box(ribbon), heatwrap: box(q('heatwrap')), heatc: box(q('heatc')) },
    scrollers: scrollers,
    overRibbon: overRibbon,
    belowRibbon: below
  };
})()`;

/* -------------------------------------------------------------------- run -- */

const src = sourceVault();
const plugin = pluginDir();
console.log("host-phone-check: " + findObsidian());
console.log("vault:    " + src);
console.log("plugin:   " + plugin);
console.log("viewport: " + W + "x" + H);
console.log("port:     " + PORT);

const vault = makeThrowawayVault(src, plugin);
console.log("throwaway vault: " + vault);

// github#87
const LOCK = "screen-left";
const lockOwner = "host-phone-check [" + process.pid + "]";
let holdsLock = false;
if (!NO_LOCK) {
  const r = spawnSync(process.execPath, [join(HERE, "lock.mjs"), "acquire", LOCK, "--owner", lockOwner], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("could not take the " + LOCK + " lock -- something else is driving that display.");
    console.error("  who: node scripts/lock.mjs status");
    process.exit(1);
  }
  holdsLock = true;
}
const releaseLock = () => {
  if (!holdsLock || KEEP) return;
  holdsLock = false;
  try {
    spawnSync(process.execPath, [join(HERE, "lock.mjs"), "release", LOCK, "--owner", lockOwner], { stdio: "ignore" });
  } catch { void 0; }
};
process.on("exit", releaseLock);

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });
writeFileSync(join(PROFILE, "obsidian.json"),
  JSON.stringify({ vaults: { "0000hostphonecheck": { path: vault, ts: Date.now(), open: true } } }), "utf8");

// github#129
const focus = await keepFocus();
const child = spawn(findObsidian(), ["--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE], { stdio: "ignore" });
void focus.watch(child.pid);

let cdp = null;
const killObsidian = () => {
  if (KEEP) return;
  try { child.kill(); } catch { void 0; }
  if (process.platform === "win32") spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
};
const shutdown = async (code) => {
  try { if (cdp) await cdp.close(); } catch { void 0; }
  killObsidian();
  releaseLock();
  process.exit(code);
};

async function waitForApp(label) {
  for (let i = 0; i < 90; i++) {
    await sleep(700);
    let c = null;
    try { c = await attach(PORT, "app://obsidian.md"); } catch { continue; }
    try {
      if (await c.eval("typeof app !== 'undefined' && !!app.workspace")) return c;
    } catch { void 0; }
    try { c.close(); } catch { void 0; }
  }
  throw new Error("Obsidian never exposed its app (" + label + ")");
}

try {
  cdp = await waitForApp("first boot");
  await placeElectronLeft((x) => cdp.eval(x)).catch(() => {});
  console.log("attached, vault loaded");

  // github#62 -- leave restricted mode, then enable ours
  const id = JSON.stringify(PLUGIN_ID);
  if (!(await cdp.eval("!!app.plugins.getPlugin(" + id + ")"))) {
    console.log("plugin not loaded -- leaving restricted mode and enabling it");
    await cdp.eval("app.plugins.setEnable(true)");
    await cdp.eval("app.plugins.enablePluginAndSave(" + id + ")");
    await sleep(1500);
  }
  if (!(await cdp.eval("!!app.plugins.getPlugin(" + id + ")"))) {
    const known = await cdp.eval("Object.keys(app.plugins.manifests || {})");
    throw new Error("plugin still not loaded. Manifests Obsidian can see: " + JSON.stringify(known));
  }
  console.log("plugin loaded");

  // github#178 -- emulateMobile reloads the renderer; re-attach
  const wasMobile = await cdp.eval("document.body.classList.contains('is-mobile')");
  if (!wasMobile) {
    console.log("turning mobile emulation on (the app reloads)");
    await cdp.eval("app.emulateMobile(true); void 0").catch(() => {});
    try { await cdp.close(); } catch { void 0; }
    await sleep(2500);
    cdp = await waitForApp("after emulateMobile");
    await placeElectronLeft((x) => cdp.eval(x)).catch(() => {});
  }

  // design/0013 -- the device before its viewport
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await cdp.send("Emulation.setDeviceMetricsOverride",
    { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await sleep(1200);

  const env = await cdp.eval("({ w: window.innerWidth, h: window.innerHeight," +
    " coarse: matchMedia('(pointer: coarse)').matches," +
    " phone: matchMedia('(max-width: 720px) and (pointer: coarse)').matches," +
    " isMobile: document.body.classList.contains('is-mobile')," +
    " isPhone: document.body.classList.contains('is-phone') })");
  console.log("host: " + JSON.stringify(env));
  if (!env.isMobile) throw new Error("mobile emulation did not take -- body has no is-mobile class");
  if (!env.phone) throw new Error("the page's phone query is false at " + env.w + "px -- the run would measure the desktop layout");

  // design/0013 -- bandOpen is read once, at mount
  await cdp.eval("app.commands.executeCommandById(" + JSON.stringify(PLUGIN_ID + ":open") + "); void 0");
  // github#62 -- obsidian-smoke's settle: busy hidden, positions stable
  const READY = "(function(){ var ls = app.workspace.getLeavesOfType(" + JSON.stringify(VT) + ");" +
    " var v = ls[0] && ls[0].view; if (!v || !v.handle || !v.handle.api) return null;" +
    " var api = v.handle.api; if (!api.graph || !api.renderer) return null;" +
    " var busy = v.contentEl.querySelector('#vg-busy'); if (busy && !busy.hidden) return null;" +
    " var sum = 0; api.graph.forEachNode(function (id, a) { sum += a.x + a.y; });" +
    " if (window.__vgPhonePos !== sum) { window.__vgPhonePos = sum; return null; }" +
    " return { order: api.graph.order }; })()";
  const deadline = Date.now() + 180000;
  for (;;) {
    const ready = await cdp.eval(READY).catch(() => null);
    if (ready) { console.log("view ready: " + JSON.stringify(ready)); break; }
    if (Date.now() > deadline) {
      const why = await cdp.eval("(function(){ var ls = app.workspace.getLeavesOfType(" + JSON.stringify(VT) + ");" +
        " var v = ls[0] && ls[0].view;" +
        " return { leaves: ls.length, view: !!v, deferred: !!(v && v.getViewType === undefined)," +
        " handle: !!(v && v.handle), api: !!(v && v.handle && v.handle.api)," +
        " graph: !!(v && v.handle && v.handle.api && v.handle.api.graph)," +
        " roots: document.querySelectorAll('.vault-graph').length }; })()").catch((e) => String(e));
      throw new Error("the view never settled inside Obsidian -- " + JSON.stringify(why));
    }
    await sleep(400);
  }
  await sleep(600);
  console.log("view open and settled\n");

  const folded = await cdp.eval("(function(){ var r = " + ROOTQ + "; return r ? r.getAttribute('data-band') : null; })()");

  // github#170 -- the band is measured open
  await cdp.eval("(function(){ var r = " + ROOTQ + ", b = r && r.querySelector('#vg-band');" +
    " if (b && r.getAttribute('data-band') !== 'on') b.click(); })(); void 0");
  await sleep(900);

  const p = await cdp.eval(PROBE);
  if (!p.mounted) throw new Error("the page is not in the document");

  const num = (s) => parseFloat(String(s || "0"));
  const rowH = num(p.hrowH) || 32;

  console.log("=== six items ==========================================");

  // github#178 -- item 1
  const segH = p.seg.box ? p.seg.box.h : 0;
  const segInner = segH - 2;
  const tooTall = p.seg.buttons.filter((b) => b.box && b.box.h > segInner + 1);
  const offCentre = p.seg.buttons.filter((b) => b.textOff != null && Math.abs(b.textOff) > 1.5);
  const heights = p.seg.buttons.map((b) => (b.box ? b.box.h : 0));
  report(tooTall.length === 0 && offCentre.length === 0 &&
         new Set(heights.map((h) => Math.round(h))).size <= 1,
    "1 the segment's halves fill the row and no more, labels centred",
    "segment " + segH + "px, halves " + heights.join("/") + "px, host button height " +
    p.host.hostButtonHeight.height + ", label offset " +
    p.seg.buttons.map((b) => b.textOff).join("/") + "px");

  // github#178 -- item 2
  const segTop = p.seg.box ? Math.round(p.seg.box.y) : -1;
  const lensTop = p.lens.box ? Math.round(p.lens.box.y) : -2;
  const sameLine = Math.abs(segTop - lensTop) <= 2;
  // github#178 -- a chip the phone hides is not a chip with a wrong height
  const shownChips = p.lens.chips.filter((c) => c.shown);
  const chipH = shownChips.map((c) => (c.box ? Math.round(c.box.h) : 0));
  const rowTops = p.row.filter((k) => k.box && k.box.h).map((k) => Math.round(k.box.y));
  const lines = [...new Set(rowTops)].length;
  const sinceShown = p.lens.chips.filter((c) => c.kind === "open" && c.shown).length;
  const chipsOk = chipH.length > 0 && chipH.every((h) => h === 26);
  report(sameLine && chipsOk && sinceShown === 0,
    "2 the recent lens keeps line 1, and a phone drops the since-last-open chip",
    p.lens.chips.length + " chips built, " + shownChips.length + " shown" +
    (sinceShown ? ", SINCE-LAST-OPEN IS SHOWN" : ", since-last-open hidden") +
    ", lens top " + lensTop + " vs segment top " + segTop +
    ", chip heights " + chipH.join("/") + ", the row wraps onto " + lines + " line(s)" +
    ", lens scrolls " + p.lens.sw + " in " + p.lens.cw);

  // github#178 -- item 3
  const dateRow = [["compact", p.range.compact], ["from", p.range.from], ["to", p.range.to], ["all", p.range.all]]
    .filter((e) => e[1]);
  const dh = dateRow.map((e) => Math.round(e[1].h));
  report(dh.length > 0 && new Set(dh).size === 1 && dh[0] === Math.round(rowH),
    "3 the fold button and the date fields are one height",
    dateRow.map((e, i) => e[0] + " " + dh[i]).join(", ") + " against --vg-hrow-h " + rowH);

  // github#178 -- item 4
  const ybox = p.years.box;
  // github#178 -- a chip may bleed into the padding, not out
  const heatBox = p.band.heat;
  // github#178 -- half a chip minus the padding is not float noise
  const EDGE = 0.05;
  const outside = p.years.chips.filter((c) => c.box && heatBox &&
    (c.box.x < heatBox.x - EDGE || c.box.right > heatBox.right + EDGE));
  const sorted = p.years.chips.filter((c) => c.box).slice().sort((a, b) => a.box.x - b.box.x);
  const overlaps = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].box.x < sorted[i - 1].box.right - EDGE) {
      overlaps.push(sorted[i - 1].yr + "/" + sorted[i].yr +
        " by " + (sorted[i - 1].box.right - sorted[i].box.x).toFixed(2) + "px");
    }
  }
  report(outside.length === 0 && overlaps.length === 0,
    "4 the year strip fits the band and no two chips overlap",
    p.years.chips.length + " chips in " + (ybox ? ybox.w : 0) + "px; outside: " +
    (outside.map((c) => c.yr).join(",") || "none") + "; overlapping: " + (overlaps.join(", ") || "none"));

  // github#178 -- item 5
  const strays = p.belowRibbon.filter((e) => e.id !== "vg-years" && e.box.h > 2);
  // github#178 -- vg-recent scrolls on purpose, nothing else does
  const bandScrollers = p.scrollers.filter((s) => s.id !== "vg-recent");
  const rb = p.ribbon.box, yb = p.years.box;
  const sameWidth = !!(rb && yb && Math.abs(rb.w - yb.w) < 0.5 && Math.abs(rb.x - yb.x) < 0.5);
  report(strays.length === 0 && bandScrollers.length === 0 && sameWidth,
    "5 nothing in the band overflows its box, and the ribbon and the strip share a width",
    "between the ribbon and the years: " + (strays.map((e) => e.id + " " + e.box.w + "x" + e.box.h).join(", ") || "nothing") +
    "; ribbon " + (rb ? rb.w + "@" + rb.x : "?") + " vs strip " + (yb ? yb.w + "@" + yb.x : "?") +
    "; overflowing: " +
    (bandScrollers.map((s) => s.id + " " + s.sw + "x" + s.sh + " in " + s.cw + "x" + s.ch).join(", ") || "none"));

  // github#178 -- item 6
  report(folded === "off",
    "6 the calendar comes up folded on a phone, inside the host",
    "data-band was " + JSON.stringify(folded) + " at first open");

  console.log("\n=== what the host is doing =============================");
  console.log("  body: " + (p.host.isMobile ? "is-mobile " : "") + (p.host.isPhone ? "is-phone " : "") +
              "| pointer coarse " + p.host.coarse + " | the page's phone query " + p.host.phoneQuery);
  console.log("  --input-height " + (p.host.inputHeight || "(unset)") +
              " | --touch-size-m " + (p.host.touchSizeM || "(unset)") +
              " | a bare host button is " + p.host.hostButtonHeight.height +
              " tall with " + p.host.hostButtonHeight.padding + " padding");
  console.log("  the band's row: " + p.row.map((k) => k.id + "@" + Math.round(k.box ? k.box.y : 0)).join(", "));

  if (SHOT) {
    mkdirSync(SHOT, { recursive: true });
    await cdp.eval("(function(){ var n = document.querySelectorAll('.notice, .notice-container > *');" +
      " for (var i = 0; i < n.length; i++) n[i].remove(); })(); void 0");
    await sleep(250);
    const r = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(SHOT, "host-phone.png"), Buffer.from(r.data, "base64"));
    console.log("\n  wrote " + join(SHOT, "host-phone.png"));
  }

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify({ results, probe: p, foldedAtOpen: folded }, null, 2), "utf8");
    console.log("  wrote " + JSON_OUT);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " pass" +
              (failed ? ", " + failed + " FAIL" : ""));

  await shutdown(failed ? 1 : 0);
} catch (e) {
  console.error(e);
  await shutdown(1);
}
