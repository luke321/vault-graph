// github#186
import { readFileSync } from "node:fs";

export async function hiddenBaselineCheck(p, unlinkedByFolder = true) {
  const markup = readFileSync(new URL("../src/page.html", import.meta.url), "utf8");
  await p.eval(`window.__hiddenBaselineResult = null; (async function () {
    const markup = ${JSON.stringify(markup)};
    const original = window.VAULT_DATA;
    const settings = loadSettings();
    const originalScale = __vg.timeScale;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const ready = async () => {
      for (let i = 0; i < 150; i++) {
        if (window.__vg && __vg.renderer && !__vg.demo.busy()) {
          await wait(100);
          if (!__vg.demo.busy()) return;
        }
        await wait(40);
      }
      throw Error('Hidden-baseline mount did not settle: ' + JSON.stringify({busy: __vg.demo.busyWhy(),
        cascade: __vg.lastCascade(), visible: __vg.graph.nodes().filter(id => __vg.alpha[id] > 0.99).length,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches}));
    };
    const mount = async (data, prefs) => {
      window.__vg.destroy();
      const old = document.getElementById('vg-app');
      const holder = document.createElement('div');
      holder.innerHTML = markup;
      old.replaceWith(holder.firstElementChild);
      window.__vg = null;
      mountVaultGraph(document.getElementById('vg-app'), data, Object.assign({}, prefs, {
        Graph: VaultGraphEngine.GraphStore, Renderer: VaultGraphEngine.Renderer,
        logoMask: window.VAULT_LOGO_MASK || '', settingsUI: true
      }));
      await ready();
      __vg.timeScale = 0.1;
    };
    const snapshot = () => {
      const nodes = {}, renderer = __vg.renderer;
      __vg.graph.forEachNode((id, a) => {
        if ((__vg.alpha[id] || 0) < 0.99) return;
        const d = renderer.getNodeDisplayData(id);
        const pt = renderer.graphToViewport(a);
        nodes[a.path] = {x: pt.x, y: pt.y, r: renderer.scaleSize(d.size), inner: __vg.isInner(id)};
      });
      return nodes;
    };
    const replay = async () => {
      document.getElementById('vg-refresh').click();
      await ready();
      return snapshot();
    };
    const base = JSON.parse(JSON.stringify(original));
    const shown = Object.fromEntries(base.nodes.map(n => [n.folder, true]));
    const prefs = Object.assign({}, settings, {dim: 'folder', folderShown: shown,
      pinnedPaths: [], unlinkedByFolder: ${unlinkedByFolder !== false}});
    const augmented = JSON.parse(JSON.stringify(base));
    const start = augmented.nodes.length;
    for (let i = 0; i < 320; i++) {
      const folder = i % 2 ? '_Hidden baseline control' : 'Hidden baseline control';
      augmented.nodes.push({id: folder + '/Note ' + i + '.md', label: 'Hidden ' + i,
        folder, sub: '', dirs: [], tags: [], type: 'note', words: 0,
        created: '1901-01-01', touched: '1901-01-01', deg: 0});
      augmented.edges.push({s: i % start, t: start + i, w: 1});
      augmented.edges.push({s: (i * 7 + 11) % start, t: start + i, w: 3});
    }
    augmented.nodes.forEach(n => { n.deg = 0; });
    augmented.edges.forEach(e => { augmented.nodes[e.s].deg++; augmented.nodes[e.t].deg++; });
    const hiddenPrefs = Object.assign({}, prefs, {folderShown: Object.assign({}, shown,
      {'Hidden baseline control': false})});
    const compare = (a, b) => {
      let missing = 0, position = 0, size = 0, bands = 0;
      for (const [id, n] of Object.entries(a)) {
        const m = b[id];
        if (!m) { missing++; continue; }
        position = Math.max(position, Math.hypot(n.x - m.x, n.y - m.y));
        size = Math.max(size, Math.abs(n.r - m.r));
        if (n.inner !== m.inner) bands++;
      }
      return {missing, extra: Object.keys(b).length - Object.keys(a).length,
        position, size, bands};
    };
    try {
      await mount(base, prefs);
      const cold = snapshot(), warm = await replay();
      await mount(augmented, hiddenPrefs);
      const hiddenCold = snapshot(), hiddenWarm = await replay();
      const comparisons = [compare(cold, hiddenCold), compare(warm, hiddenWarm),
        compare(hiddenCold, hiddenWarm)];
      __vg.setFolderShown(Object.assign({}, hiddenPrefs.folderShown,
        {'Hidden baseline control': true, '_Hidden baseline control': true}));
      __vg.applyHiddenDefaults();
      await ready();
      const revealed = Object.keys(snapshot()).length;
      __vg.setFolderShown(hiddenPrefs.folderShown);
      __vg.applyHiddenDefaults();
      await ready();
      comparisons.push(compare(hiddenCold, snapshot()));
      return {ok: Object.keys(cold).length > 0 && revealed === augmented.nodes.length &&
        comparisons.every(c => !c.missing && !c.extra && !c.bands && c.position < 0.01 && c.size < 0.01),
        detail: JSON.stringify({visible: Object.keys(cold).length, addedHidden: 320, revealed, comparisons})};
    } finally {
      await mount(original, settings);
      __vg.timeScale = originalScale;
    }
  })().then(result => window.__hiddenBaselineResult = result,
    error => window.__hiddenBaselineResult = {ok: false, detail: String(error)}); void 0`);
  for (let i = 0; i < 160; i++) {
    const result = await p.eval("window.__hiddenBaselineResult");
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return { ok: false, detail: "Hidden-baseline check timed out" };
}
