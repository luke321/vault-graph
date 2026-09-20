// github#146 -- the smoke loop, and the error audit around every check

import { errorText } from "./cdp.mjs";
import { readState, diffState, keysRead, allowedToLeave, newLeaks,
         readable } from "./smoke-state.mjs";

/**
 * @param {string[]} errs
 * @param {number} [n]
 * @returns {string}
 */
export function summarise(errs, n = 3) {
  const shown = errs.slice(0, n).join(" | ");
  return errs.length > n ? `${shown} (+${errs.length - n} more)` : shown;
}

// github#146 -- the checks' own list, mirroring cdp.mjs's capture
export function makeErrorLog(page) {
  /** @type {string[]} */
  const list = [];
  let seen = 0;
  // github#146 -- reading it catches it up, so a check mid-run sees the truth
  return {
    get errors() {
      const all = page.errors;
      for (; seen < all.length; seen++) list.push(errorText(all[seen]));
      return list;
    }
  };
}

// github#146 -- the page's turn, then the connection's
async function quiet(page, graceMs = 0) {
  await page.eval(
    "new Promise(function(r){ requestAnimationFrame(function(){ setTimeout(r, " +
    Math.max(0, graceMs | 0) + "); }); })"
  ).catch(() => {});
}

// github#146 -- one round-trip, to order events ahead of the reply
async function drain(page) {
  try { await page.eval("1"); return ""; } catch (e) { return e.message || "no reply"; }
}

// github#151 -- the audit: what a check changed, and what the next one could read.
// github#151 -- Off unless asked for, and when off nothing below runs and nothing is wrapped.
function makeAudit(page) {
  /** @type {string[]} */
  let exprs = [];
  let on = false;
  // github#151 -- the original reference, so release() hands back the very same function
  const real = page.eval;
  page.eval = (expr) => { if (on) exprs.push(String(expr)); return real.call(page, expr); };
  return {
    // github#151 -- the probe's own read must not land in the check's expression list
    open() { exprs = []; on = true; },
    close() { on = false; return exprs.slice(); },
    release() { page.eval = real; }
  };
}

/**
 * github#146, github#112, github#113, github#151
 * @returns {Promise<{ failed: number, ran: number, timings: {name: string, ms: number}[],
 *                     audit: { base: Record<string, string>, rows: object[] } | null }>}
 */
export async function runChecks(opts) {
  const { checks, page, ctx, log, settle, chromeState, fastClock, nativeClock } = opts;
  // github#151 -- the audit reports the coupling; the boundary refuses to let it accumulate.
  // github#151 -- Either one needs the probe, so they share it.
  const auditing = !!opts.stateAudit;
  const bounding = !!opts.stateBoundary;
  const watching = auditing || bounding;
  const audit = watching ? makeAudit(page) : null;
  /** @type {{ name: string, changed: object[], dirty: object[], reads: string[], ms: number }[]} */
  const auditRows = [];
  let baseState = null, prevState = null;
  if (watching) { baseState = await readState(page); prevState = baseState; }
  // github#146 -- only the last window pays for a grace
  const finalGraceMs = opts.finalGraceMs === undefined ? 500 : opts.finalGraceMs;

  const chromeTail = () => {
    const said = chromeState ? chromeState() : null;
    if (said && said.gone) log(`     chrome process: ${said.gone}`);
    if (said && said.said && said.said.length) {
      log("     chrome said:");
      for (const l of said.said.slice(-12)) log("       " + l);
    }
  };

  // github#113
  const stillBusy = async () => {
    const why = await page.j("__vg.demo.busyWhy()").catch(() => null);
    return why ? Object.keys(why).filter((k) => why[k]) : [];
  };

  let failed = 0;
  let mark = 0;
  let alive = true;
  const timings = [];
  for (const c of checks) {
    if (page.lost) {
      log(`\n  !! CDP connection lost (${page.lost}) -- ` +
          `${checks.length - timings.length} check(s) not run`);
      chromeTail();
      failed += checks.length - timings.length;
      alive = false;
      break;
    }
    const why = await drain(page);
    if (why) {
      const last = timings.length ? timings[timings.length - 1].name : "(before the first check)";
      log(`\n  !! the page stopped answering after "${last}" -- ${why}`);
      chromeTail();
      log(`     ${checks.length - timings.length} check(s) not run`);
      failed += checks.length - timings.length;
      alive = false;
      break;
    }
    let r;
    const t0 = Date.now();
    // github#113
    const fast = c.clock !== "real";
    if (fast) {
      await page.send("Emulation.setEmulatedMedia",
                      { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }).catch(() => {});
      await page.eval(`__vg.timeScale = ${fastClock}; void 0`).catch(() => {});
    }
    if (audit) audit.open();
    try { r = await c.fn(page, ctx); }
    catch (e) { r = { ok: false, detail: "threw: " + e.message }; }
    // github#113, github#112
    const left = await stillBusy();
    if (left.length) {
      const tb = Date.now();
      const done = await settle(page, 20000);
      r = { ok: false,
            detail: `${r.detail || ""} | left the page busy: ${left.join(", ")} -- ` +
                    (done ? `settled in ${((Date.now() - tb) / 1000).toFixed(1)}s`
                          : "STILL busy after 20s") };
    }
    if (fast) {
      await page.eval(`__vg.timeScale = ${nativeClock}; void 0`).catch(() => {});
      await page.send("Emulation.setEmulatedMedia", { features: [] }).catch(() => {});
    }
    // github#146 -- the window closes after the interaction's tail
    await quiet(page);
    // github#151 -- sampled here, on the same boundary the error window closes on
    if (audit) {
      const exprs = audit.close();
      const t1 = Date.now();
      const now = await readState(page);
      if (auditing) {
        auditRows.push({ name: c.name, changed: diffState(prevState, now),
                         dirty: diffState(baseState, now), reads: keysRead(baseState, exprs),
                         ms: Date.now() - t1 });
      }
      // github#151 -- what this check took off the job's baseline, minus what it declared.
      // github#151 -- Not "changed since the last boundary": that would fail a check for putting
      // github#151 -- an inherited key back, and would fail every check after one unfixed leak.
      // github#151 -- An unreadable sample scores nothing at all: see readable() for why.
      if (bounding && readable(baseState) && readable(prevState) && readable(now)) {
        const leaked = newLeaks(baseState, prevState, now)
                         .filter((d) => !allowedToLeave(d.key, c.leaves));
        if (leaked.length) {
          r = { ok: false,
                detail: `${r.detail || ""} | left the page off its baseline: ` +
                        leaked.map((d) => `${d.key} ${d.from} -> ${d.to}`).join(", ") };
        }
      }
      prevState = now;
    }
    // github#146 -- a splice below the mark hid something unaudited
    if (ctx.errors.length < mark) mark = 0;
    const fresh = ctx.errors.slice(mark);
    if (fresh.length) {
      r = { ok: false,
            detail: `${r.detail || ""} | threw during this check: ${summarise(fresh)}` };
    }
    mark = ctx.errors.length;
    const ms = Date.now() - t0;
    timings.push({ name: c.name, ms });
    if (!r.ok) failed++;
    const secs = ms >= 1000 ? ` ${(ms / 1000).toFixed(1)}s` : "";
    log(`${r.ok ? "  ok  " : " FAIL "} ${c.name}${secs}\n         ${r.detail}`);
  }

  // github#146 -- the final audit, before the browser closes
  if (alive && !page.lost) {
    await settle(page, 20000);
    await quiet(page, finalGraceMs);
  }
  if (ctx.errors.length < mark) mark = 0;
  const late = ctx.errors.slice(mark);
  if (late.length) {
    failed++;
    log(" FAIL  the page threw after the last check finished\n" +
        `         ${late.length} error(s) nothing accounted for: ${summarise(late)}`);
  }

  if (audit) audit.release();
  return { failed, ran: checks.length + (late.length ? 1 : 0), timings,
           // github#151
           audit: auditing ? { base: baseState, rows: auditRows } : null };
}
