# Group colours: twelve slots

**Status** as-built · extracted from the README on 2026-08-22 · twelve slots, cycling,
and pickable from 2026-08-23

> Why twelve, why they go round instead of running out, and why a folder's saved colour
> is a slot rather than a hex.


Twelve slots: **ten hues and two greys**. Slots 1-8 are the documented palette in its
documented order; 9 and 10 sit in its two largest hue gaps (measured 93 and 74 degrees)
at the median lightness and chroma of the other eight, so they read as the same family
rather than as bolt-ons. 11 and 12 are the greys, carrying the same two values as the
first two neutrals.

Twelve categorical slots **cannot** clear the colour-vision separation gate — measured
on this set the worst pair is red vs orange at normal-vision dE 7.1, and CVD dE 1.6.
Four is the honest ceiling when marks scatter freely. An evenly-spaced ten-hue ramp
was tried as an alternative and reached dE 9.1, but only at chroma 0.13, which looked
visibly muddy; the documented hues were kept for their character.

What makes twelve workable here is that **colour is not the only channel**: every group
owns a contiguous wedge, separated from its neighbours by a **2 degree gap**, labelled
on the rim, and listed in the legend with its count. Position and labels carry
identity; colour reinforces it.

One knock-on worth knowing: ten hues around one circle leaves each group only 18-39
degrees to its nearest neighbour, so the **subfolder** hue budget drops from ~64
degrees to 11-23. Subfolder tints now lean on the lightness ladder, which still gives
them adjacent dE of roughly 7-9 on its own.

## It goes round

Folder *n* takes slot *n*, and folder 13 comes back to slot 1.

It used to stop at ten and drop everything past that into the neutrals, on the reasoning
that a repeated hue is a lie about identity. That trade is the wrong way round. A repeat
is still separated by its wedge, its rim label and its legend row — the three channels
above are all still doing their work. The grey tail was the opposite: one
undifferentiated blob in which nothing was separated from anything, and the more
top-level folders a vault had, the more of it went into that blob.

Measured on the 17-folder synthetic vault: slots run `g1…g12` and then `g1…g5` again,
five colours repeating rather than five folders sharing one grey.

Grey did not disappear; it stopped being a punishment for being thirteenth. Slots 11 and
12 are greys anyone can pick, because "this folder should recede" is a real thing to want
and the palette should answer it as a choice.

The neutrals still exist and are still used — as the dim colour and as `colorOf`'s
fallback — but they are no longer the overflow palette.

## Slots 6 and 10 were pastels

They were `#e87ba4` and `#c26ed3`, and measured it was **lightness** that made them read
as pastel, not low chroma: their chroma was mid-pack (0.141 and 0.168, against a palette
spanning 0.122-0.191) but they were the two palest slots on the light surface, at contrast
2.62 and 3.16 — and magenta was the one hue in the palette failing 3:1 against it. Next to
eight saturated hues they did not read as members of the family; they read as the two that
had faded.

Both hues are kept to within a degree or two, so slots 9 and 10 stay in the two largest hue
gaps they were placed in. What changed is chroma and lightness together:

| | old | new |
|---|---|---|
| slot 6 chroma / contrast (light) | 0.141 / 2.62 | 0.227 / 5.12 |
| slot 10 chroma / contrast (light) | 0.168 / 3.16 | 0.225 / 6.94 |
| light slots under 3:1 | 4 (g3, g4, g6, g9) | 3 (g3, g4, g9) |
| worst pair, both themes | Orange vs Red, dE 7.1 | Orange vs Red, dE 7.1 |

The last row is the point: two more slots and two much stronger hues cost the palette
nothing in separation. The binding pair was never one of the ones that changed.

Re-measure with `node scripts/palette-check.mjs src/page.css`.

## A saved colour is a slot, not a hex

`{ "01 - Projects": "g7" }` — never `{ "01 - Projects": "#4a3aa7" }`.

The palette has separate light and dark values, so a stored hex is right in one theme and
wrong in the other; the plugin follows Obsidian's theme live, on `css-change`, and a baked
hex would sit there looking like the other theme's palette. Storing the slot also keeps
every reachable colour inside the measured set — there is no picker path to a colour that
never went through the numbers above.

The same reasoning runs one level down into the DOM: swatches are coloured by a
`.vg-g7` class resolving `var(--g7)`, not by an inline style. A `var()` re-resolves on a
theme flip; a hex written into a style attribute does not.

## An override changes exactly one folder

Position decides every other colour. `buildColors` does not look at what anyone else
picked, so setting one folder cannot move another, and two folders may hold the same slot.

**This replaced a cleverer version, which was wrong twice.** That one kept the palette a
bijection: an override claimed its slot, the automatic run stepped over it, and picking a
slot another folder held swapped the two. Both halves rested on the assumption that two
folders sharing a hue is a mistake to be prevented. It is a choice — grouping three
folders under one colour to say they belong together is a thing to want — and the clever
version made it unreachable.

It also cost bystanders. Measured on the 17-folder vault, overriding the fifth folder to
slot 1 moved the four folders between slot 1 and that folder's own position, each up by
one. Bounded, and defensible on paper; in the hand it means the disc repaints around the
single change you were looking at. A colour setting whose blast radius is four other
wedges is not doing what its user asked.

So: no claiming, no stepping over, no swapping. An override is an override.

## Archives are out of the rotation

A group whose name starts with `_` is an archive — `_ Archives`, `_ Claude`, `_old`. Three
things follow, all of them defaults rather than prohibitions:

1. **No slot in the colour rotation.** The automatic counter skips them, so which hue a
   working folder gets does not depend on how many archives happen to sort before it.
2. **The grey slot `g11`** instead -- a real palette slot, not a neutral off to one side,
   so the picker can ring it and `Auto` means something on an archive row. `g11` rather
   than `g12` because it is the lower-contrast of the two greys against the surface in
   *both* themes (4.99 vs 9.51 light, 5.16 vs 9.12 dark), which is what recede means.
3. **Hidden on arrival**, and `Refresh` returns to that rather than to "everything shown".

Measured on the demo mirror, which has two: `_ Archives` and `_ Claude` sort at positions
**2 and 3**, ahead of `01 - Projects`. Under the old rule they took `g2` and `g3` and
pushed every working folder two slots along — so the vault's largest folders were wearing
colours chosen by its archives. Now the working folders run an unbroken `g1…g9`, and the
archives share `g11` without advancing the counter.

`slotOf` exists because of this: which slot a group is on is no longer derivable from its
position, so the settings panels read it back from `buildColors` rather than recomputing
`i % 12`. It was tried the other way first — matching each group's current colour against
the palette — and while the archive grey was still a neutral rather than a slot, that
matched nothing and dropped the archive rows entirely, which were the rows most in need of
the visibility toggle.

An explicit pick still wins over all of it. The rule decides what happens when nobody has
said anything.

## Visibility has two levels

| | |
|---|---|
| the legend's eye | **now** — this session, reset by `Refresh` |
| the settings eye | **by default** — persisted, and what `Refresh` returns to |

The settings map is tri-state: `true` shown, `false` hidden, **absent** means "whatever the
`_` rule says". Absent has to stay distinguishable from `false`, or hiding a folder by hand
would be indistinguishable from never having mentioned it, and a later change to the
default could never reach it.

This is the one place the `Refresh` button's meaning moved: it used to clear every filter
to "everything visible", and now it returns to the configured default. Anything else would
make `Refresh` the single control that disagrees with the settings.

## Hovering a legend row haloes its folder

Hover is a **separate highlight source**, alongside a clicked group, a marked heatmap day
and "mark today" — `state.hoverGroup` and `state.hoverPath`, read by `isHighlighted` and
included in `hlSignature`, so it ramps through exactly the same per-note path as the rest.
Missing it out of that signature would be the silent failure: the sweep would never run.

It **haloes but does not push**, and `isPushed` deliberately does not ask about it. A
wedge sliding out and back under a moving pointer is a lot of motion to spend on a question
the halo has already answered. Clicking the row still pushes — that is the difference
between asking where something is and choosing it. The same haloes-without-pushing
treatment is what a marked heatmap day gets, for a related reason.

It is transient and never persisted. `buildLegend` clears it first thing, because every
row is about to be replaced and the one under the pointer will never fire its `mouseleave`
— that is the only place covering all of the callers (a click, a colour pick, a filter)
rather than each of them having to remember.
