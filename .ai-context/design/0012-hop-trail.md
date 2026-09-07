# The hop trail

**Status** implemented on `feature/hop-trail` (2026-09-06, revised 2026-09-07, awaiting review) ·
github#40. Written as a concept against `develop@745aacf` (the 2.0.0 state); the numbers in the
body come from a throwaway port of the contributor's patch onto that tree in a scratch copy. The
implementation took this record's own proposals on Route 2 with a `Co-authored-by` trailer,
filtered crumbs grey and clickable, and a cap that keeps the origin. **The keyboard half is
superseded — see the section below.** The checks are in `invariants.md` from *Only a hop lengthens
the trail* on, and in `scripts/obsidian-smoke.mjs` (`--only trail`, `--only moved-out`).

## Superseded on 2026-09-07: the trail claims no key

**Everything below about Alt+ArrowLeft, Backspace, Escape and the A-versus-B binding question is
history.** The feature ships pointer-only: the back arrow and the crumbs, and nothing bound to a
key.

The reason is one this record asked the wrong question about. It weighed *where* to bind the keys
— the document, as the contributor's patch did, or the mount root, which is what shipped first —
and treated a key the page could safely hear as a settled premise, because the exporter page in a
browser is the whole world of that question. It is not: **Obsidian users bind their own hotkeys,
and the plugin's view has no business overruling them.** Backspace and Alt+ArrowLeft are unbound
in a default Obsidian, which is exactly what makes them attractive to bind, and a view that has
quietly taken them is a view that breaks a user's own setup with no way for them to see why. The
same argument reaches Escape, which is why it went too.

Binding B still did what it claimed — the popout measurement below holds, and is why the check
that replaced it can still be about a moved-out view — but "it works" was never the question
worth answering here.

What that costs, honestly: there is no keyboard path back along the walk. The crumbs are
`<button>`s in a `<nav>`, so Tab reaches them and Enter activates them, and that is the whole
keyboard story. If a way back by key is ever wanted, the shape that does not overrule anyone is
Obsidian's own: the plugin registers a command, the user binds it if they want it, and the page
exposes `api.trailBack()` for it to call. That is open question 7 below, now the only one of the
keyboard questions still live.

The removal also took the focus management that existed only to serve the keys — `ROOT.tabIndex`,
the card taking focus on every selection, and the `.vault-graph:focus` rule. A card that grabs
focus when you click a dot is its own small way of overruling the host, and with no key to
receive it there was nothing left to argue for it.

> Clicking a linked note on the card walks the graph, and three hops in the starting point is
> gone: the card names only the current note, and the browser's Back key leaves a `file://` page
> entirely. The trail is the way back: hops -- and only hops -- accumulate; a back arrow and
> crumbs sit at the top of the card; two keys step back; a fresh selection starts over; nothing
> survives the mount.

## Where it comes from

Issue github#40 was opened by a contributor (bartolli) with a patch on their fork, branch
`0006-detail-panel-hop-trail`, commit `cd51373`, written against `1.8.0` plus three commits
(merge-base `f498f5c`). It touches `src/page.js` (+90), `src/page.css` (+11) and one
changelog row, and was tested inside Obsidian over the marketplace 1.8.0 copy (issue comment,
2026-08-27): unmount/remount leaves no stacked handler, and one known limitation -- popping the
view out moves its DOM to the new window without a remount, so a document-bound key listener
stays on the mount-time document and keyboard is dead in the popped-out view. Pointer paths are
unaffected. This record adopts the patch's semantics, decides what is different in the 2.0.0
tree, and weighs two routes to land it.

## The semantics

The rules, in the order a user meets them. Every one below was driven on the exporter page of
the demo fixture (`.fixtures/demo-vault-d6f7dc27`, 2,004 notes) through CDP, starting from the
highest-degree note (`2019-01-26`, 125 links) and hopping along the second linked note each time.

| Rule | What was measured |
|---|---|
| **Hops, and only hops, lengthen the trail.** A hop is a click on a linked-notes row (`data-go`). A disc click, a search hit, a stage click, the reset button and a crumb click are not hops. | After a search hit: no crumbs. After 1 hop: `[2019-01-26]`. After 3: three crumbs. A search hit afterwards: no crumbs. |
| **Back arrow first, then crumbs.** Oldest on the left; the current note is the card title and not a crumb. | Crumb row present from the first hop on; `back: true`, title is the current note. |
| **First, ellipsis, last two** when the trail is longer than three. | At 4 hops: `[2019-01-26, …, 2018-03-18, Path dependence (4)]`, `dots: true`. At 3 or fewer: all of them, no dots. |
| ~~**Alt+ArrowLeft and Backspace step back one hop**~~ — **superseded: the back arrow steps back one hop**, and the place just left is not re-collected: backing up twice gives n-2, not n. | As measured with the keys: Backspace 4 -> 3 crumbs, Alt+ArrowLeft 3 -> 2, `location.href` unchanged. Re-measured through the back arrow 2026-09-07: identical, on all three fixtures. |
| **A crumb click truncates the trail there.** The target and everything after it leave the trail. | Clicking the first crumb: current note `2019-01-26`, no crumbs. |
| **A fresh selection resets.** Re-selecting the *same* note keeps the trail, because the pin toggle re-renders the card by re-selecting. | Pin, then unpin on the current note: 3 crumbs before, 3 after. |
| **Close ends it.** The close button, a stage click, Escape and the reset button all `select(null)`. | Escape: card hidden, `selected: null`; the next selection has no crumbs. |
| **Keys inside an input belong to the input.** Backspace while typing in search edits the query; Escape blurs the input and nothing else. | `/` focused search; Backspace there: 2 crumbs before, 2 after. Escape: `activeElement` back to body, trail intact. |
| **Nothing survives unmount.** The trail is a local of `mountVaultGraph`; a remount starts empty. | By construction; the plugin's Refresh and view close both `destroy()` the mount (github#62). |

Two things the patch also does that the issue did not ask for, and that this record puts to
Lukas rather than deciding: **Escape walks a ladder** (blur the input, else close the settings
panel, else close the card -- the context menu's own capture listener already owns Escape while it
is open), and **`/` focuses search**. Escape-closes-the-card is the natural pair of Backspace and
belongs here; `/` is a search feature and is proposed as its own small issue.

**The cap.** The patch caps the trail at 30 and drops the *oldest* entry (`shift()`), so past 30
hops the first crumb stops being where the walk began, which is the one thing the first crumb is
for. Proposed: keep the cap, drop the second-oldest instead, so crumb 0 is always the origin.

**A crumb whose note is currently filtered out.** Measured: hide the folder of the first crumb
(`04 - Daily Notes`) through the legend eye, then click that crumb. The card opens on the hidden
note (`state.hidden` true for its folder, display data `hidden: true`, size 11) and `centerOn`
flies the camera to a dot that is not drawn. The linked-notes list has exactly the same hole
today -- a `data-go` row also selects a hidden note -- so this is not the trail's defect, but the
trail makes it more likely to be met. Three options: leave it; render such crumbs dimmed with a
title "hidden by a filter" and keep them clickable; drop them from the trail. Proposed: the
middle one, because the trail is a record of where the user *went* and editing it behind their
back is worse than an honest grey crumb; and a follow-up issue for the `data-go` rows.

## What the page is now, versus what the patch was written against

The region the patch lands in is `select()` (`src/page.js`, section *detail panel*) and the
UI wiring around it: `clickNode` / `clickStage`, the search hit, `resetView`. Between `1.8.0`
and `745aacf` those files changed by 9,449 lines in `page.js` alone (Sigma and graphology out,
the engine in; every comment cut to a pointer; JSDoc at the boundaries; teardown). Measured
consequences for the patch as written:

| Gate | Patch verbatim on `745aacf` | After adapting |
|---|---|---|
| `git cherry-pick cd51373` | conflicts in all three files: `page.js` (the `select` head carries `@param {string \| null} id` and the `data-go` loop `@param {HTMLElement} b`), `page.css` (the `/* node detail card */` anchor comment is gone), `changelog-detail.md` (table head) | 3 resolutions, each a few lines |
| `npm run lint` (the five no-unsafe rules as errors, github#55, github#60) | **45 errors**: 28 `no-unsafe-member-access`, 7 `no-unsafe-argument`, 6 `no-unsafe-call`, 4 `no-unsafe-assignment` -- every one an untyped parameter (`ev`, `i`, `b`) or the untyped `var navTrail = []` | **0** after seven JSDoc annotations: `@type {string[]}` on the trail, `@param` on `goTo`, `navBackTo`, `crumbBtn`, `navKey` and the `data-tr` loop, and `ev.target instanceof HTMLElement` instead of a bare read |
| `node scripts/check-comments.mjs` (github#61, comments are pointers) | **fails**: 404 prose lines against a baseline of 386 -- the patch's 18 comment lines are its reasoning | the reasoning is this record; the code carries `design/0012` and `github#40` |
| `check-scope` / `check-network` | clean (204 css rules, 49 ids) / clean | -- |
| `tsc --noEmit` on the engine | clean; `graph.hasNode`, `getNodeAttribute` and `renderer.getNodeDisplayData` are all members of `src/engine/types.ts` | -- |
| plugin bundle (`main.js` / `styles.css`) | 400,719 -> 403,705 bytes (+2,986, +0.7%) / 27,533 -> 28,386 (+853) | about the same; the JSDoc adds ~200 bytes to the exporter page only, esbuild drops it from `main.js` |
| exporter page, demo fixture | 1,004,541 -> 1,009,703 bytes (+0.5%) | -- |

And two shape differences that are not gates:

- **Teardown is a list, not a lazy check.** The patch's document listener unbinds itself the next
  time a key is pressed after its root is disconnected. In 2.0.0 every registration outside the
  root pushes its undo onto `onDestroy` and `destroy()` runs the list (github#62); the mousemove
  and visibilitychange listeners next to `select()` show the shape. A lazily unbound listener is
  also exactly what `obsidian-smoke`'s *closing and reopening the view N times grows no
  listeners* counts: `getEventListeners(document)` after each cycle, failing at `first + 2`. Six
  cycles with no key pressed would leave six stale keydown listeners. The contributor's
  "smoke 56/56" was `smoke.mjs`; this check is in the other harness.
- **`setHTML` parses through `DOMParser`** rather than `innerHTML` (the no-inner-html rule), and
  `esc()` is the same. The crumb markup's entities (`&hellip;`, `&rsaquo;`, `&#8592;`) parse the
  same way; nothing in the render hunk changes.

## Two bindings for the keys

The largest hunk is the key handler, and there are two places it can live. Both were prototyped
and driven with real key events (`Input.dispatchKeyEvent`), same script, same fixture.

**A. On the document, as the patch does.** Guards: bail if the focused element is outside the
mount and not the body; bail while the context menu is open; keys inside inputs are the input's.
Works with focus on the body -- measured: Backspace with `activeElement === body` steps back.
Costs: the listener is bound to the document of mount time (`DOC = root.ownerDocument`), which
is the popout limitation the contributor measured; and because `ROOT.isConnected` is true again
once the DOM is adopted into the popout's document, the self-unbind never fires -- the stale
listener stays on the main document, where a Backspace with the body focused would pass the
guard and step the *other* window's trail back. Not measured; it follows from the guard, and it
is the thing an Obsidian check would have to try.

**B. On the mount root, with focus managed.** `ROOT.tabIndex = -1`; the keydown listener is on
`ROOT`; `select(id)` focuses the card (`#vg-detail`, `tabIndex -1`) after rendering it and
`select(null)` focuses the root. No document listener, so nothing to tear down and nothing to
re-bind: an element listener travels with its element into a popout, and two mounts in one
document cannot hear each other. Measured on the exporter page: every row of the table above
comes out identical; after a hop `activeElement` is inside the card; after Escape it is the root.
The one difference: **Backspace with focus on the body is dead** (measured, trail unchanged) until
focus re-enters the mount -- so the Escape-in-search branch must focus the root after the blur,
and the canvas click paths (`clickNode`, `clickStage`) must land focus inside the mount, which
the two `select` changes already do.

B is proposed. It removes the whole class the contributor's known limitation belongs to
instead of guarding around it, and the focus moves it needs are the same ones accessibility
asks for below. A stays the right answer if focus-on-select turns out to fight Obsidian's own
leaf focusing -- the first thing the Obsidian check has to measure.

## Inside Obsidian

- **View lifecycle.** `VaultGraphView.render()` tears the old mount down and mounts a fresh one on
  `onOpen` and on Refresh; `onClose` calls `destroy()`. The trail is a mount local, so it is
  empty after either. With binding B there is no listener outside the root to leak; with A it
  goes on `onDestroy` like its neighbours.
- **Popout windows.** Two paths. `openPopoutLeaf` creates a new leaf whose view mounts in the
  popout's document -- the existing `obsidian-smoke` check *the view mounts in a popout window
  and tears down with it* covers it, and both bindings are fine there. `moveLeafToPopout` moves
  an *existing* view's DOM without a remount: A is dead there (measured by the contributor), B
  is not, by construction -- to be measured, not assumed; the check below does it.
- **Key handling and focus.** Obsidian routes hotkeys through `Scope`s (`app.scope`, and
  `View.scope` "for when the view is in focus", since 1.5.7). Alt+ArrowLeft is unbound by default
  on Windows and Linux (*Navigate back* is Ctrl+Alt+ArrowLeft) but a user may bind it; Backspace
  and `/` are unbound outside an editor. Whether Obsidian's keymap sees a keydown before a
  listener on the view's element, and whether it calls `preventDefault` on a bound key, is not
  known from the typings and is the second measurement for the Obsidian check. The alternative
  design -- the plugin registers Alt+ArrowLeft and Backspace on a `View.scope` and calls a new
  `api.trailBack()` -- makes the keys user-rebindable and Obsidian-native but leaves the exporter
  page needing its own binding anyway, so the page keeps the keys and the scope route stays an
  option if a conflict is measured.
- **`deps.doc`.** The plugin passes `win: activeWindow` and no `doc`; `DOC` falls back to
  `root.ownerDocument` at mount time. Nothing here changes that, and B does not read it.

## On the exporter page

A `file://` page in a browser. Alt+ArrowLeft is history-back in every browser; Backspace stopped
being history-back in Chrome in 2016 but still is in Firefox behind a preference, so both keys
`preventDefault` when they act on the trail and are left alone when they do not (an input,
nothing to step back to). `?demo` automation does not touch the card. Nothing about the trail
reaches the network or stores anything (decisions/0008, decisions/0009).

## Composition

| With | Rule |
|---|---|
| **Search** | A hit is a fresh selection: trail reset (measured). Typing in the box keeps every key (measured). Enter clicks the first hit, same thing. |
| **Date range and timeline** | A range change re-runs the cascade and leaves `state.selected` alone, so the card stays and so does the trail. A crumb whose note is outside the window is the filtered-crumb case above. The intro sweep does not select. |
| **Folder and subfolder filters** | Hiding a folder does not deselect (measured: card and 3 crumbs intact while the first crumb's folder hides). Filtered crumbs as above. |
| **Pins** | The card's pin button re-selects the same note: trail kept (measured). Right-click pin on the disc calls `togglePin` without `select`: trail untouched. A hop to or from a hub note is a hop; `centerOn` reads display data, so it finds the hub position. |
| **Reset view** | `select(null)`: trail gone. |
| **Refresh (plugin)** | Remount: trail gone. |
| **Context menu** | Its capture-phase Escape wins while it is open; the trail's handler returns when `#vg-ctxmenu` is visible. |
| **Ghost notes** | `ghost:` nodes are hoppable rows already (no Open link); nothing changes. |
| **The layout** | None of this touches a plan, a row, a room or a position. A hop moves the camera (`centerOn`, 420 ms) and re-renders one panel. That is an invariant below, not an assumption. |

## Accessibility of the crumbs

- The crumb row is a `<nav aria-label="Hop trail">` holding an `<ol>`; each crumb is a
  `<button>` with the note's label as text -- the patch's `title="Back to X"` becomes
  `aria-label` on the back arrow, whose visible text is a glyph. The separators and the ellipsis
  are `aria-hidden`; the ellipsis carries a `title` saying how many are folded.
- ~~Focus moves into the card on every selection~~ — superseded with the keys. The card carries
  `role="region"` and an `aria-label` naming the note, and Tab reaches the back arrow and every
  crumb in order. Nothing takes focus on its own.
- ~~`aria-keyshortcuts` on the back arrow~~ — superseded; there are no shortcuts to announce.
- Crumb text at 10 px matches the card's existing chip and `.nb` sizes; the truncation at 110 px
  keeps the full label in `title`.
- The middle of a long trail is unreachable by any means other than stepping back through it.
  Acceptable for a first cut; an ellipsis that expands the whole trail is the extension if it is
  missed.

## Invariants and checks

New sections for `.ai-context/invariants.md`, each with a check in `scripts/smoke.mjs` under the
same name, driven through the DOM (`#vg-detail [data-go]`, `.crumbs button`) and CDP keys, on
all three fixtures:

1. **Only a hop lengthens the trail.** Hop three times, then select through search: no crumbs.
   Disc click and stage click likewise. Fails if any other selection path forgets to reset.
2. **Stepping back never re-collects.** From n crumbs, one back key gives n-1 and a second n-2;
   `location.href` is unchanged after both keys, on `file://`.
3. **A crumb click truncates at the crumb.** Click crumb i of n: the current note is that
   crumb's, i crumbs remain.
4. **The trail is not layout.** Sum of |dx|+|dy| over every node, and the room and cell room of
   every band, before and after a five-hop walk and two steps back: 0. The camera may move;
   nothing else may. This is what ties the feature to the laws in `CLAUDE.md`.
5. **Keys in an input stay the input's.** Focus search, press Backspace and Alt+ArrowLeft: trail
   unchanged.
6. **Re-selecting the same note keeps the trail; a filter does not clear it.** Pin toggle and a
   legend eye on a crumb's folder: crumb count unchanged.
7. The existing *no console errors*, the layout golden on all three fixtures and
   `teardown-check.mjs` (six destroy/remount cycles on the standalone) run unchanged; the golden
   must not move, since nothing in the trail reaches the plan.

For `scripts/obsidian-smoke.mjs` (real Obsidian over CDP):

1. **Hop twice, close the view, reopen, hop twice: two crumbs, one Backspace steps one.**
   Reproduces the contributor's manual test.
2. **The listener count is flat.** The existing *closing and reopening the view N times grows no
   listeners* check already fails a lazily unbound document listener; keep it green.
3. **Keys in a moved-out view.** `moveLeafToPopout` on the open view, hop twice in the popout's
   document, Backspace there: steps back. Then Backspace in the main window with the body
   focused: the popout's trail is unchanged.
4. **Obsidian's keymap does not eat the keys.** With the graph view active, Alt+ArrowLeft steps
   the trail and the active leaf stays the graph. If a default or user hotkey wins, that is the
   moment to move the binding onto `View.scope`.

`check-comments` and `lint` gate the push as they do now; `check-scope` sees the new rules only
under `.vault-graph #vg-detail`.

## Two routes

**Route 1 -- adopt the patch.** `git cherry-pick -x cd51373` on a branch off `develop`, resolve
the three conflicts (authorship stays with the contributor; Lukas is the committer), then adapt in
follow-up commits: seven JSDoc annotations, the 18 comment lines out and `design/0012` pointers
in, the listener onto `onDestroy` (binding A) or the rewrite to binding B, the cap rule, the
filtered-crumb rendering, the accessibility markup, the checks. Honest about where the semantics
came from; the history shows their commit and what changed on top. Cost: with binding B the
largest hunk is rewritten anyway, so the cherry-picked commit mostly documents an intermediate
state, and it would be the first outside commit in a repository whose `CONTRIBUTING.md` still
says pull requests are not being taken.

**Route 2 -- reimplement to this record.** One commit by Lukas with `Co-authored-by:` naming the
contributor (the semantics, the reset rule, the crumb shape and the popout finding are theirs),
`Closes #40` on its own line, the checks in the same branch. Cleaner history, no conflict
resolution, no policy question; the credit is in the trailer and in the release note rather than
in the author field.

**Recommendation: Route 2, with binding B.** Every hunk of the patch is touched by a gate
(45 lint findings, 18 comment lines, the teardown list) or by a decision in this record (the
binding, the cap, filtered crumbs, the markup), and nothing applies clean. Route 1 is the right
call instead if Lukas decides on binding A as-is -- then about seventy percent of the lines
survive and the author field should say who wrote them.

## Open questions for Lukas

1. ~~**Binding.** B or A?~~ **Answered 2026-09-07: neither.** No key is bound at all.
2. **Route.** Reimplement with `Co-authored-by` (done) or cherry-pick and adapt? Either way
   the contributor is told which, and why, on the issue -- including that the keys their patch
   introduced are not in the shipped feature, and why.
3. ~~**Scope of the keys.** Escape closes the card; `/` focuses search.~~ **Answered: neither
   ships.** The close button and a stage click close the card; `/` was never in.
4. **Filtered crumbs.** Grey and clickable (proposed), unchanged, or dropped? And whether the
   same treatment goes onto the `data-go` rows in a follow-up.
5. **The cap.** Keep 30 and always keep the origin (proposed), or drop the cap.
6. **Mouse back button.** Button 3 is history-back in Chrome on `file://` too. Left to the
   browser, by the same argument the keys lost on: it is the user's gesture, already bound.
   Worth revisiting only if someone asks for it.
7. **A way back by key, without taking one.** The live one. An Obsidian command the user binds
   themselves, calling a new `api.trailBack()` -- opt-in, visible in the hotkeys list, and
   overruling nobody. Wanted now, or left until someone asks?
8. **`CONTRIBUTING.md`.** Whichever route: does the "pull requests are not being taken" line
   change now that the first patch has been useful?
