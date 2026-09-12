# 0018 — Not stealing the keyboard

github#129. A harness run used to take the keyboard: a window came to the foreground mid-run and
keystrokes landed in it instead of in the terminal that started the run, for the rest of the run.

`scripts/lock.mjs` does not help and was never meant to. It serialises *who owns the display*; it
says nothing about a window *activating*. Two harnesses that correctly take `screen-left` one
after the other still steal focus one after the other.

## What was actually measured

The ticket asked for activations to be counted rather than assumed. Three things came out of doing
that, and each one changed the fix.

**`EVENT_SYSTEM_FOREGROUND` counts attempts, not thefts.** A `SetWinEventHook` watcher logs an
event for the harness window on essentially every run. `GetForegroundWindow()` frequently does not
change. Measured directly: the event fired at 1917 ms for a `shoot.mjs` window while
`GetForegroundWindow` still named the original window, and it never changed for the remaining 16 s
of the run. Windows had refused the activation and flashed the taskbar instead. **Ground truth is
polling `GetForegroundWindow`.** An event-counting check would have reported a steal on every run,
and then reported the fix working on runs that never stole — which is worse than no check.

**The steal is only permitted when the run was started by the process holding the foreground.**
Started from a session that is not in front — every agent-driven run — 3 of 3 `shoot.mjs` runs
measured **0 real steals**. Started by the window that actually holds the foreground, which is a
person at their terminal and the only case that matters: **8445 ms stolen out of an 18406 ms run,
and the keyboard was never handed back.** This is why the bug reads as unreproducible: the obvious
way to test it is the one arrangement in which Windows refuses the steal.

**It is intermittent.** An identical rig run immediately before the one above measured 0 steals.
A single clean run proves nothing; only a rate and a worst case do.

Also seen, and worth not chasing: the live `ForegroundLockTimeout` reads 2147483647 ms while the
registry says 200000. Something sets it at runtime. It does not prevent the steal in the privileged
case, so it is not a lever.

## Why handing it back, rather than not taking it

There is no way to prevent the initial activation from outside the process. Chrome has no
"open without activating" flag; `SW_SHOWNOACTIVATE` and `SWP_NOACTIVATE` act on a window that has
already taken the foreground, so they can only tidy up afterwards. Obsidian is harder still — the
window is created before any CDP attach exists to act on it.

So the run gives the keyboard back. The turn that makes this work: **the same privilege chain that
lets the new window steal is what lets the harness take it back.** The harness is a child of the
process that held the foreground, so its `SetForegroundWindow` is the call Windows is disposed to
grant. `record-demo.ps1`'s warning — that `SetForegroundWindow` is refused to a background process
often enough to be useless alone — is about a genuinely background process, which a harness in this
chain is not. In practice the plain call was still refused here and the `AttachThreadInput`
fallback is what took, so both paths earn their place; measured `attach` at +2990 ms in a probe.

Headless was rejected as a separate piece of work, not as a bad idea: nothing in this repo has ever
run headless, so it is a new mode, and `.ai-context/changelog-detail.md` carries measured
milliseconds as well as structure. Numbers taken headed and headless are not comparable, so a flip
is one deliberate commit that re-takes the goldens *and* the timings. The suite stamp needs nothing
either way — a shape delta already suppresses the stamp entirely rather than recording the mode
(`github#104`).

`record-demo.ps1` is excluded and keeps raising. It captures with `gdigrab -i desktop` and needs a
genuinely frontmost window and the real cursor.

## The shape

`scripts/focus-guard.ps1` is the Win32 hand, in the established shape of `scripts/win-input.ps1`:
stdin in, one reply line per command. `fg` reports the window holding the keyboard;
`handback <hwnd> <pid>` restores `<hwnd>` **only if** the keyboard is currently held by `<pid>` or
one of its descendants, replying `already | foreign | plain | attach | failed`.

The descendant test is the point of `foreign`. Chrome re-execs and Electron splits, so the window
often does not belong to the process that was spawned — but equally, someone who alt-tabbed away
on purpose must be left alone. Restoring a window the run did not displace would be a second bug
wearing the first one's clothes.

`scripts/focus.mjs` is the two-line integration: `keepFocus()` immediately before the spawn,
`watch(child.pid)` immediately after. Two details are not free choices:

- **The watch runs alongside the harness and is never awaited.** The steal lands 1.9–2.2 s after
  the spawn, which is *after* the CDP attach has already succeeded, so a hand-back attempted once
  at the attach misses it every time. That was the first version, and it measured as no fix at all.
- **The helper's pipe is ref'd only while a reply is outstanding.** Unref'd throughout, an `await`
  on the helper is the only pending work in the loop and node exits 13 on an unsettled top-level
  await one second into the run — a harness that dies immediately while reporting success. Ref'd
  throughout, the helper keeps the harness alive forever. Both were measured, in that order.

Every failure path degrades to a no-op. A harness must still run on a machine where none of this
can work, and it must not be the guard's fault when it does not. `VG_NO_FOCUS_GUARD=1` turns it
off outright — both as an escape hatch if it ever misbehaves, and because it is what makes a real
before/after possible: the same harness, the same rig, the guard the only difference.

## Why the check is not in the suite

`scripts/focus-check.mjs` is a manual harness, alongside `deferred-check.mjs` and
`spike-check.mjs`, and `scripts/focus-standin.ps1` is the half of it that has to be a window.

It cannot be a `smoke.mjs` check. It needs to *own the foreground* for the duration, which is not
something a suite can do while other checks run; and the defect is intermittent, so as a gate it
would fail runs at random. What it does instead is make the ticket's "done when" answerable:
it takes a real window, takes the keyboard, spawns the harness as its own child so the privilege
chain is faithful, polls `GetForegroundWindow` at 20 ms, and repeats — reporting steals, total time
without the keyboard, the worst single loss, and whether the run ended holding it.

```
node scripts/focus-check.mjs --runs 5 -- node scripts/shoot.mjs --vault .fixtures/<demo> --out shots
```

It passes when every run ends holding the keyboard and no single loss reaches a second, which is
the ticket's own bar.

It takes `screen-left` for harnesses that do not, and **must be given `--no-lock` for the ones that
do** — `smoke.mjs`, `spike-check.mjs`, `obsidian-smoke.mjs`. Holding the lock outside them makes
their own acquire wait out this run's stale window, which is the same nesting `github#87` and
`CLAUDE.md` already warn about for `pre-push`.
