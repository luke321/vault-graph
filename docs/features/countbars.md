# Reading each folder's share

Every legend row whose count is a plain number draws a 2px rule along the bottom of the row, in
that folder's own colour. The largest folder **currently shown** fills its row and every other
bar is read against it — so the scale is always something on screen rather than a total you
cannot see. Hide that folder and the next one grows into its place; the count's tooltip names
whichever folder the bar is measured against.

A folder behind a closed eye draws no bar at all, which makes soloing one leave exactly a single
bar, full width. The bars ride the cascade's own clock, so they walk up and shrink down over the
same 1600 ms the disc takes to re-pack, and a bar whose folder is going away shrinks to nothing
rather than blinking out.

Parenthesised counts and subfolder rows stay bare: those notes are tallied somewhere other than
that row's own wedge, so a bar there would be measured against a denominator that is not in the
list. It is a view setting, **Count bars in the legend**, on by default and remembered per vault.

## Where it lives in the storyboard

**No act of its own.** The bars are part of the legend, so they are on screen in every act;
`act: "folders"` is where they actually move, because its solo beat sends every other bar down to
nothing. This clip is a crop of that act rather than a separate recording — filming the legend
twice would mean two takes that have to agree.

## Regenerating this feature's clip

Record the `folders` act as usual, then crop its legend column and double it, so a 2px bar is
legible on a release page:

```powershell
.\scripts\record-demo.ps1 -Act folders -Monitor right
# wrote demo-folders-<timestamp>.mp4

ffmpeg -y -ss 18.5 -t 9 -i demo-folders-<timestamp>.mp4 `
  -vf "crop=270:585:8:250,scale=540:-1:flags=lanczos,fps=15" `
  -c:v libwebp_anim -lossless 0 -quality 72 -compression_level 4 -loop 0 -an `
  assets\features\countbars.webp
```

The `-ss` lands just before the solo, which is the part worth watching. `make-hero.ps1` is not
used here because it scales to a fixed width from the top left of the whole window; this needs a
crop first.

**The rectangle is measured, never carried over — every number in it has moved at least once.**
The offset was 200, then 215 when the Folders/Tags segmented control (github#86) added a row above
the legend and a 200 crop caught its bottom edge. It is **250** from 2.7.0: github#131 added
another row above the legend, so 215 no longer lands on the All/None row — and the take is now a
square 1000x1000 window rather than 1586x992, which moves the legend column's width as well as its
top. Grab a frame and read it off (`ffmpeg -ss 18.5 -i <take>.mp4 -frames:v 1 check.png`) after any
change above the legend or to the recording frame; never guess a new number, and never assume the
old one survived a reframe.

Commit `assets/features/countbars.webp` and update `Last re-recorded` below in the same commit —
that pair is what `release.ps1`'s `=== features ===` warning reads.

## Metadata

| | |
|---|---|
| **Introduced in** | `2.3.0 (github#78)` |
| **Last re-recorded** | `2.7.0 — 2026-09-12` — 9.0 s cropped from a 30.0 s `folders` take at 1000x1000, encoded at 540 px (0.40 MB) — rectangle re-measured for the square frame and for github#131's extra row above the legend |
