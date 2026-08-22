<#
.SYNOPSIS
  Install the spike plugin into a vault, and optionally mint a throwaway vault to try it
  in so a live vault is never the test subject.

.DESCRIPTION
  The plugin folder needs five things that live in four places in this repo, so copying
  them by hand is exactly the sort of step that gets done wrong once and then debugged
  for an hour:

      plugin/main.js  manifest.json  styles.css
      src/template.html                     -> the page, verbatim
      vendor/*.js                           -> sigma + graphology, inlined at view time
      assets/logo-mask.png                  -> optional

  Vault resolution matches src/build-graph.mjs on purpose: -Vault, then
  VAULT_GRAPH_VAULT, then OBSIDIAN_VAULT. No path is written down anywhere -- the vault
  sits at a different absolute path on each machine.

.PARAMETER Vault
  Vault root to install into. Defaults to $env:VAULT_GRAPH_VAULT, then $env:OBSIDIAN_VAULT.

.PARAMETER TestVault
  Create (or refresh) a small throwaway vault under $env:TEMP and install there instead.
  Its .obsidian is seeded with the plugin already enabled and restricted mode already
  off, which only works because Obsidian has never opened that vault -- it rewrites
  those files from memory for any vault it currently holds open.

.PARAMETER Enable
  Also add the plugin id to community-plugins.json in a REAL vault. Off by default:
  Obsidian rewrites its own config from memory, so editing it under a running app is
  reverted silently. Enable it in Settings instead, or close Obsidian first.

.EXAMPLE
  ./scripts/install-spike.ps1 -TestVault
.EXAMPLE
  ./scripts/install-spike.ps1                  # into the real vault, then enable by hand
#>
[CmdletBinding()]
param(
  [string] $Vault,
  [switch] $TestVault,
  [switch] $Enable
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$pluginId = 'vault-graph-spike'

function Write-Utf8NoBom([string] $Path, [string] $Text) {
  # Not Set-Content: on PS 5.1 it writes the system ANSI codepage, and a BOM breaks
  # JSON.parse on the Obsidian side.
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function New-TestVault {
  $root = Join-Path $env:TEMP "vault-graph-spike-vault"
  if (Test-Path $root) { Remove-Item -Recurse -Force $root }
  New-Item -ItemType Directory -Force -Path $root | Out-Null

  # Shaped to stress the layout rather than to look like the author's vault: a flat root
  # note (no wedge of its own), a folder with nested named subfolders, a daily-notes
  # folder with a month bucket, an alias that only resolves through the metadata cache,
  # and a link that resolves to nothing.
  # Three literal backticks, built rather than escaped: a fence written inline inside a
  # PowerShell string is six backticks and unreadable, and getting it wrong silently
  # produces a note whose fence is not a fence -- which is the exact thing the note is
  # there to test.
  $fence = [string]([char]96) * 3

  $notes = @{
    'Home.md'                                  = "# Home`n`nRoot-level note, no folder. Links [[Alpha]] and [[The Beta Note]].`n"
    '01 - Projects/Alpha.md'                   = "---`ntype: project`ntags: [active]`ncreated: 2026-08-01`n---`n`nLinks [[Beta]] via its alias, plus [[Nowhere Note]] which does not exist.`n"
    '01 - Projects/Company/Gamma.md'           = "---`ntype: project`ncreated: 2026-08-05`n---`n`nSecond-level folder. Links [[Alpha]].`n"
    '02 - Areas/Career/Review.md'              = "---`ncreated: 2026-08-10`n---`n`nLinks [[Gamma]] and [[Alpha]].`n"
    '03 - Resources/Beta.md'                   = "---`naliases: [The Beta Note]`ncreated: 2026-08-02`n---`n`nResolved only through the alias table. Links [[Alpha]].`n"
    '03 - Resources/People/Someone.md'         = "---`ntype: person`n---`n`nA person. Links [[Review]].`n"
    '04 - Daily Notes/2026-08/2026-08-20.md'   = "---`ncreated: 2026-08-20`ntags: [daily-note]`n---`n`n[[2026-08-19]] <- | -> [[2026-08-21]]`n`nWorked on [[Alpha]].`n"
    '04 - Daily Notes/2026-08/2026-08-21.md'   = "---`ncreated: 2026-08-21`ntags: [daily-note]`n---`n`n[[2026-08-20]] <- | -> [[2026-08-22]]`n`nSaw [[Someone]], touched [[Gamma]].`n"
    '04 - Daily Notes/2026-08/2026-08-22.md'   = "---`ncreated: 2026-08-22`ntags: [daily-note]`n---`n`n[[2026-08-21]] <- | -> [[2026-08-23]]`n`nThe fenced link below must NOT become an edge:`n`n$fence`dataview`nLIST FROM [[Orphan]]`n$fence`n"
    '_ Archives/Old Thing.md'                  = "---`ncreated: 2025-01-04`n---`n`nDormant. Links [[Alpha]].`n"
    'Templates/Daily Note.md'                  = "---`ncreated: {{date:YYYY-MM-DD}}`n---`n`nA template. Excluded unless --templates.`n"
    'Orphan.md'                                = "# Orphan`n`nNothing links here and it links nowhere.`n"
  }
  foreach ($rel in $notes.Keys) {
    $abs = Join-Path $root $rel
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $abs) | Out-Null
    Write-Utf8NoBom $abs $notes[$rel]
  }

  $cfg = Join-Path $root '.obsidian'
  New-Item -ItemType Directory -Force -Path $cfg | Out-Null
  Write-Utf8NoBom (Join-Path $cfg 'app.json')              '{}'
  Write-Utf8NoBom (Join-Path $cfg 'daily-notes.json')      '{"folder":"04 - Daily Notes","format":"YYYY-MM-DD"}'
  Write-Utf8NoBom (Join-Path $cfg 'templates.json')        '{"folder":"Templates"}'
  Write-Utf8NoBom (Join-Path $cfg 'community-plugins.json') ('["' + $pluginId + '"]')
  Write-Utf8NoBom (Join-Path $cfg 'core-plugins.json')     '{"file-explorer":true,"daily-notes":true,"templates":true}'

  return $root
}

# ---------------------------------------------------------------- which vault
if ($TestVault) {
  $vaultRoot = New-TestVault
  Write-Host "test vault: $vaultRoot" -ForegroundColor Cyan
} else {
  if (-not $Vault) { $Vault = $env:VAULT_GRAPH_VAULT }
  if (-not $Vault) { $Vault = $env:OBSIDIAN_VAULT }
  if (-not $Vault) {
    throw "No vault given. Pass -Vault <path>, set VAULT_GRAPH_VAULT, or use -TestVault."
  }
  $vaultRoot = (Resolve-Path $Vault).Path
  if (-not (Test-Path (Join-Path $vaultRoot '.obsidian'))) {
    throw "No .obsidian in $vaultRoot -- that is not a vault root."
  }
}

# ------------------------------------------------------------------- install
$dest = Join-Path $vaultRoot ".obsidian/plugins/$pluginId"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dest 'vendor') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dest 'assets') | Out-Null

$copies = @(
  @{ From = 'plugin/main.js';       To = 'main.js' }
  @{ From = 'plugin/manifest.json'; To = 'manifest.json' }
  @{ From = 'plugin/styles.css';    To = 'styles.css' }
  @{ From = 'src/template.html';    To = 'template.html' }
  @{ From = 'vendor/graphology.umd.min.js'; To = 'vendor/graphology.umd.min.js' }
  @{ From = 'vendor/sigma.min.js';          To = 'vendor/sigma.min.js' }
  @{ From = 'assets/logo-mask.png';         To = 'assets/logo-mask.png' }
)

$total = 0
foreach ($c in $copies) {
  $src = Join-Path $repo $c.From
  if (-not (Test-Path $src)) { Write-Warning "missing, skipped: $($c.From)"; continue }
  Copy-Item -Force -Path $src -Destination (Join-Path $dest $c.To)
  $bytes = (Get-Item $src).Length
  $total += $bytes
  Write-Host ("  {0,-34} {1,7:N0} bytes" -f $c.To, $bytes)
}
Write-Host ("installed {0:N0} KB into {1}" -f ($total / 1KB), $dest) -ForegroundColor Green

# -------------------------------------------------------------------- enable
if ($Enable -and -not $TestVault) {
  $cpj = Join-Path $vaultRoot '.obsidian/community-plugins.json'
  $list = @()
  if (Test-Path $cpj) {
    try { $list = @(Get-Content -Raw -Encoding UTF8 $cpj | ConvertFrom-Json) } catch { $list = @() }
  }
  if ($list -notcontains $pluginId) { $list += $pluginId }
  Write-Utf8NoBom $cpj ($list | ConvertTo-Json -Compress)
  Write-Host "added $pluginId to community-plugins.json" -ForegroundColor Yellow
  Write-Host "NOTE: a running Obsidian rewrites this file from memory. Restart it, or" -ForegroundColor Yellow
  Write-Host "      enable the plugin in Settings instead." -ForegroundColor Yellow
}

if (-not $TestVault) {
  Write-Host ''
  Write-Host 'Next: Settings -> Community plugins -> enable "Vault Graph (spike)",'
  Write-Host '      then run the "Open the graph" command.'
} else {
  Write-Host ''
  Write-Host 'Next: open the test vault. To drive it under CDP:'
  Write-Host ('  node scripts/spike-check.mjs --vault "' + $vaultRoot + '"')
}
