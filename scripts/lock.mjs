#!/usr/bin/env node

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(tmpdir(), "vault-graph-locks");
const STALE_MS = { record: 20 * 60 * 1000, suite: 30 * 60 * 1000 };
const DEFAULT_STALE = 20 * 60 * 1000;
const DEFAULT_TIMEOUT = 45 * 60 * 1000;
const POLL_MS = 5000;

const argv = process.argv.slice(2);
const cmd = argv[0];
const name = argv[1];
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const owner = flag("owner", "");
const timeoutMs = Number(flag("timeout-ms", DEFAULT_TIMEOUT));

const dirFor = (n) => join(ROOT, n + ".lock");
const metaFor = (n) => join(dirFor(n), "owner.json");
const staleWindow = (n) => STALE_MS[n] || DEFAULT_STALE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readMeta(n) {
  try { return JSON.parse(readFileSync(metaFor(n), "utf8")); } catch { return null; }
}

function ageOf(meta) {
  return meta && meta.at ? Date.now() - meta.at : Infinity;
}

function usage(code) {
  console.error("usage: node scripts/lock.mjs <acquire|release|status> <record|suite> --owner <id>");
  process.exit(code);
}

async function acquire() {
  if (!name || !owner) usage(2);
  mkdirSync(ROOT, { recursive: true });
  const dir = dirFor(name);
  const deadline = Date.now() + timeoutMs;
  let announced = false;

  for (;;) {
    try {
      mkdirSync(dir);
      writeFileSync(metaFor(name), JSON.stringify({ owner: owner, at: Date.now(), pid: process.pid }, null, 1));
      console.log("ACQUIRED " + name + " by " + owner);
      process.exit(0);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }

    const meta = readMeta(name);
    const age = ageOf(meta);

    if (meta && meta.owner === owner) {
      console.log("ALREADY HELD by " + owner + " -- not re-entrant, treat as held");
      process.exit(0);
    }

    if (age > staleWindow(name)) {
      console.log("BREAKING stale " + name + " lock (age " + Math.round(age / 1000) + "s, owner " +
                  ((meta && meta.owner) || "unknown") + ")");
      try { rmSync(dir, { recursive: true, force: true }); } catch { void 0; }
      continue;
    }

    if (!announced) {
      console.log("WAITING for " + name + " -- held by " + ((meta && meta.owner) || "unknown") +
                  " for " + Math.round(age / 1000) + "s");
      announced = true;
    }

    if (Date.now() > deadline) {
      console.log("BUSY " + name + " -- gave up after " + Math.round(timeoutMs / 1000) + "s");
      process.exit(1);
    }
    await sleep(POLL_MS);
  }
}

function release() {
  if (!name || !owner) usage(2);
  if (!existsSync(dirFor(name))) {
    console.log("NOT HELD " + name + " -- nothing to release");
    process.exit(0);
  }
  const meta = readMeta(name);
  if (meta && meta.owner && meta.owner !== owner) {
    console.error("REFUSED -- " + name + " is held by " + meta.owner + ", not " + owner);
    process.exit(3);
  }
  rmSync(dirFor(name), { recursive: true, force: true });
  console.log("RELEASED " + name + " by " + owner);
}

function status() {
  if (!existsSync(ROOT)) { console.log("no locks held (" + ROOT + ")"); return; }
  const held = readdirSync(ROOT).filter((f) => f.endsWith(".lock"));
  if (!held.length) { console.log("no locks held (" + ROOT + ")"); return; }
  for (const h of held) {
    const n = h.replace(/\.lock$/, "");
    const meta = readMeta(n);
    console.log(n + "  owner=" + ((meta && meta.owner) || "unknown") +
                "  age=" + Math.round(ageOf(meta) / 1000) + "s" +
                (ageOf(meta) > staleWindow(n) ? "  STALE" : ""));
  }
}

if (cmd === "acquire") await acquire();
else if (cmd === "release") release();
else if (cmd === "status") status();
else usage(2);
