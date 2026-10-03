// github#186
export async function cascadeWedgesCheck(p) {
  await p.eval(`window.__wedgeRide = null; (async function () {
    const api = __vg, tau = 2 * Math.PI, originalScale = api.timeScale;
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
    const escape = () => {
      const bounds = new Map();
      for (const c of api.wedgeCells()) {
        const key = c.g + ':' + c.band, before = bounds.get(key);
        bounds.set(key, {lo: Math.min(before ? before.lo : Infinity, c.pLead),
          hi: Math.max(before ? before.hi : -Infinity, c.pTrail)});
      }
      let worst = 0;
      api.graph.forEachNode((id, a) => {
        if ((api.alpha[id] || 0) < 0.1 || api.isPinned(id)) return;
        const edge = bounds.get(api.groupOf(id) + ':' + (api.isInner(id) ? 'i' : 'o'));
        if (!edge || !Number.isFinite(edge.lo + edge.hi)) throw Error('Missing wedge bounds');
        const center = (edge.lo + edge.hi) / 2;
        let offset = Math.PI / 2 - Math.atan2(a.y, a.x) - center;
        offset = ((offset + Math.PI) % tau + tau) % tau - Math.PI;
        worst = Math.max(worst, Math.abs(offset) - (edge.hi - edge.lo) / 2);
      });
      return worst * 180 / Math.PI;
    };
    const ride = trigger => new Promise((resolve, reject) => {
      let frames = 0, maximum = 0, reversed = 0, raf;
      const timer = setTimeout(() => { cancelAnimationFrame(raf); reject(Error('Wedge walk timed out')); }, 15000);
      trigger();
      function tick() {
        try {
          frames++; maximum = Math.max(maximum, escape());
          reversed = Math.max(reversed, inversions());
          if (api.demo.busy()) { raf = requestAnimationFrame(tick); return; }
          clearTimeout(timer);
          resolve({frames, escapeDegrees: maximum, reversed, exit: api.lastCascade().exit});
        } catch (error) { clearTimeout(timer); reject(error); }
      }
      raf = requestAnimationFrame(tick);
    });
    try {
      api.timeScale = 1.25; api.wedgeDebug(true);
      const refresh = await ride(() => document.getElementById('vg-refresh').click());
      const from = document.getElementById('vg-from');
      const lo = Date.parse(from.min), hi = Date.parse(from.max);
      const date = new Date(hi - (hi - lo) * 0.15).toISOString().slice(0, 10);
      const filter = await ride(() => api.setRange(date, null));
      const restore = await ride(() => api.setRange(null, null));
      const rides = {refresh, filter, restore};
      return {ok: Object.values(rides).every(r => r.frames >= 20 && r.escapeDegrees < 0.01 && !r.reversed && r.exit === 'converged'),
        detail: JSON.stringify(rides)};
    } finally { api.timeScale = originalScale; api.wedgeDebug(false); }
  })().then(result => window.__wedgeRide = result,
    error => window.__wedgeRide = {ok: false, detail: String(error)}); void 0`);
  for (let i = 0; i < 180; i++) {
    const result = await p.eval('window.__wedgeRide');
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return {ok: false, detail: 'Wedge motion probe timed out'};
}
