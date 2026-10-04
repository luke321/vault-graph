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
| `admit <job>` | `--owner <id> --pid <n>`, and from `smoke.mjs` also `--kind walk\|fast --running <n> --lanes <n>` | May a heavy unit start now? Print `go`, `wait <ms>` or `width <n>` as the last line on stdout (github#198) |
| `threads <job>` | `--owner <id>` | Print a positive thread count for an encode, or nothing to leave ffmpeg's default alone (github#198) |

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

## Admitting heavy work (github#198)

The repo measures no load. Whether the machine can take another Chrome lane, a recording or an
encode is the hook's to judge; the harnesses only ask, at these points:

| Job | Asked by | When |
|---|---|---|
| `smoke` | `smoke.mjs` `pool()` | before a lane takes its next job — between jobs only, never inside one |
| `record` | `record-demo.ps1`, `record-live.mjs`, `probe-room.mjs --film` | before the take, and before a screen is claimed, so a paused take holds no screen |
| `encode` | `make-hero.ps1`, `probe-room.mjs`'s film encode | before the encode |

`threads encode` is asked by every ffmpeg encode: those four scripts plus `record-demo.ps1` and
`record-live.mjs`'s live capture. `update-feature-metadata.mjs` runs only `ffprobe` and asks nothing.

What each answer does:

- **`go`** — start.
- **`wait <ms>`** — sleep, then ask again. Each wait is clamped to between 1 s and 60 s (`wait 0`
  is `go`, so a hook cannot spin the harness), and one process waits at most 10 min in all; past that it goes ahead without asking again and says so. A pause is
  between jobs, so a frame-timed walk check is only ever delayed at its start, never slowed.
- **`width <n>`** — in `smoke.mjs`, at most `n` jobs run at once (clamped to at least 1): a lane
  that would exceed it parks until a running job finishes, then asks again. Two lanes answered at
  the same moment still start one job, because the count is checked after the answer arrives.
  For a recording or an encode, which is one unit, `width` means `go`. **A run the hook narrowed
  below its planned lanes does not stamp the tree** (decisions/0013): like `--jobs 1`, it is not
  the shape the gates push with. Whenever the hook gave `smoke.mjs` a usable answer, the closing
  summary names the most jobs that ran at once. A run the
  hook only paused stamps as normal.
- **Anything else** — a non-zero exit, no answer within 10 s, an unparseable line — reads as `go`
  (and no thread count), said once per run. **Exit 2** means the hook does not know the verb (a
  hook written before these verbs existed prints its usage and exits 2): that verb is not asked
  again for the rest of the run, and its usage text is not printed.

So a missing, broken or pre-github#198 hook never hangs a run or a push; it only stops governing.
From PowerShell, `node scripts/harness-hook.mjs admit <job> --owner <id>` serves any waits and
prints `go` or `width <n>`; `node scripts/harness-hook.mjs threads <job> --owner <id>` prints the
count or nothing.

## What the harness does with the answer

`claimScreen()` passes the answer to `useScreen()` in `scripts/screen.mjs`, and every placement
helper there (`leftWindow*`, `placeElectronLeft`, `harnessScreen()`) follows it for the rest of the
run. `record-demo.ps1` takes it as its `-Monitor`. Without a hook `-Monitor`, `-X` and the default
placement behave exactly as before.
