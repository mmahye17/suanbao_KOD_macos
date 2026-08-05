# KOD 蒜粒 — 一键启动开发模式
# 固定项目目录：D:\kod

$ErrorActionPreference = 'Stop'
$ProjectRoot = 'D:\kod'
$RendererPort = 1212
$MutexName = 'Global\KOD蒜粒开发启动器'
$LogPath = Join-Path $ProjectRoot '.kod-dev-launcher.log'

if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
  throw "KOD project was not found at $ProjectRoot"
}

Set-Location -LiteralPath $ProjectRoot
$env:NODE_OPTIONS = '--max-old-space-size=4096'
$env:DEV_PORT = "$RendererPort"

$mutex = [System.Threading.Mutex]::new($false, $MutexName)
$hasMutex = $false
try {
  $hasMutex = $mutex.WaitOne(0)
  if (-not $hasMutex) {
    Write-Host 'KOD 开发启动器已经在运行，正在通知现有应用...' -ForegroundColor Yellow
    & pnpm.cmd dev
    exit $LASTEXITCODE
  }

  function Write-LauncherLog([string]$Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    Write-Host $Message
  }

  function Get-KodDevProcesses {
    $all = @(Get-CimInstance Win32_Process)
    $matched = @($all | Where-Object {
      $commandLine = [string]$_.CommandLine
      $executablePath = [string]$_.ExecutablePath
      ($commandLine -like '*D:\kod*' -or $executablePath -like 'D:\kod\*') -and
      ($commandLine -match 'electron-vite(\.cmd|\.js)?\s+dev|pnpm(\.cmd)?\s+dev|electron\.exe\s+\.')
    })
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    $queue = [System.Collections.Generic.Queue[int]]::new()
    foreach ($process in $matched) {
      [void]$ids.Add([int]$process.ProcessId)
      $queue.Enqueue([int]$process.ProcessId)
    }
    while ($queue.Count -gt 0) {
      $parentId = $queue.Dequeue()
      foreach ($child in ($all | Where-Object { [int]$_.ParentProcessId -eq $parentId })) {
        $childCommand = [string]$child.CommandLine
        $childPath = [string]$child.ExecutablePath
        if (($childCommand -like '*D:\kod*' -or $childPath -like 'D:\kod\*') -and $ids.Add([int]$child.ProcessId)) {
          $queue.Enqueue([int]$child.ProcessId)
        }
      }
    }
    $all | Where-Object { $ids.Contains([int]$_.ProcessId) }
  }

  function Test-RendererHealthy {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$RendererPort/" -TimeoutSec 2
      return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
      return $false
    }
  }

  $existing = @(Get-KodDevProcesses)
  if ($existing.Count -gt 0 -and (Test-RendererHealthy)) {
    Write-LauncherLog '检测到正在运行的 KOD 开发实例，正在聚焦窗口...'
    & pnpm.cmd dev
    exit $LASTEXITCODE
  }

  if ($existing.Count -gt 0) {
    Write-LauncherLog '检测到无响应的 KOD 开发进程，正在清理本项目进程树...'
    $rootIds = @($existing | Where-Object { $_.ParentProcessId -eq 0 -or $_.Name -match 'pnpm|node' } | Select-Object -ExpandProperty ProcessId)
    foreach ($process in $existing) {
      if ($rootIds -contains $process.ParentProcessId) {
        $rootIds += $process.ProcessId
      }
    }
    foreach ($processId in ($rootIds | Select-Object -Unique)) {
      & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
    }
    Start-Sleep -Seconds 2
  }

  Write-LauncherLog '启动 KOD 开发模式...'
  & pnpm.cmd dev
  exit $LASTEXITCODE
} finally {
  if ($hasMutex) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
