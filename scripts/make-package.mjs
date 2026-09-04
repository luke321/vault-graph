// Build the release package: dist/vault-graph-<version>.zip
//
//   node scripts/make-package.mjs v1.3.0
//   node scripts/make-package.mjs            # reads the newest tag
//
// WHY NOT GitHub's auto-generated source archive: it ships everything, including
// `.ai-context/` (a few thousand lines of design records aimed at whoever maintains this)
// and the dev tooling. Someone who wants to *run* the thing needs four directories and
// three files. See .ai-context/releasing.md.
//
// WHAT IT MUST NEVER CONTAIN: a built `vault-graph.html`. That file embeds the note titles
// and folder structure of whichever vault produced it, so shipping one would publish
// somebody's vault. The check at the bottom fails the build rather than trusting the
// include list to stay correct.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, cpSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();

const version = process.argv[2] || (() => {
  // Newest tag by version order, not by date -- tags made minutes apart sort wrong by date.
  const tags = git("tag", "-l", "--sort=-v:refname").split("\n").filter(Boolean);
  if (!tags.length) throw new Error("no tags; pass a version explicitly");
  return tags[0];
})();

// Runtime only. Everything a person needs to build a graph, and nothing aimed at whoever
// maintains this. package.json and the lockfile are in because the exporter bundles the
// engine with esbuild (github#58): `npm ci` once, then build-graph.mjs runs as before.
const INCLUDE = [
  ["src", "dir"], ["scripts", "dir"], ["assets", "dir"],
  ["package.json", "file"], ["package-lock.json", "file"],
  ["README.md", "file"], ["LICENSE", "file"], ["CHANGELOG.md", "file"]
];

// Tracked, but not part of what someone needs to RUN this. An in-flight experiment is
// still an experiment when it happens to be committed: shipping its scripts in a release
// invites bug reports about something nobody finished. Keep this list short and delete
// entries as the work either lands properly or goes away.
const EXCLUDE = [
  /^plugin\//,                    // Obsidian-plugin spike, in progress
  /^scripts\/install-spike\./,
  /^scripts\/spike-check\./
];

const dist = join(ROOT, "dist");
const stage = join(dist, `vault-graph-${version}`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// Only files git TRACKS. Copying the directories wholesale packages the working tree,
// which on the first run swept up another session's untracked work-in-progress
// (`install-spike.ps1`, `spike-check.mjs`) into a release artefact. A release must be
// reproducible from the tag, so the tracked set is the only honest source -- and it also
// means a stray local file, or a secret someone dropped in `scripts/`, cannot ship.
const tracked = git("ls-files").split("\n").filter(Boolean);
const wanted = new Set(INCLUDE.filter(([, k]) => k === "file").map(([n]) => n));
const dirs = INCLUDE.filter(([, k]) => k === "dir").map(([n]) => n + "/");

let copied = 0;
for (const rel of tracked) {
  const keep = wanted.has(rel) || dirs.some((d) => rel.startsWith(d));
  if (!keep) continue;
  if (rel.startsWith("assets/source/")) continue;      // the art the logo was derived from
  if (EXCLUDE.some((re) => re.test(rel))) continue;
  const to = join(stage, rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(ROOT, rel), to);
  copied++;
}
if (!copied) throw new Error("nothing matched the include list -- is this a git checkout?");

// assets/source/ is the art the logo mask was derived from -- not needed to run, and it is
// the biggest thing in assets after the demo gif.
rmSync(join(stage, "assets", "source"), { recursive: true, force: true });

writeFileSync(join(stage, "VERSION"), version + "\n");

/* ------------------------------------------------------------ safety check */

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const files = walk(stage);
// A BUILT graph must never ship: it embeds the note titles and folder structure of
// whichever vault produced it. Matched on the BASENAME -- an earlier version tested the
// whole path and flagged `make-test-vault.mjs` for merely containing the words.
const leaked = files.filter((f) => f.split(sep).pop() === "vault-graph.html");
if (leaked.length) {
  throw new Error("refusing to package a built graph (it embeds a real vault):\n  " +
                  leaked.map((f) => relative(ROOT, f)).join("\n  "));
}

/* ------------------------------------------------------------------- zip */

// bsdtar on Windows (shipped since Windows 10 1803), `zip` elsewhere. No npm dependency.
//
// NOT Compress-Archive: PowerShell 5.1 writes BACKSLASHES as the entry separator, which the
// zip spec forbids. Windows tolerates it, so the v1.4.0 package looked correct and would
// have extracted on macOS or Linux as a handful of files literally named
// "vault-graph-v1.4.0(backslash)src(backslash)build-graph.mjs" -- a broken download for
// exactly the people a release page exists to serve. The entry names are read back below.
const zip = join(dist, `vault-graph-${version}.zip`);
rmSync(zip, { force: true });
if (process.platform === "win32") {
  try {
    // RELATIVE name, with cwd set: bsdtar reads "C:/..." as a remote host:path spec and
    // fails with "Cannot connect to C: resolve failed", which reads like a network error
    // and is an absolute Windows path.
    execFileSync("tar.exe", ["-a", "-c", "-f", `vault-graph-${version}.zip`,
                             `vault-graph-${version}`],
                 { cwd: dist, stdio: "inherit" });
  } catch (e) {
    throw new Error("tar.exe could not build the package (" + e.message + "). " +
      "Compress-Archive is NOT a substitute: it writes backslash separators that " +
      "break extraction off Windows. Install a zip tool, or package elsewhere.");
  }
} else {
  execFileSync("zip", ["-qr", zip, `vault-graph-${version}`], { cwd: dist, stdio: "inherit" });
}

// The separator is CHECKED, not assumed: this is the defect that shipped in v1.4.0, and it
// is invisible from Windows, where both separators extract identically.
const BACKSLASH = String.fromCharCode(92);
const listed = process.platform === "win32"
  ? execFileSync("tar.exe", ["-tf", `vault-graph-${version}.zip`], { cwd: dist, encoding: "utf8" })
  : execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" });
const bad = listed.split(String.fromCharCode(10)).filter((n) => n.includes(BACKSLASH));
if (bad.length) {
  throw new Error("this archive uses backslash separators, which breaks extraction " +
                  "off Windows: " + bad.slice(0, 3).join(", "));
}

const kb = Math.round(statSync(zip).size / 1024);
console.log(`\npackaged ${files.length} files -> ${relative(ROOT, zip)} (${kb} KB)`);
console.log("contents:");
for (const [name] of INCLUDE) console.log("  " + name);
console.log("\nattach it with:");
console.log(`  gh release create ${version} "${relative(ROOT, zip)}" --title "${version}" --notes-file <notes>`);
