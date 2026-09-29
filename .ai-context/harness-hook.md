# The harness hook (github#192)

The window-placing harnesses — `smoke.mjs`, `spike-check.mjs`, `record-demo.ps1`,
`host-phone-check.mjs`, `live-growth-check.mjs`, `mobile-check.mjs`, `probe-room.mjs` — and the
suite runners (`.githooks/pre-push`, `suite-repeat.mjs`, `release.ps1`) take no lock of their own.
When one machine runs several of them at once, something has to keep two windows off one screen
and two suite runs off one fixture store, but that is a fact about the machine, not about the
plugin. So the repo carries only the seam: `scripts/harness-hook.mjs`.

## With nothing configured

Every call is a no-op. No lock is taken, nothing waits, nothing is printed, and the windows go
where they always have: centred on the leftmost screen (`scripts/screen.mjs`). This is what a
fresh clone does, and nothing in the repo depends on a hook existing.

## Configuring one

The hook is a Node script. The first of these that is set names it:

1. `VAULT_GRAPH_HARNESS_HOOK=<path>` in the environment (`off` disables it for that shell);
2. `git config vaultgraph.harnessHook <path>` — stored in the clone's own config, so every
   worktree of that clone sees it, and never tracked.

## What a hook must answer

`scripts/harness-hook.mjs` runs `node <hook> <verb> ...` and reads the exit code.

| Verb | Arguments | Meaning |
|---|---|---|
| `acquire <name>` | `--owner <id> --pid <n>` | Block until `<name>` is held for `<id>`. Exit 0 held, non-zero gave up |
| `release <name>` | `--owner <id>` | Let it go. The exit code is ignored |
| `screen` | `--owner <id> --pid <n>` | Block until a monitor is free, hold it, and print `left`, `right` or `primary` as the last line on stdout. Non-zero: none came free |
| `status` | | Say who holds what (`node scripts/harness-hook.mjs status` forwards to it) |

- **Names.** `suite` is the shared fixture store (`.fixtures/`), which a regenerating run deletes
  out from under a concurrent one. A screen claimed through `screen` is released as
  `screen-<answer>`; `record-demo.ps1 -Monitor <m>` acquires `screen-<m>` directly. The two kinds
  must stay separate names: `pre-push` holds `suite` while the `smoke.mjs` it spawns claims a
  screen, so a hook that treated them as one lock would have the hook wait on itself.
- **`--pid`** is the process that holds the claim until it releases it: the harness itself, or,
  when a shell calls the shim as a CLI, that shell (`pre-push` passes its own). A hook may free a
  claim whose holder has died.
- **Progress goes to stderr** for `screen`, since stdout carries the answer.
- **Headed stays headed.** A harness whose hook says every screen is busy waits, then exits 1. It
  never falls back to headless; `--headless` is only ever the caller's explicit choice, and a
  headless `smoke.mjs` asks for no screen at all.

## What the harness does with the answer

`claimScreen()` passes the answer to `useScreen()` in `scripts/screen.mjs`, and every placement
helper there (`leftWindow*`, `placeElectronLeft`, `harnessScreen()`) follows it for the rest of the
run. `record-demo.ps1` takes it as its `-Monitor`. Without a hook `-Monitor`, `-X` and the default
placement behave exactly as before.
