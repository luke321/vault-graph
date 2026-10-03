# github#186 — wedge-packing investigation tooling

## Native recording cadence investigation, 2026-10-03

Follow-up: the strict baseline warm-reload control now completed. Initial graph
positions, controls and camera were identical. Its largest presentation interval
was 16.737 ms, with no shader-cache load/store during the action, versus three
33.3 ms presentation gaps in the cold trace. A separate constant-gradient-stop
experiment removed the original 20 ms raster spike but still had a 50 ms
presentation gap elsewhere; that experiment is not an app fix and is not shipped.

The recorder now has an explicit `--rehearse` mode, documented in
[`native-recording.md`](../../../scripts/native-recording.md), with state-reset
evidence and a cold/warm label. Its focused tests pass; final headed verification
remains queued. Cold-start behavior must continue to be tested separately.

The intermittent Obsidian missing-dot report is separate. Fresh-install and
initially hidden-pane probes using the installed bundle rendered 1,407 synthetic
notes without errors. Reopening restores the user's affected view, but the actual
persistent blank state has not yet been reproduced. Do not equate this report with
the measured short Chrome presentation pauses.

The remaining demo folder-to-tag hold occurs before encoding, in Chrome's frame
presentation path. A headed diagnostic kept the accepted app `aa987d6` unchanged,
delayed the trigger by another second, and logged render submissions, graph position
checksums and Chrome GPU/compositor tracing alongside the native lossless recording.
The hold moved with the animation: three repeated frames at 142–192 ms after cascade
start, rather than staying at the original recording's one-second mark.

During that hold, native capture gaps were at most 17 ms and rAF gaps 16.8 ms.
Cascade frames 9, 10 and 11 submitted renders with different graph positions. Chrome's
`AnimationFrame::Presentation` events instead had a 50.025 ms gap at 153–203 ms.
A GPU raster flush took 22.076 ms; shader-cache load/store events bracketed 21.480 ms
of work inside it, followed by swap throttling. This distinguishes an actual browser
presentation stall from intentional stationary easing, MP4 duplication introduced
by resampling, or a playback-only dropped frame.

The baseline sortspec solo-out diagnostic showed the same mechanism at the phases
seen in the archived rejected takes: GPU raster flushes of 20.061 ms around 1.208 s
and 16.035 ms around 1.890 s, with new shader-cache entries and presentation gaps of
33.328 and 33.366 ms respectively. That diagnostic retained 122/122 source states and
had only two-frame repeats, so it does not reproduce the exact three-frame historical
hold. Capture/display phase and workload can change how many repeated samples a
missed display deadline produces. The app rAF maximum remained 17.1 ms.

**Confirmed:** the reproduced demo hold is a browser presentation stall, and the
baseline exhibits matching GPU/presentation stalls at the relevant phases.
**Leading explanation:** first-use Skia GPU shader creation. Cache events alone do
not identify the exact compiler operation. Chromium's
[shader cache](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/gpu/command_buffer/service/gr_shader_cache.cc)
and Skia's
[program builder](https://skia.googlesource.com/skia.git/+/de7f6e2fe567f4d1f1699cde72f7cffb8c19faa2/src/gpu/ganesh/gl/builders/GrGLProgramBuilder.cpp)
explain the cache and shader-creation path; the attribution remains an inference
until the stricter control below runs.

A preliminary same-browser rehearsal of demo tags then folders removed the
three-frame hold and all new shader-cache entries during the measured action. Its
largest presentation gap was 33.409 ms. It is supporting evidence only: a shared
suite overlapped this run, and playback was stopped after the first completed pass.
It is not a replacement review clip or a complete controlled acceptance run.

The stricter controls are prepared: rehearse the exact action, reload the same page
in the same browser, prove identical initial graph/view state, then record with
Skia shader tracing enabled. They were deferred behind the shared manual-playtest
suite; the waiting helper was stopped with no child process, so no unattended
capture remains queued. All owned capture browsers and record/screen locks were
released. No full suite or app change was made.

Raw traces, diagnostic masters, derived summaries and reproduction scripts remain
in the local `vg186-cadence-cause` scratch directory. Small evidence copies are
preserved beside the existing review under `evidence/cadence-cause`. The original
60 clips, their checkmarks and both failed cadence flags remain unchanged. Warming
a recording would measure warm behavior; it must not be presented as fixing the
app's first-use behavior or as repairing frames in an existing recording.

Investigation only. Nothing here is a fix, and nothing in `src/` or `plugin/` changed. The
write-up, with the clips, the stills and the charts, is the review Artifact linked from the
issue; this folder holds what re-produces its numbers.

| file | what |
|---|---|
| `probe-186.mjs` | drives a built page in headless Chrome over `scripts/cdp.mjs`, fires one act (`only:<group>`, `eye:<group>`, `--dim tag`, `--pre` for a setup act) and samples every cascade frame: per group the arc allotted and the opacity inside it, per band the live pitch, seams and the radial extent of lit notes, ten watched notes' opacities. Snapshots rest before, after, and after `relayout()`. `--film` records a screencast. `--headed` takes the `screen-left` lock and a real window instead |
| `analyse-186.mjs` | prints the rest states, the per-frame table, the arc-vs-opacity coupling per group, the radial walk per band and the watched notes, from a run's `probe.json`; writes `frames.csv` |
| `encode-186.mjs` | square, CROPPED clip and stills at chosen `pr` from a filmed run |
| `chart-data-186.mjs` | condenses the runs into the JSON the review page charts |
| `packed-186.mjs` | measures the runs against the definition of packed given on 2026-09-21 — every wedge touches both seams and both rings at all times, the static radii honoured — as seam coverage per lit wedge and ring reach per band, per frame; writes `runs/packed-data.json` |
| `runs/*.csv` | the per-frame series of the four acts measured on 2026-09-21 |
| `runs/chart-data.json` | the condensed data behind the review page's charts |

Re-run, from the worktree root, with the fixtures generated into any scratch directory:

```powershell
node scripts/make-demo-vault.mjs --out <scratch>/demo-vault
node src/build-graph.mjs --vault <scratch>/demo-vault --out <scratch>/demo.html
node .ai-context/investigations/186/probe-186.mjs --repo . --html <scratch>/demo.html --out <scratch>/run --label "186 - demo, only 03" --act "only:03 - Resources" --slow 4 --film
node .ai-context/investigations/186/analyse-186.mjs <scratch>/run/probe.json
node .ai-context/investigations/186/encode-186.mjs <scratch>/run
```

Headless Chrome needs the GPU: with SwiftShader forced, the page starved rAF and the cascade's
400 ms watchdog settled it after four frames, which measures nothing.

The findings in one line each, with the numbers in the Artifact:

1. Per-note pop-in/out is a monotone smoothstep — 40 watched fades, 0 reversals.
2. The wedge arc is re-derived from opacity every frame, as a share of a ring that stays full;
   a single-cell whole-group toggle runs on `colWalk`'s linear progress instead.
3. Rows and pitch walk on `ease(pr)`; `floor(rows) × T/rows` sends the top row out to the rail
   and drops it one pitch at the crossing (inner band 1754 → 1875 → 1728 px hiding 03).
4. A band that is empty at the destination walks to the density fallback pitch (2.6 = `DENSITY_MAX`):
   the departing outer band reached 1.45× the locked `maxR` while still lit.
5. At rest the packer keeps its rules; github#132's 1001 units are the two inner-band constants
   plus one pitch, and github#119 is a rest-state seam cost independent of the animation.

## The dot-size regression, 2026-09-22

`dotsize-186.mjs` reports, for a built page at rest: `corr(deg, drawn px)`, the top-decile-degree
dot over the bottom-decile-degree dot per band, the number of distinct drawn sizes, and a column
measure (a note's angular offset from the nearest note one row inward, over that row's own step).

It exists because the weight model as briefed —
`dot = DOT_OF_PITCH x min(own slot, the band's radial pitch)` — was implemented literally and
removed link weight from the dot entirely. `solveBand` makes the cell square by construction, so
at rest the slot IS the pitch and the `min` always takes the pitch.

| fixture / band | corr(deg, px) | top/bottom dot | distinct sizes |
|---|---|---|---|
| demo / inner | 0.737 → **0.028** | 1.93× → **0.99×** | |
| demo / outer | 0.827 → **0.007** | 1.85× → **1.00×** | 13 → 8 |
| shape / outer | 0.861 → **0.000** | 1.92× → **1.00×** | |
| shape / inner | 0.954 → **0.000** | 1.77× → **1.00×** | 16 → **2** |
| 10k / outer | 0.818 → **−0.011** | 1.15× → **1.00×** | 5 → 3 |

The dots also went uniform *and* maximal — median drawn radius demo 2.44 → 4.26 px, shape
3.35 → 5.27 px — which closes the gaps between them. The lattice itself is intact (column offset
demo 0.047 → 0.030, shape 0.228 → 0.198), so what reads as "the columns are gone" is the dots
filling the space, not the geometry moving.

Rejected by the maintainer on 2026-09-22. A replacement rule has to carry BOTH jobs the old
`ramp(size) × (room/pitch)` did: how much bigger a well-linked note is than a leaf, and how much
the whole band grows as the disc empties.
