// github#141

const SCHEME = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/\/|(?:mailto|tel|data|javascript):)/i;

/** @param {string} raw @returns {boolean} */
export function isExternalTarget(raw) {
  return SCHEME.test(String(raw).trim());
}

/** @param {string} raw @returns {string} */
function stripFragment(raw) {
  const s = String(raw);
  const at = s.indexOf("#");
  return at < 0 ? s : s.slice(0, at);
}

/** @param {string} raw @returns {string} */
export function cleanTarget(raw) {
  const path = stripFragment(raw).trim();
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { decoded = path; }
  return tidy(decoded);
}

/** @param {string} dest @returns {boolean} */
export function isRelativeDest(dest) {
  return /^\.\.?(?:\/|$)/.test(dest);
}

/** @param {string} path @returns {string} */
function dirOf(path) {
  const p = String(path).replace(/\\/g, "/");
  const at = p.lastIndexOf("/");
  return at < 0 ? "" : p.slice(0, at);
}

/** @param {string} path @returns {string} */
function normalizeSegments(path) {
  const out = [];
  for (const seg of String(path).split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") { out.pop(); continue; }
    out.push(seg);
  }
  return out.join("/");
}

/** @param {string} dest @returns {string} */
function tidy(dest) {
  return String(dest).replace(/\\/g, "/").replace(/\.md$/i, "").trim();
}

/**
 * github#141
 * @param {string} sourcePath  vault-relative path of the note the link was written in
 * @param {string} dest        a cleaned destination from cleanTarget()
 * @returns {string}
 */
export function resolveAgainst(sourcePath, dest) {
  const dir = dirOf(sourcePath);
  return normalizeSegments((dir ? dir + "/" : "") + tidy(dest));
}

/**
 * github#141
 * @param {string} sourcePath
 * @param {string} dest
 * @returns {string}
 */
export function canonicalDest(sourcePath, dest) {
  const d = tidy(dest);
  const out = isRelativeDest(d) ? resolveAgainst(sourcePath, d) : normalizeSegments(d);
  return out || d;
}

/** @param {string} canonical @returns {string} */
export function ghostKey(canonical) {
  return String(canonical).toLowerCase();
}

/** @param {string} canonical @returns {string} */
export function ghostId(canonical) {
  return "ghost:" + canonical;
}

/** @param {string} canonical @returns {string} */
export function ghostLabel(canonical) {
  const segs = String(canonical).split("/").filter(Boolean);
  return segs.length ? segs[segs.length - 1] : String(canonical);
}
