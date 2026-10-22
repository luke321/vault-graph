# AGENTS.md

**`CLAUDE.md` is the brief — read it first and treat it as the single source.** This file exists
so an agent that looks for `AGENTS.md` by convention finds its way there instead of guessing, and
it deliberately does not restate the laws: two copies of a rule become two different rules.

Five things are worth knowing before you touch anything, all expanded in `CLAUDE.md`:

- **Measure, don't reason.** The recurring failure here is arguing about the code instead of
  driving it: serve the page, drive it, read the numbers. `node scripts/smoke.mjs --only
  "<substring>"` is the iteration loop.
- **The harnesses take no lock of their own.** When several runs share one machine, an optional
  harness hook configured outside the repo (`VAULT_GRAPH_HARNESS_HOOK`, or
  `git config vaultgraph.harnessHook`) holds a screen or the fixture store for them and names the
  monitor a window goes on; `node scripts/harness-hook.mjs status` says who holds what. With none
  configured, nothing is held and nothing waits. The contract is `.ai-context/harness-hook.md`.
  Screenshots over CDP (`shoot.mjs`) need nothing, but pass your own `--port`.
- **A vault Obsidian has not been told to trust opens in restricted mode.** A fixture or generated vault puts
  up "Trust author and enable plugins?" on first open, and until it is confirmed the plugin does
  not load at all -- which reads as a broken plugin rather than as an unconfirmed dialog. Over
  CDP, `app.plugins.setEnable(true)` then `enablePluginAndSave(id)`; never judge the plugin before
  `getPlugin(id)` is truthy.
- **Never serve Chrome unlabeled.** Any page you open in Chrome from this worktree —
  `smoke.mjs`, `shoot.mjs`, a manual review build — carries its own top-left title as
  `<worktree/feature> — <what it's showing>`, e.g. `tag-grouping — demo vault`. Patch
  `window.VAULT_DATA`'s `vault` field in the built HTML, not the product.
- **`git push`, merging into `develop`, and a full-suite run are each a separate ask, every
  time.** See `CLAUDE.md`'s branch-policy bullet for who may do which.

**This repo is public, so both this file and `CLAUDE.md` stay machine-agnostic.** Absolute paths,
session identity and naming, the session manager's own commands, which display a harness seizes,
and the maintainer's personal workflow live in an untracked `CLAUDE.local.md`. If that file is
present, read it too — it is the other half of the brief on this machine. If it is absent you are
on a clone, that is normal, and nothing above depends on it.

`.ai-context/README.md` maps the design records; `.ai-context/code-map.md` and `code-index.md` are
generated and let you jump to a line range instead of reading an 8,700-line file top to bottom.
