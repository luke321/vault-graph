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
# 2.10.0
- The layout engine under the disc was rebuilt to make room for what comes next; most views look just as they did.
- A typical dot now draws at about the size its space allows, and it scales with the disc when you resize the window.
- A filtered band fills the ring it owns, and a long tail of small tags or folders keeps its own wedges without drowning in gaps.
- In the tag view, a new Parent tags chip folds every parent tag into one solid wedge.
- Walking from note to note frames the whole visible neighbourhood in one camera move.
> vg-parents
