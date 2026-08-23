# 0010 — The suite gets its own browser, on its own port

**Date** 2026-08-23 · **Status** accepted · **Issue** [#7](https://github.com/luke321/vault-graph/issues/7)

## Context

`scripts/smoke.mjs` launched Chrome on a **constant** debug port, 9333, chosen so it would
not fight a hand-started debug session. That is fine for one run at a time and wrong the
moment there are two — several agents on one machine, a suite started while another is
finishing, a hook firing over a run somebody left going.

**The second Chrome loses the race silently.** It cannot bind the port, so nothing listens
on its behalf; `attach(9333)` then connects to the *first* run's browser and every check
proceeds happily against the wrong page. No error, anywhere. What comes out is a scoreboard
of impossible results:

```
FAIL  legend opens folded to top-level folders
        60 rows, 40 subfolder rows            <- on a vault with 13 top-level folders
FAIL  nav counts share one right edge
        folded 60 counts, open 20             <- inverted
FAIL  hover re-arms after the pointer leaves the stage
        on 492 ...                            <- node 492, in a 454-note vault
```

Every one of those reads like a defect in the page. Two of them are arithmetically
impossible for the vault under test, which is the tell, and it took hours to notice because
the *plausible* reading — a flaky renderer — is right there and costs nothing to believe.

The same shape of mistake was already in the tree twice over: a `netstat` filter looking for
the word `LISTENING` on a machine that prints `ABHÖREN`, and a teardown that killed the
process we spawned rather than the browser it handed off to. Both meant "leaked browser" was
invisible, and a leaked browser is just a slower version of the same collision.

## Alternatives weighed

| Option | Why not |
|---|---|
| **Keep the constant port, refuse when it is busy** | Correct, and it makes concurrency a *failure* rather than a capability: the second agent is told to go away. Kept only for `--port`, where a human pinned it deliberately and being handed somebody else's browser is never what they meant. |
| **Serialise with a lock file** | Turns a race into a queue, at the cost of a stale lock being a new way to be stuck. Nothing here needs exclusivity — only isolation. |
| **A port derived from the pid** | No collisions in practice, collisions in principle, and it still cannot tell whether the port it picked is free. |

## Decision

**A free port per vault run, from the OS** (`listen(0)`, read the number, close), and Chrome
gets it directly. Runs are independent by construction rather than by etiquette. `--port`
still pins one for a human wanting devtools, and pinning is exactly when the busy-port
refusal is right, so that check survives for that case alone.

Three further changes, each closing a way the old shape could go wrong quietly:

- **The page is identified after attaching.** `location.href` must equal the URL just built.
  This is the guard that would have turned the whole episode into one line, and it costs one
  string comparison. A stale or foreign browser attaches and evaluates perfectly happily;
  the only thing wrong with it is *which page it is showing*, and nothing else notices.
- **Teardown asks the port who owns it.** `Browser.close`, then `taskkill /T /F` on our
  child, then — because Chrome's launcher hands off to a browser process that is not our
  child — the PID that actually holds the listening socket, parsed from `netstat` **without
  matching on the word LISTENING**, which is not the word this machine prints.
- **Frames are checked before anything is measured.** Every number in the suite is
  downstream of a frame, so a renderer that has stopped fails six checks in six vocabularies,
  none of which says "no frames". One preflight, one honest message. The bar is 5 frames in
  600ms — the page is *designed* to survive a slow machine, so this must catch a renderer
  that has stopped, not one that is struggling.

The launch flags also now refuse Chrome's offer to background an off-screen window
(`--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`,
`--disable-background-timer-throttling`, and `CalculateNativeWinOcclusion`). This one is
**precautionary rather than measured**: it was the leading hypothesis before the port
collision was found, and it was never independently reproduced. It is kept because the
window is deliberately parked at `-2400,0` and a throttled renderer is a real failure mode
for a suite that measures animation, but it should not be credited with the fix.

## Consequences

- Two suites can run at once. Measured: `--vault ./demo-vault` and `--vault ./test-vault`
  in parallel, **18/18 and 18/18**, which the constant port made impossible.
- Three consecutive full runs, both vault shapes, **6/6 clean, no leftover Chrome
  processes**. Before this work the same command was landing anywhere between 11/18 and
  18/18.
- A leaked browser is now merely wasteful rather than corrupting: the next run does not
  share its port, and could not silently attach to it anyway.
- **The lesson is not about ports.** Every mechanism here failed *quietly* — a lost race, a
  localised string, a process tree that outlived its handle. The suite's job is to be
  believed, so anything it cannot detect about its own setup has to become an assertion, not
  a comment.

## Verify

```bash
node scripts/smoke.mjs                                    # 18/18, twice, exit 0
node scripts/smoke.mjs --vault ./demo-vault &  node scripts/smoke.mjs --vault ./test-vault
```
