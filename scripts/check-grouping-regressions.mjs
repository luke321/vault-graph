// github#186
import { readFileSync } from "node:fs";

export async function groupingRegressionCheck(p) {
  const markup = readFileSync(new URL("../src/page.html", import.meta.url), "utf8");
  await p.eval(`window.__groupingRegressionResult = null; (async () => {
    const original = window.VAULT_DATA, settings = loadSettings(), scale = __vg.timeScale;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const ready = async () => {
      const end = performance.now() + 15000;
      while (!window.__vg || __vg.demo.busy()) {
        if (performance.now() > end) throw Error('Grouping regression did not settle');
        await wait(25);
      }
    };
    const mount = async (data, prefs) => {
      __vg.destroy();
      const holder = document.createElement('div');
      holder.innerHTML = ${JSON.stringify(markup)};
      document.getElementById('vg-app').replaceWith(holder.firstElementChild);
      window.__vg = null;
      mountVaultGraph(document.getElementById('vg-app'), data, Object.assign({}, prefs, {
        Graph: VaultGraphEngine.GraphStore, Renderer: VaultGraphEngine.Renderer,
        logoMask: window.VAULT_LOGO_MASK || '', settingsUI: true
      }));
      await ready();
    };
    const data = Object.assign({}, original, {
      nodes: Array.from({length: 100}, (_, i) => ({
        id: (i < 80 ? 'F' : 'G') + '/Note-' + i + '.md', label: 'Note ' + i,
        folder: i < 80 ? 'F' : 'G', sub: '', dirs: [], type: 'note',
        tags: [i < 60 ? 'big' : i < 96 ? 'medium' : i < 98 ? 'tiny-a' : 'tiny-b'],
        created: '2026-09-01', touched: '2026-09-01', words: 20, deg: 2
      })),
      edges: Array.from({length: 100}, (_, i) => ({s: i, t: (i + 1) % 100, w: 1})),
      stats: Object.assign({}, original.stats, {files: 100, nodes: 100, edges: 100, orphans: 0, unresolved: 0}),
      sortSpecs: []
    });
    const prefs = {dim: 'folder', folderShown: {F: true, G: true}, tagShown: {},
      pinned: [], unlinkedByFolder: true, folderOrder: 'name'};
    const rings = () => {
      const plan = __vg.buildWedgePlan(true, id => __vg.alpha[id] || 0);
      let pooled = 0, wrong = 0, inner = 0;
      plan.cells.forEach(c => {
        const tiny = c.list.filter(id => __vg.groupOf(id).startsWith('tiny-'));
        if (new Set(tiny.map(id => __vg.groupOf(id))).size < 2) return;
        pooled += tiny.length;
        if (c.inner) inner += tiny.length;
        tiny.forEach(id => {
          if (__vg.isInner(id) !== c.inner || __vg.dotWhy(id).band !== (c.inner ? 'i' : 'o')) wrong++;
        });
      });
      return {pooled, inner, wrong};
    };
    try {
      await mount(data, prefs);
      __vg.setDim('tag');
      const cold = rings();
      __vg.relayout();
      const retaken = rings();
      __vg.state.hidden.tag.medium = true;
      __vg.syncAlpha(); __vg.applyLayout(false); __vg.applyLayout(false);
      const filtered = rings();
      delete __vg.state.hidden.tag.medium;
      __vg.syncAlpha(); __vg.applyLayout(false); __vg.applyLayout(false);
      __vg.timeScale = 1;
      document.querySelector('#vg-dim button[data-dim="folder"]').click();
      await wait(150);
      const started = __vg.foldActive && __vg.demo.busy(), copiesBefore = __vg.standIns().length;
      document.querySelector('#vg-gear').click();
      document.querySelector('#vg-setbody [data-setdim="folder"]').click();
      document.querySelector('#vg-setbody [data-vis="G"]').click();
      await ready();
      const after = {nodes: __vg.graph.order, copies: __vg.standIns().length,
        fold: __vg.foldActive, visible: 0, originals: 0};
      __vg.graph.forEachNode((id, a) => {
        if (__vg.visible(id)) after.visible++;
        if (!a.dupOf && (__vg.alpha[id] || 0) > .99) after.originals++;
      });
      return {ok: [cold, retaken, filtered].every(r => r.pooled === 4 && r.inner === 4 && r.wrong === 0) &&
        started && copiesBefore === 100 && after.nodes === 100 && after.copies === 0 &&
        !after.fold && after.visible === 80 && after.originals === 80,
        detail: JSON.stringify({cold, retaken, filtered, started, copiesBefore, after})};
    } finally {
      await mount(original, settings);
      __vg.timeScale = scale;
    }
  })().then(result => window.__groupingRegressionResult = result,
    error => window.__groupingRegressionResult = {ok: false, detail: String(error)}); void 0`);
  for (let i = 0; i < 240; i++) {
    const result = await p.eval("window.__groupingRegressionResult");
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return { ok: false, detail: "Grouping regression check timed out" };
}
