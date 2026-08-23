#!/usr/bin/env node
// Does the Refresh button pick up a note written after the graph was drawn?
//
//   node scripts/refresh-check.mjs --vault ./demo-vault
//
// WHY THIS EXISTS. "Refresh doesn't seem to pick up new files" (github#6) was true, and
// for the standalone page it is unfixable: that file's data is baked in at build time. In
// Obsidian it never had to be true -- the vault is right there, and the view can rebuild
// from the metadata cache. The button does that now, and this is the check that it does,
// because the claim is a whole round trip -- write a file, Obsidian notices, rebuild,
// remount, the note is on the disc -- and every harness we already have stops short of one
// end or the other. smoke.mjs drives the standalone page, which cannot do this at all;
// deferred-check.mjs drives the commands, and the commands were never what was reported.
//
// It writes a probe note INTO the vault you point it at and deletes it again. Point it at
// a generated vault -- demo-vault or test-vault -- not at anything you care about.
//
// One launch, unlike deferred-check.mjs: nothing here needs a restart.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attach } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = Number(arg("port", 9447));      // not 9333 / 9444 / 9446: do not fight the others
const VAULT = resolve(arg("vault", join(ROOT, "demo-vault")));
const USER_DATA = join(process.env.TEMP || "/tmp", "vault-graph-refresh-profile");
const VT = "vault-graph-view";
const PROBE = "Refresh Probe.md";
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

// INSTALL WHAT WAS JUST BUILT, not whatever the vault already has. The point is to test
// this working copy; attaching to a stale installed plugin would pass or fail about
// somebody else's code. Exactly the three files Obsidian installs, and nothing else.
const pluginDir = join(VAULT, ".obsidian", "plugins", "vault-graph");
mkdirSync(pluginDir, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) {
  const src = join(ROOT, f);
  if (!existsSync(src)) { console.error("no " + f + " -- run `npm run build` first"); process.exit(1); }
  copyFileSync(src, join(pluginDir, f));
}
mkdirSync(USER_DATA, { recursive: true });
writeFileSync(join(USER_DATA, "obsidian.json"),
  JSON.stringify({ vaults: { "0000refreshvault": { path: VAULT, ts: Date.now(), open: true } } }), "utf8");

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
  results.push({ ok, label });
  console.log("  " + (ok ? "ok  " : "NO  ") + label + (detail ? "\n         " + detail : ""));
};

// How many notes the live graph is drawing, asked through the plugin's own diagnostics
// command -- so this measures what the view believes rather than re-deriving it here and
// grading its own homework.
const ORDER =
  "(async () => {" +
  "  await app.commands.executeCommandById('vault-graph:report');" +
  "  await new Promise((r) => setTimeout(r, 1500));" +
  "  const r = window.__vgSpikeReport || {};" +
  "  return { order: r.order || 0, hasApi: !!r.hasApi, dates: (r.stats && r.stats.dates) || null };" +
  "})()";

const session = await launch();
try {
  console.log("\n=== open the graph ===");
  // setEnable(true) FIRST. On a vault in restricted mode enablePlugin() registers the id
  // without loading anything, which reads as "the command did nothing" -- the trap
  // deferred-check.mjs fell into and documents.
  await session.cdp.eval(
    "(async () => {" +
    "  app.plugins.setEnable(true);" +
    "  await app.plugins.enablePluginAndSave('vault-graph');" +
    "  return true;" +
    "})()"
  );
  await sleep(3000);
  await session.cdp.eval("app.commands.executeCommandById('vault-graph:open')");
  await sleep(8000);

  const before = await session.cdp.eval(ORDER);
  check(before.hasApi && before.order > 0, "the graph is up and drawing notes",
    "order " + before.order);

  // Not this script's subject, but free here and it is the other half of github#6: a build
  // that cannot say how it dated things is how "118 undated" went unexplained.
  if (before.dates) {
    check(before.dates.none === 0, "every note got a date", JSON.stringify(before.dates));
  }

  console.log("\n=== write a note the graph has never seen ===");
  const files = await session.cdp.eval(
    "(async () => {" +
    "  const p = " + JSON.stringify(PROBE) + ";" +
    "  const old = app.vault.getAbstractFileByPath(p);" +
    "  if (old) await app.vault.delete(old);" +
    "  await app.vault.create(p, '# Probe\\n\\nWritten after the graph was drawn.\\n');" +
    "  await new Promise((r) => setTimeout(r, 2500));" +   // let the metadata cache catch up
    "  return app.vault.getMarkdownFiles().length;" +
    "})()"
  );
  check(files > 0, "the probe note is in the vault", files + " markdown files");

  const stale = await session.cdp.eval(ORDER);
  check(stale.order === before.order, "the graph has NOT noticed it on its own",
    "still " + stale.order + " -- which is the whole complaint in github#6");

  console.log("\n=== click Refresh ===");
  // The BUTTON, not the command. "Rebuild from the metadata cache" already worked; what
  // was reported is the control people actually reach for.
  const clicked = await session.cdp.eval(
    "(() => {" +
    "  const b = document.querySelector('#vg-refresh');" +
    "  if (!b) return { found: false, title: '' };" +
    "  b.click();" +
    "  return { found: true, title: b.title };" +
    "})()"
  );
  check(clicked.found === true, "the Refresh button is there to click");
  check(/rebuild/i.test(clicked.title || ""), "and its tooltip says what it now does",
    JSON.stringify(String(clicked.title || "").slice(0, 64) + "..."));

  await sleep(9000);
  const after = await session.cdp.eval(ORDER);
  check(after.order === before.order + 1, "the new note is on the disc",
    before.order + " -> " + after.order + " (expected " + (before.order + 1) + ")");
  check(after.hasApi === true, "and the view is live, not a torn-down husk");

  const leaves = await session.cdp.eval(
    "(() => ({ leaves: app.workspace.getLeavesOfType('" + VT + "').length," +
    "          canvases: document.querySelectorAll('#vg-graph canvas').length }))()"
  );
  check(leaves.leaves === 1 && leaves.canvases > 0,
    "one view, painted -- the rebuild left no second mount behind",
    leaves.leaves + " leaf, " + leaves.canvases + " canvases");
} finally {
  try {
    await session.cdp.eval(
      "(async () => { const f = app.vault.getAbstractFileByPath(" + JSON.stringify(PROBE) + ");" +
      "  if (f) await app.vault.delete(f); return true; })()"
    );
  } catch {}
  try { await session.cdp.close(); } catch {}
  try { session.child.kill(); } catch {}
  // Belt and braces: if the app died before that delete, the probe is still on disk and
  // the next run of any harness would count it as a note.
  try { rmSync(join(VAULT, PROBE), { force: true }); } catch {}
}

const bad = results.filter((r) => !r.ok);
console.log("\n" + (results.length - bad.length) + "/" + results.length + " passed");
process.exit(bad.length ? 1 : 0);
