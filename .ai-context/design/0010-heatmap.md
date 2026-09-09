# The heatmap band

**Status** as-built · 2026-08-22

> Notes added per day, above the disc. Every square pieced together from its own
> notes' exact colours, and why nothing here is an average.

## What it shows

52 columns of trailing weeks, 7 rows, Monday-start. A day with any notes fills its
whole cell; the cell is tiled with **one block per note in that note's own colour**.
Count is carried by how finely the square is divided — one note is a solid slab,
180 notes are about a pixel each. Days with nothing are the faint `--dim` lattice,
which is what makes the band read as a calendar rather than as scattered squares.

## Which date, and why not the other two

`created` from frontmatter, falling back to `date` — the same field the timeline
ranks by, so the band and the ribbon tell one story. The alternatives were measured
on the live vault and both answer a different question:

| Field | Measured | Answers |
|---|---|---|
| NTFS `birthtime` | **472 of 934 files "born" today** | when *this machine* first saw the file — OneDrive re-creates on sync |
| `mtime` | 2026-08-19 shows **240 files** | what did I *touch* — that day was the folder renumbering |
| `created` | 894 valid of 916 | when the note was **added**; its big day, 2026-06-27 with 180 notes, is the initial import |

`created` needed a build-side fix to be usable at all: `fm.created.slice(0, 10)` on an
unrendered Templater placeholder yields the string `{{date:YYY`, which is not a date
but **sorts as one** — after every digit. 16 notes therefore ranked as the newest in
the vault on the timeline, and the band grew a column for a day that does not exist.
`build-graph.mjs` now validates the shape instead of trusting the slice.

Weeks start **Monday**, because the vault's own weeks do — weekly reviews are filed by
ISO week. This is not GitHub's grid.

### `touched` is a second source now, not a second opinion (github#70)

The table above still decides the **default**, and it still holds: the band opens on
`created`, the timeline and the range filter never left it, and nothing about the argument
for it has been withdrawn. What changed is that the row this table dismisses -- `mtime` --
turned out to be dismissed for the wrong reason. It answers a *different* question, not a
worse one, and the page had no way to ask that question at all: `touched` shipped in every
exported file from the beginning and was read nowhere.

So the band's label is a two-state control: **Notes added** / **Notes touched**. The rule
this DDR already imposed is what makes that safe -- the count must be nameable, so the name
is the control, and the tooltip and the readout repeat the word. Nothing about the tiling,
the window, the levels or the geometry differs between the two; only which of a note's two
dates the tally reads.

The dishonesty the table warns about is real and did not go away, so it is **named on the
band itself**. A day is called *bulk* when it is at least 25 notes and either **20x the
median day** or **15% of every dated note**, and the tooltip then says what it is:
"*N*x the typical day here. A sync, an import or a rename does this -- it is not necessarily
work." Both clauses are needed and each has a measured hole the other closes:

| Fixture | Notes | Distinct touched days | Median | Busiest | Flagged |
|---|---:|---:|---:|---:|---|
| demo | 1,403 | 553 | 1 | 40 | 2026-09-05 (40x the median) |
| 10k | 10,002 | 3,397 | 3 | 54 | none — 54 of 10,002 across 3,397 days is a busy day, not a sync |
| dominant-folder | 954 | **1** | **954** | **954** | 2026-09-05 (**100%** of the vault) |

The dominant-folder row is why the share clause exists. Its generator never stamps mtime, so
all 954 notes carry one — and with a single day in the distribution **the median is the
outlier itself**, making that day 1x its own median. A multiple-only rule, which is what
this was first built as, left the one genuine bulk day in the whole suite unflagged. The
real vault's own cases clear both clauses comfortably: the import day was 180 of 934 (19%)
and the renumbering day 240 of 934 (26%).

A bulk day is **painted in full and counted in full**. Dimming it by default was considered
and rejected: hiding data to make a lens look tidy is the failure this file argues against
throughout, and a reader who is told can decide, where a reader who is shown less cannot.

### The recent chips

Three buttons beside the label: **Today**, **This week**, **Since last open**. Each haloes
the notes whose `touched` falls in its window and dims the rest -- 0 moved, 0 pushed,
measured on all three fixtures, the same result and for the same reason as a picked day.

They read **whichever date the segment names**. One date governs the whole row.

This was the other way round first, and the reversal is worth recording. The chips were
pinned to `touched` on the reasoning that "what did I touch" is the question the issue was
raised to answer, and the row then had to carry a `touched:` heading so the second date was
not silent — which put that word on screen twice, once as a segment position and once as a
heading beside it. The heading was a symptom. With one date governing the row the honesty
requirement is met by the segment alone: the band, the chips, the picked day and the tooltip
all read `heatDateOf`, and there is no second date to disclose. *What did I touch this week*
is two visible clicks — **Touched**, then **This week** — rather than a default nobody can
see the alternative to.

A chip that matches nothing shows **0** and disables itself rather than disappearing --
absent reads as "this cannot be asked", zero reads as "asked, and the answer is none". Day
granularity throughout, because `touched` is a `YYYY-MM-DD` string; "since last open" says
*on or after* the day rather than pretending to an hour it does not have.

**Since last open is plugin-only, by construction.** It needs a timestamp only a host can
keep (`decisions/0009` -- the page stores nothing), so the plugin passes `lastOpen` and the
standalone deliberately does not. The exported page is a snapshot: its data was baked in at
build time, so that window could only ever be empty. The chip is therefore **not built at
all** there rather than built and always zero.

## Two rejected encodings, both measured

**Averaging the day's colours** failed in both directions. Mixing many hues in OKLab
collapses toward grey, so the busiest day — being also the most mixed — rendered
*duller* than a quiet single-colour day: **180 notes at OKLab L=0.713 against L=0.781
for a 13-note day**. With five quantile levels the count channel was also flat at the
top (every day from 8 notes up shared the last bucket) and overlapping at the bottom
(1-note days reached L=0.47 while 2-note days started at 0.45). And the mean is a
colour no note in the vault has.

**Sizing the square by the count** worked — measured strictly monotonic, 5.2px at one
note to the full 13px at 180 — but a grid of squares that mostly do not touch stops
reading as a calendar, and it spends the cell's area on an axis the tooltip already
reports exactly.

The cost of full squares is real and worth stating: two days with the same folder mix
and different counts now differ only in grain, which below about four notes is nearly
invisible. The number is in the tooltip; the band is for the shape of the year.

## The tiling

Vertical strips, `round(sqrt(n))` of them, each split into horizontal bands. Blocks
come out roughly square and the arithmetic tiles the cell **exactly** at any n — which
a row-major grid does not: `ceil(sqrt(n))` rows leaves the last one part-empty, and a
ragged corner reads as a different count.

Notes arrive **sorted by hue**, so a square sweeps the hue wheel from its top-left to
its bottom-right — a small gradient rather than confetti. Folder order was the first
key and it is the wrong one: the group palette is assigned in *name* order (01, 02,
03 …) precisely so a folder keeps its colour as the vault grows, and name order is not
hue order. Measured on this palette, consecutive folders run blue 264°, orange 42°,
aqua 168° — grouping by folder puts the three most distant hues on the wheel side by
side. Ties break on lightness, which is the axis the subfolder tints move along.

## How it stays in step with the disc

Weight is **`alpha[id]`**, the same source of truth the renderer reads — not
membership. So the band densifies frame for frame with the intro and the timeline,
dims as a folder fades out, and needs no filter clause of its own. A note mid-fade is
a translucent block.

It repaints from **`afterRender`**, alongside `placeLogo` — the one hook that catches
cascade frames, timeline frames, the first paint and a container resize without each
of them having to remember. Guarded on a signature of the per-day counts quantised to
a quarter of a note, so a resting page repaints nothing.

One canvas, not 364 divs: a per-frame DOM write per cell would not survive the intro.

## Hovering and clicking a day

Hovering a square haloes that day's notes; clicking pins the selection. Both
deliberately do **not** push the notes out radially, for the reason `isPushed` already
documents for pooled subfolders: a day's notes are scattered across every folder, so
pushing them slides a subset out *through* its cell-mates at the same angles. Verified —
0 nodes move, 0 pushed, 14 haloed on 2026-08-19. `mark today` used to push its 6 and no
longer does -- the argument in this paragraph applies to it identically, which took a while
to notice.

Hover refreshes only when the day under the pointer actually **changes**. `mousemove`
fires many times per cell, and a renderer refresh per event repaints the disc dozens of
times while crossing one square.

**The source field, whichever one is named** -- and never a mix of the two, which is what
`mark today` used to be. Clicking a square must mark exactly the notes that square counted,
or the heatmap is lying about its own number. Since github#70 the band can count either
date, so this rule is enforced through one accessor (`heatDateOf`) that the tally, the
picked day and the tooltip all read; a check drives both sources and asserts that every note
in a tile carries that tile's date. Measured over every tile on all three fixtures: **0
wrong of 1,165 / 954 / 1,295 tiled notes**, and the picked day mismatched **0** of 40, 954
and 54 notes at each busiest day.

## Marking today

An **arrow in the right margin, on today's row, pointing back at its cell**, plus a
full-strength 1px ring on the cell itself. `HEAT_ARROW_W` (9px) is reserved out of the
width before `heatGeom` sizes the grid, so the arrow never costs the grid a column it
was already using.

**It points at the ROW, not the column, and that is the whole idea.** Today is always in
the last column by construction — `start` is `(cols - 1)` weeks before this Monday, so
the trailing column is always the current week. Pointing at the column therefore says
nothing you did not already know. The row is the part that moves, so an arrow beside the
cell names the weekday as well as the day. It also frees the month strip completely:
a caret there had to displace a colliding month label, and now all 12 month-opening
weeks label themselves.

The arrow exists at all because a ring alone structurally cannot do this job. Every ring
on the band is `--today` and they differ only in weight — selection 1.5px, hover 1px at
0.75, today 1px — so today's is the weakest of three, *and* it vanishes entirely the
moment the same cell is hovered or picked, because the three are one if/else chain and
only one ring can be drawn. It started at 0.4 alpha and simply could not be seen. The
arrow is drawn unconditionally, outside that chain. Verified drawn plain, while hovered,
while picked, and with `mark today` on.

Measured on 2026-08-22: column 51 of 52, row 5 (Saturday), 2 notes — one daily note and
one weekly review, so the cell is half green and half magenta rather than either.

## Geometry

The band sits in its own grid row of `#stage` rather than floating over the canvas — so
the disc is centred in what is left and the two cannot collide however short the window
gets.

`heatGeom` drops **weeks before it drops pixels**: columns are how many fit at the 7px
cell floor (minimum 8), then the cell grows into what is actually there, capped at 13.
So the grid always fits and the band never needs its scrollbar. Scrolling was the first
behaviour and it failed in the worst possible way — the grid starts at `scrollLeft` 0,
which is the *oldest* end, so at 150% browser zoom a narrow viewport opened on eleven
empty months with every note off the right edge. It was reported as a missing
stylesheet, which is exactly how it looked. `#canvas` is the new positioning context for the logo, tooltip and detail card,
because `graphToViewport` returns coordinates relative to sigma's container and
`#stage` no longer shares its origin.

The size is re-derived by a **ResizeObserver**, not a window `resize` listener. That
was measured: the band came up at the 7px floor in a 1124px slot, because boot ran
before the embedded pane had settled and no window resize event ever followed.

## What the window leaves out

Reported in the readout rather than dropped, the same call the timeline makes for
undated notes. On this vault: **395 of 450 notes in window, 52 earlier, 3 undated**, across 88
non-zero days — the 52 carry *content* dates back to 2015 (books, quotes). `HEAT_WEEKS`
is the one constant to change if the axis should be shorter.

These counts move around more than they look like they should, and the reason is worth
knowing: the vault moved from `<vault>\<vault>` to `<vault>` on the
same day, and mid-move a build saw both copies (916 notes, a phantom `SecondBrain`
group). Numbers measured that morning and that afternoon are from different vaults. The
*shapes* hold; the exact figures should be re-measured rather than trusted.
