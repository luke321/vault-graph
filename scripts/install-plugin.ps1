<#
.SYNOPSIS
  Install the BUILT plugin into a vault the way Obsidian installs it, and nothing else.

.DESCRIPTION
  Three files. Exactly the three Obsidian downloads from a release -- main.js,
  manifest.json, styles.css -- and deliberately nothing more.

  That restraint is the point. Its predecessor (install-spike.ps1) also copied
  template.html, vendor/*.js and assets/logo-mask.png into the plugin folder, which made
  the plugin work here and only here: a real install never puts those files anywhere, so
  every user outside this machine would have got a plugin that could not find its own
  page. Installing only what Obsidian installs turns that class of bug into an immediate,
  local failure instead of a shipped one.

  Run scripts/build-plugin.mjs first; this copies, it does not build.

.PARAMETER Vault
  Vault root. Defaults to $env:VAULT_GRAPH_VAULT, then $env:OBSIDIAN_VAULT.

.PARAMETER TestVault
  Install into the throwaway vault under $env:TEMP instead, creating it if needed via
  install-spike.ps1's generator.

.EXAMPLE
  node scripts/build-plugin.mjs; ./scripts/install-plugin.ps1
#>
[CmdletBinding()]
param(
  [string] $Vault,
  [switch] $TestVault
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

$manifestPath = Join-Path $repo 'manifest.json'
if (-not (Test-Path $manifestPath)) { throw "no manifest.json at the repo root" }
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$pluginId = $manifest.id

$assets = @('main.js', 'manifest.json', 'styles.css')
foreach ($a in $assets) {
  if (-not (Test-Path (Join-Path $repo $a))) {
    throw "$a is missing -- run: node scripts/build-plugin.mjs"
  }
}

if ($TestVault) {
  $vaultRoot = Join-Path $env:TEMP 'vault-graph-spike-vault'
  if (-not (Test-Path $vaultRoot)) {
    & (Join-Path $PSScriptRoot 'install-spike.ps1') -TestVault | Out-Null
  }
} else {
  if (-not $Vault) { $Vault = $env:VAULT_GRAPH_VAULT }
  if (-not $Vault) { $Vault = $env:OBSIDIAN_VAULT }
  if (-not $Vault) { throw "No vault given. Pass -Vault <path>, set VAULT_GRAPH_VAULT, or use -TestVault." }
  $vaultRoot = (Resolve-Path $Vault).Path
  if (-not (Test-Path (Join-Path $vaultRoot '.obsidian'))) {
    throw "No .obsidian in $vaultRoot -- that is not a vault root."
  }
}

$dest = Join-Path $vaultRoot ".obsidian/plugins/$pluginId"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

foreach ($stale in @('template.html', 'vendor', 'assets')) {
  $p = Join-Path $dest $stale
  if (Test-Path $p) {
    Remove-Item -Recurse -Force $p
    Write-Host "  removed stale $stale" -ForegroundColor DarkYellow
  }
}

$total = 0
foreach ($a in $assets) {
  $src = Join-Path $repo $a
  Copy-Item -Force -Path $src -Destination (Join-Path $dest $a)
  $bytes = (Get-Item $src).Length
  $total += $bytes
  Write-Host ("  {0,-16} {1,9:N0} bytes" -f $a, $bytes)
}

Write-Host ("installed {0} v{1} ({2:N0} KB) into {3}" -f `
  $pluginId, $manifest.version, ($total / 1KB), $dest) -ForegroundColor Green
Write-Host ''
Write-Host 'Reload plugins in Settings -> Community plugins, then run "Vault Graph: Open the graph".'
