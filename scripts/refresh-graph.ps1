
$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$build = Join-Path $here '../src/build-graph.mjs'

$output = & node $build @args 2>&1
$exit = $LASTEXITCODE
$output | ForEach-Object { $_ }

if ($exit -ne 0) {
    Write-Error "build-graph.mjs failed (exit $exit) -- the old snapshot is untouched."
    exit $exit
}

$wrote = $output | Where-Object { $_ -match '^wrote (.+) \(' } | Select-Object -Last 1
if ($wrote -match '^wrote (.+) \(') {
    Start-Process $Matches[1]
} else {
    Write-Warning "Built, but could not tell where it landed -- open the file yourself."
}
