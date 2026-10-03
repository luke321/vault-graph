// github#186
import { spawn } from "node:child_process";
import { setPriority, constants } from "node:os";

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function isStaticAction(allowed, last, reportReplaced = false) {
  return !!allowed && reportReplaced === true && last.frames === 0 && last.path === "instant: nothing to move";
}

export async function cleanupAll(tasks) {
  const errors = [];
  for (const task of tasks) {
    try { await task(); } catch (e) { errors.push(e.message); }
  }
  return errors;
}

export function startProcess(exe, args, { signal, priority = true, onOutput } = {}) {
  const child = spawn(exe, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "", error = null, closed = false;
  child.stdin.on("error", e => { if (e.code !== "EPIPE" && e.code !== "ERR_STREAM_DESTROYED") error = e; });
  const stop = () => { if (!closed) child.kill(); };
  const done = new Promise(resolve => {
    child.on("error", e => { error = e; });
    child.stdout.on("data", d => { stdout += d; if (onOutput) onOutput(String(d)); });
    child.stderr.on("data", d => { stderr = (stderr + d).slice(-1024 * 1024); });
    child.on("close", code => {
      closed = true; signal?.removeEventListener("abort", stop);
      resolve({ code, stdout, stderr, error });
    });
  });
  if (priority && child.pid) {
    try { setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL); }
    catch (e) { error = e; stop(); }
  }
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  return { child, done, stop, get closed() { return closed; },
    async result() {
      const r = await done;
      if (r.error || r.code !== 0) throw Error(`${exe} failed (${r.code}): ${r.error?.message || r.stderr.slice(-3000)}`);
      return r.stdout;
    }
  };
}

export async function run(exe, args, options) {
  return startProcess(exe, args, options).result();
}

export function captureArgs(region, threads, master) {
  return ["-hide_banner", "-loglevel", "info", "-threads", String(threads), "-filter_threads", String(threads),
    "-thread_queue_size", "32", "-f", "gdigrab", "-framerate", "60", "-draw_mouse", "0",
    "-offset_x", String(region.x), "-offset_y", String(region.y), "-video_size", `${region.size}x${region.size}`,
    "-i", "desktop", "-c:v", "ffv1", "-level", "3", "-threads", String(threads), "-slices", "4",
    "-slicecrc", "1", "-fps_mode", "passthrough", "-progress", "pipe:1", "-stats_period", "0.1", "-n", master];
}

export function encodeArgs(master, out, duration, threads) {
  return ["-v", "error", "-threads", String(threads), "-filter_threads", String(threads), "-i", master,
    "-t", String(duration), "-vf", "fps=60,format=yuv420p", "-c:v", "libx264", "-threads", String(threads),
    "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", "-n", out];
}

export function measuredRegion(d, monitor, size) {
  if (d.dpr !== 1 || d.innerWidth !== size || d.innerHeight !== size) {
    throw Error("Native capture currently requires DPR=1 and the requested square viewport: " + JSON.stringify(d));
  }
  const border = (d.outerWidth - d.innerWidth) / 2;
  const region = { x: Math.round(d.screenX + border),
    y: Math.round(d.screenY + d.outerHeight - d.innerHeight - border), size };
  if (region.x < monitor.x || region.y < monitor.y || region.x + size > monitor.x + monitor.w ||
      region.y + size > monitor.y + monitor.h) throw Error("Measured capture region extends outside its monitor");
  return region;
}

export function stats(values) {
  const sorted = values.map(v => Math.round(v * 1e6) / 1e6).sort((a, b) => a - b);
  return { count: sorted.length, median: sorted[Math.floor(sorted.length / 2)] ?? null,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? null, max: sorted.at(-1) ?? null,
    over35: sorted.filter(x => x > 35).length, over50: sorted.filter(x => x > 50).length };
}

export function frameHashes(text) {
  return text.split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => line.split(",").at(-1).trim());
}

export function retention(source, reference) {
  if (!source.length || !reference.length) throw Error("Empty frame hash evidence");
  const a = new Set(source), b = new Set(reference);
  return { sourceFrames: source.length, sourceDistinct: a.size, referenceFrames: reference.length,
    retainedDistinct: [...b].filter(x => a.has(x)).length,
    sampledOut: [...a].filter(x => !b.has(x)).length, invented: [...b].filter(x => !a.has(x)).length };
}

export function repeatRuns(hashes, from, to, fps = 60) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= hashes.length; i++) {
    if (i < hashes.length && hashes[i] === hashes[start]) continue;
    const begin = start / fps, end = i / fps;
    if (i - start >= 2 && end > from && begin < to) {
      out.push({ start: begin, frames: i - start, activeFrames: Math.max(0,
        Math.min(i, Math.ceil(to * fps)) - Math.max(start, Math.ceil(from * fps))) });
    }
    start = i;
  }
  return out;
}

export function durationCheck(source, encoded) {
  if (!(source > 0) || !(encoded > 0)) throw Error("Missing or invalid media duration");
  return { source, encoded, delta: encoded - source, withinOneFrame: Math.abs(encoded - source) <= 1 / 60 + 0.002 };
}
