#!/usr/bin/env node
// github#140 -- holds a render open on a latch, so a stale build can be seen
// github#140 -- the real VaultGraphView, stubbed hosts, headless Chrome
// github#140 -- why, and the numbers: .ai-context/invariants.md
// github#140 -- node scripts/render-race-check.mjs [--keep]

import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { attach } from "./cdp.mjs";
import { findChrome } from "./chrome.mjs";
import { parseReleases } from "../plugin/update-note.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const KEEP = argv.includes("--keep");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ stubs -- */

const OBSIDIAN_STUB = `
// The DOM sugar Obsidian adds to HTMLElement. Only what plugin/main.js actually calls.
const P = HTMLElement.prototype;
P.addClass = function (c) { this.classList.add(c); return this; };
P.removeClass = function (c) { this.classList.remove(c); return this; };
P.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
P.appendText = function (t) { this.appendChild(document.createTextNode(t)); };
P.createEl = function (tag, o) {
  const el = this.ownerDocument.createElement(tag);
  if (o && o.cls) el.className = o.cls;
  if (o && o.text) el.textContent = o.text;
  if (o && o.href) el.setAttribute("href", o.href);
  if (o && o.attr) for (const k of Object.keys(o.attr)) el.setAttribute(k, String(o.attr[k]));
  this.appendChild(el);
  return el;
};
P.createDiv = function (o) { return this.createEl("div", o); };
P.createSpan = function (o) { return this.createEl("span", o); };
// Obsidian augments Node with these two: this node's document/window, or the global one.
Object.defineProperty(P, "doc", { get() { return this.ownerDocument || document; } });
Object.defineProperty(P, "win", { get() { return this.doc.defaultView || window; } });

export class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = document.createElement("div");
    this.contentEl = document.createElement("div");
    this.containerEl.appendChild(this.contentEl);
    document.body.appendChild(this.containerEl);
    this.__refs = [];
  }
  registerEvent(ref) { this.__refs.push(ref); }
  registerDomEvent(el, type, fn) { el.addEventListener(type, fn); }
}

export class Plugin {}
export class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
export class Setting { constructor() {} }
export class Notice { constructor(msg) { window.__race.notices.push(String(msg)); } }
export function normalizePath(p) { return String(p).replace(/\\\\/g, "/").replace(/\\/{2,}/g, "/"); }
export function addIcon() {}
`;

const PAGE_STUB = `
// Stands in for mountVaultGraph. Records every mount, and whether destroy() reached it --
// which is the whole measurement: an unreachable mount is one that stayed alive.
let seq = 0;
export function mountVaultGraph(page, data, deps) {
  const tag = (data && data._spike && data._spike.templateDirs[0]) || "?";
  const h = {
    id: ++seq,
    tag: tag,
    alive: true,
    page: page,
    win: deps && deps.win,
    doc: page && page.ownerDocument,
    onRefresh: deps && deps.onRefresh,
    api: {
      setWords() {},
      applyData() { return {}; },
      interacting() { return false; },
      readTheme() {},
      placeLogo() {},
      heatBuild() {},
      renderer: { refresh() {} },
    },
    destroy() { this.alive = false; },
  };
  window.__race.mounts.push(h);
  return h;
}
`;

const ENGINE_STUB = `export class GraphStore {}\nexport class Renderer {}\n`;

// github#140 -- the in-page driver; every assertion is made in Node
const DRIVER = `
import { VaultGraphView } from "__PLUGIN_MAIN__";

const H = {
  mounts: [], notices: [], latches: [], runs: [],
  armed: null, readTag: "",
};
window.__race = H;
document.body.className = "theme-dark";

// THE POPOUT, MODELLED. activeWindow/activeDocument name whichever window has focus, and for
// a view living in a popout that is routinely not its own. An iframe gives this harness a
// second real window and document to point them at, carrying the OTHER theme -- so reading
// the active one instead of the view's own becomes a wrong data-theme and a wrong win on the
// mount, rather than being invisible the way it is in a single-window test.
const decoy = document.createElement("iframe");
document.body.appendChild(decoy);
decoy.contentDocument.body.className = "theme-light";
window.activeWindow = decoy.contentWindow;
window.activeDocument = decoy.contentDocument;

const FILES = ["one.md", "two.md", "three.md"].map((p, i) => ({
  path: p, name: p, basename: p.replace(/\\.md$/, ""), extension: "md",
  stat: { ctime: 1700000000000 + i, mtime: 1700000000000 + i, size: 10 },
}));

const app = {
  vault: {
    configDir: ".obsidian",
    getName: () => "race-vault",
    getMarkdownFiles: () => FILES.slice(),
    cachedRead: async () => "body words here",
    on: (name, fn) => ({ name: name, fn: fn }),
    // The latch. readConfigJson() does exists() then read(), and the read call is made in
    // the same microtask the exists promise resolves into -- so stamping readTag as this
    // build's exists resolves is safe: nothing can run in between and change it. That is
    // what carries a per-build tag all the way to data._spike.templateDirs.
    adapter: {
      exists: () => {
        const a = H.armed;
        if (!a) return Promise.resolve(false);
        H.armed = null;
        return a.p.then(() => { H.readTag = a.tag; return true; });
      },
      read: () => Promise.resolve(JSON.stringify({ folder: H.readTag })),
    },
  },
  metadataCache: {
    getFileCache: () => ({ frontmatter: {}, tags: [], links: [] }),
    resolvedLinks: { "one.md": { "two.md": 1 }, "two.md": { "three.md": 1 } },
    unresolvedLinks: {},
    on: (name, fn) => ({ name: name, fn: fn }),
  },
  workspace: {
    on: (name, fn) => ({ name: name, fn: fn }),
    getLeavesOfType: () => [],
    openLinkText: () => {},
  },
};

const plugin = {
  app: app,
  manifest: { version: "0.0.0-race" },
  settings: {
    ghosts: false, templates: false, flatMonths: false, words: true,
    folderColors: {}, subfolderColors: {}, tagColors: {}, subtagColors: {},
    tagShown: {}, folderShown: {}, pinned: [], panEnabled: true, compactAxis: true,
    unlinkedByFolder: true, unlinkedTintByFolder: false, countBars: true, fitCap: true,
    dim: "folder", liveRefresh: true, sheetOpen: false, bandOpen: false,
  },
  pendingNote: null,
  pendingChain: [],
  saveSettings: async () => {},
  openSettings: () => {},
  recordVersion: async () => {},
};

H.fresh = () => {
  H.mounts.length = 0; H.notices.length = 0; H.latches.length = 0; H.runs.length = 0;
  H.armed = null;
  H.view = new VaultGraphView({ app: app }, plugin);
  return true;
};

H.arm = (tag) => {
  let rel;
  const p = new Promise((r) => { rel = r; });
  const l = { tag: tag, p: p, rel: rel };
  H.latches.push(l);
  H.armed = l;
  return tag;
};

H.start = (tag) => {
  H.arm(tag);
  const run = { tag: tag, state: "pending" };
  H.runs.push(run);
  H.view.render().then(
    () => { run.state = "resolved"; },
    (e) => { run.state = "rejected"; run.error = String(e && e.message || e); }
  );
  return tag;
};

H.release = (tag) => {
  const l = H.latches.filter((x) => x.tag === tag)[0];
  if (!l) throw new Error("no latch " + tag);
  l.rel();
  return tag;
};

H.close = () => { H.view.onClose(); return true; };

// Two clicks already dispatched: the callback is captured BEFORE the first render tears
// the page (and its button) out, which is the only way a second one can arrive at all.
H.refreshTwice = () => {
  const f = H.view.handle.onRefresh;
  f();
  const busyBetween = !!H.view.rebuilding;
  f();
  return busyBetween;
};

H.busy = () => !!H.view.rebuilding;

H.settled = () => H.runs.every((r) => r.state !== "pending");

H.snapshot = () => ({
  children: H.view.contentEl.childElementCount,
  mounts: H.mounts.length,
  alive: H.mounts.filter((m) => m.alive).length,
  aliveTags: H.mounts.filter((m) => m.alive).map((m) => m.tag),
  handleTag: H.view.handle ? H.view.handle.tag : null,
  lastTag: H.view.lastData ? H.view.lastData._spike.templateDirs[0] : null,
  rebuilding: !!H.view.rebuilding,
  refs: H.view.__refs.length,
  runs: H.runs.map((r) => r.tag + ":" + r.state + (r.error ? "(" + r.error + ")" : "")),
  notices: H.notices.slice(),
  sameDoc: H.mounts.filter((m) => m.alive).every((m) => m.doc === H.view.contentEl.ownerDocument),
  winIsView: H.mounts.filter((m) => m.alive).every((m) => m.win === window),
  winIsDecoy: H.mounts.filter((m) => m.alive).some((m) => m.win === decoy.contentWindow),
  pageTheme: H.view.page ? H.view.page.getAttribute("data-theme") : null,
});
`;

/* ------------------------------------------------------------------ bundle -- */

const PLUGIN_MAIN = join(ROOT, "plugin", "main.js");

const stubs = {
  name: "race-stubs",
  setup(b) {
    const virtual = (filter, contents) => {
      b.onResolve({ filter }, (a) => ({ path: a.path, namespace: "race" }));
      b.onLoad({ filter: new RegExp("^" + filter.source.replace(/^\^|\$$/g, "") + "$"), namespace: "race" },
               () => ({ contents, loader: "js", resolveDir: ROOT }));
    };
    virtual(/^obsidian$/, OBSIDIAN_STUB);
    virtual(/^\.\.\/src\/page\.js$/, PAGE_STUB);
    virtual(/^\.\.\/src\/engine\/index$/, ENGINE_STUB);

    // github#140 -- the raw:/b64: contract build-plugin.mjs gives main.js
    for (const [prefix, loader] of [["raw:", "text"], ["b64:", "base64"]]) {
      const filter = new RegExp("^" + prefix);
      b.onResolve({ filter }, (a) => ({
        path: resolve(dirname(a.importer), a.path.slice(prefix.length)),
        namespace: prefix,
      }));
      b.onLoad({ filter: /.*/, namespace: prefix },
               (a) => ({ contents: readFileSync(a.path), loader }));
    }

    b.onResolve({ filter: /^vg:releases$/ }, (a) => ({ path: a.path, namespace: "vg:" }));
    b.onLoad({ filter: /.*/, namespace: "vg:" }, () => ({
      contents: "export default " +
        JSON.stringify(parseReleases(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"))) + ";",
      loader: "js",
    }));

    // github#140 -- the one edit to shipped source, and the bundler makes it
    b.onLoad({ filter: /[\\/]plugin[\\/]main\.js$/, namespace: "file" }, (a) =>
      a.path === PLUGIN_MAIN
        ? { contents: readFileSync(a.path, "utf8") + "\nexport { VaultGraphView };\n", loader: "js" }
        : null);
  },
};

const scratch = mkdtempSync(join(tmpdir(), "vg-render-race-"));
const bundle = join(scratch, "race.js");

await build({
  stdin: {
    contents: DRIVER.replace("__PLUGIN_MAIN__", PLUGIN_MAIN.split("\\").join("/")),
    resolveDir: ROOT,
    loader: "js",
  },
  outfile: bundle,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  logLevel: "warning",
  plugins: [stubs],
});

writeFileSync(join(scratch, "render-race.html"),
  '<!doctype html><meta charset="utf-8"><title>render-race</title><body>' +
  '<script src="race.js"></script>', "utf8");
const url = pathToFileURL(join(scratch, "render-race.html")).href;

/* ------------------------------------------------------------------ chrome -- */

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
  s.on("error", rej);
});

const PORT = await freePort();
const profile = mkdtempSync(join(tmpdir(), "vg-render-race-profile-"));
const chrome = spawn(findChrome(arg("chrome", "")), [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-component-update", "--disable-sync", "--mute-audio",
  "--allow-file-access-from-files", url,
], { stdio: ["ignore", "ignore", "ignore"] });

let p = null;
for (let i = 0; i < 100 && !p; i++) {
  try { p = await attach(PORT, "render-race"); } catch { await sleep(200); }
}
if (!p) { chrome.kill(); throw new Error("could not attach to headless Chrome on port " + PORT); }

const j = async (expr) =>
  JSON.parse(await p.eval(`JSON.stringify((function(){ return (${expr}); })())`) ?? "null");

const settle = async (ms = 5000) => {
  const dl = Date.now() + ms;
  for (;;) {
    if (await j("window.__race.settled()")) { await sleep(60); return true; }
    if (Date.now() > dl) return false;
    await sleep(50);
  }
};

/* ------------------------------------------------------------------ checks -- */

const results = [];
const check = (ok, label, detail) => {
  results.push({ ok, label, detail });
  console.log("  " + (ok ? "ok  " : "NO  ") + label + (detail ? "   (" + detail + ")" : ""));
};
const show = (s) =>
  `children ${s.children}, mounts ${s.mounts}, alive ${s.alive} [${s.aliveTags.join(",")}], ` +
  `handle ${s.handleTag}, lastData ${s.lastTag}, rebuilding ${s.rebuilding}, refs ${s.refs}`;

try {
  for (let i = 0; i < 200; i++) {
    if (await j("!!window.__race").catch(() => false)) break;
    await sleep(50);
  }
  if (!(await j("!!window.__race"))) {
    throw new Error("the bundle never ran (" + (p.firstError() || "no page error") + ")");
  }

  /* -- 1: two overlapping renders, the newer one finishing FIRST ------------- */
  console.log("\n=== 1: renders A and B overlap, B resolves first ===");
  await j("window.__race.fresh()");
  await j('window.__race.start("A")');
  await j('window.__race.start("B")');
  await j('window.__race.release("B")');
  await sleep(150);
  await j('window.__race.release("A")');
  if (!(await settle())) throw new Error("scenario 1 never settled");
  let s = await j("window.__race.snapshot()");
  console.log("  " + show(s));
  check(s.children === 1, "exactly one page in the view root", "children " + s.children);
  check(s.alive === 1, "exactly one live mount", "alive " + s.alive + " of " + s.mounts + " created");
  check(s.aliveTags[0] === "B" && s.handleTag === "B",
        "the live mount is B's, and it is the one this.handle points at",
        "alive [" + s.aliveTags.join(",") + "], handle " + s.handleTag);
  check(s.lastTag === "B", "lastData is B's, not the late arrival's", "lastData " + s.lastTag);
  check(s.rebuilding === false, "the busy flag is clear", "rebuilding " + s.rebuilding);

  /* -- 2: the view closes while its build is still in flight ---------------- */
  console.log("\n=== 2: the view is closed while a build is pending ===");
  await j("window.__race.fresh()");
  await j('window.__race.start("C")');
  await j("window.__race.close()");
  await j('window.__race.release("C")');
  if (!(await settle())) throw new Error("scenario 2 never settled");
  s = await j("window.__race.snapshot()");
  console.log("  " + show(s));
  check(s.mounts === 0, "the pending render mounted nothing after the close", "mounts " + s.mounts);
  check(s.children === 0, "no page was appended to the closed view", "children " + s.children);
  check(s.handleTag === null, "this.handle is still null", "handle " + s.handleTag);
  check(s.lastTag === null, "lastData was not written by the dead render", "lastData " + s.lastTag);
  check(s.rebuilding === false, "the close left no busy flag behind", "rebuilding " + s.rebuilding);

  /* -- 3: three rapid rebuilds, resolving out of order ---------------------- */
  console.log("\n=== 3: three rapid rebuilds resolve 3, 1, 2 ===");
  await j("window.__race.fresh()");
  await j('window.__race.start("r1")');
  await j('window.__race.start("r2")');
  await j('window.__race.start("r3")');
  for (const tag of ["r3", "r1", "r2"]) {
    await j(`window.__race.release("${tag}")`);
    await sleep(120);
  }
  if (!(await settle())) throw new Error("scenario 3 never settled");
  s = await j("window.__race.snapshot()");
  console.log("  " + show(s));
  check(s.children === 1 && s.alive === 1, "one page and one live mount survive three rebuilds",
        "children " + s.children + ", alive " + s.alive);
  check(s.handleTag === "r3", "the newest render STARTED wins, not the last to resolve",
        "handle " + s.handleTag);
  check(s.lastTag === "r3", "the two older builds cleared nothing", "lastData " + s.lastTag);
  check(s.rebuilding === false, "an older request did not leave the view busy",
        "rebuilding " + s.rebuilding);
  check(s.refs === 6, "github#120 holds: six refs after three renders, not eighteen",
        "view event refs " + s.refs);
  check(s.sameDoc === true, "the mount was given the view's own document",
        "sameDoc " + s.sameDoc);
  check(s.winIsView === true && s.winIsDecoy === false,
        "the mount got the view's own window, not the one activeWindow names",
        "win is the view " + s.winIsView + ", win is the decoy " + s.winIsDecoy);
  check(s.pageTheme === "dark",
        "the theme came from the view's document (dark), not the decoy (light)",
        "data-theme " + s.pageTheme);

  // github#140 -- scenario 4: the real Refresh callback, not render() directly
  console.log("\n=== 4: Refresh declines to re-enter while its own render is in flight ===");
  await j("window.__race.fresh()");
  await j('window.__race.start("base")');
  await j('window.__race.release("base")');
  if (!(await settle())) throw new Error("scenario 4 never settled the first render");
  const before = await j("window.__race.snapshot()");
  await j('window.__race.arm("ref1")');
  const busyMid = await j("window.__race.refreshTwice()");
  await j('window.__race.release("ref1")');
  for (let i = 0; i < 100 && (await j("window.__race.busy()")); i++) await sleep(50);
  await sleep(80);
  s = await j("window.__race.snapshot()");
  console.log("  " + show(s));
  check(busyMid === true, "the first click marks the view busy before the second arrives",
        "rebuilding between the two clicks " + busyMid);
  check(s.mounts === before.mounts + 1,
        "the second Refresh was declined -- one new mount, not two",
        "mounts " + before.mounts + " -> " + s.mounts);
  check(s.alive === 1 && s.handleTag === "ref1", "the rebuild is the live mount",
        "alive " + s.alive + " [" + s.aliveTags.join(",") + "], handle " + s.handleTag);
  check(s.rebuilding === false, "Refresh is clickable again afterwards",
        "rebuilding " + s.rebuilding);
  check(s.notices.length === 0, "no notice was raised on the way through",
        "notices " + JSON.stringify(s.notices));

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + (failed.length ? failed.length + " of " + results.length + " FAILED"
                                    : results.length + "/" + results.length + " pass"));
  if (failed.length) process.exitCode = 1;
} finally {
  try { await p.close(); } catch {}
  try { chrome.kill(); } catch {}
  await sleep(300);
  if (KEEP) console.log("\nbundle kept at " + scratch);
  else { rmSync(scratch, { recursive: true, force: true }); }
  rmSync(profile, { recursive: true, force: true });
}
