// github#129, design/0018

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// design/0018
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms).unref(); });

/** @type {{ proc: import("node:child_process").ChildProcess, ask: (cmd: string) => Promise<string> } | null} */
let helper = null;
let helperFailed = false;
/** @type {string | null} */
let home = null;

function startHelper() {
  if (helper || helperFailed) return helper;
  if (process.platform !== "win32") { helperFailed = true; return null; }
  // design/0018
  if (process.env.VG_NO_FOCUS_GUARD) { helperFailed = true; return null; }
  let proc;
  try {
    proc = spawn("powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(HERE, "focus-guard.ps1")],
      { stdio: ["pipe", "pipe", "ignore"] });
  } catch { helperFailed = true; return null; }

  /** @type {((line: string) => void)[]} */
  const waiting = [];
  // design/0018
  const refWhileBusy = () => { if (waiting.length) proc.stdout.ref(); else proc.stdout.unref(); };
  let buf = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (d) => {
    buf += d;
    for (let i; (i = buf.indexOf("\n")) >= 0; ) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const w = waiting.shift();
      if (w) w(line);
    }
    refWhileBusy();
  });
  const die = () => { while (waiting.length) waiting.shift()("ERR gone"); helper = null; helperFailed = true; };
  proc.on("error", die);
  proc.on("exit", die);
  proc.unref();
  proc.stdout.unref();
  proc.stdin.unref();

  const ask = (cmd) => new Promise((resolve) => {
    if (!proc.stdin.writable) return resolve("ERR gone");
    const timer = setTimeout(() => {
      const at = waiting.indexOf(done);
      if (at >= 0) waiting.splice(at, 1);
      refWhileBusy();
      resolve("ERR timeout");
    }, 5000);
    timer.unref();
    const done = (line) => { clearTimeout(timer); resolve(line); };
    waiting.push(done);
    refWhileBusy();
    try { proc.stdin.write(cmd + "\n"); } catch { done("ERR gone"); }
  });

  helper = { proc, ask };
  return helper;
}

/** design/0018 */
export function releaseFocusGuard() {
  if (!helper) return;
  const h = helper;
  helper = null;
  try { h.proc.stdin.write("quit\n"); } catch { void 0; }
  try { h.proc.kill(); } catch { void 0; }
}
process.once("exit", releaseFocusGuard);

/** @typedef {{ watch: (childPid?: number, opts?: { forMs?: number }) => Promise<string> }} FocusGuard */

const NOOP = /** @type {FocusGuard} */ ({ watch: async () => "off" });

/**
 * github#129, design/0018
 * @returns {Promise<FocusGuard>}
 */
export async function keepFocus() {
  const h = startHelper();
  if (!h) return NOOP;
  // design/0018 -- home is captured once per run, before the FIRST spawn
  if (!home) {
    const before = await h.ask("fg");
    home = /^(\d+) (\d+)$/.exec(before)?.[1] || null;
  }
  const hwnd = home;
  if (!hwnd) return NOOP;

  return {
    /**
     * design/0018 -- never await this on the critical path.
     * @param {number} [childPid]
     * @param {{ forMs?: number }} [opts]
     * @returns {Promise<string>} already | foreign | plain | attach | failed | off
     */
    async watch(childPid, { forMs = 8000 } = {}) {
      if (!childPid || !helper) return "off";
      const until = Date.now() + forMs;
      let last = "already";
      for (;;) {
        if (!helper) return last;
        const r = await helper.ask(`handback ${hwnd} ${childPid}`);
        if (r === "foreign" || r === "failed" || r.startsWith("ERR")) return r;
        if (r === "plain" || r === "attach") last = r;
        if (Date.now() >= until) return last;
        await sleep(200);
      }
    },
  };
}
