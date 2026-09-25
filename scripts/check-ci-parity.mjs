#!/usr/bin/env node
// github#147, github#154

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = ".githooks/pre-push";

// github#154 -- every workflow guarded, jobName null where none applies
const TARGETS = [
  { workflow: ".github/workflows/quality.yml", jobName: "quality gates" },
  { workflow: ".github/workflows/release.yml", jobName: null },
];

// github#147 -- the two markers that bound the hook's static block
const BLOCK_START = '-z "$gated_push"';
const BLOCK_END = '-n "$SKIP_SMOKE"';

// github#147 -- a hook gate CI genuinely cannot run, by normalised key
/** @type {string[]} */
const LOCAL_ONLY = [];

/**
 * github#147
 * @param {string} p
 * @returns {string}
 */
function read(p) {
  try {
    return readFileSync(join(ROOT, p), "utf8");
  } catch {
    console.error("check-ci-parity: FAIL");
    console.error(`  FAIL ${p} is missing -- both halves of the gate have to exist`);
    process.exit(1);
  }
}

/**
 * github#147
 * @param {string} cmd
 * @returns {string | null}
 */
function key(cmd) {
  if (/\bnpm\s+run\s+lint\b/.test(cmd)) return "npm run lint";
  const script = /scripts\/[\w.-]+\.mjs/.exec(cmd);
  if (!script) return null;
  const flags = (cmd.slice(script.index + script[0].length).match(/--[\w-]+/g) || []).sort();
  return [script[0], ...flags].join(" ");
}

/**
 * github#147
 * @param {string} hook
 * @returns {string[]}
 */
function hookGates(hook) {
  const lines = hook.split("\n");
  const from = lines.findIndex((l) => l.includes(BLOCK_START));
  const to = lines.findIndex((l) => l.includes(BLOCK_END));
  if (from < 0 || to < 0 || to <= from) {
    console.error("check-ci-parity: FAIL");
    console.error(`  FAIL could not find the static block in ${HOOK}`);
    console.error(`  FAIL expected a line with ${BLOCK_START} before one with ${BLOCK_END}`);
    console.error("  FAIL the markers moved or were renamed -- fix them here, do not delete this check");
    process.exit(1);
  }
  const found = [];
  // github#147 -- the refusal messages name scripts in prose
  let heredoc = null;
  for (const line of lines.slice(from, to)) {
    if (heredoc !== null) {
      if (line.trim() === heredoc) heredoc = null;
      continue;
    }
    if (!/^\s*#/.test(line)) {
      const k = key(line);
      if (k && !found.includes(k)) found.push(k);
    }
    const opens = /<<-?\s*'?([A-Za-z_]\w*)'?/.exec(line);
    if (opens) heredoc = opens[1];
  }
  if (heredoc !== null) {
    console.error("check-ci-parity: FAIL");
    console.error(`  FAIL an unterminated <<${heredoc} heredoc in ${HOOK}'s static block`);
    process.exit(1);
  }
  return found;
}

/**
 * github#147
 * @param {string} workflow
 * @returns {string[]}
 */
function workflowRuns(workflow) {
  const found = [];
  // github#147 -- only a run:, never a comment naming a script in prose
  let block = -1;
  const take = (cmd) => {
    const k = key(cmd);
    if (k && !found.includes(k)) found.push(k);
  };
  for (const line of workflow.split("\n")) {
    const indent = /^\s*/.exec(line)[0].length;
    if (block >= 0) {
      if (line.trim() && indent <= block) block = -1;
      else { take(line); continue; }
    }
    const run = /^\s*run:\s*(.*?)\s*$/.exec(line);
    if (!run) continue;
    if (/^[|>][-+]?\d*$/.test(run[1])) block = indent;
    else take(run[1]);
  }
  return found;
}

const hook = read(HOOK);
const gates = hookGates(hook);
const problems = [];

if (!gates.length) problems.push(`no gates found in ${HOOK}'s static block -- the parser or the hook changed shape`);

// github#154 -- checked against every target, not just one
for (const target of TARGETS) {
  const workflow = read(target.workflow);
  const runs = workflowRuns(workflow);
  for (const gate of gates) {
    if (LOCAL_ONLY.includes(gate)) continue;
    if (!runs.includes(gate)) problems.push(`${HOOK} runs \`${gate}\` and ${target.workflow} does not`);
  }
  if (target.jobName && !new RegExp(`^\\s*name:\\s*${target.jobName}\\s*$`, "m").test(workflow)) {
    problems.push(`${target.workflow} has no job named \`${target.jobName}\` -- that string is the required-status context`);
  }
}

if (problems.length) {
  console.error("check-ci-parity: FAIL");
  for (const p of problems) console.error("  FAIL " + p);
  console.error("");
  console.error("Add the missing step to the workflow named above, in the same order the hook runs");
  console.error("it. A gate that runs only in the hook is a gate no merge boundary can see, which is");
  console.error("the whole of github#147. If it genuinely cannot run on a runner, put its key in");
  console.error("LOCAL_ONLY in this file with the reason in .ai-context/invariants.md -- do not drop");
  console.error("it silently.");
  process.exit(1);
}

const names = TARGETS.map((t) => t.workflow).join(" and ");
console.log(`check-ci-parity: ok -- ${gates.length} static gates in ${HOOK}, all ${gates.length} run by ${names}`);
