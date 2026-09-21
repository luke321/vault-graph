# 0017 — One weight per note, and the dot is its own slot

**Date** 2026-09-21 · **Status** accepted · **Supersedes the sizing half of** `github#107`,
`github#117` · **Issue** github#186

## Context

Three quantities decided how much of the disc a note got, and they disagreed.

- **Arc** came from a note's *opacity* alone. Every note counted the same, however connected.
- **Tangential position** came from the same opacity, so slots inside a row were equal too.
- **Drawn radius** came from a **ramp on the note's `size` attribute** — a compressed degree —
  scaled by `room / pitch`, where `room` was the **median own-step of the whole band**
  (`ROOM_PCTL`). So the only place link weight reached the layout was the dot, and it reached it
  through a number measured across every other wedge in the ring.

That is how `github#107` and `github#117` ended up trading a percentile and a rounding rule
against each other: with the dot sized off a band-wide figure, a wedge could be given room its
own notes could not use, and a note could be drawn at a size its own slot did not have.
`animation.md` records the cost — **six room-interpolation sites** threaded through the cascade,
`plan.room` walked between endpoints but *not used to draw*, and a `dotFit` cap that had to be
removed rather than softened because a per-note minimum made dots breathe.

It also made "packed" unmeasurable. The maintainer's definition (2026-09-21) is that **every
wedge has enough notes to touch both seam sides and both rings at all times**. A wedge's arc came
from counts and its dots' sizes came from a band median, so the two could not be compared.

## Decision

**Every note carries one weight, and everything that allots space uses it.**

    w(id) = alpha(id) x min(LINK_CAP, 1 + LINK_WEIGHT x s(id))

`s` is the note's `size` attribute over the vault's mean `size` — the existing compressed degree
(`min(11, 2.6 + 1.55 * sqrt(deg))`), normalised to mean 1. `LINK_WEIGHT = 0.4`, `LINK_CAP = 2.5`.

That one weight drives three things and nothing else:

| | |
|---|---|
| a wedge's arc share | `c.wsum`, the sum of `w` over its members |
| a note's tangential slot | `placeCell` lays notes in weight order, innermost first, and shares each row's arc by `w` |
| the dot | `DOT_OF_PITCH x min(own slot at its radius, the band's radial pitch)`, floored at `DOT_MIN_PX`, with the edge, frame-fit, hub and cascade caps kept |

**The band-median room is gone**, and with it `ROOM_PCTL`, `roomPool`, `plan.room`,
`bandOf().room`, the cascade's `roomNow` / `roomSrcB` / `roomDstB` walk, the `size` ramp
(`measureSizeScale`'s `m`/`b`/`lo`) and `DOT_ROOM_MAX`. A dot is now a function of its own slot,
so nothing about one wedge reaches another.

**Rows stay solved per band, from the band's area over its live weight**, exactly as before — so
every wedge keeps the band's row count and its notes reach both rings.

### Why 0.4, and why a cap

**Links weigh LESS than note count.** A wedge is first of all a place to put notes; link weight
modulates how much room each one takes. At `L = 0.4` the per-note factor runs **1.19 to 1.72**
across the five fixtures — a hub note takes about 45% more arc than a leaf — and `LINK_CAP = 2.5`
is never reached. The cap exists so that a single enormous hub cannot move its group between
rings on its own; it is a rail, not a working constant.

`L` was swept at 0, 0.2, 0.3 and 0.4 against the band table on all five fixtures in both
dimensions. See `changelog-detail.md` for the numbers.

### The ring split is decided on note COUNT, not on weight

This is the one place the weight is deliberately **not** used, and it is what makes the change
readable.

`balanceBands()` searches exhaustively (`EXHAUSTIVE_UP_TO = 14`, and every fixture is inside it),
so it re-decides every movable group from cost alone and **near-ties flip on any change to the
cost**. Measured: with the cost left on weights, **25 of 210 group-dimensions change ring between
`L = 0` and `L = 0.4`** — and **21 of 210 still change at `L = 0.2`**, so it is not a question of
picking a smaller `L`. The row counts were identical either way (`i6/o9` on the demo vault before
and after); only the membership shuffled, which is the signature of a search re-breaking ties.

So `spanFor()` and the `share()` inside `evaluate()` count notes. Which ring a group lives in is
a question about how many notes each ring has to hold; how much room each note takes inside its
ring is the weight's job. Two consequences, both wanted:

- the band table is **identical at every `L`**, which is the acceptance the rework was given;
- `r0`, `rOuter` and `maxR` are unchanged by the weight model, so the rails the definition is
  measured against do not move underneath it.

## Rejected

- **Keeping the `size` ramp and adding weight to the arc.** The dot would then carry link weight
  twice — once through its slot, once through the ramp — and the two would disagree the moment a
  wedge's density stopped matching its band's.
- **Sizing the dot from a band figure at all.** That is what `ROOM_PCTL` was, and `github#107`
  had already had to move it 0.1 → 0.5 because the tenth percentile is not band-neutral. A
  per-note slot has no percentile to choose.
- **A smaller `L` to keep the bands still.** Measured above: it does not.

## Consequences

- **Every golden snapshot moves.** All five were re-recorded deliberately, after the
  measurements, in a commit that says so. The band column is unchanged on all five.
- Size stays **monotone in link weight**, which `animation.md` requires: notes are laid down in
  weight order from the inside out, and a heavier note takes a wider slot, so the most connected
  note is the largest one in its row.
- `DOT_MIN_PX = 1.5` is still a floor against scarcity and the clearance caps below it still win,
  so sub-pixel dots still exist where a note's room demands one (`github#107`).
- The cascade keeps the per-note `cellRoom` walk between its two endpoints (`github#66`,
  `github#159`) — it now walks a note's own slot instead of its cell's minimum step.

## Verify

```javascript
__vg.linkWeightOf(id)     // the per-note factor; 1 everywhere when LINK_WEIGHT is 0
__vg.dotWhy(size, id)     // cellRoom is the note's own slot now, bandRoom is just the pitch
```

```bash
node .ai-context/investigations/186/bands-186.mjs --repo . --html <page>   # the band table
node scripts/smoke.mjs --only "a resting wedge fills the arc its notes can"
```
