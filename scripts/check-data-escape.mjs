#!/usr/bin/env node
// github#96

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BUILD = join(ROOT, "src", "build-graph.mjs");

export const PAYLOAD = {
  type: "</script><script>window.__vg_escaped_type=1</script>",
  tag: "</script><script>window.__vg_escaped_tag=1</script>",
};
export const NOTE_COUNT = 3;

/** @param {string} dir @returns {string} the built page */
export function buildPayloadVault(dir) {
  mkdirSync(join(dir, ".obsidian"), { recursive: true });
  writeFileSync(join(dir, ".obsidian", "app.json"), "{}", "utf8");
  const notes = join(dir, "Notes");
  mkdirSync(notes, { recursive: true });
  writeFileSync(join(notes, "Plain.md"), "# Plain\n\nLinks to [[Marked]].\n", "utf8");
  writeFileSync(join(notes, "Marked.md"),
    `---\ntype: "${PAYLOAD.type}"\ntags: [${PAYLOAD.tag}]\n---\n# Marked\n\nBack to [[Plain]].\n`, "utf8");
  writeFileSync(join(notes, "Third.md"), "# Third\n\n[[Plain]] and [[Marked]].\n", "utf8");
  const out = join(dir, "vault-graph.html");
  const r = spawnSync(process.execPath, [BUILD, "--vault", dir, "--out", out],
                      { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) throw new Error(`build-graph.mjs exited ${r.status} for ${dir}`);
  return out;
}

/** @param {string} html @returns {{ name: string, text: string }[]} */
export function inlineDataScripts(html) {
  const out = [];
  const re = /<script>window\.([A-Z_]+)=([\s\S]*?);<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push({ name: m[1], text: m[2] });
  return out;
}

function main() {
  const problems = [];

  {
    const src = readFileSync(BUILD, "utf8");
    if (!/window\.VAULT_DATA=\$\{jsonForScript\(/.test(src)) {
      problems.push("src/build-graph.mjs no longer serialises window.VAULT_DATA through jsonForScript()");
    }
  }

  const dir = mkdtempSync(join(tmpdir(), "vg-escape-"));
  try {
    const html = readFileSync(buildPayloadVault(dir), "utf8");
    const scripts = inlineDataScripts(html);
    const data = scripts.find((s) => s.name === "VAULT_DATA");
    if (!data) {
      problems.push("no <script>window.VAULT_DATA=...;</script> element in the built page");
    } else {
      const lt = (data.text.match(/</g) || []).length;
      if (lt) problems.push(`the VAULT_DATA script carries ${lt} raw '<' -- a note can close it`);
      let parsed = null;
      try { parsed = JSON.parse(data.text); } catch (e) { problems.push(`VAULT_DATA is not JSON: ${e.message}`); }
      if (parsed) {
        const marked = (parsed.nodes || []).find((n) => n.label === "Marked");
        if ((parsed.nodes || []).length !== NOTE_COUNT) {
          problems.push(`expected ${NOTE_COUNT} notes in the data, got ${(parsed.nodes || []).length}`);
        }
        if (!marked) problems.push("the Marked note is missing from the data");
        else {
          if (marked.type !== PAYLOAD.type) problems.push(`type came back as ${JSON.stringify(marked.type)}`);
          if (!marked.tags.includes(PAYLOAD.tag)) problems.push(`tags came back as ${JSON.stringify(marked.tags)}`);
        }
      }
    }
    for (const s of scripts) {
      if (s.name === "VAULT_DATA") continue;
      const lt = (s.text.match(/</g) || []).length;
      if (lt) problems.push(`the ${s.name} script carries ${lt} raw '<'`);
    }
    if (!problems.length) {
      console.log(`check-data-escape: ok -- ${scripts.length} inline data scripts, 0 raw '<' in any, ` +
                  `${data.text.length} chars of VAULT_DATA decode to ${NOTE_COUNT} notes with both markers intact as text`);
    }
  } finally {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  if (problems.length) {
    console.error("check-data-escape: FAIL");
    for (const p of problems) console.error("  FAIL " + p);
    process.exit(1);
  }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main();
