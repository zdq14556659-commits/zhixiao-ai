param(
  [string]$DataFile = "",
  [string]$BackupDir = ""
)

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $DataFile) {
  $DataFile = Join-Path $Root "backend\data\db.json"
}
if (-not $BackupDir) {
  $BackupDir = Join-Path $Root "backend\data\manual-backups"
}

if (-not (Test-Path -LiteralPath $DataFile)) {
  throw "db file not found: $DataFile"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $BackupDir "db-before-push-$stamp.json"
Copy-Item -LiteralPath $DataFile -Destination $target -Force

Write-Output "DB_BACKUP_PATH=$target"
