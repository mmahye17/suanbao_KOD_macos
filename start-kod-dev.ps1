# KOD 蒜粒 — 一键启动开发模式
# 快捷键：右键此文件 → 发送到桌面快捷方式

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       KOD 蒜粒 客户端 — 开发模式          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  内存限制：4GB | 源码映射：关闭 | 分析工具：跳过" -ForegroundColor DarkGray
Write-Host ""

Set-Location D:\kod

$env:NODE_OPTIONS = "--max-old-space-size=4096"

pnpm dev

Write-Host ""
Write-Host "KOD 已退出。按任意键关闭..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
