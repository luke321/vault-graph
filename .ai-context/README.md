# .ai-context

Context for whoever picks this up next — human or model. Read this folder **before**
changing the layout or the animation.

| File | What it is |
|---|---|
| `architecture.md` | **Start here.** The two producers, the shared contract, the four stages, the build entry points, and the gate list |
| `animation.md` | How a cascade works: the two packings, which quantities are walked between them, and the one invariant. Read before touching the cascade, the seam, dot size or plan membership |
| `invariants.md` | Properties that must not regress, and the command that checks each one |
| `changelog-detail.md` | The measurement behind every change, dated, with the numbers on both sides of it. **This file is the regression suite** — a change to how the disc looks or moves adds a row here |
| `perf-cascade-frame-cost.md` | What an animated frame costs on a 10k vault, term by term; what was taken out of it and what is left (github#19). Read before optimising the cascade, and before believing anything about `renderer.refresh`'s options |
| `releasing.md` | How a release is cut: enumerating the range, what must be finished on `release/<version>` before anything merges down, and why a tag is never edited after the fact |
| `locking.md` | Why `scripts/lock.mjs`'s two lock names (`screen-*`, `suite`) stay separate rather than aliased, the deadlock that proved it, and the github issues behind each (github#87, github#92) |
| `obsidian-trust-mode.md` | Why a vault Obsidian hasn't trusted opens in restricted mode and reads as a broken plugin, and the CDP workaround every harness uses |
| `decisions/` | **ADRs** — structural choices, what they cost, and what was rejected |
| `design/` | **DDRs** — the as-built design of each part of the disc |
| `mobile-harness.md` | `scripts/mobile-check.mjs`: the page at a phone's viewport with real touch, why the run needs a desktop control column, and the four ways the harness measured the wrong thing first (github#73) |
| `live-growth-harness.md` | `scripts/live-growth-check.mjs`: the live rebuild driven against a vault that is actually growing under it (github#72) |
| `awaiting-a-page-promise.md` | Why a check that samples over time must use `p.eval` and not `p.j`, what the transport's 10s ceiling does and does not bound, and the two bounds a ride carries instead (github#179) |
| `finding-notes-touch-mid-cascade.md` | The long-form investigation behind the mid-cascade dot-size finding — kept because the method is the point, not just the answer |
| `vault-findings.md` | What the graph revealed about the vault it was built for — observations, not decisions |
| `code-map.md` | **Generated** (`node scripts/code-map.mjs`): sections and functions of `src/page.js` and `scripts/smoke.mjs` with line numbers. Open the range, not the file |
| `code-index.md` | **Generated**: issue → code sites, ADR/DDR → code sites, invariant → check, `__vg.*` → callers |
| `release-notes-*.md`, `verification-2.0.0.md`, `manual-test-1.9.0.md` | Per-release archives. History, not current design — read them for what a release measured, not for how anything works now |

### ADRs — `decisions/`

**Two records share the number `0011`**, and two DDRs share `0018`. They are listed here by
their full filename stem for that reason — a bare `decisions/0011` names either one, which is
also why `code-index.md` lists both records' code sites under a single row. Renumbering would
break the `decisions/NNNN` pointers in `src/page.js`, `plugin/main.js` and the scripts, so the
numbers stay and the index spells them out.

| | |
|---|---|
| `0001-one-plan-basis` | Why there is one planner and no `REPACK_BELOW` threshold |
| `0002-smooth-the-row-tick-dont-remove-it` | `RADIAL_EASE`, and the continuous-radius approach that was reverted |
| `0003-converge-before-settling` | Watchdogs never deadlines; converge before `settle()` |
| `0004-only-named-subfolders-are-pushed` | Which subfolders may move radially, and the geometry that rules the rest out |
| `0005-vault-agnostic-source-in-repo-output-in-vault` | Nothing about a vault is hardcoded; source here, output in the vault |
| `0006-zero-weight-members-must-cost-nothing` | Why a fading note must change nothing, and the gap count that broke it |
| `0007-the-demo-drives-real-input` | Why `?demo` clicks through CDP and not `el.click()`, and the cursor that was removed |
| `0008-zero-network-calls` | **Superseded by `0012`.** Why the vendored bundles were stripped at read time rather than patched, forked or disclosed — the promise still holds and `check-network.mjs` still gates it, but the bundles it stripped are gone |
| `0009-the-host-persists-settings-not-the-page` | Settings go in and come back out; the page stores nothing, and only one host gets a gear |
| `0010-one-browser-per-run` | Why the suite takes a free port per run, and how a lost race read as a flaky renderer |
| `0011-a-live-rebuild-retakes-the-geometry-lock-at-rest` | Where the geometry lock's step goes when the note set changes, and the two routes rejected (github#72) |
| `0011-band-state-is-a-keyed-descriptor` | Why every layout quantity is per band, the pairs-of-scalars shape it has instead, and what a keyed descriptor would buy |
| `0012-own-graph-store-and-renderer` | Replacing the two vendored minified bundles with our own TypeScript store and renderer: what was actually used of each, and what that bought (github#58) |
| `0013-a-tree-is-gated-once` | A green full suite run stamps the git tree it measured; the hook and `release.ps1` skip a stamped tree, and why not by commit, by time or by `SKIP_SMOKE` (github#93) |
| `0014-a-pin-names-its-note-not-its-position` | Why a pin is stored by the note's path: an id is a position, and a position only holds while the input order does (github#143) |
| `0015-mirror-the-explorer-not-its-api` | Why the file-explorer order is parsed from the sortspec text, which subset, and why it falls back loudly (github#71) |
| `0016-the-suite-runs-headless-but-nothing-requires-it` | Why headless is a flag and never sniffed, why the lane seam is github#113's `clock`, why the screen lock is skipped rather than excepted, and why the soak measures the spread before anything becomes a required status (github#155) |

### DDRs — `design/`

| | |
|---|---|
| `0001-layout-the-disc` | Wedge angles, rows, and why density is a fixed unit |
| `0002-reveal-cascade` | The animation, and every discrete step that had to be removed |
| `0003-subfolder-differentiation` | Tint slots, the pooled tail, the four-step ladder |
| `0004-group-colours` | Twelve slots, cycling, pickable per folder; archives out of the rotation |
| `0005-labels-and-edges` | Which notes get labels; edge curvature around the hub |
| `0006-groups-navigation` | The sidebar: eye vs label, three selection channels |
| `0007-timeline` | Oldest-first reveal, linear in note count |
| `0008-logo-and-favicon` | Two sources for two jobs |
| `0009-theme` | Dark by default, the theme button, and both palettes defined explicitly |
| `0010-heatmap` | The band above the disc: which date, and why no colour is an average |
| `0011-per-frame-dot-size` | **Shipped in 2.0.0** as the view setting *Size dots from the frame*, on by default (github#41): dots capped from the drawn frame, and where that stands against the two-resting-sizes law |
| `0012-hop-trail` | **Implemented** on Route 2 (github#40): a way back along the linked-notes walk — hops only, grey clickable crumbs, a cap that keeps the origin. Written as a concept against the 2.0.0 tree; the keyboard half is superseded inside the record |
| `0013-touch-input` | Touch: one finger pans, two pinch, a tap selects and does the hover's job; the phone's two panels, and why picking needed a second floor (github#73) |
| `0014-live-rebuild` | How the disc follows the vault while the view is open: the diff, one construction not two, and how each law survives an edit (github#72) |
| `0015-grouping-dimensions` | Folders or tags: the filing that replaced three attribute reads, what a multi-tag note does, what the untagged bucket is, how a switch draws both discs, and the one-dot-per-tag experiment that came out as github#91 (github#86) |
| `0016-update-note` | The strip that says what changed, once, after a MINOR or MAJOR update: one hand-written text file the build inlines, the decision table (fresh, patch, minor, seen on dismiss), why it is text and capped, and why the page never knows it is there (github#83) |
| `0017-the-overview` | The schematic beside Fit: shown only while the disc is cropped, why containment rather than the camera ratio decides that, and why the footprint is never clamped (github#79) |
| `0018-gallery-new-in` | The generated "New in <version>" line above the gallery's nav table: which features count as new, and why the strip is built rather than written (github#127) |
| `0018-not-stealing-the-keyboard` | Why a harness run used to take the keyboard, why the screen lock never addressed it, and the three things counting activations changed about the fix (github#129) |
| `0019-two-readings` | The sidebar's two readings, Groups and the selected note: what the floating card covered, the four prototypes measured against it, why tabs won, and why the panel is a plain wrapper (github#80, github#131) |

**ADR or DDR?** An ADR is a choice with alternatives that were weighed and one that won —
it explains *why not the other thing*. A DDR describes how a part actually works and the
measurements that shaped it. If you are about to change behaviour, the ADR tells you what
you would be giving up; the DDR tells you what you would be breaking.

## Why this folder exists

This project has been broken and re-broken by **reasoning about the code instead of
measuring it**. Every hard bug here has had the same shape: a plausible explanation that
was wrong, fixed confidently, then a new symptom. On 2026-08-22 three consecutive
"fixes" each addressed a real mechanism and each missed the actual cause, because the
real cause was a number nobody had looked at.

The habit that works: **serve the built page, drive it, and read the numbers.** Most of
that is now one command — `node scripts/smoke.mjs` runs every invariant that can be
checked automatically and prints what it measured. What it cannot cover, it says so.

It runs itself before a push **to `develop` or `main`**, once per clone:

```bash
git config core.hooksPath .githooks
```

A feature-branch push runs nothing and proves nothing — gating a branch nobody has asked to
merge yet is an unearned ten minutes, so the hook scopes itself out and says so. Use
`node scripts/smoke.mjs --only <substring>` while iterating instead.

`SKIP_SMOKE=1 git push` when you mean to skip it — there are honest reasons to, and the
alternative habit (`--no-verify`) silently disables every other hook too. It reaches **only
the suite**: the fourteen checks the hook runs ahead of it have no skip flag, deliberately,
because what most of them prevent is damage to somebody else. `architecture.md` lists them.

By hand, for the rest:

```powershell
# from the repo
python -m http.server 8765          # file:// blocks some tooling; http does not
```

Then in the page's console:

```javascript
__vg.checkPlanParity()   // static and live plans must agree, cell by cell
__vg.probe(true)         // record per-frame radial extent, then toggle a folder
__vg.probeReport()       // biggest single-frame step per band -- "a jump" is a big one
__vg.pushReport()        // what is actually pushed vs haloed right now
__vg.radialEase = 0.35   // live knobs; also timeScale, subGap, edgePadArc, edgePadMax
__vg.relayout()          // re-derive locked geometry after changing a spacing knob
```

## The rule

If a change is about how the disc **looks or moves**, it needs a number before and after.
The changelog entries carry those numbers on purpose — they are the regression suite.
