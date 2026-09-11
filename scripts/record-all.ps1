# github#121, github#124 -- re-record EVERY gallery clip and the hero, square.
#
# Re-recording is the default for a release rather than a judgment call: a clip goes stale
# silently, release.ps1 can only compare commit dates, and a wrong call is visible only to a
# reader of the published release. Every act recorded here is a clip that stays current for free.
#
# record-demo.ps1 takes and releases the screen lock itself, so nothing here wraps it.
# Nothing here commits: look at the takes first (cut-release step 8).

[CmdletBinding()]
param(
  [ValidateSet('', 'primary', 'left', 'right')]
  [string] $Monitor = 'right',
  [string] $Scratch = '',
  # skip acts already recorded into $Scratch, so an interrupted run resumes
  [switch] $Resume,
  # record these acts only, by name
  [string[]] $Act = @()
)

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
if (-not $Scratch) { $Scratch = Join-Path $env:TEMP 'vault-graph-takes' }
New-Item -ItemType Directory -Force -Path $Scratch | Out-Null
Set-Location $repo

# act -> published asset basename. `live`'s clip is live-page; every other one matches its act.
$acts = [ordered]@{
  intro = 'intro'; folders = 'folders'; subfolders = 'subfolders'; subfoldercolor = 'subfoldercolor'
  colours = 'colours'; tags = 'tags'; unlinked = 'unlinked'; hiddenbydefault = 'hiddenbydefault'
  collapse = 'collapse'; compactaxis = 'compactaxis'; timeline = 'timeline'; heatmap = 'heatmap'
  note = 'note'; pin = 'pin'; hoptrail = 'hoptrail'; camera = 'camera'; live = 'live-page'
}

$results = @()
$started = Get-Date
function Note($stage, $name, $ok, $detail) {
  $script:results += [PSCustomObject]@{ Stage = $stage; Name = $name; OK = $ok; Detail = $detail }
  Write-Host ("[{0}] {1,-16} {2}" -f $(if ($ok) { 'ok  ' } else { 'FAIL' }), $name, $detail)
}
function Committed($rel) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $b = & git show "HEAD:$rel" 2>$null | Out-String; return $b.Length } catch { return 0 }
  finally { $ErrorActionPreference = $prev }
}

$only = @($Act | Where-Object { $_ })
foreach ($a in $acts.Keys) {
  if ($only.Count -and $only -notcontains $a) { continue }
  $asset = $acts[$a]
  $mp4 = Join-Path $Scratch "demo-$a.mp4"
  $webp = Join-Path $repo "assets\features\$asset.webp"
  if ($Resume -and (Test-Path $mp4)) { Write-Host "`n=== $a -- take exists, reusing ===" -ForegroundColor DarkGray }
  else {
    Write-Host "`n=== $a -> $asset (square) ===" -ForegroundColor Cyan
    & "$repo\scripts\record-demo.ps1" -Act $a -Square -Monitor $Monitor -Out $mp4
  }
  if (-not (Test-Path $mp4)) { Note 'record' $a $false 'no mp4 produced'; continue }
  & "$repo\scripts\make-hero.ps1" -In $mp4 -Out $webp -Width 1000
  if (Test-Path $webp) {
    $mb = [math]::Round((Get-Item $webp).Length / 1MB, 2)
    Note 'clip' $asset $true "$mb MB (was $([math]::Round((Committed "assets/features/$asset.webp") / 1MB, 2)) MB)"
  } else { Note 'clip' $asset $false 'no webp produced' }
}

# mobile is deliberately NOT square: what makes it the phone layout is the narrow window it is
# recorded in, so it keeps its own size and its own 406px encode (docs/features/mobile.md).
if (-not $only.Count -or $only -contains 'mobile') {
  Write-Host "`n=== mobile (420x900 capture, 406px encode) ===" -ForegroundColor Cyan
  $mMp4 = Join-Path $Scratch 'demo-mobile.mp4'
  if (-not ($Resume -and (Test-Path $mMp4))) {
    & "$repo\scripts\record-demo.ps1" -Act mobile -CaptureWidth 420 -CaptureHeight 900 -Monitor $Monitor -Out $mMp4
  }
  if (Test-Path $mMp4) {
    & "$repo\scripts\make-hero.ps1" -In $mMp4 -Out "$repo\assets\features\mobile.webp" -Width 406
    $ok = Test-Path "$repo\assets\features\mobile.webp"
    Note 'clip' 'mobile' $ok $(if ($ok) { "$([math]::Round((Get-Item "$repo\assets\features\mobile.webp").Length / 1MB, 2)) MB, 406px" } else { 'no webp' })
  } else { Note 'record' 'mobile' $false 'no mp4 produced' }
}

# the hero: the whole storyboard, one take, no -Act
if (-not $only.Count) {
  Write-Host "`n=== hero (full storyboard, square) ===" -ForegroundColor Cyan
  $hMp4 = Join-Path $Scratch 'demo-full.mp4'
  if (-not ($Resume -and (Test-Path $hMp4))) {
    & "$repo\scripts\record-demo.ps1" -Square -Monitor $Monitor -Out $hMp4
  }
  if (Test-Path $hMp4) {
    & "$repo\scripts\make-hero.ps1" -In $hMp4 -Width 1000
    $ok = Test-Path "$repo\assets\demo.webp"
    Note 'hero' 'demo.webp' $ok $(if ($ok) { "$([math]::Round((Get-Item "$repo\assets\demo.webp").Length / 1MB, 2)) MB" } else { 'no webp' })
  } else { Note 'record' 'hero' $false 'no mp4 produced' }
}

# countbars has no act of its own: it is a crop of the `folders` take (docs/features/countbars.md).
# Its crop offsets were measured against the 1586x992 landscape layout and DO NOT hold at 1000x1000.
Write-Host "`n=== countbars ===" -ForegroundColor Yellow
Write-Host "  NOT regenerated. It is a crop of the folders take, and its offsets" -ForegroundColor Yellow
Write-Host "  (crop=286:545:8:215) were measured on the old landscape layout." -ForegroundColor Yellow
Write-Host "  Re-measure against a square folders take with a frame grab, then update" -ForegroundColor Yellow
Write-Host "  docs/features/countbars.md and run its ffmpeg line by hand (github#124)." -ForegroundColor Yellow
Note 'clip' 'countbars' $true 'skipped -- crop offsets need re-measuring at 1000x1000'

Write-Host "`n================ SUMMARY ================"
$results | ForEach-Object { "{0,-6} {1,-18} {2,-6} {3}" -f $_.Stage, $_.Name, $(if ($_.OK) { 'ok' } else { 'FAIL' }), $_.Detail }
$bad = @($results | Where-Object { -not $_.OK })
"`n{0} produced, {1} failed, {2:n1} min wall" -f @($results | Where-Object { $_.OK }).Count, $bad.Count, ((Get-Date) - $started).TotalMinutes
"`nNothing is committed. Look at every take before you commit it (cut-release step 8);"
"'git checkout -- assets/' puts the old ones back."
if ($bad.Count) { exit 1 }
