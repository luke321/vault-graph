# Changelog

What shipped, and when. One entry per release.

Each release links to the commits behind it. The **measurement** behind any individual
change — the before/after numbers that decided it — lives in
[`.ai-context/changelog-detail.md`](.ai-context/changelog-detail.md), which is kept as a
regression suite rather than as history.

## Versioning

`vMAJOR.MINOR.PATCH` from `v1.1.0` on.

| | |
|---|---|
| **MAJOR** | output or invocation breaks — a flag removed, the HTML no longer self-contained |
| **MINOR** | new capability, or an intentional visual change |
| **PATCH** | fixes and docs with no intended visual change |

`v1.0` predates the scheme and is left as a two-part tag rather than retconned.

**From `1.5.0` the tag drops the `v`.** Obsidian matches a release tag against the `version`
string in `manifest.json`, and a manifest version must be bare semver — so a `v` prefix
makes the plugin uninstallable. The older `v`-prefixed tags stay as they are; renaming a
published tag breaks every link to it.

**Every release gets a GitHub Release with a ready-to-run package attached** — see
[`.ai-context/releasing.md`](.ai-context/releasing.md).

---

## 1.6.0 — 2026-08-23

**You can choose the colours now**, in both targets, and the palette they come from
changed shape.

- **A settings tab for the plugin, and a gear for the standalone page.** Each lists every
  top-level folder with the twelve palette slots under it; picking one holds that folder to
  that colour, and **changes nothing else** — position decides every other folder's colour,
  so one pick cannot move a wedge you did not touch. Two folders may share a slot, which is
  a way of saying they belong together. The plugin persists through `saveData()`, the
  standalone through
  `localStorage` under a **vault-scoped key** — two graphs built from different vaults are
  the same `file://` origin, so an unscoped key would have them overwrite each other's
  colours. `page.js` itself stores nothing: settings go in through the deps object and
  changes come back out through a callback, because there is no store both hosts have. See
  [`0009-the-host-persists-settings-not-the-page`](.ai-context/decisions/0009-the-host-persists-settings-not-the-page.md).

- **The plugin's four existing settings finally have a UI.** `ghosts`, `templates`,
  `flatMonths` and `words` have been real settings since the plugin was written, persisted
  and reachable only by hand-editing `data.json`. They sit above the colours now. They
  rebuild the view, where a colour only repaints it — colour is not an input to the layout,
  and a swatch click has no business replaying the reveal animation.

- **A saved colour is a slot (`g7`), never a hex.** The palette has separate light and dark
  values, so a stored hex would be right in one theme and wrong in the other. Swatches are
  coloured by a class resolving `var(--g7)` for the same reason: a `var()` re-resolves on a
  theme flip, an inline hex does not.

- **Twelve slots, and they go round.** It was ten hues and then a grey tail: every folder
  past the tenth fell into the neutrals and merged into one undifferentiated blob. Folder
  13 now comes back to slot 1. A repeated hue is still separated by its wedge, its rim
  label and its legend row; the grey tail separated nothing from anything. Measured on the
  17-folder synthetic vault: `g1…g12`, then `g1…g5` again.

- **Grey is a choice instead of a consolation.** Slots 11 and 12 are greys, carrying the
  values the first two neutrals already had, so a folder can be told to recede on purpose.
  The neutrals still exist as the dim colour and as `colorOf`'s fallback.

- **Slots 6 and 10 stopped being pastels.** `#e87ba4` and `#c26ed3` were the two palest
  slots on the light surface, and magenta was the one hue in the palette failing 3:1
  against it. Measured, it was lightness rather than low chroma: their chroma was mid-pack.
  Both hues are kept to within a degree or two; chroma and contrast go 0.141/2.62 →
  0.227/5.12 and 0.168/3.16 → 0.225/6.94, and light-theme slots under 3:1 drop from four to
  three. **The palette's worst pair is unchanged** — Orange vs Red at dE 7.1, before and
  after — so two more slots and two much stronger hues cost nothing in separation.

- **Each row rings the slot its folder is actually using**, whether or not anybody chose
  it — brightly for a chosen slot, dimly for the one a folder's position gives it. Marking
  only chosen slots meant that a folder on Auto, which is every folder until somebody
  changes something, had no mark at all: the panel showed twelve colours and would not say
  which of them the folder was. In the plugin the marks are corrected from the live graph
  once it answers, because a note with no links at all is grouped under `(unlinked)` rather
  than under its folder — so a path-derived list is one row short on any vault with
  orphans, and every folder after it would be ringed one slot out.

- **`_`-prefixed folders are treated as archives**: out of the colour rotation, given the
  grey slot `g11`, and hidden by default. `g11` of the two greys because it is the
  lower-contrast one against the surface in both themes (4.99 vs 9.51 on light, 5.16 vs
  9.12 on dark), which is what recede means. It is a real palette slot rather than a
  neutral off to one side, so the picker can ring it and Auto means something on an
  archive row. A leading underscore is how a vault says "sorts
  last, not part of the working set", and spending a hue on one costs twice — the archive
  gets a colour that says look at me, and every folder after it is pushed a slot along.
  Measured on the demo mirror: `_ Archives` and `_ Claude` sort at positions 2 and 3, so
  they were taking `g2`/`g3` and shifting every working folder by two. The working folders
  now run an unbroken `g1…g9`. Notes are still in the graph — this is a colour and
  visibility rule, not an exclusion, and it says nothing about files (`_scratch.md` is a
  note like any other).

- **Per-folder visibility is a setting, beside the colour.** Each row gets an eye that sets
  the *default*, persisted alongside the colours; the legend's own eye stays the live,
  session-only filter. The map is tri-state — shown, hidden, or absent meaning "whatever
  the `_` rule says" — so hiding a folder by hand stays distinguishable from never having
  mentioned it. **This changes what `Refresh` means**: it used to clear every filter to
  "everything visible" and now returns to the configured default, because the alternative
  is one control that disagrees with the settings.

- **The scripted demo shows the picker.** Six new beats open the gear, recolour two folders
  (one of them to a grey, which is the answer to "can a folder recede on purpose"), reset,
  and close — plus one that hovers a legend row. Beat 18 aims at a real 15px swatch through
  CDP hit-testing, so it fails if the swatch is covered or scrolled away. The run is 26
  beats and ~43s, up from 20 and ~30s.

- **The biggest folders now land on the outer ring.** The band balancer's rules were all
  geometry — thickness, row counts, hole size — which says nothing about *which* folders
  make up a band, so among equal-scoring splits it kept whichever it reached first. On the
  10k vault that meant `05 - Meeting Notes` (1679) and `01 - Projects` (1066) inside while
  Journal (48), Clippings (92) and Literature Notes (148) sat on the rim. There is now a
  fourth, weakly-weighted preference: the biggest folder inside minus the smallest outside,
  zero when the split is size-ordered. Both vaults keep exactly the row counts and
  thickness they had (4/6 at 0.48, 16/23 at 0.55) and simply order the folders correctly
  within them.

- **Hovering a folder in the legend haloes its notes on the disc.** A separate highlight
  source alongside a clicked group and a marked day, ramping through the same per-note
  path. It haloes without pushing: a wedge sliding out and back under a moving pointer is
  a lot of motion to spend on a question the halo has already answered. Clicking still
  pins the highlight and pushes.

- **`scripts/palette-check.mjs`** prints all of the above for both themes. Deliberately not
  part of the smoke suite: a palette does not drift on its own, and what makes a hue right
  is looking at it.

The invariant suite is 18 checks now and passes on both vaults.

---

## 1.5.3 — 2026-08-23

Zero network calls, and a note gets dated even when nothing says so.

- **A note is dated by its filename or its file stamp when the frontmatter does not say.**
  Reported as 118 notes "undated" on a vault that does not write a `created:` field
  ([#6](https://github.com/luke321/vault-graph/issues/6)) — which was the whole rule:
  frontmatter `created`, then `date`, then give up. The chain is now frontmatter → a date
  at the **front** of the filename → the file's own creation stamp. Frontmatter still wins
  even when it is the worst answer, because it is a deliberate statement and the graph
  should not silently disagree with the note.
  - `min(ctime, mtime)`, not `ctime`. Sync clients, restores and copies between drives all
    stamp creation with the copy and leave modification intact, which produces files
    "created" long after they were last written.
  - The filename date has to be at the front and real. `Q3 2026-08-23 review` does not
    count — a date mid-title is as likely to be the subject as the filing date — and
    `2026-02-31` does not count either, which now also applies to frontmatter, where an
    impossible date could always have opened a phantom heatmap column.
  - **The rule is one function now**, `src/dates.mjs`. Both mounts had their own copy and
    both had the same gap; fixing that twice is how it comes back in one of them.
  - Every build says how it dated things: `dated: 8037 from frontmatter, 842 from the
    filename, 1123 from the file stamp, none undated`. On the 10k synthetic vault that is
    1965 undated → 0.
- **Refresh picks up new files — in the plugin, where it can.** The standalone page cannot
  and never could: its data is baked in at build time, so there Refresh resets the filters
  and replays the intro, and its tooltip now says so instead of claiming twice over to
  "re-read the file from disk", which is where the expectation came from. In Obsidian the
  vault is right there, so the button rebuilds from the metadata cache and remounts.
  `scripts/refresh-check.mjs` drives the whole round trip in a real Obsidian — 454 notes,
  write one, still 454, click Refresh, 455.

- **The shipped `main.js` now contains no network request at all.** The directory's review
  reports, under **Disclosures**, how many a plugin makes — ours said **2**, and a plugin
  that draws a picture of the vault should say 0 ([#1](https://github.com/luke321/vault-graph/issues/1)).
  Both were Sigma.js's `loadSVGImage`, which fetches an SVG so a node-image program can draw
  from it; this page registers exactly two programs, `EdgeCurveProgram` and
  `createNodeBorderProgram`, so neither call could ever run. That is still the wrong number
  to ship: "there is a `fetch` in there but we never take that path" is a claim a user has
  to take on trust, and **0** is one they can check with a grep.
- **They are stripped at read time, not patched into `vendor/`.** `src/vendor.mjs` replaces
  each `fetch(` with a thrower as the bundle is read, and both consumers go through it — the
  HTML exporter and the esbuild plugin build. `vendor/` stays byte-identical to upstream, so
  the committed bundle can still be diffed against the release it came from; the modification
  travels with the build and is recorded in `vendor/NOTICE.md`, as MIT redistribution asks.
  The alternatives — disclose them, take an npm supply chain to tree-shake them, fork the
  bundle, or shadow the binding and leave the literal in the file — are weighed in
  [`0008-zero-network-calls`](.ai-context/decisions/0008-zero-network-calls.md).
- **The count is the gate, and that is the part that matters in a year.** Each bundle
  declares how many calls it is expected to contain, and a mismatch is a hard build error
  rather than a silent strip. Stripping is mechanical; noticing that an upstream update
  added a *third* call — one that might be necessary, and would then have to be disclosed
  rather than removed — is not.
- **`scripts/check-network.mjs` keeps the answer at zero**, from three directions: our own
  sources, the vendored bundles after stripping, and whatever a build left behind. It also
  covers remote resources — `src=`, stylesheet `href=`, `@import`, `url()` — because a
  webfont is a request too, and a quieter one. Static, no browser, milliseconds, so it joins
  the PII and scope checks on `pre-push` **with no skip flag**.

- **`scripts/release.ps1` can cut a release again.** Its version guard still required a
  `v` prefix, which 1.5.0 deliberately dropped — Obsidian matches the release tag against
  `manifest.json`'s `version`, and a manifest version must be bare semver, so a `v`-tagged
  release is one nobody can install. The check was never updated, which is why 1.5.0–1.5.2
  were cut by hand. It now takes bare semver, gives a `v` its own message rather than a
  format error, and additionally refuses a version the manifest does not already claim —
  the other half of the same rule, and otherwise invisible until a user reports the plugin
  will not update. The path in `releasing.md` had a carriage return in place of the `r` in
  `release.ps1`, so the one command it documents could not be copied and run.

Measured: built `main.js` has 0 network primitives and 2 throwers, and a standalone page over
a 3003-note synthetic vault has 0. Both guards fail as they should — a planted `fetch` in
`plugin/main.js`, and a third `fetch` in a copied Sigma bundle.

## 1.5.2 — 2026-08-22

The directory's review of 1.5.1 came back with exactly one **error**, and chasing it found a
real bug that had nothing to do with the linter.

- **`minAppVersion` is now `1.7.2`, and it is now a measured number rather than an inherited
  one.** The error was `Workspace.revealLeaf` at `plugin/main.js:593` and `:596` — marked
  `@since 1.7.2` in `obsidian.d.ts`, against a declared floor of `1.5.0`. That `1.5.0` had no
  rationale anywhere in this repo, because it never had one: it came from a template and was
  never checked against what the plugin actually calls. Every other Obsidian API used here is
  older, so 1.7.2 is the true floor.
- **A deferred view is no longer mistaken for a live one.** This is the part worth reading.
  `revealLeaf` did not become *new* in 1.7.2, it became *async* — because 1.7.2 introduced
  DEFERRED views, and a leaf restored from a saved workspace now has a `DeferredView`
  placeholder as its `view` until something reveals it. `currentView()` returned that
  placeholder, so **"Rebuild from the metadata cache" was a `TypeError`** on the first use
  after a restart (the stub has no `render`), and **"Report diagnostics" reported
  `hasApi: false`** about a graph that was working correctly. Both read as bugs in the graph;
  neither was. `currentView()` now awaits `loadIfDeferred()` and checks `instanceof`, and both
  `revealLeaf` calls are awaited, which is what the API asks for.
- **`scripts/deferred-check.mjs` reproduces it**, because neither existing harness could:
  `smoke.mjs` and `spike-check.mjs` both open the graph in the foreground and look at it
  immediately, which is the one state where deferral never happens. It is two phases against
  one profile — open the graph, leave a different tab active, quit, relaunch — and it measures
  the hazard before asserting the fix: on the restored leaf `isDeferred` is `true` and
  `leaf.view.render` is `undefined`, which is the TypeError. Then, with the fix, "Rebuild"
  completes with no throw and no window error, the leaf ends up undeferred with the real view,
  7 canvases paint, and diagnostics report `hasApi: true, order: 452`. 10/10. It is a manual
  command rather than a push gate, for the same reason the per-frame animation invariant is:
  it launches a real Obsidian twice and takes about ninety seconds.

  Two things it got wrong first, both worth knowing. `constructor.name` identifies nothing
  here — the bundler minifies every class to a single letter, so the real view and the
  placeholder both report `"t"`; `typeof view.render === "function"` is the discriminator, and
  it is the method the command actually calls. And `app.plugins.enablePlugin()` on a vault in
  restricted mode registers the id **without loading the plugin**, so the command silently did
  nothing and the first version of this check passed vacuously on a leaf that did not exist.
  `setEnable(true)` first, then assert `getPlugin()` before believing anything.
- **The lint gap that hid it is closed.** `obsidianmd/no-unsupported-api` is scoped to
  `**/*.{ts,cts,mts,tsx}` in the recommended preset, and this plugin is plain JavaScript
  — so the rule silently never ran locally while the directory ran it anyway. A check that
  cannot fail is worse than no check, because the clean run is taken as evidence. It is now
  enabled explicitly for `plugin/**/*.js` and `src/page.js`, and it reproduces both errors.

**Left alone, and now with numbers.** The scorecard's ~10,980 issues are five
`@typescript-eslint/no-unsafe-*` rules — 5,470 member-access, 2,396 assignment, 1,533 call,
613 argument, 540 return. All warnings, no errors, and overwhelmingly
`vendor/graphology.umd.min.js:1`: type-aware rules objecting that untyped JavaScript is
untyped. Silencing them means either a TypeScript rewrite or dropping the vendored library
that makes the exporter work with no npm install and no network.

## 1.5.1 — 2026-08-22

Everything the directory's automated review raised on 1.5.0, plus a contributing guide.

- **`authorUrl` points at a profile**, not at this repository. The field answers "who wrote
  this", and the repo link is already the plugin's own page.
- **No `!important` anywhere**, and the fix is more interesting than the rule. Removing it
  broke hiding outright: the overlays are styled by ID selectors, and an ID beats any number
  of attributes, so `[hidden]` simply lost. The "Laying out graph…" overlay then sat over the
  canvas permanently and swallowed every hover — caught as *"element at aim vg-busy"* rather
  than as anything about CSS. The overlays are now named at ID-level specificity, which beats
  their own rules by one attribute and needs no `!important`. The old comment blamed
  `.row`/`.lbl` and was wrong about its own reason.
- **No `::-webkit-scrollbar` rules.** `scrollbar-width` and `scrollbar-color` were already
  there and do the same job; the vendor-prefixed ones were belt and braces, and the review
  flags them as only partially supported. Cost: 5px of scroll-bar height on the heatmap.
- **The README says what the plugin touches.** A graph of a whole vault has to enumerate the
  whole vault, so it does — `getMarkdownFiles`, the metadata cache, and `cachedRead` for word
  counts, writing nothing. The review flags the enumeration correctly; it is what the plugin
  is for, and better stated than discovered.
- **`CONTRIBUTING.md`**: issues are the way in for now, with what makes a useful one — vault
  shape for layout reports, a screenshot for anything visual, and a reminder never to paste a
  built HTML file, since it carries every note title in plain text. `make-demo-vault.mjs` is
  there for exactly that.

**Left alone deliberately:** the CSS masks the centre mark is built from, which the review
flags as partially supported — the mark *is* two masks composited, and it degrades to nothing
rather than to something broken. And the ~11,000 issues the scorecard attributes to
`vendor/`: that is 260 KB of minified third-party JS with 73,000-character lines. Replacing
it with npm dependencies would trade the exporter's "no npm install, no network" property for
a number about somebody else's code.

## 1.5.0 — 2026-08-22

**The first release with an Obsidian plugin in it.** The graph now mounts inside Obsidian as
a view, reading the vault through Obsidian's own metadata cache, and still exports the
standalone HTML file it always did. One source, two mounts.

Note the tag: **`1.5.0`, with no `v`**, unlike every release before it. Obsidian matches a
release tag against the `version` string in `manifest.json`, and a manifest version must be
bare semver — so the `v` prefix would make the plugin uninstallable.

### The plugin

- Mounts **in the DOM**, not in an iframe. The spike that proved the page ran inside
  Obsidian used a sandboxed frame and paid for it three ways: the invariant suite could not
  reach the page, the plugin talked to itself through a message bridge, and the theme had to
  be handed across an origin boundary. All three are gone.
- Reads `resolvedLinks`, `unresolvedLinks`, `getFileCache` and `stat.mtime` — the same links
  Obsidian resolves, aliases and frontmatter links included. About 12ms on 450 notes.
- **Follows the theme**, including a live switch, and the palette is re-read rather than
  snapshotted at mount.
- Clicking a note opens it with `openLinkText`, which respects panes and history.
- Its own ribbon mark, drawn from the product: two concentric bands of notes around a
  hollow hub.
- Ships as `main.js` + `manifest.json` + `styles.css` and nothing else, because that is
  exactly what Obsidian installs.

### The page, split in four

`template.html` became `shell.html` + `page.css` + `page.html` + `page.js`, and both
consumers assemble from the same four. The split itself changed nothing: built from the same
vault before and after, the standalone output was byte-identical apart from its timestamp.

Then the page learned to live somewhere else: every id is prefixed, every CSS rule is scoped
under one class, and `page.js` is `mountVaultGraph(root, data, deps)` with no `document`
reach left in it. `scripts/check-scope.mjs` asserts all three and gates every push.

### Behaviour

- **"Mark today" means what the heatmap means.** It counted files *touched* today as well as
  created, and `touched` is an mtime that a sync or a frontmatter rewrite moves — so it
  marked far more than the band showed. `created` alone now, pinned to the band by a new
  invariant as set equality rather than counts.
- **"Mark today" no longer moves notes**, only haloes them, like a marked heatmap day. Its
  notes are scattered across every folder, so pushing them slid a subset out through their
  own cell-mates.
- **Links are softer in the light theme.** The palette was perceptually symmetric, which is
  not the same as looking symmetric: 1500 opaque lines over a near-white field accumulate
  into a wash and read as dirt, while the same density on a dark field reads as glow.

### Checking it

- The suite runs **both vault shapes** every time — a ~450-note mirror and a 10,000-note
  synthetic — and there are 17 checks, not 16. A change that passes at 450 notes can still
  break the band split at 10,000.
- `scripts/make-demo-vault.mjs` builds a structural mirror of a real vault with none of its
  content, so screenshots and the demo clip no longer show anybody's notes.
- `scripts/shoot.mjs` screenshots the page at rest for comparing two commits, which is how
  the one regression in this release was caught: the centre mark vanished, and no invariant
  looks at the middle of the disc.
- Every guideline error in the shipped page is fixed — 62 to zero against Obsidian's own
  lint, which had never been pointed at `src/` before.

## v1.4.4 — 2026-08-22

**v1.4.3 withdrawn and deleted.** A verification clone of the published repository turned
up one more real first name, in a `check-pii.mjs` comment illustrating the word-boundary
rule. That file is on the checker's own allowlist, so the gate cannot inspect its comments
— which is precisely how it survived three passes. The examples are invented words now.

Third time this shape of mistake has appeared: documenting a name rule with a real name.
The first was the leak itself, the second a commit message quoting the names it was
removing, this the third.

## v1.4.3 — withdrawn, deleted

**v1.4.2 has been withdrawn and deleted too**, for a mistake inside its own fix. The PII
check shipped with its deny list as a plain array in `scripts/check-pii.mjs` — so the
release that existed to remove ten names from the repository published all ten of them, in
the file doing the removing. The original comment called that irony "real but acceptable,
since anyone who can read the list can already read the repo"; that argument dies the
moment the history is rewritten specifically to remove those names.

- **The deny list is no longer in the repository.** It lives in `.pii-names`, which is
  gitignored, with `.pii-names.example` explaining the file and carrying no names.
  `PII_NAMES=a,b,c` overrides it for a one-off run.
- **A missing list is loud.** Without it the identifier patterns still run, but every
  invocation says the names were not checked — a gate that quietly degrades to "clean" is
  the exact failure this check exists to prevent.

## v1.4.2 — withdrawn, deleted

Its package carried the deny list described above. Everything below shipped in it and is
still in place.

**v1.4.1 was withdrawn and deleted, and the git history rewritten.** Both for the
same reason: this repository is developed against a real personal vault, and it had been
publishing other people's names. A design record listed seven colleagues by first name
with a note count each, and a code comment carried a colleague's full name as an example.
The v1.4.1 package contained the same text, so the download had to go with it.

- **No more names.** Every reference reads generically now, and the sentences keep their
  meaning — the folder structure was always the point, never whose subfolder it was. Four
  hardcoded absolute vault paths went at the same time, which broke this project's own rule
  about paths anyway.
- **A check that stops it recurring.** `scripts/check-pii.mjs` runs in `pre-push` with **no
  skip flag**, unlike the invariant suite: everything else in that hook is about
  correctness and can honestly be skipped in a hurry, and this one is about other people.
  It scans file contents *and* file paths — the first version scanned only contents and
  reported clean while two names sat in directory names one level above.
- **Demos no longer point at the real vault.** `scripts/make-demo-vault.mjs` builds a
  structural mirror — same folder tree, same note count per folder, same `created` dates,
  same word counts, the whole link graph rewritten between renamed notes — sharing none of
  the original's words. Both vaults build to the same numbers: 452 notes, 1521 links, 0
  orphans, 120 unresolved. Recordings use it from now on.

## v1.4.1 — withdrawn, deleted

Its package carried the text described under v1.4.2. Everything it fixed is still in place
below; only the download is gone.

- **The v1.4.0 download did not extract properly off Windows.** `Compress-Archive` writes
  backslashes as the zip entry separator, which the spec forbids; Windows tolerates it, so
  the package looked correct and would have unpacked on macOS or Linux as a few files with
  backslashes in their names. Packaging uses bsdtar now, and **reads the entry names back**
  to check — the defect is invisible from the machine that produces it, so trusting the
  tool was the mistake.
- **The install guide says what the script actually does.** It generates one HTML file and
  exits; opening that file is a separate step you take yourself. Now three numbered steps
  rather than a command with the important part in prose after it.

## v1.4.0 — withdrawn

Released and pulled four minutes later, with zero downloads: its zip used backslash
separators and would not have extracted off Windows. Everything below shipped as part
of v1.4.1, which is the first release with a package worth downloading.

- **The two rings are balanced.** Which ring a folder sits in is no longer decided by size
  alone: whole folders are moved between them so the inner ring comes out at about **55% of
  the outer ring's thickness**, and thinner than it in every case. Measured 0.53 on a
  450-note vault and 0.55 at 10,000, against 0.13 and 3.30 before.
- **Unlinked notes are their own folder** instead of being sunflower-packed into the hub.
  They get a wedge, a colour, a legend row and a count like anything else, and land in
  whichever ring their size earns. The hub hole now holds only the logo.
- **Wedge gaps shrink as the vault grows**, to nothing by 10,000 notes. A 2-degree seam is
  a clean separator at 450 notes and a missing slice at 10,000, where the lattice has
  closed up around it but the gap has not.
- **The centre logo is a fixed size** and no longer resizes with the folder layout, and the
  hub hole is held near its designed 30% of the disc rather than being allowed to grow to
  half of it in pursuit of ring balance.
- **The README's demo is recorded against a real vault again.** A 10,000-note synthetic
  disc is a good stress test and a poor advertisement — at that density the dots are
  ~2.5px across and the whole thing reads as noise rather than as structure. The demo also
  parks its pointer somewhere that provably hovers nothing before it starts, instead of at
  62% x 55% of the window, which was on the disc: takes opened with a note already lifted
  and labelled, looking as though the page had done it by itself. `scripts/make-gif.ps1`
  makes the encode reproducible rather than a shell-history incantation.
- **A synthetic test vault** with realistic names (`scripts/make-test-vault.mjs`) — and it
  earned its place immediately, finding four defects that a single 450-note vault could
  never surface. See `.ai-context/changelog-detail.md`.

## v1.3.0 — folded into v1.4.0

Tagged but never published; its contents shipped as part of v1.4.0.

**Ready for other people to use.**

- **MIT licensed**, with third-party notices for the two vendored libraries — and the same
  notice is now emitted into every built HTML, since the output inlines them.
- **The README is the install guide.** Node 18 and a vault is the whole requirement. Covers
  vault resolution, the flags, which helper scripts are Windows-only, and — documented
  nowhere before — exactly what ends up in the output file, which is what decides whether
  it is safe to share.
- **The README leads with the demo**, recorded by the repo itself.
- The wrap gap between the last folder and the first is now **centred on 12 o'clock**
  instead of starting there, on both rings.
- The invariant suite covers **the resting lattice** too — 15 checks.
- **A synthetic test vault** (`scripts/make-test-vault.mjs`) — deterministic, ~3000 notes,
  15 top-level folders with realistic names, five levels deep, sliver folders beside a
  dominant one. It found two things on its first run: the demo's note-aim bound was
  unreachable on a dense disc, and the storyboard named this vault's folders so half its
  beats would skip on anyone else's. Both fixed; group and subfolder targets now fall back
  by size. The core layout invariants held unchanged at 3003 notes and 16 folders.
- The README's demo GIF is now recorded **against the synthetic vault**, so the published
  asset contains no real note titles.

## v1.2.0 — 2026-08-22

**The heatmap band, a scripted demo, and a suite that checks itself.**

- **Heatmap band above the disc** — notes added per day, each square pieced together from
  its own notes' exact colours rather than an average, hue-ordered. Count reads as grain.
  Hovering a day haloes those notes on the disc; clicking pins them.
- **`?demo`** — a scripted walkthrough whose storyboard lives in the page and whose input
  is performed from outside it over Chrome's DevTools protocol, so it hit-tests like a real
  click. `scripts/record-demo.ps1` captures it to mp4 unattended.
- **`scripts/smoke.mjs`** — every automatable invariant in one command, gating pushes via
  `.githooks/pre-push`.
- Hovering a note and highlighting notes are **animated** rather than switching on one
  frame; highlighted notes reach 1.5x.
- The legend **opens folded** to top-level folders.
- Palette slots 5 and 6 transposed, so a large folder does not land on magenta.
- Nav counts share one right edge, and `only` is on every row.
- **Fixed:** `created` is validated rather than blindly sliced — an unrendered Templater
  placeholder was sorting as a date and ranking 16 notes as the newest in the vault.

## v1.1.1 — 2026-08-22

**One gap allocator.** Three copies of the same arithmetic became one, which fixed the last
rotation jump: a fading group kept its gaps reserved all the way down and then redistributed
them in a single frame.

## v1.1.0 — 2026-08-22

**The vault is discovered, not hardcoded.** Resolution order is `--vault`,
`VAULT_GRAPH_VAULT`, `OBSIDIAN_VAULT`, `--vault-name`, Obsidian's own registry, then a
walk-up — so the build works with no arguments on any machine. Also: gaps became continuous
where they position the wedges, so a note fading out can no longer rotate the disc.

## v1.0 — 2026-08-22

**First tagged release.** The disc, the reveal cascade, the timeline, the group navigation,
and the design records — the source moved out of the vault into its own repository, with
only the built HTML staying behind.
