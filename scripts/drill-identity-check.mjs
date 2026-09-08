#!/usr/bin/env node
// github#76

/* ------------------------------------------------- the drilled identity harness */
// github#76

import { attach } from "./cdp.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { leftWindowArgs } from "./screen.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const KEEP = argv.indexOf("--keep") >= 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NOTES = {
  "People/Outside.md":            "# Outside\n\nA top-level People note. Links to [[Inside]].\n",
  "Resources/People/Inside.md":   "# Inside\n\nUnder Resources/People. Links to [[Other]].\n",
  "Resources/People/Team/Deep.md": "# Deep\n\nA subfolder of the drilled People. Links to [[Inside]].\n",
  "Resources/Other/Other.md":     "# Other\n\nUnder Resources/Other. Links to [[Outside]].\n",
};

function makeVault() {
  const dir = mkdtempSync(join(tmpdir(), "vg-collision-"));
  mkdirSync(join(dir, ".obsidian"), { recursive: true });
  writeFileSync(join(dir, ".obsidian", "app.json"), "{}\n", "utf8");
  for (const [rel, body] of Object.entries(NOTES)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, "utf8");
  }
  return dir;
}

function findChrome() {
  for (const g of [
    process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ]) if (g && existsSync(g)) return g;
  throw new Error("Chrome not found");
}

async function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
  console.log(`          ${detail}`);
}

const vault = makeVault();
const htmlDir = mkdtempSync(join(tmpdir(), "vg-collision-html-"));
const htmlPath = join(htmlDir, "vault-graph.html");
const b = spawnSync(process.execPath,
  [join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", htmlPath], { encoding: "utf8" });
if (b.status !== 0) { console.error("build failed:\n" + (b.stderr || "")); process.exit(1); }

const PORT = Number(arg("port", String(await freePort())));
const profile = mkdtempSync(join(tmpdir(), "vg-collision-profile-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-component-update", "--disable-sync", "--mute-audio",
  "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  ...leftWindowArgs(1400, 900), `--app=${pathToFileURL(htmlPath).href}?rest`,
], { stdio: "ignore", detached: false });

let page = null;
try {
  const dl = Date.now() + 25000;
  for (;;) {
    try { page = await attach(PORT, "vault-graph.html"); break; }
    catch (e) { if (Date.now() > dl) throw e; await sleep(400); }
  }
  const J = async (e) => JSON.parse(await page.eval("JSON.stringify(" + e + ")"));
  const ready = Date.now() + 30000;
  for (;;) {
    if (await page.eval("!!(window.__vg && __vg.state.until === null)").catch(() => false)) break;
    if (Date.now() > ready) throw new Error("the page never finished its intro");
    await sleep(300);
  }
  for (;;) { if (!(await page.eval("!!__vg.demo.busy()").catch(() => false))) break; await sleep(120); }

  const ROOTF = "Resources", CHILD = "People";
  const idOf = `(function(label){ var found = null;
    __vg.graph.forEachNode(function (id, a) { if (a.label === label) found = id; }); return found; })`;
  const outside = await J(`${idOf}("Outside")`);
  const inside = await J(`${idOf}("Inside")`);
  if (!outside || !inside) throw new Error("the collision vault did not export both notes");

  const vaultSlots = await J(`(function(){ var m = {};
    __vg.groupOrder().forEach(function (g) { m[g] = __vg.slotOf(g); }); return m; })()`);

  /* --------------------------------------------------------- highlight */
  await page.eval(`__vg.setRoot(${JSON.stringify(ROOTF)}, true); void 0`);
  await sleep(200);
  await page.eval(`(function(){
    var b = document.querySelector('#vg-legend .lg[data-g=${JSON.stringify(CHILD)}]');
    if (!b) throw new Error("no drilled row for ${CHILD}");
    b.click(); })(); void 0`);
  await sleep(400);
  const hl = await J(`{ keys: Object.keys(__vg.state.highlight),
                        inside: __vg.isHighlighted(${JSON.stringify(inside)}),
                        outside: __vg.isHighlighted(${JSON.stringify(outside)}) }`);
  check("a drilled group highlight is keyed by the absolute folder path",
        hl.keys.length === 1 && hl.keys[0] === ROOTF + "/" + CHILD,
        `state.highlight = ${JSON.stringify(hl.keys)}, want ["${ROOTF}/${CHILD}"]`);
  check("a drilled highlight does not reach a note outside the root",
        hl.inside === true && hl.outside === false,
        `Resources/People/Inside highlighted ${hl.inside} (want true), ` +
        `People/Outside highlighted ${hl.outside} (want false)`);

  await page.eval(`__vg.setRoot(null, true); void 0`);
  await sleep(300);
  const after = await J(`{ inside: __vg.isHighlighted(${JSON.stringify(inside)}),
                           outside: __vg.isHighlighted(${JSON.stringify(outside)}) }`);
  check("leaving the root does not move the highlight to the same-named top-level folder",
        after.outside === false,
        `back in the vault disc: People/Outside highlighted ${after.outside} (want false), ` +
        `Resources/People/Inside ${after.inside}`);
  await page.eval(`__vg.state.highlight = {}; __vg.applyLayout(false); void 0`);

  /* ------------------------------------------------------------ colour */
  await page.eval(`__vg.setRoot(${JSON.stringify(ROOTF)}, true); void 0`);
  await sleep(200);
  const picked = await J(`(function(){
    var row = document.querySelector('#vg-legend .lg[data-g=${JSON.stringify(CHILD)}]');
    var r = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu",
      { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 }));
    var menu = document.querySelector("#vg-ctxmenu");
    if (!menu || menu.hidden) return { opened: false };
    var sw = menu.querySelector('[data-key="g9"]');
    if (!sw) return { opened: true, swatch: false };
    sw.click();
    return { opened: true, swatch: true };
  })()`);
  await sleep(400);
  const drilledSlot = await J(`__vg.slotOf(${JSON.stringify(CHILD)})`);
  check("a drilled colour pick actually recolours the child it was aimed at",
        drilledSlot === "g9",
        `while rooted at ${ROOTF}, child ${CHILD} slot is ${JSON.stringify(drilledSlot)} (want "g9")`);
  await page.eval(`__vg.setRoot(null, true); void 0`);
  await sleep(300);
  const slotsBack = await J(`(function(){ var m = {};
    __vg.groupOrder().forEach(function (g) { m[g] = __vg.slotOf(g); }); return m; })()`);
  const savedColors = await J(`__vg.folderColors`);
  const bare = Object.keys(savedColors).filter((k) => k.indexOf("/") < 0 && k !== ROOTF);
  check("a drilled colour pick never repaints the same-named top-level folder",
        slotsBack[CHILD] === vaultSlots[CHILD],
        `menu ${picked.opened ? (picked.swatch ? "opened, picked g9" : "opened with no swatch") : "did not open"}; ` +
        `top-level ${CHILD} slot ${vaultSlots[CHILD]} -> ${slotsBack[CHILD]}; ` +
        `saved folderColors keys ${JSON.stringify(Object.keys(savedColors))}`);
  check("a drilled colour pick writes no bare child name into the saved overrides",
        bare.length === 0,
        `bare (non-path) keys other than the root itself: ${JSON.stringify(bare)}`);
  await page.eval(`__vg.setFolderColors({}); void 0`);

  /* ------------------------------------------------ default visibility */
  await page.eval(`__vg.setRoot(${JSON.stringify(ROOTF)}, true); void 0`);
  await sleep(200);
  const vis = await J(`(function(){
    var row = document.querySelector('#vg-legend .lg[data-g=${JSON.stringify(CHILD)}]');
    var r = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu",
      { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 }));
    var menu = document.querySelector("#vg-ctxmenu");
    if (!menu || menu.hidden) return { opened: false };
    var v = menu.querySelector("[data-vis]");
    if (!v) return { opened: true, toggle: false };
    v.click();
    return { opened: true, toggle: true };
  })()`);
  await sleep(400);
  await page.eval(`__vg.setRoot(null, true); void 0`);
  await sleep(300);
  const shown = await J(`__vg.folderShown`);
  const bareShown = Object.keys(shown).filter((k) => k.indexOf("/") < 0 && k !== ROOTF);
  const outVisible = await J(`__vg.visible(${JSON.stringify(outside)})`);
  check("a drilled default-visibility toggle never hides the same-named top-level folder",
        bareShown.length === 0 && outVisible === true,
        `menu ${vis.opened ? (vis.toggle ? "opened, toggled" : "opened with no toggle") : "did not open"}; ` +
        `folderShown ${JSON.stringify(shown)}; People/Outside visible ${outVisible} (want true)`);
  await page.eval(`__vg.setFolderShown({}); __vg.state.hidden.folder = {};
                   __vg.state.hiddenSub = {}; __vg.applyLayout(false); void 0`);

  /* ---------------------------------------------------- subfolder pick */
  await page.eval(`__vg.setRoot(${JSON.stringify(ROOTF)}, true); void 0`);
  await sleep(200);
  // github#76
  await page.eval(`(function(){
    if (document.querySelector('#vg-legend .lgs[data-hsub=${JSON.stringify(CHILD)}]')) return;
    var tw = document.querySelector('#vg-legend [data-tw=${JSON.stringify(CHILD)}]');
    if (tw) tw.click(); })(); void 0`);
  await sleep(300);
  const subPick = await J(`(function(){
    var row = document.querySelector('#vg-legend .lgs[data-hsub=${JSON.stringify(CHILD)}]');
    if (!row) return { row: false,
      why: { subs: __vg.subOrderOf(${JSON.stringify(CHILD)}), count: __vg.groupCount(${JSON.stringify(CHILD)}),
             collapsed: !!__vg.state.collapsed[${JSON.stringify(CHILD)}],
             twisty: !!document.querySelector('#vg-legend [data-tw=${JSON.stringify(CHILD)}]'),
             rows: Array.prototype.map.call(document.querySelectorAll('#vg-legend .lgs[data-hsub]'),
                                            function (b) { return b.getAttribute("data-hsub"); }) } };
    var r = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu",
      { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 }));
    var menu = document.querySelector("#vg-ctxmenu");
    if (!menu || menu.hidden) return { row: true, opened: false };
    var sw = menu.querySelector('[data-key="g9"]');
    if (!sw) return { row: true, opened: true, swatch: false };
    sw.click();
    return { row: true, opened: true, swatch: true };
  })()`);
  await sleep(400);
  const savedSubs = await J(`__vg.subfolderColors`);
  const badSub = Object.keys(savedSubs).filter((k) => k.indexOf(ROOTF + "/") !== 0);
  check("a drilled subfolder pick writes no vault-level subfolder key",
        subPick.row === true && subPick.swatch === true &&
        Object.keys(savedSubs).length > 0 && badSub.length === 0,
        `menu ${subPick.row ? (subPick.opened ? (subPick.swatch ? "opened, picked g9" : "opened with no swatch") : "did not open")
                            : "no sub row " + JSON.stringify(subPick.why)}; ` +
        `saved subfolderColors keys ${JSON.stringify(Object.keys(savedSubs))}; ` +
        `keys not under "${ROOTF}/": ${JSON.stringify(badSub)}`);
  await page.eval(`__vg.setRoot(null, true); __vg.setSubfolderColors({}); void 0`);

  const errs = page.errors.length ? page.firstError() : "";
  check("the page logged no console error", !errs, errs || "no console errors");
} finally {
  if (page) page.close();
  try { chrome.kill(); } catch { }
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { }
  if (!KEEP) {
    try { rmSync(vault, { recursive: true, force: true }); } catch { }
    try { rmSync(htmlDir, { recursive: true, force: true }); } catch { }
  } else {
    console.log("\nkept: " + vault + "\n       " + htmlPath);
  }
}

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) {
  console.log("failed: " + bad.map((r) => r.name).join("; "));
  process.exit(1);
}
