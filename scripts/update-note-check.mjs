#!/usr/bin/env node
// github#83, design/0016

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attach } from "./cdp.mjs";
import { fixtureStore } from "./suite-stamp.mjs";
import { leftWindow, placeElectronLeft } from "./screen.mjs";
import { parseNote, parseReleases, releaseChain, semver } from "../plugin/update-note.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes("--" + n);

const VT = "vault-graph-view";
const PLUGIN_ID = "vault-graph";
const PORT = Number(arg("port", "9449"));
const KEEP = flag("keep");
const TEMP = process.env.TEMP || tmpdir();
const WORK = join(TEMP, "vault-graph-update-note-check");
const OUT = resolve(arg("out", join(WORK, "shots")));
const OPEN_TIMEOUT_MS = Number(arg("timeout", "120")) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MAIN = leftWindow(1600, 1000);

function findObsidian() {
  const named = arg("obsidian", "");
  if (named) return named;
  const guesses = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Obsidian", "Obsidian.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Obsidian", "Obsidian.exe"),
    "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
  ].filter(Boolean);
  for (const g of guesses) if (existsSync(g)) return g;
  throw new Error("Obsidian not found -- pass --obsidian <path>");
}

function sourceVault() {
  const explicit = arg("vault", "");
  if (explicit) return resolve(explicit);
  const store = fixtureStore();
  const hit = existsSync(store)
    ? readdirSync(store).find((d) => d.startsWith("demo-vault-") && statSync(join(store, d)).isDirectory())
    : null;
  if (!hit) throw new Error("no demo-vault-* fixture in " + store + " -- run node scripts/smoke.mjs --only golden once to generate the store");
  return join(store, hit);
}

function makeThrowawayVault(src) {
  for (const f of ["main.js", "manifest.json", "styles.css"]) {
    if (!existsSync(join(ROOT, f))) throw new Error(f + " is missing at the repo root -- run: node scripts/build-plugin.mjs");
  }
  const dest = join(WORK, basename(src));
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  cpSync(src, dest, { recursive: true, filter: (p) => !/[\\/]\.obsidian[\\/](plugins|workspace\.json|workspace-mobile\.json)/.test(p) });
  const dot = join(dest, ".obsidian");
  mkdirSync(dot, { recursive: true });
  const plug = join(dot, "plugins", PLUGIN_ID);
  mkdirSync(plug, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) cpSync(join(ROOT, f), join(plug, f));
  writeFileSync(join(dot, "community-plugins.json"), JSON.stringify([PLUGIN_ID]) + "\n");
  return dest;
}

async function launchObsidian(vault, profile) {
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "obsidian.json"),
    JSON.stringify({ vaults: { "0000updatenote": { path: vault, ts: Date.now(), open: true } } }), "utf8");
  const child = spawn(findObsidian(), ["--remote-debugging-port=" + PORT, "--user-data-dir=" + profile], { stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    let c = null;
    try { c = await attach(PORT, "app://obsidian.md"); } catch { continue; }
    try {
      if (await c.eval("typeof app !== 'undefined' && !!app.workspace")) return { child, cdp: c };
    } catch { }
    try { c.close(); } catch { }
  }
  try { child.kill(); } catch { }
  throw new Error("Obsidian never exposed its app on port " + PORT);
}

function killObsidian(child) {
  try { child.kill(); } catch { }
  if (process.platform === "win32") spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
}

async function waitFor(c, expr, ms, label) {
  const deadline = Date.now() + ms;
  for (;;) {
    let v = null;
    try { v = await c.eval(expr); } catch { v = null; }
    if (v) return v;
    if (Date.now() > deadline) throw new Error(label + " did not happen within " + ms + " ms");
    await sleep(120);
  }
}

/* --------------------------------------------------------------- checks -- */

const results = [];
function report(ok, name, detail) {
  results.push({ ok, name, detail });
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + (detail ? "   (" + detail + ")" : ""));
}

const VIEW = "(function(){ var ls = app.workspace.getLeavesOfType(" + JSON.stringify(VT) + "); return ls[0] && ls[0].view; })()";
const STRIP = "(function(){ var v = " + VIEW + "; return v ? v.contentEl.querySelector('.vg-whatsnew') : null; })()";
const READY = "(function(){ var v = " + VIEW + "; if (!v || !v.handle || !v.handle.api || !v.handle.api.graph) return false;" +
              " var d = v.handle.api.debugDump ? v.handle.api.debugDump() : null;" +
              " return !d || !d.filters || d.filters.timelineUntil === null; })()";

const src = sourceVault();
const vault = makeThrowawayVault(src);
const plugDir = join(vault, ".obsidian", "plugins", PLUGIN_ID);
const dataFile = join(plugDir, "data.json");
const note = parseNote(readFileSync(join(ROOT, "plugin", "whats-new.md"), "utf8")).note;
if (!note) throw new Error("plugin/whats-new.md does not parse -- the build would have refused it");
const N = note.version;
const [maj, min, pat] = semver(N);
const PREV_MINOR = maj + "." + Math.max(0, min - 1) + ".0";
const NEXT_PATCH = maj + "." + min + "." + (pat + 1);
const NEXT_MINOR = maj + "." + (min + 1) + ".0";

console.log("update-note-check: " + findObsidian());
console.log("fixture: " + src);
console.log("throwaway vault: " + vault);
console.log("note: " + N + " (" + note.lines.length + " line" + (note.lines.length === 1 ? "" : "s") + ")");
mkdirSync(OUT, { recursive: true });

const profile = join(WORK, "profile");
console.log("launching a separate Obsidian on port " + PORT + " ...");
const ob = await launchObsidian(vault, profile);
const c = ob.cdp;
const E = (expr) => c.eval(expr);

const readData = () => existsSync(dataFile) ? readFileSync(dataFile, "utf8") : null;
const lastSeen = () => { const t = readData(); if (t === null) return null; const j = JSON.parse(t); return "lastSeenVersion" in j ? j.lastSeenVersion : undefined; };

/** @param {object | null} data @param {string} installed */
async function reloadPlugin(data, installed) {
  if (data === null) rmSync(dataFile, { force: true });
  else writeFileSync(dataFile, JSON.stringify(data, null, 2) + "\n", "utf8");
  const man = JSON.parse(readFileSync(join(plugDir, "manifest.json"), "utf8"));
  man.version = installed;
  writeFileSync(join(plugDir, "manifest.json"), JSON.stringify(man, null, 2) + "\n", "utf8");
  await E("(async function(){ await app.plugins.disablePlugin(" + JSON.stringify(PLUGIN_ID) + ");" +
          " var m = app.plugins.manifests[" + JSON.stringify(PLUGIN_ID) + "]; if (m) m.version = " + JSON.stringify(installed) + ";" +
          " await app.plugins.enablePlugin(" + JSON.stringify(PLUGIN_ID) + "); return true; })()");
  await waitFor(c, "!!app.plugins.getPlugin(" + JSON.stringify(PLUGIN_ID) + ")", 30000, "the plugin reload");
  await sleep(400);
  const v = await E("app.plugins.getPlugin(" + JSON.stringify(PLUGIN_ID) + ").manifest.version");
  if (v !== installed) throw new Error("the reloaded plugin reports " + v + ", wanted " + installed);
}

async function settle(ms = 20000) {
  const deadline = Date.now() + ms;
  let prev = null, same = 0;
  for (;;) {
    const k = await E("(function(){ var v = " + VIEW + "; var api = v && v.handle && v.handle.api; if (!api || !api.graph || !api.renderer) return '';" +
                      " var sum = 0; api.graph.forEachNode(function (id, a) { sum += a.x + a.y + a.size; });" +
                      " var st = api.renderer.getCamera().getState(); return sum.toFixed(3) + '|' + st.ratio.toFixed(4); })()").catch(() => "");
    if (k && k === prev) { if (++same >= 3) return; } else { same = 0; }
    prev = k;
    if (Date.now() > deadline) return;
    await sleep(250);
  }
}

async function openGraph() {
  await E("app.commands.executeCommandById(" + JSON.stringify(PLUGIN_ID + ":open") + "); void 0");
  await waitFor(c, READY, OPEN_TIMEOUT_MS, "the graph");
  await settle();
}

async function closeGraph() {
  await E("(function(){ app.workspace.getLeavesOfType(" + JSON.stringify(VT) + ").forEach(function (l) { l.detach(); }); })(); void 0");
  await sleep(300);
}

const stripShown = () => E("!!" + STRIP);
const geometry = () => E("(function(){ var v = " + VIEW + "; var s = " + STRIP + "; var cv = v.contentEl.querySelector('#vg-canvas');" +
                         " var cam = v.handle.api.renderer.getCamera().getState();" +
                         " var page = v.contentEl.querySelector('.vault-graph');" +
                         " return { strip: s ? +s.getBoundingClientRect().height.toFixed(2) : 0, canvas: cv ? +cv.getBoundingClientRect().height.toFixed(2) : 0, view: v.contentEl.clientHeight," +
                         " placed: !!(s && page && s.parentElement === v.contentEl && s.nextElementSibling === page)," +
                         " cssTop: page ? getComputedStyle(page).getPropertyValue('--vg-canvas-top').trim() : ''," +
                         " x: +cam.x.toFixed(3), y: +cam.y.toFixed(3), ratio: +cam.ratio.toFixed(4) }; })()");

async function dismissModals() {
  for (let i = 0; i < 3; i++) {
    const open = await E("(function(){ var b = document.querySelector('.modal-close-button'); if (b) b.click(); return !!document.querySelector('.modal-container'); })()");
    if (!open) return;
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(300);
  }
}

async function shoot(name) {
  await dismissModals();
  await E("(function(){ document.querySelectorAll('.notice').forEach(function (n) { n.remove(); }); })(); void 0");
  const r = await c.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
  console.log("      " + name + ".png");
}

try {
  await placeElectronLeft(E, MAIN.w, MAIN.h);
  await E("new Promise(function (r) { app.workspace.onLayoutReady(function () { try { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); } catch (e) { } r(true); }); })");
  await sleep(500);
  const already = await E("!!app.plugins.getPlugin(" + JSON.stringify(PLUGIN_ID) + ")");
  if (!already) {
    await E("(async function(){ await app.plugins.setEnable(true); return true; })()");
    await sleep(1500);
    if (!await E("!!app.plugins.getPlugin(" + JSON.stringify(PLUGIN_ID) + ")")) {
      await E("(async function(){ await app.plugins.enablePluginAndSave(" + JSON.stringify(PLUGIN_ID) + "); return true; })()");
    }
  }
  await waitFor(c, "!!app.plugins.getPlugin(" + JSON.stringify(PLUGIN_ID) + ")", 30000, "the plugin load");
  await dismissModals();

  console.log("fresh install (no data.json, " + N + ")");
  await reloadPlugin(null, N);
  await openGraph();
  report(!await stripShown(), "a fresh install shows no note");
  report(lastSeen() === N, "a fresh install records the version", "lastSeenVersion " + lastSeen());
  await closeGraph();

  console.log("upgrade from before update notes ({ ghosts: true }, " + N + ")");
  await reloadPlugin({ ghosts: true }, N);
  await openGraph();
  report(await stripShown(), "an upgrade from a data.json without lastSeenVersion shows the note");
  report(lastSeen() === undefined, "nothing is recorded while the note is up", "lastSeenVersion " + lastSeen());
  const links = await E("(function(){ var s = " + STRIP + "; return s ? Array.prototype.map.call(s.querySelectorAll('a'), function (a) { return a.getAttribute('href') + ' ' + a.getAttribute('target'); }) : []; })()");
  report(links.length === 2 && links[0] === "https://github.com/luke321/vault-graph/releases/tag/" + N + " _blank" &&
         links[1] === "https://luke321.github.io/vault-graph/features.html _blank",
         "the strip links to the release page and the feature gallery, in a new window", links.join(" | "));
  const bullets = await E("(function(){ var s = " + STRIP + "; return s ? Array.prototype.map.call(s.querySelectorAll('li'), function (l) { return l.textContent; }) : []; })()");
  report(bullets.join("\n") === note.lines.join("\n"), "the bullets are the note file's, verbatim", bullets.length + " bullet" + (bullets.length === 1 ? "" : "s"));
  await shoot("01-strip-up");
  await closeGraph();
  await openGraph();
  report(await stripShown(), "reopening the view before dismissing shows it again");
  // github#83 -- one mount: across two, the cascade decides the ratio
  const up = await geometry();
  await E("(function(){ var s = " + STRIP + "; s.querySelector('.vg-whatsnew-ok').click(); })(); void 0");
  await settle();
  const after = await geometry();
  report(!await stripShown(), "dismissing removes the strip");
  report(lastSeen() === N, "dismissing records the installed version", "lastSeenVersion " + lastSeen());
  report(up.strip > 0 && Math.abs((after.canvas - up.canvas) - up.strip) <= 1,
         "the disc's canvas takes the strip's height back, within a pixel",
         "strip " + up.strip + " px, canvas " + up.canvas + " -> " + after.canvas + " px");
  report(up.placed, "the strip sits in the view above the page root, not inside it");
  report(up.x === 0.5 && up.y === 0.5 && after.x === 0.5 && after.y === 0.5 && up.ratio === after.ratio && up.cssTop !== "" && up.cssTop === after.cssTop,
         "the camera and --vg-canvas-top are the same with and without the strip",
         "camera (" + up.x + ", " + up.y + ", " + up.ratio + ") -> (" + after.x + ", " + after.y + ", " + after.ratio + "), --vg-canvas-top " + up.cssTop + " -> " + after.cssTop);
  await shoot("02-dismissed");
  await closeGraph();
  await openGraph();
  report(!await stripShown(), "reopening after dismissing shows nothing");
  await closeGraph();

  console.log("minor bump ({ lastSeenVersion: " + PREV_MINOR + " }, " + N + ")");
  await reloadPlugin({ lastSeenVersion: PREV_MINOR }, N);
  await openGraph();
  report(await stripShown(), "a MINOR bump shows the note");
  const one = await E("(function(){ var s = " + STRIP + "; return s ? Array.prototype.map.call(s.querySelectorAll('.vg-whatsnew-chain a'), function (a) { return a.textContent; }) : []; })()");
  report(one.length === 1 && one[0] === N, "one MINOR behind: the chain is the note's version alone", one.join(" \u2013 "));
  await closeGraph();

  await reloadPlugin(JSON.parse(readData()), N);
  await openGraph();
  report(await stripShown(), "a plugin restart before dismissing shows it again");
  report(lastSeen() === PREV_MINOR, "and still records nothing", "lastSeenVersion " + lastSeen());
  await closeGraph();

  const releases = parseReleases(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"));
  const FAR = releases.filter((r) => semver(r.version)[2] === 0 && semver(r.version)[0] === maj).map((r) => r.version).slice(-1)[0] || PREV_MINOR;
  const want = releaseChain({ releases, lastSeen: FAR, installed: N, note });
  console.log("several releases behind ({ lastSeenVersion: " + FAR + " }, " + N + ")");
  await reloadPlugin({ lastSeenVersion: FAR }, N);
  await openGraph();
  const got = await E("(function(){ var s = " + STRIP + "; return s ? Array.prototype.map.call(s.querySelectorAll('.vg-whatsnew-chain a'), function (a) { return { v: a.textContent, href: a.getAttribute('href'), title: a.getAttribute('title') || '' }; }) : []; })()");
  report(got.length === want.length && got.every((g, i) => g.v === want[i].version && g.href === "https://github.com/luke321/vault-graph/releases/tag/" + want[i].version && g.title === want[i].name),
         "the chain lists every x.y.0 since " + FAR + ", oldest first, each linking its own release page, the name on hover",
         got.map((g) => g.v + (g.title ? " (" + g.title + ")" : "")).join(" \u2013 "));
  report(got.length >= 2 && got[0].v !== FAR && got[got.length - 1].v === N && got.every((g, i) => !i || semver(g.v)[1] > semver(got[i - 1].v)[1] || semver(g.v)[0] > semver(got[i - 1].v)[0]),
         "the chain starts after the version last seen, ends at the note's, and climbs", got.length + " links");
  await shoot("03-chain");
  await closeGraph();

  console.log("the controls a note points at (github#83)");
  await reloadPlugin({ lastSeenVersion: PREV_MINOR }, N);
  await openGraph();
  const POINT = "vg-dim";
  await E("(function(){ var p = app.plugins.getPlugin(" + JSON.stringify(PLUGIN_ID) + ");" +
          " var v = " + VIEW + "; p.pendingNote = { version: p.manifest.version, lines: ['x'], points: [" + JSON.stringify(POINT) + "] };" +
          " v.markNew(); })(); void 0");
  await sleep(300);
  const lit = await E("(function(){ var v = " + VIEW + "; var el = v.contentEl.querySelector('#" + POINT + "');" +
                      " if (!el) return null; var cs = getComputedStyle(el);" +
                      " return { on: el.classList.contains('vg-new'), anim: cs.animationName, dur: cs.animationDuration }; })()");
  report(!!lit && lit.on && lit.anim === "vg-new-pulse",
         "a control the note points at carries the pulse while the strip is up",
         lit ? lit.anim + " " + lit.dur : "the control was not found");
  await E("(function(){ var v = " + VIEW + "; v.contentEl.querySelector('.vg-whatsnew-ok').click(); })(); void 0");
  await sleep(700);
  const out = await E("(function(){ var v = " + VIEW + "; return v.contentEl.querySelectorAll('.vg-new').length; })()");
  report(out === 0, "dismissing stops the pulse", out + " still pulsing");
  await closeGraph();
  await openGraph();
  const reopened = await E("(function(){ var v = " + VIEW + "; return v.contentEl.querySelectorAll('.vg-new').length; })()");
  report(reopened === 0, "and it does not come back when the view is reopened", reopened + " pulsing");
  await closeGraph();

  console.log("patch bump ({ lastSeenVersion: " + N + " }, " + NEXT_PATCH + ")");
  await reloadPlugin({ lastSeenVersion: N }, NEXT_PATCH);
  await openGraph();
  report(!await stripShown(), "a PATCH bump shows nothing");
  report(lastSeen() === NEXT_PATCH, "a PATCH bump records the version", "lastSeenVersion " + lastSeen());
  await closeGraph();

  console.log("already seen ({ lastSeenVersion: " + N + " }, " + N + ")");
  await reloadPlugin({ lastSeenVersion: N }, N);
  const bytesBefore = readData();
  await openGraph();
  report(!await stripShown(), "an already-seen version shows nothing");
  report(readData() === bytesBefore, "and writes nothing", "data.json unchanged");
  await closeGraph();

  console.log("note for another minor ({ lastSeenVersion: " + N + " }, " + NEXT_MINOR + ")");
  await reloadPlugin({ lastSeenVersion: N }, NEXT_MINOR);
  await openGraph();
  report(!await stripShown(), "a MINOR bump whose note is for another version shows nothing");
  report(lastSeen() === NEXT_MINOR, "and records the version", "lastSeenVersion " + lastSeen());
  await closeGraph();

  const errors = c.errors.filter((e) => /vault-graph|whatsnew|update-note/i.test(String(e.text)));
  report(errors.length === 0, "no console errors from the plugin", errors.map((e) => String(e.text).split("\n")[0]).join(" | "));
} finally {
  if (KEEP) {
    console.log("--keep: Obsidian left open on port " + PORT + ", vault " + vault);
  } else {
    try { c.close(); } catch { }
    killObsidian(ob.child);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log("update-note-check: " + (results.length - failed) + "/" + results.length + " passed" + (failed ? ", " + failed + " FAILED" : ""));
console.log("shots: " + OUT);
process.exit(failed ? 1 : 0);
