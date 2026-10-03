// github#186
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "vg-mirror-fidelity-"));
const source = join(scratch, "source"), mirror = join(scratch, "mirror");
const write = (path, body) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); };
const config = (path, value) => write(join(source, ".obsidian", path), JSON.stringify(value));
const fixtures = {
  "General/Alpha.md": "---\ncreated: 2020-01-01\ntype: daily\ntags: [daily-note, project/alpha]\n---\n[Beta](Beta.md) [[Beta]] [[Elsewhere/Beta]] [[2020-02-03 Decision]]\n",
  "General/Beta.md": "---\ncreated: 2020-01-02\ntags: [project/beta]\naliases: [Alternate]\n---\n[[Undated]]\n",
  "Elsewhere/Beta.md": "---\ncreated: 2020-01-03\n---\n[[../General/Beta]] [[../Missing]]\n",
  "General/2020-02-03 Decision.md": "# Decision\n[[Beta]]\n",
  "General/Undated.md": "# Undated\n[[Alpha]] [[Alternate]] [[Missing/Alpha]]\n",
  "Hidden/Archive.md": "---\ncreated: 2019-01-01\n---\n[[General/Alpha]]\n",
  "_Private/Hidden.md": "---\ncreated: 2018-01-01\ntags: [_private/child]\n---\n[[General/Alpha]]\n",
  "People/Ada Lovelace/2020-03-01.md": "---\ntags:\n  - project/alpha\n---\n[[General/Alpha]]\n",
  "People/Directory.md": "---\ncreated: 2020-03-02\n---\n[[General/Alpha]]\n",
  "Templates/Template.md": "# Template\n[[General/Alpha]]\n",
};
for (const [name, body] of Object.entries(fixtures)) {
  const path = join(source, name); write(path, body);
  const stamp = new Date("2020-01-01T12:00:00Z"); utimesSync(path, stamp, stamp);
}
config("daily-notes.json", { folder: "People/Ada Lovelace" });
config("templates.json", { folder: "Templates" });
config("plugins/vault-graph/data.json", { folderShown: { Hidden: false, General: true },
  folderColors: { General: "g2" }, subfolderColors: { "People/Ada Lovelace": "g3" },
  tagShown: { project: false }, tagColors: { project: "g4" }, subtagColors: { "project/alpha": "g5" },
  pinned: ["General/Alpha.md"], fitCap: true, compactAxis: false, privateText: "DO-NOT-COPY" });
const run = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 4e6 });
  assert.equal(r.status, 0, r.stderr || r.stdout); return r;
};
run(["scripts/make-mirror-vault.mjs", "--vault", source, "--out", mirror]);
const data = (vault, label) => {
  const file = join(scratch, label + ".html");
  run(["src/build-graph.mjs", "--vault", vault, "--out", file, "--ghosts"]);
  const html = readFileSync(file, "utf8");
  return { html, data: JSON.parse(/window\.VAULT_DATA=(\{[^\n]*\});<\/script>/.exec(html)[1]) };
};
const a = data(source, "source"), b = data(mirror, "mirror");
for (const key of ["nodes", "edges", "unresolved", "orphans"]) assert.equal(b.data.stats[key], a.data.stats[key], key);
const signature = (n) => [n.folder, n.created, n.touched, n.type, n.deg, n.words, n.tags.map((t) => t.split("/").length).sort()].join("|");
assert.deepEqual(b.data.nodes.filter((n) => !n.ghost).map(signature).sort(), a.data.nodes.filter((n) => !n.ghost).map(signature).sort());
assert.deepEqual(b.data.edges.map((e) => e.w).sort(), a.data.edges.map((e) => e.w).sort());
const topology = (data) => {
  const keys = new Map(data.nodes.flatMap((n, i) => n.ghost ? [] : [[i, signature(n)]]));
  for (let i = 0; i < data.nodes.length; i++) {
    if (!data.nodes[i].ghost) continue;
    keys.set(i, "ghost:" + data.edges.filter((e) => e.s === i || e.t === i)
      .map((e) => [keys.get(e.s === i ? e.t : e.s), e.w].join(":")).sort().join(";"));
  }
  for (const e of data.edges) assert.ok(keys.has(e.s) && keys.has(e.t));
  return data.edges.map((e) => [keys.get(e.s), keys.get(e.t)].sort().join(" -> ") + ":" + e.w).sort();
};
assert.deepEqual(topology(b.data), topology(a.data));
const settings = JSON.parse(readFileSync(join(mirror, ".obsidian/plugins/vault-graph/data.json"), "utf8"));
assert.deepEqual(settings.folderShown, { Hidden: false, General: true });
assert.equal(settings.compactAxis, false); assert.equal(settings.fitCap, true);
assert.equal(settings.privateText, undefined);
assert.equal(Object.keys(settings.tagShown).length, 1); assert.equal(Object.values(settings.tagShown)[0], false);
assert.equal(settings.folderColors.General, "g2");
assert.equal(Object.values(settings.subfolderColors)[0], "g3");
assert.equal(Object.values(settings.tagColors)[0], "g4");
assert.equal(Object.values(settings.subtagColors)[0], "g5");
assert.equal(Object.keys(settings.subfolderColors)[0].includes("Ada Lovelace"), false);
assert.equal(existsSync(join(mirror, settings.pinned[0])), true);
assert.equal(JSON.parse(readFileSync(join(mirror, ".vault-graph-mirror.json"))).version, 1);
const embedded = JSON.parse(/window\.VAULT_SETTINGS=(\{[^\n]*\});<\/script>/.exec(b.html)[1]);
assert.deepEqual(embedded.folderShown, settings.folderShown);
assert.equal(b.html.includes("project/alpha"), false);
assert.equal(b.data.nodes.filter((n) => n.folder === "_Private").length, 1);
assert.equal(b.data.nodes.find((n) => n.folder === "_Private").tags[0].startsWith("_"), true);
const same = spawnSync(process.execPath, ["scripts/make-mirror-vault.mjs", "--vault", source, "--out", source], { cwd: ROOT, encoding: "utf8" });
assert.notEqual(same.status, 0);
const ancestor = spawnSync(process.execPath, ["scripts/make-mirror-vault.mjs", "--vault", source, "--out", scratch], { cwd: ROOT, encoding: "utf8" });
assert.notEqual(ancestor.status, 0); assert.equal(existsSync(join(source, "General/Alpha.md")), true);
const nested = spawnSync(process.execPath, ["scripts/make-mirror-vault.mjs", "--vault", source, "--out", join(source, "output")], { cwd: ROOT, encoding: "utf8" });
assert.notEqual(nested.status, 0); assert.equal(existsSync(join(source, "General/Alpha.md")), true);
console.log("mirror fidelity: graph, weighted links, dates, types, word counts, tag hierarchy, hidden defaults, settings and output safety passed");
console.log("fixture: " + scratch);
