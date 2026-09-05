# github#47

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $Version,
  [string] $Notes = "",
  [string] $Title = "",
  [switch] $DryRun,
  [switch] $AllowDirty,
  [switch] $AllowAnyBranch
)

$ErrorActionPreference = 'Stop'

function Invoke-Native {
  param([Parameter(Mandatory)][string] $Exe, [Parameter(Mandatory)][string[]] $Arguments)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Exe @Arguments } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') exited $LASTEXITCODE" }
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
Push-Location $repo
try {
  if ($Version -match '^v\d') {
    throw ("Drop the 'v': the tag must be bare semver ($($Version.Substring(1))). Obsidian " +
           "matches the release tag against manifest.json's version, which cannot carry a " +
           "prefix -- a v-tagged release is one nobody can install.")
  }
  if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version must look like 1.5.3 (bare semver -- see CHANGELOG.md's versioning section)"
  }

  $manifest = ConvertFrom-Json ([IO.File]::ReadAllText((Join-Path $repo 'manifest.json'), [Text.Encoding]::UTF8))
  if ($manifest.version -ne $Version) {
    throw "manifest.json says $($manifest.version), you asked for $Version. Bump the manifest first."
  }

  # github#47
  $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'main' -and -not $AllowAnyBranch) {
    throw ("On '$branch', not main. main is what the Obsidian directory installs from and " +
           "what a release is tagged on, and a tag cut elsewhere sits off main's history " +
           "permanently. Merge into main first, or pass -AllowAnyBranch if you know why.")
  }

  if ($branch -eq 'main') {
    & git fetch origin 'refs/heads/main:refs/remotes/origin/main' --quiet
    $behind = (& git rev-list --count 'HEAD..origin/main').Trim()
    if ($behind -ne '0') {
      throw ("main is $behind commit(s) behind origin/main. Pull first -- tagging here " +
             "would tag a main that is missing what is already published.")
    }
  }

  $dirty = (& git status --porcelain) | Where-Object { $_ }
  if ($dirty -and -not $AllowDirty) {
    Write-Host ($dirty -join "`n") -ForegroundColor DarkGray
    throw "Working tree is dirty. Commit first, or pass -AllowDirty if you know why."
  }

  # github#55
  # github#10
  Write-Host "`n=== lint ===" -ForegroundColor Cyan
  try { Invoke-Native npm @('run', 'lint', '--silent') }
  catch { throw "lint failed -- not releasing (npm ci first, if this is a fresh clone)" }

  $tagExists = [bool] (& git tag -l $Version)
  if ($tagExists) {
    $at = (& git rev-parse ($Version + '^{commit}')).Trim()
    $head = (& git rev-parse HEAD).Trim()
    if ($at -ne $head) { throw "$Version already exists and points at $($at.Substring(0,7)), not HEAD. Bump, or delete the tag." }
    Write-Host "$Version already tags HEAD -- resuming." -ForegroundColor Yellow
  }

  $changelog = [IO.File]::ReadAllText((Join-Path $repo 'CHANGELOG.md'), [Text.Encoding]::UTF8)
  if ($changelog -notmatch [regex]::Escape("## $Version")) {
    throw "CHANGELOG.md has no '## $Version' section. Write the release notes first."
  }
  $section = [regex]::Match($changelog, "(?s)##\s+" + [regex]::Escape($Version) + ".*?(?=\r?\n## |\z)").Value.Trim()

  Write-Host "`n=== release notes ===" -ForegroundColor Cyan
  Write-Host $section -ForegroundColor DarkGray

  $heroAt = (& git log -1 --format=%ct -- assets/demo.webp) | Select-Object -First 1
  $srcAt  = (& git log -1 --format=%ct -- src) | Select-Object -First 1
  if ($heroAt -and $srcAt -and ([int64]$srcAt -gt [int64]$heroAt)) {
    $heroOn = (& git log -1 --format=%cs -- assets/demo.webp) | Select-Object -First 1
    $srcOn  = (& git log -1 --format=%cs -- src) | Select-Object -First 1
    Write-Host "`n=== hero ===" -ForegroundColor Cyan
    Write-Host ("assets/demo.webp was last committed $heroOn; src/ has changed since ($srcOn). " +
                "Re-record and re-encode, or carry it knowingly.") -ForegroundColor Yellow
  }

  $pageAt = (& git log -1 --format=%ct -- src/page.js) | Select-Object -First 1
  $pageOn = (& git log -1 --format=%cs -- src/page.js) | Select-Object -First 1
  $featureDocs = Get-ChildItem (Join-Path $repo 'docs/features') -Filter '*.md' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne '_template.md' }
  $staleFeatures = @()
  foreach ($doc in $featureDocs) {
    $name = $doc.BaseName
    $clip = "assets/features/$name.webp"
    $clipAt = (& git log -1 --format=%ct -- $clip) | Select-Object -First 1
    if (-not $clipAt) { continue }   # no clip recorded yet -- not staleness, just not done yet
    if ($pageAt -and ([int64]$pageAt -gt [int64]$clipAt)) {
      $clipOn = (& git log -1 --format=%cs -- $clip) | Select-Object -First 1
      $staleFeatures += "  $name`: clip committed $clipOn, src/page.js changed since ($pageOn)"
    }
  }
  if ($staleFeatures.Count) {
    Write-Host "`n=== features ===" -ForegroundColor Cyan
    Write-Host "src/page.js has changed since these feature clips were last recorded:" -ForegroundColor Yellow
    $staleFeatures | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    Write-Host ("Re-record whichever ones this release actually changed visibly -- see " +
                "`".ai-context/releasing.md`". Not every one; that call is yours.") -ForegroundColor Yellow
  }

  Write-Host "`n=== invariants ===" -ForegroundColor Cyan
  & node (Join-Path $here 'smoke.mjs')
  if ($LASTEXITCODE -ne 0) { throw "the invariant suite failed -- not releasing" }

  if ($DryRun) { Write-Host "`n-DryRun: stopping before tag, package and publish." -ForegroundColor Yellow; return }

  Write-Host "`n=== tag ===" -ForegroundColor Cyan
  $msgFile = Join-Path $env:TEMP "vg-tag-$Version.txt"
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($msgFile, $section, $utf8)
  if (-not $tagExists) { Invoke-Native git @('tag', '-a', $Version, '-F', $msgFile) }
  Remove-Item $msgFile -ErrorAction SilentlyContinue

  Write-Host "`n=== publish ===" -ForegroundColor Cyan
  $gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
  if (-not $gh) { $gh = "$env:ProgramFiles\GitHub CLI\gh.exe" }
  if (-not (Test-Path $gh)) { throw "gh CLI not found -- install it, or push the tag and attach main.js, manifest.json and styles.css by hand" }

  Invoke-Native git @('push', 'origin', 'HEAD')
  Invoke-Native git @('push', 'origin', $Version)

  $notesFile = Join-Path $env:TEMP "vg-notes-$Version.md"
  $body = if ($Notes) { "$Notes`n`n$section" } else { $section }
  [IO.File]::WriteAllText($notesFile, $body, $utf8)
  $loose = @('main.js', 'manifest.json', 'styles.css') | ForEach-Object { Join-Path $repo $_ }
  $missing = $loose | Where-Object { -not (Test-Path $_) }
  if ($missing) {
    if (-not $tagExists) { & git tag -d $Version | Out-Null }
    throw ("not attaching an uninstallable release -- missing " +
           (($missing | Split-Path -Leaf) -join ', ') + ". Run: node scripts/build-plugin.mjs")
  }

  $releaseTitle = if ($Title) { "$Version - $Title" } else { $Version }
  Invoke-Native $gh (@('release', 'create', $Version) + $loose +
                     @('--title', $releaseTitle, '--notes-file', $notesFile))
  Remove-Item $notesFile -ErrorAction SilentlyContinue

  Write-Host "`nreleased $Version with main.js, manifest.json and styles.css" -ForegroundColor Green
  Invoke-Native $gh @('release', 'view', $Version, '--json', 'tagName,assets')
} finally {
  Pop-Location
}
