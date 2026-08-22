# Spike: the disc as a native Obsidian plugin

**Status: the spike succeeded, and its own approach is a dead end.** The page runs inside
Obsidian and Obsidian's index can feed it. The iframe that made proving that cheap is the
one thing the real port should not keep.

Everything below is a number this spike measured, not a judgement about the code. Run it
yourself:

```powershell
./scripts/install-spike.ps1 -TestVault
node scripts/spike-check.mjs
```

Obsidian 1.x on Windows, a 12-note throwaway vault (11 after templates), one run per
line unless stated.

## What the spike had to answer

| | Answer |
|---|---|
| 1. Does `template.html` run unchanged inside Obsidian? | **Yes.** Verbatim, both mount strategies, no CSP obstacle. |
| 2. Can Obsidian's own index produce `window.VAULT_DATA`? | **Yes, in 12ms** -- with one gap that changes the port plan. |
| 3. Can the invariant suite still reach `__vg`? | **Only if the page is not sandboxed.** |

## 1. The page runs

`srcdoc` with `sandbox="allow-scripts allow-popups"` mounts and boots:

| | |
|---|---|
| assembled page | 567 KB (data + both libraries + logo, inlined at view time) |
| `__vg` present | yes |
| canvases painted | 7 |
| boot after document end | 103 ms, 115 ms |
| `checkPlanParity()` at rest | `parityOK: true` |

Nothing in the template needed changing. The three seams `build-graph.mjs` already
uses -- `<!--LIBS-->`, `<!--ASSETS-->`, `<!--DATA-->` -- were the entire integration, which
is why this spike cost a day and not a week.

One thing had to be handed across the boundary by hand: the template pins
`data-theme="dark"` on `<html>`, and an iframe inherits nothing from Obsidian, so the host
rewrites that attribute from `document.body.classList`. An in-DOM port gets the theme for
free.

## 2. The adapter works, and is not the expensive part

`getMarkdownFiles` + `getFileCache` + `resolvedLinks` + `unresolvedLinks` + `stat.mtime`,
with the taxonomy functions ported line-for-line from `build-graph.mjs` so that any
difference in the output is a difference in the *source*:

| phase | 11 notes |
|---|---|
| index (files, frontmatter, tags, types) | 12 ms |
| edges (`resolvedLinks` + `unresolvedLinks`) | 0 ms |
| words (`cachedRead` per note) | 0 ms |
| **total** | **12 ms** |

Config detection survived intact: `templateDirs: ["Templates"]` and
`dailyDir: "04 - Daily Notes"` were read out of the vault's own config through
`Vault#configDir`, not a literal `.obsidian` path.

Edge count came out exactly as hand-counted from the fixture (12 edges, 1 orphan), which
is the check that the whole derivation is wired right.

### FINDING: `resolvedLinks` does not resolve aliases

The fixture links `[[The Beta Note]]` from `Home.md`. That is an alias of
`03 - Resources/Beta.md` and of nothing else. Measured:

```
aliasesAsParsed:        ["The Beta Note"]      <- Obsidian parsed the alias fine
getFirstLinkpathDest:   null
inResolvedLinks:        false
inUnresolvedLinks:      true                   <- counted as a GHOST
```

So the frontmatter is read correctly and the link still does not resolve through either
`resolvedLinks` or `getFirstLinkpathDest`. **The adapter as written loses every
alias-resolved edge the crawl finds, and reports each one as an unresolved link.**

`build-graph.mjs` already has the fix -- its `byKey` table indexes basename, path, and
every alias -- so the port keeps that table rather than deleting it, and consults it
before believing `unresolvedLinks`.

Two things to settle before trusting this:

- **Confirm it on the real vault.** 120 of the 449-note vault's unresolved links are
  currently unexplained; if a chunk of them are aliases, this is the reason, and the
  builder and the plugin will disagree by exactly that many edges.
- It was measured on a vault created seconds before Obsidian first opened it. A slow
  alias index is an unlikely explanation given the check ran ~15s in on 12 files, but it
  has not been ruled out.

### FINDING: fenced links are already excluded

The 2026-08-22 fixture note carries `[[Orphan]]` inside a ```` ```dataview ```` fence.
`Orphan.md` came back with **degree 0** and no inbound link from anywhere.

Obsidian's cache does not index links inside code fences, so `stripCode()` -- the function
that exists because Dataview queries were inventing edges -- is **dead weight in a
plugin**. One of the few places the port gets to delete code rather than move it.

## 3. The sandbox costs the harness its reach

This is what kills the iframe for the real port.

| | sandboxed `srcdoc` | unsandboxed `blob:` |
|---|---|---|
| page boots | yes | yes |
| host JS can read `contentWindow.__vg` | **no** -- cross-origin | yes |
| `cdp.mjs` can evaluate in the page | **no** | yes |
| page isolated from the app | yes | **no** |

The sandboxed frame's failure has a specific cause, and the target list names it:

```
CDP targets: [ {page, app://obsidian.md/index.html},
               {iframe, about:srcdoc},          <- its own TARGET, not a child frame
               {worker}, {worker} ]
```

`Page.getFrameTree` reports **zero** child frames. An opaque-origin frame is
site-isolated into its own process, so it is a separate CDP target; `cdp.mjs` speaks one
session and has no `sessionId` support, so it cannot address one. `Runtime.evaluate` with
the announced `contextId` fails with *"Cannot find context with specified id"*.

The spike works around this with a `postMessage` probe channel -- the host asks the page
to run `checkPlanParity()` and the page posts the result back. It works
(`parityOK: true`), and it is the wrong thing to build: it means every invariant in
`.ai-context/invariants.md` needs a message type, forever.

**Therefore: the real port mounts in the DOM, with no frame.** Both problems disappear at
once -- `__vg` is in the same window as everything else, `smoke.mjs` keeps working with no
new machinery, and the theme comes for free. The cost is the one the spike deliberately
deferred: `template.html` has to be split into markup + `styles.css` + a view module, and
its 422 lines of `:root` tokens have to stop fighting Obsidian's.

## Harness facts worth not rediscovering

- **A fresh `--user-data-dir` opens the vault picker, not a vault.** `obsidian://open?path=`
  handed to a *starting* instance is dropped. The picker is a page target like any other,
  so CDP attaches happily and the first eval fails with `app is not defined` -- which reads
  as a CDP problem and is not one. `spike-check.mjs` seeds `obsidian.json` in the profile
  instead, which is the same registry `build-graph.mjs` reads.
- **Seeding `community-plugins.json` does not enable a plugin.** A vault Obsidian has never
  opened still starts in Restricted Mode, so the plugin sits on disk unloaded. The harness
  calls `app.plugins.setEnable(true)` then `enablePluginAndSave(id)` -- internal API, fine
  for a throwaway vault, never for shipped plugin code.
- **A separate `--user-data-dir` is mandatory**, not hygiene: Obsidian is single-instance,
  so launched against a profile already in use the new process hands off and exits, and the
  debug port never opens.
- **Parity is a statement about the page at rest.** Probing 4s after opening returned
  `parityOK: false`, correctly -- the reveal cascade was mid-flight. The wait is 9s.

## Not tested here

Named so a green run is not mistaken for proof:

- **Live updates and the lock policy.** The spike builds once, on view open. `bandLock`,
  `geomLock` and the normalisation box are still derived once from the whole vault, exactly
  as in the snapshot. A plugin lives in a vault where `metadataCache.on("resolved")` fires
  constantly, and re-deriving the locks per event puts a teleport on screen. This is the
  real design work and none of it is done.
- **Scale.** 11 notes. Nothing here says what `cachedRead` for `words` costs at 10k notes,
  which is the only phase that touches disk.
- **Arbitrary vault shapes.** The fixture is deliberately awkward (flat root note, nested
  named subfolders, a month bucket, an alias, a dangling link, a fenced link) but it is
  still 11 notes in a PARA-ish layout. `scripts/make-test-vault.mjs` on `main` is the tool
  for this.
- **Mobile.** `isDesktopOnly: false` is asserted in the manifest and never exercised.
- **The guideline lint.** `eslint-plugin-obsidianmd` has not been run against `main.js`.
  Known offenders inherited from the template: 9 `innerHTML` (all already `esc()`'d),
  13 inline `style=` attributes, 33 `.style.x =` assignments of which the static ones need
  to become classes.
