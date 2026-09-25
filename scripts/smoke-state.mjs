// github#151 -- the page state a check inherits: read, diff, attribute

// github#151 -- one flat map, key -> string; mostly generic (D-2)
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
 * github#151 -- what a check could see, not what it read (D-4)
 * @param {string} key
 * @returns {string[]}
 */
export function tokensFor(key) {
  const i = key.indexOf(".");
  const head = i < 0 ? key : key.slice(0, i);
  const tail = i < 0 ? key : key.slice(i + 1);
  if (head === "cam") return ["getCamera", "camera", "camRatio", "camState", "graphToViewport"];
  if (head === "store") return ["localStorage", "SETTINGS_KEY"];
  // github#151 -- the mount flag is not inheritable state; no token
  if (head === "page") return [];
  // github#151 -- the literal dotted form is the token, not the bare tail
  if (head === "state") return ["state." + tail];
  // github#151 -- ui./open./press./attr. are keyed by a DOM literal
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

// github#151 -- an identifier needs a word boundary, a literal does not
const IDENT = /^[A-Za-z_$][\w$]*$/;
/** @param {string} hay @param {string} token */
function reaches(hay, token) {
  if (!IDENT.test(token)) return hay.includes(token);
  return new RegExp("\\b" + token + "\\b").test(hay);
}

// github#151 -- fractions get a tolerance; integers stay exact
const NUM_EPS = 1e-3;
/** @param {string} a @param {string} b */
function samePrimitive(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === "" || b === "") return false;
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (Number.isInteger(x) && Number.isInteger(y)) return false;
  return Math.abs(x - y) <= NUM_EPS;
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
    if (!samePrimitive(from, to)) {
      out.push({ key: k, from: from === undefined ? "(absent)" : from,
                          to:   to   === undefined ? "(absent)" : to });
    }
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
 * github#151 -- whether a sample can be scored at all
 * @param {Record<string, string>} snap
 */
export function readable(snap) {
  return !!snap && !snap["probe.error"] && snap["page.mounted"] === "true";
}

/**
 * github#151 -- what a check may leave off baseline: keys, or a prefix.
 * @param {string} key
 * @param {string[] | undefined} allowed
 */
export function allowedToLeave(key, allowed) {
  if (!allowed || !allowed.length) return false;
  return allowed.some((a) => a === key || (a.endsWith(".") && key.startsWith(a)));
}

/**
 * github#151 -- the keys a check took OFF the job's baseline
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
 * github#151 -- the coupling, read off one job's audit rows
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
 * github#151 -- which checks leave the page off baseline, and with what
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
    // github#151 -- a declared key is not a leak
    const keys = added.filter((k) => !allowedToLeave(k, r.leaves));
    const declared = added.filter((k) => allowedToLeave(k, r.leaves));
    if (keys.length || declared.length) out.push({ check: r.name, keys, declared });
    before = after;
  }
  return out;
}
