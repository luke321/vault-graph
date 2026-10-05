# 0021 — The drill root

github#76, with github#86 (the tag disc it excludes) and github#186 (the packing it runs under).

A **root** makes one folder the whole disc. It is state the view gains and gives back exactly:
drilling in and straight back out is the identity (measured in `invariants.md`, *Drilling in and
coming straight back is the identity*). This record is how the code does it. The measured laws a
drilled disc is held to are in `invariants.md`; the numbers each change moved are in
`changelog-detail.md`. The code carries bare pointers here.

## Two steps, one flag

A drill is two cascades.

1. **Step 1, the solo** (`soloRoot`). The folder is soloed through the vault basis (`soloHide`,
   the same `state.hidden` map the eye and *only* write), the nav is filtered to the folder's own
   world, and its notes are repainted in the colours their child folders will wear. The wedges are
   exactly the vault disc's. This is 186's filter cascade, unchanged.
2. **Step 2, the re-wedge** (`reWedgeTo(true)`). The root's child folders become the wedges, in
   rings of their own.

Everything that rebases the basis on the root asks `rebasing()` (`rootDepth > 0 && reWedge`), never
`rootDepth` directly, so the two steps differ by that one flag and nothing else. Step 1 and the vault
disc are untouched by construction: `buildSubOrder`'s tally, `computeOrder`, `buildWedgePlan`'s
members and `visible()` filter on the root only while it is on. Coming home, or re-rooting, runs
`reWedgeTo(false)` back to the solo first, then the solo's own way out: out of a re-wedged disc the
way it came.

## The re-wedge animates as a held cross

github#76 x github#186, measured 2026-10-05. The re-wedge changes every visible note's wedge **and**
the rings, so the source and destination are two different discs in two different scales (demo:
`maxR` 25.25 for the solo against 8.45 drilled; 10k: 8.3 times). The cascade's walk is built for one
disc re-packing inside rings it keeps: it plans every frame in the rings in force, eases each seat
along its cell's serpentine, and caps sizes by its two endpoints. Run across a ring change it did
three wrong things at once, all measured by `--only "drill walks"`:

- **Every mover was walked through a plan of the wrong world**, its old group's cell laid out in the
  destination's rings: single-frame jumps of 264–484 screen pixels while still lit.
- **The renderer's bbox followed the rings in one frame.** `setCustomBBox` is sized by the locked
  `maxR`, so the whole disc rescaled 2.99x (demo) and 8.3x (10k) between two frames while dot sizes,
  which the renderer keeps in normalised units, did not follow — fat dots on a shrunken disc on the
  way out (2.18x over both rests), thin dots on a swollen one on the way in.
- **The source endpoint was planned in the destination's rings**, so the per-dot size cap
  (github#66's `sizeCap`) bounded the walk by the wrong A size (1.25–1.27x over rest).

So the re-wedge does not walk. It **crosses, in one sweep, with every dot held as it stood**:

- `reWedgeTo` captures, at rest and before the world flips, each visible note's position, drawn size
  (`dotPx`) and colour (`MoveHold`), and makes **every** visible note a mover — its group changed or
  not, because its rings did.
- The cascade runs `{ colToggle, cross, hold }`. Until a mover's cross point it stays exactly where it
  stood, at the size and colour it had (`moveSizes`, read first by `dotPx`; `leftColor` from the
  hold), and fades out; after it, it takes its final seat outright (`cross`) at the destination
  endpoint's size (`dstSizes`, the B side of the size cap) and fades in. Each fade completes before
  the other starts, so neither reverses; neither size exceeds a rest; the last frame is the rest, so
  `settle()` has nothing to do.
- **The camera takes the bbox change back** (`holdCamera`). When the rings swap, the camera's ratio
  and centre are scaled by `old maxR / new maxR` in the same frame, under `fitting` so it is not read
  as the user moving the camera, and with panning enabled for the instant the way `fit()` does. The
  held sizes are scaled by the same factor, because they are in normalised units. The screen does not
  change; the cascade's own deferred fit then flies to the new disc.
- A held cascade has no walk, so the walk's seats say nothing about what is drawn. `lastCascade.held`
  says so, and the drill walk check reports seat order as `held` rather than reading dead seats.

The result reads as a dive: the solo's ring fades out in place round the sweep while the drilled disc
fades in at its final seats, and the camera follows it in (out, on the way back).

**Why not the dimension switch's fold.** A fold needs a stand-in per note (one node cannot be in two
discs at once) and two discs that share a radius; a drill has neither, which is the same reason the
clock hand was rejected for it (`invariants.md`, *A drill crosses the two discs in one sweep*).

## The grouping, rebased

- `relGroup` / `relSub` are the identity at root depth 0, so the vault disc reads exactly as before.
  Under a root a note's group is its child folder (`(directly in folder)` for notes sitting in the
  root itself) and its sub one level below.
- The subfolder ladder (`fileDirs` and the segments below a group) starts at the root: segments
  `0..rootDepth-1` named the root itself, and `dirs` is offset one from `segAt`, so slicing by
  `rootDepth` drops exactly the segments the drilled group and its sub stand for. *Only under* (`onlyUnder`)
  indexes the segments below a group at `rootDepth + 1`, always: `path.slice(g.length + 1)` is right
  only at depth 0 and `.slice(1)` only at depth 1.
- `fileGroup` and `fileSub` rebase too, so `groupOf`'s *unlinked joins its folder* path and the plan's
  `liveSub` keys are the drilled group and sub.
- **The order** (`computeOrder` under a root) is `subOrder`'s rule, the order the vault disc's legend
  already lists that folder's children in: count descending, then name. A drill may not silently
  re-sort. The `_` / `(` archive ranking is a top-level naming convention and does not carry one level
  down; only `(unlinked)` still sinks to the end.

## A root and the tag disc are exclusive

A root is a folder path and its wedges are child folders, so it has no meaning on the tag disc
(D-2 of the 2026-09-12 merge). `setDim` comes home first, instantly, so the switch that follows is
the plain vault-to-vault one github#86 was measured for; `setRoot` refuses a root off the folder disc
(never user-visible: the nav gestures that offer a drill return null there). The tag fixture
therefore has no drilled golden: there is nothing to drill into.

`setRoot` is total: a root no note lives under would make `buildWedgePlan` return null, so it is
refused. `anyNoteUnder` asks before the root is adopted, so it cannot use `inRootA`, which reads the
root already in force.

## Identity, not display name

`groupOf` returns a display name, and under a root a child can share its name with an unrelated
top-level folder. Everything persisted, or outliving the drill, is keyed by the folder's **absolute**
path (`invariants.md`, *What a group IS is not what the legend CALLS it*, has the collision vault and
the four channels it caught):

- `hiddenByDefault` reads `folderShown` by `identOf(g)`; the toggle writes it the same way, and under
  a root it hides through `state.hiddenSub` at the absolute key, since `state.hidden` is keyed by
  top-level group and would hide the wrong folder. `isHidden` follows: while the re-wedge is on a
  group is a subfolder of the vault, keyed in `hiddenSub`; with it off, the vault basis hides through
  `state.hidden`, which is how step 1's solo hides.
- `keyOf(g, sb)` is the absolute folder path under a root and byte-identical at depth 0; the legend's
  nesting table, `highlightSub` and what the subfolder picker writes all use it, so a relative key
  is never left un-found once a root is in force (the deeper twisties vanished when it was relative).
- Colour pins are read by absolute identity: the build's shade key `pk` is basis-relative and dies
  with the build, the pin is persisted, so a drilled child cannot inherit a top-level folder's pin.
- The pick function owns the display-name-to-identity mapping, so no caller has to remember it;
  `identOf` is a no-op at depth 0.

## Colour across a drill

- The drilled folder's slot (`rootSlot`) goes to its biggest child (`giveRootSlot` inside
  `buildColors`), so the step-1 repaint, the step-2 wedge and the legend swatch are one answer.
- `wedgeColorsAhead` answers *what will each note in the root be coloured once the children are the
  wedges* by **asking**: it flips the re-wedge on, runs the real colour builders, reads `nodeColor`
  per note and puts every global back. A reimplementation of the slot rotation would be a second
  palette to keep in step; this cannot drift because it is step 2 asked.
- The step-1 recolour walks across the cascade that moves the same dots, driven by
  `CascadeOpts.onFrame` so it cannot finish early on a clock of its own. `noteColorShown` (mid-flight)
  and `rootNoteColor` (the colours step 2 will hand out) come before the tint ladder in `nodeColor`,
  because the ladder answers to the basis and knows nothing about the root. A dot leaving a drilled
  disc keeps the shade it wore there (`preRootShade`), the way `leftColor` does across a switch.

## The nav

The nav is the half a root does change: drilled, it lists the folder's own world. With the re-wedge
on, `order` already holds the children; in step 1 the disc is still the vault's basis, so the rows
for the folders the drill hid are filtered out rather than left switched off. A root bar at the top
of the nav carries a back action and crumbs (crumb *i* is the root at depth *i*, *i = 0* the vault),
so a drill is never a one-way door; the trail is `rootDepth` deep and needs no cap. A folder row is
drilled into by double-click, read as `click` with `ev.detail === 2`: the row's single-click handler
rebuilds the legend, and swapping the target element between the two clicks stops Chrome from ever
firing `dblclick` (measured), while `detail` still counts. The menu item that drills took the
legend menu from positional arguments to one options bag.

## The suite

Every fixture with a drilled golden runs every drill check (`DRILL_ON` in `smoke.mjs`): each reads
its root from that fixture's own golden and skips a vault without one, so github#113's per-fixture
default would otherwise leave two of the three drilled goldens committed and never read.
`--only "drill walks"` (`scripts/check-drill-walk.mjs`) rides a drill in and out frame by frame and
asserts, per cascade: converged, at least 20 frames, no lit dot outside its wedge, no seat-order
inversion on a walk, no dot over the larger of its two rests, no fade that turns round mid-way, a last
frame within 16 units of rest, no single-frame rescale of the disc over 1.25x, and no held dot moving
more than 4 px in a frame. The walk steps (the solo filter's own cascade) report their worst frame
step as context, not as an assertion — see `changelog-detail.md`, 2026-10-05.
