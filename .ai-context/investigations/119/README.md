# #119: stale-report audit and proposed scope

2026-10-03. **Audit only; product implementation awaits design approval.**
No packing, palette, dot-size, camera, golden, or browser-harness changes.

## Pinned comparison and evidence levels

| Input | Immutable revision |
|---|---|
| Local develop / worker base | `e8995f1c72e32a139693699ab4c659943593a699` |
| Active #186 comparison | `1a5cee193797f3b2465bc90151990c7cc7581fcb` |
| Common ancestor | `a1b5206f40be8df1711c21e88e512e8c361ecfd4` |

These branches diverge: 35 commits exclusive to develop, 56 exclusive to the comparison.
A whole-tree diff is not a list of #186's changes. Read the pinned blobs and relevant
history instead. The active checkout and its uncommitted work were not inputs and were
not modified. Later #186 work is explicitly outside this report.

Three evidence levels below must remain separate:

1. **Executed now:** immutable source functions in Node VM contexts, generated fixture
   assignments in memory, and arithmetic on the issue's rounded numbers. Output is
   [measurements.json](measurements.json); the assumptions are embedded alongside it.
2. **Historical measurement:** committed #186 run data and issue comments, reanalysed
   here but not rerun. They are not test results for `1a5cee1`.
3. **Not tested:** the current page's pixels, final layout, animation, filtering, resize,
   interaction, golden parity, or a bucket prototype. Browser work remains deferred
   behind #186. No full suite was run.

Reproduce from the repository root, with existing npm dependencies:

```powershell
powershell.exe -NoProfile -File .ai-context/investigations/119/audit.ps1 -Write
```

The PowerShell wrapper reads only the two named commits with `git show`, passes a
temporary blob bundle to Node, then removes that temporary file. The probe executes
the fixture generator's assignment section before any filesystem operation. It
extracts actual functions through TypeScript's parser, rather than transcribing their
formulas. No generated vault or built product page is committed.

## What is stale, and what remains

| Issue | Local develop | Pinned #186 | Disposition |
|---|---|---|---|
| #119 | Mixed-name fixture and #117 room-aware balancing already exist; tiny groups remain unmerged | Same tail and ring-count mechanism in the isolated rest planner; band-median dot sizing removed | Keep open. Old diagnosis and numbers need replacement, not dismissal of the tail problem |
| #118 | Grey-by-sort half fixed by `7eeda819`; ten automatic hues still repeat | Same colour assignment and CSS | Keep open for the deliberate collision/identity decision |
| #132 | Issue compared inner content to unscaled rails | #186 documents scaled rails and margin; adds static-rail checks | Original 1001-unit diagnosis is obsolete. Historical evidence supports documented behaviour; fresh rendered verification still deferred |
| #171 | Pixel-floor ramp remains viewport-dependent | `rampFor` gone, but replacement still interpolates from a pixel floor | Keep open. Formula-level counterexample on both; old fixture pixels not reproduced |
| #190 (dependency) | `2c978b9` is not an ancestor | Fix `2c978b9` is an ancestor; shader premultiplication present | Do not duplicate. Rendered verification belongs to #186 |

All four requested issues were open when read. None was closed or edited by this audit.

### #119: tail survives; the old mechanism is incomplete

Both revisions have the same shape-generator blob, `9c3c55279964dda6b9db51788bb8a30026040686`.
Executing its in-memory assignment produces 954 notes, 120 carried tags, 75 singleton
tags, and 100 tags on three notes or fewer. The default filing has 122 legend groups
including the special groups; its empty `(unlinked)` row accounts for the 101 groups
at three or fewer. A legend group is not necessarily a nonempty wedge.

The fixture caveat in the original proposal is **already addressed** by the issue's
September 11 comment: 24/100 tail names cluster at three characters (five clusters),
22/100 at four (four clusters). Do not add another unrelated-name tail as if missing.
First-tag filing, carried counts, and the option to separate orphans must be explicit
in future probes: separating the generator's declared orphans gives different counts.

The isolated planner executes `buildWedgePlan`, `takeGeom`, `allocateBand` and seam
helpers from each commit. Flat tags, joined orphans (the default), unit weights, no
pins/filter, and stable index rank are supplied. Index rank is sufficient for these
count/geometry readings but does not reproduce the link-weight gradient.

| Rest-planner reading | Develop | #186 pin |
|---|---:|---:|
| Nonempty groups, inner / outer | 116 / 5 | 116 / 5 |
| Notes, inner / outer | 244 / 710 | 244 / 710 |
| Rows, inner / outer | 5 / 7 | 5 / 7 |
| Inner pitch, graph units | 176.128 | 176.128 |
| Allocator inner gap per group | 0.805827 degrees | 0.805827 degrees |
| Allocator inner total | 93.475951 degrees (25.97%) | 93.475951 degrees (25.97%) |
| `seamAt` total at inner reference radius | 162 degrees (45% cap) | 162 degrees (45% cap) |
| Merged groups | 0 | 0 |

**These last two seam readings measure different things.** `gapFor` reserves the
allocator gap; `seamAt(radius, boundaries, band)` computes radius-dependent edge
clearance with a 45% cap. Neither this probe nor multiplying a debug gap by a group
count measures painted empty area. A future browser capture must sample actual
boundaries at row radii. The old 115 x 0.957 degrees / 31% is not a current target.

`SMALL_GROUP = 0` still disables the merge path. But `smallAt` is no longer the whole
ring-membership explanation: #117 pins groups below ten notes inward and adds a
room-per-note cost to the balancer. On #186, the seed and ring split use note counts
separately from weights. Reversing `smallAt` alone would leave the under-ten pin.

A counterfactual in each VM sets `SMALL_GROUP = 4`: 100 real tag groups pool into the
anonymous group, leaving 22 nonempty groups (20 inner, two outer). The new unfiltered
lock changes `r0` from 8.220364 to 7.398328 and `maxR` from 23.820364 to 20.998328
lattice units. This exercises the existing mechanism, not a proposed implementation:
it changes membership and geometry as well as boundaries. It is not a free switch.

The original `room.i = 39.1`, `room.o = 170.5` diagnosis cannot be carried into #186:
`plan.room`, `roomPool` and the band-median sizing walk are removed there. Its dot
ceiling comes from the cell's tightest step; the visible-link ramp and a 1x–3x rest
bound were added later. The rejected per-note-step sizing and the original weighted
arc proposal in early #186 comments are not the current design. ADR 0017 itself has
historical paragraphs; the source pin wins where prose and code differ.

Historical corroboration: the committed `packed-data.json` (last changed at `a059318`)
contains 121 tag wedges at rest, 31 below 85% seam coverage, worst 0.52. The same 31
remain after hiding inbox. Those are September investigation recordings, **not a fresh
measurement of either audit revision**. Their provenance is why the audit does not
assert that today's page still has exactly 31 deficient wedges.

### #118: only the grey half was fixed

`7eeda819` is an ancestor of develop and explicitly says `Refs #118`, with the other
half deliberately open. The merge title is not completion evidence.

Executing each revision's `buildColors` on the fixture's 122 group names with its dark
palette gives **11 base colours, two grey base assignments**; each of the ten hues is
assigned twelve times. Sub-shade construction and unlinked tint building are stubbed
out: this is the automatic base-slot surface, not a full `colorOf`/renderer read.
It matches the intended grey fix without claiming all identity collisions disappeared.
The negative control rotates over twelve slots in the VM and restores 22 grey base
assignments on each pin, showing that the probe detects the original half-defect.

Layout-only merging does not reduce the legend's colour assignments. The earlier #118
spike proved this on a page; the current separation between ordering/colours and the
dead merge path still agrees. Presentation buckets would retain this limitation.
Real bucket groups would instead need their own colour/pins, legend rows, counts,
hide/only behaviour and persistence. That is a product decision, not a constant tweak.

### #132: use the actual inner rails

Both pins retain `INNER_SCALE = 0.8` and `INNER_FILL = 0.8`. Applying them to the issue's
rounded rails gives:

```text
inner low  = 1063 x 0.8                             = 850.40
inner high = (1063 + (2439 - 1063) x 0.8) x 0.8      = 1731.04
last centre shortfall = 1731.04 - 1438               = 293.04
```

The claimed 212-unit hub overrun used the wrong inner rail. The claimed 1001-unit
upper shortfall includes 707.96 units of scaling/fill plus a remaining 293.04-unit
centre margin. Historical #186 investigation identifies that remainder as one pitch.
This arithmetic does not independently measure the current dot edge or pitch.

#186's later maintainer definition retains static radii and interprets fill using
slot/dot extents, allowing the pitch margin; it does not require every dot centre to
touch a rail. A filtered band being sparser follows that lock. Keep this interpretation
in #186; do not alter `INNER_SCALE`, `INNER_FILL`, or camera framing in #119.

### #171: the mechanism remains, despite the new rest cache

The report's 1.43 px floor and quoted old viewport table are historical. Both audited
sources use **1.5 px**. `rampFor` exists only on develop; #186 reconstructs the equivalent
floor-to-ceiling interpolation in `dotPx` and again in `restAt`.

Executed counterexample: a midpoint-size dot at unit pitch, ratio 1, cell clearance
chosen so the ceiling is one pitch, and no active geometric/frame/rest caps. These
are controlled inputs to the actual extracted functions, **not shape-vault pixels**.

| Pixels per lattice unit | Diameter in lattice units, both pins |
|---:|---:|
| 11.78 | 0.520192 |
| 16.76 | 0.482356 |
| 18.76 | 0.472814 |
| 27.72 | 0.446970 |

Above the floor, at ramp fraction `t`, the radius is `t * ceiling + (1-t) * floor`.
Dividing by viewport scale leaves the floor term inversely dependent on that scale.
The larger-window dot in this probe is 14.1% smaller relative to its lattice.
Setting only the VM's floor to zero makes all four diameters 0.392857 lattice units,
isolating the cause. This is a diagnostic control, not an approved floor removal.

The latest two pinned #186 commits repair *stale rest sizes after a resize*: a rest
taken at one stage size should equal a rest retaken at the new size. That is distinct
from *the same note should keep its lattice-relative size at different stage sizes*.
The new resize check proves neither #171's desired invariant nor this audit's rendered
counterexample. The earlier proposed multiplicative ramp was rejected for flattening
dense-vault dots. Choosing that tradeoff again belongs to the dot-sizing owner.

## Implementation proposal — NOT APPROVED

### ELI5

- **The problem:** tiny tags still consume individual slices, making the inner ring hard to read.
- **What I'll change:** first test named, alphabetical bundles of small tags while preserving every tag's identity.
- **How we'll know it works:** the bundles use fewer boundaries and readable rows, and hiding a tag still hides exactly its notes.
- **Not touching:** the folder view, colours, dot sizes, animation rules, or camera work.
- **The one risk:** bundles that rearrange after filtering would make tags hard to find.
- **Decisions I made for you:** none; the choices below are recommendations awaiting answers.

### Decisions that change the scope

1. **D-1 — presentation bundles or real groups?** Recommend presentation bundles:
   real tags keep their individual legend rows, colours, pins and hide/only controls;
   the shared drawing region gets an alphabetical range label. A bucket has no saved
   colour or independent visibility. Repeated tag colours remain an open #118 concern.
   Choosing real groups expands the work into group identity, navigation and persistence.
2. **D-2 — stability or maximum fill after every filter?** Recommend building membership
   from the unfiltered dimension and retaining it across hide/only, dates and search.
   Membership may change on a live data rebuild; list affected tags in the preview.
   This admits sparse filtered bundles. Recutting after each filter improves occupancy
   but changes names and positions as the user works. Literal full fill in every state
   cannot coexist with stable buckets containing only one surviving note.

### Concrete sequence, ownership and files

1. **After D-1/D-2 and plan approval:** add an isolated
   `.ai-context/investigations/119/bucket-probe.mjs`, not a product hook. Consume
   filed, positive-count, ordinary top-level tags and their existing band membership.
   Exclude special groups; retain each tag's nested children together. Never pool across
   bands. Use band depth from the unfiltered plan, not an invented fixed note threshold.
2. Compare tail eligibility (fewer than one vs two full columns) and bucket targets
   `2 * rows`, `3 * rows`, `4 * rows`. At the measured five inner rows those are 10,
   15 and 20 notes. They are **experimental candidates**, not accepted constants or
   promises of physical fill. A final undersized run joins its preceding run in the
   same band; a sole undersized run is reported explicitly. No code silently drops it.
3. Produce a reviewable table of every candidate: members, note counts, boundary count,
   row occupancy and labels; compare unrelated and hierarchical fixture names, punctuation,
   numeric names, Unicode, equal sort keys, nested tags, and empty/single-tag cases.
   Derive label endpoints from the same normalized display sort; use real tag keys for
   identity and a deterministic tie-break, not truncated display labels. The label must
   expand to list members when an abbreviated range is ambiguous. No prefix-only algorithm.
4. **Before product work:** #186 must yield ownership of the relevant planner/cascade
   surface and there must be an agreed common baseline. Re-pin and repeat the audit.
   Do not merge, cherry-pick, or edit #186 from this worktree. Do not layer a new planner
   implementation on the older develop copy while that surface is actively changing.
5. On that agreed baseline, propose a tag-only mapping module consumed by
   `src/page.js` at cell construction and wedge-label generation. Keep `fileGroup`,
   `computeOrder`, `buildColors`, per-tag visibility and host persistence keyed to real
   tags under D-1. The folder path must bypass the mapping entirely. Do not enable the
   anonymous `MERGED` path as a substitute. Integrating the map with held cells and the
   dimension-switch world requires #186's current contract; this step is conditional.
6. Add focused `scripts/smoke.mjs` checks for membership conservation, exact individual
   hide/only behaviour, stable membership under filters, label/member agreement, zero-weight
   cost, and folder parity. Preserve the serpentine and filtered/dimension-switch motion.
   Show the measured named bundles before accepting a packing or palette law change.
7. Update a tag-tail design record, measured invariants and `changelog-detail.md` with
   the approved outcome; regenerate code-map/index last. Review and commit locally.

### Acceptance and deferred browser work

The first prototype succeeds if it conserves every real member exactly once, reduces
tail boundaries, reports the final partial bucket, and makes the D-1/D-2 costs visible.
It is not sufficient to assert a lower seam percentage or a smoother animation.

After #186's browser work yields, run headed, labelled pages under the screen guard and
applicable locks. If a single monitor is available, ask before using it. No headless
fallback. Build from immutable sources into this worker's scratch area, with the same
fixture seed/end date, preferences and viewport for both sides.

Required measurements before any product claim:

- Shape tags: rest, hide/show inbox, individual member hide/only, date cuts, and
  both orphan settings; collect actual row-radius seams, cells, note counts, slot/dot
  coverage and legend identities. Repeat at several viewport sizes and `?nofit`.
- Shape folders and the 10k fixture: targeted golden, lattice, hub, density, zero-weight
  and plan-parity checks; a tag-only fix must not move folder goldens. Compare against
  the agreed #186 baseline, since #186 itself deliberately moved earlier goldens.
- Demo `only 03 - Resources`: collect centres **and** dot/slot edges against scaled
  rails and a fresh relayout. Do not interpret a centre-to-rail pitch margin as overrun.
- #171: compare both fresh mounts at each viewport and resize-without-retaking versus
  retaken rest. Record cap/floor binding and link-degree rank; do not conflate these tests.

#134 owns walk-camera framing. No full suite, push, merge, issue close, spotlight,
feature-gallery page or hero is part of this plan. An approved review recording must
be square cropped. No completion notice goes to the orchestrator.

## Sources read

- [#119 body and fixture correction](https://github.com/luke321/vault-graph/issues/119)
- [#118 body, plan and explicit half-fix handover](https://github.com/luke321/vault-graph/issues/118)
- [#132 original measurement](https://github.com/luke321/vault-graph/issues/132)
- [#171 viewport and floor proposal](https://github.com/luke321/vault-graph/issues/171)
- [#186 investigation, definition, rejected sizing and corrected cascade comments](https://github.com/luke321/vault-graph/issues/186)
- [#190 premultiplication diagnosis](https://github.com/luke321/vault-graph/issues/190)
- Local `design/0001`, `design/0004`, `design/0015`, `invariants.md`; pinned #186
  `decisions/0017`, `investigations/186/README.md`, `runs/packed-data.json`, source and checks.

## Checks and limits

The audit was rerun on continuation and its output exactly matches the saved
`measurements.json`. It contains no browser measurements from this session.
The earlier child-process permission blockers are cleared: the normal `npm run lint`
and `node scripts/check-pii.mjs` commands now pass without workarounds. Lint reports
zero errors/warnings, with both contract negative controls rejected with TS2322.
The PII gate includes the staged audit files: 256 files, 12 names, 1 email rule,
2 Jira rules, 1 vault rule, 7 patterns, all 20 negative controls caught. Private
deny-list values were not printed. The comment ratchet remains 350/350. Source scope
and network checks pass (333 CSS rules, 60 ids; 18 source files, no build present).

Repository ESLint does not cover this investigation directory. A direct invocation
there applies Obsidian's mobile profile and warned on Node imports/globals; the probe
was consequently linted through stdin with `--stdin-filename scripts/audit-119.mjs`,
using the existing tooling rules: zero errors and warnings. No rule was disabled.

Browser gates, generated
build checks and both determinism harnesses were not run for this docs/probe-only change.

Five review lenses were applied without delegation: correctness (fixed an initial
orphan-mode assumption), conventions (isolated all changes and held the comment
ratchet), tests/evidence (added controls; distinguished blocked wrappers), simplification
(kept the existing generator and source functions), and adversarial review (separated
archive history, live render claims, seam metrics and the two resize questions).
Deferred browser evidence remains outstanding for any product implementation handover;
this is an audit/plan review, not a product merge-readiness verdict.

**Local commit permission restored:** normal `git add` succeeds. This audit is pinned
by "Audit the tag-tail reports against the pinned packing rework", with `Refs #119`
and no closing trailer. Nothing is pushed or merged. Artifact publishing is unavailable
in this session; the self-contained [local review](review.html) remains available
without opening it.
