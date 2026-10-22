# preview-release — change log

## 2026-10-16 - the previous tag is a version tag

Cutting 2.10.0, `git tag --sort=-creatordate | head -1` answered `keep/203`, a preservation ref
made after a merge, instead of `2.9.0`. Non-version tags sort in by creation date too. The recipe
now lists only tags that start with a digit (`--list "[0-9]*"`); every release tag since 1.5.0
is bare semver.
## 2026-09-29 - no longer names a session role (github#194)

"Safe to run from any session" became "from any checkout"; "his pick" became "the maintainer's pick".

## 2026-09-11 — read the last published release before drafting

Added step 2, "Read the last published release before drafting anything", and renumbered the
rest. The skill described *what* to draft but never *what a release here looks like*, so a draft
written straight from `.ai-context/` came out as design-record prose — long paragraphs under each
feature heading, a thesis-style lead, no embedded clip — and was rejected on sight as "way too
verbose … ignored how releases look in GitHub".

The house shape is only discoverable from the artifact itself (`gh release view <tag> --json body
-q .body`), so the step now says to read it every time, and records what to look for: a one-line
bold problem statement as the lead, bold-led bullets carrying the detail, the clip `<img>`
embedded inside its own section with a beat-by-beat alt, a flat `### Smaller things` list, a
`**Known:**` line for a known defect, and the length — 2.5.0's whole reel is under 300 words.
Also noted that release names are one word in quotes, which is why the draft leaves the name as
an empty slot.

Step 5's structure item now points at that shape explicitly ("bold-led bullets, not paragraphs")
rather than leaving the format open.
