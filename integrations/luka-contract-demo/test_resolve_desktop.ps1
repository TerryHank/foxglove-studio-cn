#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'resolve_desktop.ps1')
$expected = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\foxglove-studio-cn-desktop\Foxglove-Studio-CN.exe'
if ((Find-CNDesktopExecutable) -ne $expected) { throw 'Installed executable discovery failed' }
# Reproduce the reported empty-registry condition without changing the registry.
function Get-ItemProperty { param($Path, $ErrorAction) return @() }
if ((Find-CNDesktopExecutable) -ne $expected) { throw 'Empty-registry fallback failed' }
Remove-Item Function:\Get-ItemProperty
Write-Output 'PASS: installed executable discovery and empty-registry fallback'
