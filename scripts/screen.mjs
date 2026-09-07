// github#40, design/0012 -- harness windows go on the leftmost screen
import { spawnSync } from "node:child_process";

/** @type {{ x: number, y: number, w: number, h: number } | null} */
let cached = null;

/** @returns {{ x: number, y: number, w: number, h: number }} */
export function leftmostScreen() {
  if (cached) return cached;
  const fallback = { x: -2400, y: 0, w: 1920, h: 1080 };
  if (process.platform !== "win32") return (cached = fallback);
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Add-Type -AssemblyName System.Windows.Forms; " +
    "[System.Windows.Forms.Screen]::AllScreens | Sort-Object { $_.WorkingArea.Left } | Select-Object -First 1 | " +
    "ForEach-Object { '{0} {1} {2} {3}' -f $_.WorkingArea.Left, $_.WorkingArea.Top, " +
    "$_.WorkingArea.Width, $_.WorkingArea.Height }"], { encoding: "utf8" });
  const m = /(-?\d+) (-?\d+) (\d+) (\d+)/.exec((ps.stdout || "").trim());
  cached = m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : fallback;
  return cached;
}

/** @param {number} [w] @param {number} [h] @returns {{ x: number, y: number, w: number, h: number }} */
export function leftWindow(w = 1600, h = 1000) {
  const s = leftmostScreen();
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
