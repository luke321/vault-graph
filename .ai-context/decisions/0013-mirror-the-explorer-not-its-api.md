# 0013 — Mirror the sortspec text, not the explorer

**Date** 2026-09-08 · **Status** accepted · **Relates to** github#71, `design/0001`, `design/0004`, `decisions/0009`

## Context

`design/0001` promised that wedges "go round the disc in the same sequence as the vault's own
folder list". That is true only while the file explorer is sorted by name. A vault running
[Custom File Explorer sorting](https://github.com/SebastianMC/obsidian-custom-sort) has an
explorer order the disc knew nothing about, and the DDR's sentence was false there.

## What was rejected

**Reading the explorer's resolved order.** The obvious move, and there is nothing to read. That
plugin exposes no public API for its order; it works by patching the explorer's own sort. The
only way to observe the result is the explorer's DOM, which would be a private-API dependency on
a *third-party plugin's* rendering — worse than the Obsidian-internal dependencies this repo has
so far stayed clear of, because it would break on that plugin's markup rather than on Obsidian's.
It also only works when the explorer pane happens to be open and the plugin happens to be on
(`sort-on` is not automatic at startup).

**Depending on the plugin being installed at all.** The exporter has no Obsidian to ask, and the
page must work standalone. A spec is a file; a file can be read by both hosts.

## The decision

**Parse the spec text, and only the subset that decides order.**

| read | ignored, with a notice naming the line |
|---|---|
| `target-folder:` — exact, `/`, `.`, `X/*`, `/regex/` | every other directive and punctuation-led marker |
| bare names, as ordered pins | `order-asc`/`order-desc` over `created` and `modified` |
| `order-asc` / `order-desc` over `a-z` | |
| the precedence: exact path > exact name > regexp > wildcard | |

Three things fall out of that table and each is load-bearing.

**`created` and `modified` are understood and deliberately not applied.** The plugin sorts
folders by their *filesystem* timestamps. The page has no folder timestamps — only the notes
inside a folder, whose dates would give a different answer under the same name. Agreeing loudly
and wrongly is worse than skipping and saying so.

**A parse failure falls back to name order, never to half a spec.** A partly-applied order is
indistinguishable from a bug at a glance, and a disc nobody can trust is worse than a disc in
the order it always had.

**A pin naming something that is not there is not an error.** Specs outlive the folders they
name, and a real root section usually pins *files*, which are not folders at all and can never
match. Both are normal wear: the pin does not appear, nothing is skipped, nothing is reported.

## Only two questions ever reach the parser

`paraDirs()` keeps `dirs[0]` and stops at the first `YYYY-MM` segment, so the disc has exactly
two levels. Of a deep spec's many sections only two kinds can reach it:

- the section targeting the **vault root** orders the wedges;
- the section targeting a **top-level folder** orders that folder's sub-wedges.

Sections aimed deeper are parsed, kept, and never asked about. They are not errors — they are
invisible here. The setting's own description says so, because a vault that wrote a
three-level spec and got two levels of effect deserves to be told rather than left to wonder.

## Where the code lives, and why there

The grammar is in `src/page.js`, at **module scope**. Two constraints pin it there:

- it is the one file both hosts share, so the parser exists once rather than twice;
- the exporter pastes that file in as **text** (`asScript()`), stripping only the trailing
  `export {}`, so the file can carry no `import` — a shared module is not available to it;
- module scope, outside the three `BEGIN/END` regions `scripts/build-plugin.mjs` strips, or the
  plugin would ship without it.

The hosts only *find* the text, and they differ because their sources differ: the exporter reads
the block scalar itself (its frontmatter parser flattens every value and has never needed YAML),
the plugin takes it from the metadata cache already parsed. Both look in the same three places —
a `sortspec.md` in any folder, a folder note's front matter, and the file named in the sort
plugin's own `data.json`.

The exporter additionally takes `--sortspec <file>` and `--folder-order <mode>`. The second is
not decoration: `decisions/0009` says the page stores nothing and the host persists settings, and
a standalone page's host is `localStorage` — which is empty on first open. Without a build flag a
page shipped with a spec would open in name order every time and the spec would be dead weight.
`--sortspec` only adds a source; it does not switch the mode by implication.

## What this must not break, and how it is held

**Colour.** The automatic palette slot is a group's index in the array `buildColors()` walks, so
following the draw order would repaint the whole disc whenever the order moved — and the golden
snapshots would not notice, because they hold positions and band, not colour. `computeOrder()`
emits a second, always-name-ordered array and the slot walk reads only that. Checked by *a folder
keeps its colour when the wedge order changes*.

**The rank.** `(vault root)`, the `_`-archives and `(unlinked)` keep the places `design/0001`
gave them in every mode. Only the real-folder bucket is re-sorted.

**Dots.** This moves wedges and rows. A note's radius is its link weight and nothing steps
between them; the serpentine inside a wedge is untouched.

**The other three fixtures.** None carries a spec and the default is still `Name`, so all three
goldens must be byte-identical — verified by regenerating all four and finding only the new one
changed. `spec-vault` is the fourth, and the only fixture laid out in anything but name order.

## Not built

Ordering taken from an Obsidian **bookmarks group**
(`bookmarksGroupToConsumeAsOrderingReference`), which that plugin also supports. It is a second
source with a second set of semantics, and the vault this feature was built for has it
configured but empty. If it is ever wanted, it belongs behind the same fallback rule as the
rest.
