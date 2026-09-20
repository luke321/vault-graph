# Why the lock names stay separate

`scripts/lock.mjs` guards two different resources for this repo, and they are deliberately two
different lock names rather than one shared mutex. `CLAUDE.md`'s "How to work here" section has
the working commands and the two names; this is the archaeology behind why they are not aliased,
and where each one bit before it was fixed.

## The screen lock (`screen-left` / `screen-right` / `screen-primary`)

`record-demo.ps1` captures with `gdigrab -i desktop`, which copies a *region of the display* — so
anything else drawn there lands in the take and ruins it silently: the file exists and looks
plausible. A recording is not the only claimant: `smoke.mjs` parks every Chrome window it opens on
one fixed display, and `spike-check.mjs` puts Obsidian there. The lock is named after the
**screen**, not the job, so all three harnesses can share one claim without knowing about each
other. All three take their own screen lock now and release it on every way out (github#87), so a
caller never has to remember to.

The lock lives in the OS temp dir, not the worktree, so every worktree shares one — and the root
(`obsidian-vault-locks`) is shared with a sister Obsidian plugin, so working on both means their
jobs contend with each other, not just their own (github#92). A `mkdir` is the lock: atomic, and it
survives a killed session as a stale entry (20 min) rather than a permanent one.

## The fixture lock (`suite`)

Two full-suite runs do not fight over ports — each run gets its own free port and Chrome profile.
They fight over `.fixtures/`: a run that regenerates deletes every `<name>-*` directory there,
including the one a concurrent run is reading. That is the `suite` lock, and it is only about
`.fixtures/` — the display is a separate claim under its own name. It bites only when a fixture is
stale, which is why it is rare and reads as a regression in your branch.

## Why not one alias for both

This repo tried aliasing the two names first, and it deadlocks the exact pair that matters:
`.githooks/pre-push` holds `suite` around its own run while the `smoke.mjs` it spawns holds
`screen-left`. With the two names aliased, `aliasHold` blocks on whoever holds the alias — the
asker included — so the hook's own child process waits on a lock the hook itself is holding. Two
separate names is what lets that nesting work at all. A sister plugin (`vault-shelf`) hit the same
deadlock independently and reached the same design (`vault-shelf#37`).

## Liveness: reaping a lock whose holder is already dead (github#130)

Age alone used to decide staleness — a killed holder's lock blocked everyone else for the full
window (20–30 min) exactly as if the process were still working. `acquire()` now also breaks a
lock early when its record carries `holder: "process"`, its `pid` is provably dead
(`process.kill(pid, 0)` throwing `ESRCH`), and the record is older than a 60s floor (so a record
just written, before its writer has done anything else, is never reaped).

`holder: "process"` is an **explicit opt-in**, passed only by the four callers that stay running
for as long as they hold the lock and release it themselves: `smoke.mjs`'s `takeScreen()`,
`spike-check.mjs`, `record-demo.ps1`, and `.githooks/pre-push`'s `suite` acquire. A bare manual
`node scripts/lock.mjs acquire screen-right --owner me`, typed by hand at a terminal, never passes
it and keeps the old age-only behavior — because that invocation looks identical, in process-tree
shape, to the same script's own child call, and a human can legitimately outlive the shell that
wrote the record. Breaking a human's held lock because their shell exited would be worse than the
20-minute wait; this is the same gate the sister repo's (`vault-shelf`) own liveness fix uses.

**The `pid` recorded under `--holder process` is `process.ppid`, not `process.pid`.** Every one of
the four callers acquires the lock by spawning `node scripts/lock.mjs acquire ...` as a *child*
process and blocking on it — that child's own pid is gone within milliseconds of writing the
record, long before anyone reads it back. Its parent — the long-running `smoke.mjs`/
`spike-check.mjs` node process, the `record-demo.ps1` PowerShell process, or the `pre-push` bash
process — is the real holder, and `process.ppid` inside `lock.mjs` already equals it, with no
extra plumbing needed at the call sites.

`status()` tags a `holder: "process"` record whose pid is dead as `DEAD`, ahead of the existing
`STALE` (age-only) tag — visible before the 20-minute window would otherwise have surfaced it.

**Not done here:** reaping the sister repo's own lock records (`legacyHold()` / `aliasHold()`) by
liveness. This repo now writes the `holder` field the sister repo's reaper needs to reap *our*
dead locks; reaping *its* locks the same way would mean trusting a record shape it hasn't
committed to — left for a follow-up once/if it writes `holder` the same way.

## The pre-push nesting

`.githooks/pre-push` takes the `suite` lock itself, around its own run, and releases it on every
way out (github#92). Do not also wrap a `git push` in an outer acquire/release of either name: the
hook takes `suite` and the `smoke.mjs` it spawns takes `screen-left`, so an outer hold of either
one blocks the hook's own attempt and the push hangs until your stale window expires. A plain
`git push origin develop`/`main`, or a `smoke.mjs` run you drive directly, is correctly gated on
its own and needs no wrapping.
