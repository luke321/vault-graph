// github#186
export function mirrorSettings(raw, mapFolder, mapTag, mapNote) {
  const out = {};
  for (const key of ["ghosts", "templates", "flatMonths", "words", "panEnabled", "compactAxis", "unlinkedByFolder",
    "unlinkedTintByFolder", "countBars", "rootInOrder", "devTools", "fitCap", "liveRefresh", "sheetOpen", "bandOpen", "multiTag"]) {
    if (typeof raw[key] === "boolean") out[key] = raw[key];
  }
  if (["folder", "tag"].includes(raw.dim)) out.dim = raw.dim;
  if (["name", "explorer"].includes(raw.folderOrder)) out.folderOrder = raw.folderOrder;
  for (const key of ["folderShown", "tagShown", "folderColors", "subfolderColors", "tagColors", "subtagColors"]) {
    const mapped = Object.create(null), input = raw[key];
    if (!input || typeof input !== "object" || Array.isArray(input)) continue;
    for (const [name, value] of Object.entries(input)) {
      const dest = key.startsWith("tag") || key.startsWith("subtag") ? mapTag(name) : mapFolder(name);
      if (dest == null) continue;
      if (key.endsWith("Shown") ? typeof value === "boolean" : typeof value === "string" && /^g([1-9]|1[0-2])$/.test(value)) mapped[dest] = value;
    }
    out[key] = mapped;
  }
  if (Array.isArray(raw.pinned)) out.pinned = raw.pinned.map(mapNote).filter((p) => typeof p === "string");
  return out;
}
