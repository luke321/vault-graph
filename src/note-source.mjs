// github#186
import { noteBody } from "./taxonomy.mjs";
import { cleanTarget, isExternalTarget } from "./links.mjs";

/** @param {string} raw @returns {{ fm: Record<string, any>, body: string }} */
export function parseFrontmatter(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  const lines = m[1].split(/\r?\n/);
  let key = null;
  for (const line of lines) {
    const li = /^\s*-\s+(.*)$/.exec(line);
    if (li && key) {
      (Array.isArray(fm[key]) ? fm[key] : (fm[key] = [])).push(unquote(li[1]));
      continue;
    }
    // github#205
    const kv = KEY_LINE.exec(line);
    if (!kv) continue;
    key = kv[1] != null ? kv[1] : kv[2] != null ? kv[2] : kv[3].trim();
    const v = stripComment(kv[4]).trim();
    if (v === "") { fm[key] = []; continue; }
    if (v.startsWith("[") && v.endsWith("]")) {
      fm[key] = v.slice(1, -1).split(",").map(unquote).filter(Boolean);
    } else {
      fm[key] = unquote(v);
    }
  }
  // github#149
  return { fm, body: noteBody(raw) };
}
// github#205
const KEY_LINE = /^(?:"((?:[^"\\]|\\.)+)"|'((?:[^']|'')+)'|([^\s:#"'[\]{},&*!|>%@`-][^:#]*?|-[^\s:#][^:#]*?))\s*:(?:\s+(.*)|$)/;
// github#205
const stripComment = (s) => {
  const t = String(s == null ? "" : s).trim();
  const q = t[0];
  if (q === '"' || q === "'") {
    for (let i = 1; i < t.length; i++) {
      if (q === '"' && t[i] === "\\") { i++; continue; }
      if (t[i] === q) { if (q === "'" && t[i + 1] === "'") { i++; continue; } return t.slice(0, i + 1); }
    }
    return t;
  }
  const c = /(^|\s)#/.exec(t);
  return c ? t.slice(0, c.index).trim() : t;
};
const unquote = (s) => {
  const t = stripComment(s);
  const q = t[0];
  if (t.length > 1 && (q === '"' || q === "'") && t[t.length - 1] === q) {
    const inner = t.slice(1, -1);
    return (q === '"' ? inner.replace(/\\(["\\/])/g, "$1") : inner.replace(/''/g, "'")).trim();
  }
  return t.replace(/^["']|["']$/g, "").trim();
};

/* -------------------------------------------------------------- link mining */

const stripCode = (s) =>
  s.replace(/^```[\s\S]*?^```/gm, "\n")
   .replace(/^~~~[\s\S]*?^~~~/gm, "\n")
   .replace(/`[^`\n]*`/g, " ");

const NAV_LINE = new RegExp(
  "^\\s*!?\\[\\[[^\\]]+\\]\\]\\s*(?:\\u2190|<-|<)\\s*\\|\\s*(?:\\u2192|->|>)\\s*!?\\[\\[[^\\]]+\\]\\]\\s*$",
  "gm"
);


// github#141
const WIKILINK = /!?\[\[([^[\]|#]+)(?:#[^[\]|]*)?(?:\|[^[\]]*)?\]\]/g;
// github#141
const MDLINK = /\[[^\]]*\]\(([^)\s#]+\.md)(?:#[^)\s]*)?(?:\s[^)]*)?\)/g;

/** @param {string} body @param {Record<string, any>} fm @param {boolean} [stripNav] @returns {string[]} */
export function mineLinks(body, fm, stripNav = false) {
  const out = [];
  // github#141
  const push = (raw, url) => {
    if (url && isExternalTarget(raw)) return;
    const dest = cleanTarget(raw);
    if (dest) out.push(dest);
  };
  const scan = (text, re, url) => {
    let m; re.lastIndex = 0;
    while ((m = re.exec(text))) push(m[1], url);
  };

  const clean = stripNav ? stripCode(body).replace(NAV_LINE, "") : stripCode(body);
  scan(clean, WIKILINK, false);
  scan(clean, MDLINK, true);

  for (const v of Object.values(fm)) {
    for (const s of (Array.isArray(v) ? v : [v])) {
      if (typeof s === "string" && s.includes("[[")) scan(s, WIKILINK, false);
    }
  }
  return out;
}
