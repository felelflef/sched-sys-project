# Stops the scheduling system started by start.ps1.
. "$PSScriptRoot\common.ps1"

$pidFile = Join-Path $RunDir 'httpd.pid'
$apacheRoot = Find-ApacheRoot
$httpd = (Join-Path $apacheRoot 'bin\httpd.exe')

# Apache runs as a main process and a worker it started; both are stopped
$targets = @()
if (Test-Path $pidFile) {
    $mainId = [int](Get-Content $pidFile -Raw)
    $targets += Get-CimInstance Win32_Process -Filter "ProcessId = $mainId OR ParentProcessId = $mainId" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq 'httpd.exe' }
}
if (-not $targets) {
    $targets = Get-CimInstance Win32_Process -Filter "Name = 'httpd.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $httpd -and $_.CommandLine -like "*$RunDir*" }
}
if (-not $targets) {
    Write-Host "The app isn't running."
} else {
    $targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host "The app has stopped." -ForegroundColor Green
}
# The log rotators Apache started for this copy (their command line names this copy's run folder)
$runDirSlashes = $RunDir -replace '\\', '/'
Get-CimInstance Win32_Process -Filter "Name = 'rotatelogs.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$runDirSlashes*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item $pidFile -ErrorAction SilentlyContinue
