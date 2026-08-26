# Feature gallery

A short clip per feature, in the order each one shipped — instead of one hero trying to
show the whole vault at once. [`assets/demo.webp`](../assets/demo.webp) at the top of the
README is still the full walkthrough; this page is the same page, broken into pieces small
enough to actually watch.

Each entry's clip is recorded from just that feature's beats in the demo storyboard, so it
stays honest about what it's showing. The exact regeneration commands for each feature live
alongside the source, not here — see `docs/features/` if you're the one recording a clip
rather than watching one.

**Clips are added as they're recorded, not all at once.** A feature listed below with no
image yet is real and documented — just not filmed. `release.ps1` warns when a feature's
source has changed since its clip was last recorded; nothing here is regenerated on a
schedule.

---

## The disc, growing

*v1.0*

Every note is a dot; every top-level folder owns a wedge of the circle whose angle is its
share of the vault. The layout is deterministic — no simulation, no seed — so the same
vault always draws the same picture. Refresh replays the vault growing from its first note
to now.

![Refresh clicked, the whole vault regrowing from its first note to now while the date ribbon's range handle sweeps along with it](../assets/features/intro.webp)

## Reading one note

*v1.0*

Hover a note to raise it and dim everything unconnected to it. Click for a panel — folder,
type, tags, word count, linked notes — each one clickable to jump across the disc.

![A daily note hovered, then a meeting note hovered, each raising and haloing its own links while the rest of the disc dims](../assets/features/note.webp)

## Filtering by folder

*v1.0*

Click a folder in the legend to hide it; the remaining wedges grow back into the angle it
vacated and the disc re-packs. Solo a folder to hide everything else in one click.

*Clip pending.*

## The heatmap

*Predates versioning*

One square per day above the disc, coloured from what landed in it. Hover a day to halo
its notes on the disc; click to keep the mark.

![The busiest day hovered, then two more, each haloing its notes on the disc, then the busiest day clicked to keep the mark, and clicked again to let it go](../assets/features/heatmap.webp)

## Subfolders

*Predates versioning*

Open a folder's twisty to reach the subfolders inside it — tinted from the parent's hue,
hoverable and clickable the same way a top-level folder is.

*Clip pending.*

## The camera

*Predates versioning — undocumented until this gallery*

Scroll to zoom, drag to pan, double-click or the corner button to reset.

*Clip pending.*

## The timeline

*1.7.0 — "The Timeline Update"*

A strip under the heatmap band carrying every month of the vault: two handles cap the date
range, a pill sets the heatmap's own 52-week window, and a chip per year jumps straight
there. Replaced the sidebar's old rank slider — the ribbon is the only timeline now.

![The date range dragged in by both handles, a year chip hovered and clicked, the heatmap's own window slid back and forward on its own, then the date range cleared](../assets/features/timeline.webp)

## Compact date axis

*Unreleased*

Years and months on the strip draw by how many notes they hold, not by the calendar. A
sparse year collapses toward the same narrow width every other sparse year gets; a busy
one keeps growing to fit what it actually holds. Off, in the gear or the icon beside the
date fields, gives every year and month back its plain calendar width.

![The compact axis toggled off, spreading every year and month back to plain calendar width, then toggled back on to regather around where the notes actually are](../assets/features/compactaxis.webp)

## Pin a note to the hub

*Unreleased*

Drag a note into the hole at the centre, right-click it, or open its own detail card and
click **Pin to hub** — three ways to hold up to thirteen notes together in the hub, out
of the ring. The ring closes around wherever a pinned note came from, and reopens the
moment it is unpinned.

![A note dragged into the hole to pin it, a second note right-clicked to pin it the other way, and a third pinned from its own detail card, whose panel is then closed](../assets/features/pin.webp)

## Color Picker

*Unreleased*

Right-click any folder or subfolder's row in the legend for the twelve-swatch picker at
the row itself — no settings panel needed. Click a slot to hold that row to a colour,
**Auto** hands it back to whatever its position would give it anyway. Shown here on a
subfolder — recolour "People" inside "03 - Resources" without touching its parent's own
hue. The row only exists once its folder's twisty is open.

![A folder unfolded to reach a subfolder, that subfolder right-clicked for its own colour menu, given a colour, then put back to automatic](../assets/features/subfoldercolor.webp)
