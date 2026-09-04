# Cut a release: tag, package, publish, attach.
#
#   .\scripts\release.ps1 1.5.3
#   .\scripts\release.ps1 1.5.3 -Notes "one-line summary"
#   .\scripts\release.ps1 1.6.0 -Title "The Color Picker Update"
#   .\scripts\release.ps1 1.5.3 -DryRun
#
# THE VERSION IS BARE SEMVER, WITH NO `v`. Obsidian installs a plugin by matching the
# release tag against the `version` string in manifest.json, and a manifest version must
# be bare semver -- so a `v`-prefixed tag makes the plugin uninstallable. The tags up to
# v1.4.4 keep their prefix because renaming a published tag breaks every link to it; from
# 1.5.0 on there is no prefix. See CHANGELOG.md's versioning section.
#
# One command, because a tag without its package is the failure mode this exists to
# prevent: GitHub's auto-generated source archive ships `.ai-context/` and the dev tooling,
# which is not what someone wanting to *run* this needs. Every tag gets a Release with
# `vault-graph-<version>.zip` attached, so a tag is always a downloadable build.
#
# RUN IT ON `main`. That is where a release is tagged, and the script refuses to run
# anywhere else (-AllowAnyBranch overrides). See github#47 for what the absence of that
# check cost: 1.8.0's tag sits on a develop commit rather than on main's own history.
#
# Requires the `gh` CLI, authenticated. See .ai-context/releasing.md.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $Version,
  [string] $Notes = "",
  # A NAME for the release, shown on the Release page as "<version> - <title>". The version
  # alone was the only option before, which is fine for a patch and thin for a release
  # anyone is meant to remember.
  #
  # Joined with an ASCII hyphen, not an em dash, and that is a decision rather than
  # laziness: the notes reach `gh` as a FILE written as UTF-8, and survive, while the title
  # reaches it as a native command-line ARGUMENT -- which PowerShell 5.1 re-encodes on the
  # way out. This repo has already published mojibake that way once, and a release title
  # cannot be quietly fixed afterwards without the old one having been seen.
  [string] $Title = "",
  [switch] $DryRun,
  [switch] $AllowDirty,
  # Cut the release from wherever HEAD is standing, instead of requiring main. The escape
  # hatch for the branch guard below, shaped like -AllowDirty: there is a legitimate case
  # (a hotfix line that never reaches main, say), and the guard exists to stop the ACCIDENT,
  # not to make the deliberate thing impossible.
  [switch] $AllowAnyBranch
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
  # BARE SEMVER. This said `^v\d+...` until 1.5.3 and would have rejected every version
  # released since 1.5.0 -- it predates the decision to drop the prefix and was never
  # updated, so the last three releases were cut by hand. A `v` gets its own message rather
  # than a format error, because passing one is the obvious mistake and the reason it is
  # wrong is not obvious at all.
  if ($Version -match '^v\d') {
    throw ("Drop the 'v': the tag must be bare semver ($($Version.Substring(1))). Obsidian " +
           "matches the release tag against manifest.json's version, which cannot carry a " +
           "prefix -- a v-tagged release is one nobody can install.")
  }
  if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version must look like 1.5.3 (bare semver -- see CHANGELOG.md's versioning section)"
  }

  # AND IT HAS TO BE THE VERSION THE MANIFEST CLAIMS. Same rule, the other half: Obsidian
  # matches the tag against manifest.json, so a tag that disagrees with it installs nothing.
  # Cheap to check here, invisible until a user reports the plugin will not update.
  $manifest = ConvertFrom-Json ([IO.File]::ReadAllText((Join-Path $repo 'manifest.json'), [Text.Encoding]::UTF8))
  if ($manifest.version -ne $Version) {
    throw "manifest.json says $($manifest.version), you asked for $Version. Bump the manifest first."
  }

  # THE TAG BELONGS ON MAIN (github#47). main is what the Obsidian directory installs from
  # and what a release is tagged on -- CONTRIBUTING states it -- and nothing here enforced
  # it, so the script tagged wherever HEAD happened to be. 1.8.0 is the result: cut before
  # its release PR merged, so its tag sits on a develop commit three commits back from
  # main's own history, the only one of four releases not on main's first-parent line. The
  # three commits between were docs-only and nothing shipped wrong -- but `git log main`
  # does not show where 1.8.0 was cut, and a published tag cannot be moved afterwards
  # without breaking every link to it. So this is a class of mistake that has to be caught
  # BEFORE the tag exists, which is the one moment it is still free to fix.
  $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'main' -and -not $AllowAnyBranch) {
    throw ("On '$branch', not main. main is what the Obsidian directory installs from and " +
           "what a release is tagged on, and a tag cut elsewhere sits off main's history " +
           "permanently. Merge into main first, or pass -AllowAnyBranch if you know why.")
  }

  # ...AND ON THE MAIN EVERYONE ELSE CAN SEE. Being AHEAD of origin/main is the normal case
  # and not checked -- this script pushes HEAD itself a few steps down. Being BEHIND is the
  # problem: it means tagging a main that is missing commits somebody else has already
  # published, and the `git push origin HEAD` below would be rejected anyway, after the tag
  # had been made. Better to say so now than to leave a local tag behind a failed push.
  #
  # Fetch first, because "behind" measured against a stale remote ref is not measured at all.
  #
  # AN EXPLICIT REFSPEC, not `git fetch origin main`. That form opportunistically
  # fast-forwards the LOCAL main as well, which this observed doing while the guard was
  # being written -- a check that silently moves a branch is not a check. This updates the
  # remote-tracking ref and nothing else.
  if ($branch -eq 'main') {
    & git fetch origin 'refs/heads/main:refs/remotes/origin/main' --quiet
    $behind = (& git rev-list --count 'HEAD..origin/main').Trim()
    if ($behind -ne '0') {
      throw ("main is $behind commit(s) behind origin/main. Pull first -- tagging here " +
             "would tag a main that is missing what is already published.")
    }
  }

  # A release has to be reproducible from its tag, and it cannot be if the tree it was
  # built from is not the tree the tag points at.
  $dirty = (& git status --porcelain) | Where-Object { $_ }
  if ($dirty -and -not $AllowDirty) {
    Write-Host ($dirty -join "`n") -ForegroundColor DarkGray
    throw "Working tree is dirty. Commit first, or pass -AllowDirty if you know why."
  }

  # LINT, FIRST OF THE GATES, because it is the cheapest -- about five seconds, no Chrome --
  # and because failing here still costs nothing: no tag, no build, no notes read. The same
  # `npm run lint` the pre-push hook runs on develop and main (github#55): zero findings of any
  # kind, including the five type-aware no-unsafe-* rules the Obsidian directory's review runs
  # on every published version, so a release cannot ship what that board would flag. Sits here
  # rather than beside the invariant
  # suite so it stays out of the way of the release-flow rewrite in github#10.
  Write-Host "`n=== lint ===" -ForegroundColor Cyan
  # THROUGH Invoke-Native, NOT A BARE `&`: on a finding, eslint reports on stderr, and under
  # this script's 'Stop' preference that would end the run before the throw below could say why.
  try { Invoke-Native npm @('run', 'lint', '--silent') }
  catch { throw "lint failed -- not releasing (npm ci first, if this is a fresh clone)" }

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

  # THE README HERO IS A RECORDING, AND IT GOES STALE SILENTLY. Nothing about a build
  # fails when assets/demo.webp shows a page three releases old -- it just keeps
  # advertising the wrong thing to everyone who lands on the repo. Re-recording is part
  # of cutting a release:
  #
  #   .\scripts\record-demo.ps1     then     .\scripts\make-hero.ps1
  #
  # A WARNING, NOT A GATE, and deliberately: only a person can say whether anything
  # visible actually changed, so a hard stop on a docs-only patch would be wrong often
  # enough to get trained away, and then it would not be read at all.
  #
  # IT COMPARES COMMIT DATES, WHICH IS A PROXY AND NOT THE TRUTH. Encoding an old take
  # and committing it today makes a stale hero look fresh -- which is exactly what
  # happened when the WebP landed: the asset was committed 2026-08-23 from the 2026-08-22
  # recording, so this check stayed quiet on a hero that was already behind. Silence here
  # means "no evidence of staleness", not "the hero is current".
  $heroAt = (& git log -1 --format=%ct -- assets/demo.webp) | Select-Object -First 1
  $srcAt  = (& git log -1 --format=%ct -- src) | Select-Object -First 1
  if ($heroAt -and $srcAt -and ([int64]$srcAt -gt [int64]$heroAt)) {
    $heroOn = (& git log -1 --format=%cs -- assets/demo.webp) | Select-Object -First 1
    $srcOn  = (& git log -1 --format=%cs -- src) | Select-Object -First 1
    Write-Host "`n=== hero ===" -ForegroundColor Cyan
    Write-Host ("assets/demo.webp was last committed $heroOn; src/ has changed since ($srcOn). " +
                "Re-record and re-encode, or carry it knowingly.") -ForegroundColor Yellow
  }

  # THE SAME PROXY, PER FEATURE -- see docs/features/_template.md and .ai-context/releasing.md's
  # "Feature clips are different from the hero" section. Unlike the hero, a feature clip is NOT
  # expected to be re-recorded every release, so this never blocks and does not claim to know
  # which act a change actually touched -- it warns against the whole of src/page.js (where every
  # act lives), same as the hero warns against the whole of src/, and leaves "does this actually
  # need re-recording" to whoever reads CHANGELOG.md and decides.
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
  # THE THREE LOOSE FILES ARE WHAT OBSIDIAN ACTUALLY INSTALLS, and they are not optional.
  #
  # Obsidian downloads main.js, manifest.json and styles.css directly from the release
  # assets. It never opens the zip -- the directory's own scanner says so in as many words,
  # "All other files will not be downloaded by Obsidian" -- so a release carrying only the
  # zip is a release nobody can install or update to.
  #
  # 1.6.0 shipped exactly that way and the scan came back with two errors: "the release
  # 1.6.0 specified in manifest.json is missing the main.js file", and the same for
  # manifest.json. The releases before it looked fine only because they were cut BY HAND
  # (see the version-regex note above) and attaching the loose files is what one does by
  # hand. 1.6.0 was this script's first real run, which is when the omission could first
  # show up.
  #
  # The zip stays: it is what someone wanting to RUN the exporter needs, since GitHub's
  # source archive ships .ai-context/ and the dev tooling. The scanner calls it an extra
  # unsupported file, which is a recommendation and is the intended trade.
  $loose = @('main.js', 'manifest.json', 'styles.css') | ForEach-Object { Join-Path $repo $_ }
  $missing = $loose | Where-Object { -not (Test-Path $_) }
  if ($missing) {
    if (-not $tagExists) { & git tag -d $Version | Out-Null }
    throw ("not attaching an uninstallable release -- missing " +
           (($missing | Split-Path -Leaf) -join ', ') + ". Run: node scripts/build-plugin.mjs")
  }

  $releaseTitle = if ($Title) { "$Version - $Title" } else { $Version }
  Invoke-Native $gh (@('release', 'create', $Version) + $loose + @($zip) +
                     @('--title', $releaseTitle, '--notes-file', $notesFile))
  Remove-Item $notesFile -ErrorAction SilentlyContinue

  Write-Host "`nreleased $Version with $(Split-Path $zip -Leaf)" -ForegroundColor Green
  Invoke-Native $gh @('release', 'view', $Version, '--json', 'tagName,assets')
} finally {
  Pop-Location
}
