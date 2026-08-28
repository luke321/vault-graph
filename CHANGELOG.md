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

## 1.9.0 — "Belonging" — unreleased

An unlinked note now joins its own folder's wedge and colour by default, instead of
sitting apart with every other unlinked note — reversible per-vault, from either host.

- **An unlinked note joins its own folder's group by default** (`unlinkedByFolder`, github#3
  reopened) — same wedge, band, colour, count, filter and highlight as any other note filed
  there, rather than a separate `(unlinked)` population. Off is the escape hatch for anyone
  who wants that population kept visible and separate, same as this repo shipped it
  originally: right-click the `(unlinked)` row (always in the legend, so the toggle never
  needs a trip through settings either direction) or use the new row in the settings panel /
  plugin settings tab. `(unlinked)`'s own colour, when it has members, is no longer in the
  ordinary twelve-slot rotation — it takes the same recessive grey archives do, since neither
  is a folder anyone organised. `(unlinked)` alone now sorts at the very end of the legend,
  past every real folder, matching where a loose note sits in Obsidian's own file explorer —
  greyed out and parenthesised while it holds nothing. `(vault root)` keeps its original
  place ahead of the real folders, so no existing vault's automatic colours shift on
  upgrade.

- **Kept separate is not the same as flat.** A second, independent toggle,
  `unlinkedTintByFolder` (off by default) — a note that's staying in the `(unlinked)`
  population can still take its own folder's colour instead of the flat swatch, the exact
  "mixed color dot" the original reopen comment asked for. Only offered once
  `unlinkedByFolder` is off, since there's nothing left to recolour once every unlinked note
  has already joined its folder. Same right-click row and settings-panel treatment as the
  membership toggle above.

- **A fix to a fix, found while building the above:** the github#34 "hidden by default"
  right-click toggle never actually persisted on the Obsidian plugin host — it repainted the
  view live and silently reverted on the next reload, because the plugin's own settings
  writer was never wired for that setting. Fixed alongside, since the wiring this release
  needed for the new setting was nearly identical.

- **Every generated demo/test fixture now guarantees a handful of genuinely unlinked
  notes**, so the checks this release depends on (and any future one) always have something
  real to measure instead of silently skipping on a vault that happened to link everything.

- **Its own gallery entry** — [`docs/features/unlinked.md`](docs/features/unlinked.md) —
  and its own beat in the demo storyboard, last of all: both toggles here touch colour, so
  it runs after "colours" for the same reason that one used to run last on its own.

- **A link's stroke no longer thickens as you zoom in** (github#39, reported by
  [Angel Bartolli / @bartolli](https://github.com/bartolli), who named the exact cause in the
  issue and offered a working patch branch — the 4px cap is their measurement). Link
  thickness was scaling with the camera exactly the way a note's dot does, which is right for
  a dot and wrong for a connector: a dot is a thing and should hold its proportion to the
  room around it, while a line's thickness is the channel carrying link weight. Zoomed in on
  a well-connected note, its links merged into a solid mass you could no longer trace a
  single connection through — so the one gesture you'd use to look *more* closely at a note's
  connections was the one that destroyed them. Strokes are now capped in pixels and hold a
  constant width below the cap, whatever the zoom, with weight differences preserved. **The
  resting disc is unchanged** — the cap only engages once you're about 2.7x in, and costs
  nothing at all before that.

- **The web of links no longer fogs the middle of the disc** (github#42, found while fixing
  the above). Every link was being drawn at a minimum of 1.7px when the width it actually
  asked for was between 0.55px and 1.02px — a floor inherited from the graph library and never
  set deliberately. One link a pixel too wide is invisible; a few thousand of them sweeping
  through the centre and overlapping at every crossing is a grey haze that veiled the inner
  rings and filled the hub hole. The floor is now 1.0px, which halves the web's ink and leaves
  the disc's centre readable, while still being wide enough that a lone link on a sparse vault
  doesn't thin away to nothing — checked on a 450-note vault as well as a 10,000-note one,
  because those two pull in opposite directions. Hovering and selection look the same, just
  crisper.

---

## 1.8.0 — "The Hub" — 2026-08-27

Four correctness bugs in pin-to-hub, the hub's boundary brought in line with the inner
ring's own geometry, and the demo pipeline stops being able to record the real vault by
accident.

- **Four correctness bugs in pin-to-hub, found in an adversarial review of the
  1.7.0..develop diff.** All four trace back to the feature interacting badly with code
  that predates it or with its own cascade lifecycle: a wedge-split gate counted pinned
  notes that the placement loop right after it excludes, so a folder's sub-wedge split or a
  band's row depth could be decided against notes that never occupy a ring cell; pinning
  every currently-visible note (reachable on a small or filtered vault) hit the
  zero-ring-cells path and left every pinned note unpositioned, verified live by pinning all
  six notes of a solo'd folder; pinning or unpinning while an unrelated cascade was still
  animating could hand the hub change a plan built from stale membership; and `relayout()`
  (the debug API) could reset the layout locks with nothing stopping a still-running
  cascade's next frame from overwriting the reset, the same gap already found and fixed
  once for a since-removed toggle and lost again when that toggle was baked in.

- **The Debug button stopped copying to clipboard in the Obsidian plugin**, found
  live-testing this branch in the real app. `debugDump()` had ended up inside the region
  `scripts/build-plugin.mjs` strips from the plugin build, so it worked in the browser page
  and silently vanished from the installed plugin. Same root cause as `setCompactAxis`
  going missing from an earlier build, caught in the same review pass.

- **The legend's "All" button could turn a folder back on that settings had hidden by
  default.** It cleared every filter unconditionally instead of reseeding the configured
  defaults, so a folder marked hidden-by-default came back the moment someone clicked All.

- **The hub's hit-test and visual boundary now match where the inner ring's own row 0
  actually draws** (github#35, partial). They were sized against the ring's nominal
  radius instead of the ring's own drawn geometry (`INNER_SCALE` pulls row 0 in by a
  fifth), so a folder collapsed to a single row by soloing placed its notes well inside
  what the code still called the hole. Verified live in the real Obsidian plugin, not just
  the browser build.

  A second, related cause is still open: a band's dot-sizing "room" is measured from real
  neighbour gaps with no upper bound, so a band filtered down to one or two notes reports
  an enormous room and balloons its dots regardless of how close they sit to the hub. A
  first attempt capped `room` by the same density ratio that already bounds row spacing
  elsewhere, but that cap applies band-wide and shrank dots in ordinary sparse date
  filtering too, past the point of staying readable — caught by the invariant suite
  ("filtered to the bone, the disc stays drawable" collapsed to diameter/step 0.07-0.12
  against a 0.15 floor) and reverted before this release. The position fix stands on its
  own regardless of the dot-sizing half's fix landing later.

- **The demo recording pipeline could no longer record the real vault by accident.**
  Every feature doc's "regenerate this clip" command builds with no explicit vault, which
  used to resolve `VAULT_GRAPH_VAULT` / `OBSIDIAN_VAULT` exactly like every other tool here
  — on any machine set up the documented way, that's the real vault, and its real note
  titles would have gone straight into a take meant for the public README. The no-URL
  default now builds the synthetic demo vault itself. The demo vault's own history also
  grew from nine years to ten, so the compact date axis has something more convincingly
  historical to compact, and every clip embed switched from fixed-pixel markdown images to
  full-width `<img>` tags — re-encoded at 1200px instead of 700 so a wider column doesn't
  upscale a source that's already too small.

- **Three efficiency and duplication findings, from the same adversarial review.** A
  drag handler wrote hub-drop-target layout on every native `mousemove` — 120+ times a
  second on a decent mouse — with no throttling, unlike an equivalent ribbon-drag handler
  that already coalesced to one update per frame; both now share one extracted helper.
  `focusSet()` was recomputed from scratch on every call despite depending on nothing but
  the current focus id, and is memoized now. Three near-identical duplications — two
  colour-cleaning functions, two settings-save methods, and the three sites building the
  12-swatch colour picker's markup — were each merged into one shared implementation.

---

## 1.7.0 — 2026-08-25

Small folders close and open like the big ones, the seams are geometry rather than
accumulation, the date strip is the only timeline and it finally resizes, and a `--dev`
build draws the wedges it is arguing about.

- **A single-column wedge closes and opens at constant speed, in place.** Toggling a small
  folder off left the wedge visibly failing to close while its notes hopped between rows:
  the drawn arc stood 6.21 degrees above a straight line at 70% of an 11.88-degree close,
  and the one-note folder lost 6.92 degrees in a single frame -- 84x its mean step -- when
  the last fade culled its cell. Every fade ends as a single column, where one note sits per
  row and there is no serpentine left to preserve, so this was every folder's last moment
  and not only a small-folder problem.

  A fully toggled single-cell group's presence now walks one linear ramp, and that ramp
  drives its proportional share, its min-arc floor and its seam together -- three quantities
  that each had their own curve before. A hide spreads its fades across the whole cascade so
  the last one lands where the arc is already zero; a show keeps its natural stagger and only
  its ORDER is ours, outermost note first, so the column materialises from the rim inward.
  Notes shrink with their wedge, through the per-cell room cap rather than as a per-note size.

  Measured: residuals under 0.06 degrees closing and 0.21 opening against a straight line,
  settle delta 0.000 in both directions, and a watched neighbour travels 0.00 to 0.04 degrees
  through a toggle where it used to swing 4.66 degrees out and back.

- **Every seam is a constant-width channel about a radius.** A boundary used to be built at
  each note's own radius, which multiplies out to a line whose distance from the centre is
  `gap(r) * (seams - 0.5 - nB * frac)` -- zero only where a boundary's seam index happens to
  match its share of the circle. Two of nine seams pointed at the centre of the disc and the
  rest missed by up to 101 units, worst just past a folder holding 233 degrees behind a
  single seam. The accumulation is now evaluated once at the band's reference radius and each
  side of it inset by half a seam at the note's own radius: all nine measure 0.

- **A band's seams are measured by its own ruler.** `seamAt` asked `pitchUnits()` for a pitch
  without saying which band, and that answers with the outer one -- so hiding the outer
  ring's folders grew the inner ring's seams from 48 units to 109, for a band whose own
  contents had not moved. The two rings are independent again.

- **Each end note's own dot sets its margin,** so a wedge's ink lands on its boundary and the
  seam is the whole visible channel. `SEAM_ROWS` rises to 0.3 to suit: the outer band's
  channels come out 95 to 96 units with a spread of 1, against 114 to 136 with a spread of 22.

- **A dev wedge overlay,** on by default in a `--dev` build; `?wedges` and `?nowedges`
  override it in any build. Every animation question this release asked was about the
  envelope, and the envelope was the one thing the page never drew -- so each was answered by
  re-deriving the boundary in a probe, in a different angle convention from the placement,
  which is how a note sitting 0.11 degrees off its wedge centre was once measured as 100
  degrees off it. The overlay draws each wedge's two edges in its folder's colour, one white
  dashed centre through its notes, one yellow dotted seam centre, the four band radii
  measured off the dots themselves, a legend and a build stamp. One function serves the
  notes, the overlay and every probe, because the version where the overlay kept its own copy
  of the algebra cost most of a morning.

- **`?rowarc`, off by default.** A wedge holds arc in rows it never reaches -- a one-note
  folder's ten degrees sit empty in every row but one, measuring as a 108- and a 178-unit
  hole against a 12-unit seam. With the flag on, each row shares its circle only with the
  wedges present in it: worst within-row seam spread falls from 238 units to 72 on a 456-note
  vault, 310 to 80 on the demo, 216 to 63 on the 10k. It costs a little motion in a
  neighbouring wedge during a toggle, so it ships behind a flag until that trade is judged.

- **The sidebar's Timeline block is gone; the date ribbon is the timeline.** A rank slider,
  Play and All scrubbed the same history the strip under the band already scrubs -- in a
  different unit, from a panel, while the strip that draws that history sat beside them. The
  slider is deleted and **Refresh is Play**.

  The intro is now that strip's **right-hand handle travelling**, with the same tooltip a
  real drag shows. It is a preview: `state.from`/`state.to` stay null for the whole sweep,
  because writing them per frame would put a hard date cap in `timeFactor` on top of the rank
  ramp the cascade is already animating -- and a range change stops playback, so the second
  reveal would cancel the first. A hand on the handle mid-intro wins.

  Measured on a 948px strip: 24-26 sweeping frames, 0.002 to 1.000 of the strip, **0**
  backwards steps, landing exactly on `x1 === w`. The handle's position comes from the note
  RANK rather than from the span -- interpolating the span linearly would show it in 2020
  while every note from 2026 was already lit, since 409 of 442 notes here fall in the last
  three months. The visible consequence, crossing 0.70 of the strip in the first ~5% of the
  run and then creeping, is this vault's own distribution: both evenly-dated fixtures sweep
  at 0.05-0.06 at the same point.

- **Refresh clears the date range,** which it did not. It claims to clear every filter and
  replay the intro, and it cleared every filter except that one -- so replaying the intro
  through an applied range grew the vault to a slice of itself. Invisible while "the
  timeline" meant the rank slider, which it did reset; the omission became the bug when the
  ribbon became the timeline.

- **The date strip resizes with the window.** It never did. `fitCanvas` pins an inline pixel
  width on the canvas -- it must, since the bitmap is device pixels and the box is CSS pixels
  -- and an inline width beats the stylesheet's `width:100%`, so asking the canvas how wide
  it was returned the width it was last drawn at, for ever. Measured: **1168px in a 668px
  slot, 1168px again in a 1568px one**, every year chip left where it was; and on a page
  whose first measurement ran before layout, the 600px fallback in a 1284px band,
  permanently. The ResizeObserver was wired and firing the whole time and redrew at the same
  stale number, which is why this read as missing resize handling rather than as a stale
  measurement.

  Measuring now drops the inline width, reads the box the stylesheet gives and puts the
  inline width back, so it has no side effect -- and it runs from the draw path and the
  observer only, never from a pointermove. The observer guards on the width actually having
  changed, which both saves a redraw per band reflow and breaks the loop that drawing into an
  observed element would otherwise create. All three vaults now track their slot to within
  1px at every width.

- **"Mark today" is gone; click the band's today column instead.** It answered "which notes
  were written today" from the sidebar, by a second predicate, while the band drew the answer
  -- and it is the one that got the predicate wrong twice, first matching nothing and then
  matching 111 files a folder rename had touched. Clicking the last cell of the grid marks
  exactly the notes that cell counted.

  The **fill treatment came with it**: a picked day's notes take `--today`, the neutral
  extreme that is deliberately not a group hue, on top of the halo they already had. Gated on
  the picked day and **not** on the hovered one -- recolouring a year of notes as the pointer
  crosses a label is far too loud, so a hover asks and a click chooses. Two `smoke.mjs` checks
  went with the button, replaced by one that follows the fill to where it lives.

- **The demo storyboard is ordered by impact, and the hero is re-recorded.** It ran roughly
  in the order the features were built: the intro, two hovers, the legend, the colour picker,
  the camera, and the date ribbon LAST. A README hero is watched for a few seconds before the
  reader decides whether to keep watching, so a preference panel was landing before the point
  of the tool. The acts now run: the vault growing, one note, the timeline, the heatmap,
  folders, subfolders, the camera, colours -- with two orderings kept for structural reasons
  rather than editorial ones, both noted in the storyboard.

  Three beats added, for features that had never been on camera. The intro's own beat now
  shows the ribbon handle sweeping, since that is what it does. The **year chips** get hovered
  and clicked -- a new `["year", "busiest"]` target, which picks the fullest year that has a
  chip, because below about 20px of pitch only every other year is named and the fullest one
  may have no button to aim at. And a **heatmap day gets clicked**, which is what replaced
  Mark today: the busiest day rather than today, since today is allowed to hold no notes and a
  beat that marks nothing reads as a mis-click.

  58 beats, 100.6s. `assets/demo.webp` is **10.6 MB** against the previous 3.2 MB, and that is
  a deliberate call rather than an oversight: the take it replaced was 34s from 2026-08-22,
  while the storyboard had already grown to ~87s before this release touched it, so the hero
  had been stale for two releases. The size is clone weight, which is the one thing size costs
  here -- see the note in `make-hero.ps1`.

- **The year chips read as part of the strip.** They sat 8px below the ribbon and 9px above
  the band's own border, and drawRibbon paints a full-width 2px rail for the window pill
  along the canvas's bottom edge -- so that line read as the bottom of the timeline section
  and the chips fell outside the control they label. Reported from the Obsidian pane and
  measured **identical in both hosts**, which is what ruled out a host-specific cause: 8px
  above and 9px below in each. Now 1px above against 9px below, so the grouping cannot be
  misread, and the band is 7px shorter. Pinned as a ratio rather than as pixel values, so a
  padding change cannot fail the check while the grouping is still right.

- **The directory's linter passes on `src/page.js`, which nobody had ever run it against.**
  `eslint.config.mjs` lists `src/page.js` in its `files`; `npm run lint` passed
  `plugin/**/*.js`. The config covered the exporter and the script never handed it over, so
  the community check found six errors nothing local had ever reported. The script now lints
  what the config covers, which is the actual fix -- the rest is the backlog it had
  accumulated:

  - **A `cssText` assignment and four `style.display` assignments** on the `--dev` wedge
    overlay. The rule was right about all five: the box is static, so it is a class in
    page.css now, and showing or hiding uses the `hidden` attribute the tooltips in this file
    already use, with an explicit `[hidden]` rule rather than relying on the UA stylesheet.
  - **`style.width = ""` in `measureRibbon`.** An empty string is a static value; the DOM has
    `removeProperty` for "unset this", which also says what is meant.
  - **`innerHTML` on the year chips.** Every value in that string came out of `dateSpan` and
    was a number, so nothing could have been injected -- but the safety rested on an argument
    about where the inputs came from, made in one comment and checked nowhere. Built as
    elements now, so the question is out of reach rather than answered.
  - **Two `var DOC` declarations, the first dead.** `root.ownerDocument` ran second and won,
    so `deps.doc` was never consulted and the substitutability its own comment describes did
    not exist. One declaration, deps first, behaviour unchanged in both hosts.
  - **`room` declared twice as two different quantities**, kept apart by nothing but statement
    order: the closure that reads it is called on the line above the second declaration, so it
    saw the band room while everything below saw the arc cap. Moving that call one line later
    would have changed every seam margin silently. Renamed, so the behaviour is identical.
  - **The Debug button's clipboard fallback logged to the console.** That rule is on the
    preset's restricted-disable list, so a waiver is itself an error -- correctly, since the
    console is shared with every other plugin. It saves a `.json` instead, which is the better
    answer anyway: this path exists for a `file://` page outside a secure context, where a
    bug report is hardest to collect, and a file beats a dump somebody has to select by hand.

Nothing here changes what a note means or where a folder sits: the two-band split, the
serpentine and the colours are untouched, and so is the reveal itself -- notes still arrive
oldest-first over the same clock. What changed is which control says so, and that it now
says it at any window size.

---

## 1.6.1 — 2026-08-23

The files Obsidian installs were missing from 1.6.0's release, so nobody could install it.

- **`main.js`, `manifest.json` and `styles.css` are attached to the release again.** Obsidian
  downloads those three directly from the release assets and never opens the zip — the
  directory's scanner says as much, "All other files will not be downloaded by Obsidian" —
  so 1.6.0 going out with only `vault-graph-1.6.0.zip` was a release nobody could install
  or update to. It failed the automated review on exactly that: *the release 1.6.0
  specified in `manifest.json` is missing the `main.js` file*, and the same for
  `manifest.json`.

  The cause was narrow. `release.ps1` only ever passed the zip to `gh release create`, and
  the releases before this were cut **by hand** — where attaching the loose files is simply
  what one does. 1.6.0 was the script's first real run, which is the first moment the
  omission could show. The script attaches all four now and **refuses to publish** if any of
  the three is missing, rather than producing another uninstallable release.

- **`clip-path` swapped for `clip` in the screen-reader-only rule.** The directory's CSS
  lint flags `clip-path` as only partially supported by Obsidian 1.6.5. This plugin's floor
  is 1.7.2 so nobody was affected, but a warning that needs a paragraph of explanation is
  worse than the one-line alternative — and `clip: rect(0 0 0 0)` is what every
  screen-reader-only helper has used for twenty years.

Nothing else changed: no behaviour, no layout, no colours. 1.6.0's assets were repaired in
place as well, so that release is installable too; this one exists so the fixes are in a
tagged commit and the directory has a release to review.

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
  and close — plus two that hover a folder and a subfolder from the legend. The swatch beat
  aims at a real 15px target through CDP hit-testing, so it fails if the swatch is covered
  or scrolled away. The run is 29 beats and ~50s, up from 20 and ~30s.

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

The invariant suite is 19 checks now and passes on both vaults.

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

- **Hover comes back when you return to a note.** Move the pointer off the graph and back
  onto the same note and it stayed dark — Sigma's `handleLeave` emits `leaveNode` without
  clearing the node it just said you left, so the re-entry test never fires. `handleMove`,
  two lines earlier in the same bundle, always did it correctly. Patched at read time
  alongside the network calls; measured 1 hit in 40 before, 40 in 40 after.
- **The invariant suite is trustworthy again**
  ([#7](https://github.com/luke321/vault-graph/issues/7)). It had been failing on clean
  trees, which is the failure that teaches people to re-run instead of read. Two causes,
  and neither was the one the symptoms suggested. The hover bug above accounted for the
  three pointer checks. The rest was the suite racing **itself**: it launched Chrome on a
  constant port, so a second run silently attached to the first one's browser and measured
  the wrong page — a 13-folder vault reporting 60 legend rows, a 454-note vault hovering
  node 492. Each run now takes a free port from the OS, asserts the page it attached to is
  the one it just built, tears the browser down by whoever actually holds the port, and
  checks frames are arriving before measuring anything downstream of one. Two suites can
  now run at once, which is what the constant port had quietly forbidden.

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
