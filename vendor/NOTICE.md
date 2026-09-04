# Third-party notices

> This project bundles the MIT-licensed code below in `vendor/` and **inlines it into
> every generated HTML file**, so each build redistributes it. These notices must be
> preserved in redistributions. (This paragraph used to sit at the bottom of `LICENSE`,
> where the extra text made GitHub classify the repo's licence as "Other" instead of MIT.)


This directory contains third-party code committed rather than installed — the project
uses no package manager and no network at build time. The library is **inlined into every
generated `vault-graph.html`**, so this notice travels with the output as well as with the
source (see the header `src/build-graph.mjs` emits).

It is MIT licensed. The minified build shipped here has had its comment header stripped by
its own build pipeline, which is why the notice is reproduced in full below rather than
living in the file. graphology sat beside it until github#58 replaced it with our own graph
store (`src/engine/store.ts`); Sigma follows in the same issue.

| file | library | upstream |
|---|---|---|
| `sigma.min.js` | Sigma.js — WebGL graph renderer | https://github.com/jacomyal/sigma.js |

## Modifications

The bundles here are **byte-identical to upstream** and are meant to stay that way, so that
a reader can diff them against the release they came from. One change is applied **at build
time**, by `src/vendor.mjs`, and therefore travels in every redistributed build:

| file | change |
|---|---|
| `sigma.min.js` | the two `fetch()` calls inside `loadSVGImage` are replaced with a function that throws |
| `sigma.min.js` | `handleLeave` clears `hoveredNode` and `hoveredEdge`, which upstream leaves set |

The first is in Sigma's node-image path, which this project never registers a program for, so
those calls were unreachable. They are removed rather than left in place because the shipped file
is read by users and by the Obsidian directory's automated review, and "zero network calls"
is a claim a reader can check while "unreachable" is one they have to take on trust. The
reasoning, and the alternatives that were rejected, are in
[`.ai-context/decisions/0008-zero-network-calls.md`](../.ai-context/decisions/0008-zero-network-calls.md).

The second is an upstream defect rather than a preference. `handleLeave` emits `leaveNode`
but never clears the node it just said you left, so once the pointer leaves the container
Sigma still believes it is hovering — and moving back onto the *same* node emits nothing,
because the re-entry test is `hoveredNode !== nodeAtPosition`. The hover simply never comes
back. `handleMove` two lines earlier does clear it, which is what makes this look like an
oversight rather than a design. Measured and asserted by
`node scripts/smoke.mjs` — "hover re-arms after the pointer leaves the stage".

MIT asks that the notice above be preserved in redistributions; stating what was changed is
the other half of doing that honestly.

> **Version: sigma 3.0.2.** It was vendored without pinning, and identified on 2026-09-04 by
> hashing the file against the `dist/` builds in the npm tarballs: `sigma.min.js` is
> byte-identical to `sigma@3.0.2/dist/sigma.min.js` (sha256 `be6f790d…`, 186,853 bytes;
> 3.0.1 and 3.0.3 differ). The graphology bundle that used to sit beside it was
> `graphology@0.26.0` (sha256 `dc337efa…`, 73,629 bytes) and is gone. Sigma is being replaced
> by code of our own — `.ai-context/decisions/0012-*.md`, github#58 — so this is a record for
> the port, not a pin to maintain.

---

## Sigma.js

MIT License

Copyright (c) 2013-2024 Alexis Jacomy, Guillaume Plique and Sigma.js contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

**Verify the copyright lines above against the upstream `LICENSE` files before publishing.**
They were reconstructed from the projects' stated licensing, not copied out of the shipped
minified bundles, which no longer carry a header. If either upstream has changed its
copyright holders or years, upstream is authoritative.
