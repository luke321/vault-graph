// github#104

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname } from "node:path";

export function findChrome(named = "") {
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

const DOTTED = /\d+\.\d+\.\d+\.\d+/;

function compareVersions(a, b) {
  const pa = a.split("."), pb = b.split(".");
  for (let i = 0; i < 4; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d;
  }
  return 0;
}

// github#104 -- on Windows --version launches the browser and prints nothing
export function chromeVersion(exe) {
  if (!exe) return null;
  if (/\.exe$/i.test(exe)) {
    let entries = [];
    try { entries = readdirSync(dirname(exe)); } catch { return null; }
    const vers = entries.filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d)).sort(compareVersions);
    return vers.length ? vers[vers.length - 1] : null;
  }
  const r = spawnSync(exe, ["--version"], { encoding: "utf8", timeout: 5000 });
  const m = DOTTED.exec(r.stdout || "");
  return m ? m[0] : null;
}

// github#104
export function normaliseVersion(v) {
  const m = DOTTED.exec(String(v || ""));
  return m ? m[0] : null;
}
