$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$desktop = [Environment]::GetFolderPath('Desktop')
$wsh = New-Object -ComObject WScript.Shell

function New-Shortcut($Name, $Target, $WorkingDir, $Description) {
    $path = Join-Path $desktop $Name
    $s = $wsh.CreateShortcut($path)
    $s.TargetPath = $Target
    $s.WorkingDirectory = $WorkingDir
    $s.Description = $Description
    $s.WindowStyle = 1
    $s.Save()
    Write-Host "OK: $path"
}

$startBat = Join-Path $PSScriptRoot 'start-app.bat'
$stopBat = Join-Path $PSScriptRoot 'stop-app.bat'

New-Shortcut 'Start Order Management.lnk' $startBat $PSScriptRoot 'Start order management app'
New-Shortcut 'Stop Order Management.lnk' $stopBat $PSScriptRoot 'Stop Docker services'

Write-Host "Desktop shortcuts created."
