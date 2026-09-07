# AGENTS.md

**`CLAUDE.md` is the brief — read it first and treat it as the single source.** This file exists
so an agent that looks for `AGENTS.md` by convention finds its way there instead of guessing, and
it deliberately does not restate the laws: two copies of a rule become two different rules.

Three things are worth knowing before you touch anything, all expanded in `CLAUDE.md`:

- **Measure, don't reason.** The recurring failure here is arguing about the code instead of
  driving it: serve the page, drive it, read the numbers. `node scripts/smoke.mjs --only
  "<substring>"` is the iteration loop.
- **Two things may not run twice at once.** Several agents work this repo in parallel worktrees.
  A **screen recording** grabs a display region, so a second take captures the first one's window;
  the **full suite** drives Chrome over CDP, so two runs fight for ports and each blames the code.
  Both are guarded by one machine-wide mutex that every worktree shares:

  ```bash
  node scripts/lock.mjs acquire record --owner "<who you are>"   # exit 1 = give up, do not record
  node scripts/lock.mjs release record --owner "<who you are>"   # always, even on failure
  node scripts/lock.mjs status
  ```

  `record` and `suite` are the two names. Screenshots need no lock — `shoot.mjs` captures over
  CDP, so overlapping windows are harmless — but pass your own `--port`.
- **`git push`, merging into `develop`, and a full-suite run are each a separate ask, every
  time.** None of them is implied by permission to do the work, or by how the last one went.

`.ai-context/README.md` maps the design records; `.ai-context/code-map.md` and `code-index.md` are
generated and let you jump to a line range instead of reading an 8,700-line file top to bottom.
