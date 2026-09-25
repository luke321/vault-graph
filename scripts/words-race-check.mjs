#!/usr/bin/env node
// github#184 -- parks each word read, so a superseded one can be seen
// github#184 -- the real VaultGraphView, stubbed hosts, headless Chrome
// github#184 -- why, and the numbers: .ai-context/invariants.md
// github#184 -- node scripts/words-race-check.mjs [--keep]

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

// github#184 -- the same surface render-race-check.mjs stubs, and no more
const OBSIDIAN_STUB = `
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
export class Notice { constructor(msg) { window.__words.notices.push(String(msg)); } }
export function normalizePath(p) { return String(p).replace(/\\\\/g, "/").replace(/\\/{2,}/g, "/"); }
export function addIcon() {}
`;

// github#184 -- setWords is the measurement: what the PAGE was left holding
const PAGE_STUB = `
let seq = 0;
export function mountVaultGraph(page, data, deps) {
  const H = window.__words;
  const h = {
    id: ++seq,
    alive: true,
    page: page,
    api: {
      setWords(id, words) { H.sets.push([id, words]); H.counts[id] = words; },
      applyData() { return {}; },
      interacting() { return false; },
      readTheme() {},
      placeLogo() {},
      heatBuild() {},
      renderer: { refresh() {} },
    },
    destroy() { this.alive = false; },
  };
  H.mounts.push(h);
  return h;
}
`;

const ENGINE_STUB = `export class GraphStore {}\nexport class Renderer {}\n`;

// github#184 -- the in-page driver; every assertion is made in Node
const DRIVER = `
import { VaultGraphView } from "__PLUGIN_MAIN__";

const H = {
  mounts: [], notices: [], runs: [], sets: [], counts: {},
  content: {}, gates: [], gateSeq: 0, holding: false,
};
window.__words = H;
document.body.className = "theme-dark";

const FILES = ["one.md", "two.md", "three.md"].map((p, i) => ({
  path: p, name: p, basename: p.replace(/\\.md$/, ""), extension: "md",
  stat: { ctime: 1700000000000 + i, mtime: 1700000000000 + i, size: 10 },
}));

const app = {
  vault: {
    configDir: ".obsidian",
    getName: () => "words-vault",
    getMarkdownFiles: () => FILES.slice(),
    on: (name, fn) => ({ name: name, fn: fn }),
    adapter: { exists: () => Promise.resolve(false), read: () => Promise.resolve("{}") },
    // THE LATCH. The content is snapshotted when the read is MADE, which is what
    // "A resolves with pre-edit content" means -- then the resolve is parked until
    // the driver releases that gate by id, so two builds' reads can be interleaved
    // by hand. Every read goes through here; buildData itself touches no file.
    cachedRead: (file) => {
      const snap = H.content[file.path] || "";
      if (!H.holding) return Promise.resolve(snap);
      let rel;
      const p = new Promise((r) => { rel = r; });
      H.gates.push({ id: ++H.gateSeq, path: file.path, rel: rel });
      return p.then(() => snap);
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
  manifest: { version: "0.0.0-words" },
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

H.fresh = (content) => {
  H.mounts.length = 0; H.notices.length = 0; H.runs.length = 0; H.sets.length = 0;
  H.counts = {}; H.gates.length = 0; H.holding = false;
  H.content = content;
  H.view = new VaultGraphView({ app: app }, plugin);
  return true;
};

H.hold = (on) => { H.holding = !!on; return H.holding; };
H.set = (path, text) => { H.content[path] = text; return text; };

const track = (kind, promise) => {
  const run = { kind: kind, state: "pending" };
  H.runs.push(run);
  promise.then(
    () => { run.state = "resolved"; },
    (e) => { run.state = "rejected"; run.error = String((e && e.message) || e); }
  );
  return kind;
};

H.render = () => track("render", H.view.render());

// github#184 -- liveRebuild() directly: scheduleLive() debounces, and teardown clears it
H.live = (paths) => {
  for (const p of paths) H.view.dirtyPaths.add(p);
  return track("live:" + paths.join("+"), H.view.liveRebuild());
};

H.settled = () => H.runs.every((r) => r.state !== "pending");
H.openGates = () => H.gates.map((g) => g.id + ":" + g.path);

H.release = (id) => {
  const i = H.gates.findIndex((g) => g.id === id);
  if (i < 0) throw new Error("no gate " + id);
  const g = H.gates[i];
  H.gates.splice(i, 1);
  g.rel();
  return g.id;
};

H.releaseLast = () => H.release(H.gates[H.gates.length - 1].id);
H.releaseAll = () => { const n = H.gates.length; while (H.gates.length) H.release(H.gates[0].id); return n; };

H.claims = () => {
  const out = {};
  for (const e of (H.view.wordsGen || [])) out[e[0]] = e[1];
  return out;
};

H.snapshot = () => ({
  counts: Object.assign({}, H.counts),
  sets: H.sets.length,
  mounts: H.mounts.length,
  alive: H.mounts.filter((m) => m.alive).length,
  open: H.gates.length,
  runs: H.runs.map((r) => r.kind + ":" + r.state + (r.error ? "(" + r.error + ")" : "")),
  notices: H.notices.slice(),
});
`;

/* ------------------------------------------------------------------ bundle -- */

const PLUGIN_MAIN = join(ROOT, "plugin", "main.js");

const stubs = {
  name: "words-stubs",
  setup(b) {
    const virtual = (filter, contents) => {
      b.onResolve({ filter }, (a) => ({ path: a.path, namespace: "words" }));
      b.onLoad({ filter: new RegExp("^" + filter.source.replace(/^\^|\$$/g, "") + "$"), namespace: "words" },
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

const scratch = mkdtempSync(join(tmpdir(), "vg-words-race-"));
const bundle = join(scratch, "words.js");

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

writeFileSync(join(scratch, "words-race.html"),
  '<!doctype html><meta charset="utf-8"><title>words-race</title><body>' +
  '<script src="words.js"></script>', "utf8");
const url = pathToFileURL(join(scratch, "words-race.html")).href;

/* ------------------------------------------------------------------ chrome -- */

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
  s.on("error", rej);
});

const PORT = await freePort();
const profile = mkdtempSync(join(tmpdir(), "vg-words-race-profile-"));
const chrome = spawn(findChrome(arg("chrome", "")), [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-component-update", "--disable-sync", "--mute-audio",
  "--allow-file-access-from-files", url,
], { stdio: ["ignore", "ignore", "ignore"] });

let p = null;
for (let i = 0; i < 100 && !p; i++) {
  try { p = await attach(PORT, "words-race"); } catch { await sleep(200); }
}
if (!p) { chrome.kill(); throw new Error("could not attach to headless Chrome on port " + PORT); }

const j = async (expr) =>
  JSON.parse(await p.eval(`JSON.stringify((function(){ return (${expr}); })())`) ?? "null");

const settle = async (ms = 5000) => {
  const dl = Date.now() + ms;
  for (;;) {
    if (await j("window.__words.settled()")) { await sleep(60); return true; }
    if (Date.now() > dl) return false;
    await sleep(50);
  }
};

// github#184 -- a released read takes two microtask hops to reach setWords
const drain = async () => { await sleep(120); };

/* ------------------------------------------------------------------ checks -- */

const results = [];
const check = (ok, label, detail) => {
  results.push({ ok, label, detail });
  console.log("  " + (ok ? "ok  " : "NO  ") + label + (detail ? "   (" + detail + ")" : ""));
};
const show = (s) =>
  `counts ${JSON.stringify(s.counts)}, setWords ${s.sets}, mounts ${s.mounts}, ` +
  `alive ${s.alive}, gates open ${s.open}`;

try {
  for (let i = 0; i < 200; i++) {
    if (await j("!!window.__words").catch(() => false)) break;
    await sleep(50);
  }
  if (!(await j("!!window.__words"))) {
    throw new Error("the bundle never ran (" + (p.firstError() || "no page error") + ")");
  }

  /* -- 1: no race at all -- the counts still arrive -------------------------- */
  console.log("\n=== 1: a plain open, nothing racing ===");
  await j('window.__words.fresh({ "one.md": "a a a", "two.md": "b b", "three.md": "c" })');
  await j("window.__words.render()");
  if (!(await settle())) throw new Error("scenario 1 never settled");
  let s = await j("window.__words.snapshot()");
  console.log("  " + show(s));
  check(s.counts["one.md"] === 3 && s.counts["two.md"] === 2 && s.counts["three.md"] === 1,
        "every note's word count reached the page",
        "counts " + JSON.stringify(s.counts));
  check(s.sets === 3, "one setWords per note, no more", "setWords " + s.sets);

  /* -- 2: live vs live, the OLDER read resolving last ----------------------- */
  console.log("\n=== 2: refreshes A then B on the same note, A's read resolves LAST ===");
  await j('window.__words.fresh({ "one.md": "a", "two.md": "b", "three.md": "c" })');
  await j("window.__words.render()");
  if (!(await settle())) throw new Error("scenario 2 never settled the open");
  const openSets = (await j("window.__words.snapshot()")).sets;
  await j("window.__words.hold(true)");
  await j('window.__words.set("one.md", "x x x")');
  await j('window.__words.live(["one.md"])');
  if (!(await settle())) throw new Error("scenario 2: refresh A never settled");
  await j('window.__words.set("one.md", "y y y y y")');
  await j('window.__words.live(["one.md"])');
  if (!(await settle())) throw new Error("scenario 2: refresh B never settled");
  let gates = await j("window.__words.openGates()");
  check(gates.length === 2, "both refreshes have a read still out", "gates " + JSON.stringify(gates));
  await j("window.__words.releaseLast()");
  await drain();
  await j("window.__words.releaseAll()");
  await drain();
  s = await j("window.__words.snapshot()");
  console.log("  " + show(s));
  check(s.counts["one.md"] === 5,
        "the page holds B's count, not the stale read that landed after it",
        "one.md " + s.counts["one.md"] + " (A read 3, B read 5)");
  check(s.sets === openSets + 1, "A's superseded callback wrote nothing",
        "setWords " + openSets + " -> " + s.sets);

  /* -- 3: the opening sweep vs a live refresh ------------------------------- */
  console.log("\n=== 3: a note is edited while the opening sweep is still reading ===");
  await j('window.__words.fresh({ "one.md": "a", "two.md": "b b", "three.md": "c c c" })');
  await j("window.__words.hold(true)");
  await j("window.__words.render()");
  if (!(await settle())) throw new Error("scenario 3 never settled the open");
  gates = await j("window.__words.openGates()");
  check(gates.length === 3, "the opening sweep has all three reads out",
        "gates " + JSON.stringify(gates));
  await j('window.__words.set("one.md", "z z z z")');
  await j('window.__words.live(["one.md"])');
  if (!(await settle())) throw new Error("scenario 3: the refresh never settled");
  await j("window.__words.releaseLast()");
  await drain();
  await j("window.__words.releaseAll()");
  await drain();
  s = await j("window.__words.snapshot()");
  console.log("  " + show(s));
  check(s.counts["one.md"] === 4,
        "the edited note keeps the refreshed count, not the sweep's pre-edit read",
        "one.md " + s.counts["one.md"] + " (sweep read 1, refresh read 4)");

  /* -- 3b: the regression a per-BUILD guard would have introduced ----------- */
  check(s.counts["two.md"] === 2 && s.counts["three.md"] === 3,
        "the notes the refresh never claimed still get their sweep's counts",
        "two.md " + s.counts["two.md"] + ", three.md " + s.counts["three.md"]);
  check(s.open === 0 && s.notices.length === 0, "no read left parked, no notice raised",
        "gates " + s.open + ", notices " + JSON.stringify(s.notices));

  /* -- 3c: a second refresh that claims a DIFFERENT note ------------------- */
  console.log("\n=== 3c: two refreshes claiming different notes, both reads out ===");
  await j('window.__words.fresh({ "one.md": "a", "two.md": "b", "three.md": "c" })');
  await j("window.__words.render()");
  if (!(await settle())) throw new Error("scenario 3c never settled the open");
  await j("window.__words.hold(true)");
  await j('window.__words.set("one.md", "p p p")');
  await j('window.__words.live(["one.md"])');
  if (!(await settle())) throw new Error("scenario 3c: the first refresh never settled");
  await j('window.__words.set("two.md", "q q q q q q")');
  await j('window.__words.live(["two.md"])');
  if (!(await settle())) throw new Error("scenario 3c: the second refresh never settled");
  const claims = await j("window.__words.claims()");
  await j("window.__words.releaseAll()");
  await drain();
  s = await j("window.__words.snapshot()");
  console.log("  " + show(s) + ", claims " + JSON.stringify(claims));
  check(s.counts["one.md"] === 3 && s.counts["two.md"] === 6,
        "a refresh claiming another note leaves the first refresh's read standing",
        "one.md " + s.counts["one.md"] + ", two.md " + s.counts["two.md"]);
  check(Object.keys(claims).length === 3,
        "the claim map is rebuilt per refresh, never longer than the node list",
        "claims " + JSON.stringify(claims));

  /* -- 4: the view closes with reads still out ------------------------------ */
  console.log("\n=== 4: the view is closed while the sweep is still reading ===");
  await j('window.__words.fresh({ "one.md": "a", "two.md": "b b", "three.md": "c c c" })');
  await j("window.__words.hold(true)");
  await j("window.__words.render()");
  if (!(await settle())) throw new Error("scenario 4 never settled the open");
  const beforeClose = await j("window.__words.snapshot()");
  await j("window.__words.view.onClose()");
  await j("window.__words.releaseAll()");
  await drain();
  s = await j("window.__words.snapshot()");
  console.log("  " + show(s));
  check(s.sets === beforeClose.sets,
        "a read that outlived the mount wrote nothing to the torn-down page",
        "setWords " + beforeClose.sets + " -> " + s.sets);
  check(s.alive === 0, "the mount is gone", "alive " + s.alive);

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
