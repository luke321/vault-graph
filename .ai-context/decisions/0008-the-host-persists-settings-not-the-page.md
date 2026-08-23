# 0008 — The host persists settings; the page only asks

**Date** 2026-08-23 · **Status** accepted

Folder colours are the first thing this page has ever needed to *remember*, and the page
runs in two places that store things in completely different ways.

## The problem

`src/page.js` is one file mounted by two hosts:

- the **standalone**, a single HTML file opened off a disk, where the only store is
  `localStorage`
- the **Obsidian plugin**, where the store is `saveData()` / `loadData()`, and where
  `localStorage` is something a plugin has no business writing to

There is no store both hosts have. Whichever one `page.js` reached for would be the wrong
one in the other target — and the plugin bundle would be carrying it either way, since the
page is compiled into the plugin rather than loaded beside it.

## Decision

**`page.js` takes settings in and hands changes back. It stores nothing.**

Three optional entries on the deps object it already receives:

| | |
|---|---|
| `folderColors` | the saved map, at mount |
| `onFolderColors(map)` | called after a change, with the new map |
| `settingsUI` | show the gear and its panel |

The standalone passes all three: it reads `localStorage` in `shell.html`'s bootstrap,
writes it back in the callback, and turns the gear on. The plugin passes only the first —
it reads its own settings, and Obsidian's settings tab is its UI.

## Why the plugin does not get the gear

`settingsUI` exists because the honest default is *off*. Obsidian gives every plugin a
settings tab; a page with its own gear inside the view would mean the same setting had two
UIs in one product, and the second one is the one that stops being updated. So the gear is
the standalone's answer to a question Obsidian has already answered for the plugin, rather
than a feature the plugin declines to use.

The cost is one duplicated list: `SLOT_NAMES` exists in both `page.js` and
`plugin/main.js`. It is a copy rather than an import because `page.js` keeps every name
inside `mountVaultGraph`, and it has to — the standalone build strips the `export` line and
turns the module into a plain `<script>`, where anything at module scope becomes a browser
global. Both copies carry a comment saying they must match.

## What the plugin's settings tab did to the four settings that already existed

`ghosts`, `templates`, `flatMonths` and `words` had been real settings since the plugin
was written, persisted through `saveData()`, and reachable only by hand-editing
`data.json`. The tab is the first UI any of them has had.

They differ from a colour in one way that matters, and the tab treats them differently:
they change **what is in the graph**, so they go through `render()` and rebuild. A colour
is not an input to the layout, so it goes through `api.setFolderColors()`, which repaints
and leaves every node where it was. Rebuilding on a swatch click would throw away a settled
disc and replay the reveal animation.

## Consequences

- The standalone's `localStorage` key is **scoped by vault name**
  (`vault-graph:settings:<vault>`). Two graphs built from different vaults are the same
  `file://` origin as far as the browser is concerned, so an unscoped key would have them
  overwrite each other's colours.
- Every `localStorage` access is wrapped. It *throws* rather than returning null with site
  data blocked, and in some builds on `file://` — and a settings store is not worth taking
  the page down for. The failure mode is that colours stop outliving the tab.
- Anything arriving from either store is filtered against the known slot keys before use.
  It has been through a JSON file in both cases, and an unrecognised key would otherwise
  resolve to `undefined` and paint a group black.
- Deliberately **not** persisted: filters, highlights, the timeline, the theme. The
  standalone's `Refresh` button documents itself as resetting every filter, and a restored
  filter state would quietly contradict it.
