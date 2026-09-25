# 0005 — Nothing about a vault is hardcoded; source in repo, output in vault

**Date** 2026-08-22 · **Status** accepted

## Nothing about a vault is hardcoded

The build script must not know a folder name, a number, or a depth.

It used to. `SKIP_DIRS.add("05 - Templates")` excluded the templates folder by literal
name, and that skip **matched nothing** the moment the vault was renumbered — silently,
producing a graph that quietly mistyped every template as an ordinary note. It would also
never have worked on anyone else's vault.

**Decision.** Read the answer from the vault's own `.obsidian` config: `templates.json`
for the templates folder, Templater's settings if present, `daily-notes.json` for daily
notes. Walk the folder tree to whatever depth it actually has, with no level count
anywhere. Resolve `[[wikilinks]]` the way Obsidian does — basename, then alias, then full
path, from body *and* frontmatter, skipping fenced code blocks so Dataview queries don't
invent edges.

The one remaining literal was the output path `03 - Resources/Vault Graph/`, a *default*
overridable with `--out` — and it went the same way as the templates folder (github#64,
2026-09-05): the folder pair stopped existing in the vault it was written for, and
`writeFileSync` creates no directories, so the documented one-call launch failed with
`ENOENT` on that vault and on every vault that did not happen to contain it. The default is
now the vault's **root**, `<vault>/vault-graph.html` — the one folder every vault has. A
dot-folder such as `.obsidian/plugins/…` was the other candidate and is ruled out below: it
does not sync.

## Source in the repo, output in the vault

The tool started in `.vault-graph/`, moved to `03 - Resources/Vault Graph/` because
**dot-folders do not sync** so the graph never reached the other devices, and on
2026-08-22 the source moved out to `C:\git-personal\vault-graph` — while the *output*
stayed in the vault.

**Why split them.** They want opposite things:

- The **source** wants version control. Reconstructing history from a hand-written
  changelog is what let the same fixes be undone and redone repeatedly; three separate
  regressions on 2026-08-22 were all "this was already fixed once."
- The **output** wants to be in the vault. It is one self-contained HTML file, and the
  vault is what syncs to every device.

**Consequence that had to be handled: which vault?** The script located the vault by
walking up for `.obsidian`, which throws the moment the source lives outside one. A
hardcoded default replaced it for about an hour and was wrong for the same reason
hardcoding anything here is wrong — **the same vault sits on a different drive, path and
user profile on each of the two machines**, so a default is wrong on one of them and
`refresh-graph.ps1` would simply have failed there.

The answer is the same one the rest of the script already uses: *ask Obsidian.* It keeps
a registry of every vault it knows, with absolute paths and which is open, at
`%APPDATA%\obsidian\obsidian.json` (`~/Library/Application Support/obsidian/` on macOS,
`~/.config/obsidian/` on Linux). Resolution order:

1. `--vault <path>` — explicit, always wins
2. `VAULT_GRAPH_VAULT` — per-machine override without editing anything
3. `--vault-name <name>` — pick from the registry by folder name
4. the registry — the only entry, or the one currently open
5. walk up for `.obsidian` — so dropping the folder inside a vault still works

With several registered and none unambiguously open it lists them and stops rather than
guessing. `refresh-graph.ps1` holds **no** default of its own and does not compute the
output path either — it reads the builder's own `wrote <path>` line — so each question has
exactly one implementation.

**Consequence left in the vault.** `Vault Graph.md` was wikilinked from six notes. A stub
note stays behind at the old path pointing at the repo, so `[[Vault Graph]]` still
resolves rather than becoming six broken links.

## Repo layout

```
src/        build-graph.mjs, template.html      the actual program
vendor/     sigma, graphology                   third-party, inlined at build time
assets/     favicon.png, logo-mask.png          inlined as data URIs
  source/   the large originals                 inputs to scripts/make-logo.ps1
scripts/    refresh-graph.ps1, make-logo.ps1    entry points
.ai-context/                                    architecture, invariants, these records
```

`vendor/` rather than `lib/` because the signal that matters for those two files is "not
ours, don't edit, don't review — updating means dropping in a new release." It is also
what keeps this a zero-`npm install` project: no package manager, node built-ins only.

## Superseded in part, 2026-09-14 — the repo layout above, not the decision

The decision holds unchanged: nothing about a vault is hardcoded, the source lives in the
repo, the output goes in the vault. Three details in the *layout block* have since moved, and
it is left as written rather than edited so that what 2026-08-22 actually looked like stays
legible.

| Then | Now |
|---|---|
| `src/ build-graph.mjs, template.html` | `template.html` became `shell.html` + `page.css` + `page.html` + `page.js`, all under `src/`, and `src/engine/` holds the TypeScript store and renderer |
| `vendor/ sigma, graphology` | Gone. Both bundles were replaced by our own engine in github#58 — `decisions/0012` |
| "a zero-`npm install` project: no package manager, node built-ins only" | No longer true, of any of it. The gates need eslint and tsc, `.githooks/pre-push` **fails closed** without `node_modules` rather than skipping lint, and the exporter itself now imports esbuild to bundle `src/engine` — so even `build-graph.mjs` no longer runs on a bare Node |

**The link-resolution sentence in the Decision block above is also out of date**, and it is
the one worth flagging rather than leaving for a reader to trip on. "Resolve `[[wikilinks]]`
the way Obsidian does — basename, then alias, then full path" describes the order github#141
reversed: it is now `<source folder>/<dest>` exact, then vault-relative exact, then the
ambiguous basename/alias index, and the first two read a separate map so a path can never
resolve to an unrelated basename. Reading body *and* frontmatter and skipping fenced code
blocks is unchanged. The rules are shared by both producers in `src/links.mjs`, and the one
deliberate divergence from Obsidian is named in `invariants.md` under *Link resolution*.

Vault location has also grown from two routes to four: explicit (`--vault`,
`VAULT_GRAPH_VAULT`, `OBSIDIAN_VAULT`), Obsidian's own `obsidian.json` registry
(`--vault-name`, the sole known vault, or the sole open one), then walking up. Every one of
them still refuses a directory with no `.obsidian` in it, which is the actual decision here.

Current layout: `architecture.md`.
