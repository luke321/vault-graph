#!/usr/bin/env node
// github#186
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { findChrome } from "./chrome.mjs";
import { attach } from "./cdp.mjs";
import { pause, run, startProcess, captureArgs, encodeArgs, measuredRegion, stats, cleanupAll,
  frameHashes, retention, repeatRuns, durationCheck } from "./native-recording.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (key, fallback = "") => { const i = argv.indexOf("--" + key); return i < 0 ? fallback : argv[i + 1]; };
if (argv.includes("--help")) {
  console.log("node scripts/record-native.mjs --html <export.html> --out <new-directory> --label <feature - scene>\n" +
    "  [--size 1080] [--monitor primary|left|right] [--threads 4] [--max-seconds 30]\n" +
    "  [--ffmpeg <exe>] [--ffprobe <exe>] [--chrome <exe>] [--harness-module <harness-hook.mjs>]\n" +
    "  [--trigger-file <trusted-js>] [--playback-runs 2]\n" +
    "Windows native capture; needs DPR=1. Hook-selected monitor overrides --monitor. See native-recording.md.");
  process.exit(0);
}

const controller = new AbortController(), signal = controller.signal;
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
const jsonWrite = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const owner = "record-native " + process.pid;
let hook, screen, recordHeld = false, browser = null, recorder = null, out, outputCreated = false;
let recordLog = "";

function checkAbort() { if (signal.aborted) throw Error("Recording interrupted"); }
async function until(fn, ms, label) {
  const end = Date.now() + ms;
  do { checkAbort(); if (await fn()) return; await pause(100); } while (Date.now() < end);
  throw Error(label + " timed out");
}
async function freePort() {
  const s = createServer();
  await new Promise((resolve, reject) => { s.once("error", reject); s.listen(0, "127.0.0.1", resolve); });
  const port = s.address().port; await new Promise(resolve => s.close(resolve)); return port;
}
async function monitorBounds(which) {
  if (!["left", "right", "primary"].includes(which)) throw Error("A monitor must be selected by the hook or --monitor");
  const text = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | " +
    "ForEach-Object { [pscustomobject]@{x=$_.WorkingArea.X;y=$_.WorkingArea.Y;w=$_.WorkingArea.Width;" +
    "h=$_.WorkingArea.Height;primary=$_.Primary} } | ConvertTo-Json -Compress"], { signal, priority: false });
  const all = [JSON.parse(text)].flat().sort((a, b) => a.x - b.x);
  const monitor = which === "primary" ? all.find(s => s.primary) : which === "left" ? all[0] : all.at(-1);
  if (!monitor) throw Error("Selected monitor is unavailable");
  return monitor;
}
async function closeBrowser() {
  const b = browser; if (!b) return;
  browser = null;
  try { if (b.page) { await b.page.send("Browser.close").catch(() => {}); b.page.close(); } }
  finally {
    await pause(400);
    if (b.child.pid && b.child.exitCode === null) {
      await run("taskkill.exe", ["/PID", String(b.child.pid), "/T", "/F"], { priority: false }).catch(() => {});
    }
  }
}
async function openBrowser(html, monitor, size, chrome) {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "vg-native-"));
  const url = pathToFileURL(html).href + "?rest";
  const child = spawn(chrome, ["--user-data-dir=" + profile, "--remote-debugging-port=" + port,
    "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--no-first-run",
    "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "--allow-file-access-from-files",
    `--window-position=${monitor.x + 20},${monitor.y + 20}`, `--window-size=${size + 40},${size + 100}`,
    "--app=" + url], { stdio: "ignore" });
  let launchError = null; child.on("error", e => { launchError = e; });
  browser = { child, page: null };
  await until(async () => {
    if (launchError || child.exitCode !== null) throw launchError || Error("Owned Chrome exited before attachment");
    try { browser.page = await attach(port, pathToFileURL(html).href); return true; } catch { return false; }
  }, 12000, "Owned Chrome");
  const p = browser.page;
  await p.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await p.send("Page.bringToFront");
  const window = await p.send("Browser.getWindowForTarget");
  for (let i = 0; i < 5; i++) {
    const d = await p.eval("({outerWidth,outerHeight,innerWidth,innerHeight})");
    if (d.innerWidth === size && d.innerHeight === size) break;
    await p.send("Browser.setWindowBounds", { windowId: window.windowId,
      bounds: { width: size + d.outerWidth - d.innerWidth, height: size + d.outerHeight - d.innerHeight } });
    await pause(150);
  }
  const d = await p.eval("({screenX,screenY,outerWidth,outerHeight,innerWidth,innerHeight,dpr:devicePixelRatio})");
  return { p, display: d, region: measuredRegion(d, monitor, size) };
}

try {
  if (process.platform !== "win32") throw Error("Native gdigrab recording requires Windows");
  if (!arg("html") || !arg("out") || !arg("label")) throw Error("Pass --html, --out and --label; see --help");
  const size = Number(arg("size", "1080")), requestedThreads = Number(arg("threads", "4"));
  const maxMs = Number(arg("max-seconds", "30")) * 1000, plays = Number(arg("playback-runs", "2"));
  if (!Number.isInteger(size) || size < 320 || size > 2160 || size % 2 || !Number.isInteger(requestedThreads) ||
    requestedThreads < 1 || requestedThreads > 4 || !(maxMs >= 1000 && maxMs <= 120000) || ![1, 2].includes(plays)) {
    throw Error("Invalid size, thread cap, timeout or playback count");
  }
  const source = resolve(arg("html")), original = readFileSync(source, "utf8"), label = arg("label");
  const pattern = /(window\.VAULT_DATA=\{[^\n]*?"vault":)"(?:\\.|[^"\\])*"/;
  if (!pattern.test(original)) throw Error("Source is not a self-contained Vault Graph export");
  const trigger = arg("trigger-file") ? readFileSync(resolve(arg("trigger-file")), "utf8")
    : "document.getElementById('vg-refresh').click();";
  new Function(trigger);
  out = resolve(arg("out"));
  if (existsSync(out)) throw Error("Output directory already exists; use a fresh directory to prevent stale evidence");
  const ffmpeg = arg("ffmpeg", "ffmpeg"), ffprobe = arg("ffprobe", "ffprobe"), chrome = findChrome(arg("chrome"));
  await run(ffmpeg, ["-version"], { signal }); await run(ffprobe, ["-version"], { signal });
  const modulePath = resolve(arg("harness-module", join(HERE, "harness-hook.mjs")));
  if (!existsSync(modulePath)) throw Error("Harness module is missing; pass --harness-module from a current checkout");
  hook = await import(pathToFileURL(modulePath).href);
  if (hook.admit) await hook.admit("record", owner);
  checkAbort();
  if (!hook.acquire("record", owner)) throw Error("Recording resource is busy");
  recordHeld = true;
  screen = hook.claimScreen(owner);
  if (!screen.ok) throw Error("No guarded screen is available");
  const monitor = await monitorBounds(screen.which || arg("monitor"));
  const hookThreads = hook.threads ? await hook.threads("encode", owner) : null;
  const threads = Math.min(requestedThreads, hookThreads || requestedThreads);
  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(out); outputCreated = true;
  const html = join(out, "page.html");
  writeFileSync(html, original.replace(pattern, (_m, prefix) => prefix + JSON.stringify(label)));
  const sourceHash = createHash("sha256").update(original).digest("hex");
  const { p, display, region } = await openBrowser(html, monitor, size, chrome);
  await until(() => p.eval("!!(window.__vg && __vg.renderer && !__vg.demo.busy())"), 15000, "Graph ready");
  if (p.firstError()) throw Error("Source page error: " + p.firstError());
  await p.eval(`document.title=${JSON.stringify(label)}; void 0`);
  await pause(400);
  await p.eval("window.nativeTrace={origin:performance.timeOrigin,raf:[],active:true};" +
    "requestAnimationFrame(function tick(t){nativeTrace.raf.push({t,busy:__vg.demo.busy()});" +
    "if(nativeTrace.active)requestAnimationFrame(tick);}); void 0");
  const master = join(out, "capture-lossless.mkv");
  let progress = "";
  recorder = startProcess(ffmpeg, captureArgs(region, threads, master), { signal, onOutput: chunk => { progress += chunk; } });
  await until(async () => {
    if (recorder.closed) { await recorder.result(); throw Error("Capture stopped before its first frames"); }
    return [...progress.matchAll(/frame=(\d+)/g)].some(m => Number(m[1]) >= 2);
  }, 10000, "First native frames");
  await pause(500);
  const clickWall = Date.now();
  await p.eval(`(() => {${trigger}\n})(); void 0`);
  await pause(300);
  await until(async () => {
    if (recorder.closed) { await recorder.result(); throw Error("Capture stopped during the action"); }
    return !(await p.eval("__vg.demo.busy()"));
  }, maxMs, "Recorded action");
  await pause(500);
  const data = await p.eval("nativeTrace.active=false; ({trace:nativeTrace,last:__vg.lastCascade()})");
  const pageErrors = p.errors;
  recorder.child.stdin.write("q\n");
  await until(() => recorder.closed, 15000, "Capture finalization");
  const captured = await recorder.done; recordLog = captured.stderr;
  writeFileSync(join(out, "capture.log"), recordLog);
  await recorder.result(); recorder = null;
  if (statSync(master).size < 1024) throw Error("Lossless source is empty");
  const capture = { sourceHash, label, display, region, monitor: screen.which || arg("monitor"), threads, clickWall, pageErrors, ...data };
  jsonWrite(join(out, "capture.json"), capture);
  await closeBrowser();
  if (pageErrors.length) throw Error("Source page reported errors; inspect capture.json");
  if (data.last.exit !== "converged" || data.last.frames < 20) throw Error("The recorded action did not complete a measured animation");
  if (/error|failed|dropp?ing|overrun/i.test(recordLog)) throw Error("Capture reported an error or dropped input; inspect capture.log");
  if (hook.admit) await hook.admit("encode", owner);
  checkAbort();
  const probe = async file => JSON.parse(await run(ffprobe, ["-v", "error", "-threads", String(threads),
    "-select_streams", "v:0", "-show_entries", "frame=best_effort_timestamp_time:stream=width,height,time_base,nb_frames:format=duration",
    "-of", "json", file], { signal }));
  const sourceProbe = await probe(master), duration = Number(sourceProbe.format.duration);
  const video = join(out, "capture.mp4");
  await run(ffmpeg, encodeArgs(master, video, duration, threads), { signal });
  const encodedProbe = await probe(video);
  const hash = async (filter, name) => {
    const text = await run(ffmpeg, ["-v", "error", "-threads", String(threads), "-filter_threads", String(threads),
      "-i", master, "-t", String(duration), ...(filter ? ["-vf", filter] : []), "-fps_mode", "passthrough",
      "-threads", String(threads), "-f", "framemd5", "-"], { signal });
    writeFileSync(join(out, name), text); return frameHashes(text);
  };
  const sourceHashes = await hash("", "source.framemd5"), reference = await hash("fps=60", "reference.framemd5");
  const inputStart = Number(/start: ([\d.]+)/.exec(recordLog)?.[1]);
  if (!Number.isFinite(inputStart)) throw Error("Cannot align native timestamps with the app clock");
  const appStart = (data.trace.origin + data.last.t0) / 1000 - inputStart, appEnd = appStart + data.last.ms / 1000;
  const pts = sourceProbe.frames.map(f => Number(f.best_effort_timestamp_time)).filter(t => t >= appStart && t <= appEnd);
  const raf = data.trace.raf.filter(f => f.t >= data.last.t0 && f.t <= data.last.t0 + data.last.ms);
  const verification = { duration: durationCheck(duration, Number(encodedProbe.format.duration)),
    identity: retention(sourceHashes, reference), appStart, appEnd,
    activeSourceGapsMs: stats(pts.slice(1).map((t, i) => (t - pts[i]) * 1000)),
    activeRafGapsMs: stats(raf.slice(1).map((f, i) => f.t - raf[i].t)),
    activeRepeats: repeatRuns(reference, appStart + 0.05, appEnd - 0.05),
    encodedFrames: encodedProbe.frames.length, playback: [], acceptance: "pending user playback" };
  jsonWrite(join(out, "verification.json"), verification);
  const playbackPage = join(out, "playback.html");
  writeFileSync(playbackPage, '<!doctype html><meta charset="utf-8"><title>Native recording playback</title>' +
    '<style>body{margin:0;background:#111;color:white;font:16px system-ui}h1{font-size:16px;margin:8px}video{width:100%;height:calc(100vh - 48px);object-fit:contain}</style>' +
    '<h1 id="label"></h1><video id="v" controls muted playsinline></video>');
  const player = (await openBrowser(playbackPage, monitor, size, chrome)).p;
  await player.eval(`document.title=${JSON.stringify(label + " - encoded playback")};document.getElementById('label').textContent=document.title;void 0`);
  for (let i = 0; i < plays; i++) {
    await player.eval(`(() => { const v=document.getElementById('v');v.src=${JSON.stringify(pathToFileURL(video).href)};
      if(window.playCallback!==undefined)v.cancelVideoFrameCallback(window.playCallback);
      window.playTrace={frames:[],events:[],error:null};
      for(const name of ['playing','waiting','stalled','ended','error'])v['on'+name]=()=>{
        playTrace.events.push({name,wall:performance.now(),media:v.currentTime});
        if(name==='ended'||name==='error')v.cancelVideoFrameCallback(window.playCallback);
        if(name==='error')playTrace.error=v.error?.message || 'Video error';};
      function cb(now,m){playTrace.frames.push({wall:now,media:m.mediaTime,presented:m.presentedFrames});
        if(!v.ended)window.playCallback=v.requestVideoFrameCallback(cb);}
      window.playCallback=v.requestVideoFrameCallback(cb);
      v.play().catch(e=>playTrace.error=String(e)); })();void 0`);
    await until(async () => {
      const s = await player.eval("({ended:document.getElementById('v').ended,error:playTrace.error})");
      if (s.error) throw Error(s.error); return s.ended;
    }, (duration + 15) * 1000, "Encoded playback");
    const result = await player.eval("(() => {const v=document.getElementById('v'),q=v.getVideoPlaybackQuality();" +
      "return {...playTrace,ended:v.ended,total:q.totalVideoFrames,dropped:q.droppedVideoFrames,corrupted:q.corruptedVideoFrames};})()");
    result.callbackGapsMs = stats(result.frames.slice(1).map((f, j) => f.wall - result.frames[j].wall));
    jsonWrite(join(out, `playback-${i + 1}.json`), result);
    verification.playback.push({ ended: result.ended, total: result.total, dropped: result.dropped,
      corrupted: result.corrupted, callbackGapsMs: result.callbackGapsMs });
    jsonWrite(join(out, "verification.json"), verification);
  }
  await closeBrowser();
  const valid = verification.duration.withinOneFrame && verification.identity.invented === 0 &&
    verification.identity.referenceFrames === verification.encodedFrames && pts.length > 20 &&
    verification.activeSourceGapsMs.max <= 50 && !verification.activeRepeats.some(r => r.activeFrames >= 3) &&
    verification.playback.every(p => p.ended && p.corrupted === 0);
  verification.technicalChecksPassed = valid;
  jsonWrite(join(out, "verification.json"), verification);
  console.log(JSON.stringify(verification));
  if (!valid) throw Error("Recording failed cadence checks; retain evidence and inspect verification.json");
} catch (e) {
  console.error(e.message); process.exitCode = 1;
  if (outputCreated) jsonWrite(join(out, "failure.json"), { error: e.message });
} finally {
  const cleanupErrors = await cleanupAll([
    async () => {
      if (!recorder) return;
      try {
        if (!recorder.closed) recorder.child.stdin.end("q\n");
        await Promise.race([recorder.done, pause(3000)]);
      } finally { if (!recorder.closed) recorder.stop(); }
      const result = await recorder.done;
      if (outputCreated) writeFileSync(join(out, "capture.log"), result.stderr);
    },
    closeBrowser,
    () => { if (screen?.lock) hook.release(screen.lock, owner); },
    () => { if (recordHeld) hook.release("record", owner); }
  ]);
  if (cleanupErrors.length) { console.error("Cleanup: " + cleanupErrors.join("; ")); process.exitCode = 1; }
  process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
}
