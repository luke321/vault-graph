#!/usr/bin/env node
// github#192
import { spawn, spawnSync } from "node:child_process";
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

// github#198
export const CALL_MS = 10_000;
export const WAIT_MIN_MS = 1_000;
export const WAIT_STEP_MS = 60_000;
export const WAIT_CAP_MS = 10 * 60_000;

let waitedMs = 0;
let warned = false;
/** @type {Set<string>} */
const deaf = new Set();
/** @type {Set<string>} */
const heard = new Set();
const say = (/** @type {string} */ line) => console.error("harness hook: " + line);
const pause = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

// github#198 -- exit 2 means the hook lacks this verb
/** @param {string[]} args @returns {Promise<string | null>} */
function ask(args) {
  const hook = hookPath();
  if (!hook || !existsSync(hook) || deaf.has(args[0])) return Promise.resolve(null);
  return new Promise((done) => {
    let out = "", err = "", settled = false;
    const finish = (/** @type {string | null} */ v) => { if (!settled) { settled = true; clearTimeout(timer); done(v); } };
    const child = spawn(process.execPath, [hook, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { try { child.kill(); } catch { void 0; } finish(null); }, CALL_MS);
    child.stdout.on("data", (d) => { out += String(d); });
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("error", () => finish(null));
    child.on("close", (code) => {
      if (code === 2) {
        if (!deaf.has(args[0])) say(`does not answer ${args[0]} -- not asking it again this run`);
        deaf.add(args[0]);
      }
      else if (err) process.stderr.write(err);
      finish(code === 0 ? out.trim().split(/\r?\n/).pop() || "" : null);
    });
  });
}

/** @param {string} raw @returns {{ go: true } | { wait: number } | { width: number } | null} */
function parseAdmit(raw) {
  const m = /^(go|wait|width)(?:\s+(\d+))?$/.exec(raw.trim());
  if (!m) return null;
  if (m[1] === "go" || (m[1] === "wait" && m[2] === "0")) return { go: true };
  if (m[2] === undefined) return null;
  return m[1] === "wait" ? { wait: Number(m[2]) } : { width: Math.max(1, Number(m[2])) };
}

/**
 * @param {string} job @param {string} owner
 * @param {Record<string, string | number>} [extra] @param {number} [pid]
 * @returns {Promise<{ go: true } | { width: number }>}
 */
export async function admit(job, owner, extra = {}, pid = process.pid) {
  if (!hookPath()) return { go: true };
  for (;;) {
    if (waitedMs >= WAIT_CAP_MS) return { go: true };
    const args = ["admit", job, "--owner", owner, "--pid", String(pid)];
    for (const [k, v] of Object.entries(extra)) args.push("--" + k, String(v));
    const raw = await ask(args);
    const a = raw === null ? null : parseAdmit(raw);
    if (!a) {
      if (!warned && !deaf.has("admit")) say(`no usable answer to admit ${job} (${raw === null ? "failed or took over " + CALL_MS / 1000 + "s" : JSON.stringify(raw)}) -- going ahead`);
      warned = true;
      return { go: true };
    }
    heard.add("admit");
    if (!("wait" in a)) return a;
    const ms = Math.min(Math.max(a.wait, WAIT_MIN_MS), WAIT_STEP_MS, WAIT_CAP_MS - waitedMs);
    say(`wait ${(ms / 1000).toFixed(1)}s before ${job}`);
    await pause(ms);
    waitedMs += ms;
    if (waitedMs >= WAIT_CAP_MS) say(`has held this run for ${WAIT_CAP_MS / 60_000} min -- going ahead without asking it again`);
  }
}

/** @param {string} job @param {string} owner @returns {Promise<number | null>} */
export async function threads(job, owner) {
  if (!hookPath()) return null;
  const raw = await ask(["threads", job, "--owner", owner]);
  if (raw === null || !/^\d+$/.test(raw.trim()) || !(Number(raw) > 0)) return null;
  heard.add("threads");
  return Number(raw);
}

/**
 * github#198 -- check-and-bump after the await is atomic
 * @param {string} job @param {string} owner @param {number} lanes
 */
export function admission(job, owner, lanes) {
  const s = { running: 0, peak: 0, finished: 0, narrowest: lanes, hooked: !!hookPath(),
             heard: () => heard.has("admit") };
  const take = () => { s.running++; s.peak = Math.max(s.peak, s.running); return true; };
  return Object.assign(s, {
    /** @param {string} kind @returns {Promise<boolean>} */
    async enter(kind) {
      if (!s.hooked) return take();
      const a = await admit(job, owner, { kind, running: s.running, lanes });
      if (!("width" in a) || s.running < a.width) return take();
      if (a.width < s.narrowest) {
        s.narrowest = a.width;
        say(`narrowed this run to ${a.width} of ${lanes} lane(s)`);
      }
      const seen = s.finished;
      while (s.finished === seen && s.running > 0) await pause(250);
      return false;
    },
    leave() { s.running--; s.finished++; },
  });
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
  } else if (verb === "admit" && name && owner) {
    const a = await admit(name, owner, {}, pid);
    console.log("width" in a ? "width " + a.width : "go");
  } else if (verb === "threads" && name && owner) {
    const n = await threads(name, owner);
    if (n) console.log(n);
  } else {
    console.error("usage: node scripts/harness-hook.mjs <acquire|release> <name> --owner <id> [--pid N]");
    console.error("       node scripts/harness-hook.mjs screen --owner <id> [--pid N]   (prints left|right|primary)");
    console.error("       node scripts/harness-hook.mjs admit <job> --owner <id>     (serves any wait, prints go|width N)");
    console.error("       node scripts/harness-hook.mjs threads <job> --owner <id>   (prints a count, or nothing)");
    console.error("       node scripts/harness-hook.mjs status");
    console.error("  --pid: the process that holds it until release; default this command's parent");
    code = 2;
  }
  process.exit(code);
}
