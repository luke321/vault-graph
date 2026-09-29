#!/usr/bin/env node
// github#192
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { useScreen } from "./screen.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCREENS = ["left", "right", "primary"];

/** @type {string | null | undefined} */
let resolved;

/** @returns {string | null} */
export function hookPath() {
  if (resolved !== undefined) return resolved;
  let p = (process.env.VAULT_GRAPH_HARNESS_HOOK || "").trim();
  if (!p) {
    const r = spawnSync("git", ["config", "--get", "vaultgraph.harnessHook"], { cwd: HERE, encoding: "utf8" });
    p = r.status === 0 ? (r.stdout || "").trim() : "";
  }
  resolved = p && p !== "off" ? resolve(HERE, "..", p) : null;
  if (resolved && !existsSync(resolved)) {
    console.error("the harness hook " + resolved + " does not exist -- fix VAULT_GRAPH_HARNESS_HOOK or");
    console.error("  vaultgraph.harnessHook, or set the variable to off");
  }
  return resolved;
}

/** @param {string[]} args @param {"inherit" | "pipe" | "ignore"} out */
function run(args, out) {
  if (!existsSync(/** @type {string} */ (hookPath()))) return { status: 1, stdout: "" };
  return spawnSync(process.execPath, [/** @type {string} */ (hookPath()), ...args],
    { stdio: ["ignore", out, out === "ignore" ? "ignore" : "inherit"], encoding: "utf8" });
}

/** @param {string} name @param {string} owner @param {number} [pid] @returns {boolean} */
export function acquire(name, owner, pid = process.pid) {
  if (!hookPath()) return true;
  return run(["acquire", name, "--owner", owner, "--pid", String(pid)], "inherit").status === 0;
}

/** @param {string | null} name @param {string} owner */
export function release(name, owner) {
  if (!name || !hookPath()) return;
  try { run(["release", name, "--owner", owner], "ignore"); } catch { void 0; }
}

/** @param {string} owner @param {number} [pid] @returns {{ ok: boolean, lock: string | null, which: string | null }} */
export function claimScreen(owner, pid = process.pid) {
  if (!hookPath()) return { ok: true, lock: null, which: null };
  const r = run(["screen", "--owner", owner, "--pid", String(pid)], "pipe");
  const which = String(r.stdout || "").trim().split(/\s+/).pop() || "";
  if (r.status !== 0 || !SCREENS.includes(which)) return { ok: false, lock: null, which: null };
  useScreen(which);
  return { ok: true, lock: "screen-" + which, which: which };
}

export function noFreeScreen() {
  console.error("the harness hook found no free screen -- something else is using them.");
  console.error("  who: node scripts/harness-hook.mjs status");
}

// github#192 -- for bash and PowerShell; the caller is our parent
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flag = (/** @type {string} */ n) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] || "" : ""; };
  const [verb, name] = argv;
  const owner = flag("owner");
  const pid = Number(flag("pid")) || process.ppid;
  let code = 0;
  if (verb === "status") {
    if (!hookPath()) console.log("no harness hook configured -- nothing is locked");
    else code = run(["status"], "inherit").status ?? 1;
  } else if (verb === "acquire" && name && owner) {
    code = acquire(name, owner, pid) ? 0 : 1;
  } else if (verb === "release" && name && owner) {
    release(name, owner);
  } else if (verb === "screen" && owner) {
    const s = claimScreen(owner, pid);
    if (s.which) console.log(s.which);
    code = s.ok ? 0 : 1;
  } else {
    console.error("usage: node scripts/harness-hook.mjs <acquire|release> <name> --owner <id> [--pid N]");
    console.error("       node scripts/harness-hook.mjs screen --owner <id> [--pid N]   (prints left|right|primary)");
    console.error("       node scripts/harness-hook.mjs status");
    console.error("  --pid: the process that holds it until release; default this command's parent");
    code = 2;
  }
  process.exit(code);
}
