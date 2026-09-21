# 0016 — The suite can run headless, and nothing requires it yet

**github#155**, splitting the half github#147 deliberately did not attempt.

## The situation

`scripts/smoke.mjs` proves everything this project promises — the serpentine, the ring
independence, the hub share, the lattice, `settle()` being a no-op, the golden snapshots — and
it proved all of it on exactly one machine. It could not run anywhere else for two independent
reasons, each sufficient on its own:

- it always **placed a window**: `--app=`, `--window-position` from `leftmostScreen()`, and a
  `--window-size` from a grid slot cut out of a physical display;
- it always **took the `screen-left` lock**, before `main()` was even called.

And it was one undifferentiated block of work: the hook's own note measured **587 s for 94
checks across 3 fixtures, of which 446 s was a serial lane of frame-sensitive checks** whose
thresholds were tuned against one machine's Chrome.

## The decision

**Three things, in the order github#155 sets, and the third one is not finished.**

### 1. Headless is asked for, never sniffed

`--headless` (or `VG_HEADLESS`, or `CI` being set) passes `--headless=new`, drops every
window-placement flag, passes the URL positionally instead of through `--app=`, skips the focus
guard, forces the grid off, and **takes no screen lock**.

*Rejected: inferring it from an unset `DISPLAY`.* That is right until somebody runs under
xvfb, and then it is silently wrong — about the one thing this change is not allowed to be
silent about. `--headed` beats every other signal, including `CI`, so debugging a runner
failure under xvfb stays possible.

*Skipping the screen lock is the lock name being honest, not an exemption.* `locking.md`: the
claim is on a **screen**, and a run with no window is on no screen. A run that skipped it says
so in its first line, so a contended display is never diagnosed from a log of the other kind.

### 2. The lane seam is github#113's `clock`, reused

Every check already declares `clock: "real"` or defaults to `"fast"`, and the scheduler already
splits jobs on it. `--lane fast|walk|all` filters on that same field: **131 fast, 27 walk** of
158 checks as of 2026-09-21. A second classification of one property would drift from the first,
and the one the scheduler acts on is the one that is true.

### 3. Measure before requiring — and this is the open half

`.github/workflows/suite-soak.yml` runs a lane N times on `ubuntu-latest` and
`scripts/soak-report.mjs` prints **the spread, not the mean**: every run, min/median/max wall,
and every check that failed in any run with how many. A mean hides the one run in twenty that
went red, and that run is the whole decision.

**Nothing is added to `quality.yml` and nothing becomes required.** A job in `quality.yml`
would already be a required status in practice — it shows red on every `develop` push —
whatever the ruleset says. github#147's reasoning is unchanged: *a required status that flakes
is a required status that gets bypassed, which is worse than not having one.*

**As of 2026-09-21 the twenty-run runner measurement has not been taken**, so no decision about
requiring the lane has been made or can be.

## What this bought, measured on this machine (2026-09-21)

| | wall | result |
|---|---|---|
| `--headless --lane fast` | 299 s | 383/383 |
| `--headless --lane walk` | 265 s | 45/45 |

Neither is the runner measurement. They say the headless path *works* and what the split costs
here; what a shared runner does to the same lanes is still unknown, which is the point of the
soak.

## What three runs of the fast lane already found, before any runner saw it

`scripts/soak-report.mjs` over three consecutive local `--headless --lane fast` runs:

```
wall: min 294s  median 295s  max 299s  spread 1.02x
green: 2 of 3 run(s)
  1/3  a swipe in the tail of a fit flight still scrolls
```

**A frame-timed check is in the fast lane**, and the source says so before the flake does: it
registers with **no `clock` opt at all** (`smoke.mjs`, "a swipe in the tail of a fit flight still
scrolls"), so it defaults to `fast` — while its body samples a fit flight at **+345ms** against a
threshold, and the run that failed said `the finger missed the tail (ratio 0.94871, fit 0.954,
threshold 0.94923) -- retimed, not fixed`.

So **github#113's `clock` is a declaration, not a derivation**, and at least one check has not
made it. The five slowest checks in the fast lane are the same mobile fit-flight family (41s,
34s, 29s, 24s, 20s), which makes them the obvious candidates for the same gap.

**This ticket does not reclassify them.** The scheduler splits *jobs* on `clock`, so moving five
checks into the serial walk pool changes what the default run does and costs a before/after of
its own — and github#155's order puts the measurement first. The soak is the instrument that
settles it: a check that fails *some* runs is exactly what its report is built to name.

**What did not happen is as important:** no threshold was touched. The failing check's own
message offers `retimed, not fixed` as the diagnosis, and taking it would have been the mistake
the ticket names.

## The one thing that had to be fixed to get there

A headless window of the same outer size gives the page **56px less height**, and that alone
failed *the disc's density follows the notes on screen* on the 10k vault three runs out of
three. **The threshold did not move; the frame did.** github#155's own wording is the rule — *a
threshold that has to move for the machine is measuring the machine* — and `invariants.md`
("The suite measures in a 1584x961 frame") has the table and why it is a window resize rather
than a metrics override.

## Consequences

- Both flags are part of the run **shape**, so `shapeDeltas()` reports them and neither can
  stamp a tree as having passed the suite (decisions/0013). A run on SwiftShader with the frame
  lane skipped is not the run the gates push with, however green.
- The launch shape and the lane filter moved to `scripts/smoke-shape.mjs` so that
  `smoke-runner-selftest.mjs` can assert them. That selftest is in the hook's static block *and*
  in `quality.yml`, which is the only place a merge boundary can read anything about the suite
  until the soak says otherwise.
