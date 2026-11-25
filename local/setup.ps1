# One-time setup of the scheduling system on a school PC: database, settings file (.env), tables and the admin account,
# and the firewall opening other PCs need. Running it again is safe: existing settings, data and accounts are kept.
param(
    [int]$Port = 8080,
    [string]$PgBin = '',
    [string]$PgHost = '127.0.0.1',
    [int]$PgPort = 5432,
    [string]$PgSuperuser = 'postgres',
    [string]$BackupTime = '17:00',
    [string]$BackupTaskName = 'STI Scheduler Daily Backup',
    [switch]$SkipFirewall
)
. "$PSScriptRoot\common.ps1"

function Read-Secret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

# Runs SQL through standard input, so passwords never appear on a command line
function Invoke-Psql([string]$Database, [string]$Sql) {
    # psql writes notices to its error stream, so only its exit code counts
    $ErrorActionPreference = 'Continue'
    $output = $Sql | & $psql -h $PgHost -p $PgPort -U $PgSuperuser -d $Database -v ON_ERROR_STOP=1 -tA -f - 2>&1
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage "PostgreSQL refused: $output" }
    return ($output | Out-String).Trim()
}

Write-Host "STI Scheduling System - local setup" -ForegroundColor Cyan
$phpDir = Find-Php
$apacheRoot = Find-ApacheRoot
$pgBin = Find-PgBin $PgBin
$psql = Join-Path $pgBin 'psql.exe'
Write-Host "PHP:        $phpDir"
Write-Host "Apache:     $apacheRoot"
Write-Host "PostgreSQL: $pgBin"
if (-not (Test-Port $PgHost $PgPort)) {
    Stop-WithMessage "PostgreSQL isn't answering at ${PgHost}:$PgPort. Start the PostgreSQL service (Windows Services) and run this again."
}

# True when the app's database account in .env can sign in on this PC
function Test-AppLogin($Values) {
    $env:PGPASSWORD = $Values['DB_PASS']
    try {
        $ErrorActionPreference = 'Continue'
        & $psql -h $Values['DB_HOST'] -p $Values['DB_PORT'] -U $Values['DB_USER'] -d $Values['DB_NAME'] -w -tAc 'SELECT 1' 2>&1 | Out-Null
        return $LASTEXITCODE -eq 0
    } finally {
        $ErrorActionPreference = 'Stop'
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# ───── Database and settings file ─────
$geminiKey = $null
$restored = $false
$needsDatabase = $true
if (Test-Path $EnvFile) {
    $old = Read-DotEnv
    Write-Host ""
    if (Test-AppLogin $old) {
        Write-Host "A settings file (.env) already exists and its database login works, so it is kept as it is."
        $settings = $old
        $needsDatabase = $false
    } else {
        # The project was copied from another PC: set up this PC's database, keeping the Gemini key and port
        Write-Host "The settings file (.env) came from another PC (its database login doesn't work here)." -ForegroundColor Yellow
        Write-Host "Setting up the database on this PC; the Gemini key in it is kept."
        $geminiKey = $old['GEMINI_API_KEY']
        if ($old['APP_PORT'] -and -not $PSBoundParameters.ContainsKey('Port')) { $Port = [int]$old['APP_PORT'] }
    }
}
if ($needsDatabase) {
    Write-Host ""
    $env:PGPASSWORD = Read-Secret "Password of PostgreSQL's '$PgSuperuser' account (chosen when PostgreSQL was installed)"
    try {
        # The app signs in with its own account, never the PostgreSQL administrator; its password is random
        $chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
        $bytes = New-Object byte[] 32
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $appPassword = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })

        $roleExists = Invoke-Psql 'postgres' "SELECT 1 FROM pg_roles WHERE rolname = 'sti_app';"
        if ($roleExists -eq '1') {
            Invoke-Psql 'postgres' "ALTER ROLE sti_app WITH LOGIN PASSWORD '$appPassword';" | Out-Null
        } else {
            Invoke-Psql 'postgres' "CREATE ROLE sti_app WITH LOGIN PASSWORD '$appPassword';" | Out-Null
        }
        $dbExists = Invoke-Psql 'postgres' "SELECT 1 FROM pg_database WHERE datname = 'defaultdb';"
        if ($dbExists -eq '1') {
            Write-Host "The database 'defaultdb' already exists; giving the app's account access to it."
            Invoke-Psql 'defaultdb' "GRANT CONNECT, CREATE ON DATABASE defaultdb TO sti_app; GRANT ALL ON SCHEMA public TO sti_app;" | Out-Null
        } else {
            Invoke-Psql 'postgres' "CREATE DATABASE defaultdb OWNER sti_app ENCODING 'UTF8';" | Out-Null
        }

        # Data brought from another PC: an empty database can start from the newest backup, found in local\backups,
        # the school OneDrive backup folder, or the folder named in a .env copied from the other PC
        $tableCount = [int](Invoke-Psql 'defaultdb' "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
        $searchDirs = @((Join-Path $PSScriptRoot 'backups'), (Get-OneDriveBackupDir))
        if ($old -and $old['BACKUP_DIR']) { $searchDirs += $old['BACKUP_DIR'] }
        $latest = $searchDirs | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique |
            ForEach-Object { Get-ChildItem $_ -Filter 'sti-*.dump' -ErrorAction SilentlyContinue } |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($tableCount -eq 0 -and $latest) {
            Write-Host ""
            Write-Host "Found a backup: $($latest.Name) in $($latest.DirectoryName) ($($latest.LastWriteTime.ToString('MMMM d, yyyy h:mm tt')))."
            $answer = Read-Host "Restore it here, with its data and accounts? Type Y to restore, or N to start with an empty database"
            if ($answer -match '^\s*[Yy]') {
                # Restored by the PostgreSQL administrator, so the tables keep belonging to the app's account
                $ErrorActionPreference = 'Continue'
                $restoreOutput = & (Join-Path $pgBin 'pg_restore.exe') -h $PgHost -p $PgPort -U $PgSuperuser -d defaultdb --exit-on-error $latest.FullName 2>&1 | Out-String
                $restoreExit = $LASTEXITCODE
                $ErrorActionPreference = 'Stop'
                if ($restoreExit -ne 0) { Stop-WithMessage "The backup couldn't be restored: $restoreOutput" }
                Write-Host "Restored $($latest.Name)." -ForegroundColor Green
                $restored = $true
            }
        }
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }

    if ($null -eq $geminiKey) {
        Write-Host ""
        $geminiKey = Read-Secret "Gemini API key from https://aistudio.google.com/app/apikey (leave blank to add it later)"
    }
    $content = @"
# Settings for the local copy of the scheduling system, made by local/setup.ps1. Never commit or share this file.
DB_HOST=$PgHost
DB_PORT=$PgPort
DB_NAME=defaultdb
DB_USER=sti_app
DB_PASS=$appPassword
DB_SSL=false
GEMINI_API_KEY=$geminiKey
GEMINI_MODEL=gemini-flash-lite-latest
APP_PORT=$Port
PG_BIN=$pgBin
BACKUP_DIR=$(Get-OneDriveBackupDir)
"@
    [IO.File]::WriteAllText($EnvFile, $content + "`r`n", (New-Object Text.UTF8Encoding $false))
    Write-Host "Saved the settings to $EnvFile"
    $settings = Read-DotEnv
}

# ───── Tables and the admin account (a restored backup already has both) ─────
if ($restored) {
    Write-Host ""
    Write-Host "Sign in with the same accounts and passwords as on the other PC."
} else {
    Write-Host ""
    Write-Host "Next: the tables and the System Administrator account (admin@sti.edu)."
    $adminPassword = Read-Secret "Choose the admin password (8-72 characters, with a letter and a number)"
    $again = Read-Secret "Type the admin password again"
    if ($adminPassword -ne $again) { Stop-WithMessage "The two passwords don't match. Run setup.cmd again." }
    foreach ($key in 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'DB_SSL') { Set-Item "Env:$key" $settings[$key] }
    $env:ADMIN_PASSWORD = $adminPassword
    try {
        & (Join-Path $phpDir 'php.exe') @(Get-PhpExtensionArgs $phpDir) (Join-Path $AppDir 'tools\setup_pg.php')
        $setupExit = $LASTEXITCODE
    } finally {
        Remove-Item Env:ADMIN_PASSWORD, Env:DB_PASS -ErrorAction SilentlyContinue
    }
    if ($setupExit -ne 0) { Stop-WithMessage "The database setup stopped (see the message above). Nothing else was changed." }
}

# ───── Firewall: lets other PCs on the school network reach the app ─────
$appPort = [int]$settings['APP_PORT']
if (-not $SkipFirewall) {
    $ruleName = "STI Scheduling System (TCP $appPort)"
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
        Write-Host "The firewall already lets other PCs reach port $appPort."
    } elseif ($isAdmin) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $appPort -Action Allow -Profile Domain, Private | Out-Null
        Write-Host "The firewall now lets PCs on the school network (private and domain networks) reach port $appPort."
    } else {
        Write-Host ""
        Write-Host "Other PCs can't reach the app until the firewall allows port $appPort." -ForegroundColor Yellow
        Write-Host "Right-click setup.cmd and choose 'Run as administrator', or run this in an administrator PowerShell:"
        Write-Host "  New-NetFirewallRule -DisplayName `"$ruleName`" -Direction Inbound -Protocol TCP -LocalPort $appPort -Action Allow -Profile Domain,Private"
    }
}

# ───── Backups: into the school OneDrive folder when there is one, every day ─────
Write-Host ""
$oneDriveDir = Get-OneDriveBackupDir
if ($oneDriveDir -and -not $settings['BACKUP_DIR']) {
    # A .env made before backups went to OneDrive (or before OneDrive was signed in) gets the folder added
    if (Add-DotEnvSetting 'BACKUP_DIR' $oneDriveDir) { $settings = Read-DotEnv }
}
$backupDir = Get-BackupDir $settings
if ($backupDir -like "$env:OneDriveCommercial*" -and $env:OneDriveCommercial) {
    Write-Host "Backups go to the school OneDrive folder: $backupDir"
} else {
    Write-Host "Backups go to $backupDir" -ForegroundColor Yellow
    Write-Host "To keep them in the school OneDrive as well, sign in to the OneDrive app with a school account and run setup.cmd again."
}
$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\backup.ps1`""
$taskTrigger = New-ScheduledTaskTrigger -Daily -At $BackupTime
# Runs as this Windows user (OneDrive syncs under this account); a run missed while the PC was off happens at the next chance
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $BackupTaskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Description 'Daily backup of the STI scheduling system database (local\backup.ps1).' -Force | Out-Null
Write-Host ("A backup now runs every day at {0} while {1} is signed in (Task Scheduler: '{2}')." -f ([datetime]$BackupTime).ToString('h:mm tt'), $env:USERNAME, $BackupTaskName)

# ───── Sleep: a sleeping PC can't serve the app ─────
# The current scheme's "sleep after" (plugged in): the second-to-last value powercfg prints is the plugged-in one
$sleepValues = [regex]::Matches((powercfg /query SCHEME_CURRENT 238c9fa8-0aad-41ed-83f4-97be242c8f20 29f6c1db-86da-48c5-9fdb-f2b67b1f44da | Out-String), '0x[0-9a-fA-F]{8}')
$sleepAfterSeconds = if ($sleepValues.Count -ge 2) { [Convert]::ToInt32($sleepValues[$sleepValues.Count - 2].Value, 16) } else { -1 }
Write-Host ""
if ($sleepAfterSeconds -eq 0) {
    Write-Host "This PC never sleeps while plugged in, so the app stays reachable."
} else {
    $answer = Read-Host "This PC goes to sleep when idle, and nobody can open the app while it sleeps. Keep it awake while plugged in? Type Y or N"
    if ($answer -match '^\s*[Yy]') {
        powercfg /change standby-timeout-ac 0
        powercfg /change hibernate-timeout-ac 0
        Write-Host "This PC now stays awake while plugged in (the screen can still turn off)."
    } else {
        Write-Host "Sleep settings left as they are."
    }
}

Write-Host ""
Write-Host "Setup is done. Double-click start.cmd to start the app." -ForegroundColor Green
