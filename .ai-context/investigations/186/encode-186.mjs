#!/usr/bin/env node
// INVESTIGATION TOOLING for github#186 -- turns a filmed probe run into a square, CROPPED clip
// (crop=S:S:X:Y around the disc centre, then scale 720:720, never a bare scale) and a set of
// stills at chosen cascade progress points, each labelled with its pr.
//   node encode-186.mjs <run dir> [--pr 0,0.25,0.5,0.75,1] [--fps 30]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2]);
const argv = process.argv.slice(3);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PRS = arg("pr", "0,0.25,0.5,0.75,1").split(",").map(Number);
const FPS = Number(arg("fps", "30"));
const P = JSON.parse(readFileSync(join(dir, "probe.json"), "utf8"));
if (!P.frames.length) throw new Error("no screencast frames in this run");
const ffmpeg = existsSync(join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "ffmpeg.exe"))
  ? join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", "ffmpeg.exe") : "ffmpeg";

// the crop: a square the height of the stage, centred on the disc
const g = P.geom;
const S = 2 * Math.floor(Math.min(g.stage.h, g.stage.w, 2 * g.cx, 2 * g.cy) / 2);
const X = Math.max(0, Math.round(g.cx - S / 2)), Y = Math.max(0, Math.round(g.cy - S / 2));
console.log(`crop ${S}x${S} at ${X},${Y} (disc centre ${Math.round(g.cx)},${Math.round(g.cy)}, radius ${Math.round(g.rpx)}px at rest)`);

// the clip, at the recorded pace (the page ran at slow x${P.slow}, so the clip shows that)
const frames = P.frames;
const lines = [];
for (let i = 0; i < frames.length; i++) {
  const next = frames[i + 1];
  const dur = next ? Math.max(1 / FPS, next.t - frames[i].t) : 1.0;
  lines.push(`file '${frames[i].file.replace(/\\/g, "/")}'`, `duration ${dur.toFixed(4)}`);
}
lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, "/")}'`);
const list = join(dir, "frames.txt");
writeFileSync(list, lines.join("\n") + "\n");
const clip = join(dir, "clip.mp4");
let r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
  "-vf", `crop=${S}:${S}:${X}:${Y},fps=${FPS},scale=720:720,format=yuv420p`,
  "-c:v", "libx264", "-preset", arg("preset", "veryfast"), "-crf", arg("crf", "20"),
  "-movflags", "+faststart", "-y", clip], { stdio: "inherit" });
if (r.status !== 0) throw new Error("ffmpeg clip exited " + r.status);
console.log(`clip: ${frames.length} frames over ${(frames[frames.length - 1].t - frames[0].t).toFixed(1)}s -> ${clip}`);

// stills: the screencast frame nearest each requested pr (matched by wall clock)
const S2 = P.samples.filter((s) => s.cascade && s.pr != null);
const stills = [];
for (const pr of PRS) {
  let best = null;
  for (const s of S2) if (!best || Math.abs(s.pr - pr) < Math.abs(best.pr - pr)) best = s;
  if (!best) continue;
  let f = null;
  for (const fr of frames) if (!f || Math.abs(fr.t - best.epoch) < Math.abs(f.t - best.epoch)) f = fr;
  const out = join(dir, `still-pr${String(pr).replace(".", "_")}.png`);
  const label = `pr ${best.pr.toFixed(2)}`;
  r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", f.file,
    "-vf", `crop=${S}:${S}:${X}:${Y},scale=720:720,drawbox=x=0:y=0:w=110:h=30:color=black@0.6:t=fill,drawtext=text='${label}':x=8:y=7:fontsize=18:fontcolor=white`,
    "-frames:v", "1", "-y", out], { stdio: "inherit" });
  if (r.status !== 0) {
    // drawtext needs a font on some builds; fall back to the bare crop
    r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", f.file, "-vf", `crop=${S}:${S}:${X}:${Y},scale=720:720`, "-frames:v", "1", "-y", out], { stdio: "inherit" });
  }
  stills.push({ pr, sampledPr: best.pr, file: out, frameT: f.t, sampleT: best.epoch });
  console.log(`still pr ${pr}: sample pr ${best.pr.toFixed(3)} (${((f.t - best.epoch) * 1000).toFixed(0)} ms off) -> ${out}`);
}
// a contact sheet of the stills, left to right
if (stills.length > 1) {
  const sheet = join(dir, "stills-sheet.png");
  const inputs = stills.flatMap((s) => ["-i", s.file]);
  const n = stills.length;
  r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex",
    stills.map((_, i) => `[${i}:v]scale=360:360[v${i}]`).join(";") + ";" + stills.map((_, i) => `[v${i}]`).join("") + `hstack=inputs=${n}`,
    "-frames:v", "1", "-y", sheet], { stdio: "inherit" });
  if (r.status === 0) console.log("sheet -> " + sheet);
}
writeFileSync(join(dir, "stills.json"), JSON.stringify({ crop: { S, X, Y }, clip, stills }, null, 1));
