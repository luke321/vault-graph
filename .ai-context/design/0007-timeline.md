# Timeline

**Status** as-built · extracted from the README on 2026-08-22

> Revealing notes oldest-first, and why the slider is linear in note count.


**Play** grows the vault from its first note to now; the slider scrubs the same
thing by hand. Notes are revealed oldest-first, and everything downstream follows
for free: the wedges widen as folders fill and the disc densifies as it goes,
because density is already a function of opacity and the timeline simply holds
later notes at zero. Measured, the disc's outer radius runs 1174 -> 1334 -> 1494 ->
1974 -> 2134 as the cutoff advances.

**The slider is linear in NOTE COUNT, not in time.** Measured on this vault, 409 of
442 notes fall in the last three months while a handful carry content dates back to
2015 -- so a linear time axis would spend 97% of its travel on empty years and put
everything interesting in the last pixel. Ranking sidesteps that, and every step of
the slider reveals something. The readout shows both, e.g. `2026-06-28 · 250`.

The rank axis also makes the vault's own history legible in a way the folder tree
does not: slider positions 120 to 260 span **three days**, 2026-06-27 to 06-30. That
is the initial import, and it is 140 notes.

Details worth knowing:

- **Undated notes are always present** (3 of 443 here), rather than being stranded
  at one end of the axis.
- The fade is **8 ranks** wide, not a number of days -- so it looks the same whether
  the vault gained one note that month or two hundred.
- Playback is frame-counted like the cascade, so a slow page plays slower rather
  than skipping, and it scales with `TIME_SCALE`.
- Any filter change stops playback rather than fighting it.

**Mark today** marks every note created **or edited** today: ringed and recoloured, and
deliberately **not** pushed out radially. It moved at first, on the reasoning that it should
match a highlighted group -- but a group owns a contiguous wedge and can move as a block,
while today's notes are scattered through every wedge, so pushing them slides a subset out
through its own cell-mates. That is the same argument `isPushed` already made for pooled
subfolders and `0010` for a marked heatmap day. The
colour is deliberately *not* one of the ten categorical hues: it is the extreme of
the neutral axis (white on dark, near-black on light), so it cannot be misread as a
group. The date is read at page load rather than baked in at build time, so the mark
is still correct tomorrow without rebuilding.

**Which field means "today" went both ways, and `created` won.**

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

So it is `created` alone now, which is what the band counts. **Two things answering "today"
differently in one view is worse than a button that marks nothing on a day nothing was
written** — and marking nothing is then the honest answer, which the band is already showing
right above it. `smoke.mjs` pins the two together as set equality rather than counts, since
two predicates can agree on how many and still disagree on which.

`touched` is still built and still right for "what did I touch today". Nothing in the UI
asks that question at the moment.
