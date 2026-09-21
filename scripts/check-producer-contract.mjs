#!/usr/bin/env node
// github#149, design/0020 -- both producers, one vault, one contract
// github#149 -- 1. this declaration against src/page.js's typedefs
// github#149 -- 2. each producer against the contract
// github#149 -- 3. the two outputs against each other
// github#149 -- 4. the fixture's own assertions on the shared policy
// github#141, github#149 -- NOT resolution; check-link-resolution owns it

import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ALIAS_DIVERGENCE, DATA, DATE_SOURCES, DIVERGENCES, NODE, STATS, shapeOf, validate }
  from "../src/contract.mjs";
import { dateTally } from "../src/dates.mjs";
import { buildData } from "../plugin/build-data.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

let failures = 0;
// github#149 -- what the "deferred-value" divergence claims, observed rather than asserted here
let sawDeferredZero = true;
/** @param {boolean} ok @param {string} name @param {string} [detail] */
function report(ok, name, detail) {
  if (!ok) failures++;
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + (!ok && detail ? "   (" + detail + ")" : ""));
}
/** @param {unknown} a @param {unknown} b @param {string} name */
function eq(a, b, name) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  report(ok, name, ok ? "" : "got " + JSON.stringify(a) + ", want " + JSON.stringify(b));
}

/* ------------------------------------------------------------- the fixture -- */
// github#149, design/0020 -- wide enough to exercise the shared policy

/** @type {Record<string, string>} */
const NOTES = {
  "01 - Projects/Alpha.md":
    "---\ntags: [red, blue]\n---\nlinks [[02 - Areas/Beta]] and [[Nowhere]]\n",
  "01 - Projects/2026-09/Sept.md": "# sept\nlinks [[Nowhere]]\n",
  "01 - Projects/Deep/Inner/Leaf.md": "# leaf\n",
  "01 - Projects/2026-09/Deeper/Buried.md": "# buried under a month folder\n",
  "README.md": "# never a note\n",
  // github#149 -- a BOM: the strip and the slice have to be the same string in BOTH hosts
  "04 - Notes/Bom.md": "\uFEFF---\ntags: [x]\n---\nthe body here has six real words\n",
  // github#97, github#149 -- `constructor` is already lowercase, so it reaches the alias map
  "04 - Notes/Proto.md": "---\ntype: constructor\n---\n# a type named after a prototype member\n",
  "02 - Areas/Beta.md": "---\ntype: people\ntag: green\n---\n# beta\n",
  "03 - Dailies/2026-09-20.md": "# a day\n",
  "Templates/Tpl.md": "# a template\n",
  "Root.md": "# at the vault root, two words over\n",
};

// github#149 -- what Obsidian's cache says, stated not derived
const RESOLVED = {
  "01 - Projects/Alpha.md": { "02 - Areas/Beta.md": 1 },
};
const UNRESOLVED = {
  "01 - Projects/Alpha.md": { "Nowhere": 1 },
  "01 - Projects/2026-09/Sept.md": { "Nowhere": 1 },
};

const CONFIG = {
  "templates.json": { folder: "Templates" },
  "daily-notes.json": { folder: "03 - Dailies" },
};

// github#149 -- pinned: `created` is a comparison, not a clock race
const STAMP = new Date(2026, 8, 20, 12, 0, 0);

// github#149 -- both hosts are handed a version
const FIXTURE_VERSION = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version;

/** @param {string} dir */
function makeVault(dir) {
  mkdirSync(join(dir, ".obsidian"), { recursive: true });
  writeFileSync(join(dir, ".obsidian", "app.json"), "{}", "utf8");
  for (const [name, body] of Object.entries(CONFIG)) {
    writeFileSync(join(dir, ".obsidian", name), JSON.stringify(body), "utf8");
  }
  for (const [rel, text] of Object.entries(NOTES)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text, "utf8");
    utimesSync(abs, STAMP, STAMP);
  }
}

/* ------------------------------------------------------------- the two runs -- */

/** @param {string} vault @param {string} out @param {string[]} extra @returns {Record<string, unknown>} */
function runExporter(vault, out, extra) {
  const r = spawnSync(process.execPath,
                      [join(ROOT, "src", "build-graph.mjs"), "--vault", vault, "--out", out, ...extra],
                      { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) throw new Error("build-graph.mjs exited " + r.status);
  const m = /window\.VAULT_DATA=(\{[\s\S]*?\});<\/script>/.exec(readFileSync(out, "utf8"));
  if (!m) throw new Error("no window.VAULT_DATA in " + out);
  return JSON.parse(m[1]);
}

// github#149 -- the plugin producer, with its deferred word read applied
/**
 * @param {string} vault
 * @param {boolean} flatMonths
 * @returns {Promise<Record<string, unknown>>}
 */
async function runPlugin(vault, flatMonths) {
  const out = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (
    await buildData(fakeHost(vault), { ghosts: true, templates: false, flatMonths, words: true },
                    FIXTURE_VERSION)));
  const nodes = /** @type {Record<string, unknown>[]} */ (out.nodes);
  if (!nodes.every((n) => n.words === 0)) sawDeferredZero = false;
  await /** @type {(apply: (i: number, w: number) => void) => Promise<number>} */ (out.readWords)(
    (i, w) => { nodes[i].words = w; });
  return out;
}

// github#149, design/0020 -- the smallest Obsidian the adapter can run on
// github#149 -- a fake of the HOST; the producer is the real buildData
/** @param {string} vault */
function fakeHost(vault) {
  const paths = Object.keys(NOTES).sort();
  const files = paths.map((path) => {
    const seg = path.split("/");
    const name = seg[seg.length - 1];
    const dir = seg.slice(0, -1).join("/");
    const abs = join(vault, path);
    const raw = readFileSync(abs, "utf8");
    // github#149 -- the SAME numbers the exporter will stat
    const st = statSync(abs);
    return {
      path, name, basename: name.replace(/\.md$/, ""), extension: "md",
      parent: { path: dir || "/" },
      stat: { ctime: st.ctimeMs, mtime: st.mtimeMs, size: st.size },
      _raw: raw,
    };
  });
  /** @param {string} raw @returns {Record<string, unknown>} */
  const frontmatter = (raw) => {
    // github#149 -- Obsidian strips the BOM before parsing its own frontmatter; a fake host
    // that does not reports a tag difference the two real hosts do not have
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(raw).replace(/^\uFEFF/, ""));
    if (!m) return {};
    /** @type {Record<string, unknown>} */
    const fm = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
      if (!kv) continue;
      const v = kv[2].trim();
      fm[kv[1]] = v.startsWith("[") && v.endsWith("]")
        ? v.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean)
        : v;
    }
    return fm;
  };

  const app = {
    vault: {
      configDir: ".obsidian",
      getName: () => vault.split(/[\\/]/).filter(Boolean).pop(),
      getMarkdownFiles: () => files.slice(),
      getFileByPath: (/** @type {string} */ p) => files.find((f) => f.path === p) || null,
      cachedRead: async (/** @type {{ _raw: string }} */ f) => f._raw,
      adapter: {
        exists: async (/** @type {string} */ p) =>
          Object.keys(CONFIG).some((n) => p === ".obsidian/" + n),
        read: async (/** @type {string} */ p) =>
          JSON.stringify(CONFIG[/** @type {keyof typeof CONFIG} */ (p.replace(".obsidian/", ""))]),
      },
    },
    metadataCache: {
      getFileCache: (/** @type {{ _raw: string }} */ f) => ({ frontmatter: frontmatter(f._raw) }),
      resolvedLinks: RESOLVED,
      unresolvedLinks: UNRESOLVED,
    },
  };
  // github#149 -- obsidian's own, near enough for ASCII fixture paths
  const normalizePath = (/** @type {string} */ p) =>
    p.replace(/[\\/]+/g, "/").replace(/^\/+|\/+$/g, "").normalize("NFC") || "/";
  return { app: /** @type {never} */ (app), normalizePath };
}

/* ------------------------------------------- the declaration against the doc -- */

console.log("check-producer-contract: src/contract.mjs against src/page.js typedefs");
{
  const pageSrc = readFileSync(join(ROOT, "src", "page.js"), "utf8");
  // github#149, design/0020 -- braces are MATCHED, not skipped to the first }
  // github#149 -- dates and sortSpecs carry object types; a lazy regex eats them
  /**
   * @param {string} name
   * @returns {{ required: string[], optional: string[] }}
   */
  const typedefFields = (name) => {
    const m = new RegExp("@typedef \\{Object\\} " + name + "([\\s\\S]*?)\\*/").exec(pageSrc);
    if (!m) throw new Error(name + " typedef not found in src/page.js");
    const required = [], optional = [];
    const text = m[1];
    for (let i = text.indexOf("@property"); i >= 0; i = text.indexOf("@property", i + 1)) {
      let at = text.indexOf("{", i);
      if (at < 0) continue;
      let depth = 0;
      for (; at < text.length; at++) {
        if (text[at] === "{") depth++;
        else if (text[at] === "}" && --depth === 0) break;
      }
      const rest = /^\s*(\[?[A-Za-z_$][\w$]*\]?)/.exec(text.slice(at + 1).replace(/^\[\]/, ""));
      if (!rest) continue;
      const raw = rest[1];
      (raw.startsWith("[") ? optional : required).push(raw.replace(/^\[|\]$/g, ""));
    }
    return { required: required.sort(), optional: optional.sort() };
  };
  /** @param {Record<string, { required: boolean }>} table */
  const declared = (table) => ({
    required: Object.entries(table).filter(([, f]) => f.required).map(([k]) => k).sort(),
    optional: Object.entries(table).filter(([, f]) => !f.required).map(([k]) => k).sort(),
  });
  for (const [name, table] of [["VaultNode", NODE], ["VaultStats", STATS], ["VaultData", DATA]]) {
    eq(declared(/** @type {Record<string, { required: boolean }>} */ (table)), typedefFields(String(name)),
       name + " in src/contract.mjs matches its typedef in src/page.js");
  }
  // github#149 -- src/dates.mjs is where those four buckets are actually produced, so the
  // contract's copy of them is checked against it rather than against a second hand-written list
  eq(DATE_SOURCES.slice().sort(), Object.keys(dateTally()).sort(),
     "DATE_SOURCES matches the tally src/dates.mjs builds");
}

/* --------------------------------------------------------------- the two runs -- */

const work = mkdtempSync(join(tmpdir(), "vg-contract-"));
try {
  const vault = join(work, "fixture");
  makeVault(vault);

  // github#149 -- --folder-order is what makes that divergence observable
  const exporter = runExporter(vault, join(work, "exporter.html"), ["--ghosts", "--folder-order", "name"]);
  const plugin = await runPlugin(vault, false);

  // github#149, design/0020 -- the one shared rule with a parameter, both ways
  const exporterFlat = runExporter(vault, join(work, "flat.html"), ["--ghosts", "--flat-months"]);
  const pluginFlat = await runPlugin(vault, true);

  console.log("check-producer-contract: each producer against the contract");
  eq(validate(exporter, "exporter"), [], "the exporter satisfies the contract");
  eq(validate(plugin, "plugin"), [], "the plugin adapter satisfies the contract");

  console.log("check-producer-contract: the two shapes against each other");
  {
    const a = shapeOf(exporter), b = shapeOf(plugin);
    const extra = new Set(DIVERGENCES.filter((x) => x.kind === "extra-key").map((x) => x.key));
    const absent = new Set(DIVERGENCES.filter((x) => x.kind === "absent-key").map((x) => x.key));
    const undeclared = (/** @type {string[]} */ keys) =>
      keys.filter((k) => !extra.has(k.split(":")[0]) && !absent.has(k.split(":")[0]));
    eq(undeclared(a.data.filter((k) => !b.data.includes(k))), [],
       "no top-level key the exporter emits is missing from the plugin undeclared");
    eq(undeclared(b.data.filter((k) => !a.data.includes(k))), [],
       "no top-level key the plugin emits is missing from the exporter undeclared");
    eq(a.stats, b.stats, "stats carries the same keys with the same kinds in both");
    eq(a.node, b.node, "a real note carries the same keys with the same kinds in both");
    eq(a.ghost, b.ghost, "a ghost carries the same keys with the same kinds in both");
    eq(a.edge, b.edge, "an edge carries the same keys with the same kinds in both");
  }

  console.log("check-producer-contract: the two values against each other");
  compareValues(exporter, plugin, "");
  compareValues(exporterFlat, pluginFlat, " (--flat-months)");
  /**
   * @param {Record<string, unknown>} exporter @param {Record<string, unknown>} plugin
   * @param {string} note
   */
  function compareValues(exporter, plugin, note) {
    // github#149 -- only a PERMANENTLY different field is exempt; a deferred one is compared
    const skip = new Set(DIVERGENCES.filter((x) => x.kind === "field-value").map((x) => x.key));
    /** @param {Record<string, unknown>} d */
    const byId = (d) => Object.fromEntries(
      /** @type {Record<string, unknown>[]} */ (d.nodes).map((n) => [String(n.id), n]));
    const ex = byId(exporter), pl = byId(plugin);
    eq(Object.keys(ex).sort(), Object.keys(pl).sort(), "both producers emit the same node ids" + note);
    /** @type {string[]} */
    const diffs = [];
    for (const id of Object.keys(ex)) {
      if (!pl[id]) continue;
      for (const field of Object.keys(NODE)) {
        if (skip.has(field)) continue;
        const a = JSON.stringify(ex[id][field]), b = JSON.stringify(pl[id][field]);
        if (a !== b) diffs.push(`${id}.${field}: exporter ${a}, plugin ${b}`);
      }
    }
    eq(diffs, [], "every contract field agrees, node for node" + note);
    for (const key of Object.keys(STATS)) {
      const a = /** @type {Record<string, unknown>} */ (exporter.stats)[key];
      const b = /** @type {Record<string, unknown>} */ (plugin.stats)[key];
      eq(a, b, "stats." + key + " agrees" + note);
    }
    eq(exporter.version, plugin.version, "both producers report the same version" + note);
  }

  console.log("check-producer-contract: the policy both producers now share, on this fixture");
  {
    const ex = Object.fromEntries(
      /** @type {Record<string, unknown>[]} */ (exporter.nodes).map((n) => [String(n.id), n]));
    const flat = Object.fromEntries(
      /** @type {Record<string, unknown>[]} */ (exporterFlat.nodes).map((n) => [String(n.id), n]));

    // github#149, design/0020 -- these catch a change to the RULE itself
    eq(ex["01 - Projects/2026-09/Sept.md"].sub, "2026-09", "a month folder under the wedge stays a sub");
    eq(ex["01 - Projects/2026-09/Sept.md"].type, "project", "a month folder never names the type");
    eq(ex["01 - Projects/2026-09/Deeper/Buried.md"].dirs, ["2026-09"],
       "a month folder ends the walk: what is below it is not a sub of its own");
    eq(flat["01 - Projects/2026-09/Sept.md"].dirs, [],
       "--flat-months drops the month folder rather than keeping it as a sub");
    eq(flat["01 - Projects/2026-09/Deeper/Buried.md"].dirs, [],
       "--flat-months ends the walk at the month folder too");

    eq(ex["01 - Projects/Deep/Inner/Leaf.md"].dirs, ["Deep", "Inner"], "named folders below the wedge are kept");
    eq(ex["01 - Projects/Deep/Inner/Leaf.md"].type, "inner", "the nearest named folder names the type");
    eq(ex["02 - Areas/Beta.md"].type, "person", "frontmatter type goes through the alias table");
    eq(ex["02 - Areas/Beta.md"].tags, ["green"], "a singular `tag:` key counts as tags");
    eq(ex["01 - Projects/Alpha.md"].tags, ["red", "blue"], "a `tags:` list is normalised in order");
    eq(ex["03 - Dailies/2026-09-20.md"].type, "daily", "the daily-notes folder names the type");
    eq(ex["Root.md"].folder, "(vault root)", "a note at the vault root has no wedge");
    eq(ex["Root.md"].words, 8, "the body is counted, and only the body");
    eq(ex["Templates/Tpl.md"], undefined, "a template is excluded when templates are off");
    eq(ex["README.md"], undefined, "a README is never a note, in either host");
    eq(ex["ghost:Nowhere"].deg, 2, "two sources reaching one destination make one ghost of degree 2");

    // github#149 -- both found by review, both a difference the two hosts could carry silently
    eq(ex["04 - Notes/Bom.md"].words, 7,
       "a byte-order mark is stripped before the frontmatter is sliced, not after");
    eq(typeof ex["04 - Notes/Proto.md"].type, "string",
       "github#97 -- a `type:` naming an Object.prototype member stays a string");
    eq(ex["04 - Notes/Proto.md"].type, "constructor",
       "and it is the name that was written, not what the prototype holds under it");
  }

  console.log("check-producer-contract: every declared divergence still happens (github#149)");
  console.log("  note  not measured here: " + ALIAS_DIVERGENCE);
  for (const d of DIVERGENCES) {
    const from = d.host === "exporter" ? exporter : plugin;
    const other = d.host === "exporter" ? plugin : exporter;
    if (d.kind === "extra-key") {
      report(d.key in from && !(d.key in other),
             `${d.host} still carries the extra key ${d.key}`,
             d.key in from ? "the other producer also has it now" : "it is gone");
    } else if (d.kind === "absent-key") {
      report(d.key in from && !(d.key in other),
             `${d.key} is still the ${d.host}'s alone`,
             d.key in from ? "both producers emit it now" : "the " + d.host + " stopped emitting it");
    } else if (d.kind === "deferred-value") {
      report(sawDeferredZero, `${d.key} is still 0 on every plugin node before readWords()`,
             "it is no longer deferred -- the declaration is stale");
    } else {
      report(JSON.stringify(from[d.key]) !== JSON.stringify(other[d.key]),
             `${d.key} still differs between the two hosts`, "the two agree now");
    }
  }

  console.log("check-producer-contract: a shape change in ONE producer fails (the acceptance test)");
  {
    /** @param {(d: Record<string, unknown>) => Record<string, unknown>} mutate @param {string} what */
    const caught = (mutate, what) => {
      const copy = mutate(JSON.parse(JSON.stringify(exporter)));
      const bad = validate(copy, "exporter").length > 0 ||
                  JSON.stringify(shapeOf(copy)) !== JSON.stringify(shapeOf(exporter));
      report(bad, "caught: " + what);
    };
    caught((d) => { delete /** @type {Record<string, unknown>[]} */ (d.nodes)[0].dirs; return d; },
           "a node loses a required field");
    caught((d) => { /** @type {Record<string, unknown>[]} */ (d.nodes)[0].colour = "red"; return d; },
           "a node grows a field the contract does not name");
    caught((d) => { /** @type {Record<string, unknown>[]} */ (d.nodes)[0].words = "12"; return d; },
           "a field changes type");
    caught((d) => { delete /** @type {Record<string, unknown>} */ (d.stats).orphans; return d; },
           "stats loses a field");
    caught((d) => {
      const g = /** @type {Record<string, unknown>[]} */ (d.nodes).find((n) => n.ghost === true);
      if (g) g.touched = "2026-09-20";
      return d;
    }, "a ghost starts carrying a value where the contract says empty");
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log("check-producer-contract: " + (failures ? failures + " failure(s)" : "all checks passed"));
process.exit(failures ? 1 : 0);
