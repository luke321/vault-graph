
Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Convert-Logo {
    param([string]$SourceName, [string]$OutName, [int]$Size)

    $src = Join-Path $here (Join-Path '../assets/source' $SourceName)
    if (-not (Test-Path $src)) { Write-Warning "skipping $OutName -- no $SourceName"; return }

    $img = [System.Drawing.Image]::FromFile($src)
    try {
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

Convert-Logo -SourceName 'logo-mask-source.png' -OutName 'logo-mask.png' -Size 192
Convert-Logo -SourceName 'logo-source.png'      -OutName 'favicon.png'   -Size 64
