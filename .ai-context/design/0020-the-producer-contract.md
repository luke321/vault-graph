# 0020 — The producer contract

github#149, generalising github#141 and github#152.

## The situation

Two producers build the same `VaultData` for the same page from two different hosts:

| | reads | emits |
|---|---|---|
| `src/build-graph.mjs` | a filesystem — `walk()`, a frontmatter parser, a wikilink miner, a resolver | one HTML file with `window.VAULT_DATA` in it |
| `plugin/build-data.mjs` | Obsidian — `getMarkdownFiles()`, `metadataCache`, `file.stat` | the object `mountVaultGraph()` is handed |

`src/page.js` declares what they both owe it — `VaultNode`, `VaultEdge`, `VaultStats`,
`VaultData` — and before this record nothing read that declaration back against what either
producer actually emitted. The policy that decides the values was written out twice, and the
plugin's own header said so: *"ported from `src/build-graph.mjs`, line-for-line"*. A port is a
copy that drifts.

## What it had already cost

**github#141** is the proof. Three of its defects were one defect in two places: both adapters
keyed a ghost by basename, so both had to be found and both had to be corrected. Its fix —
`src/links.mjs`, one pure module with no imports, shared by both hosts and gated by
`scripts/check-link-resolution.mjs` — is the shape this record generalises.

**github#152** is the second proof, and the more interesting one: the exporter shipped ghosts with
`dirs` and `touched` missing outright, while the plugin's ghosts carried both. The page papered
over it with fallbacks, so nothing visibly broke and nothing caught it. That is what an unenforced
contract looks like from the outside — working software, and a shape nobody can rely on.

## Measured before the change, 2026-09-21

Matching the two producers' sources for the policy they both apply:

| | |
|---|---|
| byte-identical duplications | **7** — `MONTHISH`, `TYPE_ALIAS`, `SKIP_FILES`, `deNumber`, `slug`, `singular`, `norm` |
| near-duplicates | **5** — `under` (`dir &&` vs `!!dir &&`), `inferType`'s body (`split(sep)` vs `split("/")`), `paraDirs`'s body (a module constant vs a parameter), the ghost node literal, the tag normaliser (`??` vs `\|\|`) |

The five are the number that matters. None of them changed behaviour on the day they were
measured; each was one careless edit away from doing so, and nothing would have caught it.

## The decision

**Three modules and one gate**, on the `src/links.mjs` pattern.

- **`src/taxonomy.mjs`** — the policy, as pure functions. The month-folder rule, the type aliases
  and `inferType`, the slug trio, `paraFolder` / `paraDirs`, tag normalisation, word counting, the
  skip list, the ghost factory, the edge book, the generated stamp.
- **`src/contract.mjs`** — the output shape as *data*: every field with its type and whether it is
  required, plus the declared host divergences, `validate()` and `shapeOf()`.
- **`plugin/build-data.mjs`** — the adapter, lifted out of `plugin/main.js`.
- **`scripts/check-producer-contract.mjs`** — both producers over one fixture, in the hook and at
  the merge boundary.

**No imports in the two `src/` modules.** That is not tidiness: they are bundled into the plugin,
so a `node:` import in either one reaches `main.js`. It is the same constraint `src/links.mjs`
satisfies by having no imports at all, and it is what makes "share the policy" non-trivial here.

### Why the contract is declared AND documented, not one or the other

`src/page.js`'s typedefs stay the readable original; `src/contract.mjs` is the machine-readable
copy; the gate asserts the two agree.

Neither alone works. A typedef is checked by `tsc` only where a producer annotates itself into a
type program, and no type program sees what a producer *emits at runtime* — github#152's missing
`dirs` was legal JavaScript that no compiler was looking at. And a declaration that nothing
cross-checks drifts from the doc it claims to mirror, which is the failure mode this record exists
to prevent, one level up.

`scripts/check-link-resolution.mjs` already does a one-field version of this: since github#152 it
reads the `VaultNode` typedef text to derive the required key list. That does not scale to types
and optionality, which is why the declaration is a table here rather than a parse.

### Why the plugin adapter moved to its own file

To compare the two producers, something other than Obsidian has to be able to run one of them.
`plugin/main.js` imports `obsidian`, `raw:`, `b64:` and `vg:`, so importing it in Node is
impossible and `buildData` was not exported anyway.

`plugin/build-data.mjs` imports **nothing from `obsidian` at runtime**. The one thing it genuinely
needed — `normalizePath`, which also NFC-normalises and is not honestly reimplementable — is handed
in on an explicit `host` argument. That *is* the adapter boundary this record is about: host
access in the adapter, policy in the shared module.

The alternative considered and rejected: leave `buildData` where it is and bundle `plugin/main.js`
with an `obsidian` stub to reach it. It works, but its failure mode is an opaque bundling error
rather than a named missing field, and it leaves the boundary implicit.

### Why a divergence must still happen

`DIVERGENCES` in `src/contract.mjs` names five host differences that are real and permanent:
`dev` and `folderOrder` are the exporter's alone, `readWords` and `_spike` are the plugin's, and
`words` is `0` on every plugin node until the deferred read has run.

The gate fails on an **undeclared** difference *and* on a **declared one that no longer occurs**.
Without the second half the list becomes an allowlist, and the first genuinely new difference to
land on one of those keys is waved through. This is what keeps "a documented divergence" different
from "papered over", which is the distinction github#149 asks for by name.

### What this gate deliberately does not measure

**Link resolution.** `scripts/check-link-resolution.mjs` owns it, pinned against Obsidian's own
`metadataCache`. The fake host here is handed `resolvedLinks` and `unresolvedLinks` as fixture
data, so what is compared is everything *downstream* of resolution — and the comparison is not
circular, which it would be if the fixture's cache were computed by the exporter's own resolver.

**The alias divergence is stated and not checked, on purpose.** The exporter resolves frontmatter
aliases when it mines a link; Obsidian's cache does not expose the same resolution, so `[[Nickname]]`
reaches an aliased note in the standalone and becomes `ghost:Nickname` in the plugin. It is recorded
on github#141 and named in `ALIAS_DIVERGENCE`. It moves which **nodes** exist, not which **fields**
they carry, so it belongs to resolution rather than to shape, and making the two hosts agree is a
behavioural change with its own ticket to write.

## What the gate catches, measured

Each of these was applied to the tree, the gate run, and the change reverted:

| mutation | caught by |
|---|---|
| the exporter drops `sub` | `validate()` — required and missing — and the shape diff |
| the exporter grows an undeclared field | `validate()` — not in the contract — and the shape diff |
| the plugin changes one field's value policy | the value diff, node for node, in both flat-month states |
| the plugin grows an undeclared field | `validate()` and the shape diff |
| the **shared** module's month rule changes | the fixture assertions — see below |

The last row is the one worth reading twice. A change to `src/taxonomy.mjs` reaches both producers
at once, so by construction it is *not* a divergence and the cross-producer diff stays silent —
which is exactly what sharing the policy is for. The fixture assertions are what hold the policy
itself: a month folder never names a type, a month folder ends the walk, and `--flat-months` drops
it rather than keeping it. A first draft of those assertions passed under the mutation, because
they only checked the case where both readings agree; the buried note under a month folder is in
the fixture because of it.

`--flat-months` is the one shared rule that takes a parameter, so the whole comparison runs twice,
once in each state. A policy that agrees in its default and diverges under a flag is the failure
that second pass exists for.

## What sharing the policy found immediately

Neither of these was introduced by the merge. Both had been sitting in the duplicated halves,
which is the argument for the merge.

**`type: constructor` returned a function.** `TYPE_ALIAS` was a plain object literal indexed by
whatever a note's frontmatter `type:` says, so `TYPE_ALIAS["constructor"]` is
`Object.prototype.constructor` before anything is stored. This is github#97's class — the same
defect that killed four one-note vaults at boot when the planner's maps were plain `{}` — one
level up, in a map the *user* keys. `constructor` is the only reachable name, because `fm.type`
is lowercased first and the other prototype members are camel-cased. Null prototype now, once,
where both hosts read it.

**The plugin counted a word that was not there.** It matched `^---` against the BOM-stripped text
and sliced the **original**, so a note with a byte-order mark kept one character of its own
frontmatter: 7 words where the exporter said 6. The exporter was right — `parseFrontmatter` sliced
the same string it matched. `noteBody()` is that rule in one place, and both call it.

**The check had a hole that let the second one through**, which is worth recording because the
hole is a design mistake and not a typo. `words` was filed as a `field-value` divergence, and that
exempted it from the node-for-node comparison — so the one field where the two hosts provably
disagreed was the one field never compared. What actually diverges about `words` is its **timing**:
it is `0` until `readWords()` has been awaited, and correct after. That is a `deferred-value`, and
the gate now asserts the zero state *and* compares the value.

The general lesson, for the next entry added to `DIVERGENCES`: a divergence exempts something from
a check, so the narrowest true description of it is the only safe one.

## The limit of this gate, stated

**The plugin adapter is run against a fake host, never against Obsidian.** The fake supplies only
*inputs* — the file list, the frontmatter, `resolvedLinks`, `unresolvedLinks`, `file.stat` — and
every decision about what a node carries is still made by the real `buildData`. That is what makes
it worth running. It is also the assumption the whole gate rests on, so it is worth being plain
about what it cannot catch: **if the fake drifts from what Obsidian actually hands over, the gate
keeps passing while the plugin is wrong in Obsidian.**

That is not hypothetical. It happened during this ticket: the fake's frontmatter parser did not
strip a byte-order mark before matching `^---`, where Obsidian does, and the gate reported a tag
difference the two real hosts do not have. It was the fixture that was wrong, and the fixture was
fixed — but a drift in the other direction would be silent.

Two things bound it. The fake reads the **same files on disk** the exporter reads, and takes its
timestamps from the same `statSync`, so nothing about the file layer is invented. And the plugin's
behaviour in real Obsidian is covered where it always was: `scripts/obsidian-smoke.mjs`,
`scripts/refresh-check.mjs` and `scripts/deferred-check.mjs`, which launch the real application.
This gate is about the two producers agreeing; those are about the plugin working.

## One divergence reported and deliberately not fixed

`tags: false` in frontmatter becomes the tag `"false"` in the exporter and no tag at all in the
plugin. The exporter's own parser yields the string `"false"`; Obsidian yields the boolean. This is
pre-existing — it predates the shared module — and `||` was kept over `??` in `normalizeTags()`
because `||` preserves **both** hosts byte for byte, where `??` would have changed the plugin.

Closing it means teaching the exporter YAML scalar types, which is a real change to a parser this
ticket has no business touching. It is not in `DIVERGENCES` because that list is keyed by field,
and declaring `tags` would exempt all tag comparison rather than this one value.

## Cost

Four files, and the gate runs in about a second: no Chrome, no Obsidian, a fixture of nine notes
and one subprocess build. `plugin/main.js` lost 383 lines to `plugin/build-data.mjs`; the exporter's
output on a fixture vault is byte-identical to before the change, and
`scripts/check-link-resolution.mjs` — which builds real vaults and asserts exact edges, ghost
identities and degrees — passes unchanged.
