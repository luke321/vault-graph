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
