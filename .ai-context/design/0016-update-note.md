# 0016 — The update note

**Date** 2026-09-11 · **Status** accepted · **Issue** github#83

Obsidian swaps `main.js` under a user and says nothing. Whatever a release shipped is discoverable
only by someone who goes to the releases page, so 2.1.0's phone layout and hop trail were never
announced to anyone running the plugin. This is the once-per-release strip that says what changed.

## What it is

A dismissible strip **above the disc, inside the view**: a heading (*What's new in Vault Graph 2.6*),
the **chain of releases** the user has not seen — `2.1.0 – 2.2.0 – 2.3.0 – 2.4.0 – 2.5.0`, oldest
first, each linking its own release page and carrying its name on hover — the feature gallery, the
note's bullets, and one button, *Got it*. While it is up, the **controls this release added pulse**
in the view behind it. It sits where the change is visible, it carries the links to the clips
instead of the clips, and dismissing it is the write that marks the version seen.

Not a `Notice` (it expires on a timer and is too small for three lines), not a modal (the wrong first
impression of a graph plugin), and not fetched (`decisions/0008` — nothing shipped reaches the
network). The standalone export never shows it: a one-file HTML page has no update to notice.

## Where the text comes from

`plugin/whats-new.md`, one hand-written file the build inlines through the `raw:` loader:

```
# 2.5.0
> vg-dim
- Cut the disc by tag instead of by folder: a Folders / Tags switch above the group list.
```

A `# <version>` heading, then up to five `- ` bullets of plain text and at most one `> ` line
naming up to four control ids; blank lines and HTML comments are allowed between.
`parseNote()` in `plugin/update-note.mjs` is the whole grammar, and a file with **any** problem is
no note at all: `scripts/build-plugin.mjs` refuses to build, and were one to reach the plugin
anyway it would show nothing rather than something half-parsed.

**Why one file, overwritten, and not the CHANGELOG section.** The CHANGELOG is written for someone
reading history: it runs long, it carries commit links, and its voice is the repository's. The strip
wants three to five lines for someone whose plugin just changed under them — what they can now do,
not how it was built. And one file means the bundle carries exactly one note, the current one; the
history is in git. A changelog browser is out of scope by the issue.

**Why text only, and why the caps.** A release ships three files and nothing else reaches the user's
machine, so any picture would be a data URI inside `main.js`, downloaded by every user on every
update, forever, for a note shown once — the smallest clip in `assets/features/` would add a third
to the bundle. So: `NOTE_MAX_BYTES` 4096, `NOTE_MAX_LINES` 5, `NOTE_MAX_LINE_CHARS` 160, no `data:`
URI, no tag (`<` followed by a letter, `!` or `/`). The links are built by the host from the version (`RELEASE_URL`, `GALLERY_URL` in
`plugin/main.js`), so the file cannot point anywhere. Measured: the first note is 650 bytes, and the
bundle grew from 472,726 to 482,379 bytes with the whole feature in it (+9,653, 2.0%), the
25-release chain included.

## The chain of releases

A user who skipped three releases is not owed one note; they are owed the shape of what they
missed. So the heading carries every `x.y.0` **after** the stored `lastSeenVersion` and **up to**
the note's own version, oldest first, each an `<a>` to its own release page with the release's name
as its `title`: *2.1.0 – 2.2.0 – 2.3.0 – 2.4.0 – 2.5.0*. Patches are left out — they are fixes, and
`decideNote()` has already decided they are not worth an interruption. Above `CHAIN_MAX` (8) the
oldest are replaced by one `…` linking the releases list, so a very stale install gets a row, not a
paragraph. With nothing stored, or a stored version that is not semver, the chain is the note's
version alone.

**The list is the CHANGELOG's, read at build time.** `scripts/build-plugin.mjs` resolves the import
`vg:releases` by running `parseReleases()` over `CHANGELOG.md` and inlining the result — every
`## <version>` heading, with the quoted release name where the heading carries one. So the chain
cannot disagree with what was published (`release.ps1` and `release.yml` both refuse a version with
no CHANGELOG section), nothing is fetched, and the whole list of 25 releases costs under a kilobyte.
The `v`-prefixed tags up to `v1.4.4` parse; `v1.0` is not semver and is skipped, as is *Versioning*.

## The controls a release added

A release that adds a control can name it: `> vg-dim` points at an id in `src/page.html`, and while
the strip is up that element carries `.vg-new`, a 1.9 s box-shadow pulse in the host's accent
(`plugin/styles.css`; a static ring under `prefers-reduced-motion`). Dismissing the note removes the
class in every open graph leaf, and a view opened afterwards never gets it, because `markNew()` reads
`pendingNote`, which dismissal clears.

**Ids, and only ids, because that is what can be checked.** `POINTS_MAX` is 4, each must match
`vg-[a-z0-9-]+`, and the build fails when one is not an `id="…"` in `src/page.html` — so a control
renamed out from under a note is a failed build, not a release that silently points at nothing. The
unit is therefore a control with an id: for 2.5.0 that is `vg-dim`, the whole Folders/Tags switch,
which is exactly what that release added. A release that adds no control of its own leaves the line
out, and nothing pulses.

## When it shows

`decideNote()` in `plugin/update-note.mjs`, run once in `onload()`, from four inputs: the installed
version (`this.manifest.version`), the stored `lastSeenVersion`, whether a `data.json` existed at
all, and the parsed note.

| Situation | Shown | Written now |
|---|---|---|
| no `data.json` — a fresh install | no | installed version |
| `data.json` without `lastSeenVersion` — an upgrade from before this existed | yes | on dismiss |
| MINOR or MAJOR bump, note is for the installed MAJOR.MINOR | yes | on dismiss |
| MINOR or MAJOR bump, note is for some other version | no | installed version |
| PATCH bump | no | installed version |
| already seen | no | nothing |
| downgrade, or an unreadable stored version | no | installed version |

Three of those were decisions rather than consequences, taken with Lukas on 2026-09-11:

- **Seen on dismiss, not on show.** The issue's acceptance said reopening the view must not show it
  again, and its body said dismissing is the write; those disagree when the view is closed without
  dismissing. Dismiss wins: closing the view is not reading it, so the strip survives reopens and
  restarts until *Got it*.
- **A fresh install is `data.json` absent, not `lastSeenVersion` absent.** The release that ships this
  feature is the first one for which nobody has a stored version. Reading every missing key as fresh
  would make that release the one release the feature cannot announce. A `data.json` that exists
  without the key is a vault that ran an older version and changed a setting; one that never changed a
  setting has no file and reads as fresh, a one-time ambiguity accepted. After this release every
  load records the version, so the split matters once.
- **One `data.json`, several devices.** Obsidian syncs it, so the first device to dismiss marks the
  version seen for all of them. Accepted as a known limit rather than keyed per device.

Two more that fell out of the grammar:

- **The note must be for the installed MAJOR.MINOR.** A PATCH leaves the file alone by design, so a
  user going 2.5.0 → 2.6.1 still gets the 2.6.0 note, and its release link goes to 2.6.0, where the
  clips are. A MINOR whose author forgot the file shows nothing — never a stale note — and
  `scripts/release.ps1` refuses to cut an `x.y.0` whose note is for another version, beside its
  CHANGELOG guard.
- **Nothing is written when nothing changed.** An already-seen version does not touch `data.json`.
- **Recording writes the marker, not the defaults.** `recordVersion()` merges `lastSeenVersion` onto
  what `data.json` held and writes that — a vault that never changed a setting keeps following the
  plugin's defaults as they move, instead of having every default of the day frozen onto disk on the
  first load after this feature.

## Where it sits, and why the page does not know

The strip is created by the host (`VaultGraphView.mountNote()`) in the view's content element
**before** the page root, and `.vault-graph-view` is a flex column: the strip takes its own height,
the page root flexes into the rest. `src/page.js` is untouched. The page's resize observer on its
root already handles a root that changes height (`refreshSizeScale`, `placeLogo`, `syncCanvasTop`),
and the camera is normalised, so the disc re-centres in whatever the canvas is.

Measured before writing a line, on the demo fixture in Chrome, with a 40 px strip inserted above the
root: canvas 731 → 691 → 731 px, camera at (0.5, 0.5) throughout, ratio 1.04 unchanged; an explicit
`fit()` after the change differed by 0.6%. `--vg-canvas-top` stayed at 230 px in every state, because
it is measured inside the root and the strip is outside it. So dismissing re-fits by construction —
the acceptance's "re-fits the disc rather than pushing it" — with no call into the page. The
harness (`scripts/update-note-check.mjs`) asserts the canvas takes back exactly the strip's height
and the camera stays centred, on real Obsidian.

## What checks it

- `scripts/update-note-selftest.mjs` — the decision table above and the grammar, no Obsidian; the
  pre-push hook and `release.yml` run it.
- `scripts/build-plugin.mjs` — refuses a note the plugin could not show, on every build.
- `scripts/update-note-check.mjs` — real Obsidian over CDP: seeds `data.json` seven ways, reloads
  the plugin with the manifest patched to each installed version, opens the view, and reads back the
  strip, the chain against `releaseChain()`'s own answer, the links, the bullets, the written
  version, the canvas height, the camera, `--vg-canvas-top`, and the pulse on a pointed control
  before and after dismissal; screenshots the strip up, dismissed, and with a chain.
- `scripts/check-network.mjs` — the note file and the module are in its source list.

## Release procedure

A MINOR or MAJOR rewrites `plugin/whats-new.md` on the release branch beside the CHANGELOG entry
(`releasing.md`, step 3). A PATCH leaves it. `release.ps1` enforces the first, and `release.yml`
enforces it again at the tag, where a hand-pushed tag would otherwise slip past.
