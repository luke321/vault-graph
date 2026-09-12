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
# 2.7.0
- Click a note and the sidebar reads it. Nothing lands over the disc any more.
- The sidebar holds two readings, Groups and Selected note. The tabs at its top switch between them, and each one keeps its own scroll position.
- Close the note, or click empty space, and you are back on the groupings where you left them.
- The disc fills more of the window, and a square pane gains the most.
- Panning no longer freezes when notes arrive under it.
> vg-tabs
