# Regenerate the graph's centre-logo mask and favicon from their two sources.
#
#   logo-mask-source.png  (white art on transparent)  -> logo-mask.png  192px
#   logo-source.png       (the colour neon art)       -> favicon.png     64px
#
# Two sources because the two jobs want opposite things. The centre logo is used as an
# ALPHA MASK and painted with the disc's own wedge colours, so its art must carry no
# colour of its own -- white on transparent, where only the alpha matters. The favicon
# is a standalone 64px icon with no disc behind it to borrow from, so it keeps the
# full-colour art.
#
# Why this is a separate step rather than living in build-graph.mjs: that script is
# deliberately node-builtins-only (no npm install, no network), and node has no image
# decoder, so it can inline a PNG but cannot resize one.
#
# Run it after replacing either source; otherwise never.
#
#   & "C:\git-personalault-graph\scripts\make-logo.ps1"

Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Convert-Logo {
    param([string]$SourceName, [string]$OutName, [int]$Size)

    $src = Join-Path $here (Join-Path '../assets/source' $SourceName)
    if (-not (Test-Path $src)) { Write-Warning "skipping $OutName -- no $SourceName"; return }

    $img = [System.Drawing.Image]::FromFile($src)
    try {
        # Both sources sit in a wide transparent margin (measured: content is ~73% x
        # ~69% of the frame). Cropping to the alpha bounding box first means every
        # pixel kept is artwork rather than nothing, so a smaller output carries the
        # same apparent size. That matters more than usual because the page inlines
        # these as base64, which puts every byte into the HTML at 4/3 size.
        $proxy = 128
        $p = New-Object System.Drawing.Bitmap($img, $proxy, $proxy)
        $minX = $proxy; $minY = $proxy; $maxX = -1; $maxY = -1
        for ($y = 0; $y -lt $proxy; $y++) {
            for ($x = 0; $x -lt $proxy; $x++) {
                if ($p.GetPixel($x, $y).A -gt 8) {
                    if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
                    if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
                }
            }
        }
        $p.Dispose()
        if ($maxX -lt 0) { throw "$SourceName is fully transparent" }

        $k = $img.Width / [double]$proxy
        $cx = ($minX + $maxX + 1) / 2.0 * $k
        $cy = ($minY + $maxY + 1) / 2.0 * $k
        # Square crop, so the output is square and the art stays centred -- the logo is
        # positioned by its centre on the disc's centre, so an off-centre crop shows up
        # as the logo sitting slightly wrong in the hub hole.
        $side = [Math]::Max(($maxX - $minX + 1), ($maxY - $minY + 1)) * $k * 1.03
        $side = [Math]::Min($side, [Math]::Min($img.Width, $img.Height))
        $x0 = [int][Math]::Round([Math]::Max(0, [Math]::Min($cx - $side / 2, $img.Width  - $side)))
        $y0 = [int][Math]::Round([Math]::Max(0, [Math]::Min($cy - $side / 2, $img.Height - $side)))
        $s  = [int][Math]::Round($side)
        $crop = New-Object System.Drawing.Rectangle($x0, $y0, $s, $s)

        $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CompositingMode    = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)), $crop,
                     [System.Drawing.GraphicsUnit]::Pixel)
        $g.Dispose()
        $out = Join-Path $here (Join-Path '../assets' $OutName)
        $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        "{0,-16} {1}x{1}  {2} KB   (cropped {3}x{3} at {4},{5} of {6})" -f `
            $OutName, $Size, [math]::Round((Get-Item $out).Length / 1KB, 1), $s, $x0, $y0, $img.Width
    }
    finally { $img.Dispose() }
}

# 192 is chosen against a measurement, not by eye: the hub hole is 180px across on a
# 1016px stage, and the logo draws at 50% of it, so ~113px on screen and ~226px at 2x
# DPR. These are base64'd into the HTML, so bigger costs real page weight.
Convert-Logo -SourceName 'logo-mask-source.png' -OutName 'logo-mask.png' -Size 192
Convert-Logo -SourceName 'logo-source.png'      -OutName 'favicon.png'   -Size 64
