# Grouping dimensions: folders, tags, and the filing

**Status** as-built · github#86, 2026-09-09 · asked for on Reddit: group the disc by **tag**
instead of by folder, so a vault organised by tag gets a picture of itself too.

> What a note's group is, when it has one folder and any number of tags; where the switch
> lives; and the four structural answers that had to be decided rather than discovered.

## `state.dim` was already there, and had only ever held one value

The grouping dimension has been a first-class key since the disc had one grouping: it is the
key for `order[state.dim]`, for the hidden map `state.hidden[state.dim]`, and for the
skeleton cache's reuse test (`skel.dim === state.dim`). Both hosts have parsed a note's tags
since github#6 and `graph.addNode` has stored them all along.

What was hardcoded was smaller and more awkward than one function: **grouping read three node
attributes directly** — `folder` at 18 sites, `sub` at 10, `dirs` at 7 — so a second
dimension had nowhere to answer.

## The filing

Grouping does not read a note's attributes any more. It asks where the note is **filed** in
the dimension on screen: which group, which sub-wedge inside it, and the path that nests it in
the legend.

```javascript
fileGroup(id, a)   // folder dim: a.folder    tag dim: first segment of the filing tag
fileSub(id, a)     // folder dim: a.sub       tag dim: second segment
fileDirs(id, a)    // folder dim: a.dirs      tag dim: every segment below the first
```

In the folder dimension these return exactly what the call sites read before, so **a page
nobody switches lays out to the byte it did before** — the golden snapshots on all three
existing fixtures are the check, and they did not move.

**Three scalar readers rather than one `{ g, sub, dirs }` object**, because `buildWedgePlan`
walks every node of a 10k vault inside a cascade frame and an object per node per frame is a
cost the folder dimension must not pay for a feature it is not using. `a` is optional and
passed wherever the caller already holds the attributes — the node walks all do — so the seam
costs those callers no second lookup. The tag table is built the first time the tag dimension
is entered, so a folder-only page allocates nothing for it at all.

`pathKey()` keys on the filing too, which is what carries `hiddenSub`, `highlightSub` and
`pathOpen` across dimensions without any of them knowing there is one.

## The four answers

A note has one folder and any number of tags, and the lattice gives every note exactly one
cell in exactly one wedge. Folders guarantee that; tags do not. These were decided before any
code, on measured numbers rather than on taste.

**Measured on the demo fixture** (1,407 notes, 10 distinct tags): 632 tagged, **775 untagged**,
318 carrying more than one tag, **0 nested**. So a naive tag dimension puts 55% of that vault
in one bucket and half of everything tagged has more than one home.

### D-1 · A multi-tag note is filed under the first tag it lists

The alternatives were alphabetical (stable but arbitrary — `decision` always beats `howto` for
no reason a reader can see) and rarest-wins (specific, but the wedge a note lands in would
change when *other* notes are tagged). Frontmatter order is the only order a note's author can
see and control. The legend row and the detail panel disclose the choice, so it is never a
silent one.

### D-2 · Untagged notes go to `(untagged)`, shown, grey, and second to last

`(unlinked)` is the existing precedent for a bracketed pseudo-group, and this follows it: out
of the twelve-slot hue rotation, wearing the archive grey, because neither bucket is a group
anyone chose and a hue would claim it was. `groupRank` puts `(untagged)` at 3 and `(unlinked)`
at 4 — a bucket of real notes, then the terminal one.

**Shown, not hidden.** On a mostly-untagged vault that bucket *is* the disc, and hiding it by
default would mean a switch that silently drops half a vault. One click on its eye hides it and
the tagged core re-packs inside the rings. Both extremes are checked: the demo fixture at 55%
untagged, and the dominant-folder fixture, which carries no tags at all and whose tag disc is
therefore one `(untagged)` wedge holding all 954 notes.

### D-3 · A nested `a/b` tag maps onto the sub-wedge mechanism

Obsidian's `#area/health` is a hierarchy and the disc already has a mechanism for one, so the
segments map onto folder / subfolder / deeper exactly. `splitFor`, `subOrder`, the tint ladder,
the legend twisty and `hiddenSub` are all reused unchanged; the only change is that the split
is no longer gated on which dimension is on screen (`var nested = state.dim === "folder"` was
that gate). decisions/0004 still rules what may be *pushed*.

Measured on the tag fixture: `area` holds `[health, finance, career]`, is drawn as 3 cells with
3 distinct tints (`#3987e5` `#68a0ff` `#93baff`), gets a legend twisty, and `area/health/sleep`
nests one level below it.

### D-4 · A tag row discloses filed against carried

A folder row discloses its subfolders by unfolding. A tag has no path, so the one thing worth
disclosing is the gap between the dots in its wedge and the notes that carry it: the row's
title reads `74 filed here, 82 carry this tag` when the two differ, and says nothing extra
when they do not. The count on the row is always the dots on the disc, so the count bars, the
`only` button and the wedge all agree.

With **Notes in every tag** on there is no gap for any tag, and the disclosure disappears by
itself.

## Where the switch lives

The group list's own heading — `Groups (18)` becomes a dropdown reading `Folders (18)` /
`Tags (12)`, in those words. (Sentence case, not caps: the `text-transform: uppercase` on
`.block > .lbl` has never matched this label, which is nested a `.row` deeper. So the heading
reads as it always has.) **The control belongs to the thing it changes**: not the view
settings, not the top bar, not a hidden context-menu item, and not a pair of always-lit tabs.
Semi-obvious is the brief: no border or fill at rest so it reads as the heading it replaced,
and a chevron that is always there so anyone looking for a control finds one.

The dimension is remembered by the host, not the page (decisions/0009), so there is no settings
row for it — the dropdown is the control.

## Notes in every tag (D-9)

Multi-membership was out of scope in the issue and was then asked for during planning, as an
**opt-in toggle, off by default**, in a row under the heading and only while the disc is cut by
tag.

A note with *k* distinct tags becomes its **primary**, filed under D-1's tag, plus *k−1*
**satellites**, one per further tag. Each is a real graph node, so the planner, the cascade and
the renderer need to know nothing about them.

**A satellite is not a second note.** It shares its primary's adjacency array, its hub rank and
its place in the timeline, and every walk that counts or ranks notes skips it on `dupOf` — the
heatmap, the search, the hub, the timeline and the footer. Everywhere a dot is asked who it is,
a copy answers as its note: clicking one selects the note, hovering one lights every copy of it,
pinning one pins the note.

**A copy's links are drawn only while it is hovered or selected** (D-10), which is the same
lazy-edge path a 10k vault already uses for its own thinned links. So the web at rest is the
notes' web and the link count keeps meaning what it says.

Rejected: keeping the satellites permanently and hiding them behind a predicate. The
band-and-geometry basis plan (`buildWedgePlan(false)`) walks every node, so a not-present
satellite would still shape the rings — membership has to be real.

## The tag fixture

`scripts/make-tag-vault.mjs`, 891 notes. The other three fixtures are all folder-organised and
carry **zero nested tags between them** — the demo vault and the 10k synthetic leave 55% and
56% of their notes untagged, and the dominant-folder vault has no tags at all. All three are
worth keeping: an untagged majority is the honest picture of a folder-organised vault seen
through its tags, and the 100% case has to lay out too. But none of them is the vault the
request came from, and none can run the nesting path at all.

Four things about its shape are deliberate, each provoking something:

| | |
|---|---|
| **nested tags** | `area/health`, `project/greenhouse` and the rest. design/0004 grants a sub-wedge to a depth-1 subfolder with its own tint slot and D-3 maps a nested tag onto that — this is the only fixture where that code runs |
| **more tags than slots** | 13 top-level tags against `SLOT_COUNT` 12, so the rotation is walked to its end and comes round; the thirteenth takes `g1` again (design/0004, *it goes round*). Both buckets sit out of the rotation |
| **a deep tag** | `area/health/sleep` is depth 2, where the legend nests a third level and decisions/0004 stops the push |
| **an untagged minority** | ~8%, against the demo vault's 55% and the dominant-folder vault's 100%, so the bucket is a normal small group here and the whole disc over there |

One folder holds 82% of the notes, because a tag-organised vault usually has an inbox or a flat
notes folder everything sits in — which also makes this fixture's *folder* dimension the
degenerate one, a free extra case for the default view.

**Its golden is recorded in the tag dimension, and it is the only one that is.** Its folder disc
is the degenerate picture; its tag disc is the one nothing else can show. So between the four
fixtures the goldens gate both dimensions. Each snapshot records the dimension it was taken in.

`--end` is pinned by every caller, for the reason invariants.md gives under *A synthetic vault's
folder counts do not depend on which day it was built*: a fixture whose golden fails on a weekly
refresh teaches everyone to regenerate goldens to make a check pass.

The tag vault **hashes only its own generator**. One shared list would have moved all four
digests and made every worktree re-cut every fixture on the shared store, which is a race
several agents lose at once.

## A clock hand with two edges, and a planner that can draw an arc

A dimension switch moves **every** note, and the cascade default is tuned for the opposite
case — a handful of movers among a settled disc (github#49). It staggers departures across the
first 35% of the span and forces arrivals into the back 45%, so the old disc **empties before
the new one lands**. github#76's `cross` opt fixed the emptying and the switch still read as a
dissolve, because `ins` and `outs` are sorted clockwise but **`moves` are not** — note-index
order — and on a dimension switch every note is a move.

What was asked for instead: *a clock hand moving over the disc, toggling the old wedges off one
after another and enabling the new ones one after another, with the two discs never colliding.*

### The hand

`hand` keys the schedule on **angle**, not rank, and it has two edges of one rotating hand:

- **The erase edge** sweeps once at constant angular speed. A note starts fading when the edge
  passes its **old** bearing (`delay = W × angleSweep(where it sits) ÷ 2π`) and has left one
  fade later. The old disc is **not re-laid-out**: a dot fades where it stands.
- **The fill edge** trails the erase edge by a fixed **blade** (`HAND_BLADE_DEG`, 90°). A note
  that has left takes its **final** seat straight from `finalPos` and waits there, dark, until
  the fill edge reaches its **new** bearing. `arriveAt = max(fillAt(new bearing), crossAt)`.

So the frame needs **no plan at all**: targets are `finalPos` for every dot that has left, and
nothing for a dot still fading out. One lap of the erase edge is at least `HAND_SWEEP` (12)
fades long, and the span is that lap plus one blade plus a fade.

**Measured on the demo fixture, every animation frame**, binning dots by bearing into 24
sectors of 15° and classifying each against its old seat and its final seat:

| | 30% | 40% | 50% | 60% | 70% |
|---|---|---|---|---|---|
| old disc, lowest bearing still standing | 129° | 180° | 230° | 279° | 329° |
| new disc, highest bearing lit | 37° | 89° | 140° | 189° | 239° |
| sectors holding both | **0** | **0** | **0** | **0** | **0** |

The two discs **never share a sector**; the gap between them is the blade. Every lit dot is at
its final seat — median radius error **0**, median bearing error **0** — against 32,530
dot-frames "near neither seat" for the arc-planned attempt below. The old disc erases as one
contiguous clockwise void (`[ +##########]` → `[    ########]` → `[      +#####]`), and the
frame stays at the 60 fps cadence because nothing is planned.

### The cost, and the knob

A note may not arrive before it has left (*a fade never reverses*), so a note whose new bearing
is more than one blade **behind** its old one lights **late**: its seat is already behind the
fill edge when it becomes free, and it pops in there. The fraction is a formula in the blade:
`(1 − blade/360°)² ÷ 2`. Measured **373 of 1,370** movers at 90° (formula 28%); it would be
39% at 43° and 12.5% at 180°, and 0 only when the fill edge waits a whole lap — which is the
sequential swap that was rejected. `__vg.handBlade = <degrees>` sets it live.

### Why the new disc is not re-planned into the swept arc

The first version of this planned the new disc over the arc the hand had swept, `[0, φ]`, so
it grew behind the blade. The planner can do that now — see below — and it was the wrong tool
here: a group's arc share over a partial arc with partial membership does not reproduce its
share of the final disc, so dots slid as the arc grew (`decision` +0.5°, `evergreen` +12°,
`(untagged)` +30° at 75%, cumulative in order). `finalPos` is exact and free.

### The planner can draw an arc

`planArc = { from, to }` (sweep radians, 0 at 12 o'clock, clockwise; `null` is the whole
disc) is honoured by `gapFor`, `seamAt`, `allocateBand`, the row and density formulas in
`buildWedgePlan`, and every angle in `ringsLayout`; a partial disc has two open ends and skips
the wrap-seam fit. `__vg.arcLayout(from, to)` lays the visible disc out over an arc without
touching it. Checked on all four fixtures: over `[0, 2π]` it **is** the resting disc (0 notes
off, worst 0.000), and over `[0, π]` every ring note lands inside the half. Compressing the
whole disc into a smaller arc shifts a dot exactly in proportion to its bearing (10% → median
18°, max 36°). This is the primitive that unlocks a half-disc comparison, a clockwise wipe, or
a growing partial disc where that *is* the picture — none of which this switch turned out to
need.

## The switch needs two layout passes

**Room and position are a fixed point** (invariants.md, *A settled dot is the SAME size a fresh
relayout gives it*), and one layout pass measures its margins against the room the *other*
dimension left behind. Every wedge changes across a dimension switch, so that residue — which a
folder toggle hides — is visible: measured with a single pass, **1,335 of 1,403 notes settled up
to 12.1 units off** where a fresh relayout puts them, in both directions, with an identical plan.
A second pass converges all of them and a third changes nothing.

`settle()` converges the animated path the same way and for the same reason, so only the instant
path needs the extra call.

## What the two dimensions do not share

Every map the nav keeps is keyed by group **name**, and a tag may spell a folder's. So each
dimension keeps its own `hiddenSub`, `highlight`, `highlightSub`, `collapsed`, `tailOpen` and
`pathOpen`, stashed on the way out and restored untouched on the way home; `state.hidden` was
already keyed by dimension. Entering a dimension for the first time collapses and seeds it
exactly as the folder list was on boot.

`folderColors`, `subfolderColors` and `folderShown` are **folder** maps the host persists, so no
pin reaches the tag dimension and every tag takes its automatic slot. The colour panel stays a
folder panel and says which dimension owns it, rather than offering swatches that would appear
to do nothing. Tag colours would be a `tagColors` map, and that is its own feature.

## Verify

```javascript
__vg.setDim("tag");             // and "folder" to come back
__vg.filingOf("<note id>");     // { g, sub, dirs } in the dimension on screen
__vg.setMultiTag(true);         // the copies
__vg.noteOf(id); __vg.copiesOf(id);
```

```bash
node scripts/smoke.mjs --only "tags:" --only "multi:" --only golden
```
