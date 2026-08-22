# Record the demo to a video file, unattended.
#
#   .\scripts\record-demo.ps1
#   .\scripts\record-demo.ps1 -Slow 1.5 -Fps 60 -Out demo.mp4
#   .\scripts\record-demo.ps1 -Url http://127.0.0.1:8765/?demo
#
# Three processes, in order: Chrome with a debugging port, ffmpeg grabbing that window,
# and the driver. The driver BLOCKS until the last beat lands, so ffmpeg is stopped on
# the demo actually finishing rather than after a guessed duration -- which is the same
# rule the page itself follows for every animation, and it means adding beats to the
# storyboard needs no change here.
#
# WHAT IS IN THE FRAME: gdigrab captures the Chrome window's rect, so the sidebar, the heatmap
# band and the disc are all there. What is NOT there is a cursor. CDP delivers input to
# the renderer without moving the operating system's pointer, so the buttons visibly
# depress and the hover states light up, but no arrow travels between them. That is the
# honest trade for input that hit-tests like a real click. If a visible cursor matters
# more than that, the alternative is driving the OS pointer with SendInput from
# PowerShell and letting -draw_mouse pick it up -- at the cost of a demo that steals the
# physical mouse for its duration.

[CmdletBinding()]
param(
  [string] $Url  = "",
  [string] $Out  = "",
  [int]    $Fps  = 30,
  [double] $Slow = 1.0,
  [int]    $Port = 9222,
  [int]    $Width = 1600,
  [int]    $Height = 1000,
  [switch] $KeepChrome
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
  # No URL given: build, and learn where it landed from the builder's own "wrote <path>"
  # line -- the same contract refresh-graph.ps1 uses, so "where does the output go" keeps
  # exactly one implementation.
  Write-Host "building a fresh snapshot to record..." -ForegroundColor DarkGray
  $buildOut = & node (Join-Path $here '../src/build-graph.mjs')
  $buildOut | ForEach-Object { $_ }
  if ($LASTEXITCODE -ne 0) { throw "build-graph.mjs failed (exit $LASTEXITCODE)" }
  $wrote = $buildOut | Where-Object { $_ -match '^wrote (.+) \(' } | Select-Object -Last 1
  if ($wrote -notmatch '^wrote (.+) \(') { throw "could not tell where the build landed; pass -Url" }
  $Url = ([uri]("file:///" + ($Matches[1] -replace '\\','/'))).AbsoluteUri + "?demo"
}
if (-not $Out) {
  $Out = Join-Path $repo ("demo-" + (Get-Date -Format 'yyyy-MM-dd-HHmmss') + ".mp4")
}

Write-Host "url    $Url"
Write-Host "out    $Out"

# --- Chrome ---------------------------------------------------------------------------
# Its own profile directory: a debugging port is refused if Chrome is already running on
# the default profile, and this also keeps the demo free of the real profile's extensions,
# bookmarks bar and restore prompts, all of which would end up in the frame.
# NOT $profile -- that is a PowerShell automatic variable (the profile script path).
$profileDir = Join-Path $env:TEMP 'vg-demo-profile'
$chrome = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe').'(default)'
# --app= gives a window with no tab strip and no address bar, which is most of what
# would otherwise be in frame. `--disable-features=Translate,TranslateUI` because the
# translate bubble DID appear over the page on a first take -- the vault's folder names
# read as German to Chrome -- and `--lang=en-US` stops it deciding that again.
$chromeArgs = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profileDir",
  '--no-first-run', '--no-default-browser-check',
  '--hide-crash-restore-bubble', '--disable-session-crashed-bubble',
  '--disable-features=Translate,TranslateUI,MediaRouter',
  '--lang=en-US',
  "--window-size=$Width,$Height", '--window-position=40,40',
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
Add-Type -Namespace Win -Name U -MemberDefinition @'
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
'@ -ErrorAction SilentlyContinue

$hwnd = [IntPtr]::Zero
$deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $deadline) {
  $chromeProc.Refresh()
  if ($chromeProc.MainWindowHandle -ne [IntPtr]::Zero) { $hwnd = $chromeProc.MainWindowHandle; break }
  Start-Sleep -Milliseconds 200
}
if ($hwnd -eq [IntPtr]::Zero) { throw "Chrome's window never appeared" }

$r = New-Object Win.U+RECT
if (-not [Win.U]::GetWindowRect($hwnd, [ref] $r)) { throw "GetWindowRect failed" }
# Even dimensions: yuv420p subsamples 2x2, and an odd width makes libx264 refuse.
$rx = $r.L; $ry = $r.T
$rw = ($r.R - $r.L) - (($r.R - $r.L) % 2)
$rh = ($r.B - $r.T) - (($r.B - $r.T) % 2)
Write-Host "region ${rw}x${rh} at ${rx},${ry}" -ForegroundColor DarkGray

# --- ffmpeg ---------------------------------------------------------------------------
# -draw_mouse 1 and --cursor on the driver: CDP input alone never moves the OS pointer,
# so the recording would show every effect and no arrow. The driver moves the real
# pointer in step with the CDP one (scripts/cursor.ps1) and gdigrab draws it.
# yuv420p because some players refuse anything else.
$ffArgs = @(
  '-hide_banner', '-loglevel', 'warning',
  '-f', 'gdigrab', '-framerate', "$Fps", '-draw_mouse', '1',
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
  # --cursor: the demo takes the physical mouse for its duration. That is the price of a
  # visible arrow in the capture, and it is why the driver does not do it by default.
  & node (Join-Path $here 'demo.mjs') --port $Port --slow $Slow --match 'demo' --cursor
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
