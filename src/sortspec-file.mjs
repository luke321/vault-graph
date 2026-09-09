// github#71, decisions/0013

/**
 * Pull a `sorting-spec` out of a note's front matter.
 *
 * The general frontmatter parser in src/build-graph.mjs flattens every value to a string and
 * knows nothing about block scalars -- which is how a `sorting-spec: |-` is always written --
 * so this reads that one key properly rather than teaching the general parser YAML it has
 * never needed anywhere else.
 *
 * This module owns getting the TEXT out of a file. The spec's grammar lives in src/page.js
 * (`parseSortSpec`), which is the one file both hosts share; the page cannot import anything,
 * since the exporter pastes it in as text. These two scripts are real ESM and can, which is
 * why the reader is here and not copied into each.
 *
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
    // a block scalar: every following line indented at least as far as the first one
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
