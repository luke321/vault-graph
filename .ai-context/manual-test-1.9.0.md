# Manual test log — 1.9.0 (unreleased)

Every defect on `develop` since the `1.8.0` tag that a person has to look at, because no
automated check can. Sixteen of the seventeen gates assert numbers; none of them can see
that something looks wrong, and every visual defect in this project so far was found by
somebody looking at it.

Work down the list and write the date and result in the right-hand column. A test that
fails is worth more than the whole rest of the sheet — reopen the issue with what you saw.

## Setting up

Two hosts, and a fix can be right in one and wrong in the other — that is what github#34
turned out to be. Anything touching settings, the right-click menus or persistence wants
both. Anything purely about layout or animation only needs the page.

**The standalone page** — fastest loop, and the only one where `__vg` is on the console:

```bash
node scripts/make-test-vault.mjs --out ./tv10k --notes 10000 --years 10
node src/build-graph.mjs --vault ./tv10k --out ./tv10k/graph.html
```

Open that HTML in Chrome. `__vg.timeScale = 4` slows every animation to a quarter speed,
which is how #44 was found and the only practical way to watch a cascade honestly.

**The Obsidian plugin** — the host that ships:

```bash
node scripts/build-plugin.mjs
./scripts/install-plugin.ps1
```

Then reload plugins in Settings → Community plugins and run "Vault Graph: Open the graph".

---

## github#44 — the disc bursting past its ring

Fixed by conserving the band's locked thickness across a cascade. Measured 1.336x → 0.996x
of the locked outer radius.

| | |
|---|---|
| **Where** | Page. Needs the 10k vault — the bigger the vault the more obvious. |
| **Setup** | `__vg.timeScale = 4` in the console first. Without it this is four frames and you will not see it. |
| **Do** | Click a year chip on the date strip — 2016 is the worst case. Watch the OUTER RIM of the disc, not the notes. Then click it again to go back, and try two or three other years. |
| **Expect** | The rim stays inside the ring for the whole animation. Notes re-pack inward and outward within the disc, but the outer edge itself never swells past where it sits at rest. |
| **The bug** | The whole disc balloons outward — a third bigger than at rest on a bad year — then contracts back as the animation lands. The end state was always correct, so it only exists in the middle. |
| **Also check** | Drag the date brush to a narrow range (the last 2.5%). Same expectation. And confirm the hub hole in the middle never changes size — it was never affected, and it should stay that way. |
| **Numbers** | Console: `__vg.rings()` gives the locked geometry. `r0` and `maxR` are what nothing should cross. |
| **Result** | |

## github#45 — the unlinked regroup now animates

Behaviour change, not a repair. Verify it reads well rather than that it merely happens.

| | |
|---|---|
| **Where** | Both hosts. Needs a vault with real unlinked notes — the generated fixtures all guarantee some. |
| **Do** | Right-click the `(unlinked)` row in the legend and turn "unlinked notes join their folder" OFF, so the notes gather into their own group. Then turn it back ON and watch. |
| **Expect** | The unlinked notes sweep round the disc to their own folders' wedges instead of teleporting. Both directions animate. It ends exactly where the old snap put it. |
| **Watch for** | This is the one that could look wrong rather than be wrong. A note can now travel most of the way round the disc, several at once, crossing other wedges on the way. Judge whether that reads as "they went home" or as a scramble. If it is the latter, say so — that is a real finding and the fix is a different animation, not a revert. |
| **Also** | Do it from the settings panel row as well as the right-click row; both call the same path but only one of them has ever been clicked in anger. |
| **Then** | Reload. The toggle must come back the way you left it, on both hosts. |
| **Result** | |

## github#46 — soloing drops the hovered row's highlight

| | |
|---|---|
| **Where** | Both hosts. Any vault. |
| **Do** | Point at a folder row in the legend so its notes light up. **Without moving the mouse at all**, click that row's `only` chip. Keep the mouse still after the click. |
| **Expect** | The other folders leave, and the notes of the folder you are pointing at stay lit the whole time and after. |
| **The bug** | The highlight fades out during the animation and stays out — until you twitch the mouse, at which point it returns. Holding the mouse perfectly still is the whole test; any movement hides the defect. |
| **Also check** | The same on a subfolder row's `only` chip. And move the pointer OFF the legend before clicking `only` on a row by keyboard-free means — nothing should light up that you are not pointing at. |
| **And** | Point at row A, click row B's `only` — the highlight should follow what is under the pointer after the rebuild, not what you clicked. |
| **Result** | |

---

## Also unreleased in 1.9.0, and worth a pass

These landed earlier on `develop` and have had less live use than the three above.

| Defect | Test | Result |
|---|---|---|
| **github#3** — unlinked notes join their folder | An unlinked note takes its folder's wedge, band, colour, count, filter and highlight, exactly like a linked one. With the toggle off, the `(unlinked)` group comes back with its own recessive grey and sorts last in the legend. The second toggle (`unlinkedTintByFolder`) only appears once the first is off. | |
| **github#34** — hidden-by-default from the legend | Right-click a folder row, toggle "hidden by default". **Reload.** It must survive — the whole defect was that it repainted live and silently reverted, and only on the plugin host. Test in Obsidian, not the page. | |
| **github#39** — edge strokes at zoom | Select a well-connected note, then zoom right in. Its links must stay traceable as individual lines rather than merging into one mass. | |
| **github#42** — the resting web fogging the disc | At rest on a dense vault, the middle of the disc and the hub hole stay readable rather than veiled in grey haze. Check on a sparse vault too: a lone link must not thin away to nothing. | |
| **github#35** — dot size in the hub row | Solo a small folder that locks to the inner ring. Its notes must not overflow past the hub. | |
| **github#38** — hover on the selected note | Select a note, hover it, move away. Nothing should flick or ramp — selection already holds the treatment at full. | |
| **github#14** — camera auto-fit | Toggle a folder's visibility without having touched the camera: the view should fit itself. Then pan or zoom deliberately and toggle again: it must now leave your camera alone. | |

---

## If something fails

Reopen the issue with what you saw, on which host, and on which vault shape. For anything
visual a screenshot is worth more than a description — and never attach a built
`vault-graph.html` or a screenshot of your own vault, both of which carry every note title
in plain text. `node scripts/make-mirror-vault.mjs` gives the same shape under invented
names.
