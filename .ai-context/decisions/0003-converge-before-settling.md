# 0003 — Converge before settling; watchdogs, never deadlines

**Date** 2026-08-22 · **Status** accepted

Two rules about how an animation ends. Both were learned by introducing the bug.

## Converge before settling

Easing closes only `RADIAL_EASE` of each note's gap per frame, so at progress 1 a
remainder is still outstanding — and `settle()` assigns *exact* targets, closing it in a
single frame. That is a small jump at the end, indistinguishable from a dropped frame.

It was reported as happening **only when toggling off**, and the measurement explains
why: the hide tail's first frame carried **27 units** of remainder against the show's
**7**, because hiding shrinks the ring so notes travel much further inward.

**Decision.** The cascade runs past progress 1 while any note is more than half a unit
from its target, with the ease ramping to 1 across that tail. Targets are static by then,
so it converges in a handful of frames and `settle()` becomes a no-op.

Measured max per-frame displacement of visible notes:

```
hide   27 → 22.3 → 12.8 → 4.6 → 0.8 → 0
show   7.1 → 8.5 → 7 → 4 → 1.5 → 0.3 → 0
```

The ramp is confined to the **tail** deliberately. Ramping across the whole animation
would restore the very row tick the easing exists to smooth — which for `04` lands around
90% of the way through.

## Watchdogs, never deadlines

**A force-complete timer must fire on stalled frames, not at a fixed time.**

`setTimeout(settle, duration + margin)` looks like a safety net and is a bug: on any page
too slow to finish inside `duration`, it fires part-way through and snaps the disc to its
final layout — a jump at the end of every animation, on exactly the machines where the
animation matters. The correct shape re-arms while frames keep arriving and only fires
after a stall:

```javascript
var watchdog = function () {
  if (running && NOW() - lastFrame < STALL_MS) { guard = setTimeout(watchdog, STALL_MS); return; }
  settle();
};
```

This has been introduced twice — once originally, and again on 2026-08-22 when the
animations moved to wall-clock durations and two of the three got deadlines. All three
now use watchdogs.

## Related: fixed durations, clamped advance

Durations are wall-clock (`TIMELINE_MS` 4500, `CASCADE_MS` 1600, `TWEEN_MS` 380) so a
toggle takes the same time on a 60Hz and a 144Hz display — frame counting made the intro
~8.7s at 60Hz and ~3.6s at 144Hz. But a single frame may never advance more than
1/20th of the animation, so below ~20fps it stretches instead of leaping. Fixed duration
is only worth having while there are enough frames to draw it.
