# `scripts/live-growth-check.mjs` — the live-arrival harness

Written for github#120: *does anything grow while notes arrive continuously with the view open?*
It drives a **real Obsidian** over CDP for minutes against a throwaway copy of the demo fixture,
creating notes on a timer and sampling what grows. The measurements it produced are in
[`changelog-detail.md`](changelog-detail.md) under 2026-09-12; this file is how to run it and what
its traps are.

**It is not a gate.** `scripts/smoke.mjs` stays Chrome-only and ~100 s so it can run on every
push; this takes minutes and a real editor. Run it by hand, read the table, put the numbers in
`changelog-detail.md`.

```powershell
node scripts/live-growth-check.mjs --view open   --phase-sec 90
node scripts/live-growth-check.mjs --view closed --phase-sec 90
```

The **closed** run is the control: the same arrivals with no view, which separates the live-rebuild
path (github#72, design/0014) from the mere act of writing files.

`--no-live` is the other control, and it bounds what this plugin can even fix: with live refresh
off the plugin does no work at all on an arrival — no rebuild, no build, no apply — so any stall
that survives is Obsidian parsing the note and updating `resolvedLinks`, which is not ours to defer.
Measured, it refuted the hypothesis that the pan stall was Obsidian's floor.

It places an Electron window on the leftmost screen, so it takes `screen-left` and releases it on
every way out (github#87).

## What it samples, and why each one is there

| | |
|---|---|
| JS heap after a forced `collectGarbage` | twice — the first pass frees, the second collects what the first made unreachable |
| the whole process tree's working set, from outside | the JS heap cannot see WebGL buffers, textures or the GPU process; this can |
| DOM node and listener counters | `Memory.getDOMCounters` |
| Obsidian's own emitter handler arrays | invisible to the DOM counters, and where `subscribeLive()` and the `css-change` registration leak |
| whether the disc reaches rest | the disc's own order, not a quiet flag — see below |

The three arrival rates are the ones the issue names: 5/s (well above the debounce, every arrival
cancels and re-arms it), 1/s (at `LIVE_DEBOUNCE_MS`), 0.5/s (below it, one rebuild per arrival).

Steady arrivals never reach `LIVE_MAX_CHANGED`: at 5/s a rebuild covers about five notes. The path
that does is design/0014's deferral — while the leaf is hidden nothing is built and `dirtyPaths`
accumulates, so the wake can land a churn well over the limit and the host does what Refresh does,
`lastData = null; await this.render()`. That is the only routine way `render()` reruns, which is
why the run ends with bursts behind a hidden leaf. In the field it is a sync or an import arriving
behind a background tab.

Each arrival links to an existing note so the rebuild takes the structural path — a words-only diff
moves nothing and is not what the issue reports.

## Four traps, every one of them paid for

**`app.vault.create()` does not create intermediate folders.** It throws, and a swallowed throw
here reads exactly like a working harness measuring nothing. The first run of this file did
precisely that: **0 created, 392 refused**, every sample flat, and the log said none of it.

**`atRest()` cannot tell "settled" from "never started".** If no rebuild was ever scheduled then
nothing is building, no timer is armed and no dot moves — so it reports rest on a disc that has
silently ignored the whole burst. That is what it did: two bursts, **530 notes**, order frozen at
1403 and every live flag false, and the run still printed a clean table. The disc's own order is
the only honest signal, and a run where nothing arrived now refuses to be that run.

**rAF suspension is one gap, not a long probe.** rAF stops while the window is occluded or
minimised, and the gap that leaves is the *absence* of frames rather than a frame. The test is not
that the probe overran — a drag is 375 sequential CDP round trips, so a six-second drag routinely
takes fifteen under load and every frame in it is real. Suspension is when **one** gap swallows most
of the window: 285,578 ms of a 290 s probe is 98% and is not a frame time; 687 ms of 15,291 ms is
4.5% and is exactly the stall being measured. An earlier threshold on wall clock alone discarded
three good rows.

**The feeder must be bounded by count as well as by the drag flag.** One probe overran by five
minutes and dumped 292 notes into a six-second window, which then read as a 285-second "frame".

## Two things the plugin build does not have

`build-plugin.mjs` strips the demo and debug region (`stripDemoAndDebug`), so **`__vg.liveState()`
and `__vg.invalidations()` do not exist here at all** — everything is read off the view's own
fields instead. And a generated vault opens untrusted, so the harness enables the plugin
programmatically rather than clicking the trust dialog (`CLAUDE.md`); until that runs, a perfectly
good plugin reads as broken.

## The pan measurement

Reported from use: the disc lags when panned while notes arrive. Nothing on the pan path cancels
anything — pan is `enableCameraPanning` on the renderer's own camera — and `liveBusy()` was
`cascadeRun || anim || play`, which does not include a drag, so `applyData` did not defer for a pan
and an arrival ran ingest + `hardRelayout` + cascade synchronously, mid-drag.

The report rests on a **pair**: the same slow circular drag (roughly 60 Hz across the stage), quiet
and then under arrivals. The quiet pass is the control. The harness repeats the drag after one more
`render()` has run, which is what separates "degrades with mount count" from "degrades with vault
size" — measured, it is neither.
