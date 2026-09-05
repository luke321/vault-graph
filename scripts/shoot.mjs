#!/usr/bin/env node

import { attach } from "./cdp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = Number(arg("port", 9355));
const OUT = resolve(arg("out", join(ROOT, "shots")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const named = arg("chrome", "");
  if (named) return named;
  const guesses = [
    process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ];
  for (const g of guesses) if (g && existsSync(g)) return g;
  throw new Error("Chrome not found; pass --chrome <path>");
}

let url = arg("url", "");
let scratch = null;
if (!url) {
  const vault = arg("vault", "");
  scratch = join(mkdtempSync(join(tmpdir(), "vg-shoot-")), "vault-graph.html");
  const b = spawnSync(process.execPath,
    [join(HERE, "..", "src", "build-graph.mjs"), "--out", scratch].concat(vault ? ["--vault", vault] : []),
    { encoding: "utf8" });
  if (b.status !== 0) throw new Error("build failed:\n" + (b.stderr || ""));
  process.stdout.write(b.stdout || "");
  url = pathToFileURL(scratch).href;
}

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "vg-shoot-profile-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check",
  "--window-position=-2400,0", "--window-size=1600,1000", `--app=${url}`,
], { stdio: "ignore" });

let page = null;
try {
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(500);
    try { page = await attach(PORT, ""); } catch { }
  }
  if (!page) throw new Error("could not attach to Chrome");

  for (let i = 0; i < 60; i++) {
    const ok = await page.eval("!!window.__vg && __vg.state.until === null").catch(() => false);
    if (ok) break;
    await sleep(300);
  }
  for (let i = 0; i < 60; i++) {
    const busy = await page.eval("!!(window.__vg && __vg.demo && __vg.demo.busy && __vg.demo.busy())")
                           .catch(() => false);
    if (!busy) break;
    await sleep(200);
  }
  await sleep(600);

  const settle = async (ms) => {
    const deadline = Date.now() + (ms || 8000);
    for (;;) {
      const busy = await page.eval("!!(window.__vg && __vg.demo && __vg.demo.busy && __vg.demo.busy())")
                             .catch(() => false);
      if (!busy) { await sleep(250); return true; }
      if (Date.now() > deadline) return false;
      await sleep(120);
    }
  };

  const shoot = async (name) => {
    const r = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
    console.log("  " + name + ".png");
  };

  await shoot("01-dark");

  const setTheme = (t) => page.eval(
    `(function(){ var el = document.querySelector(".vault-graph") || document.documentElement;
                  el.setAttribute("data-theme", ${JSON.stringify(t)});
                  if (window.__vg && __vg.readTheme) { __vg.readTheme(); __vg.renderer.refresh();
                    if (__vg.placeLogo) __vg.placeLogo();
                    if (__vg.heatBuild) __vg.heatBuild(); } })(); void 0`);

  await setTheme("light");
  await sleep(900);
  await shoot("02-light");
  await setTheme("dark");
  await sleep(900);

  await setTheme("light");
  await sleep(700);
  await page.eval(`(function(){
    var r = document.querySelector("#vg-legend .lg") || document.querySelector("#legend .lg");
    if (r) r.click();
  })(); void 0`);
  await sleep(1500);
  await shoot("04-light-highlight");
  await setTheme("dark");
  await sleep(700);
  await shoot("05-dark-highlight");
  await page.eval(`(function(){
    var r = document.querySelector("#vg-legend .lg") || document.querySelector("#legend .lg");
    if (r) r.click();
  })(); void 0`);
  await sleep(900);

  await page.eval(`(function(){
    var e = document.querySelector("#vg-legend .eye") || document.querySelector("#legend .eye");
    if (e) e.click();
  })(); void 0`);
  await settle();
  await shoot("03-one-folder-hidden");

  console.log("wrote " + OUT);
} finally {
  if (page) page.close();
  try { chrome.kill(); } catch {}
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  if (scratch) { try { rmSync(dirname(scratch), { recursive: true, force: true }); } catch {} }
}
