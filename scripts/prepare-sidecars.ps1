param(
    [string]$TargetTriple = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$tauriRoot = Join-Path $repoRoot 'src-tauri'
$cliRoot = Join-Path $tauriRoot 'cli'
$binaryDir = Join-Path $tauriRoot 'binaries'

. (Join-Path $PSScriptRoot 'set-rust-release-env.ps1') -RepoRoot $repoRoot

if (!$TargetTriple) {
    $hostLine = (& rustc -vV | Where-Object { $_ -like 'host:*' } | Select-Object -First 1)
    if (!$hostLine) {
        throw 'Unable to resolve Rust host target triple.'
    }
    $TargetTriple = ($hostLine -replace '^host:\s*', '').Trim()
}

$sidecar = Join-Path $binaryDir "streamthing-cli-$TargetTriple.exe"
New-Item -ItemType Directory -Force -Path $binaryDir | Out-Null
if (!(Test-Path -LiteralPath $sidecar)) {
    # Tauri validates bundled resource paths during Cargo builds, including CLI-only builds.
    Set-Content -LiteralPath $sidecar -Value '' -Encoding Ascii
}

& cargo build --manifest-path (Join-Path $cliRoot 'Cargo.toml') --release --bin streamthing-cli
if ($LASTEXITCODE -ne 0) {
    throw 'streamthing-cli build failed.'
}

$source = Join-Path $cliRoot 'target\release\streamthing-cli.exe'
if (!(Test-Path -LiteralPath $source)) {
    throw "streamthing-cli.exe not found: $source"
}

Copy-Item -LiteralPath $source -Destination $sidecar -Force

[pscustomobject]@{
    TargetTriple = $TargetTriple
    Source = $source
    Sidecar = $sidecar
}
