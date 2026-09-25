#!/usr/bin/env node
// github#71, github#172, github#176

/**
 * github#71, decisions/0015 -- one note's sortspec, translated for the mirror
 * @param {string} specRaw
 * @param {string} dir the real vault path the spec's own note lives in
 * @param {(p: string) => string | null} mapPath real folder path -> the mirror's, or null if unmapped
 * @param {Map<string, string>} nameMap real note name/path (lowercased, `.md` stripped) -> its mirror name
 * @returns {{ text: string, dropped: number }}
 */
export function translateSortSpec(specRaw, dir, mapPath, nameMap) {
  const out = [];
  let target = dir; // github#71 -- the real path the current section aims at
  let dropped = 0;
  const key = (s) => s.toLowerCase().trim().replace(/\.md$/, "");
  // github#172 -- "." and "./sub" resolve against the note's dir
  const resolveTarget = (bare) =>
    (bare.charAt(0) === "." ? dir + "/" + bare.replace(/^\.\/?/, "") : bare)
      .split(/[\\/]/).filter(Boolean).join("/");

  for (const raw of specRaw.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { out.push(""); continue; }
    if (line.startsWith("//")) { dropped++; continue; }
    const tf = /^target-folder\s*:\s*(.*)$/.exec(line);
    if (tf) {
      const v = tf[1].trim();
      if (v === "/" || v === "/*") { target = ""; out.push(line); continue; }
      if (!v) { target = null; dropped++; continue; } // github#176 -- empty resolves to null, not root
      const wild = /\/\*$/.test(v);
      const anchored = v.charAt(0) === "/" || v.charAt(0) === "."; // github#172 -- a path, not a name
      const real = resolveTarget(wild ? v.slice(0, -2) : v);
      const mapped = mapPath(real);
      if (mapped === null) { target = null; dropped++; continue; }
      target = real;
      const anchor = anchored && !wild && mapped ? "/" : ""; // github#176 -- keep the anchor, wild excepted
      out.push("target-folder: " + anchor + (mapped || "/") + (wild ? "/*" : ""));
      continue;
    }
    if (target === null) { dropped++; continue; } // github#71 -- in a section we could not map
    if (/^order-(asc|desc)\s*:/.test(line)) { out.push(line); continue; }
    const asNote = nameMap.get(key(line)); // github#71, decisions/0015 -- a .md pin is a NOTE, never a folder
    if (/\.md$/i.test(line)) {
      if (asNote) { out.push(asNote + ".md"); continue; }
      dropped++;
      continue;
    }
    const asFolder = mapPath((target ? target + "/" : "") + line);
    if (asFolder) { out.push(asFolder.split("/").pop()); continue; }
    if (asNote) { out.push(asNote); continue; }
    dropped++;
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return { text: out.join("\n"), dropped };
}
