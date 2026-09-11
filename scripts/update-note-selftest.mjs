#!/usr/bin/env node
// github#83, design/0016

import { decideNote, parseNote, NOTE_MAX_LINES } from "../plugin/update-note.mjs";

let failed = 0;
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail) {
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + (detail ? "   (" + detail + ")" : ""));
  if (!ok) failed++;
}

const NOTE = { version: "2.6.0", lines: ["one", "two"] };
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
       { installed: "3.0.0", lastSeen: "2.6.1", hadData: true, note: { version: "3.0.0", lines: ["x"] } },
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
check("an <img> is a problem", !parseNote("# 2.6.0\n- <img src=x>\n").note);
check("six bullets is a problem", !parseNote("# 2.6.0\n" + "- b\n".repeat(NOTE_MAX_LINES + 1)).note);
check("five bullets is fine", !!parseNote("# 2.6.0\n" + "- b\n".repeat(NOTE_MAX_LINES)).note);
check("a 161-character bullet is a problem", !parseNote("# 2.6.0\n- " + "x".repeat(161) + "\n").note);
check("5 KB of bullets is a problem", !parseNote("# 2.6.0\n- " + "x".repeat(5000) + "\n").note);
check("the empty file is a problem", !parseNote("").note);

if (failed) { console.log("update-note selftest: " + failed + " FAILED"); process.exit(1); }
console.log("update-note selftest: all passed");
