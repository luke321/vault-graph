#!/usr/bin/env node
// github#102

import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const has = (n) => argv.includes("--" + n);

const GH = process.env.GH || "gh";
const DRY = has("dry-run");
const BRANCH = flag("branch", "develop");
const RANGE = flag("range", "");
const REPO = (flag("repo", "") || originRepo()).toLowerCase();

// github#102
const KEYWORD =
  /\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\b:?\s+(?:https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/|([\w.-]+\/[\w.-]+)#|#)(\d+)\b/gi;

function usage(code) {
  console.error("usage: node scripts/close-issues.mjs --range <before>..<after> [--repo owner/name] [--branch develop] [--dry-run]");
  process.exit(code);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function originRepo() {
  const url = git("remote", "get-url", "origin").trim();
  const m = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(url);
  if (!m) {
    console.error(`close-issues: cannot derive owner/name from origin (${url}); pass --repo`);
    process.exit(2);
  }
  return m[1];
}

function gh(args, input) {
  return execFileSync(GH, args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
}

function fail(msg) {
  console.error(`close-issues: ${msg}`);
  process.exit(1);
}

function commitsIn(range) {
  const m = /^([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})$/i.exec(range);
  if (!m) usage(2);
  const [, before, after] = m;
  if (/^0+$/.test(before)) fail(`before is the zero SHA (${before}): a new branch has no range to scan, nothing closed`);
  for (const sha of [before, after]) {
    try { git("cat-file", "-e", `${sha}^{commit}`); }
    catch { fail(`${sha} is not a commit this clone can see -- fetch the full history, nothing closed`); }
  }
  try { git("merge-base", "--is-ancestor", before, after); }
  catch { fail(`${before} is not an ancestor of ${after}: the branch was rewritten under this push, nothing closed`); }
  const raw = git("log", "--reverse", "--format=%H%x1f%B%x1e", `${before}..${after}`);
  return raw.split("\x1e").map((s) => s.replace(/^\n/, "")).filter(Boolean).map((rec) => {
    const [sha, body] = rec.split("\x1f");
    return { sha, short: sha.slice(0, 7), subject: body.split("\n")[0], body };
  });
}

function issuesNamed(commits) {
  const found = new Map();
  for (const c of commits) {
    for (const m of c.body.matchAll(KEYWORD)) {
      const repo = (m[1] || m[2] || REPO).toLowerCase();
      if (repo !== REPO) continue;
      const n = Number(m[3]);
      if (!found.has(n)) found.set(n, c);
    }
  }
  return found;
}

function lookup(n) {
  try {
    return JSON.parse(gh(["api", `repos/${REPO}/issues/${n}`]));
  } catch (e) {
    const text = String(e.stderr || e.message || "");
    if (/HTTP 404/.test(text)) return null;
    throw e;
  }
}

function close(n, c) {
  const body = `Closed by \`${c.short}\` on \`${BRANCH}\` — "${c.subject}". Not yet released: it ships with the next release, when \`${BRANCH}\` reaches \`main\`.`;
  gh(["api", `repos/${REPO}/issues/${n}/comments`, "--input", "-"], JSON.stringify({ body }));
  gh(["api", "-X", "PATCH", `repos/${REPO}/issues/${n}`, "--input", "-"], JSON.stringify({ state: "closed", state_reason: "completed" }));
}

function main() {
  if (!RANGE) usage(2);
  const commits = commitsIn(RANGE);
  const named = issuesNamed(commits);
  console.log(`close-issues: ${commits.length} commit(s) in ${RANGE} on ${REPO}, ${named.size} issue(s) named${DRY ? " (dry run)" : ""}`);
  let closed = 0, already = 0, skipped = 0, failed = 0;
  for (const [n, c] of [...named.entries()].sort((a, b) => a[0] - b[0])) {
    const where = `${c.short} "${c.subject}"`;
    let issue;
    try { issue = lookup(n); }
    catch (e) { failed++; console.error(`  #${n}: lookup failed -- ${String(e.stderr || e.message).trim()}`); continue; }
    if (!issue) { skipped++; console.log(`  #${n}: no such issue, skipped (${where})`); continue; }
    if (issue.pull_request) { skipped++; console.log(`  #${n}: is a pull request, skipped (${where})`); continue; }
    if (issue.state === "closed") { already++; console.log(`  #${n}: already closed, nothing to do (${where})`); continue; }
    if (DRY) { closed++; console.log(`  #${n}: would close -- "${issue.title}" (${where})`); continue; }
    try { close(n, c); closed++; console.log(`  #${n}: closed -- "${issue.title}" (${where})`); }
    catch (e) { failed++; console.error(`  #${n}: close failed -- ${String(e.stderr || e.message).trim()}`); }
  }
  console.log(`close-issues: ${DRY ? "would close" : "closed"} ${closed}, already closed ${already}, skipped ${skipped}, failed ${failed}`);
  if (failed) process.exit(1);
}

main();
