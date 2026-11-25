# Saves a copy of the whole database to the backup folder (BACKUP_DIR in .env, such as the school OneDrive folder,
# or local\backups), keeping the 30 newest copies. setup.ps1 schedules it to run daily; each run is noted in
# local\run\backup-history.log.
. "$PSScriptRoot\common.ps1"

function Write-History([string]$Line) {
    New-Item -ItemType Directory -Force $RunDir | Out-Null
    Add-Content -Path (Join-Path $RunDir 'backup-history.log') -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $Line)
}

$settings = Read-DotEnv
$pgBin = Find-PgBin $settings['PG_BIN']
$backupDir = Get-BackupDir $settings
New-Item -ItemType Directory -Force $backupDir | Out-Null
$file = Join-Path $backupDir ("sti-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

$env:PGPASSWORD = $settings['DB_PASS']
try {
    & (Join-Path $pgBin 'pg_dump.exe') -h $settings['DB_HOST'] -p $settings['DB_PORT'] -U $settings['DB_USER'] -d $settings['DB_NAME'] -Fc -f $file
    $dumpExit = $LASTEXITCODE
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
if ($dumpExit -ne 0) {
    Remove-Item $file -ErrorAction SilentlyContinue
    Write-History "FAILED (pg_dump exit code $dumpExit)"
    Stop-WithMessage "The backup failed (see the message above). Is PostgreSQL running?"
}

Get-ChildItem $backupDir -Filter 'sti-*.dump' | Sort-Object Name -Descending | Select-Object -Skip 30 | Remove-Item
$sizeKb = [math]::Round((Get-Item $file).Length / 1KB)
Write-History "OK  $file ($sizeKb KB)"
Write-Host "Backup saved: $file ($sizeKb KB)" -ForegroundColor Green
Write-Host ""
Write-Host "To restore it later (replaces the current data): stop the app, then run this; when it asks for a password, use DB_PASS from .env"
Write-Host "  `"$(Join-Path $pgBin 'pg_restore.exe')`" --clean --if-exists -h $($settings['DB_HOST']) -p $($settings['DB_PORT']) -U $($settings['DB_USER']) -d $($settings['DB_NAME']) `"$file`""
