
import { attach, json } from "./cdp.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = Number(arg("port", 9444));
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

const USER_DATA = join(process.env.TEMP || "/tmp", "vault-graph-spike-profile");

if (!existsSync(VAULT)) {
  console.error("no vault at " + VAULT + "\n  run: ./scripts/install-spike.ps1 -TestVault");
  process.exit(1);
}

function seedProfile() {
  mkdirSync(USER_DATA, { recursive: true });
  const reg = { vaults: {} };
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
const fail = (msg) => { throw new Error("FAIL " + msg); };
const shutdown = async (code) => {
  try { if (cdp) await cdp.close(); } catch {}
  if (!KEEP) { try { child.kill(); } catch {} }
  process.exit(code);
};

try {
  let attached = null;
  for (let i = 0; i < 60 && !attached; i++) {
    await sleep(1000);
    let c = null;
    try { c = await attach(PORT, "app://obsidian.md"); } catch { continue; }
    try {
      if (await c.eval("typeof app !== 'undefined' && !!app.workspace")) { attached = c; break; }
    } catch { }
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

  const evalIn = (expr) => cdp.eval(expr);

  const pluginId = JSON.parse(readFileSync(join(HERE, "..", "manifest.json"), "utf8")).id;
  const id = JSON.stringify(pluginId);

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

  await evalIn(`app.commands.executeCommandById(${JSON.stringify(pluginId + ":open")})`);
  await sleep(9000);
  await evalIn(`app.commands.executeCommandById(${JSON.stringify(pluginId + ":report")})`);
  await sleep(1500);

  const report = await evalIn("window.__vgSpikeReport || null");
  if (!report) fail("no report -- the view never produced one");

  console.log("\n=== spike report =======================================");
  console.log(JSON.stringify(report, null, 2));

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

  const frames = await evalIn(
    `document.querySelectorAll("iframe").length`);

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

  const shotDir = arg("shot", "");
  if (shotDir) {
    mkdirSync(shotDir, { recursive: true });
    const shoot = async (name) => {
      await evalIn(`(function(){
        var n = document.querySelectorAll(".notice, .notice-container > *");
        for (var i = 0; i < n.length; i++) n[i].remove();
      })(); void 0`);
      await sleep(250);
      const st = await evalIn(`(function(){
        var el = document.querySelector(".vault-graph");
        var vg = window.__vg;
        return JSON.stringify({
          bodyTheme: document.body.classList.contains("theme-dark") ? "dark" : "light",
          pageAttr: el ? el.getAttribute("data-theme") : null,
          edgeToken: el ? getComputedStyle(el).getPropertyValue("--edge").trim() : null,
          themeSeenByJs: vg && vg.readTheme ? "readTheme exposed" : "NOT exposed"
        });
      })()`);
      console.log("    state: " + st);
      const probe = await evalIn(`(function(){
        var vg = window.__vg, g = vg.graph;
        var e = g.edges()[0];
        var before = vg.renderer.getEdgeDisplayData(e).color;
        vg.readTheme();
        vg.renderer.refresh();
        var after = vg.renderer.getEdgeDisplayData(e).color;
        return JSON.stringify({ edgeBefore: before, edgeAfterManualReread: after });
      })()`);
      console.log("    probe: " + probe);
      const r = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(shotDir, name + ".png"), Buffer.from(r.data, "base64"));
      console.log("  wrote " + name + ".png");
    };
    console.log("\n=== screenshots ========================================");
    await evalIn(`app.changeTheme("obsidian"); void 0`);
    await sleep(2200);
    await shoot("obsidian-dark");
    await evalIn(`app.changeTheme("moonstone"); void 0`);
    await sleep(2600);
    await shoot("obsidian-light");
    await evalIn(`app.changeTheme("obsidian"); void 0`);
    await sleep(600);
  }

  await shutdown(0);
} catch (e) {
  console.error(e);
  await shutdown(1);
}
