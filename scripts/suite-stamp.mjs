#!/usr/bin/env node
// github#93, decisions/0013

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync,
         rmdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

export const FIXTURE_MAX_AGE_DAYS = 7;
export const FIXTURE_NAMES = ["demo-vault", "test-vault", "shape-vault"];

function git(args, cwd) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function commonDir(cwd = ROOT) {
  const common = git(["rev-parse", "--git-common-dir"], cwd);
  if (!common) return null;
  return /^(?:[A-Za-z]:[\\/]|\/)/.test(common) ? common : join(cwd, common);
}

export function fixtureStore(cwd = ROOT) {
  const common = commonDir(cwd);
  return common ? join(dirname(common), ".fixtures") : join(cwd, ".fixtures");
}

export function stampDir(cwd = ROOT) {
  const common = commonDir(cwd);
  return common ? join(common, "suite-passed") : null;
}

export function treeOf(rev, cwd = ROOT) {
  return git(["rev-parse", "--verify", "--quiet", rev + "^{tree}"], cwd);
}

export function modifiedTracked(cwd = ROOT) {
  const s = git(["status", "--porcelain", "--untracked-files=no"], cwd);
  return s === null ? null : s.split("\n").filter(Boolean);
}

const todayDay = () => new Date().toISOString().slice(0, 10);
export const ageDays = (day) => Math.floor((Date.parse(todayDay()) - Date.parse(day)) / 86400000);

export function describeFixture(dir) {
  try {
    const st = JSON.parse(readFileSync(join(dir, ".stamp.json"), "utf8"));
    const pinned = Array.isArray(st.args) && st.args.indexOf("--end") >= 0;
    return { digest: st.digest, day: st.day, pinned };
  } catch {
    return null;
  }
}

export function currentFixtures(cwd = ROOT) {
  const store = fixtureStore(cwd);
  const out = [];
  let dirs = [];
  try { dirs = readdirSync(store); } catch { dirs = []; }
  for (const name of FIXTURE_NAMES) {
    const dir = dirs.filter((d) => d.startsWith(name + "-")).sort()[0];
    const desc = dir ? describeFixture(join(store, dir)) : null;
    out.push(desc ? { name, ...desc } : { name, digest: null, day: null, pinned: false });
  }
  return out;
}

function sameFixture(want, have) {
  return have && want.digest === have.digest && want.day === have.day;
}

export function lookup(rev = "HEAD", cwd = ROOT) {
  const tree = treeOf(rev, cwd);
  if (!tree) return { ok: false, why: `${rev} does not resolve to a tree` };
  const dir = stampDir(cwd);
  const file = dir ? join(dir, tree + ".json") : null;
  if (!file || !existsSync(file)) return { ok: false, tree, why: `no stamp for tree ${tree.slice(0, 7)}` };
  let stamp;
  try { stamp = JSON.parse(readFileSync(file, "utf8")); }
  catch (e) { return { ok: false, tree, why: `unreadable stamp for tree ${tree.slice(0, 7)}: ${e.message}` }; }
  const have = currentFixtures(cwd);
  const stamped = Array.isArray(stamp.fixtures) ? stamp.fixtures : [];
  // github#103
  for (const name of FIXTURE_NAMES) {
    const want = stamped.find((f) => f && f.name === name);
    if (!want) {
      return { ok: false, tree, stamp, why: `the stamp names no ${name} run, so it is not a full suite pass` };
    }
    const now = have.find((f) => f.name === name);
    if (!sameFixture(want, now)) {
      return { ok: false, tree, stamp,
               why: `fixture ${want.name} is not the one that passed (stamped ${want.digest} of ${want.day}, ` +
                    `store has ${now && now.digest ? now.digest + " of " + now.day : "none"})` };
    }
    if (!want.pinned && ageDays(want.day) > FIXTURE_MAX_AGE_DAYS) {
      return { ok: false, tree, stamp,
               why: `fixture ${want.name} is ${ageDays(want.day)} days old and the next run would regenerate it` };
    }
  }
  return { ok: true, tree, stamp, file };
}

export function record({ fixtures, checks, cwd = ROOT }) {
  const dirty = modifiedTracked(cwd);
  if (dirty === null) return { wrote: null, why: "not a git checkout" };
  if (dirty.length) {
    return { wrote: null, why: `the working tree differs from HEAD in ${dirty.length} tracked file(s), ` +
                               `so this run measured something no commit names` };
  }
  const tree = treeOf("HEAD", cwd);
  const dir = stampDir(cwd);
  if (!tree || !dir) return { wrote: null, why: "cannot resolve HEAD's tree" };
  // github#103
  const ran = FIXTURE_NAMES.map((name) => (fixtures || []).find((f) => f && f.name === name));
  for (let i = 0; i < FIXTURE_NAMES.length; i++) {
    const f = ran[i];
    if (!f) return { wrote: null, why: `${FIXTURE_NAMES[i]} did not run, so this run is not the full suite` };
    if (!f.digest || !f.day) return { wrote: null, why: `${f.name} has no digest or day to record` };
  }
  mkdirSync(dir, { recursive: true });
  const file = join(dir, tree + ".json");
  const stamp = {
    tree,
    commit: git(["rev-parse", "HEAD"], cwd),
    at: new Date().toISOString(),
    checks,
    fixtures: ran.map((f) => ({ name: f.name, digest: f.digest, day: f.day, pinned: !!f.pinned })),
  };
  writeFileSync(file, JSON.stringify(stamp, null, 2) + "\n");
  return { wrote: file, tree };
}

export function describe(hit) {
  const s = hit.stamp;
  return `tree ${hit.tree.slice(0, 7)} passed the invariant suite at ${s.at} ` +
         `(${s.checks} checks, commit ${String(s.commit || "?").slice(0, 7)}, ` +
         `fixtures ${s.fixtures.map((f) => f.name + "@" + f.day).join(" ")})`;
}

function selftest() {
  const base = mkdtempSync(join(tmpdir(), "vg-stamp-selftest-"));
  const repo = join(base, "repo");
  const sh = (args) => {
    const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
    return r.stdout.trim();
  };
  const fails = [];
  const expect = (label, cond) => {
    console.log(`  ${cond ? "ok  " : "FAIL"} ${label}`);
    if (!cond) fails.push(label);
  };
  try {
    mkdirSync(repo);
    sh(["init", "-q", "-b", "main"]);
    sh(["config", "user.email", "selftest@example.invalid"]);
    sh(["config", "user.name", "selftest"]);
    writeFileSync(join(repo, "a.txt"), "a\n");
    sh(["add", "a.txt"]);
    sh(["commit", "-q", "-m", "one"]);

    const store = fixtureStore(repo);
    const today = todayDay();
    const seed = (name, digest, day, pinned) => {
      for (const d of (existsSync(store) ? readdirSync(store) : [])) {
        if (d.startsWith(name + "-")) rmSync(join(store, d), { recursive: true, force: true });
      }
      const dir = join(store, `${name}-${digest}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, ".stamp.json"),
                    JSON.stringify({ digest, day, args: pinned ? ["--end", "2026-08-28"] : [] }));
    };
    seed("demo-vault", "aaaaaaaa", today, false);
    seed("test-vault", "bbbbbbbb", "2026-08-28", true);
    seed("shape-vault", "cccccccc", today, false);

    expect("no stamp yet -> miss", !lookup("HEAD", repo).ok);
    const wrote = record({ fixtures: currentFixtures(repo), checks: 3, cwd: repo });
    expect("a clean tree records a stamp", !!wrote.wrote);
    expect("the same commit hits", lookup("HEAD", repo).ok);

    sh(["commit", "-q", "--allow-empty", "-m", "same tree, new commit"]);
    expect("a new commit with the same tree hits", lookup("HEAD", repo).ok);
    sh(["checkout", "-q", "-b", "side", "HEAD~1"]);
    sh(["checkout", "-q", "main"]);
    sh(["merge", "-q", "--no-ff", "-m", "merge", "side"]);
    expect("a merge commit with the same tree hits", lookup("HEAD", repo).ok);

    writeFileSync(join(repo, "a.txt"), "changed\n");
    const dirty = record({ fixtures: currentFixtures(repo), checks: 3, cwd: repo });
    expect("a dirty tree refuses to record", !dirty.wrote && /differs from HEAD/.test(dirty.why));
    expect("a dirty tree still hits for HEAD's own tree", lookup("HEAD", repo).ok);
    sh(["commit", "-q", "-am", "changed"]);
    const miss = lookup("HEAD", repo);
    expect("a changed tree misses", !miss.ok && /no stamp/.test(miss.why));
    expect("the earlier tree still hits by revision", lookup("HEAD~1", repo).ok);

    seed("demo-vault", "aaaaaaaa", "2026-01-01", false);
    const moved = lookup("HEAD~1", repo);
    expect("a regenerated fixture misses", !moved.ok && /not the one that passed/.test(moved.why));
    seed("demo-vault", "aaaaaaaa", today, false);
    expect("restoring the fixture hits again", lookup("HEAD~1", repo).ok);

    const old = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
    seed("shape-vault", "cccccccc", old, false);
    sh(["checkout", "-q", "HEAD~1"]);
    record({ fixtures: currentFixtures(repo), checks: 3, cwd: repo });
    const aged = lookup("HEAD", repo);
    expect("an aged unpinned fixture misses", !aged.ok && /would regenerate/.test(aged.why));
    seed("test-vault", "bbbbbbbb", "2026-08-28", true);
    seed("shape-vault", "cccccccc", today, false);
    record({ fixtures: currentFixtures(repo), checks: 3, cwd: repo });
    expect("a pinned fixture never ages", lookup("HEAD", repo).ok);

    // github#103
    const two = record({ fixtures: currentFixtures(repo).filter((f) => f.name !== "test-vault"),
                         checks: 3, cwd: repo });
    expect("a run missing a fixture refuses to record", !two.wrote && /test-vault did not run/.test(two.why));
    const stampFile = lookup("HEAD", repo).file;
    const full = readFileSync(stampFile, "utf8");
    const cut = JSON.parse(full);
    cut.fixtures = cut.fixtures.filter((f) => f.name !== "test-vault");
    writeFileSync(stampFile, JSON.stringify(cut));
    const short = lookup("HEAD", repo);
    expect("a stamp naming two fixtures misses", !short.ok && /names no test-vault/.test(short.why));
    writeFileSync(stampFile, full);
    expect("the full stamp hits again", lookup("HEAD", repo).ok);

    const link = join(base, "via-link");
    symlinkSync(HERE, link, "junction");
    let via;
    try {
      via = spawnSync(process.execPath, [join(link, "suite-stamp.mjs"), "check", "HEAD"],
                      { encoding: "utf8", cwd: repo });
    } finally {
      try { rmdirSync(link); } catch { unlinkSync(link); }
    }
    expect("the CLI answers when invoked through a junction", /^suite-stamp: /.test(via.stdout) &&
           (via.status === 0 || via.status === 1));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  console.log(fails.length ? `\nselftest: ${fails.length} FAILED` : "\nselftest: all passed");
  return fails.length ? 1 : 0;
}

// github#103
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  const norm = (p) => realpathSync(p).replace(/\\/g, "/").toLowerCase();
  try { return norm(process.argv[1]) === norm(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) process.exit(selftest());
  const cmd = argv[0] || "check";
  if (cmd === "check") {
    const hit = lookup(argv[1] || "HEAD");
    if (hit.ok) { console.log("suite-stamp: " + describe(hit)); process.exit(0); }
    console.log("suite-stamp: " + hit.why);
    process.exit(1);
  }
  if (cmd === "list") {
    const dir = stampDir();
    for (const f of (dir && existsSync(dir) ? readdirSync(dir).sort() : [])) {
      try {
        const s = JSON.parse(readFileSync(join(dir, f), "utf8"));
        console.log(`${s.tree.slice(0, 7)}  ${s.at}  commit ${String(s.commit || "?").slice(0, 7)}  ${s.checks} checks`);
      } catch { console.log(`${f}  (unreadable)`); }
    }
    process.exit(0);
  }
  console.error("usage: node scripts/suite-stamp.mjs [check [<rev>] | list | --selftest]");
  process.exit(2);
}
