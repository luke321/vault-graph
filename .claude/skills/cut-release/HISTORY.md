# cut-release — change log

## 2026-09-11 - read the last release before writing the next one

Step 13 now opens with `gh release view "$PREV_TAG"` and two checks the draft has to pass: plain
rather than technical, and short. It pointed at 1.7.0 as a reference before, which is a pointer
nobody follows; the command is now the first thing in the step.

2.6.0 was drafted from the design records and read like them -- 96px schematics, the 720px
breakpoint, what the preview is measured against -- and came back "to verbose and technical".
The same mistake had already been made once that day in preview-release, which got the same fix.

## 2026-09-11 - the table is the report

New "Keep the chat short" section above the status table, and the table's own instruction to
"call out in prose what's newly done" is cut back to at most two lines.

Cutting 2.6.0 produced multi-section reports after every step -- findings, measurements,
justifications -- until Lukas said "to verbose too many details". The skill invited it: it asked
for prose alongside the table without bounding it. Everything that explains a step already has a
home that can be skipped (commit message, issue, changelog-detail, the artifact under review),
so the rule is now explicit about not repeating any of it in chat.

## 2026-09-11 - every clip is looked at before it is committed

New step 8, "Look at every clip before committing it", between re-recording and the dry run;
the status table gained a matching row and everything after it renumbered. Step 7 is now
"Re-record every clip and the hero" rather than a judgment call (github#121).

Written the same afternoon it was needed. A full re-record captured an Obsidian window that was
sitting on the target monitor, open on a real vault, and overwrote five clips with footage of a
personal daily note. `gdigrab` copies a region of the desktop, so the take had the right
dimensions, the right duration and no error at all. What caught it was a size comparison --
0.04 MB against a committed 4.37 MB, a near-static capture compressing to nothing -- not anyone
looking at it.

Two gates, because each catches what the other misses: check the FIRST take before running the
rest (nineteen blind takes is how one bad clip becomes five), then publish every clip and the
hero in one Artifact with each byte size beside the previously committed one, and get an
explicit yes before committing any of them. `git checkout -- assets/` is what makes it
recoverable, and it only works while nothing has been committed.

github#122 now raises the Chrome window before capture, which removes the common cause. The
step stays regardless: the failure is silent by construction, and a gate that depends on
remembering to notice is not a gate.

## 2026-09-11 — stop step 1 finding the wrong last tag

Step 1 opened with `git describe --tags --abbrev=0` to find the previous tag. That is wrong in
this repo and had been since tags moved to `main`: releases are tagged on `main`, `main` only ever
receives `develop`, so **no release tag is an ancestor of `develop`**. `git describe` walks past
every 2.x tag and answers `1.8.0`.

Measured while cutting 2.6.0 on 2026-09-11: `git describe` gave a range of **455 commits** where
the real range was **88**. Step 1 exists precisely because "a release is the range, not the work
in hand", and 2.1.0 was cut twice for getting its own range wrong — so the command that defines
the range silently returning a range five times too large is the worst possible failure here. It
would not have failed loudly; it would have produced a plausible, enormous CHANGELOG section.

Replaced with `git tag --sort=-creatordate | head -1`, which is what `preview-release` already
used, plus a short note saying why `describe` must not be used and a sanity-check against
`gh release list`. The rest of step 1 now uses `"$PREV_TAG"` rather than a `<prev-tag>`
placeholder, so the commands can be run as written.
