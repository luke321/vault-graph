# Attribution

The renderer under this directory is a port (github#58). Its camera and viewport math
(`viewport.ts`, `camera.ts`), its pointer handling (`captor.ts`), its colour packing
(`colors.ts`) and the four WebGL programs with their GLSL (`programs.ts`) were written from
**Sigma.js 3.0.2** -- the core package and its `@sigma/edge-curve` and `@sigma/node-border`
satellites, all three released from one repository under the one licence below -- with the
arithmetic kept as it was, because every measured constant in `src/page.js` was calibrated
against the pixels it produced. What Sigma did that this page never used (the label density
grid, the picking framebuffer, touch input, edge events, WebGL1) was left out; what remains is
ours to maintain, and is typed and linted as ours.

Sigma.js is MIT licensed. Its notice is reproduced here as the licence asks, and **travels
with both built artifacts**: `notice.mjs` beside this file lifts the block below into a `/*!`
legal comment that `scripts/build-plugin.mjs` puts at the top of `main.js` and
`src/build-graph.mjs` puts at the top of the engine `<script>` in every exported
`vault-graph.html`. (esbuild drops the source files' own comments, so without that banner a
copy of the port shipped with no notice at all.) The copyright line is upstream's, copied from
`LICENSE.txt` at the `sigma@3.0.2` tag rather than reconstructed.

MIT License

Copyright (C) 2013-2025, Alexis Jacomy, Guillaume Plique, Benoît Simard https://www.sigmajs.org

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

The graph store (`store.ts`) replaced graphology 0.26.0 and shares no code with it; it
reproduces one behaviour on purpose -- the order a node's neighbours come back in -- and says
so where it does.
