
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $In,
  [string] $Out = "",
  [int] $Width = 1200,
  [int] $Fps = 0,
  [ValidateSet('webp', 'gif')][string] $Format = 'webp',
  [int] $Quality = 70
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
if (-not $Fps) { $Fps = if ($Format -eq 'gif') { 15 } else { 30 } }
if (-not $Out) { $Out = Join-Path $repo "assets\demo.$Format" }
if (-not (Test-Path $In)) { throw "no such take: $In" }
if ([IO.Path]::GetExtension($In) -eq '.gif') {
  Write-Warning "encoding from a GIF: its dither is noise to this encoder, and the result will be bigger than one made from the mp4 take"
}

$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) { $ffmpeg = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ffmpeg.exe' }
if (-not (Test-Path $ffmpeg)) { throw "ffmpeg not found. winget install Gyan.FFmpeg" }

$filters = "fps=$Fps,scale=$($Width):-1:flags=lanczos"

$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  if ($Format -eq 'webp') {
    & $ffmpeg -y -loglevel error -i $In -vf $filters `
      -c:v libwebp_anim -lossless 0 -quality $Quality -compression_level 4 -loop 0 -an $Out
    if ($LASTEXITCODE -ne 0) { throw "webp encode failed ($LASTEXITCODE)" }
  }
  else {
    $palette = Join-Path $env:TEMP 'vg-palette.png'
    & $ffmpeg -y -loglevel error -i $In -vf "$filters,palettegen=stats_mode=diff" $palette
    if ($LASTEXITCODE -ne 0) { throw "palettegen failed ($LASTEXITCODE)" }
    & $ffmpeg -y -loglevel error -i $In -i $palette -lavfi `
      "$filters[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" $Out
    if ($LASTEXITCODE -ne 0) { throw "paletteuse failed ($LASTEXITCODE)" }
    Remove-Item $palette -ErrorAction SilentlyContinue
  }
}
finally { $ErrorActionPreference = $prev }

$mb = [math]::Round((Get-Item $Out).Length / 1MB, 2)
$q = if ($Format -eq 'webp') { ", q$Quality" } else { "" }
Write-Host "wrote $Out ($mb MB, ${Width}px, ${Fps}fps$q)" -ForegroundColor Green
