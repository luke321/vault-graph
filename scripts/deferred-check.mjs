// Does the graph survive being restored as a DEFERRED leaf?
//
// WHY A SEPARATE SCRIPT. Since Obsidian 1.7.2 a leaf restored from a saved workspace in the
// BACKGROUND is deferred: the leaf is real, getLeavesOfType finds it, and `leaf.view` is a
// DeferredView placeholder rather than the plugin's own view. Nothing in smoke.mjs or
// spike-check.mjs can see that, because both open the graph in the foreground and look at it
// immediately -- the one state where deferral never happens.
//
// Reproducing it needs a RESTART, which is why this is two phases against one profile:
//
//   phase 1  open the graph, then leave a different tab active, and save the layout
//   phase 2  relaunch -- the graph leaf now restores deferred -- and drive the two commands
//
//   node scripts/deferred-check.mjs --vault ./demo-vault
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { attach } from "./cdp.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = Number(arg("port", 9446));
const VAULT = resolve(arg("vault", join(process.env.TEMP || "/tmp", "vault-graph-spike-vault")));
const USER_DATA = join(process.env.TEMP || "/tmp", "vault-graph-deferred-profile");
const VT = "vault-graph-view";
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
  throw new Error("Obsidian not found -- pass --obsidian <path>");
}
const exe = findObsidian();

if (!existsSync(VAULT)) { console.error("no vault at " + VAULT); process.exit(1); }
mkdirSync(USER_DATA, { recursive: true });
writeFileSync(join(USER_DATA, "obsidian.json"),
  JSON.stringify({ vaults: { "0000deferredvault": { path: VAULT, ts: Date.now(), open: true } } }), "utf8");

async function launch() {
  const child = spawn(exe, ["--remote-debugging-port=" + PORT, "--user-data-dir=" + USER_DATA],
    { stdio: "ignore", detached: false });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    let c = null;
    try { c = await attach(PORT, "app://obsidian.md"); } catch { continue; }
    try { if (await c.eval("typeof app !== 'undefined' && !!app.workspace")) return { child, cdp: c }; } catch {}
    try { await c.close(); } catch {}
  }
  try { child.kill(); } catch {}
  throw new Error("app never appeared");
}

const results = [];
const check = (ok, label, detail) => {
  results.push({ ok, label, detail });
  console.log("  " + (ok ? "ok  " : "NO  ") + label + (detail ? "   (" + detail + ")" : ""));
};

let phase = await launch();
try {
  console.log("\n=== phase 1: open the graph, then background it ===");
  await phase.cdp.eval(
    "(async () => {" +
    "  app.plugins.setEnable(true);" +
    "  await app.plugins.enablePluginAndSave('vault-graph');" +
    "  return true;" +
    "})()"
  );
  await sleep(3000);
  const loaded = await phase.cdp.eval("!!app.plugins.getPlugin('vault-graph')");
  check(loaded === true, "phase 1: the plugin actually loaded",
    "getPlugin -> " + loaded + " (setEnable(true) first: `enablePlugin` alone only registers " +
    "the id while the vault is in restricted mode, which reads as \"the command does nothing\")");
  await phase.cdp.eval("app.commands.executeCommandById('vault-graph:open')");
  await sleep(8000);
  const opened = await phase.cdp.eval(
    "(() => {" +
    "  const ls = app.workspace.getLeavesOfType('" + VT + "');" +
    "  return { leaves: ls.length," +
    "           realView: !!(ls[0] && ls[0].view && typeof ls[0].view.render === 'function')," +
    "           deferred: ls[0] ? ls[0].isDeferred : null," +
    "           canvases: document.querySelectorAll('#vg-graph canvas').length };" +
    "})()"
  );
  check(opened.leaves === 1 && opened.canvases > 0,
    "phase 1: the graph opened in the foreground",
    opened.leaves + " leaf, real view " + opened.realView + ", deferred " + opened.deferred + ", " + opened.canvases + " canvases");

  // Make a DIFFERENT tab active so the graph tab is saved as a BACKGROUND tab. That is the
  // only thing that makes it come back deferred.
  await phase.cdp.eval(
    "(async () => {" +
    "  const f = app.vault.getMarkdownFiles()[0];" +
    "  const leaf = app.workspace.getLeaf('tab');" +
    "  await leaf.openFile(f);" +
    "  app.workspace.setActiveLeaf(leaf, { focus: true });" +
    "  if (app.workspace.requestSaveLayout) app.workspace.requestSaveLayout();" +
    "  else app.workspace.saveLayout();" +
    "  return true;" +
    "})()"
  );
  await sleep(4000);
  const saved = await phase.cdp.eval(
    "(() => {" +
    "  const ls = app.workspace.getLeavesOfType('" + VT + "');" +
    "  const al = app.workspace.activeLeaf;" +
    "  return { active: al ? al.getViewState().type : null, graphLeaves: ls.length };" +
    "})()"
  );
  check(saved.active !== VT && saved.graphLeaves === 1,
    "phase 1: a different tab is active, graph tab still open",
    "active=" + saved.active);
} finally {
  try { await phase.cdp.close(); } catch {}
  try { phase.child.kill(); } catch {}
}
await sleep(5000);

console.log("\n=== phase 2: relaunch -- the graph leaf should restore DEFERRED ===");
phase = await launch();
try {
  const state = await phase.cdp.eval(
    "(() => {" +
    "  const ls = app.workspace.getLeavesOfType('" + VT + "');" +
    "  const l = ls[0];" +
    "  return {" +
    "    leaves: ls.length," +
    "    isDeferred: l ? l.isDeferred : null," +
    // THE OLD BUG, measured rather than asserted: this is exactly what the previous
    // currentView() handed to "Rebuild", and whether `render` exists on it is the
    // difference between a working command and a TypeError.
    "    hasRender: !!(l && l.view && typeof l.view.render === 'function')," +
    "    hasLoadIfDeferred: !!(l && typeof l.loadIfDeferred === 'function')" +
    "  };" +
    "})()"
  );
  check(state.isDeferred === true, "the restored leaf really is deferred",
    "isDeferred=" + state.isDeferred + ", leaf.view has render(): " + state.hasRender);
  check(state.leaves === 1 && state.hasRender === false,
    "the old code path WOULD have thrown here",
    state.leaves !== 1 ? "VACUOUS -- no graph leaf restored, so this proves nothing"
      : "leaf.view.render is undefined -- that is the TypeError");
  check(state.hasLoadIfDeferred === true, "loadIfDeferred is available", "1.7.2+ API present");

  // Now the actual fix: the commands must work anyway.
  const rebuild = await phase.cdp.eval(
    "(async () => {" +
    "  const errs = [];" +
    "  const onErr = (e) => errs.push(String(e.message || e.reason || e));" +
    "  window.addEventListener('error', onErr);" +
    "  window.addEventListener('unhandledrejection', onErr);" +
    "  let thrown = null;" +
    "  try { await app.commands.executeCommandById('vault-graph:rebuild'); }" +
    "  catch (e) { thrown = String((e && e.message) || e); }" +
    "  await new Promise((r) => setTimeout(r, 6000));" +
    "  window.removeEventListener('error', onErr);" +
    "  window.removeEventListener('unhandledrejection', onErr);" +
    "  const ls = app.workspace.getLeavesOfType('" + VT + "');" +
    "  return { thrown: thrown, errs: errs," +
    "           realView: !!(ls[0] && ls[0].view && typeof ls[0].view.render === 'function')," +
    "           deferredNow: ls[0] ? ls[0].isDeferred : null," +
    "           canvases: document.querySelectorAll('#vg-graph canvas').length };" +
    "})()"
  );
  check(!rebuild.thrown && rebuild.errs.length === 0,
    "\"Rebuild from the metadata cache\" survives a deferred leaf",
    rebuild.thrown ? "threw: " + rebuild.thrown
      : (rebuild.errs.length ? rebuild.errs.join(" | ") : "no throw, no window error"));
  // NOT constructor.name: the bundler minifies every class to a single letter, so the name
  // identifies nothing. `render` is the right discriminator anyway -- it is the method
  // "Rebuild" calls and the one a DeferredView does not have.
  check(rebuild.realView === true && rebuild.deferredNow === false,
    "the guard loaded the real view instead of the placeholder",
    "view has render(): " + rebuild.realView + ", still deferred: " + rebuild.deferredNow);
  check(rebuild.canvases > 0, "the graph actually painted after the rebuild",
    rebuild.canvases + " canvases");

  const report = await phase.cdp.eval(
    "(async () => {" +
    "  await app.commands.executeCommandById('vault-graph:report');" +
    "  await new Promise((r) => setTimeout(r, 2500));" +
    "  return window.__vgSpikeReport || null;" +
    "})()"
  );
  check(!!report && report.hasApi === true && report.order > 0,
    "\"Report diagnostics\" reports a live graph, not hasApi:false",
    report ? "hasApi=" + report.hasApi + ", order=" + report.order + ", size=" + report.size : "no report");
} finally {
  try { await phase.cdp.close(); } catch {}
  try { phase.child.kill(); } catch {}
}

const bad = results.filter((r) => !r.ok);
console.log("\n" + (bad.length ? "FAILED " + bad.length + "/" + results.length
  : "ok  " + results.length + "/" + results.length + " passed"));
process.exit(bad.length ? 1 : 0);
