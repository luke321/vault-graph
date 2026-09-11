// github#83, design/0016

export const NOTE_MAX_BYTES = 4096;
export const NOTE_MAX_LINES = 5;
export const NOTE_MAX_LINE_CHARS = 160;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** @typedef {{ version: string, lines: string[] }} UpdateNote */

/** @param {string} v @returns {number[] | null} */
export function semver(v) {
  const m = SEMVER.exec(String(v || "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** @param {string} v @returns {string} "MAJOR.MINOR", or "" when v is not semver */
export function minorOf(v) {
  const p = semver(v);
  return p ? p[0] + "." + p[1] : "";
}

/** @param {number[]} a @param {number[]} b @returns {number} */
function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

// github#83, design/0016 -- any problem is no note: build refuses, plugin shows nothing
/**
 * @param {string} text
 * @returns {{ note: UpdateNote | null, problems: string[] }}
 */
export function parseNote(text) {
  const src = String(text || "");
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const lines = [];
  let version = "";
  let inComment = false;
  src.split(/\r?\n/).forEach((raw, i) => {
    let line = raw;
    if (inComment) {
      const end = line.indexOf("-->");
      if (end < 0) return;
      inComment = false;
      line = line.slice(end + 3);
    }
    line = line.replace(/<!--[\s\S]*?-->/g, " ");
    const open = line.indexOf("<!--");
    if (open >= 0) { inComment = true; line = line.slice(0, open); }
    line = line.replace(/\s+/g, " ").trim();
    if (!line) return;
    const at = "line " + (i + 1) + ": ";
    if (!version) {
      const m = /^#\s+(\S+)$/.exec(line);
      if (m && semver(m[1])) { version = m[1]; return; }
      problems.push(at + 'expected "# <MAJOR.MINOR.PATCH>" first, got ' + JSON.stringify(line));
      return;
    }
    if (line.startsWith("- ")) {
      const bullet = line.slice(2).trim();
      if (!bullet) { problems.push(at + "empty bullet"); return; }
      if (bullet.length > NOTE_MAX_LINE_CHARS) {
        problems.push(at + "bullet is " + bullet.length + " characters, at most " + NOTE_MAX_LINE_CHARS);
      }
      lines.push(bullet);
      return;
    }
    if (line.startsWith("#")) { problems.push(at + "a second heading -- one release per file"); return; }
    problems.push(at + 'not a "- " bullet: ' + JSON.stringify(line));
  });
  if (!version) problems.push('no "# <version>" heading');
  if (!lines.length) problems.push("no bullets");
  if (lines.length > NOTE_MAX_LINES) problems.push(lines.length + " bullets, at most " + NOTE_MAX_LINES);
  const bytes = new TextEncoder().encode(src).length;
  if (bytes > NOTE_MAX_BYTES) problems.push(bytes + " bytes, at most " + NOTE_MAX_BYTES);
  const body = lines.join("\n");
  if (/\bdata:[\w.+-]+\/[\w.+-]+[;,]/i.test(body)) problems.push("carries a data: URI -- the note is text, link out instead");
  if (/<[a-z!/]/i.test(body)) problems.push("carries markup -- the note is text");
  return { note: problems.length ? null : { version, lines }, problems };
}

// github#83, design/0016 -- record now, or show and record on dismiss
/**
 * @param {{ installed: string, lastSeen?: string | null, hadData: boolean, note: UpdateNote | null }} a
 * @returns {{ show: UpdateNote | null, record: boolean, why: string }}
 */
export function decideNote(a) {
  const installed = semver(a.installed);
  if (!installed) return { show: null, record: false, why: "installed version is not semver" };
  if (!a.hadData) return { show: null, record: true, why: "fresh install" };
  const seen = a.lastSeen ? semver(a.lastSeen) : null;
  if (a.lastSeen && !seen) return { show: null, record: true, why: "lastSeenVersion is not semver" };
  if (seen) {
    const c = compare(installed, seen);
    if (c === 0) return { show: null, record: false, why: "already seen" };
    if (c < 0) return { show: null, record: true, why: "downgrade" };
    if (minorOf(a.lastSeen || "") === minorOf(a.installed)) return { show: null, record: true, why: "patch" };
  }
  if (a.note && minorOf(a.note.version) === minorOf(a.installed)) {
    return { show: a.note, record: false, why: seen ? "minor or major bump" : "upgrade from before update notes" };
  }
  return { show: null, record: true,
           why: a.note ? "the note is for " + a.note.version + ", not " + a.installed : "no note" };
}
