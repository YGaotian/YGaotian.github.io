# 一键部署脚本 (PowerShell)
# 使用方法: .\deploy.ps1 "提交信息"

param(
    [string]$CommitMessage = "Update site content"
)

Write-Host "正在重新生成 site.config.json..." -ForegroundColor Cyan
node build.js

if ($LASTEXITCODE -ne 0) {
    Write-Host "build.js 执行失败！" -ForegroundColor Red
    exit 1
}

Write-Host "`n提交更改..." -ForegroundColor Cyan
git add .
git commit -m $CommitMessage

Write-Host "`n推送到 GitHub..." -ForegroundColor Cyan
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n部署完成！网站将在 1-2 分钟内更新。" -ForegroundColor Green
} else {
    Write-Host "`n推送失败，请检查网络或 git 配置。" -ForegroundColor Red
}
