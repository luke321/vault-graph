
[CmdletBinding()]
param(
  [string] $Url  = "",
  [string] $Out  = "",
  [int]    $Fps  = 30,
  [double] $Slow = 1.0,
  [int]    $Port = 9222,
  [int]    $Width = 1600,
  [int]    $Height = 1000,
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
if ($X -ne [int]::MinValue) { $posX = $X }
if ($Y -ne [int]::MinValue) { $posY = $Y }
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
