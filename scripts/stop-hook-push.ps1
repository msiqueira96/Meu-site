$ErrorActionPreference = 'SilentlyContinue'
$env:PATH = "C:\Program Files\Git\cmd;C:\Program Files\Git\bin;C:\Program Files\Git\ucrt64\bin;$env:LOCALAPPDATA\Programs\Git\cmd;" + $env:PATH
$root = 'c:\Users\positivo\Documents\landonorris.com'
Set-Location $root

$gitExe = 'C:\Program Files\Git\cmd\git.exe'
if (-not (Test-Path $gitExe)) { $gitExe = "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe" }

if ((Test-Path $gitExe) -and (Test-Path (Join-Path $root '.git'))) {
  & $gitExe add -A *> $null
  $status = & $gitExe status --porcelain
  if (-not [string]::IsNullOrWhiteSpace($status)) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    & $gitExe commit -m "auto: update from Antigravity chat ($ts)" *> $null
    & $gitExe push origin HEAD --force-with-lease *> $null
  }
}

Write-Output '{"decision":"allow"}'
