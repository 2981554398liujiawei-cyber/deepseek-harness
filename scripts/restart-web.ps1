# Restart the DSH web service on 3080 and wait until it is listening again.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\restart-web.ps1 [-TestRpc]
#   -TestRpc : after the listener is back, fire one promptEnhancer RPC and print the result.
param([switch]$TestRpc)

$ErrorActionPreference = 'Stop'
$deadline = (Get-Date).AddSeconds(60)

function Get-Listener([int]$port) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($c) {
    $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    return @{ Pid = $c.OwningProcess; StartTime = $p.StartTime }
  }
  return $null
}

$before = Get-Listener 3080
if ($before) {
  Write-Host "killing PID $($before.Pid) (started $($before.StartTime))"
  Stop-Process -Id $before.Pid -Force
} else {
  Write-Host "3080 not listening; nothing to kill"
}

# Poll for the auto-restarted listener (the harness relaunches the web service).
$info = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  $info = Get-Listener 3080
  if ($info) { break }
}
if (-not $info) { Write-Host "FAILED: 3080 did not come back within 60s"; exit 1 }
Write-Host "listening PID $($info.Pid) (started $($info.StartTime))"

if ($TestRpc) {
  Start-Sleep -Seconds 3
  $payload = @{
    type    = 'client-request'
    rpcId   = "restart-$([guid]::NewGuid().ToString('N').Substring(0, 6))"
    method  = 'promptEnhancer/enhance'
    payload = @{ args = @{ request = @{ originalText = '把下面的话改得更正式：今天天气不错' } } }
  } | ConvertTo-Json -Depth 8
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:3080/api/promptEnhancer/enhance' -Method POST -Headers @{ 'Content-Type' = 'application/json; charset=utf-8' } -Body $bytes -UseBasicParsing -TimeoutSec 120
    $sw.Stop()
    $utf8 = [Text.Encoding]::UTF8.GetString([Text.Encoding]::GetEncoding('ISO-8859-1').GetBytes($resp.Content))
    $j = $utf8 | ConvertFrom-Json
    if ($j.result.ok) {
      $v = $j.result.value
      Write-Host "RPC OK $([Math]::Round($sw.Elapsed.TotalSeconds, 1))s provider=$($v.provider) model=$($v.model) len=$($v.enhancedText.Length)"
      Write-Host "text: $($v.enhancedText.Substring(0, [Math]::Min(120, $v.enhancedText.Length)))"
    } else {
      Write-Host "RPC ERR $([Math]::Round($sw.Elapsed.TotalSeconds, 1))s: $($j.result.error.message)"
    }
  } catch {
    Write-Host "RPC EXC: $($_.Exception.Message)"
  }
}
