param(
    [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$packageJson = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
if (!$Version) {
    $Version = [string]$packageJson.version
}

$releaseRoot = Join-Path $repoRoot 'release'
$releaseDir = Join-Path $releaseRoot "v$Version"
if (Test-Path -LiteralPath $releaseDir) {
    Remove-Item -LiteralPath $releaseDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

Push-Location $repoRoot
try {
    . (Join-Path $PSScriptRoot 'set-rust-release-env.ps1') -RepoRoot $repoRoot

    & npm run test:file-tree
    if ($LASTEXITCODE -ne 0) { throw 'file tree smoke failed.' }

    & npm run build:desktop:bundle
    if ($LASTEXITCODE -ne 0) { throw 'desktop bundle build failed.' }

    $sourceZip = Join-Path $releaseDir "streamthing-v$Version-source.zip"
    & git archive --format=zip --output=$sourceZip --prefix="streamthing-v$Version/" HEAD
    if ($LASTEXITCODE -ne 0) { throw 'source archive failed.' }

    $cliSource = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'src-tauri\binaries') -Filter 'streamthing-cli-*.exe' -File |
        Sort-Object Name |
        Select-Object -First 1
    if (!$cliSource) {
        throw 'streamthing-cli sidecar was not produced.'
    }
    $targetTriple = $cliSource.BaseName -replace '^streamthing-cli-', ''
    Copy-Item -LiteralPath $cliSource.FullName -Destination (Join-Path $releaseDir "streamthing-cli-v$Version-$targetTriple.exe") -Force

    $installerFiles = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'src-tauri\target\release\bundle\nsis') -File -ErrorAction SilentlyContinue)
    if ($installerFiles.Count -eq 0) {
        throw 'No NSIS installer was produced.'
    }
    foreach ($installer in $installerFiles) {
        Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $releaseDir $installer.Name) -Force
    }

    $hashLines = Get-ChildItem -LiteralPath $releaseDir -File | Sort-Object Name | ForEach-Object {
        $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $($_.Name)"
    }
    $hashLines | Set-Content -LiteralPath (Join-Path $releaseDir 'SHA256SUMS.txt') -Encoding ascii

    Get-ChildItem -LiteralPath $releaseDir -File | Sort-Object Name | Select-Object Name, Length
} finally {
    Pop-Location
}
