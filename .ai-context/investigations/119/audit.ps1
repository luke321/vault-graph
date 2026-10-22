# github#119
param([switch]$Write)
$ErrorActionPreference = 'Stop'
$refs = @('e8995f1c72e32a139693699ab4c659943593a699', '1a5cee193797f3b2465bc90151990c7cc7581fcb')
$files = @('src/page.js', 'src/page.css', 'scripts/make-shape-vault.mjs')
$bundle = @{}
foreach ($ref in $refs) {
    $paths = $files
    if ($ref -eq $refs[1]) { $paths += '.ai-context/investigations/186/runs/packed-data.json' }
    foreach ($path in $paths) {
        $spec = $ref + ':' + $path
        $content = git show $spec
        if ($LASTEXITCODE -ne 0) { throw "Cannot read $spec" }
        $oid = git rev-parse $spec
        if ($LASTEXITCODE -ne 0) { throw "Cannot identify $spec" }
        $bundle[$spec] = @{ oid = $oid; text = ($content -join "`n") }
    }
}
$temporaryBundle = [IO.Path]::GetTempFileName()
try {
    [IO.File]::WriteAllText($temporaryBundle, ($bundle | ConvertTo-Json -Depth 5 -Compress), (New-Object Text.UTF8Encoding($false)))
    $arguments = @((Join-Path $PSScriptRoot 'audit.mjs'), '--bundle', $temporaryBundle)
    if ($Write) { $arguments += '--write' }
    & node @arguments
    $probeExit = $LASTEXITCODE
} finally {
    Remove-Item -LiteralPath $temporaryBundle
}
exit $probeExit
