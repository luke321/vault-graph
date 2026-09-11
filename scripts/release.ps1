<#
.SYNOPSIS
  The local half of a release: check, gate, tag, push the tag. The publishing half is
  .github/workflows/release.yml, which the tag push triggers.

.DESCRIPTION
  Refuses a v-prefixed or non-semver version, a version the manifest does not claim, a
  version with no CHANGELOG section, a branch other than main (github#47), a dirty tree and a
  main that is not exactly origin/main (github#94); prints the hero and feature-clip
  warnings; runs lint and the Sigma notice check; builds the plugin once as a pre-flight; runs
  the invariant suite unless HEAD's tree already carries a pass stamp from an earlier full run
  (github#93; -ForceSuite runs it anyway); then writes the annotated tag and pushes it. The
  branch is never pushed: main only
  ever receives develop through a pull request merged on the website (github#94), so by the
  time this runs main is already on origin, or the guard stops it. Everything after the tag
  push -- build, provenance attestation, Release, assets -- is the workflow's (github#10).
  .ai-context/releasing.md is the authority on the two halves.

.PARAMETER Version
  Bare semver, e.g. 2.0.0. No v.

.PARAMETER DryRun
  Stop after the suite, before the tag and the push.

.PARAMETER AllowDirty
  Tag a dirty tree anyway.

.PARAMETER AllowAnyBranch
  Tag off main anyway; the workflow's main-ancestry guard will then refuse to publish.

.EXAMPLE
  .\scripts\release.ps1 2.0.0 -DryRun
#>
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
  [switch] $AllowAnyBranch,
  # Run the invariant suite even when HEAD's tree already carries a pass stamp (github#93,
  # decisions/0013). The stamp is the normal case: the dry run on the release branch measured
  # this exact tree, and the merge into main did not change it. This is the flag for not
  # trusting that -- a suspected flake, a changed Chrome, a stamp you want re-earned.
  [switch] $ForceSuite
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

  # ...AND IT HAS TO BE EXACTLY THE MAIN EVERYONE ELSE CAN SEE (github#94). main only ever
  # receives develop, through a pull request merged on the website -- the ruleset refuses a
  # direct push and has no bypass -- so by the time this script runs, main is origin/main or
  # it is wrong. BEHIND means tagging a main that is missing commits somebody else has already
  # published. AHEAD means a merge made locally that no push can land: this script used to
  # call that the normal case and push HEAD itself, which is how 2.4.0's first cut wrote its
  # tag and then watched the push come back with GH013 -- the tag already sat on a commit
  # origin would never accept. Both are caught here, the one moment a wrong tag is still free
  # to not exist.
  #
  # Fetch first, because "equal" measured against a stale remote ref is not measured at all.
  #
  # AN EXPLICIT REFSPEC, not `git fetch origin main`. That form opportunistically
  # fast-forwards the LOCAL main as well, which this observed doing while the guard was
  # being written -- a check that silently moves a branch is not a check. This updates the
  # remote-tracking ref and nothing else.
  if ($branch -eq 'main') {
    & git fetch origin 'refs/heads/main:refs/remotes/origin/main' --quiet
    $behind = (& git rev-list --count 'HEAD..origin/main').Trim()
    $ahead  = (& git rev-list --count 'origin/main..HEAD').Trim()
    if ($behind -ne '0') {
      throw ("main is $behind commit(s) behind origin/main. Pull first -- tagging here " +
             "would tag a main that is missing what is already published.")
    }
    if ($ahead -ne '0') {
      throw ("main is $ahead commit(s) ahead of origin/main, and the ruleset on main refuses a " +
             "direct push (GH013: changes must be made through a pull request). Open " +
             "develop -> main on the website and merge it, then 'git switch main' and " +
             "'git pull --ff-only', and run this again. Nothing was tagged.")
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

  # THE UPDATE NOTE IS PART OF A MINOR OR MAJOR (github#83). The plugin shows plugin/whats-new.md
  # once, on the first open after such an update -- but only when the note's version matches the
  # installed one, so a release that forgot to write it would ship silently: nothing fails, the
  # strip never appears, and nobody is told. A PATCH shows nothing by design and keeps the
  # previous note in place, so only x.y.0 is checked here.
  $noteText = [IO.File]::ReadAllText((Join-Path $repo 'plugin\whats-new.md'), [Text.Encoding]::UTF8)
  $noteVersion = [regex]::Match($noteText, '(?m)^#\s+(\d+\.\d+\.\d+)\s*$').Groups[1].Value
  if ($Version -match '\.0$' -and $noteVersion -ne $Version) {
    throw "plugin/whats-new.md is for '$noteVersion', not $Version. A MINOR or MAJOR ships an update note (github#83) -- write it first."
  }

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
  Write-Host "`n=== lint ===" -ForegroundColor Cyan
  try { Invoke-Native npm @('run', 'lint', '--silent') }
  catch { throw "lint failed -- not releasing (npm ci first, if this is a fresh clone)" }

  Write-Host "`n=== notice ===" -ForegroundColor Cyan
  try { Invoke-Native node @((Join-Path $here 'check-notice.mjs')) }
  catch { throw "the Sigma notice is missing from a build -- not releasing" }

  Write-Host "`n=== build (pre-flight) ===" -ForegroundColor Cyan
  try { Invoke-Native node @((Join-Path $here 'build-plugin.mjs')) }
  catch {
    throw ("the plugin build failed -- the workflow would fail the same way and leave a tag " +
           "with no release. Fix it first (npm ci, if this is a fresh clone).")
  }

  # A TREE IS GATED ONCE (github#93, decisions/0013). scripts/smoke.mjs stamps the tree it
  # passed; the dry run on the release branch is normally that run, and the merge into main
  # carries the same tree (measured byte-identical on 2.3.0, 2.4.0 and 2.4.1). So the suite is
  # skipped here when HEAD's tree already has a stamp against the fixtures now in the store,
  # and named when it is. -ForceSuite runs it regardless. When it does run, it runs under the
  # machine-wide suite lock (scripts/lock.mjs, github#92) and releases it on every way out.
  Write-Host "`n=== invariants ===" -ForegroundColor Cyan
  $stamped = $false
  if (-not $ForceSuite) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $stampOut = @(); $stampRc = 1
    try { $stampOut = @(& node (Join-Path $here 'suite-stamp.mjs') check HEAD); $stampRc = $LASTEXITCODE }
    finally { $ErrorActionPreference = $prev }
    $stampOut | ForEach-Object { Write-Host $_ }
    # github#103: exit 0 alone is not a stamp; the pass line itself is required
    $stamped = ($stampRc -eq 0) -and (($stampOut -join ' ') -match 'passed the invariant suite')
  }
  if ($stamped) {
    Write-Host "HEAD's tree already passed the suite -- skipping it (-ForceSuite to run it anyway)" -ForegroundColor Yellow
  } else {
    $lockOwner = "release.ps1 $Version"
    try { Invoke-Native node @((Join-Path $here 'lock.mjs'), 'acquire', 'suite', '--owner', $lockOwner) }
    catch { throw "could not take the suite lock -- another suite is running (node scripts/lock.mjs status); not releasing" }
    try {
      try { Invoke-Native node @((Join-Path $here 'smoke.mjs')) }
      catch { throw "the invariant suite failed -- not releasing" }
    } finally {
      $prev = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      try { & node (Join-Path $here 'lock.mjs') release suite --owner $lockOwner } finally { $ErrorActionPreference = $prev }
    }
  }

  if ($DryRun) { Write-Host "`n-DryRun: stopping before the tag and the push." -ForegroundColor Yellow; return }

  Write-Host "`n=== tag ===" -ForegroundColor Cyan
  # Annotated, with the notes as the message, so `git show <tag>` tells the same story as
  # the Release page.
  $msgFile = Join-Path $env:TEMP "vg-tag-$Version.txt"
  # No BOM -- git and gh both read these as bytes, and a BOM ends up in the tag message.
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($msgFile, $section, $utf8)
  # --cleanup=verbatim: git's default strips every line starting with '#' from a tag message
  # as a comment, which silently ate the '## <version>' heading and every '###' section from
  # 2.0.0, 2.1.0 and 2.2.0's tags. github#47
  if (-not $tagExists) { Invoke-Native git @('tag', '-a', $Version, '--cleanup=verbatim', '-F', $msgFile) }
  Remove-Item $msgFile -ErrorAction SilentlyContinue

  # THE TAG, AND ONLY THE TAG. The workflow refuses to publish a tag that is not in
  # origin/main's history (github#47, server-side this time), and it starts the moment the
  # tag lands -- so a tag pushed before its commit is on origin/main would race its own
  # guard. The guard above is what closes that window now: on main, HEAD IS origin/main, and
  # it got there through the pull request the ruleset requires (github#94). This script used
  # to push HEAD first for the same reason; under the ruleset that push is a no-op at best
  # and a GH013 at worst, after the tag had been made. Off main (-AllowAnyBranch) nothing
  # pushes the branch either -- the workflow will refuse the tag, as that switch says.
  Write-Host "`n=== push ===" -ForegroundColor Cyan
  Invoke-Native git @('push', 'origin', $Version)

  # AND STOP. .github/workflows/release.yml takes it from here: it builds main.js and
  # styles.css from the tagged commit, attests the three files with build provenance, and
  # creates the Release with the CHANGELOG section as a first-draft body. That draft still
  # has to be rewritten by hand -- see .ai-context/releasing.md -- and nothing fails if it
  # is not, which is why it is the last thing printed here.
  Write-Host "`npushed $Version. The release is the workflow's now." -ForegroundColor Green
  Write-Host @"

  Watch it:      gh run watch
  Or open it:    gh run list --workflow=release.yml --limit 1

  When it is green, the Release exists with main.js, manifest.json and styles.css
  attached -- the three files Obsidian installs -- each with a build-provenance attestation:

    gh attestation verify main.js --repo luke321/vault-graph

  STILL YOURS TO DO: the release body is the raw CHANGELOG section. Write the highlight
  reel on top of it (.ai-context/releasing.md has the shape and the reasoning) and edit
  it in place:

    gh release edit $Version --notes-file <file>
"@ -ForegroundColor Cyan
} finally {
  Pop-Location
}
