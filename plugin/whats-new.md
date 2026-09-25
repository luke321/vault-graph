<!--
  The update note the plugin shows ONCE, on the first open after a MINOR or MAJOR update
  (github#83, design/0016). Three line kinds, in any order after the heading:

    # 2.6.0          the release this note is for -- one per file, and it must be the one
                     being cut, or the strip stays silent rather than showing a stale note
    - <text>         up to five bullets, plain text: what you can now do, not how it was
                     built. No markup, no images, no links -- the strip builds its own
    > vg-dim         up to four control ids from src/page.html: what this release ADDED.
                     They pulse while the note is up and stop when it is dismissed. Leave
                     the line out when a release adds no control of its own

  The strip links out on its own: one link per release between the version last seen and
  this one, oldest first, plus the feature gallery. The release branch rewrites this file
  beside the CHANGELOG entry; a PATCH leaves it as it is, and shows nothing.
  scripts/build-plugin.mjs refuses a file that breaks any of that.
-->
# 2.9.0
- On a phone the panel now sits below the disc in the page's own scroll, instead of covering the circle.
- Panning is off on a phone -- the disc doesn't drift under your thumb -- and buttons throughout are sized for a finger.
- A new Folder order setting lays wedges and the legend out the way your vault's own file explorer already sorts them.
- Root notes take their place among the folders instead of always sitting first or last.
- The heatmap band's own controls fit their row on a phone instead of spilling out of it.
> vg-gear
