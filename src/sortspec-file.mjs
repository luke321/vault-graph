// github#71, decisions/0015

/**
 * github#71, decisions/0015 -- the text out of a file; the grammar is elsewhere
 * @param {string} raw the file's full contents
 * @returns {string} the spec text, or "" when the file carries none
 */
export function readSortingSpec(raw) {
  const text = String(raw).replace(/^\uFEFF/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return "";
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^sorting-spec\s*:\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const head = kv[1].trim();
    if (!/^[|>][-+]?$/.test(head)) return head.replace(/^["']|["']$/g, "").trim();
    // github#71 -- a block scalar, by the first body line's indent
    const body = [];
    let indent = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim()) { body.push(""); continue; }
      const lead = line.length - line.replace(/^\s+/, "").length;
      if (indent < 0) indent = lead;
      if (lead < indent) break;
      body.push(line.slice(indent));
    }
    while (body.length && !body[body.length - 1].trim()) body.pop();
    return body.join("\n");
  }
  return "";
}
