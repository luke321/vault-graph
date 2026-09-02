# Cut a release: check, gate, tag, push. The publishing happens in CI, not here.
#
#   .\scripts\release.ps1 1.5.3
#   .\scripts\release.ps1 1.5.3 -DryRun
#
# THIS SCRIPT USED TO PUBLISH AND DOES NOT ANY MORE (github#10). It built the package and
# ran `gh release create` itself, which worked -- and produced release assets that could
# never be attested. An artifact attestation is signed through Sigstore with a workflow's
# OIDC token, and `id-token: write` is a permission only an Actions run can hold, so no
# script on anybody's laptop can mint one. Attesting main.js therefore meant moving the
# build and the publish into .github/workflows/release.yml, which is now the publisher.
#
# WHAT IS LEFT HERE IS THE PART ONLY A PERSON CAN DO -- most of the judgment and none of
# the uploading: decide the version, check that the manifest and the CHANGELOG agree with
# it, refuse a dirty tree, read the hero and feature-clip warnings, run the invariant
# suite, then write the tag and push it. THE TAG PUSH IS THE TRIGGER. Everything after it
# (build, provenance attestation, package, release, assets) belongs to the workflow.
#
# WHY THE SUITE STAYED LOCAL. It drives a real Chrome against two vaults, one of which is
# a structural mirror of a private vault that cannot exist on a runner. So the gate is
# here and CI trusts the tag: this script will not tag a red suite, and .githooks/pre-push
# runs it again on the push of main that carries the tagged commit. CI runs the three
# static checks instead (scope, network, PII), which need neither a vault nor a browser.
#
# THE VERSION IS BARE SEMVER, WITH NO `v`. Obsidian installs a plugin by matching the
# release tag against the `version` string in manifest.json, and a manifest version must
# be bare semver -- so a `v`-prefixed tag makes the plugin uninstallable. The tags up to
# v1.4.4 keep their prefix because renaming a published tag breaks every link to it; from
# 1.5.0 on there is no prefix. See CHANGELOG.md's versioning section.
#
# EVERY TAG STILL GETS A RELEASE WITH `vault-graph-<version>.zip` ATTACHED -- that has not
# changed, only who attaches it. GitHub's auto-generated source archive ships
# `.ai-context/` and the dev tooling, which is not what someone wanting to *run* this
# needs, so a tag without its package is the original failure mode this script existed to
# prevent. The workflow now builds and attaches it, which means the guarantee is only as
# good as the tag filter and the guards in that file. Read them before changing this one.
#
# RUN IT ON `main`. That is where a release is tagged, and the script refuses to run
# anywhere else (-AllowAnyBranch overrides). See github#47 for what the absence of that
# check cost: 1.8.0's tag sits on a develop commit rather than on main's own history. The
# workflow re-checks the same thing against origin/main, because a tag can also be pushed
# by hand and then none of the guards below ever ran.
#
# The workflow's tag filter is `[0-9]+.[0-9]+.[0-9]+`, matching the bare-semver rule
# above, so an accidental `v` tag does not even reach the publisher. Note what that means
# if -AllowAnyBranch is ever used for a hotfix line: the tag will be pushed, the workflow
# will run, and its main-ancestry guard will fail -- deliberately. Publish that one by
# hand, and know that a hand-published asset carries no attestation.
#
# The `gh` CLI is no longer needed: nothing here talks to the API. See
# .ai-context/releasing.md, which is the authority on the whole two-halves flow.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $Version,
  # -Notes AND -Title ARE GONE, and their jobs did not disappear -- they moved.
  #
  # -Notes prepended a one-line summary to the release body. The body is now drafted by
  # the workflow from the `## <version>` CHANGELOG section -- the same text this script
  # writes into the tag message, so `git show <tag>` and the Release page still agree --
  # and then rewritten by hand: a highlight reel on top, the CHANGELOG section verbatim
  # underneath. See .ai-context/releasing.md for that shape. A one-liner passed at tag
  # time has nowhere useful to land in it.
  #
  # -Title named the release ("1.8.0 - The Hub"). The workflow reads that name out of the
  # CHANGELOG heading instead -- `## 1.9.0 -- "Belonging" -- 2026-09-02` -- so the title
  # and the changelog section it sits above can no longer disagree, which a hand-typed
  # argument allowed. The ASCII-hyphen decision survives in the workflow: the original
  # reason was that PowerShell 5.1 re-encodes a native command-line argument on the way
  # out and this repo published mojibake that way once, and although a UTF-8 runner has no
  # such problem, every published title uses a hyphen and a title cannot be quietly fixed
  # after it has been seen.
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

  # THE PLUGIN BUILD IS A PRE-FLIGHT, not an artifact any more. Nothing local consumes
  # main.js at release time -- the workflow builds its own copy from the tagged commit and
  # attests that -- but a build that fails in CI leaves a TAG WITH NO RELEASE, and a
  # published tag cannot be re-cut. Ten seconds here buys the one failure mode the new
  # split introduces. Both outputs are gitignored, so this cannot dirty the tree.
  Write-Host "`n=== build (pre-flight) ===" -ForegroundColor Cyan
  & node (Join-Path $here 'build-plugin.mjs')
  if ($LASTEXITCODE -ne 0) {
    throw ("the plugin build failed -- the workflow would fail the same way and leave a tag " +
           "with no release. Fix it first (npm ci, if this is a fresh clone).")
  }

  Write-Host "`n=== invariants ===" -ForegroundColor Cyan
  & node (Join-Path $here 'smoke.mjs')
  if ($LASTEXITCODE -ne 0) { throw "the invariant suite failed -- not releasing" }

  if ($DryRun) { Write-Host "`n-DryRun: stopping before the tag and the push." -ForegroundColor Yellow; return }

  Write-Host "`n=== tag ===" -ForegroundColor Cyan
  # Annotated, with the notes as the message, so `git show <tag>` tells the same story as
  # the Release page.
  $msgFile = Join-Path $env:TEMP "vg-tag-$Version.txt"
  # No BOM -- git and gh both read these as bytes, and a BOM ends up in the tag message.
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($msgFile, $section, $utf8)
  if (-not $tagExists) { Invoke-Native git @('tag', '-a', $Version, '-F', $msgFile) }
  Remove-Item $msgFile -ErrorAction SilentlyContinue

  # THE BRANCH FIRST, THEN THE TAG, and the order is load-bearing in a way it was not when
  # this script published on its own. The workflow refuses to publish a tag that is not in
  # origin/main's history (github#47, server-side this time), and it starts the moment the
  # tag lands -- so a tag pushed before its commit is on origin/main can race its own
  # guard. Pushing HEAD first closes the window. If it fails anyway, main has caught up by
  # then and re-running the workflow is the whole fix.
  Write-Host "`n=== push ===" -ForegroundColor Cyan
  Invoke-Native git @('push', 'origin', 'HEAD')
  Invoke-Native git @('push', 'origin', $Version)

  # AND STOP. .github/workflows/release.yml takes it from here: it builds main.js and
  # styles.css from the tagged commit, packages the zip, attests all four assets with
  # build provenance, and creates the Release with the CHANGELOG section as a first-draft
  # body. That draft still has to be rewritten by hand -- see .ai-context/releasing.md --
  # and nothing fails if it is not, which is why it is the last thing printed here.
  Write-Host "`npushed $Version. The release is the workflow's now." -ForegroundColor Green
  Write-Host @"

  Watch it:      gh run watch
  Or open it:    gh run list --workflow=release.yml --limit 1

  When it is green, the Release exists with main.js, manifest.json, styles.css and
  vault-graph-$Version.zip attached, each with a build-provenance attestation:

    gh attestation verify main.js --repo luke321/vault-graph

  STILL YOURS TO DO: the release body is the raw CHANGELOG section. Write the highlight
  reel on top of it (.ai-context/releasing.md has the shape and the reasoning) and edit
  it in place:

    gh release edit $Version --notes-file <file>
"@ -ForegroundColor Cyan
} finally {
  Pop-Location
}
