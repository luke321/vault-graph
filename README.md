# Vault Graph

**Your whole vault as one disc.** Every note is a dot; every top-level folder owns a wedge
of the circle whose angle is its share of the vault. Notes fill concentric rings from the
middle outwards, best-connected first, so the best-connected notes sit near the centre and
leaves land on the rim.

The layout is **deterministic, not force-directed**. There is no simulation to settle and
no seed to get lucky with: the same vault always draws the same picture, so the shape
becomes something you can learn and recognise rather than a fresh tangle each time.

![The disc growing from the vault's first note, a note hovered, a note dragged into the hub to pin it and two more pinned by right-click and from their own detail card, the timeline scrubbed, three heatmap days hovered, a folder hidden and one soloed, a subfolder pushed out and right-clicked for its own colour, the camera panned and reset, then two folders recoloured by right-click and put back](assets/demo.webp)

Ships as an **Obsidian plugin** and as a **standalone HTML exporter** — one page, two
mounts, from the same source. The exporter writes a single self-contained offline file with
no server and no network, which is how the graph reaches a phone.

---

## What it does

One wedge per top-level folder, sized by how much of the vault it holds, filled with notes
ringed by how well-connected they are. Click a folder to hide it and the rest re-pack; hover
a note to see its links; search narrows to matching notes; scrub a date ribbon to watch the
vault grow. Follows Obsidian's theme, including a live switch.

**The full feature list, one short clip per feature, lives in
[`docs/features.md`](docs/features.md)** — the disc itself, filtering, the heatmap and
timeline, reading a note, the camera, and folder colours, each with what it does and how its
clip gets regenerated.

---

## Install the plugin

**From Obsidian** — Settings → Community plugins → Browse → "Vault Graph" → Install, then
Enable. Open it from the ribbon icon or the command palette (*Vault graph: Open the graph*).

**Manually** — download `main.js`, `manifest.json` and `styles.css` from the
[latest release](https://github.com/luke321/vault-graph/releases/latest) into
`<vault>/.obsidian/plugins/vault-graph/`, then reload plugins and enable it.

**From source** — `npm install && npm run build`, then `./scripts/install-plugin.ps1`.

It reads your vault through Obsidian's own metadata cache, so it sees the same links
Obsidian does, aliases and frontmatter links included. It builds in about a tenth of a
second on a 450-note vault. **Nothing leaves your machine** — it makes no network requests,
collects nothing, and needs no account.

**What it touches, plainly.** A graph of a whole vault has to know what is in the whole
vault, so the plugin enumerates every markdown file (`vault.getMarkdownFiles`) and reads
their frontmatter and link data from Obsidian’s own metadata cache. It reads note bodies only
to count words (`vault.cachedRead`), and it writes nothing in your vault — the one file it
writes is its own `data.json` in its plugin folder, holding the settings below. Obsidian’s
own automated review flags the enumeration, correctly — it is what the plugin is for, and
worth stating rather than leaving to be discovered.

### Settings

Settings → Community plugins → Vault Graph.

| | |
|---|---|
| **Folder colours** | One row per top-level folder, with the twelve palette slots under it. The slot the folder is **currently using** is ringed — brightly if you chose it, dimly if it is just the one its position gives it. Click a slot to hold the folder to that colour; **Auto** hands it back. Setting one folder never changes another, and two folders may share a colour — useful for saying they belong together. |
| **Folder visibility** | The eye at the start of each row sets whether that folder is shown **by default**. The legend's own eye inside the graph is the live filter for this session; this one is what the graph comes back to. |

The graph view has a gear in its top-left corner that opens this tab directly, so the
colours are reachable from the thing they colour.
| **Include notes that do not exist yet** | Wikilinks pointing at a note nobody has written. |
| **Include templates** | Notes under your template folders. |
| **Flatten month folders** | Treat `2026-08` and its siblings as one folder rather than a subfolder each. |
| **Count words** | Sizes each note by its length. The one setting that costs real I/O. |

Colours and visibility repaint the open graph immediately. The other four rebuild it,
because they change what is *in* it.

Folders are coloured from twelve slots — ten hues and two greys — handed out in folder
order and round again, so a thirteenth folder comes back to the first slot rather than
falling into a grey pile. A saved choice is a *slot*, not a colour value, so it follows
your Obsidian theme between light and dark.

Folders whose name starts with `_` are treated as archives — `_ Archives`, `_old`, scratch.
They stay in the graph, but they take no slot in the colour rotation, wear the palette's
darker grey, and start hidden. All three are defaults: pick a colour or click the eye and
your choice wins. It is a rule about folders, not files — `_scratch.md` is a note like any
other.

<sub>**Zero network calls, and greppable.** The bundled Sigma.js ships two `fetch` calls in
its image-loading path, for a node-image program this plugin never registers. They were
unreachable, and they are now removed at build time rather than explained away — so
`main.js` contains none, and `node scripts/check-network.mjs` is the gate that keeps it that
way. See [`0008-zero-network-calls`](.ai-context/decisions/0008-zero-network-calls.md).</sub>

---

## Or export a standalone page

The other half of the same source: one HTML file, openable offline on anything with a
browser.

![The standalone page](assets/screenshots/standalone-light.png)

### Getting the exporter

**Requirements: Node 18 or newer. That is the whole list.** No `npm install`, no network
access, no build tooling.

**This is not an app you run — it is a generator.** The script reads your vault once and
writes **one HTML file**. Nothing is listening afterwards; you open that file yourself, in
any browser, like any other file on your disk. Two steps, and the second one is yours.

### 1. Get it

Download the latest [**release**](../../releases/latest) — every tagged version has a
`vault-graph-<version>.zip` attached with everything needed to run, so a tag is always a
downloadable build rather than just a source snapshot — and unzip it. Or clone, if you want
the design records and the dev tooling too:

```bash
git clone https://github.com/luke321/vault-graph.git
cd vault-graph
```

### 2. Generate the file

```bash
node src/build-graph.mjs --vault "/path/to/your/vault"
```

It reads the vault, writes the HTML, prints where it went, and exits:

```
vault-graph: 449 notes, 1489 links, 0 orphans, 120 unresolved link(s)
wrote /path/to/your/vault/03 - Resources/Vault Graph/vault-graph.html (732 KB)
```

### 3. Open that file

That path in the last line **is the graph**. Open it however you open any local file —
double-click it, or:

```bash
start "path/to/vault-graph.html"      # Windows (cmd)
open "path/to/vault-graph.html"       # macOS
xdg-open "path/to/vault-graph.html"   # Linux
```

No server, no `localhost`, no watch mode, and nothing left running when the script exits.
The page is a **snapshot** of the vault as it was when you generated it: to see notes you
have added since, run step 2 again and reload the tab. (The Refresh button *inside* the
page returns to your default view and replays the intro — it cannot re-read your vault, because a
`file://` page is not allowed to.)

### The gear

Top right of the sidebar. It opens the same folder-colour picker the plugin has: one row
per top-level folder, twelve slots each — ten hues and two greys — handed out in folder
order and round again, so a thirteenth folder comes back to the first slot. The slot each
folder is currently using is ringed — brightly if you chose it, dimly if it is just the one
its position gives it, which is also what the **Auto** button beside it is reporting.
**Auto** hands a folder back to that positional slot. Setting one folder never changes
another, and two folders may share a colour — useful for saying they belong together.

Hovering a folder in the legend haloes its notes on the disc, so you can find one without
clicking anything. Clicking still pins the highlight and pushes the wedge out.

Each row also starts with an eye that sets whether that folder is shown **by default** —
the same mark the legend uses, because it is the same question about a different moment.
The legend's eye is the live filter for this session; this one is what the graph comes back
to. Folders whose name starts with `_` are archives — no slot in the colour rotation, the
palette's darker grey, and hidden until you say otherwise.

Your choices are remembered in the browser's `localStorage`, under a key scoped to the
vault name, so regenerating the file keeps them and a graph of a *different* vault gets its
own. Colours and default visibility are what is kept: highlights and the timeline still
start fresh. **Refresh** returns to those defaults rather than to "everything visible". If
the browser has site data blocked the picker still works — the choices just do not outlive
the tab.

## Read this before sharing the output

The generated HTML **contains the structure of your vault in plain text**: every note's
title, its path, its folder, its tags, its `created`/`date` frontmatter, its word count,
and the link graph between notes.

It does **not** contain note bodies. Nothing you wrote inside a note is in the file.

That distinction matters the moment you think about sharing. A screenshot is usually fine.
Handing someone the HTML hands them **a complete listing of your note titles**, which for
most vaults is more revealing than it sounds. The file is designed to live inside your own
vault and sync to your own devices; treat it as private by default.

**If you want to show the graph rather than your vault**, there are two vaults that are not
yours to show it with.

```bash
node scripts/make-demo-vault.mjs --out ./demo-vault        # invented, fixed, two dense years
node scripts/make-mirror-vault.mjs --vault "/path/to/your/vault" --out ./mirror-vault
```

The **demo vault** is invented from end to end: eighteen top-level folders, nesting five deep,
and two years of dates dense in every month. It is the same on every machine, which is what
makes a screenshot comparable and a recording reproducible. Every screenshot and the demo clip
in this README were made from it.

The **mirror** is for bug reports. It reproduces one real vault's shape and none of its
content — same folder tree, same note count per folder, same `created` dates, same word
counts, and the whole link graph rewritten between renamed notes, so it builds to the same
numbers yours does. If the layout misbehaves on your vault, the shape *is* the report, and a
generic fixture cannot reproduce a shape it does not have.

## Which vault

You can skip `--vault` entirely. Resolution order, first match wins:

| | source |
|---|---|
| 1 | `--vault <path>` — explicit, always wins |
| 2 | `VAULT_GRAPH_VAULT` — per-machine override without editing anything |
| 3 | `OBSIDIAN_VAULT` — the machine-wide answer other tooling can share |
| 4 | `--vault-name <name>` — pick from Obsidian's registry by folder name |
| 5 | **Obsidian's own registry** — the only entry, or the one currently open |
| 6 | walk up for `.obsidian` — so dropping this folder inside a vault works |

With one registered vault, `node src/build-graph.mjs` on its own works. With several and
none unambiguously open, it lists them and stops rather than guessing. Errors name which
source supplied a bad path.

Registry: `%APPDATA%\obsidian\obsidian.json` (Windows),
`~/Library/Application Support/obsidian/obsidian.json` (macOS),
`~/.config/obsidian/obsidian.json` (Linux).

## Where the output goes

```
<this repo>/                              source: template, build script, vendored libs
  └─ .ai-context/                         architecture + decision records
<vault>/03 - Resources/Vault Graph/       ...or anywhere: --out FILE
  ├─ vault-graph.html                     build output, opened directly in a browser
  └─ Vault Graph.md                       optional stub note so [[Vault Graph]] resolves
```

That default path is the **PARA convention of the vault this was written for**, not a
requirement — `--out` puts the file wherever you like:

```bash
node src/build-graph.mjs --out ~/Desktop/my-vault.html
```

Writing it *into* the vault is the default for one reason: the vault already syncs to your
phone and your other machines, and one self-contained file rides along for free.

## Flags

| Flag | Effect |
|---|---|
| `--vault PATH` | which vault to read |
| `--vault-name NAME` | pick a registered vault by folder name |
| `--out FILE` | write somewhere else |
| `--ghosts` | also show `[[links]]` pointing at notes that don't exist yet |
| `--templates` | include your template notes (off by default: their placeholder links are fake edges) |
| `--flat-months` | fold `2026-08` month folders into their parent instead of treating them as a level |
| `--no-nav` | ignore the daily-note prev/next nav line |

## Platform notes

**The builder is cross-platform** — plain Node, no shell-outs. The `scripts/*.ps1` helpers
are Windows-only conveniences, not requirements:

| script | what it does | elsewhere |
|---|---|---|
| `refresh-graph.ps1` | rebuild *and* open | `node src/build-graph.mjs && open <path>` |
| `record-demo.ps1` | record the demo to mp4 | not ported — needs `avfoundation` / `x11grab` |
| `make-hero.ps1` | encode a take as the README hero (animated WebP, 30fps, 700px) | works anywhere ffmpeg does, if you port the wrapper |
| `make-logo.ps1` | rebuild the logo mask from source art | not ported; `assets/` is prebuilt |

`scripts/smoke.mjs`, `scripts/demo.mjs` and `scripts/make-test-vault.mjs` are Node and
should work anywhere Chrome does, though only Windows has been exercised.

## How your vault is interpreted

Nothing about a particular vault is hardcoded, but a few conventions are **detected** — and
knowing them explains the output:

- **Top-level folders become wedges**, angle proportional to share. Any folder scheme
  works; PARA is just what it was built against.
- **One level of subfolders is drawn**, as tints of the parent's colour. The three largest
  get their own tint; the rest share a pooled one.
- **Date-named folders** (`2026`, `2026-06`, `2026-Q3`, `2026-W34`) say *when* a note was
  filed rather than what it is — kept at the first level, ignored deeper down.
- **Templates and daily notes come from your `.obsidian` config** (`templates.json`,
  `daily-notes.json`, Templater's settings), not from folder names. Rename them freely.
- **Links resolve the way Obsidian resolves them** — basename, then alias, then full path —
  read from **both** body and frontmatter, so `person: "[[Ada Lovelace]]"` counts. Fenced
  code blocks are skipped so Dataview queries don't invent edges.
- **`created` frontmatter drives the timeline and the heatmap**, falling back to `date`. A
  note with neither is always present rather than stranded at one end of the timeline.
- The daily-note `[[prev]] | [[next]]` nav line **does** count as links; `--no-nav` strips
  it.

A vault with no subfolders, no dates and no aliases still renders — you just get a simpler
disc.

## The page is a snapshot

**It cannot regenerate itself.** The vault is baked in at build time; there is no server,
no network, and `fetch()` is blocked on `file://`, so nothing in the browser can walk your
vault. Re-run the build to make it current.

**The in-page Refresh button is not that.** It returns to your defaults — clearing
highlights and the timeline, and putting each folder back to the visibility set in the
gear — and replays the intro.
If you have just rebuilt, reload the browser tab.

## Optional: the scripted demo

`?demo` on the URL arms a walkthrough that drives the real controls over Chrome's DevTools
protocol. The storyboard is `demoMode()` in `src/page.js` — append beats to it and
nothing else needs changing.

```powershell
.\scripts\record-demo.ps1        # needs ffmpeg: winget install Gyan.FFmpeg
```

The visible cursor in a recording (`--cursor`, which the recorder passes) is drawn inside
the page and moved by eval, in step with the same input dispatched over CDP — not the
real OS pointer. It does not touch your mouse; see
[`.ai-context/decisions/0007`](.ai-context/decisions/0007-the-demo-drives-real-input.md)
for why an earlier version did and had to be replaced.

## Optional: the invariant suite

```bash
node scripts/smoke.mjs
```

Builds to a temp file, drives a real Chrome, and checks 17 measured properties of the
layout — plan parity, the resting lattice, the heatmap's tiling, the hover and highlight
ramps — printing the number it measured for each.

With no arguments it checks **two vault shapes**, one after the other: a ~450-note mirror of
a real vault and a 10,000-note synthetic, generating either on demand. That is not
belt-and-braces — a small vault and a large one take different branches through the ring
balancer and the gap scaling, and a change that passes at 450 notes can still break the band
split at 10,000. The mirror is skipped with a notice when there is no real vault to mirror,
never silently.

`--vault PATH` is repeatable and overrides that pair; `--url FILE` checks an already-built
page.

```bash
node scripts/smoke.mjs --vault ./test-vault --vault ./demo-vault
```

Exits non-zero, so it can gate a push:

```bash
git config core.hooksPath .githooks
```

`SKIP_SMOKE=1 git push` skips it.

## Optional: a test vault

Your vault is one shape. To develop against others:

```bash
node scripts/make-test-vault.mjs --notes 5000
node src/build-graph.mjs --vault ./test-vault --out ./test-vault/graph.html
```

Generates a deterministic synthetic vault — more top-level folders than there are colour
slots, sliver folders beside a dominant one, five levels of nesting, date-named folders,
notes with no frontmatter and no links. `test-vault/` is gitignored.

## Troubleshooting

**"several vaults registered"** — pass `--vault` or `--vault-name`.

**Blank page, or stuck on "Laying out graph…"** — open the browser console; the whole app
is one inlined script, so a thrown error there is the cause. Serving over http rather than
`file://` makes some browser tooling behave: `python -m http.server 8765`.

**The graph looks nothing like my folder structure** — that is the point rather than a bug.
On the vault this was built for, only ~9% of links stay inside a single top-level folder.
The wedges are the filing system; the edges are the actual structure.

**"N links point at notes that do not exist"** — wikilinks whose target is missing.
`--ghosts` renders them, so you can see what your vault reaches for.

## Files

**The page, in four parts.** One source, two mounts: the exporter wraps them in a document,
the plugin puts them in an Obsidian view.

| | |
|---|---|
| `src/page.html` | the markup |
| `src/page.css` | every rule scoped under `.vault-graph`, so it can be dropped into another document |
| `src/page.js` | `mountVaultGraph(root, data, deps)` — layout, render, interaction |
| `src/shell.html` | the standalone document that wraps the three, and its bootstrap |

**The two things built from it.**

| | |
|---|---|
| `src/build-graph.mjs` | crawls the vault, resolves links, emits one HTML file |
| `plugin/main.js` | the Obsidian plugin: reads the metadata cache, mounts the page in a view |
| `manifest.json` | the plugin manifest, at the repo root because Obsidian requires it there |
| `vendor/` | Sigma.js + graphology, committed rather than installed |

**Tooling.**

| | |
|---|---|
| `scripts/build-plugin.mjs` | bundles the plugin into `main.js` + `styles.css` (`npm run build`) |
| `scripts/install-plugin.ps1` | copies exactly the three files Obsidian installs, and nothing else |
| `scripts/smoke.mjs` | the invariant suite, over both vault shapes |
| `scripts/check-scope.mjs` | asserts the page cannot style or be styled by its host |
| `scripts/check-pii.mjs` | refuses to publish other people's names; no skip flag |
| `scripts/check-network.mjs` | asserts nothing shipped can make a request; no skip flag |
| `scripts/refresh-check.mjs` | drives a real Obsidian: write a note, click Refresh, is it there? |
| `scripts/make-demo-vault.mjs` | the demo vault: invented, fixed, two dense years |
| `scripts/make-mirror-vault.mjs` | a structural mirror of a real vault, with none of its content |
| `scripts/make-test-vault.mjs` | a synthetic vault, deliberately awkward |
| `scripts/shoot.mjs` | screenshots the page at rest, for comparing two commits |
| `scripts/record-demo.ps1`, `make-hero.ps1` | the demo recording and its encode |
| `.github/workflows/branch-policy.yml` | main only accepts pull requests from develop |
| `.ai-context/` | architecture, invariants, and one record per decision |
| `CHANGELOG.md` | what shipped, per release |

## Licence

MIT — see [LICENSE](LICENSE). The bundled libraries in `vendor/` are MIT too and are
inlined into every build; their notices are in [`vendor/NOTICE.md`](vendor/NOTICE.md) and
must be preserved in redistributions.

## Design notes

Rationale lives in [`.ai-context/`](.ai-context/) — architecture, the measured invariants
with the command that checks each one, and one record per decision that cost something to
learn. **Read the relevant one before changing that part of the disc**: several constants
look arbitrary and are not.

| | |
|---|---|
| [`architecture.md`](.ai-context/architecture.md) | the four stages, and where each decision is enforced |
| [`invariants.md`](.ai-context/invariants.md) | what must not regress, and the command that checks it |
| [`decisions/`](.ai-context/decisions/) | choices with alternatives weighed — why *not* the other thing |
| [`design/`](.ai-context/design/) | how each part actually works, and the measurements behind it |
| [`changelog-detail.md`](.ai-context/changelog-detail.md) | every change with its before/after numbers |

The recurring failure mode here is reasoning about the code instead of measuring it. Serve
the built page and use `__vg.checkPlanParity()`, `__vg.probe()` — or just run
`scripts/smoke.mjs`.
