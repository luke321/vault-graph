# Rebuild the vault graph snapshot, then open it.
#
# The page in the browser is a snapshot, not a live view: its Refresh button re-reads the
# file from disk, but only node can walk the vault and regenerate the data behind it. This
# is the one step that does both, and it is what a desktop shortcut should point at.
#
# WHICH VAULT is decided entirely by build-graph.mjs, which asks Obsidian's own registry
# (%APPDATA%\obsidian\obsidian.json). This script deliberately holds no default: the vault
# sits on a different drive, path and user profile on each of the two machines, so any
# default here is wrong on one of them. It briefly hardcoded one machine's path and
# would simply have failed on the other machine.
#
# WHERE IT LANDS is likewise the builder's business -- it defaults the output into the
# vault, because the vault is what syncs to the other devices. This script learns the path
# from the builder's own "wrote <path>" line rather than recomputing it, so each question
# has exactly one implementation.
#
# Everything is passed straight through:
#   .\refresh-graph.ps1 --ghosts
#   .\refresh-graph.ps1 --templates --flat-months
#   .\refresh-graph.ps1 --vault "E:\OtherVault"
#   .\refresh-graph.ps1 --vault-name SecondBrain     # if several vaults are registered

$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$build = Join-Path $here '../src/build-graph.mjs'

$output = & node $build @args 2>&1
$exit = $LASTEXITCODE
$output | ForEach-Object { $_ }

if ($exit -ne 0) {
    Write-Error "build-graph.mjs failed (exit $exit) -- the old snapshot is untouched."
    exit $exit
}

# "wrote <path> (<size>)" is the builder's last line on success.
$wrote = $output | Where-Object { $_ -match '^wrote (.+) \(' } | Select-Object -Last 1
if ($wrote -match '^wrote (.+) \(') {
    Start-Process $Matches[1]
} else {
    Write-Warning "Built, but could not tell where it landed -- open the file yourself."
}
