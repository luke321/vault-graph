
[CmdletBinding()]
param(
  [string] $Url  = "",
  [string] $Out  = "",
  [int]    $Fps  = 30,
  [double] $Slow = 1.0,
  [int]    $Port = 9222,
  [int]    $Width = 1600,
  [int]    $Height = 1000,
  # github#124 -- the size of the CAPTURED REGION, not of the window. The window is sized to
  # whatever produces exactly this, because the two are not the same number (see below).
  [int]    $CaptureWidth = 0,
  [int]    $CaptureHeight = 0,
  [switch] $Square,
  [ValidateSet('', 'primary', 'left', 'right')]
  [string] $Monitor = '',
  [int]    $X = [int]::MinValue,
  [int]    $Y = [int]::MinValue,
  [switch] $KeepChrome,
  [string] $Act  = ""
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here

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

$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) { $ffmpeg = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ffmpeg.exe' }
if (-not (Test-Path $ffmpeg)) {
  throw "ffmpeg not found. Install it with:  winget install Gyan.FFmpeg"
}

if (-not $Url) {
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
  $base = $(if ($Act) { "demo-$Act-$stamp" } else { "demo-$stamp" })
  $Out = Join-Path $repo ($base + ".mp4")
}

Write-Host "url    $Url"
Write-Host "out    $Out"
if ($Act) { Write-Host "act    $Act" }

$profileDir = Join-Path $env:TEMP 'vg-demo-profile'

if (Test-Path $profileDir) {
  Write-Host "clearing the leftover demo profile ($profileDir)..." -ForegroundColor DarkGray
  Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
}

$chrome = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe').'(default)'

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
# github#87
$screenLock = $null
if ($Monitor) { $screenLock = "screen-$Monitor" }
elseif ($X -eq [int]::MinValue) { $screenLock = "screen-primary" }
if ($screenLock) {
  $lockOwner = if ($env:VG_LOCK_OWNER) { $env:VG_LOCK_OWNER } else { "record-demo pid $PID" }
  Write-Host "taking $screenLock (owner: $lockOwner)..." -ForegroundColor DarkGray
  & node (Join-Path $here 'lock.mjs') acquire $screenLock --owner $lockOwner
  if ($LASTEXITCODE -ne 0) {
    throw "$screenLock is BUSY -- another session is using that display. Nothing was recorded."
  }
}

try {

if ($X -ne [int]::MinValue) { $posX = $X }
if ($Y -ne [int]::MinValue) { $posY = $Y }

# github#124 -- `-Square` is the house default for a gallery clip: 1000x1000 of actual pixels.
if ($Square) {
  if (-not $CaptureWidth)  { $CaptureWidth = 1000 }
  if (-not $CaptureHeight) { $CaptureHeight = 1000 }
}
if ($CaptureWidth -or $CaptureHeight) {
  if (-not $CaptureWidth)  { $CaptureWidth = $Width }
  if (-not $CaptureHeight) { $CaptureHeight = $Height }
  # first guess: ask for the window at the capture size, then correct it once it exists
  $Width = $CaptureWidth; $Height = $CaptureHeight
}
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

Start-Sleep -Seconds 2

Add-Type -Namespace Win -Name U -MemberDefinition @'
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(
    IntPtr h, int attr, out RECT r, int size);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(
    IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
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

# github#122 -- RAISE IT, don't just find it. gdigrab copies a REGION OF THE DESKTOP, so whatever
# is drawn over that rectangle is what lands in the take -- and the take still looks plausible.
# Nothing here used to bring Chrome forward: it was positioned and measured, never raised, so an
# editor left open on that monitor was recorded instead of the page. HWND_TOPMOST rather than
# focus alone, because SetForegroundWindow is refused to a background process often enough to be
# useless on its own; topmost is restored to normal in the finally below.
$HWND_TOPMOST = [IntPtr](-1)
$SWP_NOMOVE = 0x0002; $SWP_NOSIZE = 0x0001; $SWP_SHOWWINDOW = 0x0040
$SW_RESTORE = 9
[void][Win.U]::ShowWindow($hwnd, $SW_RESTORE)
[void][Win.U]::SetWindowPos($hwnd, $HWND_TOPMOST, 0, 0, 0, 0, ($SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW))
[void][Win.U]::SetForegroundWindow($hwnd)
$script:raisedHwnd = $hwnd
Start-Sleep -Milliseconds 400
if ([Win.U]::GetForegroundWindow() -ne $hwnd) {
  Write-Warning "Chrome is topmost but did not take focus; the capture region is covered by nothing, so the take is still clean."
}

# github#124 -- THE REQUESTED SIZE IS NOT THE CAPTURED SIZE. --window-size sizes the window;
# the capture region is the window's DWM extended frame bounds clipped to the work area, which
# is smaller by a border the compositor owns -- measured 14x7 on this machine, and not a
# constant across DPI or Windows version. So asking for 1000x1000 gives 986x992. With a capture
# size asked for, measure that trim on the real window and resize by it, then verify.
if ($CaptureWidth -and $CaptureHeight) {
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $probe = New-Object Win.U+RECT
    $okProbe = ([Win.U]::DwmGetWindowAttribute($hwnd, $DWMWA_EXTENDED_FRAME_BOUNDS, [ref] $probe,
      [System.Runtime.InteropServices.Marshal]::SizeOf($probe)) -eq 0)
    if (-not $okProbe) { if (-not [Win.U]::GetWindowRect($hwnd, [ref] $probe)) { break } }

    $screenNow = [System.Windows.Forms.Screen]::FromHandle($hwnd)
    $waNow = $screenNow.WorkingArea
    $cw = [Math]::Min($probe.R, $waNow.X + $waNow.Width) - [Math]::Max($probe.L, $waNow.X)
    $ch = [Math]::Min($probe.B, $waNow.Y + $waNow.Height) - [Math]::Max($probe.T, $waNow.Y)
    $dw = $CaptureWidth - $cw; $dh = $CaptureHeight - $ch
    if ($dw -eq 0 -and $dh -eq 0) {
      Write-Host "capture region is exactly ${CaptureWidth}x${CaptureHeight}" -ForegroundColor DarkGray
      break
    }
    $cur = New-Object Win.U+RECT
    [void][Win.U]::GetWindowRect($hwnd, [ref] $cur)
    $newW = ($cur.R - $cur.L) + $dw; $newH = ($cur.B - $cur.T) + $dh
    Write-Host ("capture {0}x{1}, want {2}x{3} -- resizing the window to {4}x{5} (attempt {6})" -f `
      $cw, $ch, $CaptureWidth, $CaptureHeight, $newW, $newH, $attempt) -ForegroundColor DarkGray
    $SWP_NOMOVE2 = 0x0002; $SWP_NOZORDER = 0x0004
    [void][Win.U]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, $newW, $newH, ($SWP_NOMOVE2 -bor $SWP_NOZORDER))
    Start-Sleep -Milliseconds 350
  }
}

$wr = New-Object Win.U+RECT
if (-not [Win.U]::GetWindowRect($hwnd, [ref] $wr)) { throw "GetWindowRect failed" }

$r = New-Object Win.U+RECT
$dwmOk = ([Win.U]::DwmGetWindowAttribute($hwnd, $DWMWA_EXTENDED_FRAME_BOUNDS, [ref] $r, [System.Runtime.InteropServices.Marshal]::SizeOf($r)) -eq 0)
if (-not $dwmOk) {
  Write-Warning "DwmGetWindowAttribute failed; falling back to GetWindowRect (the capture may include a border sliver -- see issue #26)"
  $r = $wr
}

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
$screen = [System.Windows.Forms.Screen]::FromHandle($hwnd)
$wa = $screen.WorkingArea
$cl = [Math]::Max($r.L, $wa.X); $ct = [Math]::Max($r.T, $wa.Y)
$cr = [Math]::Min($r.R, $wa.X + $wa.Width); $cb = [Math]::Min($r.B, $wa.Y + $wa.Height)

$rx = $cl; $ry = $ct
$rw = ($cr - $cl) - (($cr - $cl) % 2)
$rh = ($cb - $ct) - (($cb - $ct) % 2)
$trimW = ($wr.R - $wr.L) - ($cr - $cl); $trimH = ($wr.B - $wr.T) - ($cb - $ct)
Write-Host "region ${rw}x${rh} at ${rx},${ry} (trimmed ${trimW}x${trimH} of border/off-screen vs GetWindowRect)" -ForegroundColor DarkGray

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

$failed = $null
try {
  $driverArgs = @('--port', $Port, '--slow', $Slow, '--match', 'demo')
  if ($Act) { $driverArgs += @('--act', $Act) }
  & node (Join-Path $here 'demo.mjs') @driverArgs
  if ($LASTEXITCODE -ne 0) { $failed = "driver exited $LASTEXITCODE" }
} catch {
  $failed = $_.Exception.Message
} finally {
  Start-Sleep -Milliseconds 900         # hold on the final state instead of cutting on it
  $droveFor = ((Get-Date) - $recStart).TotalSeconds

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

$ffprobe = Join-Path (Split-Path $ffmpeg) 'ffprobe.exe'
if (Test-Path $ffprobe) {
  $dur = (& $ffprobe -v error -show_entries format=duration -of csv=p=0 $Out)
  $vid = (& $ffprobe -v error -select_streams v:0 -show_entries stream=width,height,nb_frames -of csv=p=0 $Out)
  Write-Host ("  {0}s, {1}" -f [math]::Round([double]$dur, 2), $vid) -ForegroundColor DarkGray
}
}
finally {
  # github#122 -- put it back, so a failed take does not leave Chrome pinned over everything
  if ($script:raisedHwnd) {
    $HWND_NOTOPMOST = [IntPtr](-2)
    try {
      [void][Win.U]::SetWindowPos($script:raisedHwnd, $HWND_NOTOPMOST, 0, 0, 0, 0, (0x0002 -bor 0x0001))
    } catch { }
  }
  # github#87
  if ($screenLock) {
    & node (Join-Path $here 'lock.mjs') release $screenLock --owner $lockOwner
  }
}
