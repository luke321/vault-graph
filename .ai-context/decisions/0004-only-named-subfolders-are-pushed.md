# 0004 — Only subfolders with their own tint slot are pushed

**Date** 2026-08-22 · **Status** accepted · **Reverses** an earlier same-week change

## Context

Highlighting a group or subfolder does two things: rings its notes, and **pushes them
outward** by `HL_PUSH` rows so the selection reads at a glance.

Cells are keyed by **tint slot**. Only three subfolders per group are ever named
(`SUB_NAMED = 3`); everything past that shares one pooled tail slot. So a pooled
subfolder's notes are *interleaved with its cell-mates at the same angles*, and pushing
one slides a subset out **through** the others — the highlight meant to make the
selection legible is what creates the overlap.

Pooled folders were excluded originally, then included on a nav-consistency argument: a
tail folder is still a level-1 subfolder, so selecting one doing nothing looked
inconsistent beside its named siblings stepping out.

`03 - Resources/Locations` settled it — 3 notes, seventh in the order, sharing the tail
slot with six other folders. Pushing it slid those 3 out through their cell-mates.

## Decision

`ownsWedge()` asks whether the subfolder has its **own** tint slot:

```javascript
return k < SUB_NAMED || subs.length === SUB_NAMED + 1;
```

Own slot → pushes. Pooled → ring only. The second clause is a real exception: a tail slot
with exactly one occupant *is* that folder's own wedge, so it still moves.

**Depth 2 and below is never pushed**, separately and for the same reason — a deeper
folder is a slice of its parent's arc. `isPushed` gates on `pathKey(a, 1)`. That gate was
verified intact while chasing the `Locations` bug and is not the same mechanism.

## Rejected: give pooled folders real wedges

Two independent walls, and the tint ladder is only the one that gets quoted:

| Constraint | Limit |
|---|---|
| Colour | more than four steps in one hue family land ~3 dE apart — indistinguishable |
| Geometry | a tail folder's arc is narrower than two of its own dots |

`Locations` is 3 of 450 notes: 0.67% of the circle, **~2.4°**, about **90 units of arc**
at the disc's ~2138 radius — against the **~126 units** two max-size dots need side by
side. Narrower than two of its own notes, and barely wider than the 2° `SLICE_GAP` meant
to separate whole *groups*. A 1-note folder is a single spoke. It also compounds: a
narrow span needs *more* rows for the same notes, which is the documented sparse-spoke
failure mode.

## Consequences

- The nav inconsistency returns: clicking a pooled folder only rings it. Accepted — the
  ring identifies it unambiguously, and overlaps are worse than the inconsistency.
- Untried third option, if the inconsistency ever grates: push the **whole shared wedge**
  when any member is selected and ring only that member's notes. Whole cells move as
  blocks with 0 collisions; only a *subset* moving is the problem.

## Verify

```javascript
__vg.pushReport()   // select Locations -> pushedCount must be 0, haloed 3
```
