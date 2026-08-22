// Drive the spike inside a real Obsidian and print what it measured.
//
//   node scripts/spike-check.mjs --vault "C:\...\vault-graph-spike-vault"
//   node scripts/spike-check.mjs --port 9444 --keep
//
// WHY THIS EXISTS. The third question the spike has to answer is whether the invariant
// suite survives the move into Obsidian -- scripts/smoke.mjs works by attaching to a
// real Chrome over CDP and calling __vg directly. Obsidian is Electron, so the same
// attach works; what changes is that the page is one frame down, which means an extra
// hop to find its execution context. This script is that hop, proven once, so smoke.mjs
// can be pointed at Obsidian later without guessing.
//
// It reuses scripts/cdp.mjs unchanged, which is itself part of the finding.

import { attach, json } from "./cdp.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = Number(arg("port", 9444));       // not 9333: do not fight smoke.mjs
const KEEP = argv.includes("keep");
const VAULT = arg("vault", join(process.env.TEMP || "/tmp", "vault-graph-spike-vault"));
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

// A SEPARATE user-data dir, always. Obsidian is single-instance: launched against the
// profile a person is already using, the new process hands off to the running one and
// exits, the debug port never opens, and the failure looks like "CDP is broken" rather
// than "there was already an Obsidian".
const USER_DATA = join(process.env.TEMP || "/tmp", "vault-graph-spike-profile");

if (!existsSync(VAULT)) {
  console.error("no vault at " + VAULT + "\n  run: ./scripts/install-spike.ps1 -TestVault");
  process.exit(1);
}

// SEED THE PROFILE'S VAULT REGISTRY. Measured: a fresh --user-data-dir opens the vault
// PICKER, not a vault, and `obsidian://open?path=` handed to a starting instance is
// dropped. The picker window is a page target like any other, so CDP attaches happily and
// the first eval fails with "app is not defined" -- which reads as a CDP problem and is
// not one. build-graph.mjs already reads this same registry to find the vault; here it is
// written instead.
function seedProfile() {
  mkdirSync(USER_DATA, { recursive: true });
  const reg = { vaults: {} };
  // The key is an arbitrary id in Obsidian's own registry; any stable hex string works.
  reg.vaults["0000spikevault0000"] = { path: VAULT, ts: Date.now(), open: true };
  writeFileSync(join(USER_DATA, "obsidian.json"), JSON.stringify(reg), "utf8");
}
seedProfile();

const exe = findObsidian();
console.log("obsidian: " + exe);
console.log("vault:    " + VAULT);
console.log("port:     " + PORT);
console.log("profile:  " + USER_DATA);

const child = spawn(exe, [
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + USER_DATA,
], { stdio: "ignore", detached: false });

let cdp = null;
// THROWS. An earlier version called shutdown() and returned, so every check after a
// failure kept running and printed a contradiction ("FAIL plugin not loaded" immediately
// followed by "plugin loaded"). shutdown() is async; returning from fail() does not stop
// the caller.
const fail = (msg) => { throw new Error("FAIL " + msg); };
const shutdown = async (code) => {
  try { if (cdp) await cdp.close(); } catch {}
  if (!KEEP) { try { child.kill(); } catch {} }
  process.exit(code);
};

try {
  // The window takes a while: Obsidian has to open the vault, index it, and load the
  // plugin before the view can exist. And "a page target exists" is not the same as "the
  // vault is loaded" -- the target answers CDP well before `app` does -- so the wait is
  // for app.workspace, not for the socket.
  let attached = null;
  for (let i = 0; i < 60 && !attached; i++) {
    await sleep(1000);
    let c = null;
    try { c = await attach(PORT, "app://obsidian.md"); } catch (e) { continue; }
    try {
      if (await c.eval("typeof app !== 'undefined' && !!app.workspace")) { attached = c; break; }
    } catch (e) { /* still booting */ }
    try { await c.close(); } catch {}
    if (i === 20) {
      const targets = await json(PORT, "/json/list").catch(() => []);
      console.log("still waiting; targets: " +
        JSON.stringify(targets.map((t) => ({ type: t.type, title: t.title, url: t.url }))));
    }
  }
  if (!attached) fail("attached to Obsidian but `app` never appeared -- the window is " +
                      "probably the vault picker. Check " + join(USER_DATA, "obsidian.json"));
  cdp = attached;
  console.log("attached, vault loaded");

  // cdp.mjs already exposes eval() -- reusing it unchanged is part of what this script
  // is here to demonstrate.
  const evalIn = (expr) => cdp.eval(expr);

  // Read from the manifest rather than keeping a second copy. The id moved from
  // vault-graph-spike to vault-graph when the manifest became a real one, and a stale copy
  // here fails as "plugin not loaded" -- which reads as a build problem and is not one.
  const pluginId = JSON.parse(readFileSync(join(HERE, "..", "manifest.json"), "utf8")).id;
  const id = JSON.stringify(pluginId);

  // RESTRICTED MODE. Measured: seeding community-plugins.json is NOT enough -- a vault
  // Obsidian has never opened still starts restricted, so the plugin is present on disk
  // and never loaded. Turning it off from here beats writing more config files, because
  // it uses whatever the current app actually keys off.
  //
  // setEnable/enablePluginAndSave are internal, undocumented API. Fine in a harness that
  // drives a throwaway vault; a shipped plugin must never touch them.
  if (!(await evalIn(`!!app.plugins.getPlugin(${id})`))) {
    console.log("plugin not loaded -- leaving restricted mode and enabling it");
    await evalIn("app.plugins.setEnable(true)");
    await evalIn(`app.plugins.enablePluginAndSave(${id})`);
    await sleep(1500);
  }
  if (!(await evalIn(`!!app.plugins.getPlugin(${id})`))) {
    const known = await evalIn("Object.keys(app.plugins.manifests || {})");
    fail("plugin still not loaded. Manifests Obsidian can see: " + JSON.stringify(known));
  }
  console.log("plugin loaded");

  // THE RIBBON ICON. addIcon() failing is silent -- an unknown id renders as an empty
  // box, which looks like a styling problem rather than a registration one. Assert the
  // geometry actually arrived: 8 dots on the outer band, 4 on the inner, no gap.
  const icon = await evalIn(`(function () {
    var btn = document.querySelector('[aria-label*="Vault graph"]');
    var svg = btn ? btn.querySelector('svg') : null;
    return {
      buttonFound: !!btn,
      iconClass: svg ? svg.getAttribute("class") : null,
      circles: svg ? svg.querySelectorAll("circle").length : 0,
      viewBox: svg ? svg.getAttribute("viewBox") : null
    };
  })()`);
  console.log("ribbon icon: " + JSON.stringify(icon));

  // NO FRAME BOOKKEEPING ANY MORE. This used to collect execution contexts before creating
  // the iframe, because a sandboxed frame is site-isolated into its own CDP target and the
  // only way in was to address its context directly -- which cdp.mjs, speaking one session,
  // could not do. The page is in this document now, so `__vg` is simply here.

  // Open the view, then let it build and mount.
  await evalIn(`app.commands.executeCommandById(${JSON.stringify(pluginId + ":open")})`);
  // LET THE INTRO FINISH. Measured: probing 4s after open returned parityOK:false, which
  // is correct-and-meaningless -- the reveal cascade is mid-flight, so the live plan is
  // deliberately not the resting plan. Parity is a statement about the page AT REST.
  await sleep(9000);
  await evalIn(`app.commands.executeCommandById(${JSON.stringify(pluginId + ":report")})`);
  await sleep(1500);

  const report = await evalIn("window.__vgSpikeReport || null");
  if (!report) fail("no report -- the view never produced one");

  console.log("\n=== spike report =======================================");
  console.log(JSON.stringify(report, null, 2));

  // What the vault actually contains, straight from the cache, so the numbers above can
  // be accounted for rather than assumed. The fenced [[Orphan]] link in the 08-22 daily
  // is the interesting one: if it shows up as an edge, Obsidian indexes links inside
  // code fences and build-graph.mjs's stripCode() is load-bearing. If it does not, that
  // function is dead weight in a plugin.
  const cache = await evalIn(`(function () {
    var u = app.metadataCache.unresolvedLinks, out = {};
    Object.keys(u).forEach(function (k) {
      if (Object.keys(u[k]).length) out[k] = u[k];
    });
    var orphanIn = [];
    var r = app.metadataCache.resolvedLinks;
    Object.keys(r).forEach(function (src) {
      if (r[src]["Orphan.md"]) orphanIn.push(src);
    });
    return { unresolved: out, linksIntoOrphan: orphanIn };
  })()`);
  console.log("\n=== what the cache says ================================");
  console.log(JSON.stringify(cache, null, 2));

  // ALIASES. The Node builder resolves them itself, via a byKey table that indexes every
  // alias. The claim worth testing is whether resolvedLinks does the same -- Home.md
  // links [[The Beta Note]], which is an alias of 03 - Resources/Beta.md and nothing
  // else. If that link is in unresolvedLinks, the adapter LOSES edges the crawl finds,
  // and getFirstLinkpathDest has to be called for each miss.
  const alias = await evalIn(`(function () {
    var beta = app.vault.getAbstractFileByPath("03 - Resources/Beta.md");
    var cache = beta ? app.metadataCache.getFileCache(beta) : null;
    var dest = app.metadataCache.getFirstLinkpathDest("The Beta Note", "Home.md");
    return {
      aliasesAsParsed: cache && cache.frontmatter ? cache.frontmatter.aliases : null,
      getFirstLinkpathDest: dest ? dest.path : null,
      inResolvedLinks: !!(app.metadataCache.resolvedLinks["Home.md"] || {})["03 - Resources/Beta.md"],
      inUnresolvedLinks: !!(app.metadataCache.unresolvedLinks["Home.md"] || {})["The Beta Note"]
    };
  })()`);
  console.log("\n=== aliases ============================================");
  console.log(JSON.stringify(alias, null, 2));

  // THE PAGE IS IN THIS WINDOW. Everything below used to need a message bridge or a second
  // CDP target; it is now an ordinary property read, which is the entire point of the port.
  const direct = await evalIn(`(function () {
    var vg = window.__vg;
    if (!vg) return { reachable: false };
    return {
      reachable: true,
      order: vg.graph.order,
      size: vg.graph.size,
      parityOK: vg.checkPlanParity().parityOK,
      canvases: document.querySelectorAll("#vg-graph canvas").length,
      // The page's own root, in the app's document -- not in a frame.
      inDocument: !!document.querySelector(".workspace-leaf-content .vault-graph"),
      themeAttr: (document.querySelector(".vault-graph") || {}).getAttribute
        ? document.querySelector(".vault-graph").getAttribute("data-theme") : null
    };
  })()`);
  console.log("direct read of __vg: " + JSON.stringify(direct));

  // NO IFRAME ANYWHERE. Stated as a check rather than assumed, because "it still works"
  // and "it works the way we intended" are different claims and only one of them is
  // interesting after a port.
  const frames = await evalIn(
    `document.querySelectorAll("iframe").length`);

  // CSS SCOPE, MEASURED IN THE LIVE APP. page.css ships as the plugin's stylesheet, so the
  // question is not whether it is scoped in the file -- check-scope.mjs answers that -- but
  // whether Obsidian's own chrome survived loading it. If a rule had leaked, the workspace
  // would be wearing the page's background.
  const leak = await evalIn(`(function () {
    var el = document.querySelector(".workspace-tabs") || document.body;
    var cs = getComputedStyle(el);
    return { workspaceFont: cs.fontFamily.slice(0, 32), pageTokenOnBody:
             getComputedStyle(document.body).getPropertyValue("--surface-1").trim() };
  })()`);
  console.log("host chrome: " + JSON.stringify(leak));

  const verdict = [];
  verdict.push(["custom ribbon icon registered", icon.circles === 12,
                icon.buttonFound ? icon.circles + " circles, class " + icon.iconClass
                                 : "ribbon button not found"]);
  verdict.push(["mounted in the DOM, not in a frame", frames === 0, frames + " iframe(s)"]);
  verdict.push(["the page is in the app's document", !!direct.inDocument]);
  verdict.push(["host reads __vg directly, no bridge", !!direct.reachable,
                direct.reachable ? direct.order + " nodes, " + direct.size + " edges" : "not reachable"]);
  verdict.push(["canvases painted", direct.canvases > 0, direct.canvases + " canvases"]);
  verdict.push(["plan parity holds at rest", !!direct.parityOK]);
  verdict.push(["theme handed to the page", !!direct.themeAttr, "data-theme=" + direct.themeAttr]);
  verdict.push(["page.css did not leak onto the host", leak.pageTokenOnBody === "",
                leak.pageTokenOnBody === "" ? "no --surface-1 on body"
                                            : "LEAKED: body has --surface-1=" + leak.pageTokenOnBody]);
  verdict.push(["fenced link stayed out of the graph", cache.linksIntoOrphan.length === 0,
                cache.linksIntoOrphan.length
                  ? "indexed from " + cache.linksIntoOrphan.join(", ")
                  : "no edge into Orphan.md"]);
  verdict.push(["alias link is in resolvedLinks", !!alias.inResolvedLinks,
                alias.inResolvedLinks ? "resolved" :
                  "UNRESOLVED -- getFirstLinkpathDest says " + alias.getFirstLinkpathDest]);

  console.log("\n=== verdict ============================================");
  for (const [name, ok, note] of verdict) {
    console.log((ok ? "  yes  " : "  NO   ") + name + (note ? "   (" + note + ")" : ""));
  }

  // --shot <dir>: capture the view, in both of Obsidian's themes.
  //
  // Screenshots of a PLUGIN have to be taken inside the app -- the tab bar, the ribbon and
  // the theme are most of what a reader is trying to see, and none of them exist in the
  // standalone page. This lives here rather than in its own script because getting to a
  // settled view inside a real Obsidian is the expensive part, and this file already does
  // it: launch, leave restricted mode, enable, open, wait for the intro to land.
  const shotDir = arg("shot", "");
  if (shotDir) {
    mkdirSync(shotDir, { recursive: true });
    const shoot = async (name) => {
      const r = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(shotDir, name + ".png"), Buffer.from(r.data, "base64"));
      console.log("  wrote " + name + ".png");
    };
    console.log("\n=== screenshots ========================================");
    // Obsidian's own theme switch, so the host chrome changes with the page rather than
    // the page alone -- which is the integration worth showing.
    await evalIn(`app.changeTheme("obsidian"); void 0`);          // dark
    await sleep(1200);
    await shoot("obsidian-dark");
    await evalIn(`app.changeTheme("moonstone"); void 0`);         // light
    await sleep(1800);
    await shoot("obsidian-light");
    await evalIn(`app.changeTheme("obsidian"); void 0`);
    await sleep(600);
  }

  await shutdown(0);
} catch (e) {
  console.error(e);
  await shutdown(1);
}
