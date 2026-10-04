// github#119
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const REFS = {
  develop: "e8995f1c72e32a139693699ab4c659943593a699",
  pack186: "1a5cee193797f3b2465bc90151990c7cc7581fcb",
};
const bundleArg = process.argv.indexOf("--bundle");
assert(bundleArg >= 0, "Run audit.ps1 to collect the immutable Git blobs first");
const bundle = JSON.parse(readFileSync(process.argv[bundleArg + 1], "utf8"));
const blob = (ref, path) => { const value = bundle[`${ref}:${path}`]; assert(value, `Missing blob ${path}`); return value.text; };
const oid = (ref, path) => bundle[`${ref}:${path}`].oid;
const round = n => Math.round(n * 1e6) / 1e6;

function sourceAt(ref) {
  const source = blob(ref, "src/page.js");
  const ast = ts.createSourceFile("page.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const mount = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "mountVaultGraph");
  assert(mount, "mount function missing");
  const functions = new Map(), vars = new Map();
  for (const n of mount.body.statements) {
    if (ts.isFunctionDeclaration(n)) functions.set(n.name.text, n.getText(ast));
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) {
      if (d.initializer) vars.set(d.name.getText(ast), d.initializer.getText(ast));
    }
  }
  const fn = name => { assert(functions.has(name), `missing function ${name}`); return functions.get(name); };
  const constant = (name, scope = {}) => {
    assert(vars.has(name), `missing constant ${name}`);
    return vm.runInNewContext(`(${vars.get(name)})`, scope, { timeout: 1000 });
  };
  return { source, fn, constant, has: name => functions.has(name) };
}

function fixtureAt(ref) {
  const source = blob(ref, "scripts/make-shape-vault.mjs");
  const start = source.indexOf("let seed ="), end = source.indexOf("if (existsSync(OUT))");
  assert(start > 0 && end > start);
  const scope = { arg: (n, d) => n === "end" ? "2026-01-01" : d, join };
  vm.runInNewContext(source.slice(start, end) + "\nthis.notes = notes;", scope, { timeout: 1000 });
  const notes = scope.notes;
  const carried = new Map(), filed = new Map(), displayed = new Map();
  for (const n of notes) {
    for (const tag of new Set(n.tags || [])) carried.set(tag, (carried.get(tag) || 0) + 1);
    const tag = n.tags?.[0] || "(untagged)";
    filed.set(tag, (filed.get(tag) || 0) + 1);
    const g = n.orphan ? "(unlinked)" : tag;
    displayed.set(g, (displayed.get(g) || 0) + 1);
  }
  for (const tag of filed.keys()) if (!displayed.has(tag)) displayed.set(tag, 0);
  if (!displayed.has("(unlinked)")) displayed.set("(unlinked)", 0);
  const tail = [...carried].filter(([, n]) => n <= 3).map(([g]) => g).sort();
  const prefix = min => {
    let grouped = 0, clusters = 0, run = 1;
    for (let i = 1; i <= tail.length; i++) {
      if (i < tail.length && tail[i].slice(0, min) === tail[i - 1].slice(0, min)) { run++; continue; }
      if (run > 1) { grouped += run; clusters++; }
      run = 1;
    }
    return { grouped, clusters, total: tail.length };
  };
  return {
    notes,
    names: [...displayed.keys()].sort(),
    summary: {
      generatorBlob: oid(ref, "scripts/make-shape-vault.mjs"),
      notes: notes.length, declaredOrphans: notes.filter(n => n.orphan).length,
      carriedTags: carried.size, groupsIncludingEmptyAndSpecial: displayed.size,
      carriedSingletons: [...carried.values()].filter(n => n === 1).length,
      carriedTailAtMost3: tail.length, prefix3: prefix(3), prefix4: prefix(4),
      defaultFiledGroupsAtMost3IncludingEmptyUnlinked: [...filed.values()].filter(n => n <= 3).length + 1,
      defaultFiledSingletons: [...filed.values()].filter(n => n === 1).length,
      alternateOrphansSeparate: {
        groupsAtMost3IncludingZero: [...displayed.values()].filter(n => n <= 3).length,
        singletons: [...displayed.values()].filter(n => n === 1).length,
        nonemptyGroups: [...displayed.values()].filter(n => n > 0).length,
      },
    },
  };
}

function paletteAt(ref, source, names, hueSlots) {
  const css = blob(ref, "src/page.css");
  const theme = Object.fromEntries([...css.matchAll(/--(g\d+)-d:\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
  assert.equal(Object.keys(theme).length, 12);
  const scope = {
    dict: () => Object.create(null), state: { dim: "tag" }, slotOrder: { tag: names }, order: {},
    colorsFor: () => ({}), UNLINKED: "(unlinked)", UNTAGGED: "(untagged)",
    ARCHIVE_SLOT: source.constant("ARCHIVE_SLOT"), HUE_SLOTS: hueSlots ?? source.constant("HUE_SLOTS"),
    THEME: { byKey: theme }, buildSubShades() {}, buildUnlinkedTint() {},
  };
  vm.runInNewContext(source.fn("isArchiveGroup") + "\n" + source.fn("buildColors") + "\nbuildColors();", scope, { timeout: 1000 });
  const grey = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16)); return Math.max(...c) - Math.min(...c) < 26; };
  const tally = {};
  for (const key of Object.values(scope.groupSlot)) tally[key] = (tally[key] || 0) + 1;
  return { groups: names.length, distinctBaseColours: new Set(Object.values(scope.groupColor)).size,
    greyBaseColours: Object.values(scope.groupColor).filter(grey).length, slotCounts: tally };
}

function dotAt(source, floorOverride) {
  const DENSITY_MAX = source.constant("DENSITY_MAX");
  const scope = { DENSITY_MAX };
  for (const name of ["NODE_MIN", "NODE_MAX", "UNIT", "INNER_SCALE", "DOT_OF_PITCH", "DOT_MIN_PX", "DOT_MAX_SPREAD"])
    scope[name] = source.constant(name, scope);
  if (floorOverride !== undefined) scope.DOT_MIN_PX = floorOverride;
  const modern = source.has("restAt");
  for (const name of modern ? ["DOT_OVER_PITCH", "DOT_CLEAR", "DOT_GROW_MAX"] : ["DOT_ROOM_MAX"])
    scope[name] = source.constant(name, scope);
  let per = 0;
  const band = { sp: 1, room: scope.UNIT / 0.92 };
  Object.assign(scope, {
    renderer: { graphToViewport: ({ x, y }) => ({ x: x * per, y: y * per }), getCamera: () => ({ getState: () => ({ ratio: 1 }) }) },
    sizeScale: 1, bandOf: () => band, bandScale: () => 1, pitchUnits: () => scope.UNIT,
    bandLock: null, colWalk: null, cellRoom: { probe: scope.UNIT / 0.92 }, edgeCap: {}, fitCap: false, geomLock: null,
    cascadeRun: null, foldSizes: null, restTaking: false, restHiU: {}, restT: {},
    visSrc: {}, visDst: {}, visEase: 1, graph: { getNodeAttribute: () => (scope.NODE_MIN + scope.NODE_MAX) / 2 },
    filterOn: () => false,
  });
  vm.createContext(scope);
  vm.runInContext(source.fn("measureSizeScale") + "\n" + source.fn("dotPx") +
    (modern ? "\n" + source.fn("dotRamp") : ""), scope);
  const rows = [11.78, 16.76, 18.76, 27.72].map(pixelsPerLatticeUnit => {
    per = pixelsPerLatticeUnit / scope.UNIT;
    vm.runInContext("measureSizeScale()", scope);
    const radius = vm.runInContext("dotPx((NODE_MIN + NODE_MAX) / 2, 'probe')", scope);
    return { pixelsPerLatticeUnit, radiusPx: round(radius), diameterLatticeUnits: round(2 * radius / pixelsPerLatticeUnit) };
  });
  if (scope.DOT_MIN_PX > 0) assert(rows[0].diameterLatticeUnits > rows.at(-1).diameterLatticeUnits);
  else assert.equal(rows[0].diameterLatticeUnits, rows.at(-1).diameterLatticeUnits);
  return { context: "Extracted functions; synthetic midpoint-size dot, unit pitch, ratio 1, no active geometric/frame/rest caps. NOT a rendered fixture.",
    floorPx: scope.DOT_MIN_PX, rows };
}

function plannerAt(source, notes, smallGroup) {
  const scope = { dict: () => Object.create(null) };
  for (const name of ["UNIT", "INNER_SCALE", "INNER_FILL", "MIN_SPAN", "DENSITY_MAX", "CELL_FILL_MAX",
    "EDGE_PAD_ARC", "EDGE_PAD_MAX", "SMALL_GROUP", "NEST_MIN", "SUB_SLOTS", "REF_ROWS", "SEAM_ROWS",
    "SEAM_MAX_ROWS", "SEAM_FALL", "GAP_FULL_TO", "GAP_ZERO_AT", "SLICE_GAP", "GAP_BAND", "SEAM_CAP", "MERGED"])
    scope[name] = source.constant(name, scope);
  if (smallGroup !== undefined) scope.SMALL_GROUP = smallGroup;
  const attrs = Object.fromEntries(notes.map((n, i) => [String(i), { tags: n.tags || [] }]));
  const counts = {};
  for (const n of notes) { const g = n.tags?.[0] || "(untagged)"; counts[g] = (counts[g] || 0) + 1; }
  Object.assign(scope, {
    graph: { order: notes.length, forEachNode: fn => Object.entries(attrs).forEach(([id, a]) => fn(id, a)),
      getNodeAttribute: (id, key) => attrs[id][key], getNodeAttributes: id => attrs[id] },
    order: { tag: Object.keys(counts).sort() }, counts, state: { dim: "tag", pinned: [] },
    groupOf: id => attrs[id].tags[0] || "(untagged)", fileSub: () => "", isPinned: () => false,
    willShow: () => true, hubRank: Object.fromEntries(notes.map((n, i) => [String(i), i])),
    planSkel: null, moveFrom: null, planKeep: null, oldWorld: false, leaving: {},
    bandLock: null, geomLock: null, splitHold: null, subOrder: {}, colWalk: null,
    ringsMerged: {}, lastGapN: {}, BAND: null, planArc: null, trace: null, cellHold: null, standIns: [],
    UNTAGGED: "(untagged)", UNLINKED: "(unlinked)",
  });
  const names = ["groupRank", "byGroupName", "bandOf", "bandScale", "pitchUnits", "gapScale", "seamFall", "seamAngle", "gapFor", "arcSpan", "seamAt", "allocateBand", "buildWedgePlan", "takeGeom"];
  vm.createContext(scope);
  vm.runInContext(names.map(name => source.fn(name)).join("\n"), scope);
  vm.runInContext("order.tag.sort(byGroupName); takeGeom(); this.plan = buildWedgePlan(false);", scope, { timeout: 20000 });
  const plan = scope.plan;
  const bands = {};
  for (const key of ["i", "o"]) {
    const cells = plan.cells.filter(c => c.inner === (key === "i"));
    scope.bandOf(key).sp = key === "i" ? plan.spInner : plan.sp;
    scope.bandOf(key).rows = plan.rows[key];
    const groups = new Set(cells.map(c => c.g)).size;
    const radius = scope.geomLock.bandR[key];
    const gap = scope.gapFor(groups, key);
    const actualSeam = scope.seamAt(radius, groups, key);
    bands[key] = { groups, notes: cells.reduce((n, c) => n + c.list.length, 0), rows: plan.rows[key],
      referenceRadiusGraphUnits: round(radius), pitchGraphUnits: round(scope.pitchUnits(key)),
      allocatorGapDegrees: round(gap * 180 / Math.PI), allocatorGapTotalDegrees: round(gap * groups * 180 / Math.PI),
      seamAtReferenceRadiusDegrees: round(actualSeam.gap * groups * 180 / Math.PI) };
  }
  return { context: "Exact extracted planner/takeGeom/seam functions; default joined orphan filing, flat generated tags, unit weights, stable index rank. No renderer, cascade, or ringsLayout; seam samples are reference-radius values, not rendered arc coverage.",
    bands, geometry: { r0: round(plan.r0), rOuter: round(plan.rOuter), maxR: round(plan.maxR) }, mergedGroups: Object.keys(scope.ringsMerged).length };
}

const result = { schema: 1, evidence: "Browser-free source execution and archived-data reanalysis; not a browser regression run.", refs: REFS, revisions: {} };
for (const [label, ref] of Object.entries(REFS)) {
  const source = sourceAt(ref), fixture = fixtureAt(ref);
  const scale = source.constant("INNER_SCALE"), fill = source.constant("INNER_FILL");
  result.revisions[label] = {
    sourceBlob: oid(ref, "src/page.js"), fixture: fixture.summary,
    palette: paletteAt(ref, source, fixture.names), dot: dotAt(source),
    planner: plannerAt(source, fixture.notes),
    controls: {
      context: "Counterfactual VM globals only; no product file changed and no proposed fix is approved.",
      twelveHueSlotsGreyGroups: paletteAt(ref, source, fixture.names, 12).greyBaseColours,
      zeroFloorDiameters: dotAt(source, 0).rows.map(r => r.diameterLatticeUnits),
      smallGroupFour: plannerAt(source, fixture.notes, 4),
    },
    mechanisms: { smallGroup: source.constant("SMALL_GROUP"), minSpanDegrees: round(source.constant("MIN_SPAN") * 180 / Math.PI),
      pinBelowTen: source.fn("buildWedgePlan").includes("var PIN_BELOW = 10;"),
      roomCost: source.fn("buildWedgePlan").includes("ROOM_WEIGHT * t.room"),
      planRoom: /room:\s*roomPlan/.test(source.fn("buildWedgePlan")),
      roomPool: source.source.includes("roomPool"),
      innerScale: scale, innerFill: fill },
    issue132Recalculation: { context: "Reinterprets the issue's ROUNDED 1063/2439 rails and 1438 last centre; not fresh geometry.",
      innerLow: round(1063 * scale), innerHigh: round((1063 + (2439 - 1063) * fill) * scale),
      centreShortfall: round((1063 + (2439 - 1063) * fill) * scale - 1438) },
  };
}
assert.deepEqual(result.revisions.develop.fixture, result.revisions.pack186.fixture);
assert.deepEqual(result.revisions.develop.palette, result.revisions.pack186.palette);
assert.deepEqual(result.revisions.develop.planner, result.revisions.pack186.planner);
for (const revision of Object.values(result.revisions)) {
  assert.equal(revision.controls.twelveHueSlotsGreyGroups, 22);
  assert.equal(revision.planner.mergedGroups, 0);
  assert(revision.controls.smallGroupFour.mergedGroups > 0);
}
assert.equal(result.revisions.develop.mechanisms.planRoom, true);
assert.equal(result.revisions.pack186.mechanisms.planRoom, false);
const archive = JSON.parse(blob(REFS.pack186, ".ai-context/investigations/186/runs/packed-data.json"));
result.archivedPacking = Object.fromEntries(Object.entries(archive).map(([name, act]) => [name, {
  label: act.label, frames: act.frames?.length,
  rest: Object.fromEntries(Object.entries(act).filter(([k, v]) => k !== "frames" && v && typeof v === "object").map(([k, v]) => [k, {
    wedges: v.covers?.length, median: v.median, min: v.min,
    below85: Array.isArray(v.covers) ? v.covers.filter(w => w.cover < 0.85).length : undefined,
  }])),
}]));
const output = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--write")) writeFileSync(join(HERE, "measurements.json"), output);
process.stdout.write(output);
