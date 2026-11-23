param(
  [string]$CommitMessage = "chore: update portfolio from Antigravity chat"
)

$ErrorActionPreference = 'Stop'
$env:PATH = "C:\Program Files\Git\cmd;C:\Program Files\Git\bin;C:\Program Files\Git\ucrt64\bin;$env:LOCALAPPDATA\Programs\Git\cmd;" + $env:PATH
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Locate git.exe even if not yet refreshed in current shell PATH
$gitExe = $null
if (Get-Command git -ErrorAction SilentlyContinue) {
  $gitExe = (Get-Command git).Source
} else {
  $candidates = @(
    'C:\Program Files\Git\cmd\git.exe',
    'C:\Program Files\Git\bin\git.exe',
    'C:\Program Files (x86)\Git\cmd\git.exe',
    "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { $gitExe = $c; break }
  }
}

if (-not $gitExe) {
  Write-Output "WARN: Git ainda nao esta instalado nesta maquina. Instale com: winget install --id Git.Git -e"
  exit 0
}

if (-not (Test-Path (Join-Path $root '.git'))) {
  Write-Output "WARN: Pasta .git ainda nao inicializada em $root."
  exit 0
}

& $gitExe add -A
$status = & $gitExe status --porcelain
if (-not [string]::IsNullOrWhiteSpace($status)) {
  & $gitExe commit -m $CommitMessage
  & $gitExe push origin HEAD
  Write-Output "Auto-push concluido com sucesso!"
} else {
  Write-Output "Nenhuma alteracao pendente para push."
}
