# visit-portal installer (PowerShell 5+). Windows.
#
# WHAT THIS DOES:
#   1. Clones (or copies) the Portal monorepo to $env:USERPROFILE\.visitportal
#   2. Writes a visit-portal.cmd shim that runs the CLI via pnpm + tsx
#   3. Prints the PATH line you should add manually (user env, not machine)
#
# WHAT THIS DOES *NOT* DO:
#   - No admin elevation. Writes only to your user profile.
#   - No silent env mutation. We print the PATH line; you copy it yourself.
#   - No silent network calls. Every URL is echoed before fetch.
#   - No blind pipe. If the host is non-interactive, set
#     $env:VISITPORTAL_ASSUME_YES = '1' to proceed.
#
# TODO(hackathon): Replace $RepoUrl once the repo is pushed to GitHub.
# TODO(hackathon): Pin a release tag + SHA256 once v0.1.0 is cut.

[CmdletBinding()]
param(
  [switch]$Uninstall,
  [string]$FromLocal = "",
  [switch]$DryRun,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Version    = '0.1.0'
$RepoUrl    = 'https://github.com/visitportal/portal'     # TODO: real URL post-push
$RepoRef    = 'main'                                       # TODO: pin to tag v0.1.0
$InstallDir = if ($env:VISITPORTAL_HOME) { $env:VISITPORTAL_HOME } else { Join-Path $env:USERPROFILE '.visitportal' }
$BinDir     = Join-Path $InstallDir 'bin'
$Shim       = Join-Path $BinDir 'visit-portal.cmd'

function Say  { param($m) Write-Host $m }
function Warn { param($m) Write-Host "warn: $m" -ForegroundColor Yellow }
function Die  { param($m) Write-Host "error: $m" -ForegroundColor Red; exit 1 }
function Have { param($n) $null -ne (Get-Command $n -ErrorAction SilentlyContinue) }
function Run  { param([string[]]$cmd) Say "  > $($cmd -join ' ')"; & $cmd[0] @($cmd | Select-Object -Skip 1); if ($LASTEXITCODE -ne 0) { Die "command failed: $($cmd -join ' ')" } }

if ($Help) {
  @"
visit-portal installer v$Version

USAGE:
  powershell -ExecutionPolicy Bypass -File install.ps1
  powershell -ExecutionPolicy Bypass -File install.ps1 -FromLocal C:\path\to\repo
  powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall
  powershell -ExecutionPolicy Bypass -File install.ps1 -DryRun

ENV:
  VISITPORTAL_HOME        override install dir (default $env:USERPROFILE\.visitportal)
  VISITPORTAL_ASSUME_YES  set to 1 to skip y/N prompt (required for non-interactive hosts)
"@ | Write-Host
  exit 0
}

# Refuse admin. We want this to be a strictly user-level install.
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Die "do not run this in an elevated / admin shell. Installer writes only to your user profile."
}

# Plan
Say ''
Say "visit-portal installer v$Version"
Say "  install dir:  $InstallDir"
Say "  shim target:  $Shim"
if ($Uninstall) {
  Say "  mode:         UNINSTALL (will remove $InstallDir)"
} elseif ($FromLocal -ne '') {
  Say "  mode:         install from local path: $FromLocal"
} else {
  Say "  mode:         clone from $RepoUrl @ $RepoRef"
}
if ($DryRun) { Say "  dry-run:      yes (no changes will be written)" }
Say ''

# Confirm
function Confirm-Plan {
  if ($env:VISITPORTAL_ASSUME_YES -eq '1') {
    Say 'VISITPORTAL_ASSUME_YES=1 set; proceeding without prompt.'
    return
  }
  if (-not [Environment]::UserInteractive -or $Host.Name -eq 'ServerRemoteHost') {
    Die 'non-interactive host. Set $env:VISITPORTAL_ASSUME_YES = "1" to proceed.'
  }
  $ans = Read-Host 'continue? [y/N]'
  if ($ans -notmatch '^(y|Y|yes|YES)$') { Die 'aborted by user.' }
}
Confirm-Plan

# Uninstall
if ($Uninstall) {
  if (-not (Test-Path $InstallDir)) { Say "nothing to remove at $InstallDir"; exit 0 }
  if ($DryRun) { Say "would run: Remove-Item -Recurse -Force $InstallDir"; exit 0 }
  Say "  > Remove-Item -Recurse -Force $InstallDir"
  Remove-Item -Recurse -Force -LiteralPath $InstallDir
  Say "removed $InstallDir"
  Say "reminder: if you added $BinDir to your user PATH manually, remove that entry too."
  exit 0
}

# Preflight deps
if (-not (Have 'git'))  { Die 'git is required but not installed.' }
if (-not (Have 'pnpm')) { Die 'pnpm is required (npm install -g pnpm@10).' }
if (-not (Have 'node')) { Die 'node >=22 is required.' }

if ($DryRun) {
  Say "dry-run: would create $InstallDir and write shim to $Shim"
  exit 0
}

# Install
if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Force -Path $BinDir | Out-Null }
$RepoDir = Join-Path $InstallDir 'repo'

if ($FromLocal -ne '') {
  if (-not (Test-Path (Join-Path $FromLocal 'packages\cli'))) {
    Die "no packages\cli at $FromLocal — not a Portal checkout."
  }
  Say "copying $FromLocal -> $RepoDir (excluding node_modules)"
  if (-not (Test-Path $RepoDir)) { New-Item -ItemType Directory -Force -Path $RepoDir | Out-Null }
  # Robocopy mirrors directories fast and honors excludes. Exit code <8 = success.
  $rc = Start-Process -FilePath 'robocopy' `
    -ArgumentList @($FromLocal, $RepoDir, '/MIR', '/XD', 'node_modules', '.git', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') `
    -NoNewWindow -Wait -PassThru
  if ($rc.ExitCode -ge 8) { Die "robocopy failed with exit code $($rc.ExitCode)" }
} else {
  Say "will fetch: $RepoUrl (ref: $RepoRef)"
  if (Test-Path (Join-Path $RepoDir '.git')) {
    Say 'existing checkout found; updating.'
    Run @('git', '-C', $RepoDir, 'fetch', '--depth', '1', 'origin', $RepoRef)
    Run @('git', '-C', $RepoDir, 'checkout', '-q', $RepoRef)
    Run @('git', '-C', $RepoDir, 'reset', '--hard', "origin/$RepoRef")
  } else {
    Run @('git', 'clone', '--depth', '1', '--branch', $RepoRef, $RepoUrl, $RepoDir)
  }
}

Say 'installing dependencies (pnpm install --frozen-lockfile || pnpm install)'
Push-Location $RepoDir
try {
  & pnpm install --frozen-lockfile 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    & pnpm install 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Die 'pnpm install failed.' }
  }
} finally { Pop-Location }

# Shim: .cmd wrapper that forwards to pnpm+tsx
$shimBody = @'
@echo off
setlocal
if not defined VISITPORTAL_HOME set "VISITPORTAL_HOME=%USERPROFILE%\.visitportal"
set "REPO=%VISITPORTAL_HOME%\repo"
if not exist "%REPO%" (
  echo visit-portal: repo missing at %REPO%; reinstall. 1>&2
  exit /b 1
)
pnpm --silent --dir "%REPO%" --filter @visitportal/cli exec tsx src/cli.ts %*
'@
Set-Content -LiteralPath $Shim -Value $shimBody -Encoding ASCII

Say ''
Say 'installed.'
Say "  cli:        $Shim"
Say "  source:     $RepoDir"
Say ''
Say 'add this directory to your *user* PATH to run visit-portal from anywhere:'
Say "    $BinDir"
Say ''
Say '  (GUI: System Properties -> Environment Variables -> User variables -> Path -> Edit)'
Say '  (or run [Environment]::SetEnvironmentVariable with scope User to add it from PowerShell)'
Say ''
Say 'try it:'
Say ('    ' + $Shim + ' --help')
Say ''
Say 'uninstall any time: powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall'
