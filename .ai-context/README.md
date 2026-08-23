# .ai-context

Context for whoever picks this up next — human or model. Read this folder **before**
changing the layout or the animation.

| File | What it is |
|---|---|
| `architecture.md` | The pipeline, the data shapes, and where each decision is enforced |
| `invariants.md` | Properties that must not regress, and the command that checks each one |
| `decisions/` | **ADRs** — structural choices, what they cost, and what was rejected |
| `design/` | **DDRs** — the as-built design of each part of the disc |
| `vault-findings.md` | What the graph revealed about the vault it was built for — observations, not decisions |

### ADRs — `decisions/`

| | |
|---|---|
| `0001-one-plan-basis` | Why there is one planner and no `REPACK_BELOW` threshold |
| `0002-smooth-the-row-tick-dont-remove-it` | `RADIAL_EASE`, and the continuous-radius approach that was reverted |
| `0003-converge-before-settling` | Watchdogs never deadlines; converge before `settle()` |
| `0004-only-named-subfolders-are-pushed` | Which subfolders may move radially, and the geometry that rules the rest out |
| `0005-vault-agnostic-source-in-repo-output-in-vault` | Nothing about a vault is hardcoded; source here, output in the vault |
| `0006-zero-weight-members-must-cost-nothing` | Why a fading note must change nothing, and the gap count that broke it |
| `0007-the-demo-drives-real-input` | Why `?demo` clicks through CDP and not `el.click()`, and the cursor that was removed |
| `0008-zero-network-calls` | Why the vendored bundles are stripped at read time rather than patched, forked or disclosed |

### DDRs — `design/`

| | |
|---|---|
| `0001-layout-the-disc` | Wedge angles, rows, and why density is a fixed unit |
| `0002-reveal-cascade` | The animation, and every discrete step that had to be removed |
| `0003-subfolder-differentiation` | Tint slots, the pooled tail, the four-step ladder |
| `0004-group-colours` | Ten slots, fixed order, stable as the vault grows |
| `0005-labels-and-edges` | Which notes get labels; edge curvature around the hub |
| `0006-groups-navigation` | The sidebar: eye vs label, three selection channels |
| `0007-timeline` | Oldest-first reveal, linear in note count |
| `0008-logo-and-favicon` | Two sources for two jobs |
| `0009-theme` | Dark only |
| `0010-heatmap` | The band above the disc: which date, and why no colour is an average |

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

It runs itself before every push, once per clone:

```bash
git config core.hooksPath .githooks
```

`SKIP_SMOKE=1 git push` when you mean to skip it — there are honest reasons to, and the
alternative habit (`--no-verify`) silently disables every other hook too.

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
