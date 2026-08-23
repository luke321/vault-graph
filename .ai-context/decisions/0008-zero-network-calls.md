# 0008 — Zero network calls, enforced at read time

**Date** 2026-08-23 · **Status** accepted · **Issue** [#1](https://github.com/luke321/vault-graph/issues/1)

## Context

The Obsidian directory's automated review reports, under **Disclosures**, how many network
request calls the shipped `main.js` contains:

> All network requests should be necessary and disclosed to users.
> **2 network calls**

Both were Sigma.js's `loadSVGImage`, which `fetch`es an SVG so a **node-image program** can
draw from it — one call with `credentials: "include"`, one without. Nothing here draws
image nodes: the page registers exactly two programs, `EdgeCurveProgram` and
`createNodeBorderProgram` (the Sigma constructor in `src/page.js`).

So the count was **2 unreachable calls**, and that is still the wrong number to ship. Both
artifacts are offline objects — one HTML file people open off a USB stick, and a plugin
that reads a vault which is nobody else's business — and the whole claim rests on a reader
being able to check it. "There is a `fetch` in there but we never take that path" is a
claim a user has to take on trust; **0** is a claim they can verify with a grep.

The calls cannot be tree-shaken away. `vendor/` holds **pre-built UMD bundles**, committed
rather than installed — no package manager, no network at build time (`0005`) — and a UMD
bundle is one opaque expression to any bundler.

## Alternatives weighed

| Option | Why not |
|---|---|
| **Leave them and disclose** | Disclosure is for requests that are *necessary*. Ours are not made at all; a disclosure would describe a thing that never happens, which is worse than silence. |
| **Install Sigma from npm and tree-shake** | Would work, and would drag the whole reason `vendor/` exists behind it: a lockfile, a network at build time, and a supply chain for a project whose selling point is that it has none. |
| **Edit `vendor/sigma.min.js` in place** | Cheapest, and it destroys the one property that makes a committed bundle honest — that it can be diffed byte-for-byte against the upstream release it came from. A patched vendor file is a fork nobody remembers making. |
| **Shadow `fetch` with a local binding** | Neutralises the call at runtime while leaving the literal `fetch(` in the shipped file. The reviewer's count, and a user's grep, would both still say 2. It hides the thing instead of removing it. |

## Decision

**Strip them at read time, in one place, for both consumers.** `src/vendor.mjs` reads a
vendored bundle and replaces each bare `fetch(` with a self-contained thrower before
handing the source on:

```js
(function(){throw new Error("vault-graph: this build makes no network requests")})
```

`src/build-graph.mjs` inlines the result into the HTML; `scripts/build-plugin.mjs` feeds it
to esbuild through an `onLoad` hook, which is the only place to get in front of esbuild
reading the import off disk itself.

`vendor/` therefore stays byte-identical to upstream. The modification travels with the
build, and `vendor/NOTICE.md` records it — MIT redistribution asks that changes be stated,
and a notice that describes something other than what shipped is not a notice.

A **thrower** rather than a rejected promise: the throw lands inside Sigma's own
`try`/`catch` (`loadImage` falls back to a plain `new Image()` for the SVG case), so the
unreachable path degrades rather than hangs, and if it ever did become reachable a stack
trace naming this repo beats an image that quietly never appears.

**The count is the gate.** Each bundle declares how many calls it is expected to contain
and a mismatch is a hard build error, not a silent strip:

```
vendor.mjs: vendor/sigma.min.js has 3 fetch call(s), expected 2.
```

That is the part that matters in a year. Stripping is mechanical; noticing that an upstream
update added a *third* call — one that might be necessary, and would then have to be
disclosed rather than removed — is not.

## Consequences

- `scripts/check-network.mjs` asserts the answer stayed zero from three directions: our own
  sources, the vendored bundles after stripping, and whatever a build left behind. Static,
  no browser, milliseconds — so it joins the PII and scope checks on `pre-push` **with no
  skip flag**. The three unskippable gates are all of the same kind: cheap, and about
  someone other than us.
- The check covers **remote resources** as well as JS calls — `src=`, stylesheet `href=`,
  `@import`, `url()` pointing anywhere absolute. A webfont is a request too, and a quieter
  one. Anchors are deliberately excluded: a link a person may choose to click is not the
  page reaching out on its own.
- An SVG node image with a fixed `size` would fall back to a plain raster load rather than
  being re-sized. No consequence today — nothing registers a node-image program — and if
  something ever does, this record is what it should read first.
- `EXPECTED_FETCHES` must be updated in the same commit as any bundle upgrade, after
  reading what the new calls do. The error message says so.

## Verify

```bash
node scripts/check-network.mjs      # -> check-network: clean (10 files, 2 built artifacts)
```

Measured 2026-08-23: built `main.js` 533 KB with **0** network primitives and 2 throwers;
a standalone page over a 3003-note synthetic vault, **0**. Both guards fail as they should —
a planted `fetch` in `plugin/main.js`, and a third `fetch` in a copied Sigma bundle.
