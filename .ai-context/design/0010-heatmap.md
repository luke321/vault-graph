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
| tag-organised | 891 | **1** | **891** | **891** | its generation day (**100%**) — the fourth fixture, added with `github#86` after this was written, and it behaves exactly as the dominant-folder one does |

The days named here move: two of the four fixtures regenerate weekly, so a re-run reports the
generation day rather than 2026-09-05. What is pinned is the rule, not the date.

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

Three buttons beside the label: **Today**, **Last 7**, **Since last open**. Each haloes
the notes whose `touched` falls in its window and dims the rest -- 0 moved, 0 pushed,
measured on all four fixtures, the same result and for the same reason as a picked day.

**The middle chip is a rolling seven days, and it was the calendar week first.** Week-to-date
collapses on a Monday: its window is that one day, so both chips count the same notes, cast
the same halo, and read as one control rendered twice. That is one day in seven -- not an edge
-- and it is what the first reviewer of the built page hit. It also fails hardest where the
question matters most: on a Monday morning "what did I touch this week" can only ever answer
"whatever I touched in the last few minutes". Rolling back six days makes the chip a strict
superset of Today on every weekday, so the pair is always a narrowing rather than two controls
that sometimes agree. `smoke.mjs`'s *the 7-day chip spans seven days on every weekday* walks
all seven reference days rather than whichever one the suite runs on.

The label says **Last 7** and not *Last 7 days*: the unit is left to the tooltip, which names
the span and its first day. The row is a calendar, so the reader is already counting in days,
and every chip carries a reserved count slot beside it -- a longer label is the one thing this
row cannot spend width on (see *the band's control row does not move*).

They read **whichever date the segment names**. One date governs the whole row.

This was the other way round first, and the reversal is worth recording. The chips were
pinned to `touched` on the reasoning that "what did I touch" is the question the issue was
raised to answer, and the row then had to carry a `touched:` heading so the second date was
not silent — which put that word on screen twice, once as a segment position and once as a
heading beside it. The heading was a symptom. With one date governing the row the honesty
requirement is met by the segment alone: the band, the chips, the picked day and the tooltip
all read `heatDateOf`, and there is no second date to disclose. *What did I touch this week*
is two visible clicks — **Touched**, then **Last 7** — rather than a default nobody can
see the alternative to.

### The row has one height, and one fewer thing in it

Every control above the band is the same height, declared once as `--vg-hrow-h` on `.hrow` and
taken by each control through `height` rather than left to its own padding. Measured at
1440x900 before: segment **22.5px**, chips **27.9**, compact toggle **22.0**, date inputs
**22.3**, All dates **27.9** -- six controls, four heights, reading as five widgets that
happened to land on one line. The paddings still differ, because a segment position is not a
date input; the height is what has to agree. 26px, a little taller than the segment was, so the
row settles slightly up rather than everything shrinking to its tightest member.

The `fewer [][][] more` key is **gone**. It explained the one thing the band demonstrates by
existing -- a denser square is more notes -- and it was the only item in the row that could
never hold the row's height, being a canvas sized from the cell. It is also the element that
cost the most to keep still: its swatch count follows the quantile cuts, so a date switch that
collapsed the cuts pulled **17px** out of the row, and `heatDrawKey` carried a reserved-width
rule (`HEAT_KEY_ANCHORS`) for that alone. Removed on review -- *"I think people will get the
idea"* -- along with that rule. The readout beside it still names the tally in words, which is
the part a reader cannot infer from looking.

A chip that matches nothing shows **0** and disables itself rather than disappearing --
absent reads as "this cannot be asked", zero reads as "asked, and the answer is none". Day
granularity throughout, because `touched` is a `YYYY-MM-DD` string; "since last open" says
*on or after* the day rather than pretending to an hour it does not have.

**An armed chip is a set of ids, so anything that mints ids has to say so.** Two parts of the
page do: a live rebuild (`github#72`) re-mints them, and a dimension switch (`github#86`) draws
stand-in copies. The lens is therefore in the invalidation registry — re-arming against the
reference it was armed with, never the clock — and both reads of the set go through `noteOf`,
so a stand-in is lit by whatever lights the note it draws. Neither was visible while the two
subsystems and this one were on separate branches; see `invariants.md` for the numbers.

**Since last open is plugin-only, by construction.** It needs a timestamp only a host can
keep (`decisions/0009` -- the page stores nothing), so the plugin passes `lastOpen` and the
standalone deliberately does not. The exported page is a snapshot: its data was baked in at
build time, so that window could only ever be empty. The chip is therefore **not built at
all** there rather than built and always zero.

### Three CSS specifics behind `#vg-heatsrc` and `#vg-recent` (github#174)

`#vg-heatsrc` reads as one joined control rather than two loose buttons on purpose -- the
Added/Touched pair is a single choice with two positions, the same idea `.seg` already uses
in the sidebar at row scale, and both are always rendered so the row's width never shifts as
the pressed one changes. The label above it took `font-family` alone rather than the `font`
shorthand: `.hrow .lbl` already owns the size, weight, transform and letter-spacing by
specificity, and `font: inherit` there would have silently taken all of those away instead of
only the family it was meant to override. And Added/Touched are bolded identically -- weighting
only the pressed side moved its sub-pixel width as the label text changed length, which put a
1px wobble back into a row github#70 had just made stable; the accent fill already says which
side is pressed, louder than 100 units of font-weight would.

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

## What the code used to say, moved here (github#70)

On 2026-09-14 the lens landed with its reasoning written into the code -- 173 comment lines across four files that `check-comments` counts as prose, because a comment in `plugin/`, `src/` and `scripts/` is a pointer and the reasoning belongs here (CONTRIBUTING.md, github#61). Each block below is that text verbatim, under the file and line it sat at on develop `e409a7a`; the code now carries `github#70` at each site. Where a block restates a section above, the section above is the record and this is its provenance.

### `plugin/main.js`

**line 55**

> opened or closed. Absent until the first
> open, which is why the chip is missing
> on a first ever run.

**line 583**

> github#70 -- the stamp as it was before THIS open; see onOpen. @type {number | undefined} */

**line 592**

> Read the previous stamp BEFORE overwriting it: what "since last open" means is the
> last time this view was up, not this instant. Stamped at open as well as at close
> because a quit that kills Obsidian never fires onClose, and a chip that silently
> stops moving is worse than one that measures from a slightly earlier moment.

**line 948**

> github#70 -- re-passed unchanged by a rebuild, so Refresh does not turn "since last
> open" into "since the last rebuild".

### `src/page.js`

**line 109**

> open. Absent means the host cannot know (the
> exported page), and the third recent chip is
> not built at all rather than built dead.

**line 500**

> "since last open" is the host's memory of its own lifecycle, not a page setting. Absent
> (the exported page, which is a snapshot and cannot know) means the chip is never built.

**line 3300**

> The date the BAND is counting, github#70. `created` is still the default and
> design/0010's argument for it stands unchanged -- this is the one accessor every band
> reader goes through so the tally, the picked day and the tooltip cannot disagree about
> which of a note's two dates they meant. Also the seam a day-contents list would read.

**line 3321**

> github#70. The chips read whatever date the segment names -- ONE date governs the whole
> row. They were pinned to `touched` at first, on the reasoning that "what did I touch" is
> the question the issue was raised to answer; that put two dates in one row and forced a
> "touched:" heading next to a button already saying Touched. With the segment visible the
> heading is redundant: the row states its date once, and both controls obey it.

**line 3333**

> How far the non-matching notes have dimmed, 0..1. Walked by hlWalk. */

**line 3335**

> The reference day the armed window was built from, or null for "ask the clock". It has
> to be remembered rather than re-derived: a check arms a chip against the fixture's own
> newest touched day, and a chip whose label counted a different window from the one
> lighting the disc would be the band's own dishonesty problem in miniature.

**line 3344**

> The window a chip stands for, in day keys -- `touched` is a YYYY-MM-DD string, so a day
> is the honest granularity and the tooltip says "on or after" rather than pretending to
> an hour. `refMs` exists so a check can ask what a chip WOULD match on a given day: no
> fixture has a note touched today, and one keyed to the real clock rots by the morning.

**line 3356**

> The verb follows the segment, so a chip never claims a date the band is not counting.

**line 3360**

> github#70 -- a ROLLING 7 days, not the calendar week to date. Week-to-date was the
> first shape and it collapses: on a Monday its window IS today, so the two chips
> count the same notes, cast the same halo and read as one control duplicated. That
> is not a rare edge -- it is one day in seven, and it was the first thing a reviewer
> hit. It also made the chip weakest exactly when a week's work is most worth asking
> about: Monday morning, the answer is always "just today". Rolling back six days
> keeps the chip a strict superset of Today on every day of the week.

**line 3373**

> The host's stamp can outrun the newest dated day (it is a clock, not a file), and a
> window whose start is after its end matches nothing rather than everything.

**line 3380**

> Recompute which notes a chip matches. Done once per change rather than per node per
> ramp frame: hlWalk asks isHighlighted for all 10,002 nodes on every frame of a ramp.

**line 3396**

> github#72, design/0014 -- an armed chip is a set of ids, and a live rebuild re-mints them:
> an arrival is a node that did not exist when the set was built. That arrival is the whole
> case this lens exists for -- a note edited or created with the view open is exactly what
> "touched today" means -- so a set left alone would go quietly stale on the one event it
> most has to answer. Re-run the window against the reference it was armed with, never the
> clock: a check arms a chip against a fixture's own newest day and must still be measuring
> that day after the rebuild.

**line 3409**

> Day-key string compare, which is why the format is worth keeping: YYYY-MM-DD sorts as a
> date. Through heatDateOf, so a chip lights exactly the notes the band's own tiles counted
> over the same span.

**line 3425**

> The picked day was a key in the OTHER date's tally, so it names notes this one may
> not have. Clearing it is the honest move -- design/0010's rule is that clicking a
> square marks exactly the notes that square counted.

**line 3430**

> An armed chip means a window, and the window is now over the other date -- so it has to
> be recomputed, against the same reference it was armed with.

**line 3441**

> github#86 -- through noteOf, so the stand-in a dimension switch draws for a note is lit
> by whatever lights the note. Nothing but a switch makes copies, and noteOf costs one
> branch while none exist.

**line 5227**

> github#70 -- both of them. The source decides which date isMarkedDay reads,
> so it changes who is lit without state.markDay itself moving.

**line 5240**

> github#70 -- the recent lens dims what it did not match, on the same ramp as the
> halo it is the other half of. One page-level number, not a per-note one: every
> non-match dims by the same amount, the way the focus web already treats non-members.

**line 5393**

> github#70 -- the other half of the lens. A match keeps its folder colour and its
> halo; everything else recedes. Colour only: no size and no alpha multiplier, so a
> dot the cascade is still walking is untouched by this (the law about resting sizes).
> The note under the pointer is exempt: asking what something is must always answer,
> and a lens is a way of looking rather than a filter that removes.

**line 6233**

> github#70 -- only when the two disagree, so most cards are unchanged. This is the
> one place a person can see WHY a recent chip lit a note whose added date is old.

**line 7158**

> github#70 -- neither is persisted (decisions/0009 keeps filters and highlights out of
> the store), so Refresh returns the band to the date it opens on and drops the lens.

**line 8528**

> github#70. `mtime` is not a record of work: a rename pass, a sync or an import rewrites
> it in bulk, and design/0010 measured this vault's own worst case at 240 files "touched"
> on the day the folders were renumbered. So a day that cannot plausibly be a day's work
> is NAMED -- the tile is still painted full and its notes still count, because hiding
> data to make a lens look tidy is the failure this whole file argues against.
> TWO tests, because either alone has a measured hole:
> - a MULTIPLE of the median day catches the renumbering case in a vault with a normal
> spread of days -- but the median is dragged by the outlier itself when there are
> few days. Measured on the dominant-folder fixture, whose 954 notes all carry one
> mtime: 1 distinct day, median 954, so the day was 1x its own median and the one
> genuine bulk day in the whole suite went unflagged.
> - a SHARE of every dated note catches exactly that, and needs no spread to work. The
> real vault's import day was 180 of 934, 19%; the renumbering day 240 of 934, 26%.
> The floor keeps both off a small vault, where 6x the median can be four notes.

**line 8596**

> github#70 -- said in the readout as well as the tooltip, because a bulk day changes
> how the whole band should be read and a tooltip is only seen on purpose.

**line 8795**

> github#70 -- the tooltip has always named the number; now it names the DATE too,
> because there are two and the reader cannot see which one the band chose.

**line 8822**

> github#70. Every chip, every run: how many notes it would light RIGHT NOW -- counted
> against alpha, so a chip composes with the folder filter and the date range the way the
> band's own tiles do ("meeting notes touched this week" is two clicks, not a query).

**line 8846**

> Same key the band tiled by, so a chip's "of them on a bulk day" counts the same days
> the band flagged.

**line 8854**

> github#70 -- refresh the chip labels, counts and pressed state. A chip's matches are
> cached per window (recentCount), so a call is one pass over them: heatDraw calls it
> whenever it repaints, which during a cascade is every frame, the cadence the band's own
> tiles get. A chip click calls it directly, since that changes no day count.

**line 8888**

> A chip that matches nothing stays visible and says zero. Hiding it would make the
> page look as though the question could not be asked, which is a different claim.

**line 8904**

> Reserve the count slot for the widest number this vault could put in it. A chip going
> 0 -> 115 otherwise widens and shoves its neighbours along, which is the same class of
> fidget as the label swap above -- measured at 19px across the row before both fixes.

**line 8908**

> The exported page is a snapshot: it cannot know when it was last open, so the chip is
> never built rather than built and disabled, which would read as a broken feature.

**line 8913**

> "Last 7", not "This week": the window is a rolling seven days (see recentWindow), and
> a label naming the calendar week would describe a window this chip no longer has. The
> unit is left to the tooltip, which names the span and its first day -- the row it sits
> in is a calendar, so the reader is already counting in days, and the count slot beside
> every chip makes a long label the one thing this row cannot afford.

**line 8935**

> Radio-like: the active chip clears rather than re-applying. There is no "all"
> chip because no lens is the resting state, and that is what Refresh returns to.

**line 8951**

> Each position sets its own date rather than toggling. A two-state control whose
> buttons both mean "the other one" is how the label version confused its reader.

**line 10654**

> setRecent takes a reference day so a check need not wait for
> the calendar to agree with the fixture.

### `scripts/obsidian-smoke.mjs`

**line 625**

> github#70, decisions/0009. The HOST owns this clock, so no page check can reach it and
> it was a hand-run step until now: the page is handed the stamp from the PREVIOUS open,
> never this instant, or the chip would name a window that closed the moment it opened.
> The stamp is written at open as well as at close because a quit that kills Obsidian
> never fires onClose, and a chip that silently stops moving is the worst of the three.

**line 644**

> Refresh rebuilds the view in place, and re-passing "now" would turn "since last open"
> into "since the last rebuild" -- the dep must survive a rebuild unchanged.

### `scripts/smoke.mjs`

**line 1218**

> EVERY ONE OF THESE INJECTS ITS OWN REFERENCE DAY, and none may be rewritten to use the
> real clock. No fixture has a note touched today: the newest touched day was 2026-09-05 on
> the demo and dominant-folder shapes and 2026-08-28 on the 10k, all measured 2026-09-08,
> and the two ageing fixtures push that date forward every weekly regeneration while the
> pinned 10k never does. A check keyed to `new Date()` therefore reads zero on all three and
> passes by measuring nothing -- the same trap the pinned 10k --end exists to avoid. The
> reference is the newest `touched` day the graph actually holds.

**line 1240**

> github#70. It was week-to-date first, and week-to-date collapses: on a Monday its window
> IS today, so both chips counted the same notes and cast the same halo -- one day in
> seven, and the first thing a reviewer hit. The window is now rolling, which is a claim
> about all seven weekdays at once, so the check walks all seven rather than whichever one
> the suite happens to run on. Reference days are injected for the usual reason (see the
> section header): a check keyed to the real clock tests one weekday and rots by morning.

**line 1301**

> github#113 -- arming and clearing a chip inside one eval leaves the highlight ramp
> walking, and a check hands the page back at rest or the next one measures a moving disc.

**line 1321**

> The dominant-folder fixture carries ONE touched day for all 954 notes, so any window
> either matches everything or nothing and there is no non-match left to dim. That is a
> property of the vault, not a defect, and asserting on it would assert nothing.

**line 1341**

> github#70 x github#86. A switch draws the leaving disc with copies: a stand-in is a
> second dot for a note the lens has an opinion about, under an id the lens has never
> seen. Read by its own id it is a non-match, so the note would be haloed on one disc and
> dimmed on the other, mid-switch, for as long as the cross lasts.

**line 1385**

> litStandIns > 0 is what stops this passing by measuring an empty set.

**line 1424**

> Exactly one of the two positions is pressed at any moment, and it is the one whose word
> matches the date the tally actually used -- the control cannot show a state the band is
> not in, which is the whole point of putting both positions on screen.

**line 1497**

> github#70. Every control in the row was fidgeting: the label swapped "Notes added" for
> "Notes touched" and grew 76px -> 90px, shoving everything to its right by 14, and a chip
> going 0 -> 115 widened and shoved its neighbours again. Worst measured shift across the
> five states was 19px. A control that walks away from the pointer between clicks is a
> defect the suite cannot see, so it is pinned here by number.

**line 1545**

> github#70. Measured at 1440x900 before this: the Added/Touched segment 22.5px, the chips
> 27.9, the compact toggle 22.0, the date inputs 22.3, All dates 27.9 -- six controls, four
> heights, sitting on one line and reading as five widgets that happened to meet there. The
> row declares ONE height now (`--vg-hrow-h` on .hrow) and every control takes it, which is
> a claim no other check in here covers: the fidget check pins `left` and `width` and would
> pass with every height in the row different.

**line 1584**

> The standalone deliberately passes no lastOpen (src/shell.html): a snapshot cannot know
> when it was last open, so the chip is absent rather than present and always zero.

**line 6281**

> github#70 x github#72. The lens answers "what did I touch", and the live rebuild is what
> makes a note touched WHILE THE VIEW IS OPEN reach the disc at all -- so the one event the
> chips most have to survive is the one that re-mints their ids. Armed against a fixed day
> rather than the clock, like every other chip check here.

**line 6309**

> Put the vault back for whatever runs next, and hand the page over at rest and unfiltered.
