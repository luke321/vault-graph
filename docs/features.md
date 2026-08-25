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

*Clip pending.*

## Reading one note

*v1.0*

Hover a note to raise it and dim everything unconnected to it. Click for a panel — folder,
type, tags, word count, linked notes — each one clickable to jump across the disc.

*Clip pending.*

## Filtering by folder

*v1.0*

Click a folder in the legend to hide it; the remaining wedges grow back into the angle it
vacated and the disc re-packs. Solo a folder to hide everything else in one click.

*Clip pending.*

## The heatmap

*Predates versioning*

One square per day above the disc, coloured from what landed in it. Hover a day to halo
its notes on the disc; click to keep the mark.

*Clip pending.*

## Subfolders

*Predates versioning*

Open a folder's twisty to reach the subfolders inside it — tinted from the parent's hue,
hoverable and clickable the same way a top-level folder is.

*Clip pending.*

## Folder colours

*Predates versioning*

Twelve palette slots, handed out in folder order. Click a slot to hold a folder to a
colour; two folders may share one on purpose.

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

*Clip pending.*
