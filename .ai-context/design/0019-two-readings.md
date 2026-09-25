# One sidebar, two readings

**Status** built · github#131 · concept measured 2026-09-08 as github#80, prototypes on
`concept/sidebar-readings`, never merged

## What shipped (github#131)

Reading **A**, as measured. The groups block carries a two-tab strip — **Groups** and
**Selected note** — and shows one reading at a time.

- **The tabs are plain wrappers**, `#vg-readgroups` and `#vg-readnote`, and the panel is what
  gets `hidden`. That is deliberate: the spike proved `hidden` is unreliable on anything this
  stylesheet gives a `display` of its own, and it cost four separate fixes to learn it. Hiding
  one wrapper sidesteps the whole class for everything inside it, now and for anything added
  later.
- **Selecting a note shows the note reading; deselecting shows the groupings.** Deselecting is
  the card's close button and a click on the stage away from a note — both already ran through
  `select(null)`, so one call site carries both gestures.
- **The note tab is disabled with nothing selected.** It says the reading exists without
  pretending there is something to read.
- **Each reading keeps its own scroll position**, so returning to the groupings lands where you
  left the folder list rather than at the top. This was an open question in the concept; it is
  answered yes.
- **The card is moved, not copied.** `cardHome()` puts `#vg-detail` in `#vg-readnote` on a
  desktop and back in `#vg-canvas` below 720px, driven by one `matchMedia` listener — because
  design/0013's sheet hides the whole sidebar, and a card inside it would go with it. The phone
  keeps the sheet and has no tab strip at all.
- **The card's action reads `Open`**, with `Open in Obsidian` as its tooltip.

**Measured, demo fixture, note `2019-02-01` (degree 125), 960×960 viewport, at the fit camera:**
**0 of 126 endpoints and 0.0% of the lit curve under the card, against 44 and 61.0% before**, with
the graph frame **334k → 486k px²** and the whole disc in frame. The sidebar carries 476px below
the fold while the note is shown. After the card's `×`: reading `groups`, note tab disabled, card
hidden, groupings shown.

The rest of this record is the concept work that chose A, kept because it is the argument for the
shape above and the measurement harness it leaves behind (`scripts/probe-room.mjs`).

---

> With a note selected the page runs two navigations at once and gives the graph neither.
> Four prototypes, measured; what the measurement said the complaint actually was; and why
> the answer is tabs.

## The complaint did not reproduce where it was reported

`#vg-detail` floats over the stage at `right: 12px; top: 12px; width: 278px`, and the issue
is that it "covers the part of the focus web it is describing". Nothing had put a number on
that, so `scripts/probe-room.mjs` does: it selects the highest-degree note through the real
search path and asks where the lit web lands — endpoints, and more honestly the curve
samples taken along the same quadratic `drawFocusWeb` strokes (`src/page.js:4251`), each one
classified as in the frame, under the card, under the camera cluster, or off the canvas.

**At 1600x1000 the card occludes nothing at all.** Not "a little": zero of 16,830 sampled
points on the demo fixture and zero of 32,850 on the 10k, at the fit camera, on both.

**What the percentage is.** The probe walks each lit edge at **91 evenly spaced values of the
quadratic's parameter**. A percentage here is therefore the fraction of *sampled points* — not
rendered pixel area, and not weighted by arc length, since a long edge and a short edge each
contribute 91 samples and samples bunch where the parameter moves slowly. It is a consistent
denominator for comparing one web under different chrome, which is all it is used for. The
endpoint counts beside it are exact: node centres, counted rather than sampled, and every
in-frame point is cross-checked against `document.elementFromPoint`.

The mechanism is geometric. The disc is fit to the **shorter** axis, so on a stage much wider
than it is tall the leftover width at each side is stage the disc was never going to use, and
the card lives in that leftover. **Occlusion therefore grows as the stage narrows relative to
its height, and falls to nothing as it widens.** Stated the other way round — as an earlier
draft of this record did, claiming the card "only starts biting once the box stops being much
wider than tall, at roughly `width >= height + 580`" — it is backwards as a sentence and wrong
as arithmetic: the 580 came from the card's own width and ignored the 1.08 fit ratio, which
shrinks the disc below the box height and hands back more slack than that.

**Measured instead of derived.** Demo fixture, one note (degree 125), height held at 631px:

| window | graph box | width − height | endpoints under card | sampled points under card |
|---|---|---|---|---|
| 1200x900 | 896x631 | 265 | 13 of 126 | 5.4% |
| 1320x900 | 1016x631 | 385 | 4 of 126 | 0.1% |
| 1440x900 | 1136x631 | 505 | 0 of 126 | 0.0% |
| 1560x900 | 1256x631 | 625 | 0 of 126 | 0.0% |
| 1680x900 | 1376x631 | 745 | 0 of 126 | 0.0% |

Monotonic in width, reaching zero between a width−height gap of 385 and 505. One height on one
fixture, so that is a measured crossover for this case and not a law.

So the honest statement of the defect is **narrow-window**, not general:

| fixture | window | graph box | endpoints under the card, at fit | curve under the card |
|---|---|---|---|---|
| demo | 1600x1000 | 1296x731 | 0 of 126 | 0.0% |
| 10k | 1600x1000 | 1296x731 | 0 of 353 | 0.0% |
| demo | 1200x900 | 896x631 | 13 of 126 | 5.4% |
| 10k | 1200x900 | 896x631 | 28 of 353 | 1.7% |

An Obsidian pane is narrow. A laptop is narrow. So the complaint is real for the shapes the
plugin actually runs in, and absent on the wide desktop window every screenshot in this repo
has been taken at — which is why looking at the shipped screenshots raised it and no
measurement had.

**A second defect surfaced on the way** and is not the card's fault. At the walk camera —
`centerOn` at ratio 0.22 (`src/page.js:5032`) — far more of the lit web leaves the canvas than
the card ever covers. An earlier draft compressed this to "twenty times more", which is not
supportable: the ratio turns on both fixture and viewport, so each pair is quoted with its own
state. Highest-degree note, sampled points:

| fixture, window | off canvas | under card | ratio |
|---|---|---|---|
| demo, 1600x1000 | 60.9% | 0.2% | ~300x |
| 10k, 1600x1000 | 38.9% | 3.9% | 10x |
| demo, 1200x900 | 63.9% | 1.3% | 49x |
| 10k, 1200x900 | 42.8% | 7.3% | 6x |

The probe picks the *highest-degree* note by design, whose neighbourhood needs more room than an
ordinary one, so the spread was measured too. Demo fixture, box 1136x631, walk camera:

| degree rank | degree | off canvas | under card |
|---|---|---|---|
| 1 | 125 | 60.2% | 0.3% |
| 10 | 46 | 42.0% | 10.0% |
| 100 | 13 | 39.0% | 3.7% |
| 500 | 6 | 36.3% | 9.0% |

Hubs are worst, as that objection predicted, but the loss never falls below about a third even
for a six-link note. The under-card column is small and non-monotonic — it turns on where the
note happens to land relative to the card, and carries no trend.

**None of this justifies changing the walk-zoom constant, and this record does not propose it.**
A loss running from 36% to 60% with degree is the shape of problem a single fixed ratio cannot
solve. Three candidates want comparing across several degrees and pane sizes first: an adaptive
neighbourhood fit, a capped zoom, and preserving the user's camera and only panning. Its own
issue and its own spike; moving the card cannot touch any of it.


## What was built

Four prototypes behind one `?proto=A|B|C|D` switch rather than four exclusive commits, so a
comparison is a reload rather than a rebuild and the graph box cannot drift between them.
With no `?proto=` every branch returns immediately, which is what makes *the resting page is
unchanged* true by construction instead of by measurement.

All four are driven from `select()` and nothing else. `focusSet()` reads
`state.hovered || state.selected` (`src/page.js:4235`), so a panel that copied that
expression would swap the navigation someone is reading on every mouse move across the disc.
The prototypes never read `state.hovered`; D's side is chosen from the selected id.

## The numbers, at 1200x900, at the fit camera

| | endpoints under card | curve under card | frame area | sidebar overflow |
|---|---|---|---|---|
| **today** | 13 / 126 | 5.4% | 436k px² | 46px |
| **A** tabs | 0 | 0.0% | **561k px²** | 533px |
| **B** block | 0 | 0.0% | **561k px²** | 1067px |
| **C** dock | 0 | 0.0% | 370k px² | 46px |
| **D** yield | 16 / 126 | 1.0% | 436k px² | 46px |

Demo fixture; the 10k agrees on every ordering.

**C reaches zero by shrinking the thing it is protecting.** Insetting the stage takes the
graph box from 896 to 594px wide, so its frame area — 370k — is *below the 436k the
unmodified page already had*. It also moves the disc 151px sideways on every select and
every deselect, because the camera's `x: 0.5` is normalised to a container that just
changed width. It is the only prototype that touches the camera box, and it buys nothing the
sidebar prototypes do not buy for free.

**D is worse than doing nothing at the walk zoom** — 9.4% occluded against the baseline's
1.3% on the demo fixture, 10.7% against 7.3% on the 10k. The heuristic is chosen inside
`select()`, but `centerOn` flies the camera *afterwards*, so the side is decided against the
camera as it was before the flight and is stale exactly when a walk is happening. Choosing
after the landing would mean a card that hops sides 420ms after every click, which is worse
than the problem. The concept does not survive contact with the animation.

**A and B are identical on occlusion and differ on the column.** Both return the stage whole
— 561k, every sampled point in frame — because the sidebar is outside the stage. What separates
them is scroll debt: B stacks the card below a still-present folder list and leaves
**1067px** of hidden sidebar; A replaces one reading with the other and leaves **533px**.
Folding the legend, which is B's whole idea, saves little, because a collapsed legend is
already short — the length is the card's own 125 linked-note rows.

## The pick: A

Tabs. It is the only option that returns the stage whole *and* keeps the column to one
reading at a time, and it is the only one that gives the card the sidebar's full height —
25 linked notes visible at once against about 10 in the floating overlay, with the hop trail
no longer competing for a 278px box.

What it costs, stated rather than discovered later:

- **A tab is a thing to notice.** Selecting a note puts a badge on a tab and otherwise
  changes nothing on screen; if nobody finds it, the card is worse off than floating, which
  is the risk github#80 named for this option. Not measurable here — it needs a person.
- **533px of sidebar overflow remains.** That is the card, not the layout, and it is the
  same card that scrolls today inside its own box. Capping the linked-notes list, which
  already slices at 40, is the lever if it matters.
- **It is the most code of the four**, and the only one that adds a control.

## Two defects the prototypes only showed when looked at

Both were invisible to every number and came out of opening the screenshot, which is what
this repo's own rule about the checks that assert numbers is for.

- **The close button escaped to the corner of the page.** In the sidebar the card is
  `position: static`, so its absolutely-positioned `.x` anchored to `.vault-graph` — the
  nearest positioned ancestor — and landed in the top-right of the whole app. The slot
  carries the positioning context now.
- **The folder list went on rendering underneath A's own tab.** `#vg-legend` sets
  `display: flex` through an **id** selector (1,1,0), which outranks the shared
  `[hidden][hidden]` rule (0,3,0) that the page uses to hide things — so the Groups row above
  it obeyed `hidden` and the legend did not, and the tab showed both readings at once. This
  is worth remembering beyond the spike: **`hidden` is not reliable on any element this
  stylesheet gives a `display` through an id.**

## What the gates did and did not show

`smoke.mjs --only` ran **33/33 across all three fixtures** with the golden snapshots unchanged,
and every static check is green with `check-comments` back at its 384 baseline. All of it ran
**with no `?proto=`**, which is exactly the claim worth making for a throwaway branch — the
shipped path is untouched — and is **not** evidence that A's selected-note behaviour is correct.
Nothing here exercised a prototype's interactions.

Before A is built, its actual selected state needs testing: selection from the graph and from
Search, finding the tab, following a link, returning to Folders, clearing the selection, hover
that must not change selection, a separate scroll position per reading, keyboard and focus on
the tab control without claiming a global shortcut (design/0012), and crossing the 720px
breakpoint with a live selection — already a known failure in the prototypes.

### Three the rebase onto develop found, 2026-09-12

The "shipped path is untouched" claim above was not quite true when it was written, and no
check could have said so.

- **Two CSS rules were not gated on `?proto=` at all.** `--proto-dock-w` was declared on every
  page, and the `#vg-legend[hidden]` fix from the section above was applied **unconditionally** —
  a live behaviour change on the shipped page, inert today only because nothing outside the
  spike hides the legend. The root carries `data-proto` when `PROTO` is set and both rules hang
  off it now.
- **Renaming `VIEW_TYPE` to `vault-graph-spike-view`** — so the spike installs beside the real
  plugin — left `plugin/styles.css` matching `[data-type="vault-graph-view"]` exactly, so the
  spike's view lost `padding: 0; overflow: hidden` and sat in Obsidian's own padding. Nothing
  could see it: the suite never runs in Obsidian. Matched by prefix now. Two of five harnesses
  (`record-live.mjs`, `update-note-check.mjs`) were missed by the same rename.
- **`probe-room.mjs` opened real Chrome unlabeled**, which the brief forbids of any build a
  worktree serves. It patches `VAULT_DATA`'s `vault` field after building.

- **`probe-room.mjs` took no screen lock**, though it parks a Chrome window on a fixed display —
  the one harness of the four not doing so (github#87). It takes `screen-left` now, and the first
  filmed run waited 18s behind another session's clip, which is the lock earning its keep
  immediately.

The record moved **0015 → 0019**: every number between was taken by work that landed while this
branch was open.

### Re-measured on the rebased develop, and the complaint got worse

The numbers above were taken before `FIT_RATIO` was cut from 1.04 to 0.954 (github#128). That cut
makes the disc fill more of the viewport, so it reaches further under the card, and **every
occlusion number in this record is now an underestimate.** Same fixture, same note (`2019-02-01`,
degree 125), same fit camera:

| | today | A | B | C | D |
|---|---|---|---|---|---|
| **1200×900** endpoints under the card | **18**/126 (was 13) | 0 | 0 | 0 | **25**/126 (was 16) |
| curve under the card | **11.8%** (was 5.4%) | 0.0% | 0.0% | 0.0% | **3.0%** (was 1.0%) |
| graph frame | 436k px² | 561k | 561k | 370k | 436k |
| sidebar hidden | 116px | 593px | 1160px | 116px | 116px |
| **960×960** endpoints under the card | **44**/126 | 0 | 0 | 0 | **51**/126 |
| curve under the card | **61.0%** | 0.0% | 0.0% | 0.0% | **18.6%** |
| graph frame | 334k px² | 486k | 486k | 266k | 334k |

The square window is the case this record predicted and never measured: it said the card bites
once the graph box stops being much wider than tall, and at 960×960 **the card covers 61% of the
lit web** — more than the walk camera throws away at that size (67.7% off canvas). The orderings
all survive: A and B reach zero and keep the stage whole, C reaches zero by shrinking the box it
protects (370k → **266k** at square, against an unmodified 334k), and D is still worse than doing
nothing. **The pick does not change; the case for it is stronger than the record claimed.**

### A fourth instance of the `hidden` trap, found the same way

`.dimseg.dimfull` — the Folders/Tags grouping control — **ties** `[hidden][hidden]` at (0,3,0) and
wins on source order alone, sixty lines later, so it kept rendering under A's own tab next to the
card. Not an id this time: a tie. The fix is one child rule at (0,4,0), which covers every future
sibling of the block too.

Replacing the `#vg-legend` id rule with that general one was a mistake caught by the same method
within a minute: `#vg-legend` is (0,1,1), and **no stack of classes outranks an id**, so dropping
it put the entire folder list back under the tab. Both selectors stay.

That is four instances on one branch, three of them found by opening a screenshot and none by any
check. The rule to carry away is broader than the one this record first wrote down: **`hidden` is
unreliable on anything this stylesheet gives a `display` of its own — through an id, or through a
class rule that lands later in the file.**

## What is left open

- Whether **Search** belongs with Folders or is a third reading. It answers "find a note",
  which is how a walk starts, and it stayed above the tabs untested.
- Whether clearing the selection returns to Folders (what the prototype does) or stays put.
- Whether the folder list is genuinely unused mid-walk. Still an assumption; worth watching
  once rather than designing around.
- The walk-zoom finding above, which wants its own issue.
