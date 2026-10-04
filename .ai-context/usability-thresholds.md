# Usability thresholds, and what the page measures against them

**Status** as-built · 2026-10-04 · `scripts/usability-audit.mjs`, `scripts/usability-thresholds.mjs`, github#200

> What published research says a pointer, a finger and an eye can manage, each turned into a
> number the page can be measured against, and the audit that measures it. A report, not a
> gate. The three WCAG AA lines get a `--strict` exit code, and no hook calls it.

## Running it

```bash
node scripts/usability-audit.mjs                                  # five fixtures x seven profiles, headless, ~85 s
node scripts/usability-audit.mjs --fixtures demo-vault --profiles phone,desktop
node scripts/usability-audit.mjs --md out.md --json out.json      # the full report and the raw numbers
node scripts/usability-audit.mjs --vault <path> --fixtures mine   # any vault, one name
node scripts/usability-audit.mjs --strict                         # exit 1 on WCAG 2.5.8 controls, 1.4.3, 1.4.11
node scripts/usability-audit.mjs --headed                         # a window, through the harness hook's screen
node scripts/usability-thresholds.mjs --selftest                  # the maths against known values
node scripts/usability-thresholds.mjs                             # the threshold table with its sources
```

It is headless by default because every profile is a CDP emulation
(`Emulation.setTouchEmulationEnabled` before `setDeviceMetricsOverride`, the ordering
`mobile-harness.md` found), and nothing is aimed by gesture, so a window would measure nothing
more. Each profile reloads the page at `?rest` under its emulation, so mount-time defaults
(`bandOpen`, the phone layout) are the ones that size boots with. Both themes are read on every
profile. The built page is labelled `<branch> -- usability audit, <fixture>`.

## The profiles: how a CSS pixel becomes an angle

Visual angle is `2·atan(size / 2d)`. A CSS px is not a fixed length. The CSS spec defines the
*reference* pixel as 0.0213° (1/96 in at 28 in), and devices approximate it, so each
profile names the device class its density and distance come from. Change them in
`PROFILES` if your device differs; every derived number follows.

| profile | CSS viewport | pointer | CSS px / in | mm / px | distance | basis |
|---|---|---|---:|---:|---:|---|
| `phone-small` | 375×667 | coarse | 163 | 0.156 | 33 cm | iPhone SE class (326 ppi, DPR 2); held closer than average |
| `phone` | 390×844 | coarse | 153 | 0.166 | 36 cm | iPhone 14 class (460 ppi, DPR 3); 36.2 cm mean, Bababekova 2011 |
| `tablet` | 820×1180 | coarse | 132 | 0.192 | 40 cm | iPad Air class (264 ppi, DPR 2); tablet studies 33-47 cm |
| `laptop` | 1470×956 | fine | 113 | 0.224 | 50 cm | 13.6 in laptop at its default 2x scale |
| `desktop` | 1920×1080 | fine | 92 | 0.276 | 65 cm | 24 in 1080p at 100%; OSHA's 50-100 cm |
| `desktop-large` | 2560×1440 | fine | 109 | 0.233 | 70 cm | 27 in 1440p at 100% |
| `sidebar` | 320×900 | fine | 92 | 0.276 | 65 cm | an Obsidian side leaf on that desktop |

## The research, as thresholds

Each row is a published number, what it means for this page, and how the audit measures it.
The key in the first column is the `T.<key>` entry in `usability-thresholds.mjs`.

### Pointer and touch targets

| key | finding | threshold | measured as |
|---|---|---|---|
| `targetMin` | [WCAG 2.2 SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) (AA): a target is ≥ 24×24 CSS px, **or** a 24 px circle centred on it intersects no other target or undersized target's circle. Exceptions: equivalent control elsewhere, inline text, user-agent default, essential presentation | 24 CSS px, or centre spacing ≥ 24 between undersized targets | controls: box plus the circle test (`spacingPass`). Dots: diameter < 24 **and** nearest centre < 24 |
| `targetEnhanced` | [WCAG 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced) (AAA) | 44×44 CSS px | share of controls under 44 |
| `apple` | [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/accessibility): hit targets ≥ 44×44 pt; 1 pt is 1 CSS px in iOS Safari | 44 px | as above |
| `material` | [Material / Android accessibility](https://support.google.com/accessibility/android/answer/7101858): ≥ 48×48 dp with ≥ 8 dp between targets; 1 dp ≈ 1 CSS px in Chrome on Android | 48 px | share of controls under 48 |
| `microsoft` | [Microsoft Fluent targeting](https://learn.microsoft.com/windows/apps/design/input/guidelines-for-targeting): 7.5 mm touch target (40 epx at 135 ppi) | 7.5 mm | coarse profiles: control min side × mm/px |
| `parhi` | [Parhi, Karlson & Bederson 2006](https://doi.org/10.1145/1152215.1152260), one-handed thumb: 9.2 mm for discrete taps, 9.6 mm for serial taps, before speed and errors stop improving | 9.2 mm | coarse: controls, and dots' effective tap width |
| `hooberCentre` | [Hoober 2013](https://www.uxmatters.com/mt/archives/2013/11/design-for-fingers-and-thumbs-instead-of-touch.php), from observed touches: targets can sit 7 mm apart, centre to centre, at screen centre; 10-12 mm at the top and bottom edges | 7 mm centre | coarse: dots' effective tap width |
| `holz` | [Holz & Baudisch 2010](https://www.christianholz.net/generalized_perceived_input_point_model): even correcting each user's own touch offset, reliable buttons need 4.9 mm. That is a floor no unmodelled page reaches | 4.9 mm (context) | — |
| `olderMouse` | [Hourcade 2006](https://course.ccs.neu.edu/csg170/ssl/hourcade06.pdf): 65-84 year-olds make many more errors on 16 px targets; at 24 px they match younger groups, and 32 px adds nothing | 24 px | corroborates `targetMin` for mouse |
| — | [FFitts law, Bi, Li & Zhai 2013](https://research.google/pubs/ffitts-law-modeling-finger-touch-with-fitts-law/) and [Bi & Zhai 2016](https://dx.doi.org/10.1145/2984511.2984546): a finger's endpoint spread is the sum of a speed-dependent part and an **absolute** part that does not shrink with care, so a small target stays unreliable however slowly it is approached. Their predictions held within 5% for 4.8 and 7.2 mm targets, 10% for 2.4 mm | model | why a mm floor, not a Fitts index, is the touch measure here |
| — | Fitts's law ([MacKenzie's Shannon form](https://www.yorku.ca/mack/hhci2018.html), ISO 9241-9/-411): movement time grows with log2(A/W + 1), so a target's width is its difficulty | W in the log | effective width is what the audit reports for dots |

**A dot's effective tap target here** follows the page's own picker (`renderer.ts`
`getNodeAtPosition`): a tap inside a drawn circle picks it; otherwise the nearest centre within
the pick floor wins (`PICK_FLOOR_PX` 1.5 for a mouse, `TOUCH_PICK_FLOOR_PX` 14 for a finger).
Its width is therefore `min(max(diameter, 2 × floor), nearest-centre spacing)`. On a dense disc
the spacing binds, which is why the 14 px floor does not rescue it.

### What the eye resolves

| key | finding | threshold | measured as |
|---|---|---|---|
| `acuity` | [20/20 (logMAR 0)](https://eyewiki.org/Visual_Acuity_Testing_in_Adults) resolves 1 arcmin of detail | 1′ | dot diameter in arcmin |
| `optotype` | a 20/20 letter is 5′ tall: the smallest *shape* a normal eye identifies | 5′ | dot diameter: under this a dot is a speck, not a disc you can judge |
| `olderAcuity` | 20/32 (logMAR 0.2) is common best-corrected acuity past 70 ([longitudinal 70-97 study](https://gupea.ub.gu.se/handle/2077/15935)): every angle above needs ×1.6 | 1.6′ | context for the margins |
| `symbolMin` / `symbolGood` | [ANSI/HFES 100-2007](https://hfes.org/Publications/Technical-Standards): character height 16′ minimum, 20-22′ preferred; MIL-STD-1472 uses the same 16′ for static symbols | 16′ / 20′ | text cap height (≈ 0.7 × font-size, an approximation) and dot diameter |
| `cssPx` | [CSS reference pixel](https://www.w3.org/TR/css-values-4/#reference-pixel): 0.0213° at 71 cm | — | the selftest pins it |

### Contrast and colour

| key | finding | threshold | measured as |
|---|---|---|---|
| `textContrast` | [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) (AA): text 4.5:1, large text (≥ 24 px, or ≥ 18.66 px bold) 3:1; disabled controls exempt | 4.5 / 3 | every visible text node: its colour × opacity chain over the alpha-composited ancestor backgrounds |
| `uiContrast` | [WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast) (AA): graphical objects needed to understand the content, 3:1 against adjacent colours | 3:1 | each group's drawn tint against `--surface-1` |
| `colourSizeFloor` / `ND50` | [Stone, Szafir & Setlur 2014](https://graphics.cs.wisc.edu/Papers/2014/SAS14/2014CIC_48_Stone_v3.pdf): the CIELAB step half of viewers notice grows as a mark shrinks, `ND50(s) = C + K/s` per axis, C = (5.079, 5.339, 5.349), K = (0.751, 1.541, 2.871), s in degrees, measured from 6° down to 1/3°. At 2° that is ≈ 6 ΔE; at 1/3° ≈ 11, mostly along b*. [Szafir 2018](https://cmci.colorado.edu/visualab/VisColors/) confirms it for scatterplot marks | scaled distance ≥ 1 | every distinct pair of group tints at the profile's median dot size, and again at 1/3°, since below that the model is extrapolated |
| `CVD` | [Machado, Oliveira & Fernandes 2009](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html): physiologically based dichromacy simulation; covers protan/deutan anomalies, ≈ 99.96% of CVD cases. [About 8% of men and 0.4% of women](https://doaj.org/article/15749e000ad0485c8ae3210c0f099dea) of European descent have one, deutan types the most common | severity 1.0 | the same pair test after each simulation |

### Hover and gestures

| key | finding | threshold | measured as |
|---|---|---|---|
| — | [Media Queries 4](https://www.w3.org/TR/mediaqueries-4/#hover): a touch-primary device reports `hover: none`; anything only reachable by hovering does not exist there | none hover-only | `title` text that is the only label (no visible text), explanations living only in `title`, ellipsised labels whose full text is only in `title`, and `:hover` rules that reveal an element measured **invisible at rest** |
| — | [WCAG 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus) (AA): hover content must be dismissible, hoverable and persistent | — | context for the canvas hover label |
| — | [WCAG 2.5.1](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures) (A): multipoint gestures (pinch) need a single-pointer alternative | zoom buttons | the camera row's buttons |
| — | [WCAG 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements) (AA): dragging needs a single-pointer alternative without dragging | a non-drag pan | the camera row's buttons |
| `touchSlop` | [Android ViewConfiguration](https://developer.android.com/reference/android/view/ViewConfiguration): 8 dp before a touch becomes a scroll | 8 px | `TOUCH_TAP_SLOP_PX`, read from source |
| `doubleTapMs` / `doubleTapSlop` | same: 300 ms between taps, 100 dp between them | 300 ms / 100 px | `DOUBLE_CLICK_TIMEOUT`, `TOUCH_DOUBLE_TAP_PX` |

## Results today

Develop `022fd40`, five fixtures × seven profiles, both themes. 35 runs, 85 s headless, 468
findings. The full report comes from `--md`; these are the headlines.

### Dots

| fixture | profile | dots | diameter p50 | arcmin p50 | < 5′ | spacing p50 | 2.5.8 fail | effective tap p50 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| demo | phone | 1403 | 3.3 px | 5.2′ | 36% | 6.7 px | 100% | 1.1 mm |
| demo | desktop | 1403 | 5.8 px | 8.5′ | 0.4% | 16.1 px | 100% | — |
| demo | sidebar | 1403 | 3.0 px | 4.4′ | 98% | 5.3 px | 100% | — |
| 10k | phone | 10002 | 2.1 px | 3.4′ | 100% | 2.7 px | 100% | 0.45 mm |
| 10k | desktop | 10002 | 3.4 px | 4.9′ | 53% | 6.5 px | 100% | — |
| 10k | sidebar | 10002 | 1.7 px | 2.4′ | 100% | 2.1 px | 100% | — |
| spec | desktop | 287 | 11.1 px | 16.2′ | 0% | 33.9 px | **0%** | — |
| shape | desktop-large | 954 | 10.5 px | 12.0′ | 0% | 28.9 px | 1.4% | — |

- **WCAG 2.5.8:** every dot fails on every touch profile of every fixture. Only the sparse
  fixtures on laptop-or-larger screens pass (spec ≥ laptop, shape/tag at 2560 px). The
  camera's zoom headroom (47.7×) covers it: the median dot reaches 24 px spacing at no more
  than 11.4× (the 10k vault in a sidebar).
  Whether the "essential" exception covers a data mark is a judgement, and the audit leaves
  it open.
- **Touch:** the effective tap width is under Hoober's 7 mm for 100% of dots on every coarse
  profile; the median is 0.4-3.9 mm. The 14 px touch floor never binds: spacing does.
- **Eye:** no dot falls under 1′ except 0.2% of the 10k vault in a sidebar. On phones, the
  10k vault and the demo in a sidebar, most dots are under 5′: drawn, but too small to read
  as a disc or judge a colour. Size falls from band 1 to band 4 in both rings, so the
  outermost band is always the worst; demo/phone goes from 11% under 5′ in outer band 1 to
  60% in band 4.

### Controls

| profile class | controls | 2.5.8 fail | < 44 px | smallest |
|---|---:|---:|---:|---|
| phone, phone-small | 23-74 | 0 | 1-4% | `#vg-gear` 23×21 |
| tablet (820 px, touch) | 35-75 | 0-18 | **100%** | year buttons 25×14 |
| laptop / desktop | 35-80 | 0-18 | 100% | legend `.tw` 16×18, `.eye` 20×18 |
| sidebar | 16-20 | 0 | 88-90% | year buttons 25×14 |

- **2.5.8 controls (AA):** the legend's disclosure triangle (16×18) and eye (20×18) sit too
  close together, on every profile that shows the desktop legend: x9 on demo/10k, x2 and x3 on
  the spec and shape fixtures.
- **The tablet is the gap.** At 820 px the phone layout (`max-width: 720px and pointer:
  coarse`) does not apply, so a touch tablet gets desktop-sized controls: every one under 44 px
  and under 9.2 mm, and the 2.5.8 failures above. The phone layout itself passes 2.5.8 and is
  under 44 px only at the gear.

### Text and colour

- **WCAG 1.4.3:** light theme, the dimmed text token measures 3.34:1 everywhere it is used
  (`Search` label, stats, heat note, gear, range arrow, legend twisty). Dark theme: dim counts
  2.32:1, a legend count of `0` 2.51:1, `Folders` and the `Added` toggle 3.64:1.
- **Legibility:** every UI text style is under HFES's 16′ cap height on every profile (9-14 px →
  9-15.5′). The canvas label is 11 px: 12.2′ on a phone, 8.8′ on the 27-inch profile. HFES is a
  workstation standard, and the strictest line here. The count is a finding to weigh, not a
  defect list.
- **WCAG 1.4.11:** light theme, two tint slots measure 2.11:1 and 2.74:1 on the surface, under
  3:1 on every fixture that uses them. Dark theme passes.
- **Distinguishability:** at the drawn dot size (0.04-0.29°, all below the measured 1/3°)
  normal vision loses 0-18 pairs; protan/deutan/tritan lose up to 58/68/34 of 133 (10k in a
  sidebar). **Even at 1/3°**, the smallest size the model was measured at, 1-5 distinct pairs
  are under one noticeable difference for each dichromacy on the demo and 10k fixtures. Those
  are pairs that read as the same colour at any size the disc draws. 17 groups on 12 slots also
  means 3 pairs share a tint outright.

### Hover and gestures

- **Hover-only on touch:** the legend's `only` control is opacity 0 until `:hover`, with no
  `:focus` twin. On tablet/laptop/desktop that hides it for every group but one, and on a
  touch tablet nothing can reveal it. The legend eyes and swatches have no visible text and
  are named only by `title`. Other controls (`Cut the disc by folder`, refresh, debug copy,
  fit, band, the legend rows' highlight and counts) explain themselves only in `title`.
- **WCAG 2.5.7:** panning is drag-only. The camera row offers Zoom in, Zoom out, Fit and the
  pan toggle, but nothing that moves the view sideways. 2.5.1 is met for pinch by the zoom
  buttons.
- **Gesture constants:** tap slop 10 px against Android's 8 dp; the double-tap radius 24 px
  against Android's 100 dp, so a second tap 25-100 px away is two taps here. The double-tap
  window (300 ms) matches.

## Traps found while building it

- **A `:hover` rule is not hover-only by existing.** The first cut flagged every hover rule
  touching `opacity` or a `clip`-named longhand (`background-clip` came in through
  shorthands). An element is hover-only when it is *invisible at rest* and the rule reveals it,
  so the probe measures that per matched element. An element hidden by `display: none` counts
  only for a rule that sets `display` (the phone hides `#vg-pan` that way, and an opacity rule
  does not reveal it).
- **Visually hidden text is not text.** `.sr` spans pass every visibility test and measured
  3.34:1. Anything with a box of 1 px or less is skipped.
- **Seventeen groups on twelve slots read as "ΔE 0".** Shared tints are counted on their own,
  and the noticeable-difference test runs on distinct pairs only.
- **The drawn dot is below the colour model's range everywhere.** The colour test therefore
  reports both the extrapolated drawn size and the 1/3° floor; the floor count is the
  defensible one.
