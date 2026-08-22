# Cut a release: tag, package, publish, attach.
#
#   .\scripts\release.ps1 v1.4.0
#   .\scripts\release.ps1 v1.4.1 -Notes "one-line summary"
#   .\scripts\release.ps1 v1.4.0 -DryRun
#
# One command, because a tag without its package is the failure mode this exists to
# prevent: GitHub's auto-generated source archive ships `.ai-context/` and the dev tooling,
# which is not what someone wanting to *run* this needs. Every tag gets a Release with
# `vault-graph-<version>.zip` attached, so a tag is always a downloadable build.
#
# Requires the `gh` CLI, authenticated. See .ai-context/releasing.md.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $Version,
  [string] $Notes = "",
  [switch] $DryRun,
  [switch] $AllowDirty
)

$ErrorActionPreference = 'Stop'

# PowerShell 5.1 turns ANYTHING a native exe writes to stderr into a NativeCommandError,
# and with $ErrorActionPreference = 'Stop' that terminates the script. `git push` reports
# progress on stderr, so a SUCCESSFUL push killed this script half-way through its first
# real run -- after the push had landed, before the release was created. Native calls go
# through here: stderr stays visible, and the exit code is what decides.
# Arguments as an explicit ARRAY, not ValueFromRemainingArguments: a parameter cannot be
# called $Args -- that is an automatic variable -- and binding silently broke, so
# `Invoke-Native git tag -a ...` came back as "no positional parameter accepts 'tag'".
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
  if ($Version -notmatch '^v\d+\.\d+\.\d+$') {
    throw "Version must look like v1.4.0 (semver, from v1.1.0 on -- see CHANGELOG.md)"
  }

  # A release has to be reproducible from its tag, and it cannot be if the tree it was
  # built from is not the tree the tag points at.
  $dirty = (& git status --porcelain) | Where-Object { $_ }
  if ($dirty -and -not $AllowDirty) {
    Write-Host ($dirty -join "`n") -ForegroundColor DarkGray
    throw "Working tree is dirty. Commit first, or pass -AllowDirty if you know why."
  }

  # A tag already ON THIS COMMIT is a resumed run, not a mistake -- the first version of
  # this script died between pushing and publishing, and refusing to continue would have
  # meant deleting a good tag to re-make it identically. A tag pointing anywhere else is
  # still a hard stop.
  $tagExists = [bool] (& git tag -l $Version)
  if ($tagExists) {
    $at = (& git rev-parse ($Version + '^{commit}')).Trim()
    $head = (& git rev-parse HEAD).Trim()
    if ($at -ne $head) { throw "$Version already exists and points at $($at.Substring(0,7)), not HEAD. Bump, or delete the tag." }
    Write-Host "$Version already tags HEAD -- resuming." -ForegroundColor Yellow
  }

  # The CHANGELOG is the release notes. A version with no section is a version whose
  # changes nobody wrote down, which is worth stopping for.
  # ReadAllText with an EXPLICIT encoding, not Get-Content: PowerShell 5.1 decodes a
  # BOM-less UTF-8 file as cp1252, so an em-dash arrives as three mojibake characters and
  # a later -Encoding utf8 write persists them -- into the tag message and the published
  # release notes, where they are permanent.
  $changelog = [IO.File]::ReadAllText((Join-Path $repo 'CHANGELOG.md'), [Text.Encoding]::UTF8)
  if ($changelog -notmatch [regex]::Escape("## $Version")) {
    throw "CHANGELOG.md has no '## $Version' section. Write the release notes first."
  }
  # Everything from this version's heading to the next one.
  $section = [regex]::Match($changelog, "(?s)##\s+" + [regex]::Escape($Version) + ".*?(?=\r?\n## |\z)").Value.Trim()

  Write-Host "`n=== release notes ===" -ForegroundColor Cyan
  Write-Host $section -ForegroundColor DarkGray

  Write-Host "`n=== invariants ===" -ForegroundColor Cyan
  & node (Join-Path $here 'smoke.mjs')
  if ($LASTEXITCODE -ne 0) { throw "the invariant suite failed -- not releasing" }

  if ($DryRun) { Write-Host "`n-DryRun: stopping before tag, package and publish." -ForegroundColor Yellow; return }

  Write-Host "`n=== tag ===" -ForegroundColor Cyan
  # Annotated, with the notes as the message, so `git show <tag>` tells the same story as
  # the Release page.
  $msgFile = Join-Path $env:TEMP "vg-tag-$Version.txt"
  # No BOM -- git and gh both read these as bytes, and a BOM ends up in the tag message.
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($msgFile, $section, $utf8)
  if (-not $tagExists) { Invoke-Native git @('tag', '-a', $Version, '-F', $msgFile) }
  Remove-Item $msgFile -ErrorAction SilentlyContinue

  Write-Host "`n=== package ===" -ForegroundColor Cyan
  & node (Join-Path $here 'make-package.mjs') $Version
  if ($LASTEXITCODE -ne 0) {
    if (-not $tagExists) { & git tag -d $Version | Out-Null }
    throw "packaging failed"
  }
  $zip = Join-Path $repo "dist\vault-graph-$Version.zip"
  if (-not (Test-Path $zip)) {
    if (-not $tagExists) { & git tag -d $Version | Out-Null }
    throw "no package at $zip"
  }

  Write-Host "`n=== publish ===" -ForegroundColor Cyan
  $gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
  if (-not $gh) { $gh = "$env:ProgramFiles\GitHub CLI\gh.exe" }
  if (-not (Test-Path $gh)) { throw "gh CLI not found -- install it, or push the tag and attach $zip by hand" }

  Invoke-Native git @('push', 'origin', 'HEAD')
  Invoke-Native git @('push', 'origin', $Version)

  $notesFile = Join-Path $env:TEMP "vg-notes-$Version.md"
  $body = if ($Notes) { "$Notes`n`n$section" } else { $section }
  [IO.File]::WriteAllText($notesFile, $body, $utf8)
  Invoke-Native $gh @('release', 'create', $Version, $zip, '--title', $Version, '--notes-file', $notesFile)
  Remove-Item $notesFile -ErrorAction SilentlyContinue

  Write-Host "`nreleased $Version with $(Split-Path $zip -Leaf)" -ForegroundColor Green
  Invoke-Native $gh @('release', 'view', $Version, '--json', 'tagName,assets')
} finally {
  Pop-Location
}
