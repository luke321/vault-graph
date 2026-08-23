/**
 * dates.mjs -- when was a note written?
 *
 * WHY THIS IS SHARED. The answer is derived twice, once per mount: src/build-graph.mjs
 * crawls the filesystem, plugin/main.js asks Obsidian's metadata cache. Both used to carry
 * their own copy of `day10` and both had the same gap -- frontmatter or nothing -- so a
 * vault that does not write a `created:` field got a timeline with almost everything piled
 * into "undated" and a heatmap with nothing in it (github#6, 118 undated notes).
 *
 * Fixing that in two places is how it comes back in one of them. The two crawls stay
 * separate on purpose; the DATE RULE is one function, called with primitives, so neither
 * mount can drift from the other.
 *
 * THE ORDER IS DELIBERATE, most-stated to least:
 *
 *   1. frontmatter `created`, then `date`   what the note says about itself
 *   2. a date at the front of the filename  `2026-08-23.md`, `2026-08-23 Kickoff.md`
 *   3. the file's creation stamp            what the filesystem remembers
 *
 * Frontmatter first even though it is sometimes the *worst* answer -- a vault that
 * pre-creates daily notes from a calendar stamps them all with their import date, so
 * `2026-08-21.md` can carry `created: 2026-08-17`. That is still a deliberate statement by
 * whoever set the template up, and silently outranking it would make the graph disagree
 * with the note. The filename is the next most deliberate thing; the stamp is the only one
 * nobody chose.
 */

// Shape only. Kept separate from the calendar check below because the shape test is what
// rejects the thing that started all this: an unrendered Templater placeholder
// (`created: {{date:YYYY-MM-DD}}`) slices to "{{date:YYY", which is not a date but SORTS
// as one -- after every digit, so those notes ranked as the newest in the vault and grew
// the heatmap a column for a day that does not exist. Measured on the vault this was
// written for: 894 valid, 16 placeholders, 6 genuinely undated.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real day on the calendar, not just ten characters shaped like one. `2026-02-31` and
 * `2026-13-01` both pass ISO_DAY and neither exists; both would open a phantom heatmap
 * column, which is the same failure as the placeholder above by a different route.
 */
export function isRealDay(s) {
  if (!ISO_DAY.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * A frontmatter value as a day, or "". Handles both shapes the two mounts see: the
 * exporter's hand-rolled YAML gives strings, and Obsidian's parser gives a real Date for
 * an unquoted `created: 2026-08-23`.
 */
export function day10(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return localDay(v.getTime());
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return isRealDay(s) ? s : "";
}

/** A timestamp as a LOCAL day. Local, not UTC: a note written at 23:30 belongs to that day. */
export function localDay(ms) {
  const d = new Date(ms), p2 = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

// A date at the FRONT of a filename, and only there. `2026-08-23.md`, `2026-08-23 Kickoff`,
// `2026-08-23_notes` all count; `Q3 2026-08-23 review` does not, because a date in the
// middle of a title is as likely to be the subject as the filing date. The lookahead stops
// `2026-08-234` and `2026-08-23-2` from reading as a day and then quietly losing a digit.
const NAME_DAY = /^(\d{4}-\d{2}-\d{2})(?![\d-])/;

/** The day a filename claims, or "". Pass the basename, with no extension. */
export function nameDay(basename) {
  const m = NAME_DAY.exec(String(basename || ""));
  return m && isRealDay(m[1]) ? m[1] : "";
}

/**
 * The day a file's own stamps claim.
 *
 * `min(created, modified)`, which is not a typo. A creation stamp is only as good as the
 * filesystem that kept it, and the common ways a vault arrives -- a sync client writing it
 * down, a restore, a copy between drives -- all stamp creation with the moment of the copy
 * while leaving the modification time intact. That produces files "created" long after they
 * were last written. Whichever is earlier is the closer guess at when the note began, and
 * on a file nothing has disturbed the two are the same.
 */
export function stampDay(ctimeMs, mtimeMs) {
  const c = Number(ctimeMs) || 0, m = Number(mtimeMs) || 0;
  const pick = c && m ? Math.min(c, m) : (c || m);
  return pick ? localDay(pick) : "";
}

/**
 * The whole chain, and which link answered.
 *
 * Returns `{ day, source }` with source one of `frontmatter` | `filename` | `stamp` |
 * `none`. The source is not decoration: "118 notes undated" was the report, and a build
 * that says how it dated everything is the difference between fixing that and guessing at
 * it. Both mounts put the tally in `stats.dates`.
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

/** A fresh tally, so the two mounts report the same keys in the same order. */
export function dateTally() {
  return { frontmatter: 0, filename: 0, stamp: 0, none: 0 };
}
