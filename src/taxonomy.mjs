// github#149, design/0020 -- the policy both producers apply, in one place
// github#149 -- no imports: this is bundled into the plugin
// github#149 -- every path argument arrives "/" separated

// github#141 -- src/links.mjs is importless and pure, so it keeps the rule above
import { ghostId, ghostLabel } from "./links.mjs";

// github#149, design/0020 -- a folder naming a period, not a subject
const MONTHISH = /^\d{4}(?:[-_ ]?(?:\d{2}|Q[1-4]|W\d{1,2}))?$/i;

/** @param {string} seg @returns {boolean} */
export function isMonthFolder(seg) {
  return MONTHISH.test(seg);
}

// github#149 -- frontmatter `type:` values naming one kind
// github#97, github#149 -- NULL PROTOTYPE: `type: constructor` read Object itself
/** @type {Record<string, string>} */
const TYPE_ALIAS = Object.assign(Object.create(null), {
  people: "person", person: "person",
  "zettel/permanent": "zettel", "zettel/fleeting": "zettel", "zettel/literature": "zettel",
});

// github#149 -- never a note, in either host
const SKIP_FILES = new Set(["claude.md", "readme.md", "license.md"]);

/**
 * @param {string} name  a basename with its extension
 * @returns {boolean}
 */
export function isSkippedFile(name) {
  return SKIP_FILES.has(String(name).toLowerCase());
}

/** @param {unknown} s @returns {string} */
const deNumber = (s) => String(s).replace(/^[\s\d._)-]+/, "").trim();

/** @param {unknown} s @returns {string} */
const slug = (s) => deNumber(s).toLowerCase().replace(/[\s_]+/g, "-");

/** @param {string} s @returns {string} */
const singular = (s) => s.replace(/ies$/, "y").replace(/([^aeious])s$/, "$1");

// github#149 -- a folder name as a type: "03 - Meetings" -> "meeting"
/**
 * @param {string} s
 * @returns {string}
 */
export function folderType(s) {
  return singular(slug(s));
}

// github#149 -- any separator to "/", no empty segments
/**
 * @param {unknown} s
 * @returns {string}
 */
export function normSlashes(s) {
  return String(s).split(/[\\/]/).filter(Boolean).join("/");
}

// github#149
/**
 * @param {string} rel
 * @param {string} dir
 * @returns {boolean}
 */
export function under(rel, dir) {
  return !!dir && (rel === dir || rel.startsWith(dir + "/"));
}

// github#149 -- the wedge a note belongs to: its first path segment
/**
 * @param {string} path  vault-relative, "/" separated
 * @returns {string}
 */
export function paraFolder(path) {
  const seg = String(path).split("/");
  return seg.length > 1 ? seg[0] : "(vault root)";
}

// github#149, design/0020 -- the named folders below the wedge
/**
 * @param {string} path  vault-relative, "/" separated
 * @param {boolean} flatMonths
 * @returns {string[]}
 */
export function paraDirs(path, flatMonths) {
  const seg = String(path).split("/").slice(1, -1);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < seg.length; i++) {
    if (isMonthFolder(seg[i])) {
      if (i === 0 && !flatMonths) out.push(seg[i]);
      break;
    }
    out.push(seg[i]);
  }
  return out;
}

// github#149, design/0020 -- fm, then the daily tag, then the folders
/**
 * @param {Record<string, unknown>} fm   the note's frontmatter, or {}
 * @param {string} path                  vault-relative, "/" separated
 * @param {string[]} tags                already through normalizeTags
 * @param {string} dailyDir              "" when the vault has no daily-notes folder
 * @param {(path: string) => boolean} isTemplate
 * @returns {string}
 */
export function inferType(fm, path, tags, dailyDir, isTemplate) {
  const raw = typeof fm.type === "string" ? fm.type.toLowerCase() : "";
  if (raw) return TYPE_ALIAS[raw] ?? raw;
  if (tags.indexOf("daily-note") >= 0) return "daily";
  if (under(path, dailyDir)) return "daily";
  if (isTemplate(path)) return "template";

  const dirs = String(path).split("/").slice(0, -1).filter(Boolean);
  const named = dirs.filter((d) => !isMonthFolder(d));
  const pick = named.length ? named[named.length - 1] : dirs[0];
  const type = pick ? folderType(pick) : "";
  return type || "note";
}

// github#149 -- `tags:` and `tag:`, list or string, # optional
/**
 * @param {Record<string, unknown>} fm
 * @returns {string[]}
 */
export function normalizeTags(fm) {
  /** @type {unknown[]} */
  const raw = [];
  return raw
    .concat(fm.tags || [], fm.tag || [])
    .flatMap((t) => String(t).split(/[,\s]+/))
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
}

// github#149 -- the note's body: the BOM and any frontmatter block removed
// github#149 -- the strip and the slice MUST be the same string, or a BOM note
// github#149 -- keeps one character of its own frontmatter (measured: +1 word)
/**
 * @param {string} raw
 * @returns {string}
 */
export function noteBody(raw) {
  const text = String(raw).replace(/^\uFEFF/, "");
  const m = /^---\r?\n[\s\S]*?\r?\n---/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

// github#149 -- the body's word count, frontmatter already removed
/**
 * @param {string} body
 * @returns {number}
 */
export function countWords(body) {
  return String(body).split(/\s+/).filter(Boolean).length;
}

// github#149, github#152, design/0020 -- one unresolved-link placeholder
/**
 * @param {string} dest  a canonical destination from src/links.mjs
 * @returns {{ id: string, label: string, folder: string, sub: string, dirs: string[], type: string, tags: string[], created: string, touched: string, words: number, ghost: true }}
 */
export function ghostNode(dest) {
  return {
    id: ghostId(dest), label: ghostLabel(dest), folder: "(unresolved)", sub: "", dirs: [],
    type: "ghost", tags: [], created: "", touched: "", words: 0, ghost: true,
  };
}

// github#149, design/0020 -- undirected edge weights, keyed on the pair
export function edgeBook() {
  /** @type {Map<string, number>} */
  const weight = new Map();
  return {
    /** @param {number} i @param {number} j @param {number} [w] */
    add(i, j, w) {
      if (i === j) return;
      const key = i < j ? i + " " + j : j + " " + i;
      weight.set(key, (weight.get(key) ?? 0) + (w ?? 1));
    },
    /** @returns {{ s: number, t: number, w: number }[]} */
    edges() {
      return Array.from(weight, (entry) => {
        const ab = entry[0].split(" ");
        return { s: Number(ab[0]), t: Number(ab[1]), w: entry[1] };
      });
    },
  };
}

// github#149
/**
 * @param {{ s: number, t: number }[]} edges
 * @param {number} count
 * @returns {number[]}
 */
export function degrees(edges, count) {
  const degree = /** @type {number[]} */ (new Array(count).fill(0));
  for (const e of edges) { degree[e.s]++; degree[e.t]++; }
  return degree;
}

// github#149 -- "YYYY-MM-DD HH:mm", local, as VaultData declares it
/**
 * @param {Date} [now]
 * @returns {string}
 */
export function generatedStamp(now) {
  const d = now ?? new Date(), p2 = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) +
         " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
}
