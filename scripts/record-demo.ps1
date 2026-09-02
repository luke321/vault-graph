# Record the demo to a video file, unattended.
#
#   .\scripts\record-demo.ps1
#   .\scripts\record-demo.ps1 -Slow 1.5 -Fps 60 -Out demo.mp4
#   .\scripts\record-demo.ps1 -Url http://127.0.0.1:8765/?demo
#   .\scripts\record-demo.ps1 -Monitor right          # keep it off the screen you are on
#   .\scripts\record-demo.ps1 -Act timeline           # one feature's beats, not the whole demo
#
# -ACT NAME records ONE act instead of the full storyboard -- one of the `act:` tags in
# demoMode() (src/page.js): intro, note, pin, compactaxis, timeline, heatmap, folders,
# hiddenbydefault, subfolders, subfoldercolor, camera, colours, unlinked. -Out defaults to
# `demo-<name>-<timestamp>.mp4` instead of `demo-<timestamp>.mp4`,
# same folder, same everything else. This script only ever writes the raw take (.mp4) --
# encoding it into the docs gallery's `assets/features/<name>.webp` is make-hero.ps1's job,
# same as it always has been for the hero; see docs/features/_template.md for the exact
# two-command pipeline.
#
# RECORDS AGAINST THE DEMO VAULT BY DEFAULT, never your own. With no -Url this builds
# scripts/make-demo-vault.mjs fresh and points Chrome at that -- never at whatever
# VAULT_GRAPH_VAULT/OBSIDIAN_VAULT/Obsidian's registry would otherwise resolve, which is
# your real vault on any machine set up the documented way, and the page embeds every
# note's real title. This was the caller's job until it silently recorded the real vault
# once; see the "No URL given" branch below for the incident this replaced.
#
# Pass -Url yourself only to record against something else on purpose -- a mirror of your
# own vault while chasing a layout bug (make-mirror-vault.mjs), or a hand-tuned fixture:
#
#   node scripts/make-mirror-vault.mjs --vault <path> --out "$env:TEMP/Mirror Vault"
#   node src/build-graph.mjs --vault "$env:TEMP/Mirror Vault" --out "$env:TEMP/rec/vault-graph.html"
#   .\scripts\record-demo.ps1 -Monitor right -Url "file:///$env:TEMP/rec/vault-graph.html?demo"
#
# The vault's FOLDER NAME becomes the title in the top-left corner, so name it something you
# do not mind publishing whenever you pass your own -Url.
#
# One thing the synthetic demo vault does worse than a mirror of a real one: its notes are
# spread evenly over the calendar within each day, so the heatmap's busiest day holds far
# fewer notes than a real vault's, and the three heatmap beats land flatter. Pass --notes to
# make-demo-vault.mjs (via your own -Url pipeline above) if that matters more than the take
# being short.
#
# Three processes, in order: Chrome with a debugging port, ffmpeg grabbing that window,
# and the driver. The driver BLOCKS until the last beat lands, so ffmpeg is stopped on
# the demo actually finishing rather than after a guessed duration -- which is the same
# rule the page itself follows for every animation, and it means adding beats to the
# storyboard needs no change here.
#
# WHAT IS IN THE FRAME: gdigrab captures the Chrome window's rect, so the sidebar, the heatmap
# band and the disc are all there. The pointer visible in the take is drawn INSIDE THE PAGE
# (see demoCursorAt in page.js) and moved by eval, in step with the same coordinates CDP
# dispatches -- it is part of the window's own rendered pixels, so gdigrab needs no help
# capturing it. This replaced an earlier version that moved the REAL system pointer with
# SendInput: it looked identical for a click, and silently broke a drag -- Windows delivers
# real input for wherever the OS pointer physically sits regardless of which process put it
# there, so the real pointer was a second, genuinely native mouse-event stream landing in
# the same window as the CDP-injected one, and the two disagreed on `buttons` in a way that
# aborted the drag mid-glide and handed the gesture to sigma's own default panning. Nothing
# here touches the physical mouse any more.

[CmdletBinding()]
param(
  [string] $Url  = "",
  [string] $Out  = "",
  [int]    $Fps  = 30,
  [double] $Slow = 1.0,
  [int]    $Port = 9222,
  [int]    $Width = 1600,
  [int]    $Height = 1000,
  # WHICH SCREEN to put the window on, centred in that screen's working area. Tidiness
  # now rather than a mouse-safety measure -- the take no longer touches the physical
  # pointer at all -- but a live recording window flashing through beats in your
  # peripheral vision is still worth putting somewhere you are not looking.
  #
  # `left` and `right` are by POSITION, not by device number -- \\.\DISPLAY2 is whichever
  # one Windows enumerated second, which says nothing about where it physically sits.
  [ValidateSet('', 'primary', 'left', 'right')]
  [string] $Monitor = '',
  # ...or exact coordinates, which win over -Monitor. [int]::MinValue means "unset",
  # because 0 is a legitimate position.
  [int]    $X = [int]::MinValue,
  [int]    $Y = [int]::MinValue,
  [switch] $KeepChrome,
  # One act's beats instead of the whole storyboard -- see demoMode()'s `act:` tags in
  # src/page.js. Empty (the default) records everything, unchanged from before this flag
  # existed. Last in the param block so it doesn't shift the positional index of anything
  # documented above it.
  [string] $Act  = ""
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here

# --- a debugging port NOBODY ELSE IS ON --------------------------------------------------
# A Chrome already listening on 9222 -- a leftover from an interrupted take, another tool,
# the invariant suite -- gets attached to instead of the window that is about to be
# launched. Then ffmpeg records the new window while the driver drives the old one: one take
# came out 188 seconds instead of 34, because a background window has its animation frames
# throttled, so `busy()` never went false and every settle ran to its 30-second cap. It
# looked like a page bug and it was two Chromes.
$probe = $Port
while ($probe -lt $Port + 12) {
  $inUse = $false
  try { $null = Invoke-WebRequest -Uri "http://127.0.0.1:$probe/json/version" -UseBasicParsing -TimeoutSec 1; $inUse = $true }
  catch { $inUse = $false }
  if (-not $inUse) { break }
  Write-Host "port $probe already has a debugging Chrome on it -- trying $($probe + 1)" -ForegroundColor DarkYellow
  $probe++
}
if ($probe -ge $Port + 12) { throw "no free debugging port in $Port..$($Port + 11)" }
$Port = $probe

# --- ffmpeg. winget adds its shim to PATH but not to an already-running shell. --------
$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) { $ffmpeg = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ffmpeg.exe' }
if (-not (Test-Path $ffmpeg)) {
  throw "ffmpeg not found. Install it with:  winget install Gyan.FFmpeg"
}

# --- what to record ------------------------------------------------------------------
if (-not $Url) {
  # No URL given: build the DEMO vault, never the caller's own. This used to call bare
  # build-graph.mjs, which resolves VAULT_GRAPH_VAULT / OBSIDIAN_VAULT / Obsidian's
  # registry exactly like every other tool in this ecosystem is supposed to -- which is
  # precisely wrong here. Every per-feature doc's "regenerate this clip" command
  # (docs/features/<name>.md) is `-Act <name>` with no -Url, so on any machine set up the
  # documented way (sync-claude-settings wires OBSIDIAN_VAULT to the real vault) that
  # bare default silently recorded the real vault -- its real note titles, straight into
  # a take meant for the public README. The safe vault has to be the DEFAULT, not a
  # paragraph up in this file's own header that nobody running the documented one-liner
  # ever reads.
  $demoOut = Join-Path $env:TEMP 'vg-demo-vault'
  $demoHtml = Join-Path $env:TEMP 'vg-demo-vault.html'
  Write-Host "building the demo vault..." -ForegroundColor DarkGray
  & node (Join-Path $here 'make-demo-vault.mjs') --out $demoOut
  if ($LASTEXITCODE -ne 0) { throw "make-demo-vault.mjs failed (exit $LASTEXITCODE)" }
  Write-Host "building a fresh snapshot to record..." -ForegroundColor DarkGray
  & node (Join-Path $here '../src/build-graph.mjs') --vault $demoOut --out $demoHtml
  if ($LASTEXITCODE -ne 0) { throw "build-graph.mjs failed (exit $LASTEXITCODE)" }
  $Url = ([uri]("file:///" + ($demoHtml -replace '\\','/'))).AbsoluteUri + "?demo"
}
if (-not $Out) {
  $stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
  # $(...), NOT bare (...) -- `if` is a STATEMENT, and only the subexpression operator
  # converts a statement's output into a value bare parens can be used in. Bare parens
  # parse fine (PowerShell accepts an unresolved bareword there) and then fail at RUNTIME
  # with "the term 'if' was not recognized" -- caught only by actually running this, not by
  # a syntax check, which is exactly why this needed the manual verification pass.
  $base = $(if ($Act) { "demo-$Act-$stamp" } else { "demo-$stamp" })
  $Out = Join-Path $repo ($base + ".mp4")
}

Write-Host "url    $Url"
Write-Host "out    $Out"
if ($Act) { Write-Host "act    $Act" }

# --- Chrome ---------------------------------------------------------------------------
# Its own profile directory: a debugging port is refused if Chrome is already running on
# the default profile, and this also keeps the demo free of the real profile's extensions,
# bookmarks bar and restore prompts, all of which would end up in the frame.
# NOT $profile -- that is a PowerShell automatic variable (the profile script path).
$profileDir = Join-Path $env:TEMP 'vg-demo-profile'

# WIPED BEFORE EVERY RUN. The page's own state (pinned notes, chosen colours, hidden
# folders) lives in the vault's localStorage, which is part of this profile and
# otherwise survives across separate invocations -- a `pin` take recorded right after the
# hero take once opened already showing "Unpin from hub" on a note the hero had pinned,
# because both ran against the same leftover profile. Deleting it here, not just at the
# end, also means a run that crashed or was killed mid-take cannot poison the next one.
if (Test-Path $profileDir) {
  Write-Host "clearing the leftover demo profile ($profileDir)..." -ForegroundColor DarkGray
  Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
}

$chrome = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe').'(default)'

# --- where to put the window ----------------------------------------------------------
# Centred in the chosen screen's WORKING area, not its bounds, so the taskbar cannot end
# up over the window -- and gdigrab captures the window's rect, so anything overlapping it
# is in the video.
#
# Positive offsets only, in practice. gdigrab's `desktop` input is addressed from the
# PRIMARY monitor's top-left, so a monitor to the left of primary has negative coordinates
# and captures unreliably. A monitor to the right is the easy case.
$posX = 40; $posY = 40
if ($Monitor) {
  Add-Type -AssemblyName System.Windows.Forms
  $screens = @([System.Windows.Forms.Screen]::AllScreens)
  $target = switch ($Monitor) {
    'primary' { $screens | Where-Object { $_.Primary } | Select-Object -First 1 }
    'left'    { $screens | Sort-Object { $_.Bounds.X } | Select-Object -First 1 }
    'right'   { $screens | Sort-Object { $_.Bounds.X } | Select-Object -Last 1 }
  }
  if (-not $target) { throw "no monitor matched -Monitor $Monitor" }
  $wa = $target.WorkingArea
  $posX = $wa.X + [int](($wa.Width  - $Width)  / 2)
  $posY = $wa.Y + [int](($wa.Height - $Height) / 2)
  Write-Host ("monitor {0} ({1}) -> window at {2},{3}" -f `
    $Monitor, $target.DeviceName, $posX, $posY) -ForegroundColor DarkGray
  if ($wa.X -lt 0) {
    Write-Warning "that screen is left of the primary, so gdigrab sees negative offsets -- check the capture"
  }
}
if ($X -ne [int]::MinValue) { $posX = $X }
if ($Y -ne [int]::MinValue) { $posY = $Y }
# --app= gives a window with no tab strip and no address bar, which is most of what
# would otherwise be in frame. `--disable-features=Translate,TranslateUI` because the
# translate bubble DID appear over the page on a first take -- the vault's folder names
# read as German to Chrome -- and `--lang=en-US` stops it deciding that again.
#
# CalculateNativeWinOcclusion OFF, with the two backgrounding switches beside it: Chrome
# stops painting a window it believes is COVERED, and a page that is not painting never
# runs another requestAnimationFrame -- so a ramp already scheduled (the hover halo's, in
# the take that found this) keeps its handle forever, `__vg.demo.busy()` never goes false,
# and every settle from that beat on burns its full 30-second cap before the driver gives
# up. Measured: 174s of wall clock for a 12s act, then a throw. Same class as the two-
# Chromes incident above and just as unreadable from the symptom -- it looks exactly like
# a page that will not settle.
#
# WHAT THIS DOES NOT FIX: gdigrab still captures the window's own screen region, so a
# window that is genuinely behind another one now records the WINDOW ON TOP OF IT rather
# than stalling. The take has to be visible either way -- that is what -Monitor is for.
# These flags only stop an occluded window from taking the driver down with it.
$chromeArgs = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profileDir",
  '--no-first-run', '--no-default-browser-check',
  '--hide-crash-restore-bubble', '--disable-session-crashed-bubble',
  '--disable-features=Translate,TranslateUI,MediaRouter,CalculateNativeWinOcclusion',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--lang=en-US',
  "--window-size=$Width,$Height", "--window-position=$posX,$posY",
  "--app=$Url"
)
$chromeProc = Start-Process $chrome -ArgumentList $chromeArgs -PassThru
Write-Host "chrome pid $($chromeProc.Id), waiting for the debugging port..." -ForegroundColor DarkGray

$deadline = (Get-Date).AddSeconds(25)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 2
    $ready = $true; break
  } catch { Start-Sleep -Milliseconds 300 }
}
if (-not $ready) { throw "Chrome's debugging port never came up on $Port" }

# The window has to exist before gdigrab can find it, and the page has to have painted
# before it is worth recording. The driver waits for the intro itself, so this only has
# to be long enough for the first frame.
Start-Sleep -Seconds 2

# --- where the window actually is -----------------------------------------------------
# A REGION of the desktop, not `-i title=...`. Two reasons, both found by trying it:
# gdigrab's title match is exact and Chrome's window is titled "<page> - Google Chrome",
# so 'Vault Graph' never matched -- and the page RENAMES ITSELF when the demo finishes
# (that is its completion signal), so even the right title would stop matching mid-take.
# The window rect is stable regardless of what the window is called.
#
# NOT GetWindowRect ALONE. On Windows 10/11 it returns the window rect INCLUDING the
# invisible DWM resize border and drop-shadow margin -- pixels outside what Chrome
# actually paints, roughly 7-8px per edge at 100% scaling and more when scaled -- so
# gdigrab recorded a sliver of real desktop along every edge of every take (issue #26).
# DwmGetWindowAttribute(..., DWMWA_EXTENDED_FRAME_BOUNDS, ...) answers the visible bounds
# instead; GetWindowRect stays as the fallback for whatever DWM call fails on.
Add-Type -Namespace Win -Name U -MemberDefinition @'
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(
    IntPtr h, int attr, out RECT r, int size);
'@ -ErrorAction SilentlyContinue
$DWMWA_EXTENDED_FRAME_BOUNDS = 9

$hwnd = [IntPtr]::Zero
$deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $deadline) {
  $chromeProc.Refresh()
  if ($chromeProc.MainWindowHandle -ne [IntPtr]::Zero) { $hwnd = $chromeProc.MainWindowHandle; break }
  Start-Sleep -Milliseconds 200
}
if ($hwnd -eq [IntPtr]::Zero) { throw "Chrome's window never appeared" }

$wr = New-Object Win.U+RECT
if (-not [Win.U]::GetWindowRect($hwnd, [ref] $wr)) { throw "GetWindowRect failed" }

$r = New-Object Win.U+RECT
# SizeOf($r), NOT SizeOf([Win.U+RECT]) -- the Type-literal overload throws in PS 5.1
# ("System.RuntimeType cannot be marshaled as an unmanaged struct"), because the bracket
# syntax hands Marshal.SizeOf a RuntimeType object rather than binding its Type overload.
# An actual struct instance resolves correctly; the values in it don't matter for a size.
$dwmOk = ([Win.U]::DwmGetWindowAttribute($hwnd, $DWMWA_EXTENDED_FRAME_BOUNDS, [ref] $r, [System.Runtime.InteropServices.Marshal]::SizeOf($r)) -eq 0)
if (-not $dwmOk) {
  Write-Warning "DwmGetWindowAttribute failed; falling back to GetWindowRect (the capture may include a border sliver -- see issue #26)"
  $r = $wr
}

# Clamp to the window's own screen's WORKING area, so an oversized -Width/-Height cannot
# pull desktop in on the far side either -- the same class of bug as the border, just from
# the other direction.
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
$screen = [System.Windows.Forms.Screen]::FromHandle($hwnd)
$wa = $screen.WorkingArea
$cl = [Math]::Max($r.L, $wa.X); $ct = [Math]::Max($r.T, $wa.Y)
$cr = [Math]::Min($r.R, $wa.X + $wa.Width); $cb = [Math]::Min($r.B, $wa.Y + $wa.Height)

# Even dimensions: yuv420p subsamples 2x2, and an odd width makes libx264 refuse.
$rx = $cl; $ry = $ct
$rw = ($cr - $cl) - (($cr - $cl) % 2)
$rh = ($cb - $ct) - (($cb - $ct) % 2)
$trimW = ($wr.R - $wr.L) - ($cr - $cl); $trimH = ($wr.B - $wr.T) - ($cb - $ct)
Write-Host "region ${rw}x${rh} at ${rx},${ry} (trimmed ${trimW}x${trimH} of border/off-screen vs GetWindowRect)" -ForegroundColor DarkGray

# --- ffmpeg ---------------------------------------------------------------------------
# -draw_mouse 0: the pointer in the take is drawn INSIDE THE PAGE, by the driver, always
# (see demoCursorAt in page.js) -- already part of the window's rendered pixels, so
# gdigrab needs no help capturing it. Asking gdigrab to draw the REAL system cursor on
# top would show wherever your actual mouse happens to be resting, which is nowhere near
# the recording window now that nothing moves it there.
# yuv420p because some players refuse anything else.
$ffArgs = @(
  '-hide_banner', '-loglevel', 'warning',
  '-f', 'gdigrab', '-framerate', "$Fps", '-draw_mouse', '0',
  '-offset_x', "$rx", '-offset_y', "$ry", '-video_size', "${rw}x${rh}",
  '-i', 'desktop',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-y', $Out
)
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $ffmpeg
$psi.Arguments = ($ffArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
$psi.RedirectStandardInput = $true      # so we can ask ffmpeg to finalise with 'q'
$psi.UseShellExecute = $false
$ff = [System.Diagnostics.Process]::Start($psi)
$recStart = Get-Date
Write-Host "ffmpeg pid $($ff.Id), recording..." -ForegroundColor DarkGray
Start-Sleep -Milliseconds 800           # let the first frames land before anything moves

# --- the driver -----------------------------------------------------------------------
$failed = $null
try {
  # The demo's cursor is drawn inside the page now (see demoCursorAt in page.js), not
  # moved at the OS level, so there is no --cursor flag left to pass here -- the driver
  # always draws it.
  $driverArgs = @('--port', $Port, '--slow', $Slow, '--match', 'demo')
  if ($Act) { $driverArgs += @('--act', $Act) }
  & node (Join-Path $here 'demo.mjs') @driverArgs
  if ($LASTEXITCODE -ne 0) { $failed = "driver exited $LASTEXITCODE" }
} catch {
  $failed = $_.Exception.Message
} finally {
  Start-Sleep -Milliseconds 900         # hold on the final state instead of cutting on it
  $droveFor = ((Get-Date) - $recStart).TotalSeconds

  # 'q' on stdin, NOT Stop-Process: ffmpeg has to write the moov atom or the mp4 is
  # unplayable. Killed as a fallback only if it ignores the request.
  try { $ff.StandardInput.WriteLine('q'); $ff.StandardInput.Flush() } catch {}
  if (-not $ff.WaitForExit(10000)) {
    Write-Warning "ffmpeg did not finalise; killing it (the file may be truncated)"
    try { $ff.Kill() } catch {}
  }
  if (-not $KeepChrome) { try { $chromeProc.Kill() } catch {} }
  $recFor = ((Get-Date) - $recStart).TotalSeconds
  Write-Host ("recorded {0:N1}s of wall clock ({1:N1}s of it driving)" -f $recFor, $droveFor) -ForegroundColor DarkGray
}

if ($failed) { throw $failed }

if (-not (Test-Path $Out)) { throw "ffmpeg produced no file" }

$size = [math]::Round((Get-Item $Out).Length / 1MB, 2)
Write-Host "`nwrote $Out ($size MB)" -ForegroundColor Green

# ffprobe, NOT `ffmpeg -i`. ffmpeg writes its stream summary to stderr and exits
# non-zero when given no output file, and Windows PowerShell 5.1 turns any native
# command's stderr into an error record -- so the probe threw NativeCommandError on a
# recording that had in fact succeeded. ffprobe answers on stdout and exits 0.
$ffprobe = Join-Path (Split-Path $ffmpeg) 'ffprobe.exe'
if (Test-Path $ffprobe) {
  $dur = (& $ffprobe -v error -show_entries format=duration -of csv=p=0 $Out)
  $vid = (& $ffprobe -v error -select_streams v:0 -show_entries stream=width,height,nb_frames -of csv=p=0 $Out)
  Write-Host ("  {0}s, {1}" -f [math]::Round([double]$dur, 2), $vid) -ForegroundColor DarkGray
}
