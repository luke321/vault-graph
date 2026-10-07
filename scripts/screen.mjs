// github#40, design/0012, github#192 -- the hook's screen, else the leftmost
import { spawnSync } from "node:child_process";

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */

/** @type {(Box & { primary: boolean })[] | null} */
let cached = null;
let chosen = "left";
/** @type {Box | null} */
let region = null;

function allScreens() {
  if (cached) return cached;
  const fallback = [{ x: -2400, y: 0, w: 1920, h: 1080, primary: true }];
  if (process.platform !== "win32") return (cached = fallback);
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Add-Type -AssemblyName System.Windows.Forms; " +
    "[System.Windows.Forms.Screen]::AllScreens | Sort-Object { $_.WorkingArea.Left } | " +
    "ForEach-Object { '{0} {1} {2} {3} {4}' -f $_.WorkingArea.Left, $_.WorkingArea.Top, " +
    "$_.WorkingArea.Width, $_.WorkingArea.Height, [int]$_.Primary }"], { encoding: "utf8" });
  const found = [];
  for (const line of (ps.stdout || "").split(/\r?\n/)) {
    const m = /(-?\d+) (-?\d+) (\d+) (\d+) ([01])/.exec(line.trim());
    if (m) found.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], primary: m[5] === "1" });
  }
  cached = found.length ? found : fallback;
  return cached;
}

/** @param {Box & { primary?: boolean }} s @returns {Box} */
const box = (s) => ({ x: s.x, y: s.y, w: s.w, h: s.h });

/** @param {string} which left | right | primary @param {Box | null} [part] */
export function useScreen(which, part = null) { chosen = which; region = part; }

/** @returns {Box} */
export function leftmostScreen() { return box(allScreens()[0]); }

/** @returns {Box} */
export function harnessScreen() {
  if (region) return box(region);
  const all = allScreens();
  if (chosen === "right") return box(all[all.length - 1]);
  if (chosen === "primary") return box(all.find((s) => s.primary) || all[0]);
  return box(all[0]);
}

/** @param {number} [w] @param {number} [h] @returns {Box} */
export function leftWindow(w = 1600, h = 1000) {
  const s = harnessScreen();
  const ww = Math.min(w, s.w), hh = Math.min(h, s.h);
  return { x: s.x + Math.max(0, Math.round((s.w - ww) / 2)),
           y: s.y + Math.max(0, Math.round((s.h - hh) / 2)), w: ww, h: hh };
}

/** @param {number} [w] @param {number} [h] @returns {string[]} */
export function leftWindowArgs(w = 1600, h = 1000) {
  const b = leftWindow(w, h);
  return ["--window-position=" + b.x + "," + b.y, "--window-size=" + b.w + "," + b.h];
}

/** @param {number} [w] @param {number} [h] @returns {string} */
export function leftWindowPos(w = 1600, h = 1000) {
  const b = leftWindow(w, h);
  return "--window-position=" + b.x + "," + b.y;
}

// design/0012 -- Electron ignores moveTo for its own main window
/** @param {(expr: string) => Promise<unknown>} evalIn @param {number} [w] @param {number} [h] */
export function placeElectronLeft(evalIn, w = 1600, h = 1000) {
  const b = leftWindow(w, h);
  return evalIn(
    "(function(){ try { var e = window.require && window.require('electron');" +
    " var r = e && (e.remote || window.require('@electron/remote'));" +
    " if (r && r.getCurrentWindow) { r.getCurrentWindow().setBounds({ x: " + b.x + ", y: " + b.y +
    ", width: " + b.w + ", height: " + b.h + " }); return 'setBounds'; } } catch (err) { }" +
    " try { window.moveTo(" + b.x + ", " + b.y + "); window.resizeTo(" + b.w + ", " + b.h +
    "); } catch (err) { } return 'moveTo'; })()");
}
