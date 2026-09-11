# cut-release — change log

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
