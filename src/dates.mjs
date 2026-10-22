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

/**
 * @param {Record<string, unknown>} fm   the note's frontmatter, or {}
 * @param {string} basename
 * @param {number | null | undefined} ctimeMs
 * @param {number | null | undefined} mtimeMs
 * @returns {{ day: string, source: DateSource }}
 */
export function resolveCreated(fm, basename, ctimeMs, mtimeMs) {
  const f = day10(fm && fm.created) || day10(fm && fm.date);
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
