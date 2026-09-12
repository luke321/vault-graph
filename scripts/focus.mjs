// github#129, design/0018 -- a harness run must not take the keyboard.
//
// Every harness here launches a real, visible window, and a newly created top-level window
// activates itself. Nothing can prevent that from outside the process: Chrome has no
// "open without activating" flag, and SW_SHOWNOACTIVATE / SWP_NOACTIVATE act on a window that
// has already taken the foreground. Windows permits the activation because the harness was
// spawned by the process holding the foreground -- and that same privilege is what lets the
// harness hand the keyboard straight back. So a run-long theft becomes a sub-second flicker.
//
// record-demo.ps1 is deliberately not a caller: it captures with gdigrab -i desktop and needs a
// genuinely frontmost window and the real cursor.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// unref'd throughout: a background watch must never be the reason a harness stays alive
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms).unref(); });

/** @type {{ proc: import("node:child_process").ChildProcess, ask: (cmd: string) => Promise<string> } | null} */
let helper = null;
let helperFailed = false;

function startHelper() {
  if (helper || helperFailed) return helper;
  if (process.platform !== "win32") { helperFailed = true; return null; }
  let proc;
  try {
    proc = spawn("powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(HERE, "focus-guard.ps1")],
      { stdio: ["pipe", "pipe", "ignore"] });
  } catch { helperFailed = true; return null; }

  /** @type {((line: string) => void)[]} */
  const waiting = [];
  // The pipe is ref'd only while a reply is outstanding. Unref'd throughout, an `await` on the
  // helper is the only pending work in the loop, node sees nothing keeping it alive and exits 13
  // ("unsettled top-level await") -- which is how a harness dies one second into its own run.
  // Ref'd throughout, the helper keeps the harness alive forever instead. It has to be both.
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
  // never the reason a harness stays alive
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

/** Stop the helper. Safe to call twice, and called for you when the harness exits. */
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
 * Note which window has the keyboard, so it can be given back to it. Call immediately BEFORE
 * spawning a browser or Obsidian, and call `watch(child.pid)` immediately after -- those two
 * lines are the whole integration.
 *
 * Costs one PowerShell the first time it is called in a run and nothing after that. Every failure
 * path degrades to a no-op: a harness must still run on a machine where this cannot work.
 *
 * @returns {Promise<FocusGuard>}
 */
export async function keepFocus() {
  const h = startHelper();
  if (!h) return NOOP;
  const before = await h.ask("fg");
  const hwnd = /^(\d+) (\d+)$/.exec(before)?.[1];
  if (!hwnd) return NOOP;

  return {
    /**
     * Watch for the window that was just spawned taking the keyboard, and give it straight back.
     *
     * This does NOT block the harness and must not be awaited on the critical path: the steal
     * lands a second or two after the spawn -- measured at 1.9-2.2 s for Chrome, which is after
     * the CDP attach already succeeded -- so a hand-back tried once at the attach misses it. The
     * watch polls until it hands the keyboard back or `forMs` runs out, and its timers are
     * unref'd, so a harness that finishes early is never held open by it.
     *
     * It stops on `foreign`: if the keyboard is with something this run did not spawn, someone
     * moved it there on purpose and the guard has no business pulling it away.
     *
     * @param {number} [childPid]
     * @param {{ forMs?: number }} [opts] how long to keep looking -- longer for Electron, whose
     *   window can appear well after the process does
     * @returns {Promise<string>} already | foreign | plain | attach | failed | off
     */
    async watch(childPid, { forMs = 8000 } = {}) {
      if (!childPid || !helper) return "off";
      const until = Date.now() + forMs;
      let last = "already";
      for (;;) {
        if (!helper) return last;
        const r = await helper.ask(`handback ${hwnd} ${childPid}`);
        if (r === "foreign" || r === "failed") return r;
        if (r === "plain" || r === "attach") last = r;   // took it back; keep watching for the next
        if (Date.now() >= until) return last;
        await sleep(200);
      }
    },
  };
}
