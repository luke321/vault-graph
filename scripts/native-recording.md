# Native desktop animation recording

`record-native.mjs` captures an exported synthetic fixture in headed Chrome on Windows.
It measures the entire square viewport, including controls, at DPR 1. FFmpeg reads the
desktop clock through `gdigrab` at 60 FPS with an input queue of 32, saving timestamped
FFV1 frames to Matroska with timestamp passthrough. After capture closes Chrome, a
separate H264 encode samples at 60 FPS without changing the source duration. All FFmpeg
and FFprobe processes run below normal priority with at most four threads. No screenshots
or CDP screencast frames are taken during recording; CDP drives the action and measures rAF.

```powershell
node scripts/record-native.mjs --html <export.html> --out <new-directory> --label "feature - shape fixture"
```

Chrome, FFmpeg and FFprobe must be installed. Use `--chrome`, `--ffmpeg` or `--ffprobe`
for explicit executables. The source must be a self-contained Vault Graph export.
Default action is Refresh from `?rest`; `--trigger-file` accepts trusted JavaScript
to start a different measured cascade. `--setup-file` accepts trusted async JavaScript
for settled preparation before recording (for example switching to tags or hiding a
group that the recorded action restores). `--allow-static` is only for an explicitly
expected zero-membership-change action: the app must report zero cascade frames and
`instant: nothing to move`, in a new report object replacing the one retained immediately
before the trigger. The identity comparison happens inside the page, before serialization,
and is saved as `reportReplaced` in `capture.json`. A no-op trigger cannot reuse a setup's
static report. The calendar or camera may still adjust. Stale cascade measurements never
stand in for the recorded action.
Timeout defaults to 30 seconds, maximum 120.
The tool rejects an existing output directory without changing it. Preserve both the
original HTML and generated evidence when comparing app versions; use the same fixture,
viewport, action, display and machine conditions serially.

## Harness integration

The default adapter is `scripts/harness-hook.mjs`. `--harness-module <module.mjs>`
is an explicit portable seam for testing a recorder branch against a newer checkout's
contract. The module exports `acquire`, `release`, `claimScreen`, and optionally `admit`
and `threads`. The recorder asks admission for `record`, acquires `record` **before**
claiming a screen with the same owner, and releases screen then record in cleanup.
This order avoids two screen owners waiting for the aliasing record resource. Admission
for `encode` is requested again before the serial encode and verification stage.

Machine guards, lock storage and scheduling remain in the locally configured hook.
Use that hook's fresh guard before invocation as required by local policy. Without a
configured hook, explicitly choose `--monitor left|right|primary` and arrange exclusive
screen access externally. The selected working area must fit the viewport and Chrome
frame. Scaling other than DPR 1 is rejected. Do not cover the capture region while
recording. Chrome uses its own temporary profile; cleanup closes only its owned browser.

## Evidence and limits

The output retains `capture-lossless.mkv`, `capture.mp4`, `capture.log`, measured region,
app timestamps and source SHA-256 in `capture.json`, native and lossless 60 FPS reference
frame hashes, `verification.json`, and each headed playback trace. Each MP4 is played
to ended twice by default. A pending video-frame callback is cancelled between plays.
The PNG poster is extracted from the completed MP4 after capture; it cannot stall a take.

Verification reports actual source versus encoded duration, exact distinct native states
retained by the lossless 60 FPS reference, source timestamp gaps and repeated active
frames, and app rAF gaps. H264 is lossy, so identity comparisons use the lossless reference,
not H264 hashes. Player drops, corruption and callback gaps are reported separately.
Technical checks reject duration changes greater than one frame, unexpected reference
states, missing frame counts, active source gaps over 50 ms and three-frame active holds.
They are deliberately conservative for a continuously moving cascade; other actions may
contain intentional holds and require interpretation of retained evidence.

**Technical checks are not a smoothness verdict. Acceptance remains pending user playback.**
The prior CDP pipeline could freeze for about 250 ms despite app rAF near 17 ms; repairing
timestamps or decoding with zero drops cannot recover missing visual states. The native
candidate motivating this tool retained 339 of 342 distinct states, matched 7.250 seconds
of source time, and played with 0 then 1 dropped frames. Those measurements establish a
candidate, not user approval. Never replace a rejected review with an unmeasured retime.

Focused checks: `node --test scripts/native-recording.test.mjs`, `npm run lint`,
`node scripts/check-comments.mjs`, then guarded serial before/after captures. A full app
suite is separate from these recorder checks.
