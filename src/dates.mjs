// github#6
// github#156

/**
 * github#156 -- a union, not a string: VaultStats.dates is keyed on it
 * @typedef {"frontmatter" | "filename" | "stamp" | "none"} DateSource
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** @param {string} s @returns {boolean} */
export function isRealDay(s) {
  if (!ISO_DAY.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** @param {unknown} v @returns {string} "YYYY-MM-DD", or "" when it is not a real day */
export function day10(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return localDay(v.getTime());
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return isRealDay(s) ? s : "";
}

/** @param {number} ms @returns {string} */
export function localDay(ms) {
  const d = new Date(ms), p2 = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

const NAME_DAY = /^(\d{4}-\d{2}-\d{2})(?![\d-])/;

/** @param {unknown} basename @returns {string} */
export function nameDay(basename) {
  const m = NAME_DAY.exec(String(basename || ""));
  return m && isRealDay(m[1]) ? m[1] : "";
}

/** @param {number | null | undefined} ctimeMs @param {number | null | undefined} mtimeMs @returns {string} */
export function stampDay(ctimeMs, mtimeMs) {
  const c = Number(ctimeMs) || 0, m = Number(mtimeMs) || 0;
  const pick = c && m ? Math.min(c, m) : (c || m);
  return pick ? localDay(pick) : "";
}

// github#205
const LOOSE_DAY = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/;

/** @param {unknown} v @returns {string} "YYYY-MM-DD", or "" when it is not a real day */
export function frontmatterDay(v) {
  const strict = day10(v);
  if (strict || typeof v !== "string") return strict;
  const m = LOOSE_DAY.exec(v.trim().replace(/^\[\[|\]\]$/g, ""));
  if (!m) return "";
  const day = m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  return isRealDay(day) ? day : "";
}

// github#205
/** @param {string} key @returns {string} */
function keyForm(key) {
  return String(key).toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

export const DEFAULT_CREATED_KEYS = "created, date";
// github#205
const CREATED_VARIANTS = ["created at", "date created", "creation date", "created on", "createdat"];
const TOUCHED_KEYS = ["updated", "modified", "last modified", "last updated", "updated at",
  "modified at", "date modified", "date updated", "updated on", "modified on"];

/**
 * github#205 -- the first listed key the note carries as a real day
 * @param {Record<string, unknown>} fm
 * @param {string[]} keys   already in keyForm
 * @returns {string}
 */
function firstDay(fm, keys) {
  if (!fm || typeof fm !== "object") return "";
  /** @type {Map<string, unknown>} */
  const have = new Map();
  for (const k of Object.keys(fm)) { const f = keyForm(k); if (!have.has(f)) have.set(f, fm[k]); }
  for (const k of keys) {
    const day = have.has(k) ? frontmatterDay(have.get(k)) : "";
    if (day) return day;
  }
  return "";
}

/** @param {unknown} list a comma-separated setting, or nothing @returns {string[]} */
export function createdKeyList(list) {
  const named = String(list == null ? DEFAULT_CREATED_KEYS : list)
    .split(",").map(keyForm).filter(Boolean);
  return Array.from(new Set(named.concat(CREATED_VARIANTS)));
}

/**
 * github#205 -- a frontmatter updated/modified day, else the file's mtime
 * @param {Record<string, unknown>} fm
 * @param {number | null | undefined} mtimeMs
 * @returns {string}
 */
export function resolveTouched(fm, mtimeMs) {
  return firstDay(fm, TOUCHED_KEYS) || (mtimeMs ? localDay(mtimeMs) : "");
}

/**
 * @param {Record<string, unknown>} fm   the note's frontmatter, or {}
 * @param {string} basename
 * @param {number | null | undefined} ctimeMs
 * @param {number | null | undefined} mtimeMs
 * @param {string[]} [keys]   github#205 -- createdKeyList(); absent, the default pair and its variants
 * @returns {{ day: string, source: DateSource }}
 */
export function resolveCreated(fm, basename, ctimeMs, mtimeMs, keys) {
  const f = firstDay(fm, keys || createdKeyList());
  if (f) return { day: f, source: "frontmatter" };
  const n = nameDay(basename);
  if (n) return { day: n, source: "filename" };
  const s = stampDay(ctimeMs, mtimeMs);
  if (s) return { day: s, source: "stamp" };
  return { day: "", source: "none" };
}

/** @returns {Record<DateSource, number>} */
export function dateTally() {
  return { frontmatter: 0, filename: 0, stamp: 0, none: 0 };
}
