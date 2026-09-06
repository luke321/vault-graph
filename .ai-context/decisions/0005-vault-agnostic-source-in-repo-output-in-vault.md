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
