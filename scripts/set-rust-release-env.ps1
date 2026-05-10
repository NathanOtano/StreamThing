param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'

$userHome = [Environment]::GetFolderPath('UserProfile')
$cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $userHome '.cargo' }
$rustupHome = if ($env:RUSTUP_HOME) { $env:RUSTUP_HOME } else { Join-Path $userHome '.rustup' }

$remapEntries = @(
    [pscustomobject]@{ Path = $RepoRoot; Replacement = 'streamthing-source' },
    [pscustomobject]@{ Path = $cargoHome; Replacement = 'cargo-home' },
    [pscustomobject]@{ Path = $rustupHome; Replacement = 'rustup-home' }
)

$flags = @($env:RUSTFLAGS -split '\s+' | Where-Object { $_ })
foreach ($entry in $remapEntries) {
    if (!(Test-Path -LiteralPath $entry.Path)) {
        continue
    }
    $resolved = (Resolve-Path -LiteralPath $entry.Path).Path
    $flag = "--remap-path-prefix=$resolved=$($entry.Replacement)"
    if ($flags -notcontains $flag) {
        $flags += $flag
    }
}

$env:RUSTFLAGS = ($flags -join ' ')

if (!$env:CARGO_BUILD_JOBS) {
    $env:CARGO_BUILD_JOBS = '1'
}
