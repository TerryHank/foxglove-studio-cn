#Requires -Version 5.1
param(
    [ValidatePattern("^(0?[1-9]|1[0-9]|2[0-7])$")]
    [string]$Item = "03",
    [switch]$Run,
    [switch]$WithEkf,
    [string]$MapYaml
)
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $OutputEncoding
[Console]::OutputEncoding = $OutputEncoding
$number = $Item.PadLeft(2, "0")
if ($WithEkf -and $number -ne '03') { throw '-WithEkf is supported only for IMU example 03' }
if ($MapYaml -and ($number -ne '10' -or $MapYaml -notmatch '^/home/sunrise/luka_data/maps/[A-Za-z0-9_/.-]+\.yaml$')) {
    throw '-MapYaml requires item10 and a YAML path within /home/sunrise/luka_data/maps/'
}
$hostName = "sunrise@192.168.3.150"
$state = Join-Path $env:LOCALAPPDATA "luka-contract-demo"
$controlPath = Join-Path $env:APPDATA "foxglove-studio-cn/demo-control.json"
New-Item -ItemType Directory -Force -Path $state | Out-Null
function Get-Control {
    if (Test-Path -LiteralPath $controlPath) {
        try {
            $cfg = Get-Content -LiteralPath $controlPath -Raw | ConvertFrom-Json
            $null = Invoke-RestMethod -Uri "$($cfg.url)/status" -Headers @{Authorization="Bearer $($cfg.token)"} -TimeoutSec 2
            return $cfg
        } catch { }
    }
    return $null
}
$control = Get-Control
if (-not $control) {
    . (Join-Path $PSScriptRoot 'resolve_desktop.ps1')
    $exe = Find-CNDesktopExecutable
    $desktopLogs = @{
        FilePath=$exe; ArgumentList='--demo-control'; WindowStyle='Hidden'; PassThru=$true
        RedirectStandardError=(Join-Path $state 'cn-desktop-error.log')
        RedirectStandardOutput=(Join-Path $state 'cn-desktop-output.log')
    }
    $desktop = Start-Process @desktopLogs
    for ($i=0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        $control = Get-Control
        if ($control) { break }
    }
    if (-not $control) {
        throw "CN visualization API did not become ready; inspect $state\cn-desktop-error.log"
    }
}
# mode 0600 is insufficient on Windows; restrict the local token file's ACL.

$principal="*"+[Security.Principal.WindowsIdentity]::GetCurrent().User.Value+":(F)"
& icacls $controlPath /inheritance:r /grant:r $principal | Out-Null
if($LASTEXITCODE -ne 0){throw "Cannot restrict the local visualization token file"}
$tunnelPath=Join-Path $state "cn-tunnel.json"
$tunnel=$null
if(Test-Path -LiteralPath $tunnelPath) {
    $record=Get-Content -LiteralPath $tunnelPath -Raw | ConvertFrom-Json
    $candidate=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
    if($candidate -and $candidate.ProcessName -eq 'ssh' -and
       $candidate.StartTime.ToUniversalTime().Ticks.ToString() -eq $record.startTicks) { $tunnel=$candidate }
}
if (-not $tunnel) {
    # A concurrent/failed launch may leave a stale PID record while the original tunnel is alive.
    $matches = @(Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" | Where-Object {
        $_.CommandLine -like '*127.0.0.1:17334:127.0.0.1:7334*' -and
        $_.CommandLine -like "*$hostName*"
    })
    if ($matches.Count -eq 1) { $tunnel = Get-Process -Id $matches[0].ProcessId }
    if ($matches.Count -gt 1) { throw 'Multiple matching UI tunnels found; inspect them before starting another' }
}
if(-not $tunnel) {
    $startup=@{
        FilePath=(Get-Command ssh).Source; WindowStyle='Hidden'; PassThru=$true
        ArgumentList=@('-NT','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes',
            '-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',
            '-R','127.0.0.1:17334:127.0.0.1:7334',$hostName)
        RedirectStandardError=(Join-Path $state 'cn-tunnel-error.log')
        RedirectStandardOutput=(Join-Path $state 'cn-tunnel-output.log')
    }
    $tunnel=Start-Process @startup
    Start-Sleep -Seconds 2
    if($tunnel.HasExited) { throw (Get-Content (Join-Path $state 'cn-tunnel-error.log') -Raw) }
}
@{pid=$tunnel.Id;startTicks=$tunnel.StartTime.ToUniversalTime().Ticks.ToString()} |
    ConvertTo-Json | Set-Content -LiteralPath $tunnelPath -Encoding utf8
$remoteConfig=@{url='http://127.0.0.1:17334';bridge_url='ws://192.168.3.150:8765';token=$control.token}|ConvertTo-Json -Compress
$remoteConfig | & ssh -o ConnectTimeout=8 -o BatchMode=yes $hostName 'umask 077; mkdir -p /home/sunrise/luka_data/recordings/contract_demo; cat > /home/sunrise/luka_data/recordings/contract_demo/foxglove_client.json'
if($LASTEXITCODE -ne 0){throw "Remote visualization configuration failed"}
$headers=@{Authorization="Bearer $($control.token)"}
$body=@{url='ws://192.168.3.150:8765'}|ConvertTo-Json
$null=Invoke-RestMethod -Uri "$($control.url)/connect" -Method Post -ContentType 'application/json' -Headers $headers -Body $body
& ssh -o ConnectTimeout=8 -o BatchMode=yes $hostName "python3 /home/sunrise/luka_ws/src/examples/contract_demo/_shared/foxglove_client.py --item $number"
if($LASTEXITCODE -ne 0){throw "Layout selection failed"}
Write-Host "CN Foxglove linked to Luka. Item $number; no motion request sent by setup."
if($Run) {
    $runnerArgs = "--item $number"
    if ($WithEkf) { $runnerArgs += ' --with-ekf' }
    if ($MapYaml) { $runnerArgs += " --map-yaml $MapYaml" }
    # Preserve the user's interactive terminal for protected keyboard teleop.
    & ssh -o ConnectTimeout=8 -tt $hostName "bash -c 'source /home/sunrise/luka_ws/src/system/environment.bash; exec python3 /home/sunrise/luka_ws/src/examples/contract_demo/_shared/runner.py $runnerArgs'"
    if($LASTEXITCODE -ne 0){throw "Demo exited with status $LASTEXITCODE"}
}
