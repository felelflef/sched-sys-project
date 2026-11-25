# Starts the scheduling system on this PC so others on the school network can open it in a browser.
. "$PSScriptRoot\common.ps1"

$settings = Read-DotEnv
$phpDir = Find-Php
$apacheRoot = Find-ApacheRoot
$httpd = Join-Path $apacheRoot 'bin\httpd.exe'
$port = if ($settings['APP_PORT']) { [int]$settings['APP_PORT'] } else { 8080 }
New-Item -ItemType Directory -Force $RunDir | Out-Null
$pidFile = Join-Path $RunDir 'httpd.pid'

function Show-Addresses {
    Write-Host ""
    Write-Host "Open the app at:" -ForegroundColor Green
    Write-Host "  On this PC:          http://localhost:$port"
    # The PC's name keeps working when its network address changes (if the network allows name lookups)
    Write-Host "  By this PC's name:     http://$($env:COMPUTERNAME.ToLower()):$port"
    foreach ($ip in Get-LanAddresses) { Write-Host "  On the school network: http://${ip}:$port" }
}

if (Test-Path $pidFile) {
    # A process file copied from another PC (or left by a crash) can name an unrelated program, so the name must match
    $running = Get-Process -Id ([int](Get-Content $pidFile -Raw)) -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq 'httpd' }
    if ($running) {
        Write-Host "The app is already running."
        Show-Addresses
        exit 0
    }
    Remove-Item $pidFile
}
if (Test-Port '127.0.0.1' $port) { Stop-WithMessage "Another program is already using port $port. Close it, or change APP_PORT in .env." }
if (-not (Test-Port $settings['DB_HOST'] ([int]$settings['DB_PORT']))) {
    Stop-WithMessage "PostgreSQL isn't answering at $($settings['DB_HOST']):$($settings['DB_PORT']). Start the PostgreSQL service (Windows Services) and try again."
}

# Apache's settings and PHP's, written fresh each start from this PC's folders (Apache wants forward slashes)
$slash = { param($path) $path -replace '\\', '/' }
$conf = Get-Content (Join-Path $PSScriptRoot 'httpd.conf.template') -Raw
$conf = $conf.Replace('{{APACHE_ROOT}}', (& $slash $apacheRoot)).Replace('{{PHP_DIR}}', (& $slash $phpDir))
$conf = $conf.Replace('{{APP_DIR}}', (& $slash $AppDir)).Replace('{{RUN_DIR}}', (& $slash $RunDir)).Replace('{{PORT}}', "$port")
$confFile = Join-Path $RunDir 'httpd.conf'
$noBom = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText($confFile, $conf, $noBom)
$phpIni = @"
extension_dir="$(& $slash $phpDir)/ext"
extension=pdo_pgsql
extension=mbstring
extension=openssl
extension=curl
display_errors=Off
log_errors=On
error_log="$(& $slash $RunDir)/php-error.log"
expose_php=Off
; OPcache (built into PHP) keeps compiled code in memory; files are re-checked every 2 seconds so updates apply
opcache.enable=1
opcache.memory_consumption=128
opcache.validate_timestamps=1
opcache.revalidate_freq=2
"@
[IO.File]::WriteAllText((Join-Path $RunDir 'php.ini'), $phpIni, $noBom)

# Apache passes these settings on to the app; PHP's folder holds the libraries its PostgreSQL driver needs
foreach ($key in $settings.Keys) { Set-Item "Env:$key" $settings[$key] }
$env:PATH = "$phpDir;$env:PATH"

# Apache reports on its error stream even when all is well, so only its exit code counts
$ErrorActionPreference = 'Continue'
$check = & $httpd -t -f $confFile 2>&1 | Out-String
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Apache's settings have a problem: $check" }
Start-Process -FilePath $httpd -ArgumentList '-f', "`"$confFile`"" -WindowStyle Hidden

for ($i = 0; $i -lt 30 -and -not (Test-Port '127.0.0.1' $port); $i++) { Start-Sleep -Milliseconds 500 }
try {
    $reply = Invoke-WebRequest "http://127.0.0.1:$port/api/auth.php?check=1" -UseBasicParsing -TimeoutSec 15
    if ($reply.Content -notmatch '"success":true') { throw "unexpected reply" }
} catch {
    Stop-WithMessage "Apache started but the app didn't answer properly. See $RunDir\apache-error.log and $RunDir\php-error.log, then run stop.cmd."
}
Write-Host "The app is running." -ForegroundColor Green
if (-not $settings['GEMINI_API_KEY']) { Write-Host "The AI Assistant is off: add GEMINI_API_KEY to .env, then run stop.cmd and start.cmd." -ForegroundColor Yellow }
Show-Addresses
Write-Host ""
Write-Host "It keeps running after this window closes. Use stop.cmd to stop it."
