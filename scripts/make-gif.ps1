# Turn a recorded take into the README's GIF.
#
#   .\scripts\make-gif.ps1 -In .\demo-2026-08-22-174500.mp4
#   .\scripts\make-gif.ps1 -In take.mp4 -Out assets\demo.gif -Width 760 -Fps 11
#
# This was an ad-hoc ffmpeg incantation typed twice, which is once more than a step
# belongs in someone's shell history: the README's hero image is a release artefact and
# has to be reproducible from a take. Two passes, because a single-pass GIF picks its 256
# colours from the first frame and the disc's palette then bands badly -- palettegen reads
# the WHOLE take first.
#
# GitHub renders the README GIF inline, so width and frame rate are a file-size decision
# rather than a quality one. Measured on the same 34-second take: 760px/11fps is 6.6 MB,
# 700px/10fps is 5.3 MB, 640px/10fps is 4.6 MB. 700/10 is the default because GitHub
# renders the README column narrower than 760 anyway, so the extra megabyte buys nothing
# a reader can see.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $In,
  [string] $Out = "",
  [int] $Width = 700,
  [int] $Fps = 10
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
if (-not $Out) { $Out = Join-Path $repo 'assets\demo.gif' }
if (-not (Test-Path $In)) { throw "no such take: $In" }

$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) { $ffmpeg = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ffmpeg.exe' }
if (-not (Test-Path $ffmpeg)) { throw "ffmpeg not found. winget install Gyan.FFmpeg" }

$palette = Join-Path $env:TEMP 'vg-palette.png'
$filters = "fps=$Fps,scale=$($Width):-1:flags=lanczos"

# stderr, not failure: ffmpeg reports progress there, and PowerShell 5.1 would otherwise
# turn a successful encode into a NativeCommandError. Exit codes decide.
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  & $ffmpeg -y -loglevel error -i $In -vf "$filters,palettegen=stats_mode=diff" $palette
  if ($LASTEXITCODE -ne 0) { throw "palettegen failed ($LASTEXITCODE)" }
  # bayer dithering: the disc is large flat areas of near-identical colour, where
  # error-diffusion dithering crawls between frames and inflates the file.
  & $ffmpeg -y -loglevel error -i $In -i $palette -lavfi `
    "$filters[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" $Out
  if ($LASTEXITCODE -ne 0) { throw "paletteuse failed ($LASTEXITCODE)" }
} finally { $ErrorActionPreference = $prev }

Remove-Item $palette -ErrorAction SilentlyContinue
$mb = [math]::Round((Get-Item $Out).Length / 1MB, 2)
Write-Host "wrote $Out ($mb MB, ${Width}px, ${Fps}fps)" -ForegroundColor Green
