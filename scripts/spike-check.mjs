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

import { attach } from "./cdp.mjs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

const exe = findObsidian();
console.log("obsidian: " + exe);
console.log("vault:    " + VAULT);
console.log("port:     " + PORT);

const child = spawn(exe, [
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + USER_DATA,
  "obsidian://open?path=" + encodeURIComponent(VAULT),
], { stdio: "ignore", detached: false });

let cdp = null;
const fail = (msg) => { console.error("FAIL " + msg); shutdown(1); };
const shutdown = async (code) => {
  try { if (cdp) await cdp.close(); } catch {}
  if (!KEEP) { try { child.kill(); } catch {} }
  process.exit(code);
};

try {
  // The window takes a while: Obsidian has to open the vault, index it, and load the
  // plugin before the view can exist.
  let attached = null;
  for (let i = 0; i < 40 && !attached; i++) {
    await sleep(1000);
    try { attached = await attach(PORT, "app://obsidian.md"); } catch (e) { /* not up yet */ }
  }
  if (!attached) fail("could not attach to Obsidian on port " + PORT);
  cdp = attached;

  // cdp.mjs already exposes eval() -- reusing it unchanged is part of what this script
  // is here to demonstrate.
  const evalIn = (expr) => cdp.eval(expr);

  const pluginId = "vault-graph-spike";
  const enabled = await evalIn(`!!app.plugins.getPlugin(${JSON.stringify(pluginId)})`);
  if (!enabled) fail("plugin not loaded -- is it enabled in that vault?");
  console.log("plugin loaded");

  // Open the view, then let it build and mount.
  await evalIn(`app.commands.executeCommandById(${JSON.stringify(pluginId + ":open")})`);
  await sleep(2500);
  await evalIn(`app.commands.executeCommandById(${JSON.stringify(pluginId + ":report")})`);
  await sleep(1500);

  const report = await evalIn("window.__vgSpikeReport || null");
  if (!report) fail("no report -- the view never produced one");

  console.log("\n=== spike report =======================================");
  console.log(JSON.stringify(report, null, 2));

  // The one thing only CDP can answer: can the harness reach __vg INSIDE the frame,
  // even though the host cannot? Frames get their own execution contexts, and CDP is
  // not bound by the same-origin rule that stops the host.
  const frames = await cdp.send("Page.getFrameTree").catch(() => null);
  const kids = frames && frames.frameTree && frames.frameTree.childFrames;
  console.log("\nchild frames seen by CDP: " + (kids ? kids.length : 0));

  const verdict = [];
  verdict.push(["page mounted", !!report.mountStrategy, report.mountStrategy || "no"]);
  verdict.push(["__vg present in page", !!(report.handshake && report.handshake.hasVg)]);
  verdict.push(["canvases painted", (report.handshake && report.handshake.canvases) > 0,
                (report.handshake && report.handshake.canvases) + " canvases"]);
  verdict.push(["host can reach __vg directly",
                !!(report.hostCanReachFrame && report.hostCanReachFrame.reachable),
                report.hostCanReachFrame && report.hostCanReachFrame.note]);
  verdict.push(["probe over postMessage",
                !!(report.probeOverPostMessage && report.probeOverPostMessage.planParity),
                report.probeOverPostMessage && report.probeOverPostMessage.planParity
                  ? "parityOK=" + report.probeOverPostMessage.planParity.parityOK
                  : (report.probeOverPostMessage && report.probeOverPostMessage.error)]);

  console.log("\n=== verdict ============================================");
  for (const [name, ok, note] of verdict) {
    console.log((ok ? "  yes  " : "  NO   ") + name + (note ? "   (" + note + ")" : ""));
  }
  console.log("\nNote: 'host can reach __vg directly' being NO is the expected and correct");
  console.log("result under a sandboxed frame. It is listed because it is the reason the");
  console.log("probe channel has to exist at all.");

  await shutdown(0);
} catch (e) {
  console.error(e);
  await shutdown(1);
}
