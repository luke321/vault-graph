# Verification of 2.0.0 — the rendering comparison against 1.9.0

**Date** 2026-09-06 · **Reference** tag `1.9.0` (`main@e0d0102`, vendored graphology + Sigma) · **Candidate** `develop@fc7d157` plus this branch's fixes · **Control** `79d829a`, the last Sigma commit on develop · **Harness** `scripts/render-diff.mjs` (github#58), one Chrome tab, both builds loaded in turn.

The question was whether anything on screen changed between the last release and the release
candidate that no merged issue intended. The answer is **no**: every differing pixel and number
below is one of five intended changes, and two engine defects the comparison itself turned up
were fixed on this branch before the tables were taken (the picking floor for sub-pixel dots
and the heatmap band's stale repaint — `invariants.md`). The chain of merges attributes each
difference to the commit that introduced it, which is measurement rather than reasoning.

## What was compared

For each of the three store fixtures (demo 1,403 notes / 3,286 links; 10k 10,002 / 3,815;
dominant-folder 954), each state was entered on both builds from a fresh `?rest` load and
sampled at five camera ratios (1.08 fit, 0.7, 2.0, 0.35 zoomed in, 4.2 zoomed out):

| state | how it is entered | what is compared per ratio |
|---|---|---|
| rest | the resting disc | **positions** (graph-space x, y, size of every note and whether it is drawn), **camera** (viewport position and drawn radius of every note, `viewportToGraph` of one point), **layer pixels** (edges, nodes, labels, hovers composited over the surface; bar 0.05 % of pixels over 8/255), **edgeInk**, the **label set** (ids, text, colour, the renderer's `labelColor`, the tooltip), **screenshots** of the stage, the whole page, the canvas, the heatmap band, the date strip and the legend |
| search | `note` typed into the search box | the same; labels are the search hits |
| hidden | the biggest folder's eye clicked, cascade landed, snapped to the resting layout | the same |
| solo | the smallest folder's `only` chip clicked, likewise | the same |
| range | `setRange` to the middle 40 % of the notes' own dates, likewise | the same |
| hover | the top-degree note hovered at each ratio, ramp complete | the same, plus whether the hover landed |
| click | the top-degree note clicked, card open, pointer parked | the same |
| cascade | `probe(true)`, the biggest folder hidden, animated landing (not snapped) | `probeReport` side by side (frames, span, inner/outer/start/tangential max steps), then positions, camera, layers, labels and screenshots of the landed frame |

Viewing conditions: dark theme, pixel ratio 1, a 1600×1000 window for every state; and, for
rest, search and hover, the light theme, pixel ratio 2, and a 1100×700 window.

**Noise floor**, develop against develop (the same page loaded twice): every comparison
identical on all three fixtures except the cascade's animated landing — positions within
7.4e-3 px and per-frame probe steps within 3 % (outerMaxStep 153 vs 157 on identical code),
which is frame timing. The probe line therefore carries a 15 % tolerance and is reported, not
asserted.

## Where every difference comes from — the chain of merges

Consecutive merges on develop, each pair compared at rest, in a search and after a solo:

| step | merged issue | what differed (rest, search, solo; ratios 1.08 / 0.35 / 4.2; three fixtures) |
|---|---|---|
| 1.9.0 → b49d211 | github#53, the single-note solo dot | demo solo: heatmap 532 px; 10k solo: heatmap 317 px |
| b49d211 → 5e67854 | github#19 (PR #56), frame cost | demo solo: heatmap 1077 px |
| 5e67854 → 4a1e3a0 | github#51 (PR #57), the partial month strip | demo rest: ribbon 4370 px; demo search: ribbon 4370 px; demo solo: ribbon 4370 px; shape rest: ribbon 4146 px; shape search: ribbon 4146 px; shape solo: ribbon 4146 px; 10k rest: ribbon 11957 px; 10k search: ribbon 11957 px; 10k solo: heatmap 158 px, ribbon 11957 px |
| 4a1e3a0 → 972daca | github#43, constant edge width | demo rest: canvas 642 px @0.35, canvas 641 px; demo search: canvas 52 px @0.35, canvas 52 px; shape rest: canvas 1013 px @0.35, canvas 1013 px; shape search: canvas 255 px @0.35, canvas 255 px; 10k rest: canvas 630 px @0.35, canvas 630 px; 10k search: canvas 1 px @0.35, canvas 1 px |
| 972daca → 3aa9401 | github#55, the lint gate | **nothing** — positions, camera, layers, edge ink, labels and every screenshot region identical |
| 3aa9401 → 79d829a | github#60, typing | 10k solo: heatmap 165 px |
| 79d829a → 7af96d9 | github#58, the engine | **nothing** — positions, camera, layers, edge ink, labels and every screenshot region identical |
| 7af96d9 → 82b46bf | github#58, the verification fixes | 10k solo: heatmap 165 px |
| 82b46bf → 5d3c8d7 | github#62 #63 #64 #65 #59 | 10k solo: heatmap 165 px |
| 5d3c8d7 → e7d7573 | github#66, the size hold | 10k solo: heatmap 152 px |
| e7d7573 → 5e2f43d | github#67, the fade schedule | demo solo: heatmap 937 px; shape solo: heatmap 480 px; 10k solo: heatmap 477 px |
| 5e2f43d → develop | github#61, comments | **nothing** — positions, camera, layers, edge ink, labels and every screenshot region identical |

Reading down: **three** merges changed the picture — the strip (github#51), the edges
(github#43) and, only through the stale heatmap band, the two cascade-timing merges
(github#19's frame work and github#67's fade schedule, which moved *which* faded cells kept a
tint: the residue itself is in 1.9.0 too, and is fixed on this branch). The engine (github#58),
its verification fixes, the typing, the lint gate, github#62–#66 and the comment cut changed
**nothing** at rest, in a search or after a solo. The single-note solo dot (github#53) does not
show on the fixtures because none of them has a one-note folder to solo — its check in
`smoke.mjs` tries every folder and asserts the worst.

## Attribution table

Every cell that is not zero, attributed. Magnitudes are pixels over 8/255 on the composited
layers (1296×731 stage) or in a screenshot region, edgeInk before → after, and hover landings.

| difference | intended by | fixture | state / condition | magnitude |
|---|---|---|---|---|
| the date strip: month widths, the strip's right edge, the range readout and the year chips | github#51, the partial month strip | all three | every state, every ratio, both themes | ribbon 4,370 / 4,146 / 11,957 px; whole strip area 8,118 / 4,923 / 14,441 px in the stage shot; canvas 0 |
| the web below the zoom knee: strokes at one width | github#43, constant edge width (the knee moved from ratio 0.4 to 0.35) | all three | rest, search, hidden, range, hover, click at 0.35, and a few pixels at 0.7; ratios 1.08, 2.0 and 4.2 identical | at 0.35, rest: 642 / 1,013 / 630 canvas px, edgeInk +15.6 % / +17.3 % / +12.1 %; search 52 / 255 / 1 px. At 0.7, rest 60 / 274 / 13 px, hidden 171 / 0 / 85 px, edgeInk −0.8 % to −1.3 % — reproduced exactly by the 4a1e3a0 → 972daca step alone |
| the sidebar's "Generated …" build stamp | not a difference — the two pages were built minutes apart | all three | every state | 120 px in the whole-page shot, box x 233–253 y 848–855, on the control as well; every other page region identical |
| the lit web of a hovered or selected hub note at 0.35 | github#43 (lit links 1.4 → capped 4 px, resting links unchanged) | all three | hover and click at 0.35 | 109,422 / 96,107 / 42,497 canvas px, edgeInk +12.7 % / +14.4 % / +11.4 %; identical at 0.7–4.2 |
| forced labels drawn in the theme's text colour instead of white | the theme label fix (github#58 verification, d4bead3) | all three | light theme, search and hover | `labelColor` #ffffff → #0b0b0b, every drawn label recoloured; positions and dot pixels identical |
| a sub-pixel dot hovers where the Sigma build did (and where it did not) | the picking floor, this branch (invariants.md "A sub-pixel dot is still a target") | 10k, demo, shape | hover at 2.0 (10k), pixel ratio 2 and 1100×700 windows | hover parity with 1.9.0 restored at all five ratios on all three fixtures; the shape fixture's hover at 4.2 under pixel ratio 2 lands on the engine where Sigma missed |
| the heatmap band after a folder hides, a solo, a range or a cascade | the band repaint fix, this branch (invariants.md "The heatmap band is painted for the state it landed in") | all three | hidden, solo, range, cascade; on the 79d829a control as well, which has the stale band too | against 1.9.0: hidden 647 / 1,929 / 1,470, solo 0 / 2,402 / 473, range 1,421 / 629 / 2,613, cascade 654 / 1,770 / 1,470 band px (demo / shape / 10k); against 79d829a: hidden 647 / 1,764 / 1,564, solo 1,950 / 2,237 / 798, range 1,256 / 1,448 / 2,451, cascade 881 / 1,769 / 1,748; 0 against a forced repaint of the landed state |
| **Size dots from the frame**, merged for 2.0.0 | github#41, design/0011 — **only with the setting on** | all three | any cascade | with the setting off (default) the goldens, positions and pixels are byte-identical; on, dots may be held below their two resting sizes mid-walk, never above |

Not a difference: the cascade's animated landing agrees to within the noise floor (probe
frames within 3 %, landed positions to 8.0e-3 px), and the 79d829a control below is identical
in positions, camera, every canvas pixel, edge ink and hover landings, differing only in the
build stamp and the heatmap band rows named above.

## 1.9.0 → release candidate, every state, dark theme, pixel ratio 1, 1600×1000

#### 1.9.0 → release/2.0.0 (dark, dpr 1, 1600×1000)

| fixture | state | positions max \|d\| | camera max \|d\| px | canvas px > 8/255, per ratio | edgeInk, worst ratio | screenshot regions differing (px > 8/255) | hover / labels |
|---|---|---|---|---|---|---|---|
| demo | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 60, 2: 0, 0.35: 642, 4.2: 0 | @0.35: 0.5811 → 0.6719 (15.6%) | stage 8759, page 8879, canvas 641, ribbon 4370 | - |
| demo | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 52, 4.2: 0 | @0.35: 0.5811 → 0.6719 (15.6%) | stage 8170, page 8170, canvas 52, ribbon 4370 | - |
| demo | hidden | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 171, 2: 0, 0.35: 734, 4.2: 0 | @0.35: 0.3662 → 0.4477 (22.3%) | stage 9499, page 9619, canvas 734, heatmap 647, ribbon 4370 | - |
| demo | solo | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 8118, page 8238, ribbon 4370 | - |
| demo | range | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | @0.35: 0.0083 → 0.0114 (36.3%) | stage 8822, page 8942, heatmap 1421, ribbon 3734 | - |
| demo | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 109422, 4.2: 0 | @0.35: 0.6342 → 0.7145 (12.7%) | stage 115805, page 115925, canvas 107687, ribbon 4370 | hover lands the same at every ratio |
| demo | click | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 109422, 4.2: 0 | @0.35: 0.6342 → 0.7145 (12.7%) | stage 96826, page 96946, canvas 88708, ribbon 4370 | - |
| demo | cascade | 0.0e+0 | 0.0e+0 | - | @landed: 0.0707 → 0.0707 (-0.0%) | stage 8772, page 8892, heatmap 654, ribbon 4370 | - · probe frames 131/130, spanMs 2148/2128, innerMaxStep 0/0, outerMaxStep 157/153, startMaxStep 1.309/1.247, ngMaxStep 0.085/0.084, radMaxStep 610/655, tanMaxStep 7191/7180; landed camera |d| 0.00e+0 |
| shape | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 274, 2: 0, 0.35: 1013, 4.2: 0 | @0.35: 0.4681 → 0.5491 (17.3%) | stage 5936, page 6056, canvas 1013, ribbon 4146 | - |
| shape | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 57, 2: 0, 0.35: 255, 4.2: 0 | @0.35: 0.4681 → 0.5491 (17.3%) | stage 5178, page 5298, canvas 255, ribbon 4146 | - |
| shape | hidden | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 1, 4.2: 0 | @0.35: 0.0035 → 0.0047 (33.5%) | stage 6853, page 6973, canvas 1, heatmap 1929, ribbon 4146 | - |
| shape | solo | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 7325, page 7445, heatmap 2402, ribbon 4146 | - |
| shape | range | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 5, 4.2: 0 | @0.35: 0.0867 → 0.1137 (31.1%) | stage 6935, page 7055, canvas 5, heatmap 629, ribbon 5605 | - |
| shape | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 1013, 4.2: 0 | @0.35: 0.4681 → 0.5491 (17.3%) | stage 5936, page 6056, canvas 1013, ribbon 4146 | hover lands the same at every ratio |
| shape | click | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 96107, 4.2: 0 | @0.35: 0.5185 → 0.5934 (14.4%) | stage 78987, page 79107, canvas 74064, ribbon 4146 | - |
| shape | cascade | 0.0e+0 | 7.7e-3 | - | @landed: 0.0007 → 0.0007 (-1.5%) | stage 6693, page 6813, heatmap 1770, ribbon 4146 | - · probe frames 124/124, spanMs 2023/2022, innerMaxStep 0/0, outerMaxStep 1223/1223, startMaxStep 0.175/0.175, ngMaxStep 0.094/0.094, radMaxStep 1338/1338, tanMaxStep 10419/10392; landed camera |d| 0.00e+0 |
| 10k | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 13, 2: 0, 0.35: 630, 4.2: 0 | @0.35: 0.5483 → 0.6144 (12.1%) | stage 15071, page 15191, canvas 630, ribbon 11957 | - |
| 10k | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 1, 4.2: 0 | @0.35: 0.5483 → 0.6144 (12.1%) | stage 14442, page 14442, canvas 1, ribbon 11957 | - |
| 10k | hidden | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 85, 2: 0, 0.35: 333, 4.2: 0 | @0.35: 0.3276 → 0.3992 (21.8%) | stage 16244, page 16364, canvas 333, heatmap 1470, ribbon 11957 | - |
| 10k | solo | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 14914, page 15034, heatmap 473, ribbon 11957 | - |
| 10k | range | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 22, 4.2: 0 | @0.35: 0.1353 → 0.1744 (28.9%) | stage 15113, page 15233, canvas 22, heatmap 2613, ribbon 10075 | - |
| 10k | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 630, 4.2: 0 | @0.35: 0.5483 → 0.6144 (12.1%) | stage 15124, page 15244, canvas 630, heatmap 53, ribbon 11957 | hover lands the same at every ratio |
| 10k | click | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 42497, 4.2: 0 | @0.35: 0.5594 → 0.6233 (11.4%) | stage 44041, page 44161, canvas 29600, ribbon 11957 | - |
| 10k | cascade | 0.0e+0 | 0.0e+0 | - | equal at every ratio | stage 15911, page 16031, heatmap 1470, ribbon 11957 | - · probe frames 61/83, spanMs 2340/2241, innerMaxStep 0/0, outerMaxStep 159/158, startMaxStep 4.797/3.809, ngMaxStep 0.204/0.147, radMaxStep 1713/1535, tanMaxStep 27818/28703; landed camera |d| 0.00e+0 |


## 79d829a → release candidate — the control (the last Sigma commit against the engine)

#### 79d829a → release/2.0.0 (dark, dpr 1, 1600×1000)

| fixture | state | positions max \|d\| | camera max \|d\| px | canvas px > 8/255, per ratio | edgeInk, worst ratio | screenshot regions differing (px > 8/255) | hover / labels |
|---|---|---|---|---|---|---|---|
| demo | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | - |
| demo | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | identical | - |
| demo | hidden | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 647, page 767, heatmap 647 | - |
| demo | solo | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 1950, page 2070, heatmap 1950 | - |
| demo | range | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 1256, page 1376, heatmap 1256 | - |
| demo | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | hover lands the same at every ratio |
| demo | click | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | - |
| demo | cascade | 0.0e+0 | 0.0e+0 | - | equal at every ratio | stage 881, page 1001, heatmap 881 | - · probe frames 130/130, spanMs 2129/2130, innerMaxStep 0/0, outerMaxStep 153/153, startMaxStep 1.258/1.251, ngMaxStep 0.084/0.084, radMaxStep 655/655, tanMaxStep 7181/7180; landed camera |d| 0.00e+0 |
| shape | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | - |
| shape | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | - |
| shape | hidden | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 1764, page 1884, heatmap 1764 | - |
| shape | solo | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 2237, page 2357, heatmap 2237 | - |
| shape | range | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 1448, page 1568, heatmap 1448 | - |
| shape | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | hover lands the same at every ratio |
| shape | click | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | - |
| shape | cascade | 0.0e+0 | 8.0e-3 | - | equal at every ratio | stage 1769, page 1889, heatmap 1769 | - · probe frames 124/124, spanMs 2022/2022, innerMaxStep 0/0, outerMaxStep 1224/1224, startMaxStep 0.174/0.174, ngMaxStep 0.093/0.093, radMaxStep 1338/1338, tanMaxStep 10392/10427; landed camera |d| 0.00e+0 |
| 10k | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | - |
| 10k | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | identical | - |
| 10k | hidden | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 1564, page 1684, heatmap 1564 | - |
| 10k | solo | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 798, page 918, heatmap 798 | - |
| 10k | range | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | stage 2451, page 2571, heatmap 2451 | - |
| 10k | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | hover lands the same at every ratio |
| 10k | click | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | - |
| 10k | cascade | 0.0e+0 | 0.0e+0 | - | equal at every ratio | stage 1748, page 1868, heatmap 1748 | - · probe frames 78/85, spanMs 2249/2263, innerMaxStep 0/0, outerMaxStep 158/159, startMaxStep 5.661/3.416, ngMaxStep 0.183/0.157, radMaxStep 1606/1591, tanMaxStep 28854/29000; landed camera |d| 0.00e+0 |


## Light theme, pixel ratio 2, and a 1100×700 window

#### 1.9.0 → release/2.0.0, light theme

| fixture | state | positions max \|d\| | camera max \|d\| px | canvas px > 8/255, per ratio | edgeInk, worst ratio | screenshot regions differing (px > 8/255) | hover / labels |
|---|---|---|---|---|---|---|---|
| demo | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 74, 2: 0, 0.35: 2071, 4.2: 0 | @0.35: 0.5811 → 0.6719 (15.6%) | stage 10196, page 10316, canvas 2065, ribbon 4545 | 1.08: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| demo | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 84, 2: 0, 0.35: 3504, 4.2: 0 | @0.35: 0.5811 → 0.6719 (15.6%) | stage 11614, page 11614, canvas 3483, ribbon 4545 | 1.08: 124 vs 124 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 124 vs 124 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 124 vs 124 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 124 vs 124 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 124 vs 124 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| demo | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 112437, 4.2: 0 | @0.35: 0.6342 → 0.7145 (12.7%) | stage 118797, page 118917, canvas 110666, ribbon 4545 | 1.08: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| shape | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 287, 2: 0, 0.35: 2130, 4.2: 0 | @0.35: 0.4681 → 0.5491 (17.3%) | stage 7191, page 7311, canvas 2124, ribbon 4290 | 1.08: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| shape | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 293, 2: 0, 0.35: 3189, 4.2: 0 | @0.35: 0.4681 → 0.5491 (17.3%) | stage 8245, page 8365, canvas 3178, ribbon 4290 | 1.08: 101 vs 101 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 101 vs 101 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 101 vs 101 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 101 vs 101 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 101 vs 101 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| shape | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 2130, 4.2: 0 | @0.35: 0.4681 → 0.5491 (17.3%) | stage 7191, page 7311, canvas 2124, ribbon 4290 | 1.08: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| 10k | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 16, 2: 0, 0.35: 1809, 4.2: 0 | @0.35: 0.5483 → 0.6144 (12.1%) | stage 16273, page 16393, canvas 1809, ribbon 12123 | 1.08: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| 10k | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 8, 2: 0, 0.35: 3379, 4.2: 0 | @0.35: 0.5483 → 0.6144 (12.1%) | stage 17840, page 17840, canvas 3376, ribbon 12123 | 1.08: 1288 vs 1288 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 1288 vs 1288 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 1288 vs 1288 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 1288 vs 1288 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 1288 vs 1288 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| 10k | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 22, 2: 0, 0.35: 1809, 4.2: 0 | @0.35: 0.5483 → 0.6144 (12.1%) | stage 16329, page 16449, canvas 1809, heatmap 56, ribbon 12123 | 1.08: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |


#### 79d829a → release/2.0.0, light theme

| fixture | state | positions max \|d\| | camera max \|d\| px | canvas px > 8/255, per ratio | edgeInk, worst ratio | screenshot regions differing (px > 8/255) | hover / labels |
|---|---|---|---|---|---|---|---|
| demo | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 184 | 1.08: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| demo | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | identical | 1.08: 124 vs 124 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 124 vs 124 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 124 vs 124 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 124 vs 124 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 124 vs 124 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| demo | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | 1.08: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| shape | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 1459 | 1.08: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| shape | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | 1.08: 101 vs 101 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 101 vs 101 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 101 vs 101 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 101 vs 101 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 101 vs 101 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| shape | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | 1.08: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| 10k | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | 1.08: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| 10k | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | identical | 1.08: 1288 vs 1288 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 1288 vs 1288 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 1288 vs 1288 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 1288 vs 1288 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 1288 vs 1288 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |
| 10k | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 120 | 1.08: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.7: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 0.35: 0 vs 0 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same; 4.2: 1 vs 1 (ids only in ref 0, only in now 0); labelColor #ffffff vs #0b0b0b; tip same |


#### 1.9.0 → develop, pixel ratio 2 (before the picking floor)

| fixture | state | positions max \|d\| | camera max \|d\| px | canvas px > 8/255, per ratio | edgeInk, worst ratio | screenshot regions differing (px > 8/255) | hover / labels |
|---|---|---|---|---|---|---|---|
| demo | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 50, 2: 0, 0.35: 29732, 4.2: 0 | @0.35: 0.5937 → 0.6174 (4.0%) | stage 60557, page 60557, canvas 29732, ribbon 16327 | - |
| demo | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 6, 2: 0, 0.35: 626, 4.2: 0 | @0.35: 0.5937 → 0.6174 (4.0%) | stage 31451, page 31451, canvas 626, ribbon 16327 | - |
| demo | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 134191, 4.2: 0 | @0.35: 0.6026 → 0.6242 (3.6%) | stage 161891, page 161891, canvas 131066, ribbon 16327 | hover lands the same at every ratio |
| shape | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 124, 2: 0, 0.35: 34277, 4.2: 0 | @0.35: 0.5290 → 0.5578 (5.4%) | stage 52793, page 52925, canvas 34277, ribbon 15559 | - |
| shape | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 24, 2: 0, 0.35: 1082, 4.2: 0 | @0.35: 0.5290 → 0.5578 (5.4%) | stage 19598, page 19730, canvas 1082, ribbon 15559 | - |
| shape | hover | 0.0e+0 | 4.0e-1 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 34277, 4.2: 26781 | @0.35: 0.5290 → 0.5578 (5.4%) | stage 78108, page 78240, canvas 59592, ribbon 15559 | 4.2:ref false now true (hovered null / 158) · 4.2: 0 vs 1 (ids only in ref 0, only in now 1); labelColor #ffffff vs #ffffff; tip differs: "" vs "projects 0031projects · 103 linkssub-a · projects / sub a" |
| 10k | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 171, 2: 0, 0.35: 30412, 4.2: 0 | @0.35: 0.5629 → 0.5859 (4.1%) | stage 82664, page 82664, canvas 30412, ribbon 42587 | - |
| 10k | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 1930, 4.2: 0 | @0.35: 0.5629 → 0.5859 (4.1%) | stage 54182, page 54182, canvas 1930, ribbon 42587 | - |
| 10k | hover | 0.0e+0 | 4.3e-1 | 1.08: 284897, 0.7: 0, 2: 97158, 0.35: 30412, 4.2: 0 | @0.35: 0.5629 → 0.5859 (4.1%) | stage 365359, page 365359, canvas 313107, ribbon 42587 | 1.08:ref true now false (hovered 1272 / null); 2:ref true now false (hovered 1272 / null) · 1.08: 1 vs 0 (ids only in ref 1, only in now 0); labelColor #ffffff vs #ffffff; tip differs: "Health — notes 490802 - Areas · 55 linksareas · 02 - Areas" vs ""; 2: 1 vs 0 (ids only in ref 1, only in now 0); labelColor #ffffff vs #ffffff; tip differs: "Health — notes 490802 - Areas · 55 linksareas · 02 - Areas" vs "" |


#### 79d829a → release/2.0.0, pixel ratio 2, hover (after the picking floor)

| fixture | state | positions max \|d\| | camera max \|d\| px | canvas px > 8/255, per ratio | edgeInk, worst ratio | screenshot regions differing (px > 8/255) | hover / labels |
|---|---|---|---|---|---|---|---|
| demo | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | identical | hover lands the same at every ratio |
| shape | hover | 0.0e+0 | 4.0e-1 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 26781 | equal at every ratio | stage 59592, page 59945, canvas 59592 | 4.2:ref false now true (hovered null / 158) · 4.2: 0 vs 1 (ids only in ref 0, only in now 1); labelColor #ffffff vs #ffffff; tip differs: "" vs "projects 0031projects · 103 linkssub-a · projects / sub a" |
| 10k | hover | 0.0e+0 | 1.2e-1 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 30502 | equal at every ratio | stage 68236, page 68236, canvas 68236 | 4.2:ref false now false (hovered null / 420) · 4.2: 0 vs 1 (ids only in ref 0, only in now 1); labelColor #ffffff vs #ffffff; tip differs: "" vs "Health — review 488802 - Areas · 10 linksbudget · 02 - Areas / Finance" |


#### 1.9.0 → develop, 1100×700 (before the picking floor)

| fixture | state | positions max \|d\| | camera max \|d\| px | canvas px > 8/255, per ratio | edgeInk, worst ratio | screenshot regions differing (px > 8/255) | hover / labels |
|---|---|---|---|---|---|---|---|
| demo | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 2, 2: 0, 0.35: 273, 4.2: 0 | @0.35: 0.7221 → 0.7919 (9.7%) | stage 6404, page 6404, canvas 270, ribbon 3382 | - |
| demo | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 1, 4.2: 0 | @0.35: 0.7221 → 0.7919 (9.7%) | stage 6135, page 6135, canvas 1, ribbon 3382 | - |
| demo | hover | 0.0e+0 | 2.5e-1 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 44527, 4.2: 5112 | @0.35: 0.7572 → 0.8154 (7.7%) | stage 48727, page 48727, canvas 42593, ribbon 3382 | 4.2:ref true now false (hovered 452 / null) · 4.2: 1 vs 0 (ids only in ref 1, only in now 0); labelColor #ffffff vs #ffffff; tip differs: "2019-01-2604 - Daily Notes · 125 linksdaily · 04 - Daily Notes / 2026-06" vs "" |
| shape | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 46, 2: 0, 0.35: 266, 4.2: 0 | @0.35: 0.6167 → 0.6908 (12.0%) | stage 3661, page 3703, canvas 266, ribbon 2779 | - |
| shape | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 8, 2: 0, 0.35: 17, 4.2: 0 | @0.35: 0.6167 → 0.6908 (12.0%) | stage 3412, page 3412, canvas 17, ribbon 2779 | - |
| shape | hover | 0.0e+0 | 1.3e-2 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 266, 4.2: 0 | @0.35: 0.6167 → 0.6908 (12.0%) | stage 3661, page 3703, canvas 266, ribbon 2779 | hover lands the same at every ratio |
| 10k | rest | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 242, 4.2: 0 | @0.35: 0.6726 → 0.7269 (8.1%) | stage 10766, page 10766, canvas 242, ribbon 8606 | - |
| 10k | search | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | @0.35: 0.6726 → 0.7269 (8.1%) | stage 10524, page 10524, ribbon 8606 | - |
| 10k | hover | 0.0e+0 | 6.0e-1 | 1.08: 41771, 0.7: 77058, 2: 0, 0.35: 242, 4.2: 0 | @0.35: 0.6726 → 0.7269 (8.1%) | stage 93650, page 93650, canvas 83126, ribbon 8606 | 1.08:ref true now false (hovered 1272 / null); 0.7:ref true now false (hovered 1272 / null) · 1.08: 1 vs 0 (ids only in ref 1, only in now 0); labelColor #ffffff vs #ffffff; tip differs: "Health — notes 490802 - Areas · 55 linksareas · 02 - Areas" vs ""; 0.7: 1 vs 0 (ids only in ref 1, only in now 0); labelColor #ffffff vs #ffffff; tip differs: "Health — notes 490802 - Areas · 55 linksareas · 02 - Areas" vs "" |


#### 79d829a → release/2.0.0, 1100×700, hover (after the picking floor)

| fixture | state | positions max \|d\| | camera max \|d\| px | canvas px > 8/255, per ratio | edgeInk, worst ratio | screenshot regions differing (px > 8/255) | hover / labels |
|---|---|---|---|---|---|---|---|
| demo | hover | 0.0e+0 | 0.0e+0 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | identical | hover lands the same at every ratio |
| shape | hover | 0.0e+0 | 1.3e-2 | 1.08: 0, 0.7: 0, 2: 0, 0.35: 0, 4.2: 0 | equal at every ratio | page 112 | hover lands the same at every ratio |
| 10k | hover | 0.0e+0 | 2.1e-1 | 1.08: 0, 0.7: 0, 2: 15764, 0.35: 0, 4.2: 5727 | equal at every ratio | stage 23830, page 23830, canvas 23830 | 2:ref false now true (hovered null / 1272); 4.2:ref false now false (hovered null / 420) · 2: 0 vs 1 (ids only in ref 0, only in now 1); labelColor #ffffff vs #ffffff; tip differs: "" vs "Health — notes 490802 - Areas · 55 linksareas · 02 - Areas"; 4.2: 0 vs 1 (ids only in ref 0, only in now 1); labelColor #ffffff vs #ffffff; tip differs: "" vs "Health — review 488802 - Areas · 10 linksbudget · 02 - Areas / Finance" |


## Reproducing

```bash
# reference pages: a worktree at the commit, node_modules present after 7af96d9, then per fixture
node <tree>/src/build-graph.mjs --vault <fixture> --out <refs>/<commit>/<fixture-dir-name>.html
# every state, five ratios, dark
node scripts/render-diff.mjs --against-dir <refs>/1.9.0 --now-dir <refs>/develop --state all --ratios 1.08,0.7,2.0,0.35,4.2 --out <json>
# light theme, pixel ratio 2, a small window
node scripts/render-diff.mjs --against-dir <refs>/1.9.0 --state rest --state search --state hover --theme light
node scripts/render-diff.mjs --against-dir <refs>/1.9.0 --state rest --state search --state hover --dpr 2
node scripts/render-diff.mjs --against-dir <refs>/1.9.0 --state rest --state search --state hover --window 1100x700
# one step of the chain
node scripts/render-diff.mjs --against-dir <refs>/4a1e3a0 --now-dir <refs>/972daca --state rest --state search --state solo
# where a screenshot differs
node scripts/render-diff.mjs ... --mode screenshot --dump <dir>
```

The reference pages are not kept in the repository: a built page carries every note title of
its vault, and the fixtures regenerate from their scripts.
