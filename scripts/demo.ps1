param(
  [int]$Port = 3075
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Base = "http://127.0.0.1:$Port"
$ManifestUrl = "$Base/portal"
$LogPath = Join-Path $env:TEMP "trending-demo.ps1.out.log"
$ErrPath = Join-Path $env:TEMP "trending-demo.ps1.err.log"

$cmd = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $cmd) {
  $cmd = Get-Command pnpm -ErrorAction Stop
}
$Pnpm = $cmd.Source

$Server = $null
$Started = Get-Date

function Section([string]$Text) {
  Write-Host ""
  Write-Host "== $Text ==" -ForegroundColor White
}

function Ok([string]$Text) {
  Write-Host ("  OK  " + $Text) -ForegroundColor Green
}

function Fail([string]$Text) {
  Write-Host ("  FAIL " + $Text) -ForegroundColor Red
  throw $Text
}

function Invoke-Pnpm([string[]]$ArgsList) {
  & $Pnpm @ArgsList
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm command failed: $($ArgsList -join ' ')"
  }
}

function Stop-Server {
  if ($script:Server -and -not $script:Server.HasExited) {
    Stop-Process -Id $script:Server.Id -Force -ErrorAction SilentlyContinue
    $script:Server.WaitForExit(3000) | Out-Null
  }

  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($proc -and $proc.CommandLine -like "*visitportal.dev*") {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  Set-Location $RepoRoot

  Section "1. Start trending-demo on port $Port"
  $oldPort = $env:PORT
  $env:PORT = [string]$Port
  $Server = Start-Process `
    -FilePath $Pnpm `
    -ArgumentList @("--filter", "trending-demo", "start") `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $LogPath `
    -RedirectStandardError $ErrPath `
    -WindowStyle Hidden `
    -PassThru
  $env:PORT = $oldPort
  Ok "pid=$($Server.Id) stdout=$LogPath stderr=$ErrPath"

  Section "2. Wait for /healthz (10s timeout)"
  $ready = $false
  for ($i = 0; $i -le 50; $i++) {
    try {
      $res = Invoke-WebRequest -UseBasicParsing -Uri "$Base/healthz" -TimeoutSec 2
      if ($res.StatusCode -eq 200) {
        Ok "healthz 200 after $($i)x200ms"
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 200
    }
  }
  if (-not $ready) {
    Write-Host "--- stdout ---"
    if (Test-Path $LogPath) { Get-Content $LogPath }
    Write-Host "--- stderr ---"
    if (Test-Path $ErrPath) { Get-Content $ErrPath }
    Fail "healthz never returned 200 within 10s"
  }

  Section "3. visit-portal info $ManifestUrl"
  $t0 = Get-Date
  Invoke-Pnpm @("--filter", "@visitportal/cli", "exec", "tsx", "src/cli.ts", "info", $ManifestUrl)
  Ok "info done in $([int]((Get-Date) - $t0).TotalSeconds)s"

  Section "4. visit-portal call top_gainers --params '{`"limit`":3}'"
  $t0 = Get-Date
  Invoke-Pnpm @(
    "--filter", "@visitportal/cli", "exec", "tsx", "src/cli.ts",
    "call", $ManifestUrl, "top_gainers", "--params", '{\"limit\":3}', "--json"
  )
  Ok "call done in $([int]((Get-Date) - $t0).TotalSeconds)s"

  Section "5. visit-portal conformance"
  $t0 = Get-Date
  Invoke-Pnpm @("--filter", "@visitportal/cli", "exec", "tsx", "src/cli.ts", "conformance", $ManifestUrl)
  Ok "conformance done in $([int]((Get-Date) - $t0).TotalSeconds)s"

  Section "6. pnpm conformance (live)"
  $t0 = Get-Date
  Invoke-Pnpm @("conformance", $ManifestUrl)
  Ok "live conformance done in $([int]((Get-Date) - $t0).TotalSeconds)s"

  $elapsed = [int]((Get-Date) - $Started).TotalSeconds
  Write-Host ""
  Write-Host "DEMO COMPLETE - ${elapsed}s total - all checks passed" -ForegroundColor White
} finally {
  Stop-Server
}
