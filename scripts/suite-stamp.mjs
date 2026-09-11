#!/usr/bin/env node
// github#93, decisions/0013

import { chromeVersion, findChrome, normaliseVersion } from "./chrome.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync,
         rmdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

export const FIXTURE_MAX_AGE_DAYS = 7;
export const FIXTURE_NAMES = ["demo-vault", "test-vault", "shape-vault", "tag-vault"];

function git(args, cwd) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function commonDir(cwd = ROOT) {
  const common = git(["rev-parse", "--git-common-dir"], cwd);
  if (!common) return null;
  return /^(?:[A-Za-z]:[\\/]|\/)/.test(common) ? common : join(cwd, common);
}

// github#106 -- VG_FIXTURE_STORE is the test seam
export function fixtureStore(cwd = ROOT) {
  if (process.env.VG_FIXTURE_STORE) return process.env.VG_FIXTURE_STORE;
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

// github#104 -- the tree the pages are built from
export function startRun(cwd = ROOT) {
  return { tree: treeOf("HEAD", cwd), dirty: modifiedTracked(cwd) };
}

// github#104
export const DEFAULT_JOBS = 2;

function defaultChrome() {
  try { return findChrome(); } catch { return null; }
}

// github#104 -- the shape the two gates always push with
export function defaultShape() {
  return { jobs: DEFAULT_JOBS, grid: DEFAULT_JOBS > 1, headed: false, port: 0, chrome: defaultChrome() };
}

// github#104 -- takes the values the run USED, never a second parse of argv
export function shapeDeltas(shape) {
  const d = defaultShape();
  const out = [];
  if (shape.jobs !== d.jobs) out.push(`--jobs ${shape.jobs} (default ${d.jobs})`);
  if (!!shape.grid !== d.grid) {
    out.push(`the grid is ${shape.grid ? "on" : "off"} (default ${d.grid ? "on" : "off"})`);
  }
  if (shape.headed) out.push("--headed (default: positioned off-screen)");
  if (shape.port) out.push(`--port ${shape.port} (default: a free port per lane)`);
  const chrome = shape.chrome || d.chrome;
  if (chrome !== d.chrome) {
    out.push(`--chrome ${chrome} (default ${d.chrome || "the first Chrome on this machine"})`);
  }
  return out;
}

function currentChrome() {
  const exe = defaultChrome();
  return exe ? normaliseVersion(chromeVersion(exe)) : null;
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

// github#106 -- every .md outside a dot-folder
export function countNotes(dir) {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!entry.startsWith(".")) n += countNotes(p); }
    else if (entry.toLowerCase().endsWith(".md")) n++;
  }
  return n;
}

// github#106 -- a stamp is not proof the vault is usable
export function checkFixture(dir) {
  let st;
  try { st = JSON.parse(readFileSync(join(dir, ".stamp.json"), "utf8")); }
  catch (e) { return { ok: false, why: `no readable .stamp.json (${e.message})` }; }
  if (typeof st.digest !== "string" || typeof st.day !== "string") {
    return { ok: false, why: "the stamp names no digest or day" };
  }
  let obs; try { obs = statSync(join(dir, ".obsidian")); } catch { obs = null; }
  if (!obs || !obs.isDirectory()) {
    return { ok: false, why: `no .obsidian in ${dir} -- build-graph.mjs would refuse it` };
  }
  if (typeof st.notes !== "number") return { ok: false, why: "the stamp records no note count" };
  let notes;
  try { notes = countNotes(dir); }
  catch (e) { return { ok: false, why: `the walk failed midway (${e.message})` }; }
  if (notes !== st.notes) {
    return { ok: false, why: `${notes} notes on disk, the stamp says ${st.notes}` };
  }
  return { ok: true, notes };
}

export function currentFixtures(cwd = ROOT) {
  const store = fixtureStore(cwd);
  const out = [];
  let dirs = [];
  try { dirs = readdirSync(store); } catch { dirs = []; }
  for (const name of FIXTURE_NAMES) {
    const dir = dirs.filter((d) => d.startsWith(name + "-")).sort()[0];
    const desc = dir ? describeFixture(join(store, dir)) : null;
    // github#106 -- a corrupt fixture keeps its identity and says why
    const health = desc ? checkFixture(join(store, dir)) : null;
    out.push(desc ? { name, ...desc, ...(health.ok ? {} : { corrupt: health.why }) }
                  : { name, digest: null, day: null, pinned: false });
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
    // github#106 -- the same fixture, no longer usable
    if (now.corrupt) {
      return { ok: false, tree, stamp,
               why: `fixture ${want.name} is corrupt (${now.corrupt}) and the next run would regenerate it` };
    }
    if (!want.pinned && ageDays(want.day) > FIXTURE_MAX_AGE_DAYS) {
      return { ok: false, tree, stamp,
               why: `fixture ${want.name} is ${ageDays(want.day)} days old and the next run would regenerate it` };
    }
  }
  // github#104 -- a stamp older than the browser it was taken against
  const drove = normaliseVersion(stamp.chrome);
  const now = drove ? currentChrome() : null;
  if (drove && now && now !== drove) {
    return { ok: false, tree, stamp,
             why: `the run that passed drove Chrome ${drove}, and Chrome is ${now} now` };
  }
  return { ok: true, tree, stamp, file };
}

export function record({ fixtures, checks, started, chrome, cwd = ROOT }) {
  // github#104 -- a caller that captured nothing cannot say what it built
  if (!started) {
    return { wrote: null, why: "this run did not capture the tree it built, so nothing can say what it measured" };
  }
  if (started.dirty === null) return { wrote: null, why: "not a git checkout" };
  // github#104
  if (started.dirty.length) {
    return { wrote: null, why: `the working tree differed from HEAD in ${started.dirty.length} tracked file(s) ` +
                               `when this run started, so it measured something no commit names` };
  }
  // github#104 -- the two moments the tree can be dirty
  const dirty = modifiedTracked(cwd);
  if (dirty === null) return { wrote: null, why: "not a git checkout" };
  if (dirty.length) {
    return { wrote: null, why: `the working tree differs from HEAD in ${dirty.length} tracked file(s), ` +
                               `so this run measured something no commit names` };
  }
  // github#106 -- a scratch store gates nothing
  if (process.env.VG_FIXTURE_STORE) {
    return { wrote: null, why: "VG_FIXTURE_STORE points this run at a scratch store, not the one the gate reads" };
  }
  const tree = treeOf("HEAD", cwd);
  const dir = stampDir(cwd);
  if (!tree || !dir) return { wrote: null, why: "cannot resolve HEAD's tree" };
  if (!started.tree) return { wrote: null, why: "cannot resolve the tree this run built" };
  // github#104 -- work landed while the suite ran
  if (tree !== started.tree) {
    return { wrote: null, why: `HEAD moved while this run was measuring: the pages were built from tree ` +
                               `${started.tree.slice(0, 7)} and HEAD names ${tree.slice(0, 7)} now` };
  }
  // github#103
  const ran = FIXTURE_NAMES.map((name) => (fixtures || []).find((f) => f && f.name === name));
  for (let i = 0; i < FIXTURE_NAMES.length; i++) {
    const f = ran[i];
    if (!f) return { wrote: null, why: `${FIXTURE_NAMES[i]} did not run, so this run is not the full suite` };
    if (!f.digest || !f.day) return { wrote: null, why: `${f.name} has no digest or day to record` };
    // github#106
    if (f.corrupt) return { wrote: null, why: `${f.name} is corrupt (${f.corrupt}), so nothing passed against it` };
  }
  mkdirSync(dir, { recursive: true });
  const file = join(dir, tree + ".json");
  const drove = normaliseVersion(chrome);
  const stamp = {
    tree,
    commit: git(["rev-parse", "HEAD"], cwd),
    at: new Date().toISOString(),
    checks,
    // github#104
    ...(drove ? { chrome: drove } : {}),
    fixtures: ran.map((f) => ({ name: f.name, digest: f.digest, day: f.day, pinned: !!f.pinned })),
  };
  writeFileSync(file, JSON.stringify(stamp, null, 2) + "\n");
  return { wrote: file, tree };
}

export function describe(hit) {
  const s = hit.stamp;
  return `tree ${hit.tree.slice(0, 7)} passed the invariant suite at ${s.at} ` +
         `(${s.checks} checks, commit ${String(s.commit || "?").slice(0, 7)}, ` +
         // github#104
         `Chrome ${s.chrome || "unrecorded"}, ` +
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
  // github#104 -- a run captures its tree before it builds
  const pass = (opts) => record({ ...opts, started: startRun(opts.cwd) });
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
    // github#106 -- a seeded fixture is a usable one
    const seed = (name, digest, day, pinned) => {
      for (const d of (existsSync(store) ? readdirSync(store) : [])) {
        if (d.startsWith(name + "-")) rmSync(join(store, d), { recursive: true, force: true });
      }
      const dir = join(store, `${name}-${digest}`);
      mkdirSync(join(dir, ".obsidian"), { recursive: true });
      mkdirSync(join(dir, "notes"), { recursive: true });
      for (let i = 0; i < 3; i++) writeFileSync(join(dir, "notes", `n${i}.md`), `# n${i}\n`);
      writeFileSync(join(dir, ".stamp.json"),
                    JSON.stringify({ digest, day, notes: 3, args: pinned ? ["--end", "2026-08-28"] : [] }));
      return dir;
    };
    seed("demo-vault", "aaaaaaaa", today, false);
    seed("test-vault", "bbbbbbbb", "2026-08-28", true);
    seed("shape-vault", "cccccccc", today, false);
    // github#86
    seed("tag-vault", "dddddddd", "2026-09-09", true);

    expect("no stamp yet -> miss", !lookup("HEAD", repo).ok);
    const wrote = pass({ fixtures: currentFixtures(repo), checks: 3, cwd: repo });
    expect("a clean tree records a stamp", !!wrote.wrote);
    expect("the same commit hits", lookup("HEAD", repo).ok);

    sh(["commit", "-q", "--allow-empty", "-m", "same tree, new commit"]);
    expect("a new commit with the same tree hits", lookup("HEAD", repo).ok);
    sh(["checkout", "-q", "-b", "side", "HEAD~1"]);
    sh(["checkout", "-q", "main"]);
    sh(["merge", "-q", "--no-ff", "-m", "merge", "side"]);
    expect("a merge commit with the same tree hits", lookup("HEAD", repo).ok);

    // github#104 -- a run that captured nothing cannot say what it saw
    const blind = record({ fixtures: currentFixtures(repo), checks: 3, cwd: repo });
    expect("a run that captured no tree refuses to record",
           !blind.wrote && /did not capture the tree it built/.test(blind.why));

    // github#104 -- work landing mid-run stamped a tree nothing measured
    const built = startRun(repo);
    writeFileSync(join(repo, "a.txt"), "landed mid-run\n");
    sh(["commit", "-q", "-am", "work landing while the suite runs"]);
    const moved2 = record({ fixtures: currentFixtures(repo), checks: 3, started: built, cwd: repo });
    expect("a commit during the run refuses to record",
           !moved2.wrote && /HEAD moved while this run was measuring/.test(moved2.why));
    expect("and the tree it never measured stays unstamped", !lookup("HEAD", repo).ok);
    sh(["reset", "-q", "--hard", "HEAD~1"]);

    writeFileSync(join(repo, "a.txt"), "changed\n");
    const dirty = pass({ fixtures: currentFixtures(repo), checks: 3, cwd: repo });
    // github#104
    expect("a tree dirty when the run started refuses to record",
           !dirty.wrote && /differed from HEAD in 1 tracked file\(s\) when this run started/.test(dirty.why));
    const late = record({ fixtures: currentFixtures(repo), checks: 3, cwd: repo,
                          started: { tree: treeOf("HEAD", repo), dirty: [] } });
    expect("a tree dirty only at the end refuses to record",
           !late.wrote && /differs from HEAD/.test(late.why));
    expect("a dirty tree still hits for HEAD's own tree", lookup("HEAD", repo).ok);

    // github#104 -- the browser the run drove is part of what it measured
    let here = null;
    try { here = normaliseVersion(chromeVersion(findChrome())); } catch { here = null; }
    const chromeFile = lookup("HEAD", repo).file;
    const noChrome = readFileSync(chromeFile, "utf8");
    const withChrome = (v) =>
      writeFileSync(chromeFile, JSON.stringify({ ...JSON.parse(noChrome), chrome: v }));
    expect("a stamp that records no Chrome still hits", lookup("HEAD", repo).ok);
    withChrome("1.2.3.4");
    const elsewhere = lookup("HEAD", repo);
    expect(here ? "a stamp from a different Chrome misses" : "no Chrome here, so the version cannot block",
           here ? !elsewhere.ok && /drove Chrome 1\.2\.3\.4/.test(elsewhere.why) : elsewhere.ok);
    if (here) {
      withChrome(here);
      expect("a stamp from the Chrome on this machine hits", lookup("HEAD", repo).ok);
    }
    writeFileSync(chromeFile, noChrome);

    sh(["commit", "-q", "-am", "changed"]);
    const miss = lookup("HEAD", repo);
    expect("a changed tree misses", !miss.ok && /no stamp/.test(miss.why));
    expect("the earlier tree still hits by revision", lookup("HEAD~1", repo).ok);

    seed("demo-vault", "aaaaaaaa", "2026-01-01", false);
    const moved = lookup("HEAD~1", repo);
    expect("a regenerated fixture misses", !moved.ok && /not the one that passed/.test(moved.why));
    seed("demo-vault", "aaaaaaaa", today, false);
    expect("restoring the fixture hits again", lookup("HEAD~1", repo).ok);

    // github#106 -- a stamp is not proof the vault is usable
    const shapeDir = join(store, "shape-vault-cccccccc");
    expect("a usable fixture checks out", checkFixture(shapeDir).ok && checkFixture(shapeDir).notes === 3);
    rmSync(join(shapeDir, ".obsidian"), { recursive: true, force: true });
    const gone = lookup("HEAD~1", repo);
    expect("a fixture without .obsidian misses as corrupt", !gone.ok && /corrupt \(no \.obsidian/.test(gone.why));
    mkdirSync(join(shapeDir, ".obsidian"));
    expect("restoring .obsidian hits again", lookup("HEAD~1", repo).ok);
    unlinkSync(join(shapeDir, "notes", "n2.md"));
    const lost = lookup("HEAD~1", repo);
    expect("a fixture missing a note misses as corrupt",
           !lost.ok && /corrupt \(2 notes on disk, the stamp says 3\)/.test(lost.why));
    writeFileSync(join(shapeDir, "notes", "n2.md"), "# n2\n");
    expect("restoring the note hits again", lookup("HEAD~1", repo).ok);
    const bad = pass({ fixtures: currentFixtures(repo).map((f) => f.name === "shape-vault" ? { ...f, corrupt: "x" } : f),
                         checks: 3, cwd: repo });
    expect("a corrupt fixture refuses to record", !bad.wrote && /shape-vault is corrupt/.test(bad.why));
    const otherDir = seed("shape-vault", "dddddddd", today, false);
    rmSync(join(otherDir, ".obsidian"), { recursive: true, force: true });
    const other = lookup("HEAD~1", repo);
    expect("a corrupt fixture under another digest is 'not the one that passed'",
           !other.ok && /not the one that passed/.test(other.why));
    seed("shape-vault", "cccccccc", today, false);
    expect("the seeded fixture hits again", lookup("HEAD~1", repo).ok);
    process.env.VG_FIXTURE_STORE = join(base, "elsewhere");
    expect("VG_FIXTURE_STORE redirects the store", fixtureStore(repo) === join(base, "elsewhere") &&
           currentFixtures(repo).every((f) => f.digest === null));
    const scratch = pass({ fixtures: currentFixtures(repo), checks: 3, cwd: repo });
    expect("a scratch-store run refuses to record", !scratch.wrote && /VG_FIXTURE_STORE/.test(scratch.why));
    delete process.env.VG_FIXTURE_STORE;
    expect("and only while it is set", fixtureStore(repo) === store);

    const old = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
    seed("shape-vault", "cccccccc", old, false);
    sh(["checkout", "-q", "HEAD~1"]);
    pass({ fixtures: currentFixtures(repo), checks: 3, cwd: repo });
    const aged = lookup("HEAD", repo);
    expect("an aged unpinned fixture misses", !aged.ok && /would regenerate/.test(aged.why));
    seed("test-vault", "bbbbbbbb", "2026-08-28", true);
    seed("shape-vault", "cccccccc", today, false);
    pass({ fixtures: currentFixtures(repo), checks: 3, cwd: repo });
    expect("a pinned fixture never ages", lookup("HEAD", repo).ok);

    // github#103
    const two = pass({ fixtures: currentFixtures(repo).filter((f) => f.name !== "test-vault"),
                         checks: 3, cwd: repo });
    expect("a run missing a fixture refuses to record", !two.wrote && /test-vault did not run/.test(two.why));
    // github#86 -- the fourth fixture is required like the first three
    const three = pass({ fixtures: currentFixtures(repo).filter((f) => f.name !== "tag-vault"),
                           checks: 3, cwd: repo });
    expect("a run missing the tag vault refuses to record",
           !three.wrote && /tag-vault did not run/.test(three.why));
    const stampFile = lookup("HEAD", repo).file;
    const full = readFileSync(stampFile, "utf8");
    const cut = JSON.parse(full);
    cut.fixtures = cut.fixtures.filter((f) => f.name !== "test-vault");
    writeFileSync(stampFile, JSON.stringify(cut));
    const short = lookup("HEAD", repo);
    expect("a stamp naming two fixtures misses", !short.ok && /names no test-vault/.test(short.why));
    writeFileSync(stampFile, full);
    expect("the full stamp hits again", lookup("HEAD", repo).ok);

    // github#104 -- a flag that changes what is measured is not the suite
    const deltas = (o) => shapeDeltas({ ...defaultShape(), chrome: "", ...o });
    expect("the default shape has no delta", deltas({}).length === 0);
    expect("--jobs 1 is a delta, and takes the grid with it",
           deltas({ jobs: 1, grid: false }).length === 2 && /--jobs 1/.test(deltas({ jobs: 1, grid: false })[0]));
    expect("--no-grid is a delta on its own", deltas({ grid: false }).length === 1);
    expect("--headed is a delta", deltas({ headed: true }).some((d) => /--headed/.test(d)));
    expect("--port is a delta", deltas({ port: 9222 }).some((d) => /--port 9222/.test(d)));
    expect("a port that parsed to NaN is not a delta", deltas({ port: NaN }).length === 0);
    expect("--chrome elsewhere is a delta", deltas({ chrome: "C:/nowhere/chrome.exe" }).length === 1);
    const sameChrome = defaultShape().chrome;
    expect(sameChrome ? "--chrome naming the default Chrome is not a delta" : "no Chrome here to name",
           sameChrome ? deltas({ chrome: sameChrome }).length === 0 : true);

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
        console.log(`${s.tree.slice(0, 7)}  ${s.at}  commit ${String(s.commit || "?").slice(0, 7)}  ` +
                    `${s.checks} checks  Chrome ${s.chrome || "unrecorded"}`);
      } catch { console.log(`${f}  (unreadable)`); }
    }
    process.exit(0);
  }
  console.error("usage: node scripts/suite-stamp.mjs [check [<rev>] | list | --selftest]");
  process.exit(2);
}
