**Belonging.** An unlinked note stops sitting apart and joins its own folder — same wedge,
same colour, same everything as any other note filed there. A folder that holds notes keeps
its row and its colour whether or not its notes are currently drawn in it. And a folder's
**hidden by default** is now a right-click away in the legend, instead of a trip through
the settings panel.

![The whole disc growing from the vault's first note, a note read, notes pinned to the hub, the date range and heatmap window driven by hand, folders hidden and soloed, subfolders unfolded and coloured, the camera driven and reset, and folder colours set and put back](https://raw.githubusercontent.com/luke321/vault-graph/release/1.9.0/assets/demo.webp)

### New: unlinked notes join their folder

A note with no links at all used to be filed with every other unlinked note, in one grey
population of strangers. It now takes its own folder's wedge, band, colour, count, filter
and highlight, like any note filed there — because that is where you actually put it.

Right-click the `(unlinked)` row, always the last one in the legend, to switch that off and
get the separate population back: its own wedge, one flat recessive grey, a parenthesised
count. A second toggle appears one row down once that group holds anyone — **Colour by
folder** — for notes that stay in the population but still take their own folder's tint,
turning the row's swatch into a gradient of whatever is actually in it. Both toggles are
settings-panel rows too, for anyone who would rather work down a list than right-click.

![The (unlinked) row right-clicked to keep its notes separate instead of joining their folder, the wedges reallocating around a new group, then right-clicked again to colour those notes by their own folder anyway, and both toggles put back](https://raw.githubusercontent.com/luke321/vault-graph/release/1.9.0/assets/features/unlinked.webp)

### New: a folder keeps its row, its place and its colour

Automatic colours are handed out by a folder's position in the legend, and that list used to
hold only folders with a note actually *standing* in them. So a folder made entirely of
unlinked notes vanished from the legend the moment you kept those notes separate — and every
folder behind it slid one slot along and took the colour of the one in front. Measured on a
six-folder test vault: turning the toggle off left five rows of seven and repainted four of
them, on a change to nothing but where unlinked notes stand.

The list now comes from where notes are **filed** rather than where they are drawn. A folder
keeps its row, its place and its colour either way, and both settings of the toggle agree on
every colour. A row whose wedge is currently drawing none of its notes says so plainly —
greyed, with its count in parentheses, `tiny (6)`, and no eye or `only` chip, neither of
which would have anything to act on.

**Two colour shifts happen once, on upgrade, and only on some vaults.** `(unlinked)` is out
of the twelve-slot rotation now (it takes the same recessive grey archives do, since neither
is a folder anyone organised), so a vault that *had* unlinked notes moves every
un-overridden folder one slot; and a vault already running with them kept separate, with
folders made entirely of them, shifts once onto the assignment the default has always used.
A folder with an explicit colour never moves, and a vault with no unlinked notes is untouched
by either.

### New: hidden by default, from the legend

Some folders are noise most of the time — an archive, a template store, a folder of
attachments. Right-click any folder's row and toggle **hidden by default**, one row below its
colour picker, and it starts hidden every time the disc opens: this session and the next, on
whichever host you opened it from. **All** leaves it alone now, so "show everything" no longer
quietly overrides the one folder you asked to keep out of the way.

![The biggest folder right-clicked in the legend and hidden by default from its own menu, the wedges reallocating around the gap it leaves, then the setting put back](https://raw.githubusercontent.com/luke321/vault-graph/release/1.9.0/assets/features/hiddenbydefault.webp)

The setting itself is not new; reaching it from the legend is. And on the Obsidian plugin it
never actually persisted — it repainted the view live and silently reverted on the next
reload, because the plugin's own settings writer was never wired for it. Fixed here too.

### Fixed: links you can still trace when you zoom in

Link thickness was scaling with the camera the way a note's dot does, which is right for a
dot and wrong for a connector. Zoomed in on a well-connected note, its links merged into one
solid mass — so the single gesture you'd use to look *more* closely at a note's connections
was the one that destroyed them. Strokes are now capped in pixels and hold a constant width
below the cap, at any zoom, with weight differences preserved. **The resting disc is
unchanged**: the cap only engages about 2.7x in. Reported by
[Angel Bartolli / @bartolli](https://github.com/bartolli), who named the exact cause and
offered a working patch branch — the 4px cap is their measurement.

Found while fixing that: every link was drawn at a minimum of 1.7px when the width it asked
for was between 0.55px and 1.02px, a floor inherited from the graph library and never chosen.
One link a pixel too wide is invisible; a few thousand of them crossing the middle is a grey
haze over the inner rings and the hub hole. The floor is 1.0px now — half the ink, a readable
centre, and still wide enough that a lone link on a sparse vault doesn't thin away to nothing.

### Fixed: a note soloed next to the hub

Soloing a folder down to a single note that lands alone in the inner band collapsed that band
to one row, at which point the size ramp read the band's whole thickness instead of a row's
slice and the dot ballooned across the hub hole. Measured at 59% of the hub before, 8.0%
after. 1.8.0 fixed where the hub boundary is *drawn* and left this half open.

### Smaller things

- **The layout has a golden snapshot to regress against.** Every other check asserts a
  *property* of the layout — rows balanced, radii evenly spaced — and none would notice a
  layout that stayed internally consistent and simply changed between builds. Band assignment
  per folder and position per note are now checked in for all three fixture vaults, and a
  failure names the folder that flipped band or the note that moved. The snapshots are
  rewritten by hand and never automatically: one that updates itself records whatever broke.
- **Every generated demo/test fixture now guarantees a handful of genuinely unlinked notes**,
  so the checks this release depends on always have something real to measure instead of
  silently passing on a vault that happened to link everything.
- Both new features have their own entry and clip in the
  [feature gallery](https://github.com/luke321/vault-graph/blob/release/1.9.0/docs/features.md).

---

## 1.9.0 — "Belonging" — 2026-09-02

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
  place ahead of the real folders, so it never displaces anyone. Taking `(unlinked)` out of
  the rotation, though, does move the automatic colours by one slot on a vault that had
  unlinked notes — in 1.8.0 a populated `(unlinked)` sorted first and consumed slot 0, which
  no group now does. That is one of the two upgrade-time colour changes here; a folder with an
  explicit colour, and any vault with no unlinked notes, is untouched by it.

- **A folder that holds notes keeps its row and its colour.** The automatic colours are
  handed out by a folder's position among the groups in the legend, and that list used to hold
  only the groups with a note actually standing in them — so a folder made entirely of
  unlinked notes dropped out of the legend the moment you kept them separate, and every folder
  behind it slid one slot along and took the colour of the one in front. Measured on a
  six-folder test vault: turning the toggle off left five rows of seven and repainted four of
  them, on a change to nothing but where unlinked notes stand. The list now comes from where
  notes are **filed** rather than where they are drawn, so a folder keeps its row, its place
  and its colour whether or not its own notes are in it — and both settings of the toggle now
  agree on every colour, where before flipping it repainted half the disc. A row whose wedge is
  currently drawing none of its notes says so: greyed, with its count in parentheses —
  `tiny (6)` — and without an eye or an `only` chip, neither of which has anything to act on.
  This is the second upgrade-time colour change: a vault already running with unlinked notes
  kept separate, and with folders made entirely of them, shifts its automatic colours once
  onto the same assignment the default has always used. A folder with an explicit colour is
  untouched.

- **Kept separate is not the same as flat.** A second, independent toggle,
  `unlinkedTintByFolder` (off by default) — a note that's staying in the `(unlinked)`
  population can still take its own folder's colour instead of the flat swatch, the exact
  "mixed color dot" the original reopen comment asked for. Only offered once
  `unlinkedByFolder` is off, since there's nothing left to recolour once every unlinked note
  has already joined its folder. Same right-click row and settings-panel treatment as the
  membership toggle above.

- **A folder's "hidden by default" is now reachable from the legend** (github#34) — right-click
  any folder's row and toggle it there, one row down from its colour picker, instead of opening
  the settings panel for the one thing you wanted. The folder stays hidden every time the page
  opens until you switch it back, and the legend's **All** button no longer overrides it. **And a
  fix to a fix, found while building the above:** on the Obsidian plugin host that toggle never
  actually persisted — it repainted the view live and silently reverted on the next reload,
  because the plugin's own settings writer was never wired for that setting. Fixed alongside,
  since the wiring this release needed for the new setting was nearly identical. It also
  gets **its own gallery entry** — [`docs/features/hiddenbydefault.md`](docs/features/hiddenbydefault.md)
  — and a clip that is only this control: the full storyboard toggles it mid-way through
  the folders act, between beats that shipped several releases ago, so the act is repeated
  on its own (clip-only, like `subfoldercolor`) rather than asking a reader to find it in
  someone else's footage.

- **Every generated demo/test fixture now guarantees a handful of genuinely unlinked
  notes**, so the checks this release depends on (and any future one) always have something
  real to measure instead of silently skipping on a vault that happened to link everything.

- **Its own gallery entry** — [`docs/features/unlinked.md`](docs/features/unlinked.md) —
  and its own beat in the demo storyboard, last of all: both toggles here touch colour, so
  it runs after "colours" for the same reason that one used to run last on its own.

- **A note soloed next to the hub no longer overflows into it** (github#35, the dot-sizing
  half). 1.8.0 fixed where the hub boundary is *drawn* and left this half open, after a first
  attempt was reverted the same day for breaking two other fixtures. Row 0 of the inner band
  sits with its centre exactly on the hub boundary in every layout, so nothing but a dot's own
  radius decides how far it visually pokes inside — and soloing a folder down to a single note
  that lands alone in that band collapses the band to one row, at which point the size ramp
  reads the band's whole thickness (573 units, measured) instead of a normal row's slice and
  the dot balloons across the hole. A row-0 dot is now capped at a fixed share of the hub's own
  radius — 8%, twice the 4.2% a healthy one measures at rest — scoped so narrowly that it
  cannot reach any other row or band, which is the promise the reverted band-wide attempt could
  not make. Measured 59% of the hub before, 8.0% after. The new check tries every folder in turn
  and asserts the worst one, because none of the three fixtures reach this shape at rest — which
  is how it shipped unnoticed the first time.

- **The layout now has a golden snapshot to regress against** (github#37). Every other check
  asserts a *property* of the layout — rows balanced, no stray small folders, radii evenly
  spaced — and not one of them would notice a layout that stayed internally consistent and
  simply changed between builds, which is what github#35 turned up as a side observation.
  Band assignment per folder and position per note are now checked in for all three fixture
  vaults, and a new check compares a live build against them, naming the specific folder that
  flipped band or the specific note that moved rather than reporting a mismatch. The snapshots
  are rewritten by hand and never automatically: one that updates itself records whatever broke.

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

- **A selected note no longer flicks when you stop hovering it** (github#38, reported by
  [Angel Bartolli / @bartolli](https://github.com/bartolli), who named the exact cause in the
  issue itself). A selection is meant to hold the hover treatment pinned at full throughout;
  instead, pointing at the note you had already selected switched it onto the ramping branch, so
  moving away drove its size and its lit web *down* toward the unselected value and then snapped
  back to full a frame later. Measured on the demo vault: 2.79 → 2.07 across the leave, then
  straight back to 2.8096. The fix is one line — ramp only when the hovered note differs from the
  selected one — after which the sampled size is byte-identical across every frame of both the
  enter and the leave. Hovering a different note, or hovering nothing, is untouched.

- **Hiding a folder reframes the camera, unless you have moved it yourself** (github#14).
  Hiding a folder big enough to hold the disc's whole extent left the camera framed for a vault
  that was no longer on screen — an island of notes in an otherwise empty stage. `fitRatio()`
  and `fit()` already computed the right framing and simply never ran on a filter change; they
  do now, behind a flag that only lets it fire while nothing has panned or zoomed the camera
  since it last rested, so a camera you placed deliberately is never overridden. The timing is
  direction-aware, which is what decides whether it reads well rather than merely happens: a
  shrink defers to the cascade's own settle, so the view doesn't zoom in on notes still visibly
  leaving, and a growth fires immediately alongside the incoming fade-in. Measured on a 954-note
  vault whose one dominant folder holds 77% of it — hiding it drops the disc's reach to 0.602,
  where the camera used to sit at 1.08 and stay there.

- **The disc no longer bursts out of its own ring during an animation** (github#44). Every
  cascade drew the outer band up to 35% thicker than the thickness it is locked to, so the rim
  swung out past the ring it lives in and contracted back as the animation landed — measured at
  1.336x the locked outer radius on a year chip over the 10,000-note vault, and worse the harder
  the filter bit. The inner hole was never touched, which is part of why it survived so long.
  The cause is a relation that was true at both ends and nowhere in between: a band's thickness
  is `rows x spacing`, the resting solve derives the two from that thickness in a single
  division precisely so they cannot disagree, and the cascade then walked both terms
  independently — and interpolating two factors does not preserve their product. Traced frame by
  frame, rows fell 24 → 19.15 while spacing rose 1.000 → 1.693, which multiplies to 32.42 against
  a locked 24.00. Spacing is now derived from the walked depth on every frame, the same single
  division the resting layout uses, so the product is the locked thickness by construction rather
  than by luck at the two endpoints. Worst overshoot after: 0.996x on year chips, 0.995x on range
  changes — inside the ring everywhere, and the inner hole is unchanged at 1.000x. Long-standing
  and shipped; not a regression from anything in this release.

- **Moving unlinked notes into their folders is now animated, not a jump** (github#45, then
  github#49 for the shape the animation finally took). The toggle relocates every unlinked note
  to a different wedge, and it did so in a single frame. The first animated version swept each
  note bodily across the disc to its new wedge — honest, but hundreds of dots crossing the
  middle at once read as a scramble. What shipped instead expresses the move in the vocabulary
  the disc already has: the `(unlinked)` wedge opens or closes exactly like a folder being shown
  or hidden — same arc ramp, same stretched fades, rings holding still throughout — while each
  note fades out where it was and fades back in where it now belongs, crossing wedges only while
  it is invisible. The cascade gained a third category for this (a *move*, alongside arrivals
  and departures): one clock, one planner, and the setting itself still flips instantly — only
  the drawing takes its time. The colour tween built for a group that re-ranked
  around the move (github#48) is still there and still fades rather than cuts, but after
  github#50 below there is nothing left for it to fade: no group changes colour across the
  toggle any more. One known rough edge stays, accepted on review: a vault where
  whole folders consist only of unlinked notes toggles several wedges at once, and the
  smallest of them can crowd its neighbour for a beat mid-animation.

- **Every folder that holds notes keeps its row, its slot and its colour** (github#50,
  resolving the recolour reported as github#48). The twelve automatic colour slots are handed
  out by position in `order[state.dim]`, and that list was built from the groups *currently
  holding a member* — so a group emptying moved every group behind it one slot along, and each
  inherited the colour of the one in front. Measured on the dominant-folder fixture, turning
  the membership toggle off: 7 legend rows down to 5, `(vault root)` and `tiny` vanishing
  outright — the two folders made entirely of unlinked notes — and 4 of the remaining 7
  recoloured. The list is now seeded from where each note is *filed*, in the same walk that
  tallies the groups, which is what github#48's suggested "keep its place in the queue" needed
  and could not give on its own: a note's folder does not change when its group does, and no
  filter moves it either, so the order is identical in every state the page can be in. After:
  7 rows in both states, 0 recoloured, 0 vanished. A row whose wedge draws nothing now says so
  — greyed, its count parenthesised, and without an eye or an `only` chip, neither of which
  has anything to act on. This is a runtime fix, not a retroactive one: the one-slot shift on
  upgrade described at the top of this release, which comes from `(unlinked)` leaving the
  rotation between 1.8.0 and 1.9.0, is unchanged by it.

- **The right-click menu's toggles now say what they are, not what clicking them undoes.** All
  three rows in that menu flipped their wording along with their state, which reads exactly
  backwards: on a vault where unlinked notes already join their folders the row said "Joins its
  folder", so clicking the thing you wanted turned it off. It also disagreed with the settings
  panel, where the same two settings have always had a fixed label with the toggle holding the
  state — and with a screen reader it was worse than ambiguous, announcing "Kept separate, not
  pressed", the inverse of the truth, because the state was encoded twice and the two encodings
  contradicted each other. The visible text is now the setting's name and holds still the way a
  checkbox label does, the pressed state says whether it is on, and the tooltip carries the
  action — the one thing neither of the other two can express.

- **Soloing the folder you are pointing at no longer drops its highlight** (github#46). Hovering
  a row in the legend lights that folder's notes; clicking the same row's `only` chip put the
  light out during the animation, leaving the one folder still on screen unlit — but only if the
  mouse was perfectly still, because a pixel of movement brought it straight back. Rebuilding the
  legend deliberately clears the hover, since the row under the pointer is about to be replaced
  and will never receive its own mouse-out; what was missing is the other half, because the
  replacement row under a stationary pointer never receives a mouse-in either. The rebuild now
  asks the browser what is actually under the pointer and restores the highlight itself instead
  of waiting for the next twitch of the mouse.

- **Soloing a folder shows all of it.** `only` on a folder row hid every other folder but left
  any subfolder solo from an earlier click standing, so soloing a subfolder and then soloing its
  parent left the parent's other subfolders hidden and the folder's own `only` looking like it
  had done nothing. The folder-level handler now clears `hiddenSub` the way `onlySubs` and
  `onlyUnder` already did — "only this folder" means the whole folder.

- **A folder's `(directly in folder)` row is a leaf, not a twisty.** The row that gathers the
  notes sitting directly in a folder is keyed `g + "/"` — the same key the children map uses for
  that folder's first-level subfolders — so the row was handed a twisty that, when opened, nested
  every sibling subfolder underneath it, each at a `g//sub` double-slash path whose own `only` and
  `hide` then matched no note and blanked the disc. Notes standing directly in a folder have no
  children, so both the twisty attribute and the recursive subtree call are now guarded on a
  non-empty subfolder name, at the named level and inside the "more" tail alike.

- **A release can no longer be tagged off `main` by accident** (github#47). `release.ps1`
  already refused a `v` prefix, a malformed version, a manifest that disagrees with it, a dirty
  tree and a missing changelog section — but it never asked which branch it was standing on, and
  every release before 1.8.0 was simply run from the right place. 1.8.0 is what that costs: cut
  before its release PR merged, so its tag sits on a `develop` commit three back from main's own
  history, the only one of four releases off main's first-parent line. Nothing shipped wrong, the
  three commits between being docs-only — but `git log main` does not show where 1.8.0 was cut,
  and a published tag cannot be moved afterwards without breaking every link to it. So the one
  moment that class of mistake is free to fix is before the tag exists, which is where the check
  now sits: `main`, and not a `main` that is behind `origin/main`. `-AllowAnyBranch` is the
  escape hatch, shaped like the existing `-AllowDirty`, because the guard exists to stop the
  accident rather than to make a deliberate off-main release impossible.

---
