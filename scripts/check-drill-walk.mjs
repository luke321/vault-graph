// github#76, github#186
export async function drillWalkCheck(p, root) {
  await p.eval(`window.__drillWalk = null; (async function (root) {
    const api = __vg, tau = 2 * Math.PI, originalScale = api.timeScale;
    const perPx = () => {
      const a = api.renderer.graphToViewport({x: 0, y: 0}), b = api.renderer.graphToViewport({x: 160, y: 0});
      return 160 / Math.hypot(b.x - a.x, b.y - a.y);
    };
    const look = () => {
      const k = perPx(), out = {};
      api.graph.forEachNode((id, a) => {
        const d = api.renderer.getNodeDisplayData(id);
        if (!d || d.hidden) return;
        out[id] = {a: api.alpha[id] || 0, s: api.renderer.scaleSize(d.size) * k, g: api.groupOf(id),
          r: Math.hypot(a.x, a.y), th: Math.atan2(a.y, a.x)};
      });
      return out;
    };
    const inversions = () => {
      const seats = api.walkSeats().sort((a, b) => a.rank - b.rank), before = new Map();
      let count = 0;
      for (const seat of seats) {
        if ((api.alpha[seat.id] || 0) < 0.1) continue;
        const previous = before.get(seat.cell);
        if (previous !== undefined && seat.at < previous - 1e-6) count++;
        before.set(seat.cell, seat.at);
      }
      return count;
    };
    const escape = (skip) => {
      const bounds = new Map();
      for (const c of api.wedgeCells()) {
        const key = c.g + ':' + c.band, before = bounds.get(key);
        bounds.set(key, {lo: Math.min(before ? before.lo : Infinity, c.pLead),
          hi: Math.max(before ? before.hi : -Infinity, c.pTrail)});
      }
      let worst = 0;
      api.graph.forEachNode((id, a) => {
        if (skip[id] || (api.alpha[id] || 0) < 0.1 || api.isPinned(id)) return;
        const edge = bounds.get(api.groupOf(id) + ':' + (api.isInner(id) ? 'i' : 'o'));
        if (!edge || !Number.isFinite(edge.lo + edge.hi)) return;
        const center = (edge.lo + edge.hi) / 2;
        let offset = Math.PI / 2 - Math.atan2(a.y, a.x) - center;
        offset = ((offset + Math.PI) % tau + tau) % tau - Math.PI;
        worst = Math.max(worst, Math.abs(offset) - (edge.hi - edge.lo) / 2);
      });
      return worst * 180 / Math.PI;
    };
    const segment = (start, frames, end) => {
      let over = 0, worstOver = 0, reversed = 0, stepPx = 0, prev = start;
      const dir = {}, last = {}, top = {}, ext = {};
      frames.forEach(f => {
        for (const id in f.v) {
          const v = f.v[id], q = prev[id];
          if (q && v.a >= 0.5 && q.a >= 0.5) {
            const dx = v.r * Math.cos(v.th) - q.r * Math.cos(q.th), dy = v.r * Math.sin(v.th) - q.r * Math.sin(q.th);
            stepPx = Math.max(stepPx, Math.hypot(dx, dy) / f.k);
          }
          if (start[id] && end[id] && v.a > 0.5) {
            const rest = Math.max(start[id].s, end[id].s);
            if (v.s > rest * 1.05 + 0.05) { over++; worstOver = Math.max(worstOver, v.s / rest); }
          }
          top[id] = Math.max(top[id] || 0, v.a, start[id] ? start[id].a : 0, end[id] ? end[id].a : 0);
          if (last[id] !== undefined) {
            const d = v.a - last[id];
            if (dir[id] < 0) ext[id] = Math.min(ext[id], v.a);
            else if (dir[id] > 0) ext[id] = Math.max(ext[id], v.a);
            if (Math.abs(d) > 0.02) {
              const mid = dir[id] < 0 ? ext[id] > 0.05 : ext[id] < top[id] - 0.05;
              if (dir[id] !== undefined && Math.sign(d) !== dir[id] && mid) reversed++;
              if (dir[id] !== Math.sign(d)) ext[id] = v.a;
              dir[id] = Math.sign(d);
            }
          }
          last[id] = v.a;
        }
        prev = f.v;
      });
      return {over, worstOver: Math.round(worstOver * 100) / 100, reversed, stepPx: Math.round(stepPx * 10) / 10};
    };
    const ride = (label, trigger) => new Promise((resolve, reject) => {
      const segs = [], timer = setTimeout(() => reject(Error(label + ': drill walk timed out')), 30000);
      let cur = null, at = look(), atK = perPx(), raf;
      const open = (lc) => { cur = {lc, frames: [], start: at, startK: atK, escape: 0, inv: 0}; segs.push(cur); };
      trigger();
      function tick() {
        try {
          const lc = api.lastCascade();
          if (!cur || cur.lc !== lc) {
            if (cur && cur.frames.length) { at = cur.frames[cur.frames.length - 1].v; atK = cur.frames[cur.frames.length - 1].k; }
            open(lc);
          }
          const v = look();
          cur.frames.push({v, k: perPx()});
          const skip = {};
          Object.keys(v).forEach(id => { if (cur.start[id] && cur.start[id].g !== v[id].g) skip[id] = true; });
          cur.escape = Math.max(cur.escape, escape(skip));
          if (!lc.held) cur.inv = Math.max(cur.inv, inversions());
          if (api.demo.busy()) { raf = requestAnimationFrame(tick); return; }
          clearTimeout(timer);
          setTimeout(() => {
            const rest = look();
            resolve({label, segs: segs.map((s, i) => {
              const end = i + 1 < segs.length ? segs[i + 1].start : rest;
              const tail = s.frames[s.frames.length - 1].v;
              let jump = 0, zoom = 0, prevK = s.startK;
              s.frames.forEach(f => { zoom = Math.max(zoom, Math.abs(Math.log(f.k / prevK))); prevK = f.k; });
              Object.keys(rest).forEach(id => {
                if (i + 1 < segs.length || !tail[id] || tail[id].a < 0.999) return;
                let da = rest[id].th - tail[id].th; da = ((da + Math.PI) % tau + tau) % tau - Math.PI;
                jump = Math.max(jump, Math.abs(rest[id].r - tail[id].r), Math.abs(da) * rest[id].r);
              });
              return Object.assign({held: !!s.lc.held, frames: s.frames.length, exit: s.lc.exit || s.lc.path,
                escapeDeg: Math.round(s.escape * 1000) / 1000, inversions: s.lc.held ? 'held' : s.inv,
                jump: Math.round(jump * 10) / 10, zoom: Math.round(Math.exp(zoom) * 1000) / 1000},
                segment(s.start, s.frames, end));
            })});
          }, 320);
        } catch (error) { clearTimeout(timer); reject(error); }
      }
      raf = requestAnimationFrame(tick);
    });
    try {
      api.timeScale = 1.25; api.wedgeDebug(true);
      const rides = [await ride('in', () => api.setRoot(root)), await ride('out', () => api.setRoot(null))];
      const bad = [];
      rides.forEach(r => r.segs.forEach((s, i) => {
        const at = r.label + '#' + (i + 1);
        if (s.exit !== 'converged') bad.push(at + ' exit ' + s.exit);
        if (s.frames < 20) bad.push(at + ' ' + s.frames + ' frames');
        if (s.escapeDeg >= 0.01) bad.push(at + ' escaped ' + s.escapeDeg + 'deg');
        if (s.inversions && s.inversions !== 'held') bad.push(at + ' ' + s.inversions + ' serpentine inversions');
        if (s.over) bad.push(at + ' ' + s.over + ' dot-frames over rest, worst ' + s.worstOver + 'x');
        if (s.reversed) bad.push(at + ' ' + s.reversed + ' fade reversals');
        if (s.jump > 16) bad.push(at + ' landed ' + s.jump + 'u off rest');
        if (s.zoom > 1.25) bad.push(at + ' the disc rescaled ' + s.zoom + 'x in one frame');
        if (s.held && s.stepPx > 4) bad.push(at + ' a held dot moved ' + s.stepPx + 'px in one frame');
      }));
      const steps = rides.map(r => r.label + ' ' + r.segs.map(s => (s.held ? 'held ' : 'walk ') + s.stepPx + 'px').join(', '));
      return {ok: !bad.length && rides.every(r => r.segs.length === 2), bad,
        detail: steps.join(' | ') + ' (worst frame step; a walk is context, a held cross is asserted) ' + JSON.stringify(rides)};
    } finally { api.timeScale = originalScale; api.wedgeDebug(false); }
  })(${JSON.stringify(root)}).then(result => window.__drillWalk = result,
    error => window.__drillWalk = {ok: false, detail: String(error && error.stack || error)}); void 0`);
  for (let i = 0; i < 400; i++) {
    const result = await p.eval('window.__drillWalk');
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return {ok: false, detail: 'Drill walk probe timed out'};
}
