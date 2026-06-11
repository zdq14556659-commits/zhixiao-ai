param(
  [Parameter(Mandatory = $true)]
  [string]$Server,

  [string]$User = "root",
  [string]$Domain = "_",
  [string]$KeyPath = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Archive = Join-Path $env:TEMP "zhixiao-ai-$Timestamp.tar.gz"
$RemoteDir = "/tmp/zhixiao-deploy"
$RemoteArchive = "/tmp/zhixiao-ai-$Timestamp.tar.gz"
$Target = "$User@$Server"
$SshArgs = @()

if ($KeyPath) {
  $ResolvedKey = (Resolve-Path $KeyPath).Path
  $SshArgs += @("-i", $ResolvedKey)
}

Push-Location $ProjectRoot
try {
  tar -czf $Archive `
    --exclude=.git `
    --exclude=node_modules `
    --exclude=backend/data/db.json `
    --exclude=backend/data/db.backup.json `
    --exclude=backend/uploads `
    --exclude=miniprogram/project.private.config.json `
    --exclude=.env `
    .

  & ssh @SshArgs $Target "mkdir -p $RemoteDir"
  & scp @SshArgs "$PSScriptRoot/bootstrap.sh" "$PSScriptRoot/release.sh" "$PSScriptRoot/backup.sh" "$PSScriptRoot/enable-https.sh" "$PSScriptRoot/zhixiao-ai.service" "$PSScriptRoot/nginx.conf" "${Target}:$RemoteDir/"
  & scp @SshArgs $Archive "${Target}:$RemoteArchive"
  & ssh @SshArgs $Target "chmod +x $RemoteDir/*.sh && bash $RemoteDir/bootstrap.sh '$Domain' && /usr/local/sbin/zhixiao-release '$RemoteArchive'"

  Write-Host "Deployment complete." -ForegroundColor Green
  if ($Domain -eq "_") {
    Write-Host "Open: http://$Server"
  } else {
    Write-Host "Open: http://$Domain"
    Write-Host "After DNS resolves, enable HTTPS with:"
    Write-Host "ssh $Target sudo $RemoteDir/enable-https.sh $Domain YOUR_EMAIL"
  }
}
finally {
  Pop-Location
  Remove-Item -LiteralPath $Archive -Force -ErrorAction SilentlyContinue
}
