# Turn a recorded take into the README's hero animation.
#
#   .\scripts\make-hero.ps1 -In .\demo-2026-08-22-174500.mp4
#   .\scripts\make-hero.ps1 -In take.mp4 -Out assets\demo.webp -Width 700 -Fps 30
#   .\scripts\make-hero.ps1 -In take.mp4 -Format gif          # 15fps, two-pass palette
#
# This was an ad-hoc ffmpeg incantation typed twice, which is once more than a step
# belongs in someone's shell history: the README's hero image is a release artefact and
# has to be reproducible from a take.
#
# WHY WEBP, NOT GIF. Measured on the same 34s take at 700px: GIF at 15fps is 9.2 MB,
# animated WebP at 30fps is 3.08 MB and at 15fps is 1.81 MB. WebP is also full colour, so
# the entire reason the GIF path is two passes -- 256 colours, a palette that bands badly
# if picked from one frame, and error-diffusion dither that crawls between frames and
# inflates the file -- simply does not apply. Double the frame rate for a third of the
# bytes and no dithering at all.
#
# WHY NOT MP4. GitHub's markdown sanitizer strips `<video>` outright. Measured through
# api.github.com/markdown with repo context: a relative src, a raw.githubusercontent src, a
# github.com/<owner>/<repo>/raw src and a user-attachments src all render as an empty
# `<p>`, and an `<img>` fallback nested inside the tag is dropped with it. The rendered
# page's CSP agrees -- `media-src` lists github.com and the user-images hosts, not
# raw.githubusercontent. Only a file uploaded through a comment box plays, and that asset
# lives outside the repo and cannot be regenerated from a take, which is the one thing this
# script exists to guarantee. WebP is an `<img>`, so it survives GitHub *and* Obsidian's
# community plugin browser, which fetches the README from raw and sanitizes it with
# DOMPurify (whose default allowlist keeps `img` and, as it happens, `video` -- so a video
# would play there and nowhere else).
#
# WHAT THE SIZE ACTUALLY COSTS. Not the render: GitHub's much-quoted 10 MB is the limit on
# dragging a file into a comment box, and camo's 5 MB applies only to externally hosted
# images -- a relative path in a README renders as /<owner>/<repo>/raw/<branch>/<path> and
# is not proxied. The cost is the clone. Six demo.gif revisions came to 49.9 MB of a 61 MB
# .git, so 82% of a clone was obsolete frames, and every re-record added ~9 MB for good.
#
# WHY 30 FPS. The disc re-packing is the whole point of the clip and it is the part a low
# frame rate flattens; 15 read as clunky on the cascade. 30 costs 1.27 MB over 15 on the
# same take, which is a bargain against what the GIF was charging.
#
# QUALITY. Measured on that take at 700px/30fps: q60 is 2.64 MB, q70 is 3.08 MB, q80 is
# 4.23 MB. 70 is the default because 60 softens the thin curved links. `compression_level`
# stays at 4: on a gif-sourced encode, level 6 saved 6% and took 96 seconds against 4.
#
# ENCODE FROM THE MP4, NEVER FROM THE GIF. Transcoding assets\demo.gif to WebP at q70 gave
# 3.43 MB at a *lower* frame rate, because the GIF's baked-in bayer dither is noise to
# every later encoder. The take is the source.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $In,
  [string] $Out = "",
  [int] $Width = 700,
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

# stderr, not failure: ffmpeg reports progress there, and PowerShell 5.1 would otherwise
# turn a successful encode into a NativeCommandError. Exit codes decide.
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  if ($Format -eq 'webp') {
    & $ffmpeg -y -loglevel error -i $In -vf $filters `
      -c:v libwebp_anim -lossless 0 -quality $Quality -compression_level 4 -loop 0 -an $Out
    if ($LASTEXITCODE -ne 0) { throw "webp encode failed ($LASTEXITCODE)" }
  }
  else {
    # Two passes, because a single-pass GIF picks its 256 colours from the first frame and
    # the disc's palette then bands badly -- palettegen reads the WHOLE take first.
    $palette = Join-Path $env:TEMP 'vg-palette.png'
    & $ffmpeg -y -loglevel error -i $In -vf "$filters,palettegen=stats_mode=diff" $palette
    if ($LASTEXITCODE -ne 0) { throw "palettegen failed ($LASTEXITCODE)" }
    # bayer dithering: the disc is large flat areas of near-identical colour, where
    # error-diffusion dithering crawls between frames and inflates the file.
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
