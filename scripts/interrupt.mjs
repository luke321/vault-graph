#!/usr/bin/env node
// github#197
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"];
const DAY_MS = 24 * 3600 * 1000;
const STALE = /^vg-smoke-(?:[a-z]+-)?p(\d+)-/;

/** @type {Array<() => unknown>} */
const cleanups = [];
let installed = false;
let stopping = false;

/**
 * @param {() => unknown} fn
 * @param {{ code?: number, budgetMs?: number }} [opts]
 */
export function onInterrupt(fn, { code = 130, budgetMs = 4000 } = {}) {
  cleanups.push(fn);
  if (installed) return;
  installed = true;
  const stop = () => {
    if (stopping) process.exit(code);
    stopping = true;
    void drain(budgetMs).finally(() => process.exit(code));
  };
  for (const sig of SIGNALS) process.on(sig, stop);
  const file = process.env.VG_STOP_FILE;
  if (file) {
    const poll = setInterval(() => { if (existsSync(file)) { clearInterval(poll); stop(); } }, 250);
    poll.unref();
  }
}

/** @returns {boolean} */
export function interrupted() { return stopping; }

/** @param {number} budgetMs */
async function drain(budgetMs) {
  const deadline = Date.now() + budgetMs;
  for (const fn of cleanups.slice().reverse()) {
    const left = deadline - Date.now();
    let step;
    try { step = Promise.resolve(fn()); } catch { continue; }
    if (left <= 0) continue;
    await Promise.race([step.catch(() => {}), new Promise((r) => setTimeout(r, left))]);
  }
}

/** @param {string} prefix @returns {string} */
export function runDir(prefix) {
  return mkdtempSync(join(tmpdir(), `${prefix}p${process.pid}-`));
}

/** @param {string | null | undefined} dir @returns {boolean} */
export function removeDir(dir) {
  if (!dir) return true;
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); return true; }
  catch { return false; }
}

/** @param {import("node:child_process").ChildProcess} child @param {number} ms @returns {Promise<void>} */
export function exited(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((r) => {
    const t = setTimeout(r, ms);
    child.once("exit", () => { clearTimeout(t); r(); });
  });
}

/** @param {number} pid */
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return /** @type {NodeJS.ErrnoException} */ (e).code === "EPERM"; }
}

/** @param {string[]} names @returns {string[]} */
function browsersUsing(names) {
  const r = process.platform === "win32"
    ? spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='Obsidian.exe'\" | " +
        "ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }"], { encoding: "utf8" })
    : spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  const want = new Set(names);
  const pids = [];
  for (const line of (r.stdout || "").split(/\r?\n/)) {
    const m = /^\s*(\d+)\s.*--user-data-dir=("?)([^"\s]+)\2/.exec(line);
    if (!m) continue;
    const base = m[3].replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
    if (want.has(base)) pids.push(m[1]);
  }
  return pids;
}

/** @param {{ budgetMs?: number, now?: number }} [opts] */
export function reapStale({ budgetMs = 3000, now = Date.now() } = {}) {
  const root = tmpdir();
  let names;
  try { names = readdirSync(root).filter((n) => n.startsWith("vg-smoke-")); } catch { return { killed: 0, removed: 0, left: 0 }; }
  const dead = [], old = [];
  for (const n of names) {
    const m = STALE.exec(n);
    if (m) { if (Number(m[1]) !== process.pid && !alive(Number(m[1]))) dead.push(n); continue; }
    try { if (now - statSync(join(root, n)).mtimeMs > DAY_MS) old.push(n); } catch { void 0; }
  }
  const stale = dead.concat(old);
  const profiles = dead.filter((n) => !/^vg-smoke-[a-z]+-/.test(n));
  const pids = profiles.length ? browsersUsing(profiles) : [];
  for (const pid of pids) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
    else { try { process.kill(Number(pid), "SIGKILL"); } catch { void 0; } }
  }
  const stop = Date.now() + budgetMs;
  let removed = 0;
  for (const n of stale) {
    if (Date.now() > stop) break;
    removeDir(join(root, n));
    removed++;
  }
  return { killed: pids.length, removed, left: stale.length - removed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== "reap") {
    console.error("usage: node scripts/interrupt.mjs reap");
    process.exit(2);
  }
  const i = process.argv.indexOf("--budget");
  const r = reapStale(i > 0 ? { budgetMs: Number(process.argv[i + 1]) || 3000 } : {});
  console.log(`reaped ${r.killed} browser(s) and ${r.removed} temp dir(s) left by runs that are gone` +
              (r.left ? `, ${r.left} more next time` : ""));
}
