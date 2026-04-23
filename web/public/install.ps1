# visit-portal installer (PowerShell 5+). Windows.
# No admin elevation. No silent env mutation. No silent network calls. Confirms before acting.
# Non-interactive host requires $env:VISITPORTAL_ASSUME_YES = '1'.
#
# Release pinning: $RepoRef and $RepoTarballSha256 must be updated each release.
# Helper: scripts/compute-install-sha.sh v0.1.6 prints both values to paste here.

[CmdletBinding()]
param(
  [switch]$Uninstall,
  [string]$FromLocal = "",
  [switch]$DryRun,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Version           = '0.1.6'
$RepoUrl           = 'https://github.com/0motionguy/portal'
$RepoRef           = 'v0.1.6'
$RepoTarballSha256 = '4532322463d8e3f1d06dcb4c2c5a8da7e8c9c3fae3c1f5f2d68162bb17842acf'
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
  try {
    $ans = Read-Host 'continue? [y/N]'
  } catch {
    Die 'non-interactive host (Read-Host unavailable). Set $env:VISITPORTAL_ASSUME_YES = "1" to proceed.'
  }
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

# Preflight deps. Install path downloads a tarball and verifies its SHA256
# against $RepoTarballSha256 before extracting — so git is NOT required.
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
    Die "no packages\cli at $FromLocal -- not a Portal checkout."
  }
  Say "copying $FromLocal -> $RepoDir (excluding node_modules)"
  if (-not (Test-Path $RepoDir)) { New-Item -ItemType Directory -Force -Path $RepoDir | Out-Null }
  # Robocopy mirrors directories fast and honors excludes. Exit code <8 = success.
  $rc = Start-Process -FilePath 'robocopy' `
    -ArgumentList @($FromLocal, $RepoDir, '/MIR', '/XD', 'node_modules', '.git', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') `
    -NoNewWindow -Wait -PassThru
  if ($rc.ExitCode -ge 8) { Die "robocopy failed with exit code $($rc.ExitCode)" }
} else {
  # Download the pinned tarball, verify SHA256, then extract. No git fallback —
  # the pin is the security boundary.
  if ([string]::IsNullOrEmpty($RepoTarballSha256)) {
    Die "`$RepoTarballSha256 is empty -- refusing to install unverified tarball. Check $RepoUrl/releases/tag/$RepoRef."
  }
  $tarballUrl  = "$RepoUrl/archive/refs/tags/$RepoRef.tar.gz"
  $tarballFile = Join-Path $InstallDir 'repo.tar.gz'
  Say "will fetch: $tarballUrl"
  Invoke-WebRequest -Uri $tarballUrl -OutFile $tarballFile -UseBasicParsing
  $actualSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $tarballFile).Hash.ToLower()
  if ($actualSha -ne $RepoTarballSha256.ToLower()) {
    Die "tarball SHA256 mismatch. Expected $RepoTarballSha256, got $actualSha."
  }
  Say "tarball SHA256 verified: $actualSha"
  # Fresh repo dir so a previously-installed version can't leak.
  if (Test-Path $RepoDir) { Remove-Item -Recurse -Force -LiteralPath $RepoDir }
  New-Item -ItemType Directory -Force -Path $RepoDir | Out-Null
  # tar is built into Windows 10+ (bsdtar). Use --strip-components=1 to drop
  # the top-level 'portal-<sha>' directory the GitHub tarball wraps around.
  Run @('tar', '-xzf', $tarballFile, '-C', $RepoDir, '--strip-components=1')
  Remove-Item -Force -LiteralPath $tarballFile
}

Say 'installing dependencies (pnpm install --frozen-lockfile)'
Push-Location $RepoDir
try {
  & pnpm install --frozen-lockfile 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Die 'pnpm install --frozen-lockfile failed.' }
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
