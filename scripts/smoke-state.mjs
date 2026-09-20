// github#151 -- the page state a check inherits: how to read it, diff it, and tell
// github#151 -- which later check could see it. Read-only: nothing here touches the page.

// github#151 -- one flat map, key -> string, so a diff is a key list rather than a tree walk.
// github#151 -- Mostly generic on purpose (D-2): every input and every aria-pressed button under
// github#151 -- the root is fingerprinted, so a toggle added later is covered without anyone
// github#151 -- remembering to add it here. The enumerated reads are the remainder.
export const STATE_PROBE = `(function () {
  var out = {};
  var put = function (k, v) { out[k] = v === undefined ? "undefined" : String(v); };
  var isDict = function (v) { return v && typeof v === "object" && !Array.isArray(v); };
  // github#151 -- a dict of flags reads as its truthy keys, sorted, so key order never shows up
  // github#151 -- as a difference
  var flat = function (v) {
    if (v === null || v === undefined) return String(v);
    if (Array.isArray(v)) return "[" + v.map(flat).join(",") + "]";
    if (isDict(v)) {
      var ks = Object.keys(v).filter(function (k) { return v[k] !== false && v[k] !== null && v[k] !== undefined; });
      ks.sort();
      return "{" + ks.map(function (k) { return k + ":" + flat(v[k]); }).join(",") + "}";
    }
    if (typeof v === "number") return String(Math.round(v * 1e4) / 1e4);
    return String(v);
  };
  var api = window.__vg;
  if (!api) { put("page.mounted", false); return out; }
  put("page.mounted", true);

  var st = api.state || {};
  Object.keys(st).sort().forEach(function (k) {
    var v = st[k];
    if (typeof v === "function") return;
    put("state." + k, flat(v));
  });

  try {
    var c = api.renderer.getCamera().getState();
    put("cam.x", flat(c.x)); put("cam.y", flat(c.y));
    put("cam.ratio", flat(c.ratio)); put("cam.angle", flat(c.angle));
  } catch (e) { put("cam.error", "unreadable"); }

  var root = document.getElementById("vg-app");
  if (root) {
    var ats = root.attributes;
    for (var i = 0; i < ats.length; i++) {
      if (ats[i].name.indexOf("data-") === 0) put("attr." + ats[i].name, ats[i].value);
    }
  }

  var scope = root || document;

  // github#151 -- a control with an id of its own is its own key. One without is a row the page
  // github#151 -- BUILT -- a legend folder, a colour swatch, a detail-card button -- and there
  // github#151 -- are hundreds of them, so each folds into one digest key named after the
  // github#151 -- container it sits in. Measured first: hiding one folder took state.hidden
  // github#151 -- off baseline and, with a key per row, reported 90 more that were only its
  // github#151 -- consequence. A digest still moves when any row does; it just says so once.
  var folds = {};
  var fold = function (el, kind, value) {
    var box = el.closest ? el.closest("[id^=vg-]") : null;
    var k = kind + "." + ((box && box.id) || "loose");
    (folds[k] || (folds[k] = [])).push(label(el) + "=" + value);
  };
  var label = function (el) {
    return el.getAttribute("data-dim") || el.getAttribute("data-src") ||
           el.getAttribute("data-eye") || el.getAttribute("data-k") || el.name ||
           (el.textContent || "").trim().slice(0, 24) || el.tagName;
  };
  // github#151 -- order-independent and short: the digest must not move because the page
  // github#151 -- rebuilt the same rows in another order
  var digest = function (list) {
    list.sort();
    var h = 5381;
    var s = list.join("|");
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return list.length + " rows #" + h.toString(16);
  };

  // github#151 -- only a control that is actually rendered. The settings body, the detail card
  // github#151 -- and the context menu are BUILT on first use and then hidden, so without this
  // github#151 -- the first check to open one reports every control inside it as newly present
  // github#151 -- -- six of the twenty-two the boundary first caught, none of them state a later
  // github#151 -- check could act on. A panel genuinely left open still shows, as open.<id> and
  // github#151 -- as its controls together.
  var rendered = function (el) { return el.getClientRects().length > 0; };

  var ins = scope.querySelectorAll("input, select, textarea");
  for (var j = 0; j < ins.length; j++) {
    var el = ins[j];
    if (!rendered(el)) continue;
    var t = (el.type || "").toLowerCase();
    var v = t === "checkbox" || t === "radio" ? String(el.checked) : String(el.value);
    var id = el.id || el.name;
    if (id) put("ui." + id, v); else fold(el, "ui", v);
  }
  var prs = scope.querySelectorAll("[aria-pressed]");
  for (var m = 0; m < prs.length; m++) {
    var b = prs[m];
    if (!rendered(b)) continue;
    if (b.id) put("press." + b.id, b.getAttribute("aria-pressed"));
    else fold(b, "press", b.getAttribute("aria-pressed"));
  }
  Object.keys(folds).forEach(function (k) { put(k, digest(folds[k])); });

  // github#151 -- a panel is state: a check that leaves one open changes what the next one clicks
  var PANELS = ["vg-settings", "vg-legend", "vg-detail", "vg-ctxmenu", "vg-band", "vg-heatwrap",
                "vg-sheet", "vg-ov", "vg-dbg", "vg-rangebox", "vg-tip", "vg-htip", "vg-rtip",
                "vg-hits", "vg-sidebar", "vg-stats", "vg-busy", "vg-glost", "vg-heatnote"];
  PANELS.forEach(function (pid) {
    var el = document.getElementById(pid);
    if (!el) return;
    var cs = window.getComputedStyle(el);
    put("open." + pid, String(!el.hidden && cs.display !== "none" && cs.visibility !== "hidden"));
  });

  // github#151 -- the remainder: live values that are not in state and not on an input
  var one = function (k, fn) { try { put(k, flat(fn())); } catch (e) { put(k, "unreadable"); } };
  one("vg.timeScale", function () { return api.timeScale; });
  one("vg.panEnabled", function () { return api.panEnabled; });
  one("vg.lazyEdges", function () { return api.lazyEdges; });
  one("vg.folderOrder", function () { return api.folderOrder(); });
  one("vg.groupOrder", function () { return api.groupOrder(); });
  one("vg.nameOrder", function () { return api.nameOrder(); });
  one("vg.tagColors", function () { return api.tagColors; });
  one("vg.subtagColors", function () { return api.subtagColors; });
  one("vg.tagShown", function () { return api.tagShown; });
  one("vg.geomLock", function () { return api.geomLock ? api.geomLock.dim || "locked" : null; });
  one("vg.recentWindow", function () { return api.recentWindow ? api.recentWindow() : null; });
  one("vg.standIns", function () { return (api.standIns() || []).length; });
  one("vg.pinned", function () {
    var n = 0; api.graph.forEachNode(function (id) { if (api.isPinned(id)) n++; }); return n;
  });
  one("vg.shown", function () {
    var n = 0; api.graph.forEachNode(function (id) { if (api.visible(id)) n++; }); return n;
  });
  one("store.settings", function () {
    var k = window.SETTINGS_KEY;
    return k ? (window.localStorage.getItem(k) || "") : "(no key)";
  });
  return out;
})()`;

/**
 * github#151 -- what a check could see, not what it read (D-4): the token for each key is the
 * substring an expression must contain to reach it, so this is an upper bound and is reported
 * as one.
 * @param {string} key
 * @returns {string[]}
 */
export function tokensFor(key) {
  const i = key.indexOf(".");
  const head = i < 0 ? key : key.slice(0, i);
  const tail = i < 0 ? key : key.slice(i + 1);
  if (head === "cam") return ["getCamera", "camera", "camRatio", "camState", "graphToViewport"];
  if (head === "store") return ["localStorage", "SETTINGS_KEY"];
  // github#151 -- the mount flag is not inheritable state, and its only honest token would be
  // github#151 -- `__vg`, which every expression here names. No token, so it is never a read.
  if (head === "page") return [];
  // github#151 -- the page exposes these as __vg.state.<name>, so the literal dotted form is the
  // token. The bare tail was useless: `hidden` matched getNodeDisplayData(id).hidden in a third
  // of the suite, and reported 15 reads of state.hidden that were nothing of the kind.
  if (head === "state") return ["state." + tail];
  // github#151 -- ui./open./press./attr. are keyed by a DOM id or attribute value, which is the
  // github#151 -- literal an expression has to name to reach the element
  return [tail];
}

/**
 * @param {Record<string, string>} keys  the fingerprint, for its key names
 * @param {string[]} exprs               every expression the check evaluated
 * @returns {string[]}                   the keys those expressions could reach
 */
export function keysRead(keys, exprs) {
  const hay = exprs.join("\n");
  const hit = [];
  for (const k of Object.keys(keys)) {
    if (tokensFor(k).some((t) => t && reaches(hay, t))) hit.push(k);
  }
  return hit;
}

// github#151 -- a bare identifier has to appear as a whole word, so `dim` is not read out of
// `dimmed` or `dimAtGaps`. A DOM id or an attribute value carries dashes and spaces, where a
// word boundary means nothing, so those match literally.
const IDENT = /^[A-Za-z_$][\w$]*$/;
/** @param {string} hay @param {string} token */
function reaches(hay, token) {
  if (!IDENT.test(token)) return hay.includes(token);
  return new RegExp("\\b" + token + "\\b").test(hay);
}

/**
 * @param {Record<string, string>} a
 * @param {Record<string, string>} b
 * @returns {{ key: string, from: string, to: string }[]}
 */
export function diffState(a, b) {
  const out = [];
  const keys = new Set(Object.keys(a || {}).concat(Object.keys(b || {})));
  for (const k of Array.from(keys).sort()) {
    const from = a ? a[k] : undefined, to = b ? b[k] : undefined;
    if (from !== to) out.push({ key: k, from: from === undefined ? "(absent)" : from,
                                          to:   to   === undefined ? "(absent)" : to });
  }
  return out;
}

/** @param {{ eval: (e: string) => Promise<unknown> }} page */
export async function readState(page) {
  try {
    const raw = await page.eval(`JSON.stringify(${STATE_PROBE})`);
    return JSON.parse(String(raw));
  } catch (e) {
    return { "probe.error": String((e && e.message) || e) };
  }
}

/**
 * github#151 -- whether a sample can be scored at all. A probe that could not run answers with
 * one key, and diffing that against a 125-key baseline reads as the whole page vanishing: every
 * check after it would fail naming 125 keys, which is a harness fault wearing a defect's clothes.
 * @param {Record<string, string>} snap
 */
export function readable(snap) {
  return !!snap && !snap["probe.error"] && snap["page.mounted"] === "true";
}

/**
 * github#151 -- a check declares what it is allowed to leave off baseline, as exact keys or as a
 * `prefix.` that covers a family. Anything else it took off baseline is a leak and fails it,
 * which is the shape github#113 already uses for "left the page busy".
 * @param {string} key
 * @param {string[] | undefined} allowed
 */
export function allowedToLeave(key, allowed) {
  if (!allowed || !allowed.length) return false;
  return allowed.some((a) => a === key || (a.endsWith(".") && key.startsWith(a)));
}

/**
 * github#151 -- the keys a check took OFF the job's baseline: off baseline now, at baseline when
 * it started. Deliberately not "changed since the last boundary", which would score a check for
 * putting an inherited key BACK -- exactly the cleanup the boundary wants. It is also what makes
 * one unfixed leak fail one check rather than every check after it.
 * @param {Record<string, string>} base
 * @param {Record<string, string>} before
 * @param {Record<string, string>} after
 * @returns {{ key: string, from: string, to: string }[]}
 */
export function newLeaks(base, before, after) {
  const wasDirty = new Set(diffState(base, before).map((d) => d.key));
  return diffState(base, after).filter((d) => !wasDirty.has(d.key));
}

/**
 * github#151 -- the coupling, read off one job's audit rows. A check is coupled when a key was
 * already off the job's baseline when it started, and one of its expressions could reach that
 * key. "Could" is the honest word (D-4): this narrows the list, the solo re-run confirms it.
 * @param {{ base: Record<string, string>, rows: { name: string, changed: {key: string}[], dirty: {key: string, from: string, to: string}[], reads: string[] }[] }} job
 */
export function couplingReport(job) {
  const rows = job.rows || [];
  /** @type {Map<string, string>} */
  const lastWriter = new Map();
  /** @type {{ check: string, key: string, was: string, leftBy: string }[]} */
  const out = [];
  let dirtyBefore = new Map();
  for (const r of rows) {
    for (const k of r.reads || []) {
      if (dirtyBefore.has(k)) {
        out.push({ check: r.name, key: k, was: dirtyBefore.get(k),
                   leftBy: lastWriter.get(k) || "(before the first check)" });
      }
    }
    for (const c of r.changed || []) lastWriter.set(c.key, r.name);
    dirtyBefore = new Map((r.dirty || []).map((d) => [d.key, d.to]));
  }
  return out;
}

/**
 * github#151 -- which checks leave the page off its baseline at all, and with what.
 * @param {{ rows: { name: string, changed: {key: string}[], dirty: {key: string}[] }[] }} job
 */
export function leakReport(job) {
  const rows = job.rows || [];
  /** @type {{ check: string, keys: string[], declared: string[] }[]} */
  const out = [];
  let before = new Set();
  for (const r of rows) {
    const after = new Set((r.dirty || []).map((d) => d.key));
    const added = Array.from(after).filter((k) => !before.has(k)).sort();
    // github#151 -- a key the check DECLARED is not a leak, and a report that calls it one
    // sends the reader to fix something the source already accounts for
    const keys = added.filter((k) => !allowedToLeave(k, r.leaves));
    const declared = added.filter((k) => allowedToLeave(k, r.leaves));
    if (keys.length || declared.length) out.push({ check: r.name, keys, declared });
    before = after;
  }
  return out;
}
