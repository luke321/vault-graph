# Groups navigation

**Status** as-built · extracted from the README on 2026-08-22

> The sidebar: eye vs label, three selection channels, and the tail block.


**The heading is the grouping control** (github#86, design/0015). `Groups (18)` is a
**segmented control** across the full width of the panel, `Folders (4)` | `Tags (15)`, each
side carrying its own dimension's group count, and everything below it is the list of
whichever side is pressed. The control belongs to the thing it changes — not the view
settings, not the top bar, not a hidden context-menu item. **All** and **None** sit on a
second row beneath it at their own width, because they are a different kind of thing: one
switches what the disc is cut by, the others change what is shown within that cut.

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

## The `only` chip does not highlight

Hovering a legend row hover-highlights its group -- bigger dots, pushed outward by `HL_PUSH`.
The `only` chip sits inside the row, and the click it invites starts a cascade with the pointer
still on the chip, so the highlight rode the whole cascade and overlapped the notes in flight
(seen 2026-09-06, side by side on a mirror of the reporting vault). The chip's own `mouseenter`
clears the hover highlight; leaving it for the rest of the row hands the row's highlight back;
hovering the row anywhere else is unchanged.

## Each row draws its share of the largest folder shown

**Status** as-built · github#78 · 2026-09-08, denominator revised the same day

The disc makes a lopsided vault obvious at a glance. The legend did not: every row was the
same height and the same weight, and the imbalance survived only as `.ct` — 11px,
`--text-3`, tabular, and the least prominent thing in the row. On the demo mirror that meant
**406 notes and 1 note got the same row**, a 406x spread rendered eighteen times identically.

Each row whose count is a **plain number** now carries a 2px rule along the bottom of `.lg`,
in the group's own colour, **its length that row's count against the largest count among the
folders currently visible** — so the biggest folder on screen fills its row and every other
bar is read against it.

**It is a view setting, `countBars`, on by default.** The gear carries it as "Count bars in
the legend" beside the other three view options, and the plugin's settings tab gets the same
row from `VIEW_SETTINGS`, so it persists per vault. Per decisions/0009 the page stores
nothing: the host hands `countBars` in and takes `onCountBars` back. Turning it off removes
the bars and nothing else — measured, 17 of 18 rows barred becomes 0 barred with all 18 rows,
their counts and their shared right edge untouched. `setCountBars` rebuilds only the legend,
because a bar is sidebar DOM and CSS: no relayout, no cascade, no renderer refresh.

**It measures notes, and the wedge beside it measures notes within its own ring.** Angular
share is allocated per band (design/0001), so a small inner-band folder can hold a wide
wedge and still draw a short bar. The two disagree by design, and the count's title names
its reference so nothing pretends otherwise.

**The vault-wide denominator shipped first and was replaced the same day.** Dividing by every
note on the page is the more obviously *honest* number — the bar's fraction of its track is
literally the fraction of the vault — but measured on the demo it made the largest bar 62.8px
of a 217px track and left the small folders as stubs nobody could tell apart. Against the
largest shown, 60 / 50 / 48 / 36 / 24 notes read as visibly different lengths and the biggest
folder fills its row. The comparison a reader actually makes in a legend is *this folder
against the biggest one*, not *this folder against a total that appears nowhere on screen*.
The cost is that the number is relative, which is why the title carries the reference.

**The bar is a background layer, not a fifth grid column, and the numbers are why.** `.nm`
is the only `1fr` cell and is already truncating — 122px against the 123px that
`09 - Maps of Content` needs, on both the demo and the 10k fixture. Worse, `.nm` is not one
width down a single list: **122px on a three-digit row, 117px on a four-digit one, 141px on
the row that drops its `only` chip**. So the issue's own first suggestion, a rule behind
`.nm`, would have handed the biggest rows a 4% shorter track than their neighbours. `.lg` is
**219px on every row**, which makes the row the only honest track. An inset shadow cannot
take a percentage at all, and `box-shadow: inset 2px 0 0 0` is already the third channel
selection uses.

**It adds no element and no target.** The row already carries four (eye, twisty, label,
`only`); a fifth would be a lie about what is clickable. The bar has no handler, no
`tabindex`, and lives entirely in `.lg`'s own background.

**A bar belongs to a plain count and to nothing else.** A parenthesised count means the
notes are tallied somewhere other than this row's own wedge — github#50's folder whose notes
stand elsewhere, and the unlinked group kept separate — so those rows draw nothing, as do the
`.lgr-empty` rows at zero. Brackets already mean "no share of the disc"; a bar under them
would say the opposite. The consequence is intended and worth knowing: with `(unlinked)`
kept separate the folder bars sum to **1370 of 1403** on the demo, and that row is the
remainder.

**Subfolder rows are bare.** `subCount` is within one parent, so a vault-scaled sub-bar is a
stub on every row, and a parent-scaled one puts a second denominator in the same list — in a
list that already truncates 2 of its 36 sub-names at 100px. The sub-wedge on the disc already
carries the within-parent share. Parent-scaled sub-bars remain a thing that could be added,
with a label; two silent denominators in one list is the thing that must not be.

**A one-note folder is floored at 4px** rather than dropped, so every folder standing on the
disc marks its row. Measured: exactly one full bar at the **217px** track on each fixture —
basis 406 on the demo, 4358 on the 10k, 738 on the shape vault — and a thinnest of 4.0px on
all three.

**The bar starts 2px in, and the floor is 4px, because two row states paint over it.** A
background layer loses to anything drawn above it, and both of these eat the *leading* edge
where a bar begins: `:hover` makes the row's transparent border visible and its antialiasing
costs 1px, and `[data-hl="on"]` draws its leading channel as `box-shadow: inset 2px 0 0 0`,
which paints over a background image and costs 2px. At a 1px floor three of eighteen rows on
the demo lost their bar outright in both states. `background-position: 2px 100%` puts the bar
past the accent band and the 4px floor leaves 3px in the worst state.

The bar stays in the padding strip **below** the content on purpose. `background-origin:
content-box` also dodges both overlays, but it lifts the bar into the content row where the
`only` chip lives, and that opaque chip punched the full bar from 205px down to 152px on
hover. `invariants.md` carries the measurements, the three traps the check hit, and the
Obsidian box-shadow explanation that was measured away first.

**The bars re-scale on a visibility toggle**, which is the direct consequence of *visible*
being in the denominator and the opposite of what the first version did. Hide the largest
folder and the runner-up is promoted to a full bar; show it again and the basis returns.
That is asserted rather than merely allowed: on the demo, hiding `05 - Meeting Notes` must
move the basis to 200 with `01 - Projects` at 100%.

**A hidden row keeps its bar, clamped at 100%.** Its count is still on screen, so a bar
belongs there; but it is out of the basis, so it could otherwise exceed the track.

**The tooltip names the reference**, because a proportion with an unnamed denominator is not
a measurement: the largest row reads `406 notes · the largest folder shown`, every other row
`143 notes · 35.2% of 05 - Meeting Notes`. If the denominator changes again, that string
changes in the same commit. `invariants.md` carries the check, the before/after layout table,
and the pixel measurement of the painted length.

### A hidden folder draws no bar, and the host may not paint over one

The bar counts what is **on the disc**. A folder behind a closed eye contributes nothing, so it
draws nothing — not a clamped bar. It is out of the basis too, so it cannot set the scale for
the rows still drawn. `only` therefore leaves exactly one bar, filling its row, which is the
reading a person expects from "show only this folder". The clamp this replaced was concealing
an absurdity: a hidden largest folder declared **203%** of a basis it was no longer part of.

**The page resets `box-shadow` on `.lg`.** It is a `<button>`, and Obsidian gives every button
an inset shadow with 0.5px spread — which wraps all four edges and paints over a background
image, including the bottom strip the bar occupies. Without the reset the host decides whether
the bar is visible, and on a 4px bar it decided no. An earlier note here cleared Obsidian of
this; that test was run on the 100% bar, where a 1.5px edge haze is invisible, and it was
wrong. `obsidian-smoke.mjs --only "hover"` now asserts `shadow: none` in a real Obsidian.

### The bars walk on the cascade's clock, not on a clock of their own

A bar's width is part of the layout, so it animates the way the layout animates: inside the
cascade's own frame loop, off the same eased progress the notes get. `barWalkStart()` runs once
where the loop is armed, `barWalkTick(ease)` runs beside the note interpolation, and
`barWalkEnd()` fires at the `converged` exit and paints the resting values **by assignment** —
so the last frame IS the resting layout rather than something that merely converged on it.

A CSS transition was the obvious alternative and is the wrong one: it would run on its own
clock, land whenever its own duration expired, and put a second source of truth for "where is
the bar now" next to the cascade's. `animation.md`'s core invariant only holds if one clock owns
the frame.

A row losing its folder is the case that decides the design. Its resting share is 0, so the
obvious render drops the `bar` class — and the bar leaves in one frame while the disc takes the
whole cascade to re-pack. So `paintBars` owns the class rather than the markup: a row gains its
bar when its painted width rises above zero and loses it when the walk reaches zero, and the 4px
presence floor is lifted by `.bar-out` on a row on its way out, or the shrink ends in a 4px stub
that blinks out regardless.

Because `paintBars` can add the class, **every row carries `--vg-bar` whether it has a bar or
not**. A row that gained its bar mid-walk otherwise had no colour to draw with:
`background-image: none` under a `background-size` that read perfectly correct. The class and the
width live in two places, so the colour has to live in the one place that is always rendered.

The state is three maps mirroring `colorShown`: `barPrev` and `barNow` are the endpoints
recorded per render, and `barShown` is what is painted mid-walk — `null` at rest so the resting
value is authoritative, and read only while `cascadeRun` is live so a stuck walk is
unobservable. Because a click rebuilds the legend, the row's class comes from the resting share
and its width from `barShown`; taking both from one value gives either a snap or a bar that
outlives its folder.

### The bar's colour is cached, and goes stale with the swatch it sits under

The bar takes `colorOf(g)` as an inline hex in `--vg-bar`, which is exactly the treatment the
swatch beside it already has. Both therefore keep the old palette after a live theme flip.
**Measured on the demo mirror, running precisely what `syncTheme()` does** — set `data-theme`,
`readTheme()`, `renderer.refresh()` — for slot `g7` (`05 - Meeting Notes`), dark to light:

| surface | mechanism | dark | after the flip |
|---|---|---|---|
| `--g7` token | CSS | `#9085e9` | **`#4a3aa7`** |
| the picker's `.swatch.vg-g7` | class + `var(--g7)` | `#9085e9` | **`#4a3aa7`** |
| the legend row's swatch | inline hex | `#9085e9` | `#9085e9` |
| **the count bar** | inline hex | `#9085e9` | `#9085e9` |

**This is not the bar's doing and the bar does not make it worse.** The picker has always
repainted and the legend has always gone stale — verified on a `develop` build with neither
open colour branch applied. What the bar adds is one more surface that is stale *in step with
its own swatch*, which is the property that keeps a row internally coherent: the two never
disagree with each other, even while the panel above them does. Tracked as **github#84**, with
design/0004 corrected to state both mechanisms rather than claiming the whole DOM uses classes.

**Checked in both places, and both have teeth.** `smoke.mjs --only "theme flip"` opens the
gear on the standalone page, flips, and asserts the bar agrees with its own swatch while
*reporting* the token divergence and naming github#84 — a known defect stays visible instead
of failing the gate. `obsidian-smoke.mjs --only "theme"` does the same through the real
`css-change` path in a real Obsidian. Making the bar resolve `var(--gN)` live while the swatch
stays cached fails both, which is the regression that a partial fix to github#84 would be.

One trap worth keeping: the check normalises colours by probing a throwaway span, and that span
must be appended **inside `.vault-graph`**. `--gN` is scoped to that root, so a `var()` probed
from `document.body` comes back `rgb(0, 0, 0)` and reads as a broken colour rather than a live
one — which is what the first cut of the mutation test reported.

### With github#77 applied, the disagreement widens but does not change in kind

github#77 declares the palette as `--gN-l` / `--gN-d` pairs and previews a slot as the dots it
will draw, filled from `var(--sl)` / `var(--sd)`. That adds live surfaces, so the combined
branch shows the picker and its preview correct after a flip while the legend row and its bar
are not. **Measured on a real merge of both feature branches into `develop`**: identical to the
table above — token and picker move, legend swatch and bar stay. Neither branch introduces the
divergence and neither alone reveals it, which is why it is github#84's rather than either
one's.

Two integration notes for whoever merges them. `src/page.css` and `src/page.js` merge **cleanly**
between the two branches — the colour work and the bar do not touch the same rules. `smoke.mjs`
does **not**: both branches append checks at the same point, and the naive union of the two
sides does not parse. It needs a hand resolution.

### When drill-down lands, the denominator stays deliberate

The basis is *the largest folder currently visible*, and github#76's drill must not quietly
change what "currently visible" means. A drill that narrows the legend to one folder's children
makes those children the visible set, so the basis would become the largest child — which is
probably the right reading, but it is a **decision with its own record and its own check**, not
a side effect to discover later. Whatever it resolves to, the tooltip must keep naming the
folder the bar is measured against; that string is the only thing standing between a relative
bar and a number that means nothing.

**This section is itself the precedent.** The denominator has already changed once, from every
note on the page to the largest folder shown, and what made that safe was that the check and
the tooltip changed with it in the same commit. Do the same.
