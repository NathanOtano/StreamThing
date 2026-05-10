param(
    [string]$TargetTriple = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$tauriCli = Join-Path $repoRoot 'node_modules\.bin\tauri.cmd'
if (!(Test-Path -LiteralPath $tauriCli)) {
    throw 'Tauri CLI is not installed. Run npm install first.'
}

. (Join-Path $PSScriptRoot 'set-rust-release-env.ps1') -RepoRoot $repoRoot

Push-Location $repoRoot
try {
    $prepareArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'prepare-sidecars.ps1'))
    if ($TargetTriple) {
        $prepareArgs += @('-TargetTriple', $TargetTriple)
    }
    & pwsh @prepareArgs
    if ($LASTEXITCODE -ne 0) {
        throw 'sidecar preparation failed.'
    }

    $cliTarget = Join-Path $repoRoot 'src-tauri\cli\target'
    if (Test-Path -LiteralPath $cliTarget) {
        Remove-Item -LiteralPath $cliTarget -Recurse -Force
    }

    & $tauriCli build --ci
    if ($LASTEXITCODE -ne 0) {
        throw 'desktop bundle build failed.'
    }
} finally {
    Pop-Location
}
