#Requires -Version 5.1
function Find-CNDesktopExecutable {
    $candidates = @()
    $roots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($root in $roots) {
        $entries = Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like 'Foxglove-Studio-CN*' }
        foreach ($entry in $entries) {
            if ($entry.DisplayIcon) {
                $candidates += ($entry.DisplayIcon -replace ',\s*-?\d+$', '').Trim('"')
            }
            if ($entry.InstallLocation) {
                $candidates += Join-Path $entry.InstallLocation 'Foxglove-Studio-CN.exe'
            }
        }
    }
    $candidates += Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\foxglove-studio-cn-desktop\Foxglove-Studio-CN.exe'
    $candidates += Join-Path $PSScriptRoot '..\..\desktop-cn\dist\win-unpacked\Foxglove-Studio-CN.exe'
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return [IO.Path]::GetFullPath($candidate)
        }
    }
    throw 'Cannot find Foxglove Studio CN in installation records, the standard user directory, or this repository build.'
}
