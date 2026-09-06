**Own Engine.** The disc is drawn by the plugin's own code now, and the release comes with a measured promise: nothing on screen changed by accident. Four things changed on purpose, one new setting is on, and Obsidian gets to the disc faster.

### Size dots from the frame

![Hiding a folder and showing it again: the wedges reallocate, and while the rows slide every dot is held to the room it actually has on the frame being drawn](https://raw.githubusercontent.com/luke321/vault-graph/develop/assets/features/folders.webp)

Every rule that sizes a dot used to describe the layout the disc was heading for. While a cascade walks, that is not where the dots are, so rows that ticked while their spacing slid could fuse for a moment. Each dot is now also capped at just under half its distance to the nearest visible note, measured on the frame being drawn. The disc at rest is unchanged, pixel for pixel; a walking dot may be held below its resting size, never above. New view setting **Size dots from the frame**, on by default; `?nofit` turns it off on the exported page.

### The date strip ends on a day the vault has reached

![Dragging the range handles and sliding the heatmap window along the strip of months](https://raw.githubusercontent.com/luke321/vault-graph/develop/assets/features/timeline.webp)

The month in progress used to draw at its full width and run to a calendar day in the future, so the range handle could be dragged into days that had not happened. It now takes only the share its elapsed days have earned; the readout, the `to` field and the strip's right edge all name a real day.

### One width for every link

![A note hovered: its links light up, the rest of the web dims](https://raw.githubusercontent.com/luke321/vault-graph/develop/assets/features/note.webp)

Link thickness used to ramp with link weight, a channel that was legible in one zoom state of four and had almost nothing to show. The stroke is one constant now; lit links stay wider than resting ones, and the zoom cap finally reaches, so a lit link stops at 4 px however far you zoom in. Weight survives as data in the tooltip and the card.

### Obsidian: the disc, sooner and cleaner

The view mounts before it counts words: on a normal start of a 10,000-note vault the disc appears in one second instead of nearly three, and the counts arrive while the intro plays. Closing the view no longer leaks it (six close-and-reopen cycles hold DOM, listeners and heap exactly). Search-hit and hover labels follow the theme. The settings appear in Obsidian 1.13's settings search. A folder soloed down to one note draws that note at a sensible size.

### Under the hood, and how it was checked

The two vendored libraries are gone; a graph store and a WebGL renderer written for this disc replace them, and `main.js` is 40 % smaller. The picture was compared against 1.9.0 on three fixtures, in eight states, at five camera ratios, in both themes, at two pixel ratios and two window sizes, plus every merge in between as a chain: every differing pixel is one of the changes above, and two engine defects the comparison found (a hover floor for sub-pixel dots, a heatmap band that kept stale tiles after a fade) were fixed before release. The record is [`.ai-context/verification-2.0.0.md`](https://github.com/luke321/vault-graph/blob/develop/.ai-context/verification-2.0.0.md).

Every asset on this page was built on GitHub's runner from the tagged commit and carries a build provenance attestation; check one with `gh attestation verify main.js --repo luke321/vault-graph`.

**Why 2.0.0:** the exporter now needs a clone with `npm ci`, and the release no longer attaches its zip. Installing or updating the plugin through Obsidian is unaffected; no setting changes meaning.

---

## 2.0.0 — "Own Engine" — 2026-09-06

The picture is now drawn by code of our own. The two vendored libraries that painted every
release until 1.9.0 are gone, replaced by a graph store and a WebGL renderer written for this
disc and nothing else — measured to draw the same picture, pixel for pixel, on every fixture
and in every state the comparison harness can put the page in. **Nothing changes on screen
by accident**, and the four things that do change on purpose are listed first.

**Why a major version.** Two things about *invocation* changed, and the versioning table says
that is what MAJOR is for. The exporter (`src/build-graph.mjs`) now compiles the engine with
esbuild, so running it needs a clone with `npm ci` rather than the bare Node it needed before;
and the GitHub Release attaches only the plugin's three files — the exporter's zip is no longer
part of a release. Installing or updating the plugin through Obsidian is unaffected, and no
setting changes meaning.

### What changed on screen, on purpose

- **Every link is the same width** (github#43). The stroke used to ramp with link weight, a
  channel that was legible in one zoom state of four and had almost nothing to show — around
  99% of links in every fixture weigh 1. Weight survives as data (the tooltip and the card
  still report it); the stroke is one constant, lit links stay wider than resting ones, and
  github#39's zoom cap now reaches, so a lit link stops at 4px however far you zoom.

- **The month in progress draws only the days it has lived, and the date strip ends on a day
  the vault has reached** (github#51). The strip's last slice used to be the current month at
  its full width, running to a calendar day in the future that the range handle could be
  dragged into with no effect on the disc. The last month now takes only the share its elapsed
  days have earned, `to` and the readout name a real day, and the linear axis's bars and its
  handle agree to the day.

- **A folder soloed down to a single note draws that note at a sensible size** (github#53). A
  band holding one visible note had an *empty* room pool, which read as zero room and shrank
  the dot to under a pixel — smaller for having been given the whole ring. Unmeasured room is
  unmeasured now, and the dot takes the size the hub cap allows.

- **Search-hit and hover labels follow the theme.** The renderer was handed the label colour
  once, at construction, so a plugin theme switch recoloured every dot and edge and left forced
  labels white on the light theme. Found while verifying the engine (github#58), fixed on the
  page side.

### The engine (github#58, decision 0012)

- **Our own graph store and renderer, in TypeScript**, replace `graphology` and `sigma`, which
  had been vendored as minified bundles without a recorded version and patched twice by regex
  at build time. The store is a keyed attribute bag with degree; the renderer keeps WebGL for
  nodes and edges (its four programs are ports of sigma 3.0.2's — the MIT notice rides in
  `main.js` and in every exported page) and Canvas 2D for labels and hover pills. `main.js`
  shrinks by about 40%, nothing under the community directory's linter is someone else's
  code any more, and the two build-time patches are gone with the bundles.

- **Verified rather than trusted.** `scripts/render-diff.mjs` builds every fixture and compares
  the engine's picture against pages built from earlier commits: node positions and drawn
  radii to a millionth of a pixel, the composited layers pixel by pixel, edge ink, the set of
  drawn labels, and screenshots of the stage, the whole page and each overlay — at rest, in a
  search, after a folder solo, a hidden folder and a date range, with a note hovered and a note
  clicked, at the landing frame of a cascade, in both themes, at pixel ratio 1 and 2, on two
  window sizes and five camera ratios. The 2.0.0 comparison against 1.9.0 is recorded in
  [`.ai-context/verification-2.0.0.md`](.ai-context/verification-2.0.0.md); every difference it
  found is one of the four changes above.

- **Two behaviours differ by construction and were decided before the port**: picking is by
  geometry (the nearest drawn dot within its radius, the last-drawn winning) instead of a
  half-resolution colour buffer, so a hover lands exactly where the dot is; and the label
  density grid is gone, so the occasional plain label it drew for a hovered note during the
  first half of the hover ramp is gone with it. Everything else — gestures, camera, inertia,
  the double-click, drag thresholds, event order — was checked against sigma's source and
  behaviour and matches.

- **Three defects found while verifying, all fixed**: a device-pixel-ratio change at a
  constant size (a popout window carried to a monitor with another scale factor) left the
  canvases at the old ratio; a settings change or window resize could fire one spurious
  hover-leave; and the label colour above. And the MIT notice, which the build had been
  dropping.

- **A tiny dot can still be hovered.** Found by the release comparison: the pointer reaches
  the page in whole pixels, and the engine's exact hit test let a dot drawn under about a
  pixel and a half of radius — a hub note on a 10k vault zoomed out, or any note in a small
  window — be hovered only when its centre happened to sit near a pixel corner, where the old
  colour-buffer picking had a wider catchment. Within a pixel and a half of a miss the nearest
  dot now wins; a hit inside a dot is unchanged.

- **The heatmap band no longer keeps a faint tint from notes that have faded out.** Also found
  by the comparison, and older than the engine: the band skipped repaints whose quantised
  counts had not moved, so the last steps of a fade never repainted and a hidden folder's days
  stayed faintly coloured. The band now repaints whenever a day's count leaves zero or returns
  to it, and once more on the frame a cascade lands.

### Obsidian

- **Closing the view no longer leaks it** (github#62). Every view close, popout and Refresh
  used to retain a whole mount — its document listeners, its resize observers, its
  animation frames, and on a 10k vault about seven megabytes — and a mount torn down
  mid-intro kept animating a cascade into a dead renderer for three seconds. The mount has a
  `destroy()` now; the plugin's teardown calls it, and six close-and-reopen cycles hold the
  load baseline. `scripts/teardown-check.mjs` measures it on the standalone, and the new
  `scripts/obsidian-smoke.mjs` measures it inside a real Obsidian.

- **The view mounts before it counts words.** Opening the graph in Obsidian used to wait
  for every note's body to be read so the tooltip could say how many words it has, and on a
  normal start — the metadata cache restored from disk, the files not yet read — that was
  most of the wait: on a 10,000-note vault the disc appeared in 1 second instead of 2.8. The
  counts are read after the mount and arrive while the intro plays; nothing else uses them.

- **The plugin builds its notes in the exporter's order**, so the same vault draws the same
  disc in both hosts. Measured inside Obsidian: 0 of 10,002 notes out of place against the
  exporter's build.

- **The settings appear in Obsidian 1.13's settings search** (github#59). The tab is built
  from `getSettingDefinitions()` — the four build toggles, a View group and the folder-colour
  picker — with the imperative `display()` kept for 1.7.2 through 1.12, both from the same
  tables so the two cannot drift. `minAppVersion` is unchanged.

- **Two of the directory's CSS and API lint findings** are gone: the automatic-slot marker
  under a swatch is two gradients instead of a `clip-path`, and the engine creates its
  canvases through the host's `createEl` when there is one.

- **`scripts/obsidian-smoke.mjs`**, opt-in and standalone, runs the checks the exporter cannot:
  a throwaway vault built from a fixture, the plugin installed the way a release installs it,
  a separate Obsidian instance driven over its debugging port — the view opens with no
  console errors, its layout matches the exporter's build of the same vault, hover, click,
  right-click and double-click land, six close-and-reopen cycles grow nothing, Refresh
  rebuilds in place, a theme switch recolours labels, the settings tab renders from its
  definitions and round-trips a toggle, and the view mounts in a popout window. It also
  prints where the time goes between opening the view and a resting disc.

### Animation

- **An animated frame on a 10k vault costs about a quarter less** (github#19, still open):
  four pieces of per-frame work whose only product was discarded are gone — the renderer's
  reaction to bulk position writes, a graph walk into a value nothing read, a membership test
  applied twice, and a doubled reducer pass. The re-plan every frame stays; that is the design.

- **New, on by default: Size dots from the frame** (github#41, design record 0011). Every
  other rule that sizes a dot describes the layout the disc is heading for; while a cascade
  walks, that is not where the dots are, and rows that tick while spacing slides can fuse. Each
  dot is now also capped at just under half its distance to the nearest visible note, measured
  on the frame being drawn, so dots stay apart while rows slide. Off in Settings › Vault Graph ›
  View, or `?nofit` on the exported page. The disc at rest is unchanged on every fixture and the
  golden snapshots are byte-identical either way; after a folder hides, the tightest pair on a
  small vault can end a hair smaller. It bends one law's spirit: a walking dot may be held
  *below* its two resting sizes, never above — `CLAUDE.md` and `invariants.md` say so, and a
  second suite check walks a solo with it on. A hovered **only** chip also stopped highlighting
  its row, so the highlight cannot ride the cascade the click starts.

- **Soloing a small folder no longer balloons the departing notes** (github#66). Two walked
  quantities kept their ratio only while their ends were proportional; a dot is now held to the
  larger of its two resting sizes for the length of a cascade.

- **Switching a solo from one folder to another no longer flickers the arriving notes**
  (github#67). Each note's fade delay is decided once, from positions that stand still, rather
  than re-sorted every frame by positions that were moving.

### Exporter and repository

- **The exporter writes to the vault root by default** (github#64). Its default output was a
  folder name from the vault it was written for, which no vault is required to have and which
  it did not create, so a bare `refresh-graph.ps1` failed with ENOENT. `--out` is unchanged.

- **The release is plugin-only, and published from a workflow with attested assets**
  (github#10). `release.ps1` is the local half — the gates, the tag, the push — and
  `.github/workflows/release.yml` builds `main.js`, `manifest.json` and `styles.css` from the
  tagged commit on the runner, attests them with GitHub build provenance and creates the
  Release. Anyone can check a downloaded file with `gh attestation verify main.js --repo
  luke321/vault-graph`; the directory's review had recommended this on every release since
  1.5.2. The exporter's zip is no longer attached (the scanner called it an extra unsupported
  file); the exporter, the standalone page and the fixtures stay in the repo, where the
  invariant suite drives them. A `dry_run` dispatch rehearses the whole publishing half on a
  branch without creating a Release.

- **Everything we ship is typed and lint-gated at zero** (github#55, github#60). The plugin,
  the page, the exporter and the scripts pass typescript-eslint with the five `no-unsafe-*`
  rules the directory applies as errors — from 6,977 findings to none, with two real defects
  found on the way — and the engine compiles under `strict`. The gate runs in the pre-push
  hook and in `release.ps1`.

- **The repository is navigable without reading 8,000 lines** (github#61). `CLAUDE.md` at the
  root states the laws and where things are; `.ai-context/code-map.md` and `code-index.md`
  are generated from the source and checked for staleness on every push; and every comment in
  the shipped code is a pointer to an issue or a design record, with the reasoning in
  `.ai-context/`.

- **The suite** gained checks for the four changes above and for github#66 and github#67,
  stopped asserting on a foreshortened year and on a two-day squeeze window (github#65),
  pins the 10k fixture's end date so its golden snapshot stops ageing out, and aims its hover
  checks only once the camera is still (github#63).

---
