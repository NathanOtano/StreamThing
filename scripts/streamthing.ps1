param(
    [ValidateSet('list-folders', 'status', 'configure', 'launch', 'scan')]
    [string]$Command = 'list-folders',

    [string]$Device = '',
    [string]$FolderId = '',
    [switch]$OnlyActive,
    [switch]$AllowPaused,
    [switch]$Scan,
    [switch]$StopExisting,
    [switch]$Json,
    [string]$SyncthingHome = '',
    [string]$ExePath = ''
)

$ErrorActionPreference = 'Stop'

function Normalize-Token {
    param([string]$Value)
    return (($Value ?? '') -replace '[^A-Za-z0-9]', '').ToLowerInvariant()
}

function Get-RepoRoot {
    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
}

function Get-SyncthingConfigPath {
    if ($SyncthingHome) {
        return Join-Path $SyncthingHome 'config.xml'
    }
    return Join-Path $env:LOCALAPPDATA 'Syncthing\config.xml'
}

function Read-SyncthingConfig {
    $path = Get-SyncthingConfigPath
    if (!(Test-Path -LiteralPath $path)) {
        throw "Syncthing config not found: $path"
    }

    [xml]$cfg = Get-Content -LiteralPath $path
    return [pscustomobject]@{
        Path = $path
        Xml = $cfg
    }
}

function Get-GuiUrl {
    param([xml]$Config)
    $address = [string]($Config.configuration.gui.address | Select-Object -First 1)
    if (!$address) {
        throw 'Syncthing GUI address is missing from config.xml'
    }
    if ($address -match '^https?://') {
        return $address
    }
    return "http://$address"
}

function Get-ApiKey {
    param([xml]$Config)
    $key = [string]($Config.configuration.gui.apikey | Select-Object -First 1)
    if (!$key) {
        throw 'Syncthing API key is missing from config.xml'
    }
    return $key
}

function Get-SyncthingDevices {
    param([xml]$Config)
    return @($Config.configuration.device) | ForEach-Object {
        [pscustomobject]@{
            Id = [string]$_.id
            Name = [string]$_.name
            Addresses = @($_.address)
        }
    }
}

function Resolve-Device {
    param(
        [object[]]$Devices,
        [string]$Name
    )

    if (!$Name) {
        return $null
    }

    $target = Normalize-Token $Name
    $aliases = @{}
    if ($aliases.ContainsKey($target)) {
        $target = $aliases[$target]
    }

    $match = $Devices | Where-Object {
        (Normalize-Token $_.Name) -eq $target -or
        (Normalize-Token $_.Id).StartsWith($target) -or
        (Normalize-Token $_.Name).Contains($target)
    } | Select-Object -First 1

    if (!$match) {
        throw "Device not found in Syncthing config: $Name"
    }

    return $match
}

function Resolve-FolderPath {
    param([string]$Path)
    if (!$Path) {
        return ''
    }
    if ($Path.StartsWith('~')) {
        $suffix = $Path.Substring(1).TrimStart('\', '/')
        return Join-Path $env:USERPROFILE $suffix
    }
    return $Path
}

function Get-SyncthingFolders {
    param(
        [xml]$Config,
        [object[]]$Devices,
        [object]$TargetDevice
    )

    return @($Config.configuration.folder) | ForEach-Object {
        $folder = $_
        $deviceIds = @($folder.device | ForEach-Object { [string]$_.id })
        $deviceNames = @($deviceIds | ForEach-Object {
            $id = $_
            ($Devices | Where-Object Id -eq $id | Select-Object -First 1).Name
        }) | Where-Object { $_ }

        [pscustomobject]@{
            Id = [string]$folder.id
            Label = [string]$folder.label
            Path = Resolve-FolderPath ([string]$folder.path)
            Paused = ([string]$folder.paused) -eq 'true'
            SharedWithDevice = if ($TargetDevice) { $deviceIds -contains $TargetDevice.Id } else { $true }
            Devices = $deviceNames
        }
    }
}

function Select-StreamThingFolder {
    param(
        [object[]]$Folders,
        [string]$RequestedFolderId,
        [switch]$RequireActive,
        [switch]$PermitPaused
    )

    $candidates = $Folders | Where-Object { $_.SharedWithDevice }

    if ($RequestedFolderId) {
        $candidates = $candidates | Where-Object {
            $_.Id -eq $RequestedFolderId -or $_.Label -eq $RequestedFolderId
        }
    }

    if ($RequireActive -and !$AllowPaused) {
        $candidates = $candidates | Where-Object { !$_.Paused }
    }

    $selected = $candidates | Sort-Object Paused, Label, Id | Select-Object -First 1
    if (!$selected) {
        $scope = if ($RequestedFolderId) { $RequestedFolderId } else { "device '$Device'" }
        throw "No matching Syncthing folder for $scope. Use -AllowPaused if you intentionally want a paused folder."
    }

    if ($selected.Paused -and !$AllowPaused -and !$PermitPaused) {
        throw "Folder '$($selected.Id)' is paused. Use -AllowPaused if this is intentional."
    }

    return $selected
}

function Invoke-SyncthingApi {
    param(
        [string]$Method = 'GET',
        [string]$Url,
        [string]$ApiKey
    )
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers @{ 'X-API-Key' = $ApiKey } -TimeoutSec 8
}

function Get-StreamThingAppDir {
    return Join-Path $env:LOCALAPPDATA 'io.streamthing.desktop'
}

function Write-StartupConfig {
    param(
        [object]$Folder,
        [string]$Url,
        [string]$ApiKey,
        [object]$TargetDevice
    )

    $appDir = Get-StreamThingAppDir
    New-Item -ItemType Directory -Force -Path $appDir | Out-Null
    $path = Join-Path $appDir 'startup-config.json'
    $payload = [ordered]@{
        config = [ordered]@{
            url = $Url
            apiKey = $ApiKey
        }
        folderId = $Folder.Id
        localPath = $Folder.Path
        label = $Folder.Label
        source = 'streamthing-cli'
        device = if ($TargetDevice) { $TargetDevice.Name } else { $null }
        createdAt = (Get-Date).ToString('o')
    }

    $payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Get-StreamThingExe {
    if ($ExePath) {
        return (Resolve-Path -LiteralPath $ExePath).Path
    }

    $candidate = Join-Path (Get-RepoRoot) 'src-tauri\target\release\streamthing-desktop.exe'
    if (!(Test-Path -LiteralPath $candidate)) {
        throw "StreamThing executable not found: $candidate. Run npm run build:desktop first."
    }
    return $candidate
}

function Convert-Result {
    param([object]$Value)
    if ($Json) {
        $Value | ConvertTo-Json -Depth 12
    } else {
        $Value
    }
}

$syncthing = Read-SyncthingConfig
$config = $syncthing.Xml
$url = Get-GuiUrl $config
$apiKey = Get-ApiKey $config
$devices = @(Get-SyncthingDevices $config)
$targetDevice = Resolve-Device -Devices $devices -Name $Device
$folders = @(Get-SyncthingFolders -Config $config -Devices $devices -TargetDevice $targetDevice)

switch ($Command) {
    'list-folders' {
        $visible = $folders | Where-Object { $_.SharedWithDevice }
        if ($OnlyActive) {
            $visible = $visible | Where-Object { !$_.Paused }
        }
        Convert-Result ([pscustomobject]@{
            Device = if ($targetDevice) { $targetDevice.Name } else { $null }
            Url = $url
            Folders = @($visible | Select-Object Id, Label, Path, Paused, Devices)
        })
    }
    'status' {
        $folder = Select-StreamThingFolder -Folders $folders -RequestedFolderId $FolderId -RequireActive:$false -PermitPaused
        $status = Invoke-SyncthingApi -Url "$url/rest/db/status?folder=$($folder.Id)" -ApiKey $apiKey
        $connections = Invoke-SyncthingApi -Url "$url/rest/system/connections" -ApiKey $apiKey
        $connection = if ($targetDevice) { $connections.connections.($targetDevice.Id) } else { $null }
        Convert-Result ([pscustomobject]@{
            Device = if ($targetDevice) { $targetDevice.Name } else { $null }
            DeviceConnected = if ($connection) { $connection.connected } else { $null }
            Folder = $folder | Select-Object Id, Label, Path, Paused
            State = $status.state
            LocalFiles = $status.localFiles
            GlobalFiles = $status.globalFiles
            NeedFiles = $status.needFiles
            NeedBytes = $status.needBytes
        })
    }
    'configure' {
        $folder = Select-StreamThingFolder -Folders $folders -RequestedFolderId $FolderId -RequireActive:(!$FolderId)
        $startupPath = Write-StartupConfig -Folder $folder -Url $url -ApiKey $apiKey -TargetDevice $targetDevice
        Convert-Result ([pscustomobject]@{
            Configured = $true
            StartupConfigPath = $startupPath
            Folder = $folder | Select-Object Id, Label, Path, Paused
            Device = if ($targetDevice) { $targetDevice.Name } else { $null }
        })
    }
    'scan' {
        $folder = Select-StreamThingFolder -Folders $folders -RequestedFolderId $FolderId -RequireActive:$true
        Invoke-SyncthingApi -Method 'POST' -Url "$url/rest/db/scan?folder=$($folder.Id)" -ApiKey $apiKey | Out-Null
        Convert-Result ([pscustomobject]@{
            ScanRequested = $true
            Folder = $folder | Select-Object Id, Label, Path, Paused
        })
    }
    'launch' {
        $folder = Select-StreamThingFolder -Folders $folders -RequestedFolderId $FolderId -RequireActive:(!$FolderId)
        if ($Scan) {
            Invoke-SyncthingApi -Method 'POST' -Url "$url/rest/db/scan?folder=$($folder.Id)" -ApiKey $apiKey | Out-Null
        }

        $existing = @(
            Get-Process streamthing-desktop -ErrorAction SilentlyContinue
            Get-Process streamthing -ErrorAction SilentlyContinue
        )
        if ($existing.Count -gt 0 -and !$StopExisting) {
            throw "StreamThing is already running. Re-run with -StopExisting to relaunch on '$($folder.Id)'."
        }
        if ($existing.Count -gt 0 -and $StopExisting) {
            $existing | Stop-Process -Force
            Start-Sleep -Milliseconds 600
        }

        $startupPath = Write-StartupConfig -Folder $folder -Url $url -ApiKey $apiKey -TargetDevice $targetDevice
        $exe = Get-StreamThingExe
        $process = Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -PassThru

        Convert-Result ([pscustomobject]@{
            Launched = $true
            ProcessId = $process.Id
            Executable = $exe
            StartupConfigPath = $startupPath
            ScanRequested = [bool]$Scan
            Folder = $folder | Select-Object Id, Label, Path, Paused
            Device = if ($targetDevice) { $targetDevice.Name } else { $null }
        })
    }
}
