$scriptsDir = $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$wsh = New-Object -ComObject WScript.Shell

# Remove ALL old shortcuts pointing to our scripts (any garbled names)
Get-ChildItem -Path $desktop -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $sc = $wsh.CreateShortcut($_.FullName)
        $t = $sc.TargetPath
        if ($t -like '*\scripts\start-app.bat' -or $t -like '*\scripts\stop-app.bat') {
            Remove-Item $_.FullName -Force
            Write-Output "Removed: $($_.Name)"
        }
    } catch {}
}

function New-AppShortcut($fileName, $batName, $comment) {
    $path = Join-Path $desktop $fileName
    $s = $wsh.CreateShortcut($path)
    $s.TargetPath = Join-Path $scriptsDir $batName
    $s.WorkingDirectory = $scriptsDir
    $s.Description = $comment
    $s.WindowStyle = 1
    $s.Save()
    Write-Output "Created: $fileName"
}

New-AppShortcut 'Zapusk - Uchet zakazov.lnk' 'start-app.bat' 'Zapusk: Docker, API, veb v brauzere'
New-AppShortcut 'Ostanovit - Uchet zakazov.lnk' 'stop-app.bat' 'Ostanovka Docker'

Write-Output 'OK'
