# Manual full backup (Windows) — same content as in-app backup button.
# Requires Docker containers running (docker compose up -d).

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackupRoot = Join-Path $ProjectRoot "backups"
$Now = Get-Date
$SessionFolder = $Now.ToString("ddMMyy-HH mm")
$BackupDir = Join-Path $BackupRoot $SessionFolder
$Timestamp = $Now.ToString("yyyy-MM-dd_HHmmss")
$ArchiveName = "OrderManagement_manual_$Timestamp.zip"
$WorkDir = Join-Path $env:TEMP "ordermgmt-backup-$Timestamp"

New-Item -ItemType Directory -Force -Path $BackupDir, $WorkDir | Out-Null

Write-Host "Dumping database..."
docker exec ordermgmt-db pg_dump -U ordermgmt --no-owner --no-acl ordermgmt | Out-File -Encoding utf8 (Join-Path $WorkDir "database.sql")

Write-Host "Copying uploads volume..."
docker run --rm `
  -v ordermgmt_uploads:/src:ro `
  -v "${WorkDir}/uploads:/dest" `
  alpine sh -c "mkdir -p /dest && cp -a /src/. /dest/"

$Readme = @"
Ручная резервная копия от $Timestamp.
Для восстановления откройте ZIP из программы (Настройки → Настройка программы)
или следуйте файлу KAK_VOSSTANOVIT.txt в архиве, созданном через интерфейс.
"@
Set-Content -Path (Join-Path $WorkDir "README.txt") -Value $Readme -Encoding UTF8

$ZipPath = Join-Path $BackupDir $ArchiveName
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $WorkDir "*") -DestinationPath $ZipPath

Remove-Item -Recurse -Force $WorkDir
Write-Host "Done: $ZipPath"
