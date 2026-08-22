# The demo drives real input, from outside the page

**Status** accepted · 2026-08-22

> Why the storyboard lives in the page but the clicking does not, and why the drawn
> cursor was built and then removed.

## Decision

`?demo` arms a walkthrough. The **storyboard** is data returned by `demoMode()` in
`template.html`; the **input** is performed by `scripts/demo.mjs`, which attaches over
the Chrome DevTools Protocol and dispatches `Input.dispatchMouseEvent`. The page answers
two questions about itself — *where is that control* (`__vg.demo.where`) and *are you
still moving* (`__vg.demo.busy`) — and performs nothing.

## What was rejected

### `el.click()` from inside the page

The obvious version, and far less machinery. Rejected because **a dispatched click skips
hit-testing**. It fires on an element that is covered by something else, scrolled out of
view, or 0×0 — so an in-page demo keeps passing after the button it aims at has become
unclickable, which is the one thing a demo is supposed to catch. CDP input enters at the
top of the same pipeline a mouse does: it hit-tests, it raises the hover states the page
draws for real, and it fails when a real click would fail.

Confirmed in a recording: at 4.5s the pointer is crossing the legend on its way to the
target and a row it merely passes over is showing its hover state and its `only` chip.
Nothing in the demo asked for that. A dispatched click would have shown none of it.

### A drawn cursor in the page

Built first: an SVG arrow following synthetic `MouseEvent`s, so a scripted session had
something visible to point with. Removed, for two reasons.

The mark **fought the physical mouse**. Measured, it finished a run at (0, 847) instead
of on the button it had just clicked at (42, 650): clicking the eye calls `buildLegend()`,
which replaces the legend's DOM, and Chrome then re-dispatches a mousemove at the *real*
cursor position — so a mouse parked anywhere teleported the mark on every rebuild. That
is fixable (ignore events the demo did not generate), and the fix was written, but it is
a workaround for having two notions of "where the pointer is" at all.

The deciding reason is the first one: the synthetic events that moved the mark are the
same ones that skip hit-testing.

## The cost, and how it was paid

**CDP input does not move the operating system's cursor** — it is delivered straight to
the renderer. So the first recordings showed every effect (buttons depressing, hover
states lighting, wedges reallocating) and no arrow travelling between them.

`--cursor` pays for it by moving the **real** pointer alongside, through
`scripts/cursor.ps1`, which gdigrab then draws with `-draw_mouse 1`. One long-lived
PowerShell process fed `x y` on stdin: spawning one per position costs ~80ms against a
16ms step, so a glide would crawl. The two pointers cannot drift, because both come from
the same coordinates in the same loop, and the **clicks stay on CDP** — so input still
hit-tests and still works whether or not the window has focus.

The remaining cost is real and is why this is opt-in rather than the default: it takes
the physical mouse for the demo's duration. The driver leaves it off; only the recorder
turns it on.

Page origin in screen coordinates is asked of the **page** (`screenX` plus the halved
horizontal inset), because only the page knows how much of its own window is browser
chrome — and with `--app=` that is a title bar and essentially no side border.

## Waiting

Every wait asks the page, never the clock: `settle` polls `__vg.demo.busy()` — which is
`play || cascadeRun || anim || hoverRaf`, the four things in this project that own an
animation — until it has been quiet for 250ms. This is the same rule as `decisions/0003`: a fixed
duration fires part-way through on a page too slow to finish in time, and the next beat
then acts on a disc that is still moving, which looks exactly like the layout bugs this
project keeps chasing.

The 250ms quiet period is not padding. `busy` dips false for a frame between a cascade
ending and the tween that follows it starting.

## Recording

`scripts/record-demo.ps1`: Chrome with a debugging port, ffmpeg grabbing that window's
rect, then the driver. The driver **blocks until the last beat lands**, so ffmpeg is
stopped on the demo finishing rather than after a guessed duration — which means adding
beats to the storyboard needs no change to the recorder.

Three things that were wrong first, all found by measuring the output rather than reading
the code:

| Symptom | Cause |
|---|---|
| `Can't find window 'Vault Graph'` | `gdigrab -i title=` is an **exact** match, and Chrome's window is titled `<page> - Google Chrome`. Worse, the page renames itself on completion, so even the right title would stop matching mid-take. Captures a desktop **region** from `GetWindowRect` now. |
| A 6.9s demo produced a **39.2s** video | Each CDP command armed a 30s timeout that was never cleared. An outstanding `setTimeout` keeps Node's event loop alive, so the driver process lingered 30s past its last command — and the recorder stops ffmpeg when the driver *returns*. The driver's own log said 6.94s the whole time, which is what hid it. |
| `NativeCommandError` on a recording that had worked | `ffmpeg -i <file>` reports to **stderr** and exits non-zero; Windows PowerShell 5.1 turns any native command's stderr into an error record. Probing with `ffprobe`, which answers on stdout and exits 0. |

The window is opened with `--app=`, so no tab strip or address bar is in frame, and with
`--disable-features=Translate,TranslateUI --lang=en-US` — the translate bubble appeared
over the page on a first take, Chrome having decided the vault's folder names were German.

## Aiming at a note, and the two ways it went wrong

Hovering a note is the one target that is not a DOM element and not a lattice cell, and
both mistakes it produced were only visible by pointing at it and asking what got hit.

**Sigma's viewport is its CONTAINER, not the page.** `graphToViewport` returned
`(888, 607)` for node 158, and pointing there hovered a *different* note — because the
disc's container starts at `(288, 155)` in the page, the sidebar's width and the heatmap
band's height. The driver dispatches in page coordinates, so the container's origin has
to be added. `#tip` gets away with the raw numbers only because it is positioned inside
`#canvas`, whose box is exactly the container's.

**The aim has to be provably unambiguous, not probably right.** Sigma hovers the node
whose drawn disc contains the pointer, so a target is safe only when no *other* node's
disc can reach it: the nearest neighbour must be further than this note's radius plus the
largest radius on screen. A first version required twice the note's own size and was
measured to fail — aiming at the daily note `2026-06-20` hovered `2026-W27` in a
neighbouring wedge, the neighbour being a bigger dot than the margin allowed for.

That second one matters more than a wrong hover, and it is why the bound is conservative
and why targets carry an `expect` the driver checks afterwards: **hovering names the note
on camera.** Landing one dot over puts a title the storyboard never chose into the
recording, and on this vault that could be a person's note. The storyboard aims only at
daily notes and weekly reviews for the same reason — both are titled by date, so the
label that appears carries nothing personal. Neighbours are never named: `forceLabel` is
set for the hovered node alone.

## Why the WebSocket client is hand-rolled

CDP commands need a WebSocket; Chrome's `/json` endpoints only list and open targets.
Node 18 has no `WebSocket` global (it landed in 22) and this repo installs nothing, so
`scripts/cdp.mjs` implements the ~80 lines needed: HTTP Upgrade, then RFC 6455 frames
with client masking. Continuation frames are reassembled on receive because a large
`Runtime.evaluate` result does arrive split.
