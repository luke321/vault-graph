# 0015 — Mirror the sortspec text, not the explorer

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
| `target-folder:` — exact, `/`, `/X`, `.`, `./X`, `X/*`, `regexp: P` | every other directive and punctuation-led marker |
| bare names, as ordered pins | `order-asc`/`order-desc` over `created` and `modified` |
| `order-asc` / `order-desc` over `a-z` and `true a-z` | |
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

## The grammar, stated exactly — github#172

The table above is the shape. This is the wording, because a code review of `2.8.0..develop`
found three places where the page had quietly invented a grammar of its own, and in every one
**the plugin wins**: it is the thing the spec was written for, and the page is only reading it.

**A `target-folder:` value is ANCHORED or it is bare, and that decides the rank before
anything else looks at it.**

| value | resolves to | rank |
|---|---|---|
| `/` | the vault root | 3, exact path |
| `/X`, `/X/`, `/X/Y` | `X`, `X`, `X/Y` — from the root | 3, exact path |
| `.`, `./` | the folder the spec file is in | 3, exact path |
| `./X` | `<that folder>/X` | 3, exact path |
| `X`, with no slash and no leading `/` or `.` | a folder **named** `X`, at any depth | 2, exact name |
| `X/Y` | the path `X/Y` | 3, exact path |
| `regexp: P`, `regexp: for-name: P` | any folder whose **name** matches `P` | 1 |
| `/*`, `X/*`, `./*` | that folder and everything under it | 0, wildcard |

**The rank is the discriminator, and a rank-1 `target` is NOT a path.** It holds the directive's
raw value — `regexp: ^Arch` — so that a notice can quote what was written. Under the old `/re/`
spelling that string always carried slashes, and one of `smoke.mjs`'s own helpers separated the
sections the disc can see from the rest by testing for a slash; `regexp: ^Arch` has none, so it
read as a top-level folder of that name. Anything sorting sections asks the **rank**.

**A leading `/` is a root anchor, not noise to be trimmed.** It used to be stripped before the
rank was decided, so `/Projects` — one segment once the slash was gone — became a rank-2 name
match and governed `Old/Projects`, a folder its author never named. The rule that replaces it is
one line: *anchored means the result is a path*, so no anchored value can ever demote to a name
match. `./` had the same fault in its relative spelling, resolving to a one-segment path and then
demoting; it is the spec's own folder now, exactly as `.` always was.

**`/regex/` is gone, and it was never the plugin's.** A pattern is spelled `regexp: P` there,
optionally `regexp: for-name: P`. The page had invented delimiters, which cost twice over: a real
spec's `regexp:` section was read as a name match on a folder literally called `regexp: ...` and
so matched nothing at all, silently, while `/Projects/` — a plain root-anchored path with a
trailing slash — was compiled into a pattern and matched `Old Projects`. Both spellings of the
plugin's form mean the same thing here, because rank 1 has only ever tested the folder **name**;
the plugin's bare `regexp:` also matches the path, which this page does not do.

**`a-z` is numeric-aware; `true a-z` is the plain one.** The plugin's own words: under `a-z`
"numbers are treated specifically and 2 goes before 11", under `true a-z` "numbers are treated
as texts and 11 goes before 2". The page had exactly one comparator, the plain one, under the
name of the numeric one — so `2 drafts` and `10 archive` came out `10, 2` on the disc and `2, 10`
in the explorer beside it — and it rejected `true a-z` outright, with a reason (folder
timestamps) that is not true of it.

**What is knowingly still not the plugin's, and why it is left alone.** A bare `My Folder` is an
exact *root-level path* there, and a name match is spelled `target-folder: name: My Folder`. This
page reads a bare name as the name match, which is more permissive, and changing it would move
wedges on every vault that ships a spec. It is a separate decision with a golden behind it, not a
parser fix. Nor does the page read `/...` (the folder and its immediate children only), or the
`debug:` and `/!:` priority modifiers.

**A section whose `target-folder:` did not resolve is dropped entire, pins and all.** It used to
be reported skipped and then emitted anyway, aimed at the folder the spec file itself lives in,
so every pin after the broken line re-ordered *that* folder. The dead section ends at the next
`target-folder:`, which still reads normally. Line-level skip reporting is deliberately
untouched by this: whether a line is outside the subset the page reads has nothing to do with
which section it happens to sit in, so an `order-asc: modified` inside a dead section is still
named.

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

## D-12 — the spec orders FOLDER wedges only

`github#86` landed the grouping dimension while this work was parked: the disc can now be cut by
**tag** as well as by folder. A sortspec names *folders*, so the explorer order is a
folder-dimension answer, and both `drawOrder()` and `buildSubOrder()` gate it on
`state.dim === "folder"`. Left open, a root section's pins would reorder a **tag** that merely
shares a folder's name — a vault with an `03 - Resources` folder and an `#03 - Resources` tag would
see the tag disc quietly inherit the folder's pins.

`size` is deliberately **not** gated: biggest-tag-first means something, and it needs no spec.

## Absence means nobody has chosen, and then the vault decides

`folderOrder` is **absent** from the plugin's defaults rather than set to `"name"`. When the page
sees no value it decides from the vault: `explorer` if a sortspec was found, `name` otherwise. A
vault that ships a spec is one whose owner has already said what order they want things in, so
opening it in name order shows them an order they deliberately moved away from. Same idiom as
`sheetOpen`/`bandOpen`, where absent means "decide from the width" (`github#82`).

An explicit value always wins, which is what makes a choice stick: the host persists on every
change (`decisions/0009`), so a reader who picks Name keeps Name even in a spec-carrying vault.

**The spec's notice under Folder order belongs to the explorer mode, and follows it.** github#172.
"no sortspec found in this vault" and "N line(s) skipped" rendered under all three modes, so a
reader who had chosen `Name` was told about lines that were not being read and a spec that was
not being applied. It is gated on the resolved mode now — but gating alone would have been half a
fix, because `setFolderOrder()` never rebuilt the options body: the note would have gone stale
until the panel was next reopened, which is a worse failure than the one being fixed, since it
looks right whenever anybody goes looking. The note has its own id and is refreshed beside the
radio's `aria-checked` loop, which is the idiom already there.

**Both settings surfaces must therefore report the RESOLVED mode, not the stored one.** With
nothing stored, a control showing the stored value reads "Name" over a disc that is not in name
order, and picking Name — already the visible selection — looks like a no-op. `liveFolderOrder()`
peeks at a loaded view for what the page actually chose. It is safe to read `leaf.view` there
precisely because a deferred leaf hands back a stub that fails the `instanceof`: no mounted page
means nothing to report, which is the right answer rather than a reason to force a leaf open from
a settings render.

## The legend tail says "other", not "smaller", under a spec

`"N smaller subfolders"` is only true while the order *is* size. Under a spec the tail can hold
subfolders **bigger** than the named ones, so the row reads `"N other subfolders"` whenever the
order is not size.

## The mirror vault translates a spec; it never copies one

`scripts/make-mirror-vault.mjs` exists to check a real vault's **shape** without its content, and
since this issue a vault's shape includes the order its file explorer is in. A mirror with no
sortspec cannot exercise the one feature the source vault leans on hardest, which makes it the
wrong tool for exactly the check it exists for. So the mirror carries one — under four rules.

- **A spec is an ordinary note, so it is mirrored as one**, translated in place rather than
  written alongside. Bolting it on afterwards produced *both* a spec file and a random-titled note
  that had been the original: the folder carried one note more than the source, and the real spec
  note was a ghost nobody could find.
- **It is TRANSLATED, never copied.** Every `target-folder:` path and every pinned name goes
  through the same `dirMap` and `nameMap` the notes did, so the mirror carries the spec's
  *structure* — its pins, its `order-` lines, its precedence, its depth — and none of its real
  names. That is not tidiness. A person folder under a 1-on-1 tree **is a real person**, and
  copying a spec verbatim would put every one of them into a vault whose entire purpose is that it
  holds none. Comments go too, being prose someone wrote.
- **A pin ending in `.md` is a NOTE, and is resolved against the note map alone.** The first cut
  tried the *folder* map first, on the name with `.md` stripped, so a pinned note whose basename
  matched a folder silently became a **folder pin** — and that is not cosmetic: a file pin moves no
  wedge, a folder pin moves one. Caught on the real vault, whose root section pins three files:
  `Inbox.md` came out as the folder `Inbox`, which floated a wedge to second on the mirror's disc
  while the real explorer had it last. The branch order is now the guard — a `.md` line never
  reaches the folder map — so the class of bug cannot be reintroduced by a lookup that happens to
  hit.
- **A line naming something not in the mirror is dropped, not passed through.** The page treats an
  unresolvable pin as ordinary wear and would carry on, but a mirror that kept real names for what
  it failed to map would be leaking the thing it cannot leak.
- **The translator reads the same grammar the page does, or a whole section vanishes.**
  github#172. It mapped `target-folder: .` and nothing else relative, so `./` and `./sub` — both
  perfectly good to `sortTarget` — came back unmappable, and with the target unresolved every
  line under them was dropped too: **four lines out of a five-section spec, counted only in
  `specDropped`**. They resolve against the note's own dir now, exactly as `sortTarget` does, and
  the same run drops 0. (`./*` was never affected: the wildcard strip leaves a bare `.`.) A
  `regexp:` target stays unmappable and still takes its section, which is right — a pattern was
  written against names the mirror deliberately does not have, so there is nothing to translate
  it into.
- **A spec is found BY ITS NAME**, so renaming it would hide it from the builder. A `sortspec`
  keeps that name; a folder note keeps its folder's mapped name, or it stops being a folder note.
  The sort plugin's own `data.json` is rewritten to point at the mirrored note, so a globally
  registered spec is found in the mirror exactly as in the source.

## Not built

Ordering taken from an Obsidian **bookmarks group**
(`bookmarksGroupToConsumeAsOrderingReference`), which that plugin also supports. It is a second
source with a second set of semantics, and the vault this feature was built for has it
configured but empty. If it is ever wanted, it belongs behind the same fallback rule as the
rest.
