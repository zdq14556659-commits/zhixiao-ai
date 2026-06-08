$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
if (-not $env:AMAP_KEY) {
  Write-Host "提示：未配置 AMAP_KEY，地推定位地址解析会先返回空地址。"
}
if (-not $env:DEEPSEEK_API_KEY) {
  Write-Host "提示：未配置 DEEPSEEK_API_KEY，小智会先使用知识库本地策略。"
}
node backend/server.js
