# AGENTS.md

**`CLAUDE.md` is the brief — read it first and treat it as the single source.** This file exists
so an agent that looks for `AGENTS.md` by convention finds its way there instead of guessing, and
it deliberately does not restate the laws: two copies of a rule become two different rules.

Five things are worth knowing before you touch anything, all expanded in `CLAUDE.md`:

- **Measure, don't reason.** The recurring failure here is arguing about the code instead of
  driving it: serve the page, drive it, read the numbers. `node scripts/smoke.mjs --only
  "<substring>"` is the iteration loop.
- **Two things may not run twice at once**, and they are different resources. A **screen** —
  `record-demo.ps1` grabs a region of the desktop, and spike tests and the suite also take over
  displays — so the lock is named after the monitor, not the job. And the **shared fixture store**,
  which a regenerating suite run deletes out from under a concurrent one. One machine-wide mutex,
  shared by every worktree:

  ```bash
  node scripts/lock.mjs acquire screen-right --owner "<who you are>"  # exit 1 = give up
  node scripts/lock.mjs release screen-right --owner "<who you are>"  # always, even on failure
  node scripts/lock.mjs status
  ```

  Names: `screen-left`, `screen-right`, `screen-primary` for the displays, `suite` for
  `.fixtures/` — separate claims, deliberately not aliased, so `pre-push` can hold `suite` while
  the `smoke.mjs` it spawns holds `screen-left`. All three window-placing harnesses take their
  own screen lock now (`smoke.mjs`, `spike-check.mjs`, `record-demo.ps1`), so you only do this by
  hand for something else that seizes a display — never wrap one of the three, or its own
  acquire waits out your hold. The root is shared with Vault Shelf, so both plugins' jobs
  contend. `make-hero.ps1` needs no lock — it transcodes a file. Screenshots need none —
  `shoot.mjs` goes over CDP — but pass your own `--port`. Never wrap a `git push` in an outer
  acquire/release of either name, or the hook's own attempt blocks on yours and the push hangs.
- **A vault that is not Lukas's own opens in restricted mode.** A fixture or generated vault puts
  up "Trust author and enable plugins?" on first open, and until it is confirmed the plugin does
  not load at all -- which reads as a broken plugin rather than as an unconfirmed dialog. Over
  CDP, `app.plugins.setEnable(true)` then `enablePluginAndSave(id)`; never judge the plugin before
  `getPlugin(id)` is truthy.
- **Never serve Chrome unlabeled.** Any page you open in Chrome from this worktree —
  `smoke.mjs`, `shoot.mjs`, a manual review build — carries its own top-left title as
  `<worktree/feature> — <what it's showing>`, e.g. `tag-grouping — demo vault`. Patch
  `window.VAULT_DATA`'s `vault` field in the built HTML, not the product.
- **`git push`, merging into `develop`, and a full-suite run are each a separate ask, every
  time.** None of them is implied by permission to do the work, or by how the last one went. A
  dispatched ticket worktree stops at its own branch regardless — only the orchestrator pushes to
  `develop` or cuts a release. **The checkout decides which of the two you are, not the task**: the
  main one, `C:\git-personal\vault-graph`, is the orchestrator; anything under
  `C:\git-personal\worktrees\` is a worker; `git rev-parse --show-toplevel` settles it.
  An orchestrator also stops spawning new worktrees once 6 are already working — more than that
  starved CPU/disk enough to force a hard restart once already.

`.ai-context/README.md` maps the design records; `.ai-context/code-map.md` and `code-index.md` are
generated and let you jump to a line range instead of reading an 8,700-line file top to bottom.
