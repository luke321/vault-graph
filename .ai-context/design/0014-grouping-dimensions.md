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

With **One dot per tag** on (the toggle read *Notes in every tag* until 2026-09-10; the new
name says what it does) there is no gap for any tag, and the disclosure disappears by itself.

## Where the switch lives

The group list's own heading — `Groups (18)` becomes a **segmented control** reading
**Folders | Tags**, the active side filled with the accent, the count beside it: `Folders (18)`
/ `Tags (12)`. **The control belongs to the thing it changes**: not the view settings, not the
top bar, not a hidden context-menu item.

It was a dropdown first, drawn as the heading it replaced with a chevron and no border or fill
— "semi-obvious" was the brief. Asked on 2026-09-10, "is the dropdown obvious enough?", the
answer from a screenshot was no: it read as a label with a decorative caret, and the All and
None chips beside it carried more weight than the one control that changes what the whole disc
is. The segmented control uses the look the settings segments already have, so it reads as a
control, and it still fits a third grouping; past three it goes back to a menu. A real click on
a side drives it, so the storyboard clicks `["dim", "tag"]` on camera rather than setting a
select's value.

The dimension is remembered by the host, not the page (decisions/0009), so there is no settings
row for it — the segmented control is the control.

## One dot per tag (D-9) — removed 2026-09-10, github#91

**Pulled out the same day the inner-ring limit below was measured**, to come back as its own
feature: the toggle, the persistent copies and their checks are gone (github#91 carries the
measurement and what a return needs); the copy machinery — `dupOf`, `SAT_SEP`, `noteOf`, every
walk that skips a copy — stays, because the dimension switch's stand-ins are copies for the
length of a switch. What follows is the record of the feature as it was built.

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

**Open, and measured (2026-09-10): the inner ring cannot take the copies.** On the
maintainer's vault the toggle turns 528 notes into 1,226 dots and the inner ring holds 492 of
them, at a median **0.38 px** against 1.91 px without copies — unreadable. Keeping the band
split across the toggle is worse, 768 inner dots at 0.02 px, because the multi-tagged groups
are the ones the balancer already put inside; growing the rings by the square root of the dot
ratio changes nothing, because the view fits the disc to the screen and the inner band's share
of that screen is what it is. The toggle re-splits the bands inside the page's rings, which is
the least bad of the three, and the limit stands: copies need either a band rule that weighs
them or a disc that gives the inner ring more of itself. The toggle reads **One dot per tag**.

## The switch in the storyboard

The `tags` act is the first act after the intro: a `dim` beat sets the real `#vg-dim` select
and dispatches its change — a native select opens an OS popup under a real click, so the
driver drives it the way the page's own handler is driven — then settles, switches back and
settles. Driven on the demo vault it runs six beats in 8.3 s. The demo vault carries tags
worth showing since 2026-09-10: `make-test-vault.mjs` gives one note in five a nested tag from
two families, listed first, so the regenerated demo has 693 tagged notes, 353 with more than
one tag, 207 with a nested one and 12 top-level tags.

## One row builder, two worlds

The legend builds every group row through one function, `rowFor(g, world)`, and there are
exactly two worlds: the dimension on screen, read live, and the dimension being left as it
stood when the switch began — counts, colours, swatch fills and titles, band split, basis,
twisty and open state, all captured into `legendSwitch` before `state.dim` flips. A leaving
row differs from the row it was in two ways and no other: it is inert (no `data-g`,
`data-eye`, `data-tw` or `data-only`, so no handler reaches it, and the eye and twisty are
drawn `disabled` where they were) and its gauge follows its notes. The first cut hand-built
the leaving rows' options and lost the inner ring's small swatch and the eye on the way —
"how could that happen when only the gauge should change?" — which is the reason there is one
builder and a world, not a template fed by two callers. Nothing in the legend is folder-only;
a third grouping would need a `fileGroup` answer and an entry in `DIMS`, and the nav bar
would follow.

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

`hand` is the simplest sweep that reads as motion. **Both discs are drawn from the first
frame, in the same place, one shown and one hidden**, and two edges of one rotating hand swap
them:

- **Both discs at once.** A note can end up earlier in the sweep than it started, and one dot
  cannot appear at its new seat before it has left its old one — the first take of this hand
  lit such notes late, a third of the vault, and it showed. So `setDim` marks every visible
  note as **leaving** (`leaving`, `leftGroup`) and adds a **stand-in** per note
  (`addStandIns`): a copy, exactly as a tag copy is made (`dupOf`, plus `standIn`), dark, that
  is the note's dot in the disc arriving. The leaving note is invisible to the disc arriving
  (`visible()`, the plan's membership) and the stand-in to the disc being left (`oldWorld`,
  set by `inWorld`), the legend never counts a stand-in, and at settle the note takes its
  stand-in's seat and presence and the stand-in goes (`dropStandIns`, the cascade's `done`;
  any other cascade, or a switch cut short, takes them home first). No dot ever waits for
  another. The legend and the colour rotation see the disc arriving from the first frame:
  `computeOrder` counts a leaving note where the dimension on screen files it, not under the
  group it is fading out of, or the old names sit in the new order — rows in the legend, slots
  in the rotation, and no bars for the tags, all three of which were reported at once.
- **The stand-ins carry their notes' links, days and rows.** A stand-in gets every edge its
  note has, to the other note's stand-in or to the note itself when that one is not leaving
  (`addStandIns`), so the web of the disc arriving is drawn as it lights up and the web of the
  disc being left fades with it; the edge count doubles for the switch and comes back when
  the stand-ins go. The heat strip counts a stand-in for its note's day, weighted by its
  alpha and in its new colour, so each day cross-fades from the colour it had to the colour it
  gets, and its repaint signature carries the frame while stand-ins exist because the
  colours move under a steady count. And the nav bar keeps the rows of the disc being left —
  inert, with the counts and colours they had (`legendSwitch`) — above the rows arriving,
  each bar following its notes' alpha every frame (`legendSwitchTick`, `liveByGroup`): a
  row drops out when its last note has faded and drops in with its first lit one, through a
  max-height transition on the row. So for a while folders and tags mix in the nav bar,
  which is what was asked for: "folders drop out and tags drop in synchronized to the notes
  with the gauges shrinking and growing". Measured on the maintainer's vault, sampled every
  600 ms with the lap slowed threefold: stand-in edges drawn 34 → 243 → 496 → 1,012 → 1,811,
  folder rows standing 7 → 6 → 5 → 4 → 3 while tag rows rise 4 → 7 → 13 → 21 → 28, and the
  end state is 2,147 edges on the notes, 32 tag rows, no folder rows, no stand-ins.
- **The erase edge** sweeps once at constant angular speed and takes a dot when it passes the
  dot's bearing (`delay = W × sweep ÷ 2π`). The dot fades where it stands — a fade also shrinks
  a dot, so the vicinity of the edge is where dots grow smaller and vanish — **in the colour
  it had** and **under the group it had**: `setDim` snapshots both before `state.dim` flips
  (`LeftDisc.color`, `leftGroup`), and `nodeColor` and `groupOf` answer from them while the
  note is leaving. The old disc is never re-laid-out.
- **The fill edge** trails the erase edge by a fixed **blade** (`HAND_BLADE_DEG`, 20°) and
  lights the stand-in at the note's **final** seat, taken straight from `finalPos` (`seated`).
- **The fade is a distance, not a time**: a dot is fully gone, or fully lit, `HAND_FADE_DEG`
  (12°) behind its edge whatever the lap takes (`fadeLen = W × 12° ÷ 360°`). Asked for as
  "full visibility after a fixed amount of distance to the invisible hand … like it sucks in
  the old and pops out the new"; the blade came down from 45° with it. And **the fade shrinks
  a dot to nothing** (`shrinkFade`): a fading dot is normally drawn at `0.45 + 0.55 × alpha` of
  its size, which is what leaves a fading disc looking moth-eaten; a toggled wedge's dots go
  to nothing because the wedge's size walk (`colWalk`) multiplies in on top, and the user
  pointed at that cascade as the one that fades right. While the hand sweeps, size is `alpha`.
- **The inner ring sweeps counter-clockwise**, for effect: a dot in the inner ring of either
  disc is keyed on `2π − bearing` (`sweepAt`, with `innerOld` reading the left disc's
  `bandLock` and `innerNew` the arriving one's).
- **The two discs share their rings.** "Why do both disks not have the same outer and inner
  diameters?" Each dimension locked its own rings from its own visible total, and the folder
  view of the tag fixture hides its archive folder by default: rings for 793 notes against
  891, hub radius 712 against 813, outer edge 2,906 against 3,033. `keepRings` now carries the
  hub radius, ring radii and band reference of the disc being left into the dimension arriving,
  on the animated and the instant switch alike, and the arriving disc re-solves its rows inside
  them — which is exactly what a filter does (*the rings are independent, and their thickness
  is locked; a filter re-packs inside them*). Measured after: the tag fixture's two discs are
  identical, 712..1142 and 1786..2906 in both. What can still differ is the inner ring's
  outer edge, because a band's last row sits at `(rows − 1) ÷ rows` of its thickness and the
  row count is solved from the band's own note count: on the maintainer's vault 3 rows against
  4, 1,061 against 1,108, on a disc of 2,384. The rings are re-derived only by a hard
  relayout, in whatever dimension is on screen.
- One lap of the erase edge is at least `HAND_SWEEP` (12) fades of the resting kind long, the
  span is that lap plus one blade plus a fade, and the cascade reports the edge's angle as
  `lastCascade().handDeg` (with `handLap`) for the checks. `__vg.handBlade` and
  `__vg.handFade` set the two angles live; `__vg.standIns()` lists the stand-ins, none at rest.

So the frame needs **no plan at all**, and nothing between a note's weight and its position
changes: the serpentine, the lattice, the rings and the hub are the resting disc's.

**Four richer takes were built on 2026-09-10 and each rejected by eye**, and the record of
them is the argument for this one. A row-by-row deal per wedge read as a radial peel. A column
serpentine along the circumference, columns of nine frames alternating inward and outward, read
as noise. Both discs re-packed every frame over their moving arcs — two arc plans a frame, every
note pinned to its resting row, seams scaled with the arc — was measurably packed (0 dots
outside their arc at every sample) and still not what was wanted: the wedges breathing as they
re-packed. "Go back to a very simple animation: imagine both discs are in the same spot, one
showing one hidden; the clock hand vanishes the showing one and shows the hidden one. No
serpentine, no repacking, no wedge toggling." The arc planner (`planArc`, `__vg.arcLayout`)
stays as the primitive it was; the switch does not use it.

**Measured on the maintainer's vault, every frame**, against `handDeg`: the highest lit
bearing tracks the fill edge within one fade at every sample, 0 dots lit more than 6° ahead of
it, 16 ms a frame with no plan.

### The cost, and the knob

A note may not arrive before it has left (*a fade never reverses*), so a note whose new bearing
is more than one blade **behind** its old one lights **late**: its seat is already behind the
fill edge when it becomes free, and it pops in there. The fraction is a formula in the blade:
`(1 − blade/360°)² ÷ 2`. Measured **373 of 1,370** movers at 90° on the demo fixture (formula
28%); on the maintainer's vault **118 of 525** notes first lit more than 90° behind the edge
at 90°, and **163 of 525** at 45° (47 of them more than 180° behind). It would be 12.5% at
180°, and 0 only when the fill edge waits a whole lap — which is the sequential swap that was
rejected. `__vg.handBlade = <degrees>` sets it live.

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
