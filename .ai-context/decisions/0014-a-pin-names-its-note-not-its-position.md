# 0014 — A pin names its note, and the stored format says so

**Date** 2026-09-14 · **Status** accepted · github#143 (finding 9 of github#81)

## The problem

`ingest()` hands every node an id from a counter walked in input order
(`String(nextId++)`), and `state.pinned` holds those ids. `hubChanged()` persisted them
verbatim and `seedPins()` restored whichever of them the new graph happened to contain.

An id is therefore a *position*, and a position is only stable while the input order is.
Measured on a two-note vault of `B.md` and `C.md`, ghosts on: pinning `B.md` and
`ghost:Missing` stored `["0","2"]`; adding `A.md`, rebuilding and reopening the same
browser storage restored **`A.md` and `C.md`** pinned. Nothing reported anything — the hub
looked exactly as intentional as it had before.

The note's path was already on the node as its `path` attribute, and `idOfPath` already
maps it back. Neither was used for persistence.

## Decision

**The stored value names notes, and carries a version marker so an old one can be
recognised rather than guessed at.**

Version 2 is a `string[]`: element 0 is the marker, elements 1..n are note paths in slot
order. A ghost's path is the canonical full destination github#141 landed
(`ghost:<destination>`), so a pinned ghost is stored under the same spelling every other
part of the page keys it by.

```
["\u0000vault-graph:pins:2", "Notes/B.md", "ghost:A/Missing"]
```

### Why the marker leads with a NUL

It has to be a string no note can produce, because the whole point is to tell a version-2
value from a version-1 one without inspecting the elements. A NUL cannot occur in a vault
path — `src/page.js` already relies on that for `SAT_SEP` (github#86) — so a marker leading
with one is unforgeable. A readable marker alone (`"vault-graph:pins:2"`) is *nearly*
safe: Windows forbids `:` in a filename, but a ghost destination is arbitrary text a note
can write, and "nearly" is the kind of reasoning this repo keeps getting caught by.

### Why the version lives inside the array rather than replacing it

Both hosts type the setting as `string[]` and pass it through untouched —
`src/shell.html`'s `loadSettings().pinned`, and `plugin/main.js`'s
`settings.pinned` / `onPinned`. Keeping the type means **neither host changed at all** for
this, and the page stays the only thing that knows what a pin is. An object
(`{ v: 2, pins: [...] }`) would have moved format knowledge into `PluginSettings`, the
plugin's settings JSDoc, the shell, and every future reader, for no gain.

## The migration policy, in full

**A stored value whose element 0 is not the marker is version 1, and it is dropped.** All
of it, with nothing carried across.

An ordinal names a position in an input order that nothing kept. There is no record of
which note was at position 0 when the pin was made, so there are only two things that could
be done with it: reinterpret it as a path (it is not one), or index the current graph with
it (that is the defect). Recovering a version-1 pin is not hard, it is *impossible*, and a
guess dressed as a recovery is worse than the empty hub — a wrong pin looks deliberate.

The empty version-2 store is written back over the version-1 value at mount, so the drop
happens once rather than at every mount.

**There is no notice.** Re-pinning is one right-click, and a modal about a settings format
would cost a UI surface in the page and a second one in the plugin to say so.

## Consequences

- `state.pinned` still holds runtime ids, and everything that reads it — `isPinned`,
  `pinnedIds`, `hubPlace`, the plan skeleton key, the drag path — is untouched. Only the
  two persistence boundaries translate, both through `persistPins()`.
- **A stored path the current graph does not have is skipped, not deleted** — the same
  treatment an unknown ordinal got. So a pin survives a rebuild that excluded its note
  (ghosts off, templates excluded) *until the next pin action rewrites the store*. That
  half-durability is inherited, not designed; making it survive properly would mean
  `state.pinned` carrying entries with no node behind them, which is a larger change than
  github#143 asked for.
- The `--ghosts` flag decides whether a pinned ghost can come back at all, because it
  decides whether the node exists. That is true of every ghost, not just a pinned one.
- `__vg.pinsStored()` and `__vg.pinsFrom()` expose the two translations read-only, so the
  mapping is measured rather than argued (github#58's rule, applied to a settings format).
