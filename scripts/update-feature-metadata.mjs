#!/usr/bin/env node
// github#121

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES_DIR = join(ROOT, "docs", "features");
const ASSETS_DIR = join(ROOT, "assets", "features");

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes("--" + n);

const VERSION = arg("version");
if (!VERSION) {
  console.error("update-feature-metadata: --version <x.y.z> is required");
  process.exit(1);
}
const DATE = arg("date", new Date().toISOString().slice(0, 10));
const SCRATCH = arg("scratch", join(tmpdir(), "vault-graph-takes"));
const DRY_RUN = flag("dry-run");
const only = (() => {
  const raw = arg("only", "");
  if (!raw) return null;
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
})();

// github#121, github#124
const SKIP = new Set(["_template", "countbars"]);

// github#121
const assetNameFor = (docName) => (docName === "live" ? "live-page" : docName);

function resolveFfprobe() {
  const finder = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(finder, ["ffmpeg"], { encoding: "utf8" });
  let ffmpeg = found.status === 0 ? (found.stdout || "").split(/\r?\n/)[0].trim() : "";
  if (!ffmpeg) {
    const fallback = join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links",
      process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    if (existsSync(fallback)) ffmpeg = fallback;
  }
  if (!ffmpeg) return null;
  const probeBin = join(dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  return existsSync(probeBin) ? probeBin : null;
}

function probe(ffprobe, file) {
  const vid = spawnSync(ffprobe,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
      "-of", "csv=p=0", file],
    { encoding: "utf8" });
  const [width, height, rate] = (vid.stdout || "").trim().split(",");
  const w = Number(width), h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;

  const fmt = spawnSync(ffprobe,
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  let duration = Number((fmt.stdout || "").trim());
  if (!Number.isFinite(duration)) {
    // github#121 -- ffprobe: N/A duration for webp; count frames
    const cnt = spawnSync(ffprobe,
      ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames",
        "-of", "csv=p=0", file],
      { encoding: "utf8" });
    const frames = Number((cnt.stdout || "").trim());
    const [num, den] = (rate || "").split("/").map(Number);
    const fps = den ? num / den : NaN;
    if (Number.isFinite(frames) && Number.isFinite(fps) && fps > 0) duration = frames / fps;
  }
  if (!Number.isFinite(duration)) return null;
  return { duration, width: w, height: h };
}

const ffprobe = resolveFfprobe();
if (!ffprobe) {
  console.error("update-feature-metadata: ffprobe not found (winget install Gyan.FFmpeg)");
  process.exit(1);
}
if (!existsSync(FEATURES_DIR)) {
  console.error(`update-feature-metadata: no such directory ${FEATURES_DIR}`);
  process.exit(1);
}

const docNames = readdirSync(FEATURES_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.slice(0, -3))
  .filter((name) => name !== "_template")
  .filter((name) => only ? only.has(name) : !SKIP.has(name));

if (!docNames.length) {
  console.log("update-feature-metadata: nothing to do -- no matching docs/features/*.md");
  process.exit(0);
}

const ROW_RE = /\| \*\*Last re-recorded\*\* \|.*\|/;
let updated = 0, skipped = 0;

for (const name of docNames) {
  const assetName = assetNameFor(name);
  const webp = join(ASSETS_DIR, `${assetName}.webp`);
  if (!existsSync(webp)) {
    console.log(`  ${name}: no assets/features/${assetName}.webp yet -- skipped`);
    skipped++;
    continue;
  }

  const fromWebp = probe(ffprobe, webp);
  if (!fromWebp) {
    console.log(`  ${name}: ffprobe could not read ${assetName}.webp -- skipped`);
    skipped++;
    continue;
  }

  const mp4 = join(SCRATCH, `demo-${name}.mp4`);
  const fromMp4 = existsSync(mp4) ? probe(ffprobe, mp4) : null;
  const sizeMB = (statSync(webp).size / (1024 * 1024)).toFixed(2);
  const encodeWidth = name === "mobile" ? "native width" : `${fromWebp.width} px`;

  const line = fromMp4
    ? `| **Last re-recorded** | \`${VERSION} — ${DATE}\` — ${fromMp4.duration.toFixed(1)} s at ` +
      `${fromMp4.width}x${fromMp4.height}, encoded at ${encodeWidth} (${sizeMB} MB) |`
    : `| **Last re-recorded** | \`${VERSION} — ${DATE}\` — ${fromWebp.duration.toFixed(1)} s, ` +
      `encoded at ${encodeWidth} (${sizeMB} MB) — capture size not recorded (no take found in ${SCRATCH}) |`;

  const docPath = join(FEATURES_DIR, `${name}.md`);
  const text = readFileSync(docPath, "utf8");
  if (!ROW_RE.test(text)) {
    console.log(`  ${name}: no "Last re-recorded" row found in ${name}.md -- skipped`);
    skipped++;
    continue;
  }
  const next = text.replace(ROW_RE, line);
  if (DRY_RUN) {
    console.log(`  ${name}: (dry-run) ${line}`);
  } else {
    writeFileSync(docPath, next);
    console.log(`  ${name}: ${line}`);
  }
  updated++;
}

console.log(`\n${updated} updated, ${skipped} skipped${DRY_RUN ? " -- dry-run, nothing written" : ""}`);
if (!updated) process.exit(1);
