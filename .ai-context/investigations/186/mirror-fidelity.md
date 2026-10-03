# Mirror fidelity

The mirror generator was discarding graph inputs: Markdown links, creation dates inferred
from filenames or timestamps, note types, tag relationships, exact word counts and graph
settings. A four-note invented reproduction exported five edges before mirroring and four
afterwards; two historical dates became today's date. The corrected generator preserves
all five edges and the resolved dates.

`src/note-source.mjs` shares the exporter's frontmatter and link mining with the generator.
Links are resolved before renaming, then emitted as qualified links in frontmatter so body
word counts remain exact. Original body text is replaced with filler. Modification times
are restored, and resolved creation dates and types are explicit. Tag tokens preserve
hierarchy and the underscore convention for archive groups. Note placeholders preserve
basename sort order and duplicate basename identity.

`scripts/mirror-settings.mjs` allows only graph preferences, translating folder, tag and
note keys. Colour values remain palette slots (`g1` through `g12`). Hidden folders remain
in the data, with their saved visibility or underscore default. The generated plugin
settings and `.vault-graph-mirror.json` carry the same defaults. The HTML shell consumes
the latter, with existing browser preferences taking precedence. Animation and sizing
implementation are unchanged.

The regression check is part of `scripts/make-mirror-vault-selftest.mjs`. Its invented
vault covers duplicate basenames, aliases, relative and Markdown links, weighted edges,
ghosts, date inference, daily and template classification, tag hierarchy, pinned notes,
colour slots, saved-hidden folders and underscore-hidden folders. It compares graph
topology and node inputs, checks the HTML defaults, and rejects equal, nested and ancestor
output paths before any deletion.

A sequential headed source/mirror comparison on that fixture measured identical visible
positions and dot sizes at rest and after refresh: maximum dot difference 0 px, moved
notes 0. Both intros had eight arriving participants, span 36, and converged in 279 frames
(4612 ms and 4615 ms). Both hidden groups remained hidden; neither browser reported an
error. These are invented-fixture results, not measurements of a private vault.

This check establishes parity when source and mirror contain the same hidden groups.
It does not establish that adding hidden notes has zero influence on the app: the existing
app deliberately derives a resting-size baseline from the unfiltered graph, as documented
in `../../invariants.md` under the filtered-dot invariant. Changing that policy is a
separate runtime change, not an anonymization fix.
