<!--
  The update note the plugin shows ONCE, on the first open after a MINOR or MAJOR update
  (github#83, design/0016). One "# <version>" heading, then up to five "- " bullets of plain
  text: what you can now do, not how it was built. No markup, no images, no links -- the
  strip links to the release page and the feature gallery on its own. The release branch
  rewrites this file beside the CHANGELOG entry; a PATCH leaves it as it is, and shows nothing.
  scripts/build-plugin.mjs refuses a file that breaks any of that.
-->
# 2.6.0
- After an update, the graph tells you what changed: this strip, once per release. Dismiss it and it is gone.
