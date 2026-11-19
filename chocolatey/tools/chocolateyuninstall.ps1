$ErrorActionPreference = 'Stop'

$packageName  = 'amverge'
$softwareName = 'AMVerge*'

[array]$key = Get-UninstallRegistryKey -SoftwareName $softwareName

if ($key.Count -eq 1) {
    $file = $key[0].UninstallString -replace '"', ''
    if ($file) {
        Uninstall-ChocolateyPackage `
            -PackageName $packageName `
            -FileType 'EXE' `
            -SilentArgs '/S' `
            -ValidExitCodes @(0) `
            -File "$file"
    }
} elseif ($key.Count -eq 0) {
    Write-Warning "$packageName has already been uninstalled by other means."
} else {
    Write-Warning "$($key.Count) matches found for $softwareName. Skipping automatic uninstall to avoid removing the wrong application."
}
