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
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1];
    const v = kv[2].trim();
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
const unquote = (s) => String(s).trim().replace(/^["']|["']$/g, "").trim();

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
