$ErrorActionPreference = 'Stop'

$packageArgs = @{
    packageName    = 'amverge'
    fileType       = 'EXE'
    url64bit       = 'https://github.com/AMVerge-team/AMVerge/releases/download/v2.0.5/AMVerge_2.0.5_x64-setup.exe'
    checksum64     = '0190f0e75dd7e2b2ef1b98fac7963764d7e2a48f86c13762b7f12af78494d816'
    checksumType64 = 'sha256'
    silentArgs     = '/S'
    softwareName   = 'AMVerge*'
    validExitCodes = @(0)
}

Install-ChocolateyPackage @packageArgs
