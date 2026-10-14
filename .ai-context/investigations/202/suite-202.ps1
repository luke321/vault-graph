# github#202 -- the sizing and serpentine checks against one variant, src/page.js restored after.
#   .ai-context\investigations\202\suite-202.ps1 -Variant base|curve|edge|share [-Param n] -Log <file>
param([string]$Variant = 'base', [string]$Param = '', [Parameter(Mandatory)][string]$Log)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here '..\..\..')
$only = @(
  'the serpentine survives', 'the resting disc is on the lattice', 'layout matches its golden snapshot',
  'a dot never outgrows its resting size', 'a walking dot is held under its two resting sizes',
  'the last frame of a cascade is the resting layout', 'the same size against the lattice in a bigger window',
  'a sub-pixel dot can still be hovered', "the hub's dots shrink as it fills",
  'still takes its dots'' rest from the unfiltered disc', 'a rest taken at one stage size still bounds the dots',
  'the hub stays the same share of the disc'
)
$args2 = @()
foreach ($o in $only) { $args2 += '--only'; $args2 += $o }
Push-Location $root
try {
  if ($Variant -ne 'base') {
    $a = @('.ai-context/investigations/202/variants-202.mjs', '--apply', $Variant)
    if ($Param) { $a += '--param'; $a += $Param }
    node @a
  }
  node scripts/smoke.mjs @args2 | Out-File -FilePath $Log -Encoding utf8
  "exit $LASTEXITCODE" | Out-File -FilePath $Log -Encoding utf8 -Append
} finally {
  if ($Variant -ne 'base') { node .ai-context/investigations/202/variants-202.mjs --restore }
  git status --short src
  Pop-Location
}
