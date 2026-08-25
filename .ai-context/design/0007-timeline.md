# Timeline

**Status** as-built · extracted from the README on 2026-08-22 · **rewritten 2026-08-25 for
1.7.0**, when the sidebar's Timeline block was deleted and the ribbon became the only
timeline

> Revealing notes oldest-first, why the reveal is ordered by rank while the strip is scaled
> by time, and how the two are reconciled.


## There is one timeline now, and it is the ribbon

Until 1.7.0 there were two. The sidebar carried a **Timeline** block — a rank slider, a
**Play** button, an **All** button — and the band carried the **date ribbon**, which does
the same job with two handles, a row of year chips and a date pair. Two controls scrubbing
one history in two different units, one of them drawn on top of the data and the other
hidden in a sidebar. The slider went.

Nothing was lost in the trade. The ribbon reaches every state the slider could, names the
dates while doing it, and draws the distribution it is scrubbing. What it does *not* do is
"reveal the oldest N notes", which is `state.until` — that survives as internal state
(`timelineFrame`, `timeFactor`), because it is how the visibility handler and the `?rest`
boot say "the whole disc, no animation". It has no control any more and does not need one.

**Refresh is Play.** It clears every filter and replays the intro, which is the same
animation load runs.

The growth itself is unchanged and everything downstream still follows for free: the wedges
widen as folders fill and the disc densifies as it goes, because density is already a
function of opacity and the reveal simply holds later notes at zero. Measured, the disc's
outer radius runs 1174 → 1334 → 1494 → 1974 → 2134 as the cutoff advances.


## The intro IS the right-hand scrubber travelling

Growing the vault from its first note to now, and dragging the range end from one end of the
strip to the other, are the same statement about the same history. The page used to make it
twice in two units: the disc revealed notes by rank while the sidebar counted them, and the
ribbon — the control that actually draws the history — sat still through all of it. With the
slider gone the animation had nothing left to say what it was doing, so it drives the
ribbon: `sweepTo` moves the right-hand handle, and the tooltip that follows a real drag
follows this one too.

It is a **preview**, exactly like a drag: `state.from` / `state.to` stay null for the whole
sweep, and `brushEnds()` reads the sweep the same way it reads a drag. Writing the state per
frame would put a hard date cap in `timeFactor` on top of the rank ramp the cascade is
already animating — the same reveal computed twice, and the second one would cancel
playback, since a range change goes through `applyRange` → `cascade` → `stopPlay`.

**A drag beats the sweep.** If a hand is on the handle mid-intro the hand wins, and the
release stops playback anyway.


## Rank orders the reveal; time scales the strip; `sweepTo` reconciles them

**The reveal is ordered by RANK, not paced by the calendar.** Measured on this vault, 409 of
442 notes fall in the last three months while a handful carry content dates back to 2015 —
so an intro paced by the calendar would spend 97% of its run on an empty screen and put
everything worth watching in the last half second. Ranking sidesteps that: every frame
reveals something. The rank axis also makes the vault's own history legible in a way the
folder tree does not — ranks 120 to 260 span **three days**, 2026-06-27 to 06-30, which is
the initial import and 140 notes.

**The strip is scaled by TIME,** because that is what a date filter needs. A month is a
month wide whether it holds 631 notes or none, and the empty year (2021 here) is visibly
empty — a control built from only the months that exist would close that gap up and lie
about the shape of the history.

Those two are in tension, and `sweepTo` is where it is resolved: progress → **rank** →
`tlDateMs[rank]` → x. Interpolating `dateSpan.lo → dateSpan.hi` linearly instead would put
the handle in 2020 while every note from 2026 was already lit. Going through the rank makes
the handle's position mean *everything left of here is on screen*, which is exactly what it
means under a hand.

**The consequence is honest, and it is the vault's shape rather than a mapping artefact.**
Here the handle crosses the empty decade in the first fraction of a second and then creeps
through the last months for the rest of the run — and the bars underneath it draw the same
distribution. Measured across the three fixtures on a 1168px strip:

| Vault | Handle at ~5% of the run | Shape |
|---|---|---|
| real (457 notes, 2015 → 2026) | **0.70 of the strip** | crosses the empty decade, then creeps |
| demo (1402 notes, 2 dense years) | 0.06 | near-linear travel |
| 10k synthetic (10 even years) | 0.05 | near-linear travel |

So the crawl is not a property of the mapping — it is what a vault with a decade of nothing
in it looks like. Both evenly-dated fixtures sweep smoothly.

Details worth knowing:

- **Undated notes are always present** (1 of 457 here), rather than being stranded at one end
  of the axis.
- The fade is **8 ranks** wide, not a number of days — so it looks the same whether the vault
  gained one note that month or two hundred.
- Playback is frame-counted like the cascade, so a slow page plays slower rather than
  skipping, and it scales with `TIME_SCALE`.
- The stagger is `windowFor(n)`, the same expression a folder toggle uses, so a note's own
  fade is the same fraction of the animation in both. Overriding it made the intro a visibly
  *different* animation over a longer clock, which is the opposite of the point of it going
  through `cascade()`.
- Any filter change stops playback rather than fighting it.
- **Refresh clears the date range**, and did not before 1.7.0. `resetView` reset every filter
  except that one, so replaying the intro through an applied range grew the vault to a slice
  of itself. Invisible while "the timeline" meant the rank slider, which it *did* reset.


## The strip's own width is measured from its slot, never from its canvas

`fitCanvas` has to pin an inline pixel width on the strip's canvas — the bitmap is sized in
device pixels and the CSS box has to stay in CSS pixels, so it writes both — and an inline
width beats the stylesheet's `width:100%`. So `ribbonW()`, which asked the *canvas* how wide
it was, got back the width it had last been drawn at, for ever: the first measurement won and
every later one confirmed it.

Measured on the real vault before the fix: the strip was **1168px in a 668px slot and 1168px
again in a 1568px one**, with every year chip left exactly where it was. The ResizeObserver
was already wired and firing — it redrew at the same stale number. On a page whose very first
measurement ran before layout the strip came up at the 600px fallback and stayed there in a
1284px band.

`measureRibbon()` drops the inline width, reads the box the stylesheet gives, and puts the
inline width back, so measuring has no side effect. It runs from `drawDateUI` and from the
observer, never from a pointermove — a drag reads the cached `ribW`. The observer guards on
"did the width actually change", which both saves a redraw per band reflow and breaks the
feedback loop, since drawing writes the canvas size and the canvas is inside the observed
element.


## "Mark today" is gone; the band's today column is the control

There was a **Mark today** toggle in the sidebar. Clicking the band's today column already
did the same job by the same predicate — `created === the key`, which for the last cell of
the grid *is* today — so it was one question answered from two places, and the sidebar was
the place the answer was not drawn. Removed in 1.7.0 at the author's call: *use the heatmap
for that.*

The **fill treatment** came with it. A picked day now takes `--today` — the extreme of the
neutral axis (white on dark, near-black on light), deliberately *not* one of the ten
categorical hues, so it can never be misread as a group — on top of the halo it already had.
Gated on `state.markDay` and **not** on `isMarkedDay()`: that predicate also answers for
`hoverDay` and for a hovered year, and recolouring a whole year of notes as the pointer
crosses a label is far too loud. A hover asks; a click chooses.

Neither pushes. A day's notes are scattered through every wedge, so pushing them slides a
subset out through their own cell-mates — the same argument `isPushed` already made for
pooled subfolders and `0010` for a marked heatmap day.

**The button's own history is why it went, and it is worth keeping.** Which field meant
"today" went both ways.

It read `created || touched` first. `created` comes from frontmatter, and this vault
pre-creates daily notes from the calendar — 2026-08-21's note carries
`created: 2026-08-17`, and `created` takes precedence over `date` — so on a day without a
fresh import the button lit nothing. Measured on 2026-08-21: **0 created against 3
touched.** Adding mtime made it mark the notes actually worked on.

Then the opposite complaint, from using it on a real vault: it marked **far more** than the
heatmap's today column. Of course it did. `touched` is an mtime, and a vault moves mtimes
for reasons that have nothing to do with the person holding it — a sync writing a file back,
Obsidian rewriting frontmatter, a formatter, a bulk rename. Measured here earlier:
2026-08-19 shows **111 files touched**, which was the folder renumbering, not a day's work.

So it became `created` alone, which is what the band counts — and at that point the button
and the band's today column were the same predicate in two places, which is the state that
made deleting one of them obvious. `smoke.mjs` used to pin the two together as set equality;
that check went with the second predicate, replaced by *a marked heatmap day recolours its
notes*, which follows the fill treatment to where it now lives.

The date is still read at page load rather than baked in at build time, so the band's own
today marker stays correct tomorrow without rebuilding.

`touched` is still built and still right for "what did I touch today". Nothing in the UI
asks that question at the moment.
