# 0014 — The live rebuild: how the disc follows the vault

github#72. Read with `animation.md` (what a cascade is) and `decisions/0011` (where the geometry
lock's step goes). `decisions/0006` is the load-bearing one.

## What it is

`api.applyData(next, { renames })` takes a fresh build of the vault and walks the disc to it,
instead of tearing the mount down. The plugin subscribes to the metadata cache and the vault,
debounces, and calls it. The standalone exporter **does nothing**: a built page is a snapshot by
construction, `applyData` is on the mount api and the exporter never calls it, and the Refresh
tooltip in `src/page.html` already says so.

## There is no second animation path, and there must not be one

The whole design is one sentence: **an arriving note is inserted at `alpha = 0` before either
cascade endpoint is built.**

`decisions/0006` guarantees a zero-weight member changes no plan, no row and no `maxR`. So:

- `planA = staticPlan(wasPresent)` is the disc **exactly as it is drawn**, with the arrival seated
  and costing nothing;
- `planB = staticPlan(willShow)` is the new rest;
- the ordinary cascade walks between them, with the arrival fading in and everything else
  re-packing continuously.

Nothing here knows it is a "live" cascade. That is the point. A departing note is the mirror case
and was already handled — `planKeep` is *staying or still on screen*, so it holds its slot while
it fades.

## How each law survives an edit arriving mid-cascade

| Law | Mechanism |
|---|---|
| Nothing while a cascade is busy | `applyData` refuses while `cascadeRun`, `anim` or `play` owns the frame loop. The data is held in `livePending` and a 120 ms interval re-offers it. Nothing reaches into the frame loop, which is the whole reason the interval is used rather than a hook inside `settle()`. |
| The serpentine survives | Everything derived is re-derived **at rest**, before `planA`, by `ingest()` — the same function the mount runs. Nothing between weight and position is computed per frame that was not already. |
| Rings independent, thickness locked | `bandLock` re-derived with the previous lock as the hint, at rest. See `decisions/0011`. |
| The hub is a fraction | Follows `geomLock`. `holeShare` measured unchanged on both fixtures. |
| Resting disc on the lattice | Unchanged: `settle()` still lands on `planB`, a real resting packing with integer rows. |
| `settle()` is a no-op | `decisions/0011`. Measured at 0 moved / 0 resized on all three fixtures. |
| A zero-weight member costs nothing | Not merely preserved — it *is* the mechanism, above. |
| A dot never outgrows its two resting sizes | Free. `sizeCap` is the max over `roomOf(a)` and `roomOf(b)`, and `roomOf` records a size only above alpha 0.004 — so an arrival is absent from endpoint A and capped by B alone, which is its one resting size. A departure gets A alone. No change was needed. |
| A fade never reverses | github#67's rule is that a schedule is decided once, before the frame loop, from numbers that stand still. Because a diff never lands mid-cascade, no schedule is ever recomputed under a running fade. A second edit during a burst *replaces* the held one rather than queueing, so a burst is one cascade. |

## A cascade nobody can see is one they did not get

Measured in a real Obsidian (`obsidian-smoke.mjs --only live`, demo fixture) before this existed:
open the graph, switch to another note, write a new one, switch back. The note was taken in
1,315 ms after the write and the cascade **ran to completion behind the hidden leaf** -- the disc
moved on 20 of the samples taken while it was hidden and **0 after switching back**. The reader
came back to a disc that had silently changed, which is the opposite of what this is for.

So a rebuild is **held while the leaf is hidden**: `liveVisible()` is `containerEl.offsetParent
!== null`, which Obsidian makes false exactly while an inactive leaf is `display: none`
(measured false on 83 of 83 samples while hidden, and the leaf's own container hidden on 83 of
83). The dirty paths keep accumulating, nothing is built, and the whole burst lands as one
cascade when the leaf comes back. After the fix, the same run reports **0 samples moved while
hidden and 20 after switching back**, twice in a row.

**The wake is a poll, and that is not laziness.** `active-leaf-change` and `layout-change` were
tried first and do not carry the case that matters: instrumented, switching *away* fired **five**
of them and `revealLeaf` fired **none**, so a wake hung on those events never arrived and the
note stayed invisible until the next unrelated edit. A 500 ms interval runs only while a rebuild
is actually waiting to be seen, and stops the moment it lands.

An earlier attempt tested visibility inside the event handler instead of after the debounce; that
failed differently and is worth knowing about, because both events fire *before* Obsidian re-lays
out the workspace, so `offsetParent` is still null at handler time.

## Filming it, and driving Obsidian at all

`scripts/record-live.mjs` is the clip on the feature page, and it is the plugin doing the work
in a real Obsidian: demo vault, built plugin, throwaway profile, the graph in one tab, a note
written in a second, the graph tab clicked back. Everything it learned is a rule for the next
harness that drives Obsidian:

- **A new tab is `getLeaf('tab')`, never `getLeaf(false)`, and a note is opened into a leaf you
  hold.** `getLeaf(false)` reuses the active leaf, which replaces the graph view outright when the
  graph is the active one; `getMostRecentLeaf()` after a click on the `+` button answers the graph
  leaf when the click did not land. The harness opens the note into the active leaf only when its
  view type is `empty`, else into a fresh `getLeaf('tab')`.
- **"At rest" is not "no dot moved".** The intro sweeps the date range and moves no dot, so a
  settle that hashes positions declares rest while the sweep is still running -- the first take
  started filming mid-intro. The rest signal is positions and sizes *plus* the range-end field,
  the length of the page's text, and the number of notices on screen.
- **`SetCursorPos` moves the cursor and injects no input.** Two takes had the pointer visibly on
  the arrived dot and no tooltip: the page never saw a mousemove. Every move in
  `scripts/win-input.ps1` is followed by two 1 px `mouse_event` nudges, which are real input, and
  the harness reads the tooltip back rather than assuming the hover -- a rim dot is a pixel or two
  wide, so a miss is nudged around the target before it is called a miss.
- **Language.** A fresh profile speaks the machine's language; the clip sets
  `localStorage.language` to `en` and reloads before anything is filmed.
- **The note must be indexed before switching back**, or the disc takes an orphan and then fixes
  it with a second cascade: the harness waits for `metadataCache.getCache(path).links` to be
  non-empty (about 300 ms after typing stops, 600 ms for the second note).
- **What the take measured, and the clip shows:** the note is on the disc ~1.4 s after the tab
  click -- the 500 ms wake plus the 1 s debounce -- and the cascade is at rest ~2.5 s after that
  (1,366 / 3,859 ms outer, 1,450 / 3,970 ms inner). The numbers are in `changelog-detail.md`.

## One construction, not two

`ingest(src, keepId)` builds the graph, the edge budget, the dot sizes, `hubRank` and the
subfolder tallies. The mount calls it; so does `applyData`.

An incremental path was rejected without being written. `hubRank` is a full sort, `subOrder` a
full tally, and the edge budget a share of *every* edge (`EDGE_SHOWN`, the lazy-edge ramp) — none
of which patch correctly from a delta. Two constructions that must agree exactly, one of them
exercised only on rebuilds, is the shape of every bug this project has already had. `GraphStore`
gained `clear()` for it, because the renderer holds the store by reference.

`keepId` is what makes a note's id survive: the cascade walks **from the positions the old ids are
drawn at**, so an id that changed is a note that teleports. Node ids therefore stop being
contiguous array indices. They were already opaque strings everywhere except construction — the
audit found no numeric coercion anywhere else — with one exception, below.

## What the diff compares, and what it deliberately ignores

Structural only: `label`, `folder`, `sub`, `dirs`, `type`, `tags`, `created`, `touched`, `deg`,
`ghost`, and every link weight.

**`words` is absent on purpose.** Obsidian saves the open note every couple of seconds and each
save reaches the metadata cache. A word count in the key would make writing a prose paragraph an
endless cascade. Typing therefore produces an empty diff and the disc does not move; the counts
land silently on the graph and no layout reads them.

Above `LIVE_MAX_CHANGED` (200) changed notes the page refuses and reports a `churn`, and the host
does what Refresh does. Two hundred files arriving at once is a sync, an import or a folder move,
not an edit.

## The index/id defect this exposed

`plugin/main.js` read word counts in the background after the mount and applied them with
`graph.setNodeAttribute(String(i), "words", w)` — the note's **index in the build**. That was the
same string as its graph id only because nothing had ever rebuilt the graph.

The first live rebuild breaks it: after one note is removed from the front of a 1,403-note vault,
**index and id disagree for 1,401 of them** (measured; 10,000 of 10,002 on the 10k fixture). Every
count still in flight then lands on the wrong note, silently — a plausible number on the wrong
dot, which nothing would ever have reported.

The fix is `api.setWords(path, words)`, addressed by the one thing the host and the page actually
agree on. `smoke.mjs`'s *"word counts land by path"* check asserts it, and was verified to fail
with the defect reintroduced: the count landed on the bystander at that index instead.

## Where the reasoning for a number is

- Debounce, 1 s — floor is a build (index + edges out of the cache in under 80 ms on 10k),
  ceiling is what reads as "it noticed".
- Word counts of untouched notes are carried across, not re-read — they are **96 % of a cold
  build** (1.85 s of 1.92 s on the 10k fixture, `invariants.md`) and no layout reads them.
- `LIVE_MAX_CHANGED`, 200 — see above.
- Everything about the geometry lock — `decisions/0011`.

## What a live add actually costs the disc

The ticket assumed one note would move almost nothing. It does not, and this is a property of the
deterministic layout rather than of the diff: one more note reallocates its wedge's share of arc,
and every wedge after it in the sweep shifts.

| | demo (1,403) | 10k (10,002) | dominant-folder (954) |
|---|---|---|---|
| notes moving > 0.5 u | 318 (23 %) | 2,339 (23 %) | — |
| worst move | 185 u | 136 u | 180 u |
| max \|Δr\| | 146 u = **0.82 of a row** | 119 u = **0.74 of a row** | — |
| dot-size Δ, p90 | 0.028 (1.2 % of median) | 0.0004 | — |

So the value is not "only your note moves". It is that the disc **absorbs** the note in one 2 s
cascade instead of tearing down, rebuilding and replaying a six-to-nine-second intro — and that
the filters, the date range, the pins and the camera all survive, which Refresh clears.

## Adding another invalidation

`invalidatesOnData(name, fn)` registers a cache that a changed note set stales. Register at the
cache's own definition site, not in `applyData`; the handler runs at rest, after the graph holds
the new note set and before either endpoint is built, and must not start an animation.

Five today: timeline ranks, heatmap tally, hop trail, selection/hover/pins, search hits. The
heatmap one is the cautionary tale — each day cell holds a **list of node ids** and `heatCompute`
asks each for its colour, so a deleted note left in one throws out of `regroup`. Clearing the
signature was not enough; the lists have to be rebuilt. The round-trip check found that on its
first run.

`__vg.invalidations()` lists the names, and a smoke check asserts the five are all still there.

## Verify

```bash
node scripts/smoke.mjs --only "live rebuild"      # three checks, all three fixtures
node scripts/smoke.mjs --only "land by path"      # the index/id defect
```
