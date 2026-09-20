<#
.SYNOPSIS
  Install the spike plugin into a vault, and optionally mint a throwaway vault to try it
  in so a live vault is never the test subject.

.DESCRIPTION
  Installs the three files Obsidian actually loads -- main.js, manifest.json, styles.css,
  built at the repo root by `node scripts/build-plugin.mjs`. The page markup and the logo
  are bundled into main.js at build time (raw:/b64: imports in plugin/main.js), so there is
  nothing else to copy; run the build first if those three aren't there yet.

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
$manifestPath = Join-Path $repo 'manifest.json'
if (-not (Test-Path $manifestPath)) { throw "no manifest.json at the repo root" }
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$pluginId = $manifest.id

function Write-Utf8NoBom([string] $Path, [string] $Text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function New-TestVault {
  $root = Join-Path $env:TEMP "vault-graph-spike-vault"
  if (Test-Path $root) { Remove-Item -Recurse -Force $root }
  New-Item -ItemType Directory -Force -Path $root | Out-Null

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

$dest = Join-Path $vaultRoot ".obsidian/plugins/$pluginId"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$assets = @('main.js', 'manifest.json', 'styles.css')
foreach ($a in $assets) {
  if (-not (Test-Path (Join-Path $repo $a))) {
    throw "$a is missing -- run: node scripts/build-plugin.mjs"
  }
}

$total = 0
foreach ($a in $assets) {
  $src = Join-Path $repo $a
  Copy-Item -Force -Path $src -Destination (Join-Path $dest $a)
  $bytes = (Get-Item $src).Length
  $total += $bytes
  Write-Host ("  {0,-16} {1,7:N0} bytes" -f $a, $bytes)
}
Write-Host ("installed {0:N0} KB into {1}" -f ($total / 1KB), $dest) -ForegroundColor Green

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
  Write-Host "Next: Settings -> Community plugins -> enable `"$($manifest.name)`","
  Write-Host '      then run the "Open the graph" command.'
} else {
  Write-Host ''
  Write-Host 'Next: open the test vault. To drive it under CDP:'
  Write-Host ('  node scripts/spike-check.mjs --vault "' + $vaultRoot + '"')
}
