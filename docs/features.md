---
title: Feature gallery
---

[Home](index.html) · [Features](features.html) · [Try it live](demo/) · [GitHub](https://github.com/luke321/vault-graph)

# Feature gallery

A short clip per feature — instead of one hero trying to show the whole vault at once.
[`assets/demo.webp`](https://raw.githubusercontent.com/luke321/vault-graph/main/assets/demo.webp)
at the top of the README is still the full walkthrough; this page is the same page, broken into
pieces small enough to actually watch.

Grouped by what you are trying to do. Each entry's clip is recorded from just that feature's
beats in the demo storyboard — or, where a feature has no beats of its own, cropped from the act
that moves it — so it stays honest about what it's showing. The exact regeneration commands for
each feature live alongside the source, not here — see
[`docs/features/`](https://github.com/luke321/vault-graph/tree/main/docs/features) if you're the
one recording a clip rather than watching one.

**Clips are added as they're recorded, not all at once.** A feature listed below with no
image yet is real and documented — just not filmed. `release.ps1` warns when a feature's
source has changed since its clip was last recorded; nothing here is regenerated on a
schedule.

---

## The disc

### The disc, growing

Every note is a dot; every top-level folder owns a wedge of the circle whose angle is its
share of the vault. The layout is deterministic — no simulation, no seed — so the same
vault always draws the same picture. Refresh replays the vault growing from its first note
to now.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/intro.webp" width="100%" alt="Refresh clicked, the whole vault regrowing from its first note to now while the date ribbon's range handle sweeps along with it">

### The disc follows the vault

Write a note and the disc takes it in: one two-second cascade, the new dot fading in where its
folder puts it while everything around it re-packs. Nothing is torn down, so the filters, the
date range, the pins and the camera all survive — which is what Refresh clears. Deleting or
renaming a note runs the same cascade the other way. **Follow the vault** is a view setting,
on by default. New in 2.4.0; the clips — one filmed in Obsidian itself, one on the standalone
page — are on [its own page](https://github.com/luke321/vault-graph/blob/main/docs/features/live.md).

### Subfolders

Open a folder's twisty to reach the subfolders inside it — tinted from the parent's hue,
hoverable and clickable the same way a top-level folder is.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/subfolders.webp" width="100%" alt="A folder's twisty opened to reach its subfolders, one hovered to find it on the disc, then clicked to halo it and push its sub-wedge out, then let back down and folded away">

### Reading each folder's share

Each row whose count is a plain number draws a 2px rule along the bottom, in that folder's own
colour. The largest folder currently shown fills its row and every other bar is read against it,
so the scale is always something on screen. Hide that folder and the next one grows into its
place; a hidden folder draws no bar at all, so soloing one leaves exactly a single bar. The bars
ride the cascade's own clock, walking and shrinking with the disc rather than snapping.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/countbars.webp" width="286" alt="The folder list zoomed in, each row carrying a coloured bar under its name sized to its share of the largest folder shown, then one folder soloed and every other bar shrinking away to nothing">

### Unlinked notes join their folder

A note with no links at all joins its own folder's group by default — same wedge, same
colour, same everything as any other note filed there. Right-click the `(unlinked)` row,
always the last one in the legend, and switch off its "Joins its folder" toggle to pull
unlinked notes back into their own population instead: one flat grey swatch, its own wedge, a
parenthesised count. A third toggle, "Colour by folder", appears one row further down once
the group actually holds someone, for a note that stays in that population but still wants
its own folder's tint — the row's own swatch turns into a gradient of whatever colours are
actually in play.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/unlinked.webp" width="100%" alt="The (unlinked) row right-clicked to keep its notes separate instead of joining their folder, the wedges reallocating around a new group, then right-clicked again to colour those notes by their own folder anyway, and both toggles put back">

## Reading a note

### Reading one note

Hover a note to raise it and dim everything unconnected to it. Click for a panel — folder,
type, tags, word count, linked notes — each one clickable to jump across the disc.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/note.webp" width="100%" alt="A daily note hovered, then a meeting note hovered, each raising and haloing its own links while the rest of the disc dims">

### Pin a note to the hub

Drag a note into the hole at the centre, right-click it, or open its own detail card and
click **Pin to hub** — three ways to hold up to thirteen notes together in the hub, out
of the ring. The ring closes around wherever a pinned note came from, and reopens the
moment it is unpinned.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/pin.webp" width="100%" alt="A note dragged into the hole to pin it, a second note right-clicked to pin it the other way, and a third pinned from its own detail card, whose panel is then closed">

## Navigation

### Walking the links, and back

The linked notes on a card are clickable, and clicking one walks the graph — a hop. Each hop
is remembered: the card grows a back arrow and a trail of where you came from, oldest first,
folded to the first and the last two once the walk gets long. The arrow steps back one hop;
any crumb jumps straight to that note and drops everything after it. A crumb whose note a
filter or the date range is currently hiding greys out and stays clickable. Opening a note
from the disc or the search box starts a new walk, and closing the card ends it.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/hoptrail.webp" width="100%" alt="A card opened on a well-linked note, four of its linked notes clicked in turn so the trail grows a back arrow and crumbs, folded to the first and the last two, then two steps back with the arrow and a jump straight to the first crumb, which truncates the walk there">

### The camera

Scroll to zoom, drag to pan, double-click or the corner button to reset.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/camera.webp" width="100%" alt="Scrolling to zoom in, dragging to pan, double-clicking to reset, zooming in again, then the corner button resetting it">

## Narrowing what is shown

### Filtering by folder

Click a folder in the legend to hide it; the remaining wedges grow back into the angle it
vacated and the disc re-packs. Solo a folder to hide everything else in one click. Hide
something big enough and the camera reframes to match, as long as you haven't already
panned or zoomed yourself. The same right-click menu also carries **hidden by default** —
its own entry, next.

This is also the clip where the count bars move — see *Reading each folder's share* above.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/folders.webp" width="100%" alt="A folder hidden, the disc re-packing to fill the angle it vacated, then the biggest folder right-clicked and hidden by default from its own menu, then one folder soloed to hide everything else, then everything shown again">

### A folder hidden by default

Some folders are noise most of the time — an archive, a template store, a folder of
attachments. Right-click a folder's row and toggle **hidden by default**, one row below its
colour picker, and it starts hidden every time the disc opens — this session and the next,
on whichever host you opened it from. **All** leaves it alone, so "show everything" no
longer quietly overrides the one folder you asked to keep out of the way.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/hiddenbydefault.webp" width="100%" alt="The biggest folder right-clicked in the legend and hidden by default from its own menu, the wedges reallocating around the gap it leaves, then the setting put back">

## Time

### The timeline

A strip under the heatmap band carrying every month of the vault: two handles cap the date
range, a pill sets the heatmap's own 52-week window, and a chip per year jumps straight
there. Replaced the sidebar's old rank slider — the ribbon is the only timeline now.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/timeline.webp" width="100%" alt="The date range dragged in by both handles, a year chip hovered and clicked, the heatmap's own window slid back and forward on its own, then the date range cleared">

### The heatmap

One square per day above the disc, coloured from what landed in it. Hover a day to halo
its notes on the disc; click to keep the mark.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/heatmap.webp" width="100%" alt="The busiest day hovered, then two more, each haloing its notes on the disc, then the busiest day clicked to keep the mark, and clicked again to let it go">

### Compact date axis

Years and months on the strip draw by how many notes they hold, not by the calendar. A
sparse year collapses toward the same narrow width every other sparse year gets; a busy
one keeps growing to fit what it actually holds. Off, in the gear or the icon beside the
date fields, gives every year and month back its plain calendar width.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/compactaxis.webp" width="100%" alt="The compact axis toggled off, spreading every year and month back to plain calendar width, then toggled back on to regather around where the notes actually are">

## Colour

### Folder colours

Folders are coloured from twelve slots — ten hues and two greys — handed out in folder
order and round again. Right-click a folder in the legend for the same twelve-swatch
picker at the row itself, no settings panel needed: click a slot to hold that folder to
a colour, **Auto** hands it back to its positional slot. Setting one folder never changes
another, and two folders may share a colour — useful for saying they belong together.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/colours.webp" width="100%" alt="Two folders right-clicked in turn, each given a colour of its own from the picker, then both put back to automatic">

### Subfolder colours

The same right-click colour menu a top-level folder's row opens, reached from a
subfolder's row instead — recolour "People" inside "03 - Resources" without touching its
parent's own hue. The row only exists once its folder's twisty is open, the same
precondition the subfolders feature needs. **Auto** hands the tint back to whatever the
parent folder and position would give it anyway.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/subfoldercolor.webp" width="100%" alt="A folder unfolded to reach a subfolder, that subfolder right-clicked for its own colour menu, given a colour, then put back to automatic">

## Fitting the window

### Folding the panels away

Two buttons at the top left of the disc: one folds the folder list, search and view buttons
away, the other folds the notes-added calendar and its date strip. Fold both and the disc has
the window to itself, and however you leave it is how the graph opens next time. On a phone the
folder list is summoned as a sheet over the disc; on a PC it is a column beside it, so it
collapses and hands its width to the graph. Only the calendar's fold makes the dots bigger — the
disc is fitted to the shorter side of the window, and on a landscape monitor that is the height
the calendar is eating.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/collapse.webp" width="100%" alt="A desktop-width window with the folder list beside the disc and the calendar band above it: the band folded away first, so the disc grows into the row it had, then the folder list folded away, so its column collapses and the disc re-centres in the whole window with nothing beside it">

### The disc on a phone

A finger drives the disc: one finger pans, two pinch about their midpoint, a tap raises a note
and opens its card, and a double-tap fits the disc back into view. Below 720 px the layout
changes to match — the disc takes the screen, the folders, search and view buttons slide up as a
sheet from two buttons at the top left, the calendar stays on and can be put away, and a note's
card rises as a sheet at the foot so the disc is still visible above what you tapped.

<img src="https://raw.githubusercontent.com/luke321/vault-graph/main/assets/features/mobile.webp" width="420" alt="A phone-sized window with a fingertip for a pointer, each tap leaving a ring: the disc zoomed in until its dots are finger-sized, a note tapped so its card rises as a sheet at the foot, the folder list slid up as a sheet, one folder soloed from inside it, the sheet put away so the rest recedes, then a double-tap fitting what is left back into view">
