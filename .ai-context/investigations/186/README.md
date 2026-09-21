# github#186 — wedge-packing investigation tooling

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
