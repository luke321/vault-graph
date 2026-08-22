# Groups navigation

**Status** as-built · extracted from the README on 2026-08-22

> The sidebar: eye vs label, three selection channels, and the tail block.


Each legend row carries three separate controls, because it does three different
things and one click could only ever mean one of them:

| Control | Does |
|---|---|
| 👁 eye | show / hide that group or subfolder |
| ▸ ▾ twisty | unfold its subfolder rows |
| the label | **highlight** it — push its notes out and ring them |

**Both levels work the same way.** Groups and subfolders each have their own eye and
their own highlight, so a single subfolder can be pushed out on its own — verified,
highlighting `Partners` moves its 16 notes out 144 units and rings all 16, while its
sibling `People` moves 0. Highlighting is stored as two sets (`highlight` by group,
`highlightSub` by `folder/sub`), and `isHighlighted` is the one predicate that
answers for both plus "mark today".

**Selected rows are marked in three channels**, not one: a tinted fill, an accent
border, and an inset bar down the leading edge. The bar is what carries it for the
indented subfolder rows, whose smaller type makes a fill alone easy to skim past in a
twenty-row list. The same treatment at both levels, so the state reads identically
wherever it appears.

**The aggregate tail row reports the truth.** "N smaller subfolders" shows as selected
only when *every* subfolder it stands for is selected, so a partial selection made in
the level below does not light it up — verified: all 7 selected reads `on`, and turning
one child off drops it back to `off`. Clicking it toggles the whole block, matching
what its eye already does.

**Clicking the label used to hide the group, and that was the real problem.** Hiding
is the wrong verb for "where is this?": to see one folder you had to hide the other
eight, which destroys the context you were asking about — the disc reflows, the wedges
regrow, and you are looking at a different picture. Highlight and visibility are now
separate axes, so you can point at a group *in situ*.

**A highlight is a pure display offset.** Highlighted notes step out by `HL_PUSH`
(0.9 rows) and get a ring; nothing about the packing changes — not rows, not
capacities, not wedge angles. Verified: highlighting a group moves every other
group by **0 / 0** units, and the pushed group by exactly 144 graph units
(0.9 × UNIT). It is applied at the point of placement, after the packer has finished,
so every stability guarantee elsewhere in this note survives it untouched.

- **0.9 rows is sized against headroom that already exists**, not chosen by eye. The
  normalisation box is pinned at `maxR * 1.02` and `fit()` frames at 1.08, leaving
  ~6% of slack outside the outermost notes; 0.9 rows on a ~13.3-row disc is 6.8%. So
  a pushed wedge does not need the box widened — which would have shrunk the resting
  disc for everyone, to pay for a state that is usually off.
- **The ring is the `createNodeBorderProgram`** from the vendored bundle, registered
  as a `halo` node type and selected per-node in the reducer. `borders[0]` is the
  OUTER band and the `{fill:true}` entry is the CORE — the reverse of what the option
  order suggests, and getting it backwards silently draws a solid blob. The node also
  grows 1.3x so the ring adds *outside* the dot instead of eating it.
- **One halo colour for both highlight sources**, in the neutral extreme. The ring
  means "highlighted"; the fill still says what the note is. So a highlighted group
  keeps its group hue inside the ring, and a today note keeps its own non-categorical
  fill — same ring, different fills, no new colour category invented.
- **Highlighting is a set, not a radio.** Several groups can be out at once, which is
  how you compare two folders' reach.
- **Only a subfolder with its own tint slot is pushed. Pooled ones get the ring alone.**
  Including them was tried, on the nav-consistency argument that a folder in "N smaller
  subfolders" is still a level-1 subfolder and selecting one should do something visible.
  Reverted: the overlaps are worse than the inconsistency, and the ring already marks a
  pooled selection unambiguously. `03 - Resources/Locations` is the case that settled it
  — 3 notes, seventh in the order, sharing the tail slot with six other folders, and
  pushing it slid those 3 out through their cell-mates. Measured cost of including them,
  while that folder is selected:

  | highlighted | notes | cross-collisions |
  |---|---|---|
  | `People`, `00 1 on 1` (named, own wedge) | 81, 62 | **0** |
  | `Rezepte` | 14 | 3 (worst 31) |
  | `Concepts` | 4 | 4 (worst 67) |
  | `01 Events` | 4 | 2 (worst 42) |
  | `04 Weekly Summaries` | 7 | **0** |

  The cause is real: pooled folders share one cell, so their notes are interleaved with
  their cell-mates at the same angles, and pushing a subset lands it between their rows.
  Worst case is ~67 graph units, about half a dot, on 4 notes, and only while selected.
  **Grouping a pooled cell by subfolder** to make the pushed run contiguous was tried
  and rejected: cross-collisions across the tail only fell 9 -> 7, one case got *worse*
  (`04 Weekly Summaries` 0 -> 3), and it perturbs the resting position of every pooled
  cell while costing the hubs-near-the-centre ordering. Living with a few transient
  overlaps is the better trade; giving every tail folder its own wedge is the only clean
  fix, and that is what the four-step tint ladder rules out.
- **Depth 2 and below is still never pushed; it only gets the ring.**
  A group moves as a block, and so does a *named* subfolder, because each owns its own
  sub-wedge — measured, highlighting `Partners` moves its 16 notes out 144 units with
  0 collisions. But the pooled "N smaller subfolders" are **one cell between them**,
  since cells are keyed by tint slot: their notes are interleaved through a shared
  wedge at the same angles. Pushing one of those slides a subset out *through* its own
  cell-mates, so the push meant to make the selection legible is what creates
  overlaps. `isPushed` therefore asks `ownsWedge()` first, and a pooled subfolder is
  identified by its ring alone — measured, `Rezepte` moves 0, rings 14/14, and the
  disc stays at 0 collisions. (A tail slot with exactly one occupant does own it, and
  does move.)

**One level of subfolders shows by default.** That level is the useful one — it is
exactly what the pie draws as sub-wedges. The first three subfolders are named and the
rest collapse into one "N smaller subfolders" row; *that* row has its own twisty, and
its contents are a second level that stays folded until asked for, because they all
share one tint step and the pie does not distinguish them either. Their swatches are
deliberately identical for that reason — pretending otherwise in the legend would be a
lie about what is on screen.

State is stored as `collapsed` rather than `expanded` precisely so the default is
open; an earlier version defaulted to folded and buried the level worth seeing.

Twisties never touch the layout — the pie already draws every sub-wedge whether or
not the legend lists it, so unfolding is pure disclosure and runs no cascade.
