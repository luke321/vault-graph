#!/usr/bin/env node
// github#83, design/0016

import { decideNote, parseNote, parseReleases, releaseChain, NOTE_MAX_LINES } from "../plugin/update-note.mjs";

let failed = 0;
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail) {
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + (detail ? "   (" + detail + ")" : ""));
  if (!ok) failed++;
}

const NOTE = { version: "2.6.0", lines: ["one", "two"], points: [] };
/**
 * @param {string} label
 * @param {Parameters<typeof decideNote>[0]} a
 * @param {{ show: boolean, record: boolean, why: string }} want
 */
function decide(label, a, want) {
  const got = decideNote(a);
  const ok = !!got.show === want.show && got.record === want.record && got.why === want.why;
  check(label, ok, "show " + String(!!got.show) + ", record " + String(got.record) + ", " + got.why);
}

console.log("decideNote");
decide("fresh install: nothing shown, version recorded",
       { installed: "2.6.0", lastSeen: null, hadData: false, note: NOTE },
       { show: false, record: true, why: "fresh install" });
decide("upgrade from before update notes: shown, recorded on dismiss",
       { installed: "2.6.0", lastSeen: null, hadData: true, note: NOTE },
       { show: true, record: false, why: "upgrade from before update notes" });
decide("minor bump: shown, recorded on dismiss",
       { installed: "2.6.0", lastSeen: "2.5.0", hadData: true, note: NOTE },
       { show: true, record: false, why: "minor or major bump" });
decide("major bump: shown",
       { installed: "3.0.0", lastSeen: "2.6.1", hadData: true, note: { version: "3.0.0", lines: ["x"], points: [] } },
       { show: true, record: false, why: "minor or major bump" });
decide("patch bump: nothing shown, version recorded",
       { installed: "2.6.1", lastSeen: "2.6.0", hadData: true, note: NOTE },
       { show: false, record: true, why: "patch" });
decide("minor bump straight to a patch (2.5.0 -> 2.6.1): the 2.6.0 note is shown",
       { installed: "2.6.1", lastSeen: "2.5.0", hadData: true, note: NOTE },
       { show: true, record: false, why: "minor or major bump" });
decide("already seen: nothing shown, nothing written",
       { installed: "2.6.0", lastSeen: "2.6.0", hadData: true, note: NOTE },
       { show: false, record: false, why: "already seen" });
decide("downgrade: nothing shown, version recorded",
       { installed: "2.6.0", lastSeen: "2.7.0", hadData: true, note: NOTE },
       { show: false, record: true, why: "downgrade" });
decide("the note is for another minor: nothing shown, version recorded",
       { installed: "2.7.0", lastSeen: "2.6.0", hadData: true, note: NOTE },
       { show: false, record: true, why: "the note is for 2.6.0, not 2.7.0" });
decide("no note at all: nothing shown, version recorded",
       { installed: "2.7.0", lastSeen: "2.6.0", hadData: true, note: null },
       { show: false, record: true, why: "no note" });
decide("unreadable lastSeenVersion: nothing shown, version recorded",
       { installed: "2.6.0", lastSeen: "latest", hadData: true, note: NOTE },
       { show: false, record: true, why: "lastSeenVersion is not semver" });
decide("unreadable installed version: nothing shown, nothing written",
       { installed: "2.6", lastSeen: "2.5.0", hadData: true, note: NOTE },
       { show: false, record: false, why: "installed version is not semver" });

console.log("parseNote");
const good = parseNote("<!-- a\n comment -->\n# 2.6.0\n\n- one\n- two  \n");
check("heading, comment, blanks and bullets parse",
      !!good.note && good.note.version === "2.6.0" && good.note.lines.join("|") === "one|two", good.problems.join("; "));
const crlf = parseNote("# 2.6.0\r\n- one\r\n");
check("CRLF parses", !!crlf.note && crlf.note.lines[0] === "one");
check("no heading is a problem", !parseNote("- one\n").note);
check("a heading without a patch number is a problem", !parseNote("# 2.6\n- one\n").note);
check("a heading and no bullets is a problem", !parseNote("# 2.6.0\n").note);
check("prose outside a bullet is a problem", !parseNote("# 2.6.0\nhello\n- one\n").note);
check("a second heading is a problem", !parseNote("# 2.6.0\n- one\n# 2.7.0\n").note);
check("a data: URI is a problem", !parseNote("# 2.6.0\n- see data:image/png;base64,AAAA\n").note);
check("the word data: in a sentence is fine", !!parseNote("# 2.6.0\n- Live data: the disc follows the vault\n").note);
check("an <img> is a problem", !parseNote("# 2.6.0\n- <img src=x>\n").note);
check("any tag is a problem", !parseNote("# 2.6.0\n- <iframe src=x>\n").note);
check("a closing tag alone is a problem", !parseNote("# 2.6.0\n- </b>\n").note);
check("a bare less-than is fine", !!parseNote("# 2.6.0\n- a < b, and 3 > 2\n").note);
const inl = parseNote("# 2.6.0\n- foo <!-- hidden --> bar\n");
check("an inline comment is stripped from a bullet", !!inl.note && inl.note.lines[0] === "foo bar", inl.note ? JSON.stringify(inl.note.lines[0]) : inl.problems.join("; "));
const span = parseNote("# 2.6.0\n- one <!-- a\n- not a bullet\n-->\n- three\n");
check("a comment spanning lines hides what it spans", !!span.note && span.note.lines.join("|") === "one|three", span.note ? span.note.lines.join("|") : span.problems.join("; "));
check("six bullets is a problem", !parseNote("# 2.6.0\n" + "- b\n".repeat(NOTE_MAX_LINES + 1)).note);
check("five bullets is fine", !!parseNote("# 2.6.0\n" + "- b\n".repeat(NOTE_MAX_LINES)).note);
check("a 161-character bullet is a problem", !parseNote("# 2.6.0\n- " + "x".repeat(161) + "\n").note);
check("5 KB of bullets is a problem", !parseNote("# 2.6.0\n- " + "x".repeat(5000) + "\n").note);
check("the empty file is a problem", !parseNote("").note);

const pts = parseNote("# 2.6.0\n> vg-dim\n- one\n");
check("a \"> \" line names a control, and is not a bullet", !!pts.note && pts.note.points.join("|") === "vg-dim" && pts.note.lines.join("|") === "one", pts.note ? pts.note.points.join("|") : pts.problems.join("; "));
const pts2 = parseNote("# 2.6.0\n- one\n> vg-dim, vg-countbars vg-dim\n");
check("several ids on one line, comma or space, de-duplicated", !!pts2.note && pts2.note.points.join("|") === "vg-dim|vg-countbars", pts2.note ? pts2.note.points.join("|") : pts2.problems.join("; "));
check("a note with no \"> \" line points at nothing", parseNote("# 2.6.0\n- one\n").note.points.length === 0);
check("an id outside the vg- namespace is a problem", !parseNote("# 2.6.0\n- one\n> body\n").note);
check("a selector rather than an id is a problem", !parseNote("# 2.6.0\n- one\n> #vg-dim\n").note);
check("five controls is a problem", !parseNote("# 2.6.0\n- one\n> vg-a vg-b vg-c vg-d vg-e\n").note);
check("four controls is fine", !!parseNote("# 2.6.0\n- one\n> vg-a vg-b vg-c vg-d\n").note);

console.log("parseReleases");
const LOG = "# Changelog\n\n## Versioning\n\n## 2.5.0 \u2014 \"Tags\" \u2014 2026-09-11\n\n## 2.4.1 \u2014 2026-09-10\n## 2.4.0 \u2014 \"Auto\" \u2014 2026-09-10\n" +
            "## 2.3.0 \u2014 \"Gauge\" \u2014 2026-09-09\n## 2.2.0 \u2014 \"Fold\" \u2014 2026-09-08\n## 2.1.0 \u2014 \"Mobile\" \u2014 2026-09-07\n" +
            "## v1.4.4 \u2014 2026-08-22\n## v1.4.3 \u2014 withdrawn, deleted\n## v1.0 \u2014 2026-08-22\n";
const rel = parseReleases(LOG);
check("every semver heading is a release, in file order", rel.map((r) => r.version).join("|") === "2.5.0|2.4.1|2.4.0|2.3.0|2.2.0|2.1.0|1.4.4|1.4.3", rel.map((r) => r.version).join("|"));
check("a quoted name is read, and a heading without one is empty", rel[0].name === "Tags" && rel[1].name === "" && rel[6].name === "");
check("v1.0 is not semver and is skipped", !rel.some((r) => r.version.startsWith("1.0")));
check("the Versioning heading is skipped", !rel.some((r) => !/^\d/.test(r.version)));

console.log("releaseChain");
const NOTE6 = { version: "2.6.0", lines: ["x"], points: [] };
const chain = (lastSeen, installed, note = NOTE6) => releaseChain({ releases: rel, lastSeen, installed, note }).map((r) => r.version + (r.name ? ":" + r.name : "")).join("|");
check("2.1.0 -> 2.6.0 lists every x.y.0 after 2.1.0, oldest first, the note's version last",
      chain("2.1.0", "2.6.0") === "2.2.0:Fold|2.3.0:Gauge|2.4.0:Auto|2.5.0:Tags|2.6.0", chain("2.1.0", "2.6.0"));
check("patches are left out of the chain (2.4.1)", !chain("2.1.0", "2.6.0").includes("2.4.1"));
check("2.5.0 -> 2.6.0 is the note's version alone", chain("2.5.0", "2.6.0") === "2.6.0", chain("2.5.0", "2.6.0"));
check("2.5.0 -> 2.6.1 still ends at the note's 2.6.0", chain("2.5.0", "2.6.1") === "2.6.0", chain("2.5.0", "2.6.1"));
check("2.3.0 -> 2.5.0 with the note already in the CHANGELOG carries its name once", chain("2.3.0", "2.5.0", { version: "2.5.0", lines: ["x"], points: [] }) === "2.4.0:Auto|2.5.0:Tags", chain("2.3.0", "2.5.0", { version: "2.5.0", lines: ["x"], points: [] }));
check("no version last seen: the note's version alone", chain(null, "2.6.0") === "2.6.0", chain(null, "2.6.0"));
check("an unreadable last-seen version: the note's version alone", chain("latest", "2.6.0") === "2.6.0");
check("1.4.4 -> 2.6.0 crosses the major: 2.1.0 onward, 1.4.x patches out", chain("1.4.4", "2.6.0") === "2.1.0:Mobile|2.2.0:Fold|2.3.0:Gauge|2.4.0:Auto|2.5.0:Tags|2.6.0", chain("1.4.4", "2.6.0"));

if (failed) { console.log("update-note selftest: " + failed + " FAILED"); process.exit(1); }
console.log("update-note selftest: all passed");
