# Theme

**Status** as-built · extracted from the README on 2026-08-22

> Dark only, and where the palette is defined.


Dark by default (`data-theme="dark"` on the root element); the `theme` button
top-right flips it, and both palettes are defined explicitly. Two things Sigma gets
wrong out of the box on a dark surface, fixed here:

- its default `labelColor` is **black**, so canvas node labels were near-invisible
- its hover label pill is hardcoded `#FFF`, so it's replaced with a themed drawer

Every colour the canvas needs is resolved once per theme change into a `THEME`
object rather than read per node per frame, which also took `getComputedStyle` out
of the render loop.
