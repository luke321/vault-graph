#!/usr/bin/env node
// github#72, design/0014

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, copyFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attach } from "./cdp.mjs";
import { keepFocus } from "./focus.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes("--" + n);
const PORT = Number(arg("port", 9471));
const MONITOR = arg("monitor", "right");
const KEEP = flag("keep");
const TEMP = process.env.TEMP || "/tmp";
const VAULT = resolve(arg("vault", join(TEMP, "vg-live-vault")));
const PROFILE = join(TEMP, "vg-live-profile");
const WIDTH = Number(arg("width", 1600)), HEIGHT = Number(arg("height", 1000));
const FPS = Number(arg("fps", 30));
const now = new Date();
const two = (n) => String(n).padStart(2, "0");
const stamp = now.getFullYear() + "-" + two(now.getMonth() + 1) + "-" + two(now.getDate()) + "-" +
  two(now.getHours()) + two(now.getMinutes()) + two(now.getSeconds());
const OUT = resolve(arg("out", join(ROOT, "demo-obsidian-live-" + stamp + ".mp4")));
const VT = "vault-graph-view";
const ID = "vault-graph";

const NOTES = [
  { ring: "outer", path: "05 - Meeting Notes/2026-09-10 Live refresh demo.md",
    body: "# Live refresh demo\n\nWritten with the graph open in the next tab. Follows up on [[2018-04-03 Budget check-in]].\n" },
  { ring: "inner", path: "07 - Weekly Reviews/2026-W37.md",
    body: "# 2026-W37\n\nThe week the disc learned to follow the vault. Last one like it: [[2017-W12]].\n" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(2) + "s";
const log = (m) => console.log("[" + el() + "] " + m);

/* --------------------------------------------------------------- setup -- */

function findObsidian() {
  const named = arg("obsidian", "");
  if (named) return named;
  for (const g of [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Obsidian", "Obsidian.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Obsidian", "Obsidian.exe"),
  ].filter(Boolean)) if (existsSync(g)) return g;
  throw new Error("Obsidian not found -- pass --obsidian <path>");
}

function findFfmpeg() {
  const w = spawnSync("where.exe", ["ffmpeg"], { encoding: "utf8" });
  const hit = (w.stdout || "").split(/\r?\n/).find((l) => l.trim());
  if (hit) return hit.trim();
  const winget = join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "ffmpeg.exe");
  if (existsSync(winget)) return winget;
  throw new Error("ffmpeg not found. winget install Gyan.FFmpeg");
}

/** @param {string} which */
function screen(which) {
  const pick = which === "primary" ? "Where-Object { $_.Primary } | Select-Object -First 1"
    : which === "left" ? "Sort-Object { $_.Bounds.X } | Select-Object -First 1"
    : "Sort-Object { $_.Bounds.X } | Select-Object -Last 1";
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | " + pick +
    " | ForEach-Object { '{0} {1} {2} {3}' -f $_.WorkingArea.X, $_.WorkingArea.Y, $_.WorkingArea.Width, $_.WorkingArea.Height }"],
    { encoding: "utf8" });
  const m = /(-?\d+) (-?\d+) (\d+) (\d+)/.exec((ps.stdout || "").trim());
  if (!m) throw new Error("no monitor matched --monitor " + which);
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}

function prepareVault() {
  rmSync(VAULT, { recursive: true, force: true });
  const gen = spawnSync(process.execPath, [join(HERE, "make-demo-vault.mjs"), "--out", VAULT], { encoding: "utf8" });
  if (gen.status !== 0) throw new Error("make-demo-vault failed: " + (gen.stderr || gen.stdout));
  const built = spawnSync(process.execPath, [join(HERE, "build-plugin.mjs")], { encoding: "utf8" });
  if (built.status !== 0) throw new Error("build-plugin failed: " + (built.stderr || built.stdout));
  const dot = join(VAULT, ".obsidian");
  const plug = join(dot, "plugins", ID);
  mkdirSync(plug, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(join(ROOT, f), join(plug, f));
  writeFileSync(join(dot, "community-plugins.json"), JSON.stringify([ID]) + "\n");
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  writeFileSync(join(PROFILE, "obsidian.json"),
    JSON.stringify({ vaults: { "0000livevault": { path: VAULT, ts: Date.now(), open: true } } }), "utf8");
}

/* ---------------------------------------------------------- the hand -- */

function hand() {
  const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", join(HERE, "win-input.ps1")], { stdio: ["pipe", "pipe", "inherit"] });
  /** @type {((line: string) => void)[]} */
  const waiting = [];
  let buf = "";
  ps.stdout.on("data", (d) => {
    buf += d.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      const w = waiting.shift();
      if (w) w(line);
    }
  });
  const ask = (cmd) => new Promise((res, rej) => {
    waiting.push((line) => (line.startsWith("ERR") ? rej(new Error(line)) : res(line)));
    ps.stdin.write(cmd + "\n");
  });
  let at = { x: 0, y: 0 };
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
  return {
    ask,
    async rect(pid) {
      const [L, T, R, B] = (await ask("rect " + pid)).split(" ").map(Number);
      return { L, T, R, B };
    },
    async jump(x, y) { at = { x, y }; return ask("move " + Math.round(x) + " " + Math.round(y)); },
    async glide(x, y, ms = 450) {
      const x0 = at.x, y0 = at.y, steps = Math.max(1, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) {
        const e = ease(i / steps);
        await ask("move " + Math.round(x0 + (x - x0) * e) + " " + Math.round(y0 + (y - y0) * e));
        await sleep(16);
      }
      at = { x, y };
    },
    async click(x, y) {
      await this.glide(x, y);
      await sleep(120);
      await ask("down"); await sleep(70); await ask("up");
    },
    close() { try { ps.stdin.write("quit\n"); } catch {} try { ps.kill(); } catch {} },
  };
}

/* ------------------------------------------------------------ obsidian -- */

async function connect() {
  for (let i = 0; i < 90; i++) {
    await sleep(700);
    let c = null;
    try { c = await attach(PORT, "app://obsidian.md"); } catch { continue; }
    try { if (await c.eval("typeof app !== 'undefined' && !!app.workspace")) return c; } catch {}
    try { c.close(); } catch {}
  }
  throw new Error("Obsidian never exposed its app on port " + PORT);
}

async function launch(exe, box) {
  // github#129
  const focus = await keepFocus();
  const child = spawn(exe, ["--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE, "--lang=en-US"], { stdio: "ignore" });
  void focus.watch(child.pid);
  let cdp;
  try {
    cdp = await connect();
    // design/0014
    const lang = await cdp.eval("localStorage.getItem('language')");
    if (lang !== "en") {
      log("language was " + JSON.stringify(lang) + " -- setting English and reloading");
      await cdp.eval("localStorage.setItem('language', 'en'); true");
      try { cdp.close(); } catch {}
      const again = await attach(PORT, "app://obsidian.md");
      again.eval("app.commands.executeCommandById('app:reload')").catch(() => {});
      await sleep(2500);
      try { again.close(); } catch {}
      cdp = await connect();
    }
    await cdp.eval(
      "(function(){ try { var e = window.require && window.require('electron');" +
      " var r = e && (e.remote || window.require('@electron/remote'));" +
      " if (r && r.getCurrentWindow) { r.getCurrentWindow().setBounds({ x: " + box.x + ", y: " + box.y +
      ", width: " + box.w + ", height: " + box.h + " }); return 'setBounds'; } } catch (err) { } return 'no'; })()");
    return { child, cdp };
  } catch (e) {
    try { child.kill(); } catch {}
    throw e;
  }
}

// design/0014
const POSITIONS =
  "(function(){ var g = window.__vg && __vg.graph; if (!g) return { order: 0, sum: 0, sig: '' };" +
  " var s = 0; g.forEachNode(function (id, a) { s += a.x * 7 + a.y * 3 + (a.size || 0); });" +
  " var to = document.getElementById('vg-to'), root = document.querySelector('.vault-graph');" +
  " return { order: g.order, sum: Math.round(s * 100) / 100, sig: (to && to.value) + '|' + (root && root.textContent.length) +" +
  " '|' + document.querySelectorAll('.notice').length }; })()";

/** @param {number} wantOrder @param {number} capMs @param {string} label @param {number} [quietPolls] */
async function settle(cdp, wantOrder, capMs, label, quietPolls = 4) {
  const start = Date.now();
  let last = null, quiet = 0, moved = false, arrivedAt = -1;
  for (;;) {
    const p = await cdp.eval(POSITIONS).catch(() => null);
    if (p) {
      if (arrivedAt < 0 && p.order >= wantOrder) { arrivedAt = Date.now() - start; log(label + ": the disc holds " + p.order + " notes"); }
      if (last && (p.sum !== last.sum || p.order !== last.order || p.sig !== last.sig)) { moved = true; quiet = 0; }
      else quiet++;
      last = p;
      if (p.order >= wantOrder && moved && quiet >= quietPolls) return { ms: Date.now() - start, arrivedAt };
    }
    if (Date.now() - start > capMs) {
      log(label + ": ! not settled after " + capMs + "ms (order " + (last && last.order) + ", moved " + moved + ")");
      return { ms: Date.now() - start, arrivedAt, timedOut: true };
    }
    await sleep(120);
  }
}

/* ----------------------------------------------------------------- run -- */

async function main() {
  const exe = findObsidian(), ffmpeg = findFfmpeg();
  const scr = screen(MONITOR);
  const box = { x: scr.x + Math.max(0, Math.round((scr.w - WIDTH) / 2)), y: scr.y + Math.max(0, Math.round((scr.h - HEIGHT) / 2)),
                w: Math.min(WIDTH, scr.w), h: Math.min(HEIGHT, scr.h) };
  log("vault " + VAULT);
  prepareVault();
  log("monitor " + MONITOR + " -> window at " + box.x + "," + box.y + " " + box.w + "x" + box.h);

  const h = hand();
  const session = await launch(exe, box);
  const { cdp, child } = session;
  let ff = null, failed = null, recStart = 0;
  try {
    // design/0014
    await cdp.eval(
      "(async () => { if (!app.plugins.getPlugin(" + JSON.stringify(ID) + ")) {" +
      "  await app.plugins.setEnable(true); await app.plugins.enablePluginAndSave(" + JSON.stringify(ID) + "); }" +
      " return !!app.plugins.getPlugin(" + JSON.stringify(ID) + "); })()");
    await sleep(1500);
    const loaded = await cdp.eval("!!app.plugins.getPlugin(" + JSON.stringify(ID) + ")");
    if (!loaded) throw new Error("the plugin did not load -- restricted mode is still on");
    await cdp.eval(
      "(function(){ document.querySelectorAll('.modal-container').forEach(function (m) { m.remove(); });" +
      " try { app.setting.close(); } catch (e) {}" +
      " app.workspace.iterateRootLeaves(function (l) { l.detach(); });" +
      " try { app.workspace.rightSplit.collapse(); } catch (e) {} return true; })()");
    await sleep(400);
    await cdp.eval("app.commands.executeCommandById('vault-graph:open')");
    const first = await settle(cdp, 1, 90000, "first draw", 12);
    log("the graph is up and at rest after " + first.ms + "ms");
    const dpr = await cdp.eval("window.devicePixelRatio");
    const content = await cdp.eval(
      "(function(){ var e = window.require('electron'); var r = e.remote || window.require('@electron/remote');" +
      " var b = r.getCurrentWindow().getContentBounds(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()");
    const rect = await h.rect(child.pid);
    log("window " + JSON.stringify(rect) + " content " + JSON.stringify(content) + " dpr " + dpr);
    const stray = await cdp.eval("document.querySelectorAll('.modal-container, .prompt').length");
    if (stray) throw new Error(stray + " modal(s) still on screen -- not recording that");

    /** @param {{ l: number, t: number, w: number, h: number }} r @param {number} [fx] @param {number} [fy] */
    const at = (r, fx = 0.5, fy = 0.5) => ({ x: content.x + (r.l + r.w * fx) * dpr, y: content.y + (r.t + r.h * fy) * dpr });
    const rectOf = async (expr) => cdp.eval(
      "(function(){ var e = " + expr + "; if (!e) return null; var r = e.getBoundingClientRect();" +
      " return { l: r.left, t: r.top, w: r.width, h: r.height }; })()");
    const graphTab = () => rectOf("app.workspace.getLeavesOfType(" + JSON.stringify(VT) + ")[0].tabHeaderEl");
    const park = async () => {
      const r = await rectOf("document.querySelector('.vault-graph')");
      const p = at(r, 0, 1); await h.glide(p.x + 18, p.y - 40, 380);
    };

    // design/0014
    const L = Math.max(content.x, scr.x), T = Math.max(content.y, scr.y);
    const R = Math.min(content.x + content.w, scr.x + scr.w), B = Math.min(content.y + content.h, scr.y + scr.h);
    const rw = (R - L) - ((R - L) % 2), rh = (B - T) - ((B - T) % 2);
    log("region " + rw + "x" + rh + " at " + L + "," + T);
    await park();
    ff = spawn(ffmpeg, ["-hide_banner", "-loglevel", "warning", "-f", "gdigrab", "-framerate", String(FPS), "-draw_mouse", "1",
      "-offset_x", String(L), "-offset_y", String(T), "-video_size", rw + "x" + rh, "-i", "desktop",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", OUT],
      { stdio: ["pipe", "inherit", "inherit"] });
    recStart = Date.now();
    log("ffmpeg pid " + ff.pid + ", recording");
    await sleep(1600);

    for (const note of NOTES) {
      const before = (await cdp.eval(POSITIONS)).order;
      const plus = await rectOf("document.querySelector('.workspace-tab-header-new-tab')");
      if (plus) { const p = at(plus); await h.click(p.x, p.y); }
      else await cdp.eval("app.workspace.getLeaf('tab'); true");
      await sleep(500);
      log("new tab; writing " + note.path);
      // design/0014
      await cdp.eval(
        "(async () => { const f = await app.vault.create(" + JSON.stringify(note.path) + ", '');" +
        " var leaf = app.workspace.activeLeaf; if (!leaf || leaf.view.getViewType() !== 'empty') leaf = app.workspace.getLeaf('tab');" +
        " await leaf.openFile(f); return true; })()");
      await sleep(600);
      // design/0014
      for (let i = 0; i < note.body.length; i += 3) {
        await cdp.eval(
          "(function(){ var ed = app.workspace.activeEditor && app.workspace.activeEditor.editor; if (!ed) return false;" +
          " var l = ed.lastLine(); ed.replaceRange(" + JSON.stringify(note.body.slice(i, i + 3)) + ", { line: l, ch: ed.getLine(l).length });" +
          " ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); return true; })()");
        await sleep(30);
      }
      // design/0014
      const cached = Date.now();
      for (;;) {
        const ok = await cdp.eval("(function(){ var c = app.metadataCache.getCache(" + JSON.stringify(note.path) + "); return !!(c && c.links && c.links.length); })()");
        if (ok || Date.now() - cached > 6000) { log("link indexed " + (ok ? "" : "NOT ") + "after " + (Date.now() - cached) + "ms"); break; }
        await sleep(150);
      }
      await sleep(700);
      const tab = await graphTab();
      const p = at(tab);
      await h.click(p.x, p.y);
      log("back on the graph tab");
      const s = await settle(cdp, before + 1, 20000, note.ring);
      log(note.ring + ": arrived " + s.arrivedAt + "ms after the click, at rest after " + s.ms + "ms");
      const dot = await cdp.eval(
        "(function(){ var g = __vg.graph, hit = null; g.forEachNode(function (id, a) { if (a.path === " + JSON.stringify(note.path) + ") hit = a; });" +
        " if (!hit) return null; var v = __vg.renderer.graphToViewport({ x: hit.x, y: hit.y });" +
        " var r = document.getElementById('vg-graph').getBoundingClientRect(); var rad = 0;" +
        " g.forEachNode(function (id, a) { rad = Math.max(rad, Math.hypot(a.x, a.y)); });" +
        " return { l: r.left + v.x, t: r.top + v.y, w: 0, h: 0, folder: hit.folder, r: Math.hypot(hit.x, hit.y) / rad }; })()");
      if (!dot) { log(note.ring + ": ! the note is not on the disc"); continue; }
      log(note.ring + ": " + note.path + " sits in " + dot.folder + " at " + (dot.r * 100).toFixed(0) + "% of the disc radius");
      const d = at(dot);
      await h.glide(d.x, d.y, 520);
      // design/0014
      const tipNow = () => cdp.eval("(function(){ var t = document.getElementById('vg-tip'); return t && !t.hidden ? t.textContent : ''; })()");
      let tip = "", where = "";
      for (let i = 0; i < 4 && !tip; i++) { await sleep(100); tip = await tipNow(); }
      const nudges = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]];
      for (let i = 0; i < nudges.length && !tip; i++) {
        where = await h.jump(Math.round(d.x) + nudges[i][0], Math.round(d.y) + nudges[i][1]);
        await sleep(120);
        tip = await tipNow();
        if (tip) log(note.ring + ": hit after a nudge of " + nudges[i].join(",") + " (cursor at " + where + ", aimed " + Math.round(d.x) + "," + Math.round(d.y) + ")");
      }
      log(note.ring + ": " + (tip ? "hovered -- tooltip says " + JSON.stringify(tip.slice(0, 60)) : "! no tooltip: the hover missed the dot at " + Math.round(d.x) + "," + Math.round(d.y)));
      await sleep(1400);
      await park();
      await sleep(500);
    }
    await sleep(1100);
    log("done; recorded " + ((Date.now() - recStart) / 1000).toFixed(1) + "s");
  } catch (e) {
    failed = e;
  } finally {
    if (ff) {
      try { ff.stdin.write("q\n"); } catch {}
      await new Promise((r) => { const t = setTimeout(() => { try { ff.kill(); } catch {} r(); }, 10000); ff.on("exit", () => { clearTimeout(t); r(); }); });
    }
    h.close();
    try { cdp.close(); } catch {}
    if (!KEEP) {
      try { child.kill(); } catch {}
      spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
    }
  }
  if (failed) throw failed;
  if (!existsSync(OUT)) throw new Error("ffmpeg produced no file");
  console.log("\nwrote " + OUT + " (" + (statSync(OUT).size / 1048576).toFixed(2) + " MB)");
}

main().catch((e) => { console.error("record-live: " + (e && e.stack || e)); process.exit(1); });
