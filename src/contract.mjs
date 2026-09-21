// github#149, design/0020 -- the contract both producers owe the page, as data
// github#149 -- src/page.js's typedefs stay the readable original
// github#149 -- the gate fails when this and those typedefs disagree
// github#149 -- no imports: this is bundled into the plugin

/** @typedef {"string" | "number" | "boolean" | "string[]" | "dates" | "sortSpecs" | "node[]" | "edge[]" | "stats"} FieldType */
/** @typedef {{ type: FieldType, required: boolean, ghost?: "same" | "empty" }} Field */

// github#149, github#152, design/0020 -- VaultNode; `ghost` is the ghost value
/** @type {Record<string, Field>} */
export const NODE = {
  id:      { type: "string",   required: true,  ghost: "same"  },
  label:   { type: "string",   required: true,  ghost: "same"  },
  folder:  { type: "string",   required: true,  ghost: "same"  },
  dirs:    { type: "string[]", required: true,  ghost: "empty" },
  sub:     { type: "string",   required: true,  ghost: "empty" },
  type:    { type: "string",   required: true,  ghost: "same"  },
  tags:    { type: "string[]", required: true,  ghost: "empty" },
  created: { type: "string",   required: true,  ghost: "empty" },
  touched: { type: "string",   required: true,  ghost: "empty" },
  words:   { type: "number",   required: true,  ghost: "empty" },
  deg:     { type: "number",   required: true,  ghost: "same"  },
  ghost:   { type: "boolean",  required: false, ghost: "same"  },
};

// github#149 -- VaultEdge: an undirected index pair and a weight
/** @type {Record<string, Field>} */
export const EDGE = {
  s: { type: "number", required: true },
  t: { type: "number", required: true },
  w: { type: "number", required: true },
};

// github#149 -- VaultStats
/** @type {Record<string, Field>} */
export const STATS = {
  files:             { type: "number",  required: true },
  nodes:             { type: "number",  required: true },
  edges:             { type: "number",  required: true },
  unresolved:        { type: "number",  required: true },
  orphans:           { type: "number",  required: true },
  dates:             { type: "dates",   required: true },
  templatesExcluded: { type: "boolean", required: true },
  ghostsIncluded:    { type: "boolean", required: true },
};

// github#149 -- VaultData: the object mountVaultGraph is handed
/** @type {Record<string, Field>} */
export const DATA = {
  vault:       { type: "string",    required: true },
  generated:   { type: "string",    required: true },
  nodes:       { type: "node[]",    required: true },
  edges:       { type: "edge[]",    required: true },
  stats:       { type: "stats",     required: true },
  version:     { type: "string",    required: false },
  dev:         { type: "boolean",   required: false },
  sortSpecs:   { type: "sortSpecs", required: false },
  folderOrder: { type: "string",    required: false },
};

// github#149 -- the four buckets VaultStats.dates is keyed on
export const DATE_SOURCES = ["frontmatter", "filename", "stamp", "none"];

// github#149, design/0020 -- where the two hosts genuinely cannot agree
// github#149 -- the gate asserts each of these STILL happens, or it rots
/** @type {{ key: string, host: "exporter" | "plugin", kind: "extra-key" | "absent-key" | "field-value" | "deferred-value", why: string }[]} */
export const DIVERGENCES = [
  {
    key: "dev", host: "exporter", kind: "absent-key",
    why: "--dev marks a standalone build for the debug surface. The plugin has no such build: " +
         "its debug regions are stripped at bundle time by scripts/build-plugin.mjs, so there is " +
         "nothing for a flag to say.",
  },
  {
    key: "folderOrder", host: "exporter", kind: "absent-key",
    why: "github#71 -- --folder-order is a standalone flag read back off VAULT_DATA by " +
         "shell.html. In the plugin the same choice is a setting the host persists " +
         "(decisions/0009), so it reaches the page through MountDeps, not through the data.",
  },
  {
    key: "readWords", host: "plugin", kind: "extra-key",
    why: "The exporter counts words while it is already reading every file. Obsidian's cache " +
         "does not carry a word count, so reading one is the only I/O left in the plugin's " +
         "build -- it is deferred behind this callback and applied after the mount, which is " +
         "why plugin nodes carry words: 0 until it runs.",
  },
  {
    key: "_spike", host: "plugin", kind: "extra-key",
    why: "SPIKE.md's timings -- the per-phase milliseconds and what the adapter resolved -- " +
         "kept so the view can report them. The page never reads it.",
  },
  {
    key: "words", host: "plugin", kind: "deferred-value",
    why: "The deferred read above: every node is words: 0 until readWords() has been awaited, " +
         "and 0 for every node when the `words` setting is off. DEFERRED, not different -- the " +
         "TIMING is what diverges, so the gate asserts the zero state and then compares the " +
         "value like any other. Exempting it from the comparison is how github#149's own first " +
         "run missed a real word-count divergence on a note carrying a byte-order mark.",
  },
];

// github#141, github#149, design/0020 -- the one difference NOT in DIVERGENCES
// github#149 -- it moves which NODES exist, not which FIELDS they carry
export const ALIAS_DIVERGENCE =
  "aliases resolve in the exporter and not in Obsidian's cache -- github#141, and a node-set " +
  "difference rather than a shape one";

/** @param {unknown} v @param {FieldType} type @returns {boolean} */
function isType(v, type) {
  switch (type) {
    case "string":  return typeof v === "string";
    case "number":  return typeof v === "number" && Number.isFinite(v);
    case "boolean": return typeof v === "boolean";
    case "string[]": return Array.isArray(v) && v.every((x) => typeof x === "string");
    case "dates":
      return !!v && typeof v === "object" &&
        DATE_SOURCES.every((k) => typeof (/** @type {Record<string, unknown>} */ (v))[k] === "number");
    case "sortSpecs":
      return Array.isArray(v) && v.every((x) => !!x && typeof x === "object" &&
        typeof x.folder === "string" && typeof x.text === "string" && typeof x.origin === "string");
    case "node[]":
    case "edge[]":  return Array.isArray(v);
    case "stats":   return !!v && typeof v === "object";
    default:        return false;
  }
}

/** @param {FieldType} type @returns {unknown} */
function zero(type) {
  return type === "string" ? "" : type === "number" ? 0 : type === "boolean" ? false : [];
}

// github#149 -- every violation in one built result; [] is the pass
// github#149 -- `host` only permits that host's declared keys
/**
 * @param {unknown} data
 * @param {"exporter" | "plugin"} host
 * @returns {string[]}
 */
export function validate(data, host) {
  /** @type {string[]} */
  const bad = [];
  if (!data || typeof data !== "object") return ["the result is not an object"];
  const d = /** @type {Record<string, unknown>} */ (data);

  const allowedExtra = new Set(
    DIVERGENCES.filter((x) => x.host === host && x.kind === "extra-key").map((x) => x.key));
  const allowedAbsent = new Set(
    DIVERGENCES.filter((x) => x.host === host && x.kind === "absent-key").map((x) => x.key));

  for (const [name, f] of Object.entries(DATA)) {
    const has = name in d;
    if (!has) {
      if (f.required && !allowedAbsent.has(name)) bad.push(`data.${name} is required and missing`);
      continue;
    }
    if (!isType(d[name], f.type)) bad.push(`data.${name} should be ${f.type}, got ${describe(d[name])}`);
  }
  for (const name of Object.keys(d)) {
    if (name in DATA || allowedExtra.has(name)) continue;
    bad.push(`data.${name} is not in the contract and is not a declared ${host} extra`);
  }

  const stats = /** @type {Record<string, unknown>} */ (d.stats);
  if (stats && typeof stats === "object") {
    for (const [name, f] of Object.entries(STATS)) {
      if (!(name in stats)) { bad.push(`stats.${name} is required and missing`); continue; }
      if (!isType(stats[name], f.type)) bad.push(`stats.${name} should be ${f.type}, got ${describe(stats[name])}`);
    }
    for (const name of Object.keys(stats)) {
      if (!(name in STATS)) bad.push(`stats.${name} is not in the contract`);
    }
  }

  const nodes = Array.isArray(d.nodes) ? d.nodes : [];
  for (const n of nodes) {
    const at = "node " + (n && n.id ? String(n.id) : "(no id)");
    if (!n || typeof n !== "object") { bad.push(at + " is not an object"); continue; }
    for (const [name, f] of Object.entries(NODE)) {
      if (!(name in n)) { if (f.required) bad.push(`${at}: ${name} is required and missing`); continue; }
      if (!isType(n[name], f.type)) bad.push(`${at}: ${name} should be ${f.type}, got ${describe(n[name])}`);
    }
    for (const name of Object.keys(n)) {
      if (!(name in NODE)) bad.push(`${at}: ${name} is not in the contract`);
    }
    if (n && n.ghost === true) {
      for (const [name, f] of Object.entries(NODE)) {
        if (f.ghost !== "empty" || !(name in n)) continue;
        if (JSON.stringify(n[name]) !== JSON.stringify(zero(f.type))) {
          bad.push(`${at}: a ghost's ${name} should be the empty ${f.type}, got ${describe(n[name])}`);
        }
      }
    }
  }

  const edges = Array.isArray(d.edges) ? d.edges : [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!e || typeof e !== "object") { bad.push(`edge ${i} is not an object`); continue; }
    for (const [name, f] of Object.entries(EDGE)) {
      if (!(name in e)) { bad.push(`edge ${i}: ${name} is required and missing`); continue; }
      if (!isType(e[name], f.type)) bad.push(`edge ${i}: ${name} should be ${f.type}, got ${describe(e[name])}`);
    }
    for (const name of Object.keys(e)) {
      if (!(name in EDGE)) bad.push(`edge ${i}: ${name} is not in the contract`);
    }
    if (typeof e.s === "number" && (e.s < 0 || e.s >= nodes.length)) bad.push(`edge ${i}: s is not a node index`);
    if (typeof e.t === "number" && (e.t < 0 || e.t >= nodes.length)) bad.push(`edge ${i}: t is not a node index`);
    if (e.s === e.t) bad.push(`edge ${i}: a note is linked to itself`);
  }

  return bad;
}

// github#149, design/0020 -- the keys and their kinds, values thrown away
/**
 * @param {unknown} data
 * @returns {{ data: string[], stats: string[], node: string[], ghost: string[], edge: string[] }}
 */
export function shapeOf(data) {
  const d = /** @type {Record<string, unknown>} */ (data ?? {});
  const nodes = Array.isArray(d.nodes) ? d.nodes : [];
  /** @param {object} o @returns {string[]} */
  const keys = (o) => Object.keys(o ?? {}).map((k) => k + ":" + typeName(/** @type {Record<string, unknown>} */ (o)[k])).sort();
  /** @param {(n: Record<string, unknown>) => boolean} pick */
  const union = (pick) => {
    const seen = new Set();
    for (const n of nodes) if (n && pick(n)) for (const k of keys(n)) seen.add(k);
    return [...seen].sort();
  };
  return {
    data: keys(d),
    stats: keys(/** @type {object} */ (d.stats)),
    node: union((n) => n.ghost !== true),
    ghost: union((n) => n.ghost === true),
    edge: keys(Array.isArray(d.edges) && d.edges[0] ? d.edges[0] : {}),
  };
}

// github#149 -- coarse on purpose: every array is just "array"
// github#149 -- validate() is what checks a string[] is a string[]
/**
 * @param {unknown} v
 * @returns {string}
 */
function typeName(v) {
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  if (typeof v === "function") return "function";
  return typeof v;
}

/** @param {unknown} v @returns {string} */
function describe(v) {
  if (Array.isArray(v)) return "an array of " + v.length;
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "object") return "an object";
  return typeof v + " " + JSON.stringify(v);
}
