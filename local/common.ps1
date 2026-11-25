# Shared by setup.ps1, start.ps1, stop.ps1 and backup.ps1: finds the programs and reads the settings.
$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $PSScriptRoot 'run'
$EnvFile = Join-Path $AppDir '.env'

function Stop-WithMessage([string]$Message) {
    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    exit 1
}

function Find-Php {
    $cmd = Get-Command php.exe -ErrorAction SilentlyContinue
    if (-not $cmd) { Stop-WithMessage "PHP was not found. Install it with:  winget install PHP.PHP.8.5   then open a new window and run this again." }
    $dir = Split-Path -Parent $cmd.Source
    if (-not (Test-Path (Join-Path $dir 'php8apache2_4.dll'))) {
        Stop-WithMessage "This PHP ($dir) has no Apache module (php8apache2_4.dll). Install the thread-safe build with:  winget install PHP.PHP.8.5"
    }
    return $dir
}

function Find-ApacheRoot {
    $cmd = Get-Command httpd.exe -ErrorAction SilentlyContinue
    $exe = if ($cmd) { $cmd.Source } else { $null }
    if (-not $exe) {
        $pkg = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Directory -Filter 'ApacheLounge.httpd*' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pkg) { $exe = Get-ChildItem $pkg.FullName -Recurse -Filter httpd.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
    }
    if (-not $exe) { Stop-WithMessage "Apache was not found. Install it with:  winget install ApacheLounge.httpd   then run this again." }
    # winget's command alias points elsewhere; the real install has bin\httpd.exe under the Apache folder
    $real = (Get-Item $exe).Target
    if ($real) { $exe = $real }
    return Split-Path -Parent (Split-Path -Parent $exe)
}

function Find-PgBin([string]$Given) {
    if ($Given) {
        if (Test-Path (Join-Path $Given 'psql.exe')) { return $Given }
        # A folder saved on another PC; look for this PC's PostgreSQL instead
        Write-Host "PostgreSQL isn't in $Given on this PC; looking for it elsewhere."
    }
    $cmd = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($cmd) { return Split-Path -Parent $cmd.Source }
    # The newest version installed (folders are named by version, such as 18; sorted as numbers so 18 beats 9)
    $found = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
        Sort-Object { [int]($_.Directory.Parent.Name -replace '\D.*$', '') } -Descending | Select-Object -First 1
    if ($found) { return Split-Path -Parent $found.FullName }
    Stop-WithMessage "PostgreSQL was not found. Install it with:  winget install PostgreSQL.PostgreSQL.18   then run this again."
}

# KEY=VALUE lines; # starts a comment
function Read-DotEnv {
    if (-not (Test-Path $EnvFile)) { Stop-WithMessage "The settings file (.env) is missing. Run setup.cmd first." }
    $values = @{}
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' -and -not $line.TrimStart().StartsWith('#')) {
            $values[$Matches[1]] = $Matches[2].Trim('"', "'")
        }
    }
    return $values
}

# The school OneDrive folder's backup subfolder, when the OneDrive app is signed in with a school (work) account
function Get-OneDriveBackupDir {
    if ($env:OneDriveCommercial -and (Test-Path $env:OneDriveCommercial)) { return (Join-Path $env:OneDriveCommercial 'STI Scheduler Backups') }
    return $null
}

# Where backups go: BACKUP_DIR from .env (such as the school OneDrive folder), otherwise local\backups.
# A BACKUP_DIR whose parent folder isn't on this PC (copied from another PC, or OneDrive signed out) falls back too.
function Get-BackupDir($Settings) {
    $dir = $Settings['BACKUP_DIR']
    if ($dir) {
        if (Test-Path (Split-Path -Parent $dir)) { return $dir }
        Write-Host "The backup folder in .env ($dir) isn't on this PC; using local\backups instead." -ForegroundColor Yellow
    }
    return (Join-Path $PSScriptRoot 'backups')
}

# Adds KEY=VALUE to .env when the key isn't there yet; existing settings are never changed
function Add-DotEnvSetting([string]$Key, [string]$Value) {
    $lines = @(Get-Content $EnvFile)
    if ($lines | Where-Object { $_ -match "^\s*$Key\s*=" }) { return $false }
    [IO.File]::AppendAllText($EnvFile, "$Key=$Value`r`n", (New-Object Text.UTF8Encoding $false))
    return $true
}

function Get-PhpExtensionArgs([string]$PhpDir) {
    return @('-d', "extension_dir=$PhpDir\ext", '-d', 'extension=pdo_pgsql', '-d', 'extension=mbstring', '-d', 'extension=openssl', '-d', 'extension=curl')
}

# The addresses other PCs on the school network use to open the app
function Get-LanAddresses {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' } |
        Select-Object -ExpandProperty IPAddress
}

function Test-Port([string]$HostName, [int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $wait = $client.BeginConnect($HostName, $Port, $null, $null)
        return $wait.AsyncWaitHandle.WaitOne(1500) -and $client.Connected
    } catch { return $false } finally { $client.Close() }
}
