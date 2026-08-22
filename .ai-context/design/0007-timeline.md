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

**Mark today** marks every note created **or edited** today, using the same
treatment as a highlighted group: pushed out radially, ringed, and recoloured. The
colour is deliberately *not* one of the ten categorical hues: it is the extreme of
the neutral axis (white on dark, near-black on light), so it cannot be misread as a
group. The date is read at page load rather than baked in at build time, so the mark
is still correct tomorrow without rebuilding.

**"Created" alone made this button a no-op most days**, which is why it also reads
file mtime now (`touched`). `created` comes from frontmatter, and this vault
pre-creates daily notes from the calendar — 2026-08-21's note carries
`created: 2026-08-17`, and `created` takes precedence over `date` — so on any day
without a fresh import the button lit up nothing at all. Measured on 2026-08-21:
**0 notes created today against 3 files touched.** With mtime it marks the two notes
actually worked on, which is the question being asked.

mtime is a sound signal here but not a pure one: bulk operations rewrite it wholesale
(measured, 2026-08-19 shows 111 files touched, which was the renumbering). It is
right for "what did I touch today" and wrong for "when did this note come into
existence" — which is exactly why both fields are kept rather than one replacing the
other.
